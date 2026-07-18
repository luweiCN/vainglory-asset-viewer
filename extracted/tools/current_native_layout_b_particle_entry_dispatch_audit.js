#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-particle-entry-dispatch-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_particle_entry_dispatch_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_particle_entry_dispatch_audit.tsv";

const sharedEntryArraySpecs = [
  {
    role: "particle-entry-array-filter-mask",
    address: 0x820fd4,
    expectedOpcodeHex: "321703e1",
    evidence: "Draw all particle effects sets filter mask 0x200 before materializing manager entries.",
  },
  {
    role: "particle-entry-array-builder-call",
    address: 0x820fdc,
    expectedOpcodeHex: "9441b5ea",
    evidence: "Draw all particle effects calls 0x188e784, which reaches the shared manager entry-array builder.",
  },
  {
    role: "entry-manager-record-entry-load",
    address: 0x188f0e4,
    expectedOpcodeHex: "f940054a",
    evidence: "The shared builder loads each concrete task entry pointer from manager record +0x8.",
  },
  {
    role: "entry-manager-output-entry-store",
    address: 0x188f0e8,
    expectedOpcodeHex: "f800866a",
    evidence: "The shared builder stores each concrete entry pointer into the particle composite task entry array.",
  },
];

const particleTaskSpecs = [
  {
    role: "particle-runtime-param-accessor-call",
    address: 0x820fe8,
    expectedOpcodeHex: "9441f195",
    evidence: "Draw all particle effects calls 0x189d63c(0) to fetch the runtime-parameter slot-0 object.",
  },
  {
    role: "particle-composite-task-entry-array-arg",
    address: 0x821024,
    expectedOpcodeHex: "9104a3e2",
    evidence: "The particle draw path passes sp+0x128 as the composite task entry-array pointer.",
  },
  {
    role: "particle-composite-task-entry-count-arg",
    address: 0x821028,
    expectedOpcodeHex: "2a1603e3",
    evidence: "The particle draw path passes the filtered entry count from the shared entry-array builder as w3.",
  },
  {
    role: "particle-composite-task-runtime-param-arg",
    address: 0x82102c,
    expectedOpcodeHex: "aa1703e4",
    evidence: "The particle draw path passes the slot-0 runtime-parameter object as x4 to the batch task constructor.",
  },
  {
    role: "particle-composite-task-constructor-call",
    address: 0x821038,
    expectedOpcodeHex: "9442006b",
    evidence: "The particle draw path constructs a batch composite task through 0x18a11e4.",
  },
  {
    role: "particle-composite-task-render-queue-append",
    address: 0x821048,
    expectedOpcodeHex: "944204f4",
    evidence: "The particle draw path submits the composite task to the render queue through 0x18a2418.",
  },
];

const compositeConstructorSpecs = [
  {
    role: "composite-constructor-store-label-and-entry-array",
    address: 0x18a122c,
    expectedOpcodeHex: "a904db17",
    evidence: "Batch constructor 0x18a11e4 stores label and caller entry-array pointer at task +0x48/+0x50.",
  },
  {
    role: "composite-constructor-store-runtime-param",
    address: 0x18a1230,
    expectedOpcodeHex: "f9002f14",
    evidence: "Batch constructor stores the runtime-parameter object at task +0x58.",
  },
  {
    role: "composite-constructor-mark-external-entry-array",
    address: 0x18a1244,
    expectedOpcodeHex: "32020108",
    evidence: "Batch constructor marks task +0x88 with bit 30 so dispatch dereferences the external entry array.",
  },
  {
    role: "composite-constructor-store-flags",
    address: 0x18a1248,
    expectedOpcodeHex: "b9008b08",
    evidence: "Batch constructor stores the entry count plus external-array flag at task +0x88.",
  },
];

