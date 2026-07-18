#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseAnimationLayout } = require("./animation_tools");
const { parseSkeletonFile } = require("./skeleton_tools");

const defaultManifestPath = "extracted/viewer/skin-glb-pbr-manifest.json";
const defaultSkinSummaryPath = "extracted/reports/skin_model_summary.tsv";
const defaultCharacterLinksPath = "extracted/reports/character_asset_links.tsv";
const defaultAnimationIndexPath = "extracted/reports/animation_resource_index.tsv";
const defaultSkeletonIndexPath = "extracted/reports/skeleton_resource_index.tsv";
const defaultJsonOut = "extracted/viewer/skin-animation-bindings.json";
const defaultTsvOut = "extracted/reports/skin_animation_bindings.tsv";

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
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function groupKey(sourceRelativePath, modelLabel) {
  return `${sourceRelativePath}\t${modelLabel}`;
}

function targetStem(targetRelativePath) {
  return path.basename(targetRelativePath || "", ".anim");
}

function actionKeyFromTarget(targetRelativePath) {
  const stem = targetStem(targetRelativePath);
  const dotIndex = stem.indexOf(".");
  return dotIndex >= 0 ? stem.slice(dotIndex + 1) : stem;
}

function titleCaseActionKey(actionKey) {
  return String(actionKey || "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join("");
}

function normalizedAnimationLabel(actionKey, label) {
  const key = String(actionKey || "").toLowerCase();
  if (key === "death" || key.endsWith("_death") || /^death\d*$/.test(key)) return "Death";
  return label || titleCaseActionKey(actionKey);
}

function baseAnimationDescriptors(baseAnimations) {
  return baseAnimations.map((animation) => ({
    animation,
    actionKey: actionKeyFromTarget(animation.targetRelativePath),
  }));
}

function matchingBaseDescriptor(specificAnimation, baseDescriptors) {
  const specificActionKey = actionKeyFromTarget(specificAnimation.targetRelativePath);
  return baseDescriptors
    .filter(
      ({ actionKey }) =>
        specificActionKey === actionKey ||
        specificActionKey.endsWith(`_${actionKey}`) ||
        specificActionKey.endsWith(`.${actionKey}`),
    )
    .sort((left, right) => right.actionKey.length - left.actionKey.length)[0] || null;
}

function labelsBySource(skinRows) {
  const output = new Map();
  for (const row of skinRows) {
    if (!output.has(row.sourceRelativePath)) output.set(row.sourceRelativePath, new Set());
    output.get(row.sourceRelativePath).add(row.modelLabel);
  }
  return output;
}

function animationGroups(characterLinks, skinRows) {
  const modelLabelsBySource = labelsBySource(skinRows);
  const baseBySource = new Map();
  const specificBySourceAndLabel = new Map();

  for (const link of characterLinks) {
    if (link.category !== "animation") continue;
    const modelLabels = modelLabelsBySource.get(link.sourceRelativePath) || new Set();
    const entry = {
      label: link.label,
      targetRelativePath: link.targetRelativePath,
    };

    if (modelLabels.has(link.label)) {
      const key = groupKey(link.sourceRelativePath, link.label);
      specificBySourceAndLabel.set(key, [...(specificBySourceAndLabel.get(key) || []), entry]);
    } else {
      baseBySource.set(link.sourceRelativePath, [...(baseBySource.get(link.sourceRelativePath) || []), entry]);
    }
  }

  return { baseBySource, specificBySourceAndLabel };
}

function uniqueAnimations(baseAnimations, specificAnimations) {
  const baseDescriptors = baseAnimationDescriptors(baseAnimations);
  const output = new Map();
  for (const { animation, actionKey } of baseDescriptors) {
    output.set(actionKey, { ...animation, actionKey, label: normalizedAnimationLabel(actionKey, animation.label), bindingSource: "base" });
  }
  for (const animation of specificAnimations) {
    const matchingBase = matchingBaseDescriptor(animation, baseDescriptors);
    const actionKey = matchingBase?.actionKey || actionKeyFromTarget(animation.targetRelativePath);
    const label = normalizedAnimationLabel(actionKey, matchingBase?.animation.label || titleCaseActionKey(actionKey) || animation.label);
    output.set(actionKey, {
      ...animation,
      actionKey,
      label,
      bindingSource: "specific",
    });
  }
  return [...output.values()].sort((left, right) => {
    const sourceRank = { specific: 0, base: 1 };
    const sourceOrder = (sourceRank[left.bindingSource] ?? 9) - (sourceRank[right.bindingSource] ?? 9);
    if (sourceOrder) return sourceOrder;
    return left.targetRelativePath.localeCompare(right.targetRelativePath);
  });
}

function buildSkinAnimationBindings({
  manifestItems,
  skinRows,
  characterLinks,
  animationInfoByPath,
  skeletonInfoByPath,
  generatedAt = new Date().toISOString(),
}) {
  const { baseBySource, specificBySourceAndLabel } = animationGroups(characterLinks, skinRows);
  const items = [];

  for (const item of manifestItems) {
    if (!item.relationshipMatched || !item.sourceRelativePath || !item.modelLabel) continue;
    const skeletonPath = item.skeletons?.[0] || "";
    const boneCount = skeletonPath ? skeletonInfoByPath.get(skeletonPath)?.boneCount ?? null : null;
    const sourceBaseAnimations = baseBySource.get(item.sourceRelativePath) || [];
    const sourceSpecificAnimations = specificBySourceAndLabel.get(groupKey(item.sourceRelativePath, item.modelLabel)) || [];
    const animations = uniqueAnimations(sourceBaseAnimations, sourceSpecificAnimations).map((animation) => {
      const info = animationInfoByPath.get(animation.targetRelativePath) || {};
      const trackCount = info.trackCount ?? null;
      return {
        label: animation.label,
        actionKey: animation.actionKey,
        bindingSource: animation.bindingSource,
        targetRelativePath: animation.targetRelativePath,
        duration: info.duration ?? null,
        fps: info.fps ?? null,
        frameCount: info.frameCount ?? null,
        trackCount,
        trackMatchesSkeleton: boneCount != null && trackCount === boneCount,
      };
    });

    items.push({
      rel: item.rel,
      character: item.character,
      modelLabel: item.modelLabel,
      sourceRelativePath: item.sourceRelativePath,
      skeletonPath,
      boneCount,
      animations,
    });
  }

  return {
    generatedAt,
    count: items.length,
    animationCount: items.reduce((sum, item) => sum + item.animations.length, 0),
    items,
  };
}

function readAnimationInfoByPath(animationIndexPath) {
  const output = new Map();
  for (const row of readTsv(animationIndexPath)) {
    const filePath = row.linkedPath || row.filePath;
    const layout = parseAnimationLayout(fs.readFileSync(filePath));
    output.set(row.relativePath, {
      hash: row.hash,
      linkedPath: filePath,
      duration: Number(layout.duration.toFixed(6)),
      fps: Number(layout.fps.toFixed(3)),
      frameCount: layout.frameCount,
      trackCount: layout.trackCount,
    });
  }
  return output;
}

function readSkeletonInfoByPath(skeletonIndexPath) {
  const output = new Map();
  for (const row of readTsv(skeletonIndexPath)) {
    const filePath = row.linkedPath || row.filePath;
    const skeleton = parseSkeletonFile(filePath);
    output.set(row.relativePath, {
      hash: row.hash,
      linkedPath: filePath,
      boneCount: skeleton.boneCount,
    });
  }
  return output;
}

function bindingRows(bindings) {
  const rows = [];
  for (const item of bindings.items) {
    for (const animation of item.animations) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        skeletonPath: item.skeletonPath,
        boneCount: item.boneCount,
        animationLabel: animation.label,
        bindingSource: animation.bindingSource,
        animationPath: animation.targetRelativePath,
        duration: animation.duration,
        fps: animation.fps,
        frameCount: animation.frameCount,
        trackCount: animation.trackCount,
        trackMatchesSkeleton: animation.trackMatchesSkeleton ? "yes" : "no",
      });
    }
  }
  return rows;
}

