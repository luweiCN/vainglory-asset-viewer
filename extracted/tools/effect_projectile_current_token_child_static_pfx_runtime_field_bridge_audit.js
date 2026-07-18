#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseObjdumpInstructionLine } = require("./effect_projectile_current_token_window_audit");

const defaultNativeEffectRuntimeSchemaPath = "extracted/viewer/native-effect-runtime-schema.json";
const defaultCurrentLevelVisualsSchemaAuditPath = "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultStaticPfxOwnerAuditPath =
  "extracted/reports/effect_projectile_current_token_child_static_pfx_owner_audit.json";
const defaultBinaryPath = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut =
  "extracted/viewer/effect-projectile-current-token-child-static-pfx-runtime-field-bridge-audit.json";
const defaultReportOut =
  "extracted/reports/effect_projectile_current_token_child_static_pfx_runtime_field_bridge_audit.json";
const defaultTsvOut =
  "extracted/reports/effect_projectile_current_token_child_static_pfx_runtime_field_bridge_audit.tsv";

const staticPfxHandlerFunctionHex = "0x8ccd14";
const resourceSetterFunctionHex = "0x8d42b4";
const parameterSetterFunctionHex = "0x8d44e4";
const activationFunctionHex = "0x8d44ec";
const activationRuntimeTargetHex = "0xe39570";

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

function defaultDisassembleFunction(binaryPath, addressHex, byteLength = 0x260) {
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
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `objdump failed for ${addressHex}`);
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

function callOrBranchTarget(instruction) {
  if (!instruction?.mnemonic?.startsWith("b")) return "";
  return normalizeHex(instruction.operands.match(/0x[0-9a-fA-F]+/)?.[0] || "");
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

function fieldRowByOffset(schema, typeName, fieldOffsetHex) {
  const offset = normalizeHex(fieldOffsetHex);
  return (schema.items || []).find(
    (item) => item.typeName === typeName && normalizeHex(item.fieldOffset) === offset,
  );
}

function currentCharFieldOffsets(currentLevelVisualsSchemaAudit) {
  return new Set(
    (currentLevelVisualsSchemaAudit.fields || [])
      .filter((field) => field.typeName === "char*")
      .map((field) => normalizeHex(field.fieldOffsetHex ?? field.fieldOffset)),
  );
}

function charPointerSymbols(nativeEffectRuntimeSchema, currentLevelVisualsSchemaAudit) {
  const charOffsets = currentCharFieldOffsets(currentLevelVisualsSchemaAudit);
  return new Set(
    (nativeEffectRuntimeSchema.items || [])
      .filter((item) => item.typeName === "LevelVisuals" && charOffsets.has(normalizeHex(item.fieldOffset)))
      .map((item) => item.typePointerSymbol)
      .filter(Boolean),
  );
}

function staticPfxFieldTypeName(nativeEffectRuntimeSchema, currentLevelVisualsSchemaAudit, offsetHex) {
  const field = fieldRowByOffset(nativeEffectRuntimeSchema, "StaticPfx", offsetHex);
  if (!field) return "";
  return charPointerSymbols(nativeEffectRuntimeSchema, currentLevelVisualsSchemaAudit).has(field.typePointerSymbol)
    ? "char*"
    : "";
}

function previousWindow(instructions, index, count = 8) {
  return instructions.slice(Math.max(0, index - count), index);
}

function hasLoadFromStaticPfxField(instructions, index, destinationRegister, fieldOffsetHex) {
  return previousWindow(instructions, index, 10).some((instruction) => {
    const memory = memoryBaseAndOffset(instruction.operands);
    return (
      instruction.mnemonic.startsWith("ldr") &&
      instruction.operands.trim().startsWith(`${destinationRegister},`) &&
      memory?.baseRegister === "x19" &&
      memory.offsetHex === fieldOffsetHex
    );
  });
}

function hasMoveBeforeCall(instructions, index, destinationRegister, sourceRegister) {
  return previousWindow(instructions, index, 8).some(
    (instruction) => instruction.mnemonic === "mov" && instruction.operands.trim() === `${destinationRegister}, ${sourceRegister}`,
  );
}

function analyzeStaticPfxHandler(instructions) {
  const result = {
    targetAliasesStaticPfxToX19: false,
    resourceKeyCallResolved: false,
    parameterKeyCheckResolved: false,
    parameterKeySetterCallResolved: false,
    activationCallResolved: false,
  };

  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    const operands = instruction.operands.trim();
    if (instruction.mnemonic === "mov" && operands === "x19, x1") {
      result.targetAliasesStaticPfxToX19 = true;
      continue;
    }
    const targetHex = callTarget(instruction);
    if (targetHex === resourceSetterFunctionHex) {
      result.resourceKeyCallResolved =
        hasLoadFromStaticPfxField(instructions, index, "x1", "0x28") &&
        hasMoveBeforeCall(instructions, index, "x0", "x20");
      continue;
    }
    if (targetHex === "0xd6d6e0") {
      result.parameterKeyCheckResolved =
        result.parameterKeyCheckResolved || hasLoadFromStaticPfxField(instructions, index, "x0", "0x30");
      continue;
    }
    if (targetHex === parameterSetterFunctionHex) {
      result.parameterKeySetterCallResolved = hasMoveBeforeCall(instructions, index, "x0", "x20");
      continue;
    }
    if (targetHex === activationFunctionHex) {
      result.activationCallResolved = hasMoveBeforeCall(instructions, index, "x0", "x20");
    }
  }

  return result;
}

