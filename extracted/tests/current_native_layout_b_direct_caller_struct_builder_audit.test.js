const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBDirectCallerStructBuilderAudit,
  exportCurrentNativeLayoutBDirectCallerStructBuilderAudit,
} = require("../tools/current_native_layout_b_direct_caller_struct_builder_audit");

test("layout B direct caller struct builder audit recovers original stack writers without render takeover", () => {
  const manifest = buildCurrentNativeLayoutBDirectCallerStructBuilderAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.builderRows, 4);
  assert.equal(manifest.summary.opcodeRows, 35);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.directBab250CallRows, 3);
  assert.equal(manifest.summary.directBab514CallRows, 3);
  assert.equal(manifest.summary.highCallerFieldWriterRows, 12);
  assert.equal(manifest.summary.dynamicCallerFieldHelperRows, 2);
  assert.equal(manifest.summary.fullCallerStructWriterRecoveredRows, 4);
  assert.equal(manifest.summary.indirectTableEntryRows, 3);
  assert.equal(manifest.summary.indirectTableEntryMismatchRows, 0);
  assert.equal(manifest.summary.indirectTableEntryCoverageRows, 3);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const localBab250 = manifest.builderRows.find((row) => row.id === "local-stack-builder-bab250");
  assert.equal(localBab250?.callerStructBase, "sp+0x8");
  assert.match(localBab250?.directCalls || "", /0x8b3350 -> 0xbab250/);
  assert.match(localBab250?.highFieldEvidence || "", /\+0x64=1/);
  assert.match(localBab250?.highFieldEvidence || "", /\+0x68=1/);

  const resourceA = manifest.builderRows.find((row) => row.id === "resource-stack-builder-a");
  assert.equal(resourceA?.callerStructBase, "sp+0x28");
  assert.match(resourceA?.directCalls || "", /0x983884 -> 0xbab250/);
  assert.match(resourceA?.directCalls || "", /0x983920 -> 0xbab514/);
  assert.match(resourceA?.dynamicHelperEvidence || "", /x21\+0xb2/);

  assert.equal(manifest.indirectTableEntryRows.length, 3);
  assert.deepEqual(
    manifest.indirectTableEntryRows.map((row) => row.actualTargetHex),
    ["0x8adf58", "0x8ae14c", "0x8ae1e8"],
  );
});

test("exportCurrentNativeLayoutBDirectCallerStructBuilderAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-direct-builder-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBDirectCallerStructBuilderAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.fullCallerStructWriterRecoveredRows, 4);
  assert.equal(summary.dynamicCallerFieldHelperRows, 2);
  assert.equal(summary.indirectTableEntryCoverageRows, 3);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /direct caller struct builder/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /fullCallerStructWriterRecoveredRows/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /resource-stack-builder-a/);
});
