#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_runtime_data_component_chain.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_runtime_data_component_chain_summary.json";

const runtimeDataSpecs = [
  {
    platform: "ios",
    componentToken: "DAT_10184dab8",
    registrationFunction: "FUN_10046b240",
    initializerFunction: "FUN_10049deac",
    destructorFunction: "FUN_10049df04",
    loaderFunction: "FUN_10046065c",
    appendSlotFunction: "FUN_100460878",
    aliasLookupFunction: "FUN_1004608fc",
    defaultAttackFunction: "FUN_100460aa0",
    ownerToken: "DAT_10184dd68",
    abilityFactoryToken: "DAT_101867310",
    registrationEvidencePatterns: [
      ["component-token-DAT_10184dab8", /DAT_10184dab8/],
      ["component-registry-counter-0x13fb0", /0x13fb0/],
      ["component-record-stride-0x2e8", /0x2e8/],
      ["initializer-FUN_10049deac", /FUN_10049deac/],
      ["destructor-FUN_10049df04", /FUN_10049df04/],
      ["component-token-field-0xa4", /0xa4/],
      ["component-size-0x1a0", /0xa8\)\s*=\s*0x1a0/],
      ["component-flags-200", /\|\s*200/],
      ["current-record-field-0x13fb8", /0x13fb8/],
    ],
    initializerEvidencePatterns: [
      ["vtable-set", /PTR_thunk_FUN_1010a0064/],
      ["slot-count-field-0x198-zero", /param_1\s*\+\s*0x33|0x198[\s\S]{0,80}0/],
      ["special-slot-count-0x199-zero", /0x19a[\s\S]{0,80}0|0x199[\s\S]{0,80}0/],
      ["primary-slot-index-0x194-invalid", /0x194[\s\S]{0,80}0xffffffff/],
      ["slot-array-base-0x50-zeroed", /param_1\[10\]|param_1\[0xb\]|param_1\[0x1d\]/],
      ["special-index-range-0x158-0x194-invalid", /0x18c|0x184|0x2e|0x2d|0x30|0x2f|0x2c|0x2b/],
    ],
    loaderEvidencePatterns: [
      ["definition-pointer-field-0x28", /param_1\s*\+\s*0x28/],
      ["inherited-ability-list-field-0x30", /param_2\s*\+\s*0x30/],
      ["withdraw-field-0x10", /(param_2|lVar6)\s*\+\s*0x10/],
      ["die-field-0x18", /param_1\s*\+\s*0x38|param_2\s*\+\s*0x18/],
      ["dance-field-0x20", /param_1\s*\+\s*0x40|param_2\s*\+\s*0x20/],
      ["taunt-field-0x28", /param_1\s*\+\s*0x48|param_2\s*\+\s*0x28/],
      ["default-attack-list-field-0x40", /param_2\s*\+\s*0x40/],
      ["default-attack-sublist-fields-0x38-0x40", /0x38[\s\S]{0,420}0x40/],
      ["ability-name-withdraw", /Ability__Withdraw/],
      ["ability-name-die", /Ability__Die/],
      ["ability-name-dance", /Ability__Emote_Dance/],
      ["ability-name-taunt", /Ability__Emote_Taunt/],
      ["ability-name-default-attack", /Ability__DefaultAttack/],
      ["slot-array-base-0x50", /0x50/],
      ["append-slot-call-FUN_100460878", /FUN_100460878/],
      ["special-slot-array-base-0xf0", /0xf0/],
      ["special-slot-count-0x199", /0x199/],
      ["special-index-fields-0x48-0x4c-0x50", /0x48[\s\S]{0,220}0x4c[\s\S]{0,220}0x50/],
    ],
    appendEvidencePatterns: [
      ["append-slot-factory-token", /DAT_101867310/],
      ["ability-factory-call", /FUN_10045e718/],
      ["max-slot-count-0x14", /0x14|\\x14/],
      ["primary-slot-index-field-0x194", /0x194/],
      ["slot-array-base-0x50", /0x50/],
      ["slot-count-field-0x198", /0x198/],
    ],
    dedupeEvidencePatterns: [
      ["fnv1a-basis-0x811c9dc5", /0x811c9dc5/],
      ["default-attack-token", /Ability__DefaultAttack/],
      ["slot-array-base-0x50", /0x50/],
      ["slot-count-field-0x198", /0x198/],
      ["alias-lookup-FUN_1004608fc", /FUN_1004608fc/],
    ],
  },
  {
    platform: "android",
    componentToken: "DAT_02e3ef78",
    registrationFunction: "FUN_00d528c0",
    initializerFunction: "FUN_00d54a4c",
    destructorFunction: "FUN_00d54ac4",
    loaderFunction: "FUN_00d529bc",
    appendSlotFunction: "FUN_00d52be4",
    aliasLookupFunction: "FUN_00d52ca0",
    defaultAttackFunction: "FUN_00d52e3c",
    ownerToken: "DAT_02c09220",
    abilityFactoryToken: "DAT_031a94c4",
    registrationEvidencePatterns: [
      ["component-token-DAT_02e3ef78", /DAT_02e3ef78/],
      ["component-registry-counter-0x13fb0", /0x13fb0/],
      ["component-record-stride-0x2e8", /0x2e8/],
      ["initializer-FUN_00d54a4c", /FUN_00d54a4c/],
      ["destructor-FUN_00d54ac4", /FUN_00d54ac4/],
      ["component-token-field-0xa4", /0xa4/],
      ["component-size-0x1a0", /0xa8\)\s*=\s*0x1a0/],
      ["component-flags-200", /\|\s*200/],
      ["current-record-field-0x13fb8", /0x13fb8/],
    ],
    initializerEvidencePatterns: [
      ["vtable-set", /PTR_thunk_FUN_01985bd0/],
      ["slot-count-field-0x198-zero", /0x198[\s\S]{0,80}0|param_1\[5\]\s*=\s*0/],
      ["special-slot-count-0x199-zero", /0x19a[\s\S]{0,80}0/],
      ["primary-slot-index-0x194-invalid", /0x194[\s\S]{0,80}0xffffffff/],
      ["slot-array-base-0x50-zeroed", /memset\(param_1 \+ 10,0,0xa0\)/],
      ["special-index-range-0x158-0x194-invalid", /0x158[\s\S]{0,120}0x194/],
    ],
    loaderEvidencePatterns: [
      ["definition-pointer-field-0x28", /param_1\s*\+\s*0x28/],
      ["inherited-ability-list-field-0x30", /param_2\s*\+\s*0x30/],
      ["withdraw-field-0x10", /(param_2|lVar5)\s*\+\s*0x10/],
      ["die-field-0x18", /param_1\s*\+\s*0x38|param_2\s*\+\s*0x18/],
      ["dance-field-0x20", /param_1\s*\+\s*0x40|param_2\s*\+\s*0x20/],
      ["taunt-field-0x28", /param_1\s*\+\s*0x48|param_2\s*\+\s*0x28/],
      ["default-attack-list-field-0x40", /param_2\s*\+\s*0x40/],
      ["default-attack-sublist-fields-0x38-0x40", /0x38[\s\S]{0,420}0x40/],
      ["ability-name-withdraw", /Ability__Withdraw/],
      ["ability-name-die", /Ability__Die/],
      ["ability-name-dance", /Ability__Emote_Dance/],
      ["ability-name-taunt", /Ability__Emote_Taunt/],
      ["ability-name-default-attack", /Ability__DefaultAttack/],
      ["slot-array-base-0x50", /0x50/],
      ["append-slot-call-FUN_00d52be4", /FUN_00d52be4/],
      ["special-slot-array-base-0xf0", /0xf0/],
      ["special-slot-count-0x199", /0x199/],
      ["special-index-fields-0x48-0x4c-0x50", /0x48[\s\S]{0,220}0x4c[\s\S]{0,220}0x50/],
    ],
    appendEvidencePatterns: [
      ["append-slot-factory-token", /DAT_031a94c4/],
      ["ability-factory-call", /FUN_00d4fe50/],
      ["max-slot-count-0x14", /0x14|\\x14/],
      ["primary-slot-index-field-0x194", /0x194/],
      ["slot-array-base-0x50", /0x50/],
      ["slot-count-field-0x198", /0x198/],
    ],
    dedupeEvidencePatterns: [
      ["fnv1a-basis-0x811c9dc5", /0x811c9dc5/],
      ["default-attack-token", /Ability__DefaultAttack/],
      ["slot-array-base-0x50", /0x50/],
      ["slot-count-field-0x198", /0x198/],
      ["alias-lookup-FUN_00d52ca0", /FUN_00d52ca0/],
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

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
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

function matchingBlocks(blocks, spec, functionNames) {
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

function stageRow({ blocks, spec, stage, functionNames, patterns, interpretation }) {
  const matchedBlocks = matchingBlocks(blocks, spec, functionNames);
  const foundFunctions = uniq(matchedBlocks.map((block) => block.functionName));
  const text = matchedBlocks.map((block) => block.text).join("\n\n");
  const tags = evidenceTags(text, patterns);
  const status = completeValue(foundFunctions, functionNames, tags, patterns);
  return {
    platform: spec.platform,
    stage,
    componentToken: spec.componentToken,
    ownerToken: spec.ownerToken,
    abilityFactoryToken: spec.abilityFactoryToken,
    functions: foundFunctions.join("|"),
    sourceFiles: uniq(matchedBlocks.map((block) => block.sourceFile)).join("|"),
    lineRange: matchedBlocks.length
      ? `${Math.min(...matchedBlocks.map((block) => block.startLine))}-${Math.max(...matchedBlocks.map((block) => block.endLine))}`
      : "",
    evidenceTags: tags.join("|"),
    complete: status.complete,
    missingEvidence: status.missingEvidence,
    interpretation,
    contextHash: contextHash(text),
  };
}

function extractNativeAttachmentRuntimeDataComponentChainFromSources({
  sourceFiles,
  specs = runtimeDataSpecs,
} = {}) {
  const blocks = sourceBlocks(sourceFiles);
  const rows = [];
  for (const spec of specs) {
    rows.push(
      stageRow({
        blocks,
        spec,
        stage: "component-registration",
        functionNames: [spec.registrationFunction],
        patterns: spec.registrationEvidencePatterns,
        interpretation:
          "Registers the runtime ability-data component consumed by indexed attachment helper calls.",
      }),
      stageRow({
        blocks,
        spec,
        stage: "component-initializer",
        functionNames: [spec.initializerFunction, spec.destructorFunction],
        patterns: spec.initializerEvidencePatterns,
        interpretation:
          "Initializes the 0x1a0 component instance, clears ability slots, and marks special-slot indexes invalid.",
      }),
      stageRow({
        blocks,
        spec,
        stage: "ability-slot-loader",
        functionNames: [spec.loaderFunction, spec.aliasLookupFunction],
        patterns: spec.loaderEvidencePatterns,
        interpretation:
          "Loads inherited abilities, named fallback abilities, default attacks, and special slot references into runtime arrays.",
      }),
      stageRow({
        blocks,
        spec,
        stage: "ability-slot-append",
        functionNames: [spec.appendSlotFunction],
        patterns: spec.appendEvidencePatterns,
        interpretation:
          "Creates one runtime ability slot and appends it into the component slot array at +0x50.",
      }),
      stageRow({
        blocks,
        spec,
        stage: "default-attack-dedupe",
        functionNames: [spec.loaderFunction, spec.defaultAttackFunction, spec.aliasLookupFunction],
        patterns: spec.dedupeEvidencePatterns,
        interpretation:
          "Adds default-attack ability aliases only when an equivalent slot is not already present.",
      }),
    );
  }
  return rows;
}

function summarize(rows, files) {
  const byPlatform = {};
  const byStage = {};
  for (const row of rows) {
    increment(byPlatform, row.platform);
    increment(byStage, row.stage);
  }
  return {
    files,
    rows: rows.length,
    completeRows: rows.filter((row) => row.complete === "yes").length,
    incompleteRows: rows.filter((row) => row.complete !== "yes").length,
    byPlatform,
    byStage,
    componentTokens: uniq(rows.map((row) => row.componentToken)),
  };
}

function exportNativeAttachmentRuntimeDataComponentChain({
  sourcePaths = defaultSourcePaths,
  specs = runtimeDataSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const sourceFiles = readSourceFiles(sourcePaths);
  const rows = extractNativeAttachmentRuntimeDataComponentChainFromSources({ sourceFiles, specs });
  const columns = [
    "platform",
    "stage",
    "componentToken",
    "ownerToken",
    "abilityFactoryToken",
    "functions",
    "sourceFiles",
    "lineRange",
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
  const summary = exportNativeAttachmentRuntimeDataComponentChain({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportNativeAttachmentRuntimeDataComponentChain,
  extractNativeAttachmentRuntimeDataComponentChainFromSources,
  runtimeDataSpecs,
  summarize,
};
