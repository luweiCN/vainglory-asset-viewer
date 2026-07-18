#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-particle-mask-candidate-owner-audit.json";
const defaultJsonOut = "extracted/reports/current_native_particle_mask_candidate_owner_audit.json";
const defaultTsvOut = "extracted/reports/current_native_particle_mask_candidate_owner_audit.tsv";

const opcodeSpecs = [
  {
    address: 0x8bad9c,
    role: "module-registers-type-0x210-factory",
    stage: "module-registration",
    expectedOpcodeHex: "940040c3",
    evidence: "module registration calls the 0x8cb0a8 type factory",
  },
  {
    address: 0x8cb0c8,
    role: "type-0x210-wrapper-a-address",
    stage: "type-registration",
    expectedOpcodeHex: "91369108",
    evidence: "type factory materializes wrapper 0x8cbda4 before storing wrapper slots",
  },
  {
    address: 0x8cb0cc,
    role: "type-0x210-wrapper-b-address",
    stage: "type-registration",
    expectedOpcodeHex: "9137216b",
    evidence: "type factory materializes wrapper 0x8cbdc8 before storing wrapper slots",
  },
  {
    address: 0x8cb0d4,
    role: "type-0x210-wrapper-slots-store",
    stage: "type-registration",
    expectedOpcodeHex: "a90b2d48",
    evidence: "type factory stores the two wrapper slots into the type record",
  },
  {
    address: 0x8cb0dc,
    role: "type-0x210-literal",
    stage: "type-registration",
    expectedOpcodeHex: "5280420b",
    evidence: "type factory uses literal 0x210, which includes particle mask bit 0x200",
  },
  {
    address: 0x8cb0e0,
    role: "type-0x210-literal-store",
    stage: "type-registration",
    expectedOpcodeHex: "2914ad49",
    evidence: "type factory stores [index, 0x210] at the shared type-record field",
  },
  {
    address: 0x8cb0e8,
    role: "type-0x210-control-bit-store",
    stage: "type-registration",
    expectedOpcodeHex: "32190108",
    evidence: "type factory marks the type record with control bit 0x80",
  },
  {
    address: 0x8cb100,
    role: "type-0x210-global-index-store",
    stage: "type-registration",
    expectedOpcodeHex: "b9009909",
    evidence: "type factory stores the current-package type index in global 0x3035098",
  },
  {
    address: 0x8cbdb4,
    role: "type-0x210-wrapper-calls-constructor",
    stage: "constructor",
    expectedOpcodeHex: "97fffc15",
    evidence: "wrapper 0x8cbda4 calls constructor 0x8cae08",
  },
  {
    address: 0x8caecc,
    role: "type-0x210-constructor-flags-load",
    stage: "constructor",
    expectedOpcodeHex: "b940ae89",
    evidence: "constructor reads object+0xac but does not seed it with literal 0x210",
  },
  {
    address: 0x8caed8,
    role: "type-0x210-constructor-clears-bit2",
    stage: "constructor",
    expectedOpcodeHex: "121d7928",
    evidence: "constructor clears bit 2 in object+0xac",
  },
  {
    address: 0x8caee0,
    role: "type-0x210-constructor-flags-store",
    stage: "constructor",
    expectedOpcodeHex: "b900ae88",
    evidence: "constructor stores the bit-2-adjusted value back to object+0xac",
  },
  {
    address: 0x8cc3f4,
    role: "owner-loads-resource-list-58",
    stage: "owner-list",
    expectedOpcodeHex: "f9402e78",
    evidence: "owner path iterates the resource/list field at owner+0x58 for this 0x210 type",
  },
  {
    address: 0x8cc414,
    role: "owner-loads-type-0x210-global",
    stage: "owner-list",
    expectedOpcodeHex: "b9409b21",
    evidence: "owner path loads global 0x3035098 before resolving a 0x210 object",
  },
  {
    address: 0x8cc41c,
    role: "owner-resolves-type-0x210-object",
    stage: "owner-list",
    expectedOpcodeHex: "943efd27",
    evidence: "owner path resolves/creates the 0x210 object through 0x188b8b8",
  },
  {
    address: 0x8cc484,
    role: "owner-calls-bit2-update",
    stage: "owner-list",
    expectedOpcodeHex: "97fffb21",
    evidence: "owner path calls 0x8cb108 to update bit 2 and scalar fields on the 0x210 object",
  },
  {
    address: 0x8cc4e4,
    role: "owner-calls-subobject-append",
    stage: "owner-list",
    expectedOpcodeHex: "97fffb27",
    evidence: "owner path appends per-resource subobjects through 0x8cb180",
  },
  {
    address: 0x8cb11c,
    role: "bit2-update-flags-load",
    stage: "bit2-update",
    expectedOpcodeHex: "b940ac09",
    evidence: "0x8cb108 reads object+0xac before patching bit 2 from caller state",
  },
  {
    address: 0x8cb130,
    role: "bit2-update-bfi",
    stage: "bit2-update",
    expectedOpcodeHex: "331e0149",
    evidence: "0x8cb108 inserts caller bit into object+0xac bit 2 only",
  },
  {
    address: 0x8cb138,
    role: "bit2-update-flags-store",
    stage: "bit2-update",
    expectedOpcodeHex: "b900ac09",
    evidence: "0x8cb108 stores the bit-2-adjusted object+0xac value",
  },
  {
    address: 0x8cb274,
    role: "packed-coverage-flags-load-for-clear",
    stage: "packed-coverage",
    expectedOpcodeHex: "b940ae68",
    evidence: "0x8cb1ec reads object+0xac before clearing bits 7..14",
  },
  {
    address: 0x8cb278,
    role: "packed-coverage-mask-test",
    stage: "packed-coverage",
    expectedOpcodeHex: "72191d1f",
    evidence: "0x8cb1ec tests object+0xac bits 7..14 with mask 0x7f80",
  },
  {
    address: 0x8cb280,
    role: "packed-coverage-clear-bits",
    stage: "packed-coverage",
    expectedOpcodeHex: "12115d08",
    evidence: "0x8cb1ec can clear object+0xac bits 7..14",
  },
  {
    address: 0x8cb374,
    role: "packed-coverage-flags-load-for-update",
    stage: "packed-coverage",
    expectedOpcodeHex: "b940ae68",
    evidence: "0x8cb1ec reads object+0xac before inserting a computed coverage byte",
  },
  {
    address: 0x8cb394,
    role: "packed-coverage-current-byte-read",
    stage: "packed-coverage",
    expectedOpcodeHex: "5307390a",
    evidence: "0x8cb1ec reads the current bits 7..14 as an 8-bit byte",
  },
  {
    address: 0x8cb3a0,
    role: "packed-coverage-computed-byte-bfi",
    stage: "packed-coverage",
    expectedOpcodeHex: "33191d28",
    evidence: "0x8cb1ec inserts computed bits 7..14, which can include particle mask bit 0x200",
  },
  {
    address: 0x8cb3b8,
    role: "packed-coverage-all-bits-orr",
    stage: "packed-coverage",
    expectedOpcodeHex: "32191d08",
    evidence: "0x8cb1ec can set bits 7..14 to 0x7f80, which includes particle mask bit 0x200",
  },
  {
    address: 0x8cb3c0,
    role: "packed-coverage-flags-store",
    stage: "packed-coverage",
    expectedOpcodeHex: "b900ae68",
    evidence: "0x8cb1ec stores the packed coverage result back to object+0xac",
  },
  {
    address: 0x8cb60c,
    role: "render-callback-calls-primitive-builder",
    stage: "render-callback",
    expectedOpcodeHex: "9400007c",
    evidence: "the type 0x210 render callback calls local primitive builder 0x8cb7fc, not the shared particle draw queue directly",
  },
  {
    address: 0x8cb7fc,
    role: "primitive-builder-capacity-read",
    stage: "primitive-builder",
    expectedOpcodeHex: "29412408",
    evidence: "the local primitive builder starts by reading its output buffer capacity/count fields before writing primitive records",
  },
];

