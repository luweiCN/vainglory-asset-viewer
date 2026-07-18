const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDefinitionComponentRootRowsForBlock,
  objectRefEntriesNear,
  readI32,
} = require("../tools/definition_component_roots");

function field(fieldOffset, sourceOffset, value = "", semantic = "", resourceCategory = "", targetRelativePath = "") {
  return { fieldOffset, sourceOffset, value, semantic, resourceCategory, targetRelativePath };
}

test("readI32 reads native root indices from decoded payload", () => {
  const payload = Buffer.alloc(0xdc);
  payload.writeInt32LE(2, 0xd0);
  assert.equal(readI32(payload, 0xd0), 2);
  assert.equal(readI32(payload, 0xdc), null);
});

test("objectRefEntriesNear lists candidate object-array references in field order", () => {
  const entries = objectRefEntriesNear(
    [
      field(0xb8, 100),
      field(104, 200),
      field(112, 300),
      field(180, 0, "Label", "label"),
      field(620, 900),
    ],
    100,
  );

  assert.deepEqual(entries.map((entry) => entry.sourceOffset), [200, 300]);
});

test("buildDefinitionComponentRootRowsForBlock maps native root indices to target object summaries", () => {
  const payload = Buffer.alloc(0xdc);
  payload.writeInt32LE(0, 0xd0);
  payload.writeInt32LE(1, 0xd4);
  payload.writeInt32LE(2, 0xd8);

  const rows = buildDefinitionComponentRootRowsForBlock({
    relativePath: "Characters/Test/Test.def",
    hash: "hash",
    blockIndex: 1,
    definitionFormatByte: 5,
    definitionVersionByte: 5,
    payloadSize: 1024,
    decodedPayload: payload,
    fields: [
      field(0xb8, 100),
      field(104, 200),
      field(112, 300),
      field(120, 400),
      field(200, 500, "RootA", "label"),
      field(300, 600, "build://Characters/Test/Art/test.mesh", "resource", "mesh", "Characters/Test/Art/test.mesh"),
      field(304, 700, "Bone_RightHand", "label"),
      field(312, 720, "weapon_bnd", "bind"),
      field(400, 800, "Effect_Test", "label"),
    ],
  });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].rootTargetObjectOffset, 200);
  assert.equal(rows[1].rootTargetObjectOffset, 300);
  assert.equal(rows[1].targetMeshes, "Characters/Test/Art/test.mesh");
  assert.equal(rows[1].targetBones, "Bone_RightHand");
  assert.equal(rows[1].targetBindTokens, "weapon_bnd");
  assert.equal(rows[2].targetEffects, "Effect_Test");
});
