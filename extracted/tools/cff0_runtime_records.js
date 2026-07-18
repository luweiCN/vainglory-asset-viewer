#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { classifyDefinitionString } = require("./definition_instance_graph");
const { readDefinitionIndex } = require("./export_cff0_reports");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultJsonOut = "extracted/reports/cff0_runtime_records.json";
const defaultSkinTsvOut = "extracted/reports/cff0_runtime_skin_records.tsv";
const defaultSlotTsvOut = "extracted/reports/cff0_runtime_slot_records.tsv";
const defaultSkinFieldsTsvOut = "extracted/reports/cff0_runtime_skin_fields.tsv";
const defaultObjectRefsTsvOut = "extracted/reports/cff0_runtime_object_refs.tsv";
const defaultSchemaOffsetsTsvOut = "extracted/reports/cff0_runtime_schema_offsets.tsv";
const defaultLocatorTsvOut = "extracted/reports/cff0_runtime_locator_records.tsv";

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pipe(values) {
  return unique(values).join("|");
}

function pushSample(list, value, limit = 10) {
  if (!value || list.includes(value) || list.length >= limit) return;
  list.push(value);
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function countSummary(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

function isCharacterArtMesh(relativePath) {
  return /^Characters\//.test(relativePath || "") && /\/Art\/.+\.mesh$/i.test(relativePath || "");
}

function isSkinLabel(value) {
  return /(?:_DefaultSkin|_Skin(?:_|$)|Skin_)/.test(value || "");
}

function isExcludedRecordLabel(value) {
  return /^(?:Effect_|Sound_|Ability__|HERO_|CHAR_INFO_|LABEL_|RECOMMENDED_|Buff_|[*?]|Default$|Attack$|AltAttack$|CritAttack$)/.test(value || "");
}

function isBoneName(value) {
  return /^Bone_[A-Za-z0-9_]+$/.test(value || "");
}

function isBindTokenValue(value) {
  if (!value || isBoneName(value)) return false;
  if (/(^|[_./-])[A-Za-z0-9_]+_bnd$/i.test(value)) return true;
  return /^(?:root|spine|head|jaw|gun|staff|sword|shield|muzzle|launcher|bow|mask|hat|helm|tail|crystal)[A-Za-z0-9_]*$/i.test(value);
}

function patchedBlockFrom({ relativePath, hash, instance, patchTable }) {
  const stringByOffset = new Map(instance.stringRecords.map((record) => [record.offset, record.value]));
  const stringAtOffset = (offset) => stringByOffset.get(offset) || shortPrintableStringAt(instance.decodedPayload, offset) || "";
  const fields = patchTable.entries
    .map((entry) => {
      const value = stringAtOffset(entry.sourceOffset);
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

  return {
    relativePath,
    hash,
    blockIndex: instance.blockIndex,
    definitionFormatByte: instance.definitionFormatByte,
    definitionVersionByte: instance.definitionVersionByte,
    payloadSize: instance.payloadSize,
    decodedPayload: instance.decodedPayload,
    stringByOffset,
    fields,
  };
}

function shortPrintableStringAt(buffer, offset, minLength = 2, maxLength = 128) {
  if (!Buffer.isBuffer(buffer) || !Number.isInteger(offset) || offset < 0 || offset >= buffer.length) return "";
  const chars = [];
  for (let cursor = offset; cursor < buffer.length && chars.length < maxLength; cursor += 1) {
    const value = buffer[cursor];
    if (value === 0) break;
    if (value < 0x20 || value > 0x7e) return "";
    chars.push(value);
  }
  if (chars.length < minLength) return "";
  return Buffer.from(chars).toString("ascii");
}

function fieldsInRange(block, start, end) {
  return block.fields.filter((field) => field.fieldOffset >= start && field.fieldOffset < end);
}

function referenceKind(field) {
  if (field.value) return "string";
  if (field.sourceOffset) return "object";
  return "zero";
}

function fieldRole(candidate, field) {
  const localFieldOffset = field.fieldOffset - candidate.recordStartField;
  if (localFieldOffset === 0 && field.value === candidate.modelLabel) return "skin-label";
  if (field.fieldOffset === candidate.meshFieldOffset) return "mesh";
  if (field.resourceCategory === "skeleton") return "skeleton";
  if (field.resourceCategory === "animation") return "animation";
  if (field.resourceCategory === "audio") return "audio";
  if (/^Effect_/.test(field.value || "")) return "effect-label";
  if (isBoneName(field.value)) return "bone-slot";
  if (isBindTokenValue(field.value)) return "bind-token";
  if (referenceKind(field) === "object") return "object-ref";
  if (field.semantic === "resource") return field.resourceCategory || "resource";
  if (field.value) return "label";
  return "";
}

function labelFieldBeforeMesh(block, meshField) {
  return block.fields
    .filter((field) => {
      if (field.fieldOffset >= meshField || field.fieldOffset < meshField - 40) return false;
      if (!field.value || field.semantic === "resource" || isExcludedRecordLabel(field.value)) return false;
      return isSkinLabel(field.value);
    })
    .sort((left, right) => right.fieldOffset - left.fieldOffset)[0] || null;
}

function skinCandidatesForBlock(block) {
  const byStart = new Map();
  for (const meshField of block.fields) {
    if (meshField.resourceCategory !== "mesh" || !isCharacterArtMesh(meshField.targetRelativePath)) continue;
    const labelField = labelFieldBeforeMesh(block, meshField.fieldOffset);
    if (!labelField) continue;
    const key = labelField.fieldOffset;
    if (!byStart.has(key)) {
      byStart.set(key, {
        recordStartField: labelField.fieldOffset,
        labelSourceOffset: labelField.sourceOffset,
        modelLabel: labelField.value,
        meshFieldOffset: meshField.fieldOffset,
        meshSourceOffset: meshField.sourceOffset,
        meshPath: meshField.targetRelativePath,
      });
    }
  }
  return [...byStart.values()].sort((left, right) => left.recordStartField - right.recordStartField);
}

function nearestLabelBefore(fields, resourceField) {
  return fields
    .filter((field) => {
      if (field.fieldOffset >= resourceField.fieldOffset || field.fieldOffset < resourceField.fieldOffset - 32) return false;
      if (!field.value || field.semantic === "resource" || isExcludedRecordLabel(field.value)) return false;
      return true;
    })
    .sort((left, right) => right.fieldOffset - left.fieldOffset)[0]?.value || "";
}

function summarizeSkinRecord(block, candidate, recordEndField) {
  const directEnd = Math.min(recordEndField, candidate.recordStartField + 128);
  const directFields = fieldsInRange(block, candidate.recordStartField, directEnd);
  const segmentFields = fieldsInRange(block, candidate.recordStartField, recordEndField);
  const resourceFields = segmentFields.filter((field) => field.semantic === "resource");
  const directResourceFields = directFields.filter((field) => field.semantic === "resource");
  const actionRows = resourceFields
    .filter((field) => field.resourceCategory === "animation")
    .map((field) => ({
      actionLabel: nearestLabelBefore(segmentFields, field),
      animationPath: field.targetRelativePath,
      fieldOffset: field.fieldOffset,
      sourceOffset: field.sourceOffset,
    }));

  const objectRefs = directFields
    .filter((field) => !field.value && field.sourceOffset !== 0)
    .map((field) => `${field.fieldOffset}->${field.sourceOffset}`);

  return {
    source: "cff0-ptch",
    relativePath: block.relativePath,
    hash: block.hash,
    blockIndex: block.blockIndex,
    definitionFormatByte: block.definitionFormatByte,
    definitionVersionByte: block.definitionVersionByte,
    recordStartField: candidate.recordStartField,
    recordEndField,
    modelLabel: candidate.modelLabel,
    meshFieldOffset: candidate.meshFieldOffset,
    meshSourceOffset: candidate.meshSourceOffset,
    meshPath: candidate.meshPath,
    ownSkeletons: pipe(directResourceFields.filter((field) => field.resourceCategory === "skeleton").map((field) => field.targetRelativePath)),
    directObjectRefs: pipe(objectRefs),
    animationCount: unique(actionRows.map((row) => row.animationPath)).length,
    animations: pipe(actionRows.map((row) => row.animationPath)),
    animationActions: pipe(actionRows.map((row) => row.actionLabel).filter(Boolean)),
    effectCount: unique(segmentFields.map((field) => field.value).filter((value) => /^Effect_/.test(value))).length,
    effects: pipe(segmentFields.map((field) => field.value).filter((value) => /^Effect_/.test(value))),
    audioCount: unique(resourceFields.filter((field) => field.resourceCategory === "audio").map((field) => field.targetRelativePath)).length,
    audios: pipe(resourceFields.filter((field) => field.resourceCategory === "audio").map((field) => field.targetRelativePath)),
  };
}

function buildRuntimeSkinRecordsForBlock(block) {
  const candidates = skinCandidatesForBlock(block);
  return candidates.map((candidate, index) => {
    const next = candidates[index + 1];
    const recordEndField = next?.recordStartField ?? block.payloadSize;
    return summarizeSkinRecord(block, candidate, recordEndField);
  });
}

function buildRuntimeFieldRecordsForBlock(block) {
  const candidates = skinCandidatesForBlock(block);
  const rows = [];

  candidates.forEach((candidate, index) => {
    const next = candidates[index + 1];
    const recordEndField = next?.recordStartField ?? block.payloadSize;
    for (const field of fieldsInRange(block, candidate.recordStartField, recordEndField)) {
      rows.push({
        source: "cff0-ptch",
        relativePath: block.relativePath,
        hash: block.hash,
        blockIndex: block.blockIndex,
        definitionFormatByte: block.definitionFormatByte,
        definitionVersionByte: block.definitionVersionByte,
        modelLabel: candidate.modelLabel,
        recordStartField: candidate.recordStartField,
        recordEndField,
        fieldOffset: field.fieldOffset,
        localFieldOffset: field.fieldOffset - candidate.recordStartField,
        sourceOffset: field.sourceOffset,
        referenceKind: referenceKind(field),
        role: fieldRole(candidate, field),
        value: field.value,
        semantic: field.semantic,
        resourceCategory: field.resourceCategory,
        targetRelativePath: field.targetRelativePath,
      });
    }
  });

  return rows;
}

function objectSummaryForTarget(block, targetOffset, windowBytes = 160) {
  const targetFields = fieldsInRange(block, targetOffset, Math.min(block.payloadSize, targetOffset + windowBytes));
  const resources = targetFields.filter((field) => field.semantic === "resource");
  const labels = targetFields
    .filter((field) => field.value && field.semantic !== "resource")
    .map((field) => `${field.fieldOffset - targetOffset}:${field.value}`);

  return {
    targetFieldCount: targetFields.length,
    targetLabels: pipe(labels),
    targetResources: pipe(resources.map((field) => field.targetRelativePath)),
    targetAnimations: pipe(resources.filter((field) => field.resourceCategory === "animation").map((field) => field.targetRelativePath)),
    targetEffects: pipe(targetFields.map((field) => field.value).filter((value) => /^Effect_/.test(value))),
    targetAudios: pipe(resources.filter((field) => field.resourceCategory === "audio").map((field) => field.targetRelativePath)),
    targetBones: pipe(targetFields.map((field) => field.value).filter(isBoneName)),
    targetBindTokens: pipe(targetFields.map((field) => field.value).filter(isBindTokenValue)),
    targetObjectRefs: pipe(
      targetFields
        .filter((field) => referenceKind(field) === "object")
        .map((field) => `${field.fieldOffset - targetOffset}->${field.sourceOffset}`),
    ),
  };
}

function buildRuntimeObjectReferenceRecordsForBlock(block) {
  return buildRuntimeFieldRecordsForBlock(block)
    .filter((field) => field.referenceKind === "object")
    .map((field) => ({
      source: "cff0-ptch",
      relativePath: field.relativePath,
      hash: field.hash,
      blockIndex: field.blockIndex,
      definitionFormatByte: field.definitionFormatByte,
      definitionVersionByte: field.definitionVersionByte,
      ownerType: "skin",
      ownerLabel: field.modelLabel,
      ownerRecordStartField: field.recordStartField,
      ownerFieldOffset: field.fieldOffset,
      ownerLocalFieldOffset: field.localFieldOffset,
      targetObjectOffset: field.sourceOffset,
      ...objectSummaryForTarget(block, field.sourceOffset),
    }));
}

function finiteFloat(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 4 > buffer.length) return null;
  const value = buffer.readFloatLE(offset);
  return Number.isFinite(value) ? value : null;
}

function transformRecordForLayout(buffer, offset, layout) {
  if (!Buffer.isBuffer(buffer) || offset + layout.bytes > buffer.length) return null;
  const position = [
    finiteFloat(buffer, offset + layout.positionOffset),
    finiteFloat(buffer, offset + layout.positionOffset + 4),
    finiteFloat(buffer, offset + layout.positionOffset + 8),
  ];
  const rotation = [
    finiteFloat(buffer, offset + layout.rotationOffset),
    finiteFloat(buffer, offset + layout.rotationOffset + 4),
    finiteFloat(buffer, offset + layout.rotationOffset + 8),
  ];
  const scale = [
    finiteFloat(buffer, offset + layout.scaleOffset),
    finiteFloat(buffer, offset + layout.scaleOffset + 4),
    finiteFloat(buffer, offset + layout.scaleOffset + 8),
  ];
  if ([...position, ...rotation, ...scale].some((value) => value == null)) return null;
  if (position.some((value) => Math.abs(value) > 10000)) return null;
  if (rotation.some((value) => Math.abs(value) > 10000)) return null;
  if (scale.some((value) => Math.abs(value) < 0.0001 || Math.abs(value) > 1000)) return null;
  return {
    positionX: position[0],
    positionY: position[1],
    positionZ: position[2],
    rotationX: rotation[0],
    rotationY: rotation[1],
    rotationZ: rotation[2],
    scaleX: scale[0],
    scaleY: scale[1],
    scaleZ: scale[2],
    transformEvidence: layout.evidence,
  };
}

function transformRecordAt(buffer, offset) {
  const layouts = [
    {
      bytes: 44,
      positionOffset: 8,
      rotationOffset: 20,
      scaleOffset: 32,
      evidence: "ptch-object-transform-48",
    },
    {
      bytes: 40,
      positionOffset: 4,
      rotationOffset: 16,
      scaleOffset: 28,
      evidence: "ptch-object-transform-40",
    },
  ];
  for (const layout of layouts) {
    const transform = transformRecordForLayout(buffer, offset, layout);
    if (transform) return transform;
  }
  return null;
}

function isRuntimeLocatorField(field) {
  if (!field?.value || !["label", "bind-token"].includes(field.role) || field.semantic !== "label") return false;
  if (isExcludedRecordLabel(field.value)) return false;
  if (/^(?:Idle|Move|Run|Walk|Death|Die|Recall|Withdraw)(?:$|_)/i.test(field.value)) return false;
  if (isSkinLabel(field.value)) return false;
  if (isBoneName(field.value) || /_bnd$/i.test(field.value)) return false;
  if (/^(?:Sound_|Effect_|Buff_|Ability__|HERO_|CHAR_INFO_|LABEL_|RECOMMENDED_)/.test(field.value)) return false;
  return true;
}

function buildRuntimeLocatorRecordsForBlock(block) {
  const fieldRecords = buildRuntimeFieldRecordsForBlock(block);
  const referencedByTarget = new Map();
  for (const field of fieldRecords) {
    if (field.referenceKind !== "object") continue;
    const targetOffset = Number(field.sourceOffset);
    if (!Number.isFinite(targetOffset) || targetOffset <= 0) continue;
    const offsets = referencedByTarget.get(targetOffset) || [];
    offsets.push(field.fieldOffset);
    referencedByTarget.set(targetOffset, offsets);
  }

  const rows = [];
  for (const field of fieldRecords) {
    if (!isRuntimeLocatorField(field)) continue;
    const referencedBy = referencedByTarget.get(Number(field.fieldOffset)) || [];
    if (!referencedBy.length) continue;
    const transform = transformRecordAt(block.decodedPayload, Number(field.fieldOffset));
    if (!transform) continue;
    rows.push({
      source: "cff0-ptch",
      relativePath: field.relativePath,
      hash: field.hash,
      blockIndex: field.blockIndex,
      definitionFormatByte: field.definitionFormatByte,
      definitionVersionByte: field.definitionVersionByte,
      modelLabel: field.modelLabel,
      recordStartField: field.recordStartField,
      fieldOffset: field.fieldOffset,
      localFieldOffset: field.localFieldOffset,
      sourceOffset: field.sourceOffset,
      label: field.value,
      referencedByFieldOffsets: referencedBy.join("|"),
      ...transform,
    });
  }
  return rows;
}

function schemaKeyForField(field) {
  return [
    field.definitionFormatByte,
    field.definitionVersionByte,
    field.localFieldOffset,
  ].join("\t");
}

function buildRuntimeSchemaOffsetRecords(fieldRecords) {
  const groups = new Map();

  for (const field of fieldRecords) {
    const key = schemaKeyForField(field);
    if (!groups.has(key)) {
      groups.set(key, {
        definitionFormatByte: field.definitionFormatByte,
        definitionVersionByte: field.definitionVersionByte,
        localFieldOffset: field.localFieldOffset,
        fieldCount: 0,
        owners: new Set(),
        roles: new Map(),
        referenceKinds: new Map(),
        semantics: new Map(),
        resourceCategories: new Map(),
        sampleValues: [],
        sampleTargets: [],
        sampleOwners: [],
      });
    }

    const group = groups.get(key);
    group.fieldCount += 1;
    group.owners.add(`${field.relativePath}\t${field.blockIndex}\t${field.modelLabel}\t${field.recordStartField}`);
    increment(group.roles, field.role);
    increment(group.referenceKinds, field.referenceKind);
    increment(group.semantics, field.semantic);
    increment(group.resourceCategories, field.resourceCategory);
    pushSample(group.sampleValues, field.value);
    pushSample(group.sampleTargets, field.targetRelativePath);
    pushSample(group.sampleOwners, `${field.relativePath}:${field.modelLabel}`, 6);
  }

  return [...groups.values()]
    .map((group) => ({
      definitionFormatByte: group.definitionFormatByte,
      definitionVersionByte: group.definitionVersionByte,
      localFieldOffset: group.localFieldOffset,
      fieldCount: group.fieldCount,
      ownerCount: group.owners.size,
      roles: countSummary(group.roles),
      referenceKinds: countSummary(group.referenceKinds),
      semantics: countSummary(group.semantics),
      resourceCategories: countSummary(group.resourceCategories),
      sampleValues: group.sampleValues.join("|"),
      sampleTargets: group.sampleTargets.join("|"),
      sampleOwners: group.sampleOwners.join("|"),
    }))
    .sort((left, right) => {
      const formatOrder = Number(left.definitionFormatByte) - Number(right.definitionFormatByte);
      if (formatOrder) return formatOrder;
      const versionOrder = Number(left.definitionVersionByte) - Number(right.definitionVersionByte);
      if (versionOrder) return versionOrder;
      return Number(left.localFieldOffset) - Number(right.localFieldOffset);
    });
}

function buildRuntimeSlotRecordsForBlock(block) {
  const rows = [];
  for (let index = 0; index < block.fields.length; index += 1) {
    const field = block.fields[index];
    if (!isBoneName(field.value)) continue;
    const bindField = block.fields
      .slice(index + 1, index + 8)
      .find((candidate) => candidate.fieldOffset - field.fieldOffset <= 72 && isBindTokenValue(candidate.value));
    if (!bindField) continue;
    rows.push({
      source: "cff0-ptch",
      relativePath: block.relativePath,
      hash: block.hash,
      blockIndex: block.blockIndex,
      definitionFormatByte: block.definitionFormatByte,
      definitionVersionByte: block.definitionVersionByte,
      boneFieldOffset: field.fieldOffset,
      boneSourceOffset: field.sourceOffset,
      boneName: field.value,
      bindFieldOffset: bindField.fieldOffset,
      bindSourceOffset: bindField.sourceOffset,
      bindToken: bindField.value,
    });
  }
  return rows;
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
    const buffer = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patches.push({ blockIndex, ...parsePatchTable(buffer) });
  }
  const patchByBlock = new Map(patches.map((patch) => [patch.blockIndex, patch]));
  return instances
    .map((instance) => {
      const patchTable = patchByBlock.get(instance.blockIndex);
      if (!patchTable) return null;
      return patchedBlockFrom({
        relativePath: entry.relativePath,
        hash: entry.hash,
        instance,
        patchTable,
      });
    })
    .filter(Boolean);
}

function buildRuntimeRecords(definitions) {
  const skinRecords = [];
  const slotRecords = [];
  const skinFieldRecords = [];
  const objectReferenceRecords = [];
  const locatorRecords = [];
  for (const entry of definitions) {
    if (!entry.relativePath?.startsWith("Characters/")) continue;
    for (const block of pairedInstancePatchBlocks(entry)) {
      skinRecords.push(...buildRuntimeSkinRecordsForBlock(block));
      slotRecords.push(...buildRuntimeSlotRecordsForBlock(block));
      skinFieldRecords.push(...buildRuntimeFieldRecordsForBlock(block));
      objectReferenceRecords.push(...buildRuntimeObjectReferenceRecordsForBlock(block));
      locatorRecords.push(...buildRuntimeLocatorRecordsForBlock(block));
    }
  }
  const schemaOffsetRecords = buildRuntimeSchemaOffsetRecords(skinFieldRecords);
  return {
    generatedAt: new Date().toISOString(),
    source: "cff0-ptch",
    summary: {
      definitions: definitions.filter((entry) => entry.relativePath?.startsWith("Characters/")).length,
      skinRecords: skinRecords.length,
      slotRecords: slotRecords.length,
      skinFieldRecords: skinFieldRecords.length,
      objectReferenceRecords: objectReferenceRecords.length,
      locatorRecords: locatorRecords.length,
      schemaOffsetRecords: schemaOffsetRecords.length,
      skinRecordsWithOwnSkeletons: skinRecords.filter((record) => record.ownSkeletons).length,
      skinRecordsWithAnimations: skinRecords.filter((record) => record.animationCount > 0).length,
    },
    skinRecords,
    slotRecords,
    skinFieldRecords,
    objectReferenceRecords,
    locatorRecords,
    schemaOffsetRecords,
  };
}

function exportRuntimeRecords({
  definitionIndex = defaultDefinitionIndex,
  jsonOut = defaultJsonOut,
  skinTsvOut = defaultSkinTsvOut,
  slotTsvOut = defaultSlotTsvOut,
  skinFieldsTsvOut = defaultSkinFieldsTsvOut,
  objectRefsTsvOut = defaultObjectRefsTsvOut,
  schemaOffsetsTsvOut = defaultSchemaOffsetsTsvOut,
  locatorTsvOut = defaultLocatorTsvOut,
} = {}) {
  const records = buildRuntimeRecords(readDefinitionIndex(definitionIndex));
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(records, null, 2)}\n`);
  writeTsv(skinTsvOut, records.skinRecords, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "recordStartField",
    "recordEndField",
    "modelLabel",
    "meshFieldOffset",
    "meshSourceOffset",
    "meshPath",
    "ownSkeletons",
    "directObjectRefs",
    "animationCount",
    "animationActions",
    "animations",
    "effectCount",
    "effects",
    "audioCount",
    "audios",
  ]);
  writeTsv(slotTsvOut, records.slotRecords, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "boneFieldOffset",
    "boneSourceOffset",
    "boneName",
    "bindFieldOffset",
    "bindSourceOffset",
    "bindToken",
  ]);
  writeTsv(skinFieldsTsvOut, records.skinFieldRecords, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "recordEndField",
    "fieldOffset",
    "localFieldOffset",
    "sourceOffset",
    "referenceKind",
    "role",
    "value",
    "semantic",
    "resourceCategory",
    "targetRelativePath",
  ]);
  writeTsv(objectRefsTsvOut, records.objectReferenceRecords, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "ownerType",
    "ownerLabel",
    "ownerRecordStartField",
    "ownerFieldOffset",
    "ownerLocalFieldOffset",
    "targetObjectOffset",
    "targetFieldCount",
    "targetLabels",
    "targetResources",
    "targetAnimations",
    "targetEffects",
    "targetAudios",
    "targetBones",
    "targetBindTokens",
    "targetObjectRefs",
  ]);
  writeTsv(locatorTsvOut, records.locatorRecords, [
    "source",
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "modelLabel",
    "recordStartField",
    "fieldOffset",
    "localFieldOffset",
    "sourceOffset",
    "label",
    "referencedByFieldOffsets",
    "positionX",
    "positionY",
    "positionZ",
    "rotationX",
    "rotationY",
    "rotationZ",
    "scaleX",
    "scaleY",
    "scaleZ",
    "transformEvidence",
  ]);
  writeTsv(schemaOffsetsTsvOut, records.schemaOffsetRecords, [
    "definitionFormatByte",
    "definitionVersionByte",
    "localFieldOffset",
    "fieldCount",
    "ownerCount",
    "roles",
    "referenceKinds",
    "semantics",
    "resourceCategories",
    "sampleValues",
    "sampleTargets",
    "sampleOwners",
  ]);
  return records.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeRecords({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    skinTsvOut: optionValue(args, "--skin-tsv-out", defaultSkinTsvOut),
    slotTsvOut: optionValue(args, "--slot-tsv-out", defaultSlotTsvOut),
    skinFieldsTsvOut: optionValue(args, "--skin-fields-tsv-out", defaultSkinFieldsTsvOut),
    objectRefsTsvOut: optionValue(args, "--object-refs-tsv-out", defaultObjectRefsTsvOut),
    schemaOffsetsTsvOut: optionValue(args, "--schema-offsets-tsv-out", defaultSchemaOffsetsTsvOut),
    locatorTsvOut: optionValue(args, "--locator-tsv-out", defaultLocatorTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeRecords,
  buildRuntimeFieldRecordsForBlock,
  buildRuntimeLocatorRecordsForBlock,
  buildRuntimeObjectReferenceRecordsForBlock,
  buildRuntimeSchemaOffsetRecords,
  buildRuntimeSkinRecordsForBlock,
  buildRuntimeSlotRecordsForBlock,
  isBindTokenValue,
  isCharacterArtMesh,
  isSkinLabel,
  patchedBlockFrom,
};
