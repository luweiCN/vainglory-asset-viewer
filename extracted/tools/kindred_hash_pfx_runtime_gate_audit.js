#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultNativeAuditPath = "extracted/reports/native_effect_token_only_callsite_audit.json";
const defaultPfxManifestPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultEffectGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultJsonOut = "extracted/reports/kindred_hash_pfx_runtime_gate_audit.json";
const defaultViewerOut = "extracted/viewer/kindred-hash-pfx-runtime-gate-audit.json";
const defaultTsvOut = "extracted/reports/kindred_hash_pfx_runtime_gate_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function itemsFromManifest(manifest) {
  return Array.isArray(manifest) ? manifest : manifest.items || [];
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

function buildPfxIndex(pfxManifest = {}) {
  const index = new Map();
  for (const item of itemsFromManifest(pfxManifest)) {
    if (item.relativePath) index.set(item.relativePath, item);
  }
  return index;
}

function pfxPathsForGap(row) {
  return uniqueSorted([
    row.pfxPath,
    ...(row.existingResourcePaths || []),
    ...(row.kindredCandidateResourcePaths || []),
    ...(row.globalCandidateResourcePaths || []),
    ...(row.pairedSelectorOutputResourcePaths || []),
  ]);
}

function buildGapIndexes(effectGapManifest = {}) {
  const byPfxPath = new Map();
  const byEffectAndPfxPath = new Map();
  for (const row of itemsFromManifest(effectGapManifest)) {
    for (const pfxPath of pfxPathsForGap(row)) {
      if (!byPfxPath.has(pfxPath)) byPfxPath.set(pfxPath, []);
      byPfxPath.get(pfxPath).push(row);
      const effectToken = row.effectToken || row.token || "";
      if (!effectToken) continue;
      const key = `${effectToken}\t${pfxPath}`;
      if (!byEffectAndPfxPath.has(key)) byEffectAndPfxPath.set(key, []);
      byEffectAndPfxPath.get(key).push(row);
    }
  }
  return { byEffectAndPfxPath, byPfxPath };
}

function surfaceRenderFamilies(pfxItem) {
  return uniqueSorted((pfxItem?.surfaceRecords || []).map((record) => record.prelude?.renderFamily || record.pfxRenderFamily || ""));
}

function countSurfaceRecords(pfxItem, predicate) {
  return (pfxItem?.surfaceRecords || []).filter(predicate).length;
}

function runtimeGateStateFor({ pfxItem, exactGapRows, samePfxGapRows, runtimeCreateBridgeState }) {
  if (!pfxItem) return "pfx-manifest-missing";
  if (exactGapRows.length) return "blocked-by-current-effect-runtime-gap";
  if (samePfxGapRows.length) return "pfx-has-other-runtime-gap-rows";
  if (runtimeCreateBridgeState !== "builder-kindred-effects-create-chain") {
    return "pfx-resource-found-create-chain-unresolved";
  }
  return "pfx-resource-found-renderer-link-needed";
}

function nextRequiredEvidenceFor(state) {
  if (state === "blocked-by-current-effect-runtime-gap") return "clear-current-effect-runtime-gap-before-promotion";
  if (state === "pfx-has-other-runtime-gap-rows") return "review-shared-pfx-gap-rows-before-promotion";
  if (state === "pfx-resource-found-create-chain-unresolved") return "recover-selector-or-spawn-create-chain-before-promotion";
  if (state === "pfx-manifest-missing") return "recover-missing-pfx-resource-or-package";
  return "connect-kindred-created-resource-to-original-pfx-renderer-lifecycle";
}

