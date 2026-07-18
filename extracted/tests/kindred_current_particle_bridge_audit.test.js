const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildKindredCurrentParticleBridgeAudit,
  exportKindredCurrentParticleBridgeAudit,
} = require("../tools/kindred_current_particle_bridge_audit");

const sources = {
  androidType: {
    sourcePath: "android-type.c",
    text: `
      *(undefined4 *)(lVar1 + 0xa8) = 0x118;
      FUN_01986780(param_1,0,FUN_009d200c,0);
      FUN_01986780(param_1,4,FUN_009d2040,0);
    `,
  },
  androidUpdate: {
    sourcePath: "android-update.c",
    text: `
      FUN_0198936c(uVar3,&local_50,param_3,param_1 + 0x30);
      *(undefined2 *)(param_1 + 0xb0) = uVar2;
      if ((*(int *)(param_1 + 0xb8) != 0) && (*(long **)(param_1 + 0x58) != 0)) {}
      FUN_019894ac(uVar7,uVar3,uVar8,0);
    `,
  },
  androidComponent: {
    sourcePath: "android-component.c",
    text: `
      FUN_00f30afc(*(long *)(param_1 + 0x50),"Ally_Enemy");
      FUN_00f30afc(*(long *)(param_1 + 0x50),"Duration");
    `,
  },
  iosComponent: {
    sourcePath: "ios-component.c",
    text: `
      *(undefined4 *)(lVar1 + 0xa8) = 0x118;
      FUN_1010a0944(param_1,0,FUN_10004470c,0);
      FUN_1010a0944(param_1,4,FUN_100044740,0);
      FUN_1010a1dcc(uVar2,&local_38,param_3,param_1 + 0x30);
      *(undefined2 *)(param_1 + 0xb0) = uVar1;
      if ((*(int *)(param_1 + 0xb8) != 0) && (*(long **)(param_1 + 0x58) != 0)) {}
      FUN_1010a1ef8(uVar5,uVar2,uVar6,0);
    `,
  },
};

function manifests(overrides = {}) {
  return {
    componentChainManifest: {
      summary: { rows: 25, closedEvidenceRows: 25, parameterIndexRows: 2 },
    },
    particleRegistrationManifest: {
      summary: {
        layoutBTypeRecordRecovered: true,
        layoutBRegistrationRecovered: true,
        managerEntryStoreRecovered: true,
        backingFlagStorageRecovered: true,
        particleFlagFilterRecovered: true,
        exactLayoutBParticleFlagProducerRows: 0,
      },
      registrationChain: { layoutB: "object+0x30 -> 0x188eee0 -> object+0xb0" },
      unresolved: ["which PFX/emitter instance owns the object whose +0x30 subobject is stored into manager record +0x8"],
    },
    particleDrawManifest: {
      summary: {
        particleDrawBatchRecovered: true,
        sharedManagerEntryMaterializationRecovered: true,
      },
      unresolved: ["which concrete PFX/emitter instance class stores itself into manager record +0x8"],
    },
    positionSamplerManifest: {
      summary: {
        sceneEntityRecordEntryLayoutBRecovered: true,
        sceneEntityRecordEntryLayoutBMaterialParamUpdateRecovered: true,
        sceneEntityRecordEntryLayoutBStateDispatchRecovered: true,
        sceneEntityRecordEntryRenderOwnerBuilderLinked: true,
      },
      sceneEntityRecordEntryEvidence: {
        layoutB: {
          registerFunctionHex: "0x8d398c",
          managerRegistration: { conclusion: "object +0x30 is stored in manager record +0x8" },
          materialParamUpdate: {
            bitfieldSource: "object +0x10c/+0x110",
            parameterSourceRange: "object +0xf8..+0x108",
            targetObject: "object +0x50",
          },
          stateDispatch: { linkedStateObject: "object +0x58" },
        },
        entryCallbacks: {
          helperDispatch: {
            argumentPattern: "prepares x0 = object +0x58 and x2 = object +0x40",
          },
        },
        renderOwnerBuilderLink: {
          conclusion: "entry +0x8 reaches owner vtable +0x10 builders",
        },
        unresolved: [],
      },
    },
    ...overrides,
  };
}

