#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultPfxPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultHookPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultCff0GraphPath = "extracted/viewer/cff0-effect-instance-graph.json";
const defaultJsonOut = "extracted/reports/effect_channel_static_resource_audit.json";
const defaultViewerOut = "extracted/viewer/effect-channel-static-resource-audit.json";
const defaultTsvOut = "extracted/reports/effect_channel_static_resource_audit.tsv";

const targetReasons = new Set([
  "global-resource-candidate-unresolved",
  "kindred-slot-candidate-unresolved",
  "native-effect-channel-resource-unresolved",
  "selector-output-paired-resource-missing",
  "selector-output-unresolved",
  "weak-resource-candidate",
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function buildPfxTokenIndex(pfxManifest) {
  const index = new Map();
  for (const item of pfxManifest.items || []) {
    const tokens = uniqueSorted([
      ...listValue(item.intrinsicEffectTokens),
      ...listValue(item.hookTokens),
      ...listValue(item.hookEffectTokens),
    ]);
    for (const token of tokens) {
      const paths = index.get(token) || [];
      paths.push(item.relativePath);
      index.set(token, paths);
    }
  }
  for (const [token, paths] of index) index.set(token, uniqueSorted(paths));
  return index;
}

function buildHookTokenIndex(hookManifest) {
  const index = new Map();
  for (const item of hookManifest.items || []) {
    const tokens = uniqueSorted([item.effectToken, item.token]);
    const resources = uniqueSorted(listValue(item.resourcePaths));
    const shadergraphs = uniqueSorted(listValue(item.shadergraphPaths));
    if (!resources.length && !shadergraphs.length) continue;
    for (const token of tokens) {
      const records = index.get(token) || [];
      records.push({
        resourcePaths: resources,
        shadergraphPaths: shadergraphs,
        resourceEvidenceSource: item.resourceEvidenceSource || "",
        aliasEvidenceStrength: item.aliasEvidenceStrength || "",
      });
      index.set(token, records);
    }
  }
  return index;
}

function buildCff0EffectIndex(cff0GraphManifest) {
  const index = new Map();
  for (const item of cff0GraphManifest.items || []) {
    const tokens = uniqueSorted([item.effectToken, ...listValue(item.referencedEffects)]);
    for (const token of tokens) {
      const records = index.get(token) || [];
      records.push({
        ownerLabel: item.ownerLabel || "",
        relativePath: item.relativePath || "",
        targetResources: listValue(item.targetResources),
        referencedResources: listValue(item.referencedResources),
      });
      index.set(token, records);
    }
  }
  return index;
}

function gapCandidatePaths(row) {
  return uniqueSorted([
    ...listValue(row.kindredCandidateResourcePaths),
    ...listValue(row.globalCandidateResourcePaths),
    ...listValue(row.pairedSelectorOutputResourcePaths),
    ...listValue(row.existingResourcePaths).filter((item) => /\.pfx$/i.test(item)),
  ]);
}

function hookIndexedPaths(records) {
  return uniqueSorted((records || []).flatMap((record) => record.resourcePaths || []));
}

function hookIndexedShadergraphs(records) {
  return uniqueSorted((records || []).flatMap((record) => record.shadergraphPaths || []));
}

function cff0Owners(records) {
  return uniqueSorted((records || []).map((record) => record.ownerLabel));
}

function cff0Definitions(records) {
  return uniqueSorted((records || []).map((record) => record.relativePath));
}

function staticEvidenceClassFor({ exactPfxResourcePaths, hookResourcePaths, gapResourcePaths, cff0Records }) {
  if (exactPfxResourcePaths.length === 1) return "exact-pfx-token-single";
  if (exactPfxResourcePaths.length > 1) return "exact-pfx-token-multiple";
  if (hookResourcePaths.length === 1) return "hook-resource-single";
  if (hookResourcePaths.length > 1) return "hook-resource-multiple";
  if (gapResourcePaths.length === 1) return "gap-candidate-single";
  if (gapResourcePaths.length > 1) return "gap-candidate-multiple";
  if ((cff0Records || []).length) return "cff0-effect-token-present-no-pfx";
  return "no-static-resource-evidence";
}

function noStaticResourceEvidenceClass(row) {
  if (row.reason === "selector-output-paired-resource-missing") return "selector-output-pair-only-no-resource";
  if (row.sourceKind === "native-effect-selector") return "selector-output-token-only-no-resource";
  if (row.sourceKind === "native-effect-spawn") return "native-spawn-token-only-no-resource";
  if (row.sourceKind === "native-effect-vcall") return "native-vcall-token-only-no-resource";
  return "no-static-resource-evidence";
}

function auditRow(row, indexes) {
  const effectToken = row.effectToken || row.token || "";
  const exactPfxResourcePaths = indexes.pfxByToken.get(effectToken) || [];
  const hookRecords = indexes.hooksByToken.get(effectToken) || [];
  const hookResourcePaths = hookIndexedPaths(hookRecords);
  const hookShadergraphPaths = hookIndexedShadergraphs(hookRecords);
  const cff0Records = indexes.cff0ByToken.get(effectToken) || [];
  const gapResourcePaths = gapCandidatePaths(row);
  const staticEvidenceClass = staticEvidenceClassFor({
    exactPfxResourcePaths,
    hookResourcePaths,
    gapResourcePaths,
    cff0Records,
  });
  const refinedStaticEvidenceClass =
    staticEvidenceClass === "no-static-resource-evidence"
      ? noStaticResourceEvidenceClass(row)
      : staticEvidenceClass;

  return {
    id: row.id || "",
    reason: row.reason || "",
    sourceKind: row.sourceKind || "",
    effectToken,
    actionKeys: listValue(row.actionKeys),
    heroNames: listValue(row.heroNames),
    heroResourceRoots: listValue(row.heroResourceRoots),
    sourceFunction: row.source?.functionName || "",
    sourceLine: row.source?.line ?? "",
    staticEvidenceClass: refinedStaticEvidenceClass,
    renderPromotionAllowed: false,
    exactPfxResourcePaths,
    hookResourcePaths,
    hookShadergraphPaths,
    gapResourcePaths,
    cff0OwnerLabels: cff0Owners(cff0Records),
    cff0DefinitionPaths: cff0Definitions(cff0Records),
  };
}

function summarize(items) {
  const byReason = {};
  const bySourceKind = {};
  const byStaticEvidenceClass = {};
  for (const item of items || []) {
    increment(byReason, item.reason);
    increment(bySourceKind, item.sourceKind);
    increment(byStaticEvidenceClass, item.staticEvidenceClass);
  }
  const tokenOnlyNoResourceClasses = new Set([
    "native-spawn-token-only-no-resource",
    "native-vcall-token-only-no-resource",
    "selector-output-token-only-no-resource",
  ]);
  return {
    rows: items.length,
    uniqueEffectTokens: new Set(items.map((item) => item.effectToken).filter(Boolean)).size,
    exactPfxTokenRows: items.filter((item) => item.staticEvidenceClass.startsWith("exact-pfx-token")).length,
    hookResourceRows: items.filter((item) => item.staticEvidenceClass.startsWith("hook-resource")).length,
    gapCandidateRows: items.filter((item) => item.staticEvidenceClass.startsWith("gap-candidate")).length,
    cff0OnlyRows: items.filter((item) => item.staticEvidenceClass === "cff0-effect-token-present-no-pfx").length,
    selectorPairOnlyRows: items.filter((item) => item.staticEvidenceClass === "selector-output-pair-only-no-resource").length,
    tokenOnlyNoResourceRows: items.filter((item) => tokenOnlyNoResourceClasses.has(item.staticEvidenceClass)).length,
    noStaticResourceEvidenceRows: items.filter((item) =>
      tokenOnlyNoResourceClasses.has(item.staticEvidenceClass) || item.staticEvidenceClass === "no-static-resource-evidence"
    ).length,
    renderPromotionAllowed: false,
    byReason,
    bySourceKind,
    byStaticEvidenceClass,
  };
}

function buildEffectChannelStaticResourceAudit(
  { gapManifest = {}, pfxManifest = {}, hookManifest = {}, cff0GraphManifest = {} } = {},
  generatedAt = new Date().toISOString(),
) {
  const indexes = {
    pfxByToken: buildPfxTokenIndex(pfxManifest),
    hooksByToken: buildHookTokenIndex(hookManifest),
    cff0ByToken: buildCff0EffectIndex(cff0GraphManifest),
  };
  const items = (gapManifest.items || [])
    .filter((row) => targetReasons.has(row.reason || ""))
    .map((row) => auditRow(row, indexes));
  return {
    generatedAt,
    source: {
      gapPath: defaultGapPath,
      pfxPath: defaultPfxPath,
      hookPath: defaultHookPath,
      cff0GraphPath: defaultCff0GraphPath,
    },
    summary: summarize(items),
    items,
  };
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

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    reason: item.reason,
    sourceKind: item.sourceKind,
    effectToken: item.effectToken,
    actionKeys: item.actionKeys,
    heroNames: item.heroNames,
    heroResourceRoots: item.heroResourceRoots,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    staticEvidenceClass: item.staticEvidenceClass,
    renderPromotionAllowed: item.renderPromotionAllowed,
    exactPfxResourcePaths: item.exactPfxResourcePaths,
    hookResourcePaths: item.hookResourcePaths,
    hookShadergraphPaths: item.hookShadergraphPaths,
    gapResourcePaths: item.gapResourcePaths,
    cff0OwnerLabels: item.cff0OwnerLabels,
    cff0DefinitionPaths: item.cff0DefinitionPaths,
  }));
}

