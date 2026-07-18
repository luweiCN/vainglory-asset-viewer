#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSkinCatalogPath = "extracted/viewer/skin-catalog.json";
const defaultSkinnedManifestPath = "extracted/viewer/skinned-glb-pbr-manifest.json";
const defaultSkinEffectAliasPath = "extracted/viewer/runtime-skin-effect-aliases.json";
const defaultViewerOut = "extracted/viewer/runtime-skin-variant-aliases.json";
const defaultTsvOut = "extracted/reports/runtime_skin_variant_aliases.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readManifestItems(filePath) {
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

function normalizeKey(value) {
  return String(value || "").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJoin(values) {
  return unique(values).join("|");
}

function buildEffectAliasLookup(skinEffectAliasItems = []) {
  const lookup = new Map();
  for (const item of skinEffectAliasItems || []) {
    if (!item.modelLabel) continue;
    const key = normalizeKey(item.modelLabel);
    const rows = lookup.get(key) || [];
    rows.push(item);
    lookup.set(key, rows);
  }
  return lookup;
}

function chooseSharedBaseItem({ skinId, effectAliasRows, skinnedItems }) {
  const sourcePaths = new Set(effectAliasRows.map((row) => row.relativePath).filter(Boolean));
  const candidates = [];
  for (const item of skinnedItems || []) {
    const baseLabel = item.modelLabel || item.variant || "";
    if (!baseLabel || baseLabel === skinId) continue;
    if (!skinId.startsWith(`${baseLabel}_`)) continue;
    if (sourcePaths.size && !sourcePaths.has(item.sourceRelativePath || "")) continue;
    candidates.push(item);
  }
  candidates.sort((left, right) => {
    const leftLabel = left.modelLabel || left.variant || "";
    const rightLabel = right.modelLabel || right.variant || "";
    return rightLabel.length - leftLabel.length || leftLabel.localeCompare(rightLabel);
  });
  return candidates[0] || null;
}

function buildRuntimeSkinVariantAliasRows({ skinCatalog, skinnedItems, skinEffectAliasItems }) {
  const rows = [];
  const seen = new Set();
  const exactSkinnedLabels = new Set((skinnedItems || []).map((item) => normalizeKey(item.modelLabel || item.variant || "")));
  const effectAliasesBySkinId = buildEffectAliasLookup(skinEffectAliasItems || []);

  for (const [skinId, entry] of Object.entries(skinCatalog?.skins || {})) {
    if (exactSkinnedLabels.has(normalizeKey(skinId))) continue;
    const effectAliasRows = effectAliasesBySkinId.get(normalizeKey(skinId)) || [];
    if (!effectAliasRows.length) continue;
    const baseItem = chooseSharedBaseItem({ skinId, effectAliasRows, skinnedItems });
    if (!baseItem?.rel) continue;

    const baseModelLabel = baseItem.modelLabel || baseItem.variant || "";
    const key = `${skinId}\t${baseModelLabel}\t${baseItem.rel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      skinId,
      fallbackLabel: entry.fallbackLabel || "",
      zhCN: entry.zhCN || "",
      baseModelLabel,
      baseCharacter: baseItem.character || "",
      rel: baseItem.rel || "",
      sourceRelativePath: baseItem.sourceRelativePath || unique(effectAliasRows.map((row) => row.relativePath))[0] || "",
      materialCount: baseItem.materialCount ?? "",
      texturedMaterialCount: baseItem.texturedMaterialCount ?? "",
      effectAliasRows: effectAliasRows.length,
      sourceEffectTokens: uniqueJoin(effectAliasRows.map((row) => row.sourceEffectToken)),
      skinEffectTokens: uniqueJoin(effectAliasRows.map((row) => row.skinEffectToken)),
      evidence: "skin-effect-alias-prefix-shared-glb",
    });
  }

  return rows.sort(
    (left, right) =>
      left.baseCharacter.localeCompare(right.baseCharacter) ||
      left.baseModelLabel.localeCompare(right.baseModelLabel) ||
      left.skinId.localeCompare(right.skinId),
  );
}

function summarizeRows(rows) {
  const byBaseModelLabel = {};
  const bySourceRelativePath = {};
  for (const row of rows || []) {
    byBaseModelLabel[row.baseModelLabel] = (byBaseModelLabel[row.baseModelLabel] || 0) + 1;
    bySourceRelativePath[row.sourceRelativePath] = (bySourceRelativePath[row.sourceRelativePath] || 0) + 1;
  }
  return {
    rows: rows.length,
    models: Object.keys(byBaseModelLabel).length,
    byBaseModelLabel,
    bySourceRelativePath,
  };
}

const columns = [
  "skinId",
  "fallbackLabel",
  "zhCN",
  "baseModelLabel",
  "baseCharacter",
  "rel",
  "sourceRelativePath",
  "materialCount",
  "texturedMaterialCount",
  "effectAliasRows",
  "sourceEffectTokens",
  "skinEffectTokens",
  "evidence",
];

function exportRuntimeSkinVariantAliases({
  skinCatalogPath = defaultSkinCatalogPath,
  skinnedManifestPath = defaultSkinnedManifestPath,
  skinEffectAliasPath = defaultSkinEffectAliasPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const rows = buildRuntimeSkinVariantAliasRows({
    skinCatalog: readJson(skinCatalogPath),
    skinnedItems: readManifestItems(skinnedManifestPath),
    skinEffectAliasItems: readManifestItems(skinEffectAliasPath),
  });
  const summary = summarizeRows(rows);
  const payload = { generatedAt: new Date().toISOString(), summary, items: rows };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(payload, null, 2)}\n`);
  writeTsv(tsvOut, rows, columns);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeSkinVariantAliases({
    skinCatalogPath: optionValue(args, "--skin-catalog", defaultSkinCatalogPath),
    skinnedManifestPath: optionValue(args, "--skinned-manifest", defaultSkinnedManifestPath),
    skinEffectAliasPath: optionValue(args, "--skin-effect-aliases", defaultSkinEffectAliasPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeSkinVariantAliasRows,
  chooseSharedBaseItem,
  exportRuntimeSkinVariantAliases,
};
