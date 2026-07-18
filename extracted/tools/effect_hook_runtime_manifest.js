#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseEffectToken, matchHeroAliasResources } = require("./attachment_effect_alias_bridge");
const { effectBasename, resourceMatchesForToken } = require("./attachment_effect_resource_bridge");
const { kindredSlotCandidatesForHook } = require("./effect_runtime_gap_report");

const defaultBindingPath = "extracted/reports/native_effect_hook_binding_instances.tsv";
const defaultAbilityBridgePath = "extracted/reports/native_attachment_helper_call_ability_slot_bridge.tsv";
const defaultVisualBindingPath = "extracted/reports/native_visual_binding_candidates.tsv";
const defaultEffectResourcePath = "extracted/reports/effect_resource_index.tsv";
const defaultPfxResourcePath = "extracted/reports/effect_pfx_resource_manifest.tsv";
const defaultShadergraphCandidatePath = "extracted/reports/ios_effect_shadergraph_candidates.tsv";
const defaultHeroNamesPath = "extracted/reports/hero_ability_effect_sound_buff_names.tsv";
const defaultDefinitionChainPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultNativeEffectSpawnPath = "extracted/viewer/native-effect-spawn-manifest.json";
const defaultNativeTimelinePath = "extracted/viewer/native-runtime-timeline-manifest.json";
const defaultKindredSlotPath = "extracted/viewer/kindred-effect-resource-slots.json";
const defaultSkinEffectAliasPath = "extracted/viewer/runtime-skin-effect-aliases.json";
const defaultViewerOut = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultReportTsvOut = "extracted/reports/effect_hook_runtime_manifest.tsv";
const defaultReportJsonOut = "extracted/reports/effect_hook_runtime_manifest_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
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

function readShadergraphCandidateRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status = "", relativePath = "", hash = "", filePath = ""] = line.split("\t");
      return { status, relativePath, hash, filePath };
    });
}

function readJsonItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
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

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listValue(value) {
  return Array.isArray(value) ? value.filter(Boolean) : splitList(value);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function boolString(value) {
  return value === true || value === "yes";
}

function numberOrNull(value) {
  if (value === "" || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function functionKey(row) {
  return `${row.platform}:${row.functionName}`;
}

function tokenSetFromRow(row) {
  return new Set(
    [
      ...splitList(row.parentTokens),
      ...splitList(row.visualParentTokens),
      ...splitList(row.combinedParentTokens),
      ...splitList(row.evidenceTokens),
    ].filter(Boolean),
  );
}

function hookTokens(row) {
  return uniq([row.token, row.effectToken, row.boneToken, ...splitList(row.buffTokens)]);
}

function scoreAbilityContext(bindingRow, abilityRow, abilityTokens) {
  let score = 0;
  const tokens = hookTokens(bindingRow);
  const tokenMatches = tokens.filter((token) => abilityTokens.has(token));
  if (tokenMatches.length) score += 5 + Math.min(tokenMatches.length, 3);
  if (abilityRow.slotStatus === "resolved-direct-ability-slot") score += 4;
  if (abilityRow.contextConfidence === "high") score += 3;
  else if (abilityRow.contextConfidence === "medium") score += 1;
  if (abilityRow.runtimeVariableStatus === "resolved-ability-variable") score += 1;
  if (splitList(abilityRow.parentRoles).some((role) => /weapon|effect|visual|attach/.test(role))) score += 1;
  return { score, tokenMatches };
}

function buildAbilityContextIndex(abilityRows) {
  const byParentFunction = new Map();
  for (const row of abilityRows || []) {
    for (const parentFunction of splitList(row.parentFunctions)) {
      const records = byParentFunction.get(parentFunction) || [];
      records.push({
        row,
        tokens: tokenSetFromRow(row),
      });
      byParentFunction.set(parentFunction, records);
    }
  }
  return byParentFunction;
}

function contextSortKey(context) {
  return [
    String(1000 - context.matchScore).padStart(4, "0"),
    context.definitionPath || "",
    context.runtimeAbilityName || "",
    String(context.runtimeVariableIndex ?? "").padStart(4, "0"),
    context.callKey || "",
  ].join("\t");
}

function contextsForBinding(bindingRow, abilityIndex) {
  const candidates = abilityIndex.get(functionKey(bindingRow)) || [];
  const contexts = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const { row, tokens } = candidate;
    const { score, tokenMatches } = scoreAbilityContext(bindingRow, row, tokens);
    if (!tokenMatches.length) continue;
    if (score < 5) continue;

    const key = [
      row.callKey,
      row.definitionPath,
      row.runtimeAbilityName,
      row.runtimeVariableIndex,
      row.runtimeVariableName,
    ].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);

    contexts.push({
      callKey: row.callKey,
      callbackFunction: row.callbackFunction,
      definitionPath: row.definitionPath,
      definitionPathSelection: row.definitionPathSelection,
      contextClass: row.contextClass,
      contextConfidence: row.contextConfidence,
      slotStatus: row.slotStatus,
      runtimeAbilitySlotIndex: numberOrNull(row.runtimeAbilitySlotIndex),
      runtimeAbilityName: row.runtimeAbilityName,
      runtimeVariableIndex: numberOrNull(row.runtimeVariableIndex),
      runtimeVariableStatus: row.runtimeVariableStatus,
      runtimeVariableName: row.runtimeVariableName,
      parentRoles: splitList(row.parentRoles),
      evidenceTokens: splitList(row.evidenceTokens),
      matchedTokens: tokenMatches,
      matchScore: score,
    });
  }

  return contexts.sort((left, right) => contextSortKey(left).localeCompare(contextSortKey(right))).slice(0, 16);
}

function heroCodeFromPath(value = "") {
  const match = String(value).match(/(?:Characters|Effects)\/(Hero\d+)/i);
  return match ? match[1] : "";
}

function effectResourceRootFromPath(value = "") {
  const match = String(value).match(/^Effects\/([^/]+)/i);
  return match ? match[1] : "";
}

function normalizedTerm(value) {
  return String(value || "").toLowerCase();
}

function compactTerm(value) {
  return normalizedTerm(value).replace(/[^a-z0-9]+/g, "");
}

function pathIdentifierStem(token) {
  const match = String(token || "").match(/_([A-Za-z0-9]+)PathIdentifier$/);
  return match ? normalizedTerm(match[1]) : "";
}

function pathVariableTerms(token) {
  const match = String(token || "").match(/^u_(.+)_Path$/i);
  if (!match) return [];
  return match[1]
    .split("_")
    .map(normalizedTerm)
    .filter((term) => term.length >= 3);
}

function termsMatch(left, right) {
  const normalizedLeft = normalizedTerm(left);
  const normalizedRight = normalizedTerm(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return (
    (normalizedLeft.length >= 4 && normalizedRight.startsWith(normalizedLeft)) ||
    (normalizedRight.length >= 4 && normalizedLeft.startsWith(normalizedRight))
  );
}

function buildVisualPathIdentifierIndex(visualBindingRows = []) {
  const index = new Map();
  for (const row of visualBindingRows || []) {
    const samples = splitList(row.stringSamples);
    const effectTokens = samples.filter((token) => /^Effect_/.test(token));
    const pathVariables = samples.filter((token) => /^u_.+_Path$/i.test(token));
    if (!effectTokens.length || !pathVariables.length) continue;

    for (const effectToken of effectTokens) {
      const stem = pathIdentifierStem(effectToken);
      if (!stem) continue;
      const matchedVariables = pathVariables.filter((pathVariable) => pathVariableTerms(pathVariable).some((term) => termsMatch(term, stem)));
      const variables = matchedVariables.length ? matchedVariables : pathVariables.length === 1 ? pathVariables : [];
      if (!variables.length) continue;

      const existing = index.get(effectToken) || new Set();
      for (const variable of variables) {
        for (const term of pathVariableTerms(variable)) existing.add(term);
      }
      index.set(effectToken, existing);
    }
  }
  return index;
}

function pfxHookIndexEffectTokens(row = {}) {
  const intrinsicTokens = splitList(row.intrinsicEffectTokens);
  if (intrinsicTokens.length) return intrinsicTokens;
  if (Object.prototype.hasOwnProperty.call(row, "intrinsicEffectTokens")) {
    return splitList(row.hookTokens).length ? splitList(row.hookEffectTokens) : [];
  }
  return splitList(row.hookEffectTokens);
}

function buildPfxHookEffectTokenIndex(pfxRows = []) {
  const index = new Map();
  for (const row of pfxRows || []) {
    if (!row.relativePath) continue;
    const tokens = pfxHookIndexEffectTokens(row);
    for (const token of tokens) {
      const rows = index.get(token) || [];
      rows.push(row);
      index.set(token, rows);
    }
  }
  return index;
}

function buildPfxLinkedHookEffectTokenIndex(pfxRows = []) {
  const index = new Map();
  for (const row of pfxRows || []) {
    if (!row.relativePath) continue;
    const intrinsicTokens = pfxHookIndexEffectTokens(row);
    const linkedHookTokens = splitList(row.hookTokens).length ? splitList(row.hookEffectTokens) : [];
    for (const token of uniq([...intrinsicTokens, ...linkedHookTokens])) {
      const rows = index.get(token) || [];
      rows.push(row);
      index.set(token, rows);
    }
  }
  return index;
}

function uniquePfxHookEffectTokenResourceMatches(token, pfxHookEffectTokenIndex = new Map()) {
  const rows = pfxHookEffectTokenIndex.get(token) || [];
  const byPath = new Map();
  for (const row of rows) {
    if (!row.relativePath) continue;
    if (!byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function resourceRowsByRelativePath(rows = []) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row.relativePath || index.has(row.relativePath)) continue;
    index.set(row.relativePath, row);
  }
  return index;
}

function resourceRowsByLowercaseRelativePath(rows = []) {
  const index = new Map();
  const ambiguous = new Set();
  for (const row of rows || []) {
    if (!row.relativePath) continue;
    const key = String(row.relativePath).toLowerCase();
    const existing = index.get(key);
    if (!existing) {
      index.set(key, row);
      continue;
    }
    if (existing.relativePath !== row.relativePath) ambiguous.add(key);
  }
  for (const key of ambiguous) index.delete(key);
  return index;
}

function resourceRowForCandidatePath(candidatePath, exactIndex, lowercaseIndex) {
  return exactIndex.get(candidatePath) || lowercaseIndex.get(String(candidatePath || "").toLowerCase()) || null;
}

function buildKindredSlotsByResourcePath(kindredSlots = []) {
  const index = new Map();
  for (const slot of kindredSlots || []) {
    if (!slot?.resourcePath) continue;
    const rows = index.get(slot.resourcePath) || [];
    rows.push(slot);
    index.set(slot.resourcePath, rows);
  }
  return index;
}

function buildEffectResourceRootIndex(effectRows = []) {
  const index = new Map();
  for (const row of effectRows || []) {
    const root = effectResourceRootFromPath(row.relativePath);
    if (!root) continue;
    const rows = index.get(root) || [];
    rows.push(row);
    index.set(root, rows);
  }
  return index;
}

function effectTokenRootPrefix(token = "") {
  const match = String(token || "").match(/^Effect_([^_]+)/);
  return match ? match[1] : "";
}

function hasDefinitionRoot(root, definitionRows = []) {
  if (!root) return false;
  const normalizedRoot = normalizedTerm(root);
  return (definitionRows || []).some((row) => {
    const label = String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "").toLowerCase();
    const target = String(row.targetRelativePath || "").toLowerCase();
    return label === normalizedRoot || target.endsWith(`/${normalizedRoot}.def`) || target.includes(`/characters/${normalizedRoot}/`);
  });
}

function uniqueSingletonEffectRootResourceMatches(token, effectResourceRootIndex = new Map(), definitionRows = []) {
  if (/_Channel(?:_End)?$/i.test(token || "")) return [];
  const root = effectTokenRootPrefix(token);
  if (!root || /^Hero\d{3}$/i.test(root)) return [];
  if (hasDefinitionRoot(root, definitionRows)) return [];
  const rows = effectResourceRootIndex.get(root) || [];
  return rows.length === 1 ? rows : [];
}

function channelSiblingCandidatePathsForEndPath(relativePath = "") {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const endStem = effectBasename(normalizedPath);
  if (!/_End$/i.test(endStem)) return [];

  const stem = endStem.replace(/_End$/i, "");
  const parent = path.posix.dirname(normalizedPath);
  const parentName = path.posix.basename(parent);
  const grandParent = path.posix.dirname(parent);
  const candidates = [];

  if (/_End$/i.test(parentName)) {
    const parentStem = parentName.replace(/_End$/i, "");
    candidates.push(path.posix.join(grandParent, parentStem, `${stem}.pfx`));
    candidates.push(path.posix.join(grandParent, `${parentStem}.assetbundle`, `${stem}.pfx`));
  }
  if (/_End\.assetbundle$/i.test(parentName)) {
    candidates.push(path.posix.join(grandParent, parentName.replace(/_End\.assetbundle$/i, ".assetbundle"), `${stem}.pfx`));
  }

  return uniq(candidates);
}

function uniquePfxHookChannelSiblingResourceMatches(
  token,
  pfxHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
) {
  if (!/_Channel$/i.test(token || "")) return [];
  const endMatches = uniquePfxHookEffectTokenResourceMatches(`${token}_End`, pfxHookEffectTokenIndex);
  if (!endMatches.length) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const byPath = new Map();
  for (const endMatch of endMatches) {
    for (const candidatePath of channelSiblingCandidatePathsForEndPath(endMatch.relativePath)) {
      const row = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
      if (row && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
    }
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function altSiblingCandidatePathsForAltPath(relativePath = "") {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const altStem = effectBasename(normalizedPath);
  if (!/_Alt$/i.test(altStem)) return [];

  const stem = altStem.replace(/_Alt$/i, "");
  const parent = path.posix.dirname(normalizedPath);
  const parentName = path.posix.basename(parent);
  const grandParent = path.posix.dirname(parent);
  const candidates = [path.posix.join(parent, `${stem}.pfx`)];

  if (/_Alt$/i.test(parentName)) {
    const parentStem = parentName.replace(/_Alt$/i, "");
    candidates.push(path.posix.join(grandParent, parentStem, `${stem}.pfx`));
    candidates.push(path.posix.join(grandParent, `${parentStem}.assetbundle`, `${stem}.pfx`));
  }
  if (/_Alt\.assetbundle$/i.test(parentName)) {
    candidates.push(path.posix.join(grandParent, parentName.replace(/_Alt\.assetbundle$/i, ".assetbundle"), `${stem}.pfx`));
  }

  return uniq(candidates);
}

function uniquePfxHookAltSiblingResourceMatches(
  token,
  pfxHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
) {
  if (/_Alt$/i.test(token || "")) return [];
  const altMatches = uniquePfxHookEffectTokenResourceMatches(`${token}_Alt`, pfxHookEffectTokenIndex);
  if (!altMatches.length) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const byPath = new Map();
  for (const altMatch of altMatches) {
    for (const candidatePath of altSiblingCandidatePathsForAltPath(altMatch.relativePath)) {
      const row = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
      if (row && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
    }
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function suffixSiblingCandidatePathsForSuffixedPath(relativePath = "", suffix = "") {
  if (!suffix) return [];
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const suffixPattern = new RegExp(`_${suffix}$`, "i");
  const assetbundleSuffixPattern = new RegExp(`_${suffix}\\.assetbundle$`, "i");
  const suffixedStem = effectBasename(normalizedPath);
  if (!suffixPattern.test(suffixedStem)) return [];

  const stem = suffixedStem.replace(suffixPattern, "");
  const parent = path.posix.dirname(normalizedPath);
  const parentName = path.posix.basename(parent);
  const grandParent = path.posix.dirname(parent);
  const candidates = [path.posix.join(parent, `${stem}.pfx`)];

  if (suffixPattern.test(parentName)) {
    const parentStem = parentName.replace(suffixPattern, "");
    candidates.push(path.posix.join(grandParent, parentStem, `${stem}.pfx`));
    candidates.push(path.posix.join(grandParent, `${parentStem}.assetbundle`, `${stem}.pfx`));
  }
  if (assetbundleSuffixPattern.test(parentName)) {
    candidates.push(path.posix.join(grandParent, parentName.replace(assetbundleSuffixPattern, ".assetbundle"), `${stem}.pfx`));
  }

  return uniq(candidates);
}

function uniquePfxHookSuffixSiblingResourceMatches(
  token,
  pfxHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
) {
  const siblingSuffixes = ["Enemy"];
  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const byPath = new Map();

  for (const suffix of siblingSuffixes) {
    if (new RegExp(`_${suffix}$`, "i").test(token || "")) continue;
    const suffixedMatches = uniquePfxHookEffectTokenResourceMatches(`${token}_${suffix}`, pfxHookEffectTokenIndex);
    for (const suffixedMatch of suffixedMatches) {
      for (const candidatePath of suffixSiblingCandidatePathsForSuffixedPath(suffixedMatch.relativePath, suffix)) {
        const row = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
        if (row && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
      }
    }
  }

  return byPath.size === 1 ? [...byPath.values()] : [];
}

function uniqueLinkedPfxHookProcSiblingResourceMatches(
  token,
  pfxLinkedHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
  row = {},
) {
  if (/_Proc$/i.test(token || "")) return [];
  if (row.sourceKind !== "native-visual-binding") return [];
  if (row.bindKind !== "visual-bone-effect" || !row.boneToken) return [];

  const procToken = `${token}_Proc`;
  const procMatches = uniquePfxHookEffectTokenResourceMatches(procToken, pfxLinkedHookEffectTokenIndex).filter((match) =>
    splitList(match.hookTokens).includes(procToken),
  );
  if (!procMatches.length) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const byPath = new Map();
  for (const procMatch of procMatches) {
    for (const candidatePath of suffixSiblingCandidatePathsForSuffixedPath(procMatch.relativePath, "Proc")) {
      const resourceRow = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
      if (resourceRow && !byPath.has(resourceRow.relativePath)) byPath.set(resourceRow.relativePath, resourceRow);
    }
  }

  return byPath.size === 1 ? [...byPath.values()] : [];
}

function terminalSideSuffix(value = "") {
  const match = String(value || "").match(/_(L|R)$/i);
  return match ? match[1].toUpperCase() : "";
}

function oppositeTerminalSideSuffix(side = "") {
  if (side === "L") return "R";
  if (side === "R") return "L";
  return "";
}

function replaceTerminalSideSuffix(value = "", fromSide = "", toSide = "") {
  if (!fromSide || !toSide) return "";
  return String(value || "").replace(new RegExp(`_${fromSide}$`, "i"), `_${toSide}`);
}

function sideSiblingCandidatePathsForSidedPath(relativePath = "", fromSide = "", toSide = "") {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  const sidedStem = effectBasename(normalizedPath);
  if (terminalSideSuffix(sidedStem) !== fromSide) return [];

  const stem = replaceTerminalSideSuffix(sidedStem, fromSide, toSide);
  const parent = path.posix.dirname(normalizedPath);
  const parentName = path.posix.basename(parent);
  const grandParent = path.posix.dirname(parent);
  const candidates = [path.posix.join(parent, `${stem}.pfx`)];

  if (terminalSideSuffix(parentName) === fromSide) {
    const parentStem = replaceTerminalSideSuffix(parentName, fromSide, toSide);
    candidates.push(path.posix.join(grandParent, parentStem, `${stem}.pfx`));
    candidates.push(path.posix.join(grandParent, `${parentStem}.assetbundle`, `${stem}.pfx`));
  }

  return uniq(candidates);
}

function uniquePfxHookSideSiblingResourceMatches(
  token,
  pfxHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
) {
  const toSide = terminalSideSuffix(token);
  const fromSide = oppositeTerminalSideSuffix(toSide);
  if (!toSide || !fromSide) return [];

  const oppositeToken = replaceTerminalSideSuffix(token, toSide, fromSide);
  const oppositeMatches = uniquePfxHookEffectTokenResourceMatches(oppositeToken, pfxHookEffectTokenIndex);
  if (!oppositeMatches.length) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const byPath = new Map();
  for (const oppositeMatch of oppositeMatches) {
    for (const candidatePath of sideSiblingCandidatePathsForSidedPath(oppositeMatch.relativePath, fromSide, toSide)) {
      const row = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
      if (row && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
    }
  }

  return byPath.size === 1 ? [...byPath.values()] : [];
}

function itemSideRingSiblingCandidatePaths(entity = "", stem = "") {
  if (!entity || !stem) return [];
  const itemStem = `${entity}_${stem}`;
  return [
    `Effects/Items/${itemStem}/${itemStem}.pfx`,
    `Effects/Items/${itemStem}.assetbundle/${itemStem}.pfx`,
  ];
}

function itemSideRingSiblingPathMatches(row = {}, entity = "", stem = "") {
  const relativePath = String(row.relativePath || "");
  if (!relativePath.startsWith("Effects/Items/")) return false;
  return compactTerm(effectBasename(relativePath)) === compactTerm(`${entity}_${stem}`);
}

function uniquePfxHookItemSideRingSiblingResourceMatches(
  token,
  pfxHookEffectTokenIndex = new Map(),
  effectRows = [],
  pfxResourceRows = [],
) {
  const match = String(token || "").match(/^Effect_([^_]+)_Ring_E$/i);
  if (!match) return [];
  const [, entity] = match;
  const enemyProjectileMatches = uniquePfxHookEffectTokenResourceMatches(`Effect_${entity}_Proj_E`, pfxHookEffectTokenIndex);
  const allyProjectileMatches = uniquePfxHookEffectTokenResourceMatches(`Effect_${entity}_Proj_A`, pfxHookEffectTokenIndex);
  if (!enemyProjectileMatches.length || !allyProjectileMatches.length) return [];

  if (!enemyProjectileMatches.every((row) => itemSideRingSiblingPathMatches(row, entity, "Proj_E"))) return [];
  if (!allyProjectileMatches.every((row) => itemSideRingSiblingPathMatches(row, entity, "Proj_A"))) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const allyRingRows = itemSideRingSiblingCandidatePaths(entity, "Ring_A")
    .map((candidatePath) => resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex))
    .filter(Boolean);
  if (!allyRingRows.length) return [];

  const byPath = new Map();
  for (const candidatePath of itemSideRingSiblingCandidatePaths(entity, "Ring")) {
    const row = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
    if (row && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function uniqueItemSideRingSiblingResourceMatches(token, effectRows = [], pfxResourceRows = []) {
  const match = String(token || "").match(/^Effect_([^_]+)_Ring_E$/i);
  if (!match) return [];
  const [, entity] = match;

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const resourceIndex = resourceRowsByRelativePath(resourceRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(resourceRows);
  const rowsForStem = (stem) =>
    itemSideRingSiblingCandidatePaths(entity, stem)
      .map((candidatePath) => resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex))
      .filter(Boolean);

  if (!rowsForStem("Proj_A").length || !rowsForStem("Proj_E").length || !rowsForStem("Ring_A").length) return [];

  const byPath = new Map();
  for (const row of rowsForStem("Ring")) {
    if (row.relativePath && !byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function itemResourceEntityStem(relativePath = "") {
  const match = String(relativePath || "").match(/^Effects\/Items\/([^/]+)\//i);
  return match ? match[1].replace(/\.assetbundle$/i, "") : "";
}

function uniqueItemVisualBoneResourceMatches(token, effectRows = [], pfxResourceRows = [], row = {}) {
  if (row.sourceKind !== "native-visual-binding") return [];
  if (row.bindKind !== "visual-bone-effect" || !row.boneToken) return [];
  if (listValue(row.heroNames).length || listValue(row.heroCodes).length || listValue(row.actionKeys).length) return [];

  const tokenStem = String(token || "").replace(/^Effect_/i, "");
  const tokenCompact = compactTerm(tokenStem);
  if (tokenCompact.length < 4) return [];

  const resourceRows = [...effectRows, ...pfxResourceRows];
  const byPath = new Map();
  for (const resourceRow of resourceRows) {
    const relativePath = String(resourceRow.relativePath || "");
    const entityStem = itemResourceEntityStem(relativePath);
    if (!entityStem) continue;

    const entityCompact = compactTerm(entityStem);
    const basenameCompact = compactTerm(effectBasename(relativePath));
    if (!entityCompact.startsWith(tokenCompact) || !basenameCompact.startsWith(tokenCompact)) continue;
    if (!byPath.has(relativePath)) byPath.set(relativePath, resourceRow);
  }

  return byPath.size === 1 ? [...byPath.values()] : [];
}

function uniqueGlobalEffectTermResourceMatches(token, effectRows = [], row = {}) {
  if (row.sourceKind !== "native-effect-vcall") return [];
  const isDirectLocatorEffect = row.bindKind === "direct-locator-effect" && Boolean(row.boneToken);
  if (row.bindKind !== "effect-only" && !isDirectLocatorEffect) return [];
  if (listValue(row.heroNames).length || listValue(row.heroCodes).length || listValue(row.actionKeys).length) return [];

  const tokenTerms = significantEffectTerms(String(token || "").replace(/^Effect_/i, ""));
  if (tokenTerms.length < 2) return [];

  const byPath = new Map();
  for (const resourceRow of effectRows || []) {
    const relativePath = String(resourceRow.relativePath || "");
    if (!relativePath) continue;
    const resourceTerms = effectResourcePathTerms(relativePath, {});
    if (!tokenTerms.every((term) => termsContainRelatedTerm(resourceTerms, term))) continue;
    if (!byPath.has(relativePath)) byPath.set(relativePath, resourceRow);
  }

  return byPath.size === 1 ? [...byPath.values()] : [];
}

function globalEffectTermResourceCandidates(token, effectRows = [], row = {}) {
  const isEffectChannel =
    ["native-effect-vcall", "native-effect-spawn"].includes(row.sourceKind) && row.bindKind === "effect-only";
  const isDirectLocatorEffect = row.sourceKind === "native-effect-vcall" && row.bindKind === "direct-locator-effect" && Boolean(row.boneToken);
  if (!isEffectChannel && !isDirectLocatorEffect) return [];
  if (listValue(row.heroNames).length || listValue(row.heroCodes).length || listValue(row.actionKeys).length) return [];

  const body = String(token || "").replace(/^Effect_/i, "");
  const terms = significantEffectTerms(body).filter((term) => term.length >= 4 && term !== "item");
  if (!body || !terms.length) return [];
  const compactBody = compactTerm(body);
  const byPath = new Map();
  for (const resourceRow of effectRows || []) {
    const relativePath = String(resourceRow.relativePath || "");
    if (!relativePath) continue;
    const compactPath = compactTerm(relativePath);
    if (compactBody.length >= 5 && compactPath.includes(compactBody)) {
      byPath.set(relativePath, resourceRow);
      continue;
    }
    const resourceTerms = effectResourcePathTerms(relativePath, {});
    const matchCount = terms.filter((term) => termsContainRelatedTerm(resourceTerms, term)).length;
    if (matchCount >= Math.min(2, terms.length) || (terms.length === 1 && matchCount === 1)) {
      byPath.set(relativePath, resourceRow);
    }
  }
  return [...byPath.values()].sort((left, right) => String(left.relativePath).localeCompare(String(right.relativePath)));
}

function nativeNearbyExactGlobalCandidateResourceMatches(token, effectRows = [], row = {}) {
  const candidates = globalEffectTermResourceCandidates(token, effectRows, row);
  if (candidates.length < 2) return [];
  const candidatePaths = new Set(candidates.map((candidate) => candidate.relativePath));
  const byPath = new Map();
  for (const nearbyToken of listValue(row.nativeNearbyEffectTokens || row.nearbyEffectTokens)) {
    const exact = resourceMatchesForToken(nearbyToken, effectRows);
    if (!["exact-basename", "compact-basename"].includes(exact.matchKind)) continue;
    for (const match of exact.matches || []) {
      if (!candidatePaths.has(match.relativePath)) continue;
      byPath.set(match.relativePath, match);
    }
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeNearbyTermGlobalCandidateResourceMatches(token, effectRows = [], row = {}) {
  const candidates = globalEffectTermResourceCandidates(token, effectRows, row);
  if (candidates.length < 2) return [];
  const candidatePaths = new Set(candidates.map((candidate) => candidate.relativePath));
  const byPath = new Map();
  for (const nearbyToken of listValue(row.nativeNearbyEffectTokens || row.nearbyEffectTokens)) {
    const nearbyMatches = uniqueGlobalEffectTermResourceMatches(nearbyToken, effectRows, {
      sourceKind: "native-effect-vcall",
      bindKind: "effect-only",
    });
    for (const match of nearbyMatches || []) {
      if (!candidatePaths.has(match.relativePath)) continue;
      byPath.set(match.relativePath, match);
    }
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function genericHero000EffectNameResourceMatches(token, effectRows = []) {
  const key = String(token || "").replace(/^Effect_/, "");
  const parts = key.split("_").filter(Boolean);
  if (parts.length < 2 || /^Hero000$/i.test(parts[0])) return [];

  const genericStem = `Hero000_${parts.slice(1).join("_")}`;
  const byPath = new Map();
  for (const row of effectRows || []) {
    if (effectResourceRootFromPath(row.relativePath) !== "Hero000") continue;
    if (compactTerm(effectBasename(row.relativePath)) !== compactTerm(genericStem)) continue;
    byPath.set(row.relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function selectorPfxHookSiblingRoleTerms(role = "") {
  if (role === "projectile") return ["projectile", "proj", "shot", "shots", "missile", "bullet", "arrow", "arrows", "fireball", "core"];
  if (role === "impact") return ["impact", "hit", "explosion", "burst", "ground"];
  if (role === "cast") return ["cast", "channel", "channeling", "charge", "charging", "start"];
  if (role === "persistent") return ["idle", "loop", "aura", "ring", "warning", "indicator", "target", "timer", "glow", "buff"];
  return [];
}

function selectorPfxHookSiblingBaseTerms(parsed = {}, role = "") {
  const roleTerms = selectorPfxHookSiblingRoleTerms(role);
  if (!roleTerms.length) return [];
  return kindredSemanticBaseTermsForEffect(parsed).filter((term) => !roleTerms.some((roleTerm) => termsAreRelated(term, roleTerm)));
}

function selectorPfxHookSiblingScore(targetParsed = {}, candidateParsed = {}, role = "") {
  if (!targetParsed.hero || normalizedTerm(targetParsed.hero) !== normalizedTerm(candidateParsed.hero)) return null;

  const roleTerms = selectorPfxHookSiblingRoleTerms(role);
  const targetBaseTerms = selectorPfxHookSiblingBaseTerms(targetParsed, role);
  const candidateTerms = kindredSemanticBaseTermsForEffect(candidateParsed);
  if (!roleTerms.length || !targetBaseTerms.length || !candidateTerms.length) return null;

  const roleMatchedTerms = candidateTerms.filter((term) => roleTerms.some((roleTerm) => termsAreRelated(term, roleTerm)));
  if (!roleMatchedTerms.length) return null;
  if (!targetBaseTerms.every((term) => termsContainRelatedTerm(candidateTerms, term))) return null;

  const candidateBaseTerms = candidateTerms.filter((term) => !roleTerms.some((roleTerm) => termsAreRelated(term, roleTerm)));
  const extraBaseTerms = candidateBaseTerms.filter((term) => !termsContainRelatedTerm(targetBaseTerms, term)).length;
  const score = targetBaseTerms.length * 3 + roleMatchedTerms.length * 2 - extraBaseTerms;
  return { score, extraBaseTerms };
}

function parseSelectorPfxHookToken(token, heroNameRows = [], preferredHeroes = []) {
  const parsed = parseEffectToken(token, heroNameRows);
  if (parsed.hero) return parsed;

  const key = String(token || "").replace(/^Effect_/, "");
  const heroes = uniq([...preferredHeroes, ...heroNameRows.filter((row) => row.kind === "Effect").map((row) => row.hero)])
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const matchedHero = heroes.find((hero) => key.toLowerCase().startsWith(`${hero.toLowerCase()}_`));
  if (matchedHero) {
    return {
      hero: matchedHero,
      effectName: key.slice(matchedHero.length + 1),
      matchKind: "selector-token-prefix-context",
    };
  }

  const parts = key.split("_").filter(Boolean);
  if (parts.length < 2) return parsed;
  return {
    hero: parts[0],
    effectName: parts.slice(1).join("_"),
    matchKind: "selector-token-prefix-fallback",
  };
}

function uniquePfxHookSelectorSiblingResourceMatches(token, row = {}, pfxHookEffectTokenIndex = new Map(), heroNameRows = []) {
  const role = selectorOutputRoleForRow(row);
  if (!role || role === "effect") return [];

  const parsed = parseSelectorPfxHookToken(token, heroNameRows, listValue(row.heroNames));
  if (!parsed.hero || !parsed.effectName) return [];

  const scored = [];
  for (const [hookToken, hookRows] of pfxHookEffectTokenIndex.entries()) {
    if (hookToken === token) continue;
    const candidateParsed = parseSelectorPfxHookToken(hookToken, heroNameRows, [parsed.hero]);
    const score = selectorPfxHookSiblingScore(parsed, candidateParsed, role);
    if (!score) continue;
    for (const hookRow of hookRows || []) {
      if (!hookRow.relativePath) continue;
      scored.push({
        row: hookRow,
        score: score.score,
        extraBaseTerms: score.extraBaseTerms,
      });
    }
  }

  if (!scored.length) return [];
  scored.sort((left, right) => right.score - left.score || left.extraBaseTerms - right.extraBaseTerms || left.row.relativePath.localeCompare(right.row.relativePath));
  const bestScore = scored[0].score;
  const bestExtraBaseTerms = scored[0].extraBaseTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraBaseTerms === bestExtraBaseTerms);
  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.row.relativePath)) byPath.set(entry.row.relativePath, entry.row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function shadergraphGroupPath(relativePath = "") {
  const match = String(relativePath).match(/^(.*)\.Surface\[\d+\]\.shadergraph$/i);
  return match ? match[1] : "";
}

function shadergraphGroupStem(relativePath = "") {
  const groupPath = shadergraphGroupPath(relativePath) || String(relativePath || "").replace(/\.shadergraph$/i, "");
  return path.basename(groupPath);
}

function shadergraphGroupSkinPrefix(stem, root, effectName) {
  const normalizedStem = normalizedTerm(stem);
  const normalizedRoot = normalizedTerm(root);
  const normalizedEffectName = normalizedTerm(effectName);
  if (!normalizedStem.startsWith(`${normalizedRoot}_`) || !normalizedStem.endsWith(`_${normalizedEffectName}`)) return "";
  return normalizedStem.slice(normalizedRoot.length + 1, -normalizedEffectName.length - 1);
}

function shadergraphGroupMatchesExactEffect(group, root, effectName) {
  if (!root || !effectName) return false;
  const stem = shadergraphGroupStem(group.groupPath);
  if (normalizedTerm(stem) === normalizedTerm(`${root}_${effectName}`)) return true;
  const skinPrefix = shadergraphGroupSkinPrefix(stem, root, effectName);
  return /^(def|default|s\d+(?:t\d+)?|t\d+|cny|hlwn|med|olym|mtl|crim|kirin|forest|cat|cyber|pos)$/i.test(skinPrefix);
}

function buildShadergraphGroupIndex(shadergraphRows = []) {
  const byRoot = new Map();
  const groups = new Map();
  for (const row of shadergraphRows || []) {
    if (row.status && row.status !== "FOUND") continue;
    const relativePath = row.relativePath || "";
    const groupPath = shadergraphGroupPath(relativePath);
    if (!groupPath) continue;
    const root = effectResourceRootFromPath(groupPath);
    if (!root) continue;
    const key = `${root}\t${groupPath}`;
    const group =
      groups.get(key) ||
      {
        root,
        groupPath,
        shadergraphPaths: [],
      };
    group.shadergraphPaths.push(relativePath);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.shadergraphPaths = uniq(group.shadergraphPaths);
    const rows = byRoot.get(group.root) || [];
    rows.push(group);
    byRoot.set(group.root, rows);
  }
  for (const rows of byRoot.values()) rows.sort((left, right) => left.groupPath.localeCompare(right.groupPath));
  return byRoot;
}

function exactShadergraphGroupMatches(parsed, alias, shadergraphGroupIndex = new Map()) {
  const roots = uniq([...(alias.resourceRoots || []), ...(alias.heroCodes || [])]);
  const effectName = parsed?.effectName || "";
  if (!roots.length || !effectName) return [];
  const matches = [];
  const seen = new Set();
  for (const root of roots) {
    for (const group of shadergraphGroupIndex.get(root) || []) {
      if (!shadergraphGroupMatchesExactEffect(group, root, effectName)) continue;
      if (seen.has(group.groupPath)) continue;
      seen.add(group.groupPath);
      matches.push(group);
    }
  }
  return matches.sort((left, right) => left.groupPath.localeCompare(right.groupPath));
}

function buildSkinEffectAliasSourceIndex(items = []) {
  const index = new Map();
  for (const item of items || []) {
    if (!item?.sourceEffectToken || !item?.skinEffectToken || !item?.modelLabel) continue;
    const rows = index.get(item.sourceEffectToken) || [];
    rows.push(item);
    index.set(item.sourceEffectToken, rows);
  }
  return index;
}

function skinKindFromModelLabel(modelLabel = "") {
  return /_DefaultSkin$/i.test(modelLabel) ? "default" : "skin";
}

function isNonRenderableSkinEffectToken(token = "") {
  return /^Effect_Nothing$/i.test(String(token || ""));
}

function isNonRenderableEffectResourcePath(resourcePath = "") {
  return /(?:^|\/)Nothing(?:\.assetbundle)?\/Nothing\.pfx$/i.test(String(resourcePath || ""));
}

function strongResourceMatchesForSkinEffectToken(skinEffectToken, effectRows = [], heroNameRows = [], definitionRows = []) {
  const exact = resourceMatchesForToken(skinEffectToken, effectRows);
  if (exact.matches.length && ["exact-basename", "compact-basename"].includes(exact.matchKind)) {
    return {
      matches: exact.matches,
      matchKind: exact.matchKind,
    };
  }

  if (!heroNameRows.length || !definitionRows.length) return { matches: [], matchKind: "" };
  const parsed = parseEffectToken(skinEffectToken, heroNameRows);
  const alias = matchHeroAliasResources(parsed, definitionRows, effectRows);
  if (!isDirectStrongAliasMatch(alias)) return { matches: [], matchKind: "" };
  return {
    matches: alias.matches || [],
    matchKind: alias.matchKind || "",
  };
}

function skinEffectAliasResourceMatches(
  token,
  effectRows = [],
  skinEffectAliasSourceIndex = new Map(),
  parsed = {},
  heroNameRows = [],
  definitionRows = [],
) {
  const aliases = skinEffectAliasSourceIndex.get(token) || [];
  if (!aliases.length) return [];

  const rows = [];
  const seen = new Set();
  for (const alias of aliases) {
    if (isNonRenderableSkinEffectToken(alias.skinEffectToken)) continue;
    const strong = strongResourceMatchesForSkinEffectToken(alias.skinEffectToken, effectRows, heroNameRows, definitionRows);
    if (!strong.matches.length) continue;
    for (const match of strong.matches) {
      if (isNonRenderableEffectResourcePath(match.relativePath)) continue;
      const key = [alias.modelLabel, alias.skinEffectToken, match.relativePath].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        alias,
        match,
        matchKind: strong.matchKind,
        resourceVariant: {
          resourcePath: match.relativePath,
          modelLabel: alias.modelLabel,
          skinKind: skinKindFromModelLabel(alias.modelLabel),
          heroLabel: parsed?.hero || "",
        },
      });
    }
  }
  return rows.sort(
    (left, right) =>
      left.alias.modelLabel.localeCompare(right.alias.modelLabel) ||
      left.alias.skinEffectToken.localeCompare(right.alias.skinEffectToken) ||
      left.match.relativePath.localeCompare(right.match.relativePath),
  );
}

function skinEffectAliasResourceVariantsForPaths(
  token,
  resourcePaths = [],
  effectRows = [],
  skinEffectAliasSourceIndex = new Map(),
  parsed = {},
  heroNameRows = [],
  definitionRows = [],
) {
  const pathSet = new Set(resourcePaths.filter(Boolean));
  if (!pathSet.size) return [];

  const variants = [];
  const seen = new Set();
  for (const entry of skinEffectAliasResourceMatches(token, effectRows, skinEffectAliasSourceIndex, parsed, heroNameRows, definitionRows)) {
    if (!pathSet.has(entry.match.relativePath)) continue;
    const variant = entry.resourceVariant;
    const key = [variant.resourcePath, variant.modelLabel, variant.skinKind, variant.heroLabel].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(variant);
  }
  return variants;
}

function resourceBasenameSegments(relativePath) {
  return effectBasename(relativePath)
    .split(/[^A-Za-z0-9]+/)
    .map(normalizedTerm)
    .filter(Boolean);
}

function effectTermParts(value) {
  return String(value || "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .map(normalizedTerm)
    .filter(Boolean);
}

function significantEffectTerms(value, ignoredTerms = []) {
  const ignored = new Set(ignoredTerms.map(normalizedTerm).filter(Boolean));
  return uniq(
    effectTermParts(value).filter((term) => {
      if (ignored.has(term)) return false;
      if (/^hero\d+$/i.test(term)) return false;
      if (/^(def|default|defaults|skin|s\d+(?:t\d+)?|t\d+|cny|hlwn|med|olym|mtl|crim|kirin|forest|cat|cyber|pos)$/i.test(term)) {
        return false;
      }
      return true;
    }),
  );
}

function semanticPhraseTerms(value) {
  const compact = compactTerm(value);
  const terms = [];
  if (compact.includes("damageovertime")) terms.push("damageovertime", "dot");
  if (compact.includes("cdr")) terms.push("cooldown");
  if (compact.includes("fireball")) terms.push("fireball", "projectile");
  if (compact.includes("firebreath")) terms.push("firebreath", "breath");
  return terms;
}

function effectTermKey(terms) {
  return uniq(terms).join("|");
}

function sideTermFromBoneToken(boneToken) {
  const side = sideFromBoneToken(boneToken);
  if (side === "right") return "r";
  if (side === "left") return "l";
  return "";
}

function reorderedEffectTermResourceMatches(parsed, alias, effectRows, row = {}) {
  const resourceRoots = alias.resourceRoots || [];
  if (!resourceRoots.length) return [];

  const tokenTerms = significantEffectTerms(parsed.effectName, [parsed.hero]);
  const sideTerm = sideTermFromBoneToken(row.boneToken);
  if (sideTerm && !tokenTerms.includes("l") && !tokenTerms.includes("r") && !tokenTerms.includes("left") && !tokenTerms.includes("right")) {
    tokenTerms.push(sideTerm);
  }
  if (tokenTerms.length < 3) return [];
  const tokenKey = effectTermKey(tokenTerms);

  return effectRows.filter((resourceRow) => {
    const resourceRoot = effectResourceRootFromPath(resourceRow.relativePath);
    if (!resourceRoots.includes(resourceRoot)) return false;
    const resourceTerms = significantEffectTerms(effectBasename(resourceRow.relativePath), [parsed.hero, resourceRoot]);
    return resourceTerms.length === tokenTerms.length && effectTermKey(resourceTerms) === tokenKey;
  });
}

function isDirectStrongAliasMatch(alias) {
  return (
    alias.evidenceStrength === "strong" &&
    [
      "hero-code-exact-basename",
      "hero-code-compact-basename",
      "hero-code-effect-name-alias-basename",
      "hero-code-drop-idle-basename",
    ].includes(alias.matchKind)
  );
}

function rowHasSelectorRuntimeFilter(row = {}) {
  return Boolean(selectorOutputRoleForRow(row) && (listValue(row.actionKeys).length || selectorStateTermsForRow(row).length));
}

function pathIdentifierResourceMatches(parsed, alias, effectRows, visualPathIndex) {
  const terms = [...(visualPathIndex.get(`Effect_${parsed.hero}_${parsed.effectName}`) || [])];
  if (!terms.length || !/PathIdentifier$/i.test(parsed.effectName)) return [];
  const heroCodes = alias.heroCodes || [];
  if (!heroCodes.length) return [];
  return effectRows.filter((row) => {
    const heroCode = heroCodeFromPath(row.relativePath);
    if (!heroCodes.includes(heroCode)) return false;
    const segments = resourceBasenameSegments(row.relativePath);
    if (!segments.includes("path")) return false;
    return terms.some((term) => segments.some((segment) => termsMatch(segment, term)));
  });
}

function sideFromBoneToken(boneToken) {
  const value = String(boneToken || "").toLowerCase();
  if (value.includes("right")) return "right";
  if (value.includes("left")) return "left";
  return "";
}

function sideAliases(side) {
  if (side === "right") return ["right", "r"];
  if (side === "left") return ["left", "l"];
  return [];
}

function sideBoneResourceMatches(parsed, alias, effectRows, row = {}) {
  const side = sideFromBoneToken(row.boneToken);
  if (!side) return [];
  const heroCodes = alias.heroCodes || [];
  if (!heroCodes.length) return [];
  const effectTerms = parsed.effectName
    .replace(/\d+$/i, "")
    .split("_")
    .map(normalizedTerm)
    .filter((term) => term.length >= 4 && !["left", "right"].includes(term));
  if (!effectTerms.length) return [];
  const sideTerms = sideAliases(side);

  return effectRows.filter((resourceRow) => {
    const heroCode = heroCodeFromPath(resourceRow.relativePath);
    if (!heroCodes.includes(heroCode)) return false;
    const segments = resourceBasenameSegments(resourceRow.relativePath);
    if (!sideTerms.some((sideTerm) => segments.includes(sideTerm))) return false;
    return effectTerms.some((term) => segments.some((segment) => termsMatch(segment, term)));
  });
}

function abilitySlotFromActionKey(actionKey) {
  const value = String(actionKey || "").toLowerCase();
  if (value === "attack") return "AA";
  if (value === "attack_alt") return "AA_Alt";
  if (value === "attack_crit") return "AA_Crit";
  if (value === "ability01" || value === "ability1") return "A";
  if (value === "ability02" || value === "ability2") return "B";
  if (value === "ability03" || value === "ability3") return "C";
  return "";
}

function actionKeysForRuntimeAbilityName(runtimeAbilityName) {
  const value = String(runtimeAbilityName || "");
  const keys = [];
  if (/Ability0?1|Ability__[^_]+__A(?:$|_)/i.test(value)) keys.push("ability01");
  if (/Ability0?2|Ability__[^_]+__B(?:$|_)/i.test(value)) keys.push("ability02");
  if (/Ability0?3|Ability__[^_]+__C(?:$|_)/i.test(value)) keys.push("ability03");
  if (/Ability0?4|Ability__[^_]+__D(?:$|_)/i.test(value)) keys.push("ability04");
  return uniq(keys);
}

function actionKeysForNativeNearbyToken(token) {
  const value = String(token || "");
  const keys = actionKeysForRuntimeAbilityName(value);
  if (/(?:^|[_-])ability[_-]?(?:0?1|a)(?:$|[_-])|AbilityA(?:$|_)/i.test(value)) keys.push("ability01");
  if (/(?:^|[_-])ability[_-]?(?:0?2|b)(?:$|[_-])|AbilityB(?:$|_)/i.test(value)) keys.push("ability02");
  if (/(?:^|[_-])ability[_-]?(?:0?3|c)(?:$|[_-])|AbilityC(?:$|_)/i.test(value)) keys.push("ability03");
  if (/(?:^|[_-])ability[_-]?(?:0?4|d)(?:$|[_-])|AbilityD(?:$|_)/i.test(value)) keys.push("ability04");
  return uniq(keys);
}

function rowWithAbilityContextActionKeys(row, primaryAbilityContext) {
  if (!primaryAbilityContext || primaryAbilityContext.contextConfidence !== "high") return row;
  const inferredActionKeys = actionKeysForRuntimeAbilityName(primaryAbilityContext.runtimeAbilityName);
  if (!inferredActionKeys.length) return row;
  const actionKeys = uniq([...listValue(row.actionKeys), ...inferredActionKeys]);
  return { ...row, actionKeys };
}

function rowWithNativeNearbyActionKeys(row = {}) {
  const nearbyTokens = [
    ...listValue(row.nativeNearbyAbilityNames || row.nearbyAbilityNames),
    ...listValue(row.nativeNearbySoundTokens || row.nearbySoundTokens),
  ];
  const actionKeys = uniq([...listValue(row.actionKeys), ...nearbyTokens.flatMap(actionKeysForNativeNearbyToken)]);
  if (!actionKeys.length || actionKeys.length === listValue(row.actionKeys).length) return row;
  return { ...row, actionKeys };
}

function rowWithResolvedResourceVariantActionKeys(row = {}, resolvedResources = {}) {
  const resourceVariants = Array.isArray(resolvedResources.resourceVariants) ? resolvedResources.resourceVariants : [];
  const signatures = new Set(resourceVariants.map((variant) => actionBackfillSignature(variant.actionKeys)).filter(Boolean));
  if (signatures.size !== 1) return row;
  const actionKeys = uniq([...listValue(row.actionKeys), ...[...signatures][0].split("|").filter(Boolean)]);
  if (!actionKeys.length || actionKeys.length === listValue(row.actionKeys).length) return row;
  return { ...row, actionKeys };
}

function actionKeysForResourceSlotText(value) {
  const text = String(value || "");
  const keys = [];
  if (/(?:^|[_/.-])(?:AA|DefaultAttack|BasicAttack|Basic_Attack|Attack0?1)(?:$|[_/.-])/i.test(text)) {
    keys.push("attack");
  }
  if (/(?:^|[_/.-])(?:A0?1|Ability0?1|AbilityA)(?:$|[_/.-])/i.test(text)) keys.push("ability01");
  if (/(?:^|[_/.-])(?:A0?2|Ability0?2|AbilityB)(?:$|[_/.-])/i.test(text)) keys.push("ability02");
  if (/(?:^|[_/.-])(?:A0?3|Ability0?3|AbilityC)(?:$|[_/.-])/i.test(text)) keys.push("ability03");
  if (/(?:^|[_/.-])(?:Ult|Ultimate)(?:$|[_/.-])/i.test(text)) keys.push("ability03");
  return uniq(keys);
}

function kindredSlotRuntimeActionKeys(slot = {}) {
  const explicit = listValue(slot.actionKeys);
  if (explicit.length) return explicit;
  return uniq([
    ...actionKeysForResourceSlotText(slot.resourceStem),
    ...actionKeysForResourceSlotText(slot.resourcePath),
  ]);
}

function isEffectPfxResourcePath(resourcePath) {
  const value = String(resourcePath || "");
  return /(?:^|\/)Effects\//.test(value) && /\.pfx$/i.test(value);
}

function rowWithResolvedResourcePathActionKeys(row = {}, resolvedResources = {}) {
  if (listValue(row.actionKeys).length) return row;
  const resourcePaths = listValue(resolvedResources.resourcePaths).filter(isEffectPfxResourcePath);
  if (!resourcePaths.length) return row;
  const signatures = new Set(
    [row.effectToken, ...resourcePaths].flatMap(actionKeysForResourceSlotText).map((key) => actionBackfillSignature([key])),
  );
  if (signatures.size !== 1) return row;
  const actionKeys = [...signatures][0].split("|").filter(Boolean);
  return actionKeys.length ? { ...row, actionKeys } : row;
}

function actionAliasPrefixes(actionKey) {
  const key = String(actionKey || "").toLowerCase();
  const slot = abilitySlotFromActionKey(key);
  if (!slot) return [];
  if (slot === "AA") return ["AA", "DefaultAttack", "BasicAttack"];
  if (slot === "AA_Alt") return ["AA_Alt", "AltAttack"];
  if (slot === "AA_Crit") return ["AA_Crit", "CritAttack"];
  const abilityNumber = { A: "01", B: "02", C: "03" }[slot] || "";
  return abilityNumber ? [slot, `Ability${abilityNumber}`, `Ability${Number(abilityNumber)}`] : [slot];
}

function effectActionSuffixes(effectName) {
  const value = String(effectName || "");
  const suffixes = new Set();
  const prefixPatterns = [
    /^DefaultAttack_(.+)$/i,
    /^BasicAttack_(.+)$/i,
    /^CritAttack_(.+)$/i,
    /^Ability0?1_(.+)$/i,
    /^Ability0?2_(.+)$/i,
    /^Ability0?3_(.+)$/i,
    /^A_(.+)$/i,
    /^B_(.+)$/i,
    /^C_(.+)$/i,
  ];
  for (const pattern of prefixPatterns) {
    const match = value.match(pattern);
    if (match?.[1]) suffixes.add(match[1]);
  }
  if (/Projectile/i.test(value)) suffixes.add("Projectile");
  if (/Bullet|Missile/i.test(value)) {
    suffixes.add("Shot");
    suffixes.add("Projectile");
    suffixes.add("Proj");
  }
  if (/Shot/i.test(value)) suffixes.add("Shot");
  if (/Impact/i.test(value)) suffixes.add("Impact");
  if (/Hit/i.test(value)) suffixes.add("Hit");
  if (/Explosion/i.test(value)) suffixes.add("Explosion");
  if (/Beam/i.test(value)) suffixes.add("Beam");
  if (/Attack/i.test(value)) suffixes.add("Attack");
  if (/^(DefaultAttack|BasicAttack|Attack)$/i.test(value)) suffixes.add("Shot");
  return [...suffixes].filter((suffix) => suffix.length >= 3);
}

function nativeActionEffectAliasVariants(effectName, row = {}) {
  const prefixes = uniq(listValue(row.actionKeys).flatMap(actionAliasPrefixes));
  if (!prefixes.length) return [];
  const lowerName = normalizedTerm(effectName);
  const variants = [];
  for (const prefix of prefixes) {
    for (const suffix of effectActionSuffixes(effectName)) variants.push(`${prefix}_${suffix}`);
    if (lowerName.includes("projectile")) {
      variants.push(`${prefix}_Projectile`, `${prefix}_Shot`);
    }
    if (lowerName.includes("impact")) {
      variants.push(`${prefix}_Impact`, `${prefix}_Hit`, `${prefix}_Explosion`);
    }
    if (lowerName.includes("beam")) variants.push(`${prefix}_Beam`);
  }
  return uniq(variants);
}

function resourceActionPrefixSegments(basename, heroCode, variant) {
  const normalizedBasename = normalizedTerm(basename);
  const normalizedHero = normalizedTerm(heroCode);
  const normalizedVariant = normalizedTerm(variant);
  if (!normalizedBasename.endsWith(`_${normalizedVariant}`)) return [];
  let prefix = normalizedBasename.slice(0, -normalizedVariant.length - 1);
  if (prefix === normalizedHero) return [];
  if (prefix.startsWith(`${normalizedHero}_`)) prefix = prefix.slice(normalizedHero.length + 1);
  return prefix.split("_").filter(Boolean);
}

function resourceActionPrefixSegmentAllowed(segment, effectName) {
  const normalized = normalizedTerm(segment);
  if (!normalized) return true;
  if (normalizedTerm(effectName).split("_").includes(normalized)) return true;
  return /^(def|default|defaults|s\d+(?:t\d+)?|t\d+|cny|hlwn|med|olym|mtl|crim|kirin|forest|cat|cyber|pos|skin)$/i.test(
    normalized,
  );
}

function resourceActionSuffixMatches(effectName, resourceRow, heroCode, variant) {
  const basename = effectBasename(resourceRow.relativePath);
  if (!normalizedTerm(basename).endsWith(`_${normalizedTerm(variant)}`)) return false;
  const prefixSegments = resourceActionPrefixSegments(basename, heroCode, variant);
  return prefixSegments.every((segment) => resourceActionPrefixSegmentAllowed(segment, effectName));
}

function nativeActionEffectAliasResourceMatches(parsed, alias, effectRows, row = {}) {
  const variants = nativeActionEffectAliasVariants(parsed.effectName, row);
  const heroCodes = alias.heroCodes || [];
  if (!variants.length || !heroCodes.length) return [];

  for (const variant of variants) {
    let matches = effectRows.filter((resourceRow) => {
      const heroCode = heroCodeFromPath(resourceRow.relativePath);
      if (!heroCodes.includes(heroCode)) return false;
      const basename = normalizedTerm(effectBasename(resourceRow.relativePath));
      return heroCodes.some((code) => basename === normalizedTerm(`${code}_${variant}`));
    });
    if (matches.length) return matches;

    matches = effectRows.filter((resourceRow) => {
      const heroCode = heroCodeFromPath(resourceRow.relativePath);
      if (!heroCodes.includes(heroCode)) return false;
      return resourceActionSuffixMatches(parsed.effectName, resourceRow, heroCode, variant);
    });
    if (matches.length) return matches;
  }

  return [];
}

function kindredSlotResourceRoot(slot) {
  return slot?.resourceRoot || effectResourceRootFromPath(slot?.resourcePath || "");
}

function kindredResourceVariant(slot) {
  const variant = {
    resourcePath: slot.resourcePath,
    modelLabel: slot.modelLabel || "",
    skinKind: slot.skinKind || "",
    heroLabel: slot.heroLabel || "",
  };
  const actionKeys = listValue(slot.actionKeys);
  if (actionKeys.length) Object.defineProperty(variant, "actionKeys", { value: actionKeys, enumerable: false });
  return variant;
}

function kindredSlotActionSignature(slot) {
  return listValue(slot?.actionKeys).join("|");
}

function semanticAliasTerms(term) {
  const value = compactTerm(term);
  const numericSuffix = value.match(/^([a-z]+)(\d+)$/);
  if (numericSuffix) {
    const [, prefix, number] = numericSuffix;
    if (prefix === "lvl" || prefix === "level") return [`level${number}`, `lvl${number}`, `mark${number}`];
    if (prefix === "mark") return [`lvl${number}`, `level${number}`];
  }
  const aliases = {
    projectile: ["shot", "shots", "proj", "missile", "bullet", "arrow", "arrows"],
    proj: ["projectile", "shot", "shots", "arrow", "arrows"],
    shot: ["projectile", "shots", "proj", "arrow", "arrows"],
    shots: ["projectile", "shot", "proj", "arrow", "arrows"],
    missile: ["projectile", "shot", "shots", "arrow", "arrows"],
    bullet: ["projectile", "shot", "shots", "arrow", "arrows"],
    arrow: ["projectile", "shot", "shots", "proj"],
    arrows: ["projectile", "shot", "shots", "proj"],
    fireball: ["projectile", "shot", "proj"],
    impact: ["hit", "explosion", "land", "landing", "landed"],
    hit: ["impact", "land", "landing", "landed"],
    explosion: ["impact", "hit", "burst", "land", "landing", "landed"],
    burst: ["explosion", "impact", "hit"],
    land: ["landing", "landed", "impact", "hit", "explosion"],
    landing: ["land", "landed", "impact", "hit", "explosion"],
    landed: ["land", "landing", "impact", "hit", "explosion"],
    empowered: ["emp", "power"],
    emp: ["empowered", "power"],
    power: ["empowered", "emp"],
    damageovertime: ["dot"],
    dot: ["damageovertime"],
    channel: ["channeling", "cast", "charge", "charging"],
    channeling: ["channel", "cast", "charge", "charging"],
    cast: ["channel", "channeling", "charge", "charging"],
    charge: ["charging", "channel", "channeling", "cast"],
    charging: ["charge", "channel", "channeling", "cast"],
    dash: ["flash"],
    flash: ["dash"],
    destination: ["end"],
    end: ["destination"],
    beam: ["tether", "chain"],
    tether: ["beam", "chain"],
    chain: ["tether", "beam"],
    mf: ["muzzleflash", "muzzleflare", "muzzle", "flash", "flare"],
    muzzleflash: ["mf", "muzzleflare", "muzzle", "flash", "flare"],
    muzzleflare: ["mf", "muzzleflash", "muzzle", "flash", "flare"],
    radius: ["warning", "indicator", "target"],
    indicator: ["warning", "radius", "target"],
    target: ["warning", "indicator", "radius"],
    warning: ["target", "indicator", "radius"],
    spawn: ["respawn"],
    respawn: ["spawn"],
    restore: ["refund"],
    refund: ["restore"],
    cdr: ["cooldown"],
    cooldown: ["cdr"],
    suppressing: ["supressing"],
    supressing: ["suppressing"],
    stack: ["stacked", "stacks"],
    stacked: ["stack", "stacks"],
    stacks: ["stack", "stacked"],
    l: ["left", "fl", "wl"],
    left: ["l", "fl", "wl"],
    fl: ["left", "l"],
    wl: ["left", "l"],
    r: ["right", "fr", "wr"],
    right: ["r", "fr", "wr"],
    fr: ["right", "r"],
    wr: ["right", "r"],
  };
  return aliases[value] || [];
}

function sideIntentFromTerms(terms = []) {
  const expanded = expandedSemanticTerms(terms);
  const hasLeft = ["left", "l", "fl", "wl"].some((term) => expanded.has(term));
  const hasRight = ["right", "r", "fr", "wr"].some((term) => expanded.has(term));
  if (hasLeft === hasRight) return "";
  return hasLeft ? "left" : "right";
}

function keepKindredSemanticBaseTerm(term) {
  return term.length > 1 || term === "l" || term === "r";
}

function kindredSemanticBaseTermsForEffect(parsed) {
  return uniq([...significantEffectTerms(parsed.effectName, [parsed.hero]), ...semanticPhraseTerms(parsed.effectName)]).filter(
    keepKindredSemanticBaseTerm,
  );
}

function kindredSemanticBaseTermsForSlot(slot, parsed) {
  return uniq([
    ...significantEffectTerms(slot.resourceStem || slot.resourcePath, [parsed.hero, kindredSlotResourceRoot(slot)]),
    ...semanticPhraseTerms(slot.resourceStem || slot.resourcePath),
  ]).filter(keepKindredSemanticBaseTerm);
}

function expandedSemanticTerms(terms) {
  return new Set([...terms, ...terms.flatMap(semanticAliasTerms)].map(normalizedTerm).filter(Boolean));
}

function mapMode5v5ResourceMatches(token, effectRows = []) {
  const match = String(token || "").match(/^Effect_(.+)_5v5$/i);
  if (!match) return [];

  const parts = effectTermParts(match[1]).filter((term) => term !== "5v5");
  const entity = parts[0] || "";
  const tokenTerms = uniq([...parts.slice(1), ...semanticPhraseTerms(match[1])]).filter(Boolean);
  if (!entity || !tokenTerms.length) return [];

  const tokenExpanded = expandedSemanticTerms(tokenTerms);
  const candidates = [];
  const prefix = `effects/5v5/${entity}/`;
  for (const resourceRow of effectRows || []) {
    const relativePath = String(resourceRow.relativePath || "");
    if (!relativePath.toLowerCase().startsWith(prefix)) continue;
    const basename = effectBasename(relativePath);
    const resourceTerms = uniq([...significantEffectTerms(basename, [entity, "5v5"]), ...semanticPhraseTerms(basename)]);
    const resourceExpanded = expandedSemanticTerms(resourceTerms);
    if (![...tokenTerms].every((term) => resourceExpanded.has(term) || semanticAliasTerms(term).some((alias) => resourceExpanded.has(alias)))) {
      continue;
    }
    const extraTerms = resourceTerms.filter(
      (term) => !tokenExpanded.has(term) && !semanticAliasTerms(term).some((alias) => tokenExpanded.has(alias)),
    ).length;
    candidates.push({ row: resourceRow, extraTerms });
  }

  if (!candidates.length) return [];
  const bestExtraTerms = Math.min(...candidates.map((candidate) => candidate.extraTerms));
  const best = candidates.filter((candidate) => candidate.extraTerms === bestExtraTerms).map((candidate) => candidate.row);
  const byPath = new Map();
  for (const row of best) {
    if (!byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function defaultAttack1ImpactResourceMatches(token, effectRows = [], row = {}) {
  const role = selectorOutputRoleForRow(row);
  if (role === "projectile") return [];

  const match = String(token || "").match(/^Effect_(.+?)(?:_5v5)?$/i);
  if (!match) return [];
  const tokenParts = effectTermParts(match[1]);
  if (tokenParts.includes("projectile") || tokenParts.includes("proj")) return [];
  if (!tokenParts.includes("attack") || !tokenParts.includes("impact")) return [];
  if (tokenParts.some((term) => /^attack\d+$/i.test(term))) return [];

  const tokenKey = compactTerm(match[1].replace(/_5v5$/i, ""));
  const byPath = new Map();
  for (const resourceRow of effectRows || []) {
    const basename = effectBasename(resourceRow.relativePath);
    const resourceKey = compactTerm(basename).replace(/attack1/g, "attack");
    if (resourceKey !== tokenKey) continue;
    if (!byPath.has(resourceRow.relativePath)) byPath.set(resourceRow.relativePath, resourceRow);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeActionAaResourceMatches(token, effectRows = [], row = {}) {
  const actions = listValue(row.actionKeys).map((action) => String(action).toLowerCase());
  if (!actions.some((action) => action === "attack" || action === "attack_alt" || action === "attack_crit")) return [];

  const match = String(token || "").match(/^Effect_([^_]+)_(.+)$/i);
  if (!match) return [];
  const [, entity, effectName] = match;
  const terms = effectTermParts(effectName);
  if (!terms.length) return [];

  const allowedTerms = new Set(["aa", "attack", "basic", "default", "cleave", "alt", "crit"]);
  if (!terms.every((term) => allowedTerms.has(term) || /^alt\d+$/i.test(term))) return [];
  if (!terms.some((term) => ["aa", "attack", "basic", "default", "cleave"].includes(term))) return [];

  let slot = "AA";
  if (actions.includes("attack_alt") || terms.some((term) => term === "alt" || /^alt\d+$/i.test(term))) slot = "AA_Alt";
  if (actions.includes("attack_crit") && !actions.includes("attack") && !actions.includes("attack_alt")) slot = "AA_Crit";

  const entityKey = compactTerm(entity);
  const expectedKey = compactTerm(`${entity}_${slot}`);
  const byPath = new Map();
  for (const resourceRow of effectRows || []) {
    const basename = effectBasename(resourceRow.relativePath);
    if (compactTerm(basename) !== expectedKey) continue;
    if (!compactTerm(effectResourceRootFromPath(resourceRow.relativePath)).startsWith(entityKey)) continue;
    if (!byPath.has(resourceRow.relativePath)) byPath.set(resourceRow.relativePath, resourceRow);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeMinionSpawnResourceCandidatePaths(token, row = {}) {
  if (row.sourceKind && row.sourceKind !== "native-effect-spawn") return [];
  const value = String(token || "");
  if (/^Effect_JMinionHeal_Attack_FirstHit$/i.test(value)) {
    return ["Effects/Minions/Heal/JMinion_Heal_Attack.assetbundle/JMinion_Heal_Attack.pfx"];
  }
  if (/^Effect_JMinionHeal_Attack_SecondHit$/i.test(value)) {
    return ["Effects/Minions/Heal/JMinion_Heal_Attack2.assetbundle/JMinion_Heal_Attack2.pfx"];
  }
  if (/^Effect_JMinionHeal_Attack_Alt2$/i.test(value)) {
    return ["Effects/Minions/Heal/JMinion_Heal_Attack_Alt.assetbundle/JMinion_Heal_Attack_Alt.pfx"];
  }
  if (/^Effect_MinionSpawn_L$/i.test(value)) {
    return ["Effects/Common/Spawn/Spawn_L.assetbundle/Spawn_L.pfx"];
  }
  return [];
}

function uniqueNativeMinionSpawnResourceMatches(token, effectRows = [], row = {}) {
  const candidatePaths = nativeMinionSpawnResourceCandidatePaths(token, row);
  if (!candidatePaths.length) return [];

  const resourceIndex = resourceRowsByRelativePath(effectRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(effectRows);
  const byPath = new Map();
  for (const candidatePath of candidatePaths) {
    const resourceRow = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
    if (resourceRow && !byPath.has(resourceRow.relativePath)) byPath.set(resourceRow.relativePath, resourceRow);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeStatusEffectResourceCandidatePaths(token, row = {}) {
  const sourceKind = String(row.sourceKind || "");
  if (sourceKind && !["native-effect-vcall", "native-visual-binding"].includes(sourceKind)) return [];

  const value = String(token || "");
  if (/^Effect_ItemSilence$/i.test(value)) {
    return ["Effects/Status/Status_Silence.assetbundle/Status_Silence.pfx"];
  }
  if (/^Effect_Stunned_buff$/i.test(value)) {
    return ["Effects/Status/Status_Stun.assetbundle/Status_Stun.pfx"];
  }
  return [];
}

function uniqueNativeStatusEffectResourceMatches(token, effectRows = [], row = {}) {
  const candidatePaths = nativeStatusEffectResourceCandidatePaths(token, row);
  if (!candidatePaths.length) return [];

  const resourceIndex = resourceRowsByRelativePath(effectRows);
  const lowercaseResourceIndex = resourceRowsByLowercaseRelativePath(effectRows);
  const byPath = new Map();
  for (const candidatePath of candidatePaths) {
    const resourceRow = resourceRowForCandidatePath(candidatePath, resourceIndex, lowercaseResourceIndex);
    if (resourceRow && !byPath.has(resourceRow.relativePath)) byPath.set(resourceRow.relativePath, resourceRow);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeActionAaSlotSignature(effectName = "", row = {}) {
  const actions = listValue(row.actionKeys).map((action) => String(action).toLowerCase());
  if (!actions.some((action) => action === "attack" || action === "attack_alt" || action === "attack_crit")) return "";

  const terms = effectTermParts(effectName);
  if (!terms.length) return "";

  const allowedTerms = new Set(["aa", "attack", "basic", "default", "cleave", "hit", "impact", "alt", "crit", "emp", "empowered"]);
  if (!terms.every((term) => allowedTerms.has(term) || /^alt\d+$/i.test(term))) return "";
  if (!terms.some((term) => ["aa", "attack", "basic", "default", "cleave"].includes(term))) return "";

  if (terms.includes("crit") || actions.includes("attack_crit")) return "aa_crit";
  if (actions.includes("attack_alt") || terms.some((term) => term === "alt" || /^alt\d+$/i.test(term))) return "aa_alt";
  if (terms.some((term) => term === "emp" || term === "empowered")) return "aa_emp";
  return "aa";
}

function kindredAaSlotSignature(slot = {}, parsed = {}) {
  const variantTerms = new Set([
    "def",
    "default",
    "defaults",
    "skin",
    "s1",
    "s2",
    "s3",
    "s4",
    "t1",
    "t2",
    "t3",
    "cny",
    "hlwn",
    "med",
    "olym",
    "mtl",
    "crim",
    "kirin",
    "forest",
    "cat",
    "cyber",
    "pos",
    "ice",
    "sum",
    "glad",
    "spec",
    "prm",
    "rse",
    "skn",
    "lgnd",
    "drgn",
    "tz",
  ]);
  const ignored = new Set([
    ...effectTermParts(slot.heroLabel || ""),
    ...effectTermParts(parsed.hero || ""),
    ...effectTermParts(kindredSlotResourceRoot(slot)),
  ]);
  const terms = effectTermParts(slot.resourceStem || effectBasename(slot.resourcePath || "")).filter((term) => {
    if (ignored.has(term)) return false;
    if (/^hero\d+$/i.test(term)) return false;
    if (/^s\d+(?:t\d+)?$/i.test(term)) return false;
    if (/^t\d+$/i.test(term)) return false;
    return !variantTerms.has(term);
  });
  if (!terms.includes("aa")) return "";
  if (terms.some((term) => term === "crit")) return "aa_crit";
  if (terms.some((term) => term === "alt" || /^alt\d+$/i.test(term))) return "aa_alt";
  if (terms.some((term) => term === "emp" || term === "empowered")) return "aa_emp";
  return terms.length === 1 ? "aa" : "";
}

function kindredNativeActionAaResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const slotSignature = nativeActionAaSlotSignature(parsed?.effectName, row);
  if (selectorOutputRoleForRow(row)) return [];
  if (!hero || !slotSignature || !kindredSlots.length) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(row.actionKeys, slot.actionKeys)) return false;
    if (!["effect", "impact"].includes(String(slot.role || "effect").toLowerCase())) return false;
    if (kindredAaSlotSignature(slot, parsed) !== slotSignature) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  return bestUniqueBareActionSlotsByModel(matches.map((slot) => ({ slot })));
}

function entityBasenameSemanticResourceMatches(parsed, effectRows = []) {
  const entity = parsed?.hero || "";
  if (!entity) return [];

  const entityCompact = compactTerm(entity);
  const entityTerms = significantEffectTerms(entity);
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const tokenExpanded = expandedSemanticTerms(tokenTerms);
  if (!entityCompact || !tokenExpanded.size) return [];

  const matches = effectRows.filter((resourceRow) => {
    const basename = effectBasename(resourceRow.relativePath);
    const compactBasename = compactTerm(basename);
    if (!compactBasename.startsWith(entityCompact)) return false;

    const resourceTerms = uniq([
      ...significantEffectTerms(basename, [entity, ...entityTerms]),
      ...semanticPhraseTerms(basename),
    ]);
    const resourceExpanded = expandedSemanticTerms(resourceTerms);
    return [...resourceExpanded].some((term) => tokenExpanded.has(term));
  });

  const uniquePaths = new Set(matches.map((match) => match.relativePath));
  return uniquePaths.size === 1 ? matches : [];
}

function effectResourcePathTerms(relativePath = "", parsed = {}) {
  const ignoredTerms = [
    parsed.hero,
    "effect",
    "effects",
    "item",
    "items",
    "common",
    "status",
    "assetbundle",
    "pfx",
    "5v5",
    "3v3",
  ];
  const normalizedPath = String(relativePath || "")
    .replace(/\.assetbundle/gi, "_assetbundle")
    .replace(/\.pfx$/i, "");
  return uniq([...significantEffectTerms(normalizedPath, ignoredTerms), ...semanticPhraseTerms(normalizedPath)]).filter((term) => term.length > 1);
}

function termsAreRelated(left, right) {
  if (termsMatch(left, right)) return true;
  return (
    semanticAliasTerms(left).some((alias) => termsMatch(alias, right)) ||
    semanticAliasTerms(right).some((alias) => termsMatch(left, alias))
  );
}

function termsContainRelatedTerm(terms = [], term = "") {
  return terms.some((candidate) => termsAreRelated(candidate, term));
}

function resourceRoleFromTerms(terms = []) {
  const expanded = expandedSemanticTerms(terms);
  if (["projectile", "proj", "shot", "shots", "missile", "bullet", "arrow", "arrows", "fireball"].some((term) => expanded.has(term))) {
    return "projectile";
  }
  if (["impact", "hit", "explosion", "burst"].some((term) => expanded.has(term))) return "impact";
  if (["cast", "channel", "channeling", "charge", "charging"].some((term) => expanded.has(term))) return "cast";
  if (["idle", "loop", "aura", "ring", "warning", "indicator", "target", "timer", "glow", "buff"].some((term) => expanded.has(term))) {
    return "persistent";
  }
  return "effect";
}

function scopedSelectorRoleMatchesResource(row = {}, resourceRole = "") {
  const role = selectorOutputRoleForRow(row);
  if (!role) return true;
  if (role === "effect") return resourceRole === "effect";
  return role === resourceRole;
}

function resourcePathMatchesSelectorOutputRole(parsed = {}, row = {}, relativePath = "") {
  const role = selectorOutputRoleForRow(row);
  if (!role || role === "effect") return false;

  const terms = expandedSemanticTerms(effectResourcePathTerms(relativePath, parsed));
  const hasProjectile = ["projectile", "proj", "shot", "shots", "missile", "bullet", "arrow", "arrows", "fireball"].some((term) => terms.has(term));
  const hasImpact = ["impact", "hit", "explosion", "burst", "land", "landing", "landed"].some((term) => terms.has(term));
  const hasCast = ["cast", "channel", "channeling", "charge", "charging"].some((term) => terms.has(term));
  const hasPersistent = ["idle", "loop", "aura", "ring", "warning", "indicator", "target", "timer", "glow", "buff"].some((term) => terms.has(term));

  if (role === "impact") return hasImpact;
  if (role === "projectile") return hasProjectile && !hasImpact;
  if (role === "cast") return hasCast;
  if (role === "persistent") return hasPersistent;
  return false;
}

function selectorRoleSingleResourceMatches(parsed = {}, alias = {}, row = {}) {
  if (alias.evidenceStrength !== "weak" || alias.matches.length !== 1) return [];
  if (!selectorOutputRoleForRow(row)) return [];

  const [match] = alias.matches;
  if (!resourcePathMatchesSelectorOutputRole(parsed, row, match.relativePath)) return [];
  return [match];
}

function scopedEntityResourcePathMatches(parsed = {}, aliasMetadata = {}, relativePath = "") {
  const entity = parsed.hero || "";
  const entityCompact = compactTerm(entity);
  const pathValue = String(relativePath || "");
  const pathCompact = compactTerm(pathValue);
  if (!entityCompact || !pathCompact) return false;
  if (/^Effects\/Items\//i.test(pathValue) && entityCompact === "item") return true;
  if (pathCompact.includes(entityCompact)) return true;

  return listValue(aliasMetadata.resourceRoots).some((root) => {
    const rootCompact = compactTerm(root);
    if (!rootCompact) return false;
    return pathCompact.includes(rootCompact) || (entityCompact.length >= 4 && rootCompact.startsWith(entityCompact) && pathCompact.includes(entityCompact));
  });
}

function scopedEntitySemanticResourceMatches(parsed, aliasMetadata = {}, effectRows = [], row = {}) {
  if (!parsed?.hero || aliasMetadata.heroCodes?.length) return [];
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  if (!tokenTerms.length) return [];

  const scored = effectRows
    .filter((resourceRow) => scopedEntityResourcePathMatches(parsed, aliasMetadata, resourceRow.relativePath))
    .map((resourceRow) => {
      const resourceTerms = effectResourcePathTerms(resourceRow.relativePath, parsed);
      const resourceRole = resourceRoleFromTerms(resourceTerms);
      const matchedTerms = tokenTerms.filter((term) => termsContainRelatedTerm(resourceTerms, term));
      const extraTerms = resourceTerms.filter((term) => !termsContainRelatedTerm(tokenTerms, term)).length;
      const basename = effectBasename(resourceRow.relativePath);
      const compactBasename = compactTerm(basename);
      const compactToken = compactTerm([parsed.hero, parsed.effectName].filter(Boolean).join("_"));
      const score =
        matchedTerms.length * 2 +
        (selectorOutputRoleForRow(row) && scopedSelectorRoleMatchesResource(row, resourceRole) ? 3 : 0) +
        (compactToken && compactBasename.includes(compactTerm(parsed.effectName)) ? 1 : 0);
      return {
        resourceRow,
        resourceRole,
        matchedTerms,
        extraTerms,
        score,
      };
    })
    .filter((entry) => {
      if (entry.matchedTerms.length !== tokenTerms.length) return false;
      return scopedSelectorRoleMatchesResource(row, entry.resourceRole);
    });

  if (!scored.length) return [];
  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.resourceRow.relativePath.localeCompare(right.resourceRow.relativePath));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);
  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.resourceRow.relativePath)) byPath.set(entry.resourceRow.relativePath, entry.resourceRow);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function nativeBuffSemanticTerms(row = {}, parsed = {}) {
  const hero = normalizedTerm(parsed?.hero || "");
  if (!hero) return [];

  const terms = [];
  for (const token of listValue(row.buffTokens)) {
    const parts = effectTermParts(String(token || "").replace(/^Buff_/, ""));
    if (!parts.length || parts[0] !== hero) continue;
    terms.push(
      ...parts.slice(1).filter((term) => {
        if (/^(buff|pfx|fx|effect|effects|control|controller|behavior|behaviors|passive)$/i.test(term)) return false;
        return term.length > 1;
      }),
    );
  }
  return uniq(terms);
}

function nativeBuffSemanticPfxResourceMatches(parsed, alias, pfxResourceRows = [], effectRowByPath = new Map(), row = {}, heroNameRows = []) {
  const hero = parsed?.hero || "";
  const buffTerms = nativeBuffSemanticTerms(row, parsed);
  if (!hero || !buffTerms.length || !pfxResourceRows.length || !effectRowByPath.size) return [];

  const roots = new Set([...(alias.heroCodes || []), ...(alias.resourceRoots || [])].map(normalizedTerm).filter(Boolean));
  const boneSide = sideFromBoneToken(row.boneToken);
  const scored = [];
  for (const pfxRow of pfxResourceRows) {
    const resourcePath = pfxRow.relativePath || "";
    const effectRow = effectRowByPath.get(resourcePath);
    if (!effectRow) continue;
    const resourceRoot = effectResourceRootFromPath(resourcePath);
    if (roots.size && !roots.has(normalizedTerm(resourceRoot))) continue;
    const resourceTerms = effectResourcePathTerms(resourcePath, parsed);
    if (!buffTerms.every((term) => termsContainRelatedTerm(resourceTerms, term))) continue;

    for (const hookToken of splitList(pfxRow.hookEffectTokens)) {
      const hookParsed = parseEffectToken(hookToken, heroNameRows);
      if (normalizedTerm(hookParsed.hero) !== normalizedTerm(hero)) continue;
      const hookTerms = kindredSemanticBaseTermsForEffect(hookParsed);
      if (!buffTerms.every((term) => termsContainRelatedTerm(hookTerms, term))) continue;

      const hookSide = sideIntentFromTerms(hookTerms);
      if (boneSide && hookSide && hookSide !== boneSide) continue;
      const extraTerms = hookTerms.filter((term) => {
        if (termsContainRelatedTerm(buffTerms, term)) return false;
        if (hookSide && sideIntentTerm(term) === hookSide) return false;
        return true;
      }).length;
      scored.push({
        row: effectRow,
        score: buffTerms.length * 2 + (boneSide && hookSide === boneSide ? 2 : 0),
        extraTerms,
      });
    }
  }

  if (!scored.length) return [];
  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.row.relativePath.localeCompare(right.row.relativePath));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const byPath = new Map();
  for (const entry of scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms)) {
    if (!byPath.has(entry.row.relativePath)) byPath.set(entry.row.relativePath, entry.row);
  }
  return [...byPath.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function semanticRoleScore(tokenTerms, slot) {
  const terms = new Set(tokenTerms.map(compactTerm));
  const role = String(slot.role || "").toLowerCase();
  if (role === "impact" && (terms.has("impact") || terms.has("hit") || terms.has("explosion") || terms.has("land") || terms.has("landing") || terms.has("landed"))) return 1;
  if (
    role === "projectile" &&
    (terms.has("projectile") || terms.has("proj") || terms.has("shot") || terms.has("shots") || terms.has("bullet") || terms.has("arrow") || terms.has("arrows"))
  )
    return 1;
  if (role === "cast" && (terms.has("cast") || terms.has("channel") || terms.has("channeling") || terms.has("charge") || terms.has("charging"))) return 1;
  if (role === "persistent" && (terms.has("warning") || terms.has("indicator") || terms.has("radius") || terms.has("target"))) return 1;
  return 0;
}

function semanticRoleHintsForEffect(parsed) {
  const terms = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  const hints = new Set();
  if (["projectile", "proj", "shot", "shots", "missile", "bullet", "arrow", "arrows"].some((term) => terms.has(term))) hints.add("projectile");
  if (["impact", "hit", "explosion", "land", "landing", "landed"].some((term) => terms.has(term))) hints.add("impact");
  if (["cast", "channel", "channeling", "charge", "charging"].some((term) => terms.has(term))) hints.add("cast");
  if (["warning", "indicator", "radius", "target"].some((term) => terms.has(term))) hints.add("persistent");
  return hints;
}

function kindredUniqueActionSlotMatchesRoleIntent(parsed, slot) {
  const hints = semanticRoleHintsForEffect(parsed);
  const role = String(slot.role || "").toLowerCase();
  if (hints.has("projectile") && role !== "projectile") return false;
  return true;
}

function hasExplicitActionOverlap(rowActionKeys = [], slotActionKeys = []) {
  if (!listValue(rowActionKeys).length || !listValue(slotActionKeys).length) return 0;
  return actionKeysOverlap(rowActionKeys, slotActionKeys);
}

function kindredSemanticScore(parsed, slot, row = {}) {
  const slotActionKeys = kindredSlotRuntimeActionKeys(slot);
  if (!actionKeysOverlap(row.actionKeys, slotActionKeys)) return 0;

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const tokenSide = sideIntentFromTerms(tokenTerms) || sideFromBoneToken(row.boneToken);
  const slotSide = sideIntentFromTerms(slotTerms);
  if (tokenSide && slotSide && tokenSide !== slotSide) return 0;

  const slotBase = new Set(slotTerms);
  const slotExpanded = expandedSemanticTerms(slotTerms);
  let score = listValue(row.actionKeys).length || slotActionKeys.length ? 1 : 0;

  for (const term of tokenTerms) {
    const termScore = /\d/.test(term) ? 3 : 2;
    if (slotBase.has(term)) score += termScore;
    else if (slotExpanded.has(term)) score += termScore;
  }
  if (tokenSide && slotSide && tokenSide === slotSide) score += 2;
  score += semanticRoleScore(tokenTerms, slot);
  if (selectorOutputRoleForRow(row) && kindredSlotMatchesSelectorOutputRole(slot, row)) score += 1;
  return score;
}

function kindredSemanticExtraTermCount(parsed, slot) {
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  const tokenExpanded = expandedSemanticTerms(tokenTerms);
  return slotTerms.filter((term) => !tokenExpanded.has(term) && !semanticAliasTerms(term).some((alias) => tokenExpanded.has(alias))).length;
}

function nonSideKindredSemanticTerms(terms = []) {
  return terms.filter((term) => !sideIntentTerm(term));
}

function hasNonSideKindredSemanticOverlap(parsed, slot) {
  const tokenTerms = nonSideKindredSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  const slotTerms = nonSideKindredSemanticTerms(kindredSemanticBaseTermsForSlot(slot, parsed));
  if (!tokenTerms.length || !slotTerms.length) return false;
  return tokenTerms.some((term) => termsContainRelatedTerm(slotTerms, term));
}

function kindredSemanticSignature(slot, parsed) {
  return effectTermKey(kindredSemanticBaseTermsForSlot(slot, parsed));
}

function kindredSemanticAliasResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  if (!hero || !kindredSlots.length) return [];

  const scored = kindredSlots
    .filter((slot) => {
      if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
      if (!slot.resourcePath || !slot.resourceStem) return false;
      if (!kindredUniqueActionSlotMatchesRoleIntent(parsed, slot)) return false;
      if (!hasNonSideKindredSemanticOverlap(parsed, slot)) return false;
      const root = kindredSlotResourceRoot(slot);
      return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
    })
    .map((slot) => ({
      slot,
      score: kindredSemanticScore(parsed, slot, row),
      extraTerms: kindredSemanticExtraTermCount(parsed, slot),
      signature: kindredSemanticSignature(slot, parsed),
    }))
    .filter((entry) => entry.score >= 3 && entry.signature);

  if (!scored.length) return [];
  const actionSpecific = scored.filter((entry) => hasExplicitActionOverlap(row.actionKeys, kindredSlotRuntimeActionKeys(entry.slot)));
  const ranked = actionSpecific.length ? actionSpecific : scored;
  ranked.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.signature.localeCompare(right.signature));

  const bestScore = ranked[0].score;
  const bestExtraTerms = ranked[0].extraTerms;
  const best = ranked.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);
  const signatures = new Set(best.map((entry) => entry.signature));
  if (signatures.size !== 1) return [];

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function nativeVisualStringLabelTerms(row = {}, parsed = {}, alias = {}) {
  const ignored = [
    parsed.hero,
    ...(alias.resourceRoots || []),
    ...(alias.heroCodes || []),
    "ability",
    "effect",
    "bone",
    "buff",
    "sound",
    "idle",
  ];
  const labels = splitList(row.stringSamples).filter((sample) => {
    if (/^(Effect|Bone|Buff|Sound)_/i.test(sample)) return false;
    if (/^Ability__/i.test(sample)) return false;
    return /[a-z]/i.test(sample || "");
  });

  return labels
    .map((label) => uniq([...significantEffectTerms(label, ignored), ...semanticPhraseTerms(label)]).filter((term) => term.length > 1))
    .filter((terms) => terms.length >= 2);
}

function kindredNativeStringLabelCoreScoredMatches(parsed, alias, kindredSlots = [], row = {}, labelTermGroups = []) {
  const rowActionKeys = listValue(row.actionKeys);
  if (!rowActionKeys.length) return [];
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed).filter((term) => term.length > 1);
  if (!tokenTerms.length) return [];

  const scored = [];
  for (const slot of kindredSlots) {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) continue;
    if (!slot.resourcePath || !slot.resourceStem) continue;
    const slotActionKeys = kindredSlotRuntimeActionKeys(slot);
    if (rowActionKeys.length ? !hasExplicitActionOverlap(rowActionKeys, slotActionKeys) : !actionKeysOverlap(row.actionKeys, slotActionKeys)) {
      continue;
    }
    const root = kindredSlotResourceRoot(slot);
    if (root && alias.resourceRoots?.length && !alias.resourceRoots.includes(root) && !alias.resourceRoots.includes(slot.heroLabel)) continue;

    const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
    const tokenOverlaps = tokenTerms.filter((term) => termsContainRelatedTerm(slotTerms, term));
    if (!tokenOverlaps.length) continue;

    for (const labelTerms of labelTermGroups) {
      if (labelTerms.length < 3) continue;
      const labelOverlaps = labelTerms.filter((term) => termsContainRelatedTerm(slotTerms, term));
      if (!labelOverlaps.length) continue;
      scored.push({
        slot,
        score: labelOverlaps.length * 3 + tokenOverlaps.length * 2 + 1,
        signature: effectTermKey([...tokenOverlaps, ...labelOverlaps]),
      });
    }
  }

  if (!scored.length) return [];
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.signature.localeCompare(right.signature) ||
      left.slot.resourcePath.localeCompare(right.slot.resourcePath),
  );
  const bestScore = scored[0].score;
  const bestSignature = scored[0].signature;
  const byPath = new Map();
  for (const entry of scored.filter((item) => item.score === bestScore && item.signature === bestSignature)) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredNativeStringLabelResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const labelTermGroups = nativeVisualStringLabelTerms(row, parsed, alias);
  if (!parsed?.hero || !labelTermGroups.length || !kindredSlots.length) return [];

  const scored = [];
  for (const slot of kindredSlots) {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) continue;
    if (!slot.resourcePath || !slot.resourceStem) continue;
    if (!actionKeysOverlap(row.actionKeys, kindredSlotRuntimeActionKeys(slot))) continue;
    const root = kindredSlotResourceRoot(slot);
    if (root && alias.resourceRoots?.length && !alias.resourceRoots.includes(root) && !alias.resourceRoots.includes(slot.heroLabel)) continue;

    const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
    for (const labelTerms of labelTermGroups) {
      if (!labelTerms.every((term) => termsContainRelatedTerm(slotTerms, term))) continue;
      const extraTerms = slotTerms.filter((term) => !termsContainRelatedTerm(labelTerms, term)).length;
      scored.push({
        slot,
        score: labelTerms.length * 2 + (listValue(row.actionKeys).length ? 1 : 0),
        extraTerms,
        signature: effectTermKey(labelTerms),
      });
    }
  }

  if (!scored.length) return kindredNativeStringLabelCoreScoredMatches(parsed, alias, kindredSlots, row, labelTermGroups);
  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.extraTerms - right.extraTerms ||
      left.signature.localeCompare(right.signature) ||
      left.slot.resourcePath.localeCompare(right.slot.resourcePath),
  );
  const bestScore = scored[0].score;
  const bestSignature = scored[0].signature;
  const best = scored.filter((entry) => entry.score === bestScore && entry.signature === bestSignature);
  const bestExtraTerms = Math.min(...best.map((entry) => entry.extraTerms));
  const narrowed = best.filter((entry) => entry.extraTerms === bestExtraTerms);

  const byPath = new Map();
  for (const entry of narrowed) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function sideIntentTerm(term) {
  const value = compactTerm(term);
  if (["left", "l", "fl", "wl"].includes(value)) return "left";
  if (["right", "r", "fr", "wr"].includes(value)) return "right";
  return "";
}

function kindredSemanticSignatureWithoutSide(slot, parsed) {
  return effectTermKey(kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => !sideIntentTerm(term)));
}

function kindredSidePairSemanticResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  if (!hero || !kindredSlots.length) return [];

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  if (sideIntentFromTerms(tokenTerms) || sideFromBoneToken(row.boneToken)) return [];

  const scored = kindredSlots
    .filter((slot) => {
      if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
      if (!slot.resourcePath || !slot.resourceStem) return false;
      const root = kindredSlotResourceRoot(slot);
      return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
    })
    .map((slot) => ({
      slot,
      side: sideIntentFromTerms(kindredSemanticBaseTermsForSlot(slot, parsed)),
      score: kindredSemanticScore(parsed, slot, row),
      extraTerms: kindredSemanticExtraTermCount(parsed, slot),
      signature: kindredSemanticSignatureWithoutSide(slot, parsed),
    }))
    .filter((entry) => entry.score >= 3 && entry.signature && entry.side);

  if (!scored.length) return [];
  const groups = new Map();
  for (const entry of scored) {
    const key = [
      entry.score,
      entry.extraTerms,
      entry.signature,
      entry.slot.modelLabel || "",
      kindredSlotActionSignature(entry.slot),
      entry.slot.role || "",
    ].join("\t");
    const rows = groups.get(key) || [];
    rows.push(entry);
    groups.set(key, rows);
  }

  const pairGroups = [...groups.values()]
    .filter((group) => {
      const sides = new Set(group.map((entry) => entry.side));
      return sides.has("left") && sides.has("right");
    })
    .sort((left, right) => right[0].score - left[0].score || left[0].extraTerms - right[0].extraTerms || left[0].signature.localeCompare(right[0].signature));

  if (!pairGroups.length) return [];
  const best = pairGroups[0];
  const sameRank = pairGroups.filter(
    (group) => group[0].score === best[0].score && group[0].extraTerms === best[0].extraTerms && group[0].signature === best[0].signature,
  );
  if (sameRank.length !== 1) return [];

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function isGlobalKindredEffectSlot(slot) {
  return slot?.sourceKind === "kindred-global-effect-resource-slot" || slot?.skinKind === "global";
}

function kindredGlobalResourceTerms(slot) {
  return uniq([
    ...significantEffectTerms([slot.groupLabel, slot.resourceRoot, slot.resourceStem, slot.resourcePath].join("_")),
    ...semanticPhraseTerms(slot.resourceStem || slot.resourcePath),
  ]).filter((term) => term.length > 1);
}

function globalKindredSlotMatchesEntity(parsed, slot) {
  const entity = parsed?.hero || "";
  if (!entity) return false;

  const entityCompact = compactTerm(entity);
  const resourceCompact = compactTerm([slot.groupLabel, slot.resourceRoot, slot.resourceStem, slot.resourcePath].join("_"));
  if (entityCompact && resourceCompact.includes(entityCompact)) return true;

  const entityTerms = significantEffectTerms(entity).filter((term) => term.length > 1);
  if (!entityTerms.length) return false;

  const slotTerms = new Set(kindredGlobalResourceTerms(slot).map(compactTerm));
  const slotExpanded = expandedSemanticTerms([...slotTerms]);
  return entityTerms.every((term) => slotExpanded.has(compactTerm(term)));
}

function globalKindredSemanticScore(parsed, slot, row = {}) {
  if (!isGlobalKindredEffectSlot(slot)) return 0;
  if (!globalKindredSlotMatchesEntity(parsed, slot)) return 0;
  if (!actionKeysOverlap(row.actionKeys, slot.actionKeys)) return 0;

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const slotTerms = kindredGlobalResourceTerms(slot);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const slotBase = new Set(slotTerms);
  const slotExpanded = expandedSemanticTerms(slotTerms);
  let score = 0;
  for (const term of tokenTerms) {
    if (slotBase.has(term)) score += 2;
    else if (slotExpanded.has(term)) score += 2;
    else if (slotTerms.some((slotTerm) => termsMatch(term, slotTerm))) score += 2;
  }
  if (tokenTerms.length === 1 && (slotExpanded.has(compactTerm(tokenTerms[0])) || slotTerms.some((slotTerm) => termsMatch(tokenTerms[0], slotTerm)))) {
    score += 1;
  }
  score += semanticRoleScore(tokenTerms, slot);
  if (selectorOutputRoleForRow(row) && kindredSlotMatchesSelectorOutputRole(slot, row)) score += 1;
  return score;
}

function globalKindredSemanticExtraTermCount(parsed, slot) {
  const tokenExpanded = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  return kindredGlobalResourceTerms(slot).filter((term) => {
    const compact = compactTerm(term);
    if (tokenExpanded.has(compact)) return false;
    if ([...tokenExpanded].some((tokenTerm) => termsMatch(tokenTerm, term))) return false;
    return !semanticAliasTerms(compact).some((alias) => tokenExpanded.has(alias));
  }).length;
}

function numericSuffixBaseTerm(term = "") {
  return normalizedTerm(term).replace(/\d+$/, "");
}

function globalKindredNumberedVariantSignature(parsed, slot) {
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  if (tokenTerms.length !== 1) return "";
  const tokenTerm = normalizedTerm(tokenTerms[0]);
  if (!tokenTerm) return "";
  const stemTerms = significantEffectTerms(slot.resourceStem || slot.resourcePath, [parsed.hero, kindredSlotResourceRoot(slot), slot.groupLabel]);
  if (!stemTerms.some((term) => /\d+$/.test(term) && numericSuffixBaseTerm(term) === tokenTerm)) return "";
  return [kindredSlotResourceRoot(slot), slot.role || "", tokenTerm].join("\t");
}

function globalKindredSemanticResourceMatches(parsed, kindredSlots = [], row = {}) {
  if (!parsed?.hero || !kindredSlots.length) return [];
  const allowLowScoreEffectChannel =
    isBareActionEffectChannel(row) && !selectorOutputRoleForRow(row) && !listValue(row.actionKeys).length;
  const minimumScore = allowLowScoreEffectChannel ? 2 : 3;

  const scored = kindredSlots
    .filter(isGlobalKindredEffectSlot)
    .map((slot) => ({
      slot,
      score: globalKindredSemanticScore(parsed, slot, row),
      extraTerms: globalKindredSemanticExtraTermCount(parsed, slot),
    }))
    .filter((entry) => entry.score >= minimumScore);
  if (!scored.length) return [];

  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.slot.resourcePath.localeCompare(right.slot.resourcePath));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  if (byPath.size === 1) return [...byPath.values()];
  if (bestScore < 3) return [];

  const numberedSignatures = new Set(best.map((entry) => globalKindredNumberedVariantSignature(parsed, entry.slot)).filter(Boolean));
  return numberedSignatures.size === 1
    ? [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)))
    : [];
}

function normalizeHeroRoot(value = "") {
  const match = String(value || "").match(/Hero\d{3}/i);
  return match ? `Hero${match[0].slice(4).padStart(3, "0")}` : "";
}

function isEntityVariantResourceRoot(resourceRoot = "", heroName = "") {
  const rootKey = normalizedTerm(resourceRoot);
  const heroKey = normalizedTerm(heroName);
  return Boolean(rootKey && heroKey && (rootKey === heroKey || rootKey.startsWith(`${heroKey}_`)));
}

function canUseGlobalKindredAlias(parsed = {}, aliasMetadata = {}) {
  if (aliasMetadata.heroCodes?.length) return false;
  const resourceRoots = aliasMetadata.resourceRoots || [];
  if (!resourceRoots.length) return true;
  return resourceRoots.every((root) => isEntityVariantResourceRoot(root, parsed.hero));
}

function definitionHeroCodes(row = {}) {
  return uniq(
    [row.targetRelativePath, row.targetLinkedPath, row.meshSamples, row.skeletonSamples]
      .join("|")
      .match(/Hero\d{3}/gi) || [],
  ).map(normalizeHeroRoot);
}

function definitionTargetsHeroRoot(row = {}, heroRoot = "") {
  const root = normalizeHeroRoot(heroRoot);
  if (!root) return false;
  const label = String(row.manifestLabel || "").replace(/^\*/, "").replace(/\*$/, "");
  const target = String(row.targetRelativePath || "");
  return definitionHeroCodes(row).includes(root) || label === root || target.endsWith(`/${root}.def`) || target.includes(`/${root}/`);
}

function definitionUsesHero000PlaceholderSkeleton(row = {}) {
  return /Characters\/Hero000\/Art\/hero000\.skeleton/i.test(
    [row.targetRelativePath, row.targetLinkedPath, row.meshSamples, row.skeletonSamples].join("|"),
  );
}

function placeholderHeroRootsForAlias(parsed, alias, definitionRows = []) {
  const roots = uniq([
    ...listValue(alias.heroCodes),
    ...listValue(alias.resourceRoots),
    normalizeHeroRoot(parsed?.hero),
  ].map(normalizeHeroRoot));

  return roots.filter((root) => {
    if (!root || root === "Hero000") return false;
    return definitionRows.some((row) => definitionUsesHero000PlaceholderSkeleton(row) && definitionTargetsHeroRoot(row, root));
  });
}

function isHero000GenericKindredSlot(slot) {
  return (
    slot?.heroLabel === "Hero000" &&
    kindredSlotResourceRoot(slot) === "Hero000" &&
    slot?.sourceDefinitionPath === "Effects/KindredEffects.def" &&
    /Hero000_DefaultSkin/.test(slot?.modelLabel || "")
  );
}

function rowHasAttackAction(row = {}) {
  return listValue(row.actionKeys).some((key) => normalizedTerm(key).startsWith("attack"));
}

function placeholderGenericActionCodeForEffect(parsed, row = {}) {
  const effectName = compactTerm(parsed?.effectName || "");
  if (/basicattack|defaultattack|altattack|critattack/.test(effectName) || rowHasAttackAction(row)) return "E";

  const actionKeys = listValue(row.actionKeys).map(normalizedTerm);
  if (actionKeys.some((key) => key.startsWith("ability01"))) return "A";
  if (actionKeys.some((key) => key.startsWith("ability02"))) return "B";
  if (actionKeys.some((key) => key.startsWith("ability03"))) return "C";
  if (actionKeys.some((key) => key.startsWith("ability04"))) return "D";
  return "";
}

function hero000GenericSlotSuffix(slot) {
  const stem = String(slot?.resourceStem || effectBasename(slot?.resourcePath || ""));
  const match = stem.match(/_([A-Z])$/i);
  return match ? match[1].toUpperCase() : "";
}

function hero000GenericSlotActionMarker(slot) {
  const stem = String(slot?.resourceStem || effectBasename(slot?.resourcePath || ""));
  const match = stem.match(/_([A-E])(?:_|$)/i);
  return match ? match[1].toUpperCase() : "";
}

function placeholderGenericSlotActionMatchesEffect(parsed, slot, row = {}) {
  const slotActionKeys = listValue(slot.actionKeys);
  if (slotActionKeys.length) return actionKeysOverlap(row.actionKeys, slotActionKeys);

  const actionCode = placeholderGenericActionCodeForEffect(parsed, row);
  if (!actionCode) return false;

  const slotSuffix = hero000GenericSlotSuffix(slot);
  if (slotSuffix) return slotSuffix === actionCode;
  const role = selectorOutputRoleForRow(row);
  return Boolean(role) && role === String(slot.role || "effect").toLowerCase();
}

function placeholderGenericSemanticTermsForEffect(parsed, row = {}) {
  const terms = kindredSemanticBaseTermsForEffect(parsed);
  const role = selectorOutputRoleForRow(row);
  const actionCode = placeholderGenericActionCodeForEffect(parsed, row);
  if ((actionCode === "E" || terms.includes("attack")) && role === "projectile") terms.push("shot", "projectile", "proj");
  if (role === "impact") terms.push("impact", "hit", "proj");
  return uniq(terms).filter((term) => term.length > 1);
}

function placeholderGenericKindredScore(parsed, slot, row = {}) {
  if (!kindredSlotMatchesSelectorOutputRole(slot, row)) return 0;
  if (!placeholderGenericSlotActionMatchesEffect(parsed, slot, row)) return 0;

  const tokenTerms = placeholderGenericSemanticTermsForEffect(parsed, row);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const slotExpanded = expandedSemanticTerms(slotTerms);
  let overlapScore = 0;
  for (const term of tokenTerms) {
    if (slotExpanded.has(normalizedTerm(term))) overlapScore += 2;
  }
  if (!overlapScore) return 0;

  return overlapScore + semanticRoleScore(tokenTerms, slot) + (selectorOutputRoleForRow(row) ? 1 : 0) + 1;
}

function placeholderGenericKindredExtraTermCount(parsed, slot, row = {}) {
  const tokenExpanded = expandedSemanticTerms(placeholderGenericSemanticTermsForEffect(parsed, row));
  return kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => {
    const compact = compactTerm(term);
    if (tokenExpanded.has(compact)) return false;
    return !semanticAliasTerms(compact).some((alias) => tokenExpanded.has(alias));
  }).length;
}

function placeholderGenericKindredSelectorResourceMatches(parsed, alias, kindredSlots = [], row = {}, definitionRows = []) {
  const role = selectorOutputRoleForRow(row);
  if (!role || !listValue(row.actionKeys).length || !placeholderHeroRootsForAlias(parsed, alias, definitionRows).length) return [];
  const actionCode = placeholderGenericActionCodeForEffect(parsed, row);

  const scored = kindredSlots
    .filter(isHero000GenericKindredSlot)
    .map((slot) => ({
      slot,
      score: placeholderGenericKindredScore(parsed, slot, row),
      extraTerms: placeholderGenericKindredExtraTermCount(parsed, slot, row),
      hasActionKeys: listValue(slot.actionKeys).length > 0,
      hasMatchingSuffix: Boolean(actionCode) && hero000GenericSlotSuffix(slot) === actionCode,
    }))
    .filter((entry) => entry.score >= 4);
  if (!scored.length) return [];

  const actionKeyed = scored.filter((entry) => entry.hasActionKeys);
  const ranked = actionKeyed.length ? actionKeyed : scored;

  ranked.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.slot.resourcePath.localeCompare(right.slot.resourcePath));
  const bestScore = ranked[0].score;
  const bestExtraTerms = ranked[0].extraTerms;
  let best = ranked.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);
  const suffixBest = best.filter((entry) => entry.hasMatchingSuffix);
  if (suffixBest.length) best = suffixBest;

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function placeholderGenericActionSemanticScore(parsed, slot, row = {}) {
  const slotActionKeys = listValue(slot.actionKeys);
  const actionCode = placeholderGenericActionCodeForEffect(parsed, row);
  const slotSuffix = hero000GenericSlotSuffix(slot);
  if (slotActionKeys.length) {
    if (!actionKeysOverlap(row.actionKeys, slotActionKeys)) return 0;
  } else if (!actionCode || !slotSuffix || slotSuffix !== actionCode) {
    return 0;
  }

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const slotBase = new Set(slotTerms);
  let score = 1;
  for (const term of tokenTerms) {
    if (slotBase.has(normalizedTerm(term))) score += 2;
  }
  return score >= 3 ? score : 0;
}

function placeholderGenericActionSemanticExtraTermCount(parsed, slot) {
  const tokenTerms = new Set(kindredSemanticBaseTermsForEffect(parsed).map(compactTerm));
  return kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => !tokenTerms.has(compactTerm(term))).length;
}

function placeholderGenericKindredSemanticActionResourceMatches(parsed, alias, kindredSlots = [], row = {}, definitionRows = []) {
  if (selectorOutputRoleForRow(row) || !listValue(row.actionKeys).length || !placeholderHeroRootsForAlias(parsed, alias, definitionRows).length) {
    return [];
  }

  const scored = kindredSlots
    .filter(isHero000GenericKindredSlot)
    .map((slot) => ({
      slot,
      score: placeholderGenericActionSemanticScore(parsed, slot, row),
      extraTerms: placeholderGenericActionSemanticExtraTermCount(parsed, slot),
    }))
    .filter((entry) => entry.score >= 3);
  if (!scored.length) return [];

  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.slot.resourcePath.localeCompare(right.slot.resourcePath));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function placeholderGenericSemanticScore(parsed, slot, row = {}) {
  if (selectorOutputRoleForRow(row) || listValue(row.actionKeys).length) return 0;
  if (listValue(slot.actionKeys).length) return 0;
  if (hero000GenericSlotActionMarker(slot)) return 0;

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const slotExpanded = expandedSemanticTerms(slotTerms);
  let score = 1;
  for (const term of tokenTerms) {
    if (slotExpanded.has(normalizedTerm(term))) score += 2;
  }
  return score >= 3 ? score : 0;
}

function placeholderGenericSemanticExtraTermCount(parsed, slot) {
  const tokenExpanded = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  return kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => {
    const compact = compactTerm(term);
    if (tokenExpanded.has(compact)) return false;
    return !semanticAliasTerms(compact).some((alias) => tokenExpanded.has(alias));
  }).length;
}

function placeholderGenericKindredSemanticResourceMatches(parsed, alias, kindredSlots = [], row = {}, definitionRows = []) {
  if (selectorOutputRoleForRow(row) || listValue(row.actionKeys).length || !placeholderHeroRootsForAlias(parsed, alias, definitionRows).length) {
    return [];
  }

  const scored = kindredSlots
    .filter(isHero000GenericKindredSlot)
    .map((slot) => ({
      slot,
      score: placeholderGenericSemanticScore(parsed, slot, row),
      extraTerms: placeholderGenericSemanticExtraTermCount(parsed, slot),
    }))
    .filter((entry) => entry.score >= 3);
  if (!scored.length) return [];

  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.slot.resourcePath.localeCompare(right.slot.resourcePath));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredUniqueScoredCandidateMatches(token, parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  if (!hero || !kindredSlots.length) return [];

  const candidates = kindredSlotCandidatesForHook(
    {
      effectToken: token,
      token,
      actionKeys: listValue(row.actionKeys),
    },
    kindredSlots,
  ).filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });

  const byPath = new Map();
  for (const slot of candidates) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function selectorOutputRoleForRow(row = {}) {
  const role = String(row.selectorOutputRole || "").toLowerCase();
  return ["projectile", "impact", "cast", "persistent", "effect"].includes(role) ? role : "";
}

function normalizedSelectorStateTerm(term) {
  const value = String(term || "").toLowerCase();
  if (value === "good" || value === "light") return "light";
  if (value === "evil" || value === "dark") return "dark";
  return "";
}

function selectorStateTermsForRow(row = {}) {
  const terms = uniq(listValue(row.selectorStateTerms).map(normalizedSelectorStateTerm).filter(Boolean));
  return terms.length === 1 ? terms : [];
}

function kindredSlotMatchesSelectorOutputRole(slot, row = {}) {
  const role = selectorOutputRoleForRow(row);
  if (!role) return true;
  return String(slot.role || "effect").toLowerCase() === role;
}

function kindredSlotStateTerms(slot, parsed) {
  return uniq(
    [
      ...listValue(slot?.selectorStateTerms),
      ...kindredSemanticBaseTermsForSlot(slot, parsed),
    ].map(normalizedSelectorStateTerm).filter(Boolean),
  );
}

function kindredSlotMatchesSelectorState(slot, parsed, row = {}) {
  const stateTerms = selectorStateTermsForRow(row);
  if (!stateTerms.length) return true;
  const slotStateTerms = kindredSlotStateTerms(slot, parsed);
  return slotStateTerms.some((term) => stateTerms.includes(term));
}

function kindredSlotMatchesAliasRoot(slot, alias) {
  const root = kindredSlotResourceRoot(slot);
  return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(slot.heroLabel);
}

function kindredSlotMatchesResolvedHero(slot, parsed = {}, alias = {}) {
  const hero = parsed?.hero || "";
  if (!hero || !slot?.heroLabel) return false;
  if (slot.heroLabel === hero) return true;

  const root = kindredSlotResourceRoot(slot);
  if (!root) return false;
  const resolvedRoots = new Set([...listValue(alias.resourceRoots), ...listValue(alias.heroCodes)].map(normalizedTerm).filter(Boolean));
  return resolvedRoots.has(normalizedTerm(root));
}

function selectorSlotFamilyKey(slot) {
  const stem = String(slot.resourceStem || effectBasename(slot.resourcePath || ""));
  const withoutHero = stem.replace(/^Hero\d+_?/i, "");
  const parts = withoutHero.split(/[_\s-]+/).filter(Boolean);
  if (parts.length > 2 && /^[A-Z0-9]{2,5}$/.test(parts[0]) && !/^(AA|A|B|C)$/i.test(parts[0])) {
    return parts.slice(1).join("_").toLowerCase();
  }
  return parts.join("_").toLowerCase();
}

function kindredSelectorOutputRoleResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const role = selectorOutputRoleForRow(row);
  const actionKeys = listValue(row.actionKeys);
  const stateTerms = selectorStateTermsForRow(row);
  if (!hero || !role || (!actionKeys.length && !stateTerms.length) || !kindredSlots.length) return [];

  let matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!kindredSlotMatchesSelectorOutputRole(slot, row)) return false;
    if (!kindredSlotMatchesSelectorState(slot, parsed, row)) return false;
    if (!listValue(slot.actionKeys).length && !stateTerms.length) return false;
    if (listValue(slot.actionKeys).length && !actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    return kindredSlotMatchesAliasRoot(slot, alias);
  });
  if (!matches.length) return [];

  const semanticMatches = matches.filter((slot) => kindredSemanticScore(parsed, slot, row) >= 3);
  if (semanticMatches.length) matches = semanticMatches;

  const familyKeys = new Set(matches.map(selectorSlotFamilyKey).filter(Boolean));
  if (familyKeys.size > 2) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function selectorOutputIntentAllowsSlotRole(parsed, slot, row = {}) {
  const role = selectorOutputRoleForRow(row);
  const slotRole = String(slot?.role || "effect").toLowerCase();
  if (!role) return true;
  if (slotRole === role) return true;

  const actionKeys = listValue(row.actionKeys);
  const slotActionKeys = listValue(slot?.actionKeys);
  const effectKey = compactTerm(parsed?.effectName || "");
  if (
    role === "projectile" &&
    slotRole === "effect" &&
    (effectKey.includes("defaultattack") || effectKey.includes("basicattack") || actionKeys.some((key) => key.startsWith("attack"))) &&
    (!slotActionKeys.length || slotActionKeys.some((key) => key.startsWith("attack")))
  ) {
    return true;
  }

  return false;
}

function selectorOutputIntentTerms(parsed, row = {}) {
  const terms = [...kindredSemanticBaseTermsForEffect(parsed)];
  const effectKey = compactTerm(parsed?.effectName || "");
  const role = selectorOutputRoleForRow(row);

  if (effectKey.includes("defaultattack") || effectKey.includes("basicattack")) terms.push("attack", "aa");
  if (role === "projectile") terms.push("projectile", "shot", "proj");
  if (role === "impact") terms.push("impact", "hit");
  if (role === "impact" && (effectKey.includes("defaultattack") || effectKey.includes("basicattack"))) {
    terms.push("projectile");
  }

  return uniq(terms).filter((term) => term.length > 1);
}

function selectorOutputIntentHasExplicitBasicAttack(parsed) {
  const effectKey = compactTerm(parsed?.effectName || "");
  return effectKey.includes("defaultattack") || effectKey.includes("basicattack");
}

function selectorOutputIntentHasActionShorthandEvidence(parsed, slot, row = {}) {
  if (!selectorOutputIntentHasExplicitBasicAttack(parsed)) return false;
  if (!listValue(row.actionKeys).some((key) => key.startsWith("attack"))) return false;
  if (!actionKeysOverlap(row.actionKeys, slot?.actionKeys)) return false;
  return kindredSemanticBaseTermsForSlot(slot, parsed).includes("aa");
}

function selectorOutputIntentScore(parsed, slot, row = {}) {
  if (!selectorOutputIntentAllowsSlotRole(parsed, slot, row)) return 0;
  if (!actionKeysOverlap(row.actionKeys, slot.actionKeys)) return 0;

  const tokenTerms = selectorOutputIntentTerms(parsed, row);
  const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
  if (!tokenTerms.length || !slotTerms.length) return 0;

  const slotBase = new Set(slotTerms);
  const slotExpanded = expandedSemanticTerms(slotTerms);
  let score = selectorOutputRoleForRow(row) ? 1 : 0;
  for (const term of tokenTerms) {
    if (slotBase.has(term)) score += 2;
    else if (slotExpanded.has(term)) score += 2;
  }
  if (selectorOutputIntentHasActionShorthandEvidence(parsed, slot, row)) score += 2;
  return score;
}

function selectorOutputIntentExtraTermCount(parsed, slot, row = {}) {
  const tokenExpanded = expandedSemanticTerms(selectorOutputIntentTerms(parsed, row));
  return kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => {
    const compact = compactTerm(term);
    if (tokenExpanded.has(compact)) return false;
    return !semanticAliasTerms(compact).some((alias) => tokenExpanded.has(alias));
  }).length;
}

function contextHeroNamesForSelectorIntent(parsed, row = {}) {
  const parsedHero = parsed?.hero || "";
  return uniq([...listValue(row.heroNames), parsedHero].filter(Boolean));
}

function bestUniqueSelectorIntentSlotsByModel(scored = []) {
  const byModel = new Map();
  for (const entry of scored) {
    const model = entry.slot.modelLabel || entry.slot.heroLabel || "";
    const rows = byModel.get(model) || [];
    rows.push(entry);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    rows.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.slot.resourcePath.localeCompare(right.slot.resourcePath));
    const bestScore = rows[0].score;
    const bestExtraTerms = rows[0].extraTerms;
    const best = rows.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);
    const uniquePaths = new Set(best.map((entry) => entry.slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(best[0].slot);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredSelectorOutputIntentResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const role = selectorOutputRoleForRow(row);
  if (!role || !kindredSlots.length) return [];
  if (!selectorOutputIntentHasExplicitBasicAttack(parsed)) return [];
  if (!listValue(row.actionKeys).length) return [];

  const contextHeroes = new Set(contextHeroNamesForSelectorIntent(parsed, row));
  if (!contextHeroes.size) return [];

  const scored = kindredSlots
    .filter((slot) => {
      if (!slot.resourcePath || !slot.resourceStem) return false;
      if (!contextHeroes.has(slot.heroLabel) && !kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
      if (!kindredSlotMatchesSelectorState(slot, parsed, row)) return false;
      return kindredSlotMatchesAliasRoot(slot, alias);
    })
    .map((slot) => ({
      slot,
      score: selectorOutputIntentScore(parsed, slot, row),
      extraTerms: selectorOutputIntentExtraTermCount(parsed, slot, row),
    }))
    .filter((entry) => entry.score >= 5 && entry.extraTerms === 0);

  if (!scored.length) return [];
  return bestUniqueSelectorIntentSlotsByModel(scored);
}

function kindredUniqueActionResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  if (!hero || !actionKeys.length || !kindredSlots.length) return [];

  const actionSlots = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!listValue(slot.actionKeys).length) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (!kindredUniqueActionSlotMatchesRoleIntent(parsed, slot)) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!actionSlots.length) return [];

  const bySignature = new Map();
  for (const slot of actionSlots) {
    const signature = kindredSemanticSignature(slot, parsed);
    if (!signature) continue;
    const slots = bySignature.get(signature) || [];
    slots.push(slot);
    bySignature.set(signature, slots);
  }
  if (bySignature.size !== 1) return [];

  const byPath = new Map();
  for (const slot of [...bySignature.values()][0]) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function actionKeyForActionCode(actionCode = "") {
  const code = String(actionCode || "").toUpperCase();
  if (code === "A") return "ability01";
  if (code === "B") return "ability02";
  if (code === "C") return "ability03";
  return "";
}

function actionCodeFromEffectName(effectName = "") {
  const [firstPart = ""] = effectTermParts(effectName);
  const part = normalizedTerm(firstPart);
  if (part === "a" || part === "ability01" || part === "ability1") return "A";
  if (part === "b" || part === "ability02" || part === "ability2") return "B";
  if (part === "c" || part === "ability03" || part === "ability3") return "C";
  return "";
}

function semanticLightBareActionEffectTerms(effectName = "", actionCode = "") {
  const action = normalizedTerm(actionCode);
  const allowedRoleTerms = new Set(["impact", "hit", "cast", "effect"]);
  return effectTermParts(effectName).filter((term) => term !== action && !allowedRoleTerms.has(term));
}

function bareActionSlotCode(slot) {
  const ignored = new Set([
    ...effectTermParts(slot?.heroLabel || ""),
    ...effectTermParts(kindredSlotResourceRoot(slot)),
    "def",
    "default",
    "defaults",
    "skin",
    "s1",
    "s2",
    "s3",
    "t1",
    "t2",
    "t3",
    "cny",
    "hlwn",
    "med",
    "olym",
    "mtl",
    "crim",
    "kirin",
    "forest",
    "cat",
    "cyber",
    "pos",
  ]);
  const terms = effectTermParts(slot?.resourceStem || effectBasename(slot?.resourcePath || "")).filter((term) => {
    if (/^hero\d+$/i.test(term)) return false;
    if (/^s\d+(?:t\d+)?$/i.test(term)) return false;
    return !ignored.has(term);
  });
  if (terms.length !== 1) return "";
  const [term] = terms;
  if (term === "a") return "A";
  if (term === "b") return "B";
  if (term === "c") return "C";
  return "";
}

function bestUniqueBareActionSlotsByModel(scored = []) {
  const byModel = new Map();
  for (const entry of scored) {
    const model = entry.slot.modelLabel || entry.slot.heroLabel || "";
    const rows = byModel.get(model) || [];
    rows.push(entry);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((entry) => entry.slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0].slot);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredBareActionResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionCode = actionCodeFromEffectName(parsed?.effectName);
  const actionKey = actionKeyForActionCode(actionCode);
  if (!hero || !actionCode || !actionKey || !listValue(row.actionKeys).length || !kindredSlots.length) return [];
  if (!actionKeysOverlap(row.actionKeys, [actionKey])) return [];
  if (semanticLightBareActionEffectTerms(parsed.effectName, actionCode).length) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (String(slot.role || "effect").toLowerCase() !== "effect") return false;
    if (!listValue(slot.actionKeys).length || !actionKeysOverlap(slot.actionKeys, [actionKey])) return false;
    if (bareActionSlotCode(slot) !== actionCode) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  return bestUniqueBareActionSlotsByModel(matches.map((slot) => ({ slot })));
}

function isBareActionEffectChannel(row = {}) {
  if (selectorOutputRoleForRow(row)) return false;
  return row?.runtimeBinding?.kind === "effect-channel" || row.bindKind === "effect-only";
}

function slotStemHasActionCode(slot = {}, actionCode = "") {
  const code = normalizedTerm(actionCode);
  if (!code) return false;
  return effectTermParts(slot.resourceStem || effectBasename(slot.resourcePath || "")).some((term) => normalizedTerm(term) === code);
}

function kindredBareActionChannelResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionCode = actionCodeFromEffectName(parsed?.effectName);
  const actionKey = actionKeyForActionCode(actionCode);
  if (!hero || !actionCode || !actionKey || !isBareActionEffectChannel(row) || !kindredSlots.length) return [];
  if (!actionKeysOverlap(row.actionKeys, [actionKey])) return [];
  if (semanticLightBareActionEffectTerms(parsed.effectName, actionCode).length) return [];

  const allowedRoles = new Set(["effect", "persistent"]);
  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!allowedRoles.has(String(slot.role || "effect").toLowerCase())) return false;
    if (!actionKeysOverlap(slot.actionKeys, [actionKey])) return false;
    if (!slotStemHasActionCode(slot, actionCode)) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredBaseActionProjectileResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  const hints = semanticRoleHintsForEffect(parsed);
  if (!hero || actionKeys.length !== 1 || !hints.has("projectile") || !kindredSlots.length) return [];
  if (hints.has("impact")) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (!["effect", "projectile"].includes(String(slot.role || "").toLowerCase())) return false;
    if (kindredSemanticBaseTermsForSlot(slot, parsed).length) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredVisualBeamProjectileResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  const tokenTerms = new Set(kindredSemanticBaseTermsForEffect(parsed).map(compactTerm));
  if (!hero || actionKeys.length !== 1 || !tokenTerms.has("beam") || !kindredSlots.length) return [];
  if (row.sourceKind !== "native-visual-binding" || row.bindKind !== "visual-bone-effect") return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (String(slot.role || "").toLowerCase() !== "projectile") return false;
    const slotTerms = expandedSemanticTerms(kindredSemanticBaseTermsForSlot(slot, parsed));
    if (["impact", "hit", "explosion", "cast", "channel", "charge", "charging"].some((term) => slotTerms.has(term))) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byModel = new Map();
  for (const slot of matches) {
    const model = slot.modelLabel || slot.heroLabel || slot.resourceRoot || slot.resourcePath;
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((slot) => slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredNativeStartCastResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  const tokenTerms = new Set(kindredSemanticBaseTermsForEffect(parsed).map(compactTerm));
  const nativeActionNames = listValue(row.nativeActionNames || row.actionNames);
  const hasStartIntent =
    tokenTerms.has("start") ||
    tokenTerms.has("starting") ||
    tokenTerms.has("startup") ||
    nativeActionNames.some((name) => /(?:^|[_-])start(?:$|[_-])/i.test(String(name || "")));
  if (!hero || actionKeys.length !== 1 || !hasStartIntent || !kindredSlots.length) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (String(slot.role || "").toLowerCase() !== "cast") return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byModel = new Map();
  for (const slot of matches) {
    const model = slot.modelLabel || slot.heroLabel || slot.resourceRoot || slot.resourcePath;
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((slot) => slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function nativeNearbyEffectTermsForRow(row = {}, parsed = {}) {
  const ignoredTerms = [parsed?.hero, "effect"].filter(Boolean);
  return uniq(
    listValue(row.nativeNearbyEffectTokens || row.nearbyEffectTokens)
      .flatMap((token) => [
        ...significantEffectTerms(String(token || "").replace(/^Effect_/, ""), ignoredTerms),
        ...semanticPhraseTerms(token),
      ])
      .map(compactTerm)
      .filter(Boolean),
  );
}

function kindredNativeNearbyChargingResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  const tokenTerms = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  const nearbyTerms = expandedSemanticTerms(nativeNearbyEffectTermsForRow(row, parsed));
  const hasNativeEvidence = ["native-effect-spawn", "native-effect-hook", "native-visual-binding"].includes(row.sourceKind);
  const hasAimingToChargingEvidence = tokenTerms.has("aiming") && ["charging", "charge", "channel", "channeling"].some((term) => nearbyTerms.has(term));
  if (!hero || actionKeys.length !== 1 || !hasNativeEvidence || !hasAimingToChargingEvidence || !kindredSlots.length) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (String(slot.role || "").toLowerCase() !== "cast") return false;
    const slotTerms = expandedSemanticTerms(kindredSemanticBaseTermsForSlot(slot, parsed));
    if (!["charging", "charge", "channel", "channeling"].some((term) => slotTerms.has(term))) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byModel = new Map();
  for (const slot of matches) {
    const model = slot.modelLabel || slot.heroLabel || slot.resourceRoot || slot.resourcePath;
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((slot) => slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function rowEffectOptionScale(row = {}) {
  const optionScale = Number(row.effectOptions?.scale);
  const argScales = listValue(row.effectOptionFloatArgs)
    .map((arg) => Number(String(arg || "").split(":").pop()))
    .filter((value) => Number.isFinite(value));
  return Math.max(Number.isFinite(optionScale) ? optionScale : 0, ...argScales, 0);
}

function kindredNativeScaledGroundRingResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKeys = listValue(row.actionKeys);
  const tokenTerms = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  const hasRingIntent = ["ring", "radius", "warning", "indicator"].some((term) => tokenTerms.has(term));
  const hasChargingIntent = ["charging", "charge", "channel", "channeling"].some((term) => tokenTerms.has(term));
  if (!hero || actionKeys.length !== 1 || !hasRingIntent || !hasChargingIntent || !kindredSlots.length) return [];
  if (row.sourceKind !== "native-visual-binding" || row.bindKind !== "effect-only" || row.boneToken) return [];
  if (rowEffectOptionScale(row) <= 1) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap(actionKeys, slot.actionKeys)) return false;
    if (!["cast", "effect"].includes(String(slot.role || "").toLowerCase())) return false;
    const slotTerms = expandedSemanticTerms(kindredSemanticBaseTermsForSlot(slot, parsed));
    if (!slotTerms.has("ground")) return false;
    if (!["charging", "charge", "channel", "channeling"].some((term) => slotTerms.has(term))) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byModel = new Map();
  for (const slot of matches) {
    const model = slot.modelLabel || slot.heroLabel || slot.resourceRoot || slot.resourcePath;
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((slot) => slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function numberedActionKeyForEffect(parsed = {}) {
  const [firstPart = ""] = effectTermParts(parsed.effectName);
  const match = firstPart.match(/^([abc])\d+$/i);
  return match ? actionKeyForActionCode(match[1]) : "";
}

function kindredNumberedStatusResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const actionKey = numberedActionKeyForEffect(parsed);
  const rowActionKeys = listValue(row.actionKeys);
  const tokenTerms = expandedSemanticTerms(kindredSemanticBaseTermsForEffect(parsed));
  const compactEffectName = compactTerm(parsed?.effectName);
  const hasStatusIntent =
    ["dot", "damageovertime", "drowsy", "status", "debuff"].some((term) => tokenTerms.has(term)) ||
    compactEffectName.includes("dot") ||
    compactEffectName.includes("damageovertime");
  if (!hero || !actionKey || !hasStatusIntent || !kindredSlots.length) return [];
  if (rowActionKeys.length && !actionKeysOverlap(rowActionKeys, [actionKey])) return [];
  if (!["native-effect-vcall", "native-effect-spawn", "native-effect-hook"].includes(row.sourceKind)) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!actionKeysOverlap([actionKey], slot.actionKeys)) return false;
    if (!["effect", "persistent"].includes(String(slot.role || "").toLowerCase())) return false;
    const slotTerms = expandedSemanticTerms(kindredSemanticBaseTermsForSlot(slot, parsed));
    if (!slotTerms.has("status")) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  const byModel = new Map();
  for (const slot of matches) {
    const model = slot.modelLabel || slot.heroLabel || slot.resourceRoot || slot.resourcePath;
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }

  const selected = [];
  for (const rows of byModel.values()) {
    const uniquePaths = new Set(rows.map((slot) => slot.resourcePath));
    if (uniquePaths.size !== 1) return [];
    selected.push(rows[0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredActionlessWeakCandidateResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  if (!hero || alias.evidenceStrength !== "weak" || alias.matches.length < 2 || !kindredSlots.length) return [];
  if (listValue(row.actionKeys).length || selectorOutputRoleForRow(row)) return [];
  if (actionCodeFromEffectName(parsed?.effectName)) return [];

  const candidatePaths = new Set(alias.matches.map((match) => match.relativePath).filter(Boolean));
  const candidateSlots = kindredSlots.filter((slot) => {
    if (!candidatePaths.has(slot.resourcePath)) return false;
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourceStem) return false;
    if (!kindredSlotMatchesAliasRoot(slot, alias)) return false;
    return kindredUniqueActionSlotMatchesRoleIntent(parsed, slot);
  });
  if (!candidateSlots.length) return [];

  const actionlessSlots = candidateSlots.filter((slot) => !listValue(slot.actionKeys).length);
  const actionGatedSlots = candidateSlots.filter((slot) => listValue(slot.actionKeys).length);
  if (!actionlessSlots.length || !actionGatedSlots.length) return [];

  const scored = actionlessSlots
    .map((slot) => ({
      slot,
      score: kindredSemanticScore(parsed, slot, row),
      extraTerms: kindredSemanticExtraTermCount(parsed, slot),
      signature: kindredSemanticSignature(slot, parsed),
    }))
    .filter((entry) => entry.score >= 3 && entry.signature);
  if (!scored.length) return [];

  scored.sort((left, right) => right.score - left.score || left.extraTerms - right.extraTerms || left.signature.localeCompare(right.signature));
  const bestScore = scored[0].score;
  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.score === bestScore && entry.extraTerms === bestExtraTerms);
  const signatures = new Set(best.map((entry) => entry.signature));
  if (signatures.size !== 1) return [];

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function terminalStateTermVariants(term = "") {
  const value = normalizedTerm(term);
  if (value === "charged" || value === "charge" || value === "charging") return ["charged", "charge", "charging"];
  return [];
}

function kindredSlotHasTerminalStateTerm(slot, parsed, terminalTerm) {
  const terminalVariants = new Set(terminalStateTermVariants(terminalTerm));
  if (!terminalVariants.size) return false;

  return kindredSemanticBaseTermsForSlot(slot, parsed).some((term) => {
    const variants = terminalStateTermVariants(term);
    return variants.some((variant) => terminalVariants.has(variant));
  });
}

function terminalStateExtraTermCount(slot, parsed, terminalTerm) {
  const terminalVariants = new Set(terminalStateTermVariants(terminalTerm));
  return kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => {
    const variants = terminalStateTermVariants(term);
    return !variants.some((variant) => terminalVariants.has(variant));
  }).length;
}

function kindredActionlessTerminalStateResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  if (!hero || alias.evidenceStrength !== "weak" || alias.matches.length < 2 || !kindredSlots.length) return [];
  if (listValue(row.actionKeys).length || selectorOutputRoleForRow(row)) return [];

  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed).filter((term) => term.length > 1);
  const terminalTerm = tokenTerms[tokenTerms.length - 1] || "";
  if (!terminalStateTermVariants(terminalTerm).length) return [];

  const candidatePaths = new Set(alias.matches.map((match) => match.relativePath).filter(Boolean));
  const candidateSlots = kindredSlots.filter((slot) => {
    if (!candidatePaths.has(slot.resourcePath)) return false;
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourceStem) return false;
    return kindredSlotMatchesAliasRoot(slot, alias);
  });
  if (!candidateSlots.length) return [];

  const actionlessCastSlots = candidateSlots.filter((slot) => {
    if (listValue(slot.actionKeys).length) return false;
    if (String(slot.role || "").toLowerCase() !== "cast") return false;
    return kindredSlotHasTerminalStateTerm(slot, parsed, terminalTerm);
  });
  const actionGatedSlots = candidateSlots.filter((slot) => listValue(slot.actionKeys).length);
  if (!actionlessCastSlots.length || !actionGatedSlots.length) return [];

  const scored = actionlessCastSlots.map((slot) => ({
    slot,
    extraTerms: terminalStateExtraTermCount(slot, parsed, terminalTerm),
    signature: effectTermKey(kindredSemanticBaseTermsForSlot(slot, parsed).filter((term) => terminalStateTermVariants(term).length)),
  }));
  scored.sort(
    (left, right) =>
      left.extraTerms - right.extraTerms ||
      left.signature.localeCompare(right.signature) ||
      String(left.slot.resourcePath).localeCompare(String(right.slot.resourcePath)),
  );

  const bestExtraTerms = scored[0].extraTerms;
  const best = scored.filter((entry) => entry.extraTerms === bestExtraTerms);
  const signatures = new Set(best.map((entry) => entry.signature));
  if (signatures.size !== 1) return [];

  const byPath = new Map();
  for (const entry of best) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function defaultAttackVariantImpactNumber(effectName = "") {
  const terms = effectTermParts(effectName);
  let attackIndex = terms.findIndex((term) => term === "defaultattack" || term === "basicattack");
  if (attackIndex < 0) {
    attackIndex = terms.findIndex((term, index) => term === "attack" && (terms[index - 1] === "default" || terms[index - 1] === "basic"));
  }
  if (attackIndex < 0) return "";

  const suffix = terms[terms.length - 1] || "";
  const suffixToNumber = { a: "01", b: "02", c: "03" };
  const number = suffixToNumber[suffix];
  if (!number) return "";

  const roleTerms = terms.slice(attackIndex + 1, -1);
  if (!roleTerms.some((term) => termsAreRelated(term, "impact") || termsAreRelated(term, "hit"))) return "";
  return number;
}

function defaultAttackImpactNumberForKindredSlot(slot = {}) {
  const terms = effectTermParts(slot.resourceStem || effectBasename(slot.resourcePath || ""));
  if (!terms.includes("aa") && !terms.includes("defaultattack") && !terms.includes("basicattack")) return "";
  if (!terms.some((term) => termsAreRelated(term, "impact") || termsAreRelated(term, "hit"))) return "";

  const numberTerm = terms.find((term) => /^0?[123]$/.test(term));
  if (!numberTerm) return "";
  return numberTerm.padStart(2, "0");
}

function kindredDefaultAttackVariantImpactResourceMatches(parsed, alias, kindredSlots = []) {
  const hero = parsed?.hero || "";
  const number = defaultAttackVariantImpactNumber(parsed?.effectName);
  if (!hero || !number || alias.evidenceStrength !== "weak" || alias.matches.length < 2 || !kindredSlots.length) return [];

  const candidatePaths = new Set(alias.matches.map((match) => match.relativePath).filter(Boolean));
  const matches = kindredSlots.filter((slot) => {
    if (!candidatePaths.has(slot.resourcePath)) return false;
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!kindredSlotMatchesAliasRoot(slot, alias)) return false;
    if (String(slot.role || "").toLowerCase() !== "impact") return false;
    if (!listValue(slot.actionKeys).includes("attack")) return false;
    return defaultAttackImpactNumberForKindredSlot(slot) === number;
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function modeSuffixBaseEffectName(effectName = "") {
  const match = String(effectName || "").match(/^(.+)_(?:3v3|5v5)$/i);
  return match?.[1] || "";
}

function kindredModeSuffixBaseResourceMatches(parsed, alias, kindredSlots = []) {
  const baseEffectName = modeSuffixBaseEffectName(parsed?.effectName);
  if (!baseEffectName || alias.evidenceStrength !== "weak" || alias.matches.length < 2 || !kindredSlots.length) return [];

  const candidatePaths = new Set(alias.matches.map((match) => match.relativePath).filter(Boolean));
  const expectedStems = new Set(
    (alias.resourceRoots || [])
      .flatMap((root) => [compactTerm(`${root}_${baseEffectName}`), compactTerm(`${root}${baseEffectName}`)])
      .filter(Boolean),
  );
  if (!expectedStems.size) return [];

  const matches = kindredSlots.filter((slot) => {
    if (!candidatePaths.has(slot.resourcePath)) return false;
    if (!kindredSlotMatchesAliasRoot(slot, alias)) return false;
    if (listValue(slot.actionKeys).length) return false;
    return expectedStems.has(compactTerm(slot.resourceStem || effectBasename(slot.resourcePath || "")));
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function sourceSkinAliasDefaultCandidateResourceMatches(token, parsed, alias, kindredSlots = [], skinEffectAliasSourceIndex = new Map()) {
  const aliases = skinEffectAliasSourceIndex.get(token) || [];
  if (!aliases.length || alias.evidenceStrength !== "weak" || alias.matches.length < 2 || !kindredSlots.length) return [];

  const candidatePaths = new Set(alias.matches.map((match) => match.relativePath).filter(Boolean));
  const matches = kindredSlots.filter((slot) => {
    if (!candidatePaths.has(slot.resourcePath)) return false;
    if (String(slot.skinKind || "").toLowerCase() !== "default") return false;
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    return kindredSlotMatchesAliasRoot(slot, alias);
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size > 0 && byPath.size < candidatePaths.size ? [...byPath.values()] : [];
}

function sourceSkinAliasActionSlotResourceMatches(token, parsed, alias, kindredSlots = [], skinEffectAliasSourceIndex = new Map(), row = {}) {
  const actionKeys = listValue(row.actionKeys);
  if (!actionKeys.length) return [];

  const defaultCandidates = sourceSkinAliasDefaultCandidateResourceMatches(token, parsed, alias, kindredSlots, skinEffectAliasSourceIndex);
  if (!defaultCandidates.length) return [];

  const actionMatched = defaultCandidates.filter((slot) => listValue(slot.actionKeys).length && actionKeysOverlap(actionKeys, slot.actionKeys));
  if (!actionMatched.length) return [];

  const byPath = new Map();
  for (const slot of actionMatched) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function sourceSkinAliasSlotMatchesRuntimeRole(parsed, slot, row = {}) {
  const selectorRole = selectorOutputRoleForRow(row);
  if (selectorRole) return kindredSlotMatchesSelectorOutputRole(slot, row);

  const role = String(slot.role || "effect").toLowerCase();
  const hints = semanticRoleHintsForEffect(parsed);
  if (hints.has("projectile")) return role === "projectile";
  if (hints.has("impact")) return role === "impact";
  if (hints.has("cast")) return role === "cast";
  if (hints.has("persistent")) return role === "persistent";
  return role === "effect";
}

function sourceSkinAliasUniqueActionSlotResourceMatches(token, parsed, alias, kindredSlots = [], skinEffectAliasSourceIndex = new Map(), row = {}) {
  const actionKeys = listValue(row.actionKeys);
  const aliases = skinEffectAliasSourceIndex.get(token) || [];
  if (!actionKeys.length || !aliases.length || !kindredSlots.length) return [];

  const targetModels = new Set(aliases.map((item) => item.modelLabel).filter(Boolean));
  const byModel = new Map();
  for (const slot of kindredSlots) {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) continue;
    if (!slot.resourcePath || !slot.resourceStem) continue;
    if (String(slot.skinKind || "").toLowerCase() !== "default" && !targetModels.has(slot.modelLabel)) continue;
    if (!listValue(slot.actionKeys).length || !actionKeysOverlap(actionKeys, slot.actionKeys)) continue;
    if (!sourceSkinAliasSlotMatchesRuntimeRole(parsed, slot, row)) continue;

    const model = slot.modelLabel || slot.heroLabel || "";
    const rows = byModel.get(model) || [];
    rows.push(slot);
    byModel.set(model, rows);
  }
  if (!byModel.size) return [];

  const selected = [];
  for (const rows of byModel.values()) {
    const byPath = new Map();
    for (const slot of rows) {
      if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
    }
    if (byPath.size !== 1) return [];
    selected.push([...byPath.values()][0]);
  }
  return selected.sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function pfxHookTokenConfirmedKindredSlots(token, slots = [], pfxHookEffectTokenIndex = new Map()) {
  if (!token || !slots.length) return [];

  const confirmedPaths = new Set(
    (pfxHookEffectTokenIndex.get(token) || [])
      .map((row) => row.relativePath)
      .filter(Boolean),
  );
  if (!confirmedPaths.size) return [];

  const byPath = new Map();
  for (const slot of slots) {
    if (!slot.resourcePath || !confirmedPaths.has(slot.resourcePath)) return [];
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function linkedPfxHookVariantSetResourceMatches(
  token,
  row = {},
  pfxHookEffectTokenIndex = new Map(),
  kindredSlotsByResourcePath = new Map(),
  heroNameRows = [],
) {
  const pfxRows = pfxHookEffectTokenIndex.get(token) || [];
  const pfxRowsByPath = new Map();
  for (const pfxRow of pfxRows) {
    if (!pfxRow.relativePath || pfxRowsByPath.has(pfxRow.relativePath)) continue;
    pfxRowsByPath.set(pfxRow.relativePath, pfxRow);
  }
  if (pfxRowsByPath.size < 2) return [];

  const parsedHero = heroNameRows.length ? parseEffectToken(token, heroNameRows).hero : "";
  const rowHeroNames = new Set([...listValue(row.heroNames), parsedHero].map(normalizedTerm).filter(Boolean));
  const rowResourceRoots = new Set(listValue(row.heroResourceRoots).map(normalizedTerm).filter(Boolean));
  const slotsByModel = new Map();
  const matches = [];

  for (const resourcePath of pfxRowsByPath.keys()) {
    const pathSlots = (kindredSlotsByResourcePath.get(resourcePath) || []).filter((slot) => {
      if (rowHeroNames.size && !rowHeroNames.has(normalizedTerm(slot.heroLabel))) return false;
      const root = normalizedTerm(kindredSlotResourceRoot(slot));
      return !rowResourceRoots.size || !root || rowResourceRoots.has(root);
    });
    if (!pathSlots.length) return [];

    for (const slot of pathSlots) {
      if (!slot.modelLabel) return [];
      const existingPath = slotsByModel.get(slot.modelLabel);
      if (existingPath && existingPath !== resourcePath) return [];
      slotsByModel.set(slot.modelLabel, resourcePath);
      matches.push(slot);
    }
  }

  if (slotsByModel.size < 2) return [];
  if (!matches.some((slot) => String(slot.skinKind || "").toLowerCase() === "default")) return [];
  const matchedPaths = new Set(matches.map((slot) => slot.resourcePath).filter(Boolean));
  if (matchedPaths.size !== pfxRowsByPath.size) return [];

  return matches.sort(
    (left, right) =>
      String(left.resourcePath).localeCompare(String(right.resourcePath)) ||
      String(left.modelLabel).localeCompare(String(right.modelLabel)),
  );
}

function kindredConfirmedWeakResourceMatches(alias, kindredSlots = [], row = {}) {
  if (alias.evidenceStrength !== "weak" || alias.matches.length !== 1 || !kindredSlots.length) return [];
  const candidatePath = alias.matches[0].relativePath;
  const rowActionKeys = listValue(row.actionKeys);
  const matches = kindredSlots.filter((slot) => {
    if (slot.resourcePath !== candidatePath) return false;
    const slotActionKeys = listValue(slot.actionKeys);
    if (!rowActionKeys.length || !slotActionKeys.length) return true;
    return actionKeysOverlap(rowActionKeys, slotActionKeys);
  });
  if (!matches.length) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function kindredExactSuffixResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const effectKey = compactTerm(parsed?.effectName);
  if (!hero || effectKey.length < 4 || !kindredSlots.length) return [];

  let matches = kindredSlots.filter((slot) => {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) return false;
    if (!slot.resourcePath || !slot.resourceStem) return false;
    if (!compactTerm(slot.resourceStem).endsWith(effectKey)) return false;
    const root = kindredSlotResourceRoot(slot);
    return !root || !alias.resourceRoots?.length || alias.resourceRoots.includes(root) || alias.resourceRoots.includes(hero);
  });
  if (!matches.length) return [];

  matches = matches.filter((slot) => actionKeysOverlap(row.actionKeys, slot.actionKeys));
  if (!matches.length) return [];

  const rowActionKeys = listValue(row.actionKeys);
  if (!rowActionKeys.length && new Set(matches.map(kindredSlotActionSignature)).size > 1) return [];

  const byPath = new Map();
  for (const slot of matches) {
    if (!byPath.has(slot.resourcePath)) byPath.set(slot.resourcePath, slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function kindredTerminalTermResourceMatches(parsed, alias, kindredSlots = [], row = {}) {
  const hero = parsed?.hero || "";
  const tokenTerms = kindredSemanticBaseTermsForEffect(parsed).filter((term) => term.length > 1);
  const terminalTerm = tokenTerms[tokenTerms.length - 1] || "";
  if (!hero || terminalTerm.length < 4 || tokenTerms.length < 2 || !kindredSlots.length) return [];

  const anchorTerms = tokenTerms.slice(0, -1);
  const rowActionKeys = listValue(row.actionKeys);
  const scored = [];
  for (const slot of kindredSlots) {
    if (!kindredSlotMatchesResolvedHero(slot, parsed, alias)) continue;
    if (!slot.resourcePath || !slot.resourceStem) continue;
    if (!actionKeysOverlap(row.actionKeys, slot.actionKeys)) continue;
    const root = kindredSlotResourceRoot(slot);
    if (root && alias.resourceRoots?.length && !alias.resourceRoots.includes(root) && !alias.resourceRoots.includes(hero)) continue;

    const slotTerms = kindredSemanticBaseTermsForSlot(slot, parsed);
    if (!termsContainRelatedTerm(slotTerms, terminalTerm)) continue;
    const anchorOverlaps = anchorTerms.filter((term) => termsContainRelatedTerm(slotTerms, term));
    if (!anchorOverlaps.length) continue;
    scored.push({
      slot,
      score: 5 + anchorOverlaps.length * 2 + semanticRoleScore(tokenTerms, slot),
      signature: effectTermKey([terminalTerm, ...anchorOverlaps]),
    });
  }
  if (!scored.length) return [];
  if (!rowActionKeys.length && new Set(scored.map((entry) => kindredSlotActionSignature(entry.slot))).size > 1) return [];

  scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.signature.localeCompare(right.signature) ||
      left.slot.resourcePath.localeCompare(right.slot.resourcePath),
  );
  const bestScore = scored[0].score;
  const bestSignature = scored[0].signature;
  const byPath = new Map();
  for (const entry of scored.filter((item) => item.score === bestScore && item.signature === bestSignature)) {
    if (!byPath.has(entry.slot.resourcePath)) byPath.set(entry.slot.resourcePath, entry.slot);
  }
  return [...byPath.values()].sort((left, right) => String(left.resourcePath).localeCompare(String(right.resourcePath)));
}

function buildEffectResourceResolver({
  effectRows = [],
  pfxResourceRows = [],
  shadergraphRows = [],
  heroNameRows = [],
  definitionRows = [],
  visualBindingRows = [],
  kindredSlots = [],
  skinEffectAliasItems = [],
} = {}) {
  if (!effectRows.length && !kindredSlots.length && !pfxResourceRows.length && !shadergraphRows.length) return null;
  const visualPathIndex = buildVisualPathIdentifierIndex(visualBindingRows);
  const pfxHookEffectTokenIndex = buildPfxHookEffectTokenIndex(pfxResourceRows);
  const pfxLinkedHookEffectTokenIndex = buildPfxLinkedHookEffectTokenIndex(pfxResourceRows);
  const effectResourceRootIndex = buildEffectResourceRootIndex(effectRows);
  const effectRowByPath = new Map(effectRows.map((row) => [row.relativePath, row]));
  const shadergraphGroupIndex = buildShadergraphGroupIndex(shadergraphRows);
  const skinEffectAliasSourceIndex = buildSkinEffectAliasSourceIndex(skinEffectAliasItems);
  const kindredSlotsByResourcePath = buildKindredSlotsByResourcePath(kindredSlots);
  return (token, row = {}) => {
    if (!/^Effect_/.test(token || "")) return null;
    const exact = resourceMatchesForToken(token, effectRows);
    if (exact.matches.length && ["exact-basename", "compact-basename"].includes(exact.matchKind)) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: exact.matchKind,
        resourceEvidenceSource: exact.matchKind === "exact-basename" ? "effect-resource-exact" : "effect-resource-compact",
        resourcePaths: exact.matches.map((match) => match.relativePath),
        resourceVariants: [],
      };
    }

    const pfxHookMatches = uniquePfxHookEffectTokenResourceMatches(token, pfxHookEffectTokenIndex);
    if (pfxHookMatches.length) {
      const resourcePaths = pfxHookMatches.map((match) => match.relativePath);
      const parsedForSkinVariants = heroNameRows.length ? parseEffectToken(token, heroNameRows) : {};
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "unique-pfx-hook-effect-token",
        resourceEvidenceSource: "effect-pfx-hook-token",
        resourcePaths,
        resourceRoots: uniq(pfxHookMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: skinEffectAliasResourceVariantsForPaths(
          token,
          resourcePaths,
          effectRows,
          skinEffectAliasSourceIndex,
          parsedForSkinVariants,
          heroNameRows,
          definitionRows,
        ),
      };
    }

    const pfxHookChannelSiblingMatches = uniquePfxHookChannelSiblingResourceMatches(
      token,
      pfxLinkedHookEffectTokenIndex,
      effectRows,
      pfxResourceRows,
    );
    if (pfxHookChannelSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "unique-pfx-hook-effect-token-channel-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-sibling",
        resourcePaths: pfxHookChannelSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookChannelSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const pfxHookAltSiblingMatches = uniquePfxHookAltSiblingResourceMatches(token, pfxHookEffectTokenIndex, effectRows, pfxResourceRows);
    if (pfxHookAltSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "unique-pfx-hook-effect-token-alt-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-alt-sibling",
        resourcePaths: pfxHookAltSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookAltSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const pfxHookSuffixSiblingMatches = uniquePfxHookSuffixSiblingResourceMatches(token, pfxHookEffectTokenIndex, effectRows, pfxResourceRows);
    if (pfxHookSuffixSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "unique-pfx-hook-effect-token-suffix-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-suffix-sibling",
        resourcePaths: pfxHookSuffixSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookSuffixSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const linkedPfxProcSiblingMatches = uniqueLinkedPfxHookProcSiblingResourceMatches(
      token,
      pfxLinkedHookEffectTokenIndex,
      effectRows,
      pfxResourceRows,
      row,
    );
    if (linkedPfxProcSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "linked-pfx-hook-effect-token-proc-sibling",
        resourceEvidenceSource: "effect-pfx-linked-hook-token-proc-sibling",
        resourcePaths: linkedPfxProcSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(linkedPfxProcSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const pfxHookSideSiblingMatches = uniquePfxHookSideSiblingResourceMatches(token, pfxHookEffectTokenIndex, effectRows, pfxResourceRows);
    if (pfxHookSideSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "unique-pfx-hook-effect-token-side-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-side-sibling",
        resourcePaths: pfxHookSideSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookSideSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const pfxHookItemSideRingSiblingMatches = uniquePfxHookItemSideRingSiblingResourceMatches(
      token,
      pfxHookEffectTokenIndex,
      effectRows,
      pfxResourceRows,
    );
    if (pfxHookItemSideRingSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "paired-item-side-ring-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-item-side-sibling",
        resourcePaths: pfxHookItemSideRingSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookItemSideRingSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const itemSideRingSiblingMatches = uniqueItemSideRingSiblingResourceMatches(token, effectRows, pfxResourceRows);
    if (itemSideRingSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "paired-item-side-ring-resource",
        resourceEvidenceSource: "effect-resource-item-side-ring-sibling",
        resourcePaths: itemSideRingSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(itemSideRingSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const itemVisualBoneMatches = uniqueItemVisualBoneResourceMatches(token, effectRows, pfxResourceRows, row);
    if (itemVisualBoneMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "unique-item-visual-bone-resource",
        resourceEvidenceSource: "effect-resource-item-visual",
        resourcePaths: itemVisualBoneMatches.map((match) => match.relativePath),
        resourceRoots: uniq(itemVisualBoneMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const globalEffectTermMatches = uniqueGlobalEffectTermResourceMatches(token, effectRows, row);
    if (globalEffectTermMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "unique-global-effect-term-resource",
        resourceEvidenceSource: "effect-resource-global-terms",
        resourcePaths: globalEffectTermMatches.map((match) => match.relativePath),
        resourceRoots: uniq(globalEffectTermMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const nativeNearbyGlobalCandidateMatches = nativeNearbyExactGlobalCandidateResourceMatches(token, effectRows, row);
    if (nativeNearbyGlobalCandidateMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-nearby-effect-exact-global-candidate",
        resourceEvidenceSource: "native-nearby-effect-resource",
        resourcePaths: nativeNearbyGlobalCandidateMatches.map((match) => match.relativePath),
        resourceRoots: uniq(nativeNearbyGlobalCandidateMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const nativeNearbyTermGlobalCandidateMatches = nativeNearbyTermGlobalCandidateResourceMatches(token, effectRows, row);
    if (nativeNearbyTermGlobalCandidateMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-nearby-effect-term-global-candidate",
        resourceEvidenceSource: "native-nearby-effect-resource",
        resourcePaths: nativeNearbyTermGlobalCandidateMatches.map((match) => match.relativePath),
        resourceRoots: uniq(nativeNearbyTermGlobalCandidateMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const pfxHookSelectorSiblingMatches = uniquePfxHookSelectorSiblingResourceMatches(token, row, pfxLinkedHookEffectTokenIndex, heroNameRows);
    if (pfxHookSelectorSiblingMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "confirmed",
        resourceMatchKind: "selector-output-pfx-hook-sibling",
        resourceEvidenceSource: "effect-pfx-hook-token-selector-sibling",
        resourcePaths: pfxHookSelectorSiblingMatches.map((match) => match.relativePath),
        resourceRoots: uniq(pfxHookSelectorSiblingMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const singletonRootMatches = uniqueSingletonEffectRootResourceMatches(token, effectResourceRootIndex, definitionRows);
    if (singletonRootMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "singleton-effect-root",
        resourceEvidenceSource: "effect-resource-singleton-root",
        resourcePaths: singletonRootMatches.map((match) => match.relativePath),
        resourceRoots: uniq(singletonRootMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const mapMode5v5Matches = mapMode5v5ResourceMatches(token, effectRows);
    if (mapMode5v5Matches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "map-mode-5v5-entity-semantic",
        resourceEvidenceSource: "effect-resource-5v5-entity",
        resourcePaths: mapMode5v5Matches.map((match) => match.relativePath),
        resourceRoots: uniq(mapMode5v5Matches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const defaultAttack1ImpactMatches = defaultAttack1ImpactResourceMatches(token, effectRows, row);
    if (defaultAttack1ImpactMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "default-attack1-impact-alias",
        resourceEvidenceSource: "effect-resource-attack1-alias",
        resourcePaths: defaultAttack1ImpactMatches.map((match) => match.relativePath),
        resourceRoots: uniq(defaultAttack1ImpactMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const nativeActionAaMatches = nativeActionAaResourceMatches(token, effectRows, row);
    if (nativeActionAaMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-action-aa-alias",
        resourceEvidenceSource: "native-action-aa-resource",
        resourcePaths: nativeActionAaMatches.map((match) => match.relativePath),
        resourceRoots: uniq(nativeActionAaMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const nativeMinionSpawnMatches = uniqueNativeMinionSpawnResourceMatches(token, effectRows, row);
    if (nativeMinionSpawnMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-minion-spawn-explicit-alias",
        resourceEvidenceSource: "native-minion-spawn-resource",
        resourcePaths: nativeMinionSpawnMatches.map((match) => match.relativePath),
        resourceRoots: uniq(nativeMinionSpawnMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const nativeStatusEffectMatches = uniqueNativeStatusEffectResourceMatches(token, effectRows, row);
    if (nativeStatusEffectMatches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-status-effect-explicit-alias",
        resourceEvidenceSource: "native-status-effect-resource",
        resourcePaths: nativeStatusEffectMatches.map((match) => match.relativePath),
        resourceRoots: uniq(nativeStatusEffectMatches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    const genericHero000Matches = genericHero000EffectNameResourceMatches(token, effectRows);
    if (genericHero000Matches.length) {
      return {
        aliasStatus: "exact-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "hero000-generic-exact-basename",
        resourceEvidenceSource: "effect-resource-hero000-generic",
        resourcePaths: genericHero000Matches.map((match) => match.relativePath),
        resourceRoots: uniq(genericHero000Matches.map((match) => effectResourceRootFromPath(match.relativePath))),
        resourceVariants: [],
      };
    }

    if (!heroNameRows.length || !definitionRows.length) return null;
    const parsed = parseEffectToken(token, heroNameRows);
    const alias = matchHeroAliasResources(parsed, definitionRows, effectRows);
    const normalizedParsed = alias.normalizedParsed || parsed;
    const aliasMetadata = {
      heroCodes: alias.heroCodes || [],
      heroNames: normalizedParsed.hero ? [normalizedParsed.hero] : [],
      resourceRoots: alias.resourceRoots || [],
      resourceVariants: Array.isArray(row.resourceVariants) ? row.resourceVariants : [],
    };
    const exactShadergraphGroups = exactShadergraphGroupMatches(normalizedParsed, alias, shadergraphGroupIndex);
    if (!alias.matches.length && exactShadergraphGroups.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-shadergraph",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "exact-shadergraph-group",
        resourceEvidenceSource: "",
        resourcePaths: [],
        shadergraphMatchKind: "exact-shadergraph-group",
        shadergraphEvidenceSource: "effect-shadergraph-exact-group",
        shadergraphGroupPaths: exactShadergraphGroups.map((group) => group.groupPath),
        shadergraphPaths: uniq(exactShadergraphGroups.flatMap((group) => group.shadergraphPaths || [])),
      };
    }
    const skinEffectAliasMatches = skinEffectAliasResourceMatches(
      token,
      effectRows,
      skinEffectAliasSourceIndex,
      normalizedParsed,
      heroNameRows,
      definitionRows,
    );
    if (skinEffectAliasMatches.length) {
      const allDirectTokenMatches = skinEffectAliasMatches.every((entry) => ["exact-basename", "compact-basename"].includes(entry.matchKind));
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: allDirectTokenMatches ? "cff0-skin-effect-alias-exact-resource" : "cff0-skin-effect-alias-strong-resource",
        resourceEvidenceSource: "cff0-skin-effect-alias",
        resourcePaths: uniq(skinEffectAliasMatches.map((entry) => entry.match.relativePath)),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...skinEffectAliasMatches.map((entry) => effectResourceRootFromPath(entry.match.relativePath))]),
        resourceVariants: skinEffectAliasMatches.map((entry) => entry.resourceVariant),
      };
    }
    const nativeBuffPfxMatches = nativeBuffSemanticPfxResourceMatches(normalizedParsed, alias, pfxResourceRows, effectRowByPath, row, heroNameRows);
    if (nativeBuffPfxMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "native-buff-pfx-hook-semantic",
        resourceEvidenceSource: "native-buff-pfx-hook-resource",
        resourcePaths: nativeBuffPfxMatches.map((match) => match.relativePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...nativeBuffPfxMatches.map((match) => effectResourceRootFromPath(match.relativePath))]),
      };
    }
    const pathIdentifierMatches = pathIdentifierResourceMatches(parsed, alias, effectRows, visualPathIndex);
    if (pathIdentifierMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "hero-code-native-path-variable",
        resourceEvidenceSource: "native-path-variable-resource",
        resourcePaths: pathIdentifierMatches.map((match) => match.relativePath),
      };
    }
    const deferDirectAliasForSelector = rowHasSelectorRuntimeFilter(row);
    if (alias.matches.length && isDirectStrongAliasMatch(alias) && !deferDirectAliasForSelector) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: alias.matchKind,
        resourceEvidenceSource: "effect-resource-hero-alias",
        resourcePaths: alias.matches.map((match) => match.relativePath),
      };
    }
    const entityBasenameMatches =
      aliasMetadata.heroCodes.length || aliasMetadata.resourceRoots.length ? [] : entityBasenameSemanticResourceMatches(normalizedParsed, effectRows);
    if (entityBasenameMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "entity-basename-semantic-alias",
        resourceEvidenceSource: "effect-resource-entity-basename",
        resourcePaths: entityBasenameMatches.map((match) => match.relativePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...entityBasenameMatches.map((match) => effectResourceRootFromPath(match.relativePath))]),
      };
    }
    const globalKindredMatches = canUseGlobalKindredAlias(normalizedParsed, aliasMetadata)
      ? globalKindredSemanticResourceMatches(normalizedParsed, kindredSlots, row)
      : [];
    if (globalKindredMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-global-effect-semantic-alias",
        resourceEvidenceSource: "kindred-global-effect-resource-slot",
        resourcePaths: globalKindredMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...globalKindredMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: globalKindredMatches.map(kindredResourceVariant),
      };
    }
    const scopedEntityMatches = scopedEntitySemanticResourceMatches(normalizedParsed, aliasMetadata, effectRows, row);
    if (scopedEntityMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "scoped-entity-semantic-resource",
        resourceEvidenceSource: "effect-resource-scoped-entity",
        resourcePaths: scopedEntityMatches.map((match) => match.relativePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...scopedEntityMatches.map((match) => effectResourceRootFromPath(match.relativePath))]),
      };
    }
    const placeholderGenericKindredMatches = placeholderGenericKindredSelectorResourceMatches(
      normalizedParsed,
      alias,
      kindredSlots,
      row,
      definitionRows,
    );
    if (placeholderGenericKindredMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-placeholder-generic-selector-output-role",
        resourceEvidenceSource: "kindred-global-effect-resource-slot",
        resourcePaths: placeholderGenericKindredMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...placeholderGenericKindredMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: placeholderGenericKindredMatches.map(kindredResourceVariant),
      };
    }
    const placeholderGenericSemanticActionMatches = placeholderGenericKindredSemanticActionResourceMatches(
      normalizedParsed,
      alias,
      kindredSlots,
      row,
      definitionRows,
    );
    if (placeholderGenericSemanticActionMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-placeholder-generic-semantic-action",
        resourceEvidenceSource: "kindred-global-effect-resource-slot",
        resourcePaths: placeholderGenericSemanticActionMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...placeholderGenericSemanticActionMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: placeholderGenericSemanticActionMatches.map(kindredResourceVariant),
      };
    }
    const placeholderGenericSemanticMatches = placeholderGenericKindredSemanticResourceMatches(
      normalizedParsed,
      alias,
      kindredSlots,
      row,
      definitionRows,
    );
    if (placeholderGenericSemanticMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-placeholder-generic-semantic",
        resourceEvidenceSource: "kindred-global-effect-resource-slot",
        resourcePaths: placeholderGenericSemanticMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...placeholderGenericSemanticMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: placeholderGenericSemanticMatches.map(kindredResourceVariant),
      };
    }
    const reorderedTermMatches = reorderedEffectTermResourceMatches(normalizedParsed, alias, effectRows, row);
    if (reorderedTermMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "hero-code-reordered-effect-terms",
        resourceEvidenceSource: "native-reordered-effect-terms-resource",
        resourcePaths: reorderedTermMatches.map((match) => match.relativePath),
      };
    }
    const sideBoneMatches = sideBoneResourceMatches(parsed, alias, effectRows, row);
    if (sideBoneMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "hero-code-native-side-bone",
        resourceEvidenceSource: "native-side-bone-resource",
        resourcePaths: sideBoneMatches.map((match) => match.relativePath),
      };
    }
    if (alias.matches.length && alias.evidenceStrength === "strong" && !deferDirectAliasForSelector) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: alias.matchKind,
        resourceEvidenceSource: "effect-resource-hero-alias",
        resourcePaths: alias.matches.map((match) => match.relativePath),
      };
    }
    const nativeActionMatches = nativeActionEffectAliasResourceMatches(normalizedParsed, alias, effectRows, row);
    if (nativeActionMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "hero-code-native-action-effect-alias",
        resourceEvidenceSource: "native-action-effect-alias-resource",
        resourcePaths: nativeActionMatches.map((match) => match.relativePath),
      };
    }
    const kindredNativeActionAaMatches = kindredNativeActionAaResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNativeActionAaMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-native-action-aa",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNativeActionAaMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNativeActionAaMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNativeActionAaMatches.map(kindredResourceVariant),
      };
    }
    const kindredSelectorIntentMatches = kindredSelectorOutputIntentResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredSelectorIntentMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-selector-output-intent",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredSelectorIntentMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredSelectorIntentMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredSelectorIntentMatches.map(kindredResourceVariant),
      };
    }
    const kindredSelectorRoleMatches = kindredSelectorOutputRoleResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredSelectorRoleMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-selector-output-role",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredSelectorRoleMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredSelectorRoleMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredSelectorRoleMatches.map(kindredResourceVariant),
      };
    }
    if (alias.matches.length && alias.evidenceStrength === "strong") {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: alias.matchKind,
        resourceEvidenceSource: "effect-resource-hero-alias",
        resourcePaths: alias.matches.map((match) => match.relativePath),
      };
    }
    const kindredMatches = kindredExactSuffixResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-exact-suffix",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredMatches.map(kindredResourceVariant),
      };
    }
    const kindredNativeStringLabelMatches = kindredNativeStringLabelResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNativeStringLabelMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-native-string-label",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNativeStringLabelMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNativeStringLabelMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNativeStringLabelMatches.map(kindredResourceVariant),
      };
    }
    const kindredSidePairMatches = kindredSidePairSemanticResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredSidePairMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-side-pair-semantic-alias",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredSidePairMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredSidePairMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredSidePairMatches.map(kindredResourceVariant),
      };
    }
    const kindredBareActionMatches = kindredBareActionResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredBareActionMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-bare-action",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredBareActionMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredBareActionMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredBareActionMatches.map(kindredResourceVariant),
      };
    }
    const kindredBareActionChannelMatches = kindredBareActionChannelResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredBareActionChannelMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-bare-action-channel",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredBareActionChannelMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredBareActionChannelMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredBareActionChannelMatches.map(kindredResourceVariant),
      };
    }
    const kindredActionlessWeakMatches = kindredActionlessWeakCandidateResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredActionlessWeakMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-actionless-weak-candidate",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredActionlessWeakMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredActionlessWeakMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredActionlessWeakMatches.map(kindredResourceVariant),
      };
    }
    const kindredActionlessTerminalStateMatches = kindredActionlessTerminalStateResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredActionlessTerminalStateMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-actionless-terminal-state-candidate",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredActionlessTerminalStateMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredActionlessTerminalStateMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredActionlessTerminalStateMatches.map(kindredResourceVariant),
      };
    }
    const kindredDefaultAttackVariantImpactMatches = kindredDefaultAttackVariantImpactResourceMatches(normalizedParsed, alias, kindredSlots);
    if (kindredDefaultAttackVariantImpactMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-default-attack-variant-impact",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredDefaultAttackVariantImpactMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredDefaultAttackVariantImpactMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredDefaultAttackVariantImpactMatches.map(kindredResourceVariant),
      };
    }
    const kindredModeSuffixBaseMatches = kindredModeSuffixBaseResourceMatches(normalizedParsed, alias, kindredSlots);
    if (kindredModeSuffixBaseMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-mode-suffix-base-effect",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredModeSuffixBaseMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredModeSuffixBaseMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredModeSuffixBaseMatches.map(kindredResourceVariant),
      };
    }
    const sourceSkinAliasActionSlotMatches = sourceSkinAliasActionSlotResourceMatches(
      token,
      normalizedParsed,
      alias,
      kindredSlots,
      skinEffectAliasSourceIndex,
      row,
    );
    if (sourceSkinAliasActionSlotMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "cff0-source-effect-alias-action-slot",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: sourceSkinAliasActionSlotMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...sourceSkinAliasActionSlotMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: sourceSkinAliasActionSlotMatches.map(kindredResourceVariant),
      };
    }
    const sourceSkinAliasUniqueActionSlotMatches = sourceSkinAliasUniqueActionSlotResourceMatches(
      token,
      normalizedParsed,
      alias,
      kindredSlots,
      skinEffectAliasSourceIndex,
      row,
    );
    if (sourceSkinAliasUniqueActionSlotMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "cff0-source-effect-alias-unique-action-slot",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: sourceSkinAliasUniqueActionSlotMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...sourceSkinAliasUniqueActionSlotMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: sourceSkinAliasUniqueActionSlotMatches.map(kindredResourceVariant),
      };
    }
    const kindredSemanticMatches = kindredSemanticAliasResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredSemanticMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-semantic-alias",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredSemanticMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredSemanticMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredSemanticMatches.map(kindredResourceVariant),
      };
    }
    const kindredVisualBeamProjectileMatches = kindredVisualBeamProjectileResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredVisualBeamProjectileMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-visual-beam-projectile",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredVisualBeamProjectileMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredVisualBeamProjectileMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredVisualBeamProjectileMatches.map(kindredResourceVariant),
      };
    }
    const kindredNativeStartCastMatches = kindredNativeStartCastResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNativeStartCastMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-native-start-cast",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNativeStartCastMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNativeStartCastMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNativeStartCastMatches.map(kindredResourceVariant),
      };
    }
    const kindredNativeNearbyChargingMatches = kindredNativeNearbyChargingResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNativeNearbyChargingMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-native-nearby-charging",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNativeNearbyChargingMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNativeNearbyChargingMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNativeNearbyChargingMatches.map(kindredResourceVariant),
      };
    }
    const kindredNativeScaledGroundRingMatches = kindredNativeScaledGroundRingResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNativeScaledGroundRingMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-native-scaled-ground-ring",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNativeScaledGroundRingMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNativeScaledGroundRingMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNativeScaledGroundRingMatches.map(kindredResourceVariant),
      };
    }
    const kindredNumberedStatusMatches = kindredNumberedStatusResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredNumberedStatusMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-numbered-status",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredNumberedStatusMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredNumberedStatusMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredNumberedStatusMatches.map(kindredResourceVariant),
      };
    }
    const kindredBaseActionProjectileMatches = kindredBaseActionProjectileResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredBaseActionProjectileMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-base-action-projectile",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredBaseActionProjectileMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredBaseActionProjectileMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredBaseActionProjectileMatches.map(kindredResourceVariant),
      };
    }
    const kindredUniqueActionMatches = kindredUniqueActionResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredUniqueActionMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-unique-action",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredUniqueActionMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredUniqueActionMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredUniqueActionMatches.map(kindredResourceVariant),
      };
    }
    const selectorRoleSingleMatches = selectorRoleSingleResourceMatches(normalizedParsed, alias, row);
    if (selectorRoleSingleMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "selector-role-single-resource-candidate",
        resourceEvidenceSource: "native-selector-output-role-resource",
        resourcePaths: selectorRoleSingleMatches.map((match) => match.relativePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...selectorRoleSingleMatches.map((match) => effectResourceRootFromPath(match.relativePath))]),
      };
    }
    const kindredConfirmedWeakMatches = kindredConfirmedWeakResourceMatches(alias, kindredSlots, row);
    if (kindredConfirmedWeakMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-weak-candidate-confirmed",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredConfirmedWeakMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredConfirmedWeakMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredConfirmedWeakMatches.map(kindredResourceVariant),
      };
    }
    const kindredTerminalMatches = kindredTerminalTermResourceMatches(normalizedParsed, alias, kindredSlots, row);
    if (kindredTerminalMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-terminal-term",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredTerminalMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredTerminalMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredTerminalMatches.map(kindredResourceVariant),
      };
    }
    const kindredScoredCandidateMatches = kindredUniqueScoredCandidateMatches(token, normalizedParsed, alias, kindredSlots, row);
    if (kindredScoredCandidateMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "kindred-effect-slot-unique-scored-candidate",
        resourceEvidenceSource: "kindred-effect-resource-slot",
        resourcePaths: kindredScoredCandidateMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...kindredScoredCandidateMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: kindredScoredCandidateMatches.map(kindredResourceVariant),
      };
    }
    const linkedPfxHookVariantSetMatches = linkedPfxHookVariantSetResourceMatches(
      token,
      row,
      pfxLinkedHookEffectTokenIndex,
      kindredSlotsByResourcePath,
      heroNameRows,
    );
    if (linkedPfxHookVariantSetMatches.length) {
      return {
        ...aliasMetadata,
        aliasStatus: "hero-alias-resource",
        aliasEvidenceStrength: "strong",
        resourceMatchKind: "linked-pfx-hook-token-variant-set",
        resourceEvidenceSource: "effect-pfx-hook-token-variant-set",
        resourcePaths: uniq(linkedPfxHookVariantSetMatches.map((slot) => slot.resourcePath)),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...linkedPfxHookVariantSetMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: linkedPfxHookVariantSetMatches.map(kindredResourceVariant),
      };
    }
    const sourceSkinAliasDefaultCandidateMatches = sourceSkinAliasDefaultCandidateResourceMatches(
      token,
      normalizedParsed,
      alias,
      kindredSlots,
      skinEffectAliasSourceIndex,
    );
    if (sourceSkinAliasDefaultCandidateMatches.length) {
      const pfxHookConfirmedDefaultCandidateMatches = pfxHookTokenConfirmedKindredSlots(
        token,
        sourceSkinAliasDefaultCandidateMatches,
        pfxLinkedHookEffectTokenIndex,
      );
      if (pfxHookConfirmedDefaultCandidateMatches.length) {
        return {
          ...aliasMetadata,
          aliasStatus: "hero-alias-resource",
          aliasEvidenceStrength: "strong",
          resourceMatchKind: "cff0-source-effect-alias-default-pfx-hook-token",
          resourceEvidenceSource: "effect-pfx-hook-token-confirmed-candidate",
          resourcePaths: pfxHookConfirmedDefaultCandidateMatches.map((slot) => slot.resourcePath),
          resourceRoots: uniq([...aliasMetadata.resourceRoots, ...pfxHookConfirmedDefaultCandidateMatches.map(kindredSlotResourceRoot)]),
          resourceVariants: pfxHookConfirmedDefaultCandidateMatches.map(kindredResourceVariant),
        };
      }

      return {
        ...aliasMetadata,
        aliasStatus: "resource-candidate",
        aliasEvidenceStrength: "weak",
        resourceMatchKind: "cff0-source-effect-alias-default-candidate",
        resourceEvidenceSource: "effect-resource-candidate",
        resourcePaths: sourceSkinAliasDefaultCandidateMatches.map((slot) => slot.resourcePath),
        resourceRoots: uniq([...aliasMetadata.resourceRoots, ...sourceSkinAliasDefaultCandidateMatches.map(kindredSlotResourceRoot)]),
        resourceVariants: sourceSkinAliasDefaultCandidateMatches.map(kindredResourceVariant),
      };
    }
    if (!alias.matches.length || alias.evidenceStrength === "none") {
      return {
        ...aliasMetadata,
        aliasStatus: "",
        aliasEvidenceStrength: "",
        resourceMatchKind: alias.matchKind === "none" ? "" : alias.matchKind,
        resourceEvidenceSource: "",
        resourcePaths: [],
      };
    }
    return {
      ...aliasMetadata,
      aliasStatus: alias.evidenceStrength === "strong" ? "hero-alias-resource" : "resource-candidate",
      aliasEvidenceStrength: alias.evidenceStrength,
      resourceMatchKind: alias.matchKind,
      resourceEvidenceSource: alias.evidenceStrength === "strong" ? "effect-resource-hero-alias" : "effect-resource-candidate",
      resourcePaths: alias.matches.map((match) => match.relativePath),
    };
  };
}

