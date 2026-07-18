#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { classifyDefinitionString } = require("./definition_instance_graph");

const defaultInstanceStrings = "extracted/reports/definition_instance_strings.tsv";
const defaultTsvOut = "extracted/reports/definition_block_neighborhood.tsv";
const defaultJsonOut = "extracted/reports/definition_block_neighborhood.json";

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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniqueJoin(values) {
  return [...new Set(values.filter(Boolean))].join("|");
}

function isBoneSlotLabel(value) {
  return /^Bone_[A-Za-z0-9_]+$/.test(value || "");
}

function isConcreteBindToken(value) {
  return /(^|[_./-])[A-Za-z0-9_]+_bnd$/i.test(value || "");
}

function isReportedBindToken(value) {
  return value === "<no_bone>" || isConcreteBindToken(value);
}

function normalizedRow(row) {
  const classified = row.semantic ? { semantic: row.semantic, resourceCategory: "", targetRelativePath: "" } : classifyDefinitionString(row.value || "");
  return {
    ...row,
    semantic: row.semantic || classified.semantic,
    resourceCategory: row.resourceCategory || classified.resourceCategory || "",
    targetRelativePath: row.targetRelativePath || classified.targetRelativePath || "",
  };
}

function categoryForResource(row) {
  const target = row.targetRelativePath || row.value || "";
  const category = row.resourceCategory || "";
  if (category) return category;
  if (/\.mesh$/i.test(target)) return "mesh";
  if (/\.skeleton$/i.test(target)) return "skeleton";
  if (/\.anim$/i.test(target)) return "animation";
  if (/\.(pfx|assetbundle\/[^/]+\.pfx)$/i.test(target)) return "effect";
  return "";
}

function groupedRows(stringRows) {
  const groups = new Map();
  for (const rawRow of stringRows) {
    const row = normalizedRow(rawRow);
    const key = `${row.relativePath}\t${row.blockIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function rowsAround(rows, index, radius) {
  const start = Math.max(0, index - radius);
  const end = Math.min(rows.length - 1, index + radius);
  return rows.slice(start, end + 1);
}

function resourcesByKind(rows) {
  const resources = {
    meshes: [],
    skeletons: [],
    animations: [],
    effects: [],
    all: [],
  };

  for (const row of rows) {
    if (row.semantic !== "resource") continue;
    const target = row.targetRelativePath || row.value || "";
    if (!target) continue;
    resources.all.push(target);
    const category = categoryForResource(row);
    if (category === "mesh") resources.meshes.push(target);
    else if (category === "skeleton") resources.skeletons.push(target);
    else if (category === "animation") resources.animations.push(target);
    else if (category === "effect") resources.effects.push(target);
  }

  return resources;
}

function evidenceTags({ directBoneSlot, resources }) {
  const tags = [];
  if (directBoneSlot) tags.push("bone-slot");
  if (resources.meshes.length) tags.push("mesh");
  if (resources.skeletons.length) tags.push("skeleton");
  if (resources.animations.length) tags.push("animation");
  if (resources.effects.length) tags.push("effect");
  return tags.join("+");
}

function buildDefinitionBlockNeighborhoodRows(stringRows, { radius = 8 } = {}) {
  const rows = [];

  for (const blockRows of groupedRows(stringRows).values()) {
    const orderedRows = [...blockRows].sort((left, right) => Number(left.stringIndex) - Number(right.stringIndex));
    for (let index = 0; index < orderedRows.length; index += 1) {
      const row = orderedRows[index];
      if (!isReportedBindToken(row.value)) continue;

      const previousValue = orderedRows[index - 1]?.value || "";
      const nextValue = orderedRows[index + 1]?.value || "";
      const neighborhood = rowsAround(orderedRows, index, radius);
      const nearbyBones = neighborhood.map((candidate) => candidate.value).filter(isBoneSlotLabel);
      const resources = resourcesByKind(neighborhood);
      const directBoneSlot = isBoneSlotLabel(previousValue) ? previousValue : "";

      rows.push({
        relativePath: row.relativePath,
        hash: row.hash,
        blockIndex: row.blockIndex,
        definitionFormatByte: row.definitionFormatByte,
        definitionVersionByte: row.definitionVersionByte,
        stringIndex: row.stringIndex,
        payloadOffset: row.payloadOffset,
        bindToken: row.value,
        labelBefore: row.labelBefore,
        previousValue,
        nextValue,
        directBoneSlot,
        nearbyBones: uniqueJoin(nearbyBones),
        nearbyMeshes: uniqueJoin(resources.meshes),
        nearbySkeletons: uniqueJoin(resources.skeletons),
        nearbyAnimations: uniqueJoin(resources.animations),
        nearbyEffects: uniqueJoin(resources.effects),
        nearbyResources: uniqueJoin(resources.all),
        neighborhoodEvidence: evidenceTags({ directBoneSlot, resources }),
      });
    }
  }

  return rows.sort((left, right) => {
    const sourceOrder = left.relativePath.localeCompare(right.relativePath);
    if (sourceOrder) return sourceOrder;
    const blockOrder = Number(left.blockIndex) - Number(right.blockIndex);
    if (blockOrder) return blockOrder;
    return Number(left.stringIndex) - Number(right.stringIndex);
  });
}

function exportDefinitionBlockNeighborhood({
  instanceStrings = defaultInstanceStrings,
  outTsv = defaultTsvOut,
  outJson = defaultJsonOut,
  radius = 8,
} = {}) {
  const rows = buildDefinitionBlockNeighborhoodRows(readTsv(instanceStrings), { radius });
  const columns = [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "stringIndex",
    "payloadOffset",
    "bindToken",
    "labelBefore",
    "previousValue",
    "nextValue",
    "directBoneSlot",
    "nearbyBones",
    "nearbyMeshes",
    "nearbySkeletons",
    "nearbyAnimations",
    "nearbyEffects",
    "nearbyResources",
    "neighborhoodEvidence",
  ];

  writeTsv(outTsv, rows, columns);
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, `${JSON.stringify({ generatedAt: new Date().toISOString(), radius, count: rows.length, items: rows }, null, 2)}\n`);

  return {
    rows: rows.length,
    withDirectBoneSlot: rows.filter((row) => row.directBoneSlot).length,
    withMesh: rows.filter((row) => row.nearbyMeshes).length,
    withAnimation: rows.filter((row) => row.nearbyAnimations).length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionBlockNeighborhood({
    instanceStrings: optionValue(args, "--instance-strings", defaultInstanceStrings),
    outTsv: optionValue(args, "--tsv-out", defaultTsvOut),
    outJson: optionValue(args, "--json-out", defaultJsonOut),
    radius: Number(optionValue(args, "--radius", "8")),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionBlockNeighborhoodRows,
  exportDefinitionBlockNeighborhood,
  isBoneSlotLabel,
};
