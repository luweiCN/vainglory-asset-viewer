const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeDefinitionShaderParamsPayloadStructureAudit,
  exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit,
  extractFloatCandidateValues,
} = require("../tools/current_native_definition_shaderparams_payload_structure_audit");

function writeRuntimeSkinFields(tempDir) {
  const filePath = path.join(tempDir, "cff0_runtime_skin_fields.tsv");
  const columns = [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "recordEndField",
    "fieldOffset",
    "localFieldOffset",
    "sourceOffset",
    "referenceKind",
    "role",
    "value",
    "semantic",
    "resourceCategory",
    "targetRelativePath",
  ];
  const row = (values) => columns.map((column) => values[column] || "").join("\t");
  const rows = [
    columns.join("\t"),
    row({
      source: "cff0-ptch",
      relativePath: "Characters/Test/Test.def",
      hash: "HASH",
      blockIndex: "0",
      definitionFormatByte: "4",
      definitionVersionByte: "8",
      modelLabel: "Test_Skin",
      recordStartField: "100",
      recordEndField: "320",
      fieldOffset: "120",
      localFieldOffset: "20",
      sourceOffset: "500",
      referenceKind: "string",
      role: "label",
      value: "u_color",
      semantic: "label",
    }),
    row({
      source: "cff0-ptch",
      relativePath: "Characters/Test/Test.def",
      hash: "HASH",
      blockIndex: "0",
      definitionFormatByte: "4",
      definitionVersionByte: "8",
      modelLabel: "Test_Skin",
      recordStartField: "100",
      recordEndField: "320",
      fieldOffset: "124",
      localFieldOffset: "24",
      sourceOffset: "540",
      referenceKind: "object",
      role: "object-ref",
    }),
    row({
      source: "cff0-ptch",
      relativePath: "Characters/Test/Test.def",
      hash: "HASH",
      blockIndex: "0",
      definitionFormatByte: "4",
      definitionVersionByte: "8",
      modelLabel: "Test_Skin",
      recordStartField: "100",
      recordEndField: "320",
      fieldOffset: "180",
      localFieldOffset: "80",
      sourceOffset: "620",
      referenceKind: "string",
      role: "effect-label",
      value: "Effect_Test_AA",
      semantic: "label",
    }),
    row({
      source: "cff0-ptch",
      relativePath: "Characters/Test/Test.def",
      hash: "HASH",
      blockIndex: "0",
      definitionFormatByte: "4",
      definitionVersionByte: "8",
      modelLabel: "Test_Skin",
      recordStartField: "100",
      recordEndField: "320",
      fieldOffset: "220",
      localFieldOffset: "120",
      sourceOffset: "700",
      referenceKind: "string",
      role: "label",
      value: "sampler2",
      semantic: "label",
    }),
    row({
      source: "cff0-ptch",
      relativePath: "Characters/Test/Test.def",
      hash: "HASH",
      blockIndex: "0",
      definitionFormatByte: "4",
      definitionVersionByte: "8",
      modelLabel: "Test_Skin",
      recordStartField: "100",
      recordEndField: "320",
      fieldOffset: "228",
      localFieldOffset: "128",
      sourceOffset: "720",
      referenceKind: "string",
      role: "texture",
      value: "build://Characters/Test/Art/test.png",
      semantic: "resource",
      resourceCategory: "texture",
      targetRelativePath: "Characters/Test/Art/test.png",
    }),
  ];
  fs.writeFileSync(filePath, `${rows.join("\n")}\n`);
  return filePath;
}

test("definition shaderparams payload audit locates static uniform payloads without render promotion", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-shaderparams-"));
  const runtimeSkinFieldsPath = writeRuntimeSkinFields(tempDir);
  const manifest = buildCurrentNativeDefinitionShaderParamsPayloadStructureAudit({
    runtimeSkinFieldsPath,
    definitionIndexPath: path.join(tempDir, "missing_definition_index.tsv"),
  });

  assert.equal(manifest.summary.runtimeSkinFieldRows, 5);
  assert.equal(manifest.summary.shaderUniformPayloadRows, 1);
  assert.equal(manifest.summary.uniqueShaderUniformNameRows, 1);
  assert.equal(manifest.summary.uniformRowsWithAdjacentObjectPayload, 1);
  assert.equal(manifest.summary.uniformNearbyObjectPayloadRows, 1);
  assert.equal(manifest.summary.uniformNearbyScalarFloatPayloadRows, 0);
  assert.equal(manifest.summary.uniformNearbySmallIntegerPayloadRows, 0);
  assert.equal(manifest.summary.staticShaderParamIdListCandidatesLocated, false);
  assert.equal(manifest.summary.uniformRowsWithSamplerNameNeighbor, 1);
  assert.equal(manifest.summary.uniformRowsWithTextureResourceNeighbor, 1);
  assert.equal(manifest.summary.staticUniformOverridePayloadLocated, true);
  assert.equal(manifest.summary.structuredShaderParamsListRecovered, false);
  assert.equal(manifest.summary.sourceProgramStaticReplacementAllowed, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.items[0].neighborEffects, "Effect_Test_AA");
  assert.equal(manifest.items[0].nextObjectSourceOffset, "540");
  assert.equal(manifest.items[0].nearbyObjectPayloadRows, 1);
});

test("extractFloatCandidateValues reads plausible static float payload values", () => {
  const buffer = Buffer.alloc(80);
  buffer.writeFloatLE(0, 0);
  buffer.writeFloatLE(255, 16);
  buffer.writeFloatLE(186, 20);
  buffer.writeFloatLE(72, 24);
  buffer.writeUInt32LE(0x65735f75, 28);

  assert.deepEqual(extractFloatCandidateValues(buffer, 0), [255, 186, 72]);
});

test("exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-shaderparams-out-"));
  const runtimeSkinFieldsPath = writeRuntimeSkinFields(tempDir);
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  const summary = exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit({
    runtimeSkinFieldsPath,
    definitionIndexPath: path.join(tempDir, "missing_definition_index.tsv"),
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.shaderUniformPayloadRows, 1);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.uniformRowsWithSamplerNameNeighbor, 1);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /u_color/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Effect_Test_AA/);
});
