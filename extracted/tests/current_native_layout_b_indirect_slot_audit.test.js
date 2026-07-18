const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBIndirectSlotAudit,
  exportCurrentNativeLayoutBIndirectSlotAudit,
} = require("../tools/current_native_layout_b_indirect_slot_audit");

test("layout B indirect slot audit proves runtime slot installation and dispatch boundaries", () => {
  const manifest = buildCurrentNativeLayoutBIndirectSlotAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.registrationRows, 4);
  assert.equal(manifest.summary.primarySlotInstallRows, 3);
  assert.equal(manifest.summary.tailSlotInstallRows, 1);
  assert.equal(manifest.summary.callbackAddressRecoveredRows, 4);
  assert.equal(manifest.summary.sharedSlotMechanicRows, 9);
  assert.equal(manifest.summary.frameDispatchRows, 5);
  assert.equal(manifest.summary.layoutBRelevantFrameDispatchRows, 1);
  assert.equal(manifest.summary.callbackArgumentRows, 9);
  assert.equal(manifest.summary.primaryCallbackArgumentRows, 6);
  assert.equal(manifest.summary.tailCallbackArgumentRows, 3);
  assert.equal(manifest.summary.callbackArgumentShapeRecovered, true);
  assert.equal(manifest.summary.staticCallbackPointerRows, 0);
  assert.equal(manifest.summary.opcodeRows, 27);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const slot4 = manifest.registrationRows.find((row) => row.slot === 4 && row.installKind === "primary-slot");
  assert.equal(slot4?.callbackAddressHex, "0x8d3140");
  assert.equal(slot4.installerTargetHex, "0x188c2f4");

  const slot4Tail = manifest.registrationRows.find((row) => row.slot === 4 && row.installKind === "tail-slot");
  assert.equal(slot4Tail?.callbackAddressHex, "0x8d319c");
  assert.equal(slot4Tail.installerTargetHex, "0x188c328");

  const activeCallbackCall = manifest.sharedSlotMechanicRows.find((row) => row.role === "active-record-callback-call");
  assert.equal(activeCallbackCall?.addressHex, "0x188bf9c");
  assert.equal(activeCallbackCall.actualOpcodeHex, "d63f0160");
  const callbackX0 = manifest.callbackArgumentRows.find((row) => row.role === "primary-callback-x0-materialize");
  assert.equal(callbackX0?.addressHex, "0x188bf98");
  assert.equal(callbackX0.actualOpcodeHex, "8b080140");

  const frameSlot4 = manifest.frameDispatchRows.find((row) => row.slot === 4);
  assert.equal(frameSlot4?.callerAddressHex, "0x188e6b8");
});

test("exportCurrentNativeLayoutBIndirectSlotAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-indirect-slot-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBIndirectSlotAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.registrationRows, 4);
  assert.equal(summary.staticCallbackPointerRows, 0);
  assert.equal(summary.callbackArgumentRows, 9);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.frameDispatchRows, 5);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /indirect-slot/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /primary-callback-x0-materialize/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-slot4-update/);
});
