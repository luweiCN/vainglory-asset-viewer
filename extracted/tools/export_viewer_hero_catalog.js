#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const defaultViewerDir = "extracted/viewer";
const defaultDefinitionSymbolsPath = "extracted/reports/cff0_definition_symbols.tsv";
const defaultKindredSkinManifestPath = "extracted/reports/cff0_decoded_instances.tsv";
const defaultDefinitionInstanceStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultSkinModelSummaryPath = "extracted/reports/skin_model_summary.tsv";
const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultLocalizationRelativePath = "Localization/localization_zh_CN.strings";
const defaultOutPath = "extracted/viewer/hero-catalog.json";
const defaultSkinOutPath = "extracted/viewer/skin-catalog.json";
const manifestNames = [
  "skinned-glb-pbr-manifest.json",
  "skin-glb-pbr-manifest.json",
  "textured-glb-pbr-manifest.json",
  "all-glb-pbr-manifest.json",
  "textured-glb-mtl-manifest.json",
  "glb-manifest.json",
  "obj-manifest.json",
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function readLines(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
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

function dataPathForBuildRelativePath(dataRoot, relativePath) {
  const hash = crypto.createHash("md5").update(relativePath).digest("hex").toUpperCase();
  return path.join(dataRoot, hash.slice(0, 2), hash);
}

function defaultLocalizationStringsPath() {
  return dataPathForBuildRelativePath(defaultDataRoot, defaultLocalizationRelativePath);
}

function decodeQuotedString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
  }
}

function decodeLocalizationText(rawText) {
  const trimmed = String(rawText || "").trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && !trimmed.includes('"')) {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (/^\s*"[^"]+"\s*=/.test(decoded)) return decoded;
  }
  return rawText;
}

function parseLocalizationStrings(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const text = decodeLocalizationText(fs.readFileSync(filePath, "utf8"));
  const output = new Map();
  const pattern = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
  let match;
  while ((match = pattern.exec(text))) {
    output.set(decodeQuotedString(match[1]), decodeQuotedString(match[2]));
  }
  return output;
}

function addSource(entry, source) {
  if (!source || entry.sources.includes(source)) return;
  entry.sources.push(source);
}

function heroEntry(map, key) {
  const normalized = String(key || "").trim();
  if (!normalized) return null;
  if (!map.has(normalized)) {
    map.set(normalized, {
      key: normalized,
      english: normalized,
      zhCN: null,
      localizationKey: null,
      aliases: [normalized],
      sources: [],
      unresolvedLocalization: true,
    });
  }
  return map.get(normalized);
}

function setEnglish(map, key, english, source) {
  const entry = heroEntry(map, key);
  const name = String(english || "").trim();
  if (!entry || !name) return;
  entry.english = name;
  if (!entry.aliases.includes(name)) entry.aliases.push(name);
  addSource(entry, source);
}

function setLocalizationKey(map, key, localizationKey, source) {
  const entry = heroEntry(map, key);
  const normalized = String(localizationKey || "").trim();
  if (!entry || !/^CHAR_INFO_[A-Z0-9]+_NAME$/.test(normalized)) return;
  entry.localizationKey = normalized;
  if (!entry.aliases.includes(normalized)) entry.aliases.push(normalized);
  addSource(entry, source);
}

function applyHeroLocalizations(heroes, localizedStrings) {
  for (const entry of heroes.values()) {
    const localized = localizedStrings.get(entry.localizationKey);
    if (!localized) continue;
    entry.zhCN = localized.trim();
    entry.unresolvedLocalization = false;
    if (!entry.aliases.includes(entry.zhCN)) entry.aliases.push(entry.zhCN);
  }
}

function heroKeyForItem(item) {
  const sourceMatch = /^Characters\/([^/]+)\//.exec(item.sourceRelativePath || "");
  return sourceMatch?.[1] || item.character || "";
}

function englishFromModelLabel(label) {
  const match = /^([A-Za-z0-9]+)_(?:DefaultSkin|Skin(?:_|$))/.exec(label || "");
  return match?.[1] || "";
}

function englishFromDefinitionPath(relativePath) {
  const match = /^Characters\/([^/]+)\/([^/.]+)\.def$/.exec(relativePath || "");
  if (!match) return null;
  const [, key, name] = match;
  if (!name || name === key || name.includes("_")) return null;
  return { key, name };
}

