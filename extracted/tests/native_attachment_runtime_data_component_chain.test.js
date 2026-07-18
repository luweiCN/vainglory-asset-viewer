const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentRuntimeDataComponentChain,
  extractNativeAttachmentRuntimeDataComponentChainFromSources,
} = require("../tools/native_attachment_runtime_data_component_chain");

const iosSource = `
void FUN_10046b240(long param_1)
{
  long lVar1;
  DAT_10184dab8 = *(uint *)(param_1 + 0x13fb0);
  *(uint *)(param_1 + 0x13fb0) = DAT_10184dab8 + 1;
  lVar1 = param_1 + (ulong)DAT_10184dab8 * 0x2e8;
  *(code **)(lVar1 + 0xb0) = FUN_10049deac;
  *(code **)(lVar1 + 0xb8) = FUN_10049df04;
  *(uint *)(lVar1 + 0xa4) = DAT_10184dab8;
  *(undefined4 *)(lVar1 + 0xa8) = 0x1a0;
  *(uint *)(lVar1 + 0x2d8) = *(uint *)(lVar1 + 0x2d8) & 0x80000000 | 200;
  *(long *)(param_1 + 0x13fb8) = lVar1;
}

void FUN_10049deac(undefined8 *param_1)
{
  *param_1 = &PTR_thunk_FUN_1010a0064_101499a80;
  param_1[5] = 0;
  param_1[8] = 0;
  param_1[9] = 0;
  param_1[7] = 0;
  *(undefined4 *)((long)param_1 + 0x194) = 0xffffffff;
  *(undefined2 *)(param_1 + 0x33) = 0;
  *(undefined1 *)((long)param_1 + 0x19a) = 0;
  param_1[0xb] = 0;
  param_1[10] = 0;
  param_1[0x1d] = 0;
  *(undefined8 *)((long)param_1 + 0x18c) = 0xffffffffffffffff;
  *(undefined8 *)((long)param_1 + 0x184) = 0xffffffffffffffff;
  param_1[0x2e] = 0xffffffffffffffff;
  param_1[0x2d] = 0xffffffffffffffff;
  param_1[0x30] = 0xffffffffffffffff;
  param_1[0x2f] = 0xffffffffffffffff;
  param_1[0x2c] = 0xffffffffffffffff;
  param_1[0x2b] = 0xffffffffffffffff;
}

void FUN_10049df04(undefined8 *param_1)
{
  (**(code **)*param_1)();
}

void FUN_10046065c(long param_1,long param_2)
{
  char *pcVar1;
  byte bVar2;
  long lVar6;
  long *plVar7;
  undefined8 *puVar8;
  long *plVar9;
  *(long *)(param_1 + 0x28) = param_2;
  plVar7 = *(long **)(param_2 + 0x30);
  lVar6 = param_2;
  FUN_100460878(param_1,*plVar7,0);
  pcVar1 = *(char **)(lVar6 + 0x10);
  FUN_1004608fc(param_1,"*Ability__Withdraw*",pcVar1);
  FUN_1004608fc(param_1,"*Ability__Die*","Ability__Die");
  *(undefined8 *)(param_1 + 0x38) = "Ability__Die";
  FUN_1004608fc(param_1,"*Ability__Emote_Dance*","Ability__Emote_Dance");
  *(undefined8 *)(param_1 + 0x40) = "Ability__Emote_Dance";
  FUN_1004608fc(param_1,"*Ability__Emote_Taunt*","Ability__Emote_Taunt");
  *(undefined8 *)(param_1 + 0x48) = "Ability__Emote_Taunt";
  plVar7 = *(long **)(param_2 + 0x40);
  lVar6 = *plVar7;
  plVar9 = *(long **)(lVar6 + 0x38);
  puVar8 = (undefined8 *)*plVar9;
  FUN_100460aa0(param_1,"*Ability__DefaultAttack*",*puVar8);
  plVar9 = *(long **)(lVar6 + 0x40);
  FUN_100460aa0(param_1,"*Ability__DefaultAttack*",*plVar9);
  if (*(uint *)(param_2 + 0x48) != 0xffffffff) {
    bVar2 = *(byte *)(param_1 + 0x199);
    *(undefined8 *)(param_1 + (ulong)bVar2 * 8 + 0xf0) =
      *(undefined8 *)(param_1 + (ulong)*(uint *)(param_2 + 0x48) * 8 + 0x50);
    *(byte *)(param_1 + 0x199) = bVar2 + 1;
  }
  if (*(uint *)(param_2 + 0x4c) != 0xffffffff) use();
  if (*(uint *)(param_2 + 0x50) != 0xffffffff) use();
}

undefined8 FUN_100460878(long param_1,long param_2,undefined8 param_3)
{
  byte bVar1;
  undefined8 uVar2;
  if (*(char *)(param_1 + 0x198) == '\\x14') return 0;
  uVar2 = FUN_1010a0298(param_1,DAT_101867310);
  FUN_10045e718(uVar2,param_2,param_1,param_3);
  bVar1 = *(byte *)(param_1 + 0x198);
  if (*(char *)(param_2 + 0x8a) != '\\0') *(uint *)(param_1 + 0x194) = (uint)bVar1;
  *(undefined8 *)(param_1 + (ulong)bVar1 * 8 + 0x50) = uVar2;
  *(byte *)(param_1 + 0x198) = bVar1 + 1;
  return uVar2;
}

void FUN_1004608fc(undefined8 param_1,undefined8 param_2,undefined8 param_3)
{
  long lVar2 = FUN_1010a0e0c(FUN_1010a1520(),0,param_2,0);
  if (lVar2 != 0) FUN_100460878(param_1,lVar2,param_3);
}

void FUN_100460aa0(long param_1,byte *param_2,byte *param_3)
{
  uint uVar1 = 0x811c9dc5;
  uint uVar3 = 0x811c9dc5;
  if ((ulong)*(byte *)(param_1 + 0x198) != 0) {
    lVar4 = *(long *)(param_1 + 0x50);
    pcVar6 = *(char **)(lVar4 + 0x200);
    uVar3 = (uVar3 ^ (int)*pcVar6) * 0x1000193;
  }
  if (uVar1 == uVar3) return;
  FUN_1004608fc();
}
`;

