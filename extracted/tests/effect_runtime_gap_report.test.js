const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildEffectRuntimeGapReport,
  exportEffectRuntimeGapReport,
  kindredSlotCandidatesForHook,
  reportRowsForManifest,
} = require("../tools/effect_runtime_gap_report");

test("buildEffectRuntimeGapReport classifies unrendered hooks against real KindredEffects slots without promoting resources", () => {
  const effectHookManifest = {
    items: [
      {
        id: "android:arcane",
        sourceKind: "native-effect-vcall",
        effectToken: "Effect_AdagioArcaneFire_Impact",
        token: "Effect_AdagioArcaneFire_Impact",
        actionKeys: ["ability01"],
        heroCodes: [],
        resourcePaths: [],
        resourceEvidenceSource: "",
        aliasEvidenceStrength: "",
        source: { functionName: "FUN_ARCANE", line: 42 },
      },
      {
        id: "android:amael",
        sourceKind: "native-effect-vcall",
        effectToken: "Effect_Amael_Ability01_Charge",
        token: "Effect_Amael_Ability01_Charge",
        actionKeys: ["ability01"],
        heroCodes: ["Hero069"],
        resourcePaths: ["Effects/Hero069/Hero069_A_Charge/Hero069_A_Charge.pfx"],
        resourceEvidenceSource: "effect-resource-candidate",
        aliasEvidenceStrength: "weak",
        source: { functionName: "FUN_AMAEL", line: 7 },
      },
      {
        id: "android:selector",
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Mystery_Output",
        token: "Effect_Mystery_Output",
        actionKeys: [],
        heroCodes: [],
        resourcePaths: [],
        resourceEvidenceSource: "",
        aliasEvidenceStrength: "",
        selectorOutputTarget: "param_2[4]",
        selectorOutputRole: "impact",
        source: { functionName: "FUN_SELECTOR", line: 1 },
      },
      {
        id: "android:baron",
        sourceKind: "native-effect-spawn",
        effectToken: "Effect_Baron_A_Shot",
        token: "Effect_Baron_A_Shot",
        actionKeys: ["ability01"],
        heroCodes: [],
        heroNames: ["Baron"],
        resourcePaths: [],
        resourceEvidenceSource: "",
        aliasEvidenceStrength: "",
        source: { functionName: "FUN_BARON", line: 17 },
      },
      {
        id: "android:baron-projectile-selector",
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Baron_A_Projectile",
        token: "Effect_Baron_A_Projectile",
        actionKeys: ["ability01"],
        heroCodes: [],
        heroNames: ["Baron"],
        resourcePaths: [],
        resourceEvidenceSource: "",
        aliasEvidenceStrength: "",
        source: { functionName: "FUN_BARON_PROJECTILE", line: 27 },
      },
    ],
  };
  const kindredSlots = {
    items: [
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        actionKeys: [],
        role: "persistent",
        resourcePath: "Effects/Adagio/AdagioArcaneFireHOT.assetbundle/Adagio_ArcaneFire_HOT.pfx",
        resourceStem: "Adagio_ArcaneFire_HOT",
      },
    ],
  };

  const projectileRuntime = {
    items: [
      {
        modelLabel: "Baron_DefaultSkin",
        heroLabel: "Baron",
        bindingStatus: "native-effect-hook",
        nativeEffectHookTokens: "Effect_Baron_A_Projectile",
        nativeEffectHookMatchKinds: "semantic-effect-token",
        resourcePath: "Effects/Hero019/Hero019_A_Projectile/Hero019_A_Projectile.pfx",
      },
    ],
  };

  const report = buildEffectRuntimeGapReport({ effectHookManifest, kindredSlots, projectileRuntime }, "TEST_DATE");

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 4);
  assert.equal(report.summary.projectileRuntimeLinkedRows, 1);
  assert.equal(report.summary.kindredCandidateRows, 1);
  assert.equal(report.summary.weakCandidateRows, 1);
  assert.equal(report.summary.byReason["kindred-slot-candidate-unresolved"], 1);
  assert.equal(report.summary.byReason["weak-resource-candidate"], 1);
  assert.equal(report.summary.byReason["selector-output-unresolved"], 1);
  assert.equal(report.summary.byReason["no-resource-match"], 1);

  const arcane = report.items.find((item) => item.effectToken === "Effect_AdagioArcaneFire_Impact");
  assert.equal(arcane.reason, "kindred-slot-candidate-unresolved");
  assert.deepEqual(arcane.kindredCandidateResourcePaths, [
    "Effects/Adagio/AdagioArcaneFireHOT.assetbundle/Adagio_ArcaneFire_HOT.pfx",
  ]);
  assert.equal(arcane.renderPromotionAllowed, false);

  const rows = reportRowsForManifest(report);
  assert.match(rows.find((row) => row.effectToken === "Effect_Amael_Ability01_Charge").existingResourcePaths, /Hero069_A_Charge/);
  const baron = rows.find((row) => row.effectToken === "Effect_Baron_A_Shot");
  assert.equal(baron.reason, "no-resource-match");
  assert.equal(baron.heroNames, "Baron");
  const selector = rows.find((row) => row.effectToken === "Effect_Mystery_Output");
  assert.equal(selector.selectorOutputTarget, "param_2[4]");
  assert.equal(selector.selectorOutputRole, "impact");
  assert.equal(rows.some((row) => row.effectToken === "Effect_Baron_A_Projectile"), false);
});

test("buildEffectRuntimeGapReport marks selector projectile outputs paired with resolved impact resources", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:reza-shot",
            platform: "android",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_Reza_A_Shot",
            token: "Effect_Reza_A_Shot",
            selectorOutputTarget: "*param_2",
            selectorOutputRole: "projectile",
            actionKeys: ["ability01"],
            heroCodes: ["Hero041"],
            heroNames: ["Reza"],
            resourcePaths: [],
            source: { functionName: "FUN_REZA_SELECTOR", line: 611 },
          },
          {
            id: "android:reza-impact",
            platform: "android",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_Reza_A_ShotImpact",
            token: "Effect_Reza_A_ShotImpact",
            selectorOutputTarget: "param_2[4]",
            selectorOutputRole: "impact",
            actionKeys: ["ability01"],
            heroCodes: ["Hero041"],
            heroNames: ["Reza"],
            resourcePaths: ["Effects/Hero041/S1/Hero041_S1_A_Impact/Hero021_S1_A_Impact.pfx"],
            resourceEvidenceSource: "kindred-effect-resource-slot",
            aliasEvidenceStrength: "strong",
            source: { functionName: "FUN_REZA_SELECTOR", line: 612 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.selectorOutputPairedRows, 1);
  assert.equal(report.summary.byReason["selector-output-paired-impact-resource"], 1);
  assert.equal(report.items[0].reason, "selector-output-paired-impact-resource");
  assert.deepEqual(report.items[0].pairedSelectorOutputTokens, ["Effect_Reza_A_ShotImpact"]);
  assert.deepEqual(report.items[0].pairedSelectorOutputRoles, ["impact"]);
  assert.deepEqual(report.items[0].pairedSelectorOutputResourcePaths, [
    "Effects/Hero041/S1/Hero041_S1_A_Impact/Hero021_S1_A_Impact.pfx",
  ]);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].pairedSelectorOutputTokens, "Effect_Reza_A_ShotImpact");
  assert.equal(rows[0].pairedSelectorOutputResourcePaths, "Effects/Hero041/S1/Hero041_S1_A_Impact/Hero021_S1_A_Impact.pfx");
});

