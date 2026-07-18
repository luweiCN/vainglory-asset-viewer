const assert = require("node:assert/strict");
const test = require("node:test");

const {
  abilityRefsFromContainer,
  abilitySetCandidatesForBlock,
  directObjectRefsFromPointerArray,
  formatSpecialIndexTargets,
} = require("../tools/definition_ability_set_slots");

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
    decodedPayload,
    definitionFormatByte: 5,
    fields: [
      objectField(0x88 + 0x30, 0x200),
      objectField(0x88 + 0x40, 0x3000),
      objectField(0x220, 0x300),
      objectField(0x228, 0x340),
      objectField(0x230, 0x380),
      stringField(0x300 + 0x10, "HERO_ABILITY_TEST_A_NAME"),
      stringField(0x300 + 0x18, "Ability__Test__A"),
      stringField(0x300 + 0x28, "LABEL_ABILITY_TYPE_TARGETED"),
      stringField(0x340 + 0x10, "HERO_ABILITY_TEST_B_NAME"),
      stringField(0x340 + 0x18, "Ability__Test__B"),
      stringField(0x340 + 0x28, "LABEL_ABILITY_TYPE_BUFF_SELF"),
      stringField(0x380 + 0x10, "HERO_ABILITY_TEST_C_NAME"),
      stringField(0x380 + 0x18, "Ability__Test__C"),
      stringField(0x380 + 0x28, "LABEL_ABILITY_TYPE_RADIUS"),
      objectField(0x3008, 0x3c0),
      stringField(0x3c0 + 0x10, "Ability__Test__DefaultAttack"),
    ],
  };
}

test("abilityRefsFromContainer extracts ability objects through object references", () => {
  const refs = abilityRefsFromContainer(testBlock().fields, 0x200);
  assert.equal(refs.length, 3);
  assert.deepEqual(
    refs.map((ref) => ref.abilityName),
    ["Ability__Test__A", "Ability__Test__B", "Ability__Test__C"],
  );
  assert.equal(refs[0].titleLabel, "HERO_ABILITY_TEST_A_NAME");
  assert.equal(refs[1].typeLabel, "LABEL_ABILITY_TYPE_BUFF_SELF");
});

test("abilitySetCandidatesForBlock maps special indexes onto decoded ability refs", () => {
  const [candidate] = abilitySetCandidatesForBlock(testBlock());
  assert.equal(candidate.abilitySetBaseOffset, 0x88);
  assert.equal(candidate.abilityListObjectOffset, 0x200);
  assert.equal(candidate.defaultAttackListObjectOffset, 0x3000);
  assert.equal(candidate.pointerSize, 8);
  assert.deepEqual(candidate.specialIndexes, { specialA: 0, specialB: 1, specialC: 2 });
  assert.equal(candidate.abilityRefs.length, 3);
  assert.equal(candidate.objectRefs.length, 3);
  assert.deepEqual(
    candidate.directAbilityRefs.map((ref) => ref.abilityName),
    ["Ability__Test__A", "Ability__Test__B", "Ability__Test__C"],
  );
  assert.equal(candidate.defaultAttackRefs[0].abilityName, "Ability__Test__DefaultAttack");
  assert.equal(
    formatSpecialIndexTargets(candidate.objectRefs, testBlock().fields, candidate.specialIndexes),
    "specialA=0:object@768:field0x220(HERO_ABILITY_TEST_A_NAME,Ability__Test__A,LABEL_ABILITY_TYPE_TARGETED)|specialB=1:object@832:field0x228(HERO_ABILITY_TEST_B_NAME,Ability__Test__B,LABEL_ABILITY_TYPE_BUFF_SELF)|specialC=2:object@896:field0x230(HERO_ABILITY_TEST_C_NAME,Ability__Test__C,LABEL_ABILITY_TYPE_RADIUS)",
  );
});

test("directObjectRefsFromPointerArray stops at the first missing pointer slot", () => {
  const block = testBlock();
  block.fields.push(objectField(0x260, 0x3c0));
  const refs = directObjectRefsFromPointerArray(block.fields, 0x200, 8);

  assert.deepEqual(
    refs.map((ref) => ref.objectOffset),
    [0x300, 0x340, 0x380],
  );
});
