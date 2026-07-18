#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { readDefinitionIndex } = require("./export_cff0_reports");
const { classifyDefinitionString } = require("./definition_instance_graph");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultTsvOut = "extracted/reports/definition_ability_set_slots.tsv";
const defaultJsonOut = "extracted/reports/definition_ability_set_slots_summary.json";

const abilitySetFields = {
  abilityList: 0x30,
  defaultAttackList: 0x40,
  specialA: 0x48,
  specialB: 0x4c,
  specialC: 0x50,
};

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function readI32(buffer, offset) {
  if (!buffer || offset < 0 || offset + 4 > buffer.length) return null;
  return buffer.readInt32LE(offset);
}

function fieldKind(field) {
  if (field.value) return "string";
  if (field.sourceOffset) return "object";
  return "zero";
}

function fieldMap(fields) {
  const map = new Map();
  for (const field of fields) {
    if (!map.has(field.fieldOffset)) map.set(field.fieldOffset, []);
    map.get(field.fieldOffset).push(field);
  }
  return map;
}

function fieldsInRange(fields, start, end) {
  return fields.filter((field) => field.fieldOffset >= start && field.fieldOffset < end);
}

function stringsNearObject(fields, objectOffset, windowBytes = 0x140) {
  return fieldsInRange(fields, objectOffset, objectOffset + windowBytes)
    .filter((field) => field.value)
    .map((field) => field.value);
}

function abilityInfoForObject(fields, objectOffset) {
  const values = stringsNearObject(fields, objectOffset, 0x160);
  const abilityName = values.find((value) => /^Ability__/.test(value)) || "";
  if (!abilityName) return null;
  return {
    objectOffset,
    abilityName,
    titleLabel: values.find((value) => /^HERO_ABILITY_.*_NAME$/.test(value)) || "",
    typeLabel: values.find((value) => /^LABEL_ABILITY_TYPE_/.test(value)) || "",
  };
}

function abilityRefsFromContainer(fields, containerOffset, windowBytes = 0x2400) {
  const refs = [];
  const seen = new Set();
  for (const field of fieldsInRange(fields, containerOffset, containerOffset + windowBytes)) {
    if (fieldKind(field) !== "object") continue;
    const info = abilityInfoForObject(fields, field.sourceOffset);
    if (!info) continue;
    const key = `${info.objectOffset}\t${info.abilityName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      sourceFieldOffset: field.fieldOffset,
      sourceLocalOffset: field.fieldOffset - containerOffset,
      ...info,
    });
  }
  return refs.sort((left, right) => left.sourceFieldOffset - right.sourceFieldOffset || left.objectOffset - right.objectOffset);
}

function objectRefsFromContainer(fields, containerOffset, windowBytes = 0x300) {
  return fieldsInRange(fields, containerOffset, containerOffset + windowBytes)
    .filter((field) => fieldKind(field) === "object")
    .map((field) => ({
      sourceFieldOffset: field.fieldOffset,
      sourceLocalOffset: field.fieldOffset - containerOffset,
      objectOffset: field.sourceOffset,
    }))
    .sort((left, right) => left.sourceFieldOffset - right.sourceFieldOffset || left.objectOffset - right.objectOffset);
}

function directObjectRefsFromPointerArray(fields, containerOffset, pointerSize, { searchWindow = 0x180, minRunLength = 2 } = {}) {
  const objectFieldsByOffset = new Map();
  for (const field of fieldsInRange(fields, containerOffset, containerOffset + searchWindow)) {
    if (fieldKind(field) !== "object") continue;
    if (!objectFieldsByOffset.has(field.fieldOffset)) objectFieldsByOffset.set(field.fieldOffset, field);
  }

  const runs = [];
  for (const start of [...objectFieldsByOffset.keys()].sort((left, right) => left - right)) {
    const refs = [];
    for (let offset = start; objectFieldsByOffset.has(offset); offset += pointerSize) {
      const field = objectFieldsByOffset.get(offset);
      refs.push({
        sourceFieldOffset: field.fieldOffset,
        sourceLocalOffset: field.fieldOffset - containerOffset,
        objectOffset: field.sourceOffset,
      });
    }
    if (refs.length < minRunLength) continue;
    const abilityNames = refs.map((ref) => abilityInfoForObject(fields, ref.objectOffset)?.abilityName).filter(Boolean);
    const distinctAbilityNames = new Set(abilityNames);
    const abcScore =
      (abilityNames.some((name) => /__A$/.test(name)) ? 1 : 0) +
      (abilityNames.some((name) => /__B$/.test(name)) ? 1 : 0) +
      (abilityNames.some((name) => /__C$/.test(name)) ? 1 : 0);
    runs.push({ start, refs, abilityCount: abilityNames.length, distinctAbilityCount: distinctAbilityNames.size, abcScore });
  }

  return runs
    .sort((left, right) => {
      if (right.abcScore !== left.abcScore) return right.abcScore - left.abcScore;
      if (right.distinctAbilityCount !== left.distinctAbilityCount) return right.distinctAbilityCount - left.distinctAbilityCount;
      if (right.abilityCount !== left.abilityCount) return right.abilityCount - left.abilityCount;
      if (right.refs.length !== left.refs.length) return right.refs.length - left.refs.length;
      return left.start - right.start;
    })[0]?.refs || [];
}

function labelsForObject(fields, objectOffset) {
  return stringsNearObject(fields, objectOffset, 0x40).filter((value) => /^Ability__|^HERO_ABILITY_|^LABEL_ABILITY_TYPE_|^\*Talent_|^Buff_/.test(value));
}

function formatAbilityRefs(refs) {
  return refs
    .map((ref, index) => {
      const labels = [ref.titleLabel, ref.typeLabel].filter(Boolean).join(",");
      const suffix = labels ? `(${labels})` : "";
      return `${index}:${ref.abilityName}@${ref.objectOffset}:field0x${ref.sourceFieldOffset.toString(16)}${suffix}`;
    })
    .join("|");
}

function formatObjectRefs(refs) {
  return refs
    .map((ref, index) => `${index}:object@${ref.objectOffset}:field0x${ref.sourceFieldOffset.toString(16)}`)
    .join("|");
}

function formatSpecialIndexTargets(objectRefs, fields, specialIndexes) {
  return Object.entries(specialIndexes)
    .map(([slot, index]) => {
      if (!Number.isInteger(index) || index < 0) return `${slot}=${index}:unset`;
      const ref = objectRefs[index];
      if (!ref) return `${slot}=${index}:missing`;
      const labels = labelsForObject(fields, ref.objectOffset).slice(0, 6).join(",");
      return `${slot}=${index}:object@${ref.objectOffset}:field0x${ref.sourceFieldOffset.toString(16)}${labels ? `(${labels})` : ""}`;
    })
    .join("|");
}

function abilityRefsForDirectObjectRefs(fields, objectRefs) {
  const refs = [];
  const seen = new Set();
  for (const objectRef of objectRefs) {
    const info = abilityInfoForObject(fields, objectRef.objectOffset);
    if (!info) continue;
    const key = `${info.objectOffset}\t${info.abilityName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ ...objectRef, ...info });
  }
  return refs;
}

