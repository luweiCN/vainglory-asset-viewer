#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetsPath = "extracted/reports/pfx_native_callback_runtime_targets.json";
const defaultInputPath = "extracted/reports/pfx_native_callback_capture.jsonl";
const defaultJsonOut = "extracted/reports/pfx_native_callback_capture_summary.json";
const defaultViewerOut = "extracted/viewer/pfx-native-callback-capture-summary.json";
const defaultTsvOut = "extracted/reports/pfx_native_callback_capture_summary.tsv";
const defaultSampleLimit = 8;

const eventTypes = {
  begin: "pfx_native_callback_begin",
  attached: "pfx_native_callback_attached",
  enter: "pfx_native_callback_enter",
  leave: "pfx_native_callback_leave",
  error: "pfx_native_callback_error",
};

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

function normalizeAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^0x([0-9a-f]+)$/i);
  if (!match) return text;
  return `0x${Number.parseInt(match[1], 16).toString(16)}`;
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
  return (targetManifest.targets || []).map((target) => ({
    callbackAddress: normalizeAddress(target.callbackAddress || target.virtualAddress),
    contextCount: (target.contexts || []).length,
    effectTokens: [...new Set((target.contexts || []).map((context) => context.effectToken).filter(Boolean))].sort(),
    pfxPaths: [...new Set((target.contexts || []).map((context) => context.pfxPath).filter(Boolean))].sort(),
    slots: [...new Set((target.contexts || []).map((context) => context.slot).filter(Boolean))].sort(),
  }));
}

function buildInitialTargetState(targets) {
  const byAddress = new Map();
  for (const target of targets) {
    byAddress.set(target.callbackAddress, {
      ...target,
      attached: false,
      attachErrors: [],
      enterSamples: 0,
      leaveSamples: 0,
      completeSamples: 0,
      enterSampleIndices: new Set(),
      leaveSampleIndices: new Set(),
      returnValues: [],
    });
  }
  return byAddress;
}

function summarizeCapture({ targetManifest = {}, inputPath = defaultInputPath, sampleLimit = defaultSampleLimit } = {}) {
  const targets = targetRows(targetManifest);
  const byAddress = buildInitialTargetState(targets);
  const { captureImported, records } = readCaptureRecords(inputPath);
  const errors = [];
  let beginRows = 0;
  let targetEventRows = 0;

  for (const record of records) {
    const type = record?.type || "";
    if (type === eventTypes.begin) {
      beginRows += 1;
      continue;
    }
    if (type === eventTypes.error) {
      errors.push(record);
      const address = normalizeAddress(record.callbackAddress);
      if (byAddress.has(address)) byAddress.get(address).attachErrors.push(record.error || "error");
      continue;
    }
    const address = normalizeAddress(record.callbackAddress);
    const target = byAddress.get(address);
    if (!target) continue;
    if (type === eventTypes.attached) {
      targetEventRows += 1;
      target.attached = true;
      continue;
    }
    if (type === eventTypes.enter) {
      targetEventRows += 1;
      const sampleIndex = String(record.sampleIndex ?? target.enterSamples);
      target.enterSamples += 1;
      target.enterSampleIndices.add(sampleIndex);
      continue;
    }
    if (type === eventTypes.leave) {
      targetEventRows += 1;
      const sampleIndex = String(record.sampleIndex ?? target.leaveSamples);
      target.leaveSamples += 1;
      target.leaveSampleIndices.add(sampleIndex);
      if (record.retval && !target.returnValues.includes(record.retval) && target.returnValues.length < sampleLimit) {
        target.returnValues.push(record.retval);
      }
      continue;
    }
  }

  for (const target of byAddress.values()) {
    target.completeSamples = [...target.enterSampleIndices].filter((sampleIndex) =>
      target.leaveSampleIndices.has(sampleIndex),
    ).length;
  }

  const rows = [...byAddress.values()].map((target) => ({
    callbackAddress: target.callbackAddress,
    contextCount: target.contextCount,
    effectTokens: target.effectTokens.join("|"),
    pfxPaths: target.pfxPaths.join("|"),
    slots: target.slots.join("|"),
    attached: target.attached,
    enterSamples: target.enterSamples,
    leaveSamples: target.leaveSamples,
    completeSamples: target.completeSamples,
    returnValues: target.returnValues.join("|"),
    attachErrors: target.attachErrors.join("|"),
  }));
  const observedEnterTargets = rows.filter((row) => row.enterSamples > 0).length;
  const observedCompleteTargets = rows.filter((row) => row.completeSamples > 0).length;
  const attachedTargets = rows.filter((row) => row.attached).length;
  const completedSamples = rows.reduce((sum, row) => sum + row.completeSamples, 0);
  const captureStatus = !captureImported
    ? "capture-missing"
    : !records.length
      ? "capture-empty"
      : !targetEventRows
        ? "no-target-events"
        : observedCompleteTargets === targets.length && targets.length > 0
          ? "ready-for-manual-callback-review"
          : "partial-target-coverage";
  const missingTargetSamples = rows
    .filter((row) => row.completeSamples === 0)
    .slice(0, sampleLimit)
    .map((row) => ({
      callbackAddress: row.callbackAddress,
      effectTokens: row.effectTokens,
      pfxPaths: row.pfxPaths,
      slots: row.slots,
      attached: row.attached,
      enterSamples: row.enterSamples,
      leaveSamples: row.leaveSamples,
    }));

  return {
    generatedAt: new Date().toISOString(),
    source: { inputPath, targetsPath: defaultTargetsPath },
    summary: {
      captureImported,
      captureStatus,
      readyForManualCallbackReview: captureStatus === "ready-for-manual-callback-review",
      partialCaptureUseful: completedSamples > 0,
      targetRows: targets.length,
      beginRows,
      attachedTargets,
      observedEnterTargets,
      observedCompleteTargets,
      completedSamples,
      targetEventRows,
      errorRows: errors.length,
      missingTargetRows: rows.filter((row) => row.completeSamples === 0).length,
      missingTargetSamples,
    },
    items: rows,
  };
}

function exportSummary({ targetsPath = defaultTargetsPath, inputPath = defaultInputPath, jsonOut = defaultJsonOut, viewerOut = defaultViewerOut, tsvOut = defaultTsvOut } = {}) {
  const targetManifest = readJson(targetsPath, { targets: [] });
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
      "callbackAddress",
      "contextCount",
      "effectTokens",
      "pfxPaths",
      "slots",
      "attached",
      "enterSamples",
      "leaveSamples",
      "completeSamples",
      "returnValues",
      "attachErrors",
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
  exportSummary,
  summarizeCapture,
};
