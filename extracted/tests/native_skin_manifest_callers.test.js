const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeSkinManifestCallers,
  extractSkinManifestCallersFromSource,
  fieldOffsetsForVar,
  inferAssignedVar,
} = require("../tools/native_skin_manifest_callers");

const syntheticSource = `
long FUN_00abc100(char *param_1)
{
  long lVar9;
  lVar9 = FUN_00cc7868(param_1);
  if (lVar9 == 0) {
    return 0;
  }
  if (*(int *)(lVar9 + 0x20) == 0) {
    return *(long *)(lVar9 + 0x18);
  }
  return *lVar9;
}

void FUN_100abc200(long **param_2)
{
  undefined8 *puVar4;
  puVar4 = (undefined8 *)FUN_10032bdf8(*param_2);
  consume(puVar4[3]);
  return;
}
`;

test("skin manifest caller scanner tracks assigned return vars and consumed field offsets", () => {
  const rows = extractSkinManifestCallersFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    getterSpecs: [{ platform: "android", functionName: "FUN_00cc7868", lookupKind: "default-skin-entry-by-model-name" }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].callerFunction, "FUN_00abc100");
  assert.equal(rows[0].getterFunction, "FUN_00cc7868");
  assert.equal(rows[0].assignedVar, "lVar9");
  assert.equal(rows[0].consumedOffsets, "0x0|0x18|0x20");
});

test("field offset extraction also recognizes pointer-array syntax", () => {
  const callIndex = syntheticSource.indexOf("FUN_10032bdf8");
  assert.equal(inferAssignedVar(syntheticSource, callIndex, "FUN_10032bdf8"), "puVar4");
  assert.deepEqual(fieldOffsetsForVar(syntheticSource, "puVar4", callIndex), ["0x18"]);
});

test("exportNativeSkinManifestCallers writes TSV and JSON reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-skin-manifest-callers-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeSkinManifestCallers({
    sourcePaths: [sourceDir],
    getterSpecs: [{ platform: "android", functionName: "FUN_00cc7868", lookupKind: "default-skin-entry-by-model-name" }],
    tsvOut: path.join(reportDir, "native_skin_manifest_callers.tsv"),
    jsonOut: path.join(reportDir, "native_skin_manifest_caller_context.json"),
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.consumedOffsetCounts["0x18"], 1);
  assert.match(fs.readFileSync(path.join(reportDir, "native_skin_manifest_callers.tsv"), "utf8"), /FUN_00cc7868/);
  const json = JSON.parse(fs.readFileSync(path.join(reportDir, "native_skin_manifest_caller_context.json"), "utf8"));
  assert.equal(json.items[0].consumedOffsets, "0x0|0x18|0x20");
});
