#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultShaderParameterBridgePath = "extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderdata-type4-value-source-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderdata_type4_value_source_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderdata_type4_value_source_audit.tsv";

const semanticNameTableAddress = 0x2af8828;
const semanticNameTableRows = 23;
const semanticNameTableStride = 0x10;

const parserType4BranchSpecs = [
  [0x18a0410, "shaderdata-type4-section-count-check", "34000875", "shaderData parser enters the semantic/object parameter section only when the section count is non-zero."],
  [0x18a0434, "shaderdata-type4-record-parser-call", "94001b05", "Each semantic/object record is parsed through 0x18a7048."],
  [0x18a0440, "shaderdata-type4-key-load", "f9402be1", "The parsed semantic key pointer is loaded from the parser stack record."],
  [0x18a0444, "shaderdata-type4-kind-check-call", "940000cd", "0x18a0778 checks whether the key belongs to semantic kind 4."],
  [0x18a0454, "shaderdata-type4-branch", "360001b6", "The parser takes the object-backed path only when the semantic kind check succeeds."],
  [0x18a0458, "shaderdata-type4-index-resolve-call", "940000f9", "0x18a083c resolves the semantic key to an index in the built-in semantic table."],
  [0x18a046c, "shaderdata-type4-object-pointer-resolve-call", "94000116", "0x18a08c4 resolves the semantic index to the object pointer/value slot."],
  [0x18a0478, "shaderdata-type4-object-pointer-arg", "aa0003e2", "The resolved object pointer is forwarded as the value source to the type-4 entry writer."],
  [0x18a0480, "shaderdata-type4-entry-writer-call", "97ffee03", "The type-4 branch writes the object-backed parameter through 0x189bc8c."],
  [0x18a04ac, "shaderdata-numeric-kind-range-check", "71000d1f", "The non-type4 branch handles numeric semantic kinds 0..3 separately."],
  [0x18a0510, "shaderdata-numeric-entry-writer-call", "97ffee35", "Non-type4 semantic parameters are written through the numeric source-table wrapper 0x189bde4."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({
  stage: "shaderdata-type4-parser",
  address,
  role,
  expectedOpcodeHex,
  evidence,
}));

const type4EntryWriterSpecs = [
  [0x189bc8c, "type4-wrapper-entry", "a9bd57f6", "0x189bc8c is the wrapper reached by the shaderData type4 branch."],
  [0x189bce8, "type4-wrapper-table-arg", "aa1503e0", "The wrapper forwards the target source/parameter table to 0x189bacc."],
  [0x189bcec, "type4-wrapper-direct-flag-zero", "2a1f03e3", "The wrapper uses direct flag 0 so the stored value table slot is loaded as an object pointer at draw time."],
  [0x189bcf4, "type4-wrapper-tailcall", "17ffff76", "The wrapper tail-calls the object-backed entry writer 0x189bacc."],
  [0x189bb10, "type4-entry-object-type-mask", "1201718c", "The object-backed entry writer clears the previous type bits before storing type 4."],
  [0x189bb14, "type4-entry-object-type-store", "3202018c", "The object-backed entry writer stores type bits 0x40000000, which 0x189ca10 decodes as upload type 4."],
  [0x189bb28, "type4-entry-direct-flag-store", "3301006c", "The object-backed entry writer stores the direct/indirect value flag in entry bit 31."],
  [0x189bb3c, "type4-entry-key-hash-store", "b9000544", "The semantic key hash/id is stored at entry +0x4 for uploader matching."],
  [0x189bb58, "type4-entry-value-table-load", "f9400529", "With direct flag 0, the value table receives the object pointer value slot."],
  [0x189bb60, "type4-entry-object-pointer-store", "f8286922", "The type4 value source pointer is stored into the source/parameter value table."],
  [0x189bb7c, "type4-entry-value-count-add-two-words", "11408129", "The object pointer consumes two 32-bit value words in the source/parameter table."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({
  stage: "type4-entry-writer",
  address,
  role,
  expectedOpcodeHex,
  evidence,
}));

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function pointerHex(value) {
  return typeof value === "bigint" ? `0x${value.toString(16)}` : "";
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

function readCString(buffer, elf, virtualAddress, limit = 256) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 1);
  if (fileOffset < 0) return "";
  let end = fileOffset;
  while (end < buffer.length && buffer[end] !== 0 && end - fileOffset < limit) end += 1;
  return buffer.subarray(fileOffset, end).toString("utf8");
}

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage: spec.stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      semanticName: "",
      semanticKind: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function semanticRows(buffer, elf) {
  const rows = [];
  for (let index = 0; index < semanticNameTableRows; index += 1) {
    const address = semanticNameTableAddress + index * semanticNameTableStride;
    const pointerOffset = fileOffsetForVirtualAddress(elf, address, 8);
    const kindOffset = fileOffsetForVirtualAddress(elf, address + 8, 4);
    const namePointer = pointerOffset >= 0 ? buffer.readBigUInt64LE(pointerOffset) : 0n;
    const semanticKind = kindOffset >= 0 ? buffer.readUInt32LE(kindOffset) : null;
    const semanticName = readCString(buffer, elf, Number(namePointer));
    rows.push({
      stage: "semantic-name-table",
      role: semanticKind === 4 ? "type4-semantic-texture" : "non-type4-semantic",
      address,
      addressHex: hex(address),
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      semanticIndex: index,
      semanticNamePointerHex: pointerHex(namePointer),
      semanticName,
      semanticKind,
      evidence:
        semanticKind === 4
          ? "Built-in shaderData semantic table marks this key as object-backed texture kind 4."
          : "Built-in shaderData semantic table marks this key as a non-type4 numeric/runtime semantic.",
      renderPromotionAllowed: false,
    });
  }
  return rows;
}

function buildCurrentNativeShaderDataType4ValueSourceAudit(
  {
    binaryPath = defaultBinary,
    shaderParameterBridgePath = defaultShaderParameterBridgePath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const parserRows = opcodeRowsForSpecs(buffer, elf, parserType4BranchSpecs);
  const entryWriterRows = opcodeRowsForSpecs(buffer, elf, type4EntryWriterSpecs);
  const semanticTableRows = semanticRows(buffer, elf);
  const opcodeRows = [...parserRows, ...entryWriterRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const shaderParameterBridge = readJson(shaderParameterBridgePath, { summary: {} });
  const bridgeSummary = shaderParameterBridge.summary || {};
  const type4SemanticRows = semanticTableRows.filter((row) => row.semanticKind === 4);
  const parserType4BranchRecovered =
    opcodeMismatchRows === 0 &&
    parserRows.some((row) => row.role === "shaderdata-type4-kind-check-call" && row.opcodeMatches) &&
    parserRows.some((row) => row.role === "shaderdata-type4-entry-writer-call" && row.opcodeMatches);
  const type4EntryWriterRecovered =
    opcodeMismatchRows === 0 &&
    entryWriterRows.some((row) => row.role === "type4-entry-object-type-store" && row.opcodeMatches) &&
    entryWriterRows.some((row) => row.role === "type4-entry-object-pointer-store" && row.opcodeMatches);
  const summary = {
    parserType4BranchRows: parserRows.length,
    type4EntryWriterRows: entryWriterRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    semanticNameRows: semanticTableRows.length,
    type4SemanticRows: type4SemanticRows.length,
    parserType4BranchRecovered,
    type4EntryWriterRecovered,
    shaderParameterBridgeAgrees: Boolean(bridgeSummary.textureObjectBindingRecovered),
    shaderDataType4SemanticTextureValueSourceRecovered:
      parserType4BranchRecovered && type4EntryWriterRecovered && type4SemanticRows.length === 3,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    shaderParameterBridgePath,
    policy:
      "diagnostic-only shaderData type4 value-source audit; proves built-in semantic texture-object value source without enabling material sampler takeover",
    summary,
    type4SemanticNames: type4SemanticRows.map((row) => row.semanticName),
    interpretation: {
      recovered:
        "The current Android shaderData parser has a type4 branch for built-in semantic texture keys. It resolves a semantic key through the 23-row table at 0x2af8828, resolves the matching object pointer/value slot, and writes a type-4 source/parameter entry through 0x189bc8c -> 0x189bacc. That entry is the object-backed path later consumed by 0x189ca10 and the texture binder.",
      boundary:
        "The recovered type4 keys are built-in runtime semantic textures, currently CloudShadows.Texture, FogOfWar.Texture, and Shadowing.mMap. This does not yet prove ownership for arbitrary character-material sampler textures such as baseColor/normal/reflection samplers.",
      nextRequiredEvidence:
        "Trace non-semantic material sampler texture objects from shadergraph/texData resource records into source/program parameter tables before enabling viewer material takeover.",
    },
    items: [...opcodeRows, ...semanticTableRows],
  };
}

function exportCurrentNativeShaderDataType4ValueSourceAudit({
  binaryPath = defaultBinary,
  shaderParameterBridgePath = defaultShaderParameterBridgePath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderDataType4ValueSourceAudit({ binaryPath, shaderParameterBridgePath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "stage",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "semanticIndex",
    "semanticNamePointerHex",
    "semanticName",
    "semanticKind",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeShaderDataType4ValueSourceAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    shaderParameterBridgePath: optionValue(args, "--shader-parameter-bridge", defaultShaderParameterBridgePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderDataType4ValueSourceAudit,
  exportCurrentNativeShaderDataType4ValueSourceAudit,
};
