const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBTargetPayloadAudit,
  exportCurrentNativeLayoutBTargetPayloadAudit,
} = require("../tools/current_native_layout_b_target_payload_audit");

test("layout B target payload audit proves object+0x50 parameter writes and +0x40 payload dispatch", () => {
  const manifest = buildCurrentNativeLayoutBTargetPayloadAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.layoutBParameterUpdateRows, 6);
  assert.equal(manifest.summary.dynamicParameterUpdateRows, 2);
  assert.equal(manifest.summary.parameterWriterMechanicRows, 5);
  assert.equal(manifest.summary.payloadBridgeRows, 4);
  assert.equal(manifest.summary.targetObjectLoadRows, 9);
  assert.equal(manifest.summary.payloadBuilderReturnsTargetPlus40, true);
  assert.equal(manifest.summary.pfxEmitterOwnerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);

  const colorUpdate = manifest.layoutBParameterUpdateRows.find((row) => row.role === "layout-b-param-color");
  assert.equal(colorUpdate?.targetLoadAddressHex, "0x8d3b3c");
  assert.equal(colorUpdate.callAddressHex, "0x8d3b40");

  const payloadReturn = manifest.payloadBridgeRows.find((row) => row.role === "target-payload-builder-adds-0x40");
  assert.equal(payloadReturn?.addressHex, "0xe3a510");
  assert.equal(payloadReturn.actualOpcodeHex, "91010000");
});

test("exportCurrentNativeLayoutBTargetPayloadAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-target-payload-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBTargetPayloadAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.payloadBuilderReturnsTargetPlus40, true);
  assert.equal(summary.pfxEmitterOwnerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /target-payload/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /object\+0x50/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-param-color/);
});
