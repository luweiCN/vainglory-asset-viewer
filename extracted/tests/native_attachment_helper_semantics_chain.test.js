const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentHelperSemantics,
  extractNativeAttachmentHelperSemanticsFromSources,
} = require("../tools/native_attachment_helper_semantics_chain");

const iosSource = `
float FUN_1003dfcb0(long param_1,long param_2,int param_3,uint param_4)
{
  long lVar1;
  float fVar2;
  fVar2 = 0.0;
  if ((param_4 & 1) != 0) {
    fVar2 = *(float *)(param_2 + 8) + *(float *)(param_2 + 0xc) + *(float *)(param_2 + 0x10);
  }
  lVar1 = *(long *)(param_1 + 0x40);
  if ((param_4 >> 5 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x20);
  if ((param_4 >> 1 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x18);
  if ((param_4 >> 2 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x18);
  if ((param_4 >> 3 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x14);
  if ((param_4 >> 4 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x1c);
  if ((param_4 & 0x40) != 0) fVar2 = *(float *)(param_2 + 0x24);
  return fVar2;
}

undefined1 [16] FUN_1003dfe60(long param_1,ulong param_2,int param_3,undefined8 param_4,int param_5)
{
  long lVar2;
  long lVar4;
  long *plVar3;
  uint uVar1;
  plVar3 = (long *)(param_1 + 0x18);
  do {
    lVar4 = *plVar3;
    plVar3 = (long *)(lVar4 + 0x20);
  } while (*(int *)(*(long *)(lVar4 + 8) + 0xa4) != DAT_10184dab8);
  lVar2 = *(long *)(lVar4 + (param_2 & 0xffffffff) * 8 + 0x50);
  plVar3 = *(long **)(*(long *)(lVar2 + 0x38) + 0xb0);
  lVar4 = *plVar3;
  if (lVar4 != 0 && param_3 != 0) {
    param_3 = param_3 + -1;
  }
  uVar1 = *(uint *)(lVar2 + 0x238) >> 10 & 7;
  if ((param_5 == 0) && (uVar1 == 0)) return ZEXT816(0);
  FUN_1003dfcb0(param_1,lVar4,uVar1,param_4);
}

undefined1 [16] FUN_1003e00a8(long param_1,undefined8 param_2,undefined8 param_3,undefined8 param_4,undefined8 param_5)
{
  return FUN_1003dfe60(param_1,param_2,param_3,param_4,param_5);
}
`;

const androidSource = `
void FUN_00d59f54(void)
{
  FUN_00d090c4();
}

undefined1 [16] FUN_00d090c4(undefined8 param_1,undefined4 param_2,undefined4 param_3,undefined4 param_4,uint param_5)
{
  int iVar1;
  undefined8 uVar2;
  long lVar3;
  undefined8 uVar4;
  uVar2 = FUN_00d9eb64(param_1);
  lVar3 = FUN_00d53914(uVar2,param_2);
  uVar4 = FUN_00d4c67c(*(undefined8 *)(lVar3 + 0xb0),param_3);
  iVar1 = FUN_00d535a4(uVar2,param_2);
  if ((iVar1 == 0) && ((param_5 & 1) == 0)) return ZEXT816(0);
  FUN_00d08e88(param_1,uVar4,iVar1,param_4);
}

void FUN_00d9eb64(long param_1)
{
  long lVar1;
  lVar1 = *(long *)(param_1 + 0x18);
  while ((lVar1 != 0 && (*(int *)(*(long *)(lVar1 + 8) + 0xa4) != DAT_02e3ef78))) {
    lVar1 = *(long *)(lVar1 + 0x20);
  }
}

void FUN_00d53914(long param_1,uint param_2)
{
  return *(long *)(param_1 + (ulong)param_2 * 8 + 0x50);
}

void FUN_00d535a4(long param_1,uint param_2)
{
  if (*(long *)(param_1 + (ulong)param_2 * 8 + 0x50) != 0) return 1;
}

void FUN_00d4c67c(long *param_1,int param_2)
{
  long lVar1;
  lVar1 = *param_1;
  for (; (lVar1 != 0 && (param_1 = param_1 + 1, param_2 != 0)); param_2 = param_2 + -1) {
    lVar1 = *param_1;
  }
}

float FUN_00d08e88(long param_1,long param_2,int param_3,uint param_4)
{
  long lVar1;
  float fVar2;
  fVar2 = 0.0;
  if ((param_4 & 1) != 0) {
    fVar2 = *(float *)(param_2 + 8) + *(float *)(param_2 + 0xc) + *(float *)(param_2 + 0x10);
  }
  lVar1 = *(long *)(param_1 + 0x40);
  if ((param_4 >> 5 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x20);
  if ((param_4 >> 1 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x18);
  if ((param_4 >> 2 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x18);
  if ((param_4 >> 3 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x14);
  if ((param_4 >> 4 & 1) != 0) fVar2 = fVar2 + *(float *)(param_2 + 0x1c);
  if ((param_4 & 0x40) != 0) fVar2 = *(float *)(param_2 + 0x24);
  return fVar2;
}
`;

