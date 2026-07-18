const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildEffectHookRuntimeManifest,
  buildEffectResourceResolver,
  contextsForBinding,
  exportEffectHookRuntimeManifest,
  readShadergraphCandidateRows,
  reportRowsForManifest,
  visualBindingEffectRows,
} = require("../tools/effect_hook_runtime_manifest");

const bindingRows = [
  {
    platform: "ios",
    token: "Effect_LanceBall_Lance_A_Weapon",
    bindKind: "bone-bound-effect",
    boneToken: "Bone_Weapon",
    effectToken: "Effect_LanceBall_Lance_A_Weapon",
    hasCallback: "no",
    setsVisibleOrActive: "no",
    setsEffectOption: "no",
    sourceFile: "functions/10039.c",
    functionName: "FUN_10039267c",
    line: "1257",
    instanceIndex: "1",
    hookPattern: "bone-bound-effect",
    aliasStatus: "hero-alias-resource",
    aliasEvidenceStrength: "strong",
    resourcePaths: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
    buffTokens: "Buff_LanceBall_Lance_A_Recovery",
    nativeSemanticCalls: "vcall-remove-or-query-buff|bone-query",
  },
  {
    platform: "ios",
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    bindKind: "selected-attachment-effect",
    boneToken: "",
    effectToken: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    selectedAttachmentSlot: "",
    hasCallback: "yes",
    setsVisibleOrActive: "yes",
    setsEffectOption: "no",
    sourceFile: "functions/10042.c",
    functionName: "FUN_1004202cc",
    line: "171",
    instanceIndex: "1",
    hookPattern: "selected-attachment-effect",
    aliasStatus: "resource-candidate",
    aliasEvidenceStrength: "weak",
    resourcePaths:
      "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx|Effects/Hero055/MED/Hero055_MED_TripWire/Hero055_MED_TripWire.pfx",
    buffTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Buff_Silvernail_A_Tower_Hide_Mesh",
    nativeSemanticCalls: "add-or-apply-buff|vcall-add-buff|android-bone-query",
  },
];

const abilityRows = [
  {
    callKey: "ios:FUN_1003cee5c:12414:0:2:0x19:0",
    platform: "ios",
    callbackFunction: "FUN_1003cee5c",
    parentFunctions: "ios:FUN_10039267c",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon|Effect_LanceBall_Lance_A_Weapon",
    visualParentTokens:
      "Bone_Weapon|Buff_LanceBall_Lance_A_Recovery|Effect_LanceBall_Lance_A_Cast|Effect_LanceBall_Lance_A_Impact|Effect_LanceBall_Lance_A_Weapon",
    combinedParentTokens:
      "Bone_Weapon|Effect_LanceBall_Lance_A_Weapon|Buff_LanceBall_Lance_A_Recovery|Effect_LanceBall_Lance_A_Cast|Effect_LanceBall_Lance_A_Impact",
    evidenceTokens:
      "Bone_Weapon|Effect_LanceBall_Lance_A_Weapon|Buff_LanceBall_Lance_A_Recovery|Effect_LanceBall_Lance_A_Cast|Effect_LanceBall_Lance_A_Impact",
    definitionPath: "Characters/Hero028/Lance.def",
    definitionPathSelection: "hero-code-filtered",
    contextClass: "hero-code-filtered-character-context",
    contextConfidence: "high",
    slotStatus: "resolved-direct-ability-slot",
    runtimeAbilitySlotIndex: "0",
    runtimeAbilityName: "Ability__Lance__A",
    runtimeVariableIndex: "2",
    runtimeVariableStatus: "resolved-ability-variable",
    runtimeVariableName: "Travel Time",
  },
  {
    callKey: "ios:FUN_1004550f8:4664:2:7:0x19:0-low",
    platform: "ios",
    callbackFunction: "FUN_1004550f8",
    parentFunctions: "ios:FUN_1004202cc",
    parentRoles: "attach-point-availability-buff|hide-mesh-buff|weapon-effect-hook",
    parentTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    visualParentTokens: "",
    combinedParentTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    evidenceTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    definitionPath: "Characters/Hero055/Silvernail_GroundedBolt.def",
    definitionPathSelection: "hero-code-filtered",
    contextClass: "definition-without-direct-ability-set",
    contextConfidence: "low",
    slotStatus: "no-ability-set-for-definition",
    runtimeAbilitySlotIndex: "2",
    runtimeAbilityName: "",
    runtimeVariableIndex: "7",
    runtimeVariableStatus: "no-resolved-ability-slot",
    runtimeVariableName: "",
  },
  {
    callKey: "ios:FUN_1004550f8:4664:2:7:0x19:0",
    platform: "ios",
    callbackFunction: "FUN_1004550f8",
    parentFunctions: "ios:FUN_1004202cc",
    parentRoles: "attach-point-availability-buff|hide-mesh-buff|weapon-effect-hook",
    parentTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    visualParentTokens: "",
    combinedParentTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    evidenceTokens: "Buff_Silvernail_A_Tower_AttachPointAvailable|Effect_Silvernail_Tripwire_AttachAvail_Ring",
    definitionPath: "Characters/Hero055/Silvernail.def",
    definitionPathSelection: "hero-code-filtered",
    contextClass: "hero-code-filtered-character-context",
    contextConfidence: "high",
    slotStatus: "resolved-direct-ability-slot",
    runtimeAbilitySlotIndex: "2",
    runtimeAbilityName: "Ability__Silvernail__A",
    runtimeVariableIndex: "7",
    runtimeVariableStatus: "resolved-ability-variable",
    runtimeVariableName: "TRIPWIRE_DURATION",
  },
  {
    callKey: "ios:wrong-context",
    platform: "ios",
    callbackFunction: "FUN_WRONG",
    parentFunctions: "ios:FUN_10039267c",
    parentRoles: "weapon-effect-hook",
    parentTokens: "Effect_Unrelated",
    visualParentTokens: "",
    combinedParentTokens: "Effect_Unrelated",
    evidenceTokens: "Effect_Unrelated",
    definitionPath: "Characters/Hero999/Wrong.def",
    contextConfidence: "high",
    slotStatus: "resolved-direct-ability-slot",
    runtimeAbilitySlotIndex: "1",
    runtimeAbilityName: "Ability__Wrong__B",
    runtimeVariableIndex: "1",
    runtimeVariableStatus: "resolved-ability-variable",
    runtimeVariableName: "WRONG",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function listValueForTest(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

test("contextsForBinding joins native effect hooks to ability helper evidence by function and tokens", () => {
  const manifest = buildEffectHookRuntimeManifest(bindingRows, abilityRows, "2026-06-25T00:00:00.000Z");
  const lance = manifest.items.find((item) => item.effectToken === "Effect_LanceBall_Lance_A_Weapon");

  assert.equal(lance.primaryAbilityContext.definitionPath, "Characters/Hero028/Lance.def");
  assert.equal(lance.primaryAbilityContext.runtimeAbilityName, "Ability__Lance__A");
  assert.deepEqual(lance.primaryAbilityContext.matchedTokens, [
    "Bone_Weapon",
    "Buff_LanceBall_Lance_A_Recovery",
    "Effect_LanceBall_Lance_A_Weapon",
  ]);
  assert.equal(lance.abilityContexts.some((context) => context.definitionPath === "Characters/Hero999/Wrong.def"), false);
});

test("buildEffectHookRuntimeManifest applies high-confidence ability context action gates before resolving resources", () => {
  const resolverRows = [];
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_Idris_C_OnAttachedHero",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_Idris_C_OnAttachedHero",
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: "no",
        sourceFile: "functions/00e26.c",
        functionName: "FUN_00e26be8",
        line: "515",
        instanceIndex: "1",
        hookPattern: "effect-only",
        aliasStatus: "",
        aliasEvidenceStrength: "",
        resourcePaths: "",
        buffTokens: "",
        nativeSemanticCalls: "effect-bind",
        actionKeys: [],
      },
    ],
    [
      {
        callKey: "android:FUN_00e26bb0:474:4:0xc:0x19:0",
        platform: "android",
        callbackFunction: "FUN_00e26bb0",
        parentFunctions: "android:FUN_00e26be8",
        parentRoles: "weapon-effect-hook",
        parentTokens: "Effect_Idris_C_OnAttachedHero",
        visualParentTokens: "",
        combinedParentTokens: "Effect_Idris_C_OnAttachedHero",
        evidenceTokens: "Effect_Idris_C_OnAttachedHero",
        definitionPath: "Characters/Hero030/Idris.def",
        definitionPathSelection: "specific-character-token-filtered",
        contextClass: "specific-token-character-context",
        contextConfidence: "high",
        slotStatus: "resolved-direct-ability-slot",
        runtimeAbilitySlotIndex: "4",
        runtimeAbilityName: "Ability__Idris__C",
        runtimeVariableIndex: "12",
        runtimeVariableStatus: "resolved-ability-variable",
        runtimeVariableName: "Damage Over Time",
      },
    ],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: (token, row) => {
        resolverRows.push({ token, actionKeys: row.actionKeys });
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "kindred-effect-slot-unique-action",
          resourceEvidenceSource: "kindred-effect-resource-slot",
          resourcePaths: ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"],
        };
      },
    },
  );

  assert.deepEqual(resolverRows, [{ token: "Effect_Idris_C_OnAttachedHero", actionKeys: ["ability03"] }]);
  assert.deepEqual(manifest.items[0].actionKeys, ["ability03"]);
  assert.equal(manifest.items[0].primaryAbilityContext.runtimeAbilityName, "Ability__Idris__C");
  assert.deepEqual(manifest.items[0].resourcePaths, ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"]);
});

test("buildEffectHookRuntimeManifest keeps runtime visibility and multi-resource pfx evidence", () => {
  const manifest = buildEffectHookRuntimeManifest(bindingRows, abilityRows, "2026-06-25T00:00:00.000Z");
  const silvernail = manifest.items.find((item) => item.token === "Effect_Silvernail_Tripwire_AttachAvail_Ring");

  assert.equal(silvernail.visibility.hasCallback, true);
  assert.equal(silvernail.visibility.setsVisibleOrActive, true);
  assert.equal(silvernail.resourcePaths.length, 2);
  assert.deepEqual(silvernail.heroCodes, ["Hero055"]);
  assert.deepEqual(silvernail.runtimeBinding, {
    kind: "selected-attachment",
    boneToken: "",
    evidence: "native-selected-attachment-effect",
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
  assert.equal(manifest.summary.byRuntimeBindingKind["selected-attachment"], 1);
  assert.equal(silvernail.primaryAbilityContext.definitionPath, "Characters/Hero055/Silvernail.def");
  assert.equal(silvernail.primaryAbilityContext.runtimeAbilityName, "Ability__Silvernail__A");
});

test("buildEffectHookRuntimeManifest preserves bone binding targets separately from root effect channels", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      bindingRows[0],
      {
        ...bindingRows[0],
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_LanceBall_Lance_A_Cast",
        line: "1300",
        instanceIndex: "2",
      },
    ],
    abilityRows,
    "2026-06-25T00:00:00.000Z",
  );
  const boneBound = manifest.items.find((item) => item.effectToken === "Effect_LanceBall_Lance_A_Weapon");
  const effectChannel = manifest.items.find((item) => item.effectToken === "Effect_LanceBall_Lance_A_Cast");

  assert.deepEqual(boneBound.runtimeBinding, {
    kind: "bone",
    boneToken: "Bone_Weapon",
    evidence: "native-bone-token",
  });
  assert.deepEqual(effectChannel.runtimeBinding, {
    kind: "effect-channel",
    boneToken: "",
    evidence: "native-effect-only",
  });
  assert.equal(manifest.summary.byRuntimeBindingKind.bone, 1);
  assert.equal(manifest.summary.byRuntimeBindingKind["effect-channel"], 1);
});

test("buildEffectHookRuntimeManifest includes direct native effect spawn rows with action gates", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Catherine_UltImpact",
        locatorLabel: "CenterBody",
        actionKeys: ["ability03"],
        sourceFile: "functions/00db4.c",
        functionName: "FUN_00db4b10",
        line: "471",
        sourceKind: "native-effect-spawn",
      },
    ],
    resourceResolver: () => ({
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourceMatchKind: "exact-basename",
      resourceEvidenceSource: "effect-resource-exact",
      resourcePaths: ["Effects/Catherine/Catherine_UltImpact/Catherine_UltImpact.pfx"],
    }),
  });
  const item = manifest.items[0];

  assert.equal(item.sourceKind, "native-effect-spawn");
  assert.equal(item.bindKind, "direct-locator-effect");
  assert.equal(item.boneToken, "CenterBody");
  assert.deepEqual(item.actionKeys, ["ability03"]);
  assert.deepEqual(item.runtimeBinding, {
    kind: "bone",
    boneToken: "CenterBody",
    evidence: "native-locator-token",
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
  assert.deepEqual(item.resourcePaths, ["Effects/Catherine/Catherine_UltImpact/Catherine_UltImpact.pfx"]);
});

test("buildEffectHookRuntimeManifest preserves selected attachment native effect channels", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Baron_C_AllyPreWarning",
        bindHint: "selected-attachment",
        selectedAttachmentSlot: 2,
        actionKeys: ["ability03"],
        sourceFile: "functions/00d87.c",
        functionName: "FUN_00d87530",
        line: "83",
        sourceKind: "native-effect-vcall",
      },
    ],
    resourceResolver: () => ({
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourceMatchKind: "exact-basename",
      resourceEvidenceSource: "effect-resource-exact",
      resourcePaths: ["Effects/Baron/Baron_C_AllyPreWarning.assetbundle/Baron_C_AllyPreWarning.pfx"],
    }),
  });
  const item = manifest.items[0];

  assert.equal(item.bindKind, "selected-attachment-effect");
  assert.equal(item.boneToken, "");
  assert.deepEqual(item.runtimeBinding, {
    kind: "selected-attachment",
    boneToken: "",
    selectedAttachmentSlot: 2,
    evidence: "native-selected-attachment-effect",
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
});

test("buildEffectHookRuntimeManifest joins native effect timeline times by exact token and action", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Adagio_Ult_Hands",
        locatorLabel: "Bone_RightHand",
        actionKeys: ["ability03"],
        sourceFile: "functions/adagio.c",
        functionName: "FUN_ADAGIO",
        line: "22",
        sourceKind: "native-effect-spawn",
      },
    ],
    timelineRows: [
      {
        eventKind: "effect",
        effectToken: "Effect_Adagio_Ult_Hands",
        actionKeys: ["ability03"],
        timeSeconds: 2,
        sourceKind: "native-runtime-effect",
      },
      {
        eventKind: "effect",
        effectToken: "Effect_Adagio_Ult_Hands",
        actionKeys: ["ability01"],
        timeSeconds: 0.25,
        sourceKind: "native-runtime-effect",
      },
    ],
    resourceResolver: () => ({
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourceMatchKind: "exact-basename",
      resourceEvidenceSource: "effect-resource-exact",
      resourcePaths: ["Effects/Adagio/Adagio_Ult_Hands.assetbundle/Adagio_Ult_Hands.pfx"],
    }),
  });

  const item = manifest.items[0];

  assert.equal(item.nativeTimelineEventCount, 1);
  assert.deepEqual(item.nativeTimelineTimes, [2]);
  assert.equal(item.runtimeBinding.startSeconds, 2);
  assert.deepEqual(item.runtimeBinding.timelineTimes, [2]);
  assert.equal(manifest.summary.nativeTimedRows, 1);
});

test("buildEffectHookRuntimeManifest backfills direct effect action keys from exact native timeline rows before resolving", () => {
  const resolverRows = [];
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Catherine_ArcaneShield_Impact",
        sourceFile: "functions/catherine.c",
        functionName: "FUN_CATHERINE_B",
        line: "369",
        sourceKind: "native-effect-spawn",
        actionKeys: [],
        heroNames: ["Catherine"],
      },
    ],
    timelineRows: [
      {
        platform: "android",
        eventKind: "effect",
        sourceKind: "native-runtime-effect",
        effectToken: "Effect_Catherine_ArcaneShield_Impact",
        actionKeys: ["ability02"],
        sourceFile: "functions/catherine.c",
        functionName: "FUN_CATHERINE_B",
        line: "369",
        timeSeconds: "0",
      },
    ],
    resourceResolver: (token, row) => {
      resolverRows.push({ token, actionKeys: row.actionKeys });
      return {
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-unique-action",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: listValueForTest(row.actionKeys).includes("ability02")
          ? ["Effects/Catherine/Catherine_B_Proj_Hit/Catherine_B_Proj_Impact.pfx"]
          : [],
      };
    },
  });

  assert.deepEqual(resolverRows, [
    {
      token: "Effect_Catherine_ArcaneShield_Impact",
      actionKeys: ["ability02"],
    },
  ]);
  assert.deepEqual(manifest.items[0].actionKeys, ["ability02"]);
  assert.equal(manifest.items[0].nativeTimelineEventCount, 1);
  assert.deepEqual(manifest.items[0].resourcePaths, ["Effects/Catherine/Catherine_B_Proj_Hit/Catherine_B_Proj_Impact.pfx"]);
});

test("buildEffectHookRuntimeManifest carries native vcall effect options into runtime binding", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Hero057_C_Cloud",
        actionKeys: ["ability03"],
        sourceFile: "functions/hero057.c",
        functionName: "FUN_HERO057_C",
        line: "24",
        sourceKind: "native-effect-vcall",
        effectOptionOffsets: ["0xc0", "0xd0", "0x78", "0xd8", "0xb0"],
        effectOptionFloatArgs: ["0xc0:1,0,1", "0xd0:4", "0x78:1", "0xd8:0.8", "0xb0:1"],
        effectOptionArgKinds: [
          "0xc0:numeric-direct",
          "0xd0:numeric-local",
          "0x78:numeric-direct",
          "0xd8:numeric-direct",
          "0xb0:numeric-direct",
        ],
        effectOptionArgSources: [
          "0xc0:numeric-direct:0x3f800000",
          "0xd0:numeric-local:local_40=0x40800000",
          "0x78:numeric-direct:1",
          "0xd8:numeric-direct:0x3f4ccccd",
          "0xb0:numeric-direct:1",
        ],
        effectOptions: {
          color: [1, 0, 1],
          scale: 4,
          followTarget: true,
          fadeSeconds: 0.8,
          visibleOrActive: true,
        },
      },
    ],
  });

  const item = manifest.items[0];

  assert.deepEqual(item.runtimeBinding.effectOptionOffsets, ["0xc0", "0xd0", "0x78", "0xd8", "0xb0"]);
  assert.deepEqual(item.runtimeBinding.effectOptionArgKinds, [
    "0xc0:numeric-direct",
    "0xd0:numeric-local",
    "0x78:numeric-direct",
    "0xd8:numeric-direct",
    "0xb0:numeric-direct",
  ]);
  assert.deepEqual(item.runtimeBinding.effectOptionArgSources, [
    "0xc0:numeric-direct:0x3f800000",
    "0xd0:numeric-local:local_40=0x40800000",
    "0x78:numeric-direct:1",
    "0xd8:numeric-direct:0x3f4ccccd",
    "0xb0:numeric-direct:1",
  ]);
  assert.deepEqual(item.runtimeBinding.effectOptions, {
    color: [1, 0, 1],
    scale: 4,
    followTarget: true,
    fadeSeconds: 0.8,
    visibleOrActive: true,
  });
});

test("buildEffectHookRuntimeManifest carries native action name evidence from direct effect rows", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Miho_B_Stance_Warning",
        heroNames: ["Miho"],
        actionKeys: ["ability02", "ability03"],
        actionNames: ["Ability__Miho__B_CancelStance", "Ability__Miho__B_Slash", "Ability__Miho__C"],
        nearbyBuffTokens: ["Buff_Miho_C_PFX"],
        nearbyEffectTokens: ["Effect_Miho_C_Projectile_Destroyed"],
        nearbyAbilityNames: ["Ability__Miho__B_CancelStance"],
        nearbySoundTokens: ["Sound_Miho_AbilityB_Aura"],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_MIHO_B",
        line: "119",
      },
    ],
  });

  const item = manifest.items[0];
  assert.deepEqual(item.nativeActionNames, ["Ability__Miho__B_CancelStance", "Ability__Miho__B_Slash", "Ability__Miho__C"]);
  assert.deepEqual(item.nativeNearbyBuffTokens, ["Buff_Miho_C_PFX"]);
  assert.deepEqual(item.nativeNearbyEffectTokens, ["Effect_Miho_C_Projectile_Destroyed"]);
  assert.deepEqual(item.nativeNearbyAbilityNames, ["Ability__Miho__B_CancelStance"]);
  assert.deepEqual(item.nativeNearbySoundTokens, ["Sound_Miho_AbilityB_Aura"]);
  assert.equal(manifest.summary.nativeActionNameRows, 1);
  assert.equal(manifest.summary.nativeNearbyTokenRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].nativeActionNames, "Ability__Miho__B_CancelStance|Ability__Miho__B_Slash|Ability__Miho__C");
  assert.equal(rows[0].nativeNearbyBuffTokens, "Buff_Miho_C_PFX");
  assert.equal(rows[0].nativeNearbyEffectTokens, "Effect_Miho_C_Projectile_Destroyed");
  assert.equal(rows[0].nativeNearbyAbilityNames, "Ability__Miho__B_CancelStance");
  assert.equal(rows[0].nativeNearbySoundTokens, "Sound_Miho_AbilityB_Aura");
});

test("buildEffectHookRuntimeManifest infers action gates from nearby native ability and sound tokens before resolving", () => {
  const resolverRows = [];
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_PetalMinion_Explosion",
        heroNames: ["PetalMinion"],
        actionKeys: [],
        nearbySoundTokens: ["Sound_Petal_ability_3_explode_1"],
        sourceKind: "native-effect-spawn",
        functionName: "FUN_PETAL_MINION",
        line: "346",
      },
      {
        platform: "android",
        effectToken: "Effect_Miho_B_Stance_Warning",
        heroNames: ["Miho"],
        actionKeys: [],
        nearbyAbilityNames: ["Ability__Miho__B_CancelStance"],
        nearbySoundTokens: ["Sound_Miho_AbilityB_Aura"],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_MIHO_B",
        line: "119",
      },
      {
        platform: "android",
        effectToken: "Effect_Catherine_AssassinsChargeHit",
        heroNames: ["Catherine"],
        actionKeys: [],
        nearbySoundTokens: ["Sound_Catherine_Ability_A_Impact"],
        sourceKind: "native-effect-spawn",
        functionName: "FUN_CATHERINE_A",
        line: "216",
      },
    ],
    resourceResolver: (token, row) => {
      resolverRows.push({ token, actionKeys: row.actionKeys });
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "exact-basename",
        resourceEvidenceSource: "effect-resource-exact",
        resourcePaths: [`Effects/Test/${token}.pfx`],
      };
    },
  });

  assert.deepEqual(resolverRows, [
    { token: "Effect_PetalMinion_Explosion", actionKeys: ["ability03"] },
    { token: "Effect_Miho_B_Stance_Warning", actionKeys: ["ability02"] },
    { token: "Effect_Catherine_AssassinsChargeHit", actionKeys: ["ability01"] },
  ]);
  assert.deepEqual(manifest.items.map((item) => item.actionKeys), [["ability01"], ["ability02"], ["ability03"]]);
});

test("buildEffectHookRuntimeManifest backfills action gates from unique resolved Kindred resource variants", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Baptiste_SoulFragment",
        heroNames: ["Baptiste"],
        actionKeys: [],
        sourceKind: "native-effect-selector",
        functionName: "FUN_BAPTISTE_B",
        line: "120",
      },
      {
        platform: "android",
        effectToken: "Effect_Ambiguous",
        heroNames: ["Baptiste"],
        actionKeys: [],
        sourceKind: "native-effect-selector",
        functionName: "FUN_BAPTISTE_MULTI",
        line: "140",
      },
    ],
    resourceResolver: (token) => ({
      aliasStatus: "hero-alias-resource",
      aliasEvidenceStrength: "strong",
      resourceMatchKind: "kindred-effect-slot-semantic-alias",
      resourceEvidenceSource: "kindred-effect-resource-slot",
      resourcePaths: [`Effects/Test/${token}.pfx`],
      resourceVariants:
        token === "Effect_Baptiste_SoulFragment"
          ? [{ resourcePath: `Effects/Test/${token}.pfx`, actionKeys: ["ability02"] }]
          : [
              { resourcePath: `Effects/Test/${token}_A.pfx`, actionKeys: ["ability01"] },
              { resourcePath: `Effects/Test/${token}_B.pfx`, actionKeys: ["ability02"] },
            ],
    }),
  });

  const soul = manifest.items.find((item) => item.effectToken === "Effect_Baptiste_SoulFragment");
  const ambiguous = manifest.items.find((item) => item.effectToken === "Effect_Ambiguous");
  assert.deepEqual(soul.actionKeys, ["ability02"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills action gates from unique resolved pfx resource slot", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Anka_A2_End",
        heroNames: ["Anka"],
        actionKeys: [],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_ANKA_A2",
        line: "573",
      },
      {
        platform: "android",
        effectToken: "Effect_Ambiguous_Path",
        heroNames: ["Test"],
        actionKeys: [],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_AMBIGUOUS",
        line: "574",
      },
    ],
    resourceResolver: (token) => ({
      aliasStatus: "exact-resource",
      aliasEvidenceStrength: "confirmed",
      resourceMatchKind: "pfx-hook-token",
      resourceEvidenceSource: "pfx-effect-token",
      resourcePaths:
        token === "Effect_Anka_A2_End"
          ? ["Effects/Hero054/PCK/Hero054_PCK_A2_End/Hero054_PCK_A2_End.pfx"]
          : ["Effects/Test/Test_A1/Test_A1.pfx", "Effects/Test/Test_A2/Test_A2.pfx"],
    }),
  });

  const anka = manifest.items.find((item) => item.effectToken === "Effect_Anka_A2_End");
  const ambiguous = manifest.items.find((item) => item.effectToken === "Effect_Ambiguous_Path");
  assert.deepEqual(anka.actionKeys, ["ability02"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills missing direct selector action keys from unique same-token runtime context", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Hero051_GunA2Attack",
        heroNames: ["Hero051"],
        actionKeys: ["ability02"],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ANDROID",
        line: "420",
      },
      {
        platform: "ios",
        effectToken: "Effect_Hero051_GunA2Attack",
        heroNames: ["Hero051"],
        actionKeys: [],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_IOS",
        line: "405",
      },
      {
        platform: "ios",
        effectToken: "Effect_Hero051_Ambiguous",
        heroNames: ["Hero051"],
        actionKeys: ["ability01"],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_AMBIG_A",
        line: "10",
      },
      {
        platform: "ios",
        effectToken: "Effect_Hero051_Ambiguous",
        heroNames: ["Hero051"],
        actionKeys: ["ability02"],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_AMBIG_B",
        line: "11",
      },
      {
        platform: "android",
        effectToken: "Effect_Hero051_Ambiguous",
        heroNames: ["Hero051"],
        actionKeys: [],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_AMBIG_EMPTY",
        line: "12",
      },
    ],
    resourceResolver: (token, row) => {
      const actionKeys = Array.isArray(row.actionKeys) ? row.actionKeys : String(row.actionKeys || "").split("|").filter(Boolean);
      if (token === "Effect_Hero051_GunA2Attack" && actionKeys.includes("ability02")) {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "test-action-backfill",
          resourceEvidenceSource: "test",
          resourcePaths: ["Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const backfilled = manifest.items.find((item) => item.platform === "ios" && item.effectToken === "Effect_Hero051_GunA2Attack");
  const ambiguous = manifest.items.find((item) => item.source.functionName === "FUN_AMBIG_EMPTY");

  assert.deepEqual(backfilled.actionKeys, ["ability02"]);
  assert.deepEqual(backfilled.resourcePaths, ["Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills selector actions from role-neutral same-token runtime context", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_LanceBall_Lance_HoldingBall",
        heroNames: ["LanceBall"],
        actionKeys: ["ability03"],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_LANCEBALL_C",
        line: "576",
      },
      {
        platform: "android",
        effectToken: "Effect_LanceBall_Lance_HoldingBall",
        heroNames: ["LanceBall"],
        actionKeys: [],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_LANCEBALL_SELECTOR",
        line: "640",
      },
      {
        platform: "android",
        effectToken: "Effect_Test_Ambiguous",
        heroNames: ["HeroTest"],
        actionKeys: ["ability01"],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_TEST_A",
        line: "1",
      },
      {
        platform: "android",
        effectToken: "Effect_Test_Ambiguous",
        heroNames: ["HeroTest"],
        actionKeys: ["ability02"],
        sourceKind: "native-effect-vcall",
        functionName: "FUN_TEST_B",
        line: "2",
      },
      {
        platform: "android",
        effectToken: "Effect_Test_Ambiguous",
        heroNames: ["HeroTest"],
        actionKeys: [],
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_TEST_SELECTOR",
        line: "3",
      },
    ],
    resourceResolver: (token, row) => {
      if (token === "Effect_LanceBall_Lance_HoldingBall" && listValueForTest(row.actionKeys).includes("ability03")) {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "test-role-neutral-action-backfill",
          resourceEvidenceSource: "test",
          resourcePaths: ["Effects/Hero028/Hero028_C_Projectile/Hero028_C_Projectile.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const selector = manifest.items.find((item) => item.source.functionName === "FUN_LANCEBALL_SELECTOR");
  const ambiguous = manifest.items.find((item) => item.source.functionName === "FUN_TEST_SELECTOR");

  assert.deepEqual(selector.actionKeys, ["ability03"]);
  assert.deepEqual(selector.resourcePaths, ["Effects/Hero028/Hero028_C_Projectile/Hero028_C_Projectile.pfx"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills action gates from unique same-function hero context", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Adagio_Ult_Hands",
        heroNames: ["Adagio"],
        actionKeys: ["ability03"],
        sourceKind: "native-effect-spawn",
        functionName: "FUN_ADAGIO_ULT",
        line: "22",
        resourcePaths: ["Effects/Adagio/AdagioUltHands.assetbundle/Adagio_Ult_Hands.pfx"],
      },
      {
        platform: "android",
        effectToken: "Effect_AdagioFriendship",
        heroNames: [],
        actionKeys: [],
        sourceKind: "native-visual-binding",
        functionName: "FUN_ADAGIO_ULT",
        line: "515",
        resourcePaths: ["Effects/Adagio/S1/Adagio__S1__Ult_Cast.assetbundle/Adagio__S1__Ult_Cast.pfx"],
      },
      {
        platform: "android",
        effectToken: "Effect_Ambiguous_A",
        heroNames: ["HeroTest"],
        actionKeys: ["ability01"],
        sourceKind: "native-effect-spawn",
        functionName: "FUN_AMBIG_FUNCTION",
        line: "1",
      },
      {
        platform: "android",
        effectToken: "Effect_Ambiguous_B",
        heroNames: ["HeroTest"],
        actionKeys: ["ability02"],
        sourceKind: "native-effect-spawn",
        functionName: "FUN_AMBIG_FUNCTION",
        line: "2",
      },
      {
        platform: "android",
        effectToken: "Effect_Ambiguous_Missing",
        heroNames: ["HeroTest"],
        actionKeys: [],
        sourceKind: "native-visual-binding",
        functionName: "FUN_AMBIG_FUNCTION",
        line: "3",
      },
    ],
    resourceResolver: (token, row) => {
      if (token === "Effect_AdagioFriendship" && listValueForTest(row.actionKeys).includes("ability03")) {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "test-source-function-action-backfill",
          resourceEvidenceSource: "test",
          resourcePaths: ["Effects/Adagio/S1/Adagio__S1__Ult_Cast.assetbundle/Adagio__S1__Ult_Cast.pfx"],
        };
      }
      return { resourcePaths: listValueForTest(row.resourcePaths) };
    },
  });

  const backfilled = manifest.items.find((item) => item.effectToken === "Effect_AdagioFriendship");
  const ambiguous = manifest.items.find((item) => item.effectToken === "Effect_Ambiguous_Missing");

  assert.deepEqual(backfilled.actionKeys, ["ability03"]);
  assert.deepEqual(backfilled.resourcePaths, ["Effects/Adagio/S1/Adagio__S1__Ult_Cast.assetbundle/Adagio__S1__Ult_Cast.pfx"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills actions using decoded effect-token hero names", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Idris_C_OnAttachedHero",
        actionKeys: ["ability03"],
        sourceKind: "native-effect-hook",
        functionName: "FUN_IDRIS_C",
        line: "515",
      },
      {
        platform: "android",
        effectToken: "Effect_Idris_C_OnAttachedHero",
        actionKeys: [],
        sourceKind: "native-effect-hook",
        functionName: "FUN_IDRIS_TALENT",
        line: "576",
      },
      {
        platform: "android",
        effectToken: "Effect_Shared_Proc",
        actionKeys: ["ability01"],
        sourceKind: "native-effect-hook",
        functionName: "FUN_SHARED_A",
        line: "1",
      },
      {
        platform: "android",
        effectToken: "Effect_Shared_Proc",
        actionKeys: ["ability02"],
        sourceKind: "native-effect-hook",
        functionName: "FUN_SHARED_B",
        line: "2",
      },
      {
        platform: "android",
        effectToken: "Effect_Shared_Proc",
        actionKeys: [],
        sourceKind: "native-effect-hook",
        functionName: "FUN_SHARED_EMPTY",
        line: "3",
      },
    ],
    heroNameRows: [
      { hero: "Idris", kind: "Effect", name: "C_OnAttachedHero" },
      { hero: "Shared", kind: "Effect", name: "Proc" },
    ],
    resourceResolver: (token, row) => {
      if (token === "Effect_Idris_C_OnAttachedHero" && listValueForTest(row.actionKeys).includes("ability03")) {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "test-decoded-hero-action-backfill",
          resourceEvidenceSource: "test",
          resourcePaths: ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const decoded = manifest.items.find((item) => item.source.functionName === "FUN_IDRIS_TALENT");
  const ambiguous = manifest.items.find((item) => item.source.functionName === "FUN_SHARED_EMPTY");

  assert.deepEqual(decoded.actionKeys, ["ability03"]);
  assert.deepEqual(decoded.resourcePaths, ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"]);
  assert.deepEqual(ambiguous.actionKeys, []);
});

test("buildEffectHookRuntimeManifest backfills sibling actions after ability context inference", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_Idris_C_OnAttachedHero",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_Idris_C_OnAttachedHero",
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        sourceFile: "functions/00e26.c",
        functionName: "FUN_IDRIS_C",
        line: "515",
        instanceIndex: "0",
        hookPattern: "effect-only",
        aliasStatus: "",
        aliasEvidenceStrength: "",
        resourcePaths: "",
        buffTokens: "",
        nativeSemanticCalls: "effect-bind",
      },
      {
        platform: "android",
        token: "Effect_Idris_C_OnAttachedHero",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_Idris_C_OnAttachedHero",
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        sourceFile: "functions/00e26.c",
        functionName: "FUN_IDRIS_TALENT",
        line: "576",
        instanceIndex: "0",
        hookPattern: "effect-only",
        aliasStatus: "",
        aliasEvidenceStrength: "",
        resourcePaths: "",
        buffTokens: "Buff_Idris_Talent_ShimmerHeal",
        nativeSemanticCalls: "effect-bind",
      },
    ],
    [
      {
        callKey: "android:FUN_IDRIS_C:515:0",
        platform: "android",
        callbackFunction: "FUN_IDRIS_C",
        parentFunctions: "android:FUN_IDRIS_C",
        parentRoles: "effect-hook",
        parentTokens: "Effect_Idris_C_OnAttachedHero",
        visualParentTokens: "",
        combinedParentTokens: "Effect_Idris_C_OnAttachedHero",
        evidenceTokens: "Effect_Idris_C_OnAttachedHero",
        definitionPath: "Characters/Hero030/Idris.def",
        definitionPathSelection: "specific-character-token-filtered",
        contextClass: "specific-token-character-context",
        contextConfidence: "high",
        slotStatus: "resolved-direct-ability-slot",
        runtimeAbilitySlotIndex: "4",
        runtimeAbilityName: "Ability__Idris__C",
        runtimeVariableIndex: "12",
        runtimeVariableStatus: "resolved-ability-variable",
        runtimeVariableName: "Damage Over Time",
      },
    ],
    "2026-06-25T00:00:00.000Z",
    {
      heroNameRows: [{ hero: "Idris", kind: "Effect", name: "C_OnAttachedHero" }],
      resourceResolver: (token, row) => {
        if (token === "Effect_Idris_C_OnAttachedHero" && listValueForTest(row.actionKeys).includes("ability03")) {
          return {
            aliasStatus: "hero-alias-resource",
            aliasEvidenceStrength: "strong",
            resourceMatchKind: "test-post-context-action-backfill",
            resourceEvidenceSource: "test",
            resourcePaths: ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"],
          };
        }
        return { resourcePaths: [] };
      },
    },
  );

  const abilityRow = manifest.items.find((item) => item.source.functionName === "FUN_IDRIS_C");
  const sibling = manifest.items.find((item) => item.source.functionName === "FUN_IDRIS_TALENT");

  assert.deepEqual(abilityRow.actionKeys, ["ability03"]);
  assert.deepEqual(sibling.actionKeys, ["ability03"]);
  assert.deepEqual(sibling.resourcePaths, ["Effects/Hero030/Hero030_C_Attack/Hero030_C_Attack.pfx"]);
});

