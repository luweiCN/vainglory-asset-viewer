#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultMaterialRuntimePath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultType4ValueSourcePath = "extracted/viewer/current-native-shaderdata-type4-value-source-audit.json";
const defaultType4EntrySemanticsPath = "extracted/viewer/current-native-shaderdata-type4-entry-semantics-audit.json";
const defaultTextureSamplerTablePath = "extracted/viewer/current-native-shaderdata-texture-sampler-table-audit.json";
const defaultExternalTextureBindingPath = "extracted/viewer/current-native-shaderdata-external-texture-binding-audit.json";
const defaultTextureSamplerStateSemanticsPath =
  "extracted/viewer/current-native-texture-sampler-state-semantics-audit.json";
const defaultInlineTexturePlaceholderPath =
  "extracted/viewer/current-native-shaderdata-inline-texture-placeholder-audit.json";
const defaultShadergraphSamplerTexDataJoinPath =
  "extracted/viewer/current-native-shadergraph-sampler-texdata-join-audit.json";
const defaultDefinitionShaderParamsPayloadStructurePath =
  "extracted/viewer/current-native-definition-shaderparams-payload-structure-audit.json";
const defaultShaderParameterBridgePath = "extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json";
const defaultLayoutBPayloadSourceProgramBridgePath =
  "extracted/viewer/current-native-layout-b-payload-source-program-bridge-audit.json";
const defaultDynamicSourceTableSemanticsPath =
  "extracted/viewer/current-native-dynamic-source-table-semantics-audit.json";
const defaultSourceProgramCaptureSummaryPath = "extracted/viewer/current-native-material-source-program-capture-summary.json";
const defaultStaticMeshShaderParamsCaptureSummaryPath =
  "extracted/viewer/current-native-static-mesh-shaderparams-capture-summary.json";
const defaultViewerOut = "extracted/viewer/current-native-material-sampler-ownership-gate-audit.json";
const defaultJsonOut = "extracted/reports/current_native_material_sampler_ownership_gate_audit.json";
const defaultTsvOut = "extracted/reports/current_native_material_sampler_ownership_gate_audit.tsv";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath, fallback) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function sumObjectValues(value) {
  return Object.values(value || {}).reduce((sum, item) => sum + (Number(item) || 0), 0);
}