const helperCallRows = [
  {
    platform: "ios",
    helperFunction: "FUN_1003dfe60",
    callbackFunction: "FUN_1003cef94",
    callbackSourceFile: "ios.c",
    line: "12575",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    argKey: "0:2:0x19:0",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon|Effect_Lance_A_Weapon",
    lineText: "fVar1 = (float)FUN_1003dfe60(param_2,0,2,0x19,0);",
  },
  {
    platform: "android",
    helperFunction: "FUN_00d59f54",
    callbackFunction: "FUN_00dd3994",
    callbackSourceFile: "android.c",
    line: "441",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    argKey: "0:2:0x19:0",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon|Effect_Lance_A_Weapon",
    lineText: "fVar1 = (float)FUN_00d59f54(param_2,0,2,0x19,0);",
  },
];

function sourceFile(filePath, text) {
  return { filePath, text };
}

function writeHelperTsv(filePath, rows) {
  const columns = [
    "platform",
    "helperFunction",
    "callbackFunction",
    "callbackSourceFile",
    "line",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "argKey",
    "parentRoles",
    "parentTokens",
    "lineText",
  ];
  fs.writeFileSync(
    filePath,
    `${columns.join("\t")}\n${rows.map((row) => columns.map((column) => row[column] || "").join("\t")).join("\n")}\n`,
  );
}

test("helper semantics scanner links lookup, materializer, and callback usage", () => {
  const rows = extractNativeAttachmentHelperSemanticsFromSources({
    sourceFiles: [
      sourceFile("external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/ios.c", iosSource),
      sourceFile(
        "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/android.c",
        androidSource,
      ),
    ],
    helperCallRows,
  });

  const semanticRows = rows.filter((row) => row.stage !== "attachment-helper-call-usage");
  assert.equal(semanticRows.length, 4);
  assert.equal(semanticRows.every((row) => row.complete === "yes"), true);

  const androidLookup = rows.find((row) => row.platform === "android" && row.stage === "lookup-chain");
  assert.equal(androidLookup.realFunction, "FUN_00d090c4");
  assert.match(androidLookup.evidenceTags, /public-helper-trampoline/);
  assert.match(androidLookup.evidenceTags, /component-token-DAT_02e3ef78/);

  const iosMaterializer = rows.find((row) => row.platform === "ios" && row.stage === "value-materializer");
  assert.match(iosMaterializer.evidenceTags, /kind-mask-param_4/);
  assert.match(iosMaterializer.evidenceTags, /clamp-field-0x24/);

  const usage = rows.find((row) => row.platform === "ios" && row.stage === "attachment-helper-call-usage");
  assert.equal(usage.argKey, "0:2:0x19:0");
  assert.equal(usage.callCount, 1);
  assert.match(usage.parentTokens, /Bone_Weapon:1/);
});

test("helper semantics exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-helper-semantics-"));
  const iosDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const androidDir = path.join(tempDir, "GameKindred_android_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, "ios.c"), iosSource);
  fs.writeFileSync(path.join(androidDir, "android.c"), androidSource);
  const helperCallPath = path.join(reportDir, "helper_calls.tsv");
  writeHelperTsv(helperCallPath, helperCallRows);

  const summary = exportNativeAttachmentHelperSemantics({
    sourcePaths: [iosDir, androidDir],
    helperCallPath,
    tsvOut: path.join(reportDir, "native_attachment_helper_semantics_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_helper_semantics_chain_summary.json"),
  });

  assert.equal(summary.completeRows, 6);
  assert.equal(summary.byStage["lookup-chain"], 2);
  assert.equal(summary.byArgKey["0:2:0x19:0"], 2);

  const tsv = fs.readFileSync(path.join(reportDir, "native_attachment_helper_semantics_chain.tsv"), "utf8");
  assert.match(tsv, /FUN_00d090c4/);
  assert.match(tsv, /attachment-helper-call-usage/);

  const json = JSON.parse(fs.readFileSync(path.join(reportDir, "native_attachment_helper_semantics_chain_summary.json"), "utf8"));
  assert.equal(json.summary.usageRows, 2);
});
