#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_animation_runtime_callers.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_animation_runtime_callers_summary.json";

const runtimeApis = [
  {
    platform: "ios",
    functionName: "FUN_10002a364",
    operation: "register-alias-switch",
  },
  {
    platform: "android",
    functionName: "FUN_009b2ff8",
    operation: "register-alias-switch",
  },
  {
    platform: "ios",
    functionName: "FUN_10002a4f4",
    operation: "unregister-alias-switch",
  },
  {
    platform: "android",
    functionName: "FUN_009b3164",
    operation: "unregister-alias-switch",
  },
  {
    platform: "ios",
    functionName: "FUN_100029eb4",
    operation: "play-transition-track",
  },
  {
    platform: "android",
    functionName: "FUN_009b28f0",
    operation: "play-transition-track",
  },
  {
    platform: "ios",
    functionName: "FUN_100029f20",
    operation: "register-transition-fallback",
  },
  {
    platform: "android",
    functionName: "FUN_009b2b10",
    operation: "register-transition-fallback",
  },
  {
    platform: "ios",
    functionName: "FUN_10002a8e4",
    operation: "register-extra-transform-slot",
  },
  {
    platform: "android",
    functionName: "FUN_009b3858",
    operation: "register-extra-transform-slot",
  },
  {
    platform: "ios",
    functionName: "FUN_10002a9bc",
    operation: "unregister-extra-transform-slot",
  },
  {
    platform: "android",
    functionName: "FUN_009b391c",
    operation: "unregister-extra-transform-slot",
  },
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

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function dataRefs(text) {
  return uniq([...text.matchAll(/&?(DAT_[0-9a-fA-F]+)/g)].map((match) => match[1]));
}

function readSourceFiles(sourcePaths) {
  return collectCFiles(sourcePaths).map((filePath) => ({
    filePath,
    text: fs.readFileSync(filePath, "utf8"),
  }));
}

function buildDatNameMap(sourceFiles) {
  const datNames = new Map();
  for (const { text } of sourceFiles) {
    const patterns = [
      /FUN_10034cb1c\(&?(DAT_[0-9a-fA-F]+),\s*"([^"\r\n]+)"\)/g,
      /thunk_FUN_00d9ff34\(&?(DAT_[0-9a-fA-F]+),\s*"([^"\r\n]+)"\)/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        datNames.set(match[1], match[2]);
      }
    }
  }
  return datNames;
}

function statementAround(lines, lineIndex) {
  const statementLines = [lines[lineIndex]];
  for (let index = lineIndex + 1; index < Math.min(lines.length, lineIndex + 4); index += 1) {
    if (/^\s*(if|for|while|do|switch)\b/.test(lines[index])) break;
    statementLines.push(lines[index]);
    if (lines[index].includes(";")) break;
  }
  return statementLines.join("\n");
}

function lineNumberInBlock(block, lineIndex) {
  return block.startLine + lineIndex;
}

function blockRows({ sourceFile, block, datNames, apiByFunction }) {
  const platform = sourcePlatform(sourceFile);
  const lines = block.text.split(/\r?\n/);
  const rows = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const api of apiByFunction.values()) {
      if (api.platform !== platform) continue;
      if (!new RegExp(`\\b${api.functionName}\\s*\\(`).test(line)) continue;
      if (lineIndex === 0 && block.functionName === api.functionName) continue;

      const statement = statementAround(lines, lineIndex);
      const refs = dataRefs(statement);
      const names = refs.map((ref) => datNames.get(ref) || "");
      rows.push({
        platform,
        operation: api.operation,
        apiFunction: api.functionName,
        sourceFile,
        callerFunction: block.functionName,
        line: lineNumberInBlock(block, lineIndex),
        dataRefs: refs.join("|"),
        dataNames: names.join("|"),
        stringArgs: quotedStrings(statement).join("|"),
        conditionHints: conditionHints(block.text).join("|"),
        contextHash: contextHash(statement),
        context: statement,
      });
    }
  }

  return rows;
}

function conditionHints(text) {
  const hints = [];
  if (/0x303/.test(text)) hints.push("actor-flags-0x303");
  if (/0x88[\s\S]*0x90/.test(text)) hints.push("movement-state-0x88-0x90");
  if (/FUN_100490540|FUN_00d9ef9c/.test(text)) hints.push("combat-or-movement-helper");
  if (/FUN_10002a020|FUN_009b2c64/.test(text)) hints.push("animation-present-check");
  if (/FUN_10002a62c|FUN_009b3348/.test(text)) hints.push("animation-active-check");
  if (/FUN_10002a678|FUN_009b3438/.test(text)) hints.push("alias-active-check");
  if (/FUN_1000212b8|FUN_009a9784/.test(text)) hints.push("clear-current-transition");
  return uniq(hints);
}

function extractNativeAttachmentAnimationRuntimeCallersFromSources({ sourceFiles, datNames, apis = runtimeApis } = {}) {
  const apiByFunction = new Map(apis.map((api) => [api.functionName, api]));
  const rows = [];
  for (const { filePath, text } of sourceFiles) {
    const platform = sourcePlatform(filePath);
    if (!platform) continue;
    const platformApis = apis.filter((api) => api.platform === platform);
    if (!platformApis.some((api) => text.includes(api.functionName))) continue;
    const blocks = findFunctionBlocks(text.split(/\r?\n/));
    for (const block of blocks) {
      if (!platformApis.some((api) => block.text.includes(api.functionName))) continue;
      rows.push(...blockRows({ sourceFile: filePath, block, datNames, apiByFunction }));
    }
  }
  return rows;
}

function summarize(rows, files) {
  const byPlatform = {};
  const byOperation = {};
  const byDataName = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byOperation[row.operation] = (byOperation[row.operation] || 0) + 1;
    for (const name of String(row.dataNames || "").split("|").filter(Boolean)) {
      byDataName[name] = (byDataName[name] || 0) + 1;
    }
  }
  return {
    files,
    rows: rows.length,
    functions: new Set(rows.map((row) => `${row.platform}:${row.callerFunction}`)).size,
    byPlatform,
    byOperation,
    byDataName,
    unresolvedDataRefs: uniq(
      rows.flatMap((row) => {
        const refs = String(row.dataRefs || "").split("|");
        const names = String(row.dataNames || "").split("|");
        return refs.filter((ref, index) => ref && !names[index]);
      }),
    ),
  };
}

function exportNativeAttachmentAnimationRuntimeCallers({
  sourcePaths = defaultSourcePaths,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const sourceFiles = readSourceFiles(sourcePaths);
  const datNames = buildDatNameMap(sourceFiles);
  const rows = extractNativeAttachmentAnimationRuntimeCallersFromSources({ sourceFiles, datNames });

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.operation !== right.operation) return left.operation.localeCompare(right.operation);
    if (left.callerFunction !== right.callerFunction) return left.callerFunction.localeCompare(right.callerFunction);
    return Number(left.line) - Number(right.line);
  });

  const columns = [
    "platform",
    "operation",
    "apiFunction",
    "sourceFile",
    "callerFunction",
    "line",
    "dataRefs",
    "dataNames",
    "stringArgs",
    "conditionHints",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, sourceFiles.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`,
  );
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentAnimationRuntimeCallers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDatNameMap,
  exportNativeAttachmentAnimationRuntimeCallers,
  extractNativeAttachmentAnimationRuntimeCallersFromSources,
  runtimeApis,
};
