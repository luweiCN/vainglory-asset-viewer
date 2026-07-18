#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { findFunctionBlocks } = require("./native_bind_xrefs");

const defaultCandidatesPath = "extracted/reports/native_attachment_event_candidates.tsv";
const defaultAliasBridgePath = "extracted/reports/attachment_effect_alias_bridge.tsv";
const defaultEventBridgePath = "extracted/reports/attachment_event_bridge.tsv";
const defaultTsvOut = "extracted/reports/native_effect_hook_builder_chain.tsv";
const defaultJsonOut = "extracted/reports/native_effect_hook_builder_chain_summary.json";
const defaultBindingTsvOut = "extracted/reports/native_effect_hook_binding_instances.tsv";
const defaultBindingJsonOut = "extracted/reports/native_effect_hook_binding_instances_summary.json";

const builderFunctions = {
  FUN_00d2945c: "android-effect-hook-builder",
  FUN_100441e68: "ios-effect-hook-builder",
};

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function quotedStrings(text) {
  return [...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1]).filter(Boolean);
}

function symbolStrings(text) {
  return [...text.matchAll(/\bPTR_s_([A-Za-z0-9_]+)_[0-9a-fA-F]+\b/g)].map((match) => match[1]);
}

function stringsInText(text) {
  return uniq([...quotedStrings(text), ...symbolStrings(text)]);
}

function vcallOffset(line) {
  return line.match(/\+\s*(0x[0-9a-fA-F]+)\)\)\(/)?.[1] || "";
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

function integerLiteral(expr) {
  const value = String(expr || "").trim();
  if (/^[+-]?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^0x[0-9a-fA-F]+$/.test(value)) return Number.parseInt(value.slice(2), 16);
  return null;
}

function vcallArguments(line) {
  const match = String(line || "").match(/\+\s*0x[0-9a-fA-F]+\)\)\s*\(([^;]*)\)/);
  return match ? splitCallArguments(match[1]) : [];
}

function selectedEffectChannelValues(line, offset) {
  if (offset !== "0x98") return [];
  const value = integerLiteral(vcallArguments(line)[1]);
  return Number.isInteger(value) ? [String(value)] : [];
}

function classifyOperation(line, tokens, offset) {
  const builder = Object.keys(builderFunctions).find((functionName) => line.includes(functionName));
  if (builder) return `builder:${builderFunctions[builder]}`;
  if (offset === "0x48" && tokens.some((token) => token.startsWith("Effect_"))) return "bind-effect";
  if ((offset === "0x68" || offset === "0x78") && tokens.some((token) => token.startsWith("Bone_"))) return "select-bone";
  if (offset === "0x98") return "select-effect-channel";
  if (offset === "0x60") return "resolve-selected-hook";
  if (offset === "0x88") return "set-effect-option";
  if (offset === "0xa0" || offset === "0xd0") return "bind-effect-callback";
  if (offset === "0xb0") return "set-visible-or-active";
  if (tokens.some((token) => token.startsWith("Buff_"))) return "buff-reference";
  if (offset) return "vcall";
  return "token-reference";
}

function operationRows(blockText) {
  const rows = [];
  const lines = blockText.split(/\r?\n/);
  for (const line of lines) {
    const tokens = stringsInText(line).filter(
      (token) =>
        /^(Ability|Bone|Buff|Effect|Sound)_/.test(token) ||
        token === "AbilityCAttachPoint" ||
        token === "ActorBase",
    );
    const offset = vcallOffset(line);
    const hasBuilder = Object.keys(builderFunctions).some((functionName) => line.includes(functionName));
    if (!tokens.length && !offset && !hasBuilder) continue;
    const role = classifyOperation(line, tokens, offset);
    const operationTokens = role === "select-effect-channel" ? selectedEffectChannelValues(line, offset) : tokens;
    rows.push({
      role,
      offset,
      tokens: operationTokens,
    });
  }
  return rows;
}