function buildKindredHashPfxRuntimeGateRows({ nativeAuditManifest = {}, pfxManifest = {}, effectGapManifest = {} } = {}) {
  const pfxIndex = buildPfxIndex(pfxManifest);
  const gapIndexes = buildGapIndexes(effectGapManifest);
  const rows = [];

  for (const nativeRow of nativeAuditManifest.items || []) {
    if (!nativeRow.kindredHashResourceCount || nativeRow.kindredHashResourceCount <= 0) continue;
    for (const pfxPath of listValue(nativeRow.kindredHashResourcePaths)) {
      const pfxItem = pfxIndex.get(pfxPath);
      const exactGapRows = gapIndexes.byEffectAndPfxPath.get(`${nativeRow.effectToken}\t${pfxPath}`) || [];
      const samePfxGapRows = gapIndexes.byPfxPath.get(pfxPath) || [];
      const runtimeGateState = runtimeGateStateFor({
        pfxItem,
        exactGapRows,
        samePfxGapRows,
        runtimeCreateBridgeState: nativeRow.runtimeCreateBridgeState,
      });
      const areaSurfaceRows = countSurfaceRecords(pfxItem, (record) => record.prelude?.renderFamily === "area");
      const shapeProfileRows = countSurfaceRecords(pfxItem, (record) => Boolean(record.shapeProfile));
      const emitterRuntimeProfileRows = countSurfaceRecords(pfxItem, (record) => Boolean(record.emitterRuntimeProfile));
      const lifecycleProfileRows = countSurfaceRecords(pfxItem, (record) =>
        Boolean(record.emitterRuntimeProfile?.lifecycleOffsets?.length || record.parameterProfile?.lifecycleOffsets?.length),
      );
      rows.push({
        id: `${nativeRow.id || nativeRow.effectToken}\t${pfxPath}`,
        effectToken: nativeRow.effectToken || "",
        platform: nativeRow.platform || "",
        sourceKind: nativeRow.sourceKind || "",
        sourceFunction: nativeRow.sourceFunction || "",
        sourceLine: nativeRow.sourceLine ?? "",
        runtimeCreateBridgeState: nativeRow.runtimeCreateBridgeState || "",
        resourceOwnershipState: nativeRow.resourceOwnershipState || "",
        kindredEffectHashHex: nativeRow.kindredEffectHashHex || "",
        pfxPath,
        pfxManifestFound: Boolean(pfxItem),
        pfxSurfaceRows: pfxItem?.surfaceRecords?.length || 0,
        pfxUniqueShadergraphRefCount: Number(pfxItem?.uniqueShadergraphRefCount) || 0,
        pfxSurfaceRenderFamilies: surfaceRenderFamilies(pfxItem).join("|"),
        pfxAreaSurfaceRows: areaSurfaceRows,
        pfxShapeProfileRows: shapeProfileRows,
        pfxEmitterRuntimeProfileRows: emitterRuntimeProfileRows,
        pfxLifecycleProfileRows: lifecycleProfileRows,
        pfxHookBindingProfileRows: pfxItem?.hookBindingProfiles?.length || 0,
        exactEffectGapRows: exactGapRows.length,
        samePfxGapRows: samePfxGapRows.length,
        gapReasons: uniqueSorted(exactGapRows.map((row) => row.reason)).join("|"),
        samePfxGapReasons: uniqueSorted(samePfxGapRows.map((row) => row.reason)).join("|"),
        runtimeGateState,
        renderPromotionAllowed: false,
        nextRequiredEvidence: nextRequiredEvidenceFor(runtimeGateState),
      });
    }
  }

  return rows.sort((left, right) => {
    const tokenOrder = left.effectToken.localeCompare(right.effectToken);
    if (tokenOrder) return tokenOrder;
    const pathOrder = left.pfxPath.localeCompare(right.pfxPath);
    if (pathOrder) return pathOrder;
    return left.platform.localeCompare(right.platform);
  });
}

function summarize(rows) {
  const byRuntimeGateState = {};
  const byRuntimeCreateBridgeState = {};
  const bySurfaceRenderFamily = {};
  for (const row of rows || []) {
    increment(byRuntimeGateState, row.runtimeGateState);
    increment(byRuntimeCreateBridgeState, row.runtimeCreateBridgeState);
    for (const family of listValue(row.pfxSurfaceRenderFamilies)) increment(bySurfaceRenderFamily, family);
  }
  return {
    rows: rows.length,
    uniqueEffectTokens: new Set(rows.map((row) => row.effectToken).filter(Boolean)).size,
    uniquePfxPaths: new Set(rows.map((row) => row.pfxPath).filter(Boolean)).size,
    pfxManifestFoundRows: rows.filter((row) => row.pfxManifestFound).length,
    builderCreateChainRows: rows.filter((row) => row.runtimeCreateBridgeState === "builder-kindred-effects-create-chain").length,
    createChainUnresolvedRows: rows.filter((row) => row.runtimeGateState === "pfx-resource-found-create-chain-unresolved").length,
    blockedByExactGapRows: rows.filter((row) => row.runtimeGateState === "blocked-by-current-effect-runtime-gap").length,
    sharedPfxGapRows: rows.filter((row) => row.runtimeGateState === "pfx-has-other-runtime-gap-rows").length,
    rendererLinkNeededRows: rows.filter((row) => row.runtimeGateState === "pfx-resource-found-renderer-link-needed").length,
    areaSurfaceRows: rows.filter((row) => row.pfxAreaSurfaceRows > 0).length,
    renderPromotionAllowed: false,
    byRuntimeGateState,
    byRuntimeCreateBridgeState,
    bySurfaceRenderFamily,
  };
}

