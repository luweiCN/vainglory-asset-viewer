#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-active-record-lifecycle-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_active_record_lifecycle_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_active_record_lifecycle_audit.tsv";

const managerRecordStrideBytes = 0x2e8;
const layoutBObjectStrideBytes = 0x118;
const managerRecordCapacity = 110;
const managerRecordPoolByteSpan = managerRecordStrideBytes * managerRecordCapacity;
const managerRecordCountOffset = 0x13fb0;
const managerCurrentRecordOffset = 0x13fb8;

const managerInitializerSpecs = [
  {
    role: "manager-record-pool-byte-count-low",
    address: 0x188c2a8,
    expectedOpcodeHex: "5287f615",
    evidence: "module slot manager initializer materializes low bits of 0x13fb0 bytes",
  },
  {
    role: "manager-record-pool-byte-count-high",
    address: 0x188c2b0,
    expectedOpcodeHex: "72a00035",
    evidence: "module slot manager initializer completes the 0x13fb0-byte record pool span",
  },
  {
    role: "manager-initializes-each-active-record",
    address: 0x188c2bc,
    expectedOpcodeHex: "97fffdbf",
    evidence: "manager initializer calls active-record initializer 0x188b9b8 for every 0x2e8-byte record",
  },
  {
    role: "manager-record-stride-advance",
    address: 0x188c2c4,
    expectedOpcodeHex: "910ba294",
    evidence: "manager initializer advances by one 0x2e8-byte active record",
  },
  {
    role: "manager-record-count-zero",
    address: 0x188c2dc,
    expectedOpcodeHex: "b8286a7f",
    evidence: "manager initializer clears the live record count at manager +0x13fb0",
  },
  {
    role: "manager-current-record-pointer-zero",
    address: 0x188c2e0,
    expectedOpcodeHex: "f8296a7f",
    evidence: "manager initializer clears the current record pointer at manager +0x13fb8",
  },
];

const recordInitializerSpecs = [
  {
    role: "active-record-initializer-object-byte-count",
    address: 0x188b9c4,
    expectedOpcodeHex: "52801582",
    evidence: "active-record initializer prepares a 0xac-byte zero fill before object callback storage",
  },
  {
    role: "active-record-initializer-secondary-base",
    address: 0x188b9cc,
    expectedOpcodeHex: "9102c013",
    evidence: "active-record initializer starts the second zero fill at record +0xb0",
  },
  {
    role: "active-record-zero-object-storage-base",
    address: 0x188b9d0,
    expectedOpcodeHex: "f901641f",
    evidence: "active-record initializer clears object storage base at record +0x2c8",
  },
  {
    role: "active-record-zero-packed-range",
    address: 0x188b9d4,
    expectedOpcodeHex: "b902d81f",
    evidence: "active-record initializer clears packed active range at record +0x2d8",
  },
  {
    role: "active-record-memset-leading-region",
    address: 0x188b9d8,
    expectedOpcodeHex: "97bc260e",
    evidence: "active-record initializer zeroes the leading callback/metadata region",
  },
  {
    role: "active-record-initializer-tail-byte-count",
    address: 0x188b9dc,
    expectedOpcodeHex: "52804282",
    evidence: "active-record initializer prepares a 0x214-byte zero fill from record +0xb0",
  },
  {
    role: "active-record-memset-tail-region",
    address: 0x188b9e8,
    expectedOpcodeHex: "97bc260a",
    evidence: "active-record initializer zeroes callback slots, active arrays, and tail metadata",
  },
];

