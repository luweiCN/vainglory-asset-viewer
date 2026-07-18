const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeDynamicSourceTableSemanticsAudit,
  exportCurrentNativeDynamicSourceTableSemanticsAudit,
} = require("../tools/current_native_dynamic_source_table_semantics_audit");

test("dynamic source-table semantics audit validates selector type-index structure", () => {
  const manifest = buildCurrentNativeDynamicSourceTableSemanticsAudit();
  const summary = manifest.summary;

  assert.equal(summary.typeIndexRows, 28);
  assert.equal(summary.selectorBridgeRows, 23);
  assert.equal(summary.upstreamBatchDispatcherRows, 14);
  assert.equal(summary.postChildSetupRows, 8);
  assert.equal(summary.opcodeRows, 73);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.sourceTableTypeIndexChainRecovered, true);
  assert.equal(summary.selectorChildClassMatchRecovered, true);
  assert.equal(summary.selectorCallerObjectCreationRecovered, true);
  assert.equal(summary.upstreamConfigFieldChainRecovered, true);
  assert.equal(summary.batchDispatcherToSelectorRecovered, true);
  assert.equal(summary.levelConfigFieldNamesRecovered, true);
  assert.equal(summary.levelVisualsApplyProcessorFieldRoutingRecovered, true);
  assert.equal(summary.postChildPayloadSetupRecovered, true);
  assert.equal(summary.sourceTableProducerAgrees, true);
  assert.equal(summary.resourceFieldNamesRecovered, false);
  assert.equal(summary.activeResourceSemanticsRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.role === "selector-wrapper-candidate-class-load"));
  assert.ok(manifest.items.some((row) => row.role === "upstream-loader-batch-dispatch-call"));
  assert.ok(manifest.items.some((row) => row.role === "selector-caller-post-setup-call"));
  assert.ok(manifest.typeRoles.some((row) => row.role === "level-config"));
});

test("exportCurrentNativeDynamicSourceTableSemanticsAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-dynamic-source-table-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeDynamicSourceTableSemanticsAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.selectorChildClassMatchRecovered, true);
  assert.equal(exported.summary.upstreamConfigFieldChainRecovered, true);
  assert.equal(exported.summary.levelConfigFieldNamesRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /selector-wrapper-candidate-class-load/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /upstream-loader-batch-dispatch-call/);
});
