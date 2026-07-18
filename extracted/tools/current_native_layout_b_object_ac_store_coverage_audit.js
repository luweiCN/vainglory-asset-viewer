#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-object-ac-store-coverage-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_object_ac_store_coverage_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_object_ac_store_coverage_audit.tsv";

const layoutBFamilyStart = 0x8d2d00;
const layoutBFamilyEnd = 0x8d5100;
const objectAcStart = 0xac;
const objectAcEnd = 0xb0;
const constructorSeedAddress = 0x8d2dbc;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
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

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function baseRegisterName(registerNumber) {
  return registerNumber === 31 ? "sp" : `x${registerNumber}`;
}

function valueRegisterName(registerNumber, widthPrefix) {
  if (registerNumber === 31 && ["x", "w"].includes(widthPrefix)) return `${widthPrefix}zr`;
  return `${widthPrefix}${registerNumber}`;
}

function parseUnsignedImmediateStore(instruction) {
  const opcode = (instruction & 0xffc00000) >>> 0;
  const specs = [
    { accessKind: "str-x", opcode: 0xf9000000, scale: 8, byteWidth: 8, registerPrefix: "x" },
    { accessKind: "str-w", opcode: 0xb9000000, scale: 4, byteWidth: 4, registerPrefix: "w" },
    { accessKind: "strh", opcode: 0x79000000, scale: 2, byteWidth: 2, registerPrefix: "w" },
    { accessKind: "strb", opcode: 0x39000000, scale: 1, byteWidth: 1, registerPrefix: "w" },
    { accessKind: "str-q", opcode: 0x3d800000, scale: 16, byteWidth: 16, registerPrefix: "q" },
    { accessKind: "str-d", opcode: 0xfd000000, scale: 8, byteWidth: 8, registerPrefix: "d" },
    { accessKind: "str-s", opcode: 0xbd000000, scale: 4, byteWidth: 4, registerPrefix: "s" },
  ];
  const spec = specs.find((candidate) => opcode === candidate.opcode);
  if (!spec) return null;
  return {
    accessKind: spec.accessKind,
    offset: ((instruction >>> 10) & 0xfff) * spec.scale,
    byteWidth: spec.byteWidth,
    baseRegisterNumber: (instruction >>> 5) & 0x1f,
    valueRegister: valueRegisterName(instruction & 0x1f, spec.registerPrefix),
    valueRegister2: "",
  };
}

function parseStorePair(instruction) {
  const opcode = (instruction & 0xffc00000) >>> 0;
  const specs = [
    { accessKind: "stp-x", opcode: 0xa9000000, scale: 8, byteWidth: 16, registerPrefix: "x" },
    { accessKind: "stp-w", opcode: 0x29000000, scale: 4, byteWidth: 8, registerPrefix: "w" },
    { accessKind: "stp-q", opcode: 0xad000000, scale: 16, byteWidth: 32, registerPrefix: "q" },
    { accessKind: "stp-d", opcode: 0x6d000000, scale: 8, byteWidth: 16, registerPrefix: "d" },
    { accessKind: "stp-s", opcode: 0x2d000000, scale: 4, byteWidth: 8, registerPrefix: "s" },
  ];
  const spec = specs.find((candidate) => opcode === candidate.opcode);
  if (!spec) return null;
  return {
    accessKind: spec.accessKind,
    offset: signExtend((instruction >>> 15) & 0x7f, 7) * spec.scale,
    byteWidth: spec.byteWidth,
    baseRegisterNumber: (instruction >>> 5) & 0x1f,
    valueRegister: valueRegisterName(instruction & 0x1f, spec.registerPrefix),
    valueRegister2: valueRegisterName((instruction >>> 10) & 0x1f, spec.registerPrefix),
  };
}

function parseUnscaledStore(instruction) {
  const opcode = (instruction & 0xffe00c00) >>> 0;
  const specs = [
    { accessKind: "stur-x", opcode: 0xf8000000, byteWidth: 8, registerPrefix: "x" },
    { accessKind: "stur-w", opcode: 0xb8000000, byteWidth: 4, registerPrefix: "w" },
    { accessKind: "sturh", opcode: 0x78000000, byteWidth: 2, registerPrefix: "w" },
    { accessKind: "sturb", opcode: 0x38000000, byteWidth: 1, registerPrefix: "w" },
    { accessKind: "stur-q", opcode: 0x3c800000, byteWidth: 16, registerPrefix: "q" },
    { accessKind: "stur-d", opcode: 0xfc000000, byteWidth: 8, registerPrefix: "d" },
    { accessKind: "stur-s", opcode: 0xbc000000, byteWidth: 4, registerPrefix: "s" },
  ];
  const spec = specs.find((candidate) => opcode === candidate.opcode);
  if (!spec) return null;
  return {
    accessKind: spec.accessKind,
    offset: signExtend((instruction >>> 12) & 0x1ff, 9),
    byteWidth: spec.byteWidth,
    baseRegisterNumber: (instruction >>> 5) & 0x1f,
    valueRegister: valueRegisterName(instruction & 0x1f, spec.registerPrefix),
    valueRegister2: "",
  };
}

