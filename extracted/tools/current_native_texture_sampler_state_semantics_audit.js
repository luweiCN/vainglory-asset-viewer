#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-texture-sampler-state-semantics-audit.json";
const defaultJsonOut = "extracted/reports/current_native_texture_sampler_state_semantics_audit.json";
const defaultTsvOut = "extracted/reports/current_native_texture_sampler_state_semantics_audit.tsv";

const opcodeSpecs = [
  [0x18a5d70, "sampler-state-pack-wrap", "wrap-state-record-load", "f840c008", "Wrap/state helper reads texture record qword at record +0xc."],
  [0x18a5d7c, "sampler-state-pack-wrap", "wrap-t-bit-shift-34", "d35e754a", "Wrap T uses a 2-bit field shifted into texture record state bits 34..35."],
  [0x18a5d84, "sampler-state-pack-wrap", "wrap-s-bit-pack-32", "b360052a", "Wrap S uses a 2-bit field packed into texture record state bits 32..33."],
  [0x18a5d8c, "sampler-state-pack-wrap", "wrap-r-bit-pack-36", "b35c056a", "Wrap R/extra uses bits 36..37 even though the final 2D binder only consumes S/T."],
  [0x18a5d94, "sampler-state-pack-wrap", "wrap-state-dirty-bit-set", "b2570108", "The helper sets dirty bit 41 so the final binder refreshes sampler state."],
  [0x18a5d98, "sampler-state-pack-wrap", "wrap-state-record-store", "f800c008", "Packed wrap/state bits are written back to record +0xc."],

  [0x18a5da0, "sampler-state-pack-filter", "filter-state-record-load", "f840c008", "Filter/state helper reads texture record qword at record +0xc."],
  [0x18a5dac, "sampler-state-pack-filter", "min-filter-mipmap-bit-shift-39", "d359614a", "Filter argument w2 is shifted into bit 39 for the mag-filter table later."],
  [0x18a5db4, "sampler-state-pack-filter", "min-filter-bit-pack-38", "b35a012a", "Filter argument w1 is packed into bit 38 for min-filter selection."],
  [0x18a5dbc, "sampler-state-pack-filter", "min-filter-mipmap-extra-bit-pack-40", "b358016a", "Filter argument w3 is packed into bit 40 for mipmap min-filter selection."],
  [0x18a5dc4, "sampler-state-pack-filter", "filter-state-dirty-bit-set", "b2570108", "The helper sets dirty bit 41 so the final binder refreshes sampler state."],
  [0x18a5dc8, "sampler-state-pack-filter", "filter-state-record-store", "f800c008", "Packed filter/state bits are written back to record +0xc."],

  [0xe07ea0, "texture-record-binder-sampler-state", "binder-state-qword-load", "f840c268", "Final texture binder reads texture record state qword from record +0xc."],
  [0xe07ea4, "texture-record-binder-sampler-state", "binder-dirty-bit-gate", "b64805a8", "Final texture binder only refreshes sampler state when dirty bit 41 is set."],
  [0xe07eac, "texture-record-binder-sampler-state", "binder-target-texture-2d-check", "7137853f", "Wrap S/T refresh is gated to GL_TEXTURE_2D target 0x0de1."],
  [0xe07eb8, "texture-record-binder-sampler-state", "binder-wrap-s-index-bits32", "d3608508", "Wrap S index is extracted from state bits 32..33."],
  [0xe07ec8, "texture-record-binder-sampler-state", "binder-wrap-s-param", "52850041", "Wrap S uses GL_TEXTURE_WRAP_S 0x2802."],
  [0xe07ecc, "texture-record-binder-sampler-state", "binder-wrap-s-gl-call", "97e63731", "Wrap S is applied through glTexParameteri."],
  [0xe07ed8, "texture-record-binder-sampler-state", "binder-wrap-t-param", "52850061", "Wrap T uses GL_TEXTURE_WRAP_T 0x2803."],
  [0xe07edc, "texture-record-binder-sampler-state", "binder-wrap-t-index-bits34", "d3628d08", "Wrap T index is extracted from state bits 34..35."],
  [0xe07ee4, "texture-record-binder-sampler-state", "binder-wrap-t-gl-call", "97e6372b", "Wrap T is applied through glTexParameteri."],
  [0xe07eec, "texture-record-binder-sampler-state", "binder-mipmap-mode-test", "f263091f", "Min-filter selection checks mipmap-related state bits 29..31."],
  [0xe07ef0, "texture-record-binder-sampler-state", "binder-min-filter-bit38", "d3669909", "Min-filter low index bit comes from state bit 38."],
  [0xe07f00, "texture-record-binder-sampler-state", "binder-min-filter-bit40", "d368a108", "Mipmap min-filter high index bit comes from state bit 40."],
  [0xe07f24, "texture-record-binder-sampler-state", "binder-min-filter-param", "52850021", "Min filter uses GL_TEXTURE_MIN_FILTER 0x2801."],
  [0xe07f28, "texture-record-binder-sampler-state", "binder-min-filter-gl-call", "97e6371a", "Min filter is applied through glTexParameteri."],
  [0xe07f3c, "texture-record-binder-sampler-state", "binder-mag-filter-bit39", "d3679d08", "Mag-filter index comes from state bit 39."],
  [0xe07f44, "texture-record-binder-sampler-state", "binder-mag-filter-param", "52850001", "Mag filter uses GL_TEXTURE_MAG_FILTER 0x2800."],
  [0xe07f48, "texture-record-binder-sampler-state", "binder-mag-filter-gl-call", "97e63712", "Mag filter is applied through glTexParameteri."],
  [0xe07f50, "texture-record-binder-sampler-state", "binder-dirty-bit-clear", "9256f908", "Final binder clears dirty bit 41 after applying sampler state."],
].map(([address, stage, role, expectedOpcodeHex, evidence]) => ({
  address,
  stage,
  role,
  expectedOpcodeHex,
  evidence,
}));

