#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-static-mesh-shaderparams-capture-targets.json";
const defaultJsonOut = "extracted/reports/current_native_static_mesh_shaderparams_capture_targets.json";
const defaultTsvOut = "extracted/reports/current_native_static_mesh_shaderparams_capture_targets.tsv";
const defaultFridaOut = "extracted/reports/frida_capture_current_static_mesh_shaderparams.js";

const hookTargets = [
  {
    name: "level-visuals-apply-processor",
    offset: 0x8cc27c,
    expectedOpcodeHex: "d10243ff",
    captureKind: "levelvisuals-field-snapshot",
    registerSource: "args[1]",
    reason: "capture live LevelVisuals fields before the apply processor routes StaticMesh lists",
  },
  {
    name: "level-visuals-staticmesh-route-a",
    offset: 0x8cc2cc,
    expectedOpcodeHex: "940001e6",
    captureKind: "levelvisuals-staticmesh-route-callsite",
    registerSource: "callsite-registers",
    reason: "capture the always-on LevelVisuals +0x8 StaticMesh** route into helper 0x8cca64",
  },
  {
    name: "level-visuals-staticmesh-route-conditional",
    offset: 0x8cc318,
    expectedOpcodeHex: "940001d3",
    captureKind: "levelvisuals-staticmesh-route-callsite",
    registerSource: "callsite-registers",
    reason: "capture the predicate-true LevelVisuals +0x18 StaticMesh** route into helper 0x8cca64",
  },
  {
    name: "level-visuals-staticmesh-route-fallback",
    offset: 0x8cc360,
    expectedOpcodeHex: "940001c1",
    captureKind: "levelvisuals-staticmesh-route-callsite",
    registerSource: "callsite-registers",
    reason: "capture the predicate-false LevelVisuals +0x10 StaticMesh** route into helper 0x8cca64",
  },
  {
    name: "staticmesh-child-payload-field-read",
    offset: 0x8ccad8,
    expectedOpcodeHex: "f9401a61",
    captureKind: "staticmesh-field-snapshot",
    staticMeshRegister: "x19",
    reason: "capture live StaticMesh +0x30 char* selector child payload at the proven read",
  },
  {
    name: "staticmesh-shaderparams-field-read",
    offset: 0x8ccae8,
    expectedOpcodeHex: "f9403661",
    captureKind: "staticmesh-field-snapshot",
    staticMeshRegister: "x19",
    reason: "capture live StaticMesh +0x68 ShaderParams** at the proven read",
  },
  {
    name: "staticmesh-post-transform-field-read",
    offset: 0x8ccb08,
    expectedOpcodeHex: "91010262",
    captureKind: "staticmesh-field-snapshot",
    staticMeshRegister: "x19",
    reason: "capture live StaticMesh +0x40 NamedAnimation block at the proven post-child setup argument",
  },
];

