const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildEffectProjectileDefinitionManifest,
  exportEffectProjectileDefinitionManifest,
  inferProjectileActionKeys,
  isHeroSkinEffectLabel,
  isKindredEffectLibraryLabelForResource,
  isProjectileEffectPath,
  reportRowsForManifest,
} = require("../tools/effect_projectile_definition_manifest");

test("projectile definition manifest keeps only KindredEffects hero skin projectile resources", () => {
  const manifest = buildEffectProjectileDefinitionManifest([
    {
      sourceRelativePath: "Effects/KindredEffects.def",
      label: "Skaarf_DefaultSkin",
      category: "effect",
      targetRelativePath: "Effects/Hero010/Hero010_Projectile.assetbundle/Hero010_Projectile.pfx",
      targetHash: "HASH_PROJECTILE",
      matched: "yes",
    },
    {
      sourceRelativePath: "Effects/KindredEffects.def",
      label: "Warhawk_Skin_CNY",
      category: "effect",
      targetRelativePath: "Effects/Hero065/S3/Hero065_CNY_B_Grenade_Proj/Hero065_CNY_B_Grenade_Proj.pfx",
      targetHash: "HASH_GRENADE",
      matched: "yes",
    },
    {
      sourceRelativePath: "Effects/KindredEffects.def",
      label: "minions",
      category: "effect",
      targetRelativePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
      targetHash: "HASH_MINION",
      matched: "yes",
    },
    {
      sourceRelativePath: "Characters/Hero010/Skaarf.def",
      label: "Skaarf_DefaultSkin",
      category: "effect",
      targetRelativePath: "Effects/Hero010/Hero010_Projectile.assetbundle/Hero010_Projectile.pfx",
      targetHash: "HASH_OTHER_DEF",
      matched: "yes",
    },
  ], "TEST_DATE");

  assert.equal(isHeroSkinEffectLabel("Skaarf_DefaultSkin"), true);
  assert.equal(isHeroSkinEffectLabel("Warhawk_Skin_CNY"), true);
  assert.equal(isHeroSkinEffectLabel("minions"), false);
  assert.equal(isProjectileEffectPath("Effects/Hero065/Default/Hero065_B_Grenade_Proj/Hero065_B_Grenade_Proj.pfx"), true);
  assert.deepEqual(inferProjectileActionKeys("Effects/Hero065/Default/Hero065_B_Grenade_Proj/Hero065_B_Grenade_Proj.pfx"), [
    "ability02",
  ]);
  assert.deepEqual(inferProjectileActionKeys("Effects/Hero010/Hero010_Projectile.assetbundle/Hero010_Projectile.pfx"), [
    "attack",
  ]);
  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.rows, 2);
  assert.equal(manifest.summary.modelLabels, 2);
  assert.deepEqual(manifest.items.map((item) => item.modelLabel), ["Skaarf_DefaultSkin", "Warhawk_Skin_CNY"]);
  assert.equal(manifest.items[0].sourceKind, "definition-projectile-resource");
  assert.equal(manifest.items[0].role, "projectile");
  assert.deepEqual(manifest.items[0].actionKeys, ["attack"]);
  assert.deepEqual(manifest.items[1].actionKeys, ["ability02"]);
});

test("projectile definition manifest accepts non-hero KindredEffects labels when they match the effect resource root", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "kraken",
        category: "effect",
        targetRelativePath: "Effects/Kraken/Shell_Glow.assetbundle/Shell_Glow.pfx",
        targetHash: "HASH_KRAKEN_SHELL_GLOW",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "kraken",
        category: "effect",
        targetRelativePath: "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx",
        targetHash: "HASH_BLACKCLAW_REUSED_IN_KRAKEN_GROUP",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "minions",
        category: "effect",
        targetRelativePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
        targetHash: "HASH_LEAD_MINION_REUSED_IN_MINIONS_GROUP",
        matched: "yes",
      },
    ],
    "TEST_DATE",
  );

  assert.equal(isHeroSkinEffectLabel("kraken"), false);
  assert.equal(
    isKindredEffectLibraryLabelForResource("kraken", "Effects/Kraken/Shell_Glow.assetbundle/Shell_Glow.pfx"),
    true,
  );
  assert.equal(
    isKindredEffectLibraryLabelForResource("kraken", "Effects/Blackclaw/Blackclaw_AA/BlackClaw_AA.pfx"),
    false,
  );
  assert.equal(
    isKindredEffectLibraryLabelForResource("minions", "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx"),
    false,
  );
  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.items[0].modelLabel, "kraken");
  assert.equal(manifest.items[0].heroLabel, "kraken");
  assert.equal(manifest.items[0].resourcePath, "Effects/Kraken/Shell_Glow.assetbundle/Shell_Glow.pfx");
  assert.deepEqual(manifest.items[0].effectTokens, ["Effect_Shell_Glow", "Effect_Kraken_Shell_Glow"]);
});

