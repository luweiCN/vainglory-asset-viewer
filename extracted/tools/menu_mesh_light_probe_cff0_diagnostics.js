#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { decodeInstanceChunks, parseCff0File, parsePatchTable } = require("./cff0_tools");
const { readDefinitionIndex } = require("./export_cff0_reports");

const defaultDefinitionIndex = "extracted/reports/definition_resource_index.tsv";
const defaultJsonOut = "extracted/reports/menu_mesh_light_probe_cff0_diagnostics.json";
const defaultTsvOut = "extracted/reports/menu_mesh_light_probe_cff0_diagnostics.tsv";
const defaultViewerOut = "extracted/viewer/menu-mesh-light-probe-cff0-diagnostics.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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

function finiteFloatAt(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 4 > buffer.length) return null;
  const value = buffer.readFloatLE(offset);
  return Number.isFinite(value) ? value : null;
}

function vec3At(buffer, offset) {
  const values = [finiteFloatAt(buffer, offset), finiteFloatAt(buffer, offset + 4), finiteFloatAt(buffer, offset + 8)];
  return values.every((value) => value !== null) ? values : null;
}

function vec3Text(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => Number(item).toFixed(6).replace(/\.?0+$/, "")).join(",");
}

function hasUsefulVec3(value) {
  return Array.isArray(value) && value.some((item) => Math.abs(item) > 0.00001);
}

function sameVec3(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) < 0.00001)
  );
}

function stringAt(buffer, offset, maxLength = 180) {
  if (!Buffer.isBuffer(buffer) || !Number.isInteger(offset) || offset < 0 || offset >= buffer.length) return "";
  const chars = [];
  for (let cursor = offset; cursor < buffer.length && chars.length < maxLength; cursor += 1) {
    const value = buffer[cursor];
    if (value === 0) break;
    if (value < 0x20 || value > 0x7e) return "";
    chars.push(value);
  }
  return chars.length ? Buffer.from(chars).toString("ascii") : "";
}

function patchTablesFor(parsed, fileBuffer) {
  const patches = [];
  let blockIndex = -1;
  for (const chunk of parsed.chunks) {
    if (chunk.magic === "DEF0") blockIndex += 1;
    if (chunk.magic !== "PTCH") continue;
    const payload = fileBuffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    patches.push({ blockIndex, ...parsePatchTable(payload) });
  }
  return patches;
}

function pointerSizeFor(instance) {
  if (instance.definitionFormatByte === 5) return 8;
  if (instance.definitionFormatByte === 4) return 4;
  return null;
}

function menuMeshRootShape(instance, patchTable) {
  const pointerSize = pointerSizeFor(instance);
  if (!pointerSize || !patchTable) return null;

  const targetOffsets = new Set(patchTable.entries.map((entry) => entry.targetOffset));
  const required64 = [0x0, 0x8, 0x10, 0x18, 0x20, 0xa0];
  const required32 = [0x0, 0x4, 0x8, 0xc, 0x10, 0x8c];
  if (pointerSize === 8 && required64.every((offset) => targetOffsets.has(offset))) {
    return {
      pointerSize,
      rootSize: 0xa8,
      light0Offset: 0x58,
      light1Offset: 0x7c,
      probeArrayFieldOffset: 0xa0,
      confidence: "exact-64-bit-MenuMeshData-root-shape",
    };
  }
  if (pointerSize === 4 && required32.every((offset) => targetOffsets.has(offset))) {
    return {
      pointerSize,
      rootSize: 0x90,
      light0Offset: null,
      light1Offset: null,
      probeArrayFieldOffset: 0x8c,
      confidence: "probable-32-bit-MenuMeshData-root-shape",
    };
  }
  return null;
}

function decodePointerArray({ patchByTarget, arrayFieldOffset, pointerSize, buffer }) {
  const pointerEntry = patchByTarget.get(arrayFieldOffset);
  if (!pointerEntry) return { arraySourceOffset: null, items: [] };

  const items = [];
  const arraySourceOffset = pointerEntry.sourceOffset;
  for (let cursor = arraySourceOffset; cursor + pointerSize <= buffer.length; cursor += pointerSize) {
    const entry = patchByTarget.get(cursor);
    if (!entry) break;
    items.push({
      pointerFieldOffset: cursor,
      objectOffset: entry.sourceOffset,
      vec3: vec3At(buffer, entry.sourceOffset),
      label: stringAt(buffer, entry.sourceOffset),
    });
  }

  return { arraySourceOffset, items };
}

function classifyLight(light) {
  const hasAny = hasUsefulVec3(light.position) || hasUsefulVec3(light.color) || hasUsefulVec3(light.attenuation);
  const looksDefault =
    sameVec3(light.position, [0, 0, 0]) &&
    sameVec3(light.color, [0, 0, 0]) &&
    sameVec3(light.attenuation, [1, 0, 0]);
  if (!hasAny) return "empty";
  if (looksDefault) return "default-disabled";
  return "configured";
}

function lightAt(buffer, offset) {
  if (offset === null || offset + 0x24 > buffer.length) return null;
  const light = {
    position: vec3At(buffer, offset),
    color: vec3At(buffer, offset + 0xc),
    attenuation: vec3At(buffer, offset + 0x18),
  };
  return { ...light, status: classifyLight(light) };
}

