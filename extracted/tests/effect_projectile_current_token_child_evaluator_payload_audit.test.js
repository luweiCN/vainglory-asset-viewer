const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildEvaluatorPayloadAudit,
  exportProjectileCurrentTokenChildEvaluatorPayloadAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_evaluator_payload_audit");

const disassemblyByAddress = {
  "0x3000": `
    3000: mov x20, x0
    3004: ldr x8, [x20, #0x60]
    3008: cbz x8, 0x3014
    300c: add x1, x20, #0xa8
    3010: blr x8
    3014: bl 0x3100
    3018: add x0, x20, #0x70
    301c: bl 0x3200
    3020: ret
  `,
  "0x3100": `
    3100: mov x19, x0
    3104: ldr x8, [x19, #0x70]
    3108: cbz x8, 0x3110
    310c: blr x8
    3110: str xzr, [x19, #0x8]
    3114: ret
  `,
  "0x3200": `
    3200: ldr x8, [x0]
    3204: blr x8
    3208: ret
  `,
  "0x4000": `
    4000: mov x19, x0
    4004: ldr x8, [x19, #0x68]
    4008: cbz x8, 0x4010
    400c: blr x8
    4010: ret
  `,
  "0x5000": `
    5000: ret
  `,
};

function classMethodAudit() {
  return {
    items: [
      {
        status: "token-child-class-method-runtime-evaluator-candidate",
        primaryVtableAddressHex: "0x6000",
        vtableSlotOffsetHex: "0x10",
        methodFunctionHex: "0x1000",
        methodClass: "runtime-evaluator-candidate",
        methodInstructions: [
          "1000: mov x19, x0",
          "1004: add x0, x19, #0x18",
          "1008: bl 0x3000",
          "100c: ret",
        ],
        renderPromotionAllowed: false,
      },
      {
        status: "token-child-class-method-runtime-evaluator-candidate",
        primaryVtableAddressHex: "0x6000",
        vtableSlotOffsetHex: "0x28",
        methodFunctionHex: "0x1200",
        methodClass: "runtime-evaluator-candidate",
        methodInstructions: [
          "1200: mov x19, x0",
          "1204: add x21, x19, #0x18",
          "1208: mov x0, x21",
          "120c: bl 0x4000",
          "1210: mov x0, x21",
          "1214: bl 0x5000",
          "1218: ret",
        ],
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile current token child evaluator payload audit traces payload callback slots without promotion", () => {
  const audit = buildProjectileCurrentTokenChildEvaluatorPayloadAudit({
    classMethodAudit: classMethodAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    localPayloadHelperRanges: [[0x3000, 0x5000]],
  });

  assert.equal(audit.summary.rows, 5);
  assert.equal(audit.summary.sourceEvaluatorRows, 2);
  assert.equal(audit.summary.entryPayloadConsumerRows, 3);
  assert.equal(audit.summary.nestedPayloadConsumerRows, 2);
  assert.equal(audit.summary.callbackSlotReaderRows, 4);
  assert.equal(audit.summary.parentInstalledCallbackSlotReaderRows, 3);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const entry = audit.items.find((item) => item.payloadConsumerFunctionHex === "0x3000");
  assert.equal(entry.status, "token-child-evaluator-payload-callback-reader");
  assert.equal(entry.consumerDepth, 0);
  assert.deepEqual(entry.sourceEvaluatorFunctionHexes, ["0x1000"]);
  assert.deepEqual(entry.payloadCallbackReadOffsets, ["0x60"]);
  assert.deepEqual(entry.parentTranslatedCallbackReadOffsets, ["0x78"]);
  assert.deepEqual(entry.parentInstalledCallbackReadOffsets, ["0x78"]);
  assert.deepEqual(entry.nestedPayloadConsumerTargets, ["0x3100", "0x3200"]);
  assert.equal(entry.renderPromotionAllowed, false);

  const nested = audit.items.find((item) => item.payloadConsumerFunctionHex === "0x3100");
  assert.equal(nested.consumerDepth, 1);
  assert.deepEqual(nested.payloadCallbackReadOffsets, ["0x70"]);
  assert.deepEqual(nested.parentTranslatedCallbackReadOffsets, ["0x88"]);
  assert.deepEqual(nested.parentInstalledCallbackReadOffsets, ["0x88"]);

  const subpayload = audit.items.find((item) => item.payloadConsumerFunctionHex === "0x3200");
  assert.equal(subpayload.payloadBaseOffsetHex, "0x70");
  assert.deepEqual(subpayload.payloadCallbackReadOffsets, ["0x70"]);
  assert.deepEqual(subpayload.parentTranslatedCallbackReadOffsets, ["0x88"]);
  assert.deepEqual(subpayload.parentInstalledCallbackReadOffsets, ["0x88"]);

  const sibling = audit.items.find((item) => item.payloadConsumerFunctionHex === "0x4000");
  assert.deepEqual(sibling.parentTranslatedCallbackReadOffsets, ["0x80"]);
  assert.deepEqual(sibling.parentInstalledCallbackReadOffsets, []);
});

test("projectile current token child evaluator payload exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-evaluator-payload-"));
  const classMethodAuditPath = path.join(tempDir, "effect_projectile_current_token_child_class_method_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-evaluator-payload-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_evaluator_payload_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_evaluator_payload_audit.tsv");

  fs.writeFileSync(classMethodAuditPath, JSON.stringify(classMethodAudit()));
  const audit = exportProjectileCurrentTokenChildEvaluatorPayloadAudit({
    classMethodAuditPath,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    localPayloadHelperRanges: [[0x3000, 0x5000]],
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 5);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /token-child-evaluator-payload-callback-reader/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /parentTranslatedCallbackReadOffsets/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 5);
  assert.equal(rows.find((row) => row.payloadConsumerFunctionHex === "0x3000").renderPromotionAllowed, "false");
});
