#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultManifestPath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultShadergraphRoot = "extracted/hero_assets/shadergraphs";
const defaultJsonOut = "extracted/reports/view_dot_ramp_blocker_audit.json";
const defaultTsvOut = "extracted/reports/view_dot_ramp_blocker_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseJsonField(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows || []) {
    const key = keyFn(row) || "";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function shadergraphFilePath(shadergraphRoot, shadergraphRel) {
  return path.join(shadergraphRoot, String(shadergraphRel || "").replace(/^\/+/, ""));
}

function viewDotVariables(shaderText) {
  const variables = new Set();
  const pattern =
    /\b([A-Za-z_][A-Za-z0-9_]*)\.x\s*=\s*dot\s*\(\s*normalize\s*\(\s*-\s*\([^;]+?;\s*\1\.y\s*=\s*0\.0\s*;/gs;
  for (const match of String(shaderText || "").matchAll(pattern)) variables.add(match[1]);
  return [...variables];
}

function viewDotSamplers(shaderText) {
  const samplers = new Set();
  for (const variable of viewDotVariables(shaderText)) {
    const pattern = new RegExp(`texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*${variable}\\s*\\)`, "g");
    for (const match of String(shaderText || "").matchAll(pattern)) samplers.add(match[1]);
  }
  return [...samplers];
}

function formulaSnippet(shaderText, sampler) {
  const text = String(shaderText || "");
  const index = text.search(new RegExp(`texture2D\\s*\\(\\s*${sampler}\\s*,`, "s"));
  if (index < 0) return "";
  const start = Math.max(0, index - 220);
  const end = Math.min(text.length, index + 360);
  return text
    .slice(start, end)
    .replace(/[^\x20-\x7E\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundedNumber(value) {
  return Math.round(value * 1000000) / 1000000;
}

function inlineRgbFloatLookupStats(shaderBuffer, offset) {
  const valueCount = 0xc0;
  if (!Buffer.isBuffer(shaderBuffer) || offset < 0 || offset + valueCount * 4 > shaderBuffer.length) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nonzeroValues = 0;
  const firstValues = [];
  for (let index = 0; index < valueCount; index += 1) {
    const value = shaderBuffer.readFloatLE(offset + index * 4);
    if (!Number.isFinite(value) || value < -0.001 || value > 4) return null;
    const normalized = Math.max(0, value);
    min = Math.min(min, normalized);
    max = Math.max(max, normalized);
    sum += normalized;
    if (normalized > 0.000001) nonzeroValues += 1;
    if (firstValues.length < 12) firstValues.push(roundedNumber(normalized));
  }
  if (!nonzeroValues || max <= 0) return null;
  return {
    width: 64,
    height: 1,
    components: 3,
    valueCount,
    min: roundedNumber(min),
    max: roundedNumber(max),
    average: roundedNumber(sum / valueCount),
    nonzeroValues,
    firstValues,
  };
}

function rgbTripletCoherentSamples(firstValues) {
  let coherent = 0;
  for (let index = 0; index + 2 < (firstValues || []).length; index += 3) {
    const r = Number(firstValues[index]);
    const g = Number(firstValues[index + 1]);
    const b = Number(firstValues[index + 2]);
    if (Math.abs(r - g) < 0.000001 && Math.abs(g - b) < 0.000001) coherent += 1;
  }
  return coherent;
}

function scanInlineRgbFloatRampCandidates(shaderBuffer, limit = 8) {
  if (!Buffer.isBuffer(shaderBuffer)) return [];
  const candidates = [];
  let tch0Offset = -1;
  while ((tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"), tch0Offset + 1)) >= 0) {
    const chunkSize = tch0Offset + 8 <= shaderBuffer.length ? shaderBuffer.readUInt32LE(tch0Offset + 4) : 0;
    const scanEnd = Math.min(
      shaderBuffer.length - 0xc0 * 4,
      tch0Offset + Math.max(0x80, Math.min(chunkSize || 0x600, 0x600)),
    );
    for (let offset = tch0Offset + 0x18; offset <= scanEnd; offset += 1) {
      const stats = inlineRgbFloatLookupStats(shaderBuffer, offset);
      if (!stats) continue;
      candidates.push({
        tch0Offset,
        offset,
        deltaHex: `0x${(offset - tch0Offset).toString(16)}`,
        stats,
        rgbTripletCoherentSamples: rgbTripletCoherentSamples(stats.firstValues),
      });
    }
  }
  return candidates
    .sort((left, right) => {
      const leftAligned = left.deltaHex === "0x18" ? 1 : 0;
      const rightAligned = right.deltaHex === "0x18" ? 1 : 0;
      return (
        rightAligned - leftAligned ||
        right.rgbTripletCoherentSamples - left.rgbTripletCoherentSamples ||
        right.stats.nonzeroValues - left.stats.nonzeroValues ||
        left.offset - right.offset
      );
    })
    .slice(0, limit);
}

function formulaClass(shaderText, sampler, sourceClass) {
  const text = String(shaderText || "");
  const samplerName = sampler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const usePattern = new RegExp(`texture2D\\s*\\(\\s*${samplerName}\\s*,`, "s");
  if (!usePattern.test(text)) return "no-view-dot-texture-sample";
  if (/^\S+:missing$/.test(sourceClass)) return "blocked-missing-view-dot-ramp-source";
  const textureCall = `texture2D\\s*\\(\\s*${samplerName}\\s*,[^;]+?\\)\\.xyz`;
  if (new RegExp(`\\+\\s*\\(\\s*\\(?\\s*tmpvar_\\d+\\.xyz\\s*\\*\\s*${textureCall}`, "s").test(text)) {
    return "base-plus-base-times-viewdot-ramp";
  }
  if (new RegExp(`tmpvar_\\d+\\.xyz\\s*=\\s*\\(\\s*tmpvar_\\d+\\s*\\+\\s*${textureCall}`, "s").test(text)) {
    return "base-plus-viewdot-ramp";
  }
  if (new RegExp(`\\+\\s*\\(\\s*tmpvar_\\d+\\s*\\*\\s*${textureCall}`, "s").test(text)) {
    return "sampled-color-plus-viewdot-ramp";
  }
  if (new RegExp(`vec3\\s*\\(\\s*2\\.0\\s*,\\s*2\\.0\\s*,\\s*2\\.0\\s*\\)[^;]{0,180}${textureCall}`, "s").test(text)) {
    return "scaled-viewdot-ramp-times-mask";
  }
  if (
    new RegExp(`${textureCall}\\s*\\*\\s*\\(*\\s*texture2D`, "s").test(text) ||
    new RegExp(`texture2D[^;]+\\*\\s*${textureCall}`, "s").test(text)
  ) {
    return "viewdot-ramp-times-texture";
  }
  if (new RegExp(`${textureCall}[^;]+\\*\\s*tmpvar_`, "s").test(text) || new RegExp(`\\*\\s*${textureCall}`, "s").test(text)) {
    return "viewdot-ramp-times-sampled-color";
  }
  if (new RegExp(`\\b(tmpvar_\\d+)\\s*=\\s*${textureCall}\\s*;[\\s\\S]{0,500}\\b\\1\\b`, "s").test(text)) {
    return "viewdot-ramp-temp-composite";
  }
  return "viewdot-ramp-formula-unclassified";
}

function samplerSourceClass(sampler, samplerTexturePaths, runtimeSamplerRecords) {
  const runtimeRecord = (runtimeSamplerRecords || []).find((record) => record.sampler === sampler);
  if (runtimeRecord?.kind === "tch0-inline-rgb-float-lookup") return `${sampler}:inline-ramp`;
  if (samplerTexturePaths?.[sampler]) return `${sampler}:texture-path`;
  return `${sampler}:missing`;
}

function buildAudit({ manifestPath = defaultManifestPath, shadergraphRoot = defaultShadergraphRoot } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const rows = (manifest.items || []).filter(
    (row) =>
      row.nativeShaderMode === "view-dot-sampler-ramp" ||
      row.colorMode === "viewDotRamp" ||
      row.colorMode === "rimLookupGlow" ||
      row.viewDotRampSourceKind,
  );
  const items = rows.map((row) => {
    const filePath = shadergraphFilePath(shadergraphRoot, row.shadergraphRel);
    const shaderBuffer = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    const shaderText = shaderBuffer ? shaderBuffer.toString("latin1") : "";
    const nativeShaderInputs = parseJsonField(row.nativeShaderInputs || "null", null);
    const viewDotRamp = parseJsonField(row.viewDotRamp || "null", null);
    const samplerTexturePaths = parseJsonField(row.samplerTexturePaths || "{}", {});
    const runtimeSamplerRecords = nativeShaderInputs?.runtimeSamplerRecords || [];
    const samplers = row.viewDotRampSampler ? [row.viewDotRampSampler] : viewDotSamplers(shaderText);
    const samplerSources = samplers.map((sampler) => {
      if (row.viewDotRampSourceKind) return `${sampler}:row-${row.viewDotRampSourceKind}`;
      return samplerSourceClass(sampler, samplerTexturePaths, runtimeSamplerRecords);
    });
    const formulaClasses = samplers.map((sampler, index) => row.viewDotRampFormulaClass || formulaClass(shaderText, sampler, samplerSources[index]));
    const rendererStatus =
      row.colorMode === "rimLookupGlow"
        ? "implemented-rimLookupGlow"
        : row.colorMode === "viewDotRamp" && viewDotRamp?.canRenderNatively
          ? "implemented-viewDotRamp"
          : row.nativeShaderBlocker === "view-dot-ramp-not-classified"
            ? "blocked-viewDotRamp"
            : "diagnostic-only";
    const scannedInlineRampCandidates =
      rendererStatus === "blocked-viewDotRamp" ? scanInlineRgbFloatRampCandidates(shaderBuffer, 4) : [];
    const shaderSamplerCount = Array.isArray(nativeShaderInputs?.samplers) ? nativeShaderInputs.samplers.length : samplers.length;
    const missingSourceRecoveryState =
      rendererStatus !== "blocked-viewDotRamp"
        ? ""
        : scannedInlineRampCandidates.length
          ? shaderSamplerCount > 1
            ? "multi-sampler-inline-ramp-binding-unresolved"
            : "inline-ramp-candidate-present-binding-unresolved"
          : "no-inline-ramp-candidate-found";

    return {
      rel: row.rel || "",
      materialName: row.materialName || "",
      shadergraphRel: row.shadergraphRel || "",
      shadergraphFilePath: filePath,
      shadergraphFound: fs.existsSync(filePath),
      roleNames: row.roleNames || "",
      colorMode: row.colorMode || "",
      nativeShaderMode: row.nativeShaderMode || "",
      nativeShaderBlocker: row.nativeShaderBlocker || "",
      rendererStatus,
      missingSourceRecoveryState,
      shaderSamplerCount,
      scannedInlineRampCandidates,
      viewDotSamplers: samplers,
      viewDotSamplerSources: samplerSources,
      viewDotFormulaClasses: formulaClasses,
      viewDotRamp,
      viewDotFormulaSnippets: samplers.map((sampler) => formulaSnippet(shaderText, sampler)),
      samplerTexturePaths,
      runtimeSamplerRecords: runtimeSamplerRecords.map((record) => ({
        sampler: record.sampler || "",
        kind: record.kind || "",
        inlineLookupOffset: record.inlineLookupOffset ?? null,
        inlineLookupStats: record.inlineLookupStats || null,
      })),
    };
  });

  return {
    summary: {
      manifestPath,
      shadergraphRoot,
      auditedRows: items.length,
      implementedRows: items.filter((item) => item.rendererStatus.startsWith("implemented-")).length,
      implementedRimLookupGlowRows: items.filter((item) => item.rendererStatus === "implemented-rimLookupGlow").length,
      implementedViewDotRampRows: items.filter((item) => item.rendererStatus === "implemented-viewDotRamp").length,
      blockerRows: items.filter((item) => item.rendererStatus === "blocked-viewDotRamp").length,
      shadergraphMissingRows: items.filter((item) => !item.shadergraphFound).length,
      byRendererStatus: countBy(items, (item) => item.rendererStatus),
      byMissingSourceRecoveryState: countBy(items, (item) => item.missingSourceRecoveryState || "none"),
      byViewDotSamplerSourcePattern: countBy(items, (item) => item.viewDotSamplerSources.join("|") || "none"),
      byViewDotSourceKind: countBy(
        items.flatMap((item) => item.viewDotSamplerSources),
        (source) => (source.split(":")[1] || source).replace(/^row-/, ""),
      ),
      byFormulaClassPattern: countBy(items, (item) => item.viewDotFormulaClasses.join("|") || "none"),
      byRoleNames: countBy(items, (item) => item.roleNames || "none"),
      rendererTakeoverImpact:
        "tracks the full view-dot ramp chain after renderer takeover; missing-source rows remain diagnostic blockers",
    },
    items,
  };
}

function writeTsv(filePath, audit) {
  const rows = [
    [
      "rel",
      "materialName",
      "shadergraphRel",
      "roleNames",
      "colorMode",
      "nativeShaderMode",
      "nativeShaderBlocker",
      "rendererStatus",
      "missingSourceRecoveryState",
      "viewDotSamplers",
      "viewDotSamplerSources",
      "viewDotFormulaClasses",
      "shadergraphFound",
    ],
  ];
  for (const item of audit.items) {
    rows.push([
      item.rel,
      item.materialName,
      item.shadergraphRel,
      item.roleNames,
      item.colorMode,
      item.nativeShaderMode,
      item.nativeShaderBlocker,
      item.rendererStatus,
      item.missingSourceRecoveryState,
      item.viewDotSamplers.join("|"),
      item.viewDotSamplerSources.join("|"),
      item.viewDotFormulaClasses.join("|"),
      item.shadergraphFound,
    ]);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => row.join("\t")).join("\n")}\n`);
}

function exportAudit({
  manifestPath = defaultManifestPath,
  shadergraphRoot = defaultShadergraphRoot,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildAudit({ manifestPath, shadergraphRoot });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, audit);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAudit({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    shadergraphRoot: optionValue(args, "--shadergraph-root", defaultShadergraphRoot),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAudit,
  exportAudit,
  viewDotSamplers,
  viewDotVariables,
};
