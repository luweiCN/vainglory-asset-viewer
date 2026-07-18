#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-target-status-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_target_status_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_target_status_audit.tsv";

const evidenceSpecs = [
  {
    address: 0xe39570,
    role: "target-status-state1-load",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7940c808",
    evidence: "target helper loads target+0x64 before validating and setting low state 1.",
  },
  {
    address: 0xe39590,
    role: "target-status-state1-store",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7900c808",
    evidence: "target helper stores low state 1 back into target+0x64.",
  },
  {
    address: 0xe395bc,
    role: "target-status-state4-load",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7940c808",
    evidence: "target helper loads target+0x64 before changing low state to 4.",
  },
  {
    address: 0xe395dc,
    role: "target-status-state4-store",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7900c808",
    evidence: "target helper stores low state 4 back into target+0x64.",
  },
  {
    address: 0xe395e4,
    role: "target-status-state5-load",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7940c808",
    evidence: "target helper loads target+0x64 before forcing low state 5.",
  },
  {
    address: 0xe395f4,
    role: "target-status-state5-store",
    stage: "target-status-low-state",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7900c808",
    evidence: "target helper stores low state 5 back into target+0x64.",
  },
  {
    address: 0xe3cde4,
    role: "target-status-bit-0x200-load",
    stage: "target-status-bit-0x200",
    field: "target+0x64 bit 9",
    expectedOpcodeHex: "7940c808",
    evidence: "target status helper loads target+0x64 before setting target-local bit 0x200.",
  },
  {
    address: 0xe3cde8,
    role: "target-status-or-bit-0x200",
    stage: "target-status-bit-0x200",
    field: "target+0x64 bit 9",
    expectedOpcodeHex: "32170108",
    evidence: "target status helper ORs bit 0x200 into target+0x64; this is target status, not object+0xac draw flags.",
  },
  {
    address: 0xe3cdec,
    role: "target-status-bit-0x200-store",
    stage: "target-status-bit-0x200",
    field: "target+0x64 bit 9",
    expectedOpcodeHex: "7900c808",
    evidence: "target status helper stores the 0x200-marked value back into target+0x64.",
  },
  {
    address: 0x8d3158,
    role: "layout-b-slot4-target-status-load",
    stage: "layout-b-target-status-gate",
    field: "target+0x64 bits 3..5",
    expectedOpcodeHex: "7940c908",
    evidence: "layout B slot4 loads target+0x64 to choose a target-state branch, not object+0xac.",
  },
  {
    address: 0x8d315c,
    role: "layout-b-slot4-target-status-mask",
    stage: "layout-b-target-status-gate",
    field: "target+0x64 bits 3..5",
    expectedOpcodeHex: "121d0908",
    evidence: "layout B slot4 masks target+0x64 bits 3..5 before comparing state.",
  },
  {
    address: 0x8d3160,
    role: "layout-b-slot4-target-status-0x28-compare",
    stage: "layout-b-target-status-gate",
    field: "target+0x64 bits 3..5",
    expectedOpcodeHex: "7100a11f",
    evidence: "layout B slot4 compares target+0x64 masked value with 0x28; this branch is target status, not object+0xac.",
  },
  {
    address: 0x8d50f4,
    role: "layout-b-target-status-predicate-load",
    stage: "layout-b-target-status-gate",
    field: "target+0x64 bits 3..5",
    expectedOpcodeHex: "7940c908",
    evidence: "layout B predicate helper loads target+0x64 before checking status bits.",
  },
  {
    address: 0x8d5104,
    role: "layout-b-target-status-predicate-compare",
    stage: "layout-b-target-status-gate",
    field: "target+0x64 bits 3..5",
    expectedOpcodeHex: "71000d1f",
    evidence: "layout B predicate helper compares the normalized target status with 3.",
  },
  {
    address: 0x8d4584,
    role: "object-state-bit1-store",
    stage: "object-state-target-mirror",
    field: "object+0x110 bit 1",
    expectedOpcodeHex: "3904400a",
    evidence: "layout B setter stores the caller boolean into object+0x110 bit 1.",
  },
  {
    address: 0x8d4598,
    role: "object-state-bit1-target-bit11-mirror",
    stage: "object-state-target-mirror",
    field: "target+0x64 bit 11",
    expectedOpcodeHex: "7900c928",
    evidence: "the same setter mirrors object+0x110 bit 1 to target+0x64 bit 11.",
  },
  {
    address: 0xe39878,
    role: "target-status-draw-predicate-load",
    stage: "target-status-predicate",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "7940c808",
    evidence: "target predicate helper loads target+0x64 before computing a low-state predicate.",
  },
  {
    address: 0xe39888,
    role: "target-status-draw-predicate-table-test",
    stage: "target-status-predicate",
    field: "target+0x64 low bits",
    expectedOpcodeHex: "1ac82528",
    evidence: "target predicate helper maps the low status bits through a compact bit table.",
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

function opcodeRows(buffer, elf) {
  return evidenceSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      role: spec.role,
      stage: spec.stage,
      field: spec.field,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter((row) => row.opcodeMatches && predicate(row)).length;
}

function buildCurrentNativeLayoutBTargetStatusAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    targetStatusLowStateRows: countRows(rows, (row) => row.stage === "target-status-low-state"),
    targetStatusBit200Rows: countRows(rows, (row) => row.stage === "target-status-bit-0x200"),
    layoutBTargetStatusGateRows: countRows(rows, (row) => row.stage === "layout-b-target-status-gate"),
    object110MirrorRows: countRows(rows, (row) => row.stage === "object-state-target-mirror"),
    targetStatusPredicateRows: countRows(rows, (row) => row.stage === "target-status-predicate"),
    targetStatusSeparatedFromObjectAc: opcodeMismatchRows === 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only current Android layout B target+0x64 status evidence; this separates target status from object+0xac draw flags and does not grant particle renderer permission",
    summary,
    interpretation: {
      recovered:
        "Target +0x64 has its own low-state helpers, a target-local 0x200 bit setter, layout B target-status gates, and object+0x110-to-target+0x64 mirroring.",
      boundary:
        "The target-local +0x64 status bits are not the backing-record draw flags. Particle draw still filters backing +0x18, whose source remains layout B object+0xac.",
      nextRequiredEvidence:
        "Trace the producer that gives live layout B object+0xac a particle-capable value and the consumer that turns target+0x40 payload records into concrete PFX draw primitives.",
    },
    opcodeRows: rows,
  };
}

function exportCurrentNativeLayoutBTargetStatusAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBTargetStatusAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.opcodeRows, [
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
  const summary = exportCurrentNativeLayoutBTargetStatusAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBTargetStatusAudit,
  exportCurrentNativeLayoutBTargetStatusAudit,
};
