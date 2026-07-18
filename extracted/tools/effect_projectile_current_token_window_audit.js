#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  buildCurrentStringReferencesFromBinary,
} = require("./effect_projectile_runtime_consumer_trace_audit");

const defaultConsumerTraceAuditPath = "extracted/reports/effect_projectile_runtime_consumer_trace_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-window-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_window_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_window_audit.tsv";

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

function tokensForConsumerRow(row) {
  return uniqueInOrder([
    row?.effectToken || "",
    ...pipeValues(row?.pairedImpactEffectTokens),
    ...pipeValues(row?.currentReferencedTokens),
  ]);
}

function normalizeCurrentStringReference(reference) {
  return {
    targetName: reference.targetName || reference.name || "",
    targetAddressHex: normalizeHex(reference.targetAddressHex || reference.targetAddress),
    xrefAddressHex: normalizeHex(reference.xrefAddressHex || reference.xrefAddress),
    mode: reference.mode || "",
    targetKind: reference.targetKind || "",
  };
}

function currentStringReferencesFromConsumerTrace(consumerTraceAudit) {
  const rows = [];
  for (const item of consumerTraceAudit.items || []) {
    const tokens = pipeValues(item.currentReferencedTokens);
    const addresses = pipeValues(item.currentXrefAddresses);
    const modes = pipeValues(item.currentXrefModes);
    const targetName = tokens[0] || item.effectToken || "";
    for (let index = 0; index < addresses.length; index += 1) {
      rows.push({
        targetName,
        targetAddressHex: "",
        xrefAddressHex: normalizeHex(addresses[index]),
        mode: modes[index] || "",
      });
    }
  }
  return rows;
}

function parseObjdumpInstructionLine(line) {
  const match = String(line || "").match(/^\s*([0-9a-fA-F]+):\s+(.+?)\s*$/);
  if (!match) return null;
  const rest = match[2].trim().replace(/^(?:[0-9a-fA-F]{8}\s+)+/, "").trim();
  const instruction = rest.match(/^([a-zA-Z0-9.]+)\s*(.*)$/);
  if (!instruction) return null;
  const address = Number.parseInt(match[1], 16);
  return {
    address,
    addressHex: hex(address),
    mnemonic: instruction[1].toLowerCase(),
    operands: instruction[2].trim(),
    text: `${match[1].toLowerCase()}: ${rest}`,
  };
}

function parseObjdumpInstructions(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map(parseObjdumpInstructionLine)
    .filter(Boolean);
}

function defaultDisassembleWindow(binaryPath, xrefAddressHex) {
  const xrefAddress = parseHex(xrefAddressHex);
  const start = Math.max(0, xrefAddress - 0x180);
  const stop = xrefAddress + 0x300;
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
    throw new Error(result.stderr || result.stdout || `objdump failed near ${xrefAddressHex}`);
  }
  return result.stdout;
}

