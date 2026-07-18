#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-light-probe-chain-audit.json";
const defaultJsonOut = "extracted/reports/current_native_light_probe_chain_audit.json";
const defaultTsvOut = "extracted/reports/current_native_light_probe_chain_audit.tsv";

const defaultFunctionTargets = [
  { name: "type-registry-common", virtualAddress: 0x189021c },
  { name: "levelvisuals-field-table-init", virtualAddress: 0x7cebe0 },
  { name: "levelvisuals-register", virtualAddress: 0x7ced14 },
  { name: "lightplacement-register", virtualAddress: 0x7f75f0 },
  { name: "char-star-register", virtualAddress: 0x7f7b78 },
  { name: "levelvisuals-runtime-constructor", virtualAddress: 0x8cbe40 },
  { name: "levelvisuals-runtime-destructor", virtualAddress: 0x8cbe98 },
  { name: "level-runtime-visuals-module-register", virtualAddress: 0x8cbedc },
  { name: "level-runtime-visuals-loader", virtualAddress: 0x8cbf40 },
  { name: "level-runtime-tail-loader-thunk", virtualAddress: 0x8cc63c },
  { name: "levelvisuals-runtime-apply-processor", virtualAddress: 0x8cc27c },
  { name: "tok-raw-parser", virtualAddress: 0x188fda8 },
  { name: "tok-atom-parser", virtualAddress: 0x188fc18 },
  { name: "menu-mesh-light-probe-owner-vtable-neighbor", virtualAddress: 0x9f7e94 },
  { name: "menu-mesh-light-probe-writer", virtualAddress: 0x9f9f90 },
  { name: "scene-omnilight-probe-writer-a", virtualAddress: 0xe3715c },
  { name: "scene-omnilight-probe-writer-b", virtualAddress: 0xe37470 },
  { name: "scene-probe-service-global-init", virtualAddress: 0xe36d30 },
  { name: "scene-probe-service-global-destroy", virtualAddress: 0xe36d94 },
  { name: "scene-probe-service-entry-default-upload", virtualAddress: 0xe36dcc },
  { name: "scene-probe-service-entry-resource-a", virtualAddress: 0xe36dd8 },
  { name: "scene-probe-service-entry-resource-b", virtualAddress: 0xe36dec },
  { name: "scene-probe-service-entry-resource-c", virtualAddress: 0xe36e00 },
  { name: "scene-probe-service-entry-light-upload", virtualAddress: 0xe36e80 },
  { name: "scene-probe-service-entry-position-sample-upload", virtualAddress: 0xe36efc },
  { name: "scene-probe-service-entry-profile-payload-load", virtualAddress: 0xe36f38 },
  { name: "scene-probe-service-entry-getter", virtualAddress: 0xe36f54 },
  { name: "scene-probe-service-manager-constructor", virtualAddress: 0xe36f60 },
  { name: "scene-probe-service-manager-destructor", virtualAddress: 0xe36f9c },
  { name: "scene-probe-service-wrapper-constructor", virtualAddress: 0xe37144 },
  { name: "scene-probe-service-inner-constructor", virtualAddress: 0xe38828 },
  { name: "scene-probe-inner-position-sample-entry", virtualAddress: 0xe38cb4 },
  { name: "scene-probe-lightfield-position-sampler", virtualAddress: 0xe38ea8 },
  { name: "scene-probe-inner-profile-payload-entry", virtualAddress: 0xe38cbc },
  { name: "scene-probe-lightfield-profile-parser", virtualAddress: 0xe390a4 },
  { name: "scene-probe-inner-reset-entry", virtualAddress: 0xe38cc4 },
  { name: "scene-probe-lightfield-reset-state", virtualAddress: 0xe38da8 },
  { name: "scene-probe-position-sample-uploader-a", virtualAddress: 0x1891c84 },
  { name: "scene-probe-position-sample-uploader-b", virtualAddress: 0x18934c0 },
  { name: "semantic-vec3-writer", virtualAddress: 0x18a0c4c },
  { name: "semantic-vec4-writer", virtualAddress: 0x18a099c },
  { name: "semantic-index-lookup", virtualAddress: 0x18a07e4 },
];

