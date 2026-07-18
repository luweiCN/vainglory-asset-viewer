#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { classifyDefinitionString } = require("./definition_instance_graph");

const defaultKindredEffectsPath = "extracted/build_resources_by_path/Effects/KindredEffects.def";
const defaultJsonOut = "extracted/reports/kindred_effect_hash_slots.json";
const defaultViewerOut = "extracted/viewer/kindred-effect-hash-slots.json";
const defaultTsvOut = "extracted/reports/kindred_effect_hash_slots.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function u32(value) {
  return value >>> 0;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(String(value || ""), "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return u32(hash);
}

function hex32(value) {
  return u32(value).toString(16).toUpperCase().padStart(8, "0");
}

function fnv1a32Hex(value) {
  return hex32(fnv1a32(value));
}

function pointerSizeForDefinitionFormat(definitionFormatByte) {
  return Number(definitionFormatByte) === 5 ? 8 : 4;
}

function parsePatchTablesForInstances(parsed, buffer) {
  const patchTables = [];
  let blockIndex = -1;
  let instanceIndex = -1;

  for (const chunk of parsed.chunks || []) {
    if (chunk.magic === "DEF0") {
      blockIndex += 1;
      continue;
    }
    if (chunk.magic === "INST") {
      instanceIndex += 1;
      continue;
    }
    if (chunk.magic !== "PTCH" || instanceIndex < 0) continue;

    const payload = buffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patchTables[instanceIndex] = {
      blockIndex,
      instanceIndex,
      chunkOffset: chunk.offset,
      ...parsePatchTable(payload),
    };
  }

  return patchTables;
}

function effectTokenForPfxPath(resourcePath) {
  const basename = path.posix.basename(String(resourcePath || ""));
  const stem = basename.replace(/\.[^.]+$/, "");
  return stem ? `Effect_${stem}` : "";
}

function buildKindredEffectHashSlotRowsFromDecoded({ instances = [], patchTables = [] } = {}) {
  const rows = [];

  instances.forEach((instance, instanceIndex) => {
    const patchTable = patchTables[instanceIndex];
    if (!patchTable?.entries?.length || !Buffer.isBuffer(instance.decodedPayload)) return;

    const sourceRecordByOffset = new Map(
      (instance.stringRecords || [])
        .filter((record) => Number.isFinite(Number(record.offset)))
        .map((record) => [Number(record.offset), record]),
    );
    const pointerSize = pointerSizeForDefinitionFormat(instance.definitionFormatByte);

    for (const entry of patchTable.entries) {
      const sourceRecord = sourceRecordByOffset.get(Number(entry.sourceOffset));
      if (!sourceRecord?.value) continue;

      const classified = classifyDefinitionString(sourceRecord.value.trim());
      if (classified.semantic !== "resource" || !/\.pfx$/i.test(classified.targetRelativePath)) continue;

      const keyOffset = Number(entry.targetOffset) - pointerSize;
      if (keyOffset < 0 || keyOffset + 4 > instance.decodedPayload.length) continue;

      const effectHash = instance.decodedPayload.readUInt32LE(keyOffset);
      const expectedEffectToken = effectTokenForPfxPath(classified.targetRelativePath);
      const expectedEffectTokenHash = expectedEffectToken ? fnv1a32(expectedEffectToken) : null;
      const effectHashHex = hex32(effectHash);
      const expectedEffectTokenHashHex = expectedEffectTokenHash === null ? "" : hex32(expectedEffectTokenHash);

      rows.push({
        source: "KindredEffects.def",
        blockIndex: instance.blockIndex,
        definitionFormatByte: instance.definitionFormatByte,
        definitionVersionByte: instance.definitionVersionByte,
        instanceIndex,
        patchChunkOffset: patchTable.chunkOffset,
        sourceOffset: entry.sourceOffset,
        targetOffset: entry.targetOffset,
        keyOffset,
        pointerSize,
        sourceStringValue: sourceRecord.value,
        resourceCategory: classified.resourceCategory,
        resourcePath: classified.targetRelativePath,
        buildPath: classified.targetBuildPath,
        effectHash,
        effectHashHex,
        expectedEffectToken,
        expectedEffectTokenHash: expectedEffectTokenHash === null ? "" : expectedEffectTokenHash,
        expectedEffectTokenHashHex,
        hashMatchesResourceStemToken: expectedEffectTokenHashHex === effectHashHex,
      });
    }
  });

  return rows.sort((left, right) => {
    const hashOrder = left.effectHashHex.localeCompare(right.effectHashHex);
    if (hashOrder) return hashOrder;
    const resourceOrder = left.resourcePath.localeCompare(right.resourcePath);
    if (resourceOrder) return resourceOrder;
    return Number(left.blockIndex) - Number(right.blockIndex);
  });
}

