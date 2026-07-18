const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeProjectileBindingCoverageRows,
  exportRuntimeProjectileBindingCoverageReport,
  summarizeRuntimeProjectileBindingCoverageRows,
} = require("../tools/effect_projectile_binding_coverage_report");

const runtimeItems = [
  {
    rel: "Characters/Adagio/Art/adagio.glb",
    character: "Adagio",
    modelLabel: "Adagio_DefaultSkin",
    sourceRelativePath: "Characters/Adagio/Adagio.def",
    slots: [
      {
        slotName: "Bone_RightHand",
        resolvedBoneIndex: 44,
        definitionLabels: "?DefaultAttack_Projectile|DefaultAttack_Projectile",
      },
      {
        slotName: "Bone_LeftHand",
        resolvedBoneIndex: 31,
        definitionLabels: "LeftHandProjectile",
      },
    ],
  },
  {
    rel: "Characters/Gwen/Art/gwen.glb",
    character: "Gwen",
    modelLabel: "Gwen_DefaultSkin",
    sourceRelativePath: "Characters/Gwen/Gwen.def",
    slots: [
      {
        slotName: "Bone_Weapon",
        resolvedBoneIndex: 12,
        definitionLabels: "AA_Empowered",
      },
    ],
  },
  {
    rel: "Characters/Hero010/Art/hero010.glb",
    character: "Hero010",
    modelLabel: "Skaarf_DefaultSkin",
    sourceRelativePath: "Characters/Hero010/Skaarf.def",
    slots: [
      {
        slotName: "Bone_Jaw",
        resolvedBoneIndex: 9,
        definitionLabels: "",
      },
    ],
  },
];

const projectileItems = [
  {
    modelLabel: "Adagio_DefaultSkin",
    heroLabel: "Adagio",
    role: "projectile",
    actionKeys: ["attack"],
    resourcePath: "Effects/Adagio/AdagioProjectileGround.assetbundle/AdagioProjectileGround.pfx",
    boneToken: "",
  },
  {
    modelLabel: "Adagio_DefaultSkin",
    heroLabel: "Adagio",
    role: "projectile",
    actionKeys: ["ability01"],
    resourcePath: "Effects/Adagio/Adagio_Heal_Projectile.assetbundle/Adagio_Heal_Projectile.pfx",
    boneToken: "Bone_LeftHand",
  },
  {
    modelLabel: "Gwen_DefaultSkin",
    heroLabel: "Gwen",
    role: "projectile",
    actionKeys: ["ability03"],
    resourcePath: "Effects/Gwen/Gwen_C_Projectile/Gwen_C_Projectile.pfx",
    boneToken: "",
  },
  {
    modelLabel: "Gwen_DefaultSkin",
    heroLabel: "Gwen",
    role: "projectile",
    actionKeys: ["attack"],
    resourcePath: "Effects/Gwen/Gwen_AA/Gwen_AA.pfx",
    boneToken: "",
  },
  {
    modelLabel: "Ringo_DefaultSkin",
    heroLabel: "Ringo",
    role: "projectile",
    actionKeys: ["attack"],
    resourcePath: "Effects/Ringo/Ringo_AA/Ringo_AA.pfx",
    boneToken: "",
  },
  {
    modelLabel: "Skaarf_DefaultSkin",
    heroLabel: "Skaarf",
    role: "projectile",
    actionKeys: ["attack"],
    resourcePath: "Effects/Hero010/Hero010_Fireball/Hero010_Fireball.pfx",
    boneToken: "",
  },
];

const nativeItems = [
  {
    heroNames: ["Adagio"],
    actionKeys: ["attack"],
    projectileIdHex: "0x0",
    emitterLabel: "DefaultAttack_Projectile",
    sourceKind: "native-projectile-spawn",
  },
  {
    heroNames: ["Gwen"],
    actionKeys: ["ability03"],
    projectileIdHex: "0x1c",
    emitterLabel: "",
    emitterExpr: "&DAT_01e239e7",
    sourceKind: "native-projectile-spawn",
  },
  {
    heroNames: ["Gwen"],
    actionKeys: ["attack"],
    projectileIdHex: "0x1b",
    emitterLabel: "MissingSlotEmitter",
    sourceKind: "native-projectile-spawn",
  },
  {
    heroNames: ["Skaarf"],
    actionKeys: ["attack"],
    projectileIdHex: "0x69",
    emitterLabel: "Mouth",
    nearbyBoneTokens: ["Bone_Jaw"],
    sourceKind: "native-projectile-spawn",
  },
];

