const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBShaderParameterBridgeAudit,
  exportCurrentNativeLayoutBShaderParameterBridgeAudit,
} = require("../tools/current_native_layout_b_shader_parameter_bridge_audit");

test("layout B shader parameter bridge audit validates parameter upload and texture binding mechanics", () => {
  const manifest = buildCurrentNativeLayoutBShaderParameterBridgeAudit();
  const summary = manifest.summary;

  assert.equal(summary.layoutBFinalConsumerRows, 3);
  assert.equal(summary.parameterUploaderRows, 23);
  assert.equal(summary.overrideMergeRows, 15);
  assert.equal(summary.shaderParamsNumericOverrideRows, 5);
  assert.equal(summary.textureObjectBindingRows, 7);
  assert.equal(summary.textureObjectWrapperRows, 11);
  assert.equal(summary.opcodeRows, 64);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.layoutBToSharedParameterUploaderRecovered, true);
  assert.equal(summary.parameterUploaderRecovered, true);
  assert.equal(summary.numericUniformDispatchRecovered, true);
  assert.equal(summary.overrideHashMatchRecovered, true);
  assert.equal(summary.overrideKeepsBaseUniformLocationRecovered, true);
  assert.equal(summary.overrideUsesOverrideValueAndTypeRecovered, true);
  assert.equal(summary.shaderParamsNumericOverrideRecovered, true);
  assert.equal(summary.shaderParamsOverridePayloadAgrees, true);
  assert.equal(summary.shaderParamsOverrideProducesTextureObjectType4, false);
  assert.equal(summary.shaderParamsToUploaderOverrideBridgeRecovered, true);
  assert.equal(summary.textureObjectBindingRecovered, true);
  assert.equal(summary.textureObjectRecordPointerRecovered, true);
  assert.equal(summary.textureSamplerStateUpdateRecovered, true);
  assert.equal(summary.sourceProgramTablePathRecovered, true);
  assert.equal(summary.nativeMaterialAuditAgrees, true);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.textureSamplerFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.role === "layout-b-final-consumer-param-apply-call"));
  assert.ok(manifest.items.some((row) => row.role === "override-merge-key-hash-compare"));
  assert.ok(manifest.items.some((row) => row.role === "shaderparams-key-hash-store-for-override-match"));
  assert.ok(manifest.items.some((row) => row.role === "texture-record-bind-call"));
  assert.ok(manifest.items.some((row) => row.role === "texture-wrapper-record-pointer-add"));
});

test("exportCurrentNativeLayoutBShaderParameterBridgeAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-shader-param-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBShaderParameterBridgeAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.textureObjectBindingRecovered, true);
  assert.equal(exported.summary.shaderParamsToUploaderOverrideBridgeRecovered, true);
  assert.equal(exported.summary.textureObjectRecordPointerRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /override-merge-key-hash-compare/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shaderparams-key-hash-store-for-override-match/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /texture-record-bind-call/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /texture-wrapper-record-pointer-add/);
});
