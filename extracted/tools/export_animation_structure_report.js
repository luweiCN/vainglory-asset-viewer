#!/usr/bin/env node
const {
  buildAnimationStructureReport,
  readTsv,
  writeAnimationStructureReport,
} = require("./animation_structure_report");

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function main() {
  const args = process.argv.slice(2);
  const input = optionValue(args, "--input", "extracted/reports/animation_resource_index.tsv");
  const jsonOut = optionValue(args, "--json", "extracted/reports/animation_structure_report.json");
  const tsvOut = optionValue(args, "--tsv", "extracted/reports/animation_structure_report.tsv");
  const viewerOut = optionValue(args, "--viewer", "extracted/viewer/animation-structure-manifest.json");
  const failuresOut = optionValue(args, "--failures", "extracted/reports/animation_structure_failures.tsv");

  const report = buildAnimationStructureReport(readTsv(input));
  writeAnimationStructureReport(report, { jsonOut, tsvOut, viewerOut, failuresOut });
  console.log(
    JSON.stringify(
      {
        count: report.count,
        failureCount: report.failureCount,
        transformRecords: report.items.reduce((sum, item) => sum + item.likelyTransformRecords, 0),
      },
      null,
      2,
    ),
  );
}

if (require.main === module) main();
