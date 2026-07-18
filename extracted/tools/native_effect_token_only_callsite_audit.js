#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");
const { analyzeEffectHookBlock } = require("./native_effect_hook_builder_chain");
const { fnv1a32Hex } = require("./kindred_effect_hash_slots");

const defaultStaticAuditPath = "extracted/reports/effect_channel_static_resource_audit.json";
const defaultKindredHashSlotsPath = "extracted/reports/kindred_effect_hash_slots.json";
const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
];
const defaultJsonOut = "extracted/reports/native_effect_token_only_callsite_audit.json";
const defaultViewerOut = "extracted/viewer/native-effect-token-only-callsite-audit.json";
const defaultTsvOut = "extracted/reports/native_effect_token_only_callsite_audit.tsv";

const tokenOnlyClasses = new Set([
  "native-spawn-token-only-no-resource",
  "native-vcall-token-only-no-resource",
  "selector-output-token-only-no-resource",
]);

function optionValues(args, name, fallback) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.length ? values : fallback;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile) || /ios/i.test(sourceFile)) return "ios";
  return "";
}

function quotedStrings(text) {
  return [...String(text || "").matchAll(/"([^"\r\n]+)"/g)].map((match) => match[1]);
}

function symbolStrings(text) {
  return [...String(text || "").matchAll(/\bPTR_s_([A-Za-z0-9_./-]+)_[0-9a-fA-F]+\b/g)].map((match) =>
    match[1].replace(/_/g, "/"),
  );
}

function resourceLiterals(text) {
  return uniqueSorted(
    [...quotedStrings(text), ...symbolStrings(text)].filter((value) =>
      /(?:^|\/)(?:Effects|Characters|Levels|Props|Items|Vain|Node|Turret)[A-Za-z0-9_./-]*\.(?:pfx|def|mesh|anim|shadergraph|assetbundle)$/i.test(
        value,
      ) || /\.(?:pfx|assetbundle)\b/i.test(value),
    ),
  );
}

function pfxLiterals(text) {
  return resourceLiterals(text).filter((value) => /\.pfx$/i.test(value));
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function tokenOnlyRows(staticAuditManifest = {}) {
  return (staticAuditManifest.items || []).filter((item) => tokenOnlyClasses.has(item.staticEvidenceClass));
}

function buildKindredHashIndex(kindredHashSlotManifest = {}) {
  const index = new Map();
  for (const row of kindredHashSlotManifest.items || []) {
    const effectHashHex = String(row.effectHashHex || "").toUpperCase();
    if (!effectHashHex) continue;
    if (!index.has(effectHashHex)) {
      index.set(effectHashHex, {
        effectHashHex,
        resourcePaths: [],
        rows: [],
      });
    }
    const entry = index.get(effectHashHex);
    entry.rows.push(row);
    if (row.resourcePath) entry.resourcePaths.push(row.resourcePath);
  }

  for (const entry of index.values()) {
    entry.resourcePaths = uniqueSorted(entry.resourcePaths);
  }

  return index;
}

function buildFunctionBlockIndexFromSources(sourceFiles = [], wantedFunctions = new Set()) {
  const index = new Map();
  for (const source of sourceFiles || []) {
    if (!source?.text || !source?.sourceFile) continue;
    if (![...wantedFunctions].some((functionName) => source.text.includes(functionName))) continue;
    const blocks = findFunctionBlocks(source.text.split(/\r?\n/));
    for (const block of blocks) {
      if (!wantedFunctions.has(block.functionName)) continue;
      index.set(block.functionName, {
        ...block,
        sourceFile: source.sourceFile,
        platform: source.platform || sourcePlatform(source.sourceFile),
      });
    }
  }
  return index;
}

function buildFunctionBlockIndex(sourcePaths = defaultSourcePaths, wantedFunctions = new Set()) {
  const files = collectCFiles(sourcePaths);
  const sourceFiles = [];
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    if (![...wantedFunctions].some((functionName) => text.includes(functionName))) continue;
    sourceFiles.push({ sourceFile: filePath, platform: sourcePlatform(filePath), text });
  }
  return buildFunctionBlockIndexFromSources(sourceFiles, wantedFunctions);
}

