#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultTextureSamplerTablePath = "extracted/viewer/current-native-shaderdata-texture-sampler-table-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-shaderdata-inline-texture-placeholder-audit.json";
const defaultJsonOut = "extracted/reports/current_native_shaderdata_inline_texture_placeholder_audit.json";
const defaultTsvOut = "extracted/reports/current_native_shaderdata_inline_texture_placeholder_audit.tsv";

const opcodeSpecs = [
  [0x18a03f4, "inline-callsite", "inline-callsite-source-table-arg", "910103e0", "Inline texture record consumer passes the source/parameter table as x0."],
  [0x18a03f8, "inline-callsite", "inline-callsite-sampler-unit-arg", "2a1803e1", "Inline texture record consumer passes the parsed sampler unit as w1."],
  [0x18a03fc, "inline-callsite", "inline-callsite-null-value-arg", "aa1f03e2", "Inline texture record consumer clears x2 before calling 0x189bbdc, so the initial type4 value is null."],
  [0x18a0400, "inline-callsite", "inline-callsite-null-key-arg", "aa1f03e3", "Inline texture record consumer clears x3 before calling 0x189bbdc, so no inline key is hashed at parse time."],
  [0x18a0404, "inline-callsite", "inline-callsite-wrapper-call", "97ffedf6", "Inline texture record consumer calls the inline type4 wrapper 0x189bbdc."],

  [0x189bbdc, "inline-wrapper", "inline-wrapper-entry", "d10143ff", "0x189bbdc is the inline texture type4 wrapper reached by shaderData inline records."],
  [0x189bbfc, "inline-wrapper", "inline-wrapper-save-key-arg", "aa0303f6", "The wrapper saves x3 as the optional key/hash source."],
  [0x189bc00, "inline-wrapper", "inline-wrapper-save-value-arg", "aa0203f5", "The wrapper saves x2 as the object/value pointer source."],
  [0x189bc10, "inline-wrapper", "inline-wrapper-key-null-check", "b4000143", "When x3 is null, the wrapper skips key hashing."],
  [0x189bc38, "inline-wrapper", "inline-wrapper-zero-key-hash", "2a1f03e4", "Null x3 yields key/hash value 0 for the type4 entry."],
  [0x189bc3c, "inline-wrapper", "inline-wrapper-stack-value-address", "910003e2", "The wrapper passes the stack slot address as x2 to the shared type4 entry writer."],
  [0x189bc40, "inline-wrapper", "inline-wrapper-direct-value-flag", "320003e3", "The wrapper sets direct-value flag w3=1, so the shared writer stores [x2] into the value table."],
  [0x189bc4c, "inline-wrapper", "inline-wrapper-store-saved-value", "f90003f5", "The saved x2 value is stored into the stack slot consumed by the shared type4 writer."],
  [0x189bc50, "inline-wrapper", "inline-wrapper-type4-writer-call", "97ffff9f", "The wrapper calls 0x189bacc to create the type4 entry."],

  [0x189bb28, "type4-writer", "type4-writer-direct-flag-store", "3301006c", "The shared type4 writer stores the direct/indirect flag in entry bit 31."],
  [0x189bb40, "type4-writer", "type4-writer-direct-flag-branch", "360000c3", "When direct flag is set, the writer loads an 8-byte value from x2 instead of storing x2 itself."],
  [0x189bb44, "type4-writer", "type4-writer-direct-value-load", "f940004a", "The direct-value branch loads [x2], which is the saved inline value argument."],
  [0x189bb50, "type4-writer", "type4-writer-direct-value-store", "f828692a", "The direct-value branch stores the loaded value into the type4 value table."],

  [0x189c768, "inline-pass-lookup", "inline-pass-count-load", "b9455109", "Pass build reads shaderData inline texture count from the per-pass record at +0x550."],
  [0x189c76c, "inline-pass-lookup", "inline-pass-count-zero-gate", "340002a9", "The inline texture pass-build loop is skipped only when the inline texture count is zero."],
  [0x189c788, "inline-pass-lookup", "inline-pass-runtime-arg", "aa1503e0", "Pass build passes the shared texture runtime manager as x0 to the inline texture object builder."],
  [0x189c78c, "inline-pass-lookup", "inline-pass-payload-arg", "aa1603e1", "Pass build passes the inline texture payload pointer as x1 to the inline texture object builder."],
  [0x189c790, "inline-pass-lookup", "inline-pass-object-builder-call", "94000757", "Pass build calls 0x189e4ec to build a runtime texture object from inline payload bytes."],
  [0x189c798, "inline-pass-lookup", "inline-pass-sampler-unit-load", "b85fc2c1", "After building the object, pass build reloads the inline sampler unit from record payload -4."],
  [0x189c79c, "inline-pass-lookup", "inline-pass-object-to-type4-arg", "aa0003e2", "The inline texture object returned by 0x189e4ec is forwarded as the type4 value."],
  [0x189c7a4, "inline-type4-runtime-patch", "inline-type4-patch-call", "940001e2", "The inline texture object is patched into the sampler's type4 parameter slot through 0x189cf2c."],
  [0x189c7b0, "inline-pass-lookup", "inline-pass-record-stride", "910c42d6", "The inline pass loop advances by the 0x310-byte inline binding record stride."],

  [0x189e524, "inline-texture-object-create", "inline-object-pool-fetch-call", "94000068", "0x189e4ec obtains or recycles a runtime texture object record from the texture runtime manager."],
  [0x189e534, "inline-texture-object-create", "inline-object-default-state-store", "b9002008", "The runtime texture object state word at +0x20 is initialized to -1."],
  [0x189e590, "inline-texture-object-upload", "inline-payload-float-load", "bc687aa2", "The builder reads 0xc0 float values from the inline texture payload."],
  [0x189e5a8, "inline-texture-object-upload", "inline-payload-byte-store", "3828692a", "The builder quantizes those inline float values into a byte buffer for upload."],
  [0x189e5b8, "inline-texture-object-upload", "inline-texture-record-pointer", "9100c295", "The texture record used by upload and sampler state is runtime object +0x30."],
  [0x189e5c0, "inline-texture-object-upload", "inline-gl-texture-create-call", "94001c55", "The builder creates the GL texture object through the current texture helper."],
  [0x189e5e4, "inline-texture-object-upload", "inline-gl-texture-upload-call", "94001c63", "The builder uploads the quantized inline payload into the texture record."],
  [0x189e5f8, "inline-texture-object-upload", "inline-wrap-state-call", "94001dde", "The builder applies inline wrap/sampler state to the texture record."],
  [0x189e60c, "inline-texture-object-upload", "inline-filter-state-call", "94001de5", "The builder applies inline filter/sampler state to the texture record."],
  [0x189e680, "inline-texture-object-create", "inline-object-type-byte-load", "39404008", "The builder updates the returned runtime object's type byte."],
  [0x189e694, "inline-texture-object-create", "inline-object-type-byte-store", "39004008", "The returned runtime object is tagged as the current inline texture object class."],
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

function opcodeRowsForSpecs(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage: spec.stage,
      role: spec.role,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function stageRecovered(rows, stage) {
  const stageRows = rows.filter((row) => row.stage === stage);
  return stageRows.length > 0 && stageRows.every((row) => row.opcodeMatches);
}

function buildCurrentNativeShaderDataInlineTexturePlaceholderAudit(
  {
    binaryPath = defaultBinary,
    textureSamplerTablePath = defaultTextureSamplerTablePath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRowsForSpecs(buffer, elf);
  const textureSamplerTable = readJson(textureSamplerTablePath, { summary: {} });
  const tableSummary = textureSamplerTable.summary || {};
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const inlineCallsiteRecovered = stageRecovered(rows, "inline-callsite");
  const inlineWrapperRecovered = stageRecovered(rows, "inline-wrapper");
  const type4WriterDirectValueRecovered = stageRecovered(rows, "type4-writer");
  const inlinePassLookupRecovered = stageRecovered(rows, "inline-pass-lookup");
  const inlineTextureObjectRuntimeConstructionRecovered = stageRecovered(rows, "inline-texture-object-create");
  const inlineTextureObjectUploadRecovered = stageRecovered(rows, "inline-texture-object-upload");
  const inlineType4RuntimePatchRecovered = stageRecovered(rows, "inline-type4-runtime-patch");
  const inlineType4PlaceholderObjectInitiallyNull =
    inlineCallsiteRecovered &&
    inlineWrapperRecovered &&
    type4WriterDirectValueRecovered &&
    Boolean(tableSummary.inlineTextureRecordConsumerRecovered);
  const inlineTextureObjectBindingRecovered =
    inlineType4PlaceholderObjectInitiallyNull &&
    inlinePassLookupRecovered &&
    inlineTextureObjectRuntimeConstructionRecovered &&
    inlineTextureObjectUploadRecovered &&
    inlineType4RuntimePatchRecovered;
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    inlineCallsiteRows: rows.filter((row) => row.stage === "inline-callsite").length,
    inlineWrapperRows: rows.filter((row) => row.stage === "inline-wrapper").length,
    type4WriterRows: rows.filter((row) => row.stage === "type4-writer").length,
    inlinePassLookupRows: rows.filter((row) => row.stage === "inline-pass-lookup").length,
    inlineTextureObjectCreateRows: rows.filter((row) => row.stage === "inline-texture-object-create").length,
    inlineTextureObjectUploadRows: rows.filter((row) => row.stage === "inline-texture-object-upload").length,
    inlineType4RuntimePatchRows: rows.filter((row) => row.stage === "inline-type4-runtime-patch").length,
    inlineRecordConsumerRecovered: Boolean(tableSummary.inlineTextureRecordConsumerRecovered),
    inlineCallsiteRecovered,
    inlineWrapperRecovered,
    type4WriterDirectValueRecovered,
    inlinePassLookupRecovered,
    inlineTextureObjectRuntimeConstructionRecovered,
    inlineTextureObjectUploadRecovered,
    inlineType4RuntimePatchRecovered,
    inlineRecordCallsitePassesNullValue: inlineCallsiteRecovered,
    inlineRecordCallsitePassesNullKey: inlineCallsiteRecovered,
    inlineWrapperStoresDirectValueSlot: inlineWrapperRecovered && type4WriterDirectValueRecovered,
    inlineType4PlaceholderObjectInitiallyNull,
    inlineTextureObjectBindingRecovered,
    inlineTextureRuntimePatchRequired: !inlineTextureObjectBindingRecovered,
    materialSamplerTextureObjectOwnershipRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    textureSamplerTablePath,
    policy:
      "diagnostic-only shaderData inline texture placeholder audit; proves inline records create null type4 placeholders until a later patch path is recovered",
    summary,
    interpretation: {
      recovered:
        "The current Android inline texture record parser stores the 0x300-byte payload and sampler state under shaderData +0x558, then calls 0x189bbdc with x2=0 and x3=0. The wrapper writes a direct type4 value slot through 0x189bacc, so the initial object pointer is null. During pass build, 0x189c6a0 walks those inline records, calls 0x189e4ec to build/upload a runtime texture object from the inline payload, and patches that object into the same type4 slot through 0x189cf2c.",
      boundary:
        "This closes the inline texture mechanical object-binding path. It still does not recover ordinary material sampler ownership, shadergraph sampler roles, or final shader/texture formulas.",
      nextRequiredEvidence:
        "Join the now-recovered external and inline type4 object bindings to shadergraph sampler roles and source/program runtime values before any renderer promotion.",
    },
    items: rows,
  };
}

function exportCurrentNativeShaderDataInlineTexturePlaceholderAudit({
  binaryPath = defaultBinary,
  textureSamplerTablePath = defaultTextureSamplerTablePath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeShaderDataInlineTexturePlaceholderAudit({ binaryPath, textureSamplerTablePath });
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
  const summary = exportCurrentNativeShaderDataInlineTexturePlaceholderAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    textureSamplerTablePath: optionValue(args, "--texture-sampler-table", defaultTextureSamplerTablePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeShaderDataInlineTexturePlaceholderAudit,
  exportCurrentNativeShaderDataInlineTexturePlaceholderAudit,
};
