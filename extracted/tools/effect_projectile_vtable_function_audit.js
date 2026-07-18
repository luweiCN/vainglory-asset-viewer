#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseElf64 } = require("./current_native_anchor_audit");

const defaultVtableSlotAuditPath = "extracted/reports/effect_projectile_vtable_slot_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-vtable-function-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_vtable_function_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_vtable_function_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseHex(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (!text) return NaN;
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9]+$/.test(text)) return Number.parseInt(text, 10);
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

function uniqueSorted(values) {
  return uniqueInOrder(values).sort((left, right) => {
    const leftNumber = parseHex(left);
    const rightNumber = parseHex(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return String(left).localeCompare(String(right));
  });
}

function textSectionForBinary(binaryPath) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) throw new Error(`missing .text section in ${binaryPath}`);
  return {
    start: text.virtualAddress,
    end: text.virtualAddress + text.size,
    startHex: hex(text.virtualAddress),
    endHex: hex(text.virtualAddress + text.size),
    sizeHex: hex(text.size),
  };
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

function parseObjdumpFunctionInstructions(output, startAddress) {
  const start = parseHex(startAddress);
  const instructions = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const instruction = parseObjdumpInstructionLine(line);
    if (!instruction || instruction.address < start) continue;
    instructions.push(instruction);
    if (instruction.mnemonic === "ret") break;
  }
  return instructions;
}

