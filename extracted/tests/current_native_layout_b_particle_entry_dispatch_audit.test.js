const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBParticleEntryDispatchAudit,
  exportCurrentNativeLayoutBParticleEntryDispatchAudit,
} = require("../tools/current_native_layout_b_particle_entry_dispatch_audit");

test("layout B particle entry dispatch audit ties filtered particle entries to owner vtable dispatch", () => {
  const manifest = buildCurrentNativeLayoutBParticleEntryDispatchAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.sharedEntryArrayRows, 4);
  assert.equal(manifest.summary.particleTaskRows, 6);
  assert.equal(manifest.summary.compositeConstructorRows, 4);
  assert.equal(manifest.summary.compositeDispatchRows, 8);
  assert.equal(manifest.summary.layoutBEntryBridgeRows, 4);
  assert.equal(manifest.summary.entryHelperDispatchRows, 5);
  assert.equal(manifest.summary.opcodeRows, 31);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.particleCompositeDispatchRecovered, true);
  assert.equal(manifest.summary.layoutBEntryToCompositeDispatchBridgeRecovered, true);
  assert.equal(manifest.summary.managerEntryToOwnerVtableRecovered, true);
  assert.equal(manifest.summary.globalHelperDispatchLinked, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const entryLoad = manifest.sharedEntryArrayRows.find((row) => row.role === "entry-manager-record-entry-load");
  assert.equal(entryLoad?.addressHex, "0x188f0e4");
  assert.match(entryLoad.evidence, /manager record \+0x8/);

  const ownerCall = manifest.compositeDispatchRows.find((row) => row.role === "composite-dispatch-call-owner-vtable-slot-0x10");
  assert.equal(ownerCall?.addressHex, "0x18a14b4");
  assert.match(ownerCall.evidence, /entry \+0x8/);

  const layoutBEntry = manifest.layoutBEntryBridgeRows.find((row) => row.role === "layout-b-register-entry-pointer-object-plus-0x30");
  assert.equal(layoutBEntry?.addressHex, "0x8d3a20");
  assert.match(layoutBEntry.evidence, /object\+0x30/);

  const helperDispatch = manifest.entryHelperDispatchRows.find((row) => row.role === "entry-primary-table-global-helper-dispatch");
  assert.equal(helperDispatch?.addressHex, "0xd7fc70");
  assert.match(helperDispatch.evidence, /0x18906b0/);
});

test("exportCurrentNativeLayoutBParticleEntryDispatchAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-particle-entry-dispatch-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBParticleEntryDispatchAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.layoutBEntryToCompositeDispatchBridgeRecovered, true);
  assert.equal(summary.managerEntryToOwnerVtableRecovered, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /particle entry dispatch/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /owner vtable/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /composite-dispatch-call-owner-vtable-slot-0x10/);
});
