#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultHelperDefinitionBridgePath = "extracted/reports/native_attachment_helper_definition_bridge.tsv";
const defaultAbilitySlotsPath = "extracted/reports/definition_ability_set_slots.tsv";
const defaultAbilityVariableSlotsPath = "extracted/reports/definition_ability_variable_slots.tsv";
const defaultTsvOut = "extracted/reports/native_attachment_helper_ability_slot_bridge.tsv";
const defaultJsonOut = "extracted/reports/native_attachment_helper_ability_slot_bridge_summary.json";

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

function parseDirectAbilitySlots(value) {
  return splitList(value).map((entry) => {
    const match = entry.match(/^(\d+):([^@]+)@(\d+):field0x([0-9a-f]+)/i);
    if (!match) return { raw: entry };
    return {
      raw: entry,
      slotIndex: Number(match[1]),
      abilityName: match[2],
      objectOffset: Number(match[3]),
      fieldOffset: `0x${match[4].toLowerCase()}`,
    };
  });
}

function definitionMatchesHeroCodes(definitionPath, heroCodes) {
  if (!heroCodes.length) return true;
  return heroCodes.some((heroCode) => definitionPath.includes(`/${heroCode}/`) || definitionPath.includes(`${heroCode}_`));
}

function classifyContext({ definitionPath, definitionPaths, heroCodes, narrowedPaths, selectionKind, abilityRow }) {
  if (!definitionPath.startsWith("Characters/")) {
    return {
      contextClass: "non-character-helper-context",
      contextConfidence: "low",
      contextReason: "definition path is outside Characters/ and is not a direct hero AbilitySet context",
    };
  }

  if (!abilityRow) {
    return {
      contextClass: "definition-without-direct-ability-set",
      contextConfidence: "low",
      contextReason: "definition path is character-scoped but does not have a direct block-1 AbilitySet row",
    };
  }

  if (selectionKind === "hero-code-filtered" && heroCodes.length && narrowedPaths.includes(definitionPath)) {
    return {
      contextClass: "hero-code-filtered-character-context",
      contextConfidence: "high",
      contextReason: "effect/resource alias supplied a Hero### code that narrowed the bridged definition list",
    };
  }

  if (selectionKind === "specific-character-token-filtered") {
    return {
      contextClass: "specific-token-character-context",
      contextConfidence: "high",
      contextReason: "a non-generic native/data token narrowed the bridged definition list to character definitions",
    };
  }

  if (definitionPaths.length === 1) {
    return {
      contextClass: "single-definition-character-context",
      contextConfidence: "medium",
      contextReason: "only one bridged character definition is available, but no Hero### alias narrowed it",
    };
  }

  return {
    contextClass: "ambiguous-generic-token-context",
    contextConfidence: "low",
    contextReason: "generic parent tokens bridge to multiple character definitions without a Hero### narrowing signal",
  };
}

function buildAbilitySlotIndex(abilitySlotRows) {
  const byPath = new Map();
  for (const row of abilitySlotRows) {
    if (row.blockIndex !== "1") continue;
    if (!byPath.has(row.relativePath)) byPath.set(row.relativePath, row);
  }
  return byPath;
}

function buildAbilityVariableIndex(abilityVariableRows) {
  const byKey = new Map();
  for (const row of abilityVariableRows) {
    const key = [row.relativePath, row.blockIndex, row.abilityName, row.variableIndex].join("\t");
    byKey.set(key, row);
  }
  return byKey;
}

