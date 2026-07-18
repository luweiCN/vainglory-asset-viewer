#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSkinRecordsPath = "extracted/reports/cff0_runtime_skin_records.tsv";
const defaultSkinFieldsPath = "extracted/reports/cff0_runtime_skin_fields.tsv";
const defaultObjectRefsPath = "extracted/reports/cff0_runtime_object_refs.tsv";
const defaultTsvOut = "extracted/reports/cff0_skin_evidence.tsv";

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

function pipeValues(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueJoin(values) {
  return [...new Set(values.filter(Boolean))].join("|");
}

function recordKey(row) {
  return [
    row.relativePath,
    row.blockIndex,
    row.definitionFormatByte,
    row.definitionVersionByte,
    row.modelLabel || row.ownerLabel,
    row.recordStartField || row.ownerRecordStartField,
  ].join("\t");
}

function groupByRecord(rows) {
  const output = new Map();
  for (const row of rows) {
    const key = recordKey(row);
    if (!output.has(key)) output.set(key, []);
    output.get(key).push(row);
  }
  return output;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function skeletonLocalOffset(row) {
  if (row.definitionFormatByte === "4" && row.definitionVersionByte === "8") return 12;
  if (row.definitionFormatByte === "5" && row.definitionVersionByte === "5") return 24;
  return null;
}

function firstObjectLocalOffset(row) {
  if (row.definitionFormatByte === "4" && row.definitionVersionByte === "8") return 8;
  if (row.definitionFormatByte === "5" && row.definitionVersionByte === "5") return 16;
  return null;
}

function skeletonEvidence(row, fields) {
  const localOffset = skeletonLocalOffset(row);
  if (localOffset == null) {
    return {
      skeletonFieldLocalOffset: "",
      skeletonEvidenceKind: "unknown-layout",
      skeletonFieldSourceOffset: "",
      skeletonFieldValue: "",
      skeletonFieldTarget: "",
    };
  }

  const skeletonField = fields.find((field) => Number(field.localFieldOffset) === localOffset);
  if (!skeletonField) {
    return {
      skeletonFieldLocalOffset: localOffset,
      skeletonEvidenceKind: "missing-field",
      skeletonFieldSourceOffset: "",
      skeletonFieldValue: "",
      skeletonFieldTarget: "",
    };
  }

  if (skeletonField.resourceCategory === "skeleton") {
    return {
      skeletonFieldLocalOffset: localOffset,
      skeletonEvidenceKind: "direct-skeleton-resource",
      skeletonFieldSourceOffset: skeletonField.sourceOffset,
      skeletonFieldValue: skeletonField.value,
      skeletonFieldTarget: skeletonField.targetRelativePath,
    };
  }

  const firstObjectField = fields.find((field) => Number(field.localFieldOffset) === firstObjectLocalOffset(row));
  const sameAsFirstObject = firstObjectField?.sourceOffset && firstObjectField.sourceOffset === skeletonField.sourceOffset;
  return {
    skeletonFieldLocalOffset: localOffset,
    skeletonEvidenceKind: sameAsFirstObject ? "same-as-first-object-ref" : "object-ref-unresolved",
    skeletonFieldSourceOffset: skeletonField.sourceOffset,
    skeletonFieldValue: skeletonField.value || "",
    skeletonFieldTarget: skeletonField.targetRelativePath || "",
  };
}

function objectRefEvidence(objectRefs) {
  const bones = [];
  const bindTokens = [];
  const targetEffects = [];
  const targetAnimations = [];
  const targetResources = [];

  for (const ref of objectRefs) {
    bones.push(...pipeValues(ref.targetBones));
    bindTokens.push(...pipeValues(ref.targetBindTokens));
    targetEffects.push(...pipeValues(ref.targetEffects));
    targetAnimations.push(...pipeValues(ref.targetAnimations));
    targetResources.push(...pipeValues(ref.targetResources));
  }

  const directSlotEvidence = bones.length > 0 || bindTokens.length > 0;
  return {
    objectRefCount: objectRefs.length,
    slotEvidenceKind: directSlotEvidence ? "direct-object-slot-evidence" : "no-direct-slot-evidence",
    targetBones: uniqueJoin(bones),
    targetBindTokens: uniqueJoin(bindTokens),
    targetEffects: uniqueJoin(targetEffects),
    targetAnimations: uniqueJoin(targetAnimations),
    targetResources: uniqueJoin(targetResources),
  };
}

function buildSkinEvidenceRows({ skinRows, fieldRows, objectRefRows }) {
  const fieldsByRecord = groupByRecord(fieldRows);
  const refsByRecord = groupByRecord(objectRefRows);

  return skinRows.map((row) => {
    const key = recordKey(row);
    const fields = fieldsByRecord.get(key) || [];
    const objectRefs = refsByRecord.get(key) || [];
    const skeleton = skeletonEvidence(row, fields);
    const refs = objectRefEvidence(objectRefs);
    const animationCount = numberValue(row.animationCount) || 0;
    const effectCount = numberValue(row.effectCount) || 0;

    return {
      source: "cff0-ptch",
      relativePath: row.relativePath,
      blockIndex: row.blockIndex,
      definitionFormatByte: row.definitionFormatByte,
      definitionVersionByte: row.definitionVersionByte,
      modelLabel: row.modelLabel,
      recordStartField: row.recordStartField,
      meshPath: row.meshPath,
      skeletonEvidenceKind: skeleton.skeletonEvidenceKind,
      skeletonFieldLocalOffset: skeleton.skeletonFieldLocalOffset,
      skeletonFieldSourceOffset: skeleton.skeletonFieldSourceOffset,
      skeletonFieldValue: skeleton.skeletonFieldValue,
      skeletonFieldTarget: skeleton.skeletonFieldTarget,
      directSkeletons: row.ownSkeletons,
      animationEvidenceKind: animationCount > 0 ? "direct-animation-records" : "no-direct-animation-records",
      animationCount,
      effectEvidenceKind: effectCount > 0 ? "direct-effect-labels" : "no-direct-effect-labels",
      effectCount,
      objectRefCount: refs.objectRefCount,
      slotEvidenceKind: refs.slotEvidenceKind,
      targetBones: refs.targetBones,
      targetBindTokens: refs.targetBindTokens,
      targetEffects: refs.targetEffects,
      targetAnimations: refs.targetAnimations,
      targetResources: refs.targetResources,
    };
  });
}

function summarizeRows(rows) {
  const skeletonEvidenceKinds = {};
  const slotEvidenceKinds = {};
  for (const row of rows) {
    skeletonEvidenceKinds[row.skeletonEvidenceKind] = (skeletonEvidenceKinds[row.skeletonEvidenceKind] || 0) + 1;
    slotEvidenceKinds[row.slotEvidenceKind] = (slotEvidenceKinds[row.slotEvidenceKind] || 0) + 1;
  }
  return {
    rows: rows.length,
    skeletonEvidenceKinds: Object.fromEntries(Object.entries(skeletonEvidenceKinds).sort(([left], [right]) => left.localeCompare(right))),
    slotEvidenceKinds: Object.fromEntries(Object.entries(slotEvidenceKinds).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function exportSkinEvidence({
  skinRecordsPath = defaultSkinRecordsPath,
  skinFieldsPath = defaultSkinFieldsPath,
  objectRefsPath = defaultObjectRefsPath,
  tsvOut = defaultTsvOut,
} = {}) {
  const rows = buildSkinEvidenceRows({
    skinRows: readTsv(skinRecordsPath),
    fieldRows: readTsv(skinFieldsPath),
    objectRefRows: readTsv(objectRefsPath),
  });

  writeTsv(tsvOut, rows, [
    "source",
    "relativePath",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "meshPath",
    "skeletonEvidenceKind",
    "skeletonFieldLocalOffset",
    "skeletonFieldSourceOffset",
    "skeletonFieldValue",
    "skeletonFieldTarget",
    "directSkeletons",
    "animationEvidenceKind",
    "animationCount",
    "effectEvidenceKind",
    "effectCount",
    "objectRefCount",
    "slotEvidenceKind",
    "targetBones",
    "targetBindTokens",
    "targetEffects",
    "targetAnimations",
    "targetResources",
  ]);

  return summarizeRows(rows);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSkinEvidence({
    skinRecordsPath: optionValue(args, "--skin-records", defaultSkinRecordsPath),
    skinFieldsPath: optionValue(args, "--skin-fields", defaultSkinFieldsPath),
    objectRefsPath: optionValue(args, "--object-refs", defaultObjectRefsPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildSkinEvidenceRows,
  exportSkinEvidence,
  skeletonEvidence,
};
