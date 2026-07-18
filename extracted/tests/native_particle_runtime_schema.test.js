const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeParticleRuntimeSchema,
  exportNativeParticleRuntimeSchema,
  reportRowsForManifest,
} = require("../tools/native_particle_runtime_schema");

const source = `
int FUN_lookup(long param_1,undefined8 param_2) {
  return 0;
}

undefined * FUN_10109b3dc(ulong param_1)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;

  uVar2 = 0;
  uVar3 = 0x3852e;
  do {
    uVar1 = uVar2 + (uVar3 - uVar2 >> 1);
    if (*(ulong *)(&DAT_1014a8918 + (ulong)uVar1 * 0x10) == param_1) {
      return (&PTR_FUN_1014a8920)[(ulong)uVar1 * 2];
    }
    if (*(ulong *)(&DAT_1014a8918 + (ulong)uVar1 * 0x10) < param_1) {
      uVar2 = uVar1 + 1;
      uVar1 = uVar3;
    }
    uVar3 = uVar1;
  } while (uVar2 < uVar3);
  return (undefined *)0x0;
}

void FUN_update(float param_1,undefined8 param_2,long param_3,undefined8 param_4,ulong param_5,
                undefined8 param_6,undefined8 param_7,undefined8 param_8)
{
  if (*(char *)(param_3 + 0x248) == '\\0') {
    param_1 = param_1 - *(float *)(param_3 + 0x24c);
    if (*(float *)(param_3 + 0x250) <= 0.0) {
      FUN_velocity(param_1,param_3,param_4);
    }
  }
  if (*(int *)(param_3 + 0x200) == 0) {
    return;
  }
  if (*(long *)(param_3 + 600) != 0) {
    FUN_drag(param_1,param_2,param_3,param_4,param_8);
  }
  if (*(long *)(param_3 + 0x260) != 0) {
    FUN_velocity_vector(param_1,param_2,param_3,param_4,param_8);
  }
  FUN_integrate(param_2,param_3,param_4);
  if (*(long *)(param_3 + 0x268) != 0) {
    FUN_position_vector(param_1,param_2,param_3,param_4,param_8);
  }
  if (*(long *)(param_3 + 0x270) != 0) {
    FUN_size(param_1,param_2,param_3,param_4,param_8);
  }
  if (*(long *)(param_3 + 0x278) != 0) {
    FUN_rotation(param_1,param_2,param_3,param_4,param_8);
  }
  if (*(long *)(param_3 + 0x280) != 0) {
    FUN_color(param_1,param_3,param_4,param_8);
  }
  uVar1 = *(uint *)(param_3 + 0x220) & 0xf;
  if (uVar1 == 6) {
    uVar2 = FUN_lookup(param_7,"beam_target");
    FUN_copy(param_7,uVar2,param_3 + 0x224,3);
    uVar2 = FUN_lookup(param_7,"beam_target_tangent");
    FUN_copy(param_7,uVar2,param_3 + 0x230,3);
    uVar2 = FUN_lookup(param_7,"beam_source_tangent");
    param_3 = param_3 + 0x23c;
  }
  else {
    if (uVar1 != 5) {
      return;
    }
    uVar2 = FUN_lookup(param_7,"beam_target");
    param_3 = param_3 + 0x224;
  }
  FUN_copy(param_7,uVar2,param_3,3);
}

void FUN_drag(undefined1 param_1 [16],float param_2,ushort *param_3,long param_4,undefined8 param_5)
{
  iVar4 = (**(code **)(param_3 + 300))
                    ((ulong)*(uint *)(param_3 + 0x100),pfVar7,param_3,param_4,param_5);
  uVar9 = *(undefined8 *)(param_4 + 0x18000 + lVar6);
}

void FUN_velocity_vector(undefined1 param_1 [16],undefined8 param_2,ushort *param_3,long param_4,undefined8 param_5)
{
  iVar5 = (**(code **)(param_3 + 0x130))
                    ((ulong)*(uint *)(param_3 + 0x100),puVar8,param_3,param_4,param_5);
  *(ulong *)(param_4 + 0x18000 + lVar7) = 0;
}

void FUN_integrate(float param_1,ushort *param_2,long param_3)
{
  *(ulong *)(param_3 + lVar4) = 0;
  uVar5 = *(undefined8 *)(param_3 + 0x18000 + lVar4);
}

void FUN_position_vector(undefined1 param_1 [16],undefined8 param_2,ushort *param_3,long param_4,undefined8 param_5)
{
  iVar4 = (**(code **)(param_3 + 0x134))
                    ((ulong)*(uint *)(param_3 + 0x100),puVar7,param_3,param_4,param_5);
  *(ulong *)(param_4 + lVar6) = 0;
}

void FUN_size(undefined1 param_1 [16],float param_2,ushort *param_3,long param_4,undefined8 param_5)
{
  iVar2 = (**(code **)(param_3 + 0x138))
                    ((ulong)*(uint *)(param_3 + 0x100),pfVar4,param_3,param_4,param_5);
  *(undefined8 *)(lVar1 + 0x30000) = uVar5;
}

void FUN_rotation(undefined1 param_1 [16],float param_2,ushort *param_3,long param_4,undefined8 param_5)
{
  iVar2 = (**(code **)(param_3 + 0x13c))
                    ((ulong)*(uint *)(param_3 + 0x100),pfVar4,param_3,param_4,param_5);
  *(float *)(lVar1 + 0x40000) = 1.0;
}

void FUN_color(ushort *param_1,long param_2,undefined8 param_3)
{
  iVar4 = (**(code **)(param_1 + 0x140))(uVar5,plVar6,param_1,param_2,param_3);
  *(long *)(lVar1 + 0x58008) = lVar9;
  *(long *)(lVar1 + 0x58000) = lVar7;
}

void FUN_loader(long param_1,long param_2,long plVar13,long lVar7)
{
  *(undefined8 *)(lVar7 + 0x24c) = *(undefined8 *)((long)plVar13 + 0xac);
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xb4));
  *(undefined8 *)(lVar7 + 600) = uVar8;
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xbc));
  *(undefined8 *)(lVar7 + 0x260) = uVar8;
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xc4));
  *(undefined8 *)(lVar7 + 0x268) = uVar8;
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xcc));
  *(undefined8 *)(lVar7 + 0x270) = uVar8;
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xd4));
  *(undefined8 *)(lVar7 + 0x278) = uVar8;
  uVar8 = FUN_curve(*(undefined8 *)((long)plVar13 + 0xdc));
  *(undefined8 *)(lVar7 + 0x280) = uVar8;
}
`;

