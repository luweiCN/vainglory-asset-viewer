#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-component-table-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_component_table_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_component_table_owner_audit.tsv";

const blockSpecs = [
  {
    id: "component-method-table-installer",
    role: "component-table-owner",
    startHex: "0x8aa8f0",
    recoveredTableAddresses: "0x26c78d0 | 0x26c7aa0 | 0x26c7c40",
    evidence:
      "Installer derives three method-table pointers from .data.rel.ro base 0x26c78c0, stores 0x26c78d0 at object +0, and stores 0x26c7aa0/0x26c7c40 as a paired table payload at object +0x28.",
  },
  {
    id: "layout-b-object-vtable-installer",
    role: "layout-b-object-table-owner",
    startHex: "0x8d2d34",
    recoveredTableAddresses: "0x26c8e38 | 0x26c8ed8",
    evidence:
      "Layout B object constructor derives a separate .data.rel.ro table family around 0x26c8e38/0x26c8ed8; this is not the upper component table that contains 0x8adf58/0x8ae14c/0x8ae1e8.",
  },
  {
    id: "layout-b-type-registration",
    role: "layout-b-type-registration",
    startHex: "0x8d2f44",
    recoveredTableAddresses: "type literal 0x118 | global 0x2d44ea8",
    evidence:
      "Type registration publishes layout B type literal 0x118 and stores the runtime type index in global 0x2d44ea8 before installing layout B callbacks.",
  },
];

const opcodeSpecs = [
  [0x8aa8fc, "component-method-table-installer", "component-table-base-page", "b000f0e8"],
  [0x8aa900, "component-method-table-installer", "component-table-base-add", "91230108"],
  [0x8aa908, "component-method-table-installer", "component-table-secondary-add", "9107810a"],
  [0x8aa90c, "component-method-table-installer", "component-table-primary-add", "91004109"],
  [0x8aa914, "component-method-table-installer", "component-table-tertiary-add", "910e0108"],
  [0x8aa920, "component-method-table-installer", "component-primary-table-store", "f9000009"],
  [0x8aa924, "component-method-table-installer", "component-paired-table-store", "3c828000"],

  [0x8d2d58, "layout-b-object-vtable-installer", "layout-b-entry-table-page", "d000efa9"],
  [0x8d2d60, "layout-b-object-vtable-installer", "layout-b-entry-table-add", "913b6129"],
  [0x8d2d6c, "layout-b-object-vtable-installer", "layout-b-entry-table-secondary-add", "91004128"],
  [0x8d2d74, "layout-b-object-vtable-installer", "layout-b-entry-table-store", "f9001668"],
  [0x8d2d7c, "layout-b-object-vtable-installer", "layout-b-object-table-page", "d000efa8"],
  [0x8d2d80, "layout-b-object-vtable-installer", "layout-b-object-table-add", "9138e108"],
  [0x8d2d94, "layout-b-object-vtable-installer", "layout-b-object-primary-table-store", "f900026b"],

  [0x8d2f50, "layout-b-type-registration", "type-count-offset-low", "5287f608"],
  [0x8d2f5c, "layout-b-type-registration", "type-record-stride", "52805d0a"],
  [0x8d2f8c, "layout-b-type-registration", "layout-b-type-size-literal", "5280230b"],
  [0x8d2f90, "layout-b-type-registration", "layout-b-type-record-store", "2914ad49"],
  [0x8d2fbc, "layout-b-type-registration", "layout-b-type-index-global-store", "b90ea909"],
  [0x8d2fc0, "layout-b-type-registration", "layout-b-slot0-installer-call", "943ee4cd"],
  [0x8d2fd8, "layout-b-type-registration", "layout-b-slot1-installer-call", "943ee4c7"],
  [0x8d2ff0, "layout-b-type-registration", "layout-b-slot4-installer-call", "943ee4c1"],
  [0x8d3004, "layout-b-type-registration", "layout-b-tail-slot-installer-call", "943ee4c9"],
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

function buildCurrentNativeLayoutBComponentTableOwnerAudit(
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
    highCallerFieldWriterRows: 0,
    renderPromotionAllowed: false,
  }));
  const summary = {
    blockRows: blockRows.length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    componentTableInstallerRows: blockRows.filter((row) => row.role === "component-table-owner").length,
    layoutBObjectTableInstallerRows: blockRows.filter((row) => row.role === "layout-b-object-table-owner").length,
    layoutBTypeRegistrationRows: blockRows.filter((row) => row.role === "layout-b-type-registration").length,
    componentTableRootRecovered: true,
    layoutBObjectTableSeparated: true,
    highCallerFieldWriterRows: 0,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B component table owner audit; separates upper component method tables from the concrete layout B object table and type registration",
    summary,
    interpretation: {
      recovered:
        "The upper component object installs method tables around 0x26c78d0, while the concrete layout B object installs a separate table family around 0x26c8e38/0x26c8ed8 and registers type literal 0x118.",
      boundary:
        "This closes table ownership shape, but it still does not identify the parser/runtime writer for caller struct +0x64..+0x68 and does not write layout B object+0xac.",
      nextRequiredEvidence:
        "Trace the component field population path that feeds the full caller-struct table entries, then connect that to concrete resource/config records.",
    },
    blockRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBComponentTableOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBComponentTableOwnerAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.blockRows, [
    "id",
    "role",
    "startHex",
    "recoveredTableAddresses",
    "opcodeRows",
    "opcodeMismatchRows",
    "highCallerFieldWriterRows",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBComponentTableOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBComponentTableOwnerAudit,
  exportCurrentNativeLayoutBComponentTableOwnerAudit,
};
