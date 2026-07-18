const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentBranchTargetAudit,
  exportProjectileCurrentBranchTargetAudit,
  readTsv,
} = require("../tools/effect_projectile_current_branch_target_audit");

const fieldWriterDisassembly = `
  2000: bd008800      str s0, [x0, #0x88]
  2004: d65f03c0      ret
`;

test("projectile current branch target audit groups direct targets without promotion", () => {
  const audit = buildProjectileCurrentBranchTargetAudit({
    currentTokenWindowAudit: {
      items: [
        {
          targetName: "Effect_Test_Projectile",
          xrefAddressHex: "0x1000",
          branchCallTargets: ["0x2000"],
          status: "current-token-runtime-window",
        },
        {
          targetName: "Effect_Test_Impact",
          xrefAddressHex: "0x1010",
          branchCallTargets: ["0x2000"],
          status: "current-token-runtime-window",
        },
      ],
    },
    disassembleFunction: () => fieldWriterDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.sourceTokenWindowRows, 2);
  assert.equal(audit.summary.fieldWriterRows, 1);
  assert.equal(audit.summary.fieldWriteReferenceRows, 1);
  assert.equal(audit.summary.vtableCallRows, 0);
  assert.equal(audit.summary.directBranchRows, 0);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const row = audit.items[0];
  assert.equal(row.status, "current-branch-field-writer");
  assert.equal(row.branchTargetHex, "0x2000");
  assert.equal(row.sourceTokenWindowRows, 2);
  assert.deepEqual(row.sourceTargetNames, ["Effect_Test_Projectile", "Effect_Test_Impact"]);
  assert.deepEqual(row.fieldWriteOffsets, ["0x88"]);
  assert.deepEqual(row.vtableOffsets, []);
  assert.equal(row.currentConsumerResolved, false);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current branch target exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-branch-target-"));
  const currentTokenWindowAuditPath = path.join(tempDir, "effect_projectile_current_token_window_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-branch-target-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_branch_target_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_branch_target_audit.tsv");

  fs.writeFileSync(
    currentTokenWindowAuditPath,
    JSON.stringify({
      items: [
        {
          targetName: "Effect_Test_Projectile",
          xrefAddressHex: "0x1000",
          branchCallTargets: ["0x2000"],
          status: "current-token-runtime-window",
        },
      ],
    }),
  );

  const summary = exportProjectileCurrentBranchTargetAudit({
    currentTokenWindowAuditPath,
    disassembleFunction: () => fieldWriterDisassembly,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /current-branch-field-writer/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /Effect_Test_Projectile/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fieldWriteOffsets, "0x88");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
