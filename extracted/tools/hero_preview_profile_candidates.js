#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultLevelVisualProfileDiagnosticsPath = "extracted/reports/level_visual_profile_diagnostics.json";
const defaultDefinitionInstanceStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultDefinitionSymbolsPath = "extracted/reports/cff0_definition_symbols.tsv";
const defaultDefinitionBuildLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultCurrentAndroidStringsPath = "extracted/reports/android_libGameKindred_arm64_strings.txt";
const defaultCurrentNativeLevelVisualsSchemaAuditPath =
  "extracted/reports/current_native_levelvisuals_schema_audit.json";
const defaultCurrentNativeLevelRuntimeOwnerAuditPath =
  "extracted/reports/current_native_level_runtime_owner_audit.json";
const defaultCurrentNativePreviewStringXrefAuditPath =
  "extracted/reports/current_native_preview_string_xref_audit.json";
const defaultRuntimeKeySelectorCaptureSummaryPath =
  "extracted/reports/runtime_key_selector_capture_summary.json";
const defaultTypedObjectRuntimeKeyPayloadAuditPath =
  "extracted/reports/typed_object_runtime_key_payload_audit.json";
const defaultNativeContextPaths = [
  "extracted/reports/native_hero_manifest_caller_context.json",
  "extracted/reports/native_skin_manifest_caller_context.json",
  "extracted/reports/native_definition_manifest_caller_context.json",
];
const defaultJsonOut = "extracted/reports/hero_preview_profile_candidates.json";
const defaultTsvOut = "extracted/reports/hero_preview_profile_candidates.tsv";
const defaultViewerOut = "extracted/viewer/hero-preview-profile-candidates.json";

const candidatePatterns = [
  { id: "map-viewer", regex: /mapviewer/i, evidenceClass: "level-visuals-profile-candidate" },
  { id: "skin-viewer", regex: /skin[_ -]?viewer|UI::SKIN_VIEWER/i, evidenceClass: "native-menu-preview-hint" },
  { id: "hero-inspector", regex: /hero[_ -]?inspector|MENU_HERO_INSPECTOR/i, evidenceClass: "native-menu-preview-hint" },
  { id: "hero-select", regex: /hero[_ -]?select|HERO_SELECT/i, evidenceClass: "native-menu-preview-hint" },
  { id: "hero-card-or-portrait", regex: /portrait_|card_hero|card_skin/i, evidenceClass: "menu-card-preview-hint" },
  { id: "presentation", regex: /presentation|showcase|preview/i, evidenceClass: "generic-preview-hint" },
];

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTsvRows(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = parts[index] ?? "";
    return row;
  });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function matchingPatternIds(text) {
  return candidatePatterns.filter((pattern) => pattern.regex.test(text || "")).map((pattern) => pattern.id);
}

function highestEvidenceClass(patternIds) {
  for (const pattern of candidatePatterns) {
    if (patternIds.includes(pattern.id)) return pattern.evidenceClass;
  }
  return "";
}

function buildLevelProfileCandidates(levelVisualProfileDiagnostics) {
  return (levelVisualProfileDiagnostics?.chains || [])
    .map((chain) => {
      const haystack = [
        chain.gameModePath,
        ...(chain.gameplaySettings || []),
        chain.levelPath,
        chain.visualsPath,
        ...(chain.lightfields || []).map((lightfield) => lightfield.targetRelativePath),
      ].join("\n");
      const patternIds = matchingPatternIds(haystack);
      if (!patternIds.length) return null;
      return {
        evidenceSource: "level-visual-profile-diagnostics",
        evidenceClass: highestEvidenceClass(patternIds),
        patternIds,
        gameModePath: chain.gameModePath,
        gameplaySettings: chain.gameplaySettings || [],
        levelPath: chain.levelPath,
        visualsPath: chain.visualsPath,
        lightfields: chain.lightfields || [],
        status: chain.lightfields?.length ? "candidate-with-lightfield" : "candidate-without-lightfield",
        interpretation:
          "candidate only: the definition chain reaches Level/Visuals/lightfield data, but this does not prove that the hero/model preview runtime selects this profile.",
      };
    })
    .filter(Boolean);
}

function buildDefinitionStringCandidates(instanceStringRows, symbolRows, buildLinkRows) {
  const symbolDefinitionsBySymbol = new Map();
  for (const row of symbolRows) {
    if (!row.symbol) continue;
    if (!symbolDefinitionsBySymbol.has(row.symbol)) symbolDefinitionsBySymbol.set(row.symbol, new Set());
    symbolDefinitionsBySymbol.get(row.symbol).add(row.relativePath);
  }

  const rows = [];
  for (const row of instanceStringRows) {
    const haystack = [row.relativePath, row.labelBefore, row.value, row.targetRelativePath, row.targetBuildPath].join("\n");
    const patternIds = matchingPatternIds(haystack);
    if (!patternIds.length) continue;
    rows.push({
      evidenceSource: "definition-instance-strings",
      evidenceClass: highestEvidenceClass(patternIds),
      patternIds,
      sourceRelativePath: row.relativePath,
      blockIndex: row.blockIndex,
      stringIndex: row.stringIndex,
      labelBefore: row.labelBefore,
      value: row.value,
      resolvedDefinitions: uniqueSorted([...(symbolDefinitionsBySymbol.get(row.value) || [])]),
      status: "definition-string-candidate",
    });
  }

  for (const row of buildLinkRows) {
    const haystack = [row.sourceRelativePath, row.label, row.targetRelativePath, row.targetBuildPath].join("\n");
    const patternIds = matchingPatternIds(haystack);
    if (!patternIds.length) continue;
    rows.push({
      evidenceSource: "definition-build-links",
      evidenceClass: highestEvidenceClass(patternIds),
      patternIds,
      sourceRelativePath: row.sourceRelativePath,
      blockIndex: row.blockIndexes,
      stringIndex: row.firstStringIndex,
      labelBefore: row.label,
      value: row.targetRelativePath,
      resolvedDefinitions: [],
      status: row.matched === "yes" ? "build-link-candidate-resolved" : "build-link-candidate-unresolved",
    });
  }

  return rows.sort((left, right) =>
    [left.evidenceClass, left.sourceRelativePath, left.stringIndex, left.value].join("\t").localeCompare(
      [right.evidenceClass, right.sourceRelativePath, right.stringIndex, right.value].join("\t"),
    ),
  );
}

