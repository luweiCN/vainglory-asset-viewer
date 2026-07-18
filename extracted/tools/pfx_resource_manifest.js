#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { extractPrintableStringRecords } = require("./cff0_tools");

const defaultEffectResourcePath = "extracted/reports/effect_resource_index.tsv";
const defaultEffectHookManifestPath = "extracted/viewer/effect-hook-runtime-manifest.json";
const defaultNativeParticleRuntimeSchemaPath = "extracted/viewer/native-particle-runtime-schema.json";
const defaultNativeBinaryVersionAuditPath = "extracted/viewer/native-binary-version-audit.json";
const defaultNativeParticleCallbackTableScanPath = "extracted/viewer/native-particle-callback-table-scan.json";
const defaultNativeParticleCallbackSemanticsPath = "extracted/viewer/native-particle-callback-semantics.json";
const defaultNativeParticleFallbackCallbackSemanticsPath =
  "extracted/viewer/native-particle-callback-semantics-android.json";
const defaultViewerOut = "extracted/viewer/effect-pfx-resource-manifest.json";
const defaultTsvOut = "extracted/reports/effect_pfx_resource_manifest.tsv";
const defaultJsonOut = "extracted/reports/effect_pfx_resource_manifest_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => String(row[column] ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function splitList(value) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function uniqSortedNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((left, right) => left - right);
}

function uniqSortedFiniteNumbers(values) {
  return [...new Set((values || []).map((value) => Number(value)).filter(Number.isFinite).map(roundFloat))].sort(
    (left, right) => left - right,
  );
}

function optionStringList(value) {
  const values = Array.isArray(value) ? value : splitList(value);
  return uniq(values.map((item) => String(item || "").trim()));
}

function sortNativeOptionOffset(left, right) {
  const leftNumber = Number.parseInt(String(left).replace(/^0x/i, ""), 16);
  const rightNumber = Number.parseInt(String(right).replace(/^0x/i, ""), 16);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right));
}

function normalizedEffectOptionOffsetValues(offsetValues = {}) {
  if (!offsetValues || typeof offsetValues !== "object" || Array.isArray(offsetValues)) return {};
  const entries = [];
  for (const [offset, rawValues] of Object.entries(offsetValues)) {
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues]).map(Number).filter(Number.isFinite).map(roundFloat);
    if (!values.length) continue;
    entries.push([String(offset), values]);
  }
  entries.sort(([left], [right]) => sortNativeOptionOffset(left, right));
  return Object.fromEntries(entries);
}

const PFX_RUNTIME_HINT_KEYS = ["delaySeconds", "durationSeconds", "sizeScalar", "rotationDegrees"];
const KNOWN_NATIVE_EFFECT_OPTION_OFFSETS = new Set(["0x60", "0x78", "0xb0", "0xc0", "0xd0", "0xd8"]);

function pfxEffectOptionRuntimeHintMatches(offsetValues = {}, surfaceRecords = [], options = {}) {
  const unknownOnly = options.unknownOnly === true;
  const matches = [];
  const seen = new Set();
  for (const offset of Object.keys(offsetValues || {}).sort(sortNativeOptionOffset)) {
    if (unknownOnly && KNOWN_NATIVE_EFFECT_OPTION_OFFSETS.has(String(offset).toLowerCase())) continue;
    const values = (offsetValues[offset] || []).map(Number).filter(Number.isFinite).map(roundFloat);
    if (!values.length) continue;
    for (const record of surfaceRecords || []) {
      const hints = record.runtimeHints || {};
      for (const hintKey of PFX_RUNTIME_HINT_KEYS) {
        const hintValue = Number(hints[hintKey]);
        if (!Number.isFinite(hintValue)) continue;
        const roundedHint = roundFloat(hintValue);
        if (!values.includes(roundedHint)) continue;
        const match = `${offset}:${hintKey}:${roundedHint}@Surface[${record.surfaceIndex}]`;
        if (seen.has(match)) continue;
        seen.add(match);
        matches.push(match);
      }
    }
  }
  return matches;
}

function pfxSurfaceTimelineWindow(surfaceRecords = []) {
  const windows = [];
  for (const record of surfaceRecords || []) {
    const durationSeconds = Number(record?.runtimeHints?.durationSeconds);
    if (!Number.isFinite(durationSeconds)) continue;
    const delaySeconds = Number(record?.runtimeHints?.delaySeconds);
    const startSeconds = Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0);
    const endSeconds = startSeconds + Math.max(durationSeconds, 0.08);
    windows.push({ startSeconds, endSeconds });
  }
  if (!windows.length) return null;
  const startSeconds = Math.min(...windows.map((window) => window.startSeconds));
  const endSeconds = Math.max(...windows.map((window) => window.endSeconds));
  return {
    startSeconds: roundFloat(startSeconds),
    endSeconds: roundFloat(endSeconds),
    durationSeconds: roundFloat(endSeconds - startSeconds),
  };
}

function pfxAbsoluteTimelineWindow(surfaceTimelineWindow, startSeconds) {
  const nativeStartSeconds = Number(startSeconds);
  if (!surfaceTimelineWindow || !Number.isFinite(nativeStartSeconds) || nativeStartSeconds < 0) return null;
  return {
    startSeconds: roundFloat(nativeStartSeconds + surfaceTimelineWindow.startSeconds),
    endSeconds: roundFloat(nativeStartSeconds + surfaceTimelineWindow.endSeconds),
    durationSeconds: surfaceTimelineWindow.durationSeconds,
  };
}

function normalizePfxReference(value) {
  const match = String(value || "").match(/(?:Effects|Characters|Models|Textures|Environment|UI|Menus|Structures)\/[^\0\r\n]+/);
  return match ? match[0] : "";
}

function referenceKind(relativePath) {
  if (/\.shadergraph$/i.test(relativePath)) return "shadergraph";
  if (/\.pfx$/i.test(relativePath)) return "pfx";
  if (/\.mesh$/i.test(relativePath)) return "mesh";
  if (/\.png$|\.pvr$|\.ktx$|\.dds$/i.test(relativePath)) return "texture";
  if (/\.anim$/i.test(relativePath)) return "animation";
  if (/\.skeleton$/i.test(relativePath)) return "skeleton";
  return "";
}

function surfaceIndex(relativePath) {
  const match = String(relativePath || "").match(/\.Surface\[(\d+)\]\.shadergraph$/i);
  return match ? Number(match[1]) : null;
}

function readCString(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset >= buffer.length) return "";
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  return buffer.toString("utf8", offset, end);
}

