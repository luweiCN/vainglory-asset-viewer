#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultDefinitionChainPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultSkinEvidencePath = "extracted/reports/cff0_skin_evidence.tsv";
const defaultSlotRecordsPath = "extracted/reports/cff0_runtime_slot_records.tsv";
const defaultObjectGraphPath = "extracted/reports/cff0_skin_object_graph.tsv";
const defaultTsvOut = "extracted/reports/runtime_definition_skin_chain.tsv";
const defaultJsonOut = "extracted/reports/runtime_definition_skin_chain_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseTsv(text) {
  const lines = text.trimEnd().split(/\r?\n/);
  if (!lines.length || !lines[0]) return [];
  const columns = lines[0].split("\t");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
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

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function splitList(value) {
  return String(value || "").split("|").filter(Boolean);
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function uniqueLimited(values, limit) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function summarizeSkinRows(rows) {
  const skeletonKinds = {};
  const slotKinds = {};
  const animationKinds = {};
  const effectKinds = {};
  const targetBones = [];
  const targetBindTokens = [];
  const sampleUnresolved = [];
  const sampleNoSlot = [];

  for (const row of rows) {
    increment(skeletonKinds, row.skeletonEvidenceKind || "unknown");
    increment(slotKinds, row.slotEvidenceKind || "unknown");
    increment(animationKinds, row.animationEvidenceKind || "unknown");
    increment(effectKinds, row.effectEvidenceKind || "unknown");
    targetBones.push(...splitList(row.targetBones));
    targetBindTokens.push(...splitList(row.targetBindTokens));
    if (row.skeletonEvidenceKind && row.skeletonEvidenceKind !== "direct-skeleton-resource" && sampleUnresolved.length < 8) {
      sampleUnresolved.push(row.modelLabel);
    }
    if (row.slotEvidenceKind === "no-direct-slot-evidence" && sampleNoSlot.length < 8) {
      sampleNoSlot.push(row.modelLabel);
    }
  }

  return {
    skeletonKinds,
    slotKinds,
    animationKinds,
    effectKinds,
    targetBones: uniqueLimited(targetBones, 16),
    targetBindTokens: uniqueLimited(targetBindTokens, 16),
    sampleUnresolved: uniqueLimited(sampleUnresolved, 8),
    sampleNoSlot: uniqueLimited(sampleNoSlot, 8),
  };
}

function summarizeSlotRows(rows) {
  return {
    slotRecordCount: rows.length,
    boneNames: uniqueLimited(rows.map((row) => row.boneName), 20),
    bindTokens: uniqueLimited(rows.map((row) => row.bindToken), 20),
  };
}

function summarizeGraphSlotCoverage(skins, graphRows) {
  const graphRowsBySkin = groupBy(graphRows, (row) => row.modelLabel);
  const recursiveSamples = [];
  const noSlotSamples = [];
  let graphDirectSlotSkinCount = 0;
  let graphRecursiveSlotSkinCount = 0;
  let graphNoSlotSkinCount = 0;

  for (const skin of skins) {
    const rows = graphRowsBySkin.get(skin.modelLabel) || [];
    const evidenceKinds = new Set(rows.map((row) => row.evidenceKind));
    if (evidenceKinds.has("direct-slot-evidence")) {
      graphDirectSlotSkinCount += 1;
    } else if (evidenceKinds.has("recursive-slot-evidence")) {
      graphRecursiveSlotSkinCount += 1;
      if (recursiveSamples.length < 8) recursiveSamples.push(skin.modelLabel);
    } else {
      graphNoSlotSkinCount += 1;
      if (noSlotSamples.length < 8) noSlotSamples.push(skin.modelLabel);
    }
  }

  return {
    graphDirectSlotSkinCount,
    graphRecursiveSlotSkinCount,
    graphNoSlotSkinCount,
    recursiveSamples,
    noSlotSamples,
  };
}

function buildRuntimeDefinitionSkinChainRows({ definitionChainRows, skinEvidenceRows, slotRows, objectGraphRows = [] }) {
  const skinsByDefinition = groupBy(skinEvidenceRows, (row) => row.relativePath);
  const slotsByDefinition = groupBy(slotRows, (row) => row.relativePath);
  const graphByDefinition = groupBy(objectGraphRows, (row) => row.relativePath);

  return definitionChainRows
    .filter((row) => row.targetFamily === "character")
    .map((definition) => {
      const skins = skinsByDefinition.get(definition.targetRelativePath) || [];
      const slots = slotsByDefinition.get(definition.targetRelativePath) || [];
      const graphRows = graphByDefinition.get(definition.targetRelativePath) || [];
      const skinSummary = summarizeSkinRows(skins);
      const slotSummary = summarizeSlotRows(slots);
      const graphSlotSummary = summarizeGraphSlotCoverage(skins, graphRows);
      return {
        manifestLabel: definition.manifestLabel,
        targetRelativePath: definition.targetRelativePath,
        targetHash: definition.targetHash,
        childResourceRows: definition.childResourceRows,
        meshCount: definition.meshCount,
        skeletonCount: definition.skeletonCount,
        animationCount: definition.animationCount,
        audioCount: definition.audioCount,
        skinRecordCount: skins.length,
        directSkeletonSkinCount: skinSummary.skeletonKinds["direct-skeleton-resource"] || 0,
        sameObjectSkeletonSkinCount: skinSummary.skeletonKinds["same-as-first-object-ref"] || 0,
        unresolvedSkeletonSkinCount: skinSummary.skeletonKinds["object-reference-unresolved"] || 0,
        directSlotSkinCount: skinSummary.slotKinds["direct-object-slot-evidence"] || 0,
        recursiveSlotSkinCount: skinSummary.slotKinds["recursive-object-slot-evidence"] || 0,
        noDirectSlotSkinCount: skinSummary.slotKinds["no-direct-slot-evidence"] || 0,
        directAnimationSkinCount: skinSummary.animationKinds["direct-animation-records"] || 0,
        noDirectAnimationSkinCount: skinSummary.animationKinds["no-direct-animation-records"] || 0,
        directEffectSkinCount: skinSummary.effectKinds["direct-effect-labels"] || 0,
        slotRecordCount: slotSummary.slotRecordCount,
        graphDirectSlotSkinCount: graphSlotSummary.graphDirectSlotSkinCount,
        graphRecursiveSlotSkinCount: graphSlotSummary.graphRecursiveSlotSkinCount,
        graphNoSlotSkinCount: graphSlotSummary.graphNoSlotSkinCount,
        slotBones: slotSummary.boneNames.join("|"),
        slotBindTokens: slotSummary.bindTokens.join("|"),
        skinTargetBones: skinSummary.targetBones.join("|"),
        skinTargetBindTokens: skinSummary.targetBindTokens.join("|"),
        sampleNonDirectSkeletonSkins: skinSummary.sampleUnresolved.join("|"),
        sampleNoDirectSlotSkins: skinSummary.sampleNoSlot.join("|"),
        sampleGraphRecursiveSlotSkins: graphSlotSummary.recursiveSamples.join("|"),
        sampleGraphNoSlotSkins: graphSlotSummary.noSlotSamples.join("|"),
      };
    });
}

function summarize(rows) {
  const withSkinRecords = rows.filter((row) => row.skinRecordCount > 0).length;
  const withSlots = rows.filter((row) => row.slotRecordCount > 0).length;
  const withNoDirectSlots = rows.filter((row) => row.noDirectSlotSkinCount > 0).length;
  const withGraphRecursiveSlots = rows.filter((row) => row.graphRecursiveSlotSkinCount > 0).length;
  const withGraphNoSlots = rows.filter((row) => row.graphNoSlotSkinCount > 0).length;
  const withNonDirectSkeletons = rows.filter(
    (row) => row.sameObjectSkeletonSkinCount > 0 || row.unresolvedSkeletonSkinCount > 0,
  ).length;
  return {
    rows: rows.length,
    withSkinRecords,
    withoutSkinRecords: rows.length - withSkinRecords,
    withSlots,
    withNoDirectSlots,
    withGraphRecursiveSlots,
    withGraphNoSlots,
    withNonDirectSkeletons,
    skinRecords: rows.reduce((total, row) => total + row.skinRecordCount, 0),
    slotRecords: rows.reduce((total, row) => total + row.slotRecordCount, 0),
    graphDirectSlotSkinRecords: rows.reduce((total, row) => total + row.graphDirectSlotSkinCount, 0),
    graphRecursiveSlotSkinRecords: rows.reduce((total, row) => total + row.graphRecursiveSlotSkinCount, 0),
    graphNoSlotSkinRecords: rows.reduce((total, row) => total + row.graphNoSlotSkinCount, 0),
  };
}

function exportRuntimeDefinitionSkinChain({
  definitionChainPath = defaultDefinitionChainPath,
  skinEvidencePath = defaultSkinEvidencePath,
  slotRecordsPath = defaultSlotRecordsPath,
  objectGraphPath = defaultObjectGraphPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const definitionChainRows = parseTsv(fs.readFileSync(definitionChainPath, "utf8"));
  const skinEvidenceRows = parseTsv(fs.readFileSync(skinEvidencePath, "utf8"));
  const slotRows = parseTsv(fs.readFileSync(slotRecordsPath, "utf8"));
  const objectGraphRows = objectGraphPath && fs.existsSync(objectGraphPath) ? parseTsv(fs.readFileSync(objectGraphPath, "utf8")) : [];
  const rows = buildRuntimeDefinitionSkinChainRows({ definitionChainRows, skinEvidenceRows, slotRows, objectGraphRows });

  rows.sort((left, right) => {
    if (Number(left.skinRecordCount) !== Number(right.skinRecordCount)) {
      return Number(right.skinRecordCount) - Number(left.skinRecordCount);
    }
    return left.manifestLabel.localeCompare(right.manifestLabel);
  });

  const columns = [
    "manifestLabel",
    "targetRelativePath",
    "targetHash",
    "childResourceRows",
    "meshCount",
    "skeletonCount",
    "animationCount",
    "audioCount",
    "skinRecordCount",
    "directSkeletonSkinCount",
    "sameObjectSkeletonSkinCount",
    "unresolvedSkeletonSkinCount",
    "directSlotSkinCount",
    "recursiveSlotSkinCount",
    "noDirectSlotSkinCount",
    "directAnimationSkinCount",
    "noDirectAnimationSkinCount",
    "directEffectSkinCount",
    "slotRecordCount",
    "graphDirectSlotSkinCount",
    "graphRecursiveSlotSkinCount",
    "graphNoSlotSkinCount",
    "slotBones",
    "slotBindTokens",
    "skinTargetBones",
    "skinTargetBindTokens",
    "sampleNonDirectSkeletonSkins",
    "sampleNoDirectSlotSkins",
    "sampleGraphRecursiveSlotSkins",
    "sampleGraphNoSlotSkins",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeDefinitionSkinChain({
    definitionChainPath: optionValue(args, "--definition-chain", defaultDefinitionChainPath),
    skinEvidencePath: optionValue(args, "--skin-evidence", defaultSkinEvidencePath),
    slotRecordsPath: optionValue(args, "--slot-records", defaultSlotRecordsPath),
    objectGraphPath: optionValue(args, "--object-graph", defaultObjectGraphPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeDefinitionSkinChainRows,
  exportRuntimeDefinitionSkinChain,
  parseTsv,
  summarize,
};
