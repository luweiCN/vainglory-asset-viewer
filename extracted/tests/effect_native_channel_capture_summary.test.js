const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCapture } = require("../tools/effect_native_channel_capture_summary");

const targetManifest = {
  targets: [
    {
      functionAddress: "0x1003ed408",
      sourceFunction: "FUN_1003ed408",
      contexts: [
        {
          reason: "native-effect-channel-resource-unresolved",
          effectToken: "Effect_Test_Channel",
          selectorOutputRole: "",
          globalCandidateResourcePaths: [],
          kindredCandidateResourcePaths: [],
        },
      ],
    },
    {
      functionAddress: "0x10047e8c0",
      sourceFunction: "FUN_10047e8c0",
      contexts: [
        {
          reason: "kindred-slot-candidate-unresolved",
          effectToken: "Effect_Test_Candidate",
          selectorOutputRole: "projectile",
          kindredCandidateResourcePaths: ["Effects/Test/A.pfx", "Effects/Test/B.pfx"],
        },
      ],
    },
  ],
};

function writeJsonl(records) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-channel-capture-"));
  const inputPath = path.join(tempDir, "capture.jsonl");
  fs.writeFileSync(inputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return inputPath;
}

test("summarizeCapture reports missing native effect-channel captures without failing", () => {
  const summary = summarizeCapture({
    targetManifest,
    inputPath: path.join(os.tmpdir(), "missing-effect-channel-capture.jsonl"),
  }).summary;

  assert.equal(summary.captureImported, false);
  assert.equal(summary.captureStatus, "capture-missing");
  assert.equal(summary.readyForFullMappingReview, false);
  assert.deepEqual(summary.byReason, {
    "native-effect-channel-resource-unresolved": 1,
    "kindred-slot-candidate-unresolved": 1,
  });
});

test("summarizeCapture keeps partial native effect-channel captures gated", () => {
  const inputPath = writeJsonl([
    { type: "effect_native_channel_capture_begin", targets: 2 },
    { type: "effect_native_channel_attached", functionAddress: "0x1003ed408" },
    {
      type: "effect_native_channel_enter",
      functionAddress: "0x1003ed408",
      sampleIndex: 0,
      args: [{ index: 0, value: "0x2000", memory64: "01020304", cstring64: "" }],
    },
    {
      type: "effect_native_channel_leave",
      functionAddress: "0x1003ed408",
      sampleIndex: 0,
      retval: "0x0",
      argsAfter: [{ index: 0, value: "0x2000", memory64: "01020304" }],
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureStatus, "partial-target-coverage");
  assert.equal(manifest.summary.partialCaptureUseful, true);
  assert.equal(manifest.summary.observedCompleteTargets, 1);
  assert.equal(manifest.summary.completeArgumentSnapshotTargets, 1);
  assert.equal(manifest.summary.readableArgumentRows, 1);
  assert.equal(manifest.summary.completeReturnValueTargets, 1);
  assert.equal(manifest.items[1].candidateResourcePathCount, 2);
  assert.equal(manifest.items[1].candidateResourcePathSamples, "Effects/Test/A.pfx|Effects/Test/B.pfx");
});

test("summarizeCapture keeps complete native effect-channel samples gated without argument snapshots", () => {
  const inputPath = writeJsonl([
    { type: "effect_native_channel_capture_begin", targets: 2 },
    { type: "effect_native_channel_attached", functionAddress: "0x1003ed408" },
    { type: "effect_native_channel_enter", functionAddress: "0x1003ed408", sampleIndex: 0 },
    { type: "effect_native_channel_leave", functionAddress: "0x1003ed408", sampleIndex: 0, retval: "0x0" },
    { type: "effect_native_channel_attached", functionAddress: "0x10047e8c0" },
    { type: "effect_native_channel_enter", functionAddress: "0x10047e8c0", sampleIndex: 0 },
    { type: "effect_native_channel_leave", functionAddress: "0x10047e8c0", sampleIndex: 0, retval: "0x1" },
  ]);
  const summary = summarizeCapture({ targetManifest, inputPath }).summary;

  assert.equal(summary.captureStatus, "argument-snapshots-missing");
  assert.equal(summary.readyForFullMappingReview, false);
  assert.equal(summary.observedCompleteTargets, 2);
  assert.equal(summary.completeArgumentSnapshotTargets, 0);
});

test("summarizeCapture marks native effect-channel captures ready only with complete samples, argument snapshots, and return values", () => {
  const inputPath = writeJsonl([
    { type: "effect_native_channel_capture_begin", targets: 2 },
    { type: "effect_native_channel_attached", functionAddress: "0x1003ed408" },
    {
      type: "effect_native_channel_enter",
      functionAddress: "0x1003ed408",
      sampleIndex: 0,
      args: [
        { index: 0, value: "0x2000", memory64: "01020304", cstring64: "" },
        { index: 1, value: "0x0", memory64: "" },
      ],
    },
    {
      type: "effect_native_channel_leave",
      functionAddress: "0x1003ed408",
      sampleIndex: 0,
      retval: "0x0",
      argsAfter: [{ index: 0, value: "0x2000", memory64: "01020304" }],
    },
    { type: "effect_native_channel_attached", functionAddress: "0x10047e8c0" },
    {
      type: "effect_native_channel_enter",
      functionAddress: "0x10047e8c0",
      sampleIndex: 0,
      args: [{ index: 0, value: "0x3000", memory64: "05060708", cstring64: "Effects/Test/A.pfx" }],
    },
    {
      type: "effect_native_channel_leave",
      functionAddress: "0x10047e8c0",
      sampleIndex: 0,
      retval: "0x1",
      argsAfter: [{ index: 0, value: "0x3000", memory64: "05060708" }],
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });
  const summary = manifest.summary;

  assert.equal(summary.captureStatus, "ready-for-full-mapping-review");
  assert.equal(summary.readyForFullMappingReview, true);
  assert.equal(summary.observedCompleteTargets, 2);
  assert.equal(summary.completeArgumentSnapshotTargets, 2);
  assert.equal(summary.readableArgumentTargets, 2);
  assert.equal(summary.completeReturnValueTargets, 2);
  assert.equal(summary.completedSamples, 2);
  assert.equal(summary.argumentRows, 3);
  assert.equal(summary.readableArgumentRows, 2);
  assert.equal(summary.returnValueSamples, 2);
  assert.equal(manifest.items[1].argumentStringRows, 1);
  assert.equal(manifest.items[1].argumentPointerSamples, "0:0x3000");
});
