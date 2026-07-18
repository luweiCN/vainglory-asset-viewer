#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultProjectileManifestPath = "extracted/viewer/native-projectile-spawn-manifest.json";
const defaultViewerOut = "extracted/viewer/native-projectile-callback-semantics.json";
const defaultTsvOut = "extracted/reports/native_projectile_callback_semantics.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function tsvEscape(value) {
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniqueInOrder(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    if (value == null || value === "" || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function stableId(parts) {
  return crypto.createHash("md5").update(parts.join("\t")).digest("hex").slice(0, 16);
}

function contextHash(text) {
  return crypto.createHash("md5").update(String(text || "")).digest("hex").slice(0, 12);
}

function parseIntegerLiteral(expr) {
  const value = String(expr || "").trim();
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value.slice(2), 16);
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function parseFloatLiteral(expr) {
  const value = String(expr || "").trim();
  if (/^0x[0-9a-fA-F]{8}$/.test(value)) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, Number.parseInt(value.slice(2), 16) >>> 0, false);
    return view.getFloat32(0, false);
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number.parseFloat(value);
  return null;
}

function projectileIdHex(value) {
  return Number.isInteger(value) ? `0x${value.toString(16)}` : "";
}

function quotedStrings(text) {
  return [...String(text || "").matchAll(/"([^"\r\n]+)"/g)].map((match) => match[1]);
}

function pointerWriteExpressions(blockText, pointerName) {
  return [...String(blockText || "").matchAll(new RegExp(`\\*${pointerName}\\s*=\\s*([^;]+);`, "g"))].map((match) => match[1].trim());
}

function literalAssignments(blockText, variableName) {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...String(blockText || "").matchAll(new RegExp(`\\b${escaped}\\s*=\\s*(0x[0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\s*;`, "g"))].map(
    (match) => match[1],
  );
}

function numericLiteralsForPointer(blockText, pointerName) {
  const values = [];
  for (const expr of pointerWriteExpressions(blockText, pointerName)) {
    if (/^(0x[0-9a-fA-F]+|\d+(?:\.\d+)?)$/.test(expr)) {
      values.push(expr);
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(expr)) values.push(...literalAssignments(blockText, expr));
  }
  return uniqueInOrder(values);
}

function constantValuesFromLiterals(literals) {
  return uniqueInOrder(
    literals
      .map((literal) => {
        const floatValue = parseFloatLiteral(literal);
        if (Number.isFinite(floatValue)) return Number(floatValue.toFixed(6)).toString();
        const integerValue = parseIntegerLiteral(literal);
        return Number.isInteger(integerValue) ? integerValue.toString() : "";
      })
      .filter(Boolean),
  );
}

function evidenceTagsForBlock(blockText) {
  const tags = [];
  const assignmentRightSides = [...String(blockText || "").matchAll(/=\s*([^;]+);/g)].map((match) => match[1]).join("\n");
  if (/\*param_3\s*=/.test(blockText)) tags.push("writes-projectile-id");
  if (/\*param_4\s*=/.test(blockText)) tags.push("writes-emitter-label");
  if (/\bif\s*\(/.test(blockText)) tags.push("conditional");
  if (/\b(?:FUN_00d6bbac|FUN_00d44008|FUN_1003d4e0c)\b|Buff_|Talent_/.test(blockText)) tags.push("state-query");
  if (/\b(?:distance|Distance|range|Range)\b|FUN_00d5ba88|FUN_00ceb350/.test(blockText)) tags.push("target-distance");
  if (/\*\s*param_\d+\s*=/.test(blockText)) tags.push("pointer-output");
  if (/(?:\w|\))\s*[*\/]\s*(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?|param_\d+)/.test(assignmentRightSides)) tags.push("arithmetic");
  return uniqueInOrder(tags);
}

function classifyProjectileCallbackBlock(blockText) {
  const text = String(blockText || "");
  const projectileIdLiterals = numericLiteralsForPointer(text, "param_3");
  const projectileIdHexes = uniqueInOrder(projectileIdLiterals.map((literal) => projectileIdHex(parseIntegerLiteral(literal))).filter(Boolean));
  const emitterLabels = uniqueInOrder(quotedStrings(text).filter((value) => /Muzzle|Projectile|Bone|Hand|Barrel|Tip|Attack/i.test(value)));
  const outputLiterals = uniqueInOrder([...numericLiteralsForPointer(text, "param_2"), ...numericLiteralsForPointer(text, "param_3")]);
  const constantValues = constantValuesFromLiterals(outputLiterals);
  const evidenceTags = evidenceTagsForBlock(text);

  let semanticClass = "unresolved";
  if (projectileIdHexes.length || emitterLabels.length) {
    semanticClass = evidenceTags.includes("conditional") || evidenceTags.includes("state-query") ? "state-conditional-emitter" : "constant-emitter";
  } else if (evidenceTags.includes("target-distance")) {
    semanticClass = "target-distance";
  } else if (evidenceTags.includes("arithmetic")) {
    semanticClass = "multiplier";
  } else if (constantValues.length) {
    semanticClass = "constant";
  } else if (evidenceTags.includes("state-query")) {
    semanticClass = "attribute-derived";
  }

  return {
    semanticClass,
    projectileIdHexes,
    emitterLabels,
    constantValues,
    evidenceTags: evidenceTags.join("|"),
  };
}

