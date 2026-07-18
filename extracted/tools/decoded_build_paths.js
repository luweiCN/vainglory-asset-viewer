#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { hasPrintfPlaceholder, normalizeBuildPath } = require("./resource_index");

const defaultDecodedSource = "extracted/reports/cff0_decoded_instances.tsv";
const defaultExistingPaths = "extracted/reports/build_paths_all.txt";
const defaultDecodedOut = "extracted/reports/decoded_build_paths.txt";
const defaultCombinedOut = "extracted/reports/build_paths_combined.txt";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
}

function concreteBuildPath(value) {
  const relativePath = normalizeBuildPath(value);
  if (!relativePath || hasPrintfPlaceholder(relativePath)) return null;
  return `build://${relativePath}`;
}

function extractBuildPathsFromText(text) {
  const paths = new Set();
  for (const match of text.matchAll(/build:\/\/[^\s|\t\r\n]+/g)) {
    const buildPath = concreteBuildPath(match[0]);
    if (buildPath) paths.add(buildPath);
  }
  return [...paths].sort();
}

function mergeBuildPathLists(lists) {
  const paths = new Set();
  for (const list of lists) {
    for (const value of list) {
      const buildPath = concreteBuildPath(value.trim());
      if (buildPath) paths.add(buildPath);
    }
  }
  return [...paths].sort();
}

function writePathList(filePath, paths) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${paths.join("\n")}\n`);
}

function exportDecodedBuildPaths({ decodedSource, existingPaths, decodedOut, combinedOut }) {
  const decodedPaths = extractBuildPathsFromText(fs.readFileSync(decodedSource, "utf8"));
  const existing = readLines(existingPaths);
  const combinedPaths = mergeBuildPathLists([existing, decodedPaths]);

  writePathList(decodedOut, decodedPaths);
  writePathList(combinedOut, combinedPaths);

  return {
    decodedPaths: decodedPaths.length,
    existingPaths: mergeBuildPathLists([existing]).length,
    combinedPaths: combinedPaths.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDecodedBuildPaths({
    decodedSource: optionValue(args, "--decoded", defaultDecodedSource),
    existingPaths: optionValue(args, "--existing", defaultExistingPaths),
    decodedOut: optionValue(args, "--decoded-out", defaultDecodedOut),
    combinedOut: optionValue(args, "--combined-out", defaultCombinedOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportDecodedBuildPaths,
  extractBuildPathsFromText,
  mergeBuildPathLists,
};