test("buildEffectHookRuntimeManifest resolves placeholder projectile resources from native selector impact companions", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Hero050_B",
        heroNames: ["Hero050"],
        actionKeys: ["ability02"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_HERO050_B",
        line: "160",
      },
      {
        platform: "android",
        effectToken: "Effect_Hero050_Proj_Hit",
        heroNames: ["Hero050"],
        actionKeys: ["ability02"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_HERO050_B",
        line: "161",
      },
      {
        platform: "android",
        effectToken: "Effect_Hero050_C",
        heroNames: ["Hero050"],
        actionKeys: ["ability03"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_HERO050_C",
        line: "199",
      },
      {
        platform: "android",
        effectToken: "Effect_Hero050_C_Explosion",
        heroNames: ["Hero050"],
        actionKeys: ["ability03"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_HERO050_C",
        line: "200",
      },
    ],
    kindredSlots: [
      {
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj",
        resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      },
    ],
    resourceResolver: (token) => {
      if (token === "Effect_Hero050_Proj_Hit") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "unique-pfx-hook-effect-token",
          resourceEvidenceSource: "effect-pfx-hook-token",
          resourcePaths: ["Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx"],
        };
      }
      if (token === "Effect_Hero050_C_Explosion") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "unique-pfx-hook-effect-token",
          resourceEvidenceSource: "effect-pfx-hook-token",
          resourcePaths: ["Effects/Hero000/Hero000_Explosion_5MR/Hero000_Explosion_5mr.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const projectile = manifest.items.find((item) => item.effectToken === "Effect_Hero050_B");
  const explosionProjectile = manifest.items.find((item) => item.effectToken === "Effect_Hero050_C");

  assert.deepEqual(projectile.resourcePaths, ["Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx"]);
  assert.equal(projectile.resourceEvidenceSource, "native-selector-pair-companion");
  assert.equal(projectile.resourceMatchKind, "native-selector-pair-impact-companion");
  assert.deepEqual(projectile.resourceVariants, [
    {
      resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      modelLabel: "Hero000_DefaultSkin",
      skinKind: "default",
      heroLabel: "Hero000",
    },
  ]);
  assert.deepEqual(explosionProjectile.resourcePaths, []);
});

test("buildEffectHookRuntimeManifest resolves selector projectile resources from unique impact path siblings", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_TurretCore",
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_TURRET_ATTACK",
        line: "414",
      },
      {
        platform: "android",
        effectToken: "Effect_TurretImpact",
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_TURRET_ATTACK",
        line: "415",
      },
      {
        platform: "android",
        effectToken: "Effect_Reza_A_Shot",
        heroNames: ["Reza"],
        actionKeys: ["ability01"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_REZA_A",
        line: "611",
      },
      {
        platform: "android",
        effectToken: "Effect_Reza_A_ShotImpact",
        heroNames: ["Reza"],
        actionKeys: ["ability01"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_REZA_A",
        line: "612",
      },
    ],
    effectRows: [
      {
        relativePath: "Effects/Turret/TurretImpact.assetbundle/TurretImpact.pfx",
      },
      {
        relativePath: "Effects/Turret/TurretProjectile.assetbundle/TurretProjectile.pfx",
      },
      {
        relativePath: "Effects/Hero041/S1/Hero041_S1_A_Impact/Hero021_S1_A_Impact.pfx",
      },
      {
        relativePath: "Effects/Hero041/Hero041_AA/Hero041_AA.pfx",
      },
    ],
    resourceResolver: (token) => {
      if (token === "Effect_TurretImpact") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "unique-pfx-hook-effect-token",
          resourceEvidenceSource: "effect-pfx-hook-token",
          resourcePaths: ["Effects/Turret/TurretImpact.assetbundle/TurretImpact.pfx"],
        };
      }
      if (token === "Effect_Reza_A_ShotImpact") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "unique-pfx-hook-effect-token",
          resourceEvidenceSource: "effect-pfx-hook-token",
          resourcePaths: ["Effects/Hero041/S1/Hero041_S1_A_Impact/Hero021_S1_A_Impact.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const turretProjectile = manifest.items.find((item) => item.effectToken === "Effect_TurretCore");
  const rezaProjectile = manifest.items.find((item) => item.effectToken === "Effect_Reza_A_Shot");

  assert.deepEqual(turretProjectile.resourcePaths, ["Effects/Turret/TurretProjectile.assetbundle/TurretProjectile.pfx"]);
  assert.equal(turretProjectile.resourceEvidenceSource, "native-selector-pair-companion");
  assert.equal(turretProjectile.resourceMatchKind, "native-selector-pair-impact-path-sibling");
  assert.deepEqual(rezaProjectile.resourcePaths, []);
});

test("buildEffectHookRuntimeManifest copies unique same-token selector resources within one function", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Item_EMP",
        heroNames: ["Item"],
        heroResourceRoots: ["Item_NullwaveGauntlet"],
        selectorOutputTarget: "param_2[1]",
        selectorOutputRole: "effect",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ITEM_EMP",
        line: "330",
      },
      {
        platform: "android",
        effectToken: "Effect_Item_EMP",
        heroNames: ["Item"],
        heroResourceRoots: ["Item_NullwaveGauntlet", "Items"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ITEM_EMP",
        line: "331",
      },
      {
        platform: "android",
        effectToken: "Effect_Item_EMP",
        heroNames: ["Item"],
        heroResourceRoots: ["Item_NullwaveGauntlet"],
        selectorOutputTarget: "param_2[1]",
        selectorOutputRole: "effect",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ITEM_EMP_AMBIGUOUS",
        line: "332",
      },
      {
        platform: "android",
        effectToken: "Effect_Item_EMP",
        heroNames: ["Item"],
        heroResourceRoots: ["Item_NullwaveGauntlet", "Items"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ITEM_EMP_AMBIGUOUS",
        line: "333",
      },
      {
        platform: "android",
        effectToken: "Effect_Item_EMP",
        heroNames: ["Item"],
        heroResourceRoots: ["Item_NullwaveGauntlet", "Items"],
        selectorOutputTarget: "*param_2_alt",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ITEM_EMP_AMBIGUOUS",
        line: "334",
      },
    ],
    resourceResolver: (token, row) => {
      if (token === "Effect_Item_EMP" && row.selectorOutputRole === "projectile" && row.functionName === "FUN_ITEM_EMP") {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "scoped-entity-semantic-resource",
          resourceEvidenceSource: "effect-resource-scoped-entity",
          resourcePaths: ["Effects/Items/EMP/EMP_Proj/EMP_Proj.pfx"],
        };
      }
      if (token === "Effect_Item_EMP" && row.selectorOutputRole === "projectile" && row.functionName === "FUN_ITEM_EMP_AMBIGUOUS") {
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "scoped-entity-semantic-resource",
          resourceEvidenceSource: "effect-resource-scoped-entity",
          resourcePaths:
            row.selectorOutputTarget === "*param_2"
              ? ["Effects/Items/EMP/EMP_Proj/EMP_Proj.pfx"]
              : ["Effects/Items/EMP/EMP_Alt/EMP_Alt.pfx"],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const copied = manifest.items.find((item) => item.source.functionName === "FUN_ITEM_EMP" && item.selectorOutputRole === "effect");
  const ambiguous = manifest.items.find((item) => item.source.functionName === "FUN_ITEM_EMP_AMBIGUOUS" && item.selectorOutputRole === "effect");

  assert.deepEqual(copied.resourcePaths, ["Effects/Items/EMP/EMP_Proj/EMP_Proj.pfx"]);
  assert.equal(copied.resourceEvidenceSource, "native-selector-same-token-companion");
  assert.equal(copied.resourceMatchKind, "native-selector-same-token-resource");
  assert.deepEqual(ambiguous.resourcePaths, []);
});

test("buildEffectHookRuntimeManifest narrows weak selector impacts from strong projectile companions", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Adagio_Spell_Projectile",
        heroNames: ["Adagio"],
        actionKeys: ["ability01"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ADAGIO_A",
        line: "902",
      },
      {
        platform: "android",
        effectToken: "Effect_AdagioFortunesSmile_impact",
        heroNames: ["Adagio"],
        actionKeys: ["ability01"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_ADAGIO_A",
        line: "903",
      },
      {
        platform: "android",
        effectToken: "Effect_Karas_C_Shot",
        heroNames: ["Karas"],
        actionKeys: ["ability03"],
        selectorOutputTarget: "*param_2",
        selectorOutputRole: "projectile",
        sourceKind: "native-effect-selector",
        functionName: "FUN_KARAS_C",
        line: "155",
      },
      {
        platform: "android",
        effectToken: "Effect_Karas_C_Impact",
        heroNames: ["Karas"],
        actionKeys: ["ability03"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        sourceKind: "native-effect-selector",
        functionName: "FUN_KARAS_C",
        line: "156",
      },
    ],
    resourceResolver: (token) => {
      if (token === "Effect_Adagio_Spell_Projectile") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "exact-basename",
          resourceEvidenceSource: "effect-resource-exact",
          resourcePaths: ["Effects/Adagio/Adagio_Spell_Projectile.assetbundle/Adagio_Spell_Projectile.pfx"],
        };
      }
      if (token === "Effect_AdagioFortunesSmile_impact") {
        return {
          aliasStatus: "resource-candidate",
          aliasEvidenceStrength: "weak",
          resourceMatchKind: "cff0-source-effect-alias-default-candidate",
          resourceEvidenceSource: "effect-resource-candidate",
          resourcePaths: [
            "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
            "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx",
          ],
        };
      }
      if (token === "Effect_Karas_C_Shot") {
        return {
          aliasStatus: "exact-resource",
          aliasEvidenceStrength: "confirmed",
          resourceMatchKind: "exact-basename",
          resourceEvidenceSource: "effect-resource-exact",
          resourcePaths: ["Effects/Hero071/Defaults/Hero071_C_Shot/Hero071_C_Shot.pfx"],
        };
      }
      if (token === "Effect_Karas_C_Impact") {
        return {
          aliasStatus: "resource-candidate",
          aliasEvidenceStrength: "weak",
          resourceMatchKind: "hero-code-keyword-candidate",
          resourceEvidenceSource: "effect-resource-candidate",
          resourcePaths: [
            "Effects/Hero071/Defaults/Hero071_A_Impact/Hero071_A_Impact.pfx",
            "Effects/Hero071/Defaults/Hero071_BasicAttack_Impact/Hero071_BasicAttack_Impact.pfx",
          ],
        };
      }
      return { resourcePaths: [] };
    },
  });

  const adagioImpact = manifest.items.find((item) => item.effectToken === "Effect_AdagioFortunesSmile_impact");
  const karasImpact = manifest.items.find((item) => item.effectToken === "Effect_Karas_C_Impact");

  assert.deepEqual(adagioImpact.resourcePaths, ["Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx"]);
  assert.equal(adagioImpact.aliasEvidenceStrength, "strong");
  assert.equal(adagioImpact.resourceEvidenceSource, "native-selector-pair-companion");
  assert.equal(adagioImpact.resourceMatchKind, "native-selector-pair-projectile-companion");

  assert.deepEqual(karasImpact.resourcePaths, [
    "Effects/Hero071/Defaults/Hero071_A_Impact/Hero071_A_Impact.pfx",
    "Effects/Hero071/Defaults/Hero071_BasicAttack_Impact/Hero071_BasicAttack_Impact.pfx",
  ]);
  assert.equal(karasImpact.aliasEvidenceStrength, "weak");
});

test("buildEffectHookRuntimeManifest preserves native direct effect hero names for gap tracing", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Baron_A_Shot",
        actionKeys: ["ability01"],
        heroNames: ["Baron"],
        sourceFile: "functions/baron.c",
        functionName: "FUN_BARON_SELECTOR",
        line: "17",
      },
    ],
  });
  const item = manifest.items[0];

  assert.deepEqual(item.heroNames, ["Baron"]);
  assert.equal(manifest.summary.heroNameRows, 1);
  assert.equal(reportRowsForManifest(manifest)[0].heroNames, "Baron");
});

test("buildEffectHookRuntimeManifest preserves selector output slots for native selector rows", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Ringo_B_Impact",
        actionKeys: ["ability02"],
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        selectorStateTerms: ["light"],
        sourceFile: "functions/ringo.c",
        functionName: "FUN_RINGO_SELECTOR",
        line: "20",
      },
    ],
  });
  const item = manifest.items[0];
  const report = reportRowsForManifest(manifest)[0];

  assert.equal(item.selectorOutputTarget, "param_2[4]");
  assert.equal(item.selectorOutputRole, "impact");
  assert.deepEqual(item.selectorStateTerms, ["light"]);
  assert.equal(report.selectorOutputTarget, "param_2[4]");
  assert.equal(report.selectorOutputRole, "impact");
  assert.equal(report.selectorStateTerms, "light");
});

test("buildEffectHookRuntimeManifest preserves zero-second native effect timeline starts", () => {
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Adagio_Heal_Cast",
        actionKeys: ["ability01"],
        sourceFile: "functions/adagio.c",
        functionName: "FUN_ADAGIO_HEAL",
        line: "40",
        sourceKind: "native-effect-spawn",
      },
    ],
    timelineRows: [
      {
        eventKind: "effect",
        effectToken: "Effect_Adagio_Heal_Cast",
        actionKeys: ["ability01"],
        timeSeconds: 0,
        sourceKind: "native-runtime-effect",
      },
    ],
  });

  const item = manifest.items[0];

  assert.deepEqual(item.nativeTimelineTimes, [0]);
  assert.equal(item.runtimeBinding.startSeconds, 0);
});

test("buildEffectHookRuntimeManifest treats visible native effect calls without timeline as immediate", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_AdagioFriendship",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_AdagioFriendship",
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: "no",
        sourceFile: "functions/00dab.c",
        functionName: "FUN_00dabbc8",
        line: "515",
        instanceIndex: "1",
        hookPattern: "native-visual-binding",
        aliasStatus: "",
        aliasEvidenceStrength: "",
        resourcePaths: "Effects/Adagio/S1/Adagio__S1__Ult_Cast.assetbundle/Adagio__S1__Ult_Cast.pfx",
        buffTokens: "",
        nativeSemanticCalls: "native-effect-only",
        sourceKind: "native-visual-binding",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    { timelineRows: [] },
  );

  assert.deepEqual(manifest.items[0].nativeTimelineTimes, []);
  assert.equal(manifest.items[0].runtimeBinding.startSeconds, 0);
  assert.equal(reportRowsForManifest(manifest)[0].runtimeStartSeconds, 0);
});

test("buildEffectHookRuntimeManifest treats native visual bone bindings without timeline as immediate", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_Lance_Empowered_AA_Available",
        bindKind: "visual-bone-effect",
        boneToken: "Bone_Weapon",
        effectToken: "Effect_Lance_Empowered_AA_Available",
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        sourceFile: "functions/lance.c",
        functionName: "FUN_LANCE_VISUAL",
        line: "50",
        instanceIndex: "1",
        hookPattern: "native-visual-binding-candidate",
        sourceKind: "native-visual-binding",
        actionKeys: ["attack"],
        resourcePaths: "Effects/Hero028/Hero028_Empowered_AA/Hero028_Empowered_AA.pfx",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    { timelineRows: [] },
  );

  const item = manifest.items[0];
  assert.equal(item.runtimeBinding.kind, "bone");
  assert.equal(item.runtimeBinding.startSeconds, 0);
  assert.deepEqual(item.runtimeBinding.timelineTimes, []);
});

test("buildEffectHookRuntimeManifest backfills missing pfx resources from full effect indexes", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
        hash: "LANCE_WEAPON",
      },
    ],
    heroNameRows: [{ hero: "Lance", kind: "Effect", name: "A_Weapon" }],
    definitionRows: [
      {
        manifestLabel: "*Lance*",
        targetRelativePath: "Characters/Hero028/Lance.def",
        childResourceRows: "10",
        skeletonSamples: "Characters/Hero028/Art/hero028.skeleton",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        ...bindingRows[0],
        token: "Effect_Lance_A_Weapon",
        effectToken: "Effect_Lance_A_Weapon",
        resourcePaths: "",
        aliasStatus: "definition-bridged",
        aliasEvidenceStrength: "definition-token",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    { resourceResolver: resolver },
  );

  assert.deepEqual(manifest.items[0].resourcePaths, ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"]);
  assert.equal(manifest.items[0].aliasEvidenceStrength, "strong");
  assert.equal(manifest.items[0].resourceEvidenceSource, "effect-resource-hero-alias");
  assert.equal(manifest.summary.resourceBoundRows, 1);
});

test("buildEffectResourceResolver resolves buff-gated native effects through matching pfx hook tokens and right-side bones", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: "Effects/Hero024/Hero024_Thruster/Hero024_Thruster.pfx" },
      { relativePath: "Effects/Hero024/Hero024_Thruster_R/Hero024_Thruster_R.pfx" },
      { relativePath: "Effects/Hero024/Hero024_Thruster_Shutdown/Hero024_Thruster_Shutdown.pfx" },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero024/Hero024_Thruster/Hero024_Thruster.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster",
      },
      {
        relativePath: "Effects/Hero024/Hero024_Thruster_R/Hero024_Thruster_R.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster_R",
      },
      {
        relativePath: "Effects/Hero024/Hero024_Thruster_Shutdown/Hero024_Thruster_Shutdown.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster_Shutdown",
      },
    ],
    heroNameRows: [{ hero: "Alpha", kind: "Effect", name: "String" }],
    definitionRows: [
      {
        manifestLabel: "*Alpha*",
        targetRelativePath: "Characters/Hero024/Alpha.def",
        skeletonSamples: "Characters/Hero024/Art/hero024.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Alpha_String", {
    effectToken: "Effect_Alpha_String",
    heroNames: ["Alpha"],
    heroResourceRoots: ["Hero024"],
    buffTokens: ["Buff_Alpha_ThrusterPfx"],
    boneToken: "Bone_RightHand",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero024/Hero024_Thruster_R/Hero024_Thruster_R.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "native-buff-pfx-hook-resource");
  assert.equal(resolved.resourceMatchKind, "native-buff-pfx-hook-semantic");
});

test("buildEffectResourceResolver resolves buff-gated native effects through matching pfx hook tokens and unsided left bones", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: "Effects/Hero024/Hero024_Thruster/Hero024_Thruster.pfx" },
      { relativePath: "Effects/Hero024/Hero024_Thruster_R/Hero024_Thruster_R.pfx" },
      { relativePath: "Effects/Hero024/Hero024_Thruster_Shutdown/Hero024_Thruster_Shutdown.pfx" },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero024/Hero024_Thruster/Hero024_Thruster.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster",
      },
      {
        relativePath: "Effects/Hero024/Hero024_Thruster_R/Hero024_Thruster_R.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster_R",
      },
      {
        relativePath: "Effects/Hero024/Hero024_Thruster_Shutdown/Hero024_Thruster_Shutdown.pfx",
        hookEffectTokens: "Effect_Alpha_Thruster_Shutdown",
      },
    ],
    heroNameRows: [{ hero: "Alpha", kind: "Effect", name: "String" }],
    definitionRows: [
      {
        manifestLabel: "*Alpha*",
        targetRelativePath: "Characters/Hero024/Alpha.def",
        skeletonSamples: "Characters/Hero024/Art/hero024.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Alpha_String", {
    effectToken: "Effect_Alpha_String",
    heroNames: ["Alpha"],
    heroResourceRoots: ["Hero024"],
    buffTokens: ["Buff_Alpha_ThrusterPfx"],
    boneToken: "Bone_LeftHand",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero024/Hero024_Thruster/Hero024_Thruster.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "native-buff-pfx-hook-resource");
  assert.equal(resolved.resourceMatchKind, "native-buff-pfx-hook-semantic");
});

test("buildEffectResourceResolver narrows buff-gated pfx hooks by resource stem semantics", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: "Effects/Hero069/Hero069_Ability01_Attack/Hero069_Ability01_Attack.pfx" },
      { relativePath: "Effects/Hero069/Hero069_Ability01_Impact/Hero069_Ability01_Impact.pfx" },
      { relativePath: "Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx" },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero069/Hero069_Ability01_Attack/Hero069_Ability01_Attack.pfx",
        hookEffectTokens: "Effect_Amael_Ability01_Charge|Effect_Amael_Ability01_Charged",
      },
      {
        relativePath: "Effects/Hero069/Hero069_Ability01_Impact/Hero069_Ability01_Impact.pfx",
        hookEffectTokens: "Effect_Amael_Ability01_Charge|Effect_Amael_Ability01_Charged",
      },
      {
        relativePath: "Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx",
        hookEffectTokens: "Effect_Amael_Ability01_Charge|Effect_Amael_Ability01_Charged",
      },
    ],
    heroNameRows: [{ hero: "Amael", kind: "Effect", name: "Ability01_Charge" }],
    definitionRows: [
      {
        manifestLabel: "*Amael*",
        targetRelativePath: "Characters/Hero069/Amael.def",
        skeletonSamples: "Characters/Hero069/Art/hero069.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Amael_Ability01_Charge", {
    effectToken: "Effect_Amael_Ability01_Charge",
    heroNames: ["Amael"],
    heroResourceRoots: ["Hero069"],
    buffTokens: ["Buff_Amael_A_Charged"],
    boneToken: "Bone_RightHand",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "native-buff-pfx-hook-resource");
});

test("buildEffectResourceResolver resolves channel start pfx from exact channel end sibling evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Common/Recall/Recall_Channel.assetbundle/Recall_Channel.pfx",
        hash: "RECALL_CHANNEL",
      },
      {
        relativePath: "Effects/Common/Recall/Recall_Channel_End/Recall_Channel_End.pfx",
        hash: "RECALL_CHANNEL_END",
      },
      {
        relativePath: "Effects/Petal/FX/S1/Petal_S1_Recall/Petal_S1_Recall.pfx",
        hash: "PETAL_RECALL",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Common/Recall/Recall_Channel_End/Recall_Channel_End.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Teleport_Channel_End|Effect_Withdraw_Channel_End",
        hookEffectTokens: "Effect_Teleport_Channel_End|Effect_Withdraw_Channel_End",
      },
      {
        relativePath: "Effects/Common/Recall/Recall_Channel.assetbundle/Recall_Channel.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "",
        hookEffectTokens: "",
      },
      {
        relativePath: "Effects/Petal/FX/S1/Petal_S1_Recall/Petal_S1_Recall.pfx",
        hookEffectTokens: "Effect_Withdraw_Channel",
      },
    ],
  });

  const teleport = resolver("Effect_Teleport_Channel", {
    effectToken: "Effect_Teleport_Channel",
    bindKind: "effect-only",
  });
  const withdraw = resolver("Effect_Withdraw_Channel", {
    effectToken: "Effect_Withdraw_Channel",
    bindKind: "effect-only",
  });

  assert.deepEqual(teleport.resourcePaths, ["Effects/Common/Recall/Recall_Channel.assetbundle/Recall_Channel.pfx"]);
  assert.equal(teleport.aliasEvidenceStrength, "confirmed");
  assert.equal(teleport.resourceEvidenceSource, "effect-pfx-hook-token-sibling");
  assert.equal(teleport.resourceMatchKind, "unique-pfx-hook-effect-token-channel-sibling");
  assert.deepEqual(withdraw.resourcePaths, ["Effects/Petal/FX/S1/Petal_S1_Recall/Petal_S1_Recall.pfx"]);
  assert.equal(withdraw.resourceEvidenceSource, "effect-pfx-hook-token");
});

test("buildEffectResourceResolver resolves base pfx from exact alt sibling evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx",
        hash: "GHOSTWING_AA",
      },
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA_Alt/GhostWing_AA_Alt.pfx",
        hash: "GHOSTWING_AA_ALT",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA_Alt/GhostWing_AA_Alt.pfx",
        hookEffectTokens: "Effect_Ghostwing_Cleave_Alt",
      },
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx",
        hookEffectTokens: "",
      },
    ],
  });

  const cleave = resolver("Effect_Ghostwing_Cleave", {
    effectToken: "Effect_Ghostwing_Cleave",
    bindKind: "effect-only",
  });
  const alt = resolver("Effect_Ghostwing_Cleave_Alt", {
    effectToken: "Effect_Ghostwing_Cleave_Alt",
    bindKind: "effect-only",
  });

  assert.deepEqual(cleave.resourcePaths, ["Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx"]);
  assert.equal(cleave.aliasEvidenceStrength, "confirmed");
  assert.equal(cleave.resourceEvidenceSource, "effect-pfx-hook-token-alt-sibling");
  assert.equal(cleave.resourceMatchKind, "unique-pfx-hook-effect-token-alt-sibling");
  assert.deepEqual(alt.resourcePaths, ["Effects/Blackclaw/GhostWing_AA_Alt/GhostWing_AA_Alt.pfx"]);
  assert.equal(alt.resourceEvidenceSource, "effect-pfx-hook-token");
});

test("buildEffectResourceResolver uses hook effect tokens when intrinsic pfx tokens are blank", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx",
        hash: "GHOSTWING_AA",
      },
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA_Alt/GhostWing_AA_Alt.pfx",
        hash: "GHOSTWING_AA_ALT",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA_Alt/GhostWing_AA_Alt.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Ghostwing_Cleave_Alt",
        hookEffectTokens: "Effect_Ghostwing_Cleave_Alt",
      },
      {
        relativePath: "Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "",
        hookEffectTokens: "",
      },
    ],
  });

  const cleave = resolver("Effect_Ghostwing_Cleave", {
    effectToken: "Effect_Ghostwing_Cleave",
    bindKind: "effect-only",
  });

  assert.deepEqual(cleave.resourcePaths, ["Effects/Blackclaw/GhostWing_AA/GhostWing_AA.pfx"]);
  assert.equal(cleave.resourceEvidenceSource, "effect-pfx-hook-token-alt-sibling");
});

test("buildEffectResourceResolver preserves skin alias variants for direct pfx hook resources", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Ringo/S1/Ringo__S1__B_ArmAura.assetbundle/Ringo__S1__B_ArmAura.pfx",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Ringo/S1/Ringo__S1__B_ArmAura.assetbundle/Ringo__S1__B_ArmAura.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Ringo_Ability02_ArmAura",
        hookEffectTokens: "Effect_Ringo_Ability02_ArmAura",
      },
    ],
    heroNameRows: [{ hero: "Ringo", kind: "Effect", name: "Ability02_ArmAura" }],
    definitionRows: [
      {
        manifestLabel: "*Ringo*",
        targetRelativePath: "Characters/Ringo/Ringo.def",
        childResourceRows: "180",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Ringo_Skin_Shogun_T3",
        sourceEffectToken: "Effect_Ringo_Ability02_ArmAura",
        skinEffectToken: "Effect_Ringo__S1__B_ArmAura",
      },
    ],
  });

  const resolved = resolver("Effect_Ringo_Ability02_ArmAura", {
    effectToken: "Effect_Ringo_Ability02_ArmAura",
    bindKind: "bone-bound-effect",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Ringo/S1/Ringo__S1__B_ArmAura.assetbundle/Ringo__S1__B_ArmAura.pfx",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "effect-pfx-hook-token");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Ringo/S1/Ringo__S1__B_ArmAura.assetbundle/Ringo__S1__B_ArmAura.pfx",
      modelLabel: "Ringo_Skin_Shogun_T3",
      skinKind: "skin",
      heroLabel: "Ringo",
    },
  ]);
});

test("buildEffectResourceResolver resolves alt sibling pfx when the resource path uses different filename casing", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx",
        hash: "BLACKCLAW_AA",
      },
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA_Alt/Blackclaw_AA_Alt.pfx",
        hash: "BLACKCLAW_AA_ALT",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA_Alt/Blackclaw_AA_Alt.pfx",
        hookEffectTokens: "Effect_Blackclaw_Cleave_Alt",
      },
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx",
        hookEffectTokens: "",
      },
    ],
  });

  const cleave = resolver("Effect_Blackclaw_Cleave", {
    effectToken: "Effect_Blackclaw_Cleave",
    bindKind: "effect-only",
    actionKeys: ["attack"],
  });

  assert.deepEqual(cleave.resourcePaths, ["Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx"]);
  assert.equal(cleave.resourceEvidenceSource, "effect-pfx-hook-token-alt-sibling");
});

test("buildEffectResourceResolver resolves base pfx from exact enemy sibling evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero016/S1/Hero016_S1_C_GhostAA/Hero016_S1_C_GhostAA.pfx",
        hash: "RONA_GHOSTAA",
      },
      {
        relativePath: "Effects/Hero016/S1/Hero016_S1_C_GhostAA_Enemy/Hero016_S1_C_GhostAA_Enemy.pfx",
        hash: "RONA_GHOSTAA_ENEMY",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero016/S1/Hero016_S1_C_GhostAA_Enemy/Hero016_S1_C_GhostAA_Enemy.pfx",
        hookEffectTokens: "Effect_Rona_Whirlwind_Impact_Enemy",
      },
      {
        relativePath: "Effects/Hero016/S1/Hero016_S1_C_GhostAA/Hero016_S1_C_GhostAA.pfx",
        hookEffectTokens: "",
      },
    ],
  });

  const impact = resolver("Effect_Rona_Whirlwind_Impact", {
    effectToken: "Effect_Rona_Whirlwind_Impact",
    bindKind: "visual-bone-effect",
    actionKeys: ["ability03"],
  });
  const enemyImpact = resolver("Effect_Rona_Whirlwind_Impact_Enemy", {
    effectToken: "Effect_Rona_Whirlwind_Impact_Enemy",
    bindKind: "effect-only",
  });

  assert.deepEqual(impact.resourcePaths, ["Effects/Hero016/S1/Hero016_S1_C_GhostAA/Hero016_S1_C_GhostAA.pfx"]);
  assert.equal(impact.aliasEvidenceStrength, "confirmed");
  assert.equal(impact.resourceEvidenceSource, "effect-pfx-hook-token-suffix-sibling");
  assert.equal(impact.resourceMatchKind, "unique-pfx-hook-effect-token-suffix-sibling");
  assert.deepEqual(enemyImpact.resourcePaths, ["Effects/Hero016/S1/Hero016_S1_C_GhostAA_Enemy/Hero016_S1_C_GhostAA_Enemy.pfx"]);
  assert.equal(enemyImpact.resourceEvidenceSource, "effect-pfx-hook-token");
});

