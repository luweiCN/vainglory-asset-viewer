#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { engineHashHex } = require("./engine_hash");

const defaultMaterialRuntimePath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultExternalTextureBindingPath = "extracted/viewer/current-native-shaderdata-external-texture-binding-audit.json";
const defaultInlineTexturePlaceholderPath =
  "extracted/viewer/current-native-shaderdata-inline-texture-placeholder-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shadergraph-sampler-texdata-join-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shadergraph_sampler_texdata_join_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shadergraph_sampler_texdata_join_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function parseJsonField(value, fallback) {
  if (value && typeof value === "object") return value;
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function splitPipeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addCount(counts, key, amount = 1) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + amount;
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce((sum, item) => sum + (Number(item) || 0), 0);
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

function setFromList(value) {
  return new Set(splitPipeList(value));
}

function isNativeSamplerName(value) {
  return /^sampler\d+$/.test(String(value || ""));
}

function addNativeSamplerName(samplers, value) {
  if (isNativeSamplerName(value)) samplers.add(value);
}

function sourceKeyHashForSamplerName(sampler) {
  return `0x${engineHashHex(sampler).toLowerCase()}`;
}

function samplerNamesForMaterialRow(row, samplerUnits, samplerHashes, samplerTexturePaths, runtimeSamplerRecords) {
  const samplers = new Set();
  for (const sampler of Object.keys(samplerUnits || {})) addNativeSamplerName(samplers, sampler);
  for (const sampler of Object.keys(samplerHashes || {})) addNativeSamplerName(samplers, sampler);
  for (const sampler of Object.keys(samplerTexturePaths || {})) addNativeSamplerName(samplers, sampler);
  for (const sampler of splitPipeList(row.unhashedSamplers)) addNativeSamplerName(samplers, sampler);
  for (const sampler of splitPipeList(row.texturePathMissingSamplers)) addNativeSamplerName(samplers, sampler);
  for (const sampler of splitPipeList(row.runtimeResolvedSamplers)) addNativeSamplerName(samplers, sampler);
  for (const sampler of splitPipeList(row.unresolvedSamplers)) addNativeSamplerName(samplers, sampler);
  for (const record of runtimeSamplerRecords || []) {
    addNativeSamplerName(samplers, record?.sampler);
  }
  return [...samplers].sort((left, right) => {
    const leftNumber = Number(String(left).replace(/^sampler/, ""));
    const rightNumber = Number(String(right).replace(/^sampler/, ""));
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });
}

function sourceFamily(source) {
  if (!source) return "";
  if (source.startsWith("same-shadergraph-role:")) return "same-shadergraph-role";
  if (source.startsWith("same-shadergraph-hash:")) return "same-shadergraph-hash";
  if (source.startsWith("global-hash:")) return "global-hash";
  return source;
}

function runtimeKindFamily(kind) {
  if (!kind) return "";
  if (kind === "runtime-fog-of-war-texture-diagnostic") return "runtime-scene-texture";
  if (kind === "tch0-inline-rgb-float-lookup" || kind === "tch0-inline-rgb-float-lookup-clamped") {
    return "tch0-inline-rgb-float-lookup";
  }
  return kind;
}

function classifySampler({
  sampler,
  hash,
  texturePath,
  textureSource,
  runtimeRecord,
  unresolvedSamplers,
  texturePathMissingSamplers,
  runtimeResolvedSamplers,
}) {
  const runtimeFamily = runtimeKindFamily(runtimeRecord?.kind || "");
  if (unresolvedSamplers.has(sampler)) return "unresolved-sampler";
  if (runtimeFamily === "runtime-scene-texture") return "runtime-scene-texture";
  if (runtimeFamily === "tch0-inline-rgb-float-lookup") return "tch0-inline-runtime-texture";
  if (hash && texturePath && sourceFamily(textureSource) === "global-hash") return "global-hash-texture-path";
  if (hash && texturePath) return "shadergraph-hash-texture-path";
  if (hash && !texturePath) return "hashed-texture-path-missing";
  if (!hash && texturePath) return "texture-path-without-hash";
  if (runtimeResolvedSamplers.has(sampler)) return "runtime-resolved-without-record";
  if (texturePathMissingSamplers.has(sampler)) return "texture-path-missing-without-runtime";
  return "unclassified-sampler";
}

