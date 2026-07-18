#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10066.c",
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/10109.c",
];
const defaultSourcePath = defaultSourcePaths.join(",");
const defaultViewerOut = "extracted/viewer/native-particle-runtime-schema.json";
const defaultTsvOut = "extracted/reports/native_particle_runtime_schema.tsv";
const defaultJsonOut = "extracted/reports/native_particle_runtime_schema_summary.json";

const emitterFields = [
  { offset: "0x200", semantic: "activeParticleCount", evidence: [/param_3 \+ 0x200/] },
  { offset: "0x220", semantic: "renderKindBits", evidence: [/param_3 \+ 0x220/] },
  { offset: "0x224", semantic: "beamTarget", evidence: [/beam_target/, /param_3 \+ 0x224/] },
  { offset: "0x230", semantic: "beamTargetTangent", evidence: [/beam_target_tangent/, /param_3 \+ 0x230/] },
  { offset: "0x23c", semantic: "beamSourceTangent", evidence: [/beam_source_tangent/, /param_3 = param_3 \+ 0x23c/] },
  { offset: "0x248", semantic: "delayGateActive", evidence: [/param_3 \+ 0x248/] },
  { offset: "0x24c", semantic: "delaySeconds", evidence: [/param_3 \+ 0x24c/] },
  { offset: "0x250", semantic: "activeDurationSeconds", evidence: [/param_3 \+ 0x250/] },
  { offset: "0x258", semantic: "velocityDampingCallback", evidence: [/param_3 \+ 600/] },
  { offset: "0x260", semantic: "velocityVectorCallback", evidence: [/param_3 \+ 0x260/] },
  { offset: "0x268", semantic: "positionVectorCallback", evidence: [/param_3 \+ 0x268/] },
  { offset: "0x270", semantic: "sizeDeltaCallback", evidence: [/param_3 \+ 0x270/] },
  { offset: "0x278", semantic: "rotationDeltaCallback", evidence: [/param_3 \+ 0x278/] },
  { offset: "0x280", semantic: "colorCallback", evidence: [/param_3 \+ 0x280/] },
];

const beamParameters = [
  { name: "beam_source_tangent", offset: "0x23c", components: 3, semantic: "beamSourceTangent" },
  { name: "beam_target", offset: "0x224", components: 3, semantic: "beamTarget" },
  { name: "beam_target_tangent", offset: "0x230", components: 3, semantic: "beamTargetTangent" },
];

const particleStateArrays = [
  {
    offset: "0x0",
    stride: 12,
    semantic: "position",
    evidence: [/\*\(ulong \*\)\(param_[34] \+ lVar\d+\)/, /param_3 \+ lVar4/],
  },
  { offset: "0x18000", stride: 12, semantic: "velocity", evidence: [/0x18000/] },
  { offset: "0x30000", stride: 8, semantic: "size", evidence: [/0x30000/] },
  { offset: "0x40000", stride: 4, semantic: "rotation", evidence: [/0x40000/] },
  { offset: "0x58000", stride: 16, semantic: "color", evidence: [/0x58000/] },
];

const pfxEmitterRecordMappings = [
  {
    pfxOffset: "0xac",
    runtimeOffset: "0x24c",
    semantic: "delaySeconds",
    evidence: [/\*\(undefined8 \*\)\(lVar7 \+ 0x24c\).*plVar13 \+ 0xac/s],
  },
  {
    pfxOffset: "0xb0",
    runtimeOffset: "0x250",
    semantic: "activeDurationSeconds",
    evidence: [/\*\(undefined8 \*\)\(lVar7 \+ 0x24c\).*plVar13 \+ 0xac/s],
  },
  {
    pfxOffset: "0xb4",
    runtimeOffset: "0x258",
    semantic: "velocityDampingCallback",
    evidence: [/plVar13 \+ 0xb4[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 600\)/],
  },
  {
    pfxOffset: "0xbc",
    runtimeOffset: "0x260",
    semantic: "velocityVectorCallback",
    evidence: [/plVar13 \+ 0xbc[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 0x260\)/],
  },
  {
    pfxOffset: "0xc4",
    runtimeOffset: "0x268",
    semantic: "positionVectorCallback",
    evidence: [/plVar13 \+ 0xc4[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 0x268\)/],
  },
  {
    pfxOffset: "0xcc",
    runtimeOffset: "0x270",
    semantic: "sizeDeltaCallback",
    evidence: [/plVar13 \+ 0xcc[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 0x270\)/],
  },
  {
    pfxOffset: "0xd4",
    runtimeOffset: "0x278",
    semantic: "rotationDeltaCallback",
    evidence: [/plVar13 \+ 0xd4[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 0x278\)/],
  },
  {
    pfxOffset: "0xdc",
    runtimeOffset: "0x280",
    semantic: "colorCallback",
    evidence: [/plVar13 \+ 0xdc[\s\S]*?\*\(undefined8 \*\)\(lVar7 \+ 0x280\)/],
  },
];

