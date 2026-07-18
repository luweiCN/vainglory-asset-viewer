#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSources = [
  {
    platform: "android",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00a83.c",
  },
  {
    platform: "android",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00a82.c",
  },
  {
    platform: "android",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00a81.c",
  },
  {
    platform: "ios",
    sourcePath: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1000b.c",
  },
];
const defaultViewerOut = "extracted/viewer/native-effect-builder-method-semantics.json";
const defaultTsvOut = "extracted/reports/native_effect_builder_method_semantics.tsv";
const defaultJsonOut = "extracted/reports/native_effect_builder_method_semantics_summary.json";

const outerFieldRoles = new Map([
  ["0x30", "effect-token"],
  ["0x40", "anchor-token"],
  ["0x50", "color-callback"],
  ["0x58", "transform-callback"],
  ["0x60", "extra-transform-callback"],
  ["0x70", "percent-param-callback"],
  ["0x78", "shader-param-callback"],
  ["0x88", "dynamic-value-callback"],
  ["0xa0", "shader-param-name"],
  ["0xa8", "scalar-default"],
  ["0xac", "color"],
  ["0xaf", "alpha"],
  ["0xc8", "flags"],
  ["0xd0", "runtime-filter-mode"],
]);

const innerFieldRoles = new Map([
  ["0x18", "effect-token"],
  ["0x20", "alternate-effect-token"],
  ["0x28", "anchor-token"],
  ["0x30", "effect-token-callback"],
  ["0x38", "color-callback"],
  ["0x40", "transform-callback"],
  ["0x48", "extra-transform-callback"],
  ["0x50", "spawn-transform-callback"],
  ["0x58", "color-param-callback"],
  ["0x60", "percent-param-callback"],
  ["0x68", "shader-param-callback"],
  ["0x70", "dynamic-value-source"],
  ["0x80", "dynamic-value-source"],
  ["0xa0", "shader-param-name"],
  ["0xa8", "scalar-default"],
  ["0xac", "color"],
  ["0xaf", "alpha"],
  ["0xb0", "flags"],
]);

const runtimeFunctionRoles = new Map([
  ["FUN_00a815f4", "spawn-or-update-effect"],
  ["FUN_1000ba598", "spawn-or-update-effect"],
  ["FUN_00a827dc", "spawn-or-update-effect"],
  ["FUN_1000bb21c", "spawn-or-update-effect"],
  ["FUN_00a81d40", "update-existing-effect"],
  ["FUN_1000bca54", "update-existing-effect"],
  ["FUN_00a82f28", "update-existing-effect"],
  ["FUN_1000bb93c", "update-existing-effect"],
  ["FUN_00a81c88", "deactivate-or-remove-effect"],
  ["FUN_1000babc4", "deactivate-or-remove-effect"],
  ["FUN_00a82e70", "deactivate-or-remove-effect"],
  ["FUN_1000bb848", "deactivate-or-remove-effect"],
  ["FUN_00a82514", "resolve-overhead-effect-token"],
  ["FUN_1000bafb0", "resolve-overhead-effect-token"],
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function hexOffset(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return `0x${Number.parseInt(raw.slice(2), 16).toString(16)}`;
  if (/^\d+$/.test(raw)) return `0x${Number.parseInt(raw, 10).toString(16)}`;
  return raw;
}

function subtractHexOffset(value, delta) {
  const number = Number.parseInt(String(value).replace(/^0x/, ""), 16);
  if (!Number.isFinite(number)) return "";
  return `0x${Math.max(0, number - delta).toString(16)}`;
}

function stringLiterals(text) {
  return unique([...String(text || "").matchAll(/"([^"\r\n]+)"/g)].map((match) => match[1]));
}

function fieldWriteOffsets(text) {
  const offsets = [];
  const pattern = /\*\([^)]*\*\)\s*\(\s*param_1\s*\+\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*=/g;
  for (const match of String(text || "").matchAll(pattern)) offsets.push(hexOffset(match[1]));
  return unique(offsets);
}

function modeBits(text) {
  const bits = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!/param_1\s*\+\s*(?:200|0xb0|0xd0)/.test(line)) continue;
    const match = line.match(/\|\s*(0x[0-9a-fA-F]+|\d+)\s*;/);
    if (match) bits.push(match[1]);
    const maskMatch = line.match(/param_2\s*&\s*(\d+)/);
    if (maskMatch) bits.push(`param_2&${maskMatch[1]}`);
  }
  return unique(bits);
}

function calledRuntimeFunctions(text) {
  const calls = [];
  for (const functionName of runtimeFunctionRoles.keys()) {
    if (new RegExp(`\\b${functionName}\\s*\\(`).test(text)) calls.push(functionName);
  }
  return calls;
}

function inferLayer(blockText, offsets, calls) {
  if (/\bparam_1\s*\+\s*0x18\b/.test(blockText) && (calls.length || /return\s+param_1\s*\+\s*0x18/.test(blockText))) {
    return "outer-builder";
  }
  if (/\bparam_1\s*\+\s*200\b/.test(blockText)) return "outer-builder";
  if (offsets.includes("0xc8") || offsets.includes("0xd0")) return "outer-builder";
  return "inner-effect-binding";
}

function semanticRolesFor({ layer, offsets, calls }) {
  const roles = [];
  const roleMap = layer === "outer-builder" ? outerFieldRoles : innerFieldRoles;
  for (const offset of offsets) {
    const role = roleMap.get(offset);
    if (role && role !== "flags") roles.push(role);
  }
  for (const call of calls) roles.push(runtimeFunctionRoles.get(call));
  return unique(roles);
}

function firstEvidenceLine(block) {
  const lines = block.text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (/param_1\s*\+|FUN_00a8|FUN_1000b/.test(lines[index])) return block.startLine + index;
  }
  return block.startLine;
}

