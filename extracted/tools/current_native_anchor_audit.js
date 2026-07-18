#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-anchor-audit.json";
const defaultJsonOut = "extracted/reports/current_native_anchor_audit.json";
const defaultTsvOut = "extracted/reports/current_native_anchor_audit.tsv";

const defaultStringAnchors = [
  "LevelVisuals",
  "LightPlacement",
  "LightOmni",
  "StaticLensFlare",
  "TOK_RAW typeinfo=%s field=%s bytes=%d",
  "TOK_ATOM typeinfo=%s field=%s value=%s",
  "OmniLight.Position",
  "OmniLight.Color",
  "OmniLight.Attenuation",
  "Probe.Samples",
];

const pointerSlotSections = new Set([".data.rel.ro", ".data", ".got"]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.subarray(offset, end).toString("utf8");
}

function parseElf64(buffer) {
  if (buffer.subarray(0, 4).toString("binary") !== "\x7fELF") throw new Error("not an ELF file");
  if (buffer[4] !== 2 || buffer[5] !== 1) throw new Error("expected little-endian ELF64");

  const programHeaderOffset = Number(buffer.readBigUInt64LE(32));
  const sectionHeaderOffset = Number(buffer.readBigUInt64LE(40));
  const programHeaderEntrySize = buffer.readUInt16LE(54);
  const programHeaderCount = buffer.readUInt16LE(56);
  const sectionHeaderEntrySize = buffer.readUInt16LE(58);
  const sectionHeaderCount = buffer.readUInt16LE(60);
  const sectionNameIndex = buffer.readUInt16LE(62);

  const loads = [];
  for (let index = 0; index < programHeaderCount; index += 1) {
    const offset = programHeaderOffset + index * programHeaderEntrySize;
    const type = buffer.readUInt32LE(offset);
    if (type !== 1) continue;
    loads.push({
      fileOffset: Number(buffer.readBigUInt64LE(offset + 8)),
      virtualAddress: Number(buffer.readBigUInt64LE(offset + 16)),
      fileSize: Number(buffer.readBigUInt64LE(offset + 32)),
      memorySize: Number(buffer.readBigUInt64LE(offset + 40)),
      flags: buffer.readUInt32LE(offset + 4),
    });
  }

  const rawSections = [];
  for (let index = 0; index < sectionHeaderCount; index += 1) {
    const offset = sectionHeaderOffset + index * sectionHeaderEntrySize;
    rawSections.push({
      nameOffset: buffer.readUInt32LE(offset),
      type: buffer.readUInt32LE(offset + 4),
      flags: Number(buffer.readBigUInt64LE(offset + 8)),
      virtualAddress: Number(buffer.readBigUInt64LE(offset + 16)),
      fileOffset: Number(buffer.readBigUInt64LE(offset + 24)),
      size: Number(buffer.readBigUInt64LE(offset + 32)),
      entrySize: Number(buffer.readBigUInt64LE(offset + 56)),
    });
  }

  const sectionNames = rawSections[sectionNameIndex];
  const sections = rawSections.map((section) => ({
    ...section,
    name: sectionNames ? readCString(buffer, sectionNames.fileOffset + section.nameOffset) : "",
  }));

  return { loads, sections };
}

function virtualAddressForFileOffset(loads, fileOffset) {
  for (const segment of loads) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.fileSize;
    if (fileOffset >= start && fileOffset < end) {
      return segment.virtualAddress + (fileOffset - start);
    }
  }
  return -1;
}

function sectionForFileOffset(sections, fileOffset) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return fileOffset >= section.fileOffset && fileOffset < section.fileOffset + section.size;
    }) || null
  );
}

function findBufferOccurrences(buffer, needle, startOffset = 0) {
  const offsets = [];
  let offset = buffer.indexOf(needle, startOffset);
  while (offset >= 0) {
    offsets.push(offset);
    offset = buffer.indexOf(needle, offset + 1);
  }
  return offsets;
}

function littleEndianU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
}