test("runtime projectile binding coverage classifies each missing bridge separately", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    projectileItems,
    nativeItems,
    runtimeItems,
    effectHookItems: [
      {
        effectToken: "Effect_Ringo_AA",
        actionKeys: ["attack"],
        bindKind: "effect-only",
        hookPattern: "native-effect-spawn",
        sourceKind: "native-effect-spawn",
        resourcePaths: ["Effects/Ringo/Ringo_AA/Ringo_AA.pfx"],
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.modelLabel, row.resourcePath, row.bindingStatus, row.bindingBoneToken, row.nativeEmitterLabel]),
    [
      [
        "Adagio_DefaultSkin",
        "Effects/Adagio/Adagio_Heal_Projectile.assetbundle/Adagio_Heal_Projectile.pfx",
        "definition-bone",
        "Bone_LeftHand",
        "",
      ],
      [
        "Adagio_DefaultSkin",
        "Effects/Adagio/AdagioProjectileGround.assetbundle/AdagioProjectileGround.pfx",
        "native-emitter-slot",
        "Bone_RightHand",
        "DefaultAttack_Projectile",
      ],
      [
        "Gwen_DefaultSkin",
        "Effects/Gwen/Gwen_AA/Gwen_AA.pfx",
        "native-emitter-unresolved-slot",
        "",
        "MissingSlotEmitter",
      ],
      [
        "Gwen_DefaultSkin",
        "Effects/Gwen/Gwen_C_Projectile/Gwen_C_Projectile.pfx",
        "native-row-without-emitter",
        "",
        "",
      ],
      ["Ringo_DefaultSkin", "Effects/Ringo/Ringo_AA/Ringo_AA.pfx", "native-effect-hook", "", ""],
      [
        "Skaarf_DefaultSkin",
        "Effects/Hero010/Hero010_Fireball/Hero010_Fireball.pfx",
        "native-nearby-bone",
        "Bone_Jaw",
        "Mouth",
      ],
    ],
  );

  const summary = summarizeRuntimeProjectileBindingCoverageRows(rows);
  assert.equal(summary.rows, 6);
  assert.equal(summary.boundRows, 4);
  assert.equal(summary.unboundRows, 2);
  assert.equal(summary.byStatus["native-emitter-slot"], 1);
  assert.equal(summary.byStatus["native-nearby-bone"], 1);
  assert.equal(summary.byStatus["native-effect-hook"], 1);
  assert.equal(summary.byStatus["native-row-without-emitter"], 1);
  assert.equal(summary.byStatus["native-emitter-unresolved-slot"], 1);
});

test("runtime projectile binding coverage resolves native emitter labels through CFF0 locator transforms", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Malene/Art/malene.glb",
        character: "Malene",
        modelLabel: "Malene_DefaultSkin",
        sourceRelativePath: "Characters/Malene/Malene.def",
        slots: [],
      },
    ],
    projectileItems: [
      {
        modelLabel: "Malene_DefaultSkin",
        heroLabel: "Malene",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Hero022/Hero022_Proj_Emp_Light/Hero022_Proj_Emp_Light.pfx",
      },
    ],
    nativeItems: [
      {
        heroNames: ["Malene"],
        actionKeys: ["attack"],
        projectileIdHex: "0x38",
        emitterLabel: "AA",
        emitterHash: "2BD51FF7",
        projectileMode: 1,
        projectileLateralOffset: -25,
        projectileCallback38: "FUN_00example",
        sourceKind: "native-projectile-spawn",
      },
    ],
    runtimeLocatorItems: [
      {
        relativePath: "Characters/Malene/Malene.def",
        modelLabel: "Malene_DefaultSkin",
        label: "AA",
        fieldOffset: "18736",
        positionX: "0",
        positionY: "125",
        positionZ: "20",
        rotationX: "0",
        rotationY: "0",
        rotationZ: "1",
        scaleX: "1",
        scaleY: "1",
        scaleZ: "15.25",
        transformEvidence: "field-scan",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.bindingStatus,
      row.nativeEmitterLabel,
      row.runtimeLocatorLabel,
      row.runtimeLocatorPosition,
      row.runtimeLocatorRotation,
      row.runtimeLocatorScale,
      row.runtimeLocatorTransformEvidence,
      row.nativeProjectileModes,
      row.nativeProjectileLateralOffsets,
      row.nativeProjectileCallback38s,
      row.runtimeLocatorFieldOffset,
    ]),
    [
      [
        "native-runtime-locator-transform",
        "AA",
        "AA",
        "0,125,20",
        "0,0,1",
        "1,1,15.25",
        "field-scan",
        "1",
        "-25",
        "FUN_00example",
        "18736",
      ],
    ],
  );
});

