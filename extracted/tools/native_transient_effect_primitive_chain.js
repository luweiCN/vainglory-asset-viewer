#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultSpawnPath = "extracted/viewer/native-effect-spawn-manifest.json";
const defaultViewerOut = "extracted/viewer/native-transient-effect-primitive-chain.json";
const defaultTsvOut = "extracted/reports/native_transient_effect_primitive_chain.tsv";
const defaultJsonOut = "extracted/reports/native_transient_effect_primitive_chain_summary.json";

const factoryRoles = new Map([
  ["FUN_10000e358", "effect-builder"],
  ["thunk_FUN_10000e358", "effect-builder"],
  ["FUN_00cfab04", "effect-builder"],
  ["FUN_10000ed74", "transient-render-record"],
  ["FUN_00cfaf84", "transient-render-record"],
  ["FUN_10000f250", "projectile-or-spawn-record"],
  ["FUN_00cfcad8", "projectile-or-spawn-record"],
  ["FUN_10000ceb8", "timeline-or-action-record"],
  ["FUN_00cfa294", "timeline-or-action-record"],
  ["FUN_10000ef8c", "state-or-filter-record"],
  ["FUN_00cfa12c", "state-or-filter-record"],
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readItems(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const json = readJson(filePath);
  return Array.isArray(json) ? json : json.items || [];
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tsvEscape(value) {
  if (Array.isArray(value)) return value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  if (value && typeof value === "object") return JSON.stringify(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function platformFromId(id) {
  return String(id || "").split(":")[0] || "";
}

function primitiveKey(row) {
  return [row.platform || platformFromId(row.id), row.effectToken || row.token || "", row.source?.functionName || "", row.source?.line ?? ""].join("\t");
}

function spawnKey(row) {
  return [row.platform || "", row.effectToken || "", sourceFunctionName(row), row.line ?? ""].join("\t");
}

function sourceFunctionName(row) {
  const match = String(row.id || "").match(/^(?:android|ios):([^:]+):/);
  return row.sourceFunction || row.functionName || match?.[1] || "";
}

function buildSpawnIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = spawnKey(row);
    if (!key.split("\t").every(Boolean)) continue;
    index.set(key, row);
  }
  return index;
}

function loadSourceBlock(sourceFile, functionName) {
  if (!sourceFile || !functionName || !fs.existsSync(sourceFile)) return null;
  const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/);
  const block = findFunctionBlocks(lines).find((item) => item.functionName === functionName);
  return block ? { ...block, lines } : null;
}

function lineOffset(block, sourceLine) {
  const relative = Number(sourceLine) - Number(block.startLine);
  if (!Number.isFinite(relative)) return -1;
  return relative >= 0 && relative < block.lines.length ? relative : -1;
}

function windowAfterSourceLine(block, sourceLine, maxLines = 48) {
  const offset = lineOffset(block, sourceLine);
  if (offset < 0) return "";
  const startIndex = Number(block.startLine) - 1 + offset;
  return block.lines.slice(startIndex, startIndex + maxLines).join("\n");
}

function factoryCalls(text) {
  const calls = [];
  const pattern = /\b((?:thunk_)?FUN_[0-9a-fA-F]+)\s*\(/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const functionName = match[1];
    if (!factoryRoles.has(functionName)) continue;
    calls.push({
      functionName,
      role: factoryRoles.get(functionName),
    });
  }
  return unique(calls.map((call) => `${call.functionName}:${call.role}`));
}

function fieldWriteOffsets(text) {
  const offsets = [];
  const patterns = [
    /\*\([^)]*\*\)\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*\+\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*=/g,
    /\*\([^)]*\*\)\s*\(\s*&?[A-Z][A-Za-z0-9_]*\s*\+\s*[A-Za-z_][A-Za-z0-9_]*\s*\*\s*0x[0-9a-fA-F]+\s*\+\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*=/g,
  ];
  for (const pattern of patterns) {
    for (const match of String(text || "").matchAll(pattern)) offsets.push(hexOffset(match[1]));
  }
  return unique(offsets);
}

function literalAssignments(text) {
  const assignments = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!/\*\([^)]*\*\)\s*\([^)]*\+\s*(?:0x[0-9a-fA-F]+|\d+)\s*\)\s*=/.test(line)) continue;
    const compact = line.trim().replace(/\s+/g, " ");
    assignments.push(compact.length > 180 ? `${compact.slice(0, 177)}...` : compact);
  }
  return assignments.slice(0, 12);
}