const layoutBRecordRegistrationSpecs = [
  {
    role: "layout-b-register-reads-record-count",
    address: 0x8d2f58,
    expectedOpcodeHex: "b8686809",
    evidence: "layout B type registration reads the current module slot record count from manager +0x13fb0",
  },
  {
    role: "layout-b-register-record-stride-constant",
    address: 0x8d2f5c,
    expectedOpcodeHex: "52805d0a",
    evidence: "layout B registration uses 0x2e8 bytes as the manager record stride",
  },
  {
    role: "layout-b-register-increments-record-count",
    address: 0x8d2f6c,
    expectedOpcodeHex: "b828680b",
    evidence: "layout B registration publishes the next module slot record count back to manager +0x13fb0",
  },
  {
    role: "layout-b-register-materializes-record-pointer",
    address: 0x8d2f80,
    expectedOpcodeHex: "9b0a012a",
    evidence: "layout B registration materializes record pointer as manager base + recordIndex * 0x2e8",
  },
  {
    role: "layout-b-register-installs-object-lifecycle-callbacks",
    address: 0x8d2f84,
    expectedOpcodeHex: "a90b2d48",
    evidence: "layout B registration stores object constructor/destructor callbacks at record +0xb0/+0xb8",
  },
  {
    role: "layout-b-register-object-stride-constant",
    address: 0x8d2f8c,
    expectedOpcodeHex: "5280230b",
    evidence: "layout B registration materializes object stride 0x118",
  },
  {
    role: "layout-b-register-stores-record-index-and-object-stride",
    address: 0x8d2f90,
    expectedOpcodeHex: "2914ad49",
    evidence: "layout B registration stores record index at +0xa4 and object stride 0x118 at +0xa8",
  },
  {
    role: "layout-b-register-seeds-packed-active-range",
    address: 0x8d2fa0,
    expectedOpcodeHex: "b902d948",
    evidence: "layout B registration seeds the packed active range/state at record +0x2d8",
  },
  {
    role: "layout-b-register-publishes-current-record",
    address: 0x8d2fac,
    expectedOpcodeHex: "f828680a",
    evidence: "layout B registration publishes the materialized record pointer to manager +0x13fb8",
  },
];

const arenaAllocationSpecs = [
  {
    role: "manager-record-pool-copy-stride",
    address: 0x188c3a0,
    expectedOpcodeHex: "52805d0b",
    evidence: "record pool copy/allocation wrapper uses 0x2e8-byte records",
  },
  {
    role: "manager-record-pool-allocates-each-record",
    address: 0x188c440,
    expectedOpcodeHex: "97fffd6e",
    evidence: "manager pool builder calls active-record allocator 0x188b9f8 for each copied/active record",
  },
  {
    role: "active-record-allocator-loads-arena-base",
    address: 0x188b9f8,
    expectedOpcodeHex: "f9400428",
    evidence: "active-record allocator reads the arena base pointer from allocator +0x8",
  },
  {
    role: "active-record-allocator-loads-live-count",
    address: 0x188ba00,
    expectedOpcodeHex: "7945b00b",
    evidence: "active-record allocator reads the current low 16-bit active count from record +0x2d8",
  },
  {
    role: "active-record-allocator-loads-object-stride",
    address: 0x188ba04,
    expectedOpcodeHex: "b940a80c",
    evidence: "active-record allocator reads object stride from record +0xa8 before sizing object storage",
  },
  {
    role: "active-record-allocator-stores-object-storage-base",
    address: 0x188ba68,
    expectedOpcodeHex: "f901640c",
    evidence: "active-record allocator stores object storage base at record +0x2c8",
  },
  {
    role: "active-record-allocator-stores-index-array",
    address: 0x188bad4,
    expectedOpcodeHex: "f901680c",
    evidence: "active-record allocator stores the u16 active index array at record +0x2d0",
  },
  {
    role: "active-record-allocator-stores-bitset",
    address: 0x188bb30,
    expectedOpcodeHex: "f901700a",
    evidence: "active-record allocator stores the active-object bitset at record +0x2e0",
  },
  {
    role: "active-record-allocator-clears-packed-range-low",
    address: 0x188bb44,
    expectedOpcodeHex: "b902d809",
    evidence: "active-record allocator clears/rebases the low active range bits at record +0x2d8",
  },
  {
    role: "active-record-allocator-finalizes-packed-range",
    address: 0x188bb8c,
    expectedOpcodeHex: "b902d808",
    evidence: "active-record allocator finalizes packed active range state at record +0x2d8",
  },
];

