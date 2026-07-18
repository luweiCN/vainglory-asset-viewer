#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const THREE = require("three");

const { parseAnimationFamily3Layout, readAnimationFamily3FramePose } = require("./animation_tools");

const defaultManifestPath = "extracted/viewer/skinned-glb-pbr-manifest.json";
const defaultBindingsPath = "extracted/viewer/skin-animation-bindings.json";
const defaultMappingPath = "extracted/viewer/animation-bone-mapping-manifest.json";
const defaultRuntimeAttachmentPath = "extracted/viewer/runtime-attachment-bones.json";
const defaultGlbRoot = "extracted/hero_assets_glb_skinned_pbr";
const defaultResourceRoot = "extracted/build_resources_by_path";
const defaultJsonOut = "extracted/reports/native_translation_auto_report.json";
const defaultTsvOut = "extracted/reports/native_translation_auto_report.tsv";

const MIN_NATIVE_TRANSLATION_COVERAGE = 0.5;
const AUTO_NATIVE_TRANSLATION_MAX_RATIO = 1.35;
const AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO = 1.65;
const AUTO_NATIVE_TRANSLATION_EDGE_MAX_RATIO = 1.4;
const AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW = 10;
const AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO = 1.45;
const AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO = 1.03;
const AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT = 6;
const OUTLIER_EDGE_RATIO_MIN = 2.0;
const OUTLIER_LIMIT = 8;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function optionList(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    values.push(...String(args[index + 1] || "").split(",").filter(Boolean));
  }
  return values;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function maxSize(summary) {
  if (!summary) return NaN;
  return Math.max(...summary.size.map((value) => Math.abs(value)).filter(Number.isFinite));
}

function nativeTranslationSafeActsLikeNone(safeMax, noneMax) {
  if (!Number.isFinite(safeMax) || !Number.isFinite(noneMax) || safeMax <= 0 || noneMax <= 0) return false;
  return (
    safeMax <= noneMax * AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO &&
    noneMax <= safeMax * AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO
  );
}

function chooseAutoNativeTranslationMode({ bindMax, allMax, safeMax, noneMax, fallbackMode }) {
  if (!Number.isFinite(bindMax) || bindMax <= 0 || !Number.isFinite(allMax)) return fallbackMode;
  const maxAllowed = bindMax * AUTO_NATIVE_TRANSLATION_MAX_RATIO;
  const safeFits = Number.isFinite(safeMax) && safeMax <= maxAllowed;
  const noneFits = Number.isFinite(noneMax) && noneMax <= maxAllowed;
  const safeNearNone =
    Number.isFinite(safeMax) && Number.isFinite(noneMax) && safeMax <= noneMax * AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO;
  if (allMax <= maxAllowed) return "all";
  if (safeFits && safeMax < allMax) return "safe";
  if (safeNearNone && safeMax <= allMax) return "safe";
  if (noneFits && noneMax < allMax && (!Number.isFinite(safeMax) || noneMax <= safeMax)) return "none";
  if (Number.isFinite(safeMax) && safeMax < allMax) return "safe";
  if (Number.isFinite(noneMax) && noneMax < allMax && (!Number.isFinite(safeMax) || noneMax <= safeMax)) return "none";
  if (Number.isFinite(safeMax) && allMax <= safeMax) return "all";
  return "safe";
}

function nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio) {
  if (!Number.isFinite(allEdgeRatio)) return false;
  if (allEdgeRatio <= AUTO_NATIVE_TRANSLATION_EDGE_MAX_RATIO) return true;
  const baselines = [safeEdgeRatio, noneEdgeRatio].filter((value) => Number.isFinite(value) && value > 0);
  const baseline = baselines.length ? Math.min(...baselines) : NaN;
  return Number.isFinite(baseline) && allEdgeRatio <= baseline * AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO;
}

