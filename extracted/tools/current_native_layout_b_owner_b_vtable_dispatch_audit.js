#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-owner-b-vtable-dispatch-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_owner_b_vtable_dispatch_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_owner_b_vtable_dispatch_audit.tsv";

const ownerLifecycleSpecs = [
  {
    role: "owner-a-allocation-call",
    address: 0xe3ccf4,
    expectedOpcodeHex: "97e5631b",
    evidence: "Runtime setup allocates owner slot A, the large backing owner stored at global 0x311a290.",
  },
  {
    role: "owner-a-global-slot-store",
    address: 0xe3cd10,
    expectedOpcodeHex: "f9014a96",
    evidence: "Runtime setup stores owner slot A into global 0x311a290.",
  },
  {
    role: "owner-b-allocation-call",
    address: 0xe3cd14,
    expectedOpcodeHex: "97e56313",
    evidence: "Runtime setup allocates owner slot B with size 0x188.",
  },
  {
    role: "owner-b-constructor-call",
    address: 0xe3cd24,
    expectedOpcodeHex: "94000140",
    evidence: "Runtime setup calls ownerB constructor 0xe3d224 with ownerA and the setup context.",
  },
  {
    role: "owner-b-global-slot-store",
    address: 0xe3cd2c,
    expectedOpcodeHex: "f9014eb3",
    evidence: "Runtime setup stores ownerB into global 0x311a298, the slot read by layout B entry setup.",
  },
  {
    role: "owner-b-global-slot-reload",
    address: 0xe3cd4c,
    expectedOpcodeHex: "f9414ea8",
    evidence: "Runtime setup reloads ownerB from global 0x311a298 after ownerA setup.",
  },
  {
    role: "owner-b-active-byte-set",
    address: 0xe3cd50,
    expectedOpcodeHex: "39061113",
    evidence: "Runtime setup writes ownerB +0x184 = 1, enabling the active submit branch when the runtime gate is true.",
  },
  {
    role: "owner-b-teardown-vtable-load",
    address: 0xe3cd84,
    expectedOpcodeHex: "f9400008",
    evidence: "Runtime teardown loads ownerB vtable from the global slot object.",
  },
  {
    role: "owner-b-teardown-vtable-slot-0x8-load",
    address: 0xe3cd88,
    expectedOpcodeHex: "f9400508",
    evidence: "Runtime teardown loads ownerB vtable +0x8 as the destructor path.",
  },
  {
    role: "owner-b-teardown-vtable-slot-0x8-call",
    address: 0xe3cd8c,
    expectedOpcodeHex: "d63f0100",
    evidence: "Runtime teardown calls ownerB vtable +0x8 before clearing global 0x311a298.",
  },
];

const ownerConstructorSpecs = [
  {
    role: "owner-b-base-constructor-call",
    address: 0xe3d240,
    expectedOpcodeHex: "94298fac",
    evidence: "ownerB constructor calls the shared task/owner base constructor 0x18a10f0.",
  },
  {
    role: "owner-b-vtable-page",
    address: 0xe3d244,
    expectedOpcodeHex: "d000c788",
    evidence: "ownerB constructor starts materializing the vtable base page 0x272f000.",
  },
  {
    role: "owner-b-vtable-base-add",
    address: 0xe3d248,
    expectedOpcodeHex: "910a6108",
    evidence: "ownerB constructor adds 0x298, the vtable group base.",
  },
  {
    role: "owner-b-store-owner-a-and-context",
    address: 0xe3d24c,
    expectedOpcodeHex: "a9015275",
    evidence: "ownerB constructor stores constructor arguments at ownerB +0x10/+0x18.",
  },
  {
    role: "owner-b-vptr-add-runtime-offset",
    address: 0xe3d250,
    expectedOpcodeHex: "91004108",
    evidence: "ownerB constructor adds 0x10 so the runtime vptr points at 0x272f2a8.",
  },
  {
    role: "owner-b-vptr-store",
    address: 0xe3d258,
    expectedOpcodeHex: "f9000268",
    evidence: "ownerB constructor stores vptr 0x272f2a8 at ownerB +0x0.",
  },
  {
    role: "owner-b-current-buffer-clear",
    address: 0xe3d270,
    expectedOpcodeHex: "f900be7f",
    evidence: "ownerB constructor clears ownerB +0x178, the current submit buffer pointer.",
  },
  {
    role: "owner-b-buffer-index-clear",
    address: 0xe3d274,
    expectedOpcodeHex: "b901827f",
    evidence: "ownerB constructor clears ownerB +0x180, the rotating submit-buffer index.",
  },
  {
    role: "owner-b-active-byte-clear",
    address: 0xe3d278,
    expectedOpcodeHex: "3906127f",
    evidence: "ownerB constructor clears ownerB +0x184 before setup later enables it.",
  },
];

