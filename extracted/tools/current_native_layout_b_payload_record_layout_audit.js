#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-payload-record-layout-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_payload_record_layout_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_payload_record_layout_audit.tsv";

const opcodeSpecs = [
  {
    stage: "target-payload-source",
    role: "target-payload-builder-adds-0x40",
    address: 0xe3a510,
    expectedOpcodeHex: "91010000",
    evidence: "0xe3a510 materializes target+0x40 as the payload pointer.",
  },
  {
    stage: "target-payload-source",
    role: "layout-b-refresh-payload-target-plus-0x40",
    address: 0x8d4124,
    expectedOpcodeHex: "aa0003e2",
    evidence: "layout B final dispatch forwards target+0x40 as x2 to manager refresh.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-record-base",
    address: 0x18bf5e4,
    expectedOpcodeHex: "91004008",
    evidence: "backing vtable +0x20 computes backing payload array base as backing object+0x10.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-record-index-mask",
    address: 0x18bf5e8,
    expectedOpcodeHex: "12003c29",
    evidence: "backing vtable +0x20 masks the manager/backing record index to 16 bits before indexing the payload array.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-payload-null-gate",
    address: 0x18bf5ec,
    expectedOpcodeHex: "b40000e2",
    evidence: "backing vtable +0x20 skips target+0x40 payload copy when x2 is null.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-payload-qword-load",
    address: 0x18bf5f0,
    expectedOpcodeHex: "f940084a",
    sourceOffsetBytes: 0x10,
    copiedBytes: 8,
    evidence: "backing vtable +0x20 loads the qword field from payload x2+0x10.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-record-stride-0x30",
    address: 0x18bf5f4,
    expectedOpcodeHex: "321c07eb",
    evidence: "backing vtable +0x20 materializes record stride 0x30 before indexed payload storage.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-record-address",
    address: 0x18bf5f8,
    expectedOpcodeHex: "9b0b212b",
    evidence: "backing vtable +0x20 computes record address as backing+0x10+index*0x30.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-payload-qword-store",
    address: 0x18bf5fc,
    expectedOpcodeHex: "f900096a",
    destinationOffsetBytes: 0x10,
    copiedBytes: 8,
    evidence: "backing vtable +0x20 stores the qword field at payload record+0x10.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-payload-vector-load",
    address: 0x18bf600,
    expectedOpcodeHex: "3dc00040",
    sourceOffsetBytes: 0,
    copiedBytes: 16,
    evidence: "backing vtable +0x20 loads the vector field from payload x2+0x0.",
  },
  {
    stage: "backing-record-copy",
    role: "backing-refresh-payload-vector-store",
    address: 0x18bf604,
    expectedOpcodeHex: "3d800160",
    destinationOffsetBytes: 0,
    copiedBytes: 16,
    evidence: "backing vtable +0x20 stores the vector field at payload record+0x0.",
  },
  {
    stage: "backing-flag-refresh",
    role: "backing-refresh-flags-null-gate",
    address: 0x18bf608,
    expectedOpcodeHex: "b40000a3",
    evidence: "backing vtable +0x20 skips flag refresh when x3 is null.",
  },
  {
    stage: "backing-flag-refresh",
    role: "backing-refresh-flags-load",
    address: 0x18bf60c,
    expectedOpcodeHex: "7940006a",
    sourceOffsetBytes: 0,
    copiedBytes: 2,
    evidence: "backing vtable +0x20 loads refreshed 16-bit flags from x3+0.",
  },
  {
    stage: "backing-flag-refresh",
    role: "backing-refresh-flags-store",
    address: 0x18bf618,
    expectedOpcodeHex: "7900310a",
    destinationOffsetBytes: 0x18,
    copiedBytes: 2,
    evidence: "backing vtable +0x20 stores refreshed flags at backing payload record+0x18, separate from the 24-byte payload.",
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

function instructionAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset) : null;
}

function opcodeRows(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const instruction = instructionAt(buffer, elf, spec.address);
    const actualOpcodeHex = instruction === null ? "" : instruction.toString(16).padStart(8, "0");
    return {
      ...spec,
      addressHex: hex(spec.address),
      sourceOffsetHex: spec.sourceOffsetBytes === undefined ? "" : hex(spec.sourceOffsetBytes),
      destinationOffsetHex: spec.destinationOffsetBytes === undefined ? "" : hex(spec.destinationOffsetBytes),
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBPayloadRecordLayoutAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const hasRole = (role) => rows.some((row) => row.role === role && row.opcodeMatches);
  const vectorLoad = rows.find((row) => row.role === "backing-refresh-payload-vector-load");
  const qwordLoad = rows.find((row) => row.role === "backing-refresh-payload-qword-load");
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    targetPlus40Forwarded: hasRole("target-payload-builder-adds-0x40") && hasRole("layout-b-refresh-payload-target-plus-0x40"),
    targetPayloadCopyRecovered:
      hasRole("backing-refresh-payload-vector-load") &&
      hasRole("backing-refresh-payload-vector-store") &&
      hasRole("backing-refresh-payload-qword-load") &&
      hasRole("backing-refresh-payload-qword-store"),
    payloadAndFlagSeparated: hasRole("backing-refresh-flags-store"),
    payloadRecordStrideBytes: 0x30,
    backingPayloadBaseOffset: 0x10,
    payloadVectorSourceOffset: vectorLoad?.sourceOffsetBytes ?? null,
    payloadQwordSourceOffset: qwordLoad?.sourceOffsetBytes ?? null,
    payloadCopiedBytes: (vectorLoad?.copiedBytes || 0) + (qwordLoad?.copiedBytes || 0),
    backingPayloadFlagOffset: 0x18,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only target+0x40 payload record layout audit; proves backing record copy offsets but does not enable PFX renderer takeover",
    summary,
    interpretation: {
      source:
        "layout B forwards target+0x40 as x2. The backing refresh implementation treats it as a 24-byte payload record: qword at +0x10 and vector at +0.",
      destination:
        "backing refresh computes backing+0x10+index*0x30, stores the vector at record+0 and qword at record+0x10, then optionally stores refreshed flags at record+0x18.",
      boundary:
        "This proves payload record shape and flag separation, not the semantic formula for those fields or a concrete PFX/emitter draw command.",
    },
    unresolved: [
      "the semantic meaning of the 16-byte vector payload field",
      "the semantic meaning of the 8-byte qword payload field",
      "which downstream draw code consumes the payload record fields after particle manager filtering",
    ],
    opcodeRows: rows,
  };
}

function exportCurrentNativeLayoutBPayloadRecordLayoutAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBPayloadRecordLayoutAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.opcodeRows, [
    "stage",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "sourceOffsetHex",
    "destinationOffsetHex",
    "copiedBytes",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBPayloadRecordLayoutAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBPayloadRecordLayoutAudit,
  exportCurrentNativeLayoutBPayloadRecordLayoutAudit,
};
