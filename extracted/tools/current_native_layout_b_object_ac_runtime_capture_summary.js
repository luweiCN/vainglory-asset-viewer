#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetsPath = "extracted/reports/current_native_layout_b_object_ac_runtime_capture_targets.json";
const defaultInputPath = "extracted/reports/layout_b_object_ac_runtime_capture.jsonl";
const defaultJsonOut = "extracted/reports/current_native_layout_b_object_ac_runtime_capture_summary.json";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-object-ac-runtime-capture-summary.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_object_ac_runtime_capture_summary.tsv";
const defaultSampleLimit = 8;
const particleMask = 0x200;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function parseJsonLine(line) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "{") continue;
    try {
      return JSON.parse(line.slice(index));
    } catch {
      continue;
    }
  }
  return null;
}

function readCaptureRecords(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return { captureImported: false, records: [] };
  const text = fs.readFileSync(inputPath, "utf8");
  try {
    const parsed = JSON.parse(text);
    const records = Array.isArray(parsed) ? parsed : parsed.records || parsed.items || [parsed];
    return { captureImported: true, records };
  } catch {
    return {
      captureImported: true,
      records: text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseJsonLine)
        .filter(Boolean),
    };
  }
}

function normalizeHex(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^0x([0-9a-f]+)$/i);
  if (!match) return text;
  return `0x${Number.parseInt(match[1], 16).toString(16)}`;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value >>> 0;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = text.startsWith("0x") || text.startsWith("0X")
    ? Number.parseInt(text, 16)
    : Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed >>> 0 : null;
}

function hasParticleMask(value) {
  const number = numberValue(value);
  return number !== null && (number & particleMask) !== 0;
}

