const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeAttachmentNativeChainRows,
  exportRuntimeAttachmentNativeChainManifest,
  summarizeRuntimeAttachmentNativeChainRows,
} = require("../tools/runtime_attachment_native_chain_manifest");

const updateRows = [
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "frame-update-body",
    sourceFile: "functions/009b5.c",
    functionName: "FUN_009b5710",
    line: "100",
    evidenceTags: "target-node-field-0x38|target-transform-write-vcall-0x20",
    complete: "yes",
    contextHash: "aaa",
  },
];

const extraTransformRows = [
  {
    platform: "android",
    stage: "binding-token-registration",
    kind: "multi-bind-extra-transform-object",
    sourceFile: "functions/009c0.c",
    functionName: "FUN_009c0e40",
    line: "643",
    relatedFunctions: "FUN_009df040|FUN_009df57c",
    bindToken: "sword_bnd",
    setterFunction: "FUN_009df57c",
    evidenceTags: "binding-token-setter",
    complete: "yes",
    contextHash: "bbb",
  },
];

const animationApplyRows = [
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "play-attachment-animation-track",
    sourceFile: "functions/009b2.c",
    functionName: "FUN_009b2bec",
    line: "607",
    evidenceTags: "find-animation-slot-by-id|start-or-blend-animation-call",
    complete: "yes",
    contextHash: "ccc",
  },
];

const animationRuntimeRows = [
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "register-extra-transform-slot",
    sourceFile: "functions/009b3.c",
    functionName: "FUN_009b3858",
    line: "120",
    evidenceTags: "extra-transform-table-0x1c18|mode-bitfield-0x1d12",
    complete: "yes",
    contextHash: "ddd",
  },
];

const helperSemanticsRows = [
  {
    platform: "android",
    stage: "lookup-chain",
    helperFunction: "FUN_00d59f54",
    realFunction: "FUN_00d090c4",
    sourceFiles: "functions/00d09.c",
    lineRange: "8-717",
    evidenceTags: "public-helper-trampoline|materializer-call-FUN_00d08e88",
    complete: "yes",
    interpretation: "Android indexed runtime helper.",
    contextHash: "eee",
  },
];

const helperCallRows = [
  {
    platform: "android",
    callbackFunction: "FUN_00db015c",
    callbackSourceFile: "functions/00db0.c",
    line: "72",
    helperFunction: "FUN_00d59f54",
    helperFamily: "indexed-runtime-helper",
    argKey: "2:9:0x19:0",
    parentTokens: "Bone_Weapon|Effect_Baron_Weapon_Idle",
    combinedParentTokens: "Bone_Weapon|Effect_Baron_Weapon_Idle|Ability__Baron__B",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentBridgeStatuses: "native-and-definition",
    callbackTokens: "",
  },
];

const runtimeDataComponentRows = [
  {
    platform: "android",
    stage: "ability-slot-loader",
    componentToken: "DAT_02e3ef78",
    ownerToken: "DAT_02e3f218",
    abilityFactoryToken: "DAT_02e70668",
    functions: "FUN_00d9f01c|FUN_00d9f2b8",
    sourceFiles: "functions/00d9f.c",
    lineRange: "403-547",
    evidenceTags: "definition-pointer-field-0x28|slot-array-base-0x50",
    complete: "yes",
    interpretation: "Loads ability slots into runtime arrays.",
    contextHash: "fff",
  },
];

const attachableRuntimeRows = [
  {
    platform: "android",
    chain: "refresh-path",
    stage: "reapply-attachable-from-stored-resource",
    sourceFile: "functions/00a7d.c",
    functionName: "FUN_00a7d718",
    line: "488",
    evidenceTags: "stored-resource-id-field-0x30|attachment-component-handle-field-0x20",
    complete: "yes",
    contextHash: "ggg",
  },
];

