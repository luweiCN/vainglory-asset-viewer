#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultBinaryPath = "extracted/ios_raw/Payload/GameKindred.app/GameKindred";
const defaultPfxManifestPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultNativeParticleRuntimeSchemaPath = "extracted/viewer/native-particle-runtime-schema.json";
const defaultViewerOut = "extracted/viewer/native-particle-callback-table-scan.json";
const defaultTsvOut = "extracted/reports/native_particle_callback_table_scan.tsv";
const defaultJsonOut = "extracted/reports/native_particle_callback_table_scan_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  return `0x${Number(value).toString(16)}`;
}

function roundRatio(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function cString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.toString("utf8", offset, end);
}

function parseElf64Sections(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "\x7fELF") throw new Error("not an ELF file");
  if (buffer[4] !== 2 || buffer[5] !== 1) throw new Error("only little-endian ELF64 is supported");
  const sectionHeaderOffset = Number(buffer.readBigUInt64LE(0x28));
  const sectionHeaderSize = buffer.readUInt16LE(0x3a);
  const sectionCount = buffer.readUInt16LE(0x3c);
  const sectionNameIndex = buffer.readUInt16LE(0x3e);
  const stringTableHeader = sectionHeaderOffset + sectionNameIndex * sectionHeaderSize;
  const stringTableOffset = Number(buffer.readBigUInt64LE(stringTableHeader + 0x18));
  const stringTableSize = Number(buffer.readBigUInt64LE(stringTableHeader + 0x20));
  const stringTable = buffer.subarray(stringTableOffset, stringTableOffset + stringTableSize);
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionHeaderOffset + index * sectionHeaderSize;
    const nameOffset = buffer.readUInt32LE(offset);
    sections.push({
      index,
      name: cString(stringTable, nameOffset),
      type: buffer.readUInt32LE(offset + 4),
      flags: Number(buffer.readBigUInt64LE(offset + 8)),
      addr: Number(buffer.readBigUInt64LE(offset + 0x10)),
      off: Number(buffer.readBigUInt64LE(offset + 0x18)),
      size: Number(buffer.readBigUInt64LE(offset + 0x20)),
      binaryFormat: "elf64",
      isExecutable: (Number(buffer.readBigUInt64LE(offset + 8)) & 0x4) !== 0,
    });
  }
  return sections;
}

function fixedString(buffer, offset, length) {
  return cString(buffer, offset).slice(0, length);
}

function machoArchitectureName(cpuType) {
  if (cpuType === 0x0100000c) return "arm64";
  if (cpuType === 0x0000000c) return "armv7";
  return `cpu-${hex(cpuType)}`;
}

function parseMachO64Sections(buffer, { sliceOffset = 0, binaryFormat = "mach-o", architecture = "" } = {}) {
  if (buffer.readUInt32LE(sliceOffset) !== 0xfeedfacf) throw new Error("only little-endian Mach-O 64 is supported");
  const cpuType = buffer.readUInt32LE(sliceOffset + 4);
  const ncmds = buffer.readUInt32LE(sliceOffset + 16);
  let commandOffset = sliceOffset + 32;
  const sections = [];
  for (let commandIndex = 0; commandIndex < ncmds; commandIndex += 1) {
    if (commandOffset + 8 > buffer.length) break;
    const command = buffer.readUInt32LE(commandOffset);
    const commandSize = buffer.readUInt32LE(commandOffset + 4);
    if (commandSize < 8 || commandOffset + commandSize > buffer.length) break;
    if (command === 0x19) {
      const segmentName = fixedString(buffer, commandOffset + 8, 16);
      const sectionCount = buffer.readUInt32LE(commandOffset + 64);
      let sectionOffset = commandOffset + 72;
      for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
        if (sectionOffset + 80 > commandOffset + commandSize) break;
        const sectionName = fixedString(buffer, sectionOffset, 16);
        const sectionSegmentName = fixedString(buffer, sectionOffset + 16, 16) || segmentName;
        const flags = buffer.readUInt32LE(sectionOffset + 64);
        const name = `${sectionSegmentName},${sectionName}`;
        sections.push({
          index: sections.length,
          name,
          segment: sectionSegmentName,
          section: sectionName,
          flags,
          addr: Number(buffer.readBigUInt64LE(sectionOffset + 32)),
          off: sliceOffset + buffer.readUInt32LE(sectionOffset + 48),
          size: Number(buffer.readBigUInt64LE(sectionOffset + 40)),
          binaryFormat,
          architecture: architecture || machoArchitectureName(cpuType),
          isExecutable:
            sectionSegmentName === "__TEXT" &&
            (sectionName === "__text" || (flags & 0x80000400) !== 0),
          isCallbackTableCandidate:
            ["__DATA", "__DATA_CONST", "__CONST"].includes(sectionSegmentName) &&
            ["__const", "__data"].includes(sectionName),
        });
        sectionOffset += 80;
      }
    }
    commandOffset += commandSize;
  }
  return sections;
}

