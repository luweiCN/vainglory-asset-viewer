function parseAnimationHeader(buffer) {
  if (buffer.length < 32) throw new Error("animation buffer too small");
  return {
    version: buffer.readUInt32LE(0),
    duration: buffer.readFloatLE(4),
    channelGroupCount: buffer.readUInt32LE(8),
    payloadSize: buffer.readUInt32LE(12),
    fps: buffer.readFloatLE(16),
    frameCount: buffer.readUInt32LE(20),
    trackCount: buffer.readUInt32LE(24),
    nameTableValue: buffer.readUInt32LE(28),
  };
}

function isFiniteRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function align4(value) {
  return (value + 3) & ~3;
}

function parseAnimationPayloadHeader(buffer, offset) {
  if (offset < 0 || offset + 20 > buffer.length) throw new Error("animation payload header out of range");
  const trackCount = buffer.readUInt32LE(offset + 8);
  const trackFormatOffset = offset + 20;
  const trackKeyOffsetOffset = align4(trackFormatOffset + trackCount * 2);
  const dataOffset = align4(trackKeyOffsetOffset + trackCount * 2);

  return {
    offset,
    fps: buffer.readFloatLE(offset),
    frameCount: buffer.readUInt32LE(offset + 4),
    trackCount,
    descriptorTableLength: buffer.readUInt32LE(offset + 12),
    unknown0: buffer.readUInt32LE(offset + 16),
    trackFormatOffset,
    trackKeyOffsetOffset,
    dataOffset,
  };
}

function parseAnimationPackage(buffer) {
  if (buffer.length < 16) throw new Error("animation package too small");
  const entryCount = buffer.readUInt32LE(0);
  const entries = [];
  let cursor = 4;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 12 > buffer.length) throw new Error("animation package entry header out of range");
    const entryHeaderOffset = cursor;
    const clipIdU32 = buffer.readUInt32LE(cursor);
    const samplerFamily = buffer.readUInt32LE(cursor + 4);
    const payloadSize = buffer.readUInt32LE(cursor + 8);
    const payloadOffset = cursor + 12;
    const payloadEnd = payloadOffset + payloadSize;
    if (payloadEnd > buffer.length) throw new Error("animation package payload out of range");

    entries.push({
      index,
      entryHeaderOffset,
      clipIdU32,
      clipDuration: buffer.readFloatLE(cursor),
      samplerFamily,
      payloadSize,
      payloadOffset,
      payloadEnd,
      payloadHeader: parseAnimationPayloadHeader(buffer, payloadOffset),
    });
    cursor = payloadEnd;
  }

  return {
    entryCount,
    entries,
    byteLength: cursor,
  };
}

function readUInt16Array(buffer, offset, count) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(buffer.readUInt16LE(offset + index * 2));
  }
  return values;
}

function parseAnimationFamily3Layout(buffer, entryIndex = 0) {
  const packageInfo = parseAnimationPackage(buffer);
  const entry = packageInfo.entries[entryIndex];
  if (!entry) throw new Error("animation package entry not found");
  if (entry.samplerFamily !== 3) throw new Error(`unsupported animation sampler family ${entry.samplerFamily}`);

  const { payloadHeader } = entry;
  const trackCount = payloadHeader.trackCount;
  const trackMaskOffset = entry.payloadOffset + 20;
  const trackValueOffsetOffset = trackMaskOffset + trackCount * 2 + 2;
  const basePoseOffset = trackValueOffsetOffset + trackCount * 2;
  const frameDataOffset = basePoseOffset + trackCount * 48;
  const frameStrideHalfWords = payloadHeader.descriptorTableLength;
  const frameDataLength = frameStrideHalfWords * Math.max(0, payloadHeader.frameCount - 1) * 2;
  const frameDataEnd = frameDataOffset + frameDataLength;
  if (frameDataOffset > entry.payloadEnd) throw new Error("animation family 3 base pose out of range");

  return {
    entryIndex,
    samplerFamily: entry.samplerFamily,
    payloadOffset: entry.payloadOffset,
    payloadEnd: entry.payloadEnd,
    fps: payloadHeader.fps,
    frameCount: payloadHeader.frameCount,
    trackCount,
    frameStrideHalfWords,
    trackMaskOffset,
    trackMasks: readUInt16Array(buffer, trackMaskOffset, trackCount),
    trackValueOffsetOffset,
    trackValueOffsets: readUInt16Array(buffer, trackValueOffsetOffset, trackCount),
    basePoseOffset,
    frameDataOffset,
    frameDataLength,
    frameDataEnd,
    tailOffset: Math.min(frameDataEnd, entry.payloadEnd),
    tailLength: Math.max(0, entry.payloadEnd - frameDataEnd),
  };
}

