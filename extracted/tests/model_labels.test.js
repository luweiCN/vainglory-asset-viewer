const assert = require("node:assert/strict");
const test = require("node:test");

test("Fortress pack labels identify ally, enemy, and unqualified summons", async () => {
  const { appendModelQualifier, modelSummonQualifier } = await import("../viewer/model-labels.js");
  const ally = {
    rel: "Characters/Hero015/Art/hero015_hell_t3_packAlly.glb",
    modelLabel: "Fortress_Skin_Hell_T3",
    sourceRelativePath: "Characters/Hero015/FortressMinion.def",
  };
  const enemy = {
    rel: "Characters/Hero015/Art/hero015_hell_t3_packEnemy.glb",
    modelLabel: "Fortress_Skin_Hell_T3",
  };
  const unqualified = {
    rel: "Characters/Hero015/Art/hero015_kirin_pack.glb",
  };
  const snapshot = structuredClone(ally);

  assert.equal(modelSummonQualifier(ally), "召唤物（友方）");
  assert.equal(modelSummonQualifier(enemy), "召唤物（敌方）");
  assert.equal(modelSummonQualifier(unqualified), "召唤物");
  assert.equal(
    appendModelQualifier("冥界要塞 / Netherworld Fortress", ally),
    "冥界要塞 / Netherworld Fortress · 召唤物（友方）",
  );
  assert.deepEqual(ally, snapshot);
});

test("Fortress hero bodies and unrelated heroes keep their original labels", async () => {
  const { appendModelQualifier, modelSummonQualifier } = await import("../viewer/model-labels.js");
  const fortressBody = {
    rel: "Characters/Hero015/Art/hero015_hell_t3.glb",
    sourceRelativePath: "Characters/Hero015/Hero015_Skin_Hell_T3.def",
  };
  const otherHero = {
    rel: "Characters/Hero012/Art/hero012_fall_t3.glb",
    sourceRelativePath: "Characters/Hero012/Hero012_Skin_Fall_T3.def",
  };

  assert.equal(modelSummonQualifier(fortressBody), "");
  assert.equal(modelSummonQualifier(otherHero), "");
  assert.equal(appendModelQualifier("Fortress_Skin_Hell_T3", fortressBody), "Fortress_Skin_Hell_T3");
});
