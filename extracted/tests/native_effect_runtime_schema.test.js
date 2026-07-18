const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeEffectRuntimeSchema,
  exportNativeEffectRuntimeSchema,
  reportRowsForManifest,
} = require("../tools/native_effect_runtime_schema");

const source = `
void FUN_aaa(void)

{
  if ((DAT_flag & 1) == 0) {
    DAT_aaa100 = 0;
    DAT_aaa104 = 0x8;
    DAT_aaa108 = PTR_DAT_500020;
    DAT_aaa110 = 0;
    DAT_aaa114 = 0x10;
    DAT_aaa118 = PTR_DAT_500040;
    DAT_aaa120 = DAT_aaa120 + 2;
    DAT_flag = 1;
  }
  return;
}

void FUN_bbb(void)

{
  long lVar1;
  if ((DAT_effect_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_500020,1,"Effect",0x10,8);
    DAT_effect_flag = 1;
  }
  return;
}

void FUN_ccc(void)

{
  long lVar1;
  if ((DAT_group_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_500040,1,"EffectGroup",0x20,8);
    DAT_group_flag = 1;
  }
  return;
}

void FUN_ddd(void)

{
  long lVar1;
  if ((DAT_static_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_600000,1,"StaticPfx",0x30,8);
    *(undefined4 **)(lVar1 + 0x10) = &DAT_aaa100;
    *(undefined4 **)(lVar1 + 0x18) = &DAT_aaa120;
    DAT_static_flag = 1;
  }
  return;
}

void FUN_eee(void)

{
  long lVar1;
  if ((DAT_skin_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_700000,1,"SkinRep",0x68,8);
    DAT_skin_flag = 1;
  }
  return;
}
`;

test("buildNativeEffectRuntimeSchema focuses native type fields used by effect runtime", () => {
  const manifest = buildNativeEffectRuntimeSchema(source, {
    focusTypes: ["StaticPfx"],
  }, "2026-06-27T00:00:00.000Z");

  assert.equal(manifest.summary.schemaRows, 2);
  assert.equal(manifest.summary.types, 1);
  assert.equal(manifest.summary.byType.StaticPfx, 2);
  assert.deepEqual(manifest.items.map((item) => item.fieldOffset), ["0x8", "0x10"]);
  assert.match(manifest.items[0].candidateTypes, /Effect@0x500020:0x10/);
  assert.match(manifest.items[1].exactSpanCandidates, /EffectGroup@0x500040:0x20/);
  assert.equal(reportRowsForManifest(manifest)[0].typeName, "StaticPfx");
});

test("exportNativeEffectRuntimeSchema writes viewer JSON and audit TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-effect-runtime-schema-"));
  const sourcePath = path.join(tempDir, "types.c");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(sourcePath, source);

  const summary = exportNativeEffectRuntimeSchema({
    sourcePath,
    focusTypes: ["StaticPfx"],
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.schemaRows, 2);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /StaticPfx/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /candidateTypes/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.byType.StaticPfx, 2);
});
