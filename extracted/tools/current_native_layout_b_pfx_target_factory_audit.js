#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-pfx-target-factory-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_pfx_target_factory_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_pfx_target_factory_audit.tsv";

const parameterNameSpecs = [
  {
    role: "target-param-index-ally-enemy",
    parameterName: "Ally_Enemy",
    address: 0x8d41b4,
    expectedOpcodeHex: "912c6421",
    callAddress: 0x8d41b8,
    callExpectedOpcodeHex: "94159530",
    evidence: "layout B target index initializer queries Ally_Enemy on object+0x50 through 0xe39678",
  },
  {
    role: "target-param-index-color",
    parameterName: "Color",
    address: 0x8d41c8,
    expectedOpcodeHex: "91243421",
    callAddress: 0x8d41d8,
    callExpectedOpcodeHex: "94159528",
    evidence: "layout B target index initializer queries Color on object+0x50 through 0xe39678",
  },
  {
    role: "target-param-index-radius",
    parameterName: "Radius",
    address: 0x8d41fc,
    expectedOpcodeHex: "9131b421",
    callAddress: 0x8d4204,
    callExpectedOpcodeHex: "9415951d",
    evidence: "layout B target index initializer queries Radius on object+0x50 through 0xe39678",
  },
  {
    role: "target-param-index-alpha",
    parameterName: "Alpha",
    address: 0x8d4228,
    expectedOpcodeHex: "91162021",
    callAddress: 0x8d4230,
    callExpectedOpcodeHex: "94159512",
    evidence: "layout B target index initializer queries Alpha on object+0x50 through 0xe39678",
  },
  {
    role: "target-param-index-size-xy",
    parameterName: "SizeXY",
    address: 0x8d4254,
    expectedOpcodeHex: "9131d021",
    callAddress: 0x8d425c,
    callExpectedOpcodeHex: "94159507",
    evidence: "layout B target index initializer queries SizeXY on object+0x50 through 0xe39678",
  },
  {
    role: "target-param-index-duration",
    parameterName: "Duration",
    address: 0x8d4280,
    expectedOpcodeHex: "910fb021",
    callAddress: 0x8d4288,
    callExpectedOpcodeHex: "941594fc",
    evidence: "layout B target index initializer queries Duration on object+0x50 through 0xe39678",
  },
];

const factoryRouteSpecs = [
  {
    role: "name-route-kindred-effects-flag-test",
    address: 0x8d42c8,
    expectedOpcodeHex: "36000482",
    evidence: "name route branches between direct resource name and KindredEffects hash lookup based on flag bit 0",
  },
  {
    role: "name-route-resource-context-start",
    address: 0x8d42cc,
    expectedOpcodeHex: "940e7abc",
    evidence: "name route opens the resource context before resolving the KindredEffects table",
  },
  {
    role: "name-route-kindred-effects-string",
    address: 0x8d42d4,
    expectedOpcodeHex: "91064021",
    evidence: "name route materializes the *KindredEffects* table string",
  },
  {
    role: "name-route-kindred-effects-context-lookup",
    address: 0x8d42d8,
    expectedOpcodeHex: "940e7abc",
    evidence: "name route resolves the *KindredEffects* table through the current resource context",
  },
  {
    role: "name-route-fnv-seed",
    address: 0x8d42e4,
    expectedOpcodeHex: "5293b8a8",
    evidence: "name route seeds the FNV-style hash for the requested effect token",
  },
  {
    role: "name-route-fnv-multiply",
    address: 0x8d4308,
    expectedOpcodeHex: "1b0b7d08",
    evidence: "name route multiplies the FNV-style hash while scanning the requested effect token",
  },
  {
    role: "name-route-load-resource-name",
    address: 0x8d4354,
    expectedOpcodeHex: "f9400554",
    evidence: "matched KindredEffects row supplies the concrete resource name for target construction",
  },
  {
    role: "name-route-call-target-factory",
    address: 0x8d4360,
    expectedOpcodeHex: "94000006",
    evidence: "name route calls target factory 0x8d4378 with the resolved resource name",
  },
  {
    role: "name-route-store-target-object50",
    address: 0x8d4364,
    expectedOpcodeHex: "f9002a60",
    object50Store: true,
    evidence: "name route stores the target factory return value into object+0x50",
  },
  {
    role: "id-route-kindred-effects-string",
    address: 0x8d4480,
    expectedOpcodeHex: "91064021",
    evidence: "id/hash route materializes the same *KindredEffects* table string",
  },
  {
    role: "id-route-call-target-factory",
    address: 0x8d44cc,
    expectedOpcodeHex: "97ffffab",
    evidence: "id/hash route calls target factory 0x8d4378 with the matched resource name",
  },
  {
    role: "id-route-store-target-object50",
    address: 0x8d44d0,
    expectedOpcodeHex: "f9002a60",
    object50Store: true,
    evidence: "id/hash route stores the target factory return value into object+0x50",
  },
];