test("runtime projectile binding coverage joins native timeline projectile timing by projectile id", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Gwen/Art/gwen.glb",
        character: "Gwen",
        modelLabel: "Gwen_DefaultSkin",
        sourceRelativePath: "Characters/Gwen/Gwen.def",
        slots: [
          {
            slotName: "Bone_Weapon",
            resolvedBoneIndex: 12,
            definitionLabels: "AA_Empowered",
          },
        ],
      },
    ],
    projectileItems: [
      {
        modelLabel: "Gwen_DefaultSkin",
        heroLabel: "Gwen",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Gwen/Gwen_AA/Gwen_AA.pfx",
        pairedImpactResourcePaths: ["Effects/Gwen/Gwen_AA_Impact/Gwen_AA_Impact.pfx"],
      },
    ],
    nativeItems: [
      {
        heroNames: ["Gwen"],
        actionKeys: ["attack"],
        projectileIdHex: "0x1b",
        emitterLabel: "AA_Empowered",
        sourceKind: "native-projectile-spawn",
      },
    ],
    timelineItems: [
      {
        heroNames: ["Gwen"],
        actionKeys: ["attack"],
        eventKind: "projectile",
        projectileIdHex: "0x1b",
        timeSeconds: 0.32,
        sourceKind: "native-runtime-projectile",
      },
      {
        heroNames: ["Gwen"],
        actionKeys: ["attack"],
        eventKind: "projectile",
        projectileIdHex: "0x1c",
        timeSeconds: 0.9,
        sourceKind: "native-runtime-projectile",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.bindingStatus,
      row.nativeProjectileId,
      row.nativeTimelineEventCount,
      row.nativeTimelineTimes,
      row.runtimeStartSeconds,
      row.pairedImpactResourcePaths,
    ]),
    [["native-emitter-slot", "0x1b", 1, "0.32", "0.32", "Effects/Gwen/Gwen_AA_Impact/Gwen_AA_Impact.pfx"]],
  );
});

test("runtime projectile binding coverage treats unreferenced Hero000 KindredEffects projectiles as effect library diagnostics", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    timelineItems: [],
    effectHookItems: [],
    projectileItems: [
      {
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "Hero000_DefaultSkin",
        heroLabel: "Hero000",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Hero000/Hero000_Beam_1_E/Hero000_Beam_1_E.pfx",
        effectTokens: ["Effect_Hero000_Beam_1_E"],
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.sourceDefinitionPath, row.nativeRowCount, row.nativeEffectHookCount]),
    [["effect-library-only", "Effects/KindredEffects.def", 0, 0]],
  );

  const summary = summarizeRuntimeProjectileBindingCoverageRows(rows);
  assert.equal(summary.boundRows, 0);
  assert.equal(summary.unboundRows, 0);
  assert.equal(summary.nonRuntimeRows, 1);
});

test("runtime projectile binding coverage treats unreferenced non-hero KindredEffects projectiles as effect library diagnostics", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    timelineItems: [],
    effectHookItems: [],
    projectileItems: [
      {
        sourceDefinitionPath: "Effects/KindredEffects.def",
        modelLabel: "minions",
        heroLabel: "minions",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Minions/Mines/GMine_Proj.assetbundle/GMine_Proj.pfx",
        effectTokens: ["Effect_GMine_Proj", "Effect_Minions_GMine_Proj"],
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.sourceDefinitionPath, row.nativeRowCount, row.nativeEffectHookCount]),
    [["effect-library-only", "Effects/KindredEffects.def", 0, 0]],
  );

  const summary = summarizeRuntimeProjectileBindingCoverageRows(rows);
  assert.equal(summary.boundRows, 0);
  assert.equal(summary.unboundRows, 0);
  assert.equal(summary.nonRuntimeRows, 1);
});

test("runtime projectile binding coverage binds native emitter labels to matching semantic slots", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero054/Art/hero054.glb",
        character: "Hero054",
        modelLabel: "Anka_DefaultSkin",
        sourceRelativePath: "Characters/Hero054/Anka.def",
        slots: [
          {
            slotName: "Bone_RightHand",
            resolvedBoneIndex: 22,
            definitionLabels: "",
          },
          {
            slotName: "Bone_CenterMass",
            resolvedBoneIndex: 3,
            definitionLabels: "",
          },
        ],
      },
    ],
    projectileItems: [
      {
        modelLabel: "Anka_DefaultSkin",
        heroLabel: "Anka",
        role: "projectile",
        actionKeys: ["ability01"],
        resourcePath: "Effects/Hero054/Hero054_A_Proj/Hero054_A_Proj.pfx",
        boneToken: "",
      },
    ],
    nativeItems: [
      {
        heroNames: ["Anka"],
        actionKeys: ["ability01"],
        projectileIdHex: "0xae",
        emitterLabel: "CenterBody",
        sourceKind: "native-projectile-spawn",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.bindingBoneToken, row.bindingBoneIndex, row.nativeEmitterLabel]),
    [["native-emitter-semantic-slot", "Bone_CenterMass", 3, "CenterBody"]],
  );
  assert.equal(summarizeRuntimeProjectileBindingCoverageRows(rows).boundRows, 1);
});

