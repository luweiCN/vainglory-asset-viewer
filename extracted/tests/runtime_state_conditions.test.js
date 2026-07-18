const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeStateConditionRows,
  classifyAttachmentCallbackCondition,
  classifyAttachmentStateCondition,
  classifyVisibilityCondition,
  exportRuntimeStateConditions,
  summarizeRuntimeStateConditionRows,
} = require("../tools/runtime_state_conditions");

const visibilityRows = [
  {
    platform: "ios",
    role: "hide-or-invisible-buff",
    token: "Buff_HeroA_Hide_Mesh",
    bridgeStatus: "native-and-definition",
    definitionPaths: "Characters/Hero001/HeroA.def",
    sourceFile: "functions/a.c",
    functionName: "FUN_visible",
    line: "12",
    semanticCalls: "vcall-add-buff",
  },
];

const stateWriteRows = [
  {
    platform: "ios",
    functionName: "FUN_state",
    operationRole: "callback-register-vcall",
    candidateTokens: "Effect_HeroA_Attack|Bone_Weapon",
    candidateRoles: "weapon-effect-hook|weapon-bone-hook",
    bridgeStatuses: "resource-candidate:weak|native-and-definition",
    semanticCalls: "add-or-apply-buff",
    sourceFile: "functions/a.c",
    line: "20",
    fieldOffset: "",
    callbackFunction: "FUN_callback",
    vcallOffset: "0x18",
    tokensInLine: "",
  },
  {
    platform: "ios",
    functionName: "FUN_state",
    operationRole: "flag-field-write",
    candidateTokens: "Buff_HeroA_Attached",
    candidateRoles: "attached-state-buff",
    bridgeStatuses: "native-and-definition",
    semanticCalls: "",
    sourceFile: "functions/a.c",
    line: "21",
    fieldOffset: "0x48",
    callbackFunction: "",
    vcallOffset: "",
    tokensInLine: "",
  },
];

const visibilityStateRows = [
  {
    platform: "ios",
    functionName: "FUN_visibility_state",
    operationRole: "field-write",
    candidateTokens: "Buff_HeroA_Show_Weapon",
    candidateRoles: "show-effect-or-indicator-buff|visibility-buff",
    bridgeStatuses: "native-and-definition",
    semanticCalls: "direct-buff-apply",
    sourceFile: "functions/visibility.c",
    line: "30",
    fieldOffset: "0x10",
    callbackFunction: "",
    vcallOffset: "",
    tokensInLine: "",
  },
];

const attachmentCallbackRows = [
  {
    callbackFunction: "FUN_callback",
    callbackFound: "yes",
    callbackSourceFile: "functions/a.c",
    callbackStartLine: "40",
    parentFunctions: "ios:FUN_state",
    parentTokens: "Effect_HeroA_Attack|Bone_Weapon",
    parentRoles: "weapon-effect-hook|weapon-bone-hook",
    parentBridgeStatuses: "resource-candidate:weak|native-and-definition",
    registrationVcallOffsets: "0x18",
    callbackOperationRoles: "state-config-field-write",
    callbackFieldOffsets: "0x40",
    callbackVcallOffsets: "",
    callbackTokens: "Effect_HeroA_Attack",
    helperCalls: "FUN_helper",
    writeCount: "1",
  },
];

const visibilityCallbackRows = [
  {
    callbackFunction: "FUN_visibility_callback",
    callbackFound: "yes",
    callbackSourceFile: "functions/visibility.c",
    callbackStartLine: "60",
    parentFunctions: "ios:FUN_visibility_state",
    parentTokens: "Buff_HeroA_Show_Weapon",
    parentRoles: "show-effect-or-indicator-buff|visibility-buff",
    parentBridgeStatuses: "native-and-definition",
    registrationVcallOffsets: "0x20",
    callbackOperationRoles: "field-write",
    callbackFieldOffsets: "0x10",
    callbackVcallOffsets: "",
    callbackTokens: "Buff_HeroA_Show_Weapon",
    helperCalls: "FUN_visibility_helper",
    writeCount: "1",
  },
];

const helperAbilitySlotRows = [
  {
    callKey: "ios:FUN_helper_callback:42:0:2:0x19:0",
    platform: "ios",
    callbackFunction: "FUN_helper_callback",
    callbackSourceFile: "functions/helper.c",
    line: "42",
    helperFunction: "FUN_1003dfe60",
    helperFamily: "indexed-runtime-helper",
    argKey: "0:2:0x19:0",
    parentRoles: "weapon-effect-hook|weapon-bone-hook",
    parentTokens: "Bone_Weapon|Effect_HeroA_Attack",
    combinedParentTokens: "Bone_Weapon|Effect_HeroA_Attack|Ability__HeroA__A",
    definitionPath: "Characters/Hero001/HeroA.def",
    contextConfidence: "high",
    runtimeAbilitySlotIndex: "0",
    runtimeAbilityName: "Ability__HeroA__A",
    runtimeVariableIndex: "2",
    runtimeVariableStatus: "resolved-ability-variable",
    runtimeVariableName: "Travel Time",
  },
];