const targetFactorySpecs = [
  {
    role: "target-factory-first-resource-decode-call",
    address: 0x8d43a8,
    expectedOpcodeHex: "94153ff8",
    evidence: "target factory starts resource-name decoding through 0xe24388",
  },
  {
    role: "target-factory-second-resource-decode-call",
    address: 0x8d43c4,
    expectedOpcodeHex: "94154032",
    evidence: "target factory prepares the secondary resource string buffer through 0xe2448c",
  },
  {
    role: "target-factory-owner-slot-a-call",
    address: 0x8d43f0,
    expectedOpcodeHex: "9415a286",
    evidence: "target factory obtains owner slot A through 0xe3ce08 before constructing the target",
  },
  {
    role: "target-factory-build-target-call",
    address: 0x8d4410,
    expectedOpcodeHex: "94159c76",
    evidence: "target factory calls 0xe3b5e8 with owner slot A, decoded strings, and resource metadata",
  },
];

const ownerSlotSpecs = [
  {
    role: "target-factory-owner-slot-a-page",
    address: 0xe3ce08,
    expectedOpcodeHex: "d00116e8",
    evidence: "owner slot A accessor addresses global owner slot page for 0x311a290",
  },
  {
    role: "target-factory-owner-slot-a-load",
    address: 0xe3ce0c,
    expectedOpcodeHex: "f9414900",
    evidence: "owner slot A accessor loads global owner slot 0x311a290",
  },
  {
    role: "target-factory-owner-slot-a-return",
    address: 0xe3ce10,
    expectedOpcodeHex: "d65f03c0",
    evidence: "owner slot A accessor returns the global owner slot value",
  },
  {
    role: "target-config-submit-owner-slot-a-page",
    address: 0xe3cdc4,
    expectedOpcodeHex: "d00116e8",
    evidence: "alternate target config submitter also addresses global owner slot 0x311a290",
  },
  {
    role: "target-config-submit-branch",
    address: 0xe3cdd4,
    expectedOpcodeHex: "17fff935",
    evidence: "alternate submitter branches to 0xe3b2a8 with owner slot A and caller payload",
  },
];

