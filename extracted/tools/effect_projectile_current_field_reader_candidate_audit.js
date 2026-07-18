#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentFieldWriterCallsiteAuditPath =
  "extracted/reports/effect_projectile_current_field_writer_callsite_audit.json";
const defaultCurrentBranchTargetAuditPath = "extracted/reports/effect_projectile_current_branch_target_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-field-reader-candidate-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_field_reader_candidate_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_field_reader_candidate_audit.tsv";

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

function combinedRuntimeFieldSet(currentFieldWriterCallsiteAudit) {
  return new Set(
    (currentFieldWriterCallsiteAudit.items || [])
      .flatMap((item) => pipeValues(item.combinedRuntimeFieldOffsets))
      .map(normalizeHex)
      .filter(Boolean),
  );
}

function memoryReferences(instruction) {
  const refs = [];
  if (!/^ld/.test(instruction.mnemonic)) return refs;
  for (const match of instruction.operands.matchAll(/\[(x\d+|sp)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/g)) {
    refs.push({
      baseRegister: match[1].toLowerCase(),
      offsetHex: match[2] ? hex(parseNumber(match[2])) : "0x0",
      instructionText: instruction.text,
    });
  }
  return refs;
}

function directBranchTargets(instructions) {
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => instruction.mnemonic === "bl")
      .map((instruction) => normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || ""))
      .filter(Boolean),
  );
}

function classifyOffset(offsetHex) {
  const value = parseHex(offsetHex);
  if (!Number.isFinite(value)) return "unknown";
  return value >= 0x80 ? "specific" : "generic";
}

