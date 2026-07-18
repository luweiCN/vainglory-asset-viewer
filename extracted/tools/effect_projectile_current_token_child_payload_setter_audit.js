#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultEvaluatorPayloadAuditPath =
  "extracted/reports/effect_projectile_current_token_child_evaluator_payload_audit.json";
const defaultCommonApplySetterAuditPath =
  "extracted/reports/current_native_layout_b_common_apply_setter_fields_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-payload-setter-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_payload_setter_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_payload_setter_audit.tsv";

const helperSpecs = [
  {
    helperFunctionHex: "0x8d4a50",
    helperClass: "layout-b-state-scalar-setter",
    commonApplyBlockIds: ["rotation-curve-setter"],
  },
  {
    helperFunctionHex: "0x8d4c70",
    helperClass: "layout-b-resource-object-setter-default",
    commonApplyBlockIds: ["resource-object-setter-default"],
  },
  {
    helperFunctionHex: "0x8d4e6c",
    helperClass: "layout-b-resource-object-setter-indexed",
    commonApplyBlockIds: ["resource-object-setter-indexed"],
  },
  {
    helperFunctionHex: "0x8d4e8c",
    helperClass: "layout-b-resource-object-setter-selected",
    commonApplyBlockIds: ["resource-object-setter-selected"],
  },
  {
    helperFunctionHex: "0x8d4eb8",
    helperClass: "layout-b-fallback-resource-state-setter",
    commonApplyBlockIds: ["fallback-resource-state-setter"],
  },
  {
    helperFunctionHex: "0x8d4f40",
    helperClass: "layout-b-vector-output-setter",
    commonApplyBlockIds: ["vector-callback-setter"],
  },
  {
    helperFunctionHex: "0x8d4fbc",
    helperClass: "layout-b-scalar-word-output-setter",
    commonApplyBlockIds: ["scalar-callback-setter"],
  },
  {
    helperFunctionHex: "0x8d4fc8",
    helperClass: "layout-b-scalar-float-output-setter",
    commonApplyBlockIds: ["scalar-followup-setter"],
  },
  {
    helperFunctionHex: "0x8d4fd0",
    helperClass: "layout-b-scalar-tail-output-setter",
    commonApplyBlockIds: ["scalar-tail-setter"],
  },
  {
    helperFunctionHex: "0x8d4fdc",
    helperClass: "layout-b-object50-commit-helper",
    commonApplyBlockIds: [],
  },
];

