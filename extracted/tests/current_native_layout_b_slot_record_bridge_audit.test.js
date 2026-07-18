const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBSlotRecordBridgeAudit,
  exportCurrentNativeLayoutBSlotRecordBridgeAudit,
} = require("../tools/current_native_layout_b_slot_record_bridge_audit");

test("layout B slot record bridge audit separates slot manager dispatch from scene manager records", () => {
  const manifest = buildCurrentNativeLayoutBSlotRecordBridgeAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.managerGlobalRows, 2);
  assert.equal(manifest.summary.frameSlot4Rows, 3);
  assert.equal(manifest.summary.dispatcherObjectRows, 12);
  assert.equal(manifest.summary.activeRecordLayoutRows, 10);
  assert.equal(manifest.summary.activeRecordRangeFormulaRecovered, true);
  assert.equal(manifest.summary.moduleSlotRecordStrideBytes, 0x2e8);
  assert.equal(manifest.summary.activeObjectIndexArrayOffsetHex, "0x2d0");
  assert.equal(manifest.summary.activeObjectStorageBaseOffsetHex, "0x2c8");
  assert.equal(manifest.summary.activeObjectStrideOffsetHex, "0xa8");
  assert.equal(manifest.summary.activeRangePackedOffsetHex, "0x2d8");
  assert.equal(manifest.summary.layoutBRegisterBridgeRows, 9);
  assert.equal(manifest.summary.opcodeRows, 36);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.slot4ToSceneRecordBridgeRecovered, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.equal(manifest.moduleManagerGlobalHex, "0x311a958");
  assert.equal(manifest.sceneEntityManagerGlobalHex, "0x311a960");

  const objectMaterialization = manifest.dispatcherObjectRows.find((row) => row.addressHex === "0x188bf98");
  assert.equal(objectMaterialization?.role, "active-record-object-pointer-materialized");
  const recordStride = manifest.activeRecordLayoutRows.find((row) => row.role === "slot-dispatcher-record-stride-advance");
  assert.equal(recordStride?.actualOpcodeHex, "910ba2d6");
  const packedRange = manifest.activeRecordLayoutRows.find((row) => row.role === "active-record-packed-range-load");
  assert.equal(packedRange?.addressHex, "0x188bf4c");

  const addRecord = manifest.layoutBRegisterBridgeRows.find((row) => row.addressHex === "0x8d3a2c");
  assert.equal(addRecord?.role, "layout-b-registers-scene-manager-record");
});

test("exportCurrentNativeLayoutBSlotRecordBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-slot-record-bridge-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBSlotRecordBridgeAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.slot4ToSceneRecordBridgeRecovered, true);
  assert.equal(summary.activeRecordLayoutRows, 10);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /slot-record-bridge/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0x311a958/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /active-record-packed-range-load/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-registers-scene-manager-record/);
});
