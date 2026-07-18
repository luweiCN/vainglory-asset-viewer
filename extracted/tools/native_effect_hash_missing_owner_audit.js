#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultNativeAuditPath = "extracted/reports/native_effect_token_only_callsite_audit.json";
const defaultDefinitionManifestPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultJsonOut = "extracted/reports/native_effect_hash_missing_owner_audit.json";
const defaultViewerOut = "extracted/viewer/native-effect-hash-missing-owner-audit.json";
const defaultTsvOut = "extracted/reports/native_effect_hash_missing_owner_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = {}) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDefinitionManifestIndex(rows = []) {
  const index = new Map();
  for (const row of rows) {
    const label = row.manifestLabel || "";
    if (!label) continue;
    index.set(label, row);
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
      index.set(`${source.sourceFile}\t${block.functionName}`, {
        ...block,
        sourceFile: source.sourceFile,
      });
    }
  }
  return index;
}

function buildFunctionBlockIndexFromRows(rows = []) {
  const wantedByFile = new Map();
  for (const row of rows) {
    if (!row.sourceFile || !row.sourceFunction) continue;
    if (!wantedByFile.has(row.sourceFile)) wantedByFile.set(row.sourceFile, new Set());
    wantedByFile.get(row.sourceFile).add(row.sourceFunction);
  }

  const index = new Map();
  for (const [sourceFile, wantedFunctions] of wantedByFile.entries()) {
    if (!fs.existsSync(sourceFile)) continue;
    const text = fs.readFileSync(sourceFile, "utf8");
    const sourceIndex = buildFunctionBlockIndexFromSources([{ sourceFile, text }], wantedFunctions);
    for (const [key, block] of sourceIndex.entries()) index.set(key, block);
  }
  return index;
}

function definitionSymbols(text) {
  return uniqueSorted([...String(text || "").matchAll(/\*([A-Za-z0-9_]+)\*/g)].map((match) => `*${match[1]}*`));
}

function runtimeNameReferences(text) {
  return uniqueSorted(
    [...String(text || "").matchAll(/\b(?:Ability__[A-Za-z0-9_]+|Buff_[A-Za-z0-9_]+|Sound_[A-Za-z0-9_]+|Effect_[A-Za-z0-9_]+)/g)].map(
      (match) => match[0],
    ),
  );
}

function nonPfxOwnerStateFor({ ownerDefinitions, runtimeReferences, sourceBlockFound }) {
  if (!sourceBlockFound) return "source-function-missing";
  if (
    ownerDefinitions.some(
      (row) =>
        row.targetFamily === "character" &&
        (Number(row.meshCount) > 0 || Number(row.skeletonCount) > 0 || Number(row.animationCount) > 0),
    )
  ) {
    return "spawned-character-definition-owner";
  }
  if (ownerDefinitions.length) return "spawned-definition-owner";
  if (runtimeReferences.some((value) => /^(?:Ability__|Buff_|Sound_)/.test(value))) {
    return "native-state-or-buff-owner-unresolved";
  }
  return "hash-missing-owner-unresolved";
}

function nextRequiredEvidenceFor(ownerState) {
  if (ownerState === "spawned-character-definition-owner" || ownerState === "spawned-definition-owner") {
    return "recover-spawned-definition-renderer-and-lifecycle-before-effect-promotion";
  }
  if (ownerState === "native-state-or-buff-owner-unresolved") {
    return "recover-state-token-alias-or-runtime-resource-owner";
  }
  if (ownerState === "source-function-missing") return "recover-or-locate-current-source-function";
  return "recover-alias-or-non-pfx-runtime-owner";
}

function auditHashMissingRow(row, block, definitionManifestIndex) {
  const sourceText = block?.text || "";
  const symbols = definitionSymbols(sourceText);
  const ownerDefinitions = symbols.map((symbol) => definitionManifestIndex.get(symbol)).filter(Boolean);
  const references = runtimeNameReferences(`${row.operationSequence || ""}\n${sourceText}`);
  const ownerState = nonPfxOwnerStateFor({
    ownerDefinitions,
    runtimeReferences: references,
    sourceBlockFound: Boolean(block),
  });

  return {
    id: row.id || "",
    effectToken: row.effectToken || "",
    platform: row.platform || "",
    sourceKind: row.sourceKind || "",
    sourceFunction: row.sourceFunction || "",
    sourceLine: row.sourceLine ?? "",
    sourceFile: row.sourceFile || "",
    sourceBlockFound: Boolean(block),
    kindredEffectHashHex: row.kindredEffectHashHex || "",
    kindredHashLookupState: row.kindredHashLookupState || "",
    nonPfxOwnerState: ownerState,
    definitionSymbols: symbols.join("|"),
    ownerDefinitionPaths: uniqueSorted(ownerDefinitions.map((definition) => definition.targetRelativePath)).join("|"),
    ownerDefinitionFamilies: uniqueSorted(ownerDefinitions.map((definition) => definition.targetFamily)).join("|"),
    ownerDefinitionMeshSamples: uniqueSorted(ownerDefinitions.flatMap((definition) => listValue(definition.meshSamples))).join("|"),
    ownerDefinitionSkeletonSamples: uniqueSorted(ownerDefinitions.flatMap((definition) => listValue(definition.skeletonSamples))).join("|"),
    ownerDefinitionAnimationLabels: uniqueSorted(ownerDefinitions.flatMap((definition) => listValue(definition.animationLabels))).join("|"),
    runtimeReferences: references.join("|"),
    actionKeys: row.actionKeys || "",
    heroNames: row.heroNames || "",
    renderPromotionAllowed: false,
    nextRequiredEvidence: nextRequiredEvidenceFor(ownerState),
  };
}

