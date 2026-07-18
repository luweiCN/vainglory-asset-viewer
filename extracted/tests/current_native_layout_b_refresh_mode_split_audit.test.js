const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBRefreshModeSplitAudit,
  exportCurrentNativeLayoutBRefreshModeSplitAudit,
} = require("../tools/current_native_layout_b_refresh_mode_split_audit");

test("layout B refresh mode split audit proves payload and flag refresh callsites are separate", () => {
  const manifest = buildCurrentNativeLayoutBRefreshModeSplitAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.opcodeRows, 10);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.finalPayloadRefreshRows, 4);
  assert.equal(manifest.summary.visibilityFlagRefreshRows, 4);
  assert.equal(manifest.summary.backingOptionalGateRows, 2);
  assert.equal(manifest.summary.finalRefreshPassesPayloadOnly, true);
  assert.equal(manifest.summary.visibilityRefreshPassesFlagsOnly, true);
  assert.equal(manifest.summary.payloadAndFlagRefreshModesSeparated, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const finalX3 = manifest.opcodeRows.find((row) => row.role === "final-refresh-null-flag-arg");
  assert.equal(finalX3?.addressHex, "0x8d4130");
  assert.match(finalX3.evidence, /x3 = null/);

  const visibilityX2 = manifest.opcodeRows.find((row) => row.role === "visibility-refresh-null-payload-arg");
  assert.equal(visibilityX2?.addressHex, "0x8d50c0");
  assert.match(visibilityX2.evidence, /x2 = null/);
});

test("exportCurrentNativeLayoutBRefreshModeSplitAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-refresh-mode-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBRefreshModeSplitAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.payloadAndFlagRefreshModesSeparated, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /refresh mode split/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /finalRefreshPassesPayloadOnly/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /visibility-refresh-null-payload-arg/);
});
