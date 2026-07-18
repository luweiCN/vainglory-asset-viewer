#!/usr/bin/env node
const { exportNativeTypeRegistry } = require("./native_type_registry");

const defaultSourcePath = "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1004b.c";
const defaultRegistryTsvOut = "extracted/reports/native_type_registry.tsv";
const defaultSchemaTsvOut = "extracted/reports/native_skin_chain_schema.tsv";

const defaultFocusTypes = [
  "DefinitionManifest",
  "SkinEntry",
  "SkinManifest",
  "HeroEntry",
  "HeroManifest",
  "SkinRep",
  "AnimatedMesh",
  "StaticMesh",
  "AttachmentSkinInfo",
  "Attachment",
  "StaticEntity",
  "AliasSet",
  "AlternateAnimation",
  "NamedAnimation",
  "AnimationPool",
  "NamedBone",
  "Path",
  "SubFlare",
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseFocusTypes(text) {
  return text ? text.split(",").map((item) => item.trim()).filter(Boolean) : defaultFocusTypes;
}

function exportNativeSkinChainSchema({
  sourcePath = defaultSourcePath,
  registryTsvOut = defaultRegistryTsvOut,
  schemaTsvOut = defaultSchemaTsvOut,
  focusTypes = defaultFocusTypes,
} = {}) {
  return exportNativeTypeRegistry({
    sourcePath,
    registryTsvOut,
    schemaTsvOut,
    focusTypes,
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportNativeSkinChainSchema({
    sourcePath: optionValue(args, "--source", defaultSourcePath),
    registryTsvOut: optionValue(args, "--registry-out", defaultRegistryTsvOut),
    schemaTsvOut: optionValue(args, "--schema-out", defaultSchemaTsvOut),
    focusTypes: parseFocusTypes(optionValue(args, "--focus", "")),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  defaultFocusTypes,
  exportNativeSkinChainSchema,
};