const vtableSlotSpecs = [
  {
    role: "owner-b-vtable-slot-0x0-destructor",
    address: 0x272f2a8,
    expectedPointer: 0xe3d37c,
    evidence: "ownerB vptr slot +0x0 points to the non-deleting destructor.",
  },
  {
    role: "owner-b-vtable-slot-0x8-deleting-destructor",
    address: 0x272f2b0,
    expectedPointer: 0xe3d3dc,
    evidence: "ownerB vptr slot +0x8 matches the teardown call path.",
  },
  {
    role: "owner-b-vtable-slot-0x10-render-build",
    address: 0x272f2b8,
    expectedPointer: 0xe3d400,
    evidence: "ownerB vptr slot +0x10 is the composite dispatch callback reached from entry +0x8.",
  },
  {
    role: "owner-b-vtable-slot-0x18-rotate-buffer",
    address: 0x272f2c0,
    expectedPointer: 0xe3d610,
    evidence: "ownerB vptr slot +0x18 rotates the triple submit buffer and resets ownerB +0x170.",
  },
  {
    role: "owner-b-vtable-slot-0x20-flush-buffer",
    address: 0x272f2c8,
    expectedPointer: 0xe3d68c,
    evidence: "ownerB vptr slot +0x20 flushes the current submit buffer.",
  },
];

