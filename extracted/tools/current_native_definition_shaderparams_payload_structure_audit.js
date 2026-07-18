#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File } = require("./cff0_tools");
const { readDefinitionIndex } = require("./export_cff0_reports");

const defaultRuntimeSkinFieldsPath = "extracted/reports/cff0_runtime_skin_fields.tsv";
const defaultDefinitionIndexPath = "extracted/reports/definition_resource_index.tsv";
const defaultViewerOut = "extracted/viewer/current-native-definition-shaderparams-payload-structure-audit.json";
const defaultJsonOut = "extracted/reports/current_native_definition_shaderparams_payload_structure_audit.json";
const defaultTsvOut = "extracted/reports/current_native_definition_shaderparams_payload_structure_audit.tsv";

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
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function addCount(counts, key) {
  if (!key) return;
  counts[key] = (counts[key] || 0) + 1;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function isShaderUniformName(value) {
  return /^u_[A-Za-z0-9_]+$/.test(String(value || ""));
}

function isNativeSamplerName(value) {
  return /^sampler\d+$/i.test(String(value || ""));
}

function isShadergraphPath(value) {
  return /\.shadergraph\b/i.test(String(value || ""));
}

function isTextureResource(row) {
  const target = row.targetRelativePath || row.value || "";
  return row.resourceCategory === "texture" || /\.(?:pvr|png|jpe?g|ktx|dds|tga|webp)$/i.test(target);
}

function uniformClassForName(value) {
  const name = String(value || "");
  if (/color|rgb|glow|ambient|crystal/i.test(name)) return "color-like-uniform";
  if (/uv|offset|path/i.test(name)) return "uv-or-path-uniform";
  if (/hide|active|select|ghost|small_dragon/i.test(name)) return "selector-or-visibility-uniform";
  return "other-uniform";
}

function ownerKey(row) {
  return [
    row.relativePath || "",
    row.blockIndex || "",
    row.modelLabel || "",
    row.recordStartField || "",
  ].join("\t");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowsInWindow(rows, centerFieldOffset, radiusBytes = 160) {
  const center = numberValue(centerFieldOffset);
  if (center === null) return [];
  return rows.filter((row) => {
    const fieldOffset = numberValue(row.fieldOffset);
    return fieldOffset !== null && Math.abs(fieldOffset - center) <= radiusBytes;
  });
}

function nextRowsInWindow(rows, centerFieldOffset, radiusBytes = 96) {
  const center = numberValue(centerFieldOffset);
  if (center === null) return [];
  return rows
    .filter((row) => {
      const fieldOffset = numberValue(row.fieldOffset);
      return fieldOffset !== null && fieldOffset > center && fieldOffset <= center + radiusBytes;
    })
    .sort((left, right) => Number(left.fieldOffset) - Number(right.fieldOffset));
}

function pipe(values, limit = 12) {
  return uniqueSorted(values).slice(0, limit).join("|");
}

function loadDecodedPayloadsByBlock(definitionIndexPath, relativePaths) {
  if (!definitionIndexPath || !fs.existsSync(definitionIndexPath) || !relativePaths.size) return new Map();
  const payloads = new Map();
  const wanted = new Set(relativePaths);
  for (const entry of readDefinitionIndex(definitionIndexPath)) {
    if (!wanted.has(entry.relativePath)) continue;
    const filePath = entry.linkedPath || entry.filePath;
    if (!filePath || !fs.existsSync(filePath)) continue;
    const fileBuffer = fs.readFileSync(filePath);
    const parsed = parseCff0File(filePath);
    for (const instance of decodeInstanceChunks(parsed, fileBuffer)) {
      payloads.set(`${entry.relativePath}\t${instance.blockIndex}`, instance.decodedPayload);
    }
  }
  return payloads;
}

function extractFloatCandidateValues(buffer, sourceOffset, maxBytes = 96) {
  if (!Buffer.isBuffer(buffer)) return [];
  const start = numberValue(sourceOffset);
  if (start === null || start < 0 || start + 4 > buffer.length) return [];
  const values = [];
  for (let offset = start; offset + 4 <= buffer.length && offset < start + maxBytes; offset += 4) {
    const value = buffer.readFloatLE(offset);
    if (!Number.isFinite(value)) continue;
    if (Math.abs(value) < 0.000001 || Math.abs(value) > 1024) continue;
    const rounded = Math.round(value * 10000) / 10000;
    if (!values.includes(rounded)) values.push(rounded);
    if (values.length >= 8) break;
  }
  return values;
}

function floatPayloadAtSource(buffer, sourceOffset) {
  const offset = numberValue(sourceOffset);
  if (!Buffer.isBuffer(buffer) || offset === null || offset < 0 || offset + 4 > buffer.length) return null;
  const value = buffer.readFloatLE(offset);
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001 || Math.abs(value) > 1024) return null;
  return Math.round(value * 10000) / 10000;
}

function smallIntegerPayloadAtSource(buffer, sourceOffset) {
  const offset = numberValue(sourceOffset);
  if (!Buffer.isBuffer(buffer) || offset === null || offset < 0 || offset + 4 > buffer.length) return null;
  const value = buffer.readUInt32LE(offset);
  return value > 0 && value < 4096 ? value : null;
}

function buildCurrentNativeDefinitionShaderParamsPayloadStructureAudit(
  {
    runtimeSkinFieldsPath = defaultRuntimeSkinFieldsPath,
    definitionIndexPath = defaultDefinitionIndexPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const fieldRows = readTsv(runtimeSkinFieldsPath);
  const rowsByOwner = new Map();
  for (const row of fieldRows) {
    const key = ownerKey(row);
    if (!rowsByOwner.has(key)) rowsByOwner.set(key, []);
    rowsByOwner.get(key).push(row);
  }
  for (const rows of rowsByOwner.values()) {
    rows.sort((left, right) => Number(left.fieldOffset) - Number(right.fieldOffset));
  }

  const uniformFieldRows = fieldRows.filter((row) => isShaderUniformName(row.value));
  const payloadsByBlock = loadDecodedPayloadsByBlock(
    definitionIndexPath,
    new Set(uniformFieldRows.map((row) => row.relativePath).filter(Boolean)),
  );

  const byUniformName = {};
  const byUniformClass = {};
  const byDefinition = {};
  const items = [];

  for (const uniformRow of uniformFieldRows) {
    const ownerRows = rowsByOwner.get(ownerKey(uniformRow)) || [];
    const nearbyRows = rowsInWindow(ownerRows, uniformRow.fieldOffset, 180);
    const nextRows = nextRowsInWindow(ownerRows, uniformRow.fieldOffset, 96);
    const objectRows = nextRows.filter((row) => row.referenceKind === "object" && row.sourceOffset);
    const firstValueObject = objectRows[0] || null;
    const decodedPayload = payloadsByBlock.get(`${uniformRow.relativePath}\t${uniformRow.blockIndex}`) || null;
    const floatCandidateValues = firstValueObject
      ? extractFloatCandidateValues(decodedPayload, firstValueObject.sourceOffset)
      : [];
    const uniformClass = uniformClassForName(uniformRow.value);
    const neighborLabels = nearbyRows.filter((row) => row.value && row.semantic === "label").map((row) => row.value);
    const neighborEffects = nearbyRows.filter((row) => /^Effect_/.test(row.value || "")).map((row) => row.value);
    const neighborResources = nearbyRows.filter((row) => row.targetRelativePath).map((row) => row.targetRelativePath);
    const hasSamplerNameNeighbor = nearbyRows.some((row) => isNativeSamplerName(row.value));
    const hasShadergraphPathNeighbor = nearbyRows.some((row) => isShadergraphPath(row.value) || isShadergraphPath(row.targetRelativePath));
    const hasTextureResourceNeighbor = nearbyRows.some(isTextureResource);
    const ownerFieldOffsets = new Set(ownerRows.map((row) => numberValue(row.fieldOffset)).filter((value) => value !== null));
    const nearbyObjectPayloadRows = nextRows.filter((row) => row.referenceKind === "object" && row.sourceOffset);
    const scalarFloatPayloadRows = nearbyObjectPayloadRows.filter(
      (row) => floatPayloadAtSource(decodedPayload, row.sourceOffset) !== null,
    );
    const smallIntegerPayloadRows = nearbyObjectPayloadRows.filter(
      (row) => smallIntegerPayloadAtSource(decodedPayload, row.sourceOffset) !== null,
    );
    const nestedPayloadRows = nearbyObjectPayloadRows.filter((row) => ownerFieldOffsets.has(numberValue(row.sourceOffset)));

    addCount(byUniformName, uniformRow.value);
    addCount(byUniformClass, uniformClass);
    addCount(byDefinition, uniformRow.relativePath);

    items.push({
      relativePath: uniformRow.relativePath || "",
      blockIndex: uniformRow.blockIndex || "",
      definitionFormatByte: uniformRow.definitionFormatByte || "",
      definitionVersionByte: uniformRow.definitionVersionByte || "",
      modelLabel: uniformRow.modelLabel || "",
      recordStartField: uniformRow.recordStartField || "",
      recordEndField: uniformRow.recordEndField || "",
      uniformName: uniformRow.value || "",
      uniformClass,
      fieldOffset: uniformRow.fieldOffset || "",
      localFieldOffset: uniformRow.localFieldOffset || "",
      sourceOffset: uniformRow.sourceOffset || "",
      nextObjectFieldOffset: firstValueObject?.fieldOffset || "",
      nextObjectSourceOffset: firstValueObject?.sourceOffset || "",
      floatCandidateValues: floatCandidateValues.join("|"),
      neighborLabels: pipe(neighborLabels),
      neighborEffects: pipe(neighborEffects),
      neighborResources: pipe(neighborResources),
      hasSamplerNameNeighbor,
      hasShadergraphPathNeighbor,
      hasTextureResourceNeighbor,
      nearbyObjectPayloadRows: nearbyObjectPayloadRows.length,
      scalarFloatPayloadRows: scalarFloatPayloadRows.length,
      smallIntegerPayloadRows: smallIntegerPayloadRows.length,
      nestedPayloadRows: nestedPayloadRows.length,
      staticUniformValuePayloadCandidateRecovered: Boolean(firstValueObject && floatCandidateValues.length),
      structuredShaderParamsListRecovered: false,
      sourceProgramEntryOwnershipRecovered: false,
      shadergraphSamplerToTexDataBindingRecovered: false,
      renderPromotionAllowed: false,
    });
  }

  const rowsWithValueObject = items.filter((item) => item.nextObjectSourceOffset).length;
  const rowsWithFloatCandidates = items.filter((item) => item.floatCandidateValues).length;
  const rowsWithSamplerNameNeighbor = items.filter((item) => item.hasSamplerNameNeighbor).length;
  const rowsWithShadergraphPathNeighbor = items.filter((item) => item.hasShadergraphPathNeighbor).length;
  const rowsWithTextureResourceNeighbor = items.filter((item) => item.hasTextureResourceNeighbor).length;
  const uniformNearbyObjectPayloadRows = items.reduce((sum, item) => sum + item.nearbyObjectPayloadRows, 0);
  const uniformNearbyScalarFloatPayloadRows = items.reduce((sum, item) => sum + item.scalarFloatPayloadRows, 0);
  const uniformNearbySmallIntegerPayloadRows = items.reduce((sum, item) => sum + item.smallIntegerPayloadRows, 0);
  const uniformNearbyNestedPayloadRows = items.reduce((sum, item) => sum + item.nestedPayloadRows, 0);

  const summary = {
    runtimeSkinFieldRows: fieldRows.length,
    shaderUniformPayloadRows: items.length,
    uniqueShaderUniformNameRows: Object.keys(byUniformName).length,
    definitionRowsWithUniformPayloads: Object.keys(byDefinition).length,
    uniformRowsWithAdjacentObjectPayload: rowsWithValueObject,
    uniformRowsWithFloatValueCandidates: rowsWithFloatCandidates,
    uniformRowsWithSamplerNameNeighbor: rowsWithSamplerNameNeighbor,
    uniformRowsWithShadergraphPathNeighbor: rowsWithShadergraphPathNeighbor,
    uniformRowsWithTextureResourceNeighbor: rowsWithTextureResourceNeighbor,
    uniformNearbyObjectPayloadRows,
    uniformNearbyScalarFloatPayloadRows,
    uniformNearbySmallIntegerPayloadRows,
    uniformNearbyNestedPayloadRows,
    staticUniformOverridePayloadLocated: items.length > 0 && rowsWithValueObject > 0,
    staticUniformFloatValueCandidatesLocated: rowsWithFloatCandidates > 0,
    staticUniformScalarFloatPayloadsLocated: uniformNearbyScalarFloatPayloadRows > 0,
    staticShaderParamIdListCandidatesLocated: uniformNearbySmallIntegerPayloadRows > 0,
    staticDefinitionSamplerNamesRecovered: rowsWithSamplerNameNeighbor > 0,
    staticDefinitionShadergraphPathsRecovered: rowsWithShadergraphPathNeighbor > 0,
    staticDefinitionTextureResourcesRecovered: rowsWithTextureResourceNeighbor > 0,
    structuredShaderParamsListRecovered: false,
    sourceProgramStaticReplacementAllowed: false,
    sourceProgramEntryOwnershipRecovered: false,
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
    byUniformClass,
    topShaderUniformPayloadNames: Object.entries(byUniformName)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 40)
      .map(([name, count]) => ({ name, count })),
  };

  return {
    generatedAt,
    source: {
      runtimeSkinFieldsPath,
      definitionIndexPath,
    },
    policy:
      "diagnostic-only definition ShaderParams payload structure audit; locates static uniform override payloads without replacing original source/program sampler ownership evidence",
    summary,
    interpretation: {
      recovered:
        "CFF0/PTCH skin records contain shader-uniform-like labels with adjacent object payloads, and many of those payloads expose plausible static float/color values.",
      boundary:
        "This locates static uniform override payload candidates only. It does not decode the adjacent object into the native ShaderParams** id list, does not recover source/program table entries, and does not prove sampler/texData ownership.",
      nextRequiredEvidence:
        "Decode the adjacent value objects as ShaderParam id/value lists or import original-runtime source/program capture rows before using these payloads for material rendering.",
    },
    items,
  };
}

function exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit({
  runtimeSkinFieldsPath = defaultRuntimeSkinFieldsPath,
  definitionIndexPath = defaultDefinitionIndexPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeDefinitionShaderParamsPayloadStructureAudit({
    runtimeSkinFieldsPath,
    definitionIndexPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "relativePath",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "recordEndField",
    "uniformName",
    "uniformClass",
    "fieldOffset",
    "localFieldOffset",
    "sourceOffset",
    "nextObjectFieldOffset",
    "nextObjectSourceOffset",
    "floatCandidateValues",
    "neighborLabels",
    "neighborEffects",
    "neighborResources",
    "hasSamplerNameNeighbor",
    "hasShadergraphPathNeighbor",
    "hasTextureResourceNeighbor",
    "nearbyObjectPayloadRows",
    "scalarFloatPayloadRows",
    "smallIntegerPayloadRows",
    "nestedPayloadRows",
    "staticUniformValuePayloadCandidateRecovered",
    "structuredShaderParamsListRecovered",
    "sourceProgramEntryOwnershipRecovered",
    "shadergraphSamplerToTexDataBindingRecovered",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit({
    runtimeSkinFieldsPath: optionValue(args, "--runtime-skin-fields", defaultRuntimeSkinFieldsPath),
    definitionIndexPath: optionValue(args, "--definition-index", defaultDefinitionIndexPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeDefinitionShaderParamsPayloadStructureAudit,
  exportCurrentNativeDefinitionShaderParamsPayloadStructureAudit,
  extractFloatCandidateValues,
};
