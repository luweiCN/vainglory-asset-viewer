const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportRuntimeBindingGapReport,
  runtimeBindingGapRows,
} = require("../tools/runtime_binding_gap_report");

function unresolvedSlot(slotName, bindToken) {
  return {
    slotName,
    bindToken,
    bindHash: "DEADBEEF",
    resolvedSkeletonPath: "",
    resolvedBoneIndex: null,
    hashResolved: false,
  };
}

function resolvedSlot(slotName, bindToken) {
  return {
    slotName,
    bindToken,
    bindHash: "CAFEBABE",
    resolvedSkeletonPath: "Characters/Hero046/Art/hero046.skeleton",
    resolvedBoneIndex: 12,
    hashResolved: true,
  };
}

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
        unresolvedSlot("Bone_Weapon", "weapon_bnd"),
        resolvedSlot("Bone_RightHand", "rHandIK_bnd"),
      ],
    },
    {
      rel: "Characters/SAW/Art/saw.glb",
      character: "SAW",
      modelLabel: "SAW_DefaultSkin",
      sourceRelativePath: "Characters/SAW/SAW.def",
      skeletons: ["Characters/SAW/Art/saw.skeleton"],
      bindSlots: [unresolvedSlot("Bone_HeartOfTheMatter_Aura", "fx_bnd")],
    },
    {
      rel: "Characters/Hero011/Art/hero011.glb",
      character: "Hero011",
      modelLabel: "Taka_DefaultSkin",
      sourceRelativePath: "Characters/Hero011/Taka.def",
      skeletons: ["Characters/Hero011/Art/hero011.skeleton"],
      bindSlots: [unresolvedSlot("Bone_Jaw", "jaw_bnd")],
    },
  ],
};

const nativeBoneRows = [
  {
    sourceFile: "functions/00e10.c",
    functionName: "FUN_00e10000",
    line: "42",
    accessorOffset: "0x78",
    boneName: "Bone_Weapon",
    nearbyEffects: "Effect_Kensei_B_Attack|Effect_Kensei_C_Cast",
    nearbySounds: "Sound_Kensei_B_Cast",
    contextHash: "abc123",
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
  {
    relativePath: "Characters/Joule/Joule.def",
    ownerType: "skin",
    ownerLabel: "Joule_DefaultSkin",
    ownerLocalFieldOffset: "36",
    targetObjectOffset: "9084",
    targetLabels: "124:Bone_JetEngine|128:axe_bnd|156:Bone_LFootMech",
    targetBones: "Bone_JetEngine|Bone_LFootMech",
    targetBindTokens: "axe_bnd",
  },
];

const skinObjectGraphRows = [
  {
    relativePath: "Characters/Hero046/Kensei.def",
    modelLabel: "Kensei_Skin_Tokyo",
    rootLocalFieldOffset: "48",
    targetObjectOffset: "12344",
    evidenceKind: "direct-slot-evidence",
    directBones: "Bone_Weapon",
    directBindTokens: "weapon_bnd",
    reachableBones: "Bone_Weapon|Bone_RightHand",
    reachableBindTokens: "weapon_bnd|rHandIK_bnd",
  },
  {
    relativePath: "Characters/Hero046/Kensei.def",
    modelLabel: "Kensei_Skin_Tokyo",
    rootLocalFieldOffset: "20",
    targetObjectOffset: "12000",
    evidenceKind: "recursive-slot-evidence",
    directBones: "",
    directBindTokens: "",
    reachableBones: "Bone_Weapon",
    reachableBindTokens: "weapon_bnd",
  },
];

test("runtimeBindingGapRows joins unresolved bind slots with native Bone_* query evidence", () => {
  const definitionRows = [
    {
      relativePath: "Characters/Hero011/Taka.def",
      bindToken: "jaw_bnd",
      labelBefore: "Projectile_RightHandThrow",
      nearbyResourceCount: "0",
      nearbyResources: "",
    },
  ];
  const rows = runtimeBindingGapRows(graph, nativeBoneRows, definitionRows);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => [row.rel, row.slotName, row.bindToken, row.gapKind, row.nativeBoneQueryCount]),
    [
      ["Characters/Hero046/Art/hero046_tokyo.glb", "Bone_Weapon", "weapon_bnd", "native-bone-query", 1],
      ["Characters/SAW/Art/saw.glb", "Bone_HeartOfTheMatter_Aura", "fx_bnd", "effect-or-aura-slot", 0],
      ["Characters/Hero011/Art/hero011.glb", "Bone_Jaw", "jaw_bnd", "definition-logical-locator", 0],
    ],
  );
  assert.equal(rows[0].nativeNearbyEffects, "Effect_Kensei_B_Attack|Effect_Kensei_C_Cast");
  assert.equal(rows[0].nativeNearbySounds, "Sound_Kensei_B_Cast");
  assert.equal(rows[1].skeletons, "Characters/SAW/Art/saw.skeleton");
  assert.equal(rows[2].definitionLabels, "Projectile_RightHandThrow");
});

