const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTargetsFromGapManifest,
  fridaScriptForTargets,
} = require("../tools/effect_native_channel_capture_targets");

test("buildTargetsFromGapManifest extracts hookable iOS native effect channel gaps", () => {
  const manifest = buildTargetsFromGapManifest(
    {
      items: [
        {
          id: "android:effect-channel",
          reason: "native-effect-channel-resource-unresolved",
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_Channel",
          token: "Effect_Test_Channel",
          nativeRuntimeKind: "effect-channel",
          nativeBindKind: "effect-only",
          source: { functionName: "FUN_00e28700", line: 10 },
        },
        {
          id: "ios:effect-channel",
          reason: "native-effect-channel-resource-unresolved",
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_Channel",
          token: "Effect_Test_Channel",
          nativeRuntimeKind: "effect-channel",
          nativeBindKind: "effect-only",
          source: { functionName: "FUN_1003ed408", line: 11 },
        },
        {
          id: "ios:kindred-candidate",
          reason: "kindred-slot-candidate-unresolved",
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_Candidate",
          token: "Effect_Test_Candidate",
          kindredCandidateCount: 2,
          kindredCandidateResourcePaths: ["Effects/Test/A.pfx", "Effects/Test/B.pfx"],
          source: { functionName: "FUN_1003ed408", line: 12 },
        },
        {
          id: "ios:pfx-shape",
          reason: "pfx-area-shape-evidence-missing",
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_Shape",
          source: { functionName: "FUN_100300000", line: 12 },
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(manifest.summary.candidateRows, 3);
  assert.equal(manifest.summary.hookableRows, 2);
  assert.equal(manifest.summary.skippedNonIosRows, 1);
  assert.equal(manifest.summary.targets, 1);
  assert.deepEqual(manifest.summary.byReason, {
    "native-effect-channel-resource-unresolved": 2,
    "kindred-slot-candidate-unresolved": 1,
  });
  assert.deepEqual(manifest.summary.byHookableReason, {
    "native-effect-channel-resource-unresolved": 1,
    "kindred-slot-candidate-unresolved": 1,
  });
  assert.equal(manifest.targets[0].functionAddress, "0x1003ed408");
  assert.equal(manifest.targets[0].contexts[0].sourceRowId, "ios:effect-channel");
  assert.deepEqual(manifest.targets[0].contexts[1].kindredCandidateResourcePaths, [
    "Effects/Test/A.pfx",
    "Effects/Test/B.pfx",
  ]);
});

test("fridaScriptForTargets emits a bounded native effect channel capture hook", () => {
  const manifest = buildTargetsFromGapManifest(
    {
      items: [
        {
          id: "ios:selector-missing",
          reason: "selector-output-paired-resource-missing",
          sourceKind: "native-effect-selector",
          effectToken: "Effect_Test_Projectile",
          token: "Effect_Test_Projectile",
          selectorOutputRole: "projectile",
          selectorOutputTarget: "*param_2",
          source: { functionName: "FUN_100479aec", line: 33 },
        },
      ],
    },
    "TEST_DATE",
  );

  const script = fridaScriptForTargets(manifest);

  assert.match(script, /effect_native_channel_capture_begin/);
  assert.match(script, /effect_native_channel_enter/);
  assert.match(script, /MAX_SAMPLES_PER_TARGET = 16/);
  assert.match(script, /memory64: safeReadHex/);
  assert.match(script, /cstring64: safeReadUtf8/);
  assert.match(script, /0x100479aec/);
});
