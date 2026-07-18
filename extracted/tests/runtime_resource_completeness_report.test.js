const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeResourceCompletenessRows,
  exportRuntimeResourceCompletenessReport,
  summarizeRuntimeResourceCompletenessRows,
} = require("../tools/runtime_resource_completeness_report");

const skinCatalog = {
  skins: {
    HeroA_DefaultSkin: {
      id: "HeroA_DefaultSkin",
      fallbackLabel: "HeroA",
      localizationKey: null,
      zhCN: "英雄A",
    },
    HeroA_Skin_Alt: {
      id: "HeroA_Skin_Alt",
      fallbackLabel: "HeroA_Alt",
      localizationKey: "CHAR_THEME_NAME_HEROA_ALT",
      zhCN: "英雄A 备用",
    },
    HeroA_Skin_Chroma: {
      id: "HeroA_Skin_Chroma",
      fallbackLabel: "HeroA_Chroma",
      localizationKey: "CHAR_THEME_NAME_HEROA_CHROMA",
      zhCN: "英雄A 变色",
    },
    HeroA_Skin_Chroma_Blue: {
      id: "HeroA_Skin_Chroma_Blue",
      fallbackLabel: "HeroA_Chroma_Blue",
      localizationKey: "CHAR_THEME_NAME_HEROA_CHROMA_BLUE",
      zhCN: "英雄A 蓝色变体",
    },
    Missing_Skin_Gold: {
      id: "Missing_Skin_Gold",
      fallbackLabel: "Missing_Gold",
      localizationKey: "CHAR_THEME_NAME_MISSING_GOLD",
      zhCN: "缺失 金色",
    },
  },
};

const skinItems = [
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    modelLabel: "HeroA_DefaultSkin",
    sourceRelativePath: "Characters/Hero001/HeroA_Projectile.def",
    meshPath: "Characters/Hero001/Art/hero001.mesh",
    materialCount: 2,
    texturedMaterialCount: 1,
    sameLabelAnimationCount: 0,
    relationshipMatched: true,
  },
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    modelLabel: "HeroA_DefaultSkin",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    meshPath: "Characters/Hero001/Art/hero001.mesh",
    materialCount: 2,
    texturedMaterialCount: 1,
    sameLabelAnimationCount: 0,
    relationshipMatched: true,
  },
  {
    rel: "Characters/Hero001/Art/hero001_alt.glb",
    character: "Hero001",
    modelLabel: "HeroA_Skin_Alt",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    meshPath: "Characters/Hero001/Art/hero001_alt.mesh",
    materialCount: 2,
    texturedMaterialCount: 2,
    sameLabelAnimationCount: 3,
    relationshipMatched: true,
  },
  {
    rel: "Characters/Hero001/Art/hero001_chroma.glb",
    character: "Hero001",
    modelLabel: "HeroA_Skin_Chroma",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    meshPath: "Characters/Hero001/Art/hero001_chroma.mesh",
    materialCount: 2,
    texturedMaterialCount: 2,
    sameLabelAnimationCount: 2,
    relationshipMatched: true,
  },
];

const skinnedItems = [
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    modelLabel: "HeroA_DefaultSkin",
    sourceMeshPath: "Characters/Hero001/Art/hero001.mesh",
    sourceRelativePath: "Characters/Hero001/HeroA_Projectile.def",
    materialCount: 2,
    texturedMaterialCount: 1,
  },
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    modelLabel: "HeroA_DefaultSkin",
    sourceMeshPath: "Characters/Hero001/Art/hero001.mesh",
    materialCount: 2,
    texturedMaterialCount: 1,
  },
  {
    rel: "Characters/Hero001/Art/hero001_chroma.glb",
    character: "Hero001",
    modelLabel: "HeroA_Skin_Chroma",
    sourceMeshPath: "Characters/Hero001/Art/hero001_chroma.mesh",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    materialCount: 2,
    texturedMaterialCount: 2,
  },
];

const allPbrItems = [
  ...skinItems,
  {
    rel: "Characters/Hero001/ArtTrap/hero001Trap.glb",
    character: "Hero001",
    variant: "hero001Trap",
    sourceMeshPath: "Characters/Hero001/ArtTrap/hero001Trap.mesh",
    materialCount: 1,
    texturedMaterialCount: 0,
  },
];

