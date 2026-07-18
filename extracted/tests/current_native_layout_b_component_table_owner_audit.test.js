const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBComponentTableOwnerAudit,
  exportCurrentNativeLayoutBComponentTableOwnerAudit,
} = require("../tools/current_native_layout_b_component_table_owner_audit");

test("layout B component table owner audit separates component tables from concrete layout B object tables", () => {
  const manifest = buildCurrentNativeLayoutBComponentTableOwnerAudit({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.blockRows, 3);
  assert.equal(manifest.summary.opcodeRows, 23);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.componentTableInstallerRows, 1);
  assert.equal(manifest.summary.layoutBObjectTableInstallerRows, 1);
  assert.equal(manifest.summary.layoutBTypeRegistrationRows, 1);
  assert.equal(manifest.summary.componentTableRootRecovered, true);
  assert.equal(manifest.summary.layoutBObjectTableSeparated, true);
  assert.equal(manifest.summary.highCallerFieldWriterRows, 0);
  assert.equal(manifest.summary.directObjectAcProducerRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const component = manifest.blockRows.find((row) => row.id === "component-method-table-installer");
  assert.match(component?.recoveredTableAddresses || "", /0x26c78d0/);
  assert.match(component?.recoveredTableAddresses || "", /0x26c7c40/);

  const layoutB = manifest.blockRows.find((row) => row.id === "layout-b-object-vtable-installer");
  assert.match(layoutB?.evidence || "", /not the upper component table/);
});

test("exportCurrentNativeLayoutBComponentTableOwnerAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-component-owner-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeLayoutBComponentTableOwnerAudit({ viewerOut, jsonOut, tsvOut });

  assert.equal(summary.componentTableRootRecovered, true);
  assert.equal(summary.layoutBObjectTableSeparated, true);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /component table owner/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /layoutBObjectTableSeparated/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-object-vtable-installer/);
});
