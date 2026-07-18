#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultNativePath = "extracted/reports/native_attachment_event_candidates.tsv";
const defaultDefinitionPath = "extracted/reports/definition_attachment_event_chain.tsv";
const defaultTsvOut = "extracted/reports/attachment_event_bridge.tsv";
const defaultJsonOut = "extracted/reports/attachment_event_bridge_summary.json";

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

function isBridgeToken(value) {
  return /^(?:Buff_|Effect_|Sound_|Bone_|AbilityCAttachPoint$)/.test(value);
}

function definitionTokens(row) {
  return uniqueSorted([row.value, row.labelBefore].filter((value) => value && isBridgeToken(value)));
}

function buildDefinitionTokenIndex(definitionRows) {
  const index = new Map();
  for (const row of definitionRows) {
    for (const token of definitionTokens(row)) {
      if (!index.has(token)) index.set(token, []);
      index.get(token).push(row);
    }
  }
  return index;
}

function summarizeDefinitionMatches(matches) {
  return {
    definitionRoles: uniqueSorted(matches.map((row) => row.role)).join("|"),
    definitionGroups: uniqueSorted(matches.map((row) => row.definitionGroup)).join("|"),
    definitionPaths: uniqueSorted(matches.map((row) => row.relativePath)).join("|"),
    definitionRows: matches.length,
  };
}

function bridgeAttachmentEventRows(nativeRows, definitionRows) {
  const definitionIndex = buildDefinitionTokenIndex(definitionRows);
  const rowsByToken = new Map();

  for (const row of nativeRows) {
    const token = row.token || "";
    if (!isBridgeToken(token)) continue;
    if (!rowsByToken.has(token)) {
      rowsByToken.set(token, {
        token,
        nativeRoles: new Set(),
        nativePlatforms: new Set(),
        nativeFunctions: new Set(),
        nativeSemanticCalls: new Set(),
        nativeRows: 0,
      });
    }
    const item = rowsByToken.get(token);
    item.nativeRoles.add(row.role);
    item.nativePlatforms.add(row.platform);
    item.nativeFunctions.add(`${row.platform}:${row.functionName}`);
    for (const call of String(row.semanticCalls || "").split("|").filter(Boolean)) item.nativeSemanticCalls.add(call);
    item.nativeRows += 1;
  }

  const rows = [];
  for (const item of rowsByToken.values()) {
    const matches = definitionIndex.get(item.token) || [];
    const definition = summarizeDefinitionMatches(matches);
    rows.push({
      token: item.token,
      bridgeStatus: matches.length ? "native-and-definition" : "native-only",
      nativeRoles: [...item.nativeRoles].sort().join("|"),
      nativePlatforms: [...item.nativePlatforms].sort().join("|"),
      nativeFunctions: [...item.nativeFunctions].sort().join("|"),
      nativeSemanticCalls: [...item.nativeSemanticCalls].sort().join("|"),
      nativeRows: item.nativeRows,
      definitionRoles: definition.definitionRoles,
      definitionGroups: definition.definitionGroups,
      definitionPaths: definition.definitionPaths,
      definitionRows: definition.definitionRows,
    });
  }

  return rows.sort((left, right) => {
    if (left.bridgeStatus !== right.bridgeStatus) return left.bridgeStatus.localeCompare(right.bridgeStatus);
    return left.token.localeCompare(right.token);
  });
}

function summarize(rows, nativeRows, definitionRows) {
  const byStatus = {};
  for (const row of rows) byStatus[row.bridgeStatus] = (byStatus[row.bridgeStatus] || 0) + 1;
  return {
    nativeRows: nativeRows.length,
    definitionRows: definitionRows.length,
    tokens: rows.length,
    byStatus,
    unmatchedNativeTokens: rows.filter((row) => row.bridgeStatus === "native-only").map((row) => row.token),
  };
}

function exportAttachmentEventBridgeReport({
  nativePath = defaultNativePath,
  definitionPath = defaultDefinitionPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const nativeRows = readTsv(nativePath);
  const definitionRows = readTsv(definitionPath);
  const rows = bridgeAttachmentEventRows(nativeRows, definitionRows);
  const columns = [
    "token",
    "bridgeStatus",
    "nativeRoles",
    "nativePlatforms",
    "nativeFunctions",
    "nativeSemanticCalls",
    "nativeRows",
    "definitionRoles",
    "definitionGroups",
    "definitionPaths",
    "definitionRows",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, nativeRows, definitionRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAttachmentEventBridgeReport({
    nativePath: optionValue(args, "--native", defaultNativePath),
    definitionPath: optionValue(args, "--definition", defaultDefinitionPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bridgeAttachmentEventRows,
  buildDefinitionTokenIndex,
  exportAttachmentEventBridgeReport,
  isBridgeToken,
};
