const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildKindredEffectComponentRuntimeChainAudit,
  exportKindredEffectComponentRuntimeChainAudit,
  reportRowsForManifest,
} = require("../tools/kindred_effect_component_runtime_chain_audit");

const iosComponent = `
void FUN_100045334(long param_1,int *param_2)
{
  FUN_10034c450(0,"*KindredEffects*");
  FUN_100045270();
  *(undefined8 *)(param_1 + 0x50) = 1;
  FUN_100045094(param_1);
}
void FUN_1000451ac(long param_1,char *param_2,int param_3)
{
  int hash = 0x811c9dc5;
  FUN_10034c450(0,"*KindredEffects*");
  FUN_100045270();
  *(undefined8 *)(param_1 + 0x50) = hash;
  FUN_100045094(param_1);
}
undefined8 FUN_100045270(undefined8 param_1)
{
  FUN_100658cac(param_1,0,0);
  FUN_1006663f0();
  return FUN_100669c08(0,0,0);
}
void FUN_100045094(long param_1)
{
  FUN_100666230(*(long *)(param_1 + 0x50),"Ally_Enemy");
  FUN_100666230(*(long *)(param_1 + 0x50),"Color");
  FUN_100666230(*(long *)(param_1 + 0x50),"Radius");
  FUN_100666230(*(long *)(param_1 + 0x50),"Alpha");
  FUN_100666230(*(long *)(param_1 + 0x50),"SizeXY");
  FUN_100666230(*(long *)(param_1 + 0x50),"Duration");
}
void FUN_100045474(long param_1,float *param_2)
{
  float *pfVar3 = *(float **)(param_1 + 0x50);
  *(float *)(param_1 + 0x68) = *pfVar3;
}
void FUN_100044d00(long param_1)
{
  FUN_100045474(param_1,0);
  FUN_1010a1cc8();
  FUN_100667770(*(undefined8 *)(param_1 + 0x50));
  FUN_1010a1ef8(0,0,0,0);
}
void FUN_1000453bc(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_10066617c(); }
void FUN_1000453cc(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_1006661c4(); }
void FUN_1000453dc(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_100666204(); }
void FUN_1000453f0(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_1006661ec(); }
`;

const iosPfx = `
long FUN_100667770(long param_1)
{
  return param_1 + 0x40;
}
`;

const iosQueue = `
void FUN_1010a1ef8(undefined8 *param_1,ulong param_2)
{
  (**(code **)(*(long *)*param_1 + 0x20))((long *)*param_1,*(undefined2 *)((long)param_1 + param_2 * 0x10 + 0x12));
}
`;

const androidComponent = `
void FUN_009d3364(long param_1,int *param_2)
{
  FUN_00d6eb5c(0,"*KindredEffects*");
  FUN_009d3278();
  *(undefined8 *)(param_1 + 0x50) = 1;
  FUN_009d3098(param_1);
}
void FUN_009d31b4(long param_1,byte *param_2,uint param_3)
{
  int hash = 0x811c9dc5;
  FUN_00d6eb5c(0,"*KindredEffects*");
  FUN_009d3278();
  *(undefined8 *)(param_1 + 0x50) = hash;
  FUN_009d3098(param_1);
}
undefined8 FUN_009d3278(undefined8 param_1)
{
  FUN_00f1c800(param_1,0,0);
  FUN_00f3428c();
  return FUN_00f32a6c(0,0,0);
}
void FUN_009d3098(long param_1)
{
  FUN_00f30afc(*(long *)(param_1 + 0x50),"Ally_Enemy");
  FUN_00f30afc(*(long *)(param_1 + 0x50),"Color");
  FUN_00f30afc(*(long *)(param_1 + 0x50),"Radius");
  FUN_00f30afc(*(long *)(param_1 + 0x50),"Alpha");
  FUN_00f30afc(*(long *)(param_1 + 0x50),"SizeXY");
  FUN_00f30afc(*(long *)(param_1 + 0x50),"Duration");
}
void FUN_009d34d4(long param_1,float *param_2)
{
  float *pfVar6 = *(float **)(param_1 + 0x50);
  *(float *)(param_1 + 0x68) = *pfVar6;
}
void FUN_009d33ec(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_00f309f4(); }
void FUN_009d33fc(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_00f30a1c(); }
void FUN_009d341c(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_00f30a80(); }
void FUN_009d3430(long param_1) { if (*(long *)(param_1 + 0x50) != 0) FUN_00f30a68(); }
`;

const androidUpdate = `
void FUN_009d288c(long param_1)
{
  FUN_009d34d4(param_1,0);
  FUN_01988c6c();
  FUN_00f31994(*(undefined8 *)(param_1 + 0x50));
  FUN_019894ac(0,0,0,0);
}
`;

const androidPfxCore = `
void FUN_00f30a80(long param_1,uint param_2)
{
  ushort uVar1 = 2;
  *(ushort *)(param_1 + 100) = *(ushort *)(param_1 + 100) & 7 | uVar1;
}
`;

const androidPfxObject = `
long FUN_00f31994(long param_1)
{
  return param_1 + 0x40;
}
`;

