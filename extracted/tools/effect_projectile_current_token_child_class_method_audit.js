#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultChildObjectChainAuditPath =
  "extracted/reports/effect_projectile_current_token_child_object_chain_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-class-method-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_class_method_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_class_method_audit.tsv";

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

function defaultReadRelativeRelocations(binaryPath) {
  const result = spawnSync("objdump", ["-R", binaryPath], { encoding: "utf8", maxBuffer: 96 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "objdump -R failed");
  }
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([0-9a-f]+)\s+R_AARCH64_RELATIVE\s+\*ABS\*\+0x([0-9a-f]+)/i);
      if (!match) return null;
      return { addressHex: hex(Number.parseInt(match[1], 16)), targetHex: hex(Number.parseInt(match[2], 16)) };
    })
    .filter(Boolean);
}

function relocationMap(relativeRelocations) {
  const result = new Map();
  for (const row of relativeRelocations || []) {
    const addressHex = normalizeHex(row.addressHex ?? row.address);
    const targetHex = normalizeHex(row.targetHex ?? row.target);
    if (addressHex && targetHex) result.set(addressHex, targetHex);
  }
  return result;
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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x360) {
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

function boundedMethodInstructions(disassembly, startAddressHex) {
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

function constantRegisterValues(instructions) {
  const constants = new Map();
  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "adrp") {
      const match = operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)(?:\s|$)/);
      if (match) constants.set(match[1].toLowerCase(), parseHex(match[2]));
      continue;
    }
    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && constants.has(match[2].toLowerCase())) {
        constants.set(match[1].toLowerCase(), constants.get(match[2].toLowerCase()) + parseNumber(match[3]));
      }
      continue;
    }
    if (/^(ldr|mov|bl|blr)$/.test(instruction.mnemonic)) {
      const dst = valueRegister(operands);
      if (dst?.startsWith("x")) constants.delete(dst);
    }
  }
  return constants;
}

function analyzeMethodInstructions(instructions) {
  const aliases = new Map([
    ["x0", "object"],
    ["x1", "argument1"],
  ]);
  const constants = constantRegisterValues(instructions);
  const objectFieldReadOffsets = [];
  const objectFieldWriteOffsets = [];
  const callbackSlotReadOffsets = [];
  const callbackInstallerWrites = [];
  const payloadArgumentReadInstructions = [];

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
      if (match && aliases.get(match[2].toLowerCase()) === "object" && parseNumber(match[3]) === 0x18) {
        aliases.set(match[1].toLowerCase(), "payload-object+0x18");
      }
      continue;
    }

    const memory = memoryBaseAndOffset(operands);
    if (!memory) continue;
    const baseAlias = aliases.get(memory.baseRegister);
    const isLoad = instruction.mnemonic.startsWith("ld");
    const isStore = instruction.mnemonic.startsWith("st");
    if (baseAlias === "object") {
      if (isLoad) objectFieldReadOffsets.push(memory.offsetHex);
      if (isStore) objectFieldWriteOffsets.push(memory.offsetHex);
      if (isLoad && ["0x78", "0x88"].includes(memory.offsetHex)) callbackSlotReadOffsets.push(memory.offsetHex);
      if (isStore && ["0x78", "0x88"].includes(memory.offsetHex)) {
        const sourceRegister = valueRegister(operands);
        const callbackAddressHex = hex(constants.get(sourceRegister));
        if (callbackAddressHex) callbackInstallerWrites.push(`object+${memory.offsetHex}=${callbackAddressHex}`);
      }
    }
    if (baseAlias === "argument1" && isLoad) {
      payloadArgumentReadInstructions.push(instruction.text);
    }

    const dst = valueRegister(operands);
    if (isLoad && dst?.startsWith("x")) aliases.delete(dst);
  }

  const helperCallTargetHexes = uniqueInOrder((instructions || []).map(callTarget).filter(Boolean));
  const uniqueReads = uniqueInOrder(objectFieldReadOffsets);
  const uniqueWrites = uniqueInOrder(objectFieldWriteOffsets);
  const uniqueCallbackSlotReads = uniqueInOrder(callbackSlotReadOffsets);
  const uniqueCallbackInstallerWrites = uniqueInOrder(callbackInstallerWrites);

  let methodClass = "class-method-unclassified";
  if (instructions.length === 1 && instructions[0].mnemonic === "ret") {
    methodClass = "ret-only";
  } else if (uniqueCallbackInstallerWrites.length) {
    methodClass = "callback-installer";
  } else if (uniqueWrites.includes("0xc8") && (uniqueWrites.includes("0x40") || uniqueReads.includes("0xc8"))) {
    methodClass = "payload-mode-setter";
  } else if (
    helperCallTargetHexes.length &&
    (uniqueReads.includes("0xd0") || uniqueReads.includes("0xc8") || uniqueWrites.includes("0xa8"))
  ) {
    methodClass = "runtime-evaluator-candidate";
  } else if (uniqueReads.includes("0xd0") || uniqueReads.includes("0xc8") || uniqueWrites.includes("0xd0")) {
    methodClass = "runtime-state-method-candidate";
  }

  return {
    methodClass,
    objectFieldReadOffsets: uniqueReads,
    objectFieldWriteOffsets: uniqueWrites,
    callbackSlotReadOffsets: uniqueCallbackSlotReads,
    callbackInstallerWrites: uniqueCallbackInstallerWrites,
    payloadArgumentReadInstructions: uniqueInOrder(payloadArgumentReadInstructions),
    helperCallTargetHexes,
  };
}

