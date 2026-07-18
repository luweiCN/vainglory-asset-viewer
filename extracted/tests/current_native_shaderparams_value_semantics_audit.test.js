const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderParamsValueSemanticsAudit,
  exportCurrentNativeShaderParamsValueSemanticsAudit,
} = require("../tools/current_native_shaderparams_value_semantics_audit");

test("shaderparams value semantics audit validates current Android source-table packing", () => {
  const manifest = buildCurrentNativeShaderParamsValueSemanticsAudit();
  const summary = manifest.summary;

  assert.equal(summary.iteratorOpcodeRows, 19);
  assert.equal(summary.builderOpcodeRows, 28);
  assert.equal(summary.opcodeRows, 47);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.componentJumpTableRows, 4);
  assert.equal(summary.componentJumpTableMismatchRows, 0);
  assert.equal(summary.shaderParamsSchemaRecovered, true);
  assert.equal(summary.dynamicSourceTableSelectorRecovered, true);
  assert.equal(summary.shaderParameterUploaderRecovered, true);
  assert.equal(summary.shaderParamsIterationRecovered, true);
  assert.equal(summary.shaderParamIdExtractionRecovered, true);
  assert.equal(summary.shaderParamComponentCountMappingRecovered, true);
  assert.equal(summary.sourceKeyHashRecovered, true);
  assert.equal(summary.sourceTableEntryPackingRecovered, true);
  assert.equal(summary.sourceTableFinalizerRecovered, true);
  assert.equal(summary.shaderParamIdValueSemanticsRecovered, true);
  assert.equal(summary.activeResourceSemanticsRecovered, false);
  assert.equal(summary.concreteSamplerOwnershipRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.sourceTableLayout.entryStride, "0x8");
  assert.equal(manifest.sourceTableLayout.valueStride, "0x4");
  assert.equal(manifest.componentJumpTableRows.every((row) => row.targetMatches), true);
  assert.deepEqual(
    manifest.componentJumpTableRows.map((row) => row.builderCount),
    [1, 2, 3, 4],
  );
});

test("exportCurrentNativeShaderParamsValueSemanticsAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-shaderparams-values-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeShaderParamsValueSemanticsAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.sourceTableEntryPackingRecovered, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /source-entry-key-hash-store/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shaderparam-id-load/);
});
