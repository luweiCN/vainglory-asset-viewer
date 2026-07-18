const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportCurrentNativeStaticMeshShaderParamsCaptureSummary,
  summarizeCapture,
} = require("../tools/current_native_static_mesh_shaderparams_capture_summary");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

function targetManifest() {
  return {
    summary: {
      hookTargetRows: 7,
      opcodeMismatchRows: 0,
      levelVisualsApplySnapshotHookReady: true,
      staticMeshSelectorFieldHooksReady: true,
      shaderParamsBoundedPrefixCaptureReady: true,
      renderPromotionAllowedRows: 0,
    },
    items: [
      { source: "hook-target", name: "level-visuals-apply-processor" },
      { source: "hook-target", name: "staticmesh-shaderparams-field-read" },
    ],
  };
}

test("static mesh ShaderParams capture summary reports missing input without renderer promotion", () => {
  const manifest = summarizeCapture({
    targetManifest: targetManifest(),
    inputPath: path.join(os.tmpdir(), "missing-staticmesh-shaderparams.jsonl"),
  });

  assert.equal(manifest.summary.captureImported, false);
  assert.equal(manifest.summary.captureStatus, "capture-missing");
  assert.equal(manifest.summary.targetHookRows, 7);
  assert.equal(manifest.summary.targetHooksReady, true);
  assert.equal(manifest.summary.readyForManualShaderParamsReview, false);
  assert.equal(manifest.summary.activeResourceSemanticsRecovered, false);
  assert.equal(manifest.summary.shaderParamsValueSemanticsRecovered, false);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("static mesh ShaderParams capture summary identifies bounded source keys for manual review only", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-staticmesh-shaderparams-summary-"));
  const inputPath = path.join(tempDir, "capture.jsonl");
  writeJsonl(inputPath, [
    {
      type: "static_mesh_shaderparams_capture_event",
      event: "capture-begin",
      targetCount: 7,
    },
    {
      type: "static_mesh_shaderparams_capture_event",
      event: "level-visuals-apply-processor",
      captureKind: "levelvisuals-field-snapshot",
      levelVisualsSnapshot: {
        levelVisualsPointer: "0x1000",
        fields: [{ name: "sourceTableSelectorListA", fieldPointer: "0x2000" }],
      },
    },
    {
      type: "static_mesh_shaderparams_capture_event",
      event: "staticmesh-shaderparams-field-read",
      captureKind: "staticmesh-field-snapshot",
      staticMeshSnapshot: {
        staticMeshPointer: "0x3000",
        field68ShaderParamsListPointer: "0x4000",
        field68ShaderParamsList: {
          items: [
            {
              index: 0,
              shaderParamsPointer: "0x5000",
              sourceKey: "sampler2",
              shaderParamList: {
                items: [{ index: 0, shaderParamPointer: "0x6000", scalarU32: 7 }],
              },
            },
          ],
        },
      },
    },
  ]);

  const manifest = summarizeCapture({ targetManifest: targetManifest(), inputPath });

  assert.equal(manifest.summary.captureImported, true);
  assert.equal(manifest.summary.captureStatus, "ready-for-manual-shaderparams-review");
  assert.equal(manifest.summary.levelVisualsSnapshotRows, 1);
  assert.equal(manifest.summary.staticMeshSnapshotRows, 1);
  assert.equal(manifest.summary.shaderParamsListEntryRows, 1);
  assert.equal(manifest.summary.shaderParamValueRows, 1);
  assert.deepEqual(manifest.summary.sourceKeyValues, ["sampler2"]);
  assert.equal(manifest.summary.readyForManualShaderParamsReview, true);
  assert.equal(manifest.summary.activeResourceSemanticsRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("export static mesh ShaderParams capture summary writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-staticmesh-shaderparams-summary-out-"));
  const targetsPath = path.join(tempDir, "targets.json");
  const inputPath = path.join(tempDir, "missing.jsonl");
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  writeJson(targetsPath, targetManifest());

  const summary = exportCurrentNativeStaticMeshShaderParamsCaptureSummary({
    targetsPath,
    inputPath,
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.captureStatus, "capture-missing");
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.captureImported, false);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.targetHooksReady, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /index\tevent\tcaptureKind/);
});
