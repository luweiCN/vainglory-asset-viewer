#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultEffectHookPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultPfxManifestPath = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultViewerOut = "extracted/viewer/effect-native-option-profile.json";
const defaultTsvOut = "extracted/reports/effect_native_option_profile.tsv";
const defaultJsonOut = "extracted/reports/effect_native_option_profile_summary.json";

const NATIVE_OPTION_SEMANTICS = {
  "0x60": "percentParam",
  "0x78": "followTarget",
  "0xb0": "visibleOrActive",
  "0xc0": "color",
  "0xd0": "scale",
  "0xd8": "fadeSeconds",
};

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function listValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sortOffset(left, right) {
  const leftNumber = Number.parseInt(String(left).replace(/^0x/i, ""), 16);
  const rightNumber = Number.parseInt(String(right).replace(/^0x/i, ""), 16);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right));
}

function nativeOptionSemanticName(offset) {
  return NATIVE_OPTION_SEMANTICS[String(offset || "").toLowerCase()] || "unknown";
}

function nativeOptionSemanticStatus(offset) {
  return nativeOptionSemanticName(offset) === "unknown" ? "unknown" : "known";
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function increment(map, key, count = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + count);
}

function countObject(map, limit = Infinity) {
  return Object.fromEntries([...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, limit));
}

function candidateSemanticNamesForRow(row = {}) {
  if (row.semanticStatus === "known") return [];
  return Object.entries(countObject(row.byPfxRuntimeHintMatch || new Map()))
    .map(([name]) => name)
    .filter(Boolean)
    .sort();
}

function candidateSemanticStatusForRow(row = {}) {
  if (row.semanticStatus === "known") return "known";
  return row.pfxRuntimeHintMatchRows > 0 ? "weak-pfx-runtime-hint" : "unresolved";
}

function runtimeBindingOptionOffsets(binding = {}) {
  const options = binding.effectOptions || {};
  const offsets = [];
  const seen = new Set();
  const addOffset = (offset) => {
    if (!offset || seen.has(offset)) return;
    seen.add(offset);
    offsets.push(offset);
  };
  for (const offset of listValue(binding.effectOptionOffsets)) addOffset(offset);
  if (options.offsetValues && typeof options.offsetValues === "object" && !Array.isArray(options.offsetValues)) {
    for (const offset of Object.keys(options.offsetValues).sort(sortOffset)) addOffset(offset);
  }
  return offsets;
}

function optionValuesForOffset(binding = {}, offset) {
  const values = binding.effectOptions?.offsetValues?.[offset];
  return (Array.isArray(values) ? values : values == null ? [] : [values]).map(formatNumber).filter(Boolean);
}

function optionArgKindsForOffset(binding = {}, offset) {
  const prefix = `${offset}:`;
  return uniqueSorted(
    listValue(binding.effectOptionArgKinds)
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length))
      .filter(Boolean),
  );
}

function optionArgSourcesForOffset(binding = {}, offset) {
  const prefix = `${offset}:`;
  return uniqueSorted(listValue(binding.effectOptionArgSources).filter((item) => item.startsWith(prefix)));
}

function optionArgSourceKind(source = "", offset = "") {
  const prefix = `${offset}:`;
  if (!source.startsWith(prefix)) return "";
  const rest = source.slice(prefix.length);
  const separatorIndex = rest.indexOf(":");
  return (separatorIndex >= 0 ? rest.slice(0, separatorIndex) : rest).trim();
}

function buildPfxRuntimeHintLookup(pfxManifest = {}) {
  const lookup = new Map();
  for (const item of pfxManifest.items || []) {
    const hints = [];
    for (const record of item.surfaceRecords || []) {
      const runtimeHints = record.runtimeHints || {};
      for (const key of ["delaySeconds", "durationSeconds", "sizeScalar", "rotationDegrees"]) {
        const value = formatNumber(runtimeHints[key]);
        if (value) hints.push({ key, value });
      }
    }
    if (item.relativePath && hints.length) lookup.set(item.relativePath, hints);
  }
  return lookup;
}