test("buildEffectRuntimeGapReport separates paired selector outputs whose resources are still missing", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:frost-core",
            platform: "android",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_FrostMage_FrostBolt_Core",
            token: "Effect_FrostMage_FrostBolt_Core",
            selectorOutputTarget: "*param_2",
            selectorOutputRole: "projectile",
            actionKeys: [],
            heroNames: ["FrostMage"],
            resourcePaths: [],
            source: { functionName: "FUN_FROST_SELECTOR", line: 485 },
          },
          {
            id: "android:frost-impact",
            platform: "android",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_FrostMage_FrostBolt_Impact",
            token: "Effect_FrostMage_FrostBolt_Impact",
            selectorOutputTarget: "param_2[4]",
            selectorOutputRole: "impact",
            actionKeys: [],
            heroNames: ["FrostMage"],
            resourcePaths: [],
            source: { functionName: "FUN_FROST_SELECTOR", line: 486 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 2);
  assert.equal(report.summary.selectorOutputMissingPairRows, 2);
  assert.equal(report.summary.byReason["selector-output-paired-resource-missing"], 2);
  assert.deepEqual(report.items[0].selectorOutputSiblingTokens, ["Effect_FrostMage_FrostBolt_Impact"]);
  assert.deepEqual(report.items[0].pairedSelectorOutputResourcePaths, []);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].selectorOutputSiblingTokens, "Effect_FrostMage_FrostBolt_Impact");
  assert.equal(rows[0].selectorOutputSiblingRoles, "impact");
});

test("buildEffectRuntimeGapReport separates global resource candidates without hero context", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:atlas",
            sourceKind: "native-effect-spawn",
            effectToken: "Effect_Atlas",
            token: "Effect_Atlas",
            actionKeys: [],
            heroNames: [],
            heroCodes: [],
            resourcePaths: [],
            source: { functionName: "FUN_ATLAS", line: 111 },
          },
        ],
      },
      kindredSlots: { items: [] },
      effectResourceRows: [
        {
          relativePath: "Effects/Items/AtlasPauldron_Buildup.assetbundle/AtlasPauldron_Buildup.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.globalResourceCandidateRows, 1);
  assert.equal(report.items[0].reason, "global-resource-candidate-unresolved");
  assert.deepEqual(report.items[0].globalCandidateResourcePaths, [
    "Effects/Items/AtlasPauldron_Buildup.assetbundle/AtlasPauldron_Buildup.pfx",
  ]);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].globalCandidateResourcePaths, "Effects/Items/AtlasPauldron_Buildup.assetbundle/AtlasPauldron_Buildup.pfx");
});

test("buildEffectRuntimeGapReport separates selectors whose hero effect resource package is absent", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:maaya",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_Maaya_BasicAttack",
            token: "Effect_Maaya_BasicAttack",
            actionKeys: ["attack"],
            heroNames: ["Maaya"],
            heroCodes: [],
            resourcePaths: [],
            source: { functionName: "FUN_MAAYA", line: 12 },
          },
        ],
      },
      kindredSlots: { items: [] },
      definitionRows: [
        {
          manifestLabel: "*Maaya*",
          targetRelativePath: "Characters/Hero072/Maaya.def",
          childResourceRows: "11",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Hero040/Hero040_A_Shot/Hero040_A_Shot.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.byReason["effect-resource-package-missing"], 1);
  assert.equal(report.items[0].reason, "effect-resource-package-missing");
  assert.deepEqual(report.items[0].missingEffectResourceRoots, ["Hero072"]);
});

test("buildEffectRuntimeGapReport separates placeholder definition roots from real missing effect packages", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:placeholder",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_Hero049_DefaultAttack_Shot",
            token: "Effect_Hero049_DefaultAttack_Shot",
            actionKeys: ["attack"],
            heroNames: ["Hero049"],
            heroCodes: ["Hero049"],
            heroResourceRoots: ["Hero049"],
            resourcePaths: [],
            selectorOutputRole: "projectile",
            source: { functionName: "FUN_PLACEHOLDER", line: 12 },
          },
        ],
      },
      kindredSlots: { items: [] },
      definitionRows: [
        {
          manifestLabel: "*Hero049*",
          targetRelativePath: "Characters/Hero049/Hero049.def",
          childResourceRows: "11",
          meshSamples: "UI/Ring_FallOff/Ring_FallOff.mesh|UI/Selector_Enemy/Selector_Enemy.mesh",
          skeletonSamples: "Characters/Hero000/Art/hero000.skeleton",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Hero000/Hero000_Test/Hero000_Test.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.items[0].reason, "definition-placeholder-resource-root");
  assert.deepEqual(report.items[0].missingEffectResourceRoots, ["Hero049"]);
  assert.deepEqual(report.items[0].placeholderDefinitionRoots, ["Hero049"]);
  assert.equal(reportRowsForManifest(report)[0].placeholderDefinitionRoots, "Hero049");
});

test("buildEffectRuntimeGapReport treats native vcall option-only effects as renderable runtime primitives", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:hero057-stun-area",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Hero057_B_StunArea",
            token: "Effect_Hero057_B_StunArea",
            actionKeys: ["ability02"],
            heroCodes: ["Hero057"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "model-root",
              effectOptions: {
                color: [1, 0, 0],
                scale: 4,
                fadeSeconds: 0.2,
                offsetValues: { "0xc0": [1, 0, 0] },
              },
            },
            source: { functionName: "FUN_HERO057_B", line: 44 },
          },
          {
            id: "android:hero057-missing",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Hero057_Missing",
            token: "Effect_Hero057_Missing",
            actionKeys: ["ability02"],
            heroCodes: ["Hero057"],
            resourcePaths: [],
            source: { functionName: "FUN_HERO057_B", line: 55 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 1);
  assert.equal(report.items[0].effectToken, "Effect_Hero057_Missing");
});

test("buildEffectRuntimeGapReport exposes native primitive rows for viewer runtime work", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:hero057-stun-area",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Hero057_B_StunArea",
            token: "Effect_Hero057_B_StunArea",
            actionKeys: ["ability02"],
            heroNames: ["Hero057"],
            heroCodes: ["Hero057"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "model-root",
              locatorLabel: "StunArea",
              effectOptionOffsets: ["0xc0", "0xd0", "0xf4"],
              effectOptionFloatArgs: ["0xd0:4", "0xf4:0.2"],
              effectOptions: {
                color: [1, 0, 0],
                scale: 4,
                fadeSeconds: 0.2,
              },
            },
            source: { functionName: "FUN_HERO057_B", line: 44 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.deepEqual(report.items, []);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 1);
  assert.equal(report.nativePrimitiveRenderableItems.length, 1);
  assert.deepEqual(report.nativePrimitiveRenderableItems[0], {
    id: "android:hero057-stun-area",
    sourceKind: "native-effect-vcall",
    effectToken: "Effect_Hero057_B_StunArea",
    token: "Effect_Hero057_B_StunArea",
    actionKeys: ["ability02"],
    heroCodes: ["Hero057"],
    heroNames: ["Hero057"],
    nativeRuntimeKind: "model-root",
    nativeBindKind: "",
    locatorLabel: "StunArea",
    nativeEffectOptionOffsets: ["0xc0", "0xd0", "0xf4"],
    nativeEffectOptionFloatArgs: ["0xd0:4", "0xf4:0.2"],
    nativeEffectOptions: {
      color: [1, 0, 0],
      scale: 4,
      fadeSeconds: 0.2,
    },
    source: {
      functionName: "FUN_HERO057_B",
      line: 44,
    },
  });
});

