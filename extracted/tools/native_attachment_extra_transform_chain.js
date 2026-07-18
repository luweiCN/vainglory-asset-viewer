#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_extra_transform_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_extra_transform_chain_summary.json";

const extraTransformSpecs = [
  {
    platform: "ios",
    kind: "single-extra-transform-component",
    registrationFunction: "FUN_10002d0f0",
    runtimeFunctions: ["FUN_10002d1c4", "FUN_10002d208"],
    evidencePatterns: [
      ["component-token-DAT_10184de08", /DAT_10184de08/],
      ["component-size-0x78", /0x78/],
      ["phase-3-register-hook", /FUN_1010a0944\(param_1,3,FUN_10002d18c,0\)/],
      ["phase-1-unregister-hook", /FUN_1010a0944\(param_1,1,FUN_10002d1a8,0\)/],
      ["animation-component-token-DAT_10184dc68", /DAT_10184dc68/],
      ["register-extra-transform-api", /FUN_10002a8e4/],
      ["unregister-extra-transform-api", /FUN_10002a9bc/],
      ["bind-name-field-0x68", /0x68/],
      ["slot-index-field-0x70", /0x70/],
    ],
  },
  {
    platform: "android",
    kind: "single-extra-transform-component",
    registrationFunction: "FUN_009b66ec",
    runtimeFunctions: ["FUN_009b6858", "FUN_009b689c"],
    evidencePatterns: [
      ["component-token-DAT_0312edc0", /DAT_0312edc0/],
      ["component-size-0x78", /0x78/],
      ["phase-3-register-hook", /FUN_01986780\(param_1,3,FUN_009b678c,0\)/],
      ["phase-1-unregister-hook", /FUN_01986780\(param_1,1,FUN_009b67a8,0\)/],
      ["animation-component-token-DAT_0312eae0", /DAT_0312eae0/],
      ["register-extra-transform-api", /FUN_009b3858/],
      ["unregister-extra-transform-api", /FUN_009b391c/],
      ["bind-name-field-0x68", /0x68/],
      ["slot-index-field-0x70", /0x70/],
    ],
  },
  {
    platform: "ios",
    kind: "procedural-extra-transform-component",
    registrationFunction: "FUN_100049a74",
    runtimeFunctions: ["FUN_100049afc"],
    evidencePatterns: [
      ["component-token-DAT_10184df80", /DAT_10184df80/],
      ["component-size-0x50", /0x50/],
      ["phase-3-update-hook", /FUN_1010a0944\(param_1,3,FUN_100049ae0,0\)/],
      ["animation-component-token-DAT_10184dc68", /DAT_10184dc68/],
      ["owner-component-token-DAT_10184dd68", /DAT_10184dd68/],
      ["register-extra-transform-api", /FUN_10002a8e4/],
      ["bind-name-field-0x38", /0x38/],
      ["axis-mode-field-0x4c", /0x4c/],
    ],
  },
  {
    platform: "android",
    kind: "procedural-extra-transform-component",
    registrationFunction: "FUN_009d82d8",
    runtimeFunctions: ["FUN_009d8364"],
    evidencePatterns: [
      ["component-token-DAT_0312f988", /DAT_0312f988/],
      ["component-size-0x50", /0x50/],
      ["phase-3-update-hook", /FUN_01986780\(param_1,3,FUN_009d8348,0\)/],
      ["animation-component-token-DAT_0312eae0", /DAT_0312eae0/],
      ["owner-component-token-DAT_02c09220", /DAT_02c09220/],
      ["register-extra-transform-api", /FUN_009b3858/],
      ["bind-name-field-0x38", /0x38/],
      ["axis-mode-field-0x4c", /0x4c/],
    ],
  },
  {
    platform: "ios",
    kind: "multi-bind-extra-transform-object",
    registrationFunction: "FUN_1000504dc",
    runtimeFunctions: ["FUN_1000505fc", "FUN_1000509c8"],
    evidencePatterns: [
      ["activation-callback-FUN_1000505fc", /FUN_1000505fc/],
      ["binding-token-setter-FUN_1000509c8", /FUN_1000509c8/],
      ["animation-component-token-DAT_10184dc68", /DAT_10184dc68/],
      ["owner-component-token-DAT_10184dd68", /DAT_10184dd68/],
      ["register-extra-transform-api", /FUN_10002a8e4/],
      ["unregister-extra-transform-api", /FUN_10002a9bc/],
      ["bind-count-field-0x15", /0x15/],
      ["bind-token-array-base-0x18", /0x18/],
      ["slot-index-array-base-0xac", /0xac/],
    ],
  },
  {
    platform: "android",
    kind: "multi-bind-extra-transform-object",
    registrationFunction: "FUN_009df040",
    runtimeFunctions: ["FUN_009df164", "FUN_009df57c"],
    evidencePatterns: [
      ["activation-callback-FUN_009df164", /FUN_009df164/],
      ["binding-token-setter-FUN_009df57c", /FUN_009df57c/],
      ["animation-component-token-DAT_0312eae0", /DAT_0312eae0/],
      ["owner-component-token-DAT_02c09220", /DAT_02c09220/],
      ["register-extra-transform-api", /FUN_009b3858/],
      ["unregister-extra-transform-api", /FUN_009b391c/],
      ["bind-count-field-0x15", /0x15/],
      ["bind-token-array-base-0x18", /0x18/],
      ["slot-index-array-base-0xac", /0xac/],
    ],
  },
];

