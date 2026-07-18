#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultCallbackPath = "extracted/reports/native_attachment_callback_chain.tsv";
const defaultVisualBindingPath = "extracted/reports/native_visual_binding_candidates.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_helper_call_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_helper_call_chain_summary.json";
const defaultHelperFunctions = ["FUN_00d59f54", "FUN_1003dfe60"];

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

function readOptionalTsv(filePath) {
  return fs.existsSync(filePath) ? readTsv(filePath) : [];
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

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
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

function relevantTokens(text) {
  return stringsInText(text).filter(
    (token) =>
      /^(Ability|Bone|Buff|Effect|Sound)_/.test(token) ||
      token === "AbilityCAttachPoint" ||
      token === "ActorBase",
  );
}

function relevantTokenValues(values) {
  return values.filter(
    (token) =>
      /^(Ability|Bone|Buff|Effect|Sound)_/.test(token) ||
      token === "AbilityCAttachPoint" ||
      token === "ActorBase",
  );
}

function normalizeExpr(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function splitArgs(argsText) {
  const args = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < argsText.length; index += 1) {
    const char = argsText[index];
    if (quote) {
      current += char;
      if (char === quote && argsText[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(normalizeExpr(current));
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(normalizeExpr(current));
  return args;
}

function findClosingParen(text, openIndex) {
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function lineAt(lines, oneBasedLine) {
  return lines[Math.max(0, oneBasedLine - 1)] || "";
}

function contextAround(lines, oneBasedLine, radius = 3) {
  const start = Math.max(0, oneBasedLine - 1 - radius);
  const end = Math.min(lines.length, oneBasedLine + radius);
  return lines.slice(start, end).join("\n");
}

function resultTargetFromLine(line, helperFunction) {
  const escapedHelper = helperFunction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`^\\s*([A-Za-z_][\\w]*(?:\\[[^\\]]+\\])?)\\s*=\\s*(?:\\([^)]*\\)\\s*)?${escapedHelper}\\s*\\(`));
  return match?.[1] || "";
}

function resultUseLines(lines, oneBasedLine, resultTarget, radius = 8) {
  if (!resultTarget) return [];
  const baseName = resultTarget.replace(/\[[^\]]+\]$/, "");
  const targetPattern = new RegExp(`\\b${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const uses = [];
  const start = oneBasedLine;
  const end = Math.min(lines.length, oneBasedLine + radius);
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (targetPattern.test(line)) uses.push(normalizeExpr(line));
  }
  return uses;
}

function platformForHelper(row, helperFunction) {
  if (helperFunction === "FUN_00d59f54") return "android";
  if (helperFunction === "FUN_1003dfe60") return "ios";
  return String(row.parentFunctions || "").match(/\b(android|ios):/)?.[1] || "";
}

function buildVisualBindingIndex(visualBindingRows) {
  const index = new Map();
  for (const row of visualBindingRows) {
    const key = `${row.platform}:${row.functionName}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function visualTokensForParentFunctions(parentFunctions, visualBindingIndex) {
  return uniqueInOrder(
    String(parentFunctions || "")
      .split("|")
      .flatMap((key) => visualBindingIndex.get(key) || [])
      .flatMap((row) => relevantTokenValues(String(row.stringSamples || "").split("|"))),
  );
}

function helperCallsInBlock(block, helperFunctions = defaultHelperFunctions) {
  const helperPattern = helperFunctions.map((helper) => helper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const callRegex = new RegExp(`\\b(${helperPattern})\\s*\\(`, "g");
  const calls = [];
  const lines = block.text.split(/\r?\n/);
  let match;
  while ((match = callRegex.exec(block.text))) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const closeIndex = findClosingParen(block.text, openIndex);
    if (closeIndex < 0) continue;
    const args = splitArgs(block.text.slice(openIndex + 1, closeIndex));
    const relativeLine = lineNumberForIndex(block.text, match.index);
    const sourceLine = block.startLine + relativeLine - 1;
    const lineText = lineAt(lines, relativeLine);
    const contextText = contextAround(lines, relativeLine);
    const resultTarget = resultTargetFromLine(lineText, match[1]);
    calls.push({
      helperFunction: match[1],
      line: sourceLine,
      subjectExpr: args[0] || "",
      groupArg: args[1] || "",
      indexArg: args[2] || "",
      kindArg: args[3] || "",
      flagArg: args[4] || "",
      argCount: args.length,
      argKey: args.length >= 5 ? [args[1], args[2], args[3], args[4]].map(normalizeExpr).join(":") : "",
      resultTarget,
      resultUseLines: resultUseLines(lines, relativeLine, resultTarget).join(" || "),
      lineTokens: relevantTokens(lineText).join("|"),
      nearbyTokens: relevantTokens(contextText).join("|"),
      lineText: normalizeExpr(lineText),
    });
    callRegex.lastIndex = closeIndex + 1;
  }
  return calls;
}

function blockForFunction(sourceText, functionName) {
  return findFunctionBlocks(sourceText.split(/\r?\n/)).find((block) => block.functionName === functionName);
}

function buildNativeAttachmentHelperCallRows(
  callbackRows,
  helperFunctions = defaultHelperFunctions,
  sourceReader = (filePath) => fs.readFileSync(filePath, "utf8"),
  visualBindingRows = [],
) {
  const sourceCache = new Map();
  const visualBindingIndex = buildVisualBindingIndex(visualBindingRows);
  const rows = [];

  for (const callbackRow of callbackRows) {
    if (callbackRow.callbackFound !== "yes" || !callbackRow.callbackSourceFile || !callbackRow.callbackFunction) continue;
    const helperCallList = String(callbackRow.helperCalls || "").split("|");
    if (!helperFunctions.some((helper) => helperCallList.includes(helper))) continue;

    if (!sourceCache.has(callbackRow.callbackSourceFile)) {
      sourceCache.set(callbackRow.callbackSourceFile, sourceReader(callbackRow.callbackSourceFile));
    }
    const block = blockForFunction(sourceCache.get(callbackRow.callbackSourceFile), callbackRow.callbackFunction);
    if (!block) continue;

    for (const call of helperCallsInBlock(block, helperFunctions)) {
      const visualParentTokens = visualTokensForParentFunctions(callbackRow.parentFunctions, visualBindingIndex);
      const combinedParentTokens = uniqueInOrder([
        ...String(callbackRow.parentTokens || "").split("|").filter(Boolean),
        ...visualParentTokens,
      ]);
      rows.push({
        platform: platformForHelper(callbackRow, call.helperFunction),
        callbackFunction: callbackRow.callbackFunction,
        callbackSourceFile: callbackRow.callbackSourceFile,
        line: call.line,
        helperFunction: call.helperFunction,
        helperFamily: "indexed-runtime-helper",
        subjectExpr: call.subjectExpr,
        groupArg: call.groupArg,
        indexArg: call.indexArg,
        kindArg: call.kindArg,
        flagArg: call.flagArg,
        argCount: call.argCount,
        argKey: call.argKey,
        resultTarget: call.resultTarget,
        resultUseLines: call.resultUseLines,
        parentFunctions: callbackRow.parentFunctions,
        parentTokens: callbackRow.parentTokens,
        visualParentTokens: visualParentTokens.join("|"),
        combinedParentTokens: combinedParentTokens.join("|"),
        parentRoles: callbackRow.parentRoles,
        parentOperationRoles: callbackRow.parentOperationRoles,
        parentBridgeStatuses: callbackRow.parentBridgeStatuses,
        registrationVcallOffsets: callbackRow.registrationVcallOffsets,
        callbackTokens: callbackRow.callbackTokens,
        callbackOperationRoles: callbackRow.callbackOperationRoles,
        callbackFieldOffsets: callbackRow.callbackFieldOffsets,
        callbackVcallOffsets: callbackRow.callbackVcallOffsets,
        lineTokens: call.lineTokens,
        nearbyTokens: call.nearbyTokens,
        lineText: call.lineText,
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.callbackFunction !== right.callbackFunction) return left.callbackFunction.localeCompare(right.callbackFunction);
    return Number(left.line) - Number(right.line);
  });
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function summarize(rows, callbackRows) {
  const byPlatform = {};
  const byHelperFunction = {};
  const byArgKey = {};
  const byParentRole = {};
  const byParentToken = {};
  for (const row of rows) {
    increment(byPlatform, row.platform);
    increment(byHelperFunction, row.helperFunction);
    increment(byArgKey, row.argKey);
    for (const role of String(row.parentRoles || "").split("|").filter(Boolean)) increment(byParentRole, role);
    for (const token of String(row.parentTokens || "").split("|").filter(Boolean)) increment(byParentToken, token);
  }
  return {
    callbackRows: callbackRows.length,
    rows: rows.length,
    callbacksWithHelperRows: uniq(rows.map((row) => row.callbackFunction)).length,
    parentTokenCount: Object.keys(byParentToken).length,
    byPlatform,
    byHelperFunction,
    byArgKey,
    byParentRole,
    topParentTokens: Object.entries(byParentToken)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 40)
      .map(([token, count]) => ({ token, count })),
  };
}

function exportNativeAttachmentHelperCallChain({
  callbackPath = defaultCallbackPath,
  visualBindingPath = defaultVisualBindingPath,
  helperFunctions = defaultHelperFunctions,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const callbackRows = readTsv(callbackPath);
  const visualBindingRows = readOptionalTsv(visualBindingPath);
  const rows = buildNativeAttachmentHelperCallRows(callbackRows, helperFunctions, undefined, visualBindingRows);
  const columns = [
    "platform",
    "callbackFunction",
    "callbackSourceFile",
    "line",
    "helperFunction",
    "helperFamily",
    "subjectExpr",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "argCount",
    "argKey",
    "resultTarget",
    "resultUseLines",
    "parentFunctions",
    "parentTokens",
    "visualParentTokens",
    "combinedParentTokens",
    "parentRoles",
    "parentOperationRoles",
    "parentBridgeStatuses",
    "registrationVcallOffsets",
    "callbackTokens",
    "callbackOperationRoles",
    "callbackFieldOffsets",
    "callbackVcallOffsets",
    "lineTokens",
    "nearbyTokens",
    "lineText",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, callbackRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentHelperCallChain({
    callbackPath: optionValue(args, "--callbacks", defaultCallbackPath),
    visualBindingPath: optionValue(args, "--visual-bindings", defaultVisualBindingPath),
    helperFunctions: optionValues(args, "--helper", defaultHelperFunctions),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeAttachmentHelperCallRows,
  exportNativeAttachmentHelperCallChain,
  buildVisualBindingIndex,
  helperCallsInBlock,
  resultTargetFromLine,
  resultUseLines,
  splitArgs,
  summarize,
};
