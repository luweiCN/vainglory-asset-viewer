#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-a-state-writer-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_a_state_writer_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_a_state_writer_audit.tsv";

const offset2fcKnownWriterAddresses = new Set([0xb3949c, 0xc5f37c, 0xc5f470, 0xc5f55c]);

const opcodeSpecs = [
  {
    address: 0xb3949c,
    role: "offset-2fc-reset-clears-halfword",
    stage: "offset-2fc-writer",
    expectedOpcodeHex: "7905fa7f",
    evidence: "initialization/reset path clears halfword state at object+0x2fc",
  },
  {
    address: 0xc80cac,
    role: "offset-2fc-dispatch-caller",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "940001a3",
    evidence: "the upstream state processor calls 0xc81338 before the three state writer variants",
  },
  {
    address: 0xc81338,
    role: "offset-2fc-state-machine-dispatch",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "a9bd57f6",
    evidence: "state-machine dispatch entry that selects one of the +0x2fc writer variants",
  },
  {
    address: 0xc813e0,
    role: "offset-2fc-dispatch-tail-calls-low-bits-writer",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "17ff7852",
    evidence: "dispatch tail-calls the 0xc5f528 writer variant",
  },
  {
    address: 0xc81428,
    role: "offset-2fc-dispatch-tail-calls-bit1-writer",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "17ff7803",
    evidence: "dispatch tail-calls the 0xc5f434 writer variant",
  },
  {
    address: 0xc8143c,
    role: "offset-2fc-dispatch-tail-calls-bit0-writer",
    stage: "offset-2fc-dispatch",
    expectedOpcodeHex: "17ff77c1",
    evidence: "dispatch tail-calls the 0xc5f340 writer variant",
  },
  {
    address: 0xc5f37c,
    role: "offset-2fc-state-writer-sets-bit0",
    stage: "offset-2fc-writer",
    expectedOpcodeHex: "390bf268",
    evidence: "0xc5f340 reads old object+0x2fc, computes the next byte, then writes object+0x2fc",
  },
  {
    address: 0xc5f470,
    role: "offset-2fc-state-writer-sets-bit1",
    stage: "offset-2fc-writer",
    expectedOpcodeHex: "390bf268",
    evidence: "0xc5f434 reads old object+0x2fc, computes the next byte, then writes object+0x2fc",
  },
  {
    address: 0xc5f55c,
    role: "offset-2fc-state-writer-sets-low-bits",
    stage: "offset-2fc-writer",
    expectedOpcodeHex: "390bf268",
    evidence: "0xc5f528 reads old object+0x2fc, computes the next byte, then writes object+0x2fc",
  },
  {
    address: 0x8dacc8,
    role: "object-byte-58-setter-sets-active",
    stage: "object-byte-writer",
    expectedOpcodeHex: "39016008",
    evidence: "sets object byte +0x58 before tailing into the shared object-byte update path",
  },
  {
    address: 0x8dad2c,
    role: "object-byte-58-setter-clears-active",
    stage: "object-byte-writer",
    expectedOpcodeHex: "3901601f",
    evidence: "clears object byte +0x58 before tailing into the shared object-byte update path",
  },
  {
    address: 0x8daac8,
    role: "object-byte-59-list-derived-setter",
    stage: "object-byte-writer",
    expectedOpcodeHex: "39016408",
    evidence: "derives object byte +0x59 from a list entry state byte before calling the shared update path",
  },
  {
    address: 0x8daec4,
    role: "object-byte-59-derived-setter",
    stage: "object-byte-writer",
    expectedOpcodeHex: "39016408",
    evidence: "derives object byte +0x59 from a caller-provided byte before tailing into the shared update path",
  },
  {
    address: 0x8dacd0,
    role: "object-byte-update-entry",
    stage: "object-byte-update",
    expectedOpcodeHex: "f81e0ff3",
    evidence: "shared update entry used after object byte +0x58/+0x59 changes",
  },
  {
    address: 0x8dacdc,
    role: "object-byte-update-reads-byte-59",
    stage: "object-byte-update",
    expectedOpcodeHex: "39416408",
    evidence: "shared update reads object byte +0x59 before selecting keep versus clear",
  },
  {
    address: 0x8dace8,
    role: "object-byte-update-reads-byte-58",
    stage: "object-byte-update",
    expectedOpcodeHex: "39416268",
    evidence: "shared update reads object byte +0x58 before selecting keep versus clear",
  },
];

