#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultRuntimeGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultDefinitionStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultPfxResourcePath = "extracted/reports/effect_pfx_resource_manifest.tsv";
const defaultKindredSlotPath = "extracted/viewer/kindred-effect-resource-slots.json";
const defaultViewerOut = "extracted/viewer/native-effect-definition-neighborhood.json";
const defaultTsvOut = "extracted/reports/native_effect_definition_neighborhood.tsv";
const defaultJsonOut = "extracted/reports/native_effect_definition_neighborhood_summary.json";

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

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
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

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function definitionGroupKey(row) {
  return [row.relativePath || "", row.blockIndex || ""].join("\t");
}

function numericStringIndex(row) {
  const value = Number(row.stringIndex);
  return Number.isFinite(value) ? value : 0;
}

function tokenLike(value) {
  const text = String(value || "").trim();
  if (!text || text.startsWith("build://") || /^<.*>$/.test(text)) return "";
  return text;
}

function tokenValuesForDefinitionRow(row = {}) {
  return uniqueInOrder([tokenLike(row.labelBefore), tokenLike(row.value)]);
}

function buildDefinitionTokenIndex(rows = []) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = definitionGroupKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.sort((left, right) => numericStringIndex(left) - numericStringIndex(right));

  const index = new Map();
  for (const groupRows of groups.values()) {
    for (let indexInGroup = 0; indexInGroup < groupRows.length; indexInGroup += 1) {
      const row = groupRows[indexInGroup];
      for (const token of tokenValuesForDefinitionRow(row)) {
        const matches = index.get(token) || [];
        matches.push({ row, groupRows, indexInGroup });
        index.set(token, matches);
      }
    }
  }
  return index;
}

function pfxTokensForRow(row = {}) {
  return uniqueInOrder([...listValue(row.intrinsicEffectTokens), ...listValue(row.hookEffectTokens)]);
}

function buildPfxTokenIndex(rows = []) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row.relativePath) continue;
    for (const token of pfxTokensForRow(row)) {
      const paths = index.get(token) || [];
      paths.push(row.relativePath);
      index.set(token, paths);
    }
  }
  for (const [token, paths] of index.entries()) index.set(token, uniqueSorted(paths));
  return index;
}

function buildKindredSlotIndex(slots = []) {
  const index = new Map();
  for (const slot of slots || []) {
    if (!slot.resourcePath) continue;
    const rows = index.get(slot.resourcePath) || [];
    rows.push(slot);
    index.set(slot.resourcePath, rows);
  }
  return index;
}

