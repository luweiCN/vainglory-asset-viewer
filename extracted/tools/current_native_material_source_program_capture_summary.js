#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { engineHashHex } = require("./engine_hash");

const defaultTargetsPath = "extracted/reports/current_native_material_source_program_capture_targets.json";
const defaultInputPath = "extracted/reports/material_source_program_capture.jsonl";
const defaultType4EntrySemanticsPath = "extracted/viewer/current-native-shaderdata-type4-entry-semantics-audit.json";
const defaultMaterialRuntimePath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultShadergraphSamplerTexDataJoinPath =
  "extracted/viewer/current-native-shadergraph-sampler-texdata-join-audit.json";
const defaultJsonOut = "extracted/reports/current_native_material_source_program_capture_summary.json";
const defaultViewerOut = "extracted/viewer/current-native-material-source-program-capture-summary.json";
const defaultTsvOut = "extracted/reports/current_native_material_source_program_capture_summary.tsv";
const defaultSampleLimit = 10;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function parseJsonField(value, fallback) {
  if (value && typeof value === "object") return value;
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonLine(line) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "{") continue;
    try {
      return JSON.parse(line.slice(index));
    } catch {
      continue;
    }
  }
  return null;
}

function readCaptureRecords(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return { captureImported: false, records: [] };
  const text = fs.readFileSync(inputPath, "utf8");
  try {
    const parsed = JSON.parse(text);
    const records = Array.isArray(parsed) ? parsed : parsed.records || parsed.items || [parsed];
    return { captureImported: true, records };
  } catch {
    return {
      captureImported: true,
      records: text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseJsonLine)
        .filter(Boolean),
    };
  }
}

function normalizeHex(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^0x([0-9a-f]+)$/i);
  if (!match) return text;
  return `0x${Number.parseInt(match[1], 16).toString(16)}`;
}

function normalizeResourceKey(value) {
  if (!value) return "";
  let text = String(value).trim().replace(/\\/g, "/").toLowerCase();
  text = text.replace(/^(\.\/|\.\.\/)+/, "");
  text = text.replace(/^hero_assets_material_textures_preview\//, "");
  const markers = ["characters/", "effects/", "items/", "maps/", "levels/", "ui/"];
  const markerIndexes = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0);
  if (markerIndexes.length) text = text.slice(Math.min(...markerIndexes));
  return text.replace(/^\/+/, "");
}

function samplerJoinRowsWithTexturePath(shadergraphSamplerTexDataJoin = {}) {
  return (shadergraphSamplerTexDataJoin.items || []).filter(
    (row) => /^sampler\d+$/.test(String(row?.sampler || "")) && row?.texturePath,
  );
}