function nativeBuilderEvidenceSourceForRow(row = {}) {
  return row.resourceEvidenceSource || "native-effect-hook-builder";
}

function shouldPromoteNativeBuilderSingleResource(row = {}, existingPaths = []) {
  if (existingPaths.length !== 1) return false;
  if (nativeBuilderEvidenceSourceForRow(row) !== "native-effect-hook-builder") return false;
  if (row.aliasEvidenceStrength && row.aliasEvidenceStrength !== "weak") return false;
  return true;
}

function shouldRecheckExistingResourceCandidate(row = {}, existingPaths = []) {
  if (!existingPaths.length) return false;
  if (["confirmed", "strong"].includes(row.aliasEvidenceStrength)) return false;
  const evidenceSource = nativeBuilderEvidenceSourceForRow(row);
  return row.aliasEvidenceStrength === "weak" || evidenceSource === "effect-resource-candidate";
}

function hasStrongResolvedResources(resolved = null) {
  return resolved?.resourcePaths?.length && ["confirmed", "strong"].includes(resolved.aliasEvidenceStrength);
}

function bindingResourcesFromResolved(row = {}, resolved = {}) {
  return {
    aliasStatus: resolved.aliasStatus || row.aliasStatus,
    aliasEvidenceStrength: resolved.aliasEvidenceStrength || row.aliasEvidenceStrength,
    resourceMatchKind: resolved.resourceMatchKind || "",
    resourceEvidenceSource: resolved.resourceEvidenceSource || "",
    resourcePaths: resolved.resourcePaths || [],
    shadergraphMatchKind: resolved.shadergraphMatchKind || "",
    shadergraphEvidenceSource: resolved.shadergraphEvidenceSource || "",
    shadergraphGroupPaths: resolved.shadergraphGroupPaths || [],
    shadergraphPaths: resolved.shadergraphPaths || [],
    heroCodes: resolved.heroCodes || [],
    heroNames: resolved.heroNames || [],
    resourceRoots: resolved.resourceRoots || [],
    resourceVariants: resolved.resourceVariants || [],
  };
}

