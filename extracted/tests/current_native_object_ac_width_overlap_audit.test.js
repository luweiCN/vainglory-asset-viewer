const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeObjectAcWidthOverlapAudit,
  exportCurrentNativeObjectAcWidthOverlapAudit,
} = require("../tools/current_native_object_ac_width_overlap_audit");

test("object +0xac width-overlap audit keeps global same-offset writes diagnostic-only", () => {
  const manifest = buildCurrentNativeObjectAcWidthOverlapAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.totalOverlapStoreRows, 425);
  assert.equal(manifest.summary.exactStrWAcRows, 64);
  assert.equal(manifest.summary.nonExactOverlapRows, 361);
  assert.equal(manifest.summary.strXOverlapRows, 325);
  assert.equal(manifest.summary.strBOverlapRows, 34);
  assert.equal(manifest.summary.strHOverlapRows, 2);
  assert.equal(manifest.summary.zeroRegisterRows, 206);
  assert.equal(manifest.summary.layoutBFamilyOverlapRows, 1);
  assert.equal(manifest.summary.layoutBFamilyNonConstructorRows, 0);
  assert.equal(manifest.summary.outOfFamilyOverlapRows, 424);
  assert.equal(manifest.summary.outOfFamilyWideNeedsOwnerRows, 159);
  assert.equal(manifest.summary.outOfFamilyWideZeroClearRows, 201);
  assert.equal(manifest.summary.exactLayoutBParticleProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const layoutBSeed = manifest.items.find((row) => row.addressHex === "0x8d2dbc");
  assert.equal(layoutBSeed?.producerClass, "layout-b-constructor-seed");
  assert.equal(layoutBSeed.accessKind, "str-x");
  assert.equal(layoutBSeed.objectFieldOffsetHex, "0xa8");
  assert.equal(layoutBSeed.overlapsObjectAc, true);
  assert.equal(layoutBSeed.renderPromotionAllowed, false);
});

test("exportCurrentNativeObjectAcWidthOverlapAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-object-ac-width-overlap-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeObjectAcWidthOverlapAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.totalOverlapStoreRows, 425);
  assert.equal(summary.layoutBFamilyNonConstructorRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.outOfFamilyOverlapRows, 424);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /width-overlap/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-constructor-seed/);
});
