#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSkinCatalogPath = "extracted/viewer/skin-catalog.json";
const defaultSkinManifestPath = "extracted/viewer/skin-glb-pbr-manifest.json";
const defaultSkinnedManifestPath = "extracted/viewer/skinned-glb-pbr-manifest.json";
const defaultAllPbrManifestPath = "extracted/viewer/all-glb-pbr-manifest.json";
const defaultSkinVariantAliasPath = "extracted/viewer/runtime-skin-variant-aliases.json";
const defaultRuntimeGraphPath = "extracted/viewer/runtime-skin-graph.json";
const defaultRuntimeObjectGraphPath = "extracted/viewer/runtime-object-graph.json";
const defaultRuntimeBindingConfigPath = "extracted/viewer/runtime-binding-config.json";
const defaultAnimationBindingPath = "extracted/viewer/skin-animation-bindings.json";
const defaultPfxManifestPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultEffectHookManifestPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultShadergraphManifestPath = "extracted/viewer/effect-shadergraph-material-manifest.json";
const defaultTimelineManifestPath = "extracted/viewer/native-runtime-timeline-manifest.json";
const defaultGlbMaterialCoveragePath = "extracted/viewer/glb-material-coverage.json";
const defaultTsvOut = "extracted/reports/runtime_resource_completeness.tsv";
const defaultJsonOut = "extracted/reports/runtime_resource_completeness_summary.json";
const defaultViewerOut = "extracted/viewer/runtime-resource-completeness.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readManifestItems(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const manifest = readJson(filePath);
  return Array.isArray(manifest) ? manifest : manifest.items || [];
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

function splitIssueText(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "ok");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJoin(values) {
  return unique(values).join("|");
}

function normalizeKey(value) {
  return String(value || "").toLowerCase();
}

function byModelLabel(items) {
  const map = new Map();
  for (const item of items || []) {
    const label = item.modelLabel || item.variant;
    if (!label) continue;
    const key = normalizeKey(label);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

function byModelLabelAll(items) {
  const map = new Map();
  for (const item of items || []) {
    const label = item.modelLabel || item.variant;
    if (!label) continue;
    const key = normalizeKey(label);
    const rows = map.get(key) || [];
    rows.push(item);
    map.set(key, rows);
  }
  return map;
}

function preferredManifestItem(items, runtimeGraphItem) {
  const rows = (items || []).filter(Boolean);
  if (!rows.length) return null;
  if (runtimeGraphItem?.sourceRelativePath) {
    const sourceMatch = rows.find((item) => item.sourceRelativePath === runtimeGraphItem.sourceRelativePath);
    if (sourceMatch) return sourceMatch;
  }
  return rows
    .slice()
    .sort((left, right) => {
      const leftScore = (left.skeletons?.length ? 4 : 0) + (Number(left.sameLabelAnimationCount || 0) > 0 ? 2 : 0);
      const rightScore = (right.skeletons?.length ? 4 : 0) + (Number(right.sameLabelAnimationCount || 0) > 0 ? 2 : 0);
      return rightScore - leftScore;
    })[0];
}

function byRel(items) {
  const map = new Map();
  for (const item of items || []) {
    if (item.rel && !map.has(item.rel)) map.set(item.rel, item);
  }
  return map;
}

function skinManifestRelItems(items) {
  return (items || []).filter((item) => /_DefaultSkin$|_Skin_/i.test(item.modelLabel || ""));
}

function buildSkinVariantAliasLookup(items) {
  const map = new Map();
  for (const item of items || []) {
    if (!item.skinId) continue;
    const key = normalizeKey(item.skinId);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

function aliasedManifestItem(alias, itemIndexes) {
  if (!alias) return null;
  const base =
    itemIndexes.byLabel.get(normalizeKey(alias.baseModelLabel || "")) ||
    itemIndexes.byRel.get(alias.rel || "") ||
    null;
  if (!base) return null;
  return {
    ...base,
    modelLabel: alias.skinId,
    variant: alias.skinId,
    aliasOfModelLabel: alias.baseModelLabel || base.modelLabel || base.variant || "",
    aliasEvidence: alias.evidence || "",
    sourceRelativePath: alias.sourceRelativePath || base.sourceRelativePath || "",
    materialCount: alias.materialCount === "" || alias.materialCount == null ? base.materialCount : alias.materialCount,
    texturedMaterialCount:
      alias.texturedMaterialCount === "" || alias.texturedMaterialCount == null
        ? base.texturedMaterialCount
        : alias.texturedMaterialCount,
  };
}

function skinPrefixFromId(skinId) {
  const id = String(skinId || "");
  return id.replace(/_DefaultSkin$/i, "").replace(/_Skin_.+$/i, "");
}

function sourceCharacterFromPath(sourceRelativePath) {
  return String(sourceRelativePath || "").match(/^Characters\/([^/]+)\//)?.[1] || "";
}

function sourceHeroNameFromPath(sourceRelativePath) {
  return path.basename(String(sourceRelativePath || ""), ".def");
}

function issueText(issues) {
  return issues.length ? unique(issues).join("|") : "ok";
}

function materialIssues(item) {
  const issues = [];
  if (!item) return issues;
  const materialCount = Number(item.materialCount || 0);
  const texturedMaterialCount = Number(item.texturedMaterialCount || 0);
  if (materialCount > 0 && texturedMaterialCount <= 0) issues.push("no-basecolor-texture");
  else if (materialCount > 0 && texturedMaterialCount < materialCount) issues.push("partial-basecolor-texture");
  return issues;
}

function buildGlbMaterialCoverageLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item.rel) continue;
    const rows = lookup.get(item.rel) || [];
    rows.push(item);
    lookup.set(item.rel, rows);
  }
  return lookup;
}

function buildRuntimeObjectGraphLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    if (!item.rel) continue;
    const rows = lookup.get(item.rel) || [];
    rows.push(item);
    lookup.set(item.rel, rows);
  }
  return lookup;
}