function analyzeResourceSetter(instructions) {
  return {
    runtimeObjectWriteOffsetHex: instructions.some((instruction) => {
      const memory = memoryBaseAndOffset(instruction.operands);
      return instruction.mnemonic.startsWith("str") && memory?.baseRegister === "x19" && memory.offsetHex === "0x50";
    })
      ? "0x50"
      : "",
  };
}

function analyzeParameterSetter(instructions) {
  return {
    runtimeObjectWriteOffsetHex: instructions.some((instruction) => {
      const memory = memoryBaseAndOffset(instruction.operands);
      return instruction.mnemonic.startsWith("str") && memory?.baseRegister === "x0" && memory.offsetHex === "0xb4";
    })
      ? "0xb4"
      : "",
  };
}

function analyzeActivation(instructions) {
  const readsObject50 = instructions.some((instruction) => {
    const memory = memoryBaseAndOffset(instruction.operands);
    return instruction.mnemonic.startsWith("ldr") && memory?.baseRegister === "x0" && memory.offsetHex === "0x50";
  });
  const activationTargetHex =
    instructions.map(callOrBranchTarget).find((targetHex) => targetHex === activationRuntimeTargetHex) || "";
  return {
    runtimeObjectReadOffsetHex: readsObject50 ? "0x50" : "",
    activationTargetHex,
  };
}

function ownerResolved(staticPfxOwnerAudit) {
  return Boolean(
    staticPfxOwnerAudit.summary?.x19StaticPfxResolvedRows ||
      (staticPfxOwnerAudit.items || []).some((item) => item.x19StaticPfxResolved),
  );
}

function buildProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
  nativeEffectRuntimeSchema = {},
  currentLevelVisualsSchemaAudit = {},
  staticPfxOwnerAudit = {},
  disassembleFunction = () => "",
  generatedAt = new Date().toISOString(),
} = {}) {
  const handlerInstructions = boundedInstructions(
    disassembleFunction(staticPfxHandlerFunctionHex, 0x300),
    staticPfxHandlerFunctionHex,
  );
  const resourceSetterInstructions = boundedInstructions(
    disassembleFunction(resourceSetterFunctionHex, 0xe0),
    resourceSetterFunctionHex,
  );
  const parameterSetterInstructions = boundedInstructions(
    disassembleFunction(parameterSetterFunctionHex, 0x20),
    parameterSetterFunctionHex,
  );
  const activationInstructions = boundedInstructions(
    disassembleFunction(activationFunctionHex, 0x30),
    activationFunctionHex,
  );

  const staticPfxOwnerResolved = ownerResolved(staticPfxOwnerAudit);
  const handlerAnalysis = analyzeStaticPfxHandler(handlerInstructions);
  const resourceSetterAnalysis = analyzeResourceSetter(resourceSetterInstructions);
  const parameterSetterAnalysis = analyzeParameterSetter(parameterSetterInstructions);
  const activationAnalysis = analyzeActivation(activationInstructions);
  const resourceFieldTypeName = staticPfxFieldTypeName(
    nativeEffectRuntimeSchema,
    currentLevelVisualsSchemaAudit,
    "0x28",
  );
  const parameterFieldTypeName = staticPfxFieldTypeName(
    nativeEffectRuntimeSchema,
    currentLevelVisualsSchemaAudit,
    "0x30",
  );

  const resourceBridgeResolved =
    staticPfxOwnerResolved &&
    handlerAnalysis.targetAliasesStaticPfxToX19 &&
    resourceFieldTypeName === "char*" &&
    handlerAnalysis.resourceKeyCallResolved &&
    resourceSetterAnalysis.runtimeObjectWriteOffsetHex === "0x50";
  const parameterBridgeResolved =
    staticPfxOwnerResolved &&
    handlerAnalysis.targetAliasesStaticPfxToX19 &&
    parameterFieldTypeName === "char*" &&
    handlerAnalysis.parameterKeyCheckResolved &&
    handlerAnalysis.parameterKeySetterCallResolved &&
    parameterSetterAnalysis.runtimeObjectWriteOffsetHex === "0xb4";
  const activationResolved =
    handlerAnalysis.activationCallResolved &&
    activationAnalysis.runtimeObjectReadOffsetHex === "0x50" &&
    activationAnalysis.activationTargetHex === activationRuntimeTargetHex;

  const commonBlocker =
    "StaticPfx keys are now bridged into layout-B runtime fields, but manager-record owner/draw/emitter semantics are still not fully recovered";
  const items = [
    {
      status: "static-pfx-runtime-field-bridge-diagnostic",
      bridgeKind: "resource-key-to-object50",
      staticPfxFieldOffsetHex: "0x28",
      staticPfxFieldTypeName: resourceFieldTypeName,
      handlerFunctionHex: staticPfxHandlerFunctionHex,
      handlerCallTargetHex: resourceSetterFunctionHex,
      runtimeObjectWriteOffsetHex: resourceSetterAnalysis.runtimeObjectWriteOffsetHex,
      staticPfxOwnerResolved,
      bridgeResolved: resourceBridgeResolved,
      managerEntryOwnerResolved: false,
      renderPromotionAllowed: false,
      blocker: commonBlocker,
    },
    {
      status: "static-pfx-runtime-field-bridge-diagnostic",
      bridgeKind: "parameter-key-to-object-b4",
      staticPfxFieldOffsetHex: "0x30",
      staticPfxFieldTypeName: parameterFieldTypeName,
      handlerFunctionHex: staticPfxHandlerFunctionHex,
      handlerCallTargetHex: parameterSetterFunctionHex,
      runtimeObjectWriteOffsetHex: parameterSetterAnalysis.runtimeObjectWriteOffsetHex,
      staticPfxOwnerResolved,
      bridgeResolved: parameterBridgeResolved,
      managerEntryOwnerResolved: false,
      renderPromotionAllowed: false,
      blocker: commonBlocker,
    },
    {
      status: "static-pfx-runtime-field-bridge-diagnostic",
      bridgeKind: "object50-activation-only",
      staticPfxFieldOffsetHex: "",
      staticPfxFieldTypeName: "",
      handlerFunctionHex: staticPfxHandlerFunctionHex,
      handlerCallTargetHex: activationFunctionHex,
      runtimeObjectReadOffsetHex: activationAnalysis.runtimeObjectReadOffsetHex,
      activationTargetHex: activationAnalysis.activationTargetHex,
      staticPfxOwnerResolved,
      bridgeResolved: activationResolved,
      managerEntryOwnerResolved: false,
      renderPromotionAllowed: false,
      blocker: commonBlocker,
    },
  ];

  return {
    generatedAt,
    source: {
      nativeEffectRuntimeSchemaPath: defaultNativeEffectRuntimeSchemaPath,
      currentLevelVisualsSchemaAuditPath: defaultCurrentLevelVisualsSchemaAuditPath,
      staticPfxOwnerAuditPath: defaultStaticPfxOwnerAuditPath,
      binaryPath: defaultBinaryPath,
    },
    policy:
      "diagnostic-only StaticPfx runtime field bridge audit; keys are traced to layout-B fields but renderer promotion is blocked until manager-record owner and draw semantics are proven",
    summary: summarize(items),
    items,
  };
}

