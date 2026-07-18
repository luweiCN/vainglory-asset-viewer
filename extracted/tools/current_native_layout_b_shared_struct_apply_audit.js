#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-shared-struct-apply-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_shared_struct_apply_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_shared_struct_apply_audit.tsv";

const blockSpecs = [
  {
    id: "fallback-update-wrapper",
    role: "wrapper",
    startHex: "0x8adf58",
    specializedApplyTargetHex: "0x8d4754",
    callerFieldOffsets: "+0x18 | +0x20 | +0x24 | +0x28 | +0x5c/+0x60 | +0x64 | +0x65 | +0x66 | +0x68",
    evidence:
      "Wrapper loads shared caller fields, creates/queries the layout B object through 0x8adfe4, applies 0x8d4754 with caller +0x64, then tails into common apply.",
  },
  {
    id: "create-with-external-resource-wrapper",
    role: "wrapper",
    startHex: "0x8ae14c",
    specializedApplyTargetHex: "0x8d483c",
    callerFieldOffsets: "+0x18 | +0x20 | +0x24 | +0x28 | +0x5c/+0x60 | +0x64 | +0x65 | +0x66 | +0x68",
    evidence:
      "Wrapper loads the same shared caller fields, creates/queries through 0x8adfe4, applies 0x8d483c with external resource x20 and caller +0x64, then tails into common apply.",
  },
  {
    id: "create-with-required-resource-wrapper",
    role: "wrapper",
    startHex: "0x8ae1e8",
    specializedApplyTargetHex: "0x8d4940",
    callerFieldOffsets: "+0x18 | +0x20 | +0x24 | +0x28 | +0x5c/+0x60 | +0x64 | +0x65 | +0x66 | +0x68",
    evidence:
      "Wrapper requires x2 to be non-null, loads the same shared caller fields, creates/queries through 0x8adfe4, applies 0x8d4940 with caller +0x64, then tails into common apply.",
  },
  {
    id: "common-struct-apply-tail",
    role: "common-apply",
    startHex: "0x8ade48",
    specializedApplyTargetHex: "",
    callerFieldOffsets: "+0 | +0x8 | +0x10 | +0x30 | +0x34/+0x38/+0x3c | +0x44..+0x58 | +0x67",
    evidence:
      "Common apply consumes +0x67 for 0x8d4a50, optional pointer/resource fields for 0x8d4e6c/0x8d4eb8/0x8d4e8c/0x8d4c70, vector/scalar fields +0x34/+0x38/+0x3c and +0x44..+0x58, then tails to 0x8d44ec.",
  },
];

