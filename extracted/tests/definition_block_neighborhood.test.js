const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDefinitionBlockNeighborhoodRows,
  exportDefinitionBlockNeighborhood,
} = require("../tools/definition_block_neighborhood");

const stringRows = [
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "10",
    payloadOffset: "100",
    semantic: "label",
    labelBefore: "",
    value: "Hero021_Skin_Dynasty_T1",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "11",
    payloadOffset: "120",
    semantic: "resource",
    labelBefore: "Hero021_Skin_Dynasty_T1",
    value: "Characters/Hero021/Art/hero021_dynasty_t1.mesh",
    resourceCategory: "mesh",
    targetRelativePath: "Characters/Hero021/Art/hero021_dynasty_t1.mesh",
  },
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "12",
    payloadOffset: "160",
    semantic: "resource",
    labelBefore: "Hero021_Skin_Dynasty_T1",
    value: "Characters/Hero021/Art/hero021.skeleton",
    resourceCategory: "skeleton",
    targetRelativePath: "Characters/Hero021/Art/hero021.skeleton",
  },
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "13",
    payloadOffset: "200",
    semantic: "resource",
    labelBefore: "Hero021_Skin_Dynasty_T1",
    value: "Characters/Hero021/Art/hero021.Ability_Primary_Fire.anim",
    resourceCategory: "animation",
    targetRelativePath: "Characters/Hero021/Art/hero021.Ability_Primary_Fire.anim",
  },
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "14",
    payloadOffset: "240",
    semantic: "label",
    labelBefore: "Hero021_Skin_Dynasty_T1",
    value: "Bone_RightHand",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero021/Hero021.def",
    hash: "abc",
    blockIndex: "7",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    payloadSize: "1024",
    stringIndex: "15",
    payloadOffset: "280",
    semantic: "bind",
    labelBefore: "Bone_RightHand",
    value: "sword_bnd",
    resourceCategory: "",
    targetRelativePath: "",
  },
];

test("buildDefinitionBlockNeighborhoodRows groups bind tokens with nearby resources and bone slots", () => {
  const rows = buildDefinitionBlockNeighborhoodRows(stringRows, { radius: 6 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].relativePath, "Characters/Hero021/Hero021.def");
  assert.equal(rows[0].blockIndex, "7");
  assert.equal(rows[0].bindToken, "sword_bnd");
  assert.equal(rows[0].previousValue, "Bone_RightHand");
  assert.equal(rows[0].directBoneSlot, "Bone_RightHand");
  assert.equal(rows[0].nearbyBones, "Bone_RightHand");
  assert.equal(rows[0].nearbyMeshes, "Characters/Hero021/Art/hero021_dynasty_t1.mesh");
  assert.equal(rows[0].nearbySkeletons, "Characters/Hero021/Art/hero021.skeleton");
  assert.equal(rows[0].nearbyAnimations, "Characters/Hero021/Art/hero021.Ability_Primary_Fire.anim");
  assert.equal(rows[0].neighborhoodEvidence, "bone-slot+mesh+skeleton+animation");
});

test("buildDefinitionBlockNeighborhoodRows does not report Bone labels as bind tokens", () => {
  const rows = buildDefinitionBlockNeighborhoodRows(
    [
      {
        relativePath: "Characters/Hero021/Hero021.def",
        blockIndex: "1",
        stringIndex: "1",
        semantic: "bind",
        value: "Bone_RightHand",
      },
      {
        relativePath: "Characters/Hero021/Hero021.def",
        blockIndex: "1",
        stringIndex: "2",
        semantic: "bind",
        value: "sword_bnd",
      },
    ],
    { radius: 2 },
  );

  assert.deepEqual(
    rows.map((row) => row.bindToken),
    ["sword_bnd"],
  );
});

test("exportDefinitionBlockNeighborhood writes TSV and JSON reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-neighborhood-"));
  const instanceStrings = path.join(tempDir, "definition_instance_strings.tsv");
  const outTsv = path.join(tempDir, "definition_block_neighborhood.tsv");
  const outJson = path.join(tempDir, "definition_block_neighborhood.json");
  const columns = Object.keys(stringRows[0]);
  const lines = [columns.join("\t")];
  for (const row of stringRows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(instanceStrings, `${lines.join("\n")}\n`);

  const summary = exportDefinitionBlockNeighborhood({ instanceStrings, outTsv, outJson, radius: 6 });

  assert.deepEqual(summary, { rows: 1, withDirectBoneSlot: 1, withMesh: 1, withAnimation: 1 });
  assert.match(fs.readFileSync(outTsv, "utf8"), /sword_bnd/);
  assert.equal(JSON.parse(fs.readFileSync(outJson, "utf8")).items[0].directBoneSlot, "Bone_RightHand");
});
