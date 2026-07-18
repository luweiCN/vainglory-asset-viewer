#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultPayloadSetterAuditPath =
  "extracted/reports/effect_projectile_current_token_child_payload_setter_audit.json";
const defaultCommonApplySetterAuditPath =
  "extracted/reports/current_native_layout_b_common_apply_setter_fields_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-payload-setter-downstream-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_payload_setter_downstream_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_payload_setter_downstream_audit.tsv";

const managerRuntimeTargets = new Set(["0xe39678", "0xe39830"]);
const localDownstreamHelperTargets = new Set(["0x8d45d4", "0x8d4a8c", "0x8d4c94", "0x8d4ec4"]);

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
      const targetHex = branchTarget(instruction);
      const target = parseHex(targetHex);
      const fallsThroughToNext = target === instruction.address + 4;
      if (!fallsThroughToNext && isRelevantDownstreamTarget(targetHex)) break;
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

function memoryAccessOffsets(instruction) {
  const memory = memoryBaseAndOffset(instruction.operands);
  if (!memory) return [];
  const firstOffset = parseHex(memory.offsetHex);
  if (instruction.mnemonic !== "stp" && instruction.mnemonic !== "ldp") return [hex(firstOffset)];
  const registers = valueRegisters(instruction.operands);
  const width = registerByteWidth(registers[0] || "");
  return [hex(firstOffset), hex(firstOffset + width)];
}

function isRelevantDownstreamTarget(targetHex) {
  return localDownstreamHelperTargets.has(targetHex) || managerRuntimeTargets.has(targetHex);
}

function callTarget(instruction) {
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function analyzeCallerOutgoingRows({ callerFunctionHex, rootPayloadSetterFunctionHexes, instructions, initialX0Provenance }) {
  const aliases = new Map([["x0", initialX0Provenance]]);
  const rows = [];

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

    const memory = memoryBaseAndOffset(operands);
    if (instruction.mnemonic.startsWith("ld") && memory) {
      const [dst] = valueRegisters(operands);
      const baseProvenance = aliases.get(memory.baseRegister);
      if (dst?.startsWith("x") && baseProvenance === "layout-b-object" && memory.offsetHex === "0x50") {
        aliases.set(dst, "object+0x50-runtime");
      } else if (dst?.startsWith("x")) {
        aliases.delete(dst);
      }
    }

    if (instruction.mnemonic === "bl") {
      const targetHex = callTarget(instruction);
      if (isRelevantDownstreamTarget(targetHex)) {
        rows.push({
          sourceHelperFunctionHex: callerFunctionHex,
          rootPayloadSetterFunctionHexes,
          downstreamFunctionHex: targetHex,
          callKind: "call",
          callInstruction: instruction.text,
          argument0Provenance: aliases.get("x0") || "unknown",
        });
      }
      aliases.delete("x0");
      continue;
    }

    if (instruction.mnemonic === "b") {
      const targetHex = branchTarget(instruction);
      if (isRelevantDownstreamTarget(targetHex)) {
        rows.push({
          sourceHelperFunctionHex: callerFunctionHex,
          rootPayloadSetterFunctionHexes,
          downstreamFunctionHex: targetHex,
          callKind: "tail-branch",
          callInstruction: instruction.text,
          argument0Provenance: aliases.get("x0") || "unknown",
        });
        break;
      }
    }
  }

  return rows;
}