test("runtime projectile binding coverage uses exact effect hook tokens when resource paths are unresolved", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    projectileItems: [
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        role: "projectile",
        actionKeys: ["ability01"],
        resourcePath: "Effects/Hero055/Hero055_A_Projectile/Hero055_A_Projectile.pfx",
        effectTokens: ["Effect_Hero055_A_Projectile", "Effect_Hero055_A", "Effect_Silvernail_A_Projectile", "Effect_Silvernail_A"],
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Silvernail_A",
        actionKeys: ["ability01"],
        bindKind: "effect-only",
        hookPattern: "native-effect-vcall",
        sourceKind: "native-effect-vcall",
        resourcePaths: [],
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.nativeEffectHookCount, row.nativeEffectHookTokens, row.nativeEffectHookActionKeys]),
    [["native-effect-hook", 1, "Effect_Silvernail_A", "ability01"]],
  );
});

test("runtime projectile binding coverage promotes native selector projectile hooks missing KindredEffects definitions", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero048/Art/hero048_valkyrie.glb",
        character: "Hero048",
        modelLabel: "Kinetic_Skin_Valkyrie",
        sourceRelativePath: "Characters/Hero048/Kinetic.def",
        slots: [],
      },
    ],
    projectileItems: [],
    nativeItems: [
      {
        heroNames: ["Kinetic"],
        actionKeys: ["ability01", "ability02"],
        projectileIdHex: "0x92",
        emitterLabel: "Aemit",
        sourceKind: "native-projectile-spawn",
      },
      {
        heroNames: ["Kinetic"],
        actionKeys: ["ability01", "ability02"],
        projectileIdHex: "0x91",
        emitterLabel: "Aemit",
        sourceKind: "native-projectile-spawn",
      },
    ],
    timelineItems: [
      {
        heroNames: ["Kinetic"],
        actionKeys: ["ability01", "ability02"],
        eventKind: "projectile",
        projectileIdHex: "0x92",
        emitterLabel: "Aemit",
        timeSeconds: 0.2,
        sourceKind: "native-runtime-projectile",
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Kinetic_A2",
        selectorOutputRole: "projectile",
        actionKeys: ["ability01"],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        heroNames: ["Kinetic"],
        heroCodes: ["Hero048"],
        resourcePaths: ["Effects/Hero048/S2/Hero048_S2_A2/Hero048_S2_A2.pfx"],
        resourceVariants: [
          {
            resourcePath: "Effects/Hero048/S2/Hero048_S2_A2/Hero048_S2_A2.pfx",
            modelLabel: "Kinetic_Skin_Valkyrie",
            skinKind: "skin",
            heroLabel: "Kinetic",
          },
        ],
      },
    ],
    runtimeLocatorItems: [
      {
        relativePath: "Characters/Hero048/Kinetic.def",
        modelLabel: "Kinetic_DefaultSkin",
        label: "Aemit",
        fieldOffset: "9748",
        positionX: "0",
        positionY: "110",
        positionZ: "100",
        rotationX: "0",
        rotationY: "0",
        rotationZ: "0",
        scaleX: "1",
        scaleY: "1",
        scaleZ: "1",
        transformEvidence: "ptch-object-transform-40",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.modelLabel,
      row.resourcePath,
      row.bindingStatus,
      row.nativeEmitterLabel,
      row.nativeProjectileId,
      row.runtimeLocatorLabel,
      row.runtimeLocatorPosition,
      row.nativeTimelineTimes,
      row.nativeEffectHookTokens,
      row.nativeEffectHookMatchKinds,
    ]),
    [
      [
        "Kinetic_Skin_Valkyrie",
        "Effects/Hero048/S2/Hero048_S2_A2/Hero048_S2_A2.pfx",
        "native-runtime-locator-transform",
        "Aemit",
        "0x92",
        "Aemit",
        "0,110,100",
        "0.2",
        "Effect_Kinetic_A2",
        "resource-exact",
      ],
    ],
  );
});