const defaultDataTargets = [
  { name: "scene-probe-wrapper-vtable-base", virtualAddress: 0x272f068 },
  { name: "scene-probe-writer-vtable-base", virtualAddress: 0x272f088 },
  { name: "scene-probe-writer-vtable-slot-a", virtualAddress: 0x272f0b0 },
  { name: "scene-probe-writer-vtable-slot-b", virtualAddress: 0x272f0b8 },
  { name: "scene-probe-inner-vtable-base", virtualAddress: 0x272f210 },
  { name: "scene-probe-inner-vtable-primary", virtualAddress: 0x272f220 },
  { name: "scene-probe-inner-vtable-position-sample-slot", virtualAddress: 0x272f258 },
  { name: "scene-probe-inner-vtable-profile-payload-slot", virtualAddress: 0x272f260 },
  { name: "scene-probe-inner-vtable-reset-slot", virtualAddress: 0x272f268 },
  { name: "light-placement-like-vtable-base", virtualAddress: 0x272f0c0 },
  { name: "light-value-like-vtable-base", virtualAddress: 0x272f108 },
  { name: "scene-probe-service-global-slot", virtualAddress: 0x3118068 },
  { name: "current-levelvisuals-type-object", virtualAddress: 0x30481b0 },
  { name: "current-levelvisuals-field-table-start", virtualAddress: 0x3050da0 },
  { name: "current-levelvisuals-field-table-end", virtualAddress: 0x3050e68 },
  { name: "current-lightplacement-starstar-type-object", virtualAddress: 0x311a700 },
  { name: "current-char-star-type-object", virtualAddress: 0x311ad70 },
  { name: "current-position-sample-uploader-vtable-a", virtualAddress: 0x2ab51d0 },
  { name: "current-position-sample-uploader-vtable-b", virtualAddress: 0x2ab5278 },
  { name: "current-levelvisuals-runtime-vtable-base", virtualAddress: 0x26c8a40 },
  { name: "current-levelvisuals-runtime-vtable-primary", virtualAddress: 0x26c8a50 },
  { name: "current-level-runtime-visuals-loader-slot", virtualAddress: 0x26c8a70 },
  { name: "current-level-runtime-tail-loader-slot", virtualAddress: 0x26c8aa8 },
];

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

function littleEndianU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
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

function fileOffsetForVirtualAddress(loads, virtualAddress, size = 1) {
  for (const segment of loads) {
    const start = segment.virtualAddress;
    const end = segment.virtualAddress + segment.fileSize;
    if (virtualAddress >= start && virtualAddress + size <= end) {
      return segment.fileOffset + (virtualAddress - start);
    }
  }
  return -1;
}

function sectionForVirtualAddress(sections, virtualAddress) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function sectionForFileOffset(sections, fileOffset) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return fileOffset >= section.fileOffset && fileOffset < section.fileOffset + section.size;
    }) || null
  );
}

function readCStringAtVirtualAddress(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf.loads, virtualAddress);
  if (fileOffset < 0) return "";
  const section = sectionForVirtualAddress(elf.sections, virtualAddress);
  if (section?.name !== ".rodata") return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.subarray(fileOffset, end).toString("utf8");
  return /^[\x20-\x7e]+$/.test(value) ? value.slice(0, 140) : "";
}

function findU64References(buffer, elf, value) {
  const needle = littleEndianU64(value);
  const references = [];
  let fileOffset = buffer.indexOf(needle);
  while (fileOffset >= 0) {
    const virtualAddress = virtualAddressForFileOffset(elf.loads, fileOffset);
    const section = sectionForFileOffset(elf.sections, fileOffset);
    references.push({
      fileOffset,
      virtualAddress,
      fileOffsetHex: hex(fileOffset),
      virtualAddressHex: hex(virtualAddress),
      section: section?.name || "",
    });
    fileOffset = buffer.indexOf(needle, fileOffset + 1);
  }
  return references;
}

function findDirectBranchCallers(buffer, elf, targetAddress) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) return [];
  const callers = [];
  const start = text.fileOffset;
  const end = text.fileOffset + text.size;
  for (let offset = start; offset + 4 <= end; offset += 4) {
    const pc = text.virtualAddress + (offset - text.fileOffset);
    const instruction = buffer.readUInt32LE(offset);
    const opcode = (instruction & 0xfc000000) >>> 0;
    const mode = opcode === 0x94000000 ? "bl" : opcode === 0x14000000 ? "b-tail" : "";
    if (!mode) continue;
    const target = pc + signExtend(instruction & 0x03ffffff, 26) * 4;
    if (target !== targetAddress) continue;
    callers.push({
      callerAddress: pc,
      callerAddressHex: hex(pc),
      mode,
      instructionHex: instruction.toString(16).padStart(8, "0"),
    });
  }
  return callers;
}

