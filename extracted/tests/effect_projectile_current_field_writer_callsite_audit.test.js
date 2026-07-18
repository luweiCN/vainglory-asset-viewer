const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentFieldWriterCallsiteAudit,
  exportProjectileCurrentFieldWriterCallsiteAudit,
  readTsv,
} = require("../tools/effect_projectile_current_field_writer_callsite_audit");

const tokenWindowDisassembly = `
  1000: d10143ff      sub sp, sp, #0x50
  1004: 91048280      add x0, x20, #0x120
  1008: 1e2e1000      fmov s0, #1.00000000
  100c: 94000400      bl 0x2000
  1010: d65f03c0      ret
`;

test("projectile current field writer callsite audit combines helper field offsets with local x0 base", () => {
  const audit = buildProjectileCurrentFieldWriterCallsiteAudit({
    currentTokenWindowAudit: {
      items: [
        {
          targetName: "Effect_Test_Projectile",
          xrefAddressHex: "0x1004",
          functionStartHex: "0x1000",
          functionEndHex: "0x1010",
          branchCallTargets: ["0x2000"],
        },
      ],
    },
    currentBranchTargetAudit: {
      items: [
        {
          status: "current-branch-field-writer",
          branchTargetHex: "0x2000",
          fieldWriteOffsets: ["0x88"],
        },
      ],
    },
    disassembleWindow: () => tokenWindowDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.fieldWriterCallsiteRows, 1);
  assert.equal(audit.summary.argumentBaseRecoveredRows, 1);
  assert.equal(audit.summary.combinedRuntimeFieldRows, 1);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const row = audit.items[0];
  assert.equal(row.status, "field-writer-callsite-argument-base");
  assert.equal(row.targetName, "Effect_Test_Projectile");
  assert.equal(row.branchTargetHex, "0x2000");
  assert.equal(row.callsiteAddressHex, "0x100c");
  assert.equal(row.argumentBaseRegister, "x20");
  assert.equal(row.argumentBaseOffsetHex, "0x120");
  assert.deepEqual(row.helperFieldWriteOffsets, ["0x88"]);
  assert.deepEqual(row.combinedRuntimeFieldOffsets, ["0x1a8"]);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current field writer callsite exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-field-writer-callsite-"));
  const currentTokenWindowAuditPath = path.join(tempDir, "effect_projectile_current_token_window_audit.json");
  const currentBranchTargetAuditPath = path.join(tempDir, "effect_projectile_current_branch_target_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-field-writer-callsite-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_field_writer_callsite_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_field_writer_callsite_audit.tsv");

  fs.writeFileSync(
    currentTokenWindowAuditPath,
    JSON.stringify({
      items: [
        {
          targetName: "Effect_Test_Projectile",
          xrefAddressHex: "0x1004",
          functionStartHex: "0x1000",
          functionEndHex: "0x1010",
          branchCallTargets: ["0x2000"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    currentBranchTargetAuditPath,
    JSON.stringify({
      items: [
        {
          status: "current-branch-field-writer",
          branchTargetHex: "0x2000",
          fieldWriteOffsets: ["0x88"],
        },
      ],
    }),
  );

  const summary = exportProjectileCurrentFieldWriterCallsiteAudit({
    currentTokenWindowAuditPath,
    currentBranchTargetAuditPath,
    disassembleWindow: () => tokenWindowDisassembly,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /field-writer-callsite-argument-base/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /0x1a8/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].combinedRuntimeFieldOffsets, "0x1a8");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
