const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeStaticMeshSelectorEntryAudit,
  exportCurrentNativeStaticMeshSelectorEntryAudit,
} = require("../tools/current_native_static_mesh_selector_entry_audit");

test("static mesh selector entry audit validates current Android field shape", () => {
  const manifest = buildCurrentNativeStaticMeshSelectorEntryAudit();
  const summary = manifest.summary;

  assert.equal(summary.opcodeRows, 20);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.levelVisualsStaticMeshListRows, 3);
  assert.equal(summary.staticMeshFieldRows, 8);
  assert.equal(summary.selectorHelperStaticMeshFieldUsageRows, 4);
  assert.equal(summary.levelVisualsStaticMeshListsRecovered, true);
  assert.equal(summary.currentStaticMeshFieldOffsetsRecovered, true);
  assert.equal(summary.currentStaticMeshFieldTypesRecovered, true);
  assert.equal(summary.selectorHelperStaticMeshFieldUsageRecovered, true);
  assert.equal(summary.staticMeshSelectorEntryShapeRecovered, true);
  assert.equal(summary.resourceFieldNamesRecovered, false);
  assert.equal(summary.activeResourceSemanticsRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.staticMeshFields.some((field) => field.fieldOffset === "0x30" && field.typeName === "char*"));
  assert.ok(manifest.staticMeshFields.some((field) => field.fieldOffset === "0x40" && field.typeName === "NamedAnimation"));
  assert.ok(manifest.staticMeshFields.some((field) => field.fieldOffset === "0x68" && field.typeName === "ShaderParams**"));
});

test("exportCurrentNativeStaticMeshSelectorEntryAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-staticmesh-selector-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeStaticMeshSelectorEntryAudit({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.staticMeshSelectorEntryShapeRecovered, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /selector-helper-staticmesh-field3-load/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /staticmesh-field6-type-shaderparams-list/);
});