function analyzeEffectHookBlock(blockText) {
  const operations = operationRows(blockText);
  const allTokens = stringsInText(blockText);
  const boneTokens = uniq(allTokens.filter((token) => /^Bone_/.test(token)));
  const effectTokens = uniq(allTokens.filter((token) => /^Effect_/.test(token)));
  const buffTokens = uniq(allTokens.filter((token) => /^Buff_/.test(token)));
  const offsets = uniq(operations.map((operation) => operation.offset));
  const providers = uniq(
    Object.entries(builderFunctions)
      .filter(([functionName]) => blockText.includes(functionName))
      .map(([, provider]) => provider),
  );
  const operationSequence = operations
    .map((operation) => {
      const suffix = operation.tokens.length ? `:${operation.tokens.join(",")}` : operation.offset ? `:${operation.offset}` : "";
      return `${operation.role}${suffix}`;
    })
    .join(" -> ");

  let hookPattern = "unclassified";
  if (
    operations.some((operation) => operation.role === "select-bone") &&
    operations.some((operation) => operation.role === "bind-effect")
  ) {
    hookPattern = "bone-bound-effect";
  } else if (
    operations.some((operation) => operation.role === "select-effect-channel") &&
    operations.some((operation) => operation.role === "resolve-selected-hook") &&
    operations.some((operation) => operation.role === "bind-effect")
  ) {
    hookPattern = "selected-attachment-effect";
  } else if (effectTokens.length) {
    hookPattern = "effect-only";
  }

  return {
    hookPattern,
    builderProviders: providers,
    boneTokens,
    effectTokens,
    buffTokens,
    vcallOffsets: offsets,
    operationSequence,
  };
}

function parseOperationSequence(sequence = "") {
  return String(sequence || "")
    .split(" -> ")
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator < 0) return { role: part, values: [] };
      return {
        role: part.slice(0, separator),
        values: part
          .slice(separator + 1)
          .split(",")
          .filter(Boolean),
      };
    });
}

function extractEffectHookBindingInstances(rows) {
  const instances = [];
  const metadataByToken = new Map();
  for (const row of rows || []) {
    const existing = metadataByToken.get(row.token);
    if (!existing || (!existing.resourcePaths && row.resourcePaths)) metadataByToken.set(row.token, row);
  }

  for (const row of rows || []) {
    const operations = parseOperationSequence(row.operationSequence);
    let currentBone = "";
    let selectedHook = false;
    let currentInstance = null;
    let instanceIndex = 0;
    let pendingTokenBone = "";
    let selectedAttachmentSlot = "";
    const effectOnlyTokenReferences = new Set();

    const pushInstance = ({ bindKind, boneToken, effectToken }) => {
      const effectMetadata = metadataByToken.get(effectToken) || {};
      currentInstance = {
        platform: row.platform,
        token: row.token,
        sourceFile: row.sourceFile,
        functionName: row.functionName,
        line: row.line,
        instanceIndex,
        bindKind,
        boneToken,
        effectToken,
        selectedAttachmentSlot: bindKind === "selected-attachment-effect" ? selectedAttachmentSlot : "",
        hookPattern: row.hookPattern,
        aliasStatus: effectMetadata.aliasStatus || row.aliasStatus,
        aliasEvidenceStrength: effectMetadata.aliasEvidenceStrength || row.aliasEvidenceStrength,
        resourcePaths: effectMetadata.resourcePaths || row.resourcePaths,
        buffTokens: row.buffTokens,
        hasCallback: "no",
        setsVisibleOrActive: "no",
        setsEffectOption: "no",
        nativeSemanticCalls: row.nativeSemanticCalls,
      };
      instances.push(currentInstance);
      instanceIndex += 1;
      return currentInstance;
    };

    for (const operation of operations) {
      if (operation.role.startsWith("builder")) {
        currentBone = "";
        selectedHook = false;
        currentInstance = null;
        pendingTokenBone = "";
        selectedAttachmentSlot = "";
        continue;
      }
      if (operation.role === "select-bone") {
        currentBone = operation.values.find((value) => /^Bone_/.test(value)) || "";
        selectedHook = false;
        pendingTokenBone = "";
        selectedAttachmentSlot = "";
        continue;
      }
      if (operation.role === "select-effect-channel") {
        selectedHook = true;
        currentBone = "";
        pendingTokenBone = "";
        selectedAttachmentSlot = operation.values.find((value) => /^\d+$/.test(value)) || "";
        continue;
      }
      if (operation.role === "resolve-selected-hook") {
        selectedHook = true;
        currentBone = "";
        pendingTokenBone = "";
        continue;
      }
      if (operation.role === "bind-effect") {
        for (const effectToken of operation.values.filter((value) => /^Effect_/.test(value))) {
          pushInstance({
            bindKind: selectedHook ? "selected-attachment-effect" : currentBone ? "bone-bound-effect" : "effect-only",
            boneToken: currentBone,
            effectToken,
          });
        }
        pendingTokenBone = "";
        continue;
      }
      if (operation.role === "token-reference") {
        const boneTokens = operation.values.filter((value) => /^Bone_/.test(value));
        const effectTokens = operation.values.filter((value) => /^Effect_/.test(value));
        if (selectedHook && effectTokens.length) {
          for (const effectToken of effectTokens) {
            pushInstance({
              bindKind: "selected-attachment-effect",
              boneToken: "",
              effectToken,
            });
          }
          pendingTokenBone = "";
          continue;
        }
        if (boneTokens.length && effectTokens.length) {
          const boneToken = boneTokens[0];
          for (const effectToken of effectTokens) {
            pushInstance({
              bindKind: "token-pair-effect",
              boneToken,
              effectToken,
            });
          }
          pendingTokenBone = boneToken;
          continue;
        }
        if (boneTokens.length) {
          pendingTokenBone = boneTokens[boneTokens.length - 1];
          continue;
        }
        if (effectTokens.length && pendingTokenBone) {
          for (const effectToken of effectTokens) {
            pushInstance({
              bindKind: "token-pair-effect",
              boneToken: pendingTokenBone,
              effectToken,
            });
          }
          pendingTokenBone = "";
          continue;
        }
        if (effectTokens.length && row.hookPattern === "effect-only") {
          const directEffectTokens = effectTokens.filter((effectToken) => effectToken === row.token || metadataByToken.has(effectToken));
          for (const effectToken of directEffectTokens) {
            if (effectOnlyTokenReferences.has(effectToken)) continue;
            effectOnlyTokenReferences.add(effectToken);
            pushInstance({
              bindKind: "effect-only",
              boneToken: "",
              effectToken,
            });
          }
          if (directEffectTokens.length) continue;
        }
      }
      if (!currentInstance) continue;
      if (operation.role === "bind-effect-callback") currentInstance.hasCallback = "yes";
      if (operation.role === "set-visible-or-active") currentInstance.setsVisibleOrActive = "yes";
      if (operation.role === "set-effect-option") currentInstance.setsEffectOption = "yes";
    }
  }

  return instances.sort((left, right) => {
    if (left.token !== right.token) return left.token.localeCompare(right.token);
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    if (left.functionName !== right.functionName) return left.functionName.localeCompare(right.functionName);
    return Number(left.instanceIndex) - Number(right.instanceIndex);
  });
}

