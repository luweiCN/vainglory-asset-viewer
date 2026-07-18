const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBManagerDrawBridgeAudit,
  exportCurrentNativeLayoutBManagerDrawBridgeAudit,
} = require("../tools/current_native_layout_b_manager_draw_bridge_audit");

test("layout B manager draw bridge audit proves object flags and target payload reach the particle draw filter", () => {
  const manifest = buildCurrentNativeLayoutBManagerDrawBridgeAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.layoutBRegisterFlagRows, 5);
  assert.equal(manifest.summary.managerAddRecordRows, 8);
  assert.equal(manifest.summary.backingFlagFilterRows, 6);
  assert.equal(manifest.summary.refreshPayloadRows, 9);
  assert.equal(manifest.summary.backingPayloadApplyRows, 6);
  assert.equal(manifest.summary.backingFlagRefreshRows, 3);
  assert.equal(manifest.summary.particleDrawFilterRows, 7);
  assert.equal(manifest.summary.objectAcToBackingFlagBridgeRecovered, true);
  assert.equal(manifest.summary.targetPayloadRefreshBridgeRecovered, true);
  assert.equal(manifest.summary.targetPayloadApplyRecovered, true);
  assert.equal(manifest.summary.optionalFlagRefreshRecovered, true);
  assert.equal(manifest.summary.particleDrawFilterBridgeRecovered, true);
  assert.equal(manifest.summary.renderQueueAppendRecovered, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);

  const objectFlags = manifest.layoutBRegisterFlagRows.find((row) => row.role === "layout-b-slot0-load-object-ac-flags");
  assert.equal(objectFlags?.addressHex, "0x8d3110");
  assert.match(objectFlags.evidence, /object\+0xac/);

  const backingFlags = manifest.backingFlagFilterRows.find((row) => row.role === "backing-record-flag-store");
  assert.equal(backingFlags?.addressHex, "0x18bf580");
  assert.match(backingFlags.evidence, /backing record \+0x18/);

  const filter = manifest.particleDrawFilterRows.find((row) => row.role === "particle-draw-filter-mask-0x200");
  assert.equal(filter?.addressHex, "0x820fd4");
  assert.match(filter.evidence, /0x200/);

  const refresh = manifest.refreshPayloadRows.find((row) => row.role === "layout-b-refresh-payload-target-plus-0x40");
  assert.equal(refresh?.addressHex, "0x8d4124");
  assert.match(refresh.evidence, /target\+0x40/);

  const payloadStore = manifest.backingPayloadApplyRows.find(
    (row) => row.role === "backing-refresh-payload-vector-store",
  );
  assert.equal(payloadStore?.addressHex, "0x18bf604");
  assert.match(payloadStore.evidence, /x2 payload/);

  const flagStore = manifest.backingFlagRefreshRows.find((row) => row.role === "backing-refresh-flags-store");
  assert.equal(flagStore?.addressHex, "0x18bf618");
  assert.match(flagStore.evidence, /backing record \+0x18/);
});

test("exportCurrentNativeLayoutBManagerDrawBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-manager-draw-bridge-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBManagerDrawBridgeAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.objectAcToBackingFlagBridgeRecovered, true);
  assert.equal(summary.targetPayloadRefreshBridgeRecovered, true);
  assert.equal(summary.targetPayloadApplyRecovered, true);
  assert.equal(summary.optionalFlagRefreshRecovered, true);
  assert.equal(summary.particleDrawFilterBridgeRecovered, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /manager draw bridge/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /object\+0xac/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /particle-draw-filter-mask-0x200/);
});