function chooseSampledNativeTranslationMode({
  bindMax,
  allMax,
  safeMax,
  noneMax,
  fallbackMode,
  allEdgeRatio,
  safeEdgeRatio,
  noneEdgeRatio,
  safeHasCoverage,
  modeChanges = false,
}) {
  const allEdgeIsSafe = nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio);
  const safeActsLikeNone = nativeTranslationSafeActsLikeNone(safeMax, noneMax);
  if (!safeHasCoverage && safeActsLikeNone) return "all";
  if (allEdgeIsSafe) return "all";
  if (
    safeHasCoverage &&
    Number.isFinite(safeMax) &&
    Number.isFinite(allMax) &&
    safeMax <= allMax * AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO
  ) {
    return "safe";
  }
  if (modeChanges) return "dynamic";
  if (safeActsLikeNone && allMax <= bindMax * AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO) return "all";
  return chooseAutoNativeTranslationMode({ bindMax, allMax, safeMax, noneMax, fallbackMode });
}

function autoModeReason({ mode, allEdgeRatio, safeEdgeRatio, noneEdgeRatio, safeHasCoverage, safeMax, noneMax }) {
  if (mode === "all" && nativeTranslationAllEdgeIsSafe(allEdgeRatio, safeEdgeRatio, noneEdgeRatio)) {
    return "all-clean-edge";
  }
  if (mode === "all" && !safeHasCoverage && nativeTranslationSafeActsLikeNone(safeMax, noneMax)) return "safe-missing";
  if (mode === "safe") return "safe-smaller-or-all-risky";
  if (mode === "dynamic") return "per-frame-mode-change";
  if (mode === "none") return "none-smaller";
  return "auto-fallback";
}

async function loadGltfScene(filePath) {
  globalThis.self = globalThis.self || globalThis;
  globalThis.ProgressEvent = globalThis.ProgressEvent || class ProgressEvent {};
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const originalWarn = console.warn;
  const originalError = console.error;
  const filterTextureWarning = (...args) => {
    if (String(args[0] || "").includes("THREE.GLTFLoader: Couldn't load texture")) return;
    return args;
  };
  console.warn = (...args) => {
    const filtered = filterTextureWarning(...args);
    if (filtered) originalWarn(...filtered);
  };
  console.error = (...args) => {
    const filtered = filterTextureWarning(...args);
    if (filtered) originalError(...filtered);
  };
  try {
    return await new Promise((resolve, reject) => loader.parse(arrayBuffer, "", (gltf) => resolve(gltf.scene), reject));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function cacheBaseTransforms(scene) {
  scene.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    child.bindMode = child.bindMode || "attached";
    for (const bone of child.skeleton.bones) {
      if (bone.userData.basePosition) continue;
      bone.userData.basePosition = bone.position.toArray();
      bone.userData.baseRotation = bone.quaternion.toArray();
      bone.userData.baseScale = bone.scale.toArray();
    }
  });
}

function resetBone(bone) {
  bone.position.fromArray(bone.userData.basePosition);
  bone.quaternion.fromArray(bone.userData.baseRotation);
  if (bone.quaternion.lengthSq() > 0.000001) bone.quaternion.normalize();
  bone.scale.fromArray(bone.userData.baseScale);
}

function resetSceneBones(scene) {
  const bones = new Set();
  scene.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    for (const bone of child.skeleton.bones) bones.add(bone);
  });
  for (const bone of bones) resetBone(bone);
  scene.traverse((child) => {
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
  });
  scene.updateMatrixWorld(true);
}

function lerpArray(left, right, alpha) {
  return left.map((value, index) => value + (right[index] - value) * alpha);
}

function applyPoseToBone(bone, pose) {
  resetBone(bone);
  if (pose.translation) bone.position.fromArray(pose.translation);
  if (pose.rotation) {
    bone.quaternion.fromArray(pose.rotation);
    if (bone.quaternion.lengthSq() > 0.000001) bone.quaternion.normalize();
  }
}

