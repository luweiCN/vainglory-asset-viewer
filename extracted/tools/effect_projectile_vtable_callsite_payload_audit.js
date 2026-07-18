#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetDispatchAuditPath = "extracted/reports/effect_projectile_target_dispatch_audit.json";
const defaultSkinrepContextPath = "extracted/reports/native_skinrep_consumer_context.json";
const defaultViewerOut = "extracted/viewer/effect-projectile-vtable-callsite-payload-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_vtable_callsite_payload_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_vtable_callsite_payload_audit.tsv";

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

function splitStatements(text) {
  return String(text || "")
    .replace(/\r?\n\s*;/g, ";")
    .split(/;\s*/)
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitArgs(argsText) {
  const args = [];
  let depth = 0;
  let current = "";
  for (const char of String(argsText || "")) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function parseVtableCall(statement) {
  const match = String(statement || "").match(
    /\(\*\*\(code \*\*\)\s*\(\*([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*(0x[0-9a-fA-F]+)\)\)\s*\((.*)\)/,
  );
  if (!match) return null;
  const objectVariable = match[1];
  const args = splitArgs(match[3]);
  const payloadArgs = args[0] === objectVariable ? args.slice(1) : args;
  return {
    objectVariable,
    offset: match[2].toLowerCase(),
    payloadArgs,
    callText: statement,
  };
}

function localAssignmentsFor(statements, index, localName) {
  const start = Math.max(0, index - 8);
  const recent = statements.slice(start, index);
  const assignmentPattern = new RegExp(`\\b${localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\[[^\\]]+\\])?\\s*=`);
  return recent.filter((statement) => assignmentPattern.test(statement) || /\blocal_[0-9a-fA-F]+\s*=/.test(statement));
}

function classifyPayload(payloadArgs, localAssignments) {
  if (!payloadArgs.length) return { payloadKind: "no-payload", callbackFunction: "", payloadValue: "" };
  const first = payloadArgs[0];
  if (/^".*"$/.test(first) || /^PTR_s_/.test(first)) {
    return { payloadKind: "string-token", callbackFunction: "", payloadValue: first };
  }
  if (/^(0x[0-9a-fA-F]+|\d+)$/.test(first)) {
    return { payloadKind: "immediate-scalar", callbackFunction: "", payloadValue: first };
  }
  const local = first.match(/^&?(local_[0-9a-fA-F]+)/);
  if (local) {
    const callback = localAssignments.join("\n").match(new RegExp(`\\b${local[1]}\\s*=\\s*(FUN_[0-9a-fA-F]+)`))?.[1] || "";
    if (callback) return { payloadKind: "local-callback-payload", callbackFunction: callback, payloadValue: first };
    if (localAssignments.some((assignment) => new RegExp(`\\b${local[1]}\\[[^\\]]+\\]\\s*=`).test(assignment))) {
      return { payloadKind: "local-immediate-payload", callbackFunction: "", payloadValue: first };
    }
    return { payloadKind: "local-payload", callbackFunction: "", payloadValue: first };
  }
  return { payloadKind: "unknown-payload", callbackFunction: "", payloadValue: first };
}

function extractVtableCallsitePayloads(contextText) {
  const statements = splitStatements(contextText);
  const rows = [];
  statements.forEach((statement, index) => {
    const call = parseVtableCall(statement);
    if (!call) return;
    const localName = call.payloadArgs[0]?.match(/^&?(local_[0-9a-fA-F]+)/)?.[1] || "";
    const localAssignments = localName ? localAssignmentsFor(statements, index, localName) : [];
    const classification = classifyPayload(call.payloadArgs, localAssignments);
    rows.push({
      offset: call.offset,
      objectVariable: call.objectVariable,
      payloadArgs: call.payloadArgs,
      payloadKind: classification.payloadKind,
      payloadValue: classification.payloadValue,
      callbackFunction: classification.callbackFunction,
      localAssignments,
      callText: call.callText,
    });
  });
  return rows;
}

function contextMatchesRow(row, context) {
  const functions = new Set(row.matchedContextFunctions || []);
  const platforms = new Set(row.matchedContextPlatforms || []);
  return (
    functions.has(context.functionName) &&
    (!platforms.size || !context.platform || platforms.has(context.platform))
  );
}

function callsiteRowsForTargetDispatchRow(row, contexts) {
  return contexts
    .filter((context) => contextMatchesRow(row, context))
    .flatMap((context) =>
      extractVtableCallsitePayloads(context.context || "").map((payload) => ({
        sourceTargetDispatchStatus: row.status || "",
        heroNames: row.heroNames || [],
        actionKeys: row.actionKeys || [],
        effectToken: row.effectToken || "",
        contextFunction: context.functionName || "",
        contextPlatform: context.platform || "",
        contextSourceFile: context.sourceFile || "",
        contextLine: context.line || "",
        renderPromotionAllowed: false,
        blocker:
          "vtable callsite payload is diagnostic-only until payload field semantics and runtime consumers are recovered",
        ...payload,
      })),
    );
}

function summarize(items, sourceTargetDispatchRows) {
  const byOffset = {};
  const byPayloadKind = {};
  for (const item of items) {
    byOffset[item.offset] = (byOffset[item.offset] || 0) + 1;
    byPayloadKind[item.payloadKind] = (byPayloadKind[item.payloadKind] || 0) + 1;
  }
  return {
    rows: items.length,
    sourceTargetDispatchRows,
    localPayloadRows: items.filter((item) => item.payloadKind.startsWith("local-")).length,
    callbackPayloadRows: items.filter((item) => item.payloadKind === "local-callback-payload").length,
    stringTokenPayloadRows: items.filter((item) => item.payloadKind === "string-token").length,
    immediateScalarPayloadRows: items.filter((item) => item.payloadKind === "immediate-scalar").length,
    renderPromotionAllowedRows: 0,
    byOffset: Object.fromEntries(
      Object.entries(byOffset).sort(([left], [right]) => Number.parseInt(left, 16) - Number.parseInt(right, 16)),
    ),
    byPayloadKind: Object.fromEntries(Object.entries(byPayloadKind).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileVtableCallsitePayloadAudit({
  targetDispatchAudit = {},
  skinrepContextItems = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRows = (targetDispatchAudit.items || []).filter((row) => row.status === "target-dispatch-vtable-offsets");
  const items = sourceRows
    .flatMap((row) => callsiteRowsForTargetDispatchRow(row, skinrepContextItems))
    .sort(
      (left, right) =>
        left.effectToken.localeCompare(right.effectToken) ||
        left.contextFunction.localeCompare(right.contextFunction) ||
        Number.parseInt(left.offset, 16) - Number.parseInt(right.offset, 16),
    );
  return {
    generatedAt,
    source: {
      targetDispatchAuditPath: defaultTargetDispatchAuditPath,
      skinrepContextPath: defaultSkinrepContextPath,
    },
    policy:
      "diagnostic-only vtable callsite payload audit; extracts decompiled offset call payload shapes but does not assign runtime projectile semantics",
    summary: summarize(items, sourceRows.length),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    sourceTargetDispatchStatus: item.sourceTargetDispatchStatus,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectToken: item.effectToken,
    contextFunction: item.contextFunction,
    contextPlatform: item.contextPlatform,
    contextSourceFile: item.contextSourceFile,
    contextLine: item.contextLine,
    offset: item.offset,
    objectVariable: item.objectVariable,
    payloadKind: item.payloadKind,
    payloadValue: item.payloadValue,
    payloadArgs: item.payloadArgs,
    callbackFunction: item.callbackFunction,
    localAssignments: item.localAssignments,
    callText: item.callText,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileVtableCallsitePayloadAudit({
  targetDispatchAuditPath = defaultTargetDispatchAuditPath,
  skinrepContextPath = defaultSkinrepContextPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileVtableCallsitePayloadAudit({
    targetDispatchAudit: readJson(targetDispatchAuditPath, { items: [] }),
    skinrepContextItems: readJson(skinrepContextPath, { items: [] }).items || [],
    generatedAt,
  });
  audit.source = { targetDispatchAuditPath, skinrepContextPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "sourceTargetDispatchStatus",
    "heroNames",
    "actionKeys",
    "effectToken",
    "contextFunction",
    "contextPlatform",
    "contextSourceFile",
    "contextLine",
    "offset",
    "objectVariable",
    "payloadKind",
    "payloadValue",
    "payloadArgs",
    "callbackFunction",
    "localAssignments",
    "callText",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileVtableCallsitePayloadAudit({
    targetDispatchAuditPath: optionValue(args, "--target-dispatch-audit", defaultTargetDispatchAuditPath),
    skinrepContextPath: optionValue(args, "--skinrep-context", defaultSkinrepContextPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileVtableCallsitePayloadAudit,
  exportProjectileVtableCallsitePayloadAudit,
  extractVtableCallsitePayloads,
  readTsv,
};
