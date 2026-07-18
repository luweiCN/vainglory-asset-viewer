#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");
const { inferAssignedVar } = require("./native_skin_manifest_callers");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_attachment_manifest_callers.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_manifest_caller_context.json";

const defaultGetterSpecs = [
  {
    platform: "android",
    functionName: "FUN_00ccebac",
    manifest: "KindredAttachableEquipmentManifest",
    lookupKind: "attachable-entry-by-name",
  },
  {
    platform: "android",
    functionName: "FUN_00ccecc4",
    manifest: "KindredAttachableEquipmentManifest",
    lookupKind: "attachable-entry-by-hash",
  },
  {
    platform: "ios",
    functionName: "FUN_100331a84",
    manifest: "KindredAttachableEquipmentManifest",
    lookupKind: "attachable-entry-by-hash",
  },
  {
    platform: "android",
    functionName: "FUN_00ccf8d0",
    manifest: "KindredHatManifest",
    lookupKind: "hat-entry-by-name",
  },
  {
    platform: "android",
    functionName: "FUN_00ccf9e8",
    manifest: "KindredHatManifest",
    lookupKind: "hat-entry-by-hash",
  },
  {
    platform: "ios",
    functionName: "FUN_1003320d8",
    manifest: "KindredHatManifest",
    lookupKind: "hat-entry-by-name",
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

function parseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = text.startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function hex(value) {
  if (!Number.isFinite(value)) return "";
  return `0x${value.toString(16)}`;
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

function contextAroundLine(lines, lineNumber, radius = 10) {
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join("\n");
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function lineForBlockMatch(block, matchIndex) {
  return block.startLine + block.text.slice(0, matchIndex).split(/\r?\n/).length - 1;
}

function statementEnd(text, index) {
  const semicolon = text.indexOf(";", index);
  return semicolon >= 0 ? semicolon + 1 : text.length;
}

function lifetimeTextForAssignedVar(blockText, varName, callIndex) {
  if (!varName) return blockText.slice(callIndex);

  const callEnd = statementEnd(blockText, callIndex);
  const afterCall = blockText.slice(callEnd);
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const reassignmentPattern = new RegExp(`(?:^|\\n)\\s*${escapedVar}\\s*=`, "g");
  const reassignment = reassignmentPattern.exec(afterCall);
  if (!reassignment) return blockText.slice(callIndex);

  const reassignmentStart = callEnd + reassignment.index;
  return blockText.slice(callIndex, statementEnd(blockText, reassignmentStart));
}

function fieldOffsetsForVarLifetime(blockText, varName, callIndex) {
  if (!varName) return [];

  const lifetimeText = lifetimeTextForAssignedVar(blockText, varName, callIndex);
  const offsets = new Set();
  const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pointerPattern = new RegExp(`\\*\\s*\\([^)]+\\*\\)\\s*\\([^)]*\\b${escapedVar}\\s*\\+\\s*(0x[0-9a-fA-F]+|\\d+)`, "g");
  for (const match of lifetimeText.matchAll(pointerPattern)) offsets.add(hex(parseNumber(match[1])));

  const addressPattern = new RegExp(`\\b${escapedVar}\\s*\\+\\s*(0x[0-9a-fA-F]+|\\d+)`, "g");
  for (const match of lifetimeText.matchAll(addressPattern)) offsets.add(hex(parseNumber(match[1])));

  const arrayPattern = new RegExp(`\\b${escapedVar}\\[(\\d+)\\]`, "g");
  for (const match of lifetimeText.matchAll(arrayPattern)) offsets.add(hex(Number.parseInt(match[1], 10) * 8));

  if (new RegExp(`\\*\\s*${escapedVar}\\b`).test(lifetimeText)) offsets.add("0x0");

  return [...offsets].filter(Boolean).sort((left, right) => parseNumber(left) - parseNumber(right));
}

function inferConsumerRole({ manifest, consumedOffsets, context }) {
  const offsets = new Set(String(consumedOffsets || "").split("|").filter(Boolean));
  if (/HatEquipped|SocialPingPackEquipped|PlayerTitleEquipped|PlayerAvatarEquipped/.test(context)) {
    return "player-loadout-state";
  }
  if (manifest === "KindredAttachableEquipmentManifest" && offsets.has("0x8")) {
    return "runtime-attachable-resource-lookup";
  }
  if (manifest === "KindredHatManifest" && offsets.has("0x28")) {
    return "hat-catalog-resource-list";
  }
  return "manifest-entry-consumer";
}

function extractNativeAttachmentManifestCallersFromSource({
  sourceFile,
  sourceText,
  getterSpecs = defaultGetterSpecs,
} = {}) {
  const platform = sourcePlatform(sourceFile);
  const lines = sourceText.split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];
  const specs = getterSpecs.filter((spec) => !spec.platform || !platform || spec.platform === platform);

  for (const block of blocks) {
    const bodyStart = block.text.indexOf("{");
    for (const spec of specs) {
      const pattern = new RegExp(`\\b${spec.functionName}\\s*\\(`, "g");
      for (const match of block.text.matchAll(pattern)) {
        if (bodyStart >= 0 && match.index < bodyStart) continue;
        const line = lineForBlockMatch(block, match.index);
        const context = contextAroundLine(lines, line);
        const assignedVar = inferAssignedVar(block.text, match.index, spec.functionName);
        const consumedOffsets = fieldOffsetsForVarLifetime(block.text, assignedVar, match.index).join("|");
        rows.push({
          platform,
          manifest: spec.manifest,
          sourceFile,
          callerFunction: block.functionName,
          line,
          getterFunction: spec.functionName,
          lookupKind: spec.lookupKind,
          assignedVar,
          consumedOffsets,
          consumerRole: inferConsumerRole({ manifest: spec.manifest, consumedOffsets, context }),
          stringLiterals: quotedStrings(context).slice(0, 12).join("|"),
          hasBuildResource: /build:\/\//.test(context) ? "yes" : "no",
          hasManifestName: context.includes(spec.manifest) ? "yes" : "no",
          contextHash: contextHash(context),
          context,
        });
      }
    }
  }

  return rows.sort((left, right) => left.line - right.line || left.getterFunction.localeCompare(right.getterFunction));
}

function summarize(rows, files) {
  const byManifest = {};
  const byGetter = {};
  const byLookupKind = {};
  const byConsumerRole = {};
  const consumedOffsetCounts = {};
  for (const row of rows) {
    byManifest[row.manifest] = (byManifest[row.manifest] || 0) + 1;
    byGetter[row.getterFunction] = (byGetter[row.getterFunction] || 0) + 1;
    byLookupKind[row.lookupKind] = (byLookupKind[row.lookupKind] || 0) + 1;
    byConsumerRole[row.consumerRole] = (byConsumerRole[row.consumerRole] || 0) + 1;
    const manifestOffsets = consumedOffsetCounts[row.manifest] || {};
    for (const offset of row.consumedOffsets.split("|").filter(Boolean)) {
      manifestOffsets[offset] = (manifestOffsets[offset] || 0) + 1;
    }
    consumedOffsetCounts[row.manifest] = manifestOffsets;
  }
  return {
    files,
    rows: rows.length,
    byManifest,
    byGetter,
    byLookupKind,
    byConsumerRole,
    consumedOffsetCounts,
  };
}

function exportNativeAttachmentManifestCallers({
  sourcePaths = defaultSourcePaths,
  getterSpecs = defaultGetterSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const files = collectCFiles(sourcePaths);
  const rows = [];
  for (const filePath of files) {
    rows.push(
      ...extractNativeAttachmentManifestCallersFromSource({
        sourceFile: filePath,
        sourceText: fs.readFileSync(filePath, "utf8"),
        getterSpecs,
      }),
    );
  }

  rows.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.manifest !== right.manifest) return left.manifest.localeCompare(right.manifest);
    if (left.sourceFile !== right.sourceFile) return left.sourceFile.localeCompare(right.sourceFile);
    return left.line - right.line;
  });

  const columns = [
    "platform",
    "manifest",
    "sourceFile",
    "callerFunction",
    "line",
    "getterFunction",
    "lookupKind",
    "assignedVar",
    "consumedOffsets",
    "consumerRole",
    "stringLiterals",
    "hasBuildResource",
    "hasManifestName",
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
  const summary = exportNativeAttachmentManifestCallers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultGetterSpecs,
  exportNativeAttachmentManifestCallers,
  extractNativeAttachmentManifestCallersFromSource,
  fieldOffsetsForVarLifetime,
  lifetimeTextForAssignedVar,
};