function rowForBranchTarget(branchTarget, { runtimeFieldSet, disassembleFunction }) {
  const branchTargetHex = normalizeHex(branchTarget.branchTargetHex);
  if (!branchTargetHex) return null;
  const instructions = boundedFunctionInstructions(disassembleFunction(branchTargetHex), branchTargetHex);
  const specificReadOffsets = [];
  const genericReadOffsets = [];
  const ignoredStackReadOffsets = [];
  const readInstructionTexts = [];

  for (const instruction of instructions) {
    for (const ref of memoryReferences(instruction)) {
      if (ref.baseRegister === "sp" || ref.baseRegister === "x29") {
        ignoredStackReadOffsets.push(ref.offsetHex);
        continue;
      }
      if (!runtimeFieldSet.has(ref.offsetHex)) continue;
      if (classifyOffset(ref.offsetHex) === "specific") specificReadOffsets.push(ref.offsetHex);
      else genericReadOffsets.push(ref.offsetHex);
      readInstructionTexts.push(ref.instructionText);
    }
  }

  const uniqueSpecificReadOffsets = uniqueInOrder(specificReadOffsets);
  const uniqueGenericReadOffsets = uniqueInOrder(genericReadOffsets);
  if (!uniqueSpecificReadOffsets.length && !uniqueGenericReadOffsets.length) return null;
  const status = uniqueSpecificReadOffsets.length
    ? "current-field-reader-candidate-specific"
    : "current-field-reader-candidate-generic-only";

  return {
    status,
    branchTargetHex,
    branchTargetStatus: branchTarget.status || "",
    sourceTokenWindowRows: Number(branchTarget.sourceTokenWindowRows || 0),
    sourceTargetNames: pipeValues(branchTarget.sourceTargetNames),
    functionStartHex: instructions[0]?.addressHex || "",
    functionEndHex: instructions[instructions.length - 1]?.addressHex || "",
    instructionRows: instructions.length,
    specificReadOffsets: uniqueSpecificReadOffsets,
    genericReadOffsets: uniqueGenericReadOffsets,
    ignoredStackReadOffsets: uniqueInOrder(ignoredStackReadOffsets),
    directBranchTargets: directBranchTargets(instructions),
    readInstructionTexts: uniqueInOrder(readInstructionTexts).slice(0, 12),
    currentConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "current read-side field candidate recovered, but field semantics and downstream executor behavior are not proven",
  };
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    readerCandidateRows: items.length,
    specificReaderCandidateRows: items.filter((item) => item.status === "current-field-reader-candidate-specific").length,
    genericOnlyReaderCandidateRows: items.filter((item) => item.status === "current-field-reader-candidate-generic-only").length,
    specificFieldReadRows: items.reduce((sum, item) => sum + item.specificReadOffsets.length, 0),
    genericFieldReadRows: items.reduce((sum, item) => sum + item.genericReadOffsets.length, 0),
    stackReadIgnoredRows: items.reduce((sum, item) => sum + item.ignoredStackReadOffsets.length, 0),
    directBranchRows: items.reduce((sum, item) => sum + item.directBranchTargets.length, 0),
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentFieldReaderCandidateAudit({
  currentFieldWriterCallsiteAudit = {},
  currentBranchTargetAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const runtimeFieldSet = combinedRuntimeFieldSet(currentFieldWriterCallsiteAudit);
  const items = (currentBranchTargetAudit.items || [])
    .map((branchTarget) => rowForBranchTarget(branchTarget, { runtimeFieldSet, disassembleFunction }))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.specificReadOffsets.length - left.specificReadOffsets.length ||
        right.sourceTokenWindowRows - left.sourceTokenWindowRows ||
        parseHex(left.branchTargetHex) - parseHex(right.branchTargetHex),
    );

  return {
    generatedAt,
    source: {
      currentFieldWriterCallsiteAuditPath: defaultCurrentFieldWriterCallsiteAuditPath,
      currentBranchTargetAuditPath: defaultCurrentBranchTargetAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile field-reader candidate audit; read-side offset matches do not promote rendering until field semantics and executor ownership are proven",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    branchTargetHex: item.branchTargetHex,
    branchTargetStatus: item.branchTargetStatus,
    sourceTokenWindowRows: item.sourceTokenWindowRows,
    sourceTargetNames: item.sourceTargetNames,
    functionStartHex: item.functionStartHex,
    functionEndHex: item.functionEndHex,
    instructionRows: item.instructionRows,
    specificReadOffsets: item.specificReadOffsets,
    genericReadOffsets: item.genericReadOffsets,
    ignoredStackReadOffsets: item.ignoredStackReadOffsets,
    directBranchTargets: item.directBranchTargets,
    readInstructionTexts: item.readInstructionTexts,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentFieldReaderCandidateAudit({
  currentFieldWriterCallsiteAuditPath = defaultCurrentFieldWriterCallsiteAuditPath,
  currentBranchTargetAuditPath = defaultCurrentBranchTargetAuditPath,
  binaryPath = defaultBinaryPath,
  disassembleFunction = null,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileCurrentFieldReaderCandidateAudit({
    currentFieldWriterCallsiteAudit: readJson(currentFieldWriterCallsiteAuditPath, { items: [] }),
    currentBranchTargetAudit: readJson(currentBranchTargetAuditPath, { items: [] }),
    disassembleFunction: disassembleFunction || ((addressHex) => defaultDisassembleFunction(binaryPath, addressHex)),
    generatedAt,
  });
  audit.source = { currentFieldWriterCallsiteAuditPath, currentBranchTargetAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "branchTargetHex",
    "branchTargetStatus",
    "sourceTokenWindowRows",
    "sourceTargetNames",
    "functionStartHex",
    "functionEndHex",
    "instructionRows",
    "specificReadOffsets",
    "genericReadOffsets",
    "ignoredStackReadOffsets",
    "directBranchTargets",
    "readInstructionTexts",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentFieldReaderCandidateAudit({
    currentFieldWriterCallsiteAuditPath: optionValue(
      args,
      "--current-field-writer-callsite-audit",
      defaultCurrentFieldWriterCallsiteAuditPath,
    ),
    currentBranchTargetAuditPath: optionValue(args, "--current-branch-target-audit", defaultCurrentBranchTargetAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentFieldReaderCandidateAudit,
  exportProjectileCurrentFieldReaderCandidateAudit,
  readTsv,
};
