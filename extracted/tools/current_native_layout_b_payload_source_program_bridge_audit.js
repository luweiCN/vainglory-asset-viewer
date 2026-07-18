#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-payload-source-program-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_payload_source_program_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_payload_source_program_bridge_audit.tsv";

const schemaSourceObjectSpecs = [
  {
    role: "schema-mode-source-object-range-sub",
    address: 0xe3bc20,
    expectedOpcodeHex: "5100110a",
    evidence: "Schema binding subtracts 4 from the low primitive mode to gate source/program object construction.",
  },
  {
    role: "schema-mode-source-object-range-cmp",
    address: 0xe3bc24,
    expectedOpcodeHex: "7100155f",
    evidence: "Schema binding accepts low modes 4..8 for source/program object construction.",
  },
  {
    role: "schema-mode-source-object-range-branch",
    address: 0xe3bc2c,
    expectedOpcodeHex: "54000222",
    evidence: "Modes outside 4..8 fall through unless the later mode-1 branch accepts the same source path.",
  },
  {
    role: "schema-source-key-byte-load",
    address: 0xe3bc34,
    expectedOpcodeHex: "38428c48",
    evidence: "Schema binding reads the first source/program resource-key byte from schema +0x28.",
  },
  {
    role: "schema-source-key-empty-branch",
    address: 0xe3bc38,
    expectedOpcodeHex: "34000208",
    evidence: "Empty source/program key skips node +0x208 source object construction.",
  },
  {
    role: "schema-source-key-wrapper-call",
    address: 0xe3bc48,
    expectedOpcodeHex: "97fcc7b3",
    evidence: "Schema binding builds a bounded string/key wrapper from schema +0x28 before source lookup.",
  },
  {
    role: "schema-source-wrapper-owner-load-a",
    address: 0xe3bc54,
    expectedOpcodeHex: "f94002c0",
    evidence: "Schema binding loads the source/program table owner from the temporary wrapper before lookup/register.",
  },
  {
    role: "schema-source-register-call",
    address: 0xe3bc58,
    expectedOpcodeHex: "942980eb",
    evidence: "Schema binding calls 0x189c004 to register or find the source/program table object for the key.",
  },
  {
    role: "schema-source-wrapper-owner-load-b",
    address: 0xe3bc5c,
    expectedOpcodeHex: "f94002c0",
    evidence: "Schema binding reloads the same source/program table owner before fallback payload binding.",
  },
  {
    role: "schema-source-fallback-bind-call",
    address: 0xe3bc64,
    expectedOpcodeHex: "94298143",
    evidence: "Schema binding calls 0x189c170 to attach or resolve the fallback parameter payload for the same key.",
  },
  {
    role: "schema-source-object-store",
    address: 0xe3bc68,
    expectedOpcodeHex: "f90106e0",
    evidence: "Schema binding stores the resolved source/program object into payload node +0x208.",
  },
  {
    role: "schema-mode-one-source-cmp",
    address: 0xe3bc70,
    expectedOpcodeHex: "7100051f",
    evidence: "Schema binding also permits low primitive mode 1 to use the same source/program construction path.",
  },
  {
    role: "schema-mode-one-source-branch",
    address: 0xe3bc74,
    expectedOpcodeHex: "54fffde0",
    evidence: "Mode 1 branches back to the schema +0x28 source/program construction path.",
  },
];

