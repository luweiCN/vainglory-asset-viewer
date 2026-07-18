#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-target-payload-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_target_payload_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_target_payload_audit.tsv";

const parameterWriter = 0xe39830;
const payloadBuilder = 0xe3a510;

const layoutBParameterUpdateSpecs = [
  {
    role: "layout-b-param-visibility",
    targetLoadAddress: 0x8d3ad4,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3ae0,
    callExpectedOpcodeHex: "94159754",
    evidence: "layout B update loads callback object+0x50 as the target parameter object, then calls 0xe39830",
  },
  {
    role: "layout-b-param-color",
    targetLoadAddress: 0x8d3b3c,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3b40,
    callExpectedOpcodeHex: "9415973c",
    evidence: "layout B color update uses callback object+0x50 as the target parameter object before 0xe39830",
  },
  {
    role: "layout-b-param-radius",
    targetLoadAddress: 0x8d3b5c,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3b68,
    callExpectedOpcodeHex: "94159732",
    evidence: "layout B scalar radius update writes through the same object+0x50 parameter target",
  },
  {
    role: "layout-b-param-size-xy",
    targetLoadAddress: 0x8d3b84,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3b90,
    callExpectedOpcodeHex: "94159728",
    evidence: "layout B vec2 size update writes through the same object+0x50 parameter target",
  },
  {
    role: "layout-b-param-alpha",
    targetLoadAddress: 0x8d3bcc,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3bd0,
    callExpectedOpcodeHex: "94159718",
    evidence: "layout B alpha-like scalar update writes through the same object+0x50 parameter target",
  },
  {
    role: "layout-b-param-duration",
    targetLoadAddress: 0x8d3bec,
    targetLoadExpectedOpcodeHex: "f9402a60",
    callAddress: 0x8d3bf8,
    callExpectedOpcodeHex: "9415970e",
    evidence: "layout B duration-like scalar update writes through the same object+0x50 parameter target",
  },
];

const dynamicParameterUpdateSpecs = [
  {
    role: "layout-b-dynamic-param-update-a",
    targetLoadAddress: 0x8d4f04,
    targetLoadExpectedOpcodeHex: "f9402a68",
    callAddress: 0x8d4f18,
    callExpectedOpcodeHex: "94159246",
    evidence: "dynamic layout B helper reloads object+0x50 into x8, moves it to x0, then calls 0xe39830",
  },
  {
    role: "layout-b-dynamic-param-update-b",
    targetLoadAddress: 0x8d5004,
    targetLoadExpectedOpcodeHex: "f9402aa8",
    callAddress: 0x8d5024,
    callExpectedOpcodeHex: "14159203",
    evidence: "second dynamic layout B helper reloads object+0x50 before tail-branching into 0xe39830",
  },
];

const parameterWriterMechanicSpecs = [
  {
    role: "target-parameter-list-load",
    address: 0xe39838,
    expectedOpcodeHex: "f9404008",
    evidence: "0xe39830 loads the target object's parameter list from target+0x80",
  },
  {
    role: "target-parameter-node-base",
    address: 0xe39840,
    expectedOpcodeHex: "d1006100",
    evidence: "0xe39830 normalizes the selected parameter node by subtracting 0x18",
  },
  {
    role: "target-parameter-next-node-load",
    address: 0xe39854,
    expectedOpcodeHex: "f9400c09",
    evidence: "0xe39830 walks the target parameter list by index",
  },
  {
    role: "target-parameter-value-pointer-forward",
    address: 0xe3986c,
    expectedOpcodeHex: "aa0203e1",
    evidence: "0xe39830 forwards the value pointer to the typed parameter writer",
  },
  {
    role: "target-parameter-writer-tailcall",
    address: 0xe39874,
    expectedOpcodeHex: "140014f4",
    evidence: "0xe39830 tail-calls 0xe3ec44, which writes typed component values and dirty bits",
  },
];

