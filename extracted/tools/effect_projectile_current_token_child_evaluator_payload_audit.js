#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultClassMethodAuditPath =
  "extracted/reports/effect_projectile_current_token_child_class_method_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-evaluator-payload-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_evaluator_payload_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_evaluator_payload_audit.tsv";

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

function parseStoredInstructionTexts(lines) {
  return (lines || [])
    .map((line) => parseObjdumpInstructionLine(line))
    .filter(Boolean);
}

function callTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function branchTarget(instruction) {
  if (!instruction?.mnemonic?.startsWith("b")) return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x520) {
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
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `objdump failed for ${addressHex}`);
  }
  return result.stdout;
}

function boundedInstructions(disassembly, startAddressHex) {
  const start = parseHex(startAddressHex);
  const instructions = parseObjdumpInstructions(disassembly).filter((instruction) => instruction.address >= start);
  const bounded = [];
  for (const instruction of instructions) {
    bounded.push(instruction);
    if (instruction.mnemonic === "ret") break;
    if (instruction.mnemonic === "b") {
      const target = parseHex(branchTarget(instruction));
      const fallsThroughToNext = target === instruction.address + 4;
      if (!fallsThroughToNext && Number.isFinite(target) && target < start) break;
    }
  }
  return bounded;
}

function memoryBaseAndOffset(operands) {
  const match = String(operands || "").match(/\[(x\d+)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/);
  if (!match) return null;
  return {
    baseRegister: match[1].toLowerCase(),
    offsetHex: hex(match[2] ? parseNumber(match[2]) : 0),
  };
}

function valueRegister(operands) {
  return String(operands || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
}

function payloadConsumerCallsFromEvaluator(evaluatorRow) {
  const aliases = new Map([
    ["x0", "parent"],
    ["x1", "argument1"],
  ]);
  const result = [];
  for (const instruction of parseStoredInstructionTexts(evaluatorRow.methodInstructions || [])) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^(x\d+),\s*(x\d+)$/);
      if (match && aliases.has(match[2].toLowerCase())) {
        aliases.set(match[1].toLowerCase(), aliases.get(match[2].toLowerCase()));
      } else if (match) {
        aliases.delete(match[1].toLowerCase());
      }
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && aliases.get(match[2].toLowerCase()) === "parent" && parseNumber(match[3]) === 0x18) {
        aliases.set(match[1].toLowerCase(), "payload-parent+0x18");
      }
      continue;
    }
    if (instruction.mnemonic === "bl") {
      const targetHex = callTarget(instruction);
      if (aliases.get("x0") === "payload-parent+0x18" && targetHex) {
        result.push({
          payloadConsumerFunctionHex: targetHex,
          payloadBaseOffsetHex: "0x0",
          sourceEvaluatorFunctionHex: evaluatorRow.methodFunctionHex,
          sourceEvaluatorVtableSlotOffsetHex: evaluatorRow.vtableSlotOffsetHex,
          sourceCallInstruction: instruction.text,
        });
      }
      aliases.delete("x0");
    }
  }
  return result;
}

function parentOffsetForPayloadOffset(payloadOffsetHex) {
  const value = parseHex(payloadOffsetHex);
  return Number.isFinite(value) ? hex(value + 0x18) : "";
}

function isLocalPayloadHelper(addressHex, ranges) {
  const value = parseHex(addressHex);
  return Number.isFinite(value) && ranges.some(([start, end]) => value >= start && value <= end);
}