function buildNativeContextCandidates(nativeContextPaths) {
  const rows = [];
  for (const contextPath of nativeContextPaths) {
    const report = readOptionalJson(contextPath);
    for (const item of report?.items || []) {
      const haystack = [item.stringLiterals, item.context, item.lookupKind, item.sourceFile, item.callerFunction].join("\n");
      const patternIds = matchingPatternIds(haystack);
      if (!patternIds.length) continue;
      rows.push({
        evidenceSource: contextPath,
        evidenceClass: highestEvidenceClass(patternIds),
        patternIds,
        platform: item.platform,
        callerFunction: item.callerFunction,
        sourceFile: item.sourceFile,
        line: item.line,
        lookupKind: item.lookupKind,
        getterFunction: item.getterFunction,
        stringLiterals: item.stringLiterals,
        contextHash: item.contextHash,
        status: "native-context-hint",
        interpretation:
          "native menu/manifest hint only: this identifies code that can participate in hero or skin UI flows, but it does not prove a LevelVisuals/profile payload selection.",
      });
    }
  }
  return rows.sort((left, right) =>
    [left.evidenceClass, left.platform, left.callerFunction, left.line].join("\t").localeCompare(
      [right.evidenceClass, right.platform, right.callerFunction, right.line].join("\t"),
    ),
  );
}

function buildCurrentBinaryStringHints(currentAndroidStringsPath) {
  if (!currentAndroidStringsPath || !fs.existsSync(currentAndroidStringsPath)) return [];
  return fs
    .readFileSync(currentAndroidStringsPath, "utf8")
    .split(/\r?\n/)
    .map((line, index) => {
      const patternIds = matchingPatternIds(line);
      if (!patternIds.length) return null;
      return {
        evidenceSource: currentAndroidStringsPath,
        evidenceClass: highestEvidenceClass(patternIds),
        patternIds,
        lineNumber: index + 1,
        value: line,
        status: "current-android-string-hit",
        interpretation:
          "current Android string evidence only: this proves a symbol/event label exists in the current binary, not that it selects a LevelVisuals profile.",
      };
    })
    .filter(Boolean);
}

