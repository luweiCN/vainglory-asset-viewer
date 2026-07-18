#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultTargetsPath = "extracted/reports/pfx_encrypted_runtime_targets.json";
const defaultOverlayOut = "extracted/reports/pfx_runtime_memory_overlays.jsonl";
const defaultJsonOut = "extracted/reports/pfx_runtime_memory_overlay_summary.json";
const defaultTsvOut = "extracted/reports/pfx_runtime_memory_overlay_coverage.tsv";
const defaultSampleLimit = 10;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
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

function decodeHexBytes(value) {
  const text = String(value || "")
    .replace(/^0x/i, "")
    .replace(/[^0-9a-f]/gi, "");
  if (!text || text.length % 2 !== 0) return null;
  return Buffer.from(text, "hex");
}

function decodeBytes(entry) {
  if (Array.isArray(entry?.bytes)) return Buffer.from(entry.bytes.map((value) => Number(value) & 0xff));
  if (entry?.bytesHex || entry?.hex) return decodeHexBytes(entry.bytesHex || entry.hex);
  if (entry?.bytesBase64 || entry?.base64) return Buffer.from(String(entry.bytesBase64 || entry.base64), "base64");
  return null;
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

function readRecords(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    return parsed.records || parsed.items || parsed.ranges || [parsed];
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseJsonLine)
      .filter(Boolean);
  }
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

function targetKey(target) {
  return `${String(target.kind || "").toLowerCase()}:${normalizeAddress(target.virtualAddress).toLowerCase()}`;
}

function buildTargetRows(targetManifest) {
  return (targetManifest.targets || []).map((target) => ({
    kind: target.kind || "",
    virtualAddress: normalizeAddress(target.virtualAddress),
    byteLength: Number(target.byteLength || 0),
    sourceSymbol: target.sourceSymbol || "",
    callbackCount: (target.callbacks || []).length,
  }));
}

function buildOverlayRows(records = []) {
  const rows = [];
  const errors = [];
  for (const record of records) {
    if (record?.type && record.type !== "pfx_runtime_data") {
      if (record.type === "pfx_runtime_data_error") errors.push(record);
      continue;
    }
    const virtualAddress = normalizeAddress(record.virtualAddress || record.address || record.start || record.sourceAddress);
    const bytes = decodeBytes(record);
    if (!virtualAddress || !bytes?.length) continue;
    rows.push({
      kind: record.kind || "",
      virtualAddress,
      byteLength: Number(record.byteLength || bytes.length),
      bytes,
      runtimeAddress: record.runtimeAddress || "",
      source: record.source || record.type || "runtime-overlay",
    });
  }
  return { rows, errors };
}

function bestOverlayByTarget(overlayRows) {
  const byAddress = new Map();
  for (const row of overlayRows) {
    const key = `${String(row.kind || "").toLowerCase()}:${row.virtualAddress.toLowerCase()}`;
    const fallbackKey = `:${row.virtualAddress.toLowerCase()}`;
    for (const candidateKey of [key, fallbackKey]) {
      const current = byAddress.get(candidateKey);
      if (!current || row.bytes.length > current.bytes.length) byAddress.set(candidateKey, row);
    }
  }
  return byAddress;
}

