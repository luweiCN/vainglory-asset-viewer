#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { readMeshForGlb } = require("./rsc0_mesh_to_obj");
const { parseSkeletonFile } = require("./skeleton_tools");
const { engineHashHex } = require("./engine_hash");

const defaultManifestPath = "extracted/viewer/skinned-glb-pbr-manifest.json";
const defaultRuntimeConfigPath = "extracted/viewer/runtime-binding-config.json";
const defaultNativeExtraTransformTsv = "extracted/reports/native_attachment_extra_transform_chain.tsv";
const defaultResourceRoot = "extracted/build_resources_by_path";
const defaultJsonOut = "extracted/viewer/runtime-attachment-bones.json";
const defaultTsvOut = "extracted/reports/runtime_attachment_bones.tsv";

const MIN_ROOT_ATTACHMENT_VERTICES = 120;
const MIN_ROOT_ATTACHMENT_HORIZONTAL_OFFSET = 55;
const MIN_ROOT_ATTACHMENT_LARGE_OFFSET_VERTICES = 20;
const MIN_ROOT_ATTACHMENT_LARGE_HORIZONTAL_OFFSET = 90;
const MIN_AUX_ROOT_ATTACHMENT_VERTICES = 180;
const MIN_DESCENDANT_VERTICES = 20;
const TRANSLATION_UNSAFE_EFFECT_MATERIAL_PATTERN = /guob/i;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function runtimeLookupKeysForItem(item) {
  if (!item?.rel) return [];
  return [
    `${item.rel || ""}\t${item.sourceRelativePath || ""}\t${item.modelLabel || ""}`,
    `${item.rel || ""}\t${item.sourceRelativePath || ""}\t`,
    `${item.rel || ""}\t\t${item.modelLabel || ""}`,
    `${item.rel || ""}\t\t`,
    item.rel,
  ];
}

function buildRuntimeLookup(items) {
  const lookup = new Map();
  for (const item of items || []) {
    for (const key of runtimeLookupKeysForItem(item)) {
      if (!lookup.has(key)) lookup.set(key, item);
    }
  }
  return lookup;
}

function runtimeConfigForItem(item, runtimeLookup) {
  for (const key of runtimeLookupKeysForItem(item)) {
    const match = runtimeLookup.get(key);
    if (match) return match;
  }
  return null;
}

function isRuntimeAttachmentSlot(slot) {
  const slotName = slot?.slotName || "";
  const bindToken = slot?.bindToken || "";
  if (!slotName || !bindToken) return false;
  return !/(Head|CenterMass)/i.test(slotName) && !/(head|spine|center|root)[A-Za-z0-9_]*_bnd/i.test(bindToken);
}

function isWeaponLikeRuntimeSlot(slot) {
  const text = `${slot?.slotName || ""} ${slot?.bindToken || ""}`.toLowerCase();
  return /(weapon|sword|shield|staff|gun|blade|bow|cannon|rifle|hammer|axe|orb|wing|fx|aura)/.test(text);
}

function isPhysicalAttachmentRuntimeSlot(slot) {
  const text = `${slot?.slotName || ""} ${slot?.bindToken || ""}`.toLowerCase();
  return /(weapon|sword|shield|staff|gun|blade|bow|cannon|rifle|hammer|axe|orb|wing)/.test(text);
}

function addEvidence(evidence, boneIndex, reason, detail = {}) {
  if (!Number.isInteger(boneIndex) || boneIndex < 0) return;
  if (!evidence.has(boneIndex)) {
    evidence.set(boneIndex, {
      boneIndex,
      reasons: [],
      dominantVertexCount: detail.dominantVertexCount || 0,
      parent: detail.parent ?? "",
      translation: detail.translation || "",
      hash: detail.hash || "",
      bindToken: detail.bindToken || "",
    });
  }
  const entry = evidence.get(boneIndex);
  if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
  if (detail.dominantVertexCount > entry.dominantVertexCount) entry.dominantVertexCount = detail.dominantVertexCount;
  if (detail.parent != null) entry.parent = detail.parent;
  if (detail.translation) entry.translation = detail.translation;
  if (detail.hash) entry.hash = detail.hash;
  if (detail.bindToken) entry.bindToken = detail.bindToken;
}

