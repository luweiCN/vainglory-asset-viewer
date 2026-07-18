#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetsPath = "extracted/reports/effect_native_channel_capture_targets.json";
const defaultInputPath = "extracted/reports/effect_native_channel_capture.jsonl";
const defaultJsonOut = "extracted/reports/effect_native_channel_capture_summary.json";
const defaultViewerOut = "extracted/viewer/effect-native-channel-capture-summary.json";
const defaultTsvOut = "extracted/reports/effect_native_channel_capture_summary.tsv";
const defaultSampleLimit = 8;

const eventTypes = {
  begin: "effect_native_channel_capture_begin",
  attached: "effect_native_channel_attached",
  enter: "effect_native_channel_enter",
  leave: "effect_native_channel_leave",
  error: "effect_native_channel_capture_error",
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

function countMap(values) {
  const counts = {};
  for (const value of values || []) {
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function pushUniqueSample(values, value, limit = defaultSampleLimit) {
  if (!value || values.includes(value) || values.length >= limit) return;
  values.push(value);
}

function isNonNullPointerValue(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^0x([0-9a-f]+)$/);
  if (!match) return false;
  return Number.parseInt(match[1], 16) !== 0;
}

function readableMemoryPrefix(sample = {}) {
  const hex = sample.memory64 || sample.memory32 || sample.memory16 || "";
  if (!hex || String(hex).startsWith("read-error:")) return "";
  if (/^0+$/i.test(hex)) return "";
  return hex;
}

function hasStringPreview(sample = {}) {
  return Boolean(String(sample.cstring64 || sample.string64 || sample.string || "").trim());
}

function targetRows(targetManifest = {}) {
  return (targetManifest.targets || []).map((target) => {
    const contexts = target.contexts || [];
    return {
      functionAddress: normalizeAddress(target.functionAddress || target.virtualAddress),
      sourceFunction: target.sourceFunction || "",
      contextCount: contexts.length,
      effectTokens: [...new Set(contexts.map((context) => context.effectToken).filter(Boolean))].sort(),
      reasons: [...new Set(contexts.map((context) => context.reason).filter(Boolean))].sort(),
      selectorOutputRoles: [...new Set(contexts.map((context) => context.selectorOutputRole).filter(Boolean))].sort(),
      candidateResourcePaths: [
        ...new Set(
          contexts
            .flatMap((context) => [
              ...(context.globalCandidateResourcePaths || []),
              ...(context.kindredCandidateResourcePaths || []),
            ])
            .filter(Boolean),
        ),
      ].sort(),
    };
  });
}

function buildInitialTargetState(targets) {
  const byAddress = new Map();
  for (const target of targets) {
    byAddress.set(target.functionAddress, {
      ...target,
      attached: false,
      attachErrors: [],
      enterSamples: 0,
      leaveSamples: 0,
      completeSamples: 0,
      enterSampleIndices: new Set(),
      leaveSampleIndices: new Set(),
      sampleRecords: new Map(),
      argumentSnapshotSamples: 0,
      completeArgumentSnapshotSamples: 0,
      argumentRows: 0,
      argumentPointerRows: 0,
      readableArgumentRows: 0,
      argumentStringRows: 0,
      argumentPointerSamples: [],
      leaveArgumentRows: 0,
      readableLeaveArgumentRows: 0,
      returnValueSamples: 0,
      nonZeroReturnValueSamples: 0,
      completeReturnValueSamples: 0,
      returnValues: [],
    });
  }
  return byAddress;
}

function sampleRecordFor(target, sampleIndex) {
  const key = String(sampleIndex);
  const sample = target.sampleRecords.get(key) || { sampleIndex: key, enter: false, leave: false };
  target.sampleRecords.set(key, sample);
  return sample;
}

function recordArgumentSnapshot(target, args, sampleLimit) {
  if (!Array.isArray(args) || !args.length) return;
  target.argumentSnapshotSamples += 1;
  target.argumentRows += args.length;
  for (const arg of args) {
    const value = String(arg?.value || "");
    if (isNonNullPointerValue(value)) {
      target.argumentPointerRows += 1;
      pushUniqueSample(target.argumentPointerSamples, `${arg.index ?? "?"}:${value}`, sampleLimit);
    }
    if (readableMemoryPrefix(arg)) target.readableArgumentRows += 1;
    if (hasStringPreview(arg)) target.argumentStringRows += 1;
  }
}

function recordLeaveArgumentSnapshot(target, args) {
  if (!Array.isArray(args) || !args.length) return;
  target.leaveArgumentRows += args.length;
  for (const arg of args) {
    if (readableMemoryPrefix(arg)) target.readableLeaveArgumentRows += 1;
  }
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
      const address = normalizeAddress(record.functionAddress);
      if (byAddress.has(address)) byAddress.get(address).attachErrors.push(record.error || "error");
      continue;
    }
    const address = normalizeAddress(record.functionAddress);
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
      const sample = sampleRecordFor(target, sampleIndex);
      sample.enter = true;
      sample.args = Array.isArray(record.args) ? record.args : [];
      recordArgumentSnapshot(target, sample.args, sampleLimit);
      continue;
    }
    if (type === eventTypes.leave) {
      targetEventRows += 1;
      const sampleIndex = String(record.sampleIndex ?? target.leaveSamples);
      target.leaveSamples += 1;
      target.leaveSampleIndices.add(sampleIndex);
      const sample = sampleRecordFor(target, sampleIndex);
      sample.leave = true;
      if (Object.hasOwn(record, "retval")) {
        const retval = String(record.retval);
        sample.retval = retval;
        target.returnValueSamples += 1;
        if (isNonNullPointerValue(retval)) target.nonZeroReturnValueSamples += 1;
        pushUniqueSample(target.returnValues, retval, sampleLimit);
      }
      sample.argsAfter = Array.isArray(record.argsAfter) ? record.argsAfter : [];
      recordLeaveArgumentSnapshot(target, sample.argsAfter);
      continue;
    }
  }

  for (const target of byAddress.values()) {
    const completeSamples = [...target.enterSampleIndices].filter((sampleIndex) => target.leaveSampleIndices.has(sampleIndex));
    target.completeSamples = completeSamples.length;
    target.completeArgumentSnapshotSamples = completeSamples.filter((sampleIndex) => {
      const sample = target.sampleRecords.get(String(sampleIndex));
      return Array.isArray(sample?.args) && sample.args.length > 0;
    }).length;
    target.completeReturnValueSamples = completeSamples.filter((sampleIndex) => {
      const sample = target.sampleRecords.get(String(sampleIndex));
      return Object.hasOwn(sample || {}, "retval");
    }).length;
  }

  const rows = [...byAddress.values()].map((target) => ({
    functionAddress: target.functionAddress,
    sourceFunction: target.sourceFunction,
    contextCount: target.contextCount,
    effectTokens: target.effectTokens.join("|"),
    reasons: target.reasons.join("|"),
    selectorOutputRoles: target.selectorOutputRoles.join("|"),
    candidateResourcePathCount: target.candidateResourcePaths.length,
    candidateResourcePathSamples: target.candidateResourcePaths.slice(0, sampleLimit).join("|"),
    attached: target.attached,
    enterSamples: target.enterSamples,
    leaveSamples: target.leaveSamples,
    completeSamples: target.completeSamples,
    argumentSnapshotSamples: target.argumentSnapshotSamples,
    completeArgumentSnapshotSamples: target.completeArgumentSnapshotSamples,
    argumentRows: target.argumentRows,
    argumentPointerRows: target.argumentPointerRows,
    readableArgumentRows: target.readableArgumentRows,
    argumentStringRows: target.argumentStringRows,
    argumentPointerSamples: target.argumentPointerSamples.join("|"),
    leaveArgumentRows: target.leaveArgumentRows,
    readableLeaveArgumentRows: target.readableLeaveArgumentRows,
    returnValueSamples: target.returnValueSamples,
    nonZeroReturnValueSamples: target.nonZeroReturnValueSamples,
    completeReturnValueSamples: target.completeReturnValueSamples,
    returnValues: target.returnValues.join("|"),
    attachErrors: target.attachErrors.join("|"),
  }));
  const observedEnterTargets = rows.filter((row) => row.enterSamples > 0).length;
  const observedCompleteTargets = rows.filter((row) => row.completeSamples > 0).length;
  const completeArgumentSnapshotTargets = rows.filter((row) => row.completeArgumentSnapshotSamples > 0).length;
  const readableArgumentTargets = rows.filter((row) => row.readableArgumentRows > 0).length;
  const completeReturnValueTargets = rows.filter((row) => row.completeReturnValueSamples > 0).length;
  const attachedTargets = rows.filter((row) => row.attached).length;
  const completedSamples = rows.reduce((sum, row) => sum + row.completeSamples, 0);
  const argumentRows = rows.reduce((sum, row) => sum + row.argumentRows, 0);
  const readableArgumentRows = rows.reduce((sum, row) => sum + row.readableArgumentRows, 0);
  const returnValueSamples = rows.reduce((sum, row) => sum + row.returnValueSamples, 0);
  const captureStatus = !captureImported
    ? "capture-missing"
    : !records.length
      ? "capture-empty"
      : !targetEventRows
        ? "no-target-events"
        : observedCompleteTargets !== targets.length || targets.length === 0
          ? "partial-target-coverage"
          : completeArgumentSnapshotTargets !== targets.length
            ? "argument-snapshots-missing"
            : completeReturnValueTargets !== targets.length
              ? "return-values-missing"
              : "ready-for-full-mapping-review";
  const missingTargetSamples = rows
    .filter((row) => row.completeSamples === 0)
    .slice(0, sampleLimit)
    .map((row) => ({
      functionAddress: row.functionAddress,
      sourceFunction: row.sourceFunction,
      effectTokens: row.effectTokens,
      reasons: row.reasons,
      selectorOutputRoles: row.selectorOutputRoles,
      attached: row.attached,
      enterSamples: row.enterSamples,
      leaveSamples: row.leaveSamples,
      argumentSnapshotSamples: row.argumentSnapshotSamples,
      completeArgumentSnapshotSamples: row.completeArgumentSnapshotSamples,
      completeReturnValueSamples: row.completeReturnValueSamples,
    }));
  return {
    generatedAt: new Date().toISOString(),
    source: { inputPath, targetsPath: defaultTargetsPath },
    summary: {
      captureImported,
      captureStatus,
      readyForFullMappingReview: captureStatus === "ready-for-full-mapping-review",
      partialCaptureUseful: completedSamples > 0,
      targetRows: targets.length,
      beginRows,
      attachedTargets,
      observedEnterTargets,
      observedCompleteTargets,
      completeArgumentSnapshotTargets,
      readableArgumentTargets,
      completeReturnValueTargets,
      completedSamples,
      argumentRows,
      readableArgumentRows,
      returnValueSamples,
      targetEventRows,
      errorRows: errors.length,
      missingTargetRows: rows.filter((row) => row.completeSamples === 0).length,
      byReason: countMap(targets.flatMap((target) => target.reasons)),
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
      "functionAddress",
      "sourceFunction",
      "contextCount",
      "effectTokens",
      "reasons",
      "selectorOutputRoles",
      "candidateResourcePathCount",
      "candidateResourcePathSamples",
      "attached",
      "enterSamples",
      "leaveSamples",
      "completeSamples",
      "argumentSnapshotSamples",
      "completeArgumentSnapshotSamples",
      "argumentRows",
      "argumentPointerRows",
      "readableArgumentRows",
      "argumentStringRows",
      "argumentPointerSamples",
      "leaveArgumentRows",
      "readableLeaveArgumentRows",
      "returnValueSamples",
      "nonZeroReturnValueSamples",
      "completeReturnValueSamples",
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
