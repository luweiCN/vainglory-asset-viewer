const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBActiveRecordLifecycleAudit,
  exportCurrentNativeLayoutBActiveRecordLifecycleAudit,
} = require("../tools/current_native_layout_b_active_record_lifecycle_audit");

test("layout B active-record lifecycle audit recovers object pool mechanics without render promotion", () => {
  const manifest = buildCurrentNativeLayoutBActiveRecordLifecycleAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.managerInitializerRows, 6);
  assert.equal(manifest.summary.recordInitializerRows, 7);
  assert.equal(manifest.summary.layoutBRecordRegistrationRows, 9);
  assert.equal(manifest.summary.arenaAllocationRows, 10);
  assert.equal(manifest.summary.objectAcquireRows, 13);
  assert.equal(manifest.summary.objectReleaseRows, 11);
  assert.equal(manifest.summary.frameDispatchRows, 5);
  assert.equal(manifest.summary.opcodeRows, 61);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.managerRecordStrideBytes, 0x2e8);
  assert.equal(manifest.summary.layoutBObjectStrideBytes, 0x118);
  assert.equal(manifest.summary.managerRecordCapacity, 110);
  assert.equal(manifest.summary.managerRecordPoolByteSpan, 0x13fb0);
  assert.equal(manifest.summary.managerRecordCountOffsetHex, "0x13fb0");
  assert.equal(manifest.summary.managerCurrentRecordOffsetHex, "0x13fb8");
  assert.equal(manifest.summary.activeObjectBackPointerOffsetHex, "0x8");
  assert.equal(manifest.summary.activeRecordBitsetOffsetHex, "0x2e0");
  assert.equal(manifest.summary.activeRecordLifecycleRecovered, true);
  assert.equal(manifest.summary.layoutBRecordRegistrationRecovered, true);
  assert.equal(manifest.summary.activeObjectAcquireReleaseRecovered, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const stride = manifest.layoutBRecordRegistrationRows.find(
    (row) => row.role === "layout-b-register-stores-record-index-and-object-stride",
  );
  assert.equal(stride?.addressHex, "0x8d2f90");
  assert.equal(stride?.actualOpcodeHex, "2914ad49");

  const acquire = manifest.objectAcquireRows.find((row) => row.role === "active-record-acquire-materializes-object");
  assert.equal(acquire?.addressHex, "0x188bbec");

  const release = manifest.objectReleaseRows.find((row) => row.role === "active-record-release-clears-active-bit");
  assert.equal(release?.addressHex, "0x188bcd4");
});

test("exportCurrentNativeLayoutBActiveRecordLifecycleAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-active-record-lifecycle-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBActiveRecordLifecycleAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.activeRecordLifecycleRecovered, true);
  assert.equal(summary.activeObjectAcquireReleaseRecovered, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /active-record lifecycle/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0x13fb0/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-register-stores-record-index-and-object-stride/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /active-record-release-clears-active-bit/);
});