test("runtime projectile binding coverage promotes selector projectile hooks without resource variants onto the default hero model", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Ringo/Art/ringo.glb",
        character: "Ringo",
        modelLabel: "Ringo_DefaultSkin",
        sourceRelativePath: "Characters/Ringo/Ringo.def",
        slots: [],
      },
    ],
    projectileItems: [],
    nativeItems: [
      {
        heroNames: ["Ringo"],
        actionNames: ["AchillesCut"],
        actionKeys: ["ability01"],
        projectileIdHex: "0x5d",
        emitterLabel: "Projectile_RightHandThrow",
        sourceKind: "native-projectile-spawn",
      },
    ],
    timelineItems: [
      {
        heroNames: ["Ringo"],
        actionNames: ["AchillesCut"],
        actionKeys: ["ability01"],
        eventKind: "projectile",
        projectileIdHex: "0x5d",
        emitterLabel: "Projectile_RightHandThrow",
        timeSeconds: 0.2,
        sourceKind: "native-runtime-projectile",
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Ringo_Ability01_Shot",
        selectorOutputRole: "projectile",
        actionKeys: ["ability01"],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        heroNames: ["Ringo"],
        resourcePaths: ["Effects/Ringo/ability01/RingoAbility01Shot.assetbundle/RingoAbility01Shot.pfx"],
        resourceVariants: [],
      },
    ],
    runtimeLocatorItems: [
      {
        relativePath: "Characters/Ringo/Ringo.def",
        modelLabel: "Ringo_DefaultSkin",
        label: "Projectile_RightHandThrow",
        fieldOffset: "9964",
        positionX: "18.5",
        positionY: "64.2",
        positionZ: "117.9",
        rotationX: "0",
        rotationY: "0",
        rotationZ: "0",
        scaleX: "1",
        scaleY: "1",
        scaleZ: "1",
        transformEvidence: "ptch-object-transform-40",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.modelLabel,
      row.actionKeys,
      row.resourcePath,
      row.bindingStatus,
      row.nativeEmitterLabel,
      row.nativeProjectileId,
      row.runtimeLocatorLabel,
      row.runtimeLocatorPosition,
      row.nativeTimelineTimes,
      row.nativeEffectHookTokens,
      row.nativeEffectHookMatchKinds,
    ]),
    [
      [
        "Ringo_DefaultSkin",
        "ability01",
        "Effects/Ringo/ability01/RingoAbility01Shot.assetbundle/RingoAbility01Shot.pfx",
        "native-runtime-locator-transform",
        "Projectile_RightHandThrow",
        "0x5d",
        "Projectile_RightHandThrow",
        "18.5,64.2,117.9",
        "0.2",
        "Effect_Ringo_Ability01_Shot",
        "resource-exact",
      ],
    ],
  );
});

test("runtime projectile binding coverage does not promote generic library selector hooks without model variants", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero034/Art/hero034.glb",
        character: "Hero057",
        modelLabel: "Hero034_DefaultSkin",
        sourceRelativePath: "Characters/Hero034/Hero034.def",
        slots: [],
      },
    ],
    projectileItems: [],
    nativeItems: [],
    timelineItems: [],
    effectHookItems: [
      {
        effectToken: "Effect_Hero057_A",
        selectorOutputRole: "projectile",
        actionKeys: ["ability01"],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        heroNames: ["Hero057"],
        resourcePaths: ["Effects/Hero000/Hero000_Buff_A/Hero000_Buff_A.pfx"],
        resourceVariants: [],
      },
    ],
  });

  assert.equal(rows.length, 0);
});

test("runtime projectile binding coverage promotes native projectile effect-token contexts", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero048/Art/hero048_valkyrie.glb",
        character: "Hero048",
        modelLabel: "Kinetic_Skin_Valkyrie",
        sourceRelativePath: "Characters/Hero048/Kinetic.def",
        slots: [],
      },
    ],
    projectileItems: [],
    nativeItems: [
      {
        heroNames: ["Kinetic"],
        actionNames: ["Ability03"],
        actionKeys: ["ability03", "attack"],
        projectileIdHex: "0x93",
        emitterLabel: "CenterBody",
        effectTokens: ["Effect_Kinetic_C_Charging"],
        sourceKind: "native-projectile-spawn",
      },
    ],
    timelineItems: [
      {
        heroNames: ["Kinetic"],
        actionNames: ["Ability03"],
        actionKeys: ["ability03", "attack"],
        eventKind: "projectile",
        projectileIdHex: "0x93",
        emitterLabel: "CenterBody",
        timeSeconds: 0,
        sourceKind: "native-runtime-projectile",
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Kinetic_C_Charging",
        actionKeys: ["ability03", "attack"],
        bindKind: "effect-only",
        hookPattern: "native-effect-vcall",
        sourceKind: "native-effect-vcall",
        heroNames: ["Kinetic"],
        heroCodes: ["Hero048"],
        resourcePaths: ["Effects/Hero048/S2/Hero048_S2_C_Charging/Hero048_S2_C_Charging.pfx"],
        resourceVariants: [
          {
            resourcePath: "Effects/Hero048/S2/Hero048_S2_C_Charging/Hero048_S2_C_Charging.pfx",
            modelLabel: "Kinetic_Skin_Valkyrie",
            skinKind: "skin",
            heroLabel: "Kinetic",
          },
        ],
      },
    ],
    runtimeLocatorItems: [
      {
        relativePath: "Characters/Hero048/Kinetic.def",
        modelLabel: "Kinetic_DefaultSkin",
        label: "CenterBody",
        fieldOffset: "9736",
        positionX: "0",
        positionY: "75",
        positionZ: "0",
        rotationX: "0",
        rotationY: "0",
        rotationZ: "0",
        scaleX: "1",
        scaleY: "1",
        scaleZ: "1",
        transformEvidence: "ptch-object-transform-40",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.modelLabel,
      row.actionKeys,
      row.resourcePath,
      row.bindingStatus,
      row.nativeEmitterLabel,
      row.nativeProjectileId,
      row.runtimeLocatorLabel,
      row.runtimeLocatorPosition,
      row.nativeTimelineTimes,
      row.nativeEffectHookTokens,
      row.nativeEffectHookMatchKinds,
    ]),
    [
      [
        "Kinetic_Skin_Valkyrie",
        "ability03",
        "Effects/Hero048/S2/Hero048_S2_C_Charging/Hero048_S2_C_Charging.pfx",
        "native-runtime-locator-transform",
        "CenterBody",
        "0x93",
        "CenterBody",
        "0,75,0",
        "0",
        "Effect_Kinetic_C_Charging",
        "resource-exact",
      ],
    ],
  );
});

