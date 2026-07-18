#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultHelperPath = "extracted/reports/native_attachment_helper_semantics_chain.tsv";
const defaultEventBridgePath = "extracted/reports/attachment_event_bridge.tsv";
const defaultAliasBridgePath = "extracted/reports/attachment_effect_alias_bridge.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_helper_definition_bridge.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_helper_definition_bridge_summary.json";

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

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseParentTokens(value) {
  return splitList(value).map((entry) => {
    const separator = entry.lastIndexOf(":");
    if (separator < 0) return { token: entry, count: 1 };
    const token = entry.slice(0, separator);
    const count = Number(entry.slice(separator + 1));
    return { token, count: Number.isFinite(count) ? count : 1 };
  });
}

function isGenericDefinitionToken(token) {
  return /^Bone_Weapon(?:_|$)/.test(token) || token === "Bone_Weapon" || token === "AbilityCAttachPoint";
}

function buildIndex(rows, key = "token") {
  const index = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    if (!index.has(value)) index.set(value, []);
    index.get(value).push(row);
  }
  return index;
}

function evidenceStatus(token, eventRows, aliasRows) {
  const hasDefinition = eventRows.some((row) => row.bridgeStatus === "native-and-definition");
  const hasEvent = eventRows.length > 0;
  const hasAlias = aliasRows.length > 0;
  if (hasDefinition && hasAlias) return `${token}=definition+effect-resource`;
  if (hasDefinition) return `${token}=definition`;
  if (hasEvent && hasAlias) return `${token}=native-event+effect-resource`;
  if (hasEvent) return `${token}=native-event-only`;
  if (hasAlias) return `${token}=effect-resource`;
  return `${token}=unresolved`;
}

function bridgeHelperDefinitionRows(helperRows, eventBridgeRows, aliasBridgeRows) {
  const eventIndex = buildIndex(eventBridgeRows);
  const aliasIndex = buildIndex(aliasBridgeRows);

  return helperRows
    .filter((row) => row.stage === "attachment-helper-call-usage")
    .map((row) => {
      const parentTokens = parseParentTokens(row.parentTokens);
      const eventRowsByToken = new Map(parentTokens.map(({ token }) => [token, eventIndex.get(token) || []]));
      const allEventRows = parentTokens.flatMap(({ token }) => eventRowsByToken.get(token) || []);
      const allAliasRows = parentTokens.flatMap(({ token }) => aliasIndex.get(token) || []);
      const specificDefinitionPaths = uniq(
        parentTokens.flatMap(({ token }) =>
          isGenericDefinitionToken(token)
            ? []
            : (eventRowsByToken.get(token) || []).flatMap((eventRow) => splitList(eventRow.definitionPaths)),
        ),
      );
      const specificCharacterDefinitionPaths = specificDefinitionPaths.filter((definitionPath) =>
        definitionPath.startsWith("Characters/"),
      );
      const bridgedTokens = parentTokens
        .filter(({ token }) => (eventIndex.get(token) || aliasIndex.get(token)))
        .map(({ token, count }) => `${token}:${count}`);
      const unresolvedTokens = parentTokens
        .filter(({ token }) => !(eventIndex.get(token) || aliasIndex.get(token)))
        .map(({ token, count }) => `${token}:${count}`);
      const statuses = parentTokens.map(({ token }) => evidenceStatus(token, eventIndex.get(token) || [], aliasIndex.get(token) || []));

      let complete = "no";
      if (parentTokens.length && unresolvedTokens.length === 0) complete = "yes";
      else if (bridgedTokens.length) complete = "partial";

      return {
        platform: row.platform,
        helperFunction: row.helperFunction,
        realFunction: row.realFunction,
        argKey: row.argKey,
        groupArg: row.groupArg,
        indexArg: row.indexArg,
        kindArg: row.kindArg,
        flagArg: row.flagArg,
        callCount: row.callCount,
        parentRoles: row.parentRoles,
        parentTokens: row.parentTokens,
        bridgedParentTokens: bridgedTokens.join("|"),
        unresolvedParentTokens: unresolvedTokens.join("|"),
        bridgeStatuses: statuses.join("|"),
        definitionRoles: uniq(allEventRows.flatMap((eventRow) => splitList(eventRow.definitionRoles))).join("|"),
        definitionGroups: uniq(allEventRows.flatMap((eventRow) => splitList(eventRow.definitionGroups))).join("|"),
        specificDefinitionPaths: specificDefinitionPaths.join("|"),
        specificCharacterDefinitionPaths: specificCharacterDefinitionPaths.join("|"),
        definitionPaths: uniq(allEventRows.flatMap((eventRow) => splitList(eventRow.definitionPaths))).join("|"),
        aliasStatuses: uniq(allAliasRows.map((aliasRow) => aliasRow.aliasStatus)).join("|"),
        aliasMatchKinds: uniq(allAliasRows.map((aliasRow) => aliasRow.matchKind)).join("|"),
        aliasEvidenceStrengths: uniq(allAliasRows.map((aliasRow) => aliasRow.evidenceStrength)).join("|"),
        heroCodes: uniq(allAliasRows.flatMap((aliasRow) => splitList(aliasRow.heroCodes))).join("|"),
        resourcePaths: uniq(allAliasRows.flatMap((aliasRow) => splitList(aliasRow.resourcePaths))).join("|"),
        resourceLabels: uniq(allAliasRows.flatMap((aliasRow) => splitList(aliasRow.resourceLabels))).join("|"),
        complete,
        interpretation:
          "Helper group/index usage joined to definition tokens and effect-resource candidates; this does not yet decode the final runtime ability slot name.",
      };
    })
    .sort((left, right) => {
      if (left.argKey !== right.argKey) return left.argKey.localeCompare(right.argKey);
      if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
      return left.parentTokens.localeCompare(right.parentTokens);
    });
}

