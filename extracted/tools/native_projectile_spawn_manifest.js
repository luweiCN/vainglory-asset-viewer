#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { collectCFiles, findFunctionBlocks } = require("./native_bind_xrefs");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
];
const defaultHeroNamesPath = "extracted/reports/hero_ability_effect_sound_buff_names.tsv";
const defaultViewerOut = "extracted/viewer/native-projectile-spawn-manifest.json";
const defaultTsvOut = "extracted/reports/native_projectile_spawn_manifest.tsv";
const defaultJsonOut = "extracted/reports/native_projectile_spawn_manifest_summary.json";

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

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function sourcePlatform(sourceFile) {
  if (/android/i.test(sourceFile)) return "android";
  if (/GameKindred_decompile_output/.test(sourceFile)) return "ios";
  return "";
}

function contextHash(text) {
  return crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
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

function splitCallArguments(argumentText) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of String(argumentText || "")) {
    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) args.push(current.trim());
  return args;
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

function quotedLiteral(expr) {
  const match = String(expr || "").trim().match(/^"([^"]*)"$/);
  return match ? match[1] : "";
}

function quotedStrings(text) {
  return [...String(text || "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function effectTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/Effect_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function soundTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/Sound_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function buffTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/Buff_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function boneTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/\bBone_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function buildHeroTokenLookup(heroNameRows = []) {
  const byToken = new Map();
  const heroes = uniqueInOrder((heroNameRows || []).map((row) => row.hero)).sort((left, right) => right.length - left.length);
  for (const row of heroNameRows || []) {
    if (!row.hero || !row.kind || !row.name) continue;
    byToken.set(`${row.kind}_${row.hero}_${row.name}`, row.hero);
  }
  return { byToken, heroes };
}

function heroNamesForTokens(tokens, heroTokenLookup) {
  const heroNames = [];
  for (const token of tokens || []) {
    const exact = heroTokenLookup.byToken.get(token);
    if (exact) {
      heroNames.push(exact);
      continue;
    }
    const match = String(token || "").match(/^(Effect|Sound|Buff|Talent|Ability)_([A-Za-z0-9]+)_/);
    if (!match) continue;
    const hero = heroTokenLookup.heroes.find((candidate) => token.startsWith(`${match[1]}_${candidate}_`));
    if (hero) heroNames.push(hero);
  }
  return uniqueInOrder(heroNames);
}

function annotateHeroNames(row, heroTokenLookup) {
  const heroNames = heroNamesForTokens(
    [...(row.effectTokens || []), ...(row.soundTokens || []), ...(row.buffTokens || [])],
    heroTokenLookup,
  );
  return {
    ...row,
    heroNames,
    heroEvidence: heroNames.length ? row.heroEvidenceHint || "hero-token-table" : "",
  };
}

function functionKey(sourceFile, functionName) {
  return `${sourceFile || ""}\t${functionName || ""}`;
}

function appendHeroNames(index, key, heroNames) {
  if (!key || !heroNames?.length) return;
  const values = index.get(key) || [];
  index.set(key, uniqueInOrder([...values, ...heroNames]));
}

function propagateHeroContext(items) {
  for (let pass = 0; pass < 3; pass += 1) {
    const byFunction = new Map();
    const byCallbackTarget = new Map();
    for (const item of items || []) {
      if (!item.heroNames?.length) continue;
      appendHeroNames(byFunction, functionKey(item.sourceFile, item.functionName), item.heroNames);
      if (item.callbackFunction) appendHeroNames(byCallbackTarget, functionKey(item.sourceFile, item.callbackFunction), item.heroNames);
    }

    let changed = false;
    for (const item of items || []) {
      if (item.heroNames?.length) continue;
      const helperHeroes = item.helperFunction ? byFunction.get(functionKey(item.sourceFile, item.helperFunction)) : null;
      const callbackHeroes = byCallbackTarget.get(functionKey(item.sourceFile, item.functionName));
      const sameFunctionHeroes = byFunction.get(functionKey(item.sourceFile, item.functionName));
      const heroNames = uniqueInOrder([...(helperHeroes || []), ...(callbackHeroes || []), ...(sameFunctionHeroes || [])]);
      if (!heroNames.length) continue;
      item.heroNames = heroNames;
      item.heroEvidence = helperHeroes?.length
        ? "helper-function-hero-context"
        : callbackHeroes?.length
          ? "callback-registration-hero-context"
          : "same-function-hero-context";
      changed = true;
    }
    if (!changed) break;
  }
  return items;
}

function actionKeysForActionName(actionName) {
  const value = String(actionName || "");
  const keys = [];
  if (/CritAttack|Attack_Crit|_Crit(?:$|_)/i.test(value)) keys.push("attack_crit");
  if (/AltAttack|Attack_Alt|_Alt(?:$|_)/i.test(value)) keys.push("attack_alt");
  if (/Attack/i.test(value)) keys.push("attack");
  if (/Ability0?1|Ability__[^_]+__A(?:$|_)/i.test(value)) keys.push("ability01");
  if (/Ability0?2|Ability__[^_]+__B(?:$|_)/i.test(value)) keys.push("ability02");
  if (/Ability0?3|Ability__[^_]+__C(?:$|_)/i.test(value)) keys.push("ability03");
  if (/Withdraw|Recall/i.test(value)) keys.push("withdraw");
  return uniqueInOrder(keys);
}

function actionLooksLikeRuntimeAction(value) {
  const text = String(value || "");
  if (/(Projectile|Muzzle|Gun|Bone_|CenterBody|RightHand|LeftHand|Barrel|FireBall|Aemit|Proj)/i.test(text)) return false;
  if (/AttackToIdle|IdleToAttack|IdleCombat|Move(?:Start|Stop)?$/i.test(text)) return false;
  return actionKeysForActionName(text).length > 0 || /^(FastAttack|AchillesCut)$/i.test(text);
}

function actionNamesFromBlock(blockText) {
  const names = [];
  for (const match of String(blockText || "").matchAll(/\bFUN_00cf3048\s*\([^;]*?"([^"]+)"/g)) {
    if (actionLooksLikeRuntimeAction(match[1])) names.push(match[1]);
  }
  for (const match of String(blockText || "").matchAll(/\(\*\*\(code \*\*\)\([^;]+?\)\)\([^;\n]*?"([^"]+)"[^;\n]*?\)\s*;/g)) {
    if (actionLooksLikeRuntimeAction(match[1])) names.push(match[1]);
  }
  for (const match of String(blockText || "").matchAll(/\bFUN_1004d2524\s*\(\s*"([^"]+)"/g)) {
    if (actionLooksLikeRuntimeAction(match[1])) names.push(match[1]);
  }
  return uniqueInOrder(names);
}

function actionKeysForActionNames(actionNames) {
  return uniqueInOrder((actionNames || []).flatMap(actionKeysForActionName));
}

function actionKeysForRuntimeToken(token) {
  const value = String(token || "");
  const keys = [];
  if (/(?:^|_)AA(?:_|$)|DefaultAttack|BasicAttack|Auto_Attack|Crit_Attack/i.test(value)) keys.push("attack");
  if (/CritAttack|Crit_Attack|Attack_Crit|_Crit(?:$|_)/i.test(value)) keys.push("attack_crit");
  if (/AltAttack|Attack_Alt|_Alt(?:$|_)/i.test(value)) keys.push("attack_alt");
  if (/(?:^|_)A(?:_|$)|Ability_?A|Ability0?1|(?:^|_)S1(?:_|$)/i.test(value)) keys.push("ability01");
  if (/(?:^|_)B(?:_|$)|Ability_?B|Ability0?2|(?:^|_)S2(?:_|$)/i.test(value)) keys.push("ability02");
  if (/(?:^|_)C(?:_|$)|Ability_?C|Ability0?3|(?:^|_)S3(?:_|$)/i.test(value)) keys.push("ability03");
  return keys;
}

function actionKeysForNativeContext(actionNames = [], effectTokens = [], soundTokens = [], buffTokens = [], runtimeTokens = []) {
  return uniqueInOrder([
    ...actionKeysForActionNames(actionNames),
    ...runtimeTokens.flatMap((token) => [...actionKeysForActionName(token), ...actionKeysForRuntimeToken(token)]),
    ...[...effectTokens, ...soundTokens, ...buffTokens].flatMap(actionKeysForRuntimeToken),
  ]);
}

function lineNumberForOffset(text, offset) {
  return String(text || "").slice(0, offset).split(/\r?\n/).length;
}

function sourceLineAt(lines, lineNumber) {
  return lines[lineNumber - 1] || "";
}

function fnv1aHashHex(text) {
  let hash = 0x811c9dc5;
  for (const char of Buffer.from(String(text || ""), "utf8")) {
    hash ^= char;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function rowBase({ sourceFile, block, line, sourceLine, sourceKind }) {
  return {
    platform: sourcePlatform(sourceFile),
    sourceKind,
    sourceFile,
    functionName: block.functionName,
    line,
    sourceLine: sourceLine.trim(),
    contextHash: contextHash(sourceLine),
  };
}

function postSpawnModifierSegment(blockText, match) {
  const start = match.index + match[0].length;
  const rest = String(blockText || "").slice(start);
  const nextSpawnOffset = rest.search(/\b(?:FUN_00cfb17c|FUN_00cfcad8|FUN_10000f250)\b/);
  const segment = nextSpawnOffset >= 0 ? rest.slice(0, nextSpawnOffset) : rest;
  return segment.split(/\r?\n/).slice(0, 12).join("\n");
}

function callArguments(segment, functionName) {
  const match = String(segment || "").match(new RegExp(`\\b${functionName}\\s*\\(([^;]+?)\\)\\s*;`));
  return match ? splitCallArguments(match[1]) : [];
}

function projectileModifiersAfterSpawn(blockText, match) {
  const segment = postSpawnModifierSegment(blockText, match);
  const modeExpr = callArguments(segment, "FUN_00cfcba8")[1] || "";
  const lateralOffsetExpr = callArguments(segment, "FUN_00cfcbc4")[0] || "";
  const callback18 = callArguments(segment, "FUN_00cfcb68")[1] || "";
  const callback28 = callArguments(segment, "FUN_00cfcbcc")[1] || "";
  const callback38 = callArguments(segment, "FUN_00cfcbbc")[1] || "";
  const projectileMode = parseIntegerLiteral(modeExpr);
  const projectileLateralOffset = parseFloatLiteral(lateralOffsetExpr);
  return {
    projectileModeExpr: modeExpr,
    projectileMode: projectileMode ?? "",
    projectileLateralOffsetExpr: lateralOffsetExpr,
    projectileLateralOffset: Number.isFinite(projectileLateralOffset) ? projectileLateralOffset : "",
    projectileCallback18: callback18,
    projectileCallback28: callback28,
    projectileCallback38: callback38,
  };
}

function rowForProjectileCall({ sourceFile, block, lines, match, args, sourceKind, helperFunction = "", callbackFunction = "" }) {
  const callLine = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
  const projectileIdExpr = args[1] || "";
  const projectileId = parseIntegerLiteral(projectileIdExpr);
  const emitterLabel = quotedLiteral(args[2]);
  const blockActionNames = actionNamesFromBlock(block.text);
  const effectTokens = effectTokensFromText(block.text);
  const soundTokens = soundTokensFromText(block.text);
  const buffTokens = buffTokensFromText(block.text);
  return {
    ...rowBase({
      sourceFile,
      block,
      line: callLine,
      sourceLine: sourceLineAt(lines, callLine),
      sourceKind,
    }),
    helperFunction,
    callbackFunction,
    projectileIdExpr,
    projectileId: projectileId ?? "",
    projectileIdHex: projectileIdHex(projectileId),
    emitterExpr: args[2] || "",
    emitterLabel,
    emitterHash: emitterLabel ? fnv1aHashHex(emitterLabel) : "",
    actionNames: blockActionNames,
    actionKeys: actionKeysForNativeContext(blockActionNames, effectTokens, soundTokens, buffTokens),
    effectTokens,
    soundTokens,
    buffTokens,
    nearbyBoneTokens: boneTokensFromText(block.text),
    ...projectileModifiersAfterSpawn(block.text, match),
    evidence: "FUN_00cfcad8",
  };
}

function directProjectileRows({ sourceFile, block, lines }) {
  const rows = [];
  const callPattern = /\bFUN_00cfcad8\s*\(([^;]+?)\)\s*;/g;
  for (const match of block.text.matchAll(callPattern)) {
    const args = splitCallArguments(match[1]);
    if (args.length < 3) continue;
    const projectileId = parseIntegerLiteral(args[1]);
    const emitterLabel = quotedLiteral(args[2]);
    if (!Number.isInteger(projectileId) && !emitterLabel) continue;
    rows.push(rowForProjectileCall({ sourceFile, block, lines, match, args, sourceKind: "native-projectile-spawn" }));
  }
  return rows;
}

function iosProjectileBuilderRows({ sourceFile, block, lines }) {
  const rows = [];
  const builders = [...block.text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_10000f250\s*\(\s*\)\s*;/g)];
  for (let index = 0; index < builders.length; index += 1) {
    const builder = builders[index];
    const builderVar = builder[1];
    const segmentStart = builder.index;
    const segmentEnd = builders[index + 1]?.index ?? block.text.length;
    const segment = block.text.slice(segmentStart, segmentEnd);
    const escapedVar = builderVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idMatch = segment.match(new RegExp(`\\*\\([^)]*\\)\\(\\s*${escapedVar}\\s*\\+\\s*0x10\\s*\\)\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)\\s*;`));
    const emitterMatch = segment.match(new RegExp(`\\bFUN_1003d266c\\s*\\(\\s*${escapedVar}\\s*,\\s*"([^"]+)"\\s*\\)\\s*;`));
    if (!idMatch || !emitterMatch) continue;

    const projectileIdExpr = idMatch[1];
    const projectileId = parseIntegerLiteral(projectileIdExpr);
    const emitterLabel = emitterMatch[1];
    const callOffset = segmentStart + segment.indexOf(emitterMatch[0]);
    const callLine = block.startLine + lineNumberForOffset(block.text, callOffset) - 1;
    const actionNames = actionNamesFromBlock(block.text);
    const effectTokens = effectTokensFromText(block.text);
    const soundTokens = soundTokensFromText(block.text);
    const buffTokens = buffTokensFromText(block.text);
    rows.push({
      ...rowBase({
        sourceFile,
        block,
        line: callLine,
        sourceLine: sourceLineAt(lines, callLine),
        sourceKind: "native-projectile-ios-builder",
      }),
      helperFunction: "",
      callbackFunction: "",
      projectileIdExpr,
      projectileId: projectileId ?? "",
      projectileIdHex: projectileIdHex(projectileId),
      emitterExpr: `"${emitterLabel}"`,
      emitterLabel,
      emitterHash: emitterLabel ? fnv1aHashHex(emitterLabel) : "",
      actionNames,
      actionKeys: actionKeysForNativeContext(actionNames, effectTokens, soundTokens, buffTokens),
      effectTokens,
      soundTokens,
      buffTokens,
      nearbyBoneTokens: boneTokensFromText(block.text),
      evidence: "FUN_10000f250+FUN_1003d266c",
    });
  }
  return rows;
}

function signatureParameterNames(blockText, functionName) {
  const signature = String(blockText || "").match(new RegExp(`\\b${functionName}\\s*\\(([^)]*)\\)`));
  if (!signature) return [];
  return splitCallArguments(signature[1])
    .map((arg) => arg.match(/\b(param_\d+)\b/)?.[1] || "")
    .filter(Boolean);
}

function projectileHelperMetadata(block) {
  const callMatch = [...block.text.matchAll(/\bFUN_00cfcad8\s*\(([^;]+?)\)\s*;/g)].find((match) => {
    const args = splitCallArguments(match[1]);
    return /^param_\d+$/.test(args[1] || "") || /^param_\d+$/.test(args[2] || "");
  });
  const params = signatureParameterNames(block.text, block.functionName);
  if (callMatch) {
    const args = splitCallArguments(callMatch[1]);
    const projectileParamIndex = params.indexOf(args[1]);
    const emitterParamIndex = params.indexOf(args[2]);
    if (projectileParamIndex >= 0 || emitterParamIndex >= 0) {
      return {
        helperFunction: block.functionName,
        projectileParamIndex,
        emitterParamIndex,
        parameterNames: params,
        effectTokens: effectTokensFromText(block.text),
        soundTokens: soundTokensFromText(block.text),
        buffTokens: buffTokensFromText(block.text),
        nearbyBoneTokens: boneTokensFromText(block.text),
        projectileModifiers: projectileModifiersAfterSpawn(block.text, callMatch),
        evidence: "FUN_00cfcad8-helper",
      };
    }
  }

  const builders = [...block.text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*FUN_10000f250\s*\(\s*\)\s*;/g)];
  for (let index = 0; index < builders.length; index += 1) {
    const builder = builders[index];
    const builderVar = builder[1];
    const segmentStart = builder.index;
    const segmentEnd = builders[index + 1]?.index ?? block.text.length;
    const segment = block.text.slice(segmentStart, segmentEnd);
    const escapedVar = builderVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const idMatch = segment.match(new RegExp(`\\*\\([^)]*\\)\\(\\s*${escapedVar}\\s*\\+\\s*0x10\\s*\\)\\s*=\\s*(param_\\d+|0x[0-9a-fA-F]+|\\d+)\\s*;`));
    const emitterCall = [...segment.matchAll(new RegExp(`\\bFUN_1003d266c\\s*\\(([^;]+?)\\)\\s*;`, "g"))]
      .map((match) => splitCallArguments(match[1]))
      .find((args) => args[0] === builderVar);
    const emitterExpr = emitterCall?.[1] || "";
    if (!idMatch || !emitterExpr) continue;

    const projectileParamIndex = params.indexOf(idMatch[1]);
    const emitterParamIndex = params.indexOf(emitterExpr);
    if (projectileParamIndex < 0 && emitterParamIndex < 0) continue;

    return {
      helperFunction: block.functionName,
      projectileParamIndex,
      emitterParamIndex,
      parameterNames: params,
      effectTokens: effectTokensFromText(block.text),
      soundTokens: soundTokensFromText(block.text),
      buffTokens: buffTokensFromText(block.text),
      nearbyBoneTokens: boneTokensFromText(block.text),
      evidence: "FUN_10000f250-helper",
    };
  }

  return null;
}

function projectileHelperMetadataByFunction(blocks) {
  const helperByFunction = new Map();
  for (const block of blocks || []) {
    const helper = projectileHelperMetadata(block);
    if (helper) helperByFunction.set(block.functionName, helper);
  }
  return helperByFunction;
}

function collectProjectileHelperMetadata(sourceItems) {
  const helperByFunction = new Map();
  for (const sourceItem of sourceItems || []) {
    const lines = String(sourceItem.sourceText || "").split(/\r?\n/);
    for (const [functionName, helper] of projectileHelperMetadataByFunction(findFunctionBlocks(lines))) {
      if (!helperByFunction.has(functionName)) helperByFunction.set(functionName, helper);
    }
  }
  return helperByFunction;
}

function helperCallRows({ sourceFile, block, lines, helperByFunction }) {
  const rows = [];
  for (const helper of helperByFunction.values()) {
    const callPattern = new RegExp(`\\b${helper.helperFunction}\\s*\\(([^;]+?)\\)\\s*;`, "g");
    for (const match of block.text.matchAll(callPattern)) {
      if (block.functionName === helper.helperFunction) continue;
      const args = splitCallArguments(match[1]);
      const projectileIdExpr = helper.projectileParamIndex >= 0 ? args[helper.projectileParamIndex] || "" : "";
      const emitterExpr = helper.emitterParamIndex >= 0 ? args[helper.emitterParamIndex] || "" : "";
      const projectileId = parseIntegerLiteral(projectileIdExpr);
      const emitterLabel = quotedLiteral(emitterExpr);
      if (!Number.isInteger(projectileId) && !emitterLabel) continue;

      const callLine = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
      const literalArgs = args.map(quotedLiteral).filter(Boolean);
      const actionNames = uniqueInOrder([
        ...literalArgs.filter(actionLooksLikeRuntimeAction),
        ...actionNamesFromBlock(block.text),
      ]);
      const effectTokens = uniqueInOrder([
        ...literalArgs.filter((value) => /^Effect_/.test(value)),
        ...effectTokensFromText(block.text),
        ...(helper.effectTokens || []),
      ]);
      const soundTokens = uniqueInOrder([...soundTokensFromText(block.text), ...(helper.soundTokens || [])]);
      const buffTokens = uniqueInOrder([...buffTokensFromText(block.text), ...(helper.buffTokens || [])]);
      const nearbyBoneTokens = uniqueInOrder([...boneTokensFromText(block.text), ...(helper.nearbyBoneTokens || [])]);
      rows.push({
        ...rowBase({
          sourceFile,
          block,
          line: callLine,
          sourceLine: sourceLineAt(lines, callLine),
          sourceKind: "native-projectile-helper-call",
        }),
        helperFunction: helper.helperFunction,
        callbackFunction: "",
        projectileIdExpr,
        projectileId: projectileId ?? "",
        projectileIdHex: projectileIdHex(projectileId),
        emitterExpr,
        emitterLabel,
        emitterHash: emitterLabel ? fnv1aHashHex(emitterLabel) : "",
        actionNames,
        actionKeys: actionKeysForNativeContext(actionNames, effectTokens, soundTokens, buffTokens),
        effectTokens,
        soundTokens,
        buffTokens,
        nearbyBoneTokens,
        ...(helper.projectileModifiers || {}),
        heroEvidenceHint:
          helper.effectTokens?.length || helper.soundTokens?.length || helper.buffTokens?.length ? "helper-body-token-table" : "",
        evidence: helper.evidence || "FUN_00cfcad8-helper",
      });
    }
  }
  return rows;
}

function selectorRows({ sourceFile, block, lines }) {
  const idAssignment = block.text.match(/\*param_3\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/);
  const emitterAssignment = block.text.match(/\*param_4\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/);
  if (!idAssignment || !emitterAssignment) return [];

  const idVar = idAssignment[1];
  const emitterVar = emitterAssignment[1];
  const rows = [];
  let currentIdExpr = "";
  const seen = new Set();
  const blockLines = block.text.split(/\r?\n/);

  for (let index = 0; index < blockLines.length; index += 1) {
    const lineText = blockLines[index];
    const idMatch = lineText.match(new RegExp(`\\b${idVar}\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)\\s*;`));
    if (idMatch) currentIdExpr = idMatch[1];
    const emitterMatch = lineText.match(new RegExp(`\\b${emitterVar}\\s*=\\s*"([^"]+)"\\s*;`));
    if (!emitterMatch || !currentIdExpr) continue;
    const projectileId = parseIntegerLiteral(currentIdExpr);
    const emitterLabel = emitterMatch[1];
    const key = `${currentIdExpr}\t${emitterLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = block.startLine + index;
    const effectTokens = effectTokensFromText(block.text);
    const soundTokens = soundTokensFromText(block.text);
    const buffTokens = buffTokensFromText(block.text);
    rows.push({
      ...rowBase({
        sourceFile,
        block,
        line,
        sourceLine: sourceLineAt(lines, line),
        sourceKind: "native-projectile-selector",
      }),
      helperFunction: "",
      callbackFunction: "",
      projectileIdExpr: currentIdExpr,
      projectileId: projectileId ?? "",
      projectileIdHex: projectileIdHex(projectileId),
      emitterExpr: emitterVar,
      emitterLabel,
      emitterHash: emitterLabel ? fnv1aHashHex(emitterLabel) : "",
      actionNames: [],
      actionKeys: actionKeysForNativeContext([], effectTokens, soundTokens, buffTokens, [emitterLabel]),
      effectTokens,
      soundTokens,
      buffTokens,
      nearbyBoneTokens: boneTokensFromText(block.text),
      evidence: "callback-param_3-param_4",
    });
  }
  return rows;
}

function registrationEmitterLabel(strings) {
  return (
    strings.find(
      (value) =>
        !actionLooksLikeRuntimeAction(value) &&
        !/^(Effect|Sound|Buff)_/.test(value) &&
        /(Projectile|Muzzle|Gun|Hand|Center|Body|Mouth|Barrel|Shot|Aemit|FireBall|Proj)/i.test(value),
    ) || ""
  );
}

function callbackRegistrationRows({ sourceFile, block, lines, selectorFunctionNames }) {
  if (!selectorFunctionNames.size) return [];
  const rows = [];
  const callPattern = /(?:^|\n)\s*(?:[A-Za-z_][A-Za-z0-9_*\s]*=\s*)?\b(FUN_[A-Za-z0-9_]+)\s*\(([^;\n{}]+?)\)\s*;/g;
  for (const match of block.text.matchAll(callPattern)) {
    const args = splitCallArguments(match[2]);
    const callbackFunction = args.find((arg) => selectorFunctionNames.has(arg)) || "";
    if (!callbackFunction) continue;
    const literalArgs = args.map(quotedLiteral).filter(Boolean);
    const effectTokens = uniqueInOrder(literalArgs.filter((value) => /^Effect_/.test(value)));
    const emitterLabel = registrationEmitterLabel(literalArgs);
    if (!effectTokens.length && !emitterLabel) continue;
    const actionNames = uniqueInOrder(literalArgs.filter(actionLooksLikeRuntimeAction));
    const soundTokens = soundTokensFromText(block.text);
    const buffTokens = buffTokensFromText(block.text);
    const callLine = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
    rows.push({
      ...rowBase({
        sourceFile,
        block,
        line: callLine,
        sourceLine: sourceLineAt(lines, callLine),
        sourceKind: "native-projectile-callback-registration",
      }),
      helperFunction: match[1],
      callbackFunction,
      projectileIdExpr: "",
      projectileId: "",
      projectileIdHex: "",
      emitterExpr: emitterLabel ? `"${emitterLabel}"` : "",
      emitterLabel,
      emitterHash: emitterLabel ? fnv1aHashHex(emitterLabel) : "",
      actionNames,
      actionKeys: actionKeysForNativeContext(actionNames, effectTokens, soundTokens, buffTokens),
      effectTokens,
      soundTokens,
      buffTokens,
      nearbyBoneTokens: boneTokensFromText(block.text),
      evidence: "callback-registration",
    });
  }
  return rows;
}

function extractNativeProjectileSpawnRowsFromSource({ sourceFile, sourceText }, { helperByFunction: sharedHelperByFunction = null } = {}) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const helperByFunction = new Map(sharedHelperByFunction || []);
  const selectorByFunction = new Map();

  for (const [functionName, helper] of projectileHelperMetadataByFunction(blocks)) {
    helperByFunction.set(functionName, helper);
  }

  for (const block of blocks) {
    const selectors = selectorRows({ sourceFile, block, lines });
    if (selectors.length) selectorByFunction.set(block.functionName, selectors);
  }

  const selectorFunctionNames = new Set(selectorByFunction.keys());
  const rows = [];
  for (const block of blocks) {
    rows.push(...directProjectileRows({ sourceFile, block, lines }));
    rows.push(...iosProjectileBuilderRows({ sourceFile, block, lines }));
    rows.push(...helperCallRows({ sourceFile, block, lines, helperByFunction }));
    rows.push(...(selectorByFunction.get(block.functionName) || []));
    rows.push(...callbackRegistrationRows({ sourceFile, block, lines, selectorFunctionNames }));
  }
  return rows;
}

function rowKey(row) {
  return [
    row.platform,
    row.sourceKind,
    row.sourceFile,
    row.functionName,
    row.line,
    row.helperFunction,
    row.callbackFunction,
    row.projectileIdExpr,
    row.emitterLabel,
  ].join("\t");
}

function summarize(items) {
  const byKind = {};
  const byActionKey = {};
  const heroNames = new Set();
  for (const item of items || []) {
    byKind[item.sourceKind] = (byKind[item.sourceKind] || 0) + 1;
    for (const actionKey of item.actionKeys || []) byActionKey[actionKey] = (byActionKey[actionKey] || 0) + 1;
    for (const heroName of item.heroNames || []) heroNames.add(heroName);
  }
  return {
    rows: items.length,
    heroNames: heroNames.size,
    directSpawns: byKind["native-projectile-spawn"] || 0,
    iosBuilders: byKind["native-projectile-ios-builder"] || 0,
    helperCalls: byKind["native-projectile-helper-call"] || 0,
    callbackSelectors: byKind["native-projectile-selector"] || 0,
    callbackRegistrations: byKind["native-projectile-callback-registration"] || 0,
    emitters: new Set(items.map((item) => item.emitterLabel).filter(Boolean)).size,
    projectileIds: new Set(items.map((item) => item.projectileId).filter((value) => value !== "")).size,
    nearbyBoneHintRows: items.filter((item) => item.nearbyBoneTokens?.length).length,
    byKind,
    byActionKey,
  };
}

function buildNativeProjectileSpawnManifest(sourceItems, generatedAt = new Date().toISOString(), { heroNameRows = [] } = {}) {
  const items = [];
  const seen = new Set();
  const heroTokenLookup = buildHeroTokenLookup(heroNameRows);
  const helperByFunction = collectProjectileHelperMetadata(sourceItems);
  for (const sourceItem of sourceItems || []) {
    for (const row of extractNativeProjectileSpawnRowsFromSource(sourceItem, { helperByFunction })) {
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(annotateHeroNames(row, heroTokenLookup));
    }
  }
  propagateHeroContext(items);
  items.sort((left, right) => {
    const fileOrder = left.sourceFile.localeCompare(right.sourceFile);
    if (fileOrder) return fileOrder;
    return left.line - right.line || left.sourceKind.localeCompare(right.sourceKind);
  });
  return {
    generatedAt,
    source: { sourcePaths: defaultSourcePaths, heroNamesPath: defaultHeroNamesPath },
    summary: summarize(items),
    items,
  };
}

function reportRowsForManifest(manifest) {
  return manifest.items.map((item) => ({
    platform: item.platform,
    sourceKind: item.sourceKind,
    sourceFile: item.sourceFile,
    heroNames: item.heroNames,
    heroEvidence: item.heroEvidence,
    functionName: item.functionName,
    line: item.line,
    helperFunction: item.helperFunction,
    callbackFunction: item.callbackFunction,
    projectileIdExpr: item.projectileIdExpr,
    projectileId: item.projectileId,
    projectileIdHex: item.projectileIdHex,
    emitterExpr: item.emitterExpr,
    emitterLabel: item.emitterLabel,
    emitterHash: item.emitterHash,
    projectileModeExpr: item.projectileModeExpr,
    projectileMode: item.projectileMode,
    projectileLateralOffsetExpr: item.projectileLateralOffsetExpr,
    projectileLateralOffset: item.projectileLateralOffset,
    projectileCallback18: item.projectileCallback18,
    projectileCallback28: item.projectileCallback28,
    projectileCallback38: item.projectileCallback38,
    actionNames: item.actionNames,
    actionKeys: item.actionKeys,
    effectTokens: item.effectTokens,
    soundTokens: item.soundTokens,
    buffTokens: item.buffTokens,
    nearbyBoneTokens: item.nearbyBoneTokens,
    evidence: item.evidence,
    contextHash: item.contextHash,
    sourceLine: item.sourceLine,
  }));
}

function exportNativeProjectileSpawnManifest({
  sourcePaths = defaultSourcePaths,
  heroNamesPath = defaultHeroNamesPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const files = collectCFiles(sourcePaths);
  const heroNameRows = heroNamesPath && fs.existsSync(heroNamesPath) ? readTsv(heroNamesPath) : [];
  const manifest = buildNativeProjectileSpawnManifest(
    files.map((sourceFile) => ({ sourceFile, sourceText: fs.readFileSync(sourceFile, "utf8") })),
    generatedAt,
    { heroNameRows },
  );
  manifest.source = { sourcePaths, heroNamesPath: heroNameRows.length ? heroNamesPath : "" };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "platform",
    "sourceKind",
    "sourceFile",
    "heroNames",
    "heroEvidence",
    "functionName",
    "line",
    "helperFunction",
    "callbackFunction",
    "projectileIdExpr",
    "projectileId",
    "projectileIdHex",
    "emitterExpr",
    "emitterLabel",
    "emitterHash",
    "projectileModeExpr",
    "projectileMode",
    "projectileLateralOffsetExpr",
    "projectileLateralOffset",
    "projectileCallback18",
    "projectileCallback28",
    "projectileCallback38",
    "actionNames",
    "actionKeys",
    "effectTokens",
    "soundTokens",
    "buffTokens",
    "nearbyBoneTokens",
    "evidence",
    "contextHash",
    "sourceLine",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeProjectileSpawnManifest({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  actionKeysForActionNames,
  buildNativeProjectileSpawnManifest,
  boneTokensFromText,
  exportNativeProjectileSpawnManifest,
  extractNativeProjectileSpawnRowsFromSource,
  fnv1aHashHex,
  reportRowsForManifest,
  summarize,
};
