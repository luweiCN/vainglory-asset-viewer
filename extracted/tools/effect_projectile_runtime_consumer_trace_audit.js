#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildStringTargets, parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultTargetDispatchAuditPath = "extracted/reports/effect_projectile_target_dispatch_audit.json";
const defaultSemanticJoinAuditPath = "extracted/reports/effect_projectile_vtable_semantic_join_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-runtime-consumer-trace-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_runtime_consumer_trace_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_runtime_consumer_trace_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
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

function pipeValues(value) {
  if (Array.isArray(value)) return uniqueInOrder(value);
  return uniqueInOrder(String(value || "").split("|").filter(Boolean));
}

function projectileTokens(row) {
  return uniqueInOrder([row?.effectToken || "", ...pipeValues(row?.pairedImpactEffectTokens)]);
}

function limited(values, limit = 24) {
  return uniqueInOrder(values).slice(0, limit);
}

function indexBy(items, keyForItem) {
  const result = new Map();
  for (const item of items || []) {
    const key = keyForItem(item);
    if (!key) continue;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(item);
  }
  return result;
}

function normalizeCurrentStringReference(reference) {
  return {
    targetName: reference.targetName || reference.name || "",
    targetAddressHex: reference.targetAddressHex || hex(reference.targetAddress),
    xrefAddressHex: reference.xrefAddressHex || hex(reference.xrefAddress),
    mode: reference.mode || "",
    targetKind: reference.targetKind || "",
  };
}

function buildCurrentStringReferencesFromBinary(tokens, binaryPath = defaultBinaryPath) {
  const anchors = uniqueInOrder(tokens);
  if (!anchors.length || !binaryPath || !fs.existsSync(binaryPath)) return [];
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const stringTargets = buildStringTargets(buffer, elf, anchors);
  return scanTextReferences(buffer, elf, stringTargets)
    .filter((reference) => reference.targetKind === "string")
    .map(normalizeCurrentStringReference);
}

function semanticRowsForTokens(tokens, semanticByEffectToken) {
  return uniqueInOrder(tokens).flatMap((token) => semanticByEffectToken.get(token) || []);
}

function currentReferencesForTokens(tokens, currentReferenceByToken) {
  return uniqueInOrder(tokens).flatMap((token) => currentReferenceByToken.get(token) || []);
}

function statusForRow({ currentRefs, semanticRows, crossBuildContextFunctions, crossBuildHelperCalls }) {
  const hasCurrentToken = currentRefs.length > 0;
  const hasCurrentVtable = semanticRows.length > 0;
  const hasCrossBuildHints = crossBuildContextFunctions.length > 0 || crossBuildHelperCalls.length > 0;
  if (hasCurrentToken && hasCurrentVtable && hasCrossBuildHints) {
    return "current-vtable-and-token-crossbuild-consumer-unresolved";
  }
  if (hasCurrentToken && hasCurrentVtable) return "current-vtable-and-token-consumer-unresolved";
  if (hasCurrentVtable) return "current-vtable-consumer-unresolved";
  if (hasCurrentToken) return "current-token-consumer-unresolved";
  if (hasCrossBuildHints) return "crossbuild-consumer-hint-current-anchor-missing";
  return "consumer-evidence-missing";
}

function blockerForStatus(status) {
  if (status === "consumer-evidence-missing") {
    return "no current native token/vtable consumer evidence was recovered for this projectile row";
  }
  if (status === "crossbuild-consumer-hint-current-anchor-missing") {
    return "cross-build decompile has consumer hints, but current native token/vtable anchors are still missing";
  }
  return "current native consumer execution and field semantics are not recovered enough to promote projectile rendering";
}

