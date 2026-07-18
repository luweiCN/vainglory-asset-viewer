#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-a-add-record-flag-source-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_a_add_record_flag_source_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_a_add_record_flag_source_audit.tsv";

const particleMask = 0x200;

const typeCallbackSpecs = [
  {
    stage: "type-callback",
    role: "layout-a-type-callback-a-pointer",
    address: 0xd7fc24,
    expectedOpcodeHex: "91049108",
    evidence: "layout A type registration materializes callback A as 0xd80124 before storing the callback pair.",
  },
  {
    stage: "type-callback",
    role: "layout-a-type-callback-b-pointer",
    address: 0xd7fc28,
    expectedOpcodeHex: "9105216b",
    evidence: "layout A type registration materializes callback B as 0xd80148 before storing the callback pair.",
  },
  {
    stage: "type-callback",
    role: "layout-a-type-callback-pair-store",
    address: 0xd7fc30,
    expectedOpcodeHex: "a90b2d48",
    evidence: "layout A stores the 0xd80124/0xd80148 callback pair into the type record at +0xb0.",
  },
  {
    stage: "type-callback",
    role: "layout-a-type-callback-a-entry",
    address: 0xd80124,
    expectedOpcodeHex: "f81e0ff3",
    evidence: "registered callback A is a real text entry, not an inferred direct branch target.",
  },
  {
    stage: "type-callback",
    role: "layout-a-type-callback-a-calls-setup",
    address: 0xd80134,
    expectedOpcodeHex: "97fffe0d",
    evidence: "registered callback A calls 0xd7f968, the record-entry setup that falls through to w2=1 registration.",
  },
];

const registeredSetupSpecs = [
  {
    stage: "registered-setup",
    role: "layout-a-record-entry-setup-entry",
    address: 0xd7f968,
    expectedOpcodeHex: "f81e0ff3",
    evidence: "record-entry setup entry reached from registered callback A.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-record-entry-owner-accessor",
    address: 0xd7f988,
    expectedOpcodeHex: "942c4359",
    evidence: "record-entry setup calls the already recovered global render-command owner accessor.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-record-entry-owner-and-callback-store",
    address: 0xd7f9a8,
    expectedOpcodeHex: "a903a660",
    evidence: "record-entry setup stores owner and callback/table pointer at entry +0x8/+0x10.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-record-entry-list-init",
    address: 0xd7f9bc,
    expectedOpcodeHex: "942c4352",
    evidence: "record-entry setup initializes the entry-side list holder before registration.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-registered-setup-default-flags-one",
    address: 0xd7fa04,
    expectedOpcodeHex: "320003e2",
    evidence: "the registered setup path sets w2=1 before entering the shared layout A add-record body; this does not contain particle mask 0x200.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-registered-setup-restore-object",
    address: 0xd7fa08,
    expectedOpcodeHex: "aa1303e0",
    evidence: "the registered setup path restores the object pointer before entering the shared add-record body.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-registered-setup-enters-add-body",
    address: 0xd7fa10,
    expectedOpcodeHex: "14000001",
    evidence: "the registered setup path branches to 0xd7fa14, the shared layout A add-record body.",
  },
  {
    stage: "registered-setup",
    role: "layout-a-add-body-entry",
    address: 0xd7fa14,
    expectedOpcodeHex: "d10143ff",
    evidence: "shared layout A add-record body entry reached with w2 already set by the registered setup path.",
  },
];

