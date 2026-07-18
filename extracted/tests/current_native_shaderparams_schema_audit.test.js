const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderParamsSchemaAudit,
  exportCurrentNativeShaderParamsSchemaAudit,
} = require("../tools/current_native_shaderparams_schema_audit");

test("shader params schema audit validates current Android field shape", () => {
  const manifest = buildCurrentNativeShaderParamsSchemaAudit();
  const summary = manifest.summary;

  assert.equal(summary.opcodeRows, 17);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.typeRegistrationRows, 6);
  assert.equal(summary.shaderParamFieldRows, 1);
  assert.equal(summary.shaderParamsFieldRows, 2);
  assert.equal(summary.crossBuildRows, 3);
  assert.equal(summary.currentShaderParamTypeRegistrationsRecovered, true);
  assert.equal(summary.currentShaderParamsTypeRegistrationsRecovered, true);
  assert.equal(summary.currentShaderParamsFieldLayoutRecovered, true);
  assert.equal(summary.staticMeshShaderParamsBridgeRecovered, true);
  assert.equal(summary.crossBuildShaderParamsLayoutAgrees, true);
  assert.equal(summary.shaderParamsFieldNamesRecovered, false);
  assert.equal(summary.activeResourceSemanticsRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.shaderParamsFields.some((field) => field.fieldOffset === "0x0" && field.fieldTypeName === "char*"));
  assert.ok(
    manifest.shaderParamsFields.some((field) => field.fieldOffset === "0x8" && field.fieldTypeName === "ShaderParam**"),
  );
});

test("exportCurrentNativeShaderParamsSchemaAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-shaderparams-schema-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeShaderParamsSchemaAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.currentShaderParamsFieldLayoutRecovered, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shaderparams-field1-type-shaderparam-list-load/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /staticmesh-field6-type-shaderparams-list-store/);
});