function buildKindredHashPfxRuntimeGateAudit(
  { nativeAuditManifest = {}, pfxManifest = {}, effectGapManifest = {} } = {},
  generatedAt = new Date().toISOString(),
) {
  const items = buildKindredHashPfxRuntimeGateRows({ nativeAuditManifest, pfxManifest, effectGapManifest });
  return {
    generatedAt,
    source: {
      nativeAuditPath: defaultNativeAuditPath,
      pfxManifestPath: defaultPfxManifestPath,
      effectGapPath: defaultEffectGapPath,
    },
    summary: summarize(items),
    items,
  };
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

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    effectToken: item.effectToken,
    platform: item.platform,
    sourceKind: item.sourceKind,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    runtimeCreateBridgeState: item.runtimeCreateBridgeState,
    resourceOwnershipState: item.resourceOwnershipState,
    kindredEffectHashHex: item.kindredEffectHashHex,
    pfxPath: item.pfxPath,
    pfxManifestFound: item.pfxManifestFound,
    pfxSurfaceRows: item.pfxSurfaceRows,
    pfxUniqueShadergraphRefCount: item.pfxUniqueShadergraphRefCount,
    pfxSurfaceRenderFamilies: item.pfxSurfaceRenderFamilies,
    pfxAreaSurfaceRows: item.pfxAreaSurfaceRows,
    pfxShapeProfileRows: item.pfxShapeProfileRows,
    pfxEmitterRuntimeProfileRows: item.pfxEmitterRuntimeProfileRows,
    pfxLifecycleProfileRows: item.pfxLifecycleProfileRows,
    pfxHookBindingProfileRows: item.pfxHookBindingProfileRows,
    exactEffectGapRows: item.exactEffectGapRows,
    samePfxGapRows: item.samePfxGapRows,
    gapReasons: item.gapReasons,
    samePfxGapReasons: item.samePfxGapReasons,
    runtimeGateState: item.runtimeGateState,
    renderPromotionAllowed: item.renderPromotionAllowed,
    nextRequiredEvidence: item.nextRequiredEvidence,
  }));
}

function exportKindredHashPfxRuntimeGateAudit({
  nativeAuditPath = defaultNativeAuditPath,
  pfxManifestPath = defaultPfxManifestPath,
  effectGapPath = defaultEffectGapPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildKindredHashPfxRuntimeGateAudit({
    nativeAuditManifest: readJson(nativeAuditPath, {}),
    pfxManifest: readJson(pfxManifestPath, {}),
    effectGapManifest: readJson(effectGapPath, {}),
  });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "effectToken",
    "platform",
    "sourceKind",
    "sourceFunction",
    "sourceLine",
    "runtimeCreateBridgeState",
    "resourceOwnershipState",
    "kindredEffectHashHex",
    "pfxPath",
    "pfxManifestFound",
    "pfxSurfaceRows",
    "pfxUniqueShadergraphRefCount",
    "pfxSurfaceRenderFamilies",
    "pfxAreaSurfaceRows",
    "pfxShapeProfileRows",
    "pfxEmitterRuntimeProfileRows",
    "pfxLifecycleProfileRows",
    "pfxHookBindingProfileRows",
    "exactEffectGapRows",
    "samePfxGapRows",
    "gapReasons",
    "samePfxGapReasons",
    "runtimeGateState",
    "renderPromotionAllowed",
    "nextRequiredEvidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportKindredHashPfxRuntimeGateAudit({
    nativeAuditPath: optionValue(args, "--native-audit", defaultNativeAuditPath),
    pfxManifestPath: optionValue(args, "--pfx-manifest", defaultPfxManifestPath),
    effectGapPath: optionValue(args, "--effect-gaps", defaultEffectGapPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildGapIndexes,
  buildKindredHashPfxRuntimeGateAudit,
  buildKindredHashPfxRuntimeGateRows,
  buildPfxIndex,
  exportKindredHashPfxRuntimeGateAudit,
  runtimeGateStateFor,
  summarize,
};
