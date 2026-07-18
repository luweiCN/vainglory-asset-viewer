#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");
const { buildCurrentNativeObjectAcWidthOverlapAudit } = require("./current_native_object_ac_width_overlap_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-object-ac-owner-trace-audit.json";
const defaultJsonOut = "extracted/reports/current_native_object_ac_owner_trace_audit.json";
const defaultTsvOut = "extracted/reports/current_native_object_ac_owner_trace_audit.tsv";

const layoutBFamilyStart = 0x8d2d00;
const layoutBFamilyEnd = 0x8d5100;
const nearLayoutBRegistrationStart = 0x8d2700;
const nearLayoutBRegistrationEnd = 0x8d2b00;
const renderOwnerHelperTarget = 0xd7f7b8;
const renderOwnerHelperStore = 0xd7f7e8;

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

function isLayoutBFamilyAddress(address) {
  return address >= layoutBFamilyStart && address < layoutBFamilyEnd;
}

function isNearLayoutBRegistrationAddress(address) {
  return address >= nearLayoutBRegistrationStart && address < nearLayoutBRegistrationEnd;
}

function parseDirectBranch(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    target: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function directBranchTargetIndex(buffer, elf) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error("missing .text section");
  const callersByTarget = new Map();
  for (let fileOffset = text.fileOffset; fileOffset + 4 <= text.fileOffset + text.size; fileOffset += 4) {
    const pc = text.virtualAddress + (fileOffset - text.fileOffset);
    const instruction = buffer.readUInt32LE(fileOffset);
    const branch = parseDirectBranch(instruction, pc);
    if (!branch) continue;
    if (branch.target < text.virtualAddress || branch.target >= text.virtualAddress + text.size) continue;
    const callers = callersByTarget.get(branch.target) || [];
    callers.push({
      callerAddress: pc,
      callerAddressHex: hex(pc),
      mode: branch.mode,
      instructionHex: instruction.toString(16).padStart(8, "0"),
      inLayoutBFamily: isLayoutBFamilyAddress(pc),
      nearLayoutBRegistration: isNearLayoutBRegistrationAddress(pc),
    });
    callersByTarget.set(branch.target, callers);
  }
  return {
    sortedTargets: [...callersByTarget.keys()].sort((left, right) => left - right),
    callersByTarget,
  };
}

function nearestDirectBranchTarget(sortedTargets, address) {
  let lower = 0;
  let upper = sortedTargets.length - 1;
  let best = null;
  while (lower <= upper) {
    const middle = (lower + upper) >> 1;
    if (sortedTargets[middle] <= address) {
      best = sortedTargets[middle];
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return best;
}

function ownerTraceClass(row, nearestTarget, layoutBDirectCallerCount) {
  if (row.address === renderOwnerHelperStore && nearestTarget === renderOwnerHelperTarget) {
    return "render-owner-helper-not-layout-b-flag";
  }
  if (layoutBDirectCallerCount) return "layout-b-direct-call-needs-dataflow";
  if (nearestTarget !== null) return "direct-called-out-of-family";
  return "no-near-direct-branch-target";
}

function ownerTraceEvidence(row, nearestTarget, directCallers, layoutBDirectCallerCount) {
  if (row.address === renderOwnerHelperStore && nearestTarget === renderOwnerHelperTarget) {
    return "nearest direct branch target is 0xd7f7b8, a render-owner/helper initializer that stores helper return at its own +0xa8; nearby 0x8d27xx callers are outside the recovered layout B object family";
  }
  if (layoutBDirectCallerCount) {
    return "has a direct caller inside the recovered layout B family and still needs register/object dataflow proof before promotion";
  }
  if (directCallers.length) {
    return "nearest direct branch target has direct callers, but none originate in the recovered layout B family";
  }
  return "no nearest direct branch target was recovered before this store";
}

function buildOwnerTraceItems({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const branchIndex = directBranchTargetIndex(buffer, elf);
  const widthAudit = buildCurrentNativeObjectAcWidthOverlapAudit({ binaryPath });
  return widthAudit.items
    .filter((row) => row.producerClass === "out-of-family-wide-needs-owner")
    .map((row) => {
      const nearestTarget = nearestDirectBranchTarget(branchIndex.sortedTargets, row.address);
      const directCallers = nearestTarget === null ? [] : branchIndex.callersByTarget.get(nearestTarget) || [];
      const layoutBDirectCallers = directCallers.filter((caller) => caller.inLayoutBFamily);
      const nearLayoutBRegistrationCallers = directCallers.filter((caller) => caller.nearLayoutBRegistration);
      const distance = nearestTarget === null ? null : row.address - nearestTarget;
      const traceClass = ownerTraceClass(row, nearestTarget, layoutBDirectCallers.length);
      return {
        id: `object-ac-owner-trace-${row.addressHex}`,
        address: row.address,
        addressHex: row.addressHex,
        accessKind: row.accessKind,
        objectFieldOffsetHex: row.objectFieldOffsetHex,
        byteWidth: row.byteWidth,
        valueRegister: row.valueRegister,
        nearestDirectBranchTargetHex: hex(nearestTarget),
        nearestDirectBranchTargetDistance: distance ?? "",
        directCallerCount: directCallers.length,
        layoutBDirectCallerCount: layoutBDirectCallers.length,
        nearLayoutBRegistrationCallerCount: nearLayoutBRegistrationCallers.length,
        directCallerAddressHexes: directCallers.map((caller) => caller.callerAddressHex).join("|"),
        layoutBDirectCallerAddressHexes: layoutBDirectCallers.map((caller) => caller.callerAddressHex).join("|"),
        nearLayoutBRegistrationCallerAddressHexes: nearLayoutBRegistrationCallers
          .map((caller) => caller.callerAddressHex)
          .join("|"),
        ownerTraceClass: traceClass,
        evidence: ownerTraceEvidence(row, nearestTarget, directCallers, layoutBDirectCallers.length),
        renderPromotionAllowed: false,
      };
    });
}

function buildCurrentNativeObjectAcOwnerTraceAudit(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const items = buildOwnerTraceItems({ binaryPath });
  const renderOwnerRows = items.filter((row) => row.ownerTraceClass === "render-owner-helper-not-layout-b-flag");
  const renderOwnerCallerSet = new Set(
    renderOwnerRows.flatMap((row) => row.directCallerAddressHexes.split("|").filter(Boolean)),
  );
  const renderOwnerNearCallerSet = new Set(
    renderOwnerRows.flatMap((row) => row.nearLayoutBRegistrationCallerAddressHexes.split("|").filter(Boolean)),
  );
  const summary = {
    candidateRows: items.length,
    rowsWithNearestDirectBranchTarget: items.filter((row) => row.nearestDirectBranchTargetHex).length,
    nearestTargetWithin128Rows: items.filter(
      (row) => row.nearestDirectBranchTargetDistance !== "" && row.nearestDirectBranchTargetDistance <= 0x80,
    ).length,
    nearestTargetWithin512Rows: items.filter(
      (row) => row.nearestDirectBranchTargetDistance !== "" && row.nearestDirectBranchTargetDistance <= 0x200,
    ).length,
    rowsWithAnyDirectCallers: items.filter((row) => row.directCallerCount).length,
    rowsWithLayoutBDirectCallers: items.filter((row) => row.layoutBDirectCallerCount).length,
    renderOwnerHelperRows: renderOwnerRows.length,
    renderOwnerHelperDirectCallers: renderOwnerCallerSet.size,
    renderOwnerHelperNearLayoutBRegistrationCallers: renderOwnerNearCallerSet.size,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only owner-trace pass for out-of-family object+0xac width-overlap stores; direct branch proximity is not render permission",
    layoutBFamilyRangeHex: `${hex(layoutBFamilyStart)}..${hex(layoutBFamilyEnd)}`,
    nearLayoutBRegistrationRangeHex: `${hex(nearLayoutBRegistrationStart)}..${hex(nearLayoutBRegistrationEnd)}`,
    summary,
    interpretation: {
      directCallerBoundary:
        "No out-of-family nonzero width-overlap store has a direct caller inside the recovered layout B family range.",
      renderOwnerHelper:
        "The one nearby 0xd7f7b8 helper stores a render-owner/helper return at +0xa8 and is reached from 0x8d27xx setup callers, but those callers are outside the recovered layout B object family and do not write the layout B particle mask.",
      nextRequiredEvidence:
        "Only indirect callback/vtable evidence or register-level object identity from layout B to one of these targets could promote a row beyond diagnostic-only.",
    },
    items,
  };
}

function exportCurrentNativeObjectAcOwnerTraceAudit({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeObjectAcOwnerTraceAudit({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "id",
    "addressHex",
    "accessKind",
    "objectFieldOffsetHex",
    "byteWidth",
    "valueRegister",
    "nearestDirectBranchTargetHex",
    "nearestDirectBranchTargetDistance",
    "directCallerCount",
    "layoutBDirectCallerCount",
    "nearLayoutBRegistrationCallerCount",
    "directCallerAddressHexes",
    "ownerTraceClass",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeObjectAcOwnerTraceAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeObjectAcOwnerTraceAudit,
  exportCurrentNativeObjectAcOwnerTraceAudit,
};
