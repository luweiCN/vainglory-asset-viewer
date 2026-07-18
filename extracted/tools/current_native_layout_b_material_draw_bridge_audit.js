#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64 } = require("./current_native_anchor_audit");

const defaultBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultCrossBuildDrawSourcePath =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f34.c";
const defaultQueueAuditPath = "extracted/reports/current_native_position_sampler_owner_audit.json";
const defaultFinalPrimitiveConsumerPath = "extracted/viewer/current-native-layout-b-final-primitive-consumer-audit.json";
const defaultShaderParameterBridgePath = "extracted/viewer/current-native-layout-b-shader-parameter-bridge-audit.json";
const defaultViewerOut = "extracted/viewer/current-native-layout-b-material-draw-bridge-audit.json";
const defaultJsonOut = "extracted/reports/current_native_layout_b_material_draw_bridge_audit.json";
const defaultTsvOut = "extracted/reports/current_native_layout_b_material_draw_bridge_audit.tsv";

const currentPayloadFieldSpecs = [
  [0xe39d2c, "payload-node-prescan-flags-load", "b942212a", "0xe39c90 pre-scan reads payload node +0x220 before filtering draw batches."],
  [0xe39d30, "payload-node-prescan-transform-mask", "1216054a", "0xe39c90 masks +0x220 with 0xc00 for transform/render path filtering."],
  [0xe39d34, "payload-node-prescan-transform-compare", "7110015f", "0xe39c90 compares the masked +0x220 path against 0x400."],
  [0xe39d5c, "payload-state-velocity-array-base", "91406268", "0xe39c90 derives particle velocity array base at state +0x18000."],
  [0xe39d60, "payload-state-size-array-base", "9140c277", "0xe39c90 derives particle size array base at state +0x30000."],
  [0xe39d64, "payload-state-rotation-array-base", "91410278", "0xe39c90 derives particle rotation array base at state +0x40000."],
  [0xe39d68, "payload-state-color-array-base", "91416279", "0xe39c90 derives particle color array base at state +0x58000."],
  [0xe39d80, "payload-node-primitive-count-load", "b9420281", "0xe39c90 reads payload node +0x200 as active primitive count."],
  [0xe39d88, "payload-node-flags-load", "b9422288", "0xe39c90 reads payload node +0x220 as mode/flags."],
  [0xe39da8, "payload-node-extra-transform-address", "91085289", "0xe39c90 addresses payload node +0x214 for nested mode transform data."],
  [0xe39dac, "payload-node-extra-transform-load", "f940012c", "0xe39c90 loads payload node +0x214 transform/source qword."],
  [0xe39db0, "payload-node-transform-mask", "1216050b", "0xe39c90 masks +0x220 with 0xc00 after loading +0x214."],
  [0xe39dbc, "payload-node-nested-mode-extract", "53041d0d", "0xe39c90 extracts +0x220 bits 4..7 for nested primitive mode."],
  [0xe39e18, "payload-node-beam-target-load", "9108928a", "0xe39c90 addresses payload node +0x224 beam/target vector."],
  [0xe39e30, "payload-node-beam-target-width-load", "b9422e89", "0xe39c90 loads payload node +0x22c scalar width/beam parameter."],
  [0xe39e3c, "payload-node-beam-source-tangent-address", "9108f28a", "0xe39c90 addresses payload node +0x23c beam source tangent."],
  [0xe39e4c, "payload-node-beam-target-tangent-load", "f9411a89", "0xe39c90 loads payload node +0x230 beam target tangent."],
  [0xe39e54, "payload-node-beam-source-width-load", "b9424689", "0xe39c90 loads payload node +0x244 scalar width/beam parameter."],
].map(([address, role, expectedOpcodeHex, evidence]) => ({ address, role, expectedOpcodeHex, evidence }));