function parseDefinitionSymbolNames(symbolsPath) {
  const names = [];
  for (const line of readLines(symbolsPath)) {
    const relativePath = line.split("\t")[0];
    const parsed = englishFromDefinitionPath(relativePath);
    if (parsed) names.push({ ...parsed, source: relativePath });
  }
  return names;
}

function parseKindredSkinManifestNames(decodedInstancesPath) {
  const row = readLines(decodedInstancesPath).find((line) => line.startsWith("Progression/KindredSkinManifest.def\t"));
  if (!row) return [];
  const payload = row.split("\t").at(-1) || "";
  const tokens = payload.split("|").filter(Boolean);
  const names = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const skinMatch = /^([A-Za-z0-9]+)_DefaultSkin$/.exec(tokens[index]);
    const symbolMatch = /^\*([^*]+)\*$/.exec(tokens[index + 1] || "");
    if (!skinMatch || !symbolMatch) continue;
    names.push({
      key: symbolMatch[1],
      name: skinMatch[1],
      source: "Progression/KindredSkinManifest.def",
    });
  }

  return names;
}

function parseHeroLocalizationKeys(instanceStringsPath) {
  const names = [];
  for (const line of readLines(instanceStringsPath)) {
    if (!line || !line.startsWith("Characters/")) continue;
    const parts = line.split("\t");
    const relativePath = parts[0] || "";
    const relationKind = parts[8] || "";
    const english = parts[9] || "";
    const localizationKey = parts[10] || "";
    if (relationKind !== "label") continue;
    if (!english || /^CHAR_INFO_/.test(english)) continue;
    if (!/^CHAR_INFO_[A-Z0-9]+_NAME$/.test(localizationKey)) continue;
    const sourceMatch = /^Characters\/([^/]+)\//.exec(relativePath);
    const key = sourceMatch?.[1] || "";
    if (!key) continue;
    names.push({
      key,
      localizationKey,
      source: relativePath,
    });
  }
  return names;
}

function isKindredSkinId(value) {
  return /^[A-Za-z0-9]+_(?:DefaultSkin|Skin(?:_|$))/.test(value || "");
}

function isHeroSymbolToken(value) {
  return /^\*[^*]+\*$/.test(value || "");
}

function isSkinLocalizationKey(value) {
  return /^CHAR_THEME_NAME_[A-Z0-9_]+$/.test(value || "");
}

function fallbackLabelFromSkinId(id) {
  return String(id || "").replace(/_(?:DefaultSkin|Skin(?:_|$).*)$/, "");
}

function fallbackLabelFromRuntimeSkinModelId(id) {
  return String(id || "")
    .replace(/_DefaultSkin$/i, "")
    .replace(/_Skin_/i, "_");
}

function fallbackLabelFromHeroSymbol(symbol, id) {
  const stripped = String(symbol || "").replace(/^\*/, "").replace(/\*$/, "").trim();
  return stripped || fallbackLabelFromSkinId(id);
}

function parseKindredSkinCatalog(decodedInstancesPath) {
  const row = readLines(decodedInstancesPath).find((line) => line.startsWith("Progression/KindredSkinManifest.def\t"));
  if (!row) return [];
  const payload = row.split("\t").at(-1) || "";
  const tokens = payload.split("|").filter(Boolean);
  const skins = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const id = tokens[index];
    const next = tokens[index + 1] || "";
    const fallbackLabel = tokens[index + 2] || "";
    if (!isKindredSkinId(id)) continue;

    if (isHeroSymbolToken(next)) {
      const hasExplicitFallbackLabel =
        fallbackLabel && !isKindredSkinId(fallbackLabel) && !isHeroSymbolToken(fallbackLabel) && !isSkinLocalizationKey(fallbackLabel);
      skins.push({
        id,
        fallbackLabel: hasExplicitFallbackLabel ? fallbackLabel : fallbackLabelFromHeroSymbol(next, id),
        localizationKey: null,
        source: "Progression/KindredSkinManifest.def",
      });
      index += hasExplicitFallbackLabel ? 2 : 1;
      continue;
    }

    if (isSkinLocalizationKey(next)) {
      skins.push({
        id,
        fallbackLabel: fallbackLabel || fallbackLabelFromSkinId(id),
        localizationKey: next,
        source: "Progression/KindredSkinManifest.def",
      });
      index += 2;
    }
  }

  return skins;
}

