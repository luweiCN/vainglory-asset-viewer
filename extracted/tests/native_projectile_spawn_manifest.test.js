const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeProjectileSpawnManifest,
  exportNativeProjectileSpawnManifest,
  extractNativeProjectileSpawnRowsFromSource,
  fnv1aHashHex,
} = require("../tools/native_projectile_spawn_manifest");

test("native projectile manifest extracts direct projectile spawns with action and effect context", () => {
  const sourceItem = {
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00dab.c",
    sourceText: `
void FUN_00dab814(void)
{
  FUN_00cf3048(uVar3,"Ability01_Cast",0,1,0,"AttackToIdle");
  FUN_00cf32cc(0,uVar3,"Effect_Adagio_Heal_Cast",1,0,1,0,0);
  FUN_00cfcad8(uVar3,2,"Ability01_Projectile");
}
`,
  };
  const rows = extractNativeProjectileSpawnRowsFromSource(sourceItem);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, "android");
  assert.equal(rows[0].sourceKind, "native-projectile-spawn");
  assert.equal(rows[0].functionName, "FUN_00dab814");
  assert.equal(rows[0].projectileIdExpr, "2");
  assert.equal(rows[0].projectileId, 2);
  assert.equal(rows[0].projectileIdHex, "0x2");
  assert.equal(rows[0].emitterLabel, "Ability01_Projectile");
  assert.equal(rows[0].emitterHash, fnv1aHashHex("Ability01_Projectile"));
  assert.deepEqual(rows[0].actionNames, ["Ability01_Cast"]);
  assert.deepEqual(rows[0].actionKeys, ["ability01"]);
  assert.deepEqual(rows[0].effectTokens, ["Effect_Adagio_Heal_Cast"]);

  const manifest = buildNativeProjectileSpawnManifest([sourceItem], "TEST_DATE", {
    heroNameRows: [{ hero: "Adagio", kind: "Effect", name: "Heal_Cast" }],
  });
  assert.deepEqual(manifest.items[0].heroNames, ["Adagio"]);
  assert.equal(manifest.items[0].heroEvidence, "hero-token-table");
});

test("native projectile manifest resolves one-level projectile helper calls", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00df7.c",
    sourceText: `
void FUN_00df7388(undefined8 param_1,int param_2,undefined8 param_3)
{
  plVar3 = (long *)(*pcVar8)(plVar3,param_1);
  FUN_00cfcad8(uVar2,param_2,param_3);
}

void FUN_00df7588(void)
{
  FUN_00df7388("Attack",0xb2,"Projectile");
}
`,
  });

  const helperRow = rows.find((row) => row.sourceKind === "native-projectile-helper-call");
  assert.ok(helperRow);
  assert.equal(helperRow.functionName, "FUN_00df7588");
  assert.equal(helperRow.helperFunction, "FUN_00df7388");
  assert.equal(helperRow.projectileIdExpr, "0xb2");
  assert.equal(helperRow.projectileId, 178);
  assert.equal(helperRow.emitterLabel, "Projectile");
  assert.deepEqual(helperRow.actionNames, ["Attack"]);
  assert.deepEqual(helperRow.actionKeys, ["attack"]);
});

test("native projectile manifest inherits hero context from projectile helper functions", () => {
  const manifest = buildNativeProjectileSpawnManifest(
    [
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00de0.c",
        sourceText: `
void FUN_00de0144(undefined8 param_1,undefined4 param_2)
{
  FUN_00cf3428(0,uVar2,"Effect_SAW_MuzzleFlash",1,"Bone_Weapon",0,1,0,0);
  FUN_00cfcad8(uVar2,param_2,"GunMuzzleTip_Attack");
}

void FUN_00de0414(void)
{
  FUN_00de0144("Attack",0x65);
}
`,
      },
    ],
    "TEST_DATE",
    { heroNameRows: [{ hero: "SAW", kind: "Effect", name: "MuzzleFlash" }] },
  );

  const helperCall = manifest.items.find((row) => row.functionName === "FUN_00de0414");
  assert.ok(helperCall);
  assert.deepEqual(helperCall.heroNames, ["SAW"]);
  assert.equal(helperCall.heroEvidence, "helper-body-token-table");
});