function pfxRuntimeHintMatches(pfxRuntimeHintLookup, resourcePaths, values) {
  if (!values.length) return [];
  const valueSet = new Set(values);
  const matches = new Set();
  for (const resourcePath of resourcePaths) {
    for (const hint of pfxRuntimeHintLookup.get(resourcePath) || []) {
      if (valueSet.has(hint.value)) matches.add(hint.key);
    }
  }
  return [...matches].sort();
}

function optionCallsiteSample({ hook = {}, binding = {}, offsets = [], offset = "", values = [], argKinds = [] }) {
  const offsetIndex = offsets.indexOf(offset);
  return {
    platform: hook.platform || "",
    sourceKind: hook.sourceKind || "",
    functionName: hook.source?.functionName || hook.functionName || "",
    line: hook.source?.line ?? hook.line ?? "",
    effectToken: hook.effectToken || hook.token || "",
    bindKind: hook.bindKind || "",
    runtimeBindingKind: binding.kind || "",
    actionKeys: listValue(hook.actionKeys),
    optionOffsets: offsets,
    previousOptionOffset: offsetIndex > 0 ? offsets[offsetIndex - 1] : "",
    nextOptionOffset: offsetIndex >= 0 && offsetIndex < offsets.length - 1 ? offsets[offsetIndex + 1] : "",
    values,
    argKinds,
  };
}

function formatCallsiteSample(sample = {}) {
  return [
    sample.platform,
    sample.sourceKind,
    sample.functionName,
    sample.line,
    sample.effectToken,
    sample.runtimeBindingKind,
    (sample.actionKeys || []).join(","),
    (sample.optionOffsets || []).join(","),
    `${sample.previousOptionOffset || ""}>${sample.nextOptionOffset || ""}`,
    (sample.values || []).join(","),
    (sample.argKinds || []).join(","),
  ].join(":");
}

