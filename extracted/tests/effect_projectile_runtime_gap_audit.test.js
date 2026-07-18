const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileRuntimeGapAudit,
  exportProjectileRuntimeGapAudit,
  readTsv,
} = require("../tools/effect_projectile_runtime_gap_audit");

test("projectile runtime gap audit separates placed projectiles from definition-only resources", () => {
  const effectRows = [
    {
      platform: "ios",
      sourceKind: "native-effect-selector",
      effectToken: "Effect_Kestrel_AA",
      actionKeys: "attack",
      nearbyEffectTokens: "Effect_Kestrel_AA_Hit",
      nearbySoundTokens: "Sound_Kestrel_Attack_Impact_1",
      heroNames: "Kestrel",
      selectorOutputTarget: "*param_2",
      selectorOutputRole: "projectile",
      functionName: "FUN_100486b70",
      line: "4366",
    },
    {
      platform: "ios",
      sourceKind: "native-effect-selector",
      effectToken: "Effect_Kestrel_C_Shot_Burst",
      actionKeys: "ability03",
      nearbyEffectTokens: "Effect_Kestrel_C_Impact",
      heroNames: "Kestrel",
      selectorOutputTarget: "*param_2",
      selectorOutputRole: "projectile",
      functionName: "FUN_100486d00",
      line: "4500",
    },
  ];
  const coverageRows = [
    {
      modelLabel: "Kestrel_DefaultSkin",
      heroLabel: "Kestrel",
      bindingStatus: "native-emitter-slot",
      bindingBoneToken: "Bone_RightHand",
      nativeEmitterLabel: "CritAttack_Spawn",
      nativeProjectileId: "0x33",
      nativeEffectHookTokens: "Effect_Kestrel_AA",
      effectTokens: "Effect_Kestrel_AA",
      resourcePath: "Effects/Hero023/Hero023_AA_Proj.assetbundle/Hero023_AA_Proj.pfx",
    },
    {
      modelLabel: "Kestrel_DefaultSkin",
      heroLabel: "Kestrel",
      bindingStatus: "native-effect-hook",
      nativeEffectHookTokens: "Effect_Kestrel_C_Shot_Burst",
      effectTokens: "Effect_Kestrel_C_Shot_Burst",
      resourcePath: "Effects/Hero023/Hero023_C_Shot/Hero023_C_Shot.pfx",
    },
    {
      modelLabel: "Kestrel_DefaultSkin",
      heroLabel: "Kestrel",
      bindingStatus: "native-emitter-slot",
      bindingBoneToken: "Bone_RightHand",
      nativeEmitterLabel: "AltMuzzle",
      nativeProjectileId: "0x34",
      nativeEffectHookTokens: "Effect_Kestrel_Alt_Shot",
      effectTokens: "Effect_Kestrel_Alt_Shot",
      actionKeys: "attack_alt",
      resourcePath: "Effects/Hero023/Hero023_Alt_Shot/Hero023_Alt_Shot.pfx",
    },
  ];
  effectRows.push({
    platform: "ios",
    sourceKind: "native-effect-selector",
    effectToken: "Effect_Kestrel_Alt_Shot",
    actionKeys: "ability02",
    heroNames: "Kestrel",
    selectorOutputTarget: "*param_2",
    selectorOutputRole: "projectile",
    functionName: "FUN_100486e00",
    line: "4600",
  });

  const audit = buildProjectileRuntimeGapAudit({ effectRows, coverageRows, generatedAt: "TEST_DATE" });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.projectileDefinitions, 3);
  assert.equal(audit.summary.placedProjectileDefinitions, 1);
  assert.equal(audit.summary.definitionOnlyProjectileDefinitions, 1);
  assert.equal(audit.summary.actionMismatchProjectileDefinitions, 1);
  assert.equal(audit.summary.noCoverageProjectileDefinitions, 1);
  assert.equal(audit.summary.readyForProjectileRuntimeRows, 1);
  assert.equal(audit.summary.blockingProjectileRuntimeRows, 2);
  assert.deepEqual(audit.summary.byStatus, {
    "projectile-definition-placed": 1,
    "projectile-definition-effect-only": 1,
    "projectile-definition-action-mismatch": 1,
  });

  const placed = audit.items.find((row) => row.effectToken === "Effect_Kestrel_AA");
  assert.equal(placed.status, "projectile-definition-placed");
  assert.equal(placed.bindingStatus, "native-emitter-slot");
  assert.equal(placed.nativeEmitterLabel, "CritAttack_Spawn");
  assert.equal(placed.nativeProjectileId, "0x33");
  assert.equal(placed.readyForProjectileRuntime, true);

  const missingPlacement = audit.items.find((row) => row.effectToken === "Effect_Kestrel_C_Shot_Burst");
  assert.equal(missingPlacement.status, "projectile-definition-effect-only");
  assert.equal(missingPlacement.bindingStatus, "native-effect-hook");
  assert.equal(missingPlacement.readyForProjectileRuntime, false);
  assert.match(missingPlacement.blocker, /runtime placement/);

  const actionMismatch = audit.items.find((row) => row.effectToken === "Effect_Kestrel_Alt_Shot");
  assert.equal(actionMismatch.status, "projectile-definition-action-mismatch");
  assert.equal(actionMismatch.readyForProjectileRuntime, false);
  assert.equal(actionMismatch.matchedBindingStatuses[0], "native-emitter-slot");
  assert.match(actionMismatch.blocker, /action/);
});

