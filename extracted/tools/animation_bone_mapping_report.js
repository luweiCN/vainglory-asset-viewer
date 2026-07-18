const fs = require("node:fs");
const path = require("node:path");

const {
  animationRecordTransformToSkeletonSpace,
  matchTransformRecordToSkeletonBones,
  parseAnimationLayout,
  readLikelyTransformRecord,
  scanLikelyTransformRecords,
} = require("./animation_tools");
const { parseSkeletonFile } = require("./skeleton_tools");

function readTsv(filePath) {
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
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function countSummary(map, { keyFormatter = (key) => String(key), limit = Infinity } = {}) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .slice(0, limit)
    .map(([key, count]) => `${keyFormatter(key)}:${count}`)
    .join(" ");
}

function roundArray(values, digits = 3) {
  return values.map((value) => Number(value.toFixed(digits)));
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function distance3(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function isUnsafeTrackOrderScale(scale, options = {}) {
  const min = options.trackOrderScaleMin ?? 0.25;
  const max = options.trackOrderScaleMax ?? 4;
  return scale.some((value) => value < min || value > max);
}

function normalizeQuaternion(rotation) {
  if (!rotation || rotation.length < 4) return null;
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (length < 0.000001) return null;
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}

function quaternionAngleDegrees(left, right) {
  const normalizedLeft = normalizeQuaternion(left);
  const normalizedRight = normalizeQuaternion(right);
  if (!normalizedLeft || !normalizedRight) return null;
  const dot = Math.abs(
    normalizedLeft[0] * normalizedRight[0] +
      normalizedLeft[1] * normalizedRight[1] +
      normalizedLeft[2] * normalizedRight[2] +
      normalizedLeft[3] * normalizedRight[3],
  );
  return (2 * Math.acos(Math.min(1, Math.max(0, dot))) * 180) / Math.PI;
}

function childCountsByBoneIndex(skeleton) {
  const childCounts = new Array(skeleton.boneCount).fill(0);
  for (const bone of skeleton.bones) {
    if (bone.parent >= 0 && bone.parent < childCounts.length) childCounts[bone.parent] += 1;
  }
  return childCounts;
}

function shouldGuardRotationDrift(childCount) {
  return childCount === 0 || childCount > 2;
}

function findContiguousTransformRun(transformRecords, count) {
  if (count <= 0 || transformRecords.length < count) return null;
  for (let start = 0; start + count <= transformRecords.length; start += 1) {
    let contiguous = true;
    for (let index = 1; index < count; index += 1) {
      if (transformRecords[start + index].offset - transformRecords[start + index - 1].offset !== 48) {
        contiguous = false;
        break;
      }
    }
    if (contiguous) return transformRecords.slice(start, start + count);
  }
  return null;
}

function readAlignedTransformRun(buffer, firstOffset, count, options = {}) {
  if (firstOffset == null || count <= 0) return null;
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const offset = firstOffset + index * 48;
    const record = readLikelyTransformRecord(buffer, offset, options);
    if (!record) return null;
    records.push({
      ...record,
      offsetDelta: index === 0 ? null : 48,
    });
  }
  return records;
}

function trackOrderPoseBones(layout, transformRecords, skeleton, options = {}) {
  if (layout.trackCount !== skeleton.boneCount) return null;
  const translationTolerance = options.trackOrderTranslationTolerance ?? 20;
  const rotationTolerance = options.trackOrderRotationToleranceDegrees ?? 30;
  const minReliablePoseBones = Math.ceil(skeleton.boneCount * (options.trackOrderMinReliablePoseCoverage ?? 0.75));
  const childCounts = childCountsByBoneIndex(skeleton);
  const records = findContiguousTransformRun(transformRecords, skeleton.boneCount);
  if (!records) return null;

  const poses = records.map((record, boneIndex) => {
    const transform = animationRecordTransformToSkeletonSpace(record);
    const bone = skeleton.bones[boneIndex];
    const childCount = childCounts[boneIndex] || 0;
    const rotationDriftDegrees = quaternionAngleDegrees(transform.rotation, bone.rotation);
    const highRotationDrift = rotationDriftDegrees != null && rotationDriftDegrees > rotationTolerance;
    const translationDistance = round(distance3(transform.translation, bone.translation));
    const translationDrift = translationDistance > translationTolerance;
    const scaleDrift = isUnsafeTrackOrderScale(transform.scale, options);
    const unsafeReason = translationDrift ? "translation-drift" : scaleDrift ? "scale-drift" : "";

    return {
      boneIndex,
      distance: translationDistance,
      ambiguous: translationDrift || scaleDrift,
      ...(unsafeReason ? { unsafeReason } : {}),
      ...(rotationDriftDegrees != null ? { rotationDrift: round(rotationDriftDegrees) } : {}),
      offset: record.offset,
      rotation: roundArray(transform.rotation),
      translation: roundArray(transform.translation),
      scale: roundArray(transform.scale),
      _rotationDriftCandidate: !translationDrift && !scaleDrift && highRotationDrift && shouldGuardRotationDrift(childCount),
    };
  });

  let reliablePoseBones = poses.filter((pose) => !pose.ambiguous).length;
  const rotationDriftCandidates = poses
    .filter((pose) => pose._rotationDriftCandidate)
    .sort((left, right) => right.rotationDrift - left.rotationDrift);

  for (const pose of rotationDriftCandidates) {
    if (reliablePoseBones <= minReliablePoseBones) break;
    pose.ambiguous = true;
    pose.unsafeReason = "rotation-drift";
    reliablePoseBones -= 1;
  }

  return poses.map(({ _rotationDriftCandidate, ...pose }) => pose);
}

function summarizeAnimationBoneMapping({ animationPath, skeletonPath, animationBuffer, skeleton, tolerance = 0.08, trackOrderOptions = {} }) {
  const layout = parseAnimationLayout(animationBuffer);
  const transformRecords = scanLikelyTransformRecords(animationBuffer, {
    start: layout.dataOffset,
    end: animationBuffer.length,
  });
  const trackOrderTransformRecords = scanLikelyTransformRecords(animationBuffer, {
    start: layout.dataOffset,
    end: animationBuffer.length,
  });
  const alignedTrackOrderTransformRecords =
    readAlignedTransformRun(animationBuffer, transformRecords[0]?.offset, skeleton.boneCount, {
      allowZeroScale: true,
    }) || trackOrderTransformRecords;

  let matchedTransformRecords = 0;
  let ambiguousTransformRecords = 0;
  const matchedBones = new Map();
  const prefixBytes = new Map();
  const offsetDeltas = new Map();
  const poseBones = [];

  for (const record of transformRecords) {
    if (record.prefixByte != null) increment(prefixBytes, record.prefixByte);
    if (record.offsetDelta != null) increment(offsetDeltas, record.offsetDelta);
  }

  const trackOrderCandidatePoses = trackOrderPoseBones(
    layout,
    alignedTrackOrderTransformRecords,
    skeleton,
    trackOrderOptions,
  );
  const nativeFrameBoneIndices = (trackOrderCandidatePoses || [])
    .filter((pose) => !pose.ambiguous)
    .map((pose) => pose.boneIndex);
  const trackOrderPoses = trackOrderOptions.enableRawTrackOrder ? trackOrderCandidatePoses : null;
  if (trackOrderPoses) {
    for (const pose of trackOrderPoses) {
      increment(matchedBones, pose.boneIndex);
      if (pose.ambiguous) ambiguousTransformRecords += 1;
    }
    poseBones.push(...trackOrderPoses);
    matchedTransformRecords = trackOrderPoses.length;
  } else {
    for (const record of transformRecords) {
      const candidates = matchTransformRecordToSkeletonBones(record, skeleton.bones, { tolerance });
      if (!candidates.length) continue;
      matchedTransformRecords += 1;
      if (candidates.length > 1) ambiguousTransformRecords += 1;
      increment(matchedBones, candidates[0].boneIndex);
      if (candidates.length > 1) continue;
      const transform = animationRecordTransformToSkeletonSpace(record);
      poseBones.push({
        boneIndex: candidates[0].boneIndex,
        distance: candidates[0].distance,
        ambiguous: candidates.length > 1,
        offset: record.offset,
        rotation: roundArray(transform.rotation),
        translation: roundArray(transform.translation),
        scale: roundArray(transform.scale),
      });
    }
  }

  return {
    animationPath,
    skeletonPath,
    mappingSource: trackOrderPoses ? "track-order" : "translation-match",
    duration: Number(layout.duration.toFixed(6)),
    fps: Number(layout.fps.toFixed(3)),
    frameCount: layout.frameCount,
    trackCount: layout.trackCount,
    boneCount: skeleton.boneCount,
    transformRecords: transformRecords.length,
    trackOrderCandidateStartOffset: trackOrderCandidatePoses?.[0]?.offset ?? null,
    trackOrderCandidatePoseBones: trackOrderCandidatePoses?.length ?? 0,
    trackOrderCandidateUnambiguousPoseBones: trackOrderCandidatePoses?.filter((pose) => !pose.ambiguous).length ?? 0,
    trackOrderCandidateUnsafePoseBones: trackOrderCandidatePoses?.filter((pose) => pose.ambiguous).length ?? 0,
    nativeFrameBoneRecords: nativeFrameBoneIndices.length,
    nativeFrameBoneIndices,
    matchedTransformRecords,
    unmatchedTransformRecords: transformRecords.length - matchedTransformRecords,
    ambiguousTransformRecords,
    uniqueMatchedBones: matchedBones.size,
    poseBoneRecords: poseBones.length,
    unambiguousPoseBones: poseBones.filter((pose) => !pose.ambiguous).length,
    poseBones,
    prefixByteSummary: countSummary(prefixBytes, {
      keyFormatter: (key) => `0x${key.toString(16).padStart(2, "0")}`,
      limit: 12,
    }),
    offsetDeltaSummary: countSummary(offsetDeltas, { limit: 12 }),
    topMatchedBones: countSummary(matchedBones, { limit: 20 }),
  };
}

function uniqueCompatiblePairs(bindingRows) {
  const pairs = new Map();
  for (const row of bindingRows) {
    if (row.trackMatchesSkeleton !== "yes") continue;
    if (!row.animationPath || !row.skeletonPath) continue;
    const key = `${row.animationPath}\t${row.skeletonPath}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        animationPath: row.animationPath,
        skeletonPath: row.skeletonPath,
      });
    }
  }
  return [...pairs.values()].sort((left, right) => {
    const animationOrder = left.animationPath.localeCompare(right.animationPath);
    if (animationOrder) return animationOrder;
    return left.skeletonPath.localeCompare(right.skeletonPath);
  });
}

function defaultReadAnimation(animationPath) {
  return fs.readFileSync(path.join("extracted/build_resources_by_path", animationPath));
}

function defaultReadSkeleton(skeletonPath) {
  return parseSkeletonFile(path.join("extracted/build_resources_by_path", skeletonPath));
}

function buildAnimationBoneMappingReport({
  bindingRows,
  readAnimation = defaultReadAnimation,
  readSkeleton = defaultReadSkeleton,
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = [];
  const failures = [];

  for (const pair of uniqueCompatiblePairs(bindingRows || [])) {
    try {
      items.push(
        summarizeAnimationBoneMapping({
          ...pair,
          animationBuffer: readAnimation(pair.animationPath),
          skeleton: readSkeleton(pair.skeletonPath),
        }),
      );
    } catch (error) {
      failures.push({
        ...pair,
        error: error.message,
      });
    }
  }

  return {
    generatedAt,
    count: items.length,
    failureCount: failures.length,
    items,
    failures,
  };
}

function writeAnimationBoneMappingReport(report, { jsonOut, tsvOut, viewerOut, failuresOut }) {
  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(
      viewerOut,
      `${JSON.stringify({ generatedAt: report.generatedAt, count: report.count, items: report.items }, null, 2)}\n`,
    );
  }
  if (tsvOut) {
    writeTsv(tsvOut, report.items, [
      "animationPath",
      "skeletonPath",
      "mappingSource",
      "duration",
      "fps",
      "frameCount",
      "trackCount",
      "boneCount",
      "transformRecords",
      "trackOrderCandidateStartOffset",
      "trackOrderCandidatePoseBones",
      "trackOrderCandidateUnambiguousPoseBones",
      "trackOrderCandidateUnsafePoseBones",
      "nativeFrameBoneRecords",
      "matchedTransformRecords",
      "unmatchedTransformRecords",
      "ambiguousTransformRecords",
      "uniqueMatchedBones",
      "poseBoneRecords",
      "unambiguousPoseBones",
      "prefixByteSummary",
      "offsetDeltaSummary",
      "topMatchedBones",
    ]);
  }
  if (failuresOut) writeTsv(failuresOut, report.failures, ["animationPath", "skeletonPath", "error"]);
}

module.exports = {
  buildAnimationBoneMappingReport,
  readTsv,
  summarizeAnimationBoneMapping,
  uniqueCompatiblePairs,
  writeAnimationBoneMappingReport,
};