const bindingSetters = [
  { platform: "ios", functionName: "FUN_1000509c8", objectInitFunction: "FUN_1000504dc" },
  { platform: "android", functionName: "FUN_009df57c", objectInitFunction: "FUN_009df040" },
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

function componentRow(spec, blocks) {
  const wanted = new Set([spec.registrationFunction, ...spec.runtimeFunctions]);
  const matchedBlocks = blocks.filter((block) => block.platform === spec.platform && wanted.has(block.functionName));
  const matchedFunctions = uniq(matchedBlocks.map((block) => block.functionName));
  const text = matchedBlocks.map((block) => block.text).join("\n\n");
  const tags = evidenceTags(text, spec.evidencePatterns);

  return {
    platform: spec.platform,
    stage: "extra-transform-chain",
    kind: spec.kind,
    sourceFile: uniq(matchedBlocks.map((block) => block.sourceFile)).join("|"),
    functionName: spec.registrationFunction,
    line: matchedBlocks.find((block) => block.functionName === spec.registrationFunction)?.startLine || "",
    relatedFunctions: matchedFunctions.join("|"),
    bindToken: "",
    setterFunction: "",
    vtableSymbol: "",
    evidenceTags: tags.join("|"),
    complete: matchedFunctions.length === wanted.size && tags.length === spec.evidencePatterns.length ? "yes" : "no",
    missingEvidence: spec.evidencePatterns
      .filter(([tag]) => !tags.includes(tag))
      .map(([tag]) => tag)
      .join("|"),
    contextHash: contextHash(text),
  };
}

function bindingRows(blocks) {
  const rows = [];
  for (const block of blocks) {
    const setter = bindingSetters.find((candidate) => candidate.platform === block.platform);
    if (!setter || !block.text.includes(setter.functionName)) continue;

    const callPattern = new RegExp(`\\b${setter.functionName}\\s*\\([^,]+,\\s*"([^"\\r\\n]+)"\\)`, "g");
    for (const match of block.text.matchAll(callPattern)) {
      const prefix = block.text.slice(0, match.index);
      const line = block.startLine + prefix.split(/\r?\n/).length - 1;
      const context = match[0];
      rows.push({
        platform: block.platform,
        stage: "binding-token-registration",
        kind: "multi-bind-extra-transform-object",
        sourceFile: block.sourceFile,
        functionName: block.functionName,
        line,
        relatedFunctions: uniq([setter.objectInitFunction, setter.functionName]).join("|"),
        bindToken: match[1],
        setterFunction: setter.functionName,
        vtableSymbol: block.text.match(/&((?:PTR|PTR_thunk)_[A-Za-z0-9_]+)/)?.[1] || "",
        evidenceTags: "binding-token-setter",
        complete: "yes",
        missingEvidence: "",
        contextHash: contextHash(context),
      });
    }
  }
  return rows;
}

function extractNativeAttachmentExtraTransformChainFromSources({
  sourceFiles,
  specs = extraTransformSpecs,
} = {}) {
  const blocks = sourceBlocks(sourceFiles);
  const rows = specs.map((spec) => componentRow(spec, blocks));
  rows.push(...bindingRows(blocks));
  return rows;
}

function summarize(rows, files) {
  const byPlatform = {};
  const byStage = {};
  const byKind = {};
  const byBindToken = {};
  for (const row of rows) {
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byStage[row.stage] = (byStage[row.stage] || 0) + 1;
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
    if (row.bindToken) byBindToken[row.bindToken] = (byBindToken[row.bindToken] || 0) + 1;
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    componentRows: rows.filter((row) => row.stage === "extra-transform-chain").length,
    bindingRows: rows.filter((row) => row.stage === "binding-token-registration").length,
    byPlatform,
    byStage,
    byKind,
    byBindToken,
  };
}

function exportNativeAttachmentExtraTransformChain({
  sourcePaths = defaultSourcePaths,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  specs = extraTransformSpecs,
} = {}) {
  const sourceFiles = readSourceFiles(sourcePaths);
  const rows = extractNativeAttachmentExtraTransformChainFromSources({ sourceFiles, specs });
  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.stage !== right.stage) return left.stage.localeCompare(right.stage);
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    if (left.functionName !== right.functionName) return left.functionName.localeCompare(right.functionName);
    return Number(left.line || 0) - Number(right.line || 0);
  });

  const columns = [
    "platform",
    "stage",
    "kind",
    "sourceFile",
    "functionName",
    "line",
    "relatedFunctions",
    "bindToken",
    "setterFunction",
    "vtableSymbol",
    "evidenceTags",
    "complete",
    "missingEvidence",
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
  const summary = exportNativeAttachmentExtraTransformChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  bindingSetters,
  exportNativeAttachmentExtraTransformChain,
  extractNativeAttachmentExtraTransformChainFromSources,
  extraTransformSpecs,
};