function analyzeDownstreamAccesses(instructions, argument0Provenance) {
  const aliases = new Map([["x0", argument0Provenance]]);
  const objectFieldReadOffsets = [];
  const objectFieldWriteOffsets = [];
  const managerFieldReadOffsets = [];
  const managerFieldWriteOffsets = [];
  const backingTransformWriteOffsets = [];
  const directCallTargets = [];

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

    if (instruction.mnemonic === "bl") {
      const targetHex = callTarget(instruction);
      if (targetHex) directCallTargets.push(targetHex);
      aliases.delete("x0");
      continue;
    }

    const memory = memoryBaseAndOffset(operands);
    if (!memory) continue;
    const baseProvenance = aliases.get(memory.baseRegister);
    const offsets = memoryAccessOffsets(instruction);
    const isLoad = instruction.mnemonic.startsWith("ld");
    const isStore = instruction.mnemonic.startsWith("st");

    if (baseProvenance === "layout-b-object") {
      if (isLoad) {
        objectFieldReadOffsets.push(...offsets);
        const [dst] = valueRegisters(operands);
        if (dst?.startsWith("x") && offsets.includes("0x50")) aliases.set(dst, "object+0x50-backing");
        else if (dst?.startsWith("x")) aliases.delete(dst);
      }
      if (isStore) objectFieldWriteOffsets.push(...offsets);
      continue;
    }

    if (baseProvenance === "object+0x50-runtime") {
      if (isLoad) managerFieldReadOffsets.push(...offsets);
      if (isStore) managerFieldWriteOffsets.push(...offsets);
      continue;
    }

    if (baseProvenance === "object+0x50-backing" && isStore) {
      backingTransformWriteOffsets.push(...offsets);
    }
  }

  return {
    objectFieldReadOffsets: uniqueInOrder(objectFieldReadOffsets),
    objectFieldWriteOffsets: uniqueInOrder(objectFieldWriteOffsets),
    managerFieldReadOffsets: uniqueInOrder(managerFieldReadOffsets),
    managerFieldWriteOffsets: uniqueInOrder(managerFieldWriteOffsets),
    backingTransformWriteOffsets: uniqueInOrder(backingTransformWriteOffsets),
    directCallTargets: uniqueInOrder(directCallTargets),
  };
}

function rowsForCommonApplyBlock(commonApplySetterAudit, blockId) {
  const rows = commonApplySetterAudit.rows || commonApplySetterAudit.items || [];
  return rows.filter((row) => row.blockId === blockId);
}

function classifyDownstreamFunction(functionHex) {
  if (functionHex === "0x8d45d4") return "layout-b-base-transform-apply-helper";
  if (functionHex === "0x8d4a8c") return "layout-b-transform-basis-helper";
  if (managerRuntimeTargets.has(functionHex)) return "object50-runtime-manager-helper";
  return "downstream-helper-unclassified";
}

function commonApplyBlocksForDownstream(functionHex) {
  return functionHex === "0x8d45d4" ? ["base-transform-setter"] : [];
}