function resolveBindingResources(row, options = {}) {
  const existingPaths = splitList(row.resourcePaths);
  const existingShadergraphPaths = splitList(row.shadergraphPaths);
  if (existingPaths.length) {
    if (shouldRecheckExistingResourceCandidate(row, existingPaths)) {
      const resolved = options.resourceResolver?.(row.effectToken || row.token, row);
      if (hasStrongResolvedResources(resolved)) return bindingResourcesFromResolved(row, resolved);
    }
    const promoteNativeBuilderResource = shouldPromoteNativeBuilderSingleResource(row, existingPaths);
    return {
      aliasStatus: promoteNativeBuilderResource ? "hero-alias-resource" : row.aliasStatus,
      aliasEvidenceStrength: promoteNativeBuilderResource ? "strong" : row.aliasEvidenceStrength,
      resourceMatchKind: promoteNativeBuilderResource ? "native-effect-hook-builder-single-resource" : row.resourceMatchKind || "",
      resourceEvidenceSource: nativeBuilderEvidenceSourceForRow(row),
      resourcePaths: existingPaths,
      shadergraphMatchKind: row.shadergraphMatchKind || "",
      shadergraphEvidenceSource: row.shadergraphEvidenceSource || "",
      shadergraphGroupPaths: splitList(row.shadergraphGroupPaths),
      shadergraphPaths: existingShadergraphPaths,
      heroCodes: [],
      heroNames: [],
      resourceRoots: existingPaths.map(effectResourceRootFromPath).filter(Boolean),
      resourceVariants: Array.isArray(row.resourceVariants) ? row.resourceVariants : [],
    };
  }

  const resolved = options.resourceResolver?.(row.effectToken || row.token, row);
  if (resolved) {
    return bindingResourcesFromResolved(row, resolved);
  }
  return {
    aliasStatus: row.aliasStatus,
    aliasEvidenceStrength: row.aliasEvidenceStrength,
    resourceMatchKind: "",
    resourceEvidenceSource: "",
    resourcePaths: [],
    shadergraphMatchKind: "",
    shadergraphEvidenceSource: "",
    shadergraphGroupPaths: existingShadergraphPaths.length ? splitList(row.shadergraphGroupPaths) : [],
    shadergraphPaths: existingShadergraphPaths,
    heroCodes: [],
    heroNames: [],
    resourceRoots: [],
    resourceVariants: [],
  };
}

