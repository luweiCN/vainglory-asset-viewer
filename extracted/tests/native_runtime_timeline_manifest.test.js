const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeRuntimeTimelineManifest,
  exportNativeRuntimeTimelineManifest,
  extractNativeRuntimeTimelineRowsFromSource,
} = require("../tools/native_runtime_timeline_manifest");

test("native runtime timeline combines action, delay, effect, and projectile events", () => {
  const sourceItem = {
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00abc.c",
    sourceText: `
void FUN_00abc123(void)
{
  FUN_00cf3048(uVar3,"Ability01_Cast",0,1,0,"AttackToIdle");
  uVar3 = FUN_00cfa294(auStack_48);
  FUN_00cf7478(0x3e4ccccd);
  FUN_00cf7578(uVar3,0);
  uVar4 = FUN_00cfaa74(auStack_48);
  FUN_00cf3428(0x3f000000,uVar4,"Effect_Tester_A_Cast",1,"Bone_Weapon",0,1,0,0);
  uVar5 = FUN_00cfb17c(auStack_48);
  FUN_00cfcad8(uVar5,0x2,"Projectile_Muzzle");
}
`,
  };

  const rows = extractNativeRuntimeTimelineRowsFromSource(sourceItem, {
    heroNameRows: [{ hero: "Tester", kind: "Effect", name: "A_Cast" }],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.eventKind,
      row.heroNames.join("|"),
      row.actionKeys.join("|"),
      row.timeSeconds,
      row.effectToken || row.projectileIdHex || row.actionName,
      row.locatorLabel || row.emitterLabel,
    ]),
    [
      ["action", "", "ability01", 0, "Ability01_Cast", ""],
      ["delay", "", "ability01", 0.2, "0x3e4ccccd", ""],
      ["effect", "Tester", "ability01", 0.5, "Effect_Tester_A_Cast", "Bone_Weapon"],
      ["projectile", "Tester", "ability01", 0.2, "0x2", "Projectile_Muzzle"],
    ],
  );
});

test("native runtime timeline manifest summarizes event coverage by kind", () => {
  const manifest = buildNativeRuntimeTimelineManifest(
    [
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00abc.c",
        sourceText: `
void FUN_00abc123(void)
{
  FUN_00cf3048(uVar3,"Attack",0,1,0,"AttackToIdle");
  FUN_00cf3428(0x3f800000,uVar4,"Effect_Tester_Attack",1,"Bone_Weapon",0,1,0,0);
  FUN_00cfcad8(uVar5,0x9,"Projectile_Muzzle");
}
`,
      },
    ],
    "TEST_DATE",
    { heroNameRows: [{ hero: "Tester", kind: "Effect", name: "Attack" }] },
  );

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.rows, 3);
  assert.equal(manifest.summary.byEventKind.action, 1);
  assert.equal(manifest.summary.byEventKind.effect, 1);
  assert.equal(manifest.summary.byEventKind.projectile, 1);
  assert.deepEqual(manifest.summary.byHero.Tester, { effect: 1, projectile: 1 });
});

test("native runtime timeline carries chained vcall effect option parameters", () => {
  const rows = extractNativeRuntimeTimelineRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e50.c",
    sourceText: `
void FUN_00e50d28(undefined8 param_1)
{
  plVar4 = (long *)FUN_00d2945c(lVar3 + 0x10);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x60))();
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_Hero057_C_Cloud");
  plVar4 = (long *)(**(code **)(*plVar4 + 0xc0))(0x3f800000,0,0x3f800000);
  local_58 = (code *)CONCAT44(local_58._4_4_,0x40800000);
  plVar4 = (long *)(**(code **)(*plVar4 + 0xd0))(plVar4,&local_58);
}
`,
  });

  const effect = rows.find((row) => row.effectToken === "Effect_Hero057_C_Cloud");

  assert.deepEqual(effect.effectOptionOffsets, ["0xc0", "0xd0"]);
  assert.deepEqual(effect.effectOptionFloatArgs, ["0xc0:1,0,1", "0xd0:4"]);
  assert.equal(effect.effectOptions.scale, 4);
});

test("native runtime timeline exporter writes viewer json and reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-timeline-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "00abc.c"),
    `
void FUN_00abc123(void)
{
  FUN_00cf3048(uVar3,"Ability03",0,1,0,"AttackToIdle");
  FUN_00cfcad8(uVar5,0x2,"Projectile_Muzzle");
}
`,
  );

  const viewerOut = path.join(tempDir, "native-runtime-timeline-manifest.json");
  const tsvOut = path.join(tempDir, "native_runtime_timeline_manifest.tsv");
  const jsonOut = path.join(tempDir, "native_runtime_timeline_manifest_summary.json");
  const summary = exportNativeRuntimeTimelineManifest({
    sourcePaths: [sourceDir],
    heroNamesPath: "",
    viewerOut,
    tsvOut,
    jsonOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.byEventKind.action, 1);
  assert.equal(summary.byEventKind.projectile, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /native-runtime-projectile/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /timeSeconds/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /byEventKind/);
});
