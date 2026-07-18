#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultDefinitionStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultViewerOut = "extracted/viewer/current-native-definition-shaderparam-static-string-audit.json";
const defaultJsonOut = "extracted/reports/current_native_definition_shaderparam_static_string_audit.json";
const defaultTsvOut = "extracted/reports/current_native_definition_shaderparam_static_string_audit.tsv";

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

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines.shift().split("\t");
  return lines
    .filter(Boolean)
    .map((line) => {
      const cells = line.split("\t");
      return Object.fromEntries(header.map((column, index) => [column, cells[index] || ""]));
    });
}

function addCount(counts, key) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + 1;
}

function isShaderUniformCandidate(value) {
  return /^u_[A-Za-z0-9_]+$/.test(String(value || ""));
}

function isNativeSamplerName(value) {
  return /^sampler\d+$/.test(String(value || ""));
}

function candidateClassForRow(row) {
  const value = row.value || "";
  if (isShaderUniformCandidate(value)) return "shader-uniform-name-string";
  if (isNativeSamplerName(value)) return "native-sampler-name-string";
  if (/\.shadergraph\b/i.test(value)) return "shadergraph-path-string";
  return "";
}

function buildCurrentNativeDefinitionShaderParamStaticStringAudit(
  { definitionStringsPath = defaultDefinitionStringsPath } = {},
  generatedAt = new Date().toISOString(),
) {
  const rows = readTsv(definitionStringsPath);
  const candidateRows = [];
  const byCandidateClass = {};
  const byUniformName = {};
  const byResourceCategory = {};
  const byDefinition = {};

  for (const row of rows) {
    const candidateClass = candidateClassForRow(row);
    if (row.resourceCategory) addCount(byResourceCategory, row.resourceCategory);
    if (!candidateClass) continue;
    addCount(byCandidateClass, candidateClass);
    if (candidateClass === "shader-uniform-name-string") addCount(byUniformName, row.value);
    addCount(byDefinition, row.relativePath);
    candidateRows.push({
      relativePath: row.relativePath || "",
      blockIndex: row.blockIndex || "",
      stringIndex: row.stringIndex || "",
      semantic: row.semantic || "",
      labelBefore: row.labelBefore || "",
      value: row.value || "",
      resourceCategory: row.resourceCategory || "",
      targetRelativePath: row.targetRelativePath || "",
      candidateClass,
      structuredShaderParamsOwnershipRecovered: false,
      sourceProgramEntryOwnershipRecovered: false,
      renderPromotionAllowed: false,
    });
  }

  const uniqueUniformNames = Object.keys(byUniformName).sort();
  const summary = {
    definitionStringRows: rows.length,
    candidateRows: candidateRows.length,
    shaderUniformNameStringRows: byCandidateClass["shader-uniform-name-string"] || 0,
    uniqueShaderUniformNameRows: uniqueUniformNames.length,
    nativeSamplerNameStringRows: byCandidateClass["native-sampler-name-string"] || 0,
    shadergraphPathStringRows: byCandidateClass["shadergraph-path-string"] || 0,
    meshResourceRows: byResourceCategory.mesh || 0,
    effectResourceRows: byResourceCategory.effect || 0,
    textureResourceRows: byResourceCategory.texture || 0,
    definitionRowsWithCandidates: Object.keys(byDefinition).length,
    staticShaderUniformNamesRecovered: uniqueUniformNames.length > 0,
    staticDefinitionSamplerNamesRecovered: Boolean(byCandidateClass["native-sampler-name-string"]),
    staticDefinitionShadergraphPathsRecovered: Boolean(byCandidateClass["shadergraph-path-string"]),
    structuredShaderParamsOwnershipRecovered: false,
    resourceListSemanticNamesRecovered: false,
    sourceProgramStaticReplacementAllowed: false,
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
    byCandidateClass,
    topShaderUniformNames: Object.entries(byUniformName)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 40)
      .map(([name, count]) => ({ name, count })),
  };

  return {
    generatedAt,
    source: { definitionStringsPath },
    policy:
      "diagnostic-only definition shader parameter string audit; static strings can name candidate uniforms but cannot replace source/program runtime ownership evidence",
    summary,
    interpretation: {
      recovered:
        "Decoded definition string tables expose a small set of shader-uniform-like labels such as u_color and u_skin_select.",
      boundary:
        "The current static string report does not recover the structured ShaderParams object values, source/program table entries, native sampler names, shadergraph paths, or texData ownership. These strings are useful search seeds only.",
      nextRequiredEvidence:
        "Trace decoded definition payload structure for ShaderParams +0/+0x8 or import original-runtime source/program capture rows before using these labels for sampler/material rendering.",
    },
    items: candidateRows,
  };
}

function exportCurrentNativeDefinitionShaderParamStaticStringAudit({
  definitionStringsPath = defaultDefinitionStringsPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeDefinitionShaderParamStaticStringAudit({ definitionStringsPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "relativePath",
    "blockIndex",
    "stringIndex",
    "semantic",
    "labelBefore",
    "value",
    "resourceCategory",
    "targetRelativePath",
    "candidateClass",
    "structuredShaderParamsOwnershipRecovered",
    "sourceProgramEntryOwnershipRecovered",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeDefinitionShaderParamStaticStringAudit({
    definitionStringsPath: optionValue(args, "--definition-strings", defaultDefinitionStringsPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeDefinitionShaderParamStaticStringAudit,
  exportCurrentNativeDefinitionShaderParamStaticStringAudit,
};
