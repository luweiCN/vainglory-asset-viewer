#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultInstanceStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultDefinitionManifestPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultAssetLinksPath = "extracted/reports/character_asset_links.tsv";
const defaultTsvOut = "extracted/reports/attachable_equipment_chain.tsv";
const defaultJsonOut = "extracted/reports/attachable_equipment_chain_summary.json";
const attachableManifestPath = "Progression/KindredAttachableEquipmentManifest.def";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function parseTsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const columns = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index] ?? "";
    });
    return row;
  });
}

function loadTsv(filePath) {
  return parseTsv(fs.readFileSync(filePath, "utf8"));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sample(values, limit = 8) {
  return uniqueSorted(values).slice(0, limit).join("|");
}

function isAttachmentLabel(value) {
  return /^\*[^*]+\*$/.test(value || "");
}

function isInventoryId(value) {
  return /^INVENTORY_/.test(value || "");
}

function extractManifestPairs(instanceRows) {
  const pairs = [];
  for (const row of instanceRows) {
    if (row.relativePath !== attachableManifestPath) continue;
    if (row.semantic !== "label") continue;
    if (!isInventoryId(row.labelBefore) || !isAttachmentLabel(row.value)) continue;
    pairs.push({
      inventoryId: row.labelBefore,
      attachmentLabel: row.value,
      blockIndex: row.blockIndex,
      stringIndex: Number.parseInt(row.stringIndex, 10),
    });
  }

  const byKey = new Map();
  for (const pair of pairs) {
    const key = `${pair.inventoryId}\t${pair.attachmentLabel}`;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, { ...pair, sourceBlocks: new Set([pair.blockIndex]) });
    } else {
      previous.sourceBlocks.add(pair.blockIndex);
      previous.stringIndex = Math.min(previous.stringIndex, pair.stringIndex);
    }
  }

  return [...byKey.values()]
    .map((pair) => ({
      ...pair,
      sourceBlocks: [...pair.sourceBlocks].sort().join(","),
    }))
    .sort((left, right) => left.stringIndex - right.stringIndex || left.inventoryId.localeCompare(right.inventoryId));
}

function buildDefinitionMap(definitionRows) {
  const byLabel = new Map();
  for (const row of definitionRows) {
    if (!row.manifestLabel) continue;
    byLabel.set(row.manifestLabel, row);
  }
  return byLabel;
}

