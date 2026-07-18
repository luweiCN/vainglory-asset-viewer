#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultLinksPath = "extracted/reports/character_asset_links.tsv";
const defaultOutPath = "extracted/reports/skin_model_summary.tsv";

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

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function isCharacterArtMesh(link) {
  return (
    link.category === "mesh" &&
    link.label &&
    link.sourceRelativePath.startsWith("Characters/") &&
    link.targetRelativePath.startsWith("Characters/") &&
    link.targetRelativePath.includes("/Art/")
  );
}

function groupKey(sourceRelativePath, label) {
  return `${sourceRelativePath}\t${label}`;
}

function buildSkinModelSummary(links) {
  const groups = new Map();
  const skeletonsBySourceAndLabel = new Map();
  const animationsBySourceAndLabel = new Map();

  for (const link of links) {
    if (link.category === "skeleton") {
      const key = groupKey(link.sourceRelativePath, link.label);
      skeletonsBySourceAndLabel.set(key, [
        ...(skeletonsBySourceAndLabel.get(key) || []),
        link.targetRelativePath,
      ]);
    }

    if (link.category === "animation") {
      const key = groupKey(link.sourceRelativePath, link.label);
      animationsBySourceAndLabel.set(key, [
        ...(animationsBySourceAndLabel.get(key) || []),
        link.targetRelativePath,
      ]);
    }

    if (!isCharacterArtMesh(link)) continue;
    const key = groupKey(link.sourceRelativePath, link.label);
    if (!groups.has(key)) {
      groups.set(key, {
        sourceRelativePath: link.sourceRelativePath,
        modelLabel: link.label,
        meshes: [],
      });
    }
    groups.get(key).meshes.push(link.targetRelativePath);
  }

  return [...groups.values()]
    .map((group) => {
      const key = groupKey(group.sourceRelativePath, group.modelLabel);
      const ownSkeletons = uniqueSorted(skeletonsBySourceAndLabel.get(key) || []);
      const animations = uniqueSorted(animationsBySourceAndLabel.get(key) || []);

      return {
        sourceRelativePath: group.sourceRelativePath,
        modelLabel: group.modelLabel,
        meshCount: uniqueSorted(group.meshes).length,
        meshes: uniqueSorted(group.meshes).join("|"),
        skeletons: ownSkeletons.join("|"),
        usesFallbackSkeleton: ownSkeletons.length ? "no" : "unresolved",
        sameLabelAnimationCount: animations.length,
        firstSameLabelAnimations: animations.slice(0, 12).join("|"),
      };
    })
    .sort((left, right) => {
      const sourceOrder = left.sourceRelativePath.localeCompare(right.sourceRelativePath);
      if (sourceOrder) return sourceOrder;
      return left.modelLabel.localeCompare(right.modelLabel);
    });
}

function exportSkinModelSummary({ linksPath, outPath }) {
  const rows = buildSkinModelSummary(readTsv(linksPath));
  writeTsv(outPath, rows, [
    "sourceRelativePath",
    "modelLabel",
    "meshCount",
    "meshes",
    "skeletons",
    "usesFallbackSkeleton",
    "sameLabelAnimationCount",
    "firstSameLabelAnimations",
  ]);
  return { rows: rows.length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSkinModelSummary({
    linksPath: optionValue(args, "--links", defaultLinksPath),
    outPath: optionValue(args, "--out", defaultOutPath),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildSkinModelSummary,
  exportSkinModelSummary,
};
