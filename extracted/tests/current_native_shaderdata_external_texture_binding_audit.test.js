const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderDataExternalTextureBindingAudit,
  exportCurrentNativeShaderDataExternalTextureBindingAudit,
} = require("../tools/current_native_shaderdata_external_texture_binding_audit");

test("shaderData external texture binding audit validates current native runtime binding path", () => {
  const audit = buildCurrentNativeShaderDataExternalTextureBindingAudit();

  assert.equal(audit.summary.opcodeRows, 55);
  assert.equal(audit.summary.opcodeMismatchRows, 0);
  assert.equal(audit.summary.textureRuntimeSetupRecovered, true);
  assert.equal(audit.summary.textureRuntimeCallbackInstalled, true);
  assert.equal(audit.summary.shaderDataExternalResourceRegistrationRecovered, true);
  assert.equal(audit.summary.textureManagerResourceRegistrationRecovered, true);
  assert.equal(audit.summary.textureManagerKeyExistsCheckRecovered, true);
  assert.equal(audit.summary.externalTexturePassLookupRecovered, true);
  assert.equal(audit.summary.externalTextureRuntimeLookupRecovered, true);
  assert.equal(audit.summary.externalTextureType4PatchRecovered, true);
  assert.equal(audit.summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(audit.summary.shaderDataTextureSamplerStaticUnitLayoutRecovered, true);
  assert.equal(audit.summary.externalTextureSamplerRuntimeBindingRecovered, true);
  assert.equal(audit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(audit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeShaderDataExternalTextureBindingAudit writes report, viewer JSON, and TSV", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shaderdata-external-texture-binding-audit-"));
  const viewerOut = path.join(tmpDir, "viewer.json");
  const jsonOut = path.join(tmpDir, "report.json");
  const tsvOut = path.join(tmpDir, "report.tsv");

  const summary = exportCurrentNativeShaderDataExternalTextureBindingAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.opcodeRows, 55);
  assert.equal(fs.existsSync(viewerOut), true);
  assert.equal(fs.existsSync(jsonOut), true);
  assert.equal(fs.existsSync(tsvOut), true);
  const viewer = JSON.parse(fs.readFileSync(viewerOut, "utf8"));
  assert.equal(viewer.summary.externalTextureSamplerRuntimeBindingRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /external-texture-runtime-lookup/);
});
