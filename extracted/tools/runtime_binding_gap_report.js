#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGraphPath = "extracted/viewer/runtime-skin-graph.json";
const defaultNativeTsv = "extracted/reports/native_bone_query_xrefs.tsv";
const defaultDefinitionTsv = "extracted/reports/definition_binding_tokens.tsv";
const defaultSkinrepSlotTsv = "extracted/reports/cff0_skin_object_graph.tsv";
const defaultTsvOut = "extracted/reports/runtime_binding_gaps.tsv";
const defaultJsonOut = "extracted/reports/runtime_binding_gaps.json";

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

function pipeValues(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueJoin(values) {
  return [...new Set(values.filter(Boolean))].join("|");
}

const genericContextTerms = new Set([
  "art",
  "characters",
  "default",
  "defaultskin",
  "glb",
  "mesh",
  "skin",
  "t1",
  "t2",
  "t3",
]);

function contextTermsForItem(item) {
  const text = [item.character, item.modelLabel, item.sourceRelativePath, item.rel].filter(Boolean).join(" ");
  const terms = new Set();
  for (const token of text.split(/[^A-Za-z0-9]+/)) {
    const normalized = token.toLowerCase();
    if (normalized.length < 3 || genericContextTerms.has(normalized)) continue;
    terms.add(normalized);
  }
  return [...terms];
}

function nativeContextText(row) {
  return [row.nearbyEffects, row.nearbySounds].filter(Boolean).join("|").toLowerCase();
}

function nativeRecordMatchesItem(row, item) {
  const contextText = nativeContextText(row);
  if (!contextText) return true;
  const terms = contextTermsForItem(item);
  if (!terms.length) return true;
  return terms.some((term) => contextText.includes(term));
}

function summarizeNativeRecords(records) {
  if (!records.length) return null;
  return {
    count: records.length,
    nearbyEffects: records.flatMap((row) => pipeValues(row.nearbyEffects)),
    nearbySounds: records.flatMap((row) => pipeValues(row.nearbySounds)),
    functionNames: records.map((row) => row.functionName),
    accessorOffsets: records.map((row) => row.accessorOffset),
    sourceFiles: records.map((row) => row.sourceFile),
  };
}

function parseTargetLabelEntries(value) {
  return pipeValues(value)
    .map((item) => {
      const match = item.match(/^(\d+):(.*)$/);
      if (!match) return null;
      return { offset: Number(match[1]), label: match[2] };
    })
    .filter(Boolean)
    .sort((left, right) => left.offset - right.offset);
}

function slotPairsFromSkinrepRow(row) {
  const pairs = new Set();

  const directBones = pipeValues(row.directBones).filter((bone) => /^Bone_/.test(bone));
  const directBindTokens = pipeValues(row.directBindTokens).filter((token) => /_bnd$/i.test(token));
  if (directBones.length && directBindTokens.length) {
    for (const bone of directBones) {
      for (const bindToken of directBindTokens) pairs.add(`${bone}\t${bindToken}`);
    }
    return [...pairs];
  }

  const entries = parseTargetLabelEntries(row.targetLabels);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!/^Bone_/.test(entry.label)) continue;
    for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
      const nextEntry = entries[nextIndex];
      if (nextEntry.offset - entry.offset > 16) break;
      if (/_bnd$/i.test(nextEntry.label)) pairs.add(`${entry.label}\t${nextEntry.label}`);
    }
  }

  if (pairs.size) return [...pairs];
  const bones = pipeValues(row.targetBones).filter((bone) => /^Bone_/.test(bone));
  const bindTokens = pipeValues(row.targetBindTokens).filter((token) => /_bnd$/i.test(token));
  for (const bone of bones) {
    for (const bindToken of bindTokens) pairs.add(`${bone}\t${bindToken}`);
  }
  return [...pairs];
}