function buildCurrentNativeRuntimeGate({
  currentNativeLevelVisualsSchemaAudit,
  currentNativeLevelRuntimeOwnerAudit,
  currentNativePreviewStringXrefAudit,
  runtimeKeySelectorCaptureSummary,
  typedObjectRuntimeKeyPayloadAudit,
  mapViewerLevelCandidates,
}) {
  const schemaSummary = currentNativeLevelVisualsSchemaAudit?.summary || {};
  const ownerSummary = currentNativeLevelRuntimeOwnerAudit?.summary || {};
  const runtimeResourceKeyStaticRecoveryGate =
    currentNativeLevelRuntimeOwnerAudit?.runtimeResourceKeyStaticRecoveryGate || null;
  const runtimeResourceKeyUpstreamRecoveryAudit =
    currentNativeLevelRuntimeOwnerAudit?.runtimeResourceKeyUpstreamRecoveryAudit || null;
  const runtimeResolvedKeyIndexQueryConsumerAudit =
    currentNativeLevelRuntimeOwnerAudit?.runtimeResolvedKeyIndexQueryConsumerAudit || null;
  const typedObjectInputSourceOwnershipAudit =
    currentNativeLevelRuntimeOwnerAudit?.typedObjectInputSourceOwnershipAudit || null;
  const typedObjectReplaySourceSelectorCallerAudit =
    currentNativeLevelRuntimeOwnerAudit?.typedObjectReplaySourceSelectorCallerAudit || null;
  const previewStringSummary = currentNativePreviewStringXrefAudit?.summary || {};
  const runtimeCaptureGate = buildRuntimeSelectorCaptureGate(runtimeKeySelectorCaptureSummary);
  const typedObjectPayloadConcreteMatch = Boolean(
    typedObjectRuntimeKeyPayloadAudit?.concreteRuntimeKeyFieldMatchedResourceIndex,
  );
  const schemaBridgeConfirmed = Boolean(
    schemaSummary.levelVisualsRefKeyFieldConfirmedAsCharPointer &&
      schemaSummary.levelRuntimeLoaderResolvesLevelVisualsRefKey &&
      schemaSummary.levelRuntimeLoaderTypeChecksResolvedLevelVisuals &&
      schemaSummary.levelVisualsProfileFieldConfirmedAsCharPointer,
  );
  const staticMapViewerCandidateRecovered = mapViewerLevelCandidates.some(
    (candidate) => candidate.lightfields.length > 0,
  );
  const activeSelectionResolved = Boolean(
    ownerSummary.activeLevelSelectionResolved &&
      ownerSummary.activeHeroPreviewProfileResolved &&
      ownerSummary.levelSetupActivePreviewCandidateConcreteKeyValuesRecovered,
  );
  const blockingReasons = [];
  if (!schemaBridgeConfirmed) {
    blockingReasons.push(
      "current Level -> LevelVisualsRef -> LevelVisuals profile bridge is not fully schema-confirmed",
    );
  }
  if (!staticMapViewerCandidateRecovered) {
    blockingReasons.push("no definition-side MapViewer LevelVisuals/lightfield candidate is recovered");
  }
  if (!ownerSummary.activeLevelSelectionResolved) {
    blockingReasons.push("current native active Level selection is unresolved");
  }
  if (!ownerSummary.activeHeroPreviewProfileResolved) {
    blockingReasons.push("current native active hero/model preview profile selection is unresolved");
  }
  if (!ownerSummary.levelSetupActivePreviewCandidateConcreteKeyValuesRecovered) {
    blockingReasons.push("remaining Level setup candidates have no recovered concrete key values");
  }
  if (
    runtimeResourceKeyStaticRecoveryGate &&
    !runtimeResourceKeyStaticRecoveryGate.staticConcreteKeyRecoverable
  ) {
    blockingReasons.push(
      "active preview key is statically exhausted: runtime capture or an upstream payload decoder is required before profile takeover",
    );
  }
  if (ownerSummary.runtimeResourceKeySetterSourcesClassifiedButNotPreviewProven) {
    blockingReasons.push(
      "global runtime key cache setters are classified, but none is proven to be the active hero/model preview Level/Profile selector",
    );
  }
  if (
    runtimeResourceKeyUpstreamRecoveryAudit &&
    !runtimeResourceKeyUpstreamRecoveryAudit.concreteActiveKeyRecovered
  ) {
    blockingReasons.push(
      "runtime key upstream inputs are bounded as stream/.vgr/raw-data/lobby record evidence, but no decoded active preview payload is recovered",
    );
  }
  if (
    runtimeResolvedKeyIndexQueryConsumerAudit &&
    runtimeResolvedKeyIndexQueryConsumerAudit.recovered &&
    !runtimeResolvedKeyIndexQueryConsumerAudit.concreteActiveKeyRecovered
  ) {
    blockingReasons.push(
      "resolved-key index-query consumers are bounded to one Level setup candidate, but the concrete cached active key is still unrecovered",
    );
  }
  if (
    typedObjectInputSourceOwnershipAudit &&
    typedObjectInputSourceOwnershipAudit.recovered &&
    !typedObjectInputSourceOwnershipAudit.activePreviewProof
  ) {
    blockingReasons.push(
      "typed-object input source ownership is recovered as replay/stream source ownership, but it still has no decoded active preview payload",
    );
  }
  if (
    typedObjectReplaySourceSelectorCallerAudit &&
    typedObjectReplaySourceSelectorCallerAudit.recovered &&
    !typedObjectReplaySourceSelectorCallerAudit.activePreviewProof
  ) {
    blockingReasons.push(
      "typed-object replay source selector callers are bounded as lifecycle/switch wrappers, but none proves active preview profile selection",
    );
  }
  if (typedObjectRuntimeKeyPayloadAudit && !typedObjectPayloadConcreteMatch) {
    blockingReasons.push(
      "local typed-object runtime key payload fields were scanned, but none recovered a resource-index-matching active preview key",
    );
  }
  if (
    Number(previewStringSummary.textReferences || 0) > 0 &&
    Number(previewStringSummary.referencesTouchingProfileLoader || 0) === 0
  ) {
    blockingReasons.push(
      "current preview/menu string xrefs are classified as UI/menu evidence and do not touch the LevelVisuals/profile loader",
    );
  }
  if (!runtimeCaptureGate.captureImported) {
    blockingReasons.push("no original-runtime selector capture summary has been imported");
  } else if (!runtimeCaptureGate.readyForManualReview) {
    blockingReasons.push(
      "runtime selector capture does not contain a closed active-helper or object-builder-B -> Level -> LevelVisuals -> profile sequence",
    );
  } else {
    blockingReasons.push(
      "runtime selector capture has a closed sequence, but it still requires manual review against the Level/LevelVisuals schema before renderer takeover",
    );
  }

  return {
    status: activeSelectionResolved
      ? "current-native-active-preview-profile-resolved"
      : runtimeCaptureGate.readyForManualReview
        ? "runtime-selector-capture-ready-manual-review-required"
      : staticMapViewerCandidateRecovered && schemaBridgeConfirmed
        ? "static-candidate-and-schema-bridge-only-runtime-blocked"
        : "insufficient-static-or-schema-evidence",
    rendererProfileTakeoverAllowed: schemaBridgeConfirmed && activeSelectionResolved,
    schemaBridgeConfirmed,
    staticMapViewerCandidateRecovered,
    activeSelectionResolved,
    activeLevelSelectionResolved: Boolean(ownerSummary.activeLevelSelectionResolved),
    activeHeroPreviewProfileResolved: Boolean(ownerSummary.activeHeroPreviewProfileResolved),
    levelSetupActivePreviewCandidatesBoundedButUnresolved: Boolean(
      ownerSummary.levelSetupActivePreviewCandidatesBoundedButUnresolved,
    ),
    activePreviewCandidateBlockers: ownerSummary.levelSetupActivePreviewCandidateBlockers || [],
    runtimeResourceKeyStaticRecoveryGate,
    runtimeResourceKeyUpstreamRecoveryAudit,
    runtimeResolvedKeyIndexQueryConsumerAudit,
    typedObjectInputSourceOwnershipAudit,
    typedObjectReplaySourceSelectorCallerAudit,
    typedObjectRuntimeKeyPayloadAudit: typedObjectRuntimeKeyPayloadAudit
      ? {
          state: typedObjectRuntimeKeyPayloadAudit.state,
          fileCount: typedObjectRuntimeKeyPayloadAudit.fileCount,
          scannedFileCount: typedObjectRuntimeKeyPayloadAudit.scannedFileCount,
          frameCandidateCount: typedObjectRuntimeKeyPayloadAudit.frameCandidateCount,
          keyStringCandidateCount: typedObjectRuntimeKeyPayloadAudit.keyStringCandidateCount,
          resourceLikeKeyStringCount: typedObjectRuntimeKeyPayloadAudit.resourceLikeKeyStringCount,
          exactKeyStringMatchCount: typedObjectRuntimeKeyPayloadAudit.exactKeyStringMatchCount,
          objectBuilderWord0CandidateCount:
            typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0CandidateCount,
          objectBuilderWord0EngineHashMatchCount:
            typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0EngineHashMatchCount,
          objectBuilderWord0NativeEngineHashMatchCount:
            typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0NativeEngineHashMatchCount,
          objectBuilderWord0BigEndianEngineHashMatchCount:
            typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0BigEndianEngineHashMatchCount,
          concreteRuntimeKeyFieldMatchedResourceIndex:
            typedObjectRuntimeKeyPayloadAudit.concreteRuntimeKeyFieldMatchedResourceIndex,
          activePreviewProof: typedObjectRuntimeKeyPayloadAudit.activePreviewProof,
          blocker: typedObjectRuntimeKeyPayloadAudit.blocker,
        }
      : null,
    runtimeCaptureGate,
    blockingReasons,
    provenStaticCandidate: staticMapViewerCandidateRecovered
      ? {
          levelPath: mapViewerLevelCandidates[0]?.levelPath || "",
          visualsPath: mapViewerLevelCandidates[0]?.visualsPath || "",
          lightfields: (mapViewerLevelCandidates[0]?.lightfields || []).map(
            (lightfield) => lightfield.targetRelativePath,
          ),
        }
      : null,
    provenCurrentNativeBridge: {
      levelVisualsRefKeyFieldConfirmedAsCharPointer: Boolean(
        schemaSummary.levelVisualsRefKeyFieldConfirmedAsCharPointer,
      ),
      levelRuntimeLoaderResolvesLevelVisualsRefKey: Boolean(
        schemaSummary.levelRuntimeLoaderResolvesLevelVisualsRefKey,
      ),
      levelRuntimeLoaderTypeChecksResolvedLevelVisuals: Boolean(
        schemaSummary.levelRuntimeLoaderTypeChecksResolvedLevelVisuals,
      ),
      levelVisualsProfileFieldConfirmedAsCharPointer: Boolean(
        schemaSummary.levelVisualsProfileFieldConfirmedAsCharPointer,
      ),
    },
    currentPreviewStringXrefEvidence: {
      present: Boolean(currentNativePreviewStringXrefAudit),
      textReferences: Number(previewStringSummary.textReferences || 0),
      skinViewerUiEventBusReferences: Number(previewStringSummary.skinViewerUiEventBusReferences || 0),
      heroInspectorUiLabelReferences: Number(previewStringSummary.heroInspectorUiLabelReferences || 0),
      uiDataSchemaFieldReferences: Number(previewStringSummary.uiDataSchemaFieldReferences || 0),
      uiCardOrTabDataFieldReferences: Number(previewStringSummary.uiCardOrTabDataFieldReferences || 0),
      referencesTouchingProfileLoader: Number(previewStringSummary.referencesTouchingProfileLoader || 0),
      provenActiveHeroPreviewProfile: Boolean(previewStringSummary.provenActiveHeroPreviewProfile),
      interpretation:
        "Preview/menu strings are useful negative evidence unless a local xref neighborhood reaches LevelVisuals/profile loader code.",
    },
    nextTraceTargets: [
      "recover the concrete cached runtime key behind 0xbebf54/0xbec044 for callsite 0x8befac",
      "capture original runtime selector/profile/position-sample events with extracted/reports/frida_dump_runtime_key_selector.js and summarize them with extracted/tools/runtime_key_selector_capture_summary.js",
      "do not promote UI::SKIN_VIEWER or preview/menu string xrefs unless a current-package xref neighborhood reaches LevelVisuals/profile loader code",
      "recover typed-object 0x03f3 payload word0 or a captured frame/.vgr payload for callsite 0xc04b98",
      "prove that one recovered key invokes Level descriptor 0x2ae61c8 / hash 0x858E20D4 with the hero/model preview Level payload",
    ],
    interpretation:
      "static MapViewer LevelVisuals/lightfield evidence and current LevelVisualsRef loader evidence are useful, but renderer profile takeover stays blocked until a current-native active preview key and Level payload are recovered.",
  };
}

