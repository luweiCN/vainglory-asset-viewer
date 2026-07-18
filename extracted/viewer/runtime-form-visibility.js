const DEFAULT_DETACHED_FORM_OFFSET = 500;
const DEFAULT_VISIBLE_SCALE = 0.5;

function translationMagnitude(value) {
  const components = Array.isArray(value) ? value : String(value || "").split(",");
  const numbers = components.map(Number);
  return numbers.length >= 3 && numbers.slice(0, 3).every(Number.isFinite) ? Math.hypot(...numbers.slice(0, 3)) : 0;
}

function scaleMagnitude(value) {
  const components = Array.isArray(value) ? value : String(value || "").split(",");
  const numbers = components.map((component) => Math.abs(Number(component) || 0));
  return numbers.length ? Math.max(...numbers) : 0;
}

export function resolveFormBoneVisibility({
  scale = [],
  translation = [],
  hasScaleTrack = false,
  minimumVisibleScale = DEFAULT_VISIBLE_SCALE,
  minimumDetachedOffset = DEFAULT_DETACHED_FORM_OFFSET,
} = {}) {
  if (scaleMagnitude(scale) < minimumVisibleScale) return false;
  if (hasScaleTrack) return true;
  return translationMagnitude(translation) < minimumDetachedOffset;
}

export function isVertexControlledOnlyByHiddenBones({
  jointIndices = [],
  jointWeights = [],
  hiddenBoneIndices = [],
} = {}) {
  const hiddenBones = hiddenBoneIndices instanceof Set ? hiddenBoneIndices : new Set(hiddenBoneIndices);
  let hasWeightedJoint = false;
  for (let index = 0; index < Math.min(jointIndices.length, jointWeights.length); index += 1) {
    if ((Number(jointWeights[index]) || 0) <= 0.001) continue;
    hasWeightedJoint = true;
    if (!hiddenBones.has(Math.round(Number(jointIndices[index])))) return false;
  }
  return hasWeightedJoint;
}

export function resolveFormBoneIndices({
  inferredBoneIndices = [],
  visibilityRows = [],
  evidenceRows = [],
  minimumDetachedOffset = DEFAULT_DETACHED_FORM_OFFSET,
} = {}) {
  const inferredBones = new Set(inferredBoneIndices);
  const windowedBones = new Set(
    visibilityRows
      .filter((row) => row.visibilityStatus === "time-windowed" && inferredBones.has(Number(row.boneIndex)))
      .map((row) => Number(row.boneIndex)),
  );
  const hasDetachedRoot = evidenceRows.some(
    (row) => windowedBones.has(Number(row.boneIndex)) && translationMagnitude(row.translation) >= minimumDetachedOffset,
  );
  return hasDetachedRoot ? [...windowedBones] : [];
}

export function resolveFormMeshVisibility({
  meshBoneIndices = [],
  formBoneIndices = [],
  visibleBoneIndices = [],
  dominantBoneIndex = null,
} = {}) {
  const formBones = new Set(formBoneIndices);
  const controlledBones = [...new Set(meshBoneIndices)].filter((boneIndex) => formBones.has(boneIndex));
  if (!controlledBones.length) return null;

  const visibleBones = new Set(visibleBoneIndices);
  const hasUncontrolledBones = [...new Set(meshBoneIndices)].some((boneIndex) => !formBones.has(boneIndex));
  return {
    visible: hasUncontrolledBones || controlledBones.some((boneIndex) => visibleBones.has(boneIndex)),
    alternateActive: formBones.has(dominantBoneIndex) && visibleBones.has(dominantBoneIndex),
  };
}