test("buildEffectRuntimeGapReport treats colored explosion native channels as renderable runtime primitives", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:pulseweave-explosion",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Pulseweave_Explosion",
            token: "Effect_Pulseweave_Explosion",
            actionKeys: [],
            heroNames: ["Pulseweave"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionOffsets: ["0xc0", "0x60", "0xb0"],
              effectOptionFloatArgs: ["0xc0:0.4,0.2,0.2", "0x60:0.3", "0xb0:1"],
              effectOptions: {
                color: [0.4, 0.2, 0.2],
                percentParam: 0.3,
                visibleOrActive: true,
                offsetValues: { "0xc0": [0.4, 0.2, 0.2], "0x60": [0.3], "0xb0": [1] },
              },
            },
            source: { functionName: "FUN_PULSEWEAVE", line: 95 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.deepEqual(report.items, []);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 1);
  assert.equal(report.nativePrimitiveRenderableItems[0].effectToken, "Effect_Pulseweave_Explosion");
});

test("buildEffectRuntimeGapReport treats colored buff native channels as renderable runtime primitives", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:armory-minion-buff",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_ArmoryMinionBuff",
            token: "Effect_ArmoryMinionBuff",
            actionKeys: [],
            heroNames: [],
            resourcePaths: [],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionOffsets: ["0x78", "0xd0", "0xc0", "0xd8", "0x60"],
              effectOptionFloatArgs: ["0x78:1", "0xd0:0.06", "0xc0:1,1,0", "0xd8:0.4", "0x60:0.7"],
              effectOptions: {
                color: [1, 1, 0],
                scale: 0.06,
                fadeSeconds: 0.4,
                percentParam: 0.7,
                followTarget: true,
                offsetValues: { "0x78": [1], "0xd0": [0.06], "0xc0": [1, 1, 0], "0xd8": [0.4], "0x60": [0.7] },
              },
            },
            source: { functionName: "FUN_ARMORY", line: 380 },
          },
        ],
      },
      kindredSlots: { items: [] },
      effectResourceRows: [
        {
          relativePath: "Effects/Minions/Heal/JMinion_Heal_BuffProj.assetbundle/JMinion_Heal_BuffProj.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.deepEqual(report.items, []);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 1);
  assert.equal(report.nativePrimitiveRenderableItems[0].effectToken, "Effect_ArmoryMinionBuff");
});

test("buildEffectRuntimeGapReport keeps unclassified native option effects in the gap report", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:hero049-dashfx",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Hero049_B_DashFx",
            token: "Effect_Hero049_B_DashFx",
            actionKeys: ["ability02"],
            heroCodes: ["Hero049"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "model-root",
              effectOptions: {
                scale: 3,
                followTarget: true,
                visibleOrActive: true,
                offsetValues: { "0xd0": [3] },
              },
            },
            source: { functionName: "FUN_HERO049_B", line: 88 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 0);
  assert.equal(report.items[0].effectToken, "Effect_Hero049_B_DashFx");
  assert.equal(report.items[0].reason, "no-resource-match");
});

test("buildEffectRuntimeGapReport treats exact shadergraph-only hooks as renderable evidence", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "ios:ishtar-wings-right",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Ishtar_C_WingsRight",
            token: "Effect_Ishtar_C_WingsRight",
            actionKeys: ["ability03"],
            heroCodes: ["Hero067"],
            heroNames: ["Ishtar"],
            resourcePaths: [],
            shadergraphPaths: ["Effects/Hero067/DEF/Hero067_C_WingsRight/Hero067_C_WingsRight.Surface[16].shadergraph"],
            shadergraphEvidenceSource: "effect-shadergraph-exact-group",
            source: { functionName: "FUN_100427ed0", line: 5331 },
          },
          {
            id: "ios:ishtar-unresolved",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Ishtar_C_Unresolved",
            token: "Effect_Ishtar_C_Unresolved",
            actionKeys: ["ability03"],
            heroCodes: ["Hero067"],
            heroNames: ["Ishtar"],
            resourcePaths: [],
            source: { functionName: "FUN_100427ed0", line: 5332 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.items[0].effectToken, "Effect_Ishtar_C_Unresolved");
});

test("buildEffectRuntimeGapReport does not treat follow-only native options as drawable primitives", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:follow-only",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Hero057_FollowOnly",
            token: "Effect_Hero057_FollowOnly",
            actionKeys: ["ability02"],
            heroCodes: ["Hero057"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "model-root",
              effectOptions: {
                followTarget: true,
                offsetValues: { "0x78": [1] },
              },
            },
            source: { functionName: "FUN_HERO057_B", line: 66 },
          },
        ],
      },
      kindredSlots: { items: [] },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 0);
  assert.equal(report.items[0].effectToken, "Effect_Hero057_FollowOnly");
  assert.equal(report.items[0].reason, "no-resource-match");
});

test("buildEffectRuntimeGapReport separates native effect channels that still need resource mapping", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:heroplu-helicopter",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_HeroPLU_Helicopter",
            token: "Effect_HeroPLU_Helicopter",
            actionKeys: [],
            heroNames: ["HeroPLU"],
            heroCodes: ["Hero012"],
            bindKind: "effect-only",
            resourcePaths: [],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionOffsets: ["0x78"],
              effectOptionFloatArgs: ["0x78:1"],
              effectOptions: {
                followTarget: true,
                offsetValues: { "0x78": [1] },
              },
            },
            nativeActionNames: ["Ability__HeroPLU__B_Overheat"],
            nativeNearbyEffectTokens: ["Effect_HeroPLU_SmokeCloudSput"],
            nativeNearbyBuffTokens: ["Buff_HeroPLU_TempNonRecoveryHelicopterPFX"],
            nativeNearbyAbilityNames: ["Ability__HeroPLU__B"],
            nativeNearbySoundTokens: ["Sound_HeroPLU_Overheat_NoUlt"],
            nativeSemanticCalls: ["vcall+0x48"],
            source: { functionName: "FUN_HEROPLU", line: 198 },
          },
        ],
      },
      kindredSlots: { items: [] },
      effectResourceRows: [
        {
          relativePath: "Effects/Hero012/Hero012_A_Impact/Hero012_A_Impact.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.nativeEffectChannelRows, 1);
  assert.equal(report.summary.byReason["native-effect-channel-resource-unresolved"], 1);
  assert.equal(report.items[0].reason, "native-effect-channel-resource-unresolved");
  assert.equal(report.items[0].nativeRuntimeKind, "effect-channel");
  assert.deepEqual(report.items[0].nativeEffectOptionOffsets, ["0x78"]);
  assert.deepEqual(report.items[0].nativeActionNames, ["Ability__HeroPLU__B_Overheat"]);
  assert.deepEqual(report.items[0].nativeNearbyEffectTokens, ["Effect_HeroPLU_SmokeCloudSput"]);
  assert.deepEqual(report.items[0].nativeNearbyBuffTokens, ["Buff_HeroPLU_TempNonRecoveryHelicopterPFX"]);
  assert.deepEqual(report.items[0].nativeNearbyAbilityNames, ["Ability__HeroPLU__B"]);
  assert.deepEqual(report.items[0].nativeNearbySoundTokens, ["Sound_HeroPLU_Overheat_NoUlt"]);
  assert.deepEqual(report.items[0].nativeSemanticCalls, ["vcall+0x48"]);
  assert.equal(report.summary.nativeNearbyTokenRows, 1);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].nativeRuntimeKind, "effect-channel");
  assert.equal(rows[0].nativeEffectOptionOffsets, "0x78");
  assert.equal(rows[0].nativeActionNames, "Ability__HeroPLU__B_Overheat");
  assert.equal(rows[0].nativeNearbyEffectTokens, "Effect_HeroPLU_SmokeCloudSput");
  assert.equal(rows[0].nativeNearbyBuffTokens, "Buff_HeroPLU_TempNonRecoveryHelicopterPFX");
  assert.equal(rows[0].nativeNearbyAbilityNames, "Ability__HeroPLU__B");
  assert.equal(rows[0].nativeNearbySoundTokens, "Sound_HeroPLU_Overheat_NoUlt");
  assert.match(rows[0].nativeEffectOptions, /followTarget/);
  assert.equal(rows[0].nativeSemanticCalls, "vcall+0x48");
});