function bridgeHelperAbilitySlotRows(helperDefinitionRows, abilitySlotRows, abilityVariableRows = []) {
  const abilityByPath = buildAbilitySlotIndex(abilitySlotRows);
  const variableByKey = buildAbilityVariableIndex(abilityVariableRows);
  const rows = [];

  for (const helper of helperDefinitionRows) {
    const groupIndex = parseInteger(helper.groupArg);
    const variableIndex = parseInteger(helper.indexArg);
    const definitionPaths = splitList(helper.definitionPaths);
    const specificDefinitionPaths = splitList(helper.specificDefinitionPaths);
    const specificCharacterDefinitionPaths = splitList(helper.specificCharacterDefinitionPaths);
    const heroCodes = splitList(helper.heroCodes);
    const narrowedPaths = heroCodes.length
      ? definitionPaths.filter((definitionPath) => definitionMatchesHeroCodes(definitionPath, heroCodes))
      : [];
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

    for (const definitionPath of selectedDefinitionPaths) {
      const abilityRow = abilityByPath.get(definitionPath);
      const directSlots = abilityRow ? parseDirectAbilitySlots(abilityRow.directAbilitySlots) : [];
      const directSlot = directSlots.find((slot) => slot.slotIndex === groupIndex);
      const context = classifyContext({ definitionPath, definitionPaths, heroCodes, narrowedPaths, selectionKind, abilityRow });
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
        platform: helper.platform,
        argKey: helper.argKey,
        groupArg: helper.groupArg,
        indexArg: helper.indexArg,
        kindArg: helper.kindArg,
        flagArg: helper.flagArg,
        parentRoles: helper.parentRoles,
        parentTokens: helper.parentTokens,
        definitionPath,
        definitionPathSelection: selectionKind,
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
        interpretation:
          "Helper groupArg maps to the runtime ability slot loaded from AbilitySet +0x30; indexArg maps to Ability +0xb0 AbilityVariable entries when variable evidence is available.",
      });
    }
  }

  return rows.sort((left, right) => {
    if (left.argKey !== right.argKey) return left.argKey.localeCompare(right.argKey);
    if (left.definitionPath !== right.definitionPath) return left.definitionPath.localeCompare(right.definitionPath);
    return left.platform.localeCompare(right.platform);
  });
}

function summarize(rows, helperDefinitionRows) {
  const bySlotStatus = {};
  const byVariableStatus = {};
  const byContextClass = {};
  const byContextConfidence = {};
  for (const row of rows) bySlotStatus[row.slotStatus] = (bySlotStatus[row.slotStatus] || 0) + 1;
  for (const row of rows) byVariableStatus[row.runtimeVariableStatus] = (byVariableStatus[row.runtimeVariableStatus] || 0) + 1;
  for (const row of rows) byContextClass[row.contextClass] = (byContextClass[row.contextClass] || 0) + 1;
  for (const row of rows) byContextConfidence[row.contextConfidence] = (byContextConfidence[row.contextConfidence] || 0) + 1;
  return {
    helperDefinitionRows: helperDefinitionRows.length,
    rows: rows.length,
    resolvedRows: rows.filter((row) => row.slotStatus === "resolved-direct-ability-slot").length,
    unresolvedRows: rows.filter((row) => row.slotStatus !== "resolved-direct-ability-slot").length,
    resolvedVariableRows: rows.filter((row) => row.runtimeVariableStatus === "resolved-ability-variable").length,
    unresolvedVariableRows: rows.filter((row) => row.runtimeVariableStatus !== "resolved-ability-variable").length,
    uniqueResolvedAbilities: uniq(rows.map((row) => row.runtimeAbilityName)).length,
    uniqueResolvedVariables: uniq(rows.map((row) => row.runtimeVariableName)).length,
    bySlotStatus,
    byVariableStatus,
    byContextClass,
    byContextConfidence,
  };
}

function exportNativeAttachmentHelperAbilitySlotBridge({
  helperDefinitionBridgePath = defaultHelperDefinitionBridgePath,
  abilitySlotsPath = defaultAbilitySlotsPath,
  abilityVariableSlotsPath = defaultAbilityVariableSlotsPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const helperDefinitionRows = readTsv(helperDefinitionBridgePath);
  const abilitySlotRows = readTsv(abilitySlotsPath);
  const abilityVariableRows = readOptionalTsv(abilityVariableSlotsPath);
  const rows = bridgeHelperAbilitySlotRows(helperDefinitionRows, abilitySlotRows, abilityVariableRows);
  const columns = [
    "platform",
    "argKey",
    "groupArg",
    "indexArg",
    "kindArg",
    "flagArg",
    "parentRoles",
    "parentTokens",
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
    "interpretation",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, helperDefinitionRows);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, sampleRows: rows.slice(0, 100) }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeAttachmentHelperAbilitySlotBridge({
    helperDefinitionBridgePath: optionValue(args, "--helper-definition-bridge", defaultHelperDefinitionBridgePath),
    abilitySlotsPath: optionValue(args, "--ability-slots", defaultAbilitySlotsPath),
    abilityVariableSlotsPath: optionValue(args, "--ability-variables", defaultAbilityVariableSlotsPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildAbilityVariableIndex,
  bridgeHelperAbilitySlotRows,
  classifyContext,
  exportNativeAttachmentHelperAbilitySlotBridge,
  parseDirectAbilitySlots,
};