const pointerSpecs = [
  {
    address: 0x26c88d0,
    role: "type-0x210-vtable-direct-update-slot",
    stage: "vtable",
    expectedPointer: 0x8cb1ec,
    evidence: "data.rel.ro table stores direct callback 0x8cb1ec",
  },
  {
    address: 0x26c88d8,
    role: "type-0x210-vtable-render-callback-slot",
    stage: "vtable",
    expectedPointer: 0x8cb418,
    evidence: "data.rel.ro table stores render/update callback 0x8cb418 for the 0x210 family",
  },
  {
    address: 0x26c8990,
    role: "type-0x210-vtable-child-update-thunk",
    stage: "vtable",
    expectedPointer: 0x8cb3f8,
    evidence: "data.rel.ro table stores child thunk 0x8cb3f8, which subtracts 0x28 and tail-calls 0x8cb1ec",
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

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function parseDirectBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

const type210FamilyRanges = [
  { name: "coverage-update", start: 0x8cb1ec, end: 0x8cb400 },
  { name: "render-callback", start: 0x8cb418, end: 0x8cb654 },
  { name: "child-cull", start: 0x8cb67c, end: 0x8cb7dc },
  { name: "primitive-builder", start: 0x8cb7fc, end: 0x8cbda4 },
  { name: "owner-path", start: 0x8cc3f4, end: 0x8cc500 },
];

const renderBoundaryTargets = new Map([
  [0x18a2418, "render-queue-append"],
  [0x18a11e4, "composite-task-constructor"],
  [0x188e784, "entry-array-forwarder"],
  [0x188f03c, "entry-array-builder"],
  [0x188eee0, "manager-add-record"],
  [0x188f020, "manager-refresh-record"],
]);

function directBranchCallsInRange(buffer, elf, range) {
  const rows = [];
  for (let address = range.start; address < range.end; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const branch = parseDirectBranch(instruction, address);
    if (!branch) continue;
    rows.push({
      range: range.name,
      address,
      addressHex: hex(address),
      mode: branch.mode,
      target: branch.target,
      targetHex: hex(branch.target),
      targetRole: renderBoundaryTargets.get(branch.target) || "",
      instructionHex: instruction.toString(16).padStart(8, "0"),
    });
  }
  return rows;
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
    pointerMatches: "",
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function checkedPointer(buffer, elf, spec) {
  const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 8);
  const actualPointer = fileOffset >= 0 ? Number(buffer.readBigUInt64LE(fileOffset)) : NaN;
  return {
    address: spec.address,
    addressHex: hex(spec.address),
    role: spec.role,
    stage: spec.stage,
    expectedPointerHex: hex(spec.expectedPointer),
    actualPointerHex: hex(actualPointer),
    opcodeMatches: "",
    pointerMatches: actualPointer === spec.expectedPointer,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeParticleMaskCandidateOwnerAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeRows = opcodeSpecs.map((spec) => checkedOpcode(buffer, elf, spec));
  const pointerRows = pointerSpecs.map((spec) => checkedPointer(buffer, elf, spec));
  const items = [...opcodeRows, ...pointerRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const pointerMismatchRows = pointerRows.filter((row) => !row.pointerMatches).length;
  const directCoverageCallers = findDirectBranchCallers(buffer, elf, 0x8cb1ec);
  const directOwnerPathCallers = findDirectBranchCallers(buffer, elf, 0x8cc3f4);
  const type210GlobalTextReferences = scanTextReferences(buffer, elf, [
    { name: "type-0x210-global-index", virtualAddress: 0x3035098, section: ".bss" },
  ]);
  const type210FamilyDirectBranchCalls = type210FamilyRanges.flatMap((range) =>
    directBranchCallsInRange(buffer, elf, range),
  );
  const type210FamilyDirectRenderBoundaryCalls = type210FamilyDirectBranchCalls.filter((row) => row.targetRole);
  const summary = {
    rows: items.length,
    opcodeRows: opcodeRows.length,
    pointerRows: pointerRows.length,
    opcodeMismatchRows,
    pointerMismatchRows,
    type210RegistrationRecovered: opcodeRows.some((row) => row.role === "type-0x210-literal-store" && row.opcodeMatches),
    type210GlobalIndexRecovered: opcodeRows.some((row) => row.role === "type-0x210-global-index-store" && row.opcodeMatches),
    ownerList58Recovered: opcodeRows.some((row) => row.role === "owner-loads-resource-list-58" && row.opcodeMatches),
    ownerResolveType210Recovered: opcodeRows.some((row) => row.role === "owner-resolves-type-0x210-object" && row.opcodeMatches),
    bit2OnlyUpdateRecovered: opcodeRows.some((row) => row.role === "bit2-update-bfi" && row.opcodeMatches),
    packedCoverageRecovered: opcodeRows.some((row) => row.role === "packed-coverage-computed-byte-bfi" && row.opcodeMatches),
    packedCoverageCanSetParticleMaskRows: opcodeRows.filter((row) =>
      ["packed-coverage-computed-byte-bfi", "packed-coverage-all-bits-orr"].includes(row.role),
    ).length,
    coverageCallbackPointerRows: pointerRows.filter(
      (row) =>
        row.pointerMatches &&
        ["type-0x210-vtable-direct-update-slot", "type-0x210-vtable-child-update-thunk"].includes(row.role),
    ).length,
    type210CallbackPointerRows: pointerRows.filter((row) => row.pointerMatches).length,
    directCoverageCallers: directCoverageCallers.length,
    directOwnerPathCallers: directOwnerPathCallers.length,
    type210GlobalTextReferenceRows: type210GlobalTextReferences.length,
    type210GlobalOnlyOwnerReadRecovered:
      type210GlobalTextReferences.length === 1 && type210GlobalTextReferences[0]?.xrefAddress === 0x8cc414,
    renderCallbackRecovered: pointerRows.some((row) => row.role === "type-0x210-vtable-render-callback-slot" && row.pointerMatches),
    renderCallbackCallsPrimitiveBuilderRecovered: opcodeRows.some(
      (row) => row.role === "render-callback-calls-primitive-builder" && row.opcodeMatches,
    ),
    type210FamilyDirectBranchCallRows: type210FamilyDirectBranchCalls.length,
    type210FamilyDirectRenderBoundaryCallRows: type210FamilyDirectRenderBoundaryCalls.length,
    tiedToLayoutBRows: 0,
    exactLayoutBParticleFlagProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current Android 0x210 particle-mask candidate owner evidence; do not use this as layout B or PFX render permission",
    summary,
    candidateType: "0x210",
    candidateGlobal: "0x3035098",
    candidateOwnerListField: "+0x58",
    layoutBType: "0x118",
    layoutBLinkStatus: "separate-type-0x210-not-layout-b-0x118",
    directCoverageCallers,
    interpretation: {
      typeRegistration:
        "0x8cb0a8 registers a distinct type literal 0x210 and stores its type index in current global 0x3035098.",
      ownerPath:
        "0x8cc3f4 iterates owner+0x58 resources, resolves/creates a 0x210 object through 0x188b8b8, then calls 0x8cb108 and 0x8cb180.",
      flags:
        "0x8cb108 only patches object+0xac bit 2. 0x8cb1ec later writes bits 7..14 as packed coverage; those writes can include bit 0x200 but are currently tied to the 0x210 type, not the 0x118 layout B path.",
      vtable:
        "0x8cb1ec and the child thunk 0x8cb3f8 are installed in data.rel.ro callback/vtable tables for this type family.",
      renderBoundary:
        "0x8cb418 is installed as the local render/update callback and calls 0x8cb7fc, a local primitive builder. This 0x210 family has no direct calls to the known particle render queue, composite task, entry-array builder, manager add-record, or manager refresh targets.",
    },
    unresolved: [
      "whether the distinct 0x210 coverage object participates in any original PFX draw path separate from layout B",
      "whether any bridge copies 0x210 packed coverage flags into the 0x118 layout B backing record",
      "the concrete resource semantic names for owner+0x58 list entries that create these 0x210 objects",
    ],
    type210GlobalTextReferences,
    directOwnerPathCallers,
    type210FamilyDirectBranchCalls,
    type210FamilyDirectRenderBoundaryCalls,
    items,
  };
}

function exportCurrentNativeParticleMaskCandidateOwnerAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeParticleMaskCandidateOwnerAudit({ binaryPath });
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
    "expectedPointerHex",
    "actualPointerHex",
    "opcodeMatches",
    "pointerMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeParticleMaskCandidateOwnerAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeParticleMaskCandidateOwnerAudit,
  exportCurrentNativeParticleMaskCandidateOwnerAudit,
};
