const assert = require("node:assert/strict");
const test = require("node:test");

const { buildAnimationBoneMappingReport, summarizeAnimationBoneMapping } = require("../tools/animation_bone_mapping_report");

function sampleAnimationBuffer() {
  const buffer = Buffer.alloc(160, 0xff);
  buffer.writeUInt32LE(1, 0);
  buffer.writeFloatLE(1.5, 4);
  buffer.writeUInt32LE(3, 8);
  buffer.writeUInt32LE(buffer.length - 16, 12);
  buffer.writeFloatLE(20, 16);
  buffer.writeUInt32LE(30, 20);
  buffer.writeUInt32LE(2, 24);
  buffer.writeUInt32LE(8, 28);
  buffer.writeUInt32LE(0, 32);
  buffer.writeUInt16LE(0x7f, 36);
  buffer.writeUInt16LE(0x0f, 38);
  buffer.writeUInt16LE(0, 40);
  buffer.writeUInt16LE(4, 42);

  const firstTransform = [-0.592, -0.302, -0.661, -0.106, 0, 17.024, -8.063, 0, 1, 1, 1, 0];
  const secondTransform = [-0.268, -0.312, 0.896, 0, 0, 10, 0, 0, 1, 1, 1, 0];
  firstTransform.forEach((value, index) => buffer.writeFloatLE(value, 52 + index * 4));
  secondTransform.forEach((value, index) => buffer.writeFloatLE(value, 100 + index * 4));
  return buffer;
}

function sampleAnimationBufferWithZeroScaleTrack() {
  const buffer = sampleAnimationBuffer();
  buffer.writeFloatLE(0, 100 + 8 * 4);
  buffer.writeFloatLE(0, 100 + 9 * 4);
  buffer.writeFloatLE(0, 100 + 10 * 4);
  return buffer;
}

function sampleSkeleton() {
  return {
    boneCount: 3,
    bones: [
      { index: 6, translation: [-50, -154.3, -0.03] },
      { index: 7, translation: [0, 17, -8.06] },
      { index: 8, translation: [0, 10, 0] },
    ],
  };
}

test("summarizeAnimationBoneMapping maps packed records back to skeleton-space translations", () => {
  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Ringo/Art/ringo.test.anim",
    skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
    animationBuffer: sampleAnimationBuffer(),
    skeleton: sampleSkeleton(),
  });

  assert.equal(summary.animationPath, "Characters/Ringo/Art/ringo.test.anim");
  assert.equal(summary.skeletonPath, "Characters/Ringo/Art/ringo.skeleton");
  assert.equal(summary.transformRecords, 2);
  assert.equal(summary.matchedTransformRecords, 2);
  assert.equal(summary.ambiguousTransformRecords, 0);
  assert.equal(summary.uniqueMatchedBones, 2);
  assert.equal(summary.poseBoneRecords, 2);
  assert.equal(summary.unambiguousPoseBones, 2);
  assert.deepEqual(summary.poseBones[0], {
    boneIndex: 7,
    distance: 0.024,
    ambiguous: false,
    offset: 52,
    rotation: [-0.592, -0.302, -0.661, -0.106],
    translation: [0, 17.024, -8.063],
    scale: [1, 1, 1],
  });
  assert.equal(summary.prefixByteSummary, "0x00:1 0xff:1");
  assert.equal(summary.offsetDeltaSummary, "48:1");
  assert.equal(summary.topMatchedBones, "7:1 8:1");
});

test("buildAnimationBoneMappingReport de-duplicates animation and skeleton pairs", () => {
  const report = buildAnimationBoneMappingReport({
    bindingRows: [
      {
        animationPath: "Characters/Ringo/Art/ringo.test.anim",
        skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
        trackMatchesSkeleton: "yes",
      },
      {
        animationPath: "Characters/Ringo/Art/ringo.test.anim",
        skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
        trackMatchesSkeleton: "yes",
      },
      {
        animationPath: "Characters/Ringo/Art/ringo.bad.anim",
        skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
        trackMatchesSkeleton: "no",
      },
    ],
    readAnimation: () => sampleAnimationBuffer(),
    readSkeleton: () => sampleSkeleton(),
    generatedAt: "2026-06-22T00:00:00.000Z",
  });

  assert.equal(report.generatedAt, "2026-06-22T00:00:00.000Z");
  assert.equal(report.count, 1);
  assert.equal(report.items[0].matchedTransformRecords, 2);
  assert.equal(report.items[0].poseBoneRecords, 2);
});