function knownShadergraphTextureResourceKeys(materialRuntime = {}, shadergraphSamplerTexDataJoin = {}) {
  const joinKeys = new Set();
  for (const row of samplerJoinRowsWithTexturePath(shadergraphSamplerTexDataJoin)) {
    const key = normalizeResourceKey(row.texturePath);
    if (key) joinKeys.add(key);
  }
  if (joinKeys.size) return joinKeys;

  const keys = new Set();
  for (const row of materialRuntime.items || []) {
    if (row.shadergraphStatus && row.shadergraphStatus !== "ok") continue;
    const samplerTexturePaths = parseJsonField(row.samplerTexturePaths, {});
    for (const [sampler, texturePath] of Object.entries(samplerTexturePaths || {})) {
      if (!/^sampler\d+$/.test(String(sampler))) continue;
      const key = normalizeResourceKey(texturePath);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function knownShadergraphTextureResourceKeyUnits(materialRuntime = {}, shadergraphSamplerTexDataJoin = {}) {
  const joinKeyUnits = new Map();
  for (const row of samplerJoinRowsWithTexturePath(shadergraphSamplerTexDataJoin)) {
    const key = normalizeResourceKey(row.texturePath);
    if (!key) continue;
    const directUnit = finiteInteger(row.unit);
    const hexUnit = directUnit === null ? integerFromHex(row.unit) : null;
    const unit = directUnit ?? hexUnit;
    if (unit === null) continue;
    if (!joinKeyUnits.has(key)) joinKeyUnits.set(key, new Set());
    joinKeyUnits.get(key).add(unit >>> 0);
  }
  if (joinKeyUnits.size) return joinKeyUnits;

  const keyUnits = new Map();
  for (const row of materialRuntime.items || []) {
    if (row.shadergraphStatus && row.shadergraphStatus !== "ok") continue;
    const samplerTexturePaths = parseJsonField(row.samplerTexturePaths, {});
    const samplerUnits = parseJsonField(row.samplerUnits, {});
    for (const [sampler, texturePath] of Object.entries(samplerTexturePaths || {})) {
      if (!/^sampler\d+$/.test(String(sampler))) continue;
      const key = normalizeResourceKey(texturePath);
      if (!key) continue;
      const directUnit = finiteInteger(samplerUnits?.[sampler]);
      const hexUnit = directUnit === null ? integerFromHex(samplerUnits?.[sampler]) : null;
      const unit = directUnit ?? hexUnit;
      if (unit === null) continue;
      if (!keyUnits.has(key)) keyUnits.set(key, new Set());
      keyUnits.get(key).add(unit >>> 0);
    }
  }
  return keyUnits;
}

function sourceKeyHashForSamplerName(sampler) {
  return normalizeHex(`0x${engineHashHex(sampler)}`);
}

function knownShadergraphTextureResourceKeySamplerIdentities(materialRuntime = {}, shadergraphSamplerTexDataJoin = {}) {
  const joinIdentitiesByKey = new Map();
  for (const row of samplerJoinRowsWithTexturePath(shadergraphSamplerTexDataJoin)) {
    const resourceKey = normalizeResourceKey(row.texturePath);
    const sourceKeyHash = normalizeHex(row.sourceKeyHash);
    if (!resourceKey || !sourceKeyHash) continue;
    const directUnit = finiteInteger(row.unit);
    const hexUnit = directUnit === null ? integerFromHex(row.unit) : null;
    const unit = directUnit ?? hexUnit;
    if (unit === null) continue;
    const identity = {
      sampler: row.sampler,
      unit: unit >>> 0,
      sourceKeyHash,
    };
    const identities = joinIdentitiesByKey.get(resourceKey) || [];
    if (
      !identities.some(
        (existing) =>
          existing.sampler === identity.sampler &&
          existing.unit === identity.unit &&
          existing.sourceKeyHash === identity.sourceKeyHash,
      )
    ) {
      identities.push(identity);
    }
    joinIdentitiesByKey.set(resourceKey, identities);
  }
  if (joinIdentitiesByKey.size) return joinIdentitiesByKey;

  const identitiesByKey = new Map();
  for (const row of materialRuntime.items || []) {
    if (row.shadergraphStatus && row.shadergraphStatus !== "ok") continue;
    const samplerTexturePaths = parseJsonField(row.samplerTexturePaths, {});
    const samplerUnits = parseJsonField(row.samplerUnits, {});
    for (const [sampler, texturePath] of Object.entries(samplerTexturePaths || {})) {
      if (!/^sampler\d+$/.test(String(sampler))) continue;
      const resourceKey = normalizeResourceKey(texturePath);
      if (!resourceKey) continue;
      const directUnit = finiteInteger(samplerUnits?.[sampler]);
      const hexUnit = directUnit === null ? integerFromHex(samplerUnits?.[sampler]) : null;
      const unit = directUnit ?? hexUnit;
      if (unit === null) continue;
      const identity = {
        sampler,
        unit: unit >>> 0,
        sourceKeyHash: sourceKeyHashForSamplerName(sampler),
      };
      const identities = identitiesByKey.get(resourceKey) || [];
      if (
        !identities.some(
          (existing) =>
            existing.sampler === identity.sampler &&
            existing.unit === identity.unit &&
            existing.sourceKeyHash === identity.sourceKeyHash,
        )
      ) {
        identities.push(identity);
      }
      identitiesByKey.set(resourceKey, identities);
    }
  }
  return identitiesByKey;
}

function hexValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return `0x${(value >>> 0).toString(16)}`;
  return normalizeHex(value);
}

function hexWord(value) {
  if (value && typeof value === "object") return hexWord(value.hex ?? value.u32);
  if (typeof value === "number" && Number.isFinite(value)) return `0x${(value >>> 0).toString(16)}`;
  const normalized = normalizeHex(value);
  if (!normalized) return "";
  const match = normalized.match(/^0x([0-9a-f]+)$/i);
  if (!match) return normalized;
  return `0x${(Number.parseInt(match[1], 16) >>> 0).toString(16)}`;
}

function pointerWords(value) {
  const normalized = normalizeHex(value);
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
  const big = BigInt(normalized);
  return {
    low: `0x${Number(big & 0xffffffffn).toString(16)}`,
    high: `0x${Number((big >> 32n) & 0xffffffffn).toString(16)}`,
  };
}

function type4EntryValueMatchesObject(entry, textureObject) {
  if (Number(entry?.typeBits) !== 4) return false;
  const words = pointerWords(textureObject);
  if (!words) return false;
  const valueWords = Array.isArray(entry.valueWords) ? entry.valueWords : [];
  if (!valueWords.length) return false;
  if (hexWord(valueWords[0]) !== words.low) return false;
  return valueWords.length < 2 || hexWord(valueWords[1]) === words.high;
}

function integerFromHex(value) {
  const normalized = normalizeHex(value);
  if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
  const parsed = Number.parseInt(normalized.slice(2), 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function samplerUnitForPatch(texturePatch) {
  const direct = finiteInteger(texturePatch?.samplerUnitU32);
  if (direct !== null) return direct;
  const hexValue = integerFromHex(texturePatch?.samplerUnit);
  return hexValue === null ? null : hexValue >>> 0;
}

function sourceIndexForEntry(entry) {
  const direct = finiteInteger(entry?.sourceIndex);
  if (direct !== null) return direct;
  const header = finiteInteger(entry?.header) ?? integerFromHex(entry?.headerHex);
  return header === null ? null : header & 0xfff;
}

function type4EntrySamplerUnitMatchesPatch(entry, texturePatch) {
  if (Number(entry?.typeBits) !== 4) return false;
  const samplerUnit = samplerUnitForPatch(texturePatch);
  const sourceIndex = sourceIndexForEntry(entry);
  return samplerUnit !== null && sourceIndex !== null && sourceIndex === samplerUnit;
}

function sourceKeyHashForEntry(entry) {
  return normalizeHex(entry?.sourceKeyHashHex || entry?.sourceKeyHash);
}

function type4EntrySamplerIdentityMatchesPatch(entry, texturePatch, identities) {
  if (!type4EntrySamplerUnitMatchesPatch(entry, texturePatch)) return false;
  const sourceIndex = sourceIndexForEntry(entry);
  const sourceKeyHash = sourceKeyHashForEntry(entry);
  if (sourceIndex === null || !sourceKeyHash) return false;
  return (identities || []).some((identity) => identity.unit === sourceIndex && identity.sourceKeyHash === sourceKeyHash);
}

function patchValueMatchesObject(texturePatch) {
  const textureObject = normalizeHex(texturePatch?.textureObject);
  if (!textureObject) return false;
  const entries = entriesForDecodedTable(texturePatch.tableAfterDecoded);
  return entries.some((entry) => type4EntryValueMatchesObject(entry, textureObject));
}

function patchSamplerUnitMatchesEntry(texturePatch) {
  return entriesForDecodedTable(texturePatch?.tableAfterDecoded).some((entry) =>
    type4EntrySamplerUnitMatchesPatch(entry, texturePatch),
  );
}

function patchValueMatchesObjectAndSamplerUnit(texturePatch) {
  const textureObject = normalizeHex(texturePatch?.textureObject);
  if (!textureObject) return false;
  return entriesForDecodedTable(texturePatch?.tableAfterDecoded).some(
    (entry) => type4EntrySamplerUnitMatchesPatch(entry, texturePatch) && type4EntryValueMatchesObject(entry, textureObject),
  );
}

function patchSamplerIdentityMatchesResource(texturePatch, identities) {
  return entriesForDecodedTable(texturePatch?.tableAfterDecoded).some((entry) =>
    type4EntrySamplerIdentityMatchesPatch(entry, texturePatch, identities),
  );
}

function patchValueMatchesObjectAndSamplerIdentity(texturePatch, identities) {
  const textureObject = normalizeHex(texturePatch?.textureObject);
  if (!textureObject) return false;
  return entriesForDecodedTable(texturePatch?.tableAfterDecoded).some(
    (entry) =>
      type4EntrySamplerIdentityMatchesPatch(entry, texturePatch, identities) &&
      type4EntryValueMatchesObject(entry, textureObject),
  );
}

function eventIdForRecord(record) {
  const value = Number(record?.eventId);
  return Number.isFinite(value) ? value : null;
}

function threadKeyForRecord(record) {
  if (record?.threadId === null || record?.threadId === undefined) return "";
  return String(record.threadId);
}

function eventIdOrderingStats(records) {
  const seen = new Set();
  let duplicateRows = 0;
  let nonMonotonicRows = 0;
  let previousEventId = null;
  for (const record of records) {
    const eventId = eventIdForRecord(record);
    if (eventId === null) continue;
    if (seen.has(eventId)) duplicateRows += 1;
    seen.add(eventId);
    if (previousEventId !== null && eventId <= previousEventId) nonMonotonicRows += 1;
    previousEventId = eventId;
  }
  return { duplicateRows, nonMonotonicRows };
}

function returnedTextureObjectEvents(records) {
  const events = [];
  for (const record of records) {
    const threadKey = threadKeyForRecord(record);
    const eventId = eventIdForRecord(record);
    if (record.textureLookup?.returnedTextureObject) {
      events.push({
        textureObject: normalizeHex(record.textureLookup.returnedTextureObject),
        threadKey,
        eventId,
      });
    }
    if (record.inlineTextureBuilder?.returnedTextureObject) {
      events.push({
        textureObject: normalizeHex(record.inlineTextureBuilder.returnedTextureObject),
        threadKey,
        eventId,
      });
    }
  }
  return events.filter((event) => event.textureObject);
}

function textureLookupResourceKeyEvents(
  records,
  knownTextureResourceKeys,
  knownTextureResourceKeyUnits = new Map(),
  knownTextureResourceKeySamplerIdentities = new Map(),
) {
  const events = [];
  for (const record of records) {
    const resourceKey = normalizeResourceKey(record.textureLookup?.resourceKeyCString);
    if (!resourceKey) continue;
    const knownSamplerIdentities = knownTextureResourceKeySamplerIdentities.get(resourceKey) || [];
    events.push({
      resourceKey,
      knownShadergraphResourceKey: knownTextureResourceKeys.has(resourceKey),
      knownSamplerUnits: [...(knownTextureResourceKeyUnits.get(resourceKey) || [])],
      knownSamplerIdentities,
      knownSamplerSourceKeyHashes: [...new Set(knownSamplerIdentities.map((identity) => identity.sourceKeyHash))],
      textureRuntime: normalizeHex(record.textureLookup?.textureRuntime),
      textureObject: normalizeHex(record.textureLookup?.returnedTextureObject),
      threadKey: threadKeyForRecord(record),
      eventId: eventIdForRecord(record),
    });
  }
  return events;
}

function textureRegistrationResourceKeyEvents(records, knownTextureResourceKeys) {
  const events = [];
  for (const record of records) {
    const resourceKey = normalizeResourceKey(record.textureRegistration?.resourceKeyCString);
    if (!resourceKey) continue;
    events.push({
      resourceKey,
      knownShadergraphResourceKey: knownTextureResourceKeys.has(resourceKey),
      textureRuntime: normalizeHex(record.textureRegistration?.textureRuntime),
      threadKey: threadKeyForRecord(record),
      eventId: eventIdForRecord(record),
    });
  }
  return events;
}

function hasPriorSameThreadKnownResourceRegistration(lookupEvent, registrationEvents) {
  if (
    !lookupEvent?.knownShadergraphResourceKey ||
    !lookupEvent.resourceKey ||
    !lookupEvent.threadKey ||
    lookupEvent.eventId === null
  ) {
    return false;
  }
  return registrationEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.resourceKey === lookupEvent.resourceKey &&
      event.threadKey === lookupEvent.threadKey &&
      event.eventId !== null &&
      event.eventId < lookupEvent.eventId,
  );
}

function hasPriorSameRuntimeKnownResourceRegistration(lookupEvent, registrationEvents) {
  if (
    !lookupEvent?.knownShadergraphResourceKey ||
    !lookupEvent.resourceKey ||
    !lookupEvent.textureRuntime ||
    !lookupEvent.threadKey ||
    lookupEvent.eventId === null
  ) {
    return false;
  }
  return registrationEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.resourceKey === lookupEvent.resourceKey &&
      event.textureRuntime === lookupEvent.textureRuntime &&
      event.threadKey === lookupEvent.threadKey &&
      event.eventId !== null &&
      event.eventId < lookupEvent.eventId,
  );
}

function hasOrderedSameThreadKnownResourceObject(record, knownResourceEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  if (!textureObject || !threadKey || eventId === null) return false;
  return knownResourceEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.textureObject === textureObject &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId,
  );
}

function hasOrderedSameThreadKnownResourceSamplerUnit(record, knownResourceEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  const samplerUnit = samplerUnitForPatch(record.texturePatch);
  if (!textureObject || !threadKey || eventId === null || samplerUnit === null) return false;
  return knownResourceEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.textureObject === textureObject &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId &&
      event.knownSamplerUnits.includes(samplerUnit),
  );
}