function summarize(items) {
  const byNonPfxOwnerState = {};
  const byPlatform = {};
  for (const item of items || []) {
    increment(byNonPfxOwnerState, item.nonPfxOwnerState);
    increment(byPlatform, item.platform);
  }
  return {
    rows: items.length,
    uniqueEffectTokens: new Set(items.map((item) => item.effectToken).filter(Boolean)).size,
    sourceFoundRows: items.filter((item) => item.sourceBlockFound).length,
    spawnedDefinitionOwnerRows: items.filter((item) => /spawned-.*definition-owner/.test(item.nonPfxOwnerState)).length,
    spawnedCharacterDefinitionOwnerRows: items.filter(
      (item) => item.nonPfxOwnerState === "spawned-character-definition-owner",
    ).length,
    stateOrBuffOwnerUnresolvedRows: items.filter(
      (item) => item.nonPfxOwnerState === "native-state-or-buff-owner-unresolved",
    ).length,
    unresolvedOwnerRows: items.filter((item) => item.nonPfxOwnerState === "hash-missing-owner-unresolved").length,
    renderPromotionAllowed: false,
    byNonPfxOwnerState,
    byPlatform,
  };
}

function buildNativeEffectHashMissingOwnerAudit(
  { nativeAuditManifest = {}, definitionManifestRows = [], sourceFiles = null } = {},
  generatedAt = new Date().toISOString(),
) {
  const rows = (nativeAuditManifest.items || []).filter(
    (item) => item.kindredHashLookupState === "kindred-effects-hash-missing",
  );
  const definitionManifestIndex = buildDefinitionManifestIndex(definitionManifestRows);
  const wantedFunctions = new Set(rows.map((row) => row.sourceFunction).filter(Boolean));
  const blockIndex = sourceFiles
    ? buildFunctionBlockIndexFromSources(sourceFiles, wantedFunctions)
    : buildFunctionBlockIndexFromRows(rows);
  const items = rows.map((row) =>
    auditHashMissingRow(row, blockIndex.get(`${row.sourceFile}\t${row.sourceFunction}`), definitionManifestIndex),
  );

  return {
    generatedAt,
    source: {
      nativeAuditPath: defaultNativeAuditPath,
      definitionManifestPath: defaultDefinitionManifestPath,
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
    platform: item.platform,
    sourceKind: item.sourceKind,
    sourceFunction: item.sourceFunction,
    sourceLine: item.sourceLine,
    kindredEffectHashHex: item.kindredEffectHashHex,
    nonPfxOwnerState: item.nonPfxOwnerState,
    definitionSymbols: item.definitionSymbols,
    ownerDefinitionPaths: item.ownerDefinitionPaths,
    ownerDefinitionFamilies: item.ownerDefinitionFamilies,
    ownerDefinitionMeshSamples: item.ownerDefinitionMeshSamples,
    ownerDefinitionSkeletonSamples: item.ownerDefinitionSkeletonSamples,
    ownerDefinitionAnimationLabels: item.ownerDefinitionAnimationLabels,
    runtimeReferences: item.runtimeReferences,
    actionKeys: item.actionKeys,
    heroNames: item.heroNames,
    renderPromotionAllowed: item.renderPromotionAllowed,
    nextRequiredEvidence: item.nextRequiredEvidence,
  }));
}

function exportNativeEffectHashMissingOwnerAudit({
  nativeAuditPath = defaultNativeAuditPath,
  definitionManifestPath = defaultDefinitionManifestPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildNativeEffectHashMissingOwnerAudit({
    nativeAuditManifest: readJson(nativeAuditPath, {}),
    definitionManifestRows: readTsv(definitionManifestPath),
  });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "effectToken",
    "platform",
    "sourceKind",
    "sourceFunction",
    "sourceLine",
    "kindredEffectHashHex",
    "nonPfxOwnerState",
    "definitionSymbols",
    "ownerDefinitionPaths",
    "ownerDefinitionFamilies",
    "ownerDefinitionMeshSamples",
    "ownerDefinitionSkeletonSamples",
    "ownerDefinitionAnimationLabels",
    "runtimeReferences",
    "actionKeys",
    "heroNames",
    "renderPromotionAllowed",
    "nextRequiredEvidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectHashMissingOwnerAudit({
    nativeAuditPath: optionValue(args, "--native-audit", defaultNativeAuditPath),
    definitionManifestPath: optionValue(args, "--definition-manifest", defaultDefinitionManifestPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  auditHashMissingRow,
  buildDefinitionManifestIndex,
  buildNativeEffectHashMissingOwnerAudit,
  definitionSymbols,
  exportNativeEffectHashMissingOwnerAudit,
  nonPfxOwnerStateFor,
  runtimeNameReferences,
  summarize,
};
