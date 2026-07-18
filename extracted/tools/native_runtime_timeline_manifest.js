#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");
const {
  actionKeysForActionNames,
  buildNativeProjectileSpawnManifest,
} = require("./native_projectile_spawn_manifest");
const { buildNativeEffectSpawnManifest } = require("./native_effect_spawn_manifest");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
];
const defaultHeroNamesPath = "extracted/reports/hero_ability_effect_sound_buff_names.tsv";
const defaultViewerOut = "extracted/viewer/native-runtime-timeline-manifest.json";
const defaultTsvOut = "extracted/reports/native_runtime_timeline_manifest.tsv";
const defaultJsonOut = "extracted/reports/native_runtime_timeline_manifest_summary.json";

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
  if (!filePath || !fs.existsSync(filePath)) return [];
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

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function contextHash(text) {
  return crypto.createHash("md5").update(String(text || "")).digest("hex").slice(0, 12);
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseFloatLiteral(expr) {
  const value = String(expr || "").trim();
  if (/^0x[0-9a-fA-F]{8}$/.test(value)) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, Number.parseInt(value.slice(2), 16) >>> 0, false);
    return Number(view.getFloat32(0, false).toFixed(6));
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number.parseFloat(value);
  return null;
}

function lineNumberForOffset(text, offset) {
  return String(text || "").slice(0, offset).split(/\r?\n/).length;
}

function sourceLineAt(lines, lineNumber) {
  return lines[lineNumber - 1] || "";
}

function actionLooksLikeRuntimeAction(value) {
  const text = String(value || "");
  if (/(Projectile|Muzzle|Gun|Bone_|CenterBody|RightHand|LeftHand|Barrel|FireBall|Aemit|Proj)/i.test(text)) return false;
  if (/AttackToIdle|IdleToAttack|IdleCombat|Move(?:Start|Stop)?$/i.test(text)) return false;
  return actionKeysForActionNames([text]).length > 0;
}

function actionRowsFromSource({ sourceFile, sourceText }) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const rows = [];
  const actionPatterns = [
    /\bFUN_00cf3048\s*\([^;]*?"([^"]+)"[^;]*?\)\s*;/g,
    /\bFUN_1004d2524\s*\(\s*"([^"]+)"/g,
  ];
  for (const block of findFunctionBlocks(lines)) {
    for (const pattern of actionPatterns) {
      for (const match of block.text.matchAll(pattern)) {
        const actionName = match[1];
        if (!actionLooksLikeRuntimeAction(actionName)) continue;
        const line = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
        const sourceLine = sourceLineAt(lines, line).trim();
        rows.push({
          platform: sourcePlatform(sourceFile),
          sourceKind: "native-runtime-action",
          eventKind: "action",
          sourceFile,
          functionName: block.functionName,
          line,
          sourceLine,
          contextHash: contextHash(sourceLine),
          timeSeconds: 0,
          actionName,
          actionKeys: actionKeysForActionNames([actionName]),
          heroNames: [],
          effectToken: "",
          projectileIdHex: "",
          locatorLabel: "",
          emitterLabel: "",
          evidence: "native-action-builder",
        });
      }
    }
  }
  return rows;
}

function delayRowsFromSource({ sourceFile, sourceText }) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const rows = [];
  for (const block of findFunctionBlocks(lines)) {
    const actionRows = actionRowsFromSource({ sourceFile, sourceText: block.text });
    const actionNames = uniqueInOrder(actionRows.map((row) => row.actionName));
    const actionKeys = uniqueInOrder(actionRows.flatMap((row) => row.actionKeys));
    for (const match of block.text.matchAll(/\bFUN_00cf7478\s*\(\s*([^)]+?)\s*\)\s*;/g)) {
      const delayExpr = match[1];
      const timeSeconds = parseFloatLiteral(delayExpr);
      if (!Number.isFinite(timeSeconds)) continue;
      const line = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
      const sourceLine = sourceLineAt(lines, line).trim();
      rows.push({
        platform: sourcePlatform(sourceFile),
        sourceKind: "native-runtime-delay",
        eventKind: "delay",
        sourceFile,
        functionName: block.functionName,
        line,
        sourceLine,
        contextHash: contextHash(sourceLine),
        timeSeconds,
        actionName: delayExpr,
        actionKeys,
        actionNames,
        heroNames: [],
        effectToken: "",
        projectileIdHex: "",
        locatorLabel: "",
        emitterLabel: "",
        evidence: "FUN_00cf7478",
      });
    }
  }
  return rows;
}

function nearestPrecedingDelay(row, delayRows) {
  return [...delayRows]
    .filter((delay) => delay.sourceFile === row.sourceFile && delay.functionName === row.functionName && delay.line < row.line)
    .sort((left, right) => right.line - left.line)[0];
}

function firstCallArgument(sourceLine) {
  const match = String(sourceLine || "").match(/\b[A-Za-z0-9_]+\s*\(\s*([^,\s)]+)/);
  return match?.[1] || "";
}

function effectEventTimeSeconds(row, delayRows) {
  const directTime = parseFloatLiteral(firstCallArgument(row.sourceLine));
  if (Number.isFinite(directTime)) return directTime;
  return nearestPrecedingDelay(row, delayRows)?.timeSeconds || 0;
}