function analyzePayloadConsumerInstructions(instructions, { localPayloadHelperRanges, payloadBaseOffsetHex = "0x0" }) {
  const payloadBaseOffset = parseHex(payloadBaseOffsetHex);
  const aliases = new Map([["x0", Number.isFinite(payloadBaseOffset) ? payloadBaseOffset : 0]]);
  const callbackRegisters = new Map();
  const payloadFieldReadOffsets = [];
  const payloadFieldWriteOffsets = [];
  const payloadCallbackReadOffsets = [];
  const callbackInvokeInstructions = [];
  const directCallTargets = [];
  const directCallRows = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^(x\d+),\s*(x\d+)$/);
      if (match && aliases.has(match[2].toLowerCase())) {
        aliases.set(match[1].toLowerCase(), aliases.get(match[2].toLowerCase()));
      } else if (match) {
        aliases.delete(match[1].toLowerCase());
      }
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      const baseOffset = aliases.get(match?.[2]?.toLowerCase());
      if (match && Number.isFinite(baseOffset)) {
        aliases.set(match[1].toLowerCase(), baseOffset + parseNumber(match[3]));
      }
      continue;
    }

    if (instruction.mnemonic === "bl") {
      const targetHex = callTarget(instruction);
      const x0PayloadOffset = aliases.get("x0");
      if (targetHex) {
        directCallTargets.push(targetHex);
        directCallRows.push({
          targetHex,
          payloadBaseOffsetHex: Number.isFinite(x0PayloadOffset) ? hex(x0PayloadOffset) : "",
        });
      }
      aliases.delete("x0");
      continue;
    }
    if (instruction.mnemonic === "blr") {
      const register = operands.match(/^(x\d+)$/)?.[1]?.toLowerCase();
      const payloadOffsetHex = callbackRegisters.get(register);
      if (payloadOffsetHex) {
        payloadCallbackReadOffsets.push(payloadOffsetHex);
        callbackInvokeInstructions.push(instruction.text);
      }
      continue;
    }

    const memory = memoryBaseAndOffset(operands);
    if (!memory) continue;
    const aliasOffset = aliases.get(memory.baseRegister);
    const isLoad = instruction.mnemonic.startsWith("ld");
    const isStore = instruction.mnemonic.startsWith("st");
    if (Number.isFinite(aliasOffset)) {
      const absoluteOffsetHex = hex(aliasOffset + parseHex(memory.offsetHex));
      if (isLoad) {
        payloadFieldReadOffsets.push(absoluteOffsetHex);
        const dst = valueRegister(operands);
        if (dst?.startsWith("x")) callbackRegisters.set(dst, absoluteOffsetHex);
      }
      if (isStore) payloadFieldWriteOffsets.push(absoluteOffsetHex);
    }
    const dst = valueRegister(operands);
    if (isLoad && dst?.startsWith("x") && !Number.isFinite(aliasOffset)) aliases.delete(dst);
  }

  const parentTranslatedCallbackReadOffsets = uniqueInOrder(payloadCallbackReadOffsets.map(parentOffsetForPayloadOffset));
  const parentInstalledCallbackReadOffsets = parentTranslatedCallbackReadOffsets.filter((offset) =>
    ["0x78", "0x88"].includes(offset),
  );
  return {
    payloadFieldReadOffsets: uniqueInOrder(payloadFieldReadOffsets),
    payloadFieldWriteOffsets: uniqueInOrder(payloadFieldWriteOffsets),
    payloadCallbackReadOffsets: uniqueInOrder(payloadCallbackReadOffsets),
    parentTranslatedCallbackReadOffsets,
    parentInstalledCallbackReadOffsets,
    callbackInvokeInstructions: uniqueInOrder(callbackInvokeInstructions),
    directCallTargets: uniqueInOrder(directCallTargets),
    nestedPayloadConsumerTargets: uniqueInOrder(
      directCallTargets.filter((targetHex) => isLocalPayloadHelper(targetHex, localPayloadHelperRanges)),
    ),
    nestedPayloadConsumerCalls: directCallRows.filter((row) =>
      isLocalPayloadHelper(row.targetHex, localPayloadHelperRanges),
    ),
  };
}

function rowStatus(analysis) {
  if (analysis.payloadCallbackReadOffsets.length) return "token-child-evaluator-payload-callback-reader";
  if (analysis.payloadFieldReadOffsets.length || analysis.payloadFieldWriteOffsets.length) {
    return "token-child-evaluator-payload-field-consumer";
  }
  return "token-child-evaluator-payload-consumer-unclassified";
}

