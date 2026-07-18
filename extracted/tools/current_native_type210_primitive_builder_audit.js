#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-type210-primitive-builder-audit.json";
const defaultJsonOut = "extracted/reports/current_native_type210_primitive_builder_audit.json";
const defaultTsvOut = "extracted/reports/current_native_type210_primitive_builder_audit.tsv";

const primitiveBuilderStart = 0x8cb7fc;
const primitiveBuilderEnd = 0x8cbda4;
const slotStrideBytes = 0x18;
const requiredPrimitiveSlots = 0x12;

const opcodeSpecs = [
  {
    stage: "render-callback",
    role: "type210-render-callback-entry",
    address: 0x8cb418,
    expectedOpcodeHex: "d10343ff",
    evidence: "type 0x210 render/update callback entry builds primitive parameters before calling the local primitive builder.",
  },
  {
    stage: "render-callback",
    role: "render-callback-loads-parameter-source",
    address: 0x8cb458,
    expectedOpcodeHex: "97fe72dd",
    evidence: "render callback calls 0x867fcc before reading scalar fields used by primitive generation.",
  },
  {
    stage: "render-callback",
    role: "render-callback-builds-transform-payload",
    address: 0x8cb47c,
    expectedOpcodeHex: "9414ee6c",
    evidence: "render callback calls 0xe06e2c while building the local transform/payload used by the primitive builder.",
  },
  {
    stage: "render-callback",
    role: "render-callback-builds-render-state",
    address: 0x8cb4a0,
    expectedOpcodeHex: "97fd57cb",
    evidence: "render callback calls 0x8213cc before entering the repeated primitive write path.",
  },
  {
    stage: "render-callback",
    role: "render-callback-projects-corners",
    address: 0x8cb588,
    expectedOpcodeHex: "94151777",
    evidence: "render callback calls 0xe11364 after deriving packed corner/UV values.",
  },
  {
    stage: "render-callback",
    role: "render-callback-calls-primitive-builder",
    address: 0x8cb60c,
    expectedOpcodeHex: "9400007c",
    evidence: "type 0x210 render callback calls local primitive builder 0x8cb7fc.",
  },
  {
    stage: "capacity",
    role: "primitive-builder-capacity-count-load",
    address: 0x8cb7fc,
    expectedOpcodeHex: "29412408",
    evidence: "primitive builder loads current and capacity counts from output buffer +0x8.",
  },
  {
    stage: "capacity",
    role: "primitive-builder-capacity-remaining",
    address: 0x8cb800,
    expectedOpcodeHex: "4b080128",
    evidence: "primitive builder computes remaining output slots.",
  },
  {
    stage: "capacity",
    role: "primitive-builder-capacity-required-18",
    address: 0x8cb804,
    expectedOpcodeHex: "7100491f",
    evidence: "primitive builder requires 0x12 output slots before writing this primitive batch.",
  },
  {
    stage: "capacity",
    role: "primitive-builder-capacity-short-circuit",
    address: 0x8cb808,
    expectedOpcodeHex: "54002ccb",
    evidence: "primitive builder returns without writing when fewer than 0x12 slots remain.",
  },
  {
    stage: "record-layout",
    role: "primitive-builder-first-record-position-pair",
    address: 0x8cb83c,
    expectedOpcodeHex: "2d009141",
    evidence: "first output record writes a pair of float fields into the 0x18-byte slot.",
  },
  {
    stage: "record-layout",
    role: "primitive-builder-first-record-scalar",
    address: 0x8cb840,
    expectedOpcodeHex: "bd000147",
    evidence: "first output record writes the scalar float field at the start of the slot.",
  },
  {
    stage: "record-layout",
    role: "primitive-builder-first-record-color-byte0",
    address: 0x8cb858,
    expectedOpcodeHex: "39003149",
    evidence: "first output record copies color byte 0 from x1 into the slot color field.",
  },
  {
    stage: "record-layout",
    role: "primitive-builder-first-record-uv-pair",
    address: 0x8cb8b8,
    expectedOpcodeHex: "2d026946",
    evidence: "first output record writes the second pair of float fields into the 0x18-byte slot.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-first-pointer-advance",
    address: 0x8cb8d4,
    expectedOpcodeHex: "9100612c",
    evidence: "primitive builder advances the output pointer by 0x18 bytes for the next slot.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-first-pointer-store",
    address: 0x8cb8dc,
    expectedOpcodeHex: "f900000c",
    evidence: "primitive builder stores the advanced output pointer after writing the first slot.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-first-count-store",
    address: 0x8cb8e0,
    expectedOpcodeHex: "b900080a",
    evidence: "primitive builder stores the incremented output count after writing the first slot.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-last-pointer-advance",
    address: 0x8cbd90,
    expectedOpcodeHex: "91006108",
    evidence: "primitive builder advances by the same 0x18-byte stride for the final slot.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-final-pointer-store",
    address: 0x8cbd98,
    expectedOpcodeHex: "f9000008",
    evidence: "primitive builder stores the final advanced output pointer.",
  },
  {
    stage: "record-advance",
    role: "primitive-builder-final-count-store",
    address: 0x8cbd9c,
    expectedOpcodeHex: "b9000809",
    evidence: "primitive builder stores the final incremented output count after 18 slots.",
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
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function scanPrimitiveBuilderWrites(buffer, elf) {
  const rows = [];
  for (let address = primitiveBuilderStart; address < primitiveBuilderEnd; address += 4) {
    const instruction = instructionAt(buffer, elf, address);
    if (instruction === null) continue;
    const instructionHex = instruction.toString(16).padStart(8, "0");
    const unsigned = instruction >>> 0;
    const byteStore = ((unsigned & 0xffc00000) >>> 0) === 0x39000000;
    const byteOffset = byteStore ? ((unsigned >>> 10) & 0xfff) : null;
    let kind = "";
    if (["9100612c", "9100610a", "91006108"].includes(instructionHex)) kind = "pointer-advance-0x18";
    else if (["f900000c", "f900000a", "f9000008"].includes(instructionHex)) kind = "pointer-store";
    else if (["b900080a", "b9000809"].includes(instructionHex)) kind = "count-store";
    else if (byteStore && [0x0c, 0x0d, 0x0e, 0x0f, 0x24, 0x25, 0x26, 0x27].includes(byteOffset)) {
      kind = "color-byte-store";
    } else if (((unsigned & 0xbfc00000) >>> 0) === 0x2d000000) kind = "float-pair-store";
    else if (((unsigned & 0xffc00000) >>> 0) === 0xbd000000) kind = "float-scalar-store";
    if (!kind) continue;
    rows.push({
      address,
      addressHex: hex(address),
      kind,
      instructionHex,
      renderPromotionAllowed: false,
    });
  }
  return rows;
}

function buildCurrentNativeType210PrimitiveBuilderAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const checkedOpcodeRows = opcodeRows(buffer, elf);
  const builderWriteRows = scanPrimitiveBuilderWrites(buffer, elf);
  const opcodeMismatchRows = checkedOpcodeRows.filter((row) => !row.opcodeMatches).length;
  const primitiveBuilderCallers = findDirectBranchCallers(buffer, elf, primitiveBuilderStart);
  const renderCallbackToPrimitiveBuilderRecovered =
    primitiveBuilderCallers.length === 1 && primitiveBuilderCallers[0].callerAddress === 0x8cb60c;
  const pointerAdvanceRows = builderWriteRows.filter((row) => row.kind === "pointer-advance-0x18").length;
  const countIncrementRows = builderWriteRows.filter((row) => row.kind === "count-store").length;
  const colorByteStoreRows = builderWriteRows.filter((row) => row.kind === "color-byte-store").length;
  const floatPairStoreRows = builderWriteRows.filter((row) => row.kind === "float-pair-store").length;
  const floatScalarStoreRows = builderWriteRows.filter((row) => row.kind === "float-scalar-store").length;
  const summary = {
    opcodeRows: checkedOpcodeRows.length,
    opcodeMismatchRows,
    renderCallbackToPrimitiveBuilderRecovered,
    requiredPrimitiveSlots,
    slotStrideBytes,
    pointerAdvanceRows,
    pointerStoreRows: builderWriteRows.filter((row) => row.kind === "pointer-store").length,
    countIncrementRows,
    colorByteStoreRows,
    floatPairStoreRows,
    floatScalarStoreRows,
    fullColorRecordRows: colorByteStoreRows / 4,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only type 0x210 primitive builder audit; recovers local primitive record layout but does not enable rendering takeover",
    summary,
    interpretation: {
      callback:
        "0x8cb418 is the local type 0x210 render/update callback and 0x8cb60c calls primitive builder 0x8cb7fc.",
      capacity:
        "0x8cb7fc loads output counts, computes remaining slots, and requires 0x12 slots before writing this batch.",
      recordLayout:
        "The primitive builder advances the output pointer by 0x18 bytes per slot, writes 18 slots, copies four color bytes per slot, and writes two float pairs plus one scalar float per slot.",
      boundary:
        "This is still a local primitive-builder path, not the shared particle draw queue path. Rendering remains disabled until material/shader semantics and owner timing are tied to the original runtime.",
    },
    unresolved: [
      "the exact semantic names of the 0x18-byte primitive record fields",
      "the material/shader state consumed with these local primitive records",
      "the action/timeline condition that activates the 0x210 render callback",
    ],
    primitiveBuilderCallers,
    opcodeRows: checkedOpcodeRows,
    builderWriteRows,
  };
}

function exportCurrentNativeType210PrimitiveBuilderAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeType210PrimitiveBuilderAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, [...manifest.opcodeRows, ...manifest.builderWriteRows], [
    "stage",
    "role",
    "kind",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "instructionHex",
    "opcodeMatches",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeType210PrimitiveBuilderAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeType210PrimitiveBuilderAudit,
  exportCurrentNativeType210PrimitiveBuilderAudit,
};