function hasOrderedSameThreadKnownResourceSamplerIdentity(record, knownResourceEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  if (!textureObject || !threadKey || eventId === null) return false;
  return knownResourceEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.textureObject === textureObject &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId &&
      patchSamplerIdentityMatchesResource(record.texturePatch, event.knownSamplerIdentities),
  );
}

function hasOrderedSameThreadKnownResourceSamplerIdentityAndValue(record, knownResourceEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  if (!textureObject || !threadKey || eventId === null) return false;
  return knownResourceEvents.some(
    (event) =>
      event.knownShadergraphResourceKey &&
      event.textureObject === textureObject &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId &&
      patchValueMatchesObjectAndSamplerIdentity(record.texturePatch, event.knownSamplerIdentities),
  );
}

function hasSameThreadReturnedObject(record, returnedEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  if (!textureObject || !threadKey) return false;
  return returnedEvents.some((event) => event.textureObject === textureObject && event.threadKey === threadKey);
}

function hasOrderedSameThreadReturnedObject(record, returnedEvents) {
  const textureObject = normalizeHex(record.texturePatch?.textureObject);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  if (!textureObject || !threadKey || eventId === null) return false;
  return returnedEvents.some(
    (event) =>
      event.textureObject === textureObject &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId,
  );
}

function decodedTableHasType4Entry(table) {
  return entriesForDecodedTable(table).some((entry) => Number(entry.typeBits) === 4);
}

function mountTableForRecord(record) {
  return normalizeHex(record.mount?.sourceProgramTable || record.mount?.tableDecoded?.table);
}

function patchTableForRecord(record) {
  return normalizeHex(record.texturePatch?.sourceProgramTable || record.texturePatch?.tableAfterDecoded?.table);
}

function mountedType4TableEvents(records) {
  const events = [];
  for (const record of records) {
    if (!record.mount || !decodedTableHasType4Entry(record.mount.tableDecoded)) continue;
    const table = mountTableForRecord(record);
    if (!table) continue;
    events.push({
      table,
      threadKey: threadKeyForRecord(record),
      eventId: eventIdForRecord(record),
    });
  }
  return events;
}

function hasMountedType4Table(record, mountedEvents) {
  const table = patchTableForRecord(record);
  if (!table) return false;
  return mountedEvents.some((event) => event.table === table);
}

function hasOrderedSameThreadMountedType4Table(record, mountedEvents) {
  const table = patchTableForRecord(record);
  const threadKey = threadKeyForRecord(record);
  const eventId = eventIdForRecord(record);
  if (!table || !threadKey || eventId === null) return false;
  return mountedEvents.some(
    (event) =>
      event.table === table &&
      event.threadKey === threadKey &&
      event.eventId !== null &&
      event.eventId < eventId,
  );
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

function pushSample(list, value, limit) {
  const normalized = typeof value === "number" ? hexValue(value) : normalizeHex(value);
  if (!normalized || list.includes(normalized) || list.length >= limit) return;
  list.push(normalized);
}

function targetRows(targetManifest = {}) {
  const rows = targetManifest.hookTargets || (targetManifest.items || []).filter((row) => row.source === "hook-target");
  return rows.map((target) => ({
    name: target.name || "",
    addressHex: normalizeHex(target.addressHex || target.offsetHex),
    captureKind: target.captureKind || "",
    reason: target.reason || "",
  }));
}

function buildInitialTargetState(targets) {
  const byName = new Map();
  for (const target of targets) {
    byName.set(target.name, {
      ...target,
      eventRows: 0,
      resourceListSnapshotEvents: 0,
      resourceListTopRows: 0,
      nestedIdRows: 0,
      resourceListTruncatedRows: 0,
      nestedResourceIdTruncatedRows: 0,
      entryBuilderEvents: 0,
      mountEvents: 0,
      cloneFinalizeEvents: 0,
      upstreamSelectionEvents: 0,
      sampleResourceListHeads: [],
      sampleResourceIds: [],
      samplePayloadStrings: [],
      sampleEntryTables: [],
      sampleSourceProgramTables: [],
      sourceProgramTableDecodeEvents: 0,
      sourceProgramTableDecodedEntryRows: 0,
      sourceProgramTableDecodedValueWordRows: 0,
      sourceProgramTableTruncatedRows: 0,
      sourceProgramTableMissingEntryRows: 0,
      sourceProgramType4EntryRows: 0,
      sourceProgramDirectValueEntryRows: 0,
      textureRegistrationEvents: 0,
      textureRuntimeLookupEvents: 0,
      textureRuntimeLookupReturnRows: 0,
      inlineTextureObjectBuilderEvents: 0,
      inlineTextureObjectReturnRows: 0,
      type4TexturePatchEvents: 0,
      type4TexturePatchAfterDecodeEvents: 0,
      type4TexturePatchDecodedEntryRows: 0,
      type4TexturePatchDecodedType4EntryRows: 0,
      sampleSourceKeyHashes: [],
      sampleType4SourceKeyHashes: [],
      sampleDecodedEntryHeaders: [],
      sampleDecodedValueWords: [],
      sampleType4ValueWords: [],
      sampleTextureResourceKeys: [],
      sampleTextureObjects: [],
      samplePatchSamplerUnits: [],
      samplePatchType4ValueWords: [],
    });
  }
  return byName;
}

function resourceListsForRecord(record) {
  const lists = [];
  for (const snapshot of [
    record.resourceList,
    record.directCaller?.resourceList,
    record.selectorRoute?.resourceList,
  ]) {
    const normalized = normalizeResourceListSnapshot(snapshot);
    if (normalized) lists.push(normalized);
  }
  return lists;
}

function normalizeResourceListSnapshot(snapshot) {
  if (Array.isArray(snapshot)) {
    return { rows: snapshot, resourceListCaptureTruncated: false };
  }
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    rows: Array.isArray(snapshot.rows) ? snapshot.rows : [],
    resourceListCaptureTruncated: Boolean(snapshot.resourceListCaptureTruncated),
  };
}