const helperAbilitySlotRowsWithResolvedDuplicate = [
  {
    callKey: "ios:FUN_helper_callback:84:2:5:0x19:0",
    platform: "ios",
    callbackFunction: "FUN_helper_callback",
    callbackSourceFile: "functions/helper.c",
    line: "84",
    helperFunction: "FUN_1003dfe60",
    helperFamily: "indexed-runtime-helper",
    argKey: "2:5:0x19:0",
    parentRoles: "weapon-effect-hook",
    parentTokens: "Effect_HeroB_Attach",
    combinedParentTokens: "Effect_HeroB_Attach",
    definitionPath: "Characters/Hero002/HeroB_Attachment.def",
    contextConfidence: "low",
    slotStatus: "no-ability-set-for-definition",
    runtimeAbilitySlotIndex: "2",
    runtimeAbilityName: "",
    runtimeVariableIndex: "5",
    runtimeVariableStatus: "no-resolved-ability-slot",
    runtimeVariableName: "",
  },
  {
    callKey: "ios:FUN_helper_callback:84:2:5:0x19:0",
    platform: "ios",
    callbackFunction: "FUN_helper_callback",
    callbackSourceFile: "functions/helper.c",
    line: "84",
    helperFunction: "FUN_1003dfe60",
    helperFamily: "indexed-runtime-helper",
    argKey: "2:5:0x19:0",
    parentRoles: "weapon-effect-hook",
    parentTokens: "Effect_HeroB_Attach",
    combinedParentTokens: "Effect_HeroB_Attach|Ability__HeroB__A",
    definitionPath: "Characters/Hero002/HeroB.def",
    contextConfidence: "high",
    slotStatus: "resolved-direct-ability-slot",
    runtimeAbilitySlotIndex: "2",
    runtimeAbilityName: "Ability__HeroB__A",
    runtimeVariableIndex: "5",
    runtimeVariableStatus: "resolved-ability-variable",
    runtimeVariableName: "Attach Duration",
  },
];

const projectileCallbackRows = [
  {
    platform: "android",
    functionName: "FUN_projectile",
    callbackSlot: "projectileCallback38",
    callbackFunction: "FUN_projectile_callback",
    heroNames: ["Ringo"],
    actionKeys: ["attack"],
    emitterLabel: "GunMuzzle",
    projectileIdHex: "0x5a",
    semanticClass: "state-conditional-emitter",
    projectileIdHexes: ["0x59", "0x5b"],
    emitterLabels: ["GunMuzzle_Attack", "GunMuzzle_Ability02_Attack"],
    evidenceTags: "conditional|projectile-id-switch|emitter-switch",
  },
];

