const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileTargetDispatchAudit,
  exportProjectileTargetDispatchAudit,
  readTsv,
} = require("../tools/effect_projectile_target_dispatch_audit");

test("projectile target dispatch audit extracts native helper factories and vtable offsets without promotion", () => {
  const createBridgeAudit = {
    items: [
      {
        status: "create-bridge-runtime-field",
        renderPromotionAllowed: false,
        heroNames: ["Adagio"],
        actionKeys: ["attack"],
        effectToken: "Effect_AdagioDefaultAttack_core",
        pairedImpactEffectTokens: ["Effect_AdagioDefaultAttack_impact"],
        matchedContextFunctions: ["FUN_00d8494c"],
        matchedContextPlatforms: ["android"],
        runtimeVtablePointers: ["PTR_FUN_0280aaaa"],
        hasTargetVtableDispatch: true,
      },
    ],
  };
  const skinrepContextItems = [
    {
      platform: "android",
      sourceFile: "external/HackedGlory/functions/00d84.c",
      functionName: "FUN_00d8494c",
      line: 842,
      stringLiterals: "Effect_AdagioDefaultAttack_core|Effect_AdagioDefaultAttack_impact",
      context:
        'lVar1 = FUN_00d84dfc(param_1 + 0x100);\nplVar2 = (long *)FUN_00d84e4c(lVar1 + 0x10);\nplVar2 = (long *)(**(code **)(*plVar2 + 0x38))();\n(**(code **)(*plVar2 + 0x58))(plVar2,param_3);\nFUN_00d84e9c(lVar1 + 0x10);',
    },
  ];

  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit,
    skinrepContextItems,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.contextMatchedRows, 1);
  assert.equal(audit.summary.helperFactoryRows, 1);
  assert.equal(audit.summary.runtimePoolRows, 1);
  assert.equal(audit.summary.vtableOffsetRows, 1);
  assert.equal(audit.summary.offset38Rows, 1);
  assert.equal(audit.summary.offset58Rows, 1);
  assert.equal(audit.summary.releaseHelperRows, 1);
  assert.equal(audit.summary.placementPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStatus, {
    "target-dispatch-vtable-offsets": 1,
  });

  const item = audit.items[0];
  assert.equal(item.status, "target-dispatch-vtable-offsets");
  assert.equal(item.placementPromotionAllowed, false);
  assert.deepEqual(item.dispatchHelperCalls, ["FUN_00d84dfc", "FUN_00d84e4c", "FUN_00d84e9c"]);
  assert.deepEqual(item.dispatchFactoryCalls, ["FUN_00cdac68", "FUN_00cda01c", "FUN_00cda0f0"]);
  assert.deepEqual(item.dispatchPoolKinds, ["runtime-command-pool-0x70", "runtime-dispatch-pool-0x88"]);
  assert.deepEqual(item.dispatchFactoryVtablePointers, ["PTR_FUN_0280e370", "PTR_FUN_0280e3c0"]);
  assert.deepEqual(item.targetVtableOffsets, ["0x38", "0x58"]);
  assert.match(item.blocker, /placement\/timing semantics/);
});