function missingRuntimeSelectorCaptureGate(runtimeKeySelectorCaptureSummary) {
  const gateEvidence = runtimeKeySelectorCaptureSummary?.gateEvidence || {};
  const missingGateEvidence = gateEvidence.missingGateEvidence?.length
    ? gateEvidence.missingGateEvidence
    : ["runtime-key-selector-capture-not-imported"];
  return {
    captureImported: false,
    generatedAt: runtimeKeySelectorCaptureSummary?.generatedAt || "",
    readyForManualReview: false,
    runtimeCaptureReadinessState: gateEvidence.runtimeCaptureReadinessState || "capture-not-imported",
    missingGateEvidence,
    readySequenceCount: 0,
    objectBuilderBReadySequenceCount: 0,
    readyProfileEvidenceSequenceCount: 0,
    readyProfileConsistentSequenceCount: 0,
    readyLightProbeEvidenceSequenceCount: 0,
    objectBuilderBReadyProfileEvidenceSequenceCount: 0,
    objectBuilderBReadyProfileConsistentSequenceCount: 0,
    objectBuilderBReadyLightProbeEvidenceSequenceCount: 0,
    lightProbeReadyForManualReview: false,
    activeHelperKeyValues: [],
    objectBuilderBKeyValues: [],
    totals: runtimeKeySelectorCaptureSummary?.totals || {},
    readySequences: [],
    objectBuilderBReadySequences: [],
    status: runtimeKeySelectorCaptureSummary?.captureStatus || "runtime-selector-capture-missing",
    interpretation:
      "No original-runtime selector capture summary is present. Renderer takeover remains blocked by the unresolved active preview key.",
  };
}

