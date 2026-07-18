const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeProjectileCallbackSemantics,
  classifyProjectileCallbackBlock,
  exportNativeProjectileCallbackSemantics,
} = require("../tools/native_projectile_callback_semantics");

const callbackSource = `
void FUN_00aaa100(undefined8 param_1,undefined8 param_2,undefined4 *param_3,undefined8 *param_4)
{
  char *pcVar1;
  ulong uVar3;
  undefined4 uVar4;
  uVar3 = FUN_00d6bbac(lVar2,DAT_0315cf30,0);
  uVar4 = 0x5b;
  pcVar1 = "GunMuzzleTip_Ability02_Attack";
  if ((uVar3 & 1) == 0) {
    uVar4 = 0x59;
    pcVar1 = "GunMuzzleTip_Attack";
  }
  *param_3 = uVar4;
  *param_4 = pcVar1;
}

void FUN_00aaa200(undefined8 param_1,float *param_2)
{
  *param_2 = 0x3f800000;
}
`;

test("classifyProjectileCallbackBlock recognizes state-conditional emitter overrides", () => {
  const result = classifyProjectileCallbackBlock(callbackSource);
  assert.equal(result.semanticClass, "state-conditional-emitter");
  assert.deepEqual(result.projectileIdHexes, ["0x5b", "0x59"]);
  assert.deepEqual(result.emitterLabels, ["GunMuzzleTip_Ability02_Attack", "GunMuzzleTip_Attack"]);
  assert.match(result.evidenceTags, /writes-projectile-id|writes-emitter-label|state-query/);
});

test("classifyProjectileCallbackBlock recognizes literal constant callbacks", () => {
  const result = classifyProjectileCallbackBlock(`
void FUN_00aaa200(undefined8 param_1,float *param_2)
{
  *param_2 = 0x3f800000;
}
`);
  assert.equal(result.semanticClass, "constant");
  assert.deepEqual(result.constantValues, ["1"]);
});

test("buildNativeProjectileCallbackSemantics joins projectile rows to callback bodies", () => {
  const rows = buildNativeProjectileCallbackSemantics({
    projectileRows: [
      {
        platform: "android",
        sourceFile: "callbacks.c",
        functionName: "FUN_parent",
        callbackFunction: "FUN_00aaa100",
        actionKeys: ["attack"],
        heroNames: ["Ringo"],
        emitterLabel: "GunMuzzleTip_Attack",
      },
    ],
    sourceReader: () => callbackSource,
    generatedAt: "2026-06-26T00:00:00.000Z",
  });

  assert.equal(rows.items.length, 1);
  assert.equal(rows.items[0].callbackSlot, "callbackFunction");
  assert.equal(rows.items[0].semanticClass, "state-conditional-emitter");
  assert.deepEqual(rows.items[0].heroNames, ["Ringo"]);
});

test("exportNativeProjectileCallbackSemantics writes viewer JSON and report TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-callback-"));
  const sourceFile = path.join(tempDir, "callbacks.c");
  const manifestPath = path.join(tempDir, "native-projectile-spawn-manifest.json");
  const jsonOut = path.join(tempDir, "native-projectile-callback-semantics.json");
  const tsvOut = path.join(tempDir, "native_projectile_callback_semantics.tsv");

  fs.writeFileSync(sourceFile, callbackSource);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      items: [
        {
          platform: "android",
          sourceFile,
          functionName: "FUN_parent",
          projectileCallback18: "FUN_00aaa200",
          callbackFunction: "FUN_00aaa100",
          actionKeys: ["attack"],
          heroNames: ["Ringo"],
        },
      ],
    }),
  );

  const summary = exportNativeProjectileCallbackSemantics({ projectileManifestPath: manifestPath, jsonOut, tsvOut });

  assert.equal(summary.rows, 2);
  assert.equal(summary.bySemanticClass["state-conditional-emitter"], 1);
  assert.equal(summary.bySemanticClass.constant, 1);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /state-conditional-emitter/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /projectileCallback18/);
});
