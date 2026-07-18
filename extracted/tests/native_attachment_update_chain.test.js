const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentUpdateChain,
  extractNativeAttachmentUpdateChainFromSource,
} = require("../tools/native_attachment_update_chain");

const syntheticSource = `
void FUN_10002c7c4(long param_1)
{
  long lVar1;
  lVar1 = param_1;
  *(code **)(lVar1 + 0xb0) = FUN_10002ce2c;
  *(code **)(lVar1 + 0xb8) = FUN_10002ce84;
  *(undefined4 *)(lVar1 + 0xa8) = 0x70;
  FUN_1010a0944(param_1,5,thunk_FUN_10002c884,0);
}

void thunk_FUN_10002c884(long param_1)
{
  long *plVar2;
  int iVar1;

  if (*(long *)(param_1 + 0x38) == 0) return;
  plVar2 = *(long **)(param_1 + 0x40);
  iVar1 = *(int *)(param_1 + 0x68);
  if (iVar1 == 3) {
    (**(code **)(*plVar2 + 0x20))(plVar2, 0, *(undefined4 *)(param_1 + 0x60), 1);
  } else if (iVar1 == 2) {
    (**(code **)(*plVar2 + 0x28))(plVar2, *(undefined4 *)(param_1 + 0x60), 0);
  } else {
    (**(code **)(*plVar2 + 0x18))(plVar2, 0);
  }
  (**(code **)(**(long **)(param_1 + 0x38) + 0x20))(*(long **)(param_1 + 0x38), 0);
  if (*(char *)(param_1 + 0x6c) != 0) FUN_10002cc64(0, param_1);
  *(float *)(param_1 + 0x5c) = *(float *)(param_1 + 0x48) + *(float *)(param_1 + 0x54);
  (**(code **)(**(long **)(param_1 + 0x38) + 0x30))();
}
`;

const stageSpecs = [
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "register-attachment-update-component",
    functionName: "FUN_10002c7c4",
    expectedCalls: ["FUN_1010a0944", "thunk_FUN_10002c884"],
    evidencePatterns: [
      ["component-size-0x70", /0x70/],
      ["update-hook-5", /FUN_1010a0944\(param_1,5,thunk_FUN_10002c884,0\)/],
      ["constructor-function", /FUN_10002ce2c/],
      ["destructor-function", /FUN_10002ce84/],
    ],
  },
  {
    platform: "ios",
    chain: "attachment-frame-update",
    stage: "frame-update-thunk",
    functionName: "thunk_FUN_10002c884",
    expectedCalls: ["FUN_10002cc64"],
    evidencePatterns: [
      ["target-node-field-0x38", /param_1\s*\+\s*0x38/],
      ["source-provider-field-0x40", /param_1\s*\+\s*0x40/],
      ["attach-mode-field-0x68", /param_1\s*\+\s*0x68/],
      ["attach-hash-field-0x60", /param_1\s*\+\s*0x60/],
      ["mode-1-default-transform-vcall-0x18", /\+\s*0x18/],
      ["mode-2-hash-transform-vcall-0x28", /\+\s*0x28/],
      ["mode-3-hash-transform-vcall-0x20", /\+\s*0x20/],
      ["target-transform-write-vcall-0x20", /param_1\s*\+\s*0x38[\s\S]*\+\s*0x20/],
      ["target-finalize-vcall-0x30", /\+\s*0x30/],
      ["optional-rotation-flag-0x6c", /param_1\s*\+\s*0x6c/],
      ["local-motion-fields-0x48-to-0x5c", /param_1\s*\+\s*0x5c[\s\S]*param_1\s*\+\s*0x48/],
    ],
  },
];

test("attachment update extractor records registration and frame update evidence", () => {
  const rows = extractNativeAttachmentUpdateChainFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    stageSpecs,
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].complete, "yes");
  assert.match(rows[0].evidenceTags, /component-size-0x70/);
  assert.equal(rows[1].complete, "yes");
  assert.match(rows[1].evidenceTags, /attach-mode-field-0x68/);
});

test("attachment update exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-update-chain-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);

  const summary = exportNativeAttachmentUpdateChain({
    sourcePaths: [sourceDir],
    stageSpecs,
    tsvOut: path.join(reportDir, "native_attachment_update_chain.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_update_chain_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.completeRows, 2);
  assert.match(fs.readFileSync(path.join(reportDir, "native_attachment_update_chain.tsv"), "utf8"), /frame-update-thunk/);
});
