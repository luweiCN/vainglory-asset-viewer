#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const {
  buildPointerSlotTargets,
  buildStringTargets,
  parseElf64,
  scanTextReferences,
} = require("./current_native_anchor_audit");
const { findDirectBranchCallers } = require("./current_native_light_probe_chain_audit");

const defaultManifestPath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultCurrentAndroidBinary = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultJsonOut = "extracted/reports/material_render_state_audit.json";
const defaultTsvOut = "extracted/reports/material_render_state_audit.tsv";
const defaultViewerOut = "extracted/viewer/material-render-state-audit.json";
const defaultRenderOwnerAuditPath = "extracted/viewer/current-native-position-sampler-owner-audit.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readManifest(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? { items: json, summary: null } : json;
}

function splitPipe(value) {
  return String(value || "").split("|").filter(Boolean);
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function countValue(counts, value) {
  if (!value) return;
  counts[value] = (counts[value] || 0) + 1;
}

function countField(rows, fieldName) {
  const counts = {};
  for (const row of rows || []) {
    for (const value of splitPipe(row[fieldName])) countValue(counts, value);
  }
  return sortObject(counts);
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
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

function decodedStates(row) {
  const renderState = parseJsonField(row.shaderPassRenderState, null);
  return Array.isArray(renderState?.states) ? renderState.states : [];
}

function uniqueJoined(values) {
  return [...new Set((values || []).filter((value) => value !== "" && value != null).map(String))].sort().join("|");
}

function colorMaskSignature(state) {
  const mask = state?.colorMask;
  if (!mask) return "";
  return `rgba:${mask.r ? 1 : 0}${mask.g ? 1 : 0}${mask.b ? 1 : 0}${mask.a ? 1 : 0}`;
}

function stateEvidenceStatus(row, states) {
  if (!row.shaderPassStateSignatures) return "missing-pass-state";
  if (!states.length) return "raw-pass-state-only";
  if (splitPipe(row.shaderPassStateWord2s).length || splitPipe(row.shaderPassStateWord3s).length) {
    return "word0-decoded-word2-raw-word3-counts-diagnostic";
  }
  return "word0-decoded";
}

function renderOrderEvidenceStatus(row) {
  if (!row.shaderPassStateSignatures) return "missing-pass-state";
  const hasWord2 = splitPipe(row.shaderPassStateWord2s).length > 0;
  const hasWord3 = splitPipe(row.shaderPassStateWord3s).length > 0;
  if (hasWord2 && hasWord3) {
    return "static-word2-not-proven-render-order-word3-parser-counts";
  }
  if (hasWord2) return "static-word2-not-proven-render-order";
  if (hasWord3) return "word3-parser-counts-only";
  return "no-pass-order-word";
}

function word2EvidenceStatus(row) {
  if (!row.shaderPassStateSignatures) return "missing-pass-state";
  if (!splitPipe(row.shaderPassStateWord2s).length) return "missing-tch0-word2";
  return "static-tch0-word2-no-draw-sort-consumer-in-pass-chain";
}

function viewerRuntimeConsumers(row) {
  const consumers = [];
  const roles = new Set(splitPipe(row.roleNames));
  if (row.alphaExecutionMode === "runtime" && (roles.has("alphaMask") || roles.has("alphaBlend"))) {
    consumers.push("alpha-runtime");
  }
  if (row.colorExecutionMode === "runtime") {
    consumers.push(`color-runtime:${row.colorMode || row.nativeShaderMode || "generic"}`);
  }
  return consumers;
}

function auditRow(row) {
  const states = decodedStates(row);
  const cullModes = uniqueJoined(states.map((state) => state.cullModeIndex));
  const colorMasks = uniqueJoined(states.map(colorMaskSignature));
  const blendFactors = uniqueJoined(
    states.map((state) =>
      [
        state.srcRgbFactorIndex,
        state.dstRgbFactorIndex,
        state.srcAlphaFactorIndex,
        state.dstAlphaFactorIndex,
      ].join(","),
    ),
  );
  const rgbBlendOps = uniqueJoined(states.map((state) => state.rgbBlendOpIndex));
  const alphaBlendOps = uniqueJoined(states.map((state) => state.alphaBlendOpIndex));
  const evidenceStatus = stateEvidenceStatus(row, states);
  const orderStatus = renderOrderEvidenceStatus(row);
  const consumers = viewerRuntimeConsumers(row);
  return {
    rel: row.rel || "",
    modelLabel: row.modelLabel || "",
    character: row.character || "",
    materialIndex: row.materialIndex || "",
    materialName: row.materialName || "",
    shadergraphRel: row.shadergraphRel || "",
    shaderPassStateFamily: row.shaderPassStateFamily || "",
    shaderPassStateSignatures: row.shaderPassStateSignatures || "",
    shaderPassStateWord0s: row.shaderPassStateWord0s || "",
    shaderPassStateWord1s: row.shaderPassStateWord1s || "",
    shaderPassStateWord2s: row.shaderPassStateWord2s || "",
    shaderPassStateWord3s: row.shaderPassStateWord3s || "",
    decodedWord0States: states.length,
    stateEvidenceStatus: evidenceStatus,
    renderOrderEvidenceStatus: orderStatus,
    word2EvidenceStatus: word2EvidenceStatus(row),
    viewerRuntimeConsumers: consumers.join("|") || "none",
    newRendererTakeoverFromThisAudit: "none-diagnostic-only",
    blendEnabled: row.shaderPassBlendEnabled || "",
    blendPreset: row.shaderPassBlendPreset || "",
    depthWrite: row.shaderPassDepthWrite || "",
    depthTest: row.shaderPassDepthTest || "",
    cullModeIndexes: cullModes,
    colorMasks,
    blendFactors,
    rgbBlendOps,
    alphaBlendOps,
    roleNames: row.roleNames || "",
    colorMode: row.colorMode || "",
    nativeShaderMode: row.nativeShaderMode || "",
    nativeShaderBlocker: row.nativeShaderBlocker || "",
    alphaRuntimeStage: row.alphaRuntimeStage || "",
    alphaExecutionMode: row.alphaExecutionMode || "",
    colorExecutionMode: row.colorExecutionMode || "",
    reflectionExecutionMode: row.reflectionExecutionMode || "",
    uvAnimationExecutionMode: row.uvAnimationExecutionMode || "",
  };
}

function topTransparentModels(rows) {
  const byRel = new Map();
  for (const row of rows) {
    if (row.blendEnabled !== "yes") continue;
    const entry = byRel.get(row.rel) || { rel: row.rel, modelLabel: row.modelLabel, transparentPassRows: 0 };
    entry.transparentPassRows += 1;
    byRel.set(row.rel, entry);
  }
  return [...byRel.values()]
    .sort((left, right) => right.transparentPassRows - left.transparentPassRows || left.rel.localeCompare(right.rel))
    .slice(0, 30);
}

function nativeWord0RenderStateEvidence() {
  return {
    status: "proven-native-render-state-consumer",
    scope: "TCH0 pass-state word0 only",
    android: [
      {
        function: "FUN_00f01040",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f01.c",
        line: 74,
        consumes: "low 32-bit render-state word",
        fields: [
          "cull mode bits 0..1",
          "color mask bits 2..5",
          "depth write bit 6",
          "depth func bits 7..9",
          "blend factors bits 16..31",
        ],
      },
    ],
    ios: [
      {
        function: "FUN_1010b5ecc",
        file: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1010b.c",
        consumes: "depth compare/write fields from the same low word",
      },
      {
        function: "FUN_1010b64ac",
        file: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/1010b.c",
        consumes: "Metal color attachment blend/write-mask fields from the same low word",
      },
    ],
    negativeEvidence: "Known GL/Metal state consumers do not read static TCH0 word1/word2/word3 as render-state fields.",
  };
}

function nativeRuntimeMaterialCommandEvidence() {
  return {
    status: "separate-runtime-command-chain-diagnostic-only",
    scope: "runtime material context command, not static TCH0 pass-state",
    decoder: {
      function: "FUN_0092b...",
      caseId: "0x3ee",
      file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0092b.c",
      line: 789,
      behavior: "copies 0xd8 command bytes into local_a60, endian-swaps many fields, then calls FUN_009298c8",
    },
    materialUpdater: {
      function: "FUN_009298c8",
      file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00929.c",
      line: 490,
      reads: [
        "material id at command +0xa0",
        "material flags at command +0xcc..+0xd7",
        "runtime scalar/color slots at command +0xac..+0xc8",
      ],
    },
    runtimeContextSubmit: {
      function: "FUN_00cebcf8",
      file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00ceb.c",
      line: 908,
      behavior: "copies the command material descriptor into 16 runtime material-context slots at DAT_0314f350",
    },
    boundary:
      "This proves a runtime material-command path exists, but it does not prove static shadergraph TCH0 word1/word2/word3 semantics. Keep it out of renderer takeover until the upstream bridge is recovered.",
  };
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function fileOffsetForVirtualAddress(elf, virtualAddress, size = 4) {
  const load = (elf.loads || []).find(
    (item) =>
      virtualAddress >= item.virtualAddress &&
      virtualAddress + size <= item.virtualAddress + Math.min(item.fileSize, item.memorySize),
  );
  if (!load) return null;
  return load.fileOffset + (virtualAddress - load.virtualAddress);
}

function parseLoadStoreUnsignedImmediate(instruction) {
  const forms = [
    { mask: 0xffc00000, value: 0xf9400000, kind: "ldr", width: 8, label: "x64" },
    { mask: 0xffc00000, value: 0xf9000000, kind: "str", width: 8, label: "x64" },
    { mask: 0xffc00000, value: 0xb9400000, kind: "ldr", width: 4, label: "w32" },
    { mask: 0xffc00000, value: 0xb9000000, kind: "str", width: 4, label: "w32" },
    { mask: 0xffc00000, value: 0x79400000, kind: "ldrh", width: 2, label: "h16" },
    { mask: 0xffc00000, value: 0x79000000, kind: "strh", width: 2, label: "h16" },
    { mask: 0xffc00000, value: 0x39400000, kind: "ldrb", width: 1, label: "b8" },
    { mask: 0xffc00000, value: 0x39000000, kind: "strb", width: 1, label: "b8" },
  ];
  const form = forms.find((entry) => ((instruction & entry.mask) >>> 0) === entry.value);
  if (!form) return null;
  return {
    ...form,
    register: instruction & 0x1f,
    baseRegister: (instruction >>> 5) & 0x1f,
    stackOffset: ((instruction >>> 10) & 0xfff) * form.width,
  };
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function scanUnsignedStackReferences(buffer, elf, startAddress, endAddress, ranges) {
  const startOffset = fileOffsetForVirtualAddress(elf, startAddress, 4);
  const endOffset = fileOffsetForVirtualAddress(elf, endAddress, 4);
  if (startOffset == null || endOffset == null || startOffset >= endOffset) return {};
  const output = Object.fromEntries(ranges.map((range) => [range.name, []]));
  for (let offset = startOffset; offset + 4 <= endOffset; offset += 4) {
    const instruction = buffer.readUInt32LE(offset);
    const parsed = parseLoadStoreUnsignedImmediate(instruction);
    if (!parsed || parsed.baseRegister !== 31) continue;
    const accessStart = parsed.stackOffset;
    const accessEnd = parsed.stackOffset + parsed.width;
    const address = startAddress + (offset - startOffset);
    for (const range of ranges) {
      if (!rangesOverlap(accessStart, accessEnd, range.start, range.end)) continue;
      output[range.name].push({
        address: hex(address),
        instructionHex: instruction.toString(16).padStart(8, "0"),
        access: `${parsed.kind}-${parsed.label}`,
        stackOffset: hex(parsed.stackOffset),
        byteWidth: parsed.width,
        range: `${hex(range.start)}..${hex(range.end - 1)}`,
      });
    }
  }
  return output;
}

function instructionHexAt(buffer, elf, virtualAddress) {
  const offset = fileOffsetForVirtualAddress(elf, virtualAddress, 4);
  if (offset == null || offset + 4 > buffer.length) return "";
  return buffer.readUInt32LE(offset).toString(16).padStart(8, "0");
}

function instructionEvidence(buffer, elf, rows) {
  return rows.map((row) => {
    const actualOpcode = instructionHexAt(buffer, elf, row.address);
    return {
      ...row,
      address: hex(row.address),
      expectedOpcode: row.expectedOpcode,
      actualOpcode,
      matched: actualOpcode === row.expectedOpcode,
    };
  });
}

function readU64AtVirtualAddress(buffer, elf, virtualAddress) {
  const offset = fileOffsetForVirtualAddress(elf, virtualAddress, 8);
  if (offset == null || offset + 8 > buffer.length) return null;
  return Number(buffer.readBigUInt64LE(offset));
}

function pointerSlotEvidence(buffer, elf, rows) {
  return rows.map((row) => {
    const actualValue = readU64AtVirtualAddress(buffer, elf, row.address);
    return {
      ...row,
      address: hex(row.address),
      expectedValue: hex(row.expectedValue),
      actualValue: actualValue == null ? "" : hex(actualValue),
      matched: actualValue === row.expectedValue,
    };
  });
}

function relocationAddendEvidence(buffer, elf, addends) {
  const rela = (elf.sections || []).find((section) => section.name === ".rela.dyn");
  if (!rela || !rela.entrySize) return [];
  const addendSet = new Set(addends);
  const rows = [];
  for (let offset = rela.fileOffset; offset + 24 <= rela.fileOffset + rela.size; offset += rela.entrySize || 24) {
    const targetOffset = Number(buffer.readBigUInt64LE(offset));
    const info = buffer.readBigUInt64LE(offset + 8);
    const addend = Number(buffer.readBigInt64LE(offset + 16));
    if (!addendSet.has(addend)) continue;
    rows.push({
      relocationFileOffset: hex(offset),
      targetOffset: hex(targetOffset),
      info: `0x${info.toString(16)}`,
      addend: hex(addend),
    });
  }
  return rows.sort((left, right) => left.targetOffset.localeCompare(right.targetOffset));
}

function summarizeCurrentNativeShaderDataAnchors(binaryPath = defaultCurrentAndroidBinary) {
  if (!fs.existsSync(binaryPath)) {
    return {
      status: "missing-current-android-binary",
      binaryPath,
      rendererTakeover: false,
    };
  }
  try {
    const buffer = fs.readFileSync(binaryPath);
    const elf = parseElf64(buffer);
    const anchors = ["?shaderData", "shaderData", "texData", "animData", "meshData"];
    const stringTargets = buildStringTargets(buffer, elf, anchors);
    const pointerSlotTargets = buildPointerSlotTargets(buffer, elf, stringTargets);
    const textReferences = scanTextReferences(buffer, elf, [...stringTargets, ...pointerSlotTargets]);
    const referencesByTarget = {};
    for (const reference of textReferences) countValue(referencesByTarget, reference.targetName);
    return {
      status: textReferences.length ? "current-binary-resource-key-xrefs-recovered" : "current-binary-resource-key-xrefs-missing",
      binaryPath,
      scope: "current Android libGameKindred.so resource key references only",
      stringTargets: stringTargets.map((target) => ({
        name: target.name,
        virtualAddress: hex(target.virtualAddress),
        fileOffset: hex(target.fileOffset),
        section: target.section,
      })),
      pointerSlotTargets: pointerSlotTargets.map((target) => ({
        name: target.name,
        virtualAddress: hex(target.virtualAddress),
        section: target.section,
        pointsToName: target.pointsToName,
        pointsToAddress: hex(target.pointsToAddress),
      })),
      textReferenceCount: textReferences.length,
      referencesByTarget: sortObject(referencesByTarget),
      shaderDataReferences: textReferences
        .filter((reference) => reference.targetName === "shaderData" || reference.targetName === "?shaderData")
        .map((reference) => ({
          targetName: reference.targetName,
          xrefAddress: hex(reference.xrefAddress),
          mode: reference.mode,
          targetKind: reference.targetKind,
        })),
      resourceFamilyReferences: textReferences.map((reference) => ({
        targetName: reference.targetName,
        xrefAddress: hex(reference.xrefAddress),
        mode: reference.mode,
        targetKind: reference.targetKind,
      })),
      boundary:
        "This proves the local Android binary references shaderData/texData/animData/meshData resource keys. It does not by itself prove the final shader pass object, render queue, or word1/word2/word3 semantics.",
      rendererTakeover: false,
    };
  } catch (error) {
    return {
      status: "current-binary-anchor-scan-failed",
      binaryPath,
      error: error.message,
      rendererTakeover: false,
    };
  }
}

function callerAddresses(callers, limit = 20) {
  return callers.slice(0, limit).map((caller) => ({
    address: caller.callerAddressHex,
    mode: caller.mode,
    instructionHex: caller.instructionHex,
  }));
}

function currentNativeShaderProgramAndRenderStateEvidence(binaryPath = defaultCurrentAndroidBinary) {
  if (!fs.existsSync(binaryPath)) {
    return {
      status: "missing-current-android-binary",
      binaryPath,
      rendererTakeover: false,
    };
  }
  try {
    const buffer = fs.readFileSync(binaryPath);
    const elf = parseElf64(buffer);
    const glPlt = {
      glUseProgram: 0x78f4e0,
      glGetUniformLocation: 0x797790,
      glUniform1f: 0x797240,
      glUniform1i: 0x798c70,
      glUniform2fv: 0x78f020,
      glUniform3fv: 0x798950,
      glUniform4fv: 0x795d60,
      glActiveTexture: 0x7902b0,
      glBindTexture: 0x7941b0,
      glTexImage2D: 0x7993f0,
      glCreateProgram: 0x7991b0,
      glLinkProgram: 0x799390,
      glShaderSource: 0x798c50,
      glCompileShader: 0x796ef0,
      glDeleteProgram: 0x7934d0,
      glDepthMask: 0x797bb0,
      glBlendFuncSeparate: 0x798a20,
      glEnable: 0x795400,
      glDisable: 0x798ea0,
      glColorMask: 0x792050,
      glDepthFunc: 0x794ac0,
      glCullFace: 0x799890,
      glFrontFace: 0x78f6e0,
    };
    const runtimeTargets = {
      renderStateConsumer: 0xe07bd4,
      textureRecordBinder: 0xe07df8,
      textureUploadBinder: 0x18a5838,
      parameterUploader: 0x189ca94,
      shaderProgramBuilder: 0x18a4bdc,
      shaderCompiledSamplerBinder: 0x18a4f8c,
    };
    const passStateRows = instructionEvidence(buffer, elf, [
      {
        stage: "payload-pass-header-copy",
        address: 0x18a7278,
        expectedOpcode: "3cc18400",
        evidence: "copies the first 16 bytes of the 24-byte pass header into a stack record",
      },
      {
        stage: "payload-pass-header-copy",
        address: 0x18a727c,
        expectedOpcode: "f9000828",
        evidence: "copies pass header +0x10 into the same stack record, completing the 24-byte header copy",
      },
      {
        stage: "shaderdata-record-state-source",
        address: 0x18a00d4,
        expectedOpcode: "f9400fe8",
        evidence: "loads the 8-byte state value from the copied pass header stack slot at sp+0x18",
      },
      {
        stage: "shaderdata-record-state-store",
        address: 0x18a00e8,
        expectedOpcode: "f90eeea8",
        evidence: "stores that 8-byte state value into the shaderData record at +0x1dd8",
      },
      {
        stage: "shaderdata-record-program-source",
        address: 0x18a00e4,
        expectedOpcode: "f90efaa0",
        evidence: "stores the compiled shader payload pointer/offset result into shaderData record +0x1df0",
      },
      {
        stage: "shaderdata-record-parameter-source",
        address: 0x18a0524,
        expectedOpcode: "f90ef280",
        evidence: "stores the decoded parameter/dependency table pointer into shaderData record +0x1de0",
      },
      {
        stage: "compiled-pass-build",
        address: 0x189c7e0,
        expectedOpcode: "f94efb61",
        evidence: "loads shaderData record +0x1df0 as the compiled shader payload input",
      },
      {
        stage: "compiled-pass-build",
        address: 0x189c7e4,
        expectedOpcode: "b99deb62",
        evidence: "loads shaderData record +0x1de8 as the compiled shader payload length/offset input",
      },
      {
        stage: "compiled-pass-build",
        address: 0x189c7ec,
        expectedOpcode: "940021e7",
        evidence: "calls the compiled sampler/program binder at 0x18a4f88",
      },
      {
        stage: "pass-wrapper-build",
        address: 0x189c824,
        expectedOpcode: "5283bb08",
        evidence: "prepares shaderData record +0x1dd8 as the pass-state source address",
      },
      {
        stage: "pass-wrapper-build",
        address: 0x189c82c,
        expectedOpcode: "940003a0",
        evidence: "calls 0x189d6ac to build the 0x18-byte pass wrapper",
      },
      {
        stage: "pass-wrapper-build",
        address: 0x189d6ac,
        expectedOpcode: "a9000801",
        evidence: "stores program/pass pointer and parameter table pointer into wrapper +0x0/+0x8",
      },
      {
        stage: "pass-wrapper-build",
        address: 0x189d6b4,
        expectedOpcode: "f9400068",
        evidence: "loads the 8-byte state qword from shaderData record +0x1dd8",
      },
      {
        stage: "pass-wrapper-build",
        address: 0x189d6b8,
        expectedOpcode: "f9000808",
        evidence: "stores the copied state qword into pass wrapper +0x10",
      },
      {
        stage: "draw-state-consume",
        address: 0x189fa24,
        expectedOpcode: "f9400a60",
        evidence: "loads pass wrapper +0x10 before tail-calling the render-state consumer",
      },
    ]);
    const passHeaderCountRows = instructionEvidence(buffer, elf, [
      {
        stage: "pass-header-count-load",
        address: 0x18a00b0,
        expectedOpcode: "394093e3",
        evidence: "loads pass header byte +0x14 into w3 as the first downstream section count",
      },
      {
        stage: "pass-header-count-load",
        address: 0x18a00b4,
        expectedOpcode: "394097e4",
        evidence: "loads pass header byte +0x15 into w4 as the second downstream section count",
      },
      {
        stage: "pass-header-count-load",
        address: 0x18a00b8,
        expectedOpcode: "39409be5",
        evidence: "loads pass header byte +0x16 into w5 as the third downstream section count",
      },
      {
        stage: "pass-header-count-load",
        address: 0x18a00bc,
        expectedOpcode: "39409fe6",
        evidence: "loads pass header byte +0x17 into w6 as the fourth downstream section count",
      },
      {
        stage: "pass-header-count-dispatch",
        address: 0x18a00d0,
        expectedOpcode: "94000019",
        evidence: "calls 0x18a0134 with those four count bytes after the 24-byte pass header",
      },
      {
        stage: "pass-header-count-consume",
        address: 0x18a018c,
        expectedOpcode: "34000599",
        evidence: "0x18a0134 gates its first parser loop on the first count byte",
      },
      {
        stage: "pass-header-count-consume",
        address: 0x18a023c,
        expectedOpcode: "340009d7",
        evidence: "0x18a0134 gates its second parser loop on the second count byte",
      },
      {
        stage: "pass-header-count-consume",
        address: 0x18a0374,
        expectedOpcode: "340004f6",
        evidence: "0x18a0134 gates its third parser loop on the third count byte",
      },
      {
        stage: "pass-header-count-consume",
        address: 0x18a0410,
        expectedOpcode: "34000875",
        evidence: "0x18a0134 gates its fourth parser loop on the fourth count byte",
      },
    ]);
    const passParameterTableRows = instructionEvidence(buffer, elf, [
      {
        stage: "pass-parameter-table-finalize",
        address: 0x18a0520,
        expectedOpcode: "97ffee4f",
        evidence: "finalizes the parsed pass parameter/dependency table from the 0x18a0134 scratch builder",
      },
      {
        stage: "pass-parameter-table-store",
        address: 0x18a0524,
        expectedOpcode: "f90ef280",
        evidence: "stores the finalized parser table pointer at shaderData record +0x1de0",
      },
      {
        stage: "pass-parameter-table-first-section-base",
        address: 0x189c718,
        expectedOpcode: "5283bc09",
        evidence: "computes shaderData record +0x1de0 while processing the first parsed parameter section",
      },
      {
        stage: "pass-parameter-table-first-section-load",
        address: 0x189c73c,
        expectedOpcode: "f94002e8",
        evidence: "loads the +0x1de0 table pointer for first-section entries",
      },
      {
        stage: "pass-parameter-table-first-section-write",
        address: 0x189c74c,
        expectedOpcode: "940001f8",
        evidence: "writes first-section parsed values into the parameter table through 0x189cf2c",
      },
      {
        stage: "pass-parameter-table-third-section-base",
        address: 0x189c778,
        expectedOpcode: "5283bc09",
        evidence: "computes shaderData record +0x1de0 while processing the third parsed parameter section",
      },
      {
        stage: "pass-parameter-table-third-section-load",
        address: 0x189c794,
        expectedOpcode: "f9400288",
        evidence: "loads the +0x1de0 table pointer for third-section entries",
      },
      {
        stage: "pass-parameter-table-third-section-write",
        address: 0x189c7a4,
        expectedOpcode: "940001e2",
        evidence: "writes third-section parsed values into the parameter table through 0x189cf2c",
      },
      {
        stage: "pass-parameter-table-program-resolve-load",
        address: 0x189c7f0,
        expectedOpcode: "f9400280",
        evidence: "loads the +0x1de0 table pointer before program-specific parameter binding",
      },
      {
        stage: "pass-parameter-table-program-resolve",
        address: 0x189c7f8,
        expectedOpcode: "940001fe",
        evidence: "passes the table to 0x189cff0, which rewrites parameter ids through the compiled GL program",
      },
      {
        stage: "pass-parameter-table-wrapper-load",
        address: 0x189c820,
        expectedOpcode: "f9400282",
        evidence: "loads the +0x1de0 table pointer for pass wrapper construction",
      },
      {
        stage: "pass-parameter-table-wrapper-build",
        address: 0x189c82c,
        expectedOpcode: "940003a0",
        evidence: "passes the table pointer and state qword source to pass wrapper construction",
      },
      {
        stage: "pass-parameter-table-wrapper-store",
        address: 0x189d6ac,
        expectedOpcode: "a9000801",
        evidence: "stores compiled program pointer at wrapper +0x0 and parameter table pointer at wrapper +0x8",
      },
      {
        stage: "pass-parameter-table-entry-write",
        address: 0x189cf2c,
        expectedOpcode: "d10043ff",
        evidence: "0x189cf2c scans a parameter-table entry by id/type and writes parsed values into its data area",
      },
      {
        stage: "pass-parameter-table-program-index-rewrite",
        address: 0x189d05c,
        expectedOpcode: "94002010",
        evidence: "0x189cff0 resolves non-runtime parameter ids through the compiled program before draw-time use",
      },
    ]);
    const passWrapperSourceTableRows = instructionEvidence(buffer, elf, [
      {
        stage: "pass-wrapper-source-table-populate",
        address: 0x189c884,
        expectedOpcode: "b94002c8",
        evidence: "loads the pass-wrapper array index from the parsed source/material binding table",
      },
      {
        stage: "pass-wrapper-source-table-populate",
        address: 0x189c888,
        expectedOpcode: "385fc2c1",
        evidence: "loads the destination source/program table index byte for the pass binding",
      },
      {
        stage: "pass-wrapper-source-table-populate",
        address: 0x189c890,
        expectedOpcode: "f8687aa2",
        evidence: "loads the pass wrapper pointer from the local pass-wrapper array by the parsed pass index",
      },
      {
        stage: "pass-wrapper-source-table-populate",
        address: 0x189c894,
        expectedOpcode: "94000c8f",
        evidence: "calls 0x189fad0 with the destination table, destination index, and pass wrapper pointer",
      },
      {
        stage: "pass-wrapper-source-table-store",
        address: 0x189fad0,
        expectedOpcode: "8b210c08",
        evidence: "computes destination table entry address as table + index*8",
      },
      {
        stage: "pass-wrapper-source-table-store",
        address: 0x189fad4,
        expectedOpcode: "f9000502",
        evidence: "stores the pass wrapper pointer at destination entry +0x8",
      },
    ]);
    const bindingIndexParserRows = instructionEvidence(buffer, elf, [
      {
        stage: "binding-index-parser-section-select",
        address: 0x189ff98,
        expectedOpcode: "94001ca1",
        evidence:
          "copies the selected shader payload section header/table through 0x18a721c before pass binding extraction",
      },
      {
        stage: "binding-index-parser-table-base",
        address: 0x189ffb4,
        expectedOpcode: "528efe09",
        evidence: "prepares shaderData binding-record base offset +0x77f0",
      },
      {
        stage: "binding-index-parser-count-base",
        address: 0x189ffb8,
        expectedOpcode: "528efd0a",
        evidence: "prepares shaderData binding-count offset +0x77e8",
      },
      {
        stage: "binding-index-parser-record-base",
        address: 0x189ffc8,
        expectedOpcode: "8b09027b",
        evidence: "computes binding-record cursor as shaderData record +0x77f0",
      },
      {
        stage: "binding-index-parser-count-base",
        address: 0x189ffcc,
        expectedOpcode: "8b0a027c",
        evidence: "computes binding-count pointer as shaderData record +0x77e8",
      },
      {
        stage: "binding-index-parser-source-id",
        address: 0x189ffd4,
        expectedOpcode: "b8686ac0",
        evidence: "loads the source/material id from the selected section's 8-byte binding pair",
      },
      {
        stage: "binding-index-parser-source-to-slot",
        address: 0x189ffd8,
        expectedOpcode: "97fff5e7",
        evidence: "calls 0x189d774/01997c80-style source-id to source-table slot-byte mapper",
      },
      {
        stage: "binding-index-parser-pass-pointer",
        address: 0x189ffec,
        expectedOpcode: "b9400508",
        evidence: "loads the binding pair's payload/pass offset",
      },
      {
        stage: "binding-index-parser-pass-pointer",
        address: 0x189fff0,
        expectedOpcode: "8b0802a9",
        evidence: "converts the payload/pass offset into an absolute pass pointer",
      },
      {
        stage: "binding-index-parser-unique-pass",
        address: 0x18a0028,
        expectedOpcode: "f8385b49",
        evidence: "stores a previously unseen pass pointer into the local unique-pass array",
      },
      {
        stage: "binding-index-parser-binding-count",
        address: 0x18a0030,
        expectedOpcode: "b9400389",
        evidence: "loads the current shaderData binding count from +0x77e8",
      },
      {
        stage: "binding-index-parser-record-address",
        address: 0x18a0034,
        expectedOpcode: "8b090f6a",
        evidence: "computes the next 8-byte binding record address at +0x77f0 + count*8",
      },
      {
        stage: "binding-index-parser-binding-count",
        address: 0x18a0040,
        expectedOpcode: "b9000389",
        evidence: "stores the incremented shaderData binding count at +0x77e8",
      },
      {
        stage: "binding-index-parser-destination-slot",
        address: 0x18a0044,
        expectedOpcode: "39000140",
        evidence: "stores the mapped destination source/program slot byte at binding record +0",
      },
      {
        stage: "binding-index-parser-pass-index",
        address: 0x18a0048,
        expectedOpcode: "b9000548",
        evidence: "stores the unique pass-wrapper array index at binding record +4",
      },
      {
        stage: "binding-index-parser-unique-count",
        address: 0x18a005c,
        expectedOpcode: "b9003bf8",
        evidence: "stores the unique pass count used to build pass records/wrappers",
      },
    ]);
    const passBuildCallbackParameterRows = instructionEvidence(buffer, elf, [
      {
        stage: "pass-build-callback-destination-table-param",
        address: 0x189c6cc,
        expectedOpcode: "aa0103f8",
        evidence: "preserves callback argument x1 in x24; this is the destination source/program-style table later passed to 0x189fad0",
      },
      {
        stage: "pass-build-callback-destination-table-param",
        address: 0x189c88c,
        expectedOpcode: "aa1803e0",
        evidence: "moves preserved x24 into x0 before calling 0x189fad0",
      },
      {
        stage: "pass-build-callback-destination-table-param",
        address: 0x189c894,
        expectedOpcode: "94000c8f",
        evidence: "calls 0x189fad0 with x0=destination table, w1=destination source index, x2=pass wrapper pointer",
      },
    ]);
    const passBuildCallbackVtableSlots = pointerSlotEvidence(buffer, elf, [
      {
        stage: "pass-build-callback-vtable-slot",
        address: 0x272a7c8,
        expectedValue: 0x189c6a0,
        evidence: "current-package .data.rel.ro slot points to the pass-build callback entry",
      },
      {
        stage: "pass-build-callback-vtable-slot",
        address: 0x2ab5310,
        expectedValue: 0x189c6a0,
        evidence: "second current-package .data.rel.ro slot points to the same pass-build callback entry",
      },
      {
        stage: "pass-build-callback-neighbor-slot",
        address: 0x272a7c0,
        expectedValue: 0x189c648,
        evidence: "neighbor callback slot walks the first parsed table and shares the same callback family",
      },
      {
        stage: "pass-build-callback-neighbor-slot",
        address: 0x2ab5308,
        expectedValue: 0x189c648,
        evidence: "second callback-family neighbor slot points to the same first-table callback entry",
      },
    ]);
    const passBuildCallbackRelocations = relocationAddendEvidence(buffer, elf, [0x189c648, 0x189c6a0]).filter(
      (row) =>
        row.targetOffset === "0x272a7c0" ||
        row.targetOffset === "0x272a7c8" ||
        row.targetOffset === "0x2ab5308" ||
        row.targetOffset === "0x2ab5310",
    );
    const sourceTableLifecycleRows = instructionEvidence(buffer, elf, [
      {
        stage: "source-table-initial-allocate",
        address: 0x189ba40,
        expectedOpcode: "321d07e0",
        evidence: "allocates a 0x18-byte table object wrapper for a source/program-style table",
      },
      {
        stage: "source-table-initial-allocate",
        address: 0x189ba48,
        expectedOpcode: "321703e1",
        evidence: "passes first table count 0x200 to 0x189c8ec",
      },
      {
        stage: "source-table-initial-allocate",
        address: 0x189ba4c,
        expectedOpcode: "321503e2",
        evidence: "passes second table count 0x800 to 0x189c8ec",
      },
      {
        stage: "source-table-initial-allocate",
        address: 0x189ba54,
        expectedOpcode: "940003a6",
        evidence: "initializes the table object through 0x189c8ec",
      },
      {
        stage: "source-table-clone-allocate",
        address: 0x189be80,
        expectedOpcode: "12003d01",
        evidence: "derives first table count from source table +0x10 low half before cloning/finalizing",
      },
      {
        stage: "source-table-clone-allocate",
        address: 0x189be84,
        expectedOpcode: "53107d02",
        evidence: "derives second table count from source table +0x10 high half before cloning/finalizing",
      },
      {
        stage: "source-table-clone-allocate",
        address: 0x189be88,
        expectedOpcode: "94000299",
        evidence: "allocates a same-shaped table object through 0x189c8ec before copying entries",
      },
      {
        stage: "source-table-shape",
        address: 0x189c900,
        expectedOpcode: "b900101f",
        evidence: "0x189c8ec clears table object +0x10 count/header word",
      },
      {
        stage: "source-table-shape",
        address: 0x189c914,
        expectedOpcode: "f9000280",
        evidence: "0x189c8ec stores the first allocated array at table object +0x0",
      },
      {
        stage: "source-table-shape",
        address: 0x189c920,
        expectedOpcode: "f9000680",
        evidence: "0x189c8ec stores the second allocated array at table object +0x8",
      },
    ]);
    const passBuildOuterDispatchRows = instructionEvidence(buffer, elf, [
      {
        stage: "shaderdata-callback-object-constructor",
        address: 0xe01e58,
        expectedOpcode: "942a6df6",
        evidence: "loads the shaderData type object before constructing the shaderData callback object",
      },
      {
        stage: "shaderdata-callback-object-constructor",
        address: 0xe01e64,
        expectedOpcode: "aa1303e2",
        evidence: "passes the shared resource registry/context pointer as constructor argument x2",
      },
      {
        stage: "shaderdata-callback-object-constructor",
        address: 0xe01e68,
        expectedOpcode: "9400013e",
        evidence: "constructs the callback object through 0xe02360",
      },
      {
        stage: "shaderdata-callback-object-constructor",
        address: 0xe02360,
        expectedOpcode: "9000c948",
        evidence: "prepares the callback vtable addresspoint page for 0x272a7a8",
      },
      {
        stage: "shaderdata-callback-object-constructor",
        address: 0xe0236c,
        expectedOpcode: "a9000808",
        evidence: "stores the callback vtable pointer and shared registry/context pointer into the callback object",
      },
      {
        stage: "shaderdata-callback-owner-store",
        address: 0xe01e70,
        expectedOpcode: "f9001a95",
        evidence: "stores the constructed shaderData callback object at owner +0x30",
      },
      {
        stage: "shaderdata-type-callback-registration",
        address: 0xe01edc,
        expectedOpcode: "942a6dd5",
        evidence: "reloads the shaderData type object for callback registration",
      },
      {
        stage: "shaderdata-type-callback-registration",
        address: 0xe01ee0,
        expectedOpcode: "f9401a81",
        evidence: "loads the shaderData callback object from owner +0x30",
      },
      {
        stage: "shaderdata-type-callback-registration",
        address: 0xe01ee4,
        expectedOpcode: "942a68d7",
        evidence: "stores the callback object into the shaderData type object through 0x189c240",
      },
      {
        stage: "shaderdata-type-callback-registration",
        address: 0x189c240,
        expectedOpcode: "f9001001",
        evidence: "type object registration stores the callback pointer at type object +0x20",
      },
      {
        stage: "shaderdata-resource-key-dispatch",
        address: 0xe023d8,
        expectedOpcode: "d00067a1",
        evidence: "callback vtable +0x10 path prepares the current-package shaderData string page",
      },
      {
        stage: "shaderdata-resource-key-dispatch",
        address: 0xe023dc,
        expectedOpcode: "9133a021",
        evidence: "callback vtable +0x10 path materializes the shaderData key string",
      },
      {
        stage: "shaderdata-resource-key-dispatch",
        address: 0xe023e4,
        expectedOpcode: "1400989f",
        evidence: "thread-context path tail-dispatches through 0xe28660 into the shared registry",
      },
      {
        stage: "shaderdata-resource-key-dispatch",
        address: 0xe0240c,
        expectedOpcode: "14009890",
        evidence: "fallback path tail-dispatches through 0xe2864c into the shared registry",
      },
      {
        stage: "resource-registry-callback-search",
        address: 0xe28738,
        expectedOpcode: "f9400a68",
        evidence: "registry search loads the registered callback list from registry +0x10",
      },
      {
        stage: "resource-registry-callback-search",
        address: 0xe28744,
        expectedOpcode: "f9400908",
        evidence: "registry search loads callback vtable slot +0x10",
      },
      {
        stage: "resource-registry-callback-search",
        address: 0xe28748,
        expectedOpcode: "d63f0100",
        evidence: "registry search invokes callback vtable slot +0x10",
      },
      {
        stage: "resource-registry-callback-search",
        address: 0xe28750,
        expectedOpcode: "97fd142a",
        evidence: "registry search compares the callback-returned key with the requested key through strcmp",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe286a0,
        expectedOpcode: "9400001d",
        evidence: "shared registry dispatch finds the matching callback through 0xe28714",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe286b0,
        expectedOpcode: "940002bf",
        evidence: "allocates or obtains a 0x68-byte request/context record through 0xe291ac",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe286b4,
        expectedOpcode: "aa1903e1",
        evidence: "passes the matched callback pointer as x1 to request initialization",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe286c0,
        expectedOpcode: "940000b0",
        evidence: "initializes the request/context record through 0xe28980",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe289a0,
        expectedOpcode: "f9000401",
        evidence: "request initialization stores the matched callback pointer at request +0x8",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe289b0,
        expectedOpcode: "91004260",
        evidence: "request initialization prepares the request key string field at request +0x10",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe289d0,
        expectedOpcode: "3c838260",
        evidence: "request initialization clears request fields around +0x38",
      },
      {
        stage: "resource-request-record-build",
        address: 0xe289d4,
        expectedOpcode: "3c828260",
        evidence: "request initialization clears request fields around +0x28",
      },
      {
        stage: "resource-request-record-owner",
        address: 0xe291f4,
        expectedOpcode: "f9002ab3",
        evidence: "request allocator stores the owning registry/resource pool at request +0x50",
      },
      {
        stage: "resource-request-record-owner",
        address: 0xe29204,
        expectedOpcode: "390182a8",
        evidence: "request allocator stores a generation/status byte at request +0x60",
      },
      {
        stage: "resource-request-submit-sync",
        address: 0xe29230,
        expectedOpcode: "97fffe0e",
        evidence: "sync path invokes the callback vtable +0x18 pre-pass through 0xe28a68",
      },
      {
        stage: "resource-request-submit-sync",
        address: 0xe29240,
        expectedOpcode: "97fffe2a",
        evidence: "sync path invokes the callback vtable +0x20 pass-build/finalize through 0xe28ae8",
      },
      {
        stage: "resource-request-submit-async-complete",
        address: 0xe2957c,
        expectedOpcode: "97fffd93",
        evidence: "async completion path increments the request reference before final callback processing",
      },
      {
        stage: "resource-request-submit-async-complete",
        address: 0xe29584,
        expectedOpcode: "97fffd59",
        evidence: "async completion path invokes the same callback vtable +0x20 pass-build/finalize through 0xe28ae8",
      },
      {
        stage: "resource-request-final-callback-dispatch",
        address: 0xe28af8,
        expectedOpcode: "f9400400",
        evidence: "0xe28ae8 loads the matched callback pointer from request +0x8",
      },
      {
        stage: "resource-request-final-callback-dispatch",
        address: 0xe28b04,
        expectedOpcode: "aa1303e1",
        evidence: "0xe28ae8 passes the request/context record as callback argument x1",
      },
      {
        stage: "resource-request-final-callback-dispatch",
        address: 0xe28b08,
        expectedOpcode: "f9401108",
        evidence: "0xe28ae8 loads callback vtable slot +0x20",
      },
      {
        stage: "resource-request-final-callback-dispatch",
        address: 0xe28b0c,
        expectedOpcode: "d63f0100",
        evidence: "0xe28ae8 calls callback vtable slot +0x20, which resolves to 0x189c6a0 for the shaderData callback vtable",
      },
    ]);
    const requestResultSlotRows = instructionEvidence(buffer, elf, [
      {
        stage: "resource-request-result-slot-initial-value",
        address: 0xe286c8,
        expectedOpcode: "aa1703e1",
        evidence: "shared registry dispatch passes caller-provided x3 as request result/input slot value",
      },
      {
        stage: "resource-request-result-slot-initial-index",
        address: 0xe286cc,
        expectedOpcode: "2a1f03e2",
        evidence: "shared registry dispatch selects request result/input slot index 0",
      },
      {
        stage: "resource-request-result-slot-initial-store",
        address: 0xe286d0,
        expectedOpcode: "940000da",
        evidence: "shared registry dispatch stores slot 0 through 0xe28a38",
      },
      {
        stage: "resource-request-result-slot-setter",
        address: 0xe28a38,
        expectedOpcode: "8b224c08",
        evidence: "0xe28a38 computes an indexed request slot as request + slotIndex*8",
      },
      {
        stage: "resource-request-result-slot-setter",
        address: 0xe28a3c,
        expectedOpcode: "f9001501",
        evidence: "0xe28a38 stores the slot pointer at request + slotIndex*8 + 0x28",
      },
      {
        stage: "resource-request-result-slot-getter",
        address: 0xe28a44,
        expectedOpcode: "8b214c08",
        evidence: "0xe28a44 computes an indexed request slot as request + slotIndex*8",
      },
      {
        stage: "resource-request-result-slot-getter",
        address: 0xe28a48,
        expectedOpcode: "f9401500",
        evidence: "0xe28a44 loads the slot pointer from request + slotIndex*8 + 0x28",
      },
      {
        stage: "shaderdata-handler-reads-slot0",
        address: 0xe021f0,
        expectedOpcode: "94009a15",
        evidence: "shaderData handler process path reads request slot 0 before building the shaderData runtime object",
      },
      {
        stage: "shaderdata-handler-writes-slot1",
        address: 0xe022d0,
        expectedOpcode: "320003e2",
        evidence: "shaderData handler process path selects request slot index 1 for the produced object",
      },
      {
        stage: "shaderdata-handler-writes-slot1",
        address: 0xe022d8,
        expectedOpcode: "940099d8",
        evidence: "shaderData handler process path stores the produced object into request slot 1 through 0xe28a38",
      },
      {
        stage: "shaderdata-handler-returns-slot1",
        address: 0xe02344,
        expectedOpcode: "320003e1",
        evidence: "shaderData result accessor selects request slot index 1",
      },
      {
        stage: "shaderdata-handler-returns-slot1",
        address: 0xe0234c,
        expectedOpcode: "940099be",
        evidence: "shaderData result accessor returns request slot 1 through 0xe28a44",
      },
      {
        stage: "resource-request-release-lifecycle",
        address: 0xe29250,
        expectedOpcode: "17fffe64",
        evidence: "sync completion tail-releases the request through 0xe28be0 after callback processing",
      },
      {
        stage: "resource-request-release-lifecycle",
        address: 0xe28be4,
        expectedOpcode: "91017008",
        evidence: "request release decrements the atomic refcount at request +0x5c",
      },
      {
        stage: "resource-request-release-lifecycle",
        address: 0xe28bfc,
        expectedOpcode: "f9402820",
        evidence: "when the refcount reaches zero, request release loads the owner/resource pool from request +0x50",
      },
      {
        stage: "resource-request-release-lifecycle",
        address: 0xe28c00,
        expectedOpcode: "14000217",
        evidence: "zero-ref request release enters owner/pool finalization through 0xe2945c",
      },
      {
        stage: "resource-request-callback-cleanup",
        address: 0xe29504,
        expectedOpcode: "97fffd8c",
        evidence: "request pool finalization invokes 0xe28b34 before returning the request record to the pool",
      },
      {
        stage: "resource-request-callback-cleanup",
        address: 0xe28b44,
        expectedOpcode: "f9400400",
        evidence: "0xe28b34 reloads the request callback pointer from request +0x8 for cleanup",
      },
      {
        stage: "resource-request-callback-cleanup",
        address: 0xe28b54,
        expectedOpcode: "f9401508",
        evidence: "0xe28b34 loads callback vtable slot +0x28 for cleanup/final release",
      },
      {
        stage: "resource-request-callback-cleanup",
        address: 0xe28b58,
        expectedOpcode: "d63f0100",
        evidence: "0xe28b34 invokes callback vtable slot +0x28 before request cleanup continues",
      },
    ]);
    const shaderDataHandlerVtableSlots = pointerSlotEvidence(buffer, elf, [
      {
        stage: "shaderdata-handler-primary-vtable-process",
        address: 0x272a760,
        expectedValue: 0xe021a8,
        evidence: "primary shaderData resource-handler vtable +0x18 points to the process path that reads slot 0 and writes slot 1",
      },
      {
        stage: "shaderdata-handler-primary-vtable-result-accessor",
        address: 0x272a770,
        expectedValue: 0xe0231c,
        evidence: "primary shaderData resource-handler vtable +0x28 points to the result accessor that returns slot 1",
      },
      {
        stage: "shaderdata-pass-build-callback-vtable-first-table",
        address: 0x272a7c0,
        expectedValue: 0x189c648,
        evidence: "separate shaderData pass-build callback vtable +0x18 points to the first parsed table callback",
      },
      {
        stage: "shaderdata-pass-build-callback-vtable-pass-table",
        address: 0x272a7c8,
        expectedValue: 0x189c6a0,
        evidence: "separate shaderData pass-build callback vtable +0x20 points to the pass-wrapper table callback",
      },
    ]);
    const parameterUploaderRows = instructionEvidence(buffer, elf, [
      {
        stage: "parameter-uploader-default-count",
        address: 0x189caa4,
        expectedOpcode: "79402008",
        evidence: "0x189ca94 reads parameter table +0x10 as the default parameter-entry count",
      },
      {
        stage: "parameter-uploader-default-entry-and-value-base",
        address: 0x189cabc,
        expectedOpcode: "a9400a68",
        evidence: "0x189ca94 loads parameter entry array + value base from table +0/+8 before default uploads",
      },
      {
        stage: "parameter-uploader-default-location",
        address: 0x189cac8,
        expectedOpcode: "12002d03",
        evidence: "default upload masks entry word bits 0..11 as the GL uniform location",
      },
      {
        stage: "parameter-uploader-default-dispatch",
        address: 0x189cacc,
        expectedOpcode: "97ffffd1",
        evidence: "default upload dispatches one entry through 0x189ca10",
      },
      {
        stage: "parameter-uploader-override-count",
        address: 0x189cb20,
        expectedOpcode: "79402028",
        evidence: "override payload +0x10 is read as the override parameter-entry count",
      },
      {
        stage: "parameter-uploader-override-id-load",
        address: 0x189cb48,
        expectedOpcode: "b940056c",
        evidence: "override matching loads the override entry id from entry +0x4",
      },
      {
        stage: "parameter-uploader-base-id-load",
        address: 0x189cb50,
        expectedOpcode: "b940056e",
        evidence: "override matching compares against the base parameter entry id at entry +0x4",
      },
      {
        stage: "parameter-uploader-override-entry-word-load",
        address: 0x189cb74,
        expectedOpcode: "b9400168",
        evidence: "when ids match, the base entry word supplies the GL location/type bits",
      },
      {
        stage: "parameter-uploader-override-value-base-load",
        address: 0x189cb78,
        expectedOpcode: "f9400662",
        evidence: "matched override upload uses override payload +0x8 as the value base",
      },
      {
        stage: "parameter-uploader-override-dispatch",
        address: 0x189cb84,
        expectedOpcode: "97ffffa3",
        evidence: "matched override upload dispatches through 0x189ca10",
      },
      {
        stage: "parameter-dispatch-entry-word-load",
        address: 0x189ca10,
        expectedOpcode: "b9400028",
        evidence: "0x189ca10 reads the packed parameter entry word",
      },
      {
        stage: "parameter-dispatch-value-offset",
        address: 0x189ca14,
        expectedOpcode: "530c6d09",
        evidence: "0x189ca10 extracts bits 12..27 as the value offset/index",
      },
      {
        stage: "parameter-dispatch-value-address",
        address: 0x189ca18,
        expectedOpcode: "8b294842",
        evidence: "0x189ca10 adds the value offset to the selected value base",
      },
      {
        stage: "parameter-dispatch-indirect-flag",
        address: 0x189ca1c,
        expectedOpcode: "37f80048",
        evidence: "bit 31 controls whether the value is used directly or loaded indirectly",
      },
      {
        stage: "parameter-dispatch-indirect-value-load",
        address: 0x189ca20,
        expectedOpcode: "f9400042",
        evidence: "direct-value flag clear causes 0x189ca10 to load an indirect value pointer",
      },
      {
        stage: "parameter-dispatch-type",
        address: 0x189ca24,
        expectedOpcode: "531c7909",
        evidence: "0x189ca10 extracts bits 28..30 as the parameter upload type",
      },
      {
        stage: "parameter-dispatch-gluniform1f",
        address: 0x189ca50,
        expectedOpcode: "17bbe9fc",
        evidence: "parameter type 0 dispatches to glUniform1f",
      },
      {
        stage: "parameter-dispatch-gluniform2fv",
        address: 0x189ca5c,
        expectedOpcode: "17bbc971",
        evidence: "parameter type 1 dispatches to glUniform2fv with count 1",
      },
      {
        stage: "parameter-dispatch-gluniform3fv",
        address: 0x189ca68,
        expectedOpcode: "17bbefba",
        evidence: "parameter type 2 dispatches to glUniform3fv with count 1",
      },
      {
        stage: "parameter-dispatch-gluniform4fv",
        address: 0x189ca74,
        expectedOpcode: "17bbe4bb",
        evidence: "parameter type 3 dispatches to glUniform4fv with count 1",
      },
      {
        stage: "parameter-dispatch-object-load",
        address: 0x189ca78,
        expectedOpcode: "f9400040",
        evidence: "parameter type 4 loads an object pointer from the value slot",
      },
      {
        stage: "parameter-dispatch-object-vslot",
        address: 0x189ca88,
        expectedOpcode: "f9400902",
        evidence: "parameter type 4 loads the object vtable +0x10 upload/apply slot",
      },
      {
        stage: "parameter-dispatch-object-branch",
        address: 0x189ca8c,
        expectedOpcode: "d61f0040",
        evidence: "parameter type 4 branches to the object's upload/apply implementation with the GL location",
      },
    ]);
    const textureParameterBindingRows = instructionEvidence(buffer, elf, [
      {
        stage: "parameter-dispatch-texture-object-load",
        address: 0x189ca78,
        expectedOpcode: "f9400040",
        evidence: "parameter dispatch type 4 loads a texture/runtime object pointer from the resolved parameter value",
      },
      {
        stage: "parameter-dispatch-texture-location",
        address: 0x189ca84,
        expectedOpcode: "2a0303e1",
        evidence: "parameter dispatch type 4 passes the resolved GL location/unit value as w1 to the object apply method",
      },
      {
        stage: "parameter-dispatch-texture-vtable-slot",
        address: 0x189ca88,
        expectedOpcode: "f9400902",
        evidence: "parameter dispatch type 4 loads the object vtable +0x10 method before branching to it",
      },
      {
        stage: "texture-record-wrapper-tailcall",
        address: 0x189d984,
        expectedOpcode: "17d5a91d",
        evidence: "one recovered texture object apply method tail-calls the draw-time texture record binder at 0xe07df8",
      },
      {
        stage: "texture-record-object-id-load",
        address: 0xe07e14,
        expectedOpcode: "b9400035",
        evidence: "0xe07df8 reads texture record +0x0 as the GL texture object/cache id",
      },
      {
        stage: "texture-record-active-unit-call",
        address: 0xe07e5c,
        expectedOpcode: "97e62115",
        evidence: "0xe07df8 calls glActiveTexture with GL_TEXTURE0 plus the recovered sampler/unit index",
      },
      {
        stage: "texture-record-target-load",
        address: 0xe07e98,
        expectedOpcode: "79c00a60",
        evidence: "0xe07df8 reads texture record +0x4 as the GL texture target before binding",
      },
      {
        stage: "texture-record-bind-call",
        address: 0xe07e9c,
        expectedOpcode: "97e630c5",
        evidence: "0xe07df8 calls glBindTexture with the record target and object id",
      },
      {
        stage: "texture-record-parameter-flags",
        address: 0xe07ea0,
        expectedOpcode: "f840c268",
        evidence: "0xe07df8 reads texture record flags at +0xc before applying sampler filtering/wrap parameters",
      },
    ]);
    const passStateRowsMatched = passStateRows.every((row) => row.matched);
    const passHeaderCountRowsMatched = passHeaderCountRows.every((row) => row.matched);
    const passParameterTableRowsMatched = passParameterTableRows.every((row) => row.matched);
    const passWrapperSourceTableRowsMatched = passWrapperSourceTableRows.every((row) => row.matched);
    const bindingIndexParserRowsMatched = bindingIndexParserRows.every((row) => row.matched);
    const passBuildCallbackParameterRowsMatched = passBuildCallbackParameterRows.every((row) => row.matched);
    const passBuildCallbackVtableSlotsMatched = passBuildCallbackVtableSlots.every((row) => row.matched);
    const sourceTableLifecycleRowsMatched = sourceTableLifecycleRows.every((row) => row.matched);
    const passBuildOuterDispatchRowsMatched = passBuildOuterDispatchRows.every((row) => row.matched);
    const requestResultSlotRowsMatched = requestResultSlotRows.every((row) => row.matched);
    const shaderDataHandlerVtableSlotsMatched = shaderDataHandlerVtableSlots.every((row) => row.matched);
    const parameterUploaderRowsMatched = parameterUploaderRows.every((row) => row.matched);
    const textureParameterBindingRowsMatched = textureParameterBindingRows.every((row) => row.matched);
    const passHeaderStackReferenceScan = scanUnsignedStackReferences(buffer, elf, 0x18a00a8, 0x18a00ec, [
      { name: "tch0PayloadSizeOrSkipWord", start: 0x14, end: 0x18 },
      { name: "manifestWord0Word1RenderStateQword", start: 0x18, end: 0x20 },
      { name: "manifestWord2", start: 0x20, end: 0x24 },
      { name: "manifestWord3ParserCounts", start: 0x24, end: 0x28 },
    ]);
    const word2StackReferences = passHeaderStackReferenceScan.manifestWord2 || [];
    const glCallerSummary = {};
    for (const [name, address] of Object.entries(glPlt)) {
      const callers = findDirectBranchCallers(buffer, elf, address);
      glCallerSummary[name] = {
        pltAddress: hex(address),
        callerCount: callers.length,
        callers: callerAddresses(callers),
      };
    }
    const runtimeCallerSummary = {};
    for (const [name, address] of Object.entries(runtimeTargets)) {
      const callers = findDirectBranchCallers(buffer, elf, address);
      runtimeCallerSummary[name] = {
        address: hex(address),
        callerCount: callers.length,
        callers: callerAddresses(callers),
      };
    }
    const hasShaderCompiler =
      glCallerSummary.glCreateProgram.callerCount === 1 &&
      glCallerSummary.glLinkProgram.callerCount === 1 &&
      glCallerSummary.glShaderSource.callerCount === 1 &&
      glCallerSummary.glCompileShader.callerCount === 1 &&
      glCallerSummary.glGetUniformLocation.callerCount >= 10 &&
      glCallerSummary.glUniform1i.callerCount >= 2;
    const hasRenderStateConsumer =
      glCallerSummary.glDepthMask.callerCount > 0 &&
      glCallerSummary.glBlendFuncSeparate.callerCount > 0 &&
      glCallerSummary.glColorMask.callerCount > 0 &&
      glCallerSummary.glDepthFunc.callerCount > 0 &&
      glCallerSummary.glCullFace.callerCount > 0 &&
      runtimeCallerSummary.renderStateConsumer.callers.some((caller) => caller.address === "0x189f7d0") &&
      runtimeCallerSummary.renderStateConsumer.callers.some((caller) => caller.address === "0x189fa34");
    return {
      status:
        hasShaderCompiler && hasRenderStateConsumer && parameterUploaderRowsMatched && textureParameterBindingRowsMatched
          ? "current-binary-program-pass-state-texture-chain-recovered"
          : "current-binary-program-pass-state-chain-partial",
      binaryPath,
      scope: "current Android shader program/pass object and low-word render-state consumer",
      shaderProgramEvidence: {
        status: hasShaderCompiler ? "recovered" : "partial",
        programBuilderAddress: "0x18a4bdc",
        compiledSamplerBinderAddress: "0x18a4f8c",
        notes: [
          "0x18a4bdc calls glCreateProgram/glAttachShader/glLinkProgram and caches built-in uniform locations.",
          "0x18a4f8c parses compiled sampler records, calls glGetUniformLocation, sets sampler units with glUniform1i, and copies the sampler binding table.",
          "The copied sampler binding table names the sampler uniforms and units. The draw-time texture object source is recovered separately through parameter type 4.",
        ],
      },
      drawPassEvidence: {
        status: hasRenderStateConsumer ? "recovered-low-word-state" : "partial",
        passDrawWrappers: [
          {
            address: "0x189f750",
            evidence:
              "selects compiled pass program, uploads pass parameters through 0x189ca94, then tail-calls 0xe07bd4 with constant pass state 0x7010100c2",
          },
          {
            address: "0x189f990",
            evidence:
              "selects compiled pass program, uploads pass parameters through 0x189ca94, loads pass wrapper +0x10 state, then tail-calls 0xe07bd4",
          },
        ],
        parameterUploaderAddress: "0x189ca94",
        renderStateConsumerAddress: "0xe07bd4",
      },
      shaderDataPassStateEvidence: {
        status: passStateRowsMatched ? "current-binary-pass-state-qword-chain-recovered" : "partial",
        scope: "payload pass header -> shaderData record +0x1dd8 -> pass wrapper +0x10 -> render-state consumer",
        records: passStateRows,
        interpretation: [
          "The current binary copies a 24-byte pass header from the shaderData payload through 0x18a7274.",
          "The 8-byte state qword copied from that header is stored at shaderData record +0x1dd8.",
          "Pass wrapper construction at 0x189d6ac copies shaderData record +0x1dd8 into wrapper +0x10.",
          "Draw wrapper 0x189f990 loads wrapper +0x10 and tail-calls 0xe07bd4.",
          "The render-state consumer decodes the low 32 bits for GL state. The high 32 bits are part of the qword/cache comparison, but this function does not decode them into GL state fields.",
        ],
      },
      shaderDataPassHeaderCountEvidence: {
        status: passHeaderCountRowsMatched ? "current-binary-pass-word3-count-chain-recovered" : "partial",
        scope: "payload pass header bytes +0x14..+0x17 -> four parser section counts",
        records: passHeaderCountRows,
        interpretation: [
          "The static manifest's word3 column corresponds to bytes +0x14..+0x17 of the copied pass header.",
          "The current parser passes those four bytes to 0x18a0134 as four downstream section counts.",
          "This is parser-structure evidence, not render-order evidence. It does not by itself enable viewer rendering changes.",
        ],
      },
      shaderDataPassHeaderWord2Evidence: {
        status: word2StackReferences.length
          ? "current-binary-pass-word2-consumer-candidate"
          : "current-binary-pass-word2-no-direct-consumer-in-audited-parser-window",
        scope:
          "TCH0 state bytes +0x10..+0x13 (manifest word2) after 24-byte header copy, audited only in the parser/draw-state bridge window",
        copyEvidence: instructionEvidence(buffer, elf, [
          {
            stage: "payload-pass-header-copy",
            address: 0x18a727c,
            expectedOpcode: "f9000828",
            evidence:
              "copies source header +0x10..+0x17 into caller stack +0x10; with caller x1=sp+0x10, manifest word2 lands at sp+0x20..+0x23 and word3 lands at sp+0x24..+0x27",
          },
        ]),
        stackReferenceScanWindow: {
          startAddress: "0x18a00a8",
          endAddress: "0x18a00ec",
          method: "limited AArch64 unsigned SP-offset load/store scan",
          references: passHeaderStackReferenceScan,
        },
        interpretation: [
          "The current binary reads manifest word0+word1 from sp+0x18..+0x1f and stores that qword at shaderData record +0x1dd8 for the draw-time render-state consumer.",
          "The current binary reads manifest word3 bytes from sp+0x24..+0x27 and passes them to the four parser loops as section counts.",
          "No direct SP-offset load/store touching manifest word2 at sp+0x20..+0x23 is recovered in the audited parser/draw-state bridge window. This does not prove word2 is unused globally; it only blocks treating word2 as proven render queue/sort evidence.",
        ],
        rendererTakeover: false,
      },
      shaderDataPassParameterTableEvidence: {
        status: passParameterTableRowsMatched ? "current-binary-pass-parameter-table-chain-recovered" : "partial",
        scope: "0x18a0134 parser scratch -> shaderData record +0x1de0 -> program parameter resolver -> pass wrapper +0x8",
        records: passParameterTableRows,
        interpretation: [
          "The current parser finalizes a parameter/dependency table and stores it at shaderData record +0x1de0.",
          "Pass build code writes first-section and third-section parsed records into that table through 0x189cf2c.",
          "Program binding resolves table ids through 0x189cff0 before the table is stored into pass wrapper +0x8.",
          "This is shader parameter/dependency binding evidence. It is not render queue/sort evidence and does not enable renderer takeover.",
        ],
      },
      shaderDataPassWrapperSourceTableEvidence: {
        status: passWrapperSourceTableRowsMatched
          ? "current-binary-pass-wrapper-source-table-binding-recovered"
          : "partial",
        scope:
          "compiled pass wrapper array -> source/program-style table entry +0x8; render-owner table mount is bounded in the separate owner audit",
        records: passWrapperSourceTableRows,
        interpretation: [
          "After pass wrappers are built into a local array, the current parser walks another binding table at shaderData record offsets around +0x77e8/+0x77f4.",
          "For each binding, it loads a pass-wrapper array index, loads the pass wrapper pointer from the local array, and calls 0x189fad0.",
          "0x189fad0 stores that pass wrapper pointer at destination table + index*8 + 0x8, matching the later runtime source/program table lookup shape where selected entry +0x8 is the pass wrapper.",
          "This recovers the pass-wrapper-to-source-table binding shape. The separate owner audit now recovers the source/program table mount mechanism through 0x189be5c -> 0xd8003c -> 0x18907a8 -> 0x18916c8, and the 0xbac9d4 dynamic resource-list producer shape. The remaining edge is upstream resource-node semantics and active model/profile ownership, not a viewer-side rule.",
        ],
        rendererTakeover: false,
      },
      shaderDataBindingIndexParserEvidence: {
        status: bindingIndexParserRowsMatched ? "current-binary-binding-index-parser-recovered" : "partial",
        scope:
          "selected shader payload section -> source/material id mapper -> shaderData binding count at +0x77e8 and binding records at +0x77f0/+0x77f4",
        records: bindingIndexParserRows,
        structure: {
          maxPassRecords: 4,
          passRecordArrayOffset: "0x8",
          passRecordStride: "0x1df8",
          bindingCountOffset: "0x77e8",
          bindingRecordOffset: "0x77f0",
          bindingRecordStride: "0x8",
          bindingRecordFields: [
            "+0: mapped destination source/program slot byte",
            "+4: unique pass-wrapper array index",
          ],
        },
        interpretation: [
          "The binding table starts immediately after four fixed-size pass records: 0x8 + 4 * 0x1df8 = 0x77e8.",
          "The parser selects a shader payload section, walks 8-byte source/pass pairs, maps the source/material id through the native source-slot table, and writes only mapped rows into shaderData +0x77f0.",
          "For each mapped row, the parser deduplicates the pass pointer, stores the destination source/program slot byte at binding record +0, and stores the unique pass-wrapper index at binding record +4.",
          "The later pass-build callback consumes exactly this table: it reads +0x77e8 as count, +0x77f0 as destination index byte, and +0x77f4 as pass-wrapper array index before calling 0x189fad0.",
          "This closes the binding-index value source inside shaderData. The owner audit now identifies one dynamic producer/mount path, but this still does not prove every upstream resource node's semantic role for the submitted model.",
        ],
        decompiledReference:
          "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0199a.c FUN_0199a43c/FUN_0199a648, revalidated here against current-package opcodes",
        openEdge:
          "Recover upstream resource-node semantics and active model/profile ownership before treating a finalized source/program table as the submitted model's complete runtime table.",
        rendererTakeover: false,
      },
      shaderDataPassBuildCallbackEvidence: {
        status:
          passBuildCallbackParameterRowsMatched && passBuildCallbackVtableSlotsMatched && sourceTableLifecycleRowsMatched
            ? "current-binary-pass-build-callback-parameter-and-table-shape-recovered"
            : "partial",
        scope:
          "pass-build callback virtual entry -> callback x1 destination table -> 0x189fad0 table entry +0x8 store; outer dispatch is tracked separately",
        callbackEntryAddress: "0x189c6a0",
        parameterRecords: passBuildCallbackParameterRows,
        vtableSlots: passBuildCallbackVtableSlots,
        relocationAddends: passBuildCallbackRelocations,
        sourceTableLifecycleRecords: sourceTableLifecycleRows,
        interpretation: [
          "The current binary has two .data.rel.ro callback-family slots that point to 0x189c6a0, and neighboring slots point to 0x189c648.",
          "Inside 0x189c6a0, callback argument x1 is preserved in x24 and later moved into x0 for 0x189fad0, proving the pass-wrapper writes target the callback-provided destination table.",
          "0x189c8ec initializes the same 0x18-byte table object shape: first array at +0x0, second array at +0x8, count/header at +0x10.",
          "0x189ba30 creates a large initial table object, and 0x189be5c allocates a same-shaped cloned/finalized table from an existing table's +0x10 low/high counts.",
          "This closes the callback-argument-to-table-store edge. The owner audit now proves finalized source/program tables are mounted through 0xd8003c/0x18907a8, but the specific active request/list producer that feeds 0x189bde4/0x189be5c remains to be traced.",
        ],
        openEdge:
          "Recover upstream resource-node semantics and active model/profile ownership after the proven 0xbac9d4 producer path. Do not treat the request slot bank as final renderer ownership without that proof.",
        rendererTakeover: false,
      },
      shaderDataPassBuildOuterDispatchEvidence: {
        status: passBuildOuterDispatchRowsMatched
          ? "current-binary-pass-build-outer-dispatch-to-request-context-recovered"
          : "partial",
        scope:
          "shaderData type callback registration -> shared resource registry callback lookup -> request/context record -> callback vtable +0x20 dispatch",
        records: passBuildOuterDispatchRows,
        interpretation: [
          "The current package constructs the shaderData callback object through 0xe02360, using vtable addresspoint 0x272a7a8 and the shared resource registry/context pointer.",
          "The shaderData type object stores that callback at type object +0x20 through 0x189c240; this is a native type-object registration edge, not a viewer-side heuristic.",
          "The callback vtable +0x10 path materializes the literal shaderData key and dispatches into the shared resource registry through 0xe28660/0xe2864c.",
          "The registry lookup walks registered callbacks, invokes callback vtable +0x10, and compares the returned key with the requested key through strcmp before building a request/context record.",
          "The request/context record is a 0x68-byte pool record: initialization stores the matched callback at +0x8, prepares a key string at +0x10, clears fields around +0x28/+0x38, and records owner/status around +0x50/+0x60.",
          "Both sync and async completion paths reach 0xe28ae8, which loads the matched callback from request +0x8, passes the request/context as x1, and calls callback vtable +0x20. For the shaderData callback vtable, that slot is 0x189c6a0.",
          "This recovers the outer callback dispatch into 0x189c6a0. The binding index parser is recovered separately, and the owner audit now recovers the later source/program table mount mechanism plus the 0xbac9d4 dynamic producer shape. The remaining boundary is upstream resource-node semantics and active model/profile ownership.",
        ],
        openEdge:
          "Find the upstream resource-node semantics and active model/profile owner that explain which native resource-list data is selected for the submitted model.",
        rendererTakeover: false,
      },
      shaderDataRequestResultSlotEvidence: {
        status:
          requestResultSlotRowsMatched && shaderDataHandlerVtableSlotsMatched
            ? "current-binary-resource-request-result-slot-lifecycle-recovered"
            : "partial",
        scope:
          "shared resource request record -> indexed result slots at request +0x28+n*8 -> shaderData handler slot 0/1 processing -> request release/cleanup",
        records: requestResultSlotRows,
        vtableSlots: shaderDataHandlerVtableSlots,
        interpretation: [
          "The shared registry initializes request slot 0 from the caller-provided value before the resource handler runs.",
          "0xe28a38/0xe28a44 are the current-package setter/getter for an indexed request slot bank at request +0x28+n*8.",
          "The primary shaderData resource-handler process path reads slot 0 and writes the produced shaderData runtime object into slot 1; its result accessor returns slot 1.",
          "The pass-build callback vtable is separate from the primary shaderData resource-handler vtable: the callback vtable +0x18/+0x20 entries are 0x189c648/0x189c6a0.",
          "Request completion releases the request record through the owner/pool lifecycle and invokes callback cleanup vtable +0x28 before returning the record to the pool.",
          "This removes the earlier false dichotomy that callback/key metadata and destination-table writes must be the same final render table. The binding index parser and the later source/program table mount mechanism are now recovered separately; what remains unresolved is the active producer path that selects the mounted table for each submitted model.",
        ],
        openEdge:
          "Recover upstream resource-node semantics and active model/profile ownership before any renderer takeover.",
        rendererTakeover: false,
      },
      parameterUploaderEvidence: {
        status: parameterUploaderRowsMatched ? "current-binary-parameter-uploader-recovered" : "partial",
        address: "0x189ca94",
        dispatcherAddress: "0x189ca10",
        directCallers: runtimeCallerSummary.parameterUploader.callers,
        records: parameterUploaderRows,
        supportedUploads: [
          "glUniform1f",
          "glUniform2fv(count=1)",
          "glUniform3fv(count=1)",
          "glUniform4fv(count=1)",
          "object vtable +0x10 upload/apply",
        ],
        interpretation: [
          "0x189ca94 uploads a base parameter table first. The table layout is entry array at +0x0, value base at +0x8, and u16 count at +0x10.",
          "When a second payload is present, it scans override entries by matching entry +0x4 ids against the base table and then uploads matched values using the base entry's GL location/type bits.",
          "0x189ca10 decodes each packed entry word: bits 0..11 are GL uniform location, bits 12..27 are value offset/index, bit 31 selects direct versus indirect value addressing, and bits 28..30 select upload type.",
          "This proves draw-time uniform/parameter upload mechanics for pass wrappers and source/program table entries. It still does not recover the active light/probe/profile values themselves.",
        ],
      },
      textureParameterBindingEvidence: {
        status: textureParameterBindingRowsMatched
          ? "current-binary-texture-parameter-binding-chain-recovered"
          : "partial",
        scope:
          "pass parameter table type 4 value -> texture object vtable +0x10 -> texture record binder -> glActiveTexture/glBindTexture",
        parameterDispatcherAddress: "0x189ca10",
        textureRecordBinderAddress: "0xe07df8",
        textureObjectApplyTailcallAddress: "0x189d984",
        directCallers: runtimeCallerSummary.textureRecordBinder.callers,
        uploadBinderCallers: runtimeCallerSummary.textureUploadBinder.callers,
        records: textureParameterBindingRows,
        interpretation: [
          "Packed parameter entries with upload type 4 are object-backed resources rather than numeric uniforms.",
          "The dispatcher loads the resource object from the parameter value table, passes the resolved low 12-bit entry value as w1, and branches through vtable +0x10.",
          "One recovered texture object apply implementation tail-calls 0xe07df8, whose input texture record carries object id at +0x0, target at +0x4, and sampler/filtering flags at +0xc.",
          "0xe07df8 selects GL_TEXTURE0 + unit with glActiveTexture, then calls glBindTexture with the record target and object id. This is the recovered draw-time texture binding path.",
          "This does not yet resolve which static shadergraph hash or runtime resource object feeds every sampler value. Rows such as Hero028 Poseidon water sampler37 must remain diagnostic until their parameter-table value source is recovered.",
        ],
        rendererTakeover: false,
      },
      renderStateConsumerEvidence: {
        status: hasRenderStateConsumer ? "current-binary-low-word-consumer" : "partial",
        address: "0xe07bd4",
        decodedFields: [
          "cull/front-face bits 0..1",
          "color mask bits 2..5",
          "depth write bit 6",
          "depth test/function bits 7..9",
          "blend factor nibbles bits 16..31",
        ],
        negativeEvidence:
          "The current render-state consumer at 0xe07bd4 operates on the low render-state word fields used for GL state changes. The high qword half participates in full-state cache comparison, but this evidence still does not assign render queue/pass sort semantics to static TCH0 word1/word2/word3.",
      },
      glCallerSummary,
      runtimeCallerSummary,
      boundary:
        "This is current-package native evidence for shader program/pass state handling, the pass-state qword path, word3 parser-count bytes, the pass parameter-table chain, binding-index parser, pass-wrapper source-table binding, the pass-build callback's x1 destination-table usage, the outer callback dispatch to request/context, the request result-slot lifecycle, the shared draw-time parameter uploader, and the texture parameter object -> glBindTexture path. The separate owner audit now recovers the source/program table mount, consumer path, and one dynamic resource-list producer shape, but this audit still does not recover upstream resource-node semantics, active light/probe/profile values, every sampler's concrete resource object, or enough runtime command/table ownership to reproduce scene submission order.",
      rendererTakeover: false,
    };
  } catch (error) {
    return {
      status: "current-binary-program-pass-state-scan-failed",
      binaryPath,
      error: error.message,
      rendererTakeover: false,
    };
  }
}

function nativeRuntimeQueueSortEvidence(renderOwnerAuditPath = defaultRenderOwnerAuditPath) {
  if (!renderOwnerAuditPath || !fs.existsSync(renderOwnerAuditPath)) {
    return {
      status: "missing-render-owner-audit",
      sourceReport: renderOwnerAuditPath || "",
      rendererTakeover: false,
    };
  }
  try {
    const report = JSON.parse(fs.readFileSync(renderOwnerAuditPath, "utf8"));
    const summary = report.summary || {};
    const runtimeParam = report.sceneEntityRuntimeParamEvidence || {};
    const returnedObject = runtimeParam.returnedObject || {};
    const sourceTableProgramPath = returnedObject.sourceTableProgramPath || {};
    const queuedCommandSortKey = runtimeParam.queuedCommandSortKey || {};
    const recovered =
      summary.sceneEntityRuntimeParamSourceTableMountRecovered &&
      summary.sceneEntityRuntimeParamDynamicSourceTableProducerRecovered &&
      summary.sceneEntityRuntimeParamDynamicSourceTableUpstreamSelectionRecovered &&
      summary.sceneEntityRuntimeParamDynamicSourceTableSelectorCallsiteRecovered &&
      summary.sceneEntityRuntimeParamDynamicSourceTableSelectorTypeIndicesRecovered &&
      summary.sceneEntityRuntimeParamSourceTableProgramRecovered &&
      summary.sceneEntityRuntimeParamSortKeyFormulaRecovered &&
      summary.renderCommandQueueSortKeyRecovered;
    return {
      status: recovered ? "current-binary-runtime-queue-sort-key-recovered" : "partial",
      sourceReport: renderOwnerAuditPath,
      queueSortRecovered: Boolean(summary.renderCommandQueueSortKeyRecovered),
      sourceTableMountRecovered: Boolean(summary.sceneEntityRuntimeParamSourceTableMountRecovered),
      dynamicSourceTableProducerRecovered: Boolean(summary.sceneEntityRuntimeParamDynamicSourceTableProducerRecovered),
      dynamicSourceTableUpstreamSelectionRecovered: Boolean(
        summary.sceneEntityRuntimeParamDynamicSourceTableUpstreamSelectionRecovered,
      ),
      dynamicSourceTableSelectorCallsiteRecovered: Boolean(
        summary.sceneEntityRuntimeParamDynamicSourceTableSelectorCallsiteRecovered,
      ),
      dynamicSourceTableSelectorTypeIndicesRecovered: Boolean(
        summary.sceneEntityRuntimeParamDynamicSourceTableSelectorTypeIndicesRecovered,
      ),
      sourceTableProgramRecovered: Boolean(summary.sceneEntityRuntimeParamSourceTableProgramRecovered),
      sortKeyFormulaRecovered: Boolean(summary.sceneEntityRuntimeParamSortKeyFormulaRecovered),
      sourceTableProgramPath: {
        constructorSourceTableLoadHex: sourceTableProgramPath.constructorSourceTableLoadHex || "",
        constructorSourceEntryLoadHex: sourceTableProgramPath.constructorSourceEntryLoadHex || "",
        programApplyFunctionHex: sourceTableProgramPath.programApplyFunctionHex || "",
        programPointerLoadHex: sourceTableProgramPath.programPointerLoadHex || "",
        parameterPayloadLoadHex: sourceTableProgramPath.parameterPayloadLoadHex || "",
        parameterApplyCallHex: sourceTableProgramPath.parameterApplyCallHex || "",
      },
      queuedCommandSortKey: {
        sortAndReappendHex: queuedCommandSortKey.sortAndReappendHex || "",
        keyLoadHex: queuedCommandSortKey.keyLoadHex || "",
        pairStoreHex: queuedCommandSortKey.pairStoreHex || "",
        sortCallHex: queuedCommandSortKey.sortCallHex || "",
        reappendCallHex: queuedCommandSortKey.reappendCallHex || "",
        partitionFunctionHex: queuedCommandSortKey.partitionFunctionHex || "",
      },
      interpretation: [
        "Runtime draw ordering is recovered in the render-owner chain, not in static shadergraph TCH0 word2.",
        "The returned-object constructor selects a source/program table entry; entry +0 supplies the GL program, entry +0x8 supplies the parameter payload, and entry +0x10 contributes flag bits to the returned-object sort key.",
        "The upstream parser now proves pass wrapper pointers are stored into a callback-provided source/program-style table at entry +0x8 through 0x189fad0, and 0x189c6a0 proves callback x1 is that destination table.",
        "The owner report now recovers the source/program table mount path: 0x189be5c clone/finalize results and layout-B state table fields are mounted through 0xd8003c -> 0x18907a8, then 0x18916c8 maps holder chain nodes into the render-owner small source object +0 consumed by 0x189f8f8.",
        "The owner report now also recovers 0xbac9d4 as a dynamic resource-list producer: it extracts 1..4 ids from nested resource-list nodes, appends entries through 0x189bde4, clones/finalizes through 0x189be5c, stores the cloned table to the caller destination, and immediately mounts it through 0xd8003c.",
        "The upstream 0x8abe6c selection path is also recovered as mechanics: it chooses caller-provided resource slots or the owner/config fallback node after 0xd6d6e0 validation, creates/resolves the scene/entity object through 0x188b8b8, and passes the selected slot +0x28 list to 0xbac9d4.",
        "The 0x8ccaf0 selector callsite is recovered too: it only invokes 0x8d551c after x19 +0x38 validates, creates/resolves a parent object and a 0x30349e4 child object, attaches x19 +0x30, and passes x19 +0x68 as the selector resource/list argument.",
        "The selector registry/type indices are now recovered as index sources too: 0x30350c8, 0x30349e4, and 0x30349f0 each have current-binary type registration or lazy-initializer evidence, and 0x8b4790 proves the post-selector child consumes x19 +0x38/+0x40 config/transform data.",
        "The outer resource dispatch that reaches 0x189c6a0 is recovered through shaderData type callback registration, shared registry lookup, and 0xe28ae8 callback vtable +0x20 dispatch. The request result-slot bank and shaderData binding-index parser are also recovered. The remaining open edge is the semantic meaning of those selected resource/list offsets plus the active light/probe/profile payload for the submitted model.",
        "Queued command +0x18 is then consumed by the render queue sort/reappend path as the command sort key.",
        "This does not provide a static per-material renderOrder for the Electron viewer, because it depends on runtime command objects, source/program table entries, source indices, and active scene submission order.",
      ],
      rendererTakeover: false,
    };
  } catch (error) {
    return {
      status: "render-owner-audit-read-failed",
      sourceReport: renderOwnerAuditPath,
      error: error.message,
      rendererTakeover: false,
    };
  }
}

function staticWord2RenderOrderBoundary(runtimeQueueSortEvidence, staticWord2Rows) {
  const runtimeSortKeyRecovered =
    runtimeQueueSortEvidence?.queueSortRecovered &&
    runtimeQueueSortEvidence?.sourceTableProgramRecovered &&
    runtimeQueueSortEvidence?.sortKeyFormulaRecovered;
  return {
    status: runtimeSortKeyRecovered
      ? "runtime-sort-key-recovered-static-word2-not-render-order-proof"
      : "static-word2-present-runtime-sort-key-evidence-incomplete",
    staticWord2Rows,
    staticWord2RenderOrderConsumerRecovered: false,
    runtimeSortKeyRecovered: Boolean(runtimeSortKeyRecovered),
    runtimeSortKeySource: runtimeSortKeyRecovered
      ? "queued command +0x18, produced by returned-object source/program entry sort-key formula"
      : "",
    interpretation: runtimeSortKeyRecovered
      ? [
          "TCH0 word2 has stable static values, but the audited pass parser/draw-state bridge does not consume it as a draw-order key.",
          "Current-package runtime ordering is recovered through command +0x18: returned-object construction combines source/program entry pointer, source index nibble, and entry +0x10 flags, then render queue sorting consumes that value.",
          "Therefore TCH0 word2 must stay diagnostic-only for render order. It can help classify pass/resource shapes, but it must not be used as a per-material viewer renderOrder.",
        ]
      : [
          "TCH0 word2 has stable static values, but the runtime queue sort-key chain is not available in the supplied owner audit.",
          "Without that chain, the viewer still must not treat word2 as render order because no direct current-package draw-sort consumer is recovered.",
        ],
    rendererTakeover: false,
  };
}

function crossBuildShaderDataPassObjectEvidence() {
  return {
    status: "cross-build-decompile-guidance-only",
    scope: "shaderData parse -> GL program/pass object -> draw state path",
    chain: [
      {
        stage: "shaderData resource publisher",
        evidence:
          "Cross-build Android 00efb.c publishes the 'shaderData' key through the resource manager, matching the current binary's shaderData key xrefs.",
        source: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00efb.c",
      },
      {
        stage: "shadergraph package parse",
        evidence:
          "FUN_019966dc calls FUN_0199a43c to parse shadergraph/CFF0 data, then dispatches parsed pass/material tables through callback slots.",
        source: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01996.c:449",
      },
      {
        stage: "pass object construction",
        evidence:
          "FUN_01996b2c builds GL program/pass objects: it binds sampled textures, creates inline 64x1 lookup textures, compiles shader text through FUN_0199f4e8, and stores the pass object with a render-state word.",
        source: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01996.c:729",
      },
      {
        stage: "draw-time pass state consumer",
        evidence:
          "FUN_01999ea4 selects the compiled pass object, uploads pass parameters through FUN_01996f20, then calls FUN_00f01040 with the pass object's +0x10 render-state word.",
        source: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01999.c:950",
      },
    ],
    boundary:
      "This cross-build chain is now superseded by current-package evidence for the low pass-state qword path. It remains useful only as naming/context guidance for parser structure and is still not enough to execute unresolved word1/word2/word3 behavior in the viewer.",
    rendererTakeover: false,
  };
}

function buildAudit(manifest, options = {}) {
  const items = manifest.items || [];
  const materialRows = items.filter((row) => row.materialIndex !== "");
  const rows = materialRows.map(auditRow);
  const decodedRows = rows.filter((row) => row.decodedWord0States > 0);
  const staticWord2Rows = rows.filter((row) => splitPipe(row.shaderPassStateWord2s).length > 0).length;
  const runtimeQueueSortEvidence = nativeRuntimeQueueSortEvidence(
    options.renderOwnerAuditPath || defaultRenderOwnerAuditPath,
  );
  const word2Boundary = staticWord2RenderOrderBoundary(runtimeQueueSortEvidence, staticWord2Rows);
  const stateEvidenceCounts = {};
  const orderEvidenceCounts = {};
  const viewerConsumerCounts = {};
  const cullCounts = {};
  const colorMaskCounts = {};
  const word2ByFamily = {};
  const word2ByNativeShaderMode = {};
  for (const row of rows) {
    countValue(stateEvidenceCounts, row.stateEvidenceStatus);
    countValue(orderEvidenceCounts, row.renderOrderEvidenceStatus);
    for (const value of splitPipe(row.viewerRuntimeConsumers)) countValue(viewerConsumerCounts, value);
    for (const value of splitPipe(row.cullModeIndexes)) countValue(cullCounts, value);
    for (const value of splitPipe(row.colorMasks)) countValue(colorMaskCounts, value);
    for (const value of splitPipe(row.shaderPassStateWord2s)) {
      const family = row.shaderPassStateFamily || "(blank)";
      const nativeShaderMode = row.nativeShaderMode || "(blank)";
      if (!word2ByFamily[family]) word2ByFamily[family] = {};
      if (!word2ByNativeShaderMode[nativeShaderMode]) word2ByNativeShaderMode[nativeShaderMode] = {};
      countValue(word2ByFamily[family], value);
      countValue(word2ByNativeShaderMode[nativeShaderMode], value);
    }
  }
  const summary = {
    source: "material-runtime-pipeline-manifest.shadergraph-pass-state",
    rows: rows.length,
    materialRows: materialRows.length,
    rowsWithPassState: rows.filter((row) => row.shaderPassStateSignatures).length,
    rowsWithDecodedWord0: decodedRows.length,
    rowsWithUnresolvedRenderOrderWords: 0,
    rowsWithStaticWord2Values: staticWord2Rows,
    rowsWhereRuntimeSortKeySupersedesStaticWord2: word2Boundary.runtimeSortKeyRecovered ? staticWord2Rows : 0,
    rowsWithWord3ParserCountBytes: rows.filter((row) => splitPipe(row.shaderPassStateWord3s).length > 0).length,
    word2RenderOrderTakeoverAllowed: false,
    word2RenderOrderTakeoverBlocker:
      "current native evidence recovers runtime command +0x18 as the render queue sort key; TCH0 word2 has no direct draw-sort consumer in the audited pass chain and remains diagnostic-only",
    staticWord2RenderOrderBoundary: word2Boundary,
    rendererTakeoverFromThisAudit: false,
    decodedStateScope: "word0-blend-depth-cull-color-mask",
    unresolvedStateScope:
      "word1-high-qword-cache-role-partial-word2-diagnostic-word3-parser-counts-recovered-extra-pass-tables-unresolved",
    nativeEvidenceStatus:
      "word0-proven-word1-qword-path-word2-diagnostic-word3-count-chain-recovered-runtime-command-sort-key-separated",
    nativeWord0RenderStateEvidence: nativeWord0RenderStateEvidence(),
    nativeRuntimeMaterialCommandEvidence: nativeRuntimeMaterialCommandEvidence(),
    currentNativeShaderDataResourceKeyEvidence: summarizeCurrentNativeShaderDataAnchors(
      options.currentAndroidBinary || defaultCurrentAndroidBinary,
    ),
    currentNativeShaderProgramAndRenderStateEvidence: currentNativeShaderProgramAndRenderStateEvidence(
      options.currentAndroidBinary || defaultCurrentAndroidBinary,
    ),
    nativeRuntimeQueueSortEvidence: runtimeQueueSortEvidence,
    crossBuildShaderDataPassObjectEvidence: crossBuildShaderDataPassObjectEvidence(),
    byStateEvidenceStatus: sortObject(stateEvidenceCounts),
    byRenderOrderEvidenceStatus: sortObject(orderEvidenceCounts),
    byViewerRuntimeConsumer: sortObject(viewerConsumerCounts),
    byShaderPassStateFamily: countField(rows, "shaderPassStateFamily"),
    byShaderPassStateWord0: countField(rows, "shaderPassStateWord0s"),
    byShaderPassStateWord1: countField(rows, "shaderPassStateWord1s"),
    byShaderPassStateWord2: countField(rows, "shaderPassStateWord2s"),
    byShaderPassStateWord2ByFamily: sortObject(
      Object.fromEntries(Object.entries(word2ByFamily).map(([key, value]) => [key, sortObject(value)])),
    ),
    byShaderPassStateWord2ByNativeShaderMode: sortObject(
      Object.fromEntries(Object.entries(word2ByNativeShaderMode).map(([key, value]) => [key, sortObject(value)])),
    ),
    byShaderPassBlendEnabled: countField(rows, "blendEnabled"),
    byShaderPassBlendPreset: countField(rows, "blendPreset"),
    byShaderPassDepthWrite: countField(rows, "depthWrite"),
    byShaderPassDepthTest: countField(rows, "depthTest"),
    byCullModeIndex: sortObject(cullCounts),
    byColorMask: sortObject(colorMaskCounts),
    topTransparentModels: topTransparentModels(rows),
  };
  return { summary, items: rows };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const manifestPath = optionValue(args, "--manifest", defaultManifestPath);
  const jsonOut = optionValue(args, "--json-out", defaultJsonOut);
  const tsvOut = optionValue(args, "--tsv-out", defaultTsvOut);
  const viewerOut = optionValue(args, "--viewer-out", defaultViewerOut);
  const currentAndroidBinary = optionValue(args, "--current-android-binary", defaultCurrentAndroidBinary);
  const renderOwnerAuditPath = optionValue(args, "--render-owner-audit", defaultRenderOwnerAuditPath);
  const audit = buildAudit(readManifest(manifestPath), { currentAndroidBinary, renderOwnerAuditPath });
  const columns = [
    "rel",
    "modelLabel",
    "character",
    "materialIndex",
    "materialName",
    "shadergraphRel",
    "shaderPassStateFamily",
    "shaderPassStateSignatures",
    "shaderPassStateWord0s",
    "shaderPassStateWord1s",
    "shaderPassStateWord2s",
    "shaderPassStateWord3s",
    "decodedWord0States",
    "stateEvidenceStatus",
    "renderOrderEvidenceStatus",
    "word2EvidenceStatus",
    "viewerRuntimeConsumers",
    "newRendererTakeoverFromThisAudit",
    "blendEnabled",
    "blendPreset",
    "depthWrite",
    "depthTest",
    "cullModeIndexes",
    "colorMasks",
    "blendFactors",
    "rgbBlendOps",
    "alphaBlendOps",
    "roleNames",
    "colorMode",
    "nativeShaderMode",
    "nativeShaderBlocker",
    "alphaRuntimeStage",
    "alphaExecutionMode",
    "colorExecutionMode",
    "reflectionExecutionMode",
    "uvAnimationExecutionMode",
  ];
  writeJson(jsonOut, audit);
  writeJson(viewerOut, audit);
  writeTsv(tsvOut, audit.items, columns);
  console.log(
    JSON.stringify(
      {
        jsonOut,
        tsvOut,
        viewerOut,
        summary: audit.summary,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) main();

module.exports = { buildAudit };
