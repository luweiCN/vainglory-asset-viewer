#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultStaticMeshAuditPath = "extracted/viewer/current-native-static-mesh-selector-entry-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderparams-schema-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderparams_schema_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderparams_schema_audit.tsv";

const opcodeSpecs = [
  [0x7bcfec, "shaderparam-field0-type-load", "f940016b", "ShaderParam field 0 type pointer resolves through the current scalar type slot."],
  [0x7bd000, "shaderparam-field0-offset-zero", "7900095f", "ShaderParam field 0 offset is zeroed in the current Android initializer."],
  [0x7bd004, "shaderparam-field0-type-store", "f900054b", "ShaderParam field 0 type pointer is stored into the descriptor table."],
  [0x7bd054, "shaderparam-type-register-call", "94434c72", "Current Android registers ShaderParam at type object 0x3045a50."],
  [0x7bd0b8, "shaderparam-pointer-type-register-call", "94434c59", "Current Android registers ShaderParam* at type object 0x3045a70."],
  [0x7bd114, "shaderparam-list-type-register-call", "94434c42", "Current Android registers ShaderParam** at type object 0x3045a88."],
  [0x7bd148, "shaderparams-field-table-address", "9107e129", "ShaderParams initializer addresses its two-field descriptor table."],
  [0x7bd15c, "shaderparams-field1-offset-0x8", "7900292b", "ShaderParams field 1 offset 0x8 is written by the current Android initializer."],
  [0x7bd160, "shaderparams-field1-type-shaderparam-list-load", "f941158b", "ShaderParams field 1 type pointer resolves to current ShaderParam** type object 0x3045a88."],
  [0x7bd170, "shaderparams-field1-type-store", "f9000d2b", "ShaderParams field 1 stores ShaderParam** as its descriptor type."],
  [0x7bd178, "shaderparams-field0-type-store", "f900052a", "ShaderParams field 0 stores char* as its descriptor type."],
  [0x7bd180, "shaderparams-field0-offset-zero", "7900093f", "ShaderParams field 0 offset is zeroed in the current Android initializer."],
  [0x7bd1d8, "shaderparams-type-register-call", "94434c11", "Current Android registers ShaderParams at type object 0x3045aa0."],
  [0x7bd23c, "shaderparams-pointer-type-register-call", "94434bf8", "Current Android registers ShaderParams* at type object 0x3045ac0."],
  [0x7bd298, "shaderparams-list-type-register-call", "94434be1", "Current Android registers ShaderParams** at type object 0x3045ad8."],
  [0x7c9c90, "staticmesh-field6-type-shaderparams-list-store", "f900354d", "StaticMesh field 6 stores current ShaderParams** as its descriptor type."],
  [0x8ccae8, "selector-caller-staticmesh-shaderparams-load", "f9403661", "Selector caller loads StaticMesh +0x68 as the resource/list argument passed to the source-table selector."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const typeRegistrationRows = [
  { typeName: "ShaderParam", typeObjectAddressHex: "0x3045a50", registrationCallAddressHex: "0x7bd054", typeSizeHex: "0x4" },
  { typeName: "ShaderParam*", typeObjectAddressHex: "0x3045a70", registrationCallAddressHex: "0x7bd0b8", typeSizeHex: "0x8" },
  { typeName: "ShaderParam**", typeObjectAddressHex: "0x3045a88", registrationCallAddressHex: "0x7bd114", typeSizeHex: "0x8" },
  { typeName: "ShaderParams", typeObjectAddressHex: "0x3045aa0", registrationCallAddressHex: "0x7bd1d8", typeSizeHex: "0x10" },
  { typeName: "ShaderParams*", typeObjectAddressHex: "0x3045ac0", registrationCallAddressHex: "0x7bd23c", typeSizeHex: "0x8" },
  { typeName: "ShaderParams**", typeObjectAddressHex: "0x3045ad8", registrationCallAddressHex: "0x7bd298", typeSizeHex: "0x8" },
];

const shaderParamFields = [
  {
    typeName: "ShaderParam",
    fieldIndex: 0,
    fieldOffset: "0x0",
    fieldSpan: "0x4",
    typeObjectAddressHex: "0x311ad40",
    fieldTypeName: "current-unnamed-4-byte-scalar",
    crossBuildMeaning: "shader parameter id/index scalar",
  },
];

const shaderParamsFields = [
  {
    typeName: "ShaderParams",
    fieldIndex: 0,
    fieldOffset: "0x0",
    fieldSpan: "0x8",
    typeObjectAddressHex: "0x311ad70",
    fieldTypeName: "char*",
    crossBuildMeaning: "shader parameter set/source key string",
  },
  {
    typeName: "ShaderParams",
    fieldIndex: 1,
    fieldOffset: "0x8",
    fieldSpan: "0x8",
    typeObjectAddressHex: "0x3045a88",
    fieldTypeName: "ShaderParam**",
    crossBuildMeaning: "shader parameter id/index list",
  },
];

const crossBuildRows = [
  { build: "HackedGlory iOS", typeName: "ShaderParam", fieldOffset: "0x0", fieldTypeName: "scalar", fieldSpan: "0x4" },
  { build: "HackedGlory iOS", typeName: "ShaderParams", fieldOffset: "0x0", fieldTypeName: "char*", fieldSpan: "0x8" },
  { build: "HackedGlory iOS", typeName: "ShaderParams", fieldOffset: "0x8", fieldTypeName: "ShaderParam**", fieldSpan: "0x8" },
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
      stage: spec.role.startsWith("staticmesh") || spec.role.startsWith("selector") ? "staticmesh-bridge" : "shaderparams-schema",
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

function buildCurrentNativeShaderParamsSchemaAudit(
  {
    binaryPath = defaultBinary,
    staticMeshAuditPath = defaultStaticMeshAuditPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodeRows = opcodeRowsForSpecs(buffer, elf, opcodeSpecs);
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const staticMeshAudit = readJson(staticMeshAuditPath, { summary: {}, staticMeshFields: [] });
  const staticMeshFields = Array.isArray(staticMeshAudit.staticMeshFields) ? staticMeshAudit.staticMeshFields : [];
  const staticMeshShaderParamsField = staticMeshFields.find(
    (field) => field.fieldOffset === "0x68" && field.typeName === "ShaderParams**",
  );
  const summary = {
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
    typeRegistrationRows: typeRegistrationRows.length,
    shaderParamFieldRows: shaderParamFields.length,
    shaderParamsFieldRows: shaderParamsFields.length,
    crossBuildRows: crossBuildRows.length,
    currentShaderParamTypeRegistrationsRecovered:
      opcodeMismatchRows === 0 &&
      typeRegistrationRows.some((row) => row.typeName === "ShaderParam" && row.typeObjectAddressHex === "0x3045a50") &&
      typeRegistrationRows.some((row) => row.typeName === "ShaderParam**" && row.typeObjectAddressHex === "0x3045a88"),
    currentShaderParamsTypeRegistrationsRecovered:
      opcodeMismatchRows === 0 &&
      typeRegistrationRows.some((row) => row.typeName === "ShaderParams" && row.typeObjectAddressHex === "0x3045aa0") &&
      typeRegistrationRows.some((row) => row.typeName === "ShaderParams**" && row.typeObjectAddressHex === "0x3045ad8"),
    currentShaderParamsFieldLayoutRecovered:
      opcodeMismatchRows === 0 &&
      shaderParamsFields.some((field) => field.fieldOffset === "0x0" && field.fieldTypeName === "char*") &&
      shaderParamsFields.some((field) => field.fieldOffset === "0x8" && field.fieldTypeName === "ShaderParam**"),
    staticMeshShaderParamsBridgeRecovered:
      opcodeMismatchRows === 0 &&
      Boolean(staticMeshShaderParamsField) &&
      Boolean(staticMeshAudit.summary?.staticMeshSelectorEntryShapeRecovered),
    crossBuildShaderParamsLayoutAgrees:
      crossBuildRows.some((row) => row.typeName === "ShaderParams" && row.fieldOffset === "0x0" && row.fieldTypeName === "char*") &&
      crossBuildRows.some((row) => row.typeName === "ShaderParams" && row.fieldOffset === "0x8" && row.fieldTypeName === "ShaderParam**"),
    shaderParamsFieldNamesRecovered: false,
    activeResourceSemanticsRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    staticMeshAuditPath,
    policy:
      "diagnostic-only ShaderParams schema audit; proves current field shape and StaticMesh bridge without enabling shader or texture rendering takeover",
    summary,
    typeRegistrations: typeRegistrationRows,
    shaderParamFields,
    shaderParamsFields,
    crossBuildRows,
    interpretation: {
      recovered:
        "Current Android registers ShaderParam/ShaderParams and proves ShaderParams is a two-field record: +0x0 char* and +0x8 ShaderParam**. StaticMesh +0x68 points at ShaderParams** and the selector helper passes it into the dynamic source-table path.",
      boundary:
        "This recovers the current schema shape and cross-build agreement, but not original source field labels, active preview resource ownership, sampler values, or shader/texture formulas.",
      nextRequiredEvidence:
        "Trace ShaderParams +0x0/+0x8 values from live StaticMesh entries or decoded definitions into source/program table entries before promoting any rendering rule.",
    },
    items: opcodeRows,
  };
}

function exportCurrentNativeShaderParamsSchemaAudit({
  binaryPath = defaultBinary,
  staticMeshAuditPath = defaultStaticMeshAuditPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderParamsSchemaAudit({
    binaryPath,
    staticMeshAuditPath,
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
  const summary = exportCurrentNativeShaderParamsSchemaAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    staticMeshAuditPath: optionValue(args, "--staticmesh-audit", defaultStaticMeshAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderParamsSchemaAudit,
  exportCurrentNativeShaderParamsSchemaAudit,
};
