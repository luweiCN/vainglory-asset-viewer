const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseSkeletonFile,
  summarizeMeshSkin,
} = require("../tools/skeleton_tools");

test("parseSkeletonFile reads Vainglory compact skeleton layout", () => {
  const skeleton = parseSkeletonFile("extracted/hero_assets/skeletons/Characters/Ringo/Art/ringo.skeleton");

  assert.equal(skeleton.boneCount, 76);
  assert.equal(skeleton.bones.length, 76);
  assert.equal(skeleton.bones[0].parent, -1);
  assert.equal(skeleton.bones[1].parent, 0);
  assert.equal(skeleton.bones[5].parent, 4);
  assert.equal(skeleton.bones[0].translation.length, 3);
  assert.equal(skeleton.bones[0].rotation.length, 4);
  assert.equal(skeleton.bones[0].scale.length, 3);
  assert.deepEqual(skeleton.bones[0].scale, [1, 1, 1]);
  assert.equal(skeleton.bones[0].extra[0], 1);
  assert.ok(Math.abs(skeleton.bones[0].extra[1]) < 0.000001);
  assert.ok(Math.abs(skeleton.bones[0].rotationNorm - 1) < 0.001);
  assert.ok(skeleton.bones[0].translation[1] > 90);
});

test("parseSkeletonFile preserves quaternion component precision", () => {
  const skeleton = parseSkeletonFile("extracted/hero_assets/skeletons/Characters/Ringo/Art/ringo.skeleton");

  assert.ok(Math.abs(skeleton.bones[10].rotation[0] + 0.30176) < 0.00001);
  assert.ok(Math.abs(skeleton.bones[10].rotation[1] + 0.01454) < 0.00001);
});

test("summarizeMeshSkin reads bone index and weight channels", () => {
  const summary = summarizeMeshSkin("extracted/hero_assets/meshes/Characters/Ringo/Art/ringo.mesh");

  assert.equal(summary.vertexCount, 3250);
  assert.equal(summary.hasSkin, true);
  assert.equal(summary.jointSemantic, 10);
  assert.equal(summary.weightSemantic, 9);
  assert.equal(summary.maxJoint, 32);
  assert.equal(summary.invalidWeightCount, 0);
  assert.ok(summary.uniqueJointTriplets > 100);
  assert.ok(summary.topJointTriplets[0].count > 500);
});