test("buildEffectResourceResolver resolves non-channel effects from singleton non-hero effect roots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Teleport/Teleport.pfx",
        hash: "TELEPORT",
      },
      {
        relativePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
        hash: "BLACKCLAW_BREATH",
      },
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx",
        hash: "BLACKCLAW_AA",
      },
    ],
  });

  const finish = resolver("Effect_Teleport_Finish", {
    effectToken: "Effect_Teleport_Finish",
    bindKind: "effect-only",
    heroNames: ["Teleport"],
  });
  const indicator = resolver("Effect_Teleport_StructureIndicator", {
    effectToken: "Effect_Teleport_StructureIndicator",
    bindKind: "visual-bone-effect",
    heroNames: ["Teleport"],
  });
  const channel = resolver("Effect_Teleport_Channel", {
    effectToken: "Effect_Teleport_Channel",
    bindKind: "effect-only",
    heroNames: ["Teleport"],
  });
  const blackclaw = resolver("Effect_Blackclaw_Cleave", {
    effectToken: "Effect_Blackclaw_Cleave",
    bindKind: "effect-only",
    heroNames: ["Blackclaw"],
  });

  assert.deepEqual(finish.resourcePaths, ["Effects/Teleport/Teleport.pfx"]);
  assert.equal(finish.resourceEvidenceSource, "effect-resource-singleton-root");
  assert.equal(finish.resourceMatchKind, "singleton-effect-root");
  assert.deepEqual(indicator.resourcePaths, ["Effects/Teleport/Teleport.pfx"]);
  assert.equal(channel, null);
  assert.equal(blackclaw, null);
});

test("buildEffectResourceResolver resolves unique item visual bone resources without promoting ambiguous item visuals", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/StormGuard/StormGuard_Aura.pfx",
        hash: "STORMGUARD_AURA",
      },
      {
        relativePath: "Effects/Items/AmbiguousRelic_Glow.assetbundle/AmbiguousRelic_Glow.pfx",
        hash: "AMBIGUOUS_RELIC_GLOW",
      },
      {
        relativePath: "Effects/Items/AmbiguousRelic_Aura.assetbundle/AmbiguousRelic_Aura.pfx",
        hash: "AMBIGUOUS_RELIC_AURA",
      },
    ],
  });

  const stormguard = resolver("Effect_StormGuard", {
    effectToken: "Effect_StormGuard",
    sourceKind: "native-visual-binding",
    bindKind: "visual-bone-effect",
    boneToken: "Bone_LeftHand",
  });
  const ambiguous = resolver("Effect_AmbiguousRelic", {
    effectToken: "Effect_AmbiguousRelic",
    sourceKind: "native-visual-binding",
    bindKind: "visual-bone-effect",
    boneToken: "Bone_RightHand",
  });

  assert.deepEqual(stormguard.resourcePaths, ["Effects/Items/StormGuard/StormGuard_Aura.pfx"]);
  assert.equal(stormguard.aliasEvidenceStrength, "strong");
  assert.equal(stormguard.resourceEvidenceSource, "effect-resource-item-visual");
  assert.equal(stormguard.resourceMatchKind, "unique-item-visual-bone-resource");
  assert.equal(ambiguous, null);
});

test("buildEffectResourceResolver resolves base item visual resources from proc PFX hook siblings", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/Tension_Bow.assetbundle/Tension_Bow.pfx",
        hash: "TENSION_BOW",
      },
      {
        relativePath: "Effects/Items/Tension_Bow_Proc.assetbundle/Tension_Bow_Proc.pfx",
        hash: "TENSION_BOW_PROC",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Items/Tension_Bow_Proc.assetbundle/Tension_Bow_Proc.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Tension_Proc",
        hookEffectTokens: "Effect_Tension_Proc",
      },
    ],
  });

  const tension = resolver("Effect_Tension", {
    effectToken: "Effect_Tension",
    sourceKind: "native-visual-binding",
    bindKind: "visual-bone-effect",
    boneToken: "Bone_LeftHand",
  });

  assert.deepEqual(tension.resourcePaths, ["Effects/Items/Tension_Bow.assetbundle/Tension_Bow.pfx"]);
  assert.equal(tension.aliasEvidenceStrength, "strong");
  assert.equal(tension.resourceEvidenceSource, "effect-pfx-linked-hook-token-proc-sibling");
  assert.equal(tension.resourceMatchKind, "linked-pfx-hook-effect-token-proc-sibling");
});

test("buildEffectResourceResolver resolves global effect-channel resources only when path terms cover the token", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Sayoc/Sayoc_MortalWound_1.assetbundle/Sayoc_MortalWound_1.pfx",
        hash: "MORTAL_WOUND",
      },
      {
        relativePath: "Effects/Minions/Heal/JMinion_Heal_BuffProj.assetbundle/JMinion_Heal_BuffProj.pfx",
        hash: "ARMORY_MINION_BUFF_CANDIDATE",
      },
      {
        relativePath: "Effects/Kraken/Shell_Glow.assetbundle/Shell_Glow.pfx",
        hash: "SHELL_GLOW",
      },
      {
        relativePath: "Effects/SAW/SAW_ShellCasing.assetbundle/SAW_ShellCasing.pfx",
        hash: "SAW_SHELL_CASING",
      },
    ],
  });

  const mortalWound = resolver("Effect_MortalWound", {
    effectToken: "Effect_MortalWound",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
  });
  const armoryMinionBuff = resolver("Effect_ArmoryMinionBuff", {
    effectToken: "Effect_ArmoryMinionBuff",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
  });
  const shell = resolver("Effect_Shell", {
    effectToken: "Effect_Shell",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
  });

  assert.deepEqual(mortalWound.resourcePaths, ["Effects/Sayoc/Sayoc_MortalWound_1.assetbundle/Sayoc_MortalWound_1.pfx"]);
  assert.equal(mortalWound.aliasEvidenceStrength, "strong");
  assert.equal(mortalWound.resourceEvidenceSource, "effect-resource-global-terms");
  assert.equal(mortalWound.resourceMatchKind, "unique-global-effect-term-resource");
  assert.equal(armoryMinionBuff, null);
  assert.equal(shell, null);
});

test("buildEffectResourceResolver narrows generic global candidates through exact native nearby effect tokens", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/5V5/Turret/Turret_Death/Turret_Death.pfx",
        hash: "TURRET_DEATH",
      },
      {
        relativePath: "Effects/Hero010/Hero010_DeathPuff.assetbundle/Hero010_DeathPuff.pfx",
        hash: "SKAARF_DEATHPUFF",
      },
      {
        relativePath: "Effects/Hero018/Hero018_Death.assetbundle/Hero018_Death.pfx",
        hash: "SKYE_DEATH",
      },
      {
        relativePath: "Effects/SAW/SAW_ShellCasing.assetbundle/SAW_ShellCasing.pfx",
        hash: "SAW_SHELL_CASING",
      },
      {
        relativePath: "Effects/Status/Status_Stun.assetbundle/Status_Stun.pfx",
        hash: "STATUS_STUN",
      },
    ],
  });

  const death = resolver("Effect_Death", {
    effectToken: "Effect_Death",
    sourceKind: "native-effect-spawn",
    bindKind: "effect-only",
    nativeNearbyEffectTokens: ["Effect_Hero010_DeathPuff"],
  });
  assert.deepEqual(death.resourcePaths, ["Effects/Hero010/Hero010_DeathPuff.assetbundle/Hero010_DeathPuff.pfx"]);
  assert.equal(death.aliasEvidenceStrength, "strong");
  assert.equal(death.resourceEvidenceSource, "native-nearby-effect-resource");
  assert.equal(death.resourceMatchKind, "native-nearby-effect-exact-global-candidate");

  const shell = resolver("Effect_Shell", {
    effectToken: "Effect_Shell",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
    nativeNearbyEffectTokens: ["Effect_Stunned_buff"],
  });
  assert.equal(shell, null);
});

test("buildEffectResourceResolver narrows generic global candidates through unique native nearby term resources", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/AtlasPauldren.assetbundle/AtlastPauldren.pfx",
        hash: "ATLAS_PAULDREN",
      },
      {
        relativePath: "Effects/Items/AtlasPauldron_Buildup.assetbundle/AtlasPauldron_Buildup.pfx",
        hash: "ATLAS_BUILDUP",
      },
      {
        relativePath: "Effects/Status/Status_Stun.assetbundle/Status_Stun.pfx",
        hash: "STATUS_STUN",
      },
    ],
  });

  const atlas = resolver("Effect_Atlas", {
    effectToken: "Effect_Atlas",
    sourceKind: "native-effect-spawn",
    bindKind: "effect-only",
    nativeNearbyEffectTokens: ["Effect_Atlas_Buildup"],
  });

  assert.deepEqual(atlas.resourcePaths, ["Effects/Items/AtlasPauldron_Buildup.assetbundle/AtlasPauldron_Buildup.pfx"]);
  assert.equal(atlas.aliasEvidenceStrength, "strong");
  assert.equal(atlas.resourceEvidenceSource, "native-nearby-effect-resource");
  assert.equal(atlas.resourceMatchKind, "native-nearby-effect-term-global-candidate");

  const shell = resolver("Effect_Shell", {
    effectToken: "Effect_Shell",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
    nativeNearbyEffectTokens: ["Effect_Stunned_buff"],
  });
  assert.equal(shell, null);
});

test("buildEffectResourceResolver resolves direct-locator global effect resources when path terms are unique", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Sayoc/Sayoc_MortalWound_1.assetbundle/Sayoc_MortalWound_1.pfx",
        hash: "MORTAL_WOUND",
      },
      {
        relativePath: "Effects/SAW/SAW_ShellCasing.assetbundle/SAW_ShellCasing.pfx",
        hash: "SAW_SHELL_CASING",
      },
    ],
  });

  const mortalWound = resolver("Effect_MortalWound", {
    effectToken: "Effect_MortalWound",
    sourceKind: "native-effect-vcall",
    bindKind: "direct-locator-effect",
    boneToken: "OverHead",
  });
  const shell = resolver("Effect_Shell", {
    effectToken: "Effect_Shell",
    sourceKind: "native-effect-vcall",
    bindKind: "direct-locator-effect",
    boneToken: "OverHead",
  });

  assert.deepEqual(mortalWound.resourcePaths, ["Effects/Sayoc/Sayoc_MortalWound_1.assetbundle/Sayoc_MortalWound_1.pfx"]);
  assert.equal(mortalWound.aliasEvidenceStrength, "strong");
  assert.equal(mortalWound.resourceEvidenceSource, "effect-resource-global-terms");
  assert.equal(mortalWound.resourceMatchKind, "unique-global-effect-term-resource");
  assert.equal(shell, null);
});

test("buildEffectResourceResolver resolves 5v5 map entity resources by mode suffix and semantic aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/5V5/Turret/Turret_MF/Turret_MF.pfx",
        hash: "TURRET_MF",
      },
      {
        relativePath: "Effects/5V5/Turret/Turret_Spotlight/Turret_Spotlight.pfx",
        hash: "TURRET_SPOTLIGHT",
      },
      {
        relativePath: "Effects/5V5/Turret/Turret_Death/Turret_Death.pfx",
        hash: "TURRET_DEATH",
      },
      {
        relativePath: "Effects/5V5/Turret/Turret_Death_Explosion/Turret_Death_Explosion.pfx",
        hash: "TURRET_DEATH_EXPLOSION",
      },
    ],
  });

  const muzzleFlare = resolver("Effect_TurretMuzzleFlare_5v5", {
    effectToken: "Effect_TurretMuzzleFlare_5v5",
    bindKind: "effect-only",
    heroNames: ["Turret", "TurretMuzzleFlare"],
  });
  const spotlight = resolver("Effect_TurretSpotlight_5v5", {
    effectToken: "Effect_TurretSpotlight_5v5",
    bindKind: "effect-only",
    heroNames: ["Turret", "TurretSpotlight"],
  });
  const deathExplosion = resolver("Effect_Turret_Death_Explosion_5v5", {
    effectToken: "Effect_Turret_Death_Explosion_5v5",
    bindKind: "effect-only",
    heroNames: ["Turret"],
  });
  const nonModeToken = resolver("Effect_TurretMuzzleFlare", {
    effectToken: "Effect_TurretMuzzleFlare",
    bindKind: "effect-only",
    heroNames: ["TurretMuzzleFlare"],
  });

  assert.deepEqual(muzzleFlare.resourcePaths, ["Effects/5V5/Turret/Turret_MF/Turret_MF.pfx"]);
  assert.equal(muzzleFlare.resourceEvidenceSource, "effect-resource-5v5-entity");
  assert.equal(muzzleFlare.resourceMatchKind, "map-mode-5v5-entity-semantic");
  assert.deepEqual(spotlight.resourcePaths, ["Effects/5V5/Turret/Turret_Spotlight/Turret_Spotlight.pfx"]);
  assert.deepEqual(deathExplosion.resourcePaths, ["Effects/5V5/Turret/Turret_Death_Explosion/Turret_Death_Explosion.pfx"]);
  assert.equal(nonModeToken, null);
});

test("buildEffectResourceResolver resolves default attack impact resources that are named Attack1", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Kraken/Kraken_Attack_Impact.assetbundle/Kraken_Attack1_Impact.pfx",
        hash: "KRAKEN_ATTACK1_IMPACT",
      },
      {
        relativePath: "Effects/Kraken/Kraken_Attack2_Impact.assetbundle/Kraken_Attack2_Impact.pfx",
        hash: "KRAKEN_ATTACK2_IMPACT",
      },
    ],
  });

  const normalImpact = resolver("Effect_Kraken_Attack_Impact", {
    effectToken: "Effect_Kraken_Attack_Impact",
    bindKind: "effect-only",
    actionKeys: ["attack"],
  });
  const modeImpact = resolver("Effect_Kraken_Attack_Impact_5v5", {
    effectToken: "Effect_Kraken_Attack_Impact_5v5",
    bindKind: "effect-only",
    actionKeys: ["attack"],
    selectorOutputRole: "impact",
  });
  const projectile = resolver("Effect_Kraken_Attack_Projectile_5v5", {
    effectToken: "Effect_Kraken_Attack_Projectile_5v5",
    bindKind: "effect-only",
    actionKeys: ["attack"],
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(normalImpact.resourcePaths, ["Effects/Kraken/Kraken_Attack_Impact.assetbundle/Kraken_Attack1_Impact.pfx"]);
  assert.equal(normalImpact.resourceEvidenceSource, "effect-resource-attack1-alias");
  assert.equal(normalImpact.resourceMatchKind, "default-attack1-impact-alias");
  assert.deepEqual(modeImpact.resourcePaths, ["Effects/Kraken/Kraken_Attack_Impact.assetbundle/Kraken_Attack1_Impact.pfx"]);
  assert.equal(projectile, null);
});

test("buildEffectResourceResolver resolves non-hero cleave attack effects to AA resources from native action keys", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx",
        hash: "BLACKCLAW_AA",
      },
      {
        relativePath: "Effects/Blackclaw/Blackclaw_AA_Alt/Blackclaw_AA_Alt.pfx",
        hash: "BLACKCLAW_AA_ALT",
      },
      {
        relativePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
        hash: "BLACKCLAW_BREATH",
      },
    ],
  });

  const attack = resolver("Effect_Blackclaw_Cleave", {
    effectToken: "Effect_Blackclaw_Cleave",
    actionKeys: ["attack"],
  });
  const ability = resolver("Effect_Blackclaw_Cleave", {
    effectToken: "Effect_Blackclaw_Cleave",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(attack.resourcePaths, ["Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx"]);
  assert.equal(attack.resourceEvidenceSource, "native-action-aa-resource");
  assert.equal(attack.resourceMatchKind, "native-action-aa-alias");
  assert.equal(ability, null);
});

test("buildEffectResourceResolver resolves native attack hooks through KindredEffects AA slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Catherine", kind: "Effect", name: "Attack_HitImpact" },
      { hero: "Catherine", kind: "Effect", name: "AssassinsChargeHit" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Catherine*",
        targetRelativePath: "Characters/Catherine/Catherine.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Catherine/Art/catherine.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_AA",
        resourcePath: "Effects/Catherine/Catherine_AA/Catherine_AA.pfx",
      },
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_AA_Alt",
        resourcePath: "Effects/Catherine/Catherine_AA_Alt/Catherine_AA_Alt.pfx",
      },
      {
        modelLabel: "Catherine_ICE",
        heroLabel: "Catherine",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine__ICE__AA",
        resourcePath: "Effects/Catherine/ICE/Catherine__ICE__AA.assetbundle/Catherine__ICE__AA.pfx",
      },
      {
        modelLabel: "Catherine_ICE",
        heroLabel: "Catherine",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine__ICE__AA_Alt",
        resourcePath: "Effects/Catherine/ICE/Catherine__ICE__AA_Alt.assetbundle/Catherine__ICE__AA_Alt.pfx",
      },
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_A_Impact",
        resourcePath: "Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.pfx",
      },
    ],
  });

  const normal = resolver("Effect_Catherine_Attack_HitImpact", {
    effectToken: "Effect_Catherine_Attack_HitImpact",
    actionKeys: ["attack"],
  });
  const alt = resolver("Effect_Catherine_Attack_HitImpact", {
    effectToken: "Effect_Catherine_Attack_HitImpact",
    actionKeys: ["attack_alt", "attack"],
  });
  const assassin = resolver("Effect_Catherine_AssassinsChargeHit", {
    effectToken: "Effect_Catherine_AssassinsChargeHit",
    actionKeys: ["attack"],
  });

  assert.deepEqual(normal.resourcePaths, [
    "Effects/Catherine/Catherine_AA/Catherine_AA.pfx",
    "Effects/Catherine/ICE/Catherine__ICE__AA.assetbundle/Catherine__ICE__AA.pfx",
  ]);
  assert.equal(normal.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(normal.resourceMatchKind, "kindred-effect-slot-native-action-aa");
  assert.deepEqual(alt.resourcePaths, [
    "Effects/Catherine/Catherine_AA_Alt/Catherine_AA_Alt.pfx",
    "Effects/Catherine/ICE/Catherine__ICE__AA_Alt.assetbundle/Catherine__ICE__AA_Alt.pfx",
  ]);
  assert.equal(alt.resourceMatchKind, "kindred-effect-slot-native-action-aa");
  assert.deepEqual(assassin.resourcePaths, []);
});

test("buildEffectHookRuntimeManifest resolves path identifier effects through native path variables", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero030/Hero030_Path_Crys/Hero030_Path_Crys.pfx",
        hash: "IDRIS_CRYSTAL_PATH",
      },
      {
        relativePath: "Effects/Hero030/Hero030_Path_Weap/Hero030_Path_Weap.pfx",
        hash: "IDRIS_WEAPON_PATH",
      },
    ],
    heroNameRows: [
      { hero: "Idris", kind: "Effect", name: "CrystalPathIdentifier" },
      { hero: "Idris", kind: "Effect", name: "WeaponPathIdentifier" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Idris*",
        targetRelativePath: "Characters/Hero030/Idris.def",
        childResourceRows: "340",
        skeletonSamples: "Characters/Hero030/Art/hero030.skeleton",
      },
    ],
    visualBindingRows: [
      {
        functionName: "FUN_idris",
        stringSamples: "Bone_Back|Effect_Idris_CrystalPathIdentifier|u_Crystal_Path",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        ...bindingRows[0],
        token: "Effect_Idris_WeaponPathIdentifier",
        effectToken: "Effect_Idris_CrystalPathIdentifier",
        boneToken: "Bone_Back",
        resourcePaths: "",
        aliasStatus: "definition-bridged",
        aliasEvidenceStrength: "definition-token",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    { resourceResolver: resolver },
  );

  assert.deepEqual(manifest.items[0].heroCodes, ["Hero030"]);
  assert.deepEqual(manifest.items[0].resourcePaths, ["Effects/Hero030/Hero030_Path_Crys/Hero030_Path_Crys.pfx"]);
  assert.equal(manifest.items[0].resourceEvidenceSource, "native-path-variable-resource");
  assert.equal(manifest.items[0].resourceMatchKind, "hero-code-native-path-variable");
});

test("buildEffectResourceResolver uses native action gates for renamed ability projectiles", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero024/Hero024_A_Projectile/Hero024_A_Projectile.pfx",
        hash: "ALPHA_A_PROJECTILE",
      },
    ],
    heroNameRows: [
      { hero: "Alpha", kind: "Effect", name: "LeapProjectile" },
      { hero: "Alpha", kind: "Effect", name: "A_Projectile" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Alpha*",
        targetRelativePath: "Characters/Hero024/Alpha.def",
        childResourceRows: "266",
        skeletonSamples: "Characters/Hero024/Art/hero024.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Alpha_LeapProjectile", {
    effectToken: "Effect_Alpha_LeapProjectile",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero024/Hero024_A_Projectile/Hero024_A_Projectile.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "native-action-effect-alias-resource");
  assert.equal(resolved.resourceMatchKind, "hero-code-native-action-effect-alias");
});

test("buildEffectResourceResolver uses native attack action gates for default attack impact aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero064/Default/Hero064_DEF_AA_Impact/Hero064_DEF_AA_Impact.pfx",
        hash: "CAINE_AA_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "Caine", kind: "Effect", name: "DefaultAttack_Impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Caine*",
        targetRelativePath: "Characters/Hero064/Caine.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero064/Art/hero064.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Caine_DefaultAttack_Impact", {
    effectToken: "Effect_Caine_DefaultAttack_Impact",
    actionKeys: ["attack"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero064/Default/Hero064_DEF_AA_Impact/Hero064_DEF_AA_Impact.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "native-action-effect-alias-resource");
  assert.equal(resolved.resourceMatchKind, "hero-code-native-action-effect-alias");
});

test("buildEffectResourceResolver uses native action gates for bullet and bare attack shot aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero064/Default/Hero064_DEF_A_Shot/Hero064_DEF_A_Shot.pfx",
        hash: "CAINE_A_SHOT",
      },
      {
        relativePath: "Effects/Hero064/Default/Hero064_DEF_AA_Shot/Hero064_DEF_AA_Shot.pfx",
        hash: "CAINE_AA_SHOT",
      },
    ],
    heroNameRows: [
      { hero: "Caine", kind: "Effect", name: "A_Bullet" },
      { hero: "Caine", kind: "Effect", name: "DefaultAttack" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Caine*",
        targetRelativePath: "Characters/Hero064/Caine.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero064/Art/hero064.skeleton",
      },
    ],
  });

  const abilityShot = resolver("Effect_Caine_A_Bullet", {
    effectToken: "Effect_Caine_A_Bullet",
    actionKeys: ["ability01"],
  });
  assert.deepEqual(abilityShot.resourcePaths, ["Effects/Hero064/Default/Hero064_DEF_A_Shot/Hero064_DEF_A_Shot.pfx"]);
  assert.equal(abilityShot.aliasEvidenceStrength, "strong");
  assert.equal(abilityShot.resourceEvidenceSource, "native-action-effect-alias-resource");

  const attackShot = resolver("Effect_Caine_DefaultAttack", {
    effectToken: "Effect_Caine_DefaultAttack",
    actionKeys: ["attack"],
  });
  assert.deepEqual(attackShot.resourcePaths, ["Effects/Hero064/Default/Hero064_DEF_AA_Shot/Hero064_DEF_AA_Shot.pfx"]);
  assert.equal(attackShot.aliasEvidenceStrength, "strong");
  assert.equal(attackShot.resourceEvidenceSource, "native-action-effect-alias-resource");
});

test("buildEffectResourceResolver treats unique compact basename matches as confirmed resources", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/5V5/Turret/Turret_Spotlight/Turret_Spotlight.pfx",
        hash: "TURRET_SPOTLIGHT",
      },
    ],
  });

  const resolved = resolver("Effect_TurretSpotlight", {
    effectToken: "Effect_TurretSpotlight",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/5V5/Turret/Turret_Spotlight/Turret_Spotlight.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "confirmed");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-compact");
  assert.equal(resolved.resourceMatchKind, "compact-basename");
});

test("buildEffectResourceResolver resolves explicit minion native spawn resource aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Minions/Heal/JMinion_Heal_Attack.assetbundle/JMinion_Heal_Attack.pfx",
        hash: "JMINION_HEAL_ATTACK",
      },
      {
        relativePath: "Effects/Minions/Heal/JMinion_Heal_Attack2.assetbundle/JMinion_Heal_Attack2.pfx",
        hash: "JMINION_HEAL_ATTACK2",
      },
      {
        relativePath: "Effects/Minions/Heal/JMinion_Heal_Attack_Alt.assetbundle/JMinion_Heal_Attack_Alt.pfx",
        hash: "JMINION_HEAL_ATTACK_ALT",
      },
      {
        relativePath: "Effects/Common/Spawn/Spawn_L.assetbundle/Spawn_L.pfx",
        hash: "SPAWN_L",
      },
    ],
  });

  const firstHit = resolver("Effect_JMinionHeal_Attack_FirstHit", {
    effectToken: "Effect_JMinionHeal_Attack_FirstHit",
    sourceKind: "native-effect-spawn",
    heroNames: ["JMinionHeal"],
    actionKeys: ["attack"],
  });
  const secondHit = resolver("Effect_JMinionHeal_Attack_SecondHit", {
    effectToken: "Effect_JMinionHeal_Attack_SecondHit",
    sourceKind: "native-effect-spawn",
    heroNames: ["JMinionHeal"],
    actionKeys: ["attack"],
  });
  const spawnLeft = resolver("Effect_MinionSpawn_L", {
    effectToken: "Effect_MinionSpawn_L",
    sourceKind: "native-effect-spawn",
    heroNames: ["MinionSpawn"],
  });
  const attackAlt2 = resolver("Effect_JMinionHeal_Attack_Alt2", {
    effectToken: "Effect_JMinionHeal_Attack_Alt2",
    sourceKind: "native-effect-spawn",
    heroNames: ["JMinionHeal"],
    actionKeys: ["attack_alt", "attack"],
    nativeNearbyEffectTokens: ["Effect_JMinionHeal_Attack_Alt2", "Alt2Attack"],
  });

  assert.deepEqual(firstHit.resourcePaths, ["Effects/Minions/Heal/JMinion_Heal_Attack.assetbundle/JMinion_Heal_Attack.pfx"]);
  assert.equal(firstHit.resourceEvidenceSource, "native-minion-spawn-resource");
  assert.equal(firstHit.resourceMatchKind, "native-minion-spawn-explicit-alias");
  assert.deepEqual(secondHit.resourcePaths, ["Effects/Minions/Heal/JMinion_Heal_Attack2.assetbundle/JMinion_Heal_Attack2.pfx"]);
  assert.deepEqual(spawnLeft.resourcePaths, ["Effects/Common/Spawn/Spawn_L.assetbundle/Spawn_L.pfx"]);
  assert.deepEqual(attackAlt2.resourcePaths, [
    "Effects/Minions/Heal/JMinion_Heal_Attack_Alt.assetbundle/JMinion_Heal_Attack_Alt.pfx",
  ]);
});

test("buildEffectResourceResolver resolves explicit native status effect aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Status/Status_Silence.assetbundle/Status_Silence.pfx",
        hash: "STATUS_SILENCE",
      },
      {
        relativePath: "Effects/Status/Status_Stun.assetbundle/Status_Stun.pfx",
        hash: "STATUS_STUN",
      },
    ],
  });

  const itemSilence = resolver("Effect_ItemSilence", {
    effectToken: "Effect_ItemSilence",
    sourceKind: "native-visual-binding",
    boneToken: "OverHead",
  });
  const stunned = resolver("Effect_Stunned_buff", {
    effectToken: "Effect_Stunned_buff",
    sourceKind: "native-effect-vcall",
    boneToken: "OverHead",
    heroNames: ["Stunned"],
  });

  assert.deepEqual(itemSilence.resourcePaths, ["Effects/Status/Status_Silence.assetbundle/Status_Silence.pfx"]);
  assert.equal(itemSilence.resourceEvidenceSource, "native-status-effect-resource");
  assert.equal(itemSilence.resourceMatchKind, "native-status-effect-explicit-alias");
  assert.deepEqual(stunned.resourcePaths, ["Effects/Status/Status_Stun.assetbundle/Status_Stun.pfx"]);
  assert.equal(stunned.resourceEvidenceSource, "native-status-effect-resource");
});

test("buildEffectResourceResolver prefers unique PFX hook-token evidence before generic selector fallbacks", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero000/Hero000_Explosion_5MR/Hero000_Explosion_5mr.pfx",
        hash: "EXPLOSION",
      },
      {
        relativePath: "Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx",
        hash: "PROJ_HIT",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero000/Hero000_Explosion_5MR/Hero000_Explosion_5mr.pfx",
        hookEffectTokens: "Effect_Hero050_C_Explosion",
      },
    ],
    heroNameRows: [{ hero: "Hero050", kind: "Effect", name: "C_Explosion" }],
    definitionRows: [
      {
        manifestLabel: "*Hero050*",
        targetRelativePath: "Characters/Hero050/Hero050.def",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        role: "impact",
        resourcePath: "Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx",
        resourceStem: "Hero000_Proj_Hit",
        resourceRoot: "Hero000",
      },
    ],
  });

  const resolved = resolver("Effect_Hero050_C_Explosion", {
    heroNames: ["Hero050"],
    actionKeys: ["ability03"],
    selectorOutputRole: "impact",
  });

  assert.equal(resolved.resourceEvidenceSource, "effect-pfx-hook-token");
  assert.equal(resolved.resourceMatchKind, "unique-pfx-hook-effect-token");
  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero000/Hero000_Explosion_5MR/Hero000_Explosion_5mr.pfx"]);
});

test("buildEffectResourceResolver does not use runtime-linked PFX hook diagnostics as intrinsic evidence", () => {
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Test/RuntimeLinked/RuntimeLinked.pfx",
        intrinsicEffectTokens: "",
        hookEffectTokens: "Effect_Test_RuntimeLinked",
      },
      {
        relativePath: "Effects/Test/Intrinsic/Intrinsic.pfx",
        intrinsicEffectTokens: "Effect_Test_Intrinsic",
        hookEffectTokens: "",
      },
    ],
    heroNameRows: [],
    definitionRows: [],
  });

  assert.equal(resolver("Effect_Test_RuntimeLinked", {}), null);

  const intrinsic = resolver("Effect_Test_Intrinsic", {});
  assert.equal(intrinsic.resourceEvidenceSource, "effect-pfx-hook-token");
  assert.deepEqual(intrinsic.resourcePaths, ["Effects/Test/Intrinsic/Intrinsic.pfx"]);
});

test("buildEffectResourceResolver promotes source-skin default candidates confirmed by PFX hook token", () => {
  const defaultPath = "Effects/Hero023/Hero023_Stealthing.assetbundle/Hero_023_Stealthing.pfx";
  const forestPath = "Effects/Hero023/FOREST/Hero023_FOREST_Stealthing/Hero023_FOREST_Stealthing.pfx";
  const summerStealthedPath = "Effects/Hero023/S1/Hero023_S1_Stealthed/Hero023_S1_Stealthed.pfx";
  const summerStealthingPath = "Effects/Hero023/S1/Hero023_S1_Stealthing/Hero023_S1_Stealthing.pfx";
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: defaultPath },
      { relativePath: forestPath },
      { relativePath: summerStealthedPath },
      { relativePath: summerStealthingPath },
    ],
    pfxResourceRows: [
      {
        relativePath: defaultPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_Stealth_out",
        hookEffectTokens: "Effect_Kestrel_Stealth_out",
      },
      {
        relativePath: forestPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthing",
        hookEffectTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthing",
      },
      {
        relativePath: summerStealthedPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthed",
        hookEffectTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthed",
      },
      {
        relativePath: summerStealthingPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthing",
        hookEffectTokens: "Effect_Kestrel_Stealth_out|Effect_Kestrel_Stealthing",
      },
    ],
    heroNameRows: [{ hero: "Kestrel", kind: "Effect", name: "Stealth_out" }],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero_023_Stealthing",
        resourcePath: defaultPath,
      },
      {
        modelLabel: "Kestrel_Skin_Forest",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_FOREST_Stealthing",
        resourcePath: forestPath,
      },
      {
        modelLabel: "Kestrel_Skin_Summer",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_S1_Stealthed",
        resourcePath: summerStealthedPath,
      },
      {
        modelLabel: "Kestrel_Skin_Summer",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_S1_Stealthing",
        resourcePath: summerStealthingPath,
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Kestrel_Skin_Forest",
        sourceEffectToken: "Effect_Kestrel_Stealth_out",
        skinEffectToken: "Effect_Kestrel_FOREST_Stealth_out",
      },
      {
        modelLabel: "Kestrel_Skin_Summer",
        sourceEffectToken: "Effect_Kestrel_Stealth_out",
        skinEffectToken: "Effect_Kestrel_S1_Stealth_out",
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_Stealth_out", {
    effectToken: "Effect_Kestrel_Stealth_out",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, [defaultPath]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "effect-pfx-hook-token-confirmed-candidate");
  assert.equal(resolved.resourceMatchKind, "cff0-source-effect-alias-default-pfx-hook-token");
});

test("buildEffectResourceResolver keeps multiple PFX-confirmed source-skin default candidates weak", () => {
  const impactPath = "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx";
  const stunPath = "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx";
  const skinPath = "Effects/Adagio/Skin/Adagio_Skin_ProjectileImpact/Adagio_Skin_ProjectileImpact.pfx";
  const resolver = buildEffectResourceResolver({
    effectRows: [{ relativePath: impactPath }, { relativePath: stunPath }, { relativePath: skinPath }],
    pfxResourceRows: [
      {
        relativePath: impactPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_AdagioFortunesSmile_impact",
        hookEffectTokens: "Effect_AdagioFortunesSmile_impact",
      },
      {
        relativePath: stunPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_AdagioFortunesSmile_impact",
        hookEffectTokens: "Effect_AdagioFortunesSmile_impact",
      },
    ],
    heroNameRows: [{ hero: "AdagioFortunesSmile", kind: "Effect", name: "impact" }],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_ProjectileImpact",
        resourcePath: impactPath,
      },
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_Stun_Impact",
        resourcePath: stunPath,
      },
      {
        modelLabel: "Adagio_Skin_Paragon",
        heroLabel: "Adagio",
        skinKind: "skin",
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_Skin_ProjectileImpact",
        resourcePath: skinPath,
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Adagio_Skin_Paragon",
        sourceEffectToken: "Effect_AdagioFortunesSmile_impact",
        skinEffectToken: "Effect_Adagio_Skin_FortunesSmile_impact",
      },
    ],
  });

  const resolved = resolver("Effect_AdagioFortunesSmile_impact", {
    effectToken: "Effect_AdagioFortunesSmile_impact",
    actionKeys: ["ability01"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, [impactPath, stunPath]);
  assert.equal(resolved.aliasEvidenceStrength, "weak");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-candidate");
});