function addUnsafeEvidence(evidence, boneIndex, reason, detail = {}) {
  if (!Number.isInteger(boneIndex) || boneIndex < 0) return;
  if (!evidence.has(boneIndex)) {
    evidence.set(boneIndex, {
      boneIndex,
      reasons: [],
      materialName: detail.materialName || "",
    });
  }
  const entry = evidence.get(boneIndex);
  if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
  if (detail.materialName && !entry.materialName.includes(detail.materialName)) {
    entry.materialName = entry.materialName ? `${entry.materialName}|${detail.materialName}` : detail.materialName;
  }
}

function dominantJointCounts(mesh) {
  const counts = new Map();
  if (!mesh?.joints || !mesh?.weights) return counts;

  const vertexCount = mesh.joints.length / 4;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    let dominantJoint = null;
    let dominantWeight = 0;
    for (let component = 0; component < 4; component += 1) {
      const joint = Number(mesh.joints[vertexIndex * 4 + component]);
      const weight = Number(mesh.weights[vertexIndex * 4 + component]) || 0;
      if (!Number.isInteger(joint) || weight <= dominantWeight) continue;
      dominantJoint = joint;
      dominantWeight = weight;
    }
    if (dominantJoint == null || dominantWeight <= 0) continue;
    counts.set(dominantJoint, (counts.get(dominantJoint) || 0) + 1);
  }

  return counts;
}

function primitiveDominantJoints(mesh, primitive) {
  const joints = new Set();
  if (Array.isArray(primitive?.jointPalette) && primitive.jointPalette.length) {
    for (const joint of primitive.jointPalette) {
      const index = Number(joint);
      if (Number.isInteger(index) && index >= 0) joints.add(index);
    }
    return joints;
  }

  if (!mesh?.joints || !mesh?.weights || !Array.isArray(primitive?.indices)) return joints;
  for (const vertexIndex of primitive.indices) {
    let dominantJoint = null;
    let dominantWeight = 0;
    for (let component = 0; component < 4; component += 1) {
      const joint = Number(mesh.joints[vertexIndex * 4 + component]);
      const weight = Number(mesh.weights[vertexIndex * 4 + component]) || 0;
      if (!Number.isInteger(joint) || weight <= dominantWeight) continue;
      dominantJoint = joint;
      dominantWeight = weight;
    }
    if (dominantJoint != null && dominantWeight > 0) joints.add(dominantJoint);
  }
  return joints;
}

function inferUnsafeTranslationBones(mesh) {
  const evidence = new Map();
  for (const primitive of mesh?.primitives || []) {
    const materialName = primitive?.materialName || "";
    if (!TRANSLATION_UNSAFE_EFFECT_MATERIAL_PATTERN.test(materialName)) continue;
    for (const boneIndex of primitiveDominantJoints(mesh, primitive)) {
      addUnsafeEvidence(evidence, boneIndex, "effect-material-primitive", { materialName });
    }
  }
  return [...evidence.values()].sort((left, right) => left.boneIndex - right.boneIndex);
}

function childrenByBoneIndex(skeleton) {
  const children = new Map();
  for (const bone of skeleton?.bones || []) children.set(bone.index, []);
  for (const bone of skeleton?.bones || []) {
    if (bone.parent >= 0 && children.has(bone.parent)) children.get(bone.parent).push(bone.index);
  }
  return children;
}