function extractPfxReferences(buffer) {
  const records = [];
  const seen = new Set();
  for (const stringRecord of extractPrintableStringRecords(buffer, 4)) {
    const relativePath = normalizePfxReference(stringRecord.value);
    if (!relativePath) continue;
    const kind = referenceKind(relativePath);
    if (!kind) continue;
    const key = `${stringRecord.offset}\t${relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      offset: stringRecord.offset,
      raw: stringRecord.value,
      relativePath,
      kind,
      surfaceIndex: surfaceIndex(relativePath),
    });
  }
  return records;
}

const PFX_NATIVE_EMITTER_COUNT_OFFSET = 0x18;
const PFX_NATIVE_EMITTER_FIRST_RECORD_OFFSET = 0x19;
const PFX_NATIVE_EMITTER_PATH_MARKER_OFFSET = 0x27;
const PFX_NATIVE_EMITTER_PATH_OFFSET = 0x28;
const PFX_NATIVE_EMITTER_BASE_LENGTH = 0xe4;
const PFX_NATIVE_EMITTER_CHILD_COUNT_OFFSET = 0xa8;
const PFX_NATIVE_EMITTER_ATTACHMENT_COUNT_A_OFFSET = 0xa9;
const PFX_NATIVE_EMITTER_ATTACHMENT_COUNT_B_OFFSET = 0xaa;
const PFX_NATIVE_EMITTER_ATTACHMENT_LENGTH = 0x18;
const PFX_NATIVE_EMITTER_CHILD_LENGTH = 0x7a;
const PFX_CHILD_EMITTER_CALLBACK_MAPPINGS = [
  { relativeOffset: 0x19, runtimeOffset: "0x50", semantic: "childCallback0", callbackResolver: true },
  { relativeOffset: 0x21, runtimeOffset: "0x58", semantic: "childCallback1", callbackResolver: true },
  { relativeOffset: 0x29, runtimeOffset: "0x60", semantic: "childCallback2", callbackResolver: true },
  { relativeOffset: 0x31, runtimeOffset: "0x68", semantic: "childCallback3", callbackResolver: true },
  {
    relativeOffset: 0x39,
    runtimeOffset: "0x70",
    semantic: "initialSizeCallback",
    callbackResolver: true,
    targetArrayOffset: "0x30000",
    targetArraySemantic: "size",
    callbackOutputComponents: 2,
    updateOperation: "assign-initial-size",
  },
  { relativeOffset: 0x41, runtimeOffset: "0x78", semantic: "childCallback5", callbackResolver: true },
  { relativeOffset: 0x49, runtimeOffset: "0x80", semantic: "childCallback6", callbackResolver: true },
  { relativeOffset: 0x51, runtimeOffset: "0x88", semantic: "childCallback7", callbackResolver: true },
  { relativeOffset: 0x59, runtimeOffset: "0x90", semantic: "childCallback8", callbackResolver: true },
  { relativeOffset: 0x61, runtimeOffset: "0x98", semantic: "childCallback9", callbackResolver: true, modes: [2] },
  { relativeOffset: 0x69, runtimeOffset: "0xa0", semantic: "childCallback10", callbackResolver: true, modes: [2] },
  { relativeOffset: 0x71, runtimeOffset: "0xa8", semantic: "childCallback11", callbackResolver: true, modes: [2] },
];

function pfxPathSlotPrefix(markerByte) {
  return markerByte === 0x3f ? "?" : "";
}

function extractPfxNativeEmitterRecords(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= PFX_NATIVE_EMITTER_FIRST_RECORD_OFFSET) return [];
  const recordCount = buffer[PFX_NATIVE_EMITTER_COUNT_OFFSET] || 0;
  if (!recordCount) return [];
  const records = [];
  let recordStart = PFX_NATIVE_EMITTER_FIRST_RECORD_OFFSET;
  for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
    const pathOffset = recordStart + PFX_NATIVE_EMITTER_PATH_OFFSET;
    const pathMarkerOffset = recordStart + PFX_NATIVE_EMITTER_PATH_MARKER_OFFSET;
    if (pathOffset >= buffer.length || pathMarkerOffset >= buffer.length) return [];
    const relativePath = normalizePfxReference(readCString(buffer, pathOffset));
    const kind = referenceKind(relativePath);
    if (!relativePath || !kind) return [];
    const childCount = buffer[recordStart + PFX_NATIVE_EMITTER_CHILD_COUNT_OFFSET] || 0;
    const attachmentCountA = buffer[recordStart + PFX_NATIVE_EMITTER_ATTACHMENT_COUNT_A_OFFSET] || 0;
    const attachmentCountB = buffer[recordStart + PFX_NATIVE_EMITTER_ATTACHMENT_COUNT_B_OFFSET] || 0;
    const recordEnd =
      recordStart +
      PFX_NATIVE_EMITTER_BASE_LENGTH +
      (attachmentCountA + attachmentCountB) * PFX_NATIVE_EMITTER_ATTACHMENT_LENGTH +
      childCount * PFX_NATIVE_EMITTER_CHILD_LENGTH;
    if (recordEnd <= recordStart || recordEnd > buffer.length) return [];
    const markerByte = buffer[pathMarkerOffset] || 0;
    records.push({
      recordLayout: "native-emitter-record",
      recordIndex,
      recordStart,
      recordEnd,
      recordLength: recordEnd - recordStart,
      pathMarkerOffset,
      pathMarkerByte: markerByte,
      pathSlotPrefix: pfxPathSlotPrefix(markerByte),
      pathOffset,
      pathSlotLength: 128,
      relativePath,
      kind,
      surfaceIndex: surfaceIndex(relativePath),
      childCount,
      attachmentCountA,
      attachmentCountB,
    });
    recordStart = recordEnd;
  }
  return records;
}

function extractPfxIntrinsicEffectTokens(buffer) {
  const tokens = [];
  const seen = new Set();
  for (const stringRecord of extractPrintableStringRecords(buffer, 4)) {
    const matches = String(stringRecord.value || "").match(/\bEffect_[A-Za-z0-9_]+\b/g) || [];
    for (const token of matches) {
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens.sort();
}

function hexBytes(buffer) {
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function roundFloat(value) {
  return Math.round(value * 10000) / 10000;
}

function candidatePfxFloatSamples(buffer, recordStart, recordEnd) {
  const samples = [];
  const firstOffset = 145;
  const lastOffset = Math.min(345, recordEnd - recordStart - 4);
  for (let relativeOffset = firstOffset; relativeOffset <= lastOffset; relativeOffset += 4) {
    const value = buffer.readFloatLE(recordStart + relativeOffset);
    if (!Number.isFinite(value) || Math.abs(value) < 0.00001 || Math.abs(value) > 10000) continue;
    samples.push({ relativeOffset, value: roundFloat(value) });
  }
  return samples;
}

function pfxFloatSampleValue(samples, relativeOffset) {
  const sample = (samples || []).find((item) => item.relativeOffset === relativeOffset);
  return Number.isFinite(sample?.value) ? sample.value : null;
}

function pfxFloatSampleInRange(samples, relativeOffset, min, max) {
  const value = pfxFloatSampleValue(samples, relativeOffset);
  return value !== null && value >= min && value <= max ? value : null;
}

function pfxRotationHint(samples) {
  for (const relativeOffset of [217, 221, 225]) {
    const value = pfxFloatSampleInRange(samples, relativeOffset, -360, 360);
    if (value !== null) return { relativeOffset, value };
  }
  return null;
}

function pfxSurfaceRuntimeHints(sampledFloats) {
  const hints = {};
  const timingSourceOffsets = {};
  const delaySeconds = pfxFloatSampleInRange(sampledFloats, 149, 0, 10);
  if (delaySeconds !== null) {
    hints.delaySeconds = delaySeconds;
    timingSourceOffsets.delaySeconds = 149;
  }
  const durationSeconds = pfxFloatSampleInRange(sampledFloats, 209, 0.00001, 10);
  if (durationSeconds !== null) {
    hints.durationSeconds = durationSeconds;
    timingSourceOffsets.durationSeconds = 209;
  }
  const sizeScalar = pfxFloatSampleInRange(sampledFloats, 213, -12, 12);
  if (sizeScalar !== null && Math.abs(sizeScalar) >= 0.00001) {
    hints.sizeScalar = sizeScalar;
    timingSourceOffsets.sizeScalar = 213;
  }
  const rotation = pfxRotationHint(sampledFloats);
  if (rotation) {
    hints.rotationDegrees = rotation.value;
    timingSourceOffsets.rotationDegrees = rotation.relativeOffset;
  }
  if (Object.keys(timingSourceOffsets).length) hints.timingSourceOffsets = timingSourceOffsets;
  return hints;
}

function pfxSurfaceParameterProfile(sampledFloats, runtimeHints = {}) {
  const semanticSlots = [];
  const lifecycleOffsets = [];
  const transformOffsets = [];

  function push(name, relativeOffset, value, group) {
    semanticSlots.push({ name, relativeOffset, value });
    if (group === "lifecycle") lifecycleOffsets.push(relativeOffset);
    if (group === "transform") transformOffsets.push(relativeOffset);
  }

  const sourceOffsets = runtimeHints.timingSourceOffsets || {};
  if (Number.isFinite(runtimeHints.delaySeconds)) {
    push("delaySeconds", sourceOffsets.delaySeconds ?? 149, runtimeHints.delaySeconds, "lifecycle");
  }

  const negativeOneSentinel = pfxFloatSampleValue(sampledFloats, 153);
  if (negativeOneSentinel === -1) push("negativeOneSentinel", 153, -1, "lifecycle");

  if (Number.isFinite(runtimeHints.durationSeconds)) {
    push("durationSeconds", sourceOffsets.durationSeconds ?? 209, runtimeHints.durationSeconds, "lifecycle");
  }
  if (Number.isFinite(runtimeHints.sizeScalar)) {
    push("sizeScalar", sourceOffsets.sizeScalar ?? 213, runtimeHints.sizeScalar, "transform");
  }
  if (Number.isFinite(runtimeHints.rotationDegrees)) {
    push("rotationDegrees", sourceOffsets.rotationDegrees ?? 217, runtimeHints.rotationDegrees, "transform");
  }

  const hasLifecycle = lifecycleOffsets.length > 0;
  const hasTransform = transformOffsets.length > 0;
  const evidenceClass = hasLifecycle && hasTransform
    ? "lifecycle-transform"
    : hasLifecycle
      ? "lifecycle"
      : hasTransform
        ? "transform"
        : sampledFloats.length
          ? "sampled"
          : "";

  return {
    evidenceClass,
    lifecycleOffsets,
    transformOffsets,
    semanticSlots,
    sampledOffsetCount: sampledFloats.length,
  };
}

function pfxShapeSizeCallbackSlot(emitterRuntimeProfile = {}) {
  if (!emitterRuntimeProfile || typeof emitterRuntimeProfile !== "object") return null;
  return (
    (emitterRuntimeProfile.semanticSlots || []).find(
      (slot) => slot?.name === "sizeDeltaCallback" || slot?.targetArraySemantic === "size",
    ) || null
  );
}

function pfxShapeInitialSizeCallbackSlot(childEmitterRecords = []) {
  const slots = [];
  for (const childRecord of childEmitterRecords || []) {
    const slot = (childRecord?.runtimeProfile?.semanticSlots || []).find(
      (item) => item?.name === "initialSizeCallback" || (item?.runtimeOffset === "0x70" && item?.targetArraySemantic === "size"),
    );
    if (slot) slots.push(slot);
  }
  return slots.find((slot) => pfxRenderableSizeFromCallback(slot)) || slots[0] || null;
}

function pfxRenderableSizeFromRandomRange(randomMinValue, randomMaxValue, sourcePrefix, slot = null) {
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue >= 0.25 &&
    randomMinValue <= 4 &&
    randomMaxValue > 0 &&
    randomMaxValue <= 12
  ) {
    return {
      renderSizeScalar: roundFloat(randomMinValue),
      renderSizeSource: `${sourcePrefix}-random-range-min`,
    };
  }
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue >= 0 &&
    randomMaxValue >= 0.25 &&
    randomMaxValue <= (pfxCallbackSlotAcceptsLargeSizeConstant(slot) ? 5 : 4)
  ) {
    return {
      renderSizeScalar: roundFloat(randomMaxValue),
      renderSizeSource: `${sourcePrefix}-random-range-max`,
    };
  }
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue >= 0 &&
    randomMaxValue >= randomMinValue &&
    randomMaxValue > 0 &&
    randomMaxValue < 0.25 &&
    pfxCallbackSlotAcceptsLargeSizeConstant(slot)
  ) {
    return {
      renderSizeScalar: roundFloat(randomMaxValue),
      renderSizeSource: `${sourcePrefix}-tiny-random-range-max`,
    };
  }
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue >= 4 &&
    randomMaxValue >= randomMinValue &&
    randomMaxValue <= 30
  ) {
    return {
      renderSizeScalar: roundFloat(randomMinValue),
      renderSizeSource: `${sourcePrefix}-random-range-large-min`,
    };
  }
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue >= 0 &&
    randomMaxValue > 30 &&
    randomMaxValue <= 64 &&
    slot?.targetArraySemantic === "size" &&
    slot.updateOperation === "assign-initial-size"
  ) {
    return {
      renderSizeScalar: roundFloat(randomMaxValue),
      renderSizeSource: `${sourcePrefix}-initial-random-range-large-max`,
    };
  }
  if (
    Number.isFinite(randomMinValue) &&
    Number.isFinite(randomMaxValue) &&
    randomMinValue < 0 &&
    randomMaxValue > 0 &&
    pfxCallbackSlotAcceptsLargeSizeConstant(slot)
  ) {
    const maxAbsValue = Math.max(Math.abs(randomMinValue), Math.abs(randomMaxValue));
    if (maxAbsValue > 0 && maxAbsValue <= 30) {
      return {
        renderSizeScalar: roundFloat(maxAbsValue),
        renderSizeSource: `${sourcePrefix}-signed-random-range-abs-max`,
      };
    }
  }
  return null;
}

function pfxRenderableSizeFromCurveRange(curveMinValue, curveMaxValue, sourcePrefix) {
  if (
    Number.isFinite(curveMinValue) &&
    Number.isFinite(curveMaxValue) &&
    curveMinValue >= 0 &&
    curveMaxValue > 0 &&
    curveMaxValue <= 512
  ) {
    return {
      renderSizeScalar: roundFloat(curveMaxValue),
      renderSizeSource: `${sourcePrefix}-curve-range-max`,
    };
  }
  return null;
}

function pfxRenderableSizeFromCurveBoundaryValues(boundaryValues, multiplier, sourcePrefix, slot = null) {
  const values = (Array.isArray(boundaryValues) ? boundaryValues : []).map(Number).filter(Number.isFinite);
  const scale = Number(multiplier);
  if (!values.length || !Number.isFinite(scale)) return null;
  const scaledValues = values.map((value) => roundFloat(value * scale)).filter(Number.isFinite);
  if (!scaledValues.length) return null;
  const minValue = Math.min(...scaledValues);
  const maxValue = Math.max(...scaledValues);
  const acceptsSignedSizeRange = minValue < 0 && pfxCallbackSlotAcceptsLargeSizeConstant(slot);
  if ((minValue >= 0 || acceptsSignedSizeRange) && maxValue > 0 && maxValue <= 30) {
    return {
      renderSizeScalar: roundFloat(maxValue),
      renderSizeSource: `${sourcePrefix}-curve-boundary-max`,
    };
  }
  return null;
}

function pfxCallbackCurveComponentMatchesSlot(slot, sourcePrefix) {
  const field =
    sourcePrefix === "current-callback"
      ? "resolverCurrentCallbackCurveOutputComponentIndex"
      : "resolverFallbackCallbackCurveOutputComponentIndex";
  const componentIndex = Number(slot?.[field]);
  if (!Number.isFinite(componentIndex)) return true;
  const callbackOutputComponents = Number(slot?.callbackOutputComponents);
  if (!Number.isFinite(callbackOutputComponents) || callbackOutputComponents <= 0) return componentIndex === 0;
  return componentIndex >= 0 && componentIndex < callbackOutputComponents;
}

function pfxCallbackSlotAcceptsLargeSizeConstant(slot) {
  if (slot?.targetArraySemantic !== "size") return false;
  return slot.updateOperation === "assign-initial-size" || slot.updateOperation === "add-delta-to-size-clamped";
}

function pfxRenderableSizeFromConstantValue(value, sourcePrefix, slot) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (size <= 12) {
    return {
      renderSizeScalar: roundFloat(size),
      renderSizeSource: `${sourcePrefix}-constant`,
    };
  }
  if (size <= 30 && pfxCallbackSlotAcceptsLargeSizeConstant(slot)) {
    return {
      renderSizeScalar: roundFloat(size),
      renderSizeSource: `${sourcePrefix}-large-constant`,
    };
  }
  if (sourcePrefix === "current-callback" && size <= 64 && pfxCallbackSlotAcceptsLargeSizeConstant(slot)) {
    return {
      renderSizeScalar: roundFloat(size),
      renderSizeSource: `${sourcePrefix}-large-constant`,
    };
  }
  return null;
}

function pfxRenderableSizeFromVectorValue(value, sourcePrefix, slot) {
  const size = Number((Array.isArray(value) ? value : [])[0]);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (size <= 12) {
    return {
      renderSizeScalar: roundFloat(size),
      renderSizeSource: `${sourcePrefix}-vector`,
    };
  }
  if (size <= 30 && pfxCallbackSlotAcceptsLargeSizeConstant(slot)) {
    return {
      renderSizeScalar: roundFloat(size),
      renderSizeSource: `${sourcePrefix}-large-vector`,
    };
  }
  return null;
}

function pfxCallbackSlotHasEncryptedCurrentData(slot) {
  return (
    /encrypted-range/i.test(slot?.resolverCurrentCallbackPattern16ReadStatus || "") ||
    /encrypted-range/i.test(slot?.resolverCurrentCallbackCurveTableReadStatus || "")
  );
}

function pfxCallbackSlotAllowsFallbackRenderableSize(slot) {
  return !pfxCallbackSlotHasEncryptedCurrentData(slot);
}

function pfxRenderableSizeFromCallback(slot) {
  const currentConstantSize = pfxRenderableSizeFromConstantValue(slot?.resolverCurrentCallbackConstantValue, "current-callback", slot);
  if (currentConstantSize) return currentConstantSize;
  const currentVectorSize = pfxRenderableSizeFromVectorValue(slot?.resolverCurrentCallbackVectorValue, "current-callback", slot);
  if (currentVectorSize) return currentVectorSize;
  const fallbackRenderableSizeAllowed = pfxCallbackSlotAllowsFallbackRenderableSize(slot);
  if (fallbackRenderableSizeAllowed) {
    const fallbackConstantSize = pfxRenderableSizeFromConstantValue(slot?.resolverFallbackCallbackConstantValue, "fallback-callback", slot);
    if (fallbackConstantSize) return fallbackConstantSize;
    const fallbackVectorSize = pfxRenderableSizeFromVectorValue(slot?.resolverFallbackCallbackVectorValue, "fallback-callback", slot);
    if (fallbackVectorSize) return fallbackVectorSize;
    const fallbackFirstComponentValue = Number(slot?.resolverFallbackCallbackFirstComponentValue);
    if (Number.isFinite(fallbackFirstComponentValue) && fallbackFirstComponentValue > 0 && fallbackFirstComponentValue <= 12) {
      return {
        renderSizeScalar: roundFloat(fallbackFirstComponentValue),
        renderSizeSource: "fallback-callback-first-component",
      };
    }
  }
  const pattern16Values = (slot?.resolverCurrentCallbackPattern16FloatValues || []).map(Number).filter(Number.isFinite);
  const pattern16Value = Number(pattern16Values[0]);
  if (Number.isFinite(pattern16Value) && pattern16Value > 0 && pattern16Value <= 12) {
    return {
      renderSizeScalar: roundFloat(pattern16Value),
      renderSizeSource: "current-callback-pattern16-float",
    };
  }
  const firstComponentValue = Number(slot?.resolverCurrentCallbackFirstComponentValue);
  if (Number.isFinite(firstComponentValue) && firstComponentValue > 0 && firstComponentValue <= 12) {
    return {
      renderSizeScalar: roundFloat(firstComponentValue),
      renderSizeSource: "current-callback-first-component",
    };
  }
  const randomMinValue = Number(slot?.resolverCurrentCallbackRandomMinValue);
  const randomMaxValue = Number(slot?.resolverCurrentCallbackRandomMaxValue);
  const currentRandomSize = pfxRenderableSizeFromRandomRange(randomMinValue, randomMaxValue, "current-callback", slot);
  if (currentRandomSize) return currentRandomSize;
  if (fallbackRenderableSizeAllowed) {
    const fallbackRandomSize = pfxRenderableSizeFromRandomRange(
      Number(slot?.resolverFallbackCallbackRandomMinValue),
      Number(slot?.resolverFallbackCallbackRandomMaxValue),
      "fallback-callback",
      slot,
    );
    if (fallbackRandomSize) return fallbackRandomSize;
  }
  const currentCurveSize = pfxRenderableSizeFromCurveRange(
    Number(slot?.resolverCurrentCallbackCurveMinValue),
    Number(slot?.resolverCurrentCallbackCurveMaxValue),
    "current-callback",
  );
  if (currentCurveSize && pfxCallbackCurveComponentMatchesSlot(slot, "current-callback")) return currentCurveSize;
  if (fallbackRenderableSizeAllowed) {
    const fallbackCurveSize = pfxRenderableSizeFromCurveRange(
      Number(slot?.resolverFallbackCallbackCurveMinValue),
      Number(slot?.resolverFallbackCallbackCurveMaxValue),
      "fallback-callback",
    );
    if (fallbackCurveSize && pfxCallbackCurveComponentMatchesSlot(slot, "fallback-callback")) return fallbackCurveSize;
  }
  const currentCurveBoundarySize = pfxRenderableSizeFromCurveBoundaryValues(
    slot?.resolverCurrentCallbackCurveBoundaryValues,
    slot?.resolverCurrentCallbackCurveTableMultiplier,
    "current-callback",
    slot,
  );
  if (currentCurveBoundarySize && pfxCallbackCurveComponentMatchesSlot(slot, "current-callback")) {
    return currentCurveBoundarySize;
  }
  if (fallbackRenderableSizeAllowed) {
    const fallbackCurveBoundarySize = pfxRenderableSizeFromCurveBoundaryValues(
      slot?.resolverFallbackCallbackCurveBoundaryValues,
      slot?.resolverFallbackCallbackCurveTableMultiplier,
      "fallback-callback",
      slot,
    );
    if (fallbackCurveBoundarySize && pfxCallbackCurveComponentMatchesSlot(slot, "fallback-callback")) {
      return fallbackCurveBoundarySize;
    }
  }
  const packedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
    const candidateValue = Number(candidate?.value);
    return Number.isFinite(candidateValue) && candidateValue >= 0.25 && candidateValue <= 4;
  });
  if (packedCandidates.length === 1) {
    return {
      renderSizeScalar: roundFloat(Number(packedCandidates[0].value)),
      renderSizeSource: "packed-literal-float-window",
    };
  }
  const positivePackedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
    const candidateValue = Number(candidate?.value);
    return Number.isFinite(candidateValue) && candidateValue > 0 && candidateValue <= 30;
  });
  const tinyPackedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
    const candidateValue = Number(candidate?.value);
    return Number.isFinite(candidateValue) && candidateValue > 0 && candidateValue < 0.25;
  });
  if (
    tinyPackedCandidates.length === 1 &&
    positivePackedCandidates.length === 1 &&
    pfxCallbackSlotAcceptsLargeSizeConstant(slot)
  ) {
    return {
      renderSizeScalar: roundFloat(Number(tinyPackedCandidates[0].value)),
      renderSizeSource: "packed-literal-tiny-float-window",
    };
  }
  const largePackedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
    const candidateValue = Number(candidate?.value);
    return Number.isFinite(candidateValue) && candidateValue > 4 && candidateValue <= 30;
  });
  if (
    largePackedCandidates.length !== 1 ||
    positivePackedCandidates.length !== 1 ||
    !pfxCallbackSlotAcceptsLargeSizeConstant(slot)
  ) {
    const veryLargePackedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
      const candidateValue = Number(candidate?.value);
      return Number.isFinite(candidateValue) && candidateValue > 30 && candidateValue <= 100;
    });
    const safePositivePackedCandidates = (slot?.resolverPackedLiteralFloatCandidates || []).filter((candidate) => {
      const candidateValue = Number(candidate?.value);
      return Number.isFinite(candidateValue) && candidateValue > 0 && candidateValue <= 100;
    });
    if (
      veryLargePackedCandidates.length === 1 &&
      safePositivePackedCandidates.length === 1 &&
      pfxCallbackSlotAcceptsLargeSizeConstant(slot)
    ) {
      return {
        renderSizeScalar: roundFloat(Number(veryLargePackedCandidates[0].value)),
        renderSizeSource: "packed-literal-very-large-float-window",
      };
    }
    return null;
  }
  return {
    renderSizeScalar: roundFloat(Number(largePackedCandidates[0].value)),
    renderSizeSource: "packed-literal-float-window",
  };
}

function pfxShapeCallbackSummary(slot) {
  if (!slot) return null;
  const summary = {
    relativeOffset: slot.relativeOffset,
    runtimeOffset: slot.runtimeOffset,
    targetArrayOffset: slot.targetArrayOffset,
    targetArraySemantic: slot.targetArraySemantic,
    updateOperation: slot.updateOperation,
    resolverResolutionStatus: slot.resolverResolutionStatus,
    resolverCurrentCallbackAddress: slot.resolverCurrentCallbackAddress,
    resolverCurrentCallbackSemanticClass: slot.resolverCurrentCallbackSemanticClass,
    resolverCurrentCallbackEvidenceSource: slot.resolverCurrentCallbackEvidenceSource,
    resolverCurrentCallbackDependencyFlags: slot.resolverCurrentCallbackDependencyFlags,
    resolverCurrentCallbackVectorValue: slot.resolverCurrentCallbackVectorValue,
    resolverCurrentCallbackOutputStore: /curve-table/i.test(slot.resolverCurrentCallbackOutputStore || "")
      ? slot.resolverCurrentCallbackOutputStore
      : undefined,
    resolverPackedLiteralFloatCandidates: slot.resolverPackedLiteralFloatCandidates,
    resolverCurrentCallbackPattern16SourceAddress: slot.resolverCurrentCallbackPattern16SourceAddress,
    resolverCurrentCallbackPattern16FloatValues: slot.resolverCurrentCallbackPattern16FloatValues,
    resolverCurrentCallbackPattern16ReadStatus: slot.resolverCurrentCallbackPattern16ReadStatus,
    resolverCurrentCallbackFirstComponentValue: slot.resolverCurrentCallbackFirstComponentValue,
    resolverCurrentCallbackCurveTableSourceAddress: slot.resolverCurrentCallbackCurveTableSourceAddress,
    resolverCurrentCallbackCurveTableReadStatus: slot.resolverCurrentCallbackCurveTableReadStatus,
    resolverCurrentCallbackCurveTableSampleCount: slot.resolverCurrentCallbackCurveTableSampleCount,
    resolverCurrentCallbackCurveTableMultiplier: slot.resolverCurrentCallbackCurveTableMultiplier,
    resolverCurrentCallbackCurveOutputComponentIndex: slot.resolverCurrentCallbackCurveOutputComponentIndex,
    resolverCurrentCallbackCurveBoundaryValues: slot.resolverCurrentCallbackCurveBoundaryValues,
    resolverCurrentCallbackCurveMinValue: slot.resolverCurrentCallbackCurveMinValue,
    resolverCurrentCallbackCurveMaxValue: slot.resolverCurrentCallbackCurveMaxValue,
    resolverFallbackCallbackAddress: slot.resolverFallbackCallbackAddress,
    resolverFallbackCallbackSemanticClass: slot.resolverFallbackCallbackSemanticClass,
    resolverFallbackCallbackEvidenceSource: slot.resolverFallbackCallbackEvidenceSource,
    resolverFallbackCallbackDependencyFlags: slot.resolverFallbackCallbackDependencyFlags,
    resolverFallbackCallbackConstantValue: slot.resolverFallbackCallbackConstantValue,
    resolverFallbackCallbackVectorValue: slot.resolverFallbackCallbackVectorValue,
    resolverFallbackCallbackFirstComponentValue: slot.resolverFallbackCallbackFirstComponentValue,
    resolverFallbackCallbackConstantSource: slot.resolverFallbackCallbackConstantSource,
    resolverFallbackCallbackCurveTableSourceAddress: slot.resolverFallbackCallbackCurveTableSourceAddress,
    resolverFallbackCallbackCurveTableSampleCount: slot.resolverFallbackCallbackCurveTableSampleCount,
    resolverFallbackCallbackCurveTableMultiplier: slot.resolverFallbackCallbackCurveTableMultiplier,
    resolverFallbackCallbackCurveOutputComponentIndex: slot.resolverFallbackCallbackCurveOutputComponentIndex,
    resolverFallbackCallbackCurveBoundaryValues: slot.resolverFallbackCallbackCurveBoundaryValues,
    resolverFallbackCallbackCurveMinValue: slot.resolverFallbackCallbackCurveMinValue,
    resolverFallbackCallbackCurveMaxValue: slot.resolverFallbackCallbackCurveMaxValue,
    resolverCurrentCallbackRandomMinValue: slot.resolverCurrentCallbackRandomMinValue,
    resolverCurrentCallbackRandomMaxValue: slot.resolverCurrentCallbackRandomMaxValue,
    resolverFallbackCallbackRandomMinValue: slot.resolverFallbackCallbackRandomMinValue,
    resolverFallbackCallbackRandomMaxValue: slot.resolverFallbackCallbackRandomMaxValue,
  };
  if (Number.isFinite(slot.resolverCurrentCallbackConstantValue)) {
    summary.resolverCurrentCallbackConstantValue = slot.resolverCurrentCallbackConstantValue;
  }
  for (const [key, value] of Object.entries(summary)) {
    if (value === undefined || value === "") delete summary[key];
  }
  return summary;
}

function pfxSurfaceShapeProfile(prelude = {}, emitterRuntimeProfile = {}, childEmitterRecords = []) {
  if (prelude.renderFamily !== "area") return null;
  const sizeSlot = pfxShapeSizeCallbackSlot(emitterRuntimeProfile);
  const initialSizeSlot = pfxShapeInitialSizeCallbackSlot(childEmitterRecords);
  if (!sizeSlot && !initialSizeSlot) return null;

  const renderSize = pfxRenderableSizeFromCallback(sizeSlot) || pfxRenderableSizeFromCallback(initialSizeSlot);
  return {
    evidenceClass: sizeSlot ? "emitter-size-callback" : "emitter-initial-size-callback",
    ...(sizeSlot ? { sizeCallback: pfxShapeCallbackSummary(sizeSlot) } : {}),
    ...(initialSizeSlot ? { initialSizeCallback: pfxShapeCallbackSummary(initialSizeSlot) } : {}),
    ...(renderSize || {}),
  };
}

const PFX_VARIANT_KEY_IGNORED_TOKENS = new Set([
  "s1",
  "s2",
  "s3",
  "t1",
  "t2",
  "t3",
  "def",
  "default",
]);

function pfxVariantSurfaceTokenKey(relativePath = "", surfaceIndex = null) {
  if (!Number.isInteger(Number(surfaceIndex))) return "";
  const fileName = path.basename(String(relativePath || ""), ".pfx");
  const tokens = fileName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !PFX_VARIANT_KEY_IGNORED_TOKENS.has(token) && !/^skin\d+$/.test(token));
  if (tokens.length < 2) return "";
  return `${tokens.join("|")}#${Number(surfaceIndex)}`;
}

function pfxSurfaceRenderSizeScalar(record) {
  const value = Number(record?.shapeProfile?.renderSizeScalar);
  return Number.isFinite(value) ? value : null;
}

function applyVariantSiblingSurfaceSizeEvidence(items = []) {
  const evidenceByKey = new Map();
  for (const item of items || []) {
    for (const record of item.surfaceRecords || []) {
      if (record?.prelude?.renderFamily !== "area") continue;
      const renderSize = pfxSurfaceRenderSizeScalar(record);
      if (renderSize === null) continue;
      const key = pfxVariantSurfaceTokenKey(item.relativePath, record.surfaceIndex);
      if (!key) continue;
      const entries = evidenceByKey.get(key) || [];
      entries.push({ relativePath: item.relativePath, renderSize });
      evidenceByKey.set(key, entries);
    }
  }

  for (const item of items || []) {
    for (const record of item.surfaceRecords || []) {
      if (record?.prelude?.renderFamily !== "area") continue;
      if (!record.shapeProfile || pfxSurfaceRenderSizeScalar(record) !== null) continue;
      const key = pfxVariantSurfaceTokenKey(item.relativePath, record.surfaceIndex);
      if (!key) continue;
      const siblingEvidence = (evidenceByKey.get(key) || []).filter((entry) => entry.relativePath !== item.relativePath);
      const uniqueSizes = uniqSortedFiniteNumbers(siblingEvidence.map((entry) => entry.renderSize));
      if (uniqueSizes.length !== 1) continue;
      record.shapeProfile.renderSizeScalar = uniqueSizes[0];
      record.shapeProfile.renderSizeSource = "variant-sibling-surface-size";
      record.shapeProfile.renderSizeEvidencePath = siblingEvidence.map((entry) => entry.relativePath).sort()[0] || "";
    }
  }
}

function pfxEmitterRuntimeMappings(nativeParticleRuntimeSchema = {}) {
  return (nativeParticleRuntimeSchema.items || [])
    .filter((item) => item.recordKind === "pfx-emitter-record" && item.pfxOffset && item.semantic)
    .map((item) => ({
      pfxOffset: String(item.pfxOffset),
      runtimeOffset: String(item.runtimeOffset || ""),
      semantic: String(item.semantic || ""),
      relativeOffset: Number.parseInt(String(item.pfxOffset).replace(/^0x/i, ""), 16),
    }))
    .filter((item) => Number.isInteger(item.relativeOffset))
    .sort((left, right) => left.relativeOffset - right.relativeOffset || left.semantic.localeCompare(right.semantic));
}

function pfxEmitterCallbackUpdateMappings(nativeParticleRuntimeSchema = {}) {
  const mappings = new Map();
  for (const item of nativeParticleRuntimeSchema.items || []) {
    if (item.recordKind !== "particle-callback-update" || !item.runtimeOffset || !item.semantic) continue;
    const key = `${item.runtimeOffset}:${item.semantic}`;
    mappings.set(key, {
      targetArrayOffset: item.targetArrayOffset || "",
      targetArraySemantic: item.targetArraySemantic || "",
      callbackOutputComponents: item.callbackOutputComponents || item.components || "",
      updateOperation: item.updateOperation || "",
      updateFunction: item.updateFunction || item.name || "",
    });
  }
  return mappings;
}

function pfxResolverTableCompatibilityStatus(nativeBinaryVersionAudit = {}) {
  const summary = nativeBinaryVersionAudit.summary || {};
  if (!summary.entries) return "";
  if (summary.crossBuildReferences) return "cross-build-reference";
  if (summary.missingEvidence) return "missing-evidence";
  if (summary.exactBuilds) return "exact-build";
  return "";
}

function pfxEmitterCallbackResolver(nativeParticleRuntimeSchema = {}, nativeBinaryVersionAudit = {}) {
  const resolver = (nativeParticleRuntimeSchema.items || []).find(
    (item) => item.recordKind === "particle-callback-resolver" && item.resolverFunction,
  );
  if (!resolver) return null;
  return {
    resolverFunction: resolver.resolverFunction,
    resolverTableBase: resolver.tableBase || "",
    resolverPointerBase: resolver.pointerBase || "",
    resolverTableCompatibilityStatus: pfxResolverTableCompatibilityStatus(nativeBinaryVersionAudit),
  };
}

function pfxCurrentCallbackTableLookup(nativeParticleCallbackTableScan = {}) {
  const lookup = new Map();
  for (const table of nativeParticleCallbackTableScan.items || []) {
    for (const entry of table.matchedEntries || []) {
      if (!entry.key || !entry.callback) continue;
      lookup.set(String(entry.key).toLowerCase(), {
        callback: String(entry.callback).toLowerCase(),
        section: table.section || "",
        tableVirtualAddress: Number.isFinite(Number(table.virtualAddress)) ? Number(table.virtualAddress) : null,
        entryIndex: Number.isInteger(Number(entry.entryIndex)) ? Number(entry.entryIndex) : null,
      });
    }
  }
  return lookup;
}

function pfxCurrentCallbackTableMissLookup(nativeParticleCallbackTableScan = {}) {
  return new Set((nativeParticleCallbackTableScan.candidateKeyMisses || []).map((key) => String(key).toLowerCase()));
}

function pfxCurrentCallbackSemanticsLookup(nativeParticleCallbackSemantics = {}) {
  const lookup = new Map();
  for (const item of nativeParticleCallbackSemantics.items || []) {
    if (!item.callbackAddress) continue;
    lookup.set(String(item.callbackAddress).toLowerCase(), item);
  }
  return lookup;
}

function pfxCallbackSemanticsByKeyLookup(nativeParticleCallbackSemantics = {}) {
  if (nativeParticleCallbackSemantics instanceof Map) return nativeParticleCallbackSemantics;
  const lookup = new Map();
  for (const item of nativeParticleCallbackSemantics.items || []) {
    for (const key of item.sampleKeys || []) {
      const normalizedKey = String(key || "").toLowerCase();
      if (!normalizedKey || lookup.has(normalizedKey)) continue;
      lookup.set(normalizedKey, item);
    }
  }
  return lookup;
}

function pfxFloat32FromHexBits(bits) {
  const match = String(bits || "").match(/^0x([0-9a-f]{1,8})$/i);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  if (!Number.isFinite(value)) return null;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  const floatValue = buffer.readFloatBE(0);
  return Number.isFinite(floatValue) ? roundFloat(floatValue) : null;
}

function pfxCurrentCallbackConstant(currentCallbackSemantics) {
  const semanticClass = currentCallbackSemantics?.semanticClass || "";
  if (semanticClass === "constant-scalar-store") {
    const value = pfxFloat32FromHexBits(currentCallbackSemantics.immediateBits);
    return value === null ? null : { value, source: "immediate-bits-float32" };
  }
  if (semanticClass === "constant-zero-scalar-store" || semanticClass === "constant-zero-vector3-store") {
    return { value: 0, source: "zero-store" };
  }
  if (semanticClass === "constant-vector4-load-store" && Array.isArray(currentCallbackSemantics.vectorValues)) {
    const vectorValue = currentCallbackSemantics.vectorValues.map(Number).filter(Number.isFinite).map(roundFloat);
    if (vectorValue.length >= 4) {
      return {
        vectorValue: vectorValue.slice(0, 4),
        vectorSourceAddress: currentCallbackSemantics.vectorSourceAddress || "",
        source: "literal-vector4-load",
      };
    }
  }
  if (semanticClass === "constant-vector2-load-store" && Array.isArray(currentCallbackSemantics.vectorValues)) {
    const vectorValue = currentCallbackSemantics.vectorValues.map(Number).filter(Number.isFinite).map(roundFloat);
    if (vectorValue.length >= 2) {
      return {
        vectorValue: vectorValue.slice(0, 2),
        vectorSourceAddress: currentCallbackSemantics.vectorSourceAddress || "",
        source: "literal-vector2-load",
      };
    }
  }
  return null;
}

function pfxCurrentCallbackRandomRange(currentCallbackSemantics) {
  const minValue = Number(currentCallbackSemantics?.randomMinValue);
  const maxValue = Number(currentCallbackSemantics?.randomMaxValue);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  return {
    ...(Number.isFinite(Number(currentCallbackSemantics.randomScale))
      ? { randomScale: Number(currentCallbackSemantics.randomScale) }
      : {}),
    ...(Number.isFinite(Number(currentCallbackSemantics.randomBase))
      ? { randomBase: roundFloat(Number(currentCallbackSemantics.randomBase)) }
      : {}),
    randomMinValue: roundFloat(minValue),
    randomMaxValue: roundFloat(maxValue),
  };
}

function pfxCurrentCallbackCurveRange(currentCallbackSemantics) {
  const minValue = Number(currentCallbackSemantics?.curveMinValue);
  const maxValue = Number(currentCallbackSemantics?.curveMaxValue);
  const boundaryValues = (currentCallbackSemantics?.curveBoundaryValues || []).map(Number).filter(Number.isFinite).map(roundFloat);
  const readStatus = currentCallbackSemantics?.curveTableReadStatus || "";
  if (
    (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) &&
    !boundaryValues.length &&
    !readStatus &&
    !currentCallbackSemantics?.curveTableSourceAddress
  ) {
    return null;
  }
  return {
    ...(currentCallbackSemantics.curveTableSourceAddress
      ? { curveTableSourceAddress: currentCallbackSemantics.curveTableSourceAddress }
      : {}),
    ...(readStatus ? { curveTableReadStatus: readStatus } : {}),
    ...(Number.isFinite(Number(currentCallbackSemantics.curveTableSampleCount))
      ? { curveTableSampleCount: Number(currentCallbackSemantics.curveTableSampleCount) }
      : {}),
    ...(Number.isFinite(Number(currentCallbackSemantics.curveTableMultiplier))
      ? { curveTableMultiplier: roundFloat(Number(currentCallbackSemantics.curveTableMultiplier)) }
      : {}),
    ...(Number.isFinite(Number(currentCallbackSemantics.curveTableMinValue))
      ? { curveTableMinValue: roundFloat(Number(currentCallbackSemantics.curveTableMinValue)) }
      : {}),
    ...(Number.isFinite(Number(currentCallbackSemantics.curveTableMaxValue))
      ? { curveTableMaxValue: roundFloat(Number(currentCallbackSemantics.curveTableMaxValue)) }
      : {}),
    ...(Number.isInteger(Number(currentCallbackSemantics.curveOutputComponentIndex))
      ? { curveOutputComponentIndex: Number(currentCallbackSemantics.curveOutputComponentIndex) }
      : {}),
    ...(boundaryValues.length ? { curveBoundaryValues: boundaryValues } : {}),
    ...(Number.isFinite(minValue) ? { curveMinValue: roundFloat(minValue) } : {}),
    ...(Number.isFinite(maxValue) ? { curveMaxValue: roundFloat(maxValue) } : {}),
  };
}

function pfxCurrentCallbackPattern16(currentCallbackSemantics) {
  const values = (currentCallbackSemantics?.pattern16FloatValues || []).map(Number).filter(Number.isFinite).map(roundFloat);
  const readStatus = currentCallbackSemantics?.pattern16ReadStatus || "";
  if (!values.length && !readStatus && !currentCallbackSemantics?.pattern16SourceAddress) return null;
  return {
    ...(currentCallbackSemantics.pattern16SourceAddress
      ? { pattern16SourceAddress: currentCallbackSemantics.pattern16SourceAddress }
      : {}),
    ...(values.length ? { pattern16FloatValues: values.slice(0, 4) } : {}),
    ...(readStatus ? { pattern16ReadStatus: readStatus } : {}),
  };
}

function pfxCurrentCallbackFirstComponent(currentCallbackSemantics) {
  const value = Number(currentCallbackSemantics?.firstComponentValue);
  if (!Number.isFinite(value)) return null;
  return {
    value: roundFloat(value),
    ...(currentCallbackSemantics.firstComponentBits ? { bits: currentCallbackSemantics.firstComponentBits } : {}),
  };
}

function pfxEmitterTransformSemantic(semantic) {
  return /velocity|position|size|rotation/i.test(semantic);
}

function pfxEmitterColorSemantic(semantic) {
  return /color/i.test(semantic);
}

function pfxEmitterLifecycleSemantic(semantic) {
  return /delay|duration/i.test(semantic);
}

function readPfxEmitterMappingValue(buffer, recordStart, recordEnd, mapping) {
  const offset = recordStart + mapping.relativeOffset;
  if (offset < recordStart || offset + 4 > recordEnd || offset + 4 > buffer.length) return null;
  if (mapping.semantic === "delaySeconds" || mapping.semantic === "activeDurationSeconds") {
    const value = buffer.readFloatLE(offset);
    if (!Number.isFinite(value) || value < 0 || value > 60) return null;
    if (mapping.semantic === "activeDurationSeconds" && value <= 0) return null;
    return roundFloat(value);
  }
  if (offset + 8 > recordEnd || offset + 8 > buffer.length) return null;
  const value = buffer.readBigUInt64LE(offset);
  if (value === 0n) return null;
  return `0x${value.toString(16)}`;
}

function pfxResolverInputKind(value) {
  const match = String(value || "").match(/^0x([0-9a-f]+)$/i);
  if (!match) return "";
  const numericValue = BigInt(`0x${match[1]}`);
  const low32 = Number(numericValue & 0xffffffffn) >>> 0;
  const high32 = Number((numericValue >> 32n) & 0xffffffffn) >>> 0;
  if (numericValue <= 0xffffffffn) return "literal-or-null";
  const lowByteOrZero = low32 === 0 || low32 <= 0xff;
  const highBytePacked = high32 !== 0 && (high32 & 0x00ffffff) === 0;
  const highCompact = high32 > 0 && high32 <= 0x00ffffff;
  const highByteOrZero = high32 === 0 || high32 <= 0xff;
  const lowLooksLikeFloatBits = low32 >= 0x30000000 && low32 <= 0x4f000000;
  if (lowByteOrZero && (highBytePacked || highCompact || highByteOrZero)) return "literal-or-null";
  if (highByteOrZero && lowLooksLikeFloatBits) return "literal-or-null";
  return "candidate-key";
}

function hexByte(value) {
  return `0x${Number(value).toString(16).padStart(2, "0")}`;
}

function pfxPackedLiteralFloatCandidateLimit(targetSemantic = "") {
  if (/rotation/i.test(targetSemantic)) return 720;
  if (/size/i.test(targetSemantic)) return 100;
  return 1000;
}

function pfxPackedLiteralFloatCandidates(bytes, targetSemantic = "") {
  const candidates = [];
  const maxAbsValue = pfxPackedLiteralFloatCandidateLimit(targetSemantic);
  for (let byteOffset = 0; byteOffset <= 4; byteOffset += 1) {
    const buffer = Buffer.from(bytes.slice(byteOffset, byteOffset + 4));
    const value = buffer.readFloatLE(0);
    if (!Number.isFinite(value)) continue;
    const roundedValue = roundFloat(value);
    if (Math.abs(roundedValue) < 0.00001 || Math.abs(roundedValue) > maxAbsValue) continue;
    candidates.push({
      byteOffset,
      value: roundedValue,
      source: "float32le-window",
    });
  }
  return candidates;
}

function rgbHexFromBytes(bytes) {
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function pfxPackedLiteralColorCandidates(bytes, options = {}) {
  if (!options.currentTableMiss) return [];
  if (bytes[0] !== 0 || bytes[7] !== 0) return [];
  const candidates = [];
  for (const byteOffset of [1, 4]) {
    const colorBytes = bytes.slice(byteOffset, byteOffset + 3);
    const nonZeroBytes = colorBytes.filter((byte) => byte !== 0).length;
    if (colorBytes.length !== 3 || nonZeroBytes < 2) continue;
    candidates.push({
      byteOffset,
      rgbHex: rgbHexFromBytes(colorBytes),
      source: "byte-color-window",
    });
  }
  return candidates;
}

function pfxPackedLiteralEvidence(value, targetSemantic = "", options = {}) {
  const match = String(value || "").match(/^0x([0-9a-f]+)$/i);
  if (!match) return null;
  const numericValue = BigInt(`0x${match[1]}`);
  if (numericValue <= 0xffffffffn) return null;
  const bytes = Array.from({ length: 8 }, (_, index) => Number((numericValue >> (8n * BigInt(index))) & 0xffn));
  const nonZeroBytes = bytes.filter((byte) => byte !== 0).length;
  const floatCandidates = pfxPackedLiteralFloatCandidates(bytes, targetSemantic);
  const colorCandidates = /color/i.test(targetSemantic) ? pfxPackedLiteralColorCandidates(bytes, options) : [];
  const targetSupportsFloatWindow = /size|rotation|color/i.test(targetSemantic);
  const targetSupportsCompactColor = /color/i.test(targetSemantic) && colorCandidates.length;
  if (nonZeroBytes > 4 && (!targetSupportsFloatWindow || !floatCandidates.length) && !targetSupportsCompactColor) {
    return null;
  }
  return {
    resolverPackedLiteralBytes: bytes.map(hexByte),
    resolverPackedLiteralNonZeroBytes: nonZeroBytes,
    ...(floatCandidates.length ? { resolverPackedLiteralFloatCandidates: floatCandidates } : {}),
    ...(colorCandidates.length ? { resolverPackedLiteralColorCandidates: colorCandidates } : {}),
  };
}

function pfxEmitterRuntimeProfile(
  buffer,
  recordStart,
  recordEnd,
  mappings = [],
  callbackUpdateMappings = new Map(),
  callbackResolver = null,
  currentCallbackTableLookup = new Map(),
  currentCallbackTableMissLookup = new Set(),
  currentCallbackSemanticsLookup = new Map(),
  fallbackCallbackSemanticsByKeyLookup = new Map(),
  options = {},
) {
  const semanticSlots = [];
  const lifecycleOffsets = [];
  const transformOffsets = [];
  const colorOffsets = [];
  const emitterRuntimeHints = {};
  const timingSourceOffsets = {};

  for (const mapping of mappings || []) {
    const value = readPfxEmitterMappingValue(buffer, recordStart, recordEnd, mapping);
    if (value === null) continue;
    if (mapping.semantic === "delaySeconds") {
      emitterRuntimeHints.delaySeconds = value;
      timingSourceOffsets.delaySeconds = mapping.relativeOffset;
    }
    if (mapping.semantic === "activeDurationSeconds") {
      emitterRuntimeHints.durationSeconds = value;
      timingSourceOffsets.durationSeconds = mapping.relativeOffset;
    }
    if (pfxEmitterLifecycleSemantic(mapping.semantic)) lifecycleOffsets.push(mapping.relativeOffset);
    if (pfxEmitterTransformSemantic(mapping.semantic)) transformOffsets.push(mapping.relativeOffset);
    if (pfxEmitterColorSemantic(mapping.semantic)) colorOffsets.push(mapping.relativeOffset);
    const callbackUpdate = callbackUpdateMappings.get(`${mapping.runtimeOffset}:${mapping.semantic}`) || {};
    const targetArrayOffset = callbackUpdate.targetArrayOffset || mapping.targetArrayOffset || "";
    const targetArraySemantic = callbackUpdate.targetArraySemantic || mapping.targetArraySemantic || "";
    const callbackOutputComponents = callbackUpdate.callbackOutputComponents || mapping.callbackOutputComponents || "";
    const updateOperation = callbackUpdate.updateOperation || mapping.updateOperation || "";
    const updateFunction = callbackUpdate.updateFunction || mapping.updateFunction || "";
    const hasCallbackUpdate = Boolean(
      mapping.callbackResolver ||
        targetArrayOffset ||
        targetArraySemantic ||
        callbackOutputComponents ||
        updateOperation ||
        updateFunction,
    );
    const initialResolverInputKind = hasCallbackUpdate && callbackResolver?.resolverFunction ? pfxResolverInputKind(value) : "";
    const currentCallbackMatch =
      initialResolverInputKind === "candidate-key" ? currentCallbackTableLookup.get(String(value).toLowerCase()) || null : null;
    const unverifiedQuestionPrefixedCandidate =
      options.recordLayout !== "native-emitter-record" && options.pathSlotPrefix === "?" && hasCallbackUpdate && !currentCallbackMatch;
    const currentCallbackTableMiss =
      initialResolverInputKind === "candidate-key" &&
      !unverifiedQuestionPrefixedCandidate &&
      !currentCallbackMatch &&
      currentCallbackTableMissLookup.has(String(value).toLowerCase());
    const packedLiteralEvidence =
      initialResolverInputKind === "candidate-key" && !unverifiedQuestionPrefixedCandidate && !currentCallbackMatch
        ? pfxPackedLiteralEvidence(value, targetArraySemantic || mapping.semantic, {
            currentTableMiss: currentCallbackTableMiss,
          })
        : null;
    const resolverInputKind = unverifiedQuestionPrefixedCandidate
      ? ""
      : packedLiteralEvidence
        ? "packed-literal"
        : initialResolverInputKind;
    const currentCallbackSemantics = currentCallbackMatch?.callback
      ? currentCallbackSemanticsLookup.get(String(currentCallbackMatch.callback).toLowerCase()) || null
      : null;
    const fallbackCallbackSemantics =
      initialResolverInputKind === "candidate-key"
        ? fallbackCallbackSemanticsByKeyLookup.get(String(value).toLowerCase()) || null
        : null;
    const currentCallbackDependencyFlags = Array.isArray(currentCallbackSemantics?.dependencyFlags)
      ? currentCallbackSemantics.dependencyFlags
      : [];
    const fallbackCallbackDependencyFlags = Array.isArray(fallbackCallbackSemantics?.dependencyFlags)
      ? fallbackCallbackSemantics.dependencyFlags
      : [];
    const currentCallbackConstant = pfxCurrentCallbackConstant(currentCallbackSemantics);
    const fallbackCallbackConstant = pfxCurrentCallbackConstant(fallbackCallbackSemantics);
    const currentCallbackRandomRange = pfxCurrentCallbackRandomRange(currentCallbackSemantics);
    const fallbackCallbackRandomRange = pfxCurrentCallbackRandomRange(fallbackCallbackSemantics);
    const currentCallbackCurveRange = pfxCurrentCallbackCurveRange(currentCallbackSemantics);
    const fallbackCallbackCurveRange = pfxCurrentCallbackCurveRange(fallbackCallbackSemantics);
    const currentCallbackPattern16 = pfxCurrentCallbackPattern16(currentCallbackSemantics);
    const currentCallbackFirstComponent = pfxCurrentCallbackFirstComponent(currentCallbackSemantics);
    const fallbackCallbackFirstComponent = pfxCurrentCallbackFirstComponent(fallbackCallbackSemantics);
    const resolverCurrentBuildStatus = currentCallbackMatch
      ? "matched-current-table-candidate"
      : currentCallbackTableMiss
        ? "missing-current-table-candidate"
        : "";
    const resolverResolutionStatus =
      currentCallbackMatch
        ? "current-table-callback-matched"
        : resolverInputKind === "candidate-key"
          ? "pending-table-resolution"
        : resolverInputKind === "packed-literal"
          ? "likely-packed-literal"
        : resolverInputKind === "literal-or-null"
          ? "likely-null-literal"
          : "";
    const shouldPersistCallbackDependencyFlags =
      targetArraySemantic === "size" || /size/i.test(String(mapping.semantic || ""));
    semanticSlots.push({
      name: mapping.semantic,
      relativeOffset: mapping.relativeOffset,
      value,
      runtimeOffset: mapping.runtimeOffset,
      ...(unverifiedQuestionPrefixedCandidate ? { callbackLayoutEvidence: "question-prefixed-surface-path" } : {}),
      ...(unverifiedQuestionPrefixedCandidate ? { callbackLayoutStatus: "unverified" } : {}),
      ...(!unverifiedQuestionPrefixedCandidate && targetArrayOffset
        ? { targetArrayOffset }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && targetArraySemantic
        ? { targetArraySemantic }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && callbackOutputComponents
        ? { callbackOutputComponents }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && updateOperation
        ? { updateOperation }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && updateFunction
        ? { updateFunction }
        : {}),
      ...(resolverInputKind ? { resolverInputKind } : {}),
      ...(resolverInputKind ? { resolverInputValue: value } : {}),
      ...(resolverInputKind === "candidate-key" ? { resolverKey: value } : {}),
      ...(packedLiteralEvidence || {}),
      ...(!unverifiedQuestionPrefixedCandidate && hasCallbackUpdate && callbackResolver?.resolverFunction
        ? { resolverFunction: callbackResolver.resolverFunction }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && hasCallbackUpdate && callbackResolver?.resolverTableBase
        ? { resolverTableBase: callbackResolver.resolverTableBase }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && hasCallbackUpdate && callbackResolver?.resolverPointerBase
        ? { resolverPointerBase: callbackResolver.resolverPointerBase }
        : {}),
      ...(!unverifiedQuestionPrefixedCandidate && hasCallbackUpdate && callbackResolver?.resolverTableCompatibilityStatus
        ? { resolverTableCompatibilityStatus: callbackResolver.resolverTableCompatibilityStatus }
        : {}),
      ...(resolverCurrentBuildStatus ? { resolverCurrentBuildStatus } : {}),
      ...(currentCallbackMatch?.callback ? { resolverCurrentCallbackAddress: currentCallbackMatch.callback } : {}),
      ...(currentCallbackSemantics?.semanticClass
        ? { resolverCurrentCallbackSemanticClass: currentCallbackSemantics.semanticClass }
        : {}),
      ...(currentCallbackSemantics?.semanticEvidenceSource
        ? { resolverCurrentCallbackEvidenceSource: currentCallbackSemantics.semanticEvidenceSource }
        : {}),
      ...(currentCallbackSemantics?.outputStore ? { resolverCurrentCallbackOutputStore: currentCallbackSemantics.outputStore } : {}),
      ...(shouldPersistCallbackDependencyFlags && currentCallbackDependencyFlags.length
        ? { resolverCurrentCallbackDependencyFlags: currentCallbackDependencyFlags }
        : {}),
      ...(currentCallbackSemantics?.immediateBits
        ? { resolverCurrentCallbackImmediateBits: currentCallbackSemantics.immediateBits }
        : {}),
      ...(Number.isFinite(currentCallbackConstant?.value)
        ? { resolverCurrentCallbackConstantValue: currentCallbackConstant.value }
        : {}),
      ...(currentCallbackConstant?.vectorSourceAddress
        ? { resolverCurrentCallbackVectorSourceAddress: currentCallbackConstant.vectorSourceAddress }
        : {}),
      ...(currentCallbackConstant?.vectorValue ? { resolverCurrentCallbackVectorValue: currentCallbackConstant.vectorValue } : {}),
      ...(currentCallbackConstant ? { resolverCurrentCallbackConstantSource: currentCallbackConstant.source } : {}),
      ...(currentCallbackPattern16?.pattern16SourceAddress
        ? { resolverCurrentCallbackPattern16SourceAddress: currentCallbackPattern16.pattern16SourceAddress }
        : {}),
      ...(currentCallbackPattern16?.pattern16FloatValues
        ? { resolverCurrentCallbackPattern16FloatValues: currentCallbackPattern16.pattern16FloatValues }
        : {}),
      ...(currentCallbackPattern16?.pattern16ReadStatus
        ? { resolverCurrentCallbackPattern16ReadStatus: currentCallbackPattern16.pattern16ReadStatus }
        : {}),
      ...(Number.isFinite(currentCallbackFirstComponent?.value)
        ? { resolverCurrentCallbackFirstComponentValue: currentCallbackFirstComponent.value }
        : {}),
      ...(currentCallbackFirstComponent?.bits
        ? { resolverCurrentCallbackFirstComponentBits: currentCallbackFirstComponent.bits }
        : {}),
      ...(fallbackCallbackSemantics?.callbackAddress
        ? { resolverFallbackCallbackAddress: String(fallbackCallbackSemantics.callbackAddress).toLowerCase() }
        : {}),
      ...(fallbackCallbackSemantics?.semanticClass
        ? { resolverFallbackCallbackSemanticClass: fallbackCallbackSemantics.semanticClass }
        : {}),
      ...(fallbackCallbackSemantics?.semanticEvidenceSource
        ? { resolverFallbackCallbackEvidenceSource: fallbackCallbackSemantics.semanticEvidenceSource }
        : {}),
      ...(shouldPersistCallbackDependencyFlags && fallbackCallbackDependencyFlags.length
        ? { resolverFallbackCallbackDependencyFlags: fallbackCallbackDependencyFlags }
        : {}),
      ...(Number.isFinite(fallbackCallbackConstant?.value)
        ? { resolverFallbackCallbackConstantValue: fallbackCallbackConstant.value }
        : {}),
      ...(fallbackCallbackConstant?.vectorValue ? { resolverFallbackCallbackVectorValue: fallbackCallbackConstant.vectorValue } : {}),
      ...(fallbackCallbackConstant ? { resolverFallbackCallbackConstantSource: fallbackCallbackConstant.source } : {}),
      ...(Number.isFinite(fallbackCallbackFirstComponent?.value)
        ? { resolverFallbackCallbackFirstComponentValue: fallbackCallbackFirstComponent.value }
        : {}),
      ...(fallbackCallbackFirstComponent?.bits
        ? { resolverFallbackCallbackFirstComponentBits: fallbackCallbackFirstComponent.bits }
        : {}),
      ...(Number.isFinite(currentCallbackRandomRange?.randomScale)
        ? { resolverCurrentCallbackRandomScale: currentCallbackRandomRange.randomScale }
        : {}),
      ...(Number.isFinite(currentCallbackRandomRange?.randomBase)
        ? { resolverCurrentCallbackRandomBase: currentCallbackRandomRange.randomBase }
        : {}),
      ...(Number.isFinite(currentCallbackRandomRange?.randomMinValue)
        ? { resolverCurrentCallbackRandomMinValue: currentCallbackRandomRange.randomMinValue }
        : {}),
      ...(Number.isFinite(currentCallbackRandomRange?.randomMaxValue)
        ? { resolverCurrentCallbackRandomMaxValue: currentCallbackRandomRange.randomMaxValue }
        : {}),
      ...(currentCallbackCurveRange?.curveTableSourceAddress
        ? { resolverCurrentCallbackCurveTableSourceAddress: currentCallbackCurveRange.curveTableSourceAddress }
        : {}),
      ...(currentCallbackCurveRange?.curveTableReadStatus
        ? { resolverCurrentCallbackCurveTableReadStatus: currentCallbackCurveRange.curveTableReadStatus }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveTableSampleCount)
        ? { resolverCurrentCallbackCurveTableSampleCount: currentCallbackCurveRange.curveTableSampleCount }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveTableMultiplier)
        ? { resolverCurrentCallbackCurveTableMultiplier: currentCallbackCurveRange.curveTableMultiplier }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveTableMinValue)
        ? { resolverCurrentCallbackCurveTableMinValue: currentCallbackCurveRange.curveTableMinValue }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveTableMaxValue)
        ? { resolverCurrentCallbackCurveTableMaxValue: currentCallbackCurveRange.curveTableMaxValue }
        : {}),
      ...(Number.isInteger(currentCallbackCurveRange?.curveOutputComponentIndex)
        ? { resolverCurrentCallbackCurveOutputComponentIndex: currentCallbackCurveRange.curveOutputComponentIndex }
        : {}),
      ...(currentCallbackCurveRange?.curveBoundaryValues?.length
        ? { resolverCurrentCallbackCurveBoundaryValues: currentCallbackCurveRange.curveBoundaryValues }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveMinValue)
        ? { resolverCurrentCallbackCurveMinValue: currentCallbackCurveRange.curveMinValue }
        : {}),
      ...(Number.isFinite(currentCallbackCurveRange?.curveMaxValue)
        ? { resolverCurrentCallbackCurveMaxValue: currentCallbackCurveRange.curveMaxValue }
        : {}),
      ...(Number.isFinite(fallbackCallbackRandomRange?.randomScale)
        ? { resolverFallbackCallbackRandomScale: fallbackCallbackRandomRange.randomScale }
        : {}),
      ...(Number.isFinite(fallbackCallbackRandomRange?.randomBase)
        ? { resolverFallbackCallbackRandomBase: fallbackCallbackRandomRange.randomBase }
        : {}),
      ...(Number.isFinite(fallbackCallbackRandomRange?.randomMinValue)
        ? { resolverFallbackCallbackRandomMinValue: fallbackCallbackRandomRange.randomMinValue }
        : {}),
      ...(Number.isFinite(fallbackCallbackRandomRange?.randomMaxValue)
        ? { resolverFallbackCallbackRandomMaxValue: fallbackCallbackRandomRange.randomMaxValue }
        : {}),
      ...(fallbackCallbackCurveRange?.curveTableSourceAddress
        ? { resolverFallbackCallbackCurveTableSourceAddress: fallbackCallbackCurveRange.curveTableSourceAddress }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveTableSampleCount)
        ? { resolverFallbackCallbackCurveTableSampleCount: fallbackCallbackCurveRange.curveTableSampleCount }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveTableMultiplier)
        ? { resolverFallbackCallbackCurveTableMultiplier: fallbackCallbackCurveRange.curveTableMultiplier }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveTableMinValue)
        ? { resolverFallbackCallbackCurveTableMinValue: fallbackCallbackCurveRange.curveTableMinValue }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveTableMaxValue)
        ? { resolverFallbackCallbackCurveTableMaxValue: fallbackCallbackCurveRange.curveTableMaxValue }
        : {}),
      ...(Number.isInteger(fallbackCallbackCurveRange?.curveOutputComponentIndex)
        ? { resolverFallbackCallbackCurveOutputComponentIndex: fallbackCallbackCurveRange.curveOutputComponentIndex }
        : {}),
      ...(fallbackCallbackCurveRange?.curveBoundaryValues?.length
        ? { resolverFallbackCallbackCurveBoundaryValues: fallbackCallbackCurveRange.curveBoundaryValues }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveMinValue)
        ? { resolverFallbackCallbackCurveMinValue: fallbackCallbackCurveRange.curveMinValue }
        : {}),
      ...(Number.isFinite(fallbackCallbackCurveRange?.curveMaxValue)
        ? { resolverFallbackCallbackCurveMaxValue: fallbackCallbackCurveRange.curveMaxValue }
        : {}),
      ...(resolverResolutionStatus ? { resolverResolutionStatus } : {}),
    });
  }

  if (Object.keys(timingSourceOffsets).length) emitterRuntimeHints.timingSourceOffsets = timingSourceOffsets;
  const hasLifecycle = lifecycleOffsets.length > 0;
  const hasTransform = transformOffsets.length > 0;
  const hasColor = colorOffsets.length > 0;
  const evidenceClass = hasLifecycle && hasTransform
    ? "lifecycle-transform"
    : hasLifecycle
      ? "lifecycle"
      : hasTransform
        ? "transform"
        : hasColor
          ? "color"
          : "";
  return {
    emitterRuntimeHints: Object.keys(emitterRuntimeHints).length ? emitterRuntimeHints : null,
    emitterRuntimeProfile: semanticSlots.length
      ? {
          evidenceClass,
          lifecycleOffsets,
          transformOffsets,
          colorOffsets,
          semanticSlots,
        }
      : null,
  };
}

