const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentManifestCallers,
  extractNativeAttachmentManifestCallersFromSource,
  fieldOffsetsForVarLifetime,
  lifetimeTextForAssignedVar,
} = require("../tools/native_attachment_manifest_callers");

const syntheticSource = `
void FUN_00ccecc4(uint *param_1)
{
  return;
}

undefined8 FUN_009adcc4(long param_1,int *param_2)
{
  long lVar2;
  long lVar4;

  lVar2 = FUN_00ccecc4(param_2);
  if (lVar2 != 0) {
    lVar2 = loadResource(*(undefined8 *)(lVar2 + 8));
    lVar4 = *(long *)(lVar2 + 0x40);
    use(lVar4);
  }
  return 1;
}

void FUN_00aa6484(long param_1)
{
  long lVar4;
  long *plVar6;
  byte local_60 [16];

  lVar4 = FUN_00ccf8d0(local_60);
  if (lVar4 != 0) {
    plVar6 = *(long **)(lVar4 + 0x28);
    consume(plVar6);
  }
}

void FUN_0091db00(void)
{
  undefined8 *puVar13;
  void *puVar28;

  puVar13 = (undefined8 *)FUN_00ccecc4();
  if (puVar13 == (undefined8 *)0x0) {
    puVar28 = "";
  }
  else {
    puVar28 = (void *)*puVar13;
  }
  emit("HatEquipped", puVar28);
}
`;

test("manifest caller scanner stops field offsets when the assigned var is overwritten", () => {
  const callIndex = syntheticSource.indexOf("FUN_00ccecc4(param_2)");

  assert.match(lifetimeTextForAssignedVar(syntheticSource, "lVar2", callIndex), /lVar2 \+ 8/);
  assert.doesNotMatch(lifetimeTextForAssignedVar(syntheticSource, "lVar2", callIndex), /lVar2 \+ 0x40/);
  assert.deepEqual(fieldOffsetsForVarLifetime(syntheticSource, "lVar2", callIndex), ["0x8"]);
});

test("manifest caller scanner classifies runtime attachable and hat catalog consumers", () => {
  const rows = extractNativeAttachmentManifestCallersFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    getterSpecs: [
      {
        platform: "android",
        functionName: "FUN_00ccecc4",
        manifest: "KindredAttachableEquipmentManifest",
        lookupKind: "attachable-entry-by-hash",
      },
      {
        platform: "android",
        functionName: "FUN_00ccf8d0",
        manifest: "KindredHatManifest",
        lookupKind: "hat-entry-by-name",
      },
    ],
  });

  assert.equal(rows.length, 3);

  const runtimeAttachable = rows.find((row) => row.callerFunction === "FUN_009adcc4");
  assert.equal(runtimeAttachable.assignedVar, "lVar2");
  assert.equal(runtimeAttachable.consumedOffsets, "0x8");
  assert.equal(runtimeAttachable.consumerRole, "runtime-attachable-resource-lookup");

  const hatCatalog = rows.find((row) => row.callerFunction === "FUN_00aa6484");
  assert.equal(hatCatalog.consumedOffsets, "0x28");
  assert.equal(hatCatalog.consumerRole, "hat-catalog-resource-list");

  const loadoutState = rows.find((row) => row.callerFunction === "FUN_0091db00");
  assert.equal(loadoutState.consumedOffsets, "0x0");
  assert.equal(loadoutState.consumerRole, "player-loadout-state");
  assert.equal(loadoutState.stringLiterals, "HatEquipped");
});

test("exportNativeAttachmentManifestCallers writes TSV and JSON reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-manifest-callers-"));
  const sourceDir = path.join(tempDir, "GameKindred_android_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeAttachmentManifestCallers({
    sourcePaths: [sourceDir],
    getterSpecs: [
      {
        platform: "android",
        functionName: "FUN_00ccecc4",
        manifest: "KindredAttachableEquipmentManifest",
        lookupKind: "attachable-entry-by-hash",
      },
      {
        platform: "android",
        functionName: "FUN_00ccf8d0",
        manifest: "KindredHatManifest",
        lookupKind: "hat-entry-by-name",
      },
    ],
    tsvOut: path.join(reportDir, "native_attachment_manifest_callers.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_manifest_caller_context.json"),
  });

  assert.equal(summary.rows, 3);
  assert.equal(summary.byConsumerRole["runtime-attachable-resource-lookup"], 1);
  assert.equal(summary.consumedOffsetCounts.KindredAttachableEquipmentManifest["0x8"], 1);
  assert.match(fs.readFileSync(path.join(reportDir, "native_attachment_manifest_callers.tsv"), "utf8"), /FUN_00ccf8d0/);

  const json = JSON.parse(fs.readFileSync(path.join(reportDir, "native_attachment_manifest_caller_context.json"), "utf8"));
  assert.equal(json.items.find((row) => row.callerFunction === "FUN_009adcc4").consumedOffsets, "0x8");
});
