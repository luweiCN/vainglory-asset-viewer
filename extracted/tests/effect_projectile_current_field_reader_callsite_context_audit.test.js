const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentFieldReaderCallsiteContextAudit,
  exportProjectileCurrentFieldReaderCallsiteContextAudit,
  readTsv,
} = require("../tools/effect_projectile_current_field_reader_callsite_context_audit");

const syntheticDisassembly = `
0000000000001000 <synthetic>:
    1000: mov x19, x0
    1004: bl 0x3000
    1008: mov x0, x19
    100c: bl 0x4000
    1010: bl 0x5000
    1014: ldr x8, [x0]
    1018: ldr x8, [x8, #0x38]
    101c: blr x8
    1020: ret
`;

function syntheticInputs() {
  return {
    currentTokenWindowAudit: {
      items: [
        {
          status: "current-token-runtime-window",
          targetName: "Effect_Test_Proj",
          xrefAddressHex: "0x1110",
          functionStartHex: "0x1000",
          functionEndHex: "0x1020",
          runtimeFieldOffsets: ["0x120"],
          vtableOffsets: ["0x38"],
          branchCallTargets: ["0x3000", "0x4000", "0x5000"],
        },
      ],
    },
    currentFieldReaderCandidateAudit: {
      items: [
        {
          status: "current-field-reader-candidate-specific",
          branchTargetHex: "0x4000",
          specificReadOffsets: ["0x88"],
          genericReadOffsets: [],
        },
      ],
    },
  };
}

test("projectile current field reader callsite context audit records caller context without promotion", () => {
  const audit = buildProjectileCurrentFieldReaderCallsiteContextAudit({
    ...syntheticInputs(),
    disassembleWindow: () => syntheticDisassembly,
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.readerCallsiteRows, 1);
  assert.equal(audit.summary.specificReaderCallsiteRows, 1);
  assert.equal(audit.summary.argumentBaseRecoveredRows, 1);
  assert.equal(audit.summary.previousBranchRows, 1);
  assert.equal(audit.summary.followingBranchRows, 1);
  assert.equal(audit.summary.followingVtableCallRows, 1);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const [row] = audit.items;
  assert.equal(row.status, "current-field-reader-callsite-specific");
  assert.equal(row.targetName, "Effect_Test_Proj");
  assert.equal(row.branchTargetHex, "0x4000");
  assert.equal(row.callsiteAddressHex, "0x100c");
  assert.equal(row.argumentKind, "base-register");
  assert.equal(row.argumentBaseRegister, "x19");
  assert.deepEqual(row.candidateSpecificReadOffsets, ["0x88"]);
  assert.deepEqual(row.previousBranchTargets, ["0x3000"]);
  assert.deepEqual(row.followingBranchTargets, ["0x5000"]);
  assert.deepEqual(row.followingVtableOffsets, ["0x38"]);
  assert.equal(row.currentConsumerResolved, false);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current field reader callsite context exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-reader-callsite-"));
  const viewerOut = path.join(tempDir, "effect-projectile-current-field-reader-callsite-context-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_field_reader_callsite_context_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_field_reader_callsite_context_audit.tsv");

  const audit = exportProjectileCurrentFieldReaderCallsiteContextAudit({
    ...syntheticInputs(),
    disassembleWindow: () => syntheticDisassembly,
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /current-field-reader-callsite-specific/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /followingVtableOffsets/);

  const [row] = readTsv(tsvOut);
  assert.equal(row.status, "current-field-reader-callsite-specific");
  assert.equal(row.previousBranchTargets, "0x3000");
  assert.equal(row.followingBranchTargets, "0x5000");
  assert.equal(row.followingVtableOffsets, "0x38");
  assert.equal(row.renderPromotionAllowed, "false");
});
