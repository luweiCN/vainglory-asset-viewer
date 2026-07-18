#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_visual_binding_candidates.tsv";
const defaultJsonOut = "extracted/reports/native_visual_binding_candidates_summary.json";

const defaultFocusTypes = [
  "SkinRep",
  "AnimatedMesh",
  "StaticMesh",
  "AttachmentSkinInfo",
  "Attachment",
  "AliasSet",
  "AlternateAnimation",
  "AttachableEquipment",
  "AttachableEquipmentManifest",
  "SkinManifest",
  "SkinEntry",
  "HatManifest",
  "AnimationPool",
  "NamedAnimation",
];

const manifestNames = [
  "KindredSkinManifest",
  "KindredAttachableEquipmentManifest",
  "KindredHatManifest",
  "KindredCharmsManifest",
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

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function contextHash(text) {
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
}

function contextAroundLines(lines, startLine, endLine, radius = 8) {
  const start = Math.max(0, startLine - 1 - radius);
  const end = Math.min(lines.length, endLine + radius);
  return lines.slice(start, end).join("\n");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sample(values, limit = 10) {
  return uniqueSorted(values).slice(0, limit);
}

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function symbolStrings(text) {
  return [...text.matchAll(/\bPTR_s_([A-Za-z0-9_]+)_\w+/g)].map((match) => match[1]);
}

function findFunctionBlocks(lines) {
  const blocks = [];
  let pending = null;
  let active = null;
  let braceDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const signatureMatch = line.match(/^\w[\w\s*]*\b((?:FUN|thunk_FUN)_[0-9a-fA-F]+|_INIT_[0-9]+)\s*\(/);
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

function registrationFactsFromBlock(block, focusTypes = defaultFocusTypes) {
  const focus = new Set(focusTypes);
  const facts = [];
  const pattern =
    /\b((?:FUN|thunk_FUN)_[0-9a-fA-F]+)\s*\(&(?<symbol>DAT_[0-9a-fA-F]+),\s*(?<kind>[^,]+),\s*"(?<typeName>[^"]+)",\s*(?<typeSize>[^,]+),\s*(?<align>[^)]+)\)/g;
  for (const match of block.text.matchAll(pattern)) {
    const typeName = match.groups.typeName;
    if (!focus.has(typeName)) continue;
    facts.push({
      registrarFunction: match[1],
      symbol: match.groups.symbol,
      typeName,
      typeSize: match.groups.typeSize.trim(),
      typeKind: match.groups.kind.trim(),
    });
  }
  return facts;
}

function collectTypeSymbolsFromSources(sourceItems, focusTypes = defaultFocusTypes) {
  const symbols = new Map();
  for (const item of sourceItems) {
    const lines = item.sourceText.split(/\r?\n/);
    for (const block of findFunctionBlocks(lines)) {
      for (const fact of registrationFactsFromBlock(block, focusTypes)) {
        symbols.set(fact.symbol, fact.typeName);
      }
    }
  }
  return symbols;
}

function matchingFocusTypes(text, focusTypes = defaultFocusTypes) {
  return focusTypes.filter((typeName) => new RegExp(`\\b${regexEscape(typeName)}\\b`).test(text));
}

function matchingManifestNames(text) {
  return manifestNames.filter((manifestName) => text.includes(manifestName));
}

function matchingResources(strings) {
  return strings.filter((value) => {
    if (/^build:\/\//.test(value)) return true;
    if (/Characters\/Attachments\//.test(value)) return true;
    if (/\.(mesh|skeleton|anim|def|shadergraph)$/i.test(value)) return true;
    return false;
  });
}

function matchingBoneNames(strings) {
  return strings.filter((value) => /^Bone_[A-Za-z0-9_]+$/.test(value));
}

function matchingBindTokens(strings) {
  return strings.filter((value) => /\b[A-Za-z0-9_]+_bnd\b/.test(value));
}

function blockAnchors({ blockText, strings, focusTypes, typeSymbols }) {
  const anchors = new Set();
  const focusTypeHits = matchingFocusTypes(blockText, focusTypes);
  const manifestHits = matchingManifestNames(blockText);
  const symbolHits = [...typeSymbols.keys()].filter((symbol) => blockText.includes(symbol));
  const resources = matchingResources(strings);
  const bones = matchingBoneNames(strings);
  const binds = matchingBindTokens(strings);

  if (focusTypeHits.length) anchors.add("focus-type-name");
  if (symbolHits.length) anchors.add("focus-type-symbol");
  if (manifestHits.length) anchors.add("manifest-name");
  if (resources.length) anchors.add("build-resource");
  if (resources.some((value) => /Characters\/Attachments\//.test(value))) anchors.add("attachment-resource");
  if (bones.length) anchors.add("bone-name");
  if (binds.length) anchors.add("bind-token");
  if (/Attachable|Attachment|AttachPoint|AttachTo|Attached|AbilityCAttachPoint/.test(blockText)) anchors.add("attach-keyword");
  if (/\bAlias(Set)?\b/.test(blockText)) anchors.add("alias-keyword");
  if (/"Effect_[^"]+"|PTR_s_Effect_/.test(blockText)) anchors.add("effect");
  if (/"Sound_[^"]+"|PTR_s_Sound_/.test(blockText)) anchors.add("sound");
  if (/"Buff_[^"]+"|PTR_s_Buff_/.test(blockText)) anchors.add("buff");

  return {
    anchors: [...anchors].sort(),
    focusTypeHits,
    manifestHits,
    symbolHits,
    resources,
    bones,
    binds,
  };
}

function candidateStages({ registrationFacts, anchors }) {
  const set = new Set();
  if (registrationFacts.length) set.add("schema-registration");
  if (anchors.includes("manifest-name")) set.add("manifest-load-or-lookup");
  if (anchors.includes("focus-type-symbol")) set.add("type-symbol-xref");
  if (anchors.includes("attachment-resource")) set.add("attachment-resource-chain");
  if (anchors.includes("bone-name") && (anchors.includes("effect") || anchors.includes("sound") || anchors.includes("buff"))) {
    set.add("ability-effect-bone-hook");
  } else if (anchors.includes("bone-name") && anchors.includes("attach-keyword")) {
    set.add("attachment-bone-hook");
  } else if (anchors.includes("bone-name")) {
    set.add("bone-query");
  }
  if (anchors.includes("bind-token") && !set.has("attachment-resource-chain")) set.add("bind-token-evidence");
  return [...set].sort();
}

function confidenceFor({ stages, anchors }) {
  if (stages.includes("schema-registration")) return "confirmed-schema";
  if (stages.includes("manifest-load-or-lookup") && anchors.includes("build-resource")) return "confirmed-manifest-loader";
  if (stages.includes("attachment-resource-chain")) return "confirmed-resource-chain";
  if (stages.includes("type-symbol-xref")) return "strong-native-xref";
  if (stages.includes("ability-effect-bone-hook")) return "separate-ability-effect-path";
  if (stages.includes("attachment-bone-hook")) return "probable-runtime-attachment";
  if (stages.includes("bone-query")) return "generic-bone-query";
  if (stages.includes("bind-token-evidence")) return "resource-bind-token";
  return "";
}

function scoreFor({ stages, anchors }) {
  let score = 0;
  if (stages.includes("schema-registration")) score += 100;
  if (stages.includes("manifest-load-or-lookup")) score += 80;
  if (stages.includes("attachment-resource-chain")) score += 80;
  if (stages.includes("type-symbol-xref")) score += 70;
  if (stages.includes("attachment-bone-hook")) score += 60;
  if (stages.includes("ability-effect-bone-hook")) score += 45;
  if (stages.includes("bone-query")) score += 30;
  if (anchors.includes("bind-token")) score += 15;
  if (anchors.includes("alias-keyword")) score += 15;
  if (anchors.includes("build-resource")) score += 10;
  return score;
}

function shouldKeepCandidate({ stages, anchors }) {
  if (!stages.length) return false;
  if (stages.includes("schema-registration")) return true;
  if (stages.includes("manifest-load-or-lookup")) return true;
  if (stages.includes("attachment-resource-chain")) return true;
  if (stages.includes("type-symbol-xref")) return true;
  if (stages.includes("attachment-bone-hook")) return true;
  if (stages.includes("ability-effect-bone-hook")) return true;
  if (stages.includes("bone-query")) return anchors.includes("bind-token") || anchors.includes("attach-keyword");
  return false;
}

function extractNativeVisualBindingCandidatesFromSource({
  sourceFile,
  sourceText,
  typeSymbols = new Map(),
  focusTypes = defaultFocusTypes,
} = {}) {
  const lines = sourceText.split(/\r?\n/);
  const rows = [];
  for (const block of findFunctionBlocks(lines)) {
    const strings = [...quotedStrings(block.text), ...symbolStrings(block.text)];
    const registrationFacts = registrationFactsFromBlock(block, focusTypes);
    const anchorInfo = blockAnchors({ blockText: block.text, strings, focusTypes, typeSymbols });
    const stages = candidateStages({ registrationFacts, anchors: anchorInfo.anchors });
    if (!shouldKeepCandidate({ stages, anchors: anchorInfo.anchors })) continue;
    const context = contextAroundLines(lines, block.startLine, block.endLine);
    const symbolTypes = uniqueSorted(anchorInfo.symbolHits.map((symbol) => typeSymbols.get(symbol) || symbol));
    rows.push({
      platform: sourcePlatform(sourceFile),
      sourceFile,
      functionName: block.functionName,
      startLine: block.startLine,
      endLine: block.endLine,
      candidateStages: stages.join("|"),
      confidence: confidenceFor({ stages, anchors: anchorInfo.anchors }),
      score: scoreFor({ stages, anchors: anchorInfo.anchors }),
      anchors: anchorInfo.anchors.join("|"),
      focusTypes: uniqueSorted([...anchorInfo.focusTypeHits, ...registrationFacts.map((fact) => fact.typeName), ...symbolTypes]).join("|"),
      manifestNames: sample(anchorInfo.manifestHits, 6).join("|"),
      typeSymbols: sample([...anchorInfo.symbolHits, ...registrationFacts.map((fact) => fact.symbol)], 8).join("|"),
      boneNames: sample(anchorInfo.bones, 12).join("|"),
      bindTokens: sample(anchorInfo.binds, 12).join("|"),
      resources: sample(anchorInfo.resources, 12).join("|"),
      stringSamples: sample(strings, 16).join("|"),
      contextHash: contextHash(context),
      context,
    });
  }
  return rows;
}

function summarize(rows, files) {
  const byStage = {};
  const byConfidence = {};
  const byPlatform = {};
  const manifestNamesSeen = new Set();
  for (const row of rows) {
    byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    for (const stage of String(row.candidateStages || "").split("|").filter(Boolean)) {
      byStage[stage] = (byStage[stage] || 0) + 1;
    }
    for (const manifestName of String(row.manifestNames || "").split("|").filter(Boolean)) {
      manifestNamesSeen.add(manifestName);
    }
  }
  return {
    files,
    rows: rows.length,
    byStage,
    byConfidence,
    byPlatform,
    manifestNames: [...manifestNamesSeen].sort(),
  };
}

function exportNativeVisualBindingCandidates({
  sourcePaths = defaultSourcePaths,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  focusTypes = defaultFocusTypes,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const sourceItems = files.map((sourceFile) => ({
    sourceFile,
    sourceText: fs.readFileSync(sourceFile, "utf8"),
  }));
  const typeSymbols = collectTypeSymbolsFromSources(sourceItems, focusTypes);
  const rows = [];
  for (const item of sourceItems) {
    rows.push(...extractNativeVisualBindingCandidatesFromSource({ ...item, typeSymbols, focusTypes }));
  }

  rows.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.sourceFile !== right.sourceFile) return left.sourceFile.localeCompare(right.sourceFile);
    return Number(left.startLine) - Number(right.startLine);
  });

  const columns = [
    "platform",
    "sourceFile",
    "functionName",
    "startLine",
    "endLine",
    "candidateStages",
    "confidence",
    "score",
    "anchors",
    "focusTypes",
    "manifestNames",
    "typeSymbols",
    "boneNames",
    "bindTokens",
    "resources",
    "stringSamples",
    "contextHash",
  ];
  writeTsv(tsvOut, rows, columns);
  const summary = summarize(rows, files.length);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        typeSymbols: Object.fromEntries([...typeSymbols.entries()].sort()),
        contexts: rows.slice(0, 300).map((row) => ({
          platform: row.platform,
          sourceFile: row.sourceFile,
          functionName: row.functionName,
          startLine: row.startLine,
          endLine: row.endLine,
          candidateStages: row.candidateStages,
          confidence: row.confidence,
          anchors: row.anchors,
          focusTypes: row.focusTypes,
          manifestNames: row.manifestNames,
          boneNames: row.boneNames,
          bindTokens: row.bindTokens,
          resources: row.resources,
          contextHash: row.contextHash,
          context: row.context,
        })),
      },
      null,
      2,
    )}\n`,
  );
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const focusArg = optionValue(args, "--focus", "");
  const focusTypes = focusArg ? focusArg.split(",").map((item) => item.trim()).filter(Boolean) : defaultFocusTypes;
  const summary = exportNativeVisualBindingCandidates({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    focusTypes,
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  blockAnchors,
  candidateStages,
  collectTypeSymbolsFromSources,
  confidenceFor,
  exportNativeVisualBindingCandidates,
  extractNativeVisualBindingCandidatesFromSource,
  findFunctionBlocks,
  quotedStrings,
  registrationFactsFromBlock,
  shouldKeepCandidate,
  summarize,
};