function candidateScore({ abilityRefs, defaultAttackRefs, specialIndexes, objectRefs, hasAbilityList }) {
  let score = 0;
  if (hasAbilityList) score += 3;
  score += Math.min(abilityRefs.length, 6);
  if (abilityRefs.some((ref) => /__A$/.test(ref.abilityName))) score += 2;
  if (abilityRefs.some((ref) => /__B$/.test(ref.abilityName))) score += 2;
  if (abilityRefs.some((ref) => /__C$/.test(ref.abilityName))) score += 2;
  if (defaultAttackRefs.length) score += 1;
  const distinctSpecialIndexes = new Set(Object.values(specialIndexes).filter((index) => Number.isInteger(index) && index >= 0));
  score += Math.min(distinctSpecialIndexes.size, 3);
  for (const index of Object.values(specialIndexes)) {
    if (Number.isInteger(index) && index >= 0 && index < abilityRefs.length) score += 1;
    if (Number.isInteger(index) && index >= 0 && index < objectRefs.length) score += 1;
  }
  return score;
}

function pointerSizeForBlock(block) {
  return Number(block.definitionFormatByte) === 5 ? 8 : 4;
}

function abilitySetCandidatesForBlock(block, { scanLimit = 0x180, step = 4 } = {}) {
  const byFieldOffset = fieldMap(block.fields);
  const candidates = [];
  const maxBase = Math.min(scanLimit, block.decodedPayload.length - 0x58);
  const pointerSize = pointerSizeForBlock(block);

  for (let base = 0; base <= maxBase; base += step) {
    const abilityListField = (byFieldOffset.get(base + abilitySetFields.abilityList) || []).find(
      (field) => fieldKind(field) === "object",
    );
    if (!abilityListField) continue;

    const defaultAttackField = (byFieldOffset.get(base + abilitySetFields.defaultAttackList) || []).find(
      (field) => fieldKind(field) === "object",
    );
    const specialIndexes = {
      specialA: readI32(block.decodedPayload, base + abilitySetFields.specialA),
      specialB: readI32(block.decodedPayload, base + abilitySetFields.specialB),
      specialC: readI32(block.decodedPayload, base + abilitySetFields.specialC),
    };
    if (Object.values(specialIndexes).some((index) => index == null)) continue;
    if (Object.values(specialIndexes).every((index) => index < -1 || index > 40)) continue;

    const abilityRefs = abilityRefsFromContainer(block.fields, abilityListField.sourceOffset);
    if (!abilityRefs.length) continue;
    const objectRefs = objectRefsFromContainer(block.fields, abilityListField.sourceOffset);
    const directObjectRefs = directObjectRefsFromPointerArray(block.fields, abilityListField.sourceOffset, pointerSize);
    const directAbilityRefs = abilityRefsForDirectObjectRefs(block.fields, directObjectRefs);
    const defaultAttackRefs = defaultAttackField ? abilityRefsFromContainer(block.fields, defaultAttackField.sourceOffset) : [];
    const score = candidateScore({
      abilityRefs,
      defaultAttackRefs,
      specialIndexes,
      objectRefs,
      hasAbilityList: Boolean(abilityListField),
    });

    candidates.push({
      abilitySetBaseOffset: base,
      abilityListObjectOffset: abilityListField.sourceOffset,
      defaultAttackListObjectOffset: defaultAttackField?.sourceOffset || "",
      specialIndexes,
      objectRefs,
      directObjectRefs,
      abilityRefs,
      directAbilityRefs,
      defaultAttackRefs,
      pointerSize,
      score,
    });
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftSpecialDistinct = new Set(Object.values(left.specialIndexes).filter((index) => Number.isInteger(index) && index >= 0)).size;
    const rightSpecialDistinct = new Set(Object.values(right.specialIndexes).filter((index) => Number.isInteger(index) && index >= 0)).size;
    if (rightSpecialDistinct !== leftSpecialDistinct) return rightSpecialDistinct - leftSpecialDistinct;
    if (right.abilityRefs.length !== left.abilityRefs.length) return right.abilityRefs.length - left.abilityRefs.length;
    return left.abilitySetBaseOffset - right.abilitySetBaseOffset;
  });
}