test("projectile runtime gap audit exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-gap-"));
  const effectTsv = path.join(tempDir, "native_effect_spawn_manifest.tsv");
  const coverageTsv = path.join(tempDir, "effect_projectile_binding_coverage.tsv");
  const viewerOut = path.join(tempDir, "effect-projectile-runtime-gap-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_runtime_gap_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_runtime_gap_audit.tsv");

  fs.writeFileSync(
    effectTsv,
    [
      "platform\tsourceKind\teffectToken\tactionKeys\tnearbyEffectTokens\tnearbySoundTokens\theroNames\tselectorOutputTarget\tselectorOutputRole\tfunctionName\tline",
      "ios\tnative-effect-selector\tEffect_Test_AA\tattack\tEffect_Test_AA_Hit\tSound_Test_AA\tTestHero\t*param_2\tprojectile\tFUN_1\t10",
      "ios\tnative-effect-selector\tEffect_Test_AA_Hit\tattack\tEffect_Test_AA\tSound_Test_AA\tTestHero\tparam_2[4]\timpact\tFUN_1\t11",
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    coverageTsv,
    [
      "modelLabel\theroLabel\tbindingStatus\tbindingBoneToken\tnativeEmitterLabel\tnativeProjectileId\tnativeEffectHookTokens\teffectTokens\tresourcePath",
      "TestHero_Default\tTestHero\tnative-emitter-slot\tBone_RightHand\tMuzzle\t0x1\tEffect_Test_AA\tEffect_Test_AA\tEffects/Test/Test_AA.pfx",
    ].join("\n") + "\n",
  );

  const summary = exportProjectileRuntimeGapAudit({
    effectTsv,
    coverageTsv,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.projectileDefinitions, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_Test_AA/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /projectile-definition-placed/);

  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].effectToken, "Effect_Test_AA");
  assert.equal(tsvRows[0].readyForProjectileRuntime, "true");
  assert.equal(tsvRows[0].matchedResourcePaths, "Effects/Test/Test_AA.pfx");
});

test("projectile runtime gap audit uses hero prefixes and runtime paths as hero aliases", () => {
  const audit = buildProjectileRuntimeGapAudit({
    generatedAt: "TEST_DATE",
    effectRows: [
      {
        sourceKind: "native-effect-selector",
        effectToken: "Effect_AdagioDefaultAttack_core",
        actionKeys: "attack",
        heroNames: "AdagioDefaultAttack",
        selectorOutputRole: "projectile",
      },
      {
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Hero010_Fireball_Crit",
        actionKeys: "attack_crit",
        heroNames: "Hero010",
        selectorOutputRole: "projectile",
      },
    ],
    coverageRows: [
      {
        modelLabel: "Adagio_Skin_Goth_T3",
        heroLabel: "Adagio",
        bindingStatus: "native-emitter-slot",
        bindingBoneToken: "Bone_RightHand",
        nativeEffectHookTokens: "Effect_AdagioDefaultAttack_core",
        effectTokens: "Effect_AdagioDefaultAttack_core",
        actionKeys: "attack",
        resourcePath: "Effects/Adagio/S1/Adagio__S1__Projectile.assetbundle/Adagio__S1__Projectile.pfx",
        runtimeSourceRelativePath: "Characters/Adagio/Adagio.def",
      },
      {
        modelLabel: "Skaarf_DefaultSkin",
        heroLabel: "Skaarf",
        bindingStatus: "native-emitter-slot",
        bindingBoneToken: "Bone_Mouth",
        nativeEffectHookTokens: "Effect_Hero010_Fireball_Crit",
        effectTokens: "Effect_Hero010_Fireball_Crit",
        actionKeys: "attack_crit",
        resourcePath: "Effects/Hero010/Hero010_Projectile_Crit.assetbundle/Hero010_Projectile_Crit.pfx",
        runtimeSourceRelativePath: "Characters/Hero010/Skaarf.def",
      },
    ],
  });

  assert.equal(audit.summary.projectileDefinitions, 2);
  assert.equal(audit.summary.placedProjectileDefinitions, 2);
  assert.equal(audit.summary.heroMismatchProjectileDefinitions, 0);
  assert.deepEqual(
    audit.items.map((item) => item.status),
    ["projectile-definition-placed", "projectile-definition-placed"],
  );
});