const objectAcquireSpecs = [
  {
    role: "manager-acquire-loads-record-storage",
    address: 0x188c490,
    expectedOpcodeHex: "f9400008",
    evidence: "manager acquire wrapper loads active-record storage from manager +0",
  },
  {
    role: "manager-acquire-materializes-record",
    address: 0x188c498,
    expectedOpcodeHex: "9ba92020",
    evidence: "manager acquire wrapper materializes a record pointer by recordIndex * 0x2e8",
  },
  {
    role: "manager-acquire-enters-record-acquire",
    address: 0x188c49c,
    expectedOpcodeHex: "17fffdbe",
    evidence: "manager acquire wrapper tail-branches into active-record object acquire 0x188bb94",
  },
  {
    role: "active-record-acquire-loads-packed-range",
    address: 0x188bba0,
    expectedOpcodeHex: "b942d808",
    evidence: "object acquire starts from packed active range/count at record +0x2d8",
  },
  {
    role: "active-record-acquire-increments-high-base",
    address: 0x188bbb8,
    expectedOpcodeHex: "1140410a",
    evidence: "object acquire advances high packed bits to reserve an active index",
  },
  {
    role: "active-record-acquire-stores-packed-range",
    address: 0x188bbd4,
    expectedOpcodeHex: "b902da68",
    evidence: "object acquire stores the updated packed range back to record +0x2d8",
  },
  {
    role: "active-record-acquire-loads-object-stride",
    address: 0x188bbdc,
    expectedOpcodeHex: "b940aa62",
    evidence: "object acquire reloads object stride from record +0xa8",
  },
  {
    role: "active-record-acquire-loads-object-storage-base",
    address: 0x188bbe0,
    expectedOpcodeHex: "f9416669",
    evidence: "object acquire reloads object storage base from record +0x2c8",
  },
  {
    role: "active-record-acquire-materializes-object",
    address: 0x188bbec,
    expectedOpcodeHex: "8b080134",
    evidence: "object acquire materializes object pointer as objectBase + stride * index",
  },
  {
    role: "active-record-acquire-zeroes-object",
    address: 0x188bbf4,
    expectedOpcodeHex: "97bc2587",
    evidence: "object acquire zeroes the object payload before constructor callbacks",
  },
  {
    role: "active-record-acquire-stores-back-pointer",
    address: 0x188bbf8,
    expectedOpcodeHex: "f9000693",
    evidence: "object acquire stores active-record back pointer at object +0x8",
  },
  {
    role: "active-record-acquire-calls-constructor",
    address: 0x188bc04,
    expectedOpcodeHex: "d63f0100",
    evidence: "object acquire calls the constructor callback stored at record +0xb0",
  },
  {
    role: "active-record-acquire-marks-dirty",
    address: 0x188bc28,
    expectedOpcodeHex: "b902da68",
    evidence: "object acquire marks record +0x2d8 with the dirty/high bit after constructor/linking",
  },
];

