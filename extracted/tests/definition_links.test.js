const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDefinitionLinks,
  extractBuildLinksFromDecodedRow,
  nearestLabelBefore,
} = require("../tools/definition_links");

test("nearestLabelBefore skips build paths when labelling resource links", () => {
  const strings = [
    "Ringo_DefaultSkin",
    "build://Characters/Ringo/Art/ringo.mesh",
    "build://Characters/Ringo/Art/ringo.skeleton",
    "Idle",
    "build://Characters/Ringo/Art/ringo.idle.anim",
  ];

  assert.equal(nearestLabelBefore(strings, 1), "Ringo_DefaultSkin");
  assert.equal(nearestLabelBefore(strings, 2), "Ringo_DefaultSkin");
  assert.equal(nearestLabelBefore(strings, 4), "Idle");
});

test("extractBuildLinksFromDecodedRow returns concrete build links with labels and categories", () => {
  const row = {
    relativePath: "Characters/Ringo/Ringo.def",
    hash: "SOURCE",
    blockIndex: "0",
    strings: [
      "Ringo_DefaultSkin",
      "build://Characters/Ringo/Art/ringo.mesh",
      "build://Characters/Ringo/Art/ringo.skeleton",
      "Idle",
      "build://Characters/Ringo/Art/ringo.idle.anim",
      "build://HUDPartsHero_%s.png",
    ].join("|"),
  };

  assert.deepEqual(
    extractBuildLinksFromDecodedRow(row).map((link) => [
      link.label,
      link.category,
      link.targetRelativePath,
      link.stringIndex,
    ]),
    [
      ["Ringo_DefaultSkin", "mesh", "Characters/Ringo/Art/ringo.mesh", 1],
      ["Ringo_DefaultSkin", "skeleton", "Characters/Ringo/Art/ringo.skeleton", 2],
      ["Idle", "animation", "Characters/Ringo/Art/ringo.idle.anim", 4],
    ],
  );
});

test("buildDefinitionLinks merges duplicate 32-bit and 64-bit decoded blocks", () => {
  const decodedRows = [
    {
      relativePath: "Characters/Ringo/Ringo.def",
      hash: "SOURCE",
      blockIndex: "0",
      strings: "Idle|build://Characters/Ringo/Art/ringo.idle.anim",
    },
    {
      relativePath: "Characters/Ringo/Ringo.def",
      hash: "SOURCE",
      blockIndex: "1",
      strings: "Idle|build://Characters/Ringo/Art/ringo.idle.anim",
    },
  ];
  const resourceRows = [
    {
      relativePath: "Characters/Ringo/Art/ringo.idle.anim",
      hash: "TARGET",
      linkedPath: "extracted/build_resources_by_path/Characters/Ringo/Art/ringo.idle.anim",
    },
  ];

  assert.deepEqual(buildDefinitionLinks(decodedRows, resourceRows), [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      sourceHash: "SOURCE",
      blockIndexes: "0,1",
      firstStringIndex: 1,
      label: "Idle",
      category: "animation",
      targetRelativePath: "Characters/Ringo/Art/ringo.idle.anim",
      targetBuildPath: "build://Characters/Ringo/Art/ringo.idle.anim",
      targetHash: "TARGET",
      matched: "yes",
      targetLinkedPath: "extracted/build_resources_by_path/Characters/Ringo/Art/ringo.idle.anim",
    },
  ]);
});
