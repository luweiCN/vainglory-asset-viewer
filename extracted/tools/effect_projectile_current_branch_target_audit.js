#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentTokenWindowAuditPath = "extracted/reports/effect_projectile_current_token_window_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-branch-target-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_branch_target_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_branch_target_audit.tsv";

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

function limited(values, limit = 24) {
  return uniqueInOrder(values).slice(0, limit);
}

function parseObjdumpInstructions(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map(parseObjdumpInstructionLine)
    .filter(Boolean);
}

function defaultDisassembleFunction(binaryPath, addressHex) {
  const start = parseHex(addressHex);
  const stop = start + 0x180;
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
    throw new Error(result.stderr || result.stdout || `objdump failed for ${addressHex}`);
  }
  return result.stdout;
}

function boundedFunctionInstructions(output, startAddressHex) {
  const startAddress = parseHex(startAddressHex);
  const instructions = parseObjdumpInstructions(output).filter((instruction) => instruction.address >= startAddress);
  const bounded = [];
  for (const instruction of instructions) {
    bounded.push(instruction);
    if (instruction.mnemonic === "ret") break;
  }
  return bounded;
}

function memoryOffsetForOperand(operands) {
  const match = String(operands || "").match(/\[(x\d+)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/);
  if (!match) return "";
  return match[2] ? hex(parseNumber(match[2])) : "0x0";
}

function fieldWriteOffsetsForInstructions(instructions) {
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => /^(str|stp|stur)$/.test(instruction.mnemonic))
      .map((instruction) => memoryOffsetForOperand(instruction.operands))
      .filter(Boolean),
  );
}

function destinationRegisterForLoad(instruction) {
  if (!instruction || !/^ld/.test(instruction.mnemonic)) return "";
  const match = instruction.operands.match(/^(x\d+),\s*\[(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)\]/);
  return match ? match[1].toLowerCase() : "";
}

function offsetForLoad(instruction) {
  const match = String(instruction?.operands || "").match(/^(x\d+),\s*\[(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)\]/);
  return match ? hex(parseNumber(match[3])) : "";
}

function vtableOffsetsForInstructions(instructions) {
  const offsets = [];
  for (let index = 0; index < (instructions || []).length; index += 1) {
    const instruction = instructions[index];
    const destination = destinationRegisterForLoad(instruction);
    const offset = offsetForLoad(instruction);
    if (!destination || !offset) continue;
    const hasIndirectCall = instructions
      .slice(index + 1, index + 4)
      .some((candidate) => candidate.mnemonic === "blr" && candidate.operands.trim().toLowerCase() === destination);
    if (hasIndirectCall) offsets.push(offset);
  }
  return uniqueInOrder(offsets);
}

function branchCallTargetsForInstructions(instructions) {
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => instruction.mnemonic === "bl")
      .map((instruction) => normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "")),
  );
}

function statusForTarget({ fieldWriteOffsets, vtableOffsets, directBranchTargets }) {
  if (vtableOffsets.length) return "current-branch-vtable-dispatch";
  if (fieldWriteOffsets.length && !directBranchTargets.length) return "current-branch-field-writer";
  if (directBranchTargets.length) return "current-branch-helper";
  return "current-branch-unclassified";
}

function groupByBranchTarget(currentTokenWindowAudit) {
  const groups = new Map();
  for (const item of currentTokenWindowAudit.items || []) {
    for (const target of pipeValues(item.branchCallTargets).map(normalizeHex).filter(Boolean)) {
      if (!groups.has(target)) groups.set(target, []);
      groups.get(target).push(item);
    }
  }
  return [...groups.entries()].sort((left, right) => parseHex(left[0]) - parseHex(right[0]));
}