function statusForMethodClass(methodClass) {
  if (methodClass === "ret-only") return "token-child-class-method-noop";
  if (methodClass === "callback-installer") return "token-child-class-method-callback-installer";
  if (methodClass === "payload-mode-setter") return "token-child-class-method-payload-mode-setter";
  if (methodClass === "runtime-evaluator-candidate") return "token-child-class-method-runtime-evaluator-candidate";
  if (methodClass === "runtime-state-method-candidate") return "token-child-class-method-runtime-state-candidate";
  if (methodClass === "disassembly-missing") return "token-child-class-method-disassembly-missing";
  return "token-child-class-method-unclassified";
}

function groupSourceRowsByVtable(childObjectChainAudit) {
  const groups = new Map();
  for (const row of childObjectChainAudit.items || []) {
    const vtable = normalizeHex(row.primaryVtableAddressHex);
    if (!vtable) continue;
    const rows = groups.get(vtable) || [];
    rows.push(row);
    groups.set(vtable, rows);
  }
  return [...groups.entries()].sort((left, right) => parseHex(left[0]) - parseHex(right[0]));
}

function rowsForVtable(vtableAddressHex, sourceRows, { relocations, disassembleFunction, maxSlotOffset }) {
  const rows = [];
  const vtableAddress = parseHex(vtableAddressHex);
  for (let offset = 0; offset <= maxSlotOffset; offset += 8) {
    const slotAddressHex = hex(vtableAddress + offset);
    const methodFunctionHex = relocations.get(slotAddressHex);
    if (!methodFunctionHex) continue;
    const vtableSlotOffsetHex = hex(offset);
    const matchingSourceRows = sourceRows.filter(
      (row) => normalizeHex(row.followingVtableSlotOffsetHex) === vtableSlotOffsetHex,
    );
    const instructions = boundedMethodInstructions(disassembleFunction(methodFunctionHex, 0x360), methodFunctionHex);
    const analysis = instructions.length
      ? analyzeMethodInstructions(instructions)
      : { methodClass: "disassembly-missing" };
    rows.push({
      status: statusForMethodClass(analysis.methodClass),
      primaryVtableAddressHex: vtableAddressHex,
      vtableSlotOffsetHex,
      vtableSlotAddressHex: slotAddressHex,
      methodFunctionHex,
      sourceFollowingSlotRows: matchingSourceRows.length,
      sourceTargetNames: uniqueInOrder(matchingSourceRows.map((row) => row.targetName)),
      sourceObjectAppendCallsites: uniqueInOrder(matchingSourceRows.map((row) => row.objectAppendCallsiteAddressHex)),
      sourceFollowingSlotClasses: uniqueInOrder(
        matchingSourceRows.map((row) => row.resolvedFollowingSlotFunctionClass),
      ),
      methodClass: analysis.methodClass,
      methodFunctionStartHex: instructions[0]?.addressHex || "",
      methodFunctionEndHex: instructions.at(-1)?.addressHex || "",
      methodInstructionRows: instructions.length,
      methodInstructions: instructions.map((instruction) => instruction.text),
      objectFieldReadOffsets: analysis.objectFieldReadOffsets || [],
      objectFieldWriteOffsets: analysis.objectFieldWriteOffsets || [],
      callbackSlotReadOffsets: analysis.callbackSlotReadOffsets || [],
      callbackInstallerWrites: analysis.callbackInstallerWrites || [],
      payloadArgumentReadInstructions: analysis.payloadArgumentReadInstructions || [],
      helperCallTargetHexes: analysis.helperCallTargetHexes || [],
      semanticConsumerResolved: false,
      renderPromotionAllowed: false,
      blocker:
        "current token child class method is inventoried, but callback invocation and downstream projectile placement/render consumer semantics are not recovered",
    });
  }
  return rows;
}

