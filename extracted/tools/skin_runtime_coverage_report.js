#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSkinSummaryPath = "extracted/reports/skin_model_summary.tsv";
const defaultSkinnedManifestPath = "extracted/viewer/skinned-glb-pbr-manifest.json";
const defaultSkinManifestPath = "extracted/viewer/skin-glb-pbr-manifest.json";
const defaultAllPbrManifestPath = "extracted/viewer/all-glb-pbr-manifest.json";
const defaultTsvOut = "extracted/reports/skin_runtime_coverage.tsv";
const defaultJsonOut = "extracted/reports/skin_runtime_coverage_summary.json";

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

function readManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return manifest.items || manifest;
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function meshToGlbRel(meshPath) {
  return String(meshPath || "").replace(/\.mesh$/i, ".glb");
}

function firstMesh(row) {
  return splitList(row.meshes)[0] || "";
}

function byRel(items) {
  return new Map((items || []).map((item) => [item.rel, item]));
}

function byMesh(items) {
  const map = new Map();
  for (const item of items || []) {
    for (const key of [item.meshPath, item.sourceMeshPath, item.resolvedMeshPath].filter(Boolean)) {
      if (!map.has(key)) map.set(key, item);
    }
  }
  return map;
}

function materialIssues(item) {
  if (!item) return [];
  const materialCount = Number(item.materialCount || 0);
  const texturedMaterialCount = Number(item.texturedMaterialCount || 0);
  if (!materialCount) return [];
  if (texturedMaterialCount <= 0) return ["no-basecolor-texture"];
  if (texturedMaterialCount < materialCount) return ["partial-basecolor-texture"];
  return [];
}

