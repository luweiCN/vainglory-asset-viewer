#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_animation_apply_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_animation_apply_chain_summary.json";

const animationApplyEvidencePatterns = [
  ["reset-current-animation-vcall-0x10", /\+\s*0x10\)\)\(\)/],
  ["resolve-animation-resource-param2", /\((param_2)\)/],
  ["store-active-animation-resource-fields", /param_1\[0x37d\][\s\S]*param_1\[5\]/],
  ["primary-animation-record-from-param3", /param_3\s*\+\s*2[\s\S]*param_3\s*\+\s*3[\s\S]*\*param_3[\s\S]*param_3\[1\]/],
  ["extra-animation-list-param3-4", /param_3\[4\]/],
  ["extra-animation-loop", /while\s*\([^)]*!=\s*\([^)]*\)0x0\)/],
  ["default-track-time-1.0", /0x3f800000/],
  ["default-track-null-animation", /0\)/],
];

const primarySlotEvidencePatterns = [
  ["slot-base-field-0x98", /param_4\s*\+\s*0x98/],
  ["slot-capacity-0x30", /0x30/],
  ["slot-stride-0x88", /0x22|0x88/],
  ["animation-name-hash-seed-0x12345678", /0x12345678/],
  ["write-primary-resource-handle", /puVar4\s*\+\s*2/],
  ["write-primary-timing-fields", /puVar4\[4\][\s\S]*puVar4\[5\][\s\S]*puVar4\[6\]/],
  ["write-loop-flag-byte-0x81", /0x81/],
  ["clear-child-count-byte-0x20", /0x20/],
];