const crossBuildDrawStateSpecs = [
  {
    role: "render-state-low-word-class-0",
    patterns: [/FUN_00f01040\(DAT_032142c8\)|DAT_032142c8[\s\S]{0,360}FUN_00f01040/, /\+ 0x220\).{0,16}>> 8\)?\s*& 3/],
    evidence: "Old Android draw path maps (+0x220 >> 8) & 3 == 0 to DAT_032142c8 through FUN_00f01040.",
  },
  {
    role: "render-state-low-word-class-1",
    patterns: [/FUN_00f01040\(DAT_032142d0\)|DAT_032142d0[\s\S]{0,260}FUN_00f01040/, /\+ 0x220\).{0,16}>> 8\)?\s*& 3/],
    evidence: "Old Android draw path maps (+0x220 >> 8) & 3 == 1 to DAT_032142d0 through FUN_00f01040.",
  },
  {
    role: "render-state-low-word-class-2",
    patterns: [/FUN_00f01040\(DAT_032142d8\)|DAT_032142d8[\s\S]{0,220}FUN_00f01040/, /\+ 0x220\).{0,16}>> 8\)?\s*& 3/],
    evidence: "Old Android draw path maps (+0x220 >> 8) & 3 == 2 to DAT_032142d8 through FUN_00f01040.",
  },
  {
    role: "polygon-offset-from-node-21c",
    patterns: [/glPolygonOffset\(/, /\+ 0x21c/, /0x10000000/],
    evidence: "Old Android draw path uses node +0x21c and +0x220 bit 0x10000000 to control polygon offset.",
  },
  {
    role: "depth-test-suppression-bit",
    patterns: [/glDisable\(0xb71\)/, /\+ 0x220/, /0x1d|0x20000000/],
    evidence: "Old Android draw path can suppress depth test from a high +0x220 bit.",
  },
];

const crossBuildDynamicParameterSpecs = [
  {
    role: "material-source-object-field-208",
    patterns: [/\+ 0x208/, /plVar11 = \*\(long \*\*\)\(lVar9 \+ 0x208\)|lVar9 = \*\(long \*\)\(param_1 \+ 0x208\)/],
    evidence: "Old Android path treats payload node +0x208 as the material/source program table object.",
  },
  {
    role: "dynamic-parameter-payload-field-2a0",
    patterns: [/\+ 0x2a0/, /FUN_0199712c|FUN_019962e8/],
    evidence: "Old Android dynamic parameter update stores the generated runtime payload at node +0x2a0.",
  },
  {
    role: "dynamic-parameter-dirty-field-2a8",
    patterns: [/\+ 0x2a8/, /'\0'|= 0/],
    evidence: "Old Android dynamic parameter update uses node +0x2a8 as a dirty/rebuild flag.",
  },
  {
    role: "dynamic-parameter-count-field-2b0",
    patterns: [/\+ 0x2b0/, /uVar2|lVar8/],
    evidence: "Old Android dynamic parameter update reads node +0x2b0 as the dynamic parameter count/vector header.",
  },
  {
    role: "dynamic-parameter-list-field-2b8",
    patterns: [/\+ 0x2b8/, /uVar8 \* 8|lVar6/],
    evidence: "Old Android dynamic parameter update reads node +0x2b8 as the dynamic parameter entry list.",
  },
  {
    role: "dynamic-parameter-payload-reuse",
    patterns: [/FUN_0199712c/, /FUN_019971b0/, /FUN_01997200/, /FUN_01997250/],
    evidence: "Old Android dynamic parameter update reuses the existing +0x2a0 payload when the dirty flag is clear.",
  },
  {
    role: "dynamic-parameter-builder-init",
    patterns: [/FUN_01995ebc/],
    evidence: "Old Android dynamic parameter update initializes a parameter payload builder before rebuilding.",
  },
  {
    role: "dynamic-parameter-entry-append",
    patterns: [/FUN_01996184/],
    evidence: "Old Android dynamic parameter update appends each dynamic entry into the payload builder.",
  },
  {
    role: "dynamic-parameter-payload-finalize",
    patterns: [/FUN_019962e8/],
    evidence: "Old Android dynamic parameter update finalizes the payload and assigns it to the source object +8 and node +0x2a0.",
  },
];

