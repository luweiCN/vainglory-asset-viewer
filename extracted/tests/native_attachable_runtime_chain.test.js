const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachableRuntimeChain,
  extractNativeAttachableRuntimeChainFromSource,
} = require("../tools/native_attachable_runtime_chain");

const syntheticSource = `
undefined8 FUN_100025344(long param_1, int *param_2)
{
  long lVar2;
  long lVar7;

  lVar2 = FUN_100331a84(param_2);
  lVar2 = FUN_10034c450(0, *(undefined8 *)(lVar2 + 8));
  lVar2 = FUN_1000254d4(param_1, lVar2);
  FUN_10002c480(0, *(undefined8 *)(lVar2 + 0x40));
  FUN_10002c4e0(0, *(undefined8 *)(lVar2 + 0x48), lVar2 + 0x50);
  FUN_10002c524(0, param_1 + 0x2fc);
  lVar7 = DAT_10184dd88;
  FUN_10002cc10(lVar7, 0, 0, 1, 0);
  return 1;
}

void FUN_10002cc10(long param_1, undefined8 param_2, undefined8 param_3, uint param_4, undefined4 param_5)
{
  *(undefined8 *)(param_1 + 0x38) = param_2;
  *(undefined8 *)(param_1 + 0x40) = param_3;
  *(uint *)(param_1 + 0x68) = param_4;
  if ((param_4 & 0xfffffffe) == 2) {
    *(undefined4 *)(param_1 + 0x60) = param_5;
  }
}
`;

const stageSpecs = [
  {
    platform: "ios",
    chain: "immediate-equip",
    stage: "manifest-entry-to-attachment-info",
    functionName: "FUN_100025344",
    expectedCalls: [
      "FUN_100331a84",
      "FUN_10034c450",
      "FUN_1000254d4",
      "FUN_10002c480",
      "FUN_10002c4e0",
      "FUN_10002c524",
      "FUN_10002cc10",
    ],
    evidencePatterns: [
      ["manifest-entry-resource-field-0x8", /lVar2\s*\+\s*8/],
      ["skin-info-mesh-field-0x40", /lVar2\s*\+\s*0x40/],
      ["skin-info-animation-fields-0x48-0x50", /lVar2\s*\+\s*0x48[\s\S]*lVar2\s*\+\s*0x50/],
      ["attachment-component-lookup", /DAT_10184dd88/],
    ],
  },
  {
    platform: "ios",
    chain: "shared-attachment-state",
    stage: "write-attachment-target-state",
    functionName: "FUN_10002cc10",
    expectedCalls: [],
    evidencePatterns: [
      ["target-transform-field-0x38", /param_1\s*\+\s*0x38/],
      ["owner-transform-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-mode-field-0x68", /param_1\s*\+\s*0x68/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
    ],
  },
];

test("runtime chain extractor reports complete rows when calls and evidence match", () => {
  const rows = extractNativeAttachableRuntimeChainFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    stageSpecs,
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].complete, "yes");
  assert.equal(rows[0].missingCalls, "");
  assert.match(rows[0].evidenceTags, /manifest-entry-resource-field-0x8/);
  assert.equal(rows[1].complete, "yes");
  assert.match(rows[1].evidenceTags, /attach-hash-field-0x60/);
});

test("runtime chain exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachable-runtime-chain-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeAttachableRuntimeChain({
    sourcePaths: [sourceDir],
    stageSpecs,
    tsvOut: path.join(reportDir, "native_attachable_runtime_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachable_runtime_chain_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.completeRows, 2);
  assert.equal(summary.incompleteRows, 0);
  assert.match(fs.readFileSync(path.join(reportDir, "native_attachable_runtime_chain.tsv"), "utf8"), /FUN_100025344/);
});
