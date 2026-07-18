const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildSkinAnimationBindings,
  exportSkinAnimationBindings,
} = require("../tools/skin_animation_bindings");

test("buildSkinAnimationBindings attaches base and skin-specific animations to skin models", () => {
  const manifestItems = [
    {
      rel: "Characters/Ringo/Art/ringo.glb",
      modelLabel: "Ringo_DefaultSkin",
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
      relationshipMatched: true,
    },
    {
      rel: "Characters/Ringo/Art/ringo_pirate.glb",
      modelLabel: "Ringo_Skin_Pirate",
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      skeletons: ["Characters/Ringo/Art/ringo_pirate.skeleton"],
      relationshipMatched: true,
    },
  ];
  const skinRows = [
    { sourceRelativePath: "Characters/Ringo/Ringo.def", modelLabel: "Ringo_DefaultSkin" },
    { sourceRelativePath: "Characters/Ringo/Ringo.def", modelLabel: "Ringo_Skin_Pirate" },
  ];
  const characterLinks = [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Idle",
      category: "animation",
      targetRelativePath: "Characters/Ringo/Art/ringo.idle.anim",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_Skin_Pirate",
      category: "animation",
      targetRelativePath: "Characters/Ringo/Art/ringo_pirate.idle.anim",
    },
  ];
  const animationInfoByPath = new Map([
    ["Characters/Ringo/Art/ringo.idle.anim", { duration: 3, fps: 15, frameCount: 45, trackCount: 76 }],
    ["Characters/Ringo/Art/ringo_pirate.idle.anim", { duration: 3, fps: 30, frameCount: 90, trackCount: 115 }],
  ]);
  const skeletonInfoByPath = new Map([
    ["Characters/Ringo/Art/ringo.skeleton", { boneCount: 76 }],
    ["Characters/Ringo/Art/ringo_pirate.skeleton", { boneCount: 115 }],
  ]);

  const result = buildSkinAnimationBindings({
    manifestItems,
    skinRows,
    characterLinks,
    animationInfoByPath,
    skeletonInfoByPath,
  });

  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((item) => [item.modelLabel, item.boneCount, item.animations.length]),
    [
      ["Ringo_DefaultSkin", 76, 1],
      ["Ringo_Skin_Pirate", 115, 1],
    ],
  );
  assert.deepEqual(
    result.items[1].animations.map((animation) => [
      animation.label,
      animation.actionKey,
      animation.bindingSource,
      animation.trackCount,
      animation.trackMatchesSkeleton,
    ]),
    [
      ["Idle", "idle", "specific", 115, true],
    ],
  );
});

