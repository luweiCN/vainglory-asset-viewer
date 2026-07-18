#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-slot-record-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_slot_record_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_slot_record_bridge_audit.tsv";

const moduleManagerGlobal = 0x311a958;
const sceneEntityManagerGlobal = 0x311a960;

const managerGlobalSpecs = [
  {
    role: "module-slot-manager-global-accessor",
    address: 0x188e7d4,
    expectedOpcodeHex: "9000c468",
    pairedAddress: 0x188e7d8,
    pairedExpectedOpcodeHex: "f944ad00",
    globalAddress: moduleManagerGlobal,
    evidence: "0x188e7d4 returns global 0x311a958, the module/type slot manager used by frame slot dispatch",
  },
  {
    role: "scene-entity-manager-global-accessor",
    address: 0x188e7e0,
    expectedOpcodeHex: "9000c468",
    pairedAddress: 0x188e7e4,
    pairedExpectedOpcodeHex: "f944b100",
    globalAddress: sceneEntityManagerGlobal,
    evidence: "0x188e7e0 returns global 0x311a960, the scene/entity manager used by layout B add-record and refresh",
  },
];

const frameSlot4Specs = [
  {
    role: "frame-dispatch-load-module-slot-manager",
    address: 0x188e6b0,
    expectedOpcodeHex: "f944ae60",
    evidence: "frame dispatcher reloads global 0x311a958 before slot 4 dispatch",
  },
  {
    role: "frame-dispatch-selects-slot4",
    address: 0x188e6b4,
    expectedOpcodeHex: "321e03e1",
    evidence: "frame dispatcher sets w1 to slot 4",
  },
  {
    role: "frame-dispatch-calls-shared-slot-dispatcher",
    address: 0x188e6b8,
    expectedOpcodeHex: "97fff7e0",
    evidence: "frame dispatcher calls shared slot dispatcher 0x188c638 with global 0x311a958 and slot 4",
  },
];

const dispatcherObjectSpecs = [
  {
    role: "slot-dispatcher-loads-record-storage",
    address: 0x188c670,
    expectedOpcodeHex: "f9400279",
    evidence: "shared slot dispatcher loads the runtime record storage from the module/type slot manager",
  },
  {
    role: "slot-dispatcher-materializes-record-pointer",
    address: 0x188c674,
    expectedOpcodeHex: "8b160335",
    evidence: "shared slot dispatcher materializes the per-record pointer that will be passed to slot dispatch",
  },
  {
    role: "slot-dispatcher-passes-record-pointer",
    address: 0x188c698,
    expectedOpcodeHex: "aa1503e0",
    evidence: "shared slot dispatcher passes the materialized record pointer as x0",
  },
  {
    role: "slot-dispatcher-enters-active-record-iterator",
    address: 0x188c6a0,
    expectedOpcodeHex: "97fffe27",
    evidence: "shared slot dispatcher calls active-record iterator 0x188bf3c",
  },
  {
    role: "active-record-loads-index-array",
    address: 0x188bf80,
    expectedOpcodeHex: "f9416a68",
    evidence: "active-record iterator loads the active index array from record +0x2d0",
  },
  {
    role: "active-record-loads-record-stride",
    address: 0x188bf84,
    expectedOpcodeHex: "b940aa69",
    evidence: "active-record iterator loads object stride from record +0xa8",
  },
  {
    role: "active-record-loads-object-base",
    address: 0x188bf88,
    expectedOpcodeHex: "f941666a",
    evidence: "active-record iterator loads object storage base from record +0x2c8",
  },
  {
    role: "active-record-loads-slot-callback",
    address: 0x188bf8c,
    expectedOpcodeHex: "f8757a6b",
    evidence: "active-record iterator loads the selected slot callback into x11",
  },
  {
    role: "active-record-loads-active-index",
    address: 0x188bf90,
    expectedOpcodeHex: "78767908",
    evidence: "active-record iterator loads the active object index",
  },
  {
    role: "active-record-computes-object-offset",
    address: 0x188bf94,
    expectedOpcodeHex: "1b087d28",
    evidence: "active-record iterator multiplies stride by active object index",
  },
  {
    role: "active-record-object-pointer-materialized",
    address: 0x188bf98,
    expectedOpcodeHex: "8b080140",
    evidence: "active-record iterator materializes the callback object pointer as x0",
  },
  {
    role: "active-record-calls-slot-callback-with-object",
    address: 0x188bf9c,
    expectedOpcodeHex: "d63f0160",
    evidence: "active-record iterator calls the selected layout B slot callback through blr x11 with x0 as object pointer",
  },
];

