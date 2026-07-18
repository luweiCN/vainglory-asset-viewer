#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_bone_query_xrefs.tsv";
const defaultJsonOut = "extracted/reports/native_bone_query_context.json";

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

function contextAroundLine(lines, lineNumber, radius = 8) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join("\n");
}

function uniqueJoin(values) {
  return [...new Set(values.filter(Boolean))].join("|");
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function nearbyNamedStrings(lines, lineNumber, prefix, radius = 6) {
  const context = contextAroundLine(lines, lineNumber, radius);
  return quotedStrings(context).filter((value) => value.startsWith(prefix));
}

function extractNativeBoneQueryXrefsFromSource({ sourceFile, sourceText }) {
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];
  const queryPattern = /\(\*\*\(code \*\*\)\(\*[^)\n;]+\+\s*(0x[0-9a-fA-F]+)\)\)\([^;\n]*"((?:Bone_)[^"]+)"\s*\)/g;

  for (const block of blocks) {
    for (const match of block.text.matchAll(queryPattern)) {
      const blockPrefix = block.text.slice(0, match.index);
      const line = block.startLine + blockPrefix.split(/\r?\n/).length - 1;
      const context = contextAroundLine(lines, line);
      rows.push({
        sourceFile,
        functionName: block.functionName,
        line,
        accessorOffset: match[1],
        boneName: match[2],
        nearbyEffects: uniqueJoin(nearbyNamedStrings(lines, line, "Effect_")),
        nearbySounds: uniqueJoin(nearbyNamedStrings(lines, line, "Sound_")),
        contextHash: contextHash(context),
        context,
      });
    }
  }

  return rows;
}

function exportNativeBoneQueryXrefs({ sourcePaths = defaultSourcePaths, tsvOut = defaultTsvOut, jsonOut = defaultJsonOut } = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeBoneQueryXrefsFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
      }),
    );
  }

  writeTsv(tsvOut, rows, [
    "sourceFile",
    "functionName",
    "line",
    "accessorOffset",
    "boneName",
    "nearbyEffects",
    "nearbySounds",
    "contextHash",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, items: rows }, null, 2)}\n`);

  return {
    files: files.length,
    rows: rows.length,
    uniqueBones: new Set(rows.map((row) => row.boneName)).size,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeBoneQueryXrefs({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportNativeBoneQueryXrefs,
  extractNativeBoneQueryXrefsFromSource,
};