const compositeDispatchSpecs = [
  {
    role: "composite-dispatch-entry-array-field",
    address: 0x18a1420,
    expectedOpcodeHex: "91014017",
    evidence: "Composite dispatch starts from task +0x50, the batch entry-array field.",
  },
  {
    role: "composite-dispatch-load-external-entry-array",
    address: 0x18a1428,
    expectedOpcodeHex: "f94002f7",
    evidence: "When the external-array flag is set, composite dispatch loads the entry-array pointer from task +0x50.",
  },
  {
    role: "composite-dispatch-load-current-entry",
    address: 0x18a1494,
    expectedOpcodeHex: "f8767ae4",
    evidence: "Composite dispatch iterates the entry array and loads the current entry into x4.",
  },
  {
    role: "composite-dispatch-load-runtime-param",
    address: 0x18a1498,
    expectedOpcodeHex: "f9402e82",
    evidence: "Composite dispatch reloads task +0x58 as x2 before invoking the current entry owner.",
  },
  {
    role: "composite-dispatch-load-owner-from-entry",
    address: 0x18a14a4,
    expectedOpcodeHex: "f9400480",
    evidence: "Composite dispatch loads x0 from entry +0x8, the owner pointer installed on the manager entry.",
  },
  {
    role: "composite-dispatch-load-owner-vtable",
    address: 0x18a14ac,
    expectedOpcodeHex: "f9400008",
    evidence: "Composite dispatch loads the owner vtable after reading owner from entry +0x8.",
  },
  {
    role: "composite-dispatch-load-owner-vtable-slot-0x10",
    address: 0x18a14b0,
    expectedOpcodeHex: "f9400908",
    evidence: "Composite dispatch loads owner vtable slot +0x10 for the render/build callback.",
  },
  {
    role: "composite-dispatch-call-owner-vtable-slot-0x10",
    address: 0x18a14b4,
    expectedOpcodeHex: "d63f0100",
    evidence: "Composite dispatch calls the entry +0x8 owner vtable +0x10 with x2 from task +0x58 and x4 as the entry.",
  },
];

const layoutBEntryBridgeSpecs = [
  {
    role: "layout-b-entry-owner-slot-b-accessor-call",
    address: 0x8d2d54,
    expectedOpcodeHex: "9415a82a",
    evidence: "Layout B constructor calls 0xe3cdfc to read owner slot B for the inline entry object.",
  },
  {
    role: "layout-b-entry-owner-store-entry-plus-0x8",
    address: 0x8d2d64,
    expectedOpcodeHex: "f9001e60",
    evidence: "Layout B constructor stores owner slot B into object+0x38, which is inline entry +0x8.",
  },
  {
    role: "layout-b-register-entry-pointer-object-plus-0x30",
    address: 0x8d3a20,
    expectedOpcodeHex: "9100c283",
    evidence: "Layout B registration passes object+0x30 as the concrete manager entry pointer.",
  },
  {
    role: "manager-add-store-entry-pointer-record-plus-0x8",
    address: 0x188ef70,
    expectedOpcodeHex: "f90006d3",
    evidence: "Manager add-record stores the caller-provided object+0x30 entry pointer into manager record +0x8.",
  },
];