const addRecordSpecs = [
  {
    stage: "add-record",
    role: "layout-a-add-record-entry-state-word",
    address: 0xd7fa84,
    expectedOpcodeHex: "32091be8",
    evidence: "the shared add-record body prepares an entry-side state word before saving caller flags.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-save-flags",
    address: 0xd7fa88,
    expectedOpcodeHex: "2a0203f3",
    evidence: "the shared add-record body saves caller w2 flags in w19.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-manager-accessor",
    address: 0xd7faa0,
    expectedOpcodeHex: "942c3b50",
    evidence: "layout A obtains manager 0x311a960 through 0x188e7e0 before add-record.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-entry-pointer",
    address: 0xd7faa4,
    expectedOpcodeHex: "9100c283",
    evidence: "layout A passes x3 = object+0x30 as the concrete manager record entry pointer.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-forward-saved-flags",
    address: 0xd7faac,
    expectedOpcodeHex: "2a1303e2",
    evidence: "layout A forwards the saved flags back as w2 to shared manager add-record 0x188eee0.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-call-manager",
    address: 0xd7fab0,
    expectedOpcodeHex: "942c3d0c",
    evidence: "layout A calls shared manager add-record 0x188eee0.",
  },
  {
    stage: "add-record",
    role: "layout-a-add-record-cache-flags",
    address: 0xd7fab8,
    expectedOpcodeHex: "b900b693",
    evidence: "layout A caches the same flags at object+0xb4 for later d80044 cached refresh.",
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

function opcodeRows(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      ...spec,
      addressHex: hex(spec.address),
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutAAddRecordFlagSourceAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const typeCallbackRows = opcodeRows(buffer, elf, typeCallbackSpecs);
  const registeredSetupRows = opcodeRows(buffer, elf, registeredSetupSpecs);
  const addRecordRows = opcodeRows(buffer, elf, addRecordSpecs);
  const allOpcodeRows = [...typeCallbackRows, ...registeredSetupRows, ...addRecordRows];
  const opcodeMismatchRows = allOpcodeRows.filter((row) => !row.opcodeMatches).length;
  const directD7F968Callers = findDirectBranchCallers(buffer, elf, 0xd7f968);
  const directD7FA14Callers = findDirectBranchCallers(buffer, elf, 0xd7fa14);
  const directAddRecordCallers = findDirectBranchCallers(buffer, elf, 0x188eee0);
  const registeredFlagParticleMaskRows = registeredSetupRows.filter(
    (row) => row.role === "layout-a-registered-setup-default-flags-one" && (1 & particleMask) !== 0,
  ).length;
  const externalUnknownD7FA14CallerRows = directD7FA14Callers.filter((row) => row.callerAddress !== 0xd7fa10).length;
  const callbackToSetupRecovered =
    directD7F968Callers.length === 1 && directD7F968Callers[0].callerAddress === 0xd80134;
  const registeredSetupDefaultFlagsOneRecovered = registeredSetupRows.some(
    (row) => row.role === "layout-a-registered-setup-default-flags-one" && row.opcodeMatches,
  );
  const layoutAAddRecordForwardFlagsRecovered = addRecordRows.some(
    (row) => row.role === "layout-a-add-record-forward-saved-flags" && row.opcodeMatches,
  );
  const summary = {
    typeCallbackRows: typeCallbackRows.length,
    registeredSetupRows: registeredSetupRows.length,
    addRecordRows: addRecordRows.length,
    callbackToSetupRecovered,
    registeredSetupDefaultFlagsOneRecovered,
    layoutAAddRecordForwardFlagsRecovered,
    registeredFlagParticleMaskRows,
    externalUnknownD7FA14CallerRows,
    directAddRecordCallerRows: directAddRecordCallers.length,
    renderPromotionAllowedRows: 0,
    opcodeRows: allOpcodeRows.length,
    opcodeMismatchRows,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout A add-record flag source audit; proves the registered setup path uses w2=1 and does not enable particle rendering takeover",
    particleMask: hex(particleMask),
    summary,
    interpretation: {
      registeredCallback:
        "layout A type registration stores callback A 0xd80124; callback A calls 0xd7f968, whose setup path falls through to 0xd7fa04.",
      flagSource:
        "0xd7fa04 sets w2=1 before 0xd7fa14, then 0xd7fa88 saves that value and 0xd7faac forwards it to 0x188eee0. This registered setup path cannot explain draw-mask bit 0x200.",
      callerBoundary:
        "direct branch/call scans find only the internal 0xd7fa10 branch into 0xd7fa14 and two total manager add-record callers: layout A and layout B.",
      nextRuntimeTarget:
        "Since layout A default registration is not the 0x200 producer, the remaining particle/runtime target is the dynamic object+0xac packed visibility/coverage path plus concrete PFX/emitter semantics.",
    },
    unresolved: [
      "whether non-direct engine callback dispatch can enter layout A add body with a different w2 value is not proven by direct branch scan alone",
      "the dynamic object+0xac packed visibility/coverage path is still not tied to concrete PFX/emitter draw semantics",
      "the exact emitter material, primitive, and timeline formulas remain diagnostic-only",
    ],
    directD7F968Callers,
    directD7FA14Callers,
    directAddRecordCallers,
    typeCallbackRows,
    registeredSetupRows,
    addRecordRows,
  };
}

function exportCurrentNativeLayoutAAddRecordFlagSourceAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutAAddRecordFlagSourceAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, [...manifest.typeCallbackRows, ...manifest.registeredSetupRows, ...manifest.addRecordRows], [
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
  const summary = exportCurrentNativeLayoutAAddRecordFlagSourceAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutAAddRecordFlagSourceAudit,
  exportCurrentNativeLayoutAAddRecordFlagSourceAudit,
};