function parseAdrp(insn, pc) {
  if (((insn & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (insn >>> 29) & 0x3;
  const immhi = (insn >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: insn & 0x1f,
    address: (pc & ~0xfff) + signed * 0x1000,
  };
}

function parseAdr(insn, pc) {
  if (((insn & 0x9f000000) >>> 0) !== 0x10000000) return null;
  const immlo = (insn >>> 29) & 0x3;
  const immhi = (insn >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: insn & 0x1f,
    address: pc + signed,
  };
}

function parseAddImmediate(insn) {
  if (((insn & 0xff000000) >>> 0) !== 0x91000000) return null;
  const shift = ((insn >>> 22) & 0x3) === 1 ? 12 : 0;
  return {
    destination: insn & 0x1f,
    source: (insn >>> 5) & 0x1f,
    immediate: ((insn >>> 10) & 0xfff) << shift,
  };
}

function parseLdrUnsignedImmediate(insn) {
  const scaled = [
    { mask: 0xffc00000, value: 0xf9400000, scale: 8, width: "x64" },
    { mask: 0xffc00000, value: 0xb9400000, scale: 4, width: "w32" },
  ].find((entry) => ((insn & entry.mask) >>> 0) === entry.value);
  if (!scaled) return null;
  return {
    destination: insn & 0x1f,
    source: (insn >>> 5) & 0x1f,
    immediate: ((insn >>> 10) & 0xfff) * scaled.scale,
    width: scaled.width,
  };
}

function parseLdrLiteral(insn, pc) {
  if (((insn & 0xff000000) >>> 0) !== 0x58000000) return null;
  const imm19 = (insn >>> 5) & 0x7ffff;
  return {
    register: insn & 0x1f,
    address: pc + signExtend(imm19, 19) * 4,
  };
}

function instructionHex(buffer, fileOffset) {
  return buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0");
}

function buildStringTargets(buffer, elf, stringAnchors) {
  const targets = [];
  for (const anchor of stringAnchors) {
    const offsets = findBufferOccurrences(buffer, Buffer.from(anchor, "utf8"));
    for (const fileOffset of offsets) {
      const virtualAddress = virtualAddressForFileOffset(elf.loads, fileOffset);
      const section = sectionForFileOffset(elf.sections, fileOffset);
      if (virtualAddress < 0) continue;
      targets.push({
        name: anchor,
        kind: "string",
        virtualAddress,
        fileOffset,
        section: section?.name || "",
      });
    }
  }
  return targets;
}

function buildPointerSlotTargets(buffer, elf, stringTargets) {
  const targets = [];
  const seen = new Set();
  for (const stringTarget of stringTargets) {
    const needle = littleEndianU64(stringTarget.virtualAddress);
    for (const fileOffset of findBufferOccurrences(buffer, needle)) {
      const section = sectionForFileOffset(elf.sections, fileOffset);
      if (!section || !pointerSlotSections.has(section.name)) continue;
      const virtualAddress = virtualAddressForFileOffset(elf.loads, fileOffset);
      if (virtualAddress < 0) continue;
      const key = `${virtualAddress}:${stringTarget.virtualAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        name: `ptr:${stringTarget.name}`,
        kind: "pointer-slot",
        virtualAddress,
        fileOffset,
        section: section.name,
        pointsToName: stringTarget.name,
        pointsToAddress: stringTarget.virtualAddress,
      });
    }
  }
  return targets;
}

function addReference(references, target, use) {
  references.push({
    targetName: target.name,
    targetKind: target.kind,
    targetAddress: target.virtualAddress,
    targetSection: target.section,
    pointsToName: target.pointsToName || "",
    pointsToAddress: target.pointsToAddress || null,
    xrefAddress: use.xrefAddress,
    mode: use.mode,
    baseAddress: use.baseAddress || null,
    baseInstructionHex: use.baseInstructionHex || "",
    useInstructionHex: use.useInstructionHex || "",
    baseRegister: use.baseRegister ?? null,
    useRegister: use.useRegister ?? null,
  });
}

function scanTextReferences(buffer, elf, targets) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("missing .text section");
  const targetsByAddress = new Map(targets.map((target) => [target.virtualAddress, target]));
  const references = [];
  const start = text.fileOffset;
  const end = text.fileOffset + text.size;

  for (let offset = start; offset + 4 <= end; offset += 4) {
    const pc = text.virtualAddress + (offset - text.fileOffset);
    const insn = buffer.readUInt32LE(offset);

    const adr = parseAdr(insn, pc);
    if (adr) {
      const target = targetsByAddress.get(adr.address);
      if (target) {
        addReference(references, target, {
          xrefAddress: pc,
          mode: "adr",
          useInstructionHex: instructionHex(buffer, offset),
          useRegister: adr.register,
        });
      }
    }

    const literal = parseLdrLiteral(insn, pc);
    if (literal) {
      const target = targetsByAddress.get(literal.address);
      if (target) {
        addReference(references, target, {
          xrefAddress: pc,
          mode: "ldr-literal",
          useInstructionHex: instructionHex(buffer, offset),
          useRegister: literal.register,
        });
      }
    }

    const adrp = parseAdrp(insn, pc);
    if (!adrp) continue;
    for (let lookahead = 1; lookahead <= 12; lookahead += 1) {
      const useOffset = offset + lookahead * 4;
      if (useOffset + 4 > end) break;
      const usePc = text.virtualAddress + (useOffset - text.fileOffset);
      const useInsn = buffer.readUInt32LE(useOffset);

      const add = parseAddImmediate(useInsn);
      if (add && add.source === adrp.register) {
        const address = adrp.address + add.immediate;
        const target = targetsByAddress.get(address);
        if (target) {
          addReference(references, target, {
            xrefAddress: usePc,
            mode: "adrp-add",
            baseAddress: pc,
            baseInstructionHex: instructionHex(buffer, offset),
            useInstructionHex: instructionHex(buffer, useOffset),
            baseRegister: adrp.register,
            useRegister: add.destination,
          });
        }
      }

      const ldr = parseLdrUnsignedImmediate(useInsn);
      if (ldr && ldr.source === adrp.register) {
        const address = adrp.address + ldr.immediate;
        const target = targetsByAddress.get(address);
        if (target) {
          addReference(references, target, {
            xrefAddress: usePc,
            mode: `adrp-ldr-${ldr.width}`,
            baseAddress: pc,
            baseInstructionHex: instructionHex(buffer, offset),
            useInstructionHex: instructionHex(buffer, useOffset),
            baseRegister: adrp.register,
            useRegister: ldr.destination,
          });
        }
      }

      const nextAdrp = parseAdrp(useInsn, usePc);
      if (nextAdrp && nextAdrp.register === adrp.register) break;
    }
  }

  return references;
}

function printablePreview(value) {
  const text = String(value || "");
  if (!text) return "";
  return /^[\x20-\x7e]+$/.test(text) ? text.slice(0, 120) : "";
}

function buildAnchorPages(stringTargets) {
  const pages = new Map();
  for (const target of stringTargets) {
    const pageAddress = target.virtualAddress & ~0xfff;
    const entry = pages.get(pageAddress) || {
      pageAddress,
      anchorNames: new Set(),
      anchors: [],
    };
    entry.anchorNames.add(target.name);
    entry.anchors.push(target);
    pages.set(pageAddress, entry);
  }
  return pages;
}

function readAddressString(buffer, elf, virtualAddress) {
  const fileOffset = virtualAddressForFileOffset(elf.loads, virtualAddress);
  if (fileOffset < 0 || fileOffset >= buffer.length) return "";
  const section = sectionForFileOffset(elf.sections, fileOffset);
  if (section?.name !== ".rodata") return "";
  return printablePreview(readCString(buffer, fileOffset));
}

function scanAnchorPageReferences(buffer, elf, stringTargets) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("missing .text section");
  const anchorPages = buildAnchorPages(stringTargets);
  const exactTargetAddresses = new Set(stringTargets.map((target) => target.virtualAddress));
  const references = [];
  const start = text.fileOffset;
  const end = text.fileOffset + text.size;

  function addPageReference(pageEntry, use) {
    references.push({
      pageAddress: pageEntry.pageAddress,
      anchorPageNames: [...pageEntry.anchorNames].sort().join("|"),
      resolvedAddress: use.resolvedAddress,
      resolvedString: readAddressString(buffer, elf, use.resolvedAddress),
      exactStringTarget: exactTargetAddresses.has(use.resolvedAddress),
      xrefAddress: use.xrefAddress,
      mode: use.mode,
      baseAddress: use.baseAddress || null,
      baseInstructionHex: use.baseInstructionHex || "",
      useInstructionHex: use.useInstructionHex || "",
      baseRegister: use.baseRegister ?? null,
      useRegister: use.useRegister ?? null,
    });
  }

  for (let offset = start; offset + 4 <= end; offset += 4) {
    const pc = text.virtualAddress + (offset - text.fileOffset);
    const insn = buffer.readUInt32LE(offset);

    const adr = parseAdr(insn, pc);
    if (adr) {
      const pageEntry = anchorPages.get(adr.address & ~0xfff);
      if (pageEntry) {
        addPageReference(pageEntry, {
          resolvedAddress: adr.address,
          xrefAddress: pc,
          mode: "adr-page",
          useInstructionHex: instructionHex(buffer, offset),
          useRegister: adr.register,
        });
      }
    }

    const literal = parseLdrLiteral(insn, pc);
    if (literal) {
      const pageEntry = anchorPages.get(literal.address & ~0xfff);
      if (pageEntry) {
        addPageReference(pageEntry, {
          resolvedAddress: literal.address,
          xrefAddress: pc,
          mode: "ldr-literal-page",
          useInstructionHex: instructionHex(buffer, offset),
          useRegister: literal.register,
        });
      }
    }

    const adrp = parseAdrp(insn, pc);
    if (!adrp) continue;
    const pageEntry = anchorPages.get(adrp.address);
    if (!pageEntry) continue;
    for (let lookahead = 1; lookahead <= 12; lookahead += 1) {
      const useOffset = offset + lookahead * 4;
      if (useOffset + 4 > end) break;
      const usePc = text.virtualAddress + (useOffset - text.fileOffset);
      const useInsn = buffer.readUInt32LE(useOffset);

      const add = parseAddImmediate(useInsn);
      if (add && add.source === adrp.register) {
        addPageReference(pageEntry, {
          resolvedAddress: adrp.address + add.immediate,
          xrefAddress: usePc,
          mode: "adrp-add-page",
          baseAddress: pc,
          baseInstructionHex: instructionHex(buffer, offset),
          useInstructionHex: instructionHex(buffer, useOffset),
          baseRegister: adrp.register,
          useRegister: add.destination,
        });
      }

      const ldr = parseLdrUnsignedImmediate(useInsn);
      if (ldr && ldr.source === adrp.register) {
        addPageReference(pageEntry, {
          resolvedAddress: adrp.address + ldr.immediate,
          xrefAddress: usePc,
          mode: `adrp-ldr-page-${ldr.width}`,
          baseAddress: pc,
          baseInstructionHex: instructionHex(buffer, offset),
          useInstructionHex: instructionHex(buffer, useOffset),
          baseRegister: adrp.register,
          useRegister: ldr.destination,
        });
      }

      const nextAdrp = parseAdrp(useInsn, usePc);
      if (nextAdrp && nextAdrp.register === adrp.register) break;
    }
  }

  return references;
}

function summarizeReferences(stringTargets, pointerSlotTargets, textReferences, pageReferences) {
  const referencesByTarget = {};
  const referencesByKind = {};
  const pageReferencesByAnchor = {};
  for (const reference of textReferences) {
    referencesByTarget[reference.targetName] = (referencesByTarget[reference.targetName] || 0) + 1;
    referencesByKind[reference.targetKind] = (referencesByKind[reference.targetKind] || 0) + 1;
  }
  for (const reference of pageReferences) {
    pageReferencesByAnchor[reference.anchorPageNames] =
      (pageReferencesByAnchor[reference.anchorPageNames] || 0) + 1;
  }
  return {
    stringTargets: stringTargets.length,
    pointerSlotTargets: pointerSlotTargets.length,
    textReferences: textReferences.length,
    anchorPageReferences: pageReferences.length,
    referencedTargets: Object.keys(referencesByTarget).length,
    referencesByTarget,
    referencesByKind,
    pageReferencesByAnchor,
  };
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

function exportCurrentNativeAnchorAudit({
  binaryPath = defaultBinary,
  stringAnchors = defaultStringAnchors,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const stringTargets = buildStringTargets(buffer, elf, stringAnchors);
  const pointerSlotTargets = buildPointerSlotTargets(buffer, elf, stringTargets);
  const allTargets = [...stringTargets, ...pointerSlotTargets];
  const textReferences = scanTextReferences(buffer, elf, allTargets);
  const anchorPageReferences = scanAnchorPageReferences(buffer, elf, stringTargets);
  const manifest = {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary anchor audit; it proves local references to strings/pointer slots but does not by itself prove runtime object semantics",
    summary: summarizeReferences(stringTargets, pointerSlotTargets, textReferences, anchorPageReferences),
    stringTargets: stringTargets.map((target) => ({
      ...target,
      virtualAddressHex: hex(target.virtualAddress),
      fileOffsetHex: hex(target.fileOffset),
    })),
    pointerSlotTargets: pointerSlotTargets.map((target) => ({
      ...target,
      virtualAddressHex: hex(target.virtualAddress),
      fileOffsetHex: hex(target.fileOffset),
      pointsToAddressHex: hex(target.pointsToAddress),
    })),
    textReferences: textReferences.map((reference) => ({
      ...reference,
      targetAddressHex: hex(reference.targetAddress),
      pointsToAddressHex: hex(reference.pointsToAddress),
      xrefAddressHex: hex(reference.xrefAddress),
      baseAddressHex: hex(reference.baseAddress),
    })),
    anchorPageReferences: anchorPageReferences.map((reference) => ({
      ...reference,
      pageAddressHex: hex(reference.pageAddress),
      resolvedAddressHex: hex(reference.resolvedAddress),
      xrefAddressHex: hex(reference.xrefAddress),
      baseAddressHex: hex(reference.baseAddress),
    })),
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    manifest.anchorPageReferences,
    [
      "pageAddressHex",
      "anchorPageNames",
      "resolvedAddressHex",
      "resolvedString",
      "exactStringTarget",
      "xrefAddressHex",
      "mode",
      "baseAddressHex",
      "baseInstructionHex",
      "useInstructionHex",
      "baseRegister",
      "useRegister",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeAnchorAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildPointerSlotTargets,
  buildStringTargets,
  defaultStringAnchors,
  exportCurrentNativeAnchorAudit,
  parseElf64,
  scanTextReferences,
  summarizeReferences,
};