function writeTsv(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\|/g, "|")).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify({ items: value }, null, 2)}\n`);
}

test("condition classifiers preserve runtime meaning from source reports", () => {
  assert.equal(classifyVisibilityCondition(visibilityRows[0]), "visibility-hide-or-invisible-buff");
  assert.equal(classifyAttachmentStateCondition(stateWriteRows[0]), "attachment-callback-register");
  assert.equal(classifyAttachmentStateCondition(stateWriteRows[1]), "attachment-flag-write");
  assert.equal(classifyAttachmentCallbackCondition(attachmentCallbackRows[0]), "attachment-effect-callback");
});

test("buildRuntimeStateConditionRows joins visibility, attachment, callback, and projectile state evidence", () => {
  const rows = buildRuntimeStateConditionRows({
    visibilityRows,
    visibilityStateRows,
    visibilityCallbackRows,
    helperAbilitySlotRows,
    stateWriteRows,
    attachmentCallbackRows,
    projectileCallbackRows,
  });

  assert.equal(rows.length, 8);
  const visibility = rows.find((row) => row.sourceKind === "visibility-event");
  assert.equal(visibility.conditionKind, "visibility-hide-or-invisible-buff");
  assert.equal(visibility.resourceKeys, "Hero001|HeroA|Buff|Hide|Mesh");
  assert.equal(rows.some((row) => row.conditionKind === "attachment-callback-register" && row.callbackFunction === "FUN_callback"), true);
  assert.equal(rows.some((row) => row.conditionKind === "attachment-effect-callback" && row.token.includes("Effect_HeroA_Attack")), true);
  assert.equal(rows.some((row) => row.conditionKind === "visibility-state-write" && row.sourceKind === "visibility-state-write"), true);
  assert.equal(rows.some((row) => row.conditionKind === "visibility-callback" && row.sourceKind === "visibility-callback"), true);
  assert.equal(
    rows.some(
      (row) =>
        row.conditionKind === "attachment-runtime-ability-variable" &&
        row.sourceKind === "attachment-helper-ability-slot" &&
        row.token.includes("Travel Time"),
    ),
    true,
  );
  assert.equal(rows.some((row) => row.conditionKind === "projectile-state-conditional-emitter" && row.resourceKeys === "Ringo"), true);
});

test("buildRuntimeStateConditionRows drops low confidence helper duplicates when the same native call resolved", () => {
  const rows = buildRuntimeStateConditionRows({
    visibilityRows: [],
    visibilityStateRows: [],
    visibilityCallbackRows: [],
    helperAbilitySlotRows: helperAbilitySlotRowsWithResolvedDuplicate,
    stateWriteRows: [],
    attachmentCallbackRows: [],
    projectileCallbackRows: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].conditionKind, "attachment-runtime-ability-variable");
  assert.equal(rows[0].semanticClass, "resolved-ability-variable");
  assert.match(rows[0].evidence, /Attach Duration/);
});

test("buildRuntimeStateConditionRows keeps unresolved helper rows when no resolved native call alternative exists", () => {
  const [unresolved] = helperAbilitySlotRowsWithResolvedDuplicate;
  const rows = buildRuntimeStateConditionRows({
    visibilityRows: [],
    visibilityStateRows: [],
    visibilityCallbackRows: [],
    helperAbilitySlotRows: [unresolved],
    stateWriteRows: [],
    attachmentCallbackRows: [],
    projectileCallbackRows: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].conditionKind, "attachment-runtime-helper-slot");
  assert.equal(rows[0].semanticClass, "no-resolved-ability-slot");
});

test("summarizeRuntimeStateConditionRows counts source and condition buckets", () => {
  const rows = buildRuntimeStateConditionRows({
    visibilityRows,
    visibilityStateRows,
    visibilityCallbackRows,
    helperAbilitySlotRows,
    stateWriteRows,
    attachmentCallbackRows,
    projectileCallbackRows,
  });
  const summary = summarizeRuntimeStateConditionRows(rows);

  assert.equal(summary.rows, 8);
  assert.equal(summary.stateConditionalRows, 8);
  assert.equal(summary.bySourceKind["attachment-state-write"], 2);
  assert.equal(summary.bySourceKind["visibility-state-write"], 1);
  assert.equal(summary.bySourceKind["visibility-callback"], 1);
  assert.equal(summary.bySourceKind["attachment-helper-ability-slot"], 1);
  assert.equal(summary.byConditionKind["attachment-runtime-ability-variable"], 1);
  assert.equal(summary.byConditionKind["projectile-state-conditional-emitter"], 1);
  assert.equal(summary.byConditionKind["visibility-hide-or-invisible-buff"], 1);
});

test("exportRuntimeStateConditions writes TSV, summary, and viewer JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-state-"));
  const paths = {
    visibilityPath: path.join(tempDir, "visibility.tsv"),
    visibilityStatePath: path.join(tempDir, "visibility_state.tsv"),
    visibilityCallbackPath: path.join(tempDir, "visibility_callback.tsv"),
    helperAbilitySlotPath: path.join(tempDir, "helper_ability.tsv"),
    stateWritePath: path.join(tempDir, "state.tsv"),
    attachmentCallbackPath: path.join(tempDir, "callback.tsv"),
    projectileCallbackPath: path.join(tempDir, "projectile.json"),
    tsvOut: path.join(tempDir, "runtime_state_conditions.tsv"),
    jsonOut: path.join(tempDir, "runtime_state_conditions_summary.json"),
    viewerOut: path.join(tempDir, "runtime-state-conditions.json"),
  };

  writeTsv(paths.visibilityPath, Object.keys(visibilityRows[0]), visibilityRows);
  writeTsv(paths.visibilityStatePath, Object.keys(visibilityStateRows[0]), visibilityStateRows);
  writeTsv(paths.visibilityCallbackPath, Object.keys(visibilityCallbackRows[0]), visibilityCallbackRows);
  writeTsv(paths.helperAbilitySlotPath, Object.keys(helperAbilitySlotRows[0]), helperAbilitySlotRows);
  writeTsv(paths.stateWritePath, Object.keys(stateWriteRows[0]), stateWriteRows);
  writeTsv(paths.attachmentCallbackPath, Object.keys(attachmentCallbackRows[0]), attachmentCallbackRows);
  writeJson(paths.projectileCallbackPath, projectileCallbackRows);

  const summary = exportRuntimeStateConditions(paths);
  const viewer = JSON.parse(fs.readFileSync(paths.viewerOut, "utf8"));

  assert.equal(summary.rows, 8);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /projectile-state-conditional-emitter/);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /visibility-state-write/);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /Travel Time/);
  assert.equal(JSON.parse(fs.readFileSync(paths.jsonOut, "utf8")).summary.rows, 8);
  assert.equal(viewer.items.length, 8);
});
