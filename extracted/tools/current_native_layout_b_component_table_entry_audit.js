#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-component-table-entry-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_component_table_entry_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_component_table_entry_audit.tsv";

const tableSpecs = [
  {
    id: "full-caller-struct-fallback-wrapper-table-entry",
    tableAddress: 0x26c7980,
    expectedTarget: 0x8adf58,
    targetLabel: "fallback-update-wrapper",
    entryClass: "full-caller-struct-wrapper",
    evidence: "Table entry points to the wrapper that reads caller struct +0x64/+0x65/+0x66/+0x68.",
  },
  {
    id: "full-caller-struct-external-resource-wrapper-table-entry",
    tableAddress: 0x26c7988,
    expectedTarget: 0x8ae14c,
    targetLabel: "create-with-external-resource-wrapper",
    entryClass: "full-caller-struct-wrapper",
    evidence: "Table entry points to the wrapper that reads caller struct high control bytes and an external resource pointer.",
  },
  {
    id: "full-caller-struct-required-resource-wrapper-table-entry",
    tableAddress: 0x26c7990,
    expectedTarget: 0x8ae1e8,
    targetLabel: "create-with-required-resource-wrapper",
    entryClass: "full-caller-struct-wrapper",
    evidence: "Table entry points to the wrapper that requires a resource pointer and reads caller struct high control bytes.",
  },
  {
    id: "compact-stack-hash-wrapper-table-entry",
    tableAddress: 0x26c79d8,
    expectedTarget: 0x8ae9a8,
    targetLabel: "compact-stack-hash-wrapper",
    entryClass: "compact-stack-hash-wrapper",
    evidence:
      "Table entry points to a compact route that hashes an input token, builds a stack mini-struct, and calls 0x8adfe4 with constants instead of reading caller struct +0x64..+0x68.",
  },
];

const opcodeSpecs = [
  [0x8aeaa0, "compact-stack-hash-wrapper", "stack-hash-store", "b90013e8"],
  [0x8aeaa4, "compact-stack-hash-wrapper", "target-resource-load", "f9404267"],
  [0x8aeaa8, "compact-stack-hash-wrapper", "constant-s0-negative-one", "1e3e1000"],
  [0x8aeaac, "compact-stack-hash-wrapper", "mini-struct-pointer", "910043e1"],
  [0x8aeab0, "compact-stack-hash-wrapper", "create-query-flag-one", "320003e2"],
  [0x8aeab4, "compact-stack-hash-wrapper", "visibility-flag-one", "320003e3"],
  [0x8aeab8, "compact-stack-hash-wrapper", "w6-negative-one", "12800006"],
  [0x8aeabc, "compact-stack-hash-wrapper", "owner-argument", "aa1303e0"],
  [0x8aeac0, "compact-stack-hash-wrapper", "w4-zero", "2a1f03e4"],
  [0x8aeac4, "compact-stack-hash-wrapper", "w5-zero", "2a1f03e5"],
  [0x8aeac8, "compact-stack-hash-wrapper", "stack-byte-zero", "390003ff"],
  [0x8aeacc, "compact-stack-hash-wrapper", "core-create-query-helper-call", "97fffd46"],
  [0x8aeb78, "compact-stack-hash-wrapper", "specialized-apply-flag-one", "320003e2"],
  [0x8aeb7c, "compact-stack-hash-wrapper", "specialized-apply-resource", "aa1403e1"],
  [0x8aeb80, "compact-stack-hash-wrapper", "specialized-apply-call", "940096f5"],
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

function sectionNameForVirtualAddress(elf, virtualAddress) {
  return (
    elf.sections.find(
      (section) => virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size,
    )?.name || ""
  );
}

function pointerTableRows(buffer, elf) {
  return tableSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.tableAddress, 8);
    const actualTarget = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : -1;
    return {
      id: spec.id,
      tableAddress: spec.tableAddress,
      tableAddressHex: hex(spec.tableAddress),
      sectionName: sectionNameForVirtualAddress(elf, spec.tableAddress),
      expectedTarget: spec.expectedTarget,
      expectedTargetHex: hex(spec.expectedTarget),
      actualTarget,
      actualTargetHex: hex(actualTarget),
      targetLabel: spec.targetLabel,
      entryClass: spec.entryClass,
      targetMatches: actualTarget === spec.expectedTarget,
      highCallerFieldWriter: false,
      renderPromotionAllowed: false,
      evidence: spec.evidence,
    };
  });
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
      highCallerFieldWriter: false,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBComponentTableEntryAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const tableRows = pointerTableRows(buffer, elf);
  const opcodes = opcodeRows(buffer, elf);
  const summary = {
    tableRows: tableRows.length,
    tableEntryMismatchRows: tableRows.filter((row) => !row.targetMatches).length,
    fullCallerStructTableEntryRows: tableRows.filter((row) => row.entryClass === "full-caller-struct-wrapper").length,
    compactStackHashTableEntryRows: tableRows.filter((row) => row.entryClass === "compact-stack-hash-wrapper").length,
    compactOpcodeRows: opcodes.filter((row) => row.blockId === "compact-stack-hash-wrapper").length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    compactConstantArgumentRows: opcodes.filter(
      (row) =>
        row.opcodeMatches &&
        [
          "create-query-flag-one",
          "visibility-flag-one",
          "w6-negative-one",
          "w4-zero",
          "w5-zero",
          "stack-byte-zero",
          "specialized-apply-flag-one",
        ].includes(row.role),
    ).length,
    highCallerFieldWriterRows: 0,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B component table entry audit; separates table-driven full caller-struct wrappers from compact stack/hash routes without promoting renderer takeover",
    summary,
    interpretation: {
      recovered:
        "The .data.rel.ro component table contains three full caller-struct layout B wrappers and one compact stack/hash wrapper. The compact wrapper calls 0x8adfe4 with constants and a stack mini-struct instead of reading caller struct +0x64..+0x68.",
      boundary:
        "This proves entry routing shape only. It does not identify the runtime writer for caller struct +0x64..+0x68 and does not write layout B object+0xac.",
      nextRequiredEvidence:
        "Trace the producer of the full caller-struct input or the table/vtable owner that supplies these entries before using the fields for rendering.",
    },
    tableRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBComponentTableEntryAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBComponentTableEntryAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.tableRows, [
    "id",
    "tableAddressHex",
    "sectionName",
    "expectedTargetHex",
    "actualTargetHex",
    "targetLabel",
    "entryClass",
    "targetMatches",
    "highCallerFieldWriter",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBComponentTableEntryAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBComponentTableEntryAudit,
  exportCurrentNativeLayoutBComponentTableEntryAudit,
};
