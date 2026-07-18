const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildKindredHashPfxRuntimeGateAudit,
  runtimeGateStateFor,
} = require("../tools/kindred_hash_pfx_runtime_gate_audit");

const nativeAuditManifest = {
  items: [
    {
      id: "ios:builder",
      effectToken: "Effect_Builder",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      sourceFunction: "FUN_1000a000",
      sourceLine: 10,
      runtimeCreateBridgeState: "builder-kindred-effects-create-chain",
      resourceOwnershipState: "builder-kindred-effects-hash-resource",
      kindredEffectHashHex: "AAAAAAAA",
      kindredHashResourceCount: 1,
      kindredHashResourcePaths: "Effects/Test/Builder/Builder.pfx",
    },
    {
      id: "ios:selector",
      effectToken: "Effect_Selector",
      platform: "ios",
      sourceKind: "native-effect-selector",
      sourceFunction: "FUN_1000b000",
      sourceLine: 20,
      runtimeCreateBridgeState: "selector-output-token-no-create-chain",
      resourceOwnershipState: "selector-output-kindred-effects-hash-resource",
      kindredEffectHashHex: "BBBBBBBB",
      kindredHashResourceCount: 1,
      kindredHashResourcePaths: "Effects/Test/Selector/Selector.pfx",
    },
    {
      id: "ios:blocked",
      effectToken: "Effect_Blocked",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      sourceFunction: "FUN_1000c000",
      sourceLine: 30,
      runtimeCreateBridgeState: "builder-kindred-effects-create-chain",
      resourceOwnershipState: "builder-kindred-effects-hash-resource",
      kindredEffectHashHex: "CCCCCCCC",
      kindredHashResourceCount: 1,
      kindredHashResourcePaths: "Effects/Test/Blocked/Blocked.pfx",
    },
    {
      id: "ios:missing",
      effectToken: "Effect_Missing",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      runtimeCreateBridgeState: "builder-kindred-effects-create-chain",
      kindredHashResourceCount: 0,
      kindredHashResourcePaths: "",
    },
  ],
};

const pfxManifest = {
  items: [
    {
      relativePath: "Effects/Test/Builder/Builder.pfx",
      uniqueShadergraphRefCount: 1,
      surfaceRecords: [
        {
          prelude: { renderFamily: "billboard" },
          parameterProfile: { lifecycleOffsets: [153] },
          emitterRuntimeProfile: { lifecycleOffsets: [172] },
        },
      ],
      hookBindingProfiles: [],
    },
    {
      relativePath: "Effects/Test/Selector/Selector.pfx",
      uniqueShadergraphRefCount: 1,
      surfaceRecords: [
        {
          prelude: { renderFamily: "billboard" },
          emitterRuntimeProfile: { lifecycleOffsets: [172] },
        },
      ],
      hookBindingProfiles: [],
    },
    {
      relativePath: "Effects/Test/Blocked/Blocked.pfx",
      uniqueShadergraphRefCount: 1,
      surfaceRecords: [
        {
          prelude: { renderFamily: "area" },
          shapeProfile: { evidenceClass: "emitter-size-callback" },
          emitterRuntimeProfile: { lifecycleOffsets: [172] },
        },
      ],
      hookBindingProfiles: [{ effectToken: "Effect_Blocked" }],
    },
  ],
};

const effectGapManifest = {
  items: [
    {
      effectToken: "Effect_Blocked",
      reason: "pfx-area-shape-evidence-missing",
      pfxPath: "Effects/Test/Blocked/Blocked.pfx",
      existingResourcePaths: ["Effects/Test/Blocked/Blocked.pfx"],
    },
  ],
};

test("buildKindredHashPfxRuntimeGateAudit joins hash-owned PFX resources to profile and gap gates", () => {
  const report = buildKindredHashPfxRuntimeGateAudit(
    {
      nativeAuditManifest,
      pfxManifest,
      effectGapManifest,
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 3);
  assert.equal(report.summary.uniqueEffectTokens, 3);
  assert.equal(report.summary.uniquePfxPaths, 3);
  assert.equal(report.summary.pfxManifestFoundRows, 3);
  assert.equal(report.summary.builderCreateChainRows, 2);
  assert.equal(report.summary.createChainUnresolvedRows, 1);
  assert.equal(report.summary.blockedByExactGapRows, 1);
  assert.equal(report.summary.rendererLinkNeededRows, 1);
  assert.equal(report.summary.renderPromotionAllowed, false);

  const builder = report.items.find((item) => item.effectToken === "Effect_Builder");
  assert.equal(builder.runtimeGateState, "pfx-resource-found-renderer-link-needed");
  assert.equal(builder.pfxSurfaceRows, 1);
  assert.equal(builder.pfxLifecycleProfileRows, 1);
  assert.equal(builder.pfxSurfaceRenderFamilies, "billboard");

  const selector = report.items.find((item) => item.effectToken === "Effect_Selector");
  assert.equal(selector.runtimeGateState, "pfx-resource-found-create-chain-unresolved");

  const blocked = report.items.find((item) => item.effectToken === "Effect_Blocked");
  assert.equal(blocked.runtimeGateState, "blocked-by-current-effect-runtime-gap");
  assert.equal(blocked.exactEffectGapRows, 1);
  assert.equal(blocked.gapReasons, "pfx-area-shape-evidence-missing");
  assert.equal(blocked.pfxAreaSurfaceRows, 1);
  assert.equal(blocked.pfxShapeProfileRows, 1);
});

test("runtimeGateStateFor keeps render promotion closed on incomplete evidence", () => {
  assert.equal(
    runtimeGateStateFor({
      pfxItem: null,
      exactGapRows: [],
      samePfxGapRows: [],
      runtimeCreateBridgeState: "builder-kindred-effects-create-chain",
    }),
    "pfx-manifest-missing",
  );
  assert.equal(
    runtimeGateStateFor({
      pfxItem: {},
      exactGapRows: [],
      samePfxGapRows: [{}],
      runtimeCreateBridgeState: "builder-kindred-effects-create-chain",
    }),
    "pfx-has-other-runtime-gap-rows",
  );
});
