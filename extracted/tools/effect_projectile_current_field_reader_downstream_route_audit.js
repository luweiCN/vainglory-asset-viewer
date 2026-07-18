#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentFieldReaderCallsiteContextAuditPath =
  "extracted/reports/effect_projectile_current_field_reader_callsite_context_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-field-reader-downstream-route-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_field_reader_downstream_route_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_field_reader_downstream_route_audit.tsv";

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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x140) {
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

function defaultReadRelativeRelocations(binaryPath) {
  const result = spawnSync("objdump", ["-R", binaryPath], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
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

function branchCallTargets(instructions) {
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => instruction.mnemonic === "bl")
      .map((instruction) => normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "")),
  );
}

function fieldOffsetsForBase(instructions, baseRegister) {
  const regex = new RegExp(`\\[${baseRegister}(?:,\\s*#(0x[0-9a-fA-F]+|\\d+))?\\]`);
  return uniqueInOrder(
    (instructions || [])
      .filter((instruction) => /^(ldr|str|stp)$/.test(instruction.mnemonic))
      .map((instruction) => {
        const match = instruction.operands.match(regex);
        return match ? hex(match[1] ? parseNumber(match[1]) : 0) : "";
      })
      .filter(Boolean),
  );
}

function trackConstantRegisters(instructions) {
  const constants = new Map();
  const primaryStores = [];
  const secondaryStores = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "adrp") {
      const match = operands.match(/^(x\d+),\s*(0x[0-9a-fA-F]+)$/);
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
    if (instruction.mnemonic === "str") {
      const match = operands.match(/^(x\d+),\s*\[x8(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]$/);
      if (!match || !constants.has(match[1].toLowerCase())) continue;
      const store = {
        register: match[1].toLowerCase(),
        offsetHex: match[2] ? hex(parseNumber(match[2])) : "0x0",
        valueHex: hex(constants.get(match[1].toLowerCase())),
        instructionText: instruction.text,
      };
      if (store.offsetHex === "0x0") primaryStores.push(store);
      if (store.offsetHex === "0x10") secondaryStores.push(store);
      continue;
    }
    if (instruction.mnemonic === "stp") {
      const match = operands.match(/^(x\d+),\s*xzr,\s*\[x8\]$/);
      if (!match || !constants.has(match[1].toLowerCase())) continue;
      primaryStores.push({
        register: match[1].toLowerCase(),
        offsetHex: "0x0",
        valueHex: hex(constants.get(match[1].toLowerCase())),
        instructionText: instruction.text,
      });
    }
  }

  return {
    primaryVtableAddressHex: primaryStores.at(-1)?.valueHex || "",
    secondaryVtableAddressHex: secondaryStores.at(-1)?.valueHex || "",
    primaryVtableStoreInstruction: primaryStores.at(-1)?.instructionText || "",
    secondaryVtableStoreInstruction: secondaryStores.at(-1)?.instructionText || "",
  };
}

