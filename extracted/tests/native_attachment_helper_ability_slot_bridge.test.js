const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeHelperAbilitySlotRows,
  classifyContext,
  exportNativeAttachmentHelperAbilitySlotBridge,
  parseDirectAbilitySlots,
} = require("../tools/native_attachment_helper_ability_slot_bridge");

const helperDefinitionRows = [
  {
    platform: "ios",
    argKey: "0:2:0x19:0",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon:2|Effect_Lance_A_Weapon:1",
    definitionPaths: "Characters/Hero019/Baron.def|Characters/Hero028/Lance.def",
    heroCodes: "Hero028",
  },
  {
    platform: "android",
    argKey: "1:4:0x19:0",
    groupArg: "1",
    indexArg: "4",
    kindArg: "0x19",
    flagArg: "0",
    parentRoles: "weapon-bone-hook",
    parentTokens: "Bone_Weapon:1",
    definitionPaths: "Characters/Hero028/Lance.def",
    heroCodes: "",
  },
  {
    platform: "android",
    argKey: "0:3:0x19:0",
    groupArg: "0",
    indexArg: "3",
    kindArg: "0x19",
    flagArg: "0",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon:1|Effect_Lance_A_Weapon:1",
    definitionPaths: "Characters/Hero019/Baron.def|Characters/Hero028/Lance.def",
    specificCharacterDefinitionPaths: "Characters/Hero028/Lance.def",
    heroCodes: "",
  },
  {
    platform: "ios",
    argKey: "5:0:0x19:0",
    groupArg: "5",
    indexArg: "0",
    kindArg: "0x19",
    flagArg: "0",
    parentRoles: "weapon-bone-hook",
    parentTokens: "Bone_Weapon:1",
    definitionPaths: "Characters/Hero028/Lance.def",
    heroCodes: "",
  },
];

