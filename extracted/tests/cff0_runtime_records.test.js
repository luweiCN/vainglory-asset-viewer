const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRuntimeFieldRecordsForBlock,
  buildRuntimeLocatorRecordsForBlock,
  buildRuntimeObjectReferenceRecordsForBlock,
  buildRuntimeSchemaOffsetRecords,
  buildRuntimeSkinRecordsForBlock,
  buildRuntimeSlotRecordsForBlock,
  isBindTokenValue,
  isCharacterArtMesh,
  isSkinLabel,
  patchedBlockFrom,
} = require("../tools/cff0_runtime_records");

const block = {
  relativePath: "Characters/Hero021/Blackfeather.def",
  hash: "abc",
  blockIndex: 1,
  definitionFormatByte: 5,
  definitionVersionByte: 5,
  payloadSize: 2000,
  fields: [
    {
      fieldOffset: 100,
      sourceOffset: 800,
      value: "Blackfeather_DefaultSkin",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 108,
      sourceOffset: 824,
      value: "build://Characters/Hero021/Art/hero021.mesh",
      semantic: "resource",
      resourceCategory: "mesh",
      targetRelativePath: "Characters/Hero021/Art/hero021.mesh",
    },
    {
      fieldOffset: 124,
      sourceOffset: 900,
      value: "build://Characters/Hero021/Art/hero021.skeleton",
      semantic: "resource",
      resourceCategory: "skeleton",
      targetRelativePath: "Characters/Hero021/Art/hero021.skeleton",
    },
    {
      fieldOffset: 132,
      sourceOffset: 520,
      value: "",
      semantic: "",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 520,
      sourceOffset: 930,
      value: "Idle",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 528,
      sourceOffset: 940,
      value: "build://Characters/Hero021/Art/hero021.idle.anim",
      semantic: "resource",
      resourceCategory: "animation",
      targetRelativePath: "Characters/Hero021/Art/hero021.idle.anim",
    },
    {
      fieldOffset: 200,
      sourceOffset: 920,
      value: "Ability01",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 208,
      sourceOffset: 940,
      value: "build://Characters/Hero021/Art/hero021.ability01.anim",
      semantic: "resource",
      resourceCategory: "animation",
      targetRelativePath: "Characters/Hero021/Art/hero021.ability01.anim",
    },
    {
      fieldOffset: 244,
      sourceOffset: 980,
      value: "Effect_Blackfeather_AA",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 300,
      sourceOffset: 1000,
      value: "Blackfeather_Skin_Dynasty_T1",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      fieldOffset: 308,
      sourceOffset: 1032,
      value: "build://Characters/Hero021/Art/hero021_dynasty_t1.mesh",
      semantic: "resource",
      resourceCategory: "mesh",
      targetRelativePath: "Characters/Hero021/Art/hero021_dynasty_t1.mesh",
    },
  ],
};

test("runtime skin records come from PTCH field offsets", () => {
  const records = buildRuntimeSkinRecordsForBlock(block);

  assert.equal(records.length, 2);
  assert.equal(records[0].source, "cff0-ptch");
  assert.equal(records[0].modelLabel, "Blackfeather_DefaultSkin");
  assert.equal(records[0].meshFieldOffset, 108);
  assert.equal(records[0].meshPath, "Characters/Hero021/Art/hero021.mesh");
  assert.equal(records[0].ownSkeletons, "Characters/Hero021/Art/hero021.skeleton");
  assert.equal(records[0].animationActions, "Ability01");
  assert.equal(records[0].animations, "Characters/Hero021/Art/hero021.ability01.anim");
  assert.equal(records[0].effects, "Effect_Blackfeather_AA");
  assert.equal(records[0].recordEndField, 300);
  assert.equal(records[1].modelLabel, "Blackfeather_Skin_Dynasty_T1");
  assert.equal(records[1].ownSkeletons, "");
});

test("runtime field records preserve PTCH field offsets inside each skin record", () => {
  const fields = buildRuntimeFieldRecordsForBlock(block);
  const defaultFields = fields.filter((field) => field.modelLabel === "Blackfeather_DefaultSkin");

  assert.deepEqual(
    defaultFields.slice(0, 4).map((field) => [
      field.fieldOffset,
      field.localFieldOffset,
      field.sourceOffset,
      field.referenceKind,
      field.role,
      field.targetRelativePath,
    ]),
    [
      [100, 0, 800, "string", "skin-label", ""],
      [108, 8, 824, "string", "mesh", "Characters/Hero021/Art/hero021.mesh"],
      [124, 24, 900, "string", "skeleton", "Characters/Hero021/Art/hero021.skeleton"],
      [132, 32, 520, "object", "object-ref", ""],
    ],
  );
});

