const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeMaterialSourceProgramCaptureTargets,
  exportCurrentNativeMaterialSourceProgramCaptureTargets,
  fridaScriptForTargets,
} = require("../tools/current_native_material_source_program_capture_targets");

test("material source/program capture targets validate current Android hook points", () => {
  const manifest = buildCurrentNativeMaterialSourceProgramCaptureTargets({}, "TEST_DATE");
  const summary = manifest.summary;

  assert.equal(summary.hookTargetRows, 14);
  assert.equal(summary.opcodeRows, 26);
  assert.equal(summary.opcodeMismatchRows, 0);
  assert.equal(summary.captureScriptGenerated, true);
  assert.equal(summary.captureScriptTargetRows, 14);
  assert.equal(summary.captureScriptEventRows, 30);
  assert.equal(summary.captureScriptMismatchRows, 0);
  assert.equal(summary.captureEventLimit, 256);
  assert.equal(summary.captureLimitEventCovered, true);
  assert.equal(summary.resourceListCaptureLimit, 64);
  assert.equal(summary.nestedResourceIdCaptureLimit, 32);
  assert.equal(summary.resourceListTruncationFieldCovered, true);
  assert.equal(summary.nestedResourceIdTruncationFieldCovered, true);
  assert.equal(summary.sourceProgramTableEntryCaptureLimit, 128);
  assert.equal(summary.sourceProgramTableTruncationFieldCovered, true);
  assert.equal(summary.sourceProgramCaptureScriptCoverageReady, true);
  assert.equal(summary.dynamicProducerHooksReady, true);
  assert.equal(summary.upstreamSelectionHooksReady, true);
  assert.equal(summary.tableMountHooksReady, true);
  assert.equal(summary.textureRuntimeCaptureHookRows, 4);
  assert.equal(summary.textureRuntimeCaptureHooksReady, true);
  assert.equal(summary.inlineTextureRuntimeCaptureHooksReady, true);
  assert.equal(summary.textureRuntimeCaptureGenerated, true);
  assert.equal(summary.sourceProgramResourceListShapeRecovered, true);
  assert.equal(summary.sourceProgramTableMountRecovered, true);
  assert.equal(summary.resourceListSemanticNamesRecovered, false);
  assert.equal(summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.ok(manifest.items.some((row) => row.name === "dynamic-source-program-producer-entry"));
  assert.ok(manifest.items.some((row) => row.name === "external-texture-runtime-lookup-entry"));
  assert.ok(manifest.items.some((row) => row.name === "runtime-type4-texture-patch-entry"));
  assert.ok(manifest.items.some((row) => row.role === "producer-nested-resource-id-load"));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-target" && row.name === "runtime-type4-texture-patch-entry" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-table-after-decoded-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-source-program-table-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-resource-key-cstring-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-capture-event-limit" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-capture-limit-event" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-resource-list-capture-limit" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-nested-resource-id-capture-limit" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-resource-list-truncation-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-nested-resource-id-truncation-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-source-table-entry-limit" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-source-table-truncation-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-event-id-field" && row.scriptMatches));
  assert.ok(manifest.items.some((row) => row.source === "frida-script-evidence" && row.role === "script-thread-id-field" && row.scriptMatches));
});

test("exportCurrentNativeMaterialSourceProgramCaptureTargets writes report, viewer JSON, TSV, and Frida script", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-source-program-"));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const fridaOut = path.join(tempDir, "capture.js");

  const summary = exportCurrentNativeMaterialSourceProgramCaptureTargets({ jsonOut, viewerOut, tsvOut, fridaOut });

  assert.equal(summary.dynamicProducerHooksReady, true);
  assert.equal(summary.sourceProgramCaptureScriptCoverageReady, true);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(viewerOut));
  assert.ok(fs.existsSync(tsvOut));
  assert.ok(fs.existsSync(fridaOut));
  const exported = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
  assert.equal(exported.summary.renderPromotionAllowedRows, 0);
  assert.equal(exported.summary.captureScriptMismatchRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /dynamic-source-program-producer-entry/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /frida-script-evidence/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /material-source-program-capture-start/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /maxEventsPerHook: 256/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /material-source-program-capture-limit/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /resourceListSnapshot/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /sourceProgramTableSnapshot/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /maxListItems: 64/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /maxNestedItems: 32/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /resourceListCaptureTruncated/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /nestedCaptureTruncated/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /textureLookup/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /resourceKeyCString/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /texturePatch/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /tableDecoded/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /maxSourceTableEntries: 128/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /entryCaptureTruncated/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /eventId/);
  assert.match(fs.readFileSync(fridaOut, "utf8"), /threadId/);
});

test("fridaScriptForTargets captures dynamic source/program resource-list snapshots without renderer promotion", () => {
  const script = fridaScriptForTargets([
    {
      name: "dynamic-source-program-producer-entry",
      offset: 0xbac9d4,
      captureKind: "dynamic-producer-entry",
      reason: "test",
    },
  ]);

  assert.match(script, /material-source-program-capture-event/);
  assert.match(script, /maxEventsPerHook: 256/);
  assert.match(script, /material-source-program-capture-limit/);
  assert.match(script, /resourceListSnapshot/);
  assert.match(script, /sourceProgramTableSnapshot/);
  assert.match(script, /maxListItems: 64/);
  assert.match(script, /maxNestedItems: 32/);
  assert.match(script, /resourceListCaptureTruncated/);
  assert.match(script, /nestedCaptureTruncated/);
  assert.match(script, /maxSourceTableEntries: 128/);
  assert.match(script, /entryCaptureTruncated/);
  assert.match(script, /EVENT_COUNTER/);
  assert.match(script, /currentThreadId/);
  assert.match(script, /diagnostic-only capture/);
  assert.match(script, /no renderer takeover is implied/);
});

test("fridaScriptForTargets captures texture runtime lookup and type4 patch evidence on leave", () => {
  const script = fridaScriptForTargets([
    {
      name: "external-texture-runtime-lookup-entry",
      offset: 0x189df90,
      captureKind: "external-texture-lookup-entry",
      reason: "test texture lookup",
    },
    {
      name: "runtime-type4-texture-patch-entry",
      offset: 0x189cf2c,
      captureKind: "runtime-type4-texture-patch-entry",
      reason: "test type4 patch",
    },
  ]);

  assert.match(script, /capturesOnLeave/);
  assert.match(script, /returnedTextureObject/);
  assert.match(script, /tableAfterDecoded/);
  assert.match(script, /samplerUnitU32/);
});
