#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultDefinitionPath = "extracted/reports/definition_attachment_event_chain.tsv";
const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_visibility_event_candidates.tsv";
const defaultJsonOut = "extracted/reports/native_visibility_event_candidates_summary.json";

function optionValues(args, name, fallback) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.length ? values : fallback;
}

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

function contextHash(text) {
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function symbolStrings(text) {
  return [...text.matchAll(/\bPTR_s_([A-Za-z0-9_]+)_[0-9a-fA-F]+\b/g)].map((match) => match[1]);
}

function definitionTokens(definitionRows) {
  const tokens = [];
  for (const row of definitionRows) {
    for (const value of [row.value, row.labelBefore]) {
      if (/^Buff_[A-Za-z0-9_]+$/.test(value || "")) tokens.push(value);
    }
  }
  return uniq(tokens);
}

function definitionContextByToken(definitionRows) {
  const byToken = new Map();
  for (const row of definitionRows) {
    for (const value of [row.value, row.labelBefore]) {
      if (!/^Buff_[A-Za-z0-9_]+$/.test(value || "")) continue;
      if (!byToken.has(value)) {
        byToken.set(value, {
          definitionRoles: [],
          definitionPaths: [],
        });
      }
      const context = byToken.get(value);
      context.definitionRoles.push(row.role);
      context.definitionPaths.push(row.relativePath);
    }
  }
  return byToken;
}

function rolesForToken(token) {
  const roles = [];
  if (/^Buff_.*(?:Hide_Mesh|HideSelf|Invisible)/.test(token)) roles.push("hide-or-invisible-buff");
  if (/^Buff_.*(?:GloballyVisible|Visible|TrueSight)/.test(token)) roles.push("visibility-buff");
  if (/^Buff_.*Show[A-Za-z0-9_]*(?:Effect|Pfx|Charges|Stacks|Visible|GloballyVisible)?/.test(token)) {
    roles.push("show-effect-or-indicator-buff");
  }
  return uniq(roles);
}

function resolveToken(rawToken, knownTokens) {
  if (knownTokens.includes(rawToken)) return { token: rawToken, status: "exact" };
  if (rawToken.length < 20) return { token: rawToken, status: "raw" };
  const matches = knownTokens.filter((token) => token.startsWith(rawToken));
  if (matches.length === 1) return { token: matches[0], status: "definition-prefix-recovered" };
  if (matches.length > 1) return { token: rawToken, status: "definition-prefix-ambiguous" };
  return { token: rawToken, status: "raw" };
}

function tokensFromBlock(blockText, knownTokens) {
  return uniq([...quotedStrings(blockText), ...symbolStrings(blockText)])
    .map((rawToken) => ({ rawToken, ...resolveToken(rawToken, knownTokens) }))
    .filter((item) => rolesForToken(item.token).length);
}

function lineForRawToken(block, rawToken) {
  const quotedIndex = block.text.indexOf(`"${rawToken}"`);
  let index = quotedIndex;
  if (index < 0) {
    const symbolPattern = new RegExp(`\\bPTR_s_${rawToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_[0-9a-fA-F]+\\b`);
    const match = symbolPattern.exec(block.text);
    index = match?.index ?? 0;
  }
  return block.startLine + block.text.slice(0, index).split(/\r?\n/).length - 1;
}

function semanticCalls(blockText) {
  const patterns = [
    ["direct-buff-apply", /\b(?:FUN_1003a4e5c|FUN_1003a5078|FUN_00d9cb40|FUN_00cf49b0|FUN_00d46fc0|FUN_00cf44e8|FUN_00cf4540|FUN_00cf456c|FUN_00d3e888)\s*\(/g],
    ["buff-token-lookup", /\b(?:FUN_1003d4e0c|thunk_FUN_00d9ff34)\s*\(/g],
    ["vcall-add-buff", /\+\s*0x30\)\)\(/g],
    ["vcall-query-status", /\+\s*0x38\)\)\(/g],
    ["vcall-remove-or-query-buff", /\+\s*0x50\)\)\(/g],
    ["vcall-target-or-attach", /\+\s*0x70\)\)\(/g],
  ];
  return patterns.filter(([, pattern]) => pattern.test(blockText)).map(([label]) => label);
}

function extractNativeVisibilityEventCandidatesFromSource({
  sourceFile,
  sourceText,
  knownTokens = [],
  definitionContext = new Map(),
} = {}) {
  const platform = sourcePlatform(sourceFile);
  const rows = [];
  for (const block of findFunctionBlocks(sourceText.split(/\r?\n/))) {
    for (const item of tokensFromBlock(block.text, knownTokens)) {
      const definition = definitionContext.get(item.token) || {};
      rows.push({
        platform,
        sourceFile,
        functionName: block.functionName,
        line: lineForRawToken(block, item.rawToken),
        role: rolesForToken(item.token).join("|"),
        rawToken: item.rawToken,
        token: item.token,
        tokenStatus: item.status,
        definitionRoles: uniq(definition.definitionRoles || []).join("|"),
        definitionPaths: uniq(definition.definitionPaths || []).join("|"),
        bridgeStatus: definition.definitionRoles?.length ? "native-and-definition" : "native-only",
        semanticCalls: semanticCalls(block.text).join("|"),
        contextHash: contextHash(block.text),
        context: block.text,
      });
    }
  }
  return rows.sort((left, right) => left.line - right.line || left.token.localeCompare(right.token));
}

function summarize(rows, files) {
  const byPlatform = {};
  const byRole = {};
  const byTokenStatus = {};
  const byBridgeStatus = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byTokenStatus[row.tokenStatus] = (byTokenStatus[row.tokenStatus] || 0) + 1;
    byBridgeStatus[row.bridgeStatus] = (byBridgeStatus[row.bridgeStatus] || 0) + 1;
    for (const role of row.role.split("|").filter(Boolean)) byRole[role] = (byRole[role] || 0) + 1;
  }
  return {
    files,
    rows: rows.length,
    functions: uniq(rows.map((row) => `${row.platform}:${row.functionName}`)).length,
    tokens: uniq(rows.map((row) => row.token)).length,
    byPlatform,
    byRole,
    byTokenStatus,
    byBridgeStatus,
    recoveredTokens: rows
      .filter((row) => row.tokenStatus === "definition-prefix-recovered")
      .map((row) => ({ rawToken: row.rawToken, token: row.token }))
      .filter((item, index, list) => list.findIndex((other) => other.rawToken === item.rawToken && other.token === item.token) === index)
      .slice(0, 40),
  };
}

function exportNativeVisibilityEventCandidates({
  definitionPath = defaultDefinitionPath,
  sourcePaths = defaultSourcePaths,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const definitionRows = fs.existsSync(definitionPath) ? readTsv(definitionPath) : [];
  const knownTokens = definitionTokens(definitionRows);
  const definitionContext = definitionContextByToken(definitionRows);
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeVisibilityEventCandidatesFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
        knownTokens,
        definitionContext,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.token !== right.token) return left.token.localeCompare(right.token);
    return Number(left.line) - Number(right.line);
  });

  const columns = [
    "platform",
    "role",
    "rawToken",
    "token",
    "tokenStatus",
    "bridgeStatus",
    "definitionRoles",
    "definitionPaths",
    "sourceFile",
    "functionName",
    "line",
    "semanticCalls",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, files.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeVisibilityEventCandidates({
    definitionPath: optionValue(args, "--definitions", defaultDefinitionPath),
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportNativeVisibilityEventCandidates,
  extractNativeVisibilityEventCandidatesFromSource,
  resolveToken,
  rolesForToken,
  tokensFromBlock,
};
