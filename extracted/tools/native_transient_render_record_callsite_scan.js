#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSources = [
  {
    platform: "android",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
  },
  {
    platform: "ios",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  },
];
const defaultViewerOut = "extracted/viewer/native-transient-render-record-callsite-scan.json";
const defaultTsvOut = "extracted/reports/native_transient_render_record_callsite_scan.tsv";
const defaultJsonOut = "extracted/reports/native_transient_render_record_callsite_scan_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function optionValues(args, name, fallback) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.length ? values : fallback;
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

function sourceLine(block, localIndex) {
  return block.startLine + localIndex;
}

function nearestStringToken(lines, index, radius = 48) {
  const start = Math.max(0, index - radius);
  for (let cursor = index; cursor >= start; cursor -= 1) {
    const literals = [...String(lines[cursor] || "").matchAll(/"([^"\r\n]+)"/g)].map((match) => match[1]);
    const effectToken = literals.find((literal) => /^Effect_[A-Za-z0-9_]+$/.test(literal));
    if (effectToken) return effectToken;
    const namedToken = literals.find((literal) => /^[A-Za-z0-9_./-]{4,}$/.test(literal) && !literal.includes("%"));
    if (namedToken) return namedToken;
  }
  return "";
}

function compactLine(text) {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function directFieldWrites(lines, startIndex, recordVar, maxLines = 48) {
  const rows = [];
  const pattern = new RegExp(`\\*\\([^)]*\\*\\)\\s*\\(\\s*${recordVar}\\s*\\+\\s*(0x[0-9a-fA-F]+|\\d+)\\s*\\)\\s*=\\s*(.*);`);
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + maxLines); index += 1) {
    const text = lines[index];
    if (index > startIndex + 1 && /\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*FUN_10000ed74\(\);/.test(text)) break;
    const match = String(text || "").match(pattern);
    if (!match) continue;
    rows.push({
      field: hexOffset(match[1]),
      value: match[2].trim(),
      lineOffset: index,
      sample: compactLine(text),
    });
  }
  return rows;
}

function helperKind(functionName, args) {
  if (functionName === "FUN_00cf5460" && args.length === 7) return "shape-record-size-flags";
  if (functionName === "FUN_00cf5504" && args.length === 7) return "shape-record-callback-flags";
  if (functionName === "FUN_00cf5460") return "shape-record-size-flags-arity-unresolved";
  if (functionName === "FUN_00cf5504") return "shape-record-callback-flags-arity-unresolved";
  return "";
}

function androidCallsiteRows({ sourceFile, block }) {
  const lines = block.text.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const constructorMatch = lines[index].match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_00cfaf84\s*\(/);
    if (!constructorMatch) continue;
    const recordVar = constructorMatch[1];
    const helper = lines.slice(index + 1, index + 16).reduce((found, line, offset) => {
      if (found) return found;
      const match = line.match(/\b(FUN_00cf5460|FUN_00cf5504)\s*\((.*)\)\s*;/);
      if (!match) return null;
      return {
        functionName: match[1],
        args: splitArgs(match[2]),
        localIndex: index + 1 + offset,
        sample: compactLine(line),
      };
    }, null);
    const effectToken = nearestStringToken(lines, index);
    const args = helper?.args || [];
    rows.push({
      id: `android:${sourceFile}:${block.functionName}:${sourceLine(block, index)}`,
      platform: "android",
      sourceFile,
      sourceFunction: block.functionName,
      sourceLine: sourceLine(block, index),
      effectToken,
      constructorFunction: "FUN_00cfaf84",
      recordVar,
      helperFunction: helper?.functionName || "",
      helperLine: helper ? sourceLine(block, helper.localIndex) : "",
      helperArgCount: args.length,
      helperKind: helperKind(helper?.functionName || "", args),
      helperArgs: args,
      fieldSignature: helper ? `${helper.functionName}:${helperKind(helper.functionName, args)}` : "no-helper-in-window",
      directWriteFields: [],
      sample: helper?.sample || compactLine(lines[index]),
      renderTakeoverStatus: "blocked-callsite-shape-only",
    });
  }
  return rows;
}

