#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSchemaPath = "extracted/viewer/native-effect-runtime-schema.json";
const defaultViewerOut = "extracted/viewer/native-effect-runtime-links.json";
const defaultTsvOut = "extracted/reports/native_effect_runtime_links.tsv";
const defaultJsonOut = "extracted/reports/native_effect_runtime_links_summary.json";

const relationshipRules = [
  ["EffectGroup", "Effect", "effect-chain"],
  ["EffectGroup", "EffectGroup", "effect-chain"],
  ["EffectGroup", "EffectSet", "effect-chain"],
  ["EffectSet", "Effect", "effect-chain"],
  ["EffectSet", "EffectGroup", "effect-chain"],
  ["EffectSet", "EffectSet", "effect-chain"],
  ["LevelVisuals", "StaticPfx", "level-visuals-static-pfx"],
  ["LevelVisuals", "StaticSound", "level-visuals-static-sound"],
  ["LevelVisuals", "StaticLensFlare", "level-visuals-lens-flare"],
  ["MenuMeshData", "MenuMeshShaderParam", "menu-mesh-shader-params"],
  ["MenuMeshData", "MenuParticleInfo", "menu-mesh-particles"],
  ["MenuMeshData", "MenuParticleData", "menu-mesh-particle-data"],
  ["MenuMeshData", "MenuMeshOmniLight", "menu-mesh-omni-light"],
  ["MenuParticleData", "MenuParticleInfo", "menu-particle-data-info"],
  ["MenuParticleData", "MenuParticleData", "menu-particle-data-chain"],
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function baseTypeName(typeName) {
  return String(typeName || "").replace(/\*+$/g, "");
}

function pointerDepth(typeName) {
  return (String(typeName || "").match(/\*/g) || []).length;
}

function parseCandidate(candidateText) {
  const text = String(candidateText || "").trim();
  if (!text) return null;
  const match = text.match(/^(.+?)@(0x[0-9a-fA-F]+):([^:]+):kind(\d+):([+-]0x[0-9a-fA-F]+):([^:]+)$/);
  if (!match) return null;
  return {
    typeName: match[1],
    baseType: baseTypeName(match[1]),
    dataAddress: match[2],
    typeSize: match[3],
    typeKind: `kind${match[4]}`,
    delta: match[5],
    evidence: match[6],
    pointerDepth: pointerDepth(match[1]),
  };
}

function parseExactCandidates(value) {
  return String(value || "")
    .split("|")
    .map(parseCandidate)
    .filter(Boolean);
}

function rulesForSource(sourceType) {
  return relationshipRules
    .filter(([ruleSource]) => ruleSource === sourceType)
    .map(([, targetBaseType, relationshipKind]) => ({ targetBaseType, relationshipKind }));
}

function fieldSlotKey(item) {
  return `${item.sourceType || item.typeName || ""}\t${item.fieldOffset || ""}`;
}

function summarizeLinks(items) {
  const byRelationshipKind = {};
  const fieldSlots = new Map();
  for (const item of items || []) {
    increment(byRelationshipKind, item.relationshipKind);
    const key = fieldSlotKey(item);
    fieldSlots.set(key, (fieldSlots.get(key) || 0) + 1);
  }
  const slotCountFor = (relationshipKind) =>
    new Set((items || []).filter((item) => item.relationshipKind === relationshipKind).map(fieldSlotKey)).size;
  return {
    rows: items.length,
    fieldSlots: fieldSlots.size,
    ambiguousFieldSlots: [...fieldSlots.values()].filter((count) => count > 1).length,
    levelVisualsStaticPfxSlots: slotCountFor("level-visuals-static-pfx"),
    levelVisualsStaticSoundSlots: slotCountFor("level-visuals-static-sound"),
    levelVisualsLensFlareSlots: slotCountFor("level-visuals-lens-flare"),
    menuMeshOmniLightSlots: slotCountFor("menu-mesh-omni-light"),
    menuMeshParticleCandidateSlots: slotCountFor("menu-mesh-particles"),
    byRelationshipKind,
  };
}

function buildNativeEffectRuntimeLinks(schemaManifest, generatedAt = new Date().toISOString()) {
  const items = [];

  for (const schemaRow of schemaManifest.items || []) {
    const candidates = parseExactCandidates(schemaRow.exactSpanCandidates);
    const rules = rulesForSource(schemaRow.typeName);
    if (!candidates.length || !rules.length) continue;

    for (const rule of rules) {
      const candidate = candidates.find((entry) => entry.baseType === rule.targetBaseType);
      if (!candidate) continue;
      items.push({
        id: `${schemaRow.typeName}:${schemaRow.fieldOffset}:${rule.targetBaseType}`,
        sourceType: schemaRow.typeName,
        fieldIndex: schemaRow.fieldIndex ?? "",
        fieldOffset: schemaRow.fieldOffset || "",
        fieldSpan: schemaRow.fieldSpan || "",
        relationshipKind: rule.relationshipKind,
        targetBaseType: candidate.baseType,
        targetTypeName: candidate.typeName,
        targetDataAddress: candidate.dataAddress,
        targetTypeSize: candidate.typeSize,
        targetTypeKind: candidate.typeKind,
        targetDelta: candidate.delta,
        targetPointerDepth: candidate.pointerDepth,
        evidence: candidate.evidence,
        typePointerSymbol: schemaRow.typePointerSymbol || "",
        registrationFunction: schemaRow.registrationFunction || "",
        descriptorInitFunction: schemaRow.descriptorInitFunction || "",
      });
    }
  }

  return {
    generatedAt,
    source: schemaManifest.source || {},
    summary: summarizeLinks(items),
    items,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    sourceType: item.sourceType,
    fieldIndex: item.fieldIndex,
    fieldOffset: item.fieldOffset,
    fieldSpan: item.fieldSpan,
    relationshipKind: item.relationshipKind,
    targetBaseType: item.targetBaseType,
    targetTypeName: item.targetTypeName,
    targetDataAddress: item.targetDataAddress,
    targetTypeSize: item.targetTypeSize,
    targetTypeKind: item.targetTypeKind,
    targetDelta: item.targetDelta,
    targetPointerDepth: item.targetPointerDepth,
    evidence: item.evidence,
    typePointerSymbol: item.typePointerSymbol,
    registrationFunction: item.registrationFunction,
    descriptorInitFunction: item.descriptorInitFunction,
  }));
}

function exportNativeEffectRuntimeLinks({
  schemaPath = defaultSchemaPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeEffectRuntimeLinks(readJson(schemaPath));
  manifest.source = { ...(manifest.source || {}), schemaPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "sourceType",
    "fieldIndex",
    "fieldOffset",
    "fieldSpan",
    "relationshipKind",
    "targetBaseType",
    "targetTypeName",
    "targetDataAddress",
    "targetTypeSize",
    "targetTypeKind",
    "targetDelta",
    "targetPointerDepth",
    "evidence",
    "typePointerSymbol",
    "registrationFunction",
    "descriptorInitFunction",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(JSON.stringify(exportNativeEffectRuntimeLinks({
    schemaPath: optionValue(args, "--schema", defaultSchemaPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  }), null, 2));
}

module.exports = {
  buildNativeEffectRuntimeLinks,
  exportNativeEffectRuntimeLinks,
  parseCandidate,
  reportRowsForManifest,
  summarizeLinks,
};
