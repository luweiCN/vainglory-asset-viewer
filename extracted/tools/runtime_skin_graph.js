#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { buildDefinitionInstanceSummaries } = require("./definition_schema_clusters");
const { engineHashHex } = require("./engine_hash");
const { parseSkeletonFile } = require("./skeleton_tools");

const defaultManifestPath = "extracted/viewer/skin-glb-pbr-manifest.json";
const defaultInstanceStrings = "extracted/reports/definition_instance_strings.tsv";
const defaultJsonOut = "extracted/viewer/runtime-skin-graph.json";
const defaultTsvOut = "extracted/reports/runtime_skin_graph.tsv";
const defaultSkeletonRoot = "extracted/build_resources_by_path";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function isBoneSlotLabel(value) {
  return /^Bone_[A-Za-z0-9_]+$/.test(value || "");
}

function isConcreteBindToken(value) {
  return /(^|[_./-])[A-Za-z0-9_]+_bnd$/i.test(value || "");
}

function groupRowsByRuntimeBlock(stringRows) {
  const groups = new Map();
  for (const row of stringRows) {
    const key = `${row.relativePath}\t${row.blockIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function bindSlotsFromRows(rows) {
  const orderedRows = [...rows].sort((left, right) => Number(left.stringIndex) - Number(right.stringIndex));
  const slots = [];
  const seen = new Set();

  for (let index = 0; index < orderedRows.length - 1; index += 1) {
    const slotName = orderedRows[index].value;
    const bindToken = orderedRows[index + 1].value;
    if (!isBoneSlotLabel(slotName) || !isConcreteBindToken(bindToken)) continue;
    const key = `${slotName}\t${bindToken}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({
      slotName,
      bindToken,
      slotStringIndex: Number(orderedRows[index].stringIndex),
      bindStringIndex: Number(orderedRows[index + 1].stringIndex),
      slotPayloadOffset: orderedRows[index].payloadOffset,
      bindPayloadOffset: orderedRows[index + 1].payloadOffset,
    });
  }

  return slots;
}

function enrichBindSlotsWithSkeleton(bindSlots, skeletons = [], skeletonInfoByPath = new Map()) {
  const skeletonEntries = skeletons
    .map((skeletonPath) => [skeletonPath, skeletonInfoByPath.get(skeletonPath)])
    .filter(([, skeleton]) => Array.isArray(skeleton?.bones));

  return bindSlots.map((slot) => {
    const bindHash = engineHashHex(slot.bindToken);
    let resolvedSkeletonPath = "";
    let resolvedBoneIndex = null;

    for (const [skeletonPath, skeleton] of skeletonEntries) {
      const bone = skeleton.bones.find((candidate) => candidate.hash === bindHash);
      if (!bone) continue;
      resolvedSkeletonPath = skeletonPath;
      resolvedBoneIndex = bone.index;
      break;
    }

    return {
      ...slot,
      bindHash,
      resolvedSkeletonPath,
      resolvedBoneIndex,
      hashResolved: resolvedBoneIndex != null,
    };
  });
}

function runtimeGraphViewerEligible(bindSlots) {
  return bindSlots.length > 0 && bindSlots.every((slot) => slot.hashResolved);
}

function cloneLikeSourcePenalty(sourceRelativePath) {
  const basename = path.basename(sourceRelativePath || "").toLowerCase();
  if (/(^|[_-])mainclone\.def$/.test(basename)) return 3;
  if (/(^|[_-])clone\.def$/.test(basename) || /clone/.test(basename)) return 2;
  if (/(^|[_-])(illusion|decoy|pet|summon|minion|turret)\.def$/.test(basename)) return 1;
  return 0;
}

function runtimeGraphDuplicateKey(item) {
  return `${item.rel || ""}\t${item.modelLabel || ""}`;
}

