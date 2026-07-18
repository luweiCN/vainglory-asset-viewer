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
const defaultViewerOut = "extracted/viewer/native-effect-spawn-manifest.json";
const defaultTsvOut = "extracted/reports/native_effect_spawn_manifest.tsv";
const defaultJsonOut = "extracted/reports/native_effect_spawn_manifest_summary.json";

const effectSpawnFunctions = [
  "FUN_00cf32cc",
  "FUN_00cf3358",
  "FUN_00cf3428",
  "FUN_00cf3a9c",
  "FUN_00cf3ac8",
  "FUN_00cf3bb0",
  "FUN_1003a4cdc",
  "FUN_1003a4264",
  "FUN_1003af550",
  "FUN_1003ac4b8",
  "FUN_1003ae090",
  "FUN_1003ad850",
  "FUN_1003a85d0",
  "FUN_1003a76a8",
  "FUN_1003a5d18",
  "FUN_1003a5a20",
  "FUN_1003a552c",
  "FUN_1003a3698",
  "FUN_1003a2708",
  "FUN_1003a9fd4",
  "FUN_1003a49b0",
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
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
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

function quotedLiteral(expr) {
  const match = String(expr || "").trim().match(/^"([^"]*)"$/);
  return match ? match[1] : "";
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

function formatOptionNumber(value) {
  return String(Number(Number(value).toFixed(6)));
}

function effectTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/Effect_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function runtimeActionTokensFromText(text) {
  return uniqueInOrder([...String(text || "").matchAll(/(?:Effect|Sound|Buff|Ability)_[A-Za-z0-9_]+/g)].map((match) => match[0]));
}

function normalizedSelectorStateTerm(term) {
  const value = String(term || "").toLowerCase();
  if (value === "good" || value === "light") return "light";
  if (value === "evil" || value === "dark") return "dark";
  return "";
}

function selectorStateTermsFromText(text) {
  const terms = [];
  for (const token of runtimeActionTokensFromText(text)) {
    for (const part of token.split(/[^A-Za-z0-9]+/).filter(Boolean)) {
      const stateTerm = normalizedSelectorStateTerm(part);
      if (stateTerm) terms.push(stateTerm);
    }
  }
  const uniqueTerms = uniqueInOrder(terms);
  return uniqueTerms.length === 1 ? uniqueTerms : [];
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
  return actionKeysForActionName(text).length > 0;
}

function actionKeysForRuntimeToken(token) {
  const value = String(token || "");
  const isEffectToken = /^Effect_/i.test(value);
  const keys = [];
  if (
    /(?:^|_)AA(?:_|$)|DefaultAttack|BasicAttack|Auto_Attack|Crit_Attack/i.test(value) ||
    (isEffectToken && /(?:^|_)Attack(?:_|$)|Attack$/i.test(value))
  )
    keys.push("attack");
  if (/CritAttack|Crit_Attack|Attack_Crit|_Crit(?:$|_)/i.test(value)) keys.push("attack_crit");
  if (/AltAttack|Attack_Alt|_Alt(?:$|_)/i.test(value)) keys.push("attack_alt");
  if (/(?:^|_)A(?:_|$)|Ability_?A|Ability0?1|(?:^|_)S1(?:_|$)/i.test(value)) keys.push("ability01");
  if (/(?:^|_)B(?:_|$)|Ability_?B|Ability0?2|(?:^|_)S2(?:_|$)/i.test(value)) keys.push("ability02");
  if (/(?:^|_)C(?:_|$)|Ability_?C|Ability0?3|(?:^|_)S3(?:_|$)/i.test(value)) keys.push("ability03");
  return keys;
}

function runtimeTokenHasStrongAttackAction(token) {
  return /(?:^|_)AA(?:_|$)|DefaultAttack|BasicAttack|Auto_Attack|Crit_Attack/i.test(String(token || ""));
}

function actionNamesFromBlock(blockText) {
  const names = [];
  for (const match of String(blockText || "").matchAll(/\bFUN_00cf3048\s*\([^;]*?"([^"]+)"/g)) {
    if (actionLooksLikeRuntimeAction(match[1])) names.push(match[1]);
  }
  for (const match of String(blockText || "").matchAll(/\bFUN_1004d2524\s*\(\s*"([^"]+)"/g)) {
    if (actionLooksLikeRuntimeAction(match[1])) names.push(match[1]);
  }
  for (const match of String(blockText || "").matchAll(/Ability__[A-Za-z0-9]+__[A-C](?:_[A-Za-z0-9]+)?/g)) {
    if (actionLooksLikeRuntimeAction(match[0])) names.push(match[0]);
  }
  return uniqueInOrder(names);
}

function nativeRuntimeStringNeighborhood(text, effectToken = "") {
  const tokens = uniqueInOrder(
    [...String(text || "").matchAll(/\b(?:Effect|Buff|Sound|Talent)_[A-Za-z0-9_]+|\bAbility__[A-Za-z0-9]+__[A-Za-z0-9_]+|\bAbility\d{1,2}(?:_[A-Za-z0-9_]+)?\b/g)].map(
      (match) => match[0],
    ),
  );
  return {
    nearbyEffectTokens: tokens.filter((token) => token.startsWith("Effect_") && token !== effectToken),
    nearbyBuffTokens: tokens.filter((token) => token.startsWith("Buff_")),
    nearbyAbilityNames: tokens.filter((token) => token.startsWith("Ability")),
    nearbySoundTokens: tokens.filter((token) => token.startsWith("Sound_")),
  };
}

function actionKeysForNativeContext(actionNames = [], effectTokens = []) {
  const keys = uniqueInOrder([
    ...(actionNames || []).flatMap(actionKeysForActionName),
    ...(effectTokens || []).flatMap(actionKeysForRuntimeToken),
  ]);
  if ((effectTokens || []).some(runtimeTokenHasStrongAttackAction)) {
    const attackKeys = keys.filter((key) => key.startsWith("attack"));
    if (attackKeys.length) return uniqueInOrder(attackKeys);
  }
  return keys;
}

function runtimeActionTokensCompatibleWithActions(tokens = [], actionNames = []) {
  const actionKeys = new Set((actionNames || []).flatMap(actionKeysForActionName));
  if (!actionKeys.size) return tokens;
  return (tokens || []).filter((token) => {
    const tokenKeys = actionKeysForRuntimeToken(token);
    return tokenKeys.some((key) => actionKeys.has(key));
  });
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

function lineNumberForOffset(text, offset) {
  return String(text || "").slice(0, offset).split(/\r?\n/).length;
}

function textWindowAroundOffset(text, offset, beforeLines = 4, afterLines = 28) {
  const lines = String(text || "").split(/\r?\n/);
  const lineNumber = lineNumberForOffset(text, offset);
  const start = Math.max(0, lineNumber - beforeLines - 1);
  const end = Math.min(lines.length, lineNumber + afterLines);
  return lines.slice(start, end).join("\n");
}

function sourceLineAt(lines, lineNumber) {
  return lines[lineNumber - 1] || "";
}

function locatorLiteralForEffectArgs(args, effectArgIndex) {
  for (let index = effectArgIndex + 1; index < args.length; index += 1) {
    const literal = quotedLiteral(args[index]);
    if (!literal) continue;
    if (/^(Effect|Sound|Buff|Talent|Ability)_/.test(literal)) continue;
    if (actionLooksLikeRuntimeAction(literal)) continue;
    return { locatorLabel: literal, locatorExpr: args[index] || "" };
  }
  return { locatorLabel: "", locatorExpr: "" };
}

function nearestVcallLocatorBefore(text, offset) {
  const prefixLines = String(text || "").slice(0, offset).split(/\r?\n/);
  const meaningfulPrefixLines = prefixLines.filter((line) => !/^\s*\/\*\s*WARNING:/.test(line));
  const nearbyText = meaningfulPrefixLines.slice(Math.max(0, meaningfulPrefixLines.length - 3)).join("\n");
  const locatorPattern = /\(\*\*\(code \*\*\)\(\*[^;\n]+?\+\s*(?:0x60|0x68|0x78)\)\)\s*\([^;]*?"([^"]+)"[^;]*\)\s*;?/g;
  let locatorLabel = "";
  for (const match of nearbyText.matchAll(locatorPattern)) {
    const literal = match[1] || "";
    if (!literal) continue;
    if (/^(Effect|Sound|Buff|Talent|Ability)_/.test(literal)) continue;
    if (actionLooksLikeRuntimeAction(literal)) continue;
    locatorLabel = literal;
  }
  return locatorLabel;
}

function integerLiteral(expr) {
  const value = String(expr || "").trim();
  if (/^[+-]?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value.slice(2), 16);
  return null;
}

function selectedAttachmentVcallSlotBefore(text, offset) {
  const prefixLines = String(text || "").slice(0, offset).split(/\r?\n/);
  const meaningfulPrefixLines = prefixLines.filter((line) => !/^\s*\/\*\s*WARNING:/.test(line));
  const nearbyText = meaningfulPrefixLines.slice(Math.max(0, meaningfulPrefixLines.length - 4)).join("\n");
  const selectedChannel = /\(\*\*\(code \*\*\)\(\*[^;\n]+?\+\s*0x98\)\)\s*\(([^;\n]*)\)\s*;?/g;
  const resolveSelectedChannel = /\(\*\*\(code \*\*\)\(\*[^;\n]+?\+\s*0x60\)\)\s*\([^;\n]*\)\s*;?/;
  if (!resolveSelectedChannel.test(nearbyText)) return null;
  let slot = null;
  for (const match of nearbyText.matchAll(selectedChannel)) {
    const args = splitCallArguments(match[1]);
    const candidate = integerLiteral(args[1]);
    if (Number.isInteger(candidate)) slot = candidate;
  }
  return Number.isInteger(slot) ? slot : null;
}

function bindHint(locatorLabel) {
  if (locatorLabel) return "locator";
  return "model-root";
}

function localNameFromArgument(arg) {
  const match = String(arg || "").trim().match(/^&?([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])?$/);
  return match?.[1] || "";
}

function escapeRegexLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numericValueFromLocalAssignmentRhs(rhs) {
  const text = String(rhs || "");
  const concatMatch = text.match(/CONCAT44\s*\([^,]+,\s*([^)]+)\)/);
  const direct = parseFloatLiteral(concatMatch ? concatMatch[1] : text);
  return Number.isFinite(direct) ? direct : null;
}

