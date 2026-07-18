const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBCallbackBoundaryAudit,
  exportCurrentNativeLayoutBCallbackBoundaryAudit,
} = require("../tools/current_native_layout_b_callback_boundary_audit");

test("layout B callback boundary audit does not branch into out-of-family +0xac candidates", () => {
  const manifest = buildCurrentNativeLayoutBCallbackBoundaryAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.branchRows, 11);
  assert.equal(manifest.summary.candidateTargetHitRows, 0);
  assert.equal(manifest.summary.slotCallbackBranchRows, 6);
  assert.equal(manifest.summary.registerBodyBranchRows, 2);
  assert.equal(manifest.summary.refreshGateBranchRows, 3);
  assert.equal(manifest.summary.managerAddRecordRows, 1);
  assert.equal(manifest.summary.managerRefreshRows, 1);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const slot0 = manifest.items.find((row) => row.addressHex === "0x8d3118");
  assert.equal(slot0?.targetHex, "0x8d398c");
  assert.equal(slot0.targetHitsOutOfFamilyCandidate, false);

  const addRecord = manifest.items.find((row) => row.targetHex === "0x188eee0");
  assert.equal(addRecord?.role, "layout-b-manager-add-record");
});

test("exportCurrentNativeLayoutBCallbackBoundaryAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-callback-boundary-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBCallbackBoundaryAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.branchRows, 11);
  assert.equal(summary.candidateTargetHitRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.managerRefreshRows, 1);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /callback-boundary/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-manager-add-record/);
});
