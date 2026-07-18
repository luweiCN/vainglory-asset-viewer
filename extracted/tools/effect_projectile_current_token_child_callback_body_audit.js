#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultChildObjectChainAuditPath =
  "extracted/reports/effect_projectile_current_token_child_object_chain_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-callback-body-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_callback_body_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_callback_body_audit.tsv";

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

function parseObjdumpInstructions(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map(parseObjdumpInstructionLine)
    .filter(Boolean);
}

function branchTarget(instruction) {
  if (!instruction?.mnemonic?.startsWith("b")) return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function callTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x180) {
  const start = parseHex(addressHex);
  const stop = start + byteLength;
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

function boundedCallbackInstructions(disassembly, startAddressHex) {
  const startAddress = parseHex(startAddressHex);
  const instructions = parseObjdumpInstructions(disassembly).filter((instruction) => instruction.address >= startAddress);
  if (!instructions.length) return [];
  const localBranchTargets = instructions
    .map(branchTarget)
    .map(parseHex)
    .filter((target) => Number.isFinite(target) && target >= startAddress && target <= instructions.at(-1).address);
  const furthestLocalTarget = localBranchTargets.length ? Math.max(...localBranchTargets) : startAddress;
  const bounded = [];
  for (const instruction of instructions) {
    bounded.push(instruction);
    if (instruction.address < furthestLocalTarget) continue;
    if (instruction.mnemonic === "ret") break;
    if (instruction.mnemonic === "b") break;
  }
  return bounded;
}

function instructionOffsetFromBase(operands, baseRegister) {
  const regex = new RegExp(`\\[${baseRegister}(?:,\\s*#(0x[0-9a-fA-F]+|\\d+))?\\]`);
  const match = operands.match(regex);
  return match ? hex(match[1] ? parseNumber(match[1]) : 0) : "";
}

function instructionBaseRegister(operands) {
  return operands.match(/\[(x\d+)(?:,\s*#(?:0x[0-9a-fA-F]+|\d+))?\]/)?.[1]?.toLowerCase() || "";
}

function analyzeCallbackInstructions(instructions) {
  const aliases = new Map([
    ["x0", "x0"],
    ["x1", "x1"],
  ]);
  const ownerPointerReads = [];
  const helperResultFloatReadOffsets = [];
  const argumentOutputWrites = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^(x\d+),\s*(x\d+)$/);
      if (match) aliases.set(match[1].toLowerCase(), aliases.get(match[2].toLowerCase()) || match[2].toLowerCase());
      continue;
    }
    if (instruction.mnemonic === "ldr" && /^x0,\s*\[x\d+/.test(operands)) {
      const base = instructionBaseRegister(operands);
      if (aliases.get(base) === "x0") ownerPointerReads.push(instruction.text);
      continue;
    }
    if (instruction.mnemonic === "ldr" && /^s\d+,\s*\[x0/.test(operands)) {
      const offset = instructionOffsetFromBase(operands, "x0");
      if (offset) helperResultFloatReadOffsets.push(offset);
      continue;
    }
    if (instruction.mnemonic === "str" && /^s\d+,\s*\[x\d+/.test(operands)) {
      const valueRegister = operands.match(/^(s\d+),/)?.[1] || "";
      const base = instructionBaseRegister(operands);
      const alias = aliases.get(base) || base;
      if (alias === "x1") {
        const offset = instructionOffsetFromBase(operands, base) || "0x0";
        argumentOutputWrites.push(`x1+${offset}=${valueRegister}`);
      }
    }
  }

  const helperCallTargetHexes = uniqueInOrder((instructions || []).map(callTarget).filter(Boolean));
  const tailBranch = [...(instructions || [])].reverse().find((instruction) => instruction.mnemonic === "b");
  const hasRatio = (instructions || []).some((instruction) => instruction.mnemonic === "fdiv");
  const hasInverse = hasRatio && (instructions || []).some((instruction) => instruction.mnemonic === "fsub");
  const tailCallTargetHex = tailBranch ? branchTarget(tailBranch) : "";

  let callbackBodyClass = "unclassified-callback-body";
  let outputComputation = "";
  if (argumentOutputWrites.length) {
    callbackBodyClass = "argument-output-writer";
    outputComputation = hasInverse ? "inverse-normalized-helper-ratio" : hasRatio ? "normalized-helper-ratio" : "argument-output-write";
  } else if (tailCallTargetHex || helperResultFloatReadOffsets.length) {
    callbackBodyClass = "scalar-return";
    outputComputation = tailCallTargetHex ? "conditional-angle-or-zero" : "scalar-helper-result";
  }

  return {
    callbackBodyClass,
    status:
      callbackBodyClass === "argument-output-writer"
        ? "callback-body-argument-output-writer-consumer-unresolved"
        : callbackBodyClass === "scalar-return"
          ? "callback-body-scalar-return-consumer-unresolved"
          : "callback-body-unclassified-consumer-unresolved",
    helperCallTargetHexes,
    helperResultFloatReadOffsets: uniqueInOrder(helperResultFloatReadOffsets),
    ownerPointerReadInstructions: uniqueInOrder(ownerPointerReads),
    ownerPointerReadCount: ownerPointerReads.length,
    argumentOutputWrites: uniqueInOrder(argumentOutputWrites),
    outputComputation,
    tailCallTargetHex,
  };
}

function callbackInstallerRows(childObjectChainAudit) {
  return (childObjectChainAudit.items || []).filter(
    (item) =>
      item.status === "token-child-object-following-slot-callback-installer" &&
      item.resolvedFollowingSlotCallbackFunctionHex,
  );
}

function groupCallbackRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const callbackFunctionHex = normalizeHex(row.resolvedFollowingSlotCallbackFunctionHex);
    const slotOffsetHex = normalizeHex(row.resolvedFollowingSlotCallbackSlotOffsetHex);
    const key = `${callbackFunctionHex}|${slotOffsetHex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

function rowForCallbackGroup(sourceRows, { disassembleFunction }) {
  const first = sourceRows[0] || {};
  const installedCallbackFunctionHex = normalizeHex(first.resolvedFollowingSlotCallbackFunctionHex);
  const installedCallbackSlotOffsetHex = normalizeHex(first.resolvedFollowingSlotCallbackSlotOffsetHex);
  const disassembly = installedCallbackFunctionHex ? disassembleFunction(installedCallbackFunctionHex, 0x180) : "";
  const instructions = installedCallbackFunctionHex
    ? boundedCallbackInstructions(disassembly, installedCallbackFunctionHex)
    : [];
  const analysis = analyzeCallbackInstructions(instructions);
  return {
    status: instructions.length ? analysis.status : "callback-body-disassembly-missing",
    installedCallbackFunctionHex,
    installedCallbackSlotOffsetHex,
    sourceCallbackInstallerRows: sourceRows.length,
    sourceTargetNames: uniqueInOrder(sourceRows.map((row) => row.targetName)),
    sourceObjectAppendCallsites: uniqueInOrder(sourceRows.map((row) => row.objectAppendCallsiteAddressHex)),
    sourceInstallerFunctionHexes: uniqueInOrder(sourceRows.map((row) => row.resolvedFollowingSlotFunctionHex)),
    callbackBodyClass: instructions.length ? analysis.callbackBodyClass : "missing-disassembly",
    callbackFunctionStartHex: instructions[0]?.addressHex || "",
    callbackFunctionEndHex: instructions.at(-1)?.addressHex || "",
    callbackInstructionRows: instructions.length,
    callbackInstructions: instructions.map((instruction) => instruction.text),
    helperCallTargetHexes: analysis.helperCallTargetHexes,
    helperResultFloatReadOffsets: analysis.helperResultFloatReadOffsets,
    ownerPointerReadInstructions: analysis.ownerPointerReadInstructions,
    ownerPointerReadCount: analysis.ownerPointerReadCount,
    argumentOutputWrites: analysis.argumentOutputWrites,
    outputComputation: analysis.outputComputation,
    tailCallTargetHex: analysis.tailCallTargetHex,
    semanticConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "installed callback body is decoded, but the runtime callsite/consumer that invokes object callback slots and maps outputs into projectile render state is not recovered",
  };
}

function summarize(items, sourceRows) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    sourceCallbackInstallerRows: sourceRows.length,
    uniqueCallbackBodies: items.length,
    scalarReturnCallbackRows: items.filter((item) => item.callbackBodyClass === "scalar-return").length,
    argumentOutputWriterRows: items.filter((item) => item.callbackBodyClass === "argument-output-writer").length,
    unclassifiedCallbackRows: items.filter((item) => item.callbackBodyClass === "unclassified-callback-body").length,
    ownerPointerReadRows: items.filter((item) => item.ownerPointerReadCount > 0).length,
    helperCallRows: items.reduce((sum, item) => sum + item.helperCallTargetHexes.length, 0),
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentTokenChildCallbackBodyAudit({
  childObjectChainAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRows = callbackInstallerRows(childObjectChainAudit);
  const items = groupCallbackRows(sourceRows)
    .map((group) => rowForCallbackGroup(group, { disassembleFunction }))
    .sort(
      (left, right) =>
        parseHex(left.installedCallbackFunctionHex) - parseHex(right.installedCallbackFunctionHex) ||
        parseHex(left.installedCallbackSlotOffsetHex) - parseHex(right.installedCallbackSlotOffsetHex),
    );
  return {
    generatedAt,
    source: {
      childObjectChainAuditPath: defaultChildObjectChainAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child callback body audit; installed callback computations do not promote rendering until runtime callers/consumers are recovered",
    summary: summarize(items, sourceRows),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    installedCallbackFunctionHex: item.installedCallbackFunctionHex,
    installedCallbackSlotOffsetHex: item.installedCallbackSlotOffsetHex,
    sourceCallbackInstallerRows: item.sourceCallbackInstallerRows,
    sourceTargetNames: item.sourceTargetNames,
    sourceObjectAppendCallsites: item.sourceObjectAppendCallsites,
    sourceInstallerFunctionHexes: item.sourceInstallerFunctionHexes,
    callbackBodyClass: item.callbackBodyClass,
    callbackFunctionStartHex: item.callbackFunctionStartHex,
    callbackFunctionEndHex: item.callbackFunctionEndHex,
    callbackInstructionRows: item.callbackInstructionRows,
    helperCallTargetHexes: item.helperCallTargetHexes,
    helperResultFloatReadOffsets: item.helperResultFloatReadOffsets,
    ownerPointerReadCount: item.ownerPointerReadCount,
    argumentOutputWrites: item.argumentOutputWrites,
    outputComputation: item.outputComputation,
    tailCallTargetHex: item.tailCallTargetHex,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildCallbackBodyAudit({
  childObjectChainAuditPath = defaultChildObjectChainAuditPath,
  binaryPath = defaultBinaryPath,
  childObjectChainAudit = readJson(childObjectChainAuditPath, { items: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildCallbackBodyAudit({
    childObjectChainAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { childObjectChainAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "installedCallbackFunctionHex",
    "installedCallbackSlotOffsetHex",
    "sourceCallbackInstallerRows",
    "sourceTargetNames",
    "sourceObjectAppendCallsites",
    "sourceInstallerFunctionHexes",
    "callbackBodyClass",
    "callbackFunctionStartHex",
    "callbackFunctionEndHex",
    "callbackInstructionRows",
    "helperCallTargetHexes",
    "helperResultFloatReadOffsets",
    "ownerPointerReadCount",
    "argumentOutputWrites",
    "outputComputation",
    "tailCallTargetHex",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildCallbackBodyAudit({
    childObjectChainAuditPath: optionValue(args, "--child-object-chain-audit", defaultChildObjectChainAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildCallbackBodyAudit,
  exportProjectileCurrentTokenChildCallbackBodyAudit,
  readTsv,
};