function runtimeBindingForHook(row) {
  const selectedAttachmentSlotRaw = String(row.selectedAttachmentSlot ?? "").trim();
  const selectedAttachmentSlot = selectedAttachmentSlotRaw === "" ? null : Number(selectedAttachmentSlotRaw);
  const withEffectOptions = (binding) => {
    const effectOptionOffsets = listValue(row.effectOptionOffsets);
    const effectOptionFloatArgs = listValue(row.effectOptionFloatArgs);
    const effectOptionArgKinds = listValue(row.effectOptionArgKinds);
    const effectOptionArgSources = listValue(row.effectOptionArgSources);
    const effectOptions = row.effectOptions && typeof row.effectOptions === "object" ? row.effectOptions : null;
    if (
      !effectOptionOffsets.length &&
      !effectOptionFloatArgs.length &&
      !effectOptionArgKinds.length &&
      !effectOptionArgSources.length &&
      !effectOptions
    )
      return binding;
    return {
      ...binding,
      ...(effectOptionOffsets.length ? { effectOptionOffsets } : {}),
      ...(effectOptionFloatArgs.length ? { effectOptionFloatArgs } : {}),
      ...(effectOptionArgKinds.length ? { effectOptionArgKinds } : {}),
      ...(effectOptionArgSources.length ? { effectOptionArgSources } : {}),
      ...(effectOptions ? { effectOptions } : {}),
    };
  };

  if (row.boneToken) {
    return withEffectOptions({
      kind: "bone",
      boneToken: row.boneToken,
      evidence:
        row.bindKind === "visual-bone-effect"
          ? "native-visual-bone-token"
          : row.bindKind === "direct-locator-effect"
            ? "native-locator-token"
            : "native-bone-token",
    });
  }

  if (row.bindKind === "selected-attachment-effect") {
    return withEffectOptions({
      kind: "selected-attachment",
      boneToken: "",
      ...(Number.isInteger(selectedAttachmentSlot) ? { selectedAttachmentSlot } : {}),
      evidence: "native-selected-attachment-effect",
    });
  }

  if (row.bindKind === "effect-only") {
    return withEffectOptions({
      kind: "effect-channel",
      boneToken: "",
      evidence: "native-effect-only",
    });
  }

  return withEffectOptions({
    kind: "unknown",
    boneToken: "",
    evidence: "no-native-binding-target",
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

function formatTimelineSeconds(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : null;
}

function uniqNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((left, right) => left - right);
}

function timelineRowsForEffectHook(row, timelineRows = []) {
  const effectTokens = new Set(listValue([row.effectToken, row.token]));
  const actionKeys = listValue(row.actionKeys);
  const rows = [];
  const seen = new Set();
  for (const timelineRow of timelineRows || []) {
    if (timelineRow.eventKind && timelineRow.eventKind !== "effect") continue;
    if (!effectTokens.has(timelineRow.effectToken)) continue;
    if (!actionKeysOverlap(actionKeys, timelineRow.actionKeys)) continue;
    const key = [
      timelineRow.platform || "",
      timelineRow.sourceFile || "",
      timelineRow.functionName || "",
      timelineRow.line || "",
      timelineRow.effectToken || "",
      timelineRow.timeSeconds ?? "",
    ].join("\t");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(timelineRow);
  }
  return rows.sort((left, right) => Number(left.timeSeconds || 0) - Number(right.timeSeconds || 0));
}

function runtimeTimelineForHook(row, timelineRows = []) {
  const rows = timelineRowsForEffectHook(row, timelineRows);
  const times = uniqNumbers(rows.map((timelineRow) => formatTimelineSeconds(timelineRow.timeSeconds)));
  return {
    nativeTimelineEventCount: rows.length,
    nativeTimelineTimes: times,
    nativeTimelineSourceKinds: uniq(rows.map((timelineRow) => timelineRow.sourceKind || "native-runtime-effect")),
    runtimeStartSeconds: times.length ? times[0] : null,
  };
}

function timelineActionBackfillKey(row = {}) {
  const token = row.effectToken || row.token || "";
  const functionName = row.functionName || row.source?.functionName || "";
  const line = row.line || row.source?.line || "";
  if (!row.platform || !functionName || !line || !token) return "";
  return [row.platform, functionName, String(line), token].join("\t");
}

function backfillMissingTimelineActionKeys(rows = [], timelineRows = []) {
  const signaturesByKey = new Map();
  for (const timelineRow of timelineRows || []) {
    if (timelineRow.eventKind && timelineRow.eventKind !== "effect") continue;
    const signature = actionBackfillSignature(timelineRow.actionKeys);
    if (!signature) continue;
    const key = timelineActionBackfillKey(timelineRow);
    if (!key) continue;
    const signatures = signaturesByKey.get(key) || new Set();
    signatures.add(signature);
    signaturesByKey.set(key, signatures);
  }

  if (!signaturesByKey.size) return rows;
  return rows.map((row) => {
    if (listValue(row.actionKeys).length) return row;
    const key = timelineActionBackfillKey(row);
    const signatures = key ? signaturesByKey.get(key) : null;
    if (!signatures || signatures.size !== 1) return row;
    return {
      ...row,
      actionKeys: [...signatures][0].split("|").filter(Boolean),
    };
  });
}

function runtimeBindingWithTimeline(binding, timeline, row = {}) {
  if (timeline.runtimeStartSeconds === null) {
    const immediateVisualBinding = row.sourceKind === "native-visual-binding" && binding.kind === "bone";
    if (!boolString(row.setsVisibleOrActive) && !immediateVisualBinding) return binding;
    return {
      ...binding,
      runtimeStartSeconds: 0,
      startSeconds: 0,
      timelineTimes: [],
    };
  }
  return {
    ...binding,
    runtimeStartSeconds: timeline.runtimeStartSeconds,
    startSeconds: timeline.runtimeStartSeconds,
    timelineTimes: timeline.nativeTimelineTimes,
  };
}

function visualEffectTokens(row) {
  return splitList(row.stringSamples).filter((token) => /^Effect_/.test(token));
}

function visualBuffTokens(row) {
  return splitList(row.stringSamples).filter((token) => /^Buff_/.test(token));
}

function visualBoneTokens(row) {
  return splitList(row.boneNames).filter((token) => /^Bone_/.test(token));
}

function runtimeTokensFromText(text) {
  const tokens = [];
  const pattern = /"((?:Bone|Effect)_[^"]+)"/g;
  let match;
  while ((match = pattern.exec(text))) tokens.push(match[1]);
  return tokens;
}

