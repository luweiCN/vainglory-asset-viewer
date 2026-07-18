const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentAnimationRuntimeChain,
  extractNativeAttachmentAnimationRuntimeChainFromSource,
} = require("../tools/native_attachment_animation_runtime_chain");

const syntheticSource = `
void FUN_1000296e0(long param_1)
{
  long lVar1;
  DAT_10184dc68 = *(uint *)(param_1 + 0x13fb0);
  lVar1 = param_1 + (ulong)DAT_10184dc68 * 0x2e8;
  *(code **)(lVar1 + 0xb0) = thunk_FUN_100029528;
  *(code **)(lVar1 + 0xb8) = FUN_10002ab24;
  *(undefined4 *)(lVar1 + 0xa8) = 0x1d18;
  FUN_1010a0944(param_1,4,FUN_10002974c,0);
}

void FUN_10002974c(long param_1)
{
  long *plVar9;
  long lVar10;
  int iVar3;
  float fVar13;

  iVar3 = FUN_1010a879c(param_1 + 0x28);
  FUN_1010a7ed8(param_1 + 0x28);
  FUN_1010a87a4(param_1 + 0x28,param_1 + 0x1c18,param_1 + 0x1d08,5);
  *(float *)(*(long *)(param_1 + 0x1bf0) + 0x10) = fVar13;
  *(float *)(*(long *)(param_1 + 0x1bf8) + 0x10) = fVar13;
  *(float *)(param_1 + 0x1c00) = fVar13;
  *(float *)(param_1 + 0x1c04) = fVar13;
  *(int *)(param_1 + 0x1c08) = iVar3;
  *(undefined8 *)(param_1 + 0x1c10) = 0;
  lVar10 = (long)*(char *)(param_1 + 0x1d14);
  plVar9 = *(long **)(param_1 + 0x1bf0);
  if ((*(ushort *)(param_1 + 0x1d12) & 0x1f) != 0) {
    FUN_100029b4c(1.0,param_1,plVar9,1,1,0,0);
  }
  if (*(char *)(param_1 + 0x1a20) != '\\0') {
    FUN_10002aa78(0,param_1 + 0x98);
    FUN_100029ab4(0x3f800000,param_1,0,1,0,param_1 + 0x1af0 + lVar10 * 0x10 + 0xc);
  }
}

void FUN_10002a364(long param_1,int *param_2,int *param_3)
{
  long lVar7;
  int iVar1;
  int iVar2;
  undefined4 uVar5;

  iVar1 = *param_2;
  iVar2 = *param_3;
  lVar7 = 0;
  if (*(char *)(param_1 + 0x1a20 + lVar7) == '\\0') {
    *(int *)(param_1 + lVar7 + 0x1a18) = iVar1;
    *(int *)(param_1 + lVar7 + 0x1a1c) = iVar2;
    *(undefined1 *)(param_1 + lVar7 + 0x1a20) = 1;
    if (*(long *)(param_1 + 0x1bf0) != 0 && *(int *)(param_1 + 0x1c08) == iVar1) {
      uVar5 = *(undefined4 *)(param_1 + (long)*(char *)(param_1 + 0x1d14) * 0x10 + 0x1af0);
      FUN_10002a4f4(param_1,param_2);
      FUN_10002a068(*(undefined4 *)(*(long *)(param_1 + 0x1bf0) + 0x18),param_1,iVar2,
                    *(undefined4 *)(*(long *)(param_1 + 0x1bf0) + 0x14),0,uVar5);
    }
  }
}
`;

const stageSpecs = [
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "register-animation-component",
    functionName: "FUN_1000296e0",
    expectedCalls: ["FUN_1010a0944", "FUN_10002974c", "thunk_FUN_100029528", "FUN_10002ab24"],
    evidencePatterns: [
      ["animation-component-token", /DAT_10184dc68/],
      ["component-size-0x1d18", /0x1d18/],
      ["update-hook-phase-4", /FUN_1010a0944\(param_1,4,FUN_10002974c,0\)/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "animation-update-loop",
    functionName: "FUN_10002974c",
    expectedCalls: ["FUN_1010a879c", "FUN_1010a7ed8", "FUN_1010a87a4", "FUN_100029b4c", "FUN_10002aa78", "FUN_100029ab4"],
    evidencePatterns: [
      ["active-track-field-0x1bf0", /0x1bf0/],
      ["blend-track-field-0x1bf8", /0x1bf8/],
      ["blend-time-fields-0x1c00-0x1c04", /0x1c00[\s\S]*0x1c04|0x1c04[\s\S]*0x1c00/],
      ["current-animation-id-field-0x1c08", /0x1c08/],
      ["pending-child-track-field-0x1c10", /0x1c10/],
      ["extra-transform-fields-0x1c18-0x1d08", /0x1c18[\s\S]*0x1d08|0x1d08[\s\S]*0x1c18/],
      ["mode-bitfield-0x1d12", /0x1d12/],
      ["delayed-switch-index-0x1d14", /0x1d14/],
      ["delayed-switch-table-0x1af0", /0x1af0/],
      ["alias-table-0x1a20", /0x1a20/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "register-alias-switch",
    functionName: "FUN_10002a364",
    expectedCalls: ["FUN_10002a4f4", "FUN_10002a068"],
    evidencePatterns: [
      ["alias-source-id-field-0x1a18", /0x1a18/],
      ["alias-target-id-field-0x1a1c", /0x1a1c/],
      ["alias-enabled-field-0x1a20", /0x1a20/],
      ["alias-table-size-0xd8", /0xd8|0x1a20/],
      ["active-track-field-0x1bf0", /0x1bf0/],
      ["current-animation-id-field-0x1c08", /0x1c08/],
      ["delayed-switch-table-0x1af0", /0x1af0/],
    ],
  },
];

test("animation runtime extractor records registration, update, and alias switch evidence", () => {
  const rows = extractNativeAttachmentAnimationRuntimeChainFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    stageSpecs,
  });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].complete, "yes");
  assert.match(rows[1].evidenceTags, /delayed-switch-table-0x1af0/);
  assert.equal(rows[1].complete, "yes");
  assert.match(rows[2].evidenceTags, /alias-source-id-field-0x1a18/);
});

test("animation runtime exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-animation-runtime-chain-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeAttachmentAnimationRuntimeChain({
    sourcePaths: [sourceDir],
    stageSpecs,
    tsvOut: path.join(reportDir, "native_attachment_animation_runtime_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_animation_runtime_chain_summary.json"),
  });

  assert.equal(summary.rows, 3);
  assert.equal(summary.completeRows, 3);
  assert.match(
    fs.readFileSync(path.join(reportDir, "native_attachment_animation_runtime_chain.tsv"), "utf8"),
    /animation-update-loop/,
  );
});
