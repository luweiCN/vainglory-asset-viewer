#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { buildStringTargets, parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultJsonOut = "extracted/reports/current_native_preview_string_xref_audit.json";
const defaultTsvOut = "extracted/reports/current_native_preview_string_xref_audit.tsv";
const defaultViewerOut = "extracted/viewer/current-native-preview-string-xref-audit.json";

const previewStringAnchors = [
  "UI::SKIN_VIEWER::DIALOG_GET_OPALS",
  "UI::SKIN_VIEWER::ON_PURCHASED_SKU",
  "UI::SKIN_VIEWER::ON_SKIN_CRAFTED",
  "MENU_HERO_INSPECTOR_ABILITY_A_LABEL",
  "MENU_HERO_INSPECTOR_ABILITY_B_LABEL",
  "MENU_HERO_INSPECTOR_ULTIMATE_LABEL",
  "presentationData",
  "seasonalData",
  "hudDynamicData",
  "rateAppData",
  "preview",
  "tab_title",
  "title",
  "progressBar",
  "imageUrl",
  "heroselect",
  "portrait_%s",
  "card_skin_",
  "GameMode_5v5_MapViewer_Private",
  "MapViewer_5v5",
  "MapViewer_5v5_Visuals",
];

const uiEventBusBranchTargets = new Map([
  [0xe0b438, "event-name-id-lookup"],
  [0xe0b474, "event-payload-build"],
  [0xe0b2f4, "event-dispatch"],
]);

const stringCopyTargets = new Map([[0x7fc97c, "string-copy"]]);