const opcodeEvidence = [
  {
    role: "selector-caller-config-load",
    address: 0x8ccaa4,
    expectedOpcodeHex: "f9401c28",
    evidence: "0x8cca64 loads StaticMesh +0x38 as config/resource pointer before selector setup.",
  },
  {
    role: "selector-caller-config-validate-call",
    address: 0x8ccaac,
    expectedOpcodeHex: "9412830d",
    evidence: "0x8cca64 validates StaticMesh +0x38 through 0xd6d6e0 before using selector resources.",
  },
  {
    role: "selector-caller-child-attach-payload-load",
    address: 0x8ccad8,
    expectedOpcodeHex: "f9401a61",
    evidence: "0x8cca64 loads StaticMesh +0x30 before selector child attach.",
  },
  {
    role: "selector-caller-resource-list-load",
    address: 0x8ccae8,
    expectedOpcodeHex: "f9403661",
    evidence: "0x8cca64 loads StaticMesh +0x68 as the ShaderParams/resource-list argument to 0x8d551c.",
  },
  {
    role: "selector-caller-selector-call",
    address: 0x8ccaf0,
    expectedOpcodeHex: "9400228b",
    evidence: "0x8cca64 invokes selector wrapper 0x8d551c after loading StaticMesh +0x68.",
  },
  {
    role: "selector-caller-post-transform-arg",
    address: 0x8ccb08,
    expectedOpcodeHex: "91010262",
    evidence: "0x8cca64 passes StaticMesh +0x40 as the post child transform/config block.",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function rowForSpec(buffer, elf, spec, source) {
  const address = spec.offset ?? spec.address;
  const actualOpcodeHex = instructionHexAt(buffer, elf, address);
  return {
    source,
    name: spec.name || "",
    role: spec.role || "",
    addressHex: hex(address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    captureKind: spec.captureKind || "",
    registerSource: spec.registerSource || spec.staticMeshRegister || "",
    reason: spec.reason || "",
    evidence: spec.evidence || "",
    renderPromotionAllowed: false,
  };
}

function fridaScriptForTargets(targets) {
  return `"use strict";
const CONFIG = {
  includeBacktrace: false,
  maxEventsPerHook: 256,
  maxStringBytes: 512,
  maxPrefixBytes: 96,
  maxListItems: 8,
};

const MODULE_NAMES = ["libGameKindred.so", "GameKindred"];
const HOOK_TARGETS = ${JSON.stringify(targets, null, 2)};

const LEVEL_VISUALS_FIELDS = [
  { fieldIndex: 1, name: "sourceTableSelectorListA", levelVisualsOffset: 0x8, typeName: "StaticMesh**" },
  { fieldIndex: 2, name: "fallbackSourceTableSelectorList", levelVisualsOffset: 0x10, typeName: "StaticMesh**" },
  { fieldIndex: 3, name: "conditionalSourceTableSelectorList", levelVisualsOffset: 0x18, typeName: "StaticMesh**" },
  { fieldIndex: 10, name: "profilePayload", levelVisualsOffset: 0x50, typeName: "char*" },
];

function findGameModule() {
  for (const name of MODULE_NAMES) {
    const module = Process.findModuleByName(name);
    if (module) return module;
  }
  return Process.enumerateModules().find((module) => /GameKindred/i.test(module.name));
}

function toHex(value) {
  try {
    if (value === null || value === undefined) return "";
    return ptr(value).toString();
  } catch {
    return String(value);
  }
}

function safe(label, fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    return fallback ?? { error: label + ": " + String(error) };
  }
}

function readPointer(address) {
  return safe("readPointer", () => ptr(address).readPointer(), ptr(0));
}

function readU32(address) {
  return safe("readU32", () => ptr(address).readU32(), null);
}

function readPointerBytes(address, byteLength = CONFIG.maxPrefixBytes) {
  return safe("readPointerBytes", () => {
    const pointer = ptr(address);
    if (pointer.isNull()) return "";
    const bytes = pointer.readByteArray(byteLength);
    if (!bytes) return "";
    return Array.from(new Uint8Array(bytes))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }, "");
}

function readCString(address) {
  return safe("readCString", () => {
    const pointer = ptr(address);
    if (pointer.isNull()) return "";
    return pointer.readUtf8String(CONFIG.maxStringBytes) || "";
  }, "");
}

function readCStringPointerField(objectPointer, fieldOffset) {
  const object = ptr(objectPointer);
  const fieldPointer = object.isNull() ? ptr(0) : readPointer(object.add(fieldOffset));
  return {
    fieldOffsetHex: "0x" + fieldOffset.toString(16),
    fieldPointer: toHex(fieldPointer),
    string: fieldPointer.isNull() ? "" : readCString(fieldPointer),
  };
}

function readPointerField(objectPointer, fieldOffset, prefixBytes = CONFIG.maxPrefixBytes) {
  const object = ptr(objectPointer);
  const fieldPointer = object.isNull() ? ptr(0) : readPointer(object.add(fieldOffset));
  return {
    fieldOffsetHex: "0x" + fieldOffset.toString(16),
    fieldPointer: toHex(fieldPointer),
    targetPrefixHex: fieldPointer.isNull() ? "" : readPointerBytes(fieldPointer, prefixBytes),
  };
}

function readShaderParamPointerList(listPointer) {
  const list = ptr(listPointer);
  const items = [];
  if (list.isNull()) return { listPointer: "", items, boundary: "null ShaderParam** list" };
  for (let index = 0; index < CONFIG.maxListItems; index += 1) {
    const itemPointer = readPointer(list.add(index * Process.pointerSize));
    if (itemPointer.isNull()) break;
    items.push({
      index,
      shaderParamPointer: toHex(itemPointer),
      scalarU32: readU32(itemPointer),
      prefixHex: readPointerBytes(itemPointer, 0x10),
    });
  }
  return {
    listPointer: toHex(list),
    items,
    boundary: "bounded prefix only; ShaderParam** count is not recovered by this capture target",
  };
}

function readShaderParamsPointerList(listPointer) {
  const list = ptr(listPointer);
  const items = [];
  if (list.isNull()) return { listPointer: "", items, boundary: "null ShaderParams** list" };
  for (let index = 0; index < CONFIG.maxListItems; index += 1) {
    const itemPointer = readPointer(list.add(index * Process.pointerSize));
    if (itemPointer.isNull()) break;
    const sourceKeyPointer = readPointer(itemPointer.add(0x0));
    const shaderParamListPointer = readPointer(itemPointer.add(0x8));
    items.push({
      index,
      shaderParamsPointer: toHex(itemPointer),
      sourceKeyPointer: toHex(sourceKeyPointer),
      sourceKey: sourceKeyPointer.isNull() ? "" : readCString(sourceKeyPointer),
      shaderParamList: readShaderParamPointerList(shaderParamListPointer),
      prefixHex: readPointerBytes(itemPointer, 0x20),
    });
  }
  return {
    listPointer: toHex(list),
    items,
    boundary: "bounded prefix only; ShaderParams** count and active source semantics are not recovered by this capture target",
  };
}

function readLevelVisualsSnapshot(levelVisualsPointer) {
  const object = ptr(levelVisualsPointer);
  return {
    levelVisualsPointer: toHex(object),
    prefixHex: object.isNull() ? "" : readPointerBytes(object, 0x70),
    fields: LEVEL_VISUALS_FIELDS.map((field) => ({
      ...field,
      levelVisualsOffsetHex: "0x" + field.levelVisualsOffset.toString(16),
      ...readPointerField(object, field.levelVisualsOffset, 0x40),
    })),
    boundary:
      "Runtime field snapshot only; this does not prove active hero/model preview ownership or exact StaticMesh list item layout.",
  };
}

function readStaticMeshSnapshot(staticMeshPointer) {
  const object = ptr(staticMeshPointer);
  const shaderParamsListPointer = object.isNull() ? ptr(0) : readPointer(object.add(0x68));
  return {
    staticMeshPointer: toHex(object),
    prefixHex: object.isNull() ? "" : readPointerBytes(object, 0x78),
    field28: readCStringPointerField(object, 0x28),
    field30ChildPayload: readCStringPointerField(object, 0x30),
    field38Config: readCStringPointerField(object, 0x38),
    field40NamedAnimationPrefixHex: object.isNull() ? "" : readPointerBytes(object.add(0x40), 0x28),
    field68ShaderParamsListPointer: toHex(shaderParamsListPointer),
    field68ShaderParamsList: readShaderParamsPointerList(shaderParamsListPointer),
    field70: readPointerField(object, 0x70, 0x40),
    boundary:
      "Runtime StaticMesh snapshot only; field values are diagnostic until active resource semantics and shader/texture formulas are recovered.",
  };
}

function contextRegisters(context) {
  return {
    pc: toHex(context.pc),
    lr: toHex(context.lr),
    x0: toHex(context.x0),
    x1: toHex(context.x1),
    x2: toHex(context.x2),
    x3: toHex(context.x3),
    x19: toHex(context.x19),
    x20: toHex(context.x20),
    x21: toHex(context.x21),
  };
}

function backtrace(context) {
  if (!CONFIG.includeBacktrace) return [];
  return safe("backtrace", () =>
    Thread.backtrace(context, Backtracer.ACCURATE)
      .slice(0, 16)
      .map((address) => DebugSymbol.fromAddress(address).toString()),
  [],);
}

const eventCounts = new Map();

function shouldEmit(event) {
  const count = (eventCounts.get(event) || 0) + 1;
  eventCounts.set(event, count);
  if (count <= CONFIG.maxEventsPerHook) return true;
  if (count === CONFIG.maxEventsPerHook + 1) return true;
  return false;
}

function emit(record) {
  const event = record.event || "unknown";
  if (!shouldEmit(event)) return;
  if (eventCounts.get(event) === CONFIG.maxEventsPerHook + 1) {
    console.log(JSON.stringify({ type: "static_mesh_shaderparams_capture_suppressed", event }));
    return;
  }
  console.log(
    JSON.stringify({
      type: "static_mesh_shaderparams_capture_event",
      timestampMs: Date.now(),
      threadId: Process.getCurrentThreadId(),
      ...record,
    }),
  );
}

function attachTarget(moduleBase, target) {
  const address = moduleBase.add(target.offset);
  Interceptor.attach(address, {
    onEnter(args) {
      const base = {
        event: target.name,
        captureKind: target.captureKind,
        offset: "0x" + target.offset.toString(16),
        runtimeAddress: toHex(address),
        reason: target.reason,
        registers: contextRegisters(this.context),
        args: [toHex(args[0]), toHex(args[1]), toHex(args[2]), toHex(args[3])],
        backtrace: backtrace(this.context),
      };
      if (target.captureKind === "levelvisuals-field-snapshot") {
        emit({
          ...base,
          levelVisualsSnapshot: readLevelVisualsSnapshot(args[1]),
        });
        return;
      }
      if (target.captureKind === "staticmesh-field-snapshot") {
        emit({
          ...base,
          staticMeshSnapshot: readStaticMeshSnapshot(this.context.x19),
        });
        return;
      }
      emit(base);
    },
  });
  emit({
    event: "hook-installed",
    target: target.name,
    captureKind: target.captureKind,
    offset: "0x" + target.offset.toString(16),
    runtimeAddress: toHex(address),
  });
}

function install() {
  const gameModule = findGameModule();
  if (!gameModule) {
    emit({ event: "module-not-found", moduleNames: MODULE_NAMES });
    return;
  }
  emit({
    event: "capture-begin",
    moduleName: gameModule.name,
    moduleBase: toHex(gameModule.base),
    targetCount: HOOK_TARGETS.length,
    policy:
      "diagnostic-only capture of live LevelVisuals and StaticMesh ShaderParams fields; no renderer takeover is implied",
  });
  for (const target of HOOK_TARGETS) {
    try {
      attachTarget(gameModule.base, target);
    } catch (error) {
      emit({
        event: "hook-install-error",
        target: target.name,
        offset: "0x" + target.offset.toString(16),
        error: String(error),
      });
    }
  }
}

setImmediate(install);
`;
}

function buildCurrentNativeStaticMeshShaderParamsCaptureTargets(
  {
    binaryPath = defaultBinary,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const hookRows = hookTargets.map((target) => rowForSpec(buffer, elf, target, "hook-target"));
  const evidenceRows = opcodeEvidence.map((spec) => rowForSpec(buffer, elf, spec, "opcode-evidence"));
  const items = [...hookRows, ...evidenceRows];
  const opcodeMismatchRows = items.filter((row) => !row.opcodeMatches).length;
  const staticMeshFieldHookRows = hookRows.filter((row) => row.captureKind === "staticmesh-field-snapshot").length;
  const levelVisualsHookRows = hookRows.filter((row) => row.captureKind.startsWith("levelvisuals")).length;
  const summary = {
    hookTargetRows: hookRows.length,
    opcodeRows: items.length,
    opcodeMismatchRows,
    levelVisualsHookRows,
    staticMeshFieldHookRows,
    captureScriptGenerated: true,
    levelVisualsApplySnapshotHookReady:
      opcodeMismatchRows === 0 && hookRows.some((row) => row.name === "level-visuals-apply-processor"),
    staticMeshSelectorFieldHooksReady:
      opcodeMismatchRows === 0 &&
      hookRows.some((row) => row.name === "staticmesh-child-payload-field-read") &&
      hookRows.some((row) => row.name === "staticmesh-shaderparams-field-read") &&
      hookRows.some((row) => row.name === "staticmesh-post-transform-field-read"),
    shaderParamsBoundedPrefixCaptureReady:
      opcodeMismatchRows === 0 && hookRows.some((row) => row.name === "staticmesh-shaderparams-field-read"),
    runtimeCaptureRequiredRows: 1,
    activeResourceSemanticsRecovered: false,
    shaderParamsValueSemanticsRecovered: false,
    shaderTextureFormulaRecovered: false,
    renderPromotionAllowedRows: 0,
  };

  return {
    generatedAt,
    binaryPath,
    fridaOut: defaultFridaOut,
    policy:
      "diagnostic-only live capture targets for StaticMesh ShaderParams values; proves hook points and bounded field readers without enabling renderer takeover",
    summary,
    hookTargets,
    interpretation: {
      recovered:
        "Opcode-backed hook targets can capture LevelVisuals field snapshots and live StaticMesh +0x30/+0x38/+0x40/+0x68 values at the current selector path.",
      boundary:
        "The generated Frida script reads only bounded prefixes. It still does not recover list counts, active hero/model preview ownership, ShaderParams value semantics, or shader/texture formulas.",
      nextRequiredEvidence:
        "Run the capture against the current game runtime, summarize observed StaticMesh +0x68 ShaderParams keys and parameter ids, then map them to source/program table entries before changing viewer rendering.",
    },
    items,
  };
}

function exportCurrentNativeStaticMeshShaderParamsCaptureTargets({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  fridaOut = defaultFridaOut,
} = {}) {
  const manifest = buildCurrentNativeStaticMeshShaderParamsCaptureTargets({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(fridaOut), { recursive: true });
  fs.writeFileSync(fridaOut, fridaScriptForTargets(hookTargets));
  writeTsv(tsvOut, manifest.items, [
    "source",
    "name",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "captureKind",
    "registerSource",
    "reason",
    "evidence",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeStaticMeshShaderParamsCaptureTargets({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    fridaOut: optionValue(args, "--frida-out", defaultFridaOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeStaticMeshShaderParamsCaptureTargets,
  exportCurrentNativeStaticMeshShaderParamsCaptureTargets,
  fridaScriptForTargets,
};
