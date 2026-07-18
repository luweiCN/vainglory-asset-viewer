const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBCallerStructInitializerAudit,
  exportCurrentNativeLayoutBCallerStructInitializerAudit,
} = require("../tools/current_native_layout_b_caller_struct_initializer_audit");

test("layout B caller struct initializer audit separates default fields from visibility-control fields", () => {
  const manifest = buildCurrentNativeLayoutBCallerStructInitializerAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.blockRows, 3);
  assert.equal(manifest.summary.opcodeRows, 27);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.defaultFieldStoreRows, 15);
  assert.equal(manifest.summary.fallbackZeroStoreRows, 6);
  assert.equal(manifest.summary.visibilityControlDefaultRows, 0);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const initializer = manifest.blockRows.find((row) => row.id === "caller-struct-root-initializer");
  assert.match(initializer?.defaultFieldOffsets || "", /\+0x0\/\+0x4\/\+0x8\/\+0xc/);
  assert.match(initializer?.evidence || "", /0xbdc28c/);
  assert.match(initializer?.evidence || "", /0x990ba0/);

  const laterDefaults = manifest.blockRows.find((row) => row.id === "caller-struct-secondary-defaults");
  assert.match(laterDefaults?.defaultFieldOffsets || "", /\+0x20/);
  assert.match(laterDefaults?.defaultFieldOffsets || "", /\+0x3c/);
});

test("exportCurrentNativeLayoutBCallerStructInitializerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-caller-init-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBCallerStructInitializerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.visibilityControlDefaultRows, 0);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /caller struct initializer/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /visibilityControlDefaultRows/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /caller-struct-secondary-defaults/);
});
