#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultMaterialAuditPath = "extracted/viewer/material-render-state-audit.json";
const defaultOwnerAuditPath = "extracted/viewer/current-native-position-sampler-owner-audit.json";
const defaultShaderParamsValueSemanticsPath = "extracted/viewer/current-native-shaderparams-value-semantics-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_shader_parameter_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_shader_parameter_bridge_audit.tsv";

const layoutBFinalConsumerCallsiteSpecs = [
  {
    role: "layout-b-final-consumer-param-apply-call",
    address: 0xe3d0c0,
    expectedOpcodeHex: "94297e75",
    evidence: "layout B final primitive consumer applies selected/fallback parameter payloads through shared uploader 0x189ca94.",
  },
  {
    role: "layout-b-final-consumer-source-entry-param-payload",
    address: 0xe3d0a8,
    expectedOpcodeHex: "f9400780",
    evidence: "layout B final primitive consumer loads selected source entry parameter payload before the uploader call.",
  },
  {
    role: "layout-b-final-consumer-source-object-fallback-payload",
    address: 0xe3d0ac,
    expectedOpcodeHex: "f94006a1",
    evidence: "layout B final primitive consumer loads material/source object fallback parameter payload.",
  },
].map((row) => ({ stage: "layout-b-final-consumer", ...row }));

const parameterUploaderSpecs = [
  [0x189caa4, "parameter-uploader-default-count", "79402008", "0x189ca94 reads parameter table +0x10 as the default parameter-entry count."],
  [0x189cabc, "parameter-uploader-default-entry-and-value-base", "a9400a68", "0x189ca94 loads parameter entry array + value base from table +0/+8 before default uploads."],
  [0x189cac8, "parameter-uploader-default-location", "12002d03", "default upload masks entry word bits 0..11 as the GL uniform location."],
  [0x189cacc, "parameter-uploader-default-dispatch", "97ffffd1", "default upload dispatches one entry through 0x189ca10."],
  [0x189cb20, "parameter-uploader-override-count", "79402028", "override payload +0x10 is read as the override parameter-entry count."],
  [0x189cb48, "parameter-uploader-override-id-load", "b940056c", "override matching loads the override entry id from entry +0x4."],
  [0x189cb50, "parameter-uploader-base-id-load", "b940056e", "override matching compares against the base parameter entry id at entry +0x4."],
  [0x189cb74, "parameter-uploader-override-entry-word-load", "b9400168", "when ids match, the base entry word supplies the GL location/type bits."],
  [0x189cb78, "parameter-uploader-override-value-base-load", "f9400662", "matched override upload uses override payload +0x8 as the value base."],
  [0x189cb84, "parameter-uploader-override-dispatch", "97ffffa3", "matched override upload dispatches through 0x189ca10."],
  [0x189ca10, "parameter-dispatch-entry-word-load", "b9400028", "0x189ca10 reads the packed parameter entry word."],
  [0x189ca14, "parameter-dispatch-value-offset", "530c6d09", "0x189ca10 extracts bits 12..27 as the value offset/index."],
  [0x189ca18, "parameter-dispatch-value-address", "8b294842", "0x189ca10 adds the value offset to the selected value base."],
  [0x189ca1c, "parameter-dispatch-indirect-flag", "37f80048", "bit 31 controls direct versus indirect value addressing."],
  [0x189ca20, "parameter-dispatch-indirect-value-load", "f9400042", "direct-value flag clear causes 0x189ca10 to load an indirect value pointer."],
  [0x189ca24, "parameter-dispatch-type", "531c7909", "0x189ca10 extracts bits 28..30 as the parameter upload type."],
  [0x189ca50, "parameter-dispatch-gluniform1f", "17bbe9fc", "parameter type 0 dispatches to glUniform1f."],
  [0x189ca5c, "parameter-dispatch-gluniform2fv", "17bbc971", "parameter type 1 dispatches to glUniform2fv with count 1."],
  [0x189ca68, "parameter-dispatch-gluniform3fv", "17bbefba", "parameter type 2 dispatches to glUniform3fv with count 1."],
  [0x189ca74, "parameter-dispatch-gluniform4fv", "17bbe4bb", "parameter type 3 dispatches to glUniform4fv with count 1."],
  [0x189ca78, "parameter-dispatch-object-load", "f9400040", "parameter type 4 loads an object pointer from the value slot."],
  [0x189ca88, "parameter-dispatch-object-vslot", "f9400902", "parameter type 4 loads the object vtable +0x10 upload/apply slot."],
  [0x189ca8c, "parameter-dispatch-object-branch", "d61f0040", "parameter type 4 branches to the object's upload/apply implementation with the GL location."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "shared-parameter-uploader", address, role, expectedOpcodeHex, evidence }));