function buildRuntimeSelectorCaptureGate(runtimeKeySelectorCaptureSummary) {
  if (!runtimeKeySelectorCaptureSummary || runtimeKeySelectorCaptureSummary.captureImported === false) {
    return missingRuntimeSelectorCaptureGate(runtimeKeySelectorCaptureSummary);
  }
  const gateEvidence = runtimeKeySelectorCaptureSummary.gateEvidence || {};
  const readySequences = (runtimeKeySelectorCaptureSummary.activeHelperSequences || []).filter(
    (sequence) => sequence.readyForManualReview,
  );
  const readyObjectBuilderBSequences = (runtimeKeySelectorCaptureSummary.objectBuilderBSequences || []).filter(
    (sequence) => sequence.readyForManualReview,
  );
  const activeHelperKeyValues = uniqueSorted(
    gateEvidence.activeHelperKeyValues || readySequences.map((sequence) => sequence.key),
  );
  const objectBuilderBKeyValues = uniqueSorted(
    gateEvidence.objectBuilderBKeyValues || readyObjectBuilderBSequences.map((sequence) => sequence.key),
  );
  const readyForManualReview = Boolean(
    (gateEvidence.runtimeCaptureReadyForManualReview || gateEvidence.rendererProfileTakeoverAllowedByThisCapture) &&
      (readySequences.length > 0 || readyObjectBuilderBSequences.length > 0),
  );
  return {
    captureImported: true,
    generatedAt: runtimeKeySelectorCaptureSummary.generatedAt || "",
    readyForManualReview,
    runtimeCaptureReadinessState: gateEvidence.runtimeCaptureReadinessState || "",
    missingGateEvidence: gateEvidence.missingGateEvidence || [],
    readySequenceCount: readySequences.length,
    objectBuilderBReadySequenceCount: readyObjectBuilderBSequences.length,
    objectBuilderBParserToHelperSequenceCount: Number(gateEvidence.objectBuilderBParserToHelperSequenceCount || 0),
    objectBuilderBReadyWithPayloadWord0Count: Number(gateEvidence.objectBuilderBReadyWithPayloadWord0Count || 0),
    objectBuilderBReadyProfileEvidenceSequenceCount: Number(
      gateEvidence.objectBuilderBReadyProfileEvidenceSequenceCount || 0,
    ),
    objectBuilderBReadyProfileConsistentSequenceCount: Number(
      gateEvidence.objectBuilderBReadyProfileConsistentSequenceCount || 0,
    ),
    readyFieldRouteSequenceCount: Number(gateEvidence.readyFieldRouteSequenceCount || 0),
    readyProfileEvidenceSequenceCount: Number(gateEvidence.readyProfileEvidenceSequenceCount || 0),
    readyProfileConsistentSequenceCount: Number(gateEvidence.readyProfileConsistentSequenceCount || 0),
    readyLightProbeEvidenceSequenceCount: Number(gateEvidence.readyLightProbeEvidenceSequenceCount || 0),
    objectBuilderBReadyLightProbeEvidenceSequenceCount: Number(
      gateEvidence.objectBuilderBReadyLightProbeEvidenceSequenceCount || 0,
    ),
    lightProbeReadyForManualReview: Boolean(gateEvidence.runtimeLightProbeCaptureReadyForManualReview),
    activeHelperKeyValues,
    objectBuilderBKeyValues,
    totals: runtimeKeySelectorCaptureSummary.totals || {},
    readySequences: readySequences.map((sequence) => ({
      sequenceIndex: sequence.sequenceIndex,
      activeEventIndex: sequence.activeEventIndex,
      activeTimestampMs: sequence.activeTimestampMs,
      key: sequence.key,
      downstreamEvents: sequence.downstreamEvents,
      profileEvidence: sequence.profileEvidence || null,
      profileEvidenceReadyForManualReview: Boolean(sequence.profileEvidenceReadyForManualReview),
      lightProbeEvidence: sequence.lightProbeEvidence || null,
      lightProbeEvidenceReadyForManualReview: Boolean(sequence.lightProbeEvidenceReadyForManualReview),
    })),
    objectBuilderBReadySequences: readyObjectBuilderBSequences.map((sequence) => ({
      sequenceIndex: sequence.sequenceIndex,
      parserEventIndex: sequence.parserEventIndex,
      helperEventIndex: sequence.helperEventIndex,
      parserTimestampMs: sequence.parserTimestampMs,
      key: sequence.key,
      payloadPointer: sequence.payloadPointer,
      payloadWord0NativeHex: sequence.payloadWord0NativeHex,
      payloadWord0BigEndianHex: sequence.payloadWord0BigEndianHex,
      downstreamEvents: sequence.downstreamEvents,
      profileEvidence: sequence.profileEvidence || null,
      profileEvidenceReadyForManualReview: Boolean(sequence.profileEvidenceReadyForManualReview),
      lightProbeEvidence: sequence.lightProbeEvidence || null,
      lightProbeEvidenceReadyForManualReview: Boolean(sequence.lightProbeEvidenceReadyForManualReview),
    })),
    status: readyForManualReview
      ? "runtime-selector-capture-ready-manual-review-required"
      : "runtime-selector-capture-imported-but-incomplete",
    interpretation: readyForManualReview
      ? "The original runtime capture contains a concrete active-helper or object-builder-B key followed by Level setup, LevelVisuals loader, and lightfield/profile events. This is ready for manual schema review, but it is not an automatic renderer takeover."
      : "A runtime selector capture summary is present, but it does not contain a closed active-helper or object-builder-B -> Level -> LevelVisuals -> profile sequence.",
  };
}