function applyPose(scene, poseByIndex) {
  scene.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    const bones = child.skeleton.bones;
    for (const bone of bones) resetBone(bone);
    if (poseByIndex.size < Math.ceil(bones.length * 0.75)) {
      child.skeleton.update();
      return;
    }
    for (const [boneIndex, pose] of poseByIndex.entries()) {
      const bone = bones[boneIndex];
      if (bone) applyPoseToBone(bone, pose);
    }
    child.skeleton.update();
  });
  scene.updateMatrixWorld(true);
}

function interpolatePose(left, right, alpha) {
  const leftQuaternion = new THREE.Quaternion().fromArray(left.quaternion);
  const rightQuaternion = new THREE.Quaternion().fromArray(right.quaternion);
  if (leftQuaternion.lengthSq() > 0.000001) leftQuaternion.normalize();
  if (rightQuaternion.lengthSq() > 0.000001) rightQuaternion.normalize();
  leftQuaternion.slerp(rightQuaternion, alpha);
  return {
    boneIndex: left.trackIndex,
    rotation: leftQuaternion.toArray(),
    translation: lerpArray(left.translation, right.translation, alpha),
    scale: lerpArray(left.scale, right.scale, alpha),
  };
}

function poseByIndexAt(clip, timeSeconds, mode, safeBones, unsafeBones = new Set()) {
  const framePosition = (timeSeconds * clip.layout.fps) % clip.layout.frameCount;
  const frameIndex = Math.floor(framePosition);
  const nextFrameIndex = (frameIndex + 1) % clip.layout.frameCount;
  const alpha = framePosition - frameIndex;
  const frame = readAnimationFamily3FramePose(clip.buffer, frameIndex);
  const nextFrame = readAnimationFamily3FramePose(clip.buffer, nextFrameIndex);
  const poseByIndex = new Map();

  for (let index = 0; index < frame.length; index += 1) {
    const pose = interpolatePose(frame[index], nextFrame[index], alpha);
    if (
      unsafeBones.has(pose.boneIndex) ||
      mode === "none" ||
      (mode === "safe" && !safeBones.has(pose.boneIndex))
    ) {
      pose.translation = null;
    }
    if (pose.rotation.every(Number.isFinite)) poseByIndex.set(pose.boneIndex, pose);
  }
  return poseByIndex;
}

function skinnedBounds(scene) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  let vertexCount = 0;

  scene.traverse((child) => {
    if (!child.visible || !child.isMesh || !child.geometry) return;
    const position = child.geometry.getAttribute("position");
    if (!position) return;
    if (child.isSkinnedMesh && child.skeleton) child.skeleton.update();
    const indexAttribute = child.geometry.index;
    const indices = indexAttribute
      ? [...new Set(Array.from({ length: indexAttribute.count }, (_, index) => indexAttribute.getX(index)))]
      : Array.from({ length: position.count }, (_, index) => index);
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);
    for (const index of indices) {
      vertex.fromBufferAttribute(position, index);
      if (child.isSkinnedMesh && child.skeleton) applyBoneTransform(index, vertex);
      child.localToWorld(vertex);
      bounds.expandByPoint(vertex);
      vertexCount += 1;
    }
  });

  if (!vertexCount) return null;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  return {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    size: size.toArray(),
    center: center.toArray(),
    vertexCount,
  };
}

