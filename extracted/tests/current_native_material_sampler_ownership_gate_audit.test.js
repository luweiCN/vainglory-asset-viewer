const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeMaterialSamplerOwnershipGateAudit,
  exportCurrentNativeMaterialSamplerOwnershipGateAudit,
} = require("../tools/current_native_material_sampler_ownership_gate_audit");

function writeJson(tempDir, name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function fixturePaths(tempDir, overrides = {}) {
  const materialRuntimePath = writeJson(tempDir, "material-runtime.json", {
    summary: {
      materialRows: 10,
      parsedShadergraphRows: 10,
      rowsWithRuntimeSamplerRecords: 6,
      byUnresolvedSampler: { sampler37: 2 },
      byUnhashedSampler: { sampler60: 3 },
      byTexturePathMissingSampler: { sampler37: 2, sampler60: 3 },
      byRuntimeResolvedSampler: { sampler60: 3 },
      byNativeShaderBlocker: { "runtime-light-probe-values-unresolved": 4 },
    },
  });
  const type4ValueSourcePath = writeJson(tempDir, "type4.json", {
    summary: {
      type4SemanticRows: 3,
      shaderDataType4SemanticTextureValueSourceRecovered: true,
      shaderTextureFormulaRecovered: false,
    },
    type4SemanticNames: ["CloudShadows.Texture", "FogOfWar.Texture", "Shadowing.mMap"],
  });
  const type4EntrySemanticsPath = writeJson(tempDir, "type4-entry.json", {
    summary: {
      opcodeRows: 32,
      type4EntrySemanticsRecovered: true,
      runtimeType4ValuePatchRecovered: true,
    },
  });
  const textureSamplerTablePath = writeJson(tempDir, "sampler-table.json", {
    summary: {
      shaderDataTextureSamplerStaticUnitLayoutRecovered: true,
      inlineTextureRecordConsumerRecovered: true,
    },
  });
  const externalTextureBindingPath = writeJson(tempDir, "external.json", {
    summary: {
      externalTextureSamplerRuntimeBindingRecovered: true,
      shadergraphSamplerToTexDataBindingRecovered: false,
      materialSamplerTextureObjectOwnershipRecovered: false,
      shaderTextureFormulaRecovered: false,
    },
  });
  const textureSamplerStateSemanticsPath = writeJson(tempDir, "sampler-state.json", {
    summary: {
      opcodeRows: 30,
      tableRows: 10,
      textureSamplerStateFormulaRecovered: true,
      wrapReservedTableRows: 1,
    },
  });
  const inlineTexturePlaceholderPath = writeJson(tempDir, "inline-placeholder.json", {
    summary: {
      opcodeRows: 38,
      inlineType4PlaceholderObjectInitiallyNull: true,
      inlineTextureObjectBindingRecovered: true,
      inlineTextureRuntimePatchRequired: false,
    },
  });
  const shadergraphSamplerTexDataJoinPath = writeJson(tempDir, "sampler-join.json", {
    summary: {
      materialSamplerRows: 20,
      externalTexturePathSamplerRows: 12,
      samplerSourceKeyHashRows: 20,
      inlineRuntimeSamplerRows: 6,
      runtimeSceneTextureSamplerRows: 2,
      classificationGapRows: 0,
      samplerResourceClassificationComplete: true,
    },
  });
  const definitionShaderParamsPayloadStructurePath = writeJson(tempDir, "definition-shaderparams-payload.json", {
    summary: {
      shaderUniformPayloadRows: 8,
      uniqueShaderUniformNameRows: 3,
      uniformRowsWithFloatValueCandidates: 6,
      uniformNearbyObjectPayloadRows: 12,
      uniformNearbyScalarFloatPayloadRows: 9,
      uniformNearbySmallIntegerPayloadRows: 0,
      uniformNearbyNestedPayloadRows: 3,
      uniformRowsWithSamplerNameNeighbor: 0,
      uniformRowsWithShadergraphPathNeighbor: 0,
      uniformRowsWithTextureResourceNeighbor: 0,
      staticUniformOverridePayloadLocated: true,
      structuredShaderParamsListRecovered: false,
      sourceProgramStaticReplacementAllowed: false,
      staticShaderParamIdListCandidatesLocated: false,
    },
  });
  const shaderParameterBridgePath = writeJson(tempDir, "shader-param.json", {
    summary: {
      textureObjectBindingRecovered: true,
      shaderParamsOverrideProducesTextureObjectType4: false,
      shaderTextureFormulaRecovered: false,
    },
  });
  const sourceProgramCaptureSummaryPath = writeJson(tempDir, "source-program-capture.json", {
    summary: {
      captureImported: false,
      readyForManualSourceProgramReview: false,
      observedHookTargets: 0,
      targetRows: 10,
      targetEventRows: 0,
      targetEventRowsWithEventId: 0,
      targetEventRowsWithThreadId: 0,
      captureOrderingFieldsComplete: false,
      targetEventDuplicateEventIdRows: 0,
      targetEventNonMonotonicEventIdRows: 0,
      captureEventIdOrderingComplete: false,
      sourceProgramType4DecoderReady: true,
      sourceProgramType4DecoderNeedsRuntimeCapture: true,
      sourceProgramType4ValueWordCount: 2,
      knownShadergraphTextureResourceRows: 0,
      knownShadergraphTextureResourceUnitRows: 0,
      knownShadergraphTextureResourceSamplerIdentityRows: 0,
      textureRegistrationResourceKeyRows: 0,
      textureRegistrationKnownShadergraphResourceKeyRows: 0,
      textureLookupResourceKeyRows: 0,
      textureLookupKnownShadergraphResourceKeyRows: 0,
      textureLookupUnknownShadergraphResourceKeyRows: 0,
      textureLookupRegisteredKnownShadergraphResourceKeyRows: 0,
      textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows: 0,
      textureRuntimeLookupEvents: 0,
      textureRuntimeLookupReturnRows: 0,
      inlineTextureObjectBuilderEvents: 0,
      inlineTextureObjectReturnRows: 0,
      type4TexturePatchEvents: 0,
      type4TexturePatchAfterDecodeEvents: 0,
      type4TexturePatchDecodedEntryRows: 0,
      type4TexturePatchDecodedType4EntryRows: 0,
      type4TexturePatchKnownReturnedObjectRows: 0,
      type4TexturePatchValueMatchesObjectRows: 0,
      type4TexturePatchSameObjectAndValueMatchRows: 0,
      type4TexturePatchSameThreadObjectRows: 0,
      type4TexturePatchOrderedSameThreadObjectRows: 0,
      type4TexturePatchSameSequenceObjectAndValueMatchRows: 0,
      type4TexturePatchSamplerUnitMatchesEntryRows: 0,
      type4TexturePatchValueAndSamplerUnitMatchRows: 0,
      type4TexturePatchSameSequenceObjectUnitAndValueRows: 0,
      type4TexturePatchSameSequenceKnownResourceObjectRows: 0,
      type4TexturePatchSameSequenceKnownResourceUnitAndValueRows: 0,
      type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows: 0,
      type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows: 0,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows: 0,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows: 0,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows: 0,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows: 0,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows: 0,
      sourceProgramMountedType4TableRows: 0,
      type4TexturePatchMountedTableRows: 0,
      type4TexturePatchOrderedMountedTableRows: 0,
      type4TexturePatchSameSequenceTableObjectRows: 0,
      type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows: 0,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows: 0,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows: 0,
      readyForManualTextureRuntimeReview: false,
      readyForManualTextureResourceKeyReview: false,
    },
  });
  const staticMeshShaderParamsCaptureSummaryPath = writeJson(tempDir, "staticmesh-shaderparams-capture.json", {
    summary: {
      captureImported: false,
      captureStatus: "capture-missing",
      targetHooksReady: true,
      readyForManualShaderParamsReview: false,
      shaderParamsListEntryRows: 0,
      shaderParamValueRows: 0,
      renderPromotionAllowedRows: 0,
    },
  });
  const layoutBPayloadSourceProgramBridgePath = writeJson(tempDir, "payload-source-program-bridge.json", {
    summary: {
      schemaSourceObjectConstructionRecovered: true,
      sourceObjectLookupAndFallbackRecovered: true,
      drawSourceProgramSelectionRecovered: true,
      sourceParameterApplyFormulaRecovered: true,
      payloadSourceProgramBridgeRecovered: true,
      renderPromotionAllowedRows: 0,
    },
  });
  const dynamicSourceTableSemanticsPath = writeJson(tempDir, "dynamic-source-table-semantics.json", {
    summary: {
      sourceTableTypeIndexChainRecovered: true,
      selectorChildClassMatchRecovered: true,
      selectorCallerObjectCreationRecovered: true,
      upstreamConfigFieldChainRecovered: true,
      batchDispatcherToSelectorRecovered: true,
      levelConfigFieldNamesRecovered: true,
      levelVisualsApplyProcessorFieldRoutingRecovered: true,
      sourceTableProducerAgrees: true,
      resourceFieldNamesRecovered: false,
      activeResourceSemanticsRecovered: false,
      shaderTextureFormulaRecovered: false,
      renderPromotionAllowedRows: 0,
    },
  });
  return {
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
    sourceProgramCaptureSummaryPath,
    staticMeshShaderParamsCaptureSummaryPath,
    layoutBPayloadSourceProgramBridgePath,
    dynamicSourceTableSemanticsPath,
    ...overrides,
  };
}

test("material sampler ownership gate keeps ordinary sampler ownership blocked after mechanical texture paths recover", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-"));
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit(fixturePaths(tempDir));

  assert.equal(manifest.summary.externalMechanicalTexturePathRecovered, true);
  assert.equal(manifest.summary.inlineType4PlaceholderObjectInitiallyNull, true);
  assert.equal(manifest.summary.textureSamplerStateFormulaRecovered, true);
  assert.equal(manifest.summary.textureSamplerStateWrapReservedTableRows, 1);
  assert.equal(manifest.summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(manifest.summary.inlineTextureRuntimePatchRequired, false);
  assert.equal(manifest.summary.inlineMechanicalTexturePathRecovered, true);
  assert.equal(manifest.summary.shadergraphSamplerResourceClassificationComplete, true);
  assert.equal(manifest.summary.shadergraphSamplerResourceClassificationRows, 20);
  assert.equal(manifest.summary.shadergraphSamplerSourceKeyHashRows, 20);
  assert.equal(manifest.summary.shadergraphSamplerIdentityTableComplete, true);
  assert.equal(manifest.summary.shadergraphExternalTexturePathSamplerRows, 12);
  assert.equal(manifest.summary.shadergraphInlineRuntimeSamplerRows, 6);
  assert.equal(manifest.summary.shadergraphRuntimeSceneTextureSamplerRows, 2);
  assert.equal(manifest.summary.shadergraphSamplerClassificationGapRows, 0);
  assert.equal(manifest.summary.definitionShaderParamsPayloadRows, 8);
  assert.equal(manifest.summary.definitionShaderParamsUniqueUniformRows, 3);
  assert.equal(manifest.summary.definitionShaderParamsFloatValueCandidateRows, 6);
  assert.equal(manifest.summary.definitionShaderParamsNearbyObjectPayloadRows, 12);
  assert.equal(manifest.summary.definitionShaderParamsScalarFloatPayloadRows, 9);
  assert.equal(manifest.summary.definitionShaderParamsSmallIntegerPayloadRows, 0);
  assert.equal(manifest.summary.definitionShaderParamsNestedPayloadRows, 3);
  assert.equal(manifest.summary.definitionShaderParamsSamplerNeighborRows, 0);
  assert.equal(manifest.summary.definitionShaderParamsStaticUniformOverridePayloadLocated, true);
  assert.equal(manifest.summary.definitionShaderParamsStructuredListRecovered, false);
  assert.equal(manifest.summary.definitionShaderParamsSourceProgramStaticReplacementAllowed, false);
  assert.equal(manifest.summary.definitionShaderParamsShaderParamIdListCandidatesLocated, false);
  assert.equal(manifest.summary.allMechanicalTexturePathsRecovered, true);
  assert.equal(manifest.summary.shaderDataType4EntrySemanticsRecovered, true);
  assert.equal(manifest.summary.shaderDataType4RuntimePatchRecovered, true);
  assert.equal(manifest.summary.staticMeshShaderParamsDisqualifiedAsTextureSource, true);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureImported, false);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureStatus, "capture-missing");
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureTargetHooksReady, true);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureReadyForManualReview, false);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureListEntryRows, 0);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureValueRows, 0);
  assert.equal(manifest.summary.staticMeshShaderParamsCaptureRenderPromotionRows, 0);
  assert.equal(manifest.summary.sourceProgramCaptureImported, false);
  assert.equal(manifest.summary.sourceProgramCaptureReadyForManualReview, false);
  assert.equal(manifest.summary.sourceProgramCaptureReadyForTextureSamplerReview, false);
  assert.equal(manifest.summary.dynamicSourceTableTypeIndexChainRecovered, true);
  assert.equal(manifest.summary.dynamicSourceTableSelectorChainRecovered, true);
  assert.equal(manifest.summary.dynamicSourceTableProducerAgrees, true);
  assert.equal(manifest.summary.dynamicSourceTableResourceFieldNamesRecovered, false);
  assert.equal(manifest.summary.dynamicSourceTableActiveResourceSemanticsRecovered, false);
  assert.equal(manifest.summary.dynamicSourceTableRenderPromotionRows, 0);
  assert.equal(manifest.summary.layoutBPayloadSourceProgramBridgeRecovered, true);
  assert.equal(manifest.summary.layoutBPayloadSourceProgramParameterApplyRecovered, true);
  assert.equal(manifest.summary.layoutBPayloadSourceProgramRenderPromotionRows, 0);
  assert.equal(manifest.summary.sourceProgramType4DecoderReady, true);
  assert.equal(manifest.summary.sourceProgramType4DecoderNeedsRuntimeCapture, true);
  assert.equal(manifest.summary.sourceProgramType4ValueWordCount, 2);
  assert.equal(manifest.summary.sourceProgramTargetEventRows, 0);
  assert.equal(manifest.summary.sourceProgramTargetEventRowsWithEventId, 0);
  assert.equal(manifest.summary.sourceProgramTargetEventRowsWithThreadId, 0);
  assert.equal(manifest.summary.sourceProgramCaptureOrderingFieldsComplete, false);
  assert.equal(manifest.summary.sourceProgramTargetEventDuplicateEventIdRows, 0);
  assert.equal(manifest.summary.sourceProgramTargetEventNonMonotonicEventIdRows, 0);
  assert.equal(manifest.summary.sourceProgramCaptureEventIdOrderingComplete, false);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceRows, 0);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceUnitRows, 0);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceSamplerIdentityRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureRegistrationResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureRegistrationKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureLookupResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureLookupKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureLookupUnknownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureLookupRegisteredKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.sourceProgramTextureRuntimeLookupEvents, 0);
  assert.equal(manifest.summary.sourceProgramTextureRuntimeLookupReturnRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchEvents, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchDecodedType4EntryRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchKnownReturnedObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchValueMatchesObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameObjectAndValueMatchRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameThreadObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchOrderedSameThreadObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceObjectAndValueMatchRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSamplerUnitMatchesEntryRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchValueAndSamplerUnitMatchRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows, 0);
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchMountedTableRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows, 0);
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(manifest.summary.sourceProgramTextureRuntimeReadyForReview, false);
  assert.equal(manifest.summary.sourceProgramTextureResourceKeyReadyForReview, false);
  assert.equal(manifest.summary.sourceProgramCaptureLimitRows, 0);
  assert.equal(manifest.summary.sourceProgramCaptureLimitDroppedEventRowsAtLeast, 0);
  assert.equal(manifest.summary.sourceProgramCaptureEventLimitHit, false);
  assert.equal(manifest.summary.sourceProgramResourceListTruncatedRows, 0);
  assert.equal(manifest.summary.sourceProgramNestedResourceIdTruncatedRows, 0);
  assert.equal(manifest.summary.sourceProgramResourceListCaptureComplete, false);
  assert.equal(manifest.summary.sourceProgramTableTruncatedRows, 0);
  assert.equal(manifest.summary.sourceProgramTableMissingEntryRows, 0);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, false);
  assert.equal(manifest.summary.unresolvedSamplerRows, 2);
  assert.equal(manifest.summary.unhashedSamplerRows, 3);
  assert.equal(manifest.summary.texturePathMissingSamplerRows, 5);
  assert.equal(manifest.summary.runtimeResolvedSamplerRows, 3);
  assert.equal(manifest.summary.runtimeResolvedTexturePathMissingSamplerRows, 3);
  assert.equal(manifest.summary.texturePathMissingSamplerBlockingRows, 2);
  assert.equal(manifest.summary.texturePathMissingSamplerRowsAreRuntimeResolved, false);
  assert.equal(manifest.summary.ordinaryMaterialSamplerOwnershipRecovered, false);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.equal(manifest.items.length, 14);
  const dynamicSourceTableGate = manifest.items.find((item) => item.gate === "dynamic-source-table-semantics");
  assert.equal(dynamicSourceTableGate.status, "producer-chain-recovered");
  assert.equal(dynamicSourceTableGate.recovered, false);
  assert.match(dynamicSourceTableGate.blocker, /not active resource field names/);
});