function classifyUnlinkedCharacterModel(item) {
  const rel = item.rel || "";
  if (/^Characters\/Attachments\//.test(rel)) return "attachment";
  if (/\/Art(?:Trap|Wall|Goop|Tornado|Shield|Blade|Spirit|Arena|Zombie|Cloth)\//i.test(rel)) return "runtime-prop-candidate";
  if (/Trap|Wall|Goop|Tornado|Shield|Blade|Spirit|Zombie|Minion|Turret|Pet|Ball|Arena/i.test(item.variant || "")) {
    return "runtime-prop-candidate";
  }
  if (/^Characters\/(?:Cards|CardsChest|Coins|JoystickIndicator|GuildBanners|Gold|Minion|Turret|Kraken|Jungle)/.test(rel)) {
    return "non-hero-character-asset";
  }
  return "unlinked-character-model";
}

function issueText(issues) {
  return issues.length ? issues.join("|") : "ok";
}

function skinCoverageRow(row, indexes) {
  const meshPath = firstMesh(row);
  const rel = meshToGlbRel(meshPath);
  const skinnedItem = indexes.skinnedByMesh.get(meshPath) || indexes.skinnedByRel.get(rel);
  const skinItem = indexes.skinByMesh.get(meshPath) || indexes.skinByRel.get(rel);
  const allItem = indexes.allByRel.get(rel);
  const materialItem = skinnedItem || skinItem || allItem;
  const issues = [];

  if (!meshPath) issues.push("missing-mesh-reference");
  if (!allItem) issues.push("missing-pbr-glb");
  if (!skinItem) issues.push("missing-skin-preview-manifest");
  if (!skinnedItem) issues.push("missing-skinned-runtime-manifest");
  if (row.usesFallbackSkeleton === "unresolved") issues.push("unresolved-skeleton-in-definition");
  if (skinnedItem?.resolvedSkeletonSource && skinnedItem.resolvedSkeletonSource !== "primary") issues.push("fallback-skeleton");
  if (skinnedItem?.inferredSkeleton) issues.push("inferred-skeleton");
  issues.push(...materialIssues(materialItem));
  if (!Number(row.sameLabelAnimationCount || 0)) issues.push("no-same-label-animation");

  return {
    sourceKind: "skin-row",
    assetClass: "hero-or-skin",
    sourceRelativePath: row.sourceRelativePath,
    modelLabel: row.modelLabel,
    rel,
    meshPath,
    skeletons: row.skeletons,
    resolvedSkeletonPath: skinnedItem?.resolvedSkeletonPath || "",
    resolvedSkeletonSource: skinnedItem?.resolvedSkeletonSource || "",
    relationshipMatched: skinnedItem ? "yes" : "no",
    inSkinManifest: skinItem ? "yes" : "no",
    inSkinnedManifest: skinnedItem ? "yes" : "no",
    inAllPbrManifest: allItem ? "yes" : "no",
    materialCount: materialItem?.materialCount ?? "",
    texturedMaterialCount: materialItem?.texturedMaterialCount ?? "",
    normalMaterialCount: materialItem?.normalMaterialCount ?? "",
    roughnessMaterialCount: materialItem?.roughnessMaterialCount ?? "",
    sameLabelAnimationCount: row.sameLabelAnimationCount || "0",
    issues: issueText(issues),
  };
}

function unlinkedModelRow(item, skinRelSet, skinnedRelSet) {
  const issues = ["not-linked-to-skin-row"];
  const assetClass = classifyUnlinkedCharacterModel(item);
  if (assetClass === "runtime-prop-candidate") issues.push("runtime-prop-candidate");
  if (!skinnedRelSet.has(item.rel)) issues.push("not-in-skinned-runtime-manifest");
  issues.push(...materialIssues(item));

  return {
    sourceKind: "unlinked-character-model",
    assetClass,
    sourceRelativePath: "",
    modelLabel: item.variant || "",
    rel: item.rel,
    meshPath: item.sourceMeshPath || "",
    skeletons: "",
    resolvedSkeletonPath: "",
    resolvedSkeletonSource: "",
    relationshipMatched: "no",
    inSkinManifest: skinRelSet.has(item.rel) ? "yes" : "no",
    inSkinnedManifest: skinnedRelSet.has(item.rel) ? "yes" : "no",
    inAllPbrManifest: "yes",
    materialCount: item.materialCount ?? "",
    texturedMaterialCount: item.texturedMaterialCount ?? "",
    normalMaterialCount: item.normalMaterialCount ?? "",
    roughnessMaterialCount: item.roughnessMaterialCount ?? "",
    sameLabelAnimationCount: "",
    issues: issueText(issues),
  };
}

function buildSkinRuntimeCoverageRows({ skinRows, skinnedItems, skinItems, allPbrItems }) {
  const indexes = {
    skinnedByRel: byRel(skinnedItems),
    skinnedByMesh: byMesh(skinnedItems),
    skinByRel: byRel(skinItems),
    skinByMesh: byMesh(skinItems),
    allByRel: byRel(allPbrItems),
  };
  const skinRelSet = new Set();
  const skinnedRelSet = new Set((skinnedItems || []).map((item) => item.rel));
  const rows = [];

  for (const row of skinRows || []) {
    const coverage = skinCoverageRow(row, indexes);
    rows.push(coverage);
    if (coverage.rel) skinRelSet.add(coverage.rel);
  }

  for (const item of allPbrItems || []) {
    if (!item.rel?.startsWith("Characters/")) continue;
    if (skinRelSet.has(item.rel)) continue;
    rows.push(unlinkedModelRow(item, skinRelSet, skinnedRelSet));
  }

  return rows.sort((left, right) => {
    if (left.sourceKind !== right.sourceKind) return left.sourceKind.localeCompare(right.sourceKind);
    if (left.assetClass !== right.assetClass) return left.assetClass.localeCompare(right.assetClass);
    return left.rel.localeCompare(right.rel);
  });
}

function summarizeCoverageRows(rows) {
  const byIssue = {};
  const bySourceKind = {};
  const byAssetClass = {};
  for (const row of rows || []) {
    bySourceKind[row.sourceKind] = (bySourceKind[row.sourceKind] || 0) + 1;
    byAssetClass[row.assetClass] = (byAssetClass[row.assetClass] || 0) + 1;
    for (const issue of splitList(row.issues === "ok" ? "" : row.issues)) byIssue[issue] = (byIssue[issue] || 0) + 1;
  }
  const skinRows = rows.filter((row) => row.sourceKind === "skin-row");
  return {
    rows: rows.length,
    skinRows: skinRows.length,
    skinRowsInSkinnedManifest: skinRows.filter((row) => row.inSkinnedManifest === "yes").length,
    skinRowsMissingSkinnedManifest: skinRows.filter((row) => row.inSkinnedManifest !== "yes").length,
    skinRowsWithUnresolvedDefinitionSkeleton: skinRows.filter((row) => row.issues.includes("unresolved-skeleton-in-definition")).length,
    skinRowsWithFallbackSkeleton: skinRows.filter((row) => row.issues.includes("fallback-skeleton")).length,
    skinRowsWithTextureIssues: skinRows.filter((row) => /basecolor-texture/.test(row.issues)).length,
    unlinkedCharacterModels: rows.filter((row) => row.sourceKind === "unlinked-character-model").length,
    runtimePropCandidates: rows.filter((row) => row.assetClass === "runtime-prop-candidate").length,
    bySourceKind,
    byAssetClass,
    byIssue,
  };
}

function exportSkinRuntimeCoverageReport({
  skinSummaryPath = defaultSkinSummaryPath,
  skinnedManifestPath = defaultSkinnedManifestPath,
  skinManifestPath = defaultSkinManifestPath,
  allPbrManifestPath = defaultAllPbrManifestPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const rows = buildSkinRuntimeCoverageRows({
    skinRows: readTsv(skinSummaryPath),
    skinnedItems: readManifest(skinnedManifestPath),
    skinItems: readManifest(skinManifestPath),
    allPbrItems: readManifest(allPbrManifestPath),
  });

  writeTsv(tsvOut, rows, [
    "sourceKind",
    "assetClass",
    "sourceRelativePath",
    "modelLabel",
    "rel",
    "meshPath",
    "skeletons",
    "resolvedSkeletonPath",
    "resolvedSkeletonSource",
    "relationshipMatched",
    "inSkinManifest",
    "inSkinnedManifest",
    "inAllPbrManifest",
    "materialCount",
    "texturedMaterialCount",
    "normalMaterialCount",
    "roughnessMaterialCount",
    "sameLabelAnimationCount",
    "issues",
  ]);

  const summary = summarizeCoverageRows(rows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSkinRuntimeCoverageReport({
    skinSummaryPath: optionValue(args, "--skin-summary", defaultSkinSummaryPath),
    skinnedManifestPath: optionValue(args, "--skinned-manifest", defaultSkinnedManifestPath),
    skinManifestPath: optionValue(args, "--skin-manifest", defaultSkinManifestPath),
    allPbrManifestPath: optionValue(args, "--all-pbr-manifest", defaultAllPbrManifestPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildSkinRuntimeCoverageRows,
  classifyUnlinkedCharacterModel,
  exportSkinRuntimeCoverageReport,
  summarizeCoverageRows,
};