function skinnedMaxEdgeRatio(scene) {
  let maxRatio = NaN;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const rawA = new THREE.Vector3();
  const rawB = new THREE.Vector3();
  const rawC = new THREE.Vector3();

  scene.traverse((child) => {
    if (!child.visible || !child.isSkinnedMesh || !child.skeleton || !child.geometry?.index) return;
    const position = child.geometry.getAttribute("position");
    if (!position) return;
    child.skeleton.update();
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);
    const transformedVertex = (target, index, skinned = true) => {
      target.fromBufferAttribute(position, index);
      if (skinned) applyBoneTransform(index, target);
      child.localToWorld(target);
    };
    const indexAttribute = child.geometry.index;
    for (let offset = 0; offset + 2 < indexAttribute.count; offset += 3) {
      const ia = indexAttribute.getX(offset);
      const ib = indexAttribute.getX(offset + 1);
      const ic = indexAttribute.getX(offset + 2);
      transformedVertex(a, ia);
      transformedVertex(b, ib);
      transformedVertex(c, ic);
      transformedVertex(rawA, ia, false);
      transformedVertex(rawB, ib, false);
      transformedVertex(rawC, ic, false);
      const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const rawMaxEdge = Math.max(rawA.distanceTo(rawB), rawB.distanceTo(rawC), rawC.distanceTo(rawA));
      if (rawMaxEdge <= AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW) continue;
      const ratio = maxEdge / rawMaxEdge;
      maxRatio = Number.isFinite(maxRatio) ? Math.max(maxRatio, ratio) : ratio;
    }
  });

  return maxRatio;
}

function sampleModeAt(scene, clip, mode, safeBones, unsafeBones, timeSeconds) {
  resetSceneBones(scene);
  applyPose(scene, poseByIndexAt(clip, timeSeconds, mode, safeBones, unsafeBones));
  return {
    max: maxSize(skinnedBounds(scene)),
    edgeRatio: skinnedMaxEdgeRatio(scene),
  };
}

function sampleMode(scene, clip, mode, safeBones, unsafeBones = new Set()) {
  let sampledMax = NaN;
  let sampledEdgeRatio = NaN;
  let maxTime = 0;
  let edgeTime = 0;
  for (let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleTime = ((clip.duration || clip.layout.frameCount / clip.layout.fps) * sampleIndex) / AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;
    const sample = sampleModeAt(scene, clip, mode, safeBones, unsafeBones, sampleTime);
    if (Number.isFinite(sample.max) && (!Number.isFinite(sampledMax) || sample.max > sampledMax)) {
      sampledMax = sample.max;
      maxTime = sampleTime;
    }
    if (Number.isFinite(sample.edgeRatio)) {
      if (!Number.isFinite(sampledEdgeRatio) || sample.edgeRatio > sampledEdgeRatio) {
        sampledEdgeRatio = sample.edgeRatio;
        edgeTime = sampleTime;
      }
    }
  }
  return { max: sampledMax, edgeRatio: sampledEdgeRatio, maxTime, edgeTime };
}

function vertexSkinInfo(mesh, vertexIndex) {
  const joints = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  if (!joints || !weights) return { vertexIndex, influences: [] };

  const influences = [];
  for (let component = 0; component < 4; component += 1) {
    const joint = Number(joints.getComponent(vertexIndex, component));
    const weight = Number(weights.getComponent(vertexIndex, component)) || 0;
    if (!Number.isInteger(joint) || weight <= 0.001) continue;
    influences.push({
      joint,
      weight: round(weight, 4),
      boneName: mesh.skeleton?.bones?.[joint]?.name || "",
    });
  }
  influences.sort((left, right) => right.weight - left.weight);
  return { vertexIndex, influences };
}

function materialNameForTriangle(mesh, offset) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const group = (mesh.geometry?.groups || []).find((item) => offset >= item.start && offset < item.start + item.count);
  const materialIndex = Number.isInteger(group?.materialIndex) ? group.materialIndex : 0;
  return materials[materialIndex]?.name || "";
}

