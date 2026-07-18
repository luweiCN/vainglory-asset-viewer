#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGapPath = "extracted/viewer/effect-runtime-gaps.json";
const defaultSemanticsPath = "extracted/viewer/native-particle-callback-semantics.json";
const defaultJsonOut = "extracted/reports/pfx_encrypted_runtime_targets.json";
const defaultViewerOut = "extracted/viewer/pfx-encrypted-runtime-targets.json";
const defaultFridaOut = "extracted/reports/frida_dump_pfx_encrypted_runtime_targets.js";
const preferredImageBase = "0x100000000";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseCallbackField(text, field) {
  const match = String(text || "").match(new RegExp(`${field}=([^:]+)`, "i"));
  return match ? match[1] : "";
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

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function semanticsItemsByCallbackAddress(semantics) {
  const items = Array.isArray(semantics) ? semantics : semantics.items || [];
  const byAddress = new Map();
  for (const item of items) {
    const address = normalizeAddress(item.callbackAddress);
    if (address) byAddress.set(address.toLowerCase(), item);
  }
  return byAddress;
}

function pushTarget(targets, target, callbackContext) {
  if (!target.virtualAddress || !Number.isFinite(target.byteLength) || target.byteLength <= 0) return;
  const key = `${target.kind}:${target.virtualAddress.toLowerCase()}:${target.byteLength}`;
  const existing = targets.get(key) || {
    kind: target.kind,
    virtualAddress: target.virtualAddress,
    byteLength: target.byteLength,
    sourceSymbol: target.sourceSymbol || "",
    sampleCount: target.sampleCount || null,
    callbacks: [],
  };
  const callbackKey = [
    callbackContext.callbackAddress,
    callbackContext.slot,
    callbackContext.blockClass,
    callbackContext.effectToken,
    callbackContext.pfxPath,
    callbackContext.surfaceIndex,
  ].join("|");
  if (
    !existing.callbacks.some(
      (item) =>
        [
          item.callbackAddress,
          item.slot,
          item.blockClass,
          item.effectToken,
          item.pfxPath,
          item.surfaceIndex,
        ].join("|") === callbackKey,
    )
  ) {
    existing.callbacks.push(callbackContext);
  }
  targets.set(key, existing);
}

function buildTargets({ gapPath = defaultGapPath, semanticsPath = defaultSemanticsPath } = {}) {
  const gaps = readJson(gapPath, { items: [] });
  const semantics = readJson(semanticsPath, { items: [] });
  const semanticsByAddress = semanticsItemsByCallbackAddress(semantics);
  const targets = new Map();

  for (const row of gaps.items || []) {
    if (!row.areaShapeGapBlockClass) continue;
    for (const callbackText of row.pfxShapeCallbacks || []) {
      const currentAddress = normalizeAddress(parseCallbackField(callbackText, "current"));
      if (!currentAddress) continue;
      const item = semanticsByAddress.get(currentAddress.toLowerCase());
      if (!item) continue;
      const callbackContext = {
        callbackAddress: currentAddress,
        slot: callbackText.split(":")[0] || "",
        blockClass: row.areaShapeGapBlockClass || "",
        effectToken: row.effectToken || row.token || "",
        pfxPath: row.pfxPath || "",
        surfaceIndex: row.surfaceIndex ?? "",
      };
      if (/pattern16Read=encrypted-range/i.test(callbackText) && item.pattern16SourceAddress) {
        pushTarget(
          targets,
          {
            kind: "pattern16",
            virtualAddress: normalizeAddress(item.pattern16SourceAddress),
            byteLength: 16,
            sourceSymbol: item.pattern16Symbol || "",
          },
          callbackContext,
        );
      }
      if (/curveTableRead=encrypted-range/i.test(callbackText) && item.curveTableSourceAddress) {
        const sampleCount = Number(item.curveTableSampleCount);
        pushTarget(
          targets,
          {
            kind: "curve-table",
            virtualAddress: normalizeAddress(item.curveTableSourceAddress),
            byteLength: Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount * 4 : 16,
            sourceSymbol: item.curveTableSymbol || "",
            sampleCount: Number.isInteger(sampleCount) && sampleCount > 0 ? sampleCount : null,
          },
          callbackContext,
        );
      }
    }
  }

  const sortedTargets = [...targets.values()].sort((left, right) => {
    const byAddress = parseIntegerLiteral(left.virtualAddress) - parseIntegerLiteral(right.virtualAddress);
    return byAddress || left.kind.localeCompare(right.kind) || left.byteLength - right.byteLength;
  });
  return {
    generatedAt: new Date().toISOString(),
    source: { gapPath, semanticsPath },
    summary: {
      targets: sortedTargets.length,
      callbacks: sortedTargets.reduce((sum, target) => sum + target.callbacks.length, 0),
      byKind: sortedTargets.reduce((counts, target) => {
        counts[target.kind] = (counts[target.kind] || 0) + 1;
        return counts;
      }, {}),
    },
    preferredImageBase,
    targets: sortedTargets,
  };
}

function fridaScriptForTargets(manifest) {
  const targets = manifest.targets.map((target) => ({
    kind: target.kind,
    virtualAddress: target.virtualAddress,
    byteLength: target.byteLength,
  }));
  return `"use strict";
const PREFERRED_IMAGE_BASE = ptr("${manifest.preferredImageBase || preferredImageBase}");
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

const gameModule = findGameKindredModule();
if (!gameModule) {
  console.log(JSON.stringify({ type: "pfx_runtime_data_error", error: "GameKindred module not found" }));
} else {
  console.log(JSON.stringify({
    type: "pfx_runtime_data_begin",
    moduleName: gameModule.name,
    moduleBase: gameModule.base.toString(),
    preferredImageBase: PREFERRED_IMAGE_BASE.toString(),
    targets: TARGETS.length,
  }));
  for (const target of TARGETS) {
    try {
      const virtualAddress = ptr(target.virtualAddress);
      const runtimeAddress = gameModule.base.add(virtualAddress.sub(PREFERRED_IMAGE_BASE));
      const bytes = runtimeAddress.readByteArray(target.byteLength);
      console.log(JSON.stringify({
        type: "pfx_runtime_data",
        kind: target.kind,
        virtualAddress: target.virtualAddress,
        runtimeAddress: runtimeAddress.toString(),
        byteLength: target.byteLength,
        bytesHex: bytesToHex(bytes),
      }));
    } catch (error) {
      console.log(JSON.stringify({
        type: "pfx_runtime_data_error",
        kind: target.kind,
        virtualAddress: target.virtualAddress,
        byteLength: target.byteLength,
        error: String(error),
      }));
    }
  }
}
`;
}

function exportTargets({ gapPath, semanticsPath, jsonOut, viewerOut, fridaOut } = {}) {
  const manifest = buildTargets({ gapPath, semanticsPath });
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
    semanticsPath: optionValue(args, "--semantics", defaultSemanticsPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    fridaOut: optionValue(args, "--frida-out", defaultFridaOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildTargets,
  exportTargets,
  fridaScriptForTargets,
};
