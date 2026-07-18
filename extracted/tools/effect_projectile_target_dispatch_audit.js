#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultCreateBridgeAuditPath = "extracted/reports/effect_projectile_create_bridge_audit.json";
const defaultSkinrepContextPath = "extracted/reports/native_skinrep_consumer_context.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-target-dispatch-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_target_dispatch_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_target_dispatch_audit.tsv";

const dispatchHelperMetadata = {
  FUN_00d84dfc: {
    platform: "android",
    role: "context-command",
    factoryCall: "FUN_00cdac68",
    allocatorCall: "FUN_00cdac80",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: [],
  },
  FUN_10049fdbc: {
    platform: "ios",
    role: "context-command",
    factoryCall: "FUN_10033e734",
    allocatorCall: "FUN_100476540",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: [],
  },
  FUN_10049fe0c: {
    platform: "ios",
    role: "callback-source-command",
    factoryCall: "FUN_10033e67c",
    allocatorCall: "FUN_100476328",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: [],
  },
  FUN_10049feac: {
    platform: "ios",
    role: "callback-finalize-command",
    factoryCall: "FUN_10033e7e8",
    allocatorCall: "FUN_10033e7e8",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: ["PTR_FUN_10149d2b0"],
  },
  FUN_00d84e4c: {
    platform: "android",
    role: "runtime-dispatch-command-a",
    factoryCall: "FUN_00cda01c",
    allocatorCall: "FUN_00cda028",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: ["PTR_FUN_0280e370", "PTR_FUN_0280e3c0"],
  },
  FUN_10048602c: {
    platform: "ios",
    role: "runtime-dispatch-command-a",
    factoryCall: "FUN_10033de80",
    allocatorCall: "FUN_10033de80",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: ["PTR_FUN_101494b80", "PTR_FUN_101494bd0"],
  },
  FUN_00d84eec: {
    platform: "android",
    role: "runtime-dispatch-command-b",
    factoryCall: "FUN_00cd9948",
    allocatorCall: "FUN_00cd9954",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: ["PTR_FUN_0280e150", "PTR_FUN_0280e1a0"],
  },
  FUN_100485fa8: {
    platform: "ios",
    role: "runtime-dispatch-command-b",
    factoryCall: "FUN_10033da9c",
    allocatorCall: "FUN_10033da9c",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: ["PTR_FUN_101494a18", "PTR_FUN_101494a68"],
  },
  FUN_00d84e9c: {
    platform: "android",
    role: "release-or-commit-command",
    factoryCall: "FUN_00cda0f0",
    allocatorCall: "FUN_00d82cd4",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: [],
  },
  FUN_100486124: {
    platform: "ios",
    role: "release-or-commit-command",
    factoryCall: "FUN_10033df24",
    allocatorCall: "FUN_100475610",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: [],
  },
  FUN_00d850b4: {
    platform: "android",
    role: "callback-source-command",
    factoryCall: "FUN_00cdab8c",
    allocatorCall: "FUN_00cdaba4",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: ["PTR_FUN_0281ed10"],
  },
  FUN_00d851a4: {
    platform: "android",
    role: "callback-finalize-command",
    factoryCall: "FUN_00cdad44",
    allocatorCall: "FUN_00cdad5c",
    poolKind: "runtime-command-pool-0x70",
    factoryVtablePointers: ["PTR_FUN_0281ee20"],
  },
  FUN_00d8611c: {
    platform: "android",
    role: "callback-parameter-command",
    factoryCall: "FUN_00cd9f38",
    allocatorCall: "FUN_00cd9f44",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: [],
  },
  FUN_00d8789c: {
    platform: "android",
    role: "callback-single-command",
    factoryCall: "FUN_00cd9bc4",
    allocatorCall: "FUN_00cd9bd0",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: [],
  },
  FUN_10049ff4c: {
    platform: "ios",
    role: "callback-parameter-command",
    factoryCall: "FUN_10033ddd4",
    allocatorCall: "FUN_1004756d4",
    poolKind: "runtime-dispatch-pool-0x88",
    factoryVtablePointers: [],
  },
};

