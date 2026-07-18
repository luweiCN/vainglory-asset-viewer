#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSourcePath = "extracted/reports/definition_build_links.tsv";
const defaultBlockNeighborhoodPath = "extracted/reports/definition_block_neighborhood.tsv";
const defaultShadergraphPath = "extracted/reports/effect_shadergraph_material_manifest.tsv";
const defaultNativeEffectPath = "extracted/reports/native_effect_spawn_manifest.tsv";
const defaultNativeTokenOnlyPath = "extracted/reports/native_effect_token_only_callsite_audit.tsv";
const defaultViewerOut = "extracted/viewer/effect-projectile-definition-manifest.json";
const defaultTsvOut = "extracted/reports/effect_projectile_definition_manifest.tsv";
const defaultJsonOut = "extracted/reports/effect_projectile_definition_manifest_summary.json";
const PROJECTILE_EFFECT_PATTERN =
  /proj|projectile|missile|bullet|shot|bolt|rocket|cannon|shell|grenade|arrow|dart|mortar|orb|fireball|flare|ray|beam|laser/i;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function pipeValues(value) {
  return uniqueInOrder(String(value || "").split("|").filter(Boolean));
}

function isHeroSkinEffectLabel(label) {
  return /^[A-Za-z0-9]+_(?:DefaultSkin|Skin_[A-Za-z0-9_]+)$/.test(String(label || ""));
}

function normalizedKindredEffectLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function effectResourceRoot(relativePath) {
  return String(relativePath || "").match(/^Effects\/([^/]+)/)?.[1] || "";
}

function isKindredEffectLibraryLabelForResource(label, relativePath) {
  const labelKey = normalizedKindredEffectLabel(label);
  const rootKey = normalizedKindredEffectLabel(effectResourceRoot(relativePath));
  return Boolean(labelKey && rootKey && labelKey === rootKey);
}

function isProjectileDefinitionLabelForResource(label, relativePath) {
  return isHeroSkinEffectLabel(label) || isKindredEffectLibraryLabelForResource(label, relativePath);
}

function heroLabelForModelLabel(modelLabel) {
  return String(modelLabel || "").replace(/_(?:DefaultSkin|Skin_[A-Za-z0-9_]+)$/, "");
}

function isProjectileEffectPath(relativePath) {
  return PROJECTILE_EFFECT_PATTERN.test(String(relativePath || ""));
}

function inferProjectileActionKeys(relativePath) {
  const text = String(relativePath || "");
  const keys = new Set();
  if (/(^|[_/-])AA(?:[_/.-]|$)|DefaultAttack|BasicAttack/i.test(text)) keys.add("attack");
  if (/Crit/i.test(text)) keys.add("attack_crit");
  if (/(^|[_/-])A\d*(?:[_/.-]|$)|Ability01/i.test(text)) keys.add("ability01");
  if (/(^|[_/-])B\d*(?:[_/.-]|$)|Ability02/i.test(text)) keys.add("ability02");
  if (/(^|[_/-])C\d*(?:[_/.-]|$)|Ability03/i.test(text)) keys.add("ability03");
  if (!keys.size && isProjectileEffectPath(text)) keys.add("attack");
  return [...keys].sort();
}

function projectileRoleForPath(relativePath) {
  const text = String(relativePath || "");
  if (/impact|hit|explode|explosion|(?:^|[_/-])exp(?:[_/.-]|\d|$)|(?:^|[_/-])imp(?:[_/.-]|$)/i.test(text)) return "impact";
  if (/charging|charge|cast/i.test(text)) return "cast";
  return "projectile";
}

function isProjectileRelatedPathOrToken(value) {
  return (
    isProjectileEffectPath(value) ||
    /impact|hit|explode|explosion|(?:^|[_/-])exp(?:[_/.-]|\d|$)|(?:^|[_/-])imp(?:[_/.-]|$)/i.test(String(value || ""))
  );
}

