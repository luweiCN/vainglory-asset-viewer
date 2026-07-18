#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_animation_runtime_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_animation_runtime_chain_summary.json";

const updateLoopEvidencePatterns = [
  ["active-track-field-0x1bf0", /0x1bf0/],
  ["blend-track-field-0x1bf8", /0x1bf8/],
  ["blend-time-fields-0x1c00-0x1c04", /0x1c00[\s\S]*0x1c04|0x1c04[\s\S]*0x1c00/],
  ["current-animation-id-field-0x1c08", /0x1c08/],
  ["pending-child-track-field-0x1c10", /0x1c10/],
  ["extra-transform-fields-0x1c18-0x1d08", /0x1c18[\s\S]*0x1d08|0x1d08[\s\S]*0x1c18/],
  ["mode-bitfield-0x1d12", /0x1d12/],
  ["delayed-switch-index-0x1d14", /0x1d14/],
  ["delayed-switch-table-0x1af0", /0x1af0/],
  ["alias-table-0x1a20", /0x1a20/],
];

const startTrackEvidencePatterns = [
  ["animation-slot-base-0x98", /0x98/],
  ["animation-slot-stride-0x88", /0x88/],
  ["child-count-field-0x118", /0x118/],
  ["pending-child-track-field-0x1c10", /0x1c10/],
];

const createTrackEvidencePatterns = [
  ["active-track-field-0x1bf0", /0x1bf0/],
  ["blend-track-field-0x1bf8", /0x1bf8/],
  ["blend-duration-field-0x1c00", /0x1c00/],
  ["blend-elapsed-field-0x1c04", /0x1c04/],
  ["mode-bitfield-0x1d12", /0x1d12/],
  ["track-mode-field-0x14", /0x14/],
  ["track-speed-field-0x18", /0x18/],
  ["track-weight-field-0x10", /0x10/],
];

const aliasSwitchEvidencePatterns = [
  ["alias-source-id-field-0x1a18", /0x1a18/],
  ["alias-target-id-field-0x1a1c", /0x1a1c|pcVar\d+\s*\+\s*-4/],
  ["alias-enabled-field-0x1a20", /0x1a20/],
  ["alias-table-size-0xd8", /0xd8|0x12|0x11/],
  ["active-track-field-0x1bf0", /0x1bf0/],
  ["current-animation-id-field-0x1c08", /0x1c08/],
  ["delayed-switch-table-0x1af0", /0x1af0/],
];

const transformSlotEvidencePatterns = [
  ["extra-transform-table-0x1c18", /0x1c18/],
  ["extra-transform-hash-table-0x1d08", /0x1d08/],
  ["mode-bitfield-0x1d12", /0x1d12/],
  ["max-extra-transform-slots-5", /4|5/],
  ["output-slot-index-param4", /param_4/],
];

const randomChildEvidencePatterns = [
  ["child-count-field-0x80", /0x80/],
  ["base-record-weight-field-0x18", /0x18/],
  ["child-record-base-0x20", /0x20/],
  ["child-weight-field-0x10", /0x10/],
  ["child-record-stride-0x18", /0x18/],
  ["random-selection-call", /\b_rand\b|\brand\b/],
  ["fallback-primary-record-param2-plus-8", /param_2\s*\+\s*8/],
];

