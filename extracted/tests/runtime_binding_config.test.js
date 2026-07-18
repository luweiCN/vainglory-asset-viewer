const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportRuntimeBindingConfig,
  runtimeBindingConfigRows,
} = require("../tools/runtime_binding_config");

const graph = {
  generatedAt: "now",
  items: [
    {
      rel: "Characters/Hero046/Art/hero046_tokyo.glb",
      character: "Hero046",
      modelLabel: "Kensei_Skin_Tokyo",
      sourceRelativePath: "Characters/Hero046/Kensei.def",
      skeletons: ["Characters/Hero046/Art/hero046.skeleton"],
      bindSlots: [
        {
          slotName: "Bone_RightHand",
          bindToken: "rHandIK_bnd",
          bindHash: "5541D42F",
          resolvedSkeletonPath: "Characters/Hero046/Art/hero046.skeleton",
          resolvedBoneIndex: 25,
          hashResolved: true,
        },
        {
          slotName: "Bone_Weapon",
          bindToken: "weapon_bnd",
          bindHash: "DEADBEEF",
          resolvedSkeletonPath: "",
          resolvedBoneIndex: null,
          hashResolved: false,
        },
      ],
    },
    {
      rel: "Characters/Hero011/Art/hero011.glb",
      character: "Hero011",
      modelLabel: "Taka_DefaultSkin",
      sourceRelativePath: "Characters/Hero011/Taka.def",
      skeletons: ["Characters/Hero011/Art/hero011.skeleton"],
      bindSlots: [
        {
          slotName: "Bone_Jaw",
          bindToken: "jaw_bnd",
          bindHash: "B6C961AD",
          resolvedSkeletonPath: "",
          resolvedBoneIndex: null,
          hashResolved: false,
        },
      ],
    },
  ],
};

const nativeBoneRows = [
  {
    boneName: "Bone_Weapon",
    functionName: "FUN_00e10000",
    accessorOffset: "0x78",
    nearbyEffects: "Effect_Kensei_B_Attack",
    nearbySounds: "",
    sourceFile: "functions/00e10.c",
  },
];

const definitionRows = [
  {
    relativePath: "Characters/Hero011/Taka.def",
    bindToken: "jaw_bnd",
    labelBefore: "Projectile_RightHandThrow",
    labelsBefore: "CenterBody|OverHead|Projectile_RightHandThrow",
    nearbyResources: "",
  },
];

const skinrepSlotRows = [
  {
    relativePath: "Characters/Hero009/Krul.def",
    ownerType: "skin",
    ownerLabel: "Krul_DefaultSkin",
    ownerLocalFieldOffset: "36",
    targetObjectOffset: "10244",
    targetLabels: "108:Bone_Shield|112:shield_bnd|140:Bone_Sword|144:sword_bnd",
    targetBones: "Bone_Shield|Bone_Sword",
    targetBindTokens: "shield_bnd|sword_bnd",
  },
];

test("runtimeBindingConfigRows classifies every runtime bind slot", () => {
  const configGraph = {
    items: [
      ...graph.items,
      {
        rel: "Characters/Hero009/Art/hero009.glb",
        character: "Hero009",
        modelLabel: "Krul_DefaultSkin",
        sourceRelativePath: "Characters/Hero009/Krul.def",
        skeletons: ["Characters/Hero009/Art/hero009.skeleton"],
        bindSlots: [
          {
            slotName: "Bone_Shield",
            bindToken: "shield_bnd",
            bindHash: "379816F6",
            resolvedSkeletonPath: "",
            resolvedBoneIndex: null,
            hashResolved: false,
          },
        ],
      },
    ],
  };
  const rows = runtimeBindingConfigRows(configGraph, nativeBoneRows, definitionRows, skinrepSlotRows);

  assert.deepEqual(
    rows.map((row) => [row.rel, row.slotName, row.bindToken, row.bindingKind, row.resolvedBoneIndex]),
    [
      ["Characters/Hero046/Art/hero046_tokyo.glb", "Bone_RightHand", "rHandIK_bnd", "skeleton-bone", 25],
      ["Characters/Hero046/Art/hero046_tokyo.glb", "Bone_Weapon", "weapon_bnd", "native-bone-query", ""],
      ["Characters/Hero011/Art/hero011.glb", "Bone_Jaw", "jaw_bnd", "definition-logical-locator", ""],
      ["Characters/Hero009/Art/hero009.glb", "Bone_Shield", "shield_bnd", "skinrep-slot-table", ""],
    ],
  );
  assert.equal(rows[1].nativeNearbyEffects, "Effect_Kensei_B_Attack");
  assert.equal(rows[2].definitionLabels, "Projectile_RightHandThrow");
  assert.equal(rows[2].definitionLocatorLabels, "CenterBody|OverHead|Projectile_RightHandThrow");
  assert.equal(rows[3].skinrepOwnerLabels, "Krul_DefaultSkin");
});

test("exportRuntimeBindingConfig writes a complete JSON config and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-binding-config-"));
  const graphPath = path.join(tempDir, "runtime-skin-graph.json");
  const nativeTsv = path.join(tempDir, "native_bone_query_xrefs.tsv");
  const definitionTsv = path.join(tempDir, "definition_binding_tokens.tsv");
  const skinrepSlotTsv = path.join(tempDir, "cff0_runtime_object_refs.tsv");
  const jsonOut = path.join(tempDir, "runtime-binding-config.json");
  const tsvOut = path.join(tempDir, "runtime_binding_config.tsv");

  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  fs.writeFileSync(
    nativeTsv,
    [
      "sourceFile\tfunctionName\tline\taccessorOffset\tboneName\tnearbyEffects\tnearbySounds\tcontextHash",
      "functions/00e10.c\tFUN_00e10000\t42\t0x78\tBone_Weapon\tEffect_Kensei_B_Attack\t\tabc123",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    definitionTsv,
    [
      "relativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tstringIndex\tpayloadOffset\tbindToken\tlabelBefore\tnearbyResourceCount\tnearbyResources",
      "Characters/Hero011/Taka.def\tHASH\t1\t5\t5\t244\t16233\tjaw_bnd\tProjectile_RightHandThrow\t0\t",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    skinrepSlotTsv,
    [
      "source\trelativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\townerType\townerLabel\townerRecordStartField\townerFieldOffset\townerLocalFieldOffset\ttargetObjectOffset\ttargetFieldCount\ttargetLabels\ttargetResources\ttargetAnimations\ttargetEffects\ttargetAudios\ttargetBones\ttargetBindTokens\ttargetObjectRefs",
      "",
    ].join("\n"),
  );

  const summary = exportRuntimeBindingConfig({ graphPath, nativeTsv, definitionTsv, skinrepSlotTsv, jsonOut, tsvOut });

  assert.deepEqual(summary, {
    items: 2,
    slots: 3,
    bindingKinds: {
      "definition-logical-locator": 1,
      "native-bone-query": 1,
      "skeleton-bone": 1,
    },
  });
  assert.match(fs.readFileSync(tsvOut, "utf8"), /skeleton-bone/);
  const json = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(json.summary.slots, 3);
  assert.equal(json.items[0].slots[0].bindingKind, "skeleton-bone");
});
