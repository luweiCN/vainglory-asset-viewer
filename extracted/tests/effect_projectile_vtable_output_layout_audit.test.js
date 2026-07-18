const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileVtableOutputLayoutAudit,
  exportProjectileVtableOutputLayoutAudit,
  extractOutputWrites,
  readTsv,
} = require("../tools/effect_projectile_vtable_output_layout_audit");
const { parseObjdumpFunctionInstructions } = require("../tools/effect_projectile_vtable_function_audit");

test("extractOutputWrites records immediate post-increment output stores", () => {
  const instructions = parseObjdumpFunctionInstructions(
    `
  1436fe0:       mov     w8, #0xcccd
  1436fe4:       movk    w8, #0x3e4c, lsl #16
  1436ff0:       str     w8, [x1], #0x4
  1436ff4:       ret
`,
    "0x1436fe0",
  );

  const writes = extractOutputWrites(instructions);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].writeKind, "post-increment-store");
  assert.equal(writes[0].sourceRegister, "w8");
  assert.equal(writes[0].baseRegister, "x1");
  assert.equal(writes[0].postIncrementHex, "0x4");
  assert.equal(writes[0].valueClass, "immediate");
  assert.equal(writes[0].valueImmediateHex, "0x3e4ccccd");
});

test("extractOutputWrites follows x1 aliases and fixed offsets", () => {
  const instructions = parseObjdumpFunctionInstructions(
    `
  123ce94:       mov     x20, x1
  123cea8:       fadd    s0, s0, s9
  123ceb0:       str     s0, [x20], #0x4
  123ceb4:       str     wzr, [x20, #0x8]
  123ceb8:       ret
`,
    "0x123ce94",
  );

  const writes = extractOutputWrites(instructions);

  assert.equal(writes.length, 2);
  assert.deepEqual(
    writes.map((write) => write.writeKind),
    ["post-increment-store", "fixed-offset-store"],
  );
  assert.equal(writes[0].baseRegister, "x20");
  assert.equal(writes[0].baseIsX1Alias, true);
  assert.equal(writes[0].valueClass, "computed-float");
  assert.equal(writes[1].fixedOffsetHex, "0x8");
  assert.equal(writes[1].valueClass, "zero-register");
});

test("extractOutputWrites records memset zero output helpers", () => {
  const instructions = parseObjdumpFunctionInstructions(
    `
  fae198:       mov     w8, w19
  fae19c:       lsl     x2, x8, #2
  fae1a0:       mov     x0, x1
  fae1a4:       mov     w1, wzr
  fae1a8:       bl      0x795210 <memset@plt>
  fae1ac:       ret
`,
    "0xfae198",
  );

  const writes = extractOutputWrites(instructions);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].writeKind, "helper-memset-zero");
  assert.equal(writes[0].valueClass, "zero-helper");
  assert.equal(writes[0].helperName, "memset@plt");
});

test("projectile vtable output layout audit exports diagnostic output writes only", () => {
  const audit = buildProjectileVtableOutputLayoutAudit({
    vtableFunctionAudit: {
      items: [
        {
          functionAddressHex: "0x1436fe0",
          structuralClass: "output-writer-unclassified",
          slotRows: 10,
          effectTokens: ["Effect_A"],
          resolvedSlotOffsets: ["0x80"],
        },
        {
          functionAddressHex: "0xfae198",
          structuralClass: "helper-call-function",
          slotRows: 3,
          effectTokens: ["Effect_B"],
          resolvedSlotOffsets: ["0x20"],
        },
      ],
    },
    disassembleFunction: (addressHex) =>
      addressHex === "0x1436fe0"
        ? `
  1436fe0:       mov     w8, #0xcccd
  1436fe4:       movk    w8, #0x3e4c, lsl #16
  1436ff0:       str     w8, [x1], #0x4
  1436ff4:       ret
`
        : `
  fae19c:       lsl     x2, x8, #2
  fae1a0:       mov     x0, x1
  fae1a4:       mov     w1, wzr
  fae1a8:       bl      0x795210 <memset@plt>
  fae1ac:       ret
`,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.functions, 2);
  assert.equal(audit.summary.rows, 2);
  assert.equal(audit.summary.postIncrementStoreRows, 1);
  assert.equal(audit.summary.helperMemsetZeroRows, 1);
  assert.equal(audit.summary.immediateOutputRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.ok(audit.items.every((item) => item.renderPromotionAllowed === false));
});

test("projectile vtable output layout exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-output-layout-"));
  const vtableFunctionAuditPath = path.join(tempDir, "effect_projectile_vtable_function_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-vtable-output-layout-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_vtable_output_layout_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_vtable_output_layout_audit.tsv");

  fs.writeFileSync(
    vtableFunctionAuditPath,
    JSON.stringify({
      items: [
        {
          functionAddressHex: "0x1436fe0",
          structuralClass: "output-writer-unclassified",
          slotRows: 10,
          effectTokens: ["Effect_A"],
          resolvedSlotOffsets: ["0x80"],
        },
      ],
    }),
  );

  const summary = exportProjectileVtableOutputLayoutAudit({
    vtableFunctionAuditPath,
    viewerOut,
    reportOut,
    tsvOut,
    disassembleFunction: () => `
  1436fe0:       mov     w8, #0xcccd
  1436fe4:       movk    w8, #0x3e4c, lsl #16
  1436ff0:       str     w8, [x1], #0x4
  1436ff4:       ret
`,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /post-increment-store/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /0x3e4ccccd/);
  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].functionAddressHex, "0x1436fe0");
  assert.equal(tsvRows[0].valueImmediateHex, "0x3e4ccccd");
});