function isPrologueLike(instruction) {
  if (!instruction) return false;
  if (instruction.mnemonic === "sub" && /^sp,\s*sp,\s*#/.test(instruction.operands)) return true;
  if (instruction.mnemonic === "stp" && /\bx29,\s*x30\b/.test(instruction.operands) && /\[sp/.test(instruction.operands)) return true;
  return /^str\b/.test(instruction.mnemonic) && /\[sp,\s*#-/.test(instruction.operands);
}

function boundedFunctionInstructions(instructions, xrefAddressHex) {
  const xrefAddress = parseHex(xrefAddressHex);
  if (!instructions.length || !Number.isFinite(xrefAddress)) {
    return { functionStartHex: "", functionEndHex: "", instructions: [] };
  }

  const xrefIndex = instructions.findIndex((instruction) => instruction.address >= xrefAddress);
  if (xrefIndex < 0) return { functionStartHex: "", functionEndHex: "", instructions: [] };

  let previousReturnIndex = -1;
  for (let index = xrefIndex - 1; index >= 0; index -= 1) {
    if (instructions[index].mnemonic === "ret") {
      previousReturnIndex = index;
      break;
    }
  }

  let startIndex = previousReturnIndex + 1;
  for (let index = previousReturnIndex + 1; index <= xrefIndex; index += 1) {
    if (isPrologueLike(instructions[index])) {
      startIndex = index;
      break;
    }
  }

  let endIndex = instructions.length - 1;
  for (let index = xrefIndex; index < instructions.length; index += 1) {
    if (instructions[index].mnemonic === "ret") {
      endIndex = index;
      break;
    }
  }

  const bounded = instructions.slice(startIndex, endIndex + 1);
  return {
    functionStartHex: bounded[0]?.addressHex || "",
    functionEndHex: bounded[bounded.length - 1]?.addressHex || "",
    instructions: bounded,
  };
}

function runtimeFieldOffsetsForInstructions(instructions) {
  const offsets = [];
  for (const instruction of instructions || []) {
    for (const match of instruction.operands.matchAll(/#(0x[0-9a-fA-F]+|\d+)/g)) {
      const value = parseNumber(match[1]);
      if (!Number.isFinite(value) || value < 0x100 || value > 0x1ff) continue;
      offsets.push(hex(value));
    }
  }
  return uniqueInOrder(offsets);
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

function statusForWindow({ runtimeFieldOffsets, vtableOffsets }) {
  if (runtimeFieldOffsets.length && vtableOffsets.length) return "current-token-runtime-window";
  if (vtableOffsets.length) return "current-token-vtable-window";
  if (runtimeFieldOffsets.length) return "current-token-runtime-field-window";
  return "current-token-window-unclassified";
}

function summarize(items, sourceRows) {
  const byStatus = {};
  for (const item of items || []) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  return {
    rows: items.length,
    sourceConsumerTraceRows: sourceRows,
    currentXrefRows: items.length,
    currentTokenRuntimeWindowRows: items.filter((item) => item.status === "current-token-runtime-window").length,
    currentTokenVtableWindowRows: items.filter((item) => item.status === "current-token-vtable-window").length,
    currentTokenRuntimeFieldWindowRows: items.filter((item) => item.status === "current-token-runtime-field-window").length,
    unclassifiedWindowRows: items.filter((item) => item.status === "current-token-window-unclassified").length,
    runtimeFieldReferenceRows: items.reduce((sum, item) => sum + item.runtimeFieldOffsets.length, 0),
    vtableCallRows: items.reduce((sum, item) => sum + item.vtableOffsets.length, 0),
    branchCallRows: items.reduce((sum, item) => sum + item.branchCallTargets.length, 0),
    currentConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildConsumerRowsByToken(consumerTraceAudit) {
  const byToken = new Map();
  for (const item of consumerTraceAudit.items || []) {
    for (const token of tokensForConsumerRow(item)) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(item);
    }
  }
  return byToken;
}

function rowForCurrentReference(reference, { rowsByToken, disassembleWindow, disassemblyCache }) {
  const normalized = normalizeCurrentStringReference(reference);
  const sourceRows = rowsByToken.get(normalized.targetName) || [];
  const disassemblyText =
    disassemblyCache.get(normalized.xrefAddressHex) ||
    disassembleWindow(normalized.xrefAddressHex, normalized);
  disassemblyCache.set(normalized.xrefAddressHex, disassemblyText);
  const bounded = boundedFunctionInstructions(parseObjdumpInstructions(disassemblyText), normalized.xrefAddressHex);
  const runtimeFieldOffsets = runtimeFieldOffsetsForInstructions(bounded.instructions);
  const vtableOffsets = vtableOffsetsForInstructions(bounded.instructions);
  const branchCallTargets = branchCallTargetsForInstructions(bounded.instructions);
  const status = statusForWindow({ runtimeFieldOffsets, vtableOffsets });

  return {
    status,
    targetName: normalized.targetName,
    targetAddressHex: normalized.targetAddressHex,
    xrefAddressHex: normalized.xrefAddressHex,
    xrefMode: normalized.mode,
    functionStartHex: bounded.functionStartHex,
    functionEndHex: bounded.functionEndHex,
    instructionRows: bounded.instructions.length,
    sourceConsumerTraceRows: sourceRows.length,
    sourceEffectTokens: limited(sourceRows.map((row) => row.effectToken)),
    sourceStatuses: limited(sourceRows.map((row) => row.status)),
    heroNames: limited(sourceRows.flatMap((row) => pipeValues(row.heroNames))),
    actionKeys: limited(sourceRows.flatMap((row) => pipeValues(row.actionKeys))),
    runtimeFieldOffsets,
    vtableOffsets,
    branchCallTargets,
    firstInstructionTexts: bounded.instructions.slice(0, 6).map((instruction) => instruction.text),
    currentConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "current token function window recovered, but downstream reader/executor semantics are still unresolved",
  };
}

function buildProjectileCurrentTokenWindowAudit({
  consumerTraceAudit = {},
  currentStringReferences = [],
  disassembleWindow = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const rowsByToken = buildConsumerRowsByToken(consumerTraceAudit);
  const references = uniqueInOrder(
    (currentStringReferences || [])
      .map(normalizeCurrentStringReference)
      .filter((reference) => reference.targetName && reference.xrefAddressHex)
      .map((reference) => JSON.stringify(reference)),
  )
    .map((reference) => JSON.parse(reference))
    .sort((left, right) => {
      const leftAddress = parseHex(left.xrefAddressHex);
      const rightAddress = parseHex(right.xrefAddressHex);
      if (Number.isFinite(leftAddress) && Number.isFinite(rightAddress) && leftAddress !== rightAddress) {
        return leftAddress - rightAddress;
      }
      return left.targetName.localeCompare(right.targetName);
    });
  const disassemblyCache = new Map();
  const items = references.map((reference) =>
    rowForCurrentReference(reference, { rowsByToken, disassembleWindow, disassemblyCache }),
  );

  return {
    generatedAt,
    source: {
      consumerTraceAuditPath: defaultConsumerTraceAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token function-window audit; current field/vtable/call evidence does not promote rendering until downstream readers are recovered",
    summary: summarize(items, (consumerTraceAudit.items || []).length),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    targetName: item.targetName,
    targetAddressHex: item.targetAddressHex,
    xrefAddressHex: item.xrefAddressHex,
    xrefMode: item.xrefMode,
    functionStartHex: item.functionStartHex,
    functionEndHex: item.functionEndHex,
    instructionRows: item.instructionRows,
    sourceConsumerTraceRows: item.sourceConsumerTraceRows,
    sourceEffectTokens: item.sourceEffectTokens,
    sourceStatuses: item.sourceStatuses,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    runtimeFieldOffsets: item.runtimeFieldOffsets,
    vtableOffsets: item.vtableOffsets,
    branchCallTargets: item.branchCallTargets,
    currentConsumerResolved: item.currentConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenWindowAudit({
  consumerTraceAuditPath = defaultConsumerTraceAuditPath,
  binaryPath = defaultBinaryPath,
  currentStringReferences = null,
  disassembleWindow = null,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  generatedAt = new Date().toISOString(),
} = {}) {
  const consumerTraceAudit = readJson(consumerTraceAuditPath, { items: [] });
  const tokens = uniqueInOrder((consumerTraceAudit.items || []).flatMap(tokensForConsumerRow));
  const resolvedCurrentStringReferences =
    currentStringReferences ||
    (fs.existsSync(binaryPath)
      ? buildCurrentStringReferencesFromBinary(tokens, binaryPath)
      : currentStringReferencesFromConsumerTrace(consumerTraceAudit));
  const audit = buildProjectileCurrentTokenWindowAudit({
    consumerTraceAudit,
    currentStringReferences: resolvedCurrentStringReferences,
    disassembleWindow: disassembleWindow || ((xrefAddressHex) => defaultDisassembleWindow(binaryPath, xrefAddressHex)),
    generatedAt,
  });
  audit.source = { consumerTraceAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "targetName",
    "targetAddressHex",
    "xrefAddressHex",
    "xrefMode",
    "functionStartHex",
    "functionEndHex",
    "instructionRows",
    "sourceConsumerTraceRows",
    "sourceEffectTokens",
    "sourceStatuses",
    "heroNames",
    "actionKeys",
    "runtimeFieldOffsets",
    "vtableOffsets",
    "branchCallTargets",
    "currentConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenWindowAudit({
    consumerTraceAuditPath: optionValue(args, "--consumer-trace-audit", defaultConsumerTraceAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenWindowAudit,
  exportProjectileCurrentTokenWindowAudit,
  parseObjdumpInstructionLine,
  readTsv,
};
