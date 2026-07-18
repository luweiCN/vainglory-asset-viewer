const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBPrimitiveModeDispatchAudit,
  exportCurrentNativeLayoutBPrimitiveModeDispatchAudit,
} = require("../tools/current_native_layout_b_primitive_mode_dispatch_audit");

test("layout B primitive mode dispatch audit maps payload node flags to original builder calls", () => {
  const manifest = buildCurrentNativeLayoutBPrimitiveModeDispatchAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.payloadModeSourceRows, 4);
  assert.equal(manifest.summary.modeTableRows, 27);
  assert.equal(manifest.summary.nestedDispatchRows, 6);
  assert.equal(manifest.summary.builderCallRows, 16);
  assert.equal(manifest.summary.builderEntryRows, 16);
  assert.equal(manifest.summary.outputPatternRows, 15);
  assert.equal(manifest.summary.opcodeRows, 57);
  assert.equal(manifest.summary.tableRows, 27);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.tableMismatchRows, 0);
  assert.equal(manifest.summary.outerModeEntries, 9);
  assert.equal(manifest.summary.nestedModeEntries, 18);
  assert.equal(manifest.summary.uniqueBuilderTargets, 16);
  assert.equal(manifest.summary.outerModeDispatchRecovered, true);
  assert.equal(manifest.summary.nestedModeDispatchRecovered, true);
  assert.equal(manifest.summary.builderCallMatrixRecovered, true);
  assert.equal(manifest.summary.outputRecordShapePartiallyRecovered, true);
  assert.equal(manifest.summary.materialFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const outerMode7 = manifest.modeTableRows.find((row) => row.table === "outer-low-nibble" && row.index === 7);
  assert.equal(outerMode7?.actualTargetHex, "0xe39f8c");

  const nestedC2 = manifest.modeTableRows.find((row) => row.table === "nested-mode-c" && row.index === 2);
  assert.equal(nestedC2?.actualTargetHex, "0xe3a26c");

  const call411d8 = manifest.builderCallRows.find((row) => row.role === "nested-mode-c-index-2-builder-call");
  assert.equal(call411d8?.addressHex, "0xe3a29c");
  assert.equal(call411d8?.targetHex, "0xe411d8");

  const wideOutput = manifest.outputPatternRows.find((row) => row.role === "builder-6c0-record-loop-limit");
  assert.equal(wideOutput?.addressHex, "0xe41128");
  assert.match(wideOutput.evidence, /0x6c0/);
});

test("exportCurrentNativeLayoutBPrimitiveModeDispatchAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-primitive-dispatch-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBPrimitiveModeDispatchAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.builderCallMatrixRecovered, true);
  assert.equal(summary.outputRecordShapePartiallyRecovered, true);
  assert.equal(summary.materialFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /primitive mode dispatch/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe39c90/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /nested-mode-c-index-2-builder-call/);
});
