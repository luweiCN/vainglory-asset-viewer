#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { isGenericDefinitionToken, parseParentTokens } = require("./native_attachment_helper_definition_bridge");
const { classifyContext, parseDirectAbilitySlots } = require("./native_attachment_helper_ability_slot_bridge");

const defaultHelperCallPath = "extracted/reports/native_attachment_helper_call_chain.tsv";
const defaultEventBridgePath = "extracted/reports/attachment_event_bridge.tsv";
const defaultAliasBridgePath = "extracted/reports/attachment_effect_alias_bridge.tsv";
const defaultHeroNamesPath = "extracted/reports/hero_ability_effect_sound_buff_names.tsv";
const defaultDefinitionManifestPath = "extracted/reports/definition_manifest_chain.tsv";
const defaultAbilitySlotsPath = "extracted/reports/definition_ability_set_slots.tsv";
const defaultAbilityVariableSlotsPath = "extracted/reports/definition_ability_variable_slots.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_helper_call_ability_slot_bridge.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_helper_call_ability_slot_bridge_summary.json";

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

function readOptionalTsv(filePath) {
  return fs.existsSync(filePath) ? readTsv(filePath) : [];
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

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function parseInteger(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = text.startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function buildIndex(rows, key = "token") {
  const index = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    if (!index.has(value)) index.set(value, []);
    index.get(value).push(row);
  }
  return index;
}

function addIndexValue(index, key, value) {
  if (!key || !value) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function buildHeroDefinitionIndex(heroNameRows, definitionManifestRows) {
  const heroToDefinitionPath = new Map();
  for (const row of definitionManifestRows) {
    if (row.targetFamily && row.targetFamily !== "character") continue;
    if (!row.targetRelativePath?.startsWith("Characters/")) continue;
    const match = String(row.manifestLabel || "").match(/^\*([^*]+)\*$/);
    if (!match) continue;
    heroToDefinitionPath.set(match[1], row.targetRelativePath);
  }

  const index = new Map();
  for (const row of heroNameRows) {
    const definitionPath = heroToDefinitionPath.get(row.hero);
    if (!definitionPath || !row.kind || !row.name) continue;
    addIndexValue(index, `${row.kind}_${row.hero}_${row.name}`, definitionPath);
    if (row.kind === "Ability") addIndexValue(index, `Ability__${row.hero}__${row.name}`, definitionPath);
  }

  for (const [key, values] of index) index.set(key, uniq(values));
  return index;
}

function buildAbilitySlotIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (row.blockIndex !== "1") continue;
    if (!index.has(row.relativePath)) index.set(row.relativePath, row);
  }
  return index;
}

function buildAbilityVariableIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    index.set([row.relativePath, row.blockIndex, row.abilityName, row.variableIndex].join("\t"), row);
  }
  return index;
}

function definitionMatchesHeroCodes(definitionPath, heroCodes) {
  return heroCodes.some((heroCode) => definitionPath.includes(`/${heroCode}/`) || definitionPath.includes(`${heroCode}_`));
}

function callKey(row) {
  return [row.platform, row.callbackFunction, row.line, row.argKey].join(":");
}

function definitionPathsForToken(token, eventRowsByToken, heroDefinitionIndex) {
  return uniq([
    ...(eventRowsByToken.get(token) || []).flatMap((row) => splitList(row.definitionPaths)),
    ...(heroDefinitionIndex.get(token) || []),
  ]);
}

function evidenceForCall(callRow, eventIndex, aliasIndex, heroDefinitionIndex) {
  const evidenceTokens = callRow.combinedParentTokens || callRow.parentTokens;
  const parentTokens = parseParentTokens(evidenceTokens);
  const eventRowsByToken = new Map(parentTokens.map(({ token }) => [token, eventIndex.get(token) || []]));
  const aliasRows = parentTokens.flatMap(({ token }) => aliasIndex.get(token) || []);
  const definitionPaths = uniq(parentTokens.flatMap(({ token }) => definitionPathsForToken(token, eventRowsByToken, heroDefinitionIndex)));
  const specificDefinitionPaths = uniq(
    parentTokens.flatMap(({ token }) =>
      isGenericDefinitionToken(token)
        ? []
        : definitionPathsForToken(token, eventRowsByToken, heroDefinitionIndex),
    ),
  );
  const specificCharacterDefinitionPaths = specificDefinitionPaths.filter((definitionPath) => definitionPath.startsWith("Characters/"));
  const heroCodes = uniq(aliasRows.flatMap((row) => splitList(row.heroCodes)));
  const narrowedPaths = heroCodes.length ? definitionPaths.filter((definitionPath) => definitionMatchesHeroCodes(definitionPath, heroCodes)) : [];

  let selectionKind = "all-bridged-definitions";
  let selectedDefinitionPaths = definitionPaths;
  if (narrowedPaths.length) {
    selectionKind = "hero-code-filtered";
    selectedDefinitionPaths = narrowedPaths;
  } else if (specificCharacterDefinitionPaths.length) {
    selectionKind = "specific-character-token-filtered";
    selectedDefinitionPaths = specificCharacterDefinitionPaths;
  } else if (specificDefinitionPaths.length) {
    selectionKind = "specific-token-filtered";
    selectedDefinitionPaths = specificDefinitionPaths;
  }

  return {
    definitionPaths,
    evidenceTokens,
    heroCodes,
    narrowedPaths,
    selectedDefinitionPaths,
    selectionKind,
    specificCharacterDefinitionPaths,
    specificDefinitionPaths,
  };
}