const targetStatusSpecs = [
  {
    role: "target-status-bit-load",
    address: 0xe3cde4,
    expectedOpcodeHex: "7940c808",
    evidence: "target status helper loads target+0x64",
  },
  {
    role: "target-status-bit-or-0x200",
    address: 0xe3cde8,
    expectedOpcodeHex: "32170108",
    evidence: "target status helper ORs target+0x64 with 0x200; this is target-local state, not object+0xac",
  },
  {
    role: "target-status-bit-store",
    address: 0xe3cdec,
    expectedOpcodeHex: "7900c808",
    evidence: "target status helper stores the updated target+0x64 status bits",
  },
  {
    role: "slot4-target-load-before-state-check",
    address: 0x8d314c,
    expectedOpcodeHex: "f9402808",
    evidence: "layout B slot4 update loads object+0x50 before target status gating",
  },
  {
    role: "slot4-target-status-load",
    address: 0x8d3158,
    expectedOpcodeHex: "7940c908",
    evidence: "layout B slot4 update reads target+0x64 to decide whether to skip or refresh",
  },
  {
    role: "slot4-target-status-compare",
    address: 0x8d3160,
    expectedOpcodeHex: "7100a11f",
    evidence: "layout B slot4 update compares target+0x64 masked state against 0x28",
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

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function opcodeRow(buffer, elf, spec, stage) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    stage,
    role: spec.role,
    parameterName: spec.parameterName || "",
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    callAddressHex: hex(spec.callAddress),
    callExpectedOpcodeHex: spec.callExpectedOpcodeHex || "",
    callActualOpcodeHex: spec.callAddress ? instructionHexAt(buffer, elf, spec.callAddress) : "",
    object50Store: Boolean(spec.object50Store),
    kindredEffectsString: spec.role.includes("kindred-effects-string"),
    opcodeMatches:
      actualOpcodeHex === spec.expectedOpcodeHex &&
      (!spec.callAddress || instructionHexAt(buffer, elf, spec.callAddress) === spec.callExpectedOpcodeHex),
    evidence: spec.evidence,
    pfxEmitterDraw: false,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBPfxTargetFactoryAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const parameterNameRows = parameterNameSpecs.map((spec) => opcodeRow(buffer, elf, spec, "parameter-name-index"));
  const factoryRouteRows = factoryRouteSpecs.map((spec) => opcodeRow(buffer, elf, spec, "factory-route"));
  const targetFactoryRows = targetFactorySpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-factory"));
  const ownerSlotRows = ownerSlotSpecs.map((spec) => opcodeRow(buffer, elf, spec, "owner-slot"));
  const targetStatusRows = targetStatusSpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-status"));
  const opcodeRows = [...parameterNameRows, ...factoryRouteRows, ...targetFactoryRows, ...ownerSlotRows, ...targetStatusRows];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const object50StoreRows = factoryRouteRows.filter((row) => row.object50Store).length;
  const kindredEffectsStringRows = factoryRouteRows.filter((row) => row.kindredEffectsString).length;
  const pfxTargetFactoryRecovered =
    opcodeMismatchRows === 0 &&
    object50StoreRows === 2 &&
    kindredEffectsStringRows === 2 &&
    targetFactoryRows.length === 4 &&
    ownerSlotRows.some((row) => row.role === "target-factory-owner-slot-a-load");
  const summary = {
    parameterNameRows: parameterNameRows.length,
    factoryRouteRows: factoryRouteRows.length,
    targetFactoryRows: targetFactoryRows.length,
    ownerSlotRows: ownerSlotRows.length,
    targetStatusRows: targetStatusRows.length,
    object50StoreRows,
    kindredEffectsStringRows,
    pfxTargetFactoryRecovered,
    pfxEmitterDrawRows: 0,
    renderPromotionAllowedRows: 0,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B PFX target-factory audit; proving object+0x50 target creation does not prove emitter draw submission or authorize rendering takeover",
    summary,
    interpretation: {
      targetCreation:
        "Both name and id/hash routes resolve resources through *KindredEffects*, call target factory 0x8d4378, and store the returned target into layout B object+0x50.",
      targetFactory:
        "0x8d4378 decodes resource strings, obtains owner slot A through 0xe3ce08 (global 0x311a290), and calls 0xe3b5e8 to build or fetch the target object.",
      targetState:
        "The target has its own +0x64 status bits. The recovered 0xe3cde4 helper ORs target+0x64 with 0x200, while slot4 checks target+0x64 before refreshing. This is separate from layout B object+0xac.",
      boundary:
        "The target factory is now recovered, but no concrete emitter draw submission from this target has been proven in the viewer-safe chain.",
    },
    unresolved: [
      "the concrete draw/queue call that turns this object+0x50 target into visible PFX/emitter primitives",
      "the exact producer of layout B object+0xac bit 0x200",
      "the skill/action timeline condition selecting which KindredEffects resource route runs",
    ],
    parameterNameRows,
    factoryRouteRows,
    targetFactoryRows,
    ownerSlotRows,
    targetStatusRows,
  };
}

function exportCurrentNativeLayoutBPfxTargetFactoryAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBPfxTargetFactoryAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.parameterNameRows,
      ...manifest.factoryRouteRows,
      ...manifest.targetFactoryRows,
      ...manifest.ownerSlotRows,
      ...manifest.targetStatusRows,
    ],
    [
      "stage",
      "role",
      "parameterName",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "callAddressHex",
      "callExpectedOpcodeHex",
      "callActualOpcodeHex",
      "object50Store",
      "kindredEffectsString",
      "opcodeMatches",
      "evidence",
      "pfxEmitterDraw",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBPfxTargetFactoryAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBPfxTargetFactoryAudit,
  exportCurrentNativeLayoutBPfxTargetFactoryAudit,
};
