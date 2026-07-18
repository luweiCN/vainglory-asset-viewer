const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileVtableSlotAudit,
  exportProjectileVtableSlotAudit,
  parseRelativeRelocations,
  readTsv,
} = require("../tools/effect_projectile_vtable_slot_audit");

const relocationText = `
000000000280e370 R_AARCH64_RELATIVE       *ABS*+0x135c88c
000000000280e380 R_AARCH64_RELATIVE       *ABS*+0x150eee0
000000000280e390 R_AARCH64_RELATIVE       *ABS*+0xf35808
000000000280e3a0 R_AARCH64_RELATIVE       *ABS*+0x1543958
000000000280e3c0 R_AARCH64_RELATIVE       *ABS*+0xebe384
000000000280e3d0 R_AARCH64_RELATIVE       *ABS*+0x11f5cac
`;

test("projectile vtable slot audit separates exact function slots from descriptor companions", () => {
  const audit = buildProjectileVtableSlotAudit({
    targetDispatchAudit: {
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          heroNames: ["Hero049"],
          actionKeys: ["attack"],
          effectToken: "Effect_Hero049_DefaultAttack_Shot",
          dispatchFactoryVtablePointers: ["PTR_FUN_0280e370", "PTR_FUN_101494b80"],
          targetVtableOffsets: ["0x10", "0x18", "0x38"],
        },
      ],
    },
    relocationText,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 3);
  assert.equal(audit.summary.sourceTargetDispatchRows, 1);
  assert.equal(audit.summary.androidVtablePointerRows, 1);
  assert.equal(audit.summary.exactSlotRows, 1);
  assert.equal(audit.summary.descriptorCompanionRows, 2);
  assert.equal(audit.summary.missingRelocationRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byRequestedOffset["0x10"], {
    rows: 1,
    exactSlotRows: 1,
    descriptorCompanionRows: 0,
    missingRelocationRows: 0,
  });
  assert.deepEqual(audit.summary.byRequestedOffset["0x18"], {
    rows: 1,
    exactSlotRows: 0,
    descriptorCompanionRows: 1,
    missingRelocationRows: 0,
  });

  const exact = audit.items.find((row) => row.requestedOffset === "0x10");
  assert.equal(exact.slotStatus, "exact-relocated-function-slot");
  assert.equal(exact.relocationSlotAddressHex, "0x280e380");
  assert.equal(exact.resolvedFunctionAddressHex, "0x150eee0");
  assert.equal(exact.renderPromotionAllowed, false);

  const companion = audit.items.find((row) => row.requestedOffset === "0x38");
  assert.equal(companion.slotStatus, "descriptor-companion-slot");
  assert.equal(companion.requestedSlotAddressHex, "0x280e3a8");
  assert.equal(companion.relocationSlotAddressHex, "0x280e3a0");
  assert.equal(companion.resolvedFunctionAddressHex, "0x1543958");
  assert.equal(companion.companionDeltaHex, "0x8");
  assert.match(companion.blocker, /descriptor companion/);
});

test("projectile vtable slot audit reports missing relocation without promotion", () => {
  const audit = buildProjectileVtableSlotAudit({
    targetDispatchAudit: {
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          heroNames: ["Lorelai"],
          effectToken: "Effect_Lorelai_Proj",
          dispatchFactoryVtablePointers: ["PTR_FUN_0280e370"],
          targetVtableOffsets: ["0x88"],
        },
      ],
    },
    relocationText,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.missingRelocationRows, 1);
  assert.equal(audit.items[0].slotStatus, "vtable-slot-relocation-missing");
  assert.equal(audit.items[0].renderPromotionAllowed, false);
});

test("projectile vtable slot exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-vtable-slot-"));
  const targetDispatchAuditPath = path.join(tempDir, "effect_projectile_target_dispatch_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-vtable-slot-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_vtable_slot_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_vtable_slot_audit.tsv");

  fs.writeFileSync(
    targetDispatchAuditPath,
    JSON.stringify({
      items: [
        {
          status: "target-dispatch-vtable-offsets",
          heroNames: ["Reza"],
          actionKeys: ["ability01"],
          effectToken: "Effect_Reza_A_Shot",
          dispatchFactoryVtablePointers: ["PTR_FUN_0280e150"],
          targetVtableOffsets: ["0x10"],
        },
      ],
    }),
  );

  const summary = exportProjectileVtableSlotAudit({
    targetDispatchAuditPath,
    viewerOut,
    reportOut,
    tsvOut,
    relocationText:
      "000000000280e160 R_AARCH64_RELATIVE       *ABS*+0x122c664\n",
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.exactSlotRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_Reza_A_Shot/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /exact-relocated-function-slot/);
  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].effectToken, "Effect_Reza_A_Shot");
  assert.equal(tsvRows[0].resolvedFunctionAddressHex, "0x122c664");
});

test("parseRelativeRelocations reads objdump relative relocation rows", () => {
  const relocations = parseRelativeRelocations(relocationText);
  assert.equal(relocations.get(0x280e370), 0x135c88c);
  assert.equal(relocations.get(0x280e3d0), 0x11f5cac);
});