test("projectile runtime gap audit uses hook effect token hero prefixes as shared resource aliases", () => {
  const audit = buildProjectileRuntimeGapAudit({
    effectRows: [
      {
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Kraken_Attack_Projectile_5v5",
        actionKeys: "attack",
        heroNames: "Kraken",
        selectorOutputRole: "projectile",
      },
    ],
    coverageRows: [
      {
        modelLabel: "Blackclaw",
        heroLabel: "Blackclaw",
        bindingStatus: "native-effect-hook",
        nativeEffectHookTokens: "Effect_Ball_PFX|Effect_Blackclaw_BreathProjectile|Effect_Kraken_Attack_Projectile_5v5",
        effectTokens: "Effect_Ball_PFX|Effect_Blackclaw_BreathProjectile|Effect_Kraken_Attack_Projectile_5v5",
        actionKeys: "attack",
        resourcePath: "Effects/Blackclaw/Blackclaw_Fireball/Blackclaw_Fireball.pfx",
      },
    ],
  });

  assert.equal(audit.summary.heroMismatchProjectileDefinitions, 0);
  assert.equal(audit.summary.definitionOnlyProjectileDefinitions, 1);
  assert.equal(audit.items[0].status, "projectile-definition-effect-only");
  assert.equal(audit.items[0].readyForProjectileRuntime, false);
});

test("projectile runtime gap audit accepts native effect hook action keys as action evidence", () => {
  const audit = buildProjectileRuntimeGapAudit({
    effectRows: [
      {
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Adagio_Spell_Projectile",
        actionKeys: "ability02",
        heroNames: "Adagio",
        selectorOutputRole: "projectile",
      },
    ],
    coverageRows: [
      {
        modelLabel: "Adagio_DefaultSkin",
        heroLabel: "Adagio",
        bindingStatus: "native-runtime-locator-transform",
        nativeEmitterLabel: "Ability01_Projectile",
        nativeProjectileId: "0x2",
        nativeEffectHookTokens: "Effect_Adagio_Spell_Projectile",
        nativeEffectHookActionKeys: "ability01|ability02",
        effectTokens: "Effect_Adagio_Spell_Projectile",
        actionKeys: "ability01",
        resourcePath: "Effects/Adagio/Adagio_Spell_Projectile.assetbundle/Adagio_Spell_Projectile.pfx",
      },
    ],
  });

  assert.equal(audit.summary.placedProjectileDefinitions, 1);
  assert.equal(audit.summary.actionMismatchProjectileDefinitions, 0);
  assert.equal(audit.items[0].status, "projectile-definition-placed");
});

test("projectile runtime gap audit reports PFX candidates for token-missing definitions without promoting them", () => {
  const audit = buildProjectileRuntimeGapAudit({
    effectRows: [
      {
        sourceKind: "native-effect-selector",
        effectToken: "Effect_Hero009_Sword_Spinning",
        actionKeys: "",
        heroNames: "Hero009",
        selectorOutputRole: "projectile",
      },
    ],
    coverageRows: [],
    pfxRows: [
      {
        relativePath:
          "Effects/Hero009/FX/Hero009__S1_Sword_Spinning.assetbundle/Hero009__S1_Sword_Spinning.pfx",
      },
    ],
  });

  assert.equal(audit.summary.projectileDefinitions, 1);
  assert.equal(audit.summary.tokenMissingProjectileDefinitions, 1);
  assert.equal(audit.summary.tokenMissingWithPfxCandidateRows, 1);
  assert.equal(audit.items[0].status, "projectile-definition-no-token-resource");
  assert.equal(audit.items[0].readyForProjectileRuntime, false);
  assert.deepEqual(audit.items[0].pfxCandidateResourcePaths, [
    "Effects/Hero009/FX/Hero009__S1_Sword_Spinning.assetbundle/Hero009__S1_Sword_Spinning.pfx",
  ]);
});
