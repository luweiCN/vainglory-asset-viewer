const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBTargetCacheAudit,
  exportCurrentNativeLayoutBTargetCacheAudit,
} = require("../tools/current_native_layout_b_target_cache_audit");

test("layout B target cache audit proves target cache, acquire, and resource binding without draw promotion", () => {
  const manifest = buildCurrentNativeLayoutBTargetCacheAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.targetCacheRows, 10);
  assert.equal(manifest.summary.targetAcquireRows, 6);
  assert.equal(manifest.summary.resourceSchemaRows, 10);
  assert.equal(manifest.summary.childRecordRows, 10);
  assert.equal(manifest.summary.targetRefreshRows, 9);
  assert.equal(manifest.summary.submitFanoutRows, 8);
  assert.equal(manifest.summary.targetCacheRecovered, true);
  assert.equal(manifest.summary.resourceSchemaExpansionRecovered, true);
  assert.equal(manifest.summary.pfxEmitterDrawRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);

  const cacheRoot = manifest.targetCacheRows.find((row) => row.role === "target-cache-root-owner-plus-0x1c60d8");
  assert.equal(cacheRoot?.addressHex, "0xe3b628");
  assert.match(cacheRoot.evidence, /owner slot A/);

  const acquire = manifest.targetAcquireRows.find((row) => row.role === "target-acquire-object-call");
  assert.equal(acquire?.addressHex, "0xe3b698");
  assert.match(acquire.evidence, /0xe3ab7c/);

  const bind = manifest.targetAcquireRows.find((row) => row.role === "target-bind-resource-schema-call");
  assert.equal(bind?.addressHex, "0xe3b6b0");
  assert.match(bind.evidence, /0xe3b740/);

  const primaryRecord = manifest.resourceSchemaRows.find((row) => row.role === "target-primary-record-allocate-call");
  assert.equal(primaryRecord?.addressHex, "0xe3bb78");
  assert.match(primaryRecord.evidence, /primary/);

  const childRecord = manifest.childRecordRows.find((row) => row.role === "target-child-record-allocate-call");
  assert.equal(childRecord?.addressHex, "0xe3bd9c");
  assert.match(childRecord.evidence, /child/);
});

test("exportCurrentNativeLayoutBTargetCacheAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-target-cache-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBTargetCacheAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.targetCacheRecovered, true);
  assert.equal(summary.resourceSchemaExpansionRecovered, true);
  assert.equal(summary.pfxEmitterDrawRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /target cache/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe3b5e8/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /target-bind-resource-schema-call/);
});