function callsiteClassFor({ row, analysis, resources }) {
  if (resources.length) return "token-only-callsite-has-resource-literal-review";
  if (analysis.builderProviders.length) return `effect-hook-builder-${analysis.hookPattern}`;
  if (row.sourceKind === "native-effect-selector") return "selector-output-token-only";
  if (row.sourceKind === "native-effect-spawn") return "spawn-helper-token-only";
  if (row.sourceKind === "native-effect-vcall") return "native-vcall-token-only";
  return "token-only-callsite-unclassified";
}

function runtimeCreateBridgeStateFor({ row, analysis }) {
  if (analysis.builderProviders.length) return "builder-kindred-effects-create-chain";
  if (row.sourceKind === "native-effect-selector") return "selector-output-token-no-create-chain";
  if (row.sourceKind === "native-effect-spawn") return "spawn-helper-token-no-create-chain";
  return "native-vcall-token-no-create-chain";
}

function kindredHashLookupStateFor(kindredHashResourcePaths) {
  return kindredHashResourcePaths.length ? "exact-kindred-effects-hash-resource" : "kindred-effects-hash-missing";
}

function resourceOwnershipStateFor({ row, analysis, resources, kindredHashResourcePaths }) {
  if (resources.length) return "resource-literal-present-review";
  if (kindredHashResourcePaths.length && analysis.builderProviders.length) return "builder-kindred-effects-hash-resource";
  if (kindredHashResourcePaths.length && row.sourceKind === "native-effect-selector") {
    return "selector-output-kindred-effects-hash-resource";
  }
  if (kindredHashResourcePaths.length && row.sourceKind === "native-effect-spawn") return "spawn-token-kindred-effects-hash-resource";
  if (kindredHashResourcePaths.length) return "token-kindred-effects-hash-resource";
  if (analysis.builderProviders.length) return "builder-kindred-effects-hash-missing";
  if (row.sourceKind === "native-effect-selector") return "selector-output-kindred-effects-hash-missing";
  if (row.sourceKind === "native-effect-spawn") return "spawn-token-kindred-effects-hash-missing";
  return "token-only-no-resource-object";
}

function auditTokenOnlyRow(row, block, kindredHashIndex = new Map()) {
  const kindredEffectHashHex = row.effectToken ? fnv1a32Hex(row.effectToken) : "";
  const kindredHashEntry = kindredEffectHashHex ? kindredHashIndex.get(kindredEffectHashHex) : null;
  const kindredHashResourcePaths = uniqueSorted(kindredHashEntry?.resourcePaths || []);
  const kindredHashLookupState = row.effectToken
    ? kindredHashLookupStateFor(kindredHashResourcePaths)
    : "no-effect-token";
  const emptyAnalysis = {
    hookPattern: "function-missing",
    builderProviders: [],
    boneTokens: [],
    effectTokens: [],
    buffTokens: [],
    vcallOffsets: [],
    operationSequence: "",
  };
  if (!block) {
    return {
      id: row.id || "",
      effectToken: row.effectToken || "",
      sourceKind: row.sourceKind || "",
      staticEvidenceClass: row.staticEvidenceClass || "",
      sourceFunction: row.sourceFunction || "",
      sourceLine: row.sourceLine ?? "",
      platform: "",
      sourceFile: "",
      functionFound: false,
      callsiteClass: "function-missing",
      resourceOwnershipState: "function-missing",
      runtimeCreateBridgeState: "function-missing",
      kindredEffectHashHex,
      kindredHashLookupState,
      kindredHashResourceCount: kindredHashResourcePaths.length,
      kindredHashResourcePaths: kindredHashResourcePaths.join("|"),
      renderPromotionAllowed: false,
      builderProviders: "",
      hookPattern: emptyAnalysis.hookPattern,
      boneTokens: "",
      effectTokens: "",
      buffTokens: "",
      vcallOffsets: "",
      resourceLiterals: "",
      pfxResourceLiterals: "",
      actionKeys: listValue(row.actionKeys).join("|"),
      heroNames: listValue(row.heroNames).join("|"),
      operationSequence: "",
      nextRequiredEvidence: kindredHashResourcePaths.length
        ? "recover-or-locate-current-source-function-before-render-promotion"
        : "recover-or-locate-current-source-function",
    };
  }

  const analysis = analyzeEffectHookBlock(block.text);
  const resources = resourceLiterals(block.text);
  const pfxResources = pfxLiterals(block.text);
  const callsiteClass = callsiteClassFor({ row, analysis, resources });
  const resourceOwnershipState = resourceOwnershipStateFor({ row, analysis, resources, kindredHashResourcePaths });
  const runtimeCreateBridgeState = runtimeCreateBridgeStateFor({ row, analysis });
  return {
    id: row.id || "",
    effectToken: row.effectToken || "",
    sourceKind: row.sourceKind || "",
    staticEvidenceClass: row.staticEvidenceClass || "",
    sourceFunction: row.sourceFunction || "",
    sourceLine: row.sourceLine ?? "",
    platform: block.platform || "",
    sourceFile: block.sourceFile || "",
    functionFound: true,
    callsiteClass,
    resourceOwnershipState,
    runtimeCreateBridgeState,
    kindredEffectHashHex,
    kindredHashLookupState,
    kindredHashResourceCount: kindredHashResourcePaths.length,
    kindredHashResourcePaths: kindredHashResourcePaths.join("|"),
    renderPromotionAllowed: false,
    builderProviders: analysis.builderProviders.join("|"),
    hookPattern: analysis.hookPattern,
    boneTokens: analysis.boneTokens.join("|"),
    effectTokens: analysis.effectTokens.join("|"),
    buffTokens: analysis.buffTokens.join("|"),
    vcallOffsets: analysis.vcallOffsets.join("|"),
    resourceLiterals: resources.join("|"),
    pfxResourceLiterals: pfxResources.join("|"),
    actionKeys: listValue(row.actionKeys).join("|"),
    heroNames: listValue(row.heroNames).join("|"),
    operationSequence: analysis.operationSequence,
    nextRequiredEvidence:
      resourceOwnershipState === "resource-literal-present-review"
        ? "review-callsite-resource-literal-before-render-promotion"
        : kindredHashResourcePaths.length && analysis.builderProviders.length
          ? "connect-kindred-hash-resource-to-original-effect-renderer-before-promotion"
          : kindredHashResourcePaths.length
            ? "recover-selector-or-spawn-runtime-create-before-render-promotion"
            : "recover-alias-or-runtime-hash-substitution-for-kindred-effects-table",
  };
}

