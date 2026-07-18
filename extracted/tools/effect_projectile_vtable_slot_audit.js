#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const defaultTargetDispatchAuditPath = "extracted/reports/effect_projectile_target_dispatch_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-vtable-slot-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_vtable_slot_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_vtable_slot_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function tsvEscape(value) {
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows || []) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readTsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function pointerAddressFromName(name) {
  const match = /^PTR_FUN_([0-9a-fA-F]+)$/.exec(String(name || ""));
  return match ? Number.parseInt(match[1], 16) : null;
}

function isAndroidVtablePointer(name) {
  const address = pointerAddressFromName(name);
  return Number.isFinite(address) && address < 0x100000000;
}

function parseRelativeRelocations(text) {
  const relocations = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{16})\s+R_AARCH64_RELATIVE\s+\*ABS\*\+0x([0-9a-fA-F]+)/.exec(line.trim());
    if (!match) continue;
    relocations.set(Number.parseInt(match[1], 16), Number.parseInt(match[2], 16));
  }
  return relocations;
}

function objdumpRelocations(binaryPath) {
  const result = spawnSync("objdump", ["-R", binaryPath], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `objdump -R failed for ${binaryPath}`);
  }
  return result.stdout;
}

function classifySlot(vtableBaseAddress, requestedOffset, relocations) {
  const requestedSlotAddress = vtableBaseAddress + requestedOffset;
  const exactTarget = relocations.get(requestedSlotAddress);
  if (exactTarget != null) {
    return {
      slotStatus: "exact-relocated-function-slot",
      requestedSlotAddress,
      relocationSlotAddress: requestedSlotAddress,
      resolvedSlotOffset: requestedOffset,
      companionDelta: 0,
      resolvedFunctionAddress: exactTarget,
    };
  }

  const lowerSlotOffset = Math.floor(requestedOffset / 0x10) * 0x10;
  const lowerSlotAddress = vtableBaseAddress + lowerSlotOffset;
  const lowerTarget = relocations.get(lowerSlotAddress);
  if (lowerTarget != null) {
    return {
      slotStatus: "descriptor-companion-slot",
      requestedSlotAddress,
      relocationSlotAddress: lowerSlotAddress,
      resolvedSlotOffset: lowerSlotOffset,
      companionDelta: requestedOffset - lowerSlotOffset,
      resolvedFunctionAddress: lowerTarget,
    };
  }

  const upperSlotOffset = Math.ceil(requestedOffset / 0x10) * 0x10;
  const upperSlotAddress = vtableBaseAddress + upperSlotOffset;
  const upperTarget = relocations.get(upperSlotAddress);
  if (upperTarget != null) {
    return {
      slotStatus: "descriptor-nearby-upper-slot",
      requestedSlotAddress,
      relocationSlotAddress: upperSlotAddress,
      resolvedSlotOffset: upperSlotOffset,
      companionDelta: requestedOffset - upperSlotOffset,
      resolvedFunctionAddress: upperTarget,
    };
  }

  return {
    slotStatus: "vtable-slot-relocation-missing",
    requestedSlotAddress,
    relocationSlotAddress: null,
    resolvedSlotOffset: null,
    companionDelta: null,
    resolvedFunctionAddress: null,
  };
}

function blockerForSlotStatus(status) {
  if (status === "exact-relocated-function-slot") {
    return "exact relocated function slot recovered, but function semantics are still diagnostic-only";
  }
  if (status === "descriptor-companion-slot") {
    return "requested vtable offset lands on a descriptor companion half; recover the original slot layout before treating it as a callable placement function";
  }
  if (status === "descriptor-nearby-upper-slot") {
    return "requested vtable offset is near a relocated slot but does not land on it; recover slot layout before semantic promotion";
  }
  return "no Android relative relocation found for this requested vtable slot";
}

function auditRowsForItem(item, relocations) {
  const vtablePointers = uniqueInOrder((item.dispatchFactoryVtablePointers || []).filter(isAndroidVtablePointer));
  const offsets = uniqueInOrder(item.targetVtableOffsets || []);
  const rows = [];
  for (const vtablePointer of vtablePointers) {
    const vtableBaseAddress = pointerAddressFromName(vtablePointer);
    for (const requestedOffsetText of offsets) {
      const requestedOffset = Number.parseInt(requestedOffsetText, 16);
      if (!Number.isFinite(requestedOffset)) continue;
      const slot = classifySlot(vtableBaseAddress, requestedOffset, relocations);
      rows.push({
        sourceTargetDispatchStatus: item.status || "",
        heroNames: item.heroNames || [],
        actionKeys: item.actionKeys || [],
        effectToken: item.effectToken || "",
        vtablePointer,
        vtableBaseAddressHex: hex(vtableBaseAddress),
        requestedOffset: requestedOffsetText.toLowerCase(),
        requestedSlotAddressHex: hex(slot.requestedSlotAddress),
        slotStatus: slot.slotStatus,
        relocationSlotAddressHex: hex(slot.relocationSlotAddress),
        resolvedSlotOffsetHex: hex(slot.resolvedSlotOffset),
        companionDeltaHex: hex(slot.companionDelta),
        resolvedFunctionAddressHex: hex(slot.resolvedFunctionAddress),
        renderPromotionAllowed: false,
        blocker: blockerForSlotStatus(slot.slotStatus),
      });
    }
  }
  return rows;
}

