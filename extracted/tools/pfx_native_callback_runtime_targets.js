#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultJsonOut = "extracted/reports/pfx_native_callback_runtime_targets.json";
const defaultViewerOut = "extracted/viewer/pfx-native-callback-runtime-targets.json";
const defaultFridaOut = "extracted/reports/frida_capture_pfx_native_callback_runtime_targets.js";
const preferredImageBase = "0x100000000";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function parseIntegerLiteral(value) {
  const text = String(value || "").trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return Number.parseInt(text, 16);
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function normalizeAddress(value) {
  const parsed = parseIntegerLiteral(value);
  return Number.isFinite(parsed) ? `0x${parsed.toString(16)}` : "";
}

function parseCallbackField(text, field) {
  const match = String(text || "").match(new RegExp(`${field}=([^:]+)`, "i"));
  return match ? match[1] : "";
}

function parseCallbackSlot(text) {
  return String(text || "").split(":")[0] || "";
}

function isNativeRuntimeRequirement(row) {
  return (
    row?.areaShapeGapRuntimeRequirement === "requires-native-callback-runtime" ||
    row?.areaShapeGapRuntimeRequirement === "requires-native-percent-runtime" ||
    row?.areaShapeGapBlockClass === "blocked-random-range-callback" ||
    row?.areaShapeGapBlockClass === "blocked-native-percent-param-callback"
  );
}

function callbackContextFromRow(row, callbackText) {
  const callbackAddress = normalizeAddress(parseCallbackField(callbackText, "current"));
  if (!callbackAddress) return null;
  return {
    callbackAddress,
    slot: parseCallbackSlot(callbackText),
    effectToken: row.effectToken || row.token || "",
    actionKeys: listValue(row.actionKeys),
    heroNames: listValue(row.heroNames),
    pfxPath: row.pfxPath || "",
    shadergraphPath: row.shadergraphPath || "",
    surfaceIndex: row.surfaceIndex ?? "",
    blockClass: row.areaShapeGapBlockClass || "",
    runtimeRequirement: row.areaShapeGapRuntimeRequirement || "",
    dependencyFlags: parseCallbackField(callbackText, "currentDeps") || row.areaShapeGapSizeCallbackCurrentDependencyFlags || "",
    randomRange: parseCallbackField(callbackText, "randomRange") || row.areaShapeGapSizeCallbackRandomRange || "",
    currentStore: parseCallbackField(callbackText, "currentStore") || row.areaShapeGapCurrentStore || "",
    currentClass: parseCallbackField(callbackText, "currentClass") || row.areaShapeGapSizeCallbackCurrentClass || "",
    inputValue: parseCallbackField(callbackText, "inputValue") || row.areaShapeGapSizeCallbackInputValue || "",
    sourceFunction: row.source?.functionName || "",
    sourceLine: row.source?.line ?? "",
    sourceRows: [
      {
        id: row.id || "",
        sourceKind: row.sourceKind || "",
        sourceFunction: row.source?.functionName || "",
        sourceLine: row.source?.line ?? "",
      },
    ],
  };
}

function contextKey(context) {
  return [
    context.callbackAddress,
    context.slot,
    context.effectToken,
    context.pfxPath,
    context.surfaceIndex,
    context.runtimeRequirement,
  ].join("|");
}

function buildTargetsFromGapManifest(gaps, generatedAt = new Date().toISOString()) {
  const targets = new Map();
  const sourceRowIds = new Set();
  const byRuntimeRequirement = {};
  const byBlockClass = {};
  const byDependencyFlags = {};
  const byRandomRange = {};

  for (const row of gaps.items || []) {
    if (!isNativeRuntimeRequirement(row)) continue;
    sourceRowIds.add(row.id || `${row.effectToken || row.token || ""}:${row.pfxPath || ""}:${row.surfaceIndex ?? ""}`);
    increment(byRuntimeRequirement, row.areaShapeGapRuntimeRequirement || "");
    increment(byBlockClass, row.areaShapeGapBlockClass || "");
    increment(byDependencyFlags, row.areaShapeGapSizeCallbackCurrentDependencyFlags || "");
    increment(byRandomRange, row.areaShapeGapSizeCallbackRandomRange || "");

    for (const callbackText of row.pfxShapeCallbacks || []) {
      const context = callbackContextFromRow(row, callbackText);
      if (!context) continue;
      const target = targets.get(context.callbackAddress) || {
        callbackAddress: context.callbackAddress,
        virtualAddress: context.callbackAddress,
        contexts: [],
      };
      const existingContext = target.contexts.find((item) => contextKey(item) === contextKey(context));
      if (existingContext) {
        const existingSourceIds = new Set((existingContext.sourceRows || []).map((item) => item.id));
        for (const sourceRow of context.sourceRows || []) {
          if (existingSourceIds.has(sourceRow.id)) continue;
          existingContext.sourceRows.push(sourceRow);
          existingSourceIds.add(sourceRow.id);
        }
      } else {
        target.contexts.push(context);
      }
      targets.set(context.callbackAddress, target);
    }
  }

  const sortedTargets = [...targets.values()].sort(
    (left, right) => parseIntegerLiteral(left.virtualAddress) - parseIntegerLiteral(right.virtualAddress),
  );
  const allContexts = sortedTargets.flatMap((target) => target.contexts);
  return {
    generatedAt,
    source: { gapPath: defaultGapPath },
    preferredImageBase,
    summary: {
      sourceRows: sourceRowIds.size,
      targets: sortedTargets.length,
      callbackContexts: allContexts.length,
      effectTokens: uniqueSorted(allContexts.map((context) => context.effectToken)).length,
      pfxPaths: uniqueSorted(allContexts.map((context) => context.pfxPath)).length,
      byRuntimeRequirement,
      byBlockClass,
      byDependencyFlags,
      byRandomRange,
    },
    targets: sortedTargets,
  };
}

function buildTargets({ gapPath = defaultGapPath } = {}) {
  const gaps = readJson(gapPath, { items: [] });
  const manifest = buildTargetsFromGapManifest(gaps);
  manifest.source.gapPath = gapPath;
  return manifest;
}

function fridaScriptForTargets(manifest) {
  const targets = manifest.targets.map((target) => ({
    callbackAddress: target.callbackAddress,
    virtualAddress: target.virtualAddress,
    contexts: target.contexts,
  }));
  return `"use strict";
const PREFERRED_IMAGE_BASE = ptr("${manifest.preferredImageBase || preferredImageBase}");
const MAX_SAMPLES_PER_TARGET = 16;
const TARGETS = ${JSON.stringify(targets, null, 2)};

function findGameKindredModule() {
  return Process.findModuleByName("GameKindred") ||
    Process.enumerateModules().find((module) => /GameKindred/i.test(module.name));
}

function bytesToHex(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += ("0" + bytes[index].toString(16)).slice(-2);
  }
  return hex;
}

function safeReadHex(value, byteLength) {
  try {
    const address = ptr(value);
    if (address.isNull()) return "";
    const bytes = address.readByteArray(byteLength);
    return bytes ? bytesToHex(bytes) : "";
  } catch (error) {
    return "read-error:" + String(error);
  }
}

function pointerSample(args, index) {
  const value = args[index];
  return {
    index,
    value: value.toString(),
    memory16: safeReadHex(value, 16),
  };
}

const gameModule = findGameKindredModule();
if (!gameModule) {
  console.log(JSON.stringify({ type: "pfx_native_callback_error", error: "GameKindred module not found" }));
} else {
  console.log(JSON.stringify({
    type: "pfx_native_callback_begin",
    moduleName: gameModule.name,
    moduleBase: gameModule.base.toString(),
    preferredImageBase: PREFERRED_IMAGE_BASE.toString(),
    targets: TARGETS.length,
    maxSamplesPerTarget: MAX_SAMPLES_PER_TARGET,
  }));
  for (const target of TARGETS) {
    const virtualAddress = ptr(target.virtualAddress);
    const runtimeAddress = gameModule.base.add(virtualAddress.sub(PREFERRED_IMAGE_BASE));
    let sampleCount = 0;
    try {
      Interceptor.attach(runtimeAddress, {
        onEnter(args) {
          if (sampleCount >= MAX_SAMPLES_PER_TARGET) return;
          this.shouldLog = true;
          this.sampleIndex = sampleCount;
          sampleCount += 1;
          this.argPointers = [args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]];
          console.log(JSON.stringify({
            type: "pfx_native_callback_enter",
            callbackAddress: target.callbackAddress,
            runtimeAddress: runtimeAddress.toString(),
            sampleIndex: this.sampleIndex,
            contexts: target.contexts,
            args: this.argPointers.map((_, index) => pointerSample(args, index)),
          }));
        },
        onLeave(retval) {
          if (!this.shouldLog) return;
          console.log(JSON.stringify({
            type: "pfx_native_callback_leave",
            callbackAddress: target.callbackAddress,
            runtimeAddress: runtimeAddress.toString(),
            sampleIndex: this.sampleIndex,
            retval: retval.toString(),
            argsAfter: this.argPointers.map((value, index) => ({
              index,
              value: value.toString(),
              memory16: safeReadHex(value, 16),
            })),
          }));
        },
      });
      console.log(JSON.stringify({
        type: "pfx_native_callback_attached",
        callbackAddress: target.callbackAddress,
        runtimeAddress: runtimeAddress.toString(),
        contexts: target.contexts.length,
      }));
    } catch (error) {
      console.log(JSON.stringify({
        type: "pfx_native_callback_error",
        callbackAddress: target.callbackAddress,
        runtimeAddress: runtimeAddress.toString(),
        error: String(error),
      }));
    }
  }
}
`;
}

function exportTargets({ gapPath, jsonOut, viewerOut, fridaOut } = {}) {
  const manifest = buildTargets({ gapPath });
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (fridaOut) {
    fs.mkdirSync(path.dirname(fridaOut), { recursive: true });
    fs.writeFileSync(fridaOut, fridaScriptForTargets(manifest));
  }
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportTargets({
    gapPath: optionValue(args, "--gaps", defaultGapPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    fridaOut: optionValue(args, "--frida-out", defaultFridaOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildTargets,
  buildTargetsFromGapManifest,
  exportTargets,
  fridaScriptForTargets,
};