function buildEffectNativeOptionProfile(effectHookManifest = {}, generatedAt = new Date().toISOString(), pfxManifest = {}) {
  const pfxRuntimeHintLookup = buildPfxRuntimeHintLookup(pfxManifest);
  const rowsByOffset = new Map();
  const summaryByOffset = new Map();
  const summaryByKnownOffset = new Map();
  const summaryByUnknownOffset = new Map();
  const summaryByOffsetArgKind = new Map();
  const summaryByUnknownOffsetArgKind = new Map();
  const summaryByOffsetArgSourceKind = new Map();
  const summaryByUnknownOffsetArgSourceKind = new Map();
  const summaryBySemanticName = new Map();
  const summaryBySemanticStatus = new Map();
  let rawOptionHookRows = 0;
  let optionOffsetRows = 0;
  let knownOptionOffsetRows = 0;
  let unknownOptionOffsetRows = 0;
  let unknownOptionHookRows = 0;
  let unknownOptionCandidateOffsets = 0;
  let numericValueRows = 0;
  let offsetOnlyRows = 0;
  let optionArgSourceEntries = 0;
  let pfxRuntimeHintMatchRows = 0;
  let resourceLinkedRows = 0;
  let pfxLinkedRows = 0;

  for (const hook of effectHookManifest.items || []) {
    const binding = hook.runtimeBinding || {};
    const offsets = runtimeBindingOptionOffsets(binding);
    if (!offsets.length) continue;

    rawOptionHookRows += 1;
    const resourcePaths = listValue(hook.resourcePaths);
    const resourceLinked = resourcePaths.length > 0;
    const pfxLinked = resourcePaths.some((resourcePath) => /\.pfx$/i.test(resourcePath));
    if (resourceLinked) resourceLinkedRows += 1;
    if (pfxLinked) pfxLinkedRows += 1;
    if (offsets.some((offset) => nativeOptionSemanticStatus(offset) === "unknown")) unknownOptionHookRows += 1;

    for (const offset of offsets) {
      const semanticName = nativeOptionSemanticName(offset);
      const semanticStatus = semanticName === "unknown" ? "unknown" : "known";
      optionOffsetRows += 1;
      increment(summaryByOffset, offset);
      increment(summaryBySemanticName, semanticName);
      increment(summaryBySemanticStatus, semanticStatus);
      if (semanticStatus === "known") {
        knownOptionOffsetRows += 1;
        increment(summaryByKnownOffset, offset);
      } else {
        unknownOptionOffsetRows += 1;
        increment(summaryByUnknownOffset, offset);
      }
      if (!rowsByOffset.has(offset)) {
        rowsByOffset.set(offset, {
          offset,
          semanticStatus,
          semanticName,
          rows: 0,
          numericValueRows: 0,
          offsetOnlyRows: 0,
          optionArgSourceEntries: 0,
          pfxRuntimeHintMatchRows: 0,
          resourceLinkedRows: 0,
          pfxLinkedRows: 0,
          byEvidenceKind: new Map(),
          byNumericValue: new Map(),
          byArgKind: new Map(),
          byArgSourceKind: new Map(),
          byPfxRuntimeHintMatch: new Map(),
          byPreviousOptionOffset: new Map(),
          byNextOptionOffset: new Map(),
          byNeighborOptionOffset: new Map(),
          bySourceKind: new Map(),
          byRuntimeBindingKind: new Map(),
          byActionKey: new Map(),
          sampleEffectTokens: new Set(),
          sampleResourcePaths: new Set(),
          sampleValues: new Set(),
          sampleArgSources: new Set(),
          sampleCallsites: [],
          sampleCallsiteKeys: new Set(),
        });
      }
      const row = rowsByOffset.get(offset);
      const values = optionValuesForOffset(binding, offset);
      const argKinds = optionArgKindsForOffset(binding, offset);
      const argSources = optionArgSourcesForOffset(binding, offset);
      const evidenceKind = values.length ? "numeric-float-args" : "offset-call-only";
      row.rows += 1;
      if (values.length) {
        row.numericValueRows += 1;
        numericValueRows += 1;
        for (const value of values) increment(row.byNumericValue, value);
      } else {
        row.offsetOnlyRows += 1;
        offsetOnlyRows += 1;
      }
      for (const argKind of argKinds) {
        increment(row.byArgKind, argKind);
        increment(summaryByOffsetArgKind, `${offset}:${argKind}`);
        if (semanticStatus === "unknown") increment(summaryByUnknownOffsetArgKind, `${offset}:${argKind}`);
      }
      for (const argSource of argSources) {
        const argSourceKind = optionArgSourceKind(argSource, offset);
        optionArgSourceEntries += 1;
        row.optionArgSourceEntries += 1;
        increment(row.byArgSourceKind, argSourceKind || "unknown");
        increment(summaryByOffsetArgSourceKind, `${offset}:${argSourceKind || "unknown"}`);
        if (semanticStatus === "unknown") increment(summaryByUnknownOffsetArgSourceKind, `${offset}:${argSourceKind || "unknown"}`);
        if (row.sampleArgSources.size < 12) row.sampleArgSources.add(argSource);
      }
      if (resourceLinked) row.resourceLinkedRows += 1;
      if (pfxLinked) row.pfxLinkedRows += 1;
      increment(row.byEvidenceKind, evidenceKind);
      const offsetIndex = offsets.indexOf(offset);
      const previousOptionOffset = offsetIndex > 0 ? offsets[offsetIndex - 1] : "";
      const nextOptionOffset = offsetIndex >= 0 && offsetIndex < offsets.length - 1 ? offsets[offsetIndex + 1] : "";
      increment(row.byPreviousOptionOffset, previousOptionOffset);
      increment(row.byNextOptionOffset, nextOptionOffset);
      increment(row.byNeighborOptionOffset, previousOptionOffset);
      increment(row.byNeighborOptionOffset, nextOptionOffset);
      const runtimeHintMatches = pfxRuntimeHintMatches(pfxRuntimeHintLookup, resourcePaths, values);
      if (runtimeHintMatches.length) {
        row.pfxRuntimeHintMatchRows += 1;
        pfxRuntimeHintMatchRows += 1;
        for (const key of runtimeHintMatches) increment(row.byPfxRuntimeHintMatch, key);
      }
      increment(row.bySourceKind, hook.sourceKind || "unknown");
      increment(row.byRuntimeBindingKind, binding.kind || "unknown");
      for (const actionKey of listValue(hook.actionKeys)) increment(row.byActionKey, actionKey);
      if (row.sampleEffectTokens.size < 8) row.sampleEffectTokens.add(hook.effectToken || hook.token || "");
      for (const resourcePath of resourcePaths) {
        if (row.sampleResourcePaths.size >= 8) break;
        row.sampleResourcePaths.add(resourcePath);
      }
      for (const value of values) {
        if (row.sampleValues.size >= 8) break;
        row.sampleValues.add(value);
      }
      if (row.sampleCallsites.length < 12) {
        const callsite = optionCallsiteSample({ hook, binding, offsets, offset, values, argKinds });
        const callsiteKey = JSON.stringify(callsite);
        if (!row.sampleCallsiteKeys.has(callsiteKey)) {
          row.sampleCallsiteKeys.add(callsiteKey);
          row.sampleCallsites.push(callsite);
        }
      }
    }
  }

  for (const row of rowsByOffset.values()) {
    if (row.semanticStatus === "unknown" && row.pfxRuntimeHintMatchRows > 0) unknownOptionCandidateOffsets += 1;
  }

  const items = [...rowsByOffset.values()]
    .sort((left, right) => sortOffset(left.offset, right.offset))
    .map((row) => ({
      offset: row.offset,
      semanticStatus: row.semanticStatus,
      semanticName: row.semanticName,
      candidateSemanticStatus: candidateSemanticStatusForRow(row),
      candidateSemanticNames: candidateSemanticNamesForRow(row),
      rows: row.rows,
      numericValueRows: row.numericValueRows,
      offsetOnlyRows: row.offsetOnlyRows,
      optionArgSourceEntries: row.optionArgSourceEntries,
      pfxRuntimeHintMatchRows: row.pfxRuntimeHintMatchRows,
      resourceLinkedRows: row.resourceLinkedRows,
      pfxLinkedRows: row.pfxLinkedRows,
      byEvidenceKind: countObject(row.byEvidenceKind),
      byNumericValue: countObject(row.byNumericValue, 32),
      byArgKind: countObject(row.byArgKind),
      byArgSourceKind: countObject(row.byArgSourceKind),
      byPfxRuntimeHintMatch: countObject(row.byPfxRuntimeHintMatch),
      byPreviousOptionOffset: countObject(row.byPreviousOptionOffset),
      byNextOptionOffset: countObject(row.byNextOptionOffset),
      byNeighborOptionOffset: countObject(row.byNeighborOptionOffset),
      bySourceKind: countObject(row.bySourceKind),
      byRuntimeBindingKind: countObject(row.byRuntimeBindingKind),
      byActionKey: countObject(row.byActionKey, 8),
      sampleEffectTokens: uniqueSorted([...row.sampleEffectTokens]),
      sampleResourcePaths: uniqueSorted([...row.sampleResourcePaths]),
      sampleValues: uniqueSorted([...row.sampleValues]),
      sampleArgSources: uniqueSorted([...row.sampleArgSources]),
      sampleCallsites: row.sampleCallsites,
    }));

  return {
    generatedAt,
    summary: {
      rawOptionHookRows,
      optionOffsetRows,
      knownOptionOffsetRows,
      unknownOptionOffsetRows,
      unknownOptionHookRows,
      unknownOptionCandidateOffsets,
      numericValueRows,
      offsetOnlyRows,
      optionArgSourceEntries,
      pfxRuntimeHintMatchRows,
      resourceLinkedRows,
      pfxLinkedRows,
      byOffset: countObject(summaryByOffset),
      byKnownOffset: countObject(summaryByKnownOffset),
      byUnknownOffset: countObject(summaryByUnknownOffset),
      byOffsetArgKind: countObject(summaryByOffsetArgKind),
      byUnknownOffsetArgKind: countObject(summaryByUnknownOffsetArgKind),
      byOffsetArgSourceKind: countObject(summaryByOffsetArgSourceKind),
      byUnknownOffsetArgSourceKind: countObject(summaryByUnknownOffsetArgSourceKind),
      bySemanticName: countObject(summaryBySemanticName),
      bySemanticStatus: countObject(summaryBySemanticStatus),
    },
    items,
  };
}

