const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeObjectAcOwnerTraceAudit,
  exportCurrentNativeObjectAcOwnerTraceAudit,
} = require("../tools/current_native_object_ac_owner_trace_audit");

test("object +0xac owner trace keeps out-of-family width writes unpromoted", () => {
  const manifest = buildCurrentNativeObjectAcOwnerTraceAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.candidateRows, 159);
  assert.equal(manifest.summary.rowsWithNearestDirectBranchTarget, 140);
  assert.equal(manifest.summary.nearestTargetWithin128Rows, 40);
  assert.equal(manifest.summary.nearestTargetWithin512Rows, 86);
  assert.equal(manifest.summary.rowsWithAnyDirectCallers, 140);
  assert.equal(manifest.summary.rowsWithLayoutBDirectCallers, 0);
  assert.equal(manifest.summary.renderOwnerHelperRows, 1);
  assert.equal(manifest.summary.renderOwnerHelperDirectCallers, 5);
  assert.equal(manifest.summary.renderOwnerHelperNearLayoutBRegistrationCallers, 4);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const renderOwnerRow = manifest.items.find((row) => row.addressHex === "0xd7f7e8");
  assert.equal(renderOwnerRow?.nearestDirectBranchTargetHex, "0xd7f7b8");
  assert.equal(renderOwnerRow.ownerTraceClass, "render-owner-helper-not-layout-b-flag");
  assert.equal(renderOwnerRow.layoutBDirectCallerCount, 0);
  assert.match(renderOwnerRow.directCallerAddressHexes, /0x8d27c4/);
});

test("exportCurrentNativeObjectAcOwnerTraceAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-object-ac-owner-trace-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeObjectAcOwnerTraceAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.candidateRows, 159);
  assert.equal(summary.rowsWithLayoutBDirectCallers, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.renderOwnerHelperRows, 1);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /owner-trace/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /render-owner-helper-not-layout-b-flag/);
});