const activeRecordLayoutSpecs = [
  {
    role: "slot-dispatcher-loads-record-count",
    address: 0x188c650,
    expectedOpcodeHex: "b9400808",
    evidence: "shared slot dispatcher reads the module slot manager record count from manager +0x8",
  },
  {
    role: "slot-dispatcher-record-stride-advance",
    address: 0x188c6b4,
    expectedOpcodeHex: "910ba2d6",
    evidence: "shared slot dispatcher advances each module slot record by 0x2e8 bytes",
  },
  {
    role: "slot-dispatcher-record-count-loop-check",
    address: 0x188c6b8,
    expectedOpcodeHex: "eb0802ff",
    evidence: "shared slot dispatcher compares the record index against manager +0x8 count",
  },
  {
    role: "active-record-packed-range-load",
    address: 0x188bf4c,
    expectedOpcodeHex: "b942d808",
    evidence: "active-record iterator loads packed active range/count from record +0x2d8",
  },
  {
    role: "active-record-low-count-extract",
    address: 0x188bf5c,
    expectedOpcodeHex: "12003d0a",
    evidence: "active-record iterator extracts the low 16-bit active upper bound",
  },
  {
    role: "active-record-high-base-extract",
    address: 0x188bf60,
    expectedOpcodeHex: "5310790b",
    evidence: "active-record iterator extracts high packed bits used as the active range base",
  },
  {
    role: "active-record-start-index-compute",
    address: 0x188bf64,
    expectedOpcodeHex: "4b0b0154",
    evidence: "active-record iterator computes the first active object index before callback iteration",
  },
  {
    role: "active-record-range-bound-check",
    address: 0x188bf74,
    expectedOpcodeHex: "6b28229f",
    evidence: "active-record iterator bounds the computed start index against the active upper bound",
  },
  {
    role: "active-record-loop-index-increment",
    address: 0x188bfa4,
    expectedOpcodeHex: "910006d6",
    evidence: "active-record iterator increments the active object index after each callback",
  },
  {
    role: "active-record-loop-bound-check",
    address: 0x188bfa8,
    expectedOpcodeHex: "eb2822df",
    evidence: "active-record iterator loops until the active object index reaches the low 16-bit upper bound",
  },
];

