#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGapAuditPath = "extracted/reports/effect_projectile_runtime_gap_audit.json";
const defaultSkinrepContextPath = "extracted/reports/native_skinrep_consumer_context.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-create-bridge-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_create_bridge_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_create_bridge_audit.tsv";

const lifecycleFunctionNames = new Set([
  "FUN_00d59f54",
  "FUN_00d80ec4",
  "FUN_00d80edc",
  "FUN_00d80f68",
  "FUN_00d81070",
  "FUN_00e5e52c",
  "FUN_00e5e560",
  "FUN_00e5ebf8",
  "FUN_00e5ff9c",
  "FUN_00e5ffd8",
]);

const targetOwnerFunctionNames = new Set([
  "FUN_00d84dfc",
  "FUN_00d84e4c",
  "FUN_00d84eec",
  "FUN_100485fa8",
  "FUN_10048602c",
  "FUN_10049fdbc",
]);

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

function quotedStrings(text) {
  return [...String(text || "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function contextStringSet(row) {
  return new Set(
    uniqueInOrder([
      ...pipeValues(row?.stringLiterals),
      ...quotedStrings(row?.context),
    ]),
  );
}

function sameNativeFunction(row, contextRow) {
  return (
    row?.sourceFunctionName &&
    contextRow?.functionName &&
    row.sourceFunctionName === contextRow.functionName &&
    row?.sourceFile &&
    contextRow?.sourceFile &&
    row.sourceFile === contextRow.sourceFile
  );
}

function projectileTokens(row) {
  return uniqueInOrder([row?.effectToken || "", ...pipeValues(row?.pairedImpactEffectTokens)]);
}

function blockedProjectileRows(items) {
  return (items || []).filter(
    (row) => row?.status !== "projectile-definition-placed" && row?.readyForProjectileRuntime !== true,
  );
}

function functionCalls(text) {
  return uniqueInOrder([...String(text || "").matchAll(/\bFUN_[0-9a-fA-F]+\b/g)].map((match) => match[0]));
}

function lifecycleCallsForContext(context) {
  return functionCalls(context).filter((name) => lifecycleFunctionNames.has(name));
}

function targetOwnerCallsForContext(context) {
  return functionCalls(context).filter((name) => targetOwnerFunctionNames.has(name));
}

function runtimeVtablePointers(context) {
  return uniqueInOrder([...String(context || "").matchAll(/\bPTR_FUN_[0-9a-fA-F]+\b/g)].map((match) => match[0]));
}

function hasParam2Evidence(context) {
  const text = String(context || "");
  return /\*param_2\s*=/.test(text) || /param_2\[\d+\]\s*=/.test(text) || /param_2\s*\+\s*0x[0-9a-f]+/i.test(text);
}

function hasRuntimeFieldEvidence(context) {
  return /param_1\s*\+\s*0x120/i.test(String(context || ""));
}

function hasRuntimePointerStoreEvidence(context) {
  const text = String(context || "");
  return /param_1\s*\+\s*0x118/i.test(text) && /param_1\s*\+\s*0x120/i.test(text);
}

function hasTargetVtableDispatchEvidence(context) {
  const text = String(context || "");
  return /\*\*\(code \*\*\).*0x38/.test(text) || /\*\*\(code \*\*\).*0x58/.test(text) || /vtable\.method@0x(38|58)/i.test(text);
}

function matchContextsForRow(row, skinrepContextItems) {
  const tokens = projectileTokens(row);
  return (skinrepContextItems || [])
    .map((contextRow) => {
      const strings = contextStringSet(contextRow);
      const matchedEffectTokens = tokens.filter((token) => strings.has(token));
      const matchedByFunction = sameNativeFunction(row, contextRow);
      if (!matchedEffectTokens.length && !matchedByFunction) return null;
      const context = contextRow?.context || "";
      return {
        row: contextRow,
        matchedEffectTokens,
        evidenceKind: matchedEffectTokens.length ? "token-context" : "same-function-context",
        lifecycleFunctionCalls: lifecycleCallsForContext(context),
        targetOwnerFunctionCalls: targetOwnerCallsForContext(context),
        runtimeVtablePointers: runtimeVtablePointers(context),
        hasParam2Evidence: hasParam2Evidence(context),
        hasRuntimeFieldAccess: hasRuntimeFieldEvidence(context),
        hasRuntimePointerStore: hasRuntimePointerStoreEvidence(context),
        hasTargetVtableDispatch: hasTargetVtableDispatchEvidence(context),
      };
    })
    .filter(Boolean);
}

function statusForEvidence(matches) {
  if (!matches.length) return "create-bridge-context-missing";
  if (matches.some((match) => match.hasRuntimeFieldAccess)) return "create-bridge-runtime-field";
  if (matches.some((match) => match.hasParam2Evidence && match.lifecycleFunctionCalls.length)) {
    return "create-bridge-param2-lifecycle";
  }
  return "create-bridge-context-found";
}

function blockerForStatus(status) {
  if (status === "create-bridge-context-missing") {
    return "no exact native SkinRep create/runtime context matched this projectile effect token";
  }
  return "native create bridge evidence is diagnostic-only until projectile placement/timing is fully recovered";
}

function auditRow(row, skinrepContextItems) {
  const matches = matchContextsForRow(row, skinrepContextItems);
  const status = statusForEvidence(matches);
  return {
    status,
    renderPromotionAllowed: false,
    heroNames: pipeValues(row.heroNames),
    actionKeys: pipeValues(row.actionKeys),
    effectToken: row.effectToken || "",
    pairedImpactEffectTokens: pipeValues(row.pairedImpactEffectTokens),
    sourceGapStatus: row.status || "",
    sourceBindingStatus: row.bindingStatus || "",
    matchedResourcePaths: pipeValues(row.matchedResourcePaths),
    pfxCandidateResourcePaths: pipeValues(row.pfxCandidateResourcePaths),
    matchedContextFunctions: uniqueInOrder(matches.map((match) => match.row?.functionName).filter(Boolean)),
    matchedContextLines: uniqueInOrder(matches.map((match) => match.row?.line).filter((line) => line !== "" && line != null)),
    matchedContextPlatforms: uniqueInOrder(matches.map((match) => match.row?.platform).filter(Boolean)),
    matchedEffectTokens: uniqueInOrder(matches.flatMap((match) => match.matchedEffectTokens)),
    matchedEvidenceKinds: uniqueInOrder(matches.map((match) => match.evidenceKind).filter(Boolean)),
    lifecycleFunctionCalls: uniqueInOrder(matches.flatMap((match) => match.lifecycleFunctionCalls)),
    targetOwnerFunctionCalls: uniqueInOrder(matches.flatMap((match) => match.targetOwnerFunctionCalls)),
    runtimeVtablePointers: uniqueInOrder(matches.flatMap((match) => match.runtimeVtablePointers)),
    hasParam2Lifecycle: matches.some((match) => match.hasParam2Evidence && match.lifecycleFunctionCalls.length),
    hasRuntimeFieldAccess: matches.some((match) => match.hasRuntimeFieldAccess),
    hasRuntimePointerStore: matches.some((match) => match.hasRuntimePointerStore),
    hasTargetVtableDispatch: matches.some((match) => match.hasTargetVtableDispatch),
    blocker: blockerForStatus(status),
  };
}

function summarize(items) {
  const byStatus = {};
  const effects = new Set();
  const heroes = new Set();
  for (const item of items || []) {
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    if (item.effectToken) effects.add(item.effectToken);
    for (const hero of item.heroNames || []) heroes.add(hero);
  }
  return {
    rows: items.length,
    effectOnlyRows: items.filter((item) => item.sourceGapStatus === "projectile-definition-effect-only").length,
    noTokenRows: items.filter((item) => item.sourceGapStatus === "projectile-definition-no-token-resource").length,
    contextMatchedRows: items.filter((item) => item.status !== "create-bridge-context-missing").length,
    missingContextRows: byStatus["create-bridge-context-missing"] || 0,
    param2LifecycleRows: items.filter((item) => item.hasParam2Lifecycle).length,
    runtimeFieldRows: items.filter((item) => item.hasRuntimeFieldAccess).length,
    runtimePointerStoreRows: items.filter((item) => item.hasRuntimePointerStore).length,
    runtimeVtablePointerRows: items.filter((item) => item.runtimeVtablePointers.length).length,
    targetOwnerQueryRows: items.filter((item) => item.targetOwnerFunctionCalls.length).length,
    targetVtableDispatchRows: items.filter((item) => item.hasTargetVtableDispatch).length,
    lifecycleFunctionRows: items.filter((item) => item.lifecycleFunctionCalls.length).length,
    renderPromotionAllowedRows: 0,
    heroes: heroes.size,
    effectTokens: effects.size,
    byStatus,
  };
}

function buildProjectileCreateBridgeAudit({
  gapAudit = {},
  skinrepContextItems = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = blockedProjectileRows(gapAudit.items)
    .map((row) => auditRow(row, skinrepContextItems))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.sourceGapStatus.localeCompare(right.sourceGapStatus),
    );
  return {
    generatedAt,
    source: {
      gapAuditPath: defaultGapAuditPath,
      skinrepContextPath: defaultSkinrepContextPath,
    },
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    renderPromotionAllowed: item.renderPromotionAllowed,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    pairedImpactEffectTokens: item.pairedImpactEffectTokens,
    sourceGapStatus: item.sourceGapStatus,
    sourceBindingStatus: item.sourceBindingStatus,
    matchedResourcePaths: item.matchedResourcePaths,
    pfxCandidateResourcePaths: item.pfxCandidateResourcePaths,
    matchedContextFunctions: item.matchedContextFunctions,
    matchedContextLines: item.matchedContextLines,
    matchedContextPlatforms: item.matchedContextPlatforms,
    matchedEffectTokens: item.matchedEffectTokens,
    matchedEvidenceKinds: item.matchedEvidenceKinds,
    lifecycleFunctionCalls: item.lifecycleFunctionCalls,
    targetOwnerFunctionCalls: item.targetOwnerFunctionCalls,
    runtimeVtablePointers: item.runtimeVtablePointers,
    hasParam2Lifecycle: item.hasParam2Lifecycle,
    hasRuntimeFieldAccess: item.hasRuntimeFieldAccess,
    hasRuntimePointerStore: item.hasRuntimePointerStore,
    hasTargetVtableDispatch: item.hasTargetVtableDispatch,
    blocker: item.blocker,
  }));
}