function exportEffectChannelStaticResourceAudit({
  gapPath = defaultGapPath,
  pfxPath = defaultPfxPath,
  hookPath = defaultHookPath,
  cff0GraphPath = defaultCff0GraphPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildEffectChannelStaticResourceAudit({
    gapManifest: readJson(gapPath, { items: [] }),
    pfxManifest: readJson(pfxPath, { items: [] }),
    hookManifest: readJson(hookPath, { items: [] }),
    cff0GraphManifest: readJson(cff0GraphPath, { items: [] }),
  });
  manifest.source = { gapPath, pfxPath, hookPath, cff0GraphPath };

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "reason",
    "sourceKind",
    "effectToken",
    "actionKeys",
    "heroNames",
    "heroResourceRoots",
    "sourceFunction",
    "sourceLine",
    "staticEvidenceClass",
    "renderPromotionAllowed",
    "exactPfxResourcePaths",
    "hookResourcePaths",
    "hookShadergraphPaths",
    "gapResourcePaths",
    "cff0OwnerLabels",
    "cff0DefinitionPaths",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(exportEffectChannelStaticResourceAudit({
    gapPath: optionValue(args, "--gaps", defaultGapPath),
    pfxPath: optionValue(args, "--pfx", defaultPfxPath),
    hookPath: optionValue(args, "--hooks", defaultHookPath),
    cff0GraphPath: optionValue(args, "--cff0", defaultCff0GraphPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }), null, 2));
}

module.exports = {
  buildEffectChannelStaticResourceAudit,
  buildPfxTokenIndex,
  exportEffectChannelStaticResourceAudit,
  reportRowsForManifest,
  staticEvidenceClassFor,
  summarize,
};