function blockForFunction(sourceText, functionName) {
  return findFunctionBlocks(String(sourceText || "").split(/\r?\n/)).find((block) => block.functionName === functionName);
}

function callbackSlotsForRow(row) {
  return [
    ["callbackFunction", row.callbackFunction],
    ["projectileCallback18", row.projectileCallback18],
    ["projectileCallback28", row.projectileCallback28],
    ["projectileCallback38", row.projectileCallback38],
  ].filter(([, functionName]) => /^FUN_[0-9a-fA-F]+$/.test(functionName || ""));
}

function summarize(items) {
  const bySemanticClass = {};
  const byCallbackSlot = {};
  const heroes = new Set();
  for (const item of items) {
    bySemanticClass[item.semanticClass] = (bySemanticClass[item.semanticClass] || 0) + 1;
    byCallbackSlot[item.callbackSlot] = (byCallbackSlot[item.callbackSlot] || 0) + 1;
    for (const heroName of item.heroNames || []) heroes.add(heroName);
  }
  return {
    rows: items.length,
    heroes: heroes.size,
    bySemanticClass,
    byCallbackSlot,
  };
}

function buildNativeProjectileCallbackSemantics({ projectileRows = [], sourceReader = (filePath) => fs.readFileSync(filePath, "utf8"), generatedAt = new Date().toISOString() } = {}) {
  const sourceCache = new Map();
  const items = [];
  for (const row of projectileRows || []) {
    const slots = callbackSlotsForRow(row);
    if (!slots.length || !row.sourceFile) continue;
    if (!sourceCache.has(row.sourceFile)) sourceCache.set(row.sourceFile, sourceReader(row.sourceFile));
    const sourceText = sourceCache.get(row.sourceFile);
    for (const [callbackSlot, callbackFunction] of slots) {
      const block = blockForFunction(sourceText, callbackFunction);
      const classification = classifyProjectileCallbackBlock(block?.text || "");
      items.push({
        id: stableId([row.sourceFile, row.functionName, callbackSlot, callbackFunction, row.emitterLabel || ""]),
        platform: row.platform || "",
        sourceFile: row.sourceFile,
        functionName: row.functionName || "",
        callbackSlot,
        callbackFunction,
        callbackLine: block?.startLine || "",
        contextHash: contextHash(block?.text || ""),
        sourceKind: row.sourceKind || "",
        actionKeys: row.actionKeys || [],
        heroNames: row.heroNames || [],
        emitterLabel: row.emitterLabel || "",
        projectileIdHex: row.projectileIdHex || "",
        semanticClass: classification.semanticClass,
        projectileIdHexes: classification.projectileIdHexes,
        emitterLabels: classification.emitterLabels,
        constantValues: classification.constantValues,
        evidenceTags: classification.evidenceTags,
      });
    }
  }
  items.sort((left, right) => {
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.heroNames.join("|") !== right.heroNames.join("|")) return left.heroNames.join("|").localeCompare(right.heroNames.join("|"));
    if (left.callbackFunction !== right.callbackFunction) return left.callbackFunction.localeCompare(right.callbackFunction);
    return left.callbackSlot.localeCompare(right.callbackSlot);
  });
  return {
    generatedAt,
    count: items.length,
    summary: summarize(items),
    items,
  };
}

function exportNativeProjectileCallbackSemantics({
  projectileManifestPath = defaultProjectileManifestPath,
  jsonOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const projectileManifest = JSON.parse(fs.readFileSync(projectileManifestPath, "utf8"));
  const manifest = buildNativeProjectileCallbackSemantics({ projectileRows: projectileManifest.items || projectileManifest });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "platform",
    "heroNames",
    "actionKeys",
    "emitterLabel",
    "projectileIdHex",
    "callbackSlot",
    "callbackFunction",
    "semanticClass",
    "projectileIdHexes",
    "emitterLabels",
    "constantValues",
    "evidenceTags",
    "sourceFile",
    "functionName",
    "callbackLine",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const summary = exportNativeProjectileCallbackSemantics({
    projectileManifestPath: optionValue(process.argv, "--projectile-manifest", defaultProjectileManifestPath),
    jsonOut: optionValue(process.argv, "--json-out", defaultViewerOut),
    tsvOut: optionValue(process.argv, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeProjectileCallbackSemantics,
  classifyProjectileCallbackBlock,
  exportNativeProjectileCallbackSemantics,
};