const androidQueue = `
void FUN_019894ac(undefined8 *param_1,ushort param_2)
{
  (**(code **)(*(long *)*param_1 + 0x20))((long *)*param_1,*(undefined2 *)((long)param_1 + (ulong)param_2 * 0x10 + 0x12));
}
`;

function mockSources(overrides = {}) {
  return {
    iosComponent: { sourcePath: "ios-component.c", text: iosComponent },
    iosPfx: { sourcePath: "ios-pfx.c", text: iosPfx },
    iosQueue: { sourcePath: "ios-queue.c", text: iosQueue },
    androidComponent: { sourcePath: "android-component.c", text: androidComponent },
    androidUpdate: { sourcePath: "android-update.c", text: androidUpdate },
    androidPfxCore: { sourcePath: "android-pfx-core.c", text: androidPfxCore },
    androidPfxFactory: { sourcePath: "android-pfx-factory.c", text: "" },
    androidPfxObject: { sourcePath: "android-pfx-object.c", text: androidPfxObject },
    androidPfxGlobal: { sourcePath: "android-pfx-global.c", text: "" },
    androidQueue: { sourcePath: "android-queue.c", text: androidQueue },
    ...overrides,
  };
}

test("buildKindredEffectComponentRuntimeChainAudit closes the original component create, transform, payload, and submit chain", () => {
  const report = buildKindredEffectComponentRuntimeChainAudit(
    {
      sources: mockSources(),
      gateAuditManifest: { summary: { rows: 27, rendererLinkNeededRows: 14, createChainUnresolvedRows: 13 } },
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 25);
  assert.equal(report.summary.closedEvidenceRows, 25);
  assert.equal(report.summary.missingEvidenceRows, 0);
  assert.equal(report.summary.closedRenderSubmitRows, 2);
  assert.equal(report.summary.pfxGateRendererLinkNeededRows, 14);
  assert.equal(report.summary.pfxGateCreateChainUnresolvedRows, 13);
  assert.equal(report.summary.renderPromotionAllowed, false);
  assert.equal(report.summary.byChainStage["kindred-hash-create"], 2);
  assert.equal(report.summary.byChainStage["lifecycle-method"], 8);

  const iosSubmit = report.items.find((item) => item.id === "ios-render-queue-submit");
  assert.equal(iosSubmit.sourceFunction, "FUN_100044d00");
  assert.equal(iosSubmit.evidenceState, "evidence-found");
  assert.match(iosSubmit.callTargets, /FUN_100667770/);

  const androidSubmit = report.items.find((item) => item.id === "android-render-queue-submit");
  assert.equal(androidSubmit.sourceFunction, "FUN_009d288c");
  assert.equal(androidSubmit.evidenceState, "evidence-found");
  assert.match(androidSubmit.callTargets, /FUN_00f31994/);

  const parameterRow = report.items.find((item) => item.id === "ios-parameter-index");
  assert.equal(parameterRow.recoveredRuntimeFields, "Ally_Enemy|Color|Radius|Alpha|SizeXY|Duration");
  assert.equal(reportRowsForManifest(report)[0].renderPromotionAllowed, false);
});

test("buildKindredEffectComponentRuntimeChainAudit keeps promotion closed when native evidence is missing", () => {
  const report = buildKindredEffectComponentRuntimeChainAudit(
    {
      sources: mockSources({ androidQueue: { sourcePath: "android-queue.c", text: "" } }),
    },
    "TEST_DATE",
  );

  assert.equal(report.summary.closedEvidenceRows, 24);
  assert.equal(report.summary.missingEvidenceRows, 1);
  assert.equal(report.summary.byEvidenceState["source-function-missing"], 1);
  const missing = report.items.find((item) => item.id === "android-render-queue-dispatch");
  assert.equal(missing.evidenceState, "source-function-missing");
  assert.equal(missing.renderPromotionAllowed, false);
});

test("exportKindredEffectComponentRuntimeChainAudit writes full report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-kindred-component-runtime-"));
  const write = (name, text) => {
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, text);
    return filePath;
  };
  const gateAuditPath = write("gate.json", JSON.stringify({ summary: { rows: 27, rendererLinkNeededRows: 14 } }));
  const jsonOut = path.join(tempDir, "report.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");

  const summary = exportKindredEffectComponentRuntimeChainAudit({
    gateAuditPath,
    jsonOut,
    viewerOut,
    tsvOut,
    iosComponentSourcePath: write("ios-component.c", iosComponent),
    iosPfxSourcePath: write("ios-pfx.c", iosPfx),
    iosQueueSourcePath: write("ios-queue.c", iosQueue),
    androidComponentSourcePath: write("android-component.c", androidComponent),
    androidUpdateSourcePath: write("android-update.c", androidUpdate),
    androidPfxCoreSourcePath: write("android-pfx-core.c", androidPfxCore),
    androidPfxFactorySourcePath: write("android-pfx-factory.c", ""),
    androidPfxObjectSourcePath: write("android-pfx-object.c", androidPfxObject),
    androidPfxGlobalSourcePath: write("android-pfx-global.c", ""),
    androidQueueSourcePath: write("android-queue.c", androidQueue),
  });

  assert.equal(summary.rows, 25);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /closed-original-render-submit/);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.pfxGateRendererLinkNeededRows, 14);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /android-render-queue-submit/);
});
