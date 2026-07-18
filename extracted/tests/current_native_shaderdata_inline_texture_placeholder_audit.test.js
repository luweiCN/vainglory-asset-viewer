const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeShaderDataInlineTexturePlaceholderAudit,
  exportCurrentNativeShaderDataInlineTexturePlaceholderAudit,
} = require("../tools/current_native_shaderdata_inline_texture_placeholder_audit");

test("shaderData inline texture placeholder audit validates null type4 placeholder evidence", () => {
  const manifest = buildCurrentNativeShaderDataInlineTexturePlaceholderAudit();

  assert.equal(manifest.summary.opcodeRows, 38);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.inlineRecordConsumerRecovered, true);
  assert.equal(manifest.summary.inlineCallsiteRecovered, true);
  assert.equal(manifest.summary.inlineWrapperRecovered, true);
  assert.equal(manifest.summary.type4WriterDirectValueRecovered, true);
  assert.equal(manifest.summary.inlinePassLookupRecovered, true);
  assert.equal(manifest.summary.inlineTextureObjectRuntimeConstructionRecovered, true);
  assert.equal(manifest.summary.inlineTextureObjectUploadRecovered, true);
  assert.equal(manifest.summary.inlineType4RuntimePatchRecovered, true);
  assert.equal(manifest.summary.inlineRecordCallsitePassesNullValue, true);
  assert.equal(manifest.summary.inlineRecordCallsitePassesNullKey, true);
  assert.equal(manifest.summary.inlineWrapperStoresDirectValueSlot, true);
  assert.equal(manifest.summary.inlineType4PlaceholderObjectInitiallyNull, true);
  assert.equal(manifest.summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(manifest.summary.inlineTextureRuntimePatchRequired, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeShaderDataInlineTexturePlaceholderAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-inline-texture-placeholder-"));
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");

  const summary = exportCurrentNativeShaderDataInlineTexturePlaceholderAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.inlineType4PlaceholderObjectInitiallyNull, true);
  assert.equal(summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.inlineTextureObjectBindingRecovered, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /inline-callsite-null-value-arg/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /inline-type4-patch-call/);
});