function summarize(items) {
  return {
    rows: items.length,
    staticPfxCharFieldRows: items.filter((item) => item.staticPfxFieldTypeName === "char*").length,
    staticPfxOwnerResolvedRows: items.filter((item) => item.staticPfxOwnerResolved).length ? 1 : 0,
    resourceKeyToObject50ResolvedRows: items.filter(
      (item) => item.bridgeKind === "resource-key-to-object50" && item.bridgeResolved,
    ).length,
    parameterKeyToObjectB4ResolvedRows: items.filter(
      (item) => item.bridgeKind === "parameter-key-to-object-b4" && item.bridgeResolved,
    ).length,
    object50ActivationRows: items.filter((item) => item.bridgeKind === "object50-activation-only" && item.bridgeResolved)
      .length,
    managerEntryOwnerResolvedRows: items.filter((item) => item.managerEntryOwnerResolved).length,
    renderPromotionAllowedRows: items.filter((item) => item.renderPromotionAllowed).length,
  };
}

function reportRowsForAudit(audit) {
  return (audit.items || []).map((item) => ({
    status: item.status,
    bridgeKind: item.bridgeKind,
    staticPfxFieldOffsetHex: item.staticPfxFieldOffsetHex,
    staticPfxFieldTypeName: item.staticPfxFieldTypeName,
    handlerFunctionHex: item.handlerFunctionHex,
    handlerCallTargetHex: item.handlerCallTargetHex,
    runtimeObjectWriteOffsetHex: item.runtimeObjectWriteOffsetHex,
    runtimeObjectReadOffsetHex: item.runtimeObjectReadOffsetHex,
    activationTargetHex: item.activationTargetHex,
    staticPfxOwnerResolved: item.staticPfxOwnerResolved,
    bridgeResolved: item.bridgeResolved,
    managerEntryOwnerResolved: item.managerEntryOwnerResolved,
    renderPromotionAllowed: item.renderPromotionAllowed,
    blocker: item.blocker,
  }));
}

function exportProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
  nativeEffectRuntimeSchemaPath = defaultNativeEffectRuntimeSchemaPath,
  currentLevelVisualsSchemaAuditPath = defaultCurrentLevelVisualsSchemaAuditPath,
  staticPfxOwnerAuditPath = defaultStaticPfxOwnerAuditPath,
  binaryPath = defaultBinaryPath,
  nativeEffectRuntimeSchema = readJson(nativeEffectRuntimeSchemaPath, { items: [] }),
  currentLevelVisualsSchemaAudit = readJson(currentLevelVisualsSchemaAuditPath, { fields: [] }),
  staticPfxOwnerAudit = readJson(staticPfxOwnerAuditPath, { items: [], summary: {} }),
  disassembleFunction = (addressHex, byteLength) => defaultDisassembleFunction(binaryPath, addressHex, byteLength),
  generatedAt = new Date().toISOString(),
  viewerOut = defaultViewerOut,
  reportOut = defaultReportOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const audit = buildProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
    nativeEffectRuntimeSchema,
    currentLevelVisualsSchemaAudit,
    staticPfxOwnerAudit,
    disassembleFunction,
    generatedAt,
  });
  audit.source = { nativeEffectRuntimeSchemaPath, currentLevelVisualsSchemaAuditPath, staticPfxOwnerAuditPath, binaryPath };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(audit, null, 2)}\n`);
  fs.mkdirSync(path.dirname(reportOut), { recursive: true });
  fs.writeFileSync(reportOut, `${JSON.stringify(audit, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(audit), [
    "status",
    "bridgeKind",
    "staticPfxFieldOffsetHex",
    "staticPfxFieldTypeName",
    "handlerFunctionHex",
    "handlerCallTargetHex",
    "runtimeObjectWriteOffsetHex",
    "runtimeObjectReadOffsetHex",
    "activationTargetHex",
    "staticPfxOwnerResolved",
    "bridgeResolved",
    "managerEntryOwnerResolved",
    "renderPromotionAllowed",
    "blocker",
  ]);
  return audit;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit({
    nativeEffectRuntimeSchemaPath: optionValue(args, "--native-effect-schema", defaultNativeEffectRuntimeSchemaPath),
    currentLevelVisualsSchemaAuditPath: optionValue(
      args,
      "--current-levelvisuals-schema",
      defaultCurrentLevelVisualsSchemaAuditPath,
    ),
    staticPfxOwnerAuditPath: optionValue(args, "--static-pfx-owner", defaultStaticPfxOwnerAuditPath),
    binaryPath: optionValue(args, "--binary", defaultBinaryPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    reportOut: optionValue(args, "--report-out", defaultReportOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  }).summary;
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit,
  exportProjectileCurrentTokenChildStaticPfxRuntimeFieldBridgeAudit,
  readTsv,
};
