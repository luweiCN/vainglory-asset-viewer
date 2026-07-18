export const MODEL_FORM_MODE = Object.freeze({
  FOLLOW: "follow",
  PRIMARY: "primary",
  ALTERNATE: "alternate",
  BOTH: "both",
});

const MODEL_FORM_PROFILES = new Map([
  [
    "SAW_Skin_Tank",
    {
      skinId: "SAW_Skin_Tank",
      strategy: "geometry",
      defaultMode: MODEL_FORM_MODE.PRIMARY,
      supportsFollowAnimation: false,
      primaryLabel: "人形",
      alternateLabel: "坦克形态",
      alternateBoneHashes: ["4A59660D"],
      primaryAnimationPath: "Characters/SAW/Art/saw.idle.anim",
      alternateAnimationPath: "",
    },
  ],
]);

export function modelFormProfileForSkinId(skinId) {
  return MODEL_FORM_PROFILES.get(String(skinId || "")) || null;
}

function attributeComponent(attribute, index, component) {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  if (component === 3) return attribute.getW(index);
  return 0;
}

function dominantJointIndex(skinIndex, skinWeight, vertexIndex) {
  const components = Math.min(4, skinIndex.itemSize, skinWeight.itemSize);
  let jointIndex = null;
  let jointWeight = 0;
  for (let component = 0; component < components; component += 1) {
    const weight = Number(attributeComponent(skinWeight, vertexIndex, component)) || 0;
    if (weight <= jointWeight) continue;
    jointIndex = Math.round(attributeComponent(skinIndex, vertexIndex, component));
    jointWeight = weight;
  }
  return jointIndex;
}

export function splitModelFormIndexArrays({ index, skinIndex, skinWeight, alternateBoneIndices }) {
  if (!index || !skinIndex || !skinWeight || !(alternateBoneIndices instanceof Set)) return null;
  const primary = [];
  const alternate = [];
  for (let cursor = 0; cursor + 2 < index.count; cursor += 3) {
    const triangle = [index.getX(cursor), index.getX(cursor + 1), index.getX(cursor + 2)];
    const alternateVertices = triangle.filter((vertexIndex) =>
      alternateBoneIndices.has(dominantJointIndex(skinIndex, skinWeight, vertexIndex)),
    ).length;
    if (alternateVertices > 0 && alternateVertices < 3) return null;
    (alternateVertices === 3 ? alternate : primary).push(...triangle);
  }
  const IndexArray = index.array.constructor;
  return {
    original: index.array.slice(),
    primary: IndexArray.from(primary),
    alternate: IndexArray.from(alternate),
  };
}
