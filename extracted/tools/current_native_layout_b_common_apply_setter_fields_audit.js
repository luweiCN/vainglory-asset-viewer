#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-common-apply-setter-fields-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_common_apply_setter_fields_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_common_apply_setter_fields_audit.tsv";

const setterSpecs = [
  [0x8d4a68, "rotation-curve-setter", "normalize-helper-call", "94000009", "", "", "0x8d4a50 normalizes the caller+0x2c scalar before storing derived state."],
  [0x8d4a6c, "rotation-curve-setter", "state-flags-load", "b9410e68", "0x10c", "load", "loads object+0x10c flags before setting bit 30."],
  [0x8d4a70, "rotation-curve-setter", "object-a8-low-float-store", "bd00aa68", "0xa8", "store", "stores only the low 32-bit float at object+0xa8; this does not write object+0xac."],
  [0x8d4a74, "rotation-curve-setter", "state-flag-bit30-set", "32020108", "0x10c", "compute", "sets object+0x10c bit 30 after the rotation scalar update."],
  [0x8d4a78, "rotation-curve-setter", "state-flags-store", "b9010e68", "0x10c", "store", "stores updated object+0x10c flags."],

  [0x8d46ec, "base-transform-setter", "transform-store-68", "2d0d326d", "0x68", "store", "stores transform/vector payload into object+0x68."],
  [0x8d46f0, "base-transform-setter", "transform-store-70", "bd00726b", "0x70", "store", "stores transform/vector payload into object+0x70."],
  [0x8d46f4, "base-transform-setter", "transform-store-74", "b9007675", "0x74", "store", "stores transform/vector flags into object+0x74."],
  [0x8d46f8, "base-transform-setter", "transform-store-78", "2d0f1269", "0x78", "store", "stores transform/vector payload into object+0x78."],
  [0x8d46fc, "base-transform-setter", "transform-store-80", "bd00826a", "0x80", "store", "stores transform/vector payload into object+0x80."],
  [0x8d4700, "base-transform-setter", "transform-store-84", "b9008676", "0x84", "store", "stores transform/vector flags into object+0x84."],
  [0x8d4704, "base-transform-setter", "transform-store-88", "2d113e68", "0x88", "store", "stores transform/vector payload into object+0x88."],
  [0x8d4708, "base-transform-setter", "transform-store-90", "bd00926e", "0x90", "store", "stores transform/vector payload into object+0x90."],
  [0x8d4710, "base-transform-setter", "transform-store-a4", "b900a668", "0xa4", "store", "stores transform/vector flags into object+0xa4."],
  [0x8d4718, "base-transform-setter", "transform-store-94", "3c894260", "0x94", "store", "stores transform/vector payload into object+0x94."],

  [0x8d47a0, "fallback-update-specialized-setter", "mode-kind-store-b8", "b900ba68", "0xb8", "store", "stores mode kind 1 into object+0xb8."],
  [0x8d47ac, "fallback-update-specialized-setter", "resource-pointer-store-58", "f9002e69", "0x58", "store", "stores caller resource pointer object+0x58."],
  [0x8d47b0, "fallback-update-specialized-setter", "resource-hash-store-60", "b9006268", "0x60", "store", "stores caller resource hash/id object+0x60."],

  [0x8d4894, "external-resource-specialized-setter", "mode-kind-store-b8", "b900ba88", "0xb8", "store", "stores mode kind 2 into object+0xb8."],
  [0x8d48a0, "external-resource-specialized-setter", "resource-pointer-store-58", "f9002e89", "0x58", "store", "stores caller resource pointer object+0x58."],
  [0x8d48a4, "external-resource-specialized-setter", "resource-hash-store-60", "b9006288", "0x60", "store", "stores caller resource hash/id object+0x60."],
  [0x8d48ac, "external-resource-specialized-setter", "external-extra-store-c0", "b900c288", "0xc0", "store", "stores external resource extra word object+0xc0."],

  [0x8d4980, "required-resource-specialized-setter", "mode-kind-store-b8", "b900ba68", "0xb8", "store", "stores mode kind 3 into object+0xb8."],
  [0x8d498c, "required-resource-specialized-setter", "resource-pointer-store-58", "f9002e69", "0x58", "store", "stores caller resource pointer object+0x58."],
  [0x8d4990, "required-resource-specialized-setter", "required-resource-id-store-bc", "b900be75", "0xbc", "store", "stores required resource id object+0xbc."],
  [0x8d4994, "required-resource-specialized-setter", "resource-hash-store-60", "b9006268", "0x60", "store", "stores caller resource hash/id object+0x60."],

  [0x8d4c74, "resource-object-setter-default", "resource-state-store-c4", "b900c408", "0xc4", "store", "stores resource mode 1 into object+0xc4."],
  [0x8d4c84, "resource-object-setter-default", "resource-pointer-store-c8", "f9006409", "0xc8", "store", "stores resource pointer object+0xc8."],
  [0x8d4c88, "resource-object-setter-default", "resource-hash-store-d0", "b900d008", "0xd0", "store", "stores resource hash object+0xd0."],
  [0x8d4c8c, "resource-object-setter-default", "resource-default-store-d8", "fd006c00", "0xd8", "store", "stores default doubleword object+0xd8."],

  [0x8d4e70, "resource-object-setter-indexed", "resource-state-store-c4", "b900c408", "0xc4", "store", "stores resource mode 1 into object+0xc4."],
  [0x8d4e7c, "resource-object-setter-indexed", "resource-pointer-store-c8", "f9006409", "0xc8", "store", "stores resource pointer object+0xc8."],
  [0x8d4e80, "resource-object-setter-indexed", "resource-index-store-d8", "291b7c02", "0xd8", "store", "stores resource index and clears object+0xdc."],
  [0x8d4e84, "resource-object-setter-indexed", "resource-hash-store-d0", "b900d008", "0xd0", "store", "stores resource hash object+0xd0."],

  [0x8d4e90, "resource-object-setter-selected", "resource-state-store-c4", "b900c408", "0xc4", "store", "stores resource mode 1 into object+0xc4."],
  [0x8d4ea0, "resource-object-setter-selected", "resource-pointer-store-c8", "f9006409", "0xc8", "store", "stores resource pointer object+0xc8."],
  [0x8d4ea4, "resource-object-setter-selected", "resource-hash-store-d0", "b900d008", "0xd0", "store", "stores resource hash object+0xd0."],
  [0x8d4ea8, "resource-object-setter-selected", "resource-selection-store-d8", "b900d80a", "0xd8", "store", "stores -1 selector object+0xd8."],
  [0x8d4eb0, "resource-object-setter-selected", "resource-selection-store-dc", "b900dc08", "0xdc", "store", "stores selected resource word object+0xdc."],

  [0x8d4ebc, "fallback-resource-state-setter", "resource-state-store-c4", "b900c408", "0xc4", "store", "stores fallback mode 2 into object+0xc4."],
  [0x8d4f40, "vector-callback-setter", "vector-hash-load", "b9400828", "0xe8", "load", "loads caller vector hash before storing object+0xe8."],
  [0x8d4f44, "vector-callback-setter", "vector-hash-store-e8", "b900e808", "0xe8", "store", "stores vector hash object+0xe8."],
  [0x8d4f4c, "vector-callback-setter", "vector-values-store-ec", "2d1d8400", "0xec", "store", "stores two vector floats object+0xec/object+0xf0."],
  [0x8d4f50, "vector-callback-setter", "vector-value-store-f4", "bd00f402", "0xf4", "store", "stores vector float object+0xf4."],
  [0x8d4f54, "vector-callback-setter", "vector-pointer-store-e0", "f9007008", "0xe0", "store", "stores vector pointer object+0xe0."],

  [0x8d4f98, "visibility-state-bit-setter", "state-byte-load-110", "39444008", "0x110", "load", "loads object+0x110 before state-bit packing."],
  [0x8d4f9c, "visibility-state-bit-setter", "state-flags-load-10c", "b9410c09", "0x10c", "load", "loads object+0x10c before state-bit packing."],
  [0x8d4fb4, "visibility-state-bit-setter", "state-byte-store-110", "39044008", "0x110", "store", "stores packed visibility byte object+0x110."],
  [0x8d4fbc, "scalar-callback-setter", "scalar-word-load", "b9400028", "0xf8", "load", "loads caller scalar word before storing object+0xf8."],
  [0x8d4fc0, "scalar-callback-setter", "scalar-word-store-f8", "b900f808", "0xf8", "store", "stores scalar word object+0xf8."],
  [0x8d4fc8, "scalar-followup-setter", "scalar-float-store-fc", "bd00fc00", "0xfc", "store", "stores scalar float object+0xfc."],
  [0x8d4fd0, "scalar-tail-setter", "scalar-qword-load", "f9400028", "0x100", "load", "loads caller qword before storing object+0x100."],
  [0x8d4fd4, "scalar-tail-setter", "scalar-qword-store-100", "f9008008", "0x100", "store", "stores scalar qword object+0x100."],
].map(([address, blockId, role, expectedOpcodeHex, objectOffsetHex, accessKind, evidence]) => ({
  address,
  blockId,
  role,
  expectedOpcodeHex,
  objectOffsetHex,
  accessKind,
  evidence,
}));

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

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    const writesObjectAc = spec.accessKind === "store" && spec.objectOffsetHex === "0xac";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      blockId: spec.blockId,
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      objectOffsetHex: spec.objectOffsetHex,
      accessKind: spec.accessKind,
      writesObjectAc,
      writesParticleMask: false,
      renderPromotionAllowed: false,
      evidence: spec.evidence,
    };
  });
}