const unsignedImmediateAccessSpecs = [
  { name: "strb", base: 0x39000000, scale: 1, kind: "store" },
  { name: "ldrb", base: 0x39400000, scale: 1, kind: "load" },
  { name: "strh", base: 0x79000000, scale: 2, kind: "store" },
  { name: "ldrh", base: 0x79400000, scale: 2, kind: "load" },
  { name: "str-w", base: 0xb9000000, scale: 4, kind: "store" },
  { name: "ldr-w", base: 0xb9400000, scale: 4, kind: "load" },
  { name: "str-x", base: 0xf9000000, scale: 8, kind: "store" },
  { name: "ldr-x", base: 0xf9400000, scale: 8, kind: "load" },
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

function checkedOpcode(buffer, elf, spec) {
  const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
  const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
  return {
    address: spec.address,
    addressHex: hex(spec.address),
    role: spec.role,
    stage: spec.stage,
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function scanUnsignedImmediateAccesses(buffer, elf, offsets) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) return [];
  const wanted = new Set(offsets);
  const rows = [];
  for (let fileOffset = text.fileOffset; fileOffset + 4 <= text.fileOffset + text.size; fileOffset += 4) {
    const instruction = buffer.readUInt32LE(fileOffset);
    const address = text.virtualAddress + (fileOffset - text.fileOffset);
    for (const spec of unsignedImmediateAccessSpecs) {
      if ((instruction & 0xffc00000) !== spec.base) continue;
      const immediate = ((instruction >>> 10) & 0xfff) * spec.scale;
      if (!wanted.has(immediate)) continue;
      rows.push({
        address,
        addressHex: hex(address),
        accessKind: spec.kind,
        accessName: spec.name,
        offsetHex: hex(immediate),
        baseRegister: (instruction >>> 5) & 0x1f,
        valueRegister: instruction & 0x1f,
        instructionHex: instruction.toString(16).padStart(8, "0"),
        knownWriter: offset2fcKnownWriterAddresses.has(address),
      });
    }
  }
  return rows;
}

function buildCurrentNativeLayoutAStateWriterAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const items = opcodeSpecs.map((spec) => checkedOpcode(buffer, elf, spec));
  const offset2fcAccesses = scanUnsignedImmediateAccesses(buffer, elf, [0x2fc]).sort(
    (left, right) => left.address - right.address,
  );
  const offset2fcKnownWriters = offset2fcAccesses.filter((row) => row.knownWriter);
  const offset2fcDispatchCallers = findDirectBranchCallers(buffer, elf, 0xc81338);
  const objectByteUpdateCallers = findDirectBranchCallers(buffer, elf, 0x8dacd0);
  const summary = {
    opcodeRows: items.length,
    opcodeMismatchRows: items.filter((row) => !row.opcodeMatches).length,
    offset2fcAccessRows: offset2fcAccesses.length,
    offset2fcStoreRows: offset2fcAccesses.filter((row) => row.accessKind === "store").length,
    offset2fcKnownWriterRows: offset2fcKnownWriters.length,
    offset2fcDispatchCallerRows: offset2fcDispatchCallers.length,
    objectByte58TrackedWriteRows: items.filter((row) => row.role.startsWith("object-byte-58-")).length,
    objectByte59TrackedWriteRows: items.filter((row) => row.role.startsWith("object-byte-59-")).length,
    objectByteUpdateCallerRows: objectByteUpdateCallers.length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only layout A state writer evidence; writer provenance does not prove particle draw permission or shader runtime semantics",
    summary,
    interpretation: {
      offset2fc:
        "The current .text scan finds 24 direct unsigned-immediate accesses to offset +0x2fc. Four are stores: one reset clears a halfword and three state-machine writer variants update the byte after 0xc81338 dispatch.",
      objectBytes:
        "The object-byte path has explicit +0x58 setters/clearers and +0x59 derived setters before the shared 0x8dacd0 update path rereads +0x59/+0x58 and selects keep or clear.",
      boundary:
        "This is still state provenance only. The higher-level resource/action names and any later particle/emitter manager ownership remain unresolved.",
    },
    unresolved: [
      "the resource/action names that select the 0xc80cac -> 0xc81338 state-machine call",
      "the owner object class that gives semantic names to +0x58, +0x59, and +0x2fc",
      "whether any state-updated layout A child later reaches the proven particle draw manager",
    ],
    offset2fcAccesses,
    offset2fcKnownWriters,
    offset2fcDispatchCallers,
    objectByteUpdateCallers,
    items,
  };
}

function exportCurrentNativeLayoutAStateWriterAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutAStateWriterAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "addressHex",
    "role",
    "stage",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutAStateWriterAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutAStateWriterAudit,
  exportCurrentNativeLayoutAStateWriterAudit,
};
