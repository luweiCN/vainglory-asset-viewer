const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeAttachmentHelperCallRows,
  exportNativeAttachmentHelperCallChain,
  helperCallsInBlock,
  resultTargetFromLine,
  splitArgs,
} = require("../tools/native_attachment_helper_call_chain");

const callbackRows = [
  {
    callbackFunction: "FUN_00aaa100",
    callbackFound: "yes",
    callbackSourceFile: "callbacks.c",
    parentFunctions: "android:FUN_parent",
    parentTokens: "Bone_Weapon|Effect_Lance_A_Weapon",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentOperationRoles: "direct-callback-register-vcall",
    parentBridgeStatuses: "native-and-definition",
    registrationVcallOffsets: "0x18",
    callbackTokens: "",
    callbackOperationRoles: "",
    callbackFieldOffsets: "",
    callbackVcallOffsets: "",
    helperCalls: "FUN_00d59f54|FUN_00d5048c",
  },
  {
    callbackFunction: "FUN_100bbb200",
    callbackFound: "yes",
    callbackSourceFile: "callbacks.c",
    parentFunctions: "ios:FUN_parent",
    parentTokens: "Buff_Test_Attached",
    parentRoles: "attached-state-buff",
    parentOperationRoles: "callback-register-vcall",
    parentBridgeStatuses: "native-and-definition",
    registrationVcallOffsets: "0x28",
    callbackTokens: "",
    callbackOperationRoles: "",
    callbackFieldOffsets: "",
    callbackVcallOffsets: "",
    helperCalls: "FUN_1003dfe60",
  },
];

const visualBindingRows = [
  {
    platform: "android",
    functionName: "FUN_parent",
    stringSamples: "Bone_Weapon|Effect_Kensei_B_Attack|Sound_Kensei_B_Attack",
  },
];

const sourceText = `
undefined8 FUN_00aaa100(long param_1)
{
  undefined8 uVar1;
  uVar1 = FUN_00d59f54(param_1,2,5,0x19,0);
  FUN_sink(uVar1);
  uVar1 = FUN_00d59f54(FUN_00abc000(param_1,1),local_20 + 1,7,25,(uint)bVar1);
  return uVar1;
}

undefined8 FUN_100bbb200(undefined8 param_1)
{
  return FUN_1003dfe60(param_1,2,7,0x19,0);
}
`;

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("splitArgs preserves nested call commas", () => {
  assert.deepEqual(splitArgs("FUN_00abc000(param_1,1),local_20 + 1,7,25,(uint)bVar1"), [
    "FUN_00abc000(param_1,1)",
    "local_20 + 1",
    "7",
    "25",
    "(uint)bVar1",
  ]);
});

test("helperCallsInBlock extracts indexed helper arguments and arg keys", () => {
  const block = {
    functionName: "FUN_00aaa100",
    startLine: 2,
    text: sourceText.match(/undefined8 FUN_00aaa100[\s\S]*?\n}/)[0],
  };
  const calls = helperCallsInBlock(block);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].helperFunction, "FUN_00d59f54");
  assert.equal(calls[0].subjectExpr, "param_1");
  assert.equal(calls[0].argKey, "2:5:0x19:0");
  assert.equal(calls[0].resultTarget, "uVar1");
  assert.match(calls[0].resultUseLines, /FUN_sink\(uVar1\)/);
  assert.equal(calls[1].subjectExpr, "FUN_00abc000(param_1,1)");
  assert.equal(calls[1].argKey, "local_20 + 1:7:25:(uint)bVar1");
});

test("resultTargetFromLine detects casted assignments", () => {
  assert.equal(resultTargetFromLine("  fVar4 = (float)FUN_00d59f54(param_1,2,9,0x19,0);", "FUN_00d59f54"), "fVar4");
});

test("buildNativeAttachmentHelperCallRows joins callbacks to source helper calls", () => {
  const rows = buildNativeAttachmentHelperCallRows(callbackRows, ["FUN_00d59f54", "FUN_1003dfe60"], () => sourceText, visualBindingRows);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].platform, "android");
  assert.equal(rows[0].parentTokens, "Bone_Weapon|Effect_Lance_A_Weapon");
  assert.equal(rows[0].visualParentTokens, "Bone_Weapon|Effect_Kensei_B_Attack|Sound_Kensei_B_Attack");
  assert.equal(rows[0].combinedParentTokens, "Bone_Weapon|Effect_Lance_A_Weapon|Effect_Kensei_B_Attack|Sound_Kensei_B_Attack");
  assert.equal(rows[0].helperFamily, "indexed-runtime-helper");
  assert.equal(rows[2].platform, "ios");
  assert.equal(rows[2].argKey, "2:7:0x19:0");
});

test("native attachment helper call exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-helper-call-"));
  const callbackPath = path.join(tempDir, "callbacks.tsv");
  const sourcePath = path.join(tempDir, "callbacks.c");
  fs.writeFileSync(sourcePath, sourceText);
  writeRows(
    callbackPath,
    [
      "callbackFunction",
      "callbackFound",
      "callbackSourceFile",
      "parentFunctions",
      "parentTokens",
      "parentRoles",
      "parentOperationRoles",
      "parentBridgeStatuses",
      "registrationVcallOffsets",
      "callbackTokens",
      "callbackOperationRoles",
      "callbackFieldOffsets",
      "callbackVcallOffsets",
      "helperCalls",
    ],
    callbackRows.map((row) => ({ ...row, callbackSourceFile: sourcePath })),
  );

  const summary = exportNativeAttachmentHelperCallChain({
    callbackPath,
    tsvOut: path.join(tempDir, "native_attachment_helper_call_chain.tsv"),
    jsonOut: path.join(tempDir, "native_attachment_helper_call_chain_summary.json"),
  });

  assert.equal(summary.rows, 3);
  assert.equal(summary.callbacksWithHelperRows, 2);
  assert.equal(summary.byArgKey["2:5:0x19:0"], 1);
  assert.match(fs.readFileSync(path.join(tempDir, "native_attachment_helper_call_chain.tsv"), "utf8"), /indexed-runtime-helper/);
});
