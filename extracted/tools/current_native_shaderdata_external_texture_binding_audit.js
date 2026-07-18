#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultTexDataTextureObjectPath = "extracted/viewer/current-native-texdata-texture-object-audit.json";
const defaultTextureSamplerTablePath = "extracted/viewer/current-native-shaderdata-texture-sampler-table-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderdata-external-texture-binding-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderdata_external_texture_binding_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderdata_external_texture_binding_audit.tsv";

const opcodeSpecs = [
  [0xe01ee8, "texture-runtime-setup", "setup-load-shared-texture-runtime", "942a6dcf", "Renderer resource setup gets the shared texture runtime manager through 0x189d624."],
  [0xe01eec, "texture-runtime-setup", "setup-load-texture-callback-object", "f9401e81", "Renderer resource setup loads the texture resource callback object from setup object +0x38."],
  [0xe01ef0, "texture-runtime-setup", "setup-install-texture-callback-call", "942a7135", "Renderer resource setup calls 0x189e3c4 to install the resource callback on the shared texture runtime."],
  [0xe01f6c, "texture-runtime-setup", "texdata-setup-load-same-texture-runtime", "942a6dae", "texData handler setup also gets the shared texture runtime manager through 0x189d624."],
  [0xe01f74, "texture-runtime-setup", "texdata-handler-constructor-object-arg", "aa1703e0", "texData handler construction forwards the handler object while x1 holds the shared texture runtime."],
  [0xe01f78, "texture-runtime-setup", "texdata-handler-constructor-call", "94000128", "texData handler constructor 0xe02418 receives the shared texture runtime object."],

  [0x189e3c4, "texture-runtime-callback-store", "callback-store-offset-low", "52800a08", "0x189e3c4 starts by materializing texture runtime callback slot offset +0x30050."],
  [0x189e3c8, "texture-runtime-callback-store", "callback-store-offset-high", "72a00068", "0x189e3c4 completes the +0x30050 callback slot offset."],
  [0x189e3cc, "texture-runtime-callback-store", "callback-store-pointer", "f8286801", "The texture resource callback pointer is stored at texture runtime +0x30050."],
  [0x189e3d4, "texture-runtime-callback-store", "callback-clear-offset-low", "52800a08", "0x189e3d4 uses the same +0x30050 slot when clearing the texture resource callback."],
  [0x189e3dc, "texture-runtime-callback-store", "callback-clear-pointer", "f828681f", "The texture resource callback slot can be cleared back to null."],

  [0x189c658, "shaderdata-resource-registration", "shaderdata-resource-count-load", "b9400048", "Before building passes, shaderData resource registration reads the external resource key count."],
  [0x189c670, "shaderdata-resource-registration", "shaderdata-resource-key-pointer", "d10102c1", "Each 0x41-byte shaderData resource record exposes its resource key pointer."],
  [0x189c674, "shaderdata-resource-registration", "shaderdata-resource-state-byte-load", "384416c2", "The shaderData resource registration loop forwards the record state byte."],
  [0x189c67c, "shaderdata-resource-registration", "shaderdata-resource-register-call", "940005b1", "Each shaderData external resource key is registered through 0x189dd40 before pass build lookup."],

  [0x189dd60, "texture-manager-resource-register", "callback-slot-offset-low", "52800a09", "0x189dd40 materializes the texture runtime callback slot offset +0x30050."],
  [0x189dd64, "texture-manager-resource-register", "callback-slot-offset-high", "72a00069", "0x189dd40 completes the +0x30050 callback slot offset."],
  [0x189dd80, "texture-manager-resource-register", "registration-requires-callback", "b40006a8", "External texture key registration is skipped if the runtime has no callback installed."],
  [0x189dd8c, "texture-manager-resource-register", "registration-duplicate-check-call", "9400003d", "The registration path checks whether the key already exists in the runtime key tree."],
  [0x189dda0, "texture-manager-resource-register", "registration-alloc-node-call", "94000249", "The registration path allocates a runtime key node from the manager pool."],
  [0x189ddac, "texture-manager-resource-register", "registration-state-byte-store", "39012816", "The shaderData resource record state byte is stored on the runtime key node."],
  [0x189ddb4, "texture-manager-resource-register", "registration-key-length-call", "97d33e4b", "The resource key string length is measured before hashing."],
  [0x189ddc8, "texture-manager-resource-register", "registration-key-hash-call", "97be0ccf", "The resource key string is hashed with the same 0x12345678 seed used by lookup."],
  [0x189ddd4, "texture-manager-resource-register", "registration-hash-store", "b90022a0", "The hashed texture key is stored on runtime key node +0x20."],
  [0x189de38, "texture-manager-resource-register", "registration-tree-insert-call", "94000257", "The runtime key node is inserted into the manager lookup tree/index."],
  [0x189de44, "texture-manager-resource-register", "registration-node-callback-arg", "aa1503e2", "The inserted runtime key node is forwarded as x2 to the texture resource callback."],
  [0x189de50, "texture-manager-resource-register", "registration-callback-dispatch", "d63f0100", "The texture resource callback vtable method is invoked with key and node."],

  [0x189deb0, "texture-manager-key-exists-check", "exists-check-tree-offset-low", "52800c08", "The duplicate/existence check uses texture runtime lookup tree slot +0x30060."],
  [0x189deb4, "texture-manager-key-exists-check", "exists-check-tree-offset-high", "72a00068", "The duplicate/existence check completes the +0x30060 lookup tree offset."],
  [0x189def8, "texture-manager-key-exists-check", "exists-check-object-load", "f9401508", "The existence check treats node +0x28 as the loaded texture object pointer."],
  [0x189df00, "texture-manager-key-exists-check", "exists-check-object-nonnull", "1a9f07e0", "The existence check succeeds only when node +0x28 is non-null."],

  [0x189c728, "external-texture-pass-lookup", "external-texture-state-load", "297f0f62", "Pass build loads sampler state words from the shaderData external texture binding record."],
  [0x189c72c, "external-texture-pass-lookup", "external-texture-extra-state-load", "b9400364", "Pass build loads the external texture record's additional sampler state word."],
  [0x189c730, "external-texture-pass-lookup", "external-texture-key-pointer", "d1013361", "Pass build passes the original external texture resource key pointer to runtime lookup."],
  [0x189c738, "external-texture-pass-lookup", "external-texture-runtime-lookup-call", "94000616", "Pass build calls 0x189df90 to resolve the external texture key into a runtime texture object."],
  [0x189c740, "external-texture-pass-lookup", "external-texture-sampler-unit-load", "b85b0361", "Pass build reloads the sampler unit from the external texture binding record."],
  [0x189c744, "external-texture-pass-lookup", "external-texture-object-to-type4-arg", "aa0003e2", "The runtime texture object returned by 0x189df90 is forwarded as the type4 value."],
  [0x189c74c, "external-texture-pass-lookup", "external-texture-type4-patch-call", "940001f8", "The external texture object is patched into the sampler's type4 parameter slot through 0x189cf2c."],

  [0x189dfbc, "external-texture-runtime-lookup", "lookup-key-length-call", "97d33dc9", "0x189df90 measures the external texture resource key string before hashing."],
  [0x189dfd0, "external-texture-runtime-lookup", "lookup-key-hash-call", "97be0c4d", "0x189df90 hashes the external texture key with seed 0x12345678."],
  [0x189dfd4, "external-texture-runtime-lookup", "lookup-tree-offset-low", "52800c08", "0x189df90 materializes the texture runtime lookup tree slot +0x30060."],
  [0x189dfd8, "external-texture-runtime-lookup", "lookup-tree-offset-high", "72a00068", "0x189df90 completes the +0x30060 lookup tree offset."],
  [0x189dfdc, "external-texture-runtime-lookup", "lookup-tree-root-address", "8b0802c9", "0x189df90 derives the shared texture runtime lookup tree root."],
  [0x189e01c, "external-texture-runtime-lookup", "lookup-node-object-load", "f9401518", "The resolved runtime key node supplies texture object pointer from node +0x28."],
  [0x189e030, "external-texture-runtime-lookup", "lookup-object-record-pointer", "9100c317", "0x189df90 derives the texture record pointer as texture object +0x30."],
  [0x189e03c, "external-texture-runtime-lookup", "lookup-default-state-call", "94001f65", "0x189df90 applies default sampler state to the resolved texture object record."],
  [0x189e050, "external-texture-runtime-lookup", "lookup-wrap-state-call", "94001f48", "0x189df90 applies wrap/state words from the shaderData external texture record."],
  [0x189e064, "external-texture-runtime-lookup", "lookup-filter-state-call", "94001f4f", "0x189df90 applies filter/state flags from the shaderData external texture record."],

  [0x189cf30, "external-texture-type4-patch", "type4-patch-object-stack-store", "f90007e2", "0x189cf2c stores the runtime texture object pointer argument as an 8-byte value source."],
  [0x189cf38, "external-texture-type4-patch", "type4-patch-type-mask", "320203e9", "0x189cf2c searches for source-table entries with type bits 0x40000000."],
  [0x189cf44, "external-texture-type4-patch", "type4-patch-sampler-unit-match", "6b01017f", "0x189cf2c matches the sampler unit against the entry's low 12 bits."],
  [0x189cf50, "external-texture-type4-patch", "type4-patch-type-match", "6b09017f", "0x189cf2c requires the matched entry to be type4 before writing the object pointer."],
  [0x189cf5c, "external-texture-type4-patch", "type4-patch-value-offset-decode", "530c6d4a", "0x189cf2c decodes the value-table offset from the matched type4 entry."],
  [0x189cf6c, "external-texture-type4-patch", "type4-patch-object-low-word-store", "b8004522", "0x189cf2c writes the low word of the runtime texture object pointer into the value table."],
  [0x189cf78, "external-texture-type4-patch", "type4-patch-object-high-word-store", "b828692b", "0x189cf2c writes the high word of the runtime texture object pointer into the value table."],
].map(([address, stage, role, expectedOpcodeHex, evidence]) => ({
  address,
  stage,
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

function opcodeRowsForSpecs(buffer, elf) {
  return opcodeSpecs.map((spec) => {
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
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function rowsWithStage(rows, stage) {
  return rows.filter((row) => row.stage === stage);
}

function stageRecovered(rows, stage) {
  const stageRows = rowsWithStage(rows, stage);
  return stageRows.length > 0 && stageRows.every((row) => row.opcodeMatches);
}

function buildCurrentNativeShaderDataExternalTextureBindingAudit(
  {
    binaryPath = defaultBinary,
    texDataTextureObjectPath = defaultTexDataTextureObjectPath,
    textureSamplerTablePath = defaultTextureSamplerTablePath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRowsForSpecs(buffer, elf);
  const texDataTextureObjectAudit = readJson(texDataTextureObjectPath, { summary: {} });
  const textureSamplerTableAudit = readJson(textureSamplerTablePath, { summary: {} });
  const texDataTextureObjectSummary = texDataTextureObjectAudit.summary || {};
  const textureSamplerTableSummary = textureSamplerTableAudit.summary || {};
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const textureRuntimeSetupRecovered = stageRecovered(rows, "texture-runtime-setup");
  const textureRuntimeCallbackInstalled = stageRecovered(rows, "texture-runtime-callback-store");
  const shaderDataExternalResourceRegistrationRecovered = stageRecovered(rows, "shaderdata-resource-registration");
  const textureManagerResourceRegistrationRecovered = stageRecovered(rows, "texture-manager-resource-register");
  const textureManagerKeyExistsCheckRecovered = stageRecovered(rows, "texture-manager-key-exists-check");
  const externalTexturePassLookupRecovered = stageRecovered(rows, "external-texture-pass-lookup");
  const externalTextureRuntimeLookupRecovered = stageRecovered(rows, "external-texture-runtime-lookup");
  const externalTextureType4PatchRecovered = stageRecovered(rows, "external-texture-type4-patch");
  const externalTextureSamplerRuntimeBindingRecovered =
    textureRuntimeSetupRecovered &&
    textureRuntimeCallbackInstalled &&
    shaderDataExternalResourceRegistrationRecovered &&
    textureManagerResourceRegistrationRecovered &&
    textureManagerKeyExistsCheckRecovered &&
    externalTexturePassLookupRecovered &&
    externalTextureRuntimeLookupRecovered &&
    externalTextureType4PatchRecovered &&
    Boolean(texDataTextureObjectSummary.texDataToGlTextureObjectChainRecovered) &&
    Boolean(textureSamplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered);
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    textureRuntimeSetupRows: rowsWithStage(rows, "texture-runtime-setup").length,
    textureRuntimeCallbackStoreRows: rowsWithStage(rows, "texture-runtime-callback-store").length,
    shaderDataResourceRegistrationRows: rowsWithStage(rows, "shaderdata-resource-registration").length,
    textureManagerResourceRegistrationRows: rowsWithStage(rows, "texture-manager-resource-register").length,
    textureManagerKeyExistsCheckRows: rowsWithStage(rows, "texture-manager-key-exists-check").length,
    externalTexturePassLookupRows: rowsWithStage(rows, "external-texture-pass-lookup").length,
    externalTextureRuntimeLookupRows: rowsWithStage(rows, "external-texture-runtime-lookup").length,
    externalTextureType4PatchRows: rowsWithStage(rows, "external-texture-type4-patch").length,
    textureRuntimeSetupRecovered,
    textureRuntimeCallbackInstalled,
    shaderDataExternalResourceRegistrationRecovered,
    textureManagerResourceRegistrationRecovered,
    textureManagerKeyExistsCheckRecovered,
    externalTexturePassLookupRecovered,
    externalTextureRuntimeLookupRecovered,
    externalTextureType4PatchRecovered,
    texDataToGlTextureObjectChainRecovered: Boolean(texDataTextureObjectSummary.texDataToGlTextureObjectChainRecovered),
    shaderDataTextureSamplerStaticUnitLayoutRecovered: Boolean(
      textureSamplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered,
    ),
    externalTextureSamplerRuntimeBindingRecovered,
    externalTextureLookupTreeOffsetHex: "0x30060",
    externalTextureCallbackSlotOffsetHex: "0x30050",
    externalTextureResourceRecordStrideHex: "0x41",
    shadergraphSamplerToTexDataBindingRecovered: false,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    texDataTextureObjectPath,
    textureSamplerTablePath,
    policy:
      "diagnostic-only shaderData external texture binding audit; proves external texture runtime registration/lookup/type4 patch path without enabling material takeover",
    summary,
    interpretation: {
      recovered:
        "The current Android runtime installs a texture resource callback on the shared texture runtime, constructs the texData handler with the same runtime, registers shaderData external texture resource keys before pass build, resolves those keys through the texture runtime lookup tree at +0x30060 during pass build, applies sampler state, and patches the returned texture object pointer into the sampler's type4 value table through 0x189cf2c.",
      boundary:
        "This closes shaderData external texture runtime binding. It still does not recover the final shader/texture formula or justify replacing viewer material rendering for ordinary character materials.",
      nextRequiredEvidence:
        "Trace draw-time shader formula inputs and material-specific sampler semantics before enabling render takeover.",
    },
    items: rows,
  };
}

function exportCurrentNativeShaderDataExternalTextureBindingAudit({
  binaryPath = defaultBinary,
  texDataTextureObjectPath = defaultTexDataTextureObjectPath,
  textureSamplerTablePath = defaultTextureSamplerTablePath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderDataExternalTextureBindingAudit({
    binaryPath,
    texDataTextureObjectPath,
    textureSamplerTablePath,
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
  const summary = exportCurrentNativeShaderDataExternalTextureBindingAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    texDataTextureObjectPath: optionValue(args, "--texdata-texture-object", defaultTexDataTextureObjectPath),
    textureSamplerTablePath: optionValue(args, "--texture-sampler-table", defaultTextureSamplerTablePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderDataExternalTextureBindingAudit,
  exportCurrentNativeShaderDataExternalTextureBindingAudit,
};
