#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultTsvOut = "extracted/reports/definition_manifest_chain.tsv";
const defaultJsonOut = "extracted/reports/definition_manifest_chain_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseTsv(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const columns = lines[0].split("\t");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
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

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function categoryFamily(relativePath) {
  if (/^Characters\//.test(relativePath)) return "character";
  if (/^Progression\//.test(relativePath)) return "progression";
  if (/^Effects\//.test(relativePath)) return "effect";
  if (/^Sounds\//.test(relativePath)) return "sound";
  if (/^Levels\//.test(relativePath)) return "level";
  if (/^Menus\//.test(relativePath)) return "menu";
  if (/^UI\//.test(relativePath)) return "ui";
  if (/^Buffs\//.test(relativePath)) return "buff";
  if (/^Talents\//.test(relativePath)) return "talent";
  return "other";
}

function summarizeDefinitionRows(rows) {
  const counts = {};
  const matchedCounts = {};
  const samplesByCategory = {};
  const labelsByCategory = {};

  for (const row of rows) {
    increment(counts, row.category || "unknown");
    if (row.matched === "yes") increment(matchedCounts, row.category || "unknown");
    if (!samplesByCategory[row.category]) samplesByCategory[row.category] = [];
    if (!labelsByCategory[row.category]) labelsByCategory[row.category] = [];
    if (samplesByCategory[row.category].length < 3) samplesByCategory[row.category].push(row.targetRelativePath);
    if (row.label && labelsByCategory[row.category].length < 8) labelsByCategory[row.category].push(row.label);
  }

  return {
    counts,
    matchedCounts,
    samplesByCategory,
    labelsByCategory,
  };
}

function buildDefinitionManifestChainRows(rows) {
  const bySource = new Map();
  for (const row of rows) {
    if (!bySource.has(row.sourceRelativePath)) bySource.set(row.sourceRelativePath, []);
    bySource.get(row.sourceRelativePath).push(row);
  }

  const manifestRows = rows.filter(
    (row) => row.sourceRelativePath === "Levels/DefinitionManifest.def" && row.category === "definition",
  );

  return manifestRows.map((row) => {
    const childRows = bySource.get(row.targetRelativePath) || [];
    const childSummary = summarizeDefinitionRows(childRows);
    const counts = childSummary.counts;
    const matchedCounts = childSummary.matchedCounts;
    const unmatchedCount = childRows.filter((child) => child.matched !== "yes").length;

    return {
      manifestLabel: row.label,
      targetRelativePath: row.targetRelativePath,
      targetHash: row.targetHash,
      targetMatched: row.matched,
      targetLinkedPath: row.targetLinkedPath,
      targetFamily: categoryFamily(row.targetRelativePath),
      childResourceRows: childRows.length,
      childUnmatchedRows: unmatchedCount,
      definitionCount: counts.definition || 0,
      meshCount: counts.mesh || 0,
      skeletonCount: counts.skeleton || 0,
      animationCount: counts.animation || 0,
      effectCount: counts.effect || 0,
      audioCount: counts.audio || 0,
      imageCount: counts.image || 0,
      matchedMeshCount: matchedCounts.mesh || 0,
      matchedSkeletonCount: matchedCounts.skeleton || 0,
      matchedAnimationCount: matchedCounts.animation || 0,
      meshSamples: (childSummary.samplesByCategory.mesh || []).join("|"),
      skeletonSamples: (childSummary.samplesByCategory.skeleton || []).join("|"),
      animationLabels: (childSummary.labelsByCategory.animation || []).join("|"),
      meshLabels: (childSummary.labelsByCategory.mesh || []).join("|"),
    };
  });
}

function summarizeChain(rows) {
  const byFamily = {};
  const withMeshes = rows.filter((row) => row.meshCount > 0).length;
  const withSkeletons = rows.filter((row) => row.skeletonCount > 0).length;
  const withAnimations = rows.filter((row) => row.animationCount > 0).length;
  const unmatchedTargets = rows.filter((row) => row.targetMatched !== "yes").length;
  const childUnmatchedRows = rows.reduce((total, row) => total + row.childUnmatchedRows, 0);
  for (const row of rows) increment(byFamily, row.targetFamily);
  return {
    rows: rows.length,
    byFamily,
    withMeshes,
    withSkeletons,
    withAnimations,
    unmatchedTargets,
    childUnmatchedRows,
  };
}

function exportDefinitionManifestChainReport({
  linksPath = defaultLinksPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const rows = parseTsv(fs.readFileSync(linksPath, "utf8"));
  const chainRows = buildDefinitionManifestChainRows(rows);
  chainRows.sort((left, right) => {
    if (left.targetFamily !== right.targetFamily) return left.targetFamily.localeCompare(right.targetFamily);
    return left.manifestLabel.localeCompare(right.manifestLabel);
  });

  const columns = [
    "manifestLabel",
    "targetRelativePath",
    "targetHash",
    "targetMatched",
    "targetFamily",
    "childResourceRows",
    "childUnmatchedRows",
    "definitionCount",
    "meshCount",
    "skeletonCount",
    "animationCount",
    "effectCount",
    "audioCount",
    "imageCount",
    "matchedMeshCount",
    "matchedSkeletonCount",
    "matchedAnimationCount",
    "meshSamples",
    "skeletonSamples",
    "animationLabels",
    "meshLabels",
    "targetLinkedPath",
  ];
  writeTsv(tsvOut, chainRows, columns);

  const summary = summarizeChain(chainRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionManifestChainReport({
    linksPath: optionValue(args, "--links", defaultLinksPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionManifestChainRows,
  exportDefinitionManifestChainReport,
  parseTsv,
  summarizeChain,
};
