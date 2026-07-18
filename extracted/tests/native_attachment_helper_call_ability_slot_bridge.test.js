const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeHelperCallAbilitySlotRows,
  exportNativeAttachmentHelperCallAbilitySlotBridge,
} = require("../tools/native_attachment_helper_call_ability_slot_bridge");

const helperCallRows = [
  {
    platform: "android",
    callbackFunction: "FUN_LANCE_RANGE",
    callbackSourceFile: "functions/lance.c",
    line: "10",
    helperFunction: "FUN_00d59f54",
    helperFamily: "indexed-runtime-helper",
    subjectExpr: "param_1",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    argCount: "5",
    argKey: "0:2:0x19:0",
    parentFunctions: "android:FUN_LANCE_PARENT",
    parentTokens: "Bone_Weapon|Effect_Lance_A_Weapon",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
  },
  {
    platform: "ios",
    callbackFunction: "FUN_GENERIC_WEAPON",
    callbackSourceFile: "functions/generic.c",
    line: "20",
    helperFunction: "FUN_1003dfe60",
    helperFamily: "indexed-runtime-helper",
    subjectExpr: "param_1",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    argCount: "5",
    argKey: "0:2:0x19:0",
    parentFunctions: "ios:FUN_GENERIC_PARENT",
    parentTokens: "Bone_Weapon",
    combinedParentTokens: "Bone_Weapon",
    parentRoles: "weapon-bone-hook",
  },
  {
    platform: "android",
    callbackFunction: "FUN_KENSEI_FROM_VISUAL",
    callbackSourceFile: "functions/kensei.c",
    line: "25",
    helperFunction: "FUN_00d59f54",
    helperFamily: "indexed-runtime-helper",
    subjectExpr: "param_1",
    groupArg: "1",
    indexArg: "4",
    kindArg: "0x19",
    flagArg: "0",
    argCount: "5",
    argKey: "1:4:0x19:0",
    parentFunctions: "android:FUN_KENSEI_PARENT",
    parentTokens: "Bone_Weapon",
    combinedParentTokens: "Bone_Weapon|Effect_Kensei_B_Attack|Sound_Kensei_B_Attack",
    parentRoles: "weapon-bone-hook",
  },
  {
    platform: "android",
    callbackFunction: "FUN_IDRIS_ATTACH",
    callbackSourceFile: "functions/idris.c",
    line: "30",
    helperFunction: "FUN_00d59f54",
    helperFamily: "indexed-runtime-helper",
    subjectExpr: "param_1",
    groupArg: "4",
    indexArg: "3",
    kindArg: "0x19",
    flagArg: "0",
    argCount: "5",
    argKey: "4:3:0x19:0",
    parentFunctions: "android:FUN_IDRIS_PARENT",
    parentTokens: "Buff_Idris_C_Attached|Sound_Idris_Ability_C_Attach",
    parentRoles: "attached-state-buff|attach-sound-hook",
  },
];

const eventBridgeRows = [
  {
    token: "Bone_Weapon",
    bridgeStatus: "native-and-definition",
    definitionRoles: "weapon-bone-bind",
    definitionGroups: "Characters",
    definitionPaths: "Characters/Hero019/Baron.def|Characters/Hero028/Lance.def",
  },
  {
    token: "Effect_Lance_A_Weapon",
    bridgeStatus: "native-and-definition",
    definitionRoles: "effect-weapon-attach-label",
    definitionGroups: "Characters",
    definitionPaths: "Characters/Hero028/Lance.def",
  },
  {
    token: "Buff_Idris_C_Attached",
    bridgeStatus: "native-and-definition",
    definitionRoles: "attached-state-buff",
    definitionGroups: "Buffs",
    definitionPaths: "Buffs/KindredBuffs.def",
  },
  {
    token: "Sound_Idris_Ability_C_Attach",
    bridgeStatus: "native-and-definition",
    definitionRoles: "attach-sound-resource",
    definitionGroups: "Characters",
    definitionPaths: "Characters/Hero030/Idris.def",
  },
];

const aliasBridgeRows = [];

