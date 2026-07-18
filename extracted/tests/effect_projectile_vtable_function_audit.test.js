const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildProjectileVtableFunctionAudit,
  classifyFunctionInstructions,
  exportProjectileVtableFunctionAudit,
  parseObjdumpFunctionInstructions,
  readTsv,
} = require("../tools/effect_projectile_vtable_function_audit");

const constantWriterDisassembly = `
0000000001787868 <callback>:
  1787868:       orr     w0, wzr, #0x1
  178786c:       str     xzr, [x1]
  1787870:       str     wzr, [x1, #0x8]
  1787874:       ret
  1787878:       orr     w0, wzr, #0x1
`;

const computedWriterDisassembly = `
0000000000e82478 <callback>:
  e82478:        cmp     w0, #0x1
  e8247c:        b.lt    0xe82494
  e82480:        ldr     s1, [x3, #0x10]
  e82484:        fdiv    s2, s0, s1
  e82488:        str     s2, [x1], #0x4
  e8248c:        ret
`;

test("parseObjdumpFunctionInstructions keeps only the requested function body", () => {
  const instructions = parseObjdumpFunctionInstructions(constantWriterDisassembly, "0x1787868");

  assert.deepEqual(
    instructions.map((instruction) => instruction.addressHex),
    ["0x1787868", "0x178786c", "0x1787870", "0x1787874"],
  );
  assert.equal(instructions.at(-1).mnemonic, "ret");
});

test("parseObjdumpFunctionInstructions preserves hex-looking mnemonics from no-raw objdump", () => {
  const instructions = parseObjdumpFunctionInstructions(
    `
  f35820:        adrp    x11, 0x1b2c000
  f35824:        add     x8, x3, #0x48, lsl #12
  f35828:        ret
`,
    "0xf35820",
  );

  assert.deepEqual(
    instructions.map((instruction) => instruction.mnemonic),
    ["adrp", "add", "ret"],
  );
});

test("classifyFunctionInstructions separates constant writers from computed output writers", () => {
  const constant = classifyFunctionInstructions(parseObjdumpFunctionInstructions(constantWriterDisassembly, "0x1787868"));
  assert.equal(constant.structuralClass, "constant-output-writer");
  assert.equal(constant.outputPointerStoreRows, 2);
  assert.equal(constant.floatingPointRows, 0);

  const computed = classifyFunctionInstructions(parseObjdumpFunctionInstructions(computedWriterDisassembly, "0xe82478"));
  assert.equal(computed.structuralClass, "computed-output-writer");
  assert.equal(computed.outputPointerStoreRows, 1);
  assert.equal(computed.floatingPointRows, 1);
  assert.equal(computed.sourcePointerReadRows, 1);
});

test("projectile vtable function audit groups resolved slot targets without render promotion", () => {
  const audit = buildProjectileVtableFunctionAudit({
    vtableSlotAudit: {
      items: [
        {
          heroNames: ["HeroA"],
          actionKeys: ["attack"],
          effectToken: "Effect_A_Shot",
          vtablePointer: "PTR_FUN_0280e370",
          requestedOffset: "0x30",
          resolvedSlotOffsetHex: "0x30",
          slotStatus: "exact-relocated-function-slot",
          resolvedFunctionAddressHex: "0x1787868",
        },
        {
          heroNames: ["HeroB"],
          actionKeys: ["ability01"],
          effectToken: "Effect_B_Shot",
          vtablePointer: "PTR_FUN_0280e370",
          requestedOffset: "0x38",
          resolvedSlotOffsetHex: "0x30",
          slotStatus: "descriptor-companion-slot",
          resolvedFunctionAddressHex: "0x1787868",
        },
        {
          heroNames: ["HeroC"],
          actionKeys: ["ability02"],
          effectToken: "Effect_C_Shot",
          vtablePointer: "PTR_FUN_0280e150",
          requestedOffset: "0x10",
          resolvedSlotOffsetHex: "0x10",
          slotStatus: "exact-relocated-function-slot",
          resolvedFunctionAddressHex: "0xe82478",
        },
      ],
    },
    textSection: { start: 0x790000, end: 0x1800000 },
    disassembleFunction: (addressHex) =>
      addressHex === "0x1787868" ? constantWriterDisassembly : computedWriterDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(audit.generatedAt, "TEST_DATE");
  assert.equal(audit.summary.rows, 2);
  assert.equal(audit.summary.sourceSlotRows, 3);
  assert.equal(audit.summary.functionsInTextRows, 2);
  assert.equal(audit.summary.constantOutputWriterRows, 1);
  assert.equal(audit.summary.computedOutputWriterRows, 1);
  assert.equal(audit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(audit.summary.byStructuralClass, {
    "computed-output-writer": 1,
    "constant-output-writer": 1,
  });

  const grouped = audit.items.find((item) => item.functionAddressHex === "0x1787868");
  assert.equal(grouped.slotRows, 2);
  assert.deepEqual(grouped.resolvedSlotOffsets, ["0x30"]);
  assert.deepEqual(grouped.slotStatuses, ["descriptor-companion-slot", "exact-relocated-function-slot"]);
  assert.deepEqual(grouped.effectTokens, ["Effect_A_Shot", "Effect_B_Shot"]);
  assert.equal(grouped.renderPromotionAllowed, false);
  assert.match(grouped.blocker, /function role is not recovered/);
});

test("projectile vtable function exporter writes viewer json, report json, and tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-projectile-vtable-function-"));
  const vtableSlotAuditPath = path.join(tempDir, "effect_projectile_vtable_slot_audit.json");
  const viewerOut = path.join(tempDir, "effect-projectile-vtable-function-audit.json");
  const reportOut = path.join(tempDir, "effect_projectile_vtable_function_audit.json");
  const tsvOut = path.join(tempDir, "effect_projectile_vtable_function_audit.tsv");

  fs.writeFileSync(
    vtableSlotAuditPath,
    JSON.stringify({
      items: [
        {
          heroNames: ["HeroA"],
          actionKeys: ["attack"],
          effectToken: "Effect_A_Shot",
          vtablePointer: "PTR_FUN_0280e370",
          requestedOffset: "0x30",
          resolvedSlotOffsetHex: "0x30",
          slotStatus: "exact-relocated-function-slot",
          resolvedFunctionAddressHex: "0x1787868",
        },
      ],
    }),
  );

  const summary = exportProjectileVtableFunctionAudit({
    vtableSlotAuditPath,
    viewerOut,
    reportOut,
    tsvOut,
    textSection: { start: 0x790000, end: 0x1800000 },
    disassembleFunction: () => constantWriterDisassembly,
    generatedAt: "TEST_DATE",
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.constantOutputWriterRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /constant-output-writer/);
  assert.match(fs.readFileSync(reportOut, "utf8"), /Effect_A_Shot/);
  const tsvRows = readTsv(tsvOut);
  assert.equal(tsvRows.length, 1);
  assert.equal(tsvRows[0].functionAddressHex, "0x1787868");
  assert.equal(tsvRows[0].structuralClass, "constant-output-writer");
});