test("buildNativeParticleRuntimeSchema extracts beam parameters, emitter fields, and particle arrays", () => {
  const manifest = buildNativeParticleRuntimeSchema(source, "2026-06-29T00:00:00.000Z");

  assert.equal(manifest.summary.beamParameterRows, 3);
  assert.equal(manifest.summary.emitterFieldRows, 14);
  assert.equal(manifest.summary.particleStateArrayRows, 5);
  assert.equal(manifest.summary.pfxEmitterRecordRows, 8);
  assert.equal(manifest.summary.particleCallbackUpdateRows, 6);
  assert.equal(manifest.summary.particleCallbackResolverRows, 1);
  assert.equal(manifest.summary.byEmitterSemantic.beamTarget, 1);
  assert.equal(manifest.summary.byParticleArraySemantic.velocity, 1);
  assert.equal(manifest.summary.byParticleArraySemantic.color, 1);
  assert.equal(manifest.summary.byPfxEmitterSemantic.sizeDeltaCallback, 1);
  assert.equal(manifest.summary.byCallbackUpdateSemantic.sizeDeltaCallback, 1);
  assert.equal(manifest.summary.byCallbackUpdateTargetArray["0x58000"], 1);
  assert.equal(manifest.summary.byCallbackResolverTable.DAT_1014a8918, 1);

  const fieldOffsets = manifest.items
    .filter((item) => item.recordKind === "emitter-field")
    .map((item) => `${item.offset}:${item.semantic}`);
  assert.deepEqual(fieldOffsets, [
    "0x200:activeParticleCount",
    "0x220:renderKindBits",
    "0x224:beamTarget",
    "0x230:beamTargetTangent",
    "0x23c:beamSourceTangent",
    "0x248:delayGateActive",
    "0x24c:delaySeconds",
    "0x250:activeDurationSeconds",
    "0x258:velocityDampingCallback",
    "0x260:velocityVectorCallback",
    "0x268:positionVectorCallback",
    "0x270:sizeDeltaCallback",
    "0x278:rotationDeltaCallback",
    "0x280:colorCallback",
  ]);

  assert.deepEqual(
    manifest.items.filter((item) => item.recordKind === "beam-parameter").map((item) => `${item.name}:${item.offset}`),
    ["beam_target:0x224", "beam_target_tangent:0x230", "beam_source_tangent:0x23c"],
  );

  assert.deepEqual(
    manifest.items.filter((item) => item.recordKind === "particle-state-array").map((item) => `${item.offset}:${item.semantic}`),
    ["0x0:position", "0x18000:velocity", "0x30000:size", "0x40000:rotation", "0x58000:color"],
  );

  assert.deepEqual(
    manifest.items
      .filter((item) => item.recordKind === "pfx-emitter-record")
      .map((item) => `${item.pfxOffset}->${item.runtimeOffset}:${item.semantic}`),
    [
      "0xac->0x24c:delaySeconds",
      "0xb0->0x250:activeDurationSeconds",
      "0xb4->0x258:velocityDampingCallback",
      "0xbc->0x260:velocityVectorCallback",
      "0xc4->0x268:positionVectorCallback",
      "0xcc->0x270:sizeDeltaCallback",
      "0xd4->0x278:rotationDeltaCallback",
      "0xdc->0x280:colorCallback",
    ],
  );

  assert.deepEqual(
    manifest.items
      .filter((item) => item.recordKind === "particle-callback-update")
      .map((item) => `${item.runtimeOffset}:${item.semantic}->${item.targetArrayOffset}:${item.targetArraySemantic}:${item.callbackOutputComponents}`),
    [
      "0x258:velocityDampingCallback->0x18000:velocity:1",
      "0x260:velocityVectorCallback->0x18000:velocity:3",
      "0x268:positionVectorCallback->0x0:position:3",
      "0x270:sizeDeltaCallback->0x30000:size:1",
      "0x278:rotationDeltaCallback->0x40000:rotation:1",
      "0x280:colorCallback->0x58000:color:4",
    ],
  );

  assert.deepEqual(
    manifest.items
      .filter((item) => item.recordKind === "particle-callback-resolver")
      .map((item) => ({
        resolverFunction: item.resolverFunction,
        tableBase: item.tableBase,
        pointerBase: item.pointerBase,
        entryCount: item.entryCount,
        entryStride: item.entryStride,
        keyOffset: item.keyOffset,
        callbackOffset: item.callbackOffset,
      })),
    [
      {
        resolverFunction: "FUN_10109b3dc",
        tableBase: "DAT_1014a8918",
        pointerBase: "PTR_FUN_1014a8920",
        entryCount: "0x3852e",
        entryStride: "0x10",
        keyOffset: "0x0",
        callbackOffset: "0x8",
      },
    ],
  );
});

test("exportNativeParticleRuntimeSchema writes viewer JSON and TSV reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-particle-runtime-schema-"));
  const sourcePath = path.join(tempDir, "particle.c");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(sourcePath, source);

  const summary = exportNativeParticleRuntimeSchema({
    sourcePath,
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 37);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /beam_target_tangent/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /particle-callback-update/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /particle-callback-resolver/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.byEmitterSemantic.colorCallback, 1);
  assert.equal(reportRowsForManifest(JSON.parse(fs.readFileSync(viewerOut, "utf8"))).length, 37);
});