const objectReleaseSpecs = [
  {
    role: "manager-release-loads-object-record-index",
    address: 0x188c4ac,
    expectedOpcodeHex: "b940a508",
    evidence: "manager release wrapper reads the object's record index from object metadata +0xa4",
  },
  {
    role: "manager-release-materializes-record",
    address: 0x188c4b4,
    expectedOpcodeHex: "9b0a2500",
    evidence: "manager release wrapper materializes the active record by recordIndex * 0x2e8",
  },
  {
    role: "manager-release-enters-record-release",
    address: 0x188c4b8,
    expectedOpcodeHex: "17fffdec",
    evidence: "manager release wrapper tail-branches into active-record object release 0x188bc68",
  },
  {
    role: "active-record-release-calls-pre-destructor",
    address: 0x188bc88,
    expectedOpcodeHex: "d63f0100",
    evidence: "object release calls the optional object-level callback before unlinking",
  },
  {
    role: "active-record-release-calls-manager-unlink",
    address: 0x188bc90,
    expectedOpcodeHex: "97ffff3c",
    evidence: "object release unlinks the object from its intrusive owner list",
  },
  {
    role: "active-record-release-calls-record-destructor",
    address: 0x188bc9c,
    expectedOpcodeHex: "d63f0100",
    evidence: "object release calls the destructor callback stored at record +0xb8",
  },
  {
    role: "active-record-release-clears-back-pointer",
    address: 0x188bca0,
    expectedOpcodeHex: "f900069f",
    evidence: "object release clears active-record back pointer at object +0x8",
  },
  {
    role: "active-record-release-computes-object-index",
    address: 0x188bcb8,
    expectedOpcodeHex: "1ac90901",
    evidence: "object release divides object offset by stride to recover the active index",
  },
  {
    role: "active-record-release-clears-active-bit",
    address: 0x188bcd4,
    expectedOpcodeHex: "f8285949",
    evidence: "object release clears the corresponding bit in record +0x2e0 bitset",
  },
  {
    role: "active-record-release-compacts-active-range",
    address: 0x188bcd8,
    expectedOpcodeHex: "94000007",
    evidence: "object release calls range compaction helper 0x188bcf4",
  },
  {
    role: "active-record-release-marks-dirty",
    address: 0x188bce4,
    expectedOpcodeHex: "b902da68",
    evidence: "object release marks record +0x2d8 dirty after bitset/range update",
  },
];

