const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeAttachmentVisibilityManifest,
  exportRuntimeAttachmentVisibilityManifest,
  extractScaleVisibilityRowsForAnimation,
  visibilityWindows,
} = require("../tools/runtime_attachment_visibility_manifest");

function writeTsv(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writeFloat(buffer, offset, value) {
  buffer.writeFloatLE(value, offset);
}

function makeFamily3ScaleClip() {
  const trackCount = 1;
  const frameCount = 3;
  const frameStrideHalfWords = 3;
  const payloadOffset = 16;
  const trackMaskOffset = payloadOffset + 20;
  const trackValueOffsetOffset = trackMaskOffset + trackCount * 2 + 2;
  const basePoseOffset = trackValueOffsetOffset + trackCount * 2;
  const frameDataOffset = basePoseOffset + trackCount * 48;
  const payloadSize = frameDataOffset + frameStrideHalfWords * (frameCount - 1) * 2 - payloadOffset;
  const buffer = Buffer.alloc(payloadOffset + payloadSize);

  buffer.writeUInt32LE(1, 0);
  buffer.writeFloatLE(1.5, 4);
  buffer.writeUInt32LE(3, 8);
  buffer.writeUInt32LE(payloadSize, 12);

  buffer.writeFloatLE(2, payloadOffset);
  buffer.writeUInt32LE(frameCount, payloadOffset + 4);
  buffer.writeUInt32LE(trackCount, payloadOffset + 8);
  buffer.writeUInt32LE(frameStrideHalfWords, payloadOffset + 12);
  buffer.writeUInt32LE(0, payloadOffset + 16);

  buffer.writeUInt16LE(0x0380, trackMaskOffset);
  buffer.writeUInt16LE(0, trackValueOffsetOffset);

  writeFloat(buffer, basePoseOffset + 0, 0);
  writeFloat(buffer, basePoseOffset + 4, 0);
  writeFloat(buffer, basePoseOffset + 8, 0);
  writeFloat(buffer, basePoseOffset + 12, 1);
  writeFloat(buffer, basePoseOffset + 32, 0);
  writeFloat(buffer, basePoseOffset + 36, 0);
  writeFloat(buffer, basePoseOffset + 40, 0);

  buffer.writeUInt16LE(0x3c00, frameDataOffset);
  buffer.writeUInt16LE(0x3c00, frameDataOffset + 2);
  buffer.writeUInt16LE(0x3c00, frameDataOffset + 4);
  buffer.writeUInt16LE(0x0000, frameDataOffset + 6);
  buffer.writeUInt16LE(0x0000, frameDataOffset + 8);
  buffer.writeUInt16LE(0x0000, frameDataOffset + 10);

  return buffer;
}

test("visibilityWindows compresses visible frame runs", () => {
  assert.deepEqual(visibilityWindows([false, true, true, false, true], 10), [
    { startFrame: 1, endFrame: 2, startSeconds: 0.1, endSeconds: 0.3 },
    { startFrame: 4, endFrame: 4, startSeconds: 0.4, endSeconds: 0.5 },
  ]);
});

test("extractScaleVisibilityRowsForAnimation samples native scale tracks", () => {
  const rows = extractScaleVisibilityRowsForAnimation({
    animationPath: "Characters/Test/Art/test.withdraw.anim",
    buffer: makeFamily3ScaleClip(),
    threshold: 0.5,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].boneIndex, 0);
  assert.equal(rows[0].trackMaskHex, "0x380");
  assert.equal(rows[0].visibleFrameCount, 1);
  assert.equal(rows[0].visibilityStatus, "time-windowed");
  assert.deepEqual(rows[0].visibleWindows, [{ startFrame: 1, endFrame: 1, startSeconds: 0.5, endSeconds: 1 }]);
});

test("buildRuntimeAttachmentVisibilityManifest joins scale windows to model actions", () => {
  const manifest = buildRuntimeAttachmentVisibilityManifest({
    bindingItems: [
      {
        rel: "Characters/Test/Art/test.glb",
        character: "Hero999",
        modelLabel: "Test_DefaultSkin",
        sourceRelativePath: "Characters/Test/Test.def",
        animations: [
          {
            label: "Withdraw",
            actionKey: "withdraw",
            targetRelativePath: "Characters/Test/Art/test.withdraw.anim",
            duration: 1.5,
            fps: 2,
            frameCount: 3,
          },
        ],
      },
    ],
    scaleRowsByAnimationPath: new Map([
      [
        "Characters/Test/Art/test.withdraw.anim",
        [
          {
            animationPath: "Characters/Test/Art/test.withdraw.anim",
            boneIndex: 0,
            trackMaskHex: "0x380",
            frameCount: 3,
            fps: 2,
            visibleFrameCount: 1,
            visibleWindows: [{ startFrame: 1, endFrame: 1, startSeconds: 0.5, endSeconds: 1 }],
            visibilityStatus: "time-windowed",
            maxScale: 1,
            minScale: 0,
          },
        ],
      ],
    ]),
    generatedAt: "2026-06-26T00:00:00.000Z",
  });

  assert.equal(manifest.count, 1);
  assert.deepEqual(manifest.items[0].actionKeys, ["withdraw"]);
  assert.equal(manifest.items[0].evidence, "native-scale-track");
  assert.equal(manifest.items[0].visibleWindowsText, "1-1");
});

test("exportRuntimeAttachmentVisibilityManifest writes viewer JSON and report TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-attachment-visibility-"));
  const animationPath = "Characters/Test/Art/test.withdraw.anim";
  const animationFile = path.join(tempDir, "test.withdraw.anim");
  const bindingsPath = path.join(tempDir, "skin-animation-bindings.json");
  const indexPath = path.join(tempDir, "animation_resource_index.tsv");
  const jsonOut = path.join(tempDir, "runtime-attachment-visibility-manifest.json");
  const tsvOut = path.join(tempDir, "runtime_attachment_visibility_manifest.tsv");

  fs.writeFileSync(animationFile, makeFamily3ScaleClip());
  fs.writeFileSync(
    bindingsPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Test/Art/test.glb",
          character: "Hero999",
          modelLabel: "Test_DefaultSkin",
          sourceRelativePath: "Characters/Test/Test.def",
          animations: [
            {
              label: "Withdraw",
              actionKey: "withdraw",
              targetRelativePath: animationPath,
              duration: 1.5,
              fps: 2,
              frameCount: 3,
            },
          ],
        },
      ],
    }),
  );
  writeTsv(indexPath, ["category", "relativePath", "hash", "size", "magic4", "filePath", "linkedPath"], [
    { category: "animation", relativePath: animationPath, filePath: animationFile, linkedPath: animationFile },
  ]);

  const summary = exportRuntimeAttachmentVisibilityManifest({ bindingsPath, animationIndexPath: indexPath, jsonOut, tsvOut });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /native-scale-track/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Test_DefaultSkin/);
});
