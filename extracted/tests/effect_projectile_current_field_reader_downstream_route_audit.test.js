const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileCurrentFieldReaderDownstreamRouteAudit,
  exportProjectileCurrentFieldReaderDownstreamRouteAudit,
  readTsv,
} = require("../tools/effect_projectile_current_field_reader_downstream_route_audit");

const disassemblyByAddress = {
  "0x2000": `
    2000: stp x20, x19, [sp, #-0x20]!
    2004: mov x19, x0
    2008: bl 0x2100
    200c: mov x8, x0
    2010: str xzr, [x8, #0x8]!
    2014: ldr x9, [x19, #0x50]
    2018: str x8, [x19, #0x58]
    201c: str w8, [x19, #0x60]
    2020: ret
  `,
  "0x3000": `
    3000: mov x19, x0
    3004: bl 0x4000
    3008: mov x8, x0
    300c: str xzr, [x8, #0x8]!
    3010: ldr x9, [x19]
    3014: str x8, [x19, #0x8]
    3018: str w8, [x19, #0x10]
    301c: ret
  `,
  "0x4000": `
    4000: bl 0x4100
    4004: ret
  `,
  "0x4100": `
    4100: adrp x11, 0x5000
    4104: add x11, x11, #0x100
    4108: add x9, x11, #0x10
    410c: str x9, [x8]
    4110: ret
  `,
  "0x6000": `
    6000: add x0, x0, #0x10
    6004: ret
  `,
};

function callsiteAudit() {
  return {
    items: [
      {
        status: "current-field-reader-callsite-specific",
        targetName: "Effect_Test_Proj",
        tokenFunctionStartHex: "0x1000",
        branchTargetHex: "0x1111",
        callsiteAddressHex: "0x1010",
        candidateSpecificReadOffsets: ["0x31c"],
        followingBranchTargets: ["0x2000", "0x3000"],
        followingVtableOffsets: ["0x30"],
      },
    ],
  };
}

test("projectile current field reader downstream route audit resolves allocator vtable accessor without promotion", () => {
  const audit = buildProjectileCurrentFieldReaderDownstreamRouteAudit({
    currentFieldReaderCallsiteContextAudit: callsiteAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    relativeRelocations: [{ addressHex: "0x5140", targetHex: "0x6000" }],
    generatedAt: "2026-07-06T00:00:00.000Z",
  });

  assert.equal(audit.summary.rows, 1);
  assert.equal(audit.summary.specificRouteRows, 1);
  assert.equal(audit.summary.containerAppendRows, 1);
  assert.equal(audit.summary.objectAppendRows, 1);
  assert.equal(audit.summary.primaryVtableResolvedRows, 1);
  assert.equal(audit.summary.vtableSlotResolvedRows, 1);
  assert.equal(audit.summary.accessorOnlySlotRows, 1);
  assert.equal(audit.summary.currentConsumerResolvedRows, 0);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);

  const [row] = audit.items;
  assert.equal(row.status, "field-reader-downstream-accessor-only");
  assert.equal(row.containerAppendTargetHex, "0x2000");
  assert.equal(row.objectAppendTargetHex, "0x3000");
  assert.equal(row.objectAllocatorTargetHex, "0x4000");
  assert.equal(row.objectAllocatorBodyTargetHex, "0x4100");
  assert.equal(row.primaryVtableAddressHex, "0x5110");
  assert.equal(row.followingVtableSlotOffsetHex, "0x30");
  assert.equal(row.resolvedVtableSlotAddressHex, "0x5140");
  assert.equal(row.resolvedVtableFunctionHex, "0x6000");
  assert.equal(row.resolvedVtableFunctionClass, "accessor-add-x0");
  assert.equal(row.resolvedVtableAccessorOffsetHex, "0x10");
  assert.equal(row.currentConsumerResolved, false);
  assert.equal(row.renderPromotionAllowed, false);
});

test("projectile current field reader downstream route exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "projectile-reader-downstream-"));
  const viewerOut = path.join(tempDir, "effect-projectile-current-field-reader-downstream-route-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_current_field_reader_downstream_route_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_current_field_reader_downstream_route_audit.tsv");

  const audit = exportProjectileCurrentFieldReaderDownstreamRouteAudit({
    currentFieldReaderCallsiteContextAudit: callsiteAudit(),
    disassembleFunction: (addressHex) => disassemblyByAddress[addressHex] || "",
    relativeRelocations: [{ addressHex: "0x5140", targetHex: "0x6000" }],
    generatedAt: "2026-07-06T00:00:00.000Z",
    viewerOut,
    reportOut,
    tsvOut,
  });

  assert.equal(audit.summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /field-reader-downstream-accessor-only/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /resolvedVtableFunctionClass/);

  const [row] = readTsv(tsvOut);
  assert.equal(row.status, "field-reader-downstream-accessor-only");
  assert.equal(row.primaryVtableAddressHex, "0x5110");
  assert.equal(row.resolvedVtableFunctionHex, "0x6000");
  assert.equal(row.resolvedVtableFunctionClass, "accessor-add-x0");
  assert.equal(row.renderPromotionAllowed, "false");
});