function evidenceForRow(row) {
  if (row.classification === "shadergraph-hash-texture-path") {
    return `${row.sampler} unit ${row.unit} uses TCH0 texture hash ${row.hash} with ${row.textureSource || "same-shadergraph"} texture path`;
  }
  if (row.classification === "global-hash-texture-path") {
    return `${row.sampler} unit ${row.unit} uses TCH0 texture hash ${row.hash} resolved through global material texture hash index`;
  }
  if (row.classification === "tch0-inline-runtime-texture") {
    return `${row.sampler} unit ${row.unit} is an unhashed TCH0 inline RGB lookup payload at ${row.runtimeInlineLookupOffset || "unknown offset"}`;
  }
  if (row.classification === "runtime-scene-texture") {
    return `${row.sampler} unit ${row.unit} is supplied by runtime scene state ${row.runtimeSceneSemantic || "unknown semantic"}`;
  }
  if (row.classification === "hashed-texture-path-missing") {
    return `${row.sampler} has TCH0 texture hash ${row.hash} but no extracted material texture path`;
  }
  if (row.classification === "unresolved-sampler") return `${row.sampler} remains unresolved in the material runtime manifest`;
  return `${row.sampler} has no closed sampler resource classification`;
}

function staticResourceBindingMechanicsRecoveredForRow(row, externalSummary, inlineSummary) {
  if (
    row.classification === "shadergraph-hash-texture-path" ||
    row.classification === "global-hash-texture-path"
  ) {
    return Boolean(externalSummary.externalTextureSamplerRuntimeBindingRecovered);
  }
  if (row.classification === "tch0-inline-runtime-texture") {
    return Boolean(inlineSummary.inlineTextureObjectBindingRecovered) && !Boolean(inlineSummary.inlineTextureRuntimePatchRequired);
  }
  return false;
}

