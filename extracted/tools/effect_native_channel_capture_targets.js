#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultJsonOut = "extracted/reports/effect_native_channel_capture_targets.json";
const defaultViewerOut = "extracted/viewer/effect-native-channel-capture-targets.json";
const defaultFridaOut = "extracted/reports/frida_capture_effect_native_channel_targets.js";
const preferredImageBase = "0x100000000";

const targetReasons = new Set([
  "global-resource-candidate-unresolved",
  "kindred-slot-candidate-unresolved",
  "native-effect-channel-resource-unresolved",
  "selector-output-paired-resource-missing",
  "selector-output-unresolved",
  "weak-resource-candidate",
]);

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

function iosFunctionAddress(functionName) {
  const match = String(functionName || "").match(/^FUN_(1[0-9a-f]+)$/i);
  return match ? normalizeAddress(`0x${match[1]}`) : "";
}

function isTargetRow(row) {
  return targetReasons.has(row?.reason || "");
}

function contextFromRow(row) {
  const sourceFunction = row.source?.functionName || "";
  const functionAddress = iosFunctionAddress(sourceFunction);
  if (!functionAddress) return null;
  return {
    functionAddress,
    reason: row.reason || "",
    effectToken: row.effectToken || row.token || "",
    token: row.token || row.effectToken || "",
    actionKeys: listValue(row.actionKeys),
    heroNames: listValue(row.heroNames),
    heroResourceRoots: listValue(row.heroResourceRoots),
    nativeRuntimeKind: row.nativeRuntimeKind || "",
    nativeBindKind: row.nativeBindKind || "",
    nativeSemanticCalls: listValue(row.nativeSemanticCalls),
    nativeEffectOptionFloatArgs: listValue(row.nativeEffectOptionFloatArgs),
    nativeNearbyEffectTokens: listValue(row.nativeNearbyEffectTokens),
    selectorOutputTarget: row.selectorOutputTarget || "",
    selectorOutputRole: row.selectorOutputRole || "",
    selectorOutputSiblingTokens: listValue(row.selectorOutputSiblingTokens),
    selectorOutputSiblingRoles: listValue(row.selectorOutputSiblingRoles),
    pairedSelectorOutputTokens: listValue(row.pairedSelectorOutputTokens),
    pairedSelectorOutputRoles: listValue(row.pairedSelectorOutputRoles),
    globalCandidateResourcePaths: listValue(row.globalCandidateResourcePaths),
    kindredCandidateCount: Number(row.kindredCandidateCount || 0),
    kindredCandidateResourcePaths: listValue(row.kindredCandidateResourcePaths),
    kindredCandidateModelLabels: listValue(row.kindredCandidateModelLabels),
    kindredCandidateRoles: listValue(row.kindredCandidateRoles),
    sourceFunction,
    sourceLine: row.source?.line ?? "",
    sourceRowId: row.id || "",
  };
}

function contextKey(context) {
  return [
    context.functionAddress,
    context.reason,
    context.effectToken,
    context.selectorOutputTarget,
    context.selectorOutputRole,
    context.sourceLine,
  ].join("|");
}

function buildTargetsFromGapManifest(gaps, generatedAt = new Date().toISOString()) {
  const targets = new Map();
  const byReason = {};
  const byHookableReason = {};
  const bySourceKind = {};
  const bySelectorOutputRole = {};
  let candidateRows = 0;
  let skippedNonIosRows = 0;

  for (const row of gaps.items || []) {
    if (!isTargetRow(row)) continue;
    candidateRows += 1;
    increment(byReason, row.reason || "");
    increment(bySourceKind, row.sourceKind || "");
    increment(bySelectorOutputRole, row.selectorOutputRole || "(none)");
    const context = contextFromRow(row);
    if (!context) {
      skippedNonIosRows += 1;
      continue;
    }
    increment(byHookableReason, row.reason || "");
    const target = targets.get(context.functionAddress) || {
      functionAddress: context.functionAddress,
      virtualAddress: context.functionAddress,
      sourceFunction: context.sourceFunction,
      contexts: [],
    };
    if (!target.contexts.some((item) => contextKey(item) === contextKey(context))) {
      target.contexts.push(context);
    }
    targets.set(context.functionAddress, target);
  }

  const sortedTargets = [...targets.values()].sort(
    (left, right) => parseIntegerLiteral(left.virtualAddress) - parseIntegerLiteral(right.virtualAddress),
  );
  const contexts = sortedTargets.flatMap((target) => target.contexts);
  return {
    generatedAt,
    source: { gapPath: defaultGapPath },
    preferredImageBase,
    summary: {
      candidateRows,
      hookableRows: contexts.length,
      skippedNonIosRows,
      targets: sortedTargets.length,
      effectTokens: new Set(contexts.map((context) => context.effectToken).filter(Boolean)).size,
      byReason,
      byHookableReason,
      bySourceKind,
      bySelectorOutputRole,
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
    functionAddress: target.functionAddress,
    virtualAddress: target.virtualAddress,
    sourceFunction: target.sourceFunction,
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

function safeReadUtf8(value, byteLength) {
  try {
    const address = ptr(value);
    if (address.isNull()) return "";
    return address.readUtf8String(byteLength) || "";
  } catch (error) {
    return "";
  }
}

function pointerSample(args, index) {
  const value = args[index];
  return {
    index,
    value: value.toString(),
    isNull: ptr(value).isNull(),
    memory16: safeReadHex(value, 16),
    memory64: safeReadHex(value, 64),
    cstring64: safeReadUtf8(value, 64),
  };
}

const gameModule = findGameKindredModule();
if (!gameModule) {
  console.log(JSON.stringify({ type: "effect_native_channel_capture_error", error: "GameKindred module not found" }));
} else {
  console.log(JSON.stringify({
    type: "effect_native_channel_capture_begin",
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
            type: "effect_native_channel_enter",
            functionAddress: target.functionAddress,
            sourceFunction: target.sourceFunction,
            runtimeAddress: runtimeAddress.toString(),
            sampleIndex: this.sampleIndex,
            contexts: target.contexts,
            args: this.argPointers.map((_, index) => pointerSample(args, index)),
          }));
        },
        onLeave(retval) {
          if (!this.shouldLog) return;
          console.log(JSON.stringify({
            type: "effect_native_channel_leave",
            functionAddress: target.functionAddress,
            sourceFunction: target.sourceFunction,
            runtimeAddress: runtimeAddress.toString(),
            sampleIndex: this.sampleIndex,
            retval: retval.toString(),
            argsAfter: this.argPointers.map((value, index) => ({
              index,
              value: value.toString(),
              isNull: ptr(value).isNull(),
              memory16: safeReadHex(value, 16),
              memory64: safeReadHex(value, 64),
              cstring64: safeReadUtf8(value, 64),
            })),
          }));
        },
      });
      console.log(JSON.stringify({
        type: "effect_native_channel_attached",
        functionAddress: target.functionAddress,
        sourceFunction: target.sourceFunction,
        runtimeAddress: runtimeAddress.toString(),
        contexts: target.contexts.length,
      }));
    } catch (error) {
      console.log(JSON.stringify({
        type: "effect_native_channel_capture_error",
        functionAddress: target.functionAddress,
        sourceFunction: target.sourceFunction,
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
