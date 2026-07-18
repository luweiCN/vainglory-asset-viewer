const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { summarize, run } = require("../tools/runtime_key_selector_capture_summary");

function event(eventName, extra = {}) {
  return {
    type: "runtime_key_selector_event",
    event: eventName,
    timestampMs: 1,
    ...extra,
  };
}

function probeSamples() {
  return {
    pointer: "0x5000",
    samples: Array.from({ length: 6 }, (_, index) => ({
      index,
      x: index + 0.1,
      y: index + 0.2,
      z: index + 0.3,
      w: index + 0.4,
    })),
  };
}

test("runtime selector capture gate requires profile evidence in the closed sequence", () => {
  const { summary } = summarize([
    event("active-helper-8befac", {
      key: { bestString: "PreviewLevelKey" },
    }),
    event("level-setup-registered-callback"),
    event("level-visuals-loader", {
      levelVisualsRefsAtPlus10: {
        items: [{ string: { bestString: "Levels/Visuals/MapViewer_5v5_Visuals.def" } }],
      },
    }),
    event("level-visuals-apply-processor", {
      levelVisualsSchemaFieldSnapshot: { fields: [{}] },
      levelVisualsApplyFieldSnapshot: { fields: [{}] },
      profilePayloadAtPlus50: {
        string: { bestString: "Environment/F002/S000/F002_S000.lightfield" },
      },
    }),
    event("lightfield-profile-loader-candidate", {
      profileRequest: { bestString: "Environment/F002/S000/F002_S000.lightfield" },
      profileStatus: 1,
    }),
    event("scene-probe-position-sample-upload", {
      positionSample: { pointer: "0x1234", x: 1, y: 2, z: 3 },
    }),
    event("scene-probe-lightfield-position-sampler", {
      positionSample: { pointer: "0x1234", x: 1, y: 2, z: 3 },
      outputPointer: "0x5000",
    }),
    event("scene-probe-lightfield-position-sampler-leave", {
      outputPointer: "0x5000",
      probeSamples: probeSamples(),
    }),
  ]);

  assert.equal(summary.captureImported, true);
  assert.equal(summary.captureStatus, "runtime-selector-capture-imported");
  assert.equal(summary.gateEvidence.readySequenceCount, 1);
  assert.equal(summary.gateEvidence.readyProfileEvidenceSequenceCount, 1);
  assert.equal(summary.gateEvidence.readyProfileConsistentSequenceCount, 1);
  assert.equal(summary.gateEvidence.readyLightProbeEvidenceSequenceCount, 1);
  assert.equal(summary.gateEvidence.runtimeCaptureReadinessState, "ready-for-manual-profile-review");
  assert.deepEqual(summary.gateEvidence.missingGateEvidence, []);
  assert.equal(summary.gateEvidence.runtimeCaptureReadyForManualReview, true);
  assert.equal(summary.gateEvidence.runtimeLightProbeCaptureReadyForManualReview, true);
  assert.equal(summary.gateEvidence.sceneProbeSampleValuesObserved, true);
  assert.deepEqual(summary.activeHelperSequences[0].profileEvidence, {
    levelVisualsRefKeys: ["Levels/Visuals/MapViewer_5v5_Visuals.def"],
    levelVisualsProfilePayload: "Environment/F002/S000/F002_S000.lightfield",
    lightfieldProfileRequest: "Environment/F002/S000/F002_S000.lightfield",
    lightfieldProfileStatus: 1,
    hasProfileEvidence: true,
    profileValuesMatch: true,
  });
  assert.deepEqual(summary.activeHelperSequences[0].lightProbeEvidence.positionSampleUpload, {
    pointer: "0x1234",
    x: 1,
    y: 2,
    z: 3,
  });
  assert.equal(summary.activeHelperSequences[0].lightProbeEvidence.sampledProbeValues.samples.length, 6);
  assert.equal(summary.activeHelperSequences[0].lightProbeEvidence.profilePositionAndValuesReady, true);
});

