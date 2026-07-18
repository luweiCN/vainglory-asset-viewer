#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSchemaRows,
  extractFieldDescriptorBlocks,
  extractTypeRegistrations,
  findFunctionBlocks,
} = require("./native_type_registry");

const defaultSourcePath = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1004b.c";
const defaultViewerOut = "extracted/viewer/native-effect-runtime-schema.json";
const defaultTsvOut = "extracted/reports/native_effect_runtime_schema.tsv";
const defaultJsonOut = "extracted/reports/native_effect_runtime_schema_summary.json";
const defaultEffectRuntimeFocusTypes = [
  "Effect",
  "EffectGroup",
  "EffectSet",
  "StaticPfx",
  "LevelVisuals",
  "MenuParticleInfo",
  "MenuParticleData",
  "MenuMeshParticleInfo",
  "MenuMeshShaderParam",
  "MenuMeshData",
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function summarizeSchemaRows(items) {
  const byType = {};
  for (const item of items || []) increment(byType, item.typeName);
  return {
    schemaRows: items.length,
    types: Object.keys(byType).length,
    candidateRows: items.filter((item) => item.candidateTypes).length,
    exactSpanRows: items.filter((item) => item.exactSpanCandidates).length,
    byType,
  };
}

function buildNativeEffectRuntimeSchema(sourceText, options = {}, generatedAt = new Date().toISOString()) {
  const focusTypes = options.focusTypes || defaultEffectRuntimeFocusTypes;
  const blocks = findFunctionBlocks(sourceText);
  const { rows: registrations } = extractTypeRegistrations(blocks);
  const descriptorBlocks = extractFieldDescriptorBlocks(blocks);
  const items = buildSchemaRows({ registrations, descriptorBlocks, focusTypes });
  return {
    generatedAt,
    focusTypes,
    summary: summarizeSchemaRows(items),
    items,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    typeName: item.typeName,
    typeSize: item.typeSize,
    fieldIndex: item.fieldIndex,
    fieldOffset: item.fieldOffset,
    nextFieldOffset: item.nextFieldOffset,
    fieldSpan: item.fieldSpan,
    typePointerSymbol: item.typePointerSymbol,
    candidateTypes: item.candidateTypes,
    exactSpanCandidates: item.exactSpanCandidates,
    registrationFunction: item.registrationFunction,
    descriptorInitFunction: item.descriptorInitFunction,
  }));
}

function exportNativeEffectRuntimeSchema({
  sourcePath = defaultSourcePath,
  focusTypes = defaultEffectRuntimeFocusTypes,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeEffectRuntimeSchema(fs.readFileSync(sourcePath, "utf8"), { focusTypes });
  manifest.source = { sourcePath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "typeName",
    "typeSize",
    "fieldIndex",
    "fieldOffset",
    "nextFieldOffset",
    "fieldSpan",
    "typePointerSymbol",
    "candidateTypes",
    "exactSpanCandidates",
    "registrationFunction",
    "descriptorInitFunction",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const focusArg = optionValue(args, "--focus", "");
  console.log(JSON.stringify(exportNativeEffectRuntimeSchema({
    sourcePath: optionValue(args, "--source", defaultSourcePath),
    focusTypes: focusArg ? focusArg.split(",").map((item) => item.trim()).filter(Boolean) : defaultEffectRuntimeFocusTypes,
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  }), null, 2));
}

module.exports = {
  buildNativeEffectRuntimeSchema,
  defaultEffectRuntimeFocusTypes,
  exportNativeEffectRuntimeSchema,
  reportRowsForManifest,
  summarizeSchemaRows,
};