function keyValueSummary(value = {}) {
  return Object.entries(value)
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

function reportRowsForManifest(manifest = {}) {
  return (manifest.items || []).map((item) => ({
    offset: item.offset,
    semanticStatus: item.semanticStatus,
    semanticName: item.semanticName,
    candidateSemanticStatus: item.candidateSemanticStatus,
    candidateSemanticNames: (item.candidateSemanticNames || []).join("|"),
    rows: item.rows,
    numericValueRows: item.numericValueRows,
    offsetOnlyRows: item.offsetOnlyRows,
    optionArgSourceEntries: item.optionArgSourceEntries,
    pfxRuntimeHintMatchRows: item.pfxRuntimeHintMatchRows,
    resourceLinkedRows: item.resourceLinkedRows,
    pfxLinkedRows: item.pfxLinkedRows,
    byEvidenceKind: keyValueSummary(item.byEvidenceKind),
    byNumericValue: keyValueSummary(item.byNumericValue),
    byArgKind: keyValueSummary(item.byArgKind),
    byArgSourceKind: keyValueSummary(item.byArgSourceKind),
    byPfxRuntimeHintMatch: keyValueSummary(item.byPfxRuntimeHintMatch),
    byPreviousOptionOffset: keyValueSummary(item.byPreviousOptionOffset),
    byNextOptionOffset: keyValueSummary(item.byNextOptionOffset),
    byNeighborOptionOffset: keyValueSummary(item.byNeighborOptionOffset),
    bySourceKind: keyValueSummary(item.bySourceKind),
    byRuntimeBindingKind: keyValueSummary(item.byRuntimeBindingKind),
    byActionKey: keyValueSummary(item.byActionKey),
    sampleEffectTokens: (item.sampleEffectTokens || []).join("|"),
    sampleResourcePaths: (item.sampleResourcePaths || []).join("|"),
    sampleValues: (item.sampleValues || []).join("|"),
    sampleArgSources: (item.sampleArgSources || []).join("|"),
    sampleCallsites: (item.sampleCallsites || []).map(formatCallsiteSample).join("|"),
  }));
}

function exportEffectNativeOptionProfile({
  effectHookPath = defaultEffectHookPath,
  pfxManifestPath = defaultPfxManifestPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const effectHookManifest = fs.existsSync(effectHookPath) ? JSON.parse(fs.readFileSync(effectHookPath, "utf8")) : { items: [] };
  const pfxManifest = fs.existsSync(pfxManifestPath) ? JSON.parse(fs.readFileSync(pfxManifestPath, "utf8")) : { items: [] };
  const manifest = buildEffectNativeOptionProfile(effectHookManifest, new Date().toISOString(), pfxManifest);
  manifest.source = { effectHookPath, pfxManifestPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "offset",
    "semanticStatus",
    "semanticName",
    "candidateSemanticStatus",
    "candidateSemanticNames",
    "rows",
    "numericValueRows",
    "offsetOnlyRows",
    "optionArgSourceEntries",
    "pfxRuntimeHintMatchRows",
    "resourceLinkedRows",
    "pfxLinkedRows",
    "byEvidenceKind",
    "byNumericValue",
    "byArgKind",
    "byArgSourceKind",
    "byPfxRuntimeHintMatch",
    "byPreviousOptionOffset",
    "byNextOptionOffset",
    "byNeighborOptionOffset",
    "bySourceKind",
    "byRuntimeBindingKind",
    "byActionKey",
    "sampleEffectTokens",
    "sampleResourcePaths",
    "sampleValues",
    "sampleArgSources",
    "sampleCallsites",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportEffectNativeOptionProfile({
    effectHookPath: optionValue(args, "--effect-hooks", defaultEffectHookPath),
    pfxManifestPath: optionValue(args, "--pfx", defaultPfxManifestPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildEffectNativeOptionProfile,
  exportEffectNativeOptionProfile,
  reportRowsForManifest,
};