const overrideMergeSpecs = [
  [0x189cae4, "parameter-uploader-override-null-check", "b40000f4", "0x189ca94 only enters the override merge path when the selected/fallback override payload is non-null."],
  [0x189cae8, "parameter-uploader-base-table-arg", "aa1303e0", "The base shader/program parameter table is forwarded as x0 to the override merge helper."],
  [0x189caec, "parameter-uploader-override-table-arg", "aa1403e1", "The override payload, including ShaderParams-produced tables, is forwarded as x1 to the override merge helper."],
  [0x189cafc, "parameter-uploader-override-merge-tailcall", "14000005", "0x189ca94 tail-calls the inlined override merge loop at 0x189cb10."],
  [0x189cb20, "override-merge-override-count-load", "79402028", "The override payload +0x10 low half supplies the override entry count."],
  [0x189cb34, "override-merge-base-count-load", "7940228a", "The base table +0x10 low half supplies the base parameter entry count."],
  [0x189cb44, "override-merge-override-entry-address", "8b150d2b", "The merge loop selects override entry[index] using the 8-byte source-table entry stride."],
  [0x189cb48, "override-merge-override-key-hash-load", "b940056c", "Override entry +0x4 is the hash/id used to match a base shader parameter entry."],
  [0x189cb50, "override-merge-base-key-hash-load", "b940056e", "Base entry +0x4 is compared with the override entry hash/id."],
  [0x189cb54, "override-merge-key-hash-compare", "6b0c01df", "The override applies only when the base and override entry hash/id values match."],
  [0x189cb74, "override-merge-base-entry-word-load", "b9400168", "On a match, the base entry word is loaded to keep the compiled uniform location."],
  [0x189cb78, "override-merge-override-value-base-load", "f9400662", "Matched override uploads use override payload +0x8 as the value table base."],
  [0x189cb7c, "override-merge-override-entry-dispatch-arg", "8b150d21", "The override entry word supplies the value offset/direct flag/type bits to the shared dispatcher."],
  [0x189cb80, "override-merge-base-location-mask", "12002d03", "The GL uniform location comes from the matched base entry low 12 bits."],
  [0x189cb84, "override-merge-dispatch-call", "97ffffa3", "The merged base location plus override value/type are dispatched through 0x189ca10."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "parameter-override-merge", address, role, expectedOpcodeHex, evidence }));

const shaderParamsNumericOverrideSpecs = [
  [0x189bd3c, "shaderparams-type-from-count-minus-two", "0b0c71ad", "ShaderParams source-table packing derives numeric uniform type bits from component count minus two."],
  [0x189bd40, "shaderparams-type-count-range", "71000d9f", "Only component counts 1..4 are accepted in this ShaderParams override table path."],
  [0x189bd54, "shaderparams-type-bits-store", "2a0c01ac", "The packed override entry receives type bits 0..3 for 1f/2fv/3fv/4fv numeric uniforms."],
  [0x189bd68, "shaderparams-direct-value-flag-store", "3301008c", "The direct/indirect value flag is stored in the override entry bit 31."],
  [0x189bd7c, "shaderparams-key-hash-store-for-override-match", "b9000525", "The source key hash stored at override entry +0x4 is the value later matched by 0x189cb48/0x189cb50."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "shaderparams-numeric-override", address, role, expectedOpcodeHex, evidence }));