const entryHelperDispatchSpecs = [
  {
    role: "entry-primary-table-source-object-plus-0x58",
    address: 0xd7fc64,
    expectedOpcodeHex: "91016008",
    evidence: "The entry primary table slot prepares x0 = object +0x58 before global helper dispatch.",
  },
  {
    role: "entry-primary-table-payload-object-plus-0x40",
    address: 0xd7fc68,
    expectedOpcodeHex: "91010002",
    evidence: "The entry primary table slot prepares x2 = object +0x40 before global helper dispatch.",
  },
  {
    role: "entry-primary-table-global-helper-dispatch",
    address: 0xd7fc70,
    expectedOpcodeHex: "142c4290",
    evidence: "The entry primary table slot tail-branches to global helper dispatch thunk 0x18906b0.",
  },
  {
    role: "global-helper-dispatch-load-helper",
    address: 0x18906b4,
    expectedOpcodeHex: "f9470108",
    evidence: "Global helper dispatch loads the active helper object from global slot 0x311ae00.",
  },
  {
    role: "global-helper-dispatch-tailcall",
    address: 0x18906c8,
    expectedOpcodeHex: "140000a4",
    evidence: "Global helper dispatch tail-calls 0x1890958 with entry object +0x58 and +0x40 payload arguments.",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function opcodeRowsForSpecs(buffer, elf, stage, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBParticleEntryDispatchAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const sharedEntryArrayRows = opcodeRowsForSpecs(buffer, elf, "shared-entry-array", sharedEntryArraySpecs);
  const particleTaskRows = opcodeRowsForSpecs(buffer, elf, "particle-task", particleTaskSpecs);
  const compositeConstructorRows = opcodeRowsForSpecs(buffer, elf, "composite-constructor", compositeConstructorSpecs);
  const compositeDispatchRows = opcodeRowsForSpecs(buffer, elf, "composite-dispatch", compositeDispatchSpecs);
  const layoutBEntryBridgeRows = opcodeRowsForSpecs(buffer, elf, "layout-b-entry-bridge", layoutBEntryBridgeSpecs);
  const entryHelperDispatchRows = opcodeRowsForSpecs(buffer, elf, "entry-helper-dispatch", entryHelperDispatchSpecs);
  const opcodeRows = [
    ...sharedEntryArrayRows,
    ...particleTaskRows,
    ...compositeConstructorRows,
    ...compositeDispatchRows,
    ...layoutBEntryBridgeRows,
    ...entryHelperDispatchRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const particleCompositeDispatchRecovered =
    opcodeMismatchRows === 0 &&
    particleTaskRows.some((row) => row.role === "particle-composite-task-constructor-call") &&
    compositeConstructorRows.some((row) => row.role === "composite-constructor-store-runtime-param") &&
    compositeDispatchRows.some((row) => row.role === "composite-dispatch-call-owner-vtable-slot-0x10");
  const managerEntryToOwnerVtableRecovered =
    opcodeMismatchRows === 0 &&
    sharedEntryArrayRows.some((row) => row.role === "entry-manager-record-entry-load") &&
    compositeDispatchRows.some((row) => row.role === "composite-dispatch-load-owner-from-entry") &&
    compositeDispatchRows.some((row) => row.role === "composite-dispatch-call-owner-vtable-slot-0x10");
  const layoutBEntryToCompositeDispatchBridgeRecovered =
    opcodeMismatchRows === 0 &&
    layoutBEntryBridgeRows.some((row) => row.role === "layout-b-register-entry-pointer-object-plus-0x30") &&
    layoutBEntryBridgeRows.some((row) => row.role === "manager-add-store-entry-pointer-record-plus-0x8") &&
    sharedEntryArrayRows.some((row) => row.role === "entry-manager-record-entry-load") &&
    compositeDispatchRows.some((row) => row.role === "composite-dispatch-load-current-entry");
  const globalHelperDispatchLinked =
    opcodeMismatchRows === 0 &&
    entryHelperDispatchRows.some((row) => row.role === "entry-primary-table-global-helper-dispatch") &&
    entryHelperDispatchRows.some((row) => row.role === "global-helper-dispatch-tailcall");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B particle entry dispatch audit; proves filtered particle entries reach owner vtable dispatch but does not enable PFX rendering takeover",
    summary: {
      sharedEntryArrayRows: sharedEntryArrayRows.length,
      particleTaskRows: particleTaskRows.length,
      compositeConstructorRows: compositeConstructorRows.length,
      compositeDispatchRows: compositeDispatchRows.length,
      layoutBEntryBridgeRows: layoutBEntryBridgeRows.length,
      entryHelperDispatchRows: entryHelperDispatchRows.length,
      opcodeRows: opcodeRows.length,
      opcodeMismatchRows,
      particleCompositeDispatchRecovered,
      layoutBEntryToCompositeDispatchBridgeRecovered,
      managerEntryToOwnerVtableRecovered,
      globalHelperDispatchLinked,
      renderPromotionAllowedRows: 0,
    },
    interpretation: {
      entrySource:
        "Draw all particle effects filters manager backing records with mask 0x200, then 0x188f03c maps each passing manager index back to manager record +0x8.",
      compositeDispatch:
        "Batch composite task 0x18a11e4 stores the filtered entry array at task +0x50 and runtime parameter object at task +0x58; dispatch 0x18a13fc calls entry +0x8 owner vtable +0x10.",
      layoutBBridge:
        "Layout B registers object+0x30 as the manager entry pointer, so a passing particle entry can be the same inline entry object registered by layout B.",
      boundary:
        "This closes dispatch shape only. It still does not identify the semantic producer of layout B object+0xac bit 0x200 or the concrete PFX material/primitive formulas.",
    },
    unresolved: [
      "the exact semantic producer that writes layout B object+0xac with particle mask bit 0x200",
      "the concrete PFX/emitter material, shader, primitive, and timeline formulas after owner vtable +0x10",
      "the skill/action timeline path that decides when a KindredEffects target is active in the particle draw batch",
    ],
    sharedEntryArrayRows,
    particleTaskRows,
    compositeConstructorRows,
    compositeDispatchRows,
    layoutBEntryBridgeRows,
    entryHelperDispatchRows,
  };
}

function exportCurrentNativeLayoutBParticleEntryDispatchAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBParticleEntryDispatchAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.sharedEntryArrayRows,
      ...manifest.particleTaskRows,
      ...manifest.compositeConstructorRows,
      ...manifest.compositeDispatchRows,
      ...manifest.layoutBEntryBridgeRows,
      ...manifest.entryHelperDispatchRows,
    ],
    [
      "stage",
      "role",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBParticleEntryDispatchAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBParticleEntryDispatchAudit,
  exportCurrentNativeLayoutBParticleEntryDispatchAudit,
};
