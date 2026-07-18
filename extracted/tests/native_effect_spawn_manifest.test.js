const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildNativeEffectSpawnManifest,
  extractNativeEffectSpawnRowsFromSource,
} = require("../tools/native_effect_spawn_manifest");

test("extractNativeEffectSpawnRowsFromSource reads direct effect spawns with locator labels", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00db4.c",
    sourceText: `
void FUN_00db4b10(void) {
  FUN_00cf3048(uVar3,"Ability__Catherine__C",0,1,0,"AttackToIdle");
  FUN_00cf3ac8(0x3f800000,uVar3,"Effect_Catherine_UltImpact",1,"CenterBody");
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.platform, row.sourceKind, row.effectToken, row.locatorLabel, row.actionKeys]),
    [["android", "native-effect-spawn", "Effect_Catherine_UltImpact", "CenterBody", ["ability03"]]],
  );
});

test("extractNativeEffectSpawnRowsFromSource keeps explicit bone locators and root effects separate", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00dc8.c",
    sourceText: `
void FUN_00dc8c74(void) {
  FUN_00cf3428(0xbf800000,uVar4,"Effect_Joule_MechJets",1,"Bone_LFootMech",FUN_00dc8c74,1,0,0);
  FUN_00cf32cc(0,uVar2,"Effect_Joule_Attack_Basic",1,0,1,0,0);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint]),
    [
      ["Effect_Joule_MechJets", "Bone_LFootMech", "locator"],
      ["Effect_Joule_Attack_Basic", "", "model-root"],
    ],
  );
});

test("buildNativeEffectSpawnManifest annotates heroes from effect tokens", () => {
  const manifest = buildNativeEffectSpawnManifest(
    [
      {
        sourceFile: "functions/00de2.c",
        sourceText: `
void FUN_00de2abc(void) {
  FUN_00cf3358(0x3f800000,uVar2,"Effect_Skye_AA_MF",0,param_2,0,1,0,0);
}
`,
      },
    ],
    "now",
    {
      heroNameRows: [{ kind: "Effect", hero: "Skye", name: "AA_MF" }],
    },
  );

  assert.equal(manifest.count, 1);
  assert.deepEqual(manifest.items[0].heroNames, ["Skye"]);
  assert.deepEqual(manifest.items[0].actionKeys, ["attack"]);
});