function buildRows({ payloadSetterAudit, commonApplySetterAudit, disassembleFunction }) {
  const sourceItems = payloadSetterAudit.items || payloadSetterAudit.rows || [];
  const directRows = [];
  for (const item of sourceItems) {
    const sourceHelperFunctionHex = normalizeHex(item.helperFunctionHex);
    if (!sourceHelperFunctionHex) continue;
    const instructions = boundedInstructions(disassembleFunction(sourceHelperFunctionHex, 0x220), sourceHelperFunctionHex);
    directRows.push(
      ...analyzeCallerOutgoingRows({
        callerFunctionHex: sourceHelperFunctionHex,
        rootPayloadSetterFunctionHexes: [sourceHelperFunctionHex],
        instructions,
        initialX0Provenance: "layout-b-object",
      }),
    );
  }

  const nestedRows = [];
  for (const row of directRows) {
    if (!localDownstreamHelperTargets.has(row.downstreamFunctionHex) || row.argument0Provenance === "unknown") continue;
    const instructions = boundedInstructions(disassembleFunction(row.downstreamFunctionHex, 0x360), row.downstreamFunctionHex);
    nestedRows.push(
      ...analyzeCallerOutgoingRows({
        callerFunctionHex: row.downstreamFunctionHex,
        rootPayloadSetterFunctionHexes: row.rootPayloadSetterFunctionHexes,
        instructions,
        initialX0Provenance: row.argument0Provenance,
      }),
    );
  }

  return [...directRows, ...nestedRows]
    .map((row) => {
      const instructions = boundedInstructions(disassembleFunction(row.downstreamFunctionHex, 0x360), row.downstreamFunctionHex);
      const accesses = analyzeDownstreamAccesses(instructions, row.argument0Provenance);
      const commonApplyBlockIds = commonApplyBlocksForDownstream(row.downstreamFunctionHex);
      const commonRows = commonApplyBlockIds.flatMap((blockId) => rowsForCommonApplyBlock(commonApplySetterAudit, blockId));
      const commonStoreOffsets = uniqueInOrder(
        commonRows.filter((commonRow) => commonRow.accessKind === "store").map((commonRow) => commonRow.objectOffsetHex),
      );
      return {
        status: "token-child-payload-setter-downstream-diagnostic",
        sourceHelperFunctionHex: row.sourceHelperFunctionHex,
        rootPayloadSetterFunctionHexes: row.rootPayloadSetterFunctionHexes,
        downstreamFunctionHex: row.downstreamFunctionHex,
        downstreamClass: classifyDownstreamFunction(row.downstreamFunctionHex),
        callKind: row.callKind,
        callInstruction: row.callInstruction,
        argument0Provenance: row.argument0Provenance,
        commonApplyBlockIds,
        commonApplyOpcodeRows: commonRows.length,
        commonApplyOpcodeMismatchRows: commonRows.filter((commonRow) => commonRow.opcodeMatches === false).length,
        objectFieldReadOffsets: accesses.objectFieldReadOffsets,
        objectFieldWriteOffsets: uniqueInOrder([...commonStoreOffsets, ...accesses.objectFieldWriteOffsets]),
        managerFieldReadOffsets: accesses.managerFieldReadOffsets,
        managerFieldWriteOffsets: accesses.managerFieldWriteOffsets,
        backingTransformWriteOffsets: accesses.backingTransformWriteOffsets,
        directCallTargets: accesses.directCallTargets,
        downstreamFunctionStartHex: instructions[0]?.addressHex || "",
        downstreamFunctionEndHex: instructions.at(-1)?.addressHex || "",
        downstreamInstructionRows: instructions.length,
        semanticConsumerResolved: false,
        renderPromotionAllowed: false,
        blocker:
          "downstream helper chain is traced, but emitter, locator, timing, effect parameter, and draw semantics are not fully recovered",
      };
    })
    .sort(
      (left, right) =>
        parseHex(left.rootPayloadSetterFunctionHexes[0]) - parseHex(right.rootPayloadSetterFunctionHexes[0]) ||
        parseHex(left.downstreamFunctionHex) - parseHex(right.downstreamFunctionHex),
    );
}

function summarize(items) {
  return {
    rows: items.length,
    uniqueDownstreamTargets: uniqueInOrder(items.map((item) => item.downstreamFunctionHex)).length,
    sourcePayloadSetterHelperRows: uniqueInOrder(items.flatMap((item) => item.rootPayloadSetterFunctionHexes)).length,
    layoutBObjectArgumentRows: items.filter((item) => item.argument0Provenance === "layout-b-object").length,
    object50RuntimeArgumentRows: items.filter((item) => item.argument0Provenance === "object+0x50-runtime").length,
    baseTransformApplyRows: items.filter((item) => item.downstreamClass === "layout-b-base-transform-apply-helper").length,
    managerRuntimeRows: items.filter((item) => item.downstreamClass === "object50-runtime-manager-helper").length,
    commonApplyOpcodeRows: items.reduce((sum, item) => sum + item.commonApplyOpcodeRows, 0),
    commonApplyOpcodeMismatchRows: items.reduce((sum, item) => sum + item.commonApplyOpcodeMismatchRows, 0),
    objectFieldWriteRows: items.reduce((sum, item) => sum + item.objectFieldWriteOffsets.length, 0),
    uniqueObjectFieldWriteOffsets: uniqueInOrder(items.flatMap((item) => item.objectFieldWriteOffsets)).length,
    objectFieldReadRows: items.reduce((sum, item) => sum + item.objectFieldReadOffsets.length, 0),
    uniqueObjectFieldReadOffsets: uniqueInOrder(items.flatMap((item) => item.objectFieldReadOffsets)).length,
    managerFieldReadRows: items.reduce((sum, item) => sum + item.managerFieldReadOffsets.length, 0),
    backingTransformWriteRows: items.reduce((sum, item) => sum + item.backingTransformWriteOffsets.length, 0),
    semanticConsumerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
  };
}

function buildProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
  payloadSetterAudit = {},
  commonApplySetterAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const items = buildRows({ payloadSetterAudit, commonApplySetterAudit, disassembleFunction });
  return {
    generatedAt,
    source: {
      payloadSetterAuditPath: defaultPayloadSetterAuditPath,
      commonApplySetterAuditPath: defaultCommonApplySetterAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child payload setter downstream audit; helper next-hop evidence does not promote viewer rendering until native emitter/locator/timing/draw consumers are recovered",
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    sourceHelperFunctionHex: item.sourceHelperFunctionHex,
    rootPayloadSetterFunctionHexes: item.rootPayloadSetterFunctionHexes,
    downstreamFunctionHex: item.downstreamFunctionHex,
    downstreamClass: item.downstreamClass,
    callKind: item.callKind,
    callInstruction: item.callInstruction,
    argument0Provenance: item.argument0Provenance,
    commonApplyBlockIds: item.commonApplyBlockIds,
    commonApplyOpcodeRows: item.commonApplyOpcodeRows,
    commonApplyOpcodeMismatchRows: item.commonApplyOpcodeMismatchRows,
    objectFieldReadOffsets: item.objectFieldReadOffsets,
    objectFieldWriteOffsets: item.objectFieldWriteOffsets,
    managerFieldReadOffsets: item.managerFieldReadOffsets,
    managerFieldWriteOffsets: item.managerFieldWriteOffsets,
    backingTransformWriteOffsets: item.backingTransformWriteOffsets,
    directCallTargets: item.directCallTargets,
    downstreamFunctionStartHex: item.downstreamFunctionStartHex,
    downstreamFunctionEndHex: item.downstreamFunctionEndHex,
    downstreamInstructionRows: item.downstreamInstructionRows,
    semanticConsumerResolved: item.semanticConsumerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
  payloadSetterAuditPath = defaultPayloadSetterAuditPath,
  commonApplySetterAuditPath = defaultCommonApplySetterAuditPath,
  binaryPath = defaultBinaryPath,
  payloadSetterAudit = readJson(payloadSetterAuditPath, { items: [] }),
  commonApplySetterAudit = readJson(commonApplySetterAuditPath, { rows: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
    payloadSetterAudit,
    commonApplySetterAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { payloadSetterAuditPath, commonApplySetterAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "sourceHelperFunctionHex",
    "rootPayloadSetterFunctionHexes",
    "downstreamFunctionHex",
    "downstreamClass",
    "callKind",
    "callInstruction",
    "argument0Provenance",
    "commonApplyBlockIds",
    "commonApplyOpcodeRows",
    "commonApplyOpcodeMismatchRows",
    "objectFieldReadOffsets",
    "objectFieldWriteOffsets",
    "managerFieldReadOffsets",
    "managerFieldWriteOffsets",
    "backingTransformWriteOffsets",
    "directCallTargets",
    "downstreamFunctionStartHex",
    "downstreamFunctionEndHex",
    "downstreamInstructionRows",
    "semanticConsumerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildPayloadSetterDownstreamAudit({
    payloadSetterAuditPath: optionValue(args, "--payload-setter-audit", defaultPayloadSetterAuditPath),
    commonApplySetterAuditPath: optionValue(args, "--common-apply-setter-audit", defaultCommonApplySetterAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildPayloadSetterDownstreamAudit,
  exportProjectileCurrentTokenChildPayloadSetterDownstreamAudit,
  readTsv,
};
