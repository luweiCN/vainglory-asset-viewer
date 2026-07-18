#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { buildResourceIndex } = require("./resource_index");

const defaultPathsFile = "extracted/reports/build_paths_all.txt";
const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultOutDir = "extracted/reports";
const defaultTreeRoot = "extracted/build_resources_by_path";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function extensionOf(relativePath) {
  const base = path.basename(relativePath);
  const index = base.lastIndexOf(".");
  return index >= 0 ? base.slice(index).toLowerCase() : "";
}

function categoryFor(relativePath) {
  const ext = extensionOf(relativePath);
  if (ext === ".def") return "definition";
  if (ext === ".anim") return "animation";
  if (ext === ".pfx" || ext === ".assetbundle") return "effect";
  if (ext === ".mesh") return "mesh";
  if (ext === ".skeleton") return "skeleton";
  if ([".mp3", ".ogg", ".wav", ".caf"].includes(ext)) return "audio";
  if ([".png", ".tga", ".psd", ".atlas"].includes(ext)) return "image";
  return "other";
}

function linkEntry(entry, treeRoot) {
  const outputPath = path.join(treeRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    fs.linkSync(entry.filePath, outputPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(entry.filePath, outputPath);
  }
  return outputPath;
}

function exportResourceIndex({ pathsFile, dataRoot, outDir, treeRoot }) {
  const lines = fs.readFileSync(pathsFile, "utf8").split(/\r?\n/);
  const index = buildResourceIndex(lines, dataRoot);
  ensureCleanDir(treeRoot);

  const matched = index.matched.map((entry) => ({
    ...entry,
    category: categoryFor(entry.relativePath),
    linkedPath: linkEntry(entry, treeRoot),
  }));

  const output = { ...index, matched };
  const columns = ["category", "relativePath", "hash", "size", "magic4", "filePath", "linkedPath"];
  writeJson(path.join(outDir, "build_resource_index.json"), output);
  writeTsv(path.join(outDir, "build_resource_index.tsv"), matched, columns);
  writeTsv(path.join(outDir, "build_resource_missing.tsv"), index.missing, ["relativePath", "hash", "filePath"]);
  writeTsv(path.join(outDir, "build_resource_skipped_placeholders.tsv"), index.skippedPlaceholders, [
    "relativePath",
    "buildPath",
  ]);

  for (const category of ["definition", "animation", "effect", "mesh", "skeleton", "audio", "image", "other"]) {
    writeTsv(
      path.join(outDir, `${category}_resource_index.tsv`),
      matched.filter((entry) => entry.category === category),
      columns,
    );
  }

  const counts = matched.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});

  return {
    matched: matched.length,
    missing: index.missing.length,
    skippedPlaceholders: index.skippedPlaceholders.length,
    skippedInvalid: index.skippedInvalid.length,
    counts,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportResourceIndex({
    pathsFile: optionValue(args, "--paths", defaultPathsFile),
    dataRoot: optionValue(args, "--data", defaultDataRoot),
    outDir: optionValue(args, "--out", defaultOutDir),
    treeRoot: optionValue(args, "--tree", defaultTreeRoot),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  categoryFor,
  exportResourceIndex,
  extensionOf,
};
