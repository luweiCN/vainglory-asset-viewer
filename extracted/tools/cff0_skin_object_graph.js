#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { readDefinitionIndex } = require("./export_cff0_reports");
const {
  buildRuntimeFieldRecordsForBlock,
  isBindTokenValue,
  patchedBlockFrom,
} = require("./cff0_runtime_records");
const { annotateNativeLayout } = require("./cff0_skin_native_layout");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultNativeSchemaPath = "extracted/reports/native_skinrep_schema.tsv";
const defaultTsvOut = "extracted/reports/cff0_skin_object_graph.tsv";
const defaultWindowBytes = 512;
const defaultMaxDepth = 4;
const defaultMaxNodes = 256;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function unique(values, limit = 80) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function joinUnique(values, limit) {
  return unique(values, limit).join("|");
}

function isBoneName(value) {
  return /^Bone_[A-Za-z0-9_]+$/.test(value || "");
}

function isObjectRef(field) {
  return !field.value && Number(field.sourceOffset) > 0;
}

function fieldsInRange(block, start, end) {
  return block.fields.filter((field) => field.fieldOffset >= start && field.fieldOffset < end);
}

function summarizeObjectFields(fields, objectOffset) {
  const labels = [];
  const resources = [];
  const animations = [];
  const effects = [];
  const audios = [];
  const bones = [];
  const bindTokens = [];
  const objectRefs = [];

  for (const field of fields) {
    const value = field.value || "";
    if (value && field.semantic !== "resource") labels.push(`${field.fieldOffset - objectOffset}:${value}`);
    if (field.semantic === "resource") resources.push(field.targetRelativePath || value);
    if (field.resourceCategory === "animation") animations.push(field.targetRelativePath || value);
    if (field.resourceCategory === "audio") audios.push(field.targetRelativePath || value);
    if (/^Effect_/.test(value)) effects.push(value);
    if (isBoneName(value)) bones.push(value);
    if (isBindTokenValue(value)) bindTokens.push(value);
    if (isObjectRef(field)) objectRefs.push({ localOffset: field.fieldOffset - objectOffset, targetOffset: Number(field.sourceOffset) });
  }

  return {
    labels,
    resources,
    animations,
    effects,
    audios,
    bones,
    bindTokens,
    objectRefs,
  };
}

function traverseObjectGraph(block, rootOffset, { windowBytes = defaultWindowBytes, maxDepth = defaultMaxDepth, maxNodes = defaultMaxNodes } = {}) {
  const queue = [{ offset: Number(rootOffset), depth: 0 }];
  const visited = new Set();
  const allLabels = [];
  const allResources = [];
  const allAnimations = [];
  const allEffects = [];
  const allAudios = [];
  const allBones = [];
  const allBindTokens = [];
  const edges = [];
  let cycles = 0;
  let truncated = false;
  let directSummary = summarizeObjectFields([], Number(rootOffset));

  while (queue.length) {
    if (visited.size >= maxNodes) {
      truncated = true;
      break;
    }

    const node = queue.shift();
    if (!Number.isFinite(node.offset) || node.offset <= 0) continue;
    if (visited.has(node.offset)) {
      cycles += 1;
      continue;
    }
    visited.add(node.offset);

    const end = Math.min(block.payloadSize, node.offset + windowBytes);
    const fields = fieldsInRange(block, node.offset, end);
    const summary = summarizeObjectFields(fields, node.offset);
    if (node.depth === 0) directSummary = summary;

    allLabels.push(...summary.labels);
    allResources.push(...summary.resources);
    allAnimations.push(...summary.animations);
    allEffects.push(...summary.effects);
    allAudios.push(...summary.audios);
    allBones.push(...summary.bones);
    allBindTokens.push(...summary.bindTokens);

    for (const ref of summary.objectRefs) {
      edges.push(`${node.offset}+${ref.localOffset}->${ref.targetOffset}`);
      if (node.depth >= maxDepth) continue;
      if (visited.has(ref.targetOffset)) {
        cycles += 1;
        continue;
      }
      queue.push({ offset: ref.targetOffset, depth: node.depth + 1 });
    }
  }

  return {
    visitedObjectCount: visited.size,
    edgeCount: edges.length,
    cycles,
    truncated,
    directBones: unique(directSummary.bones),
    directBindTokens: unique(directSummary.bindTokens),
    reachableLabels: unique(allLabels),
    reachableResources: unique(allResources),
    reachableAnimations: unique(allAnimations),
    reachableEffects: unique(allEffects),
    reachableAudios: unique(allAudios),
    reachableBones: unique(allBones),
    reachableBindTokens: unique(allBindTokens),
    sampleEdges: unique(edges, 80),
  };
}

function evidenceKind(graph) {
  if (graph.directBones.length || graph.directBindTokens.length) return "direct-slot-evidence";
  if (graph.reachableBones.length || graph.reachableBindTokens.length) return "recursive-slot-evidence";
  return "no-slot-evidence";
}

