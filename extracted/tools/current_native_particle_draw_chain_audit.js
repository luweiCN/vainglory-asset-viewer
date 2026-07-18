#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-particle-draw-chain-audit.json";
const defaultJsonOut = "extracted/reports/current_native_particle_draw_chain_audit.json";
const defaultTsvOut = "extracted/reports/current_native_particle_draw_chain_audit.tsv";

const evidenceSpecs = [
  {
    address: 0x820fc0,
    role: "particle-source-owner-load",
    expectedOpcodeHex: "f9439ea0",
    evidence: "loads x0 from draw owner +0x738 before resolving the particle source/filter context",
  },
  {
    address: 0x820fc4,
    role: "particle-source-context-call-a",
    expectedOpcodeHex: "940279c1",
    evidence: "calls 0x8bf6c8 with owner +0x738 before the first particle context accessor",
  },
  {
    address: 0x820fc8,
    role: "particle-source-context-call-b",
    expectedOpcodeHex: "94026469",
    evidence: "calls 0x8ba16c and stores the returned pointer in x3 for entry-array filtering",
  },
  {
    address: 0x820fd0,
    role: "particle-entry-array-output-stack",
    expectedOpcodeHex: "9104a3e0",
    evidence: "sets x0 to the stack output entry array at sp+0x128",
  },
  {
    address: 0x820fd4,
    role: "particle-entry-array-filter-mask",
    expectedOpcodeHex: "321703e1",
    evidence: "sets w1 to 0x200 before calling the shared entry-array builder",
  },
  {
    address: 0x820fd8,
    role: "particle-entry-array-filter-kind",
    expectedOpcodeHex: "321f03e2",
    evidence: "sets w2 to 2 before calling the shared entry-array builder",
  },
  {
    address: 0x820fdc,
    role: "particle-entry-array-builder-call",
    expectedOpcodeHex: "9441b5ea",
    evidence: "calls 0x188e784 to build the particle draw entry array",
  },
  {
    address: 0x820fe4,
    role: "particle-runtime-param-index-zero",
    expectedOpcodeHex: "2a1f03e0",
    evidence: "sets w0 to 0 before reading runtime-parameter table slot 0",
  },
  {
    address: 0x820fe8,
    role: "particle-runtime-param-accessor-call",
    expectedOpcodeHex: "9441f195",
    evidence: "calls 0x189d63c(0), the same slot-0 runtime-parameter accessor used by scene draw batches",
  },
  {
    address: 0x821014,
    role: "particle-composite-task-label-page",
    expectedOpcodeHex: "f00093a1",
    evidence: "prepares the cstring page for the composite task label",
  },
  {
    address: 0x82101c,
    role: "particle-composite-task-label-add",
    expectedOpcodeHex: "913e5821",
    evidence: "sets x1 to cstring 0x1a98f96, decoded as Draw all particle effects",
  },
  {
    address: 0x821024,
    role: "particle-composite-task-entry-array-arg",
    expectedOpcodeHex: "9104a3e2",
    evidence: "passes the stack entry array sp+0x128 as x2 to the composite task batch constructor",
  },
  {
    address: 0x821028,
    role: "particle-composite-task-entry-count-arg",
    expectedOpcodeHex: "2a1603e3",
    evidence: "passes the entry count from 0x188e784 as w3",
  },
  {
    address: 0x82102c,
    role: "particle-composite-task-runtime-param-arg",
    expectedOpcodeHex: "aa1703e4",
    evidence: "passes runtime-parameter slot 0 object as x4",
  },
  {
    address: 0x821038,
    role: "particle-composite-task-constructor-call",
    expectedOpcodeHex: "9442006b",
    evidence: "calls batch composite-task constructor 0x18a11e4",
  },
  {
    address: 0x821048,
    role: "particle-composite-task-render-queue-append",
    expectedOpcodeHex: "944204f4",
    evidence: "appends the particle composite task to the render queue through 0x18a2418",
  },
  {
    address: 0x188e784,
    role: "shared-entry-array-forwarder-global-page",
    expectedOpcodeHex: "9000c468",
    evidence: "shared entry-array forwarder prepares global manager slot 0x311a960",
  },
  {
    address: 0x188e788,
    role: "shared-entry-array-forwarder-global-load",
    expectedOpcodeHex: "f944b108",
    evidence: "loads the global manager from 0x311a960",
  },
  {
    address: 0x188e7a0,
    role: "shared-entry-array-builder-tailcall",
    expectedOpcodeHex: "14000227",
    evidence: "tail-calls 0x188f03c with the caller-provided output array and filter arguments",
  },
  {
    address: 0x188f080,
    role: "entry-manager-capacity-vtable-slot",
    expectedOpcodeHex: "f9401d08",
    evidence: "loads manager vtable +0x38 before requesting temporary u16 index capacity",
  },
  {
    address: 0x188f0bc,
    role: "entry-manager-index-fill-vtable-slot",
    expectedOpcodeHex: "f9401508",
    evidence: "loads manager vtable +0x28 before filling the u16 index buffer",
  },
  {
    address: 0x188f0d8,
    role: "entry-manager-index-read",
    expectedOpcodeHex: "7840268a",
    evidence: "reads each u16 manager index from the temporary index buffer",
  },
  {
    address: 0x188f0e0,
    role: "entry-manager-record-address",
    expectedOpcodeHex: "8b0a110a",
    evidence: "materializes manager record address as manager +0x10 + index*16",
  },
  {
    address: 0x188f0e4,
    role: "entry-manager-record-entry-load",
    expectedOpcodeHex: "f940054a",
    evidence: "loads the concrete task entry pointer from manager record +0x8",
  },
  {
    address: 0x188f0e8,
    role: "entry-manager-output-entry-store",
    expectedOpcodeHex: "f800866a",
    evidence: "stores each concrete entry pointer into the caller's output entry array",
  },
  {
    address: 0x18bf46c,
    role: "backing-indexed-object-constructor",
    expectedOpcodeHex: "d0008fa9",
    evidence: "constructs the backing indexed object later stored at global slot 0x311a950 and passed to manager 0x311a960",
  },
  {
    address: 0x18bf478,
    role: "backing-indexed-object-vtable-store",
    expectedOpcodeHex: "91004129",
    evidence: "constructor stores vtable pointer 0x2ab5a58 on the backing indexed object",
  },
  {
    address: 0x18bf580,
    role: "backing-record-flags-store",
    expectedOpcodeHex: "79003122",
    evidence: "backing add-record vtable slot +0x10 stores caller-provided flags at backing record +0x18",
  },
  {
    address: 0x18bf584,
    role: "backing-record-manager-index-store",
    expectedOpcodeHex: "79003523",
    evidence: "backing add-record vtable slot +0x10 stores the manager record index at backing record +0x1a",
  },
  {
    address: 0x18bf760,
    role: "backing-filter-copy-filter-mask",
    expectedOpcodeHex: "2a0303f4",
    evidence: "backing filter vtable slot +0x28 copies caller filter mask w3, which is 0x200 for Draw all particle effects",
  },
  {
    address: 0x18bf764,
    role: "backing-filter-copy-capacity",
    expectedOpcodeHex: "2a0203f5",
    evidence: "backing filter vtable slot +0x28 copies caller output capacity w2 before scanning backing records",
  },
  {
    address: 0x18bf78c,
    role: "backing-filter-test-mask-nonzero",
    expectedOpcodeHex: "72003e9f",
    evidence: "if the filter mask is nonzero, the backing record must pass a bitmask test",
  },
  {
    address: 0x18bf794,
    role: "backing-filter-load-record-flags",
    expectedOpcodeHex: "794032e8",
    evidence: "loads backing record +0x18 flags for the draw-batch filter",
  },
  {
    address: 0x18bf798,
    role: "backing-filter-record-flags-bit-test",
    expectedOpcodeHex: "6a14011f",
    evidence: "tests backing record flags against the caller filter mask; particle draw uses mask 0x200",
  },
  {
    address: 0x18bf7bc,
    role: "backing-filter-load-manager-record-index",
    expectedOpcodeHex: "794036e8",
    evidence: "loads backing record +0x1a, the manager record index returned to the draw entry-array builder",
  },
  {
    address: 0x18bf7c4,
    role: "backing-filter-store-manager-record-index",
    expectedOpcodeHex: "780026c8",
    evidence: "stores the filtered manager record index into the u16 index buffer consumed by 0x188f03c",
  },
  {
    address: 0x18bf844,
    role: "backing-filter-count-load-global-count-offset",
    expectedOpcodeHex: "52900608",
    evidence: "backing count vtable slot +0x38 reads the active backing record count at offset 0x18030",
  },
  {
    address: 0x18bf84c,
    role: "backing-filter-count-return",
    expectedOpcodeHex: "b8686800",
    evidence: "returns the active backing record count used by 0x188f03c to size its temporary index buffer",
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

function readCString(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 1);
  if (fileOffset < 0) return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.subarray(fileOffset, end).toString("utf8");
}

function opcodeEvidenceRows(buffer, elf) {
  return evidenceSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
    };
  });
}

function buildCurrentNativeParticleDrawChainAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeEvidenceRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const label = readCString(buffer, elf, 0x1a98f96);
  const summary = {
    rows: rows.length,
    opcodeMismatchRows,
    particleDrawBatchRecovered: opcodeMismatchRows === 0,
    entryArrayBuilderRecovered: rows.some((row) => row.role === "particle-entry-array-builder-call" && row.opcodeMatches),
    sharedManagerEntryMaterializationRecovered: rows.some((row) => row.role === "entry-manager-output-entry-store" && row.opcodeMatches),
    backingFilterRecovered: rows.some((row) => row.role === "backing-filter-record-flags-bit-test" && row.opcodeMatches),
    backingRecordFlagStorageRecovered: rows.some((row) => row.role === "backing-record-flags-store" && row.opcodeMatches),
    compositeTaskRecovered: rows.some((row) => row.role === "particle-composite-task-constructor-call" && row.opcodeMatches),
    renderQueueAppendRecovered: rows.some((row) => row.role === "particle-composite-task-render-queue-append" && row.opcodeMatches),
    visualRuntimeStage: "particle-draw-batch-entry-array-and-queue-submit",
    renderTakeoverAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current Android particle draw batch evidence; this recovers queue submission mechanics but not yet the PFX/emitter instance-to-entry ownership chain",
    summary,
    label: {
      address: 0x1a98f96,
      addressHex: hex(0x1a98f96),
      text: label,
    },
    entryArrayCall: {
      callsite: "0x820fd0..0x820fdc",
      outputArray: "sp+0x128",
      filterMask: "0x200",
      filterKind: "2",
      filterContext: "x3 from 0x8ba16c(owner+0x738)",
      builder: "0x188e784 -> 0x188f03c",
    },
    entryMaterialization: {
      managerGlobalSlot: "0x311a960",
      backingObjectGlobalSlot: "0x311a950",
      backingObjectConstructor: "0x18bf46c",
      backingObjectVtable: "0x2ab5a58",
      indexCapacityVtableSlot: "+0x38",
      indexFillVtableSlot: "+0x28",
      recordLayout: "manager +0x10 + index*16",
      entryPointerField: "+0x8",
    },
    backingFilter: {
      addRecordSlot: "+0x10",
      filterSlot: "+0x28",
      countSlot: "+0x38",
      backingRecordStride: "0x30",
      backingRecordFlagsField: "+0x18",
      backingRecordManagerIndexField: "+0x1a",
      particleFilterMask: "0x200",
      particleFilterKind: "2",
      conclusion:
        "Draw all particle effects selects backing records whose +0x18 flags overlap 0x200, then returns each backing record +0x1a manager index to the shared entry-array materializer.",
    },
    queueSubmission: {
      compositeConstructor: "0x18a11e4",
      queueAppend: "0x18a2418",
      label,
    },
    unresolved: [
      "which concrete PFX/emitter instance class stores itself into manager record +0x8",
      "where skill/action timeline events create or activate those particle manager records",
      "the exact draw material/shader formula for particle surfaces after the queue entry is executed",
    ],
    items: rows,
  };
}

function exportCurrentNativeParticleDrawChainAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeParticleDrawChainAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, ["addressHex", "role", "expectedOpcodeHex", "actualOpcodeHex", "opcodeMatches", "evidence"]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeParticleDrawChainAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeParticleDrawChainAudit,
  exportCurrentNativeParticleDrawChainAudit,
};