function writeTsv(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => String(row[column] ?? "")).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("buildRuntimeAttachmentNativeChainRows merges native attachment runtime evidence", () => {
  const rows = buildRuntimeAttachmentNativeChainRows({
    updateRows,
    extraTransformRows,
    animationApplyRows,
    animationRuntimeRows,
    helperSemanticsRows,
    helperCallRows,
    runtimeDataComponentRows,
    attachableRuntimeRows,
  });

  assert.equal(rows.length, 8);
  assert.equal(rows.some((row) => row.sourceKind === "attachment-frame-update" && row.stage === "frame-update-body"), true);

  const sword = rows.find((row) => row.bindToken === "sword_bnd");
  assert.equal(sword.sourceKind, "attachment-extra-transform");
  assert.match(sword.resourceKeys, /sword_bnd/);
  assert.match(sword.resourceKeys, /sword/);

  const helper = rows.find((row) => row.sourceKind === "attachment-helper-call");
  assert.equal(helper.callbackFunction, "FUN_00db015c");
  assert.match(helper.resourceKeys, /Baron/);
  assert.match(helper.evidenceTags, /2:9:0x19:0/);
});

test("summarizeRuntimeAttachmentNativeChainRows counts source, stage, bind token, and platform buckets", () => {
  const rows = buildRuntimeAttachmentNativeChainRows({
    updateRows,
    extraTransformRows,
    animationApplyRows,
    animationRuntimeRows,
    helperSemanticsRows,
    helperCallRows,
    runtimeDataComponentRows,
    attachableRuntimeRows,
  });
  const summary = summarizeRuntimeAttachmentNativeChainRows(rows);

  assert.equal(summary.rows, 8);
  assert.equal(summary.completeRows, 8);
  assert.equal(summary.bySourceKind["attachment-extra-transform"], 1);
  assert.equal(summary.bySourceKind["attachment-helper-call"], 1);
  assert.equal(summary.byStage["register-extra-transform-slot"], 1);
  assert.equal(summary.byBindToken.sword_bnd, 1);
  assert.equal(summary.byPlatform.android, 8);
});

test("exportRuntimeAttachmentNativeChainManifest writes report and viewer manifest", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-attachment-native-chain-"));
  const paths = {
    updateChainPath: path.join(tempDir, "update.tsv"),
    extraTransformPath: path.join(tempDir, "extra.tsv"),
    animationApplyPath: path.join(tempDir, "apply.tsv"),
    animationRuntimePath: path.join(tempDir, "runtime.tsv"),
    helperSemanticsPath: path.join(tempDir, "semantics.tsv"),
    helperCallPath: path.join(tempDir, "call.tsv"),
    runtimeDataComponentPath: path.join(tempDir, "data.tsv"),
    attachableRuntimePath: path.join(tempDir, "attachable.tsv"),
    tsvOut: path.join(tempDir, "runtime_attachment_native_chain_manifest.tsv"),
    jsonOut: path.join(tempDir, "runtime_attachment_native_chain_manifest_summary.json"),
    viewerOut: path.join(tempDir, "runtime-attachment-native-chain-manifest.json"),
  };

  writeTsv(paths.updateChainPath, Object.keys(updateRows[0]), updateRows);
  writeTsv(paths.extraTransformPath, Object.keys(extraTransformRows[0]), extraTransformRows);
  writeTsv(paths.animationApplyPath, Object.keys(animationApplyRows[0]), animationApplyRows);
  writeTsv(paths.animationRuntimePath, Object.keys(animationRuntimeRows[0]), animationRuntimeRows);
  writeTsv(paths.helperSemanticsPath, Object.keys(helperSemanticsRows[0]), helperSemanticsRows);
  writeTsv(paths.helperCallPath, Object.keys(helperCallRows[0]), helperCallRows);
  writeTsv(paths.runtimeDataComponentPath, Object.keys(runtimeDataComponentRows[0]), runtimeDataComponentRows);
  writeTsv(paths.attachableRuntimePath, Object.keys(attachableRuntimeRows[0]), attachableRuntimeRows);

  const summary = exportRuntimeAttachmentNativeChainManifest(paths);
  const viewer = JSON.parse(fs.readFileSync(paths.viewerOut, "utf8"));

  assert.equal(summary.rows, 8);
  assert.equal(JSON.parse(fs.readFileSync(paths.jsonOut, "utf8")).summary.bindTokenRows, 1);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /attachment-extra-transform/);
  assert.equal(viewer.summary.byBindToken.sword_bnd, 1);
  assert.equal(viewer.items.length, 8);
});