function parseFatMachOSections(buffer) {
  const magic = buffer.readUInt32BE(0);
  if (magic !== 0xcafebabe && magic !== 0xcafebabf) throw new Error("not a fat Mach-O file");
  const architectureCount = buffer.readUInt32BE(4);
  const slices = [];
  const isFat64 = magic === 0xcafebabf;
  const archSize = isFat64 ? 32 : 20;
  for (let index = 0; index < architectureCount; index += 1) {
    const offset = 8 + index * archSize;
    const cpuType = buffer.readUInt32BE(offset);
    const sliceOffset = isFat64 ? Number(buffer.readBigUInt64BE(offset + 8)) : buffer.readUInt32BE(offset + 8);
    const sliceSize = isFat64 ? Number(buffer.readBigUInt64BE(offset + 16)) : buffer.readUInt32BE(offset + 12);
    if (!Number.isFinite(sliceOffset) || sliceOffset < 0 || sliceOffset + 4 > buffer.length) continue;
    slices.push({ cpuType, sliceOffset, sliceSize, architecture: machoArchitectureName(cpuType) });
  }
  const selectedSlice =
    slices.find((slice) => slice.cpuType === 0x0100000c && buffer.readUInt32LE(slice.sliceOffset) === 0xfeedfacf) ||
    slices.find((slice) => buffer.readUInt32LE(slice.sliceOffset) === 0xfeedfacf);
  if (!selectedSlice) throw new Error("fat Mach-O has no little-endian arm64 slice");
  return parseMachO64Sections(buffer, {
    sliceOffset: selectedSlice.sliceOffset,
    binaryFormat: "mach-o-fat",
    architecture: selectedSlice.architecture,
  });
}

function parseBinarySections(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error("binary buffer is empty");
  if (buffer.toString("latin1", 0, 4) === "\x7fELF") return parseElf64Sections(buffer);
  if (buffer.readUInt32BE(0) === 0xcafebabe || buffer.readUInt32BE(0) === 0xcafebabf) return parseFatMachOSections(buffer);
  if (buffer.readUInt32LE(0) === 0xfeedfacf) return parseMachO64Sections(buffer);
  throw new Error("unsupported binary format");
}

function collectPfxResolverCandidateKeys(pfxManifest = {}) {
  const keys = new Set();
  const items = Array.isArray(pfxManifest) ? pfxManifest : pfxManifest.items || [];
  const collectSlot = (slot = {}) => {
    if (slot.resolverInputKind && slot.resolverInputKind !== "candidate-key") return;
    if (!slot.resolverInputKind && !slot.resolverFunction) return;
    const value = String(slot.resolverInputValue || slot.resolverKey || "");
    if (!/^0x[0-9a-f]+$/i.test(value)) return;
    keys.add(BigInt(value));
  };
  for (const item of items) {
    for (const record of item.surfaceRecords || []) {
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        collectSlot(slot);
      }
      for (const childRecord of record.childEmitterRecords || []) {
        for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
          collectSlot(slot);
        }
      }
    }
  }
  return keys;
}

function referenceEntryCountFromSchema(nativeParticleRuntimeSchema = {}) {
  const resolver = (nativeParticleRuntimeSchema.items || []).find(
    (item) => item.recordKind === "particle-callback-resolver" && item.entryCount,
  );
  if (!resolver) return null;
  const count = Number.parseInt(String(resolver.entryCount), 16);
  return Number.isFinite(count) ? count : null;
}

