#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpFunctionInstructions } = require("./effect_projectile_vtable_function_audit");

const defaultVtableFunctionAuditPath = "extracted/reports/effect_projectile_vtable_function_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-vtable-output-layout-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_vtable_output_layout_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_vtable_output_layout_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseNumber(value) {
  const text = String(value || "").replace(/^#/, "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  return NaN;
}

function parseHex(value) {
  if (typeof value === "number") return value;
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text.slice(2), 16);
  return NaN;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
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

function disassembleFunctionWindow(binaryPath, addressHex) {
  const start = parseHex(addressHex);
  const stop = start + 0x120;
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

function cleanOperands(operands) {
  return String(operands || "").replace(/\s*\/\/.*$/, "").trim();
}

function widthForRegister(register) {
  const name = String(register || "").toLowerCase();
  if (name.startsWith("w")) return 4;
  if (name.startsWith("s")) return 4;
  if (name.startsWith("x")) return 8;
  if (name.startsWith("d")) return 8;
  if (name.startsWith("q") || name.startsWith("v")) return 16;
  return 0;
}

function parseStoreOperands(instruction, outputAliases) {
  if (instruction.mnemonic !== "str") return null;
  const operands = cleanOperands(instruction.operands);
  const post = operands.match(/^([wxsdqv]\d+|[wx]zr),\s*\[(x\d+)\],\s*#(0x[0-9a-fA-F]+|\d+)$/);
  if (post) {
    const baseRegister = post[2].toLowerCase();
    if (!outputAliases.has(baseRegister)) return null;
    return {
      writeKind: "post-increment-store",
      sourceRegister: post[1].toLowerCase(),
      baseRegister,
      fixedOffsetHex: "",
      postIncrementHex: hex(parseNumber(post[3])),
    };
  }

  const fixedWithOffset = operands.match(/^([wxsdqv]\d+|[wx]zr),\s*\[(x\d+),\s*#(0x[0-9a-fA-F]+|\d+)\]$/);
  if (fixedWithOffset) {
    const baseRegister = fixedWithOffset[2].toLowerCase();
    if (!outputAliases.has(baseRegister)) return null;
    return {
      writeKind: "fixed-offset-store",
      sourceRegister: fixedWithOffset[1].toLowerCase(),
      baseRegister,
      fixedOffsetHex: hex(parseNumber(fixedWithOffset[3])),
      postIncrementHex: "",
    };
  }

  const fixedZeroOffset = operands.match(/^([wxsdqv]\d+|[wx]zr),\s*\[(x\d+)\]$/);
  if (fixedZeroOffset) {
    const baseRegister = fixedZeroOffset[2].toLowerCase();
    if (!outputAliases.has(baseRegister)) return null;
    return {
      writeKind: "fixed-offset-store",
      sourceRegister: fixedZeroOffset[1].toLowerCase(),
      baseRegister,
      fixedOffsetHex: "0x0",
      postIncrementHex: "",
    };
  }

  return null;
}

function cloneValue(value) {
  return value ? { ...value } : null;
}

function parseRegisterAssignment(instruction, values, outputAliases) {
  const operands = cleanOperands(instruction.operands);

  let match = operands.match(/^([wx]\d+),\s*([wx]zr),\s*#(0x[0-9a-fA-F]+|\d+)$/);
  if (instruction.mnemonic === "orr" && match) {
    values.set(match[1].toLowerCase(), {
      valueClass: "immediate",
      valueImmediate: parseNumber(match[3]),
      valueFloat: "",
    });
    return;
  }

  match = operands.match(/^([wx]\d+),\s*#(0x[0-9a-fA-F]+|\d+)$/);
  if (instruction.mnemonic === "mov" && match) {
    values.set(match[1].toLowerCase(), {
      valueClass: "immediate",
      valueImmediate: parseNumber(match[2]),
      valueFloat: "",
    });
    return;
  }

  match = operands.match(/^([wx]\d+),\s*#(0x[0-9a-fA-F]+|\d+),\s*lsl\s*#(\d+)$/);
  if (instruction.mnemonic === "movk" && match) {
    const register = match[1].toLowerCase();
    const previous = values.get(register);
    const previousValue = previous?.valueClass === "immediate" ? previous.valueImmediate : 0;
    const shift = parseNumber(match[3]);
    const mask = 0xffff << shift;
    values.set(register, {
      valueClass: "immediate",
      valueImmediate: (previousValue & ~mask) | ((parseNumber(match[2]) & 0xffff) << shift),
      valueFloat: "",
    });
    return;
  }

  match = operands.match(/^(x\d+),\s*(x\d+)$/);
  if (instruction.mnemonic === "mov" && match) {
    const destination = match[1].toLowerCase();
    const source = match[2].toLowerCase();
    if (outputAliases.has(source)) outputAliases.add(destination);
    const sourceValue = values.get(source);
    if (sourceValue) values.set(destination, cloneValue(sourceValue));
    return;
  }

  match = operands.match(/^([sdqv]\d+(?:\.\d+s)?),\s*#?(-?\d+(?:\.\d+)?)$/);
  if (instruction.mnemonic === "fmov" && match) {
    values.set(match[1].split(".")[0].toLowerCase(), {
      valueClass: match[1].startsWith("v") || match[1].startsWith("q") ? "vector-immediate" : "float-immediate",
      valueImmediate: null,
      valueFloat: match[2],
    });
    return;
  }

  if (/^f(add|sub|mul|div|cmp|cvt|mov|neg|sqrt)|^scvtf|^fcvt/.test(instruction.mnemonic)) {
    const destination = operands.match(/^([sdqv]\d+)/)?.[1]?.toLowerCase();
    if (destination) {
      values.set(destination, { valueClass: "computed-float", valueImmediate: null, valueFloat: "" });
    }
    return;
  }

  if (/^ld/.test(instruction.mnemonic)) {
    const destination = operands.match(/^([wxsdqv]\d+)/)?.[1]?.toLowerCase();
    if (destination) {
      values.set(destination, { valueClass: "source-load", valueImmediate: null, valueFloat: "" });
    }
  }
}

function valueForSourceRegister(sourceRegister, values) {
  const source = String(sourceRegister || "").toLowerCase();
  if (source === "wzr" || source === "xzr") {
    return { valueClass: "zero-register", valueImmediateHex: "", valueFloat: "" };
  }
  const value = values.get(source);
  if (value?.valueClass === "immediate") {
    return { valueClass: "immediate", valueImmediateHex: hex(value.valueImmediate), valueFloat: "" };
  }
  if (value?.valueClass === "float-immediate" || value?.valueClass === "vector-immediate") {
    return { valueClass: value.valueClass, valueImmediateHex: "", valueFloat: value.valueFloat };
  }
  if (value?.valueClass) {
    return { valueClass: value.valueClass, valueImmediateHex: "", valueFloat: value.valueFloat || "" };
  }
  if (/^[sd]/.test(source)) return { valueClass: "computed-float", valueImmediateHex: "", valueFloat: "" };
  if (/^[qv]/.test(source)) return { valueClass: "computed-vector", valueImmediateHex: "", valueFloat: "" };
  return { valueClass: "unknown-register", valueImmediateHex: "", valueFloat: "" };
}

function previousInstructions(instructions, index, count) {
  return instructions.slice(Math.max(0, index - count), index);
}

function hasRecentOutputPointerToX0(instructions) {
  return instructions.some((instruction) => {
    if (instruction.mnemonic !== "mov") return false;
    return /^x0,\s*x1$/.test(cleanOperands(instruction.operands));
  });
}

function hasRecentZeroFillValue(instructions) {
  return instructions.some((instruction) => {
    if (instruction.mnemonic !== "mov") return false;
    return /^w1,\s*wzr$/.test(cleanOperands(instruction.operands));
  });
}

function extractOutputWrites(instructions) {
  const outputAliases = new Set(["x1"]);
  const values = new Map();
  const writes = [];

  instructions.forEach((instruction, index) => {
    const store = parseStoreOperands(instruction, outputAliases);
    if (store) {
      const value = valueForSourceRegister(store.sourceRegister, values);
      writes.push({
        writeAddressHex: instruction.addressHex,
        instructionText: instruction.text,
        ...store,
        baseIsX1Alias: store.baseRegister !== "x1",
        widthBytes: widthForRegister(store.sourceRegister),
        ...value,
        helperName: "",
      });
    }

    if (instruction.mnemonic === "bl" && /<memset@plt>/.test(instruction.operands)) {
      const recent = previousInstructions(instructions, index, 6);
      if (hasRecentOutputPointerToX0(recent) && hasRecentZeroFillValue(recent)) {
        writes.push({
          writeAddressHex: instruction.addressHex,
          instructionText: instruction.text,
          writeKind: "helper-memset-zero",
          sourceRegister: "",
          baseRegister: "x1",
          baseIsX1Alias: false,
          fixedOffsetHex: "",
          postIncrementHex: "",
          widthBytes: 0,
          valueClass: "zero-helper",
          valueImmediateHex: "",
          valueFloat: "",
          helperName: "memset@plt",
        });
      }
    }

    parseRegisterAssignment(instruction, values, outputAliases);
  });

  return writes;
}

function outputRowsForFunction(row, disassembleFunction) {
  const instructions = parseObjdumpFunctionInstructions(
    disassembleFunction(row.functionAddressHex),
    row.functionAddressHex,
  );
  return extractOutputWrites(instructions).map((write, index) => ({
    functionAddressHex: row.functionAddressHex,
    functionStructuralClass: row.structuralClass || "",
    functionSlotRows: row.slotRows || 0,
    effectTokens: row.effectTokens || [],
    resolvedSlotOffsets: row.resolvedSlotOffsets || [],
    outputWriteIndex: index,
    renderPromotionAllowed: false,
    blocker:
      "output-buffer write layout recovered structurally, but field semantics are not recovered enough for projectile placement/timing",
    ...write,
  }));
}

function summarize(items, functionRows) {
  const byWriteKind = {};
  const byValueClass = {};
  for (const item of items) {
    byWriteKind[item.writeKind] = (byWriteKind[item.writeKind] || 0) + 1;
    byValueClass[item.valueClass] = (byValueClass[item.valueClass] || 0) + 1;
  }
  return {
    rows: items.length,
    functions: functionRows.length,
    functionsWithOutputRows: new Set(items.map((item) => item.functionAddressHex)).size,
    fixedOffsetStoreRows: items.filter((item) => item.writeKind === "fixed-offset-store").length,
    postIncrementStoreRows: items.filter((item) => item.writeKind === "post-increment-store").length,
    helperMemsetZeroRows: items.filter((item) => item.writeKind === "helper-memset-zero").length,
    aliasedOutputStoreRows: items.filter((item) => item.baseIsX1Alias).length,
    zeroOutputRows: items.filter((item) => item.valueClass === "zero-register" || item.valueClass === "zero-helper").length,
    immediateOutputRows: items.filter((item) => item.valueClass === "immediate").length,
    floatImmediateOutputRows: items.filter((item) => item.valueClass === "float-immediate").length,
    computedOutputRows: items.filter((item) => /^computed/.test(item.valueClass)).length,
    renderPromotionAllowedRows: 0,
    byWriteKind: Object.fromEntries(Object.entries(byWriteKind).sort(([left], [right]) => left.localeCompare(right))),
    byValueClass: Object.fromEntries(Object.entries(byValueClass).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function buildProjectileVtableOutputLayoutAudit({
  vtableFunctionAudit = {},
  binaryPath = defaultBinaryPath,
  disassembleFunction = (addressHex) => disassembleFunctionWindow(binaryPath, addressHex),
  generatedAt = new Date().toISOString(),
} = {}) {
  const functionRows = vtableFunctionAudit.items || [];
  const items = functionRows.flatMap((row) => outputRowsForFunction(row, disassembleFunction));
  return {
    generatedAt,
    source: {
      vtableFunctionAuditPath: defaultVtableFunctionAuditPath,
      binaryPath,
    },
    policy:
      "diagnostic-only output-buffer layout audit; records x1 output stores and helper zero-fill shapes but does not assign projectile placement/timing semantics",
    summary: summarize(items, functionRows),
    items,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    functionAddressHex: item.functionAddressHex,
    functionStructuralClass: item.functionStructuralClass,
    functionSlotRows: item.functionSlotRows,
    effectTokens: item.effectTokens,
    resolvedSlotOffsets: item.resolvedSlotOffsets,
    outputWriteIndex: item.outputWriteIndex,
    writeAddressHex: item.writeAddressHex,
    writeKind: item.writeKind,
    sourceRegister: item.sourceRegister,
    baseRegister: item.baseRegister,
    baseIsX1Alias: item.baseIsX1Alias,
    fixedOffsetHex: item.fixedOffsetHex,
    postIncrementHex: item.postIncrementHex,
    widthBytes: item.widthBytes,
    valueClass: item.valueClass,
    valueImmediateHex: item.valueImmediateHex,
    valueFloat: item.valueFloat,
    helperName: item.helperName,
    instructionText: item.instructionText,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileVtableOutputLayoutAudit({
  vtableFunctionAuditPath = defaultVtableFunctionAuditPath,
  binaryPath = defaultBinaryPath,
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
  disassembleFunction = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const audit = buildProjectileVtableOutputLayoutAudit({
    vtableFunctionAudit: readJson(vtableFunctionAuditPath, { items: [] }),
    binaryPath,
    disassembleFunction: disassembleFunction || ((addressHex) => disassembleFunctionWindow(binaryPath, addressHex)),
    generatedAt,
  });
  audit.source = { vtableFunctionAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "functionAddressHex",
    "functionStructuralClass",
    "functionSlotRows",
    "effectTokens",
    "resolvedSlotOffsets",
    "outputWriteIndex",
    "writeAddressHex",
    "writeKind",
    "sourceRegister",
    "baseRegister",
    "baseIsX1Alias",
    "fixedOffsetHex",
    "postIncrementHex",
    "widthBytes",
    "valueClass",
    "valueImmediateHex",
    "valueFloat",
    "helperName",
    "instructionText",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileVtableOutputLayoutAudit({
    vtableFunctionAuditPath: optionValue(args, "--vtable-function-audit", defaultVtableFunctionAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileVtableOutputLayoutAudit,
  exportProjectileVtableOutputLayoutAudit,
  extractOutputWrites,
  readTsv,
};
