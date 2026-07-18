const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildNativeEffectHashMissingOwnerAudit,
  definitionSymbols,
  runtimeNameReferences,
} = require("../tools/native_effect_hash_missing_owner_audit");

const nativeAuditManifest = {
  items: [
    {
      id: "ios:spawned-definition",
      effectToken: "Effect_FooCloudSput",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      sourceFunction: "FUN_1000a000",
      sourceFile: "test.c",
      sourceLine: 6,
      kindredEffectHashHex: "AAAAAAAA",
      kindredHashLookupState: "kindred-effects-hash-missing",
      operationSequence: "builder:ios-effect-hook-builder -> bind-effect:Effect_FooCloudSput",
      actionKeys: "",
      heroNames: "FooHero",
    },
    {
      id: "ios:state-only",
      effectToken: "Effect_FooOverheat",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      sourceFunction: "FUN_1000b000",
      sourceFile: "test.c",
      sourceLine: 18,
      kindredEffectHashHex: "BBBBBBBB",
      kindredHashLookupState: "kindred-effects-hash-missing",
      operationSequence: "buff-reference:Buff_Foo_Overheat -> bind-effect:Effect_FooOverheat",
      actionKeys: "ability01",
      heroNames: "FooHero",
    },
    {
      id: "ios:resolved",
      effectToken: "Effect_Resolved",
      platform: "ios",
      sourceKind: "native-effect-vcall",
      sourceFunction: "FUN_1000c000",
      sourceFile: "test.c",
      kindredHashLookupState: "exact-kindred-effects-hash-resource",
    },
  ],
};

const definitionManifestRows = [
  {
    manifestLabel: "*FooCloud*",
    targetRelativePath: "Characters/Foo/FooCloud.def",
    targetFamily: "character",
    meshCount: "1",
    skeletonCount: "1",
    animationCount: "1",
    meshSamples: "Characters/Foo/FooCloud.mesh",
    skeletonSamples: "Characters/Foo/FooCloud.skeleton",
    animationLabels: "Spawn",
  },
];

const sourceText = `
void FUN_1000a000(void)
{
  plVar3 = (long *)(**(code **)(*plVar3 + 0x30))(plVar3,"*FooCloud*",1);
  (**(code **)(*plVar3 + 0x18))(plVar3,"CenterBody");
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_FooCloudSput");
}

void FUN_1000b000(void)
{
  (**(code **)(*plVar3 + 0x30))(plVar3,PTR_s_Buff_Foo_Overheat_10101010);
  (**(code **)(*plVar3 + 0x48))(plVar3,"Effect_FooOverheat");
  (**(code **)(*plVar3 + 0x38))(plVar3,"Sound_Foo_Overheat");
}
`;

test("buildNativeEffectHashMissingOwnerAudit separates spawned definition owners from state-only hash misses", () => {
  const report = buildNativeEffectHashMissingOwnerAudit(
    {
      nativeAuditManifest,
      definitionManifestRows,
      sourceFiles: [
        {
          sourceFile: "test.c",
          text: sourceText,
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 2);
  assert.equal(report.summary.uniqueEffectTokens, 2);
  assert.equal(report.summary.spawnedCharacterDefinitionOwnerRows, 1);
  assert.equal(report.summary.stateOrBuffOwnerUnresolvedRows, 1);
  assert.equal(report.summary.renderPromotionAllowed, false);

  const spawned = report.items.find((item) => item.effectToken === "Effect_FooCloudSput");
  assert.equal(spawned.nonPfxOwnerState, "spawned-character-definition-owner");
  assert.equal(spawned.definitionSymbols, "*FooCloud*");
  assert.equal(spawned.ownerDefinitionPaths, "Characters/Foo/FooCloud.def");
  assert.equal(spawned.ownerDefinitionMeshSamples, "Characters/Foo/FooCloud.mesh");
  assert.equal(spawned.renderPromotionAllowed, false);

  const stateOnly = report.items.find((item) => item.effectToken === "Effect_FooOverheat");
  assert.equal(stateOnly.nonPfxOwnerState, "native-state-or-buff-owner-unresolved");
  assert.equal(stateOnly.ownerDefinitionPaths, "");
  assert.match(stateOnly.runtimeReferences, /Buff_Foo_Overheat/);
  assert.match(stateOnly.runtimeReferences, /Sound_Foo_Overheat/);
});

test("native hash-missing owner token extractors keep the evidence narrow", () => {
  assert.deepEqual(definitionSymbols('"*FooCloud*" *BarObject*'), ["*BarObject*", "*FooCloud*"]);
  assert.deepEqual(runtimeNameReferences("Buff_Foo Effect_Bar Ability__Baz Sound_Qux"), [
    "Ability__Baz",
    "Buff_Foo",
    "Effect_Bar",
    "Sound_Qux",
  ]);
});