function buildConsumerRows({ entryCalls, disassembleFunction, maxDepth, localPayloadHelperRanges }) {
  const queue = entryCalls.map((call) => ({
    payloadConsumerFunctionHex: call.payloadConsumerFunctionHex,
    payloadBaseOffsetHex: call.payloadBaseOffsetHex || "0x0",
    consumerDepth: 0,
    sourceCalls: [call],
  }));
  const groups = new Map();

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const key = `${current.payloadConsumerFunctionHex}|${current.payloadBaseOffsetHex}`;
    const existing = groups.get(key);
    if (existing) {
      existing.consumerDepth = Math.min(existing.consumerDepth, current.consumerDepth);
      existing.sourceCalls.push(...current.sourceCalls);
      continue;
    }
    groups.set(key, {
      payloadConsumerFunctionHex: current.payloadConsumerFunctionHex,
      payloadBaseOffsetHex: current.payloadBaseOffsetHex,
      consumerDepth: current.consumerDepth,
      sourceCalls: [...current.sourceCalls],
    });

    if (current.consumerDepth >= maxDepth) continue;
    const instructions = boundedInstructions(
      disassembleFunction(current.payloadConsumerFunctionHex, 0x520),
      current.payloadConsumerFunctionHex,
    );
    const analysis = analyzePayloadConsumerInstructions(instructions, {
      localPayloadHelperRanges,
      payloadBaseOffsetHex: current.payloadBaseOffsetHex,
    });
    for (const call of analysis.nestedPayloadConsumerCalls) {
      if (call.targetHex === current.payloadConsumerFunctionHex && call.payloadBaseOffsetHex === current.payloadBaseOffsetHex) {
        continue;
      }
      queue.push({
        payloadConsumerFunctionHex: call.targetHex,
        payloadBaseOffsetHex: call.payloadBaseOffsetHex || "0x0",
        consumerDepth: current.consumerDepth + 1,
        sourceCalls: current.sourceCalls,
      });
    }
  }

  return [...groups.values()].map((group) => {
    const instructions = boundedInstructions(
      disassembleFunction(group.payloadConsumerFunctionHex, 0x520),
      group.payloadConsumerFunctionHex,
    );
    const analysis = analyzePayloadConsumerInstructions(instructions, {
      localPayloadHelperRanges,
      payloadBaseOffsetHex: group.payloadBaseOffsetHex,
    });
    return {
      status: rowStatus(analysis),
      payloadConsumerFunctionHex: group.payloadConsumerFunctionHex,
      payloadBaseOffsetHex: group.payloadBaseOffsetHex,
      consumerDepth: group.consumerDepth,
      sourceEvaluatorFunctionHexes: uniqueInOrder(group.sourceCalls.map((call) => call.sourceEvaluatorFunctionHex)),
      sourceEvaluatorVtableSlotOffsets: uniqueInOrder(
        group.sourceCalls.map((call) => call.sourceEvaluatorVtableSlotOffsetHex),
      ),
      sourceCallInstructions: uniqueInOrder(group.sourceCalls.map((call) => call.sourceCallInstruction)),
      payloadFunctionStartHex: instructions[0]?.addressHex || "",
      payloadFunctionEndHex: instructions.at(-1)?.addressHex || "",
      payloadInstructionRows: instructions.length,
      payloadFieldReadOffsets: analysis.payloadFieldReadOffsets,
      payloadFieldWriteOffsets: analysis.payloadFieldWriteOffsets,
      payloadCallbackReadOffsets: analysis.payloadCallbackReadOffsets,
      parentTranslatedCallbackReadOffsets: analysis.parentTranslatedCallbackReadOffsets,
      parentInstalledCallbackReadOffsets: analysis.parentInstalledCallbackReadOffsets,
      callbackInvokeInstructions: analysis.callbackInvokeInstructions,
      helperCallTargetHexes: analysis.directCallTargets,
      nestedPayloadConsumerTargets: analysis.nestedPayloadConsumerTargets,
      semanticConsumerResolved: false,
      renderPromotionAllowed: false,
      blocker:
        "payload consumer callback slots are traced mechanically, but downstream emitter/locator/timing/effect semantics are not recovered",
    };
  });
}

