#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultMaterialSourceProgramCaptureSummaryPath =
  "extracted/viewer/current-native-material-source-program-capture-summary.json";
const defaultStaticMeshShaderParamsCaptureSummaryPath =
  "extracted/viewer/current-native-static-mesh-shaderparams-capture-summary.json";
const defaultRuntimeKeySelectorCaptureSummaryPath = "extracted/viewer/runtime-key-selector-capture-summary.json";
const defaultEffectNativeChannelCaptureSummaryPath = "extracted/viewer/effect-native-channel-capture-summary.json";
const defaultPfxNativeCallbackCaptureSummaryPath = "extracted/viewer/pfx-native-callback-capture-summary.json";
const defaultLayoutBObjectAcRuntimeCaptureSummaryPath =
  "extracted/viewer/current-native-layout-b-object-ac-runtime-capture-summary.json";
const defaultViewerOut = "extracted/viewer/current-native-runtime-capture-gate-audit.json";
const defaultJsonOut = "extracted/reports/current_native_runtime_capture_gate_audit.json";
const defaultTsvOut = "extracted/reports/current_native_runtime_capture_gate_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function summaryFromJson(value) {
  if (!value || typeof value !== "object") return {};
  if (value.summary && typeof value.summary === "object") return value.summary;
  return value.captureStatus || value.captureImported !== undefined ? value : {};
}

