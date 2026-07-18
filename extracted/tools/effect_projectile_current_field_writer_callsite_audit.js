#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentTokenWindowAuditPath = "extracted/reports/effect_projectile_current_token_window_audit.json";
const defaultCurrentBranchTargetAuditPath = "extracted/reports/effect_projectile_current_branch_target_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-field-writer-callsite-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_field_writer_callsite_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_field_writer_callsite_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseHex(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9a-f]+$/i.test(text)) return Number.parseInt(text, 16);
  return NaN;
}

function parseNumber(value) {
  const text = String(value || "").replace(/^#/, "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return NaN;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function normalizeHex(value) {
  return hex(parseHex(value));
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

function parseObjdumpInstructions(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map(parseObjdumpInstructionLine)
    .filter(Boolean);
}

function defaultDisassembleWindow(binaryPath, startAddressHex, endAddressHex) {
  const start = parseHex(startAddressHex);
  const parsedEnd = parseHex(endAddressHex);
  const stop = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd + 4 : start + 0x300;
  const result = spawnSync(
    "objdump",
    [
      "-d",
      "--no-show-raw-insn",
      `--start-address=0x${start.toString(16)}`,
      `--stop-address=0x${stop.toString(16)}`,
      binaryPath,
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `objdump failed for ${startAddressHex}`);
  }
  return result.stdout;
}

function fieldWriterHelpersByTarget(currentBranchTargetAudit) {
  const result = new Map();
  for (const item of currentBranchTargetAudit.items || []) {
    if (item.status !== "current-branch-field-writer") continue;
    const branchTargetHex = normalizeHex(item.branchTargetHex);
    if (!branchTargetHex) continue;
    result.set(branchTargetHex, {
      branchTargetHex,
      helperFieldWriteOffsets: pipeValues(item.fieldWriteOffsets).map(normalizeHex).filter(Boolean),
    });
  }
  return result;
}

function branchCallTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function resolveX0Argument(instructions, callIndex) {
  const start = Math.max(0, callIndex - 12);
  for (let index = callIndex - 1; index >= start; index -= 1) {
    const instruction = instructions[index];
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^x0,\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match) {
        return {
          argumentKind: "base-plus-offset",
          argumentBaseRegister: match[1].toLowerCase(),
          argumentBaseOffsetHex: hex(parseNumber(match[2])),
          argumentSourceInstruction: instruction.text,
        };
      }
    }
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^x0,\s*(x\d+)$/);
      if (match) {
        return {
          argumentKind: "base-register",
          argumentBaseRegister: match[1].toLowerCase(),
          argumentBaseOffsetHex: "0x0",
          argumentSourceInstruction: instruction.text,
        };
      }
    }
    if (instruction.mnemonic === "ldr") {
      const match = operands.match(/^x0,\s*\[(x\d+)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]$/);
      if (match) {
        return {
          argumentKind: "loaded-pointer",
          argumentBaseRegister: match[1].toLowerCase(),
          argumentBaseOffsetHex: match[2] ? hex(parseNumber(match[2])) : "0x0",
          argumentSourceInstruction: instruction.text,
        };
      }
    }
  }
  return {
    argumentKind: "unresolved",
    argumentBaseRegister: "",
    argumentBaseOffsetHex: "",
    argumentSourceInstruction: "",
  };
}

function combineOffsets(argument, helperFieldWriteOffsets) {
  if (!["base-plus-offset", "base-register"].includes(argument.argumentKind)) return [];
  const baseOffset = parseHex(argument.argumentBaseOffsetHex);
  if (!Number.isFinite(baseOffset)) return [];
  return uniqueInOrder(
    helperFieldWriteOffsets
      .map(parseHex)
      .filter(Number.isFinite)
      .map((offset) => hex(baseOffset + offset)),
  );
}

function statusForRow(argument, combinedRuntimeFieldOffsets) {
  if (combinedRuntimeFieldOffsets.length) return "field-writer-callsite-argument-base";
  if (argument.argumentKind === "loaded-pointer") return "field-writer-callsite-loaded-pointer";
  return "field-writer-callsite-argument-unresolved";
}