test("runtime projectile binding coverage follows CFF0 skin effect aliases back to base native hooks", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    projectileItems: [
      {
        modelLabel: "Kestrel_Skin_Drow",
        heroLabel: "Kestrel",
        role: "projectile",
        actionKeys: ["ability03"],
        resourcePath: "Effects/Hero023/S3/Hero023_S3_C_Shot_Burst/Hero023_S3_C_Shot_Burst.pfx",
        effectTokens: ["Effect_Hero023_S3_C_Shot_Burst", "Effect_Kestrel_S3_C_Shot_Burst"],
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Kestrel_C_Shot_Burst",
        actionKeys: ["ability03"],
        bindKind: "effect-only",
        hookPattern: "native-effect-spawn",
        sourceKind: "native-effect-spawn",
        resourcePaths: ["Effects/Hero023/Hero023_C_Shot_Burst.assetbundle/Hero023_C_Shot_Burst.pfx"],
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Kestrel_Skin_Drow",
        sourceEffectToken: "Effect_Kestrel_C_Shot_Burst",
        skinEffectToken: "Effect_Kestrel_S3_C_Shot_Burst",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.nativeEffectHookTokens, row.nativeEffectHookSkinAliases]),
    [["native-effect-hook", "Effect_Kestrel_C_Shot_Burst", "Effect_Kestrel_C_Shot_Burst->Effect_Kestrel_S3_C_Shot_Burst"]],
  );
});

test("runtime projectile binding coverage normalizes CFF0 skin marker placement before matching hooks", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    projectileItems: [
      {
        modelLabel: "Joule_Skin_Snow",
        heroLabel: "Joule",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Joule/S2/Joule_S2_Beam_Secondary/Joule_S2_Beam_Secondary.pfx",
        effectTokens: ["Effect_Joule_S2_Beam_Secondary"],
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Joule_Beam_Secondary",
        actionKeys: ["ability03"],
        bindKind: "effect-only",
        hookPattern: "native-effect-spawn",
        sourceKind: "native-effect-spawn",
        resourcePaths: ["Effects/Joule/Joule_Beam_Secondary.assetbundle/Joule_Beam_Secondary.pfx"],
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Joule_Skin_Snow",
        sourceEffectToken: "Effect_Joule_Beam_Secondary",
        skinEffectToken: "Effect_S2_Joule_Beam_Secondary",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.bindingStatus,
      row.nativeEffectHookTokens,
      row.nativeEffectHookSkinAliases,
      row.nativeEffectHookMatchKinds,
    ]),
    [
      [
        "native-effect-hook",
        "Effect_Joule_Beam_Secondary",
        "Effect_Joule_Beam_Secondary->Effect_S2_Joule_Beam_Secondary",
        "skin-effect-alias",
      ],
    ],
  );
});

test("runtime projectile binding coverage uses native semantic effect aliases for projectile naming variants", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    projectileItems: [
      {
        modelLabel: "Baron_DefaultSkin",
        heroLabel: "Baron",
        role: "projectile",
        actionKeys: ["ability01"],
        resourcePath: "Effects/Hero019/Hero019_A_Projectile/Hero019_A_Projectile.pfx",
        effectTokens: ["Effect_Baron_A_Projectile", "Effect_Hero019_A_Projectile"],
      },
      {
        modelLabel: "Baron_DefaultSkin",
        heroLabel: "Baron",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Hero019/Hero019_AA_Projectile/Hero019_AA_Projectile.pfx",
        effectTokens: ["Effect_Baron_AA_Projectile", "Effect_Hero019_AA_Projectile"],
      },
      {
        modelLabel: "Taka_DefaultSkin",
        heroLabel: "Taka",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Sayoc/Sayoc_SmokeBomb_Proj.assetbundle/Sayoc_SmokeBomb_Proj.pfx",
        effectTokens: ["Effect_Sayoc_SmokeBomb_Proj", "Effect_Sayoc_SmokeBomb"],
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Baron_A_Shot",
        actionKeys: ["ability01"],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        resourcePaths: [],
      },
      {
        effectToken: "Effect_Baron_DefaultAttack",
        actionKeys: ["attack"],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        resourcePaths: [],
      },
      {
        effectToken: "Effect_Taka_SmokeBomb",
        actionKeys: ["ability02"],
        bindKind: "effect-only",
        hookPattern: "native-effect-vcall",
        sourceKind: "native-effect-vcall",
        resourcePaths: ["Effects/Sayoc/Sayoc_SmokeBomb.assetbundle/Sayoc_SmokeBomb.pfx"],
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.modelLabel, row.bindingStatus, row.nativeEffectHookTokens, row.nativeEffectHookMatchKinds]),
    [
      ["Baron_DefaultSkin", "native-effect-hook", "Effect_Baron_A_Shot", "semantic-effect-token"],
      ["Baron_DefaultSkin", "native-effect-hook", "Effect_Baron_DefaultAttack", "semantic-effect-token"],
      ["Taka_DefaultSkin", "native-effect-hook", "Effect_Taka_SmokeBomb", "resource-basename-alias"],
    ],
  );
});

