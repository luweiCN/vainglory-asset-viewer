#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-direct-caller-struct-builder-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_direct_caller_struct_builder_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_direct_caller_struct_builder_audit.tsv";

const builderSpecs = [
  {
    id: "local-stack-builder-bab250",
    role: "direct-stack-builder",
    startHex: "0x8b3250",
    callerStructBase: "sp+0x8",
    directCalls: "0x8b3350 -> 0xbab250",
    highFieldEvidence:
      "0x8b3320 writes caller +0x64=1/+0x65=1/+0x66=0/+0x67=0; 0x8b3344 writes caller +0x68=1 before the direct bab250 call.",
    dynamicHelperEvidence: "",
    evidence:
      "This path constructs the full caller struct on stack from the native caller and passes it directly to bab250.",
  },
  {
    id: "local-stack-builder-bab514",
    role: "direct-stack-builder",
    startHex: "0x8b3a34",
    callerStructBase: "sp+0x8",
    directCalls: "0x8b3b8c -> 0xbab514",
    highFieldEvidence:
      "0x8b3b44/0x8b3b4c/0x8b3b50/0x8b3b6c write caller +0x64..+0x68 before the direct bab514 call.",
    dynamicHelperEvidence: "",
    evidence:
      "This sibling path builds the same high caller fields for the bab514 apply/query family.",
  },
  {
    id: "resource-stack-builder-a",
    role: "resource-stack-builder",
    startHex: "0x983760",
    callerStructBase: "sp+0x28",
    directCalls: "0x983884 -> 0xbab250 | 0x983920 -> 0xbab514",
    highFieldEvidence:
      "0x983844 writes caller +0x64=1; 0x983848 initializes caller +0x65..+0x68; helper 0x983a9c can overwrite caller +0x67 from config.",
    dynamicHelperEvidence:
      "0x983a9c reads x21+0xb2, writes caller +0x67, and dispatches optional callbacks from x21+0x40/+0x48/+0x50/+0x58.",
    evidence:
      "The nearby resource strings include turret laser/searchlight names; the proven part is the original stack caller struct builder and callback-populated fields.",
  },
  {
    id: "resource-stack-builder-b",
    role: "resource-stack-builder",
    startHex: "0x984940",
    callerStructBase: "sp+0x28",
    directCalls: "0x984a6c -> 0xbab250 | 0x984b08 -> 0xbab514",
    highFieldEvidence:
      "0x984a2c writes caller +0x64=1; 0x984a30 initializes caller +0x65..+0x68; helper 0x984c84 can overwrite caller +0x67 from config.",
    dynamicHelperEvidence:
      "0x984c84 mirrors 0x983a9c: it reads x21+0xb2, writes caller +0x67, and dispatches optional callbacks from x21+0x40/+0x48/+0x50/+0x58.",
    evidence:
      "This is the second direct resource-builder branch feeding the same bab250/bab514 target family.",
  },
];