test("buildKindredCurrentParticleBridgeAudit aligns original component fields with current layout B evidence", () => {
  const report = buildKindredCurrentParticleBridgeAudit({ sources, ...manifests() }, "TEST_DATE");

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 9);
  assert.equal(report.summary.closedEvidenceRows, 7);
  assert.equal(report.summary.blockedRows, 2);
  assert.equal(report.summary.crossBuildComponentShapeRecovered, true);
  assert.equal(report.summary.currentLayoutBComponentShapeRecovered, true);
  assert.equal(report.summary.currentEntryRenderOwnerBuilderLinked, true);
  assert.equal(report.summary.currentParticleDrawBatchRecovered, true);
  assert.equal(report.summary.renderPromotionAllowed, false);
  assert.equal(report.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(report.summary.pfxEmitterManagerEntryOwnerRecovered, false);

  const parameterRow = report.items.find((item) => item.id === "component-parameter-packing-alignment");
  assert.equal(parameterRow.evidenceState, "evidence-found");
  assert.match(parameterRow.recoveredFields, /\+0x10c/);

  const flagRow = report.items.find((item) => item.id === "current-layout-b-particle-flag-producer");
  assert.equal(flagRow.evidenceState, "blocked");
  assert.match(flagRow.nextRequiredEvidence, /object \+0xac/);
});

test("buildKindredCurrentParticleBridgeAudit keeps bridge diagnostic when current layout B evidence is absent", () => {
  const report = buildKindredCurrentParticleBridgeAudit(
    {
      sources,
      ...manifests({
        positionSamplerManifest: {
          summary: {
            sceneEntityRecordEntryLayoutBRecovered: false,
            sceneEntityRecordEntryLayoutBMaterialParamUpdateRecovered: false,
            sceneEntityRecordEntryLayoutBStateDispatchRecovered: false,
            sceneEntityRecordEntryRenderOwnerBuilderLinked: false,
          },
          sceneEntityRecordEntryEvidence: {},
        },
      }),
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.currentLayoutBComponentShapeRecovered, false);
  assert.equal(report.summary.renderPromotionAllowed, false);
  assert.ok(report.summary.missingEvidenceRows >= 3);
});

test("exportKindredCurrentParticleBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-kindred-current-bridge-"));
  const write = (name, contents) => {
    const filePath = path.join(tempDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return filePath;
  };
  const manifestSet = manifests();
  const androidType = write("android-type.c", sources.androidType.text);
  const androidUpdate = write("android-update.c", sources.androidUpdate.text);
  const androidComponent = write("android-component.c", sources.androidComponent.text);
  const iosComponent = write("ios-component.c", sources.iosComponent.text);
  const componentChain = write("component-chain.json", JSON.stringify(manifestSet.componentChainManifest));
  const particleRegistration = write("particle-registration.json", JSON.stringify(manifestSet.particleRegistrationManifest));
  const particleDraw = write("particle-draw.json", JSON.stringify(manifestSet.particleDrawManifest));
  const positionSampler = write("position-sampler.json", JSON.stringify(manifestSet.positionSamplerManifest));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportKindredCurrentParticleBridgeAudit({
    viewerOut,
    jsonOut,
    tsvOut,
    paths: {
      androidTypeSourcePath: androidType,
      androidUpdateSourcePath: androidUpdate,
      androidComponentSourcePath: androidComponent,
      iosComponentSourcePath: iosComponent,
      componentChainPath: componentChain,
      particleRegistrationPath: particleRegistration,
      particleDrawPath: particleDraw,
      positionSamplerPath: positionSampler,
    },
  });

  assert.equal(summary.rows, 9);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.rows, 9);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /current-layout-b-particle-flag-producer/);
});