test("buildEffectRuntimeGapReport ignores explicitly hidden effect channels", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:hidden-channel",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Malene_B2_SpikesWarning",
            token: "Effect_Malene_B2_SpikesWarning",
            actionKeys: [],
            heroNames: ["Malene"],
            resourcePaths: [],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptions: {
                followTarget: true,
                visibleOrActive: false,
                offsetValues: { "0xb0": [0] },
              },
            },
            source: { functionName: "FUN_MALENE_B2", line: 514 },
          },
        ],
      },
      kindredSlots: {
        items: [
          {
            heroLabel: "Malene",
            resourceStem: "Hero022_ShadowPuddle_Spike",
            resourcePath: "Effects/Hero022/Hero022_ShadowPuddle_Spike/Hero022_ShadowPuddle_Spike.pfx",
            actionKeys: [],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 0);
  assert.equal(report.summary.nativePrimitiveRenderableRows, 0);
});

test("buildEffectRuntimeGapReport separates named-root effect packages that are absent", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:oldhero",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_OldHero_Aura",
            token: "Effect_OldHero_Aura",
            actionKeys: [],
            heroNames: ["OldHero"],
            heroCodes: [],
            heroResourceRoots: [],
            resourcePaths: [],
            source: { functionName: "FUN_OLDHERO", line: 12 },
          },
        ],
      },
      kindredSlots: { items: [] },
      definitionRows: [
        {
          manifestLabel: "*OldHero*",
          targetRelativePath: "Characters/OldHero/OldHero.def",
          childResourceRows: "11",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.byReason["effect-resource-package-missing"], 1);
  assert.equal(report.items[0].reason, "effect-resource-package-missing");
  assert.deepEqual(report.items[0].missingEffectResourceRoots, ["OldHero"]);
  assert.deepEqual(report.items[0].heroResourceRoots, ["OldHero"]);
  assert.equal(reportRowsForManifest(report)[0].heroResourceRoots, "OldHero");
});

test("buildEffectRuntimeGapReport separates extra definition roots when a real effect root exists", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:lanceball",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_LanceBall_Lance_HoldingBall",
            token: "Effect_LanceBall_Lance_HoldingBall",
            actionKeys: ["ability03"],
            heroNames: ["LanceBall"],
            heroCodes: ["Hero028"],
            resourcePaths: [],
            source: { functionName: "FUN_LANCEBALL", line: 12 },
          },
        ],
      },
      kindredSlots: { items: [] },
      definitionRows: [
        {
          manifestLabel: "*LanceBall_Lance_A_LandingIndicator*",
          targetRelativePath: "Characters/LanceBall/Lance/LanceBall_Lance_A_LandingIndicator.def",
          childResourceRows: "12",
        },
        {
          manifestLabel: "*Hero028*",
          targetRelativePath: "Characters/Hero028/Lance.def",
          childResourceRows: "44",
          skeletonSamples: "Characters/Hero028/Art/hero028.skeleton",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Hero028/Hero028_A_Cast/Hero028_A_Cast.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.byReason["effect-resource-package-missing"], undefined);
  assert.equal(report.summary.byReason["definition-extra-resource-root-without-effect-package"], 1);
  assert.equal(report.items[0].reason, "definition-extra-resource-root-without-effect-package");
  assert.deepEqual(report.items[0].presentEffectResourceRoots, ["Hero028"]);
  assert.deepEqual(report.items[0].missingEffectResourceRoots, ["LanceBall_Lance_A_LandingIndicator"]);
  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].presentEffectResourceRoots, "Hero028");
  assert.equal(rows[0].missingEffectResourceRoots, "LanceBall_Lance_A_LandingIndicator");
});

test("buildEffectRuntimeGapReport uses KindredEffects roots for named heroes before declaring packages missing", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:malene",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Malene_B1_Buff",
            token: "Effect_Malene_B1_Buff",
            actionKeys: [],
            heroNames: ["Malene"],
            heroCodes: [],
            heroResourceRoots: [],
            resourcePaths: [],
            source: { functionName: "FUN_MALENE", line: 12 },
          },
        ],
      },
      kindredSlots: {
        items: [
          {
            modelLabel: "Malene_DefaultSkin",
            heroLabel: "Malene",
            actionKeys: [],
            role: "persistent",
            resourcePath: "Effects/Hero022/Hero022_LightAura/Hero022_LightAura.pfx",
            resourceRoot: "Hero022",
            resourceStem: "Hero022_LightAura",
          },
        ],
      },
      definitionRows: [
        {
          manifestLabel: "*Malene*",
          targetRelativePath: "Characters/Malene/Malene.def",
          childResourceRows: "351",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Hero022/Hero022_LightAura/Hero022_LightAura.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.byReason["effect-resource-package-missing"], undefined);
  assert.equal(report.items[0].reason, "missing-action-context");
  assert.deepEqual(report.items[0].heroResourceRoots, ["Hero022"]);
  assert.deepEqual(report.items[0].missingEffectResourceRoots, []);
});

test("buildEffectRuntimeGapReport prefers definition Hero roots over alias name roots", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:varya",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Varya_Storm",
            token: "Effect_Varya_Storm",
            actionKeys: ["ability01"],
            heroNames: ["Varya"],
            heroCodes: [],
            heroResourceRoots: ["Varya"],
            resourcePaths: [],
            source: { functionName: "FUN_VARYA", line: 12 },
          },
        ],
      },
      kindredSlots: { items: [] },
      definitionRows: [
        {
          manifestLabel: "*Varya*",
          targetRelativePath: "Characters/Hero045/Varya.def",
          childResourceRows: "198",
          skeletonSamples: "Characters/Hero045/Art/hero045.skeleton",
        },
      ],
      effectResourceRows: [
        {
          relativePath: "Effects/Hero045/Hero045_A_Proj/Hero045_A_Proj.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.byReason["effect-resource-package-missing"], undefined);
  assert.equal(report.items[0].reason, "no-resource-match");
  assert.deepEqual(report.items[0].heroResourceRoots, ["Hero045"]);
  assert.deepEqual(report.items[0].missingEffectResourceRoots, []);
});

test("buildEffectRuntimeGapReport ignores empty effect channels covered by resource-bound visual bone hooks", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:tony-channel",
            platform: "android",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Tony_Buff_A",
            token: "Effect_Tony_Buff_A",
            actionKeys: ["ability01"],
            heroCodes: ["Hero039"],
            resourcePaths: [],
            source: { functionName: "FUN_TONY", line: 588 },
          },
          {
            id: "android:tony-visual",
            platform: "android",
            sourceKind: "native-visual-binding",
            effectToken: "Effect_Tony_Buff_A",
            token: "Effect_Tony_Buff_A",
            boneToken: "Bone_Rightjet",
            runtimeBinding: { kind: "bone", boneToken: "Bone_Rightjet" },
            actionKeys: ["ability01"],
            heroCodes: ["Hero039"],
            resourcePaths: ["Effects/Hero039/Hero039_A_R_Buff/Hero039_A_R_Buff.pfx"],
            source: { functionName: "FUN_TONY", line: 575 },
          },
          {
            id: "android:other-channel",
            platform: "android",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Tony_Buff_A_2",
            token: "Effect_Tony_Buff_A_2",
            actionKeys: ["ability01"],
            heroCodes: ["Hero039"],
            resourcePaths: [],
            source: { functionName: "FUN_TONY_2", line: 617 },
          },
        ],
      },
      kindredSlots: { items: [] },
      effectResourceRows: [
        {
          relativePath: "Effects/Hero039/Hero039_A_R_Buff/Hero039_A_R_Buff.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.items.some((item) => item.effectToken === "Effect_Tony_Buff_A"), false);
  assert.equal(report.items[0].effectToken, "Effect_Tony_Buff_A_2");
});