function rowForTargetDispatch(item, { semanticByEffectToken, currentReferenceByToken }) {
  const tokens = projectileTokens(item);
  const currentRefs = currentReferencesForTokens(tokens, currentReferenceByToken);
  const semanticRows = semanticRowsForTokens(tokens, semanticByEffectToken);
  const crossBuildContextFunctions = pipeValues(item.matchedContextFunctions);
  const crossBuildHelperCalls = pipeValues(item.dispatchHelperCalls);
  const hasCurrentToken = currentRefs.length > 0;
  const hasCurrentVtable = semanticRows.length > 0;
  const status = statusForRow({
    currentRefs,
    semanticRows,
    crossBuildContextFunctions,
    crossBuildHelperCalls,
  });
  const currentEvidence = [];
  if (hasCurrentToken) currentEvidence.push("current-token-xref");
  if (hasCurrentVtable) currentEvidence.push("current-vtable-slot-output-payload");
  const crossBuildHints = [];
  if (crossBuildContextFunctions.length) crossBuildHints.push("cross-build-target-dispatch-context");
  if (!crossBuildHints.length && crossBuildHelperCalls.length) crossBuildHints.push("cross-build-helper-call-pattern");

  return {
    status,
    heroNames: pipeValues(item.heroNames),
    actionKeys: pipeValues(item.actionKeys),
    effectToken: item.effectToken || "",
    pairedImpactEffectTokens: pipeValues(item.pairedImpactEffectTokens),
    currentReferencedTokens: limited(currentRefs.map((reference) => reference.targetName)),
    currentStringXrefRows: currentRefs.length,
    currentXrefAddresses: limited(currentRefs.map((reference) => reference.xrefAddressHex)),
    currentXrefModes: limited(currentRefs.map((reference) => reference.mode)),
    semanticJoinRows: semanticRows.length,
    semanticRequestedOffsets: limited(semanticRows.map((row) => row.requestedOffset)),
    semanticFunctionAddresses: limited(semanticRows.map((row) => row.resolvedFunctionAddressHex)),
    semanticSlotStatuses: limited(semanticRows.map((row) => row.slotStatus)),
    outputWriteReferenceRows: semanticRows.reduce((sum, row) => sum + Number(row.outputWriteRows || 0), 0),
    payloadReferenceRows: semanticRows.reduce((sum, row) => sum + Number(row.payloadCallsiteRows || 0), 0),
    crossBuildContextFunctions,
    crossBuildHelperCalls,
    crossBuildHelperRoles: pipeValues(item.dispatchHelperRoles),
    crossBuildTargetVtableOffsets: pipeValues(item.targetVtableOffsets),
    currentBinaryEvidence: currentEvidence.join("|"),
    crossBuildConsumerHint: crossBuildHints.join("|"),
    currentConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker: blockerForStatus(status),
  };
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    currentStringXrefRows: items.reduce((sum, item) => sum + item.currentStringXrefRows, 0),
    rowsWithCurrentStringXrefs: items.filter((item) => item.currentStringXrefRows > 0).length,
    rowsWithCurrentVtableSemantics: items.filter((item) => item.semanticJoinRows > 0).length,
    rowsWithCrossBuildConsumerHints: items.filter((item) => item.crossBuildConsumerHint).length,
    semanticJoinRows: items.reduce((sum, item) => sum + item.semanticJoinRows, 0),
    outputWriteReferenceRows: items.reduce((sum, item) => sum + item.outputWriteReferenceRows, 0),
    payloadReferenceRows: items.reduce((sum, item) => sum + item.payloadReferenceRows, 0),
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileRuntimeConsumerTraceAudit({
  targetDispatchAudit = {},
  semanticJoinAudit = {},
  currentStringReferences = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const semanticByEffectToken = indexBy(semanticJoinAudit.items || [], (row) => row.effectToken || "");
  const currentReferenceByToken = indexBy(
    (currentStringReferences || []).map(normalizeCurrentStringReference),
    (reference) => reference.targetName || "",
  );
  const sourceRows = (targetDispatchAudit.items || []).filter((row) => row.effectToken);
  const items = sourceRows
    .map((item) => rowForTargetDispatch(item, { semanticByEffectToken, currentReferenceByToken }))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.status.localeCompare(right.status),
    );

  return {
    generatedAt,
    source: {
      targetDispatchAuditPath: defaultTargetDispatchAuditPath,
      semanticJoinAuditPath: defaultSemanticJoinAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only projectile runtime consumer trace; current Android token/vtable anchors are kept separate from cross-build decompile consumer hints and never promote rendering",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    pairedImpactEffectTokens: item.pairedImpactEffectTokens,
    currentReferencedTokens: item.currentReferencedTokens,
    currentStringXrefRows: item.currentStringXrefRows,
    currentXrefAddresses: item.currentXrefAddresses,
    currentXrefModes: item.currentXrefModes,
    semanticJoinRows: item.semanticJoinRows,
    semanticRequestedOffsets: item.semanticRequestedOffsets,
    semanticFunctionAddresses: item.semanticFunctionAddresses,
    semanticSlotStatuses: item.semanticSlotStatuses,
    outputWriteReferenceRows: item.outputWriteReferenceRows,
    payloadReferenceRows: item.payloadReferenceRows,
    crossBuildContextFunctions: item.crossBuildContextFunctions,
    crossBuildHelperCalls: item.crossBuildHelperCalls,
    crossBuildHelperRoles: item.crossBuildHelperRoles,
    crossBuildTargetVtableOffsets: item.crossBuildTargetVtableOffsets,
    currentBinaryEvidence: item.currentBinaryEvidence,
    crossBuildConsumerHint: item.crossBuildConsumerHint,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileRuntimeConsumerTraceAudit({
  targetDispatchAuditPath = defaultTargetDispatchAuditPath,
  semanticJoinAuditPath = defaultSemanticJoinAuditPath,
  binaryPath = defaultBinaryPath,
  currentStringReferences = null,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const targetDispatchAudit = readJson(targetDispatchAuditPath, { items: [] });
  const semanticJoinAudit = readJson(semanticJoinAuditPath, { items: [] });
  const tokens = uniqueInOrder((targetDispatchAudit.items || []).flatMap(projectileTokens));
  const resolvedCurrentStringReferences =
    currentStringReferences || buildCurrentStringReferencesFromBinary(tokens, binaryPath);
  const audit = buildProjectileRuntimeConsumerTraceAudit({
    targetDispatchAudit,
    semanticJoinAudit,
    currentStringReferences: resolvedCurrentStringReferences,
    generatedAt,
  });
  audit.source = { targetDispatchAuditPath, semanticJoinAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "heroNames",
    "actionKeys",
    "effectToken",
    "pairedImpactEffectTokens",
    "currentReferencedTokens",
    "currentStringXrefRows",
    "currentXrefAddresses",
    "currentXrefModes",
    "semanticJoinRows",
    "semanticRequestedOffsets",
    "semanticFunctionAddresses",
    "semanticSlotStatuses",
    "outputWriteReferenceRows",
    "payloadReferenceRows",
    "crossBuildContextFunctions",
    "crossBuildHelperCalls",
    "crossBuildHelperRoles",
    "crossBuildTargetVtableOffsets",
    "currentBinaryEvidence",
    "crossBuildConsumerHint",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileRuntimeConsumerTraceAudit({
    targetDispatchAuditPath: optionValue(args, "--target-dispatch-audit", defaultTargetDispatchAuditPath),
    semanticJoinAuditPath: optionValue(args, "--semantic-join-audit", defaultSemanticJoinAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentStringReferencesFromBinary,
  buildProjectileRuntimeConsumerTraceAudit,
  exportProjectileRuntimeConsumerTraceAudit,
  readTsv,
};
