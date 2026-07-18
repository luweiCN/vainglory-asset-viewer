#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultLevelVisualsSchemaAuditPath = "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultViewerOut = "extracted/viewer/current-native-static-mesh-selector-entry-audit.json";
const defaultJsonOut = "extracted/reports/current_native_static_mesh_selector_entry_audit.json";
const defaultTsvOut = "extracted/reports/current_native_static_mesh_selector_entry_audit.tsv";

const opcodeSpecs = [
  [0x7c9cac, "staticmesh-field0-offset-zero", "7900095f", "StaticMesh field 0 offset is zeroed in the current Android initializer."],
  [0x7c9c1c, "staticmesh-field1-offset-0x24", "7900294c", "StaticMesh field 1 offset 0x24 is written by the current Android initializer."],
  [0x7c9c24, "staticmesh-field2-offset-0x28", "7900494c", "StaticMesh field 2 offset 0x28 is written by the current Android initializer."],
  [0x7c9c2c, "staticmesh-field3-offset-0x30", "7900694c", "StaticMesh field 3 offset 0x30 is written by the current Android initializer."],
  [0x7c9c34, "staticmesh-field4-offset-0x38", "7900894c", "StaticMesh field 4 offset 0x38 is written by the current Android initializer."],
  [0x7c9c3c, "staticmesh-field5-offset-0x40", "7900a94c", "StaticMesh field 5 offset 0x40 is written by the current Android initializer."],
  [0x7c9c44, "staticmesh-field6-offset-0x68", "7900c94c", "StaticMesh field 6 offset 0x68 is written by the current Android initializer."],
  [0x7c9c4c, "staticmesh-field7-offset-0x70", "7900e94c", "StaticMesh field 7 offset 0x70 is written by the current Android initializer."],
  [0x7c9c64, "staticmesh-field0-type-transform", "f900054b", "StaticMesh field 0 type pointer store resolves to current type object 0x311a588 (Transform)."],
  [0x7c9c6c, "staticmesh-field1-type-current-unnamed-scalar", "f9000d4d", "StaticMesh field 1 type pointer store resolves to current type object 0x311ad60."],
  [0x7c9c80, "staticmesh-field2-type-char-pointer", "f900154c", "StaticMesh field 2 type pointer store resolves to current type object 0x311ad70 (char*)."],
  [0x7c9c84, "staticmesh-field3-type-char-pointer", "f9001d4c", "StaticMesh field 3 type pointer store resolves to current type object 0x311ad70 (char*)."],
  [0x7c9c88, "staticmesh-field4-type-char-pointer", "f900254c", "StaticMesh field 4 type pointer store resolves to current type object 0x311ad70 (char*)."],
  [0x7c9c9c, "staticmesh-field5-type-named-animation", "f9002d4b", "StaticMesh field 5 type pointer store resolves to current type object 0x3047620 (NamedAnimation)."],
  [0x7c9c90, "staticmesh-field6-type-shaderparams-list", "f900354d", "StaticMesh field 6 type pointer store resolves to current type object 0x3045ad8 (ShaderParams**)."],
  [0x7c9ccc, "staticmesh-field7-type-current-unnamed", "f9003d4c", "StaticMesh field 7 type pointer store resolves to current type object 0x3044f20."],
  [0x8ccaa4, "selector-helper-staticmesh-field4-load", "f9401c28", "0x8cca64 loads StaticMesh +0x38 and validates it before the selector path."],
  [0x8ccad8, "selector-helper-staticmesh-field3-load", "f9401a61", "0x8cca64 attaches StaticMesh +0x30 to the selector child."],
  [0x8ccae8, "selector-helper-staticmesh-field6-load", "f9403661", "0x8cca64 passes StaticMesh +0x68 as the selector resource/list argument."],
  [0x8ccb08, "selector-helper-staticmesh-field5-address", "91010262", "0x8cca64 passes StaticMesh +0x40 as the post-child transform/config block."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const staticMeshFields = [
  { fieldIndex: 0, fieldOffset: "0x0", fieldSpan: "0x24", typeObjectAddressHex: "0x311a588", typeName: "Transform", selectorUsage: "" },
  { fieldIndex: 1, fieldOffset: "0x24", fieldSpan: "0x4", typeObjectAddressHex: "0x311ad60", typeName: "current-unnamed-scalar", selectorUsage: "" },
  { fieldIndex: 2, fieldOffset: "0x28", fieldSpan: "0x8", typeObjectAddressHex: "0x311ad70", typeName: "char*", selectorUsage: "" },
  {
    fieldIndex: 3,
    fieldOffset: "0x30",
    fieldSpan: "0x8",
    typeObjectAddressHex: "0x311ad70",
    typeName: "char*",
    selectorUsage: "selector child attach payload",
  },
  {
    fieldIndex: 4,
    fieldOffset: "0x38",
    fieldSpan: "0x8",
    typeObjectAddressHex: "0x311ad70",
    typeName: "char*",
    selectorUsage: "post child config/resource pointer",
  },
  {
    fieldIndex: 5,
    fieldOffset: "0x40",
    fieldSpan: "0x28",
    typeObjectAddressHex: "0x3047620",
    typeName: "NamedAnimation",
    selectorUsage: "post child transform/config block",
  },
  {
    fieldIndex: 6,
    fieldOffset: "0x68",
    fieldSpan: "0x8",
    typeObjectAddressHex: "0x3045ad8",
    typeName: "ShaderParams**",
    selectorUsage: "selector resource/list argument",
  },
  { fieldIndex: 7, fieldOffset: "0x70", fieldSpan: "0x8", typeObjectAddressHex: "0x3044f20", typeName: "current-unnamed", selectorUsage: "" },
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

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
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

function levelVisualsStaticMeshListRows(levelVisualsSchemaAudit) {
  const fields = Array.isArray(levelVisualsSchemaAudit.fields) ? levelVisualsSchemaAudit.fields : [];
  return fields
    .filter((field) => ["0x8", "0x10", "0x18"].includes(field.fieldOffsetHex))
    .map((field) => ({
      levelVisualsOffset: field.fieldOffsetHex,
      typeName: field.typeName,
      registrationCallAddressHex: field.registrationCallAddressHex,
      recovered: field.typeName === "StaticMesh**",
    }));
}

function buildCurrentNativeStaticMeshSelectorEntryAudit(
  {
    binaryPath = defaultBinary,
    levelVisualsSchemaAuditPath = defaultLevelVisualsSchemaAuditPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeRows = opcodeRowsForSpecs(buffer, elf, opcodeSpecs);
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const levelVisualsSchemaAudit = readJson(levelVisualsSchemaAuditPath, { fields: [], summary: {} });
  const staticMeshListRows = levelVisualsStaticMeshListRows(levelVisualsSchemaAudit);
  const staticMeshFieldOffsets = staticMeshFields.map((field) => field.fieldOffset);
  const summary = {
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    levelVisualsStaticMeshListRows: staticMeshListRows.length,
    staticMeshFieldRows: staticMeshFields.length,
    selectorHelperStaticMeshFieldUsageRows: 4,
    levelVisualsStaticMeshListsRecovered:
      staticMeshListRows.length === 3 && staticMeshListRows.every((row) => row.recovered),
    currentStaticMeshFieldOffsetsRecovered:
      opcodeMismatchRows === 0 &&
      ["0x0", "0x24", "0x28", "0x30", "0x38", "0x40", "0x68", "0x70"].every((offset) =>
        staticMeshFieldOffsets.includes(offset),
      ),
    currentStaticMeshFieldTypesRecovered:
      opcodeMismatchRows === 0 &&
      staticMeshFields.some((field) => field.fieldOffset === "0x30" && field.typeName === "char*") &&
      staticMeshFields.some((field) => field.fieldOffset === "0x38" && field.typeName === "char*") &&
      staticMeshFields.some((field) => field.fieldOffset === "0x40" && field.typeName === "NamedAnimation") &&
      staticMeshFields.some((field) => field.fieldOffset === "0x68" && field.typeName === "ShaderParams**"),
    selectorHelperStaticMeshFieldUsageRecovered:
      opcodeMismatchRows === 0 &&
      opcodeRows.some((row) => row.role === "selector-helper-staticmesh-field3-load" && row.opcodeMatches) &&
      opcodeRows.some((row) => row.role === "selector-helper-staticmesh-field4-load" && row.opcodeMatches) &&
      opcodeRows.some((row) => row.role === "selector-helper-staticmesh-field5-address" && row.opcodeMatches) &&
      opcodeRows.some((row) => row.role === "selector-helper-staticmesh-field6-load" && row.opcodeMatches),
    staticMeshSelectorEntryShapeRecovered: false,
    resourceFieldNamesRecovered: false,
    activeResourceSemanticsRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  summary.staticMeshSelectorEntryShapeRecovered =
    summary.levelVisualsStaticMeshListsRecovered &&
    summary.currentStaticMeshFieldOffsetsRecovered &&
    summary.currentStaticMeshFieldTypesRecovered &&
    summary.selectorHelperStaticMeshFieldUsageRecovered;
  return {
    generatedAt,
    binaryPath,
    levelVisualsSchemaAuditPath,
    policy:
      "diagnostic-only StaticMesh selector-entry audit; proves current Android field shape and helper usage without enabling renderer takeover",
    summary,
    levelVisualsStaticMeshLists: staticMeshListRows,
    staticMeshFields,
    interpretation: {
      recovered:
        "LevelVisuals +0x8/+0x10/+0x18 are StaticMesh** lists. The 0x8cca64 selector helper receives a current StaticMesh list entry as x19, attaches StaticMesh +0x30 as a char* selector child payload, validates StaticMesh +0x38 as a char* post-child config/resource pointer, passes StaticMesh +0x40 as a NamedAnimation transform/config block, and passes StaticMesh +0x68 as a ShaderParams** resource/list argument.",
      boundary:
        "This names the StaticMesh entry shape and field types, but not the original definition field labels or active preview resource semantics.",
      nextRequiredEvidence:
        "Trace StaticMesh +0x30/+0x38/+0x68 values back to concrete definition labels or runtime-captured resource keys before promoting shader/texture/effect rendering.",
    },
    items: opcodeRows,
  };
}

function exportCurrentNativeStaticMeshSelectorEntryAudit({
  binaryPath = defaultBinary,
  levelVisualsSchemaAuditPath = defaultLevelVisualsSchemaAuditPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeStaticMeshSelectorEntryAudit({
    binaryPath,
    levelVisualsSchemaAuditPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
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
  const summary = exportCurrentNativeStaticMeshSelectorEntryAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    levelVisualsSchemaAuditPath: optionValue(args, "--levelvisuals-schema-audit", defaultLevelVisualsSchemaAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeStaticMeshSelectorEntryAudit,
  exportCurrentNativeStaticMeshSelectorEntryAudit,
};
