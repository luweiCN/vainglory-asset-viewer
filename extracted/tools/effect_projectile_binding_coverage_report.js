#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultRuntimePath = "extracted/viewer/runtime-binding-config.json";
const defaultProjectilePath = "extracted/viewer/effect-projectile-definition-manifest.json";
const defaultNativePath = "extracted/viewer/native-projectile-spawn-manifest.json";
const defaultTimelinePath = "extracted/viewer/native-runtime-timeline-manifest.json";
const defaultEffectHookPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultSkinEffectAliasPath = "extracted/viewer/runtime-skin-effect-aliases.json";
const defaultAbilityStemPath = "extracted/reports/definition_component_roots.tsv";
const defaultRuntimeLocatorPath = "extracted/reports/cff0_runtime_locator_records.tsv";
const defaultViewerOut = "extracted/viewer/effect-projectile-runtime-manifest.json";
const defaultTsvOut = "extracted/reports/effect_projectile_binding_coverage.tsv";
const defaultJsonOut = "extracted/reports/effect_projectile_binding_coverage_summary.json";
const RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE = 50;
const EFFECT_LIBRARY_ONLY_PROJECTILE_STATUS = "effect-library-only";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJsonItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
}

function readTsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const columns = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index] || "";
    });
    return row;
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

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function pipeValues(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim().replace(/^\?+/, ""))
    .filter(Boolean);
}

function projectileHeroNames(projectile) {
  const modelHero = String(projectile?.modelLabel || "").match(/^([^_]+?)(?:_DefaultSkin|_Skin_|$)/)?.[1] || "";
  return uniqueInOrder([projectile?.heroLabel, modelHero]);
}

function runtimeItemPropSourcePenalty(item) {
  const text = `${item?.sourceRelativePath || ""} ${item?.rel || ""}`.toLowerCase();
  if (/fishfood|clam|groundedbolt|clone|mainclone|illusion|decoy|pet|summon|minion|turret/.test(text)) return 1;
  return 0;
}

function compareRuntimeItemsForModelLabel(left, right) {
  const leftSlots = left?.slots || left?.bindSlots || [];
  const rightSlots = right?.slots || right?.bindSlots || [];
  const leftResolved = leftSlots.filter((slot) => Number.isInteger(Number(slot?.resolvedBoneIndex))).length;
  const rightResolved = rightSlots.filter((slot) => Number.isInteger(Number(slot?.resolvedBoneIndex))).length;
  const resolvedOrder = rightResolved - leftResolved;
  if (resolvedOrder) return resolvedOrder;
  const slotOrder = rightSlots.length - leftSlots.length;
  if (slotOrder) return slotOrder;
  const sourceOrder = runtimeItemPropSourcePenalty(left) - runtimeItemPropSourcePenalty(right);
  if (sourceOrder) return sourceOrder;
  return String(left?.sourceRelativePath || "").localeCompare(String(right?.sourceRelativePath || ""));
}

function tierlessModelLabel(modelLabel) {
  const match = String(modelLabel || "").match(/^(.+)_T\d+$/);
  return match ? match[1] : "";
}

function buildRuntimeItemIndex(runtimeItems) {
  const grouped = new Map();
  const tierBaseGrouped = new Map();
  for (const item of runtimeItems || []) {
    if (!item?.modelLabel) continue;
    const records = grouped.get(item.modelLabel) || [];
    records.push(item);
    grouped.set(item.modelLabel, records);

    const baseModelLabel = tierlessModelLabel(item.modelLabel);
    if (baseModelLabel) {
      const baseRecords = tierBaseGrouped.get(baseModelLabel) || [];
      baseRecords.push(item);
      tierBaseGrouped.set(baseModelLabel, baseRecords);
    }
  }

  const index = new Map();
  for (const [modelLabel, records] of grouped) {
    records.sort(compareRuntimeItemsForModelLabel);
    index.set(modelLabel, records[0]);
  }
  for (const [modelLabel, records] of tierBaseGrouped) {
    if (index.has(modelLabel)) continue;
    records.sort(compareRuntimeItemsForModelLabel);
    index.set(modelLabel, records[0]);
  }
  return index;
}

function buildNativeHeroIndex(nativeItems) {
  const index = new Map();
  for (const item of nativeItems || []) {
    for (const heroName of item?.heroNames || []) {
      const key = normalized(heroName);
      if (!key) continue;
      const records = index.get(key) || [];
      records.push(item);
      index.set(key, records);
    }
  }
  return index;
}

