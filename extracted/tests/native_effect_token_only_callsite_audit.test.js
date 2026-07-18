const assert = require("node:assert/strict");
const test = require("node:test");

const { buildNativeEffectTokenOnlyCallsiteAudit } = require("../tools/native_effect_token_only_callsite_audit");
const { fnv1a32Hex } = require("../tools/kindred_effect_hash_slots");

const staticAuditManifest = {
  items: [
    {
      id: "ios:builder",
      effectToken: "Effect_BuilderOnly",
      sourceKind: "native-effect-vcall",
      staticEvidenceClass: "native-vcall-token-only-no-resource",
      sourceFunction: "FUN_1000a000",
      sourceLine: 4,
    },
    {
      id: "ios:selector",
      effectToken: "Effect_SelectorOnly",
      sourceKind: "native-effect-selector",
      staticEvidenceClass: "selector-output-token-only-no-resource",
      sourceFunction: "FUN_1000b000",
      sourceLine: 14,
    },
    {
      id: "ios:spawn",
      effectToken: "Effect_SpawnOnly",
      sourceKind: "native-effect-spawn",
      staticEvidenceClass: "native-spawn-token-only-no-resource",
      sourceFunction: "FUN_1000c000",
      sourceLine: 21,
    },
    {
      id: "ios:ignored",
      effectToken: "Effect_Candidate",
      sourceKind: "native-effect-vcall",
      staticEvidenceClass: "gap-candidate-multiple",
      sourceFunction: "FUN_1000d000",
    },
  ],
};

const sourceText = `
void FUN_1000a000(long param_1)
{
  long *plVar2;
  plVar2 = (long *)FUN_100441e68(param_1 + 0x10);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_CenterMass");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_BuilderOnly");
  (**(code **)(*plVar2 + 0xb0))(plVar2,1);
}

void FUN_1000b000(undefined8 param_1, char **param_2)
{
  *param_2 = "Effect_SelectorOnly";
}

void FUN_1000c000(void)
{
  FUN_1003a4cdc("Effect_SpawnOnly", 0, 1);
}
`;

const kindredHashSlotManifest = {
  items: [
    {
      effectHashHex: fnv1a32Hex("Effect_BuilderOnly"),
      resourcePath: "Effects/Test/BuilderOnly/BuilderOnly.pfx",
    },
    {
      effectHashHex: fnv1a32Hex("Effect_SelectorOnly"),
      resourcePath: "Effects/Test/SelectorOnly/SelectorOnly.pfx",
    },
  ],
};

test("buildNativeEffectTokenOnlyCallsiteAudit classifies token-only native callsites without promoting rendering", () => {
  const report = buildNativeEffectTokenOnlyCallsiteAudit(
    {
      staticAuditManifest,
      kindredHashSlotManifest,
      sourceFiles: [
        {
          sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
          platform: "ios",
          text: sourceText,
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 3);
  assert.equal(report.summary.functionsFound, 3);
  assert.equal(report.summary.hookBuilderRows, 1);
  assert.equal(report.summary.selectorOutputRows, 1);
  assert.equal(report.summary.spawnRows, 1);
  assert.equal(report.summary.renderPromotionAllowed, false);
  assert.equal(report.summary.resourceLiteralRows, 0);
  assert.equal(report.summary.builderRuntimeCreateBridgeRows, 1);
  assert.equal(report.summary.kindredHashResolvedRows, 2);
  assert.equal(report.summary.kindredHashMissingRows, 1);
  assert.equal(report.summary.builderKindredHashResolvedRows, 1);

  const builder = report.items.find((item) => item.effectToken === "Effect_BuilderOnly");
  assert.equal(builder.callsiteClass, "effect-hook-builder-bone-bound-effect");
  assert.equal(builder.resourceOwnershipState, "builder-kindred-effects-hash-resource");
  assert.equal(builder.runtimeCreateBridgeState, "builder-kindred-effects-create-chain");
  assert.equal(builder.kindredEffectHashHex, fnv1a32Hex("Effect_BuilderOnly"));
  assert.equal(builder.kindredHashLookupState, "exact-kindred-effects-hash-resource");
  assert.equal(builder.kindredHashResourceCount, 1);
  assert.equal(builder.kindredHashResourcePaths, "Effects/Test/BuilderOnly/BuilderOnly.pfx");
  assert.equal(builder.boneTokens, "Bone_CenterMass");
  assert.equal(builder.renderPromotionAllowed, false);

  const selector = report.items.find((item) => item.effectToken === "Effect_SelectorOnly");
  assert.equal(selector.callsiteClass, "selector-output-token-only");
  assert.equal(selector.resourceOwnershipState, "selector-output-kindred-effects-hash-resource");
  assert.equal(selector.runtimeCreateBridgeState, "selector-output-token-no-create-chain");

  const spawn = report.items.find((item) => item.effectToken === "Effect_SpawnOnly");
  assert.equal(spawn.callsiteClass, "spawn-helper-token-only");
  assert.equal(spawn.resourceOwnershipState, "spawn-token-kindred-effects-hash-missing");
  assert.equal(spawn.kindredHashLookupState, "kindred-effects-hash-missing");
});