test("native projectile manifest reads vtable action builder strings without treating data pointers as emitters", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00db5.c",
    sourceText: `
void FUN_00db5a6c(void)
{
  plVar2 = (long *)FUN_00cfaa2c(auStack_58);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x50))(plVar2,"Ability03");
  uVar3 = FUN_00cfb17c(auStack_58);
  uVar3 = FUN_00cfcad8(uVar3,0x13,&DAT_01bd4dd4);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectileIdHex, "0x13");
  assert.equal(rows[0].emitterExpr, "&DAT_01bd4dd4");
  assert.equal(rows[0].emitterLabel, "");
  assert.deepEqual(rows[0].actionNames, ["Ability03"]);
  assert.deepEqual(rows[0].actionKeys, ["ability03"]);
});

test("native projectile manifest keeps nearby bone tokens from the same action block", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00de1.c",
    sourceText: `
void FUN_00de1664(void)
{
  plVar2 = (long *)FUN_00cfaa2c(auStack_38);
  (**(code **)(*plVar2 + 0x58))(plVar2,"CritAttack");
  uVar3 = FUN_00cfb17c(auStack_38);
  FUN_00cfcad8(uVar3,0x69,"Mouth");
  uVar3 = FUN_00cfaa74(auStack_38);
  FUN_00cf3428(0x3fc00000,uVar3,"Effect_Hero010_BurningMouth",1,"Bone_Jaw",0,1,0,0);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].emitterLabel, "Mouth");
  assert.deepEqual(rows[0].nearbyBoneTokens, ["Bone_Jaw"]);
});

test("native projectile manifest infers action keys from same-block effect tokens", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00df5.c",
    sourceText: `
void FUN_00df5b40(void)
{
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Anka_A");
  FUN_00cfcad8(uVar3,0xae,"CenterBody");
}
`,
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].actionNames, []);
  assert.deepEqual(rows[0].actionKeys, ["ability01"]);
  assert.deepEqual(rows[0].effectTokens, ["Effect_Anka_A"]);
});

test("native projectile manifest keeps post-spawn projectile modifiers", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00cef.c",
    sourceText: `
void FUN_00cef908(void)
{
  FUN_00cf3048(uVar3,"Ability03",0,1,0,"AttackToIdleCombat");
  uVar3 = FUN_00cfb17c(auStack_48);
  uVar3 = FUN_00cfcad8(uVar3,0x1c,&DAT_01e239e7);
  FUN_00cfcba8(uVar3,1);
  FUN_00cfcbc4(0xc1c80000);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectileIdHex, "0x1c");
  assert.equal(rows[0].projectileModeExpr, "1");
  assert.equal(rows[0].projectileMode, 1);
  assert.equal(rows[0].projectileLateralOffsetExpr, "0xc1c80000");
  assert.equal(rows[0].projectileLateralOffset, -25);
});

test("native projectile manifest keeps post-spawn projectile callback slots", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00dca.c",
    sourceText: `
void FUN_00dca270(void)
{
  uVar3 = FUN_00cfcad8(uVar3,0x2a,"GunMuzzle");
  FUN_00cfcb68(uVar3,FUN_00dca1f0);
  FUN_00cfcbbc(uVar3,FUN_00dca2ec);
  FUN_00cfcbcc(uVar3,FUN_00dca364);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectileCallback18, "FUN_00dca1f0");
  assert.equal(rows[0].projectileCallback28, "FUN_00dca364");
  assert.equal(rows[0].projectileCallback38, "FUN_00dca2ec");
});