test("buildEffectResourceResolver maps linked PFX hook-token variant sets with one resource per model", () => {
  const forestPath = "Effects/Hero023/FOREST/Hero023_FOREST_C_Shot_Burst/Hero023_FOREST_C_Shot_Burst.pfx";
  const defaultPath = "Effects/Hero023/Hero023_C_Shot_Burst.assetbundle/Hero023_C_Shot_Burst.pfx";
  const summerPath = "Effects/Hero023/S1/Hero023_S1_C_Shot_Burst/Hero023_S1_C_Shot_Burst.pfx";
  const drowPath = "Effects/Hero023/S3/Hero023_S3_C_Shot_Burst/Hero023_S3_C_Shot_Burst.pfx";
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: forestPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
        hookEffectTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
      },
      {
        relativePath: defaultPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_HalcyonArrowImpact",
        hookEffectTokens: "Effect_Kestrel_HalcyonArrowImpact",
      },
      {
        relativePath: summerPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
        hookEffectTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
      },
      {
        relativePath: drowPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
        hookEffectTokens: "Effect_Kestrel_C_Shot_Burst|Effect_Kestrel_HalcyonArrowImpact",
      },
    ],
    heroNameRows: [{ hero: "Kestrel", kind: "Effect", name: "HalcyonArrowImpact" }],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kestrel_Skin_Forest",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "projectile",
        actionKeys: ["ability03"],
        resourceRoot: "Hero023",
        resourceStem: "Hero023_FOREST_C_Shot_Burst",
        resourcePath: forestPath,
      },
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        role: "projectile",
        actionKeys: ["ability03"],
        resourceRoot: "Hero023",
        resourceStem: "Hero023_C_Shot_Burst",
        resourcePath: defaultPath,
      },
      {
        modelLabel: "Kestrel_Skin_Summer",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "projectile",
        actionKeys: ["ability03"],
        resourceRoot: "Hero023",
        resourceStem: "Hero023_S1_C_Shot_Burst",
        resourcePath: summerPath,
      },
      {
        modelLabel: "Kestrel_Skin_Drow",
        heroLabel: "Kestrel",
        skinKind: "skin",
        role: "projectile",
        actionKeys: ["ability03"],
        resourceRoot: "Hero023",
        resourceStem: "Hero023_S3_C_Shot_Burst",
        resourcePath: drowPath,
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_HalcyonArrowImpact", {
    effectToken: "Effect_Kestrel_HalcyonArrowImpact",
    heroNames: ["Kestrel"],
    heroResourceRoots: ["Hero023"],
    actionKeys: ["ability01"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, [forestPath, defaultPath, summerPath, drowPath]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "effect-pfx-hook-token-variant-set");
  assert.equal(resolved.resourceMatchKind, "linked-pfx-hook-token-variant-set");
});

test("buildEffectResourceResolver does not map linked PFX hook-token rows when one model has multiple resources", () => {
  const aImpactPath = "Effects/Hero071/Defaults/Hero071_A_Impact/Hero071_A_Impact.pfx";
  const basicImpactPath = "Effects/Hero071/Defaults/Hero071_BasicAttack_Impact/Hero071_BasicAttack_Impact.pfx";
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: aImpactPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Karas_A_Impact|Effect_Karas_C_Impact",
        hookEffectTokens: "Effect_Karas_A_Impact|Effect_Karas_C_Impact",
      },
      {
        relativePath: basicImpactPath,
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Karas_BasicAttack_Impact|Effect_Karas_C_Impact",
        hookEffectTokens: "Effect_Karas_BasicAttack_Impact|Effect_Karas_C_Impact",
      },
    ],
    heroNameRows: [{ hero: "Karas", kind: "Effect", name: "C_Impact" }],
    definitionRows: [
      {
        manifestLabel: "*Karas*",
        targetRelativePath: "Characters/Hero071/Karas.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero071/Art/hero071.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Karas_DefaultSkin",
        heroLabel: "Karas",
        skinKind: "default",
        role: "impact",
        actionKeys: ["ability01"],
        resourceRoot: "Hero071",
        resourceStem: "Hero071_A_Impact",
        resourcePath: aImpactPath,
      },
      {
        modelLabel: "Karas_DefaultSkin",
        heroLabel: "Karas",
        skinKind: "default",
        role: "impact",
        actionKeys: ["attack"],
        resourceRoot: "Hero071",
        resourceStem: "Hero071_BasicAttack_Impact",
        resourcePath: basicImpactPath,
      },
    ],
  });

  const resolved = resolver("Effect_Karas_C_Impact", {
    effectToken: "Effect_Karas_C_Impact",
    heroNames: ["Karas"],
    heroResourceRoots: ["Hero071"],
    actionKeys: ["ability03"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver maps selector outputs through unique PFX hook-token siblings", () => {
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Blackclaw_BreathProjectile",
        hookEffectTokens: "Effect_Blackclaw_BreathProjectile",
      },
      {
        relativePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
        intrinsicEffectTokens: "",
        hookTokens: "Effect_Blackclaw_BreathGround",
        hookEffectTokens: "Effect_Blackclaw_BreathGround",
      },
    ],
    heroNameRows: [
      { hero: "Blackclaw", kind: "Effect", name: "BreathImpact" },
      { hero: "Blackclaw", kind: "Effect", name: "BreathProjectile" },
      { hero: "Blackclaw", kind: "Effect", name: "BreathGround" },
    ],
  });

  const impact = resolver("Effect_Blackclaw_BreathImpact", {
    effectToken: "Effect_Blackclaw_BreathImpact",
    selectorOutputRole: "impact",
  });

  assert.deepEqual(impact.resourcePaths, ["Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx"]);
  assert.equal(impact.resourceEvidenceSource, "effect-pfx-hook-token-selector-sibling");
  assert.equal(impact.resourceMatchKind, "selector-output-pfx-hook-sibling");
});

test("buildEffectResourceResolver maps selector siblings without hero-name table coverage", () => {
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx",
        hookEffectTokens: "Effect_Blackclaw_BreathProjectile",
      },
      {
        relativePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
        hookEffectTokens: "Effect_Blackclaw_BreathGround",
      },
    ],
  });

  const impact = resolver("Effect_Blackclaw_BreathImpact", {
    effectToken: "Effect_Blackclaw_BreathImpact",
    selectorOutputRole: "impact",
  });

  assert.deepEqual(impact.resourcePaths, ["Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx"]);
  assert.equal(impact.resourceEvidenceSource, "effect-pfx-hook-token-selector-sibling");
  assert.equal(impact.resourceMatchKind, "selector-output-pfx-hook-sibling");
});

test("buildEffectResourceResolver resolves item enemy ring pfx from paired projectile side evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_A/Flare_Proj_A.pfx",
        hash: "FLARE_PROJ_A",
      },
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        hash: "FLARE_PROJ_E",
      },
      {
        relativePath: "Effects/Items/Flare_Ring_A/Flare_Ring_A.pfx",
        hash: "FLARE_RING_A",
      },
      {
        relativePath: "Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx",
        hash: "FLARE_RING_E",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_A/Flare_Proj_A.pfx",
        hookEffectTokens: "Effect_Flare_Proj_A",
      },
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        hookEffectTokens: "Effect_Flare_Proj_E",
      },
      {
        relativePath: "Effects/Items/Flare_Ring_A/Flare_Ring_A.pfx",
        hookEffectTokens: "",
      },
      {
        relativePath: "Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx",
        hookEffectTokens: "",
      },
    ],
  });

  const enemyRing = resolver("Effect_Flare_Ring_E", {
    effectToken: "Effect_Flare_Ring_E",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(enemyRing.resourcePaths, ["Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx"]);
  assert.equal(enemyRing.aliasEvidenceStrength, "confirmed");
  assert.equal(enemyRing.resourceEvidenceSource, "effect-pfx-hook-token-item-side-sibling");
  assert.equal(enemyRing.resourceMatchKind, "paired-item-side-ring-sibling");

  const incompleteResolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        hash: "FLARE_PROJ_E",
      },
      {
        relativePath: "Effects/Items/Flare_Ring_A/Flare_Ring_A.pfx",
        hash: "FLARE_RING_A",
      },
      {
        relativePath: "Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx",
        hash: "FLARE_RING_E",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        hookEffectTokens: "Effect_Flare_Proj_E",
      },
    ],
  });

  assert.equal(
    incompleteResolver("Effect_Flare_Ring_E", {
      effectToken: "Effect_Flare_Ring_E",
      actionKeys: ["ability01"],
    }),
    null,
  );
});

test("buildEffectResourceResolver resolves item enemy ring pfx from paired resource side evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_A/Flare_Proj_A.pfx",
        hash: "FLARE_PROJ_A",
      },
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        hash: "FLARE_PROJ_E",
      },
      {
        relativePath: "Effects/Items/Flare_Ring_A/Flare_Ring_A.pfx",
        hash: "FLARE_RING_A",
      },
      {
        relativePath: "Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx",
        hash: "FLARE_RING_E",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Items/Flare_Proj_A/Flare_Proj_A.pfx",
        intrinsicEffectTokens: "",
        hookEffectTokens: "Effect_Flare_Proj_A",
      },
      {
        relativePath: "Effects/Items/Flare_Proj_E/Flare_Proj_E.pfx",
        intrinsicEffectTokens: "",
        hookEffectTokens: "Effect_Flare_Proj_E",
      },
    ],
  });

  const enemyRing = resolver("Effect_Flare_Ring_E", {
    effectToken: "Effect_Flare_Ring_E",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(enemyRing.resourcePaths, ["Effects/Items/Flare_Ring.assetbundle/Flare_Ring.pfx"]);
  assert.equal(enemyRing.aliasEvidenceStrength, "strong");
  assert.equal(enemyRing.resourceEvidenceSource, "effect-resource-item-side-ring-sibling");
  assert.equal(enemyRing.resourceMatchKind, "paired-item-side-ring-resource");
});

test("buildEffectResourceResolver maps hero effect tokens to exact Hero000 generic resources", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero000/Hero000_Ring_A_4mr/Hero000_Ring_A_4mr.pfx",
      },
      {
        relativePath: "Effects/Hero000/Hero000_Ring_Pull_A_4mr/Hero000_Ring_Pull_A_4mr.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Reza_Ring_A_4mr", {
    effectToken: "Effect_Reza_Ring_A_4mr",
    actionKeys: ["ability01"],
    heroNames: ["Reza"],
    heroResourceRoots: ["Hero041"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero000/Hero000_Ring_A_4mr/Hero000_Ring_A_4mr.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-hero000-generic");
  assert.equal(resolved.resourceMatchKind, "hero000-generic-exact-basename");
});

test("buildEffectResourceResolver resolves left/right PFX hook siblings from paired side resources", () => {
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_Torch/Hero070_Torch_L.pfx",
        hookEffectTokens: "",
      },
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_Torch/Hero070_Torch_R.pfx",
        hookEffectTokens: "Effect_Shin_Leg_R|Effect_Shin_UpperShoulder_R",
      },
    ],
  });

  const leftLeg = resolver("Effect_Shin_Leg_L", {
    effectToken: "Effect_Shin_Leg_L",
    boneToken: "Bone_Leg_L",
  });

  assert.deepEqual(leftLeg.resourcePaths, ["Effects/Hero070/DefaultSkin/Hero070_Torch/Hero070_Torch_L.pfx"]);
  assert.equal(leftLeg.aliasEvidenceStrength, "confirmed");
  assert.equal(leftLeg.resourceEvidenceSource, "effect-pfx-hook-token-side-sibling");
  assert.equal(leftLeg.resourceMatchKind, "unique-pfx-hook-effect-token-side-sibling");

  const incompleteResolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_Torch/Hero070_Torch_R.pfx",
        hookEffectTokens: "Effect_Shin_Leg_R",
      },
    ],
  });

  assert.equal(
    incompleteResolver("Effect_Shin_Leg_L", {
      effectToken: "Effect_Shin_Leg_L",
      boneToken: "Bone_Leg_L",
    }),
    null,
  );
});

test("buildEffectResourceResolver keeps selector PFX hook-token siblings unresolved when tied", () => {
  const resolver = buildEffectResourceResolver({
    pfxResourceRows: [
      {
        relativePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
        hookEffectTokens: "Effect_Blackclaw_BreathGround",
      },
      {
        relativePath: "Effects/Blackclaw/BlackClaw_BreathBurst/BlackClaw_BreathBurst.pfx",
        hookEffectTokens: "Effect_Blackclaw_BreathBurst",
      },
    ],
    heroNameRows: [
      { hero: "Blackclaw", kind: "Effect", name: "BreathImpact" },
      { hero: "Blackclaw", kind: "Effect", name: "BreathGround" },
      { hero: "Blackclaw", kind: "Effect", name: "BreathBurst" },
    ],
  });

  const impact = resolver("Effect_Blackclaw_BreathImpact", {
    effectToken: "Effect_Blackclaw_BreathImpact",
    selectorOutputRole: "impact",
  });

  assert.equal(impact, null);
});

test("buildEffectResourceResolver uses CFF0 skin effect aliases when the skin token has exact PFX evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Ringo/S1/Ringo__S1__Ult_Spirit.assetbundle/Ringo__S1__Ult_Spirit.pfx",
      },
      {
        relativePath: "Effects/Common/Nothing.assetbundle/Nothing.pfx",
      },
    ],
    heroNameRows: [{ hero: "Ringo", kind: "Effect", name: "Ability03_Aura" }],
    definitionRows: [
      {
        manifestLabel: "*Ringo*",
        targetRelativePath: "Characters/Ringo/Ringo.def",
        childResourceRows: "180",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Ringo_Skin_Shogun_T3",
        sourceEffectToken: "Effect_Ringo_Ability03_Aura",
        skinEffectToken: "Effect_Ringo__S1__Ult_Spirit",
      },
      {
        modelLabel: "Ringo_Skin_Disabled",
        sourceEffectToken: "Effect_Ringo_Ability03_Aura",
        skinEffectToken: "Effect_Nothing",
      },
    ],
  });

  const resolved = resolver("Effect_Ringo_Ability03_Aura", {
    effectToken: "Effect_Ringo_Ability03_Aura",
    actionKeys: ["ability03"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Ringo/S1/Ringo__S1__Ult_Spirit.assetbundle/Ringo__S1__Ult_Spirit.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "cff0-skin-effect-alias");
  assert.equal(resolved.resourceMatchKind, "cff0-skin-effect-alias-exact-resource");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Ringo/S1/Ringo__S1__Ult_Spirit.assetbundle/Ringo__S1__Ult_Spirit.pfx",
      modelLabel: "Ringo_Skin_Shogun_T3",
      skinKind: "skin",
      heroLabel: "Ringo",
    },
  ]);
});

test("buildEffectResourceResolver resolves CFF0 skin effect aliases through strong hero resource evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero023/S1/Hero023_S1_B_Body/Hero023_S1_B_Body.pfx",
      },
    ],
    heroNameRows: [
      { hero: "Kestrel", kind: "Effect", name: "B_Head" },
      { hero: "Kestrel", kind: "Effect", name: "S1_B_Body" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "240",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Kestrel_Skin_Summer",
        sourceEffectToken: "Effect_Kestrel_B_Head",
        skinEffectToken: "Effect_Kestrel_S1_B_Body",
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_B_Head", {
    effectToken: "Effect_Kestrel_B_Head",
    boneToken: "Bone_Head",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero023/S1/Hero023_S1_B_Body/Hero023_S1_B_Body.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "cff0-skin-effect-alias");
  assert.equal(resolved.resourceMatchKind, "cff0-skin-effect-alias-strong-resource");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Hero023/S1/Hero023_S1_B_Body/Hero023_S1_B_Body.pfx",
      modelLabel: "Kestrel_Skin_Summer",
      skinKind: "skin",
      heroLabel: "Kestrel",
    },
  ]);
});

test("buildEffectResourceResolver keeps ambiguous PFX hook-token evidence unresolved", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero001/A/A.pfx",
        hash: "A",
      },
      {
        relativePath: "Effects/Hero001/B/B.pfx",
        hash: "B",
      },
    ],
    pfxResourceRows: [
      {
        relativePath: "Effects/Hero001/A/A.pfx",
        hookEffectTokens: "Effect_Test_Ambiguous",
      },
      {
        relativePath: "Effects/Hero001/B/B.pfx",
        hookEffectTokens: "Effect_Test_Ambiguous",
      },
    ],
    heroNameRows: [],
    definitionRows: [],
  });

  const resolved = resolver("Effect_Test_Ambiguous", {});

  assert.equal(resolved, null);
});

test("buildEffectResourceResolver promotes KindredEffects exact suffix slots with skin metadata", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Skye", kind: "Effect", name: "Death" }],
    definitionRows: [
      {
        manifestLabel: "*Skye*",
        targetRelativePath: "Characters/Skye/Skye.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Skye/Art/skye.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Skye_DefaultSkin",
        heroLabel: "Skye",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_Death",
        resourcePath: "Effects/Hero018/Hero018_Death.assetbundle/Hero018_Death.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Skye_Death", {
    effectToken: "Effect_Skye_Death",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero018/Hero018_Death.assetbundle/Hero018_Death.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-exact-suffix");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Hero018/Hero018_Death.assetbundle/Hero018_Death.pfx",
      modelLabel: "Skye_DefaultSkin",
      skinKind: "default",
      heroLabel: "Skye",
    },
  ]);
});

