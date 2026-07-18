#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { categoryFor } = require("./export_resource_index");
const { hasPrintfPlaceholder, normalizeBuildPath } = require("./resource_index");

const defaultDecodedInstances = "extracted/reports/cff0_decoded_instances.tsv";
const defaultResourceIndex = "extracted/reports/build_resource_index.tsv";
const defaultOutDir = "extracted/reports";

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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function concreteRelativePath(value) {
  const relativePath = normalizeBuildPath(value);
  if (!relativePath || hasPrintfPlaceholder(relativePath)) return null;
  return relativePath;
}

function nearestLabelBefore(strings, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = strings[cursor].trim();
    if (!value || concreteRelativePath(value)) continue;
    return value;
  }
  return "";
}

function extractBuildLinksFromDecodedRow(row) {
  const strings = row.strings ? row.strings.split("|") : [];
  const links = [];

  strings.forEach((value, index) => {
    const targetRelativePath = concreteRelativePath(value.trim());
    if (!targetRelativePath) return;
    links.push({
      sourceRelativePath: row.relativePath,
      sourceHash: row.hash,
      blockIndex: row.blockIndex,
      stringIndex: index,
      label: nearestLabelBefore(strings, index),
      category: categoryFor(targetRelativePath),
      targetRelativePath,
      targetBuildPath: `build://${targetRelativePath}`,
    });
  });

  return links;
}

function resourceMapByPath(resourceRows) {
  return new Map(resourceRows.map((row) => [row.relativePath, row]));
}

function buildDefinitionLinks(decodedRows, resourceRows) {
  const resources = resourceMapByPath(resourceRows);
  const linksByKey = new Map();

  for (const row of decodedRows) {
    for (const link of extractBuildLinksFromDecodedRow(row)) {
      const key = [link.sourceRelativePath, link.label, link.category, link.targetRelativePath].join("\t");
      const resource = resources.get(link.targetRelativePath);
      if (!linksByKey.has(key)) {
        linksByKey.set(key, {
          sourceRelativePath: link.sourceRelativePath,
          sourceHash: link.sourceHash,
          blockIndexSet: new Set(),
          firstStringIndex: link.stringIndex,
          label: link.label,
          category: link.category,
          targetRelativePath: link.targetRelativePath,
          targetBuildPath: link.targetBuildPath,
          targetHash: resource?.hash || "",
          matched: resource ? "yes" : "no",
          targetLinkedPath: resource?.linkedPath || "",
        });
      }

      const merged = linksByKey.get(key);
      merged.blockIndexSet.add(String(link.blockIndex));
      if (link.stringIndex < merged.firstStringIndex) merged.firstStringIndex = link.stringIndex;
    }
  }

  return [...linksByKey.values()]
    .map((link) => {
      const blockIndexes = [...link.blockIndexSet].sort((left, right) => Number(left) - Number(right)).join(",");
      const { blockIndexSet, ...output } = link;
      return { ...output, blockIndexes };
    })
    .sort((left, right) => {
      const sourceOrder = left.sourceRelativePath.localeCompare(right.sourceRelativePath);
      if (sourceOrder) return sourceOrder;
      return left.firstStringIndex - right.firstStringIndex;
    });
}

function isCharacterAssetLink(link) {
  return link.sourceRelativePath.startsWith("Characters/") || link.targetRelativePath.startsWith("Characters/");
}

function exportDefinitionLinks({ decodedInstances, resourceIndex, outDir }) {
  const decodedRows = readTsv(decodedInstances);
  const resourceRows = readTsv(resourceIndex);
  const links = buildDefinitionLinks(decodedRows, resourceRows);
  const characterLinks = links.filter(isCharacterAssetLink);
  const columns = [
    "sourceRelativePath",
    "sourceHash",
    "blockIndexes",
    "firstStringIndex",
    "label",
    "category",
    "targetRelativePath",
    "targetBuildPath",
    "targetHash",
    "matched",
    "targetLinkedPath",
  ];

  writeTsv(path.join(outDir, "definition_build_links.tsv"), links, columns);
  writeTsv(path.join(outDir, "character_asset_links.tsv"), characterLinks, columns);

  return {
    links: links.length,
    characterLinks: characterLinks.length,
    matched: links.filter((link) => link.matched === "yes").length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionLinks({
    decodedInstances: optionValue(args, "--decoded", defaultDecodedInstances),
    resourceIndex: optionValue(args, "--resources", defaultResourceIndex),
    outDir: optionValue(args, "--out", defaultOutDir),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionLinks,
  exportDefinitionLinks,
  extractBuildLinksFromDecodedRow,
  nearestLabelBefore,
};