function boneDetail(bone, counts) {
  return {
    dominantVertexCount: counts.get(bone.index) || 0,
    parent: bone.parent,
    translation: Array.isArray(bone.translation) ? bone.translation.map((value) => Number(value).toFixed(3)).join(",") : "",
    hash: bone.hash || "",
  };
}

function horizontalOffset(bone) {
  const translation = bone?.translation || [];
  return Math.hypot(Number(translation[0]) || 0, Number(translation[2]) || 0);
}

function isBodyRootBone(bone) {
  if (!bone || bone.index !== 1) return false;
  const offset = horizontalOffset(bone);
  const y = Math.abs(Number(bone.translation?.[1]) || 0);
  return offset < 35 && y > 50;
}

function isInferredRootAttachmentBone(bone, counts) {
  if (!bone || bone.parent !== 0 || isBodyRootBone(bone)) return false;
  const dominantCount = counts.get(bone.index) || 0;
  const offset = horizontalOffset(bone);

  if (dominantCount >= MIN_ROOT_ATTACHMENT_VERTICES && offset >= MIN_ROOT_ATTACHMENT_HORIZONTAL_OFFSET) return true;
  if (dominantCount >= MIN_ROOT_ATTACHMENT_LARGE_OFFSET_VERTICES && offset >= MIN_ROOT_ATTACHMENT_LARGE_HORIZONTAL_OFFSET) return true;
  if (bone.index >= 40 && dominantCount >= MIN_AUX_ROOT_ATTACHMENT_VERTICES) return true;
  return false;
}

function addDescendantAttachmentBones(seedIndex, skeleton, children, counts, evidence, reason) {
  const stack = [...(children.get(seedIndex) || [])];
  const seen = new Set();
  while (stack.length) {
    const boneIndex = stack.pop();
    if (seen.has(boneIndex)) continue;
    seen.add(boneIndex);
    const bone = skeleton.bones[boneIndex];
    if (!bone) continue;
    const dominantCount = counts.get(boneIndex) || 0;
    if (dominantCount >= MIN_DESCENDANT_VERTICES || children.get(boneIndex)?.length) {
      addEvidence(evidence, boneIndex, reason, boneDetail(bone, counts));
    }
    stack.push(...(children.get(boneIndex) || []));
  }
}

function nativeExtraTransformBindTokensFromRows(rows) {
  return [
    ...new Set(
      (rows || [])
        .filter((row) => row.stage === "binding-token-registration" && row.kind === "multi-bind-extra-transform-object")
        .map((row) => row.bindToken)
        .filter(Boolean),
    ),
  ];
}

function addNativeExtraTransformBones(nativeExtraTransformBindTokens, skeleton, counts, evidence) {
  const bindTokenByHash = new Map(
    (nativeExtraTransformBindTokens || []).filter(Boolean).map((bindToken) => [engineHashHex(bindToken), bindToken]),
  );
  if (!bindTokenByHash.size) return;

  for (const bone of skeleton.bones || []) {
    const bindToken = bindTokenByHash.get(bone.hash);
    if (!bindToken) continue;
    addEvidence(evidence, bone.index, "native-extra-transform-bind-token", {
      ...boneDetail(bone, counts),
      bindToken,
    });
  }
}

