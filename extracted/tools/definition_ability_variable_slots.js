#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { readDefinitionIndex } = require("./export_cff0_reports");
const {
  abilitySetCandidatesForBlock,
  pairedInstancePatchBlocks,
  pointerSizeForBlock,
} = require("./definition_ability_set_slots");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultTsvOut = "extracted/reports/definition_ability_variable_slots.tsv";
const defaultJsonOut = "extracted/reports/definition_ability_variable_slots_summary.json";

const abilityFields = {
  damageVariableList: 0xa8,
  abilityVariableList: 0xb0,
};

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

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function fieldKind(field) {
  if (field?.value) return "string";
  if (field?.sourceOffset) return "object";
  return "zero";
}

function objectFieldAt(fields, fieldOffset) {
  return fields.find((field) => field.fieldOffset === fieldOffset && fieldKind(field) === "object") || null;
}

function contiguousObjectRefsAt(fields, containerOffset, pointerSize, maxRefs = 80) {
  const refs = [];
  for (let index = 0; index < maxRefs; index += 1) {
    const fieldOffset = containerOffset + index * pointerSize;
    const field = objectFieldAt(fields, fieldOffset);
    if (!field) break;
    refs.push({
      sourceFieldOffset: field.fieldOffset,
      sourceLocalOffset: field.fieldOffset - containerOffset,
      objectOffset: field.sourceOffset,
    });
  }
  return refs;
}

function stringsNearObject(fields, objectOffset, windowBytes = 0x80) {
  return fields
    .filter((field) => field.fieldOffset >= objectOffset && field.fieldOffset < objectOffset + windowBytes && field.value)
    .sort((left, right) => left.fieldOffset - right.fieldOffset)
    .map((field) => ({ localOffset: field.fieldOffset - objectOffset, value: field.value }));
}

function abilityVariableInfoForObject(fields, objectOffset) {
  const strings = stringsNearObject(fields, objectOffset);
  return {
    objectOffset,
    variableName: strings[0]?.value || "",
    variableStringLocalOffset: strings[0]?.localOffset ?? "",
  };
}

function abilityVariableRowsForBlock(block, candidate = abilitySetCandidatesForBlock(block)[0]) {
  if (!candidate) return [];
  const pointerSize = pointerSizeForBlock(block);
  const rows = [];

  candidate.directAbilityRefs.forEach((abilityRef, abilitySlotIndex) => {
    const variableArrayField = objectFieldAt(block.fields, abilityRef.objectOffset + abilityFields.abilityVariableList);
    if (!variableArrayField) return;

    const variableRefs = contiguousObjectRefsAt(block.fields, variableArrayField.sourceOffset, pointerSize);
    variableRefs.forEach((variableRef, variableIndex) => {
      const variableInfo = abilityVariableInfoForObject(block.fields, variableRef.objectOffset);
      rows.push({
        relativePath: block.relativePath,
        hash: block.hash,
        blockIndex: block.blockIndex,
        definitionFormatByte: block.definitionFormatByte,
        definitionVersionByte: block.definitionVersionByte,
        pointerSize,
        abilitySetBaseOffset: `0x${candidate.abilitySetBaseOffset.toString(16)}`,
        abilityListObjectOffset: candidate.abilityListObjectOffset,
        abilitySlotIndex,
        abilityName: abilityRef.abilityName,
        abilityObjectOffset: abilityRef.objectOffset,
        abilityPointerFieldOffset: `0x${abilityRef.sourceFieldOffset.toString(16)}`,
        variableArrayFieldOffset: `0x${(abilityRef.objectOffset + abilityFields.abilityVariableList).toString(16)}`,
        variableArrayObjectOffset: variableArrayField.sourceOffset,
        variableIndex,
        variableName: variableInfo.variableName,
        variableObjectOffset: variableRef.objectOffset,
        variablePointerFieldOffset: `0x${variableRef.sourceFieldOffset.toString(16)}`,
        variableStringLocalOffset:
          variableInfo.variableStringLocalOffset === "" ? "" : `0x${variableInfo.variableStringLocalOffset.toString(16)}`,
        confidence: variableInfo.variableName ? "high" : "low",
        interpretation:
          "Decoded Ability +0xb0 as the AbilityVariable pointer array used by the native helper indexArg.",
      });
    });
  });

  return rows;
}

function buildDefinitionAbilityVariableSlotRows(definitions) {
  const rows = [];
  for (const entry of definitions) {
    if (!entry.relativePath?.startsWith("Characters/")) continue;
    for (const block of pairedInstancePatchBlocks(entry)) {
      rows.push(...abilityVariableRowsForBlock(block));
    }
  }

  return rows.sort((left, right) => {
    const pathOrder = left.relativePath.localeCompare(right.relativePath);
    if (pathOrder) return pathOrder;
    if (Number(left.blockIndex) !== Number(right.blockIndex)) return Number(left.blockIndex) - Number(right.blockIndex);
    if (Number(left.abilitySlotIndex) !== Number(right.abilitySlotIndex)) {
      return Number(left.abilitySlotIndex) - Number(right.abilitySlotIndex);
    }
    return Number(left.variableIndex) - Number(right.variableIndex);
  });
}

function summarize(rows, definitions) {
  const abilityKeys = new Set(rows.map((row) => `${row.relativePath}\t${row.blockIndex}\t${row.abilitySlotIndex}\t${row.abilityName}`));
  const byConfidence = {};
  for (const row of rows) byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
  return {
    characterDefinitions: definitions.filter((entry) => entry.relativePath?.startsWith("Characters/")).length,
    rows: rows.length,
    abilityRowsWithVariables: abilityKeys.size,
    highConfidenceRows: rows.filter((row) => row.confidence === "high").length,
    lowConfidenceRows: rows.filter((row) => row.confidence === "low").length,
    uniqueVariableNames: uniq(rows.map((row) => row.variableName)).length,
    byConfidence,
    sampleVariables: uniq(rows.slice(0, 50).map((row) => row.variableName)).slice(0, 20),
  };
}

function exportDefinitionAbilityVariableSlots({
  definitionIndex = defaultDefinitionIndex,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const definitions = readDefinitionIndex(definitionIndex);
  const rows = buildDefinitionAbilityVariableSlotRows(definitions);
  const columns = [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "pointerSize",
    "abilitySetBaseOffset",
    "abilityListObjectOffset",
    "abilitySlotIndex",
    "abilityName",
    "abilityObjectOffset",
    "abilityPointerFieldOffset",
    "variableArrayFieldOffset",
    "variableArrayObjectOffset",
    "variableIndex",
    "variableName",
    "variableObjectOffset",
    "variablePointerFieldOffset",
    "variableStringLocalOffset",
    "confidence",
    "interpretation",
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
  const summary = exportDefinitionAbilityVariableSlots({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  abilityVariableInfoForObject,
  abilityVariableRowsForBlock,
  buildDefinitionAbilityVariableSlotRows,
  contiguousObjectRefsAt,
  exportDefinitionAbilityVariableSlots,
};
