const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenWindowAudit,
  exportProjectileCurrentTokenWindowAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_window_audit");

const currentWindowDisassembly = `
  0ff8: d65f03c0      ret
  1000: d10143ff      sub sp, sp, #0x50
  1004: a9047bfd      stp x29, x30, [sp, #0x40]
  1008: 91367d08      add x8, x8, #0xd9f
  100c: f9000028      str x8, [x1]
  1010: 91048280      add x0, x20, #0x120
  1014: f9008e80      str x0, [x20, #0x118]
  1018: f9400008      ldr x8, [x0]
  101c: f9401d08      ldr x8, [x8, #0x38]
  1020: d63f0100      blr x8
  1024: 94000010      bl 0x1064
  1028: d65f03c0      ret
`;

test("projectile current token window audit recovers current xref function-window mechanics without promotion", () => {
  const audit = buildProjectileCurrentTokenWindowAudit({
    consumerTraceAudit: {
      items: [
        {
          effectToken: "Effect_Test_Projectile",
          currentReferencedTokens: ["Effect_Test_Projectile"],
          status: "current-vtable-and-token-crossbuild-consumer-unresolved",
          semanticJoinRows: 2,
        },
      ],
    },
    currentStringReferences: [
      {
        targetName: "Effect_Test_Projectile",
        targetAddressHex: "0x2000",
        xrefAddressHex: "0x1008",
        mode: "adrp-add",
      },
    ],
    disassembleWindow: () => currentWindowDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.currentXrefRows, 1);
  assert.equal(audit.summary.currentTokenRuntimeWindowRows, 1);
  assert.equal(audit.summary.runtimeFieldReferenceRows, 2);
  assert.equal(audit.summary.vtableCallRows, 1);
  assert.equal(audit.summary.branchCallRows, 1);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const row = audit.items[0];
  assert.equal(row.status, "current-token-runtime-window");
  assert.equal(row.functionStartHex, "0x1000");
  assert.equal(row.functionEndHex, "0x1028");
  assert.deepEqual(row.runtimeFieldOffsets, ["0x120", "0x118"]);
  assert.deepEqual(row.vtableOffsets, ["0x38"]);
  assert.deepEqual(row.branchCallTargets, ["0x1064"]);
  assert.equal(row.currentConsumerResolved, false);
  assert.equal(row.renderPromotionAllowed, false);
  assert.match(row.blocker, /current token function window/);
});

test("projectile current token window exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-token-window-"));
  const consumerTraceAuditPath = path.join(tempDir, "effect_projectile_runtime_consumer_trace_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-window-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_window_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_window_audit.tsv");

  fs.writeFileSync(
    consumerTraceAuditPath,
    JSON.stringify({
      items: [
        {
          effectToken: "Effect_Test_Projectile",
          currentReferencedTokens: ["Effect_Test_Projectile"],
          status: "current-vtable-and-token-crossbuild-consumer-unresolved",
        },
      ],
    }),
  );

  const summary = exportProjectileCurrentTokenWindowAudit({
    consumerTraceAuditPath,
    currentStringReferences: [
      {
        targetName: "Effect_Test_Projectile",
        targetAddressHex: "0x2000",
        xrefAddressHex: "0x1008",
        mode: "adrp-add",
      },
    ],
    disassembleWindow: () => currentWindowDisassembly,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /current-token-runtime-window/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /Effect_Test_Projectile/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].vtableOffsets, "0x38");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
