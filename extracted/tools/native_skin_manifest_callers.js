#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_skin_manifest_callers.tsv";
const defaultJsonOut = "extracted/reports/native_skin_manifest_caller_context.json";

const defaultGetterSpecs = [
  { platform: "android", functionName: "FUN_00cc7618", lookupKind: "skin-entry-by-internal-name" },
  { platform: "android", functionName: "FUN_00cc767c", lookupKind: "skin-entry-by-hash" },
  { platform: "android", functionName: "FUN_00cc771c", lookupKind: "skin-entry-from-card-string" },
  { platform: "android", functionName: "FUN_00cc7868", lookupKind: "default-skin-entry-by-model-name" },
  { platform: "ios", functionName: "FUN_10032bbf4", lookupKind: "skin-entry-by-internal-name" },
  { platform: "ios", functionName: "FUN_10032bc58", lookupKind: "skin-entry-by-hash" },
  { platform: "ios", functionName: "FUN_10032bcd0", lookupKind: "skin-entry-from-card-string" },
  { platform: "ios", functionName: "FUN_10032bdf8", lookupKind: "default-skin-entry-by-model-name" },
];

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

function parseGetterSpecs(text) {
  if (!text) return defaultGetterSpecs;
  return text.split(",").map((item) => {
    const [functionName, lookupKind = "skin-manifest-getter"] = item.split(":");
    return { platform: "", functionName: functionName.trim(), lookupKind: lookupKind.trim() };
  });
}

function parseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = text.startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function hex(value) {
  if (!Number.isFinite(value)) return "";
  return `0x${value.toString(16)}`;
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

function contextHash(text) {
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
}

function contextAroundLine(lines, lineNumber, radius = 10) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join("\n");
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function lineForBlockMatch(block, matchIndex) {
  return block.startLine + block.text.slice(0, matchIndex).split(/\r?\n/).length - 1;
}

function inferAssignedVar(blockText, callIndex, getterName) {
  const lineStart = blockText.lastIndexOf("\n", callIndex) + 1;
  const beforeCallOnLine = blockText.slice(lineStart, callIndex);
  const assignment = beforeCallOnLine.match(/(?:^|[^\w])(?<var>[A-Za-z_]\w*)\s*=\s*(?:\([^)]+\)\s*)?$/);
  if (assignment?.groups?.var) return assignment.groups.var;

  const callEnd = blockText.indexOf(";", callIndex);
  const callLine = blockText.slice(lineStart, callEnd >= 0 ? callEnd : callIndex + getterName.length + 80);
  const nestedAssignment = callLine.match(/(?<var>[A-Za-z_]\w*)\s*=\s*[^;\n]*\b/);
  return nestedAssignment?.groups?.var || "";
}

function fieldOffsetsForVar(blockText, varName, callIndex) {
  if (!varName) return [];
  const tail = blockText.slice(callIndex);
  const offsets = new Set();
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pointerPattern = new RegExp(`\\*\\s*\\([^)]+\\*\\)\\s*\\([^)]*\\b${escapedVar}\\s*\\+\\s*(0x[0-9a-fA-F]+|\\d+)`, "g");
  for (const match of tail.matchAll(pointerPattern)) {
    offsets.add(hex(parseNumber(match[1])));
  }

  const arrayPattern = new RegExp(`\\b${escapedVar}\\[(\\d+)\\]`, "g");
  for (const match of tail.matchAll(arrayPattern)) {
    offsets.add(hex(Number.parseInt(match[1], 10) * 8));
  }

  if (new RegExp(`\\*\\s*${escapedVar}\\b`).test(tail)) offsets.add("0x0");
  return [...offsets].filter(Boolean).sort((left, right) => parseNumber(left) - parseNumber(right));
}

function extractSkinManifestCallersFromSource({ sourceFile, sourceText, getterSpecs = defaultGetterSpecs } = {}) {
  const platform = sourcePlatform(sourceFile);
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];
  const specs = getterSpecs.filter((spec) => !spec.platform || !platform || spec.platform === platform);

  for (const block of blocks) {
    for (const spec of specs) {
      const pattern = new RegExp(`\\b${spec.functionName}\\s*\\(`, "g");
      for (const match of block.text.matchAll(pattern)) {
        const line = lineForBlockMatch(block, match.index);
        const context = contextAroundLine(lines, line);
        const assignedVar = inferAssignedVar(block.text, match.index, spec.functionName);
        const consumedOffsets = fieldOffsetsForVar(block.text, assignedVar, match.index);
        const strings = quotedStrings(context);
        rows.push({
          platform,
          sourceFile,
          callerFunction: block.functionName,
          line,
          getterFunction: spec.functionName,
          lookupKind: spec.lookupKind,
          assignedVar,
          consumedOffsets: consumedOffsets.join("|"),
          stringLiterals: strings.slice(0, 10).join("|"),
          hasBuildResource: /build:\/\//.test(context) ? "yes" : "no",
          hasSkinManifestText: /SkinManifest|SkinEntry|getSkinManifest|KindredSkinManifest/.test(context) ? "yes" : "no",
          contextHash: contextHash(context),
          context,
        });
      }
    }
  }

  return rows.sort((left, right) => left.line - right.line || left.getterFunction.localeCompare(right.getterFunction));
}

function summarize(rows, files) {
  const byGetter = {};
  const byLookupKind = {};
  const consumedOffsetCounts = {};
  for (const row of rows) {
    byGetter[row.getterFunction] = (byGetter[row.getterFunction] || 0) + 1;
    byLookupKind[row.lookupKind] = (byLookupKind[row.lookupKind] || 0) + 1;
    for (const offset of row.consumedOffsets.split("|").filter(Boolean)) {
      consumedOffsetCounts[offset] = (consumedOffsetCounts[offset] || 0) + 1;
    }
  }
  return {
    files,
    rows: rows.length,
    byGetter,
    byLookupKind,
    consumedOffsetCounts,
  };
}

function exportNativeSkinManifestCallers({
  sourcePaths = defaultSourcePaths,
  getterSpecs = defaultGetterSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractSkinManifestCallersFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
        getterSpecs,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.sourceFile !== right.sourceFile) return left.sourceFile.localeCompare(right.sourceFile);
    return left.line - right.line;
  });

  const columns = [
    "platform",
    "sourceFile",
    "callerFunction",
    "line",
    "getterFunction",
    "lookupKind",
    "assignedVar",
    "consumedOffsets",
    "stringLiterals",
    "hasBuildResource",
    "hasSkinManifestText",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, files.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`,
  );
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeSkinManifestCallers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    getterSpecs: parseGetterSpecs(optionValue(args, "--getters", "")),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultGetterSpecs,
  exportNativeSkinManifestCallers,
  extractSkinManifestCallersFromSource,
  fieldOffsetsForVar,
  inferAssignedVar,
};
