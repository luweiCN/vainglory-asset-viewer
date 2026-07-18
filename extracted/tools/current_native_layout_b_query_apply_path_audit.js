#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-query-apply-path-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_query_apply_path_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_query_apply_path_audit.tsv";

const wrapperSpecs = [
  {
    id: "query-variant-a",
    ownerClass: "query-wrapper",
    helperModes: "query-or-allocate-helper",
    objectRegister: "x22",
    visibilityGateAddress: 0x8a9838,
    visibilityStatePointerSource: "x20+0x2fc",
    evidence:
      "Queries layout B through 0x188e2ac, applies default parameter setup, then calls the visibility gate with x1=x20+0x2fc.",
  },
  {
    id: "query-variant-b",
    ownerClass: "query-wrapper",
    helperModes: "query-or-allocate-helper",
    objectRegister: "x21",
    visibilityGateAddress: 0x8a9de0,
    visibilityStatePointerSource: "x20+0x2fc",
    evidence:
      "Queries layout B through 0x188e2ac, applies the same default parameter setup, then calls the visibility gate with x1=x20+0x2fc.",
  },
  {
    id: "conditional-create-or-query",
    ownerClass: "conditional-create-or-query",
    helperModes: "create-resolve-helper | query-or-allocate-helper",
    objectRegister: "x21",
    visibilityGateAddress: 0x8ae104,
    visibilityStatePointerSource: "linked-owner+0x2fc",
    evidence:
      "Conditionally creates or queries layout B, loads linked owner from x27+0x10, and gates visibility from linked-owner+0x2fc.",
  },
  {
    id: "shared-create-branch",
    ownerClass: "shared-create-branch",
    helperModes: "create-resolve-helper",
    objectRegister: "x20",
    visibilityGateAddress: 0xbab39c,
    visibilityStatePointerSource: "x21+0x2fc",
    evidence:
      "Creates layout B in a shared branch and calls the visibility gate only when caller byte +0x65 is nonzero, using x1=x21+0x2fc.",
  },
];

const opcodeSpecs = [
  [0x8a97a4, "query-variant-a", "type-index-load-query", "b94ea900"],
  [0x8a97ac, "query-variant-a", "query-helper-call", "943f92c0"],
  [0x8a97b0, "query-variant-a", "object-register-capture", "aa0003f6"],
  [0x8a980c, "query-variant-a", "shape-or-resource-setup-call", "9400aaaa"],
  [0x8a9818, "query-variant-a", "transform-setup-call", "9400ab6f"],
  [0x8a9820, "query-variant-a", "state-setup-call", "9400ab33"],
  [0x8a982c, "query-variant-a", "float-parameter-setup-call", "9400ab45"],
  [0x8a9830, "query-variant-a", "visibility-state-pointer-source", "910bf281"],
  [0x8a9838, "query-variant-a", "visibility-gate-call", "9400ae04"],

  [0x8a9d4c, "query-variant-b", "type-index-load-query", "b94ea900"],
  [0x8a9d54, "query-variant-b", "query-helper-call", "943f9156"],
  [0x8a9d58, "query-variant-b", "object-register-capture", "aa0003f5"],
  [0x8a9db4, "query-variant-b", "shape-or-resource-setup-call", "9400a940"],
  [0x8a9dc0, "query-variant-b", "transform-setup-call", "9400aa05"],
  [0x8a9dc8, "query-variant-b", "state-setup-call", "9400a9c9"],
  [0x8a9dd4, "query-variant-b", "float-parameter-setup-call", "9400a9db"],
  [0x8a9dd8, "query-variant-b", "visibility-state-pointer-source", "910bf281"],
  [0x8a9de0, "query-variant-b", "visibility-gate-call", "9400ac9a"],

  [0x8ae040, "conditional-create-or-query", "type-index-load-create", "b94ea901"],
  [0x8ae048, "conditional-create-or-query", "create-helper-call", "943f761c"],
  [0x8ae050, "conditional-create-or-query", "type-index-load-query", "b94ea900"],
  [0x8ae058, "conditional-create-or-query", "query-helper-call", "943f8095"],
  [0x8ae05c, "conditional-create-or-query", "object-register-capture", "aa0003f5"],
  [0x8ae06c, "conditional-create-or-query", "linked-owner-load", "f9400b7b"],
  [0x8ae0f8, "conditional-create-or-query", "visibility-gate-condition", "36000094"],
  [0x8ae0fc, "conditional-create-or-query", "visibility-state-pointer-source", "910bf361"],
  [0x8ae104, "conditional-create-or-query", "visibility-gate-call", "94009bd1"],

  [0xbab2e0, "shared-create-branch", "type-index-load-create", "b94ea901"],
  [0xbab2e4, "shared-create-branch", "create-helper-call", "94338175"],
  [0xbab2e8, "shared-create-branch", "object-register-capture", "aa0003f4"],
  [0xbab38c, "shared-create-branch", "caller-visibility-byte-load", "39419668"],
  [0xbab394, "shared-create-branch", "visibility-state-pointer-source", "910bf2a1"],
  [0xbab39c, "shared-create-branch", "visibility-gate-call", "97f4a72b"],
].map(([address, wrapperId, role, expectedOpcodeHex]) => ({ address, wrapperId, role, expectedOpcodeHex }));

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

