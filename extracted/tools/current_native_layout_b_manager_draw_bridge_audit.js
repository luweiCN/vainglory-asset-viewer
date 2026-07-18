#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-manager-draw-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_manager_draw_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_manager_draw_bridge_audit.tsv";

const layoutBRegisterFlagSpecs = [
  {
    role: "layout-b-slot0-entry",
    address: 0x8d310c,
    expectedOpcodeHex: "d0011081",
    evidence: "layout B slot0 callback entry starts the registration path that forwards object flags.",
  },
  {
    role: "layout-b-slot0-load-object-ac-flags",
    address: 0x8d3110,
    expectedOpcodeHex: "b940ac02",
    evidence: "layout B slot0 loads flags from object+0xac before branching into the manager registration body.",
  },
  {
    role: "layout-b-slot0-branch-register-body",
    address: 0x8d3118,
    expectedOpcodeHex: "1400021d",
    evidence: "layout B slot0 branches to 0x8d398c, the shared manager registration body.",
  },
  {
    role: "layout-b-register-save-flags",
    address: 0x8d3a00,
    expectedOpcodeHex: "2a0203f3",
    evidence: "the registration body saves the object+0xac flags in w19 before manager add-record.",
  },
  {
    role: "layout-b-register-forward-flags-to-manager-add",
    address: 0x8d3a28,
    expectedOpcodeHex: "2a1303e2",
    evidence: "the registration body forwards the saved object+0xac flags as w2 to manager add-record 0x188eee0.",
  },
];

const managerAddRecordSpecs = [
  {
    role: "layout-b-register-entry-pointer-object-plus-0x30",
    address: 0x8d3a20,
    expectedOpcodeHex: "9100c283",
    evidence: "layout B registration passes object+0x30 as the concrete manager entry pointer.",
  },
  {
    role: "layout-b-register-call-manager-add-record",
    address: 0x8d3a2c,
    expectedOpcodeHex: "943eed2d",
    evidence: "layout B registration calls shared manager add-record 0x188eee0.",
  },
  {
    role: "manager-add-forward-record-index-to-backing",
    address: 0x188ef58,
    expectedOpcodeHex: "2a1403e3",
    evidence: "manager add-record forwards the manager record index as w3 to the backing indexed object.",
  },
  {
    role: "manager-add-load-backing-vtable",
    address: 0x188ef5c,
    expectedOpcodeHex: "f9400009",
    evidence: "manager add-record loads the backing indexed object's vtable before calling slot +0x10.",
  },
  {
    role: "manager-add-call-backing-add-record",
    address: 0x188ef64,
    expectedOpcodeHex: "d63f0120",
    evidence: "manager add-record calls the backing add-record vtable slot that stores flags and manager index.",
  },
  {
    role: "manager-add-mark-record-allocated",
    address: 0x188ef68,
    expectedOpcodeHex: "790002d5",
    evidence: "manager add-record marks the manager record allocated after the backing record is written.",
  },
  {
    role: "manager-add-store-entry-pointer-record-plus-0x8",
    address: 0x188ef70,
    expectedOpcodeHex: "f90006d3",
    evidence: "manager add-record stores the concrete entry pointer into manager record +0x8.",
  },
  {
    role: "layout-b-register-store-manager-index-object-plus-0xb0",
    address: 0x8d3a30,
    expectedOpcodeHex: "79016280",
    evidence: "layout B registration stores the returned manager index at object+0xb0 for later refresh.",
  },
];

const backingFlagFilterSpecs = [
  {
    role: "backing-record-flag-store",
    address: 0x18bf580,
    expectedOpcodeHex: "79003122",
    evidence: "backing add-record vtable slot +0x10 stores caller flags at backing record +0x18.",
  },
  {
    role: "backing-record-manager-index-store",
    address: 0x18bf584,
    expectedOpcodeHex: "79003523",
    evidence: "backing add-record vtable slot +0x10 stores the manager record index at backing record +0x1a.",
  },
  {
    role: "backing-filter-load-record-flags",
    address: 0x18bf794,
    expectedOpcodeHex: "794032e8",
    evidence: "backing filter loads backing record +0x18 flags before applying the caller mask.",
  },
  {
    role: "backing-filter-test-record-flags",
    address: 0x18bf798,
    expectedOpcodeHex: "6a14011f",
    evidence: "backing filter tests backing record +0x18 flags against the draw-batch mask.",
  },
  {
    role: "backing-filter-load-manager-index",
    address: 0x18bf7bc,
    expectedOpcodeHex: "794036e8",
    evidence: "backing filter loads backing record +0x1a manager index after a passing flag test.",
  },
  {
    role: "backing-filter-store-manager-index",
    address: 0x18bf7c4,
    expectedOpcodeHex: "780026c8",
    evidence: "backing filter writes the passing manager index into the entry-array builder's u16 index buffer.",
  },
];

