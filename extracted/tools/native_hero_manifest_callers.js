#!/usr/bin/env node
const { exportNativeSkinManifestCallers } = require("./native_skin_manifest_callers");

const defaultSourcePaths = [
  "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions",
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
];
const defaultTsvOut = "extracted/reports/native_hero_manifest_callers.tsv";
const defaultJsonOut = "extracted/reports/native_hero_manifest_caller_context.json";

const defaultGetterSpecs = [
  { platform: "android", functionName: "FUN_00ce9b48", lookupKind: "hero-entry-by-internal-name" },
  { platform: "android", functionName: "FUN_00ce9ba0", lookupKind: "hero-entry-by-id" },
  { platform: "android", functionName: "FUN_00ce9bf0", lookupKind: "hero-entry-exists-by-name" },
  { platform: "ios", functionName: "FUN_10034be08", lookupKind: "hero-entry-by-internal-name" },
  { platform: "ios", functionName: "FUN_10034be60", lookupKind: "hero-entry-by-id" },
  { platform: "ios", functionName: "FUN_10034be94", lookupKind: "hero-entry-exists-by-name" },
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
    const [functionName, lookupKind = "hero-manifest-getter"] = item.split(":");
    return { platform: "", functionName: functionName.trim(), lookupKind: lookupKind.trim() };
  });
}

function exportNativeHeroManifestCallers({
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
  const summary = exportNativeHeroManifestCallers({
    sourcePaths: optionValues(args, "--source", defaultSourcePaths),
    getterSpecs: parseGetterSpecs(optionValue(args, "--getters", "")),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultGetterSpecs,
  exportNativeHeroManifestCallers,
};
