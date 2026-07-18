const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeObjectGraph,
  classifyRuntimeObjectKind,
  exportRuntimeObjectGraph,
} = require("../tools/runtime_object_graph");

function stringRow(relativePath, blockIndex, stringIndex, semantic, labelBefore, value, resourceCategory = "") {
  const targetRelativePath = String(value || "").replace(/^build:\/\//, "");
  return {
    relativePath,
    hash: "SOURCE",
    blockIndex,
    definitionFormatByte: 4,
    definitionVersionByte: 8,
    payloadSize: 4096,
    stringIndex,
    payloadOffset: stringIndex * 16,
    semantic,
    labelBefore,
    value,
    resourceCategory,
    targetRelativePath: resourceCategory ? targetRelativePath : "",
    targetBuildPath: resourceCategory ? value : "",
  };
}

function nativeRow({
  platform = "ios",
  functionName = "FUN_100043d50",
  line = 100,
  stringLiterals,
  focusTypes = "AnimatedMesh|StaticMesh",
}) {
  return {
    platform,
    sourceFile: "native.c",
    functionName,
    line,
    evidenceKind: "offset-access",
    accessKind: "memory-field-offset",
    focusTypes,
    fieldOffsets: "0x30",
    fieldRefs: "AnimatedMesh.field5@0x30",
    symbols: "",
    anchorKinds: "build-resource",
    stringLiterals,
    score: 65,
    contextHash: "native-context",
  };
}

const trapRows = [
  stringRow("Characters/Hero023/Kestrel_Trap.def", 0, 0, "label", "", "Kestrel_Trap"),
  stringRow("Characters/Hero023/Kestrel_Trap.def", 0, 1, "label", "Kestrel_Trap", "Ability__Kestrel__Trap_Spawn"),
  stringRow("Characters/Hero023/Kestrel_Trap.def", 0, 2, "label", "Ability__Kestrel__Trap_Spawn", "Kestrel_DefaultSkin"),
  stringRow(
    "Characters/Hero023/Kestrel_Trap.def",
    0,
    3,
    "resource",
    "Kestrel_DefaultSkin",
    "build://Characters/Hero023/ArtTrap/hero023Trap.mesh",
    "mesh",
  ),
  stringRow(
    "Characters/Hero023/Kestrel_Trap.def",
    0,
    4,
    "resource",
    "Kestrel_DefaultSkin",
    "build://Characters/Hero023/ArtTrap/hero023Trap.skeleton",
    "skeleton",
  ),
  stringRow("Characters/Hero023/Kestrel_Trap.def", 0, 5, "label", "Kestrel_DefaultSkin", "Spawn"),
  stringRow(
    "Characters/Hero023/Kestrel_Trap.def",
    0,
    6,
    "resource",
    "Spawn",
    "build://Characters/Hero023/ArtTrap/hero023Trap.spawn.anim",
    "animation",
  ),
  stringRow("Characters/Hero023/Kestrel_Trap.def", 0, 7, "label", "Spawn", "Idle"),
  stringRow(
    "Characters/Hero023/Kestrel_Trap.def",
    0,
    8,
    "resource",
    "Idle",
    "build://Characters/Hero023/ArtTrap/hero023Trap.idle.anim",
    "animation",
  ),
];

const allPbrItems = [
  {
    rel: "Characters/Hero023/ArtTrap/hero023Trap.glb",
    character: "Hero023",
    variant: "hero023Trap",
    sourceMeshPath: "Characters/Hero023/ArtTrap/hero023Trap.mesh",
  },
  {
    rel: "Characters/Hero001/Art/hero001.glb",
    character: "Hero001",
    variant: "hero001",
    sourceMeshPath: "Characters/Hero001/Art/hero001.mesh",
  },
];

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify({ items: value }, null, 2)}\n`);
}

function writeTsv(filePath, rows) {
  const columns = [
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
  ];
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("classifyRuntimeObjectKind recognizes definition-owned runtime props", () => {
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Hero023/ArtTrap/hero023Trap.glb", variant: "hero023Trap" }), "trap");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Hero025/ArtWall/hero025Wall_ally.glb", variant: "hero025Wall_ally" }), "wall");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Hero012/ArtArena/hero012Arena.glb", variant: "hero012Arena" }), "arena");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Turret5v5/Art/turret5v5.glb", variant: "turret5v5" }), "structure");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/JungleBlackclaw/Art/blackclaw.glb", variant: "blackclaw" }), "jungle-creature");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Props/visionTotem/Art/visionTotem.glb", variant: "visionTotem" }), "totem");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Hero015/Art/hero015PackEnemy.glb", variant: "hero015PackEnemy" }), "minion");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Attachments/Hats/SantaHat2018/Art/santaHat2018.glb", variant: "santaHat2018" }), "attachment");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.glb", variant: "circleJoystickIndicator" }), "input-indicator");
  assert.equal(classifyRuntimeObjectKind({ rel: "Characters/Hero001/Art/hero001.glb", variant: "hero001" }), "");
});

test("buildRuntimeObjectGraph links non-skin runtime actors from definition mesh references", () => {
  const actorRows = [
    stringRow("Characters/Turret/5v5Turrets/Turret5v5.def", 0, 0, "label", "", "Turret"),
    stringRow("Characters/Turret/5v5Turrets/Turret5v5.def", 0, 1, "label", "Turret", "Structure_DefaultSkin"),
    stringRow(
      "Characters/Turret/5v5Turrets/Turret5v5.def",
      0,
      2,
      "resource",
      "Structure_DefaultSkin",
      "build://Characters/Turret5v5/Art/turret5v5.mesh",
      "mesh",
    ),
    stringRow(
      "Characters/Turret/5v5Turrets/Turret5v5.def",
      0,
      3,
      "resource",
      "Structure_DefaultSkin",
      "build://Characters/Turret5v5/Art/turret5v5.skeleton",
      "skeleton",
    ),
    stringRow(
      "Characters/Turret/5v5Turrets/Turret5v5.def",
      0,
      4,
      "resource",
      "Idle",
      "build://Characters/Turret5v5/Art/turret5v5.idle.anim",
      "animation",
    ),
    stringRow("Items/Actors/VisionTotem.def", 0, 0, "label", "", "VisionTotem"),
    stringRow(
      "Items/Actors/VisionTotem.def",
      0,
      1,
      "resource",
      "Structure_DefaultSkin",
      "build://Characters/Props/visionTotem/Art/visionTotem.mesh",
      "mesh",
    ),
  ];

  const graph = buildRuntimeObjectGraph({
    generatedAt: "now",
    allPbrItems: [
      {
        rel: "Characters/Turret5v5/Art/turret5v5.glb",
        character: "Turret5v5",
        variant: "turret5v5",
        sourceMeshPath: "Characters/Turret5v5/Art/turret5v5.mesh",
      },
      {
        rel: "Characters/Props/visionTotem/Art/visionTotem.glb",
        character: "Props",
        variant: "visionTotem",
        sourceMeshPath: "Characters/Props/visionTotem/Art/visionTotem.mesh",
      },
    ],
    stringRows: actorRows,
  });

  assert.equal(graph.count, 2);
  assert.deepEqual(
    graph.items.map((item) => [item.rel, item.objectKind, item.sourceRelativePath]),
    [
      ["Characters/Turret5v5/Art/turret5v5.glb", "structure", "Characters/Turret/5v5Turrets/Turret5v5.def"],
      ["Characters/Props/visionTotem/Art/visionTotem.glb", "totem", "Items/Actors/VisionTotem.def"],
    ],
  );
});

test("buildRuntimeObjectGraph links native skinrep consumer resources when definitions do not reference the mesh", () => {
  const graph = buildRuntimeObjectGraph({
    generatedAt: "now",
    allPbrItems: [
      {
        rel: "Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.glb",
        character: "JoystickIndicator",
        variant: "circleJoystickIndicator",
        sourceMeshPath: "Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.mesh",
      },
    ],
    stringRows: [],
    nativeRows: [
      nativeRow({
        stringLiterals:
          "build://Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.mesh|build://Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.skeleton",
      }),
      nativeRow({
        functionName: "FUN_100043dc0",
        line: 140,
        stringLiterals:
          "build://Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.R_%d_T_%d.anim|build://Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.skeleton",
      }),
    ],
  });

  assert.equal(graph.count, 1);
  assert.equal(graph.items[0].rel, "Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.glb");
  assert.equal(graph.items[0].objectKind, "input-indicator");
  assert.equal(graph.items[0].sourceRelativePath, "native:ios:FUN_100043d50|native:ios:FUN_100043dc0");
  assert.deepEqual(graph.items[0].meshPaths, ["Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.mesh"]);
  assert.deepEqual(graph.items[0].skeletonPaths, ["Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.skeleton"]);
  assert.deepEqual(graph.items[0].animationPaths, [
    "Characters/JoystickIndicator/ArtCircle/circleJoystickIndicator.R_%d_T_%d.anim",
  ]);
});

test("buildRuntimeObjectGraph links prop GLBs only when a definition block references their mesh", () => {
  const graph = buildRuntimeObjectGraph({
    generatedAt: "now",
    allPbrItems,
    stringRows: trapRows,
  });

  assert.equal(graph.count, 1);
  assert.equal(graph.items[0].rel, "Characters/Hero023/ArtTrap/hero023Trap.glb");
  assert.equal(graph.items[0].objectKind, "trap");
  assert.equal(graph.items[0].sourceRelativePath, "Characters/Hero023/Kestrel_Trap.def");
  assert.equal(graph.items[0].runtimeBlockIndex, 0);
  assert.deepEqual(graph.items[0].ownerLabels, ["Kestrel_DefaultSkin"]);
  assert.deepEqual(graph.items[0].skeletonPaths, ["Characters/Hero023/ArtTrap/hero023Trap.skeleton"]);
  assert.deepEqual(graph.items[0].animationPaths, [
    "Characters/Hero023/ArtTrap/hero023Trap.spawn.anim",
    "Characters/Hero023/ArtTrap/hero023Trap.idle.anim",
  ]);
});

test("buildRuntimeObjectGraph deduplicates alternate encoded blocks for the same prop", () => {
  const duplicateRows = [
    ...trapRows,
    ...trapRows.map((row) => ({
      ...row,
      blockIndex: 1,
      definitionFormatByte: 5,
      definitionVersionByte: 5,
    })),
  ];

  const graph = buildRuntimeObjectGraph({
    generatedAt: "now",
    allPbrItems,
    stringRows: duplicateRows,
  });

  assert.equal(graph.count, 1);
  assert.equal(graph.items[0].runtimeBlockIndex, 1);
});

test("exportRuntimeObjectGraph writes report and viewer manifests", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-object-graph-"));
  const allPbrManifestPath = path.join(tempDir, "all-pbr.json");
  const instanceStringsPath = path.join(tempDir, "strings.tsv");
  const viewerOut = path.join(tempDir, "runtime-object-graph.json");
  const tsvOut = path.join(tempDir, "runtime-object-graph.tsv");
  const jsonOut = path.join(tempDir, "runtime-object-graph-summary.json");

  writeJson(allPbrManifestPath, allPbrItems);
  writeTsv(instanceStringsPath, trapRows);

  const summary = exportRuntimeObjectGraph({
    allPbrManifestPath,
    instanceStringsPath,
    viewerOut,
    tsvOut,
    jsonOut,
  });
  const viewer = JSON.parse(fs.readFileSync(viewerOut, "utf8"));

  assert.equal(summary.items, 1);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Kestrel_Trap/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.withAnimations, 1);
  assert.equal(viewer.items[0].objectKind, "trap");
});