function blockForFunction(sourceText, functionName) {
  return findFunctionBlocks(sourceText.split(/\r?\n/)).find((block) => block.functionName === functionName);
}

function buildNativeEffectHookBuilderRows(
  candidateRows,
  aliasRows,
  sourceReader = (filePath) => fs.readFileSync(filePath, "utf8"),
  eventBridgeRows = [],
) {
  const aliasByToken = new Map(aliasRows.map((row) => [row.token, row]));
  const eventBridgeByToken = new Map(eventBridgeRows.map((row) => [row.token, row]));
  const sourceCache = new Map();
  const blockCache = new Map();
  const rows = [];

  for (const candidate of candidateRows) {
    if (candidate.role !== "weapon-effect-hook") continue;
    if (!sourceCache.has(candidate.sourceFile)) sourceCache.set(candidate.sourceFile, sourceReader(candidate.sourceFile));
    const cacheKey = `${candidate.sourceFile}:${candidate.functionName}`;
    if (!blockCache.has(cacheKey)) blockCache.set(cacheKey, blockForFunction(sourceCache.get(candidate.sourceFile), candidate.functionName));
    const block = blockCache.get(cacheKey);
    if (!block) continue;
    const analysis = analyzeEffectHookBlock(block.text);
    const alias = aliasByToken.get(candidate.token) || {};
    const eventBridge = eventBridgeByToken.get(candidate.token) || {};
    const bridgeStatus = eventBridge.bridgeStatus === "native-and-definition" ? "definition-bridged" : eventBridge.bridgeStatus || "";
    const aliasStatus = alias.aliasStatus || bridgeStatus;
    const aliasEvidenceStrength =
      alias.evidenceStrength || (bridgeStatus === "definition-bridged" ? "definition-token" : "");
    rows.push({
      platform: candidate.platform,
      token: candidate.token,
      aliasStatus,
      aliasEvidenceStrength,
      hookPattern: analysis.hookPattern,
      sourceFile: candidate.sourceFile,
      functionName: candidate.functionName,
      line: candidate.line,
      builderProviders: analysis.builderProviders.join("|"),
      boneTokens: analysis.boneTokens.join("|"),
      effectTokens: analysis.effectTokens.join("|"),
      buffTokens: analysis.buffTokens.join("|"),
      vcallOffsets: analysis.vcallOffsets.join("|"),
      operationSequence: analysis.operationSequence,
      resourcePaths: alias.resourcePaths || "",
      nativeSemanticCalls: candidate.semanticCalls,
    });
  }

  return rows.sort((left, right) => {
    if (left.token !== right.token) return left.token.localeCompare(right.token);
    if (left.platform !== right.platform) return left.platform.localeCompare(right.platform);
    return left.functionName.localeCompare(right.functionName);
  });
}