function projectileIdKey(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16)}`;
  const text = String(value).trim().toLowerCase();
  if (!text) return "";
  if (/^0x[0-9a-f]+$/i.test(text)) return text;
  if (/^\d+$/.test(text)) return `0x${Number(text).toString(16)}`;
  return text;
}

function locatorKey(relativePath, modelLabel, label) {
  return `${relativePath || ""}\t${modelLabel || ""}\t${label || ""}`;
}

function locatorFallbackKey(relativePath, label) {
  return `${relativePath || ""}\t${label || ""}`;
}

function buildRuntimeLocatorIndex(runtimeLocatorItems) {
  const byExact = new Map();
  const byDefinition = new Map();
  for (const item of runtimeLocatorItems || []) {
    if (!item?.relativePath || !item?.label) continue;
    byExact.set(locatorKey(item.relativePath, item.modelLabel || "", item.label), item);
    const records = byDefinition.get(locatorFallbackKey(item.relativePath, item.label)) || [];
    records.push(item);
    byDefinition.set(locatorFallbackKey(item.relativePath, item.label), records);
  }
  for (const records of byDefinition.values()) {
    records.sort((left, right) => {
      const leftDefault = /_DefaultSkin$/.test(left.modelLabel || "") ? 0 : 1;
      const rightDefault = /_DefaultSkin$/.test(right.modelLabel || "") ? 0 : 1;
      return leftDefault - rightDefault || String(left.modelLabel || "").localeCompare(String(right.modelLabel || ""));
    });
  }
  return { byExact, byDefinition };
}

function buildEffectHookResourceIndex(effectHookItems) {
  const index = new Map();
  for (const item of effectHookItems || []) {
    for (const resourcePath of item?.resourcePaths || []) {
      if (!resourcePath) continue;
      const records = index.get(resourcePath) || [];
      records.push(item);
      index.set(resourcePath, records);
    }
  }
  return index;
}

function buildEffectHookTokenIndex(effectHookItems) {
  const index = new Map();
  for (const item of effectHookItems || []) {
    for (const token of uniqueInOrder([item?.effectToken, item?.token])) {
      const records = index.get(token) || [];
      records.push(item);
      index.set(token, records);
    }
  }
  return index;
}

function buildSkinEffectAliasIndex(skinEffectAliasItems) {
  const index = new Map();
  for (const item of skinEffectAliasItems || []) {
    if (!item?.modelLabel || !item?.skinEffectToken || !item?.sourceEffectToken) continue;
    for (const key of skinEffectAliasKeys(item.modelLabel, item.skinEffectToken)) {
      const records = index.get(key) || [];
      records.push(item);
      index.set(key, records);
    }
  }
  return index;
}

function actionMatches(nativeRow, projectile) {
  const nativeKeys = new Set(nativeRow?.actionKeys || []);
  const projectileKeys = new Set(projectile?.actionKeys || []);
  if (!nativeKeys.size || !projectileKeys.size) return false;
  for (const key of projectileKeys) {
    if (nativeKeys.has(key)) return true;
    if (key.startsWith("attack") && nativeKeys.has("attack")) return true;
    if (key.startsWith("ability01") && nativeKeys.has("ability01")) return true;
    if (key.startsWith("ability02") && nativeKeys.has("ability02")) return true;
    if (key.startsWith("ability03") && nativeKeys.has("ability03")) return true;
  }
  return false;
}

function nativeRowEffectTokens(row) {
  return Array.isArray(row?.effectTokens) ? row.effectTokens : pipeValues(row?.effectTokens);
}

function nativeRowsForProjectile(projectile, nativeByHero) {
  const rows = [];
  const seen = new Set();
  const nativeContextEffectToken = projectile?.nativeContextEffectToken || "";
  for (const heroName of projectileHeroNames(projectile)) {
    for (const row of nativeByHero.get(normalized(heroName)) || []) {
      if (nativeContextEffectToken && !nativeRowEffectTokens(row).includes(nativeContextEffectToken)) continue;
      if (!actionMatches(row, projectile)) continue;
      const key = row.id || `${row.sourceFile || ""}\t${row.line || ""}\t${row.projectileIdHex || ""}\t${row.emitterLabel || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function timelineRowsForProjectile(projectile, timelineByHero, nativeRows) {
  const rows = [];
  const seen = new Set();
  const nativeProjectileIds = new Set((nativeRows || []).map((row) => projectileIdKey(row.projectileIdHex || row.projectileId)).filter(Boolean));
  for (const heroName of projectileHeroNames(projectile)) {
    for (const row of timelineByHero.get(normalized(heroName)) || []) {
      if (row.eventKind && row.eventKind !== "projectile") continue;
      if (!actionMatches(row, projectile)) continue;
      const rowProjectileId = projectileIdKey(row.projectileIdHex || row.projectileId);
      if (nativeProjectileIds.size && (!rowProjectileId || !nativeProjectileIds.has(rowProjectileId))) continue;
      const key = row.id || `${row.sourceFile || ""}\t${row.functionName || ""}\t${row.line || ""}\t${rowProjectileId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows.sort((left, right) => Number(left.timeSeconds || 0) - Number(right.timeSeconds || 0));
}

function projectileEffectTokens(projectile) {
  return Array.isArray(projectile?.effectTokens) ? projectile.effectTokens : pipeValues(projectile?.effectTokens);
}

function splitEffectTerm(term) {
  return String(term || "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function effectBodyTerms(token) {
  return String(token || "")
    .replace(/^Effect_/, "")
    .split(/[^A-Za-z0-9]+/)
    .flatMap(splitEffectTerm)
    .map((term) => term.trim())
    .filter(Boolean);
}

function isSkinMarker(term) {
  return /^(?:S\d+|T\d+|ICE|SUM|VAL|FOREST|EXO|DRGN|GLAD|MED|CHN|RI|S2RI)$/i.test(term || "");
}

function isProjectileTerm(term) {
  return /^(?:proj|projectile|shot|rocket)$/i.test(term || "");
}

function isImpactTerm(term) {
  return /^(?:impact|hit|explode|explosion)$/i.test(term || "");
}

function canonicalEffectTerms(token) {
  const terms = effectBodyTerms(token);
  while (terms.length && isSkinMarker(terms[0])) terms.shift();
  if (terms.length > 1) terms.shift();
  return terms.filter((term) => !isSkinMarker(term)).map((term) => term.toLowerCase());
}

function semanticEffectKeys(token) {
  const terms = canonicalEffectTerms(token);
  if (!terms.length) return [];
  const termVariants = [terms];
  if (terms[0] === "aa") {
    termVariants.push(["default", "attack", ...terms.slice(1)]);
    termVariants.push(["basic", "attack", ...terms.slice(1)]);
  }
  if ((terms[0] === "default" || terms[0] === "basic") && terms[1] === "attack") {
    termVariants.push(["aa", ...terms.slice(2)]);
  }

  const keys = [];
  for (const variant of termVariants) {
    keys.push(variant.join("_"));
    if (variant.length > 1 && isProjectileTerm(variant[variant.length - 1])) {
      keys.push(variant.slice(0, -1).join("_"));
      keys.push([...variant.slice(0, -1), "projectile"].join("_"));
    }
  }
  return uniqueInOrder(keys.filter(Boolean));
}

function resourceBasename(resourcePath) {
  return path.basename(String(resourcePath || "")).replace(/\.[^.]+$/, "");
}

function semanticResourceKeys(resourcePath) {
  return semanticEffectKeys(`Effect_${resourceBasename(resourcePath)}`);
}

function effectHeroTermsFromToken(token) {
  const terms = effectBodyTerms(token);
  const heroes = [];
  for (const term of terms) {
    if (isSkinMarker(term)) continue;
    heroes.push(term.toLowerCase());
    break;
  }
  return heroes;
}

function effectHeroTermsFromResource(resourcePath) {
  const match = String(resourcePath || "").match(/^Effects\/([^/]+)/);
  return match ? [match[1].toLowerCase()] : [];
}

function projectileHeroTerms(projectile) {
  return new Set(
    uniqueInOrder([
      ...projectileHeroNames(projectile),
      ...projectileEffectTokens(projectile).flatMap(effectHeroTermsFromToken),
      effectHeroTermsFromResource(projectile?.resourcePath || "")[0],
    ]).map((term) => normalized(term)),
  );
}

function effectHookHeroTerms(hook) {
  return new Set(
    uniqueInOrder([
      ...(hook?.heroCodes || []),
      ...uniqueInOrder([hook?.effectToken, hook?.token]).flatMap(effectHeroTermsFromToken),
      ...(hook?.resourcePaths || []).flatMap(effectHeroTermsFromResource),
    ]).map((term) => normalized(term)),
  );
}

function heroTermsOverlap(projectile, hook) {
  const projectileTerms = projectileHeroTerms(projectile);
  const hookTerms = effectHookHeroTerms(hook);
  if (!projectileTerms.size || !hookTerms.size) return false;
  for (const term of projectileTerms) {
    if (hookTerms.has(term)) return true;
  }
  return false;
}

function effectHookMatchesProjectile(hook, projectile) {
  if (!hook?.actionKeys?.length || !projectile?.actionKeys?.length) return true;
  return actionMatches(hook, projectile);
}

function buildEffectHookResourceAliasIndex(effectHookItems) {
  const index = new Map();
  for (const item of effectHookItems || []) {
    for (const resourcePath of item?.resourcePaths || []) {
      for (const key of semanticResourceKeys(resourcePath)) {
        const records = index.get(key) || [];
        records.push(item);
        index.set(key, records);
      }
    }
  }
  return index;
}

function buildEffectHookSemanticTokenIndex(effectHookItems) {
  const index = new Map();
  for (const item of effectHookItems || []) {
    for (const token of uniqueInOrder([item?.effectToken, item?.token])) {
      for (const key of semanticEffectKeys(token)) {
        const records = index.get(key) || [];
        records.push(item);
        index.set(key, records);
      }
    }
  }
  return index;
}

function skinEffectAliasKeys(modelLabel, token) {
  return uniqueInOrder([token, ...semanticEffectKeys(token)].map((key) => `${modelLabel}\t${key}`));
}

function buildSkinEffectAliasSourceIndex(skinEffectAliasItems) {
  const index = new Map();
  for (const item of skinEffectAliasItems || []) {
    if (!item?.modelLabel || !item?.skinEffectToken || !item?.sourceEffectToken) continue;
    for (const key of skinEffectAliasKeys(item.modelLabel, item.sourceEffectToken)) {
      const records = index.get(key) || [];
      records.push(item);
      index.set(key, records);
    }
  }
  return index;
}

function abilityActionKeyFromLetter(letter) {
  const offset = String(letter || "").toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1;
  if (offset < 1 || offset > 9) return "";
  return `ability${String(offset).padStart(2, "0")}`;
}

function parseAbilityStemRows(abilityStemItems) {
  const rows = [];
  for (const item of abilityStemItems || []) {
    const text = String(item?.targetLabels || item?.abilitySlots || item?.directAbilitySlots || "");
    const abilityMatches = [...text.matchAll(/Ability__([A-Za-z0-9]+)__([A-Z])(?:\b|_|@)/g)];
    const labelMatches = [...text.matchAll(/\bHERO_ABILITY_([A-Z0-9]+)_([A-Z0-9_]+)_NAME\b/g)];
    for (const abilityMatch of abilityMatches) {
      const hero = abilityMatch[1];
      const abilityLetter = abilityMatch[2];
      const actionKey = abilityActionKeyFromLetter(abilityLetter);
      if (!hero || !actionKey) continue;
      for (const labelMatch of labelMatches) {
        const labelHero = labelMatch[1];
        const stemText = labelMatch[2];
        if (normalized(labelHero) !== normalized(hero)) continue;
        const stemTerms = effectBodyTerms(stemText).map((term) => term.toLowerCase()).filter(Boolean);
        if (!stemTerms.length) continue;
        rows.push({
          relativePath: item?.relativePath || "",
          heroTerms: uniqueInOrder([hero, labelHero]).map((term) => normalized(term)),
          abilityLetter,
          actionKey,
          stemTerms,
          stemKey: stemTerms.join("_"),
          stemCompact: stemTerms.join(""),
        });
      }
    }
  }
  return rows;
}

function buildAbilityStemIndex(abilityStemItems) {
  const index = new Map();
  for (const stem of parseAbilityStemRows(abilityStemItems)) {
    for (const heroTerm of stem.heroTerms || []) {
      const records = index.get(heroTerm) || [];
      records.push(stem);
      index.set(heroTerm, records);
    }
  }
  return index;
}

function termsOverlap(leftTerms, rightTerms) {
  const right = new Set(rightTerms || []);
  return (leftTerms || []).some((term) => right.has(term));
}

function projectileCanonicalTerms(projectile) {
  return uniqueInOrder([
    ...projectileEffectTokens(projectile).flatMap(canonicalEffectTerms),
    ...semanticResourceKeys(projectile?.resourcePath || "").flatMap((key) => key.split("_")),
  ]).map((term) => normalized(term));
}

function projectileActionMatchesStem(projectile, stem) {
  const keys = new Set(projectile?.actionKeys || []);
  if (keys.has(stem.actionKey)) return true;
  for (const key of keys) {
    if (key.startsWith(stem.actionKey)) return true;
  }
  return false;
}

function abilityStemsForProjectile(projectile, abilityStemIndex) {
  const stems = [];
  const seen = new Set();
  const projectileTerms = projectileCanonicalTerms(projectile);
  for (const heroTerm of projectileHeroTerms(projectile)) {
    for (const stem of abilityStemIndex.get(heroTerm) || []) {
      const key = `${stem.heroTerms.join("|")}\t${stem.actionKey}\t${stem.stemKey}`;
      if (seen.has(key)) continue;
      const actionMatch = projectileActionMatchesStem(projectile, stem);
      const stemTermMatch = termsOverlap(stem.stemTerms, projectileTerms);
      const letterMatch = projectileTerms.includes(String(stem.abilityLetter || "").toLowerCase());
      if (!actionMatch && !stemTermMatch && !letterMatch) continue;
      seen.add(key);
      stems.push(stem);
    }
  }
  return stems;
}

function hookCanonicalTerms(hook) {
  return uniqueInOrder(uniqueInOrder([hook?.effectToken, hook?.token]).flatMap(canonicalEffectTerms)).map((term) => normalized(term));
}

function hookMatchesAbilityStem(hook, stem, projectile) {
  if (!heroTermsOverlap(projectile, hook)) return false;
  const terms = hookCanonicalTerms(hook);
  if (!stem.stemTerms.every((term) => terms.includes(term))) return false;
  if (projectile?.role === "projectile") {
    if (terms.some(isImpactTerm)) return false;
    if (!terms.some(isProjectileTerm)) return false;
  }
  return true;
}

function skinAliasForSourceEffect(modelLabel, sourceToken, skinEffectAliasesBySource) {
  for (const aliasKey of skinEffectAliasKeys(modelLabel || "", sourceToken || "")) {
    const alias = (skinEffectAliasesBySource.get(aliasKey) || [])[0];
    if (alias) return alias;
  }
  return null;
}

function effectHooksForProjectile(projectile, effectHookIndexes, skinEffectAliases, abilityStemIndex, skinEffectAliasesBySource) {
  const hooks = [];
  const seen = new Set();
  const pushHook = (hook, { skinAlias = "", matchKind = "direct" } = {}) => {
    const key = hook?.id || `${hook?.sourceKind || ""}\t${hook?.effectToken || hook?.token || ""}\t${(hook?.resourcePaths || []).join("|")}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    hooks.push({ ...hook, skinAlias, matchKind });
  };
  for (const hook of effectHookIndexes.byResource.get(projectile?.resourcePath || "") || []) pushHook(hook, { matchKind: "resource-exact" });
  for (const token of projectileEffectTokens(projectile)) {
    for (const hook of effectHookIndexes.byToken.get(token) || []) {
      if (!effectHookMatchesProjectile(hook, projectile)) continue;
      pushHook(hook, { matchKind: "effect-token-exact" });
    }
    for (const aliasKey of skinEffectAliasKeys(projectile?.modelLabel || "", token)) {
      for (const alias of skinEffectAliases.get(aliasKey) || []) {
        for (const hook of effectHookIndexes.byToken.get(alias.sourceEffectToken) || []) {
          pushHook(hook, {
            skinAlias: `${alias.sourceEffectToken}->${alias.skinEffectToken}`,
            matchKind: "skin-effect-alias",
          });
        }
      }
    }
    for (const key of semanticEffectKeys(token)) {
      for (const hook of effectHookIndexes.bySemanticToken.get(key) || []) {
        if (!heroTermsOverlap(projectile, hook)) continue;
        if (!effectHookMatchesProjectile(hook, projectile)) continue;
        pushHook(hook, { matchKind: "semantic-effect-token" });
      }
    }
  }
  for (const resourceAliasKey of semanticResourceKeys(projectile?.resourcePath || "")) {
    for (const hook of effectHookIndexes.byResourceAlias.get(resourceAliasKey) || []) {
      if (!heroTermsOverlap(projectile, hook)) continue;
      pushHook(hook, { matchKind: "resource-basename-alias" });
    }
  }
  for (const stem of abilityStemsForProjectile(projectile, abilityStemIndex)) {
    for (const hook of effectHookIndexes.items || []) {
      if (!hookMatchesAbilityStem(hook, stem, projectile)) continue;
      const sourceToken = hook?.effectToken || hook?.token || "";
      const alias = skinAliasForSourceEffect(projectile?.modelLabel || "", sourceToken, skinEffectAliasesBySource);
      pushHook(hook, alias
        ? {
            skinAlias: `${alias.sourceEffectToken}->${alias.skinEffectToken}`,
            matchKind: "ability-stem-skin-effect-alias",
          }
        : { matchKind: "ability-stem-effect-token" });
    }
  }
  return hooks;
}

function projectileCoverageKey(projectile) {
  return `${projectile?.modelLabel || ""}\t${projectile?.role || "projectile"}\t${projectile?.resourcePath || ""}`;
}

function modelLabelHeroTerm(modelLabel) {
  return normalized(String(modelLabel || "").match(/^([^_]+?)(?:_DefaultSkin|_Skin_|$)/)?.[1] || "");
}

function isDefaultRuntimeModel(item) {
  return /_DefaultSkin$/i.test(item?.modelLabel || "");
}

function runtimeItemHeroTerms(item) {
  return new Set(uniqueInOrder([item?.character, modelLabelHeroTerm(item?.modelLabel)]).map(normalized).filter(Boolean));
}

function resourcePathHasExplicitSkinSegment(resourcePath) {
  return /(?:^|\/)(?:S\d+|ICE|SUM|VAL|FOREST|EXO|DRGN|GLAD|MED|CHN|RI|S2RI)(?:\/|_|__)/i.test(
    String(resourcePath || ""),
  );
}

function isGenericFallbackResourceHeroTerm(term) {
  return /^(?:hero000|common|minions?|kraken)$/i.test(String(term || ""));
}

function runtimeDefaultResourceVariantsForHookResource(hook, resourcePath, runtimeByModelLabel) {
  if (!runtimeByModelLabel || resourcePathHasExplicitSkinSegment(resourcePath)) return [];
  const resourceHeroTerms = uniqueInOrder(effectHeroTermsFromResource(resourcePath).map(normalized).filter(Boolean));
  if (!resourceHeroTerms.length || resourceHeroTerms.some(isGenericFallbackResourceHeroTerm)) return [];
  const hookHeroTerms = uniqueInOrder([...(hook?.heroNames || []), ...(hook?.heroCodes || [])].map(normalized).filter(Boolean));
  if (!hookHeroTerms.length) return [];

  const variants = [];
  const seen = new Set();
  for (const runtimeItem of runtimeByModelLabel.values()) {
    if (!isDefaultRuntimeModel(runtimeItem)) continue;
    const runtimeTerms = runtimeItemHeroTerms(runtimeItem);
    let matchesResourceHero = false;
    for (const term of resourceHeroTerms) {
      if (runtimeTerms.has(term)) {
        matchesResourceHero = true;
        break;
      }
    }
    if (!matchesResourceHero) continue;
    let matchesHookHero = false;
    for (const term of hookHeroTerms) {
      if (runtimeTerms.has(term)) {
        matchesHookHero = true;
        break;
      }
    }
    if (!matchesHookHero) continue;
    const modelLabel = runtimeItem.modelLabel || "";
    if (!modelLabel || seen.has(modelLabel)) continue;
    seen.add(modelLabel);
    variants.push({
      resourcePath,
      modelLabel,
      skinKind: "default",
      heroLabel: (hook?.heroNames || [])[0] || runtimeItem.character || modelLabelHeroTerm(modelLabel),
    });
  }
  return variants.sort((left, right) => left.modelLabel.localeCompare(right.modelLabel));
}

function nativeSelectorProjectileHookProjectiles(effectHookItems, existingProjectileItems, runtimeByModelLabel) {
  const seen = new Set((existingProjectileItems || []).map(projectileCoverageKey));
  const projectiles = [];
  for (const hook of effectHookItems || []) {
    if (hook?.selectorOutputRole !== "projectile") continue;
    const actionKeys = hook.actionKeys || [];
    if (!actionKeys.length) continue;
    for (const resourcePath of uniqueInOrder(hook.resourcePaths || [])) {
      const directVariants = (hook.resourceVariants || []).filter(
        (variant) => variant?.resourcePath === resourcePath && variant?.modelLabel,
      );
      const variants = directVariants.length
        ? directVariants
        : runtimeDefaultResourceVariantsForHookResource(hook, resourcePath, runtimeByModelLabel);
      for (const variant of variants) {
        if (!runtimeByModelLabel?.has(variant.modelLabel || "")) continue;
        const projectile = {
          sourceKind: "native-effect-hook-projectile-resource",
          sourceDefinitionPath: "native-effect-hook-runtime",
          modelLabel: variant.modelLabel || "",
          heroLabel: variant.heroLabel || (hook.heroNames || [])[0] || "",
          role: "projectile",
          actionKeys,
          resourcePath,
          resourceHash: "",
          effectTokens: uniqueInOrder([hook.effectToken, hook.token]),
          pairedProjectileResourcePaths: [],
          pairedImpactResourcePaths: [],
        };
        const key = projectileCoverageKey(projectile);
        if (seen.has(key)) continue;
        seen.add(key);
        projectiles.push(projectile);
      }
    }
  }
  return projectiles;
}

function actionKeysFromNativeActionNames(actionNames) {
  const keys = [];
  for (const actionName of actionNames || []) {
    const abilityMatch = String(actionName || "").match(/\bAbility0?([1-3])\b/i);
    if (abilityMatch) keys.push(`ability0${abilityMatch[1]}`);
  }
  return uniqueInOrder(keys);
}

function nativeProjectileEffectContextActionKeys(nativeRow, hook) {
  const actionNameKeys = actionKeysFromNativeActionNames(nativeRow?.actionNames || []);
  if (actionNameKeys.length) return actionNameKeys;
  return uniqueInOrder([...(hook?.actionKeys || []), ...(nativeRow?.actionKeys || [])]);
}

function nativeProjectileEffectTokenContextProjectiles(nativeItems, effectHookIndexes, existingProjectileItems, runtimeByModelLabel) {
  const seen = new Set((existingProjectileItems || []).map(projectileCoverageKey));
  const projectiles = [];
  for (const nativeRow of nativeItems || []) {
    if (!nativeRow?.emitterLabel) continue;
    for (const effectToken of nativeRowEffectTokens(nativeRow)) {
      for (const hook of effectHookIndexes.byToken.get(effectToken) || []) {
        const actionKeys = nativeProjectileEffectContextActionKeys(nativeRow, hook);
        if (!actionKeys.length) continue;
        for (const resourcePath of uniqueInOrder(hook.resourcePaths || [])) {
          const variants = (hook.resourceVariants || []).filter(
            (variant) => variant?.resourcePath === resourcePath && variant?.modelLabel,
          );
          for (const variant of variants) {
            if (!runtimeByModelLabel?.has(variant.modelLabel || "")) continue;
            const projectile = {
              sourceKind: "native-projectile-effect-token-resource",
              sourceDefinitionPath: "native-projectile-effect-token",
              modelLabel: variant.modelLabel || "",
              heroLabel: variant.heroLabel || (hook.heroNames || nativeRow.heroNames || [])[0] || "",
              role: "projectile",
              actionKeys,
              resourcePath,
              resourceHash: "",
              effectTokens: [effectToken],
              nativeContextEffectToken: effectToken,
              pairedProjectileResourcePaths: [],
              pairedImpactResourcePaths: [],
            };
            const key = projectileCoverageKey(projectile);
            if (seen.has(key)) continue;
            seen.add(key);
            projectiles.push(projectile);
          }
        }
      }
    }
  }
  return projectiles;
}

function slotDefinitionLabels(slot) {
  return new Set(pipeValues(slot?.definitionLabels));
}

function slotDefinitionLocatorLabels(slot) {
  return new Set(pipeValues(slot?.definitionLocatorLabels));
}

function slotForEmitter(runtimeItem, emitterLabel) {
  if (!runtimeItem || !emitterLabel) return null;
  for (const slot of runtimeItem.slots || runtimeItem.bindSlots || []) {
    if (slotDefinitionLabels(slot).has(emitterLabel)) return slot;
  }
  return null;
}

function definitionLogicalLocatorForEmitter(runtimeItem, nativeRows) {
  const slots = runtimeItem?.slots || runtimeItem?.bindSlots || [];
  for (const nativeRow of nativeRows || []) {
    if (!nativeRow?.emitterLabel) continue;
    for (const slot of slots) {
      if (slotDefinitionLocatorLabels(slot).has(nativeRow.emitterLabel)) return { nativeRow };
    }
  }
  return null;
}

function runtimeLocatorForEmitter(runtimeItem, nativeRows, runtimeLocatorIndex) {
  if (!runtimeItem?.sourceRelativePath || !runtimeLocatorIndex) return null;
  for (const nativeRow of nativeRows || []) {
    if (!nativeRow?.emitterLabel) continue;
    const exact = runtimeLocatorIndex.byExact.get(
      locatorKey(runtimeItem.sourceRelativePath, runtimeItem.modelLabel || "", nativeRow.emitterLabel),
    );
    if (exact) return { nativeRow, locator: exact };
    const fallback = (runtimeLocatorIndex.byDefinition.get(locatorFallbackKey(runtimeItem.sourceRelativePath, nativeRow.emitterLabel)) || [])[0];
    if (fallback) return { nativeRow, locator: fallback };
  }
  return null;
}

function slotForBone(runtimeItem, boneToken) {
  if (!runtimeItem || !boneToken) return null;
  return (runtimeItem.slots || runtimeItem.bindSlots || []).find((slot) => slot.slotName === boneToken) || null;
}

function slotForNearbyBone(runtimeItem, nativeRows) {
  for (const nativeRow of nativeRows || []) {
    for (const boneToken of nativeRow.nearbyBoneTokens || []) {
      const slot = slotForBone(runtimeItem, boneToken);
      if (slot) return { slot, nativeRow, boneToken };
    }
  }
  return null;
}

function emitterSlotScore(nativeRow, slot) {
  const label = normalized(nativeRow?.emitterLabel);
  const slotName = normalized(slot?.slotName);
  let score = Number.isInteger(Number(slot?.resolvedBoneIndex)) ? 20 : 0;
  if (/right/.test(label) && /right/.test(slotName)) score += 30;
  if (/left/.test(label) && /left/.test(slotName)) score += 30;
  if (/center|body|mass/.test(label) && /center|body|mass|root/.test(slotName)) score += 30;
  if (/mouth/.test(label) && /jaw|mouth/.test(slotName)) score += 35;
  if (/mouth/.test(label) && /head/.test(slotName)) score += 15;
  if (/head|eye/.test(label) && /head|eye/.test(slotName)) score += 25;
  if (/gun|muzzle|barrel|launcher|cannon/.test(label) && /gun|muzzle|barrel|launcher|weapon|hand/.test(slotName)) score += 30;
  if (/hook|anchor|pipe/.test(label) && /hook|anchor|pipe|weapon|hand/.test(slotName)) score += 30;
  return score;
}

function slotForSemanticEmitter(runtimeItem, nativeRows) {
  const slots = runtimeItem?.slots || runtimeItem?.bindSlots || [];
  const candidates = [];
  for (const nativeRow of nativeRows || []) {
    if (!nativeRow?.emitterLabel) continue;
    slots.forEach((slot, slotIndex) => {
      const score = emitterSlotScore(nativeRow, slot);
      if (score < RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE) return;
      candidates.push({ nativeRow, slot, slotIndex, score });
    });
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => right.score - left.score || left.slotIndex - right.slotIndex);
  return candidates[0];
}

function summarizeNativeRows(nativeRows) {
  return {
    nativeRowCount: nativeRows.length,
    nativeEmitterCandidates: uniqueInOrder(nativeRows.map((row) => row.emitterLabel)).join("|"),
    nativeEmitterExprs: uniqueInOrder(nativeRows.map((row) => row.emitterExpr).filter((value) => value && !/^"/.test(value))).join("|"),
    nativeProjectileIds: uniqueInOrder(nativeRows.map((row) => row.projectileIdHex || row.projectileId)).join("|"),
    nativeProjectileModes: uniqueInOrder(nativeRows.map((row) => row.projectileMode).filter((value) => value !== "" && value != null)).join("|"),
    nativeProjectileLateralOffsets: uniqueInOrder(
      nativeRows.map((row) => row.projectileLateralOffset).filter((value) => value !== "" && value != null),
    ).join("|"),
    nativeProjectileCallback18s: uniqueInOrder(nativeRows.map((row) => row.projectileCallback18).filter(Boolean)).join("|"),
    nativeProjectileCallback28s: uniqueInOrder(nativeRows.map((row) => row.projectileCallback28).filter(Boolean)).join("|"),
    nativeProjectileCallback38s: uniqueInOrder(nativeRows.map((row) => row.projectileCallback38).filter(Boolean)).join("|"),
    nativeNearbyBoneTokens: uniqueInOrder(nativeRows.flatMap((row) => row.nearbyBoneTokens || [])).join("|"),
    nativeSourceKinds: uniqueInOrder(nativeRows.map((row) => row.sourceKind)).join("|"),
  };
}

function summarizeEffectHooks(effectHooks) {
  return {
    nativeEffectHookCount: effectHooks.length,
    nativeEffectHookTokens: uniqueInOrder(effectHooks.map((hook) => hook.effectToken || hook.token)).join("|"),
    nativeEffectHookActionKeys: uniqueInOrder(effectHooks.flatMap((hook) => hook.actionKeys || [])).join("|"),
    nativeEffectHookKinds: uniqueInOrder(effectHooks.map((hook) => hook.sourceKind || hook.hookPattern || hook.bindKind)).join("|"),
    nativeEffectHookSkinAliases: uniqueInOrder(effectHooks.map((hook) => hook.skinAlias)).join("|"),
    nativeEffectHookMatchKinds: uniqueInOrder(effectHooks.map((hook) => hook.matchKind)).join("|"),
  };
}

function formatTimelineSeconds(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(4)).toString() : "";
}

function summarizeTimelineRows(timelineRows) {
  const times = uniqueInOrder((timelineRows || []).map((row) => formatTimelineSeconds(row.timeSeconds)).filter(Boolean));
  return {
    nativeTimelineEventCount: timelineRows.length,
    nativeTimelineTimes: times.join("|"),
    runtimeStartSeconds: times[0] || "",
    nativeTimelineSourceKinds: uniqueInOrder((timelineRows || []).map((row) => row.sourceKind).filter(Boolean)).join("|"),
  };
}

function isUnreferencedEffectLibraryProjectile(projectile, nativeRows, effectHooks, timelineRows) {
  return (
    projectile?.sourceDefinitionPath === "Effects/KindredEffects.def" &&
    !nativeRows.length &&
    !effectHooks.length &&
    !timelineRows.length
  );
}

function baseCoverageRow(projectile, runtimeItem, nativeRows, effectHooks = [], timelineRows = []) {
  const nativeSummary = summarizeNativeRows(nativeRows);
  const effectHookSummary = summarizeEffectHooks(effectHooks);
  const timelineSummary = summarizeTimelineRows(timelineRows);
  return {
    modelLabel: projectile.modelLabel || "",
    heroLabel: projectile.heroLabel || "",
    role: projectile.role || "",
    actionKeys: (projectile.actionKeys || []).join("|"),
    sourceDefinitionPath: projectile.sourceDefinitionPath || "",
    resourcePath: projectile.resourcePath || "",
    resourceHash: projectile.resourceHash || "",
    effectTokens: (projectile.effectTokens || []).join("|"),
    pairedProjectileResourcePaths: (projectile.pairedProjectileResourcePaths || []).join("|"),
    pairedImpactResourcePaths: (projectile.pairedImpactResourcePaths || []).join("|"),
    runtimeRel: runtimeItem?.rel || "",
    runtimeSourceRelativePath: runtimeItem?.sourceRelativePath || "",
    bindingStatus: "",
    bindingBoneToken: "",
    bindingBoneIndex: "",
    nativeEmitterLabel: "",
    nativeEmitterExpr: "",
    nativeProjectileId: "",
    runtimeLocatorLabel: "",
    runtimeLocatorFieldOffset: "",
    runtimeLocatorPosition: "",
    runtimeLocatorRotation: "",
    runtimeLocatorScale: "",
    runtimeLocatorTransformEvidence: "",
    ...nativeSummary,
    ...effectHookSummary,
    ...timelineSummary,
  };
}

function buildCoverageRow(projectile, runtimeItem, nativeRows, effectHooks = [], runtimeLocatorIndex = null, timelineRows = []) {
  const row = baseCoverageRow(projectile, runtimeItem, nativeRows, effectHooks, timelineRows);

  if (isUnreferencedEffectLibraryProjectile(projectile, nativeRows, effectHooks, timelineRows)) {
    row.bindingStatus = EFFECT_LIBRARY_ONLY_PROJECTILE_STATUS;
    return row;
  }

  if (projectile?.boneToken) {
    const slot = slotForBone(runtimeItem, projectile.boneToken);
    row.bindingStatus = slot ? "definition-bone" : "definition-bone-unresolved";
    row.bindingBoneToken = projectile.boneToken;
    row.bindingBoneIndex = Number.isInteger(Number(slot?.resolvedBoneIndex)) ? Number(slot.resolvedBoneIndex) : "";
    return row;
  }

  if (!nativeRows.length) {
    if (effectHooks.length) {
      row.bindingStatus = "native-effect-hook";
      return row;
    }
    row.bindingStatus = "no-native-row";
    return row;
  }

  const rowsWithEmitter = nativeRows.filter((nativeRow) => nativeRow.emitterLabel);
  for (const nativeRow of rowsWithEmitter) {
    const slot = slotForEmitter(runtimeItem, nativeRow.emitterLabel);
    if (!slot) continue;
    row.bindingStatus = "native-emitter-slot";
    row.bindingBoneToken = slot.slotName || "";
    row.bindingBoneIndex = Number.isInteger(Number(slot.resolvedBoneIndex)) ? Number(slot.resolvedBoneIndex) : "";
    row.nativeEmitterLabel = nativeRow.emitterLabel || "";
    row.nativeEmitterExpr = nativeRow.emitterExpr || "";
    row.nativeProjectileId = nativeRow.projectileIdHex || nativeRow.projectileId || "";
    return row;
  }

  const nearbyBone = slotForNearbyBone(runtimeItem, rowsWithEmitter.length ? rowsWithEmitter : nativeRows);
  if (nearbyBone) {
    row.bindingStatus = "native-nearby-bone";
    row.bindingBoneToken = nearbyBone.slot.slotName || nearbyBone.boneToken || "";
    row.bindingBoneIndex = Number.isInteger(Number(nearbyBone.slot.resolvedBoneIndex)) ? Number(nearbyBone.slot.resolvedBoneIndex) : "";
    row.nativeEmitterLabel = nearbyBone.nativeRow.emitterLabel || "";
    row.nativeEmitterExpr = nearbyBone.nativeRow.emitterExpr || "";
    row.nativeProjectileId = nearbyBone.nativeRow.projectileIdHex || nearbyBone.nativeRow.projectileId || "";
    return row;
  }

  const runtimeLocator = runtimeLocatorForEmitter(runtimeItem, rowsWithEmitter, runtimeLocatorIndex);
  if (runtimeLocator) {
    row.bindingStatus = "native-runtime-locator-transform";
    row.nativeEmitterLabel = runtimeLocator.nativeRow.emitterLabel || "";
    row.nativeEmitterExpr = runtimeLocator.nativeRow.emitterExpr || "";
    row.nativeProjectileId = runtimeLocator.nativeRow.projectileIdHex || runtimeLocator.nativeRow.projectileId || "";
    row.runtimeLocatorLabel = runtimeLocator.locator.label || "";
    row.runtimeLocatorFieldOffset = runtimeLocator.locator.fieldOffset || "";
    row.runtimeLocatorPosition = [
      runtimeLocator.locator.positionX,
      runtimeLocator.locator.positionY,
      runtimeLocator.locator.positionZ,
    ].join(",");
    row.runtimeLocatorRotation = [
      runtimeLocator.locator.rotationX,
      runtimeLocator.locator.rotationY,
      runtimeLocator.locator.rotationZ,
    ].join(",");
    row.runtimeLocatorScale = [
      runtimeLocator.locator.scaleX,
      runtimeLocator.locator.scaleY,
      runtimeLocator.locator.scaleZ,
    ].join(",");
    row.runtimeLocatorTransformEvidence = runtimeLocator.locator.transformEvidence || "";
    return row;
  }

  const definitionLogicalLocator = definitionLogicalLocatorForEmitter(runtimeItem, rowsWithEmitter);
  if (definitionLogicalLocator) {
    row.bindingStatus = "native-definition-logical-locator";
    row.nativeEmitterLabel = definitionLogicalLocator.nativeRow.emitterLabel || "";
    row.nativeEmitterExpr = definitionLogicalLocator.nativeRow.emitterExpr || "";
    row.nativeProjectileId =
      definitionLogicalLocator.nativeRow.projectileIdHex || definitionLogicalLocator.nativeRow.projectileId || "";
    return row;
  }

  const semanticEmitter = slotForSemanticEmitter(runtimeItem, rowsWithEmitter);
  if (semanticEmitter) {
    row.bindingStatus = "native-emitter-semantic-slot";
    row.bindingBoneToken = semanticEmitter.slot.slotName || "";
    row.bindingBoneIndex = Number.isInteger(Number(semanticEmitter.slot.resolvedBoneIndex))
      ? Number(semanticEmitter.slot.resolvedBoneIndex)
      : "";
    row.nativeEmitterLabel = semanticEmitter.nativeRow.emitterLabel || "";
    row.nativeEmitterExpr = semanticEmitter.nativeRow.emitterExpr || "";
    row.nativeProjectileId = semanticEmitter.nativeRow.projectileIdHex || semanticEmitter.nativeRow.projectileId || "";
    return row;
  }

  if (rowsWithEmitter.length) {
    row.bindingStatus = "native-emitter-unresolved-slot";
    row.nativeEmitterLabel = rowsWithEmitter[0].emitterLabel || "";
    row.nativeEmitterExpr = rowsWithEmitter[0].emitterExpr || "";
    row.nativeProjectileId = rowsWithEmitter[0].projectileIdHex || rowsWithEmitter[0].projectileId || "";
    return row;
  }

  row.bindingStatus = "native-row-without-emitter";
  row.nativeEmitterExpr = uniqueInOrder(nativeRows.map((nativeRow) => nativeRow.emitterExpr).filter(Boolean)).join("|");
  row.nativeProjectileId = uniqueInOrder(nativeRows.map((nativeRow) => nativeRow.projectileIdHex || nativeRow.projectileId)).join("|");
  return row;
}

function buildRuntimeProjectileBindingCoverageRows({
  projectileItems = [],
  nativeItems = [],
  timelineItems = [],
  runtimeItems = [],
  effectHookItems = [],
  skinEffectAliasItems = [],
  abilityStemItems = [],
  runtimeLocatorItems = [],
} = {}) {
  const runtimeByModelLabel = buildRuntimeItemIndex(runtimeItems);
  const nativeByHero = buildNativeHeroIndex(nativeItems);
  const timelineByHero = buildNativeHeroIndex(timelineItems);
  const runtimeLocatorIndex = buildRuntimeLocatorIndex(runtimeLocatorItems);
  const effectHookIndexes = {
    items: effectHookItems || [],
    byResource: buildEffectHookResourceIndex(effectHookItems),
    byToken: buildEffectHookTokenIndex(effectHookItems),
    byResourceAlias: buildEffectHookResourceAliasIndex(effectHookItems),
    bySemanticToken: buildEffectHookSemanticTokenIndex(effectHookItems),
  };
  const skinEffectAliases = buildSkinEffectAliasIndex(skinEffectAliasItems);
  const skinEffectAliasesBySource = buildSkinEffectAliasSourceIndex(skinEffectAliasItems);
  const abilityStemIndex = buildAbilityStemIndex(abilityStemItems);
  const rows = [];
  const nativeSelectorProjectiles = nativeSelectorProjectileHookProjectiles(
    effectHookItems,
    projectileItems,
    runtimeByModelLabel,
  );
  const allProjectileItems = [
    ...(projectileItems || []),
    ...nativeSelectorProjectiles,
    ...nativeProjectileEffectTokenContextProjectiles(
      nativeItems,
      effectHookIndexes,
      [...(projectileItems || []), ...nativeSelectorProjectiles],
      runtimeByModelLabel,
    ),
  ];

  for (const projectile of allProjectileItems) {
    if (projectile.role && projectile.role !== "projectile") continue;
    const runtimeItem = runtimeByModelLabel.get(projectile.modelLabel || "");
    const nativeRows = nativeRowsForProjectile(projectile, nativeByHero);
    const timelineRows = timelineRowsForProjectile(projectile, timelineByHero, nativeRows);
    const effectHooks = effectHooksForProjectile(
      projectile,
      effectHookIndexes,
      skinEffectAliases,
      abilityStemIndex,
      skinEffectAliasesBySource,
    );
    rows.push(buildCoverageRow(projectile, runtimeItem, nativeRows, effectHooks, runtimeLocatorIndex, timelineRows));
  }

  return rows.sort((left, right) => left.modelLabel.localeCompare(right.modelLabel) || left.resourcePath.localeCompare(right.resourcePath));
}

function summarizeRuntimeProjectileBindingCoverageRows(rows) {
  const byStatus = {};
  const byHero = {};
  for (const row of rows || []) {
    byStatus[row.bindingStatus] = (byStatus[row.bindingStatus] || 0) + 1;
    byHero[row.heroLabel] = byHero[row.heroLabel] || {};
    byHero[row.heroLabel][row.bindingStatus] = (byHero[row.heroLabel][row.bindingStatus] || 0) + 1;
  }
  const boundRows =
    (byStatus["definition-bone"] || 0) +
    (byStatus["native-emitter-slot"] || 0) +
    (byStatus["native-nearby-bone"] || 0) +
    (byStatus["native-runtime-locator-transform"] || 0) +
    (byStatus["native-emitter-semantic-slot"] || 0) +
    (byStatus["native-effect-hook"] || 0);
  const nonRuntimeRows = byStatus[EFFECT_LIBRARY_ONLY_PROJECTILE_STATUS] || 0;
  return {
    rows: rows.length,
    boundRows,
    nonRuntimeRows,
    unboundRows: rows.length - boundRows - nonRuntimeRows,
    byStatus,
    byHero,
  };
}

function exportRuntimeProjectileBindingCoverageReport({
  runtimePath = defaultRuntimePath,
  projectilePath = defaultProjectilePath,
  nativePath = defaultNativePath,
  timelinePath = defaultTimelinePath,
  effectHookPath = defaultEffectHookPath,
  skinEffectAliasPath = defaultSkinEffectAliasPath,
  abilityStemPath = defaultAbilityStemPath,
  runtimeLocatorPath = defaultRuntimeLocatorPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const rows = buildRuntimeProjectileBindingCoverageRows({
    runtimeItems: readJsonItems(runtimePath),
    projectileItems: readJsonItems(projectilePath),
    nativeItems: readJsonItems(nativePath),
    timelineItems: readJsonItems(timelinePath),
    effectHookItems: readJsonItems(effectHookPath),
    skinEffectAliasItems: readJsonItems(skinEffectAliasPath),
    abilityStemItems: readTsvRows(abilityStemPath),
    runtimeLocatorItems: readTsvRows(runtimeLocatorPath),
  });
  const columns = [
    "modelLabel",
    "heroLabel",
    "role",
    "actionKeys",
    "sourceDefinitionPath",
    "bindingStatus",
    "bindingBoneToken",
    "bindingBoneIndex",
    "nativeEmitterLabel",
    "nativeEmitterExpr",
    "nativeProjectileId",
    "runtimeLocatorLabel",
    "runtimeLocatorFieldOffset",
    "runtimeLocatorPosition",
    "runtimeLocatorRotation",
    "runtimeLocatorScale",
    "runtimeLocatorTransformEvidence",
    "nativeRowCount",
    "nativeEmitterCandidates",
    "nativeEmitterExprs",
    "nativeProjectileIds",
    "nativeProjectileModes",
    "nativeProjectileLateralOffsets",
    "nativeProjectileCallback18s",
    "nativeProjectileCallback28s",
    "nativeProjectileCallback38s",
    "nativeNearbyBoneTokens",
    "nativeSourceKinds",
    "nativeTimelineEventCount",
    "nativeTimelineTimes",
    "runtimeStartSeconds",
    "nativeTimelineSourceKinds",
    "nativeEffectHookCount",
    "nativeEffectHookTokens",
    "nativeEffectHookActionKeys",
    "nativeEffectHookKinds",
    "nativeEffectHookSkinAliases",
    "nativeEffectHookMatchKinds",
    "effectTokens",
    "pairedProjectileResourcePaths",
    "pairedImpactResourcePaths",
    "resourcePath",
    "resourceHash",
    "runtimeRel",
    "runtimeSourceRelativePath",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarizeRuntimeProjectileBindingCoverageRows(rows);
  const payload = { generatedAt: new Date().toISOString(), summary, items: rows };
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(payload, null, 2)}\n`);
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(viewerOut, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeProjectileBindingCoverageReport({
    runtimePath: optionValue(args, "--runtime", defaultRuntimePath),
    projectilePath: optionValue(args, "--projectiles", defaultProjectilePath),
    nativePath: optionValue(args, "--native", defaultNativePath),
    timelinePath: optionValue(args, "--timeline", defaultTimelinePath),
    effectHookPath: optionValue(args, "--effect-hooks", defaultEffectHookPath),
    skinEffectAliasPath: optionValue(args, "--skin-effect-aliases", defaultSkinEffectAliasPath),
    abilityStemPath: optionValue(args, "--ability-stems", defaultAbilityStemPath),
    runtimeLocatorPath: optionValue(args, "--runtime-locators", defaultRuntimeLocatorPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeProjectileBindingCoverageRows,
  exportRuntimeProjectileBindingCoverageReport,
  summarizeRuntimeProjectileBindingCoverageRows,
};