function summarize(items, evaluatorRows, entryCalls) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    sourceEvaluatorRows: evaluatorRows.length,
    entryPayloadConsumerRows: uniqueInOrder(entryCalls.map((call) => call.payloadConsumerFunctionHex)).length,
    nestedPayloadConsumerRows: items.filter((item) => item.consumerDepth > 0).length,
    callbackSlotReaderRows: items.filter((item) => item.payloadCallbackReadOffsets.length > 0).length,
    parentInstalledCallbackSlotReaderRows: items.filter((item) => item.parentInstalledCallbackReadOffsets.length > 0)
      .length,
    helperCallRows: items.reduce((sum, item) => sum + item.helperCallTargetHexes.length, 0),
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentTokenChildEvaluatorPayloadAudit({
  classMethodAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
  maxDepth = 2,
  localPayloadHelperRanges = [[0x984000, 0x985900]],
} = {}) {
  const evaluatorRows = (classMethodAudit.items || []).filter(
    (item) => item.methodClass === "runtime-evaluator-candidate",
  );
  const entryCalls = evaluatorRows.flatMap(payloadConsumerCallsFromEvaluator);
  const items = buildConsumerRows({ entryCalls, disassembleFunction, maxDepth, localPayloadHelperRanges }).sort(
    (left, right) =>
      left.consumerDepth - right.consumerDepth ||
      parseHex(left.payloadConsumerFunctionHex) - parseHex(right.payloadConsumerFunctionHex),
  );
  return {
    generatedAt,
    source: {
      classMethodAuditPath: defaultClassMethodAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child evaluator payload audit; payload callback slot reads do not promote rendering until emitter/locator/timing/effect consumers are recovered",
    summary: summarize(items, evaluatorRows, entryCalls),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    payloadConsumerFunctionHex: item.payloadConsumerFunctionHex,
    payloadBaseOffsetHex: item.payloadBaseOffsetHex,
    consumerDepth: item.consumerDepth,
    sourceEvaluatorFunctionHexes: item.sourceEvaluatorFunctionHexes,
    sourceEvaluatorVtableSlotOffsets: item.sourceEvaluatorVtableSlotOffsets,
    sourceCallInstructions: item.sourceCallInstructions,
    payloadFunctionStartHex: item.payloadFunctionStartHex,
    payloadFunctionEndHex: item.payloadFunctionEndHex,
    payloadInstructionRows: item.payloadInstructionRows,
    payloadFieldReadOffsets: item.payloadFieldReadOffsets,
    payloadFieldWriteOffsets: item.payloadFieldWriteOffsets,
    payloadCallbackReadOffsets: item.payloadCallbackReadOffsets,
    parentTranslatedCallbackReadOffsets: item.parentTranslatedCallbackReadOffsets,
    parentInstalledCallbackReadOffsets: item.parentInstalledCallbackReadOffsets,
    callbackInvokeInstructions: item.callbackInvokeInstructions,
    helperCallTargetHexes: item.helperCallTargetHexes,
    nestedPayloadConsumerTargets: item.nestedPayloadConsumerTargets,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildEvaluatorPayloadAudit({
  classMethodAuditPath = defaultClassMethodAuditPath,
  binaryPath = defaultBinaryPath,
  classMethodAudit = readJson(classMethodAuditPath, { items: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  maxDepth = 2,
  localPayloadHelperRanges = [[0x984000, 0x985900]],
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildEvaluatorPayloadAudit({
    classMethodAudit,
    disassembleFunction,
    generatedAt,
    maxDepth,
    localPayloadHelperRanges,
  });
  audit.source = { classMethodAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "payloadConsumerFunctionHex",
    "payloadBaseOffsetHex",
    "consumerDepth",
    "sourceEvaluatorFunctionHexes",
    "sourceEvaluatorVtableSlotOffsets",
    "sourceCallInstructions",
    "payloadFunctionStartHex",
    "payloadFunctionEndHex",
    "payloadInstructionRows",
    "payloadFieldReadOffsets",
    "payloadFieldWriteOffsets",
    "payloadCallbackReadOffsets",
    "parentTranslatedCallbackReadOffsets",
    "parentInstalledCallbackReadOffsets",
    "callbackInvokeInstructions",
    "helperCallTargetHexes",
    "nestedPayloadConsumerTargets",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildEvaluatorPayloadAudit({
    classMethodAuditPath: optionValue(args, "--class-method-audit", defaultClassMethodAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildEvaluatorPayloadAudit,
  exportProjectileCurrentTokenChildEvaluatorPayloadAudit,
  readTsv,
};