test("native projectile manifest extracts iOS projectile builder records", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10036.c",
    sourceText: `
undefined8 FUN_10036ddbc(void)
{
  uVar1 = FUN_1004d2524("Ability01_Attack");
  lVar3 = FUN_10000f250();
  FUN_1003a985c(&local_70,lVar3);
  *(undefined4 *)(lVar3 + 0x10) = 0x77;
  FUN_1003d266c(lVar3,"BasicAttack_RightHand");
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, "ios");
  assert.equal(rows[0].sourceKind, "native-projectile-ios-builder");
  assert.equal(rows[0].projectileIdHex, "0x77");
  assert.equal(rows[0].emitterLabel, "BasicAttack_RightHand");
  assert.deepEqual(rows[0].actionNames, ["Ability01_Attack"]);
  assert.deepEqual(rows[0].actionKeys, ["attack", "ability01"]);
  assert.equal(rows[0].evidence, "FUN_10000f250+FUN_1003d266c");
});

test("native projectile manifest resolves iOS projectile builder helper calls", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10038.c",
    sourceText: `
undefined8 FUN_1003ca868(undefined8 param_1,undefined8 param_2,int param_3)
{
  lVar2 = FUN_10000f250();
  FUN_1003a985c(&local_50,lVar2);
  *(int *)(lVar2 + 0x10) = param_3;
  FUN_1003d266c(lVar2,param_2);
  return local_50;
}

void FUN_10038c0c0(void)
{
  FUN_1003ca868("Attack","CenterBody",0x97);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].platform, "ios");
  assert.equal(rows[0].sourceKind, "native-projectile-helper-call");
  assert.equal(rows[0].functionName, "FUN_10038c0c0");
  assert.equal(rows[0].helperFunction, "FUN_1003ca868");
  assert.equal(rows[0].projectileIdExpr, "0x97");
  assert.equal(rows[0].projectileIdHex, "0x97");
  assert.equal(rows[0].emitterLabel, "CenterBody");
  assert.deepEqual(rows[0].actionNames, ["Attack"]);
  assert.deepEqual(rows[0].actionKeys, ["attack"]);
  assert.equal(rows[0].evidence, "FUN_10000f250-helper");
});

test("native projectile manifest resolves iOS projectile helpers across decompile split files", () => {
  const manifest = buildNativeProjectileSpawnManifest(
    [
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1003c.c",
        sourceText: `
undefined8 FUN_1003ca868(undefined8 param_1,undefined8 param_2,int param_3)
{
  lVar2 = FUN_10000f250();
  FUN_1003a985c(&local_50,lVar2);
  *(int *)(lVar2 + 0x10) = param_3;
  FUN_1003d266c(lVar2,param_2);
  return local_50;
}
`,
      },
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10038.c",
        sourceText: `
void FUN_10038c0c0(void)
{
  FUN_1003ca868("Attack","CenterBody",0x97);
}
`,
      },
    ],
    "TEST_DATE",
  );

  const helperCall = manifest.items.find((row) => row.functionName === "FUN_10038c0c0");
  assert.ok(helperCall);
  assert.equal(helperCall.sourceKind, "native-projectile-helper-call");
  assert.equal(helperCall.helperFunction, "FUN_1003ca868");
  assert.equal(helperCall.projectileIdHex, "0x97");
  assert.equal(helperCall.emitterLabel, "CenterBody");
});

test("native projectile manifest carries hero context from iOS projectile helper bodies", () => {
  const manifest = buildNativeProjectileSpawnManifest(
    [
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1003b.c",
        sourceText: `
undefined8 FUN_1003be36c(undefined8 param_1,undefined8 param_2,undefined4 param_3)
{
  lVar3 = FUN_10000f250();
  *(undefined4 *)(lVar3 + 0x10) = param_3;
  FUN_1003d266c(lVar3,param_2);
  *(undefined **)(lVar3 + 0x18) = PTR_s_Buff_Skye_JumpJets_Pending_10185b0c0;
  return local_50;
}
`,
      },
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10037.c",
        sourceText: `
void FUN_100371bc4(void)
{
  FUN_1003be36c("Attack","LeftGun",0x6c);
}
`,
      },
    ],
    "TEST_DATE",
    { heroNameRows: [{ hero: "Skye", kind: "Buff", name: "JumpJets_Pending" }] },
  );

  const helperCall = manifest.items.find((row) => row.functionName === "FUN_100371bc4");
  assert.ok(helperCall);
  assert.deepEqual(helperCall.heroNames, ["Skye"]);
  assert.equal(helperCall.heroEvidence, "helper-body-token-table");
  assert.deepEqual(helperCall.buffTokens, ["Buff_Skye_JumpJets_Pending_10185b0c0"]);
});

