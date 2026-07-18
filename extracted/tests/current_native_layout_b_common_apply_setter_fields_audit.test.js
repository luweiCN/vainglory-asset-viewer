const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBCommonApplySetterFieldsAudit,
  exportCurrentNativeLayoutBCommonApplySetterFieldsAudit,
} = require("../tools/current_native_layout_b_common_apply_setter_fields_audit");

test("layout B common apply setter fields audit proves setter family does not write object+0xac", () => {
  const manifest = buildCurrentNativeLayoutBCommonApplySetterFieldsAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.setterBlockRows, 14);
  assert.equal(manifest.summary.setterOpcodeRows, 53);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.objectStoreRows, 45);
  assert.equal(manifest.summary.uniqueObjectStoreOffsets, 30);
  assert.equal(manifest.summary.objectA8LowWordStoreRows, 1);
  assert.equal(manifest.summary.objectAcStoreRows, 0);
  assert.equal(manifest.summary.objectAcParticleMaskProducerRows, 0);
  assert.equal(manifest.summary.commonApplySetterFieldsRecovered, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.uniqueStoreOffsets.includes("0xa8"));
  assert.ok(!manifest.uniqueStoreOffsets.includes("0xac"));

  const a8Store = manifest.rows.find((row) => row.addressHex === "0x8d4a70");
  assert.equal(a8Store?.role, "object-a8-low-float-store");
  assert.equal(a8Store.objectOffsetHex, "0xa8");
  assert.equal(a8Store.writesObjectAc, false);
  assert.match(a8Store.evidence, /does not write object\+0xac/);

  const scalarTail = manifest.rows.find((row) => row.addressHex === "0x8d4fd4");
  assert.equal(scalarTail?.role, "scalar-qword-store-100");
  assert.equal(scalarTail.objectOffsetHex, "0x100");
});

test("exportCurrentNativeLayoutBCommonApplySetterFieldsAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-common-apply-setters-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBCommonApplySetterFieldsAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.setterOpcodeRows, 53);
  assert.equal(summary.objectAcStoreRows, 0);
  assert.equal(summary.objectAcParticleMaskProducerRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.uniqueObjectStoreOffsets, 30);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /setter-field/i);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /object-a8-low-float-store/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /scalar-qword-store-100/);
});