function compareRuntimeGraphCandidates(left, right) {
  const sourceOrder = cloneLikeSourcePenalty(left.sourceRelativePath) - cloneLikeSourcePenalty(right.sourceRelativePath);
  if (sourceOrder) return sourceOrder;
  const leftResolvedSlots = left.bindSlots.filter((slot) => slot.hashResolved).length;
  const rightResolvedSlots = right.bindSlots.filter((slot) => slot.hashResolved).length;
  const resolvedOrder = rightResolvedSlots - leftResolvedSlots;
  if (resolvedOrder) return resolvedOrder;
  const slotOrder = right.bindSlots.length - left.bindSlots.length;
  if (slotOrder) return slotOrder;
  const confidenceOrder = right.runtimeConfidence - left.runtimeConfidence;
  if (confidenceOrder) return confidenceOrder;
  return String(left.sourceRelativePath || "").localeCompare(String(right.sourceRelativePath || ""));
}

function bestRuntimeBlockBySource(stringRows) {
  const summaries = buildDefinitionInstanceSummaries(stringRows)
    .filter((summary) => summary.candidateKind === "character-runtime" && summary.confidence >= 0.7)
    .sort((left, right) => {
      const confidenceOrder = right.confidence - left.confidence;
      if (confidenceOrder) return confidenceOrder;
      const resourceOrder = right.resourceCount - left.resourceCount;
      if (resourceOrder) return resourceOrder;
      const stringOrder = right.stringCount - left.stringCount;
      if (stringOrder) return stringOrder;
      return Number(right.blockIndex) - Number(left.blockIndex);
    });

  const output = new Map();
  for (const summary of summaries) {
    if (!output.has(summary.relativePath)) output.set(summary.relativePath, summary);
  }
  return output;
}

function runtimeSkinGraphItemForManifestItem(item, bestBlocks, rowsByBlock, skeletonInfoByPath) {
  const runtimeBlock = bestBlocks.get(item.sourceRelativePath);
  const blockRows = runtimeBlock ? rowsByBlock.get(`${runtimeBlock.relativePath}\t${runtimeBlock.blockIndex}`) || [] : [];
  const bindSlots = enrichBindSlotsWithSkeleton(bindSlotsFromRows(blockRows), item.skeletons || [], skeletonInfoByPath);

  return {
    rel: item.rel,
    character: item.character,
    modelLabel: item.modelLabel,
    sourceRelativePath: item.sourceRelativePath,
    meshPath: item.meshPath || item.sourceMeshPath || "",
    skeletons: item.skeletons || [],
    runtimeBlockIndex: runtimeBlock?.blockIndex ?? null,
    runtimeCandidateKind: runtimeBlock?.candidateKind || "",
    runtimeConfidence: runtimeBlock?.confidence ?? 0,
    bindSlots,
    viewerEligible: runtimeGraphViewerEligible(bindSlots),
    evidence: runtimeBlock
      ? {
          resourceCounts: runtimeBlock.resourceCounts,
          bindTokenCount: runtimeBlock.bindTokenCount,
          schemaSignature: runtimeBlock.schemaSignature,
        }
      : {},
  };
}

function selectRuntimeSkinGraphItems(candidates) {
  const groups = new Map();
  for (const item of candidates) {
    const key = runtimeGraphDuplicateKey(item);
    const records = groups.get(key) || [];
    records.push(item);
    groups.set(key, records);
  }

  const selected = [];
  for (const records of groups.values()) {
    records.sort(compareRuntimeGraphCandidates);
    selected.push(records[0]);
  }
  return selected;
}