test("native projectile manifest extracts callback projectile selector branches", () => {
  const rows = extractNativeProjectileSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00ddd.c",
    sourceText: `
void FUN_00ddd684(undefined8 param_1,undefined8 param_2,undefined4 *param_3,undefined8 *param_4)
{
  undefined4 uVar4;
  char *pcVar1;
  uVar4 = 0x5b;
  pcVar1 = "GunMuzzleTip_Ability02_Attack";
  if ((uVar3 & 1) == 0) {
    uVar4 = 0x59;
    pcVar1 = "GunMuzzleTip_Attack";
  }
  *param_3 = uVar4;
  *param_4 = pcVar1;
}

void FUN_00dddcc4(void)
{
  FUN_00ddda38("Attack","Effect_Ringo_MuzzleFlash","GunMuzzleTip_Attack",FUN_00ddd684,0);
}
`,
  });

  const selectorRows = rows.filter((row) => row.sourceKind === "native-projectile-selector");
  assert.equal(selectorRows.length, 2);
  assert.deepEqual(
    selectorRows.map((row) => [row.projectileIdHex, row.emitterLabel]),
    [
      ["0x5b", "GunMuzzleTip_Ability02_Attack"],
      ["0x59", "GunMuzzleTip_Attack"],
    ],
  );
  assert.deepEqual(
    selectorRows.map((row) => [row.projectileIdHex, row.actionKeys]),
    [
      ["0x5b", ["attack", "ability02"]],
      ["0x59", ["attack"]],
    ],
  );

  const registrationRow = rows.find((row) => row.sourceKind === "native-projectile-callback-registration");
  assert.ok(registrationRow);
  assert.equal(registrationRow.callbackFunction, "FUN_00ddd684");
  assert.equal(registrationRow.effectTokens[0], "Effect_Ringo_MuzzleFlash");
  assert.deepEqual(registrationRow.actionNames, ["Attack"]);
  assert.deepEqual(registrationRow.actionKeys, ["attack"]);
  assert.equal(registrationRow.emitterLabel, "GunMuzzleTip_Attack");
});

test("native projectile manifest inherits hero context from callback registrations", () => {
  const manifest = buildNativeProjectileSpawnManifest(
    [
      {
        sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00ddd.c",
        sourceText: `
void FUN_00ddd684(undefined8 param_1,undefined8 param_2,undefined4 *param_3,undefined8 *param_4)
{
  undefined4 uVar4;
  char *pcVar1;
  uVar4 = 0x59;
  pcVar1 = "GunMuzzleTip_Attack";
  *param_3 = uVar4;
  *param_4 = pcVar1;
}

void FUN_00dddcc4(void)
{
  FUN_00ddda38("Attack","Effect_Ringo_MuzzleFlash","GunMuzzleTip_Attack",FUN_00ddd684,0);
}
`,
      },
    ],
    "TEST_DATE",
    { heroNameRows: [{ hero: "Ringo", kind: "Effect", name: "MuzzleFlash" }] },
  );

  const selectorRow = manifest.items.find((row) => row.sourceKind === "native-projectile-selector");
  assert.ok(selectorRow);
  assert.deepEqual(selectorRow.heroNames, ["Ringo"]);
  assert.equal(selectorRow.heroEvidence, "callback-registration-hero-context");
});

test("native projectile manifest exporter writes viewer json and summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-projectiles-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "00dab.c"),
    `
void FUN_00dab814(void)
{
  FUN_00cf3048(uVar3,"Ability01_Cast",0,1,0,"AttackToIdle");
  FUN_00cfcad8(uVar3,2,"Ability01_Projectile");
}
`,
  );

  const viewerOut = path.join(tempDir, "native-projectile-spawn-manifest.json");
  const tsvOut = path.join(tempDir, "native_projectile_spawn_manifest.tsv");
  const jsonOut = path.join(tempDir, "native_projectile_spawn_manifest_summary.json");
  const summary = exportNativeProjectileSpawnManifest({
    sourcePaths: [sourceDir],
    viewerOut,
    tsvOut,
    jsonOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.directSpawns, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Ability01_Projectile/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /projectileMode/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /native-projectile-spawn/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /"rows": 1/);

  const manifest = buildNativeProjectileSpawnManifest(
    [
      {
        sourceFile: "android.c",
        sourceText: "void FUN_00abcd(void){ FUN_00cfcad8(u,0x5d,\"Projectile_RightHandThrow\"); }",
      },
    ],
    "TEST_DATE",
  );
  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.items[0].projectileId, 93);
});