const opcodeSpecs = [
  [0x8adf6c, "fallback-update-wrapper", "caller-field-load", "bd402420"],
  [0x8adf70, "fallback-update-wrapper", "caller-field-load", "294b9423"],
  [0x8adf74, "fallback-update-wrapper", "caller-field-load", "b9402826"],
  [0x8adf78, "fallback-update-wrapper", "caller-field-load", "f9400c27"],
  [0x8adf7c, "fallback-update-wrapper", "caller-field-load", "3941a028"],
  [0x8adf80, "fallback-update-wrapper", "caller-field-load", "39419824"],
  [0x8adf84, "fallback-update-wrapper", "caller-field-load", "39419422"],
  [0x8adf8c, "fallback-update-wrapper", "caller-field-load", "91008021"],
  [0x8adf98, "fallback-update-wrapper", "core-create-query-helper-call", "94000013"],
  [0x8adfa4, "fallback-update-wrapper", "specialized-apply-arg", "f9400a81"],
  [0x8adfa8, "fallback-update-wrapper", "specialized-apply-arg", "39419262"],
  [0x8adfb0, "fallback-update-wrapper", "specialized-apply-call", "940099e9"],
  [0x8adfcc, "fallback-update-wrapper", "common-tail-branch", "17ffff9f"],

  [0x8ae164, "create-with-external-resource-wrapper", "caller-field-load", "bd402420"],
  [0x8ae168, "create-with-external-resource-wrapper", "caller-field-load", "294b9423"],
  [0x8ae16c, "create-with-external-resource-wrapper", "caller-field-load", "b9402826"],
  [0x8ae170, "create-with-external-resource-wrapper", "caller-field-load", "f9400c27"],
  [0x8ae174, "create-with-external-resource-wrapper", "caller-field-load", "3941a028"],
  [0x8ae178, "create-with-external-resource-wrapper", "caller-field-load", "39419824"],
  [0x8ae17c, "create-with-external-resource-wrapper", "caller-field-load", "39419422"],
  [0x8ae184, "create-with-external-resource-wrapper", "caller-field-load", "91008021"],
  [0x8ae190, "create-with-external-resource-wrapper", "core-create-query-helper-call", "97ffff95"],
  [0x8ae19c, "create-with-external-resource-wrapper", "specialized-apply-arg", "f9400aa1"],
  [0x8ae1a0, "create-with-external-resource-wrapper", "specialized-apply-arg", "39419263"],
  [0x8ae1ac, "create-with-external-resource-wrapper", "specialized-apply-call", "940099a4"],
  [0x8ae1c8, "create-with-external-resource-wrapper", "common-tail-branch", "17ffff20"],

  [0x8ae208, "create-with-required-resource-wrapper", "required-resource-gate", "b4000342"],
  [0x8ae20c, "create-with-required-resource-wrapper", "caller-field-load", "bd402660"],
  [0x8ae210, "create-with-required-resource-wrapper", "caller-field-load", "294b9663"],
  [0x8ae214, "create-with-required-resource-wrapper", "caller-field-load", "b9402a66"],
  [0x8ae218, "create-with-required-resource-wrapper", "caller-field-load", "f9400e67"],
  [0x8ae21c, "create-with-required-resource-wrapper", "caller-field-load", "3941a268"],
  [0x8ae220, "create-with-required-resource-wrapper", "caller-field-load", "39419a64"],
  [0x8ae224, "create-with-required-resource-wrapper", "caller-field-load", "39419662"],
  [0x8ae228, "create-with-required-resource-wrapper", "caller-field-load", "91008261"],
  [0x8ae234, "create-with-required-resource-wrapper", "core-create-query-helper-call", "97ffff6c"],
  [0x8ae240, "create-with-required-resource-wrapper", "specialized-apply-arg", "f9400aa1"],
  [0x8ae244, "create-with-required-resource-wrapper", "specialized-apply-arg", "39419263"],
  [0x8ae250, "create-with-required-resource-wrapper", "specialized-apply-call", "940099bc"],
  [0x8ae26c, "create-with-required-resource-wrapper", "common-tail-branch", "17fffef7"],

  [0x8ade58, "common-struct-apply-tail", "common-apply", "39419c28"],
  [0x8ade70, "common-struct-apply-tail", "common-apply", "94009af8"],
  [0x8ade74, "common-struct-apply-tail", "common-apply", "f9400295"],
  [0x8ade7c, "common-struct-apply-tail", "common-apply", "f9400680"],
  [0x8ade94, "common-struct-apply-tail", "common-apply", "94009bf6"],
  [0x8ade9c, "common-struct-apply-tail", "common-apply", "f9400a81"],
  [0x8adea8, "common-struct-apply-tail", "common-apply", "94009c04"],
  [0x8adebc, "common-struct-apply-tail", "common-apply", "b8430c48"],
  [0x8adee8, "common-struct-apply-tail", "common-apply", "94009be9"],
  [0x8adef8, "common-struct-apply-tail", "common-apply", "94009b5e"],
  [0x8adefc, "common-struct-apply-tail", "common-apply", "2d4a0680"],
  [0x8adf10, "common-struct-apply-tail", "common-apply", "bd405a82"],
  [0x8adf1c, "common-struct-apply-tail", "common-apply", "94009c09"],
  [0x8adf20, "common-struct-apply-tail", "common-apply", "9100d281"],
  [0x8adf28, "common-struct-apply-tail", "common-apply", "94009c25"],
  [0x8adf2c, "common-struct-apply-tail", "common-apply", "bd403a80"],
  [0x8adf34, "common-struct-apply-tail", "common-apply", "94009c25"],
  [0x8adf38, "common-struct-apply-tail", "common-apply", "9100f281"],
  [0x8adf40, "common-struct-apply-tail", "common-apply", "94009c24"],
  [0x8adf54, "common-struct-apply-tail", "common-apply", "14009966"],
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

function buildCurrentNativeLayoutBSharedStructApplyAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const blockRows = blockSpecs.map((spec) => ({
    ...spec,
    opcodeRows: opcodes.filter((row) => row.blockId === spec.id).length,
    opcodeMismatchRows: opcodes.filter((row) => row.blockId === spec.id && !row.opcodeMatches).length,
    directObjectAcProducerRows: 0,
    renderPromotionAllowed: false,
  }));
  const summary = {
    blockRows: blockRows.length,
    wrapperRows: blockRows.filter((row) => row.role === "wrapper").length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    callerFieldLoadRows: opcodes.filter((row) => row.role === "caller-field-load" && row.opcodeMatches).length,
    specializedApplyRows: opcodes.filter((row) => row.role === "specialized-apply-call" && row.opcodeMatches).length,
    commonApplyRows: opcodes.filter((row) => row.role === "common-apply" && row.opcodeMatches).length,
    commonTailRows: opcodes.filter((row) => row.role === "common-tail-branch" && row.opcodeMatches).length,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B shared struct apply audit; field mapping explains setup inputs but does not prove particle visibility or renderer takeover",
    summary,
    interpretation: {
      recovered:
        "Three wrapper blocks load a shared caller struct, call the core layout B create/query helper, invoke one specialized apply function, and tail into the common struct apply block.",
      boundary:
        "The field mapping explains setup and visibility parameters, but none of these blocks writes layout B object+0xac or proves the 0x200 draw flag producer.",
      nextRequiredEvidence:
        "Trace the producer of the shared caller struct fields and the later target payload draw consumer before enabling any PFX runtime rendering.",
    },
    blockRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBSharedStructApplyAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBSharedStructApplyAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.blockRows, [
    "id",
    "role",
    "startHex",
    "specializedApplyTargetHex",
    "callerFieldOffsets",
    "opcodeRows",
    "opcodeMismatchRows",
    "directObjectAcProducerRows",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBSharedStructApplyAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBSharedStructApplyAudit,
  exportCurrentNativeLayoutBSharedStructApplyAudit,
};
