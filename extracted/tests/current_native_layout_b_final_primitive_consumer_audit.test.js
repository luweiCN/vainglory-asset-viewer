const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBFinalPrimitiveConsumerAudit,
  exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit,
} = require("../tools/current_native_layout_b_final_primitive_consumer_audit");

test("layout B final primitive consumer audit closes command vtable through glDrawArrays", () => {
  const manifest = buildCurrentNativeLayoutBFinalPrimitiveConsumerAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.commandConstructorRows, 9);
  assert.equal(manifest.summary.segmentBuilderRows, 13);
  assert.equal(manifest.summary.drawConsumerRows, 44);
  assert.equal(manifest.summary.bufferLifecycleRows, 10);
  assert.equal(manifest.summary.opcodeRows, 76);
  assert.equal(manifest.summary.vtablePointerRows, 4);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.pointerMismatchRows, 0);
  assert.equal(manifest.summary.commandVtableRecovered, true);
  assert.equal(manifest.summary.segmentListRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(manifest.summary.currentDrawStateRecovered, true);
  assert.equal(manifest.summary.currentProgramBindingRecovered, true);
  assert.equal(manifest.summary.currentDrawModeMappingRecovered, true);
  assert.equal(manifest.summary.currentAttributeBindingRecovered, true);
  assert.equal(manifest.summary.currentBufferLifecycleRecovered, true);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.textureSamplerFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const drawSlot = manifest.vtablePointerRows.find((row) => row.role === "command-vtable-slot-0x8-draw-consumer");
  assert.equal(drawSlot?.addressHex, "0x272f2f8");
  assert.equal(drawSlot?.actualPointerHex, "0xe3ce74");

  const useProgram = manifest.drawConsumerRows.find((row) => row.role === "draw-consumer-gl-use-program-call");
  assert.equal(useProgram?.addressHex, "0xe3d0a4");

  const drawArrays = manifest.drawConsumerRows.find((row) => row.role === "draw-consumer-gl-draw-arrays-call");
  assert.equal(drawArrays?.addressHex, "0xe3d14c");
});

test("exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-final-consumer-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBFinalPrimitiveConsumerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(summary.currentProgramBindingRecovered, true);
  assert.equal(summary.currentDrawModeMappingRecovered, true);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.textureSamplerFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /final primitive consumer/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe3ce74/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /draw-consumer-gl-draw-arrays-call/);
});