function isNullPointer(value) {
  const text = normalizeHex(value);
  return text === "0x0" || text === "0" || text === "";
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

function targetRows(targetManifest = {}) {
  return (targetManifest.hookTargets || []).map((target) => ({
    name: target.name || "",
    addressHex: normalizeHex(target.addressHex),
    captureKind: target.captureKind || "",
    reason: target.reason || "",
  }));
}

function buildInitialTargetState(targets) {
  const byName = new Map();
  for (const target of targets) {
    byName.set(target.name, {
      ...target,
      eventRows: 0,
      runtimeParticleFlagEventRows: 0,
      objectAcParticleMaskEvents: 0,
      managerAddFlagParticleMaskEvents: 0,
      backingStoreParticleMaskEvents: 0,
      forwardedFlagParticleMaskEvents: 0,
      particleDrawMaskEvents: 0,
      zeroForwardedFlagEvents: 0,
      finalPayloadOnlyEvents: 0,
      sampleObjectPointers: [],
      sampleFlagValues: [],
    });
  }
  return byName;
}

function pushSample(list, value, limit) {
  const normalized = typeof value === "string" ? normalizeHex(value) : value;
  if (normalized === null || normalized === undefined || normalized === "") return;
  if (list.includes(normalized) || list.length >= limit) return;
  list.push(normalized);
}

function recordObjectState(objectStates, record) {
  const object = record?.layoutBObject;
  const pointer = normalizeHex(object?.pointer);
  if (!pointer) return null;
  const state = objectStates.get(pointer) || {
    pointer,
    events: new Set(),
    objectAcValues: new Set(),
    particleFlagEvents: 0,
  };
  state.events.add(record.event || "");
  const objectAc = numberValue(object?.objectAcU32 ?? object?.objectAcHex);
  if (objectAc !== null) {
    state.objectAcValues.add(`0x${objectAc.toString(16)}`);
    if ((objectAc & particleMask) !== 0) state.particleFlagEvents += 1;
  }
  if (hasParticleMask(record.flagsW2) || hasParticleMask(record.forwardedFlags)) {
    state.particleFlagEvents += 1;
  }
  objectStates.set(pointer, state);
  return pointer;
}

function summarizeCapture({ targetManifest = {}, inputPath = defaultInputPath, sampleLimit = defaultSampleLimit } = {}) {
  const targets = targetRows(targetManifest);
  const byName = buildInitialTargetState(targets);
  const targetNames = new Set(targets.map((target) => target.name));
  const { captureImported, records } = readCaptureRecords(inputPath);
  const objectStates = new Map();
  const errors = [];
  let beginRows = 0;
  let targetEventRows = 0;
  let ignoredRows = 0;

  for (const record of records) {
    const event = record?.event || record?.type || "";
    if (event === "layout-b-object-ac-capture-start") {
      beginRows += 1;
      continue;
    }
    if (event === "layout-b-object-ac-capture-error") {
      errors.push(record);
      continue;
    }
    if (!targetNames.has(event)) {
      ignoredRows += 1;
      continue;
    }

    const target = byName.get(event);
    targetEventRows += 1;
    target.eventRows += 1;
    let runtimeParticleFlagInEvent = false;

    const objectPointer = recordObjectState(objectStates, record);
    pushSample(target.sampleObjectPointers, objectPointer, sampleLimit);

    const objectAc = record?.layoutBObject?.objectAcU32 ?? record?.layoutBObject?.objectAcHex;
    if (hasParticleMask(objectAc)) {
      target.objectAcParticleMaskEvents += 1;
      runtimeParticleFlagInEvent = true;
    }

    if (target.captureKind === "manager-add-callsite" || target.captureKind === "manager-add-entry") {
      if (hasParticleMask(record.flagsW2)) {
        target.managerAddFlagParticleMaskEvents += 1;
        runtimeParticleFlagInEvent = true;
      }
      pushSample(target.sampleFlagValues, record.flagsW2, sampleLimit);
    } else if (target.captureKind === "backing-flag-store") {
      if (hasParticleMask(record.flagsW2)) {
        target.backingStoreParticleMaskEvents += 1;
        runtimeParticleFlagInEvent = true;
      }
      pushSample(target.sampleFlagValues, record.flagsW2, sampleLimit);
    } else if (
      target.captureKind === "visibility-refresh-callsite" ||
      target.captureKind === "backing-refresh-flag-load" ||
      target.captureKind === "backing-refresh-flag-store"
    ) {
      if (hasParticleMask(record.forwardedFlags)) {
        target.forwardedFlagParticleMaskEvents += 1;
        runtimeParticleFlagInEvent = true;
      }
      if (numberValue(record.forwardedFlags) === 0) target.zeroForwardedFlagEvents += 1;
      pushSample(target.sampleFlagValues, record.forwardedFlags, sampleLimit);
    } else if (target.captureKind === "final-refresh-callsite") {
      if (isNullPointer(record.flagPointer)) target.finalPayloadOnlyEvents += 1;
    } else if (target.captureKind === "particle-entry-array-builder") {
      if (hasParticleMask(record.filterMaskW1)) target.particleDrawMaskEvents += 1;
      pushSample(target.sampleFlagValues, record.filterMaskW1, sampleLimit);
    } else if (target.captureKind === "layout-b-object-entry") {
      pushSample(target.sampleFlagValues, objectAc, sampleLimit);
    }
    if (runtimeParticleFlagInEvent) target.runtimeParticleFlagEventRows += 1;
  }

  const rows = [...byName.values()].map((target) => ({
    name: target.name,
    addressHex: target.addressHex,
    captureKind: target.captureKind,
    reason: target.reason,
    eventRows: target.eventRows,
    runtimeParticleFlagEventRows: target.runtimeParticleFlagEventRows,
    objectAcParticleMaskEvents: target.objectAcParticleMaskEvents,
    managerAddFlagParticleMaskEvents: target.managerAddFlagParticleMaskEvents,
    backingStoreParticleMaskEvents: target.backingStoreParticleMaskEvents,
    forwardedFlagParticleMaskEvents: target.forwardedFlagParticleMaskEvents,
    particleDrawMaskEvents: target.particleDrawMaskEvents,
    zeroForwardedFlagEvents: target.zeroForwardedFlagEvents,
    finalPayloadOnlyEvents: target.finalPayloadOnlyEvents,
    sampleObjectPointers: target.sampleObjectPointers.join("|"),
    sampleFlagValues: target.sampleFlagValues.join("|"),
  }));
  const observedHookTargets = rows.filter((row) => row.eventRows > 0).length;
  const runtimeParticleFlagObservedEvents = rows.reduce((sum, row) => sum + row.runtimeParticleFlagEventRows, 0);
  const particleDrawMaskEvents = rows.reduce((sum, row) => sum + row.particleDrawMaskEvents, 0);
  const objectRows = [...objectStates.values()].map((state) => ({
    pointer: state.pointer,
    eventNames: [...state.events].filter(Boolean).sort().join("|"),
    objectAcValues: [...state.objectAcValues].sort().join("|"),
    particleFlagEvents: state.particleFlagEvents,
  }));
  const layoutBObjectsWithParticleFlag = objectRows.filter((row) => row.particleFlagEvents > 0);
  const captureStatus = !captureImported
    ? "capture-missing"
    : !records.length
      ? "capture-empty"
      : !targetEventRows
        ? "no-target-events"
        : observedHookTargets === targets.length && targets.length > 0
          ? "ready-for-runtime-value-review"
          : "partial-target-coverage";

  return {
    generatedAt: new Date().toISOString(),
    source: { inputPath, targetsPath: defaultTargetsPath },
    policy:
      "diagnostic-only layout B object+0xac runtime capture summary; never grants renderer takeover by itself",
    summary: {
      captureImported,
      captureStatus,
      readyForManualProducerReview: runtimeParticleFlagObservedEvents > 0 && particleDrawMaskEvents > 0,
      partialCaptureUseful: targetEventRows > 0,
      targetRows: targets.length,
      beginRows,
      observedHookTargets,
      targetEventRows,
      ignoredRows,
      errorRows: errors.length,
      missingTargetRows: rows.filter((row) => row.eventRows === 0).length,
      layoutBObjectsObserved: objectRows.length,
      layoutBObjectsWithParticleFlag: layoutBObjectsWithParticleFlag.length,
      runtimeParticleFlagObservedEvents,
      particleDrawMaskEvents,
      finalPayloadOnlyEvents: rows.reduce((sum, row) => sum + row.finalPayloadOnlyEvents, 0),
      zeroForwardedFlagEvents: rows.reduce((sum, row) => sum + row.zeroForwardedFlagEvents, 0),
      renderPromotionAllowedRows: 0,
      sampleLayoutBObjectsWithParticleFlag: layoutBObjectsWithParticleFlag.slice(0, sampleLimit),
    },
    items: rows,
    objectItems: objectRows,
  };
}

function exportSummary({
  targetsPath = defaultTargetsPath,
  inputPath = defaultInputPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const targetManifest = readJson(targetsPath, { hookTargets: [] });
  const manifest = summarizeCapture({ targetManifest, inputPath });
  manifest.source.targetsPath = targetsPath;
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (tsvOut) {
    writeTsv(tsvOut, manifest.items, [
      "name",
      "addressHex",
      "captureKind",
      "reason",
      "eventRows",
      "runtimeParticleFlagEventRows",
      "objectAcParticleMaskEvents",
      "managerAddFlagParticleMaskEvents",
      "backingStoreParticleMaskEvents",
      "forwardedFlagParticleMaskEvents",
      "particleDrawMaskEvents",
      "zeroForwardedFlagEvents",
      "finalPayloadOnlyEvents",
      "sampleObjectPointers",
      "sampleFlagValues",
    ]);
  }
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSummary({
    targetsPath: optionValue(args, "--targets", defaultTargetsPath),
    inputPath: optionValue(args, "--input", defaultInputPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  summarizeCapture,
  exportSummary,
};