const tableSpecs = [
  [0x1af8da0, "wrap-mode-table", 0, 0x812f, "GL_CLAMP_TO_EDGE"],
  [0x1af8da4, "wrap-mode-table", 1, 0x2901, "GL_REPEAT"],
  [0x1af8da8, "wrap-mode-table", 2, 0x8370, "GL_MIRRORED_REPEAT"],
  [0x1af8dac, "wrap-mode-table", 3, 0x1401, "reserved/adjacent GL_UNSIGNED_BYTE value; do not infer wrap mode 3 without runtime data"],
  [0x1af8d58, "mipmap-min-filter-table", 0, 0x2700, "GL_NEAREST_MIPMAP_NEAREST"],
  [0x1af8d5c, "mipmap-min-filter-table", 1, 0x2702, "GL_NEAREST_MIPMAP_LINEAR"],
  [0x1af8d60, "mipmap-min-filter-table", 2, 0x2701, "GL_LINEAR_MIPMAP_NEAREST"],
  [0x1af8d64, "mipmap-min-filter-table", 3, 0x2703, "GL_LINEAR_MIPMAP_LINEAR"],
  [0x1af8dc8, "nearest-linear-filter-table", 0, 0x2600, "GL_NEAREST"],
  [0x1af8dcc, "nearest-linear-filter-table", 1, 0x2601, "GL_LINEAR"],
].map(([address, stage, index, expectedValue, meaning]) => ({
  address,
  stage,
  index,
  expectedValue,
  meaning,
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
      kind: "opcode",
      stage: spec.stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      index: "",
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      expectedValueHex: "",
      actualValueHex: "",
      valueMatches: "",
      meaning: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function tableRowsForSpecs(buffer, elf) {
  return tableSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualValue = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
    return {
      kind: "table",
      stage: spec.stage,
      role: `${spec.stage}-${spec.index}`,
      address: spec.address,
      addressHex: hex(spec.address),
      index: spec.index,
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      expectedValueHex: hex(spec.expectedValue),
      actualValueHex: hex(actualValue),
      valueMatches: actualValue === spec.expectedValue,
      meaning: spec.meaning,
      evidence: `${spec.stage} index ${spec.index} resolves to ${spec.meaning}.`,
      renderPromotionAllowed: false,
    };
  });
}

function rowsWithStage(rows, stage) {
  return rows.filter((row) => row.stage === stage);
}

function stageRecovered(rows, stage, matchKey) {
  const stageRows = rowsWithStage(rows, stage);
  return stageRows.length > 0 && stageRows.every((row) => row[matchKey]);
}

function buildCurrentNativeTextureSamplerStateSemanticsAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeRows = opcodeRowsForSpecs(buffer, elf);
  const tableRows = tableRowsForSpecs(buffer, elf);
  const rows = [...opcodeRows, ...tableRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const tableMismatchRows = tableRows.filter((row) => !row.valueMatches).length;
  const wrapStatePackingRecovered = stageRecovered(opcodeRows, "sampler-state-pack-wrap", "opcodeMatches");
  const filterStatePackingRecovered = stageRecovered(opcodeRows, "sampler-state-pack-filter", "opcodeMatches");
  const textureRecordBinderSamplerStateRecovered = stageRecovered(
    opcodeRows,
    "texture-record-binder-sampler-state",
    "opcodeMatches",
  );
  const wrapModeTableRecovered = stageRecovered(tableRows, "wrap-mode-table", "valueMatches");
  const mipmapMinFilterTableRecovered = stageRecovered(tableRows, "mipmap-min-filter-table", "valueMatches");
  const nearestLinearFilterTableRecovered = stageRecovered(tableRows, "nearest-linear-filter-table", "valueMatches");
  const textureSamplerStateFormulaRecovered =
    wrapStatePackingRecovered &&
    filterStatePackingRecovered &&
    textureRecordBinderSamplerStateRecovered &&
    wrapModeTableRecovered &&
    mipmapMinFilterTableRecovered &&
    nearestLinearFilterTableRecovered;
  const wrapReservedTableRows = tableRows.filter(
    (row) => row.stage === "wrap-mode-table" && !/^GL_(CLAMP_TO_EDGE|REPEAT|MIRRORED_REPEAT)$/.test(row.meaning),
  ).length;
  const summary = {
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    tableRows: tableRows.length,
    tableMismatchRows,
    wrapStatePackingRows: rowsWithStage(opcodeRows, "sampler-state-pack-wrap").length,
    filterStatePackingRows: rowsWithStage(opcodeRows, "sampler-state-pack-filter").length,
    textureRecordBinderSamplerStateRows: rowsWithStage(opcodeRows, "texture-record-binder-sampler-state").length,
    wrapModeTableRows: rowsWithStage(tableRows, "wrap-mode-table").length,
    mipmapMinFilterTableRows: rowsWithStage(tableRows, "mipmap-min-filter-table").length,
    nearestLinearFilterTableRows: rowsWithStage(tableRows, "nearest-linear-filter-table").length,
    wrapStatePackingRecovered,
    filterStatePackingRecovered,
    textureRecordBinderSamplerStateRecovered,
    wrapModeTableRecovered,
    mipmapMinFilterTableRecovered,
    nearestLinearFilterTableRecovered,
    textureSamplerStateFormulaRecovered,
    textureSamplerDirtyBit: 41,
    textureSamplerDirtyBitMaskHex: "0x20000000000",
    wrapStateBits: "S:32..33,T:34..35,R/extra:36..37",
    minFilterStateBits: "bit38 plus optional mipmap bit40",
    magFilterStateBits: "bit39",
    wrapReservedTableRows,
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only texture sampler state semantics audit; proves sampler state bit packing and GL parameter tables without enabling material takeover",
    summary,
    interpretation: {
      recovered:
        "The current Android runtime packs texture wrap bits into record +0xc bits 32..37, filter bits into bits 38..40, marks dirty bit 41, and the final texture binder decodes those bits into GL_TEXTURE_WRAP_S/T, GL_TEXTURE_MIN_FILTER, and GL_TEXTURE_MAG_FILTER glTexParameteri calls.",
      boundary:
        "This proves sampler state semantics only. It does not prove which shadergraph sampler owns which texData object, the submitted material's texture formula, or a safe viewer render-promotion rule.",
      reserved:
        "Wrap table index 3 resolves to 0x1401 in the current table range. Treat it as reserved/adjacent data until a live runtime capture proves that mode is used intentionally.",
    },
    items: rows,
  };
}

function exportCurrentNativeTextureSamplerStateSemanticsAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeTextureSamplerStateSemanticsAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "kind",
    "stage",
    "role",
    "addressHex",
    "index",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "expectedValueHex",
    "actualValueHex",
    "valueMatches",
    "meaning",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeTextureSamplerStateSemanticsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeTextureSamplerStateSemanticsAudit,
  exportCurrentNativeTextureSamplerStateSemanticsAudit,
};