function skinnedEdgeOutliers(scene, { limit = OUTLIER_LIMIT, minRatio = OUTLIER_EDGE_RATIO_MIN } = {}) {
  const outliers = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const rawA = new THREE.Vector3();
  const rawB = new THREE.Vector3();
  const rawC = new THREE.Vector3();

  function pushOutlier(record) {
    outliers.push(record);
    outliers.sort((left, right) => right.ratio - left.ratio);
    if (outliers.length > limit) outliers.length = limit;
  }

  scene.traverse((child) => {
    if (!child.visible || !child.isSkinnedMesh || !child.skeleton || !child.geometry?.index) return;
    const position = child.geometry.getAttribute("position");
    if (!position) return;
    child.skeleton.update();
    const applyBoneTransform = child.applyBoneTransform?.bind(child) || child.boneTransform?.bind(child);
    const transformedVertex = (target, index, skinned = true) => {
      target.fromBufferAttribute(position, index);
      if (skinned) applyBoneTransform(index, target);
      child.localToWorld(target);
    };
    const indexAttribute = child.geometry.index;
    for (let offset = 0; offset + 2 < indexAttribute.count; offset += 3) {
      const ia = indexAttribute.getX(offset);
      const ib = indexAttribute.getX(offset + 1);
      const ic = indexAttribute.getX(offset + 2);
      transformedVertex(a, ia);
      transformedVertex(b, ib);
      transformedVertex(c, ic);
      transformedVertex(rawA, ia, false);
      transformedVertex(rawB, ib, false);
      transformedVertex(rawC, ic, false);
      const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const rawMaxEdge = Math.max(rawA.distanceTo(rawB), rawB.distanceTo(rawC), rawC.distanceTo(rawA));
      if (rawMaxEdge <= AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW) continue;
      const ratio = maxEdge / rawMaxEdge;
      if (ratio < minRatio) continue;
      const vertices = [vertexSkinInfo(child, ia), vertexSkinInfo(child, ib), vertexSkinInfo(child, ic)];
      const joints = [
        ...new Set(vertices.flatMap((vertex) => vertex.influences.slice(0, 2).map((influence) => influence.joint))),
      ].sort((left, right) => left - right);
      pushOutlier({
        mesh: child.name || child.parent?.name || "mesh",
        materialName: materialNameForTriangle(child, offset),
        triangle: offset / 3,
        indices: [ia, ib, ic],
        ratio: round(ratio, 4),
        maxEdge: round(maxEdge),
        rawMaxEdge: round(rawMaxEdge),
        joints,
        vertices,
      });
    }
  });

  return outliers;
}

function runtimeAttachmentEvidenceByBone(runtimeAttachmentItem) {
  const evidence = new Map();
  for (const entry of runtimeAttachmentItem?.evidence || []) {
    evidence.set(Number(entry.boneIndex), entry);
  }
  return evidence;
}

function summarizeOutlierBones(outliers, runtimeAttachmentItem) {
  const evidence = runtimeAttachmentEvidenceByBone(runtimeAttachmentItem);
  const byBone = new Map();
  for (const outlier of outliers || []) {
    for (const joint of outlier.joints || []) {
      const item = evidence.get(joint);
      if (!byBone.has(joint)) {
        byBone.set(joint, {
          boneIndex: joint,
          boneName:
            outlier.vertices
              ?.flatMap((vertex) => vertex.influences || [])
              .find((influence) => influence.joint === joint)?.boneName || "",
          reasons: item?.reasons || [],
          bindToken: item?.bindToken || "",
          count: 0,
          maxRatio: 0,
        });
      }
      const record = byBone.get(joint);
      record.count += 1;
      record.maxRatio = Math.max(record.maxRatio, Number(outlier.ratio) || 0);
    }
  }

  return [...byBone.values()]
    .sort((left, right) => right.maxRatio - left.maxRatio || right.count - left.count || left.boneIndex - right.boneIndex)
    .map((record) => {
      const details = [
        `${record.boneIndex}:${record.boneName || "bone"}`,
        record.bindToken ? `bind=${record.bindToken}` : "",
        record.reasons?.length ? `reasons=${record.reasons.join("+")}` : "",
        `hits=${record.count}`,
        `ratio=${round(record.maxRatio, 4)}`,
      ].filter(Boolean);
      return details.join(",");
    })
    .join(";");
}

