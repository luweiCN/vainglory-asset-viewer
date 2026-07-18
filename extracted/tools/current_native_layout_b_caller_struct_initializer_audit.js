#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-caller-struct-initializer-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_caller_struct_initializer_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_caller_struct_initializer_audit.tsv";

const blockSpecs = [
  {
    id: "caller-struct-root-initializer",
    startHex: "0xbab568",
    defaultFieldOffsets: "+0x0/+0x4/+0x8/+0xc",
    evidence:
      "Root initializer writes the first four default fields, calls 0xbdc28c for +0x10..+0x1c defaults, then calls 0x990ba0 for +0x20..+0x3c defaults.",
  },
  {
    id: "caller-struct-primary-defaults",
    startHex: "0xbdc28c",
    defaultFieldOffsets: "+0x10/+0x14/+0x1c",
    evidence:
      "Primary default helper writes caller struct fields +0x10, +0x14, and +0x1c, or zeroes +0x10/+0x1c when the source table is missing.",
  },
  {
    id: "caller-struct-secondary-defaults",
    startHex: "0x990ba0",
    defaultFieldOffsets: "+0x20/+0x24/+0x28/+0x2c/+0x30/+0x34/+0x38/+0x3c",
    evidence:
      "Secondary default helper writes caller struct fields +0x20 through +0x3c from source tables, with fallback zero stores for +0x20/+0x28/+0x30/+0x38.",
  },
];

const opcodeSpecs = [
  [0xbab590, "caller-struct-root-initializer", "field-count-gate", "71004c3f"],
  [0xbab5b8, "caller-struct-root-initializer", "default-field-store", "b9000268"],
  [0xbab5e4, "caller-struct-root-initializer", "default-field-store", "b9000668"],
  [0xbab610, "caller-struct-root-initializer", "default-field-store", "b9000a68"],
  [0xbab640, "caller-struct-root-initializer", "default-field-store", "b9000e68"],
  [0xbab644, "caller-struct-root-initializer", "primary-default-helper-call", "9400c312"],
  [0xbab648, "caller-struct-root-initializer", "secondary-default-field-count", "52800261"],
  [0xbab650, "caller-struct-root-initializer", "secondary-default-helper-call", "97f79554"],

  [0xbdc28c, "caller-struct-primary-defaults", "field-count-gate", "71004c3f"],
  [0xbdc2b4, "caller-struct-primary-defaults", "default-field-store", "b9001009"],
  [0xbdc2bc, "caller-struct-primary-defaults", "default-field-store", "b9001409"],
  [0xbdc2cc, "caller-struct-primary-defaults", "default-field-store", "b9001c08"],
  [0xbdc2d4, "caller-struct-primary-defaults", "fallback-zero-store", "f900081f"],
  [0xbdc2d8, "caller-struct-primary-defaults", "fallback-zero-store", "b9001c1f"],

  [0x990ba0, "caller-struct-secondary-defaults", "field-count-gate", "71004c3f"],
  [0x990bc4, "caller-struct-secondary-defaults", "default-field-store", "b9002009"],
  [0x990bd4, "caller-struct-secondary-defaults", "default-field-store", "b9002409"],
  [0x990bdc, "caller-struct-secondary-defaults", "default-field-store", "b9002809"],
  [0x990bf0, "caller-struct-secondary-defaults", "fallback-zero-store", "f900101f"],
  [0x990bf4, "caller-struct-secondary-defaults", "fallback-zero-store", "b900281f"],
  [0x990bf8, "caller-struct-secondary-defaults", "default-field-store", "b9002c08"],
  [0x990c18, "caller-struct-secondary-defaults", "default-field-store", "b9003009"],
  [0x990c28, "caller-struct-secondary-defaults", "default-field-store", "b9003409"],
  [0x990c30, "caller-struct-secondary-defaults", "default-field-store", "b9003809"],
  [0x990c40, "caller-struct-secondary-defaults", "default-field-store", "b9003c08"],
  [0x990c48, "caller-struct-secondary-defaults", "fallback-zero-store", "9100c008"],
  [0x990c4c, "caller-struct-secondary-defaults", "fallback-zero-store", "a9007d1f"],
].map(([address, blockId, role, expectedOpcodeHex]) => ({ address, blockId, role, expectedOpcodeHex }));

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

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function opcodeRows(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      blockId: spec.blockId,
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBCallerStructInitializerAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const blockRows = blockSpecs.map((spec) => ({
    ...spec,
    opcodeRows: opcodes.filter((row) => row.blockId === spec.id).length,
    opcodeMismatchRows: opcodes.filter((row) => row.blockId === spec.id && !row.opcodeMatches).length,
    visibilityControlDefaultRows: 0,
    directObjectAcProducerRows: 0,
    renderPromotionAllowed: false,
  }));
  const summary = {
    blockRows: blockRows.length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    defaultFieldStoreRows: opcodes.filter((row) => row.role === "default-field-store" && row.opcodeMatches).length,
    fallbackZeroStoreRows: opcodes.filter((row) => row.role === "fallback-zero-store" && row.opcodeMatches).length,
    visibilityControlDefaultRows: 0,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B caller struct initializer audit; default-field recovery does not prove runtime visibility controls or renderer takeover",
    summary,
    interpretation: {
      recovered:
        "The caller struct initializer fills +0x0..+0x3c through a root initializer and two default helpers.",
      boundary:
        "The initializer evidence does not write visibility-control bytes +0x64..+0x68 and does not write layout B object+0xac.",
      nextRequiredEvidence:
        "Find the parser/runtime writer that sets caller struct +0x64..+0x68 before shared layout B apply runs.",
    },
    blockRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBCallerStructInitializerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBCallerStructInitializerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.blockRows, [
    "id",
    "startHex",
    "defaultFieldOffsets",
    "opcodeRows",
    "opcodeMismatchRows",
    "visibilityControlDefaultRows",
    "directObjectAcProducerRows",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBCallerStructInitializerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBCallerStructInitializerAudit,
  exportCurrentNativeLayoutBCallerStructInitializerAudit,
};
