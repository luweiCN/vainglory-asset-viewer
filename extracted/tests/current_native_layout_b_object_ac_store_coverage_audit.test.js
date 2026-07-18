const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBObjectAcStoreCoverageAudit,
  exportCurrentNativeLayoutBObjectAcStoreCoverageAudit,
} = require("../tools/current_native_layout_b_object_ac_store_coverage_audit");

test("layout B object +0xac store coverage audit closes str/stp/stur/simd overlap scan", () => {
  const manifest = buildCurrentNativeLayoutBObjectAcStoreCoverageAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.storeRows, 410);
  assert.equal(manifest.summary.objectAcOverlapRows, 4);
  assert.equal(manifest.summary.stackOverlapRows, 3);
  assert.equal(manifest.summary.nonStackOverlapRows, 1);
  assert.equal(manifest.summary.constructorSeedOverlapRows, 1);
  assert.equal(manifest.summary.hiddenNonConstructorObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.deepEqual(
    manifest.objectAcOverlapRows.map((row) => row.addressHex),
    ["0x8d2dbc", "0x8d31e8", "0x8d40d0", "0x8d4aa4"],
  );

  const seed = manifest.objectAcOverlapRows.find((row) => row.addressHex === "0x8d2dbc");
  assert.equal(seed?.classification, "layout-b-constructor-seed");
  assert.equal(seed.baseRegister, "x19");
  assert.equal(seed.accessKind, "str-x");

  const stackRows = manifest.objectAcOverlapRows.filter((row) => row.classification === "stack-temporary-overlap");
  assert.equal(stackRows.length, 3);
  assert.equal(stackRows.every((row) => row.baseRegister === "sp"), true);
});

test("exportCurrentNativeLayoutBObjectAcStoreCoverageAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-object-ac-store-coverage-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBObjectAcStoreCoverageAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.hiddenNonConstructorObjectAcProducerRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /layout B object \+0xac store coverage/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /stack-temporary-overlap/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-constructor-seed/);
});
