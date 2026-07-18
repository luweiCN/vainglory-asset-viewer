#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { buildCurrentNativeObjectAcOwnerTraceAudit } = require("./current_native_object_ac_owner_trace_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-callback-boundary-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_callback_boundary_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_callback_boundary_audit.tsv";

const callbackRanges = [
  { name: "slot0-register", start: 0x8d310c, end: 0x8d3118 },
  { name: "slot1-remove", start: 0x8d311c, end: 0x8d313c },
  { name: "slot4-update", start: 0x8d3140, end: 0x8d3198 },
  { name: "register-body", start: 0x8d398c, end: 0x8d3a30 },
  { name: "refresh-gate", start: 0x8d5048, end: 0x8d50c4 },
];

const roleByTarget = new Map([
  [0x8d398c, "layout-b-register-body"],
  [0x188e7e0, "layout-b-manager-lookup-current"],
  [0x188ef88, "layout-b-manager-remove-record"],
  [0x188b81c, "layout-b-create-helper-fallback"],
  [0x8d3a80, "layout-b-update-before-parameter-dispatch"],
  [0x8d3c24, "layout-b-parameter-dispatch"],
  [0x188eee0, "layout-b-manager-add-record"],
  [0x8d50b0, "layout-b-refresh-local-flag-join"],
  [0x188f020, "layout-b-manager-refresh-record"],
]);

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

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
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

function parseDirectBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function branchEvidence(buffer, elf, candidateTargets) {
  const rows = [];
  for (const range of callbackRanges) {
    for (let address = range.start; address <= range.end; address += 4) {
      const instruction = instructionAt(buffer, elf, address);
      if (instruction === null) continue;
      const branch = parseDirectBranch(instruction, address);
      if (!branch) continue;
      const targetHex = hex(branch.target);
      const targetHitsOutOfFamilyCandidate = candidateTargets.has(targetHex);
      rows.push({
        id: `layout-b-callback-boundary-${hex(address)}`,
        range: range.name,
        address,
        addressHex: hex(address),
        instructionHex: instruction.toString(16).padStart(8, "0"),
        mode: branch.mode,
        target: branch.target,
        targetHex,
        role: roleByTarget.get(branch.target) || "unclassified-layout-b-callback-target",
        targetHitsOutOfFamilyCandidate,
        evidence: targetHitsOutOfFamilyCandidate
          ? "direct branch target overlaps an out-of-family object+0xac owner-trace candidate and needs object identity proof"
          : "direct branch target stays within known layout B manager/helper/refresh boundaries, not an out-of-family object+0xac candidate",
        renderPromotionAllowed: false,
      });
    }
  }
  return rows;
}

function buildCurrentNativeLayoutBCallbackBoundaryAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const ownerTrace = buildCurrentNativeObjectAcOwnerTraceAudit({ binaryPath });
  const candidateTargets = new Set(ownerTrace.items.map((row) => row.nearestDirectBranchTargetHex).filter(Boolean));
  const items = branchEvidence(buffer, elf, candidateTargets);
  const summary = {
    branchRows: items.length,
    candidateTargetHitRows: items.filter((row) => row.targetHitsOutOfFamilyCandidate).length,
    slotCallbackBranchRows: items.filter((row) => row.range.startsWith("slot")).length,
    registerBodyBranchRows: items.filter((row) => row.range === "register-body").length,
    refreshGateBranchRows: items.filter((row) => row.range === "refresh-gate").length,
    managerAddRecordRows: items.filter((row) => row.role === "layout-b-manager-add-record").length,
    managerRefreshRows: items.filter((row) => row.role === "layout-b-manager-refresh-record").length,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B callback-boundary audit; direct branch targets from slot callbacks are not render permission",
    summary,
    interpretation: {
      callbackBoundary:
        "Slot 0 reaches the register body, slot 1 reaches manager remove, and slot 4 reaches local update/parameter or create-helper boundaries. None directly branches into the out-of-family +0xac owner-trace targets.",
      directBranchLimit:
        "This does not exclude indirect vtable/callback routes. It only closes the direct branch route from recovered layout B callbacks to the out-of-family candidates.",
      nextRequiredEvidence:
        "The next promotion blocker is register-level object identity through indirect callback/vtable dispatch or the concrete lifecycle source that sets layout B object+0xac bit 0x200 before refresh.",
    },
    items,
  };
}

function exportCurrentNativeLayoutBCallbackBoundaryAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBCallbackBoundaryAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "range",
    "addressHex",
    "instructionHex",
    "mode",
    "targetHex",
    "role",
    "targetHitsOutOfFamilyCandidate",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBCallbackBoundaryAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBCallbackBoundaryAudit,
  exportCurrentNativeLayoutBCallbackBoundaryAudit,
};
