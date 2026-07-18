const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildPayloadSetterAudit,
  exportProjectileCurrentTokenChildPayloadSetterAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_payload_setter_audit");

const disassemblyByAddress = {
  "0x8d4a50": `
    8d4a50: mov x19, x0
    8d4a54: bl 0x8d4a8c
    8d4a58: ldr w8, [x19, #0x10c]
    8d4a5c: str s8, [x19, #0xa8]
    8d4a60: str w8, [x19, #0x10c]
    8d4a64: ret
  `,
  "0x8d4f40": `
    8d4f40: ldr w8, [x1, #0x8]
    8d4f44: str w8, [x0, #0xe8]
    8d4f48: str s0, [x0, #0xec]
    8d4f4c: str s1, [x0, #0xf0]
    8d4f50: str s2, [x0, #0xf4]
    8d4f54: str x8, [x0, #0xe0]
    8d4f58: ret
  `,
  "0x8d4fdc": `
    8d4fdc: mov x21, x0
    8d4fe0: ldr x0, [x0, #0x50]
    8d4fe4: cbz x0, 0x8d4ff0
    8d4fe8: bl 0xe39678
    8d4fec: ldr x8, [x21, #0x50]
    8d4ff0: b 0xe39830
  `,
};

function evaluatorPayloadAudit() {
  return {
    items: [
      {
        status: "token-child-evaluator-payload-field-consumer",
        payloadConsumerFunctionHex: "0x3000",
        sourceEvaluatorFunctionHexes: ["0x1000"],
        helperCallTargetHexes: ["0x8d4a50", "0x9999"],
        renderPromotionAllowed: false,
      },
      {
        status: "token-child-evaluator-payload-callback-reader",
        payloadConsumerFunctionHex: "0x3100",
        sourceEvaluatorFunctionHexes: ["0x1000", "0x1200"],
        helperCallTargetHexes: ["0x8d4f40", "0x8d4fdc"],
        renderPromotionAllowed: false,
      },
    ],
  };
}

function commonApplySetterAudit() {
  return {
    rows: [
      {
        addressHex: "0x8d4a70",
        blockId: "rotation-curve-setter",
        role: "object-a8-low-float-store",
        objectOffsetHex: "0xa8",
        accessKind: "store",
        opcodeMatches: true,
      },
      {
        addressHex: "0x8d4a78",
        blockId: "rotation-curve-setter",
        role: "state-flags-store",
        objectOffsetHex: "0x10c",
        accessKind: "store",
        opcodeMatches: true,
      },
      {
        addressHex: "0x8d4f44",
        blockId: "vector-callback-setter",
        role: "vector-hash-store-e8",
        objectOffsetHex: "0xe8",
        accessKind: "store",
        opcodeMatches: true,
      },
      {
        addressHex: "0x8d4f54",
        blockId: "vector-callback-setter",
        role: "vector-pointer-store-e0",
        objectOffsetHex: "0xe0",
        accessKind: "store",
        opcodeMatches: true,
      },
    ],
  };
}

test("projectile current token child payload setter audit joins evaluator helper calls to setter evidence", () => {
  const audit = buildProjectileCurrentTokenChildPayloadSetterAudit({
    evaluatorPayloadAudit: evaluatorPayloadAudit(),
    commonApplySetterAudit: commonApplySetterAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 3);
  assert.equal(audit.summary.sourcePayloadConsumerRows, 2);
  assert.equal(audit.summary.setterHelperRows, 2);
  assert.equal(audit.summary.commitHelperRows, 1);
  assert.equal(audit.summary.commonApplyMatchedHelperRows, 2);
  assert.equal(audit.summary.commonApplyOpcodeRows, 4);
  assert.equal(audit.summary.objectFieldWriteRows, 7);
  assert.equal(audit.summary.uniqueObjectFieldWriteOffsets, 7);
  assert.equal(audit.summary.objectFieldReadRows, 3);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const rotation = audit.items.find((item) => item.helperFunctionHex === "0x8d4a50");
  assert.equal(rotation.helperClass, "layout-b-state-scalar-setter");
  assert.deepEqual(rotation.sourcePayloadConsumerFunctionHexes, ["0x3000"]);
  assert.deepEqual(rotation.commonApplyBlockIds, ["rotation-curve-setter"]);
  assert.deepEqual(rotation.objectFieldWriteOffsets, ["0xa8", "0x10c"]);
  assert.deepEqual(rotation.disassemblyObjectFieldWriteOffsets, ["0xa8", "0x10c"]);
  assert.equal(rotation.renderPromotionAllowed, false);

  const vector = audit.items.find((item) => item.helperFunctionHex === "0x8d4f40");
  assert.equal(vector.helperClass, "layout-b-vector-output-setter");
  assert.deepEqual(vector.commonApplyBlockIds, ["vector-callback-setter"]);
  assert.deepEqual(vector.objectFieldWriteOffsets, ["0xe8", "0xe0", "0xec", "0xf0", "0xf4"]);

  const commit = audit.items.find((item) => item.helperFunctionHex === "0x8d4fdc");
  assert.equal(commit.helperClass, "layout-b-object50-commit-helper");
  assert.deepEqual(commit.objectFieldReadOffsets, ["0x50"]);
  assert.deepEqual(commit.objectFieldWriteOffsets, []);
  assert.deepEqual(commit.commonApplyBlockIds, []);
});

test("projectile current token child payload setter exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-payload-setter-"));
  const evaluatorPayloadAuditPath = path.join(
    tempDir,
    "effect_projectile_current_token_child_evaluator_payload_audit.json",
  );
  const commonApplySetterAuditPath = path.join(tempDir, "current_native_layout_b_common_apply_setter_fields_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-payload-setter-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_payload_setter_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_payload_setter_audit.tsv");

  fs.writeFileSync(evaluatorPayloadAuditPath, JSON.stringify(evaluatorPayloadAudit()));
  fs.writeFileSync(commonApplySetterAuditPath, JSON.stringify(commonApplySetterAudit()));

  const audit = exportProjectileCurrentTokenChildPayloadSetterAudit({
    evaluatorPayloadAuditPath,
    commonApplySetterAuditPath,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 3);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /layout-b-vector-output-setter/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /commonApplyOpcodeRows/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.helperFunctionHex === "0x8d4fdc").helperClass, "layout-b-object50-commit-helper");
  assert.equal(rows.find((row) => row.helperFunctionHex === "0x8d4fdc").renderPromotionAllowed, "false");
});