function buildHeroPreviewProfileCandidates({
  levelVisualProfileDiagnosticsPath = defaultLevelVisualProfileDiagnosticsPath,
  definitionInstanceStringsPath = defaultDefinitionInstanceStringsPath,
  definitionSymbolsPath = defaultDefinitionSymbolsPath,
  definitionBuildLinksPath = defaultDefinitionBuildLinksPath,
  currentAndroidStringsPath = defaultCurrentAndroidStringsPath,
  currentNativeLevelVisualsSchemaAuditPath = defaultCurrentNativeLevelVisualsSchemaAuditPath,
  currentNativeLevelRuntimeOwnerAuditPath = defaultCurrentNativeLevelRuntimeOwnerAuditPath,
  currentNativePreviewStringXrefAuditPath = defaultCurrentNativePreviewStringXrefAuditPath,
  runtimeKeySelectorCaptureSummaryPath = defaultRuntimeKeySelectorCaptureSummaryPath,
  typedObjectRuntimeKeyPayloadAuditPath = defaultTypedObjectRuntimeKeyPayloadAuditPath,
  nativeContextPaths = defaultNativeContextPaths,
} = {}) {
  const levelVisualProfileDiagnostics = readOptionalJson(levelVisualProfileDiagnosticsPath);
  const currentNativeLevelVisualsSchemaAudit = readOptionalJson(currentNativeLevelVisualsSchemaAuditPath);
  const currentNativeLevelRuntimeOwnerAudit = readOptionalJson(currentNativeLevelRuntimeOwnerAuditPath);
  const currentNativePreviewStringXrefAudit = readOptionalJson(currentNativePreviewStringXrefAuditPath);
  const runtimeKeySelectorCaptureSummary = readOptionalJson(runtimeKeySelectorCaptureSummaryPath);
  const typedObjectRuntimeKeyPayloadAudit = readOptionalJson(typedObjectRuntimeKeyPayloadAuditPath);
  const instanceStringRows = readTsvRows(definitionInstanceStringsPath);
  const symbolRows = readTsvRows(definitionSymbolsPath);
  const buildLinkRows = readTsvRows(definitionBuildLinksPath);
  const levelProfileCandidates = buildLevelProfileCandidates(levelVisualProfileDiagnostics);
  const definitionStringCandidates = buildDefinitionStringCandidates(instanceStringRows, symbolRows, buildLinkRows);
  const nativeContextCandidates = buildNativeContextCandidates(nativeContextPaths);
  const currentBinaryStringHints = buildCurrentBinaryStringHints(currentAndroidStringsPath);
  const mapViewerLevelCandidates = levelProfileCandidates.filter((candidate) =>
    candidate.patternIds.includes("map-viewer"),
  );
  const skinViewerNativeHints = nativeContextCandidates.filter((candidate) =>
    candidate.patternIds.includes("skin-viewer"),
  );
  const currentNativeRuntimeGate = buildCurrentNativeRuntimeGate({
    currentNativeLevelVisualsSchemaAudit,
    currentNativeLevelRuntimeOwnerAudit,
    currentNativePreviewStringXrefAudit,
    runtimeKeySelectorCaptureSummary,
    typedObjectRuntimeKeyPayloadAudit,
    mapViewerLevelCandidates,
  });

  return {
    generatedAt: new Date().toISOString(),
    policy:
      "diagnostic-only preview profile candidate report; candidate profiles must not be applied to rendering until a current-native active preview selection path is proven",
    source: {
      levelVisualProfileDiagnosticsPath,
      definitionInstanceStringsPath,
      definitionSymbolsPath,
      definitionBuildLinksPath,
      currentAndroidStringsPath,
      currentNativeLevelVisualsSchemaAuditPath,
      currentNativeLevelRuntimeOwnerAuditPath,
      currentNativePreviewStringXrefAuditPath,
      runtimeKeySelectorCaptureSummaryPath,
      typedObjectRuntimeKeyPayloadAuditPath,
      nativeContextPaths,
    },
    summary: {
      levelProfileCandidates: levelProfileCandidates.length,
      mapViewerLevelCandidates: mapViewerLevelCandidates.length,
      definitionStringCandidates: definitionStringCandidates.length,
      nativeContextCandidates: nativeContextCandidates.length,
      currentBinaryStringHints: currentBinaryStringHints.length,
      skinViewerNativeHints: skinViewerNativeHints.length,
      previewStringXrefTextReferences:
        currentNativeRuntimeGate.currentPreviewStringXrefEvidence.textReferences,
      previewStringXrefsTouchingProfileLoader:
        currentNativeRuntimeGate.currentPreviewStringXrefEvidence.referencesTouchingProfileLoader,
      previewStringXrefsProvenActiveHeroPreviewProfile:
        currentNativeRuntimeGate.currentPreviewStringXrefEvidence.provenActiveHeroPreviewProfile,
      mapViewerCurrentBinaryStringHints: currentBinaryStringHints.filter((candidate) =>
        candidate.patternIds.includes("map-viewer"),
      ).length,
      mapViewerCandidatesWithLightfield: mapViewerLevelCandidates.filter((candidate) => candidate.lightfields.length)
        .length,
      currentNativeLevelVisualsBridgeConfirmed: currentNativeRuntimeGate.schemaBridgeConfirmed,
      rendererProfileTakeoverAllowed: currentNativeRuntimeGate.rendererProfileTakeoverAllowed,
      activePreviewCandidateConcreteKeyValuesRecovered: currentNativeRuntimeGate.activeSelectionResolved,
      runtimeSelectorCaptureImported: currentNativeRuntimeGate.runtimeCaptureGate.captureImported,
      runtimeSelectorCaptureStatus: currentNativeRuntimeGate.runtimeCaptureGate.status,
      runtimeSelectorCaptureReadinessState: currentNativeRuntimeGate.runtimeCaptureGate.runtimeCaptureReadinessState,
      runtimeSelectorCaptureMissingGateEvidence:
        currentNativeRuntimeGate.runtimeCaptureGate.missingGateEvidence || [],
      runtimeSelectorCaptureReadyForManualReview: currentNativeRuntimeGate.runtimeCaptureGate.readyForManualReview,
      runtimeSelectorCaptureReadySequenceCount: currentNativeRuntimeGate.runtimeCaptureGate.readySequenceCount,
      runtimeSelectorCaptureReadyProfileEvidenceSequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.readyProfileEvidenceSequenceCount,
      runtimeSelectorCaptureReadyProfileConsistentSequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.readyProfileConsistentSequenceCount,
      runtimeSelectorCaptureReadyLightProbeEvidenceSequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.readyLightProbeEvidenceSequenceCount,
      runtimeSelectorCaptureLightProbeReadyForManualReview:
        currentNativeRuntimeGate.runtimeCaptureGate.lightProbeReadyForManualReview,
      runtimeSelectorCaptureObjectBuilderBReadySequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.objectBuilderBReadySequenceCount,
      runtimeSelectorCaptureObjectBuilderBReadyProfileEvidenceSequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.objectBuilderBReadyProfileEvidenceSequenceCount,
      runtimeSelectorCaptureObjectBuilderBReadyLightProbeEvidenceSequenceCount:
        currentNativeRuntimeGate.runtimeCaptureGate.objectBuilderBReadyLightProbeEvidenceSequenceCount,
      activePreviewCandidatesBoundedButUnresolved:
        currentNativeRuntimeGate.levelSetupActivePreviewCandidatesBoundedButUnresolved,
      provenActiveHeroPreviewProfile: currentNativeRuntimeGate.activeHeroPreviewProfileResolved,
    },
    interpretation: [
      "MapViewer_5v5 is a concrete Level/Visuals/lightfield candidate because the definition chain resolves through GameMode_5v5_MapViewer_Private -> MapViewer_5v5 -> MapViewer_5v5_Visuals.",
      "The current native schema proves the Level +0x10 -> LevelVisualsRef +0x0 -> resolved LevelVisuals -> LevelVisuals +0x50 profile bridge, but only as a loader bridge.",
      "MapViewer_5v5 currently appears in definition resources, not as a direct Android binary string hit, so the next native trace should follow resource/definition selection rather than a direct MapViewer string xref.",
      "UI::SKIN_VIEWER and related hero/skin menu strings appear in native menu/manifest contexts, but these hints have not yet been connected to the current LevelVisuals profile loader.",
      "Current-package preview/menu string xrefs are now checked directly: UI/SkinViewer, hero inspector, presentationData, and preview/card strings do not touch the Level runtime visuals loader, LevelVisuals apply processor, or scene/probe profile payload loader.",
      "The report therefore narrows the next trace target but keeps renderer takeover disabled until a concrete current-native active preview key and Level payload are recovered.",
      "A runtime selector capture can now be imported as additional evidence, but even a closed capture sequence only moves the gate to manual schema review; it does not automatically select a viewer lightfield/profile.",
    ],
    currentNativeRuntimeGate,
    levelProfileCandidates,
    definitionStringCandidates: definitionStringCandidates.slice(0, 400),
    currentBinaryStringHints,
    nativeContextCandidates: nativeContextCandidates.slice(0, 400),
  };
}