function buildCurrentNativeLayoutBCommonApplySetterFieldsAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRowsForSpecs(buffer, elf, setterSpecs);
  const storeRows = rows.filter((row) => row.accessKind === "store");
  const uniqueStoreOffsets = [...new Set(storeRows.map((row) => row.objectOffsetHex).filter(Boolean))].sort();
  const blockIds = [...new Set(rows.map((row) => row.blockId))].sort();
  const summary = {
    setterBlockRows: blockIds.length,
    setterOpcodeRows: rows.length,
    opcodeMismatchRows: rows.filter((row) => !row.opcodeMatches).length,
    objectStoreRows: storeRows.length,
    uniqueObjectStoreOffsets: uniqueStoreOffsets.length,
    objectA8LowWordStoreRows: rows.filter((row) => row.role === "object-a8-low-float-store").length,
    objectAcStoreRows: rows.filter((row) => row.writesObjectAc).length,
    objectAcParticleMaskProducerRows: 0,
    object10cFlagRows: rows.filter((row) => row.objectOffsetHex === "0x10c").length,
    object110StateRows: rows.filter((row) => row.objectOffsetHex === "0x110").length,
    resourceStateRows: rows.filter((row) => ["0xc4", "0xc8", "0xd0", "0xd8", "0xdc"].includes(row.objectOffsetHex)).length,
    specializedResourceRows: rows.filter((row) => ["0x58", "0x60", "0xb8", "0xbc", "0xc0"].includes(row.objectOffsetHex)).length,
    vectorScalarRows: rows.filter((row) => ["0xe0", "0xe8", "0xec", "0xf4", "0xf8", "0xfc", "0x100"].includes(row.objectOffsetHex))
      .length,
    commonApplySetterFieldsRecovered: rows.every((row) => row.opcodeMatches),
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B common-apply setter-field audit; proves setter object fields without treating nearby +0xa8 low-word writes as +0xac particle flags",
    summary,
    uniqueStoreOffsets,
    interpretation: {
      recovered:
        "The common apply setter family writes layout B object state, resource pointers/hashes, vector/scalar fields, and visibility/state bytes across object+0x58..+0x110.",
      objectAcBoundary:
        "The audited setter family has zero object+0xac stores. The only nearby +0xa8 write in this family is a 32-bit float store at object+0xa8, so it does not overwrite the high word at object+0xac.",
      nextRequiredEvidence:
        "The remaining particle draw gap is still the exact runtime producer that gives the layout B object/backing flags a value containing mask 0x200.",
    },
    rows,
  };
}

function exportCurrentNativeLayoutBCommonApplySetterFieldsAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBCommonApplySetterFieldsAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.rows, [
    "addressHex",
    "blockId",
    "role",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "objectOffsetHex",
    "accessKind",
    "writesObjectAc",
    "writesParticleMask",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBCommonApplySetterFieldsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBCommonApplySetterFieldsAudit,
  exportCurrentNativeLayoutBCommonApplySetterFieldsAudit,
};
