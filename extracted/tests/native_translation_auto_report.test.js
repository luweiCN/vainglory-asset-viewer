const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chooseSampledNativeTranslationMode,
  nativeTranslationSafeActsLikeNone,
  unsafeBonesFor,
} = require("../tools/native_translation_auto_report");

test("native translation auto report prefers all translations when sampled edges stay clean", () => {
  const mode = chooseSampledNativeTranslationMode({
    bindMax: 100,
    allMax: 140,
    safeMax: 100,
    noneMax: 99,
    fallbackMode: "safe",
    allEdgeRatio: 1.05,
    safeHasCoverage: true,
    modeChanges: false,
  });

  assert.equal(mode, "all");
});

test("native translation auto report accepts high edge ratios when all is not worse than safe or none", () => {
  const mode = chooseSampledNativeTranslationMode({
    bindMax: 100,
    allMax: 150,
    safeMax: 148,
    noneMax: 170,
    fallbackMode: "safe",
    allEdgeRatio: 2.1,
    safeEdgeRatio: 2.12,
    noneEdgeRatio: 2.15,
    safeHasCoverage: true,
    modeChanges: false,
  });

  assert.equal(mode, "all");
});

test("native translation auto report falls back to safe when all translations deform badly", () => {
  const mode = chooseSampledNativeTranslationMode({
    bindMax: 100,
    allMax: 300,
    safeMax: 105,
    noneMax: 104,
    fallbackMode: "safe",
    allEdgeRatio: 2.5,
    safeEdgeRatio: 1.1,
    noneEdgeRatio: 1.1,
    safeHasCoverage: true,
    modeChanges: false,
  });

  assert.equal(mode, "safe");
});

test("native translation safe mode detects when it acts like no translations", () => {
  assert.equal(nativeTranslationSafeActsLikeNone(100, 102), true);
  assert.equal(nativeTranslationSafeActsLikeNone(100, 110), false);
});

test("native translation auto report reads unsafe translation bones from runtime attachment evidence", () => {
  assert.deepEqual([...unsafeBonesFor({ unsafeTranslationBoneIndices: [5, "bad", -1, 8] })], [5, 8]);
});
