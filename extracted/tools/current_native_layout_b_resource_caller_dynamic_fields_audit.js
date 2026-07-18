#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-resource-caller-dynamic-fields-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_resource_caller_dynamic_fields_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_resource_caller_dynamic_fields_audit.tsv";

const helperBlockSpecs = [
  {
    id: "resource-stack-builder-a-helper",
    startHex: "0x983a9c",
    callerBuilderHex: "0x983760",
    fieldReadBase: "x21",
    callerStructBase: "x20",
    evidence: "resource-stack-builder-a calls helper 0x983a9c before bab250/bab514",
  },
  {
    id: "resource-stack-builder-b-helper",
    startHex: "0x984c84",
    callerBuilderHex: "0x984940",
    fieldReadBase: "x21",
    callerStructBase: "x20",
    evidence: "resource-stack-builder-b calls mirrored helper 0x984c84 before bab250/bab514",
  },
];

const helperOpcodeSpecs = [
  [0x983adc, "resource-stack-builder-a-helper", "config-byte-load", "3942caa8", "x21+0xb2", "caller+0x67"],
  [0x983ae0, "resource-stack-builder-a-helper", "visibility-byte-store", "39019e88", "x21+0xb2", "caller+0x67"],
  [0x983ae8, "resource-stack-builder-a-helper", "curve-input-address", "9101c2a0", "x21+0x70", ""],
  [0x983af4, "resource-stack-builder-a-helper", "curve-helper-call", "94000227", "0x984390", "caller+0x2c"],
  [0x983af8, "resource-stack-builder-a-helper", "curve-value-store", "bd002e80", "s0", "caller+0x2c"],
  [0x983afc, "resource-stack-builder-a-helper", "vector-callback-load", "f9402aa8", "x21+0x50", ""],
  [0x983b04, "resource-stack-builder-a-helper", "vector-callback-dst-a", "91011281", "", "caller+0x44"],
  [0x983b08, "resource-stack-builder-a-helper", "vector-callback-dst-b", "91014282", "", "caller+0x50"],
  [0x983b0c, "resource-stack-builder-a-helper", "vector-callback-dst-c", "91015283", "", "caller+0x54"],
  [0x983b10, "resource-stack-builder-a-helper", "vector-callback-dst-d", "91016284", "", "caller+0x58"],
  [0x983b18, "resource-stack-builder-a-helper", "vector-callback-dispatch", "d63f0100", "x21+0x50", "caller+0x44/+0x50/+0x54/+0x58"],
  [0x983b1c, "resource-stack-builder-a-helper", "scalar-callback-load", "f9402ea8", "x21+0x58", ""],
  [0x983b24, "resource-stack-builder-a-helper", "scalar-callback-dst", "9100d281", "", "caller+0x34"],
  [0x983b2c, "resource-stack-builder-a-helper", "scalar-callback-dispatch", "d63f0100", "x21+0x58", "caller+0x34"],
  [0x983b34, "resource-stack-builder-a-helper", "resource-name-callback-load", "f94022a8", "x21+0x40", ""],
  [0x983b3c, "resource-stack-builder-a-helper", "resource-object-dst", "91002297", "", "caller+0x8"],
  [0x983b50, "resource-stack-builder-a-helper", "resource-name-callback-dispatch", "d63f0100", "x21+0x40", "caller+0/+0x8"],
  [0x983b64, "resource-stack-builder-a-helper", "resource-object-merge-call", "940b6b33", "0xc5e830", "caller+0x8"],
  [0x983b8c, "resource-stack-builder-a-helper", "resource-object-store", "f9000280", "callback result", "caller+0"],
  [0x983bd8, "resource-stack-builder-a-helper", "resource-hash-store", "b9003288", "callback string hash or fallback", "caller+0x30"],
  [0x983bec, "resource-stack-builder-a-helper", "fallback-resource-store", "f9000a88", "x21+0x48/x19", "caller+0x10"],

  [0x984cc4, "resource-stack-builder-b-helper", "config-byte-load", "3942caa8", "x21+0xb2", "caller+0x67"],
  [0x984cc8, "resource-stack-builder-b-helper", "visibility-byte-store", "39019e88", "x21+0xb2", "caller+0x67"],
  [0x984cd0, "resource-stack-builder-b-helper", "curve-input-address", "9101c2a0", "x21+0x70", ""],
  [0x984cdc, "resource-stack-builder-b-helper", "curve-helper-call", "94000227", "0x985578", "caller+0x2c"],
  [0x984ce0, "resource-stack-builder-b-helper", "curve-value-store", "bd002e80", "s0", "caller+0x2c"],
  [0x984ce4, "resource-stack-builder-b-helper", "vector-callback-load", "f9402aa8", "x21+0x50", ""],
  [0x984cec, "resource-stack-builder-b-helper", "vector-callback-dst-a", "91011281", "", "caller+0x44"],
  [0x984cf0, "resource-stack-builder-b-helper", "vector-callback-dst-b", "91014282", "", "caller+0x50"],
  [0x984cf4, "resource-stack-builder-b-helper", "vector-callback-dst-c", "91015283", "", "caller+0x54"],
  [0x984cf8, "resource-stack-builder-b-helper", "vector-callback-dst-d", "91016284", "", "caller+0x58"],
  [0x984d00, "resource-stack-builder-b-helper", "vector-callback-dispatch", "d63f0100", "x21+0x50", "caller+0x44/+0x50/+0x54/+0x58"],
  [0x984d04, "resource-stack-builder-b-helper", "scalar-callback-load", "f9402ea8", "x21+0x58", ""],
  [0x984d0c, "resource-stack-builder-b-helper", "scalar-callback-dst", "9100d281", "", "caller+0x34"],
  [0x984d14, "resource-stack-builder-b-helper", "scalar-callback-dispatch", "d63f0100", "x21+0x58", "caller+0x34"],
  [0x984d1c, "resource-stack-builder-b-helper", "resource-name-callback-load", "f94022a8", "x21+0x40", ""],
  [0x984d24, "resource-stack-builder-b-helper", "resource-object-dst", "91002297", "", "caller+0x8"],
  [0x984d38, "resource-stack-builder-b-helper", "resource-name-callback-dispatch", "d63f0100", "x21+0x40", "caller+0/+0x8"],
  [0x984d4c, "resource-stack-builder-b-helper", "resource-object-merge-call", "940b66b9", "0xc5e830", "caller+0x8"],
  [0x984d74, "resource-stack-builder-b-helper", "resource-object-store", "f9000280", "callback result", "caller+0"],
  [0x984dc0, "resource-stack-builder-b-helper", "resource-hash-store", "b9003288", "callback string hash or fallback", "caller+0x30"],
  [0x984dd4, "resource-stack-builder-b-helper", "fallback-resource-store", "f9000a88", "x21+0x48/x19", "caller+0x10"],
].map(([address, blockId, role, expectedOpcodeHex, sourceField, callerField]) => ({
  address,
  blockId,
  role,
  expectedOpcodeHex,
  sourceField,
  callerField,
}));

