#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-indirect-slot-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_indirect_slot_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_indirect_slot_audit.tsv";

const callbackPointerSections = new Set([".data.rel.ro", ".data", ".rodata", ".got"]);

const registrationSpecs = [
  {
    role: "layout-b-slot0-register",
    slot: 0,
    installKind: "primary-slot",
    adrpAddress: 0x8d2f60,
    adrpExpectedOpcodeHex: "b0000002",
    addAddress: 0x8d2f64,
    addExpectedOpcodeHex: "91043042",
    slotArgAddress: 0x8d2f94,
    slotArgExpectedOpcodeHex: "2a1f03e1",
    flagArgAddress: 0x8d2fb4,
    flagArgExpectedOpcodeHex: "2a1f03e3",
    installerCallAddress: 0x8d2fc0,
    installerCallExpectedOpcodeHex: "943ee4cd",
    installerTarget: 0x188c2f4,
    expectedCallbackAddress: 0x8d310c,
    evidence: "type registration materializes callback 0x8d310c and writes it to primary slot 0 through 0x188c2f4",
  },
  {
    role: "layout-b-slot1-remove",
    slot: 1,
    installKind: "primary-slot",
    adrpAddress: 0x8d2fc4,
    adrpExpectedOpcodeHex: "b0000002",
    addAddress: 0x8d2fc8,
    addExpectedOpcodeHex: "91047042",
    slotArgAddress: 0x8d2fcc,
    slotArgExpectedOpcodeHex: "320003e1",
    flagArgAddress: 0x8d2fd4,
    flagArgExpectedOpcodeHex: "2a1f03e3",
    installerCallAddress: 0x8d2fd8,
    installerCallExpectedOpcodeHex: "943ee4c7",
    installerTarget: 0x188c2f4,
    expectedCallbackAddress: 0x8d311c,
    evidence: "type registration materializes callback 0x8d311c and writes it to primary slot 1 through 0x188c2f4",
  },
  {
    role: "layout-b-slot4-update",
    slot: 4,
    installKind: "primary-slot",
    adrpAddress: 0x8d2fdc,
    adrpExpectedOpcodeHex: "b0000002",
    addAddress: 0x8d2fe0,
    addExpectedOpcodeHex: "91050042",
    slotArgAddress: 0x8d2fe4,
    slotArgExpectedOpcodeHex: "321e03e1",
    flagArgAddress: 0x8d2fec,
    flagArgExpectedOpcodeHex: "2a1f03e3",
    installerCallAddress: 0x8d2ff0,
    installerCallExpectedOpcodeHex: "943ee4c1",
    installerTarget: 0x188c2f4,
    expectedCallbackAddress: 0x8d3140,
    evidence: "type registration materializes callback 0x8d3140 and writes it to primary slot 4 through 0x188c2f4",
  },
  {
    role: "layout-b-slot4-tail",
    slot: 4,
    installKind: "tail-slot",
    adrpAddress: 0x8d2ff4,
    adrpExpectedOpcodeHex: "b0000002",
    addAddress: 0x8d2ff8,
    addExpectedOpcodeHex: "91067042",
    slotArgAddress: 0x8d2ffc,
    slotArgExpectedOpcodeHex: "321e03e1",
    flagArgAddress: 0,
    flagArgExpectedOpcodeHex: "",
    installerCallAddress: 0x8d3004,
    installerCallExpectedOpcodeHex: "943ee4c9",
    installerTarget: 0x188c328,
    expectedCallbackAddress: 0x8d319c,
    evidence: "type registration materializes callback 0x8d319c and writes it to slot 4 tail callback through 0x188c328",
  },
];

