const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeEffectHookBlock,
  buildNativeEffectHookBuilderRows,
  exportNativeEffectHookBuilderChain,
  extractEffectHookBindingInstances,
  operationRows,
} = require("../tools/native_effect_hook_builder_chain");

const sourceFile = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c";
const sourceText = `
void FUN_1000a000(long param_1)
{
  long *plVar2;
  plVar2 = (long *)FUN_100441e68(param_1 + 0x10);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_Weapon_Head");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Shin_Weapon_Head");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,1);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x88))(plVar2,1);
  (**(code **)(*plVar2 + 0xb0))(plVar2,0);
}

void FUN_1000b000(long param_1)
{
  long *plVar2;
  code *local_50;
  plVar2 = (long *)FUN_100441e68(param_1 + 0x10);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x98))(plVar2,1);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x60))();
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Silvernail_Tripwire_AttachAvail_Ring");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,1);
  local_50 = FUN_100455088;
  plVar2 = (long *)(**(code **)(*plVar2 + 0xd0))(plVar2,&local_50);
  (**(code **)(*plVar2 + 0xb0))(plVar2,1);
}
`;

const candidateRows = [
  {
    platform: "ios",
    role: "weapon-effect-hook",
    token: "Effect_Shin_Weapon_Head",
    sourceFile,
    functionName: "FUN_1000a000",
    line: "6",
    semanticCalls: "android-bone-query",
  },
  {
    platform: "ios",
    role: "weapon-effect-hook",
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    sourceFile,
    functionName: "FUN_1000b000",
    line: "18",
    semanticCalls: "add-or-apply-buff|android-bone-query",
  },
  {
    platform: "ios",
    role: "attached-state-buff",
    token: "Buff_Hero057_B_Attached",
    sourceFile,
    functionName: "FUN_1000b000",
    line: "18",
  },
];

const aliasRows = [
  {
    token: "Effect_Shin_Weapon_Head",
    aliasStatus: "resource-candidate",
    evidenceStrength: "weak",
    resourcePaths: "Effects/Hero070/DefaultSkin/Hero070_Weaponfx/Hero070_Weaponfx.pfx",
  },
  {
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    aliasStatus: "resource-candidate",
    evidenceStrength: "weak",
    resourcePaths: "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("operationRows extracts builder, bone, effect, option, callback, and visibility operations", () => {
  const rows = operationRows(sourceText);
  assert.equal(rows.some((row) => row.role === "builder:ios-effect-hook-builder"), true);
  assert.equal(rows.some((row) => row.role === "select-bone" && row.tokens.includes("Bone_Weapon_Head")), true);
  assert.equal(rows.some((row) => row.role === "bind-effect" && row.tokens.includes("Effect_Shin_Weapon_Head")), true);
  assert.equal(rows.some((row) => row.role === "select-effect-channel"), true);
  assert.equal(rows.some((row) => row.role === "bind-effect-callback"), true);
  assert.equal(rows.some((row) => row.role === "set-visible-or-active"), true);
});

test("analyzeEffectHookBlock classifies bone-bound and selected-attachment effect patterns", () => {
  const firstFunction = sourceText.match(/void FUN_1000a000[\s\S]*?\n}/)[0];
  const first = analyzeEffectHookBlock(firstFunction);
  assert.equal(first.hookPattern, "bone-bound-effect");
  assert.deepEqual(first.boneTokens, ["Bone_Weapon_Head"]);
  assert.deepEqual(first.effectTokens, ["Effect_Shin_Weapon_Head"]);
  assert.match(first.operationSequence, /select-bone:Bone_Weapon_Head -> bind-effect:Effect_Shin_Weapon_Head/);

  const secondFunction = sourceText.match(/void FUN_1000b000[\s\S]*?\n}/)[0];
  const second = analyzeEffectHookBlock(secondFunction);
  assert.equal(second.hookPattern, "selected-attachment-effect");
  assert.deepEqual(second.effectTokens, ["Effect_Silvernail_Tripwire_AttachAvail_Ring"]);
  assert.match(second.operationSequence, /select-effect-channel:1 -> resolve-selected-hook:0x60/);
});

test("buildNativeEffectHookBuilderRows joins native candidates to alias resource evidence", () => {
  const rows = buildNativeEffectHookBuilderRows(candidateRows, aliasRows, () => sourceText);
  assert.equal(rows.length, 2);

  const shin = rows.find((row) => row.token === "Effect_Shin_Weapon_Head");
  assert.equal(shin.hookPattern, "bone-bound-effect");
  assert.equal(shin.aliasStatus, "resource-candidate");
  assert.equal(shin.aliasEvidenceStrength, "weak");
  assert.equal(shin.builderProviders, "ios-effect-hook-builder");

  const silvernail = rows.find((row) => row.token === "Effect_Silvernail_Tripwire_AttachAvail_Ring");
  assert.equal(silvernail.hookPattern, "selected-attachment-effect");
  assert.equal(silvernail.resourcePaths, "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx");
});