const androidSource = `
void FUN_00d528c0(long param_1)
{
  long lVar1;
  DAT_02e3ef78 = *(uint *)(param_1 + 0x13fb0);
  *(uint *)(param_1 + 0x13fb0) = DAT_02e3ef78 + 1;
  lVar1 = param_1 + (ulong)DAT_02e3ef78 * 0x2e8;
  *(code **)(lVar1 + 0xb0) = FUN_00d54a4c;
  *(code **)(lVar1 + 0xb8) = FUN_00d54ac4;
  *(uint *)(lVar1 + 0xa4) = DAT_02e3ef78;
  *(undefined4 *)(lVar1 + 0xa8) = 0x1a0;
  *(uint *)(lVar1 + 0x2d8) = *(uint *)(lVar1 + 0x2d8) & 0x80000000 | 200;
  *(long *)(param_1 + 0x13fb8) = lVar1;
}

undefined8 * FUN_00d54a4c(undefined8 *param_1)
{
  long lVar1;
  param_1[5] = 0;
  param_1[8] = 0;
  param_1[9] = 0;
  param_1[7] = 0;
  *(undefined2 *)(param_1 + 0x33) = 0;
  *(undefined1 *)((long)param_1 + 0x19a) = 0;
  *param_1 = &PTR_thunk_FUN_01985bd0_0281da88;
  *(undefined4 *)((long)param_1 + 0x194) = 0xffffffff;
  memset(param_1 + 10,0,0xa0);
  lVar1 = 0x158;
  do {
    *(undefined4 *)((long)param_1 + lVar1) = 0xffffffff;
    lVar1 = lVar1 + 4;
  } while (lVar1 != 0x194);
  return param_1;
}

void FUN_00d54ac4(undefined8 *param_1)
{
  (**(code **)*param_1)();
}

void FUN_00d529bc(long param_1,long param_2)
{
  char *pcVar1;
  byte bVar2;
  long lVar5;
  long *plVar6;
  undefined8 *puVar7;
  long *plVar8;
  *(long *)(param_1 + 0x28) = param_2;
  plVar6 = *(long **)(param_2 + 0x30);
  lVar5 = param_2;
  FUN_00d52be4(param_1,*plVar6,0);
  pcVar1 = *(char **)(lVar5 + 0x10);
  FUN_00d52ca0(param_1,"*Ability__Withdraw*",pcVar1);
  FUN_00d52ca0(param_1,"*Ability__Die*","Ability__Die");
  *(undefined8 *)(param_1 + 0x38) = "Ability__Die";
  FUN_00d52ca0(param_1,"*Ability__Emote_Dance*","Ability__Emote_Dance");
  *(undefined8 *)(param_1 + 0x40) = "Ability__Emote_Dance";
  FUN_00d52ca0(param_1,"*Ability__Emote_Taunt*","Ability__Emote_Taunt");
  *(undefined8 *)(param_1 + 0x48) = "Ability__Emote_Taunt";
  plVar6 = *(long **)(param_2 + 0x40);
  lVar5 = *plVar6;
  plVar8 = *(long **)(lVar5 + 0x38);
  puVar7 = (undefined8 *)*plVar8;
  FUN_00d52e3c(param_1,"*Ability__DefaultAttack*",*puVar7);
  plVar8 = *(long **)(lVar5 + 0x40);
  FUN_00d52e3c(param_1,"*Ability__DefaultAttack*",*plVar8);
  if (*(uint *)(param_2 + 0x48) != 0xffffffff) {
    bVar2 = *(byte *)(param_1 + 0x199);
    *(undefined8 *)(param_1 + (ulong)bVar2 * 8 + 0xf0) =
      *(undefined8 *)(param_1 + (ulong)*(uint *)(param_2 + 0x48) * 8 + 0x50);
    *(byte *)(param_1 + 0x199) = bVar2 + 1;
  }
  if (*(uint *)(param_2 + 0x4c) != 0xffffffff) use();
  if (*(uint *)(param_2 + 0x50) != 0xffffffff) use();
}

undefined8 FUN_00d52be4(long param_1,long param_2,undefined8 param_3)
{
  byte bVar1;
  undefined8 uVar2 = 0;
  if (*(char *)(param_1 + 0x198) != '\\x14') {
    uVar2 = FUN_01985d44(param_1,DAT_031a94c4);
    FUN_00d4fe50(uVar2,param_2,param_1,param_3);
    bVar1 = *(byte *)(param_1 + 0x198);
    if (*(char *)(param_2 + 0x8a) != '\\0') *(uint *)(param_1 + 0x194) = (uint)bVar1;
    *(undefined8 *)(param_1 + (ulong)bVar1 * 8 + 0x50) = uVar2;
    *(byte *)(param_1 + 0x198) = bVar1 + 1;
  }
  return uVar2;
}

void FUN_00d52ca0(undefined8 param_1,undefined8 param_2,undefined8 param_3)
{
  long lVar2 = FUN_00d6eb5c(FUN_00d6eb50(),param_2);
  if (lVar2 != 0) FUN_00d52be4(param_1,lVar2,param_3);
}

void FUN_00d52e3c(long param_1,byte *param_2,byte *param_3)
{
  uint uVar1 = 0x811c9dc5;
  uint uVar4 = 0x811c9dc5;
  if (*(char *)(param_1 + 0x198) != '\\0') {
    pbVar3 = (byte *)FUN_00d50460(*(undefined8 *)(param_1 + 0x50));
    uVar1 = (uVar1 ^ (uint)*pbVar3) * 0x1000193;
  }
  if (uVar4 == uVar1) return;
  FUN_00d52ca0(param_1,param_2,param_3);
}
`;