function buildSkinrepSlotTableIndex(skinrepRows) {
  const index = new Map();
  for (const row of skinrepRows) {
    if (!row.relativePath) continue;
    const pairs = slotPairsFromSkinrepRow(row);
    for (const pair of pairs) {
      const key = `${row.relativePath}\t${pair}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    }
  }
  return index;
}

function summarizeSkinrepSlotRecords(records) {
  if (!records.length) return null;
  return {
    count: records.length,
    ownerLabels: records.map((row) => row.ownerLabel || row.modelLabel),
    ownerTypes: records.map((row) => row.ownerType || row.evidenceKind),
    ownerLocalFieldOffsets: records.map((row) => row.ownerLocalFieldOffset || row.rootLocalFieldOffset),
    targetObjectOffsets: records.map((row) => row.targetObjectOffset),
    targetBones: records.flatMap((row) => pipeValues(row.targetBones || row.directBones)),
    targetBindTokens: records.flatMap((row) => pipeValues(row.targetBindTokens || row.directBindTokens)),
  };
}

function skinrepSlotEvidenceForItem(skinrepIndex, slot, item) {
  const key = `${item.sourceRelativePath || ""}\t${slot.slotName || ""}\t${slot.bindToken || ""}`;
  return summarizeSkinrepSlotRecords(skinrepIndex.get(key) || []);
}

function buildNativeBoneQueryIndex(nativeRows) {
  const index = new Map();
  for (const row of nativeRows) {
    if (!row.boneName) continue;
    if (!index.has(row.boneName)) {
      index.set(row.boneName, {
        count: 0,
        nearbyEffects: [],
        nearbySounds: [],
        functionNames: [],
        accessorOffsets: [],
        sourceFiles: [],
        records: [],
      });
    }
    const entry = index.get(row.boneName);
    entry.count += 1;
    entry.nearbyEffects.push(...pipeValues(row.nearbyEffects));
    entry.nearbySounds.push(...pipeValues(row.nearbySounds));
    entry.functionNames.push(row.functionName);
    entry.accessorOffsets.push(row.accessorOffset);
    entry.sourceFiles.push(row.sourceFile);
    entry.records.push(row);
  }
  return index;
}

function nativeEvidenceForItem(nativeIndex, boneName, item) {
  const entry = nativeIndex.get(boneName);
  if (!entry) return null;
  return summarizeNativeRecords((entry.records || []).filter((row) => nativeRecordMatchesItem(row, item)));
}

function buildDefinitionBindingIndex(definitionRows) {
  const index = new Map();
  for (const row of definitionRows) {
    if (!row.relativePath || !row.bindToken) continue;
    const key = `${row.relativePath}\t${row.bindToken}`;
    if (!index.has(key)) {
      index.set(key, {
        labels: [],
        locatorLabels: [],
        nearbyResources: [],
      });
    }
    const entry = index.get(key);
    entry.labels.push(row.labelBefore);
    entry.locatorLabels.push(...pipeValues(row.labelsBefore));
    entry.nearbyResources.push(...pipeValues(row.nearbyResources));
  }
  return index;
}

function isEffectOrAuraSlot(slot) {
  const text = `${slot.slotName || ""} ${slot.bindToken || ""}`.toLowerCase();
  return /\b(fx|aura|light)\b/.test(text.replace(/[_-]/g, " ")) || /fx|aura|light/.test(text);
}

function isDefinitionLogicalLocator(definitionEvidence) {
  const labels = definitionEvidence?.labels || [];
  const text = labels.join(" ").replace(/\?/g, "").toLowerCase();
  return /projectile|spawn|locator|attach|emission|plaque|mouth|barrier|(^|[^a-z])c_[lr]?\d+/.test(text);
}

function isExternalAttachment(item) {
  const text = [item.rel, item.character, item.modelLabel, item.sourceRelativePath].filter(Boolean).join(" ");
  return /(^|[/_\s-])attachments?([/_\s-]|$)/i.test(text);
}

function classifyRuntimeBindingGap(item, slot, nativeEvidence, definitionEvidence, skinrepEvidence) {
  if (nativeEvidence?.count) return "native-bone-query";
  if (isEffectOrAuraSlot(slot)) return "effect-or-aura-slot";
  if (skinrepEvidence?.count) return "skinrep-slot-table";
  if (isDefinitionLogicalLocator(definitionEvidence)) return "definition-logical-locator";
  if (isExternalAttachment(item)) return "external-attachment";
  if (!Array.isArray(item.skeletons) || item.skeletons.length === 0) return "missing-skeleton";
  return "unresolved-bind-hash";
}

function isUnresolvedSlot(slot) {
  return slot?.hashResolved === false || slot?.resolvedBoneIndex == null;
}

function runtimeBindingGapRows(graph, nativeRows = [], definitionRows = [], skinrepRows = []) {
  const nativeIndex = buildNativeBoneQueryIndex(nativeRows);
  const definitionIndex = buildDefinitionBindingIndex(definitionRows);
  const skinrepIndex = buildSkinrepSlotTableIndex(skinrepRows);
  const rows = [];

  for (const item of graph.items || []) {
    for (const slot of item.bindSlots || []) {
      if (!isUnresolvedSlot(slot)) continue;
      const nativeEvidence = nativeEvidenceForItem(nativeIndex, slot.slotName, item);
      const definitionEvidence = definitionIndex.get(`${item.sourceRelativePath || ""}\t${slot.bindToken || ""}`) || null;
      const skinrepEvidence = skinrepSlotEvidenceForItem(skinrepIndex, slot, item);
      const nativeBoneQueryCount = nativeEvidence?.count || 0;
      rows.push({
        rel: item.rel || "",
        character: item.character || "",
        modelLabel: item.modelLabel || "",
        sourceRelativePath: item.sourceRelativePath || "",
        meshPath: item.meshPath || "",
        skeletons: (item.skeletons || []).join("|"),
        slotName: slot.slotName || "",
        bindToken: slot.bindToken || "",
        bindHash: slot.bindHash || "",
        nativeBoneQueryCount,
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
        gapKind: classifyRuntimeBindingGap(item, slot, nativeEvidence, definitionEvidence, skinrepEvidence),
      });
    }
  }

  return rows;
}

function summarizeRows(rows) {
  const gapKinds = {};
  for (const row of rows) gapKinds[row.gapKind] = (gapKinds[row.gapKind] || 0) + 1;
  return {
    unresolvedSlots: rows.length,
    withNativeBoneQuery: rows.filter((row) => Number(row.nativeBoneQueryCount) > 0).length,
    gapKinds: Object.fromEntries(Object.entries(gapKinds).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function exportRuntimeBindingGapReport({
  graphPath = defaultGraphPath,
  nativeTsv = defaultNativeTsv,
  definitionTsv = defaultDefinitionTsv,
  skinrepSlotTsv = defaultSkinrepSlotTsv,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const rows = runtimeBindingGapRows(graph, readTsv(nativeTsv), readTsv(definitionTsv), readTsv(skinrepSlotTsv));
  const summary = summarizeRows(rows);
  const columns = [
    "gapKind",
    "rel",
    "character",
    "modelLabel",
    "sourceRelativePath",
    "meshPath",
    "skeletons",
    "slotName",
    "bindToken",
    "bindHash",
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
  ];

  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeBindingGapReport({
    graphPath: optionValue(args, "--graph", defaultGraphPath),
    nativeTsv: optionValue(args, "--native-tsv", defaultNativeTsv),
    definitionTsv: optionValue(args, "--definition-tsv", defaultDefinitionTsv),
    skinrepSlotTsv: optionValue(args, "--skinrep-slot-tsv", defaultSkinrepSlotTsv),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDefinitionBindingIndex,
  buildNativeBoneQueryIndex,
  buildSkinrepSlotTableIndex,
  classifyRuntimeBindingGap,
  exportRuntimeBindingGapReport,
  nativeEvidenceForItem,
  runtimeBindingGapRows,
  skinrepSlotEvidenceForItem,
};