const crossBuildDrawModeSpecs = [
  {
    role: "draw-mode-triangles",
    patterns: [/0x183U?|0x183/, /glDrawArrays\([^,\n]*4|uVar1 = 4/],
    evidence: "Old Android draw path maps primitive low-nibble mask 0x183 to GL_TRIANGLES (4).",
  },
  {
    role: "draw-mode-triangle-strip",
    patterns: [/0x70U?|0x70/, /glDrawArrays\([^,\n]*5|uVar1 = 5/],
    evidence: "Old Android draw path maps primitive low-nibble mask 0x70 to GL_TRIANGLE_STRIP (5).",
  },
  {
    role: "draw-mode-points",
    patterns: [/uVar4 != 2|\& 0xf\) == 2/, /glDrawArrays\([^,\n]*0|uVar1 = 0/],
    evidence: "Old Android draw path maps primitive low-nibble mode 2 to GL_POINTS (0).",
  },
];

const currentQueueProgramRoleGroups = [
  {
    canonical: "source-table-load",
    aliases: ["scene-entity-runtime-param-source-table-load", "scene-entity-runtime-param-source-object-load"],
  },
  {
    canonical: "sort-key-store",
    aliases: ["scene-entity-runtime-param-sort-key-store"],
  },
  {
    canonical: "source-entry-load",
    aliases: ["scene-entity-runtime-param-sort-key-source-entry-load", "scene-entity-runtime-param-source-entry-load"],
  },
  {
    canonical: "gl-use-program",
    aliases: ["scene-entity-runtime-param-gl-use-program-call"],
  },
  {
    canonical: "program-param-apply",
    aliases: ["scene-entity-runtime-param-program-param-apply-call"],
  },
];

const currentQueueSortRoles = new Set([
  "render-command-queue-sort-key-load",
  "render-command-queue-sort-call",
]);

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

function opcodeRowsForSpecs(buffer, elf, specs) {
  return specs.map((spec) => {
    const fileOffset = fileOffsetForVirtualAddress(elf, spec.address, 4);
    const actualOpcodeHex = fileOffset >= 0 ? buffer.readUInt32LE(fileOffset).toString(16).padStart(8, "0") : "";
    return {
      stage: "current-payload-field",
      role: spec.role,
      source: "current-android-arm64",
      address: spec.address,
      addressHex: hex(spec.address),
      expectedOpcodeHex: spec.expectedOpcodeHex,
      actualOpcodeHex,
      opcodeMatches: actualOpcodeHex === spec.expectedOpcodeHex,
      evidence: spec.evidence,
      renderPromotionAllowed: false,
    };
  });
}

function firstEvidenceLine(lines, patterns) {
  for (const pattern of patterns || []) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return { lineNumber: index + 1, sourceLine: lines[index].trim() };
  }
  return null;
}

function hasAllEvidence(sourceText, patterns) {
  return (patterns || []).every((pattern) => pattern.test(sourceText));
}

function sourceRowsForSpecs(stage, specs, sourceText) {
  const lines = String(sourceText || "").split(/\r?\n/);
  return specs
    .filter((spec) => hasAllEvidence(sourceText, spec.patterns))
    .map((spec) => {
      const evidenceLine = firstEvidenceLine(lines, spec.patterns);
      return {
        stage,
        role: spec.role,
        source: "cross-build-android-ghidra",
        addressHex: "",
        expectedOpcodeHex: "",
        actualOpcodeHex: "",
        opcodeMatches: "",
        lineNumber: evidenceLine?.lineNumber || "",
        sourceLine: evidenceLine?.sourceLine || "",
        evidence: spec.evidence,
        renderPromotionAllowed: false,
      };
    });
}

function queueRowsForRoles(stage, queueAudit, roles) {
  const rows = Array.isArray(queueAudit?.instructionEvidence)
    ? queueAudit.instructionEvidence
    : Array.isArray(queueAudit?.instructionRows)
      ? queueAudit.instructionRows
      : [];
  return rows
    .filter((row) => roles.has(row.role))
    .map((row) => ({
      stage,
      role: row.role,
      source: "current-queue-audit",
      addressHex: row.addressHex || row.virtualAddressHex || "",
      expectedOpcodeHex: row.expectedOpcodeHex || "",
      actualOpcodeHex: row.actualOpcodeHex || row.instructionHex || "",
      opcodeMatches: row.opcodeMatches ?? "",
      lineNumber: "",
      sourceLine: "",
      evidence: row.evidence || "",
      renderPromotionAllowed: false,
    }));
}

function queueRowsForRoleGroups(stage, queueAudit, roleGroups) {
  const rows = Array.isArray(queueAudit?.instructionEvidence)
    ? queueAudit.instructionEvidence
    : Array.isArray(queueAudit?.instructionRows)
      ? queueAudit.instructionRows
      : [];
  const result = [];
  for (const group of roleGroups) {
    const row = rows.find((candidate) => group.aliases.includes(candidate.role));
    if (!row) continue;
    result.push({
      stage,
      role: row.role,
      canonicalRole: group.canonical,
      source: "current-queue-audit",
      addressHex: row.addressHex || row.virtualAddressHex || "",
      expectedOpcodeHex: row.expectedOpcodeHex || "",
      actualOpcodeHex: row.actualOpcodeHex || row.instructionHex || "",
      opcodeMatches: row.opcodeMatches ?? "",
      lineNumber: "",
      sourceLine: "",
      evidence: row.evidence || "",
      renderPromotionAllowed: false,
    });
  }
  return result;
}

function readQueueAudit(queueAudit, queueAuditPath) {
  if (queueAudit) return queueAudit;
  return JSON.parse(fs.readFileSync(queueAuditPath, "utf8"));
}

function readFinalPrimitiveConsumerAudit(finalPrimitiveConsumerAudit, finalPrimitiveConsumerPath) {
  if (finalPrimitiveConsumerAudit) return finalPrimitiveConsumerAudit;
  return JSON.parse(fs.readFileSync(finalPrimitiveConsumerPath, "utf8"));
}

function readShaderParameterBridgeAudit(shaderParameterBridgeAudit, shaderParameterBridgePath) {
  if (shaderParameterBridgeAudit) return shaderParameterBridgeAudit;
  return JSON.parse(fs.readFileSync(shaderParameterBridgePath, "utf8"));
}

function readCrossBuildSource(crossBuildDrawSource, crossBuildDrawSourcePath) {
  if (crossBuildDrawSource != null) return String(crossBuildDrawSource);
  return fs.readFileSync(crossBuildDrawSourcePath, "utf8");
}

function countRows(rows, predicate) {
  return rows.filter(predicate).length;
}

function buildCurrentNativeLayoutBMaterialDrawBridgeAudit(
  {
    binaryPath = defaultBinary,
    crossBuildDrawSource,
    crossBuildDrawSourcePath = defaultCrossBuildDrawSourcePath,
    queueAudit,
    queueAuditPath = defaultQueueAuditPath,
    finalPrimitiveConsumerAudit,
    finalPrimitiveConsumerPath = defaultFinalPrimitiveConsumerPath,
    shaderParameterBridgeAudit,
    shaderParameterBridgePath = defaultShaderParameterBridgePath,
  } = {},
  generatedAt = new Date().toISOString(),
) {
  const buffer = fs.readFileSync(binaryPath);
  const elf = parseElf64(buffer);
  const sourceText = readCrossBuildSource(crossBuildDrawSource, crossBuildDrawSourcePath);
  const queueManifest = readQueueAudit(queueAudit, queueAuditPath);
  const finalPrimitiveManifest = readFinalPrimitiveConsumerAudit(finalPrimitiveConsumerAudit, finalPrimitiveConsumerPath);
  const shaderParameterManifest = readShaderParameterBridgeAudit(shaderParameterBridgeAudit, shaderParameterBridgePath);

  const currentPayloadFieldRows = opcodeRowsForSpecs(buffer, elf, currentPayloadFieldSpecs);
  const crossBuildDrawStateRows = sourceRowsForSpecs("cross-build-draw-state", crossBuildDrawStateSpecs, sourceText);
  const crossBuildDynamicParameterRows = sourceRowsForSpecs(
    "cross-build-dynamic-parameter",
    crossBuildDynamicParameterSpecs,
    sourceText,
  );
  const crossBuildDrawModeRows = sourceRowsForSpecs("cross-build-draw-mode", crossBuildDrawModeSpecs, sourceText);
  const currentQueueProgramRows = queueRowsForRoleGroups(
    "current-queue-program-binding",
    queueManifest,
    currentQueueProgramRoleGroups,
  );
  const currentQueueSortRows = queueRowsForRoles("current-queue-sort", queueManifest, currentQueueSortRoles);

  const allRows = [
    ...currentPayloadFieldRows,
    ...crossBuildDrawStateRows,
    ...crossBuildDynamicParameterRows,
    ...crossBuildDrawModeRows,
    ...currentQueueProgramRows,
    ...currentQueueSortRows,
  ];
  const currentOpcodeMismatchRows = countRows(currentPayloadFieldRows, (row) => !row.opcodeMatches);
  const currentPayloadFieldsRecovered = currentPayloadFieldRows.length === currentPayloadFieldSpecs.length && currentOpcodeMismatchRows === 0;
  const queueSummary = queueManifest.summary || {};
  const finalPrimitiveSummary = finalPrimitiveManifest.summary || {};
  const shaderParameterSummary = shaderParameterManifest.summary || {};
  const currentFinalPrimitiveConsumerRecovered = Boolean(finalPrimitiveSummary.currentFinalPrimitiveConsumerRecovered);

  return {
    generatedAt,
    binaryPath,
    crossBuildDrawSourcePath,
    queueAuditPath,
    finalPrimitiveConsumerPath,
    shaderParameterBridgePath,
    policy:
      "diagnostic-only material draw bridge audit; combines current opcode evidence, cross-build Android draw semantics, current queue program/sort evidence, final primitive consumer evidence, and shader parameter bridge evidence without enabling shader or texture takeover",
    summary: {
      currentPayloadFieldRows: currentPayloadFieldRows.length,
      crossBuildDrawStateRows: crossBuildDrawStateRows.length,
      crossBuildDynamicParameterRows: crossBuildDynamicParameterRows.length,
      crossBuildDrawModeRows: crossBuildDrawModeRows.length,
      currentQueueProgramRows: currentQueueProgramRows.length,
      currentQueueSortRows: currentQueueSortRows.length,
      currentOpcodeMismatchRows,
      currentPayloadFieldsRecovered,
      crossBuildDrawStateSemanticsRecovered: crossBuildDrawStateRows.length === crossBuildDrawStateSpecs.length,
      crossBuildDynamicParameterSemanticsRecovered:
        crossBuildDynamicParameterRows.length === crossBuildDynamicParameterSpecs.length,
      crossBuildDrawModeMappingRecovered: crossBuildDrawModeRows.length === crossBuildDrawModeSpecs.length,
      currentQueueProgramBindingRecovered:
        currentQueueProgramRows.length >= currentQueueProgramRoleGroups.length &&
        queueSummary.sceneEntityRuntimeParamSourceTableProgramRecovered !== false,
      currentQueueSortRecovered:
        currentQueueSortRows.length >= currentQueueSortRoles.size && queueSummary.renderCommandQueueSortKeyRecovered !== false,
      currentFinalPrimitiveConsumerRecovered,
      currentFinalPrimitiveDrawStateRecovered: Boolean(finalPrimitiveSummary.currentDrawStateRecovered),
      currentFinalPrimitiveProgramBindingRecovered: Boolean(finalPrimitiveSummary.currentProgramBindingRecovered),
      currentFinalPrimitiveDrawModeMappingRecovered: Boolean(finalPrimitiveSummary.currentDrawModeMappingRecovered),
      currentFinalPrimitiveAttributeBindingRecovered: Boolean(finalPrimitiveSummary.currentAttributeBindingRecovered),
      currentFinalPrimitiveBufferLifecycleRecovered: Boolean(finalPrimitiveSummary.currentBufferLifecycleRecovered),
      currentShaderParameterBridgeRows: shaderParameterSummary.opcodeRows || 0,
      currentLayoutBToSharedParameterUploaderRecovered: Boolean(
        shaderParameterSummary.layoutBToSharedParameterUploaderRecovered,
      ),
      currentParameterUploaderRecovered: Boolean(shaderParameterSummary.parameterUploaderRecovered),
      currentShaderParamsToUploaderOverrideBridgeRecovered: Boolean(
        shaderParameterSummary.shaderParamsToUploaderOverrideBridgeRecovered,
      ),
      currentShaderParamsNumericOverrideRecovered: Boolean(shaderParameterSummary.shaderParamsNumericOverrideRecovered),
      currentShaderParamsOverrideProducesTextureObjectType4:
        shaderParameterSummary.shaderParamsOverrideProducesTextureObjectType4,
      currentTextureObjectBindingRecovered: Boolean(shaderParameterSummary.textureObjectBindingRecovered),
      currentTextureObjectRecordPointerRecovered: Boolean(shaderParameterSummary.textureObjectRecordPointerRecovered),
      currentTextureSamplerStateUpdateRecovered: Boolean(shaderParameterSummary.textureSamplerStateUpdateRecovered),
      currentSourceProgramTablePathRecovered: Boolean(shaderParameterSummary.sourceProgramTablePathRecovered),
      shaderTextureFormulaRecovered: Boolean(shaderParameterSummary.shaderTextureFormulaRecovered),
      textureSamplerFormulaRecovered: Boolean(shaderParameterSummary.textureSamplerFormulaRecovered),
      renderPromotionAllowedRows: countRows(allRows, (row) => row.renderPromotionAllowed),
    },
    interpretation: {
      currentPayload:
        "The current binary confirms layout B particle payload fields used by 0xe39c90: mode flags, transform bits, beam vectors, and particle state arrays.",
      crossBuildDraw:
        "The old Android draw function shows how a comparable payload was rendered: +0x208 source object, +0x220 state/mode bits, dynamic parameter payload, glUseProgram, parameter apply, and glDrawArrays mode mapping.",
      currentQueue:
        "The current queue audit already proves source-table program binding, runtime parameter apply, sort key construction, and command queue sorting in the current binary.",
      finalPrimitive:
        "The final primitive consumer audit proves the current command vtable path through 0xe3ce74, including draw state, program binding, draw mode, attribute binding, buffer lifecycle, and glDrawArrays.",
      shaderParameter:
        "The shader parameter bridge proves the final consumer reaches the shared parameter uploader, ShaderParams numeric overrides merge into base uniform locations, type-4 texture objects bind through their upload/apply method, and sampler state update helpers are called.",
      boundary:
        "The final primitive consumer and parameter binding mechanics are now recovered, but shader texture, concrete sampler ownership, atlas, UV, alpha/depth, and emissive formulas below the shared parameter/state helpers remain unrecovered, so viewer rendering must remain on the conservative path.",
    },
    unresolved: [
      "exact current source object field mapping for texture, atlas frame, UV scroll, blend, depth, and emissive parameters",
      "which current draw-command class receives the particle builder output and how it selects program source entries",
      "shader texture formula and concrete sampler ownership required for real runtime material takeover",
    ],
    currentPayloadFieldRows,
    crossBuildDrawStateRows,
    crossBuildDynamicParameterRows,
    crossBuildDrawModeRows,
    currentQueueProgramRows,
    currentQueueSortRows,
  };
}

function exportCurrentNativeLayoutBMaterialDrawBridgeAudit({
  binaryPath = defaultBinary,
  crossBuildDrawSourcePath = defaultCrossBuildDrawSourcePath,
  queueAuditPath = defaultQueueAuditPath,
  finalPrimitiveConsumerPath = defaultFinalPrimitiveConsumerPath,
  shaderParameterBridgePath = defaultShaderParameterBridgePath,
  viewerOut = defaultViewerOut,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
} = {}) {
  const manifest = buildCurrentNativeLayoutBMaterialDrawBridgeAudit({
    binaryPath,
    crossBuildDrawSourcePath,
    queueAuditPath,
    finalPrimitiveConsumerPath,
    shaderParameterBridgePath,
  });
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(
    tsvOut,
    [
      ...manifest.currentPayloadFieldRows,
      ...manifest.crossBuildDrawStateRows,
      ...manifest.crossBuildDynamicParameterRows,
      ...manifest.crossBuildDrawModeRows,
      ...manifest.currentQueueProgramRows,
      ...manifest.currentQueueSortRows,
    ],
    [
      "stage",
      "role",
      "source",
      "addressHex",
      "expectedOpcodeHex",
      "actualOpcodeHex",
      "opcodeMatches",
      "lineNumber",
      "sourceLine",
      "evidence",
      "renderPromotionAllowed",
    ],
  );
  return manifest.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportCurrentNativeLayoutBMaterialDrawBridgeAudit({
    binaryPath: optionValue(args, "--binary", defaultBinary),
    crossBuildDrawSourcePath: optionValue(args, "--cross-build-source", defaultCrossBuildDrawSourcePath),
    queueAuditPath: optionValue(args, "--queue-audit", defaultQueueAuditPath),
    finalPrimitiveConsumerPath: optionValue(args, "--final-primitive-consumer", defaultFinalPrimitiveConsumerPath),
    shaderParameterBridgePath: optionValue(args, "--shader-parameter-bridge", defaultShaderParameterBridgePath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildCurrentNativeLayoutBMaterialDrawBridgeAudit,
  exportCurrentNativeLayoutBMaterialDrawBridgeAudit,
};