function nearestLocalNumericValuesBefore(text, offset, localName) {
  if (!localName) return [];
  const nearbyText = String(text || "")
    .slice(0, offset)
    .split(/\r?\n/)
    .slice(-20)
    .join("\n");
  const name = escapeRegexLiteral(localName);
  const patterns = [
    new RegExp(`\\b${name}(?:\\[\\d+\\])?\\s*=\\s*([^;]+)\\s*;`, "g"),
    new RegExp(`\\b${name}\\._\\d+_\\d+_\\s*=\\s*([^;]+)\\s*;`, "g"),
  ];
  const values = [];
  for (const pattern of patterns) {
    for (const match of nearbyText.matchAll(pattern)) {
      const value = numericValueFromLocalAssignmentRhs(match[1]);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values.length ? [values[values.length - 1]] : [];
}

function nearestLocalAssignmentRhsBefore(text, offset, localName) {
  if (!localName) return "";
  const nearbyText = String(text || "")
    .slice(0, offset)
    .split(/\r?\n/)
    .slice(-20)
    .join("\n");
  const name = escapeRegexLiteral(localName);
  const patterns = [
    new RegExp(`\\b${name}(?:\\[\\d+\\])?\\s*=\\s*([^;]+)\\s*;`, "g"),
    new RegExp(`\\b${name}\\._\\d+_\\d+_\\s*=\\s*([^;]+)\\s*;`, "g"),
  ];
  let rhs = "";
  for (const pattern of patterns) {
    for (const match of nearbyText.matchAll(pattern)) rhs = String(match[1] || "").trim();
  }
  return rhs;
}

function isFunctionReference(expr) {
  const value = String(expr || "")
    .trim()
    .replace(/^&/, "")
    .replace(/^\([^)]*\)\s*/, "");
  return /^(?:thunk_)?FUN_[0-9a-fA-F]+$/.test(value);
}

function argumentIdentifier(expr) {
  const value = String(expr || "").trim().replace(/^&/, "");
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\[\d+\])?$/);
  return match?.[1] || "";
}