function decodeMenuMeshLightProbeBlock({ entry, instance, patchTable }) {
  const shape = menuMeshRootShape(instance, patchTable);
  if (!shape) return null;

  const patchByTarget = new Map(patchTable.entries.map((patch) => [patch.targetOffset, patch]));
  const rootStrings = patchTable.entries
    .filter((patch) => patch.targetOffset < shape.rootSize)
    .map((patch) => stringAt(instance.decodedPayload, patch.sourceOffset))
    .filter(Boolean);
  const rootSkeleton = rootStrings.find((value) => /^build:\/\/.+\.skeleton$/i.test(value)) || "";
  if (!rootSkeleton) return null;

  const probeArray = decodePointerArray({
    patchByTarget,
    arrayFieldOffset: shape.probeArrayFieldOffset,
    pointerSize: shape.pointerSize,
    buffer: instance.decodedPayload,
  });
  const light0 = lightAt(instance.decodedPayload, shape.light0Offset);
  const light1 = lightAt(instance.decodedPayload, shape.light1Offset);

  return {
    relativePath: entry.relativePath,
    hash: entry.hash,
    linkedPath: entry.linkedPath || entry.filePath,
    blockIndex: instance.blockIndex,
    definitionFormatByte: instance.definitionFormatByte,
    definitionVersionByte: instance.definitionVersionByte,
    pointerSize: shape.pointerSize,
    confidence: shape.confidence,
    light0,
    light1,
    probeArraySourceOffset: probeArray.arraySourceOffset,
    probeSamples: probeArray.items.map((item) => ({
      pointerFieldOffset: item.pointerFieldOffset,
      objectOffset: item.objectOffset,
      value: item.vec3,
      label: item.label,
    })),
    rootSkeleton,
    rootStrings,
  };
}

function buildDiagnostics(definitions) {
  const blocks = [];
  const errors = [];

  for (const entry of definitions) {
    if (entry.type && entry.type !== "definition") continue;
    const filePath = entry.linkedPath || entry.filePath;
    if (!filePath || !fs.existsSync(filePath)) continue;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      if (fileBuffer.subarray(0, 4).toString("ascii") !== "CFF0") continue;
      const parsed = parseCff0File(filePath);
      const instances = decodeInstanceChunks(parsed, fileBuffer);
      const patchByBlock = new Map(patchTablesFor(parsed, fileBuffer).map((patch) => [patch.blockIndex, patch]));
      for (const instance of instances) {
        const decoded = decodeMenuMeshLightProbeBlock({
          entry,
          instance,
          patchTable: patchByBlock.get(instance.blockIndex),
        });
        if (decoded) blocks.push(decoded);
      }
    } catch (error) {
      errors.push({ relativePath: entry.relativePath, message: error.message });
    }
  }

  const configuredLightBlocks = blocks.filter(
    (block) => block.light0?.status === "configured" || block.light1?.status === "configured",
  );
  const probeBlocks = blocks.filter((block) => block.probeSamples.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    source: "cff0-menu-mesh-root",
    summary: {
      definitions: definitions.length,
      decodedBlocks: blocks.length,
      exact64BitBlocks: blocks.filter((block) => block.pointerSize === 8).length,
      probable32BitBlocks: blocks.filter((block) => block.pointerSize === 4).length,
      configuredLightBlocks: configuredLightBlocks.length,
      probeBlocks: probeBlocks.length,
      errors: errors.length,
    },
    blocks,
    errors,
  };
}

function rowsForTsv(blocks) {
  return blocks.map((block) => ({
    relativePath: block.relativePath,
    blockIndex: block.blockIndex,
    format: block.definitionFormatByte,
    pointerSize: block.pointerSize,
    confidence: block.confidence,
    light0Status: block.light0?.status || "",
    light0Position: vec3Text(block.light0?.position),
    light0Color: vec3Text(block.light0?.color),
    light0Attenuation: vec3Text(block.light0?.attenuation),
    light1Status: block.light1?.status || "",
    light1Position: vec3Text(block.light1?.position),
    light1Color: vec3Text(block.light1?.color),
    light1Attenuation: vec3Text(block.light1?.attenuation),
    probeSamples: block.probeSamples.map((sample) => vec3Text(sample.value)).join("|"),
    rootSkeleton: block.rootSkeleton,
    rootStrings: block.rootStrings.slice(0, 8).join("|"),
  }));
}

function exportDiagnostics({
  definitionIndex = defaultDefinitionIndex,
  jsonOut = defaultJsonOut,
  tsvOut = defaultTsvOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const diagnostics = buildDiagnostics(readDefinitionIndex(definitionIndex));
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify(diagnostics, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify(diagnostics, null, 2)}\n`);
  writeTsv(tsvOut, rowsForTsv(diagnostics.blocks), [
    "relativePath",
    "blockIndex",
    "format",
    "pointerSize",
    "confidence",
    "light0Status",
    "light0Position",
    "light0Color",
    "light0Attenuation",
    "light1Status",
    "light1Position",
    "light1Color",
    "light1Attenuation",
    "probeSamples",
    "rootSkeleton",
    "rootStrings",
  ]);
  return diagnostics.summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportDiagnostics({
    definitionIndex: optionValue(args, "--definitions", defaultDefinitionIndex),
    jsonOut: optionValue(args, "--json", defaultJsonOut),
    tsvOut: optionValue(args, "--tsv", defaultTsvOut),
    viewerOut: optionValue(args, "--viewer", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildDiagnostics,
  decodeMenuMeshLightProbeBlock,
  exportDiagnostics,
  menuMeshRootShape,
};
