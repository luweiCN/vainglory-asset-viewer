const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeCallbackBlock,
  buildNativeAttachmentCallbackRows,
  callbackFunctionsFromStateRows,
  callbackParentContexts,
  exportNativeAttachmentCallbackChain,
  findCallbackBlocks,
} = require("../tools/native_attachment_callback_chain");

const stateRows = [
  {
    platform: "ios",
    functionName: "FUN_parent",
    operationRole: "callback-register-vcall",
    callbackFunction: "FUN_100abc100",
    valueExpr: "",
    candidateTokens: "Effect_Shin_Weapon_Head|Bone_Weapon_Head",
    candidateRoles: "weapon-effect-hook|weapon-bone-hook",
    bridgeStatuses: "resource-candidate:weak|native-and-definition",
    vcallOffset: "0x18",
  },
  {
    platform: "ios",
    functionName: "FUN_parent",
    operationRole: "function-pointer-field-write",
    callbackFunction: "",
    valueExpr: "FUN_100abc200",
    candidateTokens: "Buff_Hero057_B_Attached",
    candidateRoles: "attached-state-buff",
    bridgeStatuses: "native-and-definition",
    vcallOffset: "",
  },
];

const callbackSource = `
void FUN_100abc100(undefined8 param_1)
{
  long lVar1;
  lVar1 = FUN_10042e2c8(param_1);
  *(undefined4 *)(lVar1 + 0x40) = 0x3f800000;
  FUN_100435a7c(param_1,0x23,"Effect_Shin_Weapon_Head",0);
}

void FUN_100abc200(long param_1)
{
  *(code **)(param_1 + 0x10) = FUN_100abc300;
  (**(code **)(*param_1 + 0x30))(param_1,FUN_100abc400);
}
`;

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("callbackFunctionsFromStateRows extracts registered and function-pointer callbacks", () => {
  assert.deepEqual(callbackFunctionsFromStateRows(stateRows), ["FUN_100abc100", "FUN_100abc200"]);
});

test("callbackParentContexts preserves parent tokens, roles, and bridge status", () => {
  const contexts = callbackParentContexts(stateRows);
  const context = contexts.get("FUN_100abc100");
  assert.equal(context.parentFunctions.join("|"), "ios:FUN_parent");
  assert.deepEqual(context.parentTokens.sort(), ["Bone_Weapon_Head", "Effect_Shin_Weapon_Head"]);
  assert.deepEqual(context.parentBridgeStatuses.sort(), ["native-and-definition", "resource-candidate:weak"]);
});

test("findCallbackBlocks locates callback functions across source directories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-callback-find-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "callbacks.c"), callbackSource);
  const blocks = findCallbackBlocks(["FUN_100abc100", "FUN_missing"], [sourceDir]);
  assert.equal(blocks.has("FUN_100abc100"), true);
  assert.equal(blocks.has("FUN_missing"), false);
});

test("analyzeCallbackBlock extracts callback writes, tokens, vcalls, and helper calls", () => {
  const block = {
    functionName: "FUN_100abc100",
    startLine: 2,
    text: callbackSource.match(/void FUN_100abc100[\s\S]*?\n}/)[0],
  };
  const analysis = analyzeCallbackBlock(block);
  assert.deepEqual(analysis.callbackFieldOffsets, ["0x40"]);
  assert.deepEqual(analysis.callbackTokens, ["Effect_Shin_Weapon_Head"]);
  assert.deepEqual(analysis.callbackOperationRoles, ["state-config-field-write"]);
  assert.equal(analysis.helperCalls.includes("FUN_100435a7c"), true);
});

test("buildNativeAttachmentCallbackRows joins parent state rows to callback body evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-callback-rows-"));
  const sourceDir = path.join(tempDir, "functions");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "callbacks.c"), callbackSource);
  const rows = buildNativeAttachmentCallbackRows(stateRows, [sourceDir]);
  assert.equal(rows.length, 2);

  const first = rows.find((row) => row.callbackFunction === "FUN_100abc100");
  assert.equal(first.callbackFound, "yes");
  assert.equal(first.parentTokens, "Bone_Weapon_Head|Effect_Shin_Weapon_Head");
  assert.equal(first.callbackTokens, "Effect_Shin_Weapon_Head");
  assert.equal(first.writeCount, 1);

  const second = rows.find((row) => row.callbackFunction === "FUN_100abc200");
  assert.equal(second.callbackOperationRoles, "direct-callback-register-vcall|function-pointer-field-write");
});

test("native attachment callback exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-callback-export-"));
  const sourceDir = path.join(tempDir, "functions");
  const statePath = path.join(tempDir, "state.tsv");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "callbacks.c"), callbackSource);
  writeRows(
    statePath,
    [
      "platform",
      "functionName",
      "operationRole",
      "callbackFunction",
      "valueExpr",
      "candidateTokens",
      "candidateRoles",
      "bridgeStatuses",
      "vcallOffset",
    ],
    stateRows,
  );

  const summary = exportNativeAttachmentCallbackChain({
    stateWritePath: statePath,
    sourcePaths: [sourceDir],
    tsvOut: path.join(tempDir, "native_attachment_callback_chain.tsv"),
    jsonOut: path.join(tempDir, "native_attachment_callback_chain_summary.json"),
  });

  assert.equal(summary.callbacks, 2);
  assert.equal(summary.byFound.yes, 2);
  assert.equal(summary.callbacksWithWrites, 2);
  assert.match(fs.readFileSync(path.join(tempDir, "native_attachment_callback_chain.tsv"), "utf8"), /FUN_100abc100/);
});