function disassembleFunctionWindow(binaryPath, addressHex) {
  const start = parseHex(addressHex);
  const stop = start + 0x100;
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

function classifyFunctionInstructions(instructions) {
  if (!instructions.length) {
    return {
      structuralClass: "disassembly-missing",
      instructionRows: 0,
      branchCallRows: 0,
      storeRows: 0,
      outputPointerStoreRows: 0,
      zeroStoreRows: 0,
      sourcePointerReadRows: 0,
      floatingPointRows: 0,
      returnRows: 0,
    };
  }

  let branchCallRows = 0;
  let storeRows = 0;
  let outputPointerStoreRows = 0;
  let zeroStoreRows = 0;
  let sourcePointerReadRows = 0;
  let floatingPointRows = 0;
  let returnRows = 0;

  for (const instruction of instructions) {
    if (/^blr?$/.test(instruction.mnemonic)) branchCallRows += 1;
    if (/^st/.test(instruction.mnemonic)) {
      storeRows += 1;
      if (/\[x1(?:\]|\s*,)/.test(instruction.operands)) outputPointerStoreRows += 1;
      if (/\b[wx]zr\b/.test(instruction.operands)) zeroStoreRows += 1;
    }
    if (/^ld/.test(instruction.mnemonic) && /\[x[23](?:\]|\s*,)/.test(instruction.operands)) {
      sourcePointerReadRows += 1;
    }
    if (/^f/.test(instruction.mnemonic)) floatingPointRows += 1;
    if (instruction.mnemonic === "ret") returnRows += 1;
  }

  let structuralClass = "current-text-unclassified";
  if (branchCallRows > 0) {
    structuralClass = "helper-call-function";
  } else if (outputPointerStoreRows > 0 && (floatingPointRows > 0 || sourcePointerReadRows > 0)) {
    structuralClass = "computed-output-writer";
  } else if (outputPointerStoreRows > 0 && instructions.length <= 8 && returnRows > 0) {
    structuralClass = "constant-output-writer";
  } else if (outputPointerStoreRows > 0) {
    structuralClass = "output-writer-unclassified";
  }

  return {
    structuralClass,
    instructionRows: instructions.length,
    branchCallRows,
    storeRows,
    outputPointerStoreRows,
    zeroStoreRows,
    sourcePointerReadRows,
    floatingPointRows,
    returnRows,
  };
}

function blockerForRow(row) {
  if (!row.addressInCurrentText) {
    return "resolved function address is outside the current Android .text section";
  }
  if (row.structuralClass === "disassembly-missing") {
    return "current native function address is in .text but no bounded function body was recovered";
  }
  return "current native function body recovered, but function role is not recovered enough to classify placement/timing/effect semantics";
}

function groupResolvedFunctionRows(vtableSlotAudit) {
  const groups = new Map();
  for (const row of vtableSlotAudit.items || []) {
    const functionAddressHex = normalizeHex(row.resolvedFunctionAddressHex);
    if (!functionAddressHex) continue;
    const group = groups.get(functionAddressHex) || [];
    group.push(row);
    groups.set(functionAddressHex, group);
  }
  return [...groups.entries()].sort((left, right) => parseHex(left[0]) - parseHex(right[0]));
}

function buildFunctionRow(functionAddressHex, rows, { textSection, disassembleFunction }) {
  const functionAddress = parseHex(functionAddressHex);
  const addressInCurrentText =
    textSection && functionAddress >= textSection.start && functionAddress < textSection.end;
  const disassemblyText = addressInCurrentText ? disassembleFunction(functionAddressHex) : "";
  const instructions = addressInCurrentText
    ? parseObjdumpFunctionInstructions(disassemblyText, functionAddressHex)
    : [];
  const classification = addressInCurrentText
    ? classifyFunctionInstructions(instructions)
    : {
        structuralClass: "not-in-current-text",
        instructionRows: 0,
        branchCallRows: 0,
        storeRows: 0,
        outputPointerStoreRows: 0,
        zeroStoreRows: 0,
        sourcePointerReadRows: 0,
        floatingPointRows: 0,
        returnRows: 0,
      };
  const firstInstructionTexts = instructions.slice(0, 12).map((instruction) => instruction.text);
  const row = {
    functionAddressHex,
    slotRows: rows.length,
    heroNames: uniqueSorted(rows.flatMap((item) => item.heroNames || [])),
    actionKeys: uniqueSorted(rows.flatMap((item) => item.actionKeys || [])),
    effectTokens: uniqueInOrder(rows.map((item) => item.effectToken || "")),
    vtablePointers: uniqueSorted(rows.map((item) => item.vtablePointer || "")),
    requestedOffsets: uniqueSorted(rows.map((item) => item.requestedOffset || "")),
    resolvedSlotOffsets: uniqueSorted(rows.map((item) => item.resolvedSlotOffsetHex || "")),
    slotStatuses: uniqueSorted(rows.map((item) => item.slotStatus || "")),
    addressInCurrentText,
    textSectionStartHex: hex(textSection?.start),
    textSectionEndHex: hex(textSection?.end),
    firstInstructionAddressHex: instructions[0]?.addressHex || "",
    lastInstructionAddressHex: instructions.at(-1)?.addressHex || "",
    firstInstructionTexts,
    renderPromotionAllowed: false,
    ...classification,
  };
  row.blocker = blockerForRow(row);
  return row;
}

function summarize(items, sourceSlotRows) {
  const byStructuralClass = {};
  for (const item of items) {
    byStructuralClass[item.structuralClass] = (byStructuralClass[item.structuralClass] || 0) + 1;
  }
  return {
    rows: items.length,
    sourceSlotRows,
    functionsInTextRows: items.filter((item) => item.addressInCurrentText).length,
    disassembledFunctionRows: items.filter((item) => item.instructionRows > 0).length,
    constantOutputWriterRows: items.filter((item) => item.structuralClass === "constant-output-writer").length,
    computedOutputWriterRows: items.filter((item) => item.structuralClass === "computed-output-writer").length,
    helperCallFunctionRows: items.filter((item) => item.structuralClass === "helper-call-function").length,
    unclassifiedFunctionRows: items.filter((item) =>
      ["current-text-unclassified", "output-writer-unclassified"].includes(item.structuralClass),
    ).length,
    renderPromotionAllowedRows: 0,
    byStructuralClass: Object.fromEntries(Object.entries(byStructuralClass).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileVtableFunctionAudit({
  vtableSlotAudit = {},
  textSection = null,
  binaryPath = defaultBinaryPath,
  disassembleFunction = (addressHex) => disassembleFunctionWindow(binaryPath, addressHex),
  generatedAt = new Date().toISOString(),
} = {}) {
  const groups = groupResolvedFunctionRows(vtableSlotAudit);
  const items = groups.map(([functionAddressHex, rows]) =>
    buildFunctionRow(functionAddressHex, rows, { textSection, disassembleFunction }),
  );
  const sourceSlotRows = (vtableSlotAudit.items || []).filter((row) => row.resolvedFunctionAddressHex).length;
  return {
    generatedAt,
    source: {
      vtableSlotAuditPath: defaultVtableSlotAuditPath,
      binaryPath,
    },
    policy:
      "diagnostic-only current Android vtable function audit; it groups relocated function targets and structural disassembly evidence but does not classify projectile placement/timing semantics",
    textSection: textSection
      ? {
          startHex: hex(textSection.start),
          endHex: hex(textSection.end),
          sizeHex: hex(textSection.end - textSection.start),
        }
      : null,
    summary: summarize(items, sourceSlotRows),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    functionAddressHex: item.functionAddressHex,
    slotRows: item.slotRows,
    heroNames: item.heroNames,
    actionKeys: item.actionKeys,
    effectTokens: item.effectTokens,
    vtablePointers: item.vtablePointers,
    requestedOffsets: item.requestedOffsets,
    resolvedSlotOffsets: item.resolvedSlotOffsets,
    slotStatuses: item.slotStatuses,
    addressInCurrentText: item.addressInCurrentText,
    structuralClass: item.structuralClass,
    instructionRows: item.instructionRows,
    branchCallRows: item.branchCallRows,
    storeRows: item.storeRows,
    outputPointerStoreRows: item.outputPointerStoreRows,
    zeroStoreRows: item.zeroStoreRows,
    sourcePointerReadRows: item.sourcePointerReadRows,
    floatingPointRows: item.floatingPointRows,
    returnRows: item.returnRows,
    firstInstructionTexts: item.firstInstructionTexts,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileVtableFunctionAudit({
  vtableSlotAuditPath = defaultVtableSlotAuditPath,
  binaryPath = defaultBinaryPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  textSection = null,
  disassembleFunction = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const resolvedTextSection = textSection || textSectionForBinary(binaryPath);
  const audit = buildProjectileVtableFunctionAudit({
    vtableSlotAudit: readJson(vtableSlotAuditPath, { items: [] }),
    textSection: resolvedTextSection,
    binaryPath,
    disassembleFunction: disassembleFunction || ((addressHex) => disassembleFunctionWindow(binaryPath, addressHex)),
    generatedAt,
  });
  audit.source = { vtableSlotAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "functionAddressHex",
    "slotRows",
    "heroNames",
    "actionKeys",
    "effectTokens",
    "vtablePointers",
    "requestedOffsets",
    "resolvedSlotOffsets",
    "slotStatuses",
    "addressInCurrentText",
    "structuralClass",
    "instructionRows",
    "branchCallRows",
    "storeRows",
    "outputPointerStoreRows",
    "zeroStoreRows",
    "sourcePointerReadRows",
    "floatingPointRows",
    "returnRows",
    "firstInstructionTexts",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileVtableFunctionAudit({
    vtableSlotAuditPath: optionValue(args, "--vtable-slot-audit", defaultVtableSlotAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileVtableFunctionAudit,
  classifyFunctionInstructions,
  exportProjectileVtableFunctionAudit,
  parseObjdumpFunctionInstructions,
  readTsv,
};