function summarize(rows, candidateRows) {
  const byHookPattern = {};
  const byAliasStatus = {};
  const byPlatform = {};
  for (const row of rows) {
    byHookPattern[row.hookPattern] = (byHookPattern[row.hookPattern] || 0) + 1;
    byAliasStatus[row.aliasStatus || "unbridged"] = (byAliasStatus[row.aliasStatus || "unbridged"] || 0) + 1;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
  }
  return {
    candidateRows: candidateRows.length,
    rows: rows.length,
    functions: uniq(rows.map((row) => `${row.platform}:${row.functionName}`)).length,
    byPlatform,
    byHookPattern,
    byAliasStatus,
    weakCandidateRows: rows
      .filter((row) => row.aliasEvidenceStrength === "weak")
      .map((row) => `${row.platform}:${row.token}:${row.functionName}`),
  };
}

function exportNativeEffectHookBuilderChain({
  candidatesPath = defaultCandidatesPath,
  aliasBridgePath = defaultAliasBridgePath,
  eventBridgePath = defaultEventBridgePath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  bindingTsvOut = defaultBindingTsvOut,
  bindingJsonOut = defaultBindingJsonOut,
} = {}) {
  const candidateRows = readTsv(candidatesPath);
  const aliasRows = fs.existsSync(aliasBridgePath) ? readTsv(aliasBridgePath) : [];
  const eventBridgeRows = fs.existsSync(eventBridgePath) ? readTsv(eventBridgePath) : [];
  const rows = buildNativeEffectHookBuilderRows(candidateRows, aliasRows, undefined, eventBridgeRows);
  const columns = [
    "platform",
    "token",
    "aliasStatus",
    "aliasEvidenceStrength",
    "hookPattern",
    "sourceFile",
    "functionName",
    "line",
    "builderProviders",
    "boneTokens",
    "effectTokens",
    "buffTokens",
    "vcallOffsets",
    "operationSequence",
    "resourcePaths",
    "nativeSemanticCalls",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, candidateRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  const bindingRows = extractEffectHookBindingInstances(rows);
  writeTsv(bindingTsvOut, bindingRows, [
    "platform",
    "token",
    "bindKind",
    "boneToken",
    "effectToken",
    "selectedAttachmentSlot",
    "hasCallback",
    "setsVisibleOrActive",
    "setsEffectOption",
    "sourceFile",
    "functionName",
    "line",
    "instanceIndex",
    "hookPattern",
    "aliasStatus",
    "aliasEvidenceStrength",
    "resourcePaths",
    "buffTokens",
    "nativeSemanticCalls",
  ]);
  const bindingSummary = summarizeBindingInstances(bindingRows);
  fs.mkdirSync(path.dirname(bindingJsonOut), { recursive: true });
  fs.writeFileSync(
    bindingJsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary: bindingSummary, items: bindingRows }, null, 2)}\n`,
  );
  return summary;
}

function summarizeBindingInstances(rows) {
  const byBindKind = {};
  const byPlatform = {};
  const byCallback = {};
  const byVisibleOrActive = {};
  for (const row of rows || []) {
    byBindKind[row.bindKind] = (byBindKind[row.bindKind] || 0) + 1;
    byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1;
    byCallback[row.hasCallback] = (byCallback[row.hasCallback] || 0) + 1;
    byVisibleOrActive[row.setsVisibleOrActive] = (byVisibleOrActive[row.setsVisibleOrActive] || 0) + 1;
  }
  return {
    rows: rows.length,
    tokens: uniq(rows.map((row) => row.token)).length,
    effectTokens: uniq(rows.map((row) => row.effectToken)).length,
    boneTokens: uniq(rows.map((row) => row.boneToken)).length,
    byPlatform,
    byBindKind,
    byCallback,
    byVisibleOrActive,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeEffectHookBuilderChain({
    candidatesPath: optionValue(args, "--candidates", defaultCandidatesPath),
    aliasBridgePath: optionValue(args, "--alias-bridge", defaultAliasBridgePath),
    eventBridgePath: optionValue(args, "--event-bridge", defaultEventBridgePath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    bindingTsvOut: optionValue(args, "--binding-tsv-out", defaultBindingTsvOut),
    bindingJsonOut: optionValue(args, "--binding-json-out", defaultBindingJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  analyzeEffectHookBlock,
  buildNativeEffectHookBuilderRows,
  exportNativeEffectHookBuilderChain,
  extractEffectHookBindingInstances,
  operationRows,
  parseOperationSequence,
  summarizeBindingInstances,
};
