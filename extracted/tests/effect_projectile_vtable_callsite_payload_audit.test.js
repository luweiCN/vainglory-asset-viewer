const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileVtableCallsitePayloadAudit,
  exportProjectileVtableCallsitePayloadAudit,
  extractVtableCallsitePayloads,
  readTsv,
} = require("../tools/effect_projectile_vtable_callsite_payload_audit");

const contextText = `
  plVar5 = (long *)(**(code **)(*plVar5 + 0x38))(plVar5,PTR_s_Buff_Anka_C_InitialDashHit_02bf15e8);
  local_48[0] = 0x3f000000;
  local_40 = 1;
  (**(code **)(*plVar5 + 0x18))(plVar5,local_48);
  local_48 = FUN_00df6f0c;
  local_40 = 3;
  plVar2 = (long *)(**(code **)(*plVar2 + 0x18))(plVar2,&local_48);
  plVar2 = (long *)(**(code **)(*plVar2 + 0x48))(plVar2,0xb0);
  (**(code **)(*plVar2 + 0x50))(plVar2,2);
`;

test("extractVtableCallsitePayloads classifies string, local, callback, and scalar payloads", () => {
  const rows = extractVtableCallsitePayloads(contextText);

  assert.deepEqual(
    rows.map((row) => [row.offset, row.payloadKind]),
    [
      ["0x38", "string-token"],
      ["0x18", "local-immediate-payload"],
      ["0x18", "local-callback-payload"],
      ["0x48", "immediate-scalar"],
      ["0x50", "immediate-scalar"],
    ],
  );

  const localImmediate = rows.find((row) => row.payloadKind === "local-immediate-payload");
  assert.match(localImmediate.localAssignments.join("|"), /local_48\[0\] = 0x3f000000/);
  assert.match(localImmediate.localAssignments.join("|"), /local_40 = 1/);

  const callback = rows.find((row) => row.payloadKind === "local-callback-payload");
  assert.equal(callback.callbackFunction, "FUN_00df6f0c");
  assert.match(callback.localAssignments.join("|"), /local_40 = 3/);
});

test("projectile vtable callsite payload audit joins target dispatch rows to native contexts", () => {
  const audit = buildProjectileVtableCallsitePayloadAudit({
    targetDispatchAudit: {
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          effectToken: "Effect_Anka_C_Clone",
          heroNames: ["Anka"],
          actionKeys: ["ability03"],
          matchedContextFunctions: ["FUN_00d93e84"],
          matchedContextPlatforms: ["android"],
        },
      ],
    },
    skinrepContextItems: [
      {
        functionName: "FUN_00d93e84",
        platform: "android",
        sourceFile: "00d93.c",
        line: 553,
        context: contextText,
      },
    ],
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 5);
  assert.equal(audit.summary.sourceTargetDispatchRows, 1);
  assert.equal(audit.summary.localPayloadRows, 2);
  assert.equal(audit.summary.callbackPayloadRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byOffset["0x18"], 2);
  assert.ok(audit.items.every((item) => item.renderPromotionAllowed === false));
});

test("projectile vtable callsite payload exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-callsite-payload-"));
  const targetDispatchAuditPath = path.join(tempDir, "effect_projectile_target_dispatch_audit.json");
  const skinrepContextPath = path.join(tempDir, "native_skinrep_consumer_context.json");
  const viewerOut = path.join(tempDir, "effect-projectile-vtable-callsite-payload-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_vtable_callsite_payload_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_vtable_callsite_payload_audit.tsv");

  fs.writeFileSync(
    targetDispatchAuditPath,
    JSON.stringify({
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          effectToken: "Effect_Anka_C_Clone",
          heroNames: ["Anka"],
          actionKeys: ["ability03"],
          matchedContextFunctions: ["FUN_00d93e84"],
          matchedContextPlatforms: ["android"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    skinrepContextPath,
    JSON.stringify({
      items: [
        {
          functionName: "FUN_00d93e84",
          platform: "android",
          sourceFile: "00d93.c",
          line: 553,
          context: contextText,
        },
      ],
    }),
  );

  const summary = exportProjectileVtableCallsitePayloadAudit({
    targetDispatchAuditPath,
    skinrepContextPath,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 5);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /local-callback-payload/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /Effect_Anka_C_Clone/);
  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 5);
  assert.equal(tsvRows.find((row) => row.payloadKind === "local-callback-payload").callbackFunction, "FUN_00df6f0c");
});