const particleCallbackUpdates = [
  {
    runtimeOffset: "0x258",
    semantic: "velocityDampingCallback",
    updateFunction: "FUN_10066b968",
    targetArrayOffset: "0x18000",
    targetArraySemantic: "velocity",
    callbackOutputComponents: 1,
    updateOperation: "multiply-velocity-by-damping",
    evidence: [/\(\*\*\(code \*\*\)\(param_3 \+ 300\)\)/, /0x18000/],
  },
  {
    runtimeOffset: "0x260",
    semantic: "velocityVectorCallback",
    updateFunction: "FUN_10066baac",
    targetArrayOffset: "0x18000",
    targetArraySemantic: "velocity",
    callbackOutputComponents: 3,
    updateOperation: "add-delta-to-velocity",
    evidence: [/\(\*\*\(code \*\*\)\(param_3 \+ 0x130\)\)/, /0x18000/],
  },
  {
    runtimeOffset: "0x268",
    semantic: "positionVectorCallback",
    updateFunction: "FUN_10066bc68",
    targetArrayOffset: "0x0",
    targetArraySemantic: "position",
    callbackOutputComponents: 3,
    updateOperation: "add-delta-to-position",
    evidence: [/\(\*\*\(code \*\*\)\(param_3 \+ 0x134\)\)/, /param_4 \+ lVar\d+/],
  },
  {
    runtimeOffset: "0x270",
    semantic: "sizeDeltaCallback",
    updateFunction: "FUN_10066bdbc",
    targetArrayOffset: "0x30000",
    targetArraySemantic: "size",
    callbackOutputComponents: 1,
    updateOperation: "add-delta-to-size-clamped",
    evidence: [/\(\*\*\(code \*\*\)\(param_3 \+ 0x138\)\)/, /0x30000/],
  },
  {
    runtimeOffset: "0x278",
    semantic: "rotationDeltaCallback",
    updateFunction: "FUN_10066bef0",
    targetArrayOffset: "0x40000",
    targetArraySemantic: "rotation",
    callbackOutputComponents: 1,
    updateOperation: "add-delta-to-rotation",
    evidence: [/\(\*\*\(code \*\*\)\(param_3 \+ 0x13c\)\)/, /0x40000/],
  },
  {
    runtimeOffset: "0x280",
    semantic: "colorCallback",
    updateFunction: "FUN_10066c008",
    targetArrayOffset: "0x58000",
    targetArraySemantic: "color",
    callbackOutputComponents: 4,
    updateOperation: "assign-color",
    evidence: [/\(\*\*\(code \*\*\)\(param_1 \+ 0x140\)\)/, /0x58000/],
  },
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

function sourceLines(sourceText) {
  return String(sourceText || "").split(/\r?\n/);
}

function sourcePathList(sourcePath) {
  if (Array.isArray(sourcePath)) return sourcePath;
  return String(sourcePath || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSourceText(sourcePath) {
  return sourcePathList(sourcePath)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function firstEvidenceLine(lines, patterns) {
  for (const pattern of patterns || []) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return { lineNumber: index + 1, sourceLine: lines[index].trim() };
  }
  return null;
}

function hasAllEvidence(sourceText, patterns) {
  return (patterns || []).every((pattern) => pattern.test(sourceText));
}

function extractEmitterFieldRows(sourceText, lines) {
  return emitterFields
    .filter((field) => hasAllEvidence(sourceText, field.evidence))
    .map((field) => ({
      recordKind: "emitter-field",
      offset: field.offset,
      name: "",
      semantic: field.semantic,
      components: "",
      stride: "",
      lineNumber: firstEvidenceLine(lines, field.evidence)?.lineNumber || "",
      sourceLine: firstEvidenceLine(lines, field.evidence)?.sourceLine || "",
    }));
}

function extractBeamParameterRows(sourceText, lines) {
  return beamParameters
    .filter((parameter) => sourceText.includes(`"${parameter.name}"`))
    .map((parameter) => ({
      recordKind: "beam-parameter",
      offset: parameter.offset,
      name: parameter.name,
      semantic: parameter.semantic,
      components: parameter.components,
      stride: "",
      lineNumber: firstEvidenceLine(lines, [new RegExp(parameter.name)])?.lineNumber || "",
      sourceLine: firstEvidenceLine(lines, [new RegExp(parameter.name)])?.sourceLine || "",
    }));
}

function extractParticleStateArrayRows(sourceText, lines) {
  return particleStateArrays
    .filter((array) => hasAllEvidence(sourceText, array.evidence))
    .map((array) => ({
      recordKind: "particle-state-array",
      offset: array.offset,
      name: "",
      semantic: array.semantic,
      components: array.semantic === "color" ? 4 : array.semantic === "rotation" ? 1 : 3,
      stride: array.stride,
      lineNumber: firstEvidenceLine(lines, array.evidence)?.lineNumber || "",
      sourceLine: firstEvidenceLine(lines, array.evidence)?.sourceLine || "",
    }));
}

function extractPfxEmitterRecordRows(sourceText, lines) {
  return pfxEmitterRecordMappings
    .filter((mapping) => hasAllEvidence(sourceText, mapping.evidence))
    .map((mapping) => ({
      recordKind: "pfx-emitter-record",
      offset: mapping.pfxOffset,
      pfxOffset: mapping.pfxOffset,
      runtimeOffset: mapping.runtimeOffset,
      name: "",
      semantic: mapping.semantic,
      components: mapping.semantic === "activeDurationSeconds" ? 1 : "",
      stride: "",
      lineNumber: firstEvidenceLine(lines, [new RegExp(`plVar13 \\+ ${mapping.pfxOffset}`)])?.lineNumber || "",
      sourceLine: firstEvidenceLine(lines, [new RegExp(`plVar13 \\+ ${mapping.pfxOffset}`)])?.sourceLine || "",
    }));
}

function extractParticleCallbackUpdateRows(sourceText, lines) {
  return particleCallbackUpdates
    .filter((update) => hasAllEvidence(sourceText, update.evidence))
    .map((update) => ({
      recordKind: "particle-callback-update",
      offset: update.runtimeOffset,
      runtimeOffset: update.runtimeOffset,
      name: update.updateFunction,
      semantic: update.semantic,
      components: update.callbackOutputComponents,
      stride: "",
      targetArrayOffset: update.targetArrayOffset,
      targetArraySemantic: update.targetArraySemantic,
      callbackOutputComponents: update.callbackOutputComponents,
      updateFunction: update.updateFunction,
      updateOperation: update.updateOperation,
      lineNumber: firstEvidenceLine(lines, [new RegExp(`${update.updateFunction}`), ...update.evidence])?.lineNumber || "",
      sourceLine: firstEvidenceLine(lines, [new RegExp(`${update.updateFunction}`), ...update.evidence])?.sourceLine || "",
    }));
}

function extractParticleCallbackResolverRows(sourceText, lines) {
  const resolverMatch = sourceText.match(
    /undefined\s+\*\s+(FUN_[0-9a-f]+)\(ulong param_1\)[\s\S]*?uVar3\s*=\s*(0x[0-9a-f]+);[\s\S]*?&(?<tableBase>DAT_[0-9a-f]+)\s*\+\s*\(ulong\)uVar1\s*\*\s*(?<entryStride>0x[0-9a-f]+)[\s\S]*?\(&(?<pointerBase>PTR_FUN_[0-9a-f]+)\)\[\(ulong\)uVar1\s*\*\s*2\]/i,
  );
  if (!resolverMatch) return [];
  const resolverFunction = resolverMatch[1];
  const entryCount = resolverMatch[2];
  const { tableBase, entryStride, pointerBase } = resolverMatch.groups || {};
  if (!tableBase || !entryStride || !pointerBase) return [];
  const evidence = firstEvidenceLine(lines, [new RegExp(`undefined \\* ${resolverFunction}\\(ulong param_1\\)`)]) || {};
  return [
    {
      recordKind: "particle-callback-resolver",
      offset: "",
      name: resolverFunction,
      semantic: "callbackResolver",
      components: "",
      stride: entryStride,
      resolverFunction,
      tableBase,
      pointerBase,
      entryCount,
      entryStride,
      keyOffset: "0x0",
      callbackOffset: "0x8",
      lineNumber: evidence.lineNumber || "",
      sourceLine: evidence.sourceLine || "",
    },
  ];
}

function summarizeNativeParticleRuntimeSchema(items) {
  const byRecordKind = {};
  const byEmitterSemantic = {};
  const byParticleArraySemantic = {};
  const byPfxEmitterSemantic = {};
  const byCallbackUpdateSemantic = {};
  const byCallbackUpdateTargetArray = {};
  const byCallbackResolverTable = {};
  for (const item of items || []) {
    increment(byRecordKind, item.recordKind);
    if (item.recordKind === "emitter-field") increment(byEmitterSemantic, item.semantic);
    if (item.recordKind === "particle-state-array") increment(byParticleArraySemantic, item.semantic);
    if (item.recordKind === "pfx-emitter-record") increment(byPfxEmitterSemantic, item.semantic);
    if (item.recordKind === "particle-callback-update") {
      increment(byCallbackUpdateSemantic, item.semantic);
      increment(byCallbackUpdateTargetArray, item.targetArrayOffset);
    }
    if (item.recordKind === "particle-callback-resolver") increment(byCallbackResolverTable, item.tableBase);
  }
  return {
    rows: items.length,
    beamParameterRows: byRecordKind["beam-parameter"] || 0,
    emitterFieldRows: byRecordKind["emitter-field"] || 0,
    particleStateArrayRows: byRecordKind["particle-state-array"] || 0,
    pfxEmitterRecordRows: byRecordKind["pfx-emitter-record"] || 0,
    particleCallbackUpdateRows: byRecordKind["particle-callback-update"] || 0,
    particleCallbackResolverRows: byRecordKind["particle-callback-resolver"] || 0,
    byRecordKind,
    byEmitterSemantic,
    byParticleArraySemantic,
    byPfxEmitterSemantic,
    byCallbackUpdateSemantic,
    byCallbackUpdateTargetArray,
    byCallbackResolverTable,
  };
}

function sortRows(left, right) {
  const kindOrder = {
    "emitter-field": 0,
    "beam-parameter": 1,
    "particle-state-array": 2,
    "pfx-emitter-record": 3,
    "particle-callback-update": 4,
    "particle-callback-resolver": 5,
  };
  const leftKind = kindOrder[left.recordKind] ?? 99;
  const rightKind = kindOrder[right.recordKind] ?? 99;
  if (leftKind !== rightKind) return leftKind - rightKind;
  const leftOffset = Number.parseInt(String(left.offset).replace(/^0x/i, ""), 16);
  const rightOffset = Number.parseInt(String(right.offset).replace(/^0x/i, ""), 16);
  if (Number.isFinite(leftOffset) && Number.isFinite(rightOffset) && leftOffset !== rightOffset) return leftOffset - rightOffset;
  return String(left.name || left.semantic).localeCompare(String(right.name || right.semantic));
}

function buildNativeParticleRuntimeSchema(sourceText, generatedAt = new Date().toISOString()) {
  const lines = sourceLines(sourceText);
  const items = [
    ...extractEmitterFieldRows(sourceText, lines),
    ...extractBeamParameterRows(sourceText, lines),
    ...extractParticleStateArrayRows(sourceText, lines),
    ...extractPfxEmitterRecordRows(sourceText, lines),
    ...extractParticleCallbackUpdateRows(sourceText, lines),
    ...extractParticleCallbackResolverRows(sourceText, lines),
  ].sort(sortRows);
  return {
    generatedAt,
    summary: summarizeNativeParticleRuntimeSchema(items),
    items,
  };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    recordKind: item.recordKind,
    offset: item.offset,
    pfxOffset: item.pfxOffset,
    runtimeOffset: item.runtimeOffset,
    name: item.name,
    semantic: item.semantic,
    components: item.components,
    stride: item.stride,
    targetArrayOffset: item.targetArrayOffset,
    targetArraySemantic: item.targetArraySemantic,
    callbackOutputComponents: item.callbackOutputComponents,
    updateFunction: item.updateFunction,
    updateOperation: item.updateOperation,
    resolverFunction: item.resolverFunction,
    tableBase: item.tableBase,
    pointerBase: item.pointerBase,
    entryCount: item.entryCount,
    entryStride: item.entryStride,
    keyOffset: item.keyOffset,
    callbackOffset: item.callbackOffset,
    lineNumber: item.lineNumber,
    sourceLine: item.sourceLine,
  }));
}

function exportNativeParticleRuntimeSchema({
  sourcePath = defaultSourcePath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeParticleRuntimeSchema(readSourceText(sourcePath));
  manifest.source = { sourcePaths: sourcePathList(sourcePath) };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "recordKind",
    "offset",
    "pfxOffset",
    "runtimeOffset",
    "name",
    "semantic",
    "components",
    "stride",
    "targetArrayOffset",
    "targetArraySemantic",
    "callbackOutputComponents",
    "updateFunction",
    "updateOperation",
    "resolverFunction",
    "tableBase",
    "pointerBase",
    "entryCount",
    "entryStride",
    "keyOffset",
    "callbackOffset",
    "lineNumber",
    "sourceLine",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(
    JSON.stringify(
      exportNativeParticleRuntimeSchema({
        sourcePath: optionValue(args, "--source", defaultSourcePath),
        viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
        tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
        jsonOut: optionValue(args, "--json-out", defaultJsonOut),
      }),
      null,
      2,
    ),
  );
}

module.exports = {
  buildNativeParticleRuntimeSchema,
  exportNativeParticleRuntimeSchema,
  reportRowsForManifest,
  summarizeNativeParticleRuntimeSchema,
};