function scanCallbackResolverTableCandidates(buffer, options = {}) {
  const sections = options.sections || parseBinarySections(buffer);
  const candidateKeys = options.candidateKeys || new Set();
  const minRunLength = Number.isInteger(options.minRunLength) ? options.minRunLength : 256;
  const executableSections = sections.filter(
    (section) => section.isExecutable || section.name === ".text" || (section.flags & 0x4) !== 0,
  );
  const scanSections = sections.filter(
    (section) =>
      section.isCallbackTableCandidate ||
      [".data.rel.ro", ".rodata", ".data"].includes(section.name) ||
      /^__(?:DATA|DATA_CONST|CONST),__(?:const|data)$/.test(section.name),
  );
  const candidates = [];

  const pointerLooksExecutable = (value) =>
    executableSections.some((section) => value >= section.addr && value < section.addr + section.size);

  for (const section of scanSections) {
    for (let phase = 0; phase < 16; phase += 1) {
      let runStart = null;
      let runLength = 0;
      let hitCount = 0;
      let firstKey = null;
      let lastKey = null;
      let firstCallback = null;
      let lastCallback = null;
      let previousKey = null;
      let matchedEntries = [];

      const flush = () => {
        if (runLength < minRunLength || runStart === null) return;
        candidates.push({
          section: section.name,
          fileOffset: runStart,
          virtualAddress: section.addr + (runStart - section.off),
          entryStride: 16,
          keyOffset: 0,
          callbackOffset: 8,
          entryCount: runLength,
          byteLength: runLength * 16,
          textPointerRows: runLength,
          pfxCandidateKeyMatches: hitCount,
          pfxCandidateKeyCount: candidateKeys.size,
          pfxKeyHitRatio: candidateKeys.size ? roundRatio(hitCount / candidateKeys.size) : 0,
          firstKey: hex(firstKey),
          lastKey: hex(lastKey),
          firstCallback: hex(firstCallback),
          lastCallback: hex(lastCallback),
          ...(matchedEntries.length ? { matchedEntries } : {}),
        });
      };

      for (let offset = section.off + phase; offset + 16 <= section.off + section.size; offset += 16) {
        const key = buffer.readBigUInt64LE(offset);
        const callback = Number(buffer.readBigUInt64LE(offset + 8));
        const inRun = key > 0n && (previousKey === null || key > previousKey) && pointerLooksExecutable(callback);
        if (inRun) {
          if (runStart === null) {
            runStart = offset;
            runLength = 0;
            hitCount = 0;
            firstKey = key;
            firstCallback = callback;
          }
          runLength += 1;
          if (candidateKeys.has(key)) {
            hitCount += 1;
            matchedEntries.push({ entryIndex: runLength - 1, key: hex(key), callback: hex(callback) });
          }
          lastKey = key;
          lastCallback = callback;
          previousKey = key;
        } else {
          flush();
          runStart = null;
          runLength = 0;
          hitCount = 0;
          firstKey = null;
          lastKey = null;
          firstCallback = null;
          lastCallback = null;
          previousKey = null;
          matchedEntries = [];
        }
      }
      flush();
    }
  }

  candidates.sort(
    (left, right) =>
      right.entryCount - left.entryCount ||
      right.pfxCandidateKeyMatches - left.pfxCandidateKeyMatches ||
      left.virtualAddress - right.virtualAddress,
  );
  return candidates;
}

function summarizeCallbackResolverTableCandidates(candidates = [], options = {}) {
  const best = candidates[0] || {};
  const referenceEntryCount = Number.isInteger(options.referenceEntryCount) ? options.referenceEntryCount : null;
  const pfxCandidateKeyMisses = Number.isInteger(options.pfxCandidateKeyMisses) ? options.pfxCandidateKeyMisses : 0;
  const pfxCandidateKeyCount = Number.isInteger(options.pfxCandidateKeyCount) ? options.pfxCandidateKeyCount : 0;
  return {
    candidates: candidates.length,
    bestEntryCount: best.entryCount || 0,
    bestPfxCandidateKeyMatches: best.pfxCandidateKeyMatches || 0,
    bestPfxKeyHitRatio: best.pfxKeyHitRatio || 0,
    pfxCandidateKeyMisses,
    pfxCandidateKeyMissRatio: pfxCandidateKeyCount ? roundRatio(pfxCandidateKeyMisses / pfxCandidateKeyCount) : 0,
    referenceEntryCount,
    bestEntryCountDeltaFromReference:
      Number.isInteger(referenceEntryCount) && Number.isInteger(best.entryCount) ? best.entryCount - referenceEntryCount : null,
  };
}

