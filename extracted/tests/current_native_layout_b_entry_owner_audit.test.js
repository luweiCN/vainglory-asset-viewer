const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBEntryOwnerAudit,
  exportCurrentNativeLayoutBEntryOwnerAudit,
} = require("../tools/current_native_layout_b_entry_owner_audit");

test("layout B entry owner audit proves the manager entry is an inline scene entry, not a PFX owner", () => {
  const manifest = buildCurrentNativeLayoutBEntryOwnerAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.entryInitializerRows, 6);
  assert.equal(manifest.summary.registerRows, 7);
  assert.equal(manifest.summary.lifecycleCallbackRows, 8);
  assert.equal(manifest.summary.globalOwnerSlotReadRows, 7);
  assert.equal(manifest.summary.globalOwnerSlotStoreRows, 4);
  assert.equal(manifest.summary.entryOwnerFromGlobalSlotRows, 1);
  assert.equal(manifest.summary.constructorObjectAcSeedRows, 1);
  assert.equal(manifest.summary.constructorParticleMaskRows, 0);
  assert.equal(manifest.summary.destructorCleanupRows, 3);
  assert.equal(manifest.summary.pfxEmitterOwnerRows, 0);
  assert.equal(manifest.summary.opcodeRows, 25);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const ownerStore = manifest.entryInitializerRows.find((row) => row.addressHex === "0x8d2d64");
  assert.equal(ownerStore?.fieldRole, "entry-owner-pointer");
  assert.equal(ownerStore.objectOffsetHex, "0x38");
  assert.equal(ownerStore.entryOffsetHex, "0x8");
  assert.match(ownerStore.evidence, /0xe3cdfc/);

  const addRecord = manifest.registerRows.find((row) => row.addressHex === "0x8d3a2c");
  assert.equal(addRecord?.fieldRole, "manager-add-record");
  assert.match(addRecord.evidence, /x3 = object \+0x30/);

  const globalAccessor = manifest.globalOwnerSlotReferences.find((row) => row.xrefAddressHex === "0xe3ce00");
  assert.equal(globalAccessor?.targetAddressHex, "0x311a298");
  assert.equal(globalAccessor?.role, "layout-b-entry-owner-global-accessor");

  const constructorSeed = manifest.lifecycleCallbackRows.find((row) => row.addressHex === "0x8d2dbc");
  assert.equal(constructorSeed?.fieldRole, "constructor-object-ac-seed-high-word-two");
  assert.equal(constructorSeed.objectOffsetHex, "0xa8");
  assert.match(constructorSeed.evidence, /0x200/);

  const destructorCleanup = manifest.lifecycleCallbackRows.find((row) => row.addressHex === "0x8d2eac");
  assert.equal(destructorCleanup?.fieldRole, "destructor-cleans-inline-entry-tail");
  assert.equal(destructorCleanup.entryOffsetHex, "0x10");
});

test("exportCurrentNativeLayoutBEntryOwnerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-entry-owner-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBEntryOwnerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.entryOwnerFromGlobalSlotRows, 1);
  assert.equal(summary.lifecycleCallbackRows, 8);
  assert.equal(summary.constructorParticleMaskRows, 0);
  assert.equal(summary.pfxEmitterOwnerRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.registerRows, 7);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /layout B entry owner/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /entry-owner-pointer/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /constructor-object-ac-seed-high-word-two/);
});