function buildSamplerRows(materialRuntime, externalSummary = {}, inlineSummary = {}) {
  const rows = [];
  const materialRows = (materialRuntime.items || []).filter((row) => row.shadergraphStatus === "ok");

  for (const materialRow of materialRows) {
    const samplerUnits = parseJsonField(materialRow.samplerUnits, {});
    const samplerHashes = parseJsonField(materialRow.samplerHashes, {});
    const samplerTexturePaths = parseJsonField(materialRow.samplerTexturePaths, {});
    const samplerTextureSources = parseJsonField(materialRow.samplerTextureSources, {});
    const runtimeSamplerRecords = parseJsonField(materialRow.runtimeSamplerRecords, []);
    const runtimeRecordBySampler = new Map(
      (runtimeSamplerRecords || []).filter((record) => record?.sampler).map((record) => [record.sampler, record]),
    );
    const unresolvedSamplers = setFromList(materialRow.unresolvedSamplers);
    const texturePathMissingSamplers = setFromList(materialRow.texturePathMissingSamplers);
    const runtimeResolvedSamplers = setFromList(materialRow.runtimeResolvedSamplers);
    const unhashedSamplers = setFromList(materialRow.unhashedSamplers);
    const samplerNames = samplerNamesForMaterialRow(
      materialRow,
      samplerUnits,
      samplerHashes,
      samplerTexturePaths,
      runtimeSamplerRecords,
    );

    for (const sampler of samplerNames) {
      const runtimeRecord = runtimeRecordBySampler.get(sampler) || null;
      const row = {
        modelRel: materialRow.rel || "",
        materialName: materialRow.materialName || "",
        shadergraphRel: materialRow.shadergraphRel || "",
        sampler,
        sourceKeyHash: sourceKeyHashForSamplerName(sampler),
        unit: samplerUnits?.[sampler] ?? "",
        hash: samplerHashes?.[sampler] || "",
        texturePath: samplerTexturePaths?.[sampler] || "",
        textureSource: samplerTextureSources?.[sampler] || "",
        textureSourceFamily: sourceFamily(samplerTextureSources?.[sampler] || ""),
        unhashedSampler: unhashedSamplers.has(sampler),
        texturePathMissingSampler: texturePathMissingSamplers.has(sampler),
        runtimeResolvedSampler: runtimeResolvedSamplers.has(sampler),
        unresolvedSampler: unresolvedSamplers.has(sampler),
        runtimeKind: runtimeRecord?.kind || "",
        runtimeKindFamily: runtimeKindFamily(runtimeRecord?.kind || ""),
        runtimeInlineLookupOffset: Number.isFinite(Number(runtimeRecord?.inlineLookupOffset))
          ? `0x${Number(runtimeRecord.inlineLookupOffset).toString(16)}`
          : "",
        runtimeSceneSemantic: runtimeRecord?.runtimeSceneTextureUsage?.semantic || "",
        classification: "",
        evidence: "",
        staticResourceBindingMechanicsRecovered: false,
        texDataOwnershipNeedsLiveCapture: false,
        shadergraphSamplerToTexDataBindingRecovered: false,
        materialSamplerTextureObjectOwnershipRecovered: false,
        renderPromotionAllowed: false,
      };
      row.classification = classifySampler({
        sampler,
        hash: row.hash,
        texturePath: row.texturePath,
        textureSource: row.textureSource,
        runtimeRecord,
        unresolvedSamplers,
        texturePathMissingSamplers,
        runtimeResolvedSamplers,
      });
      row.evidence = evidenceForRow(row);
      row.staticResourceBindingMechanicsRecovered = staticResourceBindingMechanicsRecoveredForRow(
        row,
        externalSummary,
        inlineSummary,
      );
      row.texDataOwnershipNeedsLiveCapture =
        row.staticResourceBindingMechanicsRecovered && !row.shadergraphSamplerToTexDataBindingRecovered;
      rows.push(row);
    }
  }

  return rows;
}

