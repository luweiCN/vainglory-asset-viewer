#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultShaderDataType4Path = "extracted/viewer/current-native-shaderdata-type4-value-source-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-texdata-texture-object-audit.json";
const defaultJsonOut = "extracted/reports/current_native_texdata_texture_object_audit.json";
const defaultTsvOut = "extracted/reports/current_native_texdata_texture_object_audit.tsv";

const opcodeSpecs = [
  [0xe02424, "texdata-handler", "texdata-handler-vtable-and-owner-store", "a9000408", "texData handler constructor stores primary vtable 0x272a7e0 and owner/resource-factory pointer."],
  [0xe0242c, "texdata-handler", "texdata-handler-name-entry", "d00067a0", "texData handler name function starts by loading the page for the texData resource name."],
  [0xe02438, "texdata-handler", "texdata-handler-process-entry", "d10203ff", "texData handler process function is current-package code, not a guessed resource path."],
  [0xe025bc, "texdata-handler", "texdata-handler-owner-factory-load", "f94006a2", "texData handler process loads handler owner/resource-factory from handler +0x8 before building the texture wrapper."],
  [0xe025cc, "texdata-handler", "texdata-handler-texture-wrapper-builder-call", "942a7107", "texData handler process calls 0x189e9e8 to build or fetch the texture runtime wrapper."],
  [0xe02620, "texdata-handler", "texdata-handler-request-result-store", "94009906", "texData handler process stores the returned texture wrapper back on the resource request."],
  [0x189ea10, "texture-wrapper-builder", "texture-wrapper-alloc-size", "321d0be0", "0x189e9e8 allocates a 0x38-byte texture wrapper object."],
  [0x189ea34, "texture-wrapper-builder", "texture-wrapper-vtable-page", "f00090a8", "texture wrapper builder loads the 0x2ab53a0 vtable family page."],
  [0x189ea4c, "texture-wrapper-builder", "texture-wrapper-primary-vtable-store", "f9000269", "texture wrapper builder stores primary addresspoint 0x2ab53b0 at object +0."],
  [0x189ea50, "texture-wrapper-builder", "texture-wrapper-secondary-vtable-store", "f8010f48", "texture wrapper builder stores secondary addresspoint 0x2ab53d0 at object +0x10."],
  [0x189ea54, "texture-wrapper-builder", "texture-wrapper-request-and-factory-store", "a901da77", "texture wrapper builder stores request/source pointer and owner factory at object +0x18/+0x20."],
  [0x189ea58, "texture-wrapper-builder", "texture-wrapper-resource-hash-store", "b9002a78", "texture wrapper builder stores the hashed resource key at object +0x28."],
  [0x189eef4, "texdata-payload-parser", "texdata-payload-object-alloc-size", "52803500", "texData payload loader allocates a 0x1a8-byte parser/record object before decoding texture metadata."],
  [0x189ef64, "texdata-payload-parser", "texdata-header-copy-call", "940020c9", "texData payload loader calls 0x18a7288 to copy header fields and compute image record storage size."],
  [0x189ef70, "texdata-payload-parser", "texdata-payload-record-parse-call", "94001dc3", "texData payload loader calls 0x18a667c to decode the texture image records into the runtime object."],
  [0x189ef78, "texdata-payload-parser", "texdata-width-field-load", "b94192c9", "texData payload loader reads decoded width/count metadata from texture object +0x190."],
  [0x189ef7c, "texdata-payload-parser", "texdata-format-field-load", "b941a6ca", "texData payload loader reads decoded format/class metadata from texture object +0x1a4."],
  [0x189efe4, "texdata-payload-parser", "texdata-format-conversion-call", "97fffefb", "texData payload loader conditionally calls 0x189ebd0 for decoded format conversion before storing converted data at wrapper +0x20."],
  [0x189f008, "texdata-payload-parser", "texdata-sampler-record-insert-call", "94000010", "texData payload loader inserts decoded 12-byte sampler/state records through 0x189f048."],
  [0x18a5714, "texture-gl-upload", "texture-record-gl-gen-entry", "d100c3ff", "texture record upload helper begins the glGenTextures path."],
  [0x18a5740, "texture-gl-upload", "texture-record-gl-gen-call", "97bbb338", "texture record upload helper calls glGenTextures."],
  [0x18a5748, "texture-gl-upload", "texture-record-object-id-store", "b9000268", "texture record upload helper stores the generated GL texture id at texture record +0."],
  [0x18a5884, "texture-gl-upload", "texture-upload-active-texture-reset-call", "52909800", "texture upload path resets active texture to GL_TEXTURE0 when cached texture units overflow."],
  [0x18a58b4, "texture-gl-upload", "texture-upload-bind-call", "97bbba3f", "texture upload path binds the texture record before uploading image data."],
  [0x18a5aa4, "texture-gl-upload", "texture-upload-compressed-image-call", "97bbb297", "texture upload path calls glCompressedTexImage2D for compressed formats."],
  [0x18a5af4, "texture-gl-upload", "texture-upload-image-call", "97bbce3f", "texture upload path calls glTexImage2D for decoded image data."],
  [0x18a5c10, "texture-gl-upload", "texture-upload-mip-image-call", "97bbcdf8", "texture upload path calls glTexImage2D for mip levels."],
  [0x18a5d34, "texture-gl-upload", "texture-empty-compressed-image-call", "17bbb1f3", "empty texture allocation path can call glCompressedTexImage2D for compressed formats."],
  [0x18a5d58, "texture-gl-upload", "texture-empty-image-call", "97bbcda6", "empty texture allocation path can call glTexImage2D for uncompressed formats."],
  [0x189d8d4, "texture-object-apply", "texture-object-state-kind-load", "b9402408", "draw-time texture object wrapper reads object +0x24 before applying sampler state."],
  [0x189d8f4, "texture-object-apply", "texture-object-record-pointer-add", "9100c2d4", "draw-time texture object wrapper derives the texture record pointer as object +0x30."],
  [0x189d984, "texture-object-apply", "texture-object-binder-tailcall", "17d5a91d", "draw-time texture object wrapper tail-calls the final texture record binder 0xe07df8."],
  [0xe07e5c, "texture-object-apply", "texture-record-active-unit-call", "97e62115", "final texture record binder calls glActiveTexture with GL_TEXTURE0 + sampler unit."],
  [0xe07e9c, "texture-object-apply", "texture-record-bind-call", "97e630c5", "final texture record binder calls glBindTexture with the record target and object id."],
].map(([address, stage, role, expectedOpcodeHex, evidence]) => ({
  address,
  stage,
  role,
  expectedOpcodeHex,
  evidence,
}));