function rowForBranchTarget(branchTargetHex, sourceRows, disassembleFunction) {
  const instructions = boundedFunctionInstructions(disassembleFunction(branchTargetHex), branchTargetHex);
  const fieldWriteOffsets = fieldWriteOffsetsForInstructions(instructions);
  const vtableOffsets = vtableOffsetsForInstructions(instructions);
  const directBranchTargets = branchCallTargetsForInstructions(instructions);
  const status = statusForTarget({ fieldWriteOffsets, vtableOffsets, directBranchTargets });

  return {
    status,
    branchTargetHex,
    functionStartHex: instructions[0]?.addressHex || "",
    functionEndHex: instructions[instructions.length - 1]?.addressHex || "",
    instructionRows: instructions.length,
    sourceTokenWindowRows: sourceRows.length,
    sourceTargetNames: limited(sourceRows.map((row) => row.targetName)),
    sourceXrefAddresses: limited(sourceRows.map((row) => row.xrefAddressHex)),
    sourceWindowStatuses: limited(sourceRows.map((row) => row.status)),
    fieldWriteOffsets,
    vtableOffsets,
    directBranchTargets,
    firstInstructionTexts: instructions.slice(0, 8).map((instruction) => instruction.text),
    currentConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "current branch target function is structurally classified, but downstream reader/executor semantics are still unresolved",
  };
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    sourceTokenWindowRows: items.reduce((sum, item) => sum + item.sourceTokenWindowRows, 0),
    sharedBranchTargetRows: items.filter((item) => item.sourceTokenWindowRows > 1).length,
    fieldWriterRows: items.filter((item) => item.status === "current-branch-field-writer").length,
    vtableDispatchRows: items.filter((item) => item.status === "current-branch-vtable-dispatch").length,
    helperRows: items.filter((item) => item.status === "current-branch-helper").length,
    unclassifiedRows: items.filter((item) => item.status === "current-branch-unclassified").length,
    fieldWriteReferenceRows: items.reduce((sum, item) => sum + item.fieldWriteOffsets.length, 0),
    vtableCallRows: items.reduce((sum, item) => sum + item.vtableOffsets.length, 0),
    directBranchRows: items.reduce((sum, item) => sum + item.directBranchTargets.length, 0),
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentBranchTargetAudit({
  currentTokenWindowAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = groupByBranchTarget(currentTokenWindowAudit).map(([branchTargetHex, sourceRows]) =>
    rowForBranchTarget(branchTargetHex, sourceRows, disassembleFunction),
  );
  return {
    generatedAt,
    source: {
      currentTokenWindowAuditPath: defaultCurrentTokenWindowAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile branch target audit; helper/field/vtable structure does not promote rendering until downstream readers are recovered",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    branchTargetHex: item.branchTargetHex,
    functionStartHex: item.functionStartHex,
    functionEndHex: item.functionEndHex,
    instructionRows: item.instructionRows,
    sourceTokenWindowRows: item.sourceTokenWindowRows,
    sourceTargetNames: item.sourceTargetNames,
    sourceXrefAddresses: item.sourceXrefAddresses,
    sourceWindowStatuses: item.sourceWindowStatuses,
    fieldWriteOffsets: item.fieldWriteOffsets,
    vtableOffsets: item.vtableOffsets,
    directBranchTargets: item.directBranchTargets,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentBranchTargetAudit({
  currentTokenWindowAuditPath = defaultCurrentTokenWindowAuditPath,
  binaryPath = defaultBinaryPath,
  disassembleFunction = null,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileCurrentBranchTargetAudit({
    currentTokenWindowAudit: readJson(currentTokenWindowAuditPath, { items: [] }),
    disassembleFunction: disassembleFunction || ((addressHex) => defaultDisassembleFunction(binaryPath, addressHex)),
    generatedAt,
  });
  audit.source = { currentTokenWindowAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "branchTargetHex",
    "functionStartHex",
    "functionEndHex",
    "instructionRows",
    "sourceTokenWindowRows",
    "sourceTargetNames",
    "sourceXrefAddresses",
    "sourceWindowStatuses",
    "fieldWriteOffsets",
    "vtableOffsets",
    "directBranchTargets",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentBranchTargetAudit({
    currentTokenWindowAuditPath: optionValue(args, "--current-token-window-audit", defaultCurrentTokenWindowAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentBranchTargetAudit,
  exportProjectileCurrentBranchTargetAudit,
  readTsv,
};
