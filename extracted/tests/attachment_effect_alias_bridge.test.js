const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeAttachmentEffectAliases,
  definitionCandidatesForHero,
  effectNameVariants,
  exportAttachmentEffectAliasBridge,
  matchHeroAliasResources,
  parseEffectToken,
} = require("../tools/attachment_effect_alias_bridge");

const resourceBridgeRows = [
  {
    token: "Effect_Crisis_Weapon",
    resourceStatus: "resource-matched",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android|ios",
  },
  {
    token: "Effect_Baron_B_Weapon_Buff",
    resourceStatus: "resource-unmatched",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android|ios",
  },
  {
    token: "Effect_Baron_Weapon_Idle",
    resourceStatus: "resource-unmatched",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android",
  },
  {
    token: "Effect_LanceBall_Lance_A_Weapon",
    resourceStatus: "resource-unmatched",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android|ios",
  },
  {
    token: "Effect_Shin_Weapon_Head",
    resourceStatus: "resource-unmatched",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android|ios",
  },
];

const effectRows = [
  {
    relativePath: "Effects/Items/Crisis_Weapon.assetbundle/Crisis_Weapon.pfx",
    hash: "CRISIS",
  },
  {
    relativePath: "Effects/Hero019/Hero019_B_Weapon_Buff/Hero019_B_Weapon_Buff.pfx",
    hash: "BARON_B",
  },
  {
    relativePath: "Effects/Hero019/Hero019_Weapon/Hero019_Weapon.pfx",
    hash: "BARON_IDLE",
  },
  {
    relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
    hash: "LANCE_DEFAULT",
  },
  {
    relativePath: "Effects/Hero028/S1/Hero028_S1_A_Weapon/Hero028_S1_A_Weapon.pfx",
    hash: "LANCE_S1",
  },
  {
    relativePath: "Effects/Hero040/Hero040_A_Shot/Hero040_A_Shot.pfx",
    hash: "BAPTISTE_A_SHOT",
  },
  {
    relativePath: "Effects/Hero040/Hero040_A_Explosion/Hero040_A_Explosion.pfx",
    hash: "BAPTISTE_A_EXPLOSION",
  },
  {
    relativePath: "Effects/Hero045/Hero045_A_Proj/Hero045_A_Proj.pfx",
    hash: "VARYA_A_PROJ",
  },
  {
    relativePath: "Effects/Hero070/DefaultSkin/Hero070_Weaponfx/Hero070_Weaponfx.pfx",
    hash: "SHIN_WEAPON",
  },
  {
    relativePath: "Effects/Sayoc/Sayoc_SmokeBomb.assetbundle/Sayoc_SmokeBomb.pfx",
    hash: "TAKA_SMOKE",
  },
  {
    relativePath: "Effects/Hero018/Hero018_AA_MF.assetbundle/Hero018_AA_MF.pfx",
    hash: "SKYE_AA_MF",
  },
  {
    relativePath: "Effects/Glaive/Glaive_AxeEdge.assetbundle/Glaive_AxeEdge.pfx",
    hash: "GLAIVE_AXE_EDGE",
  },
  {
    relativePath: "Effects/Catherine/Catherine_C/Catherine_C.pfx",
    hash: "CATHERINE_C",
  },
  {
    relativePath: "Effects/Hero014/Celeste_Ult_Impact.assetbundle/Celeste_Ult_Impact.pfx",
    hash: "CELESTE_ULT_IMPACT",
  },
  {
    relativePath: "Effects/Adagio/AdagioProjectileImpact.assetbundle/Adagio_ProjectileImpact.pfx",
    hash: "ADAGIO_PROJECTILE_IMPACT",
  },
];

const heroNameRows = [
  { hero: "Baron", kind: "Effect", name: "B_Weapon_Buff" },
  { hero: "Baron", kind: "Effect", name: "Weapon_Idle" },
  { hero: "LanceBall", kind: "Effect", name: "Lance_A_Weapon" },
  { hero: "Baptiste", kind: "Effect", name: "A_Projectile" },
  { hero: "Baptiste", kind: "Effect", name: "A_ProjectileImpact" },
  { hero: "Varya", kind: "Effect", name: "A_Projectile" },
  { hero: "Shin", kind: "Effect", name: "Weapon_Head" },
  { hero: "Taka", kind: "Effect", name: "SmokeBomb" },
  { hero: "Skye", kind: "Effect", name: "AA_MF" },
  { hero: "Glaive", kind: "Effect", name: "Axe_Edge" },
  { hero: "Catherine", kind: "Effect", name: "UltImpact" },
  { hero: "AdagioFortunesSmile", kind: "Effect", name: "impact" },
];

