#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-object-ac-runtime-capture-targets.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_object_ac_runtime_capture_targets.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_object_ac_runtime_capture_targets.tsv";
const defaultFridaOut = "extracted/reports/frida_capture_layout_b_object_ac_runtime_targets.js";

const hookTargets = [
  {
    name: "layout-b-slot0-register-entry",
    offset: 0x8d310c,
    expectedOpcodeHex: "d0011081",
    captureKind: "layout-b-object-entry",
    reason: "capture live object+0xac before slot0 forwards it to manager add-record",
  },
  {
    name: "layout-b-manager-add-record-callsite",
    offset: 0x8d3a2c,
    expectedOpcodeHex: "943eed2d",
    captureKind: "manager-add-callsite",
    reason: "capture x2 flags and x3 object+0x30 entry at the exact layout B add-record callsite",
  },
  {
    name: "manager-add-record-entry",
    offset: 0x188eee0,
    expectedOpcodeHex: "a9bd57f6",
    captureKind: "manager-add-entry",
    reason: "capture every manager add-record entry and filter by x3 object-like layout B entry pointer",
  },
  {
    name: "backing-add-record-flag-store",
    offset: 0x18bf580,
    expectedOpcodeHex: "79003122",
    captureKind: "backing-flag-store",
    reason: "capture the backing record +0x18 flag value stored from w2",
  },
  {
    name: "layout-b-visibility-gate-entry",
    offset: 0x8d5048,
    expectedOpcodeHex: "d100c3ff",
    captureKind: "layout-b-object-entry",
    reason: "capture live object+0xac and state bits before the visibility gate may suppress flags",
  },
  {
    name: "layout-b-visibility-refresh-callsite",
    offset: 0x8d50c4,
    expectedOpcodeHex: "943ee7d7",
    captureKind: "visibility-refresh-callsite",
    reason: "capture the actual stack flag value passed as x3 to manager refresh",
  },
  {
    name: "backing-refresh-flag-load",
    offset: 0x18bf60c,
    expectedOpcodeHex: "7940006a",
    captureKind: "backing-refresh-flag-load",
    reason: "capture refreshed flags loaded from x3 before backing record +0x18 update",
  },
  {
    name: "backing-refresh-flag-store",
    offset: 0x18bf618,
    expectedOpcodeHex: "7900310a",
    captureKind: "backing-refresh-flag-store",
    reason: "capture refreshed backing record +0x18 stores",
  },
  {
    name: "layout-b-final-refresh-callsite",
    offset: 0x8d4134,
    expectedOpcodeHex: "943eebbb",
    captureKind: "final-refresh-callsite",
    reason: "capture final payload-only refresh to separate payload updates from flag refresh",
  },
  {
    name: "particle-entry-array-builder-entry",
    offset: 0x188e784,
    expectedOpcodeHex: "9000c468",
    captureKind: "particle-entry-array-builder",
    reason: "capture draw-batch masks reaching the shared entry-array builder, especially 0x200",
  },
];