function opcodeRows(buffer, elf) {
  return opcodeSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      wrapperId: spec.wrapperId,
      role: spec.role,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      renderPromotionAllowed: false,
    };
  });
}

function buildCurrentNativeLayoutBQueryApplyPathAudit({ binaryPath = defaultBinary } = {}, generatedAt = new Date().toISOString()) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const opcodes = opcodeRows(buffer, elf);
  const wrapperRows = wrapperSpecs.map((spec) => ({
    ...spec,
    visibilityGateAddressHex: hex(spec.visibilityGateAddress),
    opcodeRows: opcodes.filter((row) => row.wrapperId === spec.id).length,
    opcodeMismatchRows: opcodes.filter((row) => row.wrapperId === spec.id && !row.opcodeMatches).length,
    directObjectAcProducerRows: 0,
    renderPromotionAllowed: false,
  }));
  const summary = {
    wrapperRows: wrapperRows.length,
    opcodeRows: opcodes.length,
    opcodeMismatchRows: opcodes.filter((row) => !row.opcodeMatches).length,
    queryWrapperRows: wrapperRows.filter((row) => row.ownerClass === "query-wrapper").length,
    conditionalCreateOrQueryRows: wrapperRows.filter((row) => row.ownerClass === "conditional-create-or-query").length,
    sharedCreateRows: wrapperRows.filter((row) => row.ownerClass === "shared-create-branch").length,
    visibilityGateRows: opcodes.filter((row) => row.role === "visibility-gate-call" && row.opcodeMatches).length,
    statePointerSourceRows: opcodes.filter((row) => row.role === "visibility-state-pointer-source" && row.opcodeMatches).length,
    directObjectAcProducerRows: 0,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B query/apply path audit; wrapper argument proof does not prove object+0xac producer or renderer takeover",
    summary,
    interpretation: {
      recovered:
        "Four current Android wrapper paths create/query layout B objects, apply parameter/state setup, and call the visibility gate with caller-owned state byte pointers.",
      boundary:
        "These paths explain where visibility gate inputs come from. They do not write object+0xac and do not prove the missing 0x200 particle flag producer.",
      nextRequiredEvidence:
        "Trace upstream writers for the caller state bytes and continue from layout B target payload records into concrete PFX/emitter draw formulas.",
    },
    wrapperRows,
    opcodeRows: opcodes,
  };
}

function exportCurrentNativeLayoutBQueryApplyPathAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBQueryApplyPathAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.wrapperRows, [
    "id",
    "ownerClass",
    "helperModes",
    "objectRegister",
    "visibilityGateAddressHex",
    "visibilityStatePointerSource",
    "opcodeRows",
    "opcodeMismatchRows",
    "directObjectAcProducerRows",
    "renderPromotionAllowed",
    "evidence",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBQueryApplyPathAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBQueryApplyPathAudit,
  exportCurrentNativeLayoutBQueryApplyPathAudit,
};
