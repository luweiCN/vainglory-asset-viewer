#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const {
  buildDefinitionBindingIndex,
  buildNativeBoneQueryIndex,
  buildSkinrepSlotTableIndex,
  classifyRuntimeBindingGap,
  nativeEvidenceForItem,
  skinrepSlotEvidenceForItem,
} = require("./runtime_binding_gap_report");

const defaultGraphPath = "extracted/viewer/runtime-skin-graph.json";
const defaultNativeTsv = "extracted/reports/native_bone_query_xrefs.tsv";
const defaultDefinitionTsv = "extracted/reports/definition_binding_tokens.tsv";
const defaultSkinrepSlotTsv = "extracted/reports/cff0_skin_object_graph.tsv";
const defaultJsonOut = "extracted/viewer/runtime-binding-config.json";
const defaultTsvOut = "extracted/reports/runtime_binding_config.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function uniqueJoin(values) {
  return [...new Set(values.filter(Boolean))].join("|");
}

function slotConfig(item, slot, nativeIndex, definitionIndex, skinrepIndex) {
  const nativeEvidence = nativeEvidenceForItem(nativeIndex, slot.slotName, item);
  const definitionEvidence = definitionIndex.get(`${item.sourceRelativePath || ""}\t${slot.bindToken || ""}`) || null;
  const skinrepEvidence = skinrepSlotEvidenceForItem(skinrepIndex, slot, item);
  const bindingKind = slot.hashResolved
    ? "skeleton-bone"
    : classifyRuntimeBindingGap(item, slot, nativeEvidence, definitionEvidence, skinrepEvidence);

  return {
    slotName: slot.slotName || "",
    bindToken: slot.bindToken || "",
    bindHash: slot.bindHash || "",
    bindingKind,
    resolvedSkeletonPath: slot.resolvedSkeletonPath || "",
    resolvedBoneIndex: slot.resolvedBoneIndex ?? "",
    nativeBoneQueryCount: nativeEvidence?.count || 0,
    nativeFunctions: nativeEvidence ? uniqueJoin(nativeEvidence.functionNames) : "",
    nativeAccessorOffsets: nativeEvidence ? uniqueJoin(nativeEvidence.accessorOffsets) : "",
    nativeNearbyEffects: nativeEvidence ? uniqueJoin(nativeEvidence.nearbyEffects) : "",
    nativeNearbySounds: nativeEvidence ? uniqueJoin(nativeEvidence.nearbySounds) : "",
    nativeSourceFiles: nativeEvidence ? uniqueJoin(nativeEvidence.sourceFiles) : "",
    definitionLabels: definitionEvidence ? uniqueJoin(definitionEvidence.labels) : "",
    definitionLocatorLabels: definitionEvidence ? uniqueJoin(definitionEvidence.locatorLabels) : "",
    definitionNearbyResources: definitionEvidence ? uniqueJoin(definitionEvidence.nearbyResources) : "",
    skinrepSlotTableCount: skinrepEvidence?.count || 0,
    skinrepOwnerLabels: skinrepEvidence ? uniqueJoin(skinrepEvidence.ownerLabels) : "",
    skinrepOwnerTypes: skinrepEvidence ? uniqueJoin(skinrepEvidence.ownerTypes) : "",
    skinrepOwnerLocalFieldOffsets: skinrepEvidence ? uniqueJoin(skinrepEvidence.ownerLocalFieldOffsets) : "",
    skinrepTargetObjectOffsets: skinrepEvidence ? uniqueJoin(skinrepEvidence.targetObjectOffsets) : "",
    skinrepTargetBones: skinrepEvidence ? uniqueJoin(skinrepEvidence.targetBones) : "",
    skinrepTargetBindTokens: skinrepEvidence ? uniqueJoin(skinrepEvidence.targetBindTokens) : "",
  };
}