test("runtimeBindingGapRows keeps native bone evidence scoped to the matching character", () => {
  const scopedGraph = {
    items: [
      {
        rel: "Characters/Hero009/Art/hero009.glb",
        character: "Hero009",
        modelLabel: "Krul_DefaultSkin",
        sourceRelativePath: "Characters/Hero009/Krul.def",
        skeletons: ["Characters/Hero009/Art/hero009.skeleton"],
        bindSlots: [unresolvedSlot("Bone_Shield", "shield_bnd")],
      },
      {
        rel: "Characters/Catherine/Art/catherine.glb",
        character: "Catherine",
        modelLabel: "Catherine_DefaultSkin",
        sourceRelativePath: "Characters/Catherine/Catherine.def",
        skeletons: ["Characters/Catherine/Art/catherine.skeleton"],
        bindSlots: [unresolvedSlot("Bone_Shield", "shield_bnd")],
      },
    ],
  };
  const rows = runtimeBindingGapRows(
    scopedGraph,
    [
      {
        sourceFile: "functions/00e17.c",
        functionName: "FUN_00e17c6c",
        line: "42",
        accessorOffset: "0x78",
        boneName: "Bone_Shield",
        nearbyEffects: "Effect_Catherine_AssassinsChargeShieldGlow",
        nearbySounds: "",
        contextHash: "shield",
      },
    ],
    [],
  );

  assert.deepEqual(
    rows.map((row) => [row.character, row.slotName, row.gapKind, row.nativeBoneQueryCount]),
    [
      ["Hero009", "Bone_Shield", "unresolved-bind-hash", 0],
      ["Catherine", "Bone_Shield", "native-bone-query", 1],
    ],
  );
});

test("runtimeBindingGapRows uses SkinRep slot tables before leaving unresolved hashes", () => {
  const scopedGraph = {
    items: [
      {
        rel: "Characters/Hero009/Art/hero009.glb",
        character: "Hero009",
        modelLabel: "Krul_DefaultSkin",
        sourceRelativePath: "Characters/Hero009/Krul.def",
        skeletons: ["Characters/Hero009/Art/hero009.skeleton"],
        bindSlots: [unresolvedSlot("Bone_Shield", "shield_bnd")],
      },
      {
        rel: "Characters/Joule/Art/joule.glb",
        character: "Joule",
        modelLabel: "Joule_DefaultSkin",
        sourceRelativePath: "Characters/Joule/Joule.def",
        skeletons: ["Characters/Joule/Art/joule.skeleton"],
        bindSlots: [unresolvedSlot("Bone_JetEngine", "axe_bnd")],
      },
      {
        rel: "Characters/Catherine/Art/catherine.glb",
        character: "Catherine",
        modelLabel: "Catherine_DefaultSkin",
        sourceRelativePath: "Characters/Catherine/Catherine.def",
        skeletons: ["Characters/Catherine/Art/catherine.skeleton"],
        bindSlots: [unresolvedSlot("Bone_Shield", "shield_bnd")],
      },
    ],
  };

  const rows = runtimeBindingGapRows(scopedGraph, [], [], skinrepSlotRows);

  assert.deepEqual(
    rows.map((row) => [
      row.character,
      row.slotName,
      row.bindToken,
      row.gapKind,
      row.skinrepSlotTableCount,
      row.skinrepOwnerLabels,
    ]),
    [
      ["Hero009", "Bone_Shield", "shield_bnd", "skinrep-slot-table", 1, "Krul_DefaultSkin"],
      ["Joule", "Bone_JetEngine", "axe_bnd", "skinrep-slot-table", 1, "Joule_DefaultSkin"],
      ["Catherine", "Bone_Shield", "shield_bnd", "unresolved-bind-hash", 0, ""],
    ],
  );
  assert.equal(rows[0].skinrepTargetObjectOffsets, "10244");
  assert.equal(rows[1].skinrepTargetObjectOffsets, "9084");
});