const commonApplyConsumerSpecs = [
  [0x8ade58, "visibility-byte-consume", "39419c28", "caller+0x67", "0x8d4a50"],
  [0x8ade68, "curve-value-consume", "bd402e80", "caller+0x2c", "0x8d4a50"],
  [0x8ade74, "resource-object-load", "f9400295", "caller+0", "0x8d4e6c/0x8d4e8c/0x8d4c70"],
  [0x8ade7c, "resource-object-extra-load", "f9400680", "caller+0x8", "0x189ad7c/0x8d4e6c"],
  [0x8ade9c, "fallback-resource-load", "f9400a81", "caller+0x10", "0x8d4eb8"],
  [0x8adebc, "resource-hash-load", "b8430c48", "caller+0x30", "0x8d4e8c/0x8d4c70"],
  [0x8adefc, "vector-callback-result-load", "2d4a0680", "caller+0x50", "0x8d4f40"],
  [0x8adf10, "vector-callback-third-load", "bd405a82", "caller+0x58", "0x8d4f40"],
  [0x8adf20, "scalar-callback-result-address", "9100d281", "caller+0x34", "0x8d4fbc"],
  [0x8adf2c, "scalar-followup-load", "bd403a80", "caller+0x38", "0x8d4fc8"],
  [0x8adf38, "scalar-tail-address", "9100f281", "caller+0x3c", "0x8d4fd0"],
].map(([address, role, expectedOpcodeHex, callerField, consumer]) => ({
  address,
  blockId: "common-struct-apply-tail",
  role,
  expectedOpcodeHex,
  sourceField: callerField,
  callerField,
  consumer,
}));

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