test("extractEffectHookBindingInstances splits operation sequences into concrete hook bindings", () => {
  const rows = buildNativeEffectHookBuilderRows(candidateRows, aliasRows, () => sourceText);
  const instances = extractEffectHookBindingInstances(rows);

  assert.deepEqual(
    instances.map((row) => ({
      token: row.token,
      bindKind: row.bindKind,
      boneToken: row.boneToken,
      effectToken: row.effectToken,
      selectedAttachmentSlot: row.selectedAttachmentSlot,
      hasCallback: row.hasCallback,
      setsVisibleOrActive: row.setsVisibleOrActive,
      setsEffectOption: row.setsEffectOption,
    })),
    [
      {
        token: "Effect_Shin_Weapon_Head",
        bindKind: "bone-bound-effect",
        boneToken: "Bone_Weapon_Head",
        effectToken: "Effect_Shin_Weapon_Head",
        selectedAttachmentSlot: "",
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: "yes",
      },
      {
        token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
        bindKind: "selected-attachment-effect",
        boneToken: "",
        effectToken: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
        selectedAttachmentSlot: "1",
        hasCallback: "yes",
        setsVisibleOrActive: "yes",
        setsEffectOption: "no",
      },
    ],
  );
});

test("extractEffectHookBindingInstances keeps selected hook token references with callbacks", () => {
  const instances = extractEffectHookBindingInstances([
    {
      platform: "ios",
      token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
      sourceFile,
      functionName: "FUN_SELECTED_TOKEN",
      line: "10",
      hookPattern: "selected-attachment-effect",
      aliasStatus: "resource-candidate",
      aliasEvidenceStrength: "weak",
      resourcePaths: "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx",
      buffTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable",
      operationSequence:
        "builder:ios-effect-hook-builder -> select-effect-channel:1 -> resolve-selected-hook:0x60 -> token-reference:Effect_Silvernail_Tripwire_AttachAvail_Ring -> vcall:0x78 -> bind-effect-callback:0xd0 -> set-visible-or-active:0xb0",
      nativeSemanticCalls: "android-bone-query",
    },
  ]);

  assert.deepEqual(instances, [
    {
      platform: "ios",
      token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
      sourceFile,
      functionName: "FUN_SELECTED_TOKEN",
      line: "10",
      instanceIndex: 0,
      bindKind: "selected-attachment-effect",
      boneToken: "",
      effectToken: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
      selectedAttachmentSlot: "1",
      hookPattern: "selected-attachment-effect",
      aliasStatus: "resource-candidate",
      aliasEvidenceStrength: "weak",
      resourcePaths: "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx",
      buffTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable",
      hasCallback: "yes",
      setsVisibleOrActive: "yes",
      setsEffectOption: "no",
      nativeSemanticCalls: "android-bone-query",
    },
  ]);
});

test("extractEffectHookBindingInstances keeps native token-pair bone and effect writes", () => {
  const instances = extractEffectHookBindingInstances([
    {
      platform: "android",
      token: "Effect_Baron_Weapon_Idle",
      sourceFile,
      functionName: "FUN_TOKEN_PAIRS",
      line: "20",
      hookPattern: "effect-only",
      aliasStatus: "hero-alias-resource",
      aliasEvidenceStrength: "strong",
      resourcePaths: "Effects/Hero019/Hero019_Weapon/Hero019_Weapon.pfx",
      buffTokens: "Buff_Baron_B_Charging",
      operationSequence:
        "token-reference:Bone_Weapon,Effect_Baron_Weapon_Idle -> token-reference:Bone_LeftAxe -> token-reference:Effect_Rona_Weapon -> token-reference:Bone_RightAxe -> token-reference:Effect_Rona_Weapon2",
      nativeSemanticCalls: "effect-bind",
    },
  ]);

  assert.deepEqual(
    instances.map((row) => ({
      token: row.token,
      instanceIndex: row.instanceIndex,
      bindKind: row.bindKind,
      boneToken: row.boneToken,
      effectToken: row.effectToken,
    })),
    [
      {
        token: "Effect_Baron_Weapon_Idle",
        instanceIndex: 0,
        bindKind: "token-pair-effect",
        boneToken: "Bone_Weapon",
        effectToken: "Effect_Baron_Weapon_Idle",
      },
      {
        token: "Effect_Baron_Weapon_Idle",
        instanceIndex: 1,
        bindKind: "token-pair-effect",
        boneToken: "Bone_LeftAxe",
        effectToken: "Effect_Rona_Weapon",
      },
      {
        token: "Effect_Baron_Weapon_Idle",
        instanceIndex: 2,
        bindKind: "token-pair-effect",
        boneToken: "Bone_RightAxe",
        effectToken: "Effect_Rona_Weapon2",
      },
    ],
  );
});

