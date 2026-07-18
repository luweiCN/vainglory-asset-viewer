#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultIosComponentSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10004.c";
const defaultIosPfxSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10066.c";
const defaultIosQueueSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1010a.c";
const defaultAndroidComponentSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009d3.c";
const defaultAndroidUpdateSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009d2.c";
const defaultAndroidPfxCoreSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c";
const defaultAndroidPfxFactorySourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f32.c";
const defaultAndroidPfxObjectSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f31.c";
const defaultAndroidPfxGlobalSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f34.c";
const defaultAndroidQueueSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01989.c";
const defaultGateAuditPath = "extracted/reports/kindred_hash_pfx_runtime_gate_audit.json";
const defaultJsonOut = "extracted/reports/kindred_effect_component_runtime_chain_audit.json";
const defaultViewerOut = "extracted/viewer/kindred-effect-component-runtime-chain-audit.json";
const defaultTsvOut = "extracted/reports/kindred_effect_component_runtime_chain_audit.tsv";

const PARAMETER_NAMES = ["Ally_Enemy", "Color", "Radius", "Alpha", "SizeXY", "Duration"];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function sourceBundleFromPaths(paths = {}) {
  return {
    iosComponent: {
      sourcePath: paths.iosComponentSourcePath || defaultIosComponentSourcePath,
      text: readText(paths.iosComponentSourcePath || defaultIosComponentSourcePath),
    },
    iosPfx: {
      sourcePath: paths.iosPfxSourcePath || defaultIosPfxSourcePath,
      text: readText(paths.iosPfxSourcePath || defaultIosPfxSourcePath),
    },
    iosQueue: {
      sourcePath: paths.iosQueueSourcePath || defaultIosQueueSourcePath,
      text: readText(paths.iosQueueSourcePath || defaultIosQueueSourcePath),
    },
    androidComponent: {
      sourcePath: paths.androidComponentSourcePath || defaultAndroidComponentSourcePath,
      text: readText(paths.androidComponentSourcePath || defaultAndroidComponentSourcePath),
    },
    androidUpdate: {
      sourcePath: paths.androidUpdateSourcePath || defaultAndroidUpdateSourcePath,
      text: readText(paths.androidUpdateSourcePath || defaultAndroidUpdateSourcePath),
    },
    androidPfxCore: {
      sourcePath: paths.androidPfxCoreSourcePath || defaultAndroidPfxCoreSourcePath,
      text: readText(paths.androidPfxCoreSourcePath || defaultAndroidPfxCoreSourcePath),
    },
    androidPfxFactory: {
      sourcePath: paths.androidPfxFactorySourcePath || defaultAndroidPfxFactorySourcePath,
      text: readText(paths.androidPfxFactorySourcePath || defaultAndroidPfxFactorySourcePath),
    },
    androidPfxObject: {
      sourcePath: paths.androidPfxObjectSourcePath || defaultAndroidPfxObjectSourcePath,
      text: readText(paths.androidPfxObjectSourcePath || defaultAndroidPfxObjectSourcePath),
    },
    androidPfxGlobal: {
      sourcePath: paths.androidPfxGlobalSourcePath || defaultAndroidPfxGlobalSourcePath,
      text: readText(paths.androidPfxGlobalSourcePath || defaultAndroidPfxGlobalSourcePath),
    },
    androidQueue: {
      sourcePath: paths.androidQueueSourcePath || defaultAndroidQueueSourcePath,
      text: readText(paths.androidQueueSourcePath || defaultAndroidQueueSourcePath),
    },
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function functionBlocksFor(source = {}) {
  if (!source.text) return [];
  return findFunctionBlocks(source.text.split(/\r?\n/));
}

function functionBlockByName(source, functionName) {
  if (!source?.text || !functionName) return null;
  return functionBlocksFor(source).find((block) => block.functionName === functionName) || null;
}

function firstFunctionBlockWithTokens(source, tokens = []) {
  if (!source?.text || !tokens.length) return null;
  return functionBlocksFor(source).find((block) => tokens.every((token) => block.text.includes(token))) || null;
}

function sourceTextForSpec(sources, spec) {
  if (spec.sourceKey && sources[spec.sourceKey]) return sources[spec.sourceKey];
  return null;
}

function sourceBlockForSpec(sources, spec) {
  const source = sourceTextForSpec(sources, spec);
  if (!source) return null;
  if (spec.sourceFunction) return functionBlockByName(source, spec.sourceFunction);
  return firstFunctionBlockWithTokens(source, spec.locatorTokens || spec.requiredTokens || []);
}

function evidenceStateFor(block, requiredTokens = []) {
  if (!block) return "source-function-missing";
  const missingTokens = requiredTokens.filter((token) => !block.text.includes(token));
  return missingTokens.length ? "required-token-missing" : "evidence-found";
}

function callTargetsFromBlock(block) {
  return uniqueSorted([...String(block?.text || "").matchAll(/\b(FUN_[0-9a-fA-F]+|thunk_FUN_[0-9a-fA-F]+)\s*\(/g)].map((match) => match[1]));
}

function auditSpec(sources, spec) {
  const source = sourceTextForSpec(sources, spec);
  const block = sourceBlockForSpec(sources, spec);
  const missingTokens = block ? spec.requiredTokens.filter((token) => !block.text.includes(token)) : spec.requiredTokens;
  return {
    id: spec.id,
    platform: spec.platform,
    chainStage: spec.chainStage,
    evidenceClass: spec.evidenceClass,
    sourceFile: source?.sourcePath || "",
    sourceFunction: block?.functionName || spec.sourceFunction || "",
    sourceLine: block?.startLine || "",
    sourceBlockFound: Boolean(block),
    evidenceState: evidenceStateFor(block, spec.requiredTokens),
    requiredTokens: spec.requiredTokens.join("|"),
    missingTokens: missingTokens.join("|"),
    callTargets: callTargetsFromBlock(block).join("|"),
    recoveredRuntimeFields: (spec.recoveredRuntimeFields || []).join("|"),
    originalEvidenceSummary: spec.originalEvidenceSummary,
    renderPromotionAllowed: false,
    nextRequiredEvidence: spec.nextRequiredEvidence,
  };
}

function chainSpecs() {
  return [
    {
      id: "ios-kindred-hash-create",
      platform: "ios",
      chainStage: "kindred-hash-create",
      evidenceClass: "closed-original-create-chain",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_100045334",
      requiredTokens: ["*KindredEffects*", "FUN_100045270", "param_1 + 0x50", "FUN_100045094"],
      originalEvidenceSummary: "hash token is resolved through *KindredEffects*, constructed as a PFX object, stored at component+0x50.",
      nextRequiredEvidence: "none-for-create-chain",
    },
    {
      id: "android-kindred-hash-create",
      platform: "android",
      chainStage: "kindred-hash-create",
      evidenceClass: "closed-original-create-chain",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d3364",
      requiredTokens: ["*KindredEffects*", "FUN_009d3278", "param_1 + 0x50", "FUN_009d3098"],
      originalEvidenceSummary: "hash token is resolved through *KindredEffects*, constructed as a PFX object, stored at component+0x50.",
      nextRequiredEvidence: "none-for-create-chain",
    },
    {
      id: "ios-string-or-hash-create",
      platform: "ios",
      chainStage: "string-or-hash-create",
      evidenceClass: "closed-original-create-chain",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_1000451ac",
      requiredTokens: ["*KindredEffects*", "0x811c9dc5", "FUN_100045270", "param_1 + 0x50", "FUN_100045094"],
      originalEvidenceSummary: "string path or FNV1a token path both converge on the same PFX object constructor.",
      nextRequiredEvidence: "none-for-create-chain",
    },
    {
      id: "android-string-or-hash-create",
      platform: "android",
      chainStage: "string-or-hash-create",
      evidenceClass: "closed-original-create-chain",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d31b4",
      requiredTokens: ["*KindredEffects*", "0x811c9dc5", "FUN_009d3278", "param_1 + 0x50", "FUN_009d3098"],
      originalEvidenceSummary: "string path or FNV1a token path both converge on the same PFX object constructor.",
      nextRequiredEvidence: "none-for-create-chain",
    },
    {
      id: "ios-pfx-factory-create",
      platform: "ios",
      chainStage: "pfx-factory-create",
      evidenceClass: "closed-original-factory-chain",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_100045270",
      requiredTokens: ["FUN_100658cac", "FUN_1006663f0", "FUN_100669c08"],
      originalEvidenceSummary: "component constructor normalizes the resource path and calls the native PFX factory.",
      nextRequiredEvidence: "none-for-factory-chain",
    },
    {
      id: "android-pfx-factory-create",
      platform: "android",
      chainStage: "pfx-factory-create",
      evidenceClass: "closed-original-factory-chain",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d3278",
      requiredTokens: ["FUN_00f1c800", "FUN_00f3428c", "FUN_00f32a6c"],
      originalEvidenceSummary: "component constructor normalizes the resource path and calls the native PFX factory.",
      nextRequiredEvidence: "none-for-factory-chain",
    },
    {
      id: "ios-parameter-index",
      platform: "ios",
      chainStage: "parameter-index",
      evidenceClass: "closed-original-parameter-chain",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_100045094",
      requiredTokens: ["FUN_100666230", ...PARAMETER_NAMES],
      recoveredRuntimeFields: PARAMETER_NAMES,
      originalEvidenceSummary: "runtime parameter names are read from the PFX object and packed into component+0x10c.",
      nextRequiredEvidence: "map-parameter-indices-to-surface-callback-inputs",
    },
    {
      id: "android-parameter-index",
      platform: "android",
      chainStage: "parameter-index",
      evidenceClass: "closed-original-parameter-chain",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d3098",
      requiredTokens: ["FUN_00f30afc", ...PARAMETER_NAMES],
      recoveredRuntimeFields: PARAMETER_NAMES,
      originalEvidenceSummary: "runtime parameter names are read from the PFX object and packed into component+0x10c.",
      nextRequiredEvidence: "map-parameter-indices-to-surface-callback-inputs",
    },
    {
      id: "ios-transform-sync",
      platform: "ios",
      chainStage: "transform-sync",
      evidenceClass: "closed-original-transform-chain",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_100045474",
      requiredTokens: ["param_1 + 0x50", "pfVar3", "param_1 + 0x68"],
      originalEvidenceSummary: "component transform matrix is copied into the PFX object before render submission.",
      nextRequiredEvidence: "none-for-transform-chain",
    },
    {
      id: "android-transform-sync",
      platform: "android",
      chainStage: "transform-sync",
      evidenceClass: "closed-original-transform-chain",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d34d4",
      requiredTokens: ["param_1 + 0x50", "pfVar6", "param_1 + 0x68"],
      originalEvidenceSummary: "component transform matrix is copied into the PFX object before render submission.",
      nextRequiredEvidence: "none-for-transform-chain",
    },
    {
      id: "ios-object-render-payload",
      platform: "ios",
      chainStage: "object-render-payload",
      evidenceClass: "closed-original-render-payload",
      sourceKey: "iosPfx",
      sourceFunction: "FUN_100667770",
      requiredTokens: ["return param_1 + 0x40"],
      originalEvidenceSummary: "native helper exposes the render payload at PFX object+0x40.",
      nextRequiredEvidence: "none-for-render-payload",
    },
    {
      id: "android-object-render-payload",
      platform: "android",
      chainStage: "object-render-payload",
      evidenceClass: "closed-original-render-payload",
      sourceKey: "androidPfxObject",
      sourceFunction: "FUN_00f31994",
      requiredTokens: ["return param_1 + 0x40"],
      originalEvidenceSummary: "native helper exposes the render payload at PFX object+0x40.",
      nextRequiredEvidence: "none-for-render-payload",
    },
    {
      id: "ios-render-queue-submit",
      platform: "ios",
      chainStage: "render-queue-submit",
      evidenceClass: "closed-original-render-submit",
      sourceKey: "iosComponent",
      locatorTokens: ["FUN_1010a1cc8", "FUN_100667770", "FUN_1010a1ef8"],
      requiredTokens: ["param_1 + 0x50", "FUN_1010a1cc8", "FUN_100667770", "FUN_1010a1ef8"],
      originalEvidenceSummary: "per-frame component update submits object+0x40 to the render queue with the component slot id.",
      nextRequiredEvidence: "map-render-queue-slot-to-draw-layer-and-sort-policy",
    },
    {
      id: "android-render-queue-submit",
      platform: "android",
      chainStage: "render-queue-submit",
      evidenceClass: "closed-original-render-submit",
      sourceKey: "androidUpdate",
      locatorTokens: ["FUN_01988c6c", "FUN_00f31994", "FUN_019894ac"],
      requiredTokens: ["param_1 + 0x50", "FUN_01988c6c", "FUN_00f31994", "FUN_019894ac"],
      originalEvidenceSummary: "per-frame component update submits object+0x40 to the render queue with the component slot id.",
      nextRequiredEvidence: "map-render-queue-slot-to-draw-layer-and-sort-policy",
    },
    {
      id: "ios-render-queue-dispatch",
      platform: "ios",
      chainStage: "render-queue-dispatch",
      evidenceClass: "closed-original-render-dispatch",
      sourceKey: "iosQueue",
      sourceFunction: "FUN_1010a1ef8",
      requiredTokens: ["0x20", "param_2", "0x10", "0x12"],
      originalEvidenceSummary: "render queue submit is an indirect vtable dispatch by component slot.",
      nextRequiredEvidence: "recover-vtable-target-draw-function",
    },
    {
      id: "android-render-queue-dispatch",
      platform: "android",
      chainStage: "render-queue-dispatch",
      evidenceClass: "closed-original-render-dispatch",
      sourceKey: "androidQueue",
      sourceFunction: "FUN_019894ac",
      requiredTokens: ["0x20", "param_2", "0x10", "0x12"],
      originalEvidenceSummary: "render queue submit is an indirect vtable dispatch by component slot.",
      nextRequiredEvidence: "recover-vtable-target-draw-function",
    },
    {
      id: "ios-lifecycle-method-a",
      platform: "ios",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_1000453bc",
      requiredTokens: ["param_1 + 0x50", "FUN_10066617c"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "android-lifecycle-method-a",
      platform: "android",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d33ec",
      requiredTokens: ["param_1 + 0x50", "FUN_00f309f4"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "ios-lifecycle-method-b",
      platform: "ios",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_1000453cc",
      requiredTokens: ["param_1 + 0x50", "FUN_1006661c4"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "android-lifecycle-method-b",
      platform: "android",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d33fc",
      requiredTokens: ["param_1 + 0x50", "FUN_00f30a1c"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "ios-lifecycle-method-c",
      platform: "ios",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_1000453dc",
      requiredTokens: ["param_1 + 0x50", "FUN_100666204"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "android-lifecycle-method-c",
      platform: "android",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d341c",
      requiredTokens: ["param_1 + 0x50", "FUN_00f30a80"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "ios-lifecycle-method-d",
      platform: "ios",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "iosComponent",
      sourceFunction: "FUN_1000453f0",
      requiredTokens: ["param_1 + 0x50", "FUN_1006661ec"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "android-lifecycle-method-d",
      platform: "android",
      chainStage: "lifecycle-method",
      evidenceClass: "closed-original-lifecycle-wrapper",
      sourceKey: "androidComponent",
      sourceFunction: "FUN_009d3430",
      requiredTokens: ["param_1 + 0x50", "FUN_00f30a68"],
      originalEvidenceSummary: "component wrapper forwards a lifecycle state change to the PFX object.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
    {
      id: "android-lifecycle-core-state",
      platform: "android",
      chainStage: "lifecycle-core-state",
      evidenceClass: "closed-original-lifecycle-state-bits",
      sourceKey: "androidPfxCore",
      sourceFunction: "FUN_00f30a80",
      requiredTokens: ["param_1 + 100", "& 7", "| uVar1"],
      originalEvidenceSummary: "core PFX object lifecycle state is encoded in low bits at object+100.",
      nextRequiredEvidence: "map-lifecycle-state-values-to-gameplay-timing",
    },
  ];
}

function summarize(items = [], gateSummary = {}) {
  const byChainStage = {};
  const byEvidenceState = {};
  const byPlatform = {};
  for (const item of items) {
    increment(byChainStage, item.chainStage);
    increment(byEvidenceState, item.evidenceState);
    increment(byPlatform, item.platform);
  }
  const closedRows = items.filter((item) => item.evidenceState === "evidence-found").length;
  return {
    rows: items.length,
    closedEvidenceRows: closedRows,
    missingEvidenceRows: items.length - closedRows,
    renderSubmitRows: items.filter((item) => item.chainStage === "render-queue-submit").length,
    closedRenderSubmitRows: items.filter(
      (item) => item.chainStage === "render-queue-submit" && item.evidenceState === "evidence-found",
    ).length,
    lifecycleRows: items.filter((item) => item.chainStage === "lifecycle-method").length,
    parameterIndexRows: items.filter((item) => item.chainStage === "parameter-index").length,
    pfxGateRows: gateSummary.rows || 0,
    pfxGateRendererLinkNeededRows: gateSummary.rendererLinkNeededRows || 0,
    pfxGateCreateChainUnresolvedRows: gateSummary.createChainUnresolvedRows || 0,
    renderPromotionAllowed: false,
    byChainStage,
    byEvidenceState,
    byPlatform,
  };
}

function buildKindredEffectComponentRuntimeChainAudit(
  { sources = null, gateAuditManifest = {} } = {},
  generatedAt = new Date().toISOString(),
) {
  const sourceBundle = sources || sourceBundleFromPaths();
  const items = chainSpecs().map((spec) => auditSpec(sourceBundle, spec));
  return {
    generatedAt,
    source: {
      iosComponentSourcePath: sourceBundle.iosComponent?.sourcePath || "",
      iosPfxSourcePath: sourceBundle.iosPfx?.sourcePath || "",
      iosQueueSourcePath: sourceBundle.iosQueue?.sourcePath || "",
      androidComponentSourcePath: sourceBundle.androidComponent?.sourcePath || "",
      androidUpdateSourcePath: sourceBundle.androidUpdate?.sourcePath || "",
      androidPfxCoreSourcePath: sourceBundle.androidPfxCore?.sourcePath || "",
      androidPfxFactorySourcePath: sourceBundle.androidPfxFactory?.sourcePath || "",
      androidPfxObjectSourcePath: sourceBundle.androidPfxObject?.sourcePath || "",
      androidPfxGlobalSourcePath: sourceBundle.androidPfxGlobal?.sourcePath || "",
      androidQueueSourcePath: sourceBundle.androidQueue?.sourcePath || "",
      gateAuditPath: defaultGateAuditPath,
    },
    summary: summarize(items, gateAuditManifest.summary || {}),
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
    id: item.id,
    platform: item.platform,
    chainStage: item.chainStage,
    evidenceClass: item.evidenceClass,
    sourceFile: item.sourceFile,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    sourceBlockFound: item.sourceBlockFound,
    evidenceState: item.evidenceState,
    requiredTokens: item.requiredTokens,
    missingTokens: item.missingTokens,
    recoveredRuntimeFields: item.recoveredRuntimeFields,
    callTargets: item.callTargets,
    renderPromotionAllowed: item.renderPromotionAllowed,
    nextRequiredEvidence: item.nextRequiredEvidence,
    originalEvidenceSummary: item.originalEvidenceSummary,
  }));
}

function exportKindredEffectComponentRuntimeChainAudit({
  gateAuditPath = defaultGateAuditPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  ...sourcePaths
} = {}) {
  const manifest = buildKindredEffectComponentRuntimeChainAudit({
    sources: sourceBundleFromPaths(sourcePaths),
    gateAuditManifest: readJson(gateAuditPath, {}),
  });
  manifest.source = { ...manifest.source, gateAuditPath };

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "id",
    "platform",
    "chainStage",
    "evidenceClass",
    "sourceFile",
    "sourceFunction",
    "sourceLine",
    "sourceBlockFound",
    "evidenceState",
    "requiredTokens",
    "missingTokens",
    "recoveredRuntimeFields",
    "callTargets",
    "renderPromotionAllowed",
    "nextRequiredEvidence",
    "originalEvidenceSummary",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportKindredEffectComponentRuntimeChainAudit({
    gateAuditPath: optionValue(args, "--gate-audit", defaultGateAuditPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    iosComponentSourcePath: optionValue(args, "--ios-component", defaultIosComponentSourcePath),
    iosPfxSourcePath: optionValue(args, "--ios-pfx", defaultIosPfxSourcePath),
    iosQueueSourcePath: optionValue(args, "--ios-queue", defaultIosQueueSourcePath),
    androidComponentSourcePath: optionValue(args, "--android-component", defaultAndroidComponentSourcePath),
    androidUpdateSourcePath: optionValue(args, "--android-update", defaultAndroidUpdateSourcePath),
    androidPfxCoreSourcePath: optionValue(args, "--android-pfx-core", defaultAndroidPfxCoreSourcePath),
    androidPfxFactorySourcePath: optionValue(args, "--android-pfx-factory", defaultAndroidPfxFactorySourcePath),
    androidPfxObjectSourcePath: optionValue(args, "--android-pfx-object", defaultAndroidPfxObjectSourcePath),
    androidPfxGlobalSourcePath: optionValue(args, "--android-pfx-global", defaultAndroidPfxGlobalSourcePath),
    androidQueueSourcePath: optionValue(args, "--android-queue", defaultAndroidQueueSourcePath),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildKindredEffectComponentRuntimeChainAudit,
  chainSpecs,
  exportKindredEffectComponentRuntimeChainAudit,
  reportRowsForManifest,
  sourceBundleFromPaths,
  summarize,
};