function classifyPointerValue(buffer, elf, value) {
  if (value === 0) {
    return {
      value,
      valueHex: hex(value),
      section: "",
      kind: "null",
      preview: "",
    };
  }
  const section = sectionForVirtualAddress(elf.sections, value);
  if (!section) {
    return {
      value,
      valueHex: hex(value),
      section: "",
      kind: "immediate-or-unmapped",
      preview: "",
    };
  }
  if (section.name === ".text") {
    return {
      value,
      valueHex: hex(value),
      section: section.name,
      kind: "code-pointer",
      preview: "",
    };
  }
  const stringValue = readCStringAtVirtualAddress(buffer, elf, value);
  return {
    value,
    valueHex: hex(value),
    section: section.name,
    kind: stringValue ? "string-pointer" : "data-pointer",
    preview: stringValue,
  };
}

function dumpPointerNeighborhood(buffer, elf, centerVirtualAddress, beforeBytes = 0x40, afterBytes = 0x80) {
  const start = Math.max(0, centerVirtualAddress - beforeBytes);
  const end = centerVirtualAddress + afterBytes;
  const rows = [];
  for (let address = start; address + 8 <= end; address += 8) {
    const fileOffset = fileOffsetForVirtualAddress(elf.loads, address, 8);
    if (fileOffset < 0) continue;
    const value = Number(buffer.readBigUInt64LE(fileOffset));
    rows.push({
      slotAddress: address,
      slotAddressHex: hex(address),
      relativeOffset: address - centerVirtualAddress,
      relativeOffsetHex: hex(address - centerVirtualAddress),
      ...classifyPointerValue(buffer, elf, value),
    });
  }
  return rows;
}

function targetRecord(buffer, elf, target) {
  const directCallers = findDirectBranchCallers(buffer, elf, target.virtualAddress);
  const dataReferences = findU64References(buffer, elf, target.virtualAddress);
  const textAddressReferences = scanTextReferences(buffer, elf, [
    {
      name: target.name,
      kind: "target-address",
      virtualAddress: target.virtualAddress,
      section: sectionForVirtualAddress(elf.sections, target.virtualAddress)?.name || "",
    },
  ]);
  const pointerNeighborhoods = dataReferences
    .filter((reference) => reference.section === ".data.rel.ro" || reference.section === ".data")
    .map((reference) => ({
      referenceAddress: reference.virtualAddress,
      referenceAddressHex: reference.virtualAddressHex,
      section: reference.section,
      entries: dumpPointerNeighborhood(buffer, elf, reference.virtualAddress),
    }));
  return {
    name: target.name,
    virtualAddress: target.virtualAddress,
    virtualAddressHex: hex(target.virtualAddress),
    section: sectionForVirtualAddress(elf.sections, target.virtualAddress)?.name || "",
    directCallers,
    dataReferences,
    textAddressReferences: textAddressReferences.map((reference) => ({
      xrefAddress: reference.xrefAddress,
      xrefAddressHex: hex(reference.xrefAddress),
      mode: reference.mode,
      baseAddressHex: hex(reference.baseAddress),
      baseInstructionHex: reference.baseInstructionHex,
      useInstructionHex: reference.useInstructionHex,
    })),
    pointerNeighborhoods,
  };
}