test("extractEffectHookBindingInstances uses effect-token resource evidence when owner token differs", () => {
  const instances = extractEffectHookBindingInstances([
    {
      platform: "ios",
      token: "Effect_Crisis_Weapon",
      sourceFile,
      functionName: "FUN_SHARED",
      line: "30",
      hookPattern: "effect-only",
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourcePaths: "Effects/Items/Crisis_Weapon.assetbundle/Crisis_Weapon.pfx",
      buffTokens: "",
      operationSequence: "token-reference:Bone_CenterMass -> token-reference:Effect_Crisis_Weapon_Con",
      nativeSemanticCalls: "vcall-add-buff",
    },
    {
      platform: "ios",
      token: "Effect_Crisis_Weapon_Con",
      sourceFile,
      functionName: "FUN_SHARED",
      line: "40",
      hookPattern: "effect-only",
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourcePaths: "Effects/Items/Crisis_Weapon_Con/Crisis_Weapon_Con.pfx",
      buffTokens: "",
      operationSequence: "token-reference:Bone_CenterMass -> token-reference:Effect_Crisis_Weapon_Con",
      nativeSemanticCalls: "vcall-add-buff",
    },
  ]);

  assert.equal(instances[0].effectToken, "Effect_Crisis_Weapon_Con");
  assert.equal(instances[0].resourcePaths, "Effects/Items/Crisis_Weapon_Con/Crisis_Weapon_Con.pfx");
});

test("extractEffectHookBindingInstances keeps effect-only native candidate token references", () => {
  const instances = extractEffectHookBindingInstances([
    {
      platform: "android",
      token: "Effect_Inara_AA_Crit_Weapon",
      sourceFile,
      functionName: "FUN_INARA_CRIT",
      line: "661",
      hookPattern: "effect-only",
      aliasStatus: "hero-alias-resource",
      aliasEvidenceStrength: "strong",
      resourcePaths: "Effects/Hero060/Hero060_AA_Crit_Weapon/Hero060_AA_Crit_Weapon.pfx",
      buffTokens: "",
      operationSequence:
        "token-reference:CritAttack -> token-reference:Effect_Inara_AA_Crit,Effect_Inara_AA_Crit_Weapon -> token-reference:Effect_Inara_AA_Crit_Weapon",
      nativeSemanticCalls: "",
    },
  ]);

  assert.deepEqual(
    instances.map((row) => ({
      token: row.token,
      bindKind: row.bindKind,
      boneToken: row.boneToken,
      effectToken: row.effectToken,
      resourcePaths: row.resourcePaths,
    })),
    [
      {
        token: "Effect_Inara_AA_Crit_Weapon",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_Inara_AA_Crit_Weapon",
        resourcePaths: "Effects/Hero060/Hero060_AA_Crit_Weapon/Hero060_AA_Crit_Weapon.pfx",
      },
    ],
  );
});

test("native effect hook builder exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-effect-hook-builder-"));
  const candidatesPath = path.join(tempDir, "candidates.tsv");
  const aliasBridgePath = path.join(tempDir, "alias.tsv");
  const eventBridgePath = path.join(tempDir, "event_bridge.tsv");
  const sourcePath = path.join(tempDir, "functions", "test.c");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, sourceText);
  writeRows(
    candidatesPath,
    ["platform", "role", "token", "sourceFile", "functionName", "line", "semanticCalls"],
    candidateRows.map((row) => ({ ...row, sourceFile: sourcePath })),
  );
  writeRows(aliasBridgePath, ["token", "aliasStatus", "evidenceStrength", "resourcePaths"], aliasRows);
  writeRows(eventBridgePath, ["token", "bridgeStatus"], []);

  const summary = exportNativeEffectHookBuilderChain({
    candidatesPath,
    aliasBridgePath,
    eventBridgePath,
    tsvOut: path.join(tempDir, "native_effect_hook_builder_chain.tsv"),
    jsonOut: path.join(tempDir, "native_effect_hook_builder_chain_summary.json"),
    bindingTsvOut: path.join(tempDir, "native_effect_hook_binding_instances.tsv"),
    bindingJsonOut: path.join(tempDir, "native_effect_hook_binding_instances_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.byHookPattern["bone-bound-effect"], 1);
  assert.equal(summary.byHookPattern["selected-attachment-effect"], 1);
  assert.equal(summary.byAliasStatus["resource-candidate"], 2);
  assert.match(fs.readFileSync(path.join(tempDir, "native_effect_hook_builder_chain.tsv"), "utf8"), /Bone_Weapon_Head/);
  assert.match(
    fs.readFileSync(path.join(tempDir, "native_effect_hook_binding_instances.tsv"), "utf8"),
    /Effect_Silvernail_Tripwire_AttachAvail_Ring/,
  );
});