test("buildEffectRuntimeGapReport exposes resource-bound PFX area surfaces that still lack shape evidence", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:ringo-aura",
            sourceKind: "native-visual-binding",
            effectToken: "Effect_Ringo_Ability02_Aura",
            token: "Effect_Ringo_Ability02_Aura",
            actionKeys: ["ability02"],
            heroCodes: ["Ringo"],
            resourcePaths: ["Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              runtimeStartSeconds: 0,
              timelineTimes: [0],
            },
            source: { functionName: "FUN_RINGO", line: 87 },
          },
          {
            id: "android:grace-warning",
            sourceKind: "native-visual-binding",
            effectToken: "Effect_Grace_B_Warning",
            token: "Effect_Grace_B_Warning",
            actionKeys: ["ability02"],
            heroCodes: ["Hero042"],
            resourcePaths: ["Effects/Hero042/Hero042_B_Warning/Hero042_B_Warning.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionFloatArgs: ["0xd0:3.5"],
              effectOptions: {
                scale: 3.5,
              },
            },
            source: { functionName: "FUN_GRACE", line: 24 },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 8,
                relativePath: "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.Surface[8].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: {},
                parameterProfile: {
                  evidenceClass: "lifecycle",
                  semanticSlots: [{ name: "negativeOneSentinel", relativeOffset: 153, value: -1 }],
                  sampledOffsetCount: 2,
                },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  initialSizeCallback: {
                    resolverCurrentCallbackAddress: "0x1000",
                    resolverCurrentCallbackSemanticClass: "computed-callback",
                    resolverFallbackCallbackAddress: "0x2000",
                    resolverFallbackCallbackSemanticClass: "constant-scalar-store",
                  },
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverCurrentCallbackAddress: "0x3000",
                    resolverCurrentCallbackSemanticClass: "helper-call-callback",
                  },
                },
                emitterRuntimeProfile: {
                  semanticSlots: [
                    {
                      name: "sizeDeltaCallback",
                      relativeOffset: 204,
                      runtimeOffset: "0x270",
                      targetArrayOffset: "0x30000",
                      targetArraySemantic: "size",
                      callbackOutputComponents: 1,
                      resolverCurrentCallbackOutputStore: "curve-table-range-to-param3[3]",
                    },
                  ],
                },
                sampledFloats: [
                  { relativeOffset: 153, value: -1 },
                  { relativeOffset: 245, value: 3.5221 },
                ],
              },
              {
                surfaceIndex: 9,
                relativePath: "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.Surface[9].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { sizeScalar: 1.2 },
                parameterProfile: {
                  evidenceClass: "lifecycle-transform",
                  semanticSlots: [{ name: "sizeScalar", relativeOffset: 213, value: 1.2 }],
                  sampledOffsetCount: 1,
                },
                sampledFloats: [{ relativeOffset: 213, value: 1.2 }],
              },
            ],
          },
          {
            relativePath: "Effects/Hero042/Hero042_B_Warning/Hero042_B_Warning.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 24,
                relativePath: "Effects/Hero042/Hero042_B_Warning/Hero042_B_Warning.Surface[24].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { durationSeconds: 0.05 },
                parameterProfile: {
                  evidenceClass: "lifecycle",
                  semanticSlots: [{ name: "durationSeconds", relativeOffset: 209, value: 0.05 }],
                  sampledOffsetCount: 1,
                },
                sampledFloats: [{ relativeOffset: 209, value: 0.05 }],
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.Surface[8].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/RingoAbility02Aura.Surface[8].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.0258,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
          {
            relativePath: "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.Surface[9].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/RingoAbility02Aura.Surface[9].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.04,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
          {
            relativePath: "Effects/Hero042/Hero042_B_Warning/Hero042_B_Warning.Surface[24].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/Hero042_B_Warning.Surface[24].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.08,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 1);
  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.deepEqual(report.summary.byAreaShapeGapCallbackComponents, { 1: 1 });
  assert.deepEqual(report.summary.byAreaShapeGapCurrentStore, { "curve-table-range-to-param3[3]": 1 });
  assert.deepEqual(report.summary.byAreaShapeGapSizeCallbackCurrentClass, { "helper-call-callback": 1 });
  assert.equal(report.summary.byReason["pfx-area-shape-evidence-missing"], 1);
  assert.equal(report.items[0].reason, "pfx-area-shape-evidence-missing");
  assert.equal(report.items[0].effectToken, "Effect_Ringo_Ability02_Aura");
  assert.equal(report.items.some((item) => item.effectToken === "Effect_Grace_B_Warning"), false);
  assert.equal(report.items[0].pfxPath, "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.pfx");
  assert.equal(
    report.items[0].shadergraphPath,
    "Effects/Ringo/ability02/RingoAbility02Aura.assetbundle/RingoAbility02Aura.Surface[8].shadergraph",
  );
  assert.equal(report.items[0].surfaceIndex, 8);
  assert.equal(report.items[0].shapeGapReason, "missing-area-shape-evidence");
  assert.equal(report.items[0].previewTextureAlphaCoverage, 0.0258);
  assert.deepEqual(report.items[0].parameterSemanticSlots, ["negativeOneSentinel@153=-1"]);
  assert.deepEqual(report.items[0].sampledFloatOffsets, ["153:-1", "245:3.5221"]);
  assert.deepEqual(report.items[0].pfxShapeCallbacks, [
    "initialSizeCallback:current=0x1000:currentClass=computed-callback:fallback=0x2000:fallbackClass=constant-scalar-store",
    "sizeCallback:current=0x3000:currentClass=helper-call-callback:components=1:currentStore=curve-table-range-to-param3[3]",
  ]);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].reason, "pfx-area-shape-evidence-missing");
  assert.equal(rows[0].surfaceIndex, 8);
  assert.equal(rows[0].shapeGapReason, "missing-area-shape-evidence");
  assert.match(rows[0].shadergraphPath, /RingoAbility02Aura\.Surface\[8\]/);
  assert.equal(rows[0].parameterSemanticSlots, "negativeOneSentinel@153=-1");
  assert.equal(
    rows[0].pfxShapeCallbacks,
    "initialSizeCallback:current=0x1000:currentClass=computed-callback:fallback=0x2000:fallbackClass=constant-scalar-store|sizeCallback:current=0x3000:currentClass=helper-call-callback:components=1:currentStore=curve-table-range-to-param3[3]",
  );
});

