const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileVtableSemanticJoinAudit,
  exportProjectileVtableSemanticJoinAudit,
  readTsv,
} = require("../tools/effect_projectile_vtable_semantic_join_audit");

test("projectile vtable semantic join aggregates slot, output writes, and callsite payloads without promotion", () => {
  const audit = buildProjectileVtableSemanticJoinAudit({
    slotAudit: {
      items: [
        {
          effectToken: "Effect_Test",
          heroNames: ["HeroTest"],
          actionKeys: ["ability01"],
          requestedOffset: "0x18",
          resolvedSlotOffsetHex: "0x10",
          resolvedFunctionAddressHex: "0x1000",
          slotStatus: "descriptor-companion-slot",
          vtablePointer: "PTR_FUN_02800000",
        },
        {
          effectToken: "Effect_Test",
          heroNames: ["HeroTest"],
          actionKeys: ["ability01"],
          requestedOffset: "0x18",
          resolvedSlotOffsetHex: "0x10",
          resolvedFunctionAddressHex: "0x1000",
          slotStatus: "descriptor-companion-slot",
          vtablePointer: "PTR_FUN_02800000",
        },
      ],
    },
    outputLayoutAudit: {
      items: [
        {
          functionAddressHex: "0x1000",
          writeKind: "fixed-offset-store",
          fixedOffsetHex: "0x0",
          postIncrementHex: "",
          widthBytes: 4,
          valueClass: "immediate",
          valueImmediateHex: "0x3f800000",
        },
      ],
    },
    callsitePayloadAudit: {
      items: [
        {
          effectToken: "Effect_Test",
          offset: "0x18",
          payloadKind: "local-immediate-payload",
          payloadValue: "local_48",
          callbackFunction: "",
          contextFunction: "FUN_A",
          contextPlatform: "android",
        },
        {
          effectToken: "Effect_Test",
          offset: "0x18",
          payloadKind: "string-token",
          payloadValue: "PTR_s_Test_01234567",
          callbackFunction: "",
          contextFunction: "FUN_A",
          contextPlatform: "android",
        },
      ],
    },
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.sourceSlotRows, 2);
  assert.equal(audit.summary.joinedOutputRows, 1);
  assert.equal(audit.summary.joinedPayloadRows, 2);
  assert.equal(audit.summary.descriptorCompanionRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const row = audit.items[0];
  assert.equal(row.slotObservationRows, 2);
  assert.equal(row.outputWriteRows, 1);
  assert.equal(row.payloadCallsiteRows, 2);
  assert.deepEqual(row.payloadKinds, ["local-immediate-payload", "string-token"]);
  assert.deepEqual(row.outputValueClasses, ["immediate"]);
  assert.equal(row.renderPromotionAllowed, false);
  assert.match(row.blocker, /downstream consumer/);
});

test("projectile vtable semantic join exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-vtable-join-"));
  const slotAuditPath = path.join(tempDir, "effect_projectile_vtable_slot_audit.json");
  const outputLayoutAuditPath = path.join(tempDir, "effect_projectile_vtable_output_layout_audit.json");
  const callsitePayloadAuditPath = path.join(tempDir, "effect_projectile_vtable_callsite_payload_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-vtable-semantic-join-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_vtable_semantic_join_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_vtable_semantic_join_audit.tsv");

  fs.writeFileSync(
    slotAuditPath,
    JSON.stringify({
      items: [
        {
          effectToken: "Effect_Test",
          heroNames: ["HeroTest"],
          actionKeys: ["ability01"],
          requestedOffset: "0x30",
          resolvedSlotOffsetHex: "0x30",
          resolvedFunctionAddressHex: "0x2000",
          slotStatus: "exact-relocated-function-slot",
          vtablePointer: "PTR_FUN_02800020",
        },
      ],
    }),
  );
  fs.writeFileSync(
    outputLayoutAuditPath,
    JSON.stringify({
      items: [
        {
          functionAddressHex: "0x2000",
          writeKind: "post-increment-store",
          fixedOffsetHex: "",
          postIncrementHex: "0x4",
          widthBytes: 4,
          valueClass: "computed-float",
          valueImmediateHex: "",
        },
      ],
    }),
  );
  fs.writeFileSync(
    callsitePayloadAuditPath,
    JSON.stringify({
      items: [
        {
          effectToken: "Effect_Test",
          offset: "0x30",
          payloadKind: "immediate-scalar",
          payloadValue: "2",
          callbackFunction: "",
          contextFunction: "FUN_B",
          contextPlatform: "android",
        },
      ],
    }),
  );

  const summary = exportProjectileVtableSemanticJoinAudit({
    slotAuditPath,
    outputLayoutAuditPath,
    callsitePayloadAuditPath,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_Test/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /post-increment-store/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].requestedOffset, "0x30");
  assert.equal(rows[0].payloadKinds, "immediate-scalar");
});