const textureObjectBindingSpecs = [
  [0x189ca84, "parameter-dispatch-texture-location", "2a0303e1", "parameter dispatch type 4 passes the resolved GL location/unit value as w1 to the object apply method."],
  [0x189d984, "texture-record-wrapper-tailcall", "17d5a91d", "one recovered texture object apply method tail-calls draw-time texture record binder 0xe07df8."],
  [0xe07e14, "texture-record-object-id-load", "b9400035", "0xe07df8 reads texture record +0x0 as the GL texture object/cache id."],
  [0xe07e5c, "texture-record-active-unit-call", "97e62115", "0xe07df8 calls glActiveTexture with GL_TEXTURE0 plus the recovered sampler/unit index."],
  [0xe07e98, "texture-record-target-load", "79c00a60", "0xe07df8 reads texture record +0x4 as the GL texture target before binding."],
  [0xe07e9c, "texture-record-bind-call", "97e630c5", "0xe07df8 calls glBindTexture with the record target and object id."],
  [0xe07ea0, "texture-record-parameter-flags", "f840c268", "0xe07df8 reads texture record flags at +0xc before sampler filtering/wrap parameters."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "texture-object-binding", address, role, expectedOpcodeHex, evidence }));

const textureObjectWrapperSpecs = [
  [0x189d8d4, "texture-wrapper-state-kind-load", "b9402408", "texture object wrapper reads object +0x24 before deciding whether sampler state needs update."],
  [0x189d8ec, "texture-wrapper-current-sampler-state-load", "f843c2c8", "texture object wrapper reads object +0x3c current sampler/filter state."],
  [0x189d8f0, "texture-wrapper-input-sampler-state-load", "394042a9", "texture object wrapper reads incoming sampler/filter state byte from x2 +0x10."],
  [0x189d8f4, "texture-wrapper-record-pointer-add", "9100c2d4", "texture object wrapper derives the texture record pointer as object +0x30."],
  [0x189d934, "texture-wrapper-update-a-record-arg", "aa1403e0", "texture object wrapper passes object +0x30 to the first sampler-state update helper."],
  [0x189d938, "texture-wrapper-update-a-call", "9400210e", "texture object wrapper calls the first sampler-state update helper 0x18a5d70."],
  [0x189d964, "texture-wrapper-update-b-record-arg", "aa1403e0", "texture object wrapper passes object +0x30 to the second sampler-state update helper."],
  [0x189d968, "texture-wrapper-update-b-value-arg", "2a0103e2", "texture object wrapper forwards the sampled state bit as w2 to the second helper."],
  [0x189d96c, "texture-wrapper-update-b-call", "9400210d", "texture object wrapper calls the second sampler-state update helper 0x18a5da0."],
  [0x189d970, "texture-wrapper-binder-unit-arg", "2a1303e0", "texture object wrapper forwards the resolved GL location/unit value to the binder as w0."],
  [0x189d974, "texture-wrapper-binder-record-arg", "aa1403e1", "texture object wrapper forwards object +0x30 to the binder as x1."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ stage: "texture-object-wrapper", address, role, expectedOpcodeHex, evidence }));

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
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

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
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