test("projectile definition manifest attaches recovered definition bone-slot evidence", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Warhawk_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero065/Default/Hero065_AA_Shot_Proj/Hero065_AA_Shot_Proj.pfx",
        targetHash: "HASH_WARHAWK_AA",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Warhawk_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero065/Default/Hero065_B_Grenade_Proj/Hero065_B_Grenade_Proj.pfx",
        targetHash: "HASH_WARHAWK_B",
        matched: "yes",
      },
    ],
    "TEST_DATE",
    {
      blockNeighborhoodRows: [
        {
          relativePath: "Characters/Hero065/Warhawk.def",
          bindToken: "launcher_bnd",
          labelBefore: "Plaque",
          previousValue: "Bone_LauncherHandle",
          nextValue: "Effect_Warhawk_AA_Shot",
          directBoneSlot: "Bone_LauncherHandle",
          nearbyBones: "Bone_LeftHand|Bone_Head|Bone_CenterMass|Bone_LauncherHandle",
          neighborhoodEvidence: "bone-slot",
        },
      ],
    },
  );

  const aaProjectile = manifest.items.find((item) => item.resourcePath.includes("Hero065_AA_Shot_Proj"));
  assert.ok(aaProjectile.effectTokens.includes("Effect_Warhawk_AA_Shot"));
  assert.equal(aaProjectile.boneToken, "Bone_LauncherHandle");
  assert.equal(aaProjectile.bindToken, "launcher_bnd");
  assert.equal(aaProjectile.boneEvidence, "definition-block-neighborhood");
  assert.equal(aaProjectile.boneDefinitionPath, "Characters/Hero065/Warhawk.def");
  assert.equal(manifest.summary.boneHintRows, 1);

  const grenadeProjectile = manifest.items.find((item) => item.resourcePath.includes("Hero065_B_Grenade_Proj"));
  assert.equal(grenadeProjectile.boneToken, "");
  assert.equal(grenadeProjectile.boneEvidence, "");
});

test("projectile definition manifest imports projectile pfx resources from shadergraph hook tokens", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [],
    "TEST_DATE",
    {
      shadergraphRows: [
        {
          relativePath: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.Surface[11].shadergraph",
          pfxPaths: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx",
          hookEffectTokens: "Effect_Ball_PFX|Effect_Blackclaw_BreathProjectile|Effect_Kraken_Attack_Projectile_5v5",
          hash: "HASH_SURFACE",
        },
        {
          relativePath: "Effects/Items/EMP/EMP_Burst/EMP_Burst.Surface[25].shadergraph",
          pfxPaths: "Effects/Items/EMP/EMP_Burst/EMP_Burst.pfx",
          hookEffectTokens: "Effect_Item_EMP_Hit",
          hash: "HASH_IMPACT",
        },
        {
          relativePath: "Effects/Hero018/Hero018_B_Rocket.assetbundle/Hero018_B_Rocket.Surface[7].shadergraph",
          pfxPaths: "Effects/Hero018/Hero018_B_Rocket.assetbundle/Hero018_B_Rocket.pfx",
          hookEffectTokens: "Effect_Skye_B_Shot",
          hash: "HASH_SKYE_B",
        },
        {
          relativePath: "Effects/Hero070/DefaultSkin/Hero070_B2_Shot/Hero070_B2_Shot.Surface[4].shadergraph",
          pfxPaths: "Effects/Hero070/DefaultSkin/Hero070_B2_Shot/Hero070_B2_Shot.pfx",
          hookEffectTokens: "Effect_Shin_B1_Shot|Effect_Shin_B2_Shot",
          hash: "HASH_SHIN_B",
        },
        {
          relativePath: "Effects/Hero009/FX/Hero009_Sword_Spinning.assetbundle/Hero009_Sword_Spinning.Surface[41].shadergraph",
          pfxPaths: "Effects/Hero009/FX/Hero009_Sword_Spinning.assetbundle/Hero009_Sword_Spinning.pfx",
          hookEffectTokens: "Effect_Hero009_Sword_Spinning",
          hash: "HASH_KRUL_SPIN",
        },
      ],
      nativeEffectRows: [
        {
          sourceKind: "native-effect-selector",
          selectorOutputRole: "projectile",
          effectToken: "Effect_Hero009_Sword_Spinning",
        },
      ],
    },
  );

  assert.equal(manifest.summary.rows, 5);
  const projectile = manifest.items.find((item) => item.resourcePath.endsWith("Blackclaw_Fireball.pfx"));
  assert.ok(projectile);
  assert.equal(projectile.sourceKind, "shadergraph-projectile-resource");
  assert.equal(projectile.sourceDefinitionPath, "extracted/reports/effect_shadergraph_material_manifest.tsv");
  assert.equal(projectile.modelLabel, "Blackclaw");
  assert.equal(projectile.heroLabel, "Blackclaw");
  assert.equal(projectile.role, "projectile");
  assert.deepEqual(projectile.effectTokens, [
    "Effect_Ball_PFX",
    "Effect_Blackclaw_BreathProjectile",
    "Effect_Kraken_Attack_Projectile_5v5",
  ]);
  assert.deepEqual(projectile.actionKeys, ["attack"]);

  const impact = manifest.items.find((item) => item.resourcePath.endsWith("EMP_Burst.pfx"));
  assert.equal(impact.role, "impact");
  assert.deepEqual(impact.effectTokens, ["Effect_Item_EMP_Hit"]);

  const skye = manifest.items.find((item) => item.resourcePath.endsWith("Hero018_B_Rocket.pfx"));
  assert.equal(skye.modelLabel, "Skye");
  assert.equal(skye.heroLabel, "Skye");
  assert.deepEqual(skye.actionKeys, ["ability02"]);

  const shin = manifest.items.find((item) => item.resourcePath.endsWith("Hero070_B2_Shot.pfx"));
  assert.equal(shin.modelLabel, "Shin");
  assert.deepEqual(shin.actionKeys, ["ability02"]);

  const krulSpin = manifest.items.find((item) => item.resourcePath.endsWith("Hero009_Sword_Spinning.pfx"));
  assert.equal(krulSpin.modelLabel, "Hero009");
  assert.deepEqual(krulSpin.effectTokens, ["Effect_Hero009_Sword_Spinning"]);
});