const runtimeGraphItems = [
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    modelLabel: "HeroA_DefaultSkin",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    bindSlots: [
      { slotName: "Bone_Weapon", hashResolved: true, resolvedBoneIndex: 12 },
      { slotName: "Bone_Aura", bindToken: "aura_bnd", hashResolved: false },
    ],
  },
  {
    rel: "Characters/Hero001/Art/hero001_chroma.glb",
    character: "Hero001",
    modelLabel: "HeroA_Skin_Chroma",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    bindSlots: [{ slotName: "Bone_Weapon", hashResolved: true }],
  },
];

const animationBindingItems = [
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    modelLabel: "HeroA_DefaultSkin",
    sourceRelativePath: "Characters/Hero001/HeroA_Projectile.def",
    animations: [],
  },
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    modelLabel: "HeroA_DefaultSkin",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    animations: [{ actionKey: "idle", targetRelativePath: "Characters/Hero001/Art/hero001.idle.anim", trackMatchesSkeleton: true }],
  },
  {
    rel: "Characters/Hero001/Art/hero001_chroma.glb",
    modelLabel: "HeroA_Skin_Chroma",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    animations: [{ actionKey: "idle", targetRelativePath: "Characters/Hero001/Art/hero001.chroma_idle.anim", trackMatchesSkeleton: true }],
  },
];

const skinVariantAliasItems = [
  {
    skinId: "HeroA_Skin_Chroma_Blue",
    baseModelLabel: "HeroA_Skin_Chroma",
    rel: "Characters/Hero001/Art/hero001_chroma.glb",
    sourceRelativePath: "Characters/Hero001/HeroA.def",
    materialCount: 2,
    texturedMaterialCount: 2,
    evidence: "skin-effect-alias-prefix-shared-glb",
  },
];

const pfxItems = [
  {
    relativePath: "Effects/Hero001/HeroA_A/HeroA_A.pfx",
    uniqueShadergraphRefCount: 2,
    references: [
      {
        kind: "shadergraph",
        relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[0].shadergraph",
      },
      {
        kind: "shadergraph",
        relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[1].shadergraph",
      },
    ],
  },
];

const shadergraphItems = [
  {
    relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[0].shadergraph",
    materialStatus: "classified",
    textureHashes: ["AAA"],
  },
  {
    relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[1].shadergraph",
    materialStatus: "unclassified",
    textureHashes: [],
  },
];

const timelineItems = [
  {
    heroNames: ["HeroA"],
    eventKind: "effect",
    effectToken: "Effect_HeroA_A",
  },
];

const effectHookItems = [
  {
    id: "hook-hero-a",
    effectToken: "Effect_HeroA_Hook",
    resourcePaths: ["Effects/HeroCodeOnly/HeroA_Hook/HeroA_Hook.pfx"],
  },
];

const runtimeObjectGraphItems = [
  {
    rel: "Characters/Hero001/ArtTrap/hero001Trap.glb",
    character: "Hero001",
    variant: "hero001Trap",
    objectKind: "trap",
    sourceRelativePath: "Characters/Hero001/HeroA_Trap.def",
    runtimeBlockIndex: 0,
    ownerLabels: ["HeroA_DefaultSkin"],
    skeletonPaths: ["Characters/Hero001/ArtTrap/hero001Trap.skeleton"],
    animationPaths: ["Characters/Hero001/ArtTrap/hero001Trap.idle.anim"],
    effectPaths: [],
  },
];

