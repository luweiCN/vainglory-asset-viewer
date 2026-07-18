const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildSkinPreviewManifest, exportSkinPreviewManifest } = require("../tools/skin_preview_manifest");

test("buildSkinPreviewManifest enriches GLB items with decoded skin relationships", () => {
  const glbManifest = {
    source: "../hero_assets_glb_textured_pbr",
    items: [
      {
        rel: "Characters/Ringo/Art/ringo.glb",
        character: "Ringo",
        variant: "ringo",
        size: 120,
      },
      {
        rel: "Characters/Node/Art/node.glb",
        character: "Node",
        variant: "node",
        size: 80,
      },
    ],
  };
  const skinRows = [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_DefaultSkin",
      meshes: "Characters/Ringo/Art/ringo.mesh",
      skeletons: "Characters/Ringo/Art/ringo.skeleton",
      usesFallbackSkeleton: "no",
      sameLabelAnimationCount: "3",
      firstSameLabelAnimations: "Characters/Ringo/Art/ringo.idle.anim|Characters/Ringo/Art/ringo.run.anim",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_Missing",
      meshes: "Characters/Ringo/Art/missing.mesh",
      skeletons: "",
      usesFallbackSkeleton: "yes",
      sameLabelAnimationCount: "0",
      firstSameLabelAnimations: "",
    },
  ];

  const manifest = buildSkinPreviewManifest(glbManifest, skinRows, "2026-06-22T00:00:00.000Z");

  assert.equal(manifest.count, 2);
  assert.equal(manifest.skinCount, 1);
  assert.equal(manifest.unmatchedSkinRows.length, 1);
  assert.equal(manifest.passthroughCount, 1);
  assert.deepEqual(manifest.items.find((item) => item.rel === "Characters/Ringo/Art/ringo.glb"), {
    rel: "Characters/Ringo/Art/ringo.glb",
    character: "Ringo",
    variant: "Ringo_DefaultSkin",
    size: 120,
    modelLabel: "Ringo_DefaultSkin",
    sourceRelativePath: "Characters/Ringo/Ringo.def",
    meshPath: "Characters/Ringo/Art/ringo.mesh",
    skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
    usesFallbackSkeleton: false,
    sameLabelAnimationCount: 3,
    firstSameLabelAnimations: ["Characters/Ringo/Art/ringo.idle.anim", "Characters/Ringo/Art/ringo.run.anim"],
    relationshipMatched: true,
  });
  assert.equal(manifest.items.find((item) => item.rel === "Characters/Node/Art/node.glb").relationshipMatched, false);
});

test("buildSkinPreviewManifest only links optional attachments with animation evidence", () => {
  const glbManifest = {
    source: "../hero_assets_glb_textured_pbr",
    items: [
      {
        rel: "Characters/Ringo/Art/ringo.glb",
        character: "Ringo",
        variant: "ringo",
        size: 120,
      },
      {
        rel: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.glb",
        character: "Attachments",
        variant: "wizard2018",
        size: 40,
      },
      {
        rel: "Characters/Attachments/Goodies/Gun_Ringo/Art/gun_ringo.glb",
        character: "Attachments",
        variant: "gun_ringo",
        size: 60,
      },
    ],
  };
  const skinRows = [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_DefaultSkin",
      meshes: "Characters/Ringo/Art/ringo.mesh",
      skeletons: "Characters/Ringo/Art/ringo.skeleton",
      usesFallbackSkeleton: "no",
      sameLabelAnimationCount: "0",
      firstSameLabelAnimations: "",
    },
  ];

  const manifest = buildSkinPreviewManifest(glbManifest, skinRows, "2026-06-22T00:00:00.000Z", {
    attachmentAnimationRows: [
      {
        relativePath: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.Ringo_DefaultSkin.anim",
      },
    ],
  });

  const ringo = manifest.items.find((item) => item.rel === "Characters/Ringo/Art/ringo.glb");
  assert.deepEqual(ringo.attachments, [
    {
      rel: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.glb",
      label: "wizard2018",
      source: "attachment-animation",
      assetRoot: "skinned",
      animationPath: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.Ringo_DefaultSkin.anim",
    },
  ]);
});

test("exportSkinPreviewManifest writes a viewer manifest", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skin-preview-"));
  const glbManifestPath = path.join(tempDir, "glb.json");
  const skinSummaryPath = path.join(tempDir, "skin.tsv");
  const outPath = path.join(tempDir, "skin-preview.json");

  fs.writeFileSync(
    glbManifestPath,
    JSON.stringify({
      source: "../hero_assets_glb_textured_pbr",
      items: [{ rel: "Characters/Ringo/Art/ringo.glb", character: "Ringo", variant: "ringo", size: 120 }],
    }),
  );
  fs.writeFileSync(
    skinSummaryPath,
    [
      "sourceRelativePath\tmodelLabel\tmeshCount\tmeshes\tskeletons\tusesFallbackSkeleton\tsameLabelAnimationCount\tfirstSameLabelAnimations",
      "Characters/Ringo/Ringo.def\tRingo_DefaultSkin\t1\tCharacters/Ringo/Art/ringo.mesh\tCharacters/Ringo/Art/ringo.skeleton\tno\t0\t",
      "",
    ].join("\n"),
  );

  const summary = exportSkinPreviewManifest({ glbManifestPath, skinSummaryPath, outPath });

  assert.equal(summary.count, 1);
  assert.equal(JSON.parse(fs.readFileSync(outPath, "utf8")).items[0].variant, "Ringo_DefaultSkin");
});