function meaningfulEffectOptionArgs(args, effectHandleVariable) {
  const handle = String(effectHandleVariable || "").trim();
  return (args || []).filter((arg, index) => !(index === 0 && handle && argumentIdentifier(arg) === handle));
}

function effectOptionArgEvidences(args, optionPrefix, optionOffset, effectHandleVariable) {
  const evidences = [];
  for (const arg of meaningfulEffectOptionArgs(args, effectHandleVariable)) {
    const argText = String(arg || "").trim();
    if (Number.isFinite(parseFloatLiteral(arg))) {
      evidences.push({ kind: "numeric-direct", source: argText });
      continue;
    }
    if (isFunctionReference(arg)) {
      evidences.push({ kind: "callback", source: argText });
      continue;
    }
    const localName = localNameFromArgument(arg);
    if (!localName) {
      evidences.push({ kind: "expression", source: argText });
      continue;
    }
    const rhs = nearestLocalAssignmentRhsBefore(optionPrefix, optionOffset, localName);
    const source = rhs ? `${localName}=${rhs}` : localName;
    if (Number.isFinite(numericValueFromLocalAssignmentRhs(rhs))) {
      evidences.push({ kind: "numeric-local", source });
    } else if (isFunctionReference(rhs)) {
      evidences.push({ kind: argText.startsWith("&") ? "callback-struct" : "callback-local", source });
    } else if (rhs) {
      evidences.push({ kind: "dynamic-local", source });
    } else {
      evidences.push({ kind: "local", source });
    }
  }
  return evidences;
}

