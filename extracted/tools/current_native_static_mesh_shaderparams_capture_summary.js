#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetsPath = "extracted/reports/current_native_static_mesh_shaderparams_capture_targets.json";
const defaultInputPath = "extracted/reports/static_mesh_shaderparams_capture.jsonl";
const defaultViewerOut = "extracted/viewer/current-native-static-mesh-shaderparams-capture-summary.json";
const defaultJsonOut = "extracted/reports/current_native_static_mesh_shaderparams_capture_summary.json";
const defaultTsvOut = "extracted/reports/current_native_static_mesh_shaderparams_capture_summary.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCaptureRecords(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return { captureImported: false, records: [] };
  const records = fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { captureImported: true, records };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function tsvEscape(value) {
  if (Array.isArray(value)) return value.join("|");
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function shaderParamsEntriesFromSnapshot(snapshot) {
  return snapshot?.field68ShaderParamsList?.items || [];
}

function shaderParamValueRowsFromEntry(entry) {
  return entry?.shaderParamList?.items || [];
}

function summarizeCapture(
  { targetManifest = {}, inputPath = defaultInputPath } = {},
  generatedAt = new Date().toISOString(),
) {
  const targetSummary = targetManifest.summary || {};
  const targetRows = targetManifest.items || [];
  const targetHookRows = Number(targetSummary.hookTargetRows || targetRows.filter((row) => row.source === "hook-target").length || 0);
  const targetHooksReady = Boolean(
    targetSummary.levelVisualsApplySnapshotHookReady &&
      targetSummary.staticMeshSelectorFieldHooksReady &&
      targetSummary.shaderParamsBoundedPrefixCaptureReady &&
      Number(targetSummary.opcodeMismatchRows || 0) === 0,
  );
  const { captureImported, records } = readCaptureRecords(inputPath);
  const captureEvents = records.filter((record) => record.type === "static_mesh_shaderparams_capture_event");
  const targetEvents = captureEvents.filter((record) =>
    ["levelvisuals-field-snapshot", "levelvisuals-staticmesh-route-callsite", "staticmesh-field-snapshot"].includes(
      record.captureKind,
    ),
  );
  const captureLimitRows = records.filter((record) => record.type === "static_mesh_shaderparams_capture_suppressed").length;
  const levelVisualsSnapshots = targetEvents.filter((record) => record.levelVisualsSnapshot);
  const staticMeshSnapshots = targetEvents.filter((record) => record.staticMeshSnapshot);
  const shaderParamsListEntries = staticMeshSnapshots.flatMap((record) =>
    shaderParamsEntriesFromSnapshot(record.staticMeshSnapshot),
  );
  const shaderParamValueRows = shaderParamsListEntries.flatMap(shaderParamValueRowsFromEntry);
  const sourceKeyValues = uniqueSorted(shaderParamsListEntries.map((entry) => entry.sourceKey));
  const readyForManualShaderParamsReview = Boolean(
    captureImported &&
      captureLimitRows === 0 &&
      levelVisualsSnapshots.length > 0 &&
      staticMeshSnapshots.length > 0 &&
      shaderParamsListEntries.length > 0 &&
      sourceKeyValues.length > 0,
  );
  const captureStatus = !captureImported
    ? "capture-missing"
    : captureLimitRows
      ? "capture-limit-hit"
      : !targetEvents.length
        ? "no-target-events"
        : readyForManualShaderParamsReview
          ? "ready-for-manual-shaderparams-review"
          : "capture-incomplete";

  const summary = {
    captureImported,
    captureStatus,
    targetHookRows,
    targetHooksReady,
    captureEventRows: captureEvents.length,
    targetEventRows: targetEvents.length,
    captureLimitRows,
    levelVisualsSnapshotRows: levelVisualsSnapshots.length,
    staticMeshSnapshotRows: staticMeshSnapshots.length,
    shaderParamsListEntryRows: shaderParamsListEntries.length,
    shaderParamValueRows: shaderParamValueRows.length,
    sourceKeyValues,
    readyForManualShaderParamsReview,
    activeResourceSemanticsRecovered: false,
    shaderParamsValueSemanticsRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };

  return {
    generatedAt,
    source: {
      targetsPath: targetManifest.source?.binary || "",
      inputPath,
    },
    policy:
      "diagnostic-only StaticMesh ShaderParams capture summary; a ready capture only reaches manual schema review and never enables renderer takeover by itself",
    summary,
    interpretation: readyForManualShaderParamsReview
      ? "The imported capture contains live LevelVisuals and StaticMesh ShaderParams source-key evidence. Manual review is still required before this can inform active resource semantics."
      : "StaticMesh ShaderParams runtime evidence is incomplete or missing. Keep active resource semantics and renderer takeover disabled.",
    items: targetEvents.map((record, index) => ({
      index,
      event: record.event || "",
      captureKind: record.captureKind || "",
      staticMeshPointer: record.staticMeshSnapshot?.staticMeshPointer || "",
      levelVisualsPointer: record.levelVisualsSnapshot?.levelVisualsPointer || "",
      shaderParamsListPointer: record.staticMeshSnapshot?.field68ShaderParamsListPointer || "",
      sourceKeyValues: uniqueSorted(shaderParamsEntriesFromSnapshot(record.staticMeshSnapshot).map((entry) => entry.sourceKey)),
      shaderParamsListEntryRows: shaderParamsEntriesFromSnapshot(record.staticMeshSnapshot).length,
      shaderParamValueRows: shaderParamsEntriesFromSnapshot(record.staticMeshSnapshot).flatMap(shaderParamValueRowsFromEntry)
        .length,
      renderPromotionAllowed: false,
    })),
  };
}

function exportCurrentNativeStaticMeshShaderParamsCaptureSummary({
  targetsPath = defaultTargetsPath,
  inputPath = defaultInputPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const targetManifest = readJson(targetsPath, { summary: {}, items: [] });
  const manifest = summarizeCapture({ targetManifest, inputPath });
  writeJson(viewerOut, manifest);
  writeJson(jsonOut, manifest);
  writeTsv(tsvOut, manifest.items, [
    "index",
    "event",
    "captureKind",
    "staticMeshPointer",
    "levelVisualsPointer",
    "shaderParamsListPointer",
    "sourceKeyValues",
    "shaderParamsListEntryRows",
    "shaderParamValueRows",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeStaticMeshShaderParamsCaptureSummary({
    targetsPath: optionValue(args, "--targets", defaultTargetsPath),
    inputPath: optionValue(args, "--input", defaultInputPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  summarizeCapture,
  exportCurrentNativeStaticMeshShaderParamsCaptureSummary,
};