function timelineRowsFromEffectRows(effectRows, delayRows) {
  return (effectRows || []).map((row) => ({
    platform: row.platform,
    sourceKind: "native-runtime-effect",
    eventKind: "effect",
    sourceFile: row.sourceFile,
    functionName: row.functionName,
    line: row.line,
    sourceLine: row.sourceLine,
    contextHash: row.contextHash,
    timeSeconds: effectEventTimeSeconds(row, delayRows),
    actionName: "",
    actionKeys: row.actionKeys || [],
    actionNames: row.actionNames || [],
    heroNames: row.heroNames || [],
    effectToken: row.effectToken || "",
    projectileIdHex: "",
    locatorLabel: row.locatorLabel || "",
    emitterLabel: "",
    effectOptionOffsets: row.effectOptionOffsets || [],
    effectOptionFloatArgs: row.effectOptionFloatArgs || [],
    effectOptions: row.effectOptions || null,
    evidence: row.evidence || row.sourceKind || "",
  }));
}

function timelineRowsFromProjectileRows(projectileRows, delayRows) {
  return (projectileRows || []).map((row) => {
    const delay = nearestPrecedingDelay(row, delayRows);
    return {
      platform: row.platform,
      sourceKind: "native-runtime-projectile",
      eventKind: "projectile",
      sourceFile: row.sourceFile,
      functionName: row.functionName,
      line: row.line,
      sourceLine: row.sourceLine,
      contextHash: row.contextHash,
      timeSeconds: delay?.timeSeconds || 0,
      actionName: "",
      actionKeys: row.actionKeys || [],
      actionNames: row.actionNames || [],
      heroNames: row.heroNames || [],
      effectToken: "",
      projectileIdHex: row.projectileIdHex || "",
      locatorLabel: "",
      emitterLabel: row.emitterLabel || "",
      projectileMode: row.projectileMode,
      projectileLateralOffset: row.projectileLateralOffset,
      projectileCallback18: row.projectileCallback18,
      projectileCallback28: row.projectileCallback28,
      projectileCallback38: row.projectileCallback38,
      evidence: row.evidence || row.sourceKind || "",
    };
  });
}

function extractNativeRuntimeTimelineRowsFromSource(sourceItem, { heroNameRows = [] } = {}) {
  const actionRows = actionRowsFromSource(sourceItem);
  const delayRows = delayRowsFromSource(sourceItem);
  const effectRows = buildNativeEffectSpawnManifest([sourceItem], "TIMELINE", { heroNameRows }).items;
  const projectileRows = buildNativeProjectileSpawnManifest([sourceItem], "TIMELINE", { heroNameRows }).items;
  const rows = [
    ...actionRows,
    ...delayRows,
    ...timelineRowsFromEffectRows(effectRows, delayRows),
    ...timelineRowsFromProjectileRows(projectileRows, delayRows),
  ];
  return sortTimelineRows(rows);
}

function sortTimelineRows(rows) {
  const eventOrder = { action: 0, delay: 1, effect: 2, projectile: 3, attachment: 4 };
  return [...(rows || [])].sort(
    (left, right) =>
      left.platform.localeCompare(right.platform) ||
      String(left.heroNames?.[0] || "").localeCompare(String(right.heroNames?.[0] || "")) ||
      String(left.actionKeys?.[0] || "").localeCompare(String(right.actionKeys?.[0] || "")) ||
      left.sourceFile.localeCompare(right.sourceFile) ||
      left.functionName.localeCompare(right.functionName) ||
      left.line - right.line ||
      (eventOrder[left.eventKind] ?? 99) - (eventOrder[right.eventKind] ?? 99),
  );
}

function summarize(rows) {
  const byEventKind = {};
  const byHero = {};
  const byActionKey = {};
  for (const row of rows || []) {
    byEventKind[row.eventKind] = (byEventKind[row.eventKind] || 0) + 1;
    for (const actionKey of row.actionKeys || []) byActionKey[actionKey] = (byActionKey[actionKey] || 0) + 1;
    for (const heroName of row.heroNames || []) {
      byHero[heroName] = byHero[heroName] || {};
      byHero[heroName][row.eventKind] = (byHero[heroName][row.eventKind] || 0) + 1;
    }
  }
  return {
    rows: rows.length,
    heroes: Object.keys(byHero).length,
    functions: new Set(rows.map((row) => `${row.platform}:${row.functionName}`)).size,
    byEventKind,
    byHero,
    byActionKey,
  };
}

function buildNativeRuntimeTimelineManifest(sourceItems, generatedAt = new Date().toISOString(), { heroNameRows = [] } = {}) {
  const rows = sortTimelineRows(
    (sourceItems || []).flatMap((sourceItem) => extractNativeRuntimeTimelineRowsFromSource(sourceItem, { heroNameRows })),
  );
  return {
    generatedAt,
    summary: summarize(rows),
    items: rows,
  };
}

function exportNativeRuntimeTimelineManifest({
  sourcePaths = defaultSourcePaths,
  heroNamesPath = defaultHeroNamesPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceItems = collectCFiles(sourcePaths).map((sourceFile) => ({
    sourceFile,
    sourceText: fs.readFileSync(sourceFile, "utf8"),
  }));
  const manifest = buildNativeRuntimeTimelineManifest(sourceItems, generatedAt, {
    heroNameRows: readTsv(heroNamesPath),
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "platform",
    "sourceKind",
    "eventKind",
    "heroNames",
    "actionKeys",
    "timeSeconds",
    "effectToken",
    "projectileIdHex",
    "locatorLabel",
    "emitterLabel",
    "projectileMode",
    "projectileLateralOffset",
    "projectileCallback18",
    "projectileCallback28",
    "projectileCallback38",
    "effectOptionOffsets",
    "effectOptionFloatArgs",
    "sourceFile",
    "functionName",
    "line",
    "sourceLine",
    "evidence",
    "contextHash",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeRuntimeTimelineManifest({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeRuntimeTimelineManifest,
  exportNativeRuntimeTimelineManifest,
  extractNativeRuntimeTimelineRowsFromSource,
  parseFloatLiteral,
};