function nativeProjectileEffectTokenSet(nativeEffectRows = []) {
  return new Set(
    (nativeEffectRows || [])
      .filter((row) => row.sourceKind === "native-effect-selector" && row.selectorOutputRole === "projectile")
      .map((row) => row.effectToken)
      .filter(Boolean),
  );
}

function projectileResourceStem(relativePath) {
  return String(relativePath || "")
    .split("/")
    .pop()
    .replace(/\.pfx$/i, "");
}

function stripProjectileStemSuffixes(stem) {
  const variants = [stem];
  const replacements = [
    [/_Exp_(\d+)$/i, "_$1"],
    [/_Projectile_Crit_Impact$/i, ""],
    [/_Proj_Crit_Impact$/i, ""],
    [/_Shot_Crit_Impact$/i, ""],
    [/_ProjectileImpact$/i, ""],
    [/ProjectileImpact$/i, ""],
    [/_ProjectileGround$/i, ""],
    [/ProjectileGround$/i, ""],
    [/_Exp$/i, ""],
    [/_Proj_Expl_Imp$/i, "_Projectile_Explosive"],
  ];
  for (const [pattern, replacement] of replacements) {
    const replaced = stem.replace(pattern, replacement);
    if (replaced !== stem) variants.push(replaced);
  }
  const suffixes = [
    /_Projectile_Hit(?:_Crit)?$/i,
    /_Projectile_Impact(?:_Crit)?$/i,
    /_Proj_Hit(?:_Crit)?$/i,
    /_Proj_Impact(?:_Crit)?$/i,
    /_Shot_Hit(?:_Crit)?$/i,
    /_Shot_Impact(?:_Crit)?$/i,
    /_Hit(?:_Crit)?$/i,
    /_Impact(?:_Crit)?$/i,
    /_Projectile(?:_Crit)?$/i,
    /_Proj(?:_Crit)?$/i,
    /_Shot(?:_Crit)?$/i,
    /_Shot_Proj(?:_Crit)?$/i,
    /_Explode$/i,
    /_Charging$/i,
  ];
  for (const suffix of suffixes) {
    const stripped = stem.replace(suffix, "");
    if (stripped !== stem) variants.push(stripped);
  }
  return variants;
}

function effectTokenCandidatesForProjectile(row) {
  const resourcePath = row.targetRelativePath || row.resourcePath || "";
  const modelLabel = row.label || row.modelLabel || "";
  const heroLabel = heroLabelForModelLabel(modelLabel);
  const stem = projectileResourceStem(resourcePath);
  const stemVariants = [stem];
  const heroCode = (resourcePath.match(/Hero\d{3}/i) || stem.match(/Hero\d{3}/i) || [])[0] || "";
  if (heroCode && heroLabel) stemVariants.push(stem.replace(new RegExp(heroCode, "gi"), heroLabel));
  if (
    !isHeroSkinEffectLabel(modelLabel) &&
    isKindredEffectLibraryLabelForResource(modelLabel, resourcePath) &&
    heroLabel &&
    stem &&
    !stem.toLowerCase().startsWith(`${heroLabel.toLowerCase()}_`)
  ) {
    stemVariants.push(`${effectResourceRoot(resourcePath) || heroLabel}_${stem}`);
  }

  const tokens = [];
  for (const stemVariant of stemVariants) {
    for (const candidateStem of stripProjectileStemSuffixes(stemVariant)) {
      if (candidateStem) tokens.push(`Effect_${candidateStem}`);
    }
  }
  return uniqueInOrder(tokens);
}

function projectileChainStemsForPath(relativePath) {
  const stem = projectileResourceStem(relativePath);
  return uniqueInOrder(stripProjectileStemSuffixes(stem)).sort((left, right) => left.length - right.length || left.localeCompare(right));
}

function projectileChainStemForPath(relativePath) {
  return projectileChainStemsForPath(relativePath)[0] || projectileResourceStem(relativePath);
}

function projectileChainKeyForItem(item) {
  const actionKey = item.actionKeys?.[0] || "";
  const stem = projectileChainStemForPath(item.resourcePath);
  return [item.modelLabel, actionKey, stem].filter(Boolean).join(":");
}