function summarize(items, childObjectRows, vtableRows) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    uniquePrimaryVtables: vtableRows.length,
    sourceChildObjectRows: childObjectRows.length,
    sourceMatchedMethodRows: items.filter((item) => item.sourceFollowingSlotRows > 0).length,
    callbackInstallerMethodRows: items.filter((item) => item.methodClass === "callback-installer").length,
    payloadModeSetterMethodRows: items.filter((item) => item.methodClass === "payload-mode-setter").length,
    runtimeEvaluatorCandidateRows: items.filter((item) => item.methodClass === "runtime-evaluator-candidate").length,
    runtimeStateCandidateRows: items.filter((item) => item.methodClass === "runtime-state-method-candidate").length,
    callbackSlotReaderRows: items.filter((item) => item.callbackSlotReadOffsets.length > 0).length,
    helperCallRows: items.reduce((sum, item) => sum + item.helperCallTargetHexes.length, 0),
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentTokenChildClassMethodAudit({
  childObjectChainAudit = {},
  relativeRelocations = [],
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
  maxSlotOffset = 0xf8,
} = {}) {
  const childObjectRows = childObjectChainAudit.items || [];
  const relocations = relocationMap(relativeRelocations);
  const vtableRows = groupSourceRowsByVtable(childObjectChainAudit);
  const items = vtableRows
    .flatMap(([vtableAddressHex, sourceRows]) =>
      rowsForVtable(vtableAddressHex, sourceRows, { relocations, disassembleFunction, maxSlotOffset }),
    )
    .sort(
      (left, right) =>
        parseHex(left.primaryVtableAddressHex) - parseHex(right.primaryVtableAddressHex) ||
        parseHex(left.vtableSlotOffsetHex) - parseHex(right.vtableSlotOffsetHex),
    );
  return {
    generatedAt,
    source: {
      childObjectChainAuditPath: defaultChildObjectChainAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child class-method audit; vtable method inventory does not promote rendering until callback invocation and downstream consumers are recovered",
    summary: summarize(items, childObjectRows, vtableRows),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    primaryVtableAddressHex: item.primaryVtableAddressHex,
    vtableSlotOffsetHex: item.vtableSlotOffsetHex,
    vtableSlotAddressHex: item.vtableSlotAddressHex,
    methodFunctionHex: item.methodFunctionHex,
    sourceFollowingSlotRows: item.sourceFollowingSlotRows,
    sourceTargetNames: item.sourceTargetNames,
    sourceObjectAppendCallsites: item.sourceObjectAppendCallsites,
    sourceFollowingSlotClasses: item.sourceFollowingSlotClasses,
    methodClass: item.methodClass,
    methodFunctionStartHex: item.methodFunctionStartHex,
    methodFunctionEndHex: item.methodFunctionEndHex,
    methodInstructionRows: item.methodInstructionRows,
    objectFieldReadOffsets: item.objectFieldReadOffsets,
    objectFieldWriteOffsets: item.objectFieldWriteOffsets,
    callbackSlotReadOffsets: item.callbackSlotReadOffsets,
    callbackInstallerWrites: item.callbackInstallerWrites,
    payloadArgumentReadInstructions: item.payloadArgumentReadInstructions,
    helperCallTargetHexes: item.helperCallTargetHexes,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildClassMethodAudit({
  childObjectChainAuditPath = defaultChildObjectChainAuditPath,
  binaryPath = defaultBinaryPath,
  childObjectChainAudit = readJson(childObjectChainAuditPath, { items: [] }),
  relativeRelocations = defaultReadRelativeRelocations(binaryPath),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  maxSlotOffset = 0xf8,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildClassMethodAudit({
    childObjectChainAudit,
    relativeRelocations,
    disassembleFunction,
    generatedAt,
    maxSlotOffset,
  });
  audit.source = { childObjectChainAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "primaryVtableAddressHex",
    "vtableSlotOffsetHex",
    "vtableSlotAddressHex",
    "methodFunctionHex",
    "sourceFollowingSlotRows",
    "sourceTargetNames",
    "sourceObjectAppendCallsites",
    "sourceFollowingSlotClasses",
    "methodClass",
    "methodFunctionStartHex",
    "methodFunctionEndHex",
    "methodInstructionRows",
    "objectFieldReadOffsets",
    "objectFieldWriteOffsets",
    "callbackSlotReadOffsets",
    "callbackInstallerWrites",
    "payloadArgumentReadInstructions",
    "helperCallTargetHexes",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildClassMethodAudit({
    childObjectChainAuditPath: optionValue(args, "--child-object-chain-audit", defaultChildObjectChainAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildClassMethodAudit,
  exportProjectileCurrentTokenChildClassMethodAudit,
  readTsv,
};