function summarize(rows, helperRows) {
  const byArgKey = {};
  const byComplete = {};
  const byEvidenceStatus = {};
  const rowsWithSpecificCharacterDefinition = rows.filter((row) => row.specificCharacterDefinitionPaths).length;
  const unresolvedParentTokens = [];

  for (const row of rows) {
    increment(byArgKey, row.argKey);
    increment(byComplete, row.complete);
    for (const status of splitList(row.bridgeStatuses)) increment(byEvidenceStatus, status.replace(/^[^=]+=/, ""));
    unresolvedParentTokens.push(...parseParentTokens(row.unresolvedParentTokens).map((entry) => entry.token));
  }

  return {
    helperUsageRows: helperRows.filter((row) => row.stage === "attachment-helper-call-usage").length,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    partialRows: rows.filter((row) => row.complete === "partial").length,
    unresolvedRows: rows.filter((row) => row.complete === "no").length,
    rowsWithSpecificCharacterDefinition,
    byArgKey,
    byComplete,
    byEvidenceStatus,
    unresolvedParentTokens: uniq(unresolvedParentTokens),
  };
}

function exportNativeAttachmentHelperDefinitionBridge({
  helperPath = defaultHelperPath,
  eventBridgePath = defaultEventBridgePath,
  aliasBridgePath = defaultAliasBridgePath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const helperRows = readTsv(helperPath);
  const eventBridgeRows = readTsv(eventBridgePath);
  const aliasBridgeRows = readTsv(aliasBridgePath);
  const rows = bridgeHelperDefinitionRows(helperRows, eventBridgeRows, aliasBridgeRows);
  const columns = [
    "platform",
    "helperFunction",
    "realFunction",
    "argKey",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "callCount",
    "parentRoles",
    "parentTokens",
    "bridgedParentTokens",
    "unresolvedParentTokens",
    "bridgeStatuses",
    "definitionRoles",
    "definitionGroups",
    "specificDefinitionPaths",
    "specificCharacterDefinitionPaths",
    "definitionPaths",
    "aliasStatuses",
    "aliasMatchKinds",
    "aliasEvidenceStrengths",
    "heroCodes",
    "resourcePaths",
    "resourceLabels",
    "complete",
    "interpretation",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, helperRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentHelperDefinitionBridge({
    helperPath: optionValue(args, "--helper", defaultHelperPath),
    eventBridgePath: optionValue(args, "--event-bridge", defaultEventBridgePath),
    aliasBridgePath: optionValue(args, "--alias-bridge", defaultAliasBridgePath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bridgeHelperDefinitionRows,
  exportNativeAttachmentHelperDefinitionBridge,
  isGenericDefinitionToken,
  parseParentTokens,
};
