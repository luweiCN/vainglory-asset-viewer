const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractNativeBindXrefsFromSource,
  exportNativeBindXrefs,
  findFunctionBlocks,
} = require("../tools/native_bind_xrefs");

const syntheticSource = `
undefined *PTR_thunk_FUN_009df4b8_027c29c0;
undefined FUN_009df500;

void FUN_009c0e40(undefined8 *param_1)
{
  FUN_009df040();
  *param_1 = &PTR_thunk_FUN_009df4b8_027c29c0;
  FUN_009df57c(param_1,"sword_bnd");
  return;
}

void FUN_009c0ea4(long param_1)
{
  FUN_01986780(param_1,3,FUN_009df500,0);
  return;
}
`;

test("findFunctionBlocks handles decompiler array-return signatures", () => {
  const blocks = findFunctionBlocks(`
undefined1  [16] FUN_00e4f8a8(undefined8 param_1)

{
  FUN_00d59f54(param_1,2,7,0x19,0);
  return;
}
`.split(/\r?\n/));

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].functionName, "FUN_00e4f8a8");
});

test("extractNativeBindXrefsFromSource reads bind constructor evidence from decompiled C", () => {
  const rows = extractNativeBindXrefsFromSource({
    sourceFile: "functions/009c0.c",
    sourceText: syntheticSource,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].functionName, "FUN_009c0e40");
  assert.equal(rows[0].bindToken, "sword_bnd");
  assert.equal(rows[0].setterFunction, "FUN_009df57c");
  assert.equal(rows[0].initializerFunction, "FUN_009df040");
  assert.equal(rows[0].vtableSymbol, "PTR_thunk_FUN_009df4b8_027c29c0");
  assert.equal(rows[0].registrationFunction, "FUN_01986780");
  assert.match(rows[0].context, /FUN_009df57c\(param_1,"sword_bnd"\)/);
});

test("exportNativeBindXrefs writes TSV and JSON context reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-bind-xrefs-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "009c0.c"), syntheticSource);

  const summary = exportNativeBindXrefs({
    sourcePaths: [sourceDir],
    tsvOut: path.join(reportDir, "native_bind_xrefs.tsv"),
    jsonOut: path.join(reportDir, "native_bind_function_context.json"),
  });

  assert.deepEqual(summary, { files: 1, rows: 1 });
  assert.match(fs.readFileSync(path.join(reportDir, "native_bind_xrefs.tsv"), "utf8"), /sword_bnd/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(reportDir, "native_bind_function_context.json"), "utf8")).items[0].bindToken, "sword_bnd");
});
