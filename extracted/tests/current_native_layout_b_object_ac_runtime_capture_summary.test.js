const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCapture } = require("../tools/current_native_layout_b_object_ac_runtime_capture_summary");

const targetManifest = {
  hookTargets: [
    {
      name: "layout-b-slot0-register-entry",
      addressHex: "0x8d310c",
      captureKind: "layout-b-object-entry",
      reason: "capture live object+0xac before slot0 forwards it to manager add-record",
    },
    {
      name: "layout-b-manager-add-record-callsite",
      addressHex: "0x8d3a2c",
      captureKind: "manager-add-callsite",
      reason: "capture x2 flags and x3 object+0x30 entry at the exact layout B add-record callsite",
    },
    {
      name: "backing-add-record-flag-store",
      addressHex: "0x18bf580",
      captureKind: "backing-flag-store",
      reason: "capture the backing record +0x18 flag value stored from w2",
    },
    {
      name: "particle-entry-array-builder-entry",
      addressHex: "0x188e784",
      captureKind: "particle-entry-array-builder",
      reason: "capture draw-batch masks reaching the shared entry-array builder, especially 0x200",
    },
  ],
};

function writeJsonl(records) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-object-ac-capture-"));
  const inputPath = path.join(tempDir, "capture.jsonl");
  fs.writeFileSync(inputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return inputPath;
}

test("summarizeCapture reports missing layout B object+0xac captures without failing", () => {
  const summary = summarizeCapture({
    targetManifest,
    inputPath: path.join(os.tmpdir(), "missing-layout-b-object-ac-capture.jsonl"),
  }).summary;

  assert.equal(summary.captureImported, false);
  assert.equal(summary.captureStatus, "capture-missing");
  assert.equal(summary.readyForManualProducerReview, false);
  assert.equal(summary.targetRows, 4);
  assert.equal(summary.missingTargetRows, 4);
  assert.equal(summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture keeps partial layout B object+0xac captures gated when only draw mask is seen", () => {
  const inputPath = writeJsonl([
    { event: "layout-b-object-ac-capture-start", targetCount: 4 },
    {
      event: "layout-b-slot0-register-entry",
      captureKind: "layout-b-object-entry",
      layoutBObject: { pointer: "0x1000", objectAcU32: 2 },
    },
    {
      event: "particle-entry-array-builder-entry",
      captureKind: "particle-entry-array-builder",
      filterMaskW1: 0x200,
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureImported, true);
  assert.equal(manifest.summary.captureStatus, "partial-target-coverage");
  assert.equal(manifest.summary.particleDrawMaskEvents, 1);
  assert.equal(manifest.summary.runtimeParticleFlagObservedEvents, 0);
  assert.equal(manifest.summary.readyForManualProducerReview, false);
  assert.equal(manifest.summary.layoutBObjectsObserved, 1);
});

test("summarizeCapture marks layout B object+0xac captures ready for manual review only after live 0x200 values are seen", () => {
  const inputPath = writeJsonl([
    { event: "layout-b-object-ac-capture-start", targetCount: 4 },
    {
      event: "layout-b-slot0-register-entry",
      captureKind: "layout-b-object-entry",
      layoutBObject: { pointer: "0x1000", objectAcU32: 0x202 },
    },
    {
      event: "layout-b-manager-add-record-callsite",
      captureKind: "manager-add-callsite",
      flagsW2: 0x202,
      layoutBObject: { pointer: "0x1000", objectAcU32: 0x202 },
    },
    {
      event: "backing-add-record-flag-store",
      captureKind: "backing-flag-store",
      flagsW2: 0x202,
      backingRecord: "0x2000",
    },
    {
      event: "particle-entry-array-builder-entry",
      captureKind: "particle-entry-array-builder",
      filterMaskW1: 0x200,
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureStatus, "ready-for-runtime-value-review");
  assert.equal(manifest.summary.readyForManualProducerReview, true);
  assert.equal(manifest.summary.runtimeParticleFlagObservedEvents, 3);
  assert.equal(manifest.summary.particleDrawMaskEvents, 1);
  assert.equal(manifest.summary.layoutBObjectsWithParticleFlag, 1);
  assert.equal(manifest.items[1].managerAddFlagParticleMaskEvents, 1);
  assert.equal(manifest.items[2].backingStoreParticleMaskEvents, 1);
});