test("projectile definition manifest imports exact native token-only hash resources for projectile selectors", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [],
    "TEST_DATE",
    {
      nativeEffectRows: [
        {
          sourceKind: "native-effect-selector",
          selectorOutputRole: "projectile",
          effectToken: "Effect_RooksDecree_Projectile",
        },
      ],
      nativeTokenOnlyRows: [
        {
          effectToken: "Effect_RooksDecree_Projectile",
          sourceKind: "native-effect-selector",
          kindredHashLookupState: "exact-kindred-effects-hash-resource",
          kindredHashResourcePaths: "Effects/Hero000/Hero000_FireBall/Hero000_FireBall.pfx",
        },
      ],
    },
  );

  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.items[0].sourceKind, "native-token-hash-projectile-resource");
  assert.equal(manifest.items[0].sourceDefinitionPath, "extracted/reports/native_effect_token_only_callsite_audit.tsv");
  assert.equal(manifest.items[0].modelLabel, "RooksDecree");
  assert.equal(manifest.items[0].heroLabel, "RooksDecree");
  assert.equal(manifest.items[0].role, "projectile");
  assert.deepEqual(manifest.items[0].effectTokens, ["Effect_RooksDecree_Projectile"]);
  assert.equal(manifest.items[0].resourcePath, "Effects/Hero000/Hero000_FireBall/Hero000_FireBall.pfx");
});

test("projectile definition manifest links projectile rows to paired impact resources", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Anka_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero054/Hero054_A_Proj/Hero054_A_Proj.pfx",
        targetHash: "HASH_ANKA_A_PROJ",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Anka_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero054/Hero054_A_Proj_Hit/Hero054_A_Proj_Hit.pfx",
        targetHash: "HASH_ANKA_A_HIT",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Anka_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero054/Hero054_B_Proj/Hero054_B_Proj.pfx",
        targetHash: "HASH_ANKA_B_PROJ",
        matched: "yes",
      },
    ],
    "TEST_DATE",
  );

  const projectile = manifest.items.find((item) => item.resourcePath.endsWith("Hero054_A_Proj.pfx"));
  const impact = manifest.items.find((item) => item.resourcePath.endsWith("Hero054_A_Proj_Hit.pfx"));
  const unrelatedProjectile = manifest.items.find((item) => item.resourcePath.endsWith("Hero054_B_Proj.pfx"));

  assert.equal(projectile.projectileChainKey, "Anka_DefaultSkin:ability01:Hero054_A");
  assert.deepEqual(projectile.pairedImpactResourcePaths, ["Effects/Hero054/Hero054_A_Proj_Hit/Hero054_A_Proj_Hit.pfx"]);
  assert.deepEqual(impact.pairedProjectileResourcePaths, ["Effects/Hero054/Hero054_A_Proj/Hero054_A_Proj.pfx"]);
  assert.deepEqual(unrelatedProjectile.pairedImpactResourcePaths, []);
  assert.equal(manifest.summary.projectileImpactPairs, 1);
  assert.match(reportRowsForManifest(manifest).find((row) => row.resourcePath.endsWith("Hero054_A_Proj.pfx")).pairedImpactResourcePaths, /Hero054_A_Proj_Hit/);
});

