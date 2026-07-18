#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultSlotAuditPath = "extracted/reports/effect_projectile_vtable_slot_audit.json";
const defaultOutputLayoutAuditPath = "extracted/reports/effect_projectile_vtable_output_layout_audit.json";
const defaultCallsitePayloadAuditPath = "extracted/reports/effect_projectile_vtable_callsite_payload_audit.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-vtable-semantic-join-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_vtable_semantic_join_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_vtable_semantic_join_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback = {}) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function parseHex(value) {
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  return Number.POSITIVE_INFINITY;
}

function joinKeyForSlot(row) {
  return [
    row.effectToken || "",
    row.requestedOffset || "",
    row.resolvedSlotOffsetHex || "",
    row.resolvedFunctionAddressHex || "",
    row.slotStatus || "",
  ].join("\t");
}

function payloadKey(row) {
  return `${row.effectToken || ""}\t${row.offset || ""}`;
}

function outputShape(row) {
  return [
    row.writeKind || "",
    row.fixedOffsetHex || "",
    row.postIncrementHex || "",
    row.widthBytes || "",
    row.valueClass || "",
    row.valueImmediateHex || "",
    row.valueFloat || "",
  ].join(":");
}

function limited(values, limit = 24) {
  return uniqueInOrder(values).slice(0, limit);
}