test("patched blocks preserve short PTCH-referenced locator labels", () => {
  const decodedPayload = Buffer.alloc(96);
  decodedPayload.write("AA\0", 64, "ascii");

  const patched = patchedBlockFrom({
    relativePath: "Characters/Malene/Malene.def",
    hash: "SOURCE",
    instance: {
      blockIndex: 1,
      definitionFormatByte: 5,
      definitionVersionByte: 5,
      payloadSize: decodedPayload.length,
      decodedPayload,
      stringRecords: [],
    },
    patchTable: {
      entries: [{ targetOffset: 16, sourceOffset: 64 }],
    },
  });

  assert.deepEqual(patched.fields, [
    {
      fieldOffset: 16,
      sourceOffset: 64,
      value: "AA",
      semantic: "label",
      resourceCategory: "",
      targetRelativePath: "",
    },
  ]);
});

test("runtime locator records expose PTCH object transforms", () => {
  const decodedPayload = Buffer.alloc(320);
  decodedPayload.writeFloatLE(10, 248);
  decodedPayload.writeFloatLE(125, 252);
  decodedPayload.writeFloatLE(20, 256);
  decodedPayload.writeFloatLE(0, 260);
  decodedPayload.writeFloatLE(0, 264);
  decodedPayload.writeFloatLE(0, 268);
  decodedPayload.writeFloatLE(1, 272);
  decodedPayload.writeFloatLE(1, 276);
  decodedPayload.writeFloatLE(1, 280);

  const rows = buildRuntimeLocatorRecordsForBlock({
    ...block,
    decodedPayload,
    fields: [
      ...block.fields,
      {
        fieldOffset: 140,
        sourceOffset: 240,
        value: "",
        semantic: "",
        resourceCategory: "",
        targetRelativePath: "",
      },
      {
        fieldOffset: 240,
        sourceOffset: 280,
        value: "AA",
        semantic: "label",
        resourceCategory: "",
        targetRelativePath: "",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.modelLabel,
      row.label,
      row.fieldOffset,
      row.referencedByFieldOffsets,
      row.positionX,
      row.positionY,
      row.positionZ,
      row.scaleX,
      row.scaleY,
      row.scaleZ,
    ]),
    [["Blackfeather_DefaultSkin", "AA", 240, "140", 10, 125, 20, 1, 1, 1]],
  );
});

test("runtime locator records keep transform labels that look like bind tokens", () => {
  const decodedPayload = Buffer.alloc(420);
  decodedPayload.writeFloatLE(18.5, 328);
  decodedPayload.writeFloatLE(64.2, 332);
  decodedPayload.writeFloatLE(117.9, 336);
  decodedPayload.writeFloatLE(1, 352);
  decodedPayload.writeFloatLE(1, 356);
  decodedPayload.writeFloatLE(1, 360);

  const rows = buildRuntimeLocatorRecordsForBlock({
    ...block,
    decodedPayload,
    fields: [
      ...block.fields,
      {
        fieldOffset: 148,
        sourceOffset: 320,
        value: "",
        semantic: "",
        resourceCategory: "",
        targetRelativePath: "",
      },
      {
        fieldOffset: 320,
        sourceOffset: 380,
        value: "GunMuzzleTip_Attack",
        semantic: "label",
        role: "bind-token",
        resourceCategory: "",
        targetRelativePath: "",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.label, row.positionX, row.positionY, row.positionZ]),
    [["GunMuzzleTip_Attack", 18.5, 64.19999694824219, 117.9000015258789]],
  );
});

test("runtime locator records ignore impossible transform payloads", () => {
  const decodedPayload = Buffer.alloc(320);
  decodedPayload.writeFloatLE(1e20, 248);
  decodedPayload.writeFloatLE(125, 252);
  decodedPayload.writeFloatLE(20, 256);
  decodedPayload.writeFloatLE(1, 272);
  decodedPayload.writeFloatLE(1, 276);
  decodedPayload.writeFloatLE(1, 280);

  const rows = buildRuntimeLocatorRecordsForBlock({
    ...block,
    decodedPayload,
    fields: [
      ...block.fields,
      {
        fieldOffset: 140,
        sourceOffset: 240,
        value: "",
        semantic: "",
        resourceCategory: "",
        targetRelativePath: "",
      },
      {
        fieldOffset: 240,
        sourceOffset: 280,
        value: "u_color",
        semantic: "label",
        resourceCategory: "",
        targetRelativePath: "",
      },
    ],
  });

  assert.equal(rows.length, 0);
});

test("runtime locator records keep ability projectile locator transforms", () => {
  const decodedPayload = Buffer.alloc(520);
  decodedPayload.writeFloatLE(0, 404);
  decodedPayload.writeFloatLE(20, 408);
  decodedPayload.writeFloatLE(50, 412);
  decodedPayload.writeFloatLE(0, 416);
  decodedPayload.writeFloatLE(0, 420);
  decodedPayload.writeFloatLE(0, 424);
  decodedPayload.writeFloatLE(1, 428);
  decodedPayload.writeFloatLE(1, 432);
  decodedPayload.writeFloatLE(1, 436);

  const rows = buildRuntimeLocatorRecordsForBlock({
    ...block,
    decodedPayload,
    fields: [
      ...block.fields,
      {
        fieldOffset: 260,
        sourceOffset: 400,
        value: "",
        semantic: "",
        resourceCategory: "",
        targetRelativePath: "",
      },
      {
        fieldOffset: 400,
        sourceOffset: 440,
        value: "Ability03_FanShot",
        semantic: "label",
        role: "label",
        resourceCategory: "",
        targetRelativePath: "",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [
      row.label,
      row.fieldOffset,
      row.referencedByFieldOffsets,
      row.positionX,
      row.positionY,
      row.positionZ,
      row.transformEvidence,
    ]),
    [["Ability03_FanShot", 400, "260", 0, 20, 50, "ptch-object-transform-40"]],
  );
});

test("runtime object reference records summarize target objects without resolving by name", () => {
  const refs = buildRuntimeObjectReferenceRecordsForBlock(block);

  assert.deepEqual(
    refs.map((ref) => [
      ref.ownerLabel,
      ref.ownerFieldOffset,
      ref.ownerLocalFieldOffset,
      ref.targetObjectOffset,
      ref.targetLabels,
      ref.targetAnimations,
    ]),
    [
      [
        "Blackfeather_DefaultSkin",
        132,
        32,
        520,
        "0:Idle",
        "Characters/Hero021/Art/hero021.idle.anim",
      ],
    ],
  );
});

test("runtime schema offset records summarize repeated field roles by structure offset", () => {
  const schema = buildRuntimeSchemaOffsetRecords(buildRuntimeFieldRecordsForBlock(block));
  const labelOffset = schema.find((row) => row.localFieldOffset === 0);
  const meshOffset = schema.find((row) => row.localFieldOffset === 8);
  const objectOffset = schema.find((row) => row.localFieldOffset === 32);

  assert.equal(labelOffset.ownerCount, 2);
  assert.equal(labelOffset.roles, "skin-label:2");
  assert.equal(meshOffset.roles, "mesh:2");
  assert.ok(meshOffset.sampleTargets.includes("Characters/Hero021/Art/hero021.mesh"));
  assert.equal(objectOffset.referenceKinds, "object:1");
  assert.equal(objectOffset.roles, "object-ref:1");
});

test("runtime slot records pair Bone fields with following bind-token fields", () => {
  const records = buildRuntimeSlotRecordsForBlock({
    ...block,
    fields: [
      { fieldOffset: 100, sourceOffset: 500, value: "Bone_RightHand" },
      { fieldOffset: 132, sourceOffset: 520, value: "rHandIK_bnd" },
      { fieldOffset: 136, sourceOffset: 540, value: "Bone_CenterMass" },
      { fieldOffset: 160, sourceOffset: 560, value: "spineC" },
    ],
  });

  assert.deepEqual(
    records.map((record) => [record.boneName, record.bindToken, record.source]),
    [
      ["Bone_RightHand", "rHandIK_bnd", "cff0-ptch"],
      ["Bone_CenterMass", "spineC", "cff0-ptch"],
    ],
  );
});

test("runtime record helpers filter non-runtime labels and resources", () => {
  assert.equal(isCharacterArtMesh("Characters/Hero021/Art/hero021.mesh"), true);
  assert.equal(isCharacterArtMesh("UI/Selector_Enemy/Selector_Enemy.mesh"), false);
  assert.equal(isSkinLabel("Blackfeather_Skin_Dynasty_T1"), true);
  assert.equal(isSkinLabel("Effect_Blackfeather_AA"), false);
  assert.equal(isBindTokenValue("sword_bnd"), true);
  assert.equal(isBindTokenValue("spineC"), true);
  assert.equal(isBindTokenValue("Bone_Weapon"), false);
});