function summarizeSamplerRows(rows, materialRuntime, externalSummary, inlineSummary) {
  const byClassification = {};
  const byRuntimeKind = {};
  const byTextureSourceFamily = {};
  const uniqueShadergraphs = new Set();
  const uniqueModels = new Set();
  const uniqueMaterials = new Set();
  const materialSummary = materialRuntime.summary || {};

  for (const row of rows) {
    addCount(byClassification, row.classification);
    addCount(byRuntimeKind, row.runtimeKind);
    addCount(byTextureSourceFamily, row.textureSourceFamily || "none");
    if (row.shadergraphRel) uniqueShadergraphs.add(row.shadergraphRel);
    if (row.modelRel) uniqueModels.add(row.modelRel);
    uniqueMaterials.add(`${row.modelRel}:${row.materialName}:${row.shadergraphRel}`);
  }

  const unresolvedSamplerRows = rows.filter((row) => row.classification === "unresolved-sampler").length;
  const unclassifiedSamplerRows = rows.filter((row) => row.classification === "unclassified-sampler").length;
  const hashedTexturePathMissingSamplerRows = rows.filter(
    (row) => row.classification === "hashed-texture-path-missing",
  ).length;
  const texturePathWithoutHashSamplerRows = rows.filter(
    (row) => row.classification === "texture-path-without-hash",
  ).length;
  const runtimeResolvedWithoutRecordRows = rows.filter(
    (row) => row.classification === "runtime-resolved-without-record",
  ).length;
  const texturePathMissingWithoutRuntimeRows = rows.filter(
    (row) => row.classification === "texture-path-missing-without-runtime",
  ).length;
  const externalTexturePathSamplerRows = rows.filter(
    (row) =>
      row.classification === "shadergraph-hash-texture-path" ||
      row.classification === "global-hash-texture-path",
  ).length;
  const inlineRuntimeSamplerRows = rows.filter((row) => row.classification === "tch0-inline-runtime-texture").length;
  const runtimeSceneTextureSamplerRows = rows.filter((row) => row.classification === "runtime-scene-texture").length;
  const externalTextureBindingMechanicalRows = rows.filter(
    (row) =>
      row.staticResourceBindingMechanicsRecovered &&
      (row.classification === "shadergraph-hash-texture-path" || row.classification === "global-hash-texture-path"),
  ).length;
  const inlineTextureBindingMechanicalRows = rows.filter(
    (row) => row.staticResourceBindingMechanicsRecovered && row.classification === "tch0-inline-runtime-texture",
  ).length;
  const runtimeSceneTextureDiagnosticRows = runtimeSceneTextureSamplerRows;
  const ordinarySamplerBindingMechanicalRows =
    externalTextureBindingMechanicalRows + inlineTextureBindingMechanicalRows;
  const samplerSourceKeyHashRows = rows.filter((row) => row.sourceKeyHash).length;
  const classificationGapRows =
    unresolvedSamplerRows +
    unclassifiedSamplerRows +
    hashedTexturePathMissingSamplerRows +
    texturePathWithoutHashSamplerRows +
    runtimeResolvedWithoutRecordRows +
    texturePathMissingWithoutRuntimeRows;
  const samplerResourceClassificationComplete = rows.length > 0 && classificationGapRows === 0;
  const ordinarySamplerRows = externalTexturePathSamplerRows + inlineRuntimeSamplerRows;
  const ordinarySamplerBindingMechanicsRecovered =
    ordinarySamplerRows > 0 && ordinarySamplerBindingMechanicalRows === ordinarySamplerRows;
  const shadergraphSamplerToTexDataBindingRecovered = false;
  const samplerStaticResourceAndBindingComplete =
    samplerResourceClassificationComplete && ordinarySamplerBindingMechanicsRecovered;

  return {
    materialRows: materialSummary.materialRows || 0,
    parsedShadergraphRows: materialSummary.parsedShadergraphRows || 0,
    materialSamplerRows: rows.length,
    samplerSourceKeyHashRows,
    uniqueModelRows: uniqueModels.size,
    uniqueMaterialRows: uniqueMaterials.size,
    uniqueShadergraphRows: uniqueShadergraphs.size,
    externalTexturePathSamplerRows,
    shadergraphHashTexturePathSamplerRows: byClassification["shadergraph-hash-texture-path"] || 0,
    globalHashTexturePathSamplerRows: byClassification["global-hash-texture-path"] || 0,
    inlineRuntimeSamplerRows,
    runtimeSceneTextureSamplerRows,
    externalTextureBindingMechanicalRows,
    inlineTextureBindingMechanicalRows,
    runtimeSceneTextureDiagnosticRows,
    ordinarySamplerBindingMechanicalRows,
    unresolvedSamplerRows,
    unclassifiedSamplerRows,
    hashedTexturePathMissingSamplerRows,
    texturePathWithoutHashSamplerRows,
    runtimeResolvedWithoutRecordRows,
    texturePathMissingWithoutRuntimeRows,
    classificationGapRows,
    materialRuntimeUnresolvedSamplerRows: sumObjectValues(materialSummary.byUnresolvedSampler),
    materialRuntimeUnhashedSamplerRows: sumObjectValues(materialSummary.byUnhashedSampler),
    materialRuntimeTexturePathMissingSamplerRows: sumObjectValues(materialSummary.byTexturePathMissingSampler),
    materialRuntimeResolvedSamplerRows: sumObjectValues(materialSummary.byRuntimeResolvedSampler),
    externalTextureSamplerRuntimeBindingRecovered: Boolean(externalSummary.externalTextureSamplerRuntimeBindingRecovered),
    inlineTextureObjectBindingRecovered: Boolean(inlineSummary.inlineTextureObjectBindingRecovered),
    inlineTextureRuntimePatchRequired: Boolean(inlineSummary.inlineTextureRuntimePatchRequired),
    samplerResourceClassificationComplete,
    ordinarySamplerBindingMechanicsRecovered,
    samplerStaticResourceAndBindingComplete,
    samplerTexDataOwnershipNeedsLiveCapture:
      samplerStaticResourceAndBindingComplete && !shadergraphSamplerToTexDataBindingRecovered,
    shadergraphSamplerToTexDataBindingRecovered,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
    byClassification,
    byRuntimeKind,
    byTextureSourceFamily,
  };
}

