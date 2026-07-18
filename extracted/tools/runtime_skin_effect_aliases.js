#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultObjectRefsPath = "extracted/reports/cff0_runtime_object_refs.tsv";
const defaultViewerOut = "extracted/viewer/runtime-skin-effect-aliases.json";
const defaultTsvOut = "extracted/reports/runtime_skin_effect_aliases.tsv";
const MAX_ALIAS_OFFSET_DELTA = 16;

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

function parseTargetLabels(value) {
  return String(value || "")
    .split("|")
    .map((part) => {
      const match = part.match(/^(\d+):(.+)$/);
      if (!match) return null;
      return { offset: Number(match[1]), label: match[2] };
    })
    .filter((entry) => entry && Number.isFinite(entry.offset) && /^Effect_/.test(entry.label))
    .sort((left, right) => left.offset - right.offset || left.label.localeCompare(right.label));
}

function isSkinModelLabel(modelLabel) {
  return Boolean(modelLabel) && !/_DefaultSkin$/.test(modelLabel);
}

function rowAliasPairs(row) {
  if (row.ownerType && row.ownerType !== "skin") return [];
  const modelLabel = row.ownerLabel || row.modelLabel || "";
  if (!isSkinModelLabel(modelLabel)) return [];

  const labels = parseTargetLabels(row.targetLabels);
  const pairs = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    const source = labels[index];
    const skin = labels[index + 1];
    if (source.label === skin.label) continue;
    if (skin.offset - source.offset > MAX_ALIAS_OFFSET_DELTA) continue;
    pairs.push({ sourceEffectToken: source.label, skinEffectToken: skin.label });
  }
  return pairs;
}

function buildRuntimeSkinEffectAliasRows(objectRefRows = []) {
  const rows = [];
  const seen = new Set();
  for (const row of objectRefRows || []) {
    const modelLabel = row.ownerLabel || row.modelLabel || "";
    for (const pair of rowAliasPairs(row)) {
      const key = [modelLabel, pair.sourceEffectToken, pair.skinEffectToken].join("\t");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        modelLabel,
        sourceEffectToken: pair.sourceEffectToken,
        skinEffectToken: pair.skinEffectToken,
        relativePath: row.relativePath || "",
        blockIndex: row.blockIndex || "",
        definitionFormatByte: row.definitionFormatByte || "",
        definitionVersionByte: row.definitionVersionByte || "",
        ownerRecordStartField: row.ownerRecordStartField || row.recordStartField || "",
        ownerFieldOffset: row.ownerFieldOffset || "",
        evidence: "cff0-adjacent-effect-pair",
      });
    }
  }
  return rows.sort(
    (left, right) =>
      left.modelLabel.localeCompare(right.modelLabel) ||
      left.sourceEffectToken.localeCompare(right.sourceEffectToken) ||
      left.skinEffectToken.localeCompare(right.skinEffectToken),
  );
}

function summarizeRows(rows) {
  const byModel = {};
  for (const row of rows || []) byModel[row.modelLabel] = (byModel[row.modelLabel] || 0) + 1;
  return {
    rows: rows.length,
    models: Object.keys(byModel).length,
    byModel,
  };
}

function exportRuntimeSkinEffectAliases({
  objectRefsPath = defaultObjectRefsPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const rows = buildRuntimeSkinEffectAliasRows(readTsv(objectRefsPath));
  const summary = summarizeRows(rows);
  const payload = { generatedAt: new Date().toISOString(), summary, items: rows };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(payload, null, 2)}\n`);
  writeTsv(tsvOut, rows, [
    "modelLabel",
    "sourceEffectToken",
    "skinEffectToken",
    "relativePath",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "ownerRecordStartField",
    "ownerFieldOffset",
    "evidence",
  ]);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeSkinEffectAliases({
    objectRefsPath: optionValue(args, "--object-refs", defaultObjectRefsPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeSkinEffectAliasRows,
  exportRuntimeSkinEffectAliases,
  parseTargetLabels,
};