const definitionRows = [
  {
    manifestLabel: "*Baron*",
    targetRelativePath: "Characters/Hero019/Baron.def",
    childResourceRows: "313",
    skeletonSamples: "Characters/Hero019/Art/hero019.skeleton",
  },
  {
    manifestLabel: "*LanceBall_Lance*",
    targetRelativePath: "Characters/LanceBall/Lance/LanceBall_Lance.def",
    childResourceRows: "24",
    skeletonSamples: "Characters/Hero028/Art/hero028.skeleton",
  },
  {
    manifestLabel: "*Baptiste*",
    targetRelativePath: "Characters/Hero040/Baptiste.def",
    childResourceRows: "229",
    skeletonSamples: "Characters/Hero040/Art/hero040.skeleton",
  },
  {
    manifestLabel: "*Varya*",
    targetRelativePath: "Characters/Hero045/Varya.def",
    childResourceRows: "198",
    skeletonSamples: "Characters/Hero045/Art/hero045.skeleton",
  },
  {
    manifestLabel: "*Shin*",
    targetRelativePath: "Characters/Hero070/Shin.def",
    childResourceRows: "183",
    skeletonSamples: "Characters/Hero070/Art/hero070.skeleton",
  },
  {
    manifestLabel: "*Sayoc*",
    targetRelativePath: "Characters/Hero011/Taka.def",
    childResourceRows: "283",
    skeletonSamples: "Characters/Hero011/Art/hero011.skeleton",
  },
  {
    manifestLabel: "*Skye*",
    targetRelativePath: "Characters/Skye/Skye.def",
    childResourceRows: "342",
    skeletonSamples: "Characters/Skye/Art/skye.skeleton",
  },
  {
    manifestLabel: "*Glaive*",
    targetRelativePath: "Characters/Glaive/Glaive.def",
    childResourceRows: "193",
    skeletonSamples: "Characters/Glaive/Art/glaive.skeleton",
  },
  {
    manifestLabel: "*Catherine*",
    targetRelativePath: "Characters/Catherine/Catherine.def",
    childResourceRows: "262",
    skeletonSamples: "Characters/Catherine/Art/catherine.skeleton",
  },
  {
    manifestLabel: "*Adagio*",
    targetRelativePath: "Characters/Adagio/Adagio.def",
    childResourceRows: "350",
    skeletonSamples: "Characters/Adagio/Art/adagio.skeleton",
  },
];

