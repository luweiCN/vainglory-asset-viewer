const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAttachableEquipmentRows,
  editDistanceAtMostOne,
  extractManifestPairs,
  findDefinitionForLabel,
  summarize,
} = require("../tools/attachable_equipment_chain");

test("extractManifestPairs dedupes inventory-to-attachment entries across CFF0 blocks", () => {
  const rows = [
    {
      relativePath: "Progression/KindredAttachableEquipmentManifest.def",
      blockIndex: "0",
      stringIndex: "1",
      semantic: "label",
      labelBefore: "INVENTORY_GLASSES_NYE_2019",
      value: "*GlassesNYE2019*",
    },
    {
      relativePath: "Progression/KindredAttachableEquipmentManifest.def",
      blockIndex: "1",
      stringIndex: "1",
      semantic: "label",
      labelBefore: "INVENTORY_GLASSES_NYE_2019",
      value: "*GlassesNYE2019*",
    },
    {
      relativePath: "Progression/KindredAttachableEquipmentManifest.def",
      blockIndex: "0",
      stringIndex: "2",
      semantic: "label",
      labelBefore: "*GlassesNYE2019*",
      value: "INVENTORY_HAT_ROYALCROWN_2018",
    },
  ];

  const pairs = extractManifestPairs(rows);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].inventoryId, "INVENTORY_GLASSES_NYE_2019");
  assert.equal(pairs[0].attachmentLabel, "*GlassesNYE2019*");
  assert.equal(pairs[0].sourceBlocks, "0,1");
});

test("buildAttachableEquipmentRows joins manifest labels to attachment defs and bind assets", () => {
  const rows = buildAttachableEquipmentRows({
    instanceRows: [
      {
        relativePath: "Progression/KindredAttachableEquipmentManifest.def",
        blockIndex: "0",
        stringIndex: "1",
        semantic: "label",
        labelBefore: "INVENTORY_GLASSES_NYE_2019",
        value: "*GlassesNYE2019*",
      },
    ],
    definitionRows: [
      {
        manifestLabel: "*GlassesNYE2019*",
        targetRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/GlassesNYE2019.def",
        targetMatched: "yes",
        targetHash: "abc",
        targetLinkedPath: "linked.def",
      },
    ],
    assetRows: [
      {
        sourceRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/GlassesNYE2019.def",
        category: "mesh",
        label: "headB_bnd",
        targetRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/Art/glassesNYE2019.mesh",
      },
      {
        sourceRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/GlassesNYE2019.def",
        category: "skeleton",
        label: "headB_bnd",
        targetRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/Art/glassesNYE2019.skeleton",
      },
      {
        sourceRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/GlassesNYE2019.def",
        category: "animation",
        label: "Ringo_DefaultSkin",
        targetRelativePath: "Characters/Attachments/Glasses/GlassesNYE2019/Art/glassesNYE2019.Ringo_DefaultSkin.anim",
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetMatched, "yes");
  assert.equal(rows[0].resolvedManifestLabel, "*GlassesNYE2019*");
  assert.equal(rows[0].resolutionSource, "exact-label");
  assert.equal(rows[0].meshCount, 1);
  assert.equal(rows[0].skeletonCount, 1);
  assert.equal(rows[0].animationCount, 1);
  assert.equal(rows[0].bindTokens, "headB_bnd");
  assert.match(rows[0].animationLabelSamples, /Ringo_DefaultSkin/);
  assert.deepEqual(summarize(rows).bindTokenSamples, ["headB_bnd"]);
});

test("findDefinitionForLabel records one-edit manifest spelling aliases without hiding provenance", () => {
  const definitionByLabel = new Map([
    [
      "*RoyaleCrown2018*",
      {
        manifestLabel: "*RoyaleCrown2018*",
        targetRelativePath: "Characters/Attachments/Hats/RoyalCrown2018/RoyalCrown2018.def",
        targetMatched: "yes",
      },
    ],
  ]);

  assert.equal(editDistanceAtMostOne("royalcrown2018", "royalecrown2018"), true);
  const result = findDefinitionForLabel("*RoyalCrown2018*", definitionByLabel);

  assert.equal(result.resolvedManifestLabel, "*RoyaleCrown2018*");
  assert.equal(result.resolutionSource, "probable-label-alias");
  assert.equal(result.definition.targetMatched, "yes");
});