function pfxChildEmitterCallbackMappings(mode) {
  return PFX_CHILD_EMITTER_CALLBACK_MAPPINGS.filter((mapping) => !mapping.modes || mapping.modes.includes(mode));
}

function pfxNativeChildEmitterRecordStart(nativeRecord) {
  const attachmentCount = Number(nativeRecord.attachmentCountA || 0) + Number(nativeRecord.attachmentCountB || 0);
  return (
    Number(nativeRecord.recordStart) +
    PFX_NATIVE_EMITTER_BASE_LENGTH +
    attachmentCount * PFX_NATIVE_EMITTER_ATTACHMENT_LENGTH
  );
}

function pfxChildEmitterRecords(
  buffer,
  nativeRecord,
  callbackResolver,
  currentCallbackTableLookup,
  currentCallbackTableMissLookup,
  currentCallbackSemanticsLookup,
  fallbackCallbackSemanticsByKeyLookup,
) {
  if (!Buffer.isBuffer(buffer) || nativeRecord?.recordLayout !== "native-emitter-record") return [];
  const childCount = Number(nativeRecord.childCount || 0);
  if (!childCount) return [];

  const records = [];
  const firstChildStart = pfxNativeChildEmitterRecordStart(nativeRecord);
  for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
    const recordStart = firstChildStart + childIndex * PFX_NATIVE_EMITTER_CHILD_LENGTH;
    const recordEnd = recordStart + PFX_NATIVE_EMITTER_CHILD_LENGTH;
    if (recordStart < 0 || recordEnd > buffer.length || recordEnd > nativeRecord.recordEnd) break;
    const mode = buffer[recordStart + 0x18] || 0;
    const { emitterRuntimeProfile } = pfxEmitterRuntimeProfile(
      buffer,
      recordStart,
      recordEnd,
      pfxChildEmitterCallbackMappings(mode),
      new Map(),
      callbackResolver,
      currentCallbackTableLookup,
      currentCallbackTableMissLookup,
      currentCallbackSemanticsLookup,
      fallbackCallbackSemanticsByKeyLookup,
      { recordLayout: "native-child-emitter-record" },
    );
    records.push({
      childIndex,
      recordStart,
      recordLength: PFX_NATIVE_EMITTER_CHILD_LENGTH,
      mode,
      ...(emitterRuntimeProfile ? { runtimeProfile: emitterRuntimeProfile } : {}),
    });
  }
  return records;
}