const ownerDispatchSpecs = [
  [0xe3d418, "owner-b-arg0-save", "aa0003f4", "0xe3d400 saves ownerB from x0."],
  [0xe3d41c, "owner-b-context-load", "f9400c00", "0xe3d400 reads ownerB +0x18 before checking runtime state."],
  [0xe3d420, "owner-b-task-tail-save", "aa0503f3", "0xe3d400 saves composite-dispatch x5 for the final 0x18a15c8 call."],
  [0xe3d424, "owner-b-entry-save", "aa0403f6", "0xe3d400 saves x4 entry from composite dispatch."],
  [0xe3d434, "entry-pointer-minus-0x8-provider-load", "f85f8ec8", "The callback rewinds x4 entry by 8 and loads its provider vtable."],
  [0xe3d438, "entry-provider-vtable-slot-0x10-load", "f9400908", "The callback loads provider vtable +0x10 from the x4 entry provider."],
  [0xe3d43c, "entry-provider-this-arg", "aa1603e0", "The callback passes the rewound x4 entry as provider this."],
  [0xe3d440, "entry-provider-vtable-slot-0x10-call", "d63f0100", "The x4 entry provider vtable +0x10 call returns the target handle for payload lookup."],
  [0xe3d444, "entry-provider-vtable-reload", "f94002c8", "The callback reloads the x4 entry provider vtable for the second provider call."],
  [0xe3d450, "entry-provider-vtable-slot-0x18-load", "f9400d08", "The callback loads provider vtable +0x18 to fetch the transform/payload source."],
  [0xe3d454, "entry-provider-vtable-slot-0x18-call", "d63f0100", "The second provider call returns the transform/payload source forwarded to 0xe3d184."],
  [0xe3d460, "target-count-helper-call", "97fff42a", "0xe3d400 calls 0xe3a508, which reads target +0x78 as the active payload count."],
  [0xe3d464, "target-count-save", "2a0003f8", "The active target count is saved for batch allocation and record metadata."],
  [0xe3d46c, "owner-b-buffer-index-load", "b9418288", "0xe3d400 reads ownerB +0x180 to pick the current submit buffer."],
  [0xe3d470, "owner-b-owner-a-load", "f9400a80", "0xe3d400 reads ownerB +0x10, the ownerA/backing allocator used by 0xe3ce14."],
  [0xe3d480, "owner-b-submit-buffer-select", "91008102", "0xe3d400 computes the active ownerB submit-buffer subobject at +0x20 + index*0x70."],
  [0xe3d484, "transform-record-build-call", "97ffff40", "0xe3d400 calls 0xe3d184 to build a transform record from the entry provider result."],
  [0xe3d498, "payload-record-allocator-call", "97fffe5f", "0xe3d400 calls 0xe3ce14(ownerA, targetCount) to allocate payload records."],
  [0xe3d49c, "transform-record-payload-store", "f90036c0", "0xe3d400 stores the payload-record pointer at transform record +0x68."],
  [0xe3d4a0, "transform-record-count-store", "b90072d8", "0xe3d400 stores target count at transform record +0x70."],
  [0xe3d4b0, "target-first-payload-call", "97fff40c", "0xe3d400 calls 0xe3a4e0 to fetch the first payload node from target +0x68."],
  [0xe3d4c4, "payload-node-primitive-count-load", "b9420028", "The payload loop reads node +0x200 as primitive count."],
  [0xe3d4c8, "payload-node-empty-skip", "34000388", "The payload loop skips empty payload nodes before submit record accounting."],
  [0xe3d4d0, "payload-node-mode-low-nibble", "12000d2a", "The payload loop decodes node +0x220 low-nibble mode for primitive count calculation."],
  [0xe3d4e8, "payload-node-mode-dispatch", "d61f0140", "The payload loop dispatches by decoded primitive mode."],
  [0xe3d538, "owner-b-record-cursor-load", "b941728a", "The payload loop reads ownerB +0x170 as the current submit-record cursor."],
  [0xe3d548, "payload-node-count-next-helper-this", "aa1503e0", "The payload loop prepares target handle for 0xe3a4f4 next-node lookup."],
  [0xe3d550, "payload-record-start-store", "790012ea", "The payload loop stores record start at payload record +0x8."],
  [0xe3d554, "payload-record-count-store", "790016e8", "The payload loop stores record count at payload record +0xa."],
  [0xe3d558, "owner-b-record-cursor-store", "b9017289", "The payload loop advances ownerB +0x170 by the calculated primitive count."],
  [0xe3d55c, "target-next-payload-call", "97fff3e6", "The payload loop calls 0xe3a4f4 to advance through target payload nodes."],
  [0xe3d56c, "owner-b-current-buffer-load", "f940be88", "0xe3d400 reloads ownerB +0x178 to locate the final submit record span."],
  [0xe3d570, "owner-b-context-for-camera-a", "f9400e80", "0xe3d400 reads ownerB +0x18 before fetching one runtime camera/transform pointer."],
  [0xe3d580, "owner-b-runtime-pointer-a-call", "97fff818", "0xe3d400 calls 0xe3b5e0 for one runtime pointer used by submit."],
  [0xe3d590, "owner-b-runtime-pointer-b-call", "97fff812", "0xe3d400 calls 0xe3b5d8 for the second runtime pointer used by submit."],
  [0xe3d594, "owner-b-active-byte-load", "39461288", "0xe3d400 reads ownerB +0x184 to choose active or fallback submit path."],
  [0xe3d5a0, "owner-b-active-gate-call", "97fffcdb", "If ownerB +0x184 is set, 0xe3d400 calls 0xe3c90c as the active submit gate."],
  [0xe3d5a8, "owner-b-owner-a-arg-for-active-submit", "f9400a84", "The active submit branch loads ownerA from ownerB +0x10 for 0xe3cb54."],
  [0xe3d5bc, "owner-b-active-submit-call", "97fffd66", "The active branch calls 0xe3cb54, which builds an async/deferred submit record."],
  [0xe3d5dc, "owner-b-fallback-submit-target-arg", "aa1503e0", "The fallback branch prepares the same target handle for direct submit."],
  [0xe3d5ec, "owner-b-fallback-submit-call", "97fff1a9", "The fallback branch calls 0xe39c90, the direct primitive submit path."],
  [0xe3d5f0, "owner-b-composite-tail-arg", "aa1303e0", "After either submit branch, 0xe3d400 restores the composite task tail argument."],
  [0xe3d60c, "owner-b-composite-tail-call", "14298fef", "0xe3d400 tail-calls 0x18a15c8 to complete composite dispatch for the entry."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const submitPathSpecs = [
  [0xe3cb54, "active-submit-record-prologue", "f81c0ff7", "0xe3cb54 is the active/deferred submit function reached from ownerB."],
  [0xe3cbb8, "active-submit-store-target-and-runtime", "a9005457", "0xe3cb54 stores target/runtime pointers into a submit record."],
  [0xe3cbbc, "active-submit-copy-transform-q0", "3dc00e80", "0xe3cb54 copies transform payload from its x3 record argument."],
  [0xe3cbf0, "active-submit-store-owner-a", "f9002853", "0xe3cb54 stores ownerA/backing pointer into the deferred record."],
  [0xe3cc0c, "active-submit-enqueue-tailcall", "17fcfd4b", "0xe3cb54 enqueues the deferred record through the shared runtime queue."],
  [0xe3cc10, "active-submit-thunk-load-target-runtime", "a9400808", "The active submit thunk reloads target/runtime pointers from the deferred record."],
  [0xe3cc20, "active-submit-thunk-tail-fallback-submit", "17fff41c", "The active submit thunk tail-calls 0xe39c90 with the deferred record unpacked."],
  [0xe39c90, "fallback-submit-prologue", "d10703ff", "0xe39c90 is the direct primitive submit path used when active/deferred submit is disabled."],
  [0xe39ccc, "fallback-submit-record-target-load", "f9400068", "0xe39c90 copies the submit record target pointer from x3."],
  [0xe39d04, "fallback-submit-target-payload-load", "f9403408", "0xe39c90 starts from target +0x68 and walks payload nodes."],
  [0xe39d10, "fallback-submit-payload-node-base", "d10b0114", "0xe39c90 normalizes payload node pointers by subtracting 0x2c0."],
  [0xe39d80, "fallback-submit-node-primitive-count-load", "b9420281", "0xe39c90 reads node +0x200 as primitive count."],
  [0xe39d88, "fallback-submit-node-flags-load", "b9422288", "0xe39c90 reads node +0x220, the primitive mode/flags word."],
  [0xe39da4, "fallback-submit-node-mode-dispatch", "d61f0120", "0xe39c90 dispatches to mode-specific primitive submit builders."],
  [0xe39e0c, "fallback-submit-mode-builder-a-call", "9400188e", "One fallback mode calls primitive builder 0xe40044."],
  [0xe39f84, "fallback-submit-mode-builder-b-call", "940015f5", "One fallback mode calls primitive builder 0xe3f758."],
  [0xe3a370, "fallback-submit-next-result-save", "aa0003f5", "0xe39c90 keeps the mode builder result before walking the next payload node."],
  [0xe3a4e0, "target-first-payload-helper", "f9403408", "0xe3a4e0 returns target +0x68 - 0x2c0 as the first payload node."],
  [0xe3a4f4, "target-next-payload-helper", "f9416028", "0xe3a4f4 returns node +0x2c0 - 0x2c0 as the next payload node."],
  [0xe3a508, "target-count-helper", "b9407800", "0xe3a508 reads target +0x78 as the active payload count."],
  [0xe3ce14, "payload-record-allocator-prologue", "f81e0ff3", "0xe3ce14 allocates payload records from ownerA/backing storage."],
  [0xe3ce48, "payload-record-allocator-pack-count", "331c6c28", "0xe3ce14 packs the target count into the allocation tag."],
  [0xe3ce58, "payload-record-allocator-call", "97ff2d04", "0xe3ce14 calls the shared allocator for the payload record span."],
  [0xe3ce68, "payload-record-allocator-align", "927df100", "0xe3ce14 aligns the returned payload record pointer."],
  [0xe3d610, "owner-b-rotate-buffer-prologue", "f81d0ff5", "ownerB vtable +0x18 starts the rotating submit-buffer update path."],
  [0xe3d650, "owner-b-rotate-buffer-index-store", "b9018008", "ownerB vtable +0x18 stores the next rotating buffer index at ownerB +0x180."],
  [0xe3d65c, "owner-b-rotate-buffer-reset-call-arg", "52800621", "ownerB vtable +0x18 prepares reset opcode 0x31 for the selected submit buffer."],
  [0xe3d674, "owner-b-current-buffer-store-source", "f9400d08", "ownerB vtable +0x18 loads selected buffer +0x18 before storing ownerB +0x178."],
  [0xe3d68c, "owner-b-flush-buffer-prologue", "f81e0ff3", "ownerB vtable +0x20 starts the current-buffer flush path."],
  [0xe3d69c, "owner-b-flush-clear-current-buffer", "f900bc1f", "ownerB vtable +0x20 clears ownerB +0x178 before flushing."],
  [0xe3d6c4, "owner-b-flush-buffer-opcode-arg", "52800621", "ownerB vtable +0x20 prepares reset/flush opcode 0x31 for the selected submit buffer."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

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
      expectedPointerHex: "",
      actualPointerHex: "",
      pointerMatches: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function pointerRowsForSpecs(buffer, elf, stage, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 8);
    const actualPointer = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : null;
    return {
      stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      expectedPointerHex: hex(spec.expectedPointer),
      actualPointerHex: actualPointer == null ? "" : hex(actualPointer),
      pointerMatches: actualPointer === spec.expectedPointer,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function rowsContain(rows, role) {
  return rows.some((row) => row.role === role);
}

function buildCurrentNativeLayoutBOwnerBVtableDispatchAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const ownerLifecycleRows = opcodeRowsForSpecs(buffer, elf, "owner-lifecycle", ownerLifecycleSpecs);
  const ownerConstructorRows = opcodeRowsForSpecs(buffer, elf, "owner-constructor", ownerConstructorSpecs);
  const vtableSlotRows = pointerRowsForSpecs(buffer, elf, "owner-vtable-slots", vtableSlotSpecs);
  const ownerDispatchRows = opcodeRowsForSpecs(buffer, elf, "owner-vtable-slot-0x10-dispatch", ownerDispatchSpecs);
  const submitPathRows = opcodeRowsForSpecs(buffer, elf, "owner-submit-paths", submitPathSpecs);
  const opcodeRows = [...ownerLifecycleRows, ...ownerConstructorRows, ...ownerDispatchRows, ...submitPathRows];
  const pointerRows = vtableSlotRows;
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const pointerMismatchRows = countRows(pointerRows, (row) => !row.pointerMatches);
  const allRowsMatch = opcodeMismatchRows === 0 && pointerMismatchRows === 0;
  const ownerBGlobalSlotRecovered =
    allRowsMatch &&
    rowsContain(ownerLifecycleRows, "owner-b-global-slot-store") &&
    rowsContain(ownerLifecycleRows, "owner-b-active-byte-set");
  const ownerBVtableSlot10Recovered =
    allRowsMatch &&
    vtableSlotRows.some(
      (row) => row.role === "owner-b-vtable-slot-0x10-render-build" && row.actualPointerHex === "0xe3d400",
    ) &&
    rowsContain(ownerDispatchRows, "owner-b-entry-save");
  const entryTransformProviderRecovered =
    allRowsMatch &&
    rowsContain(ownerDispatchRows, "entry-pointer-minus-0x8-provider-load") &&
    rowsContain(ownerDispatchRows, "entry-provider-vtable-slot-0x10-call") &&
    rowsContain(ownerDispatchRows, "entry-provider-vtable-slot-0x18-call");
  const payloadBatchSubmitBridgeRecovered =
    allRowsMatch &&
    rowsContain(ownerDispatchRows, "transform-record-build-call") &&
    rowsContain(ownerDispatchRows, "payload-record-allocator-call") &&
    rowsContain(ownerDispatchRows, "payload-record-count-store") &&
    rowsContain(ownerDispatchRows, "owner-b-record-cursor-store");
  const submitPathSplitRecovered =
    allRowsMatch &&
    rowsContain(ownerDispatchRows, "owner-b-active-byte-load") &&
    rowsContain(ownerDispatchRows, "owner-b-active-submit-call") &&
    rowsContain(ownerDispatchRows, "owner-b-fallback-submit-call") &&
    rowsContain(submitPathRows, "active-submit-thunk-tail-fallback-submit") &&
    rowsContain(submitPathRows, "fallback-submit-node-mode-dispatch");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only ownerB vtable dispatch audit; proves entry owner slot B reaches concrete submit branches but does not enable PFX rendering takeover",
    summary: {
      ownerLifecycleRows: ownerLifecycleRows.length,
      ownerConstructorRows: ownerConstructorRows.length,
      vtableSlotRows: vtableSlotRows.length,
      ownerDispatchRows: ownerDispatchRows.length,
      submitPathRows: submitPathRows.length,
      opcodeRows: opcodeRows.length,
      pointerRows: pointerRows.length,
      opcodeMismatchRows,
      pointerMismatchRows,
      ownerBGlobalSlotRecovered,
      ownerBVtableSlot10Recovered,
      entryTransformProviderRecovered,
      payloadBatchSubmitBridgeRecovered,
      submitPathSplitRecovered,
      primitiveFormulaRecovered: false,
      materialFormulaRecovered: false,
      renderPromotionAllowedRows: countRows([...opcodeRows, ...pointerRows], (row) => row.renderPromotionAllowed),
    },
    interpretation: {
      ownerBSource:
        "Runtime setup 0xe3ccd0 allocates ownerB, constructs it through 0xe3d224, stores it at global 0x311a298, and later layout B entry setup reads the same slot through 0xe3cdfc.",
      slot10Dispatch:
        "ownerB constructor stores vptr 0x272f2a8; vtable slot +0x10 is 0xe3d400, the callback invoked by composite dispatch after loading owner from entry +0x8.",
      entryAndPayload:
        "0xe3d400 rewinds the x4 entry by 8, calls entry provider vtable +0x10/+0x18, reads target +0x78 as payload count, allocates payload records through ownerA, and walks target payload nodes.",
      submitSplit:
        "ownerB +0x184 and gate 0xe3c90c choose either active/deferred submit 0xe3cb54 or direct fallback submit 0xe39c90. Both paths still converge on primitive-mode builders below 0xe39c90.",
      boundary:
        "This closes ownerB dispatch and submit-branch shape only. It still does not identify the exact primitive/material/shader formulas for each node +0x220 mode.",
    },
    unresolved: [
      "the exact primitive builder semantics under 0xe39c90 mode calls such as 0xe40044, 0xe3f758, and sibling branches",
      "the material/shader/texture binding formula for payload nodes addressed through node +0x200/+0x220",
      "the timeline/action path that decides when ownerB +0x184 active submit should be visible for each effect",
    ],
    ownerLifecycleRows,
    ownerConstructorRows,
    vtableSlotRows,
    ownerDispatchRows,
    submitPathRows,
  };
}

function exportCurrentNativeLayoutBOwnerBVtableDispatchAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBOwnerBVtableDispatchAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.ownerLifecycleRows,
      ...manifest.ownerConstructorRows,
      ...manifest.vtableSlotRows,
      ...manifest.ownerDispatchRows,
      ...manifest.submitPathRows,
    ],
    [
      "stage",
      "role",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "expectedPointerHex",
      "actualPointerHex",
      "pointerMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBOwnerBVtableDispatchAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBOwnerBVtableDispatchAudit,
  exportCurrentNativeLayoutBOwnerBVtableDispatchAudit,
};
