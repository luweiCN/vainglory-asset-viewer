const fs = require("fs");
const path = require("path");
const { findLayout } = require("./rsc0_mesh_to_obj");

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseSkeletonBuffer(buffer, source = "") {
  if (buffer.length < 4) throw new Error(`skeleton too small: ${source}`);

  const unknown = buffer.readUInt16LE(0);
  const boneCount = buffer.readUInt16LE(2);
  const hashStart = 4;
  const parentStart = hashStart + boneCount * 4;
  const transformStart = parentStart + boneCount * 2;
  const expectedSize = transformStart + boneCount * 48;

  if (boneCount <= 0 || boneCount > 512 || expectedSize !== buffer.length) {
    throw new Error(`unsupported skeleton layout: ${source}`);
  }

  const bones = [];
  for (let index = 0; index < boneCount; index += 1) {
    const hash = buffer.readUInt32LE(hashStart + index * 4);
    const parent = buffer.readInt16LE(parentStart + index * 2);
    const transformOffset = transformStart + index * 48;
    const values = [];
    for (let component = 0; component < 12; component += 1) {
      values.push(buffer.readFloatLE(transformOffset + component * 4));
    }

    const rotation = values.slice(0, 4);
    const translation = values.slice(4, 7);
    const scale = values.slice(8, 11);
    const extra = [values[7], values[11]];
    const rotationNorm = Math.sqrt(rotation.reduce((sum, value) => sum + value * value, 0));

    bones.push({
      index,
      hash: hash.toString(16).padStart(8, "0").toUpperCase(),
      parent,
      rotation: rotation.map((value) => round(value)),
      translation: translation.map((value) => round(value)),
      scale: scale.map((value) => round(value)),
      extra: extra.map((value) => round(value)),
      rotationNorm: round(rotationNorm),
    });
  }

  return {
    source: source ? normalizeRel(source) : "",
    unknown,
    boneCount,
    bones,
  };
}

function parseSkeletonFile(filePath) {
  return parseSkeletonBuffer(fs.readFileSync(filePath), filePath);
}

function readIntegerAttrComponent(buffer, base, attr, component) {
  const offset = base + attr.offset;
  if (attr.type === 1) return buffer.readUInt16LE(offset + component * 2);
  return buffer.readUInt8(offset + component);
}

function summarizeMeshSkin(meshPath) {
  const buffer = fs.readFileSync(meshPath);
  const layout = findLayout(buffer);
  if (!layout) throw new Error(`could not find mesh layout: ${meshPath}`);

  const weightAttr = layout.attrs.find((attr) => attr.semantic === 9 && attr.type === 4 && attr.count === 3);
  const jointAttr = layout.attrs.find((attr) => attr.semantic === 10 && attr.type === 1 && attr.count === 3);
  if (!weightAttr || !jointAttr) {
    return {
      source: normalizeRel(meshPath),
      vertexCount: layout.vertexCount,
      hasSkin: false,
    };
  }

  let maxJoint = 0;
  let invalidWeightCount = 0;
  const triplets = new Map();
  for (let index = 0; index < layout.vertexCount; index += 1) {
    const base = layout.vertexStart + index * layout.stride;
    const weights = [];
    const joints = [];
    for (let component = 0; component < 3; component += 1) {
      weights.push(buffer.readFloatLE(base + weightAttr.offset + component * 4));
      const joint = readIntegerAttrComponent(buffer, base, jointAttr, component);
      joints.push(joint);
      maxJoint = Math.max(maxJoint, joint);
    }

    const impliedWeight = 1 - weights.reduce((sum, value) => sum + value, 0);
    if (impliedWeight < -0.01 || impliedWeight > 1.01) invalidWeightCount += 1;

    const key = joints.join(",");
    triplets.set(key, (triplets.get(key) || 0) + 1);
  }

  return {
    source: normalizeRel(meshPath),
    vertexCount: layout.vertexCount,
    indexCount: layout.indexCount,
    stride: layout.stride,
    hasSkin: true,
    jointSemantic: jointAttr.semantic,
    weightSemantic: weightAttr.semantic,
    maxJoint,
    invalidWeightCount,
    uniqueJointTriplets: triplets.size,
    topJointTriplets: [...triplets.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 20)
      .map(([joints, count]) => ({ joints, count })),
  };
}

module.exports = {
  parseSkeletonBuffer,
  parseSkeletonFile,
  summarizeMeshSkin,
};
