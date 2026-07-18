const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeRuntimeCaptureGateAudit,
  exportCurrentNativeRuntimeCaptureGateAudit,
} = require("../tools/current_native_runtime_capture_gate_audit");

function writeJson(tempDir, name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function fixturePaths(tempDir) {
  return {
    materialSourceProgramCaptureSummaryPath: writeJson(tempDir, "material-source-program.json", {
      summary: {
        captureImported: false,
        captureStatus: "capture-missing",
        readyForManualSourceProgramReview: false,
        readyForManualTextureSamplerReview: false,
        renderPromotionAllowedRows: 0,
      },
    }),
    staticMeshShaderParamsCaptureSummaryPath: writeJson(tempDir, "staticmesh-shaderparams.json", {
      summary: {
        captureImported: false,
        captureStatus: "capture-missing",
        readyForManualShaderParamsReview: false,
        renderPromotionAllowedRows: 0,
      },
    }),
    runtimeKeySelectorCaptureSummaryPath: writeJson(tempDir, "runtime-key-selector.json", {
      summary: {
        captureImported: false,
        captureStatus: "runtime-selector-capture-missing",
        gateEvidence: { runtimeCaptureReadinessState: "capture-not-imported" },
        missingGateEvidence: ["runtime-key-selector-capture-not-imported"],
        readyForManualReview: false,
        lightProbeReadyForManualReview: false,
        rendererProfileTakeoverAllowedByThisCapture: false,
      },
    }),
    effectNativeChannelCaptureSummaryPath: writeJson(tempDir, "effect-native-channel.json", {
      summary: {
        captureImported: false,
        captureStatus: "capture-missing",
        readyForFullMappingReview: false,
        renderPromotionAllowedRows: 0,
      },
    }),
    pfxNativeCallbackCaptureSummaryPath: writeJson(tempDir, "pfx-native-callback.json", {
      summary: {
        captureImported: false,
        captureStatus: "capture-missing",
        readyForManualCallbackReview: false,
        renderPromotionAllowedRows: 0,
      },
    }),
    layoutBObjectAcRuntimeCaptureSummaryPath: writeJson(tempDir, "layout-b-object-ac.json", {
      summary: {
        captureImported: false,
        captureStatus: "capture-missing",
        readyForManualProducerReview: false,
        renderPromotionAllowedRows: 0,
      },
    }),
  };
}

test("runtime capture gate keeps all missing live captures as blocking diagnostics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-capture-gate-"));
  const manifest = buildCurrentNativeRuntimeCaptureGateAudit(fixturePaths(tempDir));

  assert.equal(manifest.summary.captureGateRows, 6);
  assert.equal(manifest.summary.captureImportedRows, 0);
  assert.equal(manifest.summary.captureMissingRows, 6);
  assert.equal(manifest.summary.captureReadyForManualReviewRows, 0);
  assert.equal(manifest.summary.allRuntimeCapturesImported, false);
  assert.equal(manifest.summary.allRuntimeCapturesReadyForManualReview, false);
  assert.equal(manifest.summary.anyRenderPromotionAllowed, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(manifest.summary.byCaptureStatus, {
    "capture-missing": 5,
    "runtime-selector-capture-missing": 1,
  });
  assert.deepEqual(manifest.summary.blockingGateNames, [
    "material-source-program",
    "staticmesh-shaderparams",
    "runtime-key-selector",
    "effect-native-channel",
    "pfx-native-callback",
    "layout-b-object-ac",
  ]);
  assert.equal(manifest.items.length, 6);
  assert.equal(manifest.items.every((item) => item.renderPromotionAllowed === false), true);
});

test("runtime capture gate rows name the missing live capture inputs and rebuild commands", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-capture-gate-inputs-"));
  const paths = fixturePaths(tempDir);
  const manifest = buildCurrentNativeRuntimeCaptureGateAudit(paths);

  const materialGate = manifest.items.find((item) => item.gate === "material-source-program");
  assert.equal(materialGate.summaryPath, paths.materialSourceProgramCaptureSummaryPath);
  assert.equal(materialGate.liveCapturePath, "extracted/reports/material_source_program_capture.jsonl");
  assert.equal(materialGate.refreshCommand, "npm run material:capture:refresh --silent");
  assert.equal(materialGate.captureDoc, "docs/material-runtime-capture.md");
  assert.match(materialGate.nextProofRequired, /source\/program/);

  const objectAcGate = manifest.items.find((item) => item.gate === "layout-b-object-ac");
  assert.equal(objectAcGate.liveCapturePath, "extracted/reports/layout_b_object_ac_runtime_capture.jsonl");
  assert.equal(objectAcGate.refreshCommand, "npm run effect:capture:refresh --silent");
  assert.equal(objectAcGate.captureDoc, "docs/effect-runtime-capture.md");
  assert.match(objectAcGate.nextProofRequired, /object\+0xac/);
});

test("runtime capture gate exporter writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-capture-gate-export-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const summary = exportCurrentNativeRuntimeCaptureGateAudit({
    ...fixturePaths(tempDir),
    viewerOut,
    jsonOut,
    tsvOut,
  });

  assert.equal(summary.captureGateRows, 6);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.captureMissingRows, 6);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /material-source-program/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /material_source_program_capture\.jsonl/);
});

test("runtime capture gate accepts raw runtime selector summary files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-capture-gate-raw-selector-"));
  const paths = fixturePaths(tempDir);
  paths.runtimeKeySelectorCaptureSummaryPath = writeJson(tempDir, "runtime-key-selector-raw.json", {
    captureImported: false,
    captureStatus: "runtime-selector-capture-missing",
    gateEvidence: { runtimeCaptureReadinessState: "capture-not-imported" },
    missingGateEvidence: ["runtime-key-selector-capture-not-imported"],
    readyForManualReview: false,
    lightProbeReadyForManualReview: false,
    rendererProfileTakeoverAllowedByThisCapture: false,
  });

  const manifest = buildCurrentNativeRuntimeCaptureGateAudit(paths);

  assert.equal(manifest.summary.byCaptureStatus["runtime-selector-capture-missing"], 1);
  assert.equal(manifest.items.find((item) => item.gate === "runtime-key-selector").captureStatus, "runtime-selector-capture-missing");
});