const opcodeEvidence = [
  {
    role: "slot0-load-object-ac-flags",
    address: 0x8d3110,
    expectedOpcodeHex: "b940ac02",
    evidence: "slot0 registration reads object+0xac into w2.",
  },
  {
    role: "register-forward-flags-to-manager",
    address: 0x8d3a28,
    expectedOpcodeHex: "2a1303e2",
    evidence: "register body forwards saved flags as w2 to manager add-record.",
  },
  {
    role: "constructor-seeds-object-ac-two",
    address: 0x8d2dbc,
    expectedOpcodeHex: "f900566a",
    evidence: "constructor seed makes initial object+0xac equal 2 through the 64-bit object+0xa8 store.",
  },
  {
    role: "visibility-gate-reloads-object-ac",
    address: 0x8d5094,
    expectedOpcodeHex: "b940ae68",
    evidence: "visibility gate reloads object+0xac only when state permits flag forwarding.",
  },
  {
    role: "visibility-gate-can-zero-flags",
    address: 0x8d50ac,
    expectedOpcodeHex: "2a1f03e8",
    evidence: "visibility gate can pass zero instead of object+0xac.",
  },
  {
    role: "backing-add-record-stores-flags",
    address: 0x18bf580,
    expectedOpcodeHex: "79003122",
    evidence: "backing add-record stores incoming flags at backing record +0x18.",
  },
  {
    role: "backing-refresh-stores-flags",
    address: 0x18bf618,
    expectedOpcodeHex: "7900310a",
    evidence: "backing refresh stores refreshed flags at backing record +0x18.",
  },
  {
    role: "particle-draw-mask-0x200",
    address: 0x820fd4,
    expectedOpcodeHex: "321703e1",
    evidence: "Draw all particle effects uses mask 0x200 when building the entry array.",
  },
  {
    role: "frame-dispatch-mask-0x2",
    address: 0x188e63c,
    expectedOpcodeHex: "321f03e1",
    evidence: "frame dispatch has a separate mask 2 path, matching the constructor seed but not the particle draw mask.",
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
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.offset ?? spec.address);
  return {
    source,
    name: spec.name || "",
    role: spec.role || "",
    addressHex: hex(spec.offset ?? spec.address),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    captureKind: spec.captureKind || "",
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
};
const MODULE_NAMES = ["libGameKindred.so", "GameKindred"];
const HOOK_TARGETS = ${JSON.stringify(targets, null, 2)};

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

function lowU32(value) {
  return safe("lowU32", () => {
    const pointer = ptr(value);
    if (typeof pointer.toUInt32 === "function") return pointer.toUInt32();
    const text = pointer.toString().replace(/^0x/, "");
    return Number.parseInt(text.slice(-8) || "0", 16) >>> 0;
  }, null);
}

function lowU16(value) {
  const number = lowU32(value);
  return number === null ? null : number & 0xffff;
}

function readU8(address) {
  return safe("readU8", () => ptr(address).readU8(), null);
}

function readU16(address) {
  return safe("readU16", () => ptr(address).readU16(), null);
}

function readU32(address) {
  return safe("readU32", () => ptr(address).readU32(), null);
}

function readPointer(address) {
  return safe("readPointer", () => toHex(ptr(address).readPointer()), "");
}

function readLayoutBObject(objectPointer) {
  const object = ptr(objectPointer);
  if (object.isNull()) return null;
  return {
    pointer: toHex(object),
    objectAcU32: readU32(object.add(0xac)),
    objectAcHex: readU32(object.add(0xac)) === null ? "" : "0x" + readU32(object.add(0xac)).toString(16),
    objectB0Index: readU16(object.add(0xb0)),
    objectB4: readU32(object.add(0xb4)),
    objectB8: readU32(object.add(0xb8)),
    objectC4: readU32(object.add(0xc4)),
    object10c: readU32(object.add(0x10c)),
    object110: readU8(object.add(0x110)),
    targetObject50: readPointer(object.add(0x50)),
    entryPointer30: toHex(object.add(0x30)),
  };
}

function eventBase(target, address) {
  return {
    event: target.name,
    captureKind: target.captureKind,
    offset: "0x" + target.offset.toString(16),
    address: toHex(address),
  };
}

function backtrace(context) {
  if (!CONFIG.includeBacktrace) return [];
  return Thread.backtrace(context, Backtracer.ACCURATE).map(toHex);
}

function buildEvent(target, address, context) {
  const event = eventBase(target, address);
  event.backtrace = backtrace(context);
  event.registers = {
    x0: toHex(context.x0),
    x1: toHex(context.x1),
    x2: toHex(context.x2),
    x3: toHex(context.x3),
    x4: toHex(context.x4),
    x8: toHex(context.x8),
    x9: toHex(context.x9),
    x19: toHex(context.x19),
  };
  event.w1 = lowU32(context.x1);
  event.w2 = lowU32(context.x2);
  event.w3 = lowU32(context.x3);

  if (target.captureKind === "layout-b-object-entry") {
    event.layoutBObject = readLayoutBObject(context.x0);
  } else if (target.captureKind === "manager-add-callsite" || target.captureKind === "manager-add-entry") {
    event.flagsW2 = lowU32(context.x2);
    event.entryPointer = toHex(context.x3);
    event.layoutBObject = readLayoutBObject(ptr(context.x3).sub(0x30));
  } else if (target.captureKind === "backing-flag-store") {
    event.flagsW2 = lowU32(context.x2);
    event.managerIndexW3 = lowU16(context.x3);
    event.backingRecord = toHex(context.x9);
    event.backingRecordFlagBefore = readU16(ptr(context.x9).add(0x18));
  } else if (target.captureKind === "visibility-refresh-callsite") {
    event.managerIndexW1 = lowU16(context.x1);
    event.flagPointer = toHex(context.x3);
    event.forwardedFlags = readU16(context.x3);
    event.layoutBObject = readLayoutBObject(context.x19);
  } else if (target.captureKind === "backing-refresh-flag-load" || target.captureKind === "backing-refresh-flag-store") {
    event.backingIndexW1 = lowU16(context.x1);
    event.flagPointer = toHex(context.x3);
    event.forwardedFlags = readU16(context.x3);
  } else if (target.captureKind === "final-refresh-callsite") {
    event.managerIndexW1 = lowU16(context.x1);
    event.payloadPointer = toHex(context.x2);
    event.flagPointer = toHex(context.x3);
  } else if (target.captureKind === "particle-entry-array-builder") {
    event.filterMaskW1 = lowU32(context.x1);
    event.entryCountOrLimitW2 = lowU32(context.x2);
    event.outputPointer = toHex(context.x0);
  }
  return event;
}

function attachHook(moduleBase, target) {
  const address = moduleBase.add(target.offset);
  let seen = 0;
  Interceptor.attach(address, {
    onEnter() {
      if (seen >= CONFIG.maxEventsPerHook) return;
      seen += 1;
      console.log(JSON.stringify(buildEvent(target, address, this.context)));
    },
  });
}

const gameModule = findGameModule();
if (!gameModule) {
  throw new Error("libGameKindred.so/GameKindred module not found");
}

console.log(JSON.stringify({
  event: "layout-b-object-ac-capture-start",
  moduleName: gameModule.name,
  moduleBase: toHex(gameModule.base),
  targetCount: HOOK_TARGETS.length,
}));

for (const target of HOOK_TARGETS) {
  attachHook(gameModule.base, target);
}
`;
}

function buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets(
  { binaryPath = defaultBinary } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const hookRows = hookTargets.map((spec) => rowForSpec(buffer, elf, spec, "hook-target"));
  const opcodeRows = opcodeEvidence.map((spec) => rowForSpec(buffer, elf, spec, "opcode-evidence"));
  const allRows = [...hookRows, ...opcodeRows];
  const summary = {
    hookTargetRows: hookRows.length,
    opcodeRows: opcodeRows.length,
    opcodeMismatchRows: allRows.filter((row) => !row.opcodeMatches).length,
    objectAcRuntimeCaptureRequiredRows: 1,
    captureScriptGenerated: true,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    policy:
      "diagnostic-only layout B object+0xac runtime capture targets; captures original runtime values without enabling rendering",
    summary,
    interpretation: {
      purpose:
        "Static evidence has ruled out local immediate-store producers for layout B object+0xac. These hooks capture the live object flags and backing flags at the original runtime boundaries.",
      boundary:
        "A capture can prove whether slot0 registration or visibility refresh ever carries bit 0x200 for live layout B objects; it is still not renderer takeover by itself.",
      nextRequiredEvidence:
        "Run the generated Frida script against the original runtime, then summarize same-object sequences from slot0/register/backing-refresh/particle-draw events.",
    },
    hookTargets: hookRows,
    opcodeEvidenceRows: opcodeRows,
  };
}

function exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({
  binaryPath = defaultBinary,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  fridaOut = defaultFridaOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({ binaryPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, [...manifest.hookTargets, ...manifest.opcodeEvidenceRows], [
    "source",
    "name",
    "role",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "captureKind",
    "reason",
    "evidence",
    "renderPromotionAllowed",
  ]);
  fs.mkdirSync(path.dirname(fridaOut), { recursive: true });
  fs.writeFileSync(
    fridaOut,
    fridaScriptForTargets(hookTargets.map(({ name, offset, captureKind, reason }) => ({ name, offset, captureKind, reason }))),
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    fridaOut: optionValue(args, "--frida-out", defaultFridaOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBObjectAcRuntimeCaptureTargets,
  exportCurrentNativeLayoutBObjectAcRuntimeCaptureTargets,
  fridaScriptForTargets,
};
