#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");
const { directWrite, operationRows } = require("./native_attachment_state_write_chain");

const defaultStateWritePath = "extracted/reports/native_attachment_state_write_chain.tsv";
const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_callback_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_callback_chain_summary.json";

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

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function symbolStrings(text) {
  return [...text.matchAll(/\bPTR_s_([A-Za-z0-9_]+)_[0-9a-fA-F]+\b/g)].map((match) => match[1]);
}

function stringsInText(text) {
  return uniq([...quotedStrings(text), ...symbolStrings(text)]);
}

function directCallNames(text) {
  return uniq(
    [...text.matchAll(/\b(?:thunk_)?FUN_[0-9a-fA-F]+\s*\(/g)]
      .map((match) => match[0].replace(/\s*\($/, ""))
      .filter((name) => !/^FUN_[0-9a-fA-F]+$/.test(name) || !text.startsWith(`${name}(`)),
  );
}

function vcallOffsets(text) {
  return uniq([...text.matchAll(/\+\s*(0x[0-9a-fA-F]+)\)\)\(/g)].map((match) => match[1].toLowerCase()));
}

function callbackFunctionsFromStateRows(stateRows) {
  const callbacks = [];
  for (const row of stateRows) {
    if (row.callbackFunction) callbacks.push(row.callbackFunction);
    const functionPointer = String(row.valueExpr || "").match(/\b(?:thunk_)?FUN_[0-9a-fA-F]+\b/)?.[0];
    if (row.operationRole === "function-pointer-field-write" && functionPointer) callbacks.push(functionPointer);
  }
  return uniq(callbacks);
}

function callbackParentContexts(stateRows) {
  const byCallback = new Map();
  for (const row of stateRows) {
    const callbacks = [];
    if (row.callbackFunction) callbacks.push(row.callbackFunction);
    const functionPointer = String(row.valueExpr || "").match(/\b(?:thunk_)?FUN_[0-9a-fA-F]+\b/)?.[0];
    if (row.operationRole === "function-pointer-field-write" && functionPointer) callbacks.push(functionPointer);
    for (const callback of callbacks) {
      if (!byCallback.has(callback)) {
        byCallback.set(callback, {
          parentFunctions: [],
          parentTokens: [],
          parentRoles: [],
          parentOperationRoles: [],
          parentBridgeStatuses: [],
          registrationVcallOffsets: [],
        });
      }
      const context = byCallback.get(callback);
      context.parentFunctions.push(`${row.platform}:${row.functionName}`);
      context.parentTokens.push(...String(row.candidateTokens || "").split("|"));
      context.parentRoles.push(...String(row.candidateRoles || "").split("|"));
      context.parentOperationRoles.push(row.operationRole);
      context.parentBridgeStatuses.push(...String(row.bridgeStatuses || "").split("|"));
      context.registrationVcallOffsets.push(row.vcallOffset);
    }
  }
  return byCallback;
}

function findCallbackBlocks(callbacks, sourcePaths = defaultSourcePaths) {
  const wanted = new Set(callbacks);
  const found = new Map();
  for (const filePath of collectCFiles(sourcePaths)) {
    if (!wanted.size) break;
    const text = fs.readFileSync(filePath, "utf8");
    if (![...wanted].some((name) => text.includes(name))) continue;
    const blocks = findFunctionBlocks(text.split(/\r?\n/));
    for (const block of blocks) {
      if (!wanted.has(block.functionName)) continue;
      found.set(block.functionName, { ...block, sourceFile: filePath });
      wanted.delete(block.functionName);
    }
  }
  return found;
}

function directWritesInBlock(blockText) {
  return blockText
    .split(/\r?\n/)
    .map(directWrite)
    .filter(Boolean);
}

function analyzeCallbackBlock(block) {
  const operationEvidence = operationRows(block);
  const writes = directWritesInBlock(block.text);
  const operationRoles = uniq(operationEvidence.map((row) => row.operationRole));
  const fieldOffsets = uniq(writes.map((write) => write.fieldOffset));
  const tokens = stringsInText(block.text).filter(
    (token) =>
      /^(Ability|Bone|Buff|Effect|Sound)_/.test(token) ||
      token === "AbilityCAttachPoint" ||
      token === "ActorBase",
  );

  return {
    callbackOperationRoles: operationRoles,
    callbackFieldOffsets: fieldOffsets,
    callbackVcallOffsets: vcallOffsets(block.text),
    callbackTokens: tokens,
    helperCalls: directCallNames(block.text).filter((name) => name !== block.functionName),
    writeCount: writes.length,
  };
}

function buildNativeAttachmentCallbackRows(stateRows, sourcePaths = defaultSourcePaths) {
  const callbacks = callbackFunctionsFromStateRows(stateRows);
  const parentsByCallback = callbackParentContexts(stateRows);
  const blocksByCallback = findCallbackBlocks(callbacks, sourcePaths);

  return callbacks.map((callbackFunction) => {
    const parent = parentsByCallback.get(callbackFunction) || {};
    const block = blocksByCallback.get(callbackFunction);
    const analysis = block
      ? analyzeCallbackBlock(block)
      : {
          callbackOperationRoles: [],
          callbackFieldOffsets: [],
          callbackVcallOffsets: [],
          callbackTokens: [],
          helperCalls: [],
          writeCount: 0,
        };
    return {
      callbackFunction,
      callbackFound: block ? "yes" : "no",
      callbackSourceFile: block?.sourceFile || "",
      callbackStartLine: block?.startLine || "",
      parentFunctions: uniq(parent.parentFunctions || []).join("|"),
      parentTokens: uniq(parent.parentTokens || []).join("|"),
      parentRoles: uniq(parent.parentRoles || []).join("|"),
      parentOperationRoles: uniq(parent.parentOperationRoles || []).join("|"),
      parentBridgeStatuses: uniq(parent.parentBridgeStatuses || []).join("|"),
      registrationVcallOffsets: uniq(parent.registrationVcallOffsets || []).join("|"),
      callbackOperationRoles: analysis.callbackOperationRoles.join("|"),
      callbackFieldOffsets: analysis.callbackFieldOffsets.join("|"),
      callbackVcallOffsets: analysis.callbackVcallOffsets.join("|"),
      callbackTokens: analysis.callbackTokens.join("|"),
      helperCalls: analysis.helperCalls.join("|"),
      writeCount: analysis.writeCount,
    };
  });
}

function summarize(rows, stateRows) {
  const byFound = {};
  const byParentOperationRole = {};
  const byCallbackOperationRole = {};
  for (const row of rows) {
    byFound[row.callbackFound] = (byFound[row.callbackFound] || 0) + 1;
    for (const role of String(row.parentOperationRoles || "").split("|").filter(Boolean)) {
      byParentOperationRole[role] = (byParentOperationRole[role] || 0) + 1;
    }
    for (const role of String(row.callbackOperationRoles || "").split("|").filter(Boolean)) {
      byCallbackOperationRole[role] = (byCallbackOperationRole[role] || 0) + 1;
    }
  }
  return {
    stateRows: stateRows.length,
    callbacks: rows.length,
    byFound,
    callbacksWithWrites: rows.filter((row) => Number(row.writeCount) > 0).length,
    byParentOperationRole,
    byCallbackOperationRole,
    unresolvedCallbacks: rows.filter((row) => row.callbackFound !== "yes").map((row) => row.callbackFunction),
  };
}

function exportNativeAttachmentCallbackChain({
  stateWritePath = defaultStateWritePath,
  sourcePaths = defaultSourcePaths,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const stateRows = readTsv(stateWritePath);
  const rows = buildNativeAttachmentCallbackRows(stateRows, sourcePaths);
  const columns = [
    "callbackFunction",
    "callbackFound",
    "callbackSourceFile",
    "callbackStartLine",
    "parentFunctions",
    "parentTokens",
    "parentRoles",
    "parentOperationRoles",
    "parentBridgeStatuses",
    "registrationVcallOffsets",
    "callbackOperationRoles",
    "callbackFieldOffsets",
    "callbackVcallOffsets",
    "callbackTokens",
    "helperCalls",
    "writeCount",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, stateRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentCallbackChain({
    stateWritePath: optionValue(args, "--state-writes", defaultStateWritePath),
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  analyzeCallbackBlock,
  buildNativeAttachmentCallbackRows,
  callbackFunctionsFromStateRows,
  callbackParentContexts,
  exportNativeAttachmentCallbackChain,
  findCallbackBlocks,
};