test("runtime projectile binding coverage joins ability-name stems to native selector projectiles", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [],
    nativeItems: [],
    projectileItems: [
      {
        modelLabel: "Catherine_DefaultSkin",
        heroLabel: "Catherine",
        role: "projectile",
        actionKeys: ["ability02"],
        resourcePath: "Effects/Catherine/Catherine_B_Proj/Catherine_B_Proj.pfx",
        effectTokens: ["Effect_Catherine_B_Proj", "Effect_Catherine_B"],
      },
      {
        modelLabel: "Catherine_Skin_Ice",
        heroLabel: "Catherine",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/Catherine/ICE/Catherine__ICE__Shield_Proj.assetbundle/Catherine__ICE__Shield_Proj.pfx",
        effectTokens: ["Effect_Catherine__ICE__Shield_Proj", "Effect_Catherine__ICE__Shield"],
      },
    ],
    effectHookItems: [
      {
        effectToken: "Effect_Catherine_ArcaneShield_Buff",
        actionKeys: ["ability02"],
        bindKind: "effect-only",
        hookPattern: "native-effect-vcall",
        sourceKind: "native-effect-vcall",
        resourcePaths: [],
      },
      {
        effectToken: "Effect_Catherine_ArcaneShield_ReflectShot",
        actionKeys: [],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        resourcePaths: [],
      },
      {
        effectToken: "Effect_Catherine_ArcaneShield_ReflectShot_Impact",
        actionKeys: [],
        bindKind: "effect-only",
        hookPattern: "native-effect-selector",
        sourceKind: "native-effect-selector",
        resourcePaths: [],
      },
    ],
    skinEffectAliasItems: [
      {
        modelLabel: "Catherine_Skin_Ice",
        sourceEffectToken: "Effect_Catherine_ArcaneShield_ReflectShot",
        skinEffectToken: "Effect_Catherine__ICE__ArcaneShield_ReflectShot",
      },
    ],
    abilityStemItems: [
      {
        relativePath: "Characters/Catherine/Catherine.def",
        targetLabels:
          "0:HERO_ABILITY_CATHERINE_ARCANE_SHIELD_NAME|8:Ability__Catherine__B|24:LABEL_ABILITY_TYPE_BUFF_SELF|32:HERO_ABILITY_CATHERINE_ARCANE_SHIELD_DESC|40:HERO_ABILITY_CATHERINE_B_SHORT_DESC",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.modelLabel,
      row.bindingStatus,
      row.nativeEffectHookTokens,
      row.nativeEffectHookSkinAliases,
      row.nativeEffectHookMatchKinds,
    ]),
    [
      [
        "Catherine_DefaultSkin",
        "native-effect-hook",
        "Effect_Catherine_ArcaneShield_ReflectShot",
        "",
        "ability-stem-effect-token",
      ],
      [
        "Catherine_Skin_Ice",
        "native-effect-hook",
        "Effect_Catherine_ArcaneShield_ReflectShot",
        "Effect_Catherine_ArcaneShield_ReflectShot->Effect_Catherine__ICE__ArcaneShield_ReflectShot",
        "ability-stem-skin-effect-alias",
      ],
    ],
  );
});

test("runtime projectile binding coverage marks native emitters found in definition locator groups", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero055/Art/hero055.glb",
        character: "Hero055",
        modelLabel: "Silvernail_DefaultSkin",
        sourceRelativePath: "Characters/Hero055/Silvernail.def",
        slots: [
          {
            slotName: "Bone_RightHand",
            resolvedBoneIndex: 22,
            definitionLabels: "Projectile_C",
            definitionLocatorLabels: "BasicAttack_RightHand|Projectile|Projectile_B|Projectile_C",
          },
          {
            slotName: "Bone_LeftHand",
            resolvedBoneIndex: 10,
            definitionLabels: "Projectile_C",
            definitionLocatorLabels: "BasicAttack_RightHand|Projectile|Projectile_B|Projectile_C",
          },
        ],
      },
    ],
    projectileItems: [
      {
        modelLabel: "Silvernail_DefaultSkin",
        heroLabel: "Silvernail",
        role: "projectile",
        actionKeys: ["ability02"],
        resourcePath: "Effects/Hero055/Hero055_B_projectile/Hero055_B_projectile.pfx",
        effectTokens: ["Effect_Silvernail_B_projectile", "Effect_Silvernail_B"],
      },
    ],
    nativeItems: [
      {
        heroNames: ["Silvernail"],
        actionKeys: ["ability02"],
        projectileIdHex: "0xb2",
        emitterLabel: "Projectile_B",
        sourceKind: "native-projectile-spawn",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.bindingStatus, row.bindingBoneToken, row.nativeEmitterLabel]),
    [["native-definition-logical-locator", "", "Projectile_B"]],
  );
});