const frameDispatchSpecs = [
  {
    role: "frame-dispatch-slot2",
    address: 0x188e640,
    expectedOpcodeHex: "97fff7fe",
    evidence: "frame dispatcher sends slot 2 to shared slot dispatcher 0x188c638",
  },
  {
    role: "frame-dispatch-slot3",
    address: 0x188e690,
    expectedOpcodeHex: "97fff7ea",
    evidence: "frame dispatcher sends slot 3 to shared slot dispatcher 0x188c638",
  },
  {
    role: "frame-dispatch-slot4-layout-b-update",
    address: 0x188e6b8,
    expectedOpcodeHex: "97fff7e0",
    evidence: "frame dispatcher sends slot 4 to shared slot dispatcher 0x188c638, which invokes layout B update callbacks",
  },
  {
    role: "frame-dispatch-slot5",
    address: 0x188e6dc,
    expectedOpcodeHex: "97fff7d7",
    evidence: "frame dispatcher sends slot 5 to shared slot dispatcher 0x188c638",
  },
  {
    role: "frame-dispatch-slot6",
    address: 0x188e720,
    expectedOpcodeHex: "17fff7c6",
    evidence: "frame dispatcher tail-branches slot 6 to shared slot dispatcher 0x188c638",
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

function rowsForSpecs(buffer, elf, specs, stage) {
  return specs.map((spec) => opcodeRow(buffer, elf, spec, stage));
}

function buildCurrentNativeLayoutBActiveRecordLifecycleAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const managerInitializerRows = rowsForSpecs(buffer, elf, managerInitializerSpecs, "manager-initializer");
  const recordInitializerRows = rowsForSpecs(buffer, elf, recordInitializerSpecs, "active-record-initializer");
  const layoutBRecordRegistrationRows = rowsForSpecs(buffer, elf, layoutBRecordRegistrationSpecs, "layout-b-record-registration");
  const arenaAllocationRows = rowsForSpecs(buffer, elf, arenaAllocationSpecs, "active-record-arena-allocation");
  const objectAcquireRows = rowsForSpecs(buffer, elf, objectAcquireSpecs, "active-object-acquire");
  const objectReleaseRows = rowsForSpecs(buffer, elf, objectReleaseSpecs, "active-object-release");
  const frameDispatchRows = rowsForSpecs(buffer, elf, frameDispatchSpecs, "frame-dispatch");
  const opcodeRows = [
    ...managerInitializerRows,
    ...recordInitializerRows,
    ...layoutBRecordRegistrationRows,
    ...arenaAllocationRows,
    ...objectAcquireRows,
    ...objectReleaseRows,
    ...frameDispatchRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const summary = {
    managerInitializerRows: managerInitializerRows.length,
    recordInitializerRows: recordInitializerRows.length,
    layoutBRecordRegistrationRows: layoutBRecordRegistrationRows.length,
    arenaAllocationRows: arenaAllocationRows.length,
    objectAcquireRows: objectAcquireRows.length,
    objectReleaseRows: objectReleaseRows.length,
    frameDispatchRows: frameDispatchRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    managerRecordStrideBytes,
    layoutBObjectStrideBytes,
    managerRecordCapacity,
    managerRecordPoolByteSpan,
    managerRecordCountOffsetHex: hex(managerRecordCountOffset),
    managerCurrentRecordOffsetHex: hex(managerCurrentRecordOffset),
    activeObjectBackPointerOffsetHex: "0x8",
    activeRecordBitsetOffsetHex: "0x2e0",
    activeRecordLifecycleRecovered: opcodeMismatchRows === 0,
    layoutBRecordRegistrationRecovered: layoutBRecordRegistrationRows.every((row) => row.opcodeMatches),
    activeObjectAcquireReleaseRecovered: [...objectAcquireRows, ...objectReleaseRows].every((row) => row.opcodeMatches),
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B active-record lifecycle audit; lifecycle recovery does not prove object+0xac particle mask ownership or PFX/emitter rendering permission",
    summary,
    interpretation: {
      managerLifecycle:
        "The module slot manager owns 110 active-record slots. Each slot is 0x2e8 bytes, initialized by 0x188b9b8, and published through manager +0x13fb0/+0x13fb8.",
      layoutBRegistration:
        "Layout B registration takes one manager record, stores constructor/destructor callbacks at +0xb0/+0xb8, stores record index + object stride 0x118 at +0xa4/+0xa8, seeds +0x2d8, and publishes the current record pointer.",
      activeObjectLifecycle:
        "Active objects are acquired by recordIndex -> record pointer -> 0x188bb94, where x0 becomes objectBase + objectStride * activeIndex. Release goes through 0x188bc68, clears object +0x8, clears the record +0x2e0 bitset, and compacts packed range +0x2d8.",
      frameDispatch:
        "Frame dispatch for slots 2..6 enters the shared dispatcher 0x188c638; slot 4 is the layout B update route already linked to the active-record iterator.",
      boundary:
        "This closes lifecycle and object-pool mechanics, but not the concrete resource/emitter owner behind object +0x30 and not the producer of object +0xac bit 0x200.",
    },
    unresolved: [
      "the producer that sets layout B object+0xac particle/draw mask bit 0x200",
      "the concrete PFX/emitter or component owner behind layout B object+0x30",
      "the source/program or effect-channel runtime row that maps a live active object to a renderable effect resource",
    ],
    managerInitializerRows,
    recordInitializerRows,
    layoutBRecordRegistrationRows,
    arenaAllocationRows,
    objectAcquireRows,
    objectReleaseRows,
    frameDispatchRows,
  };
}

function exportCurrentNativeLayoutBActiveRecordLifecycleAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBActiveRecordLifecycleAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.managerInitializerRows,
      ...manifest.recordInitializerRows,
      ...manifest.layoutBRecordRegistrationRows,
      ...manifest.arenaAllocationRows,
      ...manifest.objectAcquireRows,
      ...manifest.objectReleaseRows,
      ...manifest.frameDispatchRows,
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
  const summary = exportCurrentNativeLayoutBActiveRecordLifecycleAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBActiveRecordLifecycleAudit,
  exportCurrentNativeLayoutBActiveRecordLifecycleAudit,
};