function pfxSurfaceRenderFamily(preludeBytes) {
  const kindCode = preludeBytes[1];
  const orientationCode = preludeBytes[2];
  if (kindCode === 5) return "beam";
  if (kindCode === 7 || kindCode === 8 || orientationCode === 4) return "area";
  return "billboard";
}

function pfxSurfacePrelude(preludeBytes) {
  return {
    kindCode: preludeBytes[1] ?? null,
    orientationCode: preludeBytes[2] ?? null,
    variantCode: preludeBytes[3] ?? null,
    flagA: preludeBytes[4] ?? null,
    flagB: preludeBytes[5] ?? null,
    renderFamily: pfxSurfaceRenderFamily(preludeBytes),
  };
}

function extractPfxSurfaceRecords(
  buffer,
  references = extractPfxReferences(buffer),
  nativeParticleRuntimeSchema = {},
  nativeBinaryVersionAudit = {},
  nativeParticleCallbackTableScan = {},
  nativeParticleCallbackSemantics = {},
  nativeParticleFallbackCallbackSemantics = {},
) {
  const emitterMappings = pfxEmitterRuntimeMappings(nativeParticleRuntimeSchema);
  const callbackUpdateMappings = pfxEmitterCallbackUpdateMappings(nativeParticleRuntimeSchema);
  const callbackResolver = pfxEmitterCallbackResolver(nativeParticleRuntimeSchema, nativeBinaryVersionAudit);
  const currentCallbackTableLookup = pfxCurrentCallbackTableLookup(nativeParticleCallbackTableScan);
  const currentCallbackTableMissLookup = pfxCurrentCallbackTableMissLookup(nativeParticleCallbackTableScan);
  const currentCallbackSemanticsLookup = pfxCurrentCallbackSemanticsLookup(nativeParticleCallbackSemantics);
  const fallbackCallbackSemanticsByKeyLookup = pfxCallbackSemanticsByKeyLookup(nativeParticleFallbackCallbackSemantics);
  const nativeEmitterRecords = extractPfxNativeEmitterRecords(buffer)
    .filter((record) => record.kind === "shadergraph" && Number.isInteger(record.surfaceIndex))
    .sort((left, right) => left.recordStart - right.recordStart);
  const legacyShadergraphRefs = references
    .filter((reference) => reference.kind === "shadergraph" && Number.isInteger(reference.surfaceIndex))
    .sort((left, right) => left.offset - right.offset);
  const shadergraphRecords = nativeEmitterRecords.length
    ? nativeEmitterRecords
    : legacyShadergraphRefs.map((reference, index) => {
        const recordStart = Math.max(0, reference.offset - 16);
        const nextReference = legacyShadergraphRefs[index + 1];
        const recordEnd = nextReference ? Math.max(recordStart, nextReference.offset - 16) : buffer.length;
        return {
          recordLayout: "legacy-string-neighborhood",
          recordIndex: index,
          recordStart,
          recordEnd,
          recordLength: recordEnd - recordStart,
          pathMarkerOffset: reference.offset,
          pathMarkerByte: buffer[reference.offset] || 0,
          pathSlotPrefix: buffer[reference.offset] === 0x3f ? "?" : "",
          pathOffset: reference.offset,
          pathSlotLength: 128,
          relativePath: reference.relativePath,
          kind: reference.kind,
          surfaceIndex: reference.surfaceIndex,
        };
      });

  return shadergraphRecords.map((reference, index) => {
    const recordStart = reference.recordLayout === "native-emitter-record" ? Math.max(0, reference.pathMarkerOffset - 16) : reference.recordStart;
    const nextReference = shadergraphRecords[index + 1];
    const recordEnd =
      reference.recordLayout === "native-emitter-record"
        ? nextReference
          ? Math.max(recordStart, nextReference.pathMarkerOffset - 16)
          : buffer.length
        : reference.recordEnd;
    const sampledFloats = candidatePfxFloatSamples(buffer, recordStart, recordEnd);
    const runtimeHints = pfxSurfaceRuntimeHints(sampledFloats);
    const pathSlotPrefix = reference.pathSlotPrefix || "";
    const emitterRecordStart = reference.recordLayout === "native-emitter-record" ? reference.recordStart : recordStart;
    const emitterRecordEnd = reference.recordLayout === "native-emitter-record" ? reference.recordEnd : recordEnd;
    const { emitterRuntimeHints, emitterRuntimeProfile } = pfxEmitterRuntimeProfile(
      buffer,
      emitterRecordStart,
      emitterRecordEnd,
      emitterMappings,
      callbackUpdateMappings,
      callbackResolver,
      currentCallbackTableLookup,
      currentCallbackTableMissLookup,
      currentCallbackSemanticsLookup,
      fallbackCallbackSemanticsByKeyLookup,
      { pathSlotPrefix, recordLayout: reference.recordLayout },
    );
    const preludeBytes = [...buffer.subarray(recordStart, Math.min(recordStart + 16, buffer.length))];
    const prelude = pfxSurfacePrelude(preludeBytes);
    const record = {
      surfaceIndex: reference.surfaceIndex,
      relativePath: reference.relativePath,
      referenceOffset: reference.pathOffset,
      recordLayout: reference.recordLayout,
      recordStart,
      recordLength: recordEnd - recordStart,
      ...(reference.recordLayout === "native-emitter-record"
        ? {
            emitterRecordStart,
            emitterRecordLength: emitterRecordEnd - emitterRecordStart,
            emitterRecordIndex: reference.recordIndex,
            emitterChildCount: reference.childCount,
            emitterAttachmentCountA: reference.attachmentCountA,
            emitterAttachmentCountB: reference.attachmentCountB,
          }
        : {}),
      preludeBytes,
      preludeHex: hexBytes(buffer.subarray(recordStart, Math.min(recordStart + 16, buffer.length))),
      prelude,
      pathSlotPrefix,
      pathSlotMarkerOffset: reference.pathMarkerOffset,
      pathSlotMarkerByte: reference.pathMarkerByte,
      pathSlotOffset: reference.pathOffset,
      pathSlotLength: reference.pathSlotLength,
      parameterOffset: recordStart + 144,
      parameterRelativeOffset: 144,
      sampledFloats,
      runtimeHints,
      parameterProfile: pfxSurfaceParameterProfile(sampledFloats, runtimeHints),
    };
    if (reference.recordLayout === "native-emitter-record") {
      record.childEmitterRecords = pfxChildEmitterRecords(
        buffer,
        reference,
      callbackResolver,
      currentCallbackTableLookup,
      currentCallbackTableMissLookup,
      currentCallbackSemanticsLookup,
      fallbackCallbackSemanticsByKeyLookup,
    );
    }
    const shapeProfile = pfxSurfaceShapeProfile(prelude, emitterRuntimeProfile, record.childEmitterRecords || []);
    if (emitterRuntimeHints) record.emitterRuntimeHints = emitterRuntimeHints;
    if (emitterRuntimeProfile) record.emitterRuntimeProfile = emitterRuntimeProfile;
    if (shapeProfile) record.shapeProfile = shapeProfile;
    return record;
  });
}