function hexOffset(value) {
  const raw = String(value || "").trim();
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return `0x${Number.parseInt(raw.slice(2), 16).toString(16)}`;
  if (/^\d+$/.test(raw)) return `0x${Number.parseInt(raw, 10).toString(16)}`;
  return raw;
}

function semanticNames(effectOptions = {}) {
  const names = [];
  if (Array.isArray(effectOptions.color)) names.push("color");
  if (Number.isFinite(Number(effectOptions.scale))) names.push("scale");
  if (Number.isFinite(Number(effectOptions.fadeSeconds))) names.push("fadeSeconds");
  if (Number.isFinite(Number(effectOptions.percentParam))) names.push("percentParam");
  if (effectOptions.followTarget === true || effectOptions.followTarget === false) names.push("followTarget");
  if (effectOptions.visibleOrActive === true || effectOptions.visibleOrActive === false) names.push("visibleOrActive");
  return names;
}

function crossPlatformKey(row) {
  return [row.effectToken, row.actionKeys.join("|"), row.heroNames.join("|"), row.locatorLabel, row.optionSemanticNames.join("|")].join("\t");
}

function addCrossPlatformEvidence(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = crossPlatformKey(row);
    const item = grouped.get(key) || new Set();
    item.add(row.platform);
    grouped.set(key, item);
  }
  for (const row of rows) {
    const platforms = [...(grouped.get(crossPlatformKey(row)) || [])].sort();
    row.crossPlatformEvidence = platforms.includes("android") && platforms.includes("ios") ? "android-ios-matched-callsite" : "single-platform-only";
  }
}

function buildNativeTransientEffectPrimitiveChain({ gapManifest = {}, spawnRows = [] } = {}, generatedAt = new Date().toISOString()) {
  const primitiveItems = Array.isArray(gapManifest.nativePrimitiveRenderableItems) ? gapManifest.nativePrimitiveRenderableItems : [];
  const spawnIndex = buildSpawnIndex(spawnRows);
  const sourceBlockCache = new Map();
  const rows = primitiveItems.map((item) => {
    const spawn = spawnIndex.get(primitiveKey(item)) || {};
    const sourceFile = spawn.sourceFile || "";
    const sourceFunction = item.source?.functionName || sourceFunctionName(spawn);
    const sourceLine = item.source?.line ?? spawn.line ?? "";
    const sourceKey = `${sourceFile}\t${sourceFunction}`;
    if (!sourceBlockCache.has(sourceKey)) sourceBlockCache.set(sourceKey, loadSourceBlock(sourceFile, sourceFunction));
    const block = sourceBlockCache.get(sourceKey);
    const postEffectWindow = block ? windowAfterSourceLine(block, sourceLine) : "";
    const calls = factoryCalls(postEffectWindow);
    const postEffectFieldWriteOffsets = fieldWriteOffsets(postEffectWindow);
    const effectOptions = item.nativeEffectOptions || spawn.effectOptions || {};
    const optionSemanticNames = semanticNames(effectOptions);
    return {
      id: item.id || spawn.id || "",
      platform: item.platform || platformFromId(item.id) || spawn.platform || "",
      effectToken: item.effectToken || item.token || spawn.effectToken || "",
      actionKeys: listValue(item.actionKeys),
      heroNames: listValue(item.heroNames),
      heroCodes: listValue(item.heroCodes),
      nativeRuntimeKind: item.nativeRuntimeKind || "",
      nativeBindKind: item.nativeBindKind || "",
      locatorLabel: item.locatorLabel || spawn.locatorLabel || "",
      optionOffsets: listValue(item.nativeEffectOptionOffsets || spawn.effectOptionOffsets),
      optionFloatArgs: listValue(item.nativeEffectOptionFloatArgs || spawn.effectOptionFloatArgs),
      optionSemanticNames,
      sourceFile,
      sourceFunction,
      sourceLine,
      postEffectFactoryCalls: calls,
      postEffectFieldWriteOffsets,
      postEffectFieldWriteSamples: literalAssignments(postEffectWindow),
      evidenceClass: calls.length ? "effect-builder-plus-post-factory" : "effect-builder-options-only",
      renderTakeoverStatus: calls.length
        ? "blocked-post-factory-render-schema-unresolved"
        : "blocked-native-primitive-type-unresolved",
    };
  });
  addCrossPlatformEvidence(rows);
  return { generatedAt, summary: summarize(rows), items: rows };
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [row[key]];
    for (const value of values.length ? values : [""]) counts[value || ""] = (counts[value || ""] || 0) + 1;
  }
  return counts;
}

