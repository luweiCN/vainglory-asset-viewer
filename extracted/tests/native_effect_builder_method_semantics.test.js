const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeBuilderMethodSemantics,
  exportNativeEffectBuilderMethodSemantics,
  reportRowsForSemantics,
} = require("../tools/native_effect_builder_method_semantics");

const sourceFile = "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c";
const sourceText = `
void FUN_00aa0000(long param_1,undefined8 param_2)

{
  *(undefined8 *)(param_1 + 0x40) = param_2;
  *(ushort *)(param_1 + 200) = *(ushort *)(param_1 + 200) & 0xff98 | 0x22;
  return;
}

void FUN_00aa0010(long param_1)

{
  *(char **)(param_1 + 0x40) = "CenterBody";
  *(char **)(param_1 + 0x30) = "Effect_TalentStandard";
  *(ushort *)(param_1 + 200) = *(ushort *)(param_1 + 200) & 0xfff0 | 10;
  return;
}

void FUN_00aa0020(long param_1,undefined8 param_2)

{
  *(undefined8 *)(param_1 + 0x18) = param_2;
  return;
}

void FUN_00aa0030(long param_1,undefined8 *param_2)

{
  undefined8 uVar1;
  uVar1 = FUN_00d66d28(*param_2);
  FUN_00a827dc(param_1 + 0x18,uVar1,0,param_2);
  return;
}

void FUN_00aa0040(long param_1)

{
  FUN_00a82514(param_1 + 0x18);
  return;
}
`;

test("analyzeBuilderMethodSemantics extracts outer and inner effect binding field roles", () => {
  const rows = analyzeBuilderMethodSemantics(sourceText, { platform: "android", sourceFile });

  const anchor = rows.find((row) => row.functionName === "FUN_00aa0000");
  assert.equal(anchor.layer, "outer-builder");
  assert.equal(anchor.semanticRoles, "anchor-token");
  assert.equal(anchor.fieldOffsets, "0x40");
  assert.equal(anchor.innerFieldOffsets, "0x28");
  assert.equal(anchor.modeBits, "0x22");

  const fallback = rows.find((row) => row.functionName === "FUN_00aa0010");
  assert.equal(fallback.semanticRoles, "anchor-token|effect-token");
  assert.equal(fallback.stringLiterals, "CenterBody|Effect_TalentStandard");
  assert.equal(fallback.modeBits, "10");

  const inner = rows.find((row) => row.functionName === "FUN_00aa0020");
  assert.equal(inner.layer, "inner-effect-binding");
  assert.equal(inner.semanticRoles, "effect-token");
  assert.equal(inner.fieldOffsets, "0x18");

  const spawn = rows.find((row) => row.functionName === "FUN_00aa0030");
  assert.equal(spawn.semanticRoles, "spawn-or-update-effect");
  assert.equal(spawn.calledRuntimeFunctions, "FUN_00a827dc");

  const activate = rows.find((row) => row.functionName === "FUN_00aa0040");
  assert.equal(activate.semanticRoles, "resolve-overhead-effect-token");
  assert.equal(activate.calledRuntimeFunctions, "FUN_00a82514");
});

test("exportNativeEffectBuilderMethodSemantics writes viewer manifest and audit report", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-builder-semantics-"));
  const sourcePath = path.join(tempDir, "builder.c");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(sourcePath, sourceText);

  const summary = exportNativeEffectBuilderMethodSemantics({
    sources: [{ platform: "android", sourcePath }],
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 5);
  assert.equal(summary.bySemanticRole["anchor-token"], 1);
  assert.equal(summary.bySemanticRole["spawn-or-update-effect"], 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /FUN_00aa0030/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /innerFieldOffsets/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.rows, 5);
  assert.equal(reportRowsForSemantics(JSON.parse(fs.readFileSync(viewerOut, "utf8"))).length, 5);
});
