const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  animationDescriptorTableEnd,
  animationFamily3TrackValueSpans,
  animationRecordTranslationToSkeletonSpace,
  animationRecordTransformToSkeletonSpace,
  isLikelyAnimationHeader,
  matchTransformRecordToSkeletonBones,
  parseAnimationFamily3Layout,
  parseAnimationPackage,
  parseAnimationHeader,
  parseAnimationLayout,
  readAnimationFamily3FramePose,
  readLikelyTransformRecord,
  scanLikelyTransformRecords,
  trackDescriptorSpans,
} = require("../tools/animation_tools");

const root = path.resolve(__dirname, "..");

function decodeHalfFloatForTest(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function roundArray(values, digits = 6) {
  return values.map((value) => Number(value.toFixed(digits)));
}

function sampleAnimationBuffer() {
  const buffer = Buffer.alloc(80);
  buffer.writeUInt32LE(1, 0);
  buffer.writeFloatLE(0.6, 4);
  buffer.writeUInt32LE(3, 8);
  buffer.writeUInt32LE(buffer.length - 16, 12);
  buffer.writeFloatLE(30, 16);
  buffer.writeUInt32LE(18, 20);
  buffer.writeUInt32LE(9, 24);
  buffer.writeUInt32LE(52, 28);
  return buffer;
}

test("parseAnimationHeader reads Vainglory animation header fields", () => {
  const header = parseAnimationHeader(sampleAnimationBuffer());

  assert.equal(header.version, 1);
  assert.equal(header.duration, 0.6000000238418579);
  assert.equal(header.payloadSize, 64);
  assert.equal(header.fps, 30);
  assert.equal(header.frameCount, 18);
  assert.equal(header.trackCount, 9);
  assert.equal(header.nameTableValue, 52);
});

test("parseAnimationPackage reads native animData package entries", () => {
  const buffer = Buffer.alloc(80);
  buffer.writeUInt32LE(1, 0);
  buffer.writeFloatLE(1.5, 4);
  buffer.writeUInt32LE(3, 8);
  buffer.writeUInt32LE(64, 12);
  buffer.writeFloatLE(20, 16);
  buffer.writeUInt32LE(30, 20);
  buffer.writeUInt32LE(2, 24);
  buffer.writeUInt32LE(8, 28);
  buffer.writeUInt32LE(0, 32);

  const packageInfo = parseAnimationPackage(buffer);

  assert.equal(packageInfo.entryCount, 1);
  assert.equal(packageInfo.entries.length, 1);
  assert.equal(packageInfo.entries[0].payloadOffset, 16);
  assert.equal(packageInfo.entries[0].payloadSize, 64);
  assert.equal(packageInfo.entries[0].samplerFamily, 3);
  assert.equal(packageInfo.entries[0].clipDuration, 1.5);
  assert.equal(packageInfo.entries[0].payloadHeader.fps, 20);
  assert.equal(packageInfo.entries[0].payloadHeader.frameCount, 30);
  assert.equal(packageInfo.entries[0].payloadHeader.trackCount, 2);
  assert.equal(packageInfo.entries[0].payloadHeader.descriptorTableLength, 8);
});

test("parseAnimationFamily3Layout matches native Ringo idle payload offsets", () => {
  const buffer = fs.readFileSync(path.join(root, "build_resources_by_path", "Characters/Ringo/Art/ringo.idle.anim"));

  const layout = parseAnimationFamily3Layout(buffer);

  assert.equal(layout.trackCount, 76);
  assert.equal(layout.frameCount, 45);
  assert.equal(layout.frameStrideHalfWords, 260);
  assert.equal(layout.trackMaskOffset, 36);
  assert.equal(layout.trackValueOffsetOffset, 190);
  assert.equal(layout.basePoseOffset, 342);
  assert.equal(layout.frameDataOffset, 3990);
  assert.equal(layout.frameDataEnd, 26870);
  assert.equal(layout.tailLength, 48);
  assert.deepEqual(layout.trackMasks.slice(0, 6), [0x7f, 0x7f, 0x2f, 0x2f, 0x7f, 0x0f]);
  assert.deepEqual(layout.trackValueOffsets.slice(0, 6), [0, 7, 14, 19, 24, 31]);
});

test("animationFamily3TrackValueSpans bounds track values within a frame stride", () => {
  const buffer = fs.readFileSync(path.join(root, "build_resources_by_path", "Characters/Ringo/Art/ringo.idle.anim"));
  const layout = parseAnimationFamily3Layout(buffer);

  const spans = animationFamily3TrackValueSpans(layout);

  assert.deepEqual(
    spans.slice(0, 6).map(({ trackIndex, mask, halfWordStart, halfWordEnd, halfWordLength, componentCount }) => ({
      trackIndex,
      mask,
      halfWordStart,
      halfWordEnd,
      halfWordLength,
      componentCount,
    })),
    [
      { trackIndex: 0, mask: 0x7f, halfWordStart: 0, halfWordEnd: 7, halfWordLength: 7, componentCount: 7 },
      { trackIndex: 1, mask: 0x7f, halfWordStart: 7, halfWordEnd: 14, halfWordLength: 7, componentCount: 7 },
      { trackIndex: 2, mask: 0x2f, halfWordStart: 14, halfWordEnd: 19, halfWordLength: 5, componentCount: 5 },
      { trackIndex: 3, mask: 0x2f, halfWordStart: 19, halfWordEnd: 24, halfWordLength: 5, componentCount: 5 },
      { trackIndex: 4, mask: 0x7f, halfWordStart: 24, halfWordEnd: 31, halfWordLength: 7, componentCount: 7 },
      { trackIndex: 5, mask: 0x0f, halfWordStart: 31, halfWordEnd: 35, halfWordLength: 4, componentCount: 4 },
    ],
  );
  assert.equal(spans.at(-1).halfWordEnd, layout.frameStrideHalfWords);
});

test("readAnimationFamily3FramePose samples base pose and masked integer frames", () => {
  const buffer = fs.readFileSync(path.join(root, "build_resources_by_path", "Characters/Ringo/Art/ringo.idle.anim"));
  const layout = parseAnimationFamily3Layout(buffer);
  const frame0 = readAnimationFamily3FramePose(buffer, 0);
  const frame1 = readAnimationFamily3FramePose(buffer, 1);
  const baseTrack0 = readLikelyTransformRecord(buffer, layout.basePoseOffset, { allowZeroScale: true });
  const track0Span = animationFamily3TrackValueSpans(layout)[0];
  const frame1HalfValues = Array.from({ length: track0Span.halfWordLength }, (_, index) =>
    decodeHalfFloatForTest(buffer.readUInt16LE(layout.frameDataOffset + (track0Span.halfWordStart + index) * 2)),
  );

  assert.equal(frame0.length, layout.trackCount);
  assert.deepEqual(roundArray(frame0[0].quaternion), roundArray(baseTrack0.quaternion));
  assert.deepEqual(roundArray(frame0[0].translation), roundArray(baseTrack0.translation));
  assert.deepEqual(roundArray(frame0[0].scale), roundArray(baseTrack0.scale));
  assert.deepEqual(roundArray(frame1[0].values.slice(0, 7)), roundArray(frame1HalfValues));
  assert.deepEqual(roundArray(frame1[0].scale), roundArray(frame0[0].scale));
  assert.ok(frame1.every((record) => record.values.every(Number.isFinite)));
});

test("isLikelyAnimationHeader accepts consistent animation-sized binary", () => {
  assert.equal(isLikelyAnimationHeader(sampleAnimationBuffer()), true);
});

test("isLikelyAnimationHeader rejects mismatched payload sizes", () => {
  const buffer = sampleAnimationBuffer();
  buffer.writeUInt32LE(12, 12);

  assert.equal(isLikelyAnimationHeader(buffer), false);
});

test("parseAnimationLayout reads track format codes and key offsets", () => {
  const buffer = sampleAnimationBuffer();
  buffer.writeUInt32LE(0, 32);
  [0x380, 0x3a9, 0x3af, 0x3a0, 0x20, 0x3a9, 0x3af, 0x380, 0x380].forEach((value, index) => {
    buffer.writeUInt16LE(value, 36 + index * 2);
  });
  [0, 3, 9, 15, 23, 31, 39, 47, 50].forEach((value, index) => {
    buffer.writeUInt16LE(value, 56 + index * 2);
  });

  const layout = parseAnimationLayout(buffer);

  assert.equal(layout.dataOffset, 76);
  assert.deepEqual(layout.trackFormatCodes.slice(0, 4), [0x380, 0x3a9, 0x3af, 0x3a0]);
  assert.deepEqual(layout.trackKeyOffsets, [0, 3, 9, 15, 23, 31, 39, 47, 50]);
});

test("trackDescriptorSpans bounds the last descriptor by the descriptor table length", () => {
  const buffer = sampleAnimationBuffer();
  buffer.writeUInt32LE(17, 28);
  [0x7f, 0x0f, 0x00, 0x70, 0x7f, 0x0f, 0x0f, 0x00, 0x7f].forEach((value, index) => {
    buffer.writeUInt16LE(value, 36 + index * 2);
  });
  [0, 3, 3, 7, 9, 9, 12, 14, 16].forEach((value, index) => {
    buffer.writeUInt16LE(value, 56 + index * 2);
  });

  const layout = parseAnimationLayout(buffer);
  const spans = trackDescriptorSpans(layout);

  assert.equal(animationDescriptorTableEnd(layout), 93);
  assert.deepEqual(
    spans.slice(-3).map(({ trackIndex, start, end, length }) => ({ trackIndex, start, end, length })),
    [
      { trackIndex: 6, start: 88, end: 90, length: 2 },
      { trackIndex: 7, start: 90, end: 92, length: 2 },
      { trackIndex: 8, start: 92, end: 93, length: 1 },
    ],
  );
});

test("trackDescriptorSpans can resolve descriptors from an aligned transform run base", () => {
  const buffer = sampleAnimationBuffer();
  buffer.writeUInt32LE(17, 28);
  [0x7f, 0x0f, 0x00, 0x70, 0x7f, 0x0f, 0x0f, 0x00, 0x7f].forEach((value, index) => {
    buffer.writeUInt16LE(value, 36 + index * 2);
  });
  [0, 3, 3, 7, 9, 9, 12, 14, 16].forEach((value, index) => {
    buffer.writeUInt16LE(value, 56 + index * 2);
  });

  const layout = parseAnimationLayout(buffer);
  const spans = trackDescriptorSpans(layout, 200);

  assert.deepEqual(
    spans.slice(0, 4).map(({ trackIndex, start, end, length }) => ({ trackIndex, start, end, length })),
    [
      { trackIndex: 0, start: 200, end: 203, length: 3 },
      { trackIndex: 1, start: 203, end: 203, length: 0 },
      { trackIndex: 2, start: 203, end: 207, length: 4 },
      { trackIndex: 3, start: 207, end: 209, length: 2 },
    ],
  );
});

test("scanLikelyTransformRecords finds packed quaternion translation scale records", () => {
  const buffer = Buffer.alloc(128, 0xff);
  buffer[16] = 0x3e;
  buffer[64] = 0xbe;
  const firstOffset = 17;
  const secondOffset = 65;
  const firstTransform = [-0.592, -0.302, -0.661, -0.106, 17.024, -8.063, 0, 0, 1, 1, 1, -0.168];
  const secondTransform = [-0.268, -0.312, 0.896, 0, 10, 0, 0, 0, 1, 1, 1, -0.068];

  for (const [offset, values] of [
    [firstOffset, firstTransform],
    [secondOffset, secondTransform],
  ]) {
    values.forEach((value, index) => buffer.writeFloatLE(value, offset + index * 4));
  }

  const records = scanLikelyTransformRecords(buffer, { start: 0, end: buffer.length });

  assert.deepEqual(
    records.map((record) => record.offset),
    [firstOffset, secondOffset],
  );
  assert.deepEqual(records[0].translation.map((value) => Number(value.toFixed(3))), [17.024, -8.063, 0]);
  assert.equal(records[0].prefixByte, 0x3e);
  assert.equal(records[0].packetOffset, 16);
  assert.equal(records[0].recordByteLength, 48);
  assert.deepEqual(records[0].extra.map((value) => Number(value.toFixed(3))), [0, -0.168]);
  assert.equal(records[1].offsetDelta, 48);
  assert.equal(Number(records[1].quaternionNorm.toFixed(3)), 0.986);
});

test("scanLikelyTransformRecords accepts animation records with a flag before scale", () => {
  const buffer = Buffer.alloc(96, 0xff);
  const transformOffset = 17;
  const transform = [0.1, 0.2, 0.3, 0.927, 4, 5, 6, 0, 1, 1, 1, 0.25];
  transform.forEach((value, index) => buffer.writeFloatLE(value, transformOffset + index * 4));

  const records = scanLikelyTransformRecords(buffer, { start: 0, end: buffer.length });

  assert.equal(records.length, 1);
  assert.equal(records[0].offset, transformOffset);
  assert.deepEqual(records[0].translation, [4, 5, 6]);
  assert.deepEqual(records[0].scale, [1, 1, 1]);
  assert.deepEqual(records[0].extra, [0, 0.25]);
});

test("readLikelyTransformRecord accepts zero scale only for diagnostic reads", () => {
  const buffer = Buffer.alloc(64, 0xff);
  const transform = [0.1, 0.2, 0.3, 0.927, 4, 5, 6, 0, 0, 0, 0, 0.25];
  transform.forEach((value, index) => buffer.writeFloatLE(value, index * 4));

  assert.equal(readLikelyTransformRecord(buffer, 0), null);
  const record = readLikelyTransformRecord(buffer, 0, { allowZeroScale: true });

  assert.deepEqual(record.translation, [4, 5, 6]);
  assert.deepEqual(record.scale, [0, 0, 0]);
});

test("animation record translations can be matched to skeleton bone local translations", () => {
  const record = {
    translation: [-0.106, 17.024, -8.063],
  };
  const bones = [
    { index: 6, translation: [-50, -154.3, -0.03] },
    { index: 7, translation: [0, 17, -8.06] },
    { index: 8, translation: [0, 10, 0] },
  ];

  assert.deepEqual(animationRecordTranslationToSkeletonSpace(record.translation), [-0.106, 17.024, -8.063]);
  assert.deepEqual(matchTransformRecordToSkeletonBones(record, bones, { tolerance: 0.12 }), [
    {
      boneIndex: 7,
      distance: 0.109,
    },
  ]);
});

test("animation record transforms expose viewer-ready skeleton-space pose values", () => {
  const transform = animationRecordTransformToSkeletonSpace({
    quaternion: [0.1, 0.2, 0.3, 0.4],
    translation: [-0.106, 17.024, -8.063],
    scale: [2, 3, 4],
  });

  assert.deepEqual(transform.rotation, [0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(transform.translation, [-0.106, 17.024, -8.063]);
  assert.deepEqual(transform.scale, [2, 3, 4]);
});