test("extractNativeEffectSpawnRowsFromSource reads vcall effect setters with ability symbol context", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10038.c",
    sourceText: `
void FUN_100384a90(void) {
  plVar3 = (long *)(**(code **)(*plVar3 + 0x50))(plVar3,PTR_s_Ability__HeroPLU__B_1018599e0);
  plVar3 = (long *)thunk_FUN_10000e358();
  plVar3 = (long *)(**(code **)(*plVar3 + 0x58))(plVar3);
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Taka_SmokeBomb");
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.platform, row.sourceKind, row.helperFunction, row.effectToken, row.bindHint, row.actionKeys]),
    [["ios", "native-effect-vcall", "vcall+0x48", "Effect_Taka_SmokeBomb", "model-root", ["ability02"]]],
  );
});

test("extractNativeEffectSpawnRowsFromSource records nearby runtime string tokens around native effect channels", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d45.c",
    sourceText: `
void FUN_00d453b0(void) {
  use_string("Buff_HeroPLU_TempNonRecoveryHelicopterPFX");
  use_string("Effect_HeroPLU_SmokeCloudSput");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_HeroPLU_Helicopter");
  use_string("Buff_HeroPLU_HelicopterSpinPerk");
  use_string("Sound_HeroPLU_Overheat_NoUlt");
  use_string("Ability__HeroPLU__B");
}
`,
  });

  assert.deepEqual(rows[0].nearbyBuffTokens, ["Buff_HeroPLU_TempNonRecoveryHelicopterPFX", "Buff_HeroPLU_HelicopterSpinPerk"]);
  assert.deepEqual(rows[0].nearbyEffectTokens, ["Effect_HeroPLU_SmokeCloudSput"]);
  assert.deepEqual(rows[0].nearbyAbilityNames, ["Ability__HeroPLU__B"]);
  assert.deepEqual(rows[0].nearbySoundTokens, ["Sound_HeroPLU_Overheat_NoUlt"]);
});

test("extractNativeEffectSpawnRowsFromSource carries chained vcall locator labels into effect rows", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00df5.c",
    sourceText: `
void FUN_00df5130(void) {
  plVar3 = (long *)FUN_00cfab04(auStack_b8);
  plVar3 = (long *)(**(code **)(*plVar3 + 0x60))(plVar3,"CenterBody");
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Hero052_A");
  plVar3 = (long *)FUN_00cfab04(auStack_b8);
  plVar3 = (long *)(**(code **)(*plVar3 + 0x60))(plVar3,"CenterBody");
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Hero052_Ball_RushStun");
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint]),
    [
      ["Effect_Hero052_A", "CenterBody", "locator"],
      ["Effect_Hero052_Ball_RushStun", "CenterBody", "locator"],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource carries vcall 0x68 locator labels into effect rows", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e12.c",
    sourceText: `
void FUN_00e122e4(void) {
  plVar3 = (long *)FUN_00d2945c(lVar2 + 0x10);
  plVar3 = (long *)(**(code **)(*plVar3 + 0x68))(plVar3,"CenterBody");
  plVar3 = (long *)(**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Baptiste_B_Beam");
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint]), [
    ["Effect_Baptiste_B_Beam", "CenterBody", "locator"],
  ]);
});

test("extractNativeEffectSpawnRowsFromSource carries vcall locator labels across decompiler warning comments", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e1f.c",
    sourceText: `
void FUN_00e1f0d0(void) {
  plVar2 = (long *)(**(code **)(*plVar2 + 0x68))(plVar2,"CenterBody");
  /* WARNING: Could not recover jumptable at 0x00e1f114. Too many branches */
  /* WARNING: Treating indirect jump as call */
  (**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Glaive_Attack_Crit_Hit");
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint]), [
    ["Effect_Glaive_Attack_Crit_Hit", "CenterBody", "locator"],
  ]);
});

test("extractNativeEffectSpawnRowsFromSource does not carry distant vcall locators across unrelated statements", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00df5.c",
    sourceText: `
void FUN_00df5130(void) {
  plVar3 = (long *)(**(code **)(*plVar3 + 0x60))(plVar3,"CenterBody");
  unrelated_01();
  unrelated_02();
  unrelated_03();
  unrelated_04();
  unrelated_05();
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Hero052_A");
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint]), [["Effect_Hero052_A", "", "model-root"]]);
});

test("extractNativeEffectSpawnRowsFromSource marks selected attachment vcall channels", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d87.c",
    sourceText: `
void FUN_00d87530(void) {
  plVar4 = (long *)FUN_00d2945c(lVar3 + 0x10);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x98))(plVar4,2);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x60))();
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_Baron_C_AllyPreWarning");
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.locatorLabel, row.bindHint, row.selectedAttachmentSlot]), [
    ["Effect_Baron_C_AllyPreWarning", "", "selected-attachment", 2],
  ]);
});

