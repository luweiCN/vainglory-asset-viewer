const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractNativeBoneQueryXrefsFromSource,
  exportNativeBoneQueryXrefs,
} = require("../tools/native_bone_query_xrefs");

const syntheticSource = `
void FUN_100456000(undefined8 param_1)
{
  long *plVar2;

  plVar2 = (long *)FUN_100441e68(param_1);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x78))(plVar2,"Bone_LeftBlade_1");
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,"Effect_Ishtar_C_WingsLeft");
  (**(code **)(*plVar2 + 0xb0))(plVar2,1);
  return;
}

void FUN_100456100(undefined8 param_1)
{
  long *plVar5;

  plVar5 = (long *)thunk_FUN_10000e358();
  plVar5 = (long *)(**(code **)(*plVar5 + 0x68))(plVar5,"Bone_RightHand");
  plVar5 = (long *)(**(code **)(*plVar5 + 0x48))(plVar5,"Effect_Varya_C_Cast");
  return;
}
`;

test("extractNativeBoneQueryXrefsFromSource reads virtual Bone_* lookups and nearby effects", () => {
  const rows = extractNativeBoneQueryXrefsFromSource({
    sourceFile: "functions/10042.c",
    sourceText: syntheticSource,
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => [row.functionName, row.accessorOffset, row.boneName, row.nearbyEffects]),
    [
      ["FUN_100456000", "0x78", "Bone_LeftBlade_1", "Effect_Ishtar_C_WingsLeft"],
      ["FUN_100456100", "0x68", "Bone_RightHand", "Effect_Varya_C_Cast"],
    ],
  );
  assert.match(rows[0].context, /Bone_LeftBlade_1/);
});

test("exportNativeBoneQueryXrefs writes TSV and JSON reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-bone-query-xrefs-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "10042.c"), syntheticSource);

  const summary = exportNativeBoneQueryXrefs({
    sourcePaths: [sourceDir],
    tsvOut: path.join(reportDir, "native_bone_query_xrefs.tsv"),
    jsonOut: path.join(reportDir, "native_bone_query_context.json"),
  });

  assert.deepEqual(summary, { files: 1, rows: 2, uniqueBones: 2 });
  assert.match(fs.readFileSync(path.join(reportDir, "native_bone_query_xrefs.tsv"), "utf8"), /Bone_LeftBlade_1/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(reportDir, "native_bone_query_context.json"), "utf8")).items[1].boneName, "Bone_RightHand");
});