function inferRuntimeAttachmentBones({ item, mesh, skeleton, runtimeConfig, nativeExtraTransformBindTokens = [] }) {
  const counts = dominantJointCounts(mesh);
  const children = childrenByBoneIndex(skeleton);
  const evidence = new Map();
  const unsafeEvidence = inferUnsafeTranslationBones(mesh);
  const descendantSeeds = new Set();

  for (const slot of runtimeConfig?.slots || []) {
    if (!isRuntimeAttachmentSlot(slot)) continue;
    if (slot.bindingKind && slot.bindingKind !== "skeleton-bone") continue;
    const boneIndex = Number(slot.resolvedBoneIndex);
    if (!Number.isInteger(boneIndex) || boneIndex < 0) continue;
    const bone = skeleton.bones[boneIndex];
    addEvidence(evidence, boneIndex, "runtime-bind-slot", bone ? boneDetail(bone, counts) : {});
    if (isPhysicalAttachmentRuntimeSlot(slot)) descendantSeeds.add(boneIndex);
  }

  addNativeExtraTransformBones(nativeExtraTransformBindTokens, skeleton, counts, evidence);

  for (const bone of skeleton.bones || []) {
    if (!isInferredRootAttachmentBone(bone, counts)) continue;
    addEvidence(evidence, bone.index, "mesh-skin-root-attachment", boneDetail(bone, counts));
    descendantSeeds.add(bone.index);
  }

  for (const boneIndex of descendantSeeds) {
    addDescendantAttachmentBones(boneIndex, skeleton, children, counts, evidence, "attachment-descendant");
  }

  const evidenceRows = [...evidence.values()].sort((left, right) => left.boneIndex - right.boneIndex);
  return {
    rel: item.rel,
    character: item.character || "",
    modelLabel: item.modelLabel || item.variant || "",
    sourceRelativePath: item.sourceRelativePath || "",
    meshPath: item.meshPath || item.sourceMeshPath || "",
    skeletonPath: item.resolvedSkeletonPath || item.skeletons?.[0] || "",
    translationBoneIndices: evidenceRows.map((entry) => entry.boneIndex),
    unsafeTranslationBoneIndices: unsafeEvidence.map((entry) => entry.boneIndex),
    configuredTranslationBoneIndices: evidenceRows
      .filter((entry) => entry.reasons.includes("runtime-bind-slot") || entry.reasons.includes("native-extra-transform-bind-token"))
      .map((entry) => entry.boneIndex),
    inferredTranslationBoneIndices: evidenceRows
      .filter((entry) => !entry.reasons.includes("runtime-bind-slot") && !entry.reasons.includes("native-extra-transform-bind-token"))
      .map((entry) => entry.boneIndex),
    evidence: evidenceRows.map((entry) => ({
      ...entry,
      reasons: entry.reasons.sort(),
    })),
    unsafeEvidence: unsafeEvidence.map((entry) => ({
      ...entry,
      reasons: entry.reasons.sort(),
    })),
  };
}

function runtimeAttachmentBoneRows(report) {
  const rows = [];
  for (const item of report.items || []) {
    for (const entry of item.evidence || []) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        meshPath: item.meshPath,
        skeletonPath: item.skeletonPath,
        boneIndex: entry.boneIndex,
        reasons: entry.reasons.join("|"),
        dominantVertexCount: entry.dominantVertexCount,
        parent: entry.parent,
        translation: entry.translation,
        hash: entry.hash,
        bindToken: entry.bindToken,
      });
    }
    for (const entry of item.unsafeEvidence || []) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        meshPath: item.meshPath,
        skeletonPath: item.skeletonPath,
        boneIndex: entry.boneIndex,
        reasons: entry.reasons.join("|"),
        dominantVertexCount: "",
        parent: "",
        translation: "",
        hash: "",
        bindToken: "",
        materialName: entry.materialName,
      });
    }
  }
  return rows;
}

