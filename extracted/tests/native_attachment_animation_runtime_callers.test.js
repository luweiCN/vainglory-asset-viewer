const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDatNameMap,
  exportNativeAttachmentAnimationRuntimeCallers,
  extractNativeAttachmentAnimationRuntimeCallersFromSources,
} = require("../tools/native_attachment_animation_runtime_callers");

const iosSource = `
void FUN_10034cb1c(void *param_1,char *param_2) {}

void FUN_100000100(void)
{
  FUN_10034cb1c(&DAT_101dc2564,"Idle");
  FUN_10034cb1c(&DAT_101dc256c,"IdleBrush");
  FUN_10034cb1c(&DAT_101dc2584,"MoveIntoBrush");
}

void FUN_100025838(long param_1)
{
  if ((*(uint *)(param_1 + 0x303) & 1) != 0) {
    FUN_100029eb4(param_1,&DAT_101dc256c,&DAT_101dc2584,"MoveToFromBrush");
    FUN_10002a364(param_1,&DAT_101dc2564,
                  &DAT_101dc256c);
  }
}

void FUN_10002d1c4(long param_1,long param_2)
{
  FUN_10002a8e4(param_1,param_2,0,1);
}
`;

const androidSource = `
void thunk_FUN_00d9ff34(void *param_1,char *param_2) {}

void FUN_00900000(void)
{
  thunk_FUN_00d9ff34(&DAT_0312e8b8,"Idle");
  thunk_FUN_00d9ff34(&DAT_0312e8bc,"IdleCombat");
}

void FUN_009a9d6c(long param_1)
{
  FUN_009b2b10(param_1,&DAT_0312e8b8,
               "AttackToIdle");
  FUN_009b3164(param_1,&DAT_0312e8bc);
}
`;

function sourceFile(filePath, text) {
  return { filePath, text };
}

test("runtime caller scanner resolves iOS and Android DAT animation names", () => {
  const sourceFiles = [
    sourceFile("external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c", iosSource),
    sourceFile(
      "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
      androidSource,
    ),
  ];
  const datNames = buildDatNameMap(sourceFiles);

  assert.equal(datNames.get("DAT_101dc2564"), "Idle");
  assert.equal(datNames.get("DAT_0312e8bc"), "IdleCombat");

  const rows = extractNativeAttachmentAnimationRuntimeCallersFromSources({ sourceFiles, datNames });
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => row.operation).sort(),
    [
      "play-transition-track",
      "register-alias-switch",
      "register-extra-transform-slot",
      "register-transition-fallback",
      "unregister-alias-switch",
    ],
  );

  const alias = rows.find((row) => row.operation === "register-alias-switch");
  assert.equal(alias.dataNames, "Idle|IdleBrush");
  assert.equal(alias.conditionHints, "actor-flags-0x303");

  const transition = rows.find((row) => row.operation === "register-transition-fallback");
  assert.equal(transition.dataNames, "Idle");
  assert.equal(transition.stringArgs, "AttackToIdle");
});

test("runtime caller exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-animation-runtime-callers-"));
  const iosDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const androidDir = path.join(tempDir, "GameKindred_android_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(iosDir, { recursive: true });
  fs.mkdirSync(androidDir, { recursive: true });
  fs.writeFileSync(path.join(iosDir, "test.c"), iosSource);
  fs.writeFileSync(path.join(androidDir, "test.c"), androidSource);

  const summary = exportNativeAttachmentAnimationRuntimeCallers({
    sourcePaths: [iosDir, androidDir],
    tsvOut: path.join(reportDir, "native_attachment_animation_runtime_callers.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_animation_runtime_callers_summary.json"),
  });

  assert.equal(summary.rows, 5);
  assert.equal(summary.byOperation["register-alias-switch"], 1);
  assert.deepEqual(summary.unresolvedDataRefs, []);
  assert.match(
    fs.readFileSync(path.join(reportDir, "native_attachment_animation_runtime_callers.tsv"), "utf8"),
    /MoveToFromBrush/,
  );

  const json = JSON.parse(
    fs.readFileSync(path.join(reportDir, "native_attachment_animation_runtime_callers_summary.json"), "utf8"),
  );
  assert.equal(json.items.find((row) => row.operation === "unregister-alias-switch").dataNames, "IdleCombat");
});