const sourceObjectFactorySpecs = [
  {
    role: "source-register-entry",
    address: 0x189c004,
    expectedOpcodeHex: "d10183ff",
    evidence: "0x189c004 enters the source/program register-or-find path used by payload node +0x208 construction.",
  },
  {
    role: "source-register-cache-load",
    address: 0x189c030,
    expectedOpcodeHex: "f9401008",
    evidence: "0x189c004 checks the source/program owner cache at owner +0x20 before key lookup.",
  },
  {
    role: "source-register-key-hash-call",
    address: 0x189c050,
    expectedOpcodeHex: "97be142d",
    evidence: "0x189c004 hashes the source/program key with the same 0x12345678-seeded helper used by other resource maps.",
  },
  {
    role: "source-register-tree-head-load",
    address: 0x189c058,
    expectedOpcodeHex: "f8408d2a",
    evidence: "0x189c004 enters the owner tree keyed by the hashed source/program key.",
  },
  {
    role: "source-register-existing-payload-load",
    address: 0x189c094,
    expectedOpcodeHex: "f9401508",
    evidence: "0x189c004 can reuse an existing source/program payload object from tree node +0x28.",
  },
  {
    role: "source-register-owner-allocator-load",
    address: 0x189c09c,
    expectedOpcodeHex: "f9400e80",
    evidence: "When no existing object is found, 0x189c004 loads owner +0x18 to allocate a source/program payload object.",
  },
  {
    role: "source-register-allocate-call",
    address: 0x189c0a0,
    expectedOpcodeHex: "94000ef8",
    evidence: "0x189c004 calls 0x189fc80 to allocate the source/program payload object.",
  },
  {
    role: "source-register-key-store",
    address: 0x189c0c4,
    expectedOpcodeHex: "b90006c0",
    evidence: "0x189c004 stores the resource-key hash into the allocated source/program payload object.",
  },
  {
    role: "source-register-tree-insert-call",
    address: 0x189c0dc,
    expectedOpcodeHex: "940000d4",
    evidence: "0x189c004 inserts the allocated source/program object into the owner tree.",
  },
  {
    role: "source-register-owner-cache-load",
    address: 0x189c0e0,
    expectedOpcodeHex: "f9401280",
    evidence: "0x189c004 loads owner +0x20 before dispatching the source/program table builder callback.",
  },
  {
    role: "source-register-builder-dispatch",
    address: 0x189c0f4,
    expectedOpcodeHex: "d63f0100",
    evidence: "0x189c004 dispatches the source/program table builder callback through owner cache vtable slot +0x10.",
  },
  {
    role: "source-fallback-bind-entry",
    address: 0x189c170,
    expectedOpcodeHex: "a9be4ff4",
    evidence: "0x189c170 enters the fallback-parameter payload binding path for the same source/program key.",
  },
  {
    role: "source-fallback-key-hash-call",
    address: 0x189c19c,
    expectedOpcodeHex: "97be13da",
    evidence: "0x189c170 hashes the source/program key before looking up an existing fallback payload.",
  },
  {
    role: "source-fallback-existing-payload-load",
    address: 0x189c1e0,
    expectedOpcodeHex: "f9401501",
    evidence: "0x189c170 can load the existing fallback parameter payload from tree node +0x28.",
  },
  {
    role: "source-fallback-owner-load",
    address: 0x189c1ec,
    expectedOpcodeHex: "f9400e60",
    evidence: "0x189c170 loads owner +0x18 before attaching the fallback payload.",
  },
  {
    role: "source-fallback-attach-tailcall",
    address: 0x189c1f8,
    expectedOpcodeHex: "14000e63",
    evidence: "0x189c170 tail-calls 0x189fb84 to attach the fallback parameter payload to the source/program object.",
  },
];

const drawSourceProgramSpecs = [
  {
    role: "draw-payload-source-object-load",
    address: 0xe3d064,
    expectedOpcodeHex: "f9410695",
    evidence: "Final draw loads the payload node +0x208 source/program object.",
  },
  {
    role: "draw-selected-source-index-load",
    address: 0xe3d070,
    expectedOpcodeHex: "394a8108",
    evidence: "Final draw reads global selected source index byte 0x311a2a0.",
  },
  {
    role: "draw-source-table-base-load",
    address: 0xe3d074,
    expectedOpcodeHex: "f94002a9",
    evidence: "Final draw loads the source/program table base from source object +0.",
  },
  {
    role: "draw-selected-source-entry-address",
    address: 0xe3d078,
    expectedOpcodeHex: "8b080d28",
    evidence: "Final draw indexes the source/program table by the selected source index.",
  },
  {
    role: "draw-selected-source-entry-load",
    address: 0xe3d07c,
    expectedOpcodeHex: "f940051c",
    evidence: "Final draw loads the selected source entry pointer from the source/program table.",
  },
  {
    role: "draw-program-wrapper-load",
    address: 0xe3d08c,
    expectedOpcodeHex: "f9400388",
    evidence: "Final draw loads the program wrapper from the selected source entry.",
  },
  {
    role: "draw-gl-use-program-call",
    address: 0xe3d0a4,
    expectedOpcodeHex: "97e5490f",
    evidence: "Final draw calls glUseProgram when the selected program changes.",
  },
  {
    role: "draw-selected-param-payload-load",
    address: 0xe3d0a8,
    expectedOpcodeHex: "f9400780",
    evidence: "Final draw loads selected source entry parameter payload.",
  },
  {
    role: "draw-fallback-param-payload-load",
    address: 0xe3d0ac,
    expectedOpcodeHex: "f94006a1",
    evidence: "Final draw loads source object +0x8 fallback parameter payload.",
  },
  {
    role: "draw-param-apply-call",
    address: 0xe3d0c0,
    expectedOpcodeHex: "94297e75",
    evidence: "Final draw applies selected and fallback parameter payloads through 0x189ca94.",
  },
  {
    role: "draw-no-source-helper-call",
    address: 0xe3d0cc,
    expectedOpcodeHex: "942998d8",
    evidence: "If node +0x208 is absent, final draw calls the no-source material helper instead.",
  },
];

