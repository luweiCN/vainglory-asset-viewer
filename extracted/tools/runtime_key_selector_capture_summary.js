#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultInputPath = "extracted/reports/runtime_key_selector_capture.jsonl";
const defaultJsonOut = "extracted/reports/runtime_key_selector_capture_summary.json";
const defaultViewerOut = "extracted/viewer/runtime-key-selector-capture-summary.json";
const defaultTsvOut = "extracted/reports/runtime_key_selector_capture_summary.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function readRecords(inputPath) {
  if (!fs.existsSync(inputPath)) return null;
  const text = fs.readFileSync(inputPath, "utf8");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    return parsed.records || parsed.events || [parsed];
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseJsonLine)
      .filter(Boolean);
  }
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) {
    lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function increment(map, key, amount = 1) {
  const normalized = String(key || "");
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function mapToRows(map, valueColumn = "count") {
  return [...map.entries()]
    .map(([key, value]) => ({ key, [valueColumn]: value }))
    .sort((left, right) => right[valueColumn] - left[valueColumn] || left.key.localeCompare(right.key));
}

function callerClassFromRecord(record) {
  const classification = record.callerClassification;
  if (!classification || typeof classification !== "object") return "";
  return classification.sourceOwner || classification.sourceKind || "";
}

function bestStringFromStringObject(value) {
  if (!value || typeof value !== "object") return "";
  if (value.bestString) return value.bestString;
  if (Array.isArray(value.candidates) && value.candidates[0]?.text) return value.candidates[0].text;
  return "";
}

function keyFromRecord(record) {
  return (
    bestStringFromStringObject(record.key) ||
    bestStringFromStringObject(record.returnString) ||
    bestStringFromStringObject(record.input) ||
    bestStringFromStringObject(record.inputResolvedObject?.dispatchKey) ||
    bestStringFromStringObject(record.inputResolvedObject?.preOwnerRequestKey) ||
    bestStringFromStringObject(record.recordKeyAtPlus4) ||
    bestStringFromStringObject(record.keyAtPayloadPlus0) ||
    bestStringFromStringObject(record.keyAtPayloadPlus20) ||
    bestStringFromStringObject(record.globals?.runtimeResourceKeyGlobalStringSlot?.string) ||
    bestStringFromStringObject(record.globals?.runtimeResourceKeyGlobalResolvedSlot?.resolvedObject?.dispatchKey) ||
    bestStringFromStringObject(record.globals?.runtimeResourceKeyGlobalResolvedSlot?.resolvedObject?.preOwnerRequestKey) ||
    bestStringFromStringObject(record.globalsAfter?.runtimeResourceKeyGlobalStringSlot?.string) ||
    bestStringFromStringObject(record.globalsAfter?.runtimeResourceKeyGlobalResolvedSlot?.resolvedObject?.dispatchKey) ||
    bestStringFromStringObject(record.globalsAfter?.runtimeResourceKeyGlobalResolvedSlot?.resolvedObject?.preOwnerRequestKey) ||
    ""
  );
}

function levelVisualsApplyFieldSnapshotCount(record) {
  const fields = record.levelVisualsApplyFieldSnapshot?.fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function levelVisualsSchemaFieldSnapshotCount(record) {
  const fields = record.levelVisualsSchemaFieldSnapshot?.fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function stringsFromLevelVisualsLoader(record) {
  const items = record?.levelVisualsRefsAtPlus10?.items;
  if (!Array.isArray(items)) return [];
  return [
    ...new Set(
      items
        .map((item) => bestStringFromStringObject(item?.string))
        .filter(Boolean),
    ),
  ].sort();
}

function profilePayloadFromLevelVisualsApply(record) {
  return bestStringFromStringObject(record?.profilePayloadAtPlus50?.string);
}

function profileRequestFromLightfield(record) {
  return bestStringFromStringObject(record?.profileRequest);
}

function finiteSampleNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function positionSampleFromRecord(record) {
  const sample = record?.positionSample;
  if (!sample || !finiteSampleNumber(sample.x) || !finiteSampleNumber(sample.y) || !finiteSampleNumber(sample.z)) {
    return null;
  }
  return {
    pointer: sample.pointer || "",
    x: sample.x,
    y: sample.y,
    z: sample.z,
  };
}

function probeSamplesFromRecord(record) {
  const probeSamples = record?.probeSamples;
  const samples = Array.isArray(probeSamples?.samples) ? probeSamples.samples : [];
  if (samples.length < 6) return null;
  const normalized = samples.slice(0, 6).map((sample, index) => ({
    index: Number.isFinite(sample?.index) ? sample.index : index,
    x: sample?.x,
    y: sample?.y,
    z: sample?.z,
    w: sample?.w,
  }));
  if (
    !normalized.every(
      (sample) =>
        finiteSampleNumber(sample.x) &&
        finiteSampleNumber(sample.y) &&
        finiteSampleNumber(sample.z) &&
        finiteSampleNumber(sample.w),
    )
  ) {
    return null;
  }
  return {
    pointer: probeSamples.pointer || record.outputPointer || "",
    samples: normalized,
  };
}

function buildSequenceProfileEvidence({ levelVisualsEvent, levelVisualsApplyEvent, lightfieldEvent }) {
  const levelVisualsRefKeys = stringsFromLevelVisualsLoader(levelVisualsEvent);
  const levelVisualsProfilePayload = profilePayloadFromLevelVisualsApply(levelVisualsApplyEvent);
  const lightfieldProfileRequest = profileRequestFromLightfield(lightfieldEvent);
  const hasProfileEvidence = Boolean(levelVisualsProfilePayload || lightfieldProfileRequest);
  const profileValues = [levelVisualsProfilePayload, lightfieldProfileRequest].filter(Boolean);
  const profileValuesMatch =
    profileValues.length >= 2
      ? new Set(profileValues.map((value) => value.toLowerCase())).size === 1
      : null;
  return {
    levelVisualsRefKeys,
    levelVisualsProfilePayload,
    lightfieldProfileRequest,
    lightfieldProfileStatus: lightfieldEvent?.profileStatus ?? "",
    hasProfileEvidence,
    profileValuesMatch,
  };
}

function buildSequenceLightProbeEvidence({
  profileEvidence,
  positionSampleEvent,
  lightfieldPositionSampleEvent,
  lightfieldPositionSamplerLeaveEvent,
}) {
  const positionSampleUpload = positionSampleFromRecord(positionSampleEvent);
  const lightfieldPositionSample = positionSampleFromRecord(lightfieldPositionSampleEvent);
  const sampledProbeValues = probeSamplesFromRecord(lightfieldPositionSamplerLeaveEvent);
  const hasPositionSampleEvidence = Boolean(positionSampleUpload || lightfieldPositionSample);
  const hasProbeSampleValueEvidence = Boolean(sampledProbeValues);
  return {
    ...profileEvidence,
    positionSampleUpload,
    lightfieldPositionSample,
    sampledProbeValues,
    hasPositionSampleEvidence,
    hasProbeSampleValueEvidence,
    profileAndPositionReady: Boolean(profileEvidence.hasProfileEvidence && hasPositionSampleEvidence),
    profilePositionAndValuesReady: Boolean(
      profileEvidence.hasProfileEvidence && hasPositionSampleEvidence && hasProbeSampleValueEvidence,
    ),
  };
}

function summarize(records) {
  const begin = records.find((record) => record.type === "runtime_key_selector_begin") || null;
  const events = records.filter((record) => record.type === "runtime_key_selector_event");
  const installErrors = events.filter((record) => record.event === "hook-install-error");
  const byEvent = new Map();
  const keyCounts = new Map();
  const keyCountsByEvent = new Map();
  const callerCountsByEvent = new Map();
  const eventRows = [];

  for (let index = 0; index < events.length; index += 1) {
    const record = events[index];
    const event = record.event || "unknown";
    const key = keyFromRecord(record);
    const callerClass = callerClassFromRecord(record);
    increment(byEvent, event);
    if (key) {
      increment(keyCounts, key);
      const eventKeyMap = keyCountsByEvent.get(event) || new Map();
      increment(eventKeyMap, key);
      keyCountsByEvent.set(event, eventKeyMap);
    }
    if (callerClass) {
      const eventCallerMap = callerCountsByEvent.get(event) || new Map();
      increment(eventCallerMap, callerClass);
      callerCountsByEvent.set(event, eventCallerMap);
    }
    eventRows.push({
      index,
      timestampMs: record.timestampMs || "",
      event,
      callerClass,
      callerKind: record.callerClassification?.sourceKind || "",
      callerOffset: record.callerClassification?.moduleOffsetHex || "",
      callerClassified: record.callerClassification?.classified ?? "",
      key,
      payloadPointer: record.payloadPointer || "",
      payloadWord0NativeHex: record.payloadWord0NativeHex || "",
      payloadWord0BigEndianHex: record.payloadWord0BigEndianHex || "",
      offset: record.offset || "",
      pc: record.registers?.pc || "",
      lr: record.registers?.lr || "",
      x0: record.registers?.x0 || "",
      x1: record.registers?.x1 || "",
      x2: record.registers?.x2 || "",
      x3: record.registers?.x3 || "",
    });
  }

  const activeHelperEvents = events.filter((record) => record.event === "active-helper-8befac");
  const objectBuilderBParserEvents = events.filter(
    (record) => record.event === "typed-object-03f3-object-builder-b-parser",
  );
  const objectBuilderBHelperEvents = events.filter((record) => record.event === "object-builder-b-helper-c04b98");
  const levelSetupEvents = events.filter((record) => record.event === "level-setup-registered-callback");
  const levelVisualsEvents = events.filter((record) => record.event === "level-visuals-loader");
  const levelVisualsApplyEvents = events.filter((record) => record.event === "level-visuals-apply-processor");
  const levelVisualsApplyFieldSnapshotEvents = levelVisualsApplyEvents.filter(
    (record) => levelVisualsApplyFieldSnapshotCount(record) > 0,
  );
  const levelVisualsApplyFieldSnapshotFields = levelVisualsApplyFieldSnapshotEvents.reduce(
    (total, record) => total + levelVisualsApplyFieldSnapshotCount(record),
    0,
  );
  const levelVisualsSchemaFieldSnapshotEvents = levelVisualsApplyEvents.filter(
    (record) => levelVisualsSchemaFieldSnapshotCount(record) > 0,
  );
  const levelVisualsSchemaFieldSnapshotFields = levelVisualsSchemaFieldSnapshotEvents.reduce(
    (total, record) => total + levelVisualsSchemaFieldSnapshotCount(record),
    0,
  );
  const lightfieldEvents = events.filter((record) => record.event === "lightfield-profile-loader-candidate");
  const positionSampleUploadEvents = events.filter((record) => record.event === "scene-probe-position-sample-upload");
  const lightfieldPositionSamplerEvents = events.filter(
    (record) => record.event === "scene-probe-lightfield-position-sampler",
  );
  const lightfieldPositionSamplerLeaveEvents = events.filter(
    (record) => record.event === "scene-probe-lightfield-position-sampler-leave",
  );
  const lightfieldProbeSampleValueEvents = lightfieldPositionSamplerLeaveEvents.filter(probeSamplesFromRecord);
  const activeHelperSequences = buildActiveHelperSequences(events);
  const objectBuilderBSequences = buildObjectBuilderBSequences(events);
  const readySequences = activeHelperSequences.filter((sequence) => sequence.readyForManualReview);
  const readyFieldRouteSequences = activeHelperSequences.filter(
    (sequence) => sequence.fieldRouteSnapshotReadyForManualReview,
  );
  const readyProfileEvidenceSequences = activeHelperSequences.filter(
    (sequence) => sequence.profileEvidenceReadyForManualReview,
  );
  const readyProfileConsistentSequences = activeHelperSequences.filter(
    (sequence) => sequence.profileEvidenceReadyForManualReview && sequence.profileEvidence?.profileValuesMatch === true,
  );
  const readyLightProbeEvidenceSequences = activeHelperSequences.filter(
    (sequence) => sequence.lightProbeEvidenceReadyForManualReview,
  );
  const readySequencesWithUpstreamSource = readySequences.filter((sequence) => sequence.upstreamKeySourceRecovered);
  const activeHelperKeys = [...new Set(activeHelperSequences.map((sequence) => sequence.key).filter(Boolean))].sort();
  const readyObjectBuilderBSequences = objectBuilderBSequences.filter((sequence) => sequence.readyForManualReview);
  const readyObjectBuilderBProfileEvidenceSequences = objectBuilderBSequences.filter(
    (sequence) => sequence.profileEvidenceReadyForManualReview,
  );
  const readyObjectBuilderBProfileConsistentSequences = objectBuilderBSequences.filter(
    (sequence) => sequence.profileEvidenceReadyForManualReview && sequence.profileEvidence?.profileValuesMatch === true,
  );
  const readyObjectBuilderBLightProbeEvidenceSequences = objectBuilderBSequences.filter(
    (sequence) => sequence.lightProbeEvidenceReadyForManualReview,
  );
  const objectBuilderBKeys = [...new Set(objectBuilderBSequences.map((sequence) => sequence.key).filter(Boolean))].sort();
  const runtimeCaptureReadyForManualReview =
    readyProfileEvidenceSequences.length > 0 || readyObjectBuilderBProfileEvidenceSequences.length > 0;
  const runtimeLightProbeCaptureReadyForManualReview =
    readyLightProbeEvidenceSequences.length > 0 || readyObjectBuilderBLightProbeEvidenceSequences.length > 0;
  const missingGateEvidence = captureMissingGateEvidence({
    events,
    activeHelperEvents,
    activeHelperKeys,
    levelSetupEvents,
    levelVisualsEvents,
    levelVisualsApplyEvents,
    lightfieldEvents,
    positionSampleUploadEvents,
    lightfieldPositionSamplerEvents,
    lightfieldProbeSampleValueEvents,
    readySequences,
    readyProfileEvidenceSequences,
    readyLightProbeEvidenceSequences,
    objectBuilderBParserEvents,
    objectBuilderBHelperEvents,
    objectBuilderBKeys,
    readyObjectBuilderBSequences,
    readyObjectBuilderBProfileEvidenceSequences,
    readyObjectBuilderBLightProbeEvidenceSequences,
  });
  const runtimeCaptureReadinessState = captureReadinessState({
    events,
    runtimeCaptureReadyForManualReview,
    readySequences,
    readyObjectBuilderBSequences,
    readyProfileEvidenceSequences,
    readyObjectBuilderBProfileEvidenceSequences,
  });

  const keyRowsByEvent = [];
  for (const [event, map] of keyCountsByEvent.entries()) {
    for (const row of mapToRows(map)) {
      keyRowsByEvent.push({ event, key: row.key, count: row.count });
    }
  }
  keyRowsByEvent.sort((left, right) => left.event.localeCompare(right.event) || right.count - left.count);

  const callerRowsByEvent = [];
  for (const [event, map] of callerCountsByEvent.entries()) {
    for (const row of mapToRows(map)) {
      callerRowsByEvent.push({ event, callerClass: row.key, count: row.count });
    }
  }
  callerRowsByEvent.sort((left, right) => left.event.localeCompare(right.event) || right.count - left.count);

  const summary = {
    generatedAt: new Date().toISOString(),
    captureImported: true,
    captureStatus: "runtime-selector-capture-imported",
    source: {
      moduleName: begin?.moduleName || "",
      moduleBase: begin?.moduleBase || "",
      pointerSize: begin?.pointerSize || "",
    },
    totals: {
      inputRecords: records.length,
      runtimeEvents: events.length,
      hookInstallErrors: installErrors.length,
      activeHelperEvents: activeHelperEvents.length,
      objectBuilderBParserEvents: objectBuilderBParserEvents.length,
      objectBuilderBHelperEvents: objectBuilderBHelperEvents.length,
      levelSetupCallbackEvents: levelSetupEvents.length,
      levelVisualsLoaderEvents: levelVisualsEvents.length,
      levelVisualsApplyProcessorEvents: levelVisualsApplyEvents.length,
      levelVisualsSchemaFieldSnapshotEvents: levelVisualsSchemaFieldSnapshotEvents.length,
      levelVisualsSchemaFieldSnapshotFields,
      levelVisualsApplyFieldSnapshotEvents: levelVisualsApplyFieldSnapshotEvents.length,
      levelVisualsApplyFieldSnapshotFields,
      lightfieldProfileLoaderEvents: lightfieldEvents.length,
      sceneProbePositionSampleUploadEvents: positionSampleUploadEvents.length,
      sceneProbeLightfieldPositionSamplerEvents: lightfieldPositionSamplerEvents.length,
      sceneProbeLightfieldPositionSamplerLeaveEvents: lightfieldPositionSamplerLeaveEvents.length,
      sceneProbeSampleValueEvents: lightfieldProbeSampleValueEvents.length,
    },
    gateEvidence: {
      activeHelperObserved: activeHelperEvents.length > 0,
      activeHelperKeyValuesRecovered: activeHelperKeys.length > 0,
      activeHelperKeyValues: activeHelperKeys,
      levelSetupCallbackObserved: levelSetupEvents.length > 0,
      levelVisualsLoaderObserved: levelVisualsEvents.length > 0,
      levelVisualsApplyProcessorObserved: levelVisualsApplyEvents.length > 0,
      levelVisualsSchemaFieldSnapshotsObserved: levelVisualsSchemaFieldSnapshotEvents.length > 0,
      levelVisualsApplyFieldSnapshotsObserved: levelVisualsApplyFieldSnapshotEvents.length > 0,
      lightfieldProfileLoaderObserved: lightfieldEvents.length > 0,
      sceneProbePositionSampleObserved:
        positionSampleUploadEvents.length > 0 || lightfieldPositionSamplerEvents.length > 0,
      sceneProbeSampleValuesObserved: lightfieldProbeSampleValueEvents.length > 0,
      readySequenceCount: readySequences.length,
      readyFieldRouteSequenceCount: readyFieldRouteSequences.length,
      readyProfileEvidenceSequenceCount: readyProfileEvidenceSequences.length,
      readyProfileConsistentSequenceCount: readyProfileConsistentSequences.length,
      readyLightProbeEvidenceSequenceCount: readyLightProbeEvidenceSequences.length,
      readySequenceWithUpstreamSourceCount: readySequencesWithUpstreamSource.length,
      objectBuilderBParserObserved: objectBuilderBParserEvents.length > 0,
      objectBuilderBHelperObserved: objectBuilderBHelperEvents.length > 0,
      objectBuilderBParserToHelperSequenceCount: objectBuilderBSequences.filter(
        (sequence) => sequence.parserToHelperObserved,
      ).length,
      objectBuilderBKeyValuesRecovered: objectBuilderBKeys.length > 0,
      objectBuilderBKeyValues: objectBuilderBKeys,
      objectBuilderBReadySequenceCount: readyObjectBuilderBSequences.length,
      objectBuilderBReadyWithPayloadWord0Count: readyObjectBuilderBSequences.filter(
        (sequence) => sequence.payloadWord0Recovered,
      ).length,
      objectBuilderBReadyProfileEvidenceSequenceCount: readyObjectBuilderBProfileEvidenceSequences.length,
      objectBuilderBReadyProfileConsistentSequenceCount: readyObjectBuilderBProfileConsistentSequences.length,
      objectBuilderBReadyLightProbeEvidenceSequenceCount: readyObjectBuilderBLightProbeEvidenceSequences.length,
      runtimeCaptureReadinessState,
      missingGateEvidence,
      runtimeCaptureReadyForManualReview,
      runtimeLightProbeCaptureReadyForManualReview,
      rendererProfileTakeoverAllowedByThisCapture: false,
      note:
        "This summary only proves runtime observation. Renderer takeover is never allowed by this capture alone; profile review requires same-sequence LevelVisuals/profile evidence, and light/probe review also requires same-sequence position plus sampled Probe.Samples value evidence.",
    },
    byEvent: Object.fromEntries(mapToRows(byEvent).map((row) => [row.key, row.count])),
    keyCounts: mapToRows(keyCounts),
    keyCountsByEvent: keyRowsByEvent,
    callerCountsByEvent: callerRowsByEvent,
    activeHelperSequences,
    objectBuilderBSequences,
    installErrors,
  };

  return { summary, eventRows };
}

function missingCaptureSummary(inputPath, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    captureImported: false,
    captureStatus: "runtime-selector-capture-missing",
    source: {
      inputPath: inputPath || "",
      moduleName: "",
      moduleBase: "",
      pointerSize: "",
    },
    totals: {
      inputRecords: 0,
      runtimeEvents: 0,
      hookInstallErrors: 0,
      activeHelperEvents: 0,
      objectBuilderBParserEvents: 0,
      objectBuilderBHelperEvents: 0,
      levelSetupCallbackEvents: 0,
      levelVisualsLoaderEvents: 0,
      levelVisualsApplyProcessorEvents: 0,
      levelVisualsSchemaFieldSnapshotEvents: 0,
      levelVisualsSchemaFieldSnapshotFields: 0,
      levelVisualsApplyFieldSnapshotEvents: 0,
      levelVisualsApplyFieldSnapshotFields: 0,
      lightfieldProfileLoaderEvents: 0,
      sceneProbePositionSampleUploadEvents: 0,
      sceneProbeLightfieldPositionSamplerEvents: 0,
      sceneProbeLightfieldPositionSamplerLeaveEvents: 0,
      sceneProbeSampleValueEvents: 0,
    },
    gateEvidence: {
      activeHelperObserved: false,
      activeHelperKeyValuesRecovered: false,
      activeHelperKeyValues: [],
      levelSetupCallbackObserved: false,
      levelVisualsLoaderObserved: false,
      levelVisualsApplyProcessorObserved: false,
      levelVisualsSchemaFieldSnapshotsObserved: false,
      levelVisualsApplyFieldSnapshotsObserved: false,
      lightfieldProfileLoaderObserved: false,
      sceneProbePositionSampleObserved: false,
      sceneProbeSampleValuesObserved: false,
      readySequenceCount: 0,
      readyFieldRouteSequenceCount: 0,
      readyProfileEvidenceSequenceCount: 0,
      readyProfileConsistentSequenceCount: 0,
      readyLightProbeEvidenceSequenceCount: 0,
      readySequenceWithUpstreamSourceCount: 0,
      objectBuilderBParserObserved: false,
      objectBuilderBHelperObserved: false,
      objectBuilderBParserToHelperSequenceCount: 0,
      objectBuilderBKeyValuesRecovered: false,
      objectBuilderBKeyValues: [],
      objectBuilderBReadySequenceCount: 0,
      objectBuilderBReadyWithPayloadWord0Count: 0,
      objectBuilderBReadyProfileEvidenceSequenceCount: 0,
      objectBuilderBReadyProfileConsistentSequenceCount: 0,
      objectBuilderBReadyLightProbeEvidenceSequenceCount: 0,
      runtimeCaptureReadinessState: "capture-not-imported",
      missingGateEvidence: ["runtime-key-selector-capture-not-imported"],
      runtimeCaptureReadyForManualReview: false,
      runtimeLightProbeCaptureReadyForManualReview: false,
      rendererProfileTakeoverAllowedByThisCapture: false,
      note:
        "No original-runtime selector capture input is present. Renderer takeover remains blocked until a same-sequence key -> Level -> LevelVisuals -> profile -> position -> Probe.Samples capture is imported and reviewed.",
    },
    byEvent: {},
    keyCounts: [],
    keyCountsByEvent: [],
    callerCountsByEvent: [],
    activeHelperSequences: [],
    objectBuilderBSequences: [],
    installErrors: [],
  };
}

function captureReadinessState({
  events,
  runtimeCaptureReadyForManualReview,
  readySequences,
  readyObjectBuilderBSequences,
  readyProfileEvidenceSequences,
  readyObjectBuilderBProfileEvidenceSequences,
}) {
  if (!events.length) return "no-runtime-events";
  if (runtimeCaptureReadyForManualReview) return "ready-for-manual-profile-review";
  if (readyProfileEvidenceSequences.length || readyObjectBuilderBProfileEvidenceSequences.length) {
    return "profile-evidence-present-but-not-ready";
  }
  if (readySequences.length || readyObjectBuilderBSequences.length) return "closed-sequence-missing-profile-evidence";
  return "sequence-incomplete";
}

function captureMissingGateEvidence({
  events,
  activeHelperEvents,
  activeHelperKeys,
  levelSetupEvents,
  levelVisualsEvents,
  levelVisualsApplyEvents,
  lightfieldEvents,
  positionSampleUploadEvents,
  lightfieldPositionSamplerEvents,
  lightfieldProbeSampleValueEvents,
  readySequences,
  readyProfileEvidenceSequences,
  readyLightProbeEvidenceSequences,
  objectBuilderBParserEvents,
  objectBuilderBHelperEvents,
  objectBuilderBKeys,
  readyObjectBuilderBSequences,
  readyObjectBuilderBProfileEvidenceSequences,
  readyObjectBuilderBLightProbeEvidenceSequences,
}) {
  const blockers = [];
  if (!events.length) return ["no-runtime-events"];
  if (!activeHelperEvents.length && !objectBuilderBParserEvents.length) blockers.push("active-selector-not-observed");
  if (activeHelperEvents.length && !activeHelperKeys.length) blockers.push("active-helper-key-not-recovered");
  if (objectBuilderBParserEvents.length && !objectBuilderBHelperEvents.length) blockers.push("object-builder-b-helper-not-observed");
  if (objectBuilderBHelperEvents.length && !objectBuilderBKeys.length) blockers.push("object-builder-b-key-not-recovered");
  if (!levelSetupEvents.length) blockers.push("level-setup-callback-not-observed");
  if (!levelVisualsEvents.length) blockers.push("level-visuals-loader-not-observed");
  if (!levelVisualsApplyEvents.length) blockers.push("level-visuals-apply-processor-not-observed");
  if (!lightfieldEvents.length) blockers.push("lightfield-profile-loader-not-observed");
  if (!positionSampleUploadEvents.length && !lightfieldPositionSamplerEvents.length) {
    blockers.push("scene-probe-position-sample-not-observed");
  }
  if (!lightfieldProbeSampleValueEvents.length) {
    blockers.push("scene-probe-sample-values-not-observed");
  }
  if ((readySequences.length || readyObjectBuilderBSequences.length) && !readyProfileEvidenceSequences.length && !readyObjectBuilderBProfileEvidenceSequences.length) {
    blockers.push("same-sequence-profile-evidence-missing");
  }
  if (
    (readyProfileEvidenceSequences.length || readyObjectBuilderBProfileEvidenceSequences.length) &&
    !readyLightProbeEvidenceSequences.length &&
    !readyObjectBuilderBLightProbeEvidenceSequences.length
  ) {
    blockers.push("same-sequence-position-or-probe-sample-values-missing");
  }
  return [...new Set(blockers)];
}

function firstEventIndex(events, eventName, startExclusive, endExclusive) {
  for (let index = startExclusive + 1; index < endExclusive; index += 1) {
    if (events[index]?.event === eventName) return index;
  }
  return -1;
}

function firstMatchingEventIndex(events, predicate, startExclusive, endExclusive) {
  for (let index = startExclusive + 1; index < endExclusive; index += 1) {
    if (predicate(events[index])) return index;
  }
  return -1;
}

const upstreamKeySourceEvents = new Set([
  "global-key-setter",
  "global-key-setter-leave",
  "global-key-resolver",
  "typed-object-046f-payload-helper-enter",
  "typed-object-046f-payload-helper-leave",
  "typed-object-046f-key-selection-enter",
  "typed-object-046f-key-selection-leave",
  "typed-object-03e9-inline-key-writer",
  "typed-object-03e9-inline-key-writer-leave",
  "character-lobby-key-switch",
  "post-accessor-return",
]);

function matchingUpstreamKeyEvents(events, key, startExclusive, activeIndex) {
  if (!key) return [];
  const matches = [];
  for (let index = startExclusive + 1; index < activeIndex; index += 1) {
    const record = events[index];
    if (!record || !upstreamKeySourceEvents.has(record.event)) continue;
    const upstreamKey = keyFromRecord(record);
    if (upstreamKey !== key) continue;
    matches.push({
      eventIndex: index,
      event: record.event,
      key: upstreamKey,
      callerClass: callerClassFromRecord(record),
      callerKind: record.callerClassification?.sourceKind || "",
      callerOffset: record.callerClassification?.moduleOffsetHex || "",
      callerClassified: record.callerClassification?.classified ?? "",
    });
  }
  return matches;
}

function buildActiveHelperSequences(events) {
  const activeIndexes = [];
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].event === "active-helper-8befac") activeIndexes.push(index);
  }

  return activeIndexes.map((activeIndex, sequenceIndex) => {
    const activeEvent = events[activeIndex];
    const previousActiveIndex = activeIndexes[sequenceIndex - 1] ?? -1;
    const nextActiveIndex = activeIndexes[sequenceIndex + 1] ?? events.length;
    const levelSetupIndex = firstEventIndex(events, "level-setup-registered-callback", activeIndex, nextActiveIndex);
    const levelVisualsIndex = firstEventIndex(events, "level-visuals-loader", activeIndex, nextActiveIndex);
    const levelVisualsApplyIndex = firstEventIndex(
      events,
      "level-visuals-apply-processor",
      activeIndex,
      nextActiveIndex,
    );
    const levelVisualsApplyFieldSnapshotIndex = firstMatchingEventIndex(
      events,
      (record) =>
        record?.event === "level-visuals-apply-processor" && levelVisualsApplyFieldSnapshotCount(record) > 0,
      activeIndex,
      nextActiveIndex,
    );
    const levelVisualsSchemaFieldSnapshotIndex = firstMatchingEventIndex(
      events,
      (record) =>
        record?.event === "level-visuals-apply-processor" && levelVisualsSchemaFieldSnapshotCount(record) > 0,
      activeIndex,
      nextActiveIndex,
    );
    const lightfieldIndex = firstEventIndex(events, "lightfield-profile-loader-candidate", activeIndex, nextActiveIndex);
    const positionSampleUploadIndex = firstEventIndex(
      events,
      "scene-probe-position-sample-upload",
      activeIndex,
      nextActiveIndex,
    );
    const lightfieldPositionSamplerIndex = firstEventIndex(
      events,
      "scene-probe-lightfield-position-sampler",
      activeIndex,
      nextActiveIndex,
    );
    const lightfieldPositionSamplerLeaveIndex = firstEventIndex(
      events,
      "scene-probe-lightfield-position-sampler-leave",
      lightfieldPositionSamplerIndex >= 0 ? lightfieldPositionSamplerIndex : activeIndex,
      nextActiveIndex,
    );
    const levelVisualsEvent = levelVisualsIndex >= 0 ? events[levelVisualsIndex] : null;
    const levelVisualsApplyEvent = levelVisualsApplyIndex >= 0 ? events[levelVisualsApplyIndex] : null;
    const lightfieldEvent = lightfieldIndex >= 0 ? events[lightfieldIndex] : null;
    const positionSampleEvent = positionSampleUploadIndex >= 0 ? events[positionSampleUploadIndex] : null;
    const lightfieldPositionSampleEvent =
      lightfieldPositionSamplerIndex >= 0 ? events[lightfieldPositionSamplerIndex] : null;
    const lightfieldPositionSamplerLeaveEvent =
      lightfieldPositionSamplerLeaveIndex >= 0 ? events[lightfieldPositionSamplerLeaveIndex] : null;
    const key = keyFromRecord(activeEvent);
    const upstreamMatches = matchingUpstreamKeyEvents(events, key, previousActiveIndex, activeIndex);
    const downstreamEvents = {
      levelSetupCallbackIndex: levelSetupIndex,
      levelVisualsLoaderIndex: levelVisualsIndex,
      levelVisualsApplyProcessorIndex: levelVisualsApplyIndex,
      levelVisualsSchemaFieldSnapshotIndex,
      levelVisualsApplyFieldSnapshotIndex,
      lightfieldProfileLoaderIndex: lightfieldIndex,
      sceneProbePositionSampleUploadIndex: positionSampleUploadIndex,
      sceneProbeLightfieldPositionSamplerIndex: lightfieldPositionSamplerIndex,
      sceneProbeLightfieldPositionSamplerLeaveIndex: lightfieldPositionSamplerLeaveIndex,
    };
    const readyForManualReview = Boolean(
      key &&
        levelSetupIndex >= 0 &&
        levelVisualsIndex >= 0 &&
        levelVisualsApplyIndex >= 0 &&
        lightfieldIndex >= 0,
    );
    const profileEvidence = buildSequenceProfileEvidence({
      levelVisualsEvent,
      levelVisualsApplyEvent,
      lightfieldEvent,
    });
    const lightProbeEvidence = buildSequenceLightProbeEvidence({
      profileEvidence,
      positionSampleEvent,
      lightfieldPositionSampleEvent,
      lightfieldPositionSamplerLeaveEvent,
    });
    return {
      sequenceIndex,
      activeEventIndex: activeIndex,
      nextActiveEventIndex: nextActiveIndex < events.length ? nextActiveIndex : null,
      activeTimestampMs: activeEvent.timestampMs || "",
      key,
      keyRecovered: Boolean(key),
      upstreamKeyEvents: upstreamMatches,
      upstreamKeySourceRecovered: upstreamMatches.length > 0,
      upstreamCallerClasses: [...new Set(upstreamMatches.map((row) => row.callerClass).filter(Boolean))].sort(),
      downstreamEvents,
      profileEvidence,
      lightProbeEvidence,
      readyForManualReview,
      schemaSnapshotReadyForManualReview: readyForManualReview && levelVisualsSchemaFieldSnapshotIndex >= 0,
      fieldRouteSnapshotReadyForManualReview: readyForManualReview && levelVisualsApplyFieldSnapshotIndex >= 0,
      profileEvidenceReadyForManualReview: readyForManualReview && profileEvidence.hasProfileEvidence,
      lightProbeEvidenceReadyForManualReview: readyForManualReview && lightProbeEvidence.profilePositionAndValuesReady,
    };
  });
}