test("runtime projectile binding coverage resolves base skin labels from tiered runtime items", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/SAW/Art/saw_cyber_t1.glb",
        character: "SAW",
        modelLabel: "SAW_Skin_SAWborg_T1",
        sourceRelativePath: "Characters/SAW/SAW.def",
        slots: [
          {
            slotName: "Bone_Barrel",
            resolvedBoneIndex: 45,
            definitionLabels: "GunMuzzleTip_Ability02_CritAttack",
            definitionLocatorLabels: "GunMuzzleTip_Attack|GunMuzzleTip_CritAttack|GunMuzzleTip_Ability02_CritAttack",
          },
        ],
      },
    ],
    projectileItems: [
      {
        modelLabel: "SAW_Skin_SAWborg",
        heroLabel: "SAW",
        role: "projectile",
        actionKeys: ["attack"],
        resourcePath: "Effects/SAW/S1/SAW_S1_Projectile.assetbundle/SAW_S1_Projectile.pfx",
        effectTokens: ["Effect_SAW_S1_Projectile", "Effect_SAW_S1"],
      },
    ],
    nativeItems: [
      {
        heroNames: ["SAW"],
        actionKeys: ["attack"],
        projectileIdHex: "0x67",
        emitterLabel: "GunMuzzleTip_Attack",
        sourceKind: "native-projectile-spawn",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.runtimeRel, row.bindingStatus, row.bindingBoneToken, row.nativeEmitterLabel]),
    [["Characters/SAW/Art/saw_cyber_t1.glb", "native-definition-logical-locator", "", "GunMuzzleTip_Attack"]],
  );
});

test("runtime projectile binding coverage prefers primary runtime items over same-label prop items", () => {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: [
      {
        rel: "Characters/Hero044/Art/hero044_clam.glb",
        character: "Hero044",
        modelLabel: "Lorelai_DefaultSkin",
        sourceRelativePath: "Characters/Hero044/Lorelai_FishFood.def",
        slots: [],
      },
      {
        rel: "Characters/Hero044/Art/hero044.glb",
        character: "Hero044",
        modelLabel: "Lorelai_DefaultSkin",
        sourceRelativePath: "Characters/Hero044/Lorelai.def",
        slots: [
          {
            slotName: "Bone_CenterMass",
            resolvedBoneIndex: 3,
            definitionLabels: "",
          },
        ],
      },
    ],
    projectileItems: [
      {
        modelLabel: "Lorelai_DefaultSkin",
        heroLabel: "Lorelai",
        role: "projectile",
        actionKeys: ["ability02"],
        resourcePath: "Effects/Hero044/Hero044_B_Proj/Hero044_B_Proj.pfx",
        boneToken: "",
      },
    ],
    nativeItems: [
      {
        heroNames: ["Lorelai"],
        actionKeys: ["ability02"],
        projectileIdHex: "0x82",
        emitterLabel: "CenterBody",
        sourceKind: "native-projectile-spawn",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.runtimeRel, row.runtimeSourceRelativePath, row.bindingStatus, row.bindingBoneToken]),
    [["Characters/Hero044/Art/hero044.glb", "Characters/Hero044/Lorelai.def", "native-emitter-semantic-slot", "Bone_CenterMass"]],
  );
});

test("runtime projectile binding coverage exporter writes TSV and JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-coverage-"));
  const runtimePath = path.join(tempDir, "runtime.json");
  const projectilePath = path.join(tempDir, "projectiles.json");
  const nativePath = path.join(tempDir, "native.json");
  const effectHookPath = path.join(tempDir, "effect-hooks.json");
  const viewerOut = path.join(tempDir, "effect-projectile-runtime-manifest.json");
  const tsvOut = path.join(tempDir, "coverage.tsv");
  const jsonOut = path.join(tempDir, "coverage.json");

  fs.writeFileSync(runtimePath, JSON.stringify({ items: runtimeItems }));
  fs.writeFileSync(projectilePath, JSON.stringify({ items: projectileItems }));
  fs.writeFileSync(nativePath, JSON.stringify({ items: nativeItems }));
  fs.writeFileSync(effectHookPath, JSON.stringify({ items: [] }));

  const summary = exportRuntimeProjectileBindingCoverageReport({
    runtimePath,
    projectilePath,
    nativePath,
    effectHookPath,
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 6);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /native-emitter-slot/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /runtimeLocatorRotation/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /nativeProjectileLateralOffsets/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /native-row-without-emitter/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /native-emitter-slot/);
});
