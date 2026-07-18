const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBComponentSlotRegistrationAudit,
  exportCurrentNativeLayoutBComponentSlotRegistrationAudit,
} = require("../tools/current_native_layout_b_component_slot_registration_audit");

test("layout B component slot registration audit validates dispatch ownership without renderer promotion", () => {
  const manifest = buildCurrentNativeLayoutBComponentSlotRegistrationAudit({}, "TEST_DATE");
  const summary = manifest.summary;

  assert.equal(summary.opcodeRows, 22);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.ownerRegistrationCallerRows, 1);
  assert.equal(summary.typeIndexPublishRows, 1);
  assert.equal(summary.primarySlotInstallerRows, 1);
  assert.equal(summary.secondarySlotInstallerRows, 13);
  assert.equal(summary.tailSlotInstallerRows, 1);
  assert.equal(summary.slotInstallerRows, 15);
  assert.equal(summary.dispatchTableRows, 48);
  assert.equal(summary.dispatchRowsInText, 48);
  assert.equal(summary.fullCallerStructDispatchRows, 3);
  assert.equal(summary.compactStackHashDispatchRows, 1);
  assert.equal(summary.sourceProgramUpstreamDispatchRows, 1);
  assert.equal(summary.callerStructRuntimeProducerRows, 0);
  assert.equal(summary.directObjectAcProducerRows, 0);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.role === "component-slot-registration-call" && row.opcodeMatches));
  assert.ok(manifest.items.some((row) => row.tableAddressHex === "0x26c7980" && row.targetHex === "0x8adf58"));
  assert.ok(manifest.items.some((row) => row.tableAddressHex === "0x26c79d8" && row.entryClass === "compact-stack-hash-wrapper"));
});

test("exportCurrentNativeLayoutBComponentSlotRegistrationAudit writes viewer, report, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-component-slot-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBComponentSlotRegistrationAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.slotInstallerRows, 15);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /full-caller-struct-wrapper/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /component-slot-registration-call/);
});
