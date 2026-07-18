#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentTokenWindowAuditPath = "extracted/reports/effect_projectile_current_token_window_audit.json";
const defaultCurrentFieldReaderCandidateAuditPath =
  "extracted/reports/effect_projectile_current_field_reader_candidate_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-field-reader-callsite-context-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_field_reader_callsite_context_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_field_reader_callsite_context_audit.tsv";

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

function candidateByTarget(currentFieldReaderCandidateAudit) {
  const result = new Map();
  for (const item of currentFieldReaderCandidateAudit.items || []) {
    const branchTargetHex = normalizeHex(item.branchTargetHex);
    if (!branchTargetHex) continue;
    result.set(branchTargetHex, {
      branchTargetHex,
      candidateStatus: item.status || "",
      candidateSpecificReadOffsets: pipeValues(item.specificReadOffsets).map(normalizeHex).filter(Boolean),
      candidateGenericReadOffsets: pipeValues(item.genericReadOffsets).map(normalizeHex).filter(Boolean),
    });
  }
  return result;
}

function branchCallTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function destinationRegisterForLoad(instruction) {
  if (!instruction || !/^ld/.test(instruction.mnemonic)) return "";
  const match = instruction.operands.match(/^([wx]\d+|s\d+|d\d+),\s*\[(x\d+)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/);
  return match ? match[1].toLowerCase().replace(/^w/, "x") : "";
}

function offsetForLoad(instruction) {
  const match = String(instruction?.operands || "").match(
    /^([wx]\d+|s\d+|d\d+),\s*\[(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)\]/,
  );
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

function statusForCandidate(candidate) {
  return candidate.candidateSpecificReadOffsets.length
    ? "current-field-reader-callsite-specific"
    : "current-field-reader-callsite-generic-only";
}

function rowsForTokenWindow(tokenWindow, { readerByTarget, disassembleWindow, disassemblyCache }) {
  const readerTargets = pipeValues(tokenWindow.branchCallTargets).map(normalizeHex).filter((target) => readerByTarget.has(target));
  if (!readerTargets.length || !tokenWindow.functionStartHex) return [];
  const cacheKey = `${tokenWindow.functionStartHex}-${tokenWindow.functionEndHex}`;
  const disassembly =
    disassemblyCache.get(cacheKey) ||
    disassembleWindow(tokenWindow.functionStartHex, tokenWindow.functionEndHex, tokenWindow);
  disassemblyCache.set(cacheKey, disassembly);
  const instructions = parseObjdumpInstructions(disassembly);
  const rows = [];

  for (let index = 0; index < instructions.length; index += 1) {
    const target = branchCallTarget(instructions[index]);
    const candidate = readerByTarget.get(target);
    if (!candidate) continue;

    const argument = resolveX0Argument(instructions, index);
    const previousInstructions = instructions.slice(0, index);
    const followingInstructions = instructions.slice(index + 1);
    const followingContextInstructions = instructions.slice(index + 1, index + 17);

    rows.push({
      status: statusForCandidate(candidate),
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
      candidateStatus: candidate.candidateStatus,
      candidateSpecificReadOffsets: candidate.candidateSpecificReadOffsets,
      candidateGenericReadOffsets: candidate.candidateGenericReadOffsets,
      sourceRuntimeFieldOffsets: pipeValues(tokenWindow.runtimeFieldOffsets).map(normalizeHex).filter(Boolean),
      sourceVtableOffsets: pipeValues(tokenWindow.vtableOffsets).map(normalizeHex).filter(Boolean),
      previousBranchTargets: limited(previousInstructions.map(branchCallTarget).filter(Boolean), 16),
      followingBranchTargets: limited(followingInstructions.map(branchCallTarget).filter(Boolean), 16),
      followingVtableOffsets: vtableOffsetsForInstructions(followingContextInstructions),
      followingInstructionTexts: followingContextInstructions.slice(0, 12).map((instruction) => instruction.text),
      currentConsumerResolved: false,
      renderPromotionAllowed: false,
      blocker:
        "current reader helper callsite context is recovered, but field meanings and downstream executor ownership are not proven",
    });
  }
  return rows;
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    readerCallsiteRows: items.length,
    specificReaderCallsiteRows: items.filter((item) => item.status === "current-field-reader-callsite-specific").length,
    genericOnlyReaderCallsiteRows: items.filter((item) => item.status === "current-field-reader-callsite-generic-only").length,
    argumentBaseRecoveredRows: items.filter((item) => ["base-plus-offset", "base-register"].includes(item.argumentKind)).length,
    loadedPointerRows: items.filter((item) => item.argumentKind === "loaded-pointer").length,
    unresolvedArgumentRows: items.filter((item) => item.argumentKind === "unresolved").length,
    previousBranchRows: items.reduce((sum, item) => sum + item.previousBranchTargets.length, 0),
    followingBranchRows: items.reduce((sum, item) => sum + item.followingBranchTargets.length, 0),
    followingVtableCallRows: items.reduce((sum, item) => sum + item.followingVtableOffsets.length, 0),
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentFieldReaderCallsiteContextAudit({
  currentTokenWindowAudit = {},
  currentFieldReaderCandidateAudit = {},
  disassembleWindow = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const readerByTarget = candidateByTarget(currentFieldReaderCandidateAudit);
  const disassemblyCache = new Map();
  const items = (currentTokenWindowAudit.items || [])
    .flatMap((tokenWindow) => rowsForTokenWindow(tokenWindow, { readerByTarget, disassembleWindow, disassemblyCache }))
    .sort(
      (left, right) =>
        parseHex(left.tokenFunctionStartHex) - parseHex(right.tokenFunctionStartHex) ||
        parseHex(left.callsiteAddressHex) - parseHex(right.callsiteAddressHex) ||
        left.targetName.localeCompare(right.targetName),
    );

  return {
    generatedAt,
    source: {
      currentTokenWindowAuditPath: defaultCurrentTokenWindowAuditPath,
      currentFieldReaderCandidateAuditPath: defaultCurrentFieldReaderCandidateAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile field-reader callsite context audit; caller context does not promote rendering until executor semantics are recovered",
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
    candidateStatus: item.candidateStatus,
    candidateSpecificReadOffsets: item.candidateSpecificReadOffsets,
    candidateGenericReadOffsets: item.candidateGenericReadOffsets,
    sourceRuntimeFieldOffsets: item.sourceRuntimeFieldOffsets,
    sourceVtableOffsets: item.sourceVtableOffsets,
    previousBranchTargets: item.previousBranchTargets,
    followingBranchTargets: item.followingBranchTargets,
    followingVtableOffsets: item.followingVtableOffsets,
    followingInstructionTexts: item.followingInstructionTexts,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentFieldReaderCallsiteContextAudit({
  currentTokenWindowAuditPath = defaultCurrentTokenWindowAuditPath,
  currentFieldReaderCandidateAuditPath = defaultCurrentFieldReaderCandidateAuditPath,
  binaryPath = defaultBinaryPath,
  currentTokenWindowAudit = readJson(currentTokenWindowAuditPath, {}),
  currentFieldReaderCandidateAudit = readJson(currentFieldReaderCandidateAuditPath, {}),
  disassembleWindow = (startAddressHex, endAddressHex) =>
    defaultDisassembleWindow(binaryPath, startAddressHex, endAddressHex),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentFieldReaderCallsiteContextAudit({
    currentTokenWindowAudit,
    currentFieldReaderCandidateAudit,
    disassembleWindow,
    generatedAt,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(viewerOut, JSON.stringify(audit, null, 2));
  fs.writeFileSync(reportOut, JSON.stringify(audit, null, 2));
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
    "candidateStatus",
    "candidateSpecificReadOffsets",
    "candidateGenericReadOffsets",
    "sourceRuntimeFieldOffsets",
    "sourceVtableOffsets",
    "previousBranchTargets",
    "followingBranchTargets",
    "followingVtableOffsets",
    "followingInstructionTexts",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentFieldReaderCallsiteContextAudit({
    currentTokenWindowAuditPath: optionValue(args, "--current-token-window-audit", defaultCurrentTokenWindowAuditPath),
    currentFieldReaderCandidateAuditPath: optionValue(
      args,
      "--current-field-reader-candidate-audit",
      defaultCurrentFieldReaderCandidateAuditPath,
    ),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentFieldReaderCallsiteContextAudit,
  exportProjectileCurrentFieldReaderCallsiteContextAudit,
  readTsv,
};
