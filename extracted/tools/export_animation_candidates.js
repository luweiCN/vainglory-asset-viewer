#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { isLikelyAnimationHeader, parseAnimationHeader, parseAnimationLayout } = require("./animation_tools");

const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultOutDir = "extracted/reports";
const defaultTreeRoot = "extracted/animation_candidates_by_hash";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function walkFiles(dir, output = []) {
  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) walkFiles(filePath, output);
    else output.push({ filePath, size: stat.size });
  }
  return output;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function hashFromDataPath(filePath) {
  return path.basename(filePath);
}

function linkCandidate(entry, treeRoot) {
  const outputPath = path.join(treeRoot, entry.hash.slice(0, 2), `${entry.hash}.anim`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    fs.linkSync(entry.filePath, outputPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(entry.filePath, outputPath);
  }
  return outputPath;
}

function exportAnimationCandidates({ dataRoot, outDir, treeRoot }) {
  ensureCleanDir(treeRoot);
  const items = [];

  for (const { filePath, size } of walkFiles(dataRoot)) {
    if (size < 64 || size > 2_000_000) continue;
    const buffer = fs.readFileSync(filePath);
    if (!isLikelyAnimationHeader(buffer)) continue;
    const header = parseAnimationHeader(buffer);
    const layout = parseAnimationLayout(buffer);
    const hash = hashFromDataPath(filePath);
    const entry = {
      hash,
      filePath,
      size,
      duration: Number(header.duration.toFixed(6)),
      fps: Number(header.fps.toFixed(3)),
      frameCount: header.frameCount,
      trackCount: header.trackCount,
      channelGroupCount: header.channelGroupCount,
      nameTableValue: header.nameTableValue,
      dataOffset: layout.dataOffset,
      trackFormatCodes: layout.trackFormatCodes.map((value) => value.toString(16).padStart(4, "0")).join(","),
      trackKeyOffsets: layout.trackKeyOffsets.join(","),
    };
    entry.linkedPath = linkCandidate(entry, treeRoot);
    items.push(entry);
  }

  items.sort((left, right) => left.hash.localeCompare(right.hash));
  const columns = [
    "hash",
    "size",
    "duration",
    "fps",
    "frameCount",
    "trackCount",
    "channelGroupCount",
    "nameTableValue",
    "dataOffset",
    "trackFormatCodes",
    "trackKeyOffsets",
    "filePath",
    "linkedPath",
  ];
  writeJson(path.join(outDir, "animation_candidate_files.json"), { count: items.length, items });
  writeTsv(path.join(outDir, "animation_candidate_files.tsv"), items, columns);

  return { count: items.length, treeRoot };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAnimationCandidates({
    dataRoot: optionValue(args, "--data", defaultDataRoot),
    outDir: optionValue(args, "--out", defaultOutDir),
    treeRoot: optionValue(args, "--tree", defaultTreeRoot),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportAnimationCandidates,
  hashFromDataPath,
  walkFiles,
};