function bridgeHelperCallAbilitySlotRows({
  helperCallRows,
  eventBridgeRows,
  aliasBridgeRows,
  heroNameRows = [],
  definitionManifestRows = [],
  abilitySlotRows,
  abilityVariableRows = [],
}) {
  const eventIndex = buildIndex(eventBridgeRows);
  const aliasIndex = buildIndex(aliasBridgeRows);
  const heroDefinitionIndex = buildHeroDefinitionIndex(heroNameRows, definitionManifestRows);
  const abilityByPath = buildAbilitySlotIndex(abilitySlotRows);
  const variableByKey = buildAbilityVariableIndex(abilityVariableRows);
  const rows = [];

  for (const callRow of helperCallRows) {
    const evidence = evidenceForCall(callRow, eventIndex, aliasIndex, heroDefinitionIndex);
    const groupIndex = parseInteger(callRow.groupArg);
    const variableIndex = parseInteger(callRow.indexArg);

    for (const definitionPath of evidence.selectedDefinitionPaths) {
      const abilityRow = abilityByPath.get(definitionPath);
      const directSlots = abilityRow ? parseDirectAbilitySlots(abilityRow.directAbilitySlots) : [];
      const directSlot = directSlots.find((slot) => slot.slotIndex === groupIndex);
      const context = classifyContext({
        definitionPath,
        definitionPaths: evidence.definitionPaths,
        heroCodes: evidence.heroCodes,
        narrowedPaths: evidence.narrowedPaths,
        selectionKind: evidence.selectionKind,
        abilityRow,
      });

      let slotStatus = "resolved-direct-ability-slot";
      if (!abilityRow) slotStatus = "no-ability-set-for-definition";
      else if (!directSlot?.abilityName) slotStatus = "slot-index-out-of-direct-range";

      const variableKey = [definitionPath, abilityRow?.blockIndex || "", directSlot?.abilityName || "", String(variableIndex ?? "")].join("\t");
      const variable = variableByKey.get(variableKey);
      let variableStatus = "resolved-ability-variable";
      if (!directSlot?.abilityName) variableStatus = "no-resolved-ability-slot";
      else if (!abilityVariableRows.length) variableStatus = "no-variable-report";
      else if (variableIndex == null) variableStatus = "invalid-variable-index";
      else if (!variable) variableStatus = "variable-index-unresolved";

      rows.push({
        callKey: callKey(callRow),
        platform: callRow.platform,
        callbackFunction: callRow.callbackFunction,
        callbackSourceFile: callRow.callbackSourceFile,
        line: callRow.line,
        helperFunction: callRow.helperFunction,
        helperFamily: callRow.helperFamily,
        subjectExpr: callRow.subjectExpr,
        argKey: callRow.argKey,
        groupArg: callRow.groupArg,
        indexArg: callRow.indexArg,
        kindArg: callRow.kindArg,
        flagArg: callRow.flagArg,
        parentFunctions: callRow.parentFunctions,
        parentRoles: callRow.parentRoles,
        parentTokens: callRow.parentTokens,
        visualParentTokens: callRow.visualParentTokens || "",
        combinedParentTokens: callRow.combinedParentTokens || "",
        evidenceTokens: evidence.evidenceTokens,
        definitionPath,
        definitionPathSelection: evidence.selectionKind,
        contextClass: context.contextClass,
        contextConfidence: context.contextConfidence,
        contextReason: context.contextReason,
        abilitySetBlockIndex: abilityRow?.blockIndex || "",
        abilitySetBaseOffset: abilityRow?.abilitySetBaseOffset || "",
        abilityListObjectOffset: abilityRow?.abilityListObjectOffset || "",
        directAbilitySlotCount: abilityRow?.directAbilitySlotCount || "",
        slotStatus,
        runtimeAbilitySlotIndex: groupIndex ?? "",
        runtimeAbilityName: directSlot?.abilityName || "",
        runtimeAbilityObjectOffset: directSlot?.objectOffset ?? "",
        runtimeAbilityFieldOffset: directSlot?.fieldOffset || "",
        runtimeVariableIndex: variableIndex ?? "",
        runtimeVariableStatus: variableStatus,
        runtimeVariableName: variable?.variableName || "",
        runtimeVariableObjectOffset: variable?.variableObjectOffset || "",
        runtimeVariablePointerFieldOffset: variable?.variablePointerFieldOffset || "",
        runtimeVariableArrayObjectOffset: variable?.variableArrayObjectOffset || "",
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.callKey !== right.callKey) return left.callKey.localeCompare(right.callKey);
    return left.definitionPath.localeCompare(right.definitionPath);
  });
}

function summarize(rows, helperCallRows) {
  const rowsByContextClass = {};
  const rowsByContextConfidence = {};
  const calls = new Map();
  const confidenceRank = { low: 0, medium: 1, high: 2 };

  for (const row of rows) {
    rowsByContextClass[row.contextClass] = (rowsByContextClass[row.contextClass] || 0) + 1;
    rowsByContextConfidence[row.contextConfidence] = (rowsByContextConfidence[row.contextConfidence] || 0) + 1;
    const existing = calls.get(row.callKey);
    if (!existing || confidenceRank[row.contextConfidence] > confidenceRank[existing.contextConfidence]) {
      calls.set(row.callKey, row);
    }
  }

  const callContexts = {};
  for (const row of calls.values()) callContexts[row.contextConfidence] = (callContexts[row.contextConfidence] || 0) + 1;

  return {
    helperCallRows: helperCallRows.length,
    rows: rows.length,
    calls: calls.size,
    resolvedRows: rows.filter((row) => row.slotStatus === "resolved-direct-ability-slot").length,
    resolvedVariableRows: rows.filter((row) => row.runtimeVariableStatus === "resolved-ability-variable").length,
    callContexts,
    rowsByContextClass,
    rowsByContextConfidence,
  };
}

function exportNativeAttachmentHelperCallAbilitySlotBridge({
  helperCallPath = defaultHelperCallPath,
  eventBridgePath = defaultEventBridgePath,
  aliasBridgePath = defaultAliasBridgePath,
  heroNamesPath = defaultHeroNamesPath,
  definitionManifestPath = defaultDefinitionManifestPath,
  abilitySlotsPath = defaultAbilitySlotsPath,
  abilityVariableSlotsPath = defaultAbilityVariableSlotsPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const helperCallRows = readTsv(helperCallPath);
  const eventBridgeRows = readTsv(eventBridgePath);
  const aliasBridgeRows = readTsv(aliasBridgePath);
  const heroNameRows = readOptionalTsv(heroNamesPath);
  const definitionManifestRows = readOptionalTsv(definitionManifestPath);
  const abilitySlotRows = readTsv(abilitySlotsPath);
  const abilityVariableRows = readOptionalTsv(abilityVariableSlotsPath);
  const rows = bridgeHelperCallAbilitySlotRows({
    helperCallRows,
    eventBridgeRows,
    aliasBridgeRows,
    heroNameRows,
    definitionManifestRows,
    abilitySlotRows,
    abilityVariableRows,
  });
  const columns = [
    "callKey",
    "platform",
    "callbackFunction",
    "callbackSourceFile",
    "line",
    "helperFunction",
    "helperFamily",
    "subjectExpr",
    "argKey",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "parentFunctions",
    "parentRoles",
    "parentTokens",
    "visualParentTokens",
    "combinedParentTokens",
    "evidenceTokens",
    "definitionPath",
    "definitionPathSelection",
    "contextClass",
    "contextConfidence",
    "contextReason",
    "abilitySetBlockIndex",
    "abilitySetBaseOffset",
    "abilityListObjectOffset",
    "directAbilitySlotCount",
    "slotStatus",
    "runtimeAbilitySlotIndex",
    "runtimeAbilityName",
    "runtimeAbilityObjectOffset",
    "runtimeAbilityFieldOffset",
    "runtimeVariableIndex",
    "runtimeVariableStatus",
    "runtimeVariableName",
    "runtimeVariableObjectOffset",
    "runtimeVariablePointerFieldOffset",
    "runtimeVariableArrayObjectOffset",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, helperCallRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, sampleRows: rows.slice(0, 100) }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentHelperCallAbilitySlotBridge({
    helperCallPath: optionValue(args, "--helper-calls", defaultHelperCallPath),
    eventBridgePath: optionValue(args, "--event-bridge", defaultEventBridgePath),
    aliasBridgePath: optionValue(args, "--alias-bridge", defaultAliasBridgePath),
    heroNamesPath: optionValue(args, "--hero-names", defaultHeroNamesPath),
    definitionManifestPath: optionValue(args, "--definition-manifest", defaultDefinitionManifestPath),
    abilitySlotsPath: optionValue(args, "--ability-slots", defaultAbilitySlotsPath),
    abilityVariableSlotsPath: optionValue(args, "--ability-variables", defaultAbilityVariableSlotsPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildHeroDefinitionIndex,
  bridgeHelperCallAbilitySlotRows,
  exportNativeAttachmentHelperCallAbilitySlotBridge,
};
