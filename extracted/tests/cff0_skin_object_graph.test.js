const assert = require("node:assert/strict");
const test = require("node:test");

const { evidenceKind, summarizeObjectFields, traverseObjectGraph } = require("../tools/cff0_skin_object_graph");

function field(fieldOffset, sourceOffset, value = "", extra = {}) {
  return {
    fieldOffset,
    sourceOffset,
    value,
    semantic: "",
    resourceCategory: "",
    targetRelativePath: "",
    ...extra,
  };
}

test("summarizeObjectFields extracts bones, bind tokens, resources, and child refs", () => {
  const summary = summarizeObjectFields(
    [
      field(100, 0, "Bone_Weapon"),
      field(104, 0, "sword_bnd"),
      field(108, 0, "build://Characters/Hero/Art/hero.attack.anim", {
        semantic: "resource",
        resourceCategory: "animation",
        targetRelativePath: "Characters/Hero/Art/hero.attack.anim",
      }),
      field(112, 240),
    ],
    96,
  );

  assert.deepEqual(summary.bones, ["Bone_Weapon"]);
  assert.deepEqual(summary.bindTokens, ["sword_bnd"]);
  assert.deepEqual(summary.animations, ["Characters/Hero/Art/hero.attack.anim"]);
  assert.deepEqual(summary.objectRefs, [{ localOffset: 16, targetOffset: 240 }]);
});

test("traverseObjectGraph finds slot evidence through nested object refs", () => {
  const block = {
    payloadSize: 512,
    fields: [
      field(200, 300),
      field(304, 0, "Bone_Weapon"),
      field(308, 0, "sword_bnd"),
    ],
  };

  const graph = traverseObjectGraph(block, 200, { windowBytes: 64, maxDepth: 2, maxNodes: 16 });

  assert.equal(graph.visitedObjectCount, 2);
  assert.deepEqual(graph.directBones, []);
  assert.deepEqual(graph.reachableBones, ["Bone_Weapon"]);
  assert.deepEqual(graph.reachableBindTokens, ["sword_bnd"]);
  assert.equal(evidenceKind(graph), "recursive-slot-evidence");
});

test("traverseObjectGraph reports direct slot evidence without requiring recursion", () => {
  const block = {
    payloadSize: 512,
    fields: [field(204, 0, "Bone_Shield"), field(208, 0, "shield_bnd")],
  };

  const graph = traverseObjectGraph(block, 200, { windowBytes: 64, maxDepth: 2, maxNodes: 16 });

  assert.deepEqual(graph.directBones, ["Bone_Shield"]);
  assert.deepEqual(graph.directBindTokens, ["shield_bnd"]);
  assert.equal(evidenceKind(graph), "direct-slot-evidence");
});

test("traverseObjectGraph terminates cycles and marks the cycle count", () => {
  const block = {
    payloadSize: 512,
    fields: [field(200, 300), field(300, 200), field(304, 0, "Bone_RightHand"), field(308, 0, "rHandIK_bnd")],
  };

  const graph = traverseObjectGraph(block, 200, { windowBytes: 64, maxDepth: 4, maxNodes: 16 });

  assert.equal(graph.visitedObjectCount, 2);
  assert.equal(graph.cycles, 1);
  assert.deepEqual(graph.reachableBones, ["Bone_RightHand"]);
  assert.deepEqual(graph.reachableBindTokens, ["rHandIK_bnd"]);
});
