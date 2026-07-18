const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSkinModelSummary } = require("../tools/skin_model_summary");

test("buildSkinModelSummary groups character meshes without inventing skeleton fallback", () => {
  const links = [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_DefaultSkin",
      category: "mesh",
      targetRelativePath: "Characters/Ringo/Art/ringo.mesh",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_DefaultSkin",
      category: "skeleton",
      targetRelativePath: "Characters/Ringo/Art/ringo.skeleton",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_Skin_Shogun_T1",
      category: "mesh",
      targetRelativePath: "Characters/Ringo/Art/ringo_shogun_t1.mesh",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_Skin_Pirate",
      category: "mesh",
      targetRelativePath: "Characters/Ringo/Art/ringo_pirate.mesh",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_Skin_Pirate",
      category: "skeleton",
      targetRelativePath: "Characters/Ringo/Art/ringo_pirate.skeleton",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      label: "Ringo_Skin_Pirate",
      category: "animation",
      targetRelativePath: "Characters/Ringo/Art/ringo_pirate.idle.anim",
    },
  ];

  assert.deepEqual(buildSkinModelSummary(links), [
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_DefaultSkin",
      meshCount: 1,
      meshes: "Characters/Ringo/Art/ringo.mesh",
      skeletons: "Characters/Ringo/Art/ringo.skeleton",
      usesFallbackSkeleton: "no",
      sameLabelAnimationCount: 0,
      firstSameLabelAnimations: "",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_Skin_Pirate",
      meshCount: 1,
      meshes: "Characters/Ringo/Art/ringo_pirate.mesh",
      skeletons: "Characters/Ringo/Art/ringo_pirate.skeleton",
      usesFallbackSkeleton: "no",
      sameLabelAnimationCount: 1,
      firstSameLabelAnimations: "Characters/Ringo/Art/ringo_pirate.idle.anim",
    },
    {
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      modelLabel: "Ringo_Skin_Shogun_T1",
      meshCount: 1,
      meshes: "Characters/Ringo/Art/ringo_shogun_t1.mesh",
      skeletons: "",
      usesFallbackSkeleton: "unresolved",
      sameLabelAnimationCount: 0,
      firstSameLabelAnimations: "",
    },
  ]);
});