const sharedSlotMechanicSpecs = [
  {
    role: "primary-slot-installer-store",
    address: 0x188c304,
    expectedOpcodeHex: "f8215922",
    evidence: "shared installer 0x188c2f4 stores x2 into the record primary slot table at [x9, w1, uxtw #3]",
  },
  {
    role: "tail-slot-installer-store",
    address: 0x188c338,
    expectedOpcodeHex: "f9002902",
    evidence: "shared installer 0x188c328 stores x2 into the slot tail-callback field at +0x50",
  },
  {
    role: "dispatcher-primary-slot-load",
    address: 0x188c684,
    expectedOpcodeHex: "f8766909",
    evidence: "shared dispatcher 0x188c638 checks the requested primary slot callback before dispatch",
  },
  {
    role: "dispatcher-tail-slot-load",
    address: 0x188c690,
    expectedOpcodeHex: "f9402908",
    evidence: "shared dispatcher 0x188c638 checks the slot tail callback at +0x50 when primary slot is empty",
  },
  {
    role: "dispatcher-enters-active-record-loop",
    address: 0x188c6a0,
    expectedOpcodeHex: "97fffe27",
    evidence: "shared dispatcher calls 0x188bf3c to iterate active records for the selected slot",
  },
  {
    role: "active-record-callback-load",
    address: 0x188bf8c,
    expectedOpcodeHex: "f8757a6b",
    evidence: "active-record iterator loads the selected slot callback pointer into x11",
  },
  {
    role: "active-record-callback-call",
    address: 0x188bf9c,
    expectedOpcodeHex: "d63f0160",
    evidence: "active-record iterator invokes the selected slot callback through blr x11",
  },
  {
    role: "tail-callback-load",
    address: 0x188bfb4,
    expectedOpcodeHex: "f9402923",
    evidence: "active-record iterator loads the selected slot tail callback into x3 after record iteration",
  },
  {
    role: "tail-callback-branch",
    address: 0x188bfd8,
    expectedOpcodeHex: "d61f0060",
    evidence: "active-record iterator tail-branches through the selected slot tail callback",
  },
];

const frameDispatchSpecs = [
  {
    slot: 2,
    slotArgAddress: 0x188e63c,
    slotArgExpectedOpcodeHex: "321f03e1",
    callerAddress: 0x188e640,
    callerExpectedOpcodeHex: "97fff7fe",
    target: 0x188c638,
  },
  {
    slot: 3,
    slotArgAddress: 0x188e68c,
    slotArgExpectedOpcodeHex: "320007e1",
    callerAddress: 0x188e690,
    callerExpectedOpcodeHex: "97fff7ea",
    target: 0x188c638,
  },
  {
    slot: 4,
    slotArgAddress: 0x188e6b4,
    slotArgExpectedOpcodeHex: "321e03e1",
    callerAddress: 0x188e6b8,
    callerExpectedOpcodeHex: "97fff7e0",
    target: 0x188c638,
  },
  {
    slot: 5,
    slotArgAddress: 0x188e6d8,
    slotArgExpectedOpcodeHex: "528000a1",
    callerAddress: 0x188e6dc,
    callerExpectedOpcodeHex: "97fff7d7",
    target: 0x188c638,
  },
  {
    slot: 6,
    slotArgAddress: 0x188e71c,
    slotArgExpectedOpcodeHex: "321f07e1",
    callerAddress: 0x188e720,
    callerExpectedOpcodeHex: "17fff7c6",
    target: 0x188c638,
  },
];