test("buildEffectResourceResolver narrows KindredEffects slots from native visual string labels", () => {
  const resolver = buildEffectResourceResolver({
    heroNameRows: [{ hero: "SAW", kind: "Effect", name: "Flamethrower" }],
    definitionRows: [
      {
        manifestLabel: "*SAW*",
        targetRelativePath: "Characters/SAW/SAW.def",
        skeletonSamples: "Characters/SAW/Art/saw.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "SAW_DefaultSkin",
        heroLabel: "SAW",
        role: "projectile",
        resourcePath: "Effects/SAW/SAW_Projectile.assetbundle/SAW_Projectile.pfx",
        resourceStem: "SAW_Projectile",
        resourceRoot: "SAW",
      },
      {
        modelLabel: "SAW_DefaultSkin",
        heroLabel: "SAW",
        role: "effect",
        resourcePath: "Effects/SAW/SAW_SupressingFire.assetbundle/SAW_SupressingFire.pfx",
        resourceStem: "SAW_SupressingFire",
        resourceRoot: "SAW",
      },
      {
        modelLabel: "SAW_Skin_SAWborg",
        heroLabel: "SAW",
        role: "effect",
        resourcePath: "Effects/SAW/S1/SAW_S1_SupressingFire.assetbundle/SAW_S1_SuppressingFire.pfx",
        resourceStem: "SAW_S1_SuppressingFire",
        resourceRoot: "SAW",
      },
    ],
  });

  const resolved = resolver("Effect_SAW_Flamethrower", {
    effectToken: "Effect_SAW_Flamethrower",
    token: "Effect_SAW_Flamethrower",
    heroNames: ["SAW"],
    heroResourceRoots: ["SAW"],
    actionKeys: ["ability01"],
    boneToken: "Bone_Gun",
    stringSamples: "Ability__SAW__A|Bone_Gun|Effect_SAW_Flamethrower|SuppressingFire|_SAW_",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/SAW/S1/SAW_S1_SupressingFire.assetbundle/SAW_S1_SuppressingFire.pfx",
    "Effects/SAW/SAW_SupressingFire.assetbundle/SAW_SupressingFire.pfx",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-string-label");
});

test("buildEffectResourceResolver narrows KindredEffects slots from long native visual skill labels", () => {
  const resolver = buildEffectResourceResolver({
    heroNameRows: [{ hero: "Koshka", kind: "Effect", name: "Ult_Flurry" }],
    definitionRows: [
      {
        manifestLabel: "*Koshka*",
        targetRelativePath: "Characters/Koshka/Koshka.def",
        skeletonSamples: "Characters/Koshka/Art/koshka.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Frenzy",
        resourcePath: "Effects/Koshka/Koshka_Ult_Frenzy/Koshka_Ult_Frenzy.pfx",
      },
      {
        modelLabel: "Koshka_Skin_S1",
        heroLabel: "Koshka",
        skinKind: "skin",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka__S1__Ult_Frenzy",
        resourcePath: "Effects/Koshka/S1/Koshka__S1__Ult_Frenzy/Koshka__S1__Ult_Frenzy.pfx",
      },
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Tell_1",
        resourcePath: "Effects/Koshka/Koshka_Ult_Tell_1/Koshka_Ult_Tell_1.pfx",
      },
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Dustoff",
        resourcePath: "Effects/Koshka/Koshka_Ult_Dustoff/Koshka_Ult_Dustoff.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Koshka_Ult_Flurry", {
    effectToken: "Effect_Koshka_Ult_Flurry",
    token: "Effect_Koshka_Ult_Flurry",
    heroNames: ["Koshka"],
    heroResourceRoots: ["Koshka"],
    actionKeys: ["ability03"],
    boneToken: "Bone_Head",
    stringSamples:
      "AttackToIdle|Bone_Head|Effect_Koshka_UltTell_1|Effect_Koshka_UltTell_2|Effect_Koshka_Ult_Flurry|Effect_Koshka_Ult_Start|YummyCatnipFrenzy_Dash|YummyCatnipFrenzy_Flurry",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Koshka/Koshka_Ult_Frenzy/Koshka_Ult_Frenzy.pfx",
    "Effects/Koshka/S1/Koshka__S1__Ult_Frenzy/Koshka__S1__Ult_Frenzy.pfx",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-string-label");
});

test("buildEffectResourceResolver narrows KindredEffects slots from inferred ultimate resource slots", () => {
  const resolver = buildEffectResourceResolver({
    heroNameRows: [{ hero: "Koshka", kind: "Effect", name: "Ult_Flurry" }],
    definitionRows: [
      {
        manifestLabel: "*Koshka*",
        targetRelativePath: "Characters/Koshka/Koshka.def",
        skeletonSamples: "Characters/Koshka/Art/koshka.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Frenzy",
        resourcePath: "Effects/Koshka/Koshka_Ult_Frenzy/Koshka_Ult_Frenzy.pfx",
      },
      {
        modelLabel: "Koshka_Skin_S1",
        heroLabel: "Koshka",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka__S1__Ult_Frenzy",
        resourcePath: "Effects/Koshka/S1/Koshka__S1__Ult_Frenzy/Koshka__S1__Ult_Frenzy.pfx",
      },
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Tell_1",
        resourcePath: "Effects/Koshka/Koshka_Ult_Tell_1/Koshka_Ult_Tell_1.pfx",
      },
      {
        modelLabel: "Koshka_DefaultSkin",
        heroLabel: "Koshka",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Koshka",
        resourceStem: "Koshka_Ult_Dustoff",
        resourcePath: "Effects/Koshka/Koshka_Ult_Dustoff/Koshka_Ult_Dustoff.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Koshka_Ult_Flurry", {
    effectToken: "Effect_Koshka_Ult_Flurry",
    token: "Effect_Koshka_Ult_Flurry",
    heroNames: ["Koshka"],
    heroResourceRoots: ["Koshka"],
    actionKeys: ["ability03"],
    boneToken: "Bone_Head",
    stringSamples:
      "AttackToIdle|Bone_Head|Effect_Koshka_UltTell_1|Effect_Koshka_UltTell_2|Effect_Koshka_Ult_Flurry|Effect_Koshka_Ult_Start|YummyCatnipFrenzy_Dash|YummyCatnipFrenzy_Flurry",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Koshka/Koshka_Ult_Frenzy/Koshka_Ult_Frenzy.pfx",
    "Effects/Koshka/S1/Koshka__S1__Ult_Frenzy/Koshka__S1__Ult_Frenzy.pfx",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-string-label");
});

test("buildEffectResourceResolver narrows KindredEffects slots from terminal effect terms", () => {
  const resolver = buildEffectResourceResolver({
    heroNameRows: [{ hero: "Magnus", kind: "Effect", name: "Perk_Mark_Snap" }],
    definitionRows: [
      {
        manifestLabel: "*Magnus*",
        targetRelativePath: "Characters/Hero047/Magnus.def",
        skeletonSamples: "Characters/Hero047/Art/hero047.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Magnus_DefaultSkin",
        heroLabel: "Magnus",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero047",
        resourceStem: "Hero047_Perk_Mark",
        resourcePath: "Effects/Hero047/Hero047_Perk_Mark/Hero047_Perk_Mark.pfx",
      },
      {
        modelLabel: "Magnus_DefaultSkin",
        heroLabel: "Magnus",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero047",
        resourceStem: "Hero047_Perk_Mark_SM",
        resourcePath: "Effects/Hero047/Hero047_Perk_Mark_SM/Hero047_Perk_Mark_SM.pfx",
      },
      {
        modelLabel: "Magnus_DefaultSkin",
        heroLabel: "Magnus",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero047",
        resourceStem: "Hero047_Perk_Snap",
        resourcePath: "Effects/Hero047/Hero047_Perk_Snap/Hero047_Perk_Snap.pfx",
      },
      {
        modelLabel: "Magnus_Skin_Winter",
        heroLabel: "Magnus",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero047",
        resourceStem: "Hero047_WTR_Perk_Mark",
        resourcePath: "Effects/Hero047/WTR/Hero047_WTR_Perk_Mark/Hero047_WTR_Perk_Mark.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Magnus_Perk_Mark_Snap", {
    effectToken: "Effect_Magnus_Perk_Mark_Snap",
    token: "Effect_Magnus_Perk_Mark_Snap",
    heroNames: ["Magnus"],
    heroResourceRoots: ["Hero047"],
    boneToken: "Bone_RightHand",
    stringSamples:
      "Bone_RightHand|Buff_Magnus_PerkProc_DamagePFX|Buff_Magnus_Perk_SpellMark|Effect_Magnus_Perk_Mark_Snap|PerkProcAttack",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero047/Hero047_Perk_Snap/Hero047_Perk_Snap.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-terminal-term");
});

test("buildEffectResourceResolver keeps ambiguous KindredEffects slots unresolved without action context", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Ringo", kind: "Effect", name: "Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Ringo*",
        targetRelativePath: "Characters/Ringo/Ringo.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Ringo/Art/ringo.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Ringo_DefaultSkin",
        heroLabel: "Ringo",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "projectile",
        resourceRoot: "Ringo",
        resourceStem: "RingoAttackShot",
        resourcePath: "Effects/Ringo/attack/RingoAttackShot.assetbundle/RingoAttackShot.pfx",
      },
      {
        modelLabel: "Ringo_Skin_S6",
        heroLabel: "Ringo",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Ringo",
        resourceStem: "Ringo_S6_Ability01Shot",
        resourcePath: "Effects/Ringo/S6/Ringo_S6_Ability01Shot/Ringo_S6_Ability01Shot.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Ringo_Shot", {
    effectToken: "Effect_Ringo_Shot",
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver promotes action-gated KindredEffects skin variants together", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Skye", kind: "Effect", name: "C_Explosion" }],
    definitionRows: [
      {
        manifestLabel: "*Skye*",
        targetRelativePath: "Characters/Hero018/Skye.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero018/Art/hero018.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Skye_DefaultSkin",
        heroLabel: "Skye",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_C_Explosion",
        resourcePath: "Effects/Hero018/Hero018_C_Explosion.assetbundle/Hero018_C_Explosion.pfx",
      },
      {
        modelLabel: "Skye_Skin_Bike",
        heroLabel: "Skye",
        skinKind: "skin",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_S2_C_Explosion",
        resourcePath: "Effects/Hero018/S2/Hero018_S2_C_Explosion/Hero018_S2_C_Explosion.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Skye_C_Explosion", {
    effectToken: "Effect_Skye_C_Explosion",
    actionKeys: ["ability03"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero018/Hero018_C_Explosion.assetbundle/Hero018_C_Explosion.pfx",
    "Effects/Hero018/S2/Hero018_S2_C_Explosion/Hero018_S2_C_Explosion.pfx",
  ]);
  assert.deepEqual(resolved.resourceVariants.map((variant) => variant.modelLabel), ["Skye_DefaultSkin", "Skye_Skin_Bike"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
});

test("buildEffectResourceResolver treats MuzzleFlash tokens as MF KindredEffects slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Ringo", kind: "Effect", name: "MuzzleFlash" }],
    definitionRows: [
      {
        manifestLabel: "*Ringo*",
        targetRelativePath: "Characters/Ringo/Ringo.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Ringo/Art/ringo.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Ringo_DefaultSkin",
        heroLabel: "Ringo",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Ringo",
        resourceStem: "RingoAbility01MF",
        resourcePath: "Effects/Ringo/ability01/RingoAbility01MF.assetbundle/RingoAbility01MF.pfx",
      },
      {
        modelLabel: "Ringo_Skin_Shogun_T3",
        heroLabel: "Ringo",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Ringo",
        resourceStem: "Ringo_S6_Ability01MF",
        resourcePath: "Effects/Ringo/S6/Ringo_S6_Ability01MF/Ringo_S6_Ability01MF.pfx",
      },
      {
        modelLabel: "Ringo_DefaultSkin",
        heroLabel: "Ringo",
        skinKind: "default",
        actionKeys: [],
        role: "persistent",
        resourceRoot: "Ringo",
        resourceStem: "RingoAttackMF",
        resourcePath: "Effects/Ringo/attack/RingoAttackMF.assetbundle/RingoAttackMF.pfx",
      },
      {
        modelLabel: "Ringo_Skin_Shogun_T3",
        heroLabel: "Ringo",
        skinKind: "skin",
        actionKeys: [],
        role: "persistent",
        resourceRoot: "Ringo",
        resourceStem: "Ringo_S6_AttackMF",
        resourcePath: "Effects/Ringo/S6/Ringo_S6_AttackMF/Ringo_S6_AttackMF.pfx",
      },
      {
        modelLabel: "Ringo_DefaultSkin",
        heroLabel: "Ringo",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Ringo",
        resourceStem: "RingoAbility01Shot",
        resourcePath: "Effects/Ringo/ability01/RingoAbility01Shot.assetbundle/RingoAbility01Shot.pfx",
      },
      {
        modelLabel: "Ringo_DefaultSkin",
        heroLabel: "Ringo",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Ringo",
        resourceStem: "RingoAbility01Impact",
        resourcePath: "Effects/Ringo/ability01/RingoAbility01Impact.assetbundle/RingoAbility01Impact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Ringo_MuzzleFlash", {
    effectToken: "Effect_Ringo_MuzzleFlash",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Ringo/ability01/RingoAbility01MF.assetbundle/RingoAbility01MF.pfx",
    "Effects/Ringo/S6/Ringo_S6_Ability01MF/Ringo_S6_Ability01MF.pfx",
  ]);
  assert.deepEqual(resolved.resourceVariants.map((variant) => variant.modelLabel), ["Ringo_DefaultSkin", "Ringo_Skin_Shogun_T3"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver resolves Kindred slots through matching hero code roots for runtime entity aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "LanceBall", kind: "Effect", name: "Lance_C_Roll" },
      { hero: "Lance", kind: "Effect", name: "C_Roll" },
    ],
    definitionRows: [
      {
        manifestLabel: "*LanceBall*",
        targetRelativePath: "Characters/Hero028/Lance.def",
        childResourceRows: "227",
        skeletonSamples: "Characters/Hero028/Art/hero028.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Lance_DefaultSkin",
        heroLabel: "Lance",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero028",
        resourceStem: "Hero028_Roll",
        resourcePath: "Effects/Hero028/Hero028_Roll/Hero028_Roll.pfx",
      },
      {
        modelLabel: "Lance_Skin_Deathknight_T3",
        heroLabel: "Lance",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero028",
        resourceStem: "Hero028_S2_Roll",
        resourcePath: "Effects/Hero028/S2/Hero028_S2_Roll/Hero028_S2_Roll.pfx",
      },
      {
        modelLabel: "Lance_Skin_Poseidon",
        heroLabel: "Lance",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero028",
        resourceStem: "Hero028_POS_Roll",
        resourcePath: "Effects/Hero028/POS/Hero028_POS_Roll/Hero028_POS_Roll.pfx",
      },
      {
        modelLabel: "Other_DefaultSkin",
        heroLabel: "Other",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero999",
        resourceStem: "Hero999_Roll",
        resourcePath: "Effects/Hero999/Hero999_Roll/Hero999_Roll.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_LanceBall_Lance_C_Roll", {
    effectToken: "Effect_LanceBall_Lance_C_Roll",
    actionKeys: ["ability03"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero028/Hero028_Roll/Hero028_Roll.pfx",
    "Effects/Hero028/POS/Hero028_POS_Roll/Hero028_POS_Roll.pfx",
    "Effects/Hero028/S2/Hero028_S2_Roll/Hero028_S2_Roll.pfx",
  ]);
  assert.deepEqual(resolved.resourceVariants.map((variant) => variant.modelLabel), [
    "Lance_DefaultSkin",
    "Lance_Skin_Poseidon",
    "Lance_Skin_Deathknight_T3",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver treats CDR tokens as cooldown semantic aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Viola", kind: "Effect", name: "C2_ATK_CDR_BOOST" }],
    definitionRows: [
      {
        manifestLabel: "*Viola*",
        targetRelativePath: "Characters/Hero068/Viola.def",
        childResourceRows: "150",
        skeletonSamples: "Characters/Hero068/Art/hero068.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: [],
        role: "persistent",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Aura",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.pfx",
      },
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: [],
        role: "persistent",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Cooldown",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Cooldown/Hero068_DEF_C_Cooldown.pfx",
      },
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: [],
        role: "persistent",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Status",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Status/Hero068_DEF_C_Status.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Viola_C2_ATK_CDR_BOOST", {
    effectToken: "Effect_Viola_C2_ATK_CDR_BOOST",
    heroNames: ["Viola"],
    heroResourceRoots: ["Hero068", "Viola"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero068/DEF/Hero068_DEF_C_Cooldown/Hero068_DEF_C_Cooldown.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver maps flash origin and destination tokens to dash slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Idris", kind: "Effect", name: "A_FlashAtDestination" },
      { hero: "Idris", kind: "Effect", name: "A_FlashAtOrigin" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Idris*",
        targetRelativePath: "Characters/Hero030/Idris.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero030/Art/hero030.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Idris_DefaultSkin",
        heroLabel: "Idris",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero030",
        resourceStem: "Hero030_A_Dash",
        resourcePath: "Effects/Hero030/Hero030_A_Dash/Hero030_A_Dash.pfx",
      },
      {
        modelLabel: "Idris_DefaultSkin",
        heroLabel: "Idris",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero030",
        resourceStem: "Hero030_A_Dash_End",
        resourcePath: "Effects/Hero030/Hero030_A_Dash_End/Hero030_A_Dash_End.pfx",
      },
      {
        modelLabel: "Idris_DefaultSkin",
        heroLabel: "Idris",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero030",
        resourceStem: "Hero030_A_Roll",
        resourcePath: "Effects/Hero030/Hero030_A_Roll/Hero030_A_Roll.pfx",
      },
    ],
  });

  const destination = resolver("Effect_Idris_A_FlashAtDestination", {
    effectToken: "Effect_Idris_A_FlashAtDestination",
    actionKeys: ["ability01", "ability02"],
  });
  const origin = resolver("Effect_Idris_A_FlashAtOrigin", {
    effectToken: "Effect_Idris_A_FlashAtOrigin",
    actionKeys: ["ability01", "ability02"],
  });

  assert.deepEqual(destination.resourcePaths, ["Effects/Hero030/Hero030_A_Dash_End/Hero030_A_Dash_End.pfx"]);
  assert.deepEqual(origin.resourcePaths, ["Effects/Hero030/Hero030_A_Dash/Hero030_A_Dash.pfx"]);
  assert.equal(destination.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(origin.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver treats restore and refund as semantic aliases for energy effects", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Samuel", kind: "Effect", name: "EnergyRestore" }],
    definitionRows: [
      {
        manifestLabel: "*Samuel*",
        targetRelativePath: "Characters/Hero029/Samuel.def",
        childResourceRows: "215",
        skeletonSamples: "Characters/Hero029/Art/hero029.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Samuel_DefaultSkin",
        heroLabel: "Samuel",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero029",
        resourceStem: "Hero029_EnergyRefund",
        resourcePath: "Effects/Hero029/Hero029_EnergyRefund/Hero029_EnergyRefund.pfx",
      },
      {
        modelLabel: "Samuel_Skin_Cyber",
        heroLabel: "Samuel",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero029",
        resourceStem: "Hero029_S1_EnergyRefund",
        resourcePath: "Effects/Hero029/S1/Hero029_S1_EnergyRefund/Hero029_S1_EnergyRefund.pfx",
      },
      {
        modelLabel: "Samuel_DefaultSkin",
        heroLabel: "Samuel",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero029",
        resourceStem: "Hero029_EnergyProjectile",
        resourcePath: "Effects/Hero029/Hero029_EnergyProjectile/Hero029_EnergyProjectile.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Samuel_EnergyRestore", {
    effectToken: "Effect_Samuel_EnergyRestore",
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero029/Hero029_EnergyRefund/Hero029_EnergyRefund.pfx",
    "Effects/Hero029/S1/Hero029_S1_EnergyRefund/Hero029_S1_EnergyRefund.pfx",
  ]);
  assert.deepEqual(resolved.resourceVariants.map((variant) => variant.modelLabel), ["Samuel_DefaultSkin", "Samuel_Skin_Cyber"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver promotes unique semantic KindredEffects aliases with action evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Baptiste", kind: "Effect", name: "B_Beam" }],
    definitionRows: [
      {
        manifestLabel: "*Baptiste*",
        targetRelativePath: "Characters/Hero040/Baptiste.def",
        childResourceRows: "229",
        skeletonSamples: "Characters/Hero040/Art/hero040.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Baptiste_DefaultSkin",
        heroLabel: "Baptiste",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero040",
        resourceStem: "Hero040_B_Tether",
        resourcePath: "Effects/Hero040/Hero040_B_Tether/Hero040_B_Tether.pfx",
      },
      {
        modelLabel: "Baptiste_DefaultSkin",
        heroLabel: "Baptiste",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero040",
        resourceStem: "Hero040_B_TetherSnap",
        resourcePath: "Effects/Hero040/Hero040_B_TetherSnap/Hero040_B_TetherSnap.pfx",
      },
      {
        modelLabel: "Baptiste_DefaultSkin",
        heroLabel: "Baptiste",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "persistent",
        resourceRoot: "Hero040",
        resourceStem: "Hero040_B_Warning",
        resourcePath: "Effects/Hero040/Hero040_B_Warning/Hero040_B_Warning.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Baptiste_B_Beam", {
    effectToken: "Effect_Baptiste_B_Beam",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero040/Hero040_B_Tether/Hero040_B_Tether.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver promotes KindredEffects DOT slots for DamageOverTime tokens", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Silvernail", kind: "Effect", name: "B_DamageOverTime" }],
    definitionRows: [
      {
        manifestLabel: "*Silvernail*",
        targetRelativePath: "Characters/Hero055/Silvernail.def",
        childResourceRows: "210",
        skeletonSamples: "Characters/Hero055/Art/hero055.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "persistent",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_B_DOT",
        resourcePath: "Effects/Hero055/Hero055_B_DOT/Hero055_B_DOT.pfx",
      },
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "impact",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_B_Impact",
        resourcePath: "Effects/Hero055/Hero055_B_Impact/Hero055_B_Impact.pfx",
      },
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "persistent",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_B_Warning",
        resourcePath: "Effects/Hero055/Hero055_B_Warning/Hero055_B_Warning.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Silvernail_B_DamageOverTime", {
    effectToken: "Effect_Silvernail_B_DamageOverTime",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero055/Hero055_B_DOT/Hero055_B_DOT.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver promotes channel slots for charging tokens", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Grace", kind: "Effect", name: "C_Charging" }],
    definitionRows: [
      {
        manifestLabel: "*Grace*",
        targetRelativePath: "Characters/Hero042/Grace.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Hero042/Art/hero042.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Grace_DefaultSkin",
        heroLabel: "Grace",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "cast",
        resourceRoot: "Hero042",
        resourceStem: "Hero042_C_Channel",
        resourcePath: "Effects/Hero042/Hero042_C_Channel/Hero042_C_Channel.pfx",
      },
      {
        modelLabel: "Grace_DefaultSkin",
        heroLabel: "Grace",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero042",
        resourceStem: "Hero042_C_Impact",
        resourcePath: "Effects/Hero042/Hero042_C_Impact/Hero042_C_Impact.pfx",
      },
      {
        modelLabel: "Grace_DefaultSkin",
        heroLabel: "Grace",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero042",
        resourceStem: "Hero042_C_Target",
        resourcePath: "Effects/Hero042/Hero042_C_Target/Hero042_C_Target.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Grace_C_Charging", {
    effectToken: "Effect_Grace_C_Charging",
    actionKeys: ["ability03", "ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero042/Hero042_C_Channel/Hero042_C_Channel.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver treats chain tether tokens as base chain effects", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Churnwalker", kind: "Effect", name: "ChainTether" }],
    definitionRows: [
      {
        manifestLabel: "*Churnwalker*",
        targetRelativePath: "Characters/Hero031/Churnwalker.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero031/Art/hero031.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Churnwalker_DefaultSkin",
        heroLabel: "Churnwalker",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero031",
        resourceStem: "Hero031_Chain",
        resourcePath: "Effects/Hero031/Hero031_Chain/Hero031_Chain.pfx",
      },
      {
        modelLabel: "Churnwalker_DefaultSkin",
        heroLabel: "Churnwalker",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero031",
        resourceStem: "Hero031_Chain_Damage",
        resourcePath: "Effects/Hero031/Hero031_Chain_Damage/Hero031_Chain_Damage.pfx",
      },
      {
        modelLabel: "Churnwalker_DefaultSkin",
        heroLabel: "Churnwalker",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero031",
        resourceStem: "Hero031_Chain_Proj",
        resourcePath: "Effects/Hero031/Hero031_Chain_Proj/Hero031_Chain_Proj.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Churnwalker_ChainTether", {
    effectToken: "Effect_Churnwalker_ChainTether",
    heroNames: ["Churnwalker"],
    boneToken: "Bone_CenterMass",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero031/Hero031_Chain/Hero031_Chain.pfx"]);
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver keeps tied semantic KindredEffects aliases unresolved", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Baptiste", kind: "Effect", name: "SoulFragment" }],
    definitionRows: [
      {
        manifestLabel: "*Baptiste*",
        targetRelativePath: "Characters/Hero040/Baptiste.def",
        childResourceRows: "229",
        skeletonSamples: "Characters/Hero040/Art/hero040.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Baptiste_DefaultSkin",
        heroLabel: "Baptiste",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero040",
        resourceStem: "Hero040_Soul",
        resourcePath: "Effects/Hero040/Hero040_Soul/Hero040_Soul.pfx",
      },
      {
        modelLabel: "Baptiste_DefaultSkin",
        heroLabel: "Baptiste",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero040",
        resourceStem: "Hero040_Soul_Power",
        resourcePath: "Effects/Hero040/Hero040_Soul_Power/Hero040_Soul_Power.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Baptiste_SoulFragment", {
    effectToken: "Effect_Baptiste_SoulFragment",
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver promotes unique KindredEffects action slots when token names use ability labels", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Churnwalker", kind: "Effect", name: "TormentActivation" }],
    definitionRows: [
      {
        manifestLabel: "*Churnwalker*",
        targetRelativePath: "Characters/Hero031/Churnwalker.def",
        childResourceRows: "150",
        skeletonSamples: "Characters/Hero031/Art/hero031.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Churnwalker_DefaultSkin",
        heroLabel: "Churnwalker",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero031",
        resourceStem: "Hero031_B_AOE",
        resourcePath: "Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.pfx",
      },
      {
        modelLabel: "Churnwalker_DefaultSkin",
        heroLabel: "Churnwalker",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero031",
        resourceStem: "Hero031_Chain_Proj",
        resourcePath: "Effects/Hero031/Hero031_Chain_Proj/Hero031_Chain_Proj.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Churnwalker_TormentActivation", {
    effectToken: "Effect_Churnwalker_TormentActivation",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-unique-action");
});

test("buildEffectResourceResolver maps semantic-light impact tokens to bare action KindredEffects slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Leo", kind: "Effect", name: "A_Impact" },
      { hero: "Leo", kind: "Effect", name: "B_Impact" },
      { hero: "Leo", kind: "Effect", name: "A_Bleed" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Leo*",
        targetRelativePath: "Characters/Hero063/Leo.def",
        childResourceRows: "200",
        skeletonSamples: "Characters/Hero063/Art/hero063.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Leo_DefaultSkin",
        heroLabel: "Leo",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero063",
        resourceStem: "Hero063_DEF_A",
        resourcePath: "Effects/Hero063/Default/Hero063_DEF_A/Hero063_DEF_A.pfx",
      },
      {
        modelLabel: "Leo_Skin_Metal",
        heroLabel: "Leo",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero063",
        resourceStem: "Hero063_MTL_A",
        resourcePath: "Effects/Hero063/MTL/Hero063_MTL_A/Hero063_MTL_A.pfx",
      },
      {
        modelLabel: "Leo_DefaultSkin",
        heroLabel: "Leo",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero063",
        resourceStem: "Hero063_DEF_B",
        resourcePath: "Effects/Hero063/Default/Hero063_DEF_B/Hero063_DEF_B.pfx",
      },
      {
        modelLabel: "Leo_Skin_Metal",
        heroLabel: "Leo",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero063",
        resourceStem: "Hero063_MTL_B",
        resourcePath: "Effects/Hero063/MTL/Hero063_MTL_B/Hero063_MTL_B.pfx",
      },
      {
        modelLabel: "Leo_DefaultSkin",
        heroLabel: "Leo",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero063",
        resourceStem: "Hero063_DEF_C_Empowered",
        resourcePath: "Effects/Hero063/Default/Hero063_DEF_C_Empowered/Hero063_DEF_C_Empowered.pfx",
      },
    ],
  });

  const abilityA = resolver("Effect_Leo_A_Impact", {
    effectToken: "Effect_Leo_A_Impact",
    actionKeys: ["ability01", "ability03"],
  });
  const abilityB = resolver("Effect_Leo_B_Impact", {
    effectToken: "Effect_Leo_B_Impact",
    actionKeys: ["ability02", "ability03"],
  });
  const bleed = resolver("Effect_Leo_A_Bleed", {
    effectToken: "Effect_Leo_A_Bleed",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(abilityA.resourcePaths, [
    "Effects/Hero063/Default/Hero063_DEF_A/Hero063_DEF_A.pfx",
    "Effects/Hero063/MTL/Hero063_MTL_A/Hero063_MTL_A.pfx",
  ]);
  assert.equal(abilityA.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(abilityA.resourceMatchKind, "kindred-effect-slot-bare-action");
  assert.deepEqual(abilityB.resourcePaths, [
    "Effects/Hero063/Default/Hero063_DEF_B/Hero063_DEF_B.pfx",
    "Effects/Hero063/MTL/Hero063_MTL_B/Hero063_MTL_B.pfx",
  ]);
  assert.deepEqual(bleed.resourcePaths, []);
});

test("buildEffectResourceResolver treats native landing effects as impact resources for action-gated slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Baron", kind: "Effect", name: "B_Landing" }],
    definitionRows: [
      {
        manifestLabel: "*Baron*",
        targetRelativePath: "Characters/Hero019/Baron.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Hero019/Art/hero019.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Baron_DefaultSkin",
        heroLabel: "Baron",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "impact",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_B_Impact",
        resourcePath: "Effects/Hero019/Hero019_B_Impact/Hero019_B_Impact.pfx",
      },
      {
        modelLabel: "Baron_DefaultSkin",
        heroLabel: "Baron",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_B_Thruster",
        resourcePath: "Effects/Hero019/Hero019_B_Thruster/Hero019_B_Thruster.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Baron_B_Landing", {
    effectToken: "Effect_Baron_B_Landing",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero019/Hero019_B_Impact/Hero019_B_Impact.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver narrows KindredEffects semantic slots from effect token side suffixes", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Skye", kind: "Effect", name: "Thruster_WL" },
      { hero: "Skye", kind: "Effect", name: "Thruster_WR" },
      { hero: "Skye", kind: "Effect", name: "Thruster_FL" },
      { hero: "Skye", kind: "Effect", name: "Thruster_FR" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Skye*",
        targetRelativePath: "Characters/Hero018/Skye.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Hero018/Art/hero018.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Skye_DefaultSkin",
        heroLabel: "Skye",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_Thruster_LLeg",
        resourcePath: "Effects/Hero018/Hero018_Thruster_LLeg.assetbundle/Hero018_Thruster_LLeg.pfx",
      },
      {
        modelLabel: "Skye_DefaultSkin",
        heroLabel: "Skye",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_Thruster_RLeg",
        resourcePath: "Effects/Hero018/Hero018_Thruster_RLeg.assetbundle/Hero018_Thruster_RLeg.pfx",
      },
      {
        modelLabel: "Skye_DefaultSkin",
        heroLabel: "Skye",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero018",
        resourceStem: "Hero018_Thruster",
        resourcePath: "Effects/Hero018/Hero018_Thruster.assetbundle/Hero018_Thruster.pfx",
      },
    ],
  });

  const left = resolver("Effect_Skye_Thruster_WL", {
    effectToken: "Effect_Skye_Thruster_WL",
    heroNames: ["Skye"],
  });
  const right = resolver("Effect_Skye_Thruster_WR", {
    effectToken: "Effect_Skye_Thruster_WR",
    heroNames: ["Skye"],
  });
  const frontLeft = resolver("Effect_Skye_Thruster_FL", {
    effectToken: "Effect_Skye_Thruster_FL",
    heroNames: ["Skye"],
    boneToken: "Bone_Footjet_L",
  });
  const frontRight = resolver("Effect_Skye_Thruster_FR", {
    effectToken: "Effect_Skye_Thruster_FR",
    heroNames: ["Skye"],
    boneToken: "Bone_Footjet_R",
  });

  assert.deepEqual(left.resourcePaths, ["Effects/Hero018/Hero018_Thruster_LLeg.assetbundle/Hero018_Thruster_LLeg.pfx"]);
  assert.deepEqual(right.resourcePaths, ["Effects/Hero018/Hero018_Thruster_RLeg.assetbundle/Hero018_Thruster_RLeg.pfx"]);
  assert.deepEqual(frontLeft.resourcePaths, ["Effects/Hero018/Hero018_Thruster_LLeg.assetbundle/Hero018_Thruster_LLeg.pfx"]);
  assert.deepEqual(frontRight.resourcePaths, ["Effects/Hero018/Hero018_Thruster_RLeg.assetbundle/Hero018_Thruster_RLeg.pfx"]);
  assert.equal(right.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(right.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver does not map Kindred slots from side terms alone", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Shin", kind: "Effect", name: "Wheel_R" }],
    definitionRows: [
      {
        manifestLabel: "*Shin*",
        targetRelativePath: "Characters/Hero070/Shin.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Hero070/Art/hero070.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Shin_DefaultSkin",
        heroLabel: "Shin",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero070",
        resourceStem: "Hero070_Torch_R",
        resourcePath: "Effects/Hero070/DefaultSkin/Hero070_Torch/Hero070_Torch_R.pfx",
      },
      {
        modelLabel: "Shin_DefaultSkin",
        heroLabel: "Shin",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero070",
        resourceStem: "Hero070_Wheelsparks",
        resourcePath: "Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Shin_Wheel_R", {
    effectToken: "Effect_Shin_Wheel_R",
    heroNames: ["Shin"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-unique-scored-candidate");
});

test("buildEffectResourceResolver promotes unsided tokens to exact left/right KindredEffects pairs", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Baron", kind: "Effect", name: "B_Jump" },
      { hero: "Baron", kind: "Effect", name: "B_JumpStartup" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Baron*",
        targetRelativePath: "Characters/Hero019/Baron.def",
        childResourceRows: "140",
        skeletonSamples: "Characters/Hero019/Art/hero019.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Baron_Skin_Terran_T1",
        heroLabel: "Baron",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_S1_B_Jump_LeftJet",
        resourcePath: "Effects/Hero019/S1/Hero019_S1_B_Jump_LeftJet/Hero019_S1_B_Jump_LeftJet.pfx",
      },
      {
        modelLabel: "Baron_Skin_Terran_T1",
        heroLabel: "Baron",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_S1_B_Jump_RightJet",
        resourcePath: "Effects/Hero019/S1/Hero019_S1_B_Jump_RightJet/Hero019_S1_B_Jump_RightJet.pfx",
      },
      {
        modelLabel: "Baron_Skin_Terran_T1",
        heroLabel: "Baron",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_S1_B_JumpStartup_LeftJet",
        resourcePath: "Effects/Hero019/S1/Hero019_S1_B_JumpStartup_LeftJet/Hero019_S1_B_JumpStartup_LeftJet.pfx",
      },
      {
        modelLabel: "Baron_Skin_Terran_T1",
        heroLabel: "Baron",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero019",
        resourceStem: "Hero019_S1_B_JumpStartup_RightJet",
        resourcePath: "Effects/Hero019/S1/Hero019_S1_B_JumpStartup_RightJet/Hero019_S1_B_JumpStartup_RightJet.pfx",
      },
    ],
  });

  const jump = resolver("Effect_Baron_B_Jump", {
    effectToken: "Effect_Baron_B_Jump",
    heroNames: ["Baron"],
    actionKeys: ["ability02"],
  });
  const startup = resolver("Effect_Baron_B_JumpStartup", {
    effectToken: "Effect_Baron_B_JumpStartup",
    heroNames: ["Baron"],
    actionKeys: ["ability02"],
  });

  assert.deepEqual(jump.resourcePaths, [
    "Effects/Hero019/S1/Hero019_S1_B_Jump_LeftJet/Hero019_S1_B_Jump_LeftJet.pfx",
    "Effects/Hero019/S1/Hero019_S1_B_Jump_RightJet/Hero019_S1_B_Jump_RightJet.pfx",
  ]);
  assert.deepEqual(startup.resourcePaths, [
    "Effects/Hero019/S1/Hero019_S1_B_JumpStartup_LeftJet/Hero019_S1_B_JumpStartup_LeftJet.pfx",
    "Effects/Hero019/S1/Hero019_S1_B_JumpStartup_RightJet/Hero019_S1_B_JumpStartup_RightJet.pfx",
  ]);
  assert.equal(jump.resourceMatchKind, "kindred-effect-slot-side-pair-semantic-alias");
});

test("buildEffectResourceResolver promotes numbered KindredEffects semantic variants", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Miho", kind: "Effect", name: "Mark_Lvl4" },
      { hero: "Kinetic", kind: "Effect", name: "B_A2_Available" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Miho*",
        targetRelativePath: "Characters/Hero066/Miho.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero066/Art/hero066.skeleton",
      },
      {
        manifestLabel: "*Kinetic*",
        targetRelativePath: "Characters/Hero048/Kinetic.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero048/Art/hero048.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Miho_DefaultSkin",
        heroLabel: "Miho",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero066",
        resourceStem: "Hero066_DEF_Mark3",
        resourcePath: "Effects/Hero066/Default/Hero066_DEF_Mark3/Hero066_DEF_Mark3.pfx",
      },
      {
        modelLabel: "Miho_DefaultSkin",
        heroLabel: "Miho",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero066",
        resourceStem: "Hero066_DEF_Mark4",
        resourcePath: "Effects/Hero066/Default/Hero066_DEF_Mark4/Hero066_DEF_Mark4.pfx",
      },
      {
        modelLabel: "Kinetic_DefaultSkin",
        heroLabel: "Kinetic",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_A",
        resourcePath: "Effects/Hero048/Hero048_A/Hero048_A.pfx",
      },
      {
        modelLabel: "Kinetic_DefaultSkin",
        heroLabel: "Kinetic",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_A2",
        resourcePath: "Effects/Hero048/Hero048_A2/Hero048_A2.pfx",
      },
    ],
  });

  const mark = resolver("Effect_Miho_Mark_Lvl4", {
    effectToken: "Effect_Miho_Mark_Lvl4",
    heroNames: ["Miho"],
  });
  const a2 = resolver("Effect_Kinetic_B_A2_Available", {
    effectToken: "Effect_Kinetic_B_A2_Available",
    heroNames: ["Kinetic"],
  });

  assert.deepEqual(mark.resourcePaths, ["Effects/Hero066/Default/Hero066_DEF_Mark4/Hero066_DEF_Mark4.pfx"]);
  assert.deepEqual(a2.resourcePaths, ["Effects/Hero048/Hero048_A2/Hero048_A2.pfx"]);
  assert.equal(mark.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(a2.resourceEvidenceSource, "kindred-effect-resource-slot");
});

test("buildEffectResourceResolver resolves bare ability channels through KindredEffects action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: "Effects/Hero048/Hero048_B_Buff/Hero048_B_Buff.pfx" },
      { relativePath: "Effects/Hero048/Hero048_B_Dash/Hero048_B_Dash.pfx" },
      { relativePath: "Effects/Hero048/S2/Hero048_S2_B_Buff/Hero048_S2_B_Buff.pfx" },
      { relativePath: "Effects/Hero048/S2/Hero048_S2_B_Dash/Hero048_S2_B_Dash.pfx" },
    ],
    heroNameRows: [{ hero: "Kinetic", kind: "Effect", name: "B" }],
    definitionRows: [
      {
        manifestLabel: "*Kinetic*",
        targetRelativePath: "Characters/Hero048/Kinetic.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero048/Art/hero048.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kinetic_DefaultSkin",
        heroLabel: "Kinetic",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "persistent",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_B_Buff",
        resourcePath: "Effects/Hero048/Hero048_B_Buff/Hero048_B_Buff.pfx",
      },
      {
        modelLabel: "Kinetic_DefaultSkin",
        heroLabel: "Kinetic",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_B_Dash",
        resourcePath: "Effects/Hero048/Hero048_B_Dash/Hero048_B_Dash.pfx",
      },
      {
        modelLabel: "Kinetic_Skin_Valkyrie",
        heroLabel: "Kinetic",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "persistent",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_S2_B_Buff",
        resourcePath: "Effects/Hero048/S2/Hero048_S2_B_Buff/Hero048_S2_B_Buff.pfx",
      },
      {
        modelLabel: "Kinetic_Skin_Valkyrie",
        heroLabel: "Kinetic",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_S2_B_Dash",
        resourcePath: "Effects/Hero048/S2/Hero048_S2_B_Dash/Hero048_S2_B_Dash.pfx",
      },
      {
        modelLabel: "Kinetic_DefaultSkin",
        heroLabel: "Kinetic",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero048",
        resourceStem: "Hero048_A",
        resourcePath: "Effects/Hero048/Hero048_A/Hero048_A.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Kinetic_B", {
    effectToken: "Effect_Kinetic_B",
    heroNames: ["Kinetic"],
    heroCodes: ["Hero048"],
    actionKeys: ["ability01", "ability02"],
    runtimeBinding: {
      kind: "effect-channel",
      effectOptions: {
        followTarget: true,
      },
    },
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero048/Hero048_B_Buff/Hero048_B_Buff.pfx",
    "Effects/Hero048/Hero048_B_Dash/Hero048_B_Dash.pfx",
    "Effects/Hero048/S2/Hero048_S2_B_Buff/Hero048_S2_B_Buff.pfx",
    "Effects/Hero048/S2/Hero048_S2_B_Dash/Hero048_S2_B_Dash.pfx",
  ]);
  assert.deepEqual(
    resolved.resourceVariants.map((variant) => [variant.modelLabel, variant.resourcePath, variant.actionKeys]),
    [
      ["Kinetic_DefaultSkin", "Effects/Hero048/Hero048_B_Buff/Hero048_B_Buff.pfx", ["ability02"]],
      ["Kinetic_DefaultSkin", "Effects/Hero048/Hero048_B_Dash/Hero048_B_Dash.pfx", ["ability02"]],
      ["Kinetic_Skin_Valkyrie", "Effects/Hero048/S2/Hero048_S2_B_Buff/Hero048_S2_B_Buff.pfx", ["ability02"]],
      ["Kinetic_Skin_Valkyrie", "Effects/Hero048/S2/Hero048_S2_B_Dash/Hero048_S2_B_Dash.pfx", ["ability02"]],
    ],
  );
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-bare-action-channel");
});

test("buildEffectResourceResolver resolves exact shadergraph-only effect groups without substituting sibling pfx resources", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero067/DEF/Hero067_C_WingsLeft/Hero067_C_WingsLeft.pfx",
      },
    ],
    shadergraphRows: [
      {
        status: "FOUND",
        relativePath: "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph",
      },
      {
        status: "FOUND",
        relativePath: "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[26].shadergraph",
      },
      {
        status: "FOUND",
        relativePath: "Effects/Hero067/S3/Hero067_S3_C_WingsRight/Hero067_S3_C_WingsRight.Surface[16].shadergraph",
      },
    ],
    heroNameRows: [{ hero: "Ishtar", kind: "Effect", name: "C_WingsRight" }],
    definitionRows: [
      {
        manifestLabel: "*Ishtar*",
        targetRelativePath: "Characters/Hero067/Ishtar.def",
        childResourceRows: "250",
        skeletonSamples: "Characters/Hero067/Art/hero067.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Ishtar_C_WingsRight", {
    effectToken: "Effect_Ishtar_C_WingsRight",
    heroNames: ["Ishtar"],
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.deepEqual(resolved.shadergraphGroupPaths, [
    "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight",
    "Effects/Hero067/S3/Hero067_S3_C_WingsRight/Hero067_S3_C_WingsRight",
  ]);
  assert.deepEqual(resolved.shadergraphPaths, [
    "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph",
    "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[26].shadergraph",
    "Effects/Hero067/S3/Hero067_S3_C_WingsRight/Hero067_S3_C_WingsRight.Surface[16].shadergraph",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.shadergraphEvidenceSource, "effect-shadergraph-exact-group");
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("readShadergraphCandidateRows parses headerless iOS shadergraph candidate rows", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-hook-shadergraphs-"));
  const filePath = path.join(tempDir, "ios_effect_shadergraph_candidates.tsv");
  fs.writeFileSync(
    filePath,
    [
      "FOUND\tEffects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph\t3E16217A26039C848167F9471E218DCE\textracted/ios_raw/Data/3E",
      "MISSING\tEffects/Hero067/DEF/Hero067_C_Missing/Hero067_C_Missing.Surface[16].shadergraph\t\t",
    ].join("\n"),
  );

  assert.deepEqual(readShadergraphCandidateRows(filePath), [
    {
      status: "FOUND",
      relativePath: "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph",
      hash: "3E16217A26039C848167F9471E218DCE",
      filePath: "extracted/ios_raw/Data/3E",
    },
    {
      status: "MISSING",
      relativePath: "Effects/Hero067/DEF/Hero067_C_Missing/Hero067_C_Missing.Surface[16].shadergraph",
      hash: "",
      filePath: "",
    },
  ]);
});

test("buildEffectHookRuntimeManifest carries shadergraph-only resources to runtime rows", () => {
  const resourceResolver = () => ({
    aliasStatus: "hero-alias-shadergraph",
    aliasEvidenceStrength: "strong",
    resourcePaths: [],
    resourceRoots: ["Hero067"],
    shadergraphMatchKind: "exact-shadergraph-group",
    shadergraphEvidenceSource: "effect-shadergraph-exact-group",
    shadergraphGroupPaths: ["Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight"],
    shadergraphPaths: ["Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph"],
  });

  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "ios",
        token: "Effect_Ishtar_C_WingsRight",
        bindKind: "effect-only",
        boneToken: "",
        effectToken: "Effect_Ishtar_C_WingsRight",
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        sourceFile: "functions/100427ed0.c",
        functionName: "FUN_100427ed0",
        line: "5331",
        instanceIndex: "1",
        hookPattern: "native-effect-vcall",
        sourceKind: "native-effect-vcall",
      },
    ],
    [],
    "2026-06-26T00:00:00.000Z",
    { resourceResolver },
  );

  assert.equal(manifest.summary.shadergraphOnlyRows, 1);
  assert.deepEqual(manifest.items[0].resourcePaths, []);
  assert.deepEqual(manifest.items[0].shadergraphPaths, [
    "Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph",
  ]);
  assert.equal(manifest.items[0].shadergraphEvidenceSource, "effect-shadergraph-exact-group");
});

test("buildEffectResourceResolver prefers projectile semantic slots over unique action fallbacks for shot tokens", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Viola", kind: "Effect", name: "A_Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Viola*",
        targetRelativePath: "Characters/Hero068/Viola.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero068/Art/hero068.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_A_Impact",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_A_Impact/Hero068_DEF_A_Impact.pfx",
      },
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_Shots",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_Shots/Hero068_DEF_Shots.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Viola_A_Shot", {
    effectToken: "Effect_Viola_A_Shot",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero068/DEF/Hero068_DEF_Shots/Hero068_DEF_Shots.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-semantic-alias");
});

test("buildEffectResourceResolver maps visual beam tokens to projectile action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Varya", kind: "Effect", name: "A_Beam" }],
    definitionRows: [
      {
        manifestLabel: "*Varya*",
        targetRelativePath: "Characters/Hero045/Varya.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero045/Art/hero045.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Varya_DefaultSkin",
        heroLabel: "Varya",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "cast",
        resourceRoot: "Hero045",
        resourceStem: "Hero045_A_Charging",
        resourcePath: "Effects/Hero045/Hero045_A_Charging/Hero045_A_Charging.pfx",
      },
      {
        modelLabel: "Varya_DefaultSkin",
        heroLabel: "Varya",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Hero045",
        resourceStem: "Hero045_A_Proj",
        resourcePath: "Effects/Hero045/Hero045_A_Proj/Hero045_A_Proj.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Varya_A_Beam", {
    effectToken: "Effect_Varya_A_Beam",
    actionKeys: ["ability01"],
    bindKind: "visual-bone-effect",
    sourceKind: "native-visual-binding",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero045/Hero045_A_Proj/Hero045_A_Proj.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-visual-beam-projectile");
});

test("buildEffectResourceResolver maps native start effects to cast action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Reza", kind: "Effect", name: "StartingTeleport" }],
    definitionRows: [
      {
        manifestLabel: "*Reza*",
        targetRelativePath: "Characters/Hero041/Reza.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero041/Art/hero041.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "persistent",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_C_Aura",
        resourcePath: "Effects/Hero041/Hero041_C_Aura/Hero041_C_Aura.pfx",
      },
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "cast",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_C_Cast",
        resourcePath: "Effects/Hero041/Hero041_C_Cast/Hero041_C_Cast.pfx",
      },
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_C_End",
        resourcePath: "Effects/Hero041/Hero041_C_End/Hero041_C_End.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Reza_StartingTeleport", {
    effectToken: "Effect_Reza_StartingTeleport",
    actionKeys: ["ability03"],
    nativeActionNames: ["Ability03_Start"],
    bindKind: "direct-locator-effect",
    sourceKind: "native-effect-spawn",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero041/Hero041_C_Cast/Hero041_C_Cast.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-start-cast");
});

test("buildEffectResourceResolver maps native aiming siblings to charging action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Kestrel", kind: "Effect", name: "C_Aiming" }],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "170",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "cast",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_C_Charging",
        resourcePath: "Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx",
      },
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "persistent",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_C_Warning_Ally",
        resourcePath: "Effects/Hero023/Hero023_C_Warning_Ally.assetbundle/Hero023_C_Warning_Ally.pfx",
      },
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "projectile",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_C_Shot_Burst",
        resourcePath: "Effects/Hero023/Hero023_C_Shot_Burst.assetbundle/Hero023_C_Shot_Burst.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_C_Aiming", {
    effectToken: "Effect_Kestrel_C_Aiming",
    actionKeys: ["ability03"],
    nativeActionNames: ["Ability03"],
    nativeNearbyEffectTokens: ["Effect_Kestrel_C_Charging"],
    nativeNearbySoundTokens: ["Sound_Kestrel_Ability_C_Activate"],
    bindKind: "effect-only",
    sourceKind: "native-effect-spawn",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-nearby-charging");
});

test("buildEffectResourceResolver maps scaled native ring channels to ground charging slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Yates", kind: "Effect", name: "B_ChargingRing" }],
    definitionRows: [
      {
        manifestLabel: "*Yates*",
        targetRelativePath: "Characters/Hero059/Yates.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero059/Art/hero059.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "cast",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_B_Cast",
        resourcePath: "Effects/Hero059/Hero059_B_Cast/Hero059_B_Cast.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "cast",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_B_Charging",
        resourcePath: "Effects/Hero059/Hero059_B_Charging/Hero059_B_Charging.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "cast",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_B_Charging_Ground",
        resourcePath: "Effects/Hero059/Hero059_B_Charging_Ground/Hero059_B_Charging_Ground.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Yates_B_ChargingRing", {
    effectToken: "Effect_Yates_B_ChargingRing",
    actionKeys: ["ability02"],
    boneToken: "",
    bindKind: "effect-only",
    sourceKind: "native-visual-binding",
    effectOptions: { scale: 3.5, visibleOrActive: true },
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero059/Hero059_B_Charging_Ground/Hero059_B_Charging_Ground.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-native-scaled-ground-ring");
});

test("buildEffectResourceResolver maps numbered status tokens to status action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Viola", kind: "Effect", name: "C3_DoT" }],
    definitionRows: [
      {
        manifestLabel: "*Viola*",
        targetRelativePath: "Characters/Hero068/Viola.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero068/Art/hero068.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "persistent",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Aura",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.pfx",
      },
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Cooldown",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Cooldown/Hero068_DEF_C_Cooldown.pfx",
      },
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_C_Status",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_C_Status/Hero068_DEF_C_Status.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Viola_C3_DoT", {
    effectToken: "Effect_Viola_C3_DoT",
    bindKind: "effect-only",
    sourceKind: "native-effect-vcall",
    effectOptions: { color: [0, 1, 0], scale: 0.2, fadeSeconds: 0.1 },
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero068/DEF/Hero068_DEF_C_Status/Hero068_DEF_C_Status.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-numbered-status");
});

test("buildEffectResourceResolver does not promote projectile tokens to non-projectile unique action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Viola", kind: "Effect", name: "A_Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Viola*",
        targetRelativePath: "Characters/Hero068/Viola.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero068/Art/hero068.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Viola_DefaultSkin",
        heroLabel: "Viola",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero068",
        resourceStem: "Hero068_DEF_A_Impact",
        resourcePath: "Effects/Hero068/DEF/Hero068_DEF_A_Impact/Hero068_DEF_A_Impact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Viola_A_Shot", {
    effectToken: "Effect_Viola_A_Shot",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver maps projectile tokens to base action effect slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Gwen", kind: "Effect", name: "Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Gwen*",
        targetRelativePath: "Characters/Hero037/Gwen.def",
        childResourceRows: "160",
        skeletonSamples: "Characters/Hero037/Art/hero037.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Gwen_DefaultSkin",
        heroLabel: "Gwen",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Hero037",
        resourceStem: "Hero037_C",
        resourcePath: "Effects/Hero037/Hero037_C/Hero037_C.pfx",
      },
      {
        modelLabel: "Gwen_DefaultSkin",
        heroLabel: "Gwen",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "cast",
        resourceRoot: "Hero037",
        resourceStem: "Hero037_C_Charge",
        resourcePath: "Effects/Hero037/Hero037_C_Charge/Hero037_C_Charge.pfx",
      },
      {
        modelLabel: "Gwen_DefaultSkin",
        heroLabel: "Gwen",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero037",
        resourceStem: "Hero037_C_Impact",
        resourcePath: "Effects/Hero037/Hero037_C_Impact/Hero037_C_Impact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Gwen_Shot", {
    effectToken: "Effect_Gwen_Shot",
    actionKeys: ["ability03"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero037/Hero037_C/Hero037_C.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-base-action-projectile");
});

test("buildEffectResourceResolver treats arrow tokens as projectiles for base action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Kestrel", kind: "Effect", name: "HalcyonArrow" }],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_A",
        resourcePath: "Effects/Hero023/Hero023_A.assetbundle/Hero023_A.pfx",
      },
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "cast",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_A_Charge1",
        resourcePath: "Effects/Hero023/Hero023_A_Charge1.assetbundle/Hero023_A_Charge1.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_HalcyonArrow", {
    effectToken: "Effect_Kestrel_HalcyonArrow",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero023/Hero023_A.assetbundle/Hero023_A.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-base-action-projectile");
});

test("buildEffectResourceResolver does not map projectile impact tokens to base projectile slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Kestrel", kind: "Effect", name: "HalcyonArrowImpact" }],
    definitionRows: [
      {
        manifestLabel: "*Kestrel*",
        targetRelativePath: "Characters/Hero023/Kestrel.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero023/Art/hero023.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Kestrel_DefaultSkin",
        heroLabel: "Kestrel",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero023",
        resourceStem: "Hero023_A",
        resourcePath: "Effects/Hero023/Hero023_A.assetbundle/Hero023_A.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Kestrel_HalcyonArrowImpact", {
    effectToken: "Effect_Kestrel_HalcyonArrowImpact",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver matches non-hero entity basenames through semantic effect terms", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Minions/Ranged/Shot.assetbundle/MinionRangedShot.pfx",
        hash: "MINION_RANGED_SHOT",
      },
      {
        relativePath: "Effects/Minions/Ranged/Impact.assetbundle/MinionRangedImpact.pfx",
        hash: "MINION_RANGED_IMPACT",
      },
      {
        relativePath: "Effects/Minions/Ranged/MF.assetbundle/MinionRangedMF.pfx",
        hash: "MINION_RANGED_MF",
      },
    ],
    heroNameRows: [
      { hero: "MinionRanged", kind: "Effect", name: "Projectile" },
      { hero: "MinionRanged", kind: "Effect", name: "HitImpact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Unrelated*",
        targetRelativePath: "Characters/Unrelated/Unrelated.def",
        childResourceRows: "0",
        skeletonSamples: "",
      },
    ],
  });

  const projectile = resolver("Effect_MinionRanged_Projectile", {
    effectToken: "Effect_MinionRanged_Projectile",
  });
  const impact = resolver("Effect_MinionRanged_HitImpact", {
    effectToken: "Effect_MinionRanged_HitImpact",
  });

  assert.deepEqual(projectile.resourcePaths, ["Effects/Minions/Ranged/Shot.assetbundle/MinionRangedShot.pfx"]);
  assert.equal(projectile.aliasEvidenceStrength, "strong");
  assert.equal(projectile.resourceEvidenceSource, "effect-resource-entity-basename");
  assert.equal(projectile.resourceMatchKind, "entity-basename-semantic-alias");
  assert.deepEqual(impact.resourcePaths, ["Effects/Minions/Ranged/Impact.assetbundle/MinionRangedImpact.pfx"]);
  assert.equal(impact.aliasEvidenceStrength, "strong");
  assert.equal(impact.resourceEvidenceSource, "effect-resource-entity-basename");
  assert.equal(impact.resourceMatchKind, "entity-basename-semantic-alias");
});

test("buildEffectResourceResolver matches non-hero entities through global KindredEffects resource groups", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "MinionLead", kind: "Effect", name: "Proj" },
      { hero: "MinionLead", kind: "Effect", name: "Proj_Hit" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Unrelated*",
        targetRelativePath: "Characters/Unrelated/Unrelated.def",
        childResourceRows: "0",
        skeletonSamples: "",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "minions",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "LeadMinion",
        resourceStem: "Minion_L_Proj",
        resourcePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "minions",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "impact",
        resourceRoot: "LeadMinion",
        resourceStem: "Minion_L_Proj_Hit",
        resourcePath: "Effects/LeadMinion/Minion_L_Proj_Hit.assetbundle/Minion_L_Proj_Hit.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "minions",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "LeadMinion",
        resourceStem: "Minion_L_MF",
        resourcePath: "Effects/LeadMinion/Minion_L_MF.assetbundle/Minion_L_MF.pfx",
      },
    ],
  });

  const projectile = resolver("Effect_MinionLead_Proj", {
    effectToken: "Effect_MinionLead_Proj",
  });
  const impact = resolver("Effect_MinionLead_Proj_Hit", {
    effectToken: "Effect_MinionLead_Proj_Hit",
  });

  assert.deepEqual(projectile.resourcePaths, ["Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx"]);
  assert.equal(projectile.aliasEvidenceStrength, "strong");
  assert.equal(projectile.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(projectile.resourceMatchKind, "kindred-global-effect-semantic-alias");
  assert.deepEqual(impact.resourcePaths, ["Effects/LeadMinion/Minion_L_Proj_Hit.assetbundle/Minion_L_Proj_Hit.pfx"]);
  assert.equal(impact.aliasEvidenceStrength, "strong");
  assert.equal(impact.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(impact.resourceMatchKind, "kindred-global-effect-semantic-alias");
});

test("buildEffectResourceResolver matches scoped non-hero effect resources from runtime entity tokens", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Items/EMP/EMP_Burst/EMP_Burst.pfx",
        hash: "EMP_BURST",
      },
      {
        relativePath: "Effects/Items/EMP/EMP_Charge/EMP_Charge.pfx",
        hash: "EMP_CHARGE",
      },
      {
        relativePath: "Effects/Items/EMP/EMP_Proj/EMP_Proj.pfx",
        hash: "EMP_PROJ",
      },
      {
        relativePath: "Effects/Items/ScoutTrap/ScoutTrap_Active.assetbundle/ScoutTrap_Active.pfx",
        hash: "SCOUTTRAP_ACTIVE",
      },
      {
        relativePath: "Effects/Items/ScoutTrap/ScoutTrap_Explosion_CNY/ScoutTrap_Explosion_CNY.pfx",
        hash: "SCOUTTRAP_EXPLOSION_CNY",
      },
      {
        relativePath: "Effects/5V5/VainCrystal/VainNode_DeadGlow/VainNode_DeadGlow.pfx",
        hash: "VAINNODE_DEADGLOW",
      },
      {
        relativePath: "Effects/5V5/VainCrystal/VainNode_Respawn/VainNode_Respawn.pfx",
        hash: "VAINNODE_RESPAWN",
      },
      {
        relativePath: "Effects/5V5/VainCrystal/VainNode_Timer/VainNode_Timer.pfx",
        hash: "VAINNODE_TIMER",
      },
      {
        relativePath: "Effects/Common/Tutorial/Tut_Chevron/Tut_Chevron.pfx",
        hash: "TUT_CHEVRON",
      },
    ],
    heroNameRows: [
      { hero: "Item", kind: "Effect", name: "EMP" },
      { hero: "Item", kind: "Effect", name: "EMP_Hit" },
      { hero: "ScoutTrap", kind: "Effect", name: "Explosion" },
      { hero: "Tutorial", kind: "Effect", name: "Chevrons" },
      { hero: "VainCrystal", kind: "Effect", name: "Node_DeadGlow" },
      { hero: "VainCrystal", kind: "Effect", name: "Node_Spawn" },
      { hero: "VainCrystal", kind: "Effect", name: "Node_Timer" },
    ],
    definitionRows: [
      {
        manifestLabel: "*ScoutTrap*",
        targetRelativePath: "Items/Actors/ScoutTrap.def",
        childResourceRows: "3",
        skeletonSamples: "",
      },
      {
        manifestLabel: "*Item_ScoutTrap*",
        targetRelativePath: "Items/Items.assetbundle/Standard/Item_ScoutTrap.def",
        childResourceRows: "1",
        skeletonSamples: "",
      },
      {
        manifestLabel: "*Item_NullwaveGauntlet*",
        targetRelativePath: "Items/Items.assetbundle/Standard/Item_NullwaveGauntlet.def",
        childResourceRows: "1",
        skeletonSamples: "",
      },
      {
        manifestLabel: "*VainCrystal_Home_5v5*",
        targetRelativePath: "Characters/VainCrystal/VainCrystal_Home_5v5.def",
        childResourceRows: "4",
        skeletonSamples: "",
      },
      {
        manifestLabel: "*Tutorial_RangedMinion*",
        targetRelativePath: "Characters/Tutorial/Tutorial_RangedMinion.def",
        childResourceRows: "1",
        skeletonSamples: "",
      },
    ],
  });

  const projectile = resolver("Effect_Item_EMP", {
    effectToken: "Effect_Item_EMP",
    selectorOutputRole: "projectile",
  });
  const ambiguousItem = resolver("Effect_Item_EMP", {
    effectToken: "Effect_Item_EMP",
    selectorOutputRole: "effect",
  });
  const empHit = resolver("Effect_Item_EMP_Hit", {
    effectToken: "Effect_Item_EMP_Hit",
  });
  const scoutTrapExplosion = resolver("Effect_ScoutTrap_Explosion", {
    effectToken: "Effect_ScoutTrap_Explosion",
  });
  const tutorialChevrons = resolver("Effect_Tutorial_Chevrons", {
    effectToken: "Effect_Tutorial_Chevrons",
  });
  const vainNodeDeadGlow = resolver("Effect_VainCrystal_Node_DeadGlow", {
    effectToken: "Effect_VainCrystal_Node_DeadGlow",
  });
  const vainNodeSpawn = resolver("Effect_VainCrystal_Node_Spawn", {
    effectToken: "Effect_VainCrystal_Node_Spawn",
  });
  const vainNodeTimer = resolver("Effect_VainCrystal_Node_Timer", {
    effectToken: "Effect_VainCrystal_Node_Timer",
  });

  assert.deepEqual(projectile.resourcePaths, ["Effects/Items/EMP/EMP_Proj/EMP_Proj.pfx"]);
  assert.equal(projectile.resourceEvidenceSource, "effect-resource-scoped-entity");
  assert.equal(projectile.resourceMatchKind, "scoped-entity-semantic-resource");
  assert.deepEqual(ambiguousItem.resourcePaths, []);
  assert.deepEqual(empHit.resourcePaths, ["Effects/Items/EMP/EMP_Burst/EMP_Burst.pfx"]);
  assert.deepEqual(scoutTrapExplosion.resourcePaths, ["Effects/Items/ScoutTrap/ScoutTrap_Explosion_CNY/ScoutTrap_Explosion_CNY.pfx"]);
  assert.deepEqual(tutorialChevrons.resourcePaths, ["Effects/Common/Tutorial/Tut_Chevron/Tut_Chevron.pfx"]);
  assert.deepEqual(vainNodeDeadGlow.resourcePaths, ["Effects/5V5/VainCrystal/VainNode_DeadGlow/VainNode_DeadGlow.pfx"]);
  assert.deepEqual(vainNodeSpawn.resourcePaths, ["Effects/5V5/VainCrystal/VainNode_Respawn/VainNode_Respawn.pfx"]);
  assert.deepEqual(vainNodeTimer.resourcePaths, ["Effects/5V5/VainCrystal/VainNode_Timer/VainNode_Timer.pfx"]);
});