const runtimeBindingConfigItems = [
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    modelLabel: "HeroA_DefaultSkin",
    slots: [
      {
        slotName: "Bone_Weapon",
        bindToken: "weapon_bnd",
        bindingKind: "skeleton-bone",
      },
      {
        slotName: "Bone_Aura",
        bindToken: "aura_bnd",
        bindingKind: "effect-or-aura-slot",
      },
    ],
  },
];

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("buildRuntimeResourceCompletenessRows joins skin catalog, model manifests, runtime graph, effects, and timeline evidence", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog,
    skinItems,
    skinnedItems,
    allPbrItems,
    runtimeGraphItems,
    animationBindingItems,
    skinVariantAliasItems,
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems,
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");
  const alt = rows.find((row) => row.skinId === "HeroA_Skin_Alt");
  const chromaBlue = rows.find((row) => row.skinId === "HeroA_Skin_Chroma_Blue");
  const missing = rows.find((row) => row.skinId === "Missing_Skin_Gold");
  const prop = rows.find((row) => row.rel === "Characters/Hero001/ArtTrap/hero001Trap.glb");

  assert.equal(base.sourceKind, "skin-catalog");
  assert.equal(base.sourceRelativePath, "Characters/Hero001/HeroA.def");
  assert.equal(base.inSkinPreviewManifest, "yes");
  assert.equal(base.inSkinnedManifest, "yes");
  assert.equal(base.inRuntimeGraph, "yes");
  assert.equal(base.compatibleAnimationCount, 1);
  assert.equal(base.effectPfxCount, 1);
  assert.equal(base.effectHookPfxCount, 0);
  assert.equal(base.shadergraphCount, 2);
  assert.equal(base.unclassifiedShadergraphCount, 1);
  assert.equal(base.nativeTimelineEventCount, 1);
  assert.match(base.issues, /partial-basecolor-texture/);
  assert.doesNotMatch(base.issues, /no-same-label-animation/);
  assert.match(base.issues, /unresolved-runtime-bind-slot/);
  assert.match(base.issues, /unclassified-effect-shadergraph/);

  assert.equal(alt.inSkinPreviewManifest, "yes");
  assert.equal(alt.inSkinnedManifest, "no");
  assert.equal(alt.inRuntimeGraph, "no");
  assert.match(alt.issues, /missing-skinned-runtime-glb/);
  assert.match(alt.issues, /missing-runtime-graph/);

  assert.equal(chromaBlue.rel, "Characters/Hero001/Art/hero001_chroma.glb");
  assert.equal(chromaBlue.aliasOfModelLabel, "HeroA_Skin_Chroma");
  assert.equal(chromaBlue.inSkinPreviewManifest, "alias");
  assert.equal(chromaBlue.inSkinnedManifest, "alias");
  assert.equal(chromaBlue.inRuntimeGraph, "yes");
  assert.equal(chromaBlue.compatibleAnimationCount, 1);
  assert.doesNotMatch(chromaBlue.issues, /missing-skin-preview-glb/);
  assert.doesNotMatch(chromaBlue.issues, /missing-skinned-runtime-glb/);

  assert.equal(missing.rel, "");
  assert.equal(missing.inSkinPreviewManifest, "no");
  assert.match(missing.issues, /missing-skin-preview-glb/);
  assert.match(missing.issues, /missing-skinned-runtime-glb/);

  assert.equal(prop.sourceKind, "unlinked-character-model");
  assert.equal(prop.assetClass, "runtime-prop-candidate");
  assert.match(prop.issues, /not-linked-to-skin-catalog/);
});

test("summarizeRuntimeResourceCompletenessRows counts known-skin and issue buckets", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog,
    skinItems,
    skinnedItems,
    allPbrItems,
    runtimeGraphItems,
    animationBindingItems,
    skinVariantAliasItems,
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems,
  });
  const summary = summarizeRuntimeResourceCompletenessRows(rows);

  assert.equal(summary.skinCatalogRows, 5);
  assert.equal(summary.missingSkinPreviewGlb, 1);
  assert.equal(summary.missingSkinnedRuntimeGlb, 2);
  assert.equal(summary.missingRuntimeGraphRows, 2);
  assert.equal(summary.textureIssueRows, 2);
  assert.equal(summary.noSameLabelAnimationRows, 1);
  assert.equal(summary.unclassifiedEffectShadergraphRows, 4);
  assert.equal(summary.unlinkedCharacterModels, 1);
});

