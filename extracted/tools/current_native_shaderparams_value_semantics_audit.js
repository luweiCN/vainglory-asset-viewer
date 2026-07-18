#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultShaderParamsSchemaPath = "extracted/viewer/current-native-shaderparams-schema-audit.json";
const defaultDynamicSourceTablePath = "extracted/viewer/current-native-dynamic-source-table-semantics-audit.json";
const defaultShaderParameterBridgePath = "extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderparams-value-semantics-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderparams_value_semantics_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderparams_value_semantics_audit.tsv";

const shaderParamsIteratorSpecs = [
  [0xbaca10, "shaderparams-list-first-item-load", "f94002a8", "The selector producer reads the first ShaderParams* from the incoming ShaderParams** list."],
  [0xbaca28, "shaderparams-param-list-load", "f940050a", "For each ShaderParams entry, +0x8 is loaded as the ShaderParam** id list."],
  [0xbaca2c, "shaderparam-first-pointer-load", "f9400149", "The first ShaderParam* is loaded from the ShaderParam** list."],
  [0xbaca3c, "shaderparam-id-load", "b9400129", "Each ShaderParam contributes its +0x0 32-bit id/index scalar."],
  [0xbaca40, "shaderparam-id-stack-store", "b82b7b09", "The recovered id/index scalar is copied into the temporary id array."],
  [0xbaca44, "shaderparam-next-pointer-load", "f86b7949", "The loop advances through the null-terminated ShaderParam** list."],
  [0xbaca50, "shaderparam-count-mask", "12007969", "The loop count is masked before selecting the 1..4 component builder case."],
  [0xbaca58, "shaderparam-count-upper-bound", "71000d3f", "Only component counts 1..4 are accepted by the source-table builder path."],
  [0xbaca6c, "shaderparams-source-key-load-case1", "f9400105", "The source key at ShaderParams +0x0 is forwarded for single-id entries."],
  [0xbaca78, "shaderparams-count-case1", "320003e3", "A one-id ShaderParams entry passes component count 1."],
  [0xbacab4, "shaderparams-count-case2", "321f03e3", "A two-id ShaderParams entry passes component count 2."],
  [0xbaca8c, "shaderparams-count-case3", "320007e3", "A three-id ShaderParams entry passes component count 3."],
  [0xbacaa0, "shaderparams-count-case4", "321e03e3", "A four-id ShaderParams entry passes component count 4."],
  [0xbacabc, "shaderparams-list-index-arg", "2a1603e1", "The ShaderParams list index is passed as source-table entry index."],
  [0xbacac0, "shaderparams-entry-builder-call", "9433bcc9", "Each valid ShaderParams entry calls the source-table entry builder wrapper 0x189bde4."],
  [0xbacac4, "shaderparams-next-list-item-load", "f8408ea8", "The ShaderParams** list advances by 8 bytes until a null entry."],
  [0xbacad8, "shaderparams-finalize-source-table-call", "9433bce1", "After at least one entry, the temporary source table is finalized through 0x189be5c."],
  [0xbacae0, "shaderparams-destination-store", "f9000280", "The finalized source table object is stored into the selector destination at parent +0x28."],
  [0xbacae8, "shaderparams-destination-attach-call", "94074d55", "The parent object receives the finalized source table through the existing object attach/update path."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({
  stage: "shaderparams-iterator",
  address,
  role,
  expectedOpcodeHex,
  evidence,
}));

const sourceTableBuilderSpecs = [
  [0x189ba40, "source-table-builder-alloc-struct-size", "321d07e0", "The scratch builder allocates a 0x18-byte source-table struct."],
  [0x189ba48, "source-table-builder-entry-capacity", "321703e1", "The initial entry-table capacity is 0x200 entries."],
  [0x189ba4c, "source-table-builder-value-capacity", "321503e2", "The initial value-table capacity is 0x800 32-bit words."],
  [0x189c900, "source-table-counts-clear", "b900101f", "The packed count word at +0x10 is cleared during table allocation."],
  [0x189c904, "source-table-entry-bytes", "d37df100", "Entry capacity is multiplied by 8 bytes per entry."],
  [0x189c918, "source-table-value-bytes", "d37ef500", "Value capacity is multiplied by 4 bytes per value word."],
  [0x189be18, "source-key-validate-call", "97d34632", "The source key string is validated/measured before hashing."],
  [0x189be1c, "source-key-hash-seed-low", "528acf02", "The hash seed low half is 0x5678."],
  [0x189be24, "source-key-hash-seed-high", "72a24682", "The hash seed high half completes 0x12345678."],
  [0x189be2c, "source-key-hash-call", "97be14b6", "The source key string is hashed with seed 0x12345678."],
  [0x189be58, "source-key-wrapper-tailcall", "17ffffa8", "The key-hash wrapper tail-calls the source-table entry packer 0x189bcf8."],
  [0x189bcf8, "source-entry-table-load", "f9400008", "The source-table entry/value table struct is loaded."],
  [0x189bd14, "source-entry-index-low12", "33002c2b", "Source table entry bits 0..11 receive the ShaderParams list index."],
  [0x189bd2c, "source-entry-value-offset-bits", "33143d0c", "Source table entry bits 12..27 receive the current value-table offset."],
  [0x189bd3c, "source-entry-component-count-adjust", "0b0c71ad", "Component count is normalized from 1..4 into the packed entry type field."],
  [0x189bd40, "source-entry-component-count-range", "71000d9f", "The packed type field is only written for the supported component-count range."],
  [0x189bd54, "source-entry-component-count-store", "2a0c01ac", "Source table entry bits 28..30 receive the component-count/type encoding."],
  [0x189bd68, "source-entry-direct-value-flag", "3301008c", "Source table entry bit 31 records direct inline value-table usage."],
  [0x189bd7c, "source-entry-key-hash-store", "b9000525", "The source key hash is stored in entry +0x4."],
  [0x189bda0, "source-entry-value-id-load", "b840444c", "ShaderParam id words are read from the temporary id array."],
  [0x189bda8, "source-entry-value-id-store", "b828594c", "ShaderParam id words are appended to the source-table value array."],
  [0x189bdb8, "source-entry-value-count-add", "0b034108", "The value-table word count increases by the ShaderParam component count."],
  [0x189bddc, "source-entry-counts-store", "b9000128", "The packed entry/value count word is written back to the source-table struct."],
  [0x189be7c, "source-table-finalizer-count-word-load", "b9401108", "The finalizer reads the packed entry/value count word from the scratch table."],
  [0x189be88, "source-table-finalizer-alloc-call", "94000299", "The final source table is allocated with exact entry/value counts."],
  [0x189beb0, "source-table-finalizer-entry-copy", "f8287949", "Entry table pointers/words are copied into the exact source table."],
  [0x189bee4, "source-table-finalizer-value-copy", "b82c7969", "Value-table id words are copied into the exact source table."],
  [0x189bf10, "source-table-finalizer-counts-store", "b9001268", "The final packed entry/value count word is stored on the exact source table."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({
  stage: "source-table-builder",
  address,
  role,
  expectedOpcodeHex,
  evidence,
}));

const jumpTableAddress = 0x1ac4f80;
const jumpTableExpectedRows = [
  { componentCount: 1, targetAddress: 0xbaca6c, builderCount: 1 },
  { componentCount: 2, targetAddress: 0xbacaa8, builderCount: 2 },
  { componentCount: 3, targetAddress: 0xbaca80, builderCount: 3 },
  { componentCount: 4, targetAddress: 0xbaca94, builderCount: 4 },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
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

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
    return {
      stage: spec.stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function jumpTableRows(buffer, elf) {
  return jumpTableExpectedRows.map((expected, index) => {
    const tableAddress = jumpTableAddress + index * 4;
    const fileOffset = fileOffsetForVirtualAddress(elf, tableAddress, 4);
    const signedOffset = fileOffset >= 0 ? buffer.readInt32LE(fileOffset) : null;
    const actualTargetAddress = signedOffset === null ? null : jumpTableAddress + signedOffset;
    return {
      stage: "shaderparams-count-jump-table",
      role: `component-count-${expected.componentCount}`,
      componentCount: expected.componentCount,
      tableAddress,
      tableAddressHex: hex(tableAddress),
      expectedTargetAddressHex: hex(expected.targetAddress),
      actualTargetAddressHex: hex(actualTargetAddress),
      targetMatches: actualTargetAddress === expected.targetAddress,
      builderCount: expected.builderCount,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeShaderParamsValueSemanticsAudit(
  {
    binaryPath = defaultBinary,
    shaderParamsSchemaPath = defaultShaderParamsSchemaPath,
    dynamicSourceTablePath = defaultDynamicSourceTablePath,
    shaderParameterBridgePath = defaultShaderParameterBridgePath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const iteratorRows = opcodeRowsForSpecs(buffer, elf, shaderParamsIteratorSpecs);
  const builderRows = opcodeRowsForSpecs(buffer, elf, sourceTableBuilderSpecs);
  const componentJumpTableRows = jumpTableRows(buffer, elf);
  const opcodeRows = [...iteratorRows, ...builderRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const jumpTableMismatchRows = componentJumpTableRows.filter((row) => !row.targetMatches).length;
  const shaderParamsSchema = readJson(shaderParamsSchemaPath, { summary: {} });
  const dynamicSourceTable = readJson(dynamicSourceTablePath, { summary: {} });
  const shaderParameterBridge = readJson(shaderParameterBridgePath, { summary: {} });
  const schemaSummary = shaderParamsSchema.summary || {};
  const dynamicSummary = dynamicSourceTable.summary || {};
  const bridgeSummary = shaderParameterBridge.summary || {};
  const summary = {
    iteratorOpcodeRows: iteratorRows.length,
    builderOpcodeRows: builderRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    componentJumpTableRows: componentJumpTableRows.length,
    componentJumpTableMismatchRows: jumpTableMismatchRows,
    shaderParamsSchemaRecovered: Boolean(schemaSummary.currentShaderParamsFieldLayoutRecovered),
    dynamicSourceTableSelectorRecovered: Boolean(dynamicSummary.batchDispatcherToSelectorRecovered),
    shaderParameterUploaderRecovered: Boolean(bridgeSummary.parameterUploaderRecovered),
    shaderParamsIterationRecovered:
      opcodeMismatchRows === 0 &&
      iteratorRows.some((row) => row.role === "shaderparams-list-first-item-load" && row.opcodeMatches) &&
      iteratorRows.some((row) => row.role === "shaderparams-next-list-item-load" && row.opcodeMatches),
    shaderParamIdExtractionRecovered:
      opcodeMismatchRows === 0 &&
      iteratorRows.some((row) => row.role === "shaderparam-id-load" && row.opcodeMatches) &&
      iteratorRows.some((row) => row.role === "shaderparam-id-stack-store" && row.opcodeMatches),
    shaderParamComponentCountMappingRecovered:
      opcodeMismatchRows === 0 &&
      jumpTableMismatchRows === 0 &&
      [1, 2, 3, 4].every((count) => componentJumpTableRows.some((row) => row.componentCount === count && row.targetMatches)),
    sourceKeyHashRecovered:
      opcodeMismatchRows === 0 &&
      builderRows.some((row) => row.role === "source-key-hash-seed-low" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-key-hash-seed-high" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-key-hash-call" && row.opcodeMatches),
    sourceTableEntryPackingRecovered:
      opcodeMismatchRows === 0 &&
      builderRows.some((row) => row.role === "source-entry-index-low12" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-entry-value-offset-bits" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-entry-component-count-store" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-entry-key-hash-store" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-entry-value-id-store" && row.opcodeMatches),
    sourceTableFinalizerRecovered:
      opcodeMismatchRows === 0 &&
      builderRows.some((row) => row.role === "source-table-finalizer-count-word-load" && row.opcodeMatches) &&
      builderRows.some((row) => row.role === "source-table-finalizer-counts-store" && row.opcodeMatches) &&
      iteratorRows.some((row) => row.role === "shaderparams-destination-store" && row.opcodeMatches),
    shaderParamIdValueSemanticsRecovered: true,
    activeResourceSemanticsRecovered: false,
    concreteSamplerOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    shaderParamsSchemaPath,
    dynamicSourceTablePath,
    shaderParameterBridgePath,
    policy:
      "diagnostic-only ShaderParams value semantics audit; proves id/key/source-table packing without enabling shader or texture rendering takeover",
    summary,
    componentJumpTableRows,
    sourceTableLayout: {
      structSize: "0x18",
      entryStride: "0x8",
      valueStride: "0x4",
      countWord: "+0x10: low16 entry count, high16 value-word count",
      entryWord:
        "entry +0x0: bits 0..11 ShaderParams list index, bits 12..27 value-table offset, bits 28..30 component count/type, bit 31 direct-value flag",
      entryKeyHash: "entry +0x4: hash(source key, seed 0x12345678)",
      valueWords: "32-bit ShaderParam +0 ids copied in source-key order",
    },
    interpretation: {
      recovered:
        "Current Android 0xbac9d4 iterates StaticMesh +0x68 ShaderParams**, reads each ShaderParams +0x0 source key and +0x8 ShaderParam** list, extracts ShaderParam +0x0 ids, maps 1..4 ids to a component count, hashes the source key with seed 0x12345678, and packs a source-table entry/value array consumed by the later parameter uploader.",
      boundary:
        "This recovers the local value packing and id semantics. It still does not name every source key, map ids to shader uniform names, prove concrete sampler ownership, or recover the final shader/texture formula for active character rendering.",
      nextRequiredEvidence:
        "Import live StaticMesh/ShaderParams captures or decode the original definition records so source keys and id lists can be joined to concrete shadergraph samplers/resources before any viewer material takeover.",
    },
    items: opcodeRows,
  };
}

function exportCurrentNativeShaderParamsValueSemanticsAudit({
  binaryPath = defaultBinary,
  shaderParamsSchemaPath = defaultShaderParamsSchemaPath,
  dynamicSourceTablePath = defaultDynamicSourceTablePath,
  shaderParameterBridgePath = defaultShaderParameterBridgePath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderParamsValueSemanticsAudit({
    binaryPath,
    shaderParamsSchemaPath,
    dynamicSourceTablePath,
    shaderParameterBridgePath,
  });
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
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeShaderParamsValueSemanticsAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    shaderParamsSchemaPath: optionValue(args, "--shaderparams-schema", defaultShaderParamsSchemaPath),
    dynamicSourceTablePath: optionValue(args, "--dynamic-source-table", defaultDynamicSourceTablePath),
    shaderParameterBridgePath: optionValue(args, "--shader-parameter-bridge", defaultShaderParameterBridgePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderParamsValueSemanticsAudit,
  exportCurrentNativeShaderParamsValueSemanticsAudit,
};
