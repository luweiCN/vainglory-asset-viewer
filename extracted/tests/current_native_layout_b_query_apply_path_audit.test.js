const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBQueryApplyPathAudit,
  exportCurrentNativeLayoutBQueryApplyPathAudit,
} = require("../tools/current_native_layout_b_query_apply_path_audit");

test("layout B query/apply path audit classifies wrapper arguments without promoting rendering", () => {
  const manifest = buildCurrentNativeLayoutBQueryApplyPathAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.wrapperRows, 4);
  assert.equal(manifest.summary.opcodeRows, 33);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.queryWrapperRows, 2);
  assert.equal(manifest.summary.conditionalCreateOrQueryRows, 1);
  assert.equal(manifest.summary.sharedCreateRows, 1);
  assert.equal(manifest.summary.visibilityGateRows, 4);
  assert.equal(manifest.summary.statePointerSourceRows, 4);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const variantA = manifest.wrapperRows.find((row) => row.id === "query-variant-a");
  assert.equal(variantA?.objectRegister, "x22");
  assert.equal(variantA.visibilityGateAddressHex, "0x8a9838");
  assert.equal(variantA.visibilityStatePointerSource, "x20+0x2fc");

  const conditional = manifest.wrapperRows.find((row) => row.id === "conditional-create-or-query");
  assert.equal(conditional?.objectRegister, "x21");
  assert.equal(conditional.helperModes, "create-resolve-helper | query-or-allocate-helper");
  assert.equal(conditional.visibilityStatePointerSource, "linked-owner+0x2fc");

  const shared = manifest.wrapperRows.find((row) => row.id === "shared-create-branch");
  assert.equal(shared?.helperModes, "create-resolve-helper");
  assert.equal(shared.visibilityStatePointerSource, "x21+0x2fc");
  assert.match(shared.evidence, /caller byte \+0x65/);
});

test("exportCurrentNativeLayoutBQueryApplyPathAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-query-apply-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBQueryApplyPathAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.visibilityGateRows, 4);
  assert.equal(summary.directObjectAcProducerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /query\/apply path/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /visibilityStatePointerSource/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /conditional-create-or-query/);
});