function projectileChainKeysForItem(item) {
  const actionKey = item.actionKeys?.[0] || "";
  return projectileChainStemsForPath(item.resourcePath).map((stem) => [item.modelLabel, actionKey, stem].filter(Boolean).join(":"));
}

function linkProjectileImpactPairs(items) {
  const groups = new Map();
  for (const item of items || []) {
    item.projectileChainKey = projectileChainKeyForItem(item);
    item.pairedProjectileResourcePaths = [];
    item.pairedImpactResourcePaths = [];
    for (const chainKey of projectileChainKeysForItem(item)) {
      if (!chainKey) continue;
      const group = groups.get(chainKey) || { projectiles: [], impacts: [] };
      if (item.role === "projectile") group.projectiles.push(item);
      if (item.role === "impact") group.impacts.push(item);
      groups.set(chainKey, group);
    }
  }

  for (const group of groups.values()) {
    if (!group.projectiles.length || !group.impacts.length) continue;
    const projectilePaths = uniqueSorted(group.projectiles.map((item) => item.resourcePath));
    const impactPaths = uniqueSorted(group.impacts.map((item) => item.resourcePath));
    for (const projectile of group.projectiles) projectile.pairedImpactResourcePaths = uniqueSorted([...projectile.pairedImpactResourcePaths, ...impactPaths]);
    for (const impact of group.impacts) impact.pairedProjectileResourcePaths = uniqueSorted([...impact.pairedProjectileResourcePaths, ...projectilePaths]);
  }
  return items.reduce((sum, item) => sum + (item.role === "projectile" ? item.pairedImpactResourcePaths.length : 0), 0);
}

