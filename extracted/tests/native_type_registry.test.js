const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildSchemaRows,
  candidateTypes,
  extractFieldDescriptorBlocks,
  extractTypeRegistrations,
  findFunctionBlocks,
} = require("../tools/native_type_registry");

const source = `
void FUN_aaa(void)

{
  if ((DAT_flag & 1) == 0) {
    DAT_aaa100 = 0;
    DAT_aaa104 = 0;
    DAT_aaa108 = PTR_DAT_200020;
    DAT_aaa120 = DAT_aaa120 + 1;
    DAT_flag = 1;
  }
  return;
}

void FUN_bbb(void)

{
  long lVar1;
  if ((DAT_reg_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_200000,1,"EmbeddedThing",0x20,8);
    *(undefined4 **)(lVar1 + 0x10) = &DAT_aaa100;
    *(undefined4 **)(lVar1 + 0x18) = &DAT_aaa120;
    DAT_reg_flag = 1;
  }
  return;
}

void FUN_ccc(void)

{
  if ((DAT_skin_flag & 1) == 0) {
    DAT_bbb100 = 0;
    DAT_bbb104 = 8;
    DAT_bbb108 = PTR_DAT_200020;
    DAT_bbb120 = DAT_bbb120 + 1;
    DAT_skin_flag = 1;
  }
  return;
}

void FUN_ddd(void)

{
  long lVar1;
  if ((DAT_skin_reg_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_300000,1,"SkinRep",0x28,8);
    *(undefined4 **)(lVar1 + 0x10) = &DAT_bbb100;
    *(undefined4 **)(lVar1 + 0x18) = &DAT_bbb120;
    DAT_skin_reg_flag = 1;
  }
  return;
}
`;

test("extracts registrations and descriptor offsets from native type registry blocks", () => {
  const blocks = findFunctionBlocks(source);
  const { rows: registrations, byName } = extractTypeRegistrations(blocks);
  const descriptors = extractFieldDescriptorBlocks(blocks);
  const rows = buildSchemaRows({ registrations, descriptorBlocks: descriptors, focusTypes: ["SkinRep"] });

  assert.equal(registrations.length, 2);
  assert.equal(byName.get("EmbeddedThing").typeSize, 0x20);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fieldOffset, "0x8");
  assert.equal(rows[0].fieldSpan, "0x20");
  assert.match(rows[0].exactSpanCandidates, /EmbeddedThing@0x200000:0x20/);
});

test("candidateTypes keeps multiple nearby native candidates as evidence", () => {
  const registrations = [
    { dataAddress: "0x1000", typeName: "NearPointer", typeSize: 8, typeSizeText: "8", typeKind: "3" },
    { dataAddress: "0x1020", typeName: "ExactStruct", typeSize: 0x20, typeSizeText: "0x20", typeKind: "1" },
  ];

  const candidates = candidateTypes("PTR_DAT_1010", 0x20, registrations);

  assert.equal(candidates[0].typeName, "ExactStruct");
  assert.equal(candidates[0].exactSpan, true);
  assert.equal(candidates.length, 2);
});