const abilitySlotRows = [
  {
    relativePath: "Characters/Hero028/Lance.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1048",
    directAbilitySlotCount: "4",
    directAbilitySlots:
      "0:Ability__Lance__A@1080:field0x420(HERO_ABILITY_LANCE_A_NAME,LABEL_ABILITY_TYPE_TARGETED)|1:Ability__Lance__B@2768:field0x428(HERO_ABILITY_LANCE_B_NAME,LABEL_ABILITY_TYPE_TARGETED)|2:Ability__Lance__C@3712:field0x430(HERO_ABILITY_LANCE_C_NAME,LABEL_ABILITY_TYPE_BUFF_SELF)|3:Ability__Lance__EmpoweredAttack@4704:field0x438",
  },
  {
    relativePath: "Characters/Hero019/Baron.def",
    blockIndex: "1",
    abilitySetBaseOffset: "0x88",
    abilityListObjectOffset: "1024",
    directAbilitySlotCount: "3",
    directAbilitySlots:
      "0:Ability__Baron__A@1200:field0x400|1:Ability__Baron__B@1600:field0x408|2:Ability__Baron__C@2000:field0x410",
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
    relativePath: "Characters/Hero028/Lance.def",
    blockIndex: "1",
    abilityName: "Ability__Lance__B",
    variableIndex: "4",
    variableName: "GuardTime",
    variableObjectOffset: "3288",
    variablePointerFieldOffset: "0xb38",
    variableArrayObjectOffset: "2840",
  },
  {
    relativePath: "Characters/Hero028/Lance.def",
    blockIndex: "1",
    abilityName: "Ability__Lance__A",
    variableIndex: "3",
    variableName: "Recovery Time (Hit)",
    variableObjectOffset: "1984",
    variablePointerFieldOffset: "0x6b8",
    variableArrayObjectOffset: "1696",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("parseDirectAbilitySlots decodes slot index, ability name and source pointer field", () => {
  const slots = parseDirectAbilitySlots(abilitySlotRows[0].directAbilitySlots);

  assert.equal(slots.length, 4);
  assert.deepEqual(slots[0], {
    raw: "0:Ability__Lance__A@1080:field0x420(HERO_ABILITY_LANCE_A_NAME,LABEL_ABILITY_TYPE_TARGETED)",
    slotIndex: 0,
    abilityName: "Ability__Lance__A",
    objectOffset: 1080,
    fieldOffset: "0x420",
  });
  assert.equal(slots[3].abilityName, "Ability__Lance__EmpoweredAttack");
});

test("bridgeHelperAbilitySlotRows maps helper groupArg to direct AbilitySet slot and preserves indexArg as variable index", () => {
  const rows = bridgeHelperAbilitySlotRows(helperDefinitionRows, abilitySlotRows, abilityVariableRows);

  const lanceA = rows.find((row) => row.argKey === "0:2:0x19:0");
  assert.equal(lanceA.definitionPath, "Characters/Hero028/Lance.def");
  assert.equal(lanceA.definitionPathSelection, "hero-code-filtered");
  assert.equal(lanceA.contextClass, "hero-code-filtered-character-context");
  assert.equal(lanceA.contextConfidence, "high");
  assert.equal(lanceA.slotStatus, "resolved-direct-ability-slot");
  assert.equal(lanceA.runtimeAbilitySlotIndex, 0);
  assert.equal(lanceA.runtimeAbilityName, "Ability__Lance__A");
  assert.equal(lanceA.runtimeVariableIndex, 2);
  assert.equal(lanceA.runtimeVariableStatus, "resolved-ability-variable");
  assert.equal(lanceA.runtimeVariableName, "Travel Time");

  const lanceB = rows.find((row) => row.argKey === "1:4:0x19:0");
  assert.equal(lanceB.contextClass, "single-definition-character-context");
  assert.equal(lanceB.contextConfidence, "medium");
  assert.equal(lanceB.runtimeAbilityName, "Ability__Lance__B");
  assert.equal(lanceB.runtimeVariableIndex, 4);
  assert.equal(lanceB.runtimeVariableName, "GuardTime");

  const specificLance = rows.find((row) => row.argKey === "0:3:0x19:0");
  assert.equal(specificLance.definitionPath, "Characters/Hero028/Lance.def");
  assert.equal(specificLance.definitionPathSelection, "specific-character-token-filtered");
  assert.equal(specificLance.contextClass, "specific-token-character-context");
  assert.equal(specificLance.contextConfidence, "high");
  assert.equal(specificLance.runtimeAbilityName, "Ability__Lance__A");
  assert.equal(specificLance.runtimeVariableName, "Recovery Time (Hit)");

  const outOfRange = rows.find((row) => row.argKey === "5:0:0x19:0");
  assert.equal(outOfRange.slotStatus, "slot-index-out-of-direct-range");
  assert.equal(outOfRange.runtimeAbilityName, "");
  assert.equal(outOfRange.runtimeVariableStatus, "no-resolved-ability-slot");
});

test("classifyContext separates hero-filtered evidence from generic and non-character contexts", () => {
  assert.deepEqual(
    classifyContext({
      definitionPath: "Characters/Hero028/Lance.def",
      definitionPaths: ["Characters/Hero019/Baron.def", "Characters/Hero028/Lance.def"],
      heroCodes: ["Hero028"],
      narrowedPaths: ["Characters/Hero028/Lance.def"],
      selectionKind: "hero-code-filtered",
      abilityRow: abilitySlotRows[0],
    }),
    {
      contextClass: "hero-code-filtered-character-context",
      contextConfidence: "high",
      contextReason: "effect/resource alias supplied a Hero### code that narrowed the bridged definition list",
    },
  );

  const generic = classifyContext({
    definitionPath: "Characters/Hero019/Baron.def",
    definitionPaths: ["Characters/Hero019/Baron.def", "Characters/Hero028/Lance.def"],
    heroCodes: [],
    narrowedPaths: [],
    selectionKind: "all-bridged-definitions",
    abilityRow: abilitySlotRows[1],
  });
  assert.equal(generic.contextClass, "ambiguous-generic-token-context");
  assert.equal(generic.contextConfidence, "low");

  const buff = classifyContext({
    definitionPath: "Buffs/KindredBuffs.def",
    definitionPaths: ["Buffs/KindredBuffs.def"],
    heroCodes: [],
    narrowedPaths: [],
    selectionKind: "specific-token-filtered",
    abilityRow: null,
  });
  assert.equal(buff.contextClass, "non-character-helper-context");
  assert.equal(buff.contextConfidence, "low");
});

test("helper ability slot bridge exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-helper-ability-slot-bridge-"));
  const helperPath = path.join(tempDir, "helper_definition.tsv");
  const abilitySlotsPath = path.join(tempDir, "ability_slots.tsv");
  const abilityVariableSlotsPath = path.join(tempDir, "ability_variables.tsv");
  const tsvOut = path.join(tempDir, "out.tsv");
  const jsonOut = path.join(tempDir, "out.json");

  writeRows(
    helperPath,
    [
      "platform",
      "argKey",
      "groupArg",
      "indexArg",
      "kindArg",
      "flagArg",
      "parentRoles",
      "parentTokens",
      "definitionPaths",
      "specificCharacterDefinitionPaths",
      "heroCodes",
    ],
    helperDefinitionRows,
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

  const summary = exportNativeAttachmentHelperAbilitySlotBridge({
    helperDefinitionBridgePath: helperPath,
    abilitySlotsPath,
    abilityVariableSlotsPath,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 4);
  assert.equal(summary.resolvedRows, 3);
  assert.equal(summary.unresolvedRows, 1);
  assert.equal(summary.resolvedVariableRows, 3);
  assert.equal(summary.byContextConfidence.high, 2);
  assert.equal(summary.byContextConfidence.medium, 2);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Ability__Lance__A/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Travel Time/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /slot-index-out-of-direct-range/);
});
