const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCapture } = require("../tools/pfx_native_callback_capture_summary");

const targetManifest = {
  targets: [
    {
      callbackAddress: "0x1008da914",
      contexts: [
        {
          effectToken: "Effect_Test",
          pfxPath: "Effects/Test/Test.pfx",
          slot: "sizeCallback",
        },
      ],
    },
    {
      callbackAddress: "0x1008dab8c",
      contexts: [
        {
          effectToken: "Effect_Test",
          pfxPath: "Effects/Test/Test.pfx",
          slot: "initialSizeCallback",
        },
      ],
    },
  ],
};

function writeJsonl(records) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-capture-"));
  const inputPath = path.join(tempDir, "capture.jsonl");
  fs.writeFileSync(inputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return inputPath;
}

test("summarizeCapture reports missing PFX native callback captures without failing", () => {
  const summary = summarizeCapture({
    targetManifest,
    inputPath: path.join(os.tmpdir(), "missing-pfx-native-capture.jsonl"),
  }).summary;

  assert.equal(summary.captureImported, false);
  assert.equal(summary.captureStatus, "capture-missing");
  assert.equal(summary.readyForManualCallbackReview, false);
  assert.equal(summary.targetRows, 2);
  assert.equal(summary.missingTargetRows, 2);
});

test("summarizeCapture keeps partial PFX native callback captures gated", () => {
  const inputPath = writeJsonl([
    { type: "pfx_native_callback_begin", targets: 2 },
    { type: "pfx_native_callback_attached", callbackAddress: "0x1008da914" },
    { type: "pfx_native_callback_enter", callbackAddress: "0x1008da914", sampleIndex: 0 },
    { type: "pfx_native_callback_leave", callbackAddress: "0x1008da914", sampleIndex: 0, retval: "0x0" },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureImported, true);
  assert.equal(manifest.summary.captureStatus, "partial-target-coverage");
  assert.equal(manifest.summary.partialCaptureUseful, true);
  assert.equal(manifest.summary.observedCompleteTargets, 1);
  assert.equal(manifest.summary.missingTargetRows, 1);
  assert.equal(manifest.items[0].completeSamples, 1);
});

test("summarizeCapture marks PFX native callback captures ready only when every target has complete samples", () => {
  const inputPath = writeJsonl([
    { type: "pfx_native_callback_begin", targets: 2 },
    { type: "pfx_native_callback_attached", callbackAddress: "0x1008da914" },
    { type: "pfx_native_callback_enter", callbackAddress: "0x1008da914", sampleIndex: 0 },
    { type: "pfx_native_callback_leave", callbackAddress: "0x1008da914", sampleIndex: 0, retval: "0x0" },
    { type: "pfx_native_callback_attached", callbackAddress: "0x1008dab8c" },
    { type: "pfx_native_callback_enter", callbackAddress: "0x1008dab8c", sampleIndex: 0 },
    { type: "pfx_native_callback_leave", callbackAddress: "0x1008dab8c", sampleIndex: 0, retval: "0x1" },
  ]);
  const summary = summarizeCapture({ targetManifest, inputPath }).summary;

  assert.equal(summary.captureStatus, "ready-for-manual-callback-review");
  assert.equal(summary.readyForManualCallbackReview, true);
  assert.equal(summary.observedCompleteTargets, 2);
  assert.equal(summary.completedSamples, 2);
});
