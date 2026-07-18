#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-primitive-mode-dispatch-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_primitive_mode_dispatch_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_primitive_mode_dispatch_audit.tsv";

const payloadModeSourceSpecs = [
  [0xe39d80, "payload-node-primitive-count-load", "b9420281", "0xe39c90 reads payload node +0x200 as primitive count."],
  [0xe39d88, "payload-node-flags-load", "b9422288", "0xe39c90 reads payload node +0x220 as the primitive mode/flags word."],
  [0xe39d98, "outer-low-nibble-index", "92400d09", "The outer primitive family is selected from node +0x220 low nibble."],
  [0xe39da4, "outer-low-nibble-dispatch", "d61f0120", "The outer primitive family jumps through the 9-entry table at 0x1afcfb8."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const nestedDispatchSpecs = [
  [0xe39dd4, "nested-mode-a-table-base", "9000662c", "Outer modes 0/1 route to nested-mode-a and decode bits 4..7."],
  [0xe39de8, "nested-mode-a-dispatch", "d61f0100", "nested-mode-a jumps through the 6-entry table at 0x1afd00c."],
  [0xe39fac, "nested-mode-b-table-base", "f000660b", "Outer mode 7 routes to nested-mode-b and decode bits 4..7."],
  [0xe39fc0, "nested-mode-b-dispatch", "d61f0100", "nested-mode-b jumps through the 6-entry table at 0x1afcff4."],
  [0xe3a008, "nested-mode-c-table-base", "d000660b", "Outer mode 8 routes to nested-mode-c and decode bits 4..7."],
  [0xe3a01c, "nested-mode-c-dispatch", "d61f0100", "nested-mode-c jumps through the 6-entry table at 0x1afcfdc."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const modeTableSpecs = [
  {
    table: "outer-low-nibble",
    baseAddress: 0x1afcfb8,
    targets: [0xe39da8, 0xe39da8, 0xe3a044, 0xe3a374, 0xe3a05c, 0xe3a0a8, 0xe39e14, 0xe39f8c, 0xe39fe8],
    evidence: "Outer primitive family selected from node +0x220 low nibble.",
  },
  {
    table: "nested-mode-a",
    baseAddress: 0x1afd00c,
    targets: [0xe39dec, 0xe3a1d0, 0xe3a188, 0xe3a1c4, 0xe3a17c, 0xe3a1f8],
    evidence: "Nested table for outer modes 0/1 selected from node +0x220 bits 4..7.",
  },
  {
    table: "nested-mode-b",
    baseAddress: 0x1afcff4,
    targets: [0xe39fc4, 0xe3a2a4, 0xe3a234, 0xe3a2c8, 0xe3a224, 0xe3a32c],
    evidence: "Nested table for outer mode 7 selected from node +0x220 bits 4..7.",
  },
  {
    table: "nested-mode-c",
    baseAddress: 0x1afcfdc,
    targets: [0xe3a020, 0xe3a2e8, 0xe3a26c, 0xe3a30c, 0xe3a22c, 0xe3a350],
    evidence: "Nested table for outer mode 8 selected from node +0x220 bits 4..7.",
  },
];

const builderCallSpecs = [
  [0xe39e0c, "nested-mode-a-index-0-builder-call", "9400188e", 0xe40044, "nested-mode-a index 0 calls builder 0xe40044."],
  [0xe39f84, "outer-mode-6-builder-call", "940015f5", 0xe3f758, "outer mode 6 calls builder 0xe3f758 after transform setup."],
  [0xe39fe0, "nested-mode-b-index-0-builder-call", "94001a5e", 0xe40958, "nested-mode-b index 0 calls builder 0xe40958."],
  [0xe3a03c, "nested-mode-c-index-0-builder-call", "94001be0", 0xe40fbc, "nested-mode-c index 0 calls builder 0xe40fbc."],
  [0xe3a054, "outer-mode-2-builder-call", "94001360", 0xe3edd4, "outer mode 2 calls compact 0x24-byte record builder 0xe3edd4."],
  [0xe3a0a0, "outer-mode-4-builder-call", "94001372", 0xe3ee68, "outer mode 4 calls builder 0xe3ee68."],
  [0xe3a174, "outer-mode-5-builder-call", "94001460", 0xe3f2f4, "outer mode 5 calls builder 0xe3f2f4."],
  [0xe3a1bc, "nested-mode-a-index-2-builder-call", "94001878", 0xe4039c, "nested-mode-a index 2 calls builder 0xe4039c."],
  [0xe3a1f0, "nested-mode-a-index-1-builder-call", "94001868", 0xe40390, "nested-mode-a index 1 tail-routes into 0xe40044 through thunk 0xe40390."],
  [0xe3a21c, "nested-mode-a-index-3-5-builder-call", "94001744", 0xe3ff2c, "nested-mode-a indices 3/4/5 route through wrapper 0xe3ff2c."],
  [0xe3a264, "nested-mode-b-index-2-builder-call", "94001a44", 0xe40b74, "nested-mode-b index 2 calls builder 0xe40b74."],
  [0xe3a29c, "nested-mode-c-index-2-builder-call", "94001bcf", 0xe411d8, "nested-mode-c index 2 calls builder 0xe411d8."],
  [0xe3a2c0, "nested-mode-b-index-1-builder-call", "94001a2a", 0xe40b68, "nested-mode-b index 1 tail-routes into 0xe40958 through thunk 0xe40b68."],
  [0xe3a304, "nested-mode-c-index-1-builder-call", "94001bb2", 0xe411cc, "nested-mode-c index 1 tail-routes into 0xe40fbc through thunk 0xe411cc."],
  [0xe3a348, "nested-mode-b-index-3-5-builder-call", "9400193f", 0xe40844, "nested-mode-b indices 3/4/5 route through wrapper 0xe40844."],
  [0xe3a36c, "nested-mode-c-index-3-5-builder-call", "94001acf", 0xe40ea8, "nested-mode-c indices 3/4/5 route through wrapper 0xe40ea8."],
].map(([address, role, expectedOpcodeHex, target, evidence]) => ({
  address,
  role,
  expectedOpcodeHex,
  target,
  evidence,
}));

const builderEntrySpecs = [
  [0xe3edd4, "builder-entry-0xe3edd4", "d10103ff", "0xe3edd4 is a compact 0x24-byte record builder entry."],
  [0xe3ee68, "builder-entry-0xe3ee68", "d10583ff", "0xe3ee68 is a spline/polyline-style builder entry."],
  [0xe3f2f4, "builder-entry-0xe3f2f4", "d10543ff", "0xe3f2f4 is an interpolated strip-style builder entry."],
  [0xe3f758, "builder-entry-0xe3f758", "6db63bef", "0xe3f758 is a variable strip builder entry."],
  [0xe3ff2c, "builder-wrapper-0xe3ff2c", "d10183ff", "0xe3ff2c prepares orientation defaults then calls 0xe40044."],
  [0xe40044, "builder-entry-0xe40044", "d106c3ff", "0xe40044 is a multi-record builder entry."],
  [0xe40390, "builder-thunk-0xe40390", "a94023e9", "0xe40390 is a stack-argument thunk into 0xe40044."],
  [0xe4039c, "builder-entry-0xe4039c", "d105c3ff", "0xe4039c is a 0xd8-byte multi-record builder entry."],
  [0xe40844, "builder-wrapper-0xe40844", "d10143ff", "0xe40844 prepares orientation defaults then calls 0xe40958."],
  [0xe40958, "builder-entry-0xe40958", "d10443ff", "0xe40958 is a 0x288-byte multi-record builder entry."],
  [0xe40b68, "builder-thunk-0xe40b68", "f94003e8", "0xe40b68 is a stack-argument thunk into 0xe40958."],
  [0xe40b74, "builder-entry-0xe40b74", "d105c3ff", "0xe40b74 is a 0x288-byte sibling builder entry."],
  [0xe40ea8, "builder-wrapper-0xe40ea8", "d10143ff", "0xe40ea8 prepares orientation defaults then calls 0xe40fbc."],
  [0xe40fbc, "builder-entry-0xe40fbc", "d10443ff", "0xe40fbc is a 0x6c0-byte multi-record builder entry."],
  [0xe411cc, "builder-thunk-0xe411cc", "f94003e8", "0xe411cc is a stack-argument thunk into 0xe40fbc."],
  [0xe411d8, "builder-entry-0xe411d8", "d105c3ff", "0xe411d8 is a 0x6c0-byte sibling builder entry."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const outputPatternSpecs = [
  [0xe3ee3c, "builder-24-record-advance", "9100916b", "0xe3edd4 advances output by 0x24 bytes per compact record."],
  [0xe3f220, "builder-48-record-position-store", "f9404fe8", "0xe3ee68/0xe3f2f4-family writes 0x48-byte paired records."],
  [0xe3f244, "builder-48-record-time-store", "bd002380", "0xe3ee68/0xe3f2f4-family stores a scalar time/phase at record +0x20."],
  [0xe3f260, "builder-48-record-second-half-flag-store", "b900439f", "0xe3ee68/0xe3f2f4-family stores the second half of the 0x48-byte record."],
  [0xe3fe1c, "builder-variable-record-advance-0x24", "91009273", "0xe3f758 advances by 0x24 after writing one variable strip record."],
  [0xe3fe68, "builder-variable-record-secondary-flag", "b9004268", "0xe3f758 writes a secondary strip record at +0x40 when needed."],
  [0xe3fea4, "builder-variable-record-advance-0x6c", "9101b273", "0xe3f758 can expand to a 0x6c-byte output span."],
  [0xe40e04, "builder-288-record-advance", "91009108", "0xe40958/0xe40b74-family advances inner records by 0x24."],
  [0xe40e08, "builder-288-record-loop-limit", "f10a211f", "0xe40958/0xe40b74-family loops until 0x288 bytes are written for one input."],
  [0xe40e2c, "builder-288-position-store", "fd000147", "0xe40958/0xe40b74-family writes position pairs into each 0x24-byte record."],
  [0xe40e3c, "builder-288-uv-or-phase-store", "fc01c146", "0xe40958/0xe40b74-family writes an 8-byte phase/uv pair at record +0x1c."],
  [0xe41124, "builder-6c0-record-advance", "91009108", "0xe40fbc/0xe411d8-family advances inner records by 0x24."],
  [0xe41128, "builder-6c0-record-loop-limit", "f11b011f", "0xe40fbc/0xe411d8-family loops until 0x6c0 bytes are written for one input."],
  [0xe4114c, "builder-6c0-position-store", "fd000147", "0xe40fbc/0xe411d8-family writes position pairs into each 0x24-byte record."],
  [0xe4115c, "builder-6c0-uv-or-phase-store", "fc01c146", "0xe40fbc/0xe411d8-family writes an 8-byte phase/uv pair at record +0x1c."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

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
      table: "",
      index: "",
      expectedTargetHex: "",
      actualTargetHex: "",
      tableMatches: "",
      targetHex: spec.target ? hex(spec.target) : "",
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function tableRowsForSpecs(buffer, elf) {
  const rows = [];
  for (const spec of modeTableSpecs) {
    for (let index = 0; index < spec.targets.length; index += 1) {
      const address = spec.baseAddress + index * 4;
      const fileOffset = fileOffsetForVirtualAddress(elf, address, 4);
      const actualOffset = fileOffset >= 0 ? buffer.readInt32LE(fileOffset) : null;
      const actualTarget = actualOffset == null ? null : spec.baseAddress + actualOffset;
      rows.push({
        stage: "primitive-mode-table",
        role: `${spec.table}-entry-${index}`,
        table: spec.table,
        index,
        address,
        addressHex: hex(address),
        expectedOpcodeHex: "",
        actualOpcodeHex: "",
        opcodeMatches: "",
        expectedTargetHex: hex(spec.targets[index]),
        actualTargetHex: actualTarget == null ? "" : hex(actualTarget),
        expectedRelativeOffset: spec.targets[index] - spec.baseAddress,
        actualRelativeOffset: actualOffset ?? "",
        tableMatches: actualTarget === spec.targets[index],
        targetHex: actualTarget == null ? "" : hex(actualTarget),
        evidence: spec.evidence,
        renderPromotionAllowed: false,
      });
    }
  }
  return rows;
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildCurrentNativeLayoutBPrimitiveModeDispatchAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const payloadModeSourceRows = opcodeRowsForSpecs(buffer, elf, "payload-mode-source", payloadModeSourceSpecs);
  const nestedDispatchRows = opcodeRowsForSpecs(buffer, elf, "nested-mode-dispatch", nestedDispatchSpecs);
  const modeTableRows = tableRowsForSpecs(buffer, elf);
  const builderCallRows = opcodeRowsForSpecs(buffer, elf, "builder-call-matrix", builderCallSpecs);
  const builderEntryRows = opcodeRowsForSpecs(buffer, elf, "builder-entries", builderEntrySpecs);
  const outputPatternRows = opcodeRowsForSpecs(buffer, elf, "builder-output-patterns", outputPatternSpecs);
  const opcodeRows = [
    ...payloadModeSourceRows,
    ...nestedDispatchRows,
    ...builderCallRows,
    ...builderEntryRows,
    ...outputPatternRows,
  ];
  const opcodeMismatchRows = countRows(opcodeRows, (row) => !row.opcodeMatches);
  const tableMismatchRows = countRows(modeTableRows, (row) => !row.tableMatches);
  const allRowsMatch = opcodeMismatchRows === 0 && tableMismatchRows === 0;
  const uniqueBuilderTargets = new Set(builderCallRows.map((row) => row.targetHex).filter(Boolean)).size;
  const outerModeEntries = countRows(modeTableRows, (row) => row.table === "outer-low-nibble");
  const nestedModeEntries = modeTableRows.length - outerModeEntries;

  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B primitive mode dispatch audit; maps payload node +0x220 modes to native builder calls without enabling material rendering takeover",
    summary: {
      payloadModeSourceRows: payloadModeSourceRows.length,
      modeTableRows: modeTableRows.length,
      nestedDispatchRows: nestedDispatchRows.length,
      builderCallRows: builderCallRows.length,
      builderEntryRows: builderEntryRows.length,
      outputPatternRows: outputPatternRows.length,
      opcodeRows: opcodeRows.length,
      tableRows: modeTableRows.length,
      opcodeMismatchRows,
      tableMismatchRows,
      outerModeEntries,
      nestedModeEntries,
      uniqueBuilderTargets,
      outerModeDispatchRecovered: allRowsMatch && outerModeEntries === 9,
      nestedModeDispatchRecovered: allRowsMatch && nestedModeEntries === 18,
      builderCallMatrixRecovered: allRowsMatch && uniqueBuilderTargets === 16,
      outputRecordShapePartiallyRecovered:
        allRowsMatch &&
        outputPatternRows.some((row) => row.role === "builder-24-record-advance") &&
        outputPatternRows.some((row) => row.role === "builder-288-record-loop-limit") &&
        outputPatternRows.some((row) => row.role === "builder-6c0-record-loop-limit"),
      materialFormulaRecovered: false,
      renderPromotionAllowedRows: countRows([...opcodeRows, ...modeTableRows], (row) => row.renderPromotionAllowed),
    },
    interpretation: {
      modeSource:
        "0xe39c90 reads payload node +0x200 and +0x220. The low nibble of +0x220 selects the outer primitive family; some families then use bits 4..7 for a nested 6-way dispatch.",
      dispatchShape:
        "The current binary has a 9-entry outer table and three nested 6-entry tables. These tables route to 16 distinct builder targets or wrappers.",
      outputShape:
        "Several output spans are now opcode-bounded: compact 0x24 records, 0x48 paired records, variable 0x24/0x6c strip records, 0x288 batches, and 0x6c0 batches.",
      boundary:
        "The dispatch and coarse output record sizes are recovered, but node material/shader/texture fields, atlas policy, blend/depth state, and color formulas are still not decoded.",
    },
    unresolved: [
      "semantic names for each +0x220 primitive mode and nested mode",
      "material/shader/texture bindings consumed by each builder family",
      "blend/depth/sort policy for the records emitted by these builders",
      "which node fields control atlas frame, UV scroll, color, alpha, and lifetime in each builder",
    ],
    payloadModeSourceRows,
    modeTableRows,
    nestedDispatchRows,
    builderCallRows,
    builderEntryRows,
    outputPatternRows,
  };
}

function exportCurrentNativeLayoutBPrimitiveModeDispatchAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBPrimitiveModeDispatchAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.payloadModeSourceRows,
      ...manifest.modeTableRows,
      ...manifest.nestedDispatchRows,
      ...manifest.builderCallRows,
      ...manifest.builderEntryRows,
      ...manifest.outputPatternRows,
    ],
    [
      "stage",
      "role",
      "table",
      "index",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "expectedTargetHex",
      "actualTargetHex",
      "tableMatches",
      "targetHex",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBPrimitiveModeDispatchAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBPrimitiveModeDispatchAudit,
  exportCurrentNativeLayoutBPrimitiveModeDispatchAudit,
};