const callbackArgumentSpecs = [
  {
    role: "primary-callback-owner-table-load",
    phase: "primary-callback-argument",
    address: 0x188bf80,
    expectedOpcodeHex: "f9416a68",
    evidence: "active-record iterator loads the owner/record table used to derive the primary callback x0 argument",
  },
  {
    role: "primary-callback-record-stride-load",
    phase: "primary-callback-argument",
    address: 0x188bf84,
    expectedOpcodeHex: "b940aa69",
    evidence: "active-record iterator loads the active-record stride/count metadata before deriving callback x0",
  },
  {
    role: "primary-callback-payload-base-load",
    phase: "primary-callback-argument",
    address: 0x188bf88,
    expectedOpcodeHex: "f941666a",
    evidence: "active-record iterator loads the payload base used for primary callback x0",
  },
  {
    role: "primary-callback-index-load",
    phase: "primary-callback-argument",
    address: 0x188bf90,
    expectedOpcodeHex: "78767908",
    evidence: "active-record iterator loads the per-record index used in the callback x0 offset formula",
  },
  {
    role: "primary-callback-offset-multiply",
    phase: "primary-callback-argument",
    address: 0x188bf94,
    expectedOpcodeHex: "1b087d28",
    evidence: "active-record iterator multiplies the per-record index by the record stride",
  },
  {
    role: "primary-callback-x0-materialize",
    phase: "primary-callback-argument",
    address: 0x188bf98,
    expectedOpcodeHex: "8b080140",
    evidence: "active-record iterator materializes x0 for the primary callback before blr x11",
  },
  {
    role: "tail-callback-x0-base-load",
    phase: "tail-callback-argument",
    address: 0x188bfc0,
    expectedOpcodeHex: "f9416660",
    evidence: "active-record iterator reloads the payload base as tail callback x0",
  },
  {
    role: "tail-callback-x2-slot-pack",
    phase: "tail-callback-argument",
    address: 0x188bfc8,
    expectedOpcodeHex: "53107902",
    evidence: "active-record iterator packs the slot/phase value into tail callback x2",
  },
  {
    role: "tail-callback-x1-materialize",
    phase: "tail-callback-argument",
    address: 0x188bfcc,
    expectedOpcodeHex: "8b344521",
    evidence: "active-record iterator materializes tail callback x1 before branching through x3",
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

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function sectionForFileOffset(elf, fileOffset) {
  return (
    elf.sections.find(
      (section) => section.size && fileOffset >= section.fileOffset && fileOffset < section.fileOffset + section.size,
    ) || null
  );
}

function virtualAddressForFileOffset(elf, fileOffset) {
  for (const segment of elf.loads) {
    if (fileOffset >= segment.fileOffset && fileOffset < segment.fileOffset + segment.fileSize) {
      return segment.virtualAddress + (fileOffset - segment.fileOffset);
    }
  }
  return -1;
}

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function instructionHexAt(buffer, elf, virtualAddress) {
  const instruction = instructionAt(buffer, elf, virtualAddress);
  return instruction === null ? "" : instruction.toString(16).padStart(8, "0");
}

function parseAdrp(instruction, pc) {
  if (((instruction & 0x9f000000) >>> 0) !== 0x90000000) return null;
  const immlo = (instruction >>> 29) & 0x3;
  const immhi = (instruction >>> 5) & 0x7ffff;
  const signed = signExtend((immhi << 2) | immlo, 21);
  return {
    register: instruction & 0x1f,
    address: (pc & ~0xfff) + signed * 0x1000,
  };
}

function parseAddImmediate(instruction) {
  if (((instruction & 0xff000000) >>> 0) !== 0x91000000) return null;
  const shift = ((instruction >>> 22) & 0x3) === 1 ? 12 : 0;
  return {
    destination: instruction & 0x1f,
    source: (instruction >>> 5) & 0x1f,
    immediate: ((instruction >>> 10) & 0xfff) << shift,
  };
}

function parseDirectBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function littleEndianU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
}

function callbackPointerRows(buffer, elf, callbacks) {
  const rows = [];
  for (const callback of callbacks) {
    const needle = littleEndianU64(callback);
    let fileOffset = buffer.indexOf(needle);
    while (fileOffset >= 0) {
      const section = sectionForFileOffset(elf, fileOffset);
      if (section && callbackPointerSections.has(section.name)) {
        const virtualAddress = virtualAddressForFileOffset(elf, fileOffset);
        rows.push({
          callbackAddressHex: hex(callback),
          fileOffsetHex: hex(fileOffset),
          virtualAddressHex: hex(virtualAddress),
          section: section.name,
          renderPromotionAllowed: false,
        });
      }
      fileOffset = buffer.indexOf(needle, fileOffset + 1);
    }
  }
  return rows;
}

function registrationRow(buffer, elf, spec) {
  const adrpInstruction = instructionAt(buffer, elf, spec.adrpAddress);
  const addInstruction = instructionAt(buffer, elf, spec.addAddress);
  const branchInstruction = instructionAt(buffer, elf, spec.installerCallAddress);
  const adrp = adrpInstruction === null ? null : parseAdrp(adrpInstruction, spec.adrpAddress);
  const add = addInstruction === null ? null : parseAddImmediate(addInstruction);
  const branch = branchInstruction === null ? null : parseDirectBranch(branchInstruction, spec.installerCallAddress);
  const callbackAddress =
    adrp && add && adrp.register === add.source ? adrp.address + add.immediate : null;
  const adrpOpcodeMatches = instructionHexAt(buffer, elf, spec.adrpAddress) === spec.adrpExpectedOpcodeHex;
  const addOpcodeMatches = instructionHexAt(buffer, elf, spec.addAddress) === spec.addExpectedOpcodeHex;
  const slotArgOpcodeMatches = instructionHexAt(buffer, elf, spec.slotArgAddress) === spec.slotArgExpectedOpcodeHex;
  const flagArgOpcodeMatches =
    !spec.flagArgAddress || instructionHexAt(buffer, elf, spec.flagArgAddress) === spec.flagArgExpectedOpcodeHex;
  const callOpcodeMatches = instructionHexAt(buffer, elf, spec.installerCallAddress) === spec.installerCallExpectedOpcodeHex;
  const installerTargetMatches = branch?.target === spec.installerTarget;
  const callbackAddressMatches = callbackAddress === spec.expectedCallbackAddress;
  return {
    role: spec.role,
    slot: spec.slot,
    installKind: spec.installKind,
    adrpAddressHex: hex(spec.adrpAddress),
    adrpExpectedOpcodeHex: spec.adrpExpectedOpcodeHex,
    adrpActualOpcodeHex: instructionHexAt(buffer, elf, spec.adrpAddress),
    addAddressHex: hex(spec.addAddress),
    addExpectedOpcodeHex: spec.addExpectedOpcodeHex,
    addActualOpcodeHex: instructionHexAt(buffer, elf, spec.addAddress),
    slotArgAddressHex: hex(spec.slotArgAddress),
    slotArgExpectedOpcodeHex: spec.slotArgExpectedOpcodeHex,
    slotArgActualOpcodeHex: instructionHexAt(buffer, elf, spec.slotArgAddress),
    flagArgAddressHex: hex(spec.flagArgAddress),
    flagArgExpectedOpcodeHex: spec.flagArgExpectedOpcodeHex,
    flagArgActualOpcodeHex: spec.flagArgAddress ? instructionHexAt(buffer, elf, spec.flagArgAddress) : "",
    installerCallAddressHex: hex(spec.installerCallAddress),
    installerCallExpectedOpcodeHex: spec.installerCallExpectedOpcodeHex,
    installerCallActualOpcodeHex: instructionHexAt(buffer, elf, spec.installerCallAddress),
    installerMode: branch?.mode || "",
    installerTargetHex: hex(branch?.target),
    expectedInstallerTargetHex: hex(spec.installerTarget),
    callbackAddressHex: hex(callbackAddress),
    expectedCallbackAddressHex: hex(spec.expectedCallbackAddress),
    callbackAddressMatches,
    opcodeMatches:
      adrpOpcodeMatches &&
      addOpcodeMatches &&
      slotArgOpcodeMatches &&
      flagArgOpcodeMatches &&
      callOpcodeMatches &&
      installerTargetMatches &&
      callbackAddressMatches,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function sharedSlotMechanicRow(buffer, elf, spec) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    role: spec.role,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function frameDispatchRow(buffer, elf, spec) {
  const branchInstruction = instructionAt(buffer, elf, spec.callerAddress);
  const branch = branchInstruction === null ? null : parseDirectBranch(branchInstruction, spec.callerAddress);
  const slotArgActualOpcodeHex = instructionHexAt(buffer, elf, spec.slotArgAddress);
  const callerActualOpcodeHex = instructionHexAt(buffer, elf, spec.callerAddress);
  return {
    slot: spec.slot,
    slotArgAddressHex: hex(spec.slotArgAddress),
    slotArgExpectedOpcodeHex: spec.slotArgExpectedOpcodeHex,
    slotArgActualOpcodeHex,
    callerAddressHex: hex(spec.callerAddress),
    callerExpectedOpcodeHex: spec.callerExpectedOpcodeHex,
    callerActualOpcodeHex,
    mode: branch?.mode || "",
    targetHex: hex(branch?.target),
    expectedTargetHex: hex(spec.target),
    layoutBRelevant: spec.slot === 4,
    opcodeMatches:
      slotArgActualOpcodeHex === spec.slotArgExpectedOpcodeHex &&
      callerActualOpcodeHex === spec.callerExpectedOpcodeHex &&
      branch?.target === spec.target,
    evidence:
      spec.slot === 4
        ? "native frame phase dispatch reaches shared slot dispatcher with slot 4, which is the layout B update slot"
        : "native frame phase dispatch reaches shared slot dispatcher for a neighboring runtime phase slot",
    renderPromotionAllowed: false,
  };
}

function callbackArgumentRow(buffer, elf, spec) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    role: spec.role,
    phase: spec.phase,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBIndirectSlotAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const registrationRows = registrationSpecs.map((spec) => registrationRow(buffer, elf, spec));
  const sharedSlotMechanicRows = sharedSlotMechanicSpecs.map((spec) => sharedSlotMechanicRow(buffer, elf, spec));
  const frameDispatchRows = frameDispatchSpecs.map((spec) => frameDispatchRow(buffer, elf, spec));
  const callbackArgumentRows = callbackArgumentSpecs.map((spec) => callbackArgumentRow(buffer, elf, spec));
  const staticCallbackPointerRows = callbackPointerRows(
    buffer,
    elf,
    registrationSpecs.map((spec) => spec.expectedCallbackAddress),
  );
  const opcodeRows = [...registrationRows, ...sharedSlotMechanicRows, ...frameDispatchRows, ...callbackArgumentRows];
  const summary = {
    registrationRows: registrationRows.length,
    primarySlotInstallRows: registrationRows.filter((row) => row.installKind === "primary-slot").length,
    tailSlotInstallRows: registrationRows.filter((row) => row.installKind === "tail-slot").length,
    callbackAddressRecoveredRows: registrationRows.filter((row) => row.callbackAddressMatches).length,
    sharedSlotMechanicRows: sharedSlotMechanicRows.length,
    frameDispatchRows: frameDispatchRows.length,
    layoutBRelevantFrameDispatchRows: frameDispatchRows.filter((row) => row.layoutBRelevant).length,
    callbackArgumentRows: callbackArgumentRows.length,
    primaryCallbackArgumentRows: callbackArgumentRows.filter((row) => row.phase === "primary-callback-argument").length,
    tailCallbackArgumentRows: callbackArgumentRows.filter((row) => row.phase === "tail-callback-argument").length,
    callbackArgumentShapeRecovered: callbackArgumentRows.every((row) => row.opcodeMatches),
    staticCallbackPointerRows: staticCallbackPointerRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows: opcodeRows.filter((row) => !row.opcodeMatches).length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B indirect-slot audit; installed slot mechanics prove callback dispatch shape, not particle/PFX render permission",
    summary,
    interpretation: {
      runtimeInstall:
        "Layout B callback addresses are materialized in the type-registration function and stored into runtime record slots through shared installers 0x188c2f4 and 0x188c328.",
      noStaticPointers:
        "The recovered callback addresses do not appear as static callback pointers in data sections, so broad .data.rel.ro scanning alone cannot recover this path.",
      dispatchShape:
        "The frame phase dispatcher reaches shared slot 4 dispatch, and the shared active-record iterator calls primary callbacks through blr x11 and tail callbacks through br x3.",
      callbackArguments:
        "The active-record iterator also materializes the primary callback x0 from a runtime payload base plus indexed stride, and materializes separate x0/x1/x2 arguments for the tail callback.",
      boundary:
        "This proves the indirect callback path shape. It still does not identify the concrete PFX/emitter owner, object+0xac particle-mask producer, or effect primitive draw formula.",
    },
    unresolved: [
      "the runtime object identity that enters layout B slot 4 through the active-record iterator",
      "the concrete lifecycle/timeline source that sets object+0xac bit 0x200 before manager refresh",
      "whether the separate 0x210 primitive-builder path is connected to this slot dispatcher or a separate runtime path",
    ],
    registrationRows,
    sharedSlotMechanicRows,
    frameDispatchRows,
    callbackArgumentRows,
    staticCallbackPointerRows,
  };
}

function exportCurrentNativeLayoutBIndirectSlotAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBIndirectSlotAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.registrationRows,
      ...manifest.sharedSlotMechanicRows,
      ...manifest.frameDispatchRows.map((row) => ({ ...row, role: `frame-dispatch-slot-${row.slot}` })),
      ...manifest.callbackArgumentRows,
      ...manifest.staticCallbackPointerRows.map((row) => ({ ...row, role: "static-callback-pointer" })),
    ],
    [
      "role",
      "slot",
      "installKind",
      "phase",
      "callbackAddressHex",
      "expectedCallbackAddressHex",
      "installerCallAddressHex",
      "installerTargetHex",
      "addressHex",
      "callerAddressHex",
      "targetHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "callbackAddressMatches",
      "layoutBRelevant",
      "section",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBIndirectSlotAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBIndirectSlotAudit,
  exportCurrentNativeLayoutBIndirectSlotAudit,
};