test("extractNativeEffectSpawnRowsFromSource records chained vcall effect option parameters", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e50.c",
    sourceText: `
void FUN_00e50d28(undefined8 param_1)
{
  plVar4 = (long *)FUN_00d2945c(lVar3 + 0x10);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x60))();
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_Hero057_C_Cloud");
  plVar4 = (long *)(**(code **)(*plVar4 + 0xc0))(0x3f800000,0,0x3f800000);
  local_58 = (code *)CONCAT44(local_58._4_4_,0x40800000);
  local_50 = 1;
  plVar4 = (long *)(**(code **)(*plVar4 + 0xd0))(plVar4,&local_58);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x78))(plVar4,1);
  plVar4 = (long *)(**(code **)(*plVar4 + 0xd8))(0x3f4ccccd);
  local_48 = (code *)CONCAT44(local_48._4_4_,0x3f000000);
  local_40 = 1;
  plVar4 = (long *)(**(code **)(*plVar4 + 0x60))(plVar4,&local_48);
  (**(code **)(*plVar4 + 0xb0))(plVar4,1);
}
`,
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].effectOptionOffsets, ["0xc0", "0xd0", "0x78", "0xd8", "0x60", "0xb0"]);
  assert.deepEqual(rows[0].effectOptionFloatArgs, ["0xc0:1,0,1", "0xd0:4", "0x78:1", "0xd8:0.8", "0x60:0.5", "0xb0:1"]);
  assert.deepEqual(rows[0].effectOptionArgKinds, [
    "0xc0:numeric-direct",
    "0xd0:numeric-local",
    "0x78:numeric-direct",
    "0xd8:numeric-direct",
    "0x60:numeric-local",
    "0xb0:numeric-direct",
  ]);
  assert.deepEqual(rows[0].effectOptions, {
    offsetValues: {
      "0xc0": [1, 0, 1],
      "0xd0": [4],
      "0x78": [1],
      "0xd8": [0.8],
      "0x60": [0.5],
      "0xb0": [1],
    },
    color: [1, 0, 1],
    scale: 4,
    followTarget: true,
    fadeSeconds: 0.8,
    percentParam: 0.5,
    visibleOrActive: true,
  });
});

test("extractNativeEffectSpawnRowsFromSource classifies 0x60 dynamic and callback argument shapes", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e10.c",
    sourceText: `
void FUN_00e108ec(undefined8 param_1)
{
  uVar5 = FUN_00d59f54(uVar2,2,5,0x19,0);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_Ardan_Arena_Warning_E");
  local_40 = 1;
  local_48[0] = uVar5;
  (**(code **)(*plVar4 + 0x60))(plVar4,local_48);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_GoHere_WBeam");
  plVar4 = (long *)(**(code **)(*plVar4 + 0x60))(plVar4,FUN_00cb6a64);
  plVar4 = (long *)(**(code **)(*plVar4 + 0x48))(plVar4,"Effect_Ylva_C_Trap_Active");
  local_a8 = FUN_00df0270;
  local_a0 = 3;
  (**(code **)(*plVar4 + 0x60))(plVar4,&local_a8);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.effectOptionArgKinds]),
    [
      ["Effect_Ardan_Arena_Warning_E", ["0x60:dynamic-local"]],
      ["Effect_GoHere_WBeam", ["0x60:callback"]],
      ["Effect_Ylva_C_Trap_Active", ["0x60:callback-struct"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource keeps wider dynamic local evidence for delayed 0x60 calls", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10040.c",
    sourceText: `
void FUN_100400d48(undefined8 param_1)
{
  local_40[0] = (float)FUN_1003dfe60(uVar1,2,5,0x19,0);
  *(float *)(param_1 + 0x318) = local_40[0];
  if (*(float *)(param_1 + 0x31c) < local_40[0]) {
    *(float *)(param_1 + 0x31c) = local_40[0];
  }
  *(uint *)(param_1 + 0x340) =
       *(uint *)(param_1 + 0x340) & 0xfffe0 | (uint)(local_40[0] < 0.0) << 4 |
       *(uint *)(param_1 + 0x340) & 0xfff0000f;
  lVar2 = FUN_10042e498(param_1);
  plVar3 = (long *)FUN_100441e68(lVar2 + 0x10);
  plVar3 = (long *)(**(code **)(*plVar3 + 0x60))();
  plVar3 = (long *)(**(code **)(*plVar3 + 0x48))(plVar3,"Effect_Ardan_Arena_Warning_E");
  plVar3 = (long *)(**(code **)(*plVar3 + 0x50))(plVar3,"Effect_Ardan_Arena_Warning_A");
  local_38 = 1;
  (**(code **)(*plVar3 + 0x60))(plVar3,local_40);
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.effectOptionArgKinds]), [
    ["Effect_Ardan_Arena_Warning_E", ["0x60:dynamic-local"]],
  ]);
  assert.deepEqual(rows.map((row) => [row.effectToken, row.effectOptionArgSources]), [
    [
      "Effect_Ardan_Arena_Warning_E",
      ["0x60:dynamic-local:local_40=(float)FUN_1003dfe60(uVar1,2,5,0x19,0)"],
    ],
  ]);
});