const opcodeSpecs = [
  [0x8b3320, "local-stack-builder-bab250", "caller-high-field-packed-store-64-67", "b9006fe8"],
  [0x8b333c, "local-stack-builder-bab250", "caller-struct-base-sp-plus-8", "910023e1"],
  [0x8b3340, "local-stack-builder-bab250", "target-object-register", "aa1503e0"],
  [0x8b3344, "local-stack-builder-bab250", "caller-high-field-store-68", "3901c3e8"],
  [0x8b3350, "local-stack-builder-bab250", "direct-bab250-call", "940bdfc0"],

  [0x8b3b44, "local-stack-builder-bab514", "caller-high-field-store-67", "3901bfff"],
  [0x8b3b4c, "local-stack-builder-bab514", "caller-high-field-store-64", "3901b3f7"],
  [0x8b3b50, "local-stack-builder-bab514", "caller-high-field-packed-store-65-66", "7806d3f7"],
  [0x8b3b6c, "local-stack-builder-bab514", "caller-high-field-store-68", "3901c3f7"],
  [0x8b3b84, "local-stack-builder-bab514", "caller-struct-base-sp-plus-8", "910023e1"],
  [0x8b3b8c, "local-stack-builder-bab514", "direct-bab514-call", "940bde62"],

  [0x983844, "resource-stack-builder-a", "caller-high-field-store-64", "390233e9"],
  [0x983848, "resource-stack-builder-a", "caller-high-field-packed-store-65-68", "b808d3e9"],
  [0x98384c, "resource-stack-builder-a", "dynamic-caller-field-helper-call", "94000094"],
  [0x98387c, "resource-stack-builder-a", "caller-struct-base-sp-plus-28", "9100a3e1"],
  [0x983884, "resource-stack-builder-a", "direct-bab250-call", "94089e73"],
  [0x983914, "resource-stack-builder-a", "bab514-extra-argument-load", "f9401682"],
  [0x983918, "resource-stack-builder-a", "caller-struct-base-sp-plus-28", "9100a3e1"],
  [0x983920, "resource-stack-builder-a", "direct-bab514-call", "94089efd"],
  [0x983adc, "resource-stack-builder-a", "dynamic-caller-field-source-load", "3942caa8"],
  [0x983ae0, "resource-stack-builder-a", "caller-high-field-dynamic-store-67", "39019e88"],
  [0x983b04, "resource-stack-builder-a", "callback-vector-field-offset", "91011281"],
  [0x983b24, "resource-stack-builder-a", "callback-scalar-field-offset", "9100d281"],

  [0x984a2c, "resource-stack-builder-b", "caller-high-field-store-64", "390233e9"],
  [0x984a30, "resource-stack-builder-b", "caller-high-field-packed-store-65-68", "b808d3e9"],
  [0x984a34, "resource-stack-builder-b", "dynamic-caller-field-helper-call", "94000094"],
  [0x984a64, "resource-stack-builder-b", "caller-struct-base-sp-plus-28", "9100a3e1"],
  [0x984a6c, "resource-stack-builder-b", "direct-bab250-call", "940899f9"],
  [0x984afc, "resource-stack-builder-b", "bab514-extra-argument-load", "f9401682"],
  [0x984b00, "resource-stack-builder-b", "caller-struct-base-sp-plus-28", "9100a3e1"],
  [0x984b08, "resource-stack-builder-b", "direct-bab514-call", "94089a83"],
  [0x984cc4, "resource-stack-builder-b", "dynamic-caller-field-source-load", "3942caa8"],
  [0x984cc8, "resource-stack-builder-b", "caller-high-field-dynamic-store-67", "39019e88"],
  [0x984cec, "resource-stack-builder-b", "callback-vector-field-offset", "91011281"],
  [0x984d0c, "resource-stack-builder-b", "callback-scalar-field-offset", "9100d281"],
].map(([address, builderId, role, expectedOpcodeHex]) => ({ address, builderId, role, expectedOpcodeHex }));

const indirectTableEntrySpecs = [
  {
    id: "table-driven-fallback-update-wrapper",
    tableAddress: 0x26c7980,
    expectedTarget: 0x8adf58,
    targetLabel: "fallback-update-wrapper",
    evidence: "component table entry routes into the full caller-struct layout B wrapper",
  },
  {
    id: "table-driven-external-resource-wrapper",
    tableAddress: 0x26c7988,
    expectedTarget: 0x8ae14c,
    targetLabel: "create-with-external-resource-wrapper",
    evidence: "component table entry routes into the full caller-struct layout B wrapper",
  },
  {
    id: "table-driven-required-resource-wrapper",
    tableAddress: 0x26c7990,
    expectedTarget: 0x8ae1e8,
    targetLabel: "create-with-required-resource-wrapper",
    evidence: "component table entry routes into the full caller-struct layout B wrapper",
  },
];

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