function sampleOutliersAt(scene, clip, mode, safeBones, unsafeBones, timeSeconds, runtimeAttachmentItem) {
  resetSceneBones(scene);
  applyPose(scene, poseByIndexAt(clip, timeSeconds, mode, safeBones, unsafeBones));
  const outliers = skinnedEdgeOutliers(scene);
  return {
    summary: summarizeOutlierBones(outliers, runtimeAttachmentItem),
    items: outliers,
  };
}

function sampleModeChanges(scene, clip, safeBones, unsafeBones = new Set()) {
  let allWins = false;
  let safeWins = false;
  for (let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleTime = ((clip.duration || clip.layout.frameCount / clip.layout.fps) * sampleIndex) / AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;
    const allMax = sampleModeAt(scene, clip, "all", safeBones, unsafeBones, sampleTime).max;
    const safeMax = sampleModeAt(scene, clip, "safe", safeBones, unsafeBones, sampleTime).max;
    if (!Number.isFinite(allMax) || !Number.isFinite(safeMax)) continue;
    if (allMax <= safeMax) allWins = true;
    if (safeMax < allMax) safeWins = true;
  }
  return allWins && safeWins;
}

function safeBonesFor({ mapping, runtimeAttachmentItem }) {
  const output = new Set(Array.isArray(mapping?.nativeFrameBoneIndices) ? mapping.nativeFrameBoneIndices : []);
  for (const index of runtimeAttachmentItem?.translationBoneIndices || []) {
    if (Number.isInteger(index) && index >= 0) output.add(index);
  }
  return output;
}

function unsafeBonesFor(runtimeAttachmentItem) {
  const output = new Set();
  for (const index of runtimeAttachmentItem?.unsafeTranslationBoneIndices || []) {
    if (Number.isInteger(index) && index >= 0) output.add(index);
  }
  return output;
}

function hasSafeCoverage(mapping, safeBones) {
  const boneCount = Number(mapping?.boneCount) || 0;
  const nativeCount = Array.isArray(mapping?.nativeFrameBoneIndices) ? mapping.nativeFrameBoneIndices.length : 0;
  return (boneCount > 0 && nativeCount >= Math.ceil(boneCount * MIN_NATIVE_TRANSLATION_COVERAGE)) || safeBones.size > 0;
}

function buildIndexes({ bindings, mappings, runtimeAttachments }) {
  return {
    bindingsByRel: new Map((bindings.items || []).map((item) => [item.rel, item])),
    mappingsByAnimationAndSkeleton: new Map((mappings.items || []).map((item) => [`${item.animationPath}\t${item.skeletonPath}`, item])),
    runtimeAttachmentByRel: new Map((runtimeAttachments.items || []).map((item) => [item.rel, item])),
  };
}

function shouldIncludeItem(item, { models, characters }) {
  if (models.length && !models.includes(item.rel)) return false;
  if (characters.length && !characters.includes(item.character)) return false;
  return true;
}

function shouldIncludeAnimation(animation, actionPatterns) {
  if (!actionPatterns.length) return true;
  return actionPatterns.some((pattern) => {
    const regex = new RegExp(pattern, "i");
    return regex.test(animation.actionKey || "") || regex.test(animation.label || "") || regex.test(animation.targetRelativePath || "");
  });
}