function effectHooksByResourcePath(effectHookManifest) {
  const lookup = new Map();
  for (const hook of effectHookManifest?.items || []) {
    for (const resourcePath of hook.resourcePaths || []) {
      const records = lookup.get(resourcePath) || [];
      records.push(hook);
      lookup.set(resourcePath, records);
    }
  }
  return lookup;
}

function pfxHookEffectOptionsProfile(binding = {}, surfaceRecords = []) {
  const options = binding?.effectOptions || {};
  const offsetValues = normalizedEffectOptionOffsetValues(options.offsetValues);
  const offsetValueKeys = Object.keys(offsetValues);
  const effectOptionOffsets = uniq([...optionStringList(binding.effectOptionOffsets), ...offsetValueKeys]).sort(sortNativeOptionOffset);
  const effectOptionFloatArgs = optionStringList(binding.effectOptionFloatArgs);
  const effectOptionArgKinds = optionStringList(binding.effectOptionArgKinds);
  const effectOptionArgSources = optionStringList(binding.effectOptionArgSources);
  const effectOptionRuntimeHintMatches = pfxEffectOptionRuntimeHintMatches(offsetValues, surfaceRecords);
  const effectOptionUnknownRuntimeHintMatches = pfxEffectOptionRuntimeHintMatches(offsetValues, surfaceRecords, { unknownOnly: true });
  const colorSource = Array.isArray(options.color) ? options.color : offsetValues["0xc0"];
  const color = (Array.isArray(colorSource) ? colorSource : [])
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 3)
    .map(roundFloat);
  const scaleValue = Number.isFinite(Number(options.scale)) ? Number(options.scale) : offsetValues["0xd0"]?.[0];
  const fadeSecondsValue = Number.isFinite(Number(options.fadeSeconds)) ? Number(options.fadeSeconds) : offsetValues["0xd8"]?.[0];
  const followTargetValue = Object.hasOwn(options, "followTarget")
    ? options.followTarget === true
    : Number.isFinite(Number(offsetValues["0x78"]?.[0]))
      ? Number(offsetValues["0x78"][0]) !== 0
      : null;
  const visibleOrActiveValue = Object.hasOwn(options, "visibleOrActive")
    ? options.visibleOrActive === true
    : Number.isFinite(Number(offsetValues["0xb0"]?.[0]))
      ? Number(offsetValues["0xb0"][0]) !== 0
      : null;
  const profile = {
    followTarget: followTargetValue,
    visibleOrActive: visibleOrActiveValue,
    hasColor: color.length >= 3,
    hasScale: Number.isFinite(Number(scaleValue)),
    hasFadeSeconds: Number.isFinite(Number(fadeSecondsValue)),
  };
  if (color.length >= 3) profile.color = color;
  if (Number.isFinite(Number(scaleValue))) profile.scale = roundFloat(Number(scaleValue));
  if (Number.isFinite(Number(fadeSecondsValue))) profile.fadeSeconds = roundFloat(Number(fadeSecondsValue));
  if (effectOptionOffsets.length) profile.effectOptionOffsets = effectOptionOffsets;
  if (effectOptionFloatArgs.length) profile.effectOptionFloatArgs = effectOptionFloatArgs;
  if (effectOptionArgKinds.length) profile.effectOptionArgKinds = effectOptionArgKinds;
  if (effectOptionArgSources.length) profile.effectOptionArgSources = effectOptionArgSources;
  if (effectOptionRuntimeHintMatches.length) profile.effectOptionRuntimeHintMatches = effectOptionRuntimeHintMatches;
  if (effectOptionUnknownRuntimeHintMatches.length) profile.effectOptionUnknownRuntimeHintMatches = effectOptionUnknownRuntimeHintMatches;
  if (offsetValueKeys.length) profile.offsetValues = offsetValues;
  return profile;
}