test("projectile definition manifest does not classify explosive projectile bodies as impacts", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "SAW_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/SAW/SAW_Projectile_Explosive.assetbundle/SAW_Projectile_Explosive.pfx",
        targetHash: "HASH_SAW_EXPLOSIVE_PROJECTILE",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "SAW_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/SAW/SAW_Projectile_Explosive_Impact.assetbundle/SAW_Projectile_Explosive_Impact.pfx",
        targetHash: "HASH_SAW_EXPLOSIVE_IMPACT",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Samuel_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero029/Hero029_MagicMissile_Exp/Hero029_MagicMissile_Exp.pfx",
        targetHash: "HASH_SAMUEL_EXP",
        matched: "yes",
      },
    ],
    "TEST_DATE",
  );

  const sawProjectile = manifest.items.find((item) => item.resourcePath.endsWith("SAW_Projectile_Explosive.pfx"));
  const sawImpact = manifest.items.find((item) => item.resourcePath.endsWith("SAW_Projectile_Explosive_Impact.pfx"));
  const samuelImpact = manifest.items.find((item) => item.resourcePath.endsWith("Hero029_MagicMissile_Exp.pfx"));

  assert.equal(sawProjectile.role, "projectile");
  assert.equal(sawImpact.role, "impact");
  assert.equal(samuelImpact.role, "impact");
  assert.deepEqual(sawProjectile.pairedImpactResourcePaths, [
    "Effects/SAW/SAW_Projectile_Explosive_Impact.assetbundle/SAW_Projectile_Explosive_Impact.pfx",
  ]);
});

test("projectile definition manifest classifies abbreviated imp suffixes as impacts", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "SAW_Skin_Summer",
        category: "effect",
        targetRelativePath: "Effects/SAW/S2/SAW_S2_Projectile_Explosive/SAW_S2_Projectile_Explosive.pfx",
        targetHash: "HASH_SAW_S2_PROJECTILE",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "SAW_Skin_Summer",
        category: "effect",
        targetRelativePath: "Effects/SAW/S2/SAW_S2_Proj_Expl_Imp/SAW_S2_Proj_Expl_Imp.pfx",
        targetHash: "HASH_SAW_S2_IMPACT",
        matched: "yes",
      },
    ],
    "TEST_DATE",
  );

  const projectile = manifest.items.find((item) => item.resourcePath.endsWith("SAW_S2_Projectile_Explosive.pfx"));
  const impact = manifest.items.find((item) => item.resourcePath.endsWith("SAW_S2_Proj_Expl_Imp.pfx"));

  assert.equal(projectile.role, "projectile");
  assert.equal(impact.role, "impact");
  assert.deepEqual(projectile.pairedImpactResourcePaths, ["Effects/SAW/S2/SAW_S2_Proj_Expl_Imp/SAW_S2_Proj_Expl_Imp.pfx"]);
});