function popcount16(value) {
  let remaining = value & 0xffff;
  let count = 0;
  while (remaining) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function animationFamily3TrackValueSpans(layout) {
  return layout.trackValueOffsets.map((halfWordStart, trackIndex) => {
    const nextOffset = layout.trackValueOffsets[trackIndex + 1] ?? layout.frameStrideHalfWords;
    const halfWordEnd = Math.min(nextOffset, layout.frameStrideHalfWords);
    const halfWordLength = Math.max(0, halfWordEnd - halfWordStart);
    return {
      trackIndex,
      mask: layout.trackMasks[trackIndex],
      componentCount: popcount16(layout.trackMasks[trackIndex] & 0x03ff),
      halfWordStart,
      halfWordEnd,
      halfWordLength,
      byteStart: layout.frameDataOffset + halfWordStart * 2,
      byteEnd: layout.frameDataOffset + halfWordEnd * 2,
      byteLength: halfWordLength * 2,
    };
  });
}

function decodeFloat16(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function applyAnimationFamily3Mask(buffer, byteOffset, mask, values) {
  const componentIndexes = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10];
  let cursor = byteOffset;
  for (let bit = 0; bit < componentIndexes.length; bit += 1) {
    if ((mask & (1 << bit)) === 0) continue;
    values[componentIndexes[bit]] = decodeFloat16(buffer.readUInt16LE(cursor));
    cursor += 2;
  }
  return cursor;
}

function readAnimationFamily3FramePose(buffer, frameIndex, entryIndex = 0) {
  const layout = parseAnimationFamily3Layout(buffer, entryIndex);
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= layout.frameCount) {
    throw new Error(`animation frame index ${frameIndex} out of range`);
  }

  const spans = animationFamily3TrackValueSpans(layout);
  const frameBaseOffset = frameIndex === 0 ? null : layout.frameDataOffset + (frameIndex - 1) * layout.frameStrideHalfWords * 2;
  return spans.map((span) => {
    const offset = layout.basePoseOffset + span.trackIndex * 48;
    const values = readFloatTuple(buffer, offset, 12);
    if (!values) throw new Error(`animation base pose record ${span.trackIndex} out of range`);
    if (frameBaseOffset != null && span.mask !== 0) {
      applyAnimationFamily3Mask(buffer, frameBaseOffset + span.halfWordStart * 2, span.mask, values);
    }
    const quaternion = values.slice(0, 4);
    const translation = values.slice(4, 7);
    const scale = values.slice(8, 11);
    return {
      trackIndex: span.trackIndex,
      offset,
      mask: span.mask,
      values,
      quaternion,
      translation,
      scale,
      extra: [values[7], values[11]],
      quaternionNorm: Math.sqrt(quaternion.reduce((sum, value) => sum + value * value, 0)),
    };
  });
}

function parseAnimationLayout(buffer) {
  const header = parseAnimationHeader(buffer);
  const unknownTableValue = buffer.readUInt32LE(32);
  const trackFormatOffset = 36;
  const trackFormatCodes = readUInt16Array(buffer, trackFormatOffset, header.trackCount);
  const trackKeyOffsetOffset = align4(trackFormatOffset + header.trackCount * 2);
  const trackKeyOffsets = readUInt16Array(buffer, trackKeyOffsetOffset, header.trackCount);
  const dataOffset = align4(trackKeyOffsetOffset + header.trackCount * 2);

  return {
    ...header,
    unknownTableValue,
    trackFormatOffset,
    trackFormatCodes,
    trackKeyOffsetOffset,
    trackKeyOffsets,
    dataOffset,
  };
}

function animationDescriptorTableEnd(layout) {
  return layout.dataOffset + layout.nameTableValue;
}

function trackDescriptorSpans(layout, descriptorBaseOffset = layout.dataOffset) {
  const tableEndOffset = descriptorBaseOffset + layout.nameTableValue;
  return layout.trackKeyOffsets.map((offset, trackIndex) => {
    const nextOffset = layout.trackKeyOffsets[trackIndex + 1] ?? layout.nameTableValue;
    const start = descriptorBaseOffset + offset;
    const end = Math.min(descriptorBaseOffset + nextOffset, tableEndOffset);
    return {
      trackIndex,
      formatCode: layout.trackFormatCodes[trackIndex],
      relativeOffset: offset,
      start,
      end,
      length: Math.max(0, end - start),
    };
  });
}

