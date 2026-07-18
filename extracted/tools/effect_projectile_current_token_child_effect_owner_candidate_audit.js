#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultTypeOwnerAuditPath = "extracted/reports/current_native_layout_b_type_owner_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-effect-owner-candidate-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_effect_owner_candidate_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_effect_owner_candidate_audit.tsv";

const layoutBSetupTargets = new Set(["0x8d42b4", "0x8d4540", "0x8d45d4", "0x8d44e4", "0x8d44ec"]);

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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x110) {
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

function boundedInstructions(disassembly, startAddressHex) {
  const start = parseHex(startAddressHex);
  const instructions = parseObjdumpInstructions(disassembly).filter((instruction) => instruction.address >= start);
  const bounded = [];
  for (const instruction of instructions) {
    bounded.push(instruction);
    if (instruction.mnemonic === "ret") break;
  }
  return bounded;
}

function callTarget(instruction) {
  if (instruction?.mnemonic !== "bl") return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
}

function memoryBaseAndOffset(operands) {
  const match = String(operands || "").match(/\[(x\d+)(?:,\s*#(0x[0-9a-fA-F]+|\d+))?\]/);
  if (!match) return null;
  return {
    baseRegister: match[1].toLowerCase(),
    offsetHex: hex(match[2] ? parseNumber(match[2]) : 0),
  };
}

function analyzeCandidateInstructions(instructions) {
  const ownerAliases = new Set(["x19"]);
  const layoutBObjectAliases = new Set();
  const ownerFieldReadOffsets = [];
  const ownerFieldReadInstructions = [];
  const layoutBSetupCallTargets = [];
  const optionalExternalHandleInstructions = [];
  const directCallTargets = [];

  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov") {
      const match = operands.match(/^(x\d+),\s*(x\d+)$/);
      if (match && ownerAliases.has(match[2].toLowerCase())) {
        ownerAliases.add(match[1].toLowerCase());
      }
      if (match && layoutBObjectAliases.has(match[2].toLowerCase())) {
        layoutBObjectAliases.add(match[1].toLowerCase());
      }
      continue;
    }

    const memory = memoryBaseAndOffset(operands);
    if (instruction.mnemonic.startsWith("ld") && memory && ownerAliases.has(memory.baseRegister)) {
      ownerFieldReadOffsets.push(memory.offsetHex);
      ownerFieldReadInstructions.push(instruction.text);
      if (memory.offsetHex === "0x30") optionalExternalHandleInstructions.push(instruction.text);
    }

    const targetHex = callTarget(instruction);
    if (!targetHex) continue;
    directCallTargets.push(targetHex);
    if (targetHex === "0x188b8b8") {
      layoutBObjectAliases.add("x0");
      continue;
    }
    if (layoutBSetupTargets.has(targetHex)) layoutBSetupCallTargets.push(targetHex);
    if (targetHex === "0xd6d6e0" || targetHex === "0x821104") optionalExternalHandleInstructions.push(instruction.text);
  }

  return {
    layoutBSetupCallTargets: uniqueInOrder(layoutBSetupCallTargets),
    ownerFieldReadOffsets: uniqueInOrder(ownerFieldReadOffsets),
    ownerFieldReadInstructions: uniqueInOrder(ownerFieldReadInstructions),
    optionalExternalHandleRecovered:
      ownerFieldReadOffsets.includes("0x30") &&
      directCallTargets.includes("0xd6d6e0") &&
      directCallTargets.includes("0x821104") &&
      layoutBSetupCallTargets.includes("0x8d44e4"),
    optionalExternalHandleInstructions: uniqueInOrder(optionalExternalHandleInstructions),
    directCallTargets: uniqueInOrder(directCallTargets),
  };
}

function buildProjectileCurrentTokenChildEffectOwnerCandidateAudit({
  typeOwnerAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const sourceRows = (typeOwnerAudit.items || []).filter(
    (item) => item.contextRole === "create-layout-b-instance-for-effect-owner",
  );
  const items = sourceRows.map((sourceRow) => {
    const candidateFunctionHex = normalizeHex(sourceRow.xrefAddressHex);
    const instructions = boundedInstructions(disassembleFunction(candidateFunctionHex, 0x110), candidateFunctionHex);
    const analysis = analyzeCandidateInstructions(instructions);
    return {
      status: "token-child-effect-owner-candidate-diagnostic",
      candidateFunctionHex,
      sourceContextRole: sourceRow.contextRole,
      createResolveHelperTargetHex: sourceRow.helperTargetHex,
      layoutBSetupCallTargets: analysis.layoutBSetupCallTargets,
      ownerFieldReadOffsets: analysis.ownerFieldReadOffsets,
      ownerFieldReadInstructions: analysis.ownerFieldReadInstructions,
      optionalExternalHandleRecovered: analysis.optionalExternalHandleRecovered,
      optionalExternalHandleInstructions: analysis.optionalExternalHandleInstructions,
      directCallTargets: analysis.directCallTargets,
      functionStartHex: instructions[0]?.addressHex || "",
      functionEndHex: instructions.at(-1)?.addressHex || "",
      instructionRows: instructions.length,
      pfxEmitterOwnerResolved: false,
      renderPromotionAllowed: false,
      nextRequiredEvidence:
        "prove x19 concrete class/resource owner at this effect-owner create path and tie it to a PFX/emitter runtime definition",
    };
  });
  return {
    generatedAt,
    source: {
      typeOwnerAuditPath: defaultTypeOwnerAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only current projectile token child effect-owner candidate audit; candidate layout-B create path does not prove concrete PFX/emitter ownership",
    summary: summarize(items),
    items,
  };
}

function summarize(items) {
  return {
    rows: items.length,
    effectOwnerCandidateRows: items.length,
    createResolveRows: items.filter((item) => item.createResolveHelperTargetHex === "0x188b8b8").length,
    layoutBSetupCallRows: items.reduce((sum, item) => sum + item.layoutBSetupCallTargets.length, 0),
    ownerFieldReadRows: items.reduce((sum, item) => sum + item.ownerFieldReadOffsets.length, 0),
    optionalExternalHandleRows: items.filter((item) => item.optionalExternalHandleRecovered).length,
    pfxEmitterOwnerResolvedRows: 0,
    renderPromotionAllowedRows: 0,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    candidateFunctionHex: item.candidateFunctionHex,
    sourceContextRole: item.sourceContextRole,
    createResolveHelperTargetHex: item.createResolveHelperTargetHex,
    layoutBSetupCallTargets: item.layoutBSetupCallTargets,
    ownerFieldReadOffsets: item.ownerFieldReadOffsets,
    optionalExternalHandleRecovered: item.optionalExternalHandleRecovered,
    directCallTargets: item.directCallTargets,
    functionStartHex: item.functionStartHex,
    functionEndHex: item.functionEndHex,
    instructionRows: item.instructionRows,
    pfxEmitterOwnerResolved: item.pfxEmitterOwnerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    nextRequiredEvidence: item.nextRequiredEvidence,
  }));
}

function exportProjectileCurrentTokenChildEffectOwnerCandidateAudit({
  typeOwnerAuditPath = defaultTypeOwnerAuditPath,
  binaryPath = defaultBinaryPath,
  typeOwnerAudit = readJson(typeOwnerAuditPath, { items: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildEffectOwnerCandidateAudit({
    typeOwnerAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { typeOwnerAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "candidateFunctionHex",
    "sourceContextRole",
    "createResolveHelperTargetHex",
    "layoutBSetupCallTargets",
    "ownerFieldReadOffsets",
    "optionalExternalHandleRecovered",
    "directCallTargets",
    "functionStartHex",
    "functionEndHex",
    "instructionRows",
    "pfxEmitterOwnerResolved",
    "renderPromotionAllowed",
    "nextRequiredEvidence",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildEffectOwnerCandidateAudit({
    typeOwnerAuditPath: optionValue(args, "--type-owner-audit", defaultTypeOwnerAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildEffectOwnerCandidateAudit,
  exportProjectileCurrentTokenChildEffectOwnerCandidateAudit,
  readTsv,
};
