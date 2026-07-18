const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildFocusSchema,
  extractNativeSkinrepConsumersFromSource,
  exportNativeSkinrepConsumers,
  parseTsv,
} = require("../tools/native_skinrep_consumers");

const schemaRows = [
  {
    typeName: "SkinRep",
    fieldIndex: "2",
    fieldOffset: "0x40",
    typePointerSymbol: "PTR_DAT_101856c50",
    exactSpanCandidates: "Locator**@0x101856c38:0x8:kind3:-0x18:exact-span",
  },
  {
    typeName: "Attachment",
    fieldIndex: "1",
    fieldOffset: "0x78",
    typePointerSymbol: "PTR_DAT_101857c48",
    exactSpanCandidates: "Attachment**@0x101857c88:0x8:kind3:+0x40:exact-span",
  },
];

const syntheticSource = `
void FUN_abc100(void)
{
  long lVar1;
  lVar1 = FUN_0198a6a8(&DAT_03142020,1,"SkinRep",0x68,8);
  DAT_flag = 1;
  return;
}

void FUN_abc200(long param_1)
{
  long *plVar4;
  if (*(long *)(param_1 + 0x40) != 0) {
    FUN_loader("build://Progression/KindredSkinManifest.def");
  }
  plVar4 = (long *)(**(code **)(*plVar4 + 0x78))(plVar4,"Bone_Weapon");
  return;
}
`;

test("extractNativeSkinrepConsumersFromSource combines registrations, schema offsets, and runtime anchors", () => {
  const rows = extractNativeSkinrepConsumersFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    focusSchema: buildFocusSchema(schemaRows, ["SkinRep", "Attachment"]),
    focusTypes: ["SkinRep", "Attachment"],
  });

  const registration = rows.find((row) => row.evidenceKind === "type-registration");
  assert.equal(registration.focusTypes, "SkinRep");
  assert.equal(registration.symbols, "DAT_03142020");

  const fieldOffset = rows.find((row) => row.accessKind === "memory-field-offset");
  assert.equal(fieldOffset.fieldRefs, "SkinRep.field2@0x40");
  assert.match(fieldOffset.anchorKinds, /skin-manifest/);

  const boneQuery = rows.find((row) => row.accessKind === "virtual-call-offset");
  assert.equal(boneQuery.focusTypes, "virtual-dispatch");
  assert.equal(boneQuery.fieldRefs, "vtable.method@0x78");
  assert.match(boneQuery.anchorKinds, /bone-query/);
  assert.match(boneQuery.stringLiterals, /Bone_Weapon/);
});

test("exportNativeSkinrepConsumers writes focused TSV and JSON context reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-skinrep-consumers-"));
  const sourceDir = path.join(tempDir, "functions");
  const reportDir = path.join(tempDir, "reports");
  const schemaPath = path.join(reportDir, "native_skinrep_schema.tsv");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);
  fs.writeFileSync(
    schemaPath,
    [
      "typeName\tfieldIndex\tfieldOffset\ttypePointerSymbol\texactSpanCandidates",
      "SkinRep\t2\t0x40\tPTR_DAT_101856c50\tLocator**@0x101856c38:0x8:kind3:-0x18:exact-span",
      "Attachment\t1\t0x78\tPTR_DAT_101857c48\tAttachment**@0x101857c88:0x8:kind3:+0x40:exact-span",
      "",
    ].join("\n"),
  );

  const summary = exportNativeSkinrepConsumers({
    sourcePaths: [sourceDir],
    schemaPath,
    tsvOut: path.join(reportDir, "native_skinrep_consumers.tsv"),
    jsonOut: path.join(reportDir, "native_skinrep_consumer_context.json"),
    focusTypes: ["SkinRep", "Attachment"],
  });

  assert.equal(summary.files, 1);
  assert.equal(summary.byKind["native-field-schema"], 2);
  assert.equal(summary.byKind["type-registration"], 1);
  assert.equal(summary.byKind["offset-access"], 2);
  const tsvRows = parseTsv(fs.readFileSync(path.join(reportDir, "native_skinrep_consumers.tsv"), "utf8"));
  assert.equal(tsvRows.some((row) => row.fieldRefs === "SkinRep.field2@0x40"), true);
  assert.equal(tsvRows.some((row) => row.fieldRefs === "vtable.method@0x78"), true);
  const json = JSON.parse(fs.readFileSync(path.join(reportDir, "native_skinrep_consumer_context.json"), "utf8"));
  assert.equal(json.items.some((item) => /Bone_Weapon/.test(item.context)), true);
});
