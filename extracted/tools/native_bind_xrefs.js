#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/libGameKindred.c",
];
const defaultTsvOut = "extracted/reports/native_bind_xrefs.tsv";
const defaultJsonOut = "extracted/reports/native_bind_function_context.json";

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

function collectCFiles(sourcePaths) {
  const files = [];
  for (const sourcePath of sourcePaths) {
    if (!fs.existsSync(sourcePath)) continue;
    const stat = fs.statSync(sourcePath);
    if (stat.isFile() && sourcePath.endsWith(".c")) {
      files.push(sourcePath);
      continue;
    }
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      const child = path.join(sourcePath, entry.name);
      if (entry.isDirectory()) files.push(...collectCFiles([child]));
      else if (entry.isFile() && entry.name.endsWith(".c")) files.push(child);
    }
  }
  return files.sort();
}

function findFunctionBlocks(lines) {
  const blocks = [];
  let pending = null;
  let active = null;
  let braceDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const signatureMatch = line.match(/^[\w\s*\[\]]*\b((?:FUN|thunk_FUN)_[0-9a-fA-F]+)\s*\(/);
    if (!active && signatureMatch) {
      pending = {
        functionName: signatureMatch[1],
        startLine: index + 1,
        startIndex: index,
      };
    }

    if (pending && !active && line.includes("{")) {
      active = pending;
      pending = null;
      braceDepth = 0;
    }

    if (!active) continue;

    for (const char of line) {
      if (char === "{") braceDepth += 1;
      else if (char === "}") braceDepth -= 1;
    }

    if (braceDepth === 0) {
      blocks.push({
        functionName: active.functionName,
        startLine: active.startLine,
        endLine: index + 1,
        text: lines.slice(active.startIndex, index + 1).join("\n"),
      });
      active = null;
    }
  }

  return blocks;
}

function lineNumberForOffset(sourceText, offset) {
  return sourceText.slice(0, offset).split(/\r?\n/).length;
}

function contextAroundLine(lines, lineNumber, radius = 12) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join("\n");
}

function nearestRegistrationFunction(lines, lineNumber, radius = 80) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  let closest = null;
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const match = line.match(/\b(FUN_[0-9a-fA-F]+)\s*\([^;\n{}]*FUN_009df500[^;\n{}]*\)\s*;/);
    if (!match) continue;
    const distance = Math.abs(index + 1 - lineNumber);
    if (!closest || distance < closest.distance) closest = { functionName: match[1], distance };
  }
  return closest?.functionName || "";
}

function extractNativeBindXrefsFromSource({ sourceFile, sourceText }) {
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];

  for (const block of blocks) {
    const bindMatches = [...block.text.matchAll(/\b(FUN_009df57c)\s*\([^,]+,\s*"([^"]+)"\s*\)/g)];
    if (!bindMatches.length) continue;

    const initializerFunction = block.text.match(/\b(FUN_009df040)\s*\(/)?.[1] || "";
    const vtableSymbol = block.text.match(/&((?:PTR|PTR_thunk)_[A-Za-z0-9_]+)/)?.[1] || "";

    for (const match of bindMatches) {
      const blockPrefix = block.text.slice(0, match.index);
      const line = block.startLine + blockPrefix.split(/\r?\n/).length - 1;
      const context = contextAroundLine(lines, line);
      rows.push({
        sourceFile,
        functionName: block.functionName,
        line,
        bindToken: match[2],
        setterFunction: match[1],
        initializerFunction,
        vtableSymbol,
        registrationFunction: nearestRegistrationFunction(lines, line),
        contextHash: contextHash(context),
        context,
      });
    }
  }

  return rows;
}

function exportNativeBindXrefs({ sourcePaths = defaultSourcePaths, tsvOut = defaultTsvOut, jsonOut = defaultJsonOut } = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeBindXrefsFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
      }),
    );
  }

  writeTsv(tsvOut, rows, [
    "sourceFile",
    "functionName",
    "line",
    "bindToken",
    "setterFunction",
    "initializerFunction",
    "vtableSymbol",
    "registrationFunction",
    "contextHash",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, items: rows }, null, 2)}\n`);

  return { files: files.length, rows: rows.length };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeBindXrefs({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  collectCFiles,
  exportNativeBindXrefs,
  extractNativeBindXrefsFromSource,
  findFunctionBlocks,
};
