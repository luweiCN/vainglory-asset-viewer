const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBTargetStatusAudit,
  exportCurrentNativeLayoutBTargetStatusAudit,
} = require("../tools/current_native_layout_b_target_status_audit");

test("layout B target status audit separates target+0x64 state from object+0xac draw flags", () => {
  const manifest = buildCurrentNativeLayoutBTargetStatusAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.opcodeRows, 18);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.targetStatusLowStateRows, 6);
  assert.equal(manifest.summary.targetStatusBit200Rows, 3);
  assert.equal(manifest.summary.layoutBTargetStatusGateRows, 5);
  assert.equal(manifest.summary.object110MirrorRows, 2);
  assert.equal(manifest.summary.targetStatusSeparatedFromObjectAc, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const targetBit200 = manifest.opcodeRows.find((row) => row.role === "target-status-or-bit-0x200");
  assert.equal(targetBit200?.addressHex, "0xe3cde8");
  assert.equal(targetBit200.field, "target+0x64 bit 9");

  const objectMirror = manifest.opcodeRows.find((row) => row.role === "object-state-bit1-target-bit11-mirror");
  assert.equal(objectMirror?.addressHex, "0x8d4598");
  assert.match(objectMirror.evidence, /target\+0x64 bit 11/);

  const statusGate = manifest.opcodeRows.find((row) => row.role === "layout-b-slot4-target-status-0x28-compare");
  assert.equal(statusGate?.addressHex, "0x8d3160");
  assert.match(statusGate.evidence, /not object\+0xac/);
});

test("exportCurrentNativeLayoutBTargetStatusAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-target-status-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBTargetStatusAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.targetStatusSeparatedFromObjectAc, true);
  assert.equal(summary.targetStatusBit200Rows, 3);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /target\+0x64 status/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /targetStatusSeparatedFromObjectAc/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-slot4-target-status-0x28-compare/);
});
