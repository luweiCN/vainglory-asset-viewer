#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultInstanceStrings = "extracted/reports/definition_instance_strings.tsv";
const defaultClusterOut = "extracted/reports/definition_schema_clusters.tsv";
const defaultSampleOut = "extracted/reports/definition_schema_samples.json";

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countBy(values) {
  const output = {};
  for (const value of values.filter(Boolean)) output[value] = (output[value] || 0) + 1;
  return output;
}

function instanceKey(row) {
  return `${row.relativePath}\t${row.blockIndex}`;
}

function resourceCategorySequence(rows) {
  return rows
    .filter((row) => row.semantic === "resource")
    .map((row) => row.resourceCategory || "other");
}

function candidateKind({ resourceCounts, bindTokenCount }) {
  const meshes = resourceCounts.mesh || 0;
  const skeletons = resourceCounts.skeleton || 0;
  const animations = resourceCounts.animation || 0;
  const effects = resourceCounts.effect || 0;

  if (meshes && skeletons && animations && bindTokenCount) return "character-runtime";
  if (meshes && skeletons && animations) return "skin-animation-set";
  if (meshes && skeletons) return "skin-model";
  if (meshes && bindTokenCount) return "attached-mesh";
  if (effects && bindTokenCount) return "bound-effect";
  if (animations && bindTokenCount) return "animation-bone-map";
  if (effects) return "effect-index";
  if (animations) return "animation-set";
  if (bindTokenCount) return "bind-map";
  return "unknown";
}

function confidenceForKind(kind, resourceCounts, bindTokenCount) {
  if (kind === "character-runtime" && bindTokenCount >= 4 && resourceCounts.mesh && resourceCounts.skeleton) return 0.9;
  if (kind === "character-runtime" && bindTokenCount && resourceCounts.mesh && resourceCounts.skeleton) return 0.85;
  if (kind === "skin-model" || kind === "skin-animation-set") return 0.8;
  if (kind === "attached-mesh" || kind === "bound-effect" || kind === "animation-bone-map") return 0.7;
  if (kind === "bind-map" || kind === "effect-index" || kind === "animation-set") return 0.55;
  return 0.25;
}

function schemaSignature(summary) {
  const categoryCounts = Object.entries(summary.resourceCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `${category}:${Math.min(count, 12)}`)
    .join(",");
  const payloadBucket = Math.floor(Number(summary.payloadSize || 0) / 1024) * 1024;
  return [
    `fmt${summary.definitionFormatByte}`,
    `ver${summary.definitionVersionByte}`,
    summary.candidateKind,
    `payload${payloadBucket}`,
    `resources:${categoryCounts}`,
    `binds:${Math.min(summary.bindTokenCount, 16)}`,
  ].join("|");
}

function buildDefinitionInstanceSummaries(stringRows) {
  const groups = new Map();
  for (const row of stringRows) {
    const key = instanceKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.values()]
    .map((rows) => {
      const orderedRows = [...rows].sort((left, right) => Number(left.stringIndex) - Number(right.stringIndex));
      const first = orderedRows[0] || {};
      const categories = resourceCategorySequence(orderedRows);
      const resourceCounts = countBy(categories);
      const bindTokens = unique(orderedRows.filter((row) => row.semantic === "bind").map((row) => row.value));
      const labels = unique(orderedRows.filter((row) => row.semantic === "label").map((row) => row.value)).slice(0, 24);
      const kind = candidateKind({ resourceCounts, bindTokenCount: bindTokens.length });
      const confidence = confidenceForKind(kind, resourceCounts, bindTokens.length);
      const summary = {
        relativePath: first.relativePath,
        hash: first.hash,
        blockIndex: first.blockIndex,
        definitionFormatByte: first.definitionFormatByte,
        definitionVersionByte: first.definitionVersionByte,
        payloadSize: first.payloadSize,
        stringCount: orderedRows.length,
        resourceCount: categories.length,
        resourceCounts,
        resourceCategorySequence: categories.slice(0, 80),
        bindTokenCount: bindTokens.length,
        bindTokens,
        labels,
        candidateKind: kind,
        confidence,
      };
      return { ...summary, schemaSignature: schemaSignature(summary) };
    })
    .sort((left, right) => {
      const sourceOrder = left.relativePath.localeCompare(right.relativePath);
      if (sourceOrder) return sourceOrder;
      return Number(left.blockIndex) - Number(right.blockIndex);
    });
}

