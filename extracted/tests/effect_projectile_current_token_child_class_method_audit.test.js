const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildClassMethodAudit,
  exportProjectileCurrentTokenChildClassMethodAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_class_method_audit");

const disassemblyByAddress = {
  "0x1000": `
    1000: ret
  `,
  "0x2000": `
    2000: adrp x8, 0xb000
    2004: add x8, x8, #0x30
    2008: orr w9, wzr, #0x4
    200c: str x8, [x0, #0x88]
    2010: str w9, [x0, #0x90]
    2014: ret
  `,
  "0x3000": `
    3000: ldrh w9, [x0, #0xc8]
    3004: add x8, x0, #0x18
    3008: str x1, [x0, #0x40]
    300c: orr w9, w9, #0x22
    3010: strh w9, [x0, #0xc8]
    3014: mov x0, x8
    3018: ret
  `,
  "0x4000": `
    4000: mov x19, x0
    4004: mov x20, x1
    4008: ldrb w8, [x19, #0xd0]
    400c: ldrh w9, [x19, #0xc8]
    4010: ldr x0, [x20]
    4014: bl 0x5100
    4018: add x0, x19, #0x18
    401c: mov x1, x20
    4020: bl 0x5200
    4024: ret
  `,
};

function childObjectChainAudit() {
  return {
    items: [
      {
        status: "token-child-object-following-slot-callback-installer",
        targetName: "Effect_Test_Proj_A",
        objectAppendCallsiteAddressHex: "0xc020",
        objectAppendTargetHex: "0xc2a6c8",
        objectAllocatorBodyTargetHex: "0x9000",
        primaryVtableAddressHex: "0x6000",
        followingVtableSlotOffsetHex: "0x48",
        resolvedFollowingSlotFunctionHex: "0x2000",
        resolvedFollowingSlotFunctionClass: "callback-installer",
        resolvedFollowingSlotCallbackFunctionHex: "0xb030",
        resolvedFollowingSlotCallbackSlotOffsetHex: "0x88",
      },
      {
        status: "token-child-object-following-slot-payload-mode-setter",
        targetName: "Effect_Test_Proj_E",
        objectAppendCallsiteAddressHex: "0xc040",
        objectAppendTargetHex: "0xc2a6c8",
        objectAllocatorBodyTargetHex: "0x9000",
        primaryVtableAddressHex: "0x6000",
        followingVtableSlotOffsetHex: "0x60",
        resolvedFollowingSlotFunctionHex: "0x3000",
        resolvedFollowingSlotFunctionClass: "payload-mode-setter",
        resolvedFollowingSlotPayloadOffsetHex: "0x18",
        resolvedFollowingSlotArgumentStoreOffsetHex: "0x40",
      },
    ],
  };
}

test("projectile current token child class method audit inventories vtable methods without promotion", () => {
  const audit = buildProjectileCurrentTokenChildClassMethodAudit({
    childObjectChainAudit: childObjectChainAudit(),
    relativeRelocations: [
      { addressHex: "0x6000", targetHex: "0x1000" },
      { addressHex: "0x6010", targetHex: "0x4000" },
      { addressHex: "0x6048", targetHex: "0x2000" },
      { addressHex: "0x6060", targetHex: "0x3000" },
    ],
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    maxSlotOffset: 0x70,
  });

  assert.equal(audit.summary.rows, 4);
  assert.equal(audit.summary.uniquePrimaryVtables, 1);
  assert.equal(audit.summary.sourceChildObjectRows, 2);
  assert.equal(audit.summary.sourceMatchedMethodRows, 2);
  assert.equal(audit.summary.callbackInstallerMethodRows, 1);
  assert.equal(audit.summary.payloadModeSetterMethodRows, 1);
  assert.equal(audit.summary.runtimeEvaluatorCandidateRows, 1);
  assert.equal(audit.summary.callbackSlotReaderRows, 0);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const evaluator = audit.items.find((item) => item.methodFunctionHex === "0x4000");
  assert.equal(evaluator.status, "token-child-class-method-runtime-evaluator-candidate");
  assert.equal(evaluator.vtableSlotOffsetHex, "0x10");
  assert.deepEqual(evaluator.objectFieldReadOffsets, ["0xd0", "0xc8"]);
  assert.deepEqual(evaluator.payloadArgumentReadInstructions, ["4010: ldr x0, [x20]"]);
  assert.deepEqual(evaluator.helperCallTargetHexes, ["0x5100", "0x5200"]);
  assert.equal(evaluator.semanticConsumerResolved, false);
  assert.equal(evaluator.renderPromotionAllowed, false);

  const installer = audit.items.find((item) => item.methodFunctionHex === "0x2000");
  assert.equal(installer.status, "token-child-class-method-callback-installer");
  assert.deepEqual(installer.callbackInstallerWrites, ["object+0x88=0xb030"]);
  assert.deepEqual(installer.sourceFollowingSlotClasses, ["callback-installer"]);

  const setter = audit.items.find((item) => item.methodFunctionHex === "0x3000");
  assert.equal(setter.status, "token-child-class-method-payload-mode-setter");
  assert.deepEqual(setter.objectFieldWriteOffsets, ["0x40", "0xc8"]);
});

test("projectile current token child class method exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-class-method-"));
  const childObjectChainAuditPath = path.join(tempDir, "effect_projectile_current_token_child_object_chain_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-class-method-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_class_method_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_class_method_audit.tsv");

  fs.writeFileSync(childObjectChainAuditPath, JSON.stringify(childObjectChainAudit()));
  const audit = exportProjectileCurrentTokenChildClassMethodAudit({
    childObjectChainAuditPath,
    relativeRelocations: [
      { addressHex: "0x6000", targetHex: "0x1000" },
      { addressHex: "0x6010", targetHex: "0x4000" },
      { addressHex: "0x6048", targetHex: "0x2000" },
      { addressHex: "0x6060", targetHex: "0x3000" },
    ],
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    maxSlotOffset: 0x70,
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 4);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /token-child-class-method-runtime-evaluator-candidate/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /objectFieldReadOffsets/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.methodFunctionHex === "0x4000").renderPromotionAllowed, "false");
});
