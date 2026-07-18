const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBEntryProviderPayloadBridgeAudit,
  exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit,
} = require("../tools/current_native_layout_b_entry_provider_payload_bridge_audit");

test("layout B entry provider payload bridge audit ties entry identity to provider accessors", () => {
  const manifest = buildCurrentNativeLayoutBEntryProviderPayloadBridgeAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.entryIdentityRows, 8);
  assert.equal(manifest.summary.entryPrimaryHelperRows, 5);
  assert.equal(manifest.summary.providerVtableRows, 4);
  assert.equal(manifest.summary.providerAccessorRows, 4);
  assert.equal(manifest.summary.ownerBProviderUseRows, 9);
  assert.equal(manifest.summary.opcodeRows, 26);
  assert.equal(manifest.summary.pointerRows, 4);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.pointerMismatchRows, 0);
  assert.equal(manifest.summary.layoutBEntryIdentityRecovered, true);
  assert.equal(manifest.summary.managerEntryToOwnerBRecovered, true);
  assert.equal(manifest.summary.entryProviderVtableRecovered, true);
  assert.equal(manifest.summary.providerTargetHandleFormulaRecovered, true);
  assert.equal(manifest.summary.providerTransformSourceFormulaRecovered, true);
  assert.equal(manifest.summary.ownerBUsesProviderTargetAndTransformRecovered, true);
  assert.equal(manifest.summary.entryHelperPayloadBridgeRecovered, true);
  assert.equal(manifest.summary.targetPayloadToFinalDrawFormulaRecovered, false);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const targetHandleSlot = manifest.providerVtableRows.find((row) => row.role === "provider-vtable-slot-0x10-target-handle");
  assert.equal(targetHandleSlot?.addressHex, "0x2726720");
  assert.equal(targetHandleSlot?.actualPointerHex, "0xd7fcac");

  const transformSlot = manifest.providerVtableRows.find((row) => row.role === "provider-vtable-slot-0x18-transform-source");
  assert.equal(transformSlot?.addressHex, "0x2726728");
  assert.equal(transformSlot?.actualPointerHex, "0xd7ff44");

  const targetAccessor = manifest.providerAccessorRows.find((row) => row.role === "provider-slot-0x10-return-object-plus-0x30");
  assert.match(targetAccessor.evidence, /object\+0x58/);

  const helperPayload = manifest.entryPrimaryHelperRows.find((row) => row.role === "entry-primary-table-payload-object-plus-0x40");
  assert.equal(helperPayload?.addressHex, "0xd7fc68");
  assert.match(helperPayload.evidence, /object \+0x40/);
});

test("exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-entry-provider-payload-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.layoutBEntryIdentityRecovered, true);
  assert.equal(summary.providerTargetHandleFormulaRecovered, true);
  assert.equal(summary.providerTransformSourceFormulaRecovered, true);
  assert.equal(summary.targetPayloadToFinalDrawFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /entry\/provider\/payload bridge/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0x2726710/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /provider-vtable-slot-0x18-transform-source/);
});
