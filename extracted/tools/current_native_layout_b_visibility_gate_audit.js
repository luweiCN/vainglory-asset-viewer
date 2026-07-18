#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-visibility-gate-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_visibility_gate_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_visibility_gate_audit.tsv";

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

function evidenceRow({ buffer, elf, address, role, expectedOpcodeHex, field, stage, evidence }) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, address);
  return {
    id: `${role}-${hex(address)}`,
    address,
    addressHex: hex(address),
    role,
    stage,
    field,
    expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === expectedOpcodeHex,
    evidence,
    renderPromotionAllowed: false,
  };
}

function buildEvidenceRows(buffer, elf) {
  const row = (definition) => evidenceRow({ buffer, elf, ...definition });
  return [
    row({
      address: 0x8d2e38,
      role: "constructor-state-byte-default",
      stage: "constructor",
      field: "object+0x110",
      expectedOpcodeHex: "3904426a",
      evidence: "constructor writes state byte with default bit 4 set, after preserving high state bits",
    }),
    row({
      address: 0x8d41d4,
      role: "packed-param-slot0-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 0..4",
      expectedOpcodeHex: "b9010e69",
      evidence: "parameter loader stores slot 0 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d4200,
      role: "packed-param-slot1-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 5..9",
      expectedOpcodeHex: "b9010e68",
      evidence: "parameter loader stores slot 1 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d422c,
      role: "packed-param-slot2-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 10..14",
      expectedOpcodeHex: "b9010e68",
      evidence: "parameter loader stores slot 2 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d4258,
      role: "packed-param-slot3-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 15..19",
      expectedOpcodeHex: "b9010e68",
      evidence: "parameter loader stores slot 3 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d4284,
      role: "packed-param-slot4-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 20..24",
      expectedOpcodeHex: "b9010e68",
      evidence: "parameter loader stores slot 4 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d42a4,
      role: "packed-param-slot5-store",
      stage: "parameter-pack",
      field: "object+0x10c bits 25..29",
      expectedOpcodeHex: "b9010e68",
      evidence: "parameter loader stores slot 5 into the packed runtime parameter word",
    }),
    row({
      address: 0x8d4584,
      role: "state-byte-bit1-store",
      stage: "state-bit-writer",
      field: "object+0x110 bit 1",
      expectedOpcodeHex: "3904400a",
      evidence: "setter writes caller boolean into state byte bit 1 and mirrors it into target object+0x64 bit 11",
    }),
    row({
      address: 0x8d4598,
      role: "target-state-bit11-mirror",
      stage: "state-bit-writer",
      field: "target+0x64 bit 11",
      expectedOpcodeHex: "7900c928",
      evidence: "the same setter mirrors object+0x110 bit 1 to the target render/state object",
    }),
    row({
      address: 0x8d4a78,
      role: "packed-param-dirty-bit-store",
      stage: "parameter-pack",
      field: "object+0x10c bit 30",
      expectedOpcodeHex: "b9010e68",
      evidence: "a float setter stores object+0xa8 and marks packed parameter bit 30 dirty; it does not touch object+0xac",
    }),
    row({
      address: 0x8d4fb4,
      role: "state-byte-bit2-store",
      stage: "state-bit-writer",
      field: "object+0x110 bit 2",
      expectedOpcodeHex: "39044008",
      evidence: "setter writes caller boolean into state byte bit 2",
    }),
    row({
      address: 0x8d5078,
      role: "refresh-gate-state-byte-load-for-event-bit5",
      stage: "manager-refresh-gate",
      field: "object+0x110 bits 3..4",
      expectedOpcodeHex: "39444269",
      evidence: "manager refresh gate loads the state byte when the event byte has bit 5 set",
    }),
    row({
      address: 0x8d5084,
      role: "refresh-gate-state-bits-mask",
      stage: "manager-refresh-gate",
      field: "object+0x110 bits 3..4",
      expectedOpcodeHex: "925d0529",
      evidence: "manager refresh gate masks state bits 3..4 before deciding whether to suppress flags",
    }),
    row({
      address: 0x8d508c,
      role: "refresh-gate-zero-on-state-0x10",
      stage: "manager-refresh-gate",
      field: "backing flags",
      expectedOpcodeHex: "54000100",
      evidence: "when state bits equal 0x10 in this path, refresh jumps to the zero-flags branch",
    }),
    row({
      address: 0x8d5094,
      role: "refresh-gate-pass-object-flags",
      stage: "manager-refresh-gate",
      field: "object+0xac",
      expectedOpcodeHex: "b940ae68",
      evidence: "when gate conditions allow it, refresh passes object+0xac to the backing record",
    }),
    row({
      address: 0x8d509c,
      role: "refresh-gate-state-byte-load-for-zero-event",
      stage: "manager-refresh-gate",
      field: "object+0x110 bits 3..4",
      expectedOpcodeHex: "39444269",
      evidence: "when the event byte low five bits are zero, refresh checks state bits 3..4 before deciding the branch",
    }),
    row({
      address: 0x8d50a4,
      role: "refresh-gate-zero-event-state-test",
      stage: "manager-refresh-gate",
      field: "object+0x110 bits 3..4",
      expectedOpcodeHex: "f25d053f",
      evidence: "zero-event refresh tests state bits 3..4; nonzero state suppresses the object+0xac flags",
    }),
    row({
      address: 0x8d50ac,
      role: "refresh-gate-zero-flags",
      stage: "manager-refresh-gate",
      field: "backing flags",
      expectedOpcodeHex: "2a1f03e8",
      evidence: "suppressed branch writes zero to the stack flag slot instead of object+0xac",
    }),
    row({
      address: 0x8d50b0,
      role: "refresh-gate-stack-flag-store",
      stage: "manager-refresh-gate",
      field: "stack flag slot",
      expectedOpcodeHex: "b90007e8",
      evidence: "the chosen flag value, either object+0xac or zero, is stored to the stack flag slot",
    }),
    row({
      address: 0x8d50bc,
      role: "refresh-gate-stack-flag-pointer",
      stage: "manager-refresh-gate",
      field: "stack flag slot",
      expectedOpcodeHex: "910013e3",
      evidence: "layout B passes the chosen stack flag pointer to the shared manager refresh function",
    }),
    row({
      address: 0x8d50c4,
      role: "refresh-gate-manager-refresh-call",
      stage: "manager-refresh-gate",
      field: "backing record+0x18",
      expectedOpcodeHex: "943ee7d7",
      evidence: "shared manager refresh writes the chosen flags into backing record+0x18 through the backing vtable",
    }),
  ];
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function buildCurrentNativeLayoutBVisibilityGateAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const items = buildEvidenceRows(buffer, elf);
  const byStage = Object.create(null);
  for (const item of items) increment(byStage, item.stage);
  const summary = {
    rows: items.length,
    opcodeMismatchRows: items.filter((row) => !row.opcodeMatches).length,
    constructorDefaultStateRows: items.filter((row) => row.role === "constructor-state-byte-default" && row.opcodeMatches).length,
    packedParameterRows: items.filter((row) => row.stage === "parameter-pack" && row.opcodeMatches).length,
    stateBitWriterRows: items.filter((row) => row.stage === "state-bit-writer" && row.opcodeMatches).length,
    managerRefreshGateRows: items.filter((row) => row.stage === "manager-refresh-gate" && row.opcodeMatches).length,
    gateCanPassObjectAcRows: items.filter((row) => row.role === "refresh-gate-pass-object-flags" && row.opcodeMatches).length,
    gateCanZeroBackingFlagsRows: items.filter((row) => row.role === "refresh-gate-zero-flags" && row.opcodeMatches).length,
    renderPromotionAllowedRows: 0,
    byStage,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B visibility/state gate evidence; this explains when object+0xac is passed or zeroed during manager refresh, but it is not a particle/effect renderer permission",
    summary,
    interpretation: {
      recovered:
        "Current layout B manager refresh gates backing record flags through event-byte checks and object+0x110 bits before passing either object+0xac or zero to 0x188f020.",
      boundary:
        "This still does not prove any producer for object+0xac bit 0x200. It only proves the visibility gate that can suppress or forward the already-existing object+0xac value.",
      nextRequiredEvidence:
        "Trace the runtime owner that sets object+0x110 bits 3..4 and the owner/resource path that supplies a particle-capable object+0xac value before registration or refresh.",
    },
    items,
  };
}

function exportCurrentNativeLayoutBVisibilityGateAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBVisibilityGateAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "addressHex",
    "role",
    "stage",
    "field",
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
  const summary = exportCurrentNativeLayoutBVisibilityGateAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBVisibilityGateAudit,
  exportCurrentNativeLayoutBVisibilityGateAudit,
};