function parseRuntimeSkinModelCatalog(skinModelSummaryPath) {
  const rows = [];
  const seen = new Set();

  for (const row of readTsv(skinModelSummaryPath)) {
    const id = row.modelLabel || "";
    if (!isKindredSkinId(id) || !/_Skin_/i.test(id)) continue;
    if (!/^Characters\/[^/]+\/[^/]+\.def$/i.test(row.sourceRelativePath || "")) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      fallbackLabel: fallbackLabelFromRuntimeSkinModelId(id),
      localizationKey: null,
      source: "runtime-skin-model",
      sourceRelativePath: row.sourceRelativePath || "",
    });
  }

  return rows;
}

function localizationMetadata(localizationStringsPath, localizedCount) {
  const exists = Boolean(localizationStringsPath && fs.existsSync(localizationStringsPath));
  return {
    status: exists ? "loaded" : "strings-file-missing",
    nativeBuildPath: `build://${defaultLocalizationRelativePath}`,
    dataFilePath: localizationStringsPath || defaultLocalizationStringsPath(),
    format: exists ? "base64-encoded Apple .strings" : null,
    localizedCount,
    evidence: exists
      ? [
          "native strings reference localization_zh_CN.strings",
          "resource filenames are MD5(relativePath)",
          `${defaultLocalizationRelativePath} resolves to ${path.basename(localizationStringsPath)}`,
        ]
      : [
          "native strings reference localization_zh_CN.strings",
          "resource filenames are MD5(relativePath)",
          `${defaultLocalizationRelativePath} was not found at the computed data path`,
        ],
  };
}

function readManifestItems(viewerDir) {
  const items = [];
  for (const manifestName of manifestNames) {
    const manifestPath = path.join(viewerDir, manifestName);
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    for (const item of manifest.items || []) items.push({ ...item, manifestName });
  }
  return items;
}

function buildViewerHeroCatalog({
  viewerDir,
  definitionSymbolsPath,
  kindredSkinManifestPath,
  definitionInstanceStringsPath = defaultDefinitionInstanceStringsPath,
  localizationStringsPath = defaultLocalizationStringsPath(),
  generatedAt = new Date().toISOString(),
}) {
  const heroes = new Map();
  const manifestItems = readManifestItems(viewerDir);
  const localizedStrings = parseLocalizationStrings(localizationStringsPath);

  for (const item of manifestItems) {
    const entry = heroEntry(heroes, heroKeyForItem(item));
    if (entry) addSource(entry, item.sourceRelativePath || item.rel || item.manifestName);
  }

  for (const { key, name, source } of parseDefinitionSymbolNames(definitionSymbolsPath)) {
    if (heroes.has(key)) setEnglish(heroes, key, name, source);
  }

  for (const { key, name, source } of parseKindredSkinManifestNames(kindredSkinManifestPath)) {
    if (heroes.has(key)) setEnglish(heroes, key, name, source);
  }

  for (const { key, localizationKey, source } of parseHeroLocalizationKeys(definitionInstanceStringsPath)) {
    if (heroes.has(key)) setLocalizationKey(heroes, key, localizationKey, source);
  }

  for (const item of manifestItems) {
    const key = heroKeyForItem(item);
    const entry = heroEntry(heroes, key);
    if (!entry) continue;
    addSource(entry, item.sourceRelativePath || item.rel || item.manifestName);
    const labelName = englishFromModelLabel(item.modelLabel || item.variant || "");
    if (labelName) setEnglish(heroes, key, labelName, item.sourceRelativePath || item.manifestName);
  }

  applyHeroLocalizations(heroes, localizedStrings);

  const sortedHeroes = [...heroes.values()]
    .map((entry) => ({
      ...entry,
      aliases: [...new Set(entry.aliases)].sort((left, right) => left.localeCompare(right)),
      sources: entry.sources.slice(0, 8),
    }))
    .sort((left, right) => left.english.localeCompare(right.english) || left.key.localeCompare(right.key));

  return {
    generatedAt,
    sources: [
      "viewer manifests",
      "extracted/reports/cff0_definition_symbols.tsv",
      "extracted/reports/cff0_decoded_instances.tsv: Progression/KindredSkinManifest.def",
    ],
    localization: {
      zhCN: {
        ...localizationMetadata(
          localizationStringsPath,
          [...heroes.values()].filter((entry) => Boolean(entry.zhCN)).length,
        ),
      },
    },
    heroes: Object.fromEntries(sortedHeroes.map((entry) => [entry.key, entry])),
  };
}

