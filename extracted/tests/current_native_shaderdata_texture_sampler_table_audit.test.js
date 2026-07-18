const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderDataTextureSamplerTableAudit,
  exportCurrentNativeShaderDataTextureSamplerTableAudit,
} = require("../tools/current_native_shaderdata_texture_sampler_table_audit");

test("shaderData texture sampler table audit validates current native sampler-unit layout", () => {
  const audit = buildCurrentNativeShaderDataTextureSamplerTableAudit();

  assert.equal(audit.summary.opcodeRows, 61);
  assert.equal(audit.summary.opcodeMismatchRows, 0);
  assert.equal(audit.summary.passSectionCountsRecovered, true);
  assert.equal(audit.summary.textureRecordParserRecovered, true);
  assert.equal(audit.summary.textureRecordConsumerRecovered, true);
  assert.equal(audit.summary.inlineTextureRecordParserRecovered, true);
  assert.equal(audit.summary.inlineTextureRecordConsumerRecovered, true);
  assert.equal(audit.summary.compiledSamplerUnitTableRecovered, true);
  assert.equal(audit.summary.shaderDataTextureSamplerStaticUnitLayoutRecovered, true);
  assert.equal(audit.summary.textureRecordsProduceType4Placeholders, true);
  assert.equal(audit.summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(audit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(audit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeShaderDataTextureSamplerTableAudit writes report, viewer JSON, and TSV", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shaderdata-texture-sampler-audit-"));
  const viewerOut = path.join(tmpDir, "viewer.json");
  const jsonOut = path.join(tmpDir, "report.json");
  const tsvOut = path.join(tmpDir, "report.tsv");

  const summary = exportCurrentNativeShaderDataTextureSamplerTableAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.opcodeRows, 61);
  assert.equal(fs.existsSync(viewerOut), true);
  assert.equal(fs.existsSync(jsonOut), true);
  assert.equal(fs.existsSync(tsvOut), true);
  const viewer = JSON.parse(fs.readFileSync(viewerOut, "utf8"));
  assert.equal(viewer.summary.shaderDataTextureSamplerStaticUnitLayoutRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /compiled-sampler-unit-table/);
});