test("buildEffectRuntimeGapReport summarizes unresolved packed-literal PFX shape callbacks", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:packed-shape",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_PackedShape",
            token: "Effect_Test_PackedShape",
            actionKeys: ["ability01"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Hero999/TestPacked/TestPacked.pfx"],
            source: { functionName: "FUN_PACKED", line: 19 },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Hero999/TestPacked/TestPacked.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 3,
                relativePath: "Effects/Hero999/TestPacked/TestPacked.Surface[3].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: {},
                parameterProfile: {
                  evidenceClass: "lifecycle",
                  semanticSlots: [{ name: "durationSeconds", relativeOffset: 209, value: 0.05 }],
                },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  initialSizeCallback: {
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackAddress: "0x1000",
                    resolverCurrentCallbackSemanticClass: "constant-zero-scalar-store",
                  },
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverInputKind: "packed-literal",
                    resolverResolutionStatus: "likely-packed-literal",
                    callbackOutputComponents: 1,
                    resolverPackedLiteralFloatCandidates: [
                      { byteOffset: 1, value: -6.9757, source: "float32le-window" },
                      { byteOffset: 3, value: -0.1536, source: "float32le-window" },
                    ],
                  },
                },
                emitterRuntimeProfile: {
                  semanticSlots: [
                    {
                      name: "sizeDeltaCallback",
                      relativeOffset: 204,
                      runtimeOffset: "0x270",
                      targetArraySemantic: "size",
                      callbackOutputComponents: 1,
                      resolverInputKind: "packed-literal",
                      resolverResolutionStatus: "likely-packed-literal",
                      resolverPackedLiteralFloatCandidates: [
                        { byteOffset: 1, value: -6.9757, source: "float32le-window" },
                        { byteOffset: 3, value: -0.1536, source: "float32le-window" },
                      ],
                    },
                  ],
                },
                sampledFloats: [{ relativeOffset: 209, value: 0.05 }],
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Hero999/TestPacked/TestPacked.Surface[3].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/TestPacked.Surface[3].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.025,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.deepEqual(report.summary.byAreaShapeGapResolverInputKind, { "packed-literal": 1 });
  assert.deepEqual(report.summary.byAreaShapeGapResolutionStatus, { "likely-packed-literal": 1 });
  assert.deepEqual(report.summary.byAreaShapeGapPackedLiteralSign, { negative: 1 });
  assert.deepEqual(report.summary.byAreaShapeGapSizeCallbackResolverInputKind, { "packed-literal": 1 });
  assert.deepEqual(report.summary.byAreaShapeGapSizeCallbackResolutionStatus, { "likely-packed-literal": 1 });
  assert.deepEqual(report.summary.byAreaShapeGapSizeCallbackPackedLiteralSign, { negative: 1 });
  assert.deepEqual(report.items[0].pfxShapeCallbacks, [
    "initialSizeCallback:current=0x1000:currentClass=constant-zero-scalar-store:input=candidate-key:resolution=current-table-callback-matched",
    "sizeCallback:components=1:input=packed-literal:resolution=likely-packed-literal:packedFloats=1@-6.9757,3@-0.1536",
  ]);
});

test("buildEffectRuntimeGapReport summarizes shape output gaps by size callback input kind", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:shape-output-gap",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_ShapeOutputGap",
            token: "Effect_Test_ShapeOutputGap",
            actionKeys: ["ability01"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Hero999/TestOutputGap/TestOutputGap.pfx"],
            source: { functionName: "FUN_OUTPUT_GAP", line: 20 },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 3,
                relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[3].shadergraph",
                prelude: { renderFamily: "area" },
                parameterProfile: { evidenceClass: "lifecycle", semanticSlots: [] },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverInputKind: "packed-literal",
                    resolverResolutionStatus: "likely-packed-literal",
                    callbackOutputComponents: 1,
                    resolverPackedLiteralFloatCandidates: [{ byteOffset: 1, value: -0.5, source: "float32le-window" }],
                  },
                },
              },
              {
                surfaceIndex: 4,
                relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[4].shadergraph",
                prelude: { renderFamily: "area" },
                parameterProfile: { evidenceClass: "lifecycle", semanticSlots: [] },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackAddress: "0x4000",
                    resolverCurrentCallbackSemanticClass: "helper-call-callback",
                    resolverFallbackCallbackAddress: "0x2400",
                    resolverFallbackCallbackSemanticClass: "constant-zero-scalar-store",
                    callbackOutputComponents: 1,
                  },
                },
              },
              {
                surfaceIndex: 5,
                relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[5].shadergraph",
                prelude: { renderFamily: "area" },
                parameterProfile: { evidenceClass: "lifecycle", semanticSlots: [] },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackAddress: "0x5000",
                    resolverCurrentCallbackSemanticClass: "constant-pattern16-store",
                    resolverCurrentCallbackOutputStore: "pattern16-to-param2",
                    resolverCurrentCallbackPattern16ReadStatus: "encrypted-range",
                    resolverFallbackCallbackAddress: "0x2500",
                    resolverFallbackCallbackSemanticClass: "computed-callback",
                    callbackOutputComponents: 1,
                  },
                },
              },
              {
                surfaceIndex: 6,
                relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[6].shadergraph",
                prelude: { renderFamily: "area" },
                parameterProfile: { evidenceClass: "lifecycle", semanticSlots: [] },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    relativeOffset: 204,
                    runtimeOffset: "0x270",
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackAddress: "0x6000",
                    resolverCurrentCallbackSemanticClass: "computed-callback",
                    resolverCurrentCallbackOutputStore: "curve-table-range-to-param3",
                    resolverCurrentCallbackCurveTableReadStatus: "encrypted-range",
                    callbackOutputComponents: 1,
                  },
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[3].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/TestOutputGap.Surface[3].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.02,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
          {
            relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[4].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/TestOutputGap.Surface[4].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.03,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
          {
            relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[5].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/TestOutputGap.Surface[5].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.04,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
          {
            relativePath: "Effects/Hero999/TestOutputGap/TestOutputGap.Surface[6].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/TestOutputGap.Surface[6].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.05,
            previewTextureSpriteUsable: true,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.areaShapeGapRows, 4);
  assert.deepEqual(report.summary.byAreaShapeGapMissingCurrentStoreResolverInputKind, {
    "candidate-key": 1,
    "packed-literal": 1,
  });
  assert.deepEqual(report.summary.byAreaShapeGapMissingCurrentStoreCurrentClass, {
    "(none)": 1,
    "helper-call-callback": 1,
  });
  assert.deepEqual(report.summary.byAreaShapeGapSizeCallbackFallbackClass, {
    "(none)": 2,
    "computed-callback": 1,
    "constant-zero-scalar-store": 1,
  });
  assert.deepEqual(report.summary.byAreaShapeGapPattern16ReadStatus, {
    "encrypted-range": 1,
  });
  assert.deepEqual(report.summary.byAreaShapeGapCurveTableReadStatus, {
    "encrypted-range": 1,
  });
  assert.equal(report.items.find((item) => item.surfaceIndex === 4).areaShapeGapSizeCallbackFallbackClass, "constant-zero-scalar-store");
  assert.equal(report.items.find((item) => item.surfaceIndex === 5).areaShapeGapSizeCallbackFallbackClass, "computed-callback");
  assert.match(report.items.find((item) => item.surfaceIndex === 5).pfxShapeCallbacks.join("|"), /pattern16Read=encrypted-range/);
  assert.match(report.items.find((item) => item.surfaceIndex === 6).pfxShapeCallbacks.join("|"), /curveTableRead=encrypted-range/);
});

