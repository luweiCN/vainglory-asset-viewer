#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultChainPath = "extracted/viewer/native-transient-effect-primitive-chain.json";
const defaultViewerOut = "extracted/viewer/native-transient-render-record-schema.json";
const defaultTsvOut = "extracted/reports/native_transient_render_record_schema.tsv";
const defaultJsonOut = "extracted/reports/native_transient_render_record_schema_summary.json";

const androidHelperSource =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00cf5.c";
const iosConstructorSource = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1003c.c";

const androidHelperOperations = [
  {
    helperFunction: "FUN_00cf5460",
    targetField: "0x20",
    targetRangeStart: 0x20,
    targetRangeEnd: 0x20,
    operation: "copy-byte",
    sourceExpressionTemplate: "{shapeArg}+0x10",
    helperPattern: /\*\(undefined1 \*\)\(param_2 \+ 0x20\) = \*\(undefined1 \*\)\(param_3 \+ 0x10\);/,
  },
  {
    helperFunction: "FUN_00cf5460",
    targetField: "0x18",
    targetRangeStart: 0x18,
    targetRangeEnd: 0x1f,
    operation: "copy-u64",
    sourceExpressionTemplate: "{shapeArg}+0x8",
    helperPattern: /\*\(undefined8 \*\)\(param_2 \+ 0x18\) = \*\(undefined8 \*\)\(param_3 \+ 8\);/,
  },
  {
    helperFunction: "FUN_00cf5460",
    targetField: "0x24..0x6a",
    targetRangeStart: 0x24,
    targetRangeEnd: 0x6a,
    operation: "memcpy-0x47",
    sourceExpressionTemplate: "{shapeArg}+0x14..+0x5a",
    helperPattern: /memcpy\(\(void \*\)\(param_2 \+ 0x24\),\(void \*\)\(param_3 \+ 0x14\),0x47\);/,
  },
  {
    helperFunction: "FUN_00cf5460",
    targetField: "0xa4",
    targetRangeStart: 0xa4,
    targetRangeEnd: 0xa7,
    operation: "copy-scalar-arg0",
    sourceExpressionTemplate: "{sizeArg}",
    helperPattern: /\*\(undefined4 \*\)\(param_2 \+ 0xa4\) = param_1;/,
  },
  {
    helperFunction: "FUN_00cf5460",
    targetField: "0xa8",
    targetRangeStart: 0xa8,
    targetRangeEnd: 0xa8,
    operation: "pack-flags-low-nibble",
    sourceExpressionTemplate: "flags({flagA},{flagB},{runtimeFlag},{flagC})",
    helperPattern: /\*\(byte \*\)\(param_2 \+ 0xa8\) =/,
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tsvEscape(value) {
  if (Array.isArray(value)) return value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function hexOffset(value) {
  const raw = String(value || "").trim();
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return `0x${Number.parseInt(raw.slice(2), 16).toString(16)}`;
  if (/^\d+$/.test(raw)) return `0x${Number.parseInt(raw, 10).toString(16)}`;
  return raw;
}

function hexNumber(value) {
  const normalized = hexOffset(value);
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return NaN;
  return Number.parseInt(normalized.slice(2), 16);
}

function loadFunctionBlock(sourceFile, functionName) {
  if (!sourceFile || !functionName || !fs.existsSync(sourceFile)) return null;
  const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/);
  const block = findFunctionBlocks(lines).find((item) => item.functionName === functionName);
  return block ? { ...block, lines } : null;
}

function lineOffset(block, sourceLine) {
  const relative = Number(sourceLine) - Number(block.startLine);
  if (!Number.isFinite(relative)) return -1;
  return relative >= 0 && relative < block.lines.length ? relative : -1;
}

function linesAfterSourceLine(block, sourceLine, maxLines = 72) {
  const offset = lineOffset(block, sourceLine);
  if (offset < 0) return [];
  const startIndex = Number(block.startLine) - 1 + offset;
  return block.lines.slice(startIndex, startIndex + maxLines).map((text, index) => ({ text, line: startIndex + index + 1 }));
}

function findLine(block, pattern) {
  if (!block) return null;
  const localLines = block.text.split(/\r?\n/);
  for (let index = 0; index < localLines.length; index += 1) {
    if (!pattern.test(localLines[index])) continue;
    return { line: block.startLine + index, text: localLines[index].trim().replace(/\s+/g, " ") };
  }
  return null;
}

function splitArgs(text) {
  const args = [];
  let depth = 0;
  let current = "";
  for (const char of String(text || "")) {
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function applyTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => values[key] || "");
}

function androidHelperEvidenceByOperation() {
  const block = loadFunctionBlock(androidHelperSource, "FUN_00cf5460");
  const evidence = new Map();
  for (const operation of androidHelperOperations) {
    const match = findLine(block, operation.helperPattern);
    if (!match) continue;
    evidence.set(operation.operation, {
      helperSourceFile: androidHelperSource,
      helperFunction: operation.helperFunction,
      helperLine: match.line,
      helperSample: match.text,
    });
  }
  return evidence;
}

function expandAndroidHelperRows(chainRow, sourceCache, helperEvidence) {
  const blockKey = `${chainRow.sourceFile}\t${chainRow.sourceFunction}`;
  if (!sourceCache.has(blockKey)) sourceCache.set(blockKey, loadFunctionBlock(chainRow.sourceFile, chainRow.sourceFunction));
  const block = sourceCache.get(blockKey);
  if (!block) return [];

  const lines = linesAfterSourceLine(block, chainRow.sourceLine);
  const constructorIndex = lines.findIndex((line) => /\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*FUN_00cfaf84\(/.test(line.text));
  if (constructorIndex < 0) return [];
  const constructorLine = lines[constructorIndex];
  const recordVar = constructorLine.text.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_00cfaf84\(/)?.[1] || "";
  const helperLine = lines.slice(constructorIndex + 1).find((line) => /\bFUN_00cf5460\s*\(/.test(line.text));
  if (!helperLine) return [];
  const args = splitArgs(helperLine.text.match(/\bFUN_00cf5460\s*\((.*)\)\s*;/)?.[1] || "");
  if (args.length < 7) return [];

  const values = {
    sizeArg: args[0],
    recordVar,
    shapeArg: args[2],
    flagA: args[3],
    flagB: args[4],
    runtimeFlag: args[5],
    flagC: args[6],
  };

  return androidHelperOperations
    .map((operation) => ({ operation, evidence: helperEvidence.get(operation.operation) }))
    .filter((item) => item.evidence)
    .map(({ operation, evidence }) => ({
      id: `${chainRow.id || chainRow.effectToken}:${operation.targetField}:${operation.operation}`,
      platform: "android",
      effectToken: chainRow.effectToken || "",
      actionKeys: chainRow.actionKeys || [],
      heroNames: chainRow.heroNames || [],
      sourceFile: chainRow.sourceFile || "",
      sourceFunction: chainRow.sourceFunction || "",
      sourceLine: chainRow.sourceLine || "",
      constructorFunction: "FUN_00cfaf84",
      constructorLine: constructorLine.line,
      downstreamHelperFunction: "FUN_00cf5460",
      downstreamHelperCallLine: helperLine.line,
      targetField: operation.targetField,
      targetRangeStart: operation.targetRangeStart,
      targetRangeEnd: operation.targetRangeEnd,
      fieldOperation: operation.operation,
      sourceExpression: applyTemplate(operation.sourceExpressionTemplate, values),
      valueExpression: "",
      evidenceClass: "android-helper-expanded-record-write",
      helperSourceFile: evidence.helperSourceFile,
      helperFunction: evidence.helperFunction,
      helperLine: evidence.helperLine,
      helperSample: evidence.helperSample,
      renderTakeoverStatus: "blocked-transient-record-draw-semantics-unresolved",
    }));
}

function expandIosDirectRows(chainRow, sourceCache) {
  const blockKey = `${chainRow.sourceFile}\t${chainRow.sourceFunction}`;
  if (!sourceCache.has(blockKey)) sourceCache.set(blockKey, loadFunctionBlock(chainRow.sourceFile, chainRow.sourceFunction));
  const block = sourceCache.get(blockKey);
  if (!block) return [];

  const lines = linesAfterSourceLine(block, chainRow.sourceLine);
  const constructorIndex = lines.findIndex((line) => /\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*FUN_10000ed74\(\);/.test(line.text));
  if (constructorIndex < 0) return [];
  const constructorLine = lines[constructorIndex];
  const recordVar = constructorLine.text.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_10000ed74\(\);/)?.[1] || "";
  const rows = [];
  for (const line of lines.slice(constructorIndex + 1)) {
    if (/\bFUN_10000cae4\(|\bFUN_10000bed8\(/.test(line.text)) break;
    const match = line.text.match(
      new RegExp(`\\*\\([^)]*\\*\\)\\s*\\(\\s*${recordVar}\\s*\\+\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)\\s*=\\s*(.*);`),
    );
    if (!match) continue;
    const targetField = hexOffset(match[1]);
    const targetNumber = hexNumber(targetField);
    rows.push({
      id: `${chainRow.id || chainRow.effectToken}:${targetField}:direct-write:${line.line}`,
      platform: "ios",
      effectToken: chainRow.effectToken || "",
      actionKeys: chainRow.actionKeys || [],
      heroNames: chainRow.heroNames || [],
      sourceFile: chainRow.sourceFile || "",
      sourceFunction: chainRow.sourceFunction || "",
      sourceLine: chainRow.sourceLine || "",
      constructorFunction: "FUN_10000ed74",
      constructorLine: constructorLine.line,
      downstreamHelperFunction: "",
      downstreamHelperCallLine: "",
      targetField,
      targetRangeStart: targetNumber,
      targetRangeEnd: targetNumber,
      fieldOperation: "direct-write",
      sourceExpression: "",
      valueExpression: match[2].trim(),
      evidenceClass: "ios-direct-record-write",
      helperSourceFile: "",
      helperFunction: "",
      helperLine: "",
      helperSample: line.text.trim().replace(/\s+/g, " "),
      renderTakeoverStatus: "blocked-transient-record-draw-semantics-unresolved",
    });
  }
  return rows;
}

function rangesOverlap(a, b) {
  return Number.isFinite(a.targetRangeStart) && Number.isFinite(b.targetRangeStart) && a.targetRangeStart <= b.targetRangeEnd && b.targetRangeStart <= a.targetRangeEnd;
}

function addCrossPlatformEvidence(rows) {
  const byToken = new Map();
  for (const row of rows) {
    const tokenRows = byToken.get(row.effectToken) || [];
    tokenRows.push(row);
    byToken.set(row.effectToken, tokenRows);
  }
  for (const row of rows) {
    const peers = (byToken.get(row.effectToken) || []).filter((peer) => peer.platform !== row.platform);
    const matchedPeer = peers.find((peer) => rangesOverlap(row, peer));
    row.crossPlatformEvidence = matchedPeer
      ? `android-ios-record-field-overlap:${matchedPeer.targetField}`
      : peers.length
        ? "android-ios-token-only"
        : "single-platform-only";
  }
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [row[key]];
    for (const value of values.length ? values : [""]) counts[value || ""] = (counts[value || ""] || 0) + 1;
  }
  return counts;
}

function summarize(rows, helperEvidence) {
  return {
    rows: rows.length,
    tokens: unique(rows.map((row) => row.effectToken)).length,
    helperSchemaRows: helperEvidence.size,
    androidHelperExpandedRows: rows.filter((row) => row.evidenceClass === "android-helper-expanded-record-write").length,
    iosDirectWriteRows: rows.filter((row) => row.evidenceClass === "ios-direct-record-write").length,
    crossPlatformMatchedRows: rows.filter((row) => row.crossPlatformEvidence.startsWith("android-ios-record-field-overlap")).length,
    renderTakeoverAllowedRows: 0,
    byPlatform: countBy(rows, "platform"),
    byEvidenceClass: countBy(rows, "evidenceClass"),
    byFieldOperation: countBy(rows, "fieldOperation"),
    byRenderTakeoverStatus: countBy(rows, "renderTakeoverStatus"),
  };
}

function buildNativeTransientRenderRecordSchema({ chainManifest }, generatedAt = new Date().toISOString()) {
  const sourceCache = new Map();
  const helperEvidence = androidHelperEvidenceByOperation();
  const chainRows = Array.isArray(chainManifest?.items) ? chainManifest.items : [];
  const rows = [];
  for (const chainRow of chainRows) {
    const calls = chainRow.postEffectFactoryCalls || [];
    if (chainRow.platform === "android" && calls.includes("FUN_00cfaf84:transient-render-record")) {
      rows.push(...expandAndroidHelperRows(chainRow, sourceCache, helperEvidence));
    }
    if (chainRow.platform === "ios" && calls.includes("FUN_10000ed74:transient-render-record")) {
      rows.push(...expandIosDirectRows(chainRow, sourceCache));
    }
  }
  addCrossPlatformEvidence(rows);
  return { generatedAt, summary: summarize(rows, helperEvidence), items: rows };
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    ...item,
    actionKeys: item.actionKeys || [],
    heroNames: item.heroNames || [],
  }));
}

function exportNativeTransientRenderRecordSchema({
  chainPath = defaultChainPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeTransientRenderRecordSchema({ chainManifest: readJson(chainPath) });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "id",
    "platform",
    "effectToken",
    "actionKeys",
    "heroNames",
    "sourceFile",
    "sourceFunction",
    "sourceLine",
    "constructorFunction",
    "constructorLine",
    "downstreamHelperFunction",
    "downstreamHelperCallLine",
    "targetField",
    "fieldOperation",
    "sourceExpression",
    "valueExpression",
    "evidenceClass",
    "crossPlatformEvidence",
    "helperSourceFile",
    "helperFunction",
    "helperLine",
    "helperSample",
    "renderTakeoverStatus",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeTransientRenderRecordSchema({
    chainPath: optionValue(args, "--chain", defaultChainPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeTransientRenderRecordSchema,
  exportNativeTransientRenderRecordSchema,
};
