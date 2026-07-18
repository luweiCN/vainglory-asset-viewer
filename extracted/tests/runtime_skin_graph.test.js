const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bestRuntimeBlockBySource,
  bindSlotsFromRows,
  buildRuntimeSkinGraph,
  exportRuntimeSkinGraph,
  isBoneSlotLabel,
  runtimeSkinGraphRows,
} = require("../tools/runtime_skin_graph");

function stringRow(relativePath, blockIndex, stringIndex, semantic, value, resourceCategory = "") {
  return {
    relativePath,
    hash: "SOURCE",
    blockIndex,
    definitionFormatByte: 4,
    definitionVersionByte: 8,
    payloadSize: 8192,
    stringIndex,
    payloadOffset: stringIndex * 16,
    semantic,
    value,
    resourceCategory,
  };
}

function runtimeRows(relativePath, blockIndex = 0) {
  return [
    stringRow(relativePath, blockIndex, 0, "label", "Lance_DefaultSkin"),
    stringRow(relativePath, blockIndex, 1, "resource", "build://Characters/Hero028/Art/hero028.mesh", "mesh"),
    stringRow(relativePath, blockIndex, 2, "resource", "build://Characters/Hero028/Art/hero028.skeleton", "skeleton"),
    stringRow(relativePath, blockIndex, 3, "resource", "build://Characters/Hero028/Art/hero028.attack.anim", "animation"),
    stringRow(relativePath, blockIndex, 4, "bind", "Bone_Shield"),
    stringRow(relativePath, blockIndex, 5, "bind", "shield_bnd"),
    stringRow(relativePath, blockIndex, 6, "bind", "Bone_Weapon"),
    stringRow(relativePath, blockIndex, 7, "bind", "sword_bnd"),
    stringRow(relativePath, blockIndex, 8, "bind", "Bone_RightWing"),
    stringRow(relativePath, blockIndex, 9, "label", "Effect_Lance_AA"),
  ];
}

test("isBoneSlotLabel distinguishes engine slot labels from concrete bind tokens", () => {
  assert.equal(isBoneSlotLabel("Bone_Weapon"), true);
  assert.equal(isBoneSlotLabel("sword_bnd"), false);
});

test("bindSlotsFromRows pairs Bone labels with following bind tokens", () => {
  assert.deepEqual(bindSlotsFromRows(runtimeRows("Characters/Hero028/Lance.def")), [
    {
      slotName: "Bone_Shield",
      bindToken: "shield_bnd",
      slotStringIndex: 4,
      bindStringIndex: 5,
      slotPayloadOffset: 64,
      bindPayloadOffset: 80,
    },
    {
      slotName: "Bone_Weapon",
      bindToken: "sword_bnd",
      slotStringIndex: 6,
      bindStringIndex: 7,
      slotPayloadOffset: 96,
      bindPayloadOffset: 112,
    },
  ]);
});

test("bestRuntimeBlockBySource picks the highest confidence runtime block per source", () => {
  const source = "Characters/Hero028/Lance.def";
  const rows = [
    stringRow(source, 0, 0, "resource", "build://Characters/Hero028/Art/hero028.mesh", "mesh"),
    stringRow(source, 0, 1, "resource", "build://Characters/Hero028/Art/hero028.skeleton", "skeleton"),
    stringRow(source, 1, 0, "resource", "build://Characters/Hero028/Art/hero028.mesh", "mesh"),
    stringRow(source, 1, 1, "resource", "build://Characters/Hero028/Art/hero028.skeleton", "skeleton"),
    stringRow(source, 1, 2, "resource", "build://Characters/Hero028/Art/hero028.attack.anim", "animation"),
    stringRow(source, 1, 3, "bind", "Bone_Weapon"),
    stringRow(source, 1, 4, "bind", "sword_bnd"),
  ];

  assert.equal(bestRuntimeBlockBySource(rows).get(source).blockIndex, 1);
});