function sourceRuntimeTokenLines(row) {
  const sourceFile = row?.sourceFile || "";
  if (!sourceFile || !fs.existsSync(sourceFile)) return [];
  const startLine = Number(row.startLine || row.line || 1);
  const endLine = Number(row.endLine || startLine);
  const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/);
  const sliceStart = Number.isFinite(startLine) && startLine > 0 ? startLine - 1 : 0;
  const sliceEnd = Number.isFinite(endLine) && endLine >= startLine ? endLine : startLine;
  return lines
    .slice(sliceStart, sliceEnd)
    .map(runtimeTokensFromText)
    .filter((tokens) => tokens.length);
}

function orderedVisualBoneEffectPairs(row) {
  return orderedVisualEffectBindings(row).filter((binding) => binding.boneToken);
}

function sourceEffectBindingKey(platform = "", functionName = "", effectToken = "") {
  if (!platform || !functionName || !effectToken) return "";
  return [platform, functionName, effectToken].join("\t");
}

function directEffectRowsBySourceKey(directRows = []) {
  const index = new Map();
  for (const row of directRows || []) {
    const key = sourceEffectBindingKey(row.platform || "", row.functionName || "", row.effectToken || row.token || "");
    if (!key) continue;
    const current = index.get(key);
    const hasOptions =
      listValue(row.effectOptionOffsets).length ||
      listValue(row.effectOptionFloatArgs).length ||
      listValue(row.effectOptionArgSources).length ||
      row.effectOptions;
    const currentHasOptions =
      current &&
      (listValue(current.effectOptionOffsets).length ||
        listValue(current.effectOptionFloatArgs).length ||
        listValue(current.effectOptionArgSources).length ||
        current.effectOptions);
    if (!current || (hasOptions && !currentHasOptions)) index.set(key, row);
  }
  return index;
}

