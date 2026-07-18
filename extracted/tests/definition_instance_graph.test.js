const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDefinitionBindingTokenRows,
  buildDefinitionInstanceStringRows,
  classifyDefinitionString,
  exportDefinitionInstanceGraph,
  isBindToken,
  labelsBefore,
  nearbyResources,
} = require("../tools/definition_instance_graph");

test("classifyDefinitionString identifies resources and bind tokens", () => {
  assert.deepEqual(classifyDefinitionString("build://Characters/Hero028/Art/hero028.mesh"), {
    semantic: "resource",
    resourceCategory: "mesh",
    targetRelativePath: "Characters/Hero028/Art/hero028.mesh",
    targetBuildPath: "build://Characters/Hero028/Art/hero028.mesh",
  });
  assert.equal(isBindToken("right_hand_bnd"), true);
  assert.equal(isBindToken("root_bnd"), true);
  assert.equal(isBindToken("<no_bone>"), true);
  assert.equal(isBindToken("heroArt_offset"), false);
});

test("buildDefinitionInstanceStringRows preserves offsets and nearest labels", () => {
  const rows = buildDefinitionInstanceStringRows([
    {
      relativePath: "Characters/Hero028/Lance.def",
      hash: "SOURCE",
      blockIndex: 0,
      definitionFormatByte: 4,
      definitionVersionByte: 8,
      payloadSize: 128,
      stringRecords: [
        { index: 0, offset: 4, value: "Lance_DefaultSkin" },
        { index: 1, offset: 24, value: "Weapon" },
        { index: 2, offset: 36, value: "right_hand_bnd" },
        { index: 3, offset: 52, value: "build://Characters/Hero028/Art/hero028.mesh" },
      ],
    },
  ]);

  assert.deepEqual(
    rows.map((row) => [row.stringIndex, row.payloadOffset, row.semantic, row.labelBefore, row.value, row.resourceCategory]),
    [
      [0, 4, "label", "", "Lance_DefaultSkin", ""],
      [1, 24, "label", "Lance_DefaultSkin", "Weapon", ""],
      [2, 36, "bind", "Weapon", "right_hand_bnd", ""],
      [3, 52, "resource", "Weapon", "build://Characters/Hero028/Art/hero028.mesh", "mesh"],
    ],
  );
});

test("buildDefinitionBindingTokenRows links bind tokens to nearby resources", () => {
  const stringRows = buildDefinitionInstanceStringRows([
    {
      relativePath: "Characters/Hero048/Kinetic.def",
      hash: "SOURCE",
      blockIndex: 1,
      definitionFormatByte: 4,
      definitionVersionByte: 8,
      payloadSize: 160,
      stringRecords: [
        { index: 0, offset: 0, value: "Kinetic_Skin_Valkyrie" },
        { index: 1, offset: 24, value: "Weapon" },
        { index: 2, offset: 32, value: "right_hand_bnd" },
        { index: 3, offset: 48, value: "build://Characters/Hero048/Art/hero048_valkyrie.mesh" },
        { index: 4, offset: 96, value: "build://Effects/Hero048/S2/Hero048_S2_AA/Hero048_S2_AA.pfx" },
      ],
    },
  ]);

  assert.deepEqual(buildDefinitionBindingTokenRows(stringRows), [
    {
      relativePath: "Characters/Hero048/Kinetic.def",
      hash: "SOURCE",
      blockIndex: 1,
      definitionFormatByte: 4,
      definitionVersionByte: 8,
      stringIndex: 2,
      payloadOffset: 32,
      bindToken: "right_hand_bnd",
      labelBefore: "Weapon",
      labelsBefore: "Kinetic_Skin_Valkyrie|Weapon",
      nearbyResourceCount: 2,
      nearbyResources:
        "Characters/Hero048/Art/hero048_valkyrie.mesh|Effects/Hero048/S2/Hero048_S2_AA/Hero048_S2_AA.pfx",
    },
  ]);
});

test("labelsBefore preserves logical locator groups before a bind block", () => {
  const records = [
    { value: "build://Characters/Hero055/Art/hero055.attack.anim" },
    { value: "?BasicAttack_RightHand" },
    { value: "?Projectile" },
    { value: "?Projectile_B" },
    { value: "?Projectile_C" },
    { value: "Bone_RightHand" },
    { value: "rHandIK_bnd" },
  ];

  assert.equal(
    labelsBefore(records, 6),
    "?BasicAttack_RightHand|?Projectile|?Projectile_B|?Projectile_C",
  );
});

test("nearbyResources ignores labels and bind tokens", () => {
  const records = [
    { value: "Weapon" },
    { value: "right_hand_bnd" },
    { value: "build://Characters/Hero021/Art/hero021.mesh" },
    { value: "<No Description Provided>" },
  ];

  assert.deepEqual(nearbyResources(records, 1), ["Characters/Hero021/Art/hero021.mesh"]);
});

test("exportDefinitionInstanceGraph writes string and binding TSV reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-instance-"));
  const decodedPath = path.join(tempDir, "decoded.tsv");

  fs.writeFileSync(
    decodedPath,
    [
      "relativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tpayloadSize\tstrings",
      "Characters/Hero021/Blackfeather.def\tSOURCE\t0\t4\t8\t120\tBlackfeather_DefaultSkin|Weapon|right_hand_bnd|build://Characters/Hero021/Art/hero021.mesh",
      "",
    ].join("\n"),
  );

  const summary = exportDefinitionInstanceGraph({ decodedInstances: decodedPath, outDir: tempDir });

  assert.deepEqual(summary, { strings: 4, bindingTokens: 1 });
  assert.match(fs.readFileSync(path.join(tempDir, "definition_instance_strings.tsv"), "utf8"), /right_hand_bnd/);
  assert.match(fs.readFileSync(path.join(tempDir, "definition_binding_tokens.tsv"), "utf8"), /Characters\/Hero021\/Art\/hero021\.mesh/);
});