function summarize(records) {
  const byName = new Map(records.map((record) => [record.name, record]));
  const record = (name) => byName.get(name) || null;
  const directCallerCount = (name) => record(name)?.directCallers.length || 0;
  const dataReferenceCount = (name) => record(name)?.dataReferences.length || 0;
  const textAddressReferenceCount = (name) => record(name)?.textAddressReferences.length || 0;
  const hasDirectCaller = (name, callerAddressHex) =>
    Boolean(record(name)?.directCallers.some((caller) => caller.callerAddressHex === callerAddressHex));
  const levelVisualsLoaderRecovered =
    directCallerCount("level-runtime-visuals-loader") > 0 &&
    dataReferenceCount("current-level-runtime-visuals-loader-slot") > 0;
  const levelVisualsApplyProcessorRecovered =
    directCallerCount("levelvisuals-runtime-apply-processor") > 0 &&
    hasDirectCaller("scene-probe-service-entry-profile-payload-load", "0x8cc568");
  const sceneProbeProfilePayloadPathRecovered =
    hasDirectCaller("scene-probe-service-entry-profile-payload-load", "0x8cc568") &&
    dataReferenceCount("scene-probe-inner-vtable-profile-payload-slot") > 0 &&
    hasDirectCaller("scene-probe-lightfield-profile-parser", "0xe38cc0");
  const sceneProbePositionSamplePathRecovered =
    directCallerCount("scene-probe-service-entry-position-sample-upload") > 0 &&
    hasDirectCaller("scene-probe-lightfield-position-sampler", "0xe38cb8");
  const activeHeroPreviewProfileResolved = false;
  const activeProfilePayloadConcreteValueRecovered = false;
  return {
    targets: records.length,
    targetsWithDirectCallers: records.filter((record) => record.directCallers.length).length,
    directCallers: records.reduce((sum, record) => sum + record.directCallers.length, 0),
    targetsWithDataReferences: records.filter((record) => record.dataReferences.length).length,
    dataReferences: records.reduce((sum, record) => sum + record.dataReferences.length, 0),
    targetsWithTextAddressReferences: records.filter((record) => record.textAddressReferences.length).length,
    textAddressReferences: records.reduce((sum, record) => sum + record.textAddressReferences.length, 0),
    pointerNeighborhoods: records.reduce((sum, record) => sum + record.pointerNeighborhoods.length, 0),
    levelVisualsLoaderRecovered,
    levelVisualsApplyProcessorRecovered,
    sceneProbeProfilePayloadPathRecovered,
    sceneProbePositionSamplePathRecovered,
    activeProfilePayloadConcreteValueRecovered,
    activeHeroPreviewProfileResolved,
    rendererLightProbeTakeoverAllowed: false,
    profilePayloadPathStatus: sceneProbeProfilePayloadPathRecovered
      ? "profile-payload-entry-and-lightfield-parser-recovered-active-payload-unresolved"
      : "profile-payload-path-incomplete",
    activeProfileBlocker: activeHeroPreviewProfileResolved
      ? ""
      : "LevelVisuals profile payload path is recovered, but the concrete active hero/model preview LevelVisuals +0x50 payload and sample position are not recovered.",
    keyRuntimeRecords: {
      levelRuntimeVisualsLoaderDirectCallers: directCallerCount("level-runtime-visuals-loader"),
      levelVisualsApplyProcessorDirectCallers: directCallerCount("levelvisuals-runtime-apply-processor"),
      sceneProbeProfilePayloadLoadDirectCallers: directCallerCount("scene-probe-service-entry-profile-payload-load"),
      sceneProbeProfilePayloadSlotDataReferences: dataReferenceCount("scene-probe-inner-vtable-profile-payload-slot"),
      sceneProbeLightfieldProfileParserDirectCallers: directCallerCount("scene-probe-lightfield-profile-parser"),
      sceneProbePositionSampleUploadDirectCallers: directCallerCount("scene-probe-service-entry-position-sample-upload"),
      sceneProbeLightfieldPositionSamplerDirectCallers: directCallerCount("scene-probe-lightfield-position-sampler"),
      currentLevelVisualsFieldTableTextReferences:
        textAddressReferenceCount("current-levelvisuals-field-table-start") +
        textAddressReferenceCount("current-levelvisuals-field-table-end"),
    },
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.records || []).flatMap((record) => {
    const callerRows = record.directCallers.map((caller) => ({
      targetName: record.name,
      targetAddress: record.virtualAddressHex,
      relationship: `direct-${caller.mode}`,
      sourceAddress: caller.callerAddressHex,
      section: record.section,
      detail: caller.instructionHex,
    }));
    const dataRows = record.dataReferences.map((reference) => ({
      targetName: record.name,
      targetAddress: record.virtualAddressHex,
      relationship: "data-pointer",
      sourceAddress: reference.virtualAddressHex,
      section: reference.section,
      detail: reference.fileOffsetHex,
    }));
    const textRows = record.textAddressReferences.map((reference) => ({
      targetName: record.name,
      targetAddress: record.virtualAddressHex,
      relationship: `text-address-${reference.mode}`,
      sourceAddress: reference.xrefAddressHex,
      section: record.section,
      detail: `${reference.baseInstructionHex || ""}/${reference.useInstructionHex || ""}`,
    }));
    return [...callerRows, ...dataRows, ...textRows];
  });
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

function exportCurrentNativeLightProbeChainAudit({
  binaryPath = defaultBinary,
  functionTargets = defaultFunctionTargets,
  dataTargets = defaultDataTargets,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const targets = [...functionTargets, ...dataTargets];
  const records = targets.map((target) => targetRecord(buffer, elf, target));
  const manifest = {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current-binary call/data/vtable audit; relationships here identify local references but do not prove the active hero preview runtime path by themselves",
    summary: summarize(records),
    records,
  };
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "targetName",
    "targetAddress",
    "relationship",
    "sourceAddress",
    "section",
    "detail",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLightProbeChainAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultDataTargets,
  defaultFunctionTargets,
  exportCurrentNativeLightProbeChainAudit,
  findDirectBranchCallers,
  findU64References,
  summarize,
  targetRecord,
};
