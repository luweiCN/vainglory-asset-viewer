const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentFieldReaderListDispatchAudit,
  exportProjectileCurrentFieldReaderListDispatchAudit,
  readTsv,
} = require("../tools/effect_projectile_current_field_reader_list_dispatch_audit");

const syntheticDisassembly = `
  1000: ldr s1, [x0, #0x31c]
  1004: ret
  1008: stp x22, x21, [sp, #-0x30]!
  100c: stp x20, x19, [sp, #0x10]
  1010: ldr x8, [x0, #0x50]
  1014: mov x19, x2
  1018: mov x20, x0
  101c: mov w21, w1
  1020: cbz x8, 0x105c
  1024: sub x22, x8, #0x8
  1028: cbz x22, 0x105c
  102c: ldr x8, [x22]
  1030: mov x0, x22
  1034: mov x1, x20
  1038: mov x2, x19
  103c: ldr x8, [x8, #0x40]
  1040: mov w3, w21
  1044: blr x8
  1048: ldr x8, [x22, #0x8]
  104c: sub x9, x8, #0x8
  1050: cmp x8, #0x0
  1054: csel x22, xzr, x9, eq
  1058: cbnz x22, 0x102c
  105c: ret
`;

function downstreamRouteAudit() {
  return {
    items: [
      {
        status: "field-reader-downstream-accessor-only",
        targetName: "Effect_Test_Proj",
        readerBranchTargetHex: "0x1000",
        readerCallsiteAddressHex: "0x9000",
        containerListOffsets: ["0x50", "0x58", "0x60"],
        objectListOffsets: ["0x0", "0x8", "0x10"],
        primaryVtableAddressHex: "0x5000",
        resolvedVtableFunctionClass: "accessor-add-x0",
        resolvedVtableAccessorOffsetHex: "0x10",
        renderPromotionAllowed: false,
      },
    ],
  };
}

test("projectile current field reader list dispatch audit records child vtable dispatch without promotion", () => {
  const audit = buildProjectileCurrentFieldReaderListDispatchAudit({
    currentFieldReaderDownstreamRouteAudit: downstreamRouteAudit(),
    disassembleWindow: () => syntheticDisassembly,
    disassembleFunction: () => "6000: ret",
    relativeRelocations: [{ addressHex: "0x5040", targetHex: "0x6000" }],
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.readerBranchTargetRows, 1);
  assert.equal(audit.summary.listDispatchFunctionRows, 1);
  assert.equal(audit.summary.childVtableSlotRows, 1);
  assert.equal(audit.summary.uniqueChildVtableSlots, 1);
  assert.equal(audit.summary.resolvedChildSlotRows, 1);
  assert.equal(audit.summary.retOnlyChildSlotRows, 1);
  assert.equal(audit.summary.semanticConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const [row] = audit.items;
  assert.equal(row.status, "field-reader-list-dispatch-child-vtable");
  assert.deepEqual(row.targetNames, ["Effect_Test_Proj"]);
  assert.equal(row.readerBranchTargetHex, "0x1000");
  assert.equal(row.dispatchFunctionStartHex, "0x1008");
  assert.equal(row.dispatchFunctionEndHex, "0x105c");
  assert.equal(row.listHeadOffsetHex, "0x50");
  assert.equal(row.nodeLinkOffsetHex, "0x8");
  assert.equal(row.nodePayloadAdjustmentHex, "0x8");
  assert.equal(row.childVtableSlotOffsetHex, "0x40");
  assert.equal(row.childPrimaryVtableAddressHex, "0x5000");
  assert.equal(row.resolvedChildSlotAddressHex, "0x5040");
  assert.equal(row.resolvedChildSlotFunctionHex, "0x6000");
  assert.equal(row.resolvedChildSlotFunctionClass, "ret-only");
  assert.deepEqual(row.forwardedArguments, ["x0=childNode", "x1=parentObject", "x2=context", "w3=phaseOrFlags"]);
  assert.equal(row.semanticConsumerResolved, false);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current field reader list dispatch exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-reader-list-dispatch-"));
  const viewerOut = path.join(tempDir, "effect-projectile-current-field-reader-list-dispatch-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_field_reader_list_dispatch_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_field_reader_list_dispatch_audit.tsv");

  const audit = exportProjectileCurrentFieldReaderListDispatchAudit({
    currentFieldReaderDownstreamRouteAudit: downstreamRouteAudit(),
    disassembleWindow: () => syntheticDisassembly,
    disassembleFunction: () => "6000: ret",
    relativeRelocations: [{ addressHex: "0x5040", targetHex: "0x6000" }],
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /field-reader-list-dispatch-child-vtable/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /childVtableSlotOffsetHex/);

  const [row] = readTsv(tsvOut);
  assert.equal(row.status, "field-reader-list-dispatch-child-vtable");
  assert.equal(row.readerBranchTargetHex, "0x1000");
  assert.equal(row.childVtableSlotOffsetHex, "0x40");
  assert.equal(row.resolvedChildSlotFunctionHex, "0x6000");
  assert.equal(row.resolvedChildSlotFunctionClass, "ret-only");
  assert.equal(row.renderPromotionAllowed, "false");
});
