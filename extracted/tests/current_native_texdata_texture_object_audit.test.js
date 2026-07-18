const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeTexDataTextureObjectAudit,
  exportCurrentNativeTexDataTextureObjectAudit,
} = require("../tools/current_native_texdata_texture_object_audit");

test("texData texture object audit validates current native resource-to-GL chain", () => {
  const manifest = buildCurrentNativeTexDataTextureObjectAudit();
  const summary = manifest.summary;

  assert.equal(summary.opcodeRows, 34);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.pointerRows, 7);
  assert.equal(summary.pointerMismatchRows, 0);
  assert.equal(summary.texDataHandlerRows, 6);
  assert.equal(summary.textureWrapperBuilderRows, 6);
  assert.equal(summary.texDataPayloadParserRows, 7);
  assert.equal(summary.textureGlUploadRows, 10);
  assert.equal(summary.textureObjectApplyRows, 5);
  assert.equal(summary.texDataHandlerRecovered, true);
  assert.equal(summary.textureWrapperBuilderRecovered, true);
  assert.equal(summary.texDataPayloadParserRecovered, true);
  assert.equal(summary.textureGlUploadRecovered, true);
  assert.equal(summary.textureObjectApplyRecovered, true);
  assert.equal(summary.textureRuntimeVtablesRecovered, true);
  assert.equal(summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(summary.shaderDataType4SemanticTextureValueSourceRecovered, true);
  assert.equal(summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.role === "texdata-handler-texture-wrapper-builder-call"));
  assert.ok(manifest.items.some((row) => row.role === "texture-record-gl-gen-call"));
  assert.ok(manifest.items.some((row) => row.role === "texture-record-bind-call"));
});

test("exportCurrentNativeTexDataTextureObjectAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-texdata-texture-object-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeTexDataTextureObjectAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.pointerMismatchRows, 0);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(exported.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.match(exported.interpretation.boundary, /shadergraph sampler/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /texture-upload-image-call/);
});