function buildRuntimeSkinGraph({ manifestItems, stringRows, generatedAt = new Date().toISOString(), skeletonInfoByPath = new Map() }) {
  const rowsByBlock = groupRowsByRuntimeBlock(stringRows);
  const bestBlocks = bestRuntimeBlockBySource(stringRows);
  const candidates = [];

  for (const item of manifestItems) {
    if (!item.sourceRelativePath || !item.modelLabel) continue;
    candidates.push(runtimeSkinGraphItemForManifestItem(item, bestBlocks, rowsByBlock, skeletonInfoByPath));
  }

  const items = selectRuntimeSkinGraphItems(candidates);

  return {
    generatedAt,
    count: items.length,
    withRuntimeBlock: items.filter((item) => item.runtimeBlockIndex != null).length,
    withBindSlots: items.filter((item) => item.bindSlots.length).length,
    items,
  };
}

function runtimeSkinGraphRows(graph) {
  const rows = [];
  for (const item of graph.items) {
    if (!item.bindSlots.length) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        meshPath: item.meshPath,
        runtimeBlockIndex: item.runtimeBlockIndex ?? "",
        runtimeConfidence: item.runtimeConfidence,
        slotName: "",
        bindToken: "",
        bindHash: "",
        resolvedBoneIndex: "",
        viewerEligible: item.viewerEligible ? "1" : "0",
        bindStringIndex: "",
      });
      continue;
    }

    for (const slot of item.bindSlots) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        meshPath: item.meshPath,
        runtimeBlockIndex: item.runtimeBlockIndex ?? "",
        runtimeConfidence: item.runtimeConfidence,
        slotName: slot.slotName,
        bindToken: slot.bindToken,
        bindHash: slot.bindHash,
        resolvedBoneIndex: slot.resolvedBoneIndex ?? "",
        viewerEligible: item.viewerEligible ? "1" : "0",
        bindStringIndex: slot.bindStringIndex,
      });
    }
  }
  return rows;
}

function readSkeletonInfoByPath(manifestItems, skeletonRoot = defaultSkeletonRoot) {
  const output = new Map();
  const skeletonPaths = [...new Set(manifestItems.flatMap((item) => item.skeletons || []).filter(Boolean))];
  for (const skeletonPath of skeletonPaths) {
    const filePath = path.join(skeletonRoot, skeletonPath);
    if (!fs.existsSync(filePath)) continue;
    try {
      output.set(skeletonPath, parseSkeletonFile(filePath));
    } catch {
      // Keep graph generation best-effort; unresolved hashes remain visible in the report.
    }
  }
  return output;
}

function exportRuntimeSkinGraph({
  manifestPath = defaultManifestPath,
  instanceStrings = defaultInstanceStrings,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  skeletonRoot = defaultSkeletonRoot,
}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestItems = manifest.items || [];
  const graph = buildRuntimeSkinGraph({
    manifestItems,
    stringRows: readTsv(instanceStrings),
    skeletonInfoByPath: readSkeletonInfoByPath(manifestItems, skeletonRoot),
  });

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(graph, null, 2)}\n`);
  writeTsv(tsvOut, runtimeSkinGraphRows(graph), [
    "rel",
    "character",
    "modelLabel",
    "sourceRelativePath",
    "meshPath",
    "runtimeBlockIndex",
    "runtimeConfidence",
    "slotName",
    "bindToken",
    "bindHash",
    "resolvedBoneIndex",
    "viewerEligible",
    "bindStringIndex",
  ]);

  return {
    items: graph.count,
    withRuntimeBlock: graph.withRuntimeBlock,
    withBindSlots: graph.withBindSlots,
    rows: runtimeSkinGraphRows(graph).length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeSkinGraph({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    instanceStrings: optionValue(args, "--instance-strings", defaultInstanceStrings),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    skeletonRoot: optionValue(args, "--skeleton-root", defaultSkeletonRoot),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bestRuntimeBlockBySource,
  bindSlotsFromRows,
  buildRuntimeSkinGraph,
  enrichBindSlotsWithSkeleton,
  exportRuntimeSkinGraph,
  isBoneSlotLabel,
  readSkeletonInfoByPath,
  runtimeSkinGraphRows,
  selectRuntimeSkinGraphItems,
};
