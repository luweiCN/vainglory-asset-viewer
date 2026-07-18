#!/usr/bin/env node
const fs = require("node:fs");

function readManifest(filePath = "extracted/viewer/material-runtime-pipeline-manifest.json") {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unimplementedRows(manifest) {
  return (manifest.items || []).filter((row) => {
    if (!row.unimplementedRoleNames) return false;
    if (row.uvAnimationGapReason || row.uvAnimationRuntimeBlockers || row.shadergraphStatus !== "ok") return false;
    return true;
  });
}

function rowsWithExecutionMode(manifest, mode) {
  return (manifest.items || []).filter((row) => {
    return [
      row.alphaExecutionMode,
      row.colorExecutionMode,
      row.reflectionExecutionMode,
      row.uvAnimationExecutionMode,
    ].includes(mode);
  });
}

function countNames(rows, fieldName) {
  const counts = {};
  for (const row of rows || []) {
    for (const value of String(row[fieldName] || "").split("|").filter(Boolean)) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function statusSummary(manifest) {
  const items = manifest.items || [];
  const materialRows = items.filter((row) => row.materialIndex !== "");
  const diagnosticRows = rowsWithExecutionMode(manifest, "diagnostic");
  const runtimeRows = rowsWithExecutionMode(manifest, "runtime");
  const rows = unimplementedRows(manifest);
  return {
    rows: items.length,
    materialRows: materialRows.length,
    runtimeRows: runtimeRows.length,
    diagnosticRows: diagnosticRows.length,
    unimplementedRows: rows.length,
    uvAnimationGapRows: items.filter((row) => row.uvAnimationGapReason).length,
    rowsWithShaderPassState: items.filter((row) => row.shaderPassStateSignatures).length,
    rowsWithNativeUniformBindings: items.filter((row) => {
      try {
        return JSON.parse(row.nativeUniformBindings || "[]").length > 0;
      } catch {
        return false;
      }
    }).length,
    byShaderPassStateFamily: countNames(items, "shaderPassStateFamily"),
    byShaderPassStateWord0: countNames(items, "shaderPassStateWord0s"),
    byShaderPassStateWord1: countNames(items, "shaderPassStateWord1s"),
    byShaderPassStateWord2: countNames(items, "shaderPassStateWord2s"),
    byShaderPassStateWord3: countNames(items, "shaderPassStateWord3s"),
    byShaderPassBlendEnabled: countNames(items, "shaderPassBlendEnabled"),
    byShaderPassBlendPreset: countNames(items, "shaderPassBlendPreset"),
    byShaderPassDepthWrite: countNames(items, "shaderPassDepthWrite"),
    byShaderPassDepthTest: countNames(items, "shaderPassDepthTest"),
    byAlphaExecutionMode: countNames(items, "alphaExecutionMode"),
    byAlphaRuntimeStage: countNames(items, "alphaRuntimeStage"),
    byColorExecutionMode: countNames(items, "colorExecutionMode"),
    byColorMode: countNames(items, "colorMode"),
    byRimLookupGlowSampleCount: countNames(items, "rimLookupGlowSampleCount"),
    byNativeShaderMode: countNames(items, "nativeShaderMode"),
    byNativeShaderBlocker: countNames(items, "nativeShaderBlocker"),
    byUnhashedSampler: countNames(items, "unhashedSamplers"),
    byUnresolvedSampler: countNames(items, "unresolvedSamplers"),
    byRuntimeSamplerKind: countNames(items, "runtimeSamplerKinds"),
    rowsWithRuntimeSamplerRecords: items.filter((row) => {
      try {
        return JSON.parse(row.runtimeSamplerRecords || "[]").length > 0;
      } catch {
        return false;
      }
    }).length,
    byReflectionExecutionMode: countNames(items, "reflectionExecutionMode"),
    byUvAnimationExecutionMode: countNames(items, "uvAnimationExecutionMode"),
    byPreviewUvAnimationMode: countNames(items, "previewUvAnimationMode"),
    byUvAnimationRuntimeStage: countNames(items, "uvAnimationRuntimeStage"),
    byUvAnimationRuntimeBlocker: countNames(items, "uvAnimationRuntimeBlockers"),
    unimplementedSample: rows.slice(0, 20),
  };
}

function main() {
  const manifest = readManifest(process.argv[2]);
  const rows = unimplementedRows(manifest);
  console.log(JSON.stringify(statusSummary(manifest), null, 2));
  if (process.argv.includes("--fail-on-unimplemented") && rows.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { readManifest, statusSummary, unimplementedRows };