function normalizeNestedIdSnapshot(snapshot) {
  if (Array.isArray(snapshot)) {
    return { rows: snapshot, nestedCaptureTruncated: false };
  }
  if (!snapshot || typeof snapshot !== "object") return { rows: [], nestedCaptureTruncated: false };
  return {
    rows: Array.isArray(snapshot.rows) ? snapshot.rows : [],
    nestedCaptureTruncated: Boolean(snapshot.nestedCaptureTruncated),
  };
}

function summarizeResourceLists(target, record, sampleLimit) {
  const lists = resourceListsForRecord(record);
  if (!lists.length) return;
  target.resourceListSnapshotEvents += 1;
  for (const listSnapshot of lists) {
    if (listSnapshot.resourceListCaptureTruncated) target.resourceListTruncatedRows += 1;
    target.resourceListTopRows += listSnapshot.rows.length;
    for (const topRow of listSnapshot.rows) {
      pushSample(target.samplePayloadStrings, topRow.payloadCString, sampleLimit);
      const nestedIds = normalizeNestedIdSnapshot(topRow.nestedIds);
      if (nestedIds.nestedCaptureTruncated) target.nestedResourceIdTruncatedRows += 1;
      target.nestedIdRows += nestedIds.rows.length;
      for (const nested of nestedIds.rows) pushSample(target.sampleResourceIds, nested.idU32, sampleLimit);
    }
  }
}

function decodedTablesForRecord(record) {
  return [
    record.entryArgs?.tableDecoded,
    record.mount?.tableDecoded,
    record.clone?.tempTableDecoded,
  ].filter(Boolean);
}

function countTableTruncation(target, table) {
  if (!table?.entryCaptureTruncated) return;
  target.sourceProgramTableTruncatedRows += 1;
  target.sourceProgramTableMissingEntryRows += Math.max(0, Number(table.missingEntryRows) || 0);
}

function summarizeDecodedSourceProgramTables(target, record, sampleLimit) {
  const tables = decodedTablesForRecord(record);
  if (!tables.length) return;
  for (const table of tables) {
    const entries = Array.isArray(table.entries) ? table.entries : [];
    countTableTruncation(target, table);
    target.sourceProgramTableDecodeEvents += 1;
    target.sourceProgramTableDecodedEntryRows += entries.length;
    for (const entry of entries) {
      pushSample(target.sampleSourceKeyHashes, entry.sourceKeyHashHex || entry.sourceKeyHash, sampleLimit);
      pushSample(target.sampleDecodedEntryHeaders, entry.headerHex || entry.header, sampleLimit);
      const valueWords = Array.isArray(entry.valueWords) ? entry.valueWords : [];
      target.sourceProgramTableDecodedValueWordRows += valueWords.length;
      for (const word of valueWords) pushSample(target.sampleDecodedValueWords, word.hex || word.u32, sampleLimit);
      if (Number(entry.typeBits) === 4) {
        target.sourceProgramType4EntryRows += 1;
        pushSample(target.sampleType4SourceKeyHashes, entry.sourceKeyHashHex || entry.sourceKeyHash, sampleLimit);
        for (const word of valueWords) pushSample(target.sampleType4ValueWords, word.hex || word.u32, sampleLimit);
      }
      if (entry.directValueFlag === true) target.sourceProgramDirectValueEntryRows += 1;
    }
  }
}

function entriesForDecodedTable(table) {
  return Array.isArray(table?.entries) ? table.entries : [];
}

function summarizeTextureRuntime(target, record, sampleLimit) {
  if (record.textureRegistration) {
    target.textureRegistrationEvents += 1;
    pushSample(target.sampleTextureResourceKeys, record.textureRegistration.resourceKeyCString, sampleLimit);
  }
  if (record.textureLookup) {
    target.textureRuntimeLookupEvents += 1;
    pushSample(target.sampleTextureResourceKeys, record.textureLookup.resourceKeyCString, sampleLimit);
    if (record.textureLookup.returnedTextureObject) {
      target.textureRuntimeLookupReturnRows += 1;
      pushSample(target.sampleTextureObjects, record.textureLookup.returnedTextureObject, sampleLimit);
    }
  }
  if (record.inlineTextureBuilder) {
    target.inlineTextureObjectBuilderEvents += 1;
    if (record.inlineTextureBuilder.returnedTextureObject) {
      target.inlineTextureObjectReturnRows += 1;
      pushSample(target.sampleTextureObjects, record.inlineTextureBuilder.returnedTextureObject, sampleLimit);
    }
  }
  if (record.texturePatch) {
    target.type4TexturePatchEvents += 1;
    pushSample(target.samplePatchSamplerUnits, record.texturePatch.samplerUnitU32, sampleLimit);
    pushSample(target.sampleTextureObjects, record.texturePatch.textureObject, sampleLimit);
    const afterEntries = entriesForDecodedTable(record.texturePatch.tableAfterDecoded);
    countTableTruncation(target, record.texturePatch.tableAfterDecoded);
    if (afterEntries.length) target.type4TexturePatchAfterDecodeEvents += 1;
    target.type4TexturePatchDecodedEntryRows += afterEntries.length;
    for (const entry of afterEntries) {
      if (Number(entry.typeBits) !== 4) continue;
      target.type4TexturePatchDecodedType4EntryRows += 1;
      const valueWords = Array.isArray(entry.valueWords) ? entry.valueWords : [];
      for (const word of valueWords) pushSample(target.samplePatchType4ValueWords, word.hex || word.u32, sampleLimit);
    }
  }
}