test("buildRuntimeResourceCompletenessRows counts pfx resources recovered through native effect hooks", () => {
  const bridgeSkinCatalog = {
    skins: {
      BridgeHero_DefaultSkin: {
        id: "BridgeHero_DefaultSkin",
        fallbackLabel: "BridgeHero",
        zhCN: "桥接英雄",
      },
    },
  };
  const bridgeSkinItems = [
    {
      rel: "Characters/BridgeHero/Art/bridgeHero.glb",
      character: "BridgeHero",
      modelLabel: "BridgeHero_DefaultSkin",
      sourceRelativePath: "Characters/BridgeHero/BridgeHero.def",
      materialCount: 1,
      texturedMaterialCount: 1,
      sameLabelAnimationCount: 1,
    },
  ];
  const bridgeRuntimeGraphItems = [
    {
      rel: "Characters/BridgeHero/Art/bridgeHero.glb",
      character: "BridgeHero",
      modelLabel: "BridgeHero_DefaultSkin",
      sourceRelativePath: "Characters/BridgeHero/BridgeHero.def",
      bindSlots: [],
    },
  ];
  const bridgePfxItems = [
    {
      relativePath: "Effects/InternalCode/BridgeBurst/BridgeBurst.pfx",
      references: [
        {
          kind: "shadergraph",
          relativePath: "Effects/InternalCode/BridgeBurst/BridgeBurst.Surface[0].shadergraph",
        },
      ],
    },
  ];
  const bridgeShadergraphItems = [
    {
      relativePath: "Effects/InternalCode/BridgeBurst/BridgeBurst.Surface[0].shadergraph",
      materialStatus: "classified",
      textureHashes: ["BRIDGE"],
    },
  ];
  const bridgeEffectHookItems = [
    {
      id: "native-hook-bridgehero",
      effectToken: "Effect_BridgeHero_Burst",
      resourcePaths: ["Effects/InternalCode/BridgeBurst/BridgeBurst.pfx"],
    },
  ];

  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: bridgeSkinCatalog,
    skinItems: bridgeSkinItems,
    skinnedItems: bridgeSkinItems,
    allPbrItems: bridgeSkinItems,
    runtimeGraphItems: bridgeRuntimeGraphItems,
    animationBindingItems: [],
    skinVariantAliasItems: [],
    pfxItems: bridgePfxItems,
    shadergraphItems: bridgeShadergraphItems,
    timelineItems: [],
    effectHookItems: bridgeEffectHookItems,
  });

  const bridge = rows.find((row) => row.skinId === "BridgeHero_DefaultSkin");

  assert.equal(bridge.effectPfxCount, 1);
  assert.equal(bridge.effectHookCount, 1);
  assert.equal(bridge.effectHookPfxCount, 1);
  assert.equal(bridge.shadergraphCount, 1);
  assert.doesNotMatch(bridge.issues, /no-effect-pfx-for-character/);
});

test("buildRuntimeResourceCompletenessRows does not report Hero999 placeholder skins as missing effects", () => {
  const hero999Catalog = {
    skins: {
      Hero999_DefaultSkin: {
        id: "Hero999_DefaultSkin",
        fallbackLabel: "Hero999",
        zhCN: "Hero999",
      },
      Hero999_Skin_Skin1: {
        id: "Hero999_Skin_Skin1",
        fallbackLabel: "Hero999_Skin1",
        zhCN: "Hero999 Skin1",
      },
    },
  };
  const hero999Items = [
    {
      rel: "Characters/Hero999/Art/hero999.glb",
      character: "Hero999",
      modelLabel: "Hero999_DefaultSkin",
      sourceRelativePath: "Characters/Hero999/Hero999.def",
      materialCount: 1,
      texturedMaterialCount: 1,
      sameLabelAnimationCount: 6,
    },
    {
      rel: "Characters/Hero999/Art/hero999_host_skin1.glb",
      character: "Hero999",
      modelLabel: "Hero999_Skin_Skin1",
      sourceRelativePath: "Characters/Hero999/Hero999.def",
      materialCount: 1,
      texturedMaterialCount: 1,
      sameLabelAnimationCount: 6,
    },
  ];

  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: hero999Catalog,
    skinItems: hero999Items,
    skinnedItems: hero999Items,
    allPbrItems: hero999Items,
    runtimeGraphItems: hero999Items.map((item) => ({
      ...item,
      bindSlots: [],
    })),
    animationBindingItems: hero999Items.map((item) => ({
      rel: item.rel,
      modelLabel: item.modelLabel,
      sourceRelativePath: item.sourceRelativePath,
      animations: [{ actionKey: "idle", targetRelativePath: "Characters/Hero999/Art/hero999.idle.anim", trackMatchesSkeleton: true }],
    })),
    skinVariantAliasItems: [],
    pfxItems: [],
    shadergraphItems: [],
    timelineItems: [],
    effectHookItems: [],
  });

  for (const row of rows) {
    assert.doesNotMatch(row.issues, /no-effect-pfx-for-character/);
    assert.doesNotMatch(row.issues, /no-native-runtime-timeline/);
  }
});

