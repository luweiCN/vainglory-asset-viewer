const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit,
  exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit,
} = require("../tools/current_native_layout_b_resource_caller_dynamic_fields_audit");

test("layout B resource caller dynamic-field audit maps mirrored helpers into common apply", () => {
  const manifest = buildCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.helperBlockRows, 2);
  assert.equal(manifest.summary.helperOpcodeRows, 42);
  assert.equal(manifest.summary.commonApplyConsumerRows, 11);
  assert.equal(manifest.summary.opcodeRows, 53);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.callbackDispatchRows, 6);
  assert.equal(manifest.summary.resourceNameCallbackRows, 2);
  assert.equal(manifest.summary.vectorCallbackRows, 2);
  assert.equal(manifest.summary.scalarCallbackRows, 2);
  assert.equal(manifest.summary.commonApplyConsumerRecovered, true);
  assert.equal(manifest.summary.dynamicFieldsReachCommonApply, true);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const visibilityStore = manifest.helperRows.find((row) => row.addressHex === "0x983ae0");
  assert.equal(visibilityStore?.role, "visibility-byte-store");
  assert.equal(visibilityStore.sourceField, "x21+0xb2");
  assert.equal(visibilityStore.callerField, "caller+0x67");

  const vectorDispatch = manifest.helperRows.find((row) => row.addressHex === "0x984d00");
  assert.equal(vectorDispatch?.role, "vector-callback-dispatch");
  assert.equal(vectorDispatch.sourceField, "x21+0x50");
  assert.match(vectorDispatch.callerField, /0x58/);

  const commonConsumer = manifest.consumerRows.find((row) => row.addressHex === "0x8adf20");
  assert.equal(commonConsumer?.role, "scalar-callback-result-address");
  assert.equal(commonConsumer.callerField, "caller+0x34");
  assert.equal(commonConsumer.consumer, "0x8d4fbc");
});

test("exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-resource-dynamic-fields-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBResourceCallerDynamicFieldsAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.helperBlockRows, 2);
  assert.equal(summary.commonApplyConsumerRecovered, true);
  assert.equal(summary.directObjectAcProducerRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.opcodeRows, 53);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /resource caller dynamic-field/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /vector-callback-dispatch/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /caller\+0x67/);
});