const parameterApplySpecs = [
  {
    role: "param-table-count-load",
    address: 0x189caa4,
    expectedOpcodeHex: "79402008",
    evidence: "0x189ca94 reads the parameter table entry count from table +0x10.",
  },
  {
    role: "param-header-and-value-array-load",
    address: 0x189cabc,
    expectedOpcodeHex: "a9400a68",
    evidence: "0x189ca94 loads the parameter header array and value array for iteration.",
  },
  {
    role: "param-entry-header-load",
    address: 0x189cac4,
    expectedOpcodeHex: "b9400028",
    evidence: "0x189ca94 reads each source/program parameter entry header.",
  },
  {
    role: "param-location-low12-mask",
    address: 0x189cac8,
    expectedOpcodeHex: "12002d03",
    evidence: "0x189ca94 extracts the low 12 bits as the uniform/sampler location argument.",
  },
  {
    role: "param-apply-one-call",
    address: 0x189cacc,
    expectedOpcodeHex: "97ffffd1",
    evidence: "0x189ca94 applies each source/program parameter entry through 0x189ca10.",
  },
  {
    role: "param-applier-header-load",
    address: 0x189ca10,
    expectedOpcodeHex: "b9400028",
    evidence: "0x189ca10 reads the parameter entry header before decoding value offset, type, and direct flag.",
  },
  {
    role: "param-value-offset-extract",
    address: 0x189ca14,
    expectedOpcodeHex: "530c6d09",
    evidence: "0x189ca10 extracts value-table word offset bits 12..27.",
  },
  {
    role: "param-direct-flag-branch",
    address: 0x189ca1c,
    expectedOpcodeHex: "37f80048",
    evidence: "0x189ca10 checks direct-value flag bit 31 to choose pointer-backed or inline value access.",
  },
  {
    role: "param-type-bits-extract",
    address: 0x189ca24,
    expectedOpcodeHex: "531c7909",
    evidence: "0x189ca10 extracts parameter type bits 28..30.",
  },
  {
    role: "param-type-range-check",
    address: 0x189ca28,
    expectedOpcodeHex: "7100113f",
    evidence: "0x189ca10 only dispatches parameter types 0..4.",
  },
  {
    role: "param-type-float1-call",
    address: 0x189ca50,
    expectedOpcodeHex: "17bbe9fc",
    evidence: "Parameter type branch 0 tail-calls glUniform1f.",
  },
  {
    role: "param-type-float2-call",
    address: 0x189ca5c,
    expectedOpcodeHex: "17bbc971",
    evidence: "Parameter type branch 1 tail-calls glUniform2fv.",
  },
  {
    role: "param-type-float3-call",
    address: 0x189ca68,
    expectedOpcodeHex: "17bbefba",
    evidence: "Parameter type branch 2 tail-calls glUniform3fv.",
  },
  {
    role: "param-type-float4-call",
    address: 0x189ca74,
    expectedOpcodeHex: "17bbe4bb",
    evidence: "Parameter type branch 3 tail-calls glUniform4fv.",
  },
  {
    role: "param-type-texture-dispatch",
    address: 0x189ca88,
    expectedOpcodeHex: "f9400902",
    evidence: "Parameter type branch 4 dispatches through the texture object vtable slot +0x10.",
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

function opcodeRowsForSpecs(buffer, elf, stage, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage,
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

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function rowsContain(rows, role) {
  return rows.some((row) => row.role === role && row.opcodeMatches);
}

function buildCurrentNativeLayoutBPayloadSourceProgramBridgeAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);

  const schemaSourceObjectRows = opcodeRowsForSpecs(buffer, elf, "schema-source-object", schemaSourceObjectSpecs);
  const sourceObjectFactoryRows = opcodeRowsForSpecs(buffer, elf, "source-object-factory", sourceObjectFactorySpecs);
  const drawSourceProgramRows = opcodeRowsForSpecs(buffer, elf, "draw-source-program", drawSourceProgramSpecs);
  const parameterApplyRows = opcodeRowsForSpecs(buffer, elf, "parameter-apply", parameterApplySpecs);
  const opcodeRows = [
    ...schemaSourceObjectRows,
    ...sourceObjectFactoryRows,
    ...drawSourceProgramRows,
    ...parameterApplyRows,
  ];
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const allRowsMatch = opcodeMismatchRows === 0;

  const schemaSourceObjectConstructionRecovered =
    allRowsMatch &&
    rowsContain(schemaSourceObjectRows, "schema-source-key-byte-load") &&
    rowsContain(schemaSourceObjectRows, "schema-source-register-call") &&
    rowsContain(schemaSourceObjectRows, "schema-source-fallback-bind-call") &&
    rowsContain(schemaSourceObjectRows, "schema-source-object-store");
  const sourceObjectLookupAndFallbackRecovered =
    allRowsMatch &&
    rowsContain(sourceObjectFactoryRows, "source-register-key-hash-call") &&
    rowsContain(sourceObjectFactoryRows, "source-register-tree-insert-call") &&
    rowsContain(sourceObjectFactoryRows, "source-register-builder-dispatch") &&
    rowsContain(sourceObjectFactoryRows, "source-fallback-attach-tailcall");
  const drawSourceProgramSelectionRecovered =
    allRowsMatch &&
    rowsContain(drawSourceProgramRows, "draw-payload-source-object-load") &&
    rowsContain(drawSourceProgramRows, "draw-selected-source-entry-load") &&
    rowsContain(drawSourceProgramRows, "draw-gl-use-program-call") &&
    rowsContain(drawSourceProgramRows, "draw-param-apply-call");
  const sourceParameterApplyFormulaRecovered =
    allRowsMatch &&
    rowsContain(parameterApplyRows, "param-location-low12-mask") &&
    rowsContain(parameterApplyRows, "param-value-offset-extract") &&
    rowsContain(parameterApplyRows, "param-type-bits-extract") &&
    rowsContain(parameterApplyRows, "param-type-texture-dispatch");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B payload source/program bridge audit; proves node +0x208 construction and parameter application without enabling shader or texture takeover",
    summary: {
      schemaSourceObjectRows: schemaSourceObjectRows.length,
      sourceObjectFactoryRows: sourceObjectFactoryRows.length,
      drawSourceProgramRows: drawSourceProgramRows.length,
      parameterApplyRows: parameterApplyRows.length,
      opcodeRows: opcodeRows.length,
      opcodeMismatchRows,
      schemaSourceObjectConstructionRecovered,
      sourceObjectLookupAndFallbackRecovered,
      drawSourceProgramSelectionRecovered,
      sourceParameterApplyFormulaRecovered,
      payloadSourceProgramBridgeRecovered:
        schemaSourceObjectConstructionRecovered &&
        sourceObjectLookupAndFallbackRecovered &&
        drawSourceProgramSelectionRecovered &&
        sourceParameterApplyFormulaRecovered,
      shaderTextureFormulaRecovered: false,
      renderPromotionAllowedRows: 0,
    },
    interpretation: {
      construction:
        "Schema modes 4..8 and mode 1 can read a source/program key from schema +0x28, register/find a source object through 0x189c004, bind fallback parameter payload through 0x189c170, and store the resulting object to payload node +0x208.",
      draw:
        "Final draw loads payload node +0x208, selects a source entry by global source index byte 0x311a2a0, calls glUseProgram with the selected program wrapper, and applies selected plus fallback parameter payloads through 0x189ca94.",
      parameterFormula:
        "Parameter headers use low 12 bits as uniform/sampler location, bits 12..27 as value-table word offset, bits 28..30 as type, and bit 31 as direct-value flag. Type 4 dispatches through the texture object vtable.",
      boundary:
        "This closes source/program object construction and parameter application mechanics. It still does not recover live texture object ownership for every sampler or authorize viewer shader/texture takeover.",
    },
    unresolved: [
      "the live source/program table rows for current preview objects when no original-runtime capture is imported",
      "the shadergraph sampler-to-texData ownership for ordinary material samplers",
      "the safe viewer render-promotion rule that uses recovered source/program and texture objects without corrupting stable GLB output",
    ],
    schemaSourceObjectRows,
    sourceObjectFactoryRows,
    drawSourceProgramRows,
    parameterApplyRows,
  };
}

function exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBPayloadSourceProgramBridgeAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.schemaSourceObjectRows,
      ...manifest.sourceObjectFactoryRows,
      ...manifest.drawSourceProgramRows,
      ...manifest.parameterApplyRows,
    ],
    ["stage", "role", "addressHex", "expectedOpcodeHex", "actualOpcodeHex", "opcodeMatches", "evidence", "renderPromotionAllowed"],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBPayloadSourceProgramBridgeAudit,
  exportCurrentNativeLayoutBPayloadSourceProgramBridgeAudit,
};