function increment(map, key) {
  const safeKey = key || "unknown";
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function tsvEscape(value) {
  if (Array.isArray(value)) return value.join("|");
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function rowFromSummary({
  gate,
  domain,
  summary,
  readyField,
  statusField = "captureStatus",
  missingGateEvidence = [],
  summaryPath,
  liveCapturePath,
  refreshCommand,
  captureDoc,
  nextProofRequired,
}) {
  const captureStatus = summary[statusField] || "missing-summary";
  const captureImported = Boolean(summary.captureImported);
  const readyForManualReview = Boolean(summary[readyField]);
  const renderPromotionAllowedRows = Number(summary.renderPromotionAllowedRows || 0);
  return {
    gate,
    domain,
    summaryPath,
    liveCapturePath,
    refreshCommand,
    captureDoc,
    nextProofRequired,
    captureStatus,
    captureImported,
    readyForManualReview,
    missingGateEvidence,
    renderPromotionAllowed: renderPromotionAllowedRows > 0,
    renderPromotionAllowedRows,
    blocker: readyForManualReview
      ? "manual review still cannot promote renderer without the downstream ownership/formula gates"
      : "live original-runtime capture is missing or incomplete",
  };
}

function buildCurrentNativeRuntimeCaptureGateAudit(
  {
    materialSourceProgramCaptureSummaryPath = defaultMaterialSourceProgramCaptureSummaryPath,
    staticMeshShaderParamsCaptureSummaryPath = defaultStaticMeshShaderParamsCaptureSummaryPath,
    runtimeKeySelectorCaptureSummaryPath = defaultRuntimeKeySelectorCaptureSummaryPath,
    effectNativeChannelCaptureSummaryPath = defaultEffectNativeChannelCaptureSummaryPath,
    pfxNativeCallbackCaptureSummaryPath = defaultPfxNativeCallbackCaptureSummaryPath,
    layoutBObjectAcRuntimeCaptureSummaryPath = defaultLayoutBObjectAcRuntimeCaptureSummaryPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const materialSourceProgram = summaryFromJson(readJson(materialSourceProgramCaptureSummaryPath, { summary: {} }));
  const staticMeshShaderParams = summaryFromJson(readJson(staticMeshShaderParamsCaptureSummaryPath, { summary: {} }));
  const runtimeKeySelector = summaryFromJson(readJson(runtimeKeySelectorCaptureSummaryPath, { summary: {} }));
  const effectNativeChannel = summaryFromJson(readJson(effectNativeChannelCaptureSummaryPath, { summary: {} }));
  const pfxNativeCallback = summaryFromJson(readJson(pfxNativeCallbackCaptureSummaryPath, { summary: {} }));
  const layoutBObjectAc = summaryFromJson(readJson(layoutBObjectAcRuntimeCaptureSummaryPath, { summary: {} }));

  const rows = [
    rowFromSummary({
      gate: "material-source-program",
      domain: "material",
      summary: materialSourceProgram,
      readyField: "readyForManualTextureSamplerReview",
      summaryPath: materialSourceProgramCaptureSummaryPath,
      liveCapturePath: "extracted/reports/material_source_program_capture.jsonl",
      refreshCommand: "npm run material:capture:refresh --silent",
      captureDoc: "docs/material-runtime-capture.md",
      nextProofRequired: "source/program table, resource key, texture runtime, sampler unit, sourceKeyHash, and type4 patch in the same sequence",
    }),
    rowFromSummary({
      gate: "staticmesh-shaderparams",
      domain: "material",
      summary: staticMeshShaderParams,
      readyField: "readyForManualShaderParamsReview",
      summaryPath: staticMeshShaderParamsCaptureSummaryPath,
      liveCapturePath: "extracted/reports/static_mesh_shaderparams_capture.jsonl",
      refreshCommand: "npm run native:staticmesh-shaderparams:refresh --silent",
      captureDoc: "docs/effect-runtime-capture.md",
      nextProofRequired: "StaticMesh +0x68 ShaderParams source-key and ShaderParam values from the original runtime",
    }),
    rowFromSummary({
      gate: "runtime-key-selector",
      domain: "light-probe",
      summary: runtimeKeySelector,
      readyField: "lightProbeReadyForManualReview",
      missingGateEvidence: runtimeKeySelector.missingGateEvidence || [],
      summaryPath: runtimeKeySelectorCaptureSummaryPath,
      liveCapturePath: "extracted/reports/runtime_key_selector_capture.jsonl",
      refreshCommand: "npm run native:runtime-selector:summary --silent",
      captureDoc: "docs/runtime-key-selector-capture.md",
      nextProofRequired: "active key -> Level -> LevelVisuals -> profile -> probe position and Probe.Samples in the same sequence",
    }),
    rowFromSummary({
      gate: "effect-native-channel",
      domain: "effect",
      summary: effectNativeChannel,
      readyField: "readyForFullMappingReview",
      summaryPath: effectNativeChannelCaptureSummaryPath,
      liveCapturePath: "extracted/reports/effect_native_channel_capture.jsonl",
      refreshCommand: "npm run effect:capture:refresh --silent",
      captureDoc: "docs/effect-runtime-capture.md",
      nextProofRequired: "same-sample native effect-channel arguments, readable resource/channel mapping, and return values",
    }),
    rowFromSummary({
      gate: "pfx-native-callback",
      domain: "effect",
      summary: pfxNativeCallback,
      readyField: "readyForManualCallbackReview",
      summaryPath: pfxNativeCallbackCaptureSummaryPath,
      liveCapturePath: "extracted/reports/pfx_native_callback_capture.jsonl",
      refreshCommand: "npm run effect:capture:refresh --silent",
      captureDoc: "docs/pfx-runtime-overlay.md",
      nextProofRequired: "PFX native callback enter/leave samples with callback output semantics",
    }),
    rowFromSummary({
      gate: "layout-b-object-ac",
      domain: "effect",
      summary: layoutBObjectAc,
      readyField: "readyForManualProducerReview",
      summaryPath: layoutBObjectAcRuntimeCaptureSummaryPath,
      liveCapturePath: "extracted/reports/layout_b_object_ac_runtime_capture.jsonl",
      refreshCommand: "npm run effect:capture:refresh --silent",
      captureDoc: "docs/effect-runtime-capture.md",
      nextProofRequired: "live layout B object+0xac 0x200 producer tied to object identity, manager entry, and particle draw mask",
    }),
  ];

  const byCaptureStatus = {};
  for (const row of rows) increment(byCaptureStatus, row.captureStatus);
  const captureImportedRows = rows.filter((row) => row.captureImported).length;
  const captureReadyForManualReviewRows = rows.filter((row) => row.readyForManualReview).length;
  const captureMissingRows = rows.filter((row) => !row.captureImported || /missing/i.test(row.captureStatus)).length;
  const renderPromotionAllowedRows = rows.reduce((sum, row) => sum + row.renderPromotionAllowedRows, 0);

  const summary = {
    captureGateRows: rows.length,
    captureImportedRows,
    captureMissingRows,
    captureReadyForManualReviewRows,
    allRuntimeCapturesImported: captureImportedRows === rows.length,
    allRuntimeCapturesReadyForManualReview: captureReadyForManualReviewRows === rows.length,
    anyRenderPromotionAllowed: renderPromotionAllowedRows > 0,
    renderPromotionAllowedRows,
    byCaptureStatus,
    blockingGateNames: rows
      .filter((row) => !row.captureImported || !row.readyForManualReview || row.renderPromotionAllowedRows === 0)
      .map((row) => row.gate),
  };

  return {
    generatedAt,
    source: {
      materialSourceProgramCaptureSummaryPath,
      staticMeshShaderParamsCaptureSummaryPath,
      runtimeKeySelectorCaptureSummaryPath,
      effectNativeChannelCaptureSummaryPath,
      pfxNativeCallbackCaptureSummaryPath,
      layoutBObjectAcRuntimeCaptureSummaryPath,
    },
    policy:
      "diagnostic-only aggregate runtime capture gate; summarizes live-capture blockers without enabling renderer takeover",
    summary,
    items: rows,
  };
}

function exportCurrentNativeRuntimeCaptureGateAudit({
  materialSourceProgramCaptureSummaryPath = defaultMaterialSourceProgramCaptureSummaryPath,
  staticMeshShaderParamsCaptureSummaryPath = defaultStaticMeshShaderParamsCaptureSummaryPath,
  runtimeKeySelectorCaptureSummaryPath = defaultRuntimeKeySelectorCaptureSummaryPath,
  effectNativeChannelCaptureSummaryPath = defaultEffectNativeChannelCaptureSummaryPath,
  pfxNativeCallbackCaptureSummaryPath = defaultPfxNativeCallbackCaptureSummaryPath,
  layoutBObjectAcRuntimeCaptureSummaryPath = defaultLayoutBObjectAcRuntimeCaptureSummaryPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeRuntimeCaptureGateAudit({
    materialSourceProgramCaptureSummaryPath,
    staticMeshShaderParamsCaptureSummaryPath,
    runtimeKeySelectorCaptureSummaryPath,
    effectNativeChannelCaptureSummaryPath,
    pfxNativeCallbackCaptureSummaryPath,
    layoutBObjectAcRuntimeCaptureSummaryPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "gate",
    "domain",
    "summaryPath",
    "liveCapturePath",
    "refreshCommand",
    "captureDoc",
    "nextProofRequired",
    "captureStatus",
    "captureImported",
    "readyForManualReview",
    "missingGateEvidence",
    "renderPromotionAllowed",
    "renderPromotionAllowedRows",
    "blocker",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeRuntimeCaptureGateAudit({
    materialSourceProgramCaptureSummaryPath: optionValue(
      args,
      "--material-source-program-capture-summary",
      defaultMaterialSourceProgramCaptureSummaryPath,
    ),
    staticMeshShaderParamsCaptureSummaryPath: optionValue(
      args,
      "--staticmesh-shaderparams-capture-summary",
      defaultStaticMeshShaderParamsCaptureSummaryPath,
    ),
    runtimeKeySelectorCaptureSummaryPath: optionValue(
      args,
      "--runtime-key-selector-capture-summary",
      defaultRuntimeKeySelectorCaptureSummaryPath,
    ),
    effectNativeChannelCaptureSummaryPath: optionValue(
      args,
      "--effect-native-channel-capture-summary",
      defaultEffectNativeChannelCaptureSummaryPath,
    ),
    pfxNativeCallbackCaptureSummaryPath: optionValue(
      args,
      "--pfx-native-callback-capture-summary",
      defaultPfxNativeCallbackCaptureSummaryPath,
    ),
    layoutBObjectAcRuntimeCaptureSummaryPath: optionValue(
      args,
      "--layout-b-object-ac-runtime-capture-summary",
      defaultLayoutBObjectAcRuntimeCaptureSummaryPath,
    ),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeRuntimeCaptureGateAudit,
  exportCurrentNativeRuntimeCaptureGateAudit,
};