function opcodeRowsForSpecs(stage, buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage,
      address: spec.address,
      addressHex: hex(spec.address),
      blockId: spec.blockId,
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      sourceField: spec.sourceField || "",
      callerField: spec.callerField || "",
      consumer: spec.consumer || "",
      directObjectAcProducer: false,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const helperRows = opcodeRowsForSpecs("resource-helper", buffer, elf, helperOpcodeSpecs);
  const consumerRows = opcodeRowsForSpecs("common-apply-consumer", buffer, elf, commonApplyConsumerSpecs);
  const opcodeRows = [...helperRows, ...consumerRows];
  const blockRows = helperBlockSpecs.map((spec) => {
    const rows = helperRows.filter((row) => row.blockId === spec.id);
    return {
      ...spec,
      opcodeRows: rows.length,
      opcodeMismatchRows: rows.filter((row) => !row.opcodeMatches).length,
      dynamicCallerFieldRows: rows.filter((row) => row.callerField).length,
      callbackDispatchRows: rows.filter((row) => row.role.endsWith("-dispatch")).length,
      directObjectAcProducerRows: 0,
      renderPromotionAllowed: false,
    };
  });
  const helperSourceFields = new Set(helperRows.map((row) => row.sourceField).filter(Boolean));
  const callerFields = new Set(helperRows.flatMap((row) => row.callerField.split("/")).filter(Boolean));
  const summary = {
    helperBlockRows: blockRows.length,
    helperOpcodeRows: helperRows.length,
    commonApplyConsumerRows: consumerRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows: opcodeRows.filter((row) => !row.opcodeMatches).length,
    dynamicCallerFieldRows: helperRows.filter((row) => row.callerField).length,
    callbackDispatchRows: helperRows.filter((row) => row.role.endsWith("-dispatch")).length,
    resourceNameCallbackRows: helperRows.filter((row) => row.role === "resource-name-callback-dispatch").length,
    vectorCallbackRows: helperRows.filter((row) => row.role === "vector-callback-dispatch").length,
    scalarCallbackRows: helperRows.filter((row) => row.role === "scalar-callback-dispatch").length,
    helperSourceFieldRows: helperSourceFields.size,
    callerFieldRows: callerFields.size,
    commonApplyConsumerRecovered: consumerRows.every((row) => row.opcodeMatches),
    dynamicFieldsReachCommonApply: true,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B resource caller dynamic-field audit; maps resource helper caller fields without treating them as object+0xac producers",
    summary,
    interpretation: {
      recovered:
        "The two resource-stack helpers are mirrored. They copy config byte x21+0xb2 into caller+0x67, optionally compute caller+0x2c from x21+0x70, dispatch resource-name/object callbacks from x21+0x40/+0x48, vector callback x21+0x50 into caller+0x44/+0x50/+0x54/+0x58, and scalar callback x21+0x58 into caller+0x34.",
      commonApply:
        "The common layout B apply tail consumes those fields through 0x8d4a50, 0x8d4e6c/0x8d4eb8/0x8d4e8c/0x8d4c70, 0x8d4f40, 0x8d4fbc, 0x8d4fc8, and 0x8d4fd0.",
      boundary:
        "This maps dynamic caller fields from resource config/callbacks to layout B apply calls. It still does not write layout B object+0xac, does not prove the 0x200 draw flag producer, and does not authorize renderer takeover.",
    },
    unresolved: [
      "the concrete resource record schema behind x21+0x40/+0x48/+0x50/+0x58 callbacks",
      "the later object field writes inside 0x8d4a50/0x8d4e6c/0x8d4eb8/0x8d4e8c/0x8d4c70/0x8d4f40/0x8d4fbc/0x8d4fc8/0x8d4fd0",
      "the exact layout B object+0xac producer that can carry particle draw mask 0x200",
    ],
    blockRows,
    helperRows,
    consumerRows,
    opcodeRows,
  };
}

function exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.opcodeRows, [
    "stage",
    "addressHex",
    "blockId",
    "role",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "sourceField",
    "callerField",
    "consumer",
    "directObjectAcProducer",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit,
  exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit,
};