test("buildRuntimeResourceCompletenessRows trusts GLB material coverage over coarse manifest texture counts", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: {
      skins: {
        HeroA_DefaultSkin: skinCatalog.skins.HeroA_DefaultSkin,
      },
    },
    skinItems: [skinItems[1]],
    skinnedItems: [skinnedItems[1]],
    allPbrItems: [skinItems[1]],
    runtimeGraphItems: [runtimeGraphItems[0]],
    animationBindingItems,
    skinVariantAliasItems: [],
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems: [],
    glbMaterialCoverageItems: [
      {
        rel: "Characters/Hero001/Art/hero001.glb",
        coverageClass: "basecolor-textured",
        hasBaseColorTexture: "yes",
        looksPale: "no",
      },
      {
        rel: "Characters/Hero001/Art/hero001.glb",
        coverageClass: "color-only",
        hasBaseColorTexture: "no",
        looksPale: "no",
      },
    ],
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");

  assert.equal(base.glbMaterialCoverageClasses, "basecolor-textured|color-only");
  assert.doesNotMatch(base.issues, /partial-basecolor-texture/);
});

test("buildRuntimeResourceCompletenessRows still reports pale GLB material coverage as a texture issue", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: {
      skins: {
        HeroA_DefaultSkin: skinCatalog.skins.HeroA_DefaultSkin,
      },
    },
    skinItems: [skinItems[1]],
    skinnedItems: [skinnedItems[1]],
    allPbrItems: [skinItems[1]],
    runtimeGraphItems: [runtimeGraphItems[0]],
    animationBindingItems,
    skinVariantAliasItems: [],
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems: [],
    glbMaterialCoverageItems: [
      {
        rel: "Characters/Hero001/Art/hero001.glb",
        coverageClass: "pale-color-only",
        hasBaseColorTexture: "no",
        looksPale: "yes",
      },
    ],
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");

  assert.match(base.issues, /pale-color-only-material/);
});

test("buildRuntimeResourceCompletenessRows does not treat previewable effect materials as shadergraph gaps", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: {
      skins: {
        HeroA_DefaultSkin: skinCatalog.skins.HeroA_DefaultSkin,
      },
    },
    skinItems: [skinItems[1]],
    skinnedItems: [skinnedItems[1]],
    allPbrItems: [skinItems[1]],
    runtimeGraphItems: [runtimeGraphItems[0]],
    runtimeBindingConfigItems,
    animationBindingItems,
    skinVariantAliasItems: [],
    pfxItems,
    shadergraphItems: [
      {
        relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[0].shadergraph",
        materialStatus: "tinted-texture",
        textureHashes: ["TINTED"],
        inlineColors: [{ hex: "#FF8800" }],
        previewBlendMode: "additive",
      },
      {
        relativePath: "Effects/Hero001/HeroA_A/HeroA_A.Surface[1].shadergraph",
        materialStatus: "texture-only",
        textureHashes: ["MASK"],
        previewBlendMode: "alpha",
      },
    ],
    timelineItems,
    effectHookItems: [],
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");

  assert.equal(base.unclassifiedShadergraphCount, 0);
  assert.doesNotMatch(base.issues, /unclassified-effect-shadergraph/);
});

test("buildRuntimeResourceCompletenessRows treats definition-backed props as runtime objects", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog,
    skinItems,
    skinnedItems,
    allPbrItems,
    runtimeGraphItems,
    runtimeObjectGraphItems,
    animationBindingItems,
    skinVariantAliasItems,
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems,
  });

  const prop = rows.find((row) => row.rel === "Characters/Hero001/ArtTrap/hero001Trap.glb");

  assert.equal(prop.sourceKind, "runtime-object");
  assert.equal(prop.assetClass, "runtime-prop-candidate");
  assert.equal(prop.inRuntimeGraph, "object");
  assert.equal(prop.runtimeObjectEvidenceCount, 1);
  assert.equal(prop.runtimeObjectKinds, "trap");
  assert.equal(prop.sourceRelativePath, "Characters/Hero001/HeroA_Trap.def");
  assert.doesNotMatch(prop.issues, /not-linked-to-skin-catalog/);
  assert.doesNotMatch(prop.issues, /not-in-runtime-graph/);
  assert.doesNotMatch(prop.issues, /not-in-skinned-runtime-manifest/);
});