test("buildRuntimeSkinGraph applies source runtime bind slots to every skin item", () => {
  const graph = buildRuntimeSkinGraph({
    generatedAt: "now",
    manifestItems: [
      {
        rel: "Characters/Hero028/Art/hero028.glb",
        character: "Hero028",
        modelLabel: "Lance_DefaultSkin",
        sourceRelativePath: "Characters/Hero028/Lance.def",
        meshPath: "Characters/Hero028/Art/hero028.mesh",
        skeletons: ["Characters/Hero028/Art/hero028.skeleton"],
      },
      {
        rel: "Characters/Hero028/Art/hero028_glad.glb",
        character: "Hero028",
        modelLabel: "Lance_Skin_Glad",
        sourceRelativePath: "Characters/Hero028/Lance.def",
        meshPath: "Characters/Hero028/Art/hero028_glad.mesh",
        skeletons: ["Characters/Hero028/Art/hero028.skeleton"],
      },
    ],
    stringRows: runtimeRows("Characters/Hero028/Lance.def"),
    skeletonInfoByPath: new Map([
      [
        "Characters/Hero028/Art/hero028.skeleton",
        {
          bones: [
            { index: 0, hash: "6743820F" },
            { index: 43, hash: "0DA9777E" },
            { index: 45, hash: "379816F6" },
          ],
        },
      ],
    ]),
  });

  assert.equal(graph.count, 2);
  assert.equal(graph.withRuntimeBlock, 2);
  assert.equal(graph.withBindSlots, 2);
  assert.deepEqual(
    graph.items.map((item) => [item.modelLabel, item.bindSlots.map((slot) => slot.bindToken).join("|")]),
    [
      ["Lance_DefaultSkin", "shield_bnd|sword_bnd"],
      ["Lance_Skin_Glad", "shield_bnd|sword_bnd"],
    ],
  );
  assert.deepEqual(
    graph.items[1].bindSlots.map((slot) => [slot.bindToken, slot.bindHash, slot.resolvedBoneIndex]),
    [
      ["shield_bnd", "379816F6", 45],
      ["sword_bnd", "0DA9777E", 43],
    ],
  );
  assert.equal(graph.items[1].viewerEligible, true);
});

test("buildRuntimeSkinGraph selects the richer main definition when duplicate skin candidates share a model", () => {
  const graph = buildRuntimeSkinGraph({
    generatedAt: "now",
    manifestItems: [
      {
        rel: "Characters/Hero054/Art/hero054.glb",
        character: "Hero054",
        modelLabel: "Anka_DefaultSkin",
        sourceRelativePath: "Characters/Hero054/Anka_C_Clone.def",
        meshPath: "Characters/Hero054/Art/hero054.mesh",
        skeletons: ["Characters/Hero054/Art/hero054.skeleton"],
      },
      {
        rel: "Characters/Hero054/Art/hero054.glb",
        character: "Hero054",
        modelLabel: "Anka_DefaultSkin",
        sourceRelativePath: "Characters/Hero054/Anka.def",
        meshPath: "Characters/Hero054/Art/hero054.mesh",
        skeletons: ["Characters/Hero054/Art/hero054.skeleton"],
      },
    ],
    stringRows: [
      ...runtimeRows("Characters/Hero054/Anka_C_Clone.def"),
      stringRow("Characters/Hero054/Anka.def", 0, 0, "label", "Anka_DefaultSkin"),
      stringRow("Characters/Hero054/Anka.def", 0, 1, "resource", "build://Characters/Hero054/Art/hero054.mesh", "mesh"),
      stringRow("Characters/Hero054/Anka.def", 0, 2, "resource", "build://Characters/Hero054/Art/hero054.skeleton", "skeleton"),
      stringRow("Characters/Hero054/Anka.def", 0, 3, "resource", "build://Characters/Hero054/Art/hero054.attack.anim", "animation"),
      stringRow("Characters/Hero054/Anka.def", 0, 4, "bind", "Bone_RightHand"),
      stringRow("Characters/Hero054/Anka.def", 0, 5, "bind", "rightWeapon_bnd"),
      stringRow("Characters/Hero054/Anka.def", 0, 6, "bind", "Bone_LeftHand"),
      stringRow("Characters/Hero054/Anka.def", 0, 7, "bind", "leftWeapon_bnd"),
      stringRow("Characters/Hero054/Anka.def", 0, 8, "bind", "Bone_CenterMass"),
      stringRow("Characters/Hero054/Anka.def", 0, 9, "bind", "spineC_bnd"),
    ],
    skeletonInfoByPath: new Map([
      [
        "Characters/Hero054/Art/hero054.skeleton",
        {
          bones: [
            { index: 2, hash: "5A157984" },
            { index: 10, hash: "D7127CE8" },
            { index: 22, hash: "D2E63B26" },
          ],
        },
      ],
    ]),
  });

  assert.equal(graph.count, 1);
  assert.equal(graph.items[0].sourceRelativePath, "Characters/Hero054/Anka.def");
  assert.deepEqual(
    graph.items[0].bindSlots.map((slot) => slot.slotName),
    ["Bone_RightHand", "Bone_LeftHand", "Bone_CenterMass"],
  );
});