test("extractNativeEffectSpawnRowsFromSource records dynamic option source expressions for warning rings", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1003e.c",
    sourceText: `
void FUN_1003e6e48(undefined8 param_1)
{
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Generic_WarningRing");
  plVar2 = (long *)(**(code **)(*plVar2 + 0xb0))(plVar2,1);
  local_40[0] = FUN_100432da4(param_1);
  local_38 = 1;
  plVar2 = (long *)(**(code **)(*plVar2 + 0xd0))(plVar2,local_40);
  plVar2 = (long *)(**(code **)(*plVar2 + 0xc0))(0x3f800000,0x3f000000,0x3f000000);
  (**(code **)(*plVar2 + 0xd8))(0x3f4ccccd);
}
`,
  });

  assert.deepEqual(rows.map((row) => [row.effectToken, row.effectOptionArgKinds]), [
    [
      "Effect_Generic_WarningRing",
      ["0xb0:numeric-direct", "0xd0:dynamic-local", "0xc0:numeric-direct", "0xd8:numeric-direct"],
    ],
  ]);
  assert.deepEqual(rows[0].effectOptionArgSources, [
    "0xb0:numeric-direct:1",
    "0xd0:dynamic-local:local_40=FUN_100432da4(param_1)",
    "0xc0:numeric-direct:0x3f800000",
    "0xc0:numeric-direct:0x3f000000",
    "0xd8:numeric-direct:0x3f4ccccd",
  ]);
});

test("extractNativeEffectSpawnRowsFromSource ignores no-arg 0x60 builder resolves after an effect bind", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e0c.c",
    sourceText: `
void FUN_00e0c300(undefined8 param_1)
{
  lVar4 = FUN_00d63f30(param_1);
  plVar5 = (long *)FUN_00d2945c(lVar4 + 0x10);
  plVar5 = (long *)(**(code **)(*plVar5 + 0x60))();
  plVar5 = (long *)(**(code **)(*plVar5 + 0x48))(plVar5,"Effect_AdagioArcaneFire_Impact");
  (**(code **)(*plVar5 + 0x78))(plVar5,1);
  lVar4 = FUN_00d65e5c(param_1);
  plVar5 = (long *)FUN_00d2945c(lVar4 + 0x10);
  plVar5 = (long *)(**(code **)(*plVar5 + 0x60))();
  plVar5 = (long *)(**(code **)(*plVar5 + 0x48))(plVar5,"Effect_AdagioArcaneFire_Impact");
  (**(code **)(*plVar5 + 0x78))(plVar5,1);
}
`,
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].effectOptionOffsets, ["0x78"]);
  assert.deepEqual(rows[1].effectOptionOffsets, ["0x78"]);
});

test("extractNativeEffectSpawnRowsFromSource ignores self-only 0x60 vcalls after an effect bind", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10037.c",
    sourceText: `
void FUN_10037b6dc(void)
{
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Idris_A_FlashAtOrigin");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,0);
  (**(code **)(*plVar2 + 0x100))(plVar2,FUN_1003af4ec);
  plVar2 = (long *)FUN_10000f748();
  (**(code **)(*plVar2 + 0x60))(plVar2);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Idris_A_FlashAtDestination");
  (**(code **)(*plVar2 + 0x78))(plVar2,1);
}
`,
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].effectOptionOffsets, ["0x78"]);
  assert.deepEqual(rows[1].effectOptionOffsets, ["0x78"]);
});