function pfxHookBindingProfile(hook = {}, surfaceRecords = []) {
  const binding = hook.runtimeBinding || {};
  const startSeconds = Number(binding.startSeconds ?? binding.runtimeStartSeconds);
  const surfaceTimelineWindow = pfxSurfaceTimelineWindow(surfaceRecords);
  const absoluteTimelineWindow = pfxAbsoluteTimelineWindow(surfaceTimelineWindow, startSeconds);
  return {
    token: hook.token || "",
    effectToken: hook.effectToken || hook.token || "",
    sourceKind: hook.sourceKind || "",
    kind: binding.kind || "",
    boneToken: binding.boneToken || hook.boneToken || "",
    ...(Number.isInteger(Number(binding.selectedAttachmentSlot))
      ? { selectedAttachmentSlot: Number(binding.selectedAttachmentSlot) }
      : {}),
    evidence: binding.evidence || "",
    actionKeys: uniq(hook.actionKeys || []),
    startSeconds: Number.isFinite(startSeconds) ? roundFloat(Math.max(0, startSeconds)) : null,
    timelineTimes: uniqSortedFiniteNumbers(binding.timelineTimes || []),
    ...(surfaceTimelineWindow ? { surfaceTimelineWindow } : {}),
    ...(absoluteTimelineWindow ? { absoluteTimelineWindow } : {}),
    effectOptions: pfxHookEffectOptionsProfile(binding, surfaceRecords),
  };
}

function pfxHookBindingProfiles(hooks = [], surfaceRecords = []) {
  const profiles = [];
  const seen = new Set();
  for (const hook of hooks) {
    const profile = pfxHookBindingProfile(hook, surfaceRecords);
    const key = JSON.stringify(profile);
    if (seen.has(key)) continue;
    seen.add(key);
    profiles.push(profile);
  }
  return profiles;
}