function effectOptionArgKinds(args, optionPrefix, optionOffset, effectHandleVariable) {
  return uniqueInOrder(effectOptionArgEvidences(args, optionPrefix, optionOffset, effectHandleVariable).map((item) => item.kind));
}

function numericValuesForEffectOptionArgs(args, optionPrefix, optionOffset) {
  const values = [];
  for (const arg of args || []) {
    const direct = parseFloatLiteral(arg);
    if (Number.isFinite(direct)) {
      values.push(direct);
      continue;
    }
    const localName = localNameFromArgument(arg);
    if (!localName) continue;
    values.push(...nearestLocalNumericValuesBefore(optionPrefix, optionOffset, localName));
  }
  return values;
}

function assignedVcallResultVariableBefore(text, offset) {
  const source = String(text || "");
  const lineStart = source.lastIndexOf("\n", offset) + 1;
  const beforeCall = source.slice(lineStart, offset);
  const match = beforeCall.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*)*$/);
  return match?.[1] || "";
}

function effectOptionDataAfterVcall(blockText, match) {
  const effectHandleVariable = assignedVcallResultVariableBefore(blockText, match.index);
  if (!effectHandleVariable) return {};
  const allowedOffsets = new Set(["0xc0", "0x60", "0xd0", "0x78", "0xd8", "0xb0"]);
  const afterCall = String(blockText || "").slice(match.index + match[0].length);
  const nextEffectIndex = afterCall.search(/\+\s*0x48\)\)\s*\([^;]*?"Effect_/);
  const optionWindow = (nextEffectIndex >= 0 ? afterCall.slice(0, nextEffectIndex) : afterCall)
    .split(/\r?\n/)
    .slice(0, 14)
    .join("\n");
  const contextPrefix = String(blockText || "")
    .slice(0, match.index + match[0].length)
    .split(/\r?\n/)
    .slice(-20)
    .join("\n");
  const optionContext = `${contextPrefix}\n${optionWindow}`;
  const optionContextOffset = contextPrefix.length + 1;
  const optionPattern = /\+\s*(0x[0-9a-fA-F]+)\)\)\s*\(([^;]*?)\)\s*;?/g;
  const offsetValues = {};
  const offsets = [];
  const floatArgs = [];
  const argKinds = [];
  const argSources = [];

  for (const optionMatch of optionWindow.matchAll(optionPattern)) {
    const offset = optionMatch[1].toLowerCase();
    if (!allowedOffsets.has(offset)) continue;
    const args = splitCallArguments(optionMatch[2]);
    if (!args.length || args.some(quotedLiteral)) continue;
    const meaningfulArgs = meaningfulEffectOptionArgs(args, effectHandleVariable);
    if (!meaningfulArgs.length) continue;
    const optionOffset = optionContextOffset + optionMatch.index;
    const values = numericValuesForEffectOptionArgs(meaningfulArgs, optionContext, optionOffset);
    for (const { kind, source } of effectOptionArgEvidences(args, optionContext, optionOffset, effectHandleVariable)) {
      argKinds.push(`${offset}:${kind}`);
      if (source) argSources.push(`${offset}:${kind}:${source}`);
    }
    offsets.push(offset);
    if (values.length) {
      offsetValues[offset] = values;
      floatArgs.push(`${offset}:${values.map(formatOptionNumber).join(",")}`);
    }
  }

  if (!offsets.length) return {};
  const effectOptions = { offsetValues };
  if (offsetValues["0xc0"]?.length >= 3) effectOptions.color = offsetValues["0xc0"].slice(0, 3);
  if (offsetValues["0xd0"]?.length) effectOptions.scale = offsetValues["0xd0"][0];
  if (offsetValues["0x78"]?.length) effectOptions.followTarget = offsetValues["0x78"][0] !== 0;
  if (offsetValues["0xd8"]?.length) effectOptions.fadeSeconds = offsetValues["0xd8"][0];
  if (offsetValues["0x60"]?.length) effectOptions.percentParam = offsetValues["0x60"][0];
  if (offsetValues["0xb0"]?.length) effectOptions.visibleOrActive = offsetValues["0xb0"][0] !== 0;

  return {
    effectOptionOffsets: offsets,
    effectOptionFloatArgs: floatArgs,
    effectOptionArgKinds: uniqueInOrder(argKinds),
    effectOptionArgSources: uniqueInOrder(argSources),
    effectOptions,
  };
}