function classifyResolvedFunction(instructions) {
  if (!instructions.length) return { className: "missing-disassembly", accessorOffsetHex: "" };
  const first = instructions[0];
  if (first.mnemonic === "ret") return { className: "ret-only", accessorOffsetHex: "" };
  if (first.mnemonic === "b" && first.operands.includes("_ZdlPv")) return { className: "delete-branch", accessorOffsetHex: "" };
  if (first.mnemonic === "add") {
    const match = first.operands.match(/^x0,\s*x0,\s*#(0x[0-9a-fA-F]+|\d+)$/);
    if (match && instructions[1]?.mnemonic === "ret") {
      return { className: "accessor-add-x0", accessorOffsetHex: hex(parseNumber(match[1])) };
    }
  }
  return { className: "unclassified-function", accessorOffsetHex: "" };
}

function analyzeContainerAppend(instructions) {
  return {
    containerAllocatorTargets: branchCallTargets(instructions),
    containerListOffsets: fieldOffsetsForBase(instructions, "x19"),
  };
}

function analyzeObjectAppend(instructions) {
  return {
    objectAllocatorTargetHex: branchCallTargets(instructions)[0] || "",
    objectListOffsets: fieldOffsetsForBase(instructions, "x19"),
  };
}

function analyzeAllocatorVtableStores(allocatorTargetHex, { disassembleFunction }) {
  if (!allocatorTargetHex) {
    return {
      objectAllocatorBodyTargetHex: "",
      primaryVtableAddressHex: "",
      secondaryVtableAddressHex: "",
      primaryVtableStoreInstruction: "",
      secondaryVtableStoreInstruction: "",
    };
  }
  const wrapperInstructions = boundedFunctionInstructions(disassembleFunction(allocatorTargetHex), allocatorTargetHex);
  const wrapperStores = trackConstantRegisters(wrapperInstructions);
  if (wrapperStores.primaryVtableAddressHex) {
    return {
      objectAllocatorBodyTargetHex: allocatorTargetHex,
      ...wrapperStores,
    };
  }

  const bodyTargetHex = branchCallTargets(wrapperInstructions)[0] || "";
  if (!bodyTargetHex) {
    return {
      objectAllocatorBodyTargetHex: "",
      ...wrapperStores,
    };
  }

  const bodyInstructions = boundedFunctionInstructions(disassembleFunction(bodyTargetHex), bodyTargetHex);
  return {
    objectAllocatorBodyTargetHex: bodyTargetHex,
    ...trackConstantRegisters(bodyInstructions),
  };
}

function rowForCallsite(item, { disassembleFunction, relocations }) {
  if (item.status !== "current-field-reader-callsite-specific") return null;
  const followingBranchTargets = pipeValues(item.followingBranchTargets).map(normalizeHex).filter(Boolean);
  const containerAppendTargetHex = followingBranchTargets[0] || "";
  const objectAppendTargetHex = followingBranchTargets[1] || "";
  const followingVtableSlotOffsetHex = normalizeHex(pipeValues(item.followingVtableOffsets)[0] || "");

  const containerInstructions = containerAppendTargetHex
    ? boundedFunctionInstructions(disassembleFunction(containerAppendTargetHex), containerAppendTargetHex)
    : [];
  const objectAppendInstructions = objectAppendTargetHex
    ? boundedFunctionInstructions(disassembleFunction(objectAppendTargetHex), objectAppendTargetHex)
    : [];
  const container = analyzeContainerAppend(containerInstructions);
  const object = analyzeObjectAppend(objectAppendInstructions);
  const vtableStores = analyzeAllocatorVtableStores(object.objectAllocatorTargetHex, { disassembleFunction });
  const slotAddress = parseHex(vtableStores.primaryVtableAddressHex) + parseHex(followingVtableSlotOffsetHex);
  const resolvedVtableSlotAddressHex = hex(slotAddress);
  const resolvedVtableFunctionHex = relocations.get(resolvedVtableSlotAddressHex) || "";
  const resolvedFunctionInstructions = resolvedVtableFunctionHex
    ? boundedFunctionInstructions(disassembleFunction(resolvedVtableFunctionHex, 0x80), resolvedVtableFunctionHex)
    : [];
  const resolvedClass = classifyResolvedFunction(resolvedFunctionInstructions);
  const hasResolvedAccessor = resolvedClass.className === "accessor-add-x0";

  return {
    status: hasResolvedAccessor ? "field-reader-downstream-accessor-only" : "field-reader-downstream-unresolved",
    targetName: item.targetName || "",
    tokenFunctionStartHex: item.tokenFunctionStartHex || "",
    readerBranchTargetHex: item.branchTargetHex || "",
    readerCallsiteAddressHex: item.callsiteAddressHex || "",
    candidateSpecificReadOffsets: pipeValues(item.candidateSpecificReadOffsets).map(normalizeHex).filter(Boolean),
    containerAppendTargetHex,
    containerAllocatorTargets: container.containerAllocatorTargets,
    containerListOffsets: container.containerListOffsets,
    objectAppendTargetHex,
    objectAllocatorTargetHex: object.objectAllocatorTargetHex,
    objectAllocatorBodyTargetHex: vtableStores.objectAllocatorBodyTargetHex,
    objectListOffsets: object.objectListOffsets,
    primaryVtableAddressHex: vtableStores.primaryVtableAddressHex,
    secondaryVtableAddressHex: vtableStores.secondaryVtableAddressHex,
    primaryVtableStoreInstruction: vtableStores.primaryVtableStoreInstruction,
    secondaryVtableStoreInstruction: vtableStores.secondaryVtableStoreInstruction,
    followingVtableSlotOffsetHex,
    resolvedVtableSlotAddressHex,
    resolvedVtableFunctionHex,
    resolvedVtableFunctionClass: resolvedClass.className,
    resolvedVtableAccessorOffsetHex: resolvedClass.accessorOffsetHex,
    resolvedVtableFunctionInstructions: resolvedFunctionInstructions.slice(0, 6).map((instruction) => instruction.text),
    currentConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "downstream reader route resolves to object/list/accessor mechanics, not proven projectile placement, timing, target, impact, or render executor semantics",
  };
}

function summarize(items) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    specificRouteRows: items.length,
    containerAppendRows: items.filter((item) => item.containerAppendTargetHex).length,
    objectAppendRows: items.filter((item) => item.objectAppendTargetHex).length,
    objectAllocatorRows: items.filter((item) => item.objectAllocatorTargetHex).length,
    primaryVtableResolvedRows: items.filter((item) => item.primaryVtableAddressHex).length,
    vtableSlotResolvedRows: items.filter((item) => item.resolvedVtableFunctionHex).length,
    accessorOnlySlotRows: items.filter((item) => item.resolvedVtableFunctionClass === "accessor-add-x0").length,
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentFieldReaderDownstreamRouteAudit({
  currentFieldReaderCallsiteContextAudit = {},
  disassembleFunction = () => "",
  relativeRelocations = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const relocations = relocationMap(relativeRelocations);
  const items = (currentFieldReaderCallsiteContextAudit.items || [])
    .map((item) => rowForCallsite(item, { disassembleFunction, relocations }))
    .filter(Boolean)
    .sort(
      (left, right) =>
        parseHex(left.tokenFunctionStartHex) - parseHex(right.tokenFunctionStartHex) ||
        parseHex(left.readerCallsiteAddressHex) - parseHex(right.readerCallsiteAddressHex) ||
        left.targetName.localeCompare(right.targetName),
    );
  return {
    generatedAt,
    source: {
      currentFieldReaderCallsiteContextAuditPath: defaultCurrentFieldReaderCallsiteContextAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile field-reader downstream route audit; resolved object/list/accessor mechanics do not promote rendering",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    targetName: item.targetName,
    tokenFunctionStartHex: item.tokenFunctionStartHex,
    readerBranchTargetHex: item.readerBranchTargetHex,
    readerCallsiteAddressHex: item.readerCallsiteAddressHex,
    candidateSpecificReadOffsets: item.candidateSpecificReadOffsets,
    containerAppendTargetHex: item.containerAppendTargetHex,
    containerAllocatorTargets: item.containerAllocatorTargets,
    containerListOffsets: item.containerListOffsets,
    objectAppendTargetHex: item.objectAppendTargetHex,
    objectAllocatorTargetHex: item.objectAllocatorTargetHex,
    objectAllocatorBodyTargetHex: item.objectAllocatorBodyTargetHex,
    objectListOffsets: item.objectListOffsets,
    primaryVtableAddressHex: item.primaryVtableAddressHex,
    secondaryVtableAddressHex: item.secondaryVtableAddressHex,
    followingVtableSlotOffsetHex: item.followingVtableSlotOffsetHex,
    resolvedVtableSlotAddressHex: item.resolvedVtableSlotAddressHex,
    resolvedVtableFunctionHex: item.resolvedVtableFunctionHex,
    resolvedVtableFunctionClass: item.resolvedVtableFunctionClass,
    resolvedVtableAccessorOffsetHex: item.resolvedVtableAccessorOffsetHex,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentFieldReaderDownstreamRouteAudit({
  currentFieldReaderCallsiteContextAuditPath = defaultCurrentFieldReaderCallsiteContextAuditPath,
  binaryPath = defaultBinaryPath,
  currentFieldReaderCallsiteContextAudit = readJson(currentFieldReaderCallsiteContextAuditPath, {}),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  relativeRelocations = defaultReadRelativeRelocations(binaryPath),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentFieldReaderDownstreamRouteAudit({
    currentFieldReaderCallsiteContextAudit,
    disassembleFunction,
    relativeRelocations,
    generatedAt,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(viewerOut, JSON.stringify(audit, null, 2));
  fs.writeFileSync(reportOut, JSON.stringify(audit, null, 2));
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "targetName",
    "tokenFunctionStartHex",
    "readerBranchTargetHex",
    "readerCallsiteAddressHex",
    "candidateSpecificReadOffsets",
    "containerAppendTargetHex",
    "containerAllocatorTargets",
    "containerListOffsets",
    "objectAppendTargetHex",
    "objectAllocatorTargetHex",
    "objectAllocatorBodyTargetHex",
    "objectListOffsets",
    "primaryVtableAddressHex",
    "secondaryVtableAddressHex",
    "followingVtableSlotOffsetHex",
    "resolvedVtableSlotAddressHex",
    "resolvedVtableFunctionHex",
    "resolvedVtableFunctionClass",
    "resolvedVtableAccessorOffsetHex",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentFieldReaderDownstreamRouteAudit({
    currentFieldReaderCallsiteContextAuditPath: optionValue(
      args,
      "--current-field-reader-callsite-context-audit",
      defaultCurrentFieldReaderCallsiteContextAuditPath,
    ),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentFieldReaderDownstreamRouteAudit,
  exportProjectileCurrentFieldReaderDownstreamRouteAudit,
  readTsv,
};