function rowsForTokenWindow(tokenWindow, { helperByTarget, disassembleWindow, disassemblyCache }) {
  const branchTargets = pipeValues(tokenWindow.branchCallTargets).map(normalizeHex).filter((target) => helperByTarget.has(target));
  if (!branchTargets.length || !tokenWindow.functionStartHex) return [];
  const cacheKey = `${tokenWindow.functionStartHex}-${tokenWindow.functionEndHex}`;
  const disassembly =
    disassemblyCache.get(cacheKey) ||
    disassembleWindow(tokenWindow.functionStartHex, tokenWindow.functionEndHex, tokenWindow);
  disassemblyCache.set(cacheKey, disassembly);
  const instructions = parseObjdumpInstructions(disassembly);
  const rows = [];

  for (let index = 0; index < instructions.length; index += 1) {
    const target = branchCallTarget(instructions[index]);
    const helper = helperByTarget.get(target);
    if (!helper) continue;
    const argument = resolveX0Argument(instructions, index);
    const combinedRuntimeFieldOffsets = combineOffsets(argument, helper.helperFieldWriteOffsets);
    rows.push({
      status: statusForRow(argument, combinedRuntimeFieldOffsets),
      targetName: tokenWindow.targetName || "",
      xrefAddressHex: tokenWindow.xrefAddressHex || "",
      tokenFunctionStartHex: tokenWindow.functionStartHex || "",
      tokenFunctionEndHex: tokenWindow.functionEndHex || "",
      branchTargetHex: target,
      callsiteAddressHex: instructions[index].addressHex,
      argumentKind: argument.argumentKind,
      argumentBaseRegister: argument.argumentBaseRegister,
      argumentBaseOffsetHex: argument.argumentBaseOffsetHex,
      argumentSourceInstruction: argument.argumentSourceInstruction,
      helperFieldWriteOffsets: helper.helperFieldWriteOffsets,
      combinedRuntimeFieldOffsets,
      currentConsumerResolved: false,
      renderPromotionAllowed: false,
      blocker:
        "field writer callsite argument was traced, but downstream reader/executor semantics are still unresolved",
    });
  }
  return rows;
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    fieldWriterCallsiteRows: items.length,
    argumentBaseRecoveredRows: items.filter((item) => item.status === "field-writer-callsite-argument-base").length,
    loadedPointerRows: items.filter((item) => item.status === "field-writer-callsite-loaded-pointer").length,
    unresolvedArgumentRows: items.filter((item) => item.status === "field-writer-callsite-argument-unresolved").length,
    combinedRuntimeFieldRows: items.reduce((sum, item) => sum + item.combinedRuntimeFieldOffsets.length, 0),
    uniqueCombinedRuntimeFields: uniqueInOrder(items.flatMap((item) => item.combinedRuntimeFieldOffsets)).length,
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentFieldWriterCallsiteAudit({
  currentTokenWindowAudit = {},
  currentBranchTargetAudit = {},
  disassembleWindow = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const helperByTarget = fieldWriterHelpersByTarget(currentBranchTargetAudit);
  const disassemblyCache = new Map();
  const items = (currentTokenWindowAudit.items || [])
    .flatMap((tokenWindow) => rowsForTokenWindow(tokenWindow, { helperByTarget, disassembleWindow, disassemblyCache }))
    .sort(
      (left, right) =>
        parseHex(left.callsiteAddressHex) - parseHex(right.callsiteAddressHex) ||
        left.targetName.localeCompare(right.targetName),
    );

  return {
    generatedAt,
    source: {
      currentTokenWindowAuditPath: defaultCurrentTokenWindowAuditPath,
      currentBranchTargetAuditPath: defaultCurrentBranchTargetAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile field-writer callsite audit; combined runtime field offsets do not promote rendering until downstream readers are recovered",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    targetName: item.targetName,
    xrefAddressHex: item.xrefAddressHex,
    tokenFunctionStartHex: item.tokenFunctionStartHex,
    tokenFunctionEndHex: item.tokenFunctionEndHex,
    branchTargetHex: item.branchTargetHex,
    callsiteAddressHex: item.callsiteAddressHex,
    argumentKind: item.argumentKind,
    argumentBaseRegister: item.argumentBaseRegister,
    argumentBaseOffsetHex: item.argumentBaseOffsetHex,
    argumentSourceInstruction: item.argumentSourceInstruction,
    helperFieldWriteOffsets: item.helperFieldWriteOffsets,
    combinedRuntimeFieldOffsets: item.combinedRuntimeFieldOffsets,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentFieldWriterCallsiteAudit({
  currentTokenWindowAuditPath = defaultCurrentTokenWindowAuditPath,
  currentBranchTargetAuditPath = defaultCurrentBranchTargetAuditPath,
  binaryPath = defaultBinaryPath,
  disassembleWindow = null,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileCurrentFieldWriterCallsiteAudit({
    currentTokenWindowAudit: readJson(currentTokenWindowAuditPath, { items: [] }),
    currentBranchTargetAudit: readJson(currentBranchTargetAuditPath, { items: [] }),
    disassembleWindow:
      disassembleWindow ||
      ((functionStartHex, functionEndHex) => defaultDisassembleWindow(binaryPath, functionStartHex, functionEndHex)),
    generatedAt,
  });
  audit.source = { currentTokenWindowAuditPath, currentBranchTargetAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "targetName",
    "xrefAddressHex",
    "tokenFunctionStartHex",
    "tokenFunctionEndHex",
    "branchTargetHex",
    "callsiteAddressHex",
    "argumentKind",
    "argumentBaseRegister",
    "argumentBaseOffsetHex",
    "argumentSourceInstruction",
    "helperFieldWriteOffsets",
    "combinedRuntimeFieldOffsets",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentFieldWriterCallsiteAudit({
    currentTokenWindowAuditPath: optionValue(args, "--current-token-window-audit", defaultCurrentTokenWindowAuditPath),
    currentBranchTargetAuditPath: optionValue(args, "--current-branch-target-audit", defaultCurrentBranchTargetAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentFieldWriterCallsiteAudit,
  exportProjectileCurrentFieldWriterCallsiteAudit,
  readTsv,
};