test("runtimeBindingGapRows uses direct SkinRep object graph evidence without recursive cross-pairing", () => {
  const scopedGraph = {
    items: [
      {
        rel: "Characters/Hero046/Art/hero046_tokyo.glb",
        character: "Hero046",
        modelLabel: "Kensei_Skin_Tokyo",
        sourceRelativePath: "Characters/Hero046/Kensei.def",
        skeletons: ["Characters/Hero046/Art/hero046.skeleton"],
        bindSlots: [
          unresolvedSlot("Bone_Weapon", "weapon_bnd"),
          unresolvedSlot("Bone_RightHand", "rHandIK_bnd"),
        ],
      },
    ],
  };

  const rows = runtimeBindingGapRows(scopedGraph, [], [], skinObjectGraphRows);

  assert.deepEqual(
    rows.map((row) => [
      row.slotName,
      row.bindToken,
      row.gapKind,
      row.skinrepSlotTableCount,
      row.skinrepOwnerLabels,
      row.skinrepOwnerLocalFieldOffsets,
    ]),
    [
      ["Bone_Weapon", "weapon_bnd", "skinrep-slot-table", 1, "Kensei_Skin_Tokyo", "48"],
      ["Bone_RightHand", "rHandIK_bnd", "unresolved-bind-hash", 0, "", ""],
    ],
  );
  assert.equal(rows[0].skinrepTargetObjectOffsets, "12344");
});

test("exportRuntimeBindingGapReport writes TSV and JSON summaries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-binding-gap-report-"));
  const graphPath = path.join(tempDir, "runtime-skin-graph.json");
  const nativeTsv = path.join(tempDir, "native_bone_query_xrefs.tsv");
  const definitionTsv = path.join(tempDir, "definition_binding_tokens.tsv");
  const skinrepSlotTsv = path.join(tempDir, "cff0_runtime_object_refs.tsv");
  const tsvOut = path.join(tempDir, "runtime_binding_gaps.tsv");
  const jsonOut = path.join(tempDir, "runtime_binding_gaps.json");

  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
  fs.writeFileSync(
    nativeTsv,
    [
      "sourceFile\tfunctionName\tline\taccessorOffset\tboneName\tnearbyEffects\tnearbySounds\tcontextHash",
      "functions/00e10.c\tFUN_00e10000\t42\t0x78\tBone_Weapon\tEffect_Kensei_B_Attack|Effect_Kensei_C_Cast\tSound_Kensei_B_Cast\tabc123",
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

  const summary = exportRuntimeBindingGapReport({ graphPath, nativeTsv, definitionTsv, skinrepSlotTsv, tsvOut, jsonOut });

  assert.deepEqual(summary, {
    unresolvedSlots: 3,
    withNativeBoneQuery: 1,
    gapKinds: {
      "definition-logical-locator": 1,
      "effect-or-aura-slot": 1,
      "native-bone-query": 1,
    },
  });
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Kensei_Skin_Tokyo/);
  const json = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(json.summary.withNativeBoneQuery, 1);
  assert.equal(json.items[0].nativeNearbyEffects, "Effect_Kensei_B_Attack|Effect_Kensei_C_Cast");
  assert.equal(json.items[2].definitionLabels, "Projectile_RightHandThrow");
});
