#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-a-refresh-state-source-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_a_refresh_state_source_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_a_refresh_state_source_audit.tsv";

const opcodeSpecs = [
  {
    address: 0x8b8420,
    role: "input-byte-refresh-loads-layout-child-record",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "f9402000",
    evidence: "loads the layout A child record from object+0x40 before keep/clear refresh",
  },
  {
    address: 0x8b8428,
    role: "input-byte-refresh-loads-state-byte",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "39400028",
    evidence: "reads caller-provided state byte from x1",
  },
  {
    address: 0x8b842c,
    role: "input-byte-refresh-tests-low-five-bits",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "7200111f",
    evidence: "tests state byte low 0x1f bits before selecting keep versus clear",
  },
  {
    address: 0x8b8430,
    role: "input-byte-refresh-branches-to-clear-when-low-bits-empty",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "54000080",
    evidence: "branches toward clear when the low state bits are absent",
  },
  {
    address: 0x8b8434,
    role: "input-byte-refresh-tests-bit-five-for-clear",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "37280068",
    evidence: "state bit 5 also gates the keep/clear choice",
  },
  {
    address: 0x8b8438,
    role: "input-byte-state-keeps-layout-child",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "14131f03",
    evidence: "tail-calls d80044 to keep the cached layout A child when the predicate passes",
    keepClear: "keep",
  },
  {
    address: 0x8b8440,
    role: "input-byte-state-clears-layout-child",
    stage: "input-byte-refresh",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "14131f19",
    evidence: "tail-calls d800a4 to clear the cached layout A child when the predicate fails",
    keepClear: "clear",
  },
  {
    address: 0x8afe78,
    role: "input-byte-primary-caller-uses-owner-plus-2fc",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "910bf2e1",
    evidence: "primary layout A setup passes owner/state+0x2fc as x1 to 0x8b8420",
  },
  {
    address: 0x8afe80,
    role: "input-byte-primary-caller-invokes-refresh",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "94002168",
    evidence: "primary layout A setup calls 0x8b8420 after resolving the 0x48 child",
  },
  {
    address: 0x97f9e8,
    role: "input-byte-cached-caller-uses-owner-plus-2fc",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "910bf2c1",
    evidence: "cached layout A setup passes owner/state+0x2fc as x1 to 0x8b8420",
  },
  {
    address: 0x97f9ec,
    role: "input-byte-cached-caller-invokes-refresh",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "97fce28d",
    evidence: "cached layout A setup calls 0x8b8420",
  },
  {
    address: 0x8b8344,
    role: "input-byte-list-caller-loads-state-pointer",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "f9400101",
    evidence: "list-walk path loads x1 from the current list entry before calling 0x8b8420",
  },
  {
    address: 0x8b8348,
    role: "input-byte-list-caller-invokes-refresh",
    stage: "input-byte-caller",
    predicateGroup: "input-byte",
    expectedOpcodeHex: "94000036",
    evidence: "list-walk path calls 0x8b8420 for each resolved state pointer",
  },
  {
    address: 0x8af3e4,
    role: "packed-owner-input-loads-caller-flags",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "b9400028",
    evidence: "loads caller flag word before composing the packed state byte",
  },
  {
    address: 0x8af3ec,
    role: "packed-owner-input-loads-owner-halfword",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "7941400a",
    evidence: "loads an owner halfword used by the packed predicate",
  },
  {
    address: 0x8af3f0,
    role: "packed-owner-input-loads-owner-flags",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "b9409c09",
    evidence: "loads owner+0x9c packed fields before building bits 5..7",
  },
  {
    address: 0x8af3fc,
    role: "packed-owner-input-tests-first-mask",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "f277113f",
    evidence: "tests the first owner mask group that feeds the local state byte",
  },
  {
    address: 0x8af408,
    role: "packed-owner-input-inserts-bit-five",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "331b014b",
    evidence: "inserts the first computed owner predicate into bit 5",
  },
  {
    address: 0x8af414,
    role: "packed-owner-input-inserts-bit-six",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "331a014b",
    evidence: "inserts the second computed owner predicate into bit 6",
  },
  {
    address: 0x8af41c,
    role: "packed-owner-input-inserts-bit-seven",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "3319014b",
    evidence: "inserts the third computed owner predicate into bit 7",
  },
  {
    address: 0x8af438,
    role: "packed-owner-input-checks-low-input-bits",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "34000068",
    evidence: "low caller bits must be present before the keep path is selected",
  },
  {
    address: 0x8af43c,
    role: "packed-owner-input-state-keeps-layout-child",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "94134302",
    evidence: "calls d80044 to keep object+0x48 when the packed predicate passes",
    keepClear: "keep",
  },
  {
    address: 0x8af444,
    role: "packed-owner-input-state-clears-layout-child",
    stage: "packed-owner-input-refresh",
    predicateGroup: "packed-owner-input",
    expectedOpcodeHex: "94134318",
    evidence: "calls d800a4 to clear object+0x48 when the packed predicate fails",
    keepClear: "clear",
  },
  {
    address: 0x8dacdc,
    role: "object-byte-state-loads-byte-59",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "39416408",
    evidence: "loads object byte +0x59 before deciding whether a child can be kept",
  },
  {
    address: 0x8dace4,
    role: "object-byte-state-byte-59-clear-branch",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "34000148",
    evidence: "branches to the clear path when object byte +0x59 is absent",
  },
  {
    address: 0x8dace8,
    role: "object-byte-state-loads-byte-58",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "39416268",
    evidence: "loads object byte +0x58 as the second keep predicate",
  },
  {
    address: 0x8dacec,
    role: "object-byte-state-byte-58-clear-branch",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "34000108",
    evidence: "branches to the clear path when object byte +0x58 is absent",
  },
  {
    address: 0x8dacf4,
    role: "object-byte-state-updates-before-keep",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "97ffff83",
    evidence: "calls 0x8dab00 before keeping object+0x38",
  },
  {
    address: 0x8dad08,
    role: "object-byte-state-keeps-layout-child",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "141294cf",
    evidence: "tail-calls d80044 to keep object+0x38 when both bytes are present",
    keepClear: "keep",
  },
  {
    address: 0x8dad1c,
    role: "object-byte-state-clears-layout-child",
    stage: "object-byte-refresh",
    predicateGroup: "object-byte",
    expectedOpcodeHex: "141294e2",
    evidence: "tail-calls d800a4 to clear object+0x38 when either byte is missing",
    keepClear: "clear",
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

function checkedOpcode(buffer, elf, spec) {
  const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
  const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
  return {
    address: spec.address,
    addressHex: hex(spec.address),
    role: spec.role,
    stage: spec.stage,
    predicateGroup: spec.predicateGroup,
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    keepClear: spec.keepClear || "",
    evidence: spec.evidence,
    renderPromotionAllowed: false,
  };
}

function callerRoleForInputByteRefresh(callerAddress) {
  if (callerAddress === 0x8afe80) return "primary-owner-plus-2fc";
  if (callerAddress === 0x97f9ec) return "cached-owner-plus-2fc";
  if (callerAddress === 0x8b8348) return "list-entry-state-pointer";
  return "unclassified";
}

function withCallerRoles(rows) {
  return rows.map((row) => ({
    ...row,
    callerRole: callerRoleForInputByteRefresh(row.callerAddress),
    plus2fcStateSource: row.callerAddress === 0x8afe80 || row.callerAddress === 0x97f9ec,
  }));
}

function buildCurrentNativeLayoutARefreshStateSourceAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const items = opcodeSpecs.map((spec) => checkedOpcode(buffer, elf, spec));
  const opcodeMismatchRows = items.filter((row) => !row.opcodeMatches).length;
  const inputByteRefreshCallers = withCallerRoles(findDirectBranchCallers(buffer, elf, 0x8b8420));
  const trackedKeepAddresses = new Set(items.filter((row) => row.keepClear === "keep").map((row) => row.address));
  const trackedClearAddresses = new Set(items.filter((row) => row.keepClear === "clear").map((row) => row.address));
  const keepCallers = findDirectBranchCallers(buffer, elf, 0xd80044).filter((row) => trackedKeepAddresses.has(row.callerAddress));
  const clearCallers = findDirectBranchCallers(buffer, elf, 0xd800a4).filter((row) => trackedClearAddresses.has(row.callerAddress));
  const predicateGroups = new Set(items.map((row) => row.predicateGroup).filter(Boolean));
  const summary = {
    opcodeRows: items.length,
    opcodeMismatchRows,
    inputByteRefreshCallerRows: inputByteRefreshCallers.length,
    inputByteRefreshPlus2fcCallerRows: inputByteRefreshCallers.filter((row) => row.plus2fcStateSource).length,
    statePredicateGroups: predicateGroups.size,
    trackedKeepCalls: keepCallers.length,
    trackedClearCalls: clearCallers.length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only layout A keep/clear state-source evidence; these predicates explain cached child visibility refresh but do not permit render takeover",
    summary,
    interpretation: {
      inputByte:
        "0x8b8420 reads a caller-provided state byte and keeps the layout A child only when low 0x1f bits are present and bit 5 is clear. Two direct callers pass owner/state+0x2fc; one list-walk caller passes a state pointer loaded from the current list entry.",
      packedOwnerInput:
        "0x8af3bc derives a local state byte from caller flags and owner packed fields, then keeps object+0x48 through d80044 or clears it through d800a4.",
      objectByte:
        "0x8dacdc..0x8dad1c keeps object+0x38 only when object bytes +0x59 and +0x58 are both present; otherwise it clears the child.",
      renderBoundary:
        "All rows remain state/visibility refresh evidence. None is an original particle draw, material shader, or render queue boundary.",
    },
    unresolved: [
      "the resource/action semantic names that feed the owner/state+0x2fc bytes",
      "which higher-level actions toggle the object +0x58/+0x59 bytes",
      "whether any refreshed layout A child later enters a particle-capable manager through a separate verified path",
    ],
    inputByteRefreshCallers,
    keepCallers,
    clearCallers,
    items,
  };
}

function exportCurrentNativeLayoutARefreshStateSourceAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutARefreshStateSourceAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "addressHex",
    "role",
    "stage",
    "predicateGroup",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "keepClear",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutARefreshStateSourceAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutARefreshStateSourceAudit,
  exportCurrentNativeLayoutARefreshStateSourceAudit,
};
