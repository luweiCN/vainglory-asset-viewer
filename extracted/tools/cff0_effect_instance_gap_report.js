#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGraphPath = "extracted/viewer/cff0-effect-instance-graph.json";
const defaultViewerOut = "extracted/viewer/cff0-effect-instance-gaps.json";
const defaultTsvOut = "extracted/reports/cff0_effect_instance_gaps.tsv";
const defaultJsonOut = "extracted/reports/cff0_effect_instance_gaps_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
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

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedEntries(map) {
  return [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function missingReasonsForItem(item) {
  const reasons = [];
  if (!listValue(item.resolvedResourcePaths).length) reasons.push("missing-resource");
  if (requiresResolvedActionForItem(item) && !listValue(item.resolvedActionLabels).length && !listValue(item.resolvedActionKeys).length) {
    reasons.push("missing-action");
  }
  if (!listValue(item.resolvedBindingTargets).length) reasons.push("missing-binding");
  if (!listValue(item.resolvedStartSeconds).length) reasons.push("missing-timing");
  return reasons;
}

function requiresResolvedActionForItem(item = {}) {
  const nativeSourceKinds = listValue(item.nativeSourceKinds);
  return !nativeSourceKinds.length || !nativeSourceKinds.every((kind) => kind === "native-visual-binding");
}

function runtimeEvidenceKindsForItem(item = {}) {
  const kinds = [];
  if (
    listValue(item.nativeSourceKinds).length ||
    listValue(item.nativeHookMatchKinds).length ||
    listValue(item.nativeActionKeys).length ||
    listValue(item.nativeActionNames).length ||
    listValue(item.nativeResourcePaths).length ||
    listValue(item.nativeBindingTargets).length ||
    listValue(item.nativeRuntimeStartSeconds).length
  ) {
    kinds.push("native");
  }
  if (
    listValue(item.projectileRoles).length ||
    listValue(item.projectileActionKeys).length ||
    listValue(item.projectileBindingStatuses).length ||
    listValue(item.projectileBoneTokens).length ||
    listValue(item.projectileEmitterLabels).length ||
    listValue(item.projectileRuntimeStartSeconds).length ||
    listValue(item.projectileResourcePaths).length ||
    listValue(item.projectileMatchKinds).length
  ) {
    kinds.push("projectile");
  }
  return kinds;
}

function runtimeEvidenceKindForItem(item) {
  const kinds = runtimeEvidenceKindsForItem(item);
  return kinds.length ? kinds.join("|") : "definition-only";
}

function buildCff0EffectInstanceGapReport(graphManifest = {}, generatedAt = new Date().toISOString()) {
  const sourceItems = graphManifest.items || [];
  const gapItems = [];
  const byReason = new Map();
  const byOwner = new Map();
  let completeRows = 0;
  let runtimeLinkedRows = 0;
  let definitionOnlyRows = 0;
  let runtimeLinkedGapRows = 0;
  let definitionOnlyGapRows = 0;
  let missingResourceRows = 0;
  let missingActionRows = 0;
  let missingBindingRows = 0;
  let missingTimingRows = 0;

  for (const item of sourceItems) {
    const runtimeEvidenceKind = runtimeEvidenceKindForItem(item);
    const runtimeLinked = runtimeEvidenceKind !== "definition-only";
    if (runtimeLinked) runtimeLinkedRows += 1;
    else definitionOnlyRows += 1;

    const reasons = missingReasonsForItem(item);
    if (!reasons.length) {
      completeRows += 1;
      continue;
    }

    if (runtimeLinked) runtimeLinkedGapRows += 1;
    else definitionOnlyGapRows += 1;

    if (reasons.includes("missing-resource")) missingResourceRows += 1;
    if (reasons.includes("missing-action")) missingActionRows += 1;
    if (reasons.includes("missing-binding")) missingBindingRows += 1;
    if (reasons.includes("missing-timing")) missingTimingRows += 1;
    for (const reason of reasons) increment(byReason, reason);
    increment(byOwner, item.ownerLabel || "unknown");

    gapItems.push({
      ownerLabel: item.ownerLabel || "",
      effectToken: item.effectToken || "",
      missingReasons: reasons.join("|"),
      runtimeEvidenceKind,
      resolvedResourcePaths: listValue(item.resolvedResourcePaths),
      resolvedActionLabels: listValue(item.resolvedActionLabels),
      resolvedBindingTargets: listValue(item.resolvedBindingTargets),
      resolvedStartSeconds: listValue(item.resolvedStartSeconds),
      sourceRelativePath: item.relativePath || "",
      ownerLocalFieldOffset: item.ownerLocalFieldOffset || "",
      targetObjectOffset: item.targetObjectOffset || "",
    });
  }

  return {
    generatedAt,
    source: graphManifest.source || {},
    summary: {
      rows: sourceItems.length,
      completeRows,
      gapRows: gapItems.length,
      runtimeLinkedRows,
      definitionOnlyRows,
      runtimeLinkedGapRows,
      definitionOnlyGapRows,
      missingResourceRows,
      missingActionRows,
      missingBindingRows,
      missingTimingRows,
      byReason: Object.fromEntries(sortedEntries(byReason)),
      topOwners: sortedEntries(byOwner).slice(0, 20),
    },
    items: gapItems,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    ownerLabel: item.ownerLabel,
    effectToken: item.effectToken,
    missingReasons: item.missingReasons,
    runtimeEvidenceKind: item.runtimeEvidenceKind,
    resolvedResourceCount: item.resolvedResourcePaths.length,
    resolvedActionCount: item.resolvedActionLabels.length,
    resolvedBindingCount: item.resolvedBindingTargets.length,
    resolvedTimingCount: item.resolvedStartSeconds.length,
    resolvedResourcePaths: item.resolvedResourcePaths.join("|"),
    resolvedActionLabels: item.resolvedActionLabels.join("|"),
    resolvedBindingTargets: item.resolvedBindingTargets.join("|"),
    resolvedStartSeconds: item.resolvedStartSeconds.join("|"),
    sourceRelativePath: item.sourceRelativePath,
    ownerLocalFieldOffset: item.ownerLocalFieldOffset,
    targetObjectOffset: item.targetObjectOffset,
  }));
}

function exportCff0EffectInstanceGapReport({
  graphPath = defaultGraphPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const graphManifest = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const manifest = buildCff0EffectInstanceGapReport(graphManifest);

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "ownerLabel",
    "effectToken",
    "missingReasons",
    "runtimeEvidenceKind",
    "resolvedResourceCount",
    "resolvedActionCount",
    "resolvedBindingCount",
    "resolvedTimingCount",
    "resolvedResourcePaths",
    "resolvedActionLabels",
    "resolvedBindingTargets",
    "resolvedStartSeconds",
    "sourceRelativePath",
    "ownerLocalFieldOffset",
    "targetObjectOffset",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(exportCff0EffectInstanceGapReport({
    graphPath: optionValue(args, "--graph", defaultGraphPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  }), null, 2));
}

module.exports = {
  buildCff0EffectInstanceGapReport,
  exportCff0EffectInstanceGapReport,
  missingReasonsForItem,
  reportRowsForManifest,
  requiresResolvedActionForItem,
  runtimeEvidenceKindForItem,
  runtimeEvidenceKindsForItem,
};
