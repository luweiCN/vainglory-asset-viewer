const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildCallbackBodyAudit,
  exportProjectileCurrentTokenChildCallbackBodyAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_callback_body_audit");

const scalarCallbackDisassembly = `
  b030: stp x29, x30, [sp, #-0x10]!
  b034: mov x29, sp
  b038: ldr x0, [x0]
  b03c: bl 0x4100
  b040: bl 0x4200
  b044: ldr s0, [x0, #0x8]
  b048: ldr s1, [x0]
  b04c: fabs s3, s0
  b050: fcmp s3, s1
  b054: b.pl 0xb064
  b058: fmov s0, wzr
  b05c: ldp x29, x30, [sp], #0x10
  b060: ret
  b064: ldp x29, x30, [sp], #0x10
  b068: b 0x7000
`;

const outputWriterCallbackDisassembly = `
  c030: str d8, [sp, #-0x30]!
  c034: stp x20, x19, [sp, #0x10]
  c038: stp x29, x30, [sp, #0x20]
  c03c: add x29, sp, #0x20
  c040: mov x19, x0
  c044: ldr x0, [x0]
  c048: mov x20, x1
  c04c: bl 0x5100
  c050: ldr x0, [x19]
  c054: mov v8.16b, v0.16b
  c058: bl 0x5200
  c05c: fdiv s0, s8, s0
  c060: fmov s1, #1.00000000
  c064: fsub s0, s1, s0
  c068: str s0, [x20]
  c06c: ldp x29, x30, [sp, #0x20]
  c070: ldp x20, x19, [sp, #0x10]
  c074: ldr d8, [sp], #0x30
  c078: ret
`;

function childObjectChainAudit() {
  return {
    items: [
      {
        status: "token-child-object-following-slot-callback-installer",
        targetName: "Effect_Test_Proj_A",
        objectAppendCallsiteAddressHex: "0x1000",
        resolvedFollowingSlotFunctionHex: "0x9000",
        resolvedFollowingSlotCallbackFunctionHex: "0xb030",
        resolvedFollowingSlotCallbackSlotOffsetHex: "0x88",
      },
      {
        status: "token-child-object-following-slot-callback-installer",
        targetName: "Effect_Test_Proj_E",
        objectAppendCallsiteAddressHex: "0x1010",
        resolvedFollowingSlotFunctionHex: "0x9000",
        resolvedFollowingSlotCallbackFunctionHex: "0xb030",
        resolvedFollowingSlotCallbackSlotOffsetHex: "0x88",
      },
      {
        status: "token-child-object-following-slot-callback-installer",
        targetName: "Effect_Test_Proj_A",
        objectAppendCallsiteAddressHex: "0x1000",
        resolvedFollowingSlotFunctionHex: "0x9010",
        resolvedFollowingSlotCallbackFunctionHex: "0xc030",
        resolvedFollowingSlotCallbackSlotOffsetHex: "0x78",
      },
    ],
  };
}

test("projectile current token child callback body audit classifies installed callback bodies without promotion", () => {
  const audit = buildProjectileCurrentTokenChildCallbackBodyAudit({
    childObjectChainAudit: childObjectChainAudit(),
    disassembleFunction: (addressHex) =>
      ({
        "0xb030": scalarCallbackDisassembly,
        "0xc030": outputWriterCallbackDisassembly,
      })[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 2);
  assert.equal(audit.summary.sourceCallbackInstallerRows, 3);
  assert.equal(audit.summary.uniqueCallbackBodies, 2);
  assert.equal(audit.summary.scalarReturnCallbackRows, 1);
  assert.equal(audit.summary.argumentOutputWriterRows, 1);
  assert.equal(audit.summary.ownerPointerReadRows, 2);
  assert.equal(audit.summary.helperCallRows, 4);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const [scalarRow, outputRow] = audit.items;
  assert.equal(scalarRow.status, "callback-body-scalar-return-consumer-unresolved");
  assert.equal(scalarRow.installedCallbackFunctionHex, "0xb030");
  assert.equal(scalarRow.installedCallbackSlotOffsetHex, "0x88");
  assert.deepEqual(scalarRow.sourceTargetNames, ["Effect_Test_Proj_A", "Effect_Test_Proj_E"]);
  assert.deepEqual(scalarRow.helperCallTargetHexes, ["0x4100", "0x4200"]);
  assert.deepEqual(scalarRow.helperResultFloatReadOffsets, ["0x8", "0x0"]);
  assert.equal(scalarRow.tailCallTargetHex, "0x7000");
  assert.equal(scalarRow.renderPromotionAllowed, false);

  assert.equal(outputRow.status, "callback-body-argument-output-writer-consumer-unresolved");
  assert.equal(outputRow.installedCallbackFunctionHex, "0xc030");
  assert.equal(outputRow.installedCallbackSlotOffsetHex, "0x78");
  assert.deepEqual(outputRow.helperCallTargetHexes, ["0x5100", "0x5200"]);
  assert.deepEqual(outputRow.argumentOutputWrites, ["x1+0x0=s0"]);
  assert.equal(outputRow.outputComputation, "inverse-normalized-helper-ratio");
  assert.equal(outputRow.renderPromotionAllowed, false);
});

test("projectile current token child callback body exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-callback-body-"));
  const childObjectChainAuditPath = path.join(tempDir, "effect_projectile_current_token_child_object_chain_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-callback-body-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_callback_body_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_callback_body_audit.tsv");

  fs.writeFileSync(childObjectChainAuditPath, JSON.stringify(childObjectChainAudit()));
  const audit = exportProjectileCurrentTokenChildCallbackBodyAudit({
    childObjectChainAuditPath,
    disassembleFunction: (addressHex) =>
      ({
        "0xb030": scalarCallbackDisassembly,
        "0xc030": outputWriterCallbackDisassembly,
      })[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 2);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /callback-body-scalar-return-consumer-unresolved/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /inverse-normalized-helper-ratio/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].installedCallbackFunctionHex, "0xb030");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