function summarize(items, sourceTargetDispatchRows, androidVtablePointerRows) {
  const byRequestedOffset = {};
  for (const item of items || []) {
    byRequestedOffset[item.requestedOffset] ||= {
      rows: 0,
      exactSlotRows: 0,
      descriptorCompanionRows: 0,
      missingRelocationRows: 0,
    };
    const bucket = byRequestedOffset[item.requestedOffset];
    bucket.rows += 1;
    if (item.slotStatus === "exact-relocated-function-slot") bucket.exactSlotRows += 1;
    if (item.slotStatus === "descriptor-companion-slot") bucket.descriptorCompanionRows += 1;
    if (item.slotStatus === "vtable-slot-relocation-missing") bucket.missingRelocationRows += 1;
  }
  return {
    rows: items.length,
    sourceTargetDispatchRows,
    androidVtablePointerRows,
    exactSlotRows: items.filter((item) => item.slotStatus === "exact-relocated-function-slot").length,
    descriptorCompanionRows: items.filter((item) => item.slotStatus === "descriptor-companion-slot").length,
    nearbyUpperSlotRows: items.filter((item) => item.slotStatus === "descriptor-nearby-upper-slot").length,
    missingRelocationRows: items.filter((item) => item.slotStatus === "vtable-slot-relocation-missing").length,
    renderPromotionAllowedRows: 0,
    byRequestedOffset: Object.fromEntries(
      Object.entries(byRequestedOffset).sort(
        ([left], [right]) => Number.parseInt(left, 16) - Number.parseInt(right, 16),
      ),
    ),
  };
}

function buildProjectileVtableSlotAudit({
  targetDispatchAudit = {},
  relocationText = "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const relocations = parseRelativeRelocations(relocationText);
  const sourceItems = (targetDispatchAudit.items || []).filter((item) => item.status === "target-dispatch-vtable-offsets");
  const items = sourceItems
    .flatMap((item) => auditRowsForItem(item, relocations))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.vtablePointer.localeCompare(right.vtablePointer) ||
        Number.parseInt(left.requestedOffset, 16) - Number.parseInt(right.requestedOffset, 16),
    );
  const androidVtablePointers = new Set(items.map((item) => item.vtablePointer).filter(Boolean));
  return {
    generatedAt,
    source: {
      targetDispatchAuditPath: defaultTargetDispatchAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only vtable slot relocation audit; recovers Android relocated slot targets and descriptor companions but does not classify placement/timing semantics",
    summary: summarize(items, sourceItems.length, androidVtablePointers.size),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    sourceTargetDispatchStatus: item.sourceTargetDispatchStatus,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    vtablePointer: item.vtablePointer,
    vtableBaseAddressHex: item.vtableBaseAddressHex,
    requestedOffset: item.requestedOffset,
    requestedSlotAddressHex: item.requestedSlotAddressHex,
    slotStatus: item.slotStatus,
    relocationSlotAddressHex: item.relocationSlotAddressHex,
    resolvedSlotOffsetHex: item.resolvedSlotOffsetHex,
    companionDeltaHex: item.companionDeltaHex,
    resolvedFunctionAddressHex: item.resolvedFunctionAddressHex,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileVtableSlotAudit({
  targetDispatchAuditPath = defaultTargetDispatchAuditPath,
  binaryPath = defaultBinaryPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  relocationText = "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileVtableSlotAudit({
    targetDispatchAudit: readJson(targetDispatchAuditPath, { items: [] }),
    relocationText: relocationText || objdumpRelocations(binaryPath),
    generatedAt,
  });
  audit.source = { targetDispatchAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "sourceTargetDispatchStatus",
    "heroNames",
    "actionKeys",
    "effectToken",
    "vtablePointer",
    "vtableBaseAddressHex",
    "requestedOffset",
    "requestedSlotAddressHex",
    "slotStatus",
    "relocationSlotAddressHex",
    "resolvedSlotOffsetHex",
    "companionDeltaHex",
    "resolvedFunctionAddressHex",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileVtableSlotAudit({
    targetDispatchAuditPath: optionValue(args, "--target-dispatch-audit", defaultTargetDispatchAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileVtableSlotAudit,
  exportProjectileVtableSlotAudit,
  parseRelativeRelocations,
  readTsv,
};
