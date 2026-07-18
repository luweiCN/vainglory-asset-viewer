#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-shaderdata-type4-entry-semantics-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderdata_type4_entry_semantics_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderdata_type4_entry_semantics_audit.tsv";

const opcodeSpecs = [
  [0x189bacc, "shared-type4-entry-writer", "writer-load-table-struct", "f9400008", "Shared type4 writer loads the source/program table struct from x0."],
  [0x189bad0, "shared-type4-entry-writer", "writer-load-packed-counts", "b940110a", "Table +0x10 packed counts supply entry count low16 and value-word count high16."],
  [0x189bad4, "shared-type4-entry-writer", "writer-load-entry-array", "f9400108", "Table +0 contains the 8-byte source-table entry array pointer."],
  [0x189bae4, "shared-type4-entry-writer", "writer-pack-source-index-low12", "33002c2b", "Entry header low 12 bits receive source/sampler index from w1."],
  [0x189bafc, "shared-type4-entry-writer", "writer-pack-value-offset-bits12-27", "33143d0c", "Entry header bits 12..27 receive the current value-table word offset."],
  [0x189bb14, "shared-type4-entry-writer", "writer-set-type4-bits", "3202018c", "Entry header type bits are set to 0x40000000 for type4 object-backed values."],
  [0x189bb28, "shared-type4-entry-writer", "writer-pack-direct-flag-bit31", "3301006c", "Entry header bit 31 receives the direct-value flag from w3."],
  [0x189bb3c, "shared-type4-entry-writer", "writer-store-source-key-hash", "b9000544", "Entry +0x4 stores source key hash or metadata word from w4."],
  [0x189bb44, "shared-type4-entry-writer", "writer-direct-value-load", "f940004a", "Direct values load the 64-bit object/value from pointer x2."],
  [0x189bb50, "shared-type4-entry-writer", "writer-direct-value-store", "f828692a", "Direct type4 value is stored into table +0x8 value array."],
  [0x189bb60, "shared-type4-entry-writer", "writer-indirect-value-store", "f8286922", "Indirect type4 value stores the x2 pointer into the value array."],
  [0x189bb70, "shared-type4-entry-writer", "writer-increment-entry-count", "79002109", "The source-table entry count is incremented after writing an entry."],
  [0x189bb7c, "shared-type4-entry-writer", "writer-increment-value-word-count-by-two", "11408129", "The value-word count advances by two 32-bit words for the 64-bit type4 value."],
  [0x189bb80, "shared-type4-entry-writer", "writer-store-packed-counts", "b9001109", "Updated packed counts are stored back to table +0x10."],

  [0x189bba0, "external-texture-type4-wrapper", "external-wrapper-source-key-arg", "2a0303e4", "External texture wrapper forwards w3 as the source key hash/metadata word."],
  [0x189bba4, "external-texture-type4-wrapper", "external-wrapper-direct-flag", "320003e3", "External texture wrapper forces direct-value flag to 1."],
  [0x189bbac, "external-texture-type4-wrapper", "external-wrapper-stack-value-store", "f90003e2", "External texture wrapper stores x2 into a stack value slot."],
  [0x189bbb0, "external-texture-type4-wrapper", "external-wrapper-value-pointer", "910003e2", "External texture wrapper passes the stack value slot as x2."],
  [0x189bbb4, "external-texture-type4-wrapper", "external-wrapper-call-shared-writer", "97ffffc6", "External texture wrapper calls the shared type4 entry writer."],

  [0x189bc10, "inline-texture-type4-wrapper", "inline-wrapper-key-null-gate", "b4000143", "Inline texture wrapper hashes x3 only when the key pointer is non-null."],
  [0x189bc30, "inline-texture-type4-wrapper", "inline-wrapper-hashed-key-result", "2a0003e4", "Inline texture wrapper uses the hashed key result as source key hash when present."],
  [0x189bc38, "inline-texture-type4-wrapper", "inline-wrapper-null-key-zero-hash", "2a1f03e4", "Inline texture wrapper uses zero source key hash when x3 is null."],
  [0x189bc40, "inline-texture-type4-wrapper", "inline-wrapper-direct-flag", "320003e3", "Inline texture wrapper forces direct-value flag to 1."],
  [0x189bc4c, "inline-texture-type4-wrapper", "inline-wrapper-stack-value-store", "f90003f5", "Inline texture wrapper stores x2 into a stack value slot."],
  [0x189bc50, "inline-texture-type4-wrapper", "inline-wrapper-call-shared-writer", "97ffff9f", "Inline texture wrapper calls the shared type4 entry writer."],

  [0x189cf30, "runtime-type4-value-patch", "patch-stack-object-store", "f90007e2", "Runtime patch stores x2 texture object pointer on stack as an 8-byte value."],
  [0x189cf38, "runtime-type4-value-patch", "patch-type4-mask-materialize", "320203e9", "Runtime patch materializes the type4 header mask 0x40000000."],
  [0x189cf44, "runtime-type4-value-patch", "patch-match-source-index-low12", "6b01017f", "Runtime patch matches entry low 12 source/sampler index against w1."],
  [0x189cf50, "runtime-type4-value-patch", "patch-match-type4-bits", "6b09017f", "Runtime patch requires header type bits to equal type4."],
  [0x189cf5c, "runtime-type4-value-patch", "patch-decode-value-offset", "530c6d4a", "Runtime patch decodes the value-table offset from header bits 12..27."],
  [0x189cf6c, "runtime-type4-value-patch", "patch-store-object-low-word", "b8004522", "Runtime patch writes the low 32 bits of x2 into the value table."],
  [0x189cf78, "runtime-type4-value-patch", "patch-store-object-high-word", "b828692b", "Runtime patch writes the high 32 bits of x2 into the value table."],
].map(([address, stage, role, expectedOpcodeHex, evidence]) => ({
  address,
  stage,
  role,
  expectedOpcodeHex,
  evidence,
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

function opcodeRowsForSpecs(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage: spec.stage,
      role: spec.role,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function rowsWithStage(rows, stage) {
  return rows.filter((row) => row.stage === stage);
}

function stageRecovered(rows, stage) {
  const stageRows = rowsWithStage(rows, stage);
  return stageRows.length > 0 && stageRows.every((row) => row.opcodeMatches);
}

function buildCurrentNativeShaderDataType4EntrySemanticsAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRowsForSpecs(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const sharedType4EntryWriterRecovered = stageRecovered(rows, "shared-type4-entry-writer");
  const externalTextureType4WrapperRecovered = stageRecovered(rows, "external-texture-type4-wrapper");
  const inlineTextureType4WrapperRecovered = stageRecovered(rows, "inline-texture-type4-wrapper");
  const runtimeType4ValuePatchRecovered = stageRecovered(rows, "runtime-type4-value-patch");
  const type4EntrySemanticsRecovered =
    sharedType4EntryWriterRecovered &&
    externalTextureType4WrapperRecovered &&
    inlineTextureType4WrapperRecovered &&
    runtimeType4ValuePatchRecovered;
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    sharedType4EntryWriterRows: rowsWithStage(rows, "shared-type4-entry-writer").length,
    externalTextureType4WrapperRows: rowsWithStage(rows, "external-texture-type4-wrapper").length,
    inlineTextureType4WrapperRows: rowsWithStage(rows, "inline-texture-type4-wrapper").length,
    runtimeType4ValuePatchRows: rowsWithStage(rows, "runtime-type4-value-patch").length,
    sharedType4EntryWriterRecovered,
    externalTextureType4WrapperRecovered,
    inlineTextureType4WrapperRecovered,
    runtimeType4ValuePatchRecovered,
    type4EntrySemanticsRecovered,
    type4HeaderMaskHex: "0x40000000",
    directValueFlagBit: 31,
    sourceIndexBits: "0..11",
    valueOffsetBits: "12..27",
    typeBits: "28..30",
    type4ValueWordCount: 2,
    runtimePatchMatchesSourceIndexAndType4: runtimeType4ValuePatchRecovered,
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only shaderData type4 entry semantics audit; proves source-table object entry shape without enabling material takeover",
    summary,
    interpretation: {
      recovered:
        "The current Android shared type4 writer packs source index, value offset, type4 bits, direct flag, source key hash, and a 64-bit value into the source/program table. External and inline texture wrappers both route through this writer. Runtime patch 0x189cf2c later finds entries by source index plus type4 bits and replaces the two value words with the resolved texture object pointer.",
      boundary:
        "This recovers type4 source-table mechanics only. It does not prove which shadergraph sampler owns which texData object, does not import live source/program values, and does not recover the final shader texture formula.",
    },
    items: rows,
  };
}

function exportCurrentNativeShaderDataType4EntrySemanticsAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderDataType4EntrySemanticsAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "stage",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeShaderDataType4EntrySemanticsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderDataType4EntrySemanticsAudit,
  exportCurrentNativeShaderDataType4EntrySemanticsAudit,
};