function selectorOutputRole(selectorOutputTarget) {
  const target = String(selectorOutputTarget || "");
  if (/\[\s*4\s*\]/.test(target)) return "impact";
  if (/^\*param_\d+$/.test(target)) return "projectile";
  return "effect";
}

function rowForEffectSpawnCall({ sourceFile, block, lines, match, functionName, args, sourceKind = "native-effect-spawn" }) {
  const literalArgs = args.map(quotedLiteral);
  const effectArgIndex = literalArgs.findIndex((literal) => /^Effect_/.test(literal));
  if (effectArgIndex < 0) return null;
  const effectToken = literalArgs[effectArgIndex];
  const actionNames = uniqueInOrder([
    ...literalArgs.filter(actionLooksLikeRuntimeAction),
    ...actionNamesFromBlock(block.text),
  ]);
  const runtimeActionTokens = runtimeActionTokensCompatibleWithActions(runtimeActionTokensFromText(block.text), actionNames);
  const { locatorLabel, locatorExpr } = locatorLiteralForEffectArgs(args, effectArgIndex);
  const callLine = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
  const optionData = sourceKind === "native-effect-vcall" ? effectOptionDataAfterVcall(block.text, match) : {};
  const nearbyStrings = nativeRuntimeStringNeighborhood(textWindowAroundOffset(block.text, match.index, 8, 12), effectToken);

  return {
    platform: sourcePlatform(sourceFile),
    sourceKind,
    sourceFile,
    functionName: block.functionName,
    line: callLine,
    sourceLine: sourceLineAt(lines, callLine).trim(),
    contextHash: contextHash(sourceLineAt(lines, callLine)),
    helperFunction: functionName,
    effectToken,
    locatorExpr,
    locatorLabel,
    bindHint: bindHint(locatorLabel),
    actionNames,
    actionKeys: actionKeysForNativeContext(actionNames, [effectToken, ...runtimeActionTokens]),
    ...nearbyStrings,
    evidence: functionName,
    ...optionData,
  };
}

