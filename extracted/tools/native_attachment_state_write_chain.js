#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultCandidatesPath = "extracted/reports/native_attachment_event_candidates.tsv";
const defaultEventBridgePath = "extracted/reports/attachment_event_bridge.tsv";
const defaultEffectAliasBridgePath = "extracted/reports/attachment_effect_alias_bridge.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_state_write_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_state_write_chain_summary.json";

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

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function symbolStrings(text) {
  return [...text.matchAll(/\bPTR_s_([A-Za-z0-9_]+)_[0-9a-fA-F]+\b/g)].map((match) => match[1]);
}

function stringsInText(text) {
  return uniq([...quotedStrings(text), ...symbolStrings(text)]);
}

function vcallOffset(line) {
  return line.match(/\+\s*(0x[0-9a-fA-F]+)\)\)\(/)?.[1] || "";
}

function normalizeOffset(offset) {
  if (!offset) return "";
  if (/^0x/i.test(offset)) return `0x${Number.parseInt(offset, 16).toString(16)}`;
  return `0x${Number(offset).toString(16)}`;
}

function directWrite(line) {
  const match = line.match(/^\s*\*\(([^()]+?)\)\(([^()]+?)\s*\+\s*(0x[0-9a-fA-F]+|\d+)\)\s*=\s*(.+);\s*$/);
  if (!match) return null;
  return {
    valueType: match[1].trim(),
    baseExpr: match[2].trim(),
    fieldOffset: normalizeOffset(match[3]),
    valueExpr: match[4].trim(),
  };
}

function localCallbackInit(line) {
  const match = line.match(/^\s*(local_[0-9a-f]+)\s*=\s*(FUN_[0-9a-fA-F]+);\s*$/);
  if (!match) return null;
  return {
    localName: match[1],
    callbackFunction: match[2],
  };
}

function callbackLocals(blockText) {
  const locals = new Map();
  for (const line of blockText.split(/\r?\n/)) {
    const init = localCallbackInit(line);
    if (init) locals.set(init.localName, init.callbackFunction);
  }
  return locals;
}

function callbackRegister(line, locals) {
  const localMatch = line.match(/&(local_[0-9a-f]+)/);
  const directFunctionMatch = line.match(/[,(\s](FUN_[0-9a-fA-F]+)[),]/);
  if (!localMatch && !directFunctionMatch) return null;

  const offset = vcallOffset(line);
  const localName = localMatch?.[1] || "";
  const callbackFunction = localName ? locals.get(localName) || "" : directFunctionMatch?.[1] || "";
  if (!offset && !callbackFunction) return null;

  return {
    localName,
    callbackFunction,
    vcallOffset: normalizeOffset(offset),
  };
}

function classifyWrite({ valueType, fieldOffset, valueExpr }) {
  if (/code\s*\*\*/.test(valueType) || /\bFUN_[0-9a-fA-F]+\b/.test(valueExpr)) return "function-pointer-field-write";
  if (/PTR_s_|"[^"]+"/.test(valueExpr)) return "string-field-write";
  if (/\|\s*0x|&\s*0x|\|\s*\d+|&\s*\d+/.test(valueExpr)) return "flag-field-write";
  if (["0x20", "0x28"].includes(fieldOffset)) return "hash-or-id-field-write";
  if (["0x40", "0x44", "0x48", "0x58", "0x5a", "0x60"].includes(fieldOffset)) return "state-config-field-write";
  return "field-write";
}

function operationRows(block, candidateContext = {}) {
  const locals = new Map();
  const rows = [];
  const lines = block.text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = block.startLine + index;
    const tokens = stringsInText(line).filter(
      (token) =>
        /^(Ability|Bone|Buff|Effect|Sound)_/.test(token) ||
        token === "AbilityCAttachPoint" ||
        token === "ActorBase",
    );
    const write = directWrite(line);
    if (write) {
      rows.push({
        ...candidateContext,
        operationRole: classifyWrite(write),
        line: lineNumber,
        valueType: write.valueType,
        baseExpr: write.baseExpr,
        fieldOffset: write.fieldOffset,
        valueExpr: write.valueExpr,
        callbackLocal: "",
        callbackFunction: "",
        vcallOffset: "",
        tokensInLine: tokens.join("|"),
      });
      continue;
    }

    const localInit = localCallbackInit(line);
    if (localInit) {
      locals.set(localInit.localName, localInit.callbackFunction);
      rows.push({
        ...candidateContext,
        operationRole: "callback-local-init",
        line: lineNumber,
        valueType: "",
        baseExpr: "",
        fieldOffset: "",
        valueExpr: "",
        callbackLocal: localInit.localName,
        callbackFunction: localInit.callbackFunction,
        vcallOffset: "",
        tokensInLine: tokens.join("|"),
      });
      continue;
    }

    const registration = callbackRegister(line, locals);
    if (registration) {
      const operationRole = registration.callbackFunction
        ? registration.localName
          ? "callback-register-vcall"
          : "direct-callback-register-vcall"
        : "local-data-register-vcall";
      rows.push({
        ...candidateContext,
        operationRole,
        line: lineNumber,
        valueType: "",
        baseExpr: "",
        fieldOffset: "",
        valueExpr: "",
        callbackLocal: registration.localName,
        callbackFunction: registration.callbackFunction,
        vcallOffset: registration.vcallOffset,
        tokensInLine: tokens.join("|"),
      });
    }
  }
  return rows;
}

function blockForFunction(sourceText, functionName) {
  return findFunctionBlocks(sourceText.split(/\r?\n/)).find((block) => block.functionName === functionName);
}

