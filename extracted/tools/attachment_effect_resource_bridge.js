#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultBridgePath = "extracted/reports/attachment_event_bridge.tsv";
const defaultEffectResourcePath = "extracted/reports/effect_resource_index.tsv";
const defaultEffectHookManifestPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultTsvOut = "extracted/reports/attachment_effect_resource_bridge.tsv";
const defaultJsonOut = "extracted/reports/attachment_effect_resource_bridge_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function readJsonItems(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
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

function effectKey(token) {
  return String(token || "").replace(/^Effect_/, "");
}

function effectBasename(relativePath) {
  return path.basename(String(relativePath || ""), ".pfx");
}

function compactEffectName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function resourceMatchesForToken(token, effectRows) {
  const key = effectKey(token).toLowerCase();
  const exact = effectRows.filter((row) => effectBasename(row.relativePath).toLowerCase() === key);
  if (exact.length) return { matchKind: "exact-basename", matches: exact };
  const compactKey = compactEffectName(key);
  const compactExact = effectRows.filter((row) => compactEffectName(effectBasename(row.relativePath)) === compactKey);
  if (compactExact.length === 1) return { matchKind: "compact-basename", matches: compactExact };
  const contains = effectRows.filter((row) => String(row.relativePath || "").toLowerCase().includes(key));
  return { matchKind: contains.length ? "contains-path" : "none", matches: contains };
}

function isConfirmedRuntimeHookResource(row) {
  if (!["confirmed", "strong"].includes(row.aliasEvidenceStrength)) return false;
  if (row.resourceEvidenceSource === "effect-resource-candidate") return false;
  return splitList(row.resourcePaths).length > 0;
}

function runtimeHookResourceMatchesForToken(token, effectHookRows = []) {
  const rows = effectHookRows.filter(
    (row) => isConfirmedRuntimeHookResource(row) && (row.token === token || row.effectToken === token),
  );
  const resourcePaths = uniq(rows.flatMap((row) => splitList(row.resourcePaths)));
  if (!resourcePaths.length) {
    return {
      matchKind: "none",
      matches: [],
      evidenceSources: [],
      evidenceStrengths: [],
    };
  }

  return {
    matchKind: "native-effect-hook-runtime-resource",
    matches: resourcePaths.map((relativePath) => ({ relativePath, hash: "" })),
    evidenceSources: uniq(rows.map((row) => row.resourceEvidenceSource)),
    evidenceStrengths: uniq(rows.map((row) => row.aliasEvidenceStrength)),
  };
}

function resourceMatchesWithRuntimeHooks(token, effectRows, effectHookRows) {
  const direct = resourceMatchesForToken(token, effectRows);
  if (direct.matches.length) {
    return {
      ...direct,
      evidenceSources: [],
      evidenceStrengths: [],
    };
  }
  return runtimeHookResourceMatchesForToken(token, effectHookRows);
}

function bridgeAttachmentEffectResources(eventBridgeRows, effectRows, options = {}) {
  const effectHookRows = Array.isArray(options.effectHookManifest)
    ? options.effectHookManifest
    : options.effectHookManifest?.items || [];
  const nativeOnlyEffectRows = eventBridgeRows.filter(
    (row) => row.bridgeStatus === "native-only" && /^Effect_/.test(row.token || ""),
  );

  return nativeOnlyEffectRows.map((row) => {
    const result = resourceMatchesWithRuntimeHooks(row.token, effectRows, effectHookRows);
    return {
      token: row.token,
      resourceStatus: result.matches.length ? "resource-matched" : "resource-unmatched",
      matchKind: result.matchKind,
      resourceCount: result.matches.length,
      resourcePaths: result.matches.map((match) => match.relativePath).join("|"),
      resourceHashes: result.matches.map((match) => match.hash).join("|"),
      resourceEvidenceSources: (result.evidenceSources || []).join("|"),
      resourceEvidenceStrengths: (result.evidenceStrengths || []).join("|"),
      nativeRoles: row.nativeRoles,
      nativePlatforms: row.nativePlatforms,
      nativeFunctions: row.nativeFunctions,
      nativeSemanticCalls: row.nativeSemanticCalls,
    };
  });
}

function summarize(rows, eventBridgeRows, effectRows) {
  const byStatus = {};
  const byMatchKind = {};
  for (const row of rows) {
    byStatus[row.resourceStatus] = (byStatus[row.resourceStatus] || 0) + 1;
    byMatchKind[row.matchKind] = (byMatchKind[row.matchKind] || 0) + 1;
  }
  return {
    eventBridgeRows: eventBridgeRows.length,
    effectResourceRows: effectRows.length,
    nativeOnlyEffectTokens: rows.length,
    byStatus,
    byMatchKind,
    unmatchedTokens: rows.filter((row) => row.resourceStatus === "resource-unmatched").map((row) => row.token),
  };
}

function exportAttachmentEffectResourceBridge({
  bridgePath = defaultBridgePath,
  effectResourcePath = defaultEffectResourcePath,
  effectHookManifestPath = defaultEffectHookManifestPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const eventBridgeRows = readTsv(bridgePath);
  const effectRows = readTsv(effectResourcePath);
  const effectHookRows = readJsonItems(effectHookManifestPath);
  const rows = bridgeAttachmentEffectResources(eventBridgeRows, effectRows, { effectHookManifest: effectHookRows });
  const columns = [
    "token",
    "resourceStatus",
    "matchKind",
    "resourceCount",
    "resourcePaths",
    "resourceHashes",
    "resourceEvidenceSources",
    "resourceEvidenceStrengths",
    "nativeRoles",
    "nativePlatforms",
    "nativeFunctions",
    "nativeSemanticCalls",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, eventBridgeRows, effectRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAttachmentEffectResourceBridge({
    bridgePath: optionValue(args, "--bridge", defaultBridgePath),
    effectResourcePath: optionValue(args, "--effects", defaultEffectResourcePath),
    effectHookManifestPath: optionValue(args, "--effect-hooks", defaultEffectHookManifestPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bridgeAttachmentEffectResources,
  effectBasename,
  effectKey,
  exportAttachmentEffectResourceBridge,
  runtimeHookResourceMatchesForToken,
  resourceMatchesForToken,
};