function indexBy(items, keyForItem) {
  const result = new Map();
  for (const item of items || []) {
    const key = keyForItem(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
  }
  return result;
}

function buildJoinedRow(slotRows, outputByFunction, payloadByEffectOffset) {
  const first = slotRows[0] || {};
  const outputRows = outputByFunction.get(first.resolvedFunctionAddressHex || "") || [];
  const payloadRows = payloadByEffectOffset.get(payloadKey({ effectToken: first.effectToken, offset: first.requestedOffset })) || [];

  return {
    heroNames: limited(slotRows.flatMap((row) => row.heroNames || [])),
    actionKeys: limited(slotRows.flatMap((row) => row.actionKeys || [])),
    effectToken: first.effectToken || "",
    requestedOffset: first.requestedOffset || "",
    resolvedSlotOffsetHex: first.resolvedSlotOffsetHex || "",
    resolvedFunctionAddressHex: first.resolvedFunctionAddressHex || "",
    slotStatus: first.slotStatus || "",
    vtablePointers: limited(slotRows.map((row) => row.vtablePointer)),
    slotObservationRows: slotRows.length,
    outputWriteRows: outputRows.length,
    outputWriteKinds: limited(outputRows.map((row) => row.writeKind)),
    outputValueClasses: limited(outputRows.map((row) => row.valueClass)),
    outputShapes: limited(outputRows.map(outputShape)),
    payloadCallsiteRows: payloadRows.length,
    payloadKinds: limited(payloadRows.map((row) => row.payloadKind)),
    payloadValues: limited(payloadRows.map((row) => row.payloadValue)),
    callbackFunctions: limited(payloadRows.map((row) => row.callbackFunction)),
    payloadContextFunctions: limited(payloadRows.map((row) => row.contextFunction)),
    renderPromotionAllowed: false,
    blocker:
      "semantic join is diagnostic-only until downstream consumer code maps output writes and payload fields to projectile placement/timing/effect semantics",
  };
}

function summarize(items, sourceSlotRows, outputItems, payloadItems) {
  return {
    rows: items.length,
    sourceSlotRows,
    sourceOutputRows: outputItems.length,
    sourcePayloadRows: payloadItems.length,
    joinedOutputRows: items.reduce((sum, item) => sum + item.outputWriteRows, 0),
    joinedPayloadRows: items.reduce((sum, item) => sum + item.payloadCallsiteRows, 0),
    uniqueFunctions: new Set(items.map((item) => item.resolvedFunctionAddressHex).filter(Boolean)).size,
    exactSlotRows: items.filter((item) => item.slotStatus === "exact-relocated-function-slot").length,
    descriptorCompanionRows: items.filter((item) => item.slotStatus === "descriptor-companion-slot").length,
    rowsWithOutputWrites: items.filter((item) => item.outputWriteRows > 0).length,
    rowsWithPayloads: items.filter((item) => item.payloadCallsiteRows > 0).length,
    renderPromotionAllowedRows: 0,
  };
}

function buildProjectileVtableSemanticJoinAudit({
  slotAudit = {},
  outputLayoutAudit = {},
  callsitePayloadAudit = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const slotItems = (slotAudit.items || []).filter((row) => row.resolvedFunctionAddressHex);
  const outputItems = outputLayoutAudit.items || [];
  const payloadItems = callsitePayloadAudit.items || [];
  const outputByFunction = indexBy(outputItems, (row) => row.functionAddressHex || "");
  const payloadByEffectOffset = indexBy(payloadItems, payloadKey);
  const groupedSlots = indexBy(slotItems, joinKeyForSlot);
  const items = [...groupedSlots.values()]
    .map((rows) => buildJoinedRow(rows, outputByFunction, payloadByEffectOffset))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        parseHex(left.requestedOffset) - parseHex(right.requestedOffset) ||
        left.resolvedFunctionAddressHex.localeCompare(right.resolvedFunctionAddressHex),
    );

  return {
    generatedAt,
    source: {
      slotAuditPath: defaultSlotAuditPath,
      outputLayoutAuditPath: defaultOutputLayoutAuditPath,
      callsitePayloadAuditPath: defaultCallsitePayloadAuditPath,
    },
    policy:
      "diagnostic-only semantic join; links requested offsets, relocated functions, output writes, and callsite payload shapes without assigning projectile runtime semantics",
    summary: summarize(items, slotItems.length, outputItems, payloadItems),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    requestedOffset: item.requestedOffset,
    resolvedSlotOffsetHex: item.resolvedSlotOffsetHex,
    resolvedFunctionAddressHex: item.resolvedFunctionAddressHex,
    slotStatus: item.slotStatus,
    vtablePointers: item.vtablePointers,
    slotObservationRows: item.slotObservationRows,
    outputWriteRows: item.outputWriteRows,
    outputWriteKinds: item.outputWriteKinds,
    outputValueClasses: item.outputValueClasses,
    outputShapes: item.outputShapes,
    payloadCallsiteRows: item.payloadCallsiteRows,
    payloadKinds: item.payloadKinds,
    payloadValues: item.payloadValues,
    callbackFunctions: item.callbackFunctions,
    payloadContextFunctions: item.payloadContextFunctions,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileVtableSemanticJoinAudit({
  slotAuditPath = defaultSlotAuditPath,
  outputLayoutAuditPath = defaultOutputLayoutAuditPath,
  callsitePayloadAuditPath = defaultCallsitePayloadAuditPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileVtableSemanticJoinAudit({
    slotAudit: readJson(slotAuditPath, { items: [] }),
    outputLayoutAudit: readJson(outputLayoutAuditPath, { items: [] }),
    callsitePayloadAudit: readJson(callsitePayloadAuditPath, { items: [] }),
    generatedAt,
  });
  audit.source = { slotAuditPath, outputLayoutAuditPath, callsitePayloadAuditPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "heroNames",
    "actionKeys",
    "effectToken",
    "requestedOffset",
    "resolvedSlotOffsetHex",
    "resolvedFunctionAddressHex",
    "slotStatus",
    "vtablePointers",
    "slotObservationRows",
    "outputWriteRows",
    "outputWriteKinds",
    "outputValueClasses",
    "outputShapes",
    "payloadCallsiteRows",
    "payloadKinds",
    "payloadValues",
    "callbackFunctions",
    "payloadContextFunctions",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileVtableSemanticJoinAudit({
    slotAuditPath: optionValue(args, "--slot-audit", defaultSlotAuditPath),
    outputLayoutAuditPath: optionValue(args, "--output-layout-audit", defaultOutputLayoutAuditPath),
    callsitePayloadAuditPath: optionValue(args, "--callsite-payload-audit", defaultCallsitePayloadAuditPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileVtableSemanticJoinAudit,
  exportProjectileVtableSemanticJoinAudit,
  readTsv,
};
