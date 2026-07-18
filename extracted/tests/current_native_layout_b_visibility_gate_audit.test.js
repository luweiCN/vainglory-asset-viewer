const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBVisibilityGateAudit,
  exportCurrentNativeLayoutBVisibilityGateAudit,
} = require("../tools/current_native_layout_b_visibility_gate_audit");

test("buildCurrentNativeLayoutBVisibilityGateAudit records the layout B state gate without render promotion", () => {
  const report = buildCurrentNativeLayoutBVisibilityGateAudit({}, "TEST_DATE");

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 21);
  assert.equal(report.summary.opcodeMismatchRows, 0);
  assert.equal(report.summary.constructorDefaultStateRows, 1);
  assert.equal(report.summary.packedParameterRows, 7);
  assert.equal(report.summary.stateBitWriterRows, 3);
  assert.equal(report.summary.managerRefreshGateRows, 10);
  assert.equal(report.summary.gateCanPassObjectAcRows, 1);
  assert.equal(report.summary.gateCanZeroBackingFlagsRows, 1);
  assert.equal(report.summary.renderPromotionAllowedRows, 0);

  const passFlags = report.items.find((row) => row.role === "refresh-gate-pass-object-flags");
  assert.equal(passFlags?.addressHex, "0x8d5094");
  assert.equal(passFlags.field, "object+0xac");

  const zeroFlags = report.items.find((row) => row.role === "refresh-gate-zero-flags");
  assert.equal(zeroFlags?.addressHex, "0x8d50ac");
  assert.match(zeroFlags.evidence, /zero/);
});

test("exportCurrentNativeLayoutBVisibilityGateAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-visibility-gate-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBVisibilityGateAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.managerRefreshGateRows, 10);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /layout B visibility\/state gate/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /refresh-gate-pass-object-flags/);
});