function extractEffectTokens(row) {
  const text = ["labelBefore", "previousValue", "nextValue", "nearbyEffects"]
    .map((field) => row[field] || "")
    .join("\t");
  return uniqueInOrder([...text.matchAll(/Effect_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function effectTokenHeroCandidate(effectToken) {
  const firstPart = String(effectToken || "")
    .replace(/^Effect_/i, "")
    .split("_")
    .find(Boolean);
  return firstPart || "";
}

function modelLabelForShadergraphResource(resourcePath, effectTokens) {
  const root = effectResourceRoot(resourcePath);
  const tokenHero = uniqueInOrder((effectTokens || []).map(effectTokenHeroCandidate)).find(Boolean) || "";
  if (/^Hero\d{3}$/i.test(root) && tokenHero && !/^Hero\d{3}$/i.test(tokenHero)) return tokenHero;
  if (/^(?:5V5|Items|Common|Status)$/i.test(root)) return tokenHero || root;
  return root || tokenHero;
}

function actionKeysForShadergraphResource(resourcePath, effectTokens) {
  return uniqueSorted([
    ...inferProjectileActionKeys(resourcePath),
    ...(effectTokens || []).flatMap(inferProjectileActionKeys),
  ]);
}

function mergeShadergraphProjectileResource(itemsByPath, row, nativeProjectileTokens = new Set()) {
  const effectTokens = pipeValues(row.hookEffectTokens);
  if (!effectTokens.length) return;
  for (const resourcePath of pipeValues(row.pfxPaths)) {
    const hasNativeProjectileToken = effectTokens.some((effectToken) => nativeProjectileTokens.has(effectToken));
    if (!resourcePath || (!hasNativeProjectileToken && !isProjectileRelatedPathOrToken(`${resourcePath}|${effectTokens.join("|")}`))) {
      continue;
    }
    const existing = itemsByPath.get(resourcePath) || {
      id: `shadergraph-projectile:${resourcePath}`,
      sourceKind: "shadergraph-projectile-resource",
      sourceDefinitionPath: defaultShadergraphPath,
      modelLabel: "",
      heroLabel: "",
      role: projectileRoleForPath(`${resourcePath}|${effectTokens.join("|")}`),
      actionKeys: [],
      resourcePath,
      resourceHash: "",
      firstStringIndex: "",
      effectTokens: [],
      boneToken: "",
      bindToken: "",
      boneEvidence: "",
      boneDefinitionPath: "",
      boneEffectToken: "",
      nearbyBones: "",
      pairedProjectileResourcePaths: [],
      pairedImpactResourcePaths: [],
    };
    existing.effectTokens = uniqueInOrder([...existing.effectTokens, ...effectTokens]);
    existing.actionKeys = actionKeysForShadergraphResource(resourcePath, existing.effectTokens);
    existing.modelLabel = existing.modelLabel || modelLabelForShadergraphResource(resourcePath, existing.effectTokens);
    existing.heroLabel = existing.heroLabel || heroLabelForModelLabel(existing.modelLabel);
    itemsByPath.set(resourcePath, existing);
  }
}

function shadergraphProjectileItems(shadergraphRows = [], nativeEffectRows = []) {
  const itemsByPath = new Map();
  const nativeProjectileTokens = nativeProjectileEffectTokenSet(nativeEffectRows);
  for (const row of shadergraphRows || []) mergeShadergraphProjectileResource(itemsByPath, row, nativeProjectileTokens);
  return [...itemsByPath.values()];
}

function nativeTokenHashProjectileItems(nativeTokenOnlyRows = [], nativeEffectRows = []) {
  const nativeProjectileTokens = nativeProjectileEffectTokenSet(nativeEffectRows);
  const items = [];
  const seen = new Set();
  for (const row of nativeTokenOnlyRows || []) {
    const effectToken = row.effectToken || "";
    if (!nativeProjectileTokens.has(effectToken)) continue;
    if (row.kindredHashLookupState !== "exact-kindred-effects-hash-resource") continue;
    for (const resourcePath of pipeValues(row.kindredHashResourcePaths)) {
      const key = `${effectToken}\t${resourcePath}`;
      if (!resourcePath || seen.has(key)) continue;
      seen.add(key);
      const effectTokens = [effectToken];
      const modelLabel = modelLabelForShadergraphResource(resourcePath, effectTokens);
      items.push({
        id: `native-token-hash-projectile:${effectToken}:${resourcePath}`,
        sourceKind: "native-token-hash-projectile-resource",
        sourceDefinitionPath: defaultNativeTokenOnlyPath,
        modelLabel,
        heroLabel: heroLabelForModelLabel(modelLabel),
        role: projectileRoleForPath(`${resourcePath}|${effectToken}`),
        actionKeys: actionKeysForShadergraphResource(resourcePath, effectTokens),
        resourcePath,
        resourceHash: "",
        firstStringIndex: "",
        effectTokens,
        boneToken: "",
        bindToken: "",
        boneEvidence: "",
        boneDefinitionPath: "",
        boneEffectToken: "",
        nearbyBones: "",
        pairedProjectileResourcePaths: [],
        pairedImpactResourcePaths: [],
      });
    }
  }
  return items;
}

function buildDefinitionProjectileBoneHintLookup(blockNeighborhoodRows = []) {
  const lookup = new Map();
  for (const row of blockNeighborhoodRows || []) {
    if (!row.directBoneSlot || !String(row.neighborhoodEvidence || "").includes("bone-slot")) continue;
    for (const effectToken of extractEffectTokens(row)) {
      if (lookup.has(effectToken)) continue;
      lookup.set(effectToken, {
        effectToken,
        boneToken: row.directBoneSlot,
        bindToken: row.bindToken || "",
        boneDefinitionPath: row.relativePath || "",
        nearbyBones: row.nearbyBones || "",
        boneEvidence: "definition-block-neighborhood",
      });
    }
  }
  return lookup;
}

function boneHintForProjectile(row, boneHintsByEffectToken) {
  for (const effectToken of effectTokenCandidatesForProjectile(row)) {
    const hint = boneHintsByEffectToken.get(effectToken);
    if (hint) return hint;
  }
  return null;
}

function buildEffectProjectileDefinitionManifest(
  rows,
  generatedAt = new Date().toISOString(),
  { blockNeighborhoodRows = [], shadergraphRows = [], nativeEffectRows = [], nativeTokenOnlyRows = [] } = {},
) {
  const items = [];
  const seen = new Set();
  const boneHintsByEffectToken = buildDefinitionProjectileBoneHintLookup(blockNeighborhoodRows);

  for (const row of rows || []) {
    if (row.sourceRelativePath !== "Effects/KindredEffects.def") continue;
    if (row.category !== "effect") continue;
    if (row.matched && row.matched !== "yes") continue;
    if (!isProjectileDefinitionLabelForResource(row.label, row.targetRelativePath)) continue;
    if (!isProjectileEffectPath(row.targetRelativePath)) continue;

    const key = `${row.label}\t${row.targetRelativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const effectTokens = effectTokenCandidatesForProjectile(row);
    const boneHint = boneHintForProjectile(row, boneHintsByEffectToken);
    items.push({
      id: `definition-projectile:${row.label}:${row.targetRelativePath}`,
      sourceKind: "definition-projectile-resource",
      sourceDefinitionPath: row.sourceRelativePath,
      modelLabel: row.label,
      heroLabel: heroLabelForModelLabel(row.label),
      role: projectileRoleForPath(row.targetRelativePath),
      actionKeys: inferProjectileActionKeys(row.targetRelativePath),
      resourcePath: row.targetRelativePath,
      resourceHash: row.targetHash || "",
      firstStringIndex: row.firstStringIndex || "",
      effectTokens,
      boneToken: boneHint?.boneToken || "",
      bindToken: boneHint?.bindToken || "",
      boneEvidence: boneHint?.boneEvidence || "",
      boneDefinitionPath: boneHint?.boneDefinitionPath || "",
      boneEffectToken: boneHint?.effectToken || "",
      nearbyBones: boneHint?.nearbyBones || "",
    });
  }

  for (const item of shadergraphProjectileItems(shadergraphRows, nativeEffectRows)) {
    const key = `${item.sourceKind}\t${item.resourcePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  for (const item of nativeTokenHashProjectileItems(nativeTokenOnlyRows, nativeEffectRows)) {
    const key = `${item.sourceKind}\t${item.resourcePath}\t${item.effectTokens.join("|")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  linkProjectileImpactPairs(items);

  items.sort((left, right) => {
    const labelOrder = left.modelLabel.localeCompare(right.modelLabel);
    if (labelOrder) return labelOrder;
    return left.resourcePath.localeCompare(right.resourcePath);
  });

  return {
    generatedAt,
    source: {
      sourcePath: defaultSourcePath,
      blockNeighborhoodPath: defaultBlockNeighborhoodPath,
      shadergraphPath: defaultShadergraphPath,
      nativeEffectPath: defaultNativeEffectPath,
      nativeTokenOnlyPath: defaultNativeTokenOnlyPath,
    },
    summary: summarize(items),
    items,
  };
}

function summarize(items) {
  const byRole = {};
  const byActionKey = {};
  let projectileImpactPairs = 0;
  for (const item of items || []) {
    byRole[item.role] = (byRole[item.role] || 0) + 1;
    for (const actionKey of item.actionKeys || []) byActionKey[actionKey] = (byActionKey[actionKey] || 0) + 1;
    if (item.role === "projectile") projectileImpactPairs += item.pairedImpactResourcePaths?.length || 0;
  }
  return {
    rows: items.length,
    modelLabels: uniqueSorted(items.map((item) => item.modelLabel)).length,
    heroLabels: uniqueSorted(items.map((item) => item.heroLabel)).length,
    resourcePaths: uniqueSorted(items.map((item) => item.resourcePath)).length,
    boneHintRows: items.filter((item) => item.boneToken).length,
    projectileImpactPairs,
    byRole,
    byActionKey,
  };
}

function reportRowsForManifest(manifest) {
  return manifest.items.map((item) => ({
    sourceKind: item.sourceKind,
    sourceDefinitionPath: item.sourceDefinitionPath,
    modelLabel: item.modelLabel,
    heroLabel: item.heroLabel,
    role: item.role,
    actionKeys: item.actionKeys.join("|"),
    effectTokens: item.effectTokens.join("|"),
    resourcePath: item.resourcePath,
    resourceHash: item.resourceHash,
    projectileChainKey: item.projectileChainKey,
    pairedProjectileResourcePaths: item.pairedProjectileResourcePaths.join("|"),
    pairedImpactResourcePaths: item.pairedImpactResourcePaths.join("|"),
    firstStringIndex: item.firstStringIndex,
    boneToken: item.boneToken,
    bindToken: item.bindToken,
    boneEvidence: item.boneEvidence,
    boneDefinitionPath: item.boneDefinitionPath,
    boneEffectToken: item.boneEffectToken,
    nearbyBones: item.nearbyBones,
  }));
}

function exportEffectProjectileDefinitionManifest({
  sourcePath = defaultSourcePath,
  blockNeighborhoodPath = defaultBlockNeighborhoodPath,
  shadergraphPath = defaultShadergraphPath,
  nativeEffectPath = defaultNativeEffectPath,
  nativeTokenOnlyPath = defaultNativeTokenOnlyPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const blockNeighborhoodRows = blockNeighborhoodPath && fs.existsSync(blockNeighborhoodPath) ? readTsv(blockNeighborhoodPath) : [];
  const shadergraphRows = shadergraphPath && fs.existsSync(shadergraphPath) ? readTsv(shadergraphPath) : [];
  const nativeEffectRows = nativeEffectPath && fs.existsSync(nativeEffectPath) ? readTsv(nativeEffectPath) : [];
  const nativeTokenOnlyRows = nativeTokenOnlyPath && fs.existsSync(nativeTokenOnlyPath) ? readTsv(nativeTokenOnlyPath) : [];
  const manifest = buildEffectProjectileDefinitionManifest(readTsv(sourcePath), generatedAt, {
    blockNeighborhoodRows,
    shadergraphRows,
    nativeEffectRows,
    nativeTokenOnlyRows,
  });
  manifest.source = {
    sourcePath,
    blockNeighborhoodPath: blockNeighborhoodRows.length ? blockNeighborhoodPath : "",
    shadergraphPath: shadergraphRows.length ? shadergraphPath : "",
    nativeEffectPath: nativeEffectRows.length ? nativeEffectPath : "",
    nativeTokenOnlyPath: nativeTokenOnlyRows.length ? nativeTokenOnlyPath : "",
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "sourceKind",
    "sourceDefinitionPath",
    "modelLabel",
    "heroLabel",
    "role",
    "actionKeys",
    "effectTokens",
    "resourcePath",
    "resourceHash",
    "projectileChainKey",
    "pairedProjectileResourcePaths",
    "pairedImpactResourcePaths",
    "firstStringIndex",
    "boneToken",
    "bindToken",
    "boneEvidence",
    "boneDefinitionPath",
    "boneEffectToken",
    "nearbyBones",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportEffectProjectileDefinitionManifest({
    sourcePath: optionValue(args, "--source", defaultSourcePath),
    blockNeighborhoodPath: optionValue(args, "--block-neighborhood", defaultBlockNeighborhoodPath),
    shadergraphPath: optionValue(args, "--shadergraphs", defaultShadergraphPath),
    nativeEffectPath: optionValue(args, "--native-effects", defaultNativeEffectPath),
    nativeTokenOnlyPath: optionValue(args, "--native-token-only", defaultNativeTokenOnlyPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionProjectileBoneHintLookup,
  buildEffectProjectileDefinitionManifest,
  effectTokenCandidatesForProjectile,
  exportEffectProjectileDefinitionManifest,
  inferProjectileActionKeys,
  isHeroSkinEffectLabel,
  isKindredEffectLibraryLabelForResource,
  isProjectileEffectPath,
  isProjectileDefinitionLabelForResource,
  linkProjectileImpactPairs,
  projectileChainKeyForItem,
  projectileChainKeysForItem,
  projectileRoleForPath,
  reportRowsForManifest,
  summarize,
};