const defaultStageSpecs = [
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "register-animation-component",
    functionName: "FUN_1000296e0",
    expectedCalls: ["FUN_1010a0944", "FUN_10002974c", "thunk_FUN_100029528", "FUN_10002ab24"],
    evidencePatterns: [
      ["animation-component-token", /DAT_10184dc68/],
      ["component-size-0x1d18", /0x1d18/],
      ["update-hook-phase-4", /FUN_1010a0944\(param_1,4,FUN_10002974c,0\)/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "register-animation-component",
    functionName: "FUN_009b2054",
    expectedCalls: ["FUN_01986780", "FUN_009b20c4", "FUN_009b3b58", "FUN_009b3b7c"],
    evidencePatterns: [
      ["animation-component-token", /DAT_0312eae0/],
      ["component-size-0x1d18", /0x1d18/],
      ["update-hook-phase-4", /FUN_01986780\(param_1,4,FUN_009b20c4,0\)/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "animation-component-init",
    functionName: "FUN_100029528",
    expectedCalls: ["FUN_1010a7e48", "FUN_10034d83c"],
    evidencePatterns: [
      ["animation-resource-fields-0x37c-to-0x380", /0x380[\s\S]*0x37c|0x37c[\s\S]*0x380/],
      ["mode-bitfield-0x1d12", /0x1d12/],
      ["delayed-switch-index-0x1d14", /0x1d14/],
      ["default-enabled-mode-mask-0x3fe0", /0x3fe0/],
      ["clear-runtime-state-0x1a58", /0x1a58/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "animation-component-init",
    functionName: "FUN_009b1e8c",
    expectedCalls: ["FUN_0198f4cc", "FUN_00d9ff2c"],
    evidencePatterns: [
      ["animation-resource-fields-0x37c-to-0x380", /0x380[\s\S]*0x37c|0x37c[\s\S]*0x380/],
      ["mode-bitfield-0x1d12", /0x1d12/],
      ["delayed-switch-index-0x1d14", /0x1d14/],
      ["default-enabled-mode-mask-0x3fe0", /0x3fe0/],
      ["clear-runtime-state-0x1a58", /0x1a58/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "animation-update-loop",
    functionName: "FUN_10002974c",
    expectedCalls: ["FUN_1010a879c", "FUN_1010a7ed8", "FUN_1010a87a4", "FUN_100029b4c", "FUN_10002aa78", "FUN_100029ab4"],
    evidencePatterns: updateLoopEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "animation-update-loop",
    functionName: "FUN_009b20c4",
    expectedCalls: ["FUN_0198feb0", "FUN_0198f550", "FUN_0198fec0", "FUN_009b2540", "FUN_009b3aa4", "FUN_009b24ac"],
    evidencePatterns: updateLoopEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "start-animation-track",
    functionName: "FUN_100029ab4",
    expectedCalls: ["FUN_10002aa78", "FUN_100029b4c"],
    evidencePatterns: startTrackEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "start-animation-track",
    functionName: "FUN_009b24ac",
    expectedCalls: ["FUN_009b3aa4", "FUN_009b2540"],
    evidencePatterns: startTrackEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "create-or-blend-track",
    functionName: "FUN_100029b4c",
    expectedCalls: ["FUN_1010a8710", "FUN_1010a8bf0", "FUN_1010a8680"],
    evidencePatterns: createTrackEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "create-or-blend-track",
    functionName: "FUN_009b2540",
    expectedCalls: ["FUN_0198ff3c", "FUN_019902b4", "FUN_0198fe18"],
    evidencePatterns: createTrackEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "register-alias-switch",
    functionName: "FUN_10002a364",
    expectedCalls: ["FUN_10002a4f4", "FUN_10002a068"],
    evidencePatterns: aliasSwitchEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "register-alias-switch",
    functionName: "FUN_009b2ff8",
    expectedCalls: ["FUN_009b3164", "FUN_009b2c9c"],
    evidencePatterns: aliasSwitchEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "unregister-alias-switch",
    functionName: "FUN_10002a4f4",
    expectedCalls: ["FUN_10002a068"],
    evidencePatterns: [
      ...aliasSwitchEvidencePatterns,
      ["mode-bitfield-0x1d12", /0x1d12/],
      ["delayed-switch-index-0x1d14", /0x1d14/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "unregister-alias-switch",
    functionName: "FUN_009b3164",
    expectedCalls: ["FUN_009b2c9c"],
    evidencePatterns: [
      ...aliasSwitchEvidencePatterns,
      ["mode-bitfield-0x1d12", /0x1d12/],
      ["delayed-switch-index-0x1d14", /0x1d14/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "register-extra-transform-slot",
    functionName: "FUN_10002a8e4",
    expectedCalls: ["FUN_1010acd44"],
    evidencePatterns: transformSlotEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "register-extra-transform-slot",
    functionName: "FUN_009b3858",
    expectedCalls: ["FUN_019951b4"],
    evidencePatterns: transformSlotEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "unregister-extra-transform-slot",
    functionName: "FUN_10002a9bc",
    expectedCalls: [],
    evidencePatterns: [
      ["extra-transform-hash-table-0x1d08", /0x1d08/],
      ["mode-bitfield-0x1d12", /0x1d12/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "unregister-extra-transform-slot",
    functionName: "FUN_009b391c",
    expectedCalls: [],
    evidencePatterns: [
      ["extra-transform-hash-table-0x1d08", /0x1d08/],
      ["mode-bitfield-0x1d12", /0x1d12/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-runtime",
    stage: "select-random-child-track",
    functionName: "FUN_10002aa78",
    expectedCalls: ["_rand"],
    evidencePatterns: randomChildEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-runtime",
    stage: "select-random-child-track",
    functionName: "FUN_009b3aa4",
    expectedCalls: ["rand"],
    evidencePatterns: randomChildEvidencePatterns,
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

function sampleContext(blockText, radius = 1600) {
  if (blockText.length <= radius * 2) return blockText;
  return `${blockText.slice(0, radius)}\n...\n${blockText.slice(-radius)}`;
}

function rowForSpec({ sourceFile, block, spec }) {
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
    line: block.startLine,
    matchedCalls: matchedCalls.join("|"),
    missingCalls: missingCalls.join("|"),
    evidenceTags: evidenceTags.join("|"),
    missingEvidence: spec.evidencePatterns
      .filter(([tag]) => !evidenceTags.includes(tag))
      .map(([tag]) => tag)
      .join("|"),
    complete: missingCalls.length === 0 && evidenceTags.length === spec.evidencePatterns.length ? "yes" : "no",
    contextHash: contextHash(block.text),
    context: sampleContext(block.text),
  };
}

function extractNativeAttachmentAnimationRuntimeChainFromSource({
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
    .map((spec) => rowForSpec({ sourceFile, block: blockByFunction.get(spec.functionName), spec }));
}

function summarize(rows, files) {
  const byPlatform = {};
  const byStage = {};
  const incomplete = [];
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byStage[row.stage] = (byStage[row.stage] || 0) + 1;
    if (row.complete !== "yes") {
      incomplete.push({
        platform: row.platform,
        stage: row.stage,
        functionName: row.functionName,
        missingCalls: row.missingCalls,
        missingEvidence: row.missingEvidence,
      });
    }
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    byPlatform,
    byStage,
    incomplete,
  };
}

function exportNativeAttachmentAnimationRuntimeChain({
  sourcePaths = defaultSourcePaths,
  stageSpecs = defaultStageSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeAttachmentAnimationRuntimeChainFromSource({
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
    "missingEvidence",
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
  const summary = exportNativeAttachmentAnimationRuntimeChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultStageSpecs,
  exportNativeAttachmentAnimationRuntimeChain,
  extractNativeAttachmentAnimationRuntimeChainFromSource,
};