test("buildRuntimeResourceCompletenessRows treats definition-backed non-skin assets as runtime objects", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: { skins: {} },
    skinItems: [],
    skinnedItems: [],
    allPbrItems: [
      {
        rel: "Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.glb",
        character: "Attachments",
        variant: "santaHat2018",
        sourceMeshPath: "Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.mesh",
        materialCount: 1,
        texturedMaterialCount: 1,
      },
    ],
    runtimeGraphItems: [],
    runtimeObjectGraphItems: [
      {
        rel: "Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.glb",
        character: "Attachments",
        variant: "santaHat2018",
        objectKind: "attachment",
        sourceRelativePath: "Characters/Attachments/Hats/SantaHat2018/SantaHat2018.def",
        runtimeBlockIndex: 1,
        ownerLabels: ["Structure_DefaultSkin"],
        skeletonPaths: ["Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.skeleton"],
        animationPaths: [],
        effectPaths: [],
      },
    ],
    animationBindingItems: [],
    skinVariantAliasItems: [],
    pfxItems: [],
    shadergraphItems: [],
    timelineItems: [],
    effectHookItems: [],
  });

  const asset = rows.find((row) => row.rel === "Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.glb");

  assert.equal(asset.sourceKind, "runtime-object");
  assert.equal(asset.assetClass, "attachment");
  assert.equal(asset.inRuntimeGraph, "object");
  assert.equal(asset.runtimeObjectKinds, "attachment");
  assert.doesNotMatch(asset.issues, /not-linked-to-skin-catalog/);
  assert.doesNotMatch(asset.issues, /not-in-skinned-runtime-manifest/);
  assert.doesNotMatch(asset.issues, /not-in-runtime-graph/);
});

test("buildRuntimeResourceCompletenessRows does not report skin-manifest-only labels as unlinked models", () => {
  const manifestOnlySkin = {
    rel: "Characters/Hero010/Art/hero010.glb",
    character: "Hero010",
    modelLabel: "Skaarf_DefaultSkin",
    sourceRelativePath: "Characters/Hero010/Skaarf.def",
    sourceMeshPath: "Characters/Hero010/Art/hero010.mesh",
    materialCount: 2,
    texturedMaterialCount: 2,
  };

  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: { skins: {} },
    skinItems: [manifestOnlySkin],
    skinnedItems: [],
    allPbrItems: [manifestOnlySkin],
    runtimeGraphItems: [],
    runtimeObjectGraphItems: [],
    animationBindingItems: [],
    skinVariantAliasItems: [],
    pfxItems: [],
    shadergraphItems: [],
    timelineItems: [],
    effectHookItems: [],
  });

  assert.equal(rows.some((row) => row.rel === manifestOnlySkin.rel && row.sourceKind === "unlinked-character-model"), false);
});

test("buildRuntimeResourceCompletenessRows trusts runtime binding config for non-skeleton bind slots", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: {
      skins: {
        HeroA_DefaultSkin: skinCatalog.skins.HeroA_DefaultSkin,
      },
    },
    skinItems: [skinItems[1]],
    skinnedItems: [skinnedItems[1]],
    allPbrItems: [skinItems[1]],
    runtimeGraphItems: [runtimeGraphItems[0]],
    runtimeBindingConfigItems,
    animationBindingItems,
    skinVariantAliasItems: [],
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems: [],
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");

  assert.equal(base.unresolvedBindSlotCount, 1);
  assert.equal(base.runtimeBindingGapCount, 0);
  assert.equal(base.runtimeBindingKinds, "skeleton-bone|effect-or-aura-slot");
  assert.doesNotMatch(base.issues, /unresolved-runtime-bind-slot/);
});

