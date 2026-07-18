const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBComponentTableEntryAudit,
  exportCurrentNativeLayoutBComponentTableEntryAudit,
} = require("../tools/current_native_layout_b_component_table_entry_audit");

test("layout B component table entry audit separates full caller struct wrappers from compact hash routes", () => {
  const manifest = buildCurrentNativeLayoutBComponentTableEntryAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.tableRows, 4);
  assert.equal(manifest.summary.tableEntryMismatchRows, 0);
  assert.equal(manifest.summary.fullCallerStructTableEntryRows, 3);
  assert.equal(manifest.summary.compactStackHashTableEntryRows, 1);
  assert.equal(manifest.summary.compactOpcodeRows, 15);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.compactConstantArgumentRows, 7);
  assert.equal(manifest.summary.highCallerFieldWriterRows, 0);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const fullWrapper = manifest.tableRows.find((row) => row.id === "full-caller-struct-fallback-wrapper-table-entry");
  assert.equal(fullWrapper?.sectionName, ".data.rel.ro");
  assert.equal(fullWrapper?.actualTargetHex, "0x8adf58");
  assert.match(fullWrapper?.evidence || "", /\+0x64/);

  const compactWrapper = manifest.tableRows.find((row) => row.id === "compact-stack-hash-wrapper-table-entry");
  assert.equal(compactWrapper?.actualTargetHex, "0x8ae9a8");
  assert.match(compactWrapper?.evidence || "", /stack mini-struct/);
});

test("exportCurrentNativeLayoutBComponentTableEntryAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-component-table-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBComponentTableEntryAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.fullCallerStructTableEntryRows, 3);
  assert.equal(summary.compactStackHashTableEntryRows, 1);
  assert.equal(summary.highCallerFieldWriterRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /component table entry/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /compactStackHashTableEntryRows/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /compact-stack-hash-wrapper-table-entry/);
});
