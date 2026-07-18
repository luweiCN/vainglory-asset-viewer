#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultEffectHookPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultKindredSlotPath = "extracted/viewer/kindred-effect-resource-slots.json";
const defaultProjectileRuntimePath = "extracted/viewer/effect-projectile-runtime-manifest.json";
const defaultPfxResourcePath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultShadergraphMaterialPath = "extracted/viewer/effect-shadergraph-material-manifest.json";
const defaultEffectResourcePath = "extracted/reports/effect_resource_index.tsv";
const defaultDefinitionChainPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultViewerOut = "extracted/viewer/effect-runtime-gaps.json";
const defaultTsvOut = "extracted/reports/effect_runtime_gaps.tsv";
const defaultJsonOut = "extracted/reports/effect_runtime_gaps_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonItems(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const json = readJson(filePath);
  return Array.isArray(json) ? json : json.items || [];
}

function readTsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
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
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function roundFloat(value) {
  return Math.round(value * 10000) / 10000;
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function addIndexRow(index, key, item) {
  if (!key) return;
  const records = index.get(key) || [];
  records.push(item);
  index.set(key, records);
}

function buildProjectileRuntimeHookTokenIndex(items = []) {
  const byNativeHookToken = new Map();
  const byEffectToken = new Map();
  for (const item of items || []) {
    for (const token of listValue(item.nativeEffectHookTokens)) {
      addIndexRow(byNativeHookToken, token, item);
    }
    for (const token of listValue(item.effectTokens)) {
      addIndexRow(byEffectToken, token, item);
    }
  }
  return { byNativeHookToken, byEffectToken };
}

function addProjectileRuntimeRows(rows, seen, nextRows = []) {
  for (const row of nextRows || []) {
    const key = [row.modelLabel, row.resourcePath, row.nativeEffectHookTokens, row.effectTokens].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
}

function projectileRuntimeRowsForHook(hook, projectileRuntimeHookIndex) {
  const rows = [];
  const seen = new Set();
  for (const token of uniqueSorted([hook.effectToken, hook.token])) {
    addProjectileRuntimeRows(rows, seen, projectileRuntimeHookIndex.byNativeHookToken?.get(token));
  }
  for (const token of uniqueSorted([...(hook.nativeNearbyEffectTokens || []), ...(hook.nearbyEffectTokens || [])])) {
    for (const row of projectileRuntimeHookIndex.byEffectToken?.get(token) || []) {
      if (!actionKeysOverlap(hook.actionKeys, row.actionKeys)) continue;
      addProjectileRuntimeRows(rows, seen, [row]);
    }
  }
  return rows;
}

function actionKey(value) {
  return listValue(value).sort().join("|");
}

function selectorOutputGroupKey(hook) {
  return [hookPlatform(hook), hookSourceFunction(hook), actionKey(hook.actionKeys)].join("\t");
}

function buildResourceBoundSelectorOutputIndex(hooks = []) {
  const index = new Map();
  for (const hook of hooks || []) {
    if (hook.sourceKind !== "native-effect-selector") continue;
    if (!listValue(hook.resourcePaths).length) continue;
    const key = selectorOutputGroupKey(hook);
    const rows = index.get(key) || [];
    rows.push(hook);
    index.set(key, rows);
  }
  return index;
}

function buildSelectorOutputIndex(hooks = []) {
  const index = new Map();
  for (const hook of hooks || []) {
    if (hook.sourceKind !== "native-effect-selector") continue;
    const key = selectorOutputGroupKey(hook);
    const rows = index.get(key) || [];
    rows.push(hook);
    index.set(key, rows);
  }
  return index;
}

function pairedSelectorOutputRole(role) {
  if (role === "projectile") return "impact";
  if (role === "impact") return "projectile";
  return "";
}

function selectorOutputPairRowsForHook(hook, runtimeEvidence = {}) {
  if (hook.sourceKind !== "native-effect-selector") return [];
  const rows = runtimeEvidence.resourceBoundSelectorOutputsByGroup?.get(selectorOutputGroupKey(hook)) || [];
  const pairedRole = pairedSelectorOutputRole(hook.selectorOutputRole || "");
  return rows.filter((row) => {
    if ((row.effectToken || row.token) === (hook.effectToken || hook.token)) return false;
    if (pairedRole && row.selectorOutputRole !== pairedRole) return false;
    return true;
  });
}

function selectorOutputSiblingRowsForHook(hook, runtimeEvidence = {}) {
  if (hook.sourceKind !== "native-effect-selector") return [];
  const rows = runtimeEvidence.selectorOutputsByGroup?.get(selectorOutputGroupKey(hook)) || [];
  const pairedRole = pairedSelectorOutputRole(hook.selectorOutputRole || "");
  return rows.filter((row) => {
    if ((row.effectToken || row.token) === (hook.effectToken || hook.token)) return false;
    if (pairedRole && row.selectorOutputRole !== pairedRole) return false;
    return true;
  });
}

function selectorOutputPairReason(hook, pairRows) {
  if (!pairRows.length) return "";
  if (hook.selectorOutputRole === "projectile" && pairRows.some((row) => row.selectorOutputRole === "impact")) {
    return "selector-output-paired-impact-resource";
  }
  return "selector-output-paired-resource";
}

function selectorOutputMissingPairReason(hook, pairRows, siblingRows) {
  if (pairRows.length || !siblingRows.length) return "";
  if (pairedSelectorOutputRole(hook.selectorOutputRole || "")) return "selector-output-paired-resource-missing";
  return "";
}

function globalResourceCandidatePathsForHook(hook, runtimeEvidence = {}) {
  if (listValue(hook.heroCodes).length || listValue(hook.heroNames).length || listValue(hook.heroResourceRoots).length) return [];
  const token = hook.effectToken || hook.token || "";
  const body = tokenBody(token);
  const terms = tokenTerms(token).filter((term) => term.length >= 4 && term !== "item");
  if (!body || !terms.length) return [];
  const compactBody = compact(body);
  const paths = [];
  for (const row of runtimeEvidence.effectResourceRows || []) {
    const resourcePath = effectResourcePath(row);
    const compactPath = compact(resourcePath);
    if (!resourcePath || !compactPath) continue;
    if (compactBody.length >= 5 && compactPath.includes(compactBody)) {
      paths.push(resourcePath);
      continue;
    }
    const matchCount = terms.filter((term) => compactPath.includes(compact(term))).length;
    if (matchCount >= Math.min(2, terms.length)) paths.push(resourcePath);
    else if (terms.length === 1 && matchCount === 1) paths.push(resourcePath);
  }
  return uniqueSorted(paths).slice(0, 12);
}

function normalized(value) {
  return String(value || "").toLowerCase();
}

function compact(value) {
  return normalized(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeHeroCode(value) {
  const match = String(value || "").match(/Hero\d{3}/i);
  return match ? `Hero${match[0].slice(4).padStart(3, "0")}` : "";
}

function normalizeResourceRoot(value) {
  const heroCode = normalizeHeroCode(value);
  if (heroCode) return heroCode;
  const cleaned = String(value || "")
    .replace(/^\*/, "")
    .replace(/\*$/, "")
    .trim();
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(cleaned) ? cleaned : "";
}

function effectResourcePath(row) {
  return row?.relativePath || row?.resourcePath || row?.path || "";
}

function effectResourceRoot(row) {
  const match = String(effectResourcePath(row)).match(/^Effects\/([^/]+)/i);
  return normalizeResourceRoot(match?.[1] || "");
}

function effectResourceRootSet(effectResourceRows = []) {
  return new Set((effectResourceRows || []).map(effectResourceRoot).filter(Boolean));
}

function buildKindredResourceRootIndex(kindredSlots = []) {
  const byHero = new Map();
  for (const slot of kindredSlots || []) {
    const hero = slot.heroLabel || "";
    const root = normalizeResourceRoot(slot.resourceRoot || effectResourceRoot({ relativePath: slot.resourcePath }));
    if (!hero || !root) continue;
    const roots = byHero.get(hero) || new Set();
    roots.add(root);
    byHero.set(hero, roots);
  }
  return byHero;
}

function kindredResourceRootsForHero(heroName, runtimeEvidence = {}) {
  return [...(runtimeEvidence.kindredResourceRootByHero?.get(heroName) || [])].map(normalizeResourceRoot).filter(Boolean);
}

function heroCodesFromDefinitionRow(row) {
  return uniqueSorted(
    [
      row?.targetRelativePath,
      row?.meshSamples,
      row?.skeletonSamples,
      row?.targetLinkedPath,
    ]
      .join("|")
      .match(/Hero\d{3}/gi) || [],
  ).map(normalizeHeroCode);
}

function effectResourceRootsFromDefinitionRow(row) {
  const heroCodes = heroCodesFromDefinitionRow(row);
  if (heroCodes.length) return heroCodes;
  return [normalizeResourceRoot(row?.manifestLabel)].filter(Boolean);
}

function definitionScoreForHeroName(heroName, row) {
  const label = String(row?.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
  const target = String(row?.targetRelativePath || "");
  let score = 0;
  if (label === heroName) score += 100;
  if (label.startsWith(`${heroName}_`)) score += 80;
  if (target.endsWith(`/${heroName}.def`)) score += 70;
  if (target.includes(`/${heroName}_`)) score += 50;
  if (!score) return 0;
  if (Number(row?.childResourceRows || 0) > 0) score += 10;
  if (heroCodesFromDefinitionRow(row).length) score += 5;
  return score;
}

function definitionRowsForHeroName(heroName, definitionRows = []) {
  if (!heroName) return [];
  return (definitionRows || [])
    .map((row) => ({ row, score: definitionScoreForHeroName(heroName, row) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.row?.targetRelativePath || "").localeCompare(String(right.row?.targetRelativePath || "")))
    .map((entry) => entry.row);
}

function definitionScoreForResourceRoot(resourceRoot, row) {
  const root = normalizeResourceRoot(resourceRoot);
  if (!root) return 0;
  const label = String(row?.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
  const target = String(row?.targetRelativePath || "");
  let score = 0;
  if (effectResourceRootsFromDefinitionRow(row).includes(root)) score += 100;
  if (label === root) score += 90;
  if (label.startsWith(`${root}_`)) score += 70;
  if (target.endsWith(`/${root}.def`)) score += 60;
  if (target.includes(`/${root}/`)) score += 50;
  if (!score) return 0;
  if (Number(row?.childResourceRows || 0) > 0) score += 10;
  return score;
}

function definitionRowsForResourceRoot(resourceRoot, definitionRows = []) {
  if (!resourceRoot) return [];
  return (definitionRows || [])
    .map((row) => ({ row, score: definitionScoreForResourceRoot(resourceRoot, row) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.row?.targetRelativePath || "").localeCompare(String(right.row?.targetRelativePath || "")))
    .map((entry) => entry.row);
}

function definitionRowsForHook(hook, runtimeEvidence = {}) {
  const rows = [];
  const seen = new Set();
  const addRows = (nextRows) => {
    for (const row of nextRows || []) {
      const key = [row?.manifestLabel, row?.targetRelativePath, row?.targetLinkedPath].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  };
  for (const heroName of listValue(hook.heroNames)) addRows(definitionRowsForHeroName(heroName, runtimeEvidence.definitionRows || []));
  for (const root of [...listValue(hook.heroCodes), ...listValue(hook.heroResourceRoots)]) {
    addRows(definitionRowsForResourceRoot(root, runtimeEvidence.definitionRows || []));
  }
  return rows;
}

function definitionRowText(row) {
  return [row?.targetRelativePath, row?.targetLinkedPath, row?.meshSamples, row?.skeletonSamples]
    .join("|");
}

function isPlaceholderDefinitionRowForRoot(row, resourceRoot) {
  const root = normalizeResourceRoot(resourceRoot);
  if (!root || root === "Hero000") return false;
  const text = definitionRowText(row);
  if (!/Characters\/Hero000\/Art\/hero000\.skeleton/i.test(text)) return false;
  return effectResourceRootsFromDefinitionRow(row).includes(root) || definitionScoreForResourceRoot(root, row) > 0;
}

function effectTokenSpecificDefinitionRoots(hook, definitionRows = []) {
  const body = compact(tokenBody(hook?.effectToken || hook?.token || ""));
  if (!body) return [];
  const roots = [];
  for (const row of definitionRows || []) {
    for (const root of effectResourceRootsFromDefinitionRow(row)) {
      const compactRoot = compact(root);
      if (compactRoot.length >= 6 && body.includes(compactRoot)) roots.push(root);
    }
  }
  return uniqueSorted(roots.map(normalizeResourceRoot).filter(Boolean));
}

function effectResourceRootsForHook(hook, definitionRows = [], runtimeEvidence = {}) {
  const roots = [...listValue(hook.heroCodes)];
  const tokenSpecificRoots = effectTokenSpecificDefinitionRoots(hook, definitionRows);
  for (const heroName of listValue(hook.heroNames)) {
    const kindredRoots = kindredResourceRootsForHero(heroName, runtimeEvidence);
    if (kindredRoots.length) {
      roots.push(...kindredRoots);
      continue;
    }
    if (normalized(heroName) === "item" && tokenSpecificRoots.length) {
      roots.push(...tokenSpecificRoots);
      continue;
    }
    roots.push(normalizeHeroCode(heroName));
    roots.push(...definitionRowsForHeroName(heroName, definitionRows).flatMap(effectResourceRootsFromDefinitionRow));
  }
  const preferredRoots = new Set(roots.map(normalizeResourceRoot).filter(Boolean));
  for (const root of listValue(hook.heroResourceRoots).map(normalizeResourceRoot)) {
    if (!root) continue;
    if (normalizeHeroCode(root) || preferredRoots.has(root) || !listValue(hook.heroNames).length) roots.push(root);
  }
  return uniqueSorted(roots.map(normalizeResourceRoot).filter(Boolean));
}

function missingEffectResourceRootsForHook(hook, runtimeEvidence = {}) {
  const roots = effectResourceRootsForHook(hook, runtimeEvidence.definitionRows || [], runtimeEvidence);
  if (!roots.length || !runtimeEvidence.effectResourceRoots?.size) return [];
  return roots.filter((root) => !runtimeEvidence.effectResourceRoots.has(root));
}

function presentEffectResourceRootsForHook(hook, runtimeEvidence = {}) {
  const roots = effectResourceRootsForHook(hook, runtimeEvidence.definitionRows || [], runtimeEvidence);
  if (!roots.length || !runtimeEvidence.effectResourceRoots?.size) return [];
  return roots.filter((root) => runtimeEvidence.effectResourceRoots.has(root));
}

function placeholderDefinitionRootsForHook(hook, runtimeEvidence = {}) {
  const missingRoots = new Set(missingEffectResourceRootsForHook(hook, runtimeEvidence));
  if (!missingRoots.size) return [];
  const placeholderRoots = [];
  for (const row of definitionRowsForHook(hook, runtimeEvidence)) {
    for (const root of missingRoots) {
      if (isPlaceholderDefinitionRowForRoot(row, root)) placeholderRoots.push(root);
    }
  }
  return uniqueSorted(placeholderRoots);
}

function tokenBody(effectToken) {
  return String(effectToken || "").replace(/^Effect_/, "");
}

function semanticParts(value) {
  const parts = [];
  for (const rawPart of String(value || "").split(/[^A-Za-z0-9]+/)) {
    if (!rawPart) continue;
    const expanded = rawPart
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/([A-Za-z])(\d)/g, "$1_$2")
      .replace(/(\d)([A-Za-z])/g, "$1_$2");
    const subparts = expanded
      .split(/[^A-Za-z0-9]+/)
      .map(normalized)
      .filter(Boolean);
    parts.push(normalized(rawPart), ...subparts);
    const compact = subparts.join("");
    if (compact) parts.push(compact);
    if (/^[abc]\d/i.test(rawPart)) parts.push(normalized(rawPart.slice(0, 1)));
  }
  return uniqueSorted(parts);
}

function semanticAliases(parts) {
  const aliases = new Set();
  const compactParts = new Set(parts.map(compact));
  const add = (...values) => values.filter(Boolean).forEach((value) => aliases.add(normalized(value)));

  if (compactParts.has("defaultattack") || compactParts.has("basicattack") || parts.includes("attack")) add("attack", "aa");
  if (parts.includes("hit") || parts.includes("impact") || parts.includes("land") || parts.includes("landing") || parts.includes("landed")) {
    add("hit", "impact", "land", "landing", "landed");
  }
  if (parts.includes("projectile") || parts.includes("proj")) add("projectile", "proj");
  if (parts.includes("a1") || parts.includes("a2") || compactParts.has("ability01") || compactParts.has("ability1")) add("a", "ability01");
  if (parts.includes("b1") || parts.includes("b2") || compactParts.has("ability02") || compactParts.has("ability2")) add("b", "ability02");
  if (parts.includes("c1") || parts.includes("c2") || compactParts.has("ability03") || compactParts.has("ability3")) add("c", "ability03");

  return [...aliases];
}

function tokenTerms(effectToken) {
  const parts = semanticParts(tokenBody(effectToken));
  return uniqueSorted([...parts, ...semanticAliases(parts)]).filter((term) => {
    if (!term || ["effect", "default"].includes(term)) return false;
    return term.length >= 2;
  });
}

function actionKeysOverlap(left = [], right = []) {
  const leftKeys = new Set(listValue(left));
  const rightKeys = new Set(listValue(right));
  if (!leftKeys.size || !rightKeys.size) return true;
  for (const key of leftKeys) {
    if (rightKeys.has(key)) return true;
    if (key.startsWith("attack") && rightKeys.has("attack")) return true;
    if (key.startsWith("ability01") && rightKeys.has("ability01")) return true;
    if (key.startsWith("ability02") && rightKeys.has("ability02")) return true;
    if (key.startsWith("ability03") && rightKeys.has("ability03")) return true;
  }
  return false;
}

function slotHeroMatchesEffectToken(slot, effectToken) {
  const body = tokenBody(effectToken);
  const hero = slot.heroLabel || "";
  if (!hero) return false;
  if (body === hero) return true;
  return body.startsWith(`${hero}_`) || body.startsWith(hero);
}

function slotTerms(slot) {
  const parts = semanticParts([slot.resourceStem, slot.resourcePath, slot.role, ...listValue(slot.actionKeys)].join(" "));
  return [...parts, ...semanticAliases(parts)]
    .map(normalized)
    .filter((term) => term.length >= 2);
}

function compactSlotTerms(slot) {
  return [slot.resourceStem, slot.resourcePath, slot.role, ...listValue(slot.actionKeys)]
    .join(" ")
    .split(/[^A-Za-z0-9]+/)
    .map(compact)
    .filter(Boolean);
}

function semanticOverlapScore(effectToken, slot) {
  const terms = tokenTerms(effectToken);
  if (!terms.length) return 0;
  const slotTermSet = new Set(slotTerms(slot));
  const compactSlotValues = compactSlotTerms(slot);
  const compactSlotText = compactSlotValues.join(" ");
  let score = 0;
  for (const term of terms) {
    if (slotTermSet.has(term)) score += 2;
    else if (term.length >= 5 && compactSlotText.includes(compact(term))) score += 1;
  }
  return score;
}

function kindredSlotCandidatesForHook(hook, slots = []) {
  const effectToken = hook.effectToken || hook.token || "";
  const actionKeys = listValue(hook.actionKeys);
  return (slots || [])
    .filter((slot) => slotHeroMatchesEffectToken(slot, effectToken))
    .map((slot) => ({
      slot,
      score: semanticOverlapScore(effectToken, slot) + (actionKeysOverlap(actionKeys, slot.actionKeys) ? 1 : 0),
    }))
    .filter((entry) => entry.score > 1)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.slot.resourcePath).localeCompare(String(right.slot.resourcePath));
    })
    .slice(0, 12)
    .map((entry) => entry.slot);
}

function hookPlatform(hook) {
  if (hook?.platform) return hook.platform;
  const idPlatform = String(hook?.id || "").split(":")[0];
  return idPlatform || "";
}

function hookSourceFunction(hook) {
  return hook?.source?.functionName || hook?.functionName || "";
}

function hookCoverageKey(hook) {
  return [hookPlatform(hook), hookSourceFunction(hook), hook?.effectToken || hook?.token || ""].join("\t");
}

function buildResourceBoundHookCoverageIndex(hooks = []) {
  const covered = new Set();
  for (const hook of hooks || []) {
    if (!listValue(hook.resourcePaths).length && !listValue(hook.shadergraphPaths).length) continue;
    const key = hookCoverageKey(hook);
    if (key.split("\t").every(Boolean)) covered.add(key);
  }
  return covered;
}

function hookHasNativePrimitiveOptions(hook) {
  const options = hook?.runtimeBinding?.effectOptions;
  if (!options || hook.resourceEvidenceSource === "effect-resource-candidate") return false;
  if (options.visibleOrActive === false) return false;
  const hasDrawableColor = Array.isArray(options.color);
  const hasDrawableScale = Number.isFinite(Number(options.scale));
  const hasDrawableFade = Number.isFinite(Number(options.fadeSeconds)) && (hasDrawableColor || hasDrawableScale);
  if (!(hasDrawableColor || hasDrawableScale || hasDrawableFade)) return false;

  const text = [
    hook.effectToken,
    hook.token,
    hook.runtimeBinding?.locatorLabel,
  ].filter(Boolean).join(" ");
  return /warning|execute|target|reticle|ring|area|zone|field|cloud|circle|pillar|edge|damagezone|explosion|buff/i.test(text);
}

function hookIsExplicitlyHiddenEffectChannel(hook) {
  const options = hook?.runtimeBinding?.effectOptions;
  if (!options || options.visibleOrActive !== false) return false;
  return !listValue(hook.resourcePaths).length && !listValue(hook.shadergraphPaths).length;
}

function hookNeedsNativeEffectChannelResourceMapping(hook) {
  if (listValue(hook.resourcePaths).length || listValue(hook.shadergraphPaths).length) return false;
  if (hook.resourceEvidenceSource === "effect-resource-candidate") return false;
  if (hookIsExplicitlyHiddenEffectChannel(hook) || hookHasNativePrimitiveOptions(hook)) return false;
  return hook?.runtimeBinding?.kind === "effect-channel" || hook.bindKind === "effect-only";
}

function isGapHook(hook, resourceBoundCoverageIndex = new Set()) {
  if (!listValue(hook.resourcePaths).length && !listValue(hook.shadergraphPaths).length && resourceBoundCoverageIndex.has(hookCoverageKey(hook))) return false;
  if (!listValue(hook.resourcePaths).length && hookHasNativePrimitiveOptions(hook)) return false;
  if (hookIsExplicitlyHiddenEffectChannel(hook)) return false;
  if (listValue(hook.shadergraphPaths).length && hook.shadergraphEvidenceSource !== "effect-shadergraph-candidate") return false;
  if (hook.resourceEvidenceSource === "effect-resource-candidate") return true;
  return listValue(hook.resourcePaths).length === 0;
}

function classifyGapReason(
  hook,
  kindredCandidates,
  runtimeEvidence = {},
  selectorOutputPairRows = [],
  selectorOutputSiblingRows = [],
  globalCandidateResourcePaths = [],
) {
  if (hook.resourceEvidenceSource === "effect-resource-candidate") return "weak-resource-candidate";
  if (kindredCandidates.length) return "kindred-slot-candidate-unresolved";
  const selectorPairReason = selectorOutputPairReason(hook, selectorOutputPairRows);
  if (selectorPairReason) return selectorPairReason;
  const selectorMissingPairReason = selectorOutputMissingPairReason(hook, selectorOutputPairRows, selectorOutputSiblingRows);
  if (selectorMissingPairReason) return selectorMissingPairReason;
  if (globalCandidateResourcePaths.length) return "global-resource-candidate-unresolved";
  const missingEffectResourceRoots = missingEffectResourceRootsForHook(hook, runtimeEvidence);
  if (missingEffectResourceRoots.length) {
    const placeholderDefinitionRoots = placeholderDefinitionRootsForHook(hook, runtimeEvidence);
    if (placeholderDefinitionRoots.length === missingEffectResourceRoots.length) return "definition-placeholder-resource-root";
    if (presentEffectResourceRootsForHook(hook, runtimeEvidence).length) {
      return "definition-extra-resource-root-without-effect-package";
    }
    return "effect-resource-package-missing";
  }
  if (hookNeedsNativeEffectChannelResourceMapping(hook)) return "native-effect-channel-resource-unresolved";
  if (hook.sourceKind === "native-effect-selector") return "selector-output-unresolved";
  if (!listValue(hook.heroCodes).length && !listValue(hook.heroNames).length && !listValue(hook.heroResourceRoots).length) {
    return "no-hero-resource-context";
  }
  if (!listValue(hook.actionKeys).length) return "missing-action-context";
  return "no-resource-match";
}

function gapRowForHook(hook, kindredSlots, runtimeEvidence = {}) {
  const kindredCandidates = kindredSlotCandidatesForHook(hook, kindredSlots);
  const selectorOutputPairRows = selectorOutputPairRowsForHook(hook, runtimeEvidence);
  const selectorOutputSiblingRows = selectorOutputSiblingRowsForHook(hook, runtimeEvidence);
  const globalCandidateResourcePaths = globalResourceCandidatePathsForHook(hook, runtimeEvidence);
  const missingEffectResourceRoots = missingEffectResourceRootsForHook(hook, runtimeEvidence);
  const presentEffectResourceRoots = presentEffectResourceRootsForHook(hook, runtimeEvidence);
  const placeholderDefinitionRoots = placeholderDefinitionRootsForHook(hook, runtimeEvidence);
  const reason = classifyGapReason(
    hook,
    kindredCandidates,
    runtimeEvidence,
    selectorOutputPairRows,
    selectorOutputSiblingRows,
    globalCandidateResourcePaths,
  );
  return {
    id: hook.id || [hook.sourceKind, hook.effectToken, hook.source?.functionName, hook.source?.line].join(":"),
    sourceKind: hook.sourceKind || "",
    effectToken: hook.effectToken || hook.token || "",
    token: hook.token || hook.effectToken || "",
    reason,
    renderPromotionAllowed: false,
    actionKeys: listValue(hook.actionKeys),
    heroCodes: listValue(hook.heroCodes),
    heroNames: listValue(hook.heroNames),
    heroResourceRoots: effectResourceRootsForHook(hook, runtimeEvidence.definitionRows || [], runtimeEvidence),
    presentEffectResourceRoots,
    missingEffectResourceRoots,
    placeholderDefinitionRoots,
    existingResourcePaths: listValue(hook.resourcePaths),
    existingShadergraphPaths: listValue(hook.shadergraphPaths),
    shadergraphEvidenceSource: hook.shadergraphEvidenceSource || "",
    resourceEvidenceSource: hook.resourceEvidenceSource || "",
    aliasEvidenceStrength: hook.aliasEvidenceStrength || "",
    nativeRuntimeKind: hook.runtimeBinding?.kind || "",
    nativeBindKind: hook.bindKind || "",
    nativeEffectOptionOffsets: listValue(hook.runtimeBinding?.effectOptionOffsets),
    nativeEffectOptionFloatArgs: listValue(hook.runtimeBinding?.effectOptionFloatArgs),
    nativeEffectOptions: hook.runtimeBinding?.effectOptions || null,
    nativeActionNames: listValue(hook.nativeActionNames || hook.actionNames),
    nativeNearbyEffectTokens: listValue(hook.nativeNearbyEffectTokens || hook.nearbyEffectTokens),
    nativeNearbyBuffTokens: listValue(hook.nativeNearbyBuffTokens || hook.nearbyBuffTokens),
    nativeNearbyAbilityNames: listValue(hook.nativeNearbyAbilityNames || hook.nearbyAbilityNames),
    nativeNearbySoundTokens: listValue(hook.nativeNearbySoundTokens || hook.nearbySoundTokens),
    nativeSemanticCalls: listValue(hook.nativeSemanticCalls),
    selectorOutputTarget: hook.selectorOutputTarget || "",
    selectorOutputRole: hook.selectorOutputRole || "",
    selectorOutputSiblingTokens: uniqueSorted(selectorOutputSiblingRows.map((row) => row.effectToken || row.token)),
    selectorOutputSiblingRoles: uniqueSorted(selectorOutputSiblingRows.map((row) => row.selectorOutputRole)),
    pairedSelectorOutputTokens: uniqueSorted(selectorOutputPairRows.map((row) => row.effectToken || row.token)),
    pairedSelectorOutputRoles: uniqueSorted(selectorOutputPairRows.map((row) => row.selectorOutputRole)),
    pairedSelectorOutputResourcePaths: uniqueSorted(selectorOutputPairRows.flatMap((row) => listValue(row.resourcePaths))),
    globalCandidateResourcePaths,
    kindredCandidateCount: kindredCandidates.length,
    kindredCandidateResourcePaths: uniqueSorted(kindredCandidates.map((slot) => slot.resourcePath)),
    kindredCandidateModelLabels: uniqueSorted(kindredCandidates.map((slot) => slot.modelLabel)),
    kindredCandidateRoles: uniqueSorted(kindredCandidates.map((slot) => slot.role)),
    source: {
      functionName: hook.source?.functionName || "",
      line: hook.source?.line ?? "",
    },
  };
}

function nativePrimitiveRenderableRowForHook(hook) {
  return {
    id: hook.id || "",
    sourceKind: hook.sourceKind || "",
    effectToken: hook.effectToken || hook.token || "",
    token: hook.token || hook.effectToken || "",
    actionKeys: listValue(hook.actionKeys),
    heroCodes: listValue(hook.heroCodes),
    heroNames: listValue(hook.heroNames),
    nativeRuntimeKind: hook.runtimeBinding?.kind || "",
    nativeBindKind: hook.bindKind || "",
    locatorLabel: hook.runtimeBinding?.locatorLabel || "",
    nativeEffectOptionOffsets: listValue(hook.runtimeBinding?.effectOptionOffsets),
    nativeEffectOptionFloatArgs: listValue(hook.runtimeBinding?.effectOptionFloatArgs),
    nativeEffectOptions: hook.runtimeBinding?.effectOptions || null,
    source: {
      functionName: hook.source?.functionName || "",
      line: hook.source?.line ?? "",
    },
  };
}

function buildItemIndexByRelativePath(items = []) {
  const index = new Map();
  for (const item of items || []) {
    if (!item?.relativePath) continue;
    index.set(item.relativePath, item);
  }
  return index;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pfxSurfaceRuntimeHint(record, key) {
  return finiteNumber(record?.runtimeHints?.[key]);
}

function pfxSurfaceShapeSizeScalar(record) {
  const runtimeSize = pfxSurfaceRuntimeHint(record, "sizeScalar");
  if (runtimeSize !== null) return runtimeSize;
  return finiteNumber(record?.shapeProfile?.renderSizeScalar);
}

function shadergraphHasResolvedUvRuntime(shadergraphItem) {
  return Boolean(shadergraphItem?.previewUvAnimation && shadergraphItem?.previewUvRuntimeEvidence);
}

function hookNativeScaleValue(hook) {
  const scale = finiteNumber(hook?.runtimeBinding?.effectOptions?.scale);
  if (scale !== null) return scale;
  for (const arg of listValue(hook?.runtimeBinding?.effectOptionFloatArgs)) {
    const match = String(arg).match(/^0xd0:([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
    if (!match) continue;
    const value = finiteNumber(match[1]);
    if (value !== null) return value;
  }
  return null;
}

function normalizedNativeOptionOffset(offset) {
  return String(offset || "").trim().toLowerCase();
}

function nativePercentParamValues(hook) {
  const pairs = [];
  const seen = new Set();
  const push = (offset, rawValue) => {
    const normalizedOffset = normalizedNativeOptionOffset(offset);
    if (normalizedOffset !== "0x60") return;
    const value = finiteNumber(rawValue);
    if (value === null) return;
    const pair = `${normalizedOffset}:${value}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    pairs.push(pair);
  };

  const offsetValues = hook?.runtimeBinding?.effectOptions?.offsetValues || {};
  if (offsetValues && typeof offsetValues === "object" && !Array.isArray(offsetValues)) {
    for (const [offset, values] of Object.entries(offsetValues)) {
      for (const value of Array.isArray(values) ? values : [values]) push(offset, value);
    }
  }

  for (const arg of listValue(hook?.runtimeBinding?.effectOptionFloatArgs)) {
    const match = String(arg).match(/^(0x[0-9a-f]+):([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
    if (!match) continue;
    push(match[1], match[2]);
  }

  return pairs;
}

function nativePercentParamOffsets(hook) {
  return uniqueSorted(nativePercentParamValues(hook).map((pair) => pair.split(":")[0]));
}

function isPfxAreaShapeDiagnosticReason(reason) {
  return reason === "pfx-area-shape-evidence-missing" || reason === "pfx-area-shape-runtime-hidden";
}

function isPfxAreaShapeRuntimeHiddenBlockClass(blockClass) {
  return blockClass === "blocked-zero-size-callback" || blockClass === "blocked-fallback-zero-size-callback";
}

function isPfxAreaShapeRuntimeOverlayBlockClass(blockClass) {
  return /^blocked-ios-encrypted-/.test(blockClass || "");
}

function areaShapeGapRuntimeRequirement(blockClass) {
  if (isPfxAreaShapeRuntimeOverlayBlockClass(blockClass)) return "requires-runtime-overlay";
  if (isPfxAreaShapeRuntimeHiddenBlockClass(blockClass)) return "runtime-hidden";
  if (blockClass === "blocked-random-range-callback") return "requires-native-callback-runtime";
  if (blockClass === "blocked-native-percent-param-callback") return "requires-native-percent-runtime";
  if (blockClass) return "requires-shape-callback-semantics";
  return "";
}

function areaSurfaceHasShapeEvidence(surfaceRecord, shadergraphItem, hook = {}) {
  if (pfxSurfaceShapeSizeScalar(surfaceRecord) !== null) return true;
  if (hookNativeScaleValue(hook) !== null) return true;
  if (shadergraphItem?.previewSurfaceRenderable === true) return true;
  return shadergraphHasResolvedUvRuntime(shadergraphItem);
}

function areaSurfaceHasSiblingShapeEvidence(surfaceRecord, shadergraphItem, hook = {}, surfaceRecords = []) {
  if (!surfaceRecord?.relativePath) return false;
  return (surfaceRecords || []).some(
    (siblingRecord) =>
      siblingRecord !== surfaceRecord &&
      siblingRecord?.relativePath === surfaceRecord.relativePath &&
      siblingRecord?.prelude?.renderFamily === "area" &&
      areaSurfaceHasShapeEvidence(siblingRecord, shadergraphItem, hook),
  );
}

function areaSurfaceShapeGapReason(surfaceRecord, shadergraphItem, hook = {}) {
  if (surfaceRecord?.prelude?.renderFamily !== "area") return "";
  if (!/card-risk/.test(shadergraphItem?.previewSurfaceRejectReason || "")) return "";
  if (areaSurfaceHasShapeEvidence(surfaceRecord, shadergraphItem, hook)) return "";
  return "missing-area-shape-evidence";
}

function parameterSemanticSlotSummary(slot) {
  if (!slot?.name) return "";
  return `${slot.name}@${slot.relativeOffset}=${slot.value}`;
}

function sampledFloatSummary(sample) {
  if (!Number.isFinite(Number(sample?.relativeOffset)) || !Number.isFinite(Number(sample?.value))) return "";
  return `${sample.relativeOffset}:${sample.value}`;
}

function shapeCallbackRuntimeSlot(surfaceRecord, callback = {}) {
  const slots = surfaceRecord?.emitterRuntimeProfile?.semanticSlots || [];
  if (!slots.length) return {};
  return (
    slots.find(
      (slot) =>
        Number.isFinite(Number(callback.relativeOffset)) &&
        Number.isFinite(Number(slot.relativeOffset)) &&
        Number(slot.relativeOffset) === Number(callback.relativeOffset),
    ) ||
    slots.find(
      (slot) =>
        callback.runtimeOffset &&
        slot.runtimeOffset &&
        String(slot.runtimeOffset) === String(callback.runtimeOffset) &&
        (!callback.targetArraySemantic || !slot.targetArraySemantic || slot.targetArraySemantic === callback.targetArraySemantic),
    ) ||
    {}
  );
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function packedLiteralFloatSummary(candidates = []) {
  return (candidates || [])
    .map((candidate) => {
      const value = Number(candidate?.value);
      if (!Number.isFinite(value)) return "";
      const offset = candidate?.byteOffset ?? "";
      return `${offset}@${value}`;
    })
    .filter(Boolean)
    .join(",");
}

function shapeCallbackSummary(name, slot, runtimeSlot = {}) {
  if (!slot) return "";
  const parts = [name];
  if (slot.resolverCurrentCallbackAddress) parts.push(`current=${slot.resolverCurrentCallbackAddress}`);
  if (slot.resolverCurrentCallbackSemanticClass) parts.push(`currentClass=${slot.resolverCurrentCallbackSemanticClass}`);
  if (slot.resolverCurrentCallbackEvidenceSource) parts.push(`currentEvidence=${slot.resolverCurrentCallbackEvidenceSource}`);
  if (slot.resolverFallbackCallbackAddress) parts.push(`fallback=${slot.resolverFallbackCallbackAddress}`);
  if (slot.resolverFallbackCallbackSemanticClass) parts.push(`fallbackClass=${slot.resolverFallbackCallbackSemanticClass}`);
  if (slot.resolverFallbackCallbackEvidenceSource) parts.push(`fallbackEvidence=${slot.resolverFallbackCallbackEvidenceSource}`);
  if (slot.callbackOutputComponents || runtimeSlot.callbackOutputComponents) {
    parts.push(`components=${slot.callbackOutputComponents || runtimeSlot.callbackOutputComponents}`);
  }
  if (slot.resolverCurrentCallbackOutputStore || runtimeSlot.resolverCurrentCallbackOutputStore) {
    parts.push(`currentStore=${slot.resolverCurrentCallbackOutputStore || runtimeSlot.resolverCurrentCallbackOutputStore}`);
  }
  const currentDependencyFlags = listValue(
    firstDefined(slot.resolverCurrentCallbackDependencyFlags, runtimeSlot.resolverCurrentCallbackDependencyFlags),
  );
  if (currentDependencyFlags.length) parts.push(`currentDeps=${currentDependencyFlags.join(",")}`);
  const fallbackDependencyFlags = listValue(
    firstDefined(slot.resolverFallbackCallbackDependencyFlags, runtimeSlot.resolverFallbackCallbackDependencyFlags),
  );
  if (fallbackDependencyFlags.length) parts.push(`fallbackDeps=${fallbackDependencyFlags.join(",")}`);
  const fallbackConstantValue = firstDefined(
    slot.resolverFallbackCallbackConstantValue,
    runtimeSlot.resolverFallbackCallbackConstantValue,
  );
  if (Number.isFinite(Number(fallbackConstantValue))) parts.push(`fallbackConst=${roundFloat(Number(fallbackConstantValue))}`);
  const currentConstantValue = firstDefined(
    slot.resolverCurrentCallbackConstantValue,
    runtimeSlot.resolverCurrentCallbackConstantValue,
  );
  if (Number.isFinite(Number(currentConstantValue))) parts.push(`currentConst=${roundFloat(Number(currentConstantValue))}`);
  const currentFirstComponentValue = firstDefined(
    slot.resolverCurrentCallbackFirstComponentValue,
    runtimeSlot.resolverCurrentCallbackFirstComponentValue,
  );
  if (Number.isFinite(Number(currentFirstComponentValue))) {
    parts.push(`currentFirst=${roundFloat(Number(currentFirstComponentValue))}`);
  }
  const randomMinValue = firstDefined(slot.resolverCurrentCallbackRandomMinValue, runtimeSlot.resolverCurrentCallbackRandomMinValue);
  const randomMaxValue = firstDefined(slot.resolverCurrentCallbackRandomMaxValue, runtimeSlot.resolverCurrentCallbackRandomMaxValue);
  if (Number.isFinite(Number(randomMinValue)) && Number.isFinite(Number(randomMaxValue))) {
    parts.push(`randomRange=${roundFloat(Number(randomMinValue))}..${roundFloat(Number(randomMaxValue))}`);
  }
  const curveMinValue = firstDefined(slot.resolverCurrentCallbackCurveMinValue, runtimeSlot.resolverCurrentCallbackCurveMinValue);
  const curveMaxValue = firstDefined(slot.resolverCurrentCallbackCurveMaxValue, runtimeSlot.resolverCurrentCallbackCurveMaxValue);
  if (Number.isFinite(Number(curveMinValue)) && Number.isFinite(Number(curveMaxValue))) {
    parts.push(`curveRange=${roundFloat(Number(curveMinValue))}..${roundFloat(Number(curveMaxValue))}`);
  }
  if (slot.resolverCurrentCallbackPattern16ReadStatus || runtimeSlot.resolverCurrentCallbackPattern16ReadStatus) {
    parts.push(`pattern16Read=${slot.resolverCurrentCallbackPattern16ReadStatus || runtimeSlot.resolverCurrentCallbackPattern16ReadStatus}`);
  }
  if (slot.resolverCurrentCallbackCurveTableReadStatus || runtimeSlot.resolverCurrentCallbackCurveTableReadStatus) {
    parts.push(`curveTableRead=${slot.resolverCurrentCallbackCurveTableReadStatus || runtimeSlot.resolverCurrentCallbackCurveTableReadStatus}`);
  }
  const inputKind = firstDefined(slot.resolverInputKind, runtimeSlot.resolverInputKind);
  if (inputKind) parts.push(`input=${inputKind}`);
  const inputValue = firstDefined(slot.resolverInputValue, runtimeSlot.resolverInputValue);
  if (inputValue) parts.push(`inputValue=${inputValue}`);
  const tableStatus = firstDefined(slot.resolverTableCompatibilityStatus, runtimeSlot.resolverTableCompatibilityStatus);
  if (tableStatus) parts.push(`table=${tableStatus}`);
  const currentBuildStatus = firstDefined(slot.resolverCurrentBuildStatus, runtimeSlot.resolverCurrentBuildStatus);
  if (currentBuildStatus) parts.push(`currentBuild=${currentBuildStatus}`);
  const resolutionStatus = firstDefined(slot.resolverResolutionStatus, runtimeSlot.resolverResolutionStatus);
  if (resolutionStatus) parts.push(`resolution=${resolutionStatus}`);
  const packedFloats = packedLiteralFloatSummary(
    firstDefined(slot.resolverPackedLiteralFloatCandidates, runtimeSlot.resolverPackedLiteralFloatCandidates) || [],
  );
  if (packedFloats) parts.push(`packedFloats=${packedFloats}`);
  return parts.length > 1 ? parts.join(":") : "";
}

function pfxShapeCallbackSummaries(surfaceRecord) {
  const profile = surfaceRecord?.shapeProfile || {};
  return [
    shapeCallbackSummary(
      "initialSizeCallback",
      profile.initialSizeCallback,
      shapeCallbackRuntimeSlot(surfaceRecord, profile.initialSizeCallback),
    ),
    shapeCallbackSummary("sizeCallback", profile.sizeCallback, shapeCallbackRuntimeSlot(surfaceRecord, profile.sizeCallback)),
  ].filter(Boolean);
}

function pfxAreaShapeGapRowsForHook(hook, runtimeEvidence = {}) {
  const rows = [];
  const pfxByPath = runtimeEvidence.pfxResourceByPath || new Map();
  const shadergraphByPath = runtimeEvidence.shadergraphByPath || new Map();
  for (const pfxPath of listValue(hook.resourcePaths)) {
    const pfxItem = pfxByPath.get(pfxPath);
    if (!pfxItem) continue;
    const surfaceRecords = pfxItem.surfaceRecords || [];
    for (const surfaceRecord of surfaceRecords) {
      const shadergraphItem = shadergraphByPath.get(surfaceRecord.relativePath);
      if (!shadergraphItem) continue;
      const shapeGapReason = areaSurfaceShapeGapReason(surfaceRecord, shadergraphItem, hook);
      if (!shapeGapReason) continue;
      if (areaSurfaceHasSiblingShapeEvidence(surfaceRecord, shadergraphItem, hook, surfaceRecords)) continue;
      const percentParamValues = nativePercentParamValues(hook);
      const pfxShapeCallbacks = pfxShapeCallbackSummaries(surfaceRecord);
      const shapeCallbackDiagnostics = areaShapeGapCallbackDiagnostics(pfxShapeCallbacks);
      const shapeGapBlockClass = areaShapeGapBlockClass(shapeCallbackDiagnostics, {
        nativePercentParamValues: percentParamValues,
      });
      const shapeRuntimeRequirement = areaShapeGapRuntimeRequirement(shapeGapBlockClass);
      const diagnosticReason =
        isPfxAreaShapeRuntimeHiddenBlockClass(shapeGapBlockClass)
          ? "pfx-area-shape-runtime-hidden"
          : "pfx-area-shape-evidence-missing";
      rows.push({
        id: `${hook.id || hook.effectToken || hook.token || "hook"}:pfx-area-shape:${pfxPath}:Surface[${surfaceRecord.surfaceIndex}]`,
        sourceKind: hook.sourceKind || "",
        effectToken: hook.effectToken || hook.token || "",
        token: hook.token || hook.effectToken || "",
        reason: diagnosticReason,
        renderPromotionAllowed: false,
        actionKeys: listValue(hook.actionKeys),
        heroCodes: listValue(hook.heroCodes),
        heroNames: listValue(hook.heroNames),
        heroResourceRoots: effectResourceRootsForHook(hook, runtimeEvidence.definitionRows || [], runtimeEvidence),
        missingEffectResourceRoots: [],
        placeholderDefinitionRoots: [],
        existingResourcePaths: [pfxPath],
        existingShadergraphPaths: [shadergraphItem.relativePath],
        shadergraphEvidenceSource: hook.shadergraphEvidenceSource || "",
        resourceEvidenceSource: hook.resourceEvidenceSource || "",
        aliasEvidenceStrength: hook.aliasEvidenceStrength || "",
        nativeRuntimeKind: hook.runtimeBinding?.kind || "",
        nativeBindKind: hook.bindKind || "",
        nativeEffectOptionOffsets: listValue(hook.runtimeBinding?.effectOptionOffsets),
        nativeEffectOptionFloatArgs: listValue(hook.runtimeBinding?.effectOptionFloatArgs),
        nativeEffectOptions: hook.runtimeBinding?.effectOptions || null,
        nativeActionNames: listValue(hook.nativeActionNames || hook.actionNames),
        nativeNearbyEffectTokens: listValue(hook.nativeNearbyEffectTokens || hook.nearbyEffectTokens),
        nativeNearbyBuffTokens: listValue(hook.nativeNearbyBuffTokens || hook.nearbyBuffTokens),
        nativeNearbyAbilityNames: listValue(hook.nativeNearbyAbilityNames || hook.nearbyAbilityNames),
        nativeNearbySoundTokens: listValue(hook.nativeNearbySoundTokens || hook.nearbySoundTokens),
        nativeSemanticCalls: listValue(hook.nativeSemanticCalls),
        selectorOutputTarget: hook.selectorOutputTarget || "",
        selectorOutputRole: hook.selectorOutputRole || "",
        selectorOutputSiblingTokens: [],
        selectorOutputSiblingRoles: [],
        pairedSelectorOutputTokens: [],
        pairedSelectorOutputRoles: [],
        pairedSelectorOutputResourcePaths: [],
        globalCandidateResourcePaths: [],
        kindredCandidateCount: 0,
        kindredCandidateResourcePaths: [],
        kindredCandidateModelLabels: [],
        kindredCandidateRoles: [],
        pfxPath,
        shadergraphPath: shadergraphItem.relativePath,
        surfaceIndex: surfaceRecord.surfaceIndex,
        shapeGapReason:
          diagnosticReason === "pfx-area-shape-runtime-hidden" ? "zero-size-callback-runtime-hidden" : shapeGapReason,
        pfxRenderFamily: surfaceRecord.prelude?.renderFamily || "",
        previewSurfaceRejectReason: shadergraphItem.previewSurfaceRejectReason || "",
        previewTexture: shadergraphItem.previewTexture || "",
        previewTextureMode: shadergraphItem.previewTextureMode || "",
        previewTextureAlphaCoverage: finiteNumber(shadergraphItem.previewTextureAlphaCoverage),
        previewTextureSpriteUsable: shadergraphItem.previewTextureSpriteUsable === true,
        parameterEvidenceClass: surfaceRecord.parameterProfile?.evidenceClass || "",
        parameterSemanticSlots: (surfaceRecord.parameterProfile?.semanticSlots || []).map(parameterSemanticSlotSummary).filter(Boolean),
        sampledFloatOffsets: (surfaceRecord.sampledFloats || []).map(sampledFloatSummary).filter(Boolean),
        runtimeHintKeys: Object.keys(surfaceRecord.runtimeHints || {}).filter((key) => key !== "timingSourceOffsets").sort(),
        pfxShapeCallbacks,
        areaShapeGapBlockClass: shapeGapBlockClass,
        areaShapeGapRuntimeRequirement: shapeRuntimeRequirement,
        runtimeOverlayRequired: shapeRuntimeRequirement === "requires-runtime-overlay",
        ...shapeCallbackDiagnostics,
        nativePercentParamOffsets: nativePercentParamOffsets(hook),
        nativePercentParamValues: percentParamValues,
        source: {
          functionName: hook.source?.functionName || "",
          line: hook.source?.line ?? "",
        },
      });
    }
  }
  return rows;
}

function buildEffectRuntimeGapReport(
  {
    effectHookManifest = {},
    kindredSlots = {},
    projectileRuntime = {},
    pfxResourceManifest = {},
    shadergraphMaterialManifest = {},
    effectResourceRows = [],
    definitionRows = [],
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const hooks = Array.isArray(effectHookManifest) ? effectHookManifest : effectHookManifest.items || [];
  const slots = Array.isArray(kindredSlots) ? kindredSlots : kindredSlots.items || [];
  const projectileRows = Array.isArray(projectileRuntime) ? projectileRuntime : projectileRuntime.items || [];
  const pfxItems = Array.isArray(pfxResourceManifest) ? pfxResourceManifest : pfxResourceManifest.items || [];
  const shadergraphItems = Array.isArray(shadergraphMaterialManifest) ? shadergraphMaterialManifest : shadergraphMaterialManifest.items || [];
  const projectileRuntimeHookIndex = buildProjectileRuntimeHookTokenIndex(projectileRows);
  const runtimeEvidence = {
    definitionRows,
    effectResourceRows,
    effectResourceRoots: effectResourceRootSet(effectResourceRows),
    kindredResourceRootByHero: buildKindredResourceRootIndex(slots),
    selectorOutputsByGroup: buildSelectorOutputIndex(hooks),
    resourceBoundSelectorOutputsByGroup: buildResourceBoundSelectorOutputIndex(hooks),
    pfxResourceByPath: buildItemIndexByRelativePath(pfxItems),
    shadergraphByPath: buildItemIndexByRelativePath(shadergraphItems),
  };
  const resourceBoundCoverageIndex = buildResourceBoundHookCoverageIndex(hooks);
  const gapHooks = hooks.filter((hook) => isGapHook(hook, resourceBoundCoverageIndex));
  const nativePrimitiveRenderableHooks = hooks.filter(
    (hook) => !listValue(hook.resourcePaths).length && !listValue(hook.shadergraphPaths).length && hookHasNativePrimitiveOptions(hook),
  );
  const nativePrimitiveRenderableItems = nativePrimitiveRenderableHooks.map(nativePrimitiveRenderableRowForHook);
  const projectileLinkedHooks = gapHooks.filter((hook) => projectileRuntimeRowsForHook(hook, projectileRuntimeHookIndex).length);
  const items = gapHooks
    .filter((hook) => !projectileRuntimeRowsForHook(hook, projectileRuntimeHookIndex).length)
    .map((hook) => gapRowForHook(hook, slots, runtimeEvidence));
  items.push(...hooks.flatMap((hook) => pfxAreaShapeGapRowsForHook(hook, runtimeEvidence)));
  items.sort((left, right) => left.reason.localeCompare(right.reason) || left.effectToken.localeCompare(right.effectToken) || left.id.localeCompare(right.id));
  const summary = summarizeEffectRuntimeGapRows(items);
  summary.projectileRuntimeLinkedRows = projectileLinkedHooks.length;
  summary.projectileRuntimeLinkedTokens = uniqueSorted(projectileLinkedHooks.map((hook) => hook.effectToken || hook.token)).length;
  summary.nativePrimitiveRenderableRows = nativePrimitiveRenderableHooks.length;
  summary.nativePrimitiveRenderableTokens = uniqueSorted(nativePrimitiveRenderableHooks.map((hook) => hook.effectToken || hook.token)).length;
  return {
    generatedAt,
    source: {
      effectHookPath: defaultEffectHookPath,
      kindredSlotPath: defaultKindredSlotPath,
      projectileRuntimePath: defaultProjectileRuntimePath,
      pfxResourcePath: defaultPfxResourcePath,
      shadergraphMaterialPath: defaultShadergraphMaterialPath,
      effectResourcePath: defaultEffectResourcePath,
      definitionChainPath: defaultDefinitionChainPath,
    },
    summary,
    items,
    nativePrimitiveRenderableItems,
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function firstPfxShapeCallbackMetric(callbacks, pattern, fallback = "(none)") {
  const text = (callbacks || []).join("|");
  const match = text.match(pattern);
  return match?.[1] || fallback;
}

function pfxShapeCallbackText(callbacks, name) {
  return (callbacks || []).find((callback) => String(callback).startsWith(`${name}:`)) || "";
}

function firstPfxShapeCallbackNamedMetric(callbacks, name, pattern, fallback = "(none)") {
  const text = pfxShapeCallbackText(callbacks, name);
  const match = text.match(pattern);
  return match?.[1] || fallback;
}

function numericMetricValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rangeMetricValues(value) {
  const match = String(value || "").match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\.\.([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function packedLiteralSignFromText(text) {
  const match = String(text || "").match(/(?:^|:)packedFloats=([^:|]+)/);
  const packedFloats = match?.[1] || "";
  if (!packedFloats) return "(none)";
  const values = packedFloats
    .split(",")
    .map((item) => Number(item.split("@").pop()))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return "(none)";
  const hasNegative = values.some((value) => value < 0);
  const hasPositive = values.some((value) => value > 0);
  if (hasNegative && hasPositive) return "mixed";
  if (hasNegative) return "negative";
  if (hasPositive) return "positive";
  return "zero";
}

function firstPfxShapeCallbackPackedLiteralSign(callbacks) {
  const sizeCallbackText = pfxShapeCallbackText(callbacks, "sizeCallback");
  if (sizeCallbackText) return packedLiteralSignFromText(sizeCallbackText);
  return packedLiteralSignFromText((callbacks || []).join("|"));
}

function areaShapeGapCallbackDiagnostics(callbacks) {
  const sizeCallbackInputKind = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)input=([^:|]+)/);
  const sizeCallbackResolutionStatus = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)resolution=([^:|]+)/);
  const sizeCallbackPackedLiteralSign = firstPfxShapeCallbackPackedLiteralSign(callbacks);
  const sizeCallbackCurrentStore = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)currentStore=([^:|]+)/,
    "",
  );
  const sizeCallbackCurrentClass = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)currentClass=([^:|]+)/);
  const sizeCallbackFallbackClass = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)fallbackClass=([^:|]+)/);
  const sizeCallbackCurrentEvidenceSource = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)currentEvidence=([^:|]+)/,
    "",
  );
  const sizeCallbackFallbackEvidenceSource = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)fallbackEvidence=([^:|]+)/,
    "",
  );
  const sizeCallbackInputValue = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)inputValue=([^:|]+)/, "");
  const sizeCallbackTableCompatibilityStatus = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)table=([^:|]+)/, "");
  const sizeCallbackCurrentBuildStatus = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)currentBuild=([^:|]+)/, "");
  const sizeCallbackCurrentConstantValue = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)currentConst=([^:|]+)/,
    "",
  );
  const sizeCallbackFallbackConstantValue = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)fallbackConst=([^:|]+)/,
    "",
  );
  const sizeCallbackCurrentFirstComponentValue = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)currentFirst=([^:|]+)/,
    "",
  );
  const sizeCallbackRandomRange = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)randomRange=([^:|]+)/, "");
  const sizeCallbackCurveRange = firstPfxShapeCallbackNamedMetric(callbacks, "sizeCallback", /(?:^|:)curveRange=([^:|]+)/, "");
  const sizeCallbackPattern16ReadStatus = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)pattern16Read=([^:|]+)/,
    "",
  );
  const sizeCallbackCurveTableReadStatus = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)curveTableRead=([^:|]+)/,
    "",
  );
  const sizeCallbackCurrentDependencyFlags = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)currentDeps=([^:|]+)/,
    "",
  );
  const sizeCallbackFallbackDependencyFlags = firstPfxShapeCallbackNamedMetric(
    callbacks,
    "sizeCallback",
    /(?:^|:)fallbackDeps=([^:|]+)/,
    "",
  );
  return {
    areaShapeGapCallbackComponents: firstPfxShapeCallbackMetric(callbacks, /(?:^|:)components=([^:|]+)/),
    areaShapeGapCurrentStore: firstPfxShapeCallbackMetric(callbacks, /(?:^|:)currentStore=([^:|]+)/),
    areaShapeGapResolverInputKind: sizeCallbackInputKind,
    areaShapeGapResolutionStatus: sizeCallbackResolutionStatus,
    areaShapeGapPackedLiteralSign: firstPfxShapeCallbackPackedLiteralSign(callbacks),
    areaShapeGapSizeCallbackResolverInputKind: sizeCallbackInputKind,
    areaShapeGapSizeCallbackResolutionStatus: sizeCallbackResolutionStatus,
    areaShapeGapSizeCallbackPackedLiteralSign: sizeCallbackPackedLiteralSign,
    areaShapeGapSizeCallbackCurrentClass: sizeCallbackCurrentClass,
    areaShapeGapSizeCallbackFallbackClass: sizeCallbackFallbackClass,
    areaShapeGapSizeCallbackCurrentEvidenceSource: sizeCallbackCurrentEvidenceSource,
    areaShapeGapSizeCallbackFallbackEvidenceSource: sizeCallbackFallbackEvidenceSource,
    areaShapeGapSizeCallbackInputValue: sizeCallbackInputValue,
    areaShapeGapSizeCallbackTableCompatibilityStatus: sizeCallbackTableCompatibilityStatus,
    areaShapeGapSizeCallbackCurrentBuildStatus: sizeCallbackCurrentBuildStatus,
    areaShapeGapSizeCallbackCurrentConstantValue: sizeCallbackCurrentConstantValue,
    areaShapeGapSizeCallbackFallbackConstantValue: sizeCallbackFallbackConstantValue,
    areaShapeGapSizeCallbackCurrentFirstComponentValue: sizeCallbackCurrentFirstComponentValue,
    areaShapeGapSizeCallbackRandomRange: sizeCallbackRandomRange,
    areaShapeGapSizeCallbackCurveRange: sizeCallbackCurveRange,
    areaShapeGapMissingCurrentStoreResolverInputKind: sizeCallbackCurrentStore ? "" : sizeCallbackInputKind,
    areaShapeGapMissingCurrentStoreCurrentClass: sizeCallbackCurrentStore ? "" : sizeCallbackCurrentClass,
    areaShapeGapPattern16ReadStatus: sizeCallbackPattern16ReadStatus,
    areaShapeGapCurveTableReadStatus: sizeCallbackCurveTableReadStatus,
    areaShapeGapSizeCallbackCurrentDependencyFlags: sizeCallbackCurrentDependencyFlags,
    areaShapeGapSizeCallbackFallbackDependencyFlags: sizeCallbackFallbackDependencyFlags,
  };
}

function hasFallbackZeroSizeEvidence(diagnostics = {}) {
  const fallbackClass = diagnostics.areaShapeGapSizeCallbackFallbackClass || "";
  const fallbackValue = numericMetricValue(diagnostics.areaShapeGapSizeCallbackFallbackConstantValue);
  const currentEvidenceSource = diagnostics.areaShapeGapSizeCallbackCurrentEvidenceSource || "";
  const fallbackEvidenceSource = diagnostics.areaShapeGapSizeCallbackFallbackEvidenceSource || "";
  return (
    /zero/i.test(fallbackClass) &&
    fallbackValue === 0 &&
    /ghidra-source-containing/i.test(currentEvidenceSource) &&
    fallbackEvidenceSource === "ghidra-source"
  );
}

function areaShapeGapBlockClass(diagnostics = {}, item = {}) {
  const patternReadStatus = diagnostics.areaShapeGapPattern16ReadStatus || "";
  const curveTableReadStatus = diagnostics.areaShapeGapCurveTableReadStatus || "";
  if (/encrypted-range/i.test(patternReadStatus) && /encrypted-range/i.test(curveTableReadStatus)) {
    return "blocked-ios-encrypted-pattern-curve-data";
  }
  if (/encrypted-range/i.test(patternReadStatus)) {
    return "blocked-ios-encrypted-pattern16-data";
  }
  if (/encrypted-range/i.test(curveTableReadStatus)) {
    return "blocked-ios-encrypted-curve-table-data";
  }
  if (patternReadStatus || curveTableReadStatus) {
    return "blocked-callback-data-unreadable";
  }
  if (diagnostics.areaShapeGapSizeCallbackResolverInputKind === "packed-literal") {
    if (/cross-build/i.test(diagnostics.areaShapeGapSizeCallbackTableCompatibilityStatus || "")) {
      return "blocked-cross-build-callback-key";
    }
    if (
      diagnostics.areaShapeGapSizeCallbackPackedLiteralSign === "negative" ||
      diagnostics.areaShapeGapSizeCallbackPackedLiteralSign === "mixed"
    ) {
      return "blocked-packed-literal-sign";
    }
    return "blocked-packed-literal-layout";
  }
  if (diagnostics.areaShapeGapMissingCurrentStoreResolverInputKind) return "blocked-unresolved-output-store";
  const currentStore = diagnostics.areaShapeGapCurrentStore || "";
  if (/zero/i.test(diagnostics.areaShapeGapSizeCallbackCurrentClass || "")) return "blocked-zero-size-callback";
  if (hasFallbackZeroSizeEvidence(diagnostics)) return "blocked-fallback-zero-size-callback";
  if (item.nativePercentParamValues?.length) return "blocked-native-percent-param-callback";
  const randomRange = rangeMetricValues(diagnostics.areaShapeGapSizeCallbackRandomRange);
  if (randomRange && randomRange.max >= 300 && randomRange.max <= 720) return "blocked-random-range-callback";
  if (/half-float-unpack/i.test(currentStore)) return "blocked-dependent-source-array-callback";
  if (/computed-byte-grid-to-param1/i.test(currentStore)) return "blocked-dependent-source-array-callback";
  if (/side-effect-no-particle-output/i.test(currentStore)) return "blocked-non-particle-output-callback";
  const constantValue = numericMetricValue(diagnostics.areaShapeGapSizeCallbackCurrentConstantValue);
  const firstComponentValue = numericMetricValue(diagnostics.areaShapeGapSizeCallbackCurrentFirstComponentValue);
  const scalarValue = constantValue ?? firstComponentValue;
  if (Number.isFinite(scalarValue) && scalarValue > 64) return "blocked-large-constant-callback";
  if (/computed-scalar-to-param3/i.test(currentStore)) return "blocked-dynamic-timeline-size-callback";
  if (/computed/i.test(diagnostics.areaShapeGapSizeCallbackCurrentClass || "")) return "blocked-computed-size-callback";
  return "blocked-unknown-shape-callback";
}

function summarizeEffectRuntimeGapRows(items) {
  const pfxAreaItems = (items || []).filter((item) => isPfxAreaShapeDiagnosticReason(item.reason));
  const runtimeOverlayItems = pfxAreaItems.filter((item) => item.runtimeOverlayRequired === true);
  const runtimeHiddenItems = pfxAreaItems.filter(
    (item) => (item.areaShapeGapRuntimeRequirement || "") === "runtime-hidden",
  );
  const previewBlockedItems = (items || []).filter((item) => item.renderPromotionAllowed !== true);
  const byReason = {};
  const bySourceKind = {};
  const byAreaShapeGapBlockClass = {};
  const byAreaShapeGapCallbackComponents = {};
  const byAreaShapeGapCurrentStore = {};
  const byAreaShapeGapSizeCallbackCurrentClass = {};
  const byAreaShapeGapResolverInputKind = {};
  const byAreaShapeGapResolutionStatus = {};
  const byAreaShapeGapPackedLiteralSign = {};
  const byAreaShapeGapSizeCallbackResolverInputKind = {};
  const byAreaShapeGapSizeCallbackResolutionStatus = {};
  const byAreaShapeGapSizeCallbackPackedLiteralSign = {};
  const byAreaShapeGapSizeCallbackTableCompatibilityStatus = {};
  const byAreaShapeGapSizeCallbackCurrentBuildStatus = {};
  const byAreaShapeGapMissingCurrentStoreResolverInputKind = {};
  const byAreaShapeGapMissingCurrentStoreCurrentClass = {};
  const byAreaShapeGapSizeCallbackFallbackClass = {};
  const byAreaShapeGapSizeCallbackCurrentEvidenceSource = {};
  const byAreaShapeGapSizeCallbackFallbackEvidenceSource = {};
  const byAreaShapeGapSizeCallbackFallbackConstantValue = {};
  const byAreaShapeGapSizeCallbackCurrentConstantValue = {};
  const byAreaShapeGapSizeCallbackCurrentFirstComponentValue = {};
  const byAreaShapeGapSizeCallbackRandomRange = {};
  const byAreaShapeGapSizeCallbackCurveRange = {};
  const byAreaShapeGapSizeCallbackCurrentDependencyFlags = {};
  const byAreaShapeGapPattern16ReadStatus = {};
  const byAreaShapeGapCurveTableReadStatus = {};
  const byAreaShapeGapRuntimeRequirement = {};
  for (const item of items || []) {
    increment(byReason, item.reason);
    increment(bySourceKind, item.sourceKind);
    if (isPfxAreaShapeDiagnosticReason(item.reason)) {
      const diagnostics = areaShapeGapCallbackDiagnostics(item.pfxShapeCallbacks);
      const blockClass = item.areaShapeGapBlockClass || areaShapeGapBlockClass(diagnostics, item);
      increment(byAreaShapeGapBlockClass, blockClass);
      increment(byAreaShapeGapRuntimeRequirement, item.areaShapeGapRuntimeRequirement || areaShapeGapRuntimeRequirement(blockClass));
      increment(byAreaShapeGapCallbackComponents, diagnostics.areaShapeGapCallbackComponents);
      increment(byAreaShapeGapCurrentStore, diagnostics.areaShapeGapCurrentStore);
      increment(byAreaShapeGapResolverInputKind, diagnostics.areaShapeGapResolverInputKind);
      increment(byAreaShapeGapResolutionStatus, diagnostics.areaShapeGapResolutionStatus);
      increment(byAreaShapeGapPackedLiteralSign, diagnostics.areaShapeGapPackedLiteralSign);
      increment(byAreaShapeGapSizeCallbackResolverInputKind, diagnostics.areaShapeGapSizeCallbackResolverInputKind);
      increment(byAreaShapeGapSizeCallbackResolutionStatus, diagnostics.areaShapeGapSizeCallbackResolutionStatus);
      increment(byAreaShapeGapSizeCallbackPackedLiteralSign, diagnostics.areaShapeGapSizeCallbackPackedLiteralSign);
      increment(byAreaShapeGapSizeCallbackTableCompatibilityStatus, diagnostics.areaShapeGapSizeCallbackTableCompatibilityStatus);
      increment(byAreaShapeGapSizeCallbackCurrentBuildStatus, diagnostics.areaShapeGapSizeCallbackCurrentBuildStatus);
      increment(byAreaShapeGapSizeCallbackCurrentConstantValue, diagnostics.areaShapeGapSizeCallbackCurrentConstantValue);
      increment(byAreaShapeGapSizeCallbackFallbackConstantValue, diagnostics.areaShapeGapSizeCallbackFallbackConstantValue);
      increment(byAreaShapeGapSizeCallbackCurrentFirstComponentValue, diagnostics.areaShapeGapSizeCallbackCurrentFirstComponentValue);
      increment(byAreaShapeGapSizeCallbackRandomRange, diagnostics.areaShapeGapSizeCallbackRandomRange);
      increment(byAreaShapeGapSizeCallbackCurveRange, diagnostics.areaShapeGapSizeCallbackCurveRange);
      increment(byAreaShapeGapSizeCallbackCurrentDependencyFlags, diagnostics.areaShapeGapSizeCallbackCurrentDependencyFlags);
      if (diagnostics.areaShapeGapMissingCurrentStoreResolverInputKind) {
        increment(byAreaShapeGapMissingCurrentStoreResolverInputKind, diagnostics.areaShapeGapMissingCurrentStoreResolverInputKind);
        increment(byAreaShapeGapMissingCurrentStoreCurrentClass, diagnostics.areaShapeGapMissingCurrentStoreCurrentClass);
      }
      if (diagnostics.areaShapeGapPattern16ReadStatus) {
        increment(byAreaShapeGapPattern16ReadStatus, diagnostics.areaShapeGapPattern16ReadStatus);
      }
      if (diagnostics.areaShapeGapCurveTableReadStatus) {
        increment(byAreaShapeGapCurveTableReadStatus, diagnostics.areaShapeGapCurveTableReadStatus);
      }
      increment(byAreaShapeGapSizeCallbackCurrentClass, diagnostics.areaShapeGapSizeCallbackCurrentClass);
      increment(byAreaShapeGapSizeCallbackFallbackClass, diagnostics.areaShapeGapSizeCallbackFallbackClass);
      increment(byAreaShapeGapSizeCallbackCurrentEvidenceSource, diagnostics.areaShapeGapSizeCallbackCurrentEvidenceSource);
      increment(byAreaShapeGapSizeCallbackFallbackEvidenceSource, diagnostics.areaShapeGapSizeCallbackFallbackEvidenceSource);
    }
  }
  return {
    rows: items.length,
    noResourceRows: items.filter((item) => !item.existingResourcePaths.length && !item.existingShadergraphPaths.length).length,
    effectRuntimePreviewTakeoverAllowed: items.length === 0,
    effectRuntimePreviewBlockedRows: previewBlockedItems.length,
    weakCandidateRows: items.filter((item) => item.reason === "weak-resource-candidate").length,
    kindredCandidateRows: items.filter((item) => item.kindredCandidateCount > 0).length,
    selectorOutputPairedRows: items.filter((item) => item.pairedSelectorOutputResourcePaths.length > 0).length,
    selectorOutputMissingPairRows: items.filter((item) => item.reason === "selector-output-paired-resource-missing").length,
    globalResourceCandidateRows: items.filter((item) => item.globalCandidateResourcePaths.length > 0).length,
    definitionExtraResourceRootRows: items.filter((item) => item.reason === "definition-extra-resource-root-without-effect-package").length,
    nativeEffectChannelRows: items.filter((item) => item.reason === "native-effect-channel-resource-unresolved").length,
    areaShapeGapRows: items.filter((item) => item.reason === "pfx-area-shape-evidence-missing").length,
    areaShapeRuntimeHiddenRows: items.filter((item) => item.reason === "pfx-area-shape-runtime-hidden").length,
    areaShapeNativePercentParamRows: items.filter(
      (item) => item.reason === "pfx-area-shape-evidence-missing" && item.nativePercentParamValues?.length,
    ).length,
    areaShapeRuntimeOverlayRequiredRows: runtimeOverlayItems.length,
    areaShapeRuntimeOverlayRequiredEffectTokens: uniqueSorted(runtimeOverlayItems.map((item) => item.effectToken)).length,
    areaShapeRuntimeOverlayRequiredPfxPaths: uniqueSorted(runtimeOverlayItems.map((item) => item.pfxPath)).length,
    areaShapeRuntimeHiddenEffectTokens: uniqueSorted(runtimeHiddenItems.map((item) => item.effectToken)).length,
    nativeNearbyTokenRows: items.filter(
      (item) =>
        item.nativeNearbyEffectTokens?.length ||
        item.nativeNearbyBuffTokens?.length ||
        item.nativeNearbyAbilityNames?.length ||
        item.nativeNearbySoundTokens?.length,
    ).length,
    byReason,
    bySourceKind,
    byAreaShapeGapBlockClass,
    byAreaShapeGapCallbackComponents,
    byAreaShapeGapCurrentStore,
    byAreaShapeGapSizeCallbackCurrentClass,
    byAreaShapeGapResolverInputKind,
    byAreaShapeGapResolutionStatus,
    byAreaShapeGapPackedLiteralSign,
    byAreaShapeGapSizeCallbackResolverInputKind,
    byAreaShapeGapSizeCallbackResolutionStatus,
    byAreaShapeGapSizeCallbackPackedLiteralSign,
    byAreaShapeGapSizeCallbackTableCompatibilityStatus,
    byAreaShapeGapSizeCallbackCurrentBuildStatus,
    byAreaShapeGapSizeCallbackFallbackClass,
    byAreaShapeGapSizeCallbackCurrentEvidenceSource,
    byAreaShapeGapSizeCallbackFallbackEvidenceSource,
    byAreaShapeGapSizeCallbackCurrentConstantValue,
    byAreaShapeGapSizeCallbackFallbackConstantValue,
    byAreaShapeGapSizeCallbackCurrentFirstComponentValue,
    byAreaShapeGapSizeCallbackRandomRange,
    byAreaShapeGapSizeCallbackCurveRange,
    byAreaShapeGapSizeCallbackCurrentDependencyFlags,
    byAreaShapeGapMissingCurrentStoreResolverInputKind,
    byAreaShapeGapMissingCurrentStoreCurrentClass,
    byAreaShapeGapPattern16ReadStatus,
    byAreaShapeGapCurveTableReadStatus,
    byAreaShapeGapRuntimeRequirement,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    reason: item.reason,
    sourceKind: item.sourceKind,
    effectToken: item.effectToken,
    actionKeys: item.actionKeys.join("|"),
    heroCodes: item.heroCodes.join("|"),
    heroNames: item.heroNames.join("|"),
    heroResourceRoots: item.heroResourceRoots.join("|"),
    presentEffectResourceRoots: (item.presentEffectResourceRoots || []).join("|"),
    missingEffectResourceRoots: item.missingEffectResourceRoots.join("|"),
    placeholderDefinitionRoots: item.placeholderDefinitionRoots.join("|"),
    existingResourcePaths: item.existingResourcePaths.join("|"),
    existingShadergraphPaths: item.existingShadergraphPaths.join("|"),
    shadergraphEvidenceSource: item.shadergraphEvidenceSource,
    resourceEvidenceSource: item.resourceEvidenceSource,
    aliasEvidenceStrength: item.aliasEvidenceStrength,
    nativeRuntimeKind: item.nativeRuntimeKind,
    nativeBindKind: item.nativeBindKind,
    nativeEffectOptionOffsets: item.nativeEffectOptionOffsets.join("|"),
    nativeEffectOptionFloatArgs: item.nativeEffectOptionFloatArgs.join("|"),
    nativeEffectOptions: item.nativeEffectOptions ? JSON.stringify(item.nativeEffectOptions) : "",
    nativeActionNames: item.nativeActionNames.join("|"),
    nativeNearbyEffectTokens: item.nativeNearbyEffectTokens.join("|"),
    nativeNearbyBuffTokens: item.nativeNearbyBuffTokens.join("|"),
    nativeNearbyAbilityNames: item.nativeNearbyAbilityNames.join("|"),
    nativeNearbySoundTokens: item.nativeNearbySoundTokens.join("|"),
    nativeSemanticCalls: item.nativeSemanticCalls.join("|"),
    selectorOutputTarget: item.selectorOutputTarget || "",
    selectorOutputRole: item.selectorOutputRole || "",
    selectorOutputSiblingTokens: item.selectorOutputSiblingTokens.join("|"),
    selectorOutputSiblingRoles: item.selectorOutputSiblingRoles.join("|"),
    pairedSelectorOutputTokens: item.pairedSelectorOutputTokens.join("|"),
    pairedSelectorOutputRoles: item.pairedSelectorOutputRoles.join("|"),
    pairedSelectorOutputResourcePaths: item.pairedSelectorOutputResourcePaths.join("|"),
    globalCandidateResourcePaths: item.globalCandidateResourcePaths.join("|"),
    kindredCandidateCount: item.kindredCandidateCount,
    kindredCandidateResourcePaths: item.kindredCandidateResourcePaths.join("|"),
    kindredCandidateModelLabels: item.kindredCandidateModelLabels.join("|"),
    kindredCandidateRoles: item.kindredCandidateRoles.join("|"),
    pfxPath: item.pfxPath || "",
    shadergraphPath: item.shadergraphPath || "",
    surfaceIndex: item.surfaceIndex ?? "",
    shapeGapReason: item.shapeGapReason || "",
    pfxRenderFamily: item.pfxRenderFamily || "",
    previewSurfaceRejectReason: item.previewSurfaceRejectReason || "",
    previewTexture: item.previewTexture || "",
    previewTextureMode: item.previewTextureMode || "",
    previewTextureAlphaCoverage: item.previewTextureAlphaCoverage ?? "",
    previewTextureSpriteUsable: item.previewTextureSpriteUsable === true ? "yes" : item.previewTextureSpriteUsable === false ? "no" : "",
    parameterEvidenceClass: item.parameterEvidenceClass || "",
    parameterSemanticSlots: (item.parameterSemanticSlots || []).join("|"),
    sampledFloatOffsets: (item.sampledFloatOffsets || []).join("|"),
    runtimeHintKeys: (item.runtimeHintKeys || []).join("|"),
    pfxShapeCallbacks: (item.pfxShapeCallbacks || []).join("|"),
    areaShapeGapBlockClass: item.areaShapeGapBlockClass || "",
    areaShapeGapRuntimeRequirement: item.areaShapeGapRuntimeRequirement || "",
    runtimeOverlayRequired: item.runtimeOverlayRequired === true ? "yes" : item.runtimeOverlayRequired === false ? "no" : "",
    areaShapeGapCallbackComponents: item.areaShapeGapCallbackComponents || "",
    areaShapeGapCurrentStore: item.areaShapeGapCurrentStore || "",
    areaShapeGapResolverInputKind: item.areaShapeGapResolverInputKind || "",
    areaShapeGapResolutionStatus: item.areaShapeGapResolutionStatus || "",
    areaShapeGapPackedLiteralSign: item.areaShapeGapPackedLiteralSign || "",
    areaShapeGapSizeCallbackResolverInputKind: item.areaShapeGapSizeCallbackResolverInputKind || "",
    areaShapeGapSizeCallbackResolutionStatus: item.areaShapeGapSizeCallbackResolutionStatus || "",
    areaShapeGapSizeCallbackPackedLiteralSign: item.areaShapeGapSizeCallbackPackedLiteralSign || "",
    areaShapeGapSizeCallbackInputValue: item.areaShapeGapSizeCallbackInputValue || "",
    areaShapeGapSizeCallbackTableCompatibilityStatus: item.areaShapeGapSizeCallbackTableCompatibilityStatus || "",
    areaShapeGapSizeCallbackCurrentBuildStatus: item.areaShapeGapSizeCallbackCurrentBuildStatus || "",
    areaShapeGapSizeCallbackCurrentClass: item.areaShapeGapSizeCallbackCurrentClass || "",
    areaShapeGapSizeCallbackFallbackClass: item.areaShapeGapSizeCallbackFallbackClass || "",
    areaShapeGapSizeCallbackCurrentConstantValue: item.areaShapeGapSizeCallbackCurrentConstantValue || "",
    areaShapeGapSizeCallbackFallbackConstantValue: item.areaShapeGapSizeCallbackFallbackConstantValue || "",
    areaShapeGapSizeCallbackCurrentFirstComponentValue: item.areaShapeGapSizeCallbackCurrentFirstComponentValue || "",
    areaShapeGapSizeCallbackRandomRange: item.areaShapeGapSizeCallbackRandomRange || "",
    areaShapeGapSizeCallbackCurveRange: item.areaShapeGapSizeCallbackCurveRange || "",
    areaShapeGapSizeCallbackCurrentDependencyFlags: item.areaShapeGapSizeCallbackCurrentDependencyFlags || "",
    areaShapeGapSizeCallbackFallbackDependencyFlags: item.areaShapeGapSizeCallbackFallbackDependencyFlags || "",
    areaShapeGapSizeCallbackCurrentEvidenceSource: item.areaShapeGapSizeCallbackCurrentEvidenceSource || "",
    areaShapeGapSizeCallbackFallbackEvidenceSource: item.areaShapeGapSizeCallbackFallbackEvidenceSource || "",
    areaShapeGapMissingCurrentStoreResolverInputKind: item.areaShapeGapMissingCurrentStoreResolverInputKind || "",
    areaShapeGapMissingCurrentStoreCurrentClass: item.areaShapeGapMissingCurrentStoreCurrentClass || "",
    areaShapeGapPattern16ReadStatus: item.areaShapeGapPattern16ReadStatus || "",
    areaShapeGapCurveTableReadStatus: item.areaShapeGapCurveTableReadStatus || "",
    nativePercentParamOffsets: (item.nativePercentParamOffsets || []).join("|"),
    nativePercentParamValues: (item.nativePercentParamValues || []).join("|"),
    sourceFunction: item.source.functionName,
    sourceLine: item.source.line,
    renderPromotionAllowed: item.renderPromotionAllowed ? "yes" : "no",
  }));
}

function exportEffectRuntimeGapReport({
  effectHookPath = defaultEffectHookPath,
  kindredSlotPath = defaultKindredSlotPath,
  projectileRuntimePath = defaultProjectileRuntimePath,
  pfxResourcePath = defaultPfxResourcePath,
  shadergraphMaterialPath = defaultShadergraphMaterialPath,
  effectResourcePath = defaultEffectResourcePath,
  definitionChainPath = defaultDefinitionChainPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildEffectRuntimeGapReport(
    {
      effectHookManifest: readJson(effectHookPath),
      kindredSlots: { items: readJsonItems(kindredSlotPath) },
      projectileRuntime: { items: readJsonItems(projectileRuntimePath) },
      pfxResourceManifest: fs.existsSync(pfxResourcePath) ? readJson(pfxResourcePath) : { items: [] },
      shadergraphMaterialManifest: fs.existsSync(shadergraphMaterialPath) ? readJson(shadergraphMaterialPath) : { items: [] },
      effectResourceRows: readTsv(effectResourcePath),
      definitionRows: readTsv(definitionChainPath),
    },
    new Date().toISOString(),
  );
  manifest.source = {
    effectHookPath,
    kindredSlotPath,
    projectileRuntimePath,
    pfxResourcePath,
    shadergraphMaterialPath,
    effectResourcePath,
    definitionChainPath,
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "reason",
    "sourceKind",
    "effectToken",
    "actionKeys",
    "heroCodes",
    "heroNames",
    "heroResourceRoots",
    "presentEffectResourceRoots",
    "missingEffectResourceRoots",
    "placeholderDefinitionRoots",
    "existingResourcePaths",
    "existingShadergraphPaths",
    "shadergraphEvidenceSource",
    "resourceEvidenceSource",
    "aliasEvidenceStrength",
    "nativeRuntimeKind",
    "nativeBindKind",
    "nativeEffectOptionOffsets",
    "nativeEffectOptionFloatArgs",
    "nativeEffectOptions",
    "nativeActionNames",
    "nativeNearbyEffectTokens",
    "nativeNearbyBuffTokens",
    "nativeNearbyAbilityNames",
    "nativeNearbySoundTokens",
    "nativeSemanticCalls",
    "selectorOutputTarget",
    "selectorOutputRole",
    "selectorOutputSiblingTokens",
    "selectorOutputSiblingRoles",
    "pairedSelectorOutputTokens",
    "pairedSelectorOutputRoles",
    "pairedSelectorOutputResourcePaths",
    "globalCandidateResourcePaths",
    "kindredCandidateCount",
    "kindredCandidateResourcePaths",
    "kindredCandidateModelLabels",
    "kindredCandidateRoles",
    "pfxPath",
    "shadergraphPath",
    "surfaceIndex",
    "shapeGapReason",
    "pfxRenderFamily",
    "previewSurfaceRejectReason",
    "previewTexture",
    "previewTextureMode",
    "previewTextureAlphaCoverage",
    "previewTextureSpriteUsable",
    "parameterEvidenceClass",
    "parameterSemanticSlots",
    "sampledFloatOffsets",
    "runtimeHintKeys",
    "pfxShapeCallbacks",
    "areaShapeGapBlockClass",
    "areaShapeGapRuntimeRequirement",
    "runtimeOverlayRequired",
    "areaShapeGapCallbackComponents",
    "areaShapeGapCurrentStore",
    "areaShapeGapResolverInputKind",
    "areaShapeGapResolutionStatus",
    "areaShapeGapPackedLiteralSign",
    "areaShapeGapSizeCallbackResolverInputKind",
    "areaShapeGapSizeCallbackResolutionStatus",
    "areaShapeGapSizeCallbackPackedLiteralSign",
    "areaShapeGapSizeCallbackInputValue",
    "areaShapeGapSizeCallbackTableCompatibilityStatus",
    "areaShapeGapSizeCallbackCurrentBuildStatus",
    "areaShapeGapSizeCallbackCurrentClass",
    "areaShapeGapSizeCallbackFallbackClass",
    "areaShapeGapSizeCallbackCurrentConstantValue",
    "areaShapeGapSizeCallbackFallbackConstantValue",
    "areaShapeGapSizeCallbackCurrentFirstComponentValue",
    "areaShapeGapSizeCallbackRandomRange",
    "areaShapeGapSizeCallbackCurveRange",
    "areaShapeGapSizeCallbackCurrentDependencyFlags",
    "areaShapeGapSizeCallbackFallbackDependencyFlags",
    "areaShapeGapSizeCallbackCurrentEvidenceSource",
    "areaShapeGapSizeCallbackFallbackEvidenceSource",
    "areaShapeGapMissingCurrentStoreResolverInputKind",
    "areaShapeGapMissingCurrentStoreCurrentClass",
    "areaShapeGapPattern16ReadStatus",
    "areaShapeGapCurveTableReadStatus",
    "nativePercentParamOffsets",
    "nativePercentParamValues",
    "sourceFunction",
    "sourceLine",
    "renderPromotionAllowed",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportEffectRuntimeGapReport({
    effectHookPath: optionValue(args, "--effect-hooks", defaultEffectHookPath),
    kindredSlotPath: optionValue(args, "--kindred-slots", defaultKindredSlotPath),
    projectileRuntimePath: optionValue(args, "--projectile-runtime", defaultProjectileRuntimePath),
    pfxResourcePath: optionValue(args, "--pfx-resources", defaultPfxResourcePath),
    shadergraphMaterialPath: optionValue(args, "--shadergraph-materials", defaultShadergraphMaterialPath),
    effectResourcePath: optionValue(args, "--effects", defaultEffectResourcePath),
    definitionChainPath: optionValue(args, "--definitions", defaultDefinitionChainPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileRuntimeHookTokenIndex,
  buildEffectRuntimeGapReport,
  effectResourceRootsForHook,
  exportEffectRuntimeGapReport,
  kindredSlotCandidatesForHook,
  hookHasNativePrimitiveOptions,
  missingEffectResourceRootsForHook,
  placeholderDefinitionRootsForHook,
  projectileRuntimeRowsForHook,
  reportRowsForManifest,
  summarizeEffectRuntimeGapRows,
};
