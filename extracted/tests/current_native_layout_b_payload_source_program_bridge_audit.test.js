const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBPayloadSourceProgramBridgeAudit,
  exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit,
} = require("../tools/current_native_layout_b_payload_source_program_bridge_audit");

test("layout B payload source/program bridge audit ties node +0x208 to source table and parameter application", () => {
  const manifest = buildCurrentNativeLayoutBPayloadSourceProgramBridgeAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.schemaSourceObjectRows, 13);
  assert.equal(manifest.summary.sourceObjectFactoryRows, 16);
  assert.equal(manifest.summary.drawSourceProgramRows, 11);
  assert.equal(manifest.summary.parameterApplyRows, 15);
  assert.equal(manifest.summary.opcodeRows, 55);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.schemaSourceObjectConstructionRecovered, true);
  assert.equal(manifest.summary.sourceObjectLookupAndFallbackRecovered, true);
  assert.equal(manifest.summary.drawSourceProgramSelectionRecovered, true);
  assert.equal(manifest.summary.sourceParameterApplyFormulaRecovered, true);
  assert.equal(manifest.summary.payloadSourceProgramBridgeRecovered, true);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const sourceStore = manifest.schemaSourceObjectRows.find((row) => row.role === "schema-source-object-store");
  assert.equal(sourceStore?.addressHex, "0xe3bc68");
  assert.match(sourceStore.evidence, /node \+0x208/);

  const selectedEntry = manifest.drawSourceProgramRows.find((row) => row.role === "draw-selected-source-entry-load");
  assert.equal(selectedEntry?.addressHex, "0xe3d07c");
  assert.match(selectedEntry.evidence, /selected source entry/);

  const valueOffset = manifest.parameterApplyRows.find((row) => row.role === "param-value-offset-extract");
  assert.equal(valueOffset?.addressHex, "0x189ca14");
  assert.match(valueOffset.evidence, /bits 12..27/);
});

test("exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-source-program-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.payloadSourceProgramBridgeRecovered, true);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /payload source\/program bridge/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe3bc68/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /draw-param-apply-call/);
});