test("projectile definition manifest pairs crit impact and exp impact suffix variants", () => {
  const manifest = buildEffectProjectileDefinitionManifest(
    [
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Petal_Skin_Wonderland",
        category: "effect",
        targetRelativePath: "Effects/Petal/FX/WON/Petal_WON_Proj_Crit/Petal_WON_Proj_Crit.pfx",
        targetHash: "HASH_PETAL_CRIT_PROJECTILE",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Petal_Skin_Wonderland",
        category: "effect",
        targetRelativePath: "Effects/Petal/FX/WON/Petal_WON_Proj_Crit_Impact/Petal_WON_Proj_Crit_Impact.pfx",
        targetHash: "HASH_PETAL_CRIT_IMPACT",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Samuel_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero029/Hero029_MagicMissile/Hero029_MagicMissile.pfx",
        targetHash: "HASH_SAMUEL_PROJECTILE",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Samuel_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero029/Hero029_MagicMissile_2/Hero029_MagicMissile_2.pfx",
        targetHash: "HASH_SAMUEL_PROJECTILE_2",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Samuel_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero029/Hero029_MagicMissile_Exp_2/Hero029_MagicMissile_Exp_2.pfx",
        targetHash: "HASH_SAMUEL_EXP_2",
        matched: "yes",
      },
      {
        sourceRelativePath: "Effects/KindredEffects.def",
        label: "Samuel_DefaultSkin",
        category: "effect",
        targetRelativePath: "Effects/Hero029/Hero029_MagicMissile_Exp/Hero029_MagicMissile_Exp.pfx",
        targetHash: "HASH_SAMUEL_EXP",
        matched: "yes",
      },
    ],
    "TEST_DATE",
  );

  const petalProjectile = manifest.items.find((item) => item.resourcePath.endsWith("Petal_WON_Proj_Crit.pfx"));
  const samuelProjectile = manifest.items.find((item) => item.resourcePath.endsWith("Hero029_MagicMissile.pfx"));
  const samuelProjectile2 = manifest.items.find((item) => item.resourcePath.endsWith("Hero029_MagicMissile_2.pfx"));

  assert.deepEqual(petalProjectile.pairedImpactResourcePaths, [
    "Effects/Petal/FX/WON/Petal_WON_Proj_Crit_Impact/Petal_WON_Proj_Crit_Impact.pfx",
  ]);
  assert.deepEqual(samuelProjectile.pairedImpactResourcePaths, [
    "Effects/Hero029/Hero029_MagicMissile_Exp/Hero029_MagicMissile_Exp.pfx",
  ]);
  assert.deepEqual(samuelProjectile2.pairedImpactResourcePaths, [
    "Effects/Hero029/Hero029_MagicMissile_Exp_2/Hero029_MagicMissile_Exp_2.pfx",
  ]);
  assert.equal(manifest.summary.projectileImpactPairs, 3);
});

test("projectile definition manifest exporter writes viewer json and reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-definition-"));
  const sourcePath = path.join(tempDir, "definition_build_links.tsv");
  const blockNeighborhoodPath = path.join(tempDir, "definition_block_neighborhood.tsv");
  const viewerOut = path.join(tempDir, "effect-projectile-definition-manifest.json");
  const tsvOut = path.join(tempDir, "effect_projectile_definition_manifest.tsv");
  const jsonOut = path.join(tempDir, "effect_projectile_definition_manifest_summary.json");

  fs.writeFileSync(
    sourcePath,
    [
      "sourceRelativePath\tsourceHash\tblockIndexes\tfirstStringIndex\tlabel\tcategory\ttargetRelativePath\ttargetBuildPath\ttargetHash\tmatched\ttargetLinkedPath",
      "Effects/KindredEffects.def\tHASH\t0,1\t1\tVox_DefaultSkin\teffect\tEffects/Hero013/Vox_Proj.assetbundle/Vox_Proj.pfx\tbuild://Effects/Hero013/Vox_Proj.assetbundle/Vox_Proj.pfx\tHASH_VOX\tyes\t/path/Vox_Proj.pfx",
    ].join("\n"),
  );
  fs.writeFileSync(
    blockNeighborhoodPath,
    [
      "relativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tstringIndex\tpayloadOffset\tbindToken\tlabelBefore\tpreviousValue\tnextValue\tdirectBoneSlot\tnearbyBones\tnearbyMeshes\tnearbySkeletons\tnearbyAnimations\tnearbyEffects\tnearbyResources\tneighborhoodEvidence",
      "Characters/Hero013/Vox.def\tHASH\t0\t4\t8\t212\t11484\tspineC_bnd\tCritAttack_LeftHand\tBone_CenterMass\tEffect_Vox_Proj\tBone_CenterMass\tBone_LeftHand|Bone_Head|Bone_Back|Bone_CenterMass\t\t\t\t\t\tbone-slot",
    ].join("\n"),
  );

  const summary = exportEffectProjectileDefinitionManifest({
    sourcePath,
    blockNeighborhoodPath,
    shadergraphPath: "",
    nativeEffectPath: "",
    nativeTokenOnlyPath: "",
    viewerOut,
    tsvOut,
    jsonOut,
    generatedAt: "TEST_DATE",
  });
  assert.equal(summary.rows, 1);
  assert.equal(summary.boneHintRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Vox_Proj\.assetbundle/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /"boneToken": "Bone_CenterMass"/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /definition-projectile-resource/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /definition-block-neighborhood/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /"rows": 1/);
});
