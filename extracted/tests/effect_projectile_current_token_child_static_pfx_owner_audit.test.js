const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentTokenChildStaticPfxOwnerAudit,
  exportProjectileCurrentTokenChildStaticPfxOwnerAudit,
  readTsv,
} = require("../tools/effect_projectile_current_token_child_static_pfx_owner_audit");

const levelVisualsApplyDisassembly = `
  8cc27c: sub sp, sp, #0x90
  8cc2a4: mov x19, x1
  8cc2b4: ldr x8, [x1, #0x8]
  8cc2cc: bl 0x8cca64
  8cc2d8: ldr x8, [x19, #0x20]
  8cc2dc: ldr x1, [x8]
  8cc2e4: add x22, x8, #0x8
  8cc2e8: mov x0, x20
  8cc2ec: bl 0x8ccd14
  8cc324: ldr x8, [x19, #0x30]
  8cc328: ldr x1, [x8]
  8cc334: mov x0, x20
  8cc338: bl 0x8ccd14
  8cc36c: ldr x8, [x19, #0x28]
  8cc370: ldr x1, [x8]
  8cc37c: mov x0, x20
  8cc380: bl 0x8ccd14
  8cc3c0: ret
`;

const staticPfxHandlerDisassembly = `
  8ccd14: sub sp, sp, #0xd0
  8ccd50: mov x19, x1
  8ccd60: mov x20, x0
  8cced8: ldr w1, [x8, #0xea8]
  8ccef4: bl 0x188b8b8
  8ccf00: ldr x1, [x19, #0x28]
  8ccf0c: bl 0x8d42b4
  8ccf24: bl 0x8d45d4
  8ccf28: ldr x0, [x19, #0x30]
  8ccf2c: bl 0xd6d6e0
  8ccf5c: bl 0x8d44e4
  8ccf64: bl 0x8d44ec
  8ccf98: ret
`;

function levelVisualsSchemaAudit() {
  return {
    fields: [
      { fieldOffsetHex: "0x8", typeName: "StaticMesh**" },
      { fieldOffsetHex: "0x20", typeName: "StaticPfx**" },
      { fieldOffsetHex: "0x28", typeName: "StaticPfx**" },
      { fieldOffsetHex: "0x30", typeName: "StaticPfx**" },
      { fieldOffsetHex: "0x58", typeName: "StaticLensFlare**" },
    ],
  };
}

function effectOwnerCandidateAudit() {
  return {
    items: [
      {
        candidateFunctionHex: "0x8cced8",
        ownerFieldReadOffsets: ["0x28", "0x30"],
        directCallTargets: ["0x188b8b8", "0x8d42b4", "0x8d45d4", "0xd6d6e0", "0x8d44e4", "0x8d44ec"],
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile static pfx owner audit proves LevelVisuals StaticPfx list ownership for the effect-owner path", () => {
  const audit = buildProjectileCurrentTokenChildStaticPfxOwnerAudit({
    levelVisualsSchemaAudit: levelVisualsSchemaAudit(),
    effectOwnerCandidateAudit: effectOwnerCandidateAudit(),
    disassembleFunction: (addressHex) => {
      if (addressHex === "0x8cc27c") return levelVisualsApplyDisassembly;
      if (addressHex === "0x8ccd14") return staticPfxHandlerDisassembly;
      return "";
    },
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 3);
  assert.equal(audit.summary.staticPfxListCallsiteRows, 3);
  assert.equal(audit.summary.staticPfxSchemaFieldRows, 3);
  assert.equal(audit.summary.effectOwnerFunctionRows, 1);
  assert.equal(audit.summary.x19StaticPfxResolvedRows, 3);
  assert.equal(audit.summary.managerEntryOwnerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  assert.deepEqual(
    audit.items.map((item) => item.levelVisualsFieldOffsetHex),
    ["0x20", "0x30", "0x28"],
  );
  assert.ok(audit.items.every((item) => item.levelVisualsFieldTypeName === "StaticPfx**"));
  assert.ok(audit.items.every((item) => item.staticPfxArgumentRegister === "x1"));
  assert.ok(audit.items.every((item) => item.targetAliasesStaticPfxToX19));
  assert.ok(audit.items.every((item) => item.effectOwnerCreateAddressHex === "0x8cced8"));
  assert.ok(audit.items.every((item) => item.managerEntryOwnerResolved === false));
});

test("projectile static pfx owner exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-static-pfx-owner-"));
  const levelVisualsSchemaAuditPath = path.join(tempDir, "current_native_levelvisuals_schema_audit.json");
  const effectOwnerCandidateAuditPath = path.join(
    tempDir,
    "effect_projectile_current_token_child_effect_owner_candidate_audit.json",
  );
  const viewerOut = path.join(tempDir, "effect-projectile-current-token-child-static-pfx-owner-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_token_child_static_pfx_owner_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_token_child_static_pfx_owner_audit.tsv");

  fs.writeFileSync(levelVisualsSchemaAuditPath, JSON.stringify(levelVisualsSchemaAudit()));
  fs.writeFileSync(effectOwnerCandidateAuditPath, JSON.stringify(effectOwnerCandidateAudit()));

  const audit = exportProjectileCurrentTokenChildStaticPfxOwnerAudit({
    levelVisualsSchemaAuditPath,
    effectOwnerCandidateAuditPath,
    disassembleFunction: (addressHex) => {
      if (addressHex === "0x8cc27c") return levelVisualsApplyDisassembly;
      if (addressHex === "0x8ccd14") return staticPfxHandlerDisassembly;
      return "";
    },
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 3);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /StaticPfx/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /targetAliasesStaticPfxToX19/);

  const rows = readTsv(tsvOut);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].renderPromotionAllowed, "false");
});