const heroNameRows = [
  {
    hero: "Kensei",
    kind: "Effect",
    name: "B_Attack",
  },
  {
    hero: "Kensei",
    kind: "Sound",
    name: "B_Attack",
  },
];

const definitionManifestRows = [
  {
    manifestLabel: "*Kensei*",
    targetRelativePath: "Characters/Hero046/Kensei.def",
    targetFamily: "character",
  },
];

const abilitySlotRows = [
  {
    relativePath: "Characters/Hero028/Lance.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1096",
    directAbilitySlotCount: "4",
    directAbilitySlots: "0:Ability__Lance__A@1136:field0x448|1:Ability__Lance__B@2800:field0x450",
  },
  {
    relativePath: "Characters/Hero019/Baron.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1256",
    directAbilitySlotCount: "4",
    directAbilitySlots: "0:Ability__Baron__QuickAttack@1296:field0x4e8",
  },
  {
    relativePath: "Characters/Hero030/Idris.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1200",
    directAbilitySlotCount: "5",
    directAbilitySlots: "4:Ability__Idris__C@4100:field0x4c0",
  },
  {
    relativePath: "Characters/Hero046/Kensei.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1048",
    directAbilitySlotCount: "3",
    directAbilitySlots: "1:Ability__Kensei__B@2640:field0x420",
  },
];