function kindredSlotEvidenceForPfxPaths(pfxResourcePaths = [], kindredSlotIndex = new Map()) {
  const slots = pfxResourcePaths.flatMap((resourcePath) => kindredSlotIndex.get(resourcePath) || []);
  return {
    pfxModelLabels: uniqueSorted(slots.map((slot) => slot.modelLabel)),
    pfxHeroLabels: uniqueSorted(slots.map((slot) => slot.heroLabel)),
    pfxRoles: uniqueSorted(slots.map((slot) => slot.role)),
    pfxActionKeys: uniqueSorted(slots.flatMap((slot) => listValue(slot.actionKeys))),
  };
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

function pfxPromotionClassForToken(entry, gapItem = {}, pfxResourcePaths = [], kindredSlotEvidence = {}) {
  if (!pfxResourcePaths.length) return "";
  const actionKeys = listValue(gapItem.actionKeys);
  const pfxActionKeys = kindredSlotEvidence.pfxActionKeys || [];
  const actionMatched = actionKeysOverlap(actionKeys, pfxActionKeys);

  if (entry.tokenKind !== "source-effect") {
    if (!pfxActionKeys.length) return "nearby-no-action-gate";
    return actionMatched ? "nearby-action-matched" : "nearby-action-mismatch";
  }
  if (!actionMatched) return "source-action-mismatch";
  return pfxResourcePaths.length === 1 ? "source-unique-action-matched" : "source-ambiguous";
}

function windowRowsForDefinitionMatch(match, radius = 1) {
  const start = Math.max(0, match.indexInGroup - radius);
  const end = Math.min(match.groupRows.length, match.indexInGroup + radius + 1);
  return match.groupRows.slice(start, end);
}

function definitionEvidenceForToken(token, definitionIndex = new Map()) {
  const matches = definitionIndex.get(token) || [];
  const definitionPaths = [];
  const definitionBlocks = [];
  const definitionWindowTokens = [];
  const definitionResourcePaths = [];
  const definitionWindowRows = [];
  const seenRows = new Set();

  for (const match of matches) {
    definitionPaths.push(match.row.relativePath);
    definitionBlocks.push(`${match.row.relativePath}:${match.row.blockIndex}`);
    for (const row of windowRowsForDefinitionMatch(match)) {
      const rowKey = [row.relativePath, row.blockIndex, row.stringIndex, row.value].join("\t");
      if (seenRows.has(rowKey)) continue;
      seenRows.add(rowKey);
      definitionWindowRows.push({
        relativePath: row.relativePath || "",
        blockIndex: row.blockIndex || "",
        stringIndex: row.stringIndex || "",
        labelBefore: row.labelBefore || "",
        value: row.value || "",
        resourceCategory: row.resourceCategory || "",
        targetRelativePath: row.targetRelativePath || "",
      });
      definitionWindowTokens.push(...tokenValuesForDefinitionRow(row));
      definitionResourcePaths.push(row.targetRelativePath || "");
    }
  }

  return {
    definitionPaths: uniqueSorted(definitionPaths),
    definitionBlocks: uniqueSorted(definitionBlocks),
    definitionWindowTokens: uniqueInOrder(definitionWindowTokens),
    definitionResourcePaths: uniqueSorted(definitionResourcePaths),
    definitionWindowRows,
  };
}

function tokenEntriesForGapItem(item = {}) {
  const entries = [
    { tokenKind: "source-effect", token: item.effectToken || item.token || "" },
    ...listValue(item.nativeNearbyEffectTokens).map((token) => ({ tokenKind: "nearby-effect", token })),
    ...listValue(item.nativeNearbyBuffTokens).map((token) => ({ tokenKind: "nearby-buff", token })),
    ...listValue(item.nativeNearbyAbilityNames).map((token) => ({ tokenKind: "nearby-ability", token })),
    ...listValue(item.nativeNearbySoundTokens).map((token) => ({ tokenKind: "nearby-sound", token })),
  ];
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry.token) return false;
    const key = `${entry.tokenKind}\t${entry.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildNativeEffectDefinitionNeighborhoodReport(
  { runtimeGapReport = {}, definitionStringRows = [], pfxResourceRows = [], kindredSlots = [] } = {},
  generatedAt = new Date().toISOString(),
) {
  const gapItems = Array.isArray(runtimeGapReport) ? runtimeGapReport : runtimeGapReport.items || [];
  const definitionIndex = buildDefinitionTokenIndex(definitionStringRows);
  const pfxIndex = buildPfxTokenIndex(pfxResourceRows);
  const kindredSlotIndex = buildKindredSlotIndex(kindredSlots);
  const items = [];

  for (const gapItem of gapItems) {
    for (const entry of tokenEntriesForGapItem(gapItem)) {
      const definitionEvidence = definitionEvidenceForToken(entry.token, definitionIndex);
      const pfxResourcePaths = pfxIndex.get(entry.token) || [];
      const kindredSlotEvidence = kindredSlotEvidenceForPfxPaths(pfxResourcePaths, kindredSlotIndex);
      const pfxPromotionClass = pfxPromotionClassForToken(entry, gapItem, pfxResourcePaths, kindredSlotEvidence);
      items.push({
        sourceEffectToken: gapItem.effectToken || gapItem.token || "",
        sourceReason: gapItem.reason || "",
        sourceKind: gapItem.sourceKind || "",
        sourceFunction: gapItem.source?.functionName || "",
        sourceLine: gapItem.source?.line ?? "",
        actionKeys: listValue(gapItem.actionKeys),
        heroNames: listValue(gapItem.heroNames),
        tokenKind: entry.tokenKind,
        token: entry.token,
        definitionPaths: definitionEvidence.definitionPaths,
        definitionBlocks: definitionEvidence.definitionBlocks,
        definitionWindowTokens: definitionEvidence.definitionWindowTokens,
        definitionResourcePaths: definitionEvidence.definitionResourcePaths,
        definitionWindowRows: definitionEvidence.definitionWindowRows,
        pfxResourcePaths,
        ...kindredSlotEvidence,
        pfxLinkKind: pfxResourcePaths.length ? (entry.tokenKind === "source-effect" ? "source-token" : "nearby-token") : "",
        pfxPromotionClass,
      });
    }
  }

  items.sort((left, right) => {
    if (left.sourceEffectToken !== right.sourceEffectToken) return left.sourceEffectToken.localeCompare(right.sourceEffectToken);
    if (left.tokenKind !== right.tokenKind) return left.tokenKind.localeCompare(right.tokenKind);
    return left.token.localeCompare(right.token);
  });

  return {
    generatedAt,
    source: {
      runtimeGapPath: defaultRuntimeGapPath,
      definitionStringsPath: defaultDefinitionStringsPath,
      pfxResourcePath: defaultPfxResourcePath,
      kindredSlotPath: defaultKindredSlotPath,
    },
    summary: summarizeItems(items),
    items,
  };
}

function summarizeItems(items = []) {
  const byTokenKind = {};
  const byPfxPromotionClass = {};
  for (const item of items || []) increment(byTokenKind, item.tokenKind);
  for (const item of items || []) {
    if (item.pfxPromotionClass) increment(byPfxPromotionClass, item.pfxPromotionClass);
  }
  return {
    rows: items.length,
    sourceEffectTokens: uniqueSorted(items.map((item) => item.sourceEffectToken)).length,
    tokens: uniqueSorted(items.map((item) => item.token)).length,
    definitionLinkedRows: items.filter((item) => item.definitionPaths.length).length,
    definitionResourceLinkedRows: items.filter((item) => item.definitionResourcePaths.length).length,
    pfxLinkedRows: items.filter((item) => item.pfxResourcePaths.length).length,
    sourcePfxLinkedRows: items.filter((item) => item.pfxLinkKind === "source-token").length,
    nearbyPfxLinkedRows: items.filter((item) => item.pfxLinkKind === "nearby-token").length,
    pfxSlotLinkedRows: items.filter((item) => item.pfxModelLabels.length || item.pfxRoles.length || item.pfxActionKeys.length).length,
    safeSourcePfxRows: items.filter((item) => item.pfxPromotionClass === "source-unique-action-matched").length,
    byTokenKind,
    byPfxPromotionClass,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    sourceEffectToken: item.sourceEffectToken,
    sourceReason: item.sourceReason,
    sourceKind: item.sourceKind,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    actionKeys: item.actionKeys.join("|"),
    heroNames: item.heroNames.join("|"),
    tokenKind: item.tokenKind,
    token: item.token,
    definitionPaths: item.definitionPaths.join("|"),
    definitionBlocks: item.definitionBlocks.join("|"),
    definitionWindowTokens: item.definitionWindowTokens.join("|"),
    definitionResourcePaths: item.definitionResourcePaths.join("|"),
    pfxResourcePaths: item.pfxResourcePaths.join("|"),
    pfxLinkKind: item.pfxLinkKind,
    pfxPromotionClass: item.pfxPromotionClass,
    pfxModelLabels: item.pfxModelLabels.join("|"),
    pfxHeroLabels: item.pfxHeroLabels.join("|"),
    pfxRoles: item.pfxRoles.join("|"),
    pfxActionKeys: item.pfxActionKeys.join("|"),
  }));
}

function exportNativeEffectDefinitionNeighborhoodReport({
  runtimeGapPath = defaultRuntimeGapPath,
  definitionStringsPath = defaultDefinitionStringsPath,
  pfxResourcePath = defaultPfxResourcePath,
  kindredSlotPath = defaultKindredSlotPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeEffectDefinitionNeighborhoodReport(
    {
      runtimeGapReport: readJson(runtimeGapPath),
      definitionStringRows: readTsv(definitionStringsPath),
      pfxResourceRows: readTsv(pfxResourcePath),
      kindredSlots: readJsonItems(kindredSlotPath),
    },
    new Date().toISOString(),
  );
  manifest.source = { runtimeGapPath, definitionStringsPath, pfxResourcePath, kindredSlotPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "sourceEffectToken",
    "sourceReason",
    "sourceKind",
    "sourceFunction",
    "sourceLine",
    "actionKeys",
    "heroNames",
    "tokenKind",
    "token",
    "definitionPaths",
    "definitionBlocks",
    "definitionWindowTokens",
    "definitionResourcePaths",
    "pfxResourcePaths",
    "pfxLinkKind",
    "pfxPromotionClass",
    "pfxModelLabels",
    "pfxHeroLabels",
    "pfxRoles",
    "pfxActionKeys",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectDefinitionNeighborhoodReport({
    runtimeGapPath: optionValue(args, "--runtime-gaps", defaultRuntimeGapPath),
    definitionStringsPath: optionValue(args, "--definition-strings", defaultDefinitionStringsPath),
    pfxResourcePath: optionValue(args, "--pfx-resources", defaultPfxResourcePath),
    kindredSlotPath: optionValue(args, "--kindred-slots", defaultKindredSlotPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeEffectDefinitionNeighborhoodReport,
  exportNativeEffectDefinitionNeighborhoodReport,
  reportRowsForManifest,
};