function patchedFieldsFrom({ instance, patchTable }) {
  const stringByOffset = new Map(instance.stringRecords.map((record) => [record.offset, record.value]));
  return patchTable.entries
    .map((entry) => {
      const value = stringByOffset.get(entry.sourceOffset) || "";
      const classified = value ? classifyDefinitionString(value) : null;
      return {
        fieldOffset: entry.targetOffset,
        sourceOffset: entry.sourceOffset,
        value,
        semantic: classified?.semantic || "",
        resourceCategory: classified?.resourceCategory || "",
        targetRelativePath: classified?.targetRelativePath || "",
      };
    })
    .sort((left, right) => left.fieldOffset - right.fieldOffset || left.sourceOffset - right.sourceOffset);
}

function pairedInstancePatchBlocks(entry) {
  const filePath = entry.linkedPath || entry.filePath;
  const fileBuffer = fs.readFileSync(filePath);
  const parsed = parseCff0File(filePath);
  const instances = decodeInstanceChunks(parsed, fileBuffer);
  const patches = [];
  let blockIndex = -1;

  for (const chunk of parsed.chunks) {
    if (chunk.magic === "DEF0") blockIndex += 1;
    if (chunk.magic !== "PTCH") continue;
    const payload = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patches.push({ blockIndex, ...parsePatchTable(payload) });
  }

  const patchByBlock = new Map(patches.map((patch) => [patch.blockIndex, patch]));
  return instances
    .map((instance) => {
      const patchTable = patchByBlock.get(instance.blockIndex);
      if (!patchTable) return null;
      return {
        relativePath: entry.relativePath,
        hash: entry.hash,
        blockIndex: instance.blockIndex,
        definitionFormatByte: instance.definitionFormatByte,
        definitionVersionByte: instance.definitionVersionByte,
        payloadSize: instance.payloadSize,
        decodedPayload: instance.decodedPayload,
        fields: patchedFieldsFrom({ instance, patchTable }),
      };
    })
    .filter(Boolean);
}

function confidenceForCandidate(candidate) {
  if (!candidate) return "none";
  if (candidate.score >= 13 && candidate.abilityRefs.length >= 3) return "high";
  if (candidate.score >= 8) return "medium";
  return "low";
}