const extraSlotEvidencePatterns = [
  ["animation-name-hash-seed-0x12345678", /0x12345678/],
  ["find-primary-slot", /do\s*\{[\s\S]*piVar\d+[\s\S]*0x30/],
  ["child-animation-count-field-0x118", /0x118/],
  ["child-record-stride-0x18", /0x18/],
  ["child-record-resource-field-0xb8", /0xb8/],
  ["child-record-timing-fields", /0xc0[\s\S]*0xc4[\s\S]*(200|0xc8)/],
];

const playTrackEvidencePatterns = [
  ["find-animation-slot-by-id", /0x98[\s\S]*0x30|0x98[\s\S]*0x2f/],
  ["active-animation-id-field-0x1c08", /0x1c08/],
  ["track-alias-table-0x1a20", /0x1a20/],
  ["missing-track-sentinel-minus-1", /-\s*1/],
  ["start-or-blend-animation-call", /FUN_10002a068|FUN_009b2c9c/],
];

const defaultStageSpecs = [
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "set-attachment-mesh-component",
    functionName: "FUN_10002c480",
    expectedCalls: ["FUN_1010a0298"],
    evidencePatterns: [
      ["current-mesh-component-field-0x40", /param_1\s*\+\s*0x40/],
      ["mesh-component-token", /DAT_10184dc58/],
      ["mesh-set-vcall-0x20", /\+\s*0x20\)\)\([^;\n]*param_2/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "set-attachment-mesh-component",
    functionName: "FUN_009b627c",
    expectedCalls: ["FUN_01985d44"],
    evidencePatterns: [
      ["current-mesh-component-field-0x40", /param_1\s*\+\s*0x40/],
      ["mesh-component-token", /DAT_0312ead4/],
      ["mesh-set-vcall-0x20", /\+\s*0x20\)\)\([^;\n]*param_2/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "set-attachment-animation-component",
    functionName: "FUN_10002c4e0",
    expectedCalls: ["FUN_1010a0298", "FUN_100029c74"],
    evidencePatterns: [
      ["animation-component-token", /DAT_10184dc68/],
      ["forwards-animation-resource-param2", /FUN_100029c74\([^,]+,\s*param_2/],
      ["forwards-animation-config-param3", /FUN_100029c74\([^;]+param_3/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "set-attachment-animation-component",
    functionName: "FUN_009b62dc",
    expectedCalls: ["FUN_01985d44", "FUN_009b2690"],
    evidencePatterns: [
      ["animation-component-token", /DAT_0312eae0/],
      ["forwards-animation-resource-param2", /FUN_009b2690\([^,]+,\s*param_2/],
      ["forwards-animation-config-param3", /FUN_009b2690\([^;]+param_3/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "owner-skin-render-flags",
    functionName: "FUN_10002c524",
    expectedCalls: ["FUN_1004e9194", "FUN_1004e9154"],
    evidencePatterns: [
      ["requires-mesh-component-field-0x40", /param_1\s*\+\s*0x40/],
      ["owner-flags-mask-0x1f", /0x1f/],
      ["owner-flags-disable-bit-0x20", /0x20/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "owner-skin-render-flags",
    functionName: "FUN_009b6320",
    expectedCalls: ["FUN_00e7cdd8", "FUN_00e7ce38"],
    evidencePatterns: [
      ["requires-mesh-component-field-0x40", /param_1\s*\+\s*0x40/],
      ["owner-flags-mask-0x1f", /0x1f/],
      ["owner-flags-disable-bit-0x20", /0x20|>>\s*5/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "animation-apply-helper",
    functionName: "FUN_100029c74",
    expectedCalls: ["FUN_100029d44", "FUN_100029df4", "FUN_10034cb1c", "FUN_100029f94"],
    evidencePatterns: [
      ...animationApplyEvidencePatterns,
      ["resolve-animation-resource-function", /FUN_1010acfb8\(param_2\)/],
      ["default-track-play-call", /FUN_100029f94\(0x3f800000/],
    ],
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "animation-apply-helper",
    functionName: "FUN_009b2690",
    expectedCalls: ["FUN_009b2780", "FUN_009b2830", "thunk_FUN_00d9ff34", "FUN_009b2bec"],
    evidencePatterns: [
      ...animationApplyEvidencePatterns,
      ["resolve-animation-resource-function", /FUN_019955e4\(param_2\)/],
      ["default-track-play-call", /FUN_009b2bec\(0x3f800000/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "primary-animation-slot-writer",
    functionName: "FUN_100029d44",
    expectedCalls: ["FUN_1010a8710", "FUN_1010a88cc", "FUN_1004d2524", "FUN_100015208"],
    evidencePatterns: primarySlotEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "primary-animation-slot-writer",
    functionName: "FUN_009b2780",
    expectedCalls: ["FUN_0198ff3c", "FUN_01990008", "FUN_00e6a474", "FUN_0091ed5c"],
    evidencePatterns: primarySlotEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "extra-animation-slot-writer",
    functionName: "FUN_100029df4",
    expectedCalls: ["FUN_1004d2524", "FUN_100015208", "FUN_1010a8710", "FUN_1010a88cc"],
    evidencePatterns: extraSlotEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "extra-animation-slot-writer",
    functionName: "FUN_009b2830",
    expectedCalls: ["FUN_00e6a474", "FUN_0091ed5c", "FUN_0198ff3c", "FUN_01990008"],
    evidencePatterns: extraSlotEvidencePatterns,
  },
  {
    platform: "ios",
    chain: "attachment-animation-apply",
    stage: "play-attachment-animation-track",
    functionName: "FUN_100029f94",
    expectedCalls: ["FUN_10002a068"],
    evidencePatterns: playTrackEvidencePatterns,
  },
  {
    platform: "android",
    chain: "attachment-animation-apply",
    stage: "play-attachment-animation-track",
    functionName: "FUN_009b2bec",
    expectedCalls: ["FUN_009b2c9c"],
    evidencePatterns: playTrackEvidencePatterns,
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
    line: block.startLine || lineForFunction(sourceText, spec.functionName),
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

function extractNativeAttachmentAnimationApplyChainFromSource({
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

function exportNativeAttachmentAnimationApplyChain({
  sourcePaths = defaultSourcePaths,
  stageSpecs = defaultStageSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeAttachmentAnimationApplyChainFromSource({
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
  const summary = exportNativeAttachmentAnimationApplyChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultStageSpecs,
  exportNativeAttachmentAnimationApplyChain,
  extractNativeAttachmentAnimationApplyChainFromSource,
};
