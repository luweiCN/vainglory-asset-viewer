const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentExtraTransformChain,
  extractNativeAttachmentExtraTransformChainFromSources,
} = require("../tools/native_attachment_extra_transform_chain");

const iosSource = `
void FUN_10002d0f0(long param_1)
{
  long lVar1;
  DAT_10184de08 = *(uint *)(param_1 + 0x13fb0);
  lVar1 = param_1 + (ulong)DAT_10184de08 * 0x2e8;
  *(undefined4 *)(lVar1 + 0xa8) = 0x78;
  FUN_1010a0944(param_1,3,FUN_10002d18c,0);
  FUN_1010a0944(param_1,1,FUN_10002d1a8,0);
}

void FUN_10002d1c4(long param_1)
{
  if (*(int *)(*(long *)(param_1 + 8) + 0xa4) == DAT_10184dd68) {
    FUN_10002a8e4(param_1,param_1 + 0x34,*(undefined8 *)(param_1 + 0x68),param_1 + 0x70);
    use(DAT_10184dc68);
  }
}

void FUN_10002d208(long param_1)
{
  if (*(int *)(param_1 + 0x70) != -1) {
    FUN_10002a9bc();
  }
}

undefined8 FUN_10003c904(undefined8 param_1)
{
  undefined8 *puVar1;
  puVar1 = (undefined8 *)FUN_1000504dc();
  *puVar1 = &PTR_thunk_FUN_100050910_10144c230;
  FUN_1000509c8(puVar1,"sword_bnd");
  return param_1;
}
`;

const androidSource = `
undefined8 * FUN_009d803c(undefined8 *param_1)
{
  FUN_009df040();
  *param_1 = &PTR_thunk_FUN_009df4b8_027c34d8;
  FUN_009df57c(param_1,"Horns_bnd");
  return param_1;
}
`;

const specs = [
  {
    platform: "ios",
    kind: "single-extra-transform-component",
    registrationFunction: "FUN_10002d0f0",
    runtimeFunctions: ["FUN_10002d1c4", "FUN_10002d208"],
    evidencePatterns: [
      ["component-token-DAT_10184de08", /DAT_10184de08/],
      ["component-size-0x78", /0x78/],
      ["phase-3-register-hook", /FUN_1010a0944\(param_1,3,FUN_10002d18c,0\)/],
      ["phase-1-unregister-hook", /FUN_1010a0944\(param_1,1,FUN_10002d1a8,0\)/],
      ["animation-component-token-DAT_10184dc68", /DAT_10184dc68/],
      ["owner-component-token-DAT_10184dd68", /DAT_10184dd68/],
      ["register-extra-transform-api", /FUN_10002a8e4/],
      ["unregister-extra-transform-api", /FUN_10002a9bc/],
    ],
  },
];

function sourceFile(filePath, text) {
  return { filePath, text };
}

test("extra transform chain scanner joins component evidence and binding tokens", () => {
  const rows = extractNativeAttachmentExtraTransformChainFromSources({
    sourceFiles: [
      sourceFile("external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c", iosSource),
      sourceFile(
        "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
        androidSource,
      ),
    ],
    specs,
  });

  assert.equal(rows.length, 3);
  const component = rows.find((row) => row.stage === "extra-transform-chain");
  assert.equal(component.complete, "yes");
  assert.match(component.evidenceTags, /register-extra-transform-api/);
  assert.match(component.relatedFunctions, /FUN_10002d208/);

  const tokens = rows.filter((row) => row.stage === "binding-token-registration").map((row) => row.bindToken).sort();
  assert.deepEqual(tokens, ["Horns_bnd", "sword_bnd"]);
});

test("extra transform exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-extra-transform-chain-"));
  const iosDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const androidDir = path.join(tempDir, "GameKindred_android_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, "test.c"), iosSource);
  fs.writeFileSync(path.join(androidDir, "test.c"), androidSource);

  const summary = exportNativeAttachmentExtraTransformChain({
    sourcePaths: [iosDir, androidDir],
    specs,
    tsvOut: path.join(reportDir, "native_attachment_extra_transform_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_extra_transform_chain_summary.json"),
  });

  assert.equal(summary.rows, 3);
  assert.equal(summary.completeRows, 3);
  assert.equal(summary.byBindToken.sword_bnd, 1);
  assert.match(fs.readFileSync(path.join(reportDir, "native_attachment_extra_transform_chain.tsv"), "utf8"), /Horns_bnd/);
});