function summarize(rows) {
  return {
    rows: rows.length,
    tokens: unique(rows.map((row) => row.effectToken)).length,
    crossPlatformMatchedRows: rows.filter((row) => row.crossPlatformEvidence === "android-ios-matched-callsite").length,
    postFactoryRows: rows.filter((row) => row.postEffectFactoryCalls.length).length,
    renderTakeoverAllowedRows: 0,
    byPlatform: countBy(rows, "platform"),
    byEvidenceClass: countBy(rows, "evidenceClass"),
    byCrossPlatformEvidence: countBy(rows, "crossPlatformEvidence"),
    byRenderTakeoverStatus: countBy(rows, "renderTakeoverStatus"),
    byPostEffectFactoryCall: countBy(rows, "postEffectFactoryCalls"),
    byOptionSemanticName: countBy(rows, "optionSemanticNames"),
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    id: item.id,
    platform: item.platform,
    effectToken: item.effectToken,
    actionKeys: item.actionKeys,
    heroNames: item.heroNames,
    heroCodes: item.heroCodes,
    nativeRuntimeKind: item.nativeRuntimeKind,
    nativeBindKind: item.nativeBindKind,
    locatorLabel: item.locatorLabel,
    optionOffsets: item.optionOffsets,
    optionFloatArgs: item.optionFloatArgs,
    optionSemanticNames: item.optionSemanticNames,
    crossPlatformEvidence: item.crossPlatformEvidence,
    evidenceClass: item.evidenceClass,
    renderTakeoverStatus: item.renderTakeoverStatus,
    postEffectFactoryCalls: item.postEffectFactoryCalls,
    postEffectFieldWriteOffsets: item.postEffectFieldWriteOffsets,
    postEffectFieldWriteSamples: item.postEffectFieldWriteSamples,
    sourceFile: item.sourceFile,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
  }));
}

function exportNativeTransientEffectPrimitiveChain({
  gapPath = defaultGapPath,
  spawnPath = defaultSpawnPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeTransientEffectPrimitiveChain({
    gapManifest: readJson(gapPath),
    spawnRows: readItems(spawnPath),
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "id",
    "platform",
    "effectToken",
    "actionKeys",
    "heroNames",
    "heroCodes",
    "nativeRuntimeKind",
    "nativeBindKind",
    "locatorLabel",
    "optionOffsets",
    "optionFloatArgs",
    "optionSemanticNames",
    "crossPlatformEvidence",
    "evidenceClass",
    "renderTakeoverStatus",
    "postEffectFactoryCalls",
    "postEffectFieldWriteOffsets",
    "postEffectFieldWriteSamples",
    "sourceFile",
    "sourceFunction",
    "sourceLine",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeTransientEffectPrimitiveChain({
    gapPath: optionValue(args, "--gaps", defaultGapPath),
    spawnPath: optionValue(args, "--spawns", defaultSpawnPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeTransientEffectPrimitiveChain,
  exportNativeTransientEffectPrimitiveChain,
};
