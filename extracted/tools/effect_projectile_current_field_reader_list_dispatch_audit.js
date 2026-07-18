#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultCurrentFieldReaderDownstreamRouteAuditPath =
  "extracted/reports/effect_projectile_current_field_reader_downstream_route_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-field-reader-list-dispatch-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_field_reader_list_dispatch_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_field_reader_list_dispatch_audit.tsv";

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

function pipeValues(value) {
  if (Array.isArray(value)) return uniqueInOrder(value);
  return uniqueInOrder(String(value || "").split("|").filter(Boolean));
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

function defaultDisassembleWindow(binaryPath, startAddressHex, byteLength = 0x900) {
  const start = parseHex(startAddressHex);
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
    throw new Error(result.stderr || result.stdout || `objdump failed for ${startAddressHex}`);
  }
  return result.stdout;
}

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x80) {
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

function functionWindowForIndex(instructions, index) {
  let startIndex = index;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (instructions[cursor].mnemonic === "ret") {
      startIndex = cursor + 1;
      break;
    }
    startIndex = cursor;
  }

  let endIndex = instructions.length - 1;
  for (let cursor = index; cursor < instructions.length; cursor += 1) {
    if (instructions[cursor].mnemonic === "ret") {
      endIndex = cursor;
      break;
    }
  }

  return instructions.slice(startIndex, endIndex + 1);
}

function sourceRegisterMap(instructions) {
  const result = new Map();
  for (const instruction of instructions || []) {
    if (instruction.mnemonic !== "mov") continue;
    const match = instruction.operands.trim().match(/^([wx]\d+),\s*([wx]\d+)$/);
    if (!match) continue;
    result.set(match[1].toLowerCase(), match[2].toLowerCase());
  }
  return result;
}

function roleForForwardedMove(instruction, nodeRegister, sources) {
  if (instruction.mnemonic !== "mov") return "";
  const match = instruction.operands.trim().match(/^([wx]\d+),\s*([wx]\d+)$/);
  if (!match) return "";
  const destination = match[1].toLowerCase();
  const source = match[2].toLowerCase();
  const originalSource = sources.get(source) || source;

  if (destination === "x0" && source === nodeRegister) return "x0=childNode";
  if (destination === "x1" && originalSource === "x0") return "x1=parentObject";
  if (destination === "x2" && (originalSource === "x1" || originalSource === "x2")) return "x2=context";
  if ((destination === "w3" || destination === "w4") && /^w[123]$/.test(originalSource)) {
    return `${destination}=phaseOrFlags`;
  }
  return "";
}

