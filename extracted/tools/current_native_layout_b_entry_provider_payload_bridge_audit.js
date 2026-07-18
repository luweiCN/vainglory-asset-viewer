#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-entry-provider-payload-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_entry_provider_payload_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_entry_provider_payload_bridge_audit.tsv";

const entryIdentitySpecs = [
  {
    role: "layout-b-entry-owner-store-entry-plus-0x8",
    address: 0x8d2d64,
    expectedOpcodeHex: "f9001e60",
    evidence: "Layout B constructor stores owner slot B into object+0x38, which is inline entry +0x8.",
  },
  {
    role: "layout-b-provider-subtable-store-object-plus-0x28",
    address: 0x8d2d74,
    expectedOpcodeHex: "f9001668",
    evidence: "Layout B constructor stores the provider sub-vtable at object+0x28, immediately before inline entry object+0x30.",
  },
  {
    role: "layout-b-register-entry-pointer-object-plus-0x30",
    address: 0x8d3a20,
    expectedOpcodeHex: "9100c283",
    evidence: "Layout B registration passes object+0x30 as the concrete manager entry pointer.",
  },
  {
    role: "manager-add-record-store-entry-pointer",
    address: 0x188ef70,
    expectedOpcodeHex: "f90006d3",
    evidence: "Manager add-record stores the caller entry pointer into manager record +0x8.",
  },
  {
    role: "manager-entry-array-load-record-entry",
    address: 0x188f0e4,
    expectedOpcodeHex: "f940054a",
    evidence: "The shared entry-array builder loads task entries from manager record +0x8.",
  },
  {
    role: "manager-entry-array-store-task-entry",
    address: 0x188f0e8,
    expectedOpcodeHex: "f800866a",
    evidence: "The shared entry-array builder stores each loaded entry pointer into the composite task entry array.",
  },
  {
    role: "composite-dispatch-load-current-entry-x4",
    address: 0x18a1494,
    expectedOpcodeHex: "f8767ae4",
    evidence: "Composite dispatch loads the current task entry into x4.",
  },
  {
    role: "composite-dispatch-call-entry-owner",
    address: 0x18a14b4,
    expectedOpcodeHex: "d63f0100",
    evidence: "Composite dispatch calls entry +0x8 owner vtable +0x10 with x4 still holding the current entry.",
  },
];

const entryPrimaryHelperSpecs = [
  {
    role: "entry-primary-table-source-object-plus-0x58",
    address: 0xd7fc64,
    expectedOpcodeHex: "91016008",
    evidence: "The primary entry table slot prepares x0 = object +0x58 before global helper dispatch.",
  },
  {
    role: "entry-primary-table-payload-object-plus-0x40",
    address: 0xd7fc68,
    expectedOpcodeHex: "91010002",
    evidence: "The primary entry table slot prepares x2 = object +0x40 as the helper-dispatch payload.",
  },
  {
    role: "entry-primary-table-global-helper-dispatch",
    address: 0xd7fc70,
    expectedOpcodeHex: "142c4290",
    evidence: "The primary entry table slot tail-branches to global helper dispatch thunk 0x18906b0.",
  },
  {
    role: "global-helper-dispatch-load-helper",
    address: 0x18906b4,
    expectedOpcodeHex: "f9470108",
    evidence: "Global helper dispatch loads the active helper object from global slot 0x311ae00.",
  },
  {
    role: "global-helper-dispatch-tailcall",
    address: 0x18906c8,
    expectedOpcodeHex: "140000a4",
    evidence: "Global helper dispatch tail-calls 0x1890958 while preserving object+0x58 and object+0x40 arguments.",
  },
];

const providerVtableSpecs = [
  {
    role: "provider-vtable-slot-0x0-dtor-thunk",
    address: 0x2726710,
    expectedPointer: 0xd7fb80,
    evidence: "Provider vtable slot +0x0 points at the object-0x28 destructor thunk.",
  },
  {
    role: "provider-vtable-slot-0x8-deleting-dtor",
    address: 0x2726718,
    expectedPointer: 0xd7fbb4,
    evidence: "Provider vtable slot +0x8 points at the deleting destructor path.",
  },
  {
    role: "provider-vtable-slot-0x10-target-handle",
    address: 0x2726720,
    expectedPointer: 0xd7fcac,
    evidence: "Provider vtable slot +0x10 points at the target-handle accessor.",
  },
  {
    role: "provider-vtable-slot-0x18-transform-source",
    address: 0x2726728,
    expectedPointer: 0xd7ff44,
    evidence: "Provider vtable slot +0x18 points at the transform-source accessor.",
  },
];