function orderedVisualEffectBindings(row) {
  const boneTokens = visualBoneTokens(row);
  const effectTokens = visualEffectTokens(row);
  if (!boneTokens.length || !effectTokens.length) return [];

  const boneSet = new Set(boneTokens);
  const effectSet = new Set(effectTokens);
  const bindings = [];
  const seen = new Set();
  const addBinding = (boneToken, effectToken) => {
    const key = `${boneToken}\t${effectToken}`;
    if (seen.has(key)) return;
    seen.add(key);
    bindings.push({ boneToken, effectToken });
  };
  let activeBone = "";
  const sourceLineTokens = sourceRuntimeTokenLines(row);
  for (const lineTokens of sourceLineTokens) {
    const lineBones = lineTokens.filter((token) => boneSet.has(token));
    const lineEffects = lineTokens.filter((token) => effectSet.has(token));
    if (lineBones.length && lineEffects.length) {
      if (lineBones.length === lineEffects.length) {
        for (let index = 0; index < lineBones.length; index += 1) addBinding(lineBones[index], lineEffects[index]);
      } else if (lineBones.length === 1) {
        for (const effectToken of lineEffects) addBinding(lineBones[0], effectToken);
      } else if (lineEffects.length === 1) {
        for (const boneToken of lineBones) addBinding(boneToken, lineEffects[0]);
      }
      activeBone = lineBones[lineBones.length - 1];
      continue;
    }

    for (const token of lineTokens) {
      if (boneSet.has(token)) {
        activeBone = token;
        continue;
      }
      if (!effectSet.has(token)) continue;
      addBinding(activeBone, token);
    }
  }
  if (bindings.length || sourceLineTokens.length) return bindings;
  if (boneTokens.length === 1) return effectTokens.map((effectToken) => ({ boneToken: boneTokens[0], effectToken }));
  return [];
}

function visualBindingEffectRows(visualBindingRows = [], options = {}) {
  const rows = [];
  const seen = new Set();
  const preserveUnresolved = options.preserveUnresolvedVisualBindings !== false;
  const directEffectIndex = directEffectRowsBySourceKey(options.directEffectRows || []);
  for (const row of visualBindingRows || []) {
    if (!splitList(row.candidateStages).includes("ability-effect-bone-hook")) continue;

    for (const { boneToken, effectToken } of orderedVisualEffectBindings(row)) {
      const directEffectRow = directEffectIndex.get(sourceEffectBindingKey(row.platform || "", row.functionName || "", effectToken));
      const resolved = options.resourceResolver?.(effectToken, { ...row, token: effectToken, effectToken, boneToken });
      const hasStrongResource = resolved?.resourcePaths?.length && ["confirmed", "strong"].includes(resolved.aliasEvidenceStrength);
      const hasStrongShadergraph = resolved?.shadergraphPaths?.length && ["confirmed", "strong"].includes(resolved.aliasEvidenceStrength);
      if (!hasStrongResource && !hasStrongShadergraph && !preserveUnresolved) continue;

      const effectOptionOffsets = listValue(directEffectRow?.effectOptionOffsets);
      const effectOptionFloatArgs = listValue(directEffectRow?.effectOptionFloatArgs);
      const effectOptionArgKinds = listValue(directEffectRow?.effectOptionArgKinds);
      const effectOptionArgSources = listValue(directEffectRow?.effectOptionArgSources);
      const resourcePaths = hasStrongResource ? [...new Set(resolved.resourcePaths)].sort() : [];
      const shadergraphPaths = hasStrongShadergraph ? [...new Set(resolved.shadergraphPaths)].sort() : [];
      const bindKind = boneToken ? "visual-bone-effect" : "effect-only";
      const key = [row.platform, row.functionName, bindKind, effectToken, boneToken, resourcePaths.join("|"), shadergraphPaths.join("|")].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        platform: row.platform,
        token: effectToken,
        bindKind,
        boneToken,
        effectToken,
        hasCallback: "no",
        setsVisibleOrActive: boneToken ? "no" : "yes",
        setsEffectOption: effectOptionOffsets.length ? "yes" : "no",
        sourceFile: row.sourceFile,
        functionName: row.functionName,
        line: row.startLine,
        instanceIndex: rows.length + 1,
        hookPattern: "native-visual-binding-candidate",
        aliasStatus: hasStrongResource ? resolved.aliasStatus : "",
        aliasEvidenceStrength: hasStrongResource ? resolved.aliasEvidenceStrength : "",
        resourceMatchKind: hasStrongResource ? resolved.resourceMatchKind || "" : "",
        resourceEvidenceSource: hasStrongResource ? resolved.resourceEvidenceSource || "" : "",
        resourcePaths: resourcePaths.join("|"),
        resourceVariants: hasStrongResource && Array.isArray(resolved.resourceVariants) ? resolved.resourceVariants : [],
        shadergraphMatchKind: hasStrongShadergraph ? resolved.shadergraphMatchKind || "" : "",
        shadergraphEvidenceSource: hasStrongShadergraph ? resolved.shadergraphEvidenceSource || "" : "",
        shadergraphGroupPaths: hasStrongShadergraph ? [...new Set(resolved.shadergraphGroupPaths || [])].sort().join("|") : "",
        shadergraphPaths: shadergraphPaths.join("|"),
        buffTokens: visualBuffTokens(row).join("|"),
        stringSamples: row.stringSamples || "",
        nativeSemanticCalls: splitList(row.candidateStages).join("|"),
        sourceKind: "native-visual-binding",
        actionKeys: listValue(directEffectRow?.actionKeys),
        heroNames: listValue(directEffectRow?.heroNames),
        effectOptionOffsets,
        effectOptionFloatArgs,
        effectOptionArgKinds,
        effectOptionArgSources,
        effectOptions: directEffectRow?.effectOptions && typeof directEffectRow.effectOptions === "object" ? directEffectRow.effectOptions : null,
      });
    }
  }
  return rows;
}

function visualBindingCoverageKey(row = {}) {
  const token = row.effectToken || row.token || "";
  if (!row.platform || !row.functionName || !token) return "";
  return [row.platform, row.functionName, token].join("\t");
}

function preferVisualBindingsOverEffectOnly(rows = []) {
  const visualKeys = new Set(
    rows
      .filter(
        (row) =>
          row.sourceKind === "native-visual-binding" &&
          ((row.bindKind === "visual-bone-effect" && row.boneToken) || row.bindKind === "effect-only"),
      )
      .map(visualBindingCoverageKey)
      .filter(Boolean),
  );
  if (!visualKeys.size) return rows;

  return rows.filter((row) => {
    if (row.bindKind !== "effect-only" || row.boneToken) return true;
    if (row.sourceKind === "native-visual-binding") return true;
    const key = visualBindingCoverageKey(row);
    return !key || !visualKeys.has(key);
  });
}

function actionBackfillSignature(actionKeys = []) {
  return uniq(listValue(actionKeys)).join("|");
}

function actionBackfillKey(row = {}) {
  const token = row.effectToken || row.token || "";
  const heroNames = uniq(listValue(row.heroNames)).join("|");
  if (!token || !heroNames) return "";
  return [token, selectorOutputRoleForRow(row), selectorStateTermsForRow(row).join("|"), heroNames].join("\t");
}

function actionBackfillHeroTokenKey(row = {}) {
  const token = row.effectToken || row.token || "";
  const heroNames = uniq(listValue(row.heroNames)).join("|");
  if (!token || !heroNames) return "";
  return [token, heroNames].join("\t");
}

function actionBackfillDecodedHeroTokenKey(row = {}, heroNameRows = []) {
  const token = row.effectToken || row.token || "";
  if (!token || !heroNameRows.length) return "";
  const parsed = parseEffectToken(token, heroNameRows);
  if (!parsed?.hero) return "";
  return [token, parsed.hero].join("\t");
}

function actionBackfillHeroContextTerms(row = {}) {
  return uniq([
    ...listValue(row.heroNames),
    ...listValue(row.resourcePaths).map(effectResourceRootFromPath),
    ...listValue(row.shadergraphGroupPaths).map(effectResourceRootFromPath),
    ...listValue(row.shadergraphPaths).map(effectResourceRootFromPath),
  ]);
}

function sourceFunctionHeroActionBackfillKeys(row = {}) {
  const functionName = row.functionName || row.source?.functionName || "";
  const platform = row.platform || "";
  if (!platform || !functionName) return [];
  return actionBackfillHeroContextTerms(row).map((heroTerm) => [platform, functionName, heroTerm].join("\t"));
}

function sourceActionBackfillKey(row = {}) {
  const token = row.effectToken || row.token || "";
  const functionName = row.functionName || row.source?.functionName || "";
  const platform = row.platform || "";
  if (!platform || !functionName || !token) return "";
  return [platform, functionName, token, selectorOutputRoleForRow(row), selectorStateTermsForRow(row).join("|")].join("\t");
}

function actionBackfillKeys(row = {}, heroNameRows = []) {
  return [
    actionBackfillHeroTokenKey(row) ? `hero-token:${actionBackfillHeroTokenKey(row)}` : "",
    actionBackfillDecodedHeroTokenKey(row, heroNameRows) ? `decoded-hero-token:${actionBackfillDecodedHeroTokenKey(row, heroNameRows)}` : "",
    actionBackfillKey(row) ? `hero:${actionBackfillKey(row)}` : "",
    sourceActionBackfillKey(row) ? `source:${sourceActionBackfillKey(row)}` : "",
    ...sourceFunctionHeroActionBackfillKeys(row).map((key) => `source-function-hero:${key}`),
  ].filter(Boolean);
}

function backfillMissingActionKeys(rows = [], heroNameRows = []) {
  const signaturesByKey = new Map();
  for (const row of rows) {
    const signature = actionBackfillSignature(row.actionKeys);
    const keys = actionBackfillKeys(row, heroNameRows);
    if (!keys.length || !signature) continue;
    for (const key of keys) {
      const signatures = signaturesByKey.get(key) || new Set();
      signatures.add(signature);
      signaturesByKey.set(key, signatures);
    }
  }

  return rows.map((row) => {
    if (listValue(row.actionKeys).length) return row;
    const signatures = new Set();
    for (const key of actionBackfillKeys(row, heroNameRows)) {
      const keySignatures = signaturesByKey.get(key);
      if (!keySignatures || keySignatures.size !== 1) continue;
      signatures.add([...keySignatures][0]);
    }
    if (signatures.size !== 1) return row;
    return {
      ...row,
      actionKeys: [...signatures][0].split("|").filter(Boolean),
    };
  });
}

function selectorPairFunctionKey(item = {}) {
  const functionName = item.source?.functionName || item.functionName || "";
  if (!item.platform || !functionName) return "";
  return [item.platform, functionName].join("\t");
}

function selectorPairItemsCompatible(left = {}, right = {}) {
  const leftHeroes = listValue(left.heroNames);
  const rightHeroes = listValue(right.heroNames);
  if (leftHeroes.length && rightHeroes.length && !leftHeroes.some((hero) => rightHeroes.includes(hero))) return false;
  const leftStateTerms = selectorStateTermsForRow(left);
  const rightStateTerms = selectorStateTermsForRow(right);
  if (leftStateTerms.length && rightStateTerms.length && !leftStateTerms.some((term) => rightStateTerms.includes(term))) return false;
  return actionKeysOverlap(left.actionKeys, right.actionKeys);
}

function hero000ProjectileCompanionStemForImpactPath(impactPath = "") {
  const basename = effectBasename(impactPath);
  if (/^Hero000_Proj_Hit$/i.test(basename)) return "Hero000_Proj";
  return "";
}

function selectorPairProjectileCompanionSlots(impactPath = "", kindredSlots = []) {
  const companionStem = hero000ProjectileCompanionStemForImpactPath(impactPath);
  if (!companionStem) return [];
  return (kindredSlots || []).filter((slot) => {
    if (!isHero000GenericKindredSlot(slot)) return false;
    if (String(slot.role || "").toLowerCase() !== "projectile") return false;
    return String(slot.resourceStem || effectBasename(slot.resourcePath || "")) === companionStem;
  });
}

function selectorPairResourceTerms(relativePath = "") {
  return expandedSemanticTerms(effectTermParts(effectBasename(relativePath)));
}

const selectorPairProjectileRoleTerms = new Set(["projectile", "proj", "shot", "shots", "missile", "bullet", "arrow", "arrows", "fireball"]);
const selectorPairImpactRoleTerms = new Set(["impact", "hit", "explosion", "burst", "land", "landing", "landed"]);

function selectorPairCompanionBaseTerms(relativePath = "") {
  return effectTermParts(effectBasename(relativePath)).filter(
    (term) => !selectorPairProjectileRoleTerms.has(term) && !selectorPairImpactRoleTerms.has(term),
  );
}

function selectorPairPathLooksProjectile(relativePath = "") {
  const terms = selectorPairResourceTerms(relativePath);
  const hasProjectile = [...selectorPairProjectileRoleTerms].some((term) => terms.has(term));
  const hasImpact = [...selectorPairImpactRoleTerms].some((term) => terms.has(term));
  return hasProjectile && !hasImpact;
}

function selectorPairProjectileSiblingRowsForImpactPath(impactPath = "", effectRows = []) {
  if (!impactPath || !effectRows.length) return [];
  const impactTerms = selectorPairResourceTerms(impactPath);
  if (![...selectorPairImpactRoleTerms].some((term) => impactTerms.has(term))) return [];

  const impactRoot = effectResourceRootFromPath(impactPath);
  const impactBaseSignature = effectTermKey(selectorPairCompanionBaseTerms(impactPath));
  if (!impactRoot || !impactBaseSignature) return [];

  const byPath = new Map();
  for (const row of effectRows) {
    const relativePath = row.relativePath || "";
    if (!relativePath || relativePath === impactPath) continue;
    if (effectResourceRootFromPath(relativePath) !== impactRoot) continue;
    if (!selectorPairPathLooksProjectile(relativePath)) continue;
    if (effectTermKey(selectorPairCompanionBaseTerms(relativePath)) !== impactBaseSignature) continue;
    if (!byPath.has(relativePath)) byPath.set(relativePath, row);
  }
  return byPath.size === 1 ? [...byPath.values()] : [];
}

function selectorPairImpactMatchesProjectile(impactPath = "", projectilePath = "") {
  if (!impactPath || !projectilePath) return false;
  const impactRoot = effectResourceRootFromPath(impactPath);
  const projectileRoot = effectResourceRootFromPath(projectilePath);
  if (impactRoot && projectileRoot && impactRoot !== projectileRoot) return false;

  const impactTerms = selectorPairResourceTerms(impactPath);
  const projectileTerms = selectorPairResourceTerms(projectilePath);
  const projectileLooksProjectile = ["projectile", "proj", "shot"].some((term) => projectileTerms.has(term));
  const impactLooksImpact = ["impact", "hit"].some((term) => impactTerms.has(term));
  const impactReferencesProjectile = ["projectile", "proj"].some((term) => impactTerms.has(term));
  return projectileLooksProjectile && impactLooksImpact && impactReferencesProjectile;
}

function selectorPairProjectileSiblingItems(item = {}, siblings = []) {
  return siblings.filter(
    (sibling) =>
      sibling !== item &&
      sibling.sourceKind === "native-effect-selector" &&
      sibling.selectorOutputRole === "projectile" &&
      itemHasStrongResourceEvidence(sibling) &&
      selectorPairItemsCompatible(item, sibling),
  );
}

function applySelectorPairImpactCandidateNarrowing(items = [], byFunction = new Map()) {
  for (const item of items) {
    if (item.sourceKind !== "native-effect-selector") continue;
    if (item.selectorOutputRole !== "impact") continue;
    if (!itemHasWeakResourceCandidates(item)) continue;

    const siblings = byFunction.get(selectorPairFunctionKey(item)) || [];
    const projectileSiblings = selectorPairProjectileSiblingItems(item, siblings);
    if (!projectileSiblings.length) continue;

    const companionByPath = new Map();
    for (const impactPath of item.resourcePaths || []) {
      if (
        projectileSiblings.some((sibling) =>
          (sibling.resourcePaths || []).some((projectilePath) => selectorPairImpactMatchesProjectile(impactPath, projectilePath)),
        )
      ) {
        companionByPath.set(impactPath, impactPath);
      }
    }
    if (companionByPath.size !== 1) continue;

    const [companionPath] = companionByPath.keys();
    item.aliasStatus = item.aliasStatus || "hero-alias-resource";
    item.aliasEvidenceStrength = "strong";
    item.resourceMatchKind = "native-selector-pair-projectile-companion";
    item.resourceEvidenceSource = "native-selector-pair-companion";
    item.resourcePaths = [companionPath];
    item.resourceVariants = (item.resourceVariants || []).filter((variant) => variant.resourcePath === companionPath);
    item.heroResourceRoots = uniq([...listValue(item.heroResourceRoots), effectResourceRootFromPath(companionPath)]);
  }
}