const helperSpecByFunction = new Map(helperSpecs.map((spec) => [spec.helperFunctionHex, spec]));

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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x120) {
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

function branchTarget(instruction) {
  if (!instruction?.mnemonic?.startsWith("b")) return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
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
      if (!fallsThroughToNext) break;
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

function valueRegisters(operands) {
  const beforeMemory = String(operands || "").split("[")[0] || "";
  return beforeMemory
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function registerByteWidth(register) {
  if (/^[sw]\d+$/.test(register)) return 4;
  if (/^[xd]\d+$/.test(register)) return 8;
  if (/^q\d+$/.test(register)) return 16;
  return 4;
}

function memoryAccessOffsets(instruction, baseOffset) {
  const memory = memoryBaseAndOffset(instruction.operands);
  if (!memory || !Number.isFinite(baseOffset)) return [];
  const firstOffset = baseOffset + parseHex(memory.offsetHex);
  if (instruction.mnemonic !== "stp" && instruction.mnemonic !== "ldp") return [hex(firstOffset)];
  const registers = valueRegisters(instruction.operands);
  const width = registerByteWidth(registers[0] || "");
  return [hex(firstOffset), hex(firstOffset + width)];
}

function analyzeObjectFieldAccesses(instructions) {
  const aliases = new Map([["x0", "object"]]);
  const readOffsets = [];
  const writeOffsets = [];
  const readInstructions = [];
  const writeInstructions = [];
  const callTargets = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^(x\d+),\s*(x\d+)$/);
      if (match && aliases.get(match[2].toLowerCase()) === "object") {
        aliases.set(match[1].toLowerCase(), "object");
      } else if (match) {
        aliases.delete(match[1].toLowerCase());
      }
      continue;
    }

    if (instruction.mnemonic === "add") {
      const match = operands.match(/^(x\d+),\s*(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
      if (match && aliases.get(match[2].toLowerCase()) === "object") {
        aliases.delete(match[1].toLowerCase());
      }
      continue;
    }

    if (instruction.mnemonic === "bl") {
      const targetHex = normalizeHex(operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
      if (targetHex) callTargets.push(targetHex);
      aliases.delete("x0");
      continue;
    }

    const memory = memoryBaseAndOffset(operands);
    if (!memory || aliases.get(memory.baseRegister) !== "object") continue;
    const offsets = memoryAccessOffsets(instruction, 0);
    const isLoad = instruction.mnemonic.startsWith("ld");
    const isStore = instruction.mnemonic.startsWith("st");
    if (isLoad) {
      readOffsets.push(...offsets);
      readInstructions.push(instruction.text);
      const [dst] = valueRegisters(operands);
      if (dst?.startsWith("x")) aliases.delete(dst);
    }
    if (isStore) {
      writeOffsets.push(...offsets);
      writeInstructions.push(instruction.text);
    }
  }

  return {
    readOffsets: uniqueInOrder(readOffsets),
    writeOffsets: uniqueInOrder(writeOffsets),
    readInstructions,
    writeInstructions,
    callTargets: uniqueInOrder(callTargets),
  };
}

function rowsForCommonApplyBlocks(commonApplySetterAudit, blockIds) {
  const rows = commonApplySetterAudit.rows || commonApplySetterAudit.items || [];
  const blockSet = new Set(blockIds || []);
  return rows.filter((row) => blockSet.has(row.blockId));
}

function collectSourceRows(evaluatorPayloadAudit) {
  const sourceRows = evaluatorPayloadAudit.items || evaluatorPayloadAudit.rows || [];
  const grouped = new Map();
  for (const sourceRow of sourceRows) {
    for (const targetHex of sourceRow.helperCallTargetHexes || []) {
      const helperFunctionHex = normalizeHex(targetHex);
      if (!helperSpecByFunction.has(helperFunctionHex)) continue;
      if (!grouped.has(helperFunctionHex)) grouped.set(helperFunctionHex, []);
      grouped.get(helperFunctionHex).push(sourceRow);
    }
  }
  return grouped;
}

function buildItem({ helperFunctionHex, sourceRows, commonApplySetterAudit, disassembleFunction }) {
  const spec = helperSpecByFunction.get(helperFunctionHex);
  const commonRows = rowsForCommonApplyBlocks(commonApplySetterAudit, spec.commonApplyBlockIds);
  const commonStoreOffsets = uniqueInOrder(
    commonRows.filter((row) => row.accessKind === "store").map((row) => row.objectOffsetHex),
  );
  const commonLoadOffsets = uniqueInOrder(
    commonRows.filter((row) => row.accessKind === "load").map((row) => row.objectOffsetHex),
  );
  const instructions = boundedInstructions(disassembleFunction(helperFunctionHex, 0x120), helperFunctionHex);
  const objectAccesses = analyzeObjectFieldAccesses(instructions);
  const objectFieldReadOffsets = uniqueInOrder([...commonLoadOffsets, ...objectAccesses.readOffsets]);
  const objectFieldWriteOffsets = uniqueInOrder([...commonStoreOffsets, ...objectAccesses.writeOffsets]);

  return {
    status: "token-child-payload-setter-helper-diagnostic",
    helperFunctionHex,
    helperClass: spec.helperClass,
    sourcePayloadConsumerFunctionHexes: uniqueInOrder(sourceRows.map((row) => row.payloadConsumerFunctionHex)),
    sourceEvaluatorFunctionHexes: uniqueInOrder(sourceRows.flatMap((row) => row.sourceEvaluatorFunctionHexes || [])),
    commonApplyBlockIds: spec.commonApplyBlockIds,
    commonApplyOpcodeRows: commonRows.length,
    commonApplyOpcodeMismatchRows: commonRows.filter((row) => row.opcodeMatches === false).length,
    commonApplyRoles: uniqueInOrder(commonRows.map((row) => row.role)),
    objectFieldReadOffsets,
    objectFieldWriteOffsets,
    disassemblyObjectFieldReadOffsets: objectAccesses.readOffsets,
    disassemblyObjectFieldWriteOffsets: objectAccesses.writeOffsets,
    disassemblyObjectFieldReadInstructions: objectAccesses.readInstructions,
    disassemblyObjectFieldWriteInstructions: objectAccesses.writeInstructions,
    helperCallTargetHexes: objectAccesses.callTargets,
    helperFunctionStartHex: instructions[0]?.addressHex || "",
    helperFunctionEndHex: instructions.at(-1)?.addressHex || "",
    helperInstructionRows: instructions.length,
    semanticConsumerResolved: false,
    renderPromotionAllowed: false,
    blocker:
      "setter/commit helper field writes are mechanically joined to evaluator payload calls, but downstream emitter, locator, timing, and draw consumers are not recovered",
  };
}

function summarize(items) {
  const writeOffsets = uniqueInOrder(items.flatMap((item) => item.objectFieldWriteOffsets));
  const readOffsets = uniqueInOrder(items.flatMap((item) => item.objectFieldReadOffsets));
  return {
    rows: items.length,
    sourcePayloadConsumerRows: uniqueInOrder(items.flatMap((item) => item.sourcePayloadConsumerFunctionHexes)).length,
    setterHelperRows: items.filter((item) => !item.helperClass.includes("commit-helper")).length,
    commitHelperRows: items.filter((item) => item.helperClass.includes("commit-helper")).length,
    commonApplyMatchedHelperRows: items.filter((item) => item.commonApplyOpcodeRows > 0).length,
    commonApplyOpcodeRows: items.reduce((sum, item) => sum + item.commonApplyOpcodeRows, 0),
    commonApplyOpcodeMismatchRows: items.reduce((sum, item) => sum + item.commonApplyOpcodeMismatchRows, 0),
    objectFieldWriteRows: items.reduce((sum, item) => sum + item.objectFieldWriteOffsets.length, 0),
    uniqueObjectFieldWriteOffsets: writeOffsets.length,
    objectFieldReadRows: items.reduce((sum, item) => sum + item.disassemblyObjectFieldReadInstructions.length, 0),
    uniqueObjectFieldReadOffsets: readOffsets.length,
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
    objectFieldWriteOffsets: writeOffsets,
    objectFieldReadOffsets: readOffsets,
  };
}

function buildProjectileCurrentTokenChildPayloadSetterAudit({
  evaluatorPayloadAudit = {},
  commonApplySetterAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const grouped = collectSourceRows(evaluatorPayloadAudit);
  const items = [...grouped.entries()]
    .map(([helperFunctionHex, sourceRows]) =>
      buildItem({
        helperFunctionHex,
        sourceRows,
        commonApplySetterAudit,
        disassembleFunction,
      }),
    )
    .sort((left, right) => parseHex(left.helperFunctionHex) - parseHex(right.helperFunctionHex));
  return {
    generatedAt,
    source: {
      evaluatorPayloadAuditPath: defaultEvaluatorPayloadAuditPath,
      commonApplySetterAuditPath: defaultCommonApplySetterAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child payload setter audit; setter writes do not promote viewer rendering until native downstream emitter/locator/timing/draw consumers are recovered",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    helperFunctionHex: item.helperFunctionHex,
    helperClass: item.helperClass,
    sourcePayloadConsumerFunctionHexes: item.sourcePayloadConsumerFunctionHexes,
    sourceEvaluatorFunctionHexes: item.sourceEvaluatorFunctionHexes,
    commonApplyBlockIds: item.commonApplyBlockIds,
    commonApplyOpcodeRows: item.commonApplyOpcodeRows,
    commonApplyOpcodeMismatchRows: item.commonApplyOpcodeMismatchRows,
    commonApplyRoles: item.commonApplyRoles,
    objectFieldReadOffsets: item.objectFieldReadOffsets,
    objectFieldWriteOffsets: item.objectFieldWriteOffsets,
    disassemblyObjectFieldReadOffsets: item.disassemblyObjectFieldReadOffsets,
    disassemblyObjectFieldWriteOffsets: item.disassemblyObjectFieldWriteOffsets,
    helperCallTargetHexes: item.helperCallTargetHexes,
    helperFunctionStartHex: item.helperFunctionStartHex,
    helperFunctionEndHex: item.helperFunctionEndHex,
    helperInstructionRows: item.helperInstructionRows,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildPayloadSetterAudit({
  evaluatorPayloadAuditPath = defaultEvaluatorPayloadAuditPath,
  commonApplySetterAuditPath = defaultCommonApplySetterAuditPath,
  binaryPath = defaultBinaryPath,
  evaluatorPayloadAudit = readJson(evaluatorPayloadAuditPath, { items: [] }),
  commonApplySetterAudit = readJson(commonApplySetterAuditPath, { rows: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildPayloadSetterAudit({
    evaluatorPayloadAudit,
    commonApplySetterAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { evaluatorPayloadAuditPath, commonApplySetterAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "helperFunctionHex",
    "helperClass",
    "sourcePayloadConsumerFunctionHexes",
    "sourceEvaluatorFunctionHexes",
    "commonApplyBlockIds",
    "commonApplyOpcodeRows",
    "commonApplyOpcodeMismatchRows",
    "commonApplyRoles",
    "objectFieldReadOffsets",
    "objectFieldWriteOffsets",
    "disassemblyObjectFieldReadOffsets",
    "disassemblyObjectFieldWriteOffsets",
    "helperCallTargetHexes",
    "helperFunctionStartHex",
    "helperFunctionEndHex",
    "helperInstructionRows",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildPayloadSetterAudit({
    evaluatorPayloadAuditPath: optionValue(args, "--evaluator-payload-audit", defaultEvaluatorPayloadAuditPath),
    commonApplySetterAuditPath: optionValue(args, "--common-apply-setter-audit", defaultCommonApplySetterAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildPayloadSetterAudit,
  exportProjectileCurrentTokenChildPayloadSetterAudit,
  readTsv,
};
