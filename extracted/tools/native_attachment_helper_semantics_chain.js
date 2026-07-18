#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultHelperCallPath = "extracted/reports/native_attachment_helper_call_chain.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_helper_semantics_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_helper_semantics_chain_summary.json";

const helperSemanticSpecs = [
  {
    platform: "ios",
    publicHelperFunction: "FUN_1003dfe60",
    lookupFunction: "FUN_1003dfe60",
    wrapperFunctions: ["FUN_1003e00a8"],
    materializerFunction: "FUN_1003dfcb0",
    lookupFunctions: ["FUN_1003dfe60", "FUN_1003e00a8"],
    lookupEvidencePatterns: [
      ["component-token-DAT_10184dab8", /DAT_10184dab8/],
      ["component-list-owner-offset-0x18", /param_1\s*\+\s*0x18/],
      ["group-slot-base-0x50", /param_2[\s\S]{0,80}\*\s*8[\s\S]{0,80}0x50/],
      ["entry-array-pointer-0x38-0xb0", /0x38[\s\S]{0,100}0xb0/],
      ["index-arg-param_3", /param_3\s*!=\s*0|param_3\s*=\s*param_3\s*\+\s*-1/],
      ["mode-field-0x238-shift-10", /0x238[\s\S]{0,40}>>\s*10\s*&\s*7/],
      ["fallback-flag-param_5", /param_5\s*==\s*0/],
      ["materializer-call-FUN_1003dfcb0", /FUN_1003dfcb0/],
    ],
    materializerEvidencePatterns: [
      ["base-value-field-0x8", /param_2\s*\+\s*8/],
      ["level-scale-field-0xc", /param_2\s*\+\s*0xc/],
      ["bonus-value-field-0x10", /param_2\s*\+\s*0x10/],
      ["actor-stat-block-0x40", /param_1\s*\+\s*0x40/],
      ["weapon-stat-field-0x14", /param_2\s*\+\s*0x14/],
      ["offense-stat-field-0x18", /param_2\s*\+\s*0x18/],
      ["utility-stat-field-0x1c", /param_2\s*\+\s*0x1c/],
      ["level-stat-field-0x20", /param_2\s*\+\s*0x20/],
      ["clamp-field-0x24", /param_2\s*\+\s*0x24/],
      ["kind-mask-param_4", /param_4\s*&\s*1|param_4\s*>>\s*[1-7]|param_4\s*&\s*0x[48]0/],
    ],
    interpretation:
      "iOS indexed runtime helper: find runtime-data component, select group slot, select indexed entry, choose level/mode, then materialize a typed/scaled value.",
  },
  {
    platform: "android",
    publicHelperFunction: "FUN_00d59f54",
    lookupFunction: "FUN_00d090c4",
    wrapperFunctions: ["FUN_00d59f54"],
    materializerFunction: "FUN_00d08e88",
    lookupFunctions: ["FUN_00d59f54", "FUN_00d090c4", "FUN_00d9eb64", "FUN_00d53914", "FUN_00d4c67c", "FUN_00d535a4"],
    lookupEvidencePatterns: [
      ["public-helper-trampoline", /FUN_00d59f54[\s\S]{0,120}FUN_00d090c4/],
      ["component-finder-FUN_00d9eb64", /FUN_00d9eb64/],
      ["component-token-DAT_02e3ef78", /DAT_02e3ef78/],
      ["component-list-owner-offset-0x18", /param_1\s*\+\s*0x18/],
      ["group-getter-FUN_00d53914", /FUN_00d53914/],
      ["group-slot-base-0x50", /param_2[\s\S]{0,80}\*\s*8[\s\S]{0,80}0x50/],
      ["entry-array-pointer-0xb0", /0xb0/],
      ["entry-indexer-FUN_00d4c67c", /FUN_00d4c67c/],
      ["mode-getter-FUN_00d535a4", /FUN_00d535a4/],
      ["fallback-flag-param_5-bit0", /param_5\s*&\s*1/],
      ["materializer-call-FUN_00d08e88", /FUN_00d08e88/],
    ],
    materializerEvidencePatterns: [
      ["base-value-field-0x8", /param_2\s*\+\s*8/],
      ["level-scale-field-0xc", /param_2\s*\+\s*0xc/],
      ["bonus-value-field-0x10", /param_2\s*\+\s*0x10/],
      ["actor-stat-block-0x40", /param_1\s*\+\s*0x40/],
      ["weapon-stat-field-0x14", /param_2\s*\+\s*0x14/],
      ["offense-stat-field-0x18", /param_2\s*\+\s*0x18/],
      ["utility-stat-field-0x1c", /param_2\s*\+\s*0x1c/],
      ["level-stat-field-0x20", /param_2\s*\+\s*0x20/],
      ["clamp-field-0x24", /param_2\s*\+\s*0x24/],
      ["kind-mask-param_4", /param_4\s*&\s*1|param_4\s*>>\s*[1-7]|param_4\s*&\s*0x[48]0/],
    ],
    interpretation:
      "Android indexed runtime helper: public helper is a trampoline; real lookup uses component/group/entry helpers and materializes the same typed/scaled runtime value.",
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

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
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

function increment(map, key, count = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + count;
}

function readSourceFiles(sourcePaths) {
  return collectCFiles(sourcePaths).map((filePath) => ({
    filePath,
    text: fs.readFileSync(filePath, "utf8"),
  }));
}

function sourceBlocks(sourceFiles) {
  const blocks = [];
  for (const { filePath, text } of sourceFiles) {
    const platform = sourcePlatform(filePath);
    if (!platform) continue;
    for (const block of findFunctionBlocks(text.split(/\r?\n/))) {
      blocks.push({ ...block, sourceFile: filePath, platform });
    }
  }
  return blocks;
}

function evidenceTags(text, patterns) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function findSpecBlocks(blocks, spec, functionNames) {
  const wanted = new Set(functionNames);
  return blocks.filter((block) => block.platform === spec.platform && wanted.has(block.functionName));
}

function completeValue(foundFunctions, wantedFunctions, tags, patterns) {
  const missingFunctions = wantedFunctions.filter((functionName) => !foundFunctions.includes(functionName));
  const missingTags = patterns.filter(([tag]) => !tags.includes(tag)).map(([tag]) => tag);
  return {
    complete: missingFunctions.length === 0 && missingTags.length === 0 ? "yes" : "no",
    missingEvidence: [...missingFunctions.map((functionName) => `missing-function:${functionName}`), ...missingTags].join("|"),
  };
}

function semanticRows(blocks, specs) {
  const rows = [];
  for (const spec of specs) {
    const lookupBlocks = findSpecBlocks(blocks, spec, spec.lookupFunctions);
    const lookupFunctions = uniq(lookupBlocks.map((block) => block.functionName));
    const lookupText = lookupBlocks.map((block) => block.text).join("\n\n");
    const lookupTags = evidenceTags(lookupText, spec.lookupEvidencePatterns);
    const lookupStatus = completeValue(lookupFunctions, spec.lookupFunctions, lookupTags, spec.lookupEvidencePatterns);
    rows.push({
      platform: spec.platform,
      stage: "lookup-chain",
      helperFunction: spec.publicHelperFunction,
      realFunction: spec.lookupFunction,
      relatedFunctions: lookupFunctions.join("|"),
      sourceFiles: uniq(lookupBlocks.map((block) => block.sourceFile)).join("|"),
      lineRange: lookupBlocks.length
        ? `${Math.min(...lookupBlocks.map((block) => block.startLine))}-${Math.max(...lookupBlocks.map((block) => block.endLine))}`
        : "",
      groupArg: "",
      indexArg: "",
      kindArg: "",
      flagArg: "",
      argKey: "",
      callCount: "",
      parentRoles: "",
      parentTokens: "",
      evidenceTags: lookupTags.join("|"),
      complete: lookupStatus.complete,
      missingEvidence: lookupStatus.missingEvidence,
      interpretation: spec.interpretation,
      contextHash: contextHash(lookupText),
    });

    const materializerBlocks = findSpecBlocks(blocks, spec, [spec.materializerFunction]);
    const materializerFunctions = uniq(materializerBlocks.map((block) => block.functionName));
    const materializerText = materializerBlocks.map((block) => block.text).join("\n\n");
    const materializerTags = evidenceTags(materializerText, spec.materializerEvidencePatterns);
    const materializerStatus = completeValue(
      materializerFunctions,
      [spec.materializerFunction],
      materializerTags,
      spec.materializerEvidencePatterns,
    );
    rows.push({
      platform: spec.platform,
      stage: "value-materializer",
      helperFunction: spec.publicHelperFunction,
      realFunction: spec.materializerFunction,
      relatedFunctions: materializerFunctions.join("|"),
      sourceFiles: uniq(materializerBlocks.map((block) => block.sourceFile)).join("|"),
      lineRange: materializerBlocks.length
        ? `${Math.min(...materializerBlocks.map((block) => block.startLine))}-${Math.max(
            ...materializerBlocks.map((block) => block.endLine),
          )}`
        : "",
      groupArg: "",
      indexArg: "",
      kindArg: "",
      flagArg: "",
      argKey: "",
      callCount: "",
      parentRoles: "",
      parentTokens: "",
      evidenceTags: materializerTags.join("|"),
      complete: materializerStatus.complete,
      missingEvidence: materializerStatus.missingEvidence,
      interpretation: "Materializes the selected runtime entry into a scalar/vector value using the call-site kind mask.",
      contextHash: contextHash(materializerText),
    });
  }
  return rows;
}

function topTokenString(rows, maxTokens = 8) {
  const counts = {};
  for (const row of rows) {
    for (const token of String(row.parentTokens || "").split("|").filter(Boolean)) increment(counts, token);
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxTokens)
    .map(([token, count]) => `${token}:${count}`)
    .join("|");
}

function usageRows(helperCallRows, specs) {
  const specByHelper = new Map(specs.map((spec) => [spec.publicHelperFunction, spec]));
  const groups = new Map();
  for (const row of helperCallRows) {
    const spec = specByHelper.get(row.helperFunction);
    if (!spec) continue;
    const key = [
      row.platform,
      row.helperFunction,
      row.groupArg,
      row.indexArg,
      row.kindArg,
      row.flagArg,
      row.parentRoles,
    ].join("\u0000");
    if (!groups.has(key)) groups.set(key, { spec, rows: [] });
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map(({ spec, rows }) => {
      const first = rows[0];
      return {
        platform: first.platform || spec.platform,
        stage: "attachment-helper-call-usage",
        helperFunction: first.helperFunction,
        realFunction: spec.lookupFunction,
        relatedFunctions: uniq(rows.map((row) => row.callbackFunction)).join("|"),
        sourceFiles: uniq(rows.map((row) => row.callbackSourceFile)).join("|"),
        lineRange: `${Math.min(...rows.map((row) => Number(row.line) || 0))}-${Math.max(
          ...rows.map((row) => Number(row.line) || 0),
        )}`,
        groupArg: first.groupArg,
        indexArg: first.indexArg,
        kindArg: first.kindArg,
        flagArg: first.flagArg,
        argKey: first.argKey,
        callCount: rows.length,
        parentRoles: first.parentRoles,
        parentTokens: topTokenString(rows),
        evidenceTags: "callback-helper-call",
        complete: "yes",
        missingEvidence: "",
        interpretation: `Attachment callback uses runtime lookup group=${first.groupArg}, index=${first.indexArg}, kind=${first.kindArg}, fallbackFlag=${first.flagArg}.`,
        contextHash: contextHash(rows.map((row) => row.lineText).join("\n")),
      };
    })
    .sort((left, right) => {
      if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
      if (left.argKey !== right.argKey) return left.argKey.localeCompare(right.argKey);
      return left.parentRoles.localeCompare(right.parentRoles);
    });
}

function extractNativeAttachmentHelperSemanticsFromSources({
  sourceFiles,
  helperCallRows = [],
  specs = helperSemanticSpecs,
} = {}) {
  const blocks = sourceBlocks(sourceFiles);
  return [...semanticRows(blocks, specs), ...usageRows(helperCallRows, specs)];
}

function summarize(rows, files) {
  const byPlatform = {};
  const byStage = {};
  const byHelperFunction = {};
  const byArgKey = {};
  const topArgKeys = {};
  for (const row of rows) {
    increment(byPlatform, row.platform);
    increment(byStage, row.stage);
    increment(byHelperFunction, row.helperFunction);
    if (row.argKey) {
      increment(byArgKey, row.argKey, Number(row.callCount) || 1);
      increment(topArgKeys, `${row.platform}:${row.argKey}`, Number(row.callCount) || 1);
    }
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    semanticRows: rows.filter((row) => row.stage !== "attachment-helper-call-usage").length,
    usageRows: rows.filter((row) => row.stage === "attachment-helper-call-usage").length,
    byPlatform,
    byStage,
    byHelperFunction,
    byArgKey,
    topPlatformArgKeys: Object.entries(topArgKeys)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 30)
      .map(([argKey, count]) => ({ argKey, count })),
  };
}

function exportNativeAttachmentHelperSemantics({
  sourcePaths = defaultSourcePaths,
  helperCallPath = defaultHelperCallPath,
  specs = helperSemanticSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const sourceFiles = readSourceFiles(sourcePaths);
  const helperCallRows = readTsv(helperCallPath);
  const rows = extractNativeAttachmentHelperSemanticsFromSources({ sourceFiles, helperCallRows, specs });
  const columns = [
    "platform",
    "stage",
    "helperFunction",
    "realFunction",
    "relatedFunctions",
    "sourceFiles",
    "lineRange",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "argKey",
    "callCount",
    "parentRoles",
    "parentTokens",
    "evidenceTags",
    "complete",
    "missingEvidence",
    "interpretation",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, sourceFiles.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentHelperSemantics({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    helperCallPath: optionValue(args, "--helper-calls", defaultHelperCallPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportNativeAttachmentHelperSemantics,
  extractNativeAttachmentHelperSemanticsFromSources,
  helperSemanticSpecs,
  summarize,
  usageRows,
};
