#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSourcePath = "extracted/reports/definition_instance_strings.tsv";
const defaultViewerOut = "extracted/viewer/kindred-effect-resource-slots.json";
const defaultTsvOut = "extracted/reports/kindred_effect_resource_slots.tsv";
const defaultJsonOut = "extracted/reports/kindred_effect_resource_slots_summary.json";

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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
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

function isHeroSkinEffectLabel(label) {
  return /^[A-Za-z0-9]+_(?:DefaultSkin|Skin_[A-Za-z0-9_]+)$/.test(String(label || ""));
}

function isGlobalEffectGroupLabel(label) {
  const value = String(label || "");
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value) && !isHeroSkinEffectLabel(value);
}

function heroLabelForModelLabel(modelLabel) {
  return String(modelLabel || "").replace(/_(?:DefaultSkin|Skin_[A-Za-z0-9_]+)$/, "");
}

function skinKindForModelLabel(modelLabel) {
  return /_DefaultSkin$/.test(String(modelLabel || "")) ? "default" : "skin";
}

function resourceStem(relativePath) {
  return path.basename(String(relativePath || ""), ".pfx");
}

function resourceRoot(relativePath) {
  const match = String(relativePath || "").match(/^Effects\/([^/]+)\//i);
  return match ? match[1] : "";
}

function inferResourceActionKeys(relativePath) {
  const text = String(relativePath || "");
  const keys = new Set();
  if (/(^|[_/-])AA(?:[_/.-]|$)|DefaultAttack|BasicAttack/i.test(text)) keys.add("attack");
  if (/Crit/i.test(text)) keys.add("attack_crit");
  if (/(^|[_/-])A(?:[_/.-]|$)|Ability0?1/i.test(text)) keys.add("ability01");
  if (/(^|[_/-])B(?:[_/.-]|$)|Ability0?2/i.test(text)) keys.add("ability02");
  if (/(^|[_/-])C(?:[_/.-]|$)|Ability0?3/i.test(text)) keys.add("ability03");
  if (/Withdraw|Recall/i.test(text)) keys.add("withdraw");
  return [...keys].sort();
}

function inferEffectResourceRole(relativePath) {
  const text = String(relativePath || "");
  if (/impact|hit|explode|explosion|(?:^|[_/-])exp(?:[_/.-]|\d|$)|(?:^|[_/-])imp(?:[_/.-]|$)/i.test(text)) return "impact";
  if (/proj|projectile|missile|bullet|shot|bolt|rocket|cannon|shell|grenade|arrow|dart|mortar|orb|fireball|flare|ray|beam/i.test(text)) {
    return "projectile";
  }
  if (/cast|charge|charging|channel/i.test(text)) return "cast";
  if (/buff|aura|dot|hot|idle|loop|ring|rune|warning|indicator/i.test(text)) return "persistent";
  return "effect";
}

function isKindredEffectResourceRow(row) {
  return (
    row.relativePath === "Effects/KindredEffects.def" &&
    row.semantic === "resource" &&
    row.resourceCategory === "effect" &&
    isHeroSkinEffectLabel(row.labelBefore) &&
    /\.pfx$/i.test(row.targetRelativePath || "")
  );
}

function isKindredEffectResourcePathRow(row) {
  return (
    row.relativePath === "Effects/KindredEffects.def" &&
    row.semantic === "resource" &&
    row.resourceCategory === "effect" &&
    /\.pfx$/i.test(row.targetRelativePath || "")
  );
}

function firstNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function rowOrder(left, right) {
  const blockOrder = firstNumber(left.blockIndex) - firstNumber(right.blockIndex);
  if (blockOrder) return blockOrder;
  return firstNumber(left.stringIndex) - firstNumber(right.stringIndex);
}

function blockKey(row) {
  return [row.relativePath || "", row.hash || "", row.blockIndex || ""].join("\t");
}

function rootsForContext(context, modelLabel) {
  if (!context.rootsByModelLabel.has(modelLabel)) context.rootsByModelLabel.set(modelLabel, new Set());
  return context.rootsByModelLabel.get(modelLabel);
}

function contextForBlock(contexts, row) {
  const key = blockKey(row);
  if (!contexts.has(key)) {
    contexts.set(key, {
      currentModelLabel: "",
      rootsByModelLabel: new Map(),
    });
  }
  return contexts.get(key);
}

function modelLabelForKindredEffectResource(row, context) {
  if (isHeroSkinEffectLabel(row.labelBefore)) return row.labelBefore;
  const currentModelLabel = context.currentModelLabel;
  if (!currentModelLabel) return "";
  const knownRoots = rootsForContext(context, currentModelLabel);
  const root = resourceRoot(row.targetRelativePath);
  if (!root || !knownRoots.has(root)) return "";
  return currentModelLabel;
}

function createEffectSlot({ sourceKind, label, pathValue, row }) {
  const isGlobal = sourceKind === "kindred-global-effect-resource-slot";
  return {
    id: `${isGlobal ? "kindred-global-effect-slot" : "kindred-effect-slot"}:${label}:${pathValue}`,
    sourceKind,
    sourceDefinitionPath: "Effects/KindredEffects.def",
    ...(isGlobal ? { groupLabel: label } : {}),
    modelLabel: isGlobal ? "" : label,
    heroLabel: isGlobal ? "" : heroLabelForModelLabel(label),
    skinKind: isGlobal ? "global" : skinKindForModelLabel(label),
    role: inferEffectResourceRole(pathValue),
    actionKeys: inferResourceActionKeys(pathValue),
    resourcePath: pathValue,
    resourceStem: resourceStem(pathValue),
    resourceRoot: resourceRoot(pathValue),
    blockIndexes: [],
    firstStringIndex: firstNumber(row.stringIndex),
  };
}

function buildKindredEffectResourceSlots(stringRows, generatedAt = new Date().toISOString()) {
  const byKey = new Map();
  const contexts = new Map();

  for (const row of [...(stringRows || [])].sort(rowOrder)) {
    const context = contextForBlock(contexts, row);
    if (row.relativePath === "Effects/KindredEffects.def" && row.semantic === "label" && isHeroSkinEffectLabel(row.value)) {
      context.currentModelLabel = row.value;
      rootsForContext(context, row.value);
      continue;
    }

    if (!isKindredEffectResourcePathRow(row)) continue;
    const modelLabel = modelLabelForKindredEffectResource(row, context);
    const sourceKind = modelLabel ? "kindred-effect-resource-slot" : isGlobalEffectGroupLabel(row.labelBefore) ? "kindred-global-effect-resource-slot" : "";
    const slotLabel = modelLabel || row.labelBefore;
    if (!sourceKind || !slotLabel) continue;

    const root = resourceRoot(row.targetRelativePath);
    if (root && modelLabel) rootsForContext(context, modelLabel).add(root);

    const key = `${sourceKind}\t${slotLabel}\t${row.targetRelativePath}`;
    if (!byKey.has(key)) {
      const pathValue = row.targetRelativePath;
      byKey.set(key, createEffectSlot({ sourceKind, label: slotLabel, pathValue, row }));
    }
    const item = byKey.get(key);
    item.blockIndexes = uniqueSorted([...item.blockIndexes, String(row.blockIndex || "")]);
    item.firstStringIndex = Math.min(item.firstStringIndex, firstNumber(row.stringIndex));
  }

  const items = [...byKey.values()].sort((left, right) => {
    const labelOrder = left.modelLabel.localeCompare(right.modelLabel);
    if (labelOrder) return labelOrder;
    return left.resourcePath.localeCompare(right.resourcePath);
  });

  return {
    generatedAt,
    source: {
      sourcePath: defaultSourcePath,
    },
    summary: summarizeKindredEffectResourceSlots(items),
    items,
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function summarizeKindredEffectResourceSlots(items) {
  const byHero = {};
  const byRole = {};
  const byActionKey = {};
  for (const item of items || []) {
    increment(byHero, item.heroLabel);
    increment(byRole, item.role);
    for (const actionKey of item.actionKeys || []) increment(byActionKey, actionKey);
  }
  return {
    rows: items.length,
    modelLabels: new Set(items.map((item) => item.modelLabel).filter(Boolean)).size,
    heroLabels: new Set(items.map((item) => item.heroLabel).filter(Boolean)).size,
    defaultSkinRows: items.filter((item) => item.skinKind === "default").length,
    skinRows: items.filter((item) => item.skinKind === "skin").length,
    globalRows: items.filter((item) => item.skinKind === "global").length,
    byHero,
    byRole,
    byActionKey,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    groupLabel: item.groupLabel || "",
    modelLabel: item.modelLabel,
    heroLabel: item.heroLabel,
    skinKind: item.skinKind,
    role: item.role,
    actionKeys: item.actionKeys.join("|"),
    resourcePath: item.resourcePath,
    resourceStem: item.resourceStem,
    resourceRoot: item.resourceRoot,
    blockIndexes: item.blockIndexes.join("|"),
    firstStringIndex: item.firstStringIndex,
  }));
}

function exportKindredEffectResourceSlots({
  sourcePath = defaultSourcePath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildKindredEffectResourceSlots(readTsv(sourcePath), new Date().toISOString());
  manifest.source = { sourcePath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "groupLabel",
    "modelLabel",
    "heroLabel",
    "skinKind",
    "role",
    "actionKeys",
    "resourcePath",
    "resourceStem",
    "resourceRoot",
    "blockIndexes",
    "firstStringIndex",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportKindredEffectResourceSlots({
    sourcePath: optionValue(args, "--source", defaultSourcePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildKindredEffectResourceSlots,
  exportKindredEffectResourceSlots,
  heroLabelForModelLabel,
  inferEffectResourceRole,
  inferResourceActionKeys,
  isHeroSkinEffectLabel,
  reportRowsForManifest,
  summarizeKindredEffectResourceSlots,
};
