const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCreateBridgeAudit,
  exportProjectileCreateBridgeAudit,
  readTsv,
} = require("../tools/effect_projectile_create_bridge_audit");

test("projectile create bridge audit classifies native SkinRep create evidence without promoting rendering", () => {
  const gapAudit = {
    items: [
      {
        status: "projectile-definition-effect-only",
        readyForProjectileRuntime: false,
        heroNames: ["Reza"],
        actionKeys: ["ability01"],
        effectToken: "Effect_Reza_A_Shot",
        pairedImpactEffectTokens: ["Effect_Reza_A_ShotImpact"],
        bindingStatus: "native-effect-hook",
        matchedResourcePaths: ["Effects/Reza/Reza_A_Shot.pfx"],
      },
      {
        status: "projectile-definition-effect-only",
        readyForProjectileRuntime: false,
        heroNames: ["Idris"],
        actionKeys: ["ability01"],
        effectToken: "Effect_Idris_A_MarkerShot",
        pairedImpactEffectTokens: ["Effect_Idris_A_MarkerShot_Impact"],
        bindingStatus: "native-effect-hook",
        matchedResourcePaths: ["Effects/Idris/Idris_A_MarkerShot.pfx"],
      },
      {
        status: "projectile-definition-placed",
        readyForProjectileRuntime: true,
        heroNames: ["Kestrel"],
        actionKeys: ["attack"],
        effectToken: "Effect_Kestrel_AA",
      },
    ],
  };
  const skinrepContextItems = [
    {
      platform: "android",
      sourceFile: "external/GameKindred_android_decompile_output/functions/00d87.c",
      functionName: "FUN_00d87da8",
      line: 609,
      stringLiterals: "Effect_Reza_A_Shot|Effect_Reza_A_ShotImpact|Sound_Reza_Ability_A_Impact_Projectile",
      context:
        '*param_2 = "Effect_Reza_A_Shot";\nparam_2[4] = "Effect_Reza_A_ShotImpact";\n*(undefined4 *)((long)param_2 + 0xac) = 0x3e99999a;\nFUN_00d59f54(uVar2,0,4,0x19,0);\nFUN_00d80ec4(param_1);',
    },
    {
      platform: "android",
      sourceFile: "external/GameKindred_android_decompile_output/functions/00d89.c",
      functionName: "FUN_00d89170",
      line: 61,
      stringLiterals: "Effect_Idris_A_MarkerShot|Effect_Idris_A_MarkerShot_Impact",
      context:
        '*param_2 = "Effect_Idris_A_MarkerShot";\nparam_2[4] = "Effect_Idris_A_MarkerShot_Impact";\n*(undefined4 *)((long)param_1 + 0x120) = 1;\nFUN_00e5ff9c(param_1,param_2);\nFUN_00e5ffd8(param_1);',
    },
  ];

  const audit = buildProjectileCreateBridgeAudit({
    gapAudit,
    skinrepContextItems,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 2);
  assert.equal(audit.summary.effectOnlyRows, 2);
  assert.equal(audit.summary.contextMatchedRows, 2);
  assert.equal(audit.summary.param2LifecycleRows, 2);
  assert.equal(audit.summary.runtimeFieldRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStatus, {
    "create-bridge-param2-lifecycle": 1,
    "create-bridge-runtime-field": 1,
  });

  const reza = audit.items.find((item) => item.effectToken === "Effect_Reza_A_Shot");
  assert.equal(reza.status, "create-bridge-param2-lifecycle");
  assert.equal(reza.hasParam2Lifecycle, true);
  assert.equal(reza.hasRuntimeFieldAccess, false);
  assert.equal(reza.hasRuntimePointerStore, false);
  assert.deepEqual(reza.matchedEffectTokens, ["Effect_Reza_A_Shot", "Effect_Reza_A_ShotImpact"]);
  assert.deepEqual(reza.lifecycleFunctionCalls, ["FUN_00d59f54", "FUN_00d80ec4"]);
  assert.equal(reza.renderPromotionAllowed, false);

  const idris = audit.items.find((item) => item.effectToken === "Effect_Idris_A_MarkerShot");
  assert.equal(idris.status, "create-bridge-runtime-field");
  assert.equal(idris.hasRuntimeFieldAccess, true);
  assert.equal(idris.hasRuntimePointerStore, false);
  assert.deepEqual(idris.lifecycleFunctionCalls, ["FUN_00e5ff9c", "FUN_00e5ffd8"]);
});

test("projectile create bridge audit keeps unmatched blocked rows diagnostic-only", () => {
  const audit = buildProjectileCreateBridgeAudit({
    gapAudit: {
      items: [
        {
          status: "projectile-definition-no-token-resource",
          readyForProjectileRuntime: false,
          heroNames: ["WitchDoctor"],
          actionKeys: ["ability02"],
          effectToken: "Effect_WitchDoctor_Heal_Core",
          pairedImpactEffectTokens: [],
          pfxCandidateResourcePaths: [],
        },
      ],
    },
    skinrepContextItems: [
      {
        stringLiterals: "Effect_OtherHero_Projectile",
        context: '*param_2 = "Effect_OtherHero_Projectile"; FUN_00d80ec4(param_1);',
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.contextMatchedRows, 0);
  assert.equal(audit.summary.missingContextRows, 1);
  assert.deepEqual(audit.summary.byStatus, {
    "create-bridge-context-missing": 1,
  });
  assert.equal(audit.items[0].status, "create-bridge-context-missing");
  assert.equal(audit.items[0].renderPromotionAllowed, false);
  assert.match(audit.items[0].blocker, /native SkinRep/);
});

test("projectile create bridge audit matches same native function when SkinRep context omits token literals", () => {
  const audit = buildProjectileCreateBridgeAudit({
    gapAudit: {
      items: [
        {
          status: "projectile-definition-effect-only",
          readyForProjectileRuntime: false,
          heroNames: ["Lorelai"],
          effectToken: "Effect_Lorelai_Proj",
          pairedImpactEffectTokens: ["Effect_Lorelai_Proj_Hit"],
          sourceFunctionName: "FUN_00d8fdec",
          sourceFile: "external/HackedGlory/functions/00d8f.c",
        },
      ],
    },
    skinrepContextItems: [
      {
        platform: "android",
        sourceFile: "external/HackedGlory/functions/00d8f.c",
        functionName: "FUN_00d8fdec",
        line: 562,
        stringLiterals: "",
        context:
          "*(long *)(param_1 + 0x118) = param_1 + 0x120;\n*(undefined ***)(param_1 + 0x120) = &PTR_FUN_10149aaa8;\nlVar1 = FUN_10049fdbc(param_1 + 0x100);\nplVar4 = (long *)FUN_10048602c(lVar1 + 0x10);\nplVar4 = (long *)(**(code **)(*plVar4 + 0x38))();\n(**(code **)(*plVar4 + 0x58))(plVar4,param_3);",
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.contextMatchedRows, 1);
  assert.equal(audit.summary.runtimeFieldRows, 1);
  assert.equal(audit.summary.runtimePointerStoreRows, 1);
  assert.equal(audit.summary.runtimeVtablePointerRows, 1);
  assert.equal(audit.summary.targetOwnerQueryRows, 1);
  assert.equal(audit.summary.targetVtableDispatchRows, 1);
  assert.equal(audit.items[0].status, "create-bridge-runtime-field");
  assert.deepEqual(audit.items[0].matchedEvidenceKinds, ["same-function-context"]);
  assert.deepEqual(audit.items[0].matchedContextFunctions, ["FUN_00d8fdec"]);
  assert.equal(audit.items[0].hasRuntimePointerStore, true);
  assert.deepEqual(audit.items[0].runtimeVtablePointers, ["PTR_FUN_10149aaa8"]);
  assert.deepEqual(audit.items[0].targetOwnerFunctionCalls, ["FUN_10049fdbc", "FUN_10048602c"]);
  assert.equal(audit.items[0].hasTargetVtableDispatch, true);
  assert.equal(audit.items[0].renderPromotionAllowed, false);
});

test("projectile create bridge exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-create-bridge-"));
  const gapAuditPath = path.join(tempDir, "effect_projectile_runtime_gap_audit.json");
  const skinrepContextPath = path.join(tempDir, "native_skinrep_consumer_context.json");
  const viewerOut = path.join(tempDir, "effect-projectile-create-bridge-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_create_bridge_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_create_bridge_audit.tsv");

  fs.writeFileSync(
    gapAuditPath,
    JSON.stringify({
      items: [
        {
          status: "projectile-definition-effect-only",
          readyForProjectileRuntime: false,
          heroNames: ["FrostMage"],
          actionKeys: ["attack"],
          effectToken: "Effect_FrostMage_FrostBolt_Core",
          pairedImpactEffectTokens: ["Effect_FrostMage_FrostBolt_Impact"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    skinrepContextPath,
    JSON.stringify({
      items: [
        {
          platform: "android",
          functionName: "FUN_00d88c1c",
          line: 483,
          stringLiterals: "Effect_FrostMage_FrostBolt_Core|Effect_FrostMage_FrostBolt_Impact",
          context:
            '*param_2 = "Effect_FrostMage_FrostBolt_Core"; param_2[4] = "Effect_FrostMage_FrostBolt_Impact"; FUN_00e5ff9c(param_1,param_2);',
        },
      ],
    }),
  );

  const summary = exportProjectileCreateBridgeAudit({
    gapAuditPath,
    skinrepContextPath,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.contextMatchedRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_FrostMage_FrostBolt_Core/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /create-bridge-param2-lifecycle/);

  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].effectToken, "Effect_FrostMage_FrostBolt_Core");
  assert.equal(tsvRows[0].status, "create-bridge-param2-lifecycle");
  assert.equal(tsvRows[0].renderPromotionAllowed, "false");
});