function buildDefinitionSchemaClusters(instanceSummaries) {
  const clusters = new Map();
  for (const summary of instanceSummaries) {
    if (!clusters.has(summary.schemaSignature)) {
      clusters.set(summary.schemaSignature, {
        schemaSignature: summary.schemaSignature,
        candidateKind: summary.candidateKind,
        confidence: summary.confidence,
        instanceCount: 0,
        sourceCount: 0,
        sources: new Set(),
        sampleBlocks: [],
        resourceCounts: summary.resourceCounts,
        bindTokens: new Set(),
      });
    }

    const cluster = clusters.get(summary.schemaSignature);
    cluster.instanceCount += 1;
    cluster.sources.add(summary.relativePath);
    for (const token of summary.bindTokens) cluster.bindTokens.add(token);
    if (summary.confidence > cluster.confidence) cluster.confidence = summary.confidence;
    if (cluster.sampleBlocks.length < 8) {
      cluster.sampleBlocks.push(`${summary.relativePath}#${summary.blockIndex}`);
    }
  }

  return [...clusters.values()]
    .map((cluster) => ({
      schemaSignature: cluster.schemaSignature,
      candidateKind: cluster.candidateKind,
      confidence: Number(cluster.confidence.toFixed(2)),
      instanceCount: cluster.instanceCount,
      sourceCount: cluster.sources.size,
      sampleBlocks: cluster.sampleBlocks.join("|"),
      resourceCounts: Object.entries(cluster.resourceCounts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, count]) => `${category}:${count}`)
        .join(","),
      bindTokens: [...cluster.bindTokens].slice(0, 24).join("|"),
    }))
    .sort((left, right) => {
      const countOrder = right.instanceCount - left.instanceCount;
      if (countOrder) return countOrder;
      return left.schemaSignature.localeCompare(right.schemaSignature);
    });
}

function exportDefinitionSchemaClusters({
  instanceStrings = defaultInstanceStrings,
  clusterOut = defaultClusterOut,
  sampleOut = defaultSampleOut,
}) {
  const summaries = buildDefinitionInstanceSummaries(readTsv(instanceStrings));
  const clusters = buildDefinitionSchemaClusters(summaries);

  writeTsv(clusterOut, clusters, [
    "schemaSignature",
    "candidateKind",
    "confidence",
    "instanceCount",
    "sourceCount",
    "sampleBlocks",
    "resourceCounts",
    "bindTokens",
  ]);
  fs.mkdirSync(path.dirname(sampleOut), { recursive: true });
  fs.writeFileSync(
    sampleOut,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        instanceCount: summaries.length,
        clusterCount: clusters.length,
        samples: summaries.filter((summary) => summary.confidence >= 0.7).slice(0, 200),
      },
      null,
      2,
    )}\n`,
  );

  return {
    instances: summaries.length,
    clusters: clusters.length,
    highConfidenceInstances: summaries.filter((summary) => summary.confidence >= 0.7).length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionSchemaClusters({
    instanceStrings: optionValue(args, "--instance-strings", defaultInstanceStrings),
    clusterOut: optionValue(args, "--cluster-out", defaultClusterOut),
    sampleOut: optionValue(args, "--sample-out", defaultSampleOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionInstanceSummaries,
  buildDefinitionSchemaClusters,
  candidateKind,
  exportDefinitionSchemaClusters,
  schemaSignature,
};
