const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentFieldReaderCandidateAudit,
  exportProjectileCurrentFieldReaderCandidateAudit,
  readTsv,
} = require("../tools/effect_projectile_current_field_reader_candidate_audit");

const readerDisassembly = `
  3000: bd408800      ldr s0, [x0, #0x88]
  3004: b94013e8      ldr w8, [sp, #0x10]
  3008: 94000400      bl 0x4000
  300c: d65f03c0      ret
`;

test("projectile current field reader candidate audit finds non-stack reads without promotion", () => {
  const audit = buildProjectileCurrentFieldReaderCandidateAudit({
    currentFieldWriterCallsiteAudit: {
      items: [
        {
          targetName: "Effect_Test_Projectile",
          combinedRuntimeFieldOffsets: ["0x88", "0x1a8"],
        },
      ],
    },
    currentBranchTargetAudit: {
      items: [
        {
          branchTargetHex: "0x3000",
          status: "current-branch-helper",
          sourceTokenWindowRows: 2,
          sourceTargetNames: ["Effect_Test_Projectile"],
        },
      ],
    },
    disassembleFunction: () => readerDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.readerCandidateRows, 1);
  assert.equal(audit.summary.specificFieldReadRows, 1);
  assert.equal(audit.summary.genericFieldReadRows, 0);
  assert.equal(audit.summary.stackReadIgnoredRows, 1);
  assert.equal(audit.summary.directBranchRows, 1);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const row = audit.items[0];
  assert.equal(row.status, "current-field-reader-candidate-specific");
  assert.equal(row.branchTargetHex, "0x3000");
  assert.deepEqual(row.specificReadOffsets, ["0x88"]);
  assert.deepEqual(row.genericReadOffsets, []);
  assert.deepEqual(row.ignoredStackReadOffsets, ["0x10"]);
  assert.deepEqual(row.directBranchTargets, ["0x4000"]);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current field reader candidate exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-field-reader-"));
  const currentFieldWriterCallsiteAuditPath = path.join(
    tempDir,
    "effect_projectile_current_field_writer_callsite_audit.json",
  );
  const currentBranchTargetAuditPath = path.join(tempDir, "effect_projectile_current_branch_target_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-field-reader-candidate-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_field_reader_candidate_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_field_reader_candidate_audit.tsv");

  fs.writeFileSync(
    currentFieldWriterCallsiteAuditPath,
    JSON.stringify({
      items: [
        {
          targetName: "Effect_Test_Projectile",
          combinedRuntimeFieldOffsets: ["0x88"],
        },
      ],
    }),
  );
  fs.writeFileSync(
    currentBranchTargetAuditPath,
    JSON.stringify({
      items: [
        {
          branchTargetHex: "0x3000",
          status: "current-branch-helper",
          sourceTokenWindowRows: 2,
          sourceTargetNames: ["Effect_Test_Projectile"],
        },
      ],
    }),
  );

  const summary = exportProjectileCurrentFieldReaderCandidateAudit({
    currentFieldWriterCallsiteAuditPath,
    currentBranchTargetAuditPath,
    disassembleFunction: () => readerDisassembly,
    viewerOut,
    reportOut,
    tsvOut,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /current-field-reader-candidate-specific/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /0x88/);
  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].specificReadOffsets, "0x88");
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