test("buildEffectRuntimeGapReport separates native percent params from proven shape evidence", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:churnwalker-torment",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Churnwalker_TormentActivation",
            token: "Effect_Churnwalker_TormentActivation",
            actionKeys: ["ability02"],
            heroCodes: ["Hero031"],
            resourcePaths: ["Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionOffsets: ["0xb0", "0x60"],
              effectOptionFloatArgs: ["0xb0:1", "0x60:0.5"],
              effectOptions: {
                offsetValues: { "0xb0": [1], "0x60": [0.5] },
                percentParam: 0.5,
                visibleOrActive: true,
              },
            },
            source: { functionName: "FUN_CHURN", line: 149 },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 32,
                relativePath: "Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.Surface[32].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { durationSeconds: 0.15 },
                parameterProfile: {
                  evidenceClass: "lifecycle",
                  semanticSlots: [{ name: "durationSeconds", relativeOffset: 209, value: 0.15 }],
                  sampledOffsetCount: 2,
                },
                sampledFloats: [
                  { relativeOffset: 153, value: -1 },
                  { relativeOffset: 209, value: 0.15 },
                ],
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Hero031/Hero031_B_AOE/Hero031_B_AOE.Surface[32].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/Hero031_B_AOE.Surface[32].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.06,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.equal(report.summary.areaShapeNativePercentParamRows, 1);
  assert.equal(report.items[0].shapeGapReason, "missing-area-shape-evidence");
  assert.deepEqual(report.items[0].nativePercentParamOffsets, ["0x60"]);
  assert.deepEqual(report.items[0].nativePercentParamValues, ["0x60:0.5"]);

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].nativePercentParamOffsets, "0x60");
  assert.equal(rows[0].nativePercentParamValues, "0x60:0.5");
});

test("buildEffectRuntimeGapReport exposes structured area shape callback diagnostics", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:area-shape-diagnostics",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_AreaShapeDiagnostics",
            token: "Effect_Test_AreaShapeDiagnostics",
            actionKeys: ["ability02"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Test/AreaShapeDiagnostics/AreaShapeDiagnostics.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              timelineTimes: [0],
            },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaShapeDiagnostics/AreaShapeDiagnostics.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 12,
                relativePath: "Effects/Test/AreaShapeDiagnostics/AreaShapeDiagnostics.Surface[12].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { durationSeconds: 0.2 },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    callbackOutputComponents: 1,
                    resolverInputKind: "packed-literal",
                    resolverResolutionStatus: "likely-packed-literal",
                    resolverCurrentCallbackSemanticClass: "computed-callback",
                    resolverCurrentCallbackOutputStore: "computed-scalar-to-param3",
                    resolverCurrentCallbackPattern16ReadStatus: "encrypted-range",
                    resolverPackedLiteralFloatCandidates: [{ byteOffset: 1, value: -0.5 }],
                  },
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaShapeDiagnostics/AreaShapeDiagnostics.Surface[12].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/AreaShapeDiagnostics.Surface[12].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.05,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.equal(report.items[0].areaShapeGapCallbackComponents, "1");
  assert.equal(report.items[0].areaShapeGapCurrentStore, "computed-scalar-to-param3");
  assert.equal(report.items[0].areaShapeGapSizeCallbackResolverInputKind, "packed-literal");
  assert.equal(report.items[0].areaShapeGapSizeCallbackResolutionStatus, "likely-packed-literal");
  assert.equal(report.items[0].areaShapeGapSizeCallbackPackedLiteralSign, "negative");
  assert.equal(report.items[0].areaShapeGapSizeCallbackCurrentClass, "computed-callback");
  assert.equal(report.items[0].areaShapeGapPattern16ReadStatus, "encrypted-range");

  const rows = reportRowsForManifest(report);
  assert.equal(rows[0].areaShapeGapCurrentStore, "computed-scalar-to-param3");
  assert.equal(rows[0].areaShapeGapSizeCallbackPackedLiteralSign, "negative");
});

test("buildEffectRuntimeGapReport gates encrypted PFX area shapes behind runtime overlays", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "ios:area-overlay",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_AreaOverlay",
            token: "Effect_Test_AreaOverlay",
            actionKeys: ["ability03"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Test/AreaOverlay/AreaOverlay.pfx"],
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaOverlay/AreaOverlay.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 5,
                relativePath: "Effects/Test/AreaOverlay/AreaOverlay.Surface[5].shadergraph",
                prelude: { renderFamily: "area" },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    callbackOutputComponents: 1,
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackSemanticClass: "constant-pattern16-store",
                    resolverCurrentCallbackOutputStore: "pattern16-to-param2",
                    resolverCurrentCallbackPattern16ReadStatus: "encrypted-range",
                  },
                },
              },
              {
                surfaceIndex: 6,
                relativePath: "Effects/Test/AreaOverlay/AreaOverlay.Surface[6].shadergraph",
                prelude: { renderFamily: "area" },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    callbackOutputComponents: 1,
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackSemanticClass: "constant-zero-scalar-store",
                    resolverCurrentCallbackOutputStore: "zero-to-param2-array",
                    resolverCurrentCallbackConstantValue: 0,
                  },
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaOverlay/AreaOverlay.Surface[5].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/AreaOverlay.Surface[5].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.04,
          },
          {
            relativePath: "Effects/Test/AreaOverlay/AreaOverlay.Surface[6].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/AreaOverlay.Surface[6].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.04,
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 2);
  assert.equal(report.summary.effectRuntimePreviewTakeoverAllowed, false);
  assert.equal(report.summary.effectRuntimePreviewBlockedRows, 2);
  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.equal(report.summary.areaShapeRuntimeHiddenRows, 1);
  assert.equal(report.summary.areaShapeRuntimeOverlayRequiredRows, 1);
  assert.equal(report.summary.areaShapeRuntimeOverlayRequiredEffectTokens, 1);
  assert.equal(report.summary.areaShapeRuntimeOverlayRequiredPfxPaths, 1);
  assert.deepEqual(report.summary.byAreaShapeGapRuntimeRequirement, {
    "requires-runtime-overlay": 1,
    "runtime-hidden": 1,
  });

  const encrypted = report.items.find((item) => item.surfaceIndex === 5);
  assert.equal(encrypted.reason, "pfx-area-shape-evidence-missing");
  assert.equal(encrypted.areaShapeGapBlockClass, "blocked-ios-encrypted-pattern16-data");
  assert.equal(encrypted.areaShapeGapRuntimeRequirement, "requires-runtime-overlay");
  assert.equal(encrypted.runtimeOverlayRequired, true);
  assert.equal(encrypted.renderPromotionAllowed, false);

  const hidden = report.items.find((item) => item.surfaceIndex === 6);
  assert.equal(hidden.reason, "pfx-area-shape-runtime-hidden");
  assert.equal(hidden.areaShapeGapRuntimeRequirement, "runtime-hidden");
  assert.equal(hidden.runtimeOverlayRequired, false);

  const rows = reportRowsForManifest(report);
  assert.equal(rows.find((row) => row.surfaceIndex === 5).areaShapeGapRuntimeRequirement, "requires-runtime-overlay");
  assert.equal(rows.find((row) => row.surfaceIndex === 5).runtimeOverlayRequired, "yes");
  assert.equal(rows.find((row) => row.surfaceIndex === 6).runtimeOverlayRequired, "no");
});

test("buildEffectRuntimeGapReport treats unresolved random size ranges as native callback runtime blockers", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "ios:random-size",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_RandomSize",
            token: "Effect_Test_RandomSize",
            actionKeys: ["ability03"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Test/RandomSize/RandomSize.pfx"],
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Test/RandomSize/RandomSize.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 5,
                relativePath: "Effects/Test/RandomSize/RandomSize.Surface[5].shadergraph",
                prelude: { renderFamily: "area" },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  sizeCallback: {
                    callbackOutputComponents: 1,
                    resolverInputKind: "candidate-key",
                    resolverResolutionStatus: "current-table-callback-matched",
                    resolverCurrentCallbackSemanticClass: "computed-callback",
                    resolverCurrentCallbackOutputStore: "random-affine-to-param2",
                    resolverCurrentCallbackRandomMinValue: 0,
                    resolverCurrentCallbackRandomMaxValue: 360,
                  },
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Test/RandomSize/RandomSize.Surface[5].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/RandomSize.Surface[5].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.12,
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.areaShapeGapRows, 1);
  assert.equal(report.summary.areaShapeRuntimeOverlayRequiredRows, 0);
  assert.deepEqual(report.summary.byAreaShapeGapBlockClass, {
    "blocked-random-range-callback": 1,
  });
  assert.deepEqual(report.summary.byAreaShapeGapRuntimeRequirement, {
    "requires-native-callback-runtime": 1,
  });
  assert.equal(report.items[0].areaShapeGapBlockClass, "blocked-random-range-callback");
  assert.equal(report.items[0].areaShapeGapRuntimeRequirement, "requires-native-callback-runtime");
  assert.equal(report.items[0].runtimeOverlayRequired, false);
  assert.equal(report.items[0].renderPromotionAllowed, false);
});