const definitionLinkRows = [
  {
    sourceRelativePath: "Effects/KindredEffects.def",
    label: "Baron_DefaultSkin",
    category: "effect",
    targetRelativePath: "Effects/Hero019/Hero019_B_Weapon_Buff/Hero019_B_Weapon_Buff.pfx",
  },
  {
    sourceRelativePath: "Effects/KindredEffects.def",
    label: "Lance_Skin_Glad",
    category: "effect",
    targetRelativePath: "Effects/Hero028/S1/Hero028_S1_A_Weapon/Hero028_S1_A_Weapon.pfx",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("parseEffectToken uses the decoded hero/effect name table before fallbacks", () => {
  assert.deepEqual(parseEffectToken("Effect_Baron_B_Weapon_Buff", heroNameRows), {
    hero: "Baron",
    effectName: "B_Weapon_Buff",
    matchKind: "hero-effect-name-table",
  });

  assert.deepEqual(parseEffectToken("Effect_Unknown_Weapon", heroNameRows), {
    hero: "",
    effectName: "Unknown_Weapon",
    matchKind: "token-prefix-fallback",
  });
});

test("definitionCandidatesForHero recovers Hero### codes from manifest-linked character rows", () => {
  const candidates = definitionCandidatesForHero("LanceBall", definitionRows);
  assert.equal(candidates[0].manifestLabel, "*LanceBall_Lance*");
});

test("effectNameVariants includes game naming aliases without dropping ability letters", () => {
  assert.deepEqual(effectNameVariants("Weapon_Idle", "Baron", []), ["Weapon_Idle", "Weapon"]);
  assert.deepEqual(effectNameVariants("B_Weapon_Buff", "Baron", []), ["B_Weapon_Buff"]);
  assert.deepEqual(effectNameVariants("Lance_A_Weapon", "LanceBall", [definitionRows[1]]), [
    "Lance_A_Weapon",
    "A_Weapon",
  ]);
  assert.deepEqual(effectNameVariants("A_Projectile", "Baptiste", []), ["A_Projectile", "A_Shot", "A_Proj"]);
  assert.deepEqual(effectNameVariants("A_ProjectileImpact", "Baptiste", []), [
    "A_ProjectileImpact",
    "A_Explosion",
    "A_Hit",
  ]);
});

test("matchHeroAliasResources resolves strong basename aliases and weak same-hero candidates", () => {
  const baron = matchHeroAliasResources(
    parseEffectToken("Effect_Baron_B_Weapon_Buff", heroNameRows),
    definitionRows,
    effectRows,
  );
  assert.equal(baron.matchKind, "hero-code-exact-basename");
  assert.equal(baron.evidenceStrength, "strong");
  assert.deepEqual(baron.matches.map((row) => row.hash), ["BARON_B"]);

  const idle = matchHeroAliasResources(parseEffectToken("Effect_Baron_Weapon_Idle", heroNameRows), definitionRows, effectRows);
  assert.equal(idle.matchKind, "hero-code-drop-idle-basename");
  assert.deepEqual(idle.matches.map((row) => row.hash), ["BARON_IDLE"]);

  const lance = matchHeroAliasResources(
    parseEffectToken("Effect_LanceBall_Lance_A_Weapon", heroNameRows),
    definitionRows,
    effectRows,
  );
  assert.equal(lance.matchKind, "hero-code-exact-basename");
  assert.deepEqual(lance.matches.map((row) => row.hash), ["LANCE_DEFAULT"]);

  const baptisteShot = matchHeroAliasResources(
    parseEffectToken("Effect_Baptiste_A_Projectile", heroNameRows),
    definitionRows,
    effectRows,
  );
  assert.equal(baptisteShot.matchKind, "hero-code-effect-name-alias-basename");
  assert.equal(baptisteShot.evidenceStrength, "strong");
  assert.deepEqual(baptisteShot.matches.map((row) => row.hash), ["BAPTISTE_A_SHOT"]);

  const baptisteImpact = matchHeroAliasResources(
    parseEffectToken("Effect_Baptiste_A_ProjectileImpact", heroNameRows),
    definitionRows,
    effectRows,
  );
  assert.equal(baptisteImpact.matchKind, "hero-code-effect-name-alias-basename");
  assert.deepEqual(baptisteImpact.matches.map((row) => row.hash), ["BAPTISTE_A_EXPLOSION"]);

  const varyaProjectile = matchHeroAliasResources(
    parseEffectToken("Effect_Varya_A_Projectile", heroNameRows),
    definitionRows,
    effectRows,
  );
  assert.equal(varyaProjectile.matchKind, "hero-code-effect-name-alias-basename");
  assert.deepEqual(varyaProjectile.matches.map((row) => row.hash), ["VARYA_A_PROJ"]);

  const shin = matchHeroAliasResources(parseEffectToken("Effect_Shin_Weapon_Head", heroNameRows), definitionRows, effectRows);
  assert.equal(shin.matchKind, "hero-code-keyword-candidate");
  assert.equal(shin.evidenceStrength, "weak");
  assert.deepEqual(shin.matches.map((row) => row.hash), ["SHIN_WEAPON"]);

  const taka = matchHeroAliasResources(parseEffectToken("Effect_Taka_SmokeBomb", heroNameRows), definitionRows, effectRows);
  assert.equal(taka.matchKind, "hero-code-exact-basename");
  assert.equal(taka.evidenceStrength, "strong");
  assert.deepEqual(taka.matches.map((row) => row.hash), ["TAKA_SMOKE"]);

  const skye = matchHeroAliasResources(parseEffectToken("Effect_Skye_AA_MF", heroNameRows), definitionRows, effectRows);
  assert.equal(skye.matchKind, "unique-resource-root-effect-name");
  assert.equal(skye.evidenceStrength, "strong");
  assert.deepEqual(skye.matches.map((row) => row.hash), ["SKYE_AA_MF"]);

  const glaive = matchHeroAliasResources(parseEffectToken("Effect_Glaive_Axe_Edge", heroNameRows), definitionRows, effectRows);
  assert.equal(glaive.matchKind, "hero-code-compact-basename");
  assert.equal(glaive.evidenceStrength, "strong");
  assert.deepEqual(glaive.matches.map((row) => row.hash), ["GLAIVE_AXE_EDGE"]);

  const catherine = matchHeroAliasResources(parseEffectToken("Effect_Catherine_UltImpact", heroNameRows), definitionRows, effectRows);
  assert.equal(catherine.matchKind, "none");
  assert.deepEqual(catherine.matches, []);
});

test("matchHeroAliasResources rehomes composite effect-table heroes to real definition heroes", () => {
  const parsed = parseEffectToken("Effect_AdagioFortunesSmile_impact", heroNameRows);
  assert.deepEqual(parsed, {
    hero: "AdagioFortunesSmile",
    effectName: "impact",
    matchKind: "hero-effect-name-table",
  });

  const match = matchHeroAliasResources(parsed, definitionRows, effectRows);

  assert.equal(match.normalizedParsed.hero, "Adagio");
  assert.equal(match.normalizedParsed.effectName, "FortunesSmile_impact");
  assert.equal(match.normalizedParsed.matchKind, "definition-prefix-hero-rehome");
  assert.deepEqual(match.definitions.map((row) => row.manifestLabel), ["*Adagio*"]);
  assert.deepEqual(match.resourceRoots, ["Adagio"]);
  assert.equal(match.matchKind, "hero-resource-root-keyword-candidate");
  assert.equal(match.evidenceStrength, "weak");
  assert.deepEqual(match.matches.map((row) => row.hash), ["ADAGIO_PROJECTILE_IMPACT"]);
});

test("bridgeAttachmentEffectAliases classifies exact, strong alias, and weak candidate rows", () => {
  const rows = bridgeAttachmentEffectAliases(resourceBridgeRows, effectRows, heroNameRows, definitionRows, definitionLinkRows);
  assert.equal(rows.length, 5);

  assert.equal(rows.find((row) => row.token === "Effect_Crisis_Weapon").aliasStatus, "exact-resource");

  const baron = rows.find((row) => row.token === "Effect_Baron_B_Weapon_Buff");
  assert.equal(baron.aliasStatus, "hero-alias-resource");
  assert.equal(baron.heroCodes, "Hero019");
  assert.equal(baron.resourceLabels, "Baron_DefaultSkin");

  const idle = rows.find((row) => row.token === "Effect_Baron_Weapon_Idle");
  assert.equal(idle.matchKind, "hero-code-drop-idle-basename");

  const shin = rows.find((row) => row.token === "Effect_Shin_Weapon_Head");
  assert.equal(shin.aliasStatus, "resource-candidate");
});

test("attachment effect alias bridge exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-attachment-effect-alias-"));
  const resourceBridgePath = path.join(tempDir, "resource_bridge.tsv");
  const effectsPath = path.join(tempDir, "effects.tsv");
  const heroNamesPath = path.join(tempDir, "hero_names.tsv");
  const definitionsPath = path.join(tempDir, "definitions.tsv");
  const linksPath = path.join(tempDir, "links.tsv");
  writeRows(
    resourceBridgePath,
    ["token", "resourceStatus", "nativeRoles", "nativePlatforms", "nativeFunctions", "nativeSemanticCalls"],
    resourceBridgeRows,
  );
  writeRows(effectsPath, ["category", "relativePath", "hash"], effectRows);
  writeRows(heroNamesPath, ["hero", "kind", "name"], heroNameRows);
  writeRows(definitionsPath, ["manifestLabel", "targetRelativePath", "childResourceRows", "skeletonSamples"], definitionRows);
  writeRows(linksPath, ["sourceRelativePath", "label", "category", "targetRelativePath"], definitionLinkRows);

  const summary = exportAttachmentEffectAliasBridge({
    resourceBridgePath,
    effectResourcePath: effectsPath,
    heroNamesPath,
    definitionChainPath: definitionsPath,
    definitionLinksPath: linksPath,
    tsvOut: path.join(tempDir, "attachment_effect_alias_bridge.tsv"),
    jsonOut: path.join(tempDir, "attachment_effect_alias_bridge_summary.json"),
  });

  assert.equal(summary.byStatus["exact-resource"], 1);
  assert.equal(summary.byStatus["hero-alias-resource"], 3);
  assert.equal(summary.byStatus["resource-candidate"], 1);
  assert.deepEqual(summary.unresolvedTokens, []);
  assert.match(fs.readFileSync(path.join(tempDir, "attachment_effect_alias_bridge.tsv"), "utf8"), /Hero019_B_Weapon_Buff/);
});