const refreshPayloadSpecs = [
  {
    role: "layout-b-final-manager-global",
    address: 0x8d410c,
    expectedOpcodeHex: "943ee9b5",
    evidence: "layout B final dispatch acquires the shared manager global before refreshing the registered entry.",
  },
  {
    role: "layout-b-final-target-load",
    address: 0x8d4110,
    expectedOpcodeHex: "f9402a68",
    evidence: "layout B final dispatch loads the target object from callback object+0x50.",
  },
  {
    role: "layout-b-final-manager-index-load",
    address: 0x8d4114,
    expectedOpcodeHex: "79416273",
    evidence: "layout B final dispatch loads the stored manager index from object+0xb0.",
  },
  {
    role: "layout-b-final-target-payload-builder-call",
    address: 0x8d4120,
    expectedOpcodeHex: "941598fc",
    evidence: "layout B final dispatch calls 0xe3a510 to build the target payload pointer.",
  },
  {
    role: "layout-b-refresh-payload-target-plus-0x40",
    address: 0x8d4124,
    expectedOpcodeHex: "aa0003e2",
    evidence: "layout B final dispatch forwards the target+0x40 payload pointer as x2 to manager refresh.",
  },
  {
    role: "layout-b-refresh-call-manager-refresh",
    address: 0x8d4134,
    expectedOpcodeHex: "943eebbb",
    evidence: "layout B final dispatch calls shared manager refresh 0x188f020 with manager index and target payload.",
  },
  {
    role: "manager-refresh-record-address",
    address: 0x188f024,
    expectedOpcodeHex: "8b21300a",
    evidence: "manager refresh materializes manager record address as manager +0x10 + index*16.",
  },
  {
    role: "manager-refresh-backing-record-index-load",
    address: 0x188f028,
    expectedOpcodeHex: "79402541",
    evidence: "manager refresh loads the backing record index from manager record +0x12 before vtable dispatch.",
  },
  {
    role: "manager-refresh-vtable-slot-0x20-branch",
    address: 0x188f038,
    expectedOpcodeHex: "d61f0080",
    evidence: "manager refresh branches through backing vtable slot +0x20 while preserving x2 as the target+0x40 payload.",
  },
];

const backingPayloadApplySpecs = [
  {
    role: "backing-refresh-record-base",
    address: 0x18bf5e4,
    expectedOpcodeHex: "91004008",
    evidence: "backing vtable +0x20 computes the backing record base at object+0x10 before optional payload/flag updates.",
  },
  {
    role: "backing-refresh-payload-null-gate",
    address: 0x18bf5ec,
    expectedOpcodeHex: "b40000e2",
    evidence: "backing vtable +0x20 skips payload copy when x2 payload is null.",
  },
  {
    role: "backing-refresh-payload-qword-load",
    address: 0x18bf5f0,
    expectedOpcodeHex: "f940084a",
    evidence: "backing vtable +0x20 reads a qword from the x2 payload path.",
  },
  {
    role: "backing-refresh-payload-qword-store",
    address: 0x18bf5fc,
    expectedOpcodeHex: "f900096a",
    evidence: "backing vtable +0x20 stores the qword from the x2 payload into the computed backing record payload slot.",
  },
  {
    role: "backing-refresh-payload-vector-load",
    address: 0x18bf600,
    expectedOpcodeHex: "3dc00040",
    evidence: "backing vtable +0x20 reads the vector portion from the x2 payload.",
  },
  {
    role: "backing-refresh-payload-vector-store",
    address: 0x18bf604,
    expectedOpcodeHex: "3d800160",
    evidence: "backing vtable +0x20 stores the vector portion from the x2 payload into the computed backing record payload slot.",
  },
];

