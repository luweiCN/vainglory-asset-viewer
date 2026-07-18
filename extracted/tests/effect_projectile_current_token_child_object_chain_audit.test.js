const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildObjectChainAudit,
  exportProjectileCurrentTokenChildObjectChainAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_object_chain_audit");

const syntheticTokenDisassembly = `
  1000: mov x19, x0
  1004: bl 0x4000
  1008: mov x0, x19
  100c: bl 0x2000
  1010: add x20, x0, #0x10
  1014: mov x0, x20
  1018: bl 0x3000
  101c: adrp x1, 0x9000
  1020: add x1, x1, #0x120
  1024: ldr x8, [x0]
  1028: ldr x8, [x8, #0x68]
  102c: blr x8
  1030: ldr x8, [x0]
  1034: ldr x8, [x8, #0x70]
  1038: blr x8
  103c: adrp x1, 0xa000
  1040: add x1, x1, #0x10
  1044: ldr x8, [x0]
  1048: ldr x8, [x8, #0x78]
  104c: blr x8
  1050: mov x0, x20
  1054: bl 0x3100
  1058: ldr x8, [x0]
  105c: ldr x8, [x8, #0x48]
  1060: blr x8
  1064: ret
`;

const disassemblyByAddress = {
  "0x1000": syntheticTokenDisassembly,
  "0x3000": `
    3000: mov x19, x0
    3004: bl 0x5000
    3008: mov x8, x0
    300c: str xzr, [x8, #0x8]!
    3010: ldr x9, [x19]
    3014: str x8, [x19, #0x8]
    3018: str w8, [x19, #0x10]
    301c: ret
  `,
  "0x3100": `
    3100: mov x19, x0
    3104: bl 0x5100
    3108: mov x8, x0
    310c: str xzr, [x8, #0x8]!
    3110: ldr x9, [x19]
    3114: str x8, [x19, #0x8]
    3118: str w8, [x19, #0x10]
    311c: ret
  `,
  "0x5000": `
    5000: bl 0x5200
    5004: ret
  `,
  "0x5200": `
    5200: bl 0x5300
    5204: ret
  `,
  "0x5300": `
    5300: adrp x11, 0x6000
    5304: add x11, x11, #0x100
    5308: stp x11, xzr, [x0]
    530c: ret
  `,
  "0x5100": `
    5100: adrp x11, 0x8000
    5104: add x11, x11, #0x200
    5108: stp x11, xzr, [x20]
    510c: ret
  `,
  "0x7068": `
    7068: add x0, x0, #0x18
    706c: b 0x9000
  `,
  "0x9000": `
    9000: ldrb w8, [x0, #0x39]
    9004: str x1, [x0, #0x8]
    9008: and w8, w8, #0xf8
    900c: orr w8, w8, #0x1
    9010: strb w8, [x0, #0x39]
    9014: ret
  `,
  "0x7070": `
    7070: adrp x8, 0xb000
    7074: add x8, x8, #0x30
    7078: orr w9, wzr, #0x4
    707c: orr w10, wzr, #0x1
    7080: str x8, [x0, #0x88]
    7084: str w9, [x0, #0x90]
    7088: strb w10, [x0, #0xca]
    708c: ret
  `,
  "0x7100": `
    7100: ldrh w9, [x0, #0xc8]
    7104: mov w10, #0xff98
    7108: add x8, x0, #0x18
    710c: str x1, [x0, #0x40]
    7110: and w9, w9, w10
    7114: mov w10, #0x22
    7118: orr w9, w9, w10
    711c: strh w9, [x0, #0xc8]
    7120: mov x0, x8
    7124: ret
  `,
  "0x8148": `
    8148: ret
  `,
};