function exportProjectileCreateBridgeAudit({
  gapAuditPath = defaultGapAuditPath,
  skinrepContextPath = defaultSkinrepContextPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileCreateBridgeAudit({
    gapAudit: readJson(gapAuditPath, { items: [] }),
    skinrepContextItems: readJson(skinrepContextPath, { items: [] }).items || [],
    generatedAt,
  });
  audit.source = { gapAuditPath, skinrepContextPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "renderPromotionAllowed",
    "heroNames",
    "actionKeys",
    "effectToken",
    "pairedImpactEffectTokens",
    "sourceGapStatus",
    "sourceBindingStatus",
    "matchedResourcePaths",
    "pfxCandidateResourcePaths",
    "matchedContextFunctions",
    "matchedContextLines",
    "matchedContextPlatforms",
    "matchedEffectTokens",
    "matchedEvidenceKinds",
    "lifecycleFunctionCalls",
    "targetOwnerFunctionCalls",
    "runtimeVtablePointers",
    "hasParam2Lifecycle",
    "hasRuntimeFieldAccess",
    "hasRuntimePointerStore",
    "hasTargetVtableDispatch",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCreateBridgeAudit({
    gapAuditPath: optionValue(args, "--gap-audit", defaultGapAuditPath),
    skinrepContextPath: optionValue(args, "--skinrep-context", defaultSkinrepContextPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCreateBridgeAudit,
  exportProjectileCreateBridgeAudit,
  readTsv,
  reportRowsForAudit,
  summarize,
};