function sourceFile(filePath, text) {
  return { filePath, text };
}

test("runtime data component scanner closes registration, loading, append, and dedupe chain", () => {
  const rows = extractNativeAttachmentRuntimeDataComponentChainFromSources({
    sourceFiles: [
      sourceFile("external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c", iosSource),
      sourceFile(
        "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
        androidSource,
      ),
    ],
  });

  assert.equal(rows.length, 10);
  assert.equal(rows.every((row) => row.complete === "yes"), true);

  const iosLoader = rows.find((row) => row.platform === "ios" && row.stage === "ability-slot-loader");
  assert.match(iosLoader.evidenceTags, /ability-name-default-attack/);
  assert.match(iosLoader.evidenceTags, /append-slot-call-FUN_100460878/);
  assert.match(iosLoader.evidenceTags, /special-slot-count-0x199/);

  const androidAppend = rows.find((row) => row.platform === "android" && row.stage === "ability-slot-append");
  assert.match(androidAppend.evidenceTags, /append-slot-factory-token/);
  assert.match(androidAppend.evidenceTags, /max-slot-count-0x14/);

  const iosDedupe = rows.find((row) => row.platform === "ios" && row.stage === "default-attack-dedupe");
  assert.match(iosDedupe.functions, /FUN_10046065c/);
  assert.match(iosDedupe.evidenceTags, /default-attack-token/);
  assert.match(iosDedupe.evidenceTags, /fnv1a-basis-0x811c9dc5/);
});

test("runtime data component exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-data-component-chain-"));
  const iosDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const androidDir = path.join(tempDir, "GameKindred_android_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, "test.c"), iosSource);
  fs.writeFileSync(path.join(androidDir, "test.c"), androidSource);

  const summary = exportNativeAttachmentRuntimeDataComponentChain({
    sourcePaths: [iosDir, androidDir],
    tsvOut: path.join(reportDir, "native_attachment_runtime_data_component_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_runtime_data_component_chain_summary.json"),
  });

  assert.equal(summary.rows, 10);
  assert.equal(summary.completeRows, 10);
  assert.equal(summary.incompleteRows, 0);
  assert.deepEqual(summary.componentTokens, ["DAT_02e3ef78", "DAT_10184dab8"]);

  const tsv = fs.readFileSync(path.join(reportDir, "native_attachment_runtime_data_component_chain.tsv"), "utf8");
  assert.match(tsv, /component-registration/);
  assert.match(tsv, /default-attack-dedupe/);

  const json = JSON.parse(
    fs.readFileSync(path.join(reportDir, "native_attachment_runtime_data_component_chain_summary.json"), "utf8"),
  );
  assert.equal(json.summary.byStage["ability-slot-loader"], 2);
});
