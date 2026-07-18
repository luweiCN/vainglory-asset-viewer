const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportRuntimeAttachmentBones,
  inferRuntimeAttachmentBones,
  inferUnsafeTranslationBones,
  isInferredRootAttachmentBone,
  summarizeRuntimeAttachmentBoneReport,
} = require("../tools/runtime_attachment_bones");
const { engineHashHex } = require("../tools/engine_hash");

function sampleSkeleton() {
  return {
    boneCount: 8,
    bones: [
      { index: 0, parent: -1, hash: "ROOT", translation: [0, 0, 0] },
      { index: 1, parent: 0, hash: "BODY", translation: [0, 100, 0] },
      { index: 2, parent: 1, hash: "SPINE", translation: [0, 12, 0] },
      { index: 3, parent: 2, hash: "RHAND", translation: [0, 20, 0] },
      { index: 4, parent: 0, hash: "SWORD", translation: [100, 0, -20] },
      { index: 5, parent: 4, hash: "SWORDTIP", translation: [0, 80, 0] },
      { index: 6, parent: 0, hash: "SHIELD", translation: [-170, 30, 0] },
      { index: 7, parent: 1, hash: "ARMOR", translation: [4, 5, 0] },
    ],
  };
}

function sampleMeshFromDominantJoints(joints) {
  const skinJoints = [];
  const weights = [];
  for (const joint of joints) {
    skinJoints.push(joint, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  }
  return {
    joints: new Uint8Array(skinJoints),
    weights: new Float32Array(weights),
  };
}

test("isInferredRootAttachmentBone excludes the central body root", () => {
  const counts = new Map([
    [1, 500],
    [4, 140],
  ]);

  assert.equal(isInferredRootAttachmentBone(sampleSkeleton().bones[1], counts), false);
  assert.equal(isInferredRootAttachmentBone(sampleSkeleton().bones[4], counts), true);
});

test("inferRuntimeAttachmentBones combines runtime slots, root prop clusters, and prop descendants", () => {
  const mesh = sampleMeshFromDominantJoints([
    ...Array(180).fill(4),
    ...Array(32).fill(5),
    ...Array(50).fill(6),
    ...Array(300).fill(1),
  ]);
  const runtimeConfig = {
    slots: [
      {
        slotName: "Bone_RightHand",
        bindToken: "rHandIK_bnd",
        bindingKind: "skeleton-bone",
        resolvedBoneIndex: 3,
      },
      {
        slotName: "Bone_Weapon",
        bindToken: "sword_bnd",
        bindingKind: "skeleton-bone",
        resolvedBoneIndex: 4,
      },
      {
        slotName: "Bone_Head",
        bindToken: "headA_bnd",
        bindingKind: "skeleton-bone",
        resolvedBoneIndex: 2,
      },
    ],
  };

  const item = inferRuntimeAttachmentBones({
    item: {
      rel: "Characters/Hero999/Art/hero999.glb",
      character: "Hero999",
      modelLabel: "Hero999_DefaultSkin",
      sourceRelativePath: "Characters/Hero999/Hero999.def",
      meshPath: "Characters/Hero999/Art/hero999.mesh",
      skeletons: ["Characters/Hero999/Art/hero999.skeleton"],
    },
    mesh,
    skeleton: sampleSkeleton(),
    runtimeConfig,
  });

  assert.deepEqual(item.translationBoneIndices, [3, 4, 5, 6]);
  assert.deepEqual(
    item.evidence.map((entry) => [entry.boneIndex, entry.reasons.join("|")]),
    [
      [3, "runtime-bind-slot"],
      [4, "mesh-skin-root-attachment|runtime-bind-slot"],
      [5, "attachment-descendant"],
      [6, "mesh-skin-root-attachment"],
    ],
  );
});

test("inferRuntimeAttachmentBones does not expand aura slots into hand descendants", () => {
  const mesh = sampleMeshFromDominantJoints([...Array(40).fill(3), ...Array(40).fill(7)]);
  const item = inferRuntimeAttachmentBones({
    item: {
      rel: "Characters/Ringo/Art/ringo.glb",
      character: "Ringo",
      modelLabel: "Ringo_DefaultSkin",
      sourceRelativePath: "Characters/Ringo/Ringo.def",
      meshPath: "Characters/Ringo/Art/ringo.mesh",
      skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
    },
    mesh,
    skeleton: sampleSkeleton(),
    runtimeConfig: {
      slots: [
        {
          slotName: "Bone_RightHand_Aura",
          bindToken: "rHand_bnd",
          bindingKind: "skeleton-bone",
          resolvedBoneIndex: 3,
        },
      ],
    },
  });

  assert.deepEqual(item.translationBoneIndices, [3]);
});

test("inferRuntimeAttachmentBones treats native extra transform bind tokens as configured", () => {
  const skeleton = sampleSkeleton();
  skeleton.bones[4] = {
    ...skeleton.bones[4],
    hash: engineHashHex("sword_bnd"),
  };

  const item = inferRuntimeAttachmentBones({
    item: {
      rel: "Characters/Hero999/Art/hero999.glb",
      character: "Hero999",
      modelLabel: "Hero999_DefaultSkin",
      sourceRelativePath: "Characters/Hero999/Hero999.def",
      meshPath: "Characters/Hero999/Art/hero999.mesh",
      skeletons: ["Characters/Hero999/Art/hero999.skeleton"],
    },
    mesh: sampleMeshFromDominantJoints([1, 1, 1]),
    skeleton,
    runtimeConfig: { slots: [] },
    nativeExtraTransformBindTokens: ["sword_bnd"],
  });

  assert.deepEqual(item.translationBoneIndices, [4]);
  assert.deepEqual(item.configuredTranslationBoneIndices, [4]);
  assert.deepEqual(item.inferredTranslationBoneIndices, []);
  assert.deepEqual(item.evidence[0].reasons, ["native-extra-transform-bind-token"]);
  assert.equal(item.evidence[0].bindToken, "sword_bnd");
});

test("inferUnsafeTranslationBones marks guob effect material bones as unsafe for native translation", () => {
  const mesh = {
    joints: new Uint8Array([
      4,
      0,
      0,
      0,
      5,
      0,
      0,
      0,
    ]),
    weights: new Float32Array([
      1,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
    ]),
    primitives: [
      {
        materialName: "/Characters/Hero048/Art/hero048_valkyrie.guob_mat.shadergraph",
        jointPalette: [4, 5],
      },
    ],
  };

  assert.deepEqual(inferUnsafeTranslationBones(mesh), [
    {
      boneIndex: 4,
      reasons: ["effect-material-primitive"],
      materialName: "/Characters/Hero048/Art/hero048_valkyrie.guob_mat.shadergraph",
    },
    {
      boneIndex: 5,
      reasons: ["effect-material-primitive"],
      materialName: "/Characters/Hero048/Art/hero048_valkyrie.guob_mat.shadergraph",
    },
  ]);
});

test("inferRuntimeAttachmentBones includes unsafe native translation evidence separately", () => {
  const item = inferRuntimeAttachmentBones({
    item: {
      rel: "Characters/Hero048/Art/hero048_valkyrie.glb",
      character: "Hero048",
      modelLabel: "Hero048_Valkyrie",
      sourceRelativePath: "Characters/Hero048/Hero048.def",
      meshPath: "Characters/Hero048/Art/hero048_valkyrie.mesh",
      skeletons: ["Characters/Hero048/Art/hero048.skeleton"],
    },
    mesh: {
      ...sampleMeshFromDominantJoints([4, 5]),
      primitives: [
        {
          materialName: "/Characters/Hero048/Art/hero048_valkyrie.guob_mat.shadergraph",
          jointPalette: [4, 5],
        },
      ],
    },
    skeleton: sampleSkeleton(),
    runtimeConfig: { slots: [] },
  });

  assert.deepEqual(item.unsafeTranslationBoneIndices, [4, 5]);
  assert.deepEqual(item.unsafeEvidence.map((entry) => entry.reasons), [["effect-material-primitive"], ["effect-material-primitive"]]);
});

test("summarizeRuntimeAttachmentBoneReport separates configured and inferred attachment bones", () => {
  const report = {
    items: [
      {
        evidence: [
          { boneIndex: 3, reasons: ["runtime-bind-slot"] },
          { boneIndex: 4, reasons: ["mesh-skin-root-attachment", "runtime-bind-slot"] },
          { boneIndex: 7, reasons: ["native-extra-transform-bind-token"] },
          { boneIndex: 5, reasons: ["attachment-descendant"] },
          { boneIndex: 6, reasons: ["mesh-skin-root-attachment"] },
        ],
      },
      {
        evidence: [{ boneIndex: 9, reasons: ["attachment-descendant"] }],
      },
    ],
    failures: [{ rel: "bad.glb" }],
  };

  assert.deepEqual(summarizeRuntimeAttachmentBoneReport(report), {
    items: 2,
    withTranslationBones: 2,
    translationBoneRefs: 6,
    configuredBoneRefs: 3,
    inferredOnlyBoneRefs: 3,
    rootHeuristicOnlyBoneRefs: 1,
    descendantOnlyBoneRefs: 2,
    unsafeTranslationBoneRefs: 0,
    highRiskItems: 2,
    failures: 1,
  });
});

test("exportRuntimeAttachmentBones returns the generated summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-attachment-bones-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const runtimeConfigPath = path.join(tempDir, "runtime-binding-config.json");
  const jsonOut = path.join(tempDir, "runtime-attachment-bones.json");
  const tsvOut = path.join(tempDir, "runtime_attachment_bones.tsv");

  fs.writeFileSync(manifestPath, `${JSON.stringify({ items: [] })}\n`);
  fs.writeFileSync(runtimeConfigPath, `${JSON.stringify({ items: [] })}\n`);

  assert.deepEqual(
    exportRuntimeAttachmentBones({
      manifestPath,
      runtimeConfigPath,
      resourceRoot: tempDir,
      jsonOut,
      tsvOut,
      generatedAt: "now",
    }),
    {
      items: 0,
      withTranslationBones: 0,
      translationBoneRefs: 0,
      configuredBoneRefs: 0,
      inferredOnlyBoneRefs: 0,
      rootHeuristicOnlyBoneRefs: 0,
      descendantOnlyBoneRefs: 0,
      unsafeTranslationBoneRefs: 0,
      highRiskItems: 0,
      failures: 0,
    },
  );
});