function opcodeRows(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      builderId: spec.builderId,
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function indirectTableEntryRows(buffer, elf) {
  return indirectTableEntrySpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.tableAddress, 8);
    const actualTarget = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : -1;
    return {
      ...spec,
      tableAddressHex: hex(spec.tableAddress),
      expectedTargetHex: hex(spec.expectedTarget),
      actualTarget,
      actualTargetHex: hex(actualTarget),
      sectionName: sectionNameForVirtualAddress(elf, spec.tableAddress),
      targetMatches: actualTarget === spec.expectedTarget,
      highCallerFieldWriter: false,
      directObjectAcProducerRows: 0,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildCurrentNativeLayoutBDirectCallerStructBuilderAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const indirectRows = indirectTableEntryRows(buffer, elf);
  const builderRows = builderSpecs.map((spec) => {
    const builderOpcodes = opcodes.filter((row) => row.builderId === spec.id);
    return {
      ...spec,
      opcodeRows: builderOpcodes.length,
      opcodeMismatchRows: countRows(builderOpcodes, (row) => !row.opcodeMatches),
      directBab250CallRows: countRows(builderOpcodes, (row) => row.role === "direct-bab250-call"),
      directBab514CallRows: countRows(builderOpcodes, (row) => row.role === "direct-bab514-call"),
      highCallerFieldWriterRows: countRows(builderOpcodes, (row) => row.role.includes("caller-high-field")),
      dynamicCallerFieldHelperRows: countRows(builderOpcodes, (row) => row.role === "dynamic-caller-field-helper-call"),
      indirectTableEntryCoverageRows: 0,
      directObjectAcProducerRows: 0,
      renderPromotionAllowed: false,
    };
  });
  const summary = {
    builderRows: builderRows.length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: countRows(opcodes, (row) => !row.opcodeMatches),
    directBab250CallRows: countRows(opcodes, (row) => row.role === "direct-bab250-call"),
    directBab514CallRows: countRows(opcodes, (row) => row.role === "direct-bab514-call"),
    highCallerFieldWriterRows: countRows(opcodes, (row) => row.role.includes("caller-high-field")),
    dynamicCallerFieldHelperRows: countRows(opcodes, (row) => row.role === "dynamic-caller-field-helper-call"),
    fullCallerStructWriterRecoveredRows: countRows(
      builderRows,
      (row) => row.highCallerFieldWriterRows > 0 && row.directBab250CallRows + row.directBab514CallRows > 0,
    ),
    indirectTableEntryRows: indirectRows.length,
    indirectTableEntryMismatchRows: countRows(indirectRows, (row) => !row.targetMatches),
    indirectTableEntryCoverageRows: countRows(indirectRows, (row) => row.targetMatches),
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: countRows(opcodes, (row) => row.renderPromotionAllowed),
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only direct caller struct builder audit; proves native stack writers for layout B caller high fields without enabling render takeover",
    summary,
    interpretation: {
      recovered:
        "Four original caller paths build the full caller struct on stack before direct bab250/bab514 calls; resource-builder helper paths also populate dynamic caller fields from native config/callbacks. The three table-driven layout B entries route into full caller-struct wrappers at 0x8adf58/0x8ae14c/0x8ae1e8.",
      boundary:
        "This closes the direct stack-builder path and table entry routing. It still does not identify the upstream runtime writer for the shared caller struct or a direct layout B object+0xac producer.",
      nextRequiredEvidence:
        "Trace the producer of the shared caller struct and map the dynamic callback slots at x21+0x40/+0x48/+0x50/+0x58/+0x60/+0x68 to concrete resource records before render promotion.",
    },
    builderRows,
    indirectTableEntryRows: indirectRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBDirectCallerStructBuilderAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBDirectCallerStructBuilderAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.builderRows, [
    "id",
    "role",
    "startHex",
    "callerStructBase",
    "directCalls",
    "opcodeRows",
    "opcodeMismatchRows",
    "directBab250CallRows",
    "directBab514CallRows",
    "highCallerFieldWriterRows",
    "dynamicCallerFieldHelperRows",
    "indirectTableEntryCoverageRows",
    "directObjectAcProducerRows",
    "renderPromotionAllowed",
    "highFieldEvidence",
    "dynamicHelperEvidence",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBDirectCallerStructBuilderAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBDirectCallerStructBuilderAudit,
  exportCurrentNativeLayoutBDirectCallerStructBuilderAudit,
};