const releaseOrCommitHelperNames = new Set(["FUN_00d84e9c", "FUN_100486124"]);
const callbackRegistrationFunctionNames = new Set([
  "FUN_00d82598",
  "FUN_00d829d8",
  "FUN_00d829e8",
  "FUN_00d829f8",
  "FUN_00d82a00",
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

function projectileTokens(row) {
  return uniqueInOrder([row?.effectToken || "", ...pipeValues(row?.pairedImpactEffectTokens)]);
}

function functionNameSet(row) {
  return new Set(pipeValues(row?.matchedContextFunctions));
}

function platformSet(row) {
  return new Set(pipeValues(row?.matchedContextPlatforms));
}

function contextMatchesCreateBridgeRow(row, contextRow) {
  const functions = functionNameSet(row);
  const platforms = platformSet(row);
  const functionMatches = functions.size > 0 && functions.has(contextRow?.functionName);
  const platformMatches = !platforms.size || !contextRow?.platform || platforms.has(contextRow.platform);
  if (functionMatches && platformMatches) return true;
  const strings = contextStringSet(contextRow);
  return projectileTokens(row).some((token) => strings.has(token));
}

function contextsForCreateBridgeRow(row, skinrepContextItems) {
  return (skinrepContextItems || []).filter((contextRow) => contextMatchesCreateBridgeRow(row, contextRow));
}

function functionCalls(text) {
  return uniqueInOrder([...String(text || "").matchAll(/\bFUN_[0-9a-fA-F]+\b/g)].map((match) => match[0]));
}

function dispatchHelperCallsForContext(context) {
  return functionCalls(context).filter((name) => dispatchHelperMetadata[name]);
}

function runtimeVtablePointers(context) {
  return uniqueInOrder([...String(context || "").matchAll(/\bPTR_FUN_[0-9a-fA-F]+\b/g)].map((match) => match[0]));
}

function targetVtableOffsets(context) {
  return uniqueInOrder(
    [...String(context || "").matchAll(/\*\*\(code \*\*\)\s*\([^)]*\+\s*(0x[0-9a-fA-F]+)\)/g)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
}

function callbackRegistrationCallsForContext(context) {
  return functionCalls(context).filter((name) => callbackRegistrationFunctionNames.has(name));
}

function callbackFunctionPointers(context) {
  const text = String(context || "");
  const pointers = [
    ...[...text.matchAll(/\bFUN_00d829e8\([^,\n]+,\s*(FUN_[0-9a-fA-F]+)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bFUN_00d82598\([^,\n]+,\s*(FUN_[0-9a-fA-F]+)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bFUN_00d829f8\([^,\n]+,\s*(FUN_[0-9a-fA-F]+)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\*\(code \*\*\)\([^)]*\+\s*0x[0-9a-fA-F]+\)\s*=\s*(FUN_[0-9a-fA-F]+)/g)].map(
      (match) => match[1],
    ),
  ];
  if (/\bFUN_00d82a00\b/.test(text)) pointers.push("FUN_00d82a18");
  return uniqueInOrder(pointers);
}

function callbackFieldOffsets(context) {
  const text = String(context || "");
  const offsets = [];
  if (/\bFUN_00d829e8\b/.test(text)) offsets.push("0x18", "0x28", "0x2c", "0x30");
  if (/\bFUN_00d82598\b/.test(text)) offsets.push("0x10");
  if (/\bFUN_00d829d8\b/.test(text)) offsets.push("0x10", "0x28", "0x2c", "0x30");
  if (/\bFUN_00d829f8\b/.test(text)) offsets.push("0x20");
  if (/\bFUN_00d82a00\b/.test(text)) offsets.push("0x28", "0x18", "0x30");
  for (const match of text.matchAll(/\*\(code \*\*\)\([^)]*\+\s*(0x[0-9a-fA-F]+)\)\s*=/g)) {
    offsets.push(match[1].toLowerCase());
  }
  return uniqueInOrder(offsets);
}

function statusForEvidence(contextMatches, helperCalls, helperRoles, offsets, callbackPointers, callbackRegistrations) {
  if (!contextMatches.length) return "target-dispatch-context-missing";
  if (offsets.length) return "target-dispatch-vtable-offsets";
  if (callbackPointers.length || callbackRegistrations.length) return "target-dispatch-callback-command";
  if (
    helperCalls.length &&
    helperRoles.includes("callback-finalize-command") &&
    helperRoles.every((role) => role === "callback-finalize-command" || role === "release-or-commit-command")
  ) {
    return "target-dispatch-finalize-only";
  }
  if (helperCalls.length) return "target-dispatch-helper-only";
  return "target-dispatch-context-only";
}

function blockerForStatus(status) {
  if (status === "target-dispatch-context-missing") {
    return "no native SkinRep target dispatch context matched this create bridge row";
  }
  if (status === "target-dispatch-finalize-only") {
    return "native finalize/marker command evidence is diagnostic-only; no placement vtable offset or callback payload was recovered";
  }
  return "native dispatch helper/factory evidence is diagnostic-only until placement/timing semantics are fully recovered";
}

function auditRow(row, skinrepContextItems) {
  const contexts = contextsForCreateBridgeRow(row, skinrepContextItems);
  const contextText = contexts.map((contextRow) => contextRow.context || "").join("\n");
  const helperCalls = dispatchHelperCallsForContext(contextText);
  const metadata = helperCalls.map((helperCall) => dispatchHelperMetadata[helperCall]).filter(Boolean);
  const helperRoles = uniqueInOrder(metadata.map((entry) => entry.role));
  const offsets = targetVtableOffsets(contextText);
  const callbackRegistrations = callbackRegistrationCallsForContext(contextText);
  const callbackPointers = callbackFunctionPointers(contextText);
  const callbackOffsets = callbackFieldOffsets(contextText);
  const status = statusForEvidence(contexts, helperCalls, helperRoles, offsets, callbackPointers, callbackRegistrations);

  return {
    status,
    placementPromotionAllowed: false,
    sourceCreateBridgeStatus: row.status || "",
    sourceRenderPromotionAllowed: row.renderPromotionAllowed === true,
    heroNames: pipeValues(row.heroNames),
    actionKeys: pipeValues(row.actionKeys),
    effectToken: row.effectToken || "",
    pairedImpactEffectTokens: pipeValues(row.pairedImpactEffectTokens),
    matchedContextFunctions: uniqueInOrder(contexts.map((contextRow) => contextRow.functionName).filter(Boolean)),
    matchedContextLines: uniqueInOrder(contexts.map((contextRow) => contextRow.line).filter((line) => line !== "" && line != null)),
    matchedContextPlatforms: uniqueInOrder(contexts.map((contextRow) => contextRow.platform).filter(Boolean)),
    dispatchHelperCalls: helperCalls,
    dispatchHelperRoles: helperRoles,
    dispatchFactoryCalls: uniqueInOrder(metadata.map((entry) => entry.factoryCall)),
    dispatchAllocatorCalls: uniqueInOrder(metadata.map((entry) => entry.allocatorCall)),
    dispatchPoolKinds: uniqueInOrder(metadata.map((entry) => entry.poolKind)),
    dispatchFactoryVtablePointers: uniqueInOrder(metadata.flatMap((entry) => entry.factoryVtablePointers)),
    runtimeEffectVtablePointers: uniqueInOrder([...pipeValues(row.runtimeVtablePointers), ...runtimeVtablePointers(contextText)]),
    releaseOrCommitHelperCalls: helperCalls.filter((helperCall) => releaseOrCommitHelperNames.has(helperCall)),
    callbackRegistrationCalls: callbackRegistrations,
    callbackFunctionPointers: callbackPointers,
    callbackFieldOffsets: callbackOffsets,
    targetVtableOffsets: offsets,
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
    contextMatchedRows: items.filter((item) => item.status !== "target-dispatch-context-missing").length,
    missingContextRows: byStatus["target-dispatch-context-missing"] || 0,
    helperFactoryRows: items.filter((item) => item.dispatchFactoryCalls.length).length,
    runtimePoolRows: items.filter((item) => item.dispatchPoolKinds.length).length,
    factoryVtableRows: items.filter((item) => item.dispatchFactoryVtablePointers.length).length,
    runtimeEffectVtablePointerRows: items.filter((item) => item.runtimeEffectVtablePointers.length).length,
    vtableOffsetRows: items.filter((item) => item.targetVtableOffsets.length).length,
    offset18Rows: items.filter((item) => item.targetVtableOffsets.includes("0x18")).length,
    offset30Rows: items.filter((item) => item.targetVtableOffsets.includes("0x30")).length,
    offset38Rows: items.filter((item) => item.targetVtableOffsets.includes("0x38")).length,
    offset58Rows: items.filter((item) => item.targetVtableOffsets.includes("0x58")).length,
    releaseHelperRows: items.filter((item) => item.releaseOrCommitHelperCalls.length).length,
    callbackCommandRows: items.filter((item) => item.callbackRegistrationCalls.length || item.callbackFunctionPointers.length).length,
    callbackRegistrationRows: items.filter((item) => item.callbackRegistrationCalls.length).length,
    callbackFunctionRows: items.filter((item) => item.callbackFunctionPointers.length).length,
    placementPromotionAllowedRows: 0,
    heroes: heroes.size,
    effectTokens: effects.size,
    byStatus,
  };
}

function buildProjectileTargetDispatchAudit({
  createBridgeAudit = {},
  skinrepContextItems = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = (createBridgeAudit.items || [])
    .map((row) => auditRow(row, skinrepContextItems))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.sourceCreateBridgeStatus.localeCompare(right.sourceCreateBridgeStatus),
    );
  return {
    generatedAt,
    source: {
      createBridgeAuditPath: defaultCreateBridgeAuditPath,
      skinrepContextPath: defaultSkinrepContextPath,
    },
    summary: summarize(items),
    helperMetadata: dispatchHelperMetadata,
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    placementPromotionAllowed: item.placementPromotionAllowed,
    sourceCreateBridgeStatus: item.sourceCreateBridgeStatus,
    sourceRenderPromotionAllowed: item.sourceRenderPromotionAllowed,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    pairedImpactEffectTokens: item.pairedImpactEffectTokens,
    matchedContextFunctions: item.matchedContextFunctions,
    matchedContextLines: item.matchedContextLines,
    matchedContextPlatforms: item.matchedContextPlatforms,
    dispatchHelperCalls: item.dispatchHelperCalls,
    dispatchHelperRoles: item.dispatchHelperRoles,
    dispatchFactoryCalls: item.dispatchFactoryCalls,
    dispatchAllocatorCalls: item.dispatchAllocatorCalls,
    dispatchPoolKinds: item.dispatchPoolKinds,
    dispatchFactoryVtablePointers: item.dispatchFactoryVtablePointers,
    runtimeEffectVtablePointers: item.runtimeEffectVtablePointers,
    releaseOrCommitHelperCalls: item.releaseOrCommitHelperCalls,
    callbackRegistrationCalls: item.callbackRegistrationCalls,
    callbackFunctionPointers: item.callbackFunctionPointers,
    callbackFieldOffsets: item.callbackFieldOffsets,
    targetVtableOffsets: item.targetVtableOffsets,
    blocker: item.blocker,
  }));
}

function exportProjectileTargetDispatchAudit({
  createBridgeAuditPath = defaultCreateBridgeAuditPath,
  skinrepContextPath = defaultSkinrepContextPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileTargetDispatchAudit({
    createBridgeAudit: readJson(createBridgeAuditPath, { items: [] }),
    skinrepContextItems: readJson(skinrepContextPath, { items: [] }).items || [],
    generatedAt,
  });
  audit.source = { createBridgeAuditPath, skinrepContextPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "placementPromotionAllowed",
    "sourceCreateBridgeStatus",
    "sourceRenderPromotionAllowed",
    "heroNames",
    "actionKeys",
    "effectToken",
    "pairedImpactEffectTokens",
    "matchedContextFunctions",
    "matchedContextLines",
    "matchedContextPlatforms",
    "dispatchHelperCalls",
    "dispatchHelperRoles",
    "dispatchFactoryCalls",
    "dispatchAllocatorCalls",
    "dispatchPoolKinds",
    "dispatchFactoryVtablePointers",
    "runtimeEffectVtablePointers",
    "releaseOrCommitHelperCalls",
    "callbackRegistrationCalls",
    "callbackFunctionPointers",
    "callbackFieldOffsets",
    "targetVtableOffsets",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileTargetDispatchAudit({
    createBridgeAuditPath: optionValue(args, "--create-bridge-audit", defaultCreateBridgeAuditPath),
    skinrepContextPath: optionValue(args, "--skinrep-context", defaultSkinrepContextPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileTargetDispatchAudit,
  exportProjectileTargetDispatchAudit,
  readTsv,
  reportRowsForAudit,
  summarize,
};