const payloadBridgeSpecs = [
  {
    role: "layout-b-final-target-load",
    address: 0x8d4110,
    expectedOpcodeHex: "f9402a68",
    targetObjectLoad: true,
    evidence: "layout B final dispatch loads callback object+0x50 as the target object",
  },
  {
    role: "layout-b-final-target-payload-builder-call",
    address: 0x8d4120,
    expectedOpcodeHex: "941598fc",
    evidence: "layout B final dispatch calls 0xe3a510 with the target object",
  },
  {
    role: "target-payload-builder-adds-0x40",
    address: 0xe3a510,
    expectedOpcodeHex: "91010000",
    evidence: "0xe3a510 returns target+0x40, so the final payload bridge is target object plus 0x40",
  },
  {
    role: "target-payload-builder-return",
    address: 0xe3a514,
    expectedOpcodeHex: "d65f03c0",
    evidence: "0xe3a510 returns immediately after materializing target+0x40",
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

function parameterUpdateRow(buffer, elf, spec, stage) {
  const targetLoadActualOpcodeHex = instructionHexAt(buffer, elf, spec.targetLoadAddress);
  const callActualOpcodeHex = instructionHexAt(buffer, elf, spec.callAddress);
  return {
    stage,
    role: spec.role,
    targetObjectLoad: true,
    targetLoadAddressHex: hex(spec.targetLoadAddress),
    targetLoadExpectedOpcodeHex: spec.targetLoadExpectedOpcodeHex,
    targetLoadActualOpcodeHex,
    callAddressHex: hex(spec.callAddress),
    callExpectedOpcodeHex: spec.callExpectedOpcodeHex,
    callActualOpcodeHex,
    callTargetHex: hex(parameterWriter),
    opcodeMatches:
      targetLoadActualOpcodeHex === spec.targetLoadExpectedOpcodeHex &&
      callActualOpcodeHex === spec.callExpectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function opcodeRow(buffer, elf, spec, stage) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.address);
  return {
    stage,
    role: spec.role,
    addressHex: hex(spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    targetObjectLoad: Boolean(spec.targetObjectLoad),
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function buildCurrentNativeLayoutBTargetPayloadAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const layoutBParameterUpdateRows = layoutBParameterUpdateSpecs.map((spec) =>
    parameterUpdateRow(buffer, elf, spec, "layout-b-parameter-update"),
  );
  const dynamicParameterUpdateRows = dynamicParameterUpdateSpecs.map((spec) =>
    parameterUpdateRow(buffer, elf, spec, "dynamic-parameter-update"),
  );
  const parameterWriterMechanicRows = parameterWriterMechanicSpecs.map((spec) =>
    opcodeRow(buffer, elf, spec, "parameter-writer-mechanic"),
  );
  const payloadBridgeRows = payloadBridgeSpecs.map((spec) => opcodeRow(buffer, elf, spec, "target-payload-bridge"));
  const opcodeRows = [
    ...layoutBParameterUpdateRows,
    ...dynamicParameterUpdateRows,
    ...parameterWriterMechanicRows,
    ...payloadBridgeRows,
  ];
  const opcodeMismatchRows = opcodeRows.filter((row) => !row.opcodeMatches).length;
  const targetObjectLoadRows = [...layoutBParameterUpdateRows, ...dynamicParameterUpdateRows, ...payloadBridgeRows].filter(
    (row) => row.targetObjectLoad,
  ).length;
  const payloadBuilderReturnsTargetPlus40 = payloadBridgeRows.some(
    (row) =>
      row.role === "target-payload-builder-adds-0x40" &&
      row.addressHex === hex(payloadBuilder) &&
      row.actualOpcodeHex === "91010000",
  );
  const summary = {
    layoutBParameterUpdateRows: layoutBParameterUpdateRows.length,
    dynamicParameterUpdateRows: dynamicParameterUpdateRows.length,
    parameterWriterMechanicRows: parameterWriterMechanicRows.length,
    payloadBridgeRows: payloadBridgeRows.length,
    targetObjectLoadRows,
    payloadBuilderReturnsTargetPlus40,
    pfxEmitterOwnerRows: 0,
    renderPromotionAllowedRows: 0,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only target-payload audit; object+0x50 parameter target and target+0x40 payload do not prove PFX/emitter ownership or draw permission",
    parameterWriterHex: hex(parameterWriter),
    payloadBuilderHex: hex(payloadBuilder),
    summary,
    interpretation: {
      parameterTarget:
        "layout B update paths load callback object+0x50 and pass it into 0xe39830, which walks target+0x80 parameter records and writes through 0xe3ec44.",
      payloadBridge:
        "layout B final dispatch loads callback object+0x50, calls 0xe3a510, and 0xe3a510 returns target+0x40.",
      boundary:
        "This closes the target-payload bridge, but not the creator/lifecycle of the object+0x50 target or a concrete renderable PFX/emitter owner.",
    },
    unresolved: [
      "the creator/lifecycle that allocates and binds callback object +0x50",
      "the concrete PFX/emitter owner represented by target+0x40",
      "the exact producer of callback object +0xac bit 0x200 before refresh/draw",
    ],
    layoutBParameterUpdateRows,
    dynamicParameterUpdateRows,
    parameterWriterMechanicRows,
    payloadBridgeRows,
  };
}

function exportCurrentNativeLayoutBTargetPayloadAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBTargetPayloadAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.layoutBParameterUpdateRows,
      ...manifest.dynamicParameterUpdateRows,
      ...manifest.parameterWriterMechanicRows,
      ...manifest.payloadBridgeRows,
    ],
    [
      "stage",
      "role",
      "targetObjectLoad",
      "targetLoadAddressHex",
      "targetLoadExpectedOpcodeHex",
      "targetLoadActualOpcodeHex",
      "callAddressHex",
      "callExpectedOpcodeHex",
      "callActualOpcodeHex",
      "callTargetHex",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBTargetPayloadAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBTargetPayloadAudit,
  exportCurrentNativeLayoutBTargetPayloadAudit,
};