function buildCurrentNativeLayoutBShaderParameterBridgeAudit(
  {
    binaryPath = defaultBinary,
    materialAuditPath = defaultMaterialAuditPath,
    ownerAuditPath = defaultOwnerAuditPath,
    shaderParamsValueSemanticsPath = defaultShaderParamsValueSemanticsPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const layoutBFinalConsumerRows = opcodeRowsForSpecs(buffer, elf, layoutBFinalConsumerCallsiteSpecs);
  const parameterUploaderRows = opcodeRowsForSpecs(buffer, elf, parameterUploaderSpecs);
  const overrideMergeRows = opcodeRowsForSpecs(buffer, elf, overrideMergeSpecs);
  const shaderParamsNumericOverrideRows = opcodeRowsForSpecs(buffer, elf, shaderParamsNumericOverrideSpecs);
  const textureObjectBindingRows = opcodeRowsForSpecs(buffer, elf, textureObjectBindingSpecs);
  const textureObjectWrapperRows = opcodeRowsForSpecs(buffer, elf, textureObjectWrapperSpecs);
  const opcodeRows = [
    ...layoutBFinalConsumerRows,
    ...parameterUploaderRows,
    ...overrideMergeRows,
    ...shaderParamsNumericOverrideRows,
    ...textureObjectBindingRows,
    ...textureObjectWrapperRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const materialAudit = readJson(materialAuditPath, { summary: {} });
  const ownerAudit = readJson(ownerAuditPath, { summary: {} });
  const shaderParamsValueSemantics = readJson(shaderParamsValueSemanticsPath, { summary: {} });
  const materialSummary = materialAudit.summary || {};
  const ownerSummary = ownerAudit.summary || {};
  const shaderParamsValueSummary = shaderParamsValueSemantics.summary || {};
  const parameterUploaderRecovered =
    opcodeMismatchRows === 0 &&
    parameterUploaderRows.some((row) => row.role === "parameter-dispatch-object-branch" && row.opcodeMatches);
  const overrideHashMatchRecovered =
    opcodeMismatchRows === 0 &&
    overrideMergeRows.some((row) => row.role === "override-merge-override-key-hash-load" && row.opcodeMatches) &&
    overrideMergeRows.some((row) => row.role === "override-merge-base-key-hash-load" && row.opcodeMatches) &&
    overrideMergeRows.some((row) => row.role === "override-merge-key-hash-compare" && row.opcodeMatches);
  const overrideKeepsBaseUniformLocationRecovered =
    opcodeMismatchRows === 0 &&
    overrideMergeRows.some((row) => row.role === "override-merge-base-entry-word-load" && row.opcodeMatches) &&
    overrideMergeRows.some((row) => row.role === "override-merge-base-location-mask" && row.opcodeMatches);
  const overrideUsesOverrideValueAndTypeRecovered =
    opcodeMismatchRows === 0 &&
    overrideMergeRows.some((row) => row.role === "override-merge-override-value-base-load" && row.opcodeMatches) &&
    overrideMergeRows.some((row) => row.role === "override-merge-override-entry-dispatch-arg" && row.opcodeMatches) &&
    overrideMergeRows.some((row) => row.role === "override-merge-dispatch-call" && row.opcodeMatches);
  const shaderParamsNumericOverrideRecovered =
    opcodeMismatchRows === 0 &&
    shaderParamsNumericOverrideRows.every((row) => row.opcodeMatches) &&
    Boolean(shaderParamsValueSummary.sourceTableEntryPackingRecovered) &&
    Boolean(shaderParamsValueSummary.sourceTableFinalizerRecovered);
  const shaderParamsOverrideProducesTextureObjectType4 = false;
  const textureObjectBindingRecovered =
    opcodeMismatchRows === 0 &&
    textureObjectBindingRows.some((row) => row.role === "texture-record-bind-call" && row.opcodeMatches);
  const textureObjectRecordPointerRecovered =
    opcodeMismatchRows === 0 &&
    textureObjectWrapperRows.some((row) => row.role === "texture-wrapper-record-pointer-add" && row.opcodeMatches) &&
    textureObjectWrapperRows.some((row) => row.role === "texture-wrapper-binder-record-arg" && row.opcodeMatches);
  const textureSamplerStateUpdateRecovered =
    opcodeMismatchRows === 0 &&
    textureObjectWrapperRows.some((row) => row.role === "texture-wrapper-update-a-call" && row.opcodeMatches) &&
    textureObjectWrapperRows.some((row) => row.role === "texture-wrapper-update-b-call" && row.opcodeMatches);
  const sourceProgramTablePathRecovered =
    Boolean(ownerSummary.sceneEntityRuntimeParamSourceTableProgramRecovered) &&
    Boolean(ownerSummary.sceneEntityRuntimeParamSourceMappingRecovered);
  const nativeMaterialAuditAgrees =
    materialSummary.currentNativeShaderProgramAndRenderStateEvidence?.drawPassEvidence?.parameterUploaderAddress ===
    "0x189ca94";
  const summary = {
    layoutBFinalConsumerRows: layoutBFinalConsumerRows.length,
    parameterUploaderRows: parameterUploaderRows.length,
    overrideMergeRows: overrideMergeRows.length,
    shaderParamsNumericOverrideRows: shaderParamsNumericOverrideRows.length,
    textureObjectBindingRows: textureObjectBindingRows.length,
    textureObjectWrapperRows: textureObjectWrapperRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    layoutBToSharedParameterUploaderRecovered: opcodeMismatchRows === 0,
    parameterUploaderRecovered,
    numericUniformDispatchRecovered: parameterUploaderRecovered,
    overrideHashMatchRecovered,
    overrideKeepsBaseUniformLocationRecovered,
    overrideUsesOverrideValueAndTypeRecovered,
    shaderParamsNumericOverrideRecovered,
    shaderParamsOverridePayloadAgrees:
      shaderParamsNumericOverrideRecovered &&
      Boolean(shaderParamsValueSummary.shaderParamIdValueSemanticsRecovered) &&
      Boolean(shaderParamsValueSummary.sourceKeyHashRecovered),
    shaderParamsOverrideProducesTextureObjectType4,
    shaderParamsToUploaderOverrideBridgeRecovered:
      parameterUploaderRecovered &&
      overrideHashMatchRecovered &&
      overrideKeepsBaseUniformLocationRecovered &&
      overrideUsesOverrideValueAndTypeRecovered &&
      shaderParamsNumericOverrideRecovered,
    textureObjectBindingRecovered,
    textureObjectRecordPointerRecovered,
    textureSamplerStateUpdateRecovered,
    sourceProgramTablePathRecovered,
    nativeMaterialAuditAgrees,
    shaderTextureFormulaRecovered: false,
    textureSamplerFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B shader parameter bridge; proves upload/bind mechanics without enabling shader or texture rendering takeover",
    summary,
    interpretation: {
      recovered:
        "layout B final primitive consumer reaches the shared parameter uploader; that uploader uploads base parameters first, then merges ShaderParams-style override tables by matching entry +0x4 hash/id against the base shader parameter table. The matched base entry keeps the GL uniform location, while the override entry/value table supplies the value offset, type bits, and numeric values. Object-backed texture parameters still flow through type 4 texture objects; StaticMesh ShaderParams do not produce type 4 texture-object entries.",
      boundary:
        "This still does not recover the exact shader formula, every sampler resource object, active light/probe/profile values, or the concrete texture object source for every submitted model.",
      nextRequiredEvidence:
        "Trace the base shader/program parameter table and type-4 texture object value source back to concrete shadergraph samplers/resources before changing viewer rendering.",
    },
    items: opcodeRows,
  };
}

function exportCurrentNativeLayoutBShaderParameterBridgeAudit({
  binaryPath = defaultBinary,
  materialAuditPath = defaultMaterialAuditPath,
  ownerAuditPath = defaultOwnerAuditPath,
  shaderParamsValueSemanticsPath = defaultShaderParamsValueSemanticsPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBShaderParameterBridgeAudit({
    binaryPath,
    materialAuditPath,
    ownerAuditPath,
    shaderParamsValueSemanticsPath,
  });
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
  const summary = exportCurrentNativeLayoutBShaderParameterBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    materialAuditPath: optionValue(args, "--material-audit", defaultMaterialAuditPath),
    ownerAuditPath: optionValue(args, "--owner-audit", defaultOwnerAuditPath),
    shaderParamsValueSemanticsPath: optionValue(
      args,
      "--shaderparams-value-semantics",
      defaultShaderParamsValueSemanticsPath,
    ),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBShaderParameterBridgeAudit,
  exportCurrentNativeLayoutBShaderParameterBridgeAudit,
};
