const assert = require("node:assert/strict");
const test = require("node:test");

const { buildAnimationStructureReport, summarizeAnimationFile } = require("../tools/animation_structure_report");

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

  const transform = [-0.592, -0.302, -0.661, -0.106, 0, 17.024, -8.063, 0, 1, 1, 1, 0];
  transform.forEach((value, index) => buffer.writeFloatLE(value, 52 + index * 4));
  return buffer;
}

function sampleAnimationBufferWithAlignedRun() {
  const buffer = sampleAnimationBuffer();
  const secondTransform = [-0.268, -0.312, 0.896, 0, 0, 10, 0, 0, 0, 0, 0, 0];
  secondTransform.forEach((value, index) => buffer.writeFloatLE(value, 100 + index * 4));
  return buffer;
}

test("summarizeAnimationFile reports table boundaries and transform record hints", () => {
  const summary = summarizeAnimationFile("Characters/Ringo/Art/ringo.test.anim", sampleAnimationBuffer());

  assert.equal(summary.relativePath, "Characters/Ringo/Art/ringo.test.anim");
  assert.equal(summary.animDataEntryCount, 1);
  assert.equal(summary.samplerFamily, 3);
  assert.equal(summary.payloadOffset, 16);
  assert.equal(summary.payloadSize, 144);
  assert.equal(summary.clipDuration, 1.5);
  assert.equal(summary.payloadFps, 20);
  assert.equal(summary.payloadFrameCount, 30);
  assert.equal(summary.payloadTrackCount, 2);
  assert.equal(summary.trackCount, 2);
  assert.equal(summary.descriptorTableLength, 8);
  assert.equal(summary.curveDataOffset, 52);
  assert.equal(summary.curveDataLength, 108);
  assert.equal(summary.likelyTransformRecords, 1);
  assert.equal(summary.firstTransformOffset, 52);
  assert.deepEqual(summary.firstTransformTranslation, [0, 17.024, -8.063]);
  assert.equal(summary.formatCodeSummary, "0x00f:1 0x07f:1");
});

test("summarizeAnimationFile reports aligned transform run and packed tail boundaries", () => {
  const summary = summarizeAnimationFile("Characters/Koshka/Art/koshka.test.anim", sampleAnimationBufferWithAlignedRun());

  assert.equal(summary.alignedTransformRunStartOffset, 52);
  assert.equal(summary.alignedTransformRunRecords, 2);
  assert.equal(summary.alignedTransformRunComplete, true);
  assert.equal(summary.alignedTransformRunEndOffset, 148);
  assert.equal(summary.packedDescriptorOffset, 148);
  assert.equal(summary.packedDescriptorLength, 8);
  assert.equal(summary.packedDescriptorBytesUsed, 8);
  assert.equal(summary.packedDescriptorSpanLengthSummary, "4:2");
  assert.equal(summary.formatDescriptorLengthSummary, "0x00f/4:1 0x07f/4:1");
  assert.equal(summary.packedCurveDataOffset, 156);
  assert.equal(summary.packedCurveDataLength, 4);
});

test("buildAnimationStructureReport keeps rows with parseable animation buffers", () => {
  const report = buildAnimationStructureReport(
    [
      {
        relativePath: "Characters/Ringo/Art/ringo.test.anim",
        linkedPath: "memory://ringo.test.anim",
      },
    ],
    (filePath) => {
      assert.equal(filePath, "memory://ringo.test.anim");
      return sampleAnimationBuffer();
    },
    "2026-06-22T00:00:00.000Z",
  );

  assert.equal(report.generatedAt, "2026-06-22T00:00:00.000Z");
  assert.equal(report.count, 1);
  assert.equal(report.items[0].relativePath, "Characters/Ringo/Art/ringo.test.anim");
  assert.equal(report.items[0].likelyTransformRecords, 1);
});