test("buildEffectRuntimeGapReport treats PFX shape profiles as area shape evidence", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:area-shape-profile",
            sourceKind: "native-visual-binding",
            effectToken: "Effect_Test_Area",
            token: "Effect_Test_Area",
            actionKeys: ["ability01"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Test/AreaShapeProfile/AreaShapeProfile.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              timelineTimes: [0],
            },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaShapeProfile/AreaShapeProfile.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 4,
                relativePath: "Effects/Test/AreaShapeProfile/AreaShapeProfile.Surface[4].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { durationSeconds: 0.5 },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  renderSizeScalar: 2,
                  renderSizeSource: "current-callback-constant",
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Test/AreaShapeProfile/AreaShapeProfile.Surface[4].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/AreaShapeProfile.Surface[4].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.04,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 0);
  assert.equal(report.summary.areaShapeGapRows, 0);
  assert.equal(report.summary.byReason["pfx-area-shape-evidence-missing"], undefined);
});

test("buildEffectRuntimeGapReport treats shaped sibling surface records as area shape evidence", () => {
  const report = buildEffectRuntimeGapReport(
    {
      effectHookManifest: {
        items: [
          {
            id: "android:shared-surface",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Test_SharedSurface",
            token: "Effect_Test_SharedSurface",
            actionKeys: ["ability02"],
            heroCodes: ["Hero999"],
            resourcePaths: ["Effects/Test/SharedSurface/SharedSurface.pfx"],
            runtimeBinding: {
              kind: "effect-channel",
              timelineTimes: [0],
            },
          },
        ],
      },
      kindredSlots: { items: [] },
      pfxResourceManifest: {
        items: [
          {
            relativePath: "Effects/Test/SharedSurface/SharedSurface.pfx",
            surfaceRecords: [
              {
                surfaceIndex: 30,
                relativePath: "Effects/Test/SharedSurface/SharedSurface.Surface[30].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { durationSeconds: 0.05 },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  initialSizeCallback: {
                    resolverCurrentCallbackAddress: "0x1000",
                    resolverCurrentCallbackSemanticClass: "constant-zero-scalar-store",
                  },
                },
              },
              {
                surfaceIndex: 30,
                relativePath: "Effects/Test/SharedSurface/SharedSurface.Surface[30].shadergraph",
                prelude: { renderFamily: "area" },
                runtimeHints: { delaySeconds: 0.15, durationSeconds: 0.05 },
                shapeProfile: {
                  evidenceClass: "emitter-size-callback",
                  renderSizeScalar: 1,
                  renderSizeSource: "current-callback-curve-boundary-max",
                },
              },
            ],
          },
        ],
      },
      shadergraphMaterialManifest: {
        items: [
          {
            relativePath: "Effects/Test/SharedSurface/SharedSurface.Surface[30].shadergraph",
            materialStatus: "classified",
            previewSurfaceRejectReason: "area-masked-base-card-risk",
            previewSurfaceRenderable: false,
            previewTexture: "../effect_textures_preview/SharedSurface.Surface[30].png",
            previewTextureMode: "pvrtc-alpha-mask",
            previewTextureAlphaCoverage: 0.12,
            roleNames: ["alphaBlend", "alphaMask", "baseColor"],
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.rows, 0);
  assert.equal(report.summary.areaShapeGapRows, 0);
  assert.equal(report.summary.byReason["pfx-area-shape-evidence-missing"], undefined);
});

test("kindredSlotCandidatesForHook uses runtime naming aliases for AA and hit resources", () => {
  const slots = [
    {
      modelLabel: "Malene_DefaultSkin",
      heroLabel: "Malene",
      actionKeys: ["attack"],
      role: "effect",
      resourceStem: "Hero022_AA_Light",
      resourcePath: "Effects/Hero022/Hero022_AA_Light/Hero022_AA_Light.pfx",
    },
    {
      modelLabel: "Malene_DefaultSkin",
      heroLabel: "Malene",
      actionKeys: ["attack"],
      role: "impact",
      resourceStem: "Hero022_AA_Hit_Light",
      resourcePath: "Effects/Hero022/Hero022_AA_Hit_Light/Hero022_AA_Hit_Light.pfx",
    },
  ];

  const candidates = kindredSlotCandidatesForHook(
    {
      effectToken: "Effect_Malene_DefaultAttack",
      token: "Effect_Malene_DefaultAttack",
      actionKeys: ["attack"],
    },
    slots,
  );

  assert.deepEqual(
    candidates.map((slot) => slot.resourcePath),
    [
      "Effects/Hero022/Hero022_AA_Hit_Light/Hero022_AA_Hit_Light.pfx",
      "Effects/Hero022/Hero022_AA_Light/Hero022_AA_Light.pfx",
    ],
  );
});

test("kindredSlotCandidatesForHook splits compact selector names like A1Hit", () => {
  const candidates = kindredSlotCandidatesForHook(
    {
      effectToken: "Effect_Malene_A1Hit",
      token: "Effect_Malene_A1Hit",
      actionKeys: [],
    },
    [
      {
        modelLabel: "Malene_Skin_Candy",
        heroLabel: "Malene",
        actionKeys: ["ability01"],
        role: "impact",
        resourceStem: "Hero022_CANDY_A_Light_Hit",
        resourcePath: "Effects/Hero022/CANDY/Hero022_CANDY_A_Light_Hit/Hero022_CANDY_A_Light_Hit.pfx",
      },
    ],
  );

  assert.deepEqual(candidates.map((slot) => slot.resourcePath), [
    "Effects/Hero022/CANDY/Hero022_CANDY_A_Light_Hit/Hero022_CANDY_A_Light_Hit.pfx",
  ]);
});

test("exportEffectRuntimeGapReport writes TSV and JSON reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-runtime-gap-"));
  const effectHookPath = path.join(tempDir, "effect-hook-runtime-manifest.json");
  const kindredSlotPath = path.join(tempDir, "kindred-effect-resource-slots.json");
  fs.writeFileSync(
    effectHookPath,
    JSON.stringify({
      items: [
        {
          id: "android:gap",
          sourceKind: "native-effect-spawn",
          effectToken: "Effect_NoHero",
          token: "Effect_NoHero",
          actionKeys: [],
          heroCodes: [],
          resourcePaths: [],
          source: { functionName: "FUN", line: 2 },
        },
      ],
    }),
  );
  fs.writeFileSync(kindredSlotPath, JSON.stringify({ items: [] }));

  const viewerOut = path.join(tempDir, "effect-runtime-gaps.json");
  const tsvOut = path.join(tempDir, "effect_runtime_gaps.tsv");
  const jsonOut = path.join(tempDir, "effect_runtime_gaps_summary.json");
  const summary = exportEffectRuntimeGapReport({ effectHookPath, kindredSlotPath, viewerOut, tsvOut, jsonOut });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /no-hero-resource-context/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.rows, 1);
});