function bridgeStatusForToken(token, eventBridgeByToken, effectAliasByToken) {
  const effectAlias = effectAliasByToken.get(token);
  if (effectAlias) return `${effectAlias.aliasStatus}:${effectAlias.evidenceStrength}`;
  const eventBridge = eventBridgeByToken.get(token);
  if (!eventBridge) return "";
  return eventBridge.bridgeStatus;
}

function buildFunctionContexts(candidateRows, eventBridgeRows, effectAliasRows) {
  const eventBridgeByToken = new Map(eventBridgeRows.map((row) => [row.token, row]));
  const effectAliasByToken = new Map(effectAliasRows.map((row) => [row.token, row]));
  const byFunction = new Map();

  for (const row of candidateRows) {
    const key = `${row.platform}:${row.sourceFile}:${row.functionName}`;
    if (!byFunction.has(key)) {
      byFunction.set(key, {
        platform: row.platform,
        sourceFile: row.sourceFile,
        functionName: row.functionName,
        candidateRoles: [],
        candidateTokens: [],
        bridgeStatuses: [],
        semanticCalls: [],
      });
    }
    const context = byFunction.get(key);
    context.candidateRoles.push(row.role);
    context.candidateTokens.push(row.token);
    context.bridgeStatuses.push(bridgeStatusForToken(row.token, eventBridgeByToken, effectAliasByToken) || row.bridgeStatus);
    context.semanticCalls.push(row.semanticCalls);
  }

  return [...byFunction.values()].map((context) => ({
    ...context,
    candidateRoles: uniq(context.candidateRoles).join("|"),
    candidateTokens: uniq(context.candidateTokens).join("|"),
    bridgeStatuses: uniq(context.bridgeStatuses).join("|"),
    semanticCalls: uniq(context.semanticCalls).join("|"),
  }));
}

function buildNativeAttachmentStateWriteRows(
  candidateRows,
  eventBridgeRows,
  effectAliasRows,
  sourceReader = (filePath) => fs.readFileSync(filePath, "utf8"),
) {
  const contexts = buildFunctionContexts(candidateRows, eventBridgeRows, effectAliasRows);
  const sourceCache = new Map();
  const rows = [];

  for (const context of contexts) {
    if (!sourceCache.has(context.sourceFile)) sourceCache.set(context.sourceFile, sourceReader(context.sourceFile));
    const block = blockForFunction(sourceCache.get(context.sourceFile), context.functionName);
    if (!block) continue;
    rows.push(
      ...operationRows(block, {
        platform: context.platform,
        sourceFile: context.sourceFile,
        functionName: context.functionName,
        candidateRoles: context.candidateRoles,
        candidateTokens: context.candidateTokens,
        bridgeStatuses: context.bridgeStatuses,
        semanticCalls: context.semanticCalls,
      }),
    );
  }

  return rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.functionName !== right.functionName) return left.functionName.localeCompare(right.functionName);
    return Number(left.line) - Number(right.line);
  });
}

function summarize(rows, candidateRows) {
  const byOperationRole = {};
  const byFieldOffset = {};
  const byVcallOffset = {};
  const byPlatform = {};
  for (const row of rows) {
    byOperationRole[row.operationRole] = (byOperationRole[row.operationRole] || 0) + 1;
    if (row.fieldOffset) byFieldOffset[row.fieldOffset] = (byFieldOffset[row.fieldOffset] || 0) + 1;
    if (row.vcallOffset) byVcallOffset[row.vcallOffset] = (byVcallOffset[row.vcallOffset] || 0) + 1;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
  }
  return {
    candidateRows: candidateRows.length,
    rows: rows.length,
    functions: uniq(rows.map((row) => `${row.platform}:${row.functionName}`)).length,
    byPlatform,
    byOperationRole,
    byFieldOffset,
    byVcallOffset,
    callbackFunctions: uniq(rows.map((row) => row.callbackFunction)).slice(0, 80),
  };
}

function exportNativeAttachmentStateWriteChain({
  candidatesPath = defaultCandidatesPath,
  eventBridgePath = defaultEventBridgePath,
  effectAliasBridgePath = defaultEffectAliasBridgePath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const candidateRows = readTsv(candidatesPath);
  const eventBridgeRows = fs.existsSync(eventBridgePath) ? readTsv(eventBridgePath) : [];
  const effectAliasRows = fs.existsSync(effectAliasBridgePath) ? readTsv(effectAliasBridgePath) : [];
  const rows = buildNativeAttachmentStateWriteRows(candidateRows, eventBridgeRows, effectAliasRows);
  const columns = [
    "platform",
    "functionName",
    "operationRole",
    "line",
    "candidateRoles",
    "candidateTokens",
    "bridgeStatuses",
    "semanticCalls",
    "sourceFile",
    "valueType",
    "baseExpr",
    "fieldOffset",
    "valueExpr",
    "callbackLocal",
    "callbackFunction",
    "vcallOffset",
    "tokensInLine",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, candidateRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentStateWriteChain({
    candidatesPath: optionValue(args, "--candidates", defaultCandidatesPath),
    eventBridgePath: optionValue(args, "--event-bridge", defaultEventBridgePath),
    effectAliasBridgePath: optionValue(args, "--effect-alias-bridge", defaultEffectAliasBridgePath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildFunctionContexts,
  buildNativeAttachmentStateWriteRows,
  callbackLocals,
  directWrite,
  exportNativeAttachmentStateWriteChain,
  operationRows,
};