function listHeadLoad(instruction) {
  if (instruction.mnemonic !== "ldr") return null;
  const match = instruction.operands.trim().match(/^x8,\s*\[x0,\s*#(0x[0-9a-fA-F]+|\d+)\]$/);
  if (!match) return null;
  const offset = parseNumber(match[1]);
  return offset === 0x50 ? { listHeadOffsetHex: hex(offset), instructionText: instruction.text } : null;
}

function nodeRegisterForWindow(instructions, listHeadIndex) {
  for (const instruction of instructions.slice(listHeadIndex + 1, listHeadIndex + 12)) {
    if (instruction.mnemonic !== "sub") continue;
    const match = instruction.operands.trim().match(/^(x\d+),\s*x8,\s*#(0x[0-9a-fA-F]+|\d+)$/);
    if (!match) continue;
    return { nodeRegister: match[1].toLowerCase(), adjustmentHex: hex(parseNumber(match[2])) };
  }
  return { nodeRegister: "", adjustmentHex: "" };
}

function nodeLinkOffsetForWindow(instructions, nodeRegister) {
  if (!nodeRegister) return "";
  const regex = new RegExp(`^x8,\\s*\\[${nodeRegister},\\s*#(0x[0-9a-fA-F]+|\\d+)\\]$`);
  for (const instruction of instructions || []) {
    if (instruction.mnemonic !== "ldr") continue;
    const match = instruction.operands.trim().match(regex);
    if (match) return hex(parseNumber(match[1]));
  }
  return "";
}

function childSlotCallsForWindow(instructions, nodeRegister) {
  const sources = sourceRegisterMap(instructions);
  const rows = [];
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    if (instruction.mnemonic !== "blr" || instruction.operands.trim().toLowerCase() !== "x8") continue;
    const previous = instructions.slice(Math.max(0, index - 8), index);
    const slotLoad = [...previous]
      .reverse()
      .find((candidate) => candidate.mnemonic === "ldr" && /^x8,\s*\[x8,\s*#/.test(candidate.operands.trim()));
    if (!slotLoad) continue;
    const slotMatch = slotLoad.operands.trim().match(/^x8,\s*\[x8,\s*#(0x[0-9a-fA-F]+|\d+)\]$/);
    if (!slotMatch) continue;
    const forwardedArguments = uniqueInOrder(
      previous.map((candidate) => roleForForwardedMove(candidate, nodeRegister, sources)).filter(Boolean),
    );
    if (!forwardedArguments.includes("x0=childNode")) continue;
    rows.push({
      childVtableSlotOffsetHex: hex(parseNumber(slotMatch[1])),
      forwardedArguments,
      slotLoadInstruction: slotLoad.text,
      callInstruction: instruction.text,
    });
  }
  return rows;
}

function listDispatchRowsForInstructions(instructions) {
  const rows = [];
  const seenWindows = new Set();
  for (let index = 0; index < instructions.length; index += 1) {
    const listLoad = listHeadLoad(instructions[index]);
    if (!listLoad) continue;
    const window = functionWindowForIndex(instructions, index);
    const dispatchFunctionStartHex = window[0]?.addressHex || "";
    const dispatchFunctionEndHex = window.at(-1)?.addressHex || "";
    if (!dispatchFunctionStartHex || seenWindows.has(dispatchFunctionStartHex)) continue;
    seenWindows.add(dispatchFunctionStartHex);

    const localListIndex = window.findIndex((instruction) => instruction.addressHex === instructions[index].addressHex);
    const node = nodeRegisterForWindow(window, localListIndex);
    const slotCalls = childSlotCallsForWindow(window, node.nodeRegister);
    const nodeLinkOffsetHex = nodeLinkOffsetForWindow(window, node.nodeRegister);
    for (const slotCall of slotCalls) {
      rows.push({
        status: "field-reader-list-dispatch-child-vtable",
        dispatchFunctionStartHex,
        dispatchFunctionEndHex,
        listHeadOffsetHex: listLoad.listHeadOffsetHex,
        listHeadLoadInstruction: listLoad.instructionText,
        nodeRegister: node.nodeRegister,
        nodeLinkOffsetHex,
        nodePayloadAdjustmentHex: node.adjustmentHex,
        childVtableSlotOffsetHex: slotCall.childVtableSlotOffsetHex,
        forwardedArguments: slotCall.forwardedArguments,
        slotLoadInstruction: slotCall.slotLoadInstruction,
        callInstruction: slotCall.callInstruction,
        semanticConsumerResolved: false,
        renderPromotionAllowed: false,
        blocker:
          "current package proves parent list traversal and child vtable dispatch, but child slot semantics for projectile placement, timing, target, impact, or rendering are not decoded",
      });
    }
  }
  return rows;
}

function routeGroupsByReaderTarget(currentFieldReaderDownstreamRouteAudit) {
  const groups = new Map();
  for (const item of currentFieldReaderDownstreamRouteAudit.items || []) {
    const readerBranchTargetHex = normalizeHex(item.readerBranchTargetHex);
    if (!readerBranchTargetHex) continue;
    if (!groups.has(readerBranchTargetHex)) {
      groups.set(readerBranchTargetHex, {
        readerBranchTargetHex,
        targetNames: [],
        readerCallsiteAddresses: [],
        containerListOffsets: [],
        objectListOffsets: [],
        primaryVtableAddressHexes: [],
      });
    }
    const group = groups.get(readerBranchTargetHex);
    group.targetNames.push(item.targetName || "");
    group.readerCallsiteAddresses.push(item.readerCallsiteAddressHex || "");
    group.containerListOffsets.push(...pipeValues(item.containerListOffsets).map(normalizeHex).filter(Boolean));
    group.objectListOffsets.push(...pipeValues(item.objectListOffsets).map(normalizeHex).filter(Boolean));
    if (item.primaryVtableAddressHex) group.primaryVtableAddressHexes.push(normalizeHex(item.primaryVtableAddressHex));
  }
  return [...groups.values()].map((group) => ({
    ...group,
    targetNames: uniqueInOrder(group.targetNames),
    readerCallsiteAddresses: uniqueInOrder(group.readerCallsiteAddresses),
    containerListOffsets: uniqueInOrder(group.containerListOffsets),
    objectListOffsets: uniqueInOrder(group.objectListOffsets),
    primaryVtableAddressHexes: uniqueInOrder(group.primaryVtableAddressHexes),
  }));
}

function resolveChildSlot(row, primaryVtableAddressHex, { relocations, disassembleFunction }) {
  const primaryVtableAddress = parseHex(primaryVtableAddressHex);
  const slotOffset = parseHex(row.childVtableSlotOffsetHex);
  const slotAddressHex = hex(primaryVtableAddress + slotOffset);
  const functionHex = relocations.get(slotAddressHex) || "";
  const instructions = functionHex ? boundedFunctionInstructions(disassembleFunction(functionHex), functionHex) : [];
  const classification = classifyResolvedFunction(instructions);
  return {
    childPrimaryVtableAddressHex: primaryVtableAddressHex,
    resolvedChildSlotAddressHex: slotAddressHex,
    resolvedChildSlotFunctionHex: functionHex,
    resolvedChildSlotFunctionClass: functionHex ? classification.className : "missing-relocation",
    resolvedChildSlotAccessorOffsetHex: classification.accessorOffsetHex,
    resolvedChildSlotFunctionInstructions: instructions.slice(0, 4).map((instruction) => instruction.text),
  };
}

function summarize(items, groups) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    readerBranchTargetRows: groups.length,
    listDispatchFunctionRows: new Set(items.map((item) => item.dispatchFunctionStartHex)).size,
    childVtableSlotRows: items.length,
    uniqueChildVtableSlots: new Set(items.map((item) => item.childVtableSlotOffsetHex)).size,
    resolvedChildSlotRows: items.filter((item) => item.resolvedChildSlotFunctionHex).length,
    missingChildSlotRelocationRows: items.filter((item) => item.resolvedChildSlotFunctionClass === "missing-relocation")
      .length,
    retOnlyChildSlotRows: items.filter((item) => item.resolvedChildSlotFunctionClass === "ret-only").length,
    deleteBranchChildSlotRows: items.filter((item) => item.resolvedChildSlotFunctionClass === "delete-branch").length,
    accessorOnlyChildSlotRows: items.filter((item) => item.resolvedChildSlotFunctionClass === "accessor-add-x0").length,
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileCurrentFieldReaderListDispatchAudit({
  currentFieldReaderDownstreamRouteAudit = {},
  disassembleWindow = () => "",
  disassembleFunction = () => "",
  relativeRelocations = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const groups = routeGroupsByReaderTarget(currentFieldReaderDownstreamRouteAudit);
  const relocations = relocationMap(relativeRelocations);
  const items = [];
  for (const group of groups) {
    const instructions = parseObjdumpInstructions(disassembleWindow(group.readerBranchTargetHex));
    for (const row of listDispatchRowsForInstructions(instructions)) {
      const primaryVtableAddressHex = group.primaryVtableAddressHexes[0] || "";
      const resolvedChildSlot = primaryVtableAddressHex
        ? resolveChildSlot(row, primaryVtableAddressHex, { relocations, disassembleFunction })
        : {
            childPrimaryVtableAddressHex: "",
            resolvedChildSlotAddressHex: "",
            resolvedChildSlotFunctionHex: "",
            resolvedChildSlotFunctionClass: "missing-primary-vtable",
            resolvedChildSlotAccessorOffsetHex: "",
            resolvedChildSlotFunctionInstructions: [],
          };
      items.push({
        ...row,
        ...resolvedChildSlot,
        targetNames: group.targetNames,
        readerBranchTargetHex: group.readerBranchTargetHex,
        readerCallsiteAddresses: group.readerCallsiteAddresses,
        sourceContainerListOffsets: group.containerListOffsets,
        sourceObjectListOffsets: group.objectListOffsets,
      });
    }
  }
  items.sort(
    (left, right) =>
      parseHex(left.readerBranchTargetHex) - parseHex(right.readerBranchTargetHex) ||
      parseHex(left.dispatchFunctionStartHex) - parseHex(right.dispatchFunctionStartHex) ||
      parseHex(left.childVtableSlotOffsetHex) - parseHex(right.childVtableSlotOffsetHex),
  );
  return {
    generatedAt,
    source: {
      currentFieldReaderDownstreamRouteAuditPath: defaultCurrentFieldReaderDownstreamRouteAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile field-reader list dispatch audit; list traversal and child vtable slots do not promote rendering",
    summary: summarize(items, groups),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    targetNames: item.targetNames,
    readerBranchTargetHex: item.readerBranchTargetHex,
    readerCallsiteAddresses: item.readerCallsiteAddresses,
    dispatchFunctionStartHex: item.dispatchFunctionStartHex,
    dispatchFunctionEndHex: item.dispatchFunctionEndHex,
    listHeadOffsetHex: item.listHeadOffsetHex,
    nodeRegister: item.nodeRegister,
    nodeLinkOffsetHex: item.nodeLinkOffsetHex,
    nodePayloadAdjustmentHex: item.nodePayloadAdjustmentHex,
    childVtableSlotOffsetHex: item.childVtableSlotOffsetHex,
    childPrimaryVtableAddressHex: item.childPrimaryVtableAddressHex,
    resolvedChildSlotAddressHex: item.resolvedChildSlotAddressHex,
    resolvedChildSlotFunctionHex: item.resolvedChildSlotFunctionHex,
    resolvedChildSlotFunctionClass: item.resolvedChildSlotFunctionClass,
    resolvedChildSlotAccessorOffsetHex: item.resolvedChildSlotAccessorOffsetHex,
    forwardedArguments: item.forwardedArguments,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentFieldReaderListDispatchAudit({
  currentFieldReaderDownstreamRouteAuditPath = defaultCurrentFieldReaderDownstreamRouteAuditPath,
  binaryPath = defaultBinaryPath,
  currentFieldReaderDownstreamRouteAudit = readJson(currentFieldReaderDownstreamRouteAuditPath, {}),
  disassembleWindow = (startAddressHex) => defaultDisassembleWindow(binaryPath, startAddressHex),
  disassembleFunction = (addressHex) => defaultDisassembleFunction(binaryPath, addressHex),
  relativeRelocations = defaultReadRelativeRelocations(binaryPath),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentFieldReaderListDispatchAudit({
    currentFieldReaderDownstreamRouteAudit,
    disassembleWindow,
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
    "targetNames",
    "readerBranchTargetHex",
    "readerCallsiteAddresses",
    "dispatchFunctionStartHex",
    "dispatchFunctionEndHex",
    "listHeadOffsetHex",
    "nodeRegister",
    "nodeLinkOffsetHex",
    "nodePayloadAdjustmentHex",
    "childVtableSlotOffsetHex",
    "childPrimaryVtableAddressHex",
    "resolvedChildSlotAddressHex",
    "resolvedChildSlotFunctionHex",
    "resolvedChildSlotFunctionClass",
    "resolvedChildSlotAccessorOffsetHex",
    "forwardedArguments",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentFieldReaderListDispatchAudit({
    currentFieldReaderDownstreamRouteAuditPath: optionValue(
      args,
      "--current-field-reader-downstream-route-audit",
      defaultCurrentFieldReaderDownstreamRouteAuditPath,
    ),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentFieldReaderListDispatchAudit,
  exportProjectileCurrentFieldReaderListDispatchAudit,
  readTsv,
};