test("projectile target dispatch audit keeps helper-only rows diagnostic-only", () => {
  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit: {
      items: [
        {
          status: "create-bridge-context-found",
          renderPromotionAllowed: false,
          heroNames: ["Baptiste"],
          effectToken: "Effect_Baptiste_SoulFragment",
          matchedContextFunctions: ["FUN_100478220"],
          matchedContextPlatforms: ["ios"],
        },
      ],
    },
    skinrepContextItems: [
      {
        platform: "ios",
        functionName: "FUN_100478220",
        stringLiterals: "Effect_Baptiste_SoulFragment",
        context:
          'lVar4 = FUN_10049fdbc(param_1 + 0x100);\nplVar5 = (long *)FUN_10048602c(lVar4 + 0x10);\nFUN_100486124(lVar4 + 0x10);',
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.contextMatchedRows, 1);
  assert.equal(audit.summary.vtableOffsetRows, 0);
  assert.equal(audit.summary.helperFactoryRows, 1);
  assert.equal(audit.summary.placementPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStatus, {
    "target-dispatch-helper-only": 1,
  });
  assert.deepEqual(audit.items[0].dispatchFactoryCalls, ["FUN_10033e734", "FUN_10033de80", "FUN_10033df24"]);
  assert.deepEqual(audit.items[0].dispatchPoolKinds, ["runtime-command-pool-0x70", "runtime-dispatch-pool-0x88"]);
  assert.equal(audit.items[0].placementPromotionAllowed, false);
});

test("projectile target dispatch audit separates callback command evidence from placement", () => {
  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit: {
      items: [
        {
          status: "create-bridge-runtime-field",
          renderPromotionAllowed: false,
          heroNames: ["Catherine"],
          effectToken: "Effect_Catherine_ArcaneShield_ReflectShot",
          pairedImpactEffectTokens: ["Effect_Catherine_ArcaneShield_ReflectShot_Impact"],
          matchedContextFunctions: ["FUN_00d86090"],
          matchedContextPlatforms: ["android"],
        },
      ],
    },
    skinrepContextItems: [
      {
        platform: "android",
        functionName: "FUN_00d86090",
        stringLiterals: "Effect_Catherine_ArcaneShield_ReflectShot|Effect_Catherine_ArcaneShield_ReflectShot_Impact",
        context:
          'lVar1 = FUN_00d84dfc(param_1 + 0x100);\nuVar2 = FUN_00d8611c(lVar1 + 0x10);\nFUN_00d829e8(uVar2,FUN_00d82c30,1,2,0);\nFUN_00d84e9c(lVar1 + 0x10);',
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.callbackCommandRows, 1);
  assert.equal(audit.summary.callbackRegistrationRows, 1);
  assert.equal(audit.summary.callbackFunctionRows, 1);
  assert.equal(audit.summary.placementPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStatus, {
    "target-dispatch-callback-command": 1,
  });

  const item = audit.items[0];
  assert.equal(item.status, "target-dispatch-callback-command");
  assert.equal(item.placementPromotionAllowed, false);
  assert.deepEqual(item.dispatchHelperCalls, ["FUN_00d84dfc", "FUN_00d8611c", "FUN_00d84e9c"]);
  assert.deepEqual(item.dispatchFactoryCalls, ["FUN_00cdac68", "FUN_00cd9f38", "FUN_00cda0f0"]);
  assert.deepEqual(item.callbackRegistrationCalls, ["FUN_00d829e8"]);
  assert.deepEqual(item.callbackFunctionPointers, ["FUN_00d82c30"]);
  assert.deepEqual(item.callbackFieldOffsets, ["0x18", "0x28", "0x2c", "0x30"]);
  assert.equal(item.placementPromotionAllowed, false);
});

test("projectile target dispatch audit recognizes callback setter variants", () => {
  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit: {
      items: [
        {
          status: "create-bridge-runtime-field",
          renderPromotionAllowed: false,
          heroNames: ["Hero050"],
          effectToken: "Effect_Hero050_Attack",
          pairedImpactEffectTokens: ["Effect_Hero050_Proj_Hit"],
          matchedContextFunctions: ["FUN_00d92268"],
          matchedContextPlatforms: ["android"],
        },
      ],
    },
    skinrepContextItems: [
      {
        platform: "android",
        functionName: "FUN_00d92268",
        stringLiterals: "Effect_Hero050_Attack|Effect_Hero050_Proj_Hit",
        context:
          'lVar1 = FUN_00d84dfc(param_1 + 0x100);\nuVar2 = FUN_00d8611c(lVar1 + 0x10);\nFUN_00d82a00(uVar2,param_3);\nFUN_00d84e9c(lVar1 + 0x10);',
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.callbackCommandRows, 1);
  assert.equal(audit.summary.callbackRegistrationRows, 1);
  assert.equal(audit.summary.callbackFunctionRows, 1);
  assert.deepEqual(audit.summary.byStatus, {
    "target-dispatch-callback-command": 1,
  });
  assert.deepEqual(audit.items[0].callbackRegistrationCalls, ["FUN_00d82a00"]);
  assert.deepEqual(audit.items[0].callbackFunctionPointers, ["FUN_00d82a18"]);
  assert.deepEqual(audit.items[0].callbackFieldOffsets, ["0x28", "0x18", "0x30"]);
  assert.equal(audit.items[0].placementPromotionAllowed, false);
});

test("projectile target dispatch audit maps iOS finalize command helper", () => {
  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit: {
      items: [
        {
          status: "create-bridge-runtime-field",
          renderPromotionAllowed: false,
          heroNames: ["Idris"],
          effectToken: "Effect_Idris_A_MarkerShot",
          pairedImpactEffectTokens: ["Effect_Idris_A_MarkerShot_Impact"],
          matchedContextFunctions: ["FUN_10047e8c0"],
          matchedContextPlatforms: ["ios"],
        },
      ],
    },
    skinrepContextItems: [
      {
        platform: "ios",
        functionName: "FUN_10047e8c0",
        stringLiterals: "Effect_Idris_A_MarkerShot|Effect_Idris_A_MarkerShot_Impact",
        context:
          'lVar1 = FUN_10049feac(param_1 + 0x100);\nFUN_100486124(lVar1 + 0x10);',
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.helperFactoryRows, 1);
  assert.deepEqual(audit.summary.byStatus, {
    "target-dispatch-finalize-only": 1,
  });
  assert.equal(audit.items[0].status, "target-dispatch-finalize-only");
  assert.deepEqual(audit.items[0].dispatchHelperCalls, ["FUN_10049feac", "FUN_100486124"]);
  assert.deepEqual(audit.items[0].dispatchFactoryCalls, ["FUN_10033e7e8", "FUN_10033df24"]);
  assert.deepEqual(audit.items[0].dispatchPoolKinds, ["runtime-command-pool-0x70", "runtime-dispatch-pool-0x88"]);
  assert.deepEqual(audit.items[0].dispatchFactoryVtablePointers, ["PTR_FUN_10149d2b0"]);
  assert.match(audit.items[0].blocker, /finalize\/marker command/);
  assert.equal(audit.items[0].placementPromotionAllowed, false);
});

test("projectile target dispatch exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-target-dispatch-"));
  const createBridgeAuditPath = path.join(tempDir, "effect_projectile_create_bridge_audit.json");
  const skinrepContextPath = path.join(tempDir, "native_skinrep_consumer_context.json");
  const viewerOut = path.join(tempDir, "effect-projectile-target-dispatch-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_target_dispatch_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_target_dispatch_audit.tsv");

  fs.writeFileSync(
    createBridgeAuditPath,
    JSON.stringify({
      items: [
        {
          status: "create-bridge-runtime-field",
          renderPromotionAllowed: false,
          heroNames: ["Lorelai"],
          actionKeys: ["ability01"],
          effectToken: "Effect_Lorelai_Proj",
          pairedImpactEffectTokens: ["Effect_Lorelai_Proj_Hit"],
          matchedContextFunctions: ["FUN_100489238"],
          matchedContextPlatforms: ["ios"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    skinrepContextPath,
    JSON.stringify({
      items: [
        {
          platform: "ios",
          functionName: "FUN_100489238",
          stringLiterals: "Effect_Lorelai_Proj|Effect_Lorelai_Proj_Hit",
          context:
            'lVar1 = FUN_10049fdbc(param_1 + 0x100);\nplVar2 = (long *)FUN_10048602c(lVar1 + 0x10);\nplVar2 = (long *)(**(code **)(*plVar2 + 0x38))();\n(**(code **)(*plVar2 + 0x58))(plVar2,param_3);\nFUN_100486124(lVar1 + 0x10);',
        },
      ],
    }),
  );

  const summary = exportProjectileTargetDispatchAudit({
    createBridgeAuditPath,
    skinrepContextPath,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.vtableOffsetRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_Lorelai_Proj/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /target-dispatch-vtable-offsets/);

  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].effectToken, "Effect_Lorelai_Proj");
  assert.equal(tsvRows[0].status, "target-dispatch-vtable-offsets");
  assert.equal(tsvRows[0].placementPromotionAllowed, "false");
  assert.equal(tsvRows[0].targetVtableOffsets, "0x38|0x58");
});
