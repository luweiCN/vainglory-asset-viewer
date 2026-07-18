#!/usr/bin/env node
const {
  buildAnimationBoneMappingReport,
  readTsv,
  writeAnimationBoneMappingReport,
} = require("./animation_bone_mapping_report");

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function main() {
  const args = process.argv.slice(2);
  const input = optionValue(args, "--input", "extracted/reports/skin_animation_bindings.tsv");
  const jsonOut = optionValue(args, "--json", "extracted/reports/animation_bone_mapping_report.json");
  const tsvOut = optionValue(args, "--tsv", "extracted/reports/animation_bone_mapping_report.tsv");
  const viewerOut = optionValue(args, "--viewer", "extracted/viewer/animation-bone-mapping-manifest.json");
  const failuresOut = optionValue(args, "--failures", "extracted/reports/animation_bone_mapping_failures.tsv");

  const report = buildAnimationBoneMappingReport({ bindingRows: readTsv(input) });
  writeAnimationBoneMappingReport(report, { jsonOut, tsvOut, viewerOut, failuresOut });

  console.log(
    JSON.stringify(
      {
        count: report.count,
        failureCount: report.failureCount,
        transformRecords: report.items.reduce((sum, item) => sum + item.transformRecords, 0),
        matchedTransformRecords: report.items.reduce((sum, item) => sum + item.matchedTransformRecords, 0),
      },
      null,
      2,
    ),
  );
}

if (require.main === module) main();