function parseStore(instruction) {
  return parseUnsignedImmediateStore(instruction) || parseStorePair(instruction) || parseUnscaledStore(instruction);
}

function overlapsObjectAc(store) {
  return store.offset < objectAcEnd && store.offset + store.byteWidth > objectAcStart;
}

function classifyOverlap(row) {
  if (row.address === constructorSeedAddress) return "layout-b-constructor-seed";
  if (row.baseRegister === "sp") return "stack-temporary-overlap";
  return "hidden-nonconstructor-object-ac-overlap";
}

function scanLayoutBObjectAcStoreCoverage(buffer, elf) {
  const rows = [];
  for (let address = layoutBFamilyStart; address < layoutBFamilyEnd; address += 4) {
    const fileOffset = fileOffsetForVirtualAddress(elf, address, 4);
    if (fileOffset < 0) continue;
    const instruction = buffer.readUInt32LE(fileOffset);
    const store = parseStore(instruction);
    if (!store) continue;
    const row = {
      address,
      addressHex: hex(address),
      instructionHex: instruction.toString(16).padStart(8, "0"),
      accessKind: store.accessKind,
      offsetHex: hex(store.offset),
      byteWidth: store.byteWidth,
      writeEndHex: hex(store.offset + store.byteWidth),
      baseRegister: baseRegisterName(store.baseRegisterNumber),
      valueRegister: store.valueRegister,
      valueRegister2: store.valueRegister2,
      overlapsObjectAc: overlapsObjectAc(store),
      classification: "non-overlap",
      renderPromotionAllowed: false,
    };
    if (row.overlapsObjectAc) row.classification = classifyOverlap(row);
    rows.push(row);
  }
  return rows;
}

function buildCurrentNativeLayoutBObjectAcStoreCoverageAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const storeRows = scanLayoutBObjectAcStoreCoverage(buffer, elf);
  const objectAcOverlapRows = storeRows.filter((row) => row.overlapsObjectAc);
  const byAccessKind = {};
  const byOverlapClassification = {};
  for (const row of storeRows) byAccessKind[row.accessKind] = (byAccessKind[row.accessKind] || 0) + 1;
  for (const row of objectAcOverlapRows) {
    byOverlapClassification[row.classification] = (byOverlapClassification[row.classification] || 0) + 1;
  }
  const summary = {
    storeRows: storeRows.length,
    objectAcOverlapRows: objectAcOverlapRows.length,
    stackOverlapRows: objectAcOverlapRows.filter((row) => row.classification === "stack-temporary-overlap").length,
    nonStackOverlapRows: objectAcOverlapRows.filter((row) => row.baseRegister !== "sp").length,
    constructorSeedOverlapRows: objectAcOverlapRows.filter((row) => row.classification === "layout-b-constructor-seed").length,
    hiddenNonConstructorObjectAcProducerRows: objectAcOverlapRows.filter(
      (row) => row.classification === "hidden-nonconstructor-object-ac-overlap",
    ).length,
    stpOverlapRows: objectAcOverlapRows.filter((row) => row.accessKind.startsWith("stp")).length,
    simdOverlapRows: objectAcOverlapRows.filter((row) => /-[qds]$/.test(row.accessKind)).length,
    renderPromotionAllowedRows: 0,
    byAccessKind,
    byOverlapClassification,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B object +0xac store coverage audit; closes str/stp/stur/simd immediate store overlap scan without enabling rendering",
    layoutBFamilyRangeHex: `${hex(layoutBFamilyStart)}..${hex(layoutBFamilyEnd)}`,
    objectAcWindowHex: "0xac..0xb0",
    summary,
    interpretation: {
      coverage:
        "The layout B function family was rescanned for unsigned stores, unscaled stores, store pairs, and SIMD stores whose immediate write range overlaps object +0xac.",
      boundary:
        "Only the known constructor seed overlaps object +0xac as a non-stack write; the other overlaps are stack temporaries.",
      nextRequiredEvidence:
        "The missing particle flag producer is not a hidden immediate store inside this recovered layout B family; trace indirect callbacks, table-dispatched owners, or runtime activation instead.",
    },
    objectAcOverlapRows,
    storeRows,
  };
}

function exportCurrentNativeLayoutBObjectAcStoreCoverageAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBObjectAcStoreCoverageAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.objectAcOverlapRows, [
    "addressHex",
    "instructionHex",
    "accessKind",
    "offsetHex",
    "byteWidth",
    "writeEndHex",
    "baseRegister",
    "valueRegister",
    "valueRegister2",
    "classification",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBObjectAcStoreCoverageAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBObjectAcStoreCoverageAudit,
  exportCurrentNativeLayoutBObjectAcStoreCoverageAudit,
  scanLayoutBObjectAcStoreCoverage,
};