test("runtimeSkinGraphRows flattens graph slots for TSV review", () => {
  const graph = buildRuntimeSkinGraph({
    generatedAt: "now",
    manifestItems: [
      {
        rel: "Characters/Hero028/Art/hero028_glad.glb",
        character: "Hero028",
        modelLabel: "Lance_Skin_Glad",
        sourceRelativePath: "Characters/Hero028/Lance.def",
        meshPath: "Characters/Hero028/Art/hero028_glad.mesh",
      },
    ],
    stringRows: runtimeRows("Characters/Hero028/Lance.def"),
  });

  assert.deepEqual(
    runtimeSkinGraphRows(graph).map((row) => [row.modelLabel, row.slotName, row.bindToken]),
    [
      ["Lance_Skin_Glad", "Bone_Shield", "shield_bnd"],
      ["Lance_Skin_Glad", "Bone_Weapon", "sword_bnd"],
    ],
  );
});

test("exportRuntimeSkinGraph writes JSON and TSV outputs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-skin-graph-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const instanceStrings = path.join(tempDir, "strings.tsv");
  const jsonOut = path.join(tempDir, "runtime.json");
  const tsvOut = path.join(tempDir, "runtime.tsv");

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Hero028/Art/hero028_glad.glb",
          character: "Hero028",
          modelLabel: "Lance_Skin_Glad",
          sourceRelativePath: "Characters/Hero028/Lance.def",
          meshPath: "Characters/Hero028/Art/hero028_glad.mesh",
        },
      ],
    }),
  );

  fs.writeFileSync(
    instanceStrings,
    [
      [
        "relativePath",
        "hash",
        "blockIndex",
        "definitionFormatByte",
        "definitionVersionByte",
        "payloadSize",
        "stringIndex",
        "payloadOffset",
        "semantic",
        "labelBefore",
        "value",
        "resourceCategory",
        "targetRelativePath",
        "targetBuildPath",
      ].join("\t"),
      ...runtimeRows("Characters/Hero028/Lance.def").map((row) =>
        [
          row.relativePath,
          row.hash,
          row.blockIndex,
          row.definitionFormatByte,
          row.definitionVersionByte,
          row.payloadSize,
          row.stringIndex,
          row.payloadOffset,
          row.semantic,
          "",
          row.value,
          row.resourceCategory,
          "",
          "",
        ].join("\t"),
      ),
      "",
    ].join("\n"),
  );

  const summary = exportRuntimeSkinGraph({ manifestPath, instanceStrings, jsonOut, tsvOut });

  assert.deepEqual(summary, { items: 1, withRuntimeBlock: 1, withBindSlots: 1, rows: 2 });
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).items[0].bindSlots[1].bindToken, "sword_bnd");
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Bone_Shield/);
});
