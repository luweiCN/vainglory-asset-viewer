const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderDataType4EntrySemanticsAudit,
  exportCurrentNativeShaderDataType4EntrySemanticsAudit,
} = require("../tools/current_native_shaderdata_type4_entry_semantics_audit");

test("shaderData type4 entry semantics are opcode bounded", () => {
  const manifest = buildCurrentNativeShaderDataType4EntrySemanticsAudit({}, "TEST_DATE");
  const { summary } = manifest;

  assert.equal(summary.opcodeRows, 32);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.sharedType4EntryWriterRecovered, true);
  assert.equal(summary.externalTextureType4WrapperRecovered, true);
  assert.equal(summary.inlineTextureType4WrapperRecovered, true);
  assert.equal(summary.runtimeType4ValuePatchRecovered, true);
  assert.equal(summary.type4EntrySemanticsRecovered, true);
  assert.equal(summary.type4HeaderMaskHex, "0x40000000");
  assert.equal(summary.directValueFlagBit, 31);
  assert.equal(summary.sourceIndexBits, "0..11");
  assert.equal(summary.valueOffsetBits, "12..27");
  assert.equal(summary.typeBits, "28..30");
  assert.equal(summary.type4ValueWordCount, 2);
  assert.equal(summary.runtimePatchMatchesSourceIndexAndType4, true);
  assert.equal(summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeShaderDataType4EntrySemanticsAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shaderdata-type4-entry-semantics-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeShaderDataType4EntrySemanticsAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.type4EntrySemanticsRecovered, true);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.type4HeaderMaskHex, "0x40000000");
  assert.match(fs.readFileSync(tsvOut, "utf8"), /runtime-type4-value-patch/);
});
