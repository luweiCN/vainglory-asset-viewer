const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCurrentNativeLayoutBMaterialDrawBridgeAudit,
  exportCurrentNativeLayoutBMaterialDrawBridgeAudit,
} = require("../tools/current_native_layout_b_material_draw_bridge_audit");

const crossBuildDrawSource = `
void FUN_00f342f8(long param_1)
{
  uVar2 = *(uint *)(lVar9 + 0x220);
  if ((*(uint *)(lVar9 + 0x220) & 0xc00) == 0) {
    local_120 = DAT_03215478;
  }
  else {
    local_120 = *(undefined8 *)(param_1 + 0x20);
  }
  uVar3 = *(uint *)(lVar9 + 0x21c);
  if ((*(uint *)(lVar9 + 0x220) & 0x10000000) != 0) {
    glPolygonOffset(1.0,(float)uVar3);
  }
  if ((*(uint *)(lVar9 + 0x220) & 0x20000000) != 0) {
    glDisable(0xb71);
  }
  if (((*(uint *)(lVar9 + 0x220) >> 8) & 3) == 0) {
    FUN_00f01040(DAT_032142c8);
  }
  if (((*(uint *)(lVar9 + 0x220) >> 8) & 3) == 1) {
    FUN_00f01040(DAT_032142d0);
  }
  if (((*(uint *)(lVar9 + 0x220) >> 8) & 3) == 2) {
    FUN_00f01040(DAT_032142d8);
  }
  plVar11 = *(long **)(lVar9 + 0x208);
  puVar14 = *(undefined8 **)(*plVar11 + (ulong)DAT_032142c0 * 8 + 8);
  glUseProgram(**(undefined4 **)*puVar14);
  FUN_01996f20(puVar14[1],plVar11[1]);
  if ((0x183 >> (*(uint *)(lVar9 + 0x220) & 0xf) & 1) != 0) {
    glDrawArrays(4,iVar8,iVar7);
  }
  if ((0x70 >> (*(uint *)(lVar9 + 0x220) & 0xf) & 1) != 0) {
    glDrawArrays(5,iVar8,iVar7);
  }
  if ((*(uint *)(lVar9 + 0x220) & 0xf) == 2) {
    glDrawArrays(0,iVar8,iVar7);
  }
}

void FUN_00f34d70(long param_1)
{
  lVar9 = *(long *)(param_1 + 0x208);
  lVar7 = *(long *)(param_1 + 0x2a0);
  lVar8 = *(long *)(param_1 + 0x2b0);
  lVar6 = *(long *)(param_1 + 0x2b8);
  if (*(int *)(param_1 + 0x2a8) == 0) {
    FUN_0199712c(lVar7);
    FUN_019971b0(lVar7);
    FUN_01997200(lVar7);
    FUN_01997250(lVar7);
  }
  else {
    FUN_01995ebc(&local_50);
    FUN_01996184(&local_50,lVar6,lVar8);
    *(undefined8 *)(lVar9 + 8) = FUN_019962e8(&local_50);
    *(undefined8 *)(param_1 + 0x2a0) = *(undefined8 *)(lVar9 + 8);
  }
}
`;

const queueAudit = {
  summary: {
    sceneEntityRuntimeParamSourceTableProgramRecovered: true,
    sceneEntityRuntimeParamSortKeyFormulaRecovered: true,
    renderCommandQueueSortKeyRecovered: true,
  },
  instructionRows: [
    { role: "scene-entity-runtime-param-source-object-load", addressHex: "0x189f91c", evidence: "source object" },
    { role: "scene-entity-runtime-param-source-entry-load", addressHex: "0x189f930", evidence: "source entry" },
    { role: "scene-entity-runtime-param-sort-key-store", addressHex: "0x189f96c", evidence: "sort key" },
    { role: "scene-entity-runtime-param-gl-use-program-call", addressHex: "0x189f9e4", evidence: "glUseProgram" },
    { role: "scene-entity-runtime-param-program-param-apply-call", addressHex: "0x189fa00", evidence: "param apply" },
    { role: "render-command-queue-sort-key-load", addressHex: "0x18a16c0", evidence: "queue sort key" },
    { role: "render-command-queue-sort-call", addressHex: "0x18a1718", evidence: "queue sort" },
  ],
};

const finalPrimitiveConsumerAudit = {
  summary: {
    currentFinalPrimitiveConsumerRecovered: true,
    currentDrawStateRecovered: true,
    currentProgramBindingRecovered: true,
    currentDrawModeMappingRecovered: true,
    currentAttributeBindingRecovered: true,
    currentBufferLifecycleRecovered: true,
  },
};

const shaderParameterBridgeAudit = {
  summary: {
    opcodeRows: 64,
    layoutBToSharedParameterUploaderRecovered: true,
    parameterUploaderRecovered: true,
    shaderParamsToUploaderOverrideBridgeRecovered: true,
    shaderParamsNumericOverrideRecovered: true,
    shaderParamsOverrideProducesTextureObjectType4: false,
    textureObjectBindingRecovered: true,
    textureObjectRecordPointerRecovered: true,
    textureSamplerStateUpdateRecovered: true,
    sourceProgramTablePathRecovered: true,
    shaderTextureFormulaRecovered: false,
    textureSamplerFormulaRecovered: false,
  },
};

