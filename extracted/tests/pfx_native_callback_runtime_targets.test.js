const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTargetsFromGapManifest,
  fridaScriptForTargets,
} = require("../tools/pfx_native_callback_runtime_targets");

test("buildTargetsFromGapManifest extracts native PFX callback runtime blockers", () => {
  const manifest = buildTargetsFromGapManifest(
    {
      items: [
        {
          id: "ios:random-size",
          effectToken: "Effect_Test_RandomSize",
          actionKeys: ["ability03"],
          heroNames: ["Hero999"],
          pfxPath: "Effects/Test/RandomSize/RandomSize.pfx",
          shadergraphPath: "Effects/Test/RandomSize/RandomSize.Surface[5].shadergraph",
          surfaceIndex: 5,
          areaShapeGapBlockClass: "blocked-random-range-callback",
          areaShapeGapRuntimeRequirement: "requires-native-callback-runtime",
          areaShapeGapSizeCallbackCurrentDependencyFlags: "time-input,random",
          areaShapeGapSizeCallbackRandomRange: "0..360",
          pfxShapeCallbacks: [
            "initialSizeCallback:current=0x1008dab8c:currentClass=computed-callback:currentDeps=time-input,random:randomRange=0..360:inputValue=0x111",
            "sizeCallback:current=0x1008da914:currentClass=computed-callback:currentStore=random-affine-to-param2:currentDeps=time-input,random:randomRange=0..360:inputValue=0x222",
          ],
          source: { functionName: "FUN_TEST", line: 12 },
        },
        {
          id: "ios:overlay-size",
          effectToken: "Effect_Test_Overlay",
          pfxPath: "Effects/Test/Overlay/Overlay.pfx",
          surfaceIndex: 9,
          areaShapeGapBlockClass: "blocked-ios-encrypted-pattern16-data",
          areaShapeGapRuntimeRequirement: "requires-runtime-overlay",
          pfxShapeCallbacks: ["sizeCallback:current=0x100001000:pattern16Read=encrypted-range"],
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(manifest.summary.sourceRows, 1);
  assert.equal(manifest.summary.targets, 2);
  assert.equal(manifest.summary.callbackContexts, 2);
  assert.equal(manifest.summary.effectTokens, 1);
  assert.deepEqual(manifest.summary.byRuntimeRequirement, {
    "requires-native-callback-runtime": 1,
  });
  assert.deepEqual(manifest.summary.byBlockClass, {
    "blocked-random-range-callback": 1,
  });
  assert.deepEqual(manifest.summary.byDependencyFlags, {
    "time-input,random": 1,
  });
  assert.deepEqual(manifest.targets.map((target) => target.callbackAddress), ["0x1008da914", "0x1008dab8c"]);
  assert.equal(manifest.targets[0].contexts[0].slot, "sizeCallback");
  assert.equal(manifest.targets[0].contexts[0].currentStore, "random-affine-to-param2");
  assert.equal(manifest.targets[0].contexts[0].randomRange, "0..360");
  assert.deepEqual(manifest.targets[0].contexts[0].sourceRows, [
    {
      id: "ios:random-size",
      sourceKind: "",
      sourceFunction: "FUN_TEST",
      sourceLine: 12,
    },
  ]);
});

test("fridaScriptForTargets emits a bounded diagnostic hook script", () => {
  const manifest = buildTargetsFromGapManifest(
    {
      items: [
        {
          id: "ios:random-size",
          effectToken: "Effect_Test_RandomSize",
          pfxPath: "Effects/Test/RandomSize/RandomSize.pfx",
          surfaceIndex: 5,
          areaShapeGapBlockClass: "blocked-random-range-callback",
          areaShapeGapRuntimeRequirement: "requires-native-callback-runtime",
          pfxShapeCallbacks: ["sizeCallback:current=0x1008da914:currentDeps=time-input,random:randomRange=0..360"],
        },
      ],
    },
    "TEST_DATE",
  );

  const script = fridaScriptForTargets(manifest);

  assert.match(script, /pfx_native_callback_begin/);
  assert.match(script, /pfx_native_callback_enter/);
  assert.match(script, /MAX_SAMPLES_PER_TARGET = 16/);
  assert.match(script, /0x1008da914/);
});