function wordHexFromObjectBuilderBParser(record) {
  return record?.payloadWord0NativeHex || record?.payloadWord0BigEndianHex || "";
}

function buildObjectBuilderBSequences(events) {
  const parserIndexes = [];
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].event === "typed-object-03f3-object-builder-b-parser") parserIndexes.push(index);
  }

  return parserIndexes.map((parserIndex, sequenceIndex) => {
    const parserEvent = events[parserIndex];
    const nextParserIndex = parserIndexes[sequenceIndex + 1] ?? events.length;
    const helperIndex = firstEventIndex(events, "object-builder-b-helper-c04b98", parserIndex, nextParserIndex);
    const downstreamStartIndex = helperIndex >= 0 ? helperIndex : parserIndex;
    const levelSetupIndex = firstEventIndex(
      events,
      "level-setup-registered-callback",
      downstreamStartIndex,
      nextParserIndex,
    );
    const levelVisualsIndex = firstEventIndex(events, "level-visuals-loader", downstreamStartIndex, nextParserIndex);
    const levelVisualsApplyIndex = firstEventIndex(
      events,
      "level-visuals-apply-processor",
      downstreamStartIndex,
      nextParserIndex,
    );
    const levelVisualsApplyFieldSnapshotIndex = firstMatchingEventIndex(
      events,
      (record) =>
        record?.event === "level-visuals-apply-processor" && levelVisualsApplyFieldSnapshotCount(record) > 0,
      downstreamStartIndex,
      nextParserIndex,
    );
    const levelVisualsSchemaFieldSnapshotIndex = firstMatchingEventIndex(
      events,
      (record) =>
        record?.event === "level-visuals-apply-processor" && levelVisualsSchemaFieldSnapshotCount(record) > 0,
      downstreamStartIndex,
      nextParserIndex,
    );
    const lightfieldIndex = firstEventIndex(
      events,
      "lightfield-profile-loader-candidate",
      downstreamStartIndex,
      nextParserIndex,
    );
    const positionSampleUploadIndex = firstEventIndex(
      events,
      "scene-probe-position-sample-upload",
      downstreamStartIndex,
      nextParserIndex,
    );
    const lightfieldPositionSamplerIndex = firstEventIndex(
      events,
      "scene-probe-lightfield-position-sampler",
      downstreamStartIndex,
      nextParserIndex,
    );
    const lightfieldPositionSamplerLeaveIndex = firstEventIndex(
      events,
      "scene-probe-lightfield-position-sampler-leave",
      lightfieldPositionSamplerIndex >= 0 ? lightfieldPositionSamplerIndex : downstreamStartIndex,
      nextParserIndex,
    );
    const helperEvent = helperIndex >= 0 ? events[helperIndex] : null;
    const levelVisualsEvent = levelVisualsIndex >= 0 ? events[levelVisualsIndex] : null;
    const levelVisualsApplyEvent = levelVisualsApplyIndex >= 0 ? events[levelVisualsApplyIndex] : null;
    const lightfieldEvent = lightfieldIndex >= 0 ? events[lightfieldIndex] : null;
    const positionSampleEvent = positionSampleUploadIndex >= 0 ? events[positionSampleUploadIndex] : null;
    const lightfieldPositionSampleEvent =
      lightfieldPositionSamplerIndex >= 0 ? events[lightfieldPositionSamplerIndex] : null;
    const lightfieldPositionSamplerLeaveEvent =
      lightfieldPositionSamplerLeaveIndex >= 0 ? events[lightfieldPositionSamplerLeaveIndex] : null;
    const key = helperEvent ? keyFromRecord(helperEvent) : "";
    const downstreamEvents = {
      helperIndex,
      levelSetupCallbackIndex: levelSetupIndex,
      levelVisualsLoaderIndex: levelVisualsIndex,
      levelVisualsApplyProcessorIndex: levelVisualsApplyIndex,
      levelVisualsSchemaFieldSnapshotIndex,
      levelVisualsApplyFieldSnapshotIndex,
      lightfieldProfileLoaderIndex: lightfieldIndex,
      sceneProbePositionSampleUploadIndex: positionSampleUploadIndex,
      sceneProbeLightfieldPositionSamplerIndex: lightfieldPositionSamplerIndex,
      sceneProbeLightfieldPositionSamplerLeaveIndex: lightfieldPositionSamplerLeaveIndex,
    };
    const readyForManualReview = Boolean(
      key &&
        helperIndex >= 0 &&
        levelSetupIndex >= 0 &&
        levelVisualsIndex >= 0 &&
        levelVisualsApplyIndex >= 0 &&
        lightfieldIndex >= 0,
    );
    const profileEvidence = buildSequenceProfileEvidence({
      levelVisualsEvent,
      levelVisualsApplyEvent,
      lightfieldEvent,
    });
    const lightProbeEvidence = buildSequenceLightProbeEvidence({
      profileEvidence,
      positionSampleEvent,
      lightfieldPositionSampleEvent,
      lightfieldPositionSamplerLeaveEvent,
    });
    return {
      sequenceIndex,
      parserEventIndex: parserIndex,
      nextParserEventIndex: nextParserIndex < events.length ? nextParserIndex : null,
      parserTimestampMs: parserEvent.timestampMs || "",
      payloadPointer: parserEvent.payloadPointer || "",
      payloadWord0NativeHex: parserEvent.payloadWord0NativeHex || "",
      payloadWord0BigEndianHex: parserEvent.payloadWord0BigEndianHex || "",
      payloadWord1NativeHex: parserEvent.payloadWord1NativeHex || "",
      payloadWord0Recovered: Boolean(wordHexFromObjectBuilderBParser(parserEvent)),
      helperEventIndex: helperIndex >= 0 ? helperIndex : null,
      key,
      keyRecovered: Boolean(key),
      parserToHelperObserved: helperIndex >= 0,
      downstreamEvents,
      profileEvidence,
      lightProbeEvidence,
      readyForManualReview,
      schemaSnapshotReadyForManualReview: readyForManualReview && levelVisualsSchemaFieldSnapshotIndex >= 0,
      fieldRouteSnapshotReadyForManualReview: readyForManualReview && levelVisualsApplyFieldSnapshotIndex >= 0,
      profileEvidenceReadyForManualReview: readyForManualReview && profileEvidence.hasProfileEvidence,
      lightProbeEvidenceReadyForManualReview: readyForManualReview && lightProbeEvidence.profilePositionAndValuesReady,
    };
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run({
  inputPath = defaultInputPath,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const records = readRecords(inputPath);
  const { summary, eventRows } = records ? summarize(records) : { summary: missingCaptureSummary(inputPath), eventRows: [] };
  writeJson(jsonOut, summary);
  writeJson(viewerOut, summary);
  writeTsv(tsvOut, eventRows, [
    "index",
    "timestampMs",
    "event",
    "callerClass",
    "callerKind",
    "callerOffset",
    "callerClassified",
    "key",
    "payloadPointer",
    "payloadWord0NativeHex",
    "payloadWord0BigEndianHex",
    "offset",
    "pc",
    "lr",
    "x0",
    "x1",
    "x2",
    "x3",
  ]);
  return summary;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const summary = run({
      inputPath: optionValue(args, "--input", defaultInputPath),
      jsonOut: optionValue(args, "--json-out", defaultJsonOut),
      viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
      tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    });
    console.log(JSON.stringify(summary.gateEvidence, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  missingCaptureSummary,
  summarize,
  run,
};
