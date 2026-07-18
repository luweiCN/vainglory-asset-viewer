const assert = require("node:assert/strict");
const test = require("node:test");

const {
  abilityVariableInfoForObject,
  abilityVariableRowsForBlock,
  contiguousObjectRefsAt,
} = require("../tools/definition_ability_variable_slots");

function stringField(fieldOffset, value) {
  return { fieldOffset, sourceOffset: 0, value };
}

function objectField(fieldOffset, sourceOffset) {
  return { fieldOffset, sourceOffset, value: "" };
}

function testBlock() {
  const decodedPayload = Buffer.alloc(0x4000, 0xff);
  decodedPayload.writeInt32LE(0, 0x88 + 0x48);
  decodedPayload.writeInt32LE(1, 0x88 + 0x4c);
  decodedPayload.writeInt32LE(2, 0x88 + 0x50);

  return {
    relativePath: "Characters/Test/Test.def",
    hash: "TEST",
    blockIndex: 1,
    decodedPayload,
    definitionFormatByte: 5,
    definitionVersionByte: 5,
    fields: [
      objectField(0x88 + 0x30, 0x200),
      objectField(0x220, 0x300),
      objectField(0x228, 0x340),
      objectField(0x230, 0x380),
      stringField(0x300 + 0x10, "HERO_ABILITY_TEST_A_NAME"),
      stringField(0x300 + 0x18, "Ability__Test__A"),
      stringField(0x300 + 0x28, "LABEL_ABILITY_TYPE_TARGETED"),
      objectField(0x300 + 0xb0, 0x500),
      stringField(0x340 + 0x10, "HERO_ABILITY_TEST_B_NAME"),
      stringField(0x340 + 0x18, "Ability__Test__B"),
      stringField(0x340 + 0x28, "LABEL_ABILITY_TYPE_BUFF_SELF"),
      objectField(0x340 + 0xb0, 0x520),
      stringField(0x380 + 0x10, "HERO_ABILITY_TEST_C_NAME"),
      stringField(0x380 + 0x18, "Ability__Test__C"),
      stringField(0x380 + 0x28, "LABEL_ABILITY_TYPE_RADIUS"),
      objectField(0x500, 0x600),
      objectField(0x508, 0x650),
      stringField(0x600, "Cooldown"),
      stringField(0x650, "Travel Time"),
      objectField(0x520, 0x700),
      stringField(0x700, "Damage"),
    ],
  };
}

test("contiguousObjectRefsAt reads an exact pointer array run", () => {
  const refs = contiguousObjectRefsAt(testBlock().fields, 0x500, 8);

  assert.deepEqual(
    refs.map((ref) => ref.objectOffset),
    [0x600, 0x650],
  );
});

test("abilityVariableInfoForObject uses the first string as the AbilityVariable name", () => {
  assert.deepEqual(abilityVariableInfoForObject(testBlock().fields, 0x600), {
    objectOffset: 0x600,
    variableName: "Cooldown",
    variableStringLocalOffset: 0,
  });
});

test("abilityVariableRowsForBlock maps Ability +0xb0 variable arrays to indexed variable names", () => {
  const rows = abilityVariableRowsForBlock(testBlock());

  const abilityA = rows.filter((row) => row.abilityName === "Ability__Test__A");
  assert.deepEqual(
    abilityA.map((row) => [row.variableIndex, row.variableName]),
    [
      [0, "Cooldown"],
      [1, "Travel Time"],
    ],
  );
  assert.equal(abilityA[0].variableArrayFieldOffset, "0x3b0");
  assert.equal(abilityA[0].variableArrayObjectOffset, 0x500);

  const abilityB = rows.find((row) => row.abilityName === "Ability__Test__B");
  assert.equal(abilityB.variableIndex, 0);
  assert.equal(abilityB.variableName, "Damage");
});
