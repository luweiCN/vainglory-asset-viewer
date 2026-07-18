const assert = require("node:assert/strict");
const test = require("node:test");

const { summarize } = require("../tools/current_native_light_probe_chain_audit");

function record(name, { directCallers = [], dataReferences = [], textAddressReferences = [] } = {}) {
  return {
    name,
    directCallers: directCallers.map((callerAddressHex) => ({ callerAddressHex })),
    dataReferences: dataReferences.map((section) => ({ section })),
    textAddressReferences: textAddressReferences.map((xrefAddressHex) => ({ xrefAddressHex })),
    pointerNeighborhoods: [],
  };
}

test("current native light/probe summary separates recovered profile path from active payload takeover", () => {
  const summary = summarize([
    record("level-runtime-visuals-loader", { directCallers: ["0x8cc640"] }),
    record("current-level-runtime-visuals-loader-slot", { dataReferences: [".data.rel.ro"] }),
    record("levelvisuals-runtime-apply-processor", { directCallers: ["0x8cc02c"] }),
    record("scene-probe-service-entry-profile-payload-load", { directCallers: ["0x8cc568"] }),
    record("scene-probe-inner-vtable-profile-payload-slot", { dataReferences: [".data.rel.ro"] }),
    record("scene-probe-lightfield-profile-parser", { directCallers: ["0xe38cc0"] }),
    record("scene-probe-service-entry-position-sample-upload", { directCallers: ["0x1891cb8"] }),
    record("scene-probe-lightfield-position-sampler", { directCallers: ["0xe38cb8"] }),
    record("current-levelvisuals-field-table-start", { textAddressReferences: ["0x7cebf0"] }),
    record("current-levelvisuals-field-table-end", { textAddressReferences: ["0x7ced64"] }),
  ]);

  assert.equal(summary.levelVisualsLoaderRecovered, true);
  assert.equal(summary.levelVisualsApplyProcessorRecovered, true);
  assert.equal(summary.sceneProbeProfilePayloadPathRecovered, true);
  assert.equal(summary.sceneProbePositionSamplePathRecovered, true);
  assert.equal(
    summary.profilePayloadPathStatus,
    "profile-payload-entry-and-lightfield-parser-recovered-active-payload-unresolved",
  );
  assert.equal(summary.activeProfilePayloadConcreteValueRecovered, false);
  assert.equal(summary.activeHeroPreviewProfileResolved, false);
  assert.equal(summary.rendererLightProbeTakeoverAllowed, false);
  assert.match(summary.activeProfileBlocker, /concrete active hero\/model preview/);
});