async function evaluateItemAnimation({ item, animation, scene, indexes, glbRoot, resourceRoot, includeOutliers = false }) {
  const skeletonPath = item.resolvedSkeletonPath || item.skeletons?.[0] || "";
  const mapping = indexes.mappingsByAnimationAndSkeleton.get(`${animation.targetRelativePath}\t${skeletonPath}`) || null;
  const runtimeAttachmentItem = indexes.runtimeAttachmentByRel.get(item.rel);
  const safeBones = safeBonesFor({ mapping, runtimeAttachmentItem });
  const unsafeBones = unsafeBonesFor(runtimeAttachmentItem);
  const safeHasCoverage = hasSafeCoverage(mapping, safeBones);
  const fallbackMode = safeHasCoverage ? "safe" : "all";
  const animationFile = path.join(resourceRoot, animation.targetRelativePath);
  const buffer = fs.readFileSync(animationFile);
  const layout = parseAnimationFamily3Layout(buffer);
  const clip = { buffer, layout, duration: Number(animation.duration) || layout.frameCount / layout.fps };

  resetSceneBones(scene);
  const bindMax = maxSize(skinnedBounds(scene));
  const all = sampleMode(scene, clip, "all", safeBones, unsafeBones);
  const safe = sampleMode(scene, clip, "safe", safeBones, unsafeBones);
  const none = sampleMode(scene, clip, "none", safeBones, unsafeBones);
  const modeChanges = sampleModeChanges(scene, clip, safeBones, unsafeBones);
  const autoMode = chooseSampledNativeTranslationMode({
    bindMax,
    allMax: all.max,
    safeMax: safe.max,
    noneMax: none.max,
    fallbackMode,
    allEdgeRatio: all.edgeRatio,
    safeEdgeRatio: safe.edgeRatio,
    noneEdgeRatio: none.edgeRatio,
    safeHasCoverage,
    modeChanges,
  });

  const row = {
    rel: item.rel,
    character: item.character || "",
    modelLabel: item.modelLabel || "",
    skeletonPath,
    animationLabel: animation.label || "",
    actionKey: animation.actionKey || "",
    animationPath: animation.targetRelativePath,
    trackCount: layout.trackCount,
    safeBoneCount: safeBones.size,
    unsafeBoneCount: unsafeBones.size,
    nativeSafeBoneCount: Array.isArray(mapping?.nativeFrameBoneIndices) ? mapping.nativeFrameBoneIndices.length : 0,
    runtimeSafeBoneCount: runtimeAttachmentItem?.translationBoneIndices?.length || 0,
    safeHasCoverage: safeHasCoverage ? "yes" : "no",
    fallbackMode,
    autoMode,
    reason: autoModeReason({
      mode: autoMode,
      allEdgeRatio: all.edgeRatio,
      safeEdgeRatio: safe.edgeRatio,
      noneEdgeRatio: none.edgeRatio,
      safeHasCoverage,
      safeMax: safe.max,
      noneMax: none.max,
    }),
    bindMax: round(bindMax),
    allMax: round(all.max),
    safeMax: round(safe.max),
    noneMax: round(none.max),
    allEdgeRatio: round(all.edgeRatio, 4),
    safeEdgeRatio: round(safe.edgeRatio, 4),
    noneEdgeRatio: round(none.edgeRatio, 4),
    allWorstTime: round(all.edgeTime),
    safeWorstTime: round(safe.edgeTime),
    noneWorstTime: round(none.edgeTime),
    modeChanges: modeChanges ? "yes" : "no",
    glbFile: path.join(glbRoot, item.rel),
  };

  if (includeOutliers) {
    const allOutliers = sampleOutliersAt(scene, clip, "all", safeBones, unsafeBones, all.edgeTime, runtimeAttachmentItem);
    const safeOutliers = sampleOutliersAt(scene, clip, "safe", safeBones, unsafeBones, safe.edgeTime, runtimeAttachmentItem);
    const noneOutliers = sampleOutliersAt(scene, clip, "none", safeBones, unsafeBones, none.edgeTime, runtimeAttachmentItem);
    row.allOutlierBones = allOutliers.summary;
    row.safeOutlierBones = safeOutliers.summary;
    row.noneOutlierBones = noneOutliers.summary;
    row.allOutliers = allOutliers.items;
    row.safeOutliers = safeOutliers.items;
    row.noneOutliers = noneOutliers.items;
  }

  return row;
}

