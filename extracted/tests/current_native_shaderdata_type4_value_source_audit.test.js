const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderDataType4ValueSourceAudit,
  exportCurrentNativeShaderDataType4ValueSourceAudit,
} = require("../tools/current_native_shaderdata_type4_value_source_audit");

test("shaderData type4 value-source audit validates built-in semantic texture object path", () => {
  const manifest = buildCurrentNativeShaderDataType4ValueSourceAudit();
  const summary = manifest.summary;

  assert.equal(summary.parserType4BranchRows, 11);
  assert.equal(summary.type4EntryWriterRows, 11);
  assert.equal(summary.opcodeRows, 22);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.semanticNameRows, 23);
  assert.equal(summary.type4SemanticRows, 3);
  assert.equal(summary.parserType4BranchRecovered, true);
  assert.equal(summary.type4EntryWriterRecovered, true);
  assert.equal(summary.shaderParameterBridgeAgrees, true);
  assert.equal(summary.shaderDataType4SemanticTextureValueSourceRecovered, true);
  assert.equal(summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(manifest.type4SemanticNames, [
    "CloudShadows.Texture",
    "FogOfWar.Texture",
    "Shadowing.mMap",
  ]);
  assert.ok(manifest.items.some((row) => row.role === "shaderdata-type4-entry-writer-call"));
  assert.ok(manifest.items.some((row) => row.role === "type4-entry-object-type-store"));
});

test("exportCurrentNativeShaderDataType4ValueSourceAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-shaderdata-type4-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeShaderDataType4ValueSourceAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.shaderDataType4SemanticTextureValueSourceRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /CloudShadows\.Texture/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /type4-entry-object-type-store/);
});
