const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBOwnerBVtableDispatchAudit,
  exportCurrentNativeLayoutBOwnerBVtableDispatchAudit,
} = require("../tools/current_native_layout_b_owner_b_vtable_dispatch_audit");

test("layout B ownerB vtable dispatch audit ties entry owner slot to concrete submit branches", () => {
  const manifest = buildCurrentNativeLayoutBOwnerBVtableDispatchAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.ownerLifecycleRows, 10);
  assert.equal(manifest.summary.ownerConstructorRows, 9);
  assert.equal(manifest.summary.vtableSlotRows, 5);
  assert.equal(manifest.summary.ownerDispatchRows, 43);
  assert.equal(manifest.summary.submitPathRows, 31);
  assert.equal(manifest.summary.opcodeRows, 93);
  assert.equal(manifest.summary.pointerRows, 5);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.pointerMismatchRows, 0);
  assert.equal(manifest.summary.ownerBGlobalSlotRecovered, true);
  assert.equal(manifest.summary.ownerBVtableSlot10Recovered, true);
  assert.equal(manifest.summary.entryTransformProviderRecovered, true);
  assert.equal(manifest.summary.payloadBatchSubmitBridgeRecovered, true);
  assert.equal(manifest.summary.submitPathSplitRecovered, true);
  assert.equal(manifest.summary.primitiveFormulaRecovered, false);
  assert.equal(manifest.summary.materialFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const slot10 = manifest.vtableSlotRows.find((row) => row.role === "owner-b-vtable-slot-0x10-render-build");
  assert.equal(slot10?.addressHex, "0x272f2b8");
  assert.equal(slot10?.actualPointerHex, "0xe3d400");

  const entryProvider = manifest.ownerDispatchRows.find((row) => row.role === "entry-provider-vtable-slot-0x10-call");
  assert.equal(entryProvider?.addressHex, "0xe3d440");
  assert.match(entryProvider.evidence, /x4 entry/);

  const activeSubmit = manifest.ownerDispatchRows.find((row) => row.role === "owner-b-active-submit-call");
  assert.equal(activeSubmit?.addressHex, "0xe3d5bc");
  assert.match(activeSubmit.evidence, /0xe3cb54/);

  const fallbackSubmit = manifest.ownerDispatchRows.find((row) => row.role === "owner-b-fallback-submit-call");
  assert.equal(fallbackSubmit?.addressHex, "0xe3d5ec");
  assert.match(fallbackSubmit.evidence, /0xe39c90/);
});

test("exportCurrentNativeLayoutBOwnerBVtableDispatchAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-owner-b-vtable-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBOwnerBVtableDispatchAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.ownerBVtableSlot10Recovered, true);
  assert.equal(summary.payloadBatchSubmitBridgeRecovered, true);
  assert.equal(summary.submitPathSplitRecovered, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /ownerB vtable dispatch/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe3d400/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /owner-b-vtable-slot-0x10-render-build/);
});
