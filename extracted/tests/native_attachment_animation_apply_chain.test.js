const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentAnimationApplyChain,
  extractNativeAttachmentAnimationApplyChainFromSource,
} = require("../tools/native_attachment_animation_apply_chain");

const syntheticSource = `
void FUN_10002c4e0(undefined8 param_1,undefined8 param_2,undefined8 param_3)
{
  long lVar1;

  lVar1 = FUN_1010a0298(param_1,DAT_10184dc68);
  if (lVar1 != 0) {
    FUN_100029c74(lVar1,param_2,param_3);
    return;
  }
  return;
}

void FUN_100029c74(long *param_1,undefined8 param_2,undefined8 *param_3)
{
  long lVar1;
  undefined8 *puVar2;
  long *plVar3;
  undefined1 auStack_40 [8];
  undefined1 auStack_38 [8];

  (**(code **)(*param_1 + 0x10))();
  lVar1 = FUN_1010acfb8(param_2);
  param_1[0x37d] = lVar1;
  param_1[5] = lVar1;
  FUN_100029d44(*(undefined4 *)(param_3 + 2),*(undefined4 *)((long)param_3 + 0x14),
                *(undefined4 *)(param_3 + 3),param_1,*param_3,param_3[1],
                *(undefined1 *)((long)param_3 + 0x1c));
  plVar3 = (long *)param_3[4];
  puVar2 = (undefined8 *)*plVar3;
  while (puVar2 != (undefined8 *)0x0) {
    plVar3 = plVar3 + 1;
    FUN_100029df4(*(undefined4 *)(puVar2 + 1),*(undefined4 *)((long)puVar2 + 0xc),
                  *(undefined4 *)(puVar2 + 2),param_1,*param_3,*puVar2,0);
    puVar2 = (undefined8 *)*plVar3;
  }
  FUN_10034cb1c(auStack_40,*param_3);
  FUN_10034cb1c(auStack_38,0);
  FUN_100029f94(0x3f800000,param_1,auStack_40,1,0,auStack_38);
  return;
}
`;

const stageSpecs = [
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "set-attachment-animation-component",
    functionName: "FUN_10002c4e0",
    expectedCalls: ["FUN_1010a0298", "FUN_100029c74"],
    evidencePatterns: [
      ["animation-component-token", /DAT_10184dc68/],
      ["forwards-animation-resource-param2", /FUN_100029c74\([^,]+,\s*param_2/],
      ["forwards-animation-config-param3", /FUN_100029c74\([^;]+param_3/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "animation-apply-helper",
    functionName: "FUN_100029c74",
    expectedCalls: ["FUN_100029d44", "FUN_100029df4", "FUN_10034cb1c", "FUN_100029f94"],
    evidencePatterns: [
      ["reset-current-animation-vcall-0x10", /\+\s*0x10\)\)\(\)/],
      ["resolve-animation-resource-param2", /\((param_2)\)/],
      ["store-active-animation-resource-fields", /param_1\[0x37d\][\s\S]*param_1\[5\]/],
      ["primary-animation-record-from-param3", /param_3\s*\+\s*2[\s\S]*param_3\s*\+\s*3[\s\S]*\*param_3[\s\S]*param_3\[1\]/],
      ["extra-animation-list-param3-4", /param_3\[4\]/],
      ["extra-animation-loop", /while\s*\([^)]*!=\s*\([^)]*\)0x0\)/],
      ["default-track-time-1.0", /0x3f800000/],
      ["default-track-null-animation", /0\)/],
      ["resolve-animation-resource-function", /FUN_1010acfb8\(param_2\)/],
      ["default-track-play-call", /FUN_100029f94\(0x3f800000/],
    ],
  },
];

test("animation apply extractor records forwarded animation fields and helper evidence", () => {
  const rows = extractNativeAttachmentAnimationApplyChainFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    stageSpecs,
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].complete, "yes");
  assert.match(rows[0].evidenceTags, /forwards-animation-config-param3/);
  assert.equal(rows[1].complete, "yes");
  assert.match(rows[1].evidenceTags, /extra-animation-list-param3-4/);
  assert.match(rows[1].evidenceTags, /default-track-play-call/);
});

test("animation apply exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-animation-apply-chain-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeAttachmentAnimationApplyChain({
    sourcePaths: [sourceDir],
    stageSpecs,
    tsvOut: path.join(reportDir, "native_attachment_animation_apply_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_animation_apply_chain_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.completeRows, 2);
  assert.equal(summary.incompleteRows, 0);
  assert.match(
    fs.readFileSync(path.join(reportDir, "native_attachment_animation_apply_chain.tsv"), "utf8"),
    /animation-apply-helper/,
  );
});
