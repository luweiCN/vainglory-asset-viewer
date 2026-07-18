#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { buildAnimationPathRecovery, readTsv, writeTsv } = require("./animation_path_recovery");

const defaultAnimationIndex = "extracted/reports/animation_resource_index.tsv";
const defaultCandidatePath = "extracted/reports/animation_candidate_files.tsv";
const defaultPlaceholderPath = "extracted/reports/build_resource_skipped_placeholders.tsv";
const defaultOutDir = "extracted/reports";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function exportAnimationPathRecovery({ animationIndexPath, candidatePath, placeholderPath, outDir, placeholderMax }) {
  const placeholderRows = fs.existsSync(placeholderPath)
    ? readTsv(placeholderPath).filter((row) => row.relativePath.endsWith(".anim"))
    : [];
  const recovery = buildAnimationPathRecovery({
    animationIndexPath,
    candidatePath,
    placeholderRows,
    placeholderMax,
  });
  const columns = [
    "hash",
    "relativePath",
    "matchSource",
    "size",
    "duration",
    "fps",
    "frameCount",
    "trackCount",
    "channelGroupCount",
    "nameTableValue",
    "filePath",
    "linkedPath",
  ];
  writeTsv(path.join(outDir, "animation_path_matches.tsv"), recovery.matches, columns);
  writeTsv(
    path.join(outDir, "animation_unresolved_candidates.tsv"),
    recovery.unresolved,
    columns.filter((column) => column !== "relativePath" && column !== "matchSource"),
  );

  return {
    matches: recovery.matches.length,
    unresolved: recovery.unresolved.length,
    placeholderPatterns: placeholderRows.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportAnimationPathRecovery({
    animationIndexPath: optionValue(args, "--animations", defaultAnimationIndex),
    candidatePath: optionValue(args, "--candidates", defaultCandidatePath),
    placeholderPath: optionValue(args, "--placeholders", defaultPlaceholderPath),
    outDir: optionValue(args, "--out", defaultOutDir),
    placeholderMax: Number(optionValue(args, "--placeholder-max", "15")),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportAnimationPathRecovery,
};
