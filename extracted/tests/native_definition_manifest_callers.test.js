const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  defaultGetterSpecs,
  exportNativeDefinitionManifestCallers,
} = require("../tools/native_definition_manifest_callers");

const source = `
long FUN_abc(char *param_1)
{
  long def;
  def = FUN_10034bf64(param_1);
  if (def == 0) return 0;
  return *(long *)(def + 0xb8);
}

void FUN_def(undefined8 name, undefined8 *out)
{
  FUN_00ce9d88(name, out);
  return;
}
`;

test("definition manifest caller wrapper declares loader and component-root functions", () => {
  assert.ok(defaultGetterSpecs.some((spec) => spec.functionName === "FUN_10034bf64"));
  assert.ok(defaultGetterSpecs.some((spec) => spec.functionName === "FUN_00ce9d88"));
});

test("exportNativeDefinitionManifestCallers writes definition loader evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-definition-manifest-callers-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), source);

  const summary = exportNativeDefinitionManifestCallers({
    sourcePaths: [sourceDir],
    tsvOut: path.join(reportDir, "native_definition_manifest_callers.tsv"),
    jsonOut: path.join(reportDir, "native_definition_manifest_caller_context.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.byLookupKind["definition-load-by-symbol"], 1);
  assert.equal(summary.byLookupKind["definition-component-roots"], 1);
  const tsv = fs.readFileSync(path.join(reportDir, "native_definition_manifest_callers.tsv"), "utf8");
  assert.match(tsv, /FUN_10034bf64/);
  assert.match(tsv, /FUN_00ce9d88/);
});