test("extractNativeEffectSpawnRowsFromSource reads callback output effect selectors", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d8c.c",
    sourceText: `
void FUN_00d8c7fc(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Ringo_B_Projectile";
  param_2[4] = "Effect_Ringo_B_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [
      row.platform,
      row.sourceKind,
      row.effectToken,
      row.helperFunction,
      row.bindHint,
      row.actionKeys,
      row.selectorOutputTarget,
      row.selectorOutputRole,
    ]),
    [
      [
        "android",
        "native-effect-selector",
        "Effect_Ringo_B_Projectile",
        "param-output-effect",
        "model-root",
        ["ability02"],
        "*param_2",
        "projectile",
      ],
      [
        "android",
        "native-effect-selector",
        "Effect_Ringo_B_Impact",
        "param-output-effect",
        "model-root",
        ["ability02"],
        "param_2[4]",
        "impact",
      ],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource infers selector action keys from sound tokens in the same function", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d87.c",
    sourceText: `
void FUN_00d870c8(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Gwen_Shot";
  param_2[4] = "Effect_Gwen_Shot_Impact";
  param_2[0xc] = "Sound_Gwen_Ability_C_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.actionKeys]),
    [
      ["Effect_Gwen_Shot", ["ability03"]],
      ["Effect_Gwen_Shot_Impact", ["ability03"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource carries selector light state from nearby Good runtime tokens", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d8b.c",
    sourceText: `
void FUN_00d8b98c(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Malene_A1Projectile";
  param_2[4] = "Effect_Malene_A1Hit";
  param_2[0xc] = "Sound_Malene_Good_Ability_A_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorOutputRole, row.actionKeys, row.selectorStateTerms]),
    [
      ["Effect_Malene_A1Projectile", "projectile", ["ability01"], ["light"]],
      ["Effect_Malene_A1Hit", "impact", ["ability01"], ["light"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource carries selector dark state from nearby Evil runtime tokens", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d8b.c",
    sourceText: `
void FUN_00d8bb28(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Malene_A2Projectile";
  param_2[4] = "Effect_Malene_A2Hit";
  param_2[0xc] = "Sound_Malene_Evil_Ability_A_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorOutputRole, row.actionKeys, row.selectorStateTerms]),
    [
      ["Effect_Malene_A2Projectile", "projectile", ["ability01"], ["dark"]],
      ["Effect_Malene_A2Hit", "impact", ["ability01"], ["dark"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource leaves selector state empty when nearby state terms conflict", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d8b.c",
    sourceText: `
void FUN_00d8b98c(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Malene_A1Projectile";
  param_2[4] = "Effect_Malene_A1Hit";
  param_2[0xc] = "Sound_Malene_Good_Ability_A_Impact";
  param_2[0xd] = "Sound_Malene_Evil_Ability_A_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorStateTerms]),
    [
      ["Effect_Malene_A1Projectile", []],
      ["Effect_Malene_A1Hit", []],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource infers selector attack action keys from companion Attack effect tokens", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d8b.c",
    sourceText: `
void FUN_00d8b6c8(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Malene_LightEmpoweredAttack";
  param_2[4] = "Effect_Malene_LightEmpHit";
  param_2[0xc] = "Sound_Malene_Good_Empowered_Impact";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorOutputRole, row.actionKeys, row.selectorStateTerms]),
    [
      ["Effect_Malene_LightEmpoweredAttack", "projectile", ["attack"], ["light"]],
      ["Effect_Malene_LightEmpHit", "impact", ["attack"], ["light"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource does not let distant ability symbols pollute selector attack context", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d95.c",
    sourceText: `
void FUN_00d955d0(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Caine_A_Bullet";
  param_2[4] = "Effect_Caine_DefaultAttack_Impact";
  param_2[0xd] = "Sound_Caine_Attack_Impact_2";
  param_2[0xc] = "Sound_Caine_Attack_Impact_1";
  param_2[0xe] = "Sound_Caine_Attack_Impact_3";
  filler_01();
  filler_02();
  filler_03();
  filler_04();
  filler_05();
  filler_06();
  filler_07();
  filler_08();
  filler_09();
  filler_10();
  plVar4 = (long *)(**(code **)(*plVar4 + 0x38))(plVar4,PTR_s_Ability__Caine__B_02bf18a0);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorOutputRole, row.actionKeys]),
    [
      ["Effect_Caine_A_Bullet", "projectile", ["attack"]],
      ["Effect_Caine_DefaultAttack_Impact", "impact", ["attack"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource does not treat ability sound Attack suffixes as basic attacks", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d95.c",
    sourceText: `
void FUN_00d95c14(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Warhawk_A_Shot";
  param_2[4] = "Effect_Warhawk_A_Shot_Impact";
  param_2[0xd] = "Sound_Warhawk_A_Attack_Impact_2";
  param_2[0xc] = "Sound_Warhawk_A_Attack_Impact_1";
  param_2[0xe] = "Sound_Warhawk_A_Attack_Impact_3";
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.selectorOutputRole, row.actionKeys]),
    [
      ["Effect_Warhawk_A_Shot", "projectile", ["ability01"]],
      ["Effect_Warhawk_A_Shot_Impact", "impact", ["ability01"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource limits selector action context to nearby runtime symbols", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00d89.c",
    sourceText: `
void FUN_00d89e1c(long param_1,undefined8 *param_2)
{
  *param_2 = "Effect_Kestrel_HalcyonArrow";
  param_2[4] = "Effect_Kestrel_HalcyonArrowImpact";
  (**(code **)(*plVar5 + 0x68))(plVar5,"Ability__Kestrel__A");
  filler_01();
  filler_02();
  filler_03();
  filler_04();
  filler_05();
  filler_06();
  filler_07();
  filler_08();
  filler_09();
  filler_10();
  filler_11();
  filler_12();
  filler_13();
  filler_14();
  filler_15();
  filler_16();
  filler_17();
  filler_18();
  filler_19();
  filler_20();
  filler_21();
  filler_22();
  filler_23();
  filler_24();
  filler_25();
  filler_26();
  filler_27();
  filler_28();
  filler_29();
  filler_30();
  plVar5 = (long *)(**(code **)(*plVar5 + 0x10))(plVar5,PTR_s_Ability__Kestrel__B_02beef90);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.actionKeys]),
    [
      ["Effect_Kestrel_HalcyonArrow", ["ability01"]],
      ["Effect_Kestrel_HalcyonArrowImpact", ["ability01"]],
    ],
  );
});

test("extractNativeEffectSpawnRowsFromSource prefers nearby action calls over sound token action names for direct spawns", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00dab.c",
    sourceText: `
void FUN_00dab9b0(void)
{
  FUN_00cf3048(uVar3,"Ability02_Cast",0,1,0,"AttackToIdle");
  FUN_00cf4164(0x3f800000,uVar3,uVar4,"Sound_Adagio_Ability_A_Projectile_1",0,0,0xffffffff,0,1);
  FUN_00cf41bc(uVar4,"Sound_Adagio_Ability_A_Projectile_2");
  FUN_00cf41bc(uVar4,"Sound_Adagio_Ability_A_Projectile_3");
  FUN_00cf32cc(0,uVar3,"Effect_Adagio_GasolineSoaked_Cast",1,0,1,0,0);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.actionNames, row.actionKeys]),
    [["Effect_Adagio_GasolineSoaked_Cast", ["Ability02_Cast"], ["ability02"]]],
  );
});

test("extractNativeEffectSpawnRowsFromSource keeps distant direct spawn action calls while filtering conflicting sound tokens", () => {
  const rows = extractNativeEffectSpawnRowsFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00dab.c",
    sourceText: `
void FUN_00dab9b0(void)
{
  FUN_00cf3048(uVar3,"Ability02_Cast",0,1,0,"AttackToIdle");
  filler_01();
  filler_02();
  filler_03();
  filler_04();
  filler_05();
  filler_06();
  filler_07();
  filler_08();
  filler_09();
  filler_10();
  filler_11();
  filler_12();
  filler_13();
  filler_14();
  filler_15();
  filler_16();
  filler_17();
  filler_18();
  FUN_00cf4164(0x3f800000,uVar3,uVar4,"Sound_Adagio_Ability_A_Projectile_1",0,0,0xffffffff,0,1);
  FUN_00cf32cc(0,uVar3,"Effect_Adagio_GasolineSoaked_Cast",1,0,1,0,0);
}
`,
  });

  assert.deepEqual(
    rows.map((row) => [row.effectToken, row.actionNames, row.actionKeys]),
    [["Effect_Adagio_GasolineSoaked_Cast", ["Ability02_Cast"], ["ability02"]]],
  );
});
