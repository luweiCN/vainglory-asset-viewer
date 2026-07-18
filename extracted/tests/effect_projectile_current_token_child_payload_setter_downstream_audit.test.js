const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildPayloadSetterDownstreamAudit,
  exportProjectileCurrentTokenChildPayloadSetterDownstreamAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_payload_setter_downstream_audit");

const disassemblyByAddress = {
  "0x8d4a50": `
    8d4a50: mov x19, x0
    8d4a54: bl 0x8d4a8c
    8d4a58: ret
  `,
  "0x8d4a8c": `
    8d4a8c: mov x19, x0
    8d4a90: bl 0x799980
    8d4a94: mov x0, x19
    8d4a98: add x1, sp, #0x8
    8d4a9c: bl 0x8d45d4
    8d4aa0: ret
  `,
  "0x8d45d4": `
    8d45d4: mov x19, x0
    8d45d8: ldr w8, [x0, #0x10c]
    8d45dc: ldr x8, [x19, #0x50]
    8d45e0: cbz x8, 0x8d45e8
    8d45e4: str s0, [x8]
    8d45e8: stp s1, s2, [x19, #0x68]
    8d45ec: str w3, [x19, #0x74]
    8d45f0: ret
  `,
  "0x8d4fdc": `
    8d4fdc: mov x21, x0
    8d4fe0: ldr x0, [x0, #0x50]
    8d4fe4: bl 0xe39678
    8d4fe8: ldr x8, [x21, #0x50]
    8d4fec: mov x0, x8
    8d4ff0: b 0xe39830
  `,
  "0xe39678": `
    e39678: ldr x8, [x0, #0x80]
    e3967c: ldr x9, [x0, #0x68]
    e39680: ret
  `,
  "0xe39830": `
    e39830: ldr x8, [x0, #0x80]
    e39834: ret
  `,
};

function payloadSetterAudit() {
  return {
    items: [
      {
        helperFunctionHex: "0x8d4a50",
        helperClass: "layout-b-state-scalar-setter",
        sourcePayloadConsumerFunctionHexes: ["0x985028"],
        helperCallTargetHexes: ["0x8d4a8c"],
        renderPromotionAllowed: false,
      },
      {
        helperFunctionHex: "0x8d4fdc",
        helperClass: "layout-b-object50-commit-helper",
        sourcePayloadConsumerFunctionHexes: ["0x984e04"],
        helperCallTargetHexes: ["0xe39678"],
        renderPromotionAllowed: false,
      },
    ],
  };
}

function commonApplySetterAudit() {
  return {
    rows: [
      {
        addressHex: "0x8d46ec",
        blockId: "base-transform-setter",
        role: "transform-store-68",
        objectOffsetHex: "0x68",
        accessKind: "store",
        opcodeMatches: true,
      },
      {
        addressHex: "0x8d46f4",
        blockId: "base-transform-setter",
        role: "transform-store-74",
        objectOffsetHex: "0x74",
        accessKind: "store",
        opcodeMatches: true,
      },
    ],
  };
}

test("projectile current token child payload setter downstream audit traces transform and manager next hops", () => {
  const audit = buildProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
    payloadSetterAudit: payloadSetterAudit(),
    commonApplySetterAudit: commonApplySetterAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 4);
  assert.equal(audit.summary.uniqueDownstreamTargets, 4);
  assert.equal(audit.summary.layoutBObjectArgumentRows, 2);
  assert.equal(audit.summary.object50RuntimeArgumentRows, 2);
  assert.equal(audit.summary.baseTransformApplyRows, 1);
  assert.equal(audit.summary.managerRuntimeRows, 2);
  assert.equal(audit.summary.objectFieldWriteRows, 3);
  assert.equal(audit.summary.backingTransformWriteRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const transform = audit.items.find((item) => item.downstreamFunctionHex === "0x8d45d4");
  assert.equal(transform.downstreamClass, "layout-b-base-transform-apply-helper");
  assert.equal(transform.argument0Provenance, "layout-b-object");
  assert.deepEqual(transform.commonApplyBlockIds, ["base-transform-setter"]);
  assert.deepEqual(transform.objectFieldReadOffsets, ["0x10c", "0x50"]);
  assert.deepEqual(transform.objectFieldWriteOffsets, ["0x68", "0x74", "0x6c"]);
  assert.deepEqual(transform.backingTransformWriteOffsets, ["0x0"]);
  assert.equal(transform.renderPromotionAllowed, false);

  const tail = audit.items.find(
    (item) => item.sourceHelperFunctionHex === "0x8d4fdc" && item.downstreamFunctionHex === "0xe39830",
  );
  assert.equal(tail.callKind, "tail-branch");
  assert.equal(tail.argument0Provenance, "object+0x50-runtime");
  assert.deepEqual(tail.managerFieldReadOffsets, ["0x80"]);
});

test("projectile current token child payload setter downstream exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-token-child-payload-setter-downstream-"));
  const payloadSetterAuditPath = path.join(tempDir, "effect_projectile_current_token_child_payload_setter_audit.json");
  const commonApplySetterAuditPath = path.join(tempDir, "current_native_layout_b_common_apply_setter_fields_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-payload-setter-downstream-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_payload_setter_downstream_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_payload_setter_downstream_audit.tsv");

  fs.writeFileSync(payloadSetterAuditPath, JSON.stringify(payloadSetterAudit()));
  fs.writeFileSync(commonApplySetterAuditPath, JSON.stringify(commonApplySetterAudit()));

  const audit = exportProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
    payloadSetterAuditPath,
    commonApplySetterAuditPath,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 4);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /layout-b-base-transform-apply-helper/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /object50RuntimeArgumentRows/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.downstreamFunctionHex === "0xe39830").renderPromotionAllowed, "false");
});