function sumOverlappingSamplerRows(left, right) {
  let rows = 0;
  for (const [sampler, leftRows] of Object.entries(left || {})) {
    rows += Math.min(Number(leftRows) || 0, Number(right?.[sampler]) || 0);
  }
  return rows;
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

function buildCurrentNativeMaterialSamplerOwnershipGateAudit(
  {
    materialRuntimePath = defaultMaterialRuntimePath,
    type4ValueSourcePath = defaultType4ValueSourcePath,
    type4EntrySemanticsPath = defaultType4EntrySemanticsPath,
    textureSamplerTablePath = defaultTextureSamplerTablePath,
    externalTextureBindingPath = defaultExternalTextureBindingPath,
    textureSamplerStateSemanticsPath = defaultTextureSamplerStateSemanticsPath,
    inlineTexturePlaceholderPath = defaultInlineTexturePlaceholderPath,
    shadergraphSamplerTexDataJoinPath = defaultShadergraphSamplerTexDataJoinPath,
    definitionShaderParamsPayloadStructurePath = defaultDefinitionShaderParamsPayloadStructurePath,
    shaderParameterBridgePath = defaultShaderParameterBridgePath,
    layoutBPayloadSourceProgramBridgePath = defaultLayoutBPayloadSourceProgramBridgePath,
    dynamicSourceTableSemanticsPath = defaultDynamicSourceTableSemanticsPath,
    sourceProgramCaptureSummaryPath = defaultSourceProgramCaptureSummaryPath,
    staticMeshShaderParamsCaptureSummaryPath = defaultStaticMeshShaderParamsCaptureSummaryPath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const materialRuntime = readJson(materialRuntimePath, { summary: {} });
  const type4ValueSource = readJson(type4ValueSourcePath, { summary: {}, type4SemanticNames: [] });
  const type4EntrySemantics = readJson(type4EntrySemanticsPath, { summary: {} });
  const textureSamplerTable = readJson(textureSamplerTablePath, { summary: {} });
  const externalTextureBinding = readJson(externalTextureBindingPath, { summary: {} });
  const textureSamplerStateSemantics = readJson(textureSamplerStateSemanticsPath, { summary: {} });
  const inlineTexturePlaceholder = readJson(inlineTexturePlaceholderPath, { summary: {} });
  const shadergraphSamplerTexDataJoin = readJson(shadergraphSamplerTexDataJoinPath, { summary: {} });
  const definitionShaderParamsPayloadStructure = readJson(definitionShaderParamsPayloadStructurePath, { summary: {} });
  const shaderParameterBridge = readJson(shaderParameterBridgePath, { summary: {} });
  const layoutBPayloadSourceProgramBridge = readJson(layoutBPayloadSourceProgramBridgePath, { summary: {} });
  const dynamicSourceTableSemantics = readJson(dynamicSourceTableSemanticsPath, { summary: {} });
  const sourceProgramCaptureSummary = readJson(sourceProgramCaptureSummaryPath, { summary: {} });
  const staticMeshShaderParamsCaptureSummary = readJson(staticMeshShaderParamsCaptureSummaryPath, { summary: {} });

  const materialSummary = materialRuntime.summary || {};
  const type4Summary = type4ValueSource.summary || {};
  const type4EntrySummary = type4EntrySemantics.summary || {};
  const samplerTableSummary = textureSamplerTable.summary || {};
  const externalSummary = externalTextureBinding.summary || {};
  const samplerStateSummary = textureSamplerStateSemantics.summary || {};
  const inlineSummary = inlineTexturePlaceholder.summary || {};
  const samplerJoinSummary = shadergraphSamplerTexDataJoin.summary || {};
  const definitionPayloadSummary = definitionShaderParamsPayloadStructure.summary || {};
  const shaderParameterSummary = shaderParameterBridge.summary || {};
  const layoutBPayloadSourceProgramSummary = layoutBPayloadSourceProgramBridge.summary || {};
  const dynamicSourceTableSummary = dynamicSourceTableSemantics.summary || {};
  const captureSummary = sourceProgramCaptureSummary.summary || {};
  const staticMeshShaderParamsCapture = staticMeshShaderParamsCaptureSummary.summary || {};

  const gateRows = [
    {
      gate: "static-shadergraph-sampler-inventory",
      status: "diagnostic",
      evidence: `${materialSummary.materialRows || 0} material rows, ${materialSummary.rowsWithRuntimeSamplerRecords || 0} runtime sampler rows`,
      recovered: Boolean(materialSummary.parsedShadergraphRows),
      blocker: "sampler role inventory is not native sampler ownership",
    },
    {
      gate: "shaderdata-built-in-type4-semantics",
      status: type4Summary.shaderDataType4SemanticTextureValueSourceRecovered ? "recovered-limited" : "missing",
      evidence: (type4ValueSource.type4SemanticNames || []).join("|"),
      recovered: Boolean(type4Summary.shaderDataType4SemanticTextureValueSourceRecovered),
      blocker: "built-in semantic textures are not ordinary character material sampler ownership",
    },
    {
      gate: "shaderdata-type4-entry-semantics",
      status: type4EntrySummary.type4EntrySemanticsRecovered ? "recovered-entry-formula" : "missing",
      evidence: `${type4EntrySummary.opcodeRows || 0} opcode rows`,
      recovered: Boolean(type4EntrySummary.type4EntrySemanticsRecovered),
      blocker: "type4 entry mechanics are not concrete sampler-to-texData ownership",
    },
    {
      gate: "shaderdata-texture-sampler-table",
      status: samplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered ? "recovered-static" : "missing",
      evidence: `${samplerTableSummary.opcodeRows || 0} opcode rows`,
      recovered: Boolean(samplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered),
      blocker: "static sampler-unit table is not concrete texData ownership",
    },
    {
      gate: "shaderdata-external-texture-runtime-binding",
      status: externalSummary.externalTextureSamplerRuntimeBindingRecovered ? "recovered-external-path" : "missing",
      evidence: `${externalSummary.externalTextureType4PatchRows || 0} type4 patch rows`,
      recovered: Boolean(externalSummary.externalTextureSamplerRuntimeBindingRecovered),
      blocker: "external texture path does not name every shadergraph sampler role or shader formula",
    },
    {
      gate: "texture-sampler-state-semantics",
      status: samplerStateSummary.textureSamplerStateFormulaRecovered ? "recovered-state-formula" : "missing",
      evidence: `${samplerStateSummary.opcodeRows || 0} opcode rows, ${samplerStateSummary.tableRows || 0} table rows`,
      recovered: Boolean(samplerStateSummary.textureSamplerStateFormulaRecovered),
      blocker: "sampler state formula is not sampler resource ownership or shader texture formula",
    },
    {
      gate: "shaderdata-inline-texture-runtime-binding",
      status: inlineSummary.inlineTextureObjectBindingRecovered
        ? "recovered-inline-path"
        : inlineSummary.inlineType4PlaceholderObjectInitiallyNull
          ? "blocked-on-inline-runtime-patch"
          : "missing",
      evidence: `${inlineSummary.opcodeRows || 0} opcode rows`,
      recovered: Boolean(inlineSummary.inlineTextureObjectBindingRecovered),
      blocker: "inline texture records currently create null type4 placeholders until a later runtime patch path is recovered",
    },
    {
      gate: "shadergraph-sampler-resource-classification",
      status: samplerJoinSummary.samplerResourceClassificationComplete
        ? "recovered-resource-classification"
        : "diagnostic-gaps",
      evidence: `${samplerJoinSummary.materialSamplerRows || 0} sampler rows, ${samplerJoinSummary.samplerSourceKeyHashRows || 0} sourceKeyHash rows, ${samplerJoinSummary.externalTexturePathSamplerRows || 0} external paths, ${samplerJoinSummary.inlineRuntimeSamplerRows || 0} inline, ${samplerJoinSummary.runtimeSceneTextureSamplerRows || 0} scene, ${samplerJoinSummary.classificationGapRows || 0} gaps`,
      recovered: Boolean(samplerJoinSummary.samplerResourceClassificationComplete),
      blocker: "sampler resource classification is not live source/program texData ownership",
    },
    {
      gate: "definition-shaderparams-payload-structure",
      status: definitionPayloadSummary.staticUniformOverridePayloadLocated
        ? "recovered-static-uniform-payload"
        : "missing",
      evidence: `${definitionPayloadSummary.shaderUniformPayloadRows || 0} uniform payload rows, ${definitionPayloadSummary.uniformRowsWithFloatValueCandidates || 0} float candidates, ${definitionPayloadSummary.uniformNearbySmallIntegerPayloadRows || 0} small-int candidates, ${definitionPayloadSummary.uniformRowsWithSamplerNameNeighbor || 0} sampler neighbors`,
      recovered: Boolean(definitionPayloadSummary.staticUniformOverridePayloadLocated),
      blocker: "static uniform override payloads are not source/program sampler ownership or texData binding",
    },
    {
      gate: "staticmesh-shaderparams-override",
      status: shaderParameterSummary.shaderParamsOverrideProducesTextureObjectType4 === false
        ? "disqualified-as-texture-source"
        : "unknown",
      evidence: `${shaderParameterSummary.shaderParamsNumericOverrideRows || 0} numeric override rows`,
      recovered: shaderParameterSummary.shaderParamsOverrideProducesTextureObjectType4 === false,
      blocker: "StaticMesh ShaderParams overrides are numeric uniforms only",
    },
    {
      gate: "dynamic-source-table-semantics",
      status: dynamicSourceTableSummary.resourceFieldNamesRecovered
        ? "resource-field-names-recovered"
        : dynamicSourceTableSummary.sourceTableProducerAgrees
          ? "producer-chain-recovered"
          : "missing",
      evidence: `type-index ${
        dynamicSourceTableSummary.sourceTableTypeIndexChainRecovered ? "closed" : "open"
      }, selector ${dynamicSourceTableSummary.selectorChildClassMatchRecovered ? "closed" : "open"}, producer ${
        dynamicSourceTableSummary.sourceTableProducerAgrees ? "agrees" : "unknown"
      }, resource fields ${dynamicSourceTableSummary.resourceFieldNamesRecovered ? "recovered" : "missing"}`,
      recovered: Boolean(dynamicSourceTableSummary.resourceFieldNamesRecovered),
      blocker: "dynamic source-table producer and selector are not active resource field names or sampler ownership",
    },
    {
      gate: "layout-b-payload-source-program-bridge",
      status: layoutBPayloadSourceProgramSummary.payloadSourceProgramBridgeRecovered
        ? "recovered-source-program-bridge"
        : "missing",
      evidence: `${layoutBPayloadSourceProgramSummary.opcodeRows || 0} opcode rows, render promotion ${layoutBPayloadSourceProgramSummary.renderPromotionAllowedRows || 0}`,
      recovered: Boolean(layoutBPayloadSourceProgramSummary.payloadSourceProgramBridgeRecovered),
      blocker: "source/program construction and parameter application are not live type4 texture-object ownership",
    },
    {
      gate: "material-source-program-runtime-capture",
      status: captureSummary.captureStatus || "missing-summary",
      evidence: `${captureSummary.observedHookTargets || 0}/${captureSummary.targetRows || 0} hooks, ${captureSummary.targetEventRowsWithEventId || 0}/${captureSummary.targetEventRows || 0} eventId rows, ${captureSummary.targetEventRowsWithThreadId || 0}/${captureSummary.targetEventRows || 0} threadId rows, ${captureSummary.targetEventDuplicateEventIdRows || 0} duplicate eventId rows, ${captureSummary.targetEventNonMonotonicEventIdRows || 0} non-monotonic eventId rows, ${captureSummary.sourceProgramTableDecodedEntryRows || 0} decoded table entries, ${captureSummary.sourceProgramType4EntryRows || 0} type4 entries, ${captureSummary.sourceProgramMountedType4TableRows || 0} mounted type4 tables, ${captureSummary.textureLookupKnownShadergraphResourceKeyRows || 0} known lookup keys, ${captureSummary.textureLookupRegisteredKnownShadergraphResourceKeyRows || 0} registered lookup keys, ${captureSummary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows || 0} registered unit/value rows, ${captureSummary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0} registered sourceKeyHash identity/value rows, type4 decoder ${captureSummary.sourceProgramType4DecoderReady ? "ready" : "missing"}`,
      recovered: Boolean(captureSummary.readyForManualTextureSamplerReview),
      blocker: "live source/program resource-list, decoded table values, mounted type4 tables, and same-sequence runtime texture patches are not imported together",
    },
    {
      gate: "material-texture-runtime-capture",
      status: captureSummary.readyForManualTextureRuntimeReview
        ? "ready-for-texture-runtime-review"
        : captureSummary.captureStatus || "missing-summary",
      evidence: `${captureSummary.textureRuntimeLookupEvents || 0} lookup events, ${captureSummary.textureRuntimeLookupReturnRows || 0} returned objects, ${captureSummary.type4TexturePatchEvents || 0} type4 patch events, ${captureSummary.type4TexturePatchDecodedType4EntryRows || 0} patched type4 entries`,
      recovered: Boolean(captureSummary.readyForManualTextureRuntimeReview),
      blocker: "runtime texture key/object lookup and type4 patch evidence are not imported together",
    },
  ];

  const unresolvedSamplerRows = sumObjectValues(materialSummary.byUnresolvedSampler);
  const unhashedSamplerRows = sumObjectValues(materialSummary.byUnhashedSampler);
  const texturePathMissingSamplerRows = sumObjectValues(materialSummary.byTexturePathMissingSampler);
  const runtimeResolvedSamplerRows = sumObjectValues(materialSummary.byRuntimeResolvedSampler);
  const runtimeResolvedTexturePathMissingSamplerRows = sumOverlappingSamplerRows(
    materialSummary.byTexturePathMissingSampler,
    materialSummary.byRuntimeResolvedSampler,
  );
  const texturePathMissingSamplerBlockingRows = Math.max(
    0,
    texturePathMissingSamplerRows - runtimeResolvedTexturePathMissingSamplerRows,
  );
  const texturePathMissingSamplerRowsAreRuntimeResolved =
    texturePathMissingSamplerRows > 0 && texturePathMissingSamplerBlockingRows === 0;
  const runtimeLightProbeBlockedRows = Number(materialSummary.byNativeShaderBlocker?.["runtime-light-probe-values-unresolved"] || 0);
  const externalMechanicalTexturePathRecovered =
    Boolean(shaderParameterSummary.textureObjectBindingRecovered) &&
    Boolean(samplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered) &&
    Boolean(externalSummary.externalTextureSamplerRuntimeBindingRecovered);
  const inlineMechanicalTexturePathRecovered =
    Boolean(samplerTableSummary.inlineTextureRecordConsumerRecovered) &&
    Boolean(inlineSummary.inlineTextureObjectBindingRecovered);
  const allMechanicalTexturePathsRecovered =
    externalMechanicalTexturePathRecovered && inlineMechanicalTexturePathRecovered;
  const shadergraphSamplerIdentityTableComplete =
    Boolean(samplerJoinSummary.materialSamplerRows) &&
    samplerJoinSummary.samplerSourceKeyHashRows === samplerJoinSummary.materialSamplerRows;
  const sourceProgramSamplerIdentityReviewReady = Boolean(captureSummary.readyForManualTextureSamplerReview);
  const samplerOwnershipReviewReady =
    allMechanicalTexturePathsRecovered &&
    Boolean(samplerJoinSummary.samplerResourceClassificationComplete) &&
    shadergraphSamplerIdentityTableComplete &&
    sourceProgramSamplerIdentityReviewReady;
  const ordinaryMaterialSamplerOwnershipRecovered =
    samplerOwnershipReviewReady &&
    Boolean(externalSummary.materialSamplerTextureObjectOwnershipRecovered) &&
    unresolvedSamplerRows === 0 &&
    unhashedSamplerRows === 0;
  const summary = {
    materialRows: materialSummary.materialRows || 0,
    parsedShadergraphRows: materialSummary.parsedShadergraphRows || 0,
    rowsWithRuntimeSamplerRecords: materialSummary.rowsWithRuntimeSamplerRecords || 0,
    unresolvedSamplerRows,
    unhashedSamplerRows,
    texturePathMissingSamplerRows,
    runtimeResolvedSamplerRows,
    runtimeResolvedTexturePathMissingSamplerRows,
    texturePathMissingSamplerBlockingRows,
    texturePathMissingSamplerRowsAreRuntimeResolved,
    runtimeLightProbeBlockedRows,
    type4SemanticRows: type4Summary.type4SemanticRows || 0,
    shaderDataType4SemanticTextureValueSourceRecovered: Boolean(type4Summary.shaderDataType4SemanticTextureValueSourceRecovered),
    shaderDataType4EntrySemanticsRecovered: Boolean(type4EntrySummary.type4EntrySemanticsRecovered),
    shaderDataType4RuntimePatchRecovered: Boolean(type4EntrySummary.runtimeType4ValuePatchRecovered),
    shaderDataTextureSamplerStaticUnitLayoutRecovered: Boolean(
      samplerTableSummary.shaderDataTextureSamplerStaticUnitLayoutRecovered,
    ),
    externalTextureSamplerRuntimeBindingRecovered: Boolean(externalSummary.externalTextureSamplerRuntimeBindingRecovered),
    textureSamplerStateFormulaRecovered: Boolean(samplerStateSummary.textureSamplerStateFormulaRecovered),
    textureSamplerStateWrapReservedTableRows: samplerStateSummary.wrapReservedTableRows || 0,
    inlineType4PlaceholderObjectInitiallyNull: Boolean(inlineSummary.inlineType4PlaceholderObjectInitiallyNull),
    inlineTextureObjectBindingRecovered: Boolean(inlineSummary.inlineTextureObjectBindingRecovered),
    inlineTextureRuntimePatchRequired: Boolean(inlineSummary.inlineTextureRuntimePatchRequired),
    shadergraphSamplerResourceClassificationComplete: Boolean(samplerJoinSummary.samplerResourceClassificationComplete),
    shadergraphSamplerResourceClassificationRows: samplerJoinSummary.materialSamplerRows || 0,
    shadergraphSamplerSourceKeyHashRows: samplerJoinSummary.samplerSourceKeyHashRows || 0,
    shadergraphSamplerIdentityTableComplete,
    shadergraphExternalTexturePathSamplerRows: samplerJoinSummary.externalTexturePathSamplerRows || 0,
    shadergraphInlineRuntimeSamplerRows: samplerJoinSummary.inlineRuntimeSamplerRows || 0,
    shadergraphRuntimeSceneTextureSamplerRows: samplerJoinSummary.runtimeSceneTextureSamplerRows || 0,
    shadergraphSamplerClassificationGapRows: samplerJoinSummary.classificationGapRows || 0,
    definitionShaderParamsPayloadRows: definitionPayloadSummary.shaderUniformPayloadRows || 0,
    definitionShaderParamsUniqueUniformRows: definitionPayloadSummary.uniqueShaderUniformNameRows || 0,
    definitionShaderParamsFloatValueCandidateRows: definitionPayloadSummary.uniformRowsWithFloatValueCandidates || 0,
    definitionShaderParamsNearbyObjectPayloadRows: definitionPayloadSummary.uniformNearbyObjectPayloadRows || 0,
    definitionShaderParamsScalarFloatPayloadRows: definitionPayloadSummary.uniformNearbyScalarFloatPayloadRows || 0,
    definitionShaderParamsSmallIntegerPayloadRows: definitionPayloadSummary.uniformNearbySmallIntegerPayloadRows || 0,
    definitionShaderParamsNestedPayloadRows: definitionPayloadSummary.uniformNearbyNestedPayloadRows || 0,
    definitionShaderParamsSamplerNeighborRows: definitionPayloadSummary.uniformRowsWithSamplerNameNeighbor || 0,
    definitionShaderParamsShadergraphNeighborRows: definitionPayloadSummary.uniformRowsWithShadergraphPathNeighbor || 0,
    definitionShaderParamsTextureResourceNeighborRows: definitionPayloadSummary.uniformRowsWithTextureResourceNeighbor || 0,
    definitionShaderParamsStaticUniformOverridePayloadLocated: Boolean(
      definitionPayloadSummary.staticUniformOverridePayloadLocated,
    ),
    definitionShaderParamsStructuredListRecovered: Boolean(definitionPayloadSummary.structuredShaderParamsListRecovered),
    definitionShaderParamsSourceProgramStaticReplacementAllowed: Boolean(
      definitionPayloadSummary.sourceProgramStaticReplacementAllowed,
    ),
    definitionShaderParamsShaderParamIdListCandidatesLocated: Boolean(
      definitionPayloadSummary.staticShaderParamIdListCandidatesLocated,
    ),
    shaderParamsOverrideProducesTextureObjectType4: Boolean(shaderParameterSummary.shaderParamsOverrideProducesTextureObjectType4),
    staticMeshShaderParamsDisqualifiedAsTextureSource:
      shaderParameterSummary.shaderParamsOverrideProducesTextureObjectType4 === false,
    staticMeshShaderParamsCaptureImported: Boolean(staticMeshShaderParamsCapture.captureImported),
    staticMeshShaderParamsCaptureStatus: staticMeshShaderParamsCapture.captureStatus || "",
    staticMeshShaderParamsCaptureTargetHooksReady: Boolean(staticMeshShaderParamsCapture.targetHooksReady),
    staticMeshShaderParamsCaptureReadyForManualReview: Boolean(
      staticMeshShaderParamsCapture.readyForManualShaderParamsReview,
    ),
    staticMeshShaderParamsCaptureListEntryRows: staticMeshShaderParamsCapture.shaderParamsListEntryRows || 0,
    staticMeshShaderParamsCaptureValueRows: staticMeshShaderParamsCapture.shaderParamValueRows || 0,
    staticMeshShaderParamsCaptureRenderPromotionRows:
      staticMeshShaderParamsCapture.renderPromotionAllowedRows || 0,
    dynamicSourceTableTypeIndexChainRecovered: Boolean(
      dynamicSourceTableSummary.sourceTableTypeIndexChainRecovered,
    ),
    dynamicSourceTableSelectorChainRecovered: Boolean(
      dynamicSourceTableSummary.selectorChildClassMatchRecovered &&
        dynamicSourceTableSummary.selectorCallerObjectCreationRecovered &&
        dynamicSourceTableSummary.batchDispatcherToSelectorRecovered,
    ),
    dynamicSourceTableProducerAgrees: Boolean(dynamicSourceTableSummary.sourceTableProducerAgrees),
    dynamicSourceTableResourceFieldNamesRecovered: Boolean(dynamicSourceTableSummary.resourceFieldNamesRecovered),
    dynamicSourceTableActiveResourceSemanticsRecovered: Boolean(
      dynamicSourceTableSummary.activeResourceSemanticsRecovered,
    ),
    dynamicSourceTableRenderPromotionRows: dynamicSourceTableSummary.renderPromotionAllowedRows || 0,
    layoutBPayloadSourceProgramBridgeRecovered: Boolean(
      layoutBPayloadSourceProgramSummary.payloadSourceProgramBridgeRecovered,
    ),
    layoutBPayloadSourceProgramSchemaRecovered: Boolean(
      layoutBPayloadSourceProgramSummary.schemaSourceObjectConstructionRecovered,
    ),
    layoutBPayloadSourceProgramLookupRecovered: Boolean(
      layoutBPayloadSourceProgramSummary.sourceObjectLookupAndFallbackRecovered,
    ),
    layoutBPayloadSourceProgramDrawSelectionRecovered: Boolean(
      layoutBPayloadSourceProgramSummary.drawSourceProgramSelectionRecovered,
    ),
    layoutBPayloadSourceProgramParameterApplyRecovered: Boolean(
      layoutBPayloadSourceProgramSummary.sourceParameterApplyFormulaRecovered,
    ),
    layoutBPayloadSourceProgramRenderPromotionRows:
      layoutBPayloadSourceProgramSummary.renderPromotionAllowedRows || 0,
    sourceProgramCaptureImported: Boolean(captureSummary.captureImported),
    sourceProgramCaptureReadyForManualReview: Boolean(captureSummary.readyForManualSourceProgramReview),
    sourceProgramCaptureReadyForTextureSamplerReview: Boolean(captureSummary.readyForManualTextureSamplerReview),
    sourceProgramSamplerIdentityReviewReady,
    sourceProgramObservedHookTargets: captureSummary.observedHookTargets || 0,
    sourceProgramTargetRows: captureSummary.targetRows || 0,
    sourceProgramTargetEventRows: captureSummary.targetEventRows || 0,
    sourceProgramTargetEventRowsWithEventId: captureSummary.targetEventRowsWithEventId || 0,
    sourceProgramTargetEventRowsWithThreadId: captureSummary.targetEventRowsWithThreadId || 0,
    sourceProgramCaptureOrderingFieldsComplete: Boolean(captureSummary.captureOrderingFieldsComplete),
    sourceProgramTargetEventDuplicateEventIdRows: captureSummary.targetEventDuplicateEventIdRows || 0,
    sourceProgramTargetEventNonMonotonicEventIdRows: captureSummary.targetEventNonMonotonicEventIdRows || 0,
    sourceProgramCaptureEventIdOrderingComplete: Boolean(captureSummary.captureEventIdOrderingComplete),
    sourceProgramCaptureLimitRows: captureSummary.captureLimitRows || 0,
    sourceProgramCaptureLimitDroppedEventRowsAtLeast: captureSummary.captureLimitDroppedEventRowsAtLeast || 0,
    sourceProgramCaptureEventLimitHit: Boolean(captureSummary.captureEventLimitHit),
    sourceProgramResourceListTruncatedRows: captureSummary.resourceListTruncatedRows || 0,
    sourceProgramNestedResourceIdTruncatedRows: captureSummary.nestedResourceIdTruncatedRows || 0,
    sourceProgramResourceListCaptureComplete: Boolean(captureSummary.resourceListCaptureComplete),
    sourceProgramTableDecodeEvents: captureSummary.sourceProgramTableDecodeEvents || 0,
    sourceProgramTableDecodedEntryRows: captureSummary.sourceProgramTableDecodedEntryRows || 0,
    sourceProgramTableDecodedValueWordRows: captureSummary.sourceProgramTableDecodedValueWordRows || 0,
    sourceProgramTableTruncatedRows: captureSummary.sourceProgramTableTruncatedRows || 0,
    sourceProgramTableMissingEntryRows: captureSummary.sourceProgramTableMissingEntryRows || 0,
    sourceProgramTableCaptureComplete: Boolean(captureSummary.sourceProgramTableCaptureComplete),
    sourceProgramType4EntryRows: captureSummary.sourceProgramType4EntryRows || 0,
    sourceProgramDirectValueEntryRows: captureSummary.sourceProgramDirectValueEntryRows || 0,
    sourceProgramMountedType4TableRows: captureSummary.sourceProgramMountedType4TableRows || 0,
    sourceProgramKnownShadergraphTextureResourceRows:
      captureSummary.knownShadergraphTextureResourceRows || 0,
    sourceProgramKnownShadergraphTextureResourceUnitRows:
      captureSummary.knownShadergraphTextureResourceUnitRows || 0,
    sourceProgramKnownShadergraphTextureResourceSamplerIdentityRows:
      captureSummary.knownShadergraphTextureResourceSamplerIdentityRows || 0,
    sourceProgramTextureRegistrationResourceKeyRows:
      captureSummary.textureRegistrationResourceKeyRows || 0,
    sourceProgramTextureRegistrationKnownShadergraphResourceKeyRows:
      captureSummary.textureRegistrationKnownShadergraphResourceKeyRows || 0,
    sourceProgramTextureLookupResourceKeyRows:
      captureSummary.textureLookupResourceKeyRows || 0,
    sourceProgramTextureLookupKnownShadergraphResourceKeyRows:
      captureSummary.textureLookupKnownShadergraphResourceKeyRows || 0,
    sourceProgramTextureLookupUnknownShadergraphResourceKeyRows:
      captureSummary.textureLookupUnknownShadergraphResourceKeyRows || 0,
    sourceProgramTextureLookupRegisteredKnownShadergraphResourceKeyRows:
      captureSummary.textureLookupRegisteredKnownShadergraphResourceKeyRows || 0,
    sourceProgramTextureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows:
      captureSummary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows || 0,
    sourceProgramTextureRegistrationEvents: captureSummary.textureRegistrationEvents || 0,
    sourceProgramTextureRuntimeLookupEvents: captureSummary.textureRuntimeLookupEvents || 0,
    sourceProgramTextureRuntimeLookupReturnRows: captureSummary.textureRuntimeLookupReturnRows || 0,
    sourceProgramInlineTextureObjectBuilderEvents: captureSummary.inlineTextureObjectBuilderEvents || 0,
    sourceProgramInlineTextureObjectReturnRows: captureSummary.inlineTextureObjectReturnRows || 0,
    sourceProgramType4TexturePatchEvents: captureSummary.type4TexturePatchEvents || 0,
    sourceProgramType4TexturePatchAfterDecodeEvents: captureSummary.type4TexturePatchAfterDecodeEvents || 0,
    sourceProgramType4TexturePatchDecodedEntryRows: captureSummary.type4TexturePatchDecodedEntryRows || 0,
    sourceProgramType4TexturePatchDecodedType4EntryRows:
      captureSummary.type4TexturePatchDecodedType4EntryRows || 0,
    sourceProgramType4TexturePatchKnownReturnedObjectRows:
      captureSummary.type4TexturePatchKnownReturnedObjectRows || 0,
    sourceProgramType4TexturePatchValueMatchesObjectRows:
      captureSummary.type4TexturePatchValueMatchesObjectRows || 0,
    sourceProgramType4TexturePatchSameObjectAndValueMatchRows:
      captureSummary.type4TexturePatchSameObjectAndValueMatchRows || 0,
    sourceProgramType4TexturePatchSamplerUnitMatchesEntryRows:
      captureSummary.type4TexturePatchSamplerUnitMatchesEntryRows || 0,
    sourceProgramType4TexturePatchValueAndSamplerUnitMatchRows:
      captureSummary.type4TexturePatchValueAndSamplerUnitMatchRows || 0,
    sourceProgramType4TexturePatchSameThreadObjectRows:
      captureSummary.type4TexturePatchSameThreadObjectRows || 0,
    sourceProgramType4TexturePatchOrderedSameThreadObjectRows:
      captureSummary.type4TexturePatchOrderedSameThreadObjectRows || 0,
    sourceProgramType4TexturePatchSameSequenceObjectAndValueMatchRows:
      captureSummary.type4TexturePatchSameSequenceObjectAndValueMatchRows || 0,
    sourceProgramType4TexturePatchSameSequenceObjectUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceObjectUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceKnownResourceObjectRows:
      captureSummary.type4TexturePatchSameSequenceKnownResourceObjectRows || 0,
    sourceProgramType4TexturePatchSameSequenceKnownResourceUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceObjectRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows || 0,
    sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows:
      captureSummary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0,
    sourceProgramType4TexturePatchMountedTableRows:
      captureSummary.type4TexturePatchMountedTableRows || 0,
    sourceProgramType4TexturePatchOrderedMountedTableRows:
      captureSummary.type4TexturePatchOrderedMountedTableRows || 0,
    sourceProgramType4TexturePatchSameSequenceTableObjectRows:
      captureSummary.type4TexturePatchSameSequenceTableObjectRows || 0,
    sourceProgramType4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows:
      captureSummary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows || 0,
    sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows:
      captureSummary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows || 0,
    sourceProgramTextureRuntimeReadyForReview: Boolean(captureSummary.readyForManualTextureRuntimeReview),
    sourceProgramTextureResourceKeyReadyForReview: Boolean(captureSummary.readyForManualTextureResourceKeyReview),
    sourceProgramType4DecoderReady: Boolean(captureSummary.sourceProgramType4DecoderReady),
    sourceProgramType4DecoderNeedsRuntimeCapture: Boolean(captureSummary.sourceProgramType4DecoderNeedsRuntimeCapture),
    sourceProgramType4ValueWordCount: captureSummary.sourceProgramType4ValueWordCount || 0,
    externalMechanicalTexturePathRecovered,
    inlineMechanicalTexturePathRecovered,
    allMechanicalTexturePathsRecovered,
    samplerOwnershipReviewReady,
    shadergraphSamplerToTexDataBindingRecovered: Boolean(externalSummary.shadergraphSamplerToTexDataBindingRecovered),
    ordinaryMaterialSamplerOwnershipRecovered,
    shaderTextureFormulaRecovered:
      Boolean(type4Summary.shaderTextureFormulaRecovered) &&
      Boolean(externalSummary.shaderTextureFormulaRecovered) &&
      Boolean(shaderParameterSummary.shaderTextureFormulaRecovered),
    renderPromotionAllowedRows: 0,
  };
  return {
    generatedAt,
    source: {
      materialRuntimePath,
      type4ValueSourcePath,
      type4EntrySemanticsPath,
      textureSamplerTablePath,
      externalTextureBindingPath,
      textureSamplerStateSemanticsPath,
      inlineTexturePlaceholderPath,
      shadergraphSamplerTexDataJoinPath,
      definitionShaderParamsPayloadStructurePath,
      staticMeshShaderParamsCaptureSummaryPath,
      shaderParameterBridgePath,
      layoutBPayloadSourceProgramBridgePath,
      dynamicSourceTableSemanticsPath,
      sourceProgramCaptureSummaryPath,
    },
    policy:
      "diagnostic-only material sampler ownership gate; consolidates recovered texture mechanics and remaining ownership blockers without enabling rendering",
    summary,
    interpretation: {
      recovered:
        "The external and inline mechanical texture upload/bind paths are recovered: external texture keys can be resolved and patched into type4 value slots, inline payloads can be built/uploaded into runtime texture objects and patched into type4 value slots, and draw-time parameter type 4 reaches the texture object binder.",
      boundary:
        "This still does not recover ordinary character-material sampler ownership. StaticMesh ShaderParams are numeric overrides, built-in type4 semantics are limited to global textures, the layout B payload +0x208 source/program bridge only proves construction and parameter application, source/program live values with decoded type4 table entries have not been imported, and shadergraph sampler-to-texData ownership remains false. Runtime inline/scene samplers may be resolved without an external texture path.",
      nextRequiredEvidence:
        "Import live source/program capture rows with decoded table entries, then trace the base shader/program type4 sampler ids through shaderData texture records to concrete texData objects and shadergraph sampler roles before any renderer promotion.",
    },
    items: gateRows,
  };
}

function exportCurrentNativeMaterialSamplerOwnershipGateAudit({
  materialRuntimePath = defaultMaterialRuntimePath,
  type4ValueSourcePath = defaultType4ValueSourcePath,
  type4EntrySemanticsPath = defaultType4EntrySemanticsPath,
  textureSamplerTablePath = defaultTextureSamplerTablePath,
  externalTextureBindingPath = defaultExternalTextureBindingPath,
  textureSamplerStateSemanticsPath = defaultTextureSamplerStateSemanticsPath,
  inlineTexturePlaceholderPath = defaultInlineTexturePlaceholderPath,
  shaderParameterBridgePath = defaultShaderParameterBridgePath,
  shadergraphSamplerTexDataJoinPath = defaultShadergraphSamplerTexDataJoinPath,
  definitionShaderParamsPayloadStructurePath = defaultDefinitionShaderParamsPayloadStructurePath,
  layoutBPayloadSourceProgramBridgePath = defaultLayoutBPayloadSourceProgramBridgePath,
  dynamicSourceTableSemanticsPath = defaultDynamicSourceTableSemanticsPath,
  sourceProgramCaptureSummaryPath = defaultSourceProgramCaptureSummaryPath,
  staticMeshShaderParamsCaptureSummaryPath = defaultStaticMeshShaderParamsCaptureSummaryPath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit({
    materialRuntimePath,
    type4ValueSourcePath,
    type4EntrySemanticsPath,
    textureSamplerTablePath,
    externalTextureBindingPath,
    textureSamplerStateSemanticsPath,
    inlineTexturePlaceholderPath,
    shadergraphSamplerTexDataJoinPath,
    definitionShaderParamsPayloadStructurePath,
    shaderParameterBridgePath,
    layoutBPayloadSourceProgramBridgePath,
    dynamicSourceTableSemanticsPath,
    sourceProgramCaptureSummaryPath,
    staticMeshShaderParamsCaptureSummaryPath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(tsvOut, manifest.items, ["gate", "status", "evidence", "recovered", "blocker"]);
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeMaterialSamplerOwnershipGateAudit({
    materialRuntimePath: optionValue(args, "--material-runtime", defaultMaterialRuntimePath),
    type4ValueSourcePath: optionValue(args, "--type4-value-source", defaultType4ValueSourcePath),
    type4EntrySemanticsPath: optionValue(args, "--type4-entry-semantics", defaultType4EntrySemanticsPath),
    textureSamplerTablePath: optionValue(args, "--texture-sampler-table", defaultTextureSamplerTablePath),
    externalTextureBindingPath: optionValue(args, "--external-texture-binding", defaultExternalTextureBindingPath),
    textureSamplerStateSemanticsPath: optionValue(
      args,
      "--texture-sampler-state-semantics",
      defaultTextureSamplerStateSemanticsPath,
    ),
    inlineTexturePlaceholderPath: optionValue(args, "--inline-texture-placeholder", defaultInlineTexturePlaceholderPath),
    shadergraphSamplerTexDataJoinPath: optionValue(
      args,
      "--shadergraph-sampler-texdata-join",
      defaultShadergraphSamplerTexDataJoinPath,
    ),
    definitionShaderParamsPayloadStructurePath: optionValue(
      args,
      "--definition-shaderparams-payload-structure",
      defaultDefinitionShaderParamsPayloadStructurePath,
    ),
    shaderParameterBridgePath: optionValue(args, "--shader-parameter-bridge", defaultShaderParameterBridgePath),
    layoutBPayloadSourceProgramBridgePath: optionValue(
      args,
      "--layout-b-payload-source-program-bridge",
      defaultLayoutBPayloadSourceProgramBridgePath,
    ),
    dynamicSourceTableSemanticsPath: optionValue(
      args,
      "--dynamic-source-table-semantics",
      defaultDynamicSourceTableSemanticsPath,
    ),
    sourceProgramCaptureSummaryPath: optionValue(args, "--source-program-capture-summary", defaultSourceProgramCaptureSummaryPath),
    staticMeshShaderParamsCaptureSummaryPath: optionValue(
      args,
      "--staticmesh-shaderparams-capture-summary",
      defaultStaticMeshShaderParamsCaptureSummaryPath,
    ),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeMaterialSamplerOwnershipGateAudit,
  exportCurrentNativeMaterialSamplerOwnershipGateAudit,
};
