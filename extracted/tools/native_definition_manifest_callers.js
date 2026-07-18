#!/usr/bin/env node
const { exportNativeSkinManifestCallers } = require("./native_skin_manifest_callers");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_definition_manifest_callers.tsv";
const defaultJsonOut = "extracted/reports/native_definition_manifest_caller_context.json";

const defaultGetterSpecs = [
  { platform: "android", functionName: "FUN_00ce9cb8", lookupKind: "definition-load-by-symbol" },
  { platform: "android", functionName: "FUN_00ce9d20", lookupKind: "definition-load-by-symbol-alt" },
  { platform: "android", functionName: "FUN_00ce9d88", lookupKind: "definition-component-roots" },
  { platform: "ios", functionName: "FUN_10034bf64", lookupKind: "definition-load-by-symbol" },
  { platform: "ios", functionName: "FUN_10034c060", lookupKind: "definition-load-by-symbol-alt" },
  { platform: "ios", functionName: "FUN_10034c0cc", lookupKind: "definition-component-roots" },
];

function optionValues(args, name, fallback) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values.length ? values : fallback;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseGetterSpecs(text) {
  if (!text) return defaultGetterSpecs;
  return text.split(",").map((item) => {
    const [functionName, lookupKind = "definition-manifest-loader"] = item.split(":");
    return { platform: "", functionName: functionName.trim(), lookupKind: lookupKind.trim() };
  });
}

function exportNativeDefinitionManifestCallers({
  sourcePaths = defaultSourcePaths,
  getterSpecs = defaultGetterSpecs,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  return exportNativeSkinManifestCallers({
    sourcePaths,
    getterSpecs,
    tsvOut,
    jsonOut,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeDefinitionManifestCallers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    getterSpecs: parseGetterSpecs(optionValue(args, "--getters", "")),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultGetterSpecs,
  exportNativeDefinitionManifestCallers,
};
