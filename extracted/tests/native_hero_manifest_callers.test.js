const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { defaultGetterSpecs, exportNativeHeroManifestCallers } = require("../tools/native_hero_manifest_callers");

const source = `
long FUN_abc(char *param_1)
{
  long hero;
  hero = FUN_10034be08(param_1);
  if (hero == 0) return 0;
  return *(long *)(hero + 0x18);
}

void FUN_def(int *param_1)
{
  undefined8 *hero;
  hero = (undefined8 *)FUN_00ce9ba0(param_1);
  consume(hero[3]);
  return;
}
`;

test("hero manifest caller wrapper declares both platform getter chains", () => {
  assert.ok(defaultGetterSpecs.some((spec) => spec.functionName === "FUN_10034be08"));
  assert.ok(defaultGetterSpecs.some((spec) => spec.functionName === "FUN_00ce9b48"));
});

test("exportNativeHeroManifestCallers writes hero getter evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-hero-manifest-callers-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), source);

  const summary = exportNativeHeroManifestCallers({
    sourcePaths: [sourceDir],
    tsvOut: path.join(reportDir, "native_hero_manifest_callers.tsv"),
    jsonOut: path.join(reportDir, "native_hero_manifest_caller_context.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.byLookupKind["hero-entry-by-internal-name"], 1);
  assert.equal(summary.byLookupKind["hero-entry-by-id"], 1);
  const tsv = fs.readFileSync(path.join(reportDir, "native_hero_manifest_callers.tsv"), "utf8");
  assert.match(tsv, /FUN_10034be08/);
  assert.match(tsv, /FUN_00ce9ba0/);
});
