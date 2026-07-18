const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { defaultFocusTypes, exportNativeSkinChainSchema } = require("../tools/native_skin_chain_schema");

const source = `
void FUN_aaa(void)

{
  if ((DAT_flag & 1) == 0) {
    DAT_aaa100 = 0;
    DAT_aaa104 = 0;
    DAT_aaa108 = PTR_DAT_200020;
    DAT_aaa120 = DAT_aaa120 + 1;
    DAT_flag = 1;
  }
  return;
}

void FUN_bbb(void)

{
  long lVar1;
  if ((DAT_reg_flag & 1) == 0) {
    lVar1 = FUN_1010a3954(&DAT_200000,1,"SkinEntry",0x38,8);
    *(undefined4 **)(lVar1 + 0x10) = &DAT_aaa100;
    *(undefined4 **)(lVar1 + 0x18) = &DAT_aaa120;
    DAT_reg_flag = 1;
  }
  return;
}
`;

test("native skin chain schema wrapper focuses manifest and runtime types", () => {
  assert.ok(defaultFocusTypes.includes("SkinEntry"));
  assert.ok(defaultFocusTypes.includes("HeroEntry"));
  assert.ok(defaultFocusTypes.includes("SkinRep"));
  assert.ok(defaultFocusTypes.includes("AlternateAnimation"));
});

test("exportNativeSkinChainSchema writes the chain schema report", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-skin-chain-schema-"));
  const sourcePath = path.join(tempDir, "1004b.c");
  const reportDir = path.join(tempDir, "reports");
  fs.writeFileSync(sourcePath, source);

  const summary = exportNativeSkinChainSchema({
    sourcePath,
    registryTsvOut: path.join(reportDir, "native_type_registry.tsv"),
    schemaTsvOut: path.join(reportDir, "native_skin_chain_schema.tsv"),
    focusTypes: ["SkinEntry"],
  });

  assert.equal(summary.schemaRows, 1);
  const tsv = fs.readFileSync(path.join(reportDir, "native_skin_chain_schema.tsv"), "utf8");
  assert.match(tsv, /SkinEntry/);
});
