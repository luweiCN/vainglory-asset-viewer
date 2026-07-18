#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachable_runtime_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachable_runtime_chain_summary.json";

const defaultStageSpecs = [
  {
    platform: "ios",
    chain: "immediate-equip",
    stage: "manifest-entry-to-attachment-info",
    functionName: "FUN_100025344",
    expectedCalls: [
      "FUN_100331a84",
      "FUN_10034c450",
      "FUN_1000254d4",
      "FUN_10002c480",
      "FUN_10002c4e0",
      "FUN_10002c524",
      "FUN_10002cc10",
    ],
    evidencePatterns: [
      ["manifest-entry-resource-field-0x8", /lVar2\s*\+\s*8/],
      ["skin-info-mesh-field-0x40", /lVar2\s*\+\s*0x40/],
      ["skin-info-animation-fields-0x48-0x50", /lVar2\s*\+\s*0x48[\s\S]*lVar2\s*\+\s*0x50/],
      ["attachment-component-lookup", /DAT_10184dd88/],
    ],
  },
  {
    platform: "android",
    chain: "immediate-equip",
    stage: "manifest-entry-to-attachment-info",
    functionName: "FUN_009adcc4",
    expectedCalls: [
      "FUN_00ccecc4",
      "FUN_00d6eb5c",
      "FUN_009ade60",
      "FUN_009b627c",
      "FUN_009b62dc",
      "FUN_009b6320",
      "FUN_009b5b60",
    ],
    evidencePatterns: [
      ["manifest-entry-resource-field-0x8", /lVar2\s*\+\s*8/],
      ["skin-info-mesh-field-0x40", /lVar2\s*\+\s*0x40/],
      ["skin-info-animation-fields-0x48-0x50", /lVar2\s*\+\s*0x48[\s\S]*lVar2\s*\+\s*0x50/],
      ["attachment-component-lookup", /DAT_0312ebe0/],
    ],
  },
  {
    platform: "ios",
    chain: "shared-selector",
    stage: "current-skin-attachment-variant",
    functionName: "FUN_1000254d4",
    expectedCalls: ["FUN_100465e48", "_strcmp", "FUN_1004d2538"],
    evidencePatterns: [
      ["current-skin-name-query", /FUN_100465e48/],
      ["per-skin-variant-table-0x78", /param_2\s*\+\s*0x78/],
      ["default-variant-gate-0x40", /param_2\s*\+\s*0x40/],
    ],
  },
  {
    platform: "android",
    chain: "shared-selector",
    stage: "current-skin-attachment-variant",
    functionName: "FUN_009ade60",
    expectedCalls: ["FUN_00d5cdac", "strcmp", "FUN_00e6a488"],
    evidencePatterns: [
      ["current-skin-name-query", /FUN_00d5cdac/],
      ["per-skin-variant-table-0x78", /param_2\s*\+\s*0x78/],
      ["default-variant-gate-0x40", /param_2\s*\+\s*0x40/],
    ],
  },
  {
    platform: "ios",
    chain: "shared-attachment-state",
    stage: "write-attachment-target-state",
    functionName: "FUN_10002cc10",
    expectedCalls: [],
    evidencePatterns: [
      ["target-transform-field-0x38", /param_1\s*\+\s*0x38/],
      ["owner-transform-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-mode-field-0x68", /param_1\s*\+\s*0x68/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
    ],
  },
  {
    platform: "android",
    chain: "shared-attachment-state",
    stage: "write-attachment-target-state",
    functionName: "FUN_009b5b60",
    expectedCalls: [],
    evidencePatterns: [
      ["target-transform-field-0x38", /param_1\s*\+\s*0x38/],
      ["owner-transform-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-mode-field-0x68", /param_1\s*\+\s*0x68/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
    ],
  },
  {
    platform: "ios",
    chain: "refresh-path",
    stage: "store-attachable-resource-id",
    functionName: "FUN_1000b73fc",
    expectedCalls: [],
    evidencePatterns: [["stored-resource-id-field-0x30", /param_1\s*\+\s*0x30/]],
  },
  {
    platform: "android",
    chain: "refresh-path",
    stage: "store-attachable-resource-id",
    functionName: "FUN_00a7d704",
    expectedCalls: [],
    evidencePatterns: [["stored-resource-id-field-0x30", /param_1\s*\+\s*0x30/]],
  },
  {
    platform: "ios",
    chain: "refresh-path",
    stage: "mark-attachable-refresh",
    functionName: "FUN_1000b7404",
    expectedCalls: [],
    evidencePatterns: [["refresh-flag-field-0x38", /param_1\s*\+\s*0x38/]],
  },
  {
    platform: "android",
    chain: "refresh-path",
    stage: "mark-attachable-refresh",
    functionName: "FUN_00a7d70c",
    expectedCalls: [],
    evidencePatterns: [["refresh-flag-field-0x38", /param_1\s*\+\s*0x38/]],
  },
  {
    platform: "ios",
    chain: "refresh-path",
    stage: "reapply-attachable-from-stored-resource",
    functionName: "FUN_1000b7410",
    expectedCalls: [
      "FUN_10034c450",
      "FUN_1000254d4",
      "FUN_10002c480",
      "FUN_10002c4e0",
      "FUN_10002c524",
      "FUN_10002cc10",
    ],
    evidencePatterns: [
      ["stored-resource-id-field-0x30", /param_1\s*\+\s*0x30/],
      ["mesh-component-handle-field-0x10", /param_1\s*\+\s*0x10/],
      ["attachment-component-handle-field-0x20", /param_1\s*\+\s*0x20/],
      ["optional-refresh-flag-field-0x38", /param_1\s*\+\s*0x38/],
    ],
  },
  {
    platform: "android",
    chain: "refresh-path",
    stage: "reapply-attachable-from-stored-resource",
    functionName: "FUN_00a7d718",
    expectedCalls: [
      "FUN_00d6eb5c",
      "FUN_009ade60",
      "FUN_009b627c",
      "FUN_009b62dc",
      "FUN_009b6320",
      "FUN_009b5b60",
    ],
    evidencePatterns: [
      ["stored-resource-id-field-0x30", /param_1\s*\+\s*0x30/],
      ["mesh-component-handle-field-0x10", /param_1\s*\+\s*0x10/],
      ["attachment-component-handle-field-0x20", /param_1\s*\+\s*0x20/],
      ["optional-refresh-flag-field-0x38", /param_1\s*\+\s*0x38/],
    ],
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

function lineForFunction(sourceText, functionName) {
  const index = sourceText.search(new RegExp(`\\b${functionName}\\s*\\(`));
  if (index < 0) return 0;
  return sourceText.slice(0, index).split(/\r?\n/).length;
}

function sampleContext(blockText, radius = 1800) {
  if (blockText.length <= radius * 2) return blockText;
  return `${blockText.slice(0, radius)}\n...\n${blockText.slice(-radius)}`;
}

function rowForSpec({ sourceFile, sourceText, block, spec }) {
  const matchedCalls = spec.expectedCalls.filter((functionName) => new RegExp(`\\b${functionName}\\s*\\(`).test(block.text));
  const missingCalls = spec.expectedCalls.filter((functionName) => !matchedCalls.includes(functionName));
  const evidenceTags = spec.evidencePatterns
    .filter(([, pattern]) => pattern.test(block.text))
    .map(([tag]) => tag);

  return {
    platform: spec.platform,
    chain: spec.chain,
    stage: spec.stage,
    sourceFile,
    functionName: spec.functionName,
    line: lineForFunction(sourceText, spec.functionName),
    matchedCalls: matchedCalls.join("|"),
    missingCalls: missingCalls.join("|"),
    evidenceTags: evidenceTags.join("|"),
    complete: missingCalls.length === 0 && evidenceTags.length === spec.evidencePatterns.length ? "yes" : "no",
    contextHash: contextHash(block.text),
    context: sampleContext(block.text),
  };
}

function extractNativeAttachableRuntimeChainFromSource({
  sourceFile,
  sourceText,
  stageSpecs = defaultStageSpecs,
} = {}) {
  const platform = sourcePlatform(sourceFile);
  const specs = stageSpecs.filter((spec) => !spec.platform || !platform || spec.platform === platform);
  if (!specs.length) return [];

  const blocks = findFunctionBlocks(sourceText.split(/\r?\n/));
  const blockByFunction = new Map(blocks.map((block) => [block.functionName, block]));
  return specs
    .filter((spec) => blockByFunction.has(spec.functionName))
    .map((spec) => rowForSpec({ sourceFile, sourceText, block: blockByFunction.get(spec.functionName), spec }));
}

function summarize(rows, files) {
  const byPlatform = {};
  const byChain = {};
  const byStage = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byChain[row.chain] = (byChain[row.chain] || 0) + 1;
    byStage[row.stage] = (byStage[row.stage] || 0) + 1;
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    byPlatform,
    byChain,
    byStage,
    incomplete: rows
      .filter((row) => row.complete !== "yes")
      .map((row) => ({
        platform: row.platform,
        chain: row.chain,
        stage: row.stage,
        functionName: row.functionName,
        missingCalls: row.missingCalls,
        evidenceTags: row.evidenceTags,
      })),
  };
}

function exportNativeAttachableRuntimeChain({
  sourcePaths = defaultSourcePaths,
  stageSpecs = defaultStageSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeAttachableRuntimeChainFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
        stageSpecs,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.chain !== right.chain) return left.chain.localeCompare(right.chain);
    if (left.stage !== right.stage) return left.stage.localeCompare(right.stage);
    return left.functionName.localeCompare(right.functionName);
  });

  const columns = [
    "platform",
    "chain",
    "stage",
    "sourceFile",
    "functionName",
    "line",
    "matchedCalls",
    "missingCalls",
    "evidenceTags",
    "complete",
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
  const summary = exportNativeAttachableRuntimeChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultStageSpecs,
  exportNativeAttachableRuntimeChain,
  extractNativeAttachableRuntimeChainFromSource,
};
