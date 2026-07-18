#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-refresh-mode-split-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_refresh_mode_split_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_refresh_mode_split_audit.tsv";

const evidenceSpecs = [
  {
    address: 0x8d4120,
    role: "final-refresh-target-payload-builder-call",
    stage: "final-payload-refresh",
    expectedOpcodeHex: "941598fc",
    evidence: "final dispatch calls 0xe3a510, which returns target+0x40 for payload refresh.",
  },
  {
    address: 0x8d4124,
    role: "final-refresh-payload-arg",
    stage: "final-payload-refresh",
    expectedOpcodeHex: "aa0003e2",
    evidence: "final dispatch forwards target+0x40 in x2.",
  },
  {
    address: 0x8d4130,
    role: "final-refresh-null-flag-arg",
    stage: "final-payload-refresh",
    expectedOpcodeHex: "aa1f03e3",
    evidence: "final dispatch passes x3 = null, so it does not refresh backing flags.",
  },
  {
    address: 0x8d4134,
    role: "final-refresh-manager-refresh-call",
    stage: "final-payload-refresh",
    expectedOpcodeHex: "943eebbb",
    evidence: "final dispatch calls manager refresh with payload-only arguments.",
  },
  {
    address: 0x8d50b4,
    role: "visibility-refresh-manager-global",
    stage: "visibility-flag-refresh",
    expectedOpcodeHex: "943ee5cb",
    evidence: "visibility gate obtains the same manager before refreshing flags.",
  },
  {
    address: 0x8d50b8,
    role: "visibility-refresh-manager-index-load",
    stage: "visibility-flag-refresh",
    expectedOpcodeHex: "79416261",
    evidence: "visibility gate reloads the stored manager record index from object+0xb0.",
  },
  {
    address: 0x8d50bc,
    role: "visibility-refresh-flag-arg",
    stage: "visibility-flag-refresh",
    expectedOpcodeHex: "910013e3",
    evidence: "visibility gate forwards the chosen stack flag slot in x3.",
  },
  {
    address: 0x8d50c0,
    role: "visibility-refresh-null-payload-arg",
    stage: "visibility-flag-refresh",
    expectedOpcodeHex: "aa1f03e2",
    evidence: "visibility gate passes x2 = null, so it does not refresh target+0x40 payload.",
  },
  {
    address: 0x18bf5ec,
    role: "backing-refresh-payload-null-gate",
    stage: "backing-optional-gate",
    expectedOpcodeHex: "b40000e2",
    evidence: "backing refresh skips payload copy when x2 is null.",
  },
  {
    address: 0x18bf608,
    role: "backing-refresh-flags-null-gate",
    stage: "backing-optional-gate",
    expectedOpcodeHex: "b40000a3",
    evidence: "backing refresh skips flag update when x3 is null.",
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

function opcodeRows(buffer, elf) {
  return evidenceSpecs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      address: spec.address,
      addressHex: hex(spec.address),
      role: spec.role,
      stage: spec.stage,
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function countRows(rows, stage) {
  return rows.filter((row) => row.stage === stage && row.opcodeMatches).length;
}

function hasMatchedRole(rows, role) {
  return rows.some((row) => row.role === role && row.opcodeMatches);
}

function buildCurrentNativeLayoutBRefreshModeSplitAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const rows = opcodeRows(buffer, elf);
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const finalRefreshPassesPayloadOnly =
    hasMatchedRole(rows, "final-refresh-payload-arg") && hasMatchedRole(rows, "final-refresh-null-flag-arg");
  const visibilityRefreshPassesFlagsOnly =
    hasMatchedRole(rows, "visibility-refresh-flag-arg") && hasMatchedRole(rows, "visibility-refresh-null-payload-arg");
  const summary = {
    opcodeRows: rows.length,
    opcodeMismatchRows,
    finalPayloadRefreshRows: countRows(rows, "final-payload-refresh"),
    visibilityFlagRefreshRows: countRows(rows, "visibility-flag-refresh"),
    backingOptionalGateRows: countRows(rows, "backing-optional-gate"),
    finalRefreshPassesPayloadOnly,
    visibilityRefreshPassesFlagsOnly,
    payloadAndFlagRefreshModesSeparated: opcodeMismatchRows === 0 && finalRefreshPassesPayloadOnly && visibilityRefreshPassesFlagsOnly,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only current Android layout B refresh mode split; proves payload and flag refresh are separate callsites and does not enable PFX renderer takeover",
    summary,
    interpretation: {
      recovered:
        "Final layout B dispatch passes x2=target+0x40 and x3=null, while the visibility gate passes x2=null and x3=stack flags.",
      boundary:
        "This proves refresh-mode separation only. It does not prove the object+0xac producer or the downstream PFX draw formula.",
      nextRequiredEvidence:
        "Trace the live producer of object+0xac and the consumer of copied target+0x40 payload records after manager filtering.",
    },
    opcodeRows: rows,
  };
}

function exportCurrentNativeLayoutBRefreshModeSplitAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBRefreshModeSplitAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.opcodeRows, [
    "addressHex",
    "role",
    "stage",
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
  const summary = exportCurrentNativeLayoutBRefreshModeSplitAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBRefreshModeSplitAudit,
  exportCurrentNativeLayoutBRefreshModeSplitAudit,
};