test("buildSkinAnimationBindings derives readable labels and prefers skin-specific action variants", () => {
  const manifestItems = [
    {
      rel: "Characters/Skye/Art/skye_exoframe.glb",
      modelLabel: "Skye_Skin_Exoframe",
      sourceRelativePath: "Characters/Skye/Skye.def",
      skeletons: ["Characters/Skye/Art/skye.skeleton"],
      relationshipMatched: true,
    },
  ];
  const skinRows = [
    { sourceRelativePath: "Characters/Skye/Skye.def", modelLabel: "Skye_DefaultSkin" },
    { sourceRelativePath: "Characters/Skye/Skye.def", modelLabel: "Skye_Skin_Exoframe" },
  ];
  const characterLinks = [
    {
      sourceRelativePath: "Characters/Skye/Skye.def",
      label: "Attack",
      category: "animation",
      targetRelativePath: "Characters/Skye/Art/skye.attack.anim",
    },
    {
      sourceRelativePath: "Characters/Skye/Skye.def",
      label: "BarrageForward",
      category: "animation",
      targetRelativePath: "Characters/Skye/Art/skye.ability01_forward.anim",
    },
    {
      sourceRelativePath: "Characters/Skye/Skye.def",
      label: "Idle",
      category: "animation",
      targetRelativePath: "Characters/Skye/Art/skye.idle.anim",
    },
    {
      sourceRelativePath: "Characters/Skye/Skye.def",
      label: "Skye_Skin_Exoframe",
      category: "animation",
      targetRelativePath: "Characters/Skye/Art/skye.exo_attack.anim",
    },
    {
      sourceRelativePath: "Characters/Skye/Skye.def",
      label: "Skye_Skin_Exoframe",
      category: "animation",
      targetRelativePath: "Characters/Skye/Art/skye.eagle_t3.ability01_forward.anim",
    },
  ];
  const animationInfoByPath = new Map([
    ["Characters/Skye/Art/skye.attack.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 85 }],
    ["Characters/Skye/Art/skye.ability01_forward.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 85 }],
    ["Characters/Skye/Art/skye.idle.anim", { duration: 3, fps: 30, frameCount: 90, trackCount: 85 }],
    ["Characters/Skye/Art/skye.exo_attack.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 85 }],
    ["Characters/Skye/Art/skye.eagle_t3.ability01_forward.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 85 }],
  ]);
  const skeletonInfoByPath = new Map([["Characters/Skye/Art/skye.skeleton", { boneCount: 85 }]]);

  const result = buildSkinAnimationBindings({
    manifestItems,
    skinRows,
    characterLinks,
    animationInfoByPath,
    skeletonInfoByPath,
  });

  assert.deepEqual(
    result.items[0].animations.map((animation) => [
      animation.label,
      animation.actionKey,
      animation.bindingSource,
      animation.targetRelativePath,
    ]),
    [
      ["BarrageForward", "ability01_forward", "specific", "Characters/Skye/Art/skye.eagle_t3.ability01_forward.anim"],
      ["Attack", "attack", "specific", "Characters/Skye/Art/skye.exo_attack.anim"],
      ["Idle", "idle", "base", "Characters/Skye/Art/skye.idle.anim"],
    ],
  );
});

test("buildSkinAnimationBindings trusts death animation paths over stale neighboring labels", () => {
  const manifestItems = [
    {
      rel: "Characters/Adagio/Art/adagio.glb",
      modelLabel: "Adagio_DefaultSkin",
      sourceRelativePath: "Characters/Adagio/Adagio.def",
      skeletons: ["Characters/Adagio/Art/adagio.skeleton"],
      relationshipMatched: true,
    },
  ];
  const skinRows = [{ sourceRelativePath: "Characters/Adagio/Adagio.def", modelLabel: "Adagio_DefaultSkin" }];
  const characterLinks = [
    {
      sourceRelativePath: "Characters/Adagio/Adagio.def",
      label: "Ability03_Cast",
      category: "animation",
      targetRelativePath: "Characters/Adagio/Art/adagio.ability03.anim",
    },
    {
      sourceRelativePath: "Characters/Adagio/Adagio.def",
      label: "Ability03_Cast",
      category: "animation",
      targetRelativePath: "Characters/Adagio/Art/adagio.death.anim",
    },
  ];
  const animationInfoByPath = new Map([
    ["Characters/Adagio/Art/adagio.ability03.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 80 }],
    ["Characters/Adagio/Art/adagio.death.anim", { duration: 1, fps: 30, frameCount: 30, trackCount: 80 }],
  ]);
  const skeletonInfoByPath = new Map([["Characters/Adagio/Art/adagio.skeleton", { boneCount: 80 }]]);

  const result = buildSkinAnimationBindings({
    manifestItems,
    skinRows,
    characterLinks,
    animationInfoByPath,
    skeletonInfoByPath,
  });

  assert.deepEqual(
    result.items[0].animations.map((animation) => [animation.label, animation.actionKey, animation.targetRelativePath]),
    [
      ["Ability03_Cast", "ability03", "Characters/Adagio/Art/adagio.ability03.anim"],
      ["Death", "death", "Characters/Adagio/Art/adagio.death.anim"],
    ],
  );
});

test("exportSkinAnimationBindings writes JSON and TSV summaries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skin-anim-"));
  const manifestPath = path.join(tempDir, "skin-manifest.json");
  const skinSummaryPath = path.join(tempDir, "skin.tsv");
  const characterLinksPath = path.join(tempDir, "links.tsv");
  const animationIndexPath = path.join(tempDir, "anim.tsv");
  const skeletonIndexPath = path.join(tempDir, "skeleton.tsv");
  const jsonOut = path.join(tempDir, "bindings.json");
  const tsvOut = path.join(tempDir, "bindings.tsv");
  const animFile = path.join(tempDir, "ringo.idle.anim");
  const skeletonFile = path.join(tempDir, "ringo.skeleton");

  const anim = Buffer.alloc(80);
  anim.writeUInt32LE(1, 0);
  anim.writeFloatLE(3, 4);
  anim.writeUInt32LE(3, 8);
  anim.writeUInt32LE(anim.length - 16, 12);
  anim.writeFloatLE(15, 16);
  anim.writeUInt32LE(45, 20);
  anim.writeUInt32LE(2, 24);
  anim.writeUInt32LE(1, 28);
  fs.writeFileSync(animFile, anim);

  const skeleton = Buffer.alloc(4 + 2 * 4 + 2 * 2 + 2 * 48);
  skeleton.writeUInt16LE(0, 0);
  skeleton.writeUInt16LE(2, 2);
  fs.writeFileSync(skeletonFile, skeleton);

  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Ringo/Art/ringo.glb",
          modelLabel: "Ringo_DefaultSkin",
          sourceRelativePath: "Characters/Ringo/Ringo.def",
          skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
          relationshipMatched: true,
        },
      ],
    }),
  );
  fs.writeFileSync(
    skinSummaryPath,
    [
      "sourceRelativePath\tmodelLabel",
      "Characters/Ringo/Ringo.def\tRingo_DefaultSkin",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    characterLinksPath,
    [
      "sourceRelativePath\tlabel\tcategory\ttargetRelativePath",
      "Characters/Ringo/Ringo.def\tIdle\tanimation\tCharacters/Ringo/Art/ringo.idle.anim",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    animationIndexPath,
    [
      "category\trelativePath\thash\tsize\tmagic4\tfilePath\tlinkedPath",
      `animation\tCharacters/Ringo/Art/ringo.idle.anim\tANIM\t80\t....\t${animFile}\t${animFile}`,
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    skeletonIndexPath,
    [
      "category\trelativePath\thash\tsize\tmagic4\tfilePath\tlinkedPath",
      `skeleton\tCharacters/Ringo/Art/ringo.skeleton\tSKEL\t104\t....\t${skeletonFile}\t${skeletonFile}`,
      "",
    ].join("\n"),
  );

  const summary = exportSkinAnimationBindings({
    manifestPath,
    skinSummaryPath,
    characterLinksPath,
    animationIndexPath,
    skeletonIndexPath,
    jsonOut,
    tsvOut,
  });

  assert.deepEqual(summary, { items: 1, animations: 1, matchedTracks: 1, mismatchedTracks: 0 });
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).items[0].animations[0].label, "Idle");
  assert.match(fs.readFileSync(tsvOut, "utf8"), /trackMatchesSkeleton/);
});