test("material sampler ownership gate separates runtime-resolved pathless samplers from blocking path gaps", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-runtime-resolved-"));
  const materialRuntimePath = writeJson(tempDir, "material-runtime-runtime-resolved.json", {
    summary: {
      materialRows: 10,
      parsedShadergraphRows: 10,
      rowsWithRuntimeSamplerRecords: 6,
      byUnresolvedSampler: {},
      byUnhashedSampler: { sampler60: 3, sampler61: 2 },
      byTexturePathMissingSampler: { sampler60: 3, sampler61: 2 },
      byRuntimeResolvedSampler: { sampler60: 3, sampler61: 2 },
      byNativeShaderBlocker: {},
    },
  });
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit(
    fixturePaths(tempDir, { materialRuntimePath }),
  );

  assert.equal(manifest.summary.unresolvedSamplerRows, 0);
  assert.equal(manifest.summary.texturePathMissingSamplerRows, 5);
  assert.equal(manifest.summary.runtimeResolvedSamplerRows, 5);
  assert.equal(manifest.summary.runtimeResolvedTexturePathMissingSamplerRows, 5);
  assert.equal(manifest.summary.texturePathMissingSamplerBlockingRows, 0);
  assert.equal(manifest.summary.texturePathMissingSamplerRowsAreRuntimeResolved, true);
  assert.equal(manifest.summary.samplerOwnershipReviewReady, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("material sampler ownership gate flags incomplete static sampler sourceKeyHash identity table", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-hash-gap-"));
  const paths = fixturePaths(tempDir);
  writeJson(tempDir, "sampler-join.json", {
    summary: {
      materialSamplerRows: 20,
      externalTexturePathSamplerRows: 12,
      samplerSourceKeyHashRows: 19,
      inlineRuntimeSamplerRows: 6,
      runtimeSceneTextureSamplerRows: 2,
      classificationGapRows: 0,
      samplerResourceClassificationComplete: true,
    },
  });
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit(paths);

  assert.equal(manifest.summary.shadergraphSamplerResourceClassificationComplete, true);
  assert.equal(manifest.summary.shadergraphSamplerSourceKeyHashRows, 19);
  assert.equal(manifest.summary.shadergraphSamplerIdentityTableComplete, false);
  assert.equal(manifest.summary.samplerOwnershipReviewReady, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("material sampler ownership gate still blocks renderer promotion when source/program capture becomes reviewable", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-ready-"));
  const paths = fixturePaths(tempDir);
  writeJson(tempDir, "source-program-capture.json", {
    summary: {
      captureImported: true,
      readyForManualSourceProgramReview: true,
      readyForManualTextureSamplerReview: false,
      observedHookTargets: 10,
      targetRows: 10,
      targetEventRows: 10,
      targetEventRowsWithEventId: 10,
      targetEventRowsWithThreadId: 10,
      captureOrderingFieldsComplete: true,
      targetEventDuplicateEventIdRows: 0,
      targetEventNonMonotonicEventIdRows: 0,
      captureEventIdOrderingComplete: true,
      sourceProgramTableDecodedEntryRows: 4,
      sourceProgramType4EntryRows: 0,
      knownShadergraphTextureResourceRows: 2,
      knownShadergraphTextureResourceUnitRows: 2,
      knownShadergraphTextureResourceSamplerIdentityRows: 2,
      textureRegistrationResourceKeyRows: 1,
      textureRegistrationKnownShadergraphResourceKeyRows: 1,
      textureLookupResourceKeyRows: 2,
      textureLookupKnownShadergraphResourceKeyRows: 1,
      textureLookupUnknownShadergraphResourceKeyRows: 1,
      textureLookupRegisteredKnownShadergraphResourceKeyRows: 1,
      textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows: 1,
      textureRuntimeLookupEvents: 1,
      textureRuntimeLookupReturnRows: 1,
      type4TexturePatchEvents: 1,
      type4TexturePatchAfterDecodeEvents: 1,
      type4TexturePatchDecodedEntryRows: 2,
      type4TexturePatchDecodedType4EntryRows: 1,
      type4TexturePatchKnownReturnedObjectRows: 1,
      type4TexturePatchValueMatchesObjectRows: 1,
      type4TexturePatchSameObjectAndValueMatchRows: 1,
      type4TexturePatchSameThreadObjectRows: 1,
      type4TexturePatchOrderedSameThreadObjectRows: 1,
      type4TexturePatchSameSequenceObjectAndValueMatchRows: 1,
      type4TexturePatchSamplerUnitMatchesEntryRows: 1,
      type4TexturePatchValueAndSamplerUnitMatchRows: 1,
      type4TexturePatchSameSequenceObjectUnitAndValueRows: 1,
      type4TexturePatchSameSequenceKnownResourceObjectRows: 1,
      type4TexturePatchSameSequenceKnownResourceUnitAndValueRows: 1,
      type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows: 1,
      type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows: 1,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows: 1,
      type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows: 1,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows: 1,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows: 1,
      type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows: 1,
      sourceProgramMountedType4TableRows: 1,
      type4TexturePatchMountedTableRows: 1,
      type4TexturePatchOrderedMountedTableRows: 1,
      type4TexturePatchSameSequenceTableObjectRows: 1,
      type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows: 1,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows: 1,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows: 1,
      readyForManualTextureRuntimeReview: true,
      readyForManualTextureResourceKeyReview: true,
    },
  });
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit(paths);

  assert.equal(manifest.summary.sourceProgramCaptureReadyForManualReview, true);
  assert.equal(manifest.summary.sourceProgramCaptureReadyForTextureSamplerReview, false);
  assert.equal(manifest.summary.sourceProgramType4EntryRows, 0);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceRows, 2);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceUnitRows, 2);
  assert.equal(manifest.summary.sourceProgramKnownShadergraphTextureResourceSamplerIdentityRows, 2);
  assert.equal(manifest.summary.sourceProgramTextureRegistrationResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureRegistrationKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureLookupResourceKeyRows, 2);
  assert.equal(manifest.summary.sourceProgramTextureLookupKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureLookupUnknownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureLookupRegisteredKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.sourceProgramTextureRuntimeLookupEvents, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchDecodedType4EntryRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchValueAndSamplerUnitMatchRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceObjectRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceObjectRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows, 1);
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    1,
  );
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchMountedTableRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchOrderedMountedTableRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceTableObjectRows, 1);
  assert.equal(manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows, 1);
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    1,
  );
  assert.equal(
    manifest.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    1,
  );
  assert.equal(manifest.summary.sourceProgramTextureRuntimeReadyForReview, true);
  assert.equal(manifest.summary.sourceProgramTextureResourceKeyReadyForReview, true);
  assert.equal(manifest.summary.allMechanicalTexturePathsRecovered, true);
  assert.equal(manifest.summary.inlineMechanicalTexturePathRecovered, true);
  assert.equal(manifest.summary.samplerOwnershipReviewReady, false);
  assert.equal(manifest.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(manifest.summary.ordinaryMaterialSamplerOwnershipRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("material sampler ownership gate marks sampler ownership review ready from strict source/program capture without promoting rendering", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-review-ready-"));
  const paths = fixturePaths(tempDir);
  writeJson(tempDir, "source-program-capture.json", {
    summary: {
      captureImported: true,
      readyForManualSourceProgramReview: true,
      readyForManualTextureSamplerReview: true,
      observedHookTargets: 10,
      targetRows: 10,
      targetEventRows: 10,
      targetEventRowsWithEventId: 10,
      targetEventRowsWithThreadId: 10,
      captureOrderingFieldsComplete: true,
      targetEventDuplicateEventIdRows: 0,
      targetEventNonMonotonicEventIdRows: 0,
      captureEventIdOrderingComplete: true,
      captureLimitRows: 0,
      captureLimitDroppedEventRowsAtLeast: 0,
      captureEventLimitHit: false,
      resourceListTruncatedRows: 0,
      nestedResourceIdTruncatedRows: 0,
      resourceListCaptureComplete: true,
      sourceProgramTableDecodedEntryRows: 4,
      sourceProgramTableTruncatedRows: 0,
      sourceProgramTableMissingEntryRows: 0,
      sourceProgramTableCaptureComplete: true,
      sourceProgramType4EntryRows: 1,
      knownShadergraphTextureResourceRows: 2,
      knownShadergraphTextureResourceUnitRows: 2,
      knownShadergraphTextureResourceSamplerIdentityRows: 2,
      textureRegistrationResourceKeyRows: 1,
      textureRegistrationKnownShadergraphResourceKeyRows: 1,
      textureLookupResourceKeyRows: 1,
      textureLookupKnownShadergraphResourceKeyRows: 1,
      textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows: 1,
      type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows: 1,
      readyForManualTextureRuntimeReview: true,
      readyForManualTextureResourceKeyReview: true,
    },
  });
  const manifest = buildCurrentNativeMaterialSamplerOwnershipGateAudit(paths);

  assert.equal(manifest.summary.sourceProgramCaptureReadyForTextureSamplerReview, true);
  assert.equal(manifest.summary.sourceProgramSamplerIdentityReviewReady, true);
  assert.equal(manifest.summary.sourceProgramTargetEventRows, 10);
  assert.equal(manifest.summary.sourceProgramTargetEventRowsWithEventId, 10);
  assert.equal(manifest.summary.sourceProgramTargetEventRowsWithThreadId, 10);
  assert.equal(manifest.summary.sourceProgramCaptureOrderingFieldsComplete, true);
  assert.equal(manifest.summary.sourceProgramTargetEventDuplicateEventIdRows, 0);
  assert.equal(manifest.summary.sourceProgramTargetEventNonMonotonicEventIdRows, 0);
  assert.equal(manifest.summary.sourceProgramCaptureEventIdOrderingComplete, true);
  assert.equal(manifest.summary.sourceProgramCaptureEventLimitHit, false);
  assert.equal(manifest.summary.sourceProgramResourceListCaptureComplete, true);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, true);
  assert.equal(manifest.summary.samplerOwnershipReviewReady, true);
  assert.equal(manifest.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(manifest.summary.ordinaryMaterialSamplerOwnershipRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("exportCurrentNativeMaterialSamplerOwnershipGateAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-sampler-gate-out-"));
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  const summary = exportCurrentNativeMaterialSamplerOwnershipGateAudit({
    ...fixturePaths(tempDir),
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.externalMechanicalTexturePathRecovered, true);
  assert.equal(summary.inlineMechanicalTexturePathRecovered, true);
  assert.equal(summary.allMechanicalTexturePathsRecovered, true);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /layout-b-payload-source-program-bridge/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shaderdata-type4-entry-semantics/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shaderdata-inline-texture-runtime-binding/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /shadergraph-sampler-resource-classification/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /definition-shaderparams-payload-structure/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /material-texture-runtime-capture/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /texture-sampler-state-semantics/);
});