function buildPfxResourceManifest(effectRows, options = {}, generatedAt = new Date().toISOString()) {
  const hookLookup = effectHooksByResourcePath(options.effectHookManifest || {});
  const fallbackCallbackSemanticsByKeyLookup = pfxCallbackSemanticsByKeyLookup(
    options.nativeParticleFallbackCallbackSemantics || {},
  );
  const items = [];

  for (const row of effectRows || []) {
    const linkedPath = row.linkedPath || path.join(options.resourceRoot || "extracted/build_resources_by_path", row.relativePath || "");
    if (!row.relativePath || !fs.existsSync(linkedPath)) continue;
    const buffer = fs.readFileSync(linkedPath);
    const references = extractPfxReferences(buffer);
    const intrinsicEffectTokens = extractPfxIntrinsicEffectTokens(buffer);
    const surfaceRecords = extractPfxSurfaceRecords(
      buffer,
      references,
      options.nativeParticleRuntimeSchema || {},
      options.nativeBinaryVersionAudit || {},
      options.nativeParticleCallbackTableScan || {},
      options.nativeParticleCallbackSemantics || {},
      fallbackCallbackSemanticsByKeyLookup,
    );
    const shadergraphRefs = references.filter((ref) => ref.kind === "shadergraph");
    const surfaceIndices = uniqSortedNumbers(shadergraphRefs.map((ref) => ref.surfaceIndex));
    const hooks = hookLookup.get(row.relativePath) || [];

    items.push({
      relativePath: row.relativePath,
      hash: row.hash || "",
      size: Number(row.size || buffer.length),
      magic4: row.magic4 || buffer.subarray(0, 4).toString("latin1").replace(/[^\x20-\x7e]/g, "."),
      stringCount: extractPrintableStringRecords(buffer, 4).length,
      resourceRefCount: references.length,
      shadergraphRefCount: shadergraphRefs.length,
      uniqueShadergraphRefCount: uniq(shadergraphRefs.map((ref) => ref.relativePath)).length,
      surfaceIndices,
      maxSurfaceIndex: surfaceIndices.length ? Math.max(...surfaceIndices) : null,
      references,
      surfaceRecords,
      intrinsicEffectTokens,
      hookTokens: uniq(hooks.map((hook) => hook.token)),
      hookEffectTokens: uniq(hooks.map((hook) => hook.effectToken)),
      hookAbilityNames: uniq(hooks.map((hook) => hook.primaryAbilityContext?.runtimeAbilityName || "")),
      hookBindingProfiles: pfxHookBindingProfiles(hooks, surfaceRecords),
    });
  }

  items.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  applyVariantSiblingSurfaceSizeEvidence(items);

  return {
    generatedAt,
    summary: summarizePfxItems(items),
    items,
  };
}

function increment(map, key) {
  map[key || ""] = (map[key || ""] || 0) + 1;
}

function hasSurfaceRuntimeHints(record) {
  return Object.keys(record?.runtimeHints || {}).some((key) => key !== "timingSourceOffsets");
}

function summarizePfxItems(items) {
  const byTopLevel = {};
  const bySurfaceRenderFamily = {};
  const bySurfaceParameterEvidenceClass = {};
  const bySurfaceShapeEvidenceClass = {};
  const byHookRuntimeBindingKind = {};
  const byHookRuntimeSourceKind = {};
  const byNativeOptionArgKind = {};
  const byNativeOptionRuntimeHintMatch = {};
  const byUnknownNativeOptionRuntimeHintMatch = {};
  const byPfxEmitterRuntimeSemantic = {};
  const byPfxEmitterCallbackTargetArray = {};
  const byPfxEmitterCallbackResolver = {};
  const byPfxEmitterCallbackLayoutEvidence = {};
  const byPfxEmitterCallbackResolutionStatus = {};
  const byPfxEmitterCallbackInputKind = {};
  const byPfxEmitterCallbackResolverTableCompatibilityStatus = {};
  const byPfxEmitterCallbackCurrentBuildStatus = {};
  const byPfxEmitterCallbackCurrentSemanticClass = {};
  const byPfxEmitterCallbackCurrentConstantTarget = {};
  const byPfxEmitterCallbackCurrentVectorTarget = {};
  const byPfxEmitterCallbackPackedLiteralTarget = {};
  const byPfxEmitterCallbackPackedLiteralFloatCandidateTarget = {};
  const byPfxChildEmitterMode = {};
  const byPfxChildEmitterCallbackResolver = {};
  const byPfxChildEmitterCallbackResolutionStatus = {};
  const byPfxChildEmitterCallbackInputKind = {};
  const byPfxChildEmitterCallbackCurrentSemanticClass = {};
  const seenNativeOptionArgKinds = new Set();
  const seenNativeOptionRuntimeHintMatches = new Set();
  const seenUnknownNativeOptionRuntimeHintMatches = new Set();
  let nativeOptionRuntimeHintMatchRows = 0;
  let unknownNativeOptionRuntimeHintMatchRows = 0;
  let pfxEmitterCallbackCurrentConstantRows = 0;
  let pfxEmitterCallbackCurrentVectorRows = 0;
  let pfxEmitterCallbackPackedLiteralRows = 0;
  let pfxEmitterCallbackPackedLiteralFloatCandidateRows = 0;
  let pfxChildEmitterRecordRows = 0;
  let pfxChildEmitterCallbackRows = 0;
  let surfaceShapeProfileRows = 0;
  let surfaceShapeRenderableRows = 0;
  for (const item of items || []) {
    increment(byTopLevel, item.relativePath.split("/").slice(0, 2).join("/"));
    for (const profile of item.hookBindingProfiles || []) {
      increment(byHookRuntimeBindingKind, profile.kind || "unknown");
      increment(byHookRuntimeSourceKind, profile.sourceKind || "unknown");
      for (const argKind of profile.effectOptions?.effectOptionArgKinds || []) {
        const key = `${item.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
          profile.boneToken || ""
        }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}\t${argKind}`;
        if (seenNativeOptionArgKinds.has(key)) continue;
        seenNativeOptionArgKinds.add(key);
        increment(byNativeOptionArgKind, argKind);
      }
      for (const match of profile.effectOptions?.effectOptionRuntimeHintMatches || []) {
        const key = `${item.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
          profile.boneToken || ""
        }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}\t${match}`;
        if (seenNativeOptionRuntimeHintMatches.has(key)) continue;
        seenNativeOptionRuntimeHintMatches.add(key);
        nativeOptionRuntimeHintMatchRows += 1;
        const semanticMatch = String(match).match(/^0x[0-9a-f]+:([^:]+):/i);
        increment(byNativeOptionRuntimeHintMatch, semanticMatch?.[1] || "unknown");
      }
      for (const match of profile.effectOptions?.effectOptionUnknownRuntimeHintMatches || []) {
        const key = `${item.relativePath}\t${profile.effectToken || profile.token || ""}\t${profile.kind || ""}\t${
          profile.boneToken || ""
        }\t${profile.selectedAttachmentSlot ?? ""}\t${profile.startSeconds ?? ""}\t${match}`;
        if (seenUnknownNativeOptionRuntimeHintMatches.has(key)) continue;
        seenUnknownNativeOptionRuntimeHintMatches.add(key);
        unknownNativeOptionRuntimeHintMatchRows += 1;
        const semanticMatch = String(match).match(/^0x[0-9a-f]+:([^:]+):/i);
        increment(byUnknownNativeOptionRuntimeHintMatch, semanticMatch?.[1] || "unknown");
      }
    }
    for (const record of item.surfaceRecords || []) {
      increment(bySurfaceRenderFamily, record.prelude?.renderFamily || "unknown");
      if (record.parameterProfile?.semanticSlots?.length) {
        increment(bySurfaceParameterEvidenceClass, record.parameterProfile.evidenceClass);
      }
      if (record.shapeProfile?.evidenceClass) {
        surfaceShapeProfileRows += 1;
        increment(bySurfaceShapeEvidenceClass, record.shapeProfile.evidenceClass);
        if (Number.isFinite(record.shapeProfile.renderSizeScalar)) surfaceShapeRenderableRows += 1;
      }
      for (const slot of record.emitterRuntimeProfile?.semanticSlots || []) {
        increment(byPfxEmitterRuntimeSemantic, slot.name);
        if (slot.callbackLayoutEvidence) increment(byPfxEmitterCallbackLayoutEvidence, slot.callbackLayoutEvidence);
        if (slot.targetArrayOffset) increment(byPfxEmitterCallbackTargetArray, slot.targetArrayOffset);
        if (slot.resolverFunction) increment(byPfxEmitterCallbackResolver, slot.resolverFunction);
        if (slot.resolverResolutionStatus) increment(byPfxEmitterCallbackResolutionStatus, slot.resolverResolutionStatus);
        if (slot.resolverInputKind) increment(byPfxEmitterCallbackInputKind, slot.resolverInputKind);
        if (slot.resolverTableCompatibilityStatus) {
          increment(byPfxEmitterCallbackResolverTableCompatibilityStatus, slot.resolverTableCompatibilityStatus);
        }
        if (slot.resolverCurrentBuildStatus) increment(byPfxEmitterCallbackCurrentBuildStatus, slot.resolverCurrentBuildStatus);
        if (slot.resolverCurrentCallbackSemanticClass) {
          increment(byPfxEmitterCallbackCurrentSemanticClass, slot.resolverCurrentCallbackSemanticClass);
        }
        if (Number.isFinite(slot.resolverCurrentCallbackConstantValue)) {
          pfxEmitterCallbackCurrentConstantRows += 1;
          increment(byPfxEmitterCallbackCurrentConstantTarget, slot.targetArraySemantic || slot.name || "unknown");
        }
        if (Array.isArray(slot.resolverCurrentCallbackVectorValue) && slot.resolverCurrentCallbackVectorValue.length) {
          pfxEmitterCallbackCurrentVectorRows += 1;
          increment(byPfxEmitterCallbackCurrentVectorTarget, slot.targetArraySemantic || slot.name || "unknown");
        }
        if (slot.resolverInputKind === "packed-literal") {
          pfxEmitterCallbackPackedLiteralRows += 1;
          increment(byPfxEmitterCallbackPackedLiteralTarget, slot.targetArraySemantic || slot.name || "unknown");
        }
        if (Array.isArray(slot.resolverPackedLiteralFloatCandidates) && slot.resolverPackedLiteralFloatCandidates.length) {
          pfxEmitterCallbackPackedLiteralFloatCandidateRows += 1;
          increment(byPfxEmitterCallbackPackedLiteralFloatCandidateTarget, slot.targetArraySemantic || slot.name || "unknown");
        }
      }
      for (const childRecord of record.childEmitterRecords || []) {
        pfxChildEmitterRecordRows += 1;
        increment(byPfxChildEmitterMode, String(childRecord.mode));
        for (const slot of childRecord.runtimeProfile?.semanticSlots || []) {
          pfxChildEmitterCallbackRows += 1;
          if (slot.resolverFunction) increment(byPfxChildEmitterCallbackResolver, slot.resolverFunction);
          if (slot.resolverResolutionStatus) increment(byPfxChildEmitterCallbackResolutionStatus, slot.resolverResolutionStatus);
          if (slot.resolverInputKind) increment(byPfxChildEmitterCallbackInputKind, slot.resolverInputKind);
          if (slot.resolverCurrentCallbackSemanticClass) {
            increment(byPfxChildEmitterCallbackCurrentSemanticClass, slot.resolverCurrentCallbackSemanticClass);
          }
        }
      }
    }
  }
  return {
    rows: items.length,
    referencedShadergraphRows: items.filter((item) => item.shadergraphRefCount > 0).length,
    totalShadergraphRefs: items.reduce((sum, item) => sum + item.shadergraphRefCount, 0),
    uniqueShadergraphRefs: uniq(items.flatMap((item) => item.references.filter((ref) => ref.kind === "shadergraph").map((ref) => ref.relativePath))).length,
    intrinsicEffectTokenRows: items.filter((item) => item.intrinsicEffectTokens.length > 0).length,
    hookLinkedRows: items.filter((item) => item.hookTokens.length > 0).length,
    hookBindingProfileRows: items.reduce((sum, item) => sum + (item.hookBindingProfiles?.length || 0), 0),
    nativeTimedHookBindingRows: items.reduce(
      (sum, item) =>
        sum +
        (item.hookBindingProfiles || []).filter((profile) => profile.startSeconds !== null || profile.timelineTimes?.length).length,
      0,
    ),
    surfaceTimelineWindowRows: items.reduce(
      (sum, item) => sum + (item.hookBindingProfiles || []).filter((profile) => profile.surfaceTimelineWindow).length,
      0,
    ),
    absoluteTimelineWindowRows: items.reduce(
      (sum, item) => sum + (item.hookBindingProfiles || []).filter((profile) => profile.absoluteTimelineWindow).length,
      0,
    ),
    surfaceRecordRows: items.reduce((sum, item) => sum + (item.surfaceRecords?.length || 0), 0),
    standardSurfaceRecordRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.recordLength === 350).length,
      0,
    ),
    extendedSurfaceRecordRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.recordLength > 350).length,
      0,
    ),
    surfaceRuntimeHintRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => hasSurfaceRuntimeHints(record)).length,
      0,
    ),
    surfaceParameterProfileRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.parameterProfile?.semanticSlots?.length).length,
      0,
    ),
    surfaceShapeProfileRows,
    surfaceShapeRenderableRows,
    surfaceLifecycleProfileRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.parameterProfile?.lifecycleOffsets?.length).length,
      0,
    ),
    surfaceTransformProfileRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.parameterProfile?.transformOffsets?.length).length,
      0,
    ),
    pfxEmitterRuntimeProfileRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.emitterRuntimeProfile?.semanticSlots?.length).length,
      0,
    ),
    pfxEmitterLifecycleRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.emitterRuntimeProfile?.lifecycleOffsets?.length).length,
      0,
    ),
    pfxEmitterTransformRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.emitterRuntimeProfile?.transformOffsets?.length).length,
      0,
    ),
    pfxEmitterColorRows: items.reduce(
      (sum, item) => sum + (item.surfaceRecords || []).filter((record) => record.emitterRuntimeProfile?.colorOffsets?.length).length,
      0,
    ),
    bySurfaceRenderFamily,
    bySurfaceParameterEvidenceClass,
    bySurfaceShapeEvidenceClass,
    byPfxEmitterRuntimeSemantic,
    byPfxEmitterCallbackTargetArray,
    byPfxEmitterCallbackResolver,
    byPfxEmitterCallbackLayoutEvidence,
    byPfxEmitterCallbackResolutionStatus,
    byPfxEmitterCallbackInputKind,
    byPfxEmitterCallbackResolverTableCompatibilityStatus,
    byPfxEmitterCallbackCurrentBuildStatus,
    byPfxEmitterCallbackCurrentSemanticClass,
    pfxEmitterCallbackCurrentConstantRows,
    pfxEmitterCallbackCurrentVectorRows,
    pfxEmitterCallbackPackedLiteralRows,
    pfxEmitterCallbackPackedLiteralFloatCandidateRows,
    pfxChildEmitterRecordRows,
    pfxChildEmitterCallbackRows,
    byPfxEmitterCallbackCurrentConstantTarget,
    byPfxEmitterCallbackCurrentVectorTarget,
    byPfxEmitterCallbackPackedLiteralTarget,
    byPfxEmitterCallbackPackedLiteralFloatCandidateTarget,
    byPfxChildEmitterMode,
    byPfxChildEmitterCallbackResolver,
    byPfxChildEmitterCallbackResolutionStatus,
    byPfxChildEmitterCallbackInputKind,
    byPfxChildEmitterCallbackCurrentSemanticClass,
    byHookRuntimeBindingKind,
    byHookRuntimeSourceKind,
    byNativeOptionArgKind,
    nativeOptionRuntimeHintMatchRows,
    byNativeOptionRuntimeHintMatch,
    unknownNativeOptionRuntimeHintMatchRows,
    byUnknownNativeOptionRuntimeHintMatch,
    byTopLevel,
  };
}