function rowForEffectSelectorAssignment({ sourceFile, block, lines, match, selectorOutputTarget, effectToken }) {
  const contextText = textWindowAroundOffset(block.text, match.index, 4, 8);
  const actionNames = actionNamesFromBlock(contextText);
  const runtimeActionTokens = runtimeActionTokensFromText(contextText);
  const callLine = block.startLine + lineNumberForOffset(block.text, match.index) - 1;
  const nearbyStrings = nativeRuntimeStringNeighborhood(contextText, effectToken);

  return {
    platform: sourcePlatform(sourceFile),
    sourceKind: "native-effect-selector",
    sourceFile,
    functionName: block.functionName,
    line: callLine,
    sourceLine: sourceLineAt(lines, callLine).trim(),
    contextHash: contextHash(sourceLineAt(lines, callLine)),
    helperFunction: "param-output-effect",
    effectToken,
    locatorExpr: "",
    locatorLabel: "",
    bindHint: "model-root",
    actionNames,
    actionKeys: actionKeysForNativeContext(actionNames, [effectToken, ...runtimeActionTokens]),
    ...nearbyStrings,
    evidence: "param-output-effect",
    selectorOutputTarget,
    selectorOutputRole: selectorOutputRole(selectorOutputTarget),
    selectorStateTerms: selectorStateTermsFromText(contextText),
  };
}

function extractNativeEffectSpawnRowsFromSource({ sourceFile, sourceText }) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const blocks = findFunctionBlocks(lines);
  const rows = [];
  const functionAlternation = effectSpawnFunctions.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const callPattern = new RegExp(`\\b(${functionAlternation})\\s*\\(([^;]+?)\\)\\s*;`, "g");
  const vcallEffectPattern = /\(\*\*\(code \*\*\)\(\*[^;\n]+?\+\s*0x48\)\)\s*\(([^;]*?"Effect_[^"]+"[^;]*?)\)\s*;?/g;
  const selectorEffectPattern = /(\*param_\d+|param_\d+\s*\[[^\]]+\])\s*=\s*"(Effect_[A-Za-z0-9_]+)"\s*;/g;

  for (const block of blocks) {
    for (const match of block.text.matchAll(callPattern)) {
      const args = splitCallArguments(match[2]);
      const row = rowForEffectSpawnCall({ sourceFile, block, lines, match, functionName: match[1], args });
      if (row) rows.push(row);
    }
    for (const match of block.text.matchAll(selectorEffectPattern)) {
      rows.push(rowForEffectSelectorAssignment({ sourceFile, block, lines, match, selectorOutputTarget: match[1], effectToken: match[2] }));
    }
    for (const match of block.text.matchAll(vcallEffectPattern)) {
      const args = splitCallArguments(match[1]);
      const row = rowForEffectSpawnCall({
        sourceFile,
        block,
        lines,
        match,
        functionName: "vcall+0x48",
        args,
        sourceKind: "native-effect-vcall",
      });
      const locatorLabel = nearestVcallLocatorBefore(block.text, match.index);
      if (row && locatorLabel && !row.locatorLabel) {
        row.locatorLabel = locatorLabel;
        row.locatorExpr = `"${locatorLabel}"`;
        row.bindHint = bindHint(locatorLabel);
      }
      const selectedAttachmentSlot = selectedAttachmentVcallSlotBefore(block.text, match.index);
      if (row && !row.locatorLabel && Number.isInteger(selectedAttachmentSlot)) {
        row.bindHint = "selected-attachment";
        row.selectedAttachmentSlot = selectedAttachmentSlot;
      }
      if (row) rows.push(row);
    }
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
    row.effectToken,
    row.locatorLabel,
    row.selectorOutputTarget || "",
  ].join("\t");
}