function exportSkinAnimationBindings({
  manifestPath,
  skinSummaryPath,
  characterLinksPath,
  animationIndexPath,
  skeletonIndexPath,
  jsonOut,
  tsvOut,
}) {
  const bindings = buildSkinAnimationBindings({
    manifestItems: JSON.parse(fs.readFileSync(manifestPath, "utf8")).items || [],
    skinRows: readTsv(skinSummaryPath),
    characterLinks: readTsv(characterLinksPath),
    animationInfoByPath: readAnimationInfoByPath(animationIndexPath),
    skeletonInfoByPath: readSkeletonInfoByPath(skeletonIndexPath),
  });
  const rows = bindingRows(bindings);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(bindings, null, 2)}\n`);
  writeTsv(tsvOut, rows, [
    "rel",
    "character",
    "modelLabel",
    "sourceRelativePath",
    "skeletonPath",
    "boneCount",
    "animationLabel",
    "bindingSource",
    "animationPath",
    "duration",
    "fps",
    "frameCount",
    "trackCount",
    "trackMatchesSkeleton",
  ]);

  return {
    items: bindings.count,
    animations: bindings.animationCount,
    matchedTracks: rows.filter((row) => row.trackMatchesSkeleton === "yes").length,
    mismatchedTracks: rows.filter((row) => row.trackMatchesSkeleton === "no").length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSkinAnimationBindings({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    skinSummaryPath: optionValue(args, "--skin-summary", defaultSkinSummaryPath),
    characterLinksPath: optionValue(args, "--character-links", defaultCharacterLinksPath),
    animationIndexPath: optionValue(args, "--animations", defaultAnimationIndexPath),
    skeletonIndexPath: optionValue(args, "--skeletons", defaultSkeletonIndexPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildSkinAnimationBindings,
  bindingRows,
  exportSkinAnimationBindings,
};
