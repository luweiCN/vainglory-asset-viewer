#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { classifyDefinitionString } = require("./definition_instance_graph");
const { readDefinitionIndex } = require("./export_cff0_reports");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultTsvOut = "extracted/reports/definition_component_roots.tsv";
const defaultJsonOut = "extracted/reports/definition_component_roots_summary.json";

const rootArrayFieldOffset = 0xb8;
const rootIndexFields = [
  { slot: "root0", fieldOffset: 0xd0 },
  { slot: "root1", fieldOffset: 0xd4 },
  { slot: "root2", fieldOffset: 0xd8 },
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pipe(values) {
  return unique(values).join("|");
}

function referenceKind(field) {
  if (field.value) return "string";
  if (field.sourceOffset) return "object";
  return "zero";
}

function patchedFieldsFrom({ instance, patchTable }) {
  const stringByOffset = new Map(instance.stringRecords.map((record) => [record.offset, record.value]));
  return patchTable.entries
    .map((entry) => {
      const value = stringByOffset.get(entry.sourceOffset) || "";
      const classified = value ? classifyDefinitionString(value) : null;
      return {
        fieldOffset: entry.targetOffset,
        sourceOffset: entry.sourceOffset,
        value,
        semantic: classified?.semantic || "",
        resourceCategory: classified?.resourceCategory || "",
        targetRelativePath: classified?.targetRelativePath || "",
      };
    })
    .sort((left, right) => left.fieldOffset - right.fieldOffset || left.sourceOffset - right.sourceOffset);
}

function pairedInstancePatchBlocks(entry) {
  const filePath = entry.linkedPath || entry.filePath;
  const fileBuffer = fs.readFileSync(filePath);
  const parsed = parseCff0File(filePath);
  const instances = decodeInstanceChunks(parsed, fileBuffer);
  const patches = [];
  let blockIndex = -1;

  for (const chunk of parsed.chunks) {
    if (chunk.magic === "DEF0") blockIndex += 1;
    if (chunk.magic !== "PTCH") continue;
    const payload = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patches.push({ blockIndex, ...parsePatchTable(payload) });
  }

  const patchByBlock = new Map(patches.map((patch) => [patch.blockIndex, patch]));
  return instances
    .map((instance) => {
      const patchTable = patchByBlock.get(instance.blockIndex);
      if (!patchTable) return null;
      return {
        relativePath: entry.relativePath,
        hash: entry.hash,
        blockIndex: instance.blockIndex,
        definitionFormatByte: instance.definitionFormatByte,
        definitionVersionByte: instance.definitionVersionByte,
        payloadSize: instance.payloadSize,
        decodedPayload: instance.decodedPayload,
        fields: patchedFieldsFrom({ instance, patchTable }),
      };
    })
    .filter(Boolean);
}

function readI32(buffer, offset) {
  if (!buffer || offset + 4 > buffer.length) return null;
  return buffer.readInt32LE(offset);
}

function fieldsInRange(fields, start, end) {
  return fields.filter((field) => field.fieldOffset >= start && field.fieldOffset < end);
}

function objectRefEntriesNear(fields, rootObjectOffset, windowBytes = 512) {
  if (!Number.isFinite(rootObjectOffset)) return [];
  return fieldsInRange(fields, rootObjectOffset, rootObjectOffset + windowBytes)
    .filter((field) => field.fieldOffset !== rootArrayFieldOffset && referenceKind(field) === "object")
    .map((field) => ({
      fieldOffset: field.fieldOffset,
      localFieldOffset: field.fieldOffset - rootObjectOffset,
      sourceOffset: field.sourceOffset,
    }));
}

function objectSummary(fields, targetObjectOffset, windowBytes = 192) {
  if (!Number.isFinite(targetObjectOffset)) {
    return {
      targetFieldCount: 0,
      targetLabels: "",
      targetResources: "",
      targetMeshes: "",
      targetSkeletons: "",
      targetAnimations: "",
      targetEffects: "",
      targetAudios: "",
      targetBones: "",
      targetBindTokens: "",
      targetObjectRefs: "",
    };
  }

  const targetFields = fieldsInRange(fields, targetObjectOffset, targetObjectOffset + windowBytes);
  const resources = targetFields.filter((field) => field.semantic === "resource");
  return {
    targetFieldCount: targetFields.length,
    targetLabels: pipe(
      targetFields
        .filter((field) => field.value && field.semantic !== "resource")
        .map((field) => `${field.fieldOffset - targetObjectOffset}:${field.value}`),
    ),
    targetResources: pipe(resources.map((field) => field.targetRelativePath)),
    targetMeshes: pipe(resources.filter((field) => field.resourceCategory === "mesh").map((field) => field.targetRelativePath)),
    targetSkeletons: pipe(resources.filter((field) => field.resourceCategory === "skeleton").map((field) => field.targetRelativePath)),
    targetAnimations: pipe(resources.filter((field) => field.resourceCategory === "animation").map((field) => field.targetRelativePath)),
    targetEffects: pipe(targetFields.map((field) => field.value).filter((value) => /^Effect_/.test(value))),
    targetAudios: pipe(resources.filter((field) => field.resourceCategory === "audio").map((field) => field.targetRelativePath)),
    targetBones: pipe(targetFields.map((field) => field.value).filter((value) => /^Bone_[A-Za-z0-9_]+$/.test(value || ""))),
    targetBindTokens: pipe(
      targetFields.map((field) => field.value).filter((value) => /(^|[_./-])[A-Za-z0-9_]+_bnd$/i.test(value || "")),
    ),
    targetObjectRefs: pipe(
      targetFields
        .filter((field) => referenceKind(field) === "object")
        .map((field) => `${field.fieldOffset - targetObjectOffset}->${field.sourceOffset}`),
    ),
  };
}

function buildDefinitionComponentRootRowsForBlock(block) {
  const rootArrayField = block.fields.find(
    (field) => field.fieldOffset === rootArrayFieldOffset && referenceKind(field) === "object",
  );
  if (!rootArrayField) return [];

  const rootArrayObjectOffset = rootArrayField.sourceOffset;
  const candidates = objectRefEntriesNear(block.fields, rootArrayObjectOffset);
  const candidateOffsets = candidates.map((candidate) => candidate.sourceOffset);

  return rootIndexFields.map(({ slot, fieldOffset }) => {
    const rootIndex = readI32(block.decodedPayload, fieldOffset);
    const candidate = Number.isInteger(rootIndex) && rootIndex >= 0 ? candidates[rootIndex] : null;
    const targetObjectOffset = candidate?.sourceOffset ?? null;
    let confidence = "native-index+object-array-candidate";
    if (!Number.isInteger(rootIndex) || rootIndex < 0) confidence = "invalid-root-index";
    else if (!candidate) confidence = "native-index-no-candidate";

    return {
      relativePath: block.relativePath,
      hash: block.hash,
      blockIndex: block.blockIndex,
      definitionFormatByte: block.definitionFormatByte,
      definitionVersionByte: block.definitionVersionByte,
      payloadSize: block.payloadSize,
      rootArrayFieldOffset: `0x${rootArrayFieldOffset.toString(16)}`,
      rootArrayObjectOffset,
      rootSlot: slot,
      rootIndex,
      rootIndexFieldOffset: `0x${fieldOffset.toString(16)}`,
      rootTargetFieldOffset: candidate?.fieldOffset ?? "",
      rootTargetLocalFieldOffset: candidate?.localFieldOffset ?? "",
      rootTargetObjectOffset: targetObjectOffset ?? "",
      candidateObjectRefCount: candidates.length,
      candidateObjectOffsets: candidateOffsets.slice(0, 24).join("|"),
      confidence,
      ...objectSummary(block.fields, targetObjectOffset),
    };
  });
}

function buildDefinitionComponentRootRows(definitions) {
  const rows = [];
  for (const entry of definitions) {
    if (!entry.relativePath?.startsWith("Characters/")) continue;
    for (const block of pairedInstancePatchBlocks(entry)) {
      rows.push(...buildDefinitionComponentRootRowsForBlock(block));
    }
  }
  return rows.sort((left, right) => {
    const pathOrder = left.relativePath.localeCompare(right.relativePath);
    if (pathOrder) return pathOrder;
    const blockOrder = Number(left.blockIndex) - Number(right.blockIndex);
    if (blockOrder) return blockOrder;
    return String(left.rootSlot).localeCompare(String(right.rootSlot));
  });
}

function summarize(rows, definitions) {
  const blocks = new Set(rows.map((row) => `${row.relativePath}\t${row.blockIndex}`));
  const byConfidence = {};
  for (const row of rows) byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
  return {
    characterDefinitions: definitions.filter((entry) => entry.relativePath?.startsWith("Characters/")).length,
    blocksWithNativeRootArray: blocks.size,
    rows: rows.length,
    byConfidence,
    rowsWithMeshes: rows.filter((row) => row.targetMeshes).length,
    rowsWithSkeletons: rows.filter((row) => row.targetSkeletons).length,
    rowsWithBindTokens: rows.filter((row) => row.targetBindTokens).length,
  };
}

function exportDefinitionComponentRoots({
  definitionIndex = defaultDefinitionIndex,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const definitions = readDefinitionIndex(definitionIndex);
  const rows = buildDefinitionComponentRootRows(definitions);
  const columns = [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "payloadSize",
    "rootArrayFieldOffset",
    "rootArrayObjectOffset",
    "rootSlot",
    "rootIndex",
    "rootIndexFieldOffset",
    "rootTargetFieldOffset",
    "rootTargetLocalFieldOffset",
    "rootTargetObjectOffset",
    "candidateObjectRefCount",
    "candidateObjectOffsets",
    "confidence",
    "targetFieldCount",
    "targetLabels",
    "targetResources",
    "targetMeshes",
    "targetSkeletons",
    "targetAnimations",
    "targetEffects",
    "targetAudios",
    "targetBones",
    "targetBindTokens",
    "targetObjectRefs",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, definitions);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, sampleRows: rows.slice(0, 100) }, null, 2)}\n`,
  );
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionComponentRoots({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionComponentRootRows,
  buildDefinitionComponentRootRowsForBlock,
  exportDefinitionComponentRoots,
  objectRefEntriesNear,
  objectSummary,
  patchedFieldsFrom,
  readI32,
};