function readFloatTuple(buffer, offset, count) {
  if (offset < 0 || offset + count * 4 > buffer.length) return null;
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const value = buffer.readFloatLE(offset + index * 4);
    if (!Number.isFinite(value)) return null;
    values.push(value);
  }
  return values;
}

function readLikelyTransformRecord(buffer, offset, options = {}) {
  const recordValues = readFloatTuple(buffer, offset, 12);
  if (!recordValues) return null;

  const quaternion = recordValues.slice(0, 4);
  const translation = recordValues.slice(4, 7);
  const scale = recordValues.slice(8, 11);
  const extra = [recordValues[7], recordValues[11]];
  const quaternionNorm = Math.sqrt(quaternion.reduce((sum, value) => sum + value * value, 0));
  const translationOk = translation.every((value) => Math.abs(value) <= 2000);
  const scaleOk = scale.every((value) => (options.allowZeroScale ? value >= 0 : value > 0.0001) && value <= 10);
  const quaternionOk = quaternionNorm >= 0.45 && quaternionNorm <= 1.55;

  if (!translationOk || !scaleOk || !quaternionOk) return null;
  return {
    offset,
    packetOffset: offset > 0 ? offset - 1 : offset,
    prefixByte: offset > 0 ? buffer.readUInt8(offset - 1) : null,
    quaternion,
    translation,
    scale,
    extra,
    recordByteLength: 48,
    quaternionNorm,
  };
}

function scanLikelyTransformRecords(buffer, options = {}) {
  const start = Math.max(0, options.start ?? 0);
  const end = Math.min(buffer.length, options.end ?? buffer.length);
  const maxRecords = options.maxRecords ?? Infinity;
  const records = [];

  for (let offset = start; offset + 40 <= end && records.length < maxRecords; offset += 1) {
    const record = readLikelyTransformRecord(buffer, offset, options);
    if (!record) continue;
    record.offsetDelta = records.length ? record.offset - records[records.length - 1].offset : null;
    records.push(record);
    offset += 39;
  }

  return records;
}

function animationRecordTranslationToSkeletonSpace(translation) {
  return [...translation];
}

function animationRecordTransformToSkeletonSpace(record) {
  return {
    rotation: [...record.quaternion],
    translation: animationRecordTranslationToSkeletonSpace(record.translation),
    scale: [...record.scale],
  };
}

function distance3(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function matchTransformRecordToSkeletonBones(record, bones, options = {}) {
  const tolerance = options.tolerance ?? 0.08;
  const skeletonTranslation = animationRecordTranslationToSkeletonSpace(record.translation);
  return bones
    .map((bone) => ({
      boneIndex: bone.index,
      distance: round(distance3(skeletonTranslation, bone.translation)),
    }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((left, right) => left.distance - right.distance || left.boneIndex - right.boneIndex);
}

function isLikelyAnimationHeader(buffer) {
  if (buffer.length < 64 || buffer.length > 2_000_000) return false;
  const header = parseAnimationHeader(buffer);
  if (header.version !== 1) return false;
  if (!isFiniteRange(header.duration, 0.01, 60)) return false;
  if (header.payloadSize !== buffer.length - 16) return false;
  if (!isFiniteRange(header.fps, 1, 120)) return false;
  if (!isFiniteRange(header.frameCount, 1, 10000)) return false;
  if (!isFiniteRange(header.trackCount, 1, 500)) return false;
  if (!isFiniteRange(header.nameTableValue, 1, 10000)) return false;
  return true;
}

module.exports = {
  animationDescriptorTableEnd,
  animationFamily3TrackValueSpans,
  animationRecordTranslationToSkeletonSpace,
  animationRecordTransformToSkeletonSpace,
  isLikelyAnimationHeader,
  matchTransformRecordToSkeletonBones,
  parseAnimationFamily3Layout,
  parseAnimationPackage,
  parseAnimationPayloadHeader,
  parseAnimationHeader,
  parseAnimationLayout,
  readAnimationFamily3FramePose,
  readLikelyTransformRecord,
  scanLikelyTransformRecords,
  trackDescriptorSpans,
};