function summarizeRecord(target, record, sampleLimit) {
  target.eventRows += 1;
  summarizeResourceLists(target, record, sampleLimit);
  summarizeDecodedSourceProgramTables(target, record, sampleLimit);
  summarizeTextureRuntime(target, record, sampleLimit);

  if (record.resourceListHead) pushSample(target.sampleResourceListHeads, record.resourceListHead, sampleLimit);
  if (record.directCaller?.resourceListHead) {
    pushSample(target.sampleResourceListHeads, record.directCaller.resourceListHead, sampleLimit);
  }
  if (record.selectorRoute?.resourceListHead) {
    pushSample(target.sampleResourceListHeads, record.selectorRoute.resourceListHead, sampleLimit);
  }

  if (record.entryArgs) {
    target.entryBuilderEvents += 1;
    pushSample(target.sampleEntryTables, record.entryArgs.table, sampleLimit);
    pushSample(target.samplePayloadStrings, record.entryArgs.payloadCString, sampleLimit);
  }
  if (record.mount) {
    target.mountEvents += 1;
    pushSample(target.sampleSourceProgramTables, record.mount.sourceProgramTable, sampleLimit);
  }
  if (record.clone) {
    target.cloneFinalizeEvents += 1;
    pushSample(target.sampleEntryTables, record.clone.tempTable, sampleLimit);
  }
  if (record.upstream) target.upstreamSelectionEvents += 1;
}

