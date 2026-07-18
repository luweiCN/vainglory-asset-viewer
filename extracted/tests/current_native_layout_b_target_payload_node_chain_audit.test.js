const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBTargetPayloadNodeChainAudit,
  exportCurrentNativeLayoutBTargetPayloadNodeChainAudit,
} = require("../tools/current_native_layout_b_target_payload_node_chain_audit");

test("layout B target payload node chain audit ties target list records to final consumer fields", () => {
  const manifest = buildCurrentNativeLayoutBTargetPayloadNodeChainAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.primaryRecordAllocatorRows, 5);
  assert.equal(manifest.summary.payloadNodeInitRows, 8);
  assert.equal(manifest.summary.schemaPayloadWriteRows, 12);
  assert.equal(manifest.summary.targetListRows, 7);
  assert.equal(manifest.summary.targetTraversalRows, 5);
  assert.equal(manifest.summary.finalConsumerRows, 5);
  assert.equal(manifest.summary.payloadActiveCountRuntimeRows, 23);
  assert.equal(manifest.summary.opcodeRows, 65);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.primaryRecordAllocationRecovered, true);
  assert.equal(manifest.summary.payloadNodeInitializationRecovered, true);
  assert.equal(manifest.summary.schemaModeFlagsWriteRecovered, true);
  assert.equal(manifest.summary.schemaSourceObjectWriteRecovered, true);
  assert.equal(manifest.summary.targetLinkedListRecovered, true);
  assert.equal(manifest.summary.finalConsumerFieldMatchRecovered, true);
  assert.equal(manifest.summary.targetPayloadNodeChainRecovered, true);
  assert.equal(manifest.summary.payloadActiveCountFilterRecovered, true);
  assert.equal(manifest.summary.payloadActiveCountAppendProducerRecovered, true);
  assert.equal(manifest.summary.payloadActiveCountFlushRecovered, true);
  assert.equal(manifest.summary.payloadActiveCountRuntimeProducerRecovered, true);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const activeCountClear = manifest.payloadNodeInitRows.find((row) => row.role === "payload-node-active-count-clear");
  assert.equal(activeCountClear?.addressHex, "0xe3d6ec");
  assert.match(activeCountClear.evidence, /node \+0x200/);

  const sourceObjectStore = manifest.schemaPayloadWriteRows.find((row) => row.role === "schema-primary-source-object-store");
  assert.equal(sourceObjectStore?.addressHex, "0xe3bc68");
  assert.match(sourceObjectStore.evidence, /node \+0x208/);

  const targetLink = manifest.targetListRows.find((row) => row.role === "target-list-link-address");
  assert.equal(targetLink?.addressHex, "0xe39514");
  assert.match(targetLink.evidence, /record \+0x2c0/);

  const consumerMaterial = manifest.finalConsumerRows.find((row) => row.role === "draw-consumer-material-source-load");
  assert.equal(consumerMaterial?.addressHex, "0xe3d064");
  assert.match(consumerMaterial.evidence, /node \+0x208/);

  const appendCountStore = manifest.payloadActiveCountRuntimeRows.find(
    (row) => row.role === "append-active-count-store",
  );
  assert.equal(appendCountStore?.addressHex, "0xe3df5c");
  assert.match(appendCountStore.evidence, /node \+0x200/);

  const flushClear = manifest.payloadActiveCountRuntimeRows.find((row) => row.role === "submit-copy-active-count-clear");
  assert.equal(flushClear?.addressHex, "0xe3a9f8");
  assert.match(flushClear.evidence, /after copying/);
});

test("exportCurrentNativeLayoutBTargetPayloadNodeChainAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-target-payload-node-chain-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBTargetPayloadNodeChainAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.targetPayloadNodeChainRecovered, true);
  assert.equal(summary.payloadActiveCountRuntimeProducerRecovered, true);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /target payload-node chain/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe3df5c/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /append-active-count-store/);
});