async function buildNativeTranslationAutoReport(options = {}) {
  const manifest = readJson(options.manifestPath || defaultManifestPath, { items: [] });
  const bindings = readJson(options.bindingsPath || defaultBindingsPath, { items: [] });
  const mappings = readJson(options.mappingPath || defaultMappingPath, { items: [] });
  const runtimeAttachments = readJson(options.runtimeAttachmentPath || defaultRuntimeAttachmentPath, { items: [] });
  const indexes = buildIndexes({ bindings, mappings, runtimeAttachments });
  const models = options.models || [];
  const characters = options.characters || [];
  const actionPatterns = options.actions || [];
  const limit = Number.isFinite(options.limit) ? options.limit : 30;
  const rows = [];

  for (const item of manifest.items || []) {
    if (!shouldIncludeItem(item, { models, characters })) continue;
    const binding = indexes.bindingsByRel.get(item.rel);
    const animations = (binding?.animations || []).filter((animation) => animation.trackMatchesSkeleton);
    const selectedAnimations = animations.filter((animation) => shouldIncludeAnimation(animation, actionPatterns));
    if (!selectedAnimations.length) continue;
    const glbFile = path.join(options.glbRoot || defaultGlbRoot, item.rel);
    if (!fs.existsSync(glbFile)) continue;
    const scene = await loadGltfScene(glbFile);
    cacheBaseTransforms(scene);
    for (const animation of selectedAnimations) {
      rows.push(
        await evaluateItemAnimation({
          item,
          animation,
          scene,
          indexes,
          glbRoot: options.glbRoot || defaultGlbRoot,
          resourceRoot: options.resourceRoot || defaultResourceRoot,
          includeOutliers: Boolean(options.includeOutliers),
        }),
      );
      if (limit > 0 && rows.length >= limit) return rows;
    }
  }

  return rows;
}

function parseCliOptions(args) {
  const limitRaw = optionValue(args, "--limit", "30");
  return {
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    bindingsPath: optionValue(args, "--bindings", defaultBindingsPath),
    mappingPath: optionValue(args, "--mapping", defaultMappingPath),
    runtimeAttachmentPath: optionValue(args, "--runtime-attachments", defaultRuntimeAttachmentPath),
    glbRoot: optionValue(args, "--glb-root", defaultGlbRoot),
    resourceRoot: optionValue(args, "--resource-root", defaultResourceRoot),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    models: optionList(args, "--model"),
    characters: optionList(args, "--character"),
    actions: optionList(args, "--action"),
    limit: Number(limitRaw),
    includeOutliers: args.includes("--include-outliers"),
  };
}

if (require.main === module) {
  const options = parseCliOptions(process.argv.slice(2));
  buildNativeTranslationAutoReport(options)
    .then((rows) => {
      fs.mkdirSync(path.dirname(options.jsonOut), { recursive: true });
      fs.writeFileSync(options.jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2)}\n`);
      writeTsv(options.tsvOut, rows, [
        "rel",
        "character",
        "modelLabel",
        "animationLabel",
        "actionKey",
        "animationPath",
        "autoMode",
        "reason",
        "safeBoneCount",
        "unsafeBoneCount",
        "nativeSafeBoneCount",
        "runtimeSafeBoneCount",
        "safeHasCoverage",
        "bindMax",
        "allMax",
        "safeMax",
        "noneMax",
        "allEdgeRatio",
        "safeEdgeRatio",
        "noneEdgeRatio",
        "allWorstTime",
        "safeWorstTime",
        "noneWorstTime",
        "allOutlierBones",
        "safeOutlierBones",
        "noneOutlierBones",
        "modeChanges",
      ]);
      const modes = rows.reduce((acc, row) => {
        acc[row.autoMode] = (acc[row.autoMode] || 0) + 1;
        return acc;
      }, {});
      console.log(JSON.stringify({ rows: rows.length, modes, jsonOut: options.jsonOut, tsvOut: options.tsvOut }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  buildNativeTranslationAutoReport,
  chooseAutoNativeTranslationMode,
  chooseSampledNativeTranslationMode,
  nativeTranslationAllEdgeIsSafe,
  nativeTranslationSafeActsLikeNone,
  summarizeOutlierBones,
  unsafeBonesFor,
};