function iosCallsiteRows({ sourceFile, block }) {
  const lines = block.text.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const constructorMatch = lines[index].match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_10000ed74\(\);/);
    if (!constructorMatch) continue;
    const recordVar = constructorMatch[1];
    const writes = directFieldWrites(lines, index, recordVar);
    const fields = unique(writes.map((write) => write.field)).sort((a, b) => Number.parseInt(a.slice(2), 16) - Number.parseInt(b.slice(2), 16));
    const effectToken = nearestStringToken(lines, index);
    rows.push({
      id: `ios:${sourceFile}:${block.functionName}:${sourceLine(block, index)}`,
      platform: "ios",
      sourceFile,
      sourceFunction: block.functionName,
      sourceLine: sourceLine(block, index),
      effectToken,
      constructorFunction: "FUN_10000ed74",
      recordVar,
      helperFunction: "",
      helperLine: "",
      helperArgCount: "",
      helperKind: "",
      helperArgs: [],
      fieldSignature: fields.length ? fields.join("|") : "no-direct-field-writes-in-window",
      directWriteFields: fields,
      sample: writes[0]?.sample || compactLine(lines[index]),
      renderTakeoverStatus: "blocked-callsite-shape-only",
    });
  }
  return rows;
}

function scanSource({ platform, sourcePath }) {
  const rows = [];
  for (const sourceFile of collectCFiles([sourcePath])) {
    const sourceText = fs.readFileSync(sourceFile, "utf8");
    const blocks = findFunctionBlocks(sourceText.split(/\r?\n/));
    for (const block of blocks) {
      if (platform === "android" && !block.text.includes("FUN_00cfaf84(")) continue;
      if (platform === "ios" && !block.text.includes("FUN_10000ed74(")) continue;
      if (["FUN_00cfaf84", "FUN_00cf5460", "FUN_00cf5504", "FUN_10000ed74"].includes(block.functionName)) continue;
      if (platform === "android") rows.push(...androidCallsiteRows({ sourceFile, block }));
      else rows.push(...iosCallsiteRows({ sourceFile, block }));
    }
  }
  return rows;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [row[key]];
    for (const value of values.length ? values : [""]) counts[value || ""] = (counts[value || ""] || 0) + 1;
  }
  return counts;
}

function summarize(rows) {
  const nonEmptyTokens = rows.filter((row) => row.effectToken).length;
  return {
    rows: rows.length,
    nonEmptyEffectTokenRows: nonEmptyTokens,
    uniqueEffectTokens: unique(rows.map((row) => row.effectToken)).length,
    androidRows: rows.filter((row) => row.platform === "android").length,
    iosRows: rows.filter((row) => row.platform === "ios").length,
    androidHelper5460Rows: rows.filter((row) => row.helperFunction === "FUN_00cf5460").length,
    androidHelper5504Rows: rows.filter((row) => row.helperFunction === "FUN_00cf5504").length,
    androidNoHelperRows: rows.filter((row) => row.platform === "android" && !row.helperFunction).length,
    iosDirectWriteRows: rows.filter((row) => row.platform === "ios" && row.directWriteFields.length).length,
    iosNoDirectWriteRows: rows.filter((row) => row.platform === "ios" && !row.directWriteFields.length).length,
    renderTakeoverAllowedRows: 0,
    byPlatform: countBy(rows, "platform"),
    byHelperFunction: countBy(rows, "helperFunction"),
    byHelperKind: countBy(rows, "helperKind"),
    byFieldSignature: countBy(rows, "fieldSignature"),
    byRenderTakeoverStatus: countBy(rows, "renderTakeoverStatus"),
  };
}

function buildNativeTransientRenderRecordCallsiteScan({ sources = defaultSources } = {}, generatedAt = new Date().toISOString()) {
  const rows = sources.flatMap((source) => scanSource(source));
  return { generatedAt, summary: summarize(rows), items: rows };
}

function exportNativeTransientRenderRecordCallsiteScan({
  sources = defaultSources,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = buildNativeTransientRenderRecordCallsiteScan({ sources });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "platform",
    "effectToken",
    "sourceFile",
    "sourceFunction",
    "sourceLine",
    "constructorFunction",
    "recordVar",
    "helperFunction",
    "helperLine",
    "helperArgCount",
    "helperKind",
    "helperArgs",
    "fieldSignature",
    "directWriteFields",
    "sample",
    "renderTakeoverStatus",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const sourcePaths = optionValues(args, "--source", []);
  const sources = sourcePaths.length ? sourcePaths.map((sourcePath) => ({ platform: sourcePath.includes("android") ? "android" : "ios", sourcePath })) : defaultSources;
  const summary = exportNativeTransientRenderRecordCallsiteScan({
    sources,
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeTransientRenderRecordCallsiteScan,
  exportNativeTransientRenderRecordCallsiteScan,
};