function buildNativeParticleCallbackTableScanManifest({
  binaryBuffer,
  binaryPath = "",
  pfxManifest = {},
  nativeParticleRuntimeSchema = {},
  generatedAt = new Date().toISOString(),
  minRunLength,
  sections,
} = {}) {
  const buffer = binaryBuffer || fs.readFileSync(binaryPath);
  const candidateKeys = collectPfxResolverCandidateKeys(pfxManifest);
  const parsedSections = sections || parseBinarySections(buffer);
  const referenceEntryCount = referenceEntryCountFromSchema(nativeParticleRuntimeSchema);
  const items = scanCallbackResolverTableCandidates(buffer, { sections: parsedSections, candidateKeys, minRunLength });
  const matchedCandidateKeys = new Set(
    items.flatMap((item) => (item.matchedEntries || []).map((entry) => String(entry.key || "").toLowerCase())).filter(Boolean),
  );
  const candidateKeyMisses = [...candidateKeys]
    .map((key) => hex(key))
    .filter((key) => !matchedCandidateKeys.has(key.toLowerCase()))
    .sort((left, right) => {
      const leftValue = BigInt(left);
      const rightValue = BigInt(right);
      return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    });
  return {
    generatedAt,
    source: { binaryPath },
    summary: summarizeCallbackResolverTableCandidates(items, {
      referenceEntryCount,
      pfxCandidateKeyCount: candidateKeys.size,
      pfxCandidateKeyMisses: candidateKeyMisses.length,
    }),
    ...(candidateKeyMisses.length ? { candidateKeyMisses } : {}),
    items,
  };
}

function reportRowsForManifest(manifest) {
  const referenceEntryCount = manifest.summary?.referenceEntryCount;
  return (manifest.items || []).map((item) => ({
    section: item.section,
    fileOffset: hex(item.fileOffset),
    virtualAddress: hex(item.virtualAddress),
    entryCount: item.entryCount,
    byteLength: item.byteLength,
    pfxCandidateKeyMatches: item.pfxCandidateKeyMatches,
    pfxCandidateKeyCount: item.pfxCandidateKeyCount,
    pfxKeyHitRatio: item.pfxKeyHitRatio,
    referenceEntryCount,
    entryCountDeltaFromReference:
      Number.isInteger(referenceEntryCount) && Number.isInteger(item.entryCount) ? item.entryCount - referenceEntryCount : null,
    firstKey: item.firstKey,
    lastKey: item.lastKey,
    firstCallback: item.firstCallback,
    lastCallback: item.lastCallback,
  }));
}

function exportNativeParticleCallbackTableScan({
  binaryPath = defaultBinaryPath,
  pfxManifestPath = defaultPfxManifestPath,
  nativeParticleRuntimeSchemaPath = defaultNativeParticleRuntimeSchemaPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const pfxManifest = fs.existsSync(pfxManifestPath) ? JSON.parse(fs.readFileSync(pfxManifestPath, "utf8")) : { items: [] };
  const nativeParticleRuntimeSchema = fs.existsSync(nativeParticleRuntimeSchemaPath)
    ? JSON.parse(fs.readFileSync(nativeParticleRuntimeSchemaPath, "utf8"))
    : { items: [] };
  const manifest = buildNativeParticleCallbackTableScanManifest({
    binaryPath,
    pfxManifest,
    nativeParticleRuntimeSchema,
  });
  manifest.source = { binaryPath, pfxManifestPath, nativeParticleRuntimeSchemaPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "section",
    "fileOffset",
    "virtualAddress",
    "entryCount",
    "byteLength",
    "pfxCandidateKeyMatches",
    "pfxCandidateKeyCount",
    "pfxKeyHitRatio",
    "referenceEntryCount",
    "entryCountDeltaFromReference",
    "firstKey",
    "lastKey",
    "firstCallback",
    "lastCallback",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeParticleCallbackTableScan({
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    pfxManifestPath: optionValue(args, "--pfx", defaultPfxManifestPath),
    nativeParticleRuntimeSchemaPath: optionValue(args, "--native-particle-runtime-schema", defaultNativeParticleRuntimeSchemaPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeParticleCallbackTableScanManifest,
  collectPfxResolverCandidateKeys,
  exportNativeParticleCallbackTableScan,
  parseBinarySections,
  parseElf64Sections,
  parseFatMachOSections,
  parseMachO64Sections,
  referenceEntryCountFromSchema,
  reportRowsForManifest,
  scanCallbackResolverTableCandidates,
  summarizeCallbackResolverTableCandidates,
};
