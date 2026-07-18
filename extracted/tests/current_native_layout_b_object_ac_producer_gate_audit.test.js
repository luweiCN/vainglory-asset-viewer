const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBObjectAcProducerGateAudit,
  exportCurrentNativeLayoutBObjectAcProducerGateAudit,
} = require("../tools/current_native_layout_b_object_ac_producer_gate_audit");

test("layout B object +0xac producer gate keeps static evidence diagnostic-only", () => {
  const manifest = buildCurrentNativeLayoutBObjectAcProducerGateAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.sourceRows, 14);
  assert.equal(manifest.summary.negativeClosedRows, 13);
  assert.equal(manifest.summary.staticExactProducerRows, 0);
  assert.equal(manifest.summary.runtimeObservedProducerRows, 0);
  assert.equal(manifest.summary.unresolvedRuntimeRows, 1);
  assert.equal(manifest.summary.runtimeCaptureStatus, "capture-missing");
  assert.equal(manifest.summary.staticDirectStoreGateClosed, true);
  assert.equal(manifest.summary.directOwnerTraceGateClosed, true);
  assert.equal(manifest.summary.callerStructApplyGateClosed, true);
  assert.equal(manifest.summary.producerResolved, false);
  assert.equal(manifest.summary.remainingProofRoute, "runtime-capture-required");
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const runtimeRow = manifest.items.find((row) => row.id === "layout-b-object-ac-runtime-capture");
  assert.equal(runtimeRow?.needsRuntimeCapture, true);
  assert.equal(runtimeRow.resolvedProducerRows, 0);

  const commonApplyRow = manifest.items.find((row) => row.id === "common-apply-setter-fields");
  assert.equal(commonApplyRow?.evidenceState, "negative-closed");
  assert.match(commonApplyRow.evidence, /0 object\+0xac stores/);
});

test("exportCurrentNativeLayoutBObjectAcProducerGateAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-object-ac-producer-gate-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBObjectAcProducerGateAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.remainingProofRoute, "runtime-capture-required");
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.staticDirectStoreGateClosed, true);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /producer gate/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-object-ac-runtime-capture/);
});