function runtimeBindingConfigItems(graph, nativeRows = [], definitionRows = [], skinrepRows = []) {
  const nativeIndex = buildNativeBoneQueryIndex(nativeRows);
  const definitionIndex = buildDefinitionBindingIndex(definitionRows);
  const skinrepIndex = buildSkinrepSlotTableIndex(skinrepRows);

  return (graph.items || []).map((item) => ({
    rel: item.rel || "",
    character: item.character || "",
    modelLabel: item.modelLabel || "",
    sourceRelativePath: item.sourceRelativePath || "",
    meshPath: item.meshPath || "",
    skeletons: item.skeletons || [],
    runtimeBlockIndex: item.runtimeBlockIndex ?? "",
    runtimeConfidence: item.runtimeConfidence ?? "",
    slots: (item.bindSlots || []).map((slot) => slotConfig(item, slot, nativeIndex, definitionIndex, skinrepIndex)),
  }));
}

function runtimeBindingConfigRows(graph, nativeRows = [], definitionRows = [], skinrepRows = []) {
  const rows = [];
  for (const item of runtimeBindingConfigItems(graph, nativeRows, definitionRows, skinrepRows)) {
    for (const slot of item.slots) {
      rows.push({
        rel: item.rel,
        character: item.character,
        modelLabel: item.modelLabel,
        sourceRelativePath: item.sourceRelativePath,
        meshPath: item.meshPath,
        skeletons: item.skeletons.join("|"),
        runtimeBlockIndex: item.runtimeBlockIndex,
        runtimeConfidence: item.runtimeConfidence,
        ...slot,
      });
    }
  }
  return rows;
}

function summarizeRows(graph, rows) {
  const bindingKinds = {};
  for (const row of rows) bindingKinds[row.bindingKind] = (bindingKinds[row.bindingKind] || 0) + 1;
  return {
    items: (graph.items || []).length,
    slots: rows.length,
    bindingKinds: Object.fromEntries(Object.entries(bindingKinds).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function exportRuntimeBindingConfig({
  graphPath = defaultGraphPath,
  nativeTsv = defaultNativeTsv,
  definitionTsv = defaultDefinitionTsv,
  skinrepSlotTsv = defaultSkinrepSlotTsv,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const nativeRows = readTsv(nativeTsv);
  const definitionRows = readTsv(definitionTsv);
  const skinrepRows = readTsv(skinrepSlotTsv);
  const items = runtimeBindingConfigItems(graph, nativeRows, definitionRows, skinrepRows);
  const rows = runtimeBindingConfigRows(graph, nativeRows, definitionRows, skinrepRows);
  const summary = summarizeRows(graph, rows);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items }, null, 2)}\n`);
  writeTsv(tsvOut, rows, [
    "rel",
    "character",
    "modelLabel",
    "sourceRelativePath",
    "meshPath",
    "skeletons",
    "runtimeBlockIndex",
    "runtimeConfidence",
    "slotName",
    "bindToken",
    "bindHash",
    "bindingKind",
    "resolvedSkeletonPath",
    "resolvedBoneIndex",
    "nativeBoneQueryCount",
    "nativeFunctions",
    "nativeAccessorOffsets",
    "nativeNearbyEffects",
    "nativeNearbySounds",
    "nativeSourceFiles",
    "definitionLabels",
    "definitionLocatorLabels",
    "definitionNearbyResources",
    "skinrepSlotTableCount",
    "skinrepOwnerLabels",
    "skinrepOwnerTypes",
    "skinrepOwnerLocalFieldOffsets",
    "skinrepTargetObjectOffsets",
    "skinrepTargetBones",
    "skinrepTargetBindTokens",
  ]);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeBindingConfig({
    graphPath: optionValue(args, "--graph", defaultGraphPath),
    nativeTsv: optionValue(args, "--native-tsv", defaultNativeTsv),
    definitionTsv: optionValue(args, "--definition-tsv", defaultDefinitionTsv),
    skinrepSlotTsv: optionValue(args, "--skinrep-slot-tsv", defaultSkinrepSlotTsv),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  exportRuntimeBindingConfig,
  runtimeBindingConfigItems,
  runtimeBindingConfigRows,
};