function summarize(items) {
  const bySourceKind = {};
  const byStaticEvidenceClass = {};
  const byCallsiteClass = {};
  const byResourceOwnershipState = {};
  const byRuntimeCreateBridgeState = {};
  const byKindredHashLookupState = {};
  for (const item of items || []) {
    increment(bySourceKind, item.sourceKind);
    increment(byStaticEvidenceClass, item.staticEvidenceClass);
    increment(byCallsiteClass, item.callsiteClass);
    increment(byResourceOwnershipState, item.resourceOwnershipState);
    increment(byRuntimeCreateBridgeState, item.runtimeCreateBridgeState);
    increment(byKindredHashLookupState, item.kindredHashLookupState);
  }
  const kindredHashResolvedItems = items.filter((item) => item.kindredHashResourceCount > 0);
  const kindredHashMissingItems = items.filter((item) => item.kindredHashLookupState === "kindred-effects-hash-missing");
  return {
    rows: items.length,
    uniqueEffectTokens: new Set(items.map((item) => item.effectToken).filter(Boolean)).size,
    functionsFound: items.filter((item) => item.functionFound).length,
    missingFunctionRows: items.filter((item) => !item.functionFound).length,
    hookBuilderRows: items.filter((item) => item.callsiteClass.startsWith("effect-hook-builder")).length,
    selectorOutputRows: items.filter((item) => item.callsiteClass === "selector-output-token-only").length,
    spawnRows: items.filter((item) => item.callsiteClass === "spawn-helper-token-only").length,
    nativeVcallRows: items.filter((item) => item.callsiteClass === "native-vcall-token-only").length,
    resourceLiteralRows: items.filter((item) => item.resourceLiterals).length,
    noResourceObjectRows: items.filter((item) => /no-resource-object$/.test(item.resourceOwnershipState)).length,
    builderRuntimeCreateBridgeRows: items.filter(
      (item) => item.runtimeCreateBridgeState === "builder-kindred-effects-create-chain",
    ).length,
    kindredHashResolvedRows: kindredHashResolvedItems.length,
    kindredHashResolvedUniqueTokens: new Set(kindredHashResolvedItems.map((item) => item.effectToken).filter(Boolean)).size,
    kindredHashMissingRows: kindredHashMissingItems.length,
    kindredHashMissingUniqueTokens: new Set(kindredHashMissingItems.map((item) => item.effectToken).filter(Boolean)).size,
    builderKindredHashResolvedRows: items.filter(
      (item) =>
        item.runtimeCreateBridgeState === "builder-kindred-effects-create-chain" && item.kindredHashResourceCount > 0,
    ).length,
    builderKindredHashMissingRows: items.filter(
      (item) =>
        item.runtimeCreateBridgeState === "builder-kindred-effects-create-chain" &&
        item.kindredHashLookupState === "kindred-effects-hash-missing",
    ).length,
    renderPromotionAllowed: false,
    bySourceKind,
    byStaticEvidenceClass,
    byCallsiteClass,
    byResourceOwnershipState,
    byRuntimeCreateBridgeState,
    byKindredHashLookupState,
  };
}

