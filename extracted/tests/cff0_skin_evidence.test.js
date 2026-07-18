const assert = require("node:assert/strict");
const test = require("node:test");

const { buildSkinEvidenceRows, skeletonEvidence } = require("../tools/cff0_skin_evidence");

test("skeletonEvidence reports direct skeleton resources as direct evidence", () => {
  const row = { definitionFormatByte: "5", definitionVersionByte: "5" };
  const fields = [
    { localFieldOffset: "16", sourceOffset: "900", referenceKind: "object" },
    {
      localFieldOffset: "24",
      sourceOffset: "1200",
      value: "build://Characters/Ringo/Art/ringo.skeleton",
      resourceCategory: "skeleton",
      targetRelativePath: "Characters/Ringo/Art/ringo.skeleton",
    },
  ];

  assert.deepEqual(skeletonEvidence(row, fields), {
    skeletonFieldLocalOffset: 24,
    skeletonEvidenceKind: "direct-skeleton-resource",
    skeletonFieldSourceOffset: "1200",
    skeletonFieldValue: "build://Characters/Ringo/Art/ringo.skeleton",
    skeletonFieldTarget: "Characters/Ringo/Art/ringo.skeleton",
  });
});

test("skeletonEvidence preserves same-object evidence without inventing fallback semantics", () => {
  const row = { definitionFormatByte: "4", definitionVersionByte: "8" };
  const fields = [
    { localFieldOffset: "8", sourceOffset: "714", referenceKind: "object" },
    { localFieldOffset: "12", sourceOffset: "714", referenceKind: "object" },
  ];

  assert.deepEqual(skeletonEvidence(row, fields), {
    skeletonFieldLocalOffset: 12,
    skeletonEvidenceKind: "same-as-first-object-ref",
    skeletonFieldSourceOffset: "714",
    skeletonFieldValue: "",
    skeletonFieldTarget: "",
  });
});

test("buildSkinEvidenceRows summarizes skin records from CFF0 rows only", () => {
  const skinRows = [
    {
      source: "cff0-ptch",
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      modelLabel: "Ringo_Skin_Shogun_T1",
      recordStartField: "15440",
      meshPath: "Characters/Ringo/Art/ringo_shogun_t1.mesh",
      ownSkeletons: "",
      animationCount: "0",
      effectCount: "0",
    },
    {
      source: "cff0-ptch",
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      modelLabel: "Ringo_Skin_Pirate",
      recordStartField: "17360",
      meshPath: "Characters/Ringo/Art/ringo_pirate.mesh",
      ownSkeletons: "Characters/Ringo/Art/ringo_pirate.skeleton",
      animationCount: "31",
      effectCount: "22",
    },
  ];
  const fieldRows = [
    {
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      modelLabel: "Ringo_Skin_Shogun_T1",
      recordStartField: "15440",
      localFieldOffset: "16",
      sourceOffset: "874",
      referenceKind: "object",
    },
    {
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      modelLabel: "Ringo_Skin_Shogun_T1",
      recordStartField: "15440",
      localFieldOffset: "24",
      sourceOffset: "874",
      referenceKind: "object",
    },
    {
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      modelLabel: "Ringo_Skin_Pirate",
      recordStartField: "17360",
      localFieldOffset: "24",
      sourceOffset: "17576",
      value: "build://Characters/Ringo/Art/ringo_pirate.skeleton",
      resourceCategory: "skeleton",
      targetRelativePath: "Characters/Ringo/Art/ringo_pirate.skeleton",
    },
  ];
  const objectRefRows = [
    {
      relativePath: "Characters/Ringo/Ringo.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      ownerLabel: "Ringo_Skin_Shogun_T1",
      modelLabel: "Ringo_Skin_Shogun_T1",
      recordStartField: "15440",
      ownerRecordStartField: "15440",
      targetBones: "Bone_RightHand|Bone_LeftHand",
      targetBindTokens: "gunA_bnd",
      targetEffects: "Effect_Ringo_Shot",
      targetAnimations: "",
      targetResources: "",
    },
  ];

  const rows = buildSkinEvidenceRows({ skinRows, fieldRows, objectRefRows });

  assert.equal(rows[0].skeletonEvidenceKind, "same-as-first-object-ref");
  assert.equal(rows[0].slotEvidenceKind, "direct-object-slot-evidence");
  assert.equal(rows[0].targetBones, "Bone_RightHand|Bone_LeftHand");
  assert.equal(rows[0].targetBindTokens, "gunA_bnd");
  assert.equal(rows[0].animationEvidenceKind, "no-direct-animation-records");
  assert.equal(rows[1].skeletonEvidenceKind, "direct-skeleton-resource");
  assert.equal(rows[1].animationEvidenceKind, "direct-animation-records");
  assert.equal(rows[1].effectEvidenceKind, "direct-effect-labels");
});
