#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { categoryFor } = require("./export_resource_index");
const { hasPrintfPlaceholder, normalizeBuildPath } = require("./resource_index");

const defaultDecodedInstances = "extracted/reports/cff0_decoded_instances.tsv";
const defaultOutDir = "extracted/reports";

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

function concreteRelativePath(value) {
  const relativePath = normalizeBuildPath(value);
  if (!relativePath || hasPrintfPlaceholder(relativePath)) return "";
  return relativePath;
}

function isUnsetToken(value) {
  return /^<.*>$/.test(value) && value !== "<no_bone>";
}

function isBindToken(value) {
  return value === "<no_bone>" || /(^|[_./-])[A-Za-z0-9_]+_bnd$/i.test(value) || /^bone[:._-]/i.test(value);
}

function classifyDefinitionString(value) {
  const targetRelativePath = concreteRelativePath(value);
  if (targetRelativePath) {
    return {
      semantic: "resource",
      resourceCategory: categoryFor(targetRelativePath),
      targetRelativePath,
      targetBuildPath: `build://${targetRelativePath}`,
    };
  }
  if (isBindToken(value)) return { semantic: "bind", resourceCategory: "", targetRelativePath: "", targetBuildPath: "" };
  if (isUnsetToken(value)) return { semantic: "unset", resourceCategory: "", targetRelativePath: "", targetBuildPath: "" };
  return { semantic: "label", resourceCategory: "", targetRelativePath: "", targetBuildPath: "" };
}

function stringRecordsFromDecodedRow(row) {
  if (Array.isArray(row.stringRecords)) return row.stringRecords;
  const values = row.strings ? String(row.strings).split("|") : [];
  return values.map((value, index) => ({ index, offset: "", value }));
}

function nearestLabelBefore(records, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = records[cursor]?.value?.trim() || "";
    if (!value) continue;
    const { semantic } = classifyDefinitionString(value);
    if (semantic === "label") return value;
  }
  return "";
}

function labelsBefore(records, index, limit = 24) {
  const labels = [];
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = records[cursor]?.value?.trim() || "";
    if (!value) continue;
    const { semantic } = classifyDefinitionString(value);
    if (semantic === "resource" && labels.length) break;
    if (semantic !== "label") continue;
    labels.push(value);
    if (labels.length >= limit) break;
  }
  return [...new Set(labels.reverse())].join("|");
}

function nearbyResources(records, index, radius = 6) {
  const resources = [];
  const start = Math.max(0, index - radius);
  const end = Math.min(records.length - 1, index + radius);
  for (let cursor = start; cursor <= end; cursor += 1) {
    if (cursor === index) continue;
    const value = records[cursor]?.value?.trim() || "";
    const classified = classifyDefinitionString(value);
    if (classified.semantic !== "resource") continue;
    resources.push(classified.targetRelativePath);
  }
  return [...new Set(resources)];
}

function buildDefinitionInstanceStringRows(decodedInstances) {
  const rows = [];

  for (const instance of decodedInstances) {
    const records = stringRecordsFromDecodedRow(instance);
    records.forEach((record, index) => {
      const value = record.value.trim();
      if (!value) return;
      const classified = classifyDefinitionString(value);
      rows.push({
        relativePath: instance.relativePath,
        hash: instance.hash,
        blockIndex: instance.blockIndex,
        definitionFormatByte: instance.definitionFormatByte,
        definitionVersionByte: instance.definitionVersionByte,
        payloadSize: instance.payloadSize,
        stringIndex: record.index ?? index,
        payloadOffset: record.offset ?? "",
        semantic: classified.semantic,
        labelBefore: nearestLabelBefore(records, index),
        value,
        resourceCategory: classified.resourceCategory,
        targetRelativePath: classified.targetRelativePath,
        targetBuildPath: classified.targetBuildPath,
      });
    });
  }

  return rows;
}

function buildDefinitionBindingTokenRows(stringRows) {
  const rows = [];
  const rowsByInstance = new Map();

  for (const row of stringRows) {
    const key = `${row.relativePath}\t${row.blockIndex}`;
    if (!rowsByInstance.has(key)) rowsByInstance.set(key, []);
    rowsByInstance.get(key).push(row);
  }

  for (const instanceRows of rowsByInstance.values()) {
    const orderedRows = [...instanceRows].sort((left, right) => Number(left.stringIndex) - Number(right.stringIndex));
    const records = orderedRows.map((row) => ({ value: row.value, index: row.stringIndex, offset: row.payloadOffset }));
    for (const row of orderedRows) {
      if (row.semantic !== "bind") continue;
      const localIndex = orderedRows.indexOf(row);
      const resources = nearbyResources(records, localIndex);
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
        labelsBefore: labelsBefore(records, localIndex),
        nearbyResourceCount: resources.length,
        nearbyResources: resources.join("|"),
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

function exportDefinitionInstanceGraph({ decodedInstances = defaultDecodedInstances, outDir = defaultOutDir }) {
  const stringRows = buildDefinitionInstanceStringRows(readTsv(decodedInstances));
  const bindingRows = buildDefinitionBindingTokenRows(stringRows);

  writeTsv(path.join(outDir, "definition_instance_strings.tsv"), stringRows, [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "payloadSize",
    "stringIndex",
    "payloadOffset",
    "semantic",
    "labelBefore",
    "value",
    "resourceCategory",
    "targetRelativePath",
    "targetBuildPath",
  ]);
  writeTsv(path.join(outDir, "definition_binding_tokens.tsv"), bindingRows, [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "stringIndex",
    "payloadOffset",
    "bindToken",
    "labelBefore",
    "labelsBefore",
    "nearbyResourceCount",
    "nearbyResources",
  ]);

  return {
    strings: stringRows.length,
    bindingTokens: bindingRows.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionInstanceGraph({
    decodedInstances: optionValue(args, "--decoded", defaultDecodedInstances),
    outDir: optionValue(args, "--out", defaultOutDir),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionBindingTokenRows,
  buildDefinitionInstanceStringRows,
  classifyDefinitionString,
  exportDefinitionInstanceGraph,
  isBindToken,
  labelsBefore,
  nearestLabelBefore,
  nearbyResources,
};
