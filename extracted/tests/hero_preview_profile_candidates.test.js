const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildHeroPreviewProfileCandidates } = require("../tools/hero_preview_profile_candidates");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("hero preview profile gate treats a missing runtime selector capture summary as not imported", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-profile-gate-"));
  const runtimeCaptureSummaryPath = path.join(tempDir, "runtime_key_selector_capture_summary.json");
  writeJson(runtimeCaptureSummaryPath, {
    captureImported: false,
    captureStatus: "runtime-selector-capture-missing",
    gateEvidence: {
      runtimeCaptureReadinessState: "capture-not-imported",
      missingGateEvidence: ["runtime-key-selector-capture-not-imported"],
      runtimeCaptureReadyForManualReview: false,
      runtimeLightProbeCaptureReadyForManualReview: false,
    },
  });

  const manifest = buildHeroPreviewProfileCandidates({
    levelVisualProfileDiagnosticsPath: path.join(tempDir, "missing-level-visuals.json"),
    definitionInstanceStringsPath: path.join(tempDir, "missing-instance-strings.tsv"),
    definitionSymbolsPath: path.join(tempDir, "missing-symbols.tsv"),
    definitionBuildLinksPath: path.join(tempDir, "missing-build-links.tsv"),
    currentAndroidStringsPath: path.join(tempDir, "missing-strings.txt"),
    currentNativeLevelVisualsSchemaAuditPath: path.join(tempDir, "missing-schema.json"),
    currentNativeLevelRuntimeOwnerAuditPath: path.join(tempDir, "missing-owner.json"),
    currentNativePreviewStringXrefAuditPath: path.join(tempDir, "missing-preview-xrefs.json"),
    runtimeKeySelectorCaptureSummaryPath: runtimeCaptureSummaryPath,
    typedObjectRuntimeKeyPayloadAuditPath: path.join(tempDir, "missing-typed-object.json"),
    nativeContextPaths: [],
  });

  assert.equal(manifest.summary.runtimeSelectorCaptureImported, false);
  assert.equal(manifest.summary.runtimeSelectorCaptureStatus, "runtime-selector-capture-missing");
  assert.equal(manifest.summary.runtimeSelectorCaptureReadinessState, "capture-not-imported");
  assert.deepEqual(manifest.summary.runtimeSelectorCaptureMissingGateEvidence, [
    "runtime-key-selector-capture-not-imported",
  ]);
  assert.equal(manifest.summary.runtimeSelectorCaptureReadyForManualReview, false);
  assert.equal(manifest.summary.runtimeSelectorCaptureLightProbeReadyForManualReview, false);
});
