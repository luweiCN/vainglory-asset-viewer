const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBPayloadRecordLayoutAudit,
  exportCurrentNativeLayoutBPayloadRecordLayoutAudit,
} = require("../tools/current_native_layout_b_payload_record_layout_audit");

test("layout B payload record layout audit recovers copied target+0x40 field offsets", () => {
  const manifest = buildCurrentNativeLayoutBPayloadRecordLayoutAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.opcodeRows, 14);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.targetPlus40Forwarded, true);
  assert.equal(manifest.summary.targetPayloadCopyRecovered, true);
  assert.equal(manifest.summary.payloadAndFlagSeparated, true);
  assert.equal(manifest.summary.payloadRecordStrideBytes, 48);
  assert.equal(manifest.summary.backingPayloadBaseOffset, 16);
  assert.equal(manifest.summary.payloadVectorSourceOffset, 0);
  assert.equal(manifest.summary.payloadQwordSourceOffset, 16);
  assert.equal(manifest.summary.payloadCopiedBytes, 24);
  assert.equal(manifest.summary.backingPayloadFlagOffset, 24);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const stride = manifest.opcodeRows.find((row) => row.role === "backing-refresh-record-stride-0x30");
  assert.equal(stride?.addressHex, "0x18bf5f4");
  assert.match(stride.evidence, /0x30/);

  const vector = manifest.opcodeRows.find((row) => row.role === "backing-refresh-payload-vector-load");
  assert.equal(vector?.sourceOffsetBytes, 0);
  assert.equal(vector?.copiedBytes, 16);

  const qword = manifest.opcodeRows.find((row) => row.role === "backing-refresh-payload-qword-load");
  assert.equal(qword?.sourceOffsetBytes, 16);
  assert.equal(qword?.copiedBytes, 8);
});

test("exportCurrentNativeLayoutBPayloadRecordLayoutAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-payload-record-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBPayloadRecordLayoutAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.targetPayloadCopyRecovered, true);
  assert.equal(summary.payloadRecordStrideBytes, 48);
  assert.equal(summary.payloadCopiedBytes, 24);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /target\+0x40 payload record layout/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /backingPayloadFlagOffset/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /backing-refresh-payload-vector-store/);
});
