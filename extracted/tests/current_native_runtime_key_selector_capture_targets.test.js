const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeRuntimeKeySelectorCaptureTargets,
  exportCurrentNativeRuntimeKeySelectorCaptureTargets,
} = require("../tools/current_native_runtime_key_selector_capture_targets");

test("runtime key selector capture targets validate current Android hook points and script coverage", () => {
  const manifest = buildCurrentNativeRuntimeKeySelectorCaptureTargets({}, "TEST_DATE");
  const summary = manifest.summary;

  assert.equal(summary.hookTargetRows, 17);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.scriptHookRows, 17);
  assert.equal(summary.scriptEventRows, 17);
  assert.equal(summary.scriptEvidenceMismatchRows, 0);
  assert.equal(summary.captureScriptPresent, true);
  assert.equal(summary.runtimeSelectorHooksReady, true);
  assert.equal(summary.activePreviewKeyHooksReady, true);
  assert.equal(summary.objectBuilderBHooksReady, true);
  assert.equal(summary.typedObjectKeyHooksReady, true);
  assert.equal(summary.levelVisualsHooksReady, true);
  assert.equal(summary.lightProbeProfileHooksReady, true);
  assert.equal(summary.lightProbePositionHooksReady, true);
  assert.equal(summary.lightProbeSampleValueHooksReady, true);
  assert.equal(summary.lightProbeHooksReady, true);
  assert.equal(summary.activePreviewRuntimeValuesRecovered, false);
  assert.equal(summary.runtimeLightProbeValuesRecovered, false);
  assert.equal(summary.rendererProfileTakeoverAllowed, false);
  assert.equal(summary.rendererLightProbeTakeoverAllowed, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.name === "active-level-setup-dispatch-callsite"));
  assert.ok(manifest.items.some((row) => row.name === "level-visuals-apply-processor"));
  assert.ok(manifest.items.some((row) => row.name === "scene-probe-lightfield-position-sampler"));
  assert.ok(
    manifest.items.some((row) =>
      row.emittedEvents.includes("scene-probe-lightfield-position-sampler-leave"),
    ),
  );
});

test("runtime key selector capture target export writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-key-selector-targets-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportCurrentNativeRuntimeKeySelectorCaptureTargets({ jsonOut, viewerOut, tsvOut });

  assert.equal(summary.runtimeSelectorHooksReady, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /active-level-setup-dispatch-callsite/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /lightfield-profile-loader-candidate/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /scene-probe-lightfield-position-sampler-leave/);
});