function buildViewerSkinCatalog({
  kindredSkinManifestPath,
  skinModelSummaryPath = defaultSkinModelSummaryPath,
  localizationStringsPath = defaultLocalizationStringsPath(),
  generatedAt = new Date().toISOString(),
}) {
  const localizedStrings = parseLocalizationStrings(localizationStringsPath);
  const byId = new Map();
  for (const entry of parseKindredSkinCatalog(kindredSkinManifestPath)) byId.set(entry.id, entry);
  for (const entry of parseRuntimeSkinModelCatalog(skinModelSummaryPath)) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  const sortedSkins = [...byId.values()]
    .map((entry) => ({
      ...entry,
      zhCN: entry.localizationKey ? localizedStrings.get(entry.localizationKey)?.trim() || null : null,
      sources: [entry.source, entry.sourceRelativePath].filter(Boolean),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    generatedAt,
    sources: ["extracted/reports/cff0_decoded_instances.tsv: Progression/KindredSkinManifest.def"],
    localization: {
      zhCN: {
        ...localizationMetadata(
          localizationStringsPath,
          sortedSkins.filter((entry) => Boolean(entry.zhCN)).length,
        ),
      },
    },
    skins: Object.fromEntries(sortedSkins.map((entry) => [entry.id, entry])),
  };
}

function exportViewerHeroCatalog({
  viewerDir,
  definitionSymbolsPath,
  kindredSkinManifestPath,
  definitionInstanceStringsPath,
  skinModelSummaryPath,
  localizationStringsPath,
  outPath,
  skinOutPath,
}) {
  const catalog = buildViewerHeroCatalog({
    viewerDir,
    definitionSymbolsPath,
    kindredSkinManifestPath,
    definitionInstanceStringsPath,
    localizationStringsPath,
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  let skinCount = 0;
  let localizedSkinZhCN = 0;
  if (skinOutPath) {
    const skinCatalog = buildViewerSkinCatalog({ kindredSkinManifestPath, skinModelSummaryPath, localizationStringsPath });
    fs.mkdirSync(path.dirname(skinOutPath), { recursive: true });
    fs.writeFileSync(skinOutPath, `${JSON.stringify(skinCatalog, null, 2)}\n`);
    skinCount = Object.keys(skinCatalog.skins).length;
    localizedSkinZhCN = Object.values(skinCatalog.skins).filter((entry) => entry.zhCN).length;
  }
  return {
    count: Object.keys(catalog.heroes).length,
    localizedZhCN: Object.values(catalog.heroes).filter((entry) => entry.zhCN).length,
    skinCount,
    localizedSkinZhCN,
    outPath,
    skinOutPath,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportViewerHeroCatalog({
    viewerDir: optionValue(args, "--viewer-dir", defaultViewerDir),
    definitionSymbolsPath: optionValue(args, "--definition-symbols", defaultDefinitionSymbolsPath),
    kindredSkinManifestPath: optionValue(args, "--kindred-skin-manifest", defaultKindredSkinManifestPath),
    definitionInstanceStringsPath: optionValue(args, "--definition-instance-strings", defaultDefinitionInstanceStringsPath),
    skinModelSummaryPath: optionValue(args, "--skin-model-summary", defaultSkinModelSummaryPath),
    localizationStringsPath: optionValue(args, "--localization-zh-cn", defaultLocalizationStringsPath()),
    outPath: optionValue(args, "--out", defaultOutPath),
    skinOutPath: optionValue(args, "--skin-out", defaultSkinOutPath),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildViewerHeroCatalog,
  buildViewerSkinCatalog,
  exportViewerHeroCatalog,
  englishFromModelLabel,
  englishFromDefinitionPath,
  heroKeyForItem,
  dataPathForBuildRelativePath,
  parseLocalizationStrings,
  parseHeroLocalizationKeys,
  parseKindredSkinCatalog,
  parseRuntimeSkinModelCatalog,
};
