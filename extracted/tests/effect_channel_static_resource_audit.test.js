const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEffectChannelStaticResourceAudit,
  staticEvidenceClassFor,
} = require("../tools/effect_channel_static_resource_audit");

test("buildEffectChannelStaticResourceAudit classifies static resource evidence without promoting rendering", () => {
  const report = buildEffectChannelStaticResourceAudit(
    {
      gapManifest: {
        items: [
          {
            id: "ios:exact",
            reason: "native-effect-channel-resource-unresolved",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Exact",
            actionKeys: ["ability01"],
            source: { functionName: "FUN_100000000", line: 10 },
          },
          {
            id: "ios:candidate",
            reason: "kindred-slot-candidate-unresolved",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Candidate",
            kindredCandidateResourcePaths: ["Effects/Test/A.pfx", "Effects/Test/B.pfx"],
            source: { functionName: "FUN_100000004", line: 20 },
          },
          {
            id: "ios:cff0",
            reason: "selector-output-paired-resource-missing",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_Cff0Only",
            source: { functionName: "FUN_100000008", line: 30 },
          },
          {
            id: "ios:selector-only",
            reason: "selector-output-paired-resource-missing",
            sourceKind: "native-effect-selector",
            effectToken: "Effect_SelectorOnly",
            source: { functionName: "FUN_10000000c", line: 40 },
          },
          {
            id: "ios:vcall-only",
            reason: "native-effect-channel-resource-unresolved",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_VcallOnly",
            source: { functionName: "FUN_100000010", line: 50 },
          },
          {
            id: "ios:ignored",
            reason: "pfx-area-shape-evidence-missing",
            effectToken: "Effect_Shape",
          },
        ],
      },
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Test/Exact/Exact.pfx",
            hookEffectTokens: ["Effect_Exact"],
          },
        ],
      },
      hookManifest: { items: [] },
      cff0GraphManifest: {
        items: [
          {
            relativePath: "Characters/Test/Test.def",
            ownerLabel: "Test_DefaultSkin",
            effectToken: "Effect_Cff0Only",
          },
        ],
      },
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 5);
  assert.equal(report.summary.renderPromotionAllowed, false);
  assert.equal(report.summary.byStaticEvidenceClass["exact-pfx-token-single"], 1);
  assert.equal(report.summary.byStaticEvidenceClass["gap-candidate-multiple"], 1);
  assert.equal(report.summary.byStaticEvidenceClass["cff0-effect-token-present-no-pfx"], 1);
  assert.equal(report.summary.byStaticEvidenceClass["selector-output-pair-only-no-resource"], 1);
  assert.equal(report.summary.byStaticEvidenceClass["native-vcall-token-only-no-resource"], 1);
  assert.equal(report.summary.selectorPairOnlyRows, 1);
  assert.equal(report.summary.tokenOnlyNoResourceRows, 1);

  const exact = report.items.find((item) => item.effectToken === "Effect_Exact");
  assert.deepEqual(exact.exactPfxResourcePaths, ["Effects/Test/Exact/Exact.pfx"]);
  assert.equal(exact.renderPromotionAllowed, false);

  const candidate = report.items.find((item) => item.effectToken === "Effect_Candidate");
  assert.deepEqual(candidate.gapResourcePaths, ["Effects/Test/A.pfx", "Effects/Test/B.pfx"]);

  const selectorOnly = report.items.find((item) => item.effectToken === "Effect_SelectorOnly");
  assert.equal(selectorOnly.staticEvidenceClass, "selector-output-pair-only-no-resource");

  const vcallOnly = report.items.find((item) => item.effectToken === "Effect_VcallOnly");
  assert.equal(vcallOnly.staticEvidenceClass, "native-vcall-token-only-no-resource");
});

test("staticEvidenceClassFor prefers proven PFX tokens over candidate lists but keeps both diagnostic", () => {
  assert.equal(
    staticEvidenceClassFor({
      exactPfxResourcePaths: ["Effects/Test/Exact.pfx"],
      hookResourcePaths: [],
      gapResourcePaths: ["Effects/Test/A.pfx", "Effects/Test/B.pfx"],
      cff0Records: [],
    }),
    "exact-pfx-token-single",
  );
  assert.equal(
    staticEvidenceClassFor({
      exactPfxResourcePaths: [],
      hookResourcePaths: [],
      gapResourcePaths: [],
      cff0Records: [],
    }),
    "no-static-resource-evidence",
  );
});
