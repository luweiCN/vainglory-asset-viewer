#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultDefinitionBuildLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultCurrentNativeLevelVisualsSchemaAuditPath =
  "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultJsonOut = "extracted/reports/level_visuals_definition_field_bridge.json";
const defaultTsvOut = "extracted/reports/level_visuals_definition_field_bridge.tsv";
const defaultViewerOut = "extracted/viewer/level-visuals-definition-field-bridge.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsvRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = parts[index] ?? "";
    return row;
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function hex(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${value.toString(16)}`;
  return "";
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function extensionFor(relativePath) {
  return (relativePath.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
}

function currentLevelVisualsFields(schemaAudit) {
  return (schemaAudit.fields || []).map((field) => ({
    fieldIndex: Number(field.fieldIndex),
    fieldOffset: Number(field.fieldOffset),
    fieldOffsetHex: hex(Number(field.fieldOffset)),
    typeName: field.typeName || "",
  }));
}

function fieldsByType(fields, typeName) {
  return fields.filter((field) => field.typeName === typeName);
}

function bridgeCandidatesForLink(link, fields) {
  const targetExtension = extensionFor(link.targetRelativePath);
  const normalizedCategory = link.category || "";
  if (targetExtension === ".lightfield") {
    return {
      targetKind: "lightfield-profile-payload",
      candidateFields: fieldsByType(fields, "char*"),
      evidenceState: "definition-link-label-plus-native-profile-loader-candidate",
      bridgeStrength: link.label === "LightOmni" ? "strong-candidate-not-offset-proof" : "candidate-not-offset-proof",
      boundary:
        "The definition link label and target path identify a lightfield/profile resource. Native code proves LevelVisuals +0x50 is char* and reaches the profile loader, but the decoded definition link does not by itself prove field offset assignment.",
    };
  }
  if (normalizedCategory === "mesh" || targetExtension === ".mesh") {
    return {
      targetKind: "static-mesh-resource",
      candidateFields: fieldsByType(fields, "StaticMesh**"),
      evidenceState: "definition-resource-category-plus-native-field-type",
      bridgeStrength: "type-family-only",
      boundary:
        "The resource category matches the StaticMesh** field family. Current evidence does not assign this specific link to one of the three StaticMesh** offsets.",
    };
  }
  if (normalizedCategory === "effect" || targetExtension === ".pfx") {
    return {
      targetKind: "static-pfx-resource",
      candidateFields: fieldsByType(fields, "StaticPfx**"),
      evidenceState: "definition-resource-category-plus-native-field-type",
      bridgeStrength: "type-family-only",
      boundary:
        "The resource category matches the StaticPfx** field family. Current evidence does not assign this specific link to one of the three StaticPfx** offsets.",
    };
  }
  if (normalizedCategory === "audio" || targetExtension === ".wav") {
    return {
      targetKind: "sound-resource",
      candidateFields: [...fieldsByType(fields, "StaticSound**"), ...fieldsByType(fields, "SoundVolume**")],
      evidenceState: "definition-resource-category-plus-native-field-type-ambiguous",
      bridgeStrength: "type-family-ambiguous",
      boundary:
        "The resource category matches the sound field family, but current definition-link evidence does not separate StaticSound** from SoundVolume**.",
    };
  }
  return {
    targetKind: "unbridged-resource",
    candidateFields: [],
    evidenceState: "no-current-native-levelvisuals-field-bridge",
    bridgeStrength: "none",
    boundary:
      "This resource link is present in a LevelVisuals definition, but no current native LevelVisuals field bridge is proven for its category.",
  };
}

function buildRows(links, fields) {
  const visualLinks = links.filter((row) => /^Levels\/Visuals\//.test(row.sourceRelativePath || ""));
  return visualLinks.map((link) => {
    const bridge = bridgeCandidatesForLink(link, fields);
    return {
      sourceRelativePath: link.sourceRelativePath,
      blockIndexes: link.blockIndexes,
      firstStringIndex: link.firstStringIndex,
      label: link.label,
      category: link.category,
      targetRelativePath: link.targetRelativePath,
      targetExtension: extensionFor(link.targetRelativePath),
      targetKind: bridge.targetKind,
      candidateFieldOffsets: bridge.candidateFields.map((field) => field.fieldOffsetHex).join("|"),
      candidateFieldTypes: uniqueSorted(bridge.candidateFields.map((field) => field.typeName)).join("|"),
      candidateFieldIndexes: bridge.candidateFields.map((field) => field.fieldIndex).join("|"),
      evidenceState: bridge.evidenceState,
      bridgeStrength: bridge.bridgeStrength,
      boundary: bridge.boundary,
    };
  });
}

function summarize(rows, fields) {
  const byTargetKind = new Map();
  const byBridgeStrength = new Map();
  const byEvidenceState = new Map();
  const byLabelTargetKind = new Map();
  for (const row of rows) {
    increment(byTargetKind, row.targetKind || "unknown");
    increment(byBridgeStrength, row.bridgeStrength || "unknown");
    increment(byEvidenceState, row.evidenceState || "unknown");
    increment(byLabelTargetKind, [row.label || "", row.targetKind || "unknown"].join(" / "));
  }

  const lightfieldRows = rows.filter((row) => row.targetKind === "lightfield-profile-payload");
  const lightfieldLabels = uniqueSorted(lightfieldRows.map((row) => row.label));
  const uniqueVisualDefinitions = uniqueSorted(rows.map((row) => row.sourceRelativePath));

  return {
    visualDefinitions: uniqueVisualDefinitions.length,
    visualDefinitionLinks: rows.length,
    nativeLevelVisualsFields: fields.length,
    byTargetKind: mapToObject(byTargetKind),
    byBridgeStrength: mapToObject(byBridgeStrength),
    byEvidenceState: mapToObject(byEvidenceState),
    topLabelTargetKinds: [...byLabelTargetKind.entries()]
      .map(([labelTargetKind, count]) => ({ labelTargetKind, count }))
      .sort((left, right) => right.count - left.count || left.labelTargetKind.localeCompare(right.labelTargetKind))
      .slice(0, 40),
    lightfieldProfilePayloadCandidate: {
      linkCount: lightfieldRows.length,
      labels: lightfieldLabels,
      allLabelsAreLightOmni: lightfieldRows.length > 0 && lightfieldLabels.length === 1 && lightfieldLabels[0] === "LightOmni",
      candidateLevelVisualsOffsetHexes: uniqueSorted(
        lightfieldRows.flatMap((row) => row.candidateFieldOffsets.split("|")),
      ),
      sourceVisuals: uniqueSorted(lightfieldRows.map((row) => row.sourceRelativePath)),
      interpretation:
        "The definition side consistently labels .lightfield links as LightOmni, while current native code routes LevelVisuals char* +0x50 to the profile loader. This is strong label evidence for review, but it remains diagnostic until offset assignment and active preview selection are proven together.",
    },
  };
}

function buildLevelVisualsDefinitionFieldBridge({
  definitionBuildLinksPath = defaultDefinitionBuildLinksPath,
  currentNativeLevelVisualsSchemaAuditPath = defaultCurrentNativeLevelVisualsSchemaAuditPath,
} = {}) {
  const links = readTsvRows(definitionBuildLinksPath);
  const schemaAudit = JSON.parse(fs.readFileSync(currentNativeLevelVisualsSchemaAuditPath, "utf8"));
  const fields = currentLevelVisualsFields(schemaAudit);
  const rows = buildRows(links, fields);
  const summary = summarize(rows, fields);
  return {
    generatedAt: new Date().toISOString(),
    policy:
      "diagnostic-only definition/native bridge; resource labels and native field types must not affect rendering until item layout, exact offset assignment, active preview LevelVisuals ownership, and profile/light/probe runtime values are proven",
    source: {
      definitionBuildLinksPath,
      currentNativeLevelVisualsSchemaAuditPath,
    },
    summary,
    nativeLevelVisualsFields: fields,
    rows,
    interpretation: [
      "Levels/Visuals definition resources expose decoded link labels such as mesh labels, ambient sound labels, and LightOmni .lightfield links.",
      "Current native schema exposes LevelVisuals field types and offsets, but most repeated list fields are only bridged by type family at this stage.",
      "The .lightfield links are stronger evidence because they are consistently labeled LightOmni and the native LevelVisuals +0x50 char* route reaches the profile/lightfield loader.",
      "This report still does not decode list item layout, assign individual mesh/PFX links to specific repeated offsets, or prove the active hero/model preview LevelVisuals record.",
    ],
  };
}

function run({
  definitionBuildLinksPath = defaultDefinitionBuildLinksPath,
  currentNativeLevelVisualsSchemaAuditPath = defaultCurrentNativeLevelVisualsSchemaAuditPath,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const manifest = buildLevelVisualsDefinitionFieldBridge({
    definitionBuildLinksPath,
    currentNativeLevelVisualsSchemaAuditPath,
  });
  writeJson(jsonOut, manifest);
  writeJson(viewerOut, manifest);
  writeTsv(tsvOut, manifest.rows, [
    "sourceRelativePath",
    "blockIndexes",
    "firstStringIndex",
    "label",
    "category",
    "targetRelativePath",
    "targetExtension",
    "targetKind",
    "candidateFieldOffsets",
    "candidateFieldTypes",
    "candidateFieldIndexes",
    "evidenceState",
    "bridgeStrength",
    "boundary",
  ]);
  return manifest;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const manifest = run({
    definitionBuildLinksPath: optionValue(args, "--definition-build-links", defaultDefinitionBuildLinksPath),
    currentNativeLevelVisualsSchemaAuditPath: optionValue(
      args,
      "--current-native-levelvisuals-schema-audit",
      defaultCurrentNativeLevelVisualsSchemaAuditPath,
    ),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify({ summary: manifest.summary }, null, 2));
}

module.exports = {
  buildLevelVisualsDefinitionFieldBridge,
  run,
};