test("buildEffectResourceResolver matches global selector fireball resources through runtime projectile roles", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Blackclaw", kind: "Effect", name: "BreathProjectile" },
      { hero: "Blackclaw", kind: "Effect", name: "BreathGround" },
      { hero: "Ghostwing", kind: "Effect", name: "Attack_Projectile_5v5" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Unrelated*",
        targetRelativePath: "Characters/Unrelated/Unrelated.def",
        childResourceRows: "0",
        skeletonSamples: "",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Blackclaw",
        resourceStem: "Blackclaw_Fireball",
        resourcePath: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_Lane_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_Lane_FireBreath/BlackClaw_Lane_FireBreath.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Blackclaw",
        resourceStem: "GhostWing_FireBall",
        resourcePath: "Effects/Blackclaw/GhostWing_FireBall/GhostWing_FireBall.pfx",
      },
    ],
  });

  const blackclawProjectile = resolver("Effect_Blackclaw_BreathProjectile", {
    effectToken: "Effect_Blackclaw_BreathProjectile",
    selectorOutputRole: "projectile",
  });
  const blackclawGround = resolver("Effect_Blackclaw_BreathGround", {
    effectToken: "Effect_Blackclaw_BreathGround",
    selectorOutputRole: "effect",
  });
  const ghostwingProjectile = resolver("Effect_Ghostwing_Attack_Projectile_5v5", {
    effectToken: "Effect_Ghostwing_Attack_Projectile_5v5",
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(blackclawProjectile.resourcePaths, ["Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx"]);
  assert.equal(blackclawProjectile.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(blackclawProjectile.resourceMatchKind, "kindred-global-effect-semantic-alias");
  assert.deepEqual(blackclawGround.resourcePaths, ["Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx"]);
  assert.deepEqual(ghostwingProjectile.resourcePaths, ["Effects/Blackclaw/GhostWing_FireBall/GhostWing_FireBall.pfx"]);
});

test("buildEffectResourceResolver matches unique low-score global effect-channel slots without promoting ties", () => {
  const baseRows = {
    effectRows: [],
    heroNameRows: [{ hero: "Blackclaw", kind: "Effect", name: "BreathSelf" }],
    definitionRows: [
      {
        manifestLabel: "*Unrelated*",
        targetRelativePath: "Characters/Unrelated/Unrelated.def",
        childResourceRows: "0",
        skeletonSamples: "",
      },
    ],
  };
  const runtimeRow = {
    effectToken: "Effect_Blackclaw_BreathSelf",
    sourceKind: "native-effect-vcall",
    bindKind: "effect-only",
    runtimeBinding: { kind: "effect-channel" },
  };
  const resolver = buildEffectResourceResolver({
    ...baseRows,
    kindredSlots: [
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_Lane_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_Lane_FireBreath/BlackClaw_Lane_FireBreath.pfx",
      },
    ],
  });
  const ambiguousResolver = buildEffectResourceResolver({
    ...baseRows,
    kindredSlots: [
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_Lane_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_Lane_FireBreath/BlackClaw_Lane_FireBreath.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Blackclaw",
        resourceStem: "BlackClaw_Cave_FireBreath",
        resourcePath: "Effects/Blackclaw/BlackClaw_Cave_FireBreath/BlackClaw_Cave_FireBreath.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Blackclaw_BreathSelf", runtimeRow);
  const ambiguous = ambiguousResolver("Effect_Blackclaw_BreathSelf", runtimeRow);

  assert.deepEqual(resolved.resourcePaths, ["Effects/Blackclaw/BlackClaw_FireBreath/BlackClaw_FireBreath.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-global-effect-semantic-alias");
  assert.equal(ambiguous.resourcePaths.length, 0);
}
);

test("buildEffectResourceResolver matches short non-hero global KindredEffects resources by entity root and exact stem term", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Kraken", kind: "Effect", name: "Breath" },
      { hero: "Kraken", kind: "Effect", name: "Spawn" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Kraken_5v5*",
        targetRelativePath: "Characters/Kraken/Kraken_5v5.def",
        childResourceRows: "12",
        skeletonSamples: "Characters/Kraken/Art/kraken.skeleton",
      },
      {
        manifestLabel: "*Kraken_Captured*",
        targetRelativePath: "Characters/Kraken/Kraken_Captured.def",
        childResourceRows: "13",
        skeletonSamples: "Characters/Kraken/Art/kraken.skeleton",
      },
      {
        manifestLabel: "*Kraken_Jungle*",
        targetRelativePath: "Characters/Kraken/Kraken_Jungle.def",
        childResourceRows: "11",
        skeletonSamples: "Characters/Kraken/Art/kraken.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Kraken",
        resourceStem: "Breath",
        resourcePath: "Effects/Kraken/Breath.assetbundle/Breath.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Kraken",
        resourceStem: "Shell_Glow",
        resourcePath: "Effects/Kraken/Shell_Glow.assetbundle/Shell_Glow.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Kraken",
        resourceStem: "Kraken_Spawn1",
        resourcePath: "Effects/Kraken/Kraken_Spawn1.assetbundle/Kraken_Spawn1.pfx",
      },
      {
        sourceKind: "kindred-global-effect-resource-slot",
        groupLabel: "kraken",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Kraken",
        resourceStem: "Kraken_Spawn2",
        resourcePath: "Effects/Kraken/Kraken_Spawn2.assetbundle/Kraken_Spawn2.pfx",
      },
    ],
  });

  const breath = resolver("Effect_Kraken_Breath", {
    effectToken: "Effect_Kraken_Breath",
  });

  assert.deepEqual(breath.resourcePaths, ["Effects/Kraken/Breath.assetbundle/Breath.pfx"]);
  assert.equal(breath.aliasEvidenceStrength, "strong");
  assert.equal(breath.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(breath.resourceMatchKind, "kindred-global-effect-semantic-alias");

  const spawn = resolver("Effect_Kraken_Spawn", {
    effectToken: "Effect_Kraken_Spawn",
  });

  assert.deepEqual(spawn.resourcePaths, [
    "Effects/Kraken/Kraken_Spawn1.assetbundle/Kraken_Spawn1.pfx",
    "Effects/Kraken/Kraken_Spawn2.assetbundle/Kraken_Spawn2.pfx",
  ]);
  assert.equal(spawn.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(spawn.resourceMatchKind, "kindred-global-effect-semantic-alias");
});

test("buildEffectResourceResolver promotes unique scored KindredEffects candidates with skin metadata", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Lyra", kind: "Effect", name: "B_E" }],
    definitionRows: [
      {
        manifestLabel: "*Lyra*",
        targetRelativePath: "Characters/Hero025/Lyra.def",
        childResourceRows: "220",
        skeletonSamples: "Characters/Hero025/Art/hero025.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Lyra_Skin_Water",
        heroLabel: "Lyra",
        skinKind: "skin",
        actionKeys: ["ability02"],
        role: "effect",
        resourceRoot: "Hero025",
        resourceStem: "Effect_Lyra_WTR_B_Bullwark_Form",
        resourcePath: "Effects/Hero025/WTR/Hero025_WTR_B_Bullwark_Form/Effect_Lyra_WTR_B_Bullwark_Form.pfx",
      },
      {
        modelLabel: "Lyra_Skin_Water",
        heroLabel: "Lyra",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero025",
        resourceStem: "Hero025_WTR_Portal_Form_A",
        resourcePath: "Effects/Hero025/WTR/Hero025_WTR_Portal_Form_A/Hero025_WTR_Portal_Form_A.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Lyra_B_E", {
    effectToken: "Effect_Lyra_B_E",
    actionKeys: ["ability02", "ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero025/WTR/Hero025_WTR_B_Bullwark_Form/Effect_Lyra_WTR_B_Bullwark_Form.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-unique-scored-candidate");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Hero025/WTR/Hero025_WTR_B_Bullwark_Form/Effect_Lyra_WTR_B_Bullwark_Form.pfx",
      modelLabel: "Lyra_Skin_Water",
      skinKind: "skin",
      heroLabel: "Lyra",
    },
  ]);
});

test("buildEffectResourceResolver uses selector output roles to promote action-gated KindredEffects variants", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Silvernail", kind: "Effect", name: "DefaultAttack" }],
    definitionRows: [
      {
        manifestLabel: "*Silvernail*",
        targetRelativePath: "Characters/Hero055/Silvernail.def",
        childResourceRows: "200",
        skeletonSamples: "Characters/Hero055/Art/hero055.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "projectile",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_AA_Bolt",
        resourcePath: "Effects/Hero055/Hero055_AA_Bolt/Hero055_AA_Bolt.pfx",
      },
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_AA_Impact",
        resourcePath: "Effects/Hero055/Hero055_AA_Impact/Hero055_AA_Impact.pfx",
      },
      {
        modelLabel: "Silvernail_Skin_Medieval",
        heroLabel: "Silvernail",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "projectile",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_MED_AA_Bolt",
        resourcePath: "Effects/Hero055/MED/Hero055_MED_AA_Bolt/Hero055_MED_AA_Bolt.pfx",
      },
      {
        modelLabel: "Silvernail_Skin_Medieval",
        heroLabel: "Silvernail",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero055",
        resourceStem: "Hero055_MED_AA_Impact",
        resourcePath: "Effects/Hero055/MED/Hero055_MED_AA_Impact/Hero055_MED_AA_Impact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Silvernail_DefaultAttack", {
    effectToken: "Effect_Silvernail_DefaultAttack",
    actionKeys: ["attack", "attack_crit"],
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero055/Hero055_AA_Bolt/Hero055_AA_Bolt.pfx",
    "Effects/Hero055/MED/Hero055_MED_AA_Bolt/Hero055_MED_AA_Bolt.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-role");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Hero055/Hero055_AA_Bolt/Hero055_AA_Bolt.pfx",
      modelLabel: "Silvernail_DefaultSkin",
      skinKind: "default",
      heroLabel: "Silvernail",
    },
    {
      resourcePath: "Effects/Hero055/MED/Hero055_MED_AA_Bolt/Hero055_MED_AA_Bolt.pfx",
      modelLabel: "Silvernail_Skin_Medieval",
      skinKind: "skin",
      heroLabel: "Silvernail",
    },
  ]);
});

test("buildEffectResourceResolver uses selector intent to map default attack impacts through KindredEffects slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "AdagioDefaultAttack", kind: "Effect", name: "impact" },
      { hero: "Adagio", kind: "Effect", name: "ArcaneFire_Impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_ProjectileImpact",
        resourcePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
      },
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_Stun_Impact",
        resourcePath: "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx",
      },
      {
        modelLabel: "Adagio_Skin_Angel",
        heroLabel: "Adagio",
        skinKind: "skin",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_S2_ProjectileImpact",
        resourcePath: "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_AdagioDefaultAttack_impact", {
    effectToken: "Effect_AdagioDefaultAttack_impact",
    actionKeys: ["attack"],
    heroNames: ["Adagio", "AdagioDefaultAttack"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
    "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-intent");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
      modelLabel: "Adagio_DefaultSkin",
      skinKind: "default",
      heroLabel: "Adagio",
    },
    {
      resourcePath: "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.pfx",
      modelLabel: "Adagio_Skin_Angel",
      skinKind: "skin",
      heroLabel: "Adagio",
    },
  ]);
});

test("buildEffectResourceResolver does not promote selector intent when a model has multiple best slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "HeroX", kind: "Effect", name: "DefaultAttack_impact" }],
    definitionRows: [
      {
        manifestLabel: "*HeroX*",
        targetRelativePath: "Characters/HeroX/HeroX.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero999/Art/hero999.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "HeroX_DefaultSkin",
        heroLabel: "HeroX",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero999",
        resourceStem: "Hero999_ProjectileImpact_A",
        resourcePath: "Effects/Hero999/Hero999_ProjectileImpact_A/Hero999_ProjectileImpact_A.pfx",
      },
      {
        modelLabel: "HeroX_DefaultSkin",
        heroLabel: "HeroX",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero999",
        resourceStem: "Hero999_ProjectileImpact_B",
        resourcePath: "Effects/Hero999/Hero999_ProjectileImpact_B/Hero999_ProjectileImpact_B.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_HeroX_DefaultAttack_impact", {
    effectToken: "Effect_HeroX_DefaultAttack_impact",
    actionKeys: ["attack"],
    heroNames: ["HeroX"],
    selectorOutputRole: "impact",
  });

  assert.notEqual(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-intent");
});

test("buildEffectResourceResolver maps selector basic attacks to AA KindredEffects shorthand slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Ishtar", kind: "Effect", name: "BasicAttack" }],
    definitionRows: [
      {
        manifestLabel: "*Ishtar*",
        targetRelativePath: "Characters/Hero067/Ishtar.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero067/Art/hero067.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Ishtar_DefaultSkin",
        heroLabel: "Ishtar",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Hero067",
        resourceStem: "Hero067_AA",
        resourcePath: "Effects/Hero067/DEF/Hero067_AA/Hero067_AA.pfx",
      },
      {
        modelLabel: "Ishtar_DefaultSkin",
        heroLabel: "Ishtar",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Hero067",
        resourceStem: "Hero067_Minion_AA",
        resourcePath: "Effects/Hero067/DEF/Hero067_Minion_AA/Hero067_Minion_AA.pfx",
      },
      {
        modelLabel: "Ishtar_Skin_Vday",
        heroLabel: "Ishtar",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Hero067",
        resourceStem: "Hero067_S3_AA",
        resourcePath: "Effects/Hero067/S3/Hero067_S3_AA/Hero067_S3_AA.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Ishtar_BasicAttack", {
    effectToken: "Effect_Ishtar_BasicAttack",
    actionKeys: ["attack"],
    heroNames: ["Ishtar"],
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero067/DEF/Hero067_AA/Hero067_AA.pfx",
    "Effects/Hero067/S3/Hero067_S3_AA/Hero067_S3_AA.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-intent");
});

test("buildEffectResourceResolver keeps selector basic attacks unresolved when stance variants are ambiguous", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Malene", kind: "Effect", name: "DefaultAttack" }],
    definitionRows: [
      {
        manifestLabel: "*Malene*",
        targetRelativePath: "Characters/Hero022/Malene.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero022/Art/hero022.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_AA_Dark",
        resourcePath: "Effects/Hero022/Hero022_AA_Dark/Hero022_AA_Dark.pfx",
      },
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "effect",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_AA_Light",
        resourcePath: "Effects/Hero022/Hero022_AA_Light/Hero022_AA_Light.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Malene_DefaultAttack", {
    effectToken: "Effect_Malene_DefaultAttack",
    actionKeys: ["attack"],
    heroNames: ["Malene"],
    selectorOutputRole: "projectile",
  });

  assert.notEqual(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-intent");
  assert.deepEqual(resolved.resourcePaths, []);
});

test("buildEffectResourceResolver narrows selector state variants from native state terms", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Malene", kind: "Effect", name: "A1Projectile" },
      { hero: "Malene", kind: "Effect", name: "A1Hit" },
      { hero: "Malene", kind: "Effect", name: "A2Projectile" },
      { hero: "Malene", kind: "Effect", name: "A2Hit" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Malene*",
        targetRelativePath: "Characters/Hero022/Malene.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero022/Art/hero022.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_Proj_Emp_Light",
        resourcePath: "Effects/Hero022/Hero022_Proj_Emp_Light/Hero022_Proj_Emp_Light.pfx",
      },
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_Proj_Emp_Dark",
        resourcePath: "Effects/Hero022/Hero022_Proj_Emp_Dark/Hero022_Proj_Emp_Dark.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_Proj_Emp_Light",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_Proj_Emp_Light/Hero022_CANDY_Proj_Emp_Light.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_Proj_Emp_Dark",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_Proj_Emp_Dark/Hero022_CANDY_Proj_Emp_Dark.pfx",
      },
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_A_Light_Hit",
        resourcePath: "Effects/Hero022/Hero022_A_Light_Hit/Hero022_A_Light_Hit.pfx",
      },
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_A_Dark_Hit",
        resourcePath: "Effects/Hero022/Hero022_A_Dark_Hit/Hero022_A_Dark_Hit.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_A_Light_Hit",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_A_Light_Hit/Hero022_CANDY_A_Light_Hit.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_A_Dark_Hit",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_A_Dark_Hit/Hero022_CANDY_A_Dark_Hit.pfx",
      },
    ],
  });

  const lightProjectile = resolver("Effect_Malene_A1Projectile", {
    effectToken: "Effect_Malene_A1Projectile",
    actionKeys: ["ability01"],
    heroNames: ["Malene"],
    selectorOutputRole: "projectile",
    selectorStateTerms: ["light"],
  });
  const lightHit = resolver("Effect_Malene_A1Hit", {
    effectToken: "Effect_Malene_A1Hit",
    actionKeys: ["ability01"],
    heroNames: ["Malene"],
    selectorOutputRole: "impact",
    selectorStateTerms: ["light"],
  });
  const darkHit = resolver("Effect_Malene_A2Hit", {
    effectToken: "Effect_Malene_A2Hit",
    actionKeys: ["ability01"],
    heroNames: ["Malene"],
    selectorOutputRole: "impact",
    selectorStateTerms: ["dark"],
  });

  assert.deepEqual(lightProjectile.resourcePaths, [
    "Effects/Hero022/CANDY/Hero022_CANDY_Proj_Emp_Light/Hero022_CANDY_Proj_Emp_Light.pfx",
    "Effects/Hero022/Hero022_Proj_Emp_Light/Hero022_Proj_Emp_Light.pfx",
  ]);
  assert.deepEqual(lightHit.resourcePaths, [
    "Effects/Hero022/CANDY/Hero022_CANDY_A_Light_Hit/Hero022_CANDY_A_Light_Hit.pfx",
    "Effects/Hero022/Hero022_A_Light_Hit/Hero022_A_Light_Hit.pfx",
  ]);
  assert.deepEqual(darkHit.resourcePaths, [
    "Effects/Hero022/CANDY/Hero022_CANDY_A_Dark_Hit/Hero022_CANDY_A_Dark_Hit.pfx",
    "Effects/Hero022/Hero022_A_Dark_Hit/Hero022_A_Dark_Hit.pfx",
  ]);
  assert.equal(lightProjectile.resourceMatchKind, "kindred-effect-slot-selector-output-role");
  assert.equal(lightHit.resourceMatchKind, "kindred-effect-slot-selector-output-role");
  assert.equal(darkHit.resourceMatchKind, "kindred-effect-slot-selector-output-role");
});