function buildNativeEffectTokenOnlyCallsiteAudit(
  { staticAuditManifest = {}, kindredHashSlotManifest = {}, sourceFiles = null, sourcePaths = defaultSourcePaths } = {},
  generatedAt = new Date().toISOString(),
) {
  const rows = tokenOnlyRows(staticAuditManifest);
  const kindredHashIndex = buildKindredHashIndex(kindredHashSlotManifest);
  const wantedFunctions = new Set(rows.map((row) => row.sourceFunction).filter(Boolean));
  const blockIndex = sourceFiles
    ? buildFunctionBlockIndexFromSources(sourceFiles, wantedFunctions)
    : buildFunctionBlockIndex(sourcePaths, wantedFunctions);
  const items = rows.map((row) => auditTokenOnlyRow(row, blockIndex.get(row.sourceFunction), kindredHashIndex));
  return {
    generatedAt,
    source: {
      staticAuditPath: defaultStaticAuditPath,
      kindredHashSlotsPath: defaultKindredHashSlotsPath,
      sourcePaths,
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
    staticEvidenceClass: item.staticEvidenceClass,
    sourceKind: item.sourceKind,
    platform: item.platform,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    callsiteClass: item.callsiteClass,
    resourceOwnershipState: item.resourceOwnershipState,
    builderProviders: item.builderProviders,
    hookPattern: item.hookPattern,
    boneTokens: item.boneTokens,
    vcallOffsets: item.vcallOffsets,
    resourceLiterals: item.resourceLiterals,
    pfxResourceLiterals: item.pfxResourceLiterals,
    runtimeCreateBridgeState: item.runtimeCreateBridgeState,
    kindredEffectHashHex: item.kindredEffectHashHex,
    kindredHashLookupState: item.kindredHashLookupState,
    kindredHashResourceCount: item.kindredHashResourceCount,
    kindredHashResourcePaths: item.kindredHashResourcePaths,
    nextRequiredEvidence: item.nextRequiredEvidence,
  }));
}

function exportNativeEffectTokenOnlyCallsiteAudit({
  staticAuditPath = defaultStaticAuditPath,
  kindredHashSlotsPath = defaultKindredHashSlotsPath,
  sourcePaths = defaultSourcePaths,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildNativeEffectTokenOnlyCallsiteAudit({
    staticAuditManifest: readJson(staticAuditPath, {}),
    kindredHashSlotManifest: readJson(kindredHashSlotsPath, {}),
    sourcePaths,
  });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "effectToken",
    "staticEvidenceClass",
    "sourceKind",
    "platform",
    "sourceFunction",
    "sourceLine",
    "callsiteClass",
    "resourceOwnershipState",
    "builderProviders",
    "hookPattern",
    "boneTokens",
    "vcallOffsets",
    "resourceLiterals",
    "pfxResourceLiterals",
    "runtimeCreateBridgeState",
    "kindredEffectHashHex",
    "kindredHashLookupState",
    "kindredHashResourceCount",
    "kindredHashResourcePaths",
    "nextRequiredEvidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectTokenOnlyCallsiteAudit({
    staticAuditPath: optionValue(args, "--static-audit", defaultStaticAuditPath),
    kindredHashSlotsPath: optionValue(args, "--kindred-hash-slots", defaultKindredHashSlotsPath),
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  auditTokenOnlyRow,
  buildKindredHashIndex,
  buildNativeEffectTokenOnlyCallsiteAudit,
  callsiteClassFor,
  kindredHashLookupStateFor,
  resourceOwnershipStateFor,
  runtimeCreateBridgeStateFor,
};