function objectRootRowsForBlock(block, schemaRows, traversalOptions) {
  const skinRows = annotateNativeLayout(buildRuntimeFieldRecordsForBlock(block), schemaRows);
  const roots = skinRows.filter((row) => {
    const nativeOffset = Number(row.nativeComparableOffset);
    return (
      row.referenceKind === "object" &&
      row.nativeInlineStatus === "inside-native-inline" &&
      Number.isFinite(nativeOffset) &&
      nativeOffset < 0x68
    );
  });

  return roots.map((root) => {
    const graph = traverseObjectGraph(block, Number(root.sourceOffset), traversalOptions);
    return {
      source: "cff0-ptch",
      relativePath: root.relativePath,
      hash: root.hash,
      blockIndex: root.blockIndex,
      definitionFormatByte: root.definitionFormatByte,
      definitionVersionByte: root.definitionVersionByte,
      modelLabel: root.modelLabel,
      recordStartField: root.recordStartField,
      meshPath: skinRows.find((row) => row.modelLabel === root.modelLabel && row.recordStartField === root.recordStartField && row.role === "mesh")
        ?.targetRelativePath || "",
      rootLocalFieldOffset: root.localFieldOffset,
      nativeInlinePath: root.nativeInlinePath,
      nativeInlineRange: root.nativeInlineRange,
      rootRole: root.role,
      targetObjectOffset: root.sourceOffset,
      traversalDepthLimit: traversalOptions.maxDepth,
      windowBytes: traversalOptions.windowBytes,
      visitedObjectCount: graph.visitedObjectCount,
      edgeCount: graph.edgeCount,
      cycleCount: graph.cycles,
      truncated: graph.truncated ? "1" : "0",
      evidenceKind: evidenceKind(graph),
      directBones: graph.directBones.join("|"),
      directBindTokens: graph.directBindTokens.join("|"),
      reachableBones: joinUnique(graph.reachableBones, 80),
      reachableBindTokens: joinUnique(graph.reachableBindTokens, 80),
      reachableAnimations: joinUnique(graph.reachableAnimations, 40),
      reachableEffects: joinUnique(graph.reachableEffects, 40),
      reachableAudios: joinUnique(graph.reachableAudios, 40),
      reachableResources: joinUnique(graph.reachableResources, 40),
      reachableLabels: joinUnique(graph.reachableLabels, 40),
      sampleEdges: graph.sampleEdges.join("|"),
    };
  });
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
    const buffer = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patches.push({ blockIndex, ...parsePatchTable(buffer) });
  }
  const patchByBlock = new Map(patches.map((patch) => [patch.blockIndex, patch]));
  return instances
    .map((instance) => {
      const patchTable = patchByBlock.get(instance.blockIndex);
      if (!patchTable) return null;
      return patchedBlockFrom({
        relativePath: entry.relativePath,
        hash: entry.hash,
        instance,
        patchTable,
      });
    })
    .filter(Boolean);
}

function summarizeRows(rows) {
  const evidenceKinds = {};
  for (const row of rows) evidenceKinds[row.evidenceKind] = (evidenceKinds[row.evidenceKind] || 0) + 1;
  return {
    rows: rows.length,
    skinRootRowsWithSlotEvidence: rows.filter((row) => row.evidenceKind !== "no-slot-evidence").length,
    evidenceKinds: Object.fromEntries(Object.entries(evidenceKinds).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function exportSkinObjectGraph({
  definitionIndex = defaultDefinitionIndex,
  nativeSchemaPath = defaultNativeSchemaPath,
  tsvOut = defaultTsvOut,
  windowBytes = defaultWindowBytes,
  maxDepth = defaultMaxDepth,
  maxNodes = defaultMaxNodes,
} = {}) {
  const schemaRows = readTsv(nativeSchemaPath);
  const traversalOptions = {
    windowBytes: Number(windowBytes) || defaultWindowBytes,
    maxDepth: Number(maxDepth) || defaultMaxDepth,
    maxNodes: Number(maxNodes) || defaultMaxNodes,
  };
  const rows = [];

  for (const entry of readDefinitionIndex(definitionIndex)) {
    if (!entry.relativePath?.startsWith("Characters/")) continue;
    for (const block of pairedInstancePatchBlocks(entry)) {
      rows.push(...objectRootRowsForBlock(block, schemaRows, traversalOptions));
    }
  }

  writeTsv(tsvOut, rows, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "meshPath",
    "rootLocalFieldOffset",
    "nativeInlinePath",
    "nativeInlineRange",
    "rootRole",
    "targetObjectOffset",
    "traversalDepthLimit",
    "windowBytes",
    "visitedObjectCount",
    "edgeCount",
    "cycleCount",
    "truncated",
    "evidenceKind",
    "directBones",
    "directBindTokens",
    "reachableBones",
    "reachableBindTokens",
    "reachableAnimations",
    "reachableEffects",
    "reachableAudios",
    "reachableResources",
    "reachableLabels",
    "sampleEdges",
  ]);

  return summarizeRows(rows);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  console.log(
    JSON.stringify(
      exportSkinObjectGraph({
        definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
        nativeSchemaPath: optionValue(args, "--native-schema", defaultNativeSchemaPath),
        tsvOut: optionValue(args, "--out", defaultTsvOut),
        windowBytes: optionValue(args, "--window-bytes", String(defaultWindowBytes)),
        maxDepth: optionValue(args, "--max-depth", String(defaultMaxDepth)),
        maxNodes: optionValue(args, "--max-nodes", String(defaultMaxNodes)),
      }),
      null,
      2,
    ),
  );
}

module.exports = {
  evidenceKind,
  exportSkinObjectGraph,
  objectRootRowsForBlock,
  summarizeObjectFields,
  traverseObjectGraph,
};