const providerAccessorSpecs = [
  {
    role: "provider-slot-0x10-return-object-plus-0x30",
    address: 0xd7fcac,
    expectedOpcodeHex: "9100c000",
    evidence: "Provider slot +0x10 returns provider +0x30; for x4-8 provider object+0x28 this is object+0x58.",
  },
  {
    role: "provider-slot-0x10-return",
    address: 0xd7fcb0,
    expectedOpcodeHex: "d65f03c0",
    evidence: "Provider slot +0x10 returns immediately after materializing object+0x58.",
  },
  {
    role: "provider-slot-0x18-return-object-plus-0x48",
    address: 0xd7ff44,
    expectedOpcodeHex: "91012000",
    evidence: "Provider slot +0x18 returns provider +0x48; for x4-8 provider object+0x28 this is object+0x70.",
  },
  {
    role: "provider-slot-0x18-return",
    address: 0xd7ff48,
    expectedOpcodeHex: "d65f03c0",
    evidence: "Provider slot +0x18 returns immediately after materializing object+0x70.",
  },
];

const ownerBProviderUseSpecs = [
  {
    role: "owner-b-entry-save",
    address: 0xe3d424,
    expectedOpcodeHex: "aa0403f6",
    evidence: "ownerB vtable +0x10 saves the composite-dispatch x4 entry.",
  },
  {
    role: "owner-b-provider-load-from-entry-minus-0x8",
    address: 0xe3d434,
    expectedOpcodeHex: "f85f8ec8",
    evidence: "ownerB rewinds x4 by 8 and loads the provider vtable from object+0x28.",
  },
  {
    role: "owner-b-provider-slot-0x10-load",
    address: 0xe3d438,
    expectedOpcodeHex: "f9400908",
    evidence: "ownerB loads provider vtable +0x10.",
  },
  {
    role: "owner-b-provider-slot-0x10-call",
    address: 0xe3d440,
    expectedOpcodeHex: "d63f0100",
    evidence: "ownerB calls provider slot +0x10; the return value becomes the target handle.",
  },
  {
    role: "owner-b-target-handle-save",
    address: 0xe3d448,
    expectedOpcodeHex: "aa0003f5",
    evidence: "ownerB saves the provider +0x10 return as the target handle.",
  },
  {
    role: "owner-b-provider-slot-0x18-load",
    address: 0xe3d450,
    expectedOpcodeHex: "f9400d08",
    evidence: "ownerB loads provider vtable +0x18.",
  },
  {
    role: "owner-b-provider-slot-0x18-call",
    address: 0xe3d454,
    expectedOpcodeHex: "d63f0100",
    evidence: "ownerB calls provider slot +0x18; the return value is the transform source for command construction.",
  },
  {
    role: "owner-b-target-count-helper-call",
    address: 0xe3d460,
    expectedOpcodeHex: "97fff42a",
    evidence: "ownerB calls 0xe3a508 on the target handle; that helper reads target +0x78 as active payload count.",
  },
  {
    role: "owner-b-command-record-build-call",
    address: 0xe3d484,
    expectedOpcodeHex: "97ffff40",
    evidence: "ownerB builds a command record from the transform source and selected submit buffer.",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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
      expectedPointerHex: "",
      actualPointerHex: "",
      pointerMatches: "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function pointerRowsForSpecs(buffer, elf, stage, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 8);
    const actualPointer = fileOffset >= 0 ? buffer.readBigUInt64LE(fileOffset) : null;
    const expectedPointer = BigInt(spec.expectedPointer);
    return {
      stage,
      role: spec.role,
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: "",
      actualOpcodeHex: "",
      opcodeMatches: "",
      expectedPointerHex: hex(spec.expectedPointer),
      actualPointerHex: pointerHex(actualPointer),
      pointerMatches: actualPointer === expectedPointer,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function rowsContain(rows, role) {
  return rows.some((row) => row.role === role && (row.opcodeMatches === true || row.pointerMatches === true));
}

function buildCurrentNativeLayoutBEntryProviderPayloadBridgeAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);

  const entryIdentityRows = opcodeRowsForSpecs(buffer, elf, "entry-identity", entryIdentitySpecs);
  const entryPrimaryHelperRows = opcodeRowsForSpecs(buffer, elf, "entry-primary-helper", entryPrimaryHelperSpecs);
  const providerVtableRows = pointerRowsForSpecs(buffer, elf, "provider-vtable", providerVtableSpecs);
  const providerAccessorRows = opcodeRowsForSpecs(buffer, elf, "provider-accessors", providerAccessorSpecs);
  const ownerBProviderUseRows = opcodeRowsForSpecs(buffer, elf, "owner-b-provider-use", ownerBProviderUseSpecs);
  const opcodeRows = [
    ...entryIdentityRows,
    ...entryPrimaryHelperRows,
    ...providerAccessorRows,
    ...ownerBProviderUseRows,
  ];
  const pointerRows = providerVtableRows;
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const pointerMismatchRows = countRows(pointerRows, (row) => !row.pointerMatches);
  const allRowsMatch = opcodeMismatchRows === 0 && pointerMismatchRows === 0;

  const layoutBEntryIdentityRecovered =
    allRowsMatch &&
    rowsContain(entryIdentityRows, "layout-b-provider-subtable-store-object-plus-0x28") &&
    rowsContain(entryIdentityRows, "layout-b-register-entry-pointer-object-plus-0x30") &&
    rowsContain(entryIdentityRows, "manager-add-record-store-entry-pointer") &&
    rowsContain(entryIdentityRows, "composite-dispatch-load-current-entry-x4");
  const managerEntryToOwnerBRecovered =
    allRowsMatch &&
    rowsContain(entryIdentityRows, "layout-b-entry-owner-store-entry-plus-0x8") &&
    rowsContain(entryIdentityRows, "composite-dispatch-call-entry-owner");
  const entryProviderVtableRecovered =
    allRowsMatch &&
    rowsContain(providerVtableRows, "provider-vtable-slot-0x10-target-handle") &&
    rowsContain(providerVtableRows, "provider-vtable-slot-0x18-transform-source");
  const providerTargetHandleFormulaRecovered =
    entryProviderVtableRecovered && rowsContain(providerAccessorRows, "provider-slot-0x10-return-object-plus-0x30");
  const providerTransformSourceFormulaRecovered =
    entryProviderVtableRecovered && rowsContain(providerAccessorRows, "provider-slot-0x18-return-object-plus-0x48");
  const ownerBUsesProviderTargetAndTransformRecovered =
    allRowsMatch &&
    rowsContain(ownerBProviderUseRows, "owner-b-provider-load-from-entry-minus-0x8") &&
    rowsContain(ownerBProviderUseRows, "owner-b-provider-slot-0x10-call") &&
    rowsContain(ownerBProviderUseRows, "owner-b-provider-slot-0x18-call") &&
    rowsContain(ownerBProviderUseRows, "owner-b-target-count-helper-call") &&
    rowsContain(ownerBProviderUseRows, "owner-b-command-record-build-call");
  const entryHelperPayloadBridgeRecovered =
    allRowsMatch &&
    rowsContain(entryPrimaryHelperRows, "entry-primary-table-source-object-plus-0x58") &&
    rowsContain(entryPrimaryHelperRows, "entry-primary-table-payload-object-plus-0x40") &&
    rowsContain(entryPrimaryHelperRows, "entry-primary-table-global-helper-dispatch") &&
    rowsContain(entryPrimaryHelperRows, "global-helper-dispatch-tailcall");

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B entry/provider/payload bridge audit; proves entry identity and provider accessors but does not enable material or shader takeover",
    summary: {
      entryIdentityRows: entryIdentityRows.length,
      entryPrimaryHelperRows: entryPrimaryHelperRows.length,
      providerVtableRows: providerVtableRows.length,
      providerAccessorRows: providerAccessorRows.length,
      ownerBProviderUseRows: ownerBProviderUseRows.length,
      opcodeRows: opcodeRows.length,
      pointerRows: pointerRows.length,
      opcodeMismatchRows,
      pointerMismatchRows,
      layoutBEntryIdentityRecovered,
      managerEntryToOwnerBRecovered,
      entryProviderVtableRecovered,
      providerTargetHandleFormulaRecovered,
      providerTransformSourceFormulaRecovered,
      ownerBUsesProviderTargetAndTransformRecovered,
      entryHelperPayloadBridgeRecovered,
      targetPayloadToFinalDrawFormulaRecovered: false,
      shaderTextureFormulaRecovered: false,
      renderPromotionAllowedRows: countRows([...opcodeRows, ...pointerRows], (row) => row.renderPromotionAllowed),
    },
    interpretation: {
      entryIdentity:
        "Layout B registers object+0x30 as the manager entry. The manager stores that pointer at record +0x8, and composite dispatch later passes it as x4.",
      providerObject:
        "ownerB vtable +0x10 rewinds x4 by 8, so the provider object is object+0x28. The recovered vtable is 0x2726710.",
      targetAndTransform:
        "Provider slot +0x10 returns object+0x58 as the target handle. Provider slot +0x18 returns object+0x70 as the transform source copied into the command record.",
      helperPayload:
        "The primary entry helper separately dispatches object+0x58 with x2 = object+0x40 through the global helper path, tying the same holder to payload refresh.",
      boundary:
        "This closes entry/provider identity and target/transform accessors only. The target payload node material, shader, texture, sampler, and UV formulas remain diagnostic-only.",
    },
    unresolved: [
      "the exact formula from object+0x40 helper payload refresh into target payload nodes consumed at +0x200/+0x208/+0x220",
      "the shader texture/sampler and UV animation formulas below the final primitive consumer parameter apply",
      "a safe viewer render-promotion rule that uses recovered current-runtime material formulas instead of heuristic material assignment",
    ],
    entryIdentityRows,
    entryPrimaryHelperRows,
    providerVtableRows,
    providerAccessorRows,
    ownerBProviderUseRows,
  };
}

function exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBEntryProviderPayloadBridgeAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.entryIdentityRows,
      ...manifest.entryPrimaryHelperRows,
      ...manifest.providerVtableRows,
      ...manifest.providerAccessorRows,
      ...manifest.ownerBProviderUseRows,
    ],
    [
      "stage",
      "role",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "expectedPointerHex",
      "actualPointerHex",
      "pointerMatches",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBEntryProviderPayloadBridgeAudit,
  exportCurrentNativeLayoutBEntryProviderPayloadBridgeAudit,
};
