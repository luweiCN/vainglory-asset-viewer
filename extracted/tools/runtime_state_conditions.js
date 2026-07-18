#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultVisibilityPath = "extracted/reports/native_visibility_event_candidates.tsv";
const defaultVisibilityStatePath = "extracted/reports/native_visibility_state_write_chain.tsv";
const defaultVisibilityCallbackPath = "extracted/reports/native_visibility_callback_chain.tsv";
const defaultStateWritePath = "extracted/reports/native_attachment_state_write_chain.tsv";
const defaultAttachmentCallbackPath = "extracted/reports/native_attachment_callback_chain.tsv";
const defaultHelperAbilitySlotPath = "extracted/reports/native_attachment_helper_call_ability_slot_bridge.tsv";
const defaultProjectileCallbackPath = "extracted/viewer/native-projectile-callback-semantics.json";
const defaultTsvOut = "extracted/reports/runtime_state_conditions.tsv";
const defaultJsonOut = "extracted/reports/runtime_state_conditions_summary.json";
const defaultViewerOut = "extracted/viewer/runtime-state-conditions.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function readManifestItems(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(manifest) ? manifest : manifest.items || [];
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

function pipeValues(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJoin(values) {
  return unique(values).join("|");
}

function sourceCharacterFromPath(value) {
  return String(value || "").match(/^Characters\/([^/]+)\//)?.[1] || "";
}

function sourceHeroNameFromPath(value) {
  const text = String(value || "");
  if (!/[/.]/.test(text)) return "";
  return path.basename(text, ".def");
}

function pathTokens(value) {
  return String(value || "")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function tokensForRow(...values) {
  const output = [];
  for (const value of values) {
    for (const item of pipeValues(value)) {
      output.push(item);
      output.push(...pathTokens(item));
      output.push(sourceCharacterFromPath(item));
      output.push(sourceHeroNameFromPath(item));
    }
  }
  return unique(output);
}

function resourceKeysForRow(...values) {
  const generic = new Set(["Characters", "Effects", "Art", "def", "Skin", "DefaultSkin"]);
  const output = [];
  for (const value of values) {
    for (const item of pipeValues(value)) {
      if (!/[\/_.]/.test(item)) output.push(item);
      output.push(...pathTokens(item).filter((token) => !generic.has(token)));
      output.push(sourceCharacterFromPath(item));
      output.push(sourceHeroNameFromPath(item));
    }
  }
  return unique(output);
}

function classifyVisibilityCondition(row) {
  const text = `${row.role || ""} ${row.token || ""}`.toLowerCase();
  if (/hide|invisible/.test(text)) return "visibility-hide-or-invisible-buff";
  if (/show/.test(text)) return "visibility-show-effect-buff";
  if (/visible|truesight/.test(text)) return "visibility-visible-buff";
  return "visibility-state-buff";
}

function classifyAttachmentStateCondition(row) {
  const role = row.operationRole || "";
  if (/callback-register/.test(role) || role === "function-pointer-field-write") return "attachment-callback-register";
  if (role === "flag-field-write") return "attachment-flag-write";
  if (role === "state-config-field-write") return "attachment-state-config-write";
  if (role === "string-field-write") return "attachment-string-state-write";
  if (role === "hash-or-id-field-write") return "attachment-id-write";
  return "attachment-state-write";
}

function classifyVisibilityStateCondition(row) {
  const role = row.operationRole || "";
  if (/callback-register/.test(role) || role === "function-pointer-field-write") return "visibility-callback-register";
  if (role === "flag-field-write") return "visibility-flag-write";
  if (role === "string-field-write") return "visibility-string-state-write";
  return "visibility-state-write";
}

function classifyAttachmentCallbackCondition(row) {
  const text = `${row.parentTokens || ""}|${row.callbackTokens || ""}|${row.parentRoles || ""}`.toLowerCase();
  if (/effect_/.test(text)) return "attachment-effect-callback";
  if (/buff_/.test(text)) return "attachment-buff-callback";
  if (/bone_/.test(text)) return "attachment-bone-callback";
  return "attachment-callback";
}

function classifyVisibilityCallbackCondition(row) {
  const text = `${row.parentTokens || ""}|${row.callbackTokens || ""}|${row.parentRoles || ""}`.toLowerCase();
  if (/hide|invisible/.test(text)) return "visibility-hide-callback";
  if (/show|visible|truesight/.test(text)) return "visibility-callback";
  return "visibility-callback";
}

function classifyProjectileCallbackCondition(row) {
  return `projectile-${String(row.semanticClass || "unresolved").replace(/_/g, "-")}`;
}

function classifyHelperAbilitySlotCondition(row) {
  if (row.runtimeVariableStatus === "resolved-ability-variable" && row.runtimeVariableName) {
    return "attachment-runtime-ability-variable";
  }
  if (row.slotStatus === "resolved-direct-ability-slot" || row.runtimeAbilityName) return "attachment-runtime-ability-slot";
  return "attachment-runtime-helper-slot";
}

function helperAbilitySlotRowResolved(row) {
  return (
    row.contextConfidence === "high" &&
    (row.runtimeVariableStatus === "resolved-ability-variable" ||
      row.slotStatus === "resolved-direct-ability-slot" ||
      Boolean(row.runtimeAbilityName))
  );
}

function filterHelperAbilitySlotRuntimeRows(rows = []) {
  const resolvedCallKeys = new Set();
  for (const row of rows) {
    if (row.callKey && helperAbilitySlotRowResolved(row)) resolvedCallKeys.add(row.callKey);
  }

  return rows.filter((row) => {
    if (!row.callKey || !resolvedCallKeys.has(row.callKey)) return true;
    return helperAbilitySlotRowResolved(row);
  });
}

function visibilityConditionRows(rows) {
  return (rows || []).map((row) => ({
    sourceKind: "visibility-event",
    conditionKind: classifyVisibilityCondition(row),
    platform: row.platform || "",
    token: row.token || row.rawToken || "",
    role: row.role || "",
    bridgeStatus: row.bridgeStatus || "",
    sourceFile: row.sourceFile || "",
    functionName: row.functionName || "",
    line: row.line || "",
    callbackFunction: "",
    operationRole: "",
    fieldOffset: "",
    vcallOffset: "",
    actionKeys: "",
    semanticClass: "",
    evidence: row.semanticCalls || "",
    resourceKeys: uniqueJoin(resourceKeysForRow(row.definitionPaths, row.token)),
  }));
}

function attachmentStateConditionRows(rows) {
  return (rows || []).map((row) => ({
    sourceKind: "attachment-state-write",
    conditionKind: classifyAttachmentStateCondition(row),
    platform: row.platform || "",
    token: uniqueJoin(tokensForRow(row.candidateTokens, row.tokensInLine)),
    role: row.candidateRoles || "",
    bridgeStatus: row.bridgeStatuses || "",
    sourceFile: row.sourceFile || "",
    functionName: row.functionName || "",
    line: row.line || "",
    callbackFunction: row.callbackFunction || "",
    operationRole: row.operationRole || "",
    fieldOffset: row.fieldOffset || "",
    vcallOffset: row.vcallOffset || "",
    actionKeys: "",
    semanticClass: "",
    evidence: row.semanticCalls || row.valueExpr || "",
    resourceKeys: uniqueJoin(resourceKeysForRow(row.candidateTokens, row.tokensInLine)),
  }));
}

function visibilityStateConditionRows(rows) {
  return (rows || []).map((row) => ({
    sourceKind: "visibility-state-write",
    conditionKind: classifyVisibilityStateCondition(row),
    platform: row.platform || "",
    token: uniqueJoin(tokensForRow(row.candidateTokens, row.tokensInLine)),
    role: row.candidateRoles || "",
    bridgeStatus: row.bridgeStatuses || "",
    sourceFile: row.sourceFile || "",
    functionName: row.functionName || "",
    line: row.line || "",
    callbackFunction: row.callbackFunction || "",
    operationRole: row.operationRole || "",
    fieldOffset: row.fieldOffset || "",
    vcallOffset: row.vcallOffset || "",
    actionKeys: "",
    semanticClass: "",
    evidence: row.semanticCalls || row.valueExpr || "",
    resourceKeys: uniqueJoin(resourceKeysForRow(row.candidateTokens, row.tokensInLine)),
  }));
}

function attachmentCallbackConditionRows(rows) {
  return (rows || []).map((row) => ({
    sourceKind: "attachment-callback",
    conditionKind: classifyAttachmentCallbackCondition(row),
    platform: "",
    token: uniqueJoin(tokensForRow(row.parentTokens, row.callbackTokens)),
    role: row.parentRoles || "",
    bridgeStatus: row.parentBridgeStatuses || "",
    sourceFile: row.callbackSourceFile || "",
    functionName: uniqueJoin(pipeValues(row.parentFunctions).map((item) => item.split(":").pop())),
    line: row.callbackStartLine || "",
    callbackFunction: row.callbackFunction || "",
    operationRole: row.callbackOperationRoles || "",
    fieldOffset: row.callbackFieldOffsets || "",
    vcallOffset: row.callbackVcallOffsets || row.registrationVcallOffsets || "",
    actionKeys: "",
    semanticClass: "",
    evidence: row.helperCalls || "",
    resourceKeys: uniqueJoin(resourceKeysForRow(row.parentTokens, row.callbackTokens)),
  }));
}

function visibilityCallbackConditionRows(rows) {
  return (rows || []).map((row) => ({
    sourceKind: "visibility-callback",
    conditionKind: classifyVisibilityCallbackCondition(row),
    platform: "",
    token: uniqueJoin(tokensForRow(row.parentTokens, row.callbackTokens)),
    role: row.parentRoles || "",
    bridgeStatus: row.parentBridgeStatuses || "",
    sourceFile: row.callbackSourceFile || "",
    functionName: uniqueJoin(pipeValues(row.parentFunctions).map((item) => item.split(":").pop())),
    line: row.callbackStartLine || "",
    callbackFunction: row.callbackFunction || "",
    operationRole: row.callbackOperationRoles || "",
    fieldOffset: row.callbackFieldOffsets || "",
    vcallOffset: row.callbackVcallOffsets || row.registrationVcallOffsets || "",
    actionKeys: "",
    semanticClass: "",
    evidence: row.helperCalls || "",
    resourceKeys: uniqueJoin(resourceKeysForRow(row.parentTokens, row.callbackTokens)),
  }));
}

function projectileCallbackConditionRows(rows) {
  return (rows || [])
    .filter((row) => row.semanticClass && row.semanticClass !== "unresolved")
    .map((row) => ({
      sourceKind: "projectile-callback",
      conditionKind: classifyProjectileCallbackCondition(row),
      platform: row.platform || "",
      token: uniqueJoin([...pipeValues(row.emitterLabel), ...pipeValues(row.emitterLabels), ...pipeValues(row.projectileIdHex), ...pipeValues(row.projectileIdHexes)]),
      role: row.callbackSlot || "",
      bridgeStatus: "",
      sourceFile: row.sourceFile || "",
      functionName: row.functionName || "",
      line: row.callbackLine || "",
      callbackFunction: row.callbackFunction || "",
      operationRole: "",
      fieldOffset: "",
      vcallOffset: "",
      actionKeys: uniqueJoin(pipeValues(row.actionKeys)),
      semanticClass: row.semanticClass || "",
      evidence: row.evidenceTags || "",
      resourceKeys: uniqueJoin(resourceKeysForRow(row.heroNames)),
    }));
}

function helperAbilitySlotConditionRows(rows) {
  return filterHelperAbilitySlotRuntimeRows(rows || []).map((row) => ({
    sourceKind: "attachment-helper-ability-slot",
    conditionKind: classifyHelperAbilitySlotCondition(row),
    platform: row.platform || "",
    token: uniqueJoin(
      tokensForRow(row.parentTokens, row.combinedParentTokens, row.runtimeAbilityName, row.runtimeVariableName).filter(
        (token) => token !== row.definitionPath,
      ),
    ),
    role: row.parentRoles || "",
    bridgeStatus: row.contextConfidence || "",
    sourceFile: row.callbackSourceFile || "",
    functionName: row.callbackFunction || "",
    line: row.line || "",
    callbackFunction: row.callbackFunction || "",
    operationRole: row.helperFamily || "",
    fieldOffset: row.runtimeAbilityFieldOffset || row.runtimeVariablePointerFieldOffset || "",
    vcallOffset: "",
    actionKeys: "",
    semanticClass: row.runtimeVariableStatus || row.slotStatus || "",
    evidence: [row.runtimeAbilityName, row.runtimeVariableName, row.argKey].filter(Boolean).join("|"),
    resourceKeys: uniqueJoin(resourceKeysForRow(row.definitionPath, row.parentTokens, row.combinedParentTokens, row.runtimeAbilityName)),
  }));
}

function buildRuntimeStateConditionRows({
  visibilityRows,
  visibilityStateRows,
  visibilityCallbackRows,
  stateWriteRows,
  attachmentCallbackRows,
  helperAbilitySlotRows,
  projectileCallbackRows,
}) {
  const rows = [
    ...visibilityConditionRows(visibilityRows),
    ...visibilityStateConditionRows(visibilityStateRows),
    ...visibilityCallbackConditionRows(visibilityCallbackRows),
    ...attachmentStateConditionRows(stateWriteRows),
    ...attachmentCallbackConditionRows(attachmentCallbackRows),
    ...helperAbilitySlotConditionRows(helperAbilitySlotRows),
    ...projectileCallbackConditionRows(projectileCallbackRows),
  ];
  return rows.sort((left, right) => {
    if (left.sourceKind !== right.sourceKind) return left.sourceKind.localeCompare(right.sourceKind);
    if (left.conditionKind !== right.conditionKind) return left.conditionKind.localeCompare(right.conditionKind);
    return `${left.resourceKeys}:${left.token}`.localeCompare(`${right.resourceKeys}:${right.token}`);
  });
}

function summarizeRuntimeStateConditionRows(rows) {
  const bySourceKind = {};
  const byConditionKind = {};
  const bySemanticClass = {};
  for (const row of rows || []) {
    bySourceKind[row.sourceKind] = (bySourceKind[row.sourceKind] || 0) + 1;
    byConditionKind[row.conditionKind] = (byConditionKind[row.conditionKind] || 0) + 1;
    if (row.semanticClass) bySemanticClass[row.semanticClass] = (bySemanticClass[row.semanticClass] || 0) + 1;
  }
  return {
    rows: rows.length,
    stateConditionalRows: rows.filter((row) => !/unresolved$/.test(row.conditionKind)).length,
    bySourceKind: Object.fromEntries(Object.entries(bySourceKind).sort(([left], [right]) => left.localeCompare(right))),
    byConditionKind: Object.fromEntries(Object.entries(byConditionKind).sort(([left], [right]) => left.localeCompare(right))),
    bySemanticClass: Object.fromEntries(Object.entries(bySemanticClass).sort(([left], [right]) => left.localeCompare(right))),
  };
}

const columns = [
  "sourceKind",
  "conditionKind",
  "platform",
  "resourceKeys",
  "token",
  "role",
  "bridgeStatus",
  "actionKeys",
  "semanticClass",
  "functionName",
  "callbackFunction",
  "operationRole",
  "fieldOffset",
  "vcallOffset",
  "sourceFile",
  "line",
  "evidence",
];

function exportRuntimeStateConditions({
  visibilityPath = defaultVisibilityPath,
  visibilityStatePath = defaultVisibilityStatePath,
  visibilityCallbackPath = defaultVisibilityCallbackPath,
  stateWritePath = defaultStateWritePath,
  attachmentCallbackPath = defaultAttachmentCallbackPath,
  helperAbilitySlotPath = defaultHelperAbilitySlotPath,
  projectileCallbackPath = defaultProjectileCallbackPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const rows = buildRuntimeStateConditionRows({
    visibilityRows: readTsv(visibilityPath),
    visibilityStateRows: readTsv(visibilityStatePath),
    visibilityCallbackRows: readTsv(visibilityCallbackPath),
    stateWriteRows: readTsv(stateWritePath),
    attachmentCallbackRows: readTsv(attachmentCallbackPath),
    helperAbilitySlotRows: readTsv(helperAbilitySlotPath),
    projectileCallbackRows: readManifestItems(projectileCallbackPath),
  });
  const summary = summarizeRuntimeStateConditionRows(rows);
  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeStateConditions({
    visibilityPath: optionValue(args, "--visibility", defaultVisibilityPath),
    visibilityStatePath: optionValue(args, "--visibility-state-writes", defaultVisibilityStatePath),
    visibilityCallbackPath: optionValue(args, "--visibility-callbacks", defaultVisibilityCallbackPath),
    stateWritePath: optionValue(args, "--state-writes", defaultStateWritePath),
    attachmentCallbackPath: optionValue(args, "--attachment-callbacks", defaultAttachmentCallbackPath),
    helperAbilitySlotPath: optionValue(args, "--helper-ability-slots", defaultHelperAbilitySlotPath),
    projectileCallbackPath: optionValue(args, "--projectile-callbacks", defaultProjectileCallbackPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeStateConditionRows,
  classifyAttachmentCallbackCondition,
  classifyAttachmentStateCondition,
  classifyVisibilityCondition,
  classifyVisibilityStateCondition,
  classifyVisibilityCallbackCondition,
  classifyHelperAbilitySlotCondition,
  exportRuntimeStateConditions,
  filterHelperAbilitySlotRuntimeRows,
  summarizeRuntimeStateConditionRows,
};
