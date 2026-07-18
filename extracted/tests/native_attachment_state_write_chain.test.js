const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildFunctionContexts,
  buildNativeAttachmentStateWriteRows,
  callbackLocals,
  directWrite,
  exportNativeAttachmentStateWriteChain,
  operationRows,
} = require("../tools/native_attachment_state_write_chain");

const sourceFile = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c";
const sourceText = `
void FUN_1000a000(long param_1)
{
  long lVar1;
  long lVar2;
  long *plVar2;
  code *local_50;
  lVar1 = FUN_10042e694(param_1);
  *(uint *)(lVar1 + 0x28) = 0x12345678;
  *(ushort *)(lVar1 + 0x48) = *(ushort *)(lVar1 + 0x48) | 0x10;
  *(byte *)(lVar1 + 0x60) = *(byte *)(lVar1 + 0x60) & 0xfc | 1;
  *(undefined4 *)(lVar1 + 0x40) = 0x6170e7e5;
  local_50 = FUN_100455088;
  (**(code **)(*plVar2 + 0x30))(plVar2,&local_50);
  lVar2 = FUN_10049c198(lVar1 + 0x10);
  *(code **)(lVar2 + 8) = FUN_100455040;
  *(undefined **)(lVar2 + 0x10) = PTR_s_Buff_Silvernail_A_Tower_AttachPointAvailable_10185b450;
  (**(code **)(*plVar2 + 0xa0))(plVar2,FUN_100455178);
}
`;

const reusedLocalSourceText = `
void FUN_1000b000(long param_1)
{
  long *plVar2;
  code *local_38;
  local_38 = FUN_100111111;
  (**(code **)(*plVar2 + 0x18))(plVar2,&local_38);
  local_38 = FUN_100222222;
  (**(code **)(*plVar2 + 0x18))(plVar2,&local_38);
}
`;

const localDataSourceText = `
void FUN_1000c000(long param_1)
{
  long *plVar2;
  undefined4 local_98 [2];
  local_98[0] = 0x3e4ccccd;
  (**(code **)(*plVar2 + 0x60))(plVar2,&local_98);
}
`;

const candidateRows = [
  {
    platform: "ios",
    sourceFile,
    functionName: "FUN_1000a000",
    role: "weapon-effect-hook",
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    semanticCalls: "add-or-apply-buff|android-bone-query",
  },
  {
    platform: "ios",
    sourceFile,
    functionName: "FUN_1000a000",
    role: "attach-point-availability-buff",
    token: "Buff_Silvernail_A_Tower_AttachPointAvailable",
    semanticCalls: "add-or-apply-buff",
  },
];

const eventBridgeRows = [
  {
    token: "Buff_Silvernail_A_Tower_AttachPointAvailable",
    bridgeStatus: "native-and-definition",
  },
];

const effectAliasRows = [
  {
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    aliasStatus: "resource-candidate",
    evidenceStrength: "weak",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("directWrite extracts decompiled pointer-offset assignments", () => {
  assert.deepEqual(directWrite("  *(byte *)(lVar1 + 0x60) = *(byte *)(lVar1 + 0x60) & 0xfc | 1;"), {
    valueType: "byte *",
    baseExpr: "lVar1",
    fieldOffset: "0x60",
    valueExpr: "*(byte *)(lVar1 + 0x60) & 0xfc | 1",
  });

  assert.deepEqual(directWrite("  *(code **)(lVar2 + 8) = FUN_100455040;"), {
    valueType: "code **",
    baseExpr: "lVar2",
    fieldOffset: "0x8",
    valueExpr: "FUN_100455040",
  });
});

test("callbackLocals maps local callback storage to native functions", () => {
  const locals = callbackLocals(sourceText);
  assert.equal(locals.get("local_50"), "FUN_100455088");
});

test("operationRows classifies field writes and callback registrations", () => {
  const block = {
    startLine: 2,
    text: sourceText.match(/void FUN_1000a000[\s\S]*?\n}/)[0],
  };
  const rows = operationRows(block, { platform: "ios", functionName: "FUN_1000a000" });

  assert.equal(rows.some((row) => row.operationRole === "hash-or-id-field-write" && row.fieldOffset === "0x28"), true);
  assert.equal(rows.some((row) => row.operationRole === "flag-field-write" && row.fieldOffset === "0x48"), true);
  assert.equal(rows.some((row) => row.operationRole === "state-config-field-write" && row.fieldOffset === "0x40"), true);
  assert.equal(rows.some((row) => row.operationRole === "callback-local-init" && row.callbackFunction === "FUN_100455088"), true);
  assert.equal(rows.some((row) => row.operationRole === "callback-register-vcall" && row.vcallOffset === "0x30"), true);
  assert.equal(rows.some((row) => row.operationRole === "function-pointer-field-write" && row.fieldOffset === "0x8"), true);
  assert.equal(
    rows.some(
      (row) =>
        row.operationRole === "string-field-write" &&
        row.tokensInLine === "Buff_Silvernail_A_Tower_AttachPointAvailable",
    ),
    true,
  );
  assert.equal(
    rows.some((row) => row.operationRole === "direct-callback-register-vcall" && row.callbackFunction === "FUN_100455178"),
    true,
  );
});

test("operationRows maps reused callback locals to the nearest preceding assignment", () => {
  const block = {
    startLine: 2,
    text: reusedLocalSourceText.match(/void FUN_1000b000[\s\S]*?\n}/)[0],
  };
  const rows = operationRows(block);
  const registrations = rows.filter((row) => row.operationRole === "callback-register-vcall");
  assert.deepEqual(
    registrations.map((row) => row.callbackFunction),
    ["FUN_100111111", "FUN_100222222"],
  );
});