test("buildEffectResourceResolver prefers selector runtime filters over broad direct hero aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      { relativePath: "Effects/Hero022/Hero022_AA_Dark_Hit/Hero022_AA_Dark_Hit.pfx" },
      { relativePath: "Effects/Hero022/Hero022_A_Dark_Hit/Hero022_A_Dark_Hit.pfx" },
      { relativePath: "Effects/Hero022/CANDY/Hero022_CANDY_AA_Dark_Hit/Hero022_CANDY_AA_Dark_Hit.pfx" },
      { relativePath: "Effects/Hero022/CANDY/Hero022_CANDY_A_Dark_Hit/Hero022_CANDY_A_Dark_Hit.pfx" },
    ],
    heroNameRows: [{ hero: "Malene", kind: "Effect", name: "DarkHit" }],
    definitionRows: [
      {
        manifestLabel: "*Malene*",
        targetRelativePath: "Characters/Hero022/Malene.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero022/Art/hero022.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_AA_Dark_Hit",
        resourcePath: "Effects/Hero022/Hero022_AA_Dark_Hit/Hero022_AA_Dark_Hit.pfx",
      },
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_A_Dark_Hit",
        resourcePath: "Effects/Hero022/Hero022_A_Dark_Hit/Hero022_A_Dark_Hit.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_AA_Dark_Hit",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_AA_Dark_Hit/Hero022_CANDY_AA_Dark_Hit.pfx",
      },
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero022",
        resourceStem: "Hero022_CANDY_A_Dark_Hit",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_A_Dark_Hit/Hero022_CANDY_A_Dark_Hit.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Malene_DarkHit", {
    effectToken: "Effect_Malene_DarkHit",
    actionKeys: ["attack"],
    heroNames: ["Malene"],
    selectorOutputRole: "impact",
    selectorStateTerms: ["dark"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero022/CANDY/Hero022_CANDY_AA_Dark_Hit/Hero022_CANDY_AA_Dark_Hit.pfx",
    "Effects/Hero022/Hero022_AA_Dark_Hit/Hero022_AA_Dark_Hit.pfx",
  ]);
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-selector-output-role");
});

test("buildEffectResourceResolver maps placeholder hero selector projectiles through generic KindredEffects slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Hero052", kind: "Effect", name: "Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Hero052*",
        targetRelativePath: "Characters/Hero052/Hero052.def",
        childResourceRows: "11",
        meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Shot_1_A",
        resourcePath: "Effects/Hero000/Hero000_Shot_1_A/Hero000_Shot_1_A.pfx",
        effectTokens: ["Effect_Hero052_A"],
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Shot_1_E",
        resourcePath: "Effects/Hero000/Hero000_Shot_1_E/Hero000_Shot_1_E.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj",
        resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj",
        resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj_Hit",
        resourcePath: "Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx",
        effectTokens: ["Effect_Hero052_A_Impact"],
      },
    ],
  });

  const resolved = resolver("Effect_Hero052_Shot", {
    effectToken: "Effect_Hero052_Shot",
    actionKeys: ["ability01"],
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero000/Hero000_Shot_1_A/Hero000_Shot_1_A.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
  assert.deepEqual(resolved.resourceVariants, [
    {
      resourcePath: "Effects/Hero000/Hero000_Shot_1_A/Hero000_Shot_1_A.pfx",
      modelLabel: "Hero000_DefaultSkin",
      skinKind: "default",
      heroLabel: "Hero000",
    },
  ]);
});

test("buildEffectResourceResolver maps placeholder basic attacks through actionless Hero000 generic slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Maaya", kind: "Effect", name: "BasicAttack" },
      { hero: "Maaya", kind: "Effect", name: "BasicAttack_Impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Hero072*",
        targetRelativePath: "Characters/Hero072/Maaya.def",
        childResourceRows: "9",
        meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Shot_1_E",
        resourcePath: "Effects/Hero000/Hero000_Shot_1_E/Hero000_Shot_1_E.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj",
        resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj_Hit",
        resourcePath: "Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Shot_1_A",
        resourcePath: "Effects/Hero000/Hero000_Shot_1_A/Hero000_Shot_1_A.pfx",
      },
    ],
  });

  const projectile = resolver("Effect_Maaya_BasicAttack", {
    effectToken: "Effect_Maaya_BasicAttack",
    actionKeys: ["attack"],
    selectorOutputRole: "projectile",
  });
  const impact = resolver("Effect_Maaya_BasicAttack_Impact", {
    effectToken: "Effect_Maaya_BasicAttack_Impact",
    actionKeys: ["attack"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(projectile.resourcePaths, ["Effects/Hero000/Hero000_Shot_1_E/Hero000_Shot_1_E.pfx"]);
  assert.equal(projectile.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(projectile.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
  assert.deepEqual(impact.resourcePaths, ["Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx"]);
  assert.equal(impact.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(impact.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
});

test("buildEffectResourceResolver maps placeholder ability projectiles through unsuffixed Hero000 generic slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [
      { hero: "Hero053", kind: "Effect", name: "B_Proj" },
      { hero: "Hero053", kind: "Effect", name: "B_Impact" },
      { hero: "Hero052", kind: "Effect", name: "Shot_B" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Hero053*",
        targetRelativePath: "Characters/Hero053/Hero053.def",
        childResourceRows: "11",
        meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
      {
        manifestLabel: "*Hero052*",
        targetRelativePath: "Characters/Hero052/Hero052.def",
        childResourceRows: "11",
        meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj",
        resourcePath: "Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj_V2",
        resourcePath: "Effects/Hero000/Hero000_Proj_V2/Hero000_Proj_V2.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Proj_Hit",
        resourcePath: "Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Shot_1_E",
        resourcePath: "Effects/Hero000/Hero000_Shot_1_E/Hero000_Shot_1_E.pfx",
      },
    ],
  });

  const projectile = resolver("Effect_Hero053_B_Proj", {
    effectToken: "Effect_Hero053_B_Proj",
    actionKeys: ["ability02"],
    selectorOutputRole: "projectile",
  });
  const impact = resolver("Effect_Hero053_B_Impact", {
    effectToken: "Effect_Hero053_B_Impact",
    actionKeys: ["ability02"],
    selectorOutputRole: "impact",
  });
  const shot = resolver("Effect_Hero052_Shot_B", {
    effectToken: "Effect_Hero052_Shot_B",
    actionKeys: ["ability02"],
    selectorOutputRole: "projectile",
  });

  assert.deepEqual(projectile.resourcePaths, ["Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx"]);
  assert.equal(projectile.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
  assert.deepEqual(impact.resourcePaths, ["Effects/Hero000/Hero000_Proj_Hit/Hero000_Proj_Hit.pfx"]);
  assert.equal(impact.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
  assert.deepEqual(shot.resourcePaths, ["Effects/Hero000/Hero000_Proj/Hero000_Proj.pfx"]);
  assert.equal(shot.resourceMatchKind, "kindred-placeholder-generic-selector-output-role");
});

test("buildEffectResourceResolver maps placeholder action effects through exact Hero000 generic semantic slots without selector roles", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Hero053", kind: "Effect", name: "A_Beam" }],
    definitionRows: [
      {
        manifestLabel: "*Hero053*",
        targetRelativePath: "Characters/Hero053/Hero053.def",
        childResourceRows: "11",
        meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Beam_1_A",
        resourcePath: "Effects/Hero000/Hero000_Beam_1_A/Hero000_Beam_1_A.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "projectile",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Orb_A",
        resourcePath: "Effects/Hero000/Hero000_Orb_A/Hero000_Orb_A.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Hero053_A_Beam", {
    effectToken: "Effect_Hero053_A_Beam",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero000/Hero000_Beam_1_A/Hero000_Beam_1_A.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-placeholder-generic-semantic-action");
});

test("buildEffectResourceResolver maps placeholder actionless semantic effects to unsuffixed Hero000 generic slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Hero050", kind: "Effect", name: "StackedDeck" }],
    definitionRows: [
      {
        manifestLabel: "*Hero050*",
        targetRelativePath: "Characters/Hero050/Hero050.def",
        childResourceRows: "11",
        skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
      },
    ],
    kindredSlots: [
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Stacks",
        resourcePath: "Effects/Hero000/Hero000_Stacks/Hero000_Stacks.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Stack_E_1",
        resourcePath: "Effects/Hero000/Hero000_Stack_E_1/Hero000_Stack_E_1.pfx",
      },
      {
        sourceKind: "kindred-effect-resource-slot",
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero000",
        resourceStem: "Hero000_Stack_A_1",
        resourcePath: "Effects/Hero000/Hero000_Stack_A_1/Hero000_Stack_A_1.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Hero050_StackedDeck", {
    effectToken: "Effect_Hero050_StackedDeck",
    boneToken: "Bone_RightHand",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero000/Hero000_Stacks/Hero000_Stacks.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-global-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-placeholder-generic-semantic");
});

test("buildEffectResourceResolver does not map projectile tokens to cast-only action slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [],
    heroNameRows: [{ hero: "Reza", kind: "Effect", name: "A_Shot" }],
    definitionRows: [
      {
        manifestLabel: "*Reza*",
        targetRelativePath: "Characters/Hero041/Reza.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero041/Art/hero041.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "cast",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_A_Cast",
        resourcePath: "Effects/Hero041/Hero041_A_Cast/Hero041_A_Cast.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Reza_A_Shot", {
    effectToken: "Effect_Reza_A_Shot",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, []);
  assert.equal(resolved.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver promotes unique weak candidates confirmed by KindredEffects slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx",
        hash: "SHIN_WHEELSPARKS",
      },
    ],
    heroNameRows: [{ hero: "Shin", kind: "Effect", name: "Wheel_L" }],
    definitionRows: [
      {
        manifestLabel: "*Shin*",
        targetRelativePath: "Characters/Hero070/Shin.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero070/Art/hero070.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Shin_DefaultSkin",
        heroLabel: "Shin",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero070",
        resourceStem: "Hero070_Wheelsparks",
        resourcePath: "Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Shin_Wheel_L", {
    effectToken: "Effect_Shin_Wheel_L",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-effect-slot-weak-candidate-confirmed");
});

test("buildEffectResourceResolver narrows actionless weak candidates to actionless Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero041/Hero041_C_Explosion/Hero041_C_Explosion.pfx",
        hash: "REZA_C_EXPLOSION",
      },
      {
        relativePath: "Effects/Hero041/Hero041_Perk_Explosion/Hero041_Perk_Explosion.pfx",
        hash: "REZA_PERK_EXPLOSION",
      },
      {
        relativePath: "Effects/Hero041/S1/Hero041_S1_C_Explosion/Hero041_S1_C_Explosion.pfx",
        hash: "REZA_S1_C_EXPLOSION",
      },
      {
        relativePath: "Effects/Hero041/S1/Hero041_S1_Perk_Explosion/Hero041_S1_Perk_Explosion.pfx",
        hash: "REZA_S1_PERK_EXPLOSION",
      },
    ],
    heroNameRows: [{ hero: "Reza", kind: "Effect", name: "Explosion_5mr" }],
    definitionRows: [
      {
        manifestLabel: "*Reza*",
        targetRelativePath: "Characters/Hero041/Reza.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero041/Art/hero041.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_C_Explosion",
        resourcePath: "Effects/Hero041/Hero041_C_Explosion/Hero041_C_Explosion.pfx",
      },
      {
        modelLabel: "Reza_DefaultSkin",
        heroLabel: "Reza",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_Perk_Explosion",
        resourcePath: "Effects/Hero041/Hero041_Perk_Explosion/Hero041_Perk_Explosion.pfx",
      },
      {
        modelLabel: "Reza_Skin_CNY",
        heroLabel: "Reza",
        skinKind: "skin",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_S1_C_Explosion",
        resourcePath: "Effects/Hero041/S1/Hero041_S1_C_Explosion/Hero041_S1_C_Explosion.pfx",
      },
      {
        modelLabel: "Reza_Skin_CNY",
        heroLabel: "Reza",
        skinKind: "skin",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Hero041",
        resourceStem: "Hero041_S1_Perk_Explosion",
        resourcePath: "Effects/Hero041/S1/Hero041_S1_Perk_Explosion/Hero041_S1_Perk_Explosion.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Reza_Explosion_5mr", {
    effectToken: "Effect_Reza_Explosion_5mr",
    heroNames: ["Reza"],
    heroResourceRoots: ["Hero041", "Reza"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Hero041/Hero041_Perk_Explosion/Hero041_Perk_Explosion.pfx",
    "Effects/Hero041/S1/Hero041_S1_Perk_Explosion/Hero041_S1_Perk_Explosion.pfx",
  ]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-actionless-weak-candidate");
});

test("buildEffectResourceResolver narrows terminal state weak candidates to actionless cast Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero069/Hero069_Ability01_Attack/Hero069_Ability01_Attack.pfx",
        hash: "AMAEL_A_ATTACK",
      },
      {
        relativePath: "Effects/Hero069/Hero069_Ability01_Impact/Hero069_Ability01_Impact.pfx",
        hash: "AMAEL_A_IMPACT",
      },
      {
        relativePath: "Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx",
        hash: "AMAEL_CHARGED",
      },
    ],
    heroNameRows: [{ hero: "Amael", kind: "Effect", name: "Ability01_Charged" }],
    definitionRows: [
      {
        manifestLabel: "*Amael*",
        targetRelativePath: "Characters/Hero069/Amael.def",
        childResourceRows: "180",
        skeletonSamples: "Characters/Hero069/Art/hero069.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Amael_DefaultSkin",
        heroLabel: "Amael",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "effect",
        resourceRoot: "Hero069",
        resourceStem: "Hero069_Ability01_Attack",
        resourcePath: "Effects/Hero069/Hero069_Ability01_Attack/Hero069_Ability01_Attack.pfx",
      },
      {
        modelLabel: "Amael_DefaultSkin",
        heroLabel: "Amael",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero069",
        resourceStem: "Hero069_Ability01_Impact",
        resourcePath: "Effects/Hero069/Hero069_Ability01_Impact/Hero069_Ability01_Impact.pfx",
      },
      {
        modelLabel: "Amael_DefaultSkin",
        heroLabel: "Amael",
        skinKind: "default",
        actionKeys: [],
        role: "cast",
        resourceRoot: "Hero069",
        resourceStem: "Hero069_Charged",
        resourcePath: "Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Amael_Ability01_Charged", {
    effectToken: "Effect_Amael_Ability01_Charged",
    heroNames: ["Amael"],
    heroResourceRoots: ["Hero069", "Amael"],
    boneToken: "Bone_RightHand",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero069/Hero069_Charged/Hero069_Charged.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-actionless-terminal-state-candidate");
});

test("buildEffectResourceResolver promotes unique selector-role weak candidates when the resource role matches", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero064/Default/Hero064_DEF_A_Shot_Impact/Hero064_DEF_A_Shot_Impact.pfx",
        hash: "CAINE_A_SHOT_IMPACT",
      },
    ],
    heroNameRows: [{ hero: "Caine", kind: "Effect", name: "DefaultAttack_Impact" }],
    definitionRows: [
      {
        manifestLabel: "*Caine*",
        targetRelativePath: "Characters/Hero064/Caine.def",
        childResourceRows: "261",
        skeletonSamples: "Characters/Hero064/Art/hero064.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Caine_DefaultAttack_Impact", {
    effectToken: "Effect_Caine_DefaultAttack_Impact",
    heroNames: ["Caine"],
    heroResourceRoots: ["Hero064", "Caine"],
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero064/Default/Hero064_DEF_A_Shot_Impact/Hero064_DEF_A_Shot_Impact.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "native-selector-output-role-resource");
  assert.equal(resolved.resourceMatchKind, "selector-role-single-resource-candidate");
});

test("buildEffectResourceResolver maps default attack impact suffixes to numbered AA Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero059/Hero059_AA_Impact_01/Hero059_AA_Impact_01.pfx",
        hash: "YATES_AA_IMPACT_01",
      },
      {
        relativePath: "Effects/Hero059/Hero059_AA_Impact_02/Hero059_AA_Impact_02.pfx",
        hash: "YATES_AA_IMPACT_02",
      },
      {
        relativePath: "Effects/Hero059/Hero059_AA_Impact_03/Hero059_AA_Impact_03.pfx",
        hash: "YATES_AA_IMPACT_03",
      },
      {
        relativePath: "Effects/Hero059/Hero059_A_Impact/Hero059_A_Impact.pfx",
        hash: "YATES_A_IMPACT",
      },
      {
        relativePath: "Effects/Hero059/Hero059_C_Impact/Hero059_C_Impact.pfx",
        hash: "YATES_C_IMPACT",
      },
    ],
    heroNameRows: [{ hero: "Yates", kind: "Effect", name: "DefaultAttack_Impact_B" }],
    definitionRows: [
      {
        manifestLabel: "*Yates*",
        targetRelativePath: "Characters/Hero059/Yates.def",
        childResourceRows: "280",
        skeletonSamples: "Characters/Hero059/Art/hero059.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_AA_Impact_01",
        resourcePath: "Effects/Hero059/Hero059_AA_Impact_01/Hero059_AA_Impact_01.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_AA_Impact_02",
        resourcePath: "Effects/Hero059/Hero059_AA_Impact_02/Hero059_AA_Impact_02.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["attack"],
        role: "impact",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_AA_Impact_03",
        resourcePath: "Effects/Hero059/Hero059_AA_Impact_03/Hero059_AA_Impact_03.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_A_Impact",
        resourcePath: "Effects/Hero059/Hero059_A_Impact/Hero059_A_Impact.pfx",
      },
      {
        modelLabel: "Yates_DefaultSkin",
        heroLabel: "Yates",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "impact",
        resourceRoot: "Hero059",
        resourceStem: "Hero059_C_Impact",
        resourcePath: "Effects/Hero059/Hero059_C_Impact/Hero059_C_Impact.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Yates_DefaultAttack_Impact_B", {
    effectToken: "Effect_Yates_DefaultAttack_Impact_B",
    heroNames: ["Yates"],
    heroResourceRoots: ["Hero059", "Yates"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero059/Hero059_AA_Impact_02/Hero059_AA_Impact_02.pfx"]);
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-default-attack-variant-impact");
});

test("buildEffectResourceResolver filters source skin-alias weak candidates to default Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
        hash: "ADAGIO_PROJECTILE_IMPACT",
      },
      {
        relativePath: "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx",
        hash: "ADAGIO_STUN_IMPACT",
      },
      {
        relativePath: "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.pfx",
        hash: "ADAGIO_S2_PROJECTILE_IMPACT",
      },
    ],
    heroNameRows: [{ hero: "AdagioFortunesSmile", kind: "Effect", name: "impact" }],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "350",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_ProjectileImpact",
        resourcePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
      },
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        skinKind: "default",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_Stun_Impact",
        resourcePath: "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx",
      },
      {
        modelLabel: "Adagio_Skin_Angel",
        heroLabel: "Adagio",
        skinKind: "skin",
        actionKeys: [],
        role: "impact",
        resourceRoot: "Adagio",
        resourceStem: "Adagio_S2_ProjectileImpact",
        resourcePath: "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.pfx",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Adagio_Skin_Angel",
        sourceEffectToken: "Effect_AdagioFortunesSmile_impact",
        skinEffectToken: "Effect_Adagio_S2_FortunesSmile_impact",
      },
    ],
  });

  const resolved = resolver("Effect_AdagioFortunesSmile_impact", {
    effectToken: "Effect_AdagioFortunesSmile_impact",
    selectorOutputRole: "impact",
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
    "Effects/Adagio/AdagioStunImpact.assetbundle/Adagio_Stun_Impact.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "weak");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-candidate");
  assert.equal(resolved.resourceMatchKind, "cff0-source-effect-alias-default-candidate");
});

test("buildEffectResourceResolver promotes source skin-alias default candidates when runtime action matches one Kindred slot", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.pfx",
        hash: "CATHERINE_A_IMPACT",
      },
      {
        relativePath: "Effects/Catherine/Catherine_B_Proj_Hit/Catherine_B_Proj_Impact.pfx",
        hash: "CATHERINE_B_IMPACT",
      },
      {
        relativePath: "Effects/Catherine/S2/Catherine_S2_A_Impact/Catherine_S2_A_Impact.pfx",
        hash: "CATHERINE_S2_A_IMPACT",
      },
    ],
    heroNameRows: [{ hero: "Catherine", kind: "Effect", name: "ArcaneShield_Impact" }],
    definitionRows: [
      {
        manifestLabel: "*Catherine*",
        targetRelativePath: "Characters/Catherine/Catherine.def",
        childResourceRows: "260",
        skeletonSamples: "Characters/Catherine/Art/catherine.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_A_Impact",
        resourcePath: "Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.pfx",
      },
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "impact",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_B_GetHit",
        resourcePath: "Effects/Catherine/Catherine_B_GetHit/Catherine_B_GetHit.pfx",
      },
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["ability02"],
        role: "impact",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_B_Proj_Impact",
        resourcePath: "Effects/Catherine/Catherine_B_Proj_Hit/Catherine_B_Proj_Impact.pfx",
      },
      {
        modelLabel: "Catherine_Skin_Worlds",
        heroLabel: "Catherine",
        skinKind: "skin",
        actionKeys: ["ability01"],
        role: "impact",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_S2_A_Impact",
        resourcePath: "Effects/Catherine/S2/Catherine_S2_A_Impact/Catherine_S2_A_Impact.pfx",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Catherine_Skin_Worlds",
        sourceEffectToken: "Effect_Catherine_ArcaneShield_Impact",
        skinEffectToken: "Effect_Catherine_S2_ArcaneShield_Impact",
      },
    ],
  });

  const resolved = resolver("Effect_Catherine_ArcaneShield_Impact", {
    effectToken: "Effect_Catherine_ArcaneShield_Impact",
    actionKeys: ["ability02"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Catherine/Catherine_B_Proj_Hit/Catherine_B_Proj_Impact.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "cff0-source-effect-alias-action-slot");
});

test("buildEffectResourceResolver resolves source skin-aliases through unique same-action Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Catherine/Catherine_C/Catherine_C.pfx",
        hash: "CATHERINE_C",
      },
      {
        relativePath: "Effects/Catherine/S2/Catherine_S2_C/Catherine_S2_C.pfx",
        hash: "CATHERINE_S2_C",
      },
      {
        relativePath: "Effects/Catherine/ICE/Catherine__ICE__Ult.assetbundle/Catherine__ICE__Ult.pfx",
        hash: "CATHERINE_ICE_ULT",
      },
    ],
    heroNameRows: [{ hero: "Catherine", kind: "Effect", name: "DeadlyGrace" }],
    definitionRows: [
      {
        manifestLabel: "*Catherine*",
        targetRelativePath: "Characters/Catherine/Catherine.def",
        childResourceRows: "260",
        skeletonSamples: "Characters/Catherine/Art/catherine.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        skinKind: "default",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_C",
        resourcePath: "Effects/Catherine/Catherine_C/Catherine_C.pfx",
      },
      {
        modelLabel: "Catherine_Skin_Worlds",
        heroLabel: "Catherine",
        skinKind: "skin",
        actionKeys: ["ability03"],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine_S2_C",
        resourcePath: "Effects/Catherine/S2/Catherine_S2_C/Catherine_S2_C.pfx",
      },
      {
        modelLabel: "Catherine_Skin_Ice",
        heroLabel: "Catherine",
        skinKind: "skin",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Catherine",
        resourceStem: "Catherine__ICE__Ult",
        resourcePath: "Effects/Catherine/ICE/Catherine__ICE__Ult.assetbundle/Catherine__ICE__Ult.pfx",
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Catherine_Skin_Worlds",
        sourceEffectToken: "Effect_Catherine_DeadlyGrace",
        skinEffectToken: "Effect_Catherine_S2_DeadlyGrace",
      },
      {
        modelLabel: "Catherine_Skin_Ice",
        sourceEffectToken: "Effect_Catherine_DeadlyGrace",
        skinEffectToken: "Effect_Catherine__ICE__DeadlyGrace",
      },
    ],
  });

  const resolved = resolver("Effect_Catherine_DeadlyGrace", {
    effectToken: "Effect_Catherine_DeadlyGrace",
    actionKeys: ["ability03"],
  });

  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Catherine/Catherine_C/Catherine_C.pfx",
    "Effects/Catherine/S2/Catherine_S2_C/Catherine_S2_C.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "cff0-source-effect-alias-unique-action-slot");
});

test("buildEffectResourceResolver resolves map mode suffix tokens through exact base Kindred slots", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Turret/TurretLaser.assetbundle/TurretLaser.pfx",
        hash: "TURRET_LASER",
      },
      {
        relativePath: "Effects/Turret/Turret_TargetingLaser/Turret_TargetingLaser.pfx",
        hash: "TURRET_TARGETING_LASER",
      },
    ],
    heroNameRows: [{ hero: "TurretLaser", kind: "Effect", name: "5v5" }],
    definitionRows: [
      {
        manifestLabel: "*Turret*",
        targetRelativePath: "Characters/Turret/Turret.def",
        childResourceRows: "10",
        skeletonSamples: "",
      },
    ],
    kindredSlots: [
      {
        groupLabel: "turrets",
        modelLabel: "",
        heroLabel: "",
        skinKind: "global",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Turret",
        resourceStem: "TurretLaser",
        resourcePath: "Effects/Turret/TurretLaser.assetbundle/TurretLaser.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_TurretLaser_5v5", {
    effectToken: "Effect_TurretLaser_5v5",
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Turret/TurretLaser.assetbundle/TurretLaser.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolved.resourceMatchKind, "kindred-mode-suffix-base-effect");
});

test("buildEffectResourceResolver keeps weak candidates weak without unique KindredEffects confirmation", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx",
        hash: "SHIN_WHEELSPARKS",
      },
      {
        relativePath: "Effects/Hero070/DefaultSkin/Hero070_WheelGlow/Hero070_WheelGlow.pfx",
        hash: "SHIN_WHEELGLOW",
      },
    ],
    heroNameRows: [{ hero: "Shin", kind: "Effect", name: "Wheel_L" }],
    definitionRows: [
      {
        manifestLabel: "*Shin*",
        targetRelativePath: "Characters/Hero070/Shin.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero070/Art/hero070.skeleton",
      },
    ],
    kindredSlots: [
      {
        modelLabel: "Shin_DefaultSkin",
        heroLabel: "Shin",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero070",
        resourceStem: "Hero070_Wheelsparks",
        resourcePath: "Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx",
      },
      {
        modelLabel: "Shin_DefaultSkin",
        heroLabel: "Shin",
        skinKind: "default",
        actionKeys: [],
        role: "effect",
        resourceRoot: "Hero070",
        resourceStem: "Hero070_WheelGlow",
        resourcePath: "Effects/Hero070/DefaultSkin/Hero070_WheelGlow/Hero070_WheelGlow.pfx",
      },
    ],
  });

  const resolved = resolver("Effect_Shin_Wheel_L", {
    effectToken: "Effect_Shin_Wheel_L",
  });

  assert.equal(resolved.aliasEvidenceStrength, "weak");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-candidate");
});

test("buildEffectResourceResolver matches reordered exact resource terms within the same hero root", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero039/Hero039_A_L_2_Buff/Hero039_A_L_2_Buff.pfx",
        hash: "TONY_LEFT_2_BUFF",
      },
      {
        relativePath: "Effects/Hero039/Hero039_A_R_2_Buff/Hero039_A_R_2_Buff.pfx",
        hash: "TONY_RIGHT_2_BUFF",
      },
    ],
    heroNameRows: [
      { hero: "Tony", kind: "Effect", name: "Buff_A_L_2" },
      { hero: "Tony", kind: "Effect", name: "Buff_A_2" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Tony*",
        targetRelativePath: "Characters/Hero039/Tony.def",
        childResourceRows: "140",
        skeletonSamples: "Characters/Hero039/Art/hero039.skeleton",
      },
    ],
  });

  const leftBuff = resolver("Effect_Tony_Buff_A_L_2", {
    effectToken: "Effect_Tony_Buff_A_L_2",
    actionKeys: ["ability01"],
  });
  assert.deepEqual(leftBuff.resourcePaths, ["Effects/Hero039/Hero039_A_L_2_Buff/Hero039_A_L_2_Buff.pfx"]);
  assert.equal(leftBuff.aliasEvidenceStrength, "strong");
  assert.equal(leftBuff.resourceEvidenceSource, "native-reordered-effect-terms-resource");
  assert.equal(leftBuff.resourceMatchKind, "hero-code-reordered-effect-terms");

  const ambiguousSide = resolver("Effect_Tony_Buff_A_2", {
    effectToken: "Effect_Tony_Buff_A_2",
    actionKeys: ["ability01"],
  });
  assert.deepEqual(ambiguousSide.resourcePaths, []);
  assert.equal(ambiguousSide.resourceEvidenceSource, "");
});

test("buildEffectResourceResolver does not match semantic sub-effects through attack suffix aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero067/DEF/Hero067_Minion_AA_Impact/Hero067_Minion_AA_Impact.pfx",
        hash: "ISHTAR_MINION_AA_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "Ishtar", kind: "Effect", name: "BasicAttack_Impact" },
      { hero: "Ishtar", kind: "Effect", name: "Minion_BasicAttack_Impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Ishtar*",
        targetRelativePath: "Characters/Hero067/Ishtar.def",
        childResourceRows: "120",
        skeletonSamples: "Characters/Hero067/Art/hero067.skeleton",
      },
    ],
  });

  const basicAttack = resolver("Effect_Ishtar_BasicAttack_Impact", {
    effectToken: "Effect_Ishtar_BasicAttack_Impact",
    actionKeys: ["attack"],
  });
  assert.equal(basicAttack.aliasEvidenceStrength, "weak");

  const minionAttack = resolver("Effect_Ishtar_Minion_BasicAttack_Impact", {
    effectToken: "Effect_Ishtar_Minion_BasicAttack_Impact",
    actionKeys: ["attack"],
  });
  assert.deepEqual(minionAttack.resourcePaths, [
    "Effects/Hero067/DEF/Hero067_Minion_AA_Impact/Hero067_Minion_AA_Impact.pfx",
  ]);
  assert.equal(minionAttack.aliasEvidenceStrength, "strong");
  assert.equal(minionAttack.resourceEvidenceSource, "native-action-effect-alias-resource");
});

test("buildEffectResourceResolver uses native ability action gates for Ability01 impact aliases", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero069/Hero069_A_Impact/Hero069_A_Impact.pfx",
        hash: "AMAEL_A_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "Amael", kind: "Effect", name: "Ability01_Impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Amael*",
        targetRelativePath: "Characters/Hero069/Amael.def",
        childResourceRows: "80",
        skeletonSamples: "Characters/Hero069/Art/hero069.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Amael_Ability01_Impact", {
    effectToken: "Effect_Amael_Ability01_Impact",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero069/Hero069_A_Impact/Hero069_A_Impact.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "native-action-effect-alias-resource");
  assert.equal(resolved.resourceMatchKind, "hero-code-native-action-effect-alias");
});

test("buildEffectResourceResolver prefers decoded hero aliases before action-gated fallbacks", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero040/Hero040_A_Shot/Hero040_A_Shot.pfx",
        hash: "BAPTISTE_A_SHOT",
      },
    ],
    heroNameRows: [
      { hero: "Baptiste", kind: "Effect", name: "A_Projectile" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Baptiste*",
        targetRelativePath: "Characters/Hero040/Baptiste.def",
        childResourceRows: "229",
        skeletonSamples: "Characters/Hero040/Art/hero040.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_Baptiste_A_Projectile", {
    effectToken: "Effect_Baptiste_A_Projectile",
    actionKeys: ["ability01"],
  });

  assert.deepEqual(resolved.resourcePaths, ["Effects/Hero040/Hero040_A_Shot/Hero040_A_Shot.pfx"]);
  assert.equal(resolved.aliasEvidenceStrength, "strong");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-hero-alias");
  assert.equal(resolved.resourceMatchKind, "hero-code-effect-name-alias-basename");
});

test("buildEffectResourceResolver exposes definition-rehomed named roots for composite effect heroes", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
        hash: "ADAGIO_PROJECTILE_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "AdagioFortunesSmile", kind: "Effect", name: "impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "350",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
  });

  const resolved = resolver("Effect_AdagioFortunesSmile_impact", {
    effectToken: "Effect_AdagioFortunesSmile_impact",
  });

  assert.deepEqual(resolved.heroNames, ["Adagio"]);
  assert.deepEqual(resolved.resourceRoots, ["Adagio"]);
  assert.deepEqual(resolved.resourcePaths, [
    "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
  ]);
  assert.equal(resolved.aliasEvidenceStrength, "weak");
  assert.equal(resolved.resourceEvidenceSource, "effect-resource-candidate");
});

test("buildEffectHookRuntimeManifest carries resolver hero roots for rehomed direct effect rows", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
        hash: "ADAGIO_PROJECTILE_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "AdagioFortunesSmile", kind: "Effect", name: "impact" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "350",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    resourceResolver: resolver,
    directEffectRows: [
      {
        platform: "android",
        sourceKind: "native-effect-selector",
        effectToken: "Effect_AdagioFortunesSmile_impact",
        heroNames: ["AdagioFortunesSmile"],
        sourceFile: "functions/adagio.c",
        functionName: "FUN_ADAGIO_SELECTOR",
        line: "903",
      },
    ],
  });

  assert.deepEqual(manifest.items[0].heroNames, ["Adagio", "AdagioFortunesSmile"]);
  assert.deepEqual(manifest.items[0].heroResourceRoots, ["Adagio"]);
  assert.equal(reportRowsForManifest(manifest)[0].heroResourceRoots, "Adagio");
});