function summarize(rows) {
  const uniqueEffectHashes = new Set(rows.map((row) => row.effectHashHex).filter(Boolean));
  const uniqueResourcePaths = new Set(rows.map((row) => row.resourcePath).filter(Boolean));
  const uniqueHashResourcePairs = new Set(rows.map((row) => `${row.effectHashHex}\t${row.resourcePath}`));
  const exactStemHashRows = rows.filter((row) => row.hashMatchesResourceStemToken);
  const exactStemHashUniquePairs = new Set(
    exactStemHashRows.map((row) => `${row.effectHashHex}\t${row.resourcePath}`),
  );
  const byDefinitionFormatByte = {};
  for (const row of rows) {
    const key = String(row.definitionFormatByte ?? "");
    byDefinitionFormatByte[key] = (byDefinitionFormatByte[key] || 0) + 1;
  }

  return {
    rows: rows.length,
    uniqueEffectHashes: uniqueEffectHashes.size,
    uniqueResourcePaths: uniqueResourcePaths.size,
    uniqueHashResourcePairs: uniqueHashResourcePairs.size,
    duplicateBlockRows: rows.length - uniqueHashResourcePairs.size,
    exactStemHashRows: exactStemHashRows.length,
    exactStemHashUniquePairs: exactStemHashUniquePairs.size,
    renderPromotionAllowed: false,
    byDefinitionFormatByte,
  };
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

function buildKindredEffectHashSlotManifest(kindredEffectsPath = defaultKindredEffectsPath, generatedAt = new Date().toISOString()) {
  const parsed = parseCff0File(kindredEffectsPath);
  const buffer = fs.readFileSync(kindredEffectsPath);
  const instances = decodeInstanceChunks(parsed, buffer);
  const patchTables = parsePatchTablesForInstances(parsed, buffer);
  const items = buildKindredEffectHashSlotRowsFromDecoded({ instances, patchTables });

  return {
    generatedAt,
    source: {
      kindredEffectsPath,
      evidence: "CFF0 INST payload key before PTCH PFX pointer",
    },
    summary: summarize(items),
    items,
  };
}

function exportKindredEffectHashSlots({
  kindredEffectsPath = defaultKindredEffectsPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildKindredEffectHashSlotManifest(kindredEffectsPath);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "source",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "instanceIndex",
    "patchChunkOffset",
    "sourceOffset",
    "targetOffset",
    "keyOffset",
    "pointerSize",
    "effectHashHex",
    "expectedEffectToken",
    "expectedEffectTokenHashHex",
    "hashMatchesResourceStemToken",
    "resourceCategory",
    "resourcePath",
    "buildPath",
    "sourceStringValue",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportKindredEffectHashSlots({
    kindredEffectsPath: optionValue(args, "--kindred-effects", defaultKindredEffectsPath),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildKindredEffectHashSlotManifest,
  buildKindredEffectHashSlotRowsFromDecoded,
  effectTokenForPfxPath,
  exportKindredEffectHashSlots,
  fnv1a32,
  fnv1a32Hex,
  hex32,
  parsePatchTablesForInstances,
  pointerSizeForDefinitionFormat,
  summarize,
};