function applySelectorSameTokenCompanionResources(items = [], byFunction = new Map()) {
  for (const item of items) {
    if (item.sourceKind !== "native-effect-selector") continue;
    if (item.resourcePaths?.length) continue;
    const token = item.effectToken || item.token || "";
    if (!token) continue;

    const siblings = (byFunction.get(selectorPairFunctionKey(item)) || []).filter(
      (sibling) =>
        sibling !== item &&
        (sibling.effectToken || sibling.token || "") === token &&
        itemHasStrongResourceEvidence(sibling) &&
        selectorPairItemsCompatible(item, sibling),
    );
    if (!siblings.length) continue;

    const companionByPath = new Map();
    for (const sibling of siblings) {
      for (const resourcePath of sibling.resourcePaths || []) {
        companionByPath.set(resourcePath, sibling);
      }
    }
    if (companionByPath.size !== 1) continue;

    const [companionPath, companion] = [...companionByPath.entries()][0];
    item.aliasStatus = item.aliasStatus || "hero-alias-resource";
    item.aliasEvidenceStrength = "strong";
    item.resourceMatchKind = "native-selector-same-token-resource";
    item.resourceEvidenceSource = "native-selector-same-token-companion";
    item.resourcePaths = [companionPath];
    item.resourceVariants = (companion.resourceVariants || []).filter((variant) => variant.resourcePath === companionPath);
    item.heroResourceRoots = uniq([...listValue(item.heroResourceRoots), ...listValue(companion.heroResourceRoots), effectResourceRootFromPath(companionPath)]);
  }
}

function applySelectorPairImpactPathSiblingResources(items = [], byFunction = new Map(), effectRows = []) {
  if (!effectRows.length) return;

  for (const item of items) {
    if (item.sourceKind !== "native-effect-selector") continue;
    if (item.selectorOutputRole !== "projectile") continue;
    if (item.resourcePaths?.length) continue;

    const siblings = byFunction.get(selectorPairFunctionKey(item)) || [];
    const impactSiblings = siblings.filter(
      (sibling) =>
        sibling !== item &&
        sibling.selectorOutputRole === "impact" &&
        sibling.resourcePaths?.length &&
        itemHasStrongResourceEvidence(sibling) &&
        selectorPairItemsCompatible(item, sibling),
    );
    if (!impactSiblings.length) continue;

    const companionByPath = new Map();
    for (const sibling of impactSiblings) {
      for (const impactPath of sibling.resourcePaths || []) {
        for (const resourceRow of selectorPairProjectileSiblingRowsForImpactPath(impactPath, effectRows)) {
          companionByPath.set(resourceRow.relativePath, resourceRow);
        }
      }
    }
    if (companionByPath.size !== 1) continue;

    const [companionPath] = companionByPath.keys();
    item.aliasStatus = item.aliasStatus || "hero-alias-resource";
    item.aliasEvidenceStrength = "strong";
    item.resourceMatchKind = "native-selector-pair-impact-path-sibling";
    item.resourceEvidenceSource = "native-selector-pair-companion";
    item.resourcePaths = [companionPath];
    item.resourceVariants = [];
    item.heroResourceRoots = uniq([...listValue(item.heroResourceRoots), effectResourceRootFromPath(companionPath)]);
  }
}

function applySelectorPairCompanionResources(items = [], options = {}) {
  const kindredSlots = options.kindredSlots || [];
  const effectRows = options.effectRows || [];

  const byFunction = new Map();
  for (const item of items) {
    if (item.sourceKind !== "native-effect-selector") continue;
    const key = selectorPairFunctionKey(item);
    if (!key) continue;
    const rows = byFunction.get(key) || [];
    rows.push(item);
    byFunction.set(key, rows);
  }

  applySelectorPairImpactCandidateNarrowing(items, byFunction);
  applySelectorSameTokenCompanionResources(items, byFunction);

  if (kindredSlots.length) {
    for (const item of items) {
      if (item.sourceKind !== "native-effect-selector") continue;
      if (item.selectorOutputRole !== "projectile") continue;
      if (item.resourcePaths?.length) continue;

      const siblings = byFunction.get(selectorPairFunctionKey(item)) || [];
      const impactSiblings = siblings.filter(
        (sibling) =>
          sibling !== item &&
          sibling.selectorOutputRole === "impact" &&
          sibling.resourcePaths?.length &&
          selectorPairItemsCompatible(item, sibling),
      );
      if (!impactSiblings.length) continue;

      const companionByPath = new Map();
      for (const sibling of impactSiblings) {
        for (const impactPath of sibling.resourcePaths || []) {
          for (const slot of selectorPairProjectileCompanionSlots(impactPath, kindredSlots)) {
            if (!slot.resourcePath) continue;
            companionByPath.set(slot.resourcePath, slot);
          }
        }
      }
      if (companionByPath.size !== 1) continue;

      const companion = [...companionByPath.values()][0];
      item.aliasStatus = item.aliasStatus || "hero-alias-resource";
      item.aliasEvidenceStrength = "strong";
      item.resourceMatchKind = "native-selector-pair-impact-companion";
      item.resourceEvidenceSource = "native-selector-pair-companion";
      item.resourcePaths = [companion.resourcePath];
      item.resourceVariants = [kindredResourceVariant(companion)];
      item.heroResourceRoots = uniq([...listValue(item.heroResourceRoots), kindredSlotResourceRoot(companion), effectResourceRootFromPath(companion.resourcePath)]);
    }
  }

  applySelectorPairImpactPathSiblingResources(items, byFunction, effectRows);

  return items;
}

function sourceResourceNarrowingKey(item = {}) {
  const token = item.effectToken || item.token || "";
  const functionName = item.source?.functionName || item.functionName || "";
  if (!item.platform || !functionName || !token || !item.boneToken) return "";
  return [item.platform, functionName, token, item.boneToken].join("\t");
}

function itemHasStrongResourceEvidence(item = {}) {
  return item.resourcePaths?.length && ["confirmed", "strong"].includes(item.aliasEvidenceStrength);
}

function itemHasWeakResourceCandidates(item = {}) {
  return item.resourcePaths?.length && (item.aliasEvidenceStrength === "weak" || item.resourceEvidenceSource === "effect-resource-candidate");
}

function applySourceStrongResourceNarrowing(items = []) {
  const strongByKey = new Map();
  for (const item of items) {
    if (!itemHasStrongResourceEvidence(item)) continue;
    const key = sourceResourceNarrowingKey(item);
    if (!key) continue;
    const paths = strongByKey.get(key) || new Set();
    for (const resourcePath of item.resourcePaths || []) paths.add(resourcePath);
    strongByKey.set(key, paths);
  }
  if (!strongByKey.size) return items;

  for (const item of items) {
    if (!itemHasWeakResourceCandidates(item)) continue;
    const key = sourceResourceNarrowingKey(item);
    const strongPaths = [...(strongByKey.get(key) || [])].sort();
    if (!strongPaths.length || strongPaths.length >= item.resourcePaths.length) continue;
    const candidatePaths = new Set(item.resourcePaths || []);
    if (!strongPaths.every((resourcePath) => candidatePaths.has(resourcePath))) continue;

    item.aliasStatus = item.aliasStatus || "hero-alias-resource";
    item.aliasEvidenceStrength = "strong";
    item.resourceMatchKind = "native-source-strong-resource";
    item.resourceEvidenceSource = "native-source-strong-resource";
    item.resourcePaths = strongPaths;
    item.heroResourceRoots = uniq([...listValue(item.heroResourceRoots), ...strongPaths.map(effectResourceRootFromPath)]);
  }

  return items;
}

function directEffectSpawnRows(directRows = []) {
  return (directRows || [])
    .filter((row) => row?.effectToken)
    .map((row, index) => {
      const locatorLabel = row.locatorLabel || row.boneToken || "";
      const selectedAttachment = !locatorLabel && row.bindHint === "selected-attachment";
      const effectOptionOffsets = listValue(row.effectOptionOffsets);
      return {
        platform: row.platform || "",
        token: row.effectToken,
        bindKind: locatorLabel ? "direct-locator-effect" : selectedAttachment ? "selected-attachment-effect" : "effect-only",
        boneToken: locatorLabel,
        selectedAttachmentSlot: selectedAttachment ? row.selectedAttachmentSlot : "",
        effectToken: row.effectToken,
        hasCallback: "no",
        setsVisibleOrActive: "yes",
        setsEffectOption: effectOptionOffsets.length ? "yes" : "no",
        sourceFile: row.sourceFile || "",
        functionName: row.functionName || "",
        line: row.line || "",
        instanceIndex: row.instanceIndex || String(index + 1),
        hookPattern: row.sourceKind || "native-effect-spawn",
        aliasStatus: row.aliasStatus || "",
        aliasEvidenceStrength: row.aliasEvidenceStrength || "",
        resourcePaths: listValue(row.resourcePaths).join("|"),
        buffTokens: listValue(row.buffTokens).join("|"),
        nativeSemanticCalls: row.evidence || row.sourceKind || "native-effect-spawn",
        sourceKind: row.sourceKind || "native-effect-spawn",
        actionKeys: listValue(row.actionKeys),
        actionNames: listValue(row.actionNames),
        nearbyEffectTokens: listValue(row.nearbyEffectTokens),
        nearbyBuffTokens: listValue(row.nearbyBuffTokens),
        nearbyAbilityNames: listValue(row.nearbyAbilityNames),
        nearbySoundTokens: listValue(row.nearbySoundTokens),
        heroNames: listValue(row.heroNames),
        selectorOutputTarget: row.selectorOutputTarget || "",
        selectorOutputRole: row.selectorOutputRole || "",
        selectorStateTerms: listValue(row.selectorStateTerms),
        effectOptionOffsets,
        effectOptionFloatArgs: listValue(row.effectOptionFloatArgs),
        effectOptionArgKinds: listValue(row.effectOptionArgKinds),
        effectOptionArgSources: listValue(row.effectOptionArgSources),
        effectOptions: row.effectOptions && typeof row.effectOptions === "object" ? row.effectOptions : null,
      };
    });
}

function buildEffectHookRuntimeManifest(bindingRows, abilityRows, generatedAt = new Date().toISOString(), options = {}) {
  const abilityIndex = buildAbilityContextIndex(abilityRows);
  const visualRows = visualBindingEffectRows(options.visualBindingRows, options);
  const directRows = directEffectSpawnRows(options.directEffectRows);
  const runtimeRows = preferVisualBindingsOverEffectOnly(
    backfillMissingActionKeys([...(bindingRows || []), ...visualRows, ...directRows], options.heroNameRows || []).map(
      rowWithNativeNearbyActionKeys,
    ),
  );
  const runtimeRowsWithAbilityContext = runtimeRows.map((row) => {
    const abilityContexts = contextsForBinding(row, abilityIndex);
    const primaryAbilityContext = abilityContexts[0] || null;
    return {
      row: rowWithAbilityContextActionKeys(row, primaryAbilityContext),
      abilityContexts,
      primaryAbilityContext,
    };
  });
  const actionBackfilledRows = backfillMissingActionKeys(
    runtimeRowsWithAbilityContext.map((entry) => entry.row),
    options.heroNameRows || [],
  );
  const timelineActionBackfilledRows = backfillMissingTimelineActionKeys(actionBackfilledRows, options.timelineRows || []);
  const items = [];

  for (let index = 0; index < runtimeRowsWithAbilityContext.length; index += 1) {
    const { abilityContexts, primaryAbilityContext } = runtimeRowsWithAbilityContext[index];
    let runtimeRow = timelineActionBackfilledRows[index] || actionBackfilledRows[index] || runtimeRowsWithAbilityContext[index].row;
    const resolvedResources = resolveBindingResources(runtimeRow, options);
    runtimeRow = rowWithResolvedResourceVariantActionKeys(runtimeRow, resolvedResources);
    runtimeRow = rowWithResolvedResourcePathActionKeys(runtimeRow, resolvedResources);
    const resourcePaths = [...new Set(resolvedResources.resourcePaths || [])].sort();
    const shadergraphPaths = [...new Set(resolvedResources.shadergraphPaths || [])].sort();
    const shadergraphGroupPaths = [...new Set(resolvedResources.shadergraphGroupPaths || [])].sort();
    const definitionPath = primaryAbilityContext?.definitionPath || "";
    const heroCodes = uniq([
      heroCodeFromPath(definitionPath),
      ...resourcePaths.map(heroCodeFromPath),
      ...listValue(resolvedResources.heroCodes),
    ]);
    const heroNames = uniq([...listValue(runtimeRow.heroNames), ...listValue(resolvedResources.heroNames)]);
    const heroResourceRoots = uniq([
      ...listValue(resolvedResources.resourceRoots),
      ...resourcePaths.map(effectResourceRootFromPath),
      ...shadergraphGroupPaths.map(effectResourceRootFromPath),
    ]);
    const resourceVariants = Array.isArray(resolvedResources.resourceVariants) ? resolvedResources.resourceVariants : [];
    const timeline = runtimeTimelineForHook(runtimeRow, options.timelineRows || []);

    items.push({
      id: [
        runtimeRow.platform,
        runtimeRow.functionName,
        runtimeRow.line,
        runtimeRow.instanceIndex,
        runtimeRow.token,
        runtimeRow.effectToken,
        runtimeRow.boneToken,
      ].join(":"),
      platform: runtimeRow.platform,
      token: runtimeRow.token,
      bindKind: runtimeRow.bindKind,
      boneToken: runtimeRow.boneToken,
      effectToken: runtimeRow.effectToken,
      runtimeBinding: runtimeBindingWithTimeline(runtimeBindingForHook(runtimeRow), timeline, runtimeRow),
      hookPattern: runtimeRow.hookPattern,
      aliasStatus: resolvedResources.aliasStatus || runtimeRow.aliasStatus,
      aliasEvidenceStrength: resolvedResources.aliasEvidenceStrength || runtimeRow.aliasEvidenceStrength,
      resourceMatchKind: resolvedResources.resourceMatchKind || "",
      resourceEvidenceSource: resolvedResources.resourceEvidenceSource || "",
      resourcePaths,
      resourceVariants,
      shadergraphMatchKind: resolvedResources.shadergraphMatchKind || "",
      shadergraphEvidenceSource: resolvedResources.shadergraphEvidenceSource || "",
      shadergraphGroupPaths,
      shadergraphPaths,
      heroCodes,
      heroNames,
      heroResourceRoots,
      visibility: {
        hasCallback: boolString(runtimeRow.hasCallback),
        setsVisibleOrActive: boolString(runtimeRow.setsVisibleOrActive),
        setsEffectOption: boolString(runtimeRow.setsEffectOption),
        buffTokens: splitList(runtimeRow.buffTokens),
      },
      actionKeys: listValue(runtimeRow.actionKeys),
      nativeActionNames: listValue(runtimeRow.nativeActionNames || runtimeRow.actionNames),
      nativeNearbyEffectTokens: listValue(runtimeRow.nativeNearbyEffectTokens || runtimeRow.nearbyEffectTokens),
      nativeNearbyBuffTokens: listValue(runtimeRow.nativeNearbyBuffTokens || runtimeRow.nearbyBuffTokens),
      nativeNearbyAbilityNames: listValue(runtimeRow.nativeNearbyAbilityNames || runtimeRow.nearbyAbilityNames),
      nativeNearbySoundTokens: listValue(runtimeRow.nativeNearbySoundTokens || runtimeRow.nearbySoundTokens),
      nativeSemanticCalls: splitList(runtimeRow.nativeSemanticCalls),
      sourceKind: runtimeRow.sourceKind || "native-effect-hook",
      selectorOutputTarget: runtimeRow.selectorOutputTarget || "",
      selectorOutputRole: runtimeRow.selectorOutputRole || "",
      selectorStateTerms: selectorStateTermsForRow(runtimeRow),
      nativeTimelineEventCount: timeline.nativeTimelineEventCount,
      nativeTimelineTimes: timeline.nativeTimelineTimes,
      nativeTimelineSourceKinds: timeline.nativeTimelineSourceKinds,
      source: {
        file: runtimeRow.sourceFile,
        functionName: runtimeRow.functionName,
        line: numberOrNull(runtimeRow.line),
        instanceIndex: numberOrNull(runtimeRow.instanceIndex),
      },
      primaryAbilityContext,
      abilityContexts,
    });
  }

  applySelectorPairCompanionResources(items, options);
  applySourceStrongResourceNarrowing(items);

  items.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.token !== right.token) return left.token.localeCompare(right.token);
    if (left.effectToken !== right.effectToken) return left.effectToken.localeCompare(right.effectToken);
    return left.id.localeCompare(right.id);
  });

  return {
    generatedAt,
    source: {
      bindingPath: defaultBindingPath,
      abilityBridgePath: defaultAbilityBridgePath,
    },
    summary: summarizeManifestItems(items),
    items,
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function summarizeManifestItems(items) {
  const byPlatform = {};
  const byBindKind = {};
  const byRuntimeBindingKind = {};
  const byAliasEvidenceStrength = {};
  const byResourceEvidenceSource = {};
  const byAbilityStatus = {};
  const bySourceKind = {};
  for (const item of items || []) {
    increment(byPlatform, item.platform);
    increment(byBindKind, item.bindKind);
    increment(byRuntimeBindingKind, item.runtimeBinding?.kind);
    increment(byAliasEvidenceStrength, item.aliasEvidenceStrength);
    increment(byResourceEvidenceSource, item.resourceEvidenceSource || "none");
    increment(byAbilityStatus, item.primaryAbilityContext?.slotStatus || "no-ability-context");
    increment(bySourceKind, item.sourceKind || "unknown");
  }

  return {
    rows: items.length,
    tokens: uniq(items.map((item) => item.token)).length,
    effectTokens: uniq(items.map((item) => item.effectToken)).length,
    boneTokens: uniq(items.map((item) => item.boneToken)).length,
    resourceBoundRows: items.filter((item) => item.resourcePaths.length).length,
    shadergraphBoundRows: items.filter((item) => item.shadergraphPaths?.length).length,
    shadergraphOnlyRows: items.filter((item) => !item.resourcePaths.length && item.shadergraphPaths?.length).length,
    abilityContextRows: items.filter((item) => item.primaryAbilityContext).length,
    highConfidenceAbilityRows: items.filter((item) => item.primaryAbilityContext?.contextConfidence === "high").length,
    callbackRows: items.filter((item) => item.visibility.hasCallback).length,
    visibleOrActiveRows: items.filter((item) => item.visibility.setsVisibleOrActive).length,
    resourceCandidateRows: items.filter((item) => item.resourceEvidenceSource === "effect-resource-candidate").length,
    nativeTimedRows: items.filter((item) => item.nativeTimelineEventCount > 0).length,
    nativeActionNameRows: items.filter((item) => item.nativeActionNames?.length).length,
    nativeNearbyTokenRows: items.filter(
      (item) =>
        item.nativeNearbyEffectTokens?.length ||
        item.nativeNearbyBuffTokens?.length ||
        item.nativeNearbyAbilityNames?.length ||
        item.nativeNearbySoundTokens?.length,
    ).length,
    heroNameRows: items.filter((item) => item.heroNames?.length).length,
    byPlatform,
    byBindKind,
    byRuntimeBindingKind,
    byAliasEvidenceStrength,
    byResourceEvidenceSource,
    byAbilityStatus,
    bySourceKind,
  };
}

function reportRowsForManifest(manifest) {
  return manifest.items.map((item) => {
    const context = item.primaryAbilityContext || {};
    return {
      platform: item.platform,
      heroCodes: item.heroCodes.join("|"),
      heroNames: (item.heroNames || []).join("|"),
      heroResourceRoots: (item.heroResourceRoots || []).join("|"),
      definitionPath: context.definitionPath || "",
      runtimeAbilityName: context.runtimeAbilityName || "",
      runtimeAbilitySlotIndex: context.runtimeAbilitySlotIndex ?? "",
      runtimeVariableName: context.runtimeVariableName || "",
      actionKeys: (item.actionKeys || []).join("|"),
      nativeActionNames: (item.nativeActionNames || []).join("|"),
      nativeNearbyEffectTokens: (item.nativeNearbyEffectTokens || []).join("|"),
      nativeNearbyBuffTokens: (item.nativeNearbyBuffTokens || []).join("|"),
      nativeNearbyAbilityNames: (item.nativeNearbyAbilityNames || []).join("|"),
      nativeNearbySoundTokens: (item.nativeNearbySoundTokens || []).join("|"),
      token: item.token,
      effectToken: item.effectToken,
      boneToken: item.boneToken,
      bindKind: item.bindKind,
      runtimeBindingKind: item.runtimeBinding?.kind || "",
      runtimeBindingEvidence: item.runtimeBinding?.evidence || "",
      selectedAttachmentSlot: item.runtimeBinding?.selectedAttachmentSlot ?? "",
      effectOptionOffsets: (item.runtimeBinding?.effectOptionOffsets || []).join("|"),
      effectOptionFloatArgs: (item.runtimeBinding?.effectOptionFloatArgs || []).join("|"),
      effectOptionArgKinds: (item.runtimeBinding?.effectOptionArgKinds || []).join("|"),
      effectOptionArgSources: (item.runtimeBinding?.effectOptionArgSources || []).join("|"),
      effectOptionsJson: item.runtimeBinding?.effectOptions ? JSON.stringify(item.runtimeBinding.effectOptions) : "",
      resourcePaths: item.resourcePaths.join("|"),
      shadergraphGroupPaths: (item.shadergraphGroupPaths || []).join("|"),
      shadergraphPaths: (item.shadergraphPaths || []).join("|"),
      resourceVariantModelLabels: (item.resourceVariants || []).map((variant) => variant.modelLabel).filter(Boolean).join("|"),
      aliasEvidenceStrength: item.aliasEvidenceStrength,
      resourceEvidenceSource: item.resourceEvidenceSource,
      resourceMatchKind: item.resourceMatchKind,
      shadergraphEvidenceSource: item.shadergraphEvidenceSource || "",
      shadergraphMatchKind: item.shadergraphMatchKind || "",
      selectorOutputTarget: item.selectorOutputTarget || "",
      selectorOutputRole: item.selectorOutputRole || "",
      selectorStateTerms: (item.selectorStateTerms || []).join("|"),
      hasCallback: item.visibility.hasCallback ? "yes" : "no",
      setsVisibleOrActive: item.visibility.setsVisibleOrActive ? "yes" : "no",
      setsEffectOption: item.visibility.setsEffectOption ? "yes" : "no",
      sourceFunction: item.source.functionName,
      sourceLine: item.source.line ?? "",
      sourceKind: item.sourceKind || "",
      nativeTimelineEventCount: item.nativeTimelineEventCount || "",
      nativeTimelineTimes: (item.nativeTimelineTimes || []).join("|"),
      nativeTimelineSourceKinds: (item.nativeTimelineSourceKinds || []).join("|"),
      runtimeStartSeconds: item.runtimeBinding?.startSeconds ?? "",
      abilityMatchScore: context.matchScore ?? "",
      abilityMatchTokens: (context.matchedTokens || []).join("|"),
      slotStatus: context.slotStatus || "no-ability-context",
      contextConfidence: context.contextConfidence || "",
    };
  });
}

function exportEffectHookRuntimeManifest({
  bindingPath = defaultBindingPath,
  abilityBridgePath = defaultAbilityBridgePath,
  visualBindingPath = defaultVisualBindingPath,
  effectResourcePath = defaultEffectResourcePath,
  pfxResourcePath = defaultPfxResourcePath,
  shadergraphCandidatePath = defaultShadergraphCandidatePath,
  heroNamesPath = defaultHeroNamesPath,
  definitionChainPath = defaultDefinitionChainPath,
  nativeEffectSpawnPath = defaultNativeEffectSpawnPath,
  nativeTimelinePath = defaultNativeTimelinePath,
  kindredSlotPath = defaultKindredSlotPath,
  skinEffectAliasPath = defaultSkinEffectAliasPath,
  viewerOut = defaultViewerOut,
  reportTsvOut = defaultReportTsvOut,
  reportJsonOut = defaultReportJsonOut,
} = {}) {
  const effectRows = fs.existsSync(effectResourcePath) ? readTsv(effectResourcePath) : [];
  const pfxResourceRows = fs.existsSync(pfxResourcePath) ? readTsv(pfxResourcePath) : [];
  const shadergraphRows = readShadergraphCandidateRows(shadergraphCandidatePath);
  const heroNameRows = fs.existsSync(heroNamesPath) ? readTsv(heroNamesPath) : [];
  const definitionRows = fs.existsSync(definitionChainPath) ? readTsv(definitionChainPath) : [];
  const visualBindingRows = fs.existsSync(visualBindingPath) ? readTsv(visualBindingPath) : [];
  const kindredSlots = fs.existsSync(kindredSlotPath) ? readJsonItems(kindredSlotPath) : [];
  const skinEffectAliasItems = fs.existsSync(skinEffectAliasPath) ? readJsonItems(skinEffectAliasPath) : [];

  const resourceResolver =
    effectRows.length && heroNameRows.length && definitionRows.length
      ? buildEffectResourceResolver({
          effectRows,
          pfxResourceRows,
          shadergraphRows,
          heroNameRows,
          definitionRows,
          visualBindingRows,
          kindredSlots,
          skinEffectAliasItems,
        })
      : null;
  const manifest = buildEffectHookRuntimeManifest(readTsv(bindingPath), readTsv(abilityBridgePath), new Date().toISOString(), {
    resourceResolver,
    visualBindingRows,
    directEffectRows: readJsonItems(nativeEffectSpawnPath),
    timelineRows: readJsonItems(nativeTimelinePath),
    kindredSlots,
    effectRows,
    heroNameRows,
  });
  manifest.source = {
    bindingPath,
    abilityBridgePath,
    visualBindingPath,
    effectResourcePath,
    pfxResourcePath,
    shadergraphCandidatePath,
    heroNamesPath,
    definitionChainPath,
    nativeEffectSpawnPath,
    nativeTimelinePath,
    kindredSlotPath,
    skinEffectAliasPath,
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  const rows = reportRowsForManifest(manifest);
  writeTsv(reportTsvOut, rows, [
    "platform",
    "heroCodes",
    "heroNames",
    "heroResourceRoots",
    "definitionPath",
    "runtimeAbilityName",
    "runtimeAbilitySlotIndex",
    "runtimeVariableName",
    "actionKeys",
    "nativeActionNames",
    "nativeNearbyEffectTokens",
    "nativeNearbyBuffTokens",
    "nativeNearbyAbilityNames",
    "nativeNearbySoundTokens",
    "token",
    "effectToken",
    "boneToken",
    "bindKind",
    "runtimeBindingKind",
    "runtimeBindingEvidence",
    "selectedAttachmentSlot",
    "effectOptionOffsets",
    "effectOptionFloatArgs",
    "effectOptionArgKinds",
    "effectOptionArgSources",
    "effectOptionsJson",
    "resourcePaths",
    "shadergraphGroupPaths",
    "shadergraphPaths",
    "resourceVariantModelLabels",
    "aliasEvidenceStrength",
    "resourceEvidenceSource",
    "resourceMatchKind",
    "shadergraphEvidenceSource",
    "shadergraphMatchKind",
    "selectorOutputTarget",
    "selectorOutputRole",
    "selectorStateTerms",
    "hasCallback",
    "setsVisibleOrActive",
    "setsEffectOption",
    "sourceFunction",
    "sourceLine",
    "sourceKind",
    "nativeTimelineEventCount",
    "nativeTimelineTimes",
    "nativeTimelineSourceKinds",
    "runtimeStartSeconds",
    "abilityMatchScore",
    "abilityMatchTokens",
    "slotStatus",
    "contextConfidence",
  ]);

  fs.mkdirSync(path.dirname(reportJsonOut), { recursive: true });
  fs.writeFileSync(reportJsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportEffectHookRuntimeManifest({
    bindingPath: optionValue(args, "--bindings", defaultBindingPath),
    abilityBridgePath: optionValue(args, "--ability-bridge", defaultAbilityBridgePath),
    visualBindingPath: optionValue(args, "--visual-bindings", defaultVisualBindingPath),
    effectResourcePath: optionValue(args, "--effects", defaultEffectResourcePath),
    pfxResourcePath: optionValue(args, "--pfx-resources", defaultPfxResourcePath),
    shadergraphCandidatePath: optionValue(args, "--shadergraphs", defaultShadergraphCandidatePath),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    definitionChainPath: optionValue(args, "--definitions", defaultDefinitionChainPath),
    nativeEffectSpawnPath: optionValue(args, "--native-effect-spawns", defaultNativeEffectSpawnPath),
    nativeTimelinePath: optionValue(args, "--native-timeline", defaultNativeTimelinePath),
    kindredSlotPath: optionValue(args, "--kindred-slots", defaultKindredSlotPath),
    skinEffectAliasPath: optionValue(args, "--skin-effect-aliases", defaultSkinEffectAliasPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportTsvOut: optionValue(args, "--report-tsv-out", defaultReportTsvOut),
    reportJsonOut: optionValue(args, "--report-json-out", defaultReportJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAbilityContextIndex,
  buildEffectResourceResolver,
  buildEffectHookRuntimeManifest,
  buildVisualPathIdentifierIndex,
  contextsForBinding,
  directEffectSpawnRows,
  exportEffectHookRuntimeManifest,
  readShadergraphCandidateRows,
  reportRowsForManifest,
  summarizeManifestItems,
  visualBindingEffectRows,
};