function analyzeBuilderMethodSemantics(sourceText, { platform = "", sourceFile = "" } = {}) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];

  for (const block of blocks) {
    const offsets = fieldWriteOffsets(block.text);
    const calls = calledRuntimeFunctions(block.text);
    const strings = stringLiterals(block.text).filter((value) => /^(Effect_|Bone_|CenterBody|OverHead)/.test(value));
    if (!offsets.length && !calls.length && !strings.length) continue;

    const layer = inferLayer(block.text, offsets, calls);
    const roles = semanticRolesFor({ layer, offsets, calls });
    if (!roles.length) continue;
    const semanticOffsets = offsets.filter((offset) => {
      const role = (layer === "outer-builder" ? outerFieldRoles : innerFieldRoles).get(offset);
      return role && role !== "flags";
    });
    const innerOffsets =
      layer === "outer-builder"
        ? unique(semanticOffsets.map((offset) => subtractHexOffset(offset, 0x18)))
        : [];

    rows.push({
      platform,
      sourceFile,
      functionName: block.functionName,
      line: firstEvidenceLine(block),
      layer,
      semanticRoles: roles.join("|"),
      fieldOffsets: semanticOffsets.join("|"),
      innerFieldOffsets: innerOffsets.join("|"),
      modeBits: modeBits(block.text).join("|"),
      calledRuntimeFunctions: calls.join("|"),
      stringLiterals: strings.join("|"),
    });
  }

  return rows;
}

function summarize(rows) {
  const byPlatform = {};
  const byLayer = {};
  const bySemanticRole = {};
  for (const row of rows) {
    byPlatform[row.platform || ""] = (byPlatform[row.platform || ""] || 0) + 1;
    byLayer[row.layer || ""] = (byLayer[row.layer || ""] || 0) + 1;
    bySemanticRole[row.semanticRoles || ""] = (bySemanticRole[row.semanticRoles || ""] || 0) + 1;
  }
  return { rows: rows.length, byPlatform, byLayer, bySemanticRole };
}

function reportRowsForSemantics(manifest) {
  return (manifest.items || []).map((item) => ({
    platform: item.platform,
    sourceFile: item.sourceFile,
    functionName: item.functionName,
    line: item.line,
    layer: item.layer,
    semanticRoles: item.semanticRoles,
    fieldOffsets: item.fieldOffsets,
    innerFieldOffsets: item.innerFieldOffsets,
    modeBits: item.modeBits,
    calledRuntimeFunctions: item.calledRuntimeFunctions,
    stringLiterals: item.stringLiterals,
  }));
}

function exportNativeEffectBuilderMethodSemantics({
  sources = defaultSources,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const items = [];
  for (const source of sources) {
    if (!fs.existsSync(source.sourcePath)) continue;
    items.push(
      ...analyzeBuilderMethodSemantics(fs.readFileSync(source.sourcePath, "utf8"), {
        platform: source.platform,
        sourceFile: source.sourcePath,
      }),
    );
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceCount: sources.length,
    summary: summarize(items),
    items,
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForSemantics(manifest), [
    "platform",
    "sourceFile",
    "functionName",
    "line",
    "layer",
    "semanticRoles",
    "fieldOffsets",
    "innerFieldOffsets",
    "modeBits",
    "calledRuntimeFunctions",
    "stringLiterals",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectBuilderMethodSemantics({
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  analyzeBuilderMethodSemantics,
  exportNativeEffectBuilderMethodSemantics,
  reportRowsForSemantics,
  summarize,
};
