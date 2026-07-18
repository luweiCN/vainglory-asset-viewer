const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildEffectOwnerCandidateAudit,
  exportProjectileCurrentTokenChildEffectOwnerCandidateAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_effect_owner_candidate_audit");

const disassemblyByAddress = {
  "0x8cced8": `
    8cced8: ldr w1, [x8, #0xea8]
    8ccee8: mov x0, x20
    8ccef4: bl 0x188b8b8
    8ccef8: mov x20, x0
    8ccf00: ldr x1, [x19, #0x28]
    8ccf04: mov x0, x20
    8ccf0c: bl 0x8d42b4
    8ccf18: bl 0x8d4540
    8ccf1c: add x1, sp, #0x18
    8ccf20: mov x0, x20
    8ccf24: bl 0x8d45d4
    8ccf28: ldr x0, [x19, #0x30]
    8ccf2c: bl 0xd6d6e0
    8ccf34: ldr x19, [x19, #0x30]
    8ccf50: bl 0x821104
    8ccf58: mov x0, x20
    8ccf5c: bl 0x8d44e4
    8ccf60: mov x0, x20
    8ccf64: bl 0x8d44ec
    8ccf98: ret
  `,
};

function typeOwnerAudit() {
  return {
    items: [
      {
        xrefAddressHex: "0x8cced8",
        contextRole: "create-layout-b-instance-for-effect-owner",
        helperTargetHex: "0x188b8b8",
        layoutBFamilyCallTargetsHex: "0x8d42b4 | 0x8d4540 | 0x8d45d4 | 0x8d44e4 | 0x8d44ec",
        renderPromotionAllowed: false,
      },
      {
        xrefAddressHex: "0x886b64",
        contextRole: "create-layout-b-owned-instance",
        helperTargetHex: "0x188b8b8",
        layoutBFamilyCallTargetsHex: "0x8d45d4",
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile current token child effect owner candidate audit isolates the effect-owner layout-B create path", () => {
  const audit = buildProjectileCurrentTokenChildEffectOwnerCandidateAudit({
    typeOwnerAudit: typeOwnerAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.effectOwnerCandidateRows, 1);
  assert.equal(audit.summary.createResolveRows, 1);
  assert.equal(audit.summary.layoutBSetupCallRows, 5);
  assert.equal(audit.summary.ownerFieldReadRows, 2);
  assert.equal(audit.summary.optionalExternalHandleRows, 1);
  assert.equal(audit.summary.pfxEmitterOwnerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const candidate = audit.items[0];
  assert.equal(candidate.candidateFunctionHex, "0x8cced8");
  assert.deepEqual(candidate.layoutBSetupCallTargets, ["0x8d42b4", "0x8d4540", "0x8d45d4", "0x8d44e4", "0x8d44ec"]);
  assert.deepEqual(candidate.ownerFieldReadOffsets, ["0x28", "0x30"]);
  assert.equal(candidate.optionalExternalHandleRecovered, true);
  assert.equal(candidate.pfxEmitterOwnerResolved, false);
  assert.match(candidate.nextRequiredEvidence, /x19 concrete class/);
});

test("projectile current token child effect owner candidate exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-effect-owner-candidate-"));
  const typeOwnerAuditPath = path.join(tempDir, "current_native_layout_b_type_owner_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-effect-owner-candidate-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_effect_owner_candidate_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_effect_owner_candidate_audit.tsv");

  fs.writeFileSync(typeOwnerAuditPath, JSON.stringify(typeOwnerAudit()));

  const audit = exportProjectileCurrentTokenChildEffectOwnerCandidateAudit({
    typeOwnerAuditPath,
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /effect-owner-candidate/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /optionalExternalHandleRecovered/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