function normalizedLabel(value) {
  return String(value || "")
    .replace(/^\*|\*$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  if (i < left.length || j < right.length) edits += 1;
  return edits <= 1;
}

function findDefinitionForLabel(label, definitionByLabel) {
  const exact = definitionByLabel.get(label);
  if (exact) {
    return {
      definition: exact,
      resolvedManifestLabel: label,
      resolutionSource: "exact-label",
    };
  }

  const normalized = normalizedLabel(label);
  const candidates = [...definitionByLabel.entries()].filter(([candidateLabel]) =>
    editDistanceAtMostOne(normalized, normalizedLabel(candidateLabel)),
  );
  if (candidates.length === 1) {
    return {
      definition: candidates[0][1],
      resolvedManifestLabel: candidates[0][0],
      resolutionSource: "probable-label-alias",
    };
  }

  return {
    definition: {},
    resolvedManifestLabel: "",
    resolutionSource: candidates.length > 1 ? "ambiguous-label-alias" : "unresolved",
  };
}

function buildAssetMap(assetRows) {
  const bySource = new Map();
  for (const row of assetRows) {
    if (!row.sourceRelativePath) continue;
    if (!bySource.has(row.sourceRelativePath)) {
      bySource.set(row.sourceRelativePath, {
        meshPaths: [],
        skeletonPaths: [],
        animationPaths: [],
        bindTokens: [],
        animationLabels: [],
      });
    }
    const item = bySource.get(row.sourceRelativePath);
    if (row.category === "mesh") item.meshPaths.push(row.targetRelativePath);
    if (row.category === "skeleton") item.skeletonPaths.push(row.targetRelativePath);
    if (row.category === "animation") {
      item.animationPaths.push(row.targetRelativePath);
      item.animationLabels.push(row.label);
    }
    if (/_bnd\b/i.test(row.label || "")) item.bindTokens.push(row.label);
  }
  return bySource;
}

function buildAttachableEquipmentRows({ instanceRows, definitionRows, assetRows }) {
  const definitionByLabel = buildDefinitionMap(definitionRows);
  const assetsBySource = buildAssetMap(assetRows);
  const pairs = extractManifestPairs(instanceRows);

  return pairs.map((pair) => {
    const { definition, resolvedManifestLabel, resolutionSource } = findDefinitionForLabel(pair.attachmentLabel, definitionByLabel);
    const assets = assetsBySource.get(definition.targetRelativePath || "") || {
      meshPaths: [],
      skeletonPaths: [],
      animationPaths: [],
      bindTokens: [],
      animationLabels: [],
    };
    return {
      inventoryId: pair.inventoryId,
      attachmentLabel: pair.attachmentLabel,
      resolvedManifestLabel,
      resolutionSource,
      sourceBlocks: pair.sourceBlocks,
      targetRelativePath: definition.targetRelativePath || "",
      targetMatched: definition.targetMatched || "",
      targetHash: definition.targetHash || "",
      meshCount: uniqueSorted(assets.meshPaths).length,
      skeletonCount: uniqueSorted(assets.skeletonPaths).length,
      animationCount: uniqueSorted(assets.animationPaths).length,
      bindTokens: sample(assets.bindTokens, 16),
      meshSamples: sample(assets.meshPaths, 4),
      skeletonSamples: sample(assets.skeletonPaths, 4),
      animationLabelSamples: sample(assets.animationLabels, 10),
      targetLinkedPath: definition.targetLinkedPath || "",
    };
  });
}

function summarize(rows) {
  const bindTokens = uniqueSorted(rows.flatMap((row) => String(row.bindTokens || "").split("|").filter(Boolean)));
  return {
    rows: rows.length,
    resolvedDefinitions: rows.filter((row) => row.targetMatched === "yes").length,
    exactResolvedDefinitions: rows.filter((row) => row.resolutionSource === "exact-label").length,
    probableAliasResolvedDefinitions: rows.filter((row) => row.resolutionSource === "probable-label-alias").length,
    unresolvedDefinitions: rows.filter((row) => row.resolutionSource === "unresolved").length,
    withMesh: rows.filter((row) => Number(row.meshCount) > 0).length,
    withSkeleton: rows.filter((row) => Number(row.skeletonCount) > 0).length,
    withAnimations: rows.filter((row) => Number(row.animationCount) > 0).length,
    bindTokenCount: bindTokens.length,
    bindTokenSamples: bindTokens.slice(0, 24),
  };
}

function exportAttachableEquipmentChain({
  instanceStringsPath = defaultInstanceStringsPath,
  definitionManifestPath = defaultDefinitionManifestPath,
  assetLinksPath = defaultAssetLinksPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const rows = buildAttachableEquipmentRows({
    instanceRows: loadTsv(instanceStringsPath),
    definitionRows: loadTsv(definitionManifestPath),
    assetRows: loadTsv(assetLinksPath),
  });
  const columns = [
    "inventoryId",
    "attachmentLabel",
    "resolvedManifestLabel",
    "resolutionSource",
    "sourceBlocks",
    "targetRelativePath",
    "targetMatched",
    "targetHash",
    "meshCount",
    "skeletonCount",
    "animationCount",
    "bindTokens",
    "meshSamples",
    "skeletonSamples",
    "animationLabelSamples",
    "targetLinkedPath",
  ];
  writeTsv(tsvOut, rows, columns);
  const summary = summarize(rows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAttachableEquipmentChain({
    instanceStringsPath: optionValue(args, "--instance-strings", defaultInstanceStringsPath),
    definitionManifestPath: optionValue(args, "--definition-manifest", defaultDefinitionManifestPath),
    assetLinksPath: optionValue(args, "--asset-links", defaultAssetLinksPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAttachableEquipmentRows,
  buildAssetMap,
  buildDefinitionMap,
  editDistanceAtMostOne,
  exportAttachableEquipmentChain,
  extractManifestPairs,
  findDefinitionForLabel,
  normalizedLabel,
  parseTsv,
  summarize,
};