const abilityVariableRows = [
  {
    relativePath: "Characters/Hero028/Lance.def",
    blockIndex: "1",
    abilityName: "Ability__Lance__A",
    variableIndex: "2",
    variableName: "Travel Time",
    variableObjectOffset: "1904",
    variablePointerFieldOffset: "0x6b0",
    variableArrayObjectOffset: "1696",
  },
  {
    relativePath: "Characters/Hero030/Idris.def",
    blockIndex: "1",
    abilityName: "Ability__Idris__C",
    variableIndex: "3",
    variableName: "Pre Blink Delay",
    variableObjectOffset: "5000",
    variablePointerFieldOffset: "0x900",
    variableArrayObjectOffset: "4800",
  },
  {
    relativePath: "Characters/Hero046/Kensei.def",
    blockIndex: "1",
    abilityName: "Ability__Kensei__B",
    variableIndex: "4",
    variableName: "ABIL_EMP_DURATION",
    variableObjectOffset: "3200",
    variablePointerFieldOffset: "0xa00",
    variableArrayObjectOffset: "3000",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("bridgeHelperCallAbilitySlotRows preserves call-site specificity before expanding generic Bone_Weapon rows", () => {
  const rows = bridgeHelperCallAbilitySlotRows({
    helperCallRows,
    eventBridgeRows,
    aliasBridgeRows,
    heroNameRows,
    definitionManifestRows,
    abilitySlotRows,
    abilityVariableRows,
  });

  const lance = rows.find((row) => row.callKey === "android:FUN_LANCE_RANGE:10:0:2:0x19:0");
  assert.equal(lance.definitionPath, "Characters/Hero028/Lance.def");
  assert.equal(lance.definitionPathSelection, "specific-character-token-filtered");
  assert.equal(lance.contextClass, "specific-token-character-context");
  assert.equal(lance.contextConfidence, "high");
  assert.equal(lance.runtimeAbilityName, "Ability__Lance__A");
  assert.equal(lance.runtimeVariableName, "Travel Time");

  const generic = rows.filter((row) => row.callKey === "ios:FUN_GENERIC_WEAPON:20:0:2:0x19:0");
  assert.equal(generic.length, 2);
  assert.deepEqual(
    generic.map((row) => row.definitionPath).sort(),
    ["Characters/Hero019/Baron.def", "Characters/Hero028/Lance.def"],
  );
  assert.ok(generic.every((row) => row.contextClass === "ambiguous-generic-token-context"));
  assert.ok(generic.every((row) => row.contextConfidence === "low"));

  const kensei = rows.find((row) => row.callKey === "android:FUN_KENSEI_FROM_VISUAL:25:1:4:0x19:0");
  assert.equal(kensei.parentTokens, "Bone_Weapon");
  assert.equal(kensei.evidenceTokens, "Bone_Weapon|Effect_Kensei_B_Attack|Sound_Kensei_B_Attack");
  assert.equal(kensei.definitionPath, "Characters/Hero046/Kensei.def");
  assert.equal(kensei.definitionPathSelection, "specific-character-token-filtered");
  assert.equal(kensei.contextClass, "specific-token-character-context");
  assert.equal(kensei.runtimeAbilityName, "Ability__Kensei__B");
  assert.equal(kensei.runtimeVariableName, "ABIL_EMP_DURATION");

  const idris = rows.find((row) => row.callKey === "android:FUN_IDRIS_ATTACH:30:4:3:0x19:0");
  assert.equal(idris.definitionPath, "Characters/Hero030/Idris.def");
  assert.equal(idris.runtimeAbilityName, "Ability__Idris__C");
  assert.equal(idris.runtimeVariableName, "Pre Blink Delay");
});

test("helper call ability slot bridge exporter writes call-level TSV and summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-helper-call-ability-slot-bridge-"));
  const helperCallPath = path.join(tempDir, "helper_calls.tsv");
  const eventBridgePath = path.join(tempDir, "event_bridge.tsv");
  const aliasBridgePath = path.join(tempDir, "alias_bridge.tsv");
  const abilitySlotsPath = path.join(tempDir, "ability_slots.tsv");
  const abilityVariableSlotsPath = path.join(tempDir, "ability_variables.tsv");
  const heroNamesPath = path.join(tempDir, "hero_names.tsv");
  const definitionManifestPath = path.join(tempDir, "definition_manifest.tsv");
  const tsvOut = path.join(tempDir, "out.tsv");
  const jsonOut = path.join(tempDir, "out.json");

  writeRows(
    helperCallPath,
    [
      "platform",
      "callbackFunction",
      "callbackSourceFile",
      "line",
      "helperFunction",
      "helperFamily",
      "subjectExpr",
      "groupArg",
      "indexArg",
      "kindArg",
      "flagArg",
      "argCount",
      "argKey",
      "parentFunctions",
      "parentTokens",
      "combinedParentTokens",
      "parentRoles",
    ],
    helperCallRows,
  );
  writeRows(eventBridgePath, ["token", "bridgeStatus", "definitionRoles", "definitionGroups", "definitionPaths"], eventBridgeRows);
  writeRows(
    aliasBridgePath,
    ["token", "aliasStatus", "matchKind", "evidenceStrength", "heroCodes", "resourcePaths", "resourceLabels"],
    aliasBridgeRows,
  );
  writeRows(
    abilitySlotsPath,
    [
      "relativePath",
      "blockIndex",
      "abilitySetBaseOffset",
      "abilityListObjectOffset",
      "directAbilitySlotCount",
      "directAbilitySlots",
    ],
    abilitySlotRows,
  );
  writeRows(
    abilityVariableSlotsPath,
    [
      "relativePath",
      "blockIndex",
      "abilityName",
      "variableIndex",
      "variableName",
      "variableObjectOffset",
      "variablePointerFieldOffset",
      "variableArrayObjectOffset",
    ],
    abilityVariableRows,
  );
  writeRows(heroNamesPath, ["hero", "kind", "name"], heroNameRows);
  writeRows(definitionManifestPath, ["manifestLabel", "targetRelativePath", "targetFamily"], definitionManifestRows);

  const summary = exportNativeAttachmentHelperCallAbilitySlotBridge({
    helperCallPath,
    eventBridgePath,
    aliasBridgePath,
    heroNamesPath,
    definitionManifestPath,
    abilitySlotsPath,
    abilityVariableSlotsPath,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.helperCallRows, 4);
  assert.equal(summary.rows, 5);
  assert.equal(summary.callContexts.high, 3);
  assert.equal(summary.callContexts.low, 1);
  assert.equal(summary.rowsByContextClass["ambiguous-generic-token-context"], 2);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /specific-character-token-filtered/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /FUN_GENERIC_WEAPON/);
});