test("buildEffectHookRuntimeManifest carries rehomed hero roots even when no pfx resource matches", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
        hash: "ADAGIO_PROJECTILE_IMPACT",
      },
    ],
    heroNameRows: [
      { hero: "AdagioFortunesSmile", kind: "Effect", name: "buff" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Adagio*",
        targetRelativePath: "Characters/Adagio/Adagio.def",
        childResourceRows: "350",
        skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    resourceResolver: resolver,
    directEffectRows: [
      {
        platform: "android",
        sourceKind: "native-effect-vcall",
        effectToken: "Effect_AdagioFortunesSmile_buff",
        heroNames: ["AdagioFortunesSmile"],
        sourceFile: "functions/adagio.c",
        functionName: "FUN_ADAGIO_BUFF",
        line: "186",
      },
    ],
  });

  assert.deepEqual(manifest.items[0].resourcePaths, []);
  assert.deepEqual(manifest.items[0].heroNames, ["Adagio", "AdagioFortunesSmile"]);
  assert.deepEqual(manifest.items[0].heroResourceRoots, ["Adagio"]);
});

test("visualBindingEffectRows promotes only single-bone strong visual effect candidates", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero027/Hero027_B_1_Jump/Hero027_B_1_Jump.pfx",
        hash: "OZO_B_JUMP",
      },
      {
        relativePath: "Effects/Hero027/Hero027_B_Weak/Hero027_B_Weak.pfx",
        hash: "OZO_WEAK",
      },
    ],
    heroNameRows: [
      { hero: "Ozo", kind: "Effect", name: "B_1_Jump" },
      { hero: "Ozo", kind: "Effect", name: "Weak" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Ozo*",
        targetRelativePath: "Characters/Hero027/Ozo.def",
        childResourceRows: "10",
        skeletonSamples: "Characters/Hero027/Art/hero027.skeleton",
      },
    ],
  });

  const rows = visualBindingEffectRows(
    [
      {
        platform: "android",
        sourceFile: "functions/named.c",
        functionName: "FUN_VISUAL",
        startLine: "42",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_Ring",
        stringSamples: "Ability02|Ability__Ozo__B|Bone_Ring|Buff_Ozo_BounceAvailable|Effect_Ozo_B_1_Jump",
      },
      {
        platform: "android",
        sourceFile: "functions/named.c",
        functionName: "FUN_MULTI_BONE",
        startLine: "50",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_Left|Bone_Right",
        stringSamples: "Effect_Ozo_B_1_Jump",
      },
      {
        platform: "android",
        sourceFile: "functions/named.c",
        functionName: "FUN_NO_STAGE",
        startLine: "60",
        candidateStages: "bone-query",
        boneNames: "Bone_Ring",
        stringSamples: "Effect_Ozo_B_1_Jump",
      },
    ],
    { resourceResolver: resolver },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bindKind, "visual-bone-effect");
  assert.equal(rows[0].sourceKind, "native-visual-binding");
  assert.equal(rows[0].boneToken, "Bone_Ring");
  assert.equal(rows[0].effectToken, "Effect_Ozo_B_1_Jump");
  assert.equal(rows[0].aliasEvidenceStrength, "strong");
  assert.equal(rows[0].resourceEvidenceSource, "effect-resource-hero-alias");
  assert.equal(rows[0].resourcePaths, "Effects/Hero027/Hero027_B_1_Jump/Hero027_B_1_Jump.pfx");
});

test("visualBindingEffectRows preserves native bone evidence when the effect resource is unresolved", () => {
  const rows = visualBindingEffectRows(
    [
      {
        platform: "android",
        sourceFile: "functions/hero050.c",
        functionName: "FUN_STACKED",
        startLine: "12",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_RightHand",
        stringSamples: "Bone_RightHand|Effect_Hero050_StackedDeck",
      },
    ],
    { resourceResolver: () => ({ aliasEvidenceStrength: "", resourcePaths: [] }) },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bindKind, "visual-bone-effect");
  assert.equal(rows[0].boneToken, "Bone_RightHand");
  assert.equal(rows[0].effectToken, "Effect_Hero050_StackedDeck");
  assert.equal(rows[0].aliasEvidenceStrength, "");
  assert.equal(rows[0].resourcePaths, "");
});

test("visualBindingEffectRows keeps pre-bone visual effects as root effect channels for single-bone functions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-hook-runtime-"));
  const sourceFile = path.join(tempDir, "yates.c");
  fs.writeFileSync(
    sourceFile,
    [
      "void FUN_YATES(void) {",
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Yates_B_ChargingRing");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_CenterMass");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Yates_B_Charging");',
      "}",
    ].join("\n"),
  );

  const rows = visualBindingEffectRows(
    [
      {
        platform: "android",
        sourceFile,
        functionName: "FUN_YATES",
        startLine: "1",
        endLine: "5",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_CenterMass",
        stringSamples: "Ability__Yates__B|Bone_CenterMass|Effect_Yates_B_Charging|Effect_Yates_B_ChargingRing",
      },
    ],
    {
      directEffectRows: [
        {
          platform: "android",
          effectToken: "Effect_Yates_B_ChargingRing",
          sourceFile,
          functionName: "FUN_YATES",
          line: "2",
          sourceKind: "native-effect-vcall",
          effectOptionOffsets: ["0xd0"],
          effectOptionFloatArgs: ["0xd0:3.5"],
          effectOptions: { scale: 3.5 },
        },
      ],
      resourceResolver: (token) => ({
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceEvidenceSource: "test",
        resourceMatchKind: "test",
        resourcePaths: [`Effects/Hero059/${token}.pfx`],
      }),
    },
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].bindKind, "effect-only");
  assert.equal(rows[0].boneToken, "");
  assert.equal(rows[0].effectToken, "Effect_Yates_B_ChargingRing");
  assert.deepEqual(rows[0].effectOptionOffsets, ["0xd0"]);
  assert.deepEqual(rows[0].effectOptionFloatArgs, ["0xd0:3.5"]);
  assert.deepEqual(rows[0].effectOptions, { scale: 3.5 });
  assert.equal(rows[0].runtimeBinding, undefined);
  assert.equal(rows[1].bindKind, "visual-bone-effect");
  assert.equal(rows[1].boneToken, "Bone_CenterMass");
  assert.equal(rows[1].effectToken, "Effect_Yates_B_Charging");
});

test("buildEffectHookRuntimeManifest merges duplicate source-ordered visual root effects with direct vcall options", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-hook-runtime-"));
  const sourceFile = path.join(tempDir, "yates.c");
  fs.writeFileSync(
    sourceFile,
    [
      "void FUN_YATES(void) {",
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Yates_B_ChargingRing");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_CenterMass");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Yates_B_Charging");',
      "}",
    ].join("\n"),
  );

  const manifest = buildEffectHookRuntimeManifest([], [], "2026-06-25T00:00:00.000Z", {
    resourceResolver: () => ({ aliasEvidenceStrength: "", resourcePaths: [] }),
    visualBindingRows: [
      {
        platform: "android",
        sourceFile,
        functionName: "FUN_YATES",
        startLine: "1",
        endLine: "5",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_CenterMass",
        stringSamples: "Bone_CenterMass|Effect_Yates_B_Charging|Effect_Yates_B_ChargingRing",
      },
    ],
    directEffectRows: [
      {
        platform: "android",
        effectToken: "Effect_Yates_B_ChargingRing",
        sourceFile,
        functionName: "FUN_YATES",
        line: "2",
        sourceKind: "native-effect-vcall",
        effectOptionOffsets: ["0xd0"],
        effectOptionFloatArgs: ["0xd0:3.5"],
        effectOptions: { scale: 3.5 },
      },
    ],
  });

  assert.equal(manifest.items.length, 2);
  const rootItem = manifest.items.find((item) => item.effectToken === "Effect_Yates_B_ChargingRing");
  assert.equal(rootItem.sourceKind, "native-visual-binding");
  assert.deepEqual(rootItem.runtimeBinding, {
    kind: "effect-channel",
    boneToken: "",
    evidence: "native-effect-only",
    effectOptionOffsets: ["0xd0"],
    effectOptionFloatArgs: ["0xd0:3.5"],
    effectOptions: { scale: 3.5 },
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
});

test("visualBindingEffectRows promotes ordered multi-bone effect pairs from native source order", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-hook-runtime-"));
  const sourceFile = path.join(tempDir, "tony.c");
  fs.writeFileSync(
    sourceFile,
    [
      "void FUN_TONY(void) {",
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_Rightjet");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Tony_Buff_A");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_Leftjet");',
      '  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Tony_Buff_A_L");',
      "}",
    ].join("\n"),
  );
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero039/Hero039_A_R_Buff/Hero039_A_R_Buff.pfx",
        hash: "TONY_RIGHT_BUFF",
      },
      {
        relativePath: "Effects/Hero039/Hero039_A_L_Buff/Hero039_A_L_Buff.pfx",
        hash: "TONY_LEFT_BUFF",
      },
    ],
    heroNameRows: [
      { hero: "Tony", kind: "Effect", name: "Buff_A" },
      { hero: "Tony", kind: "Effect", name: "Buff_A_L" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Tony*",
        targetRelativePath: "Characters/Hero039/Tony.def",
        childResourceRows: "140",
        skeletonSamples: "Characters/Hero039/Art/hero039.skeleton",
      },
    ],
  });

  const rows = visualBindingEffectRows(
    [
      {
        platform: "android",
        sourceFile,
        functionName: "FUN_TONY",
        startLine: "1",
        endLine: "6",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_Leftjet|Bone_Rightjet",
        stringSamples: "Ability__Tony__A1|Bone_Leftjet|Bone_Rightjet|Effect_Tony_Buff_A|Effect_Tony_Buff_A_L",
      },
    ],
    { resourceResolver: resolver },
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].boneToken, "Bone_Rightjet");
  assert.equal(rows[0].effectToken, "Effect_Tony_Buff_A");
  assert.equal(rows[0].resourcePaths, "Effects/Hero039/Hero039_A_R_Buff/Hero039_A_R_Buff.pfx");
  assert.equal(rows[1].boneToken, "Bone_Leftjet");
  assert.equal(rows[1].effectToken, "Effect_Tony_Buff_A_L");
  assert.equal(rows[1].resourcePaths, "Effects/Hero039/Hero039_A_L_Buff/Hero039_A_L_Buff.pfx");
});

test("visualBindingEffectRows pairs same-line effect calls regardless of argument order", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-hook-runtime-"));
  const sourceFile = path.join(tempDir, "baron.c");
  fs.writeFileSync(
    sourceFile,
    [
      "void FUN_BARON(void) {",
      '  FUN_00cf3428(0x3e800000,uVar2,"Effect_Baron_B_Jump_LeftJet",1,"Bone_LeftJet",0,1,0,0);',
      '  FUN_00cf3428(0x3e800000,uVar2,"Effect_Baron_B_Jump_RightJet",1,"Bone_RightJet",0,1,0,0);',
      "}",
    ].join("\n"),
  );
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero019/S1/Hero019_S1_B_Jump_LeftJet/Hero019_S1_B_Jump_LeftJet.pfx",
        hash: "BARON_LEFT_JET",
      },
      {
        relativePath: "Effects/Hero019/S1/Hero019_S1_B_Jump_RightJet/Hero019_S1_B_Jump_RightJet.pfx",
        hash: "BARON_RIGHT_JET",
      },
    ],
    heroNameRows: [
      { hero: "Baron", kind: "Effect", name: "B_Jump_LeftJet" },
      { hero: "Baron", kind: "Effect", name: "B_Jump_RightJet" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Baron*",
        targetRelativePath: "Characters/Hero019/Baron.def",
        childResourceRows: "150",
        skeletonSamples: "Characters/Hero019/Art/hero019.skeleton",
      },
    ],
  });

  const rows = visualBindingEffectRows(
    [
      {
        platform: "android",
        sourceFile,
        functionName: "FUN_BARON",
        startLine: "1",
        endLine: "4",
        candidateStages: "ability-effect-bone-hook",
        boneNames: "Bone_LeftJet|Bone_RightJet",
        stringSamples: "Bone_LeftJet|Bone_RightJet|Effect_Baron_B_Jump_LeftJet|Effect_Baron_B_Jump_RightJet",
      },
    ],
    { resourceResolver: resolver },
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0].boneToken, "Bone_LeftJet");
  assert.equal(rows[0].effectToken, "Effect_Baron_B_Jump_LeftJet");
  assert.equal(rows[1].boneToken, "Bone_RightJet");
  assert.equal(rows[1].effectToken, "Effect_Baron_B_Jump_RightJet");
});

test("buildEffectHookRuntimeManifest includes strong visual binding hooks as runtime bone evidence", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero027/Hero027_B_1_Jump/Hero027_B_1_Jump.pfx",
        hash: "OZO_B_JUMP",
      },
    ],
    heroNameRows: [{ hero: "Ozo", kind: "Effect", name: "B_1_Jump" }],
    definitionRows: [
      {
        manifestLabel: "*Ozo*",
        targetRelativePath: "Characters/Hero027/Ozo.def",
        childResourceRows: "10",
        skeletonSamples: "Characters/Hero027/Art/hero027.skeleton",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest(
    [],
    [
      {
        callKey: "android:FUN_VISUAL:42",
        parentFunctions: "android:FUN_VISUAL",
        parentRoles: "visual-effect-hook",
        parentTokens: "Bone_Ring|Effect_Ozo_B_1_Jump",
        visualParentTokens: "Bone_Ring|Effect_Ozo_B_1_Jump|Buff_Ozo_BounceAvailable",
        combinedParentTokens: "Bone_Ring|Effect_Ozo_B_1_Jump|Buff_Ozo_BounceAvailable",
        evidenceTokens: "Bone_Ring|Effect_Ozo_B_1_Jump|Buff_Ozo_BounceAvailable",
        definitionPath: "Characters/Hero027/Ozo.def",
        contextConfidence: "high",
        slotStatus: "resolved-direct-ability-slot",
        runtimeAbilitySlotIndex: "1",
        runtimeAbilityName: "Ability__Ozo__B",
      },
    ],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: resolver,
      visualBindingRows: [
        {
          platform: "android",
          sourceFile: "functions/named.c",
          functionName: "FUN_VISUAL",
          startLine: "42",
          candidateStages: "ability-effect-bone-hook",
          boneNames: "Bone_Ring",
          stringSamples: "Ability02|Ability__Ozo__B|Bone_Ring|Buff_Ozo_BounceAvailable|Effect_Ozo_B_1_Jump",
        },
      ],
    },
  );

  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].sourceKind, "native-visual-binding");
  assert.deepEqual(manifest.items[0].runtimeBinding, {
    kind: "bone",
    boneToken: "Bone_Ring",
    evidence: "native-visual-bone-token",
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
  assert.deepEqual(manifest.items[0].heroCodes, ["Hero027"]);
  assert.equal(manifest.items[0].resourceMatchKind, "hero-code-exact-basename");
  assert.equal(manifest.items[0].resourceEvidenceSource, "effect-resource-hero-alias");
  assert.equal(manifest.items[0].primaryAbilityContext.runtimeAbilityName, "Ability__Ozo__B");
  assert.equal(manifest.summary.bySourceKind["native-visual-binding"], 1);
});

test("buildEffectHookRuntimeManifest preserves skin resource variants from visual binding resolver evidence", () => {
  const resourceVariant = {
    resourcePath: "Effects/Hero023/S1/Hero023_S1_B_Body/Hero023_S1_B_Body.pfx",
    modelLabel: "Kestrel_Skin_Summer",
    skinKind: "skin",
    heroLabel: "Kestrel",
  };
  const manifest = buildEffectHookRuntimeManifest(
    [],
    [],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: () => ({
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "cff0-skin-effect-alias-strong-resource",
        resourceEvidenceSource: "cff0-skin-effect-alias",
        resourcePaths: [resourceVariant.resourcePath],
        resourceVariants: [resourceVariant],
      }),
      visualBindingRows: [
        {
          platform: "android",
          sourceFile: "functions/kestrel.c",
          functionName: "FUN_KESTREL",
          startLine: "146",
          candidateStages: "ability-effect-bone-hook",
          boneNames: "Bone_Head",
          stringSamples: "Bone_Head|Effect_Kestrel_B_Head",
        },
      ],
    },
  );

  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].sourceKind, "native-visual-binding");
  assert.deepEqual(manifest.items[0].resourcePaths, [resourceVariant.resourcePath]);
  assert.deepEqual(manifest.items[0].resourceVariants, [resourceVariant]);
});

test("buildEffectHookRuntimeManifest upgrades same-function effect-only rows with visual bone evidence", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [],
    [],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: () => ({ aliasEvidenceStrength: "", resourcePaths: [] }),
      visualBindingRows: [
        {
          platform: "android",
          sourceFile: "functions/hero050.c",
          functionName: "FUN_STACKED",
          startLine: "12",
          candidateStages: "ability-effect-bone-hook",
          boneNames: "Bone_RightHand",
          stringSamples: "Bone_RightHand|Effect_Hero050_StackedDeck",
        },
      ],
      directEffectRows: [
        {
          platform: "android",
          effectToken: "Effect_Hero050_StackedDeck",
          actionKeys: [],
          sourceFile: "functions/hero050.c",
          functionName: "FUN_STACKED",
          line: "20",
          sourceKind: "native-effect-vcall",
        },
      ],
    },
  );

  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].sourceKind, "native-visual-binding");
  assert.deepEqual(manifest.items[0].runtimeBinding, {
    kind: "bone",
    boneToken: "Bone_RightHand",
    evidence: "native-visual-bone-token",
    runtimeStartSeconds: 0,
    startSeconds: 0,
    timelineTimes: [],
  });
});

test("buildEffectHookRuntimeManifest narrows weak same-source rows from strong visual resource evidence", () => {
  const strongPath = "Effects/Hero015/KIRIN/Fortress_KIRIN_A_Ribbons/Fortress_KIRIN_A_Ribbons.pfx";
  const noisyPath = "Effects/Hero015/KIRIN/Fortress_KIRIN_A_Lunge_LaunchDust/Fortress_KIRIN_A_Lunge_LaunchDust.pfx";
  const manifest = buildEffectHookRuntimeManifest(
    [],
    [],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: (_token, row) => {
        if (row.candidateStages) {
          return {
            aliasStatus: "hero-alias-resource",
            aliasEvidenceStrength: "strong",
            resourceMatchKind: "kindred-effect-slot-semantic-alias",
            resourceEvidenceSource: "kindred-effect-resource-slot",
            resourcePaths: [strongPath],
          };
        }
        return {
          aliasStatus: "resource-candidate",
          aliasEvidenceStrength: "weak",
          resourceMatchKind: "hero-code-keyword-candidate",
          resourceEvidenceSource: "effect-resource-candidate",
          resourcePaths: [noisyPath, strongPath],
        };
      },
      visualBindingRows: [
        {
          platform: "android",
          sourceFile: "functions/fortress.c",
          functionName: "FUN_FORTRESS",
          startLine: "61",
          candidateStages: "ability-effect-bone-hook",
          boneNames: "Bone_Shoulders",
          stringSamples: "Bone_Shoulders|Effect_Fortress_Lunge_Ribbons",
        },
      ],
      directEffectRows: [
        {
          platform: "android",
          effectToken: "Effect_Fortress_Lunge_Ribbons",
          locatorLabel: "Bone_Shoulders",
          sourceFile: "functions/fortress.c",
          functionName: "FUN_FORTRESS",
          line: "90",
          sourceKind: "native-effect-spawn",
        },
      ],
    },
  );

  const direct = manifest.items.find((item) => item.sourceKind === "native-effect-spawn");
  assert.ok(direct);
  assert.deepEqual(direct.resourcePaths, [strongPath]);
  assert.equal(direct.aliasEvidenceStrength, "strong");
  assert.equal(direct.resourceMatchKind, "native-source-strong-resource");
  assert.equal(direct.resourceEvidenceSource, "native-source-strong-resource");
});

test("buildEffectHookRuntimeManifest promotes unambiguous native builder resource rows", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_Shin_Weapon_Head",
        bindKind: "bone-bound-effect",
        boneToken: "Bone_Weapon_Head",
        effectToken: "Effect_Shin_Weapon_Head",
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: "yes",
        sourceFile: "functions/shin.c",
        functionName: "FUN_SHIN",
        line: "420",
        instanceIndex: "1",
        hookPattern: "bone-bound-effect",
        aliasStatus: "resource-candidate",
        aliasEvidenceStrength: "weak",
        resourcePaths: "Effects/Hero070/DefaultSkin/Hero070_Weaponfx/Hero070_Weaponfx.pfx",
        nativeSemanticCalls: "android-bone-query",
      },
      {
        platform: "android",
        token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
        bindKind: "selected-attachment-effect",
        boneToken: "",
        effectToken: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
        hasCallback: "yes",
        setsVisibleOrActive: "yes",
        setsEffectOption: "no",
        sourceFile: "functions/silvernail.c",
        functionName: "FUN_SILVERNAIL",
        line: "554",
        instanceIndex: "2",
        hookPattern: "selected-attachment-effect",
        aliasStatus: "resource-candidate",
        aliasEvidenceStrength: "weak",
        resourcePaths:
          "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx|Effects/Hero055/Hero055_TripWire_PreWire/Hero055_TripWire_PreWire.pfx",
        nativeSemanticCalls: "add-or-apply-buff|android-bone-query",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
  );

  const shin = manifest.items.find((item) => item.effectToken === "Effect_Shin_Weapon_Head");
  assert.ok(shin);
  assert.equal(shin.aliasStatus, "hero-alias-resource");
  assert.equal(shin.aliasEvidenceStrength, "strong");
  assert.equal(shin.resourceMatchKind, "native-effect-hook-builder-single-resource");
  assert.equal(shin.resourceEvidenceSource, "native-effect-hook-builder");

  const silvernail = manifest.items.find((item) => item.effectToken === "Effect_Silvernail_Tripwire_AttachAvail_Ring");
  assert.ok(silvernail);
  assert.equal(silvernail.aliasStatus, "resource-candidate");
  assert.equal(silvernail.aliasEvidenceStrength, "weak");
  assert.equal(silvernail.resourceEvidenceSource, "native-effect-hook-builder");
});

test("buildEffectHookRuntimeManifest lets resolver override weak native builder candidates", () => {
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        platform: "android",
        token: "Effect_Shin_Wheel_L",
        bindKind: "bone-bound-effect",
        boneToken: "Bone_Wheel_L",
        effectToken: "Effect_Shin_Wheel_L",
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: "yes",
        sourceFile: "functions/shin.c",
        functionName: "FUN_SHIN",
        line: "420",
        instanceIndex: "1",
        hookPattern: "bone-bound-effect",
        aliasStatus: "resource-candidate",
        aliasEvidenceStrength: "weak",
        resourcePaths: "Effects/Hero070/DefaultSkin/Hero070_Weaponfx/Hero070_Weaponfx.pfx",
        nativeSemanticCalls: "android-bone-query",
      },
      {
        platform: "android",
        token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
        bindKind: "selected-attachment-effect",
        boneToken: "",
        effectToken: "Effect_Silvernail_Stake_Impact",
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        sourceFile: "functions/silvernail.c",
        functionName: "FUN_SILVERNAIL",
        line: "554",
        instanceIndex: "2",
        hookPattern: "selected-attachment-effect",
        aliasStatus: "resource-candidate",
        aliasEvidenceStrength: "weak",
        resourcePaths:
          "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx|Effects/Hero055/Hero055_TripWire_PreWire/Hero055_TripWire_PreWire.pfx",
        nativeSemanticCalls: "add-or-apply-buff|android-bone-query",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: (token) => {
        if (token === "Effect_Shin_Wheel_L") {
          return {
            aliasStatus: "hero-alias-resource",
            aliasEvidenceStrength: "strong",
            resourceMatchKind: "kindred-effect-slot-weak-candidate-confirmed",
            resourceEvidenceSource: "kindred-effect-resource-slot",
            resourcePaths: ["Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx"],
          };
        }
        if (token === "Effect_Silvernail_Stake_Impact") {
          return {
            aliasStatus: "hero-alias-resource",
            aliasEvidenceStrength: "strong",
            resourceMatchKind: "unique-resource-root-effect-name",
            resourceEvidenceSource: "effect-resource-hero-alias",
            resourcePaths: [
              "Effects/Hero055/Hero055_Stake_Impact/Hero055_Stake_Impact.pfx",
              "Effects/Hero055/MED/Hero055_MED_Stake_Impact/Hero055_MED_Stake_Impact.pfx",
            ],
          };
        }
        return null;
      },
    },
  );

  const wheel = manifest.items.find((item) => item.effectToken === "Effect_Shin_Wheel_L");
  assert.ok(wheel);
  assert.deepEqual(wheel.resourcePaths, ["Effects/Hero070/DefaultSkin/Hero070_Wheelsparks/Hero070_Wheelsparks.pfx"]);
  assert.equal(wheel.aliasEvidenceStrength, "strong");
  assert.equal(wheel.resourceEvidenceSource, "kindred-effect-resource-slot");

  const stake = manifest.items.find((item) => item.effectToken === "Effect_Silvernail_Stake_Impact");
  assert.ok(stake);
  assert.deepEqual(stake.resourcePaths, [
    "Effects/Hero055/Hero055_Stake_Impact/Hero055_Stake_Impact.pfx",
    "Effects/Hero055/MED/Hero055_MED_Stake_Impact/Hero055_MED_Stake_Impact.pfx",
  ]);
  assert.equal(stake.aliasEvidenceStrength, "strong");
  assert.equal(stake.resourceEvidenceSource, "effect-resource-hero-alias");
});

test("buildEffectHookRuntimeManifest backfills action gates before replacing effect-only rows with visual bone evidence", () => {
  const resolverRows = [];
  const manifest = buildEffectHookRuntimeManifest(
    [],
    [],
    "2026-06-25T00:00:00.000Z",
    {
      resourceResolver: (_token, row) => {
        resolverRows.push({ effectToken: row.effectToken, actionKeys: row.actionKeys || [] });
        if (!listValueForTest(row.actionKeys).includes("ability01")) {
          return {
            aliasEvidenceStrength: "weak",
            resourceEvidenceSource: "effect-resource-candidate",
            resourcePaths: ["Effects/Hero012/Ardan_Thruster_Burst.assetbundle/Ardan_Thruster_Burst.pfx"],
          };
        }
        return {
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceEvidenceSource: "kindred-effect-resource-slot",
          resourceMatchKind: "kindred-effect-slot-semantic-alias",
          resourcePaths: ["Effects/Hero012/Ardan_Thruster_Burst.assetbundle/Ardan_Thruster_Burst.pfx"],
        };
      },
      visualBindingRows: [
        {
          platform: "android",
          sourceFile: "functions/ardan.c",
          functionName: "FUN_ARDAN",
          startLine: "44",
          candidateStages: "ability-effect-bone-hook",
          boneNames: "Bone_ThrusterL",
          stringSamples: "Bone_ThrusterL|Effect_Ardan_Thruster",
        },
      ],
      directEffectRows: [
        {
          platform: "android",
          effectToken: "Effect_Ardan_Thruster",
          actionKeys: ["ability01"],
          heroNames: ["Ardan"],
          sourceFile: "functions/ardan.c",
          functionName: "FUN_ARDAN",
          line: "71",
          sourceKind: "native-effect-vcall",
        },
      ],
    },
  );

  assert.equal(manifest.items.length, 1);
  assert.equal(manifest.items[0].sourceKind, "native-visual-binding");
  assert.deepEqual(manifest.items[0].actionKeys, ["ability01"]);
  assert.deepEqual(manifest.items[0].resourcePaths, ["Effects/Hero012/Ardan_Thruster_Burst.assetbundle/Ardan_Thruster_Burst.pfx"]);
  assert.equal(manifest.items[0].resourceEvidenceSource, "kindred-effect-resource-slot");
  assert.equal(resolverRows.some((row) => listValueForTest(row.actionKeys).includes("ability01")), true);
});

test("buildEffectHookRuntimeManifest narrows side-specific weapon effects through native bone names", () => {
  const resolver = buildEffectResourceResolver({
    effectRows: [
      {
        relativePath: "Effects/Hero016/S3/Hero016_S3_Weapon_L/Hero016_S3_Weapon_L.pfx",
        hash: "RONA_WEAPON_L",
      },
      {
        relativePath: "Effects/Hero016/S3/Hero016_S3_Weapon_R/Hero016_S3_Weapon_R.pfx",
        hash: "RONA_WEAPON_R",
      },
    ],
    heroNameRows: [
      { hero: "Rona", kind: "Effect", name: "Weapon" },
      { hero: "Rona", kind: "Effect", name: "Weapon2" },
    ],
    definitionRows: [
      {
        manifestLabel: "*Rona*",
        targetRelativePath: "Characters/Hero016/Rona.def",
        childResourceRows: "324",
        skeletonSamples: "Characters/Hero016/Art/hero016.skeleton",
      },
    ],
  });
  const manifest = buildEffectHookRuntimeManifest(
    [
      {
        ...bindingRows[0],
        token: "Effect_Rona_Weapon",
        effectToken: "Effect_Rona_Weapon",
        boneToken: "Bone_LeftAxe",
        resourcePaths: "",
        aliasStatus: "definition-bridged",
        aliasEvidenceStrength: "definition-token",
        line: "10",
        instanceIndex: "0",
      },
      {
        ...bindingRows[0],
        token: "Effect_Rona_Weapon2",
        effectToken: "Effect_Rona_Weapon2",
        boneToken: "Bone_RightAxe",
        resourcePaths: "",
        aliasStatus: "definition-bridged",
        aliasEvidenceStrength: "definition-token",
        line: "11",
        instanceIndex: "1",
      },
    ],
    [],
    "2026-06-25T00:00:00.000Z",
    { resourceResolver: resolver },
  );

  const left = manifest.items.find((item) => item.effectToken === "Effect_Rona_Weapon");
  const right = manifest.items.find((item) => item.effectToken === "Effect_Rona_Weapon2");

  assert.deepEqual(left.resourcePaths, ["Effects/Hero016/S3/Hero016_S3_Weapon_L/Hero016_S3_Weapon_L.pfx"]);
  assert.deepEqual(right.resourcePaths, ["Effects/Hero016/S3/Hero016_S3_Weapon_R/Hero016_S3_Weapon_R.pfx"]);
  assert.equal(right.resourceEvidenceSource, "native-side-bone-resource");
  assert.equal(right.resourceMatchKind, "hero-code-native-side-bone");
});

test("reportRowsForManifest flattens primary runtime context for inspection", () => {
  const manifest = buildEffectHookRuntimeManifest(bindingRows, abilityRows, "2026-06-25T00:00:00.000Z");
  const rows = reportRowsForManifest(manifest);
  const lance = rows.find((row) => row.effectToken === "Effect_LanceBall_Lance_A_Weapon");

  assert.equal(lance.definitionPath, "Characters/Hero028/Lance.def");
  assert.equal(lance.runtimeAbilityName, "Ability__Lance__A");
  assert.equal(lance.actionKeys, "ability01");
  assert.equal(lance.runtimeBindingKind, "bone");
  assert.equal(lance.slotStatus, "resolved-direct-ability-slot");
  assert.match(lance.abilityMatchTokens, /Effect_LanceBall_Lance_A_Weapon/);
});

test("exportEffectHookRuntimeManifest writes viewer JSON plus audit reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-hook-runtime-"));
  const bindingPath = path.join(tempDir, "bindings.tsv");
  const abilityBridgePath = path.join(tempDir, "ability.tsv");
  const visualBindingPath = path.join(tempDir, "visual.tsv");
  const nativeEffectSpawnPath = path.join(tempDir, "native-effects.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const reportTsvOut = path.join(tempDir, "report.tsv");
  const reportJsonOut = path.join(tempDir, "summary.json");

  writeRows(
    bindingPath,
    [
      "platform",
      "token",
      "bindKind",
      "boneToken",
      "effectToken",
      "hasCallback",
      "setsVisibleOrActive",
      "setsEffectOption",
      "sourceFile",
      "functionName",
      "line",
      "instanceIndex",
      "hookPattern",
      "aliasStatus",
      "aliasEvidenceStrength",
      "resourcePaths",
      "buffTokens",
      "nativeSemanticCalls",
    ],
    bindingRows,
  );
  writeRows(
    abilityBridgePath,
    [
      "callKey",
      "platform",
      "callbackFunction",
      "parentFunctions",
      "parentRoles",
      "parentTokens",
      "visualParentTokens",
      "combinedParentTokens",
      "evidenceTokens",
      "definitionPath",
      "definitionPathSelection",
      "contextClass",
      "contextConfidence",
      "slotStatus",
      "runtimeAbilitySlotIndex",
      "runtimeAbilityName",
      "runtimeVariableIndex",
      "runtimeVariableStatus",
      "runtimeVariableName",
    ],
    abilityRows,
  );
  writeRows(
    visualBindingPath,
    [
      "platform",
      "sourceFile",
      "functionName",
      "startLine",
      "endLine",
      "candidateStages",
      "confidence",
      "score",
      "anchors",
      "focusTypes",
      "manifestNames",
      "typeSymbols",
      "boneNames",
      "bindTokens",
      "resources",
      "stringSamples",
      "contextHash",
    ],
    [],
  );
  fs.writeFileSync(nativeEffectSpawnPath, `${JSON.stringify({ items: [] })}\n`);

  const summary = exportEffectHookRuntimeManifest({
    bindingPath,
    abilityBridgePath,
    visualBindingPath,
    nativeEffectSpawnPath,
    viewerOut,
    reportTsvOut,
    reportJsonOut,
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.abilityContextRows, 2);
  assert.equal(summary.resourceBoundRows, 2);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Ability__Silvernail__A/);
  assert.match(fs.readFileSync(reportTsvOut, "utf8"), /Effect_LanceBall_Lance_A_Weapon/);
  assert.match(fs.readFileSync(reportTsvOut, "utf8").split(/\r?\n/)[0], /\bactionKeys\b/);
  assert.equal(JSON.parse(fs.readFileSync(reportJsonOut, "utf8")).summary.rows, 2);
});
