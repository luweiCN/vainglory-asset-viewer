#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { findAdrpAddXrefs } = require("./native_xrefs");

const defaultBinary = "extracted/android_apktool/lib/arm64-v8a/libGameKindred.so";
const defaultOut = "extracted/reports/android_native_string_xrefs.tsv";

const defaultTargets = [
  { name: "KindredManifestSymbol", address: 0x1a9870d },
  { name: "KindredSkinManifestSymbol", address: 0x1aca08c },
  { name: "KindredSkinManifestPath", address: 0x1aca0a2 },
  { name: "HeroManifestName", address: 0x1acce7e },
  { name: "HeroManifestSymbol", address: 0x1acd90a },
  { name: "HeroManifestPath", address: 0x1acd919 },
  { name: "DEF0Magic", address: 0x1d20818 },
  { name: "SYMBMagic", address: 0x1d20820 },
  { name: "INSTMagic", address: 0x1d20828 },
  { name: "PTCHMagic", address: 0x1d20830 },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function disassemble(binaryPath) {
  const result = spawnSync("objdump", ["-d", "--no-show-raw-insn", binaryPath], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `objdump exited ${result.status}`);
  return result.stdout.split(/\r?\n/);
}

function exportNativeXrefs({ binaryPath, outPath, targets = defaultTargets }) {
  const lines = disassemble(binaryPath);
  const matches = findAdrpAddXrefs(lines, targets);
  const rows = matches.map((match) => ({
    targetName: match.targetName,
    targetAddress: `0x${match.targetAddress.toString(16)}`,
    adrpAddress: `0x${match.adrpAddress.toString(16)}`,
    xrefAddress: `0x${match.xrefAddress.toString(16)}`,
    register: match.register,
    adrpText: match.adrpText.trim(),
    xrefText: match.xrefText.trim(),
  }));

  writeTsv(outPath, rows, [
    "targetName",
    "targetAddress",
    "adrpAddress",
    "xrefAddress",
    "register",
    "adrpText",
    "xrefText",
  ]);

  return { matches: rows.length, outPath };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeXrefs({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    outPath: optionValue(args, "--out", defaultOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultTargets,
  exportNativeXrefs,
  writeTsv,
};
