#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_update_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_update_chain_summary.json";

const updateEvidencePatterns = [
  ["target-node-field-0x38", /param_1\s*\+\s*0x38/],
  ["source-provider-field-0x40", /param_1\s*\+\s*0x40/],
  ["attach-mode-field-0x68", /param_1\s*\+\s*0x68/],
  ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
  ["mode-1-default-transform-vcall-0x18", /\+\s*0x18\)\)\([^;\n]*&/],
  ["mode-2-hash-transform-vcall-0x28", /\+\s*0x28\)\)\([\s\S]*?param_1\s*\+\s*0x60/],
  ["mode-3-hash-transform-vcall-0x20", /\+\s*0x20\)\)\([\s\S]*?param_1\s*\+\s*0x60/],
  ["target-transform-write-vcall-0x20", /\+\s*0x20\)\)\([^;\n]*param_1\s*\+\s*0x38/],
  ["target-finalize-vcall-0x30", /param_1\s*\+\s*0x38[\s\S]*\+\s*0x30/],
  ["optional-rotation-flag-0x6c", /param_1\s*\+\s*0x6c/],
  ["local-motion-fields-0x48-to-0x5c", /param_1\s*\+\s*0x48[\s\S]*param_1\s*\+\s*0x5c|param_1\s*\+\s*0x5c[\s\S]*param_1\s*\+\s*0x48/],
];

const defaultStageSpecs = [
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "register-attachment-update-component",
    functionName: "FUN_10002c7c4",
    expectedCalls: ["FUN_1010a0944", "thunk_FUN_10002c884"],
    evidencePatterns: [
      ["component-size-0x70", /0x70/],
      ["update-hook-5", /FUN_1010a0944\(param_1,5,thunk_FUN_10002c884,0\)/],
      ["constructor-function", /FUN_10002ce2c/],
      ["destructor-function", /FUN_10002ce84/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "register-attachment-update-component",
    functionName: "FUN_009b564c",
    expectedCalls: ["FUN_01986780", "thunk_FUN_009b5710"],
    evidencePatterns: [
      ["component-size-0x70", /0x70/],
      ["update-hook-5", /FUN_01986780\(param_1,5,thunk_FUN_009b5710,0\)/],
      ["constructor-function", /FUN_009b5f94/],
      ["destructor-function", /FUN_009b5ff0/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "frame-update-thunk",
    functionName: "thunk_FUN_10002c884",
    expectedCalls: ["FUN_10002cc64", "FUN_10002a9fc"],
    evidencePatterns: updateEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "frame-update-body",
    functionName: "FUN_10002c884",
    expectedCalls: ["FUN_10002cc64", "FUN_10002a9fc"],
    evidencePatterns: updateEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "frame-update-thunk",
    functionName: "thunk_FUN_009b5710",
    expectedCalls: ["FUN_009b5be0", "FUN_009b3960"],
    evidencePatterns: updateEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "frame-update-body",
    functionName: "FUN_009b5710",
    expectedCalls: ["FUN_009b5be0", "FUN_009b3960"],
    evidencePatterns: updateEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "enable-orientation-offset",
    functionName: "FUN_10002cc2c",
    expectedCalls: ["FUN_10002cc64"],
    evidencePatterns: [
      ["optional-rotation-flag-0x6c", /param_2\s*\+\s*0x6c/],
      ["stored-angle-field-0x64", /param_2\s*\+\s*100/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "enable-orientation-offset",
    functionName: "FUN_009b5ba8",
    expectedCalls: ["FUN_009b5be0"],
    evidencePatterns: [
      ["optional-rotation-flag-0x6c", /param_2\s*\+\s*0x6c/],
      ["stored-angle-field-0x64", /param_2\s*\+\s*100/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "orientation-offset-transform",
    functionName: "FUN_10002cc64",
    expectedCalls: [],
    evidencePatterns: [
      ["read-target-transform-vcall-0x18", /param_3\s*\+\s*0x38[\s\S]*\+\s*0x18/],
      ["write-target-transform-vcall-0x20", /param_3\s*\+\s*0x38[\s\S]*\+\s*0x20/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "orientation-offset-transform",
    functionName: "FUN_009b5be0",
    expectedCalls: [],
    evidencePatterns: [
      ["read-target-transform-vcall-0x18", /param_2\s*\+\s*0x38[\s\S]*\+\s*0x18/],
      ["write-target-transform-vcall-0x20", /param_2\s*\+\s*0x38[\s\S]*\+\s*0x20/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "direct-mode-1-helper",
    functionName: "FUN_009b5e34",
    expectedCalls: [],
    evidencePatterns: [
      ["source-provider-field-0x40", /param_1\s*\+\s*0x40/],
      ["mode-1-default-transform-vcall-0x18", /\+\s*0x18/],
      ["target-transform-write-vcall-0x20", /param_1\s*\+\s*0x38[\s\S]*\+\s*0x20/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "direct-mode-2-helper",
    functionName: "FUN_009b5ea0",
    expectedCalls: [],
    evidencePatterns: [
      ["source-provider-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
      ["mode-2-hash-transform-vcall-0x28", /\+\s*0x28/],
      ["target-transform-write-vcall-0x20", /param_1\s*\+\s*0x38[\s\S]*\+\s*0x20/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-frame-update",
    stage: "direct-mode-3-helper",
    functionName: "FUN_009b5f10",
    expectedCalls: [],
    evidencePatterns: [
      ["source-provider-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
      ["mode-3-hash-transform-vcall-0x20", /\+\s*0x20/],
      ["target-transform-write-vcall-0x20", /param_1\s*\+\s*0x38[\s\S]*\+\s*0x20/],
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

function sampleContext(blockText, radius = 1600) {
  if (blockText.length <= radius * 2) return blockText;
  return `${blockText.slice(0, radius)}\n...\n${blockText.slice(-radius)}`;
}

function rowForSpec({ sourceFile, sourceText, block, spec }) {
  const matchedCalls = spec.expectedCalls.filter((functionName) => new RegExp(`\\b${functionName}\\b`).test(block.text));
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

function extractNativeAttachmentUpdateChainFromSource({
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
  const byStage = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byStage[row.stage] = (byStage[row.stage] || 0) + 1;
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    byPlatform,
    byStage,
    incomplete: rows
      .filter((row) => row.complete !== "yes")
      .map((row) => ({
        platform: row.platform,
        stage: row.stage,
        functionName: row.functionName,
        missingCalls: row.missingCalls,
        evidenceTags: row.evidenceTags,
      })),
  };
}

function exportNativeAttachmentUpdateChain({
  sourcePaths = defaultSourcePaths,
  stageSpecs = defaultStageSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeAttachmentUpdateChainFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
        stageSpecs,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
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
  const summary = exportNativeAttachmentUpdateChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultStageSpecs,
  exportNativeAttachmentUpdateChain,
  extractNativeAttachmentUpdateChainFromSource,
};
