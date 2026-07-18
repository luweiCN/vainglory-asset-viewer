const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBPfxTargetFactoryAudit,
  exportCurrentNativeLayoutBPfxTargetFactoryAudit,
} = require("../tools/current_native_layout_b_pfx_target_factory_audit");

test("layout B PFX target factory audit proves object+0x50 is created from KindredEffects resources", () => {
  const manifest = buildCurrentNativeLayoutBPfxTargetFactoryAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.parameterNameRows, 6);
  assert.equal(manifest.summary.factoryRouteRows, 12);
  assert.equal(manifest.summary.targetFactoryRows, 4);
  assert.equal(manifest.summary.ownerSlotRows, 5);
  assert.equal(manifest.summary.targetStatusRows, 6);
  assert.equal(manifest.summary.object50StoreRows, 2);
  assert.equal(manifest.summary.kindredEffectsStringRows, 2);
  assert.equal(manifest.summary.pfxTargetFactoryRecovered, true);
  assert.equal(manifest.summary.pfxEmitterDrawRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);

  const hashRoute = manifest.factoryRouteRows.find((row) => row.role === "name-route-kindred-effects-string");
  assert.equal(hashRoute?.addressHex, "0x8d42d4");
  assert.match(hashRoute.evidence, /\*KindredEffects\*/);

  const directStore = manifest.factoryRouteRows.find((row) => row.role === "name-route-store-target-object50");
  assert.equal(directStore?.addressHex, "0x8d4364");
  assert.match(directStore.evidence, /object\+0x50/);

  const idStore = manifest.factoryRouteRows.find((row) => row.role === "id-route-store-target-object50");
  assert.equal(idStore?.addressHex, "0x8d44d0");
  assert.match(idStore.evidence, /object\+0x50/);

  const ownerSlot = manifest.ownerSlotRows.find((row) => row.role === "target-factory-owner-slot-a-load");
  assert.equal(ownerSlot?.addressHex, "0xe3ce0c");
  assert.match(ownerSlot.evidence, /0x311a290/);
});

test("exportCurrentNativeLayoutBPfxTargetFactoryAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-pfx-target-factory-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBPfxTargetFactoryAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.pfxTargetFactoryRecovered, true);
  assert.equal(summary.pfxEmitterDrawRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.object50StoreRows, 2);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /KindredEffects/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /name-route-store-target-object50/);
});