function summarizeCoverage(targetRows, overlayRows, errors = []) {
  const overlays = bestOverlayByTarget(overlayRows);
  const coverageRows = targetRows.map((target) => {
    const exact = overlays.get(targetKey(target));
    const addressOnly = overlays.get(`:${target.virtualAddress.toLowerCase()}`);
    const overlay = exact || addressOnly || null;
    const availableBytes = overlay?.bytes.length || 0;
    const status =
      !overlay ? "missing" : availableBytes < target.byteLength ? "short-read" : "covered";
    return {
      ...target,
      status,
      availableBytes,
      runtimeAddress: overlay?.runtimeAddress || "",
    };
  });
  const byStatus = {};
  const byKind = {};
  for (const row of coverageRows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byKind[row.kind] = (byKind[row.kind] || 0) + 1;
  }
  const coveredRows = coverageRows.filter((row) => row.status === "covered");
  const targetSample = (row) => ({
    kind: row.kind,
    virtualAddress: row.virtualAddress,
    byteLength: row.byteLength,
    availableBytes: row.availableBytes,
    sourceSymbol: row.sourceSymbol,
    callbackCount: row.callbackCount,
  });
  return {
    summary: {
      targetRows: targetRows.length,
      overlayRows: overlayRows.length,
      coveredRows: coveredRows.length,
      missingRows: coverageRows.filter((row) => row.status === "missing").length,
      shortReadRows: coverageRows.filter((row) => row.status === "short-read").length,
      errorRows: errors.length,
      readyForSemantics: coveredRows.length === targetRows.length && targetRows.length > 0,
      byStatus,
      byKind,
      missingTargetSamples: coverageRows
        .filter((row) => row.status === "missing")
        .slice(0, defaultSampleLimit)
        .map(targetSample),
      shortReadTargetSamples: coverageRows
        .filter((row) => row.status === "short-read")
        .slice(0, defaultSampleLimit)
        .map(targetSample),
      errorSamples: errors.slice(0, defaultSampleLimit).map((error) => ({
        type: error.type || "",
        virtualAddress: normalizeAddress(error.virtualAddress || error.address || error.start || error.sourceAddress),
        error: error.error || error.message || "",
      })),
    },
    coverageRows,
  };
}

function writeOverlay(filePath, targetRows, overlayRows) {
  const overlays = bestOverlayByTarget(overlayRows);
  const rows = [];
  for (const target of targetRows) {
    const overlay = overlays.get(targetKey(target)) || overlays.get(`:${target.virtualAddress.toLowerCase()}`);
    if (!overlay || overlay.bytes.length < target.byteLength) continue;
    rows.push({
      kind: target.kind,
      virtualAddress: target.virtualAddress,
      byteLength: target.byteLength,
      bytesHex: overlay.bytes.subarray(0, target.byteLength).toString("hex"),
      source: "pfx-runtime-overlay-import",
    });
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
  return rows.length;
}

function importRuntimeOverlay({
  inputPath,
  targetsPath = defaultTargetsPath,
  overlayOut = defaultOverlayOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  if (!inputPath) throw new Error("missing --input <frida-jsonl-or-overlay-json>");
  if (!fs.existsSync(inputPath)) throw new Error(`missing runtime dump input: ${inputPath}`);
  const targetManifest = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
  const targetRows = buildTargetRows(targetManifest);
  const { rows: overlayRows, errors } = buildOverlayRows(readRecords(inputPath));
  const { summary, coverageRows } = summarizeCoverage(targetRows, overlayRows, errors);
  const writtenOverlayRows = writeOverlay(overlayOut, targetRows, overlayRows);
  const output = {
    generatedAt: new Date().toISOString(),
    source: { inputPath, targetsPath, overlayOut },
    summary: { ...summary, writtenOverlayRows },
  };
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(output, null, 2)}\n`);
  writeTsv(tsvOut, coverageRows, [
    "kind",
    "virtualAddress",
    "byteLength",
    "availableBytes",
    "status",
    "sourceSymbol",
    "callbackCount",
    "runtimeAddress",
  ]);
  return output.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  try {
    const summary = importRuntimeOverlay({
      inputPath: optionValue(args, "--input", ""),
      targetsPath: optionValue(args, "--targets", defaultTargetsPath),
      overlayOut: optionValue(args, "--overlay-out", defaultOverlayOut),
      jsonOut: optionValue(args, "--json-out", defaultJsonOut),
      tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    });
    console.log(JSON.stringify(summary, null, 2));
    if (hasFlag(args, "--strict") && !summary.readyForSemantics) process.exit(2);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  buildOverlayRows,
  buildTargetRows,
  importRuntimeOverlay,
  summarizeCoverage,
};