function buildCurrentNativeShadergraphSamplerTexDataJoinAudit(
  {
    materialRuntimePath = defaultMaterialRuntimePath,
    externalTextureBindingPath = defaultExternalTextureBindingPath,
    inlineTexturePlaceholderPath = defaultInlineTexturePlaceholderPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const materialRuntime = readJson(materialRuntimePath, { summary: {}, items: [] });
  const externalTextureBinding = readJson(externalTextureBindingPath, { summary: {} });
  const inlineTexturePlaceholder = readJson(inlineTexturePlaceholderPath, { summary: {} });
  const rows = buildSamplerRows(
    materialRuntime,
    externalTextureBinding.summary || {},
    inlineTexturePlaceholder.summary || {},
  );
  const summary = summarizeSamplerRows(
    rows,
    materialRuntime,
    externalTextureBinding.summary || {},
    inlineTexturePlaceholder.summary || {},
  );
  return {
    generatedAt,
    source: {
      materialRuntimePath,
      externalTextureBindingPath,
      inlineTexturePlaceholderPath,
    },
    policy:
      "diagnostic-only shadergraph sampler resource classification; joins current material manifest sampler units, texture hashes, texture paths, and runtime inline/scene records without enabling renderer takeover",
    summary,
    interpretation: {
      recovered:
        "Every current material sampler can be classified as either a shadergraph/TCH0 texture-hash path, a TCH0 inline RGB lookup payload, or a runtime scene texture when classificationGapRows is zero.",
      boundary:
        "This is sampler resource coverage, not original game sampler ownership. It does not prove the final source/program table value for each draw, the concrete texData owner for every ordinary character material, or the shader formula needed for renderer promotion.",
      nextRequiredEvidence:
        "Import live source/program capture rows with decoded type4 entries, then join those source indices back to the classified sampler units and concrete texData objects before changing material rendering.",
    },
    items: rows,
  };
}

function exportCurrentNativeShadergraphSamplerTexDataJoinAudit({
  materialRuntimePath = defaultMaterialRuntimePath,
  externalTextureBindingPath = defaultExternalTextureBindingPath,
  inlineTexturePlaceholderPath = defaultInlineTexturePlaceholderPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShadergraphSamplerTexDataJoinAudit({
    materialRuntimePath,
    externalTextureBindingPath,
    inlineTexturePlaceholderPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "modelRel",
    "materialName",
    "shadergraphRel",
    "sampler",
    "sourceKeyHash",
    "unit",
    "hash",
    "texturePath",
    "textureSource",
    "textureSourceFamily",
    "unhashedSampler",
    "texturePathMissingSampler",
    "runtimeResolvedSampler",
    "unresolvedSampler",
    "runtimeKind",
    "runtimeKindFamily",
    "runtimeInlineLookupOffset",
    "runtimeSceneSemantic",
    "classification",
    "evidence",
    "staticResourceBindingMechanicsRecovered",
    "texDataOwnershipNeedsLiveCapture",
    "shadergraphSamplerToTexDataBindingRecovered",
    "materialSamplerTextureObjectOwnershipRecovered",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeShadergraphSamplerTexDataJoinAudit({
    materialRuntimePath: optionValue(args, "--material-runtime", defaultMaterialRuntimePath),
    externalTextureBindingPath: optionValue(args, "--external-texture-binding", defaultExternalTextureBindingPath),
    inlineTexturePlaceholderPath: optionValue(args, "--inline-texture-placeholder", defaultInlineTexturePlaceholderPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShadergraphSamplerTexDataJoinAudit,
  exportCurrentNativeShadergraphSamplerTexDataJoinAudit,
};