function buildDefinitionAbilitySetSlotRows(definitions) {
  const rows = [];
  for (const entry of definitions) {
    if (!entry.relativePath?.startsWith("Characters/")) continue;
    for (const block of pairedInstancePatchBlocks(entry)) {
      const candidate = abilitySetCandidatesForBlock(block)[0];
      if (!candidate) continue;
      rows.push({
        relativePath: block.relativePath,
        hash: block.hash,
        blockIndex: block.blockIndex,
        definitionFormatByte: block.definitionFormatByte,
        definitionVersionByte: block.definitionVersionByte,
        payloadSize: block.payloadSize,
        abilitySetBaseOffset: `0x${candidate.abilitySetBaseOffset.toString(16)}`,
        abilityListObjectOffset: candidate.abilityListObjectOffset,
        defaultAttackListObjectOffset: candidate.defaultAttackListObjectOffset,
        pointerSize: candidate.pointerSize,
        specialAIndex: candidate.specialIndexes.specialA,
        specialBIndex: candidate.specialIndexes.specialB,
        specialCIndex: candidate.specialIndexes.specialC,
        directListObjectRefCount: candidate.directObjectRefs.length,
        directListObjectRefs: formatObjectRefs(candidate.directObjectRefs),
        directAbilitySlotCount: candidate.directAbilityRefs.length,
        directAbilitySlots: formatAbilityRefs(candidate.directAbilityRefs),
        directSpecialIndexTargets: formatSpecialIndexTargets(candidate.directObjectRefs, block.fields, candidate.specialIndexes),
        listObjectRefCount: candidate.objectRefs.length,
        listObjectRefs: formatObjectRefs(candidate.objectRefs.slice(0, 48)),
        abilitySlotCount: candidate.abilityRefs.length,
        abilitySlots: formatAbilityRefs(candidate.abilityRefs),
        specialIndexTargets: formatSpecialIndexTargets(candidate.objectRefs, block.fields, candidate.specialIndexes),
        defaultAttackCandidateCount: candidate.defaultAttackRefs.length,
        defaultAttackCandidates: formatAbilityRefs(candidate.defaultAttackRefs),
        confidence: confidenceForCandidate(candidate),
        score: candidate.score,
        interpretation:
          "Decoded AbilitySet candidate using native AbilitySet layout. directAbilitySlots are read from the first contiguous pointer array at +0x30; abilitySlots are broader surrounding evidence.",
      });
    }
  }

  return rows.sort((left, right) => {
    const pathOrder = left.relativePath.localeCompare(right.relativePath);
    if (pathOrder) return pathOrder;
    return Number(left.blockIndex) - Number(right.blockIndex);
  });
}

function summarize(rows, definitions) {
  const byConfidence = {};
  for (const row of rows) byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
  return {
    characterDefinitions: definitions.filter((entry) => entry.relativePath?.startsWith("Characters/")).length,
    rows: rows.length,
    highConfidenceRows: rows.filter((row) => row.confidence === "high").length,
    mediumConfidenceRows: rows.filter((row) => row.confidence === "medium").length,
    lowConfidenceRows: rows.filter((row) => row.confidence === "low").length,
    rowsWithThreeSpecialTargets: rows.filter((row) => /specialA=.*object@/.test(row.specialIndexTargets) && /specialB=.*object@/.test(row.specialIndexTargets) && /specialC=.*object@/.test(row.specialIndexTargets)).length,
    rowsWithThreeDirectSpecialTargets: rows.filter((row) => /specialA=.*object@/.test(row.directSpecialIndexTargets) && /specialB=.*object@/.test(row.directSpecialIndexTargets) && /specialC=.*object@/.test(row.directSpecialIndexTargets)).length,
    rowsWithDirectABCSlots: rows.filter((row) => /__A@/.test(row.directAbilitySlots) && /__B@/.test(row.directAbilitySlots) && /__C@/.test(row.directAbilitySlots)).length,
    byConfidence,
    sampleDefinitions: uniq(rows.slice(0, 20).map((row) => row.relativePath)),
  };
}

function exportDefinitionAbilitySetSlots({
  definitionIndex = defaultDefinitionIndex,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const definitions = readDefinitionIndex(definitionIndex);
  const rows = buildDefinitionAbilitySetSlotRows(definitions);
  const columns = [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "payloadSize",
    "abilitySetBaseOffset",
    "abilityListObjectOffset",
    "defaultAttackListObjectOffset",
    "pointerSize",
    "specialAIndex",
    "specialBIndex",
    "specialCIndex",
    "directListObjectRefCount",
    "directListObjectRefs",
    "directAbilitySlotCount",
    "directAbilitySlots",
    "directSpecialIndexTargets",
    "listObjectRefCount",
    "listObjectRefs",
    "abilitySlotCount",
    "abilitySlots",
    "specialIndexTargets",
    "defaultAttackCandidateCount",
    "defaultAttackCandidates",
    "confidence",
    "score",
    "interpretation",
  ];
  writeTsv(tsvOut, rows, columns);

  const summary = summarize(rows, definitions);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(
    jsonOut,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, sampleRows: rows.slice(0, 100) }, null, 2)}\n`,
  );
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDefinitionAbilitySetSlots({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  abilityInfoForObject,
  abilityRefsFromContainer,
  abilityRefsForDirectObjectRefs,
  abilitySetCandidatesForBlock,
  directObjectRefsFromPointerArray,
  buildDefinitionAbilitySetSlotRows,
  exportDefinitionAbilitySetSlots,
  formatSpecialIndexTargets,
  objectRefsFromContainer,
  pairedInstancePatchBlocks,
  pointerSizeForBlock,
};