function summarizeCapture({
  targetManifest = {},
  inputPath = defaultInputPath,
  sampleLimit = defaultSampleLimit,
  type4EntrySemantics = { summary: {} },
  type4EntrySemanticsPath = "",
  materialRuntime = { items: [] },
  materialRuntimePath = "",
  shadergraphSamplerTexDataJoin = { items: [] },
  shadergraphSamplerTexDataJoinPath = "",
} = {}) {
  const targets = targetRows(targetManifest);
  const byName = buildInitialTargetState(targets);
  const targetNames = new Set(targets.map((target) => target.name));
  const { captureImported, records } = readCaptureRecords(inputPath);
  const type4Summary = type4EntrySemantics.summary || {};
  const sourceProgramType4DecoderReady =
    Boolean(type4Summary.type4EntrySemanticsRecovered) && Boolean(type4Summary.runtimeType4ValuePatchRecovered);
  const errors = [];
  const captureLimits = [];
  const targetRecords = [];
  let beginRows = 0;
  let targetEventRows = 0;
  let ignoredRows = 0;

  for (const record of records) {
    const event = record?.event || record?.type || "";
    if (event === "material-source-program-capture-start") {
      beginRows += 1;
      continue;
    }
    if (event === "material-source-program-capture-error") {
      errors.push(record);
      continue;
    }
    if (event === "material-source-program-capture-limit") {
      captureLimits.push(record);
      continue;
    }
    if (event !== "material-source-program-capture-event" || !targetNames.has(record.target)) {
      ignoredRows += 1;
      continue;
    }
    targetEventRows += 1;
    targetRecords.push(record);
    summarizeRecord(byName.get(record.target), record, sampleLimit);
  }

  const rows = [...byName.values()].map((target) => ({
    name: target.name,
    addressHex: target.addressHex,
    captureKind: target.captureKind,
    reason: target.reason,
    eventRows: target.eventRows,
    resourceListSnapshotEvents: target.resourceListSnapshotEvents,
    resourceListTopRows: target.resourceListTopRows,
    nestedIdRows: target.nestedIdRows,
    resourceListTruncatedRows: target.resourceListTruncatedRows,
    nestedResourceIdTruncatedRows: target.nestedResourceIdTruncatedRows,
    entryBuilderEvents: target.entryBuilderEvents,
    mountEvents: target.mountEvents,
    cloneFinalizeEvents: target.cloneFinalizeEvents,
    upstreamSelectionEvents: target.upstreamSelectionEvents,
    sourceProgramTableDecodeEvents: target.sourceProgramTableDecodeEvents,
    sourceProgramTableDecodedEntryRows: target.sourceProgramTableDecodedEntryRows,
    sourceProgramTableDecodedValueWordRows: target.sourceProgramTableDecodedValueWordRows,
    sourceProgramTableTruncatedRows: target.sourceProgramTableTruncatedRows,
    sourceProgramTableMissingEntryRows: target.sourceProgramTableMissingEntryRows,
    sourceProgramType4EntryRows: target.sourceProgramType4EntryRows,
    sourceProgramDirectValueEntryRows: target.sourceProgramDirectValueEntryRows,
    textureRegistrationEvents: target.textureRegistrationEvents,
    textureRuntimeLookupEvents: target.textureRuntimeLookupEvents,
    textureRuntimeLookupReturnRows: target.textureRuntimeLookupReturnRows,
    inlineTextureObjectBuilderEvents: target.inlineTextureObjectBuilderEvents,
    inlineTextureObjectReturnRows: target.inlineTextureObjectReturnRows,
    type4TexturePatchEvents: target.type4TexturePatchEvents,
    type4TexturePatchAfterDecodeEvents: target.type4TexturePatchAfterDecodeEvents,
    type4TexturePatchDecodedEntryRows: target.type4TexturePatchDecodedEntryRows,
    type4TexturePatchDecodedType4EntryRows: target.type4TexturePatchDecodedType4EntryRows,
    sampleResourceListHeads: target.sampleResourceListHeads.join("|"),
    sampleResourceIds: target.sampleResourceIds.join("|"),
    samplePayloadStrings: target.samplePayloadStrings.join("|"),
    sampleEntryTables: target.sampleEntryTables.join("|"),
    sampleSourceProgramTables: target.sampleSourceProgramTables.join("|"),
    sampleSourceKeyHashes: target.sampleSourceKeyHashes.join("|"),
    sampleType4SourceKeyHashes: target.sampleType4SourceKeyHashes.join("|"),
    sampleDecodedEntryHeaders: target.sampleDecodedEntryHeaders.join("|"),
    sampleDecodedValueWords: target.sampleDecodedValueWords.join("|"),
    sampleType4ValueWords: target.sampleType4ValueWords.join("|"),
    sampleTextureResourceKeys: target.sampleTextureResourceKeys.join("|"),
    sampleTextureObjects: target.sampleTextureObjects.join("|"),
    samplePatchSamplerUnits: target.samplePatchSamplerUnits.join("|"),
    samplePatchType4ValueWords: target.samplePatchType4ValueWords.join("|"),
  }));

  const observedHookTargets = rows.filter((row) => row.eventRows > 0).length;
  const targetEventRowsWithEventId = targetRecords.filter((record) => eventIdForRecord(record) !== null).length;
  const targetEventRowsWithThreadId = targetRecords.filter((record) => threadKeyForRecord(record)).length;
  const captureOrderingFieldsComplete =
    targetEventRows > 0 &&
    targetEventRowsWithEventId === targetEventRows &&
    targetEventRowsWithThreadId === targetEventRows;
  const eventIdOrdering = eventIdOrderingStats(targetRecords);
  const targetEventDuplicateEventIdRows = eventIdOrdering.duplicateRows;
  const targetEventNonMonotonicEventIdRows = eventIdOrdering.nonMonotonicRows;
  const captureEventIdOrderingComplete =
    captureOrderingFieldsComplete &&
    targetEventDuplicateEventIdRows === 0 &&
    targetEventNonMonotonicEventIdRows === 0;
  const captureLimitRows = captureLimits.length;
  const captureLimitDroppedEventRowsAtLeast = captureLimits.reduce(
    (sum, row) => sum + Math.max(0, Number(row.droppedEventRowsAtLeast) || 0),
    0,
  );
  const captureEventLimitHit = captureLimitRows > 0;
  const resourceListSnapshotEvents = rows.reduce((sum, row) => sum + row.resourceListSnapshotEvents, 0);
  const resourceListTopRows = rows.reduce((sum, row) => sum + row.resourceListTopRows, 0);
  const nestedIdRows = rows.reduce((sum, row) => sum + row.nestedIdRows, 0);
  const resourceListTruncatedRows = rows.reduce((sum, row) => sum + row.resourceListTruncatedRows, 0);
  const nestedResourceIdTruncatedRows = rows.reduce((sum, row) => sum + row.nestedResourceIdTruncatedRows, 0);
  const resourceListCaptureComplete =
    resourceListSnapshotEvents > 0 && resourceListTruncatedRows === 0 && nestedResourceIdTruncatedRows === 0;
  const entryBuilderEvents = rows.reduce((sum, row) => sum + row.entryBuilderEvents, 0);
  const mountEvents = rows.reduce((sum, row) => sum + row.mountEvents, 0);
  const cloneFinalizeEvents = rows.reduce((sum, row) => sum + row.cloneFinalizeEvents, 0);
  const upstreamSelectionEvents = rows.reduce((sum, row) => sum + row.upstreamSelectionEvents, 0);
  const sourceProgramTableDecodeEvents = rows.reduce((sum, row) => sum + row.sourceProgramTableDecodeEvents, 0);
  const sourceProgramTableDecodedEntryRows = rows.reduce((sum, row) => sum + row.sourceProgramTableDecodedEntryRows, 0);
  const sourceProgramTableDecodedValueWordRows = rows.reduce(
    (sum, row) => sum + row.sourceProgramTableDecodedValueWordRows,
    0,
  );
  const sourceProgramTableTruncatedRows = rows.reduce((sum, row) => sum + row.sourceProgramTableTruncatedRows, 0);
  const sourceProgramTableMissingEntryRows = rows.reduce((sum, row) => sum + row.sourceProgramTableMissingEntryRows, 0);
  const sourceProgramTableCaptureComplete =
    sourceProgramTableDecodeEvents > 0 && sourceProgramTableTruncatedRows === 0;
  const sourceProgramType4EntryRows = rows.reduce((sum, row) => sum + row.sourceProgramType4EntryRows, 0);
  const sourceProgramDirectValueEntryRows = rows.reduce((sum, row) => sum + row.sourceProgramDirectValueEntryRows, 0);
  const textureRegistrationEvents = rows.reduce((sum, row) => sum + row.textureRegistrationEvents, 0);
  const textureRuntimeLookupEvents = rows.reduce((sum, row) => sum + row.textureRuntimeLookupEvents, 0);
  const textureRuntimeLookupReturnRows = rows.reduce((sum, row) => sum + row.textureRuntimeLookupReturnRows, 0);
  const inlineTextureObjectBuilderEvents = rows.reduce((sum, row) => sum + row.inlineTextureObjectBuilderEvents, 0);
  const inlineTextureObjectReturnRows = rows.reduce((sum, row) => sum + row.inlineTextureObjectReturnRows, 0);
  const type4TexturePatchEvents = rows.reduce((sum, row) => sum + row.type4TexturePatchEvents, 0);
  const type4TexturePatchAfterDecodeEvents = rows.reduce((sum, row) => sum + row.type4TexturePatchAfterDecodeEvents, 0);
  const type4TexturePatchDecodedEntryRows = rows.reduce((sum, row) => sum + row.type4TexturePatchDecodedEntryRows, 0);
  const type4TexturePatchDecodedType4EntryRows = rows.reduce(
    (sum, row) => sum + row.type4TexturePatchDecodedType4EntryRows,
    0,
  );
  const returnedEvents = returnedTextureObjectEvents(targetRecords);
  const returnedTextureObjects = new Set(returnedEvents.map((event) => event.textureObject));
  const texturePatchRecords = targetRecords.filter((record) => record.texturePatch);
  const knownTextureResourceKeys = knownShadergraphTextureResourceKeys(
    materialRuntime,
    shadergraphSamplerTexDataJoin,
  );
  const knownTextureResourceKeyUnits = knownShadergraphTextureResourceKeyUnits(
    materialRuntime,
    shadergraphSamplerTexDataJoin,
  );
  const knownTextureResourceKeySamplerIdentities =
    knownShadergraphTextureResourceKeySamplerIdentities(materialRuntime, shadergraphSamplerTexDataJoin);
  const textureRegistrationResourceEvents = textureRegistrationResourceKeyEvents(targetRecords, knownTextureResourceKeys);
  const textureResourceEvents = textureLookupResourceKeyEvents(
    targetRecords,
    knownTextureResourceKeys,
    knownTextureResourceKeyUnits,
    knownTextureResourceKeySamplerIdentities,
  );
  const knownResourceObjectEvents = textureResourceEvents.filter((event) => event.knownShadergraphResourceKey && event.textureObject);
  const registeredKnownResourceEvents = textureResourceEvents.filter((event) =>
    hasPriorSameThreadKnownResourceRegistration(event, textureRegistrationResourceEvents),
  );
  const registeredSameRuntimeKnownResourceEvents = textureResourceEvents.filter((event) =>
    hasPriorSameRuntimeKnownResourceRegistration(event, textureRegistrationResourceEvents),
  );
  const registeredKnownResourceObjectEvents = registeredKnownResourceEvents.filter((event) => event.textureObject);
  const registeredSameRuntimeKnownResourceObjectEvents = registeredSameRuntimeKnownResourceEvents.filter(
    (event) => event.textureObject,
  );
  const knownShadergraphTextureResourceRows = knownTextureResourceKeys.size;
  const knownShadergraphTextureResourceUnitRows = [...knownTextureResourceKeyUnits.values()].reduce(
    (sum, units) => sum + units.size,
    0,
  );
  const knownShadergraphTextureResourceSamplerIdentityRows = [
    ...knownTextureResourceKeySamplerIdentities.values(),
  ].reduce((sum, identities) => sum + identities.length, 0);
  const textureRegistrationResourceKeyRows = textureRegistrationResourceEvents.length;
  const textureRegistrationKnownShadergraphResourceKeyRows = textureRegistrationResourceEvents.filter(
    (event) => event.knownShadergraphResourceKey,
  ).length;
  const textureLookupResourceKeyRows = textureResourceEvents.length;
  const textureLookupKnownShadergraphResourceKeyRows = textureResourceEvents.filter(
    (event) => event.knownShadergraphResourceKey,
  ).length;
  const textureLookupUnknownShadergraphResourceKeyRows =
    textureLookupResourceKeyRows - textureLookupKnownShadergraphResourceKeyRows;
  const textureLookupRegisteredKnownShadergraphResourceKeyRows = registeredKnownResourceEvents.length;
  const textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows =
    registeredSameRuntimeKnownResourceEvents.length;
  const type4TexturePatchKnownReturnedObjectRows = texturePatchRecords.filter((record) =>
    returnedTextureObjects.has(normalizeHex(record.texturePatch.textureObject)),
  ).length;
  const type4TexturePatchValueMatchesObjectRows = texturePatchRecords.filter((record) =>
    patchValueMatchesObject(record.texturePatch),
  ).length;
  const type4TexturePatchSameObjectAndValueMatchRows = texturePatchRecords.filter((record) => {
    const textureObject = normalizeHex(record.texturePatch.textureObject);
    return returnedTextureObjects.has(textureObject) && patchValueMatchesObject(record.texturePatch);
  }).length;
  const type4TexturePatchSamplerUnitMatchesEntryRows = texturePatchRecords.filter((record) =>
    patchSamplerUnitMatchesEntry(record.texturePatch),
  ).length;
  const type4TexturePatchValueAndSamplerUnitMatchRows = texturePatchRecords.filter((record) =>
    patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameThreadObjectRows = texturePatchRecords.filter((record) =>
    hasSameThreadReturnedObject(record, returnedEvents),
  ).length;
  const type4TexturePatchOrderedSameThreadObjectRows = texturePatchRecords.filter((record) =>
    hasOrderedSameThreadReturnedObject(record, returnedEvents),
  ).length;
  const type4TexturePatchSameSequenceObjectAndValueMatchRows = texturePatchRecords.filter(
    (record) => hasOrderedSameThreadReturnedObject(record, returnedEvents) && patchValueMatchesObject(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceObjectUnitAndValueRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadReturnedObject(record, returnedEvents) &&
      patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceKnownResourceObjectRows = texturePatchRecords.filter((record) =>
    hasOrderedSameThreadKnownResourceObject(record, knownResourceObjectEvents),
  ).length;
  const type4TexturePatchSameSequenceKnownResourceUnitAndValueRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadKnownResourceObject(record, knownResourceObjectEvents) &&
      patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows = texturePatchRecords.filter((record) =>
    hasOrderedSameThreadKnownResourceObject(record, registeredKnownResourceObjectEvents),
  ).length;
  const type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadKnownResourceObject(record, registeredKnownResourceObjectEvents) &&
      patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows = texturePatchRecords.filter((record) =>
    hasOrderedSameThreadKnownResourceSamplerUnit(record, registeredKnownResourceObjectEvents),
  ).length;
  const type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadKnownResourceSamplerUnit(record, registeredKnownResourceObjectEvents) &&
      patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows =
    texturePatchRecords.filter(
      (record) =>
        hasOrderedSameThreadKnownResourceSamplerUnit(record, registeredSameRuntimeKnownResourceObjectEvents) &&
        patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
    ).length;
  const type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows =
    texturePatchRecords.filter((record) =>
      hasOrderedSameThreadKnownResourceSamplerIdentity(record, registeredSameRuntimeKnownResourceObjectEvents),
    ).length;
  const type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows =
    texturePatchRecords.filter((record) =>
      hasOrderedSameThreadKnownResourceSamplerIdentityAndValue(
        record,
        registeredSameRuntimeKnownResourceObjectEvents,
      ),
    ).length;
  const mountedType4TableRows = mountedType4TableEvents(targetRecords);
  const sourceProgramMountedType4TableRows = mountedType4TableRows.length;
  const type4TexturePatchMountedTableRows = texturePatchRecords.filter((record) =>
    hasMountedType4Table(record, mountedType4TableRows),
  ).length;
  const type4TexturePatchOrderedMountedTableRows = texturePatchRecords.filter((record) =>
    hasOrderedSameThreadMountedType4Table(record, mountedType4TableRows),
  ).length;
  const type4TexturePatchSameSequenceTableObjectRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadMountedType4Table(record, mountedType4TableRows) &&
      hasOrderedSameThreadReturnedObject(record, returnedEvents) &&
      patchValueMatchesObject(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows = texturePatchRecords.filter(
    (record) =>
      hasOrderedSameThreadMountedType4Table(record, mountedType4TableRows) &&
      hasOrderedSameThreadKnownResourceSamplerUnit(record, registeredKnownResourceObjectEvents) &&
      patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
  ).length;
  const type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows =
    texturePatchRecords.filter(
      (record) =>
        hasOrderedSameThreadMountedType4Table(record, mountedType4TableRows) &&
        hasOrderedSameThreadKnownResourceSamplerUnit(record, registeredSameRuntimeKnownResourceObjectEvents) &&
        patchValueMatchesObjectAndSamplerUnit(record.texturePatch),
    ).length;
  const type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows =
    texturePatchRecords.filter(
      (record) =>
        hasOrderedSameThreadMountedType4Table(record, mountedType4TableRows) &&
        hasOrderedSameThreadKnownResourceSamplerIdentityAndValue(
          record,
          registeredSameRuntimeKnownResourceObjectEvents,
        ),
    ).length;
  const sourceProgramType4DecoderNeedsRuntimeCapture =
    sourceProgramType4DecoderReady && sourceProgramType4EntryRows === 0;
  const readyForManualTextureRuntimeReview =
    captureEventIdOrderingComplete &&
    !captureEventLimitHit &&
    sourceProgramTableTruncatedRows === 0 &&
    textureRuntimeLookupReturnRows > 0 &&
    type4TexturePatchAfterDecodeEvents > 0 &&
    type4TexturePatchDecodedType4EntryRows > 0 &&
    type4TexturePatchKnownReturnedObjectRows > 0 &&
    type4TexturePatchValueMatchesObjectRows > 0 &&
    type4TexturePatchSameSequenceObjectAndValueMatchRows > 0 &&
    type4TexturePatchSameSequenceObjectUnitAndValueRows > 0;
  const readyForManualTextureResourceKeyReview =
    knownShadergraphTextureResourceRows > 0 &&
    textureRegistrationKnownShadergraphResourceKeyRows > 0 &&
    textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows > 0 &&
    type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows > 0;
  const sourceProgramEvidenceComplete =
    !captureEventLimitHit &&
    resourceListCaptureComplete &&
    sourceProgramTableCaptureComplete &&
    resourceListSnapshotEvents > 0 &&
    nestedIdRows > 0 &&
    entryBuilderEvents > 0 &&
    mountEvents > 0 &&
    sourceProgramTableDecodedEntryRows > 0;
  const readyForManualSourceProgramReview = captureEventIdOrderingComplete && sourceProgramEvidenceComplete;
  const readyForManualTextureSamplerReview =
    readyForManualSourceProgramReview &&
    readyForManualTextureRuntimeReview &&
    readyForManualTextureResourceKeyReview &&
    sourceProgramType4EntryRows > 0 &&
    sourceProgramMountedType4TableRows > 0 &&
    type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows > 0;
  const captureStatus = !captureImported
    ? "capture-missing"
    : !records.length
      ? "capture-empty"
      : !targetEventRows
        ? "no-target-events"
        : captureEventLimitHit
          ? "capture-event-limit-hit"
        : resourceListTruncatedRows > 0 || nestedResourceIdTruncatedRows > 0
          ? "resource-list-truncated"
        : sourceProgramTableTruncatedRows > 0
          ? "source-program-table-truncated"
        : sourceProgramEvidenceComplete && !captureOrderingFieldsComplete
          ? "capture-ordering-fields-missing"
        : sourceProgramEvidenceComplete && !captureEventIdOrderingComplete
          ? "capture-event-ordering-invalid"
        : readyForManualSourceProgramReview && observedHookTargets === targets.length && targets.length > 0
          ? "ready-for-full-source-program-review"
          : readyForManualSourceProgramReview
            ? "ready-for-partial-source-program-review"
            : "partial-target-coverage";

  return {
    generatedAt: new Date().toISOString(),
    source: {
      inputPath,
      targetsPath: defaultTargetsPath,
      type4EntrySemanticsPath,
      materialRuntimePath,
      shadergraphSamplerTexDataJoinPath,
    },
    policy:
      "diagnostic-only material source/program runtime capture summary; never grants renderer takeover by itself",
    summary: {
      captureImported,
      captureStatus,
      readyForManualSourceProgramReview,
      readyForManualTextureSamplerReview,
      partialCaptureUseful: targetEventRows > 0,
      targetRows: targets.length,
      beginRows,
      observedHookTargets,
      targetEventRows,
      targetEventRowsWithEventId,
      targetEventRowsWithThreadId,
      captureOrderingFieldsComplete,
      targetEventDuplicateEventIdRows,
      targetEventNonMonotonicEventIdRows,
      captureEventIdOrderingComplete,
      ignoredRows,
      errorRows: errors.length,
      captureLimitRows,
      captureLimitDroppedEventRowsAtLeast,
      captureEventLimitHit,
      missingTargetRows: rows.filter((row) => row.eventRows === 0).length,
      resourceListSnapshotEvents,
      resourceListTopRows,
      nestedIdRows,
      resourceListTruncatedRows,
      nestedResourceIdTruncatedRows,
      resourceListCaptureComplete,
      entryBuilderEvents,
      mountEvents,
      cloneFinalizeEvents,
      upstreamSelectionEvents,
      sourceProgramTableDecodeEvents,
      sourceProgramTableDecodedEntryRows,
      sourceProgramTableDecodedValueWordRows,
      sourceProgramTableTruncatedRows,
      sourceProgramTableMissingEntryRows,
      sourceProgramTableCaptureComplete,
      sourceProgramType4EntryRows,
      sourceProgramDirectValueEntryRows,
      sourceProgramMountedType4TableRows,
      knownShadergraphTextureResourceRows,
      knownShadergraphTextureResourceUnitRows,
      knownShadergraphTextureResourceSamplerIdentityRows,
      textureRegistrationResourceKeyRows,
      textureRegistrationKnownShadergraphResourceKeyRows,
      textureLookupResourceKeyRows,
      textureLookupKnownShadergraphResourceKeyRows,
      textureLookupUnknownShadergraphResourceKeyRows,
      textureLookupRegisteredKnownShadergraphResourceKeyRows,
      textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows,
      textureRegistrationEvents,
      textureRuntimeLookupEvents,
      textureRuntimeLookupReturnRows,
      inlineTextureObjectBuilderEvents,
      inlineTextureObjectReturnRows,
      type4TexturePatchEvents,
      type4TexturePatchAfterDecodeEvents,
      type4TexturePatchDecodedEntryRows,
      type4TexturePatchDecodedType4EntryRows,
      type4TexturePatchKnownReturnedObjectRows,
      type4TexturePatchValueMatchesObjectRows,
      type4TexturePatchSameObjectAndValueMatchRows,
      type4TexturePatchSamplerUnitMatchesEntryRows,
      type4TexturePatchValueAndSamplerUnitMatchRows,
      type4TexturePatchSameThreadObjectRows,
      type4TexturePatchOrderedSameThreadObjectRows,
      type4TexturePatchSameSequenceObjectAndValueMatchRows,
      type4TexturePatchSameSequenceObjectUnitAndValueRows,
      type4TexturePatchSameSequenceKnownResourceObjectRows,
      type4TexturePatchSameSequenceKnownResourceUnitAndValueRows,
      type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows,
      type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
      type4TexturePatchMountedTableRows,
      type4TexturePatchOrderedMountedTableRows,
      type4TexturePatchSameSequenceTableObjectRows,
      type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
      readyForManualTextureRuntimeReview,
      readyForManualTextureResourceKeyReview,
      sourceProgramType4DecoderReady,
      sourceProgramType4DecoderNeedsRuntimeCapture,
      sourceProgramType4HeaderMaskHex: type4Summary.type4HeaderMaskHex || "",
      sourceProgramType4SourceIndexBits: type4Summary.sourceIndexBits || "",
      sourceProgramType4ValueOffsetBits: type4Summary.valueOffsetBits || "",
      sourceProgramType4TypeBits: type4Summary.typeBits || "",
      sourceProgramType4ValueWordCount: type4Summary.type4ValueWordCount || 0,
      resourceListSemanticNamesRecovered: false,
      materialSamplerTextureObjectOwnershipRecovered: false,
      shaderTextureFormulaRecovered: false,
      renderPromotionAllowedRows: 0,
    },
    items: rows,
  };
}

function exportSummary({
  targetsPath = defaultTargetsPath,
  inputPath = defaultInputPath,
  type4EntrySemanticsPath = defaultType4EntrySemanticsPath,
  materialRuntimePath = defaultMaterialRuntimePath,
  shadergraphSamplerTexDataJoinPath = defaultShadergraphSamplerTexDataJoinPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const targetManifest = readJson(targetsPath, { items: [] });
  const type4EntrySemantics = readJson(type4EntrySemanticsPath, { summary: {} });
  const materialRuntime = readJson(materialRuntimePath, { items: [] });
  const shadergraphSamplerTexDataJoin = readJson(shadergraphSamplerTexDataJoinPath, { items: [] });
  const manifest = summarizeCapture({
    targetManifest,
    inputPath,
    type4EntrySemantics,
    type4EntrySemanticsPath,
    materialRuntime,
    materialRuntimePath,
    shadergraphSamplerTexDataJoin,
    shadergraphSamplerTexDataJoinPath,
  });
  manifest.source.targetsPath = targetsPath;
  manifest.source.type4EntrySemanticsPath = type4EntrySemanticsPath;
  manifest.source.materialRuntimePath = materialRuntimePath;
  manifest.source.shadergraphSamplerTexDataJoinPath = shadergraphSamplerTexDataJoinPath;
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  if (viewerOut) {
    fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
    fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  if (tsvOut) {
    writeTsv(tsvOut, manifest.items, [
      "name",
      "addressHex",
      "captureKind",
      "reason",
      "eventRows",
      "resourceListSnapshotEvents",
      "resourceListTopRows",
      "nestedIdRows",
      "resourceListTruncatedRows",
      "nestedResourceIdTruncatedRows",
      "entryBuilderEvents",
      "mountEvents",
      "cloneFinalizeEvents",
      "upstreamSelectionEvents",
      "sourceProgramTableDecodeEvents",
      "sourceProgramTableDecodedEntryRows",
      "sourceProgramTableDecodedValueWordRows",
      "sourceProgramTableTruncatedRows",
      "sourceProgramTableMissingEntryRows",
      "sourceProgramType4EntryRows",
      "sourceProgramDirectValueEntryRows",
      "textureRegistrationEvents",
      "textureRuntimeLookupEvents",
      "textureRuntimeLookupReturnRows",
      "inlineTextureObjectBuilderEvents",
      "inlineTextureObjectReturnRows",
      "type4TexturePatchEvents",
      "type4TexturePatchAfterDecodeEvents",
      "type4TexturePatchDecodedEntryRows",
      "type4TexturePatchDecodedType4EntryRows",
      "sampleResourceListHeads",
      "sampleResourceIds",
      "samplePayloadStrings",
      "sampleEntryTables",
      "sampleSourceProgramTables",
      "sampleSourceKeyHashes",
      "sampleType4SourceKeyHashes",
      "sampleDecodedEntryHeaders",
      "sampleDecodedValueWords",
      "sampleType4ValueWords",
      "sampleTextureResourceKeys",
      "sampleTextureObjects",
      "samplePatchSamplerUnits",
      "samplePatchType4ValueWords",
    ]);
  }
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSummary({
    targetsPath: optionValue(args, "--targets", defaultTargetsPath),
    inputPath: optionValue(args, "--input", defaultInputPath),
    type4EntrySemanticsPath: optionValue(args, "--type4-entry-semantics", defaultType4EntrySemanticsPath),
    materialRuntimePath: optionValue(args, "--material-runtime", defaultMaterialRuntimePath),
    shadergraphSamplerTexDataJoinPath: optionValue(
      args,
      "--shadergraph-sampler-texdata-join",
      defaultShadergraphSamplerTexDataJoinPath,
    ),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  summarizeCapture,
  exportSummary,
};