function surfaceRuntimeHintSummary(record) {
  const hints = record.runtimeHints || {};
  const parts = [];
  if (Number.isFinite(hints.delaySeconds)) parts.push(`delay=${hints.delaySeconds}`);
  if (Number.isFinite(hints.durationSeconds)) parts.push(`duration=${hints.durationSeconds}`);
  if (Number.isFinite(hints.sizeScalar)) parts.push(`size=${hints.sizeScalar}`);
  if (Number.isFinite(hints.rotationDegrees)) parts.push(`rotation=${hints.rotationDegrees}`);
  return parts.length ? `${record.surfaceIndex}:${parts.join(",")}` : "";
}

function surfaceParameterProfileSummary(record) {
  const profile = record.parameterProfile || {};
  const slots = profile.semanticSlots || [];
  if (!slots.length) return "";
  const parts = slots.map((slot) => `${slot.name}@${slot.relativeOffset}=${slot.value}`);
  return `${record.surfaceIndex}:${profile.evidenceClass}:${parts.join(",")}`;
}

function shapeCallbackRuntimeSlot(record, callback = {}) {
  const slots = record.emitterRuntimeProfile?.semanticSlots || [];
  if (!slots.length) return {};
  return (
    slots.find(
      (slot) =>
        Number.isFinite(Number(callback.relativeOffset)) &&
        Number.isFinite(Number(slot.relativeOffset)) &&
        Number(slot.relativeOffset) === Number(callback.relativeOffset),
    ) ||
    slots.find(
      (slot) =>
        callback.runtimeOffset &&
        slot.runtimeOffset &&
        String(slot.runtimeOffset) === String(callback.runtimeOffset) &&
        (!callback.targetArraySemantic || !slot.targetArraySemantic || slot.targetArraySemantic === callback.targetArraySemantic),
    ) ||
    {}
  );
}

function surfaceShapeProfileSummary(record) {
  const profile = record.shapeProfile || {};
  if (!profile.evidenceClass) return "";
  const callback = profile.sizeCallback || {};
  const runtimeSlot = shapeCallbackRuntimeSlot(record, callback);
  const parts = [`shape=${profile.evidenceClass}`];
  if (Number.isFinite(profile.renderSizeScalar)) parts.push(`renderSize=${profile.renderSizeScalar}`);
  if (callback.targetArraySemantic) parts.push(`target=${callback.targetArraySemantic}@${callback.targetArrayOffset || ""}`);
  if (callback.callbackOutputComponents || runtimeSlot.callbackOutputComponents) {
    parts.push(`components=${callback.callbackOutputComponents || runtimeSlot.callbackOutputComponents}`);
  }
  if (callback.resolverCurrentCallbackOutputStore || runtimeSlot.resolverCurrentCallbackOutputStore) {
    parts.push(`currentStore=${callback.resolverCurrentCallbackOutputStore || runtimeSlot.resolverCurrentCallbackOutputStore}`);
  }
  const currentDependencyFlags = callback.resolverCurrentCallbackDependencyFlags || runtimeSlot.resolverCurrentCallbackDependencyFlags || [];
  if (currentDependencyFlags.length) parts.push(`currentDeps=${currentDependencyFlags.join(",")}`);
  if (callback.resolverCurrentCallbackPattern16ReadStatus || runtimeSlot.resolverCurrentCallbackPattern16ReadStatus) {
    parts.push(`pattern16Read=${callback.resolverCurrentCallbackPattern16ReadStatus || runtimeSlot.resolverCurrentCallbackPattern16ReadStatus}`);
  }
  if (callback.resolverCurrentCallbackCurveTableReadStatus || runtimeSlot.resolverCurrentCallbackCurveTableReadStatus) {
    parts.push(`curveTableRead=${callback.resolverCurrentCallbackCurveTableReadStatus || runtimeSlot.resolverCurrentCallbackCurveTableReadStatus}`);
  }
  if (callback.resolverResolutionStatus) parts.push(`resolution=${callback.resolverResolutionStatus}`);
  return `${record.surfaceIndex}:${parts.join(",")}`;
}

function pfxEmitterRuntimeProfileSummary(record) {
  const profile = record.emitterRuntimeProfile || {};
  const slots = profile.semanticSlots || [];
  if (!slots.length) return "";
  const parts = slots.map((slot) => {
    const target = slot.targetArraySemantic ? `->${slot.targetArraySemantic}@${slot.targetArrayOffset}` : "";
    const resolver = slot.resolverFunction ? `:resolver=${slot.resolverFunction}` : "";
    const table = slot.resolverTableCompatibilityStatus ? `:table=${slot.resolverTableCompatibilityStatus}` : "";
    const current = slot.resolverCurrentBuildStatus ? `:current=${slot.resolverCurrentBuildStatus}` : "";
    const callback = slot.resolverCurrentCallbackAddress ? `:callback=${slot.resolverCurrentCallbackAddress}` : "";
    const semanticClass = slot.resolverCurrentCallbackSemanticClass ? `:class=${slot.resolverCurrentCallbackSemanticClass}` : "";
    const constant = Number.isFinite(slot.resolverCurrentCallbackConstantValue)
      ? `:constant=${slot.resolverCurrentCallbackConstantValue}`
      : "";
    const vector = Array.isArray(slot.resolverCurrentCallbackVectorValue)
      ? `:vector=${slot.resolverCurrentCallbackVectorValue.join("|")}`
      : "";
    const packedBytes = Array.isArray(slot.resolverPackedLiteralBytes)
      ? `:packedBytes=${slot.resolverPackedLiteralBytes.join("|")}`
      : "";
    const packedFloatCandidates = Array.isArray(slot.resolverPackedLiteralFloatCandidates)
      ? slot.resolverPackedLiteralFloatCandidates
          .slice(0, 4)
          .map((candidate) => `packedFloat@${candidate.byteOffset}=${candidate.value}`)
          .join("|")
      : "";
    const packedFloat = packedFloatCandidates ? `:${packedFloatCandidates}` : "";
    const packedColorCandidates = Array.isArray(slot.resolverPackedLiteralColorCandidates)
      ? slot.resolverPackedLiteralColorCandidates
          .slice(0, 4)
          .map((candidate) => `packedColor@${candidate.byteOffset}=${candidate.rgbHex}`)
          .join("|")
      : "";
    const packedColor = packedColorCandidates ? `:${packedColorCandidates}` : "";
    const input = slot.resolverInputKind ? `:input=${slot.resolverInputKind}` : "";
    const resolution = slot.resolverResolutionStatus ? `:resolution=${slot.resolverResolutionStatus}` : "";
    const layout = slot.callbackLayoutEvidence ? `:layout=${slot.callbackLayoutEvidence}` : "";
    return `${slot.name}@${slot.relativeOffset}=${slot.value}${target}${resolver}${table}${current}${callback}${semanticClass}${constant}${vector}${packedBytes}${packedFloat}${packedColor}${input}${resolution}${layout}`;
  });
  return `${record.surfaceIndex}:${profile.evidenceClass}:${parts.join(",")}`;
}

function hookBindingProfileSummary(profile) {
  const parts = [
    profile.effectToken || profile.token,
    profile.kind,
    profile.boneToken,
    profile.evidence,
    profile.startSeconds !== null ? `start=${profile.startSeconds}` : "",
    profile.timelineTimes?.length ? `timeline=${profile.timelineTimes.join(",")}` : "",
  ].filter(Boolean);
  return parts.join(":");
}

function reportRowsForManifest(manifest) {
  return (manifest.items || []).map((item) => ({
    relativePath: item.relativePath,
    hash: item.hash,
    size: item.size,
    stringCount: item.stringCount,
    resourceRefCount: item.resourceRefCount,
    shadergraphRefCount: item.shadergraphRefCount,
    uniqueShadergraphRefCount: item.uniqueShadergraphRefCount,
    surfaceIndices: item.surfaceIndices.join("|"),
    maxSurfaceIndex: item.maxSurfaceIndex ?? "",
    surfaceRecordCount: item.surfaceRecords?.length || 0,
    surfaceRecordLengths: uniqSortedNumbers((item.surfaceRecords || []).map((record) => record.recordLength)).join("|"),
    surfaceRecordPreludes: uniq((item.surfaceRecords || []).map((record) => record.preludeHex)).join("|"),
    surfaceRenderFamilies: uniq((item.surfaceRecords || []).map((record) => record.prelude?.renderFamily || "")).join("|"),
    surfaceRuntimeHints: (item.surfaceRecords || []).map(surfaceRuntimeHintSummary).filter(Boolean).join("|"),
    surfaceParameterProfiles: (item.surfaceRecords || []).map(surfaceParameterProfileSummary).filter(Boolean).join("|"),
    surfaceShapeProfiles: (item.surfaceRecords || []).map(surfaceShapeProfileSummary).filter(Boolean).join("|"),
    pfxEmitterRuntimeProfiles: (item.surfaceRecords || []).map(pfxEmitterRuntimeProfileSummary).filter(Boolean).join("|"),
    shadergraphRefs: uniq(item.references.filter((ref) => ref.kind === "shadergraph").map((ref) => ref.relativePath)).join("|"),
    intrinsicEffectTokens: (item.intrinsicEffectTokens || []).join("|"),
    hookTokens: item.hookTokens.join("|"),
    hookEffectTokens: item.hookEffectTokens.join("|"),
    hookAbilityNames: item.hookAbilityNames.join("|"),
    hookBindingProfiles: (item.hookBindingProfiles || []).map(hookBindingProfileSummary).join("|"),
  }));
}

function exportPfxResourceManifest({
  effectResourcePath = defaultEffectResourcePath,
  effectHookManifestPath = defaultEffectHookManifestPath,
  nativeParticleRuntimeSchemaPath = defaultNativeParticleRuntimeSchemaPath,
  nativeBinaryVersionAuditPath = defaultNativeBinaryVersionAuditPath,
  nativeParticleCallbackTableScanPath = defaultNativeParticleCallbackTableScanPath,
  nativeParticleCallbackSemanticsPath = defaultNativeParticleCallbackSemanticsPath,
  nativeParticleFallbackCallbackSemanticsPath = defaultNativeParticleFallbackCallbackSemanticsPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const effectHookManifest = fs.existsSync(effectHookManifestPath)
    ? JSON.parse(fs.readFileSync(effectHookManifestPath, "utf8"))
    : { items: [] };
  const nativeParticleRuntimeSchema = fs.existsSync(nativeParticleRuntimeSchemaPath)
    ? JSON.parse(fs.readFileSync(nativeParticleRuntimeSchemaPath, "utf8"))
    : { items: [] };
  const nativeBinaryVersionAudit = fs.existsSync(nativeBinaryVersionAuditPath)
    ? JSON.parse(fs.readFileSync(nativeBinaryVersionAuditPath, "utf8"))
    : { items: [], summary: null };
  const nativeParticleCallbackTableScan = fs.existsSync(nativeParticleCallbackTableScanPath)
    ? JSON.parse(fs.readFileSync(nativeParticleCallbackTableScanPath, "utf8"))
    : { items: [], summary: null };
  const nativeParticleCallbackSemantics = fs.existsSync(nativeParticleCallbackSemanticsPath)
    ? JSON.parse(fs.readFileSync(nativeParticleCallbackSemanticsPath, "utf8"))
    : { items: [], summary: null };
  const nativeParticleFallbackCallbackSemantics = fs.existsSync(nativeParticleFallbackCallbackSemanticsPath)
    ? JSON.parse(fs.readFileSync(nativeParticleFallbackCallbackSemanticsPath, "utf8"))
    : { items: [], summary: null };
  const manifest = buildPfxResourceManifest(readTsv(effectResourcePath), {
    effectHookManifest,
    nativeParticleRuntimeSchema,
    nativeBinaryVersionAudit,
    nativeParticleCallbackTableScan,
    nativeParticleCallbackSemantics,
    nativeParticleFallbackCallbackSemantics,
  });
  manifest.source = {
    effectResourcePath,
    effectHookManifestPath,
    nativeParticleRuntimeSchemaPath,
    nativeBinaryVersionAuditPath,
    nativeParticleCallbackTableScanPath,
    nativeParticleCallbackSemanticsPath,
    nativeParticleFallbackCallbackSemanticsPath,
  };

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);

  writeTsv(tsvOut, reportRowsForManifest(manifest), [
    "relativePath",
    "hash",
    "size",
    "stringCount",
    "resourceRefCount",
    "shadergraphRefCount",
    "uniqueShadergraphRefCount",
    "surfaceIndices",
    "maxSurfaceIndex",
    "surfaceRecordCount",
    "surfaceRecordLengths",
    "surfaceRecordPreludes",
    "surfaceRenderFamilies",
    "surfaceRuntimeHints",
    "surfaceParameterProfiles",
    "surfaceShapeProfiles",
    "pfxEmitterRuntimeProfiles",
    "shadergraphRefs",
    "intrinsicEffectTokens",
    "hookTokens",
    "hookEffectTokens",
    "hookAbilityNames",
    "hookBindingProfiles",
  ]);

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: manifest.generatedAt, summary: manifest.summary }, null, 2)}\n`);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportPfxResourceManifest({
    effectResourcePath: optionValue(args, "--effects", defaultEffectResourcePath),
    effectHookManifestPath: optionValue(args, "--effect-hooks", defaultEffectHookManifestPath),
    nativeParticleRuntimeSchemaPath: optionValue(args, "--native-particle-runtime-schema", defaultNativeParticleRuntimeSchemaPath),
    nativeBinaryVersionAuditPath: optionValue(args, "--native-binary-version-audit", defaultNativeBinaryVersionAuditPath),
    nativeParticleCallbackTableScanPath: optionValue(
      args,
      "--native-particle-callback-table-scan",
      defaultNativeParticleCallbackTableScanPath,
    ),
    nativeParticleCallbackSemanticsPath: optionValue(
      args,
      "--native-particle-callback-semantics",
      defaultNativeParticleCallbackSemanticsPath,
    ),
    nativeParticleFallbackCallbackSemanticsPath: optionValue(
      args,
      "--native-particle-fallback-callback-semantics",
      defaultNativeParticleFallbackCallbackSemanticsPath,
    ),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildPfxResourceManifest,
  exportPfxResourceManifest,
  extractPfxIntrinsicEffectTokens,
  extractPfxNativeEmitterRecords,
  extractPfxReferences,
  extractPfxSurfaceRecords,
  normalizePfxReference,
  reportRowsForManifest,
  summarizePfxItems,
};