function summarizeRuntimeAttachmentBoneReport(report) {
  let translationBoneRefs = 0;
  let configuredBoneRefs = 0;
  let inferredOnlyBoneRefs = 0;
  let rootHeuristicOnlyBoneRefs = 0;
  let descendantOnlyBoneRefs = 0;
  let unsafeTranslationBoneRefs = 0;
  let highRiskItems = 0;

  for (const item of report.items || []) {
    let itemHasInferredOnly = false;
    for (const entry of item.evidence || []) {
      const reasons = new Set(entry.reasons || []);
      const configured = reasons.has("runtime-bind-slot") || reasons.has("native-extra-transform-bind-token");
      translationBoneRefs += 1;
      if (configured) configuredBoneRefs += 1;
      if (configured) continue;
      inferredOnlyBoneRefs += 1;
      itemHasInferredOnly = true;
      if (reasons.has("mesh-skin-root-attachment")) rootHeuristicOnlyBoneRefs += 1;
      if (reasons.has("attachment-descendant")) descendantOnlyBoneRefs += 1;
    }
    if (itemHasInferredOnly) highRiskItems += 1;
    unsafeTranslationBoneRefs += item.unsafeTranslationBoneIndices?.length || 0;
  }

  return {
    items: (report.items || []).length,
    withTranslationBones: (report.items || []).filter((item) => item.translationBoneIndices?.length || item.evidence?.length).length,
    translationBoneRefs,
    configuredBoneRefs,
    inferredOnlyBoneRefs,
    rootHeuristicOnlyBoneRefs,
    descendantOnlyBoneRefs,
    unsafeTranslationBoneRefs,
    highRiskItems,
    failures: (report.failures || []).length,
  };
}

function exportRuntimeAttachmentBones({
  manifestPath = defaultManifestPath,
  runtimeConfigPath = defaultRuntimeConfigPath,
  nativeExtraTransformTsv = defaultNativeExtraTransformTsv,
  resourceRoot = defaultResourceRoot,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const manifest = readJson(manifestPath, { items: [] });
  const runtimeConfig = readJson(runtimeConfigPath, { items: [] });
  const runtimeLookup = buildRuntimeLookup(runtimeConfig.items || []);
  const nativeExtraTransformBindTokens = nativeExtraTransformBindTokensFromRows(readTsv(nativeExtraTransformTsv));
  const items = [];
  const failures = [];

  for (const item of manifest.items || []) {
    const meshRel = item.meshPath || item.sourceMeshPath || "";
    const skeletonRel = item.resolvedSkeletonPath || item.skeletons?.[0] || "";
    if (!item.rel || !meshRel || !skeletonRel) continue;

    try {
      const mesh = readMeshForGlb(path.join(resourceRoot, meshRel));
      const skeleton = parseSkeletonFile(path.join(resourceRoot, skeletonRel));
      items.push(
        inferRuntimeAttachmentBones({
          item,
          mesh,
          skeleton,
          runtimeConfig: runtimeConfigForItem(item, runtimeLookup),
          nativeExtraTransformBindTokens,
        }),
      );
    } catch (error) {
      failures.push({
        rel: item.rel,
        meshPath: meshRel,
        skeletonPath: skeletonRel,
        error: error.message,
      });
    }
  }

  const report = { generatedAt, summary: {}, items, failures };
  report.summary = summarizeRuntimeAttachmentBoneReport(report);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  writeTsv(tsvOut, runtimeAttachmentBoneRows(report), [
    "rel",
    "character",
    "modelLabel",
    "sourceRelativePath",
    "meshPath",
    "skeletonPath",
    "boneIndex",
    "reasons",
    "dominantVertexCount",
    "parent",
    "translation",
    "hash",
    "bindToken",
    "materialName",
  ]);

  return report.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeAttachmentBones({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    runtimeConfigPath: optionValue(args, "--runtime-config", defaultRuntimeConfigPath),
    nativeExtraTransformTsv: optionValue(args, "--native-extra-transform-tsv", defaultNativeExtraTransformTsv),
    resourceRoot: optionValue(args, "--resource-root", defaultResourceRoot),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeLookup,
  dominantJointCounts,
  exportRuntimeAttachmentBones,
  inferRuntimeAttachmentBones,
  inferUnsafeTranslationBones,
  isInferredRootAttachmentBone,
  isPhysicalAttachmentRuntimeSlot,
  isRuntimeAttachmentSlot,
  isWeaponLikeRuntimeSlot,
  nativeExtraTransformBindTokensFromRows,
  runtimeAttachmentBoneRows,
  summarizeRuntimeAttachmentBoneReport,
};