test("layout B material draw bridge audit links payload fields, cross-build draw semantics, and current queue binding", () => {
  const manifest = buildCurrentNativeLayoutBMaterialDrawBridgeAudit(
    { crossBuildDrawSource, queueAudit, finalPrimitiveConsumerAudit, shaderParameterBridgeAudit },
    "TEST_DATE",
  );

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.currentPayloadFieldRows, 18);
  assert.equal(manifest.summary.crossBuildDrawStateRows, 5);
  assert.equal(manifest.summary.crossBuildDynamicParameterRows, 9);
  assert.equal(manifest.summary.crossBuildDrawModeRows, 3);
  assert.equal(manifest.summary.currentQueueProgramRows, 5);
  assert.equal(manifest.summary.currentQueueSortRows, 2);
  assert.equal(manifest.summary.currentOpcodeMismatchRows, 0);
  assert.equal(manifest.summary.currentPayloadFieldsRecovered, true);
  assert.equal(manifest.summary.crossBuildDrawStateSemanticsRecovered, true);
  assert.equal(manifest.summary.crossBuildDynamicParameterSemanticsRecovered, true);
  assert.equal(manifest.summary.crossBuildDrawModeMappingRecovered, true);
  assert.equal(manifest.summary.currentQueueProgramBindingRecovered, true);
  assert.equal(manifest.summary.currentQueueSortRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveDrawStateRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveProgramBindingRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveDrawModeMappingRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveAttributeBindingRecovered, true);
  assert.equal(manifest.summary.currentFinalPrimitiveBufferLifecycleRecovered, true);
  assert.equal(manifest.summary.currentShaderParameterBridgeRows, 64);
  assert.equal(manifest.summary.currentLayoutBToSharedParameterUploaderRecovered, true);
  assert.equal(manifest.summary.currentParameterUploaderRecovered, true);
  assert.equal(manifest.summary.currentShaderParamsToUploaderOverrideBridgeRecovered, true);
  assert.equal(manifest.summary.currentShaderParamsNumericOverrideRecovered, true);
  assert.equal(manifest.summary.currentShaderParamsOverrideProducesTextureObjectType4, false);
  assert.equal(manifest.summary.currentTextureObjectBindingRecovered, true);
  assert.equal(manifest.summary.currentTextureObjectRecordPointerRecovered, true);
  assert.equal(manifest.summary.currentTextureSamplerStateUpdateRecovered, true);
  assert.equal(manifest.summary.currentSourceProgramTablePathRecovered, true);
  assert.equal(manifest.summary.shaderTextureFormulaRecovered, false);
  assert.equal(manifest.summary.textureSamplerFormulaRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);

  assert.ok(manifest.currentPayloadFieldRows.some((row) => row.role === "payload-node-beam-target-load"));
  assert.ok(manifest.crossBuildDrawStateRows.some((row) => row.role === "render-state-low-word-class-2"));
  assert.ok(manifest.crossBuildDynamicParameterRows.some((row) => row.role === "dynamic-parameter-payload-finalize"));
  assert.ok(manifest.crossBuildDrawModeRows.some((row) => row.role === "draw-mode-triangle-strip"));
  assert.ok(manifest.currentQueueProgramRows.some((row) => row.role === "scene-entity-runtime-param-gl-use-program-call"));
});

test("exportCurrentNativeLayoutBMaterialDrawBridgeAudit writes report, viewer summary, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-layout-b-material-draw-"));
  const viewerOut = path.join(tempDir, "viewer.json");
  const jsonOut = path.join(tempDir, "report.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const sourcePath = path.join(tempDir, "00f34.c");
  const queueAuditPath = path.join(tempDir, "queue-audit.json");
  const finalPrimitiveConsumerPath = path.join(tempDir, "final-primitive.json");
  const shaderParameterBridgePath = path.join(tempDir, "shader-parameter.json");

  fs.writeFileSync(sourcePath, crossBuildDrawSource);
  fs.writeFileSync(queueAuditPath, `${JSON.stringify(queueAudit, null, 2)}\n`);
  fs.writeFileSync(finalPrimitiveConsumerPath, `${JSON.stringify(finalPrimitiveConsumerAudit, null, 2)}\n`);
  fs.writeFileSync(shaderParameterBridgePath, `${JSON.stringify(shaderParameterBridgeAudit, null, 2)}\n`);

  const summary = exportCurrentNativeLayoutBMaterialDrawBridgeAudit({
    crossBuildDrawSourcePath: sourcePath,
    queueAuditPath,
    finalPrimitiveConsumerPath,
    shaderParameterBridgePath,
    viewerOut,
    jsonOut,
    tsvOut,
  });

  assert.equal(summary.currentPayloadFieldsRecovered, true);
  assert.equal(summary.crossBuildDrawStateSemanticsRecovered, true);
  assert.equal(summary.crossBuildDynamicParameterSemanticsRecovered, true);
  assert.equal(summary.currentQueueProgramBindingRecovered, true);
  assert.equal(summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(summary.currentParameterUploaderRecovered, true);
  assert.equal(summary.currentTextureObjectBindingRecovered, true);
  assert.equal(summary.shaderTextureFormulaRecovered, false);
  assert.equal(summary.textureSamplerFormulaRecovered, false);
  assert.equal(summary.renderPromotionAllowedRows, 0);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /material draw bridge/i);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /0xe39c90/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /dynamic-parameter-payload-finalize/);
});
