const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeStaticMeshShaderParamsCaptureTargets,
  exportCurrentNativeStaticMeshShaderParamsCaptureTargets,
  fridaScriptForTargets,
} = require("../tools/current_native_static_mesh_shaderparams_capture_targets");

test("static mesh ShaderParams capture targets validate current Android hook points", () => {
  const manifest = buildCurrentNativeStaticMeshShaderParamsCaptureTargets();
  const summary = manifest.summary;

  assert.equal(summary.hookTargetRows, 7);
  assert.equal(summary.opcodeRows, 13);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.levelVisualsHookRows, 4);
  assert.equal(summary.staticMeshFieldHookRows, 3);
  assert.equal(summary.captureScriptGenerated, true);
  assert.equal(summary.levelVisualsApplySnapshotHookReady, true);
  assert.equal(summary.staticMeshSelectorFieldHooksReady, true);
  assert.equal(summary.shaderParamsBoundedPrefixCaptureReady, true);
  assert.equal(summary.runtimeCaptureRequiredRows, 1);
  assert.equal(summary.activeResourceSemanticsRecovered, false);
  assert.equal(summary.shaderParamsValueSemanticsRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.name === "staticmesh-shaderparams-field-read"));
  assert.ok(manifest.items.some((row) => row.role === "selector-caller-resource-list-load"));
});

test("exportCurrentNativeStaticMeshShaderParamsCaptureTargets writes report, viewer JSON, TSV, and Frida script", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-staticmesh-shaderparams-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const fridaOut = path.join(tempDir, "capture.js");

  const summary = exportCurrentNativeStaticMeshShaderParamsCaptureTargets({ jsonOut, viewerOut, tsvOut, fridaOut });

  assert.equal(summary.staticMeshSelectorFieldHooksReady, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  assert.ok(fs.existsSync(fridaOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /staticmesh-shaderparams-field-read/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /readShaderParamsPointerList/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /static_mesh_shaderparams_capture_event/);
});

test("fridaScriptForTargets reads StaticMesh x19 snapshots without renderer promotion", () => {
  const script = fridaScriptForTargets([
    {
      name: "staticmesh-shaderparams-field-read",
      offset: 0x8ccae8,
      captureKind: "staticmesh-field-snapshot",
      reason: "test",
    },
  ]);

  assert.ok(script.includes("readStaticMeshSnapshot(this.context.x19)"));
  assert.match(script, /field68ShaderParamsList/);
  assert.match(script, /diagnostic-only capture/);
});