function summarize(items) {
  const byHero = {};
  const byActionKey = {};
  for (const item of items || []) {
    for (const heroName of item.heroNames || []) byHero[heroName] = (byHero[heroName] || 0) + 1;
    for (const actionKey of item.actionKeys || []) byActionKey[actionKey] = (byActionKey[actionKey] || 0) + 1;
  }
  return {
    rows: items.length,
    heroes: Object.keys(byHero).length,
    effectTokens: new Set(items.map((item) => item.effectToken)).size,
    locatorRows: items.filter((item) => item.locatorLabel).length,
    byHero,
    byActionKey,
  };
}

function buildNativeEffectSpawnManifest(sourceItems, generatedAt = new Date().toISOString(), { heroNameRows = [] } = {}) {
  const heroTokenLookup = buildHeroTokenLookup(heroNameRows);
  const items = [];
  const seen = new Set();
  for (const sourceItem of sourceItems || []) {
    for (const row of extractNativeEffectSpawnRowsFromSource(sourceItem)) {
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        ...row,
        heroNames: heroNamesForTokens([row.effectToken], heroTokenLookup),
      });
    }
  }
  items.sort((left, right) => left.effectToken.localeCompare(right.effectToken) || left.sourceFile.localeCompare(right.sourceFile) || left.line - right.line);
  return {
    generatedAt,
    count: items.length,
    summary: summarize(items),
    items,
  };
}

function exportNativeEffectSpawnManifest({
  sourcePaths = defaultSourcePaths,
  heroNamesPath = defaultHeroNamesPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const sourceItems = collectCFiles(sourcePaths).map((sourceFile) => ({
    sourceFile,
    sourceText: fs.readFileSync(sourceFile, "utf8"),
  }));
  const manifest = buildNativeEffectSpawnManifest(sourceItems, new Date().toISOString(), {
    heroNameRows: fs.existsSync(heroNamesPath) ? readTsv(heroNamesPath) : [],
  });

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "platform",
    "sourceKind",
    "effectToken",
    "locatorLabel",
    "locatorExpr",
    "bindHint",
    "selectedAttachmentSlot",
    "actionKeys",
    "actionNames",
    "nearbyEffectTokens",
    "nearbyBuffTokens",
    "nearbyAbilityNames",
    "nearbySoundTokens",
    "heroNames",
    "helperFunction",
    "selectorOutputTarget",
    "selectorOutputRole",
    "selectorStateTerms",
    "effectOptionOffsets",
    "effectOptionFloatArgs",
    "effectOptionArgKinds",
    "effectOptionArgSources",
    "sourceFile",
    "functionName",
    "line",
    "sourceLine",
    "evidence",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectSpawnManifest({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildNativeEffectSpawnManifest,
  exportNativeEffectSpawnManifest,
  extractNativeEffectSpawnRowsFromSource,
};
