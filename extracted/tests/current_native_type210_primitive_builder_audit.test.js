const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeType210PrimitiveBuilderAudit,
  exportCurrentNativeType210PrimitiveBuilderAudit,
} = require("../tools/current_native_type210_primitive_builder_audit");

test("type 0x210 primitive builder audit recovers the local 18-slot record layout", () => {
  const manifest = buildCurrentNativeType210PrimitiveBuilderAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.opcodeRows, 20);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderCallbackToPrimitiveBuilderRecovered, true);
  assert.equal(manifest.summary.requiredPrimitiveSlots, 18);
  assert.equal(manifest.summary.slotStrideBytes, 24);
  assert.equal(manifest.summary.pointerAdvanceRows, 18);
  assert.equal(manifest.summary.countIncrementRows, 18);
  assert.equal(manifest.summary.colorByteStoreRows, 72);
  assert.equal(manifest.summary.floatPairStoreRows, 36);
  assert.equal(manifest.summary.floatScalarStoreRows, 18);
  assert.equal(manifest.summary.fullColorRecordRows, 18);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const capacity = manifest.opcodeRows.find((row) => row.role === "primitive-builder-capacity-required-18");
  assert.equal(capacity?.addressHex, "0x8cb804");
  assert.match(capacity.evidence, /0x12/);

  const call = manifest.opcodeRows.find((row) => row.role === "render-callback-calls-primitive-builder");
  assert.equal(call?.addressHex, "0x8cb60c");
  assert.match(call.evidence, /0x8cb7fc/);

  const firstAdvance = manifest.opcodeRows.find((row) => row.role === "primitive-builder-first-pointer-advance");
  assert.equal(firstAdvance?.addressHex, "0x8cb8d4");
  assert.match(firstAdvance.evidence, /0x18/);
});

test("exportCurrentNativeType210PrimitiveBuilderAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-type210-primitive-builder-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeType210PrimitiveBuilderAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.renderCallbackToPrimitiveBuilderRecovered, true);
  assert.equal(summary.requiredPrimitiveSlots, 18);
  assert.equal(summary.fullColorRecordRows, 18);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /type 0x210 primitive builder/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /slotStrideBytes/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /primitive-builder-first-pointer-advance/);
});