test("buildRuntimeResourceCompletenessRows reports bind slots only when runtime binding config has no coverage", () => {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: {
      skins: {
        HeroA_DefaultSkin: skinCatalog.skins.HeroA_DefaultSkin,
      },
    },
    skinItems: [skinItems[1]],
    skinnedItems: [skinnedItems[1]],
    allPbrItems: [skinItems[1]],
    runtimeGraphItems: [runtimeGraphItems[0]],
    runtimeBindingConfigItems: [
      {
        rel: "Characters/Hero001/Art/hero001.glb",
        modelLabel: "HeroA_DefaultSkin",
        slots: [
          {
            slotName: "Bone_Aura",
            bindToken: "aura_bnd",
            bindingKind: "unresolved",
          },
        ],
      },
    ],
    animationBindingItems,
    skinVariantAliasItems: [],
    pfxItems,
    shadergraphItems,
    timelineItems,
    effectHookItems: [],
  });

  const base = rows.find((row) => row.skinId === "HeroA_DefaultSkin");

  assert.equal(base.runtimeBindingGapCount, 1);
  assert.match(base.issues, /unresolved-runtime-bind-slot/);
});

test("exportRuntimeResourceCompletenessReport writes TSV, viewer JSON, and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-resource-completeness-"));
  const paths = {
    skinCatalogPath: path.join(tempDir, "skin-catalog.json"),
    skinManifestPath: path.join(tempDir, "skin.json"),
    skinnedManifestPath: path.join(tempDir, "skinned.json"),
    allPbrManifestPath: path.join(tempDir, "all.json"),
    runtimeGraphPath: path.join(tempDir, "runtime-graph.json"),
    runtimeObjectGraphPath: path.join(tempDir, "runtime-object-graph.json"),
    runtimeBindingConfigPath: path.join(tempDir, "runtime-binding-config.json"),
    animationBindingPath: path.join(tempDir, "animation-bindings.json"),
    skinVariantAliasPath: path.join(tempDir, "skin-variant-aliases.json"),
    pfxManifestPath: path.join(tempDir, "pfx.json"),
    effectHookManifestPath: path.join(tempDir, "effect-hooks.json"),
    shadergraphManifestPath: path.join(tempDir, "shader.json"),
    timelineManifestPath: path.join(tempDir, "timeline.json"),
    glbMaterialCoveragePath: path.join(tempDir, "glb-material-coverage.json"),
    tsvOut: path.join(tempDir, "report.tsv"),
    jsonOut: path.join(tempDir, "summary.json"),
    viewerOut: path.join(tempDir, "viewer.json"),
  };

  writeJson(paths.skinCatalogPath, skinCatalog);
  writeJson(paths.skinManifestPath, { items: skinItems });
  writeJson(paths.skinnedManifestPath, { items: skinnedItems });
  writeJson(paths.allPbrManifestPath, { items: allPbrItems });
  writeJson(paths.runtimeGraphPath, { items: runtimeGraphItems });
  writeJson(paths.runtimeObjectGraphPath, { items: runtimeObjectGraphItems });
  writeJson(paths.runtimeBindingConfigPath, { items: runtimeBindingConfigItems });
  writeJson(paths.animationBindingPath, { items: animationBindingItems });
  writeJson(paths.skinVariantAliasPath, { items: skinVariantAliasItems });
  writeJson(paths.pfxManifestPath, { items: pfxItems });
  writeJson(paths.effectHookManifestPath, { items: effectHookItems });
  writeJson(paths.shadergraphManifestPath, { items: shadergraphItems });
  writeJson(paths.timelineManifestPath, { items: timelineItems });
  writeJson(paths.glbMaterialCoveragePath, { items: [] });

  const summary = exportRuntimeResourceCompletenessReport(paths);
  const viewer = JSON.parse(fs.readFileSync(paths.viewerOut, "utf8"));

  assert.equal(summary.skinCatalogRows, 5);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /missing-skin-preview-glb/);
  assert.equal(JSON.parse(fs.readFileSync(paths.jsonOut, "utf8")).summary.missingSkinPreviewGlb, 1);
  assert.equal(viewer.summary.missingSkinPreviewGlb, 1);
  assert.equal(viewer.items.length, 6);
});
