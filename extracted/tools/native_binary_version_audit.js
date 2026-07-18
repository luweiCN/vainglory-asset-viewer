#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const defaultEntries = [
  {
    platform: "android-arm64",
    binaryPath: "extracted/android_raw/lib/arm64-v8a/libGameKindred.so",
    analysisLogPath: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/analysis.log",
  },
  {
    platform: "ios-arm64",
    binaryPath: "extracted/ios_raw/Payload/GameKindred.app/GameKindred",
    analysisLogPath: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/analysis.log",
  },
];
const defaultViewerOut = "extracted/viewer/native-binary-version-audit.json";
const defaultTsvOut = "extracted/reports/native_binary_version_audit.tsv";
const defaultJsonOut = "extracted/reports/native_binary_version_audit_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function md5File(filePath) {
  return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
}

function md5FromAnalysisLog(text) {
  return String(text || "").match(/\bMD5=([0-9a-fA-F]{32})\b/)?.[1]?.toLowerCase() || "";
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

function summarize(items) {
  return {
    entries: items.length,
    exactBuilds: items.filter((item) => item.status === "exact-build").length,
    crossBuildReferences: items.filter((item) => item.status === "cross-build-reference").length,
    missingEvidence: items.filter((item) => item.status === "missing-evidence").length,
  };
}

function auditNativeBinaryVersions(entries = defaultEntries, generatedAt = new Date().toISOString()) {
  const items = entries.map((entry) => {
    const currentMd5 = entry.binaryPath && fs.existsSync(entry.binaryPath) ? md5File(entry.binaryPath) : "";
    const analysisLogText =
      entry.analysisLogText ?? (entry.analysisLogPath && fs.existsSync(entry.analysisLogPath) ? fs.readFileSync(entry.analysisLogPath, "utf8") : "");
    const referenceMd5 = md5FromAnalysisLog(analysisLogText);
    let status = "missing-evidence";
    if (currentMd5 && referenceMd5) status = currentMd5 === referenceMd5 ? "exact-build" : "cross-build-reference";
    return {
      platform: entry.platform,
      binaryPath: entry.binaryPath,
      analysisLogPath: entry.analysisLogPath || "",
      currentMd5,
      referenceMd5,
      status,
    };
  });
  return {
    generatedAt,
    summary: summarize(items),
    items,
  };
}

function reportRowsForAudit(manifest) {
  return (manifest.items || []).map((item) => ({
    platform: item.platform,
    status: item.status,
    currentMd5: item.currentMd5,
    referenceMd5: item.referenceMd5,
    binaryPath: item.binaryPath,
    analysisLogPath: item.analysisLogPath,
  }));
}

function exportNativeBinaryVersionAudit({
  entries = defaultEntries,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const manifest = auditNativeBinaryVersions(entries);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, reportRowsForAudit(manifest), [
    "platform",
    "status",
    "currentMd5",
    "referenceMd5",
    "binaryPath",
    "analysisLogPath",
  ]);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeBinaryVersionAudit({
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  auditNativeBinaryVersions,
  exportNativeBinaryVersionAudit,
  md5File,
  md5FromAnalysisLog,
  reportRowsForAudit,
  summarize,
};