const pointerSpecs = [
  [0x272a7f8, "texdata-handler-process-vtable-slot", 0xe02438, "texData handler vtable +0x18 points to process function 0xe02438."],
  [0x2ab53b0, "texture-wrapper-primary-slot-0", 0x189f1f8, "texture wrapper primary addresspoint has current-package method slot at 0x189f1f8."],
  [0x2ab53b8, "texture-wrapper-primary-slot-8", 0x189f1fc, "texture wrapper primary addresspoint has current-package method slot at 0x189f1fc."],
  [0x2ab53d0, "texture-wrapper-secondary-slot-0", 0x189f220, "texture wrapper secondary addresspoint points to 0x189f220."],
  [0x2ab53d8, "texture-wrapper-secondary-slot-8", 0x189f228, "texture wrapper secondary addresspoint points to 0x189f228."],
  [0x2ab53f0, "texdata-runtime-record-primary-slot-0", 0xd7d640, "texData runtime record primary addresspoint has the shared retain/release style method at 0xd7d640."],
  [0x2ab53f8, "texdata-runtime-record-primary-slot-8", 0x189f25c, "texData runtime record primary addresspoint has current-package method slot at 0x189f25c."],
].map(([address, role, expectedPointer, evidence]) => ({
  address,
  stage: "native-vtable-pointer",
  role,
  expectedPointer,
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
      expectedPointerHex: "",
      actualPointerHex: "",
      pointerMatches: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function pointerRowsForSpecs(buffer, elf) {
  return pointerSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 8);
    const actualPointer = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : null;
    return {
      stage: spec.stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      expectedPointerHex: hex(spec.expectedPointer),
      actualPointerHex: hex(actualPointer),
      pointerMatches: actualPointer === spec.expectedPointer,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function rowsWithStage(rows, stage) {
  return rows.filter((row) => row.stage === stage);
}

function allRowsMatch(rows) {
  return rows.every((row) => row.opcodeMatches === true || row.pointerMatches === true);
}

function buildCurrentNativeTexDataTextureObjectAudit(
  {
    binaryPath = defaultBinary,
    shaderDataType4Path = defaultShaderDataType4Path,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeRows = opcodeRowsForSpecs(buffer, elf);
  const pointerRows = pointerRowsForSpecs(buffer, elf);
  const rows = [...opcodeRows, ...pointerRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const pointerMismatchRows = pointerRows.filter((row) => !row.pointerMatches).length;
  const shaderDataType4Audit = readJson(shaderDataType4Path, { summary: {} });
  const shaderDataType4Summary = shaderDataType4Audit.summary || {};
  const texDataHandlerRecovered = allRowsMatch(rowsWithStage(opcodeRows, "texdata-handler")) && pointerRows[0]?.pointerMatches;
  const textureWrapperBuilderRecovered = allRowsMatch(rowsWithStage(opcodeRows, "texture-wrapper-builder"));
  const texDataPayloadParserRecovered = allRowsMatch(rowsWithStage(opcodeRows, "texdata-payload-parser"));
  const textureGlUploadRecovered = allRowsMatch(rowsWithStage(opcodeRows, "texture-gl-upload"));
  const textureObjectApplyRecovered = allRowsMatch(rowsWithStage(opcodeRows, "texture-object-apply"));
  const textureRuntimeVtablesRecovered = pointerMismatchRows === 0;
  const summary = {
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    pointerRows: pointerRows.length,
    pointerMismatchRows,
    texDataHandlerRows: rowsWithStage(opcodeRows, "texdata-handler").length,
    textureWrapperBuilderRows: rowsWithStage(opcodeRows, "texture-wrapper-builder").length,
    texDataPayloadParserRows: rowsWithStage(opcodeRows, "texdata-payload-parser").length,
    textureGlUploadRows: rowsWithStage(opcodeRows, "texture-gl-upload").length,
    textureObjectApplyRows: rowsWithStage(opcodeRows, "texture-object-apply").length,
    texDataHandlerRecovered,
    textureWrapperBuilderRecovered,
    texDataPayloadParserRecovered,
    textureGlUploadRecovered,
    textureObjectApplyRecovered,
    textureRuntimeVtablesRecovered,
    texDataToGlTextureObjectChainRecovered:
      texDataHandlerRecovered &&
      textureWrapperBuilderRecovered &&
      texDataPayloadParserRecovered &&
      textureGlUploadRecovered &&
      textureObjectApplyRecovered &&
      textureRuntimeVtablesRecovered,
    shaderDataType4SemanticTextureValueSourceRecovered: Boolean(
      shaderDataType4Summary.shaderDataType4SemanticTextureValueSourceRecovered,
    ),
    materialSamplerTextureObjectOwnershipRecovered: false,
    shadergraphSamplerToTexDataBindingRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    shaderDataType4Path,
    policy:
      "diagnostic-only texData texture object audit; proves texData resource to GL texture object mechanics without enabling sampler/material takeover",
    summary,
    interpretation: {
      recovered:
        "The current Android texData handler reaches 0x189e9e8, which builds a texture runtime wrapper. The loader decodes texData payload records, creates GL texture records, uploads image data through glGenTextures/glTexImage2D/glCompressedTexImage2D, and the draw-time texture object wrapper later binds object+0x30 through glActiveTexture/glBindTexture.",
      boundary:
        "This closes the resource-to-GL-texture-object mechanics. It still does not prove which shadergraph sampler key owns which texData object for a submitted material, and it does not recover the final shader formula.",
      nextRequiredEvidence:
        "Trace shadergraph sampler entries/resource hashes into texData runtime wrapper references and then into the source/program parameter table type-4 entries before enabling ordinary character material takeover.",
    },
    items: rows,
  };
}

function exportCurrentNativeTexDataTextureObjectAudit({
  binaryPath = defaultBinary,
  shaderDataType4Path = defaultShaderDataType4Path,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeTexDataTextureObjectAudit({ binaryPath, shaderDataType4Path });
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
    "expectedPointerHex",
    "actualPointerHex",
    "pointerMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeTexDataTextureObjectAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    shaderDataType4Path: optionValue(args, "--shaderdata-type4", defaultShaderDataType4Path),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeTexDataTextureObjectAudit,
  exportCurrentNativeTexDataTextureObjectAudit,
};
