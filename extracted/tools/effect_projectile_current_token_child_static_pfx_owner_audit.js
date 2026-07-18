#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultLevelVisualsSchemaAuditPath = "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultEffectOwnerCandidateAuditPath =
  "extracted/reports/effect_projectile_current_token_child_effect_owner_candidate_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/effect-projectile-current-token-child-static-pfx-owner-audit.json";
const defaultReportOut = "extracted/reports/effect_projectile_current_token_child_static_pfx_owner_audit.json";
const defaultTsvOut = "extracted/reports/effect_projectile_current_token_child_static_pfx_owner_audit.tsv";

const levelVisualsApplyFunctionHex = "0x8cc27c";
const staticPfxHandlerFunctionHex = "0x8ccd14";

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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x180) {
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

function schemaFieldByOffset(levelVisualsSchemaAudit) {
  const fields = levelVisualsSchemaAudit.fields || [];
  return new Map(fields.map((field) => [normalizeHex(field.fieldOffsetHex ?? field.fieldOffset), field]));
}

function levelVisualsStaticPfxCallsites(levelVisualsInstructions) {
  const rows = [];
  for (let index = 0; index < levelVisualsInstructions.length; index += 1) {
    const instruction = levelVisualsInstructions[index];
    if (callTarget(instruction) !== staticPfxHandlerFunctionHex) continue;
    let fieldOffsetHex = "";
    let fieldLoadInstruction = "";
    let staticPfxArgumentRegister = "";
    for (let cursor = index - 1; cursor >= 0 && cursor >= index - 10; cursor -= 1) {
      const prior = levelVisualsInstructions[cursor];
      const memory = memoryBaseAndOffset(prior.operands);
      if (
        !fieldOffsetHex &&
        prior.mnemonic.startsWith("ldr") &&
        memory?.baseRegister === "x19" &&
        /^x\d+,\s*\[x19/.test(prior.operands)
      ) {
        fieldOffsetHex = memory.offsetHex;
        fieldLoadInstruction = prior.text;
      }
      if (
        !staticPfxArgumentRegister &&
        prior.mnemonic.startsWith("ldr") &&
        memory?.baseRegister === "x8" &&
        /^x1,\s*\[x8\]/.test(prior.operands)
      ) {
        staticPfxArgumentRegister = "x1";
      }
      if (fieldOffsetHex && staticPfxArgumentRegister) break;
    }
    rows.push({
      callsiteHex: instruction.addressHex,
      targetFunctionHex: staticPfxHandlerFunctionHex,
      levelVisualsFieldOffsetHex: fieldOffsetHex,
      fieldLoadInstruction,
      staticPfxArgumentRegister,
    });
  }
  return rows;
}

function analyzeStaticPfxHandler(instructions) {
  let targetAliasesStaticPfxToX19 = false;
  const ownerFieldReadOffsets = [];
  for (const instruction of instructions || []) {
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov" && operands === "x19, x1") {
      targetAliasesStaticPfxToX19 = true;
      continue;
    }
    const memory = memoryBaseAndOffset(operands);
    if (instruction.mnemonic.startsWith("ldr") && memory?.baseRegister === "x19") {
      ownerFieldReadOffsets.push(memory.offsetHex);
    }
  }
  return {
    targetAliasesStaticPfxToX19,
    ownerFieldReadOffsets: uniqueInOrder(ownerFieldReadOffsets),
  };
}

function buildProjectileCurrentTokenChildStaticPfxOwnerAudit({
  levelVisualsSchemaAudit = {},
  effectOwnerCandidateAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const fieldsByOffset = schemaFieldByOffset(levelVisualsSchemaAudit);
  const levelVisualsInstructions = boundedInstructions(
    disassembleFunction(levelVisualsApplyFunctionHex, 0x180),
    levelVisualsApplyFunctionHex,
  );
  const handlerInstructions = boundedInstructions(
    disassembleFunction(staticPfxHandlerFunctionHex, 0x180),
    staticPfxHandlerFunctionHex,
  );
  const handlerAnalysis = analyzeStaticPfxHandler(handlerInstructions);
  const effectOwnerCreateAddressHex =
    (effectOwnerCandidateAudit.items || [])[0]?.candidateFunctionHex || "0x8cced8";
  const effectOwnerDirectCallTargets = (effectOwnerCandidateAudit.items || [])[0]?.directCallTargets || [];

  const items = levelVisualsStaticPfxCallsites(levelVisualsInstructions).map((callsite) => {
    const schemaField = fieldsByOffset.get(callsite.levelVisualsFieldOffsetHex) || {};
    const levelVisualsFieldTypeName = schemaField.typeName || "";
    const x19StaticPfxResolved =
      levelVisualsFieldTypeName === "StaticPfx**" &&
      callsite.staticPfxArgumentRegister === "x1" &&
      handlerAnalysis.targetAliasesStaticPfxToX19;
    return {
      status: "token-child-static-pfx-owner-diagnostic",
      callsiteHex: callsite.callsiteHex,
      levelVisualsApplyFunctionHex,
      levelVisualsFieldOffsetHex: callsite.levelVisualsFieldOffsetHex,
      levelVisualsFieldTypeName,
      fieldLoadInstruction: callsite.fieldLoadInstruction,
      staticPfxArgumentRegister: callsite.staticPfxArgumentRegister,
      targetFunctionHex: callsite.targetFunctionHex,
      targetAliasesStaticPfxToX19: handlerAnalysis.targetAliasesStaticPfxToX19,
      targetOwnerFieldReadOffsets: handlerAnalysis.ownerFieldReadOffsets,
      effectOwnerCreateAddressHex,
      effectOwnerDirectCallTargets,
      x19StaticPfxResolved,
      managerEntryOwnerResolved: false,
      renderPromotionAllowed: false,
      nextRequiredEvidence:
        "join StaticPfx field +0x28/+0x30 to the layout-B object+0x30 manager entry and manager record +0x8 owner before renderer promotion",
    };
  });

  return {
    generatedAt,
    source: {
      levelVisualsSchemaAuditPath: defaultLevelVisualsSchemaAuditPath,
      effectOwnerCandidateAuditPath: defaultEffectOwnerCandidateAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only StaticPfx owner audit; LevelVisuals StaticPfx ownership proves x19 class but does not prove manager-entry render ownership",
    summary: summarize(items),
    items,
  };
}

function summarize(items) {
  return {
    rows: items.length,
    staticPfxListCallsiteRows: items.filter((item) => item.levelVisualsFieldTypeName === "StaticPfx**").length,
    staticPfxSchemaFieldRows: uniqueInOrder(
      items
        .filter((item) => item.levelVisualsFieldTypeName === "StaticPfx**")
        .map((item) => item.levelVisualsFieldOffsetHex),
    ).length,
    effectOwnerFunctionRows: uniqueInOrder(items.map((item) => item.targetFunctionHex)).length,
    x19StaticPfxResolvedRows: items.filter((item) => item.x19StaticPfxResolved).length,
    managerEntryOwnerResolvedRows: items.filter((item) => item.managerEntryOwnerResolved).length,
    renderPromotionAllowedRows: items.filter((item) => item.renderPromotionAllowed).length,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    callsiteHex: item.callsiteHex,
    levelVisualsFieldOffsetHex: item.levelVisualsFieldOffsetHex,
    levelVisualsFieldTypeName: item.levelVisualsFieldTypeName,
    staticPfxArgumentRegister: item.staticPfxArgumentRegister,
    targetFunctionHex: item.targetFunctionHex,
    targetAliasesStaticPfxToX19: item.targetAliasesStaticPfxToX19,
    targetOwnerFieldReadOffsets: item.targetOwnerFieldReadOffsets,
    effectOwnerCreateAddressHex: item.effectOwnerCreateAddressHex,
    x19StaticPfxResolved: item.x19StaticPfxResolved,
    managerEntryOwnerResolved: item.managerEntryOwnerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    nextRequiredEvidence: item.nextRequiredEvidence,
  }));
}

function exportProjectileCurrentTokenChildStaticPfxOwnerAudit({
  levelVisualsSchemaAuditPath = defaultLevelVisualsSchemaAuditPath,
  effectOwnerCandidateAuditPath = defaultEffectOwnerCandidateAuditPath,
  binaryPath = defaultBinaryPath,
  levelVisualsSchemaAudit = readJson(levelVisualsSchemaAuditPath, { fields: [] }),
  effectOwnerCandidateAudit = readJson(effectOwnerCandidateAuditPath, { items: [] }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildStaticPfxOwnerAudit({
    levelVisualsSchemaAudit,
    effectOwnerCandidateAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { levelVisualsSchemaAuditPath, effectOwnerCandidateAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "callsiteHex",
    "levelVisualsFieldOffsetHex",
    "levelVisualsFieldTypeName",
    "staticPfxArgumentRegister",
    "targetFunctionHex",
    "targetAliasesStaticPfxToX19",
    "targetOwnerFieldReadOffsets",
    "effectOwnerCreateAddressHex",
    "x19StaticPfxResolved",
    "managerEntryOwnerResolved",
    "renderPromotionAllowed",
    "nextRequiredEvidence",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildStaticPfxOwnerAudit({
    levelVisualsSchemaAuditPath: optionValue(args, "--levelvisuals-schema", defaultLevelVisualsSchemaAuditPath),
    effectOwnerCandidateAuditPath: optionValue(
      args,
      "--effect-owner-candidate",
      defaultEffectOwnerCandidateAuditPath,
    ),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildStaticPfxOwnerAudit,
  exportProjectileCurrentTokenChildStaticPfxOwnerAudit,
  readTsv,
};