function rowsForTsv(manifest) {
  const rows = [];
  for (const candidate of manifest.levelProfileCandidates || []) {
    rows.push({
      source: candidate.evidenceSource,
      evidenceClass: candidate.evidenceClass,
      patternIds: candidate.patternIds.join("|"),
      path: candidate.levelPath,
      relatedPath: candidate.visualsPath,
      lightfields: candidate.lightfields.map((lightfield) => lightfield.targetRelativePath).join("|"),
      status: candidate.status,
    });
  }
  for (const candidate of manifest.nativeContextCandidates || []) {
    rows.push({
      source: candidate.evidenceSource,
      evidenceClass: candidate.evidenceClass,
      patternIds: candidate.patternIds.join("|"),
      path: candidate.sourceFile,
      relatedPath: candidate.callerFunction,
      lightfields: "",
      status: candidate.status,
    });
  }
  for (const candidate of manifest.currentBinaryStringHints || []) {
    rows.push({
      source: candidate.evidenceSource,
      evidenceClass: candidate.evidenceClass,
      patternIds: candidate.patternIds.join("|"),
      path: `line:${candidate.lineNumber}`,
      relatedPath: candidate.value,
      lightfields: "",
      status: candidate.status,
    });
  }
  if (manifest.currentNativeRuntimeGate) {
    rows.push({
      source: "current-native-runtime-gate",
      evidenceClass: "renderer-takeover-gate",
      patternIds: "",
      path: manifest.currentNativeRuntimeGate.status,
      relatedPath: (manifest.currentNativeRuntimeGate.blockingReasons || []).join("|"),
      lightfields: manifest.currentNativeRuntimeGate.provenStaticCandidate?.lightfields?.join("|") || "",
      status: manifest.currentNativeRuntimeGate.rendererProfileTakeoverAllowed ? "open" : "closed",
    });
  }
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const nativeContextPaths = optionValue(args, "--native-contexts", "")
    ? optionValue(args, "--native-contexts", "").split(",")
    : defaultNativeContextPaths;
  const manifest = buildHeroPreviewProfileCandidates({
    levelVisualProfileDiagnosticsPath: optionValue(
      args,
      "--level-visual-profile-diagnostics",
      defaultLevelVisualProfileDiagnosticsPath,
    ),
    definitionInstanceStringsPath: optionValue(
      args,
      "--definition-instance-strings",
      defaultDefinitionInstanceStringsPath,
    ),
    definitionSymbolsPath: optionValue(args, "--definition-symbols", defaultDefinitionSymbolsPath),
    definitionBuildLinksPath: optionValue(args, "--definition-build-links", defaultDefinitionBuildLinksPath),
    currentAndroidStringsPath: optionValue(args, "--current-android-strings", defaultCurrentAndroidStringsPath),
    currentNativeLevelVisualsSchemaAuditPath: optionValue(
      args,
      "--current-native-levelvisuals-schema-audit",
      defaultCurrentNativeLevelVisualsSchemaAuditPath,
    ),
    currentNativeLevelRuntimeOwnerAuditPath: optionValue(
      args,
      "--current-native-level-runtime-owner-audit",
      defaultCurrentNativeLevelRuntimeOwnerAuditPath,
    ),
    currentNativePreviewStringXrefAuditPath: optionValue(
      args,
      "--current-native-preview-string-xref-audit",
      defaultCurrentNativePreviewStringXrefAuditPath,
    ),
    runtimeKeySelectorCaptureSummaryPath: optionValue(
      args,
      "--runtime-key-selector-capture-summary",
      defaultRuntimeKeySelectorCaptureSummaryPath,
    ),
    typedObjectRuntimeKeyPayloadAuditPath: optionValue(
      args,
      "--typed-object-runtime-key-payload-audit",
      defaultTypedObjectRuntimeKeyPayloadAuditPath,
    ),
    nativeContextPaths,
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), manifest);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), manifest);
  writeTsv(optionValue(args, "--tsv-out", defaultTsvOut), rowsForTsv(manifest), [
    "source",
    "evidenceClass",
    "patternIds",
    "path",
    "relatedPath",
    "lightfields",
    "status",
  ]);
  console.log(JSON.stringify({ summary: manifest.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildHeroPreviewProfileCandidates,
};