function callsiteContextAudit() {
  return {
    items: [
      {
        status: "current-field-reader-callsite-specific",
        targetName: "Effect_Test_Proj",
        tokenFunctionStartHex: "0x1000",
        tokenFunctionEndHex: "0x103c",
        branchTargetHex: "0x4000",
        callsiteAddressHex: "0x1004",
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile current token child object chain audit resolves append allocators and following slots without promotion", () => {
  const audit = buildProjectileCurrentTokenChildObjectChainAudit({
    currentFieldReaderCallsiteContextAudit: callsiteContextAudit(),
    disassembleWindow: () => syntheticTokenDisassembly,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    relativeRelocations: [
      { addressHex: "0x6168", targetHex: "0x7068" },
      { addressHex: "0x6170", targetHex: "0x7070" },
      { addressHex: "0x6178", targetHex: "0x7100" },
      { addressHex: "0x8248", targetHex: "0x8148" },
    ],
    readCString: (addressHex) =>
      ({
        "0x9120": "Effect_Test_Proj_A",
        "0xa010": "TestHoverPoint",
      })[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 4);
  assert.equal(audit.summary.objectAppendRows, 2);
  assert.equal(audit.summary.primaryVtableResolvedRows, 4);
  assert.equal(audit.summary.followingSlotRows, 4);
  assert.equal(audit.summary.resolvedFollowingSlotRows, 4);
  assert.equal(audit.summary.nonNoopFollowingSlotRows, 3);
  assert.equal(audit.summary.payloadSetterFollowingSlotRows, 1);
  assert.equal(audit.summary.callbackInstallerFollowingSlotRows, 1);
  assert.equal(audit.summary.payloadModeSetterFollowingSlotRows, 1);
  assert.equal(audit.summary.followingArgument1StringRows, 2);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const [first, second, third, fourth] = audit.items;
  assert.equal(first.status, "token-child-object-following-slot-payload-setter");
  assert.equal(first.objectAppendTargetHex, "0x3000");
  assert.equal(first.objectAllocatorTargetHex, "0x5000");
  assert.equal(first.objectAllocatorBodyTargetHex, "0x5300");
  assert.equal(first.primaryVtableAddressHex, "0x6100");
  assert.equal(first.followingVtableSlotOffsetHex, "0x68");
  assert.equal(first.followingArgument1AddressHex, "0x9120");
  assert.equal(first.followingArgument1CString, "Effect_Test_Proj_A");
  assert.equal(first.resolvedFollowingSlotFunctionHex, "0x7068");
  assert.equal(first.resolvedFollowingSlotFunctionClass, "payload-pointer-setter");
  assert.equal(first.resolvedFollowingSlotPayloadOffsetHex, "0x18");
  assert.equal(first.resolvedFollowingSlotDelegateFunctionHex, "0x9000");
  assert.equal(first.resolvedFollowingSlotDelegateFunctionClass, "payload-pointer-store");
  assert.equal(first.renderPromotionAllowed, false);

  assert.equal(second.status, "token-child-object-following-slot-callback-installer");
  assert.equal(second.followingVtableSlotOffsetHex, "0x70");
  assert.equal(second.resolvedFollowingSlotFunctionClass, "callback-installer");
  assert.equal(second.resolvedFollowingSlotCallbackFunctionHex, "0xb030");
  assert.equal(second.resolvedFollowingSlotCallbackSlotOffsetHex, "0x88");

  assert.equal(third.status, "token-child-object-following-slot-payload-mode-setter");
  assert.equal(third.followingVtableSlotOffsetHex, "0x78");
  assert.equal(third.followingArgument1CString, "TestHoverPoint");
  assert.equal(third.resolvedFollowingSlotFunctionClass, "payload-mode-setter");
  assert.equal(third.resolvedFollowingSlotPayloadOffsetHex, "0x18");
  assert.equal(third.resolvedFollowingSlotArgumentStoreOffsetHex, "0x40");

  assert.equal(fourth.status, "token-child-object-following-slot-noop");
  assert.equal(fourth.objectAppendTargetHex, "0x3100");
  assert.equal(fourth.primaryVtableAddressHex, "0x8200");
  assert.equal(fourth.followingVtableSlotOffsetHex, "0x48");
  assert.equal(fourth.resolvedFollowingSlotFunctionClass, "ret-only");
});

test("projectile current token child object chain exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-chain-"));
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-object-chain-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_object_chain_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_object_chain_audit.tsv");

  const audit = exportProjectileCurrentTokenChildObjectChainAudit({
    currentFieldReaderCallsiteContextAudit: callsiteContextAudit(),
    disassembleWindow: () => syntheticTokenDisassembly,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    relativeRelocations: [
      { addressHex: "0x6168", targetHex: "0x7068" },
      { addressHex: "0x6170", targetHex: "0x7070" },
      { addressHex: "0x6178", targetHex: "0x7100" },
      { addressHex: "0x8248", targetHex: "0x8148" },
    ],
    readCString: (addressHex) =>
      ({
        "0x9120": "Effect_Test_Proj_A",
        "0xa010": "TestHoverPoint",
      })[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 4);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /token-child-object-following-slot-payload-setter/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /token-child-object-following-slot-callback-installer/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /token-child-object-following-slot-payload-mode-setter/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /resolvedFollowingSlotFunctionClass/);

  const [row] = readTsv(tsvOut);
  assert.equal(row.objectAppendTargetHex, "0x3000");
  assert.equal(row.resolvedFollowingSlotFunctionHex, "0x7068");
  assert.equal(row.followingArgument1CString, "Effect_Test_Proj_A");
  assert.equal(row.renderPromotionAllowed, "false");
});
