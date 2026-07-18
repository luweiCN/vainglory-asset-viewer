#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-type210-levelvisuals-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_type210_levelvisuals_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_type210_levelvisuals_bridge_audit.tsv";

const opcodeSpecs = [
  {
    stage: "type-registration",
    role: "type210-literal",
    address: 0x8cb0dc,
    expectedOpcodeHex: "5280420b",
    evidence: "The type factory uses literal 0x210 for this separate object family.",
  },
  {
    stage: "type-registration",
    role: "type210-global-index-store",
    address: 0x8cb100,
    expectedOpcodeHex: "b9009909",
    evidence: "The type factory stores the current package type index in global 0x3035098.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-static-lensflare-list",
    address: 0x8cc3f4,
    expectedOpcodeHex: "f9402e78",
    evidence: "LevelVisuals apply processor reads LevelVisuals +0x58 static lens-flare list.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-loads-type210-global",
    address: 0x8cc414,
    expectedOpcodeHex: "b9409b21",
    evidence: "LevelVisuals static lens-flare path loads the 0x3035098 type index before resolving 0x210 objects.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-static-lensflare-resource-accessor",
    address: 0x8cc424,
    expectedOpcodeHex: "940e9a66",
    evidence: "Static lens-flare path calls resource-key table accessor 0xc72dbc.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-static-lensflare-resource-resolver",
    address: 0x8cc42c,
    expectedOpcodeHex: "940e9a67",
    evidence: "Static lens-flare path calls resource-key string resolver 0xc72dc8.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-resolves-type210-object",
    address: 0x8cc41c,
    expectedOpcodeHex: "943efd27",
    evidence: "LevelVisuals static lens-flare path resolves or creates the 0x210 object through 0x188b8b8.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-static-lensflare-primary-helper",
    address: 0x8cc484,
    expectedOpcodeHex: "97fffb21",
    evidence: "Static lens-flare path routes entries through 0x8cb108.",
  },
  {
    stage: "levelvisuals-static-lensflare",
    role: "levelvisuals-static-lensflare-secondary-helper",
    address: 0x8cc4e4,
    expectedOpcodeHex: "97fffb27",
    evidence: "Static lens-flare path routes entries through 0x8cb180.",
  },
  {
    stage: "primitive-callback",
    role: "type210-render-callback-entry",
    address: 0x8cb418,
    expectedOpcodeHex: "d10343ff",
    evidence: "The 0x210 family installs this local render/update callback.",
  },
  {
    stage: "primitive-callback",
    role: "type210-render-callback-calls-primitive-builder",
    address: 0x8cb60c,
    expectedOpcodeHex: "9400007c",
    evidence: "The 0x210 render callback calls local primitive builder 0x8cb7fc.",
  },
  {
    stage: "primitive-builder",
    role: "type210-primitive-builder-capacity-count-load",
    address: 0x8cb7fc,
    expectedOpcodeHex: "29412408",
    evidence: "Primitive builder reads current and capacity counts from the local output buffer.",
  },
  {
    stage: "primitive-builder",
    role: "type210-primitive-builder-capacity-required-18",
    address: 0x8cb804,
    expectedOpcodeHex: "7100491f",
    evidence: "Primitive builder requires 0x12 local output slots.",
  },
  {
    stage: "primitive-builder",
    role: "type210-primitive-builder-first-record-position-pair",
    address: 0x8cb83c,
    expectedOpcodeHex: "2d009141",
    evidence: "Primitive builder writes the first local primitive record field pair.",
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
      heroPfxRenderPermission: false,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeType210LevelVisualsBridgeAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const hasRole = (role) => rows.some((row) => row.role === role && row.opcodeMatches);
  const levelVisualsStaticLensFlareListRecovered = hasRole("levelvisuals-static-lensflare-list");
  const levelVisualsUsesType210GlobalRecovered = hasRole("levelvisuals-loads-type210-global");
  const type210PrimitiveBuilderRecovered =
    hasRole("type210-render-callback-calls-primitive-builder") && hasRole("type210-primitive-builder-capacity-required-18");
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    type210GlobalIndexRecovered: hasRole("type210-global-index-store"),
    levelVisualsStaticLensFlareListRecovered,
    levelVisualsUsesType210GlobalRecovered,
    staticLensFlareResourceKeyResolveRows: rows.filter((row) =>
      ["levelvisuals-static-lensflare-resource-accessor", "levelvisuals-static-lensflare-resource-resolver"].includes(row.role),
    ).length,
    staticLensFlareHelperRows: rows.filter((row) =>
      ["levelvisuals-static-lensflare-primary-helper", "levelvisuals-static-lensflare-secondary-helper"].includes(row.role),
    ).length,
    type210PrimitiveBuilderRecovered,
    classifiedAsLevelVisualsLensFlareRows:
      levelVisualsStaticLensFlareListRecovered && levelVisualsUsesType210GlobalRecovered && type210PrimitiveBuilderRecovered ? 1 : 0,
    heroPfxRenderPermissionRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only 0x210 LevelVisuals static lens flare bridge audit; proves ownership path but does not enable hero PFX or renderer takeover",
    summary,
    interpretation: {
      ownership:
        "The current binary ties 0x210 to LevelVisuals +0x58 static lens-flare entries through global 0x3035098 and resource-key resolution.",
      primitive:
        "The same 0x210 family has a local render/update callback that writes 18 local primitive records through builder 0x8cb7fc.",
      boundary:
        "This classifies the path as LevelVisuals static lens flare primitive evidence, not hero skill PFX rendering permission.",
    },
    unresolved: [
      "the concrete LevelVisuals static lens-flare resource records selected for the active preview scene",
      "the material/shader state consumed with the 0x210 local primitive records",
      "the final scene/layer policy for rendering LevelVisuals lens-flare primitives",
    ],
    opcodeRows: rows,
  };
}

function exportCurrentNativeType210LevelVisualsBridgeAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeType210LevelVisualsBridgeAudit({ binaryPath });
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
    "evidence",
    "heroPfxRenderPermission",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeType210LevelVisualsBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeType210LevelVisualsBridgeAudit,
  exportCurrentNativeType210LevelVisualsBridgeAudit,
};
