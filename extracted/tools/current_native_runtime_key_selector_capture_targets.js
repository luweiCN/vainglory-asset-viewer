#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultRuntimeScript = "extracted/reports/frida_dump_runtime_key_selector.js";
const defaultViewerOut = "extracted/viewer/current-native-runtime-key-selector-capture-targets.json";
const defaultJsonOut = "extracted/reports/current_native_runtime_key_selector_capture_targets.json";
const defaultTsvOut = "extracted/reports/current_native_runtime_key_selector_capture_targets.tsv";

const hookTargets = [
  {
    name: "runtime-resource-key-global-setter",
    offset: 0xbebf7c,
    expectedOpcodeHex: "d0012328",
    captureKind: "runtime-key-global-cache",
    emittedEvents: ["global-key-setter", "global-key-setter-leave"],
    reason: "capture runtime key writes into the global cache before active preview level/profile selection consumes them",
  },
  {
    name: "runtime-resource-key-global-resolver",
    offset: 0xbebf9c,
    expectedOpcodeHex: "a9bf7bfd",
    captureKind: "runtime-key-global-cache",
    emittedEvents: ["global-key-resolver"],
    reason: "capture runtime key resolver returns and global cache state transitions",
  },
  {
    name: "runtime-resource-key-post-accessor",
    offset: 0xbec044,
    expectedOpcodeHex: "f9401000",
    captureKind: "runtime-key-resolved-accessor",
    emittedEvents: ["post-accessor-return"],
    reason: "capture the concrete cached key returned to the level setup query callsite",
  },
  {
    name: "active-level-setup-dispatch-callsite",
    offset: 0x8befac,
    expectedOpcodeHex: "943f3ce3",
    captureKind: "active-helper-level-setup",
    emittedEvents: ["active-helper-8befac"],
    reason: "capture the active helper key, payload count, and owner pointer at the level setup dispatch callsite",
  },
  {
    name: "resolved-key-owner-primary-callback",
    offset: 0x8bef18,
    expectedOpcodeHex: "d10143ff",
    captureKind: "resolved-key-owner-callback",
    emittedEvents: ["resolved-key-owner-primary-callback"],
    reason: "capture the owner callback that participates in runtime resolved-key requests",
  },
  {
    name: "character-lobby-key-switch",
    offset: 0xa7ca30,
    expectedOpcodeHex: "d10143ff",
    captureKind: "character-lobby-key-switch",
    emittedEvents: ["character-lobby-key-switch"],
    reason: "separate lobby/character key switches from active preview level/profile selection",
  },
  {
    name: "typed-object-runtime-key-selection-payload-helper",
    offset: 0x82d870,
    expectedOpcodeHex: "d10143ff",
    captureKind: "typed-object-046f-payload",
    emittedEvents: ["typed-object-046f-payload-helper-enter", "typed-object-046f-payload-helper-leave"],
    reason: "capture typed-object 0x046f payload fields that may feed runtime key selection",
  },
  {
    name: "typed-object-runtime-key-selection-helper",
    offset: 0x8bf530,
    expectedOpcodeHex: "d10203ff",
    captureKind: "typed-object-046f-key-selection",
    emittedEvents: ["typed-object-046f-key-selection-enter", "typed-object-046f-key-selection-leave"],
    reason: "capture typed-object 0x046f selected key values and flags",
  },
  {
    name: "typed-object-inline-key-writer-helper",
    offset: 0x82b68c,
    expectedOpcodeHex: "d10443ff",
    captureKind: "typed-object-03e9-inline-key",
    emittedEvents: ["typed-object-03e9-inline-key-writer", "typed-object-03e9-inline-key-writer-leave"],
    reason: "capture inline typed-object keys written into payload +0x20",
  },
  {
    name: "object-builder-b-parser-wrapper",
    offset: 0x82adb8,
    expectedOpcodeHex: "a9ba6ffc",
    captureKind: "object-builder-b-parser",
    emittedEvents: ["typed-object-03f3-object-builder-b-parser"],
    reason: "capture object-builder-B payload words before level setup dispatch",
  },
  {
    name: "object-builder-b-level-setup-dispatch-callsite",
    offset: 0xc04b98,
    expectedOpcodeHex: "943225e8",
    captureKind: "object-builder-b-level-setup",
    emittedEvents: ["object-builder-b-helper-c04b98"],
    reason: "capture object-builder-B keys at the level setup helper callsite",
  },
  {
    name: "level-setup-registered-callback",
    offset: 0xc79ad4,
    expectedOpcodeHex: "a9bd57f6",
    captureKind: "level-setup-callback",
    emittedEvents: ["level-setup-registered-callback"],
    reason: "capture actual runtime Level setup callback invocations after key selection",
  },
  {
    name: "level-visuals-loader",
    offset: 0x8cbf40,
    expectedOpcodeHex: "d10243ff",
    captureKind: "level-visuals-loader",
    emittedEvents: ["level-visuals-loader"],
    reason: "capture LevelVisuals ref keys from the runtime Level object",
  },
  {
    name: "level-visuals-apply-processor",
    offset: 0x8cc27c,
    expectedOpcodeHex: "d10243ff",
    captureKind: "level-visuals-apply",
    emittedEvents: ["level-visuals-apply-processor"],
    reason: "capture LevelVisuals field snapshots, apply routes, and profile payload at +0x50",
  },
  {
    name: "lightfield-profile-loader-candidate",
    offset: 0xe36f38,
    expectedOpcodeHex: "d0011708",
    captureKind: "lightfield-profile-loader",
    emittedEvents: ["lightfield-profile-loader-candidate"],
    reason: "capture the lightfield profile request that the scene probe service loads",
  },
  {
    name: "scene-probe-position-sample-upload",
    offset: 0xe36efc,
    expectedOpcodeHex: "a9be4ff4",
    captureKind: "scene-probe-position-sample",
    emittedEvents: ["scene-probe-position-sample-upload"],
    reason: "capture concrete scene probe sample positions used by the original runtime",
  },
  {
    name: "scene-probe-lightfield-position-sampler",
    offset: 0xe38ea8,
    expectedOpcodeHex: "f9401408",
    captureKind: "scene-probe-lightfield-sampler",
    emittedEvents: ["scene-probe-lightfield-position-sampler", "scene-probe-lightfield-position-sampler-leave"],
    reason: "capture lightfield position sampling inputs and returned Probe.Samples vec4 values",
  },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
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

function fileOffsetForVirtualAddress(elf, virtualAddress, byteLength = 4) {
  for (const segment of elf.loads) {
    if (virtualAddress >= segment.virtualAddress && virtualAddress + byteLength <= segment.virtualAddress + segment.fileSize) {
      return segment.fileOffset + (virtualAddress - segment.virtualAddress);
    }
  }
  return -1;
}

function instructionHexAt(buffer, elf, virtualAddress) {
  const fileOffset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  return fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
}

function scriptEvidenceForTarget(scriptText, spec) {
  const scriptHookPresent = scriptText.includes(`"${spec.name}"`) || scriptText.includes(spec.name);
  const missingEvents = spec.emittedEvents.filter((eventName) => !scriptText.includes(`event: "${eventName}"`));
  return {
    scriptHookPresent,
    scriptEventPresent: missingEvents.length === 0,
    missingEvents,
  };
}

function rowForTarget(buffer, elf, scriptText, spec) {
  const actualOpcodeHex = instructionHexAt(buffer, elf, spec.offset);
  const scriptEvidence = scriptEvidenceForTarget(scriptText, spec);
  return {
    source: "hook-target",
    name: spec.name,
    addressHex: hex(spec.offset),
    expectedOpcodeHex: spec.expectedOpcodeHex,
    actualOpcodeHex,
    opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
    captureKind: spec.captureKind,
    emittedEvents: spec.emittedEvents.join("|"),
    scriptHookPresent: scriptEvidence.scriptHookPresent,
    scriptEventPresent: scriptEvidence.scriptEventPresent,
    missingEvents: scriptEvidence.missingEvents.join("|"),
    reason: spec.reason,
    renderPromotionAllowed: false,
  };
}

function hasReadyHook(rows, name) {
  return rows.some((row) => row.name === name && row.opcodeMatches && row.scriptHookPresent && row.scriptEventPresent);
}

function buildCurrentNativeRuntimeKeySelectorCaptureTargets(
  { binaryPath = defaultBinary, runtimeScriptPath = defaultRuntimeScript } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const scriptText = fs.existsSync(runtimeScriptPath) ? fs.readFileSync(runtimeScriptPath, "utf8") : "";
  const rows = hookTargets.map((spec) => rowForTarget(buffer, elf, scriptText, spec));
  const opcodeMismatchRows = rows.filter((row) => !row.opcodeMatches).length;
  const scriptEvidenceMismatchRows = rows.filter((row) => !row.scriptHookPresent || !row.scriptEventPresent).length;
  const activePreviewKeyHooksReady =
    hasReadyHook(rows, "active-level-setup-dispatch-callsite") &&
    hasReadyHook(rows, "runtime-resource-key-post-accessor") &&
    hasReadyHook(rows, "runtime-resource-key-global-resolver");
  const objectBuilderBHooksReady =
    hasReadyHook(rows, "object-builder-b-parser-wrapper") &&
    hasReadyHook(rows, "object-builder-b-level-setup-dispatch-callsite");
  const typedObjectKeyHooksReady =
    hasReadyHook(rows, "typed-object-runtime-key-selection-payload-helper") &&
    hasReadyHook(rows, "typed-object-runtime-key-selection-helper") &&
    hasReadyHook(rows, "typed-object-inline-key-writer-helper");
  const levelVisualsHooksReady =
    hasReadyHook(rows, "level-setup-registered-callback") &&
    hasReadyHook(rows, "level-visuals-loader") &&
    hasReadyHook(rows, "level-visuals-apply-processor");
  const lightProbeHooksReady =
    hasReadyHook(rows, "lightfield-profile-loader-candidate") &&
    hasReadyHook(rows, "scene-probe-position-sample-upload") &&
    hasReadyHook(rows, "scene-probe-lightfield-position-sampler");
  const runtimeSelectorHooksReady = opcodeMismatchRows === 0 && scriptEvidenceMismatchRows === 0;
  const summary = {
    hookTargetRows: rows.length,
    opcodeMismatchRows,
    scriptHookRows: rows.filter((row) => row.scriptHookPresent).length,
    scriptEventRows: rows.filter((row) => row.scriptEventPresent).length,
    scriptEvidenceMismatchRows,
    captureScriptPresent: Boolean(scriptText),
    runtimeSelectorHooksReady,
    activePreviewKeyHooksReady,
    objectBuilderBHooksReady,
    typedObjectKeyHooksReady,
    levelVisualsHooksReady,
    lightProbeProfileHooksReady: hasReadyHook(rows, "lightfield-profile-loader-candidate"),
    lightProbePositionHooksReady:
      hasReadyHook(rows, "scene-probe-position-sample-upload") &&
      hasReadyHook(rows, "scene-probe-lightfield-position-sampler"),
    lightProbeSampleValueHooksReady: hasReadyHook(rows, "scene-probe-lightfield-position-sampler"),
    lightProbeHooksReady,
    runtimeCaptureRequiredRows: 1,
    activePreviewRuntimeValuesRecovered: false,
    runtimeLightProbeValuesRecovered: false,
    rendererProfileTakeoverAllowed: false,
    rendererLightProbeTakeoverAllowed: false,
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    binaryPath,
    runtimeScriptPath,
    policy:
      "diagnostic-only runtime key selector/light probe capture targets; validates original hook points and existing Frida event coverage without enabling rendering",
    summary,
    items: rows,
    interpretation: {
      recovered:
        "Current Android hook targets cover runtime key cache access, active helper level setup, typed-object key producers, object-builder-B level setup, LevelVisuals loading/apply, lightfield profile loading, and scene probe position/sample values.",
      boundary:
        "This proves where to capture original runtime values. It does not import a capture, choose a hero preview profile, recover concrete Probe.Samples values, or allow renderer takeover.",
      nextRequiredEvidence:
        "Run extracted/reports/frida_dump_runtime_key_selector.js against the original runtime, summarize it with runtime_key_selector_capture_summary.js, and require same-sequence key -> Level -> LevelVisuals -> profile -> position -> Probe.Samples evidence before changing viewer lighting.",
    },
  };
}

function exportCurrentNativeRuntimeKeySelectorCaptureTargets({
  binaryPath = defaultBinary,
  runtimeScriptPath = defaultRuntimeScript,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeRuntimeKeySelectorCaptureTargets({ binaryPath, runtimeScriptPath });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, [
    "source",
    "name",
    "addressHex",
    "expectedOpcodeHex",
    "actualOpcodeHex",
    "opcodeMatches",
    "captureKind",
    "emittedEvents",
    "scriptHookPresent",
    "scriptEventPresent",
    "missingEvents",
    "reason",
    "renderPromotionAllowed",
  ]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeRuntimeKeySelectorCaptureTargets({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    runtimeScriptPath: optionValue(args, "--runtime-script", defaultRuntimeScript),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeRuntimeKeySelectorCaptureTargets,
  exportCurrentNativeRuntimeKeySelectorCaptureTargets,
};
