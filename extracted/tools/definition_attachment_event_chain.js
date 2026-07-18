#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultTsvOut = "extracted/reports/definition_attachment_event_chain.tsv";
const defaultJsonOut = "extracted/reports/definition_attachment_event_chain_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function definitionGroup(relativePath) {
  return String(relativePath || "").split("/")[0] || "";
}

function valuesToCheck(row) {
  return [row.value || "", row.labelBefore || ""].filter(Boolean);
}

function rowRoles(row) {
  const roles = new Set();
  const values = valuesToCheck(row);
  const value = row.value || "";
  const labelBefore = row.labelBefore || "";
  const target = row.targetRelativePath || "";

  if (/^\??AbilityCAttachPoint$/.test(value)) roles.add("ability-attach-point");
  if (/AbilityCAttachPoint/.test(labelBefore) && /^Bone_[A-Za-z0-9_]+$/.test(value)) roles.add("attach-point-bone");
  if (/AbilityCAttachPoint/.test(labelBefore) && row.semantic === "bind") roles.add("attach-point-bind-token");
  if (row.semantic === "bind" && /^Bone_Weapon(?:_|$)/.test(value)) roles.add("weapon-bone-bind");
  if (/^Bone_Weapon(?:_|$)/.test(labelBefore) && row.semantic === "bind") roles.add("weapon-bone-bind-token");

  if (values.some((item) => /^Buff_.*Attachment_Target$/.test(item))) roles.add("attachment-target-buff");
  if (values.some((item) => /^Buff_.*(?:Attached|PetIsAttached|AttachToHero)$/.test(item))) roles.add("attached-state-buff");
  if (values.some((item) => /^Buff_.*(?:Hide_Mesh|HideSelf)$/.test(item))) roles.add("hide-mesh-buff");
  if (values.some((item) => /^Buff_.*AttachPointAvailable$/.test(item))) roles.add("attach-point-availability-buff");
  if (values.some((item) => /^Buff_.*(?:GloballyVisible|Show[A-Za-z0-9_]*|Show[A-Z]|Visible)/.test(item))) {
    roles.add("visibility-buff");
  }

  if (/^Effect_.*(?:Weapon|Attach|Attached)/.test(value)) roles.add("effect-weapon-attach-label");
  if (row.resourceCategory === "effect" && /(?:Weapon|Attach|Attached)/i.test(target)) {
    roles.add("effect-weapon-attach-resource");
  }
  if (/^Sound_.*Attach/.test(value)) roles.add("attach-sound-label");
  if (/^Sound_.*Attach/.test(labelBefore) && row.resourceCategory === "audio") roles.add("attach-sound-resource");
  if (row.resourceCategory === "animation" && /(?:hide|show|invisible|visible)/i.test(target)) {
    roles.add("animation-visibility-resource");
  }

  return [...roles].sort();
}

function extractDefinitionAttachmentEventRows(stringRows) {
  const rows = [];
  for (const row of stringRows) {
    for (const role of rowRoles(row)) {
      rows.push({
        definitionGroup: definitionGroup(row.relativePath),
        role,
        relativePath: row.relativePath,
        hash: row.hash,
        blockIndex: row.blockIndex,
        stringIndex: row.stringIndex,
        payloadOffset: row.payloadOffset,
        semantic: row.semantic,
        labelBefore: row.labelBefore,
        value: row.value,
        resourceCategory: row.resourceCategory,
        targetRelativePath: row.targetRelativePath,
      });
    }
  }

  return rows.sort((left, right) => {
    const pathOrder = left.relativePath.localeCompare(right.relativePath);
    if (pathOrder) return pathOrder;
    const blockOrder = Number(left.blockIndex) - Number(right.blockIndex);
    if (blockOrder) return blockOrder;
    const stringOrder = Number(left.stringIndex) - Number(right.stringIndex);
    if (stringOrder) return stringOrder;
    return left.role.localeCompare(right.role);
  });
}

function summarize(rows, sourceRows) {
  const byDefinitionGroup = {};
  const byRole = {};
  for (const row of rows) {
    byDefinitionGroup[row.definitionGroup] = (byDefinitionGroup[row.definitionGroup] || 0) + 1;
    byRole[row.role] = (byRole[row.role] || 0) + 1;
  }

  return {
    sourceRows,
    rows: rows.length,
    definitions: uniqueSorted(rows.map((row) => row.relativePath)).length,
    byDefinitionGroup,
    byRole,
    roleSamples: Object.entries(byRole)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([role, count]) => ({ role, count })),
  };
}

function exportDefinitionAttachmentEventChain({
  stringsPath = defaultStringsPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const stringRows = readTsv(stringsPath);
  const rows = extractDefinitionAttachmentEventRows(stringRows);
  const columns = [
    "definitionGroup",
    "role",
    "relativePath",
    "hash",
    "blockIndex",
    "stringIndex",
    "payloadOffset",
    "semantic",
    "labelBefore",
    "value",
    "resourceCategory",
    "targetRelativePath",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, stringRows.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionAttachmentEventChain({
    stringsPath: optionValue(args, "--strings", defaultStringsPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportDefinitionAttachmentEventChain,
  extractDefinitionAttachmentEventRows,
  rowRoles,
};