function buildRuntimeBindingConfigLookup(items) {
  const byRelLabel = new Map();
  const byRel = new Map();
  const byLabel = new Map();
  for (const item of items || []) {
    if (item.rel && item.modelLabel) byRelLabel.set(`${item.rel}\t${item.modelLabel}`, item);
    if (item.rel && !byRel.has(item.rel)) byRel.set(item.rel, item);
    if (item.modelLabel && !byLabel.has(normalizeKey(item.modelLabel))) byLabel.set(normalizeKey(item.modelLabel), item);
  }
  return { byRelLabel, byRel, byLabel };
}

function runtimeBindingConfigItemFor({ skinId, skinItem, skinnedItem, runtimeGraphItem, indexes }) {
  const rel = skinItem?.rel || skinnedItem?.rel || runtimeGraphItem?.rel || "";
  return (
    indexes.runtimeBindingConfig.byRelLabel.get(`${rel}\t${skinId}`) ||
    indexes.runtimeBindingConfig.byRelLabel.get(`${rel}\t${runtimeGraphItem?.modelLabel || ""}`) ||
    indexes.runtimeBindingConfig.byLabel.get(normalizeKey(skinId)) ||
    indexes.runtimeBindingConfig.byLabel.get(normalizeKey(runtimeGraphItem?.modelLabel || "")) ||
    indexes.runtimeBindingConfig.byRel.get(rel) ||
    null
  );
}

function runtimeBindingStats(runtimeGraphItem, runtimeBindingItem) {
  const graphSlots = runtimeGraphItem?.bindSlots || [];
  const unresolvedSlots = graphSlots.filter((slot) => slot.hashResolved === false || slot.resolvedBoneIndex == null);
  const configSlots = runtimeBindingItem?.slots || [];
  const configBySlot = new Map();
  for (const slot of configSlots) {
    configBySlot.set(`${slot.slotName || ""}\t${slot.bindToken || ""}`, slot);
  }
  const runtimeBindingKinds = uniqueJoin(configSlots.map((slot) => slot.bindingKind));

  if (!unresolvedSlots.length) {
    return { runtimeBindingGapCount: 0, runtimeBindingKinds };
  }
  if (!runtimeBindingItem) {
    return { runtimeBindingGapCount: unresolvedSlots.length, runtimeBindingKinds };
  }

  let runtimeBindingGapCount = 0;
  for (const slot of unresolvedSlots) {
    const config = configBySlot.get(`${slot.slotName || ""}\t${slot.bindToken || ""}`);
    if (!config?.bindingKind || config.bindingKind === "unresolved") runtimeBindingGapCount += 1;
  }
  return { runtimeBindingGapCount, runtimeBindingKinds };
}

function runtimeObjectKinds(rows) {
  return uniqueJoin((rows || []).map((row) => row.objectKind));
}

function runtimeObjectSourcePaths(rows) {
  return uniqueJoin((rows || []).map((row) => row.sourceRelativePath));
}

function runtimeObjectResourceKeys(rows) {
  return uniqueJoin(
    (rows || []).flatMap((row) => [
      row.variant,
      row.character,
      row.objectKind,
      ...(row.ownerLabels || []),
      ...(row.objectLabels || []),
      ...(row.abilityLabels || []),
    ]),
  );
}

function glbMaterialCoverageClasses(rows) {
  return uniqueJoin((rows || []).map((row) => row.coverageClass));
}

function glbMaterialIssues(rows) {
  const coverageRows = rows || [];
  if (!coverageRows.length) return [];
  const issues = [];
  if (coverageRows.some((row) => row.coverageClass === "missing-glb")) issues.push("missing-glb-material-coverage");
  if (coverageRows.some((row) => row.coverageClass === "no-materials")) issues.push("no-materials");
  if (coverageRows.some((row) => row.coverageClass === "pale-color-only" || row.looksPale === "yes")) {
    issues.push("pale-color-only-material");
  }
  return issues;
}