const layoutBRegisterBridgeSpecs = [
  {
    role: "layout-b-slot0-reads-object-flags",
    address: 0x8d3110,
    expectedOpcodeHex: "b940ac02",
    evidence: "layout B slot0 reads flags from the callback object at x0+0xac",
  },
  {
    role: "layout-b-slot0-enters-register-body",
    address: 0x8d3118,
    expectedOpcodeHex: "1400021d",
    evidence: "layout B slot0 tail-branches into the register body with the same callback object pointer",
  },
  {
    role: "layout-b-register-preserves-flags",
    address: 0x8d3a00,
    expectedOpcodeHex: "2a0203f3",
    evidence: "layout B register body preserves incoming flags in w19",
  },
  {
    role: "layout-b-register-preserves-callback-object",
    address: 0x8d3a04,
    expectedOpcodeHex: "aa0003f4",
    evidence: "layout B register body preserves incoming callback object pointer in x20",
  },
  {
    role: "layout-b-register-obtains-scene-manager",
    address: 0x8d3a1c,
    expectedOpcodeHex: "943eeb71",
    evidence: "layout B register body obtains scene/entity manager 0x311a960 through 0x188e7e0",
  },
  {
    role: "layout-b-entry-pointer-from-callback-object",
    address: 0x8d3a20,
    expectedOpcodeHex: "9100c283",
    evidence: "layout B register body derives scene-manager entry pointer as callback object +0x30",
  },
  {
    role: "layout-b-forwards-object-flags",
    address: 0x8d3a28,
    expectedOpcodeHex: "2a1303e2",
    evidence: "layout B register body forwards the callback object's +0xac flags into add-record",
  },
  {
    role: "layout-b-registers-scene-manager-record",
    address: 0x8d3a2c,
    expectedOpcodeHex: "943eed2d",
    evidence: "layout B register body calls 0x188eee0 to store object+0x30 into a scene-manager record",
  },
  {
    role: "layout-b-stores-scene-record-index",
    address: 0x8d3a30,
    expectedOpcodeHex: "79016280",
    evidence: "layout B register body stores the returned scene-manager record index at callback object +0xb0",
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
  const pairedActualOpcodeHex = spec.pairedAddress ? instructionHexAt(buffer, elf, spec.pairedAddress) : "";
  return {
    stage,
    role: spec.role,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    pairedAddressHex: hex(spec.pairedAddress),
    pairedExpectedOpcodeHex: spec.pairedExpectedOpcodeHex || "",
    pairedActualOpcodeHex,
    globalAddressHex: hex(spec.globalAddress),
    opcodeMatches:
      actualOpcodeHex === spec.expectedOpcodeHex &&
      (!spec.pairedAddress || pairedActualOpcodeHex === spec.pairedExpectedOpcodeHex),
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBSlotRecordBridgeAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const managerGlobalRows = managerGlobalSpecs.map((spec) => opcodeRow(buffer, elf, spec, "manager-global"));
  const frameSlot4Rows = frameSlot4Specs.map((spec) => opcodeRow(buffer, elf, spec, "frame-slot4"));
  const dispatcherObjectRows = dispatcherObjectSpecs.map((spec) => opcodeRow(buffer, elf, spec, "slot-dispatcher-object"));
  const activeRecordLayoutRows = activeRecordLayoutSpecs.map((spec) => opcodeRow(buffer, elf, spec, "active-record-layout"));
  const layoutBRegisterBridgeRows = layoutBRegisterBridgeSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "layout-b-register-bridge"),
  );
  const opcodeRows = [
    ...managerGlobalRows,
    ...frameSlot4Rows,
    ...dispatcherObjectRows,
    ...activeRecordLayoutRows,
    ...layoutBRegisterBridgeRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const summary = {
    managerGlobalRows: managerGlobalRows.length,
    frameSlot4Rows: frameSlot4Rows.length,
    dispatcherObjectRows: dispatcherObjectRows.length,
    activeRecordLayoutRows: activeRecordLayoutRows.length,
    activeRecordRangeFormulaRecovered: activeRecordLayoutRows.every((row) => row.opcodeMatches),
    moduleSlotRecordStrideBytes: 0x2e8,
    activeObjectIndexArrayOffsetHex: "0x2d0",
    activeObjectStorageBaseOffsetHex: "0x2c8",
    activeObjectStrideOffsetHex: "0xa8",
    activeRangePackedOffsetHex: "0x2d8",
    layoutBRegisterBridgeRows: layoutBRegisterBridgeRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    slot4ToSceneRecordBridgeRecovered: opcodeMismatchRows === 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B slot-record-bridge audit; proving slot object identity flow does not prove particle draw permission or PFX ownership",
    moduleManagerGlobalHex: hex(moduleManagerGlobal),
    sceneEntityManagerGlobalHex: hex(sceneEntityManagerGlobal),
    summary,
    interpretation: {
      managerSplit:
        "Frame slot dispatch uses module/type slot manager 0x311a958, while layout B register/refresh uses scene/entity manager 0x311a960.",
      objectBridge:
        "The shared slot dispatcher materializes an active object pointer, passes it as x0 into the layout B callback, and layout B then registers x0+0x30 into the scene/entity manager record pool.",
      activeRecordLayout:
        "The module slot manager holds 0x2e8-byte records. Each record carries object storage base +0x2c8, active index array +0x2d0, packed active range +0x2d8, and object stride +0xa8; callback x0 is objectBase + stride * activeIndex.",
      boundary:
        "This closes the slot-manager-to-scene-record bridge, but not the PFX/emitter owner stored behind x0+0x30 or the producer that sets object+0xac bit 0x200.",
    },
    unresolved: [
      "the concrete PFX/emitter owner behind callback object +0x30",
      "the lifecycle/timeline condition that activates the slot-managed layout B object",
      "the exact producer of object+0xac bit 0x200 before scene-manager refresh/draw",
    ],
    managerGlobalRows,
    frameSlot4Rows,
    dispatcherObjectRows,
    activeRecordLayoutRows,
    layoutBRegisterBridgeRows,
  };
}

function exportCurrentNativeLayoutBSlotRecordBridgeAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBSlotRecordBridgeAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.managerGlobalRows,
      ...manifest.frameSlot4Rows,
      ...manifest.dispatcherObjectRows,
      ...manifest.activeRecordLayoutRows,
      ...manifest.layoutBRegisterBridgeRows,
    ],
    [
      "stage",
      "role",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "pairedAddressHex",
      "pairedExpectedOpcodeHex",
      "pairedActualOpcodeHex",
      "globalAddressHex",
      "opcodeMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBSlotRecordBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBSlotRecordBridgeAudit,
  exportCurrentNativeLayoutBSlotRecordBridgeAudit,
};