test("operationRows separates local data registrations from callback registrations", () => {
  const block = {
    startLine: 2,
    text: localDataSourceText.match(/void FUN_1000c000[\s\S]*?\n}/)[0],
  };
  const rows = operationRows(block);
  assert.equal(rows.some((row) => row.operationRole === "local-data-register-vcall" && row.vcallOffset === "0x60"), true);
  assert.equal(rows.some((row) => row.operationRole === "callback-register-vcall"), false);
});

test("buildFunctionContexts joins candidate tokens to bridge status evidence", () => {
  const contexts = buildFunctionContexts(candidateRows, eventBridgeRows, effectAliasRows);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].candidateRoles, "attach-point-availability-buff|weapon-effect-hook");
  assert.equal(
    contexts[0].bridgeStatuses,
    "native-and-definition|resource-candidate:weak",
  );
});

test("buildFunctionContexts preserves candidate-provided bridge status when no bridge table row exists", () => {
  const contexts = buildFunctionContexts(
    [
      {
        platform: "ios",
        sourceFile,
        functionName: "FUN_1000a000",
        role: "hide-or-invisible-buff",
        token: "Buff_Silvernail_A_Tower_Hide_Mesh",
        bridgeStatus: "native-and-definition",
        semanticCalls: "vcall-add-buff",
      },
    ],
    [],
    [],
  );
  assert.equal(contexts[0].bridgeStatuses, "native-and-definition");
});

test("buildNativeAttachmentStateWriteRows emits function-level write evidence", () => {
  const rows = buildNativeAttachmentStateWriteRows(candidateRows, eventBridgeRows, effectAliasRows, () => sourceText);
  assert.equal(rows.some((row) => row.candidateTokens.includes("Effect_Silvernail_Tripwire_AttachAvail_Ring")), true);
  assert.equal(rows.some((row) => row.bridgeStatuses.includes("resource-candidate:weak")), true);
  assert.equal(rows.some((row) => row.callbackFunction === "FUN_100455088"), true);
});

test("native attachment state write exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-state-"));
  const candidatesPath = path.join(tempDir, "candidates.tsv");
  const eventBridgePath = path.join(tempDir, "event_bridge.tsv");
  const effectAliasPath = path.join(tempDir, "effect_alias.tsv");
  const sourcePath = path.join(tempDir, "functions", "test.c");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, sourceText);

  writeRows(
    candidatesPath,
    ["platform", "sourceFile", "functionName", "role", "token", "semanticCalls"],
    candidateRows.map((row) => ({ ...row, sourceFile: sourcePath })),
  );
  writeRows(eventBridgePath, ["token", "bridgeStatus"], eventBridgeRows);
  writeRows(effectAliasPath, ["token", "aliasStatus", "evidenceStrength"], effectAliasRows);

  const summary = exportNativeAttachmentStateWriteChain({
    candidatesPath,
    eventBridgePath,
    effectAliasBridgePath: effectAliasPath,
    tsvOut: path.join(tempDir, "native_attachment_state_write_chain.tsv"),
    jsonOut: path.join(tempDir, "native_attachment_state_write_chain_summary.json"),
  });

  assert.equal(summary.functions, 1);
  assert.equal(summary.byOperationRole["callback-register-vcall"], 1);
  assert.equal(summary.byOperationRole["function-pointer-field-write"], 1);
  assert.equal(summary.byFieldOffset["0x28"], 1);
  assert.match(fs.readFileSync(path.join(tempDir, "native_attachment_state_write_chain.tsv"), "utf8"), /FUN_100455088/);
});
