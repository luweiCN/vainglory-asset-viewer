const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const helperUrl = pathToFileURL(path.resolve(__dirname, "../viewer/runtime-form-visibility.js")).href;

async function loadHelper() {
  return import(`${helperUrl}?t=${Date.now()}`);
}

test("mixed form mesh stays mounted so its human-form weapon remains visible", async () => {
  const { resolveFormMeshVisibility } = await loadHelper();
  const input = {
    meshBoneIndices: [40, 55, 57, 64],
    formBoneIndices: [55, 57, 64],
    dominantBoneIndex: 55,
  };

  assert.deepEqual(resolveFormMeshVisibility({ ...input, visibleBoneIndices: [] }), {
    visible: true,
    alternateActive: false,
  });
  assert.deepEqual(resolveFormMeshVisibility({ ...input, visibleBoneIndices: [57, 64] }), {
    visible: true,
    alternateActive: false,
  });
  assert.deepEqual(resolveFormMeshVisibility({ ...input, visibleBoneIndices: [55] }), {
    visible: true,
    alternateActive: true,
  });
});

test("pure alternate-form mesh still follows its native visibility bones", async () => {
  const { resolveFormMeshVisibility } = await loadHelper();
  const input = {
    meshBoneIndices: [55, 56, 63],
    formBoneIndices: [55, 56, 57, 63, 64],
    dominantBoneIndex: 55,
  };

  assert.deepEqual(resolveFormMeshVisibility({ ...input, visibleBoneIndices: [] }), {
    visible: false,
    alternateActive: false,
  });
  assert.deepEqual(resolveFormMeshVisibility({ ...input, visibleBoneIndices: [55, 56, 63] }), {
    visible: true,
    alternateActive: true,
  });
});

test("form visibility falls back to native position when an action has no scale keys", async () => {
  const { resolveFormBoneVisibility } = await loadHelper();

  assert.equal(
    resolveFormBoneVisibility({ scale: [1, 1, 1], translation: [0, -1795.949, -15.527], hasScaleTrack: false }),
    false,
  );
  assert.equal(
    resolveFormBoneVisibility({ scale: [1, 1, 1], translation: [0, 150, 9.2], hasScaleTrack: false }),
    true,
  );
  assert.equal(resolveFormBoneVisibility({ scale: [0, 0, 0], translation: [0, 150, 9.2], hasScaleTrack: false }), false);
  assert.equal(resolveFormBoneVisibility({ scale: [1, 1, 1], translation: [52.7, 909.3, -334.2], hasScaleTrack: true }), true);
});

test("bounds can ignore vertices controlled only by hidden detachable bones", async () => {
  const { isVertexControlledOnlyByHiddenBones } = await loadHelper();

  assert.equal(
    isVertexControlledOnlyByHiddenBones({
      jointIndices: [55, 0, 0, 0],
      jointWeights: [1, 0, 0, 0],
      hiddenBoneIndices: new Set([55]),
    }),
    true,
  );
  assert.equal(
    isVertexControlledOnlyByHiddenBones({
      jointIndices: [55, 50, 0, 0],
      jointWeights: [0.9, 0.1, 0, 0],
      hiddenBoneIndices: new Set([55]),
    }),
    false,
  );
});

test("ordinary body mesh is not treated as an alternate form", async () => {
  const { resolveFormMeshVisibility } = await loadHelper();

  assert.equal(
    resolveFormMeshVisibility({
      meshBoneIndices: [0, 1, 14, 40],
      formBoneIndices: [55, 57, 64],
      visibleBoneIndices: [55],
      dominantBoneIndex: 14,
    }),
    null,
  );
});

test("form bones require a clearly detached native bind root", async () => {
  const { resolveFormBoneIndices } = await loadHelper();
  const visibilityRows = [55, 57].map((boneIndex) => ({ boneIndex, visibilityStatus: "time-windowed" }));

  assert.deepEqual(
    resolveFormBoneIndices({
      inferredBoneIndices: [55, 57],
      visibilityRows,
      evidenceRows: [
        { boneIndex: 55, translation: "0.000,-1795.949,-15.527" },
        { boneIndex: 57, translation: "-17.867,195.726,-51.943" },
      ],
    }),
    [55, 57],
  );
  assert.deepEqual(
    resolveFormBoneIndices({
      inferredBoneIndices: [55, 57],
      visibilityRows,
      evidenceRows: [{ boneIndex: 55, translation: "-47.700,0.000,96.073" }],
    }),
    [],
  );
});
