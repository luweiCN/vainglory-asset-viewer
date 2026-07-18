#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultTexDataTextureObjectPath = "extracted/viewer/current-native-texdata-texture-object-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderdata-texture-sampler-table-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderdata_texture_sampler_table_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderdata_texture_sampler_table_audit.tsv";

const opcodeSpecs = [
  [0x18a00b0, "pass-section-counts", "pass-header-first-section-count", "394093e3", "shaderData parser reads pass header byte +0x14 as the first source-table section count."],
  [0x18a00b4, "pass-section-counts", "pass-header-texture-section-count", "394097e4", "shaderData parser reads pass header byte +0x15 as the external texture-record section count."],
  [0x18a00b8, "pass-section-counts", "pass-header-inline-texture-section-count", "39409be5", "shaderData parser reads pass header byte +0x16 as the inline texture-record section count."],
  [0x18a00bc, "pass-section-counts", "pass-header-resource-section-count", "39409fe6", "shaderData parser reads pass header byte +0x17 as the semantic/resource parameter section count."],
  [0x18a023c, "pass-section-counts", "texture-section-count-gate", "340009d7", "The external texture-record loop is skipped only when the texture section count is zero."],
  [0x18a0374, "pass-section-counts", "inline-texture-section-count-gate", "340004f6", "The inline texture-record loop is skipped only when the inline texture section count is zero."],
  [0x18a0410, "pass-section-counts", "resource-section-count-gate", "34000875", "The semantic/resource parameter loop is skipped only when the fourth section count is zero."],
  [0x18a0524, "pass-section-counts", "source-parameter-table-store", "f90ef280", "The finalized source/parameter table is stored to shaderData record +0x1de0 after all four sections are parsed."],

  [0x18a6f6c, "texture-record-parser", "texture-record-hash-pointer-store", "b4000041", "0x18a6f6c begins the 40-byte external texture record parser and can return the record hash/string pointer."],
  [0x18a6f78, "texture-record-parser", "texture-record-unit-load", "39408408", "The external texture record stores sampler unit at record +0x21."],
  [0x18a6f84, "texture-record-parser", "texture-record-low-nibble-load", "39408808", "The external texture record stores low sampler/state nibble in record +0x22."],
  [0x18a6f94, "texture-record-parser", "texture-record-high-nibble-load", "39408808", "The external texture record stores high sampler/state nibble in record +0x22."],
  [0x18a6fa4, "texture-record-parser", "texture-record-flags-load", "39408c08", "The external texture record stores an additional sampler/state byte at record +0x23."],
  [0x18a6fb0, "texture-record-parser", "texture-record-metadata-load", "b9402408", "The external texture record stores a 32-bit metadata/key word at record +0x24."],
  [0x18a6fb8, "texture-record-parser", "texture-record-size-return", "52800500", "The external texture record parser returns 0x28 bytes, matching the native TCH0 texture record size."],

  [0x18a0240, "texture-record-consumer", "texture-resource-list-base", "91002308", "The texture section appends resource records under the parser owner object at +0x8."],
  [0x18a0270, "texture-record-consumer", "texture-record-parser-call", "94001b3f", "Each external texture record is parsed through 0x18a6f6c."],
  [0x18a02a8, "texture-record-consumer", "texture-resource-count-load", "b940031c", "The parser reads the texture-resource record count from the owner object before appending a 0x41-byte record."],
  [0x18a02b8, "texture-record-consumer", "texture-resource-record-stride-65", "8b1c1b88", "The parser computes texture-resource record offsets with a 65-byte stride."],
  [0x18a02dc, "texture-record-consumer", "texture-resource-key-copy-call", "97d33527", "The texture hash/key is copied into the owner resource record."],
  [0x18a030c, "texture-record-consumer", "shaderdata-texture-binding-count-load", "b9400a9c", "The shaderData record reads its external texture binding count at +0x8."],
  [0x18a0310, "texture-record-consumer", "shaderdata-texture-binding-record-stride-84", "52800a88", "External texture binding records use an 0x54-byte stride under shaderData +0x10."],
  [0x18a0320, "texture-record-consumer", "shaderdata-texture-binding-count-increment", "11000788", "The shaderData external texture binding count is incremented for each parsed texture record."],
  [0x18a0338, "texture-record-consumer", "shaderdata-texture-unit-load", "3940d3e1", "The parsed sampler unit is reloaded before writing the shaderData binding record and source-table entry."],
  [0x18a0344, "texture-record-consumer", "shaderdata-texture-unit-store", "b9000361", "The sampler unit is stored at the start of the shaderData external texture binding record."],
  [0x18a0348, "texture-record-consumer", "shaderdata-texture-low-nibble-store", "3940c3e8", "The low sampler/state nibble is copied into the shaderData binding record."],
  [0x18a0350, "texture-record-consumer", "shaderdata-texture-high-nibble-store", "3940b3e8", "The high sampler/state nibble is copied into the shaderData binding record."],
  [0x18a0358, "texture-record-consumer", "shaderdata-texture-flags-store", "3940a3e8", "The sampler/state flags byte is copied into the shaderData binding record."],
  [0x18a0360, "texture-record-consumer", "shaderdata-texture-metadata-load", "b94027e3", "The 32-bit texture metadata/key word is loaded for both the binding record and type4 source-table entry."],
  [0x18a0364, "texture-record-consumer", "shaderdata-texture-metadata-store", "b9004763", "The texture metadata/key word is stored in the shaderData external texture binding record at +0x44."],
  [0x18a0368, "texture-record-consumer", "texture-type4-placeholder-entry-call", "97ffee08", "The external texture record writes a type4 source-table entry through 0x189bb88 using the sampler unit and texture metadata/key."],

  [0x18a6fec, "inline-texture-record-parser", "inline-texture-payload-copy-size", "321807e2", "0x18a6fc0 copies a 0x300-byte inline texture payload before reading sampler/state bytes."],
  [0x18a6ff8, "inline-texture-record-parser", "inline-texture-payload-copy-call", "97bba63a", "The inline texture parser copies the 0x300-byte payload through memmove."],
  [0x18a7000, "inline-texture-record-parser", "inline-texture-unit-load", "394c0288", "The inline texture record stores sampler unit at record +0x300."],
  [0x18a700c, "inline-texture-record-parser", "inline-texture-flags0-load", "394c0688", "The inline texture record stores sampler/state byte at record +0x301."],
  [0x18a7018, "inline-texture-record-parser", "inline-texture-flags0-high-load", "394c0688", "The inline texture parser also derives the high nibble of record +0x301."],
  [0x18a7028, "inline-texture-record-parser", "inline-texture-flags1-load", "394c0a88", "The inline texture record stores an additional sampler/state byte at record +0x302."],
  [0x18a703c, "inline-texture-record-parser", "inline-texture-record-size-return", "52806060", "The inline texture parser returns 0x303 bytes, matching the native inline texture record size."],

  [0x18a0378, "inline-texture-record-consumer", "shaderdata-inline-texture-record-base", "91156299", "Inline texture records are stored under shaderData +0x558."],
  [0x18a037c, "inline-texture-record-consumer", "shaderdata-inline-texture-record-stride-784", "5280621a", "Inline texture binding records use an 0x310-byte stride."],
  [0x18a0398, "inline-texture-record-consumer", "inline-texture-parser-call", "94001b0a", "Each inline texture record is parsed through 0x18a6fc0."],
  [0x18a039c, "inline-texture-record-consumer", "shaderdata-inline-texture-count-load", "b9455298", "The shaderData inline texture count is read at +0x550."],
  [0x18a03a4, "inline-texture-record-consumer", "shaderdata-inline-texture-clear-size", "52806182", "The inline texture record tail is cleared with size 0x30c after its leading unit word."],
  [0x18a03d4, "inline-texture-record-consumer", "shaderdata-inline-texture-unit-store", "b9000378", "The inline texture sampler unit is stored in the shaderData inline texture binding record."],
  [0x18a03dc, "inline-texture-record-consumer", "shaderdata-inline-texture-flags0-store", "b9030768", "Inline texture sampler/state byte 0 is stored at record +0x304."],
  [0x18a03e4, "inline-texture-record-consumer", "shaderdata-inline-texture-flags0-high-store", "b9030b68", "Inline texture sampler/state high nibble is stored at record +0x308."],
  [0x18a03ec, "inline-texture-record-consumer", "shaderdata-inline-texture-flags1-store", "b9030f68", "Inline texture sampler/state byte 1 is stored at record +0x30c."],
  [0x18a03f0, "inline-texture-record-consumer", "shaderdata-inline-texture-payload-copy", "97bbcdd0", "The 0x300-byte inline texture payload is copied into the shaderData inline binding record."],
  [0x18a0404, "inline-texture-record-consumer", "inline-texture-type4-placeholder-entry-call", "97ffedf6", "The inline texture record writes a type4 source-table entry through 0x189bbdc using the sampler unit."],

  [0x18a4fa4, "compiled-sampler-unit-table", "compiled-sampler-vertex-shader-offset", "79400428", "The compiled sampler table reads vertex shader text offset from table +0x2."],
  [0x18a4fa8, "compiled-sampler-unit-table", "compiled-sampler-fragment-shader-offset", "79400829", "The compiled sampler table reads fragment shader text offset from table +0x4."],
  [0x18a4fac, "compiled-sampler-unit-table", "compiled-sampler-binding-count", "39400437", "The compiled sampler table reads binding-record count from table +0x1."],
  [0x18a4fb0, "compiled-sampler-unit-table", "compiled-sampler-count", "39400038", "The compiled sampler table reads sampler-record count from table +0x0."],
  [0x18a4fb4, "compiled-sampler-unit-table", "compiled-sampler-record-base", "91001834", "Sampler records start at table +0x6."],
  [0x18a4fe4, "compiled-sampler-unit-table", "compiled-sampler-record-unit-and-stride", "38411696", "Each compiled sampler record starts with a sampler unit and advances by 0x11 bytes."],
  [0x18a4fe8, "compiled-sampler-unit-table", "compiled-sampler-uniform-location-call", "97bbc9ea", "The sampler name at record +0x1 is used with glGetUniformLocation."],
  [0x18a4ff0, "compiled-sampler-unit-table", "compiled-sampler-uniform-unit-call", "97bbcf20", "The compiled sampler unit is assigned to the sampler uniform through glUniform1i."],
  [0x18a5000, "compiled-sampler-unit-table", "compiled-binding-table-stride-16", "d37ceef5", "Compiled binding records use a 16-byte stride."],
  [0x18a500c, "compiled-sampler-unit-table", "compiled-binding-table-pointer-store", "f9000e60", "The compiled binding table copy is stored on the GL program object at +0x18."],
  [0x18a5010, "compiled-sampler-unit-table", "compiled-binding-table-count-store", "b9002277", "The compiled binding table count is stored on the GL program object at +0x20."],
  [0x18a5030, "compiled-sampler-unit-table", "compiled-binding-table-copy-tailcall", "17bbbac0", "The compiled binding table is copied after sampler uniforms are assigned."],
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

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
      address: spec.address,
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

function buildCurrentNativeShaderDataTextureSamplerTableAudit(
  {
    binaryPath = defaultBinary,
    texDataTextureObjectPath = defaultTexDataTextureObjectPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRowsForSpecs(buffer, elf);
  const texDataTextureObjectAudit = readJson(texDataTextureObjectPath, { summary: {} });
  const texDataTextureObjectSummary = texDataTextureObjectAudit.summary || {};
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const passSectionCountRows = rowsWithStage(rows, "pass-section-counts").length;
  const textureRecordParserRows = rowsWithStage(rows, "texture-record-parser").length;
  const textureRecordConsumerRows = rowsWithStage(rows, "texture-record-consumer").length;
  const inlineTextureRecordParserRows = rowsWithStage(rows, "inline-texture-record-parser").length;
  const inlineTextureRecordConsumerRows = rowsWithStage(rows, "inline-texture-record-consumer").length;
  const compiledSamplerUnitTableRows = rowsWithStage(rows, "compiled-sampler-unit-table").length;
  const passSectionCountsRecovered = stageRecovered(rows, "pass-section-counts");
  const textureRecordParserRecovered = stageRecovered(rows, "texture-record-parser");
  const textureRecordConsumerRecovered = stageRecovered(rows, "texture-record-consumer");
  const inlineTextureRecordParserRecovered = stageRecovered(rows, "inline-texture-record-parser");
  const inlineTextureRecordConsumerRecovered = stageRecovered(rows, "inline-texture-record-consumer");
  const compiledSamplerUnitTableRecovered = stageRecovered(rows, "compiled-sampler-unit-table");
  const shaderDataTextureSamplerStaticUnitLayoutRecovered =
    passSectionCountsRecovered &&
    textureRecordParserRecovered &&
    textureRecordConsumerRecovered &&
    inlineTextureRecordParserRecovered &&
    inlineTextureRecordConsumerRecovered &&
    compiledSamplerUnitTableRecovered;
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    passSectionCountRows,
    textureRecordParserRows,
    textureRecordConsumerRows,
    inlineTextureRecordParserRows,
    inlineTextureRecordConsumerRows,
    compiledSamplerUnitTableRows,
    passSectionCountsRecovered,
    textureRecordParserRecovered,
    textureRecordConsumerRecovered,
    inlineTextureRecordParserRecovered,
    inlineTextureRecordConsumerRecovered,
    compiledSamplerUnitTableRecovered,
    shaderDataTextureSamplerStaticUnitLayoutRecovered,
    externalTextureRecordSize: 0x28,
    inlineTextureRecordSize: 0x303,
    compiledSamplerRecordSize: 0x11,
    compiledBindingRecordSize: 0x10,
    textureRecordsProduceType4Placeholders: textureRecordConsumerRecovered && inlineTextureRecordConsumerRecovered,
    texDataToGlTextureObjectChainRecovered: Boolean(texDataTextureObjectSummary.texDataToGlTextureObjectChainRecovered),
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    texDataTextureObjectPath,
    policy:
      "diagnostic-only shaderData texture/sampler table audit; proves static sampler-unit layout without enabling material texture object takeover",
    summary,
    interpretation: {
      recovered:
        "The current Android shaderData parser reads TCH0 pass header count bytes, parses external 0x28 texture records and inline 0x303 texture records, stores their sampler unit/state metadata into shaderData binding records, writes type4 source-table placeholder entries, and the compiled sampler table assigns sampler uniform names to the same units through glUniform1i.",
      boundary:
        "This proves the static sampler-unit layout and the parse-time source-table placeholder shape. It still does not prove when a concrete texData runtime wrapper is patched into each sampler's type4 value slot for a submitted material.",
      nextRequiredEvidence:
        "Trace the texture record metadata/key or shaderData binding record into the runtime resource request/cache that returns a concrete texData wrapper, then join that wrapper to the type4 source-table value used by 0x189ca10.",
    },
    items: rows,
  };
}

function exportCurrentNativeShaderDataTextureSamplerTableAudit({
  binaryPath = defaultBinary,
  texDataTextureObjectPath = defaultTexDataTextureObjectPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderDataTextureSamplerTableAudit({ binaryPath, texDataTextureObjectPath });
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
  const summary = exportCurrentNativeShaderDataTextureSamplerTableAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    texDataTextureObjectPath: optionValue(args, "--texdata-texture-object", defaultTexDataTextureObjectPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderDataTextureSamplerTableAudit,
  exportCurrentNativeShaderDataTextureSamplerTableAudit,
};