function classifyUnlinkedCharacterModel(item) {
  const rel = item.rel || "";
  const variant = item.variant || item.modelLabel || "";
  if (/^Characters\/Attachments\//.test(rel)) return "attachment";
  if (/\/Art(?:Trap|Wall|Goop|Tornado|Shield|Blade|Spirit|Arena|Zombie|Cloth)\//i.test(rel)) return "runtime-prop-candidate";
  if (/Trap|Wall|Goop|Tornado|Shield|Blade|Spirit|Zombie|Minion|Turret|Pet|Ball|Arena/i.test(variant)) {
    return "runtime-prop-candidate";
  }
  if (/^Characters\/(?:Cards|CardsChest|Coins|JoystickIndicator|GuildBanners|Gold|Minion|Turret|Kraken|Jungle)/.test(rel)) {
    return "non-hero-character-asset";
  }
  return "unlinked-character-model";
}

function resourceKeysForSkin(skinId, skinItem, skinnedItem, runtimeGraphItem) {
  const items = [skinItem, skinnedItem, runtimeGraphItem].filter(Boolean);
  const keys = new Set([skinPrefixFromId(skinId)]);
  for (const item of items) {
    keys.add(item.character);
    keys.add(sourceCharacterFromPath(item.sourceRelativePath));
    keys.add(sourceHeroNameFromPath(item.sourceRelativePath));
    const labelPrefix = skinPrefixFromId(item.modelLabel || item.variant || "");
    keys.add(labelPrefix);
  }
  return [...keys].filter((key) => key && key.length >= 3);
}

function pathTokens(relativePath) {
  return String(relativePath || "")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function buildPfxKeyIndex(pfxItems) {
  const index = new Map();
  for (const item of pfxItems || []) {
    for (const token of pathTokens(item.relativePath)) {
      const key = normalizeKey(token);
      const rows = index.get(key) || [];
      rows.push(item);
      index.set(key, rows);
    }
  }
  return index;
}

function buildPfxPathLookup(pfxItems) {
  const index = new Map();
  for (const item of pfxItems || []) {
    if (item.relativePath) index.set(item.relativePath, item);
  }
  return index;
}

function effectHookKeys(item) {
  return unique([
    ...(item.heroCodes || []),
    ...pathTokens(item.effectToken || item.token),
    ...pathTokens(item.primaryAbilityContext?.definitionPath),
    ...(item.abilityContexts || []).flatMap((context) => pathTokens(context.definitionPath)),
    ...(item.resourcePaths || []).flatMap((relativePath) => pathTokens(relativePath)),
  ]);
}

function buildEffectHookKeyIndex(effectHookItems) {
  const index = new Map();
  for (const item of effectHookItems || []) {
    if (!(item.resourcePaths || []).length) continue;
    for (const token of effectHookKeys(item)) {
      const key = normalizeKey(token);
      const rows = index.get(key) || [];
      rows.push(item);
      index.set(key, rows);
    }
  }
  return index;
}

function buildTimelineKeyIndex(timelineItems) {
  const index = new Map();
  for (const item of timelineItems || []) {
    const keys = [...(item.heroNames || []), ...pathTokens(item.effectToken), ...pathTokens(item.sourceLine)];
    for (const key of keys) {
      const normalized = normalizeKey(key);
      const rows = index.get(normalized) || [];
      rows.push(item);
      index.set(normalized, rows);
    }
  }
  return index;
}

function shadergraphPathsForPfx(pfxItem) {
  const paths = new Set();
  for (const reference of pfxItem?.references || []) {
    if (reference.kind === "shadergraph" && reference.relativePath) paths.add(reference.relativePath);
  }
  for (const record of pfxItem?.surfaceRecords || []) {
    if (record.relativePath) paths.add(record.relativePath);
  }
  return [...paths];
}

function buildShadergraphLookup(shadergraphItems) {
  const byPath = new Map();
  const byPfx = new Map();
  for (const item of shadergraphItems || []) {
    if (item.relativePath) byPath.set(item.relativePath, item);
    for (const pfxPath of item.pfxPaths || []) {
      const rows = byPfx.get(pfxPath) || [];
      rows.push(item);
      byPfx.set(pfxPath, rows);
    }
  }
  return { byPath, byPfx };
}

function rowsForKeys(index, keys) {
  const rows = [];
  const seen = new Set();
  for (const key of keys) {
    for (const row of index.get(normalizeKey(key)) || []) {
      const id = row.relativePath || row.id || row.effectToken || `${row.sourceFile || ""}:${row.line || ""}:${row.eventKind || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  return rows;
}

function pfxItemsForEffectHooks(effectHookRows, pfxByPath) {
  const rows = [];
  const seen = new Set();
  for (const hook of effectHookRows || []) {
    for (const relativePath of hook.resourcePaths || []) {
      const item = pfxByPath.get(relativePath);
      if (!item?.relativePath || seen.has(item.relativePath)) continue;
      seen.add(item.relativePath);
      rows.push(item);
    }
  }
  return rows;
}

function uniquePfxRows(rows) {
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row?.relativePath || seen.has(row.relativePath)) continue;
    seen.add(row.relativePath);
    uniqueRows.push(row);
  }
  return uniqueRows;
}

function shadergraphsForPfxItems(pfxItems, shadergraphLookup) {
  const rows = [];
  const seen = new Set();
  for (const pfxItem of pfxItems || []) {
    const direct = shadergraphLookup.byPfx.get(pfxItem.relativePath) || [];
    const fromRefs = shadergraphPathsForPfx(pfxItem)
      .map((shaderPath) => shadergraphLookup.byPath.get(shaderPath))
      .filter(Boolean);
    for (const item of [...direct, ...fromRefs]) {
      if (!item.relativePath || seen.has(item.relativePath)) continue;
      seen.add(item.relativePath);
      rows.push(item);
    }
  }
  return rows;
}

function shadergraphHasMaterialGap(item) {
  const status = item?.materialStatus || "";
  return !status || status === "unknown" || status === "unclassified";
}

function runtimeGraphLookup(items) {
  const byLabel = byModelLabel(items);
  const relMap = byRel(items);
  return { byLabel, byRel: relMap };
}

function buildAnimationBindingLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    const keys = [
      item.modelLabel,
      item.rel,
      `${item.rel || ""}\t${item.sourceRelativePath || ""}\t${item.modelLabel || ""}`,
      `${item.rel || ""}\t${item.sourceRelativePath || ""}\t`,
    ].filter(Boolean);
    for (const key of keys) {
      if (!lookup.has(key)) lookup.set(key, item);
    }
  }
  return lookup;
}

function animationBindingItemFor({ skinId, skinItem, skinnedItem, indexes }) {
  const rel = skinItem?.rel || skinnedItem?.rel || "";
  const sourceRelativePath = skinItem?.sourceRelativePath || skinnedItem?.sourceRelativePath || "";
  return (
    indexes.animationBindingByKey.get(`${rel}\t${sourceRelativePath}\t${skinId}`) ||
    indexes.animationBindingByKey.get(`${rel}\t${sourceRelativePath}\t`) ||
    indexes.animationBindingByKey.get(skinId) ||
    indexes.animationBindingByKey.get(normalizeKey(skinId)) ||
    indexes.animationBindingByKey.get(rel) ||
    null
  );
}

function compatibleAnimationCount(bindingItem) {
  return (bindingItem?.animations || []).filter((animation) => animation.trackMatchesSkeleton === true).length;
}

function runtimeGraphItemFor({ skinId, skinItem, skinnedItem, runtimeGraph }) {
  const labelKey = normalizeKey(skinId);
  return (
    runtimeGraph.byLabel.get(labelKey) ||
    runtimeGraph.byRel.get(skinItem?.rel || "") ||
    runtimeGraph.byRel.get(skinnedItem?.rel || "") ||
    null
  );
}

function bindSlotStats(runtimeGraphItem) {
  const slots = runtimeGraphItem?.bindSlots || [];
  return {
    bindSlotCount: slots.length,
    unresolvedBindSlotCount: slots.filter((slot) => slot.hashResolved === false || slot.resolvedBoneIndex == null).length,
  };
}

function isKnownEffectlessCharacter({ skinId, sourceRelativePath }) {
  return /^Hero999(?:_|$)/.test(String(skinId || "")) && sourceRelativePath === "Characters/Hero999/Hero999.def";
}

function skinCatalogRows({ skinCatalog, indexes }) {
  const rows = [];
  for (const [skinId, entry] of Object.entries(skinCatalog.skins || {})) {
    const alias = indexes.skinVariantAliasBySkinId.get(normalizeKey(skinId)) || null;
    const exactSkinItems = indexes.skinByLabelAll.get(normalizeKey(skinId)) || [];
    const exactSkinnedItems = indexes.skinnedByLabelAll.get(normalizeKey(skinId)) || [];
    const preliminarySkinItem = preferredManifestItem(exactSkinItems, null);
    const preliminarySkinnedItem = preferredManifestItem(exactSkinnedItems, null);
    const preliminaryRuntimeGraphItem = runtimeGraphItemFor({
      skinId,
      skinItem: preliminarySkinItem,
      skinnedItem: preliminarySkinnedItem,
      runtimeGraph: indexes.runtimeGraph,
    });
    const exactSkinItem = preferredManifestItem(exactSkinItems, preliminaryRuntimeGraphItem);
    const exactSkinnedItem = preferredManifestItem(exactSkinnedItems, preliminaryRuntimeGraphItem);
    const aliasSkinItem = exactSkinItem ? null : aliasedManifestItem(alias, indexes.skinItems);
    const aliasSkinnedItem = exactSkinnedItem ? null : aliasedManifestItem(alias, indexes.skinnedItems);
    const skinItem = exactSkinItem || aliasSkinItem;
    const skinnedItem = exactSkinnedItem || aliasSkinnedItem;
    const allPbrItem = indexes.allByRel.get(skinItem?.rel || skinnedItem?.rel || "") || null;
    const runtimeGraphItem = runtimeGraphItemFor({ skinId, skinItem, skinnedItem, runtimeGraph: indexes.runtimeGraph });
    const animationBindingItem = animationBindingItemFor({ skinId, skinItem, skinnedItem, indexes });
    const runtimeBindingItem = runtimeBindingConfigItemFor({ skinId, skinItem, skinnedItem, runtimeGraphItem, indexes });
    const compatibleAnimations = compatibleAnimationCount(animationBindingItem);
    const materialItem = skinnedItem || skinItem || allPbrItem;
    const glbCoverageRows = indexes.glbMaterialCoverageByRel.get(skinItem?.rel || skinnedItem?.rel || "") || [];
    const resourceKeys = resourceKeysForSkin(skinId, skinItem, skinnedItem, runtimeGraphItem);
    const directPfxRows = rowsForKeys(indexes.pfxByKey, resourceKeys);
    const effectHookRows = rowsForKeys(indexes.effectHookByKey, resourceKeys);
    const effectHookPfxRows = pfxItemsForEffectHooks(effectHookRows, indexes.pfxByPath);
    const pfxRows = uniquePfxRows([...directPfxRows, ...effectHookPfxRows]);
    const shaderRows = shadergraphsForPfxItems(pfxRows, indexes.shadergraphLookup);
    const timelineRows = rowsForKeys(indexes.timelineByKey, resourceKeys);
    const bindStats = bindSlotStats(runtimeGraphItem);
    const bindingStats = runtimeBindingStats(runtimeGraphItem, runtimeBindingItem);
    const sourceRelativePath =
      skinItem?.sourceRelativePath || skinnedItem?.sourceRelativePath || runtimeGraphItem?.sourceRelativePath || "";
    const knownEffectlessCharacter = isKnownEffectlessCharacter({ skinId, sourceRelativePath });
    const issues = [];

    if (!skinItem) issues.push("missing-skin-preview-glb");
    if (!skinnedItem) issues.push("missing-skinned-runtime-glb");
    if (!runtimeGraphItem) issues.push("missing-runtime-graph");
    if (!pfxRows.length && !knownEffectlessCharacter) issues.push("no-effect-pfx-for-character");
    if (!timelineRows.length && !knownEffectlessCharacter) issues.push("no-native-runtime-timeline");
    if (bindingStats.runtimeBindingGapCount) issues.push("unresolved-runtime-bind-slot");
    issues.push(...(glbCoverageRows.length ? glbMaterialIssues(glbCoverageRows) : materialIssues(materialItem)));
    if (Number(skinItem?.sameLabelAnimationCount || skinnedItem?.sameLabelAnimationCount || 0) <= 0 && compatibleAnimations <= 0) {
      issues.push("no-same-label-animation");
    }
    if (shaderRows.some(shadergraphHasMaterialGap)) issues.push("unclassified-effect-shadergraph");

    rows.push({
      sourceKind: "skin-catalog",
      assetClass: "hero-skin",
      skinId,
      fallbackLabel: entry.fallbackLabel || "",
      zhCN: entry.zhCN || "",
      rel: skinItem?.rel || skinnedItem?.rel || "",
      aliasOfModelLabel: skinItem?.aliasOfModelLabel || skinnedItem?.aliasOfModelLabel || "",
      aliasEvidence: skinItem?.aliasEvidence || skinnedItem?.aliasEvidence || "",
      character: skinItem?.character || skinnedItem?.character || sourceCharacterFromPath(runtimeGraphItem?.sourceRelativePath) || "",
      sourceRelativePath,
      inSkinPreviewManifest: exactSkinItem ? "yes" : aliasSkinItem ? "alias" : "no",
      inSkinnedManifest: exactSkinnedItem ? "yes" : aliasSkinnedItem ? "alias" : "no",
      inAllPbrManifest: allPbrItem ? "yes" : "no",
      inRuntimeGraph: runtimeGraphItem ? "yes" : "no",
      materialCount: materialItem?.materialCount ?? "",
      texturedMaterialCount: materialItem?.texturedMaterialCount ?? "",
      glbMaterialCoverageClasses: glbMaterialCoverageClasses(glbCoverageRows),
      sameLabelAnimationCount: skinItem?.sameLabelAnimationCount ?? skinnedItem?.sameLabelAnimationCount ?? "",
      animationBindingCount: animationBindingItem?.animations?.length ?? "",
      compatibleAnimationCount: compatibleAnimations || "",
      bindSlotCount: bindStats.bindSlotCount,
      unresolvedBindSlotCount: bindStats.unresolvedBindSlotCount,
      runtimeBindingGapCount: bindingStats.runtimeBindingGapCount,
      runtimeBindingKinds: bindingStats.runtimeBindingKinds,
      runtimeObjectEvidenceCount: "",
      runtimeObjectKinds: "",
      effectPfxCount: pfxRows.length,
      effectHookCount: effectHookRows.length,
      effectHookPfxCount: effectHookPfxRows.length,
      shadergraphCount: shaderRows.length,
      unclassifiedShadergraphCount: shaderRows.filter(shadergraphHasMaterialGap).length,
      nativeTimelineEventCount: timelineRows.length,
      resourceKeys: uniqueJoin(resourceKeys),
      issues: issueText(issues),
    });
  }
  return rows;
}

function unlinkedCharacterRows({
  allPbrItems,
  skinRelSet,
  skinnedRelSet,
  runtimeGraphRelSet,
  runtimeObjectGraphByRel,
  glbMaterialCoverageByRel,
}) {
  const rows = [];
  for (const item of allPbrItems || []) {
    if (!item.rel?.startsWith("Characters/")) continue;
    const runtimeObjectRows = runtimeObjectGraphByRel?.get(item.rel) || [];
    if (skinRelSet.has(item.rel) && !runtimeObjectRows.length) continue;
    const assetClass = classifyUnlinkedCharacterModel(item);
    const hasRuntimeObjectEvidence = runtimeObjectRows.length > 0;
    const issues = hasRuntimeObjectEvidence ? [] : ["not-linked-to-skin-catalog"];
    const glbCoverageRows = glbMaterialCoverageByRel?.get(item.rel) || [];
    if (!hasRuntimeObjectEvidence && !skinnedRelSet.has(item.rel)) issues.push("not-in-skinned-runtime-manifest");
    if (!runtimeGraphRelSet.has(item.rel) && !hasRuntimeObjectEvidence) issues.push("not-in-runtime-graph");
    issues.push(...(glbCoverageRows.length ? glbMaterialIssues(glbCoverageRows) : materialIssues(item)));
    rows.push({
      sourceKind: hasRuntimeObjectEvidence ? "runtime-object" : "unlinked-character-model",
      assetClass,
      skinId: "",
      fallbackLabel: item.variant || item.modelLabel || "",
      zhCN: "",
      rel: item.rel,
      aliasOfModelLabel: "",
      aliasEvidence: "",
      character: item.character || sourceCharacterFromPath(item.rel),
      sourceRelativePath: runtimeObjectSourcePaths(runtimeObjectRows),
      inSkinPreviewManifest: "no",
      inSkinnedManifest: skinnedRelSet.has(item.rel) ? "yes" : "no",
      inAllPbrManifest: "yes",
      inRuntimeGraph: runtimeGraphRelSet.has(item.rel) ? "yes" : hasRuntimeObjectEvidence ? "object" : "no",
      materialCount: item.materialCount ?? "",
      texturedMaterialCount: item.texturedMaterialCount ?? "",
      glbMaterialCoverageClasses: glbMaterialCoverageClasses(glbCoverageRows),
      sameLabelAnimationCount: "",
      animationBindingCount: "",
      compatibleAnimationCount: "",
      bindSlotCount: "",
      unresolvedBindSlotCount: "",
      runtimeBindingGapCount: "",
      runtimeBindingKinds: "",
      runtimeObjectEvidenceCount: runtimeObjectRows.length || "",
      runtimeObjectKinds: runtimeObjectKinds(runtimeObjectRows),
      effectPfxCount: "",
      effectHookCount: "",
      effectHookPfxCount: "",
      shadergraphCount: "",
      unclassifiedShadergraphCount: "",
      nativeTimelineEventCount: "",
      resourceKeys: runtimeObjectResourceKeys(runtimeObjectRows),
      issues: issueText(issues),
    });
  }
  return rows;
}

function buildRuntimeResourceCompletenessRows({
  skinCatalog,
  skinItems,
  skinnedItems,
  allPbrItems,
  runtimeGraphItems,
  runtimeObjectGraphItems,
  runtimeBindingConfigItems,
  animationBindingItems,
  skinVariantAliasItems,
  pfxItems,
  effectHookItems,
  shadergraphItems,
  timelineItems,
  glbMaterialCoverageItems,
}) {
  const runtimeGraph = runtimeGraphLookup(runtimeGraphItems || []);
  const indexes = {
    skinByLabel: byModelLabel(skinItems || []),
    skinnedByLabel: byModelLabel(skinnedItems || []),
    skinByLabelAll: byModelLabelAll(skinItems || []),
    skinnedByLabelAll: byModelLabelAll(skinnedItems || []),
    skinItems: { byLabel: byModelLabel(skinItems || []), byRel: byRel(skinItems || []) },
    skinnedItems: { byLabel: byModelLabel(skinnedItems || []), byRel: byRel(skinnedItems || []) },
    allByRel: byRel(allPbrItems || []),
    skinVariantAliasBySkinId: buildSkinVariantAliasLookup(skinVariantAliasItems || []),
    runtimeGraph,
    runtimeObjectGraphByRel: buildRuntimeObjectGraphLookup(runtimeObjectGraphItems || []),
    runtimeBindingConfig: buildRuntimeBindingConfigLookup(runtimeBindingConfigItems || []),
    animationBindingByKey: buildAnimationBindingLookup(animationBindingItems || []),
    pfxByKey: buildPfxKeyIndex(pfxItems || []),
    pfxByPath: buildPfxPathLookup(pfxItems || []),
    effectHookByKey: buildEffectHookKeyIndex(effectHookItems || []),
    shadergraphLookup: buildShadergraphLookup(shadergraphItems || []),
    timelineByKey: buildTimelineKeyIndex(timelineItems || []),
    glbMaterialCoverageByRel: buildGlbMaterialCoverageLookup(glbMaterialCoverageItems || []),
  };
  const skinRows = skinCatalogRows({ skinCatalog: skinCatalog || { skins: {} }, indexes });
  const skinRelSet = new Set(
    [
      ...skinRows.map((row) => row.rel),
      ...skinManifestRelItems(skinItems).map((item) => item.rel),
      ...skinManifestRelItems(skinnedItems).map((item) => item.rel),
    ].filter(Boolean),
  );
  const skinnedRelSet = new Set((skinnedItems || []).map((item) => item.rel).filter(Boolean));
  const runtimeGraphRelSet = new Set((runtimeGraphItems || []).map((item) => item.rel).filter(Boolean));
  const unlinkedRows = unlinkedCharacterRows({
    allPbrItems,
    skinRelSet,
    skinnedRelSet,
    runtimeGraphRelSet,
    runtimeObjectGraphByRel: indexes.runtimeObjectGraphByRel,
    glbMaterialCoverageByRel: indexes.glbMaterialCoverageByRel,
  });

  return [...skinRows, ...unlinkedRows].sort((left, right) => {
    if (left.sourceKind !== right.sourceKind) return left.sourceKind.localeCompare(right.sourceKind);
    if (left.assetClass !== right.assetClass) return left.assetClass.localeCompare(right.assetClass);
    return `${left.skinId || left.rel}`.localeCompare(`${right.skinId || right.rel}`);
  });
}

function summarizeRuntimeResourceCompletenessRows(rows) {
  const byIssue = {};
  const bySourceKind = {};
  const byAssetClass = {};
  for (const row of rows || []) {
    bySourceKind[row.sourceKind] = (bySourceKind[row.sourceKind] || 0) + 1;
    byAssetClass[row.assetClass] = (byAssetClass[row.assetClass] || 0) + 1;
    for (const issue of splitIssueText(row.issues)) byIssue[issue] = (byIssue[issue] || 0) + 1;
  }
  const skinRows = rows.filter((row) => row.sourceKind === "skin-catalog");
  return {
    rows: rows.length,
    skinCatalogRows: skinRows.length,
    missingSkinPreviewGlb: skinRows.filter((row) => row.issues.includes("missing-skin-preview-glb")).length,
    missingSkinnedRuntimeGlb: skinRows.filter((row) => row.issues.includes("missing-skinned-runtime-glb")).length,
    missingRuntimeGraphRows: skinRows.filter((row) => row.issues.includes("missing-runtime-graph")).length,
    textureIssueRows: rows.filter((row) => /basecolor-texture|pale-color-only-material|missing-glb-material-coverage|no-materials/.test(row.issues))
      .length,
    noSameLabelAnimationRows: skinRows.filter((row) => row.issues.includes("no-same-label-animation")).length,
    noEffectPfxRows: skinRows.filter((row) => row.issues.includes("no-effect-pfx-for-character")).length,
    noNativeRuntimeTimelineRows: skinRows.filter((row) => row.issues.includes("no-native-runtime-timeline")).length,
    rawUnresolvedRuntimeBindSlotRows: skinRows.filter((row) => Number(row.unresolvedBindSlotCount || 0) > 0).length,
    unresolvedRuntimeBindSlotRows: skinRows.filter((row) => row.issues.includes("unresolved-runtime-bind-slot")).length,
    unclassifiedEffectShadergraphRows: skinRows.filter((row) => row.issues.includes("unclassified-effect-shadergraph")).length,
    runtimeObjectRows: rows.filter((row) => row.sourceKind === "runtime-object").length,
    unlinkedCharacterModels: rows.filter((row) => row.sourceKind === "unlinked-character-model").length,
    runtimePropCandidates: rows.filter((row) => row.assetClass === "runtime-prop-candidate").length,
    runtimePropCandidatesWithRuntimeObjectGraph: rows.filter(
      (row) => row.assetClass === "runtime-prop-candidate" && Number(row.runtimeObjectEvidenceCount || 0) > 0,
    ).length,
    runtimePropCandidatesMissingRuntimeObjectGraph: rows.filter(
      (row) => row.assetClass === "runtime-prop-candidate" && Number(row.runtimeObjectEvidenceCount || 0) <= 0,
    ).length,
    bySourceKind,
    byAssetClass,
    byIssue: Object.fromEntries(Object.entries(byIssue).sort(([left], [right]) => left.localeCompare(right))),
  };
}

const columns = [
  "sourceKind",
  "assetClass",
  "skinId",
  "fallbackLabel",
  "zhCN",
  "rel",
  "aliasOfModelLabel",
  "aliasEvidence",
  "character",
  "sourceRelativePath",
  "inSkinPreviewManifest",
  "inSkinnedManifest",
  "inAllPbrManifest",
  "inRuntimeGraph",
  "materialCount",
  "texturedMaterialCount",
  "glbMaterialCoverageClasses",
  "sameLabelAnimationCount",
  "animationBindingCount",
  "compatibleAnimationCount",
  "bindSlotCount",
  "unresolvedBindSlotCount",
  "runtimeBindingGapCount",
  "runtimeBindingKinds",
  "runtimeObjectEvidenceCount",
  "runtimeObjectKinds",
  "effectPfxCount",
  "effectHookCount",
  "effectHookPfxCount",
  "shadergraphCount",
  "unclassifiedShadergraphCount",
  "nativeTimelineEventCount",
  "resourceKeys",
  "issues",
];

function exportRuntimeResourceCompletenessReport({
  skinCatalogPath = defaultSkinCatalogPath,
  skinManifestPath = defaultSkinManifestPath,
  skinnedManifestPath = defaultSkinnedManifestPath,
  allPbrManifestPath = defaultAllPbrManifestPath,
  skinVariantAliasPath = defaultSkinVariantAliasPath,
  runtimeGraphPath = defaultRuntimeGraphPath,
  runtimeObjectGraphPath = defaultRuntimeObjectGraphPath,
  runtimeBindingConfigPath = defaultRuntimeBindingConfigPath,
  animationBindingPath = defaultAnimationBindingPath,
  pfxManifestPath = defaultPfxManifestPath,
  effectHookManifestPath = defaultEffectHookManifestPath,
  shadergraphManifestPath = defaultShadergraphManifestPath,
  timelineManifestPath = defaultTimelineManifestPath,
  glbMaterialCoveragePath = defaultGlbMaterialCoveragePath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const rows = buildRuntimeResourceCompletenessRows({
    skinCatalog: readJson(skinCatalogPath),
    skinItems: readManifestItems(skinManifestPath),
    skinnedItems: readManifestItems(skinnedManifestPath),
    allPbrItems: readManifestItems(allPbrManifestPath),
    skinVariantAliasItems: readManifestItems(skinVariantAliasPath),
    runtimeGraphItems: readManifestItems(runtimeGraphPath),
    runtimeObjectGraphItems: readManifestItems(runtimeObjectGraphPath),
    runtimeBindingConfigItems: readManifestItems(runtimeBindingConfigPath),
    animationBindingItems: readManifestItems(animationBindingPath),
    pfxItems: readManifestItems(pfxManifestPath),
    effectHookItems: readManifestItems(effectHookManifestPath),
    shadergraphItems: readManifestItems(shadergraphManifestPath),
    timelineItems: readManifestItems(timelineManifestPath),
    glbMaterialCoverageItems: readManifestItems(glbMaterialCoveragePath),
  });
  const summary = summarizeRuntimeResourceCompletenessRows(rows);

  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeResourceCompletenessReport({
    skinCatalogPath: optionValue(args, "--skin-catalog", defaultSkinCatalogPath),
    skinManifestPath: optionValue(args, "--skin-manifest", defaultSkinManifestPath),
    skinnedManifestPath: optionValue(args, "--skinned-manifest", defaultSkinnedManifestPath),
    allPbrManifestPath: optionValue(args, "--all-pbr-manifest", defaultAllPbrManifestPath),
    skinVariantAliasPath: optionValue(args, "--skin-variant-aliases", defaultSkinVariantAliasPath),
    runtimeGraphPath: optionValue(args, "--runtime-graph", defaultRuntimeGraphPath),
    runtimeObjectGraphPath: optionValue(args, "--runtime-object-graph", defaultRuntimeObjectGraphPath),
    runtimeBindingConfigPath: optionValue(args, "--runtime-binding-config", defaultRuntimeBindingConfigPath),
    animationBindingPath: optionValue(args, "--animation-bindings", defaultAnimationBindingPath),
    pfxManifestPath: optionValue(args, "--pfx-manifest", defaultPfxManifestPath),
    effectHookManifestPath: optionValue(args, "--effect-hooks", defaultEffectHookManifestPath),
    shadergraphManifestPath: optionValue(args, "--shadergraph-manifest", defaultShadergraphManifestPath),
    timelineManifestPath: optionValue(args, "--timeline-manifest", defaultTimelineManifestPath),
    glbMaterialCoveragePath: optionValue(args, "--glb-material-coverage", defaultGlbMaterialCoveragePath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeResourceCompletenessRows,
  classifyUnlinkedCharacterModel,
  exportRuntimeResourceCompletenessReport,
  summarizeRuntimeResourceCompletenessRows,
};