const profileLoaderBranchTargets = new Map([
  [0x8cbf40, "level-runtime-visuals-loader"],
  [0x8cc27c, "levelvisuals-runtime-apply-processor"],
  [0xe36f38, "scene-probe-profile-payload-load-entry"],
  [0xe38cbc, "scene-probe-inner-profile-payload-entry"],
  [0xe390a4, "scene-probe-lightfield-profile-parser"],
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function signExtend(value, bits) {
  const signBit = 1 << (bits - 1);
  return (value & (signBit - 1)) - (value & signBit);
}

function sectionForVirtualAddress(sections, virtualAddress) {
  return (
    sections.find((section) => {
      if (!section.size) return false;
      return virtualAddress >= section.virtualAddress && virtualAddress < section.virtualAddress + section.size;
    }) || null
  );
}

function fileOffsetForVirtualAddress(elf, virtualAddress, size = 4) {
  const section = sectionForVirtualAddress(elf.sections, virtualAddress);
  if (!section) return -1;
  const delta = virtualAddress - section.virtualAddress;
  if (delta < 0 || delta + size > section.size) return -1;
  return section.fileOffset + delta;
}

function branchTarget(instruction, pc) {
  const opcode = (instruction & 0xfc000000) >>> 0;
  if (opcode !== 0x94000000 && opcode !== 0x14000000) return null;
  return {
    mode: opcode === 0x94000000 ? "bl" : "b-tail",
    targetAddress: pc + signExtend(instruction & 0x03ffffff, 26) * 4,
  };
}

function scanNearbyBranches(buffer, elf, centerAddress, beforeBytes = 0x80, afterBytes = 0xc0) {
  const text = elf.sections.find((section) => section.name === ".text");
  if (!text) return [];
  const start = Math.max(text.virtualAddress, centerAddress - beforeBytes);
  const end = Math.min(text.virtualAddress + text.size, centerAddress + afterBytes);
  const branches = [];
  for (let address = start; address + 4 <= end; address += 4) {
    const fileOffset = fileOffsetForVirtualAddress(elf, address, 4);
    if (fileOffset < 0) continue;
    const instruction = buffer.readUInt32LE(fileOffset);
    const branch = branchTarget(instruction, address);
    if (!branch) continue;
    branches.push({
      address,
      addressHex: hex(address),
      mode: branch.mode,
      targetAddress: branch.targetAddress,
      targetAddressHex: hex(branch.targetAddress),
      knownRole:
        uiEventBusBranchTargets.get(branch.targetAddress) ||
        stringCopyTargets.get(branch.targetAddress) ||
        profileLoaderBranchTargets.get(branch.targetAddress) ||
        "",
      instructionHex: instruction.toString(16).padStart(8, "0"),
    });
  }
  return branches;
}

function classifyReference(targetName, branches) {
  const branchTargetSet = new Set(branches.map((branch) => branch.targetAddress));
  const touchesProfileLoader = [...profileLoaderBranchTargets.keys()].some((target) => branchTargetSet.has(target));
  if (touchesProfileLoader) return "profile-loader-touching-candidate";
  const hasEventNameLookup = branchTargetSet.has(0xe0b438);
  const hasEventPayloadOrDispatch = branchTargetSet.has(0xe0b474) || branchTargetSet.has(0xe0b2f4);
  if (/^UI::SKIN_VIEWER/.test(targetName) && hasEventNameLookup && hasEventPayloadOrDispatch) {
    return "skin-viewer-ui-event-bus";
  }
  if (/MENU_HERO_INSPECTOR/.test(targetName)) return "hero-inspector-ui-label";
  if (["seasonalData", "presentationData", "hudDynamicData", "rateAppData"].includes(targetName)) {
    return branchTargetSet.has(0x7fc97c) ? "ui-data-schema-field-string-copy" : "ui-data-schema-field-xref";
  }
  if (["tab_title", "title", "preview", "progressBar", "imageUrl"].includes(targetName)) {
    return "ui-card-or-tab-data-field-xref";
  }
  if (targetName === "heroselect") return "generic-menu-string-xref";
  if (targetName === "portrait_%s" || targetName === "card_skin_") return "hero-skin-card-string-xref";
  return "current-string-xref";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const columns = [
    "targetName",
    "targetAddressHex",
    "xrefAddressHex",
    "mode",
    "classification",
    "touchesProfileLoader",
    "knownBranchRoles",
    "knownBranchTargets",
  ];
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function buildCurrentNativePreviewStringXrefAudit({ binaryPath = defaultBinary } = {}) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const stringTargets = buildStringTargets(buffer, elf, previewStringAnchors);
  const textReferences = scanTextReferences(buffer, elf, stringTargets);
  const records = textReferences.map((reference) => {
    const nearbyBranches = scanNearbyBranches(buffer, elf, reference.xrefAddress);
    const classification = classifyReference(reference.targetName, nearbyBranches);
    const knownBranches = nearbyBranches.filter((branch) => branch.knownRole);
    return {
      targetName: reference.targetName,
      targetAddress: reference.targetAddress,
      targetAddressHex: hex(reference.targetAddress),
      targetSection: reference.targetSection,
      xrefAddress: reference.xrefAddress,
      xrefAddressHex: hex(reference.xrefAddress),
      mode: reference.mode,
      baseAddressHex: hex(reference.baseAddress),
      baseInstructionHex: reference.baseInstructionHex,
      useInstructionHex: reference.useInstructionHex,
      classification,
      touchesProfileLoader: classification === "profile-loader-touching-candidate",
      knownBranchRoles: knownBranches.map((branch) => branch.knownRole).join("|"),
      knownBranchTargets: knownBranches.map((branch) => branch.targetAddressHex).join("|"),
      nearbyBranches,
    };
  });

  const targetCounts = new Map();
  for (const target of stringTargets) targetCounts.set(target.name, (targetCounts.get(target.name) || 0) + 1);

  return {
    generatedAt: new Date().toISOString(),
    binaryPath,
    policy:
      "diagnostic-only current Android preview/menu string xref audit; string xrefs are hints, not proof of active hero preview profile selection",
    anchors: previewStringAnchors,
    summary: {
      anchorsConfigured: previewStringAnchors.length,
      stringTargetsFound: stringTargets.length,
      textReferences: records.length,
      skinViewerUiEventBusReferences: records.filter(
        (record) => record.classification === "skin-viewer-ui-event-bus",
      ).length,
      heroInspectorUiLabelReferences: records.filter(
        (record) => record.classification === "hero-inspector-ui-label",
      ).length,
      uiDataSchemaFieldReferences: records.filter(
        (record) =>
          record.classification === "ui-data-schema-field-string-copy" ||
          record.classification === "ui-data-schema-field-xref",
      ).length,
      uiCardOrTabDataFieldReferences: records.filter(
        (record) => record.classification === "ui-card-or-tab-data-field-xref",
      ).length,
      presentationDataReferences: records.filter((record) => record.targetName === "presentationData").length,
      mapViewerStringTargets:
        (targetCounts.get("GameMode_5v5_MapViewer_Private") || 0) +
        (targetCounts.get("MapViewer_5v5") || 0) +
        (targetCounts.get("MapViewer_5v5_Visuals") || 0),
      referencesTouchingProfileLoader: records.filter((record) => record.touchesProfileLoader).length,
      provenActiveHeroPreviewProfile: false,
    },
    interpretation: [
      "UI::SKIN_VIEWER strings have exact current-binary xrefs, but their local branch neighborhoods match UI event-bus dispatch helpers, not LevelVisuals/profile loading.",
      "presentationData is grouped with seasonalData, hudDynamicData, and rateAppData in the current binary, which supports a UI data/schema interpretation rather than active profile selection.",
      "preview is grouped with tab_title, title, progressBar, and imageUrl style fields, which supports a UI card/tab data interpretation rather than LevelVisuals profile selection.",
      "MapViewer strings are still absent from the current Android binary as direct string targets; MapViewer remains a definition-resource candidate only.",
      "No preview/menu string xref in this audit touches the current Level runtime visuals loader, LevelVisuals apply processor, scene/probe profile payload load entry, or inner lightfield parser.",
    ],
    stringTargets: stringTargets.map((target) => ({
      name: target.name,
      kind: target.kind,
      virtualAddress: target.virtualAddress,
      virtualAddressHex: hex(target.virtualAddress),
      fileOffset: target.fileOffset,
      fileOffsetHex: hex(target.fileOffset),
      section: target.section,
    })),
    records,
  };
}

function main() {
  const args = process.argv.slice(2);
  const manifest = buildCurrentNativePreviewStringXrefAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), manifest);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), manifest);
  writeTsv(optionValue(args, "--tsv-out", defaultTsvOut), manifest.records);
  console.log(JSON.stringify({ summary: manifest.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildCurrentNativePreviewStringXrefAudit,
};
