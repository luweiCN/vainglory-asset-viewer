const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets,
  exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets,
  fridaScriptForTargets,
} = require("../tools/current_native_layout_b_object_ac_runtime_capture_targets");

test("layout B object+0xac runtime capture target audit validates hook and opcode boundaries", () => {
  const manifest = buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({}, "TEST_DATE");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.hookTargetRows, 10);
  assert.equal(manifest.summary.opcodeRows, 9);
  assert.equal(manifest.summary.opcodeMismatchRows, 0);
  assert.equal(manifest.summary.captureScriptGenerated, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  const slot0 = manifest.hookTargets.find((row) => row.name === "layout-b-slot0-register-entry");
  assert.equal(slot0?.addressHex, "0x8d310c");
  assert.equal(slot0.actualOpcodeHex, "d0011081");

  const particleMask = manifest.opcodeEvidenceRows.find((row) => row.role === "particle-draw-mask-0x200");
  assert.equal(particleMask?.addressHex, "0x820fd4");
  assert.equal(particleMask.actualOpcodeHex, "321703e1");
});

test("fridaScriptForTargets emits non-mutating hooks for layout B object fields", () => {
  const script = fridaScriptForTargets([
    {
      name: "layout-b-slot0-register-entry",
      offset: 0x8d310c,
      captureKind: "layout-b-object-entry",
      reason: "test",
    },
  ]);

  assert.match(script, /Interceptor\.attach/);
  assert.match(script, /readLayoutBObject/);
  assert.match(script, /objectAcU32/);
  assert.doesNotMatch(script, /writeU32|writeByteArray|Memory\\.patchCode/);
});

test("exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets writes report, viewer, TSV, and Frida script", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-object-ac-runtime-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const fridaOut = path.join(tempDir, "capture.js");

  const summary = exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({
    viewerOut,
    jsonOut,
    tsvOut,
    fridaOut,
  });

  assert.equal(summary.hookTargetRows, 10);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /object\+0xac runtime capture/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /particle-entry-array-builder-entry/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-slot0-register-entry/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /layout-b-object-ac-capture-start/);
});