test("summarizeAnimationBoneMapping uses track order for skeleton-compatible transform runs", () => {
  const buffer = sampleAnimationBuffer();
  const skeleton = {
    boneCount: 2,
    bones: [
      { index: 0, translation: [100, 100, 100] },
      { index: 1, translation: [-100, -100, -100] },
    ],
  };

  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Ringo/Art/ringo.test.anim",
    skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
    animationBuffer: buffer,
    skeleton,
    trackOrderOptions: { enableRawTrackOrder: true },
  });

  assert.equal(summary.mappingSource, "track-order");
  assert.equal(summary.matchedTransformRecords, 2);
  assert.equal(summary.uniqueMatchedBones, 2);
  assert.equal(summary.poseBoneRecords, 2);
  assert.deepEqual(
    summary.poseBones.map((pose) => pose.boneIndex),
    [0, 1],
  );
});

test("summarizeAnimationBoneMapping does not assume raw scan records are in track order by default", () => {
  const buffer = sampleAnimationBuffer();
  const skeleton = {
    boneCount: 2,
    bones: [
      { index: 0, translation: [100, 100, 100] },
      { index: 1, translation: [-100, -100, -100] },
    ],
  };

  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Ringo/Art/ringo.test.anim",
    skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
    animationBuffer: buffer,
    skeleton,
  });

  assert.equal(summary.mappingSource, "translation-match");
  assert.equal(summary.trackOrderCandidatePoseBones, 2);
  assert.equal(summary.trackOrderCandidateUnambiguousPoseBones, 0);
  assert.equal(summary.trackOrderCandidateUnsafePoseBones, 2);
  assert.equal(summary.nativeFrameBoneRecords, 0);
  assert.deepEqual(summary.nativeFrameBoneIndices, []);
  assert.equal(summary.trackOrderCandidateStartOffset, 52);
  assert.equal(summary.matchedTransformRecords, 0);
  assert.equal(summary.poseBoneRecords, 0);
});

test("summarizeAnimationBoneMapping keeps zero-scale records in track-order diagnostics", () => {
  const buffer = sampleAnimationBufferWithZeroScaleTrack();
  const skeleton = {
    boneCount: 2,
    bones: [
      { index: 0, translation: [0, 17.024, -8.063] },
      { index: 1, translation: [0, 10, 0] },
    ],
  };

  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Koshka/Art/koshka.test.anim",
    skeletonPath: "Characters/Koshka/Art/koshka.skeleton",
    animationBuffer: buffer,
    skeleton,
  });

  assert.equal(summary.mappingSource, "translation-match");
  assert.equal(summary.trackOrderCandidatePoseBones, 2);
  assert.equal(summary.trackOrderCandidateUnambiguousPoseBones, 1);
  assert.equal(summary.trackOrderCandidateUnsafePoseBones, 1);
  assert.equal(summary.nativeFrameBoneRecords, 1);
  assert.deepEqual(summary.nativeFrameBoneIndices, [0]);
});

test("summarizeAnimationBoneMapping marks track-order records with large transform drift ambiguous", () => {
  const buffer = sampleAnimationBuffer();
  const skeleton = {
    boneCount: 2,
    bones: [
      { index: 0, translation: [120, 120, 120] },
      { index: 1, translation: [0, 10, 0] },
    ],
  };

  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Ringo/Art/ringo.test.anim",
    skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
    animationBuffer: buffer,
    skeleton,
    trackOrderOptions: { enableRawTrackOrder: true },
  });

  assert.equal(summary.mappingSource, "track-order");
  assert.equal(summary.matchedTransformRecords, 2);
  assert.equal(summary.poseBoneRecords, 2);
  assert.equal(summary.unambiguousPoseBones, 1);
  assert.deepEqual(
    summary.poseBones.map((pose) => [pose.boneIndex, pose.ambiguous, pose.unsafeReason || ""]),
    [
      [0, true, "translation-drift"],
      [1, false, ""],
    ],
  );
});

test("summarizeAnimationBoneMapping marks high-rotation leaf track-order bones ambiguous", () => {
  const buffer = sampleAnimationBuffer();
  const skeleton = {
    boneCount: 2,
    bones: [
      {
        index: 0,
        parent: -1,
        rotation: [0, 0, 0, 1],
        translation: [0, 17.024, -8.063],
      },
      {
        index: 1,
        parent: -1,
        rotation: [-0.268, -0.312, 0.896, 0],
        translation: [0, 10, 0],
      },
    ],
  };

  const summary = summarizeAnimationBoneMapping({
    animationPath: "Characters/Ringo/Art/ringo.test.anim",
    skeletonPath: "Characters/Ringo/Art/ringo.skeleton",
    animationBuffer: buffer,
    skeleton,
    trackOrderOptions: { enableRawTrackOrder: true, trackOrderMinReliablePoseCoverage: 0.5 },
  });

  assert.equal(summary.mappingSource, "track-order");
  assert.equal(summary.unambiguousPoseBones, 1);
  assert.deepEqual(
    summary.poseBones.map((pose) => [pose.boneIndex, pose.ambiguous, pose.unsafeReason || ""]),
    [
      [0, true, "rotation-drift"],
      [1, false, ""],
    ],
  );
});