const backingFlagRefreshSpecs = [
  {
    role: "backing-refresh-flags-null-gate",
    address: 0x18bf608,
    expectedOpcodeHex: "b40000a3",
    evidence: "backing vtable +0x20 skips flag refresh when x3 flag pointer is null.",
  },
  {
    role: "backing-refresh-flags-load",
    address: 0x18bf60c,
    expectedOpcodeHex: "7940006a",
    evidence: "backing vtable +0x20 loads refreshed 16-bit flags from caller x3.",
  },
  {
    role: "backing-refresh-flags-store",
    address: 0x18bf618,
    expectedOpcodeHex: "7900310a",
    evidence: "backing vtable +0x20 stores refreshed flags into backing record +0x18, the same field tested by particle draw.",
  },
];

const particleDrawFilterSpecs = [
  {
    role: "particle-draw-filter-mask-0x200",
    address: 0x820fd4,
    expectedOpcodeHex: "321703e1",
    evidence: "Draw all particle effects passes filter mask 0x200 to the shared entry-array builder.",
  },
  {
    role: "particle-draw-entry-array-builder-call",
    address: 0x820fdc,
    expectedOpcodeHex: "9441b5ea",
    evidence: "Draw all particle effects calls 0x188e784 to build the filtered manager entry array.",
  },
  {
    role: "shared-entry-array-builder-tailcall",
    address: 0x188e7a0,
    expectedOpcodeHex: "14000227",
    evidence: "0x188e784 tail-calls 0x188f03c with the caller's output buffer and filter mask.",
  },
  {
    role: "entry-manager-record-entry-load",
    address: 0x188f0e4,
    expectedOpcodeHex: "f940054a",
    evidence: "the shared entry-array builder loads each concrete entry pointer from manager record +0x8.",
  },
  {
    role: "entry-manager-output-entry-store",
    address: 0x188f0e8,
    expectedOpcodeHex: "f800866a",
    evidence: "the shared entry-array builder stores concrete entries into the draw batch output array.",
  },
  {
    role: "particle-composite-task-constructor-call",
    address: 0x821038,
    expectedOpcodeHex: "9442006b",
    evidence: "Draw all particle effects constructs the composite task from the filtered entry array.",
  },
  {
    role: "particle-composite-task-render-queue-append",
    address: 0x821048,
    expectedOpcodeHex: "944204f4",
    evidence: "Draw all particle effects appends the composite task to the render queue.",
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

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function opcodeRow(buffer, elf, spec, stage) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    stage,
    role: spec.role,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBManagerDrawBridgeAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const layoutBRegisterFlagRows = layoutBRegisterFlagSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "layout-b-register-flags"),
  );
  const managerAddRecordRows = managerAddRecordSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "manager-add-record"),
  );
  const backingFlagFilterRows = backingFlagFilterSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "backing-flag-filter"),
  );
  const refreshPayloadRows = refreshPayloadSpecs.map((spec) => opcodeRow(buffer, elf, spec, "refresh-payload"));
  const backingPayloadApplyRows = backingPayloadApplySpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "backing-payload-apply"),
  );
  const backingFlagRefreshRows = backingFlagRefreshSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "backing-flag-refresh"),
  );
  const particleDrawFilterRows = particleDrawFilterSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "particle-draw-filter"),
  );
  const opcodeRows = [
    ...layoutBRegisterFlagRows,
    ...managerAddRecordRows,
    ...backingFlagFilterRows,
    ...refreshPayloadRows,
    ...backingPayloadApplyRows,
    ...backingFlagRefreshRows,
    ...particleDrawFilterRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const objectAcToBackingFlagBridgeRecovered =
    opcodeMismatchRows === 0 &&
    layoutBRegisterFlagRows.some((row) => row.role === "layout-b-slot0-load-object-ac-flags") &&
    layoutBRegisterFlagRows.some((row) => row.role === "layout-b-register-forward-flags-to-manager-add") &&
    managerAddRecordRows.some((row) => row.role === "manager-add-call-backing-add-record") &&
    backingFlagFilterRows.some((row) => row.role === "backing-record-flag-store");
  const targetPayloadRefreshBridgeRecovered =
    opcodeMismatchRows === 0 &&
    refreshPayloadRows.some((row) => row.role === "layout-b-refresh-payload-target-plus-0x40") &&
    refreshPayloadRows.some((row) => row.role === "manager-refresh-vtable-slot-0x20-branch");
  const targetPayloadApplyRecovered =
    opcodeMismatchRows === 0 &&
    backingPayloadApplyRows.some((row) => row.role === "backing-refresh-payload-null-gate") &&
    backingPayloadApplyRows.some((row) => row.role === "backing-refresh-payload-vector-store");
  const optionalFlagRefreshRecovered =
    opcodeMismatchRows === 0 &&
    backingFlagRefreshRows.some((row) => row.role === "backing-refresh-flags-null-gate") &&
    backingFlagRefreshRows.some((row) => row.role === "backing-refresh-flags-store");
  const particleDrawFilterBridgeRecovered =
    opcodeMismatchRows === 0 &&
    backingFlagFilterRows.some((row) => row.role === "backing-filter-test-record-flags") &&
    particleDrawFilterRows.some((row) => row.role === "particle-draw-filter-mask-0x200") &&
    particleDrawFilterRows.some((row) => row.role === "entry-manager-output-entry-store");
  const renderQueueAppendRecovered =
    opcodeMismatchRows === 0 &&
    particleDrawFilterRows.some((row) => row.role === "particle-composite-task-render-queue-append");
  const summary = {
    layoutBRegisterFlagRows: layoutBRegisterFlagRows.length,
    managerAddRecordRows: managerAddRecordRows.length,
    backingFlagFilterRows: backingFlagFilterRows.length,
    refreshPayloadRows: refreshPayloadRows.length,
    backingPayloadApplyRows: backingPayloadApplyRows.length,
    backingFlagRefreshRows: backingFlagRefreshRows.length,
    particleDrawFilterRows: particleDrawFilterRows.length,
    objectAcToBackingFlagBridgeRecovered,
    targetPayloadRefreshBridgeRecovered,
    targetPayloadApplyRecovered,
    optionalFlagRefreshRecovered,
    particleDrawFilterBridgeRecovered,
    renderQueueAppendRecovered,
    renderPromotionAllowedRows: 0,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B manager draw bridge audit; proves object flags and target payload reach the particle draw filter but does not enable visual takeover",
    summary,
    interpretation: {
      objectFlags:
        "layout B slot0 reads object+0xac, forwards it through manager add-record, and the backing object stores it at backing record +0x18.",
      drawFilter:
        "Draw all particle effects uses mask 0x200, the backing filter tests backing record +0x18, and passing manager entries are materialized into the draw batch.",
      targetPayload:
        "layout B final dispatch rebuilds target+0x40 and refreshes the registered manager entry through backing vtable slot +0x20. The backing implementation copies optional x2 payload data separately from optional x3 flag refresh data.",
      boundary:
        "The manager/filter bridge and backing vtable update shape are current-binary evidence. Rendering takeover remains disabled until the semantic producer for object+0xac and the concrete emitter material/primitive formula are decoded.",
    },
    unresolved: [
      "the exact semantic producer that writes the layout B object+0xac value before slot0 registration",
      "the exact semantic meaning of the copied target+0x40 payload fields inside the backing record",
      "the concrete PFX/emitter material, primitive, and timeline formulas behind the filtered draw entries",
    ],
    layoutBRegisterFlagRows,
    managerAddRecordRows,
    backingFlagFilterRows,
    refreshPayloadRows,
    backingPayloadApplyRows,
    backingFlagRefreshRows,
    particleDrawFilterRows,
  };
}

function exportCurrentNativeLayoutBManagerDrawBridgeAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBManagerDrawBridgeAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.layoutBRegisterFlagRows,
      ...manifest.managerAddRecordRows,
      ...manifest.backingFlagFilterRows,
      ...manifest.refreshPayloadRows,
      ...manifest.backingPayloadApplyRows,
      ...manifest.backingFlagRefreshRows,
      ...manifest.particleDrawFilterRows,
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
  const summary = exportCurrentNativeLayoutBManagerDrawBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBManagerDrawBridgeAudit,
  exportCurrentNativeLayoutBManagerDrawBridgeAudit,
};