test("runtime selector capture with profile but no probe sample values keeps light probe review blocked", () => {
  const { summary } = summarize([
    event("active-helper-8befac", {
      key: { bestString: "PreviewLevelKey" },
    }),
    event("level-setup-registered-callback"),
    event("level-visuals-loader", {
      levelVisualsRefsAtPlus10: {
        items: [{ string: { bestString: "Levels/Visuals/MapViewer_5v5_Visuals.def" } }],
      },
    }),
    event("level-visuals-apply-processor", {
      profilePayloadAtPlus50: {
        string: { bestString: "Environment/F002/S000/F002_S000.lightfield" },
      },
    }),
    event("lightfield-profile-loader-candidate", {
      profileRequest: { bestString: "Environment/F002/S000/F002_S000.lightfield" },
      profileStatus: 1,
    }),
    event("scene-probe-position-sample-upload", {
      positionSample: { pointer: "0x1234", x: 1, y: 2, z: 3 },
    }),
  ]);

  assert.equal(summary.gateEvidence.runtimeCaptureReadyForManualReview, true);
  assert.equal(summary.gateEvidence.runtimeLightProbeCaptureReadyForManualReview, false);
  assert.equal(summary.gateEvidence.readyProfileEvidenceSequenceCount, 1);
  assert.equal(summary.gateEvidence.readyLightProbeEvidenceSequenceCount, 0);
  assert.deepEqual(summary.gateEvidence.missingGateEvidence, [
    "scene-probe-sample-values-not-observed",
    "same-sequence-position-or-probe-sample-values-missing",
  ]);
});

test("runtime selector capture with calls but no profile key stays blocked", () => {
  const { summary } = summarize([
    event("active-helper-8befac", {
      key: { bestString: "PreviewLevelKey" },
    }),
    event("level-setup-registered-callback"),
    event("level-visuals-loader"),
    event("level-visuals-apply-processor"),
    event("lightfield-profile-loader-candidate"),
  ]);

  assert.equal(summary.gateEvidence.readySequenceCount, 1);
  assert.equal(summary.gateEvidence.readyProfileEvidenceSequenceCount, 0);
  assert.equal(summary.gateEvidence.runtimeCaptureReadinessState, "closed-sequence-missing-profile-evidence");
  assert.deepEqual(summary.gateEvidence.missingGateEvidence, [
    "scene-probe-position-sample-not-observed",
    "scene-probe-sample-values-not-observed",
    "same-sequence-profile-evidence-missing",
  ]);
  assert.equal(summary.gateEvidence.runtimeCaptureReadyForManualReview, false);
  assert.equal(summary.activeHelperSequences[0].profileEvidenceReadyForManualReview, false);
});

test("runtime selector capture with no events reports the concrete missing gate", () => {
  const { summary } = summarize([]);

  assert.equal(summary.gateEvidence.runtimeCaptureReadinessState, "no-runtime-events");
  assert.deepEqual(summary.gateEvidence.missingGateEvidence, ["no-runtime-events"]);
});

test("runtime selector capture run writes a missing-input summary instead of throwing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-key-selector-"));
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");

  const summary = run({
    inputPath: path.join(tempDir, "missing.jsonl"),
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.captureImported, false);
  assert.equal(summary.captureStatus, "runtime-selector-capture-missing");
  assert.equal(summary.gateEvidence.runtimeCaptureReadinessState, "capture-not-imported");
  assert.deepEqual(summary.gateEvidence.missingGateEvidence, ["runtime-key-selector-capture-not-imported"]);
  assert.equal(summary.gateEvidence.runtimeCaptureReadyForManualReview, false);
  assert.equal(summary.gateEvidence.runtimeLightProbeCaptureReadyForManualReview, false);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).captureImported, false);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).captureStatus, "runtime-selector-capture-missing");
  assert.match(fs.readFileSync(tsvOut, "utf8"), /index\ttimestampMs\tevent/);
});
