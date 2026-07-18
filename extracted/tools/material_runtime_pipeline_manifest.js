#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PNG } = require("pngjs");

const { readGlbJson } = require("./glb_material_coverage_report");
const { parseCff0Buffer } = require("./cff0_tools");
const { analyzeShadergraph, extractNativeTch0SamplerBindings, reflectionModeForSampler } = require("./material_roles");
const {
  extractInlineColorConstants,
  extractTch0UniformDefaults,
  extractVaryingSources,
  previewUvAnimationForMaterial,
  previewUvAnimationGapInputsForMaterial,
  previewUvAnimationGapReasonForMaterial,
  previewUvAnimationInputsForRuntimeEvidence,
} = require("./effect_shadergraph_material_manifest");

const defaultManifestPath = "extracted/viewer/all-glb-pbr-manifest.json";
const defaultGlbRoot = "extracted/hero_assets_glb_textured_pbr";
const defaultShadergraphRoot = "extracted/hero_assets/shadergraphs";
const defaultMaterialTextureRoot = "extracted/hero_assets_material_textures_preview";
const defaultMaterialTextureMapPath = "extracted/reports/material_texture_map.json";
const defaultTsvOut = "extracted/reports/material_runtime_pipeline.tsv";
const defaultJsonOut = "extracted/reports/material_runtime_pipeline_summary.json";
const defaultViewerOut = "extracted/viewer/material-runtime-pipeline-manifest.json";

const runtimeOnlyRoles = new Set(["rimLighting", "uniformColor", "reflection", "lookup", "uvAnimation"]);
const opaqueAlphaRoleOverrides = new Set([
  "Characters/Hero027/Art/hero027.hero027Ring_mat.shadergraph",
]);
const viewerUvAnimationRuntimeModes = new Set([
  "scroll",
  "vec2Scroll",
  "scaleOffset",
  "multiScrollAdditive",
  "floorFractAtlasOffset",
  "viewDotScrollOffset",
  "dualScrollFresnelMask",
  "waterWallComposite",
  "uniformFloorAtlasOffset",
  "uniformAliasScaleOffset",
  "uniformVertexColorFractOffset",
]);

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readManifestItems(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
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

function normalizeRel(filePath) {
  return String(filePath || "").split(path.sep).join("/");
}

function normalizeShadergraphRel(materialName) {
  const rel = String(materialName || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  return rel.endsWith(".shadergraph") ? rel : "";
}

function shadergraphFilePathForMaterial(materialName, shadergraphRoot) {
  const shadergraphRel = normalizeShadergraphRel(materialName);
  return {
    shadergraphRel,
    shadergraphFilePath: shadergraphRel ? path.join(shadergraphRoot, shadergraphRel) : "",
  };
}

function roleNamesForAnalysis(analysis) {
  return Object.keys(analysis?.roles || {}).sort();
}

function roleHash(analysis, role) {
  return analysis?.roles?.[role]?.hash || "";
}

function viewerRelativeTexturePath(filePath) {
  return filePath ? normalizeRel(path.relative("extracted/viewer", filePath)) : "";
}

function materialTexturePreviewPath(shadergraphRel, role, materialTextureRoot = defaultMaterialTextureRoot) {
  if (!shadergraphRel || !role) return "";
  const base = shadergraphRel.replace(/\.shadergraph$/i, "");
  const suffix = role === "baseColor" ? "" : `.${role}`;
  for (const extension of [".png", ".webp"]) {
    const filePath = path.join(materialTextureRoot, `${base}${suffix}${extension}`);
    if (fs.existsSync(filePath)) return viewerRelativeTexturePath(filePath);
  }
  return viewerRelativeTexturePath(path.join(materialTextureRoot, `${base}${suffix}.png`));
}

function roleTexturePathsForAnalysis(shadergraphRel, analysis, materialTextureRoot = defaultMaterialTextureRoot) {
  const output = {};
  for (const role of roleNamesForAnalysis(analysis)) {
    const roleInfo = analysis?.roles?.[role];
    if (!roleInfo?.hash) continue;
    const texturePath = materialTexturePreviewPath(shadergraphRel, role, materialTextureRoot);
    if (texturePath) output[role] = texturePath;
  }
  return output;
}

function readMaterialTextureMapItems(filePath = defaultMaterialTextureMapPath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
}

function buildMaterialTextureLookup(filePath = defaultMaterialTextureMapPath) {
  const byShadergraph = new Map();
  const byHash = new Map();
  for (const item of readMaterialTextureMapItems(filePath)) {
    if (item?.shadergraph) byShadergraph.set(normalizeRel(item.shadergraph), item);
    const candidates = [];
    if (item?.texture && item?.hash) candidates.push({ texture: item.texture, hash: item.hash, role: "primary" });
    for (const textureInfo of Object.values(item?.textures || {})) {
      if (textureInfo?.texture && textureInfo?.hash) {
        candidates.push({ texture: textureInfo.texture, hash: textureInfo.hash, role: textureInfo.role || "" });
      }
    }
    for (const candidate of candidates) {
      if (!byHash.has(candidate.hash)) byHash.set(candidate.hash, []);
      byHash.get(candidate.hash).push({
        shadergraph: item.shadergraph || "",
        texture: candidate.texture,
        role: candidate.role,
      });
    }
  }
  for (const entries of byHash.values()) {
    entries.sort((left, right) => String(left.texture).localeCompare(String(right.texture)));
  }
  return { byShadergraph, byHash };
}

function samplerTextureBindingsForAnalysis(shadergraphFilePath, analysis, materialTextureLookup) {
  const samplerHashes = analysis?.samplerToHash || {};
  const shaderSamplers = [...new Set([...(analysis?.samplerTable || []), ...Object.keys(samplerHashes)])].sort();
  const entry = materialTextureLookup?.byShadergraph?.get(normalizeRel(shadergraphFilePath)) || null;
  const paths = {};
  const sources = {};

  for (const textureInfo of Object.values(entry?.textures || {})) {
    if (!textureInfo?.sampler || !textureInfo?.texture || !fs.existsSync(textureInfo.texture)) continue;
    if (!paths[textureInfo.sampler]) {
      paths[textureInfo.sampler] = viewerRelativeTexturePath(textureInfo.texture);
      sources[textureInfo.sampler] = textureInfo.role ? `same-shadergraph-role:${textureInfo.role}` : "same-shadergraph";
    }
  }

  for (const [sampler, hash] of Object.entries(samplerHashes)) {
    if (!sampler || !hash || paths[sampler]) continue;
    const sameShadergraphMatch = Object.values(entry?.textures || {}).find(
      (textureInfo) => textureInfo?.hash === hash && textureInfo?.texture && fs.existsSync(textureInfo.texture),
    );
    if (sameShadergraphMatch) {
      paths[sampler] = viewerRelativeTexturePath(sameShadergraphMatch.texture);
      sources[sampler] = sameShadergraphMatch.role
        ? `same-shadergraph-hash:${sameShadergraphMatch.role}`
        : "same-shadergraph-hash";
      continue;
    }

    const globalMatch = (materialTextureLookup?.byHash?.get(hash) || []).find((candidate) =>
      candidate?.texture ? fs.existsSync(candidate.texture) : false,
    );
    if (!globalMatch) continue;
    paths[sampler] = viewerRelativeTexturePath(globalMatch.texture);
    sources[sampler] = globalMatch.role ? `global-hash:${globalMatch.role}` : "global-hash";
  }

  return {
    hashes: samplerHashes,
    paths,
    sources,
    unhashedSamplers: shaderSamplers
      .filter((sampler) => !samplerHashes[sampler])
      .sort(),
    unresolvedSamplers: shaderSamplers
      .filter((sampler) => !paths[sampler])
      .sort(),
  };
}

function shadergraphUniformDeclarations(shaderText) {
  const declarations = [];
  const seen = new Set();
  const regex = /uniform\s+(?:lowp\s+|mediump\s+|highp\s+)?(sampler2D|vec[234]|float|mat[234])\s+([A-Za-z_]\w*)\s*;/g;
  for (const match of shaderText.matchAll(regex)) {
    const declaration = { type: match[1], name: match[2] };
    const key = `${declaration.type}:${declaration.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    declarations.push(declaration);
  }
  return declarations;
}

function shadergraphSamplerUseRecords(shaderText) {
  const records = [];
  const regex = /texture2D\s*\(\s*(sampler\d+)\s*,\s*([^)]+)\)/g;
  for (const match of shaderText.matchAll(regex)) {
    records.push({
      sampler: match[1],
      uv: match[2].replace(/\s+/g, " ").trim().slice(0, 120),
    });
  }
  return records;
}

function samplerUnitBindingsForShadergraph(shaderBuffer, shaderText) {
  if (!Buffer.isBuffer(shaderBuffer) || !shaderText) return {};
  const firstShaderIndex = String(shaderText || "").search(/precision\s+(?:lowp|mediump|highp)\s+float;/);
  const tableText = firstShaderIndex >= 0 ? shaderText.slice(0, firstShaderIndex) : shaderText;
  const firstSampler = /sampler\d+\x00/.exec(tableText);
  if (!firstSampler) return {};

  const firstRecordOffset = firstSampler.index - 1;
  const headerOffset = firstRecordOffset - 6;
  if (firstRecordOffset < 0 || headerOffset < 0) return {};
  const samplerCount = shaderBuffer[headerOffset];
  if (!Number.isInteger(samplerCount) || samplerCount <= 0 || samplerCount > 32) return {};

  const output = {};
  for (let index = 0; index < samplerCount; index += 1) {
    const offset = firstRecordOffset + index * 17;
    if (offset < 0 || offset + 17 > shaderBuffer.length) return {};
    const unit = shaderBuffer[offset];
    const rawName = shaderBuffer.subarray(offset + 1, offset + 17);
    const nulIndex = rawName.indexOf(0);
    const sampler = rawName.subarray(0, nulIndex >= 0 ? nulIndex : rawName.length).toString("ascii");
    if (!/^sampler\d+$/.test(sampler)) return {};
    output[sampler] = unit;
  }
  return output;
}

function isUpperHexAsciiByte(value) {
  return (value >= 0x30 && value <= 0x39) || (value >= 0x41 && value <= 0x46);
}

function isUpperHexAsciiRange(buffer, offset, length) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + length > buffer.length) return false;
  for (let index = 0; index < length; index += 1) {
    if (!isUpperHexAsciiByte(buffer[offset + index])) return false;
  }
  return true;
}

function firstTch0TextureHashRecordCount(shaderBuffer, maxRecords = 32) {
  if (!Buffer.isBuffer(shaderBuffer)) return 0;
  const tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"));
  if (tch0Offset < 0) return 0;
  const recordStart = tch0Offset + 0x18;
  let count = 0;
  while (count < maxRecords) {
    const offset = recordStart + count * 40;
    if (!isUpperHexAsciiRange(shaderBuffer, offset, 32)) break;
    count += 1;
  }
  return count;
}

function firstUpperHexAsciiRunOffset(buffer, start, end, length = 32) {
  if (!Buffer.isBuffer(buffer)) return -1;
  const boundedEnd = Math.min(end, buffer.length);
  for (let offset = start; offset + length <= boundedEnd; offset += 1) {
    if (isUpperHexAsciiRange(buffer, offset, length)) return offset;
  }
  return -1;
}

function textureHashRecordsAtOffset(shaderBuffer, recordStart, maxRecords = 32) {
  let recordCount = 0;
  while (recordCount < maxRecords) {
    const offset = recordStart + recordCount * 40;
    if (!isUpperHexAsciiRange(shaderBuffer, offset, 32)) break;
    recordCount += 1;
  }
  return recordCount;
}

function exactKnownHashMatchesAtOffset(shaderBuffer, recordStart, knownHashes = []) {
  let exactMatches = 0;
  for (const [index, hash] of knownHashes.entries()) {
    const offset = recordStart + index * 40;
    if (!hash || !isUpperHexAsciiRange(shaderBuffer, offset, 32)) break;
    if (shaderBuffer.subarray(offset, offset + 32).toString("ascii") !== hash) break;
    exactMatches += 1;
  }
  return exactMatches;
}

function knownHashTextureRecordLayout(shaderBuffer, tch0Offset, knownHashes = [], maxRecords = 32) {
  if (!knownHashes.length) return null;
  const defaultRecordStart = tch0Offset + 0x18;
  const scanEnd = Math.min(defaultRecordStart + 0x80, shaderBuffer.length);
  let best = null;
  for (let recordStart = defaultRecordStart; recordStart + 32 <= scanEnd; recordStart += 1) {
    const exactMatches = exactKnownHashMatchesAtOffset(shaderBuffer, recordStart, knownHashes);
    if (!exactMatches) continue;
    const recordCount = textureHashRecordsAtOffset(shaderBuffer, recordStart, maxRecords);
    if (recordCount < exactMatches) continue;
    const candidate = { recordStart, exactMatches, recordCount };
    if (
      !best ||
      candidate.exactMatches > best.exactMatches ||
      (candidate.exactMatches === best.exactMatches && candidate.recordCount > best.recordCount) ||
      (candidate.exactMatches === best.exactMatches &&
        candidate.recordCount === best.recordCount &&
        Math.abs(candidate.recordStart - defaultRecordStart) < Math.abs(best.recordStart - defaultRecordStart))
    ) {
      best = candidate;
    }
  }
  if (!best) return null;
  return {
    tch0Offset,
    recordStart: best.recordStart,
    recordCount: best.recordCount,
    recordStartDelta: best.recordStart - defaultRecordStart,
    scanMethod:
      best.recordStart === defaultRecordStart
        ? "tch0-payload-start-known-hash-match"
        : "tch0-prefixed-payload-known-hash-match",
    exactKnownHashMatches: best.exactMatches,
  };
}

function tch0TextureHashRecordLayout(shaderBuffer, maxRecords = 32, knownHashes = []) {
  if (!Buffer.isBuffer(shaderBuffer)) {
    return { tch0Offset: -1, recordStart: -1, recordCount: 0, recordStartDelta: 0, scanMethod: "missing-buffer" };
  }
  const tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"));
  if (tch0Offset < 0) {
    return { tch0Offset, recordStart: -1, recordCount: 0, recordStartDelta: 0, scanMethod: "missing-tch0" };
  }
  const defaultRecordStart = tch0Offset + 0x18;
  const knownLayout = knownHashTextureRecordLayout(shaderBuffer, tch0Offset, knownHashes, maxRecords);
  if (knownLayout) return knownLayout;
  const directCount = firstTch0TextureHashRecordCount(shaderBuffer, maxRecords);
  if (directCount > 0) {
    return {
      tch0Offset,
      recordStart: defaultRecordStart,
      recordCount: directCount,
      recordStartDelta: 0,
      scanMethod: "tch0-payload-start",
    };
  }
  const scannedStart = firstUpperHexAsciiRunOffset(
    shaderBuffer,
    defaultRecordStart,
    Math.min(defaultRecordStart + 0x80, shaderBuffer.length),
  );
  if (scannedStart < 0) {
    return {
      tch0Offset,
      recordStart: defaultRecordStart,
      recordCount: 0,
      recordStartDelta: 0,
      scanMethod: "no-hash-record-run",
    };
  }
  const recordCount = textureHashRecordsAtOffset(shaderBuffer, scannedStart, maxRecords);
  return {
    tch0Offset,
    recordStart: scannedStart,
    recordCount,
    recordStartDelta: scannedStart - defaultRecordStart,
    scanMethod: "tch0-prefixed-payload-hash-scan",
  };
}

function inlineRgbFloatLookupStats(shaderBuffer, offset) {
  const valueCount = 0xc0;
  if (!Buffer.isBuffer(shaderBuffer) || offset < 0 || offset + valueCount * 4 > shaderBuffer.length) return null;
  let rawMin = Infinity;
  let rawMax = -Infinity;
  let rawSum = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nonzero = 0;
  let nativeByteMin = Infinity;
  let nativeByteMax = -Infinity;
  let nativeByteSum = 0;
  let nativeByteNonzero = 0;
  let nativeClampApplied = false;
  for (let index = 0; index < valueCount; index += 1) {
    const value = shaderBuffer.readFloatLE(offset + index * 4);
    if (!Number.isFinite(value) || value < -4 || value > 4) return null;
    rawMin = Math.min(rawMin, value);
    rawMax = Math.max(rawMax, value);
    rawSum += value;
    if (value < 0 || value > 1) nativeClampApplied = true;
    const normalized = Math.max(0, value);
    min = Math.min(min, normalized);
    max = Math.max(max, normalized);
    sum += normalized;
    if (normalized > 0.000001) nonzero += 1;
    const nativeByte = Math.max(0, Math.min(255, Math.round(value * 255)));
    nativeByteMin = Math.min(nativeByteMin, nativeByte);
    nativeByteMax = Math.max(nativeByteMax, nativeByte);
    nativeByteSum += nativeByte;
    if (nativeByte > 0) nativeByteNonzero += 1;
  }
  if (!nativeByteNonzero || nativeByteMax <= 0) return null;
  return {
    width: 64,
    height: 1,
    components: 3,
    valueCount,
    rawMin: roundedCoverage(rawMin),
    rawMax: roundedCoverage(rawMax),
    rawAverage: roundedCoverage(rawSum / valueCount),
    min: roundedCoverage(min),
    max: roundedCoverage(max),
    average: roundedCoverage(sum / valueCount),
    nonzeroValues: nonzero,
    nativeClampApplied,
    nativeByteMin,
    nativeByteMax,
    nativeByteAverage: roundedCoverage(nativeByteSum / valueCount),
    nativeByteNonzeroValues: nativeByteNonzero,
  };
}

function escapeRegexLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fogOfWarRuntimeSamplerUsage(shaderText, sampler) {
  const text = String(shaderText || "");
  if (!text.includes("FogOfWar.Texture")) return null;
  if (!text.includes("FogOfWar.TranslateAndScale")) return null;
  const samplePattern = new RegExp(
    `texture2D\\s*\\(\\s*${escapeRegexLiteral(sampler)}\\s*,\\s*(var\\d+)\\s*\\)\\s*\\.x`,
    "s",
  );
  const match = text.match(samplePattern);
  if (!match) return null;
  return {
    semantic: "FogOfWar.Texture",
    transformSemantic: "FogOfWar.TranslateAndScale",
    channel: "x",
    uvVarying: match[1],
  };
}

function runtimeSamplerRecordsForShadergraph(shaderBuffer, analysis, samplerUnits, shaderText = "") {
  if (!Buffer.isBuffer(shaderBuffer) || !analysis) return [];
  const tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"));
  if (tch0Offset < 0) return [];

  const samplerOrder = Object.entries(samplerUnits || {})
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .map(([sampler]) => sampler);
  if (!samplerOrder.length) return [];

  const knownHashesInSamplerOrder = samplerOrder.map((sampler) => analysis?.samplerToHash?.[sampler] || "").filter(Boolean);
  const textureHashRecordLayout = tch0TextureHashRecordLayout(
    shaderBuffer,
    samplerOrder.length,
    knownHashesInSamplerOrder,
  );
  const textureHashRecordCount = textureHashRecordLayout.recordCount;
  const inlineLookupOffset = textureHashRecordLayout.recordStart + textureHashRecordCount * 40;
  const inlineLookupStats = inlineRgbFloatLookupStats(shaderBuffer, inlineLookupOffset);
  const nativeSamplerBindings = analysis?.nativeSamplerBindings || extractNativeTch0SamplerBindings(shaderBuffer);
  const nativeInlineRecordsBySampler = new Map(
    (nativeSamplerBindings?.inlineTextureRecords || [])
      .filter((record) => record.sampler)
      .map((record) => [record.sampler, record]),
  );
  const samplerToHash = analysis?.samplerToHash || {};
  const records = [];

  for (const [samplerIndex, sampler] of samplerOrder.entries()) {
    if (samplerToHash[sampler]) continue;
    const isFirstUnhashedSamplerAfterTextureRecords = samplerIndex === textureHashRecordCount;
    const fogOfWarUsage = fogOfWarRuntimeSamplerUsage(shaderText, sampler);
    const nativeInlineRecord = nativeInlineRecordsBySampler.get(sampler) || null;
    const nativeInlineStats = nativeInlineRecord ? inlineRgbFloatLookupStats(shaderBuffer, nativeInlineRecord.offset) : null;
    let kind = "unhashed-runtime-sampler-unclassified";
    let recordInlineLookupOffset = null;
    let recordInlineLookupStats = null;
    let recordSource = "shadergraph sampler table without matching texture hash record";
    if (nativeInlineStats) {
      kind = nativeInlineStats.nativeClampApplied ? "tch0-inline-rgb-float-lookup-clamped" : "tch0-inline-rgb-float-lookup";
      recordInlineLookupOffset = nativeInlineRecord.offset;
      recordInlineLookupStats = nativeInlineStats;
      recordSource = "Current Android TCH0 inline texture section unit -> compiled sampler unit -> 64x1 RGB texture";
    } else if (isFirstUnhashedSamplerAfterTextureRecords && inlineLookupStats) {
      kind =
        textureHashRecordLayout.scanMethod.startsWith("tch0-prefixed")
          ? "tch0-inline-rgb-float-lookup-prefixed-hash-table-diagnostic"
          : inlineLookupStats.nativeClampApplied
            ? "tch0-inline-rgb-float-lookup-clamped"
            : "tch0-inline-rgb-float-lookup";
      recordInlineLookupOffset = /tch0-inline-rgb-float-lookup/.test(kind) ? inlineLookupOffset : null;
      recordInlineLookupStats = /tch0-inline-rgb-float-lookup/.test(kind) ? inlineLookupStats : null;
      recordSource =
        kind === "tch0-inline-rgb-float-lookup"
          ? "FUN_019989f8-style 0xC0 float -> 64x1 RGB texture"
          : kind === "tch0-inline-rgb-float-lookup-clamped"
            ? "Current Android 0x189e590-style 0xC0 float -> byte clamp -> 64x1 RGB texture"
            : "TCH0 payload contains native parameter prefix before texture hash records; inline lookup is diagnostic-only until the native parser section layout is fully mapped";
    } else if (fogOfWarUsage) {
      kind = "runtime-fog-of-war-texture-diagnostic";
      recordSource = "Android FUN_00934d64 binds FogOfWar.Texture and FogOfWar.TranslateAndScale as runtime scene state";
    }
    records.push({
      sampler,
      unit: samplerUnits?.[sampler],
      samplerIndex,
      textureHashRecordCount,
      textureHashRecordStartDelta: textureHashRecordLayout.recordStartDelta,
      textureHashRecordScanMethod: textureHashRecordLayout.scanMethod,
      textureHashRecordExactKnownHashMatches: textureHashRecordLayout.exactKnownHashMatches || 0,
      nativeInlineTextureUnit: nativeInlineRecord?.unit ?? null,
      nativeInlineTextureOffset: nativeInlineRecord?.offset ?? null,
      kind,
      runtimeSceneTextureUsage: fogOfWarUsage,
      source: recordSource,
      inlineLookupOffset: recordInlineLookupOffset,
      inlineLookupStats: recordInlineLookupStats,
    });
  }

  return records;
}

function isRuntimeResolvedSamplerRecord(record) {
  if (!record?.sampler) return false;
  if (record.kind === "runtime-fog-of-war-texture-diagnostic") return Boolean(record.runtimeSceneTextureUsage);
  if (record.kind !== "tch0-inline-rgb-float-lookup" && record.kind !== "tch0-inline-rgb-float-lookup-clamped") {
    return false;
  }
  return Number.isFinite(Number(record.inlineLookupOffset)) && Boolean(record.inlineLookupStats);
}

function samplerTextureBindingsWithRuntimeResolution(samplerTextureBindings, runtimeSamplerRecords) {
  const texturePathMissingSamplers = samplerTextureBindings?.unresolvedSamplers || [];
  const runtimeResolvedSamplers = uniqueInOrder(
    (runtimeSamplerRecords || [])
      .filter(isRuntimeResolvedSamplerRecord)
      .map((record) => record.sampler)
      .filter((sampler) => texturePathMissingSamplers.includes(sampler)),
  );
  const runtimeResolvedSamplerSet = new Set(runtimeResolvedSamplers);
  return {
    ...samplerTextureBindings,
    texturePathMissingSamplers,
    runtimeResolvedSamplers,
    unresolvedSamplers: texturePathMissingSamplers.filter((sampler) => !runtimeResolvedSamplerSet.has(sampler)),
  };
}

function uniqueInOrder(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function nativeUniformBindingsForShadergraph(shaderBuffer, shaderText) {
  if (!Buffer.isBuffer(shaderBuffer) || !shaderText) return [];
  const firstShaderIndex = String(shaderText || "").search(/precision\s+(?:lowp|mediump|highp)\s+float;/);
  const tableText = firstShaderIndex >= 0 ? shaderText.slice(0, firstShaderIndex) : shaderText;
  const semanticMatches = [
    ...tableText.matchAll(/\b(OmniLight\.(?:Position|Color|Attenuation)|Probe\.Samples)\x00/g),
  ];
  if (!semanticMatches.length) return [];

  const tableStart = semanticMatches[0].index - 5;
  if (tableStart < 0) return [];

  const records = [];
  for (let index = 0; index < 64; index += 1) {
    const offset = tableStart + index * 35;
    if (offset < 0 || offset + 35 > shaderBuffer.length) break;
    const rawName = shaderBuffer.subarray(offset + 5, offset + 35);
    const nulIndex = rawName.indexOf(0);
    const semantic = rawName.subarray(0, nulIndex >= 0 ? nulIndex : rawName.length).toString("ascii");
    if (!/^(OmniLight\.(Position|Color|Attenuation)|Probe\.Samples)$/.test(semantic)) break;
    records.push({
      semantic,
      arrayIndex: shaderBuffer[offset + 4],
      recordIndex: shaderBuffer[offset + 3],
      recordHeaderHex: shaderBuffer.subarray(offset, offset + 5).toString("hex"),
    });
  }
  if (!records.length) return [];

  const uniformNames = uniqueInOrder([...tableText.matchAll(/unif\d+(?=\x00)/g)].map((match) => match[0]));
  return records.map((record, index) => ({
    uniform: uniformNames[record.recordIndex] || uniformNames[index] || "",
    ...record,
  }));
}

function nativeShaderBlockerForMode(nativeShaderMode, rimLookupGlow, nativeUniformBindings = [], creatureLookupLit = null) {
  if (
    !nativeShaderMode ||
    nativeShaderMode === "sampled-color" ||
    nativeShaderMode === "vertex-color-direct" ||
    nativeShaderMode === "constant-fragment-color" ||
    nativeShaderMode === "vertex-color-alpha-direct"
  ) {
    return "";
  }
  if (nativeShaderMode === "character-lit-reflection-probe") {
    const semantics = new Set((nativeUniformBindings || []).map((binding) => binding.semantic));
    return semantics.has("OmniLight.Position") && semantics.has("Probe.Samples")
      ? "runtime-light-probe-values-unresolved"
      : "runtime-light-probe-bindings-unresolved";
  }
  if (nativeShaderMode === "solid-lit-runtime-lights") {
    const semantics = new Set((nativeUniformBindings || []).map((binding) => binding.semantic));
    return semantics.has("OmniLight.Position") || semantics.has("Probe.Samples")
      ? "runtime-light-probe-values-unresolved"
      : "runtime-light-probe-bindings-unresolved";
  }
  if (nativeShaderMode === "vertex-alpha-uniform-color") return "runtime-uniform-values-unresolved";
  if (nativeShaderMode === "creature-lookup-lit") return creatureLookupLit?.canRenderNatively ? "" : "multi-sampler-lookup-lighting-unported";
  if (nativeShaderMode === "view-dot-sampler-ramp" && !rimLookupGlow) return "view-dot-ramp-not-classified";
  if (nativeShaderMode === "unknown") return "native-shader-mode-unknown";
  return "";
}

function nativeShaderBlockerForInputs(
  nativeShaderMode,
  rimLookupGlow,
  viewDotRamp,
  nativeUniformBindings = [],
  creatureLookupLit = null,
  vertexAlphaUniformColor = null,
) {
  if (nativeShaderMode === "view-dot-sampler-ramp") {
    if (rimLookupGlow || viewDotRamp?.canRenderNatively) return "";
    return "view-dot-ramp-not-classified";
  }
  if (nativeShaderMode === "vertex-alpha-uniform-color") {
    return vertexAlphaUniformColor?.canRenderNatively ? "" : "runtime-uniform-values-unresolved";
  }
  return nativeShaderBlockerForMode(nativeShaderMode, rimLookupGlow, nativeUniformBindings, creatureLookupLit);
}

function nativeShaderInputsForShadergraph(
  nativeShaderMode,
  shaderText,
  analysis,
  samplerBindings,
  rimLookupGlow,
  nativeUniformBindings,
  samplerUnits,
  runtimeSamplerRecords,
  viewDotRamp = null,
  creatureLookupLit = null,
  uniformDefaults = {},
) {
  if (!nativeShaderMode) return null;
  const declarations = shadergraphUniformDeclarations(shaderText);
  const uniforms = declarations.filter((declaration) => declaration.type !== "sampler2D").map((declaration) => declaration.name);
  const samplers = declarations.filter((declaration) => declaration.type === "sampler2D").map((declaration) => declaration.name);
  const roleSamplers = {};
  for (const [role, roleInfo] of Object.entries(analysis?.roles || {})) {
    if (roleInfo?.sampler) roleSamplers[role] = roleInfo.sampler;
  }
  const samplerUses = shadergraphSamplerUseRecords(shaderText);
  const constantFragmentColor = constantFragmentColorForShadergraph(shaderText);
  const vertexColorAlphaFragment = vertexColorAlphaFragmentForShadergraph(shaderText);
  const vertexAlphaUniformColor = vertexAlphaUniformColorForShadergraph(shaderText, uniformDefaults);
  const solidLitRuntimeLights = solidLitRuntimeLightsForShadergraph(shaderText, nativeUniformBindings);
  const characterLitFormula =
    nativeShaderMode === "character-lit-reflection-probe"
      ? characterLitReflectionProbeFormulaForShadergraph(shaderText, analysis, nativeUniformBindings, runtimeSamplerRecords)
      : null;
  const blocker = nativeShaderBlockerForInputs(
    nativeShaderMode,
    rimLookupGlow,
    viewDotRamp,
    nativeUniformBindings,
    creatureLookupLit,
    vertexAlphaUniformColor,
  );
  return {
    mode: nativeShaderMode,
    blocker,
    canRenderNatively: !blocker,
    roleSamplers,
    samplers,
    samplerUnits: samplerUnits || {},
    runtimeSamplerRecords: runtimeSamplerRecords || [],
    viewDotRamp,
    creatureLookupLit,
    constantFragmentColor,
    vertexColorAlphaFragment,
    vertexAlphaUniformColor,
    characterLitFormula,
    solidLitRuntimeLights,
    samplerTextureCoverage: `${Object.keys(samplerBindings.paths || {}).length}/${samplers.length}`,
    unresolvedSamplers: samplerBindings.unresolvedSamplers || [],
    runtimeUniforms: uniforms.filter((name) => /^unif\d+$/.test(name)),
    runtimeUniformBindings: nativeUniformBindings || [],
    builtins: uniforms.filter((name) => !/^unif\d+$/.test(name)),
    samplerUses,
    featureFlags: {
      eyeToWorldMatrix: /_Eye2WorldMatrix/.test(shaderText),
      tangentNormal: /_NormalMatrix/.test(shaderText) && Boolean(roleSamplers.normal),
      viewDotLookup: /dot\s*\(\s*normalize\s*\(\s*-\s*\(/s.test(shaderText),
      powSpecular: /pow\s*\(/.test(shaderText),
      reflectionVectorLookup: /texture2D\s*\(\s*sampler\d+\s*,\s*\(\(tmpvar_\d+\.xy\s*\*/s.test(shaderText),
    },
  };
}

function recommendedAlphaModeForRoles(analysis, roleNames = roleNamesForAnalysis(analysis)) {
  const roles = new Set(roleNames);
  if (roles.has("alphaBlend")) return "BLEND";
  if (roles.has("alphaMask")) return "MASK";
  return "OPAQUE";
}

function nameSet(value) {
  return new Set(String(value || "").split("|").filter(Boolean));
}

function unimplementedRoleNamesForAnalysis(analysis, { reflectionMode = "" } = {}) {
  const roles = new Set(roleNamesForAnalysis(analysis));
  const implementedRoles = new Set();
  if (reflectionMode) {
    implementedRoles.add("reflection");
    implementedRoles.add("lookup");
  }
  return [...roles].filter((role) => {
    return ["reflection", "lookup", "uvAnimation", "uniformColor", "vertexColor"].includes(role) && !implementedRoles.has(role);
  });
}

function colorModeForMaterial(row, analysis, shadergraphRel) {
  const name = String(shadergraphRel || row?.materialName || "").toLowerCase();
  const materialName = name.replace(/\.shadergraph$/, "").split(".").pop() || "";
  const roles = new Set(roleNamesForAnalysis(analysis));
  if (
    /watershader|wateropaque|poolwater/.test(materialName) ||
    /^water_(?:sigil_)?(?:ally|enemy)_mat$/.test(materialName)
  ) {
    return "water";
  }
  if (name.includes("guob")) return "guob";
  if (name.includes("bowalpha") || name.includes("bowstring")) return "bowstring";
  if (roles.has("vertexColor")) return "vertex-color";
  if (roles.has("uniformColor")) return "inline-uniform";
  return "";
}

function implementedColorRolesForMode(colorMode) {
  const roles = new Set();
  if (colorMode === "inline-uniform") roles.add("uniformColor");
  if (colorMode === "vertex-color" || colorMode === "vertexColorAlpha") roles.add("vertexColor");
  if (colorMode === "water" || colorMode === "guob" || colorMode === "bowstring") {
    roles.add("uniformColor");
    roles.add("vertexColor");
  }
  return roles;
}

function hasNumberArray(value, length) {
  return Array.isArray(value) && value.length === length && value.every((part) => Number.isFinite(Number(part)));
}

function hasSamplerTexturePaths(samplerTexturePaths, samplerNames) {
  return samplerNames.every((sampler) => sampler && samplerTexturePaths[sampler]);
}

function viewerCanApplySampledUvComposite(previewUvAnimation, uvAnimationCompositeFormula, samplerTexturePaths = {}) {
  const mode = String(previewUvAnimation?.mode || "");
  const className = String(uvAnimationCompositeFormula?.className || "");
  if (!["sampledDistort", "sampledFractOffsetDistort"].includes(mode)) return false;
  if (!hasNumberArray(uvAnimationCompositeFormula?.baseUvRepeat, 2)) return false;
  if (!hasNumberArray(uvAnimationCompositeFormula?.distortionUvRepeat, 2)) return false;
  if (!hasSamplerTexturePaths(samplerTexturePaths, [previewUvAnimation.baseSampler, previewUvAnimation.distortionSampler])) return false;
  if (className === "base-plus-base-times-sampled-color-scale") {
    return mode === "sampledDistort" && hasNumberArray(uvAnimationCompositeFormula.colorScale, 3);
  }
  if (className === "base-plus-base-times-sampled-color-mask") {
    return mode === "sampledDistort" && Boolean(uvAnimationCompositeFormula.maskChannel);
  }
  if (className === "sampled-channel-times-secondary-texture") {
    return (
      mode === "sampledDistort" &&
      hasNumberArray(uvAnimationCompositeFormula.colorScale, 3) &&
      ["x", "y", "z", "w"].includes(uvAnimationCompositeFormula.channel) &&
      hasNumberArray(uvAnimationCompositeFormula.secondaryUvRepeat, 2) &&
      hasSamplerTexturePaths(samplerTexturePaths, [uvAnimationCompositeFormula.secondarySampler])
    );
  }
  if (className === "sampled-offset-field-for-secondary-sampler") {
    return (
      ["sampledDistort", "sampledFractOffsetDistort"].includes(mode) &&
      hasNumberArray(uvAnimationCompositeFormula.secondaryUvRepeat, 2) &&
      hasSamplerTexturePaths(samplerTexturePaths, [uvAnimationCompositeFormula.secondarySampler])
    );
  }
  if (className === "sampled-threshold-mask") {
    return (
      mode === "sampledFractOffsetDistort" &&
      hasNumberArray(uvAnimationCompositeFormula.lookupUvRepeat, 2) &&
      Array.isArray(uvAnimationCompositeFormula.lookupRamp?.ramp) &&
      uvAnimationCompositeFormula.lookupRamp.ramp.length === 64
    );
  }
  return false;
}

function hasInlineRamp(value) {
  return Array.isArray(value?.ramp) && value.ramp.length === 64;
}

function viewerCanApplyNestedSampledWaterComposite(previewUvAnimation, uvAnimationCompositeFormula, samplerTexturePaths = {}) {
  if (String(previewUvAnimation?.mode || "") !== "nestedSampledUvDistort") return false;
  const className = String(uvAnimationCompositeFormula?.className || "");
  if (!hasNumberArray(uvAnimationCompositeFormula?.distortionUvRepeat, 2)) return false;
  if (!hasNumberArray(uvAnimationCompositeFormula?.distortionMaskUvRepeat, 2)) return false;
  if (!hasNumberArray(uvAnimationCompositeFormula?.nestedBaseUvRepeat, 2)) return false;
  if (
    !hasSamplerTexturePaths(samplerTexturePaths, [
      previewUvAnimation.distortionSampler,
      uvAnimationCompositeFormula.distortionMaskSampler,
      previewUvAnimation.baseSampler,
    ])
  ) {
    return false;
  }
  if (className === "base-plus-nested-sampled-color") {
    return (
      hasNumberArray(uvAnimationCompositeFormula.baseColorUvRepeat, 2) &&
      hasNumberArray(uvAnimationCompositeFormula.reflectionUvScale, 2) &&
      hasInlineRamp(uvAnimationCompositeFormula.baseColorRamp) &&
      hasSamplerTexturePaths(samplerTexturePaths, [uvAnimationCompositeFormula.reflectionLookupSampler])
    );
  }
  if (className === "nested-water-throne-reveal") {
    return hasNumberArray(uvAnimationCompositeFormula.constantBaseColor, 3);
  }
  return false;
}

function viewerCanApplyUvAnimation(previewUvAnimation, uvAnimationCompositeFormula = null, samplerTexturePaths = {}) {
  if (viewerUvAnimationRuntimeModes.has(String(previewUvAnimation?.mode || ""))) return true;
  return (
    viewerCanApplySampledUvComposite(previewUvAnimation, uvAnimationCompositeFormula, samplerTexturePaths) ||
    viewerCanApplyNestedSampledWaterComposite(previewUvAnimation, uvAnimationCompositeFormula, samplerTexturePaths)
  );
}

function unimplementedRoleNamesForRow(
  analysis,
  { reflectionMode = "", colorMode = "", previewUvAnimation = null, uvAnimationCompositeFormula = null, samplerTexturePaths = {} } = {},
) {
  const roles = new Set(roleNamesForAnalysis(analysis));
  const implementedRoles = implementedColorRolesForMode(colorMode);
  if (reflectionMode) {
    implementedRoles.add("reflection");
    implementedRoles.add("lookup");
  }
  if (viewerCanApplyUvAnimation(previewUvAnimation, uvAnimationCompositeFormula, samplerTexturePaths)) {
    implementedRoles.add("uvAnimation");
  }
  return [...roles].filter((role) => {
    return ["reflection", "lookup", "uvAnimation", "uniformColor", "vertexColor"].includes(role) && !implementedRoles.has(role);
  });
}

function glbRoleGaps(material, analysis) {
  const pbr = material?.pbrMetallicRoughness || {};
  const roles = analysis?.roles || {};
  const gaps = [];
  if (roles.baseColor && !pbr.baseColorTexture) gaps.push("baseColor");
  if (roles.normal && !material?.normalTexture) gaps.push("normal");
  if (roles.emissive && !material?.emissiveTexture) gaps.push("emissive");
  if ((roles.alphaMask || roles.alphaBlend) && material?.alphaMode !== "BLEND" && material?.alphaMode !== "MASK") gaps.push("alpha");
  return gaps;
}

function runtimeOnlyRoleNames(analysis) {
  return roleNamesForAnalysis(analysis).filter((role) => runtimeOnlyRoles.has(role));
}

function texturePathExistsFromViewer(texturePath) {
  return texturePath ? fs.existsSync(path.join("extracted/viewer", texturePath)) : false;
}

function roundedCoverage(value) {
  return Math.round(value * 10000) / 10000;
}

function alphaMaskStatsForTexturePath(texturePath, cache) {
  if (!texturePath) return null;
  const cacheKey = `alpha-mask-stats:${texturePath}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const filePath = path.join("extracted/viewer", texturePath);
  if (!fs.existsSync(filePath)) {
    cache.set(cacheKey, null);
    return null;
  }

  try {
    const png = PNG.sync.read(fs.readFileSync(filePath));
    const total = Math.max(png.width * png.height, 1);
    let min = 255;
    let max = 0;
    let sum = 0;
    let transparent = 0;
    let opaque = 0;
    for (let offset = 0; offset < png.data.length; offset += 4) {
      const alpha = png.data[offset + 1];
      min = Math.min(min, alpha);
      max = Math.max(max, alpha);
      sum += alpha;
      if (alpha <= 16) transparent += 1;
      if (alpha >= 240) opaque += 1;
    }
    const stats = {
      min,
      max,
      average: roundedCoverage(sum / (total * 255)),
      transparentCoverage: roundedCoverage(transparent / total),
      opaqueCoverage: roundedCoverage(opaque / total),
    };
    cache.set(cacheKey, stats);
    return stats;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}

function shadergraphPassStateRecords(shadergraphFilePath, cache) {
  if (!shadergraphFilePath) return [];
  const cacheKey = `pass-state:${shadergraphFilePath}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const output = [];
  try {
    const buffer = fs.readFileSync(shadergraphFilePath);
    const cff0Offset = buffer.indexOf(Buffer.from("CFF0", "ascii"));
    if (cff0Offset < 0) {
      cache.set(cacheKey, output);
      return output;
    }

    const parsed = parseCff0Buffer(buffer.subarray(cff0Offset));
    for (const [passIndex, chunk] of parsed.chunks.filter((item) => item.magic === "SHD0").entries()) {
      const payload = buffer.subarray(cff0Offset + chunk.payloadOffset, cff0Offset + chunk.payloadOffset + chunk.payloadSize);
      const tch0Offset = payload.indexOf(Buffer.from("TCH0", "ascii"));
      if (tch0Offset < 0 || tch0Offset + 24 > payload.length) continue;
      const stateBytes = payload.subarray(tch0Offset + 8, tch0Offset + 24);
      output.push({
        passIndex,
        shdPrefix: payload.subarray(0, 4).toString("hex"),
        tch0StateHex: stateBytes.toString("hex"),
        state0: stateBytes.readUInt32LE(0),
        state1: stateBytes.readUInt32LE(4),
        state2: stateBytes.readUInt32LE(8),
        state3: stateBytes.readUInt32LE(12),
      });
    }
  } catch {
    // Keep malformed or unfamiliar shadergraphs diagnostic-only.
  }

  cache.set(cacheKey, output);
  return output;
}

function shadergraphPassStateSignatures(records) {
  return [...new Set((records || []).map((record) => record.tch0StateHex).filter(Boolean))].sort();
}

function shadergraphPassStateFamily(records) {
  const leadingStates = new Set(
    (records || []).map((record) => String(record.tch0StateHex || "").slice(0, 8)).filter(Boolean),
  );
  if (!leadingStates.size) return "";
  if (leadingStates.size === 1) return `state-${[...leadingStates][0]}`;
  return `mixed-${[...leadingStates].sort().join("-")}`;
}

function shadergraphPassStateWordHexValues(records, wordIndex) {
  const start = wordIndex * 8;
  return [
    ...new Set(
      (records || [])
        .map((record) => String(record.tch0StateHex || "").slice(start, start + 8))
        .filter((value) => value.length === 8),
    ),
  ].sort();
}

function shadergraphPassStateWordColumns(records) {
  return {
    shaderPassStateWord0s: shadergraphPassStateWordHexValues(records, 0).join("|"),
    shaderPassStateWord1s: shadergraphPassStateWordHexValues(records, 1).join("|"),
    shaderPassStateWord2s: shadergraphPassStateWordHexValues(records, 2).join("|"),
    shaderPassStateWord3s: shadergraphPassStateWordHexValues(records, 3).join("|"),
  };
}

function decodeNativeRenderStateWord0(rawWord0) {
  if (!/^[0-9a-f]{8}$/i.test(String(rawWord0 || ""))) return null;
  const buffer = Buffer.from(rawWord0, "hex");
  const value = buffer.readUInt32LE(0);
  const srcRgbFactorIndex = (value >> 16) & 0xf;
  const dstRgbFactorIndex = (value >> 20) & 0xf;
  const srcAlphaFactorIndex = (value >> 24) & 0xf;
  const dstAlphaFactorIndex = (value >> 28) & 0xf;
  const depthFuncIndex = (value >> 7) & 7;
  const blendEnabled = !(srcRgbFactorIndex === 1 && dstRgbFactorIndex === 0 && srcAlphaFactorIndex === 1 && dstAlphaFactorIndex === 0);
  const blendPreset =
    !blendEnabled
      ? "disabled"
      : srcRgbFactorIndex === 1 && dstRgbFactorIndex === 3 && srcAlphaFactorIndex === 0 && dstAlphaFactorIndex === 0
        ? "premultiplied-alpha-rgb"
        : srcRgbFactorIndex === 2 && dstRgbFactorIndex === 3 && srcAlphaFactorIndex === 2 && dstAlphaFactorIndex === 3
          ? "alpha"
          : srcRgbFactorIndex === 1 && dstRgbFactorIndex === 1 && srcAlphaFactorIndex === 1 && dstAlphaFactorIndex === 1
            ? "additive-one-one"
            : "custom";
  return {
    source: "native-render-state-word0",
    rawWord0: String(rawWord0).toLowerCase(),
    valueHex: `0x${value.toString(16).padStart(8, "0")}`,
    cullModeIndex: value & 3,
    colorMask: {
      r: Boolean((value >> 2) & 1),
      g: Boolean((value >> 3) & 1),
      b: Boolean((value >> 4) & 1),
      a: Boolean((value >> 5) & 1),
    },
    depthWrite: Boolean((value >> 6) & 1),
    depthTest: depthFuncIndex !== 7,
    depthFuncIndex,
    rgbBlendOpIndex: (value >> 10) & 7,
    alphaBlendOpIndex: (value >> 13) & 7,
    srcRgbFactorIndex,
    dstRgbFactorIndex,
    srcAlphaFactorIndex,
    dstAlphaFactorIndex,
    blendEnabled,
    blendPreset,
  };
}

function shadergraphPassRenderState(records) {
  const states = shadergraphPassStateWordHexValues(records, 0)
    .map((rawWord0) => decodeNativeRenderStateWord0(rawWord0))
    .filter(Boolean);
  if (!states.length) return null;
  return {
    source: "android-gl-and-ios-metal-state-bit-layout",
    states,
  };
}

function renderStateBooleanSummary(renderState, key) {
  const values = new Set((renderState?.states || []).map((state) => state[key]).filter((value) => typeof value === "boolean"));
  if (!values.size) return "";
  if (values.size > 1) return "mixed";
  return values.has(true) ? "yes" : "no";
}

function renderStateStringSummary(renderState, key) {
  const values = [...new Set((renderState?.states || []).map((state) => state[key]).filter(Boolean))].sort();
  return values.join("|");
}

function alphaExecutionModeForRow({ roleNames, missingGlbRoleNames, roleTexturePaths = {} }) {
  const roles = new Set(roleNames || []);
  if (!roles.has("alphaMask") && !roles.has("alphaBlend")) return "none";
  if ((missingGlbRoleNames || []).includes("alpha")) {
    const runtimeAlphaTexturePath = roleTexturePaths.alphaMask || roleTexturePaths.alphaBlend || "";
    return texturePathExistsFromViewer(runtimeAlphaTexturePath) ? "runtime" : "diagnostic";
  }
  return "runtime";
}

function alphaRuntimeStageForRow({ roleNames, missingGlbRoleNames, roleTexturePaths = {}, alphaMaskStats = null }) {
  const roles = new Set(roleNames || []);
  if (!roles.has("alphaMask") && !roles.has("alphaBlend")) return "none";
  const runtimeAlphaTexturePath = roleTexturePaths.alphaMask || roleTexturePaths.alphaBlend || "";
  if ((missingGlbRoleNames || []).includes("alpha") && !texturePathExistsFromViewer(runtimeAlphaTexturePath)) {
    return "blocked-missing-alpha-texture";
  }
  if (alphaMaskStats?.opaqueCoverage >= 0.995 && alphaMaskStats?.transparentCoverage <= 0.001) {
    return "runtime-opaque-mask";
  }
  if (runtimeAlphaTexturePath) return "runtime-alpha-mask";
  return "runtime-glb-alpha";
}

function colorExecutionModeForRow({ colorMode, roleNames, missingGlbRoleNames, roleTexturePaths = {} }) {
  if (!colorMode) return "none";
  if (colorMode === "rimLookupGlow") return "runtime";
  if (["water", "guob", "bowstring"].includes(colorMode)) {
    const alphaMode = alphaExecutionModeForRow({ roleNames, missingGlbRoleNames, roleTexturePaths });
    return alphaMode === "diagnostic" ? "diagnostic" : "runtime";
  }
  return "runtime";
}

function reflectionExecutionModeForRow({ roleNames, roleTexturePaths, reflectionMode }) {
  const roles = new Set(roleNames || []);
  if (!roles.has("reflection") && !roles.has("lookup")) return "none";
  const reflectionTexturePath = roleTexturePaths.reflection || roleTexturePaths.lookup || "";
  if (!reflectionMode || !texturePathExistsFromViewer(reflectionTexturePath)) return "diagnostic";
  return "runtime";
}

function uvAnimationExecutionModeForRow({ roleNames, previewUvAnimation, uvAnimationGapReason, unimplementedRoleNames }) {
  const roles = new Set(roleNames || []);
  if (!roles.has("uvAnimation")) return "none";
  if (uvAnimationGapReason) return "diagnostic";
  if (nameSet(unimplementedRoleNames).has("uvAnimation")) return "diagnostic";
  if (!previewUvAnimation?.mode) return "diagnostic";
  return "runtime";
}

function uvAnimationModeForRow(previewUvAnimation) {
  return String(previewUvAnimation?.mode || "");
}

function uvAnimationRuntimeBlockerForMode(mode) {
  if (mode === "sampledDistort" || mode === "sampledFractOffsetDistort") {
    return "sampled-distortion-composite-formula-unresolved";
  }
  if (mode === "nestedSampledUvDistort") return "nested-sampled-distortion-composite-formula-unresolved";
  return "";
}

function roundedRampValue(value) {
  return Math.round(value * 1000000) / 1000000;
}

function rimLookupGlowForShadergraph(shaderBuffer, shaderText, analysis) {
  if (!Buffer.isBuffer(shaderBuffer) || !shaderText) return null;
  if ((analysis?.hashes || []).length) return null;
  const samplers = analysis?.samplerTable?.length ? analysis.samplerTable : analysis?.uniformSamplers || [];
  if (samplers.length !== 1) return null;
  const sampler = samplers[0];
  if (
    !new RegExp(`uniform\\s+sampler2D\\s+${sampler}\\s*;`).test(shaderText) ||
    !/dot\s*\(\s*normalize\s*\(\s*-\s*\(\s*var\d+\.xyz\s*\)\s*\)\s*,\s*normalize\s*\(\s*var\d+\s*\)\s*\)/s.test(shaderText) ||
    !new RegExp(`texture2D\\s*\\(\\s*${sampler}\\s*,\\s*tmpvar_\\d+\\s*\\)\\.xyz`, "s").test(shaderText) ||
    !/gl_FragColor\s*=\s*tmpvar_\d+\s*;/s.test(shaderText)
  ) {
    return null;
  }

  const tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"));
  const rampStart = tch0Offset + 0x18;
  const sampleCount = 64;
  const componentCount = sampleCount * 3;
  if (tch0Offset < 0 || rampStart + componentCount * 4 > shaderBuffer.length) return null;

  const ramp = [];
  let nonzeroSamples = 0;
  let maxValue = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rgb = [];
    for (let component = 0; component < 3; component += 1) {
      const value = shaderBuffer.readFloatLE(rampStart + (sample * 3 + component) * 4);
      if (!Number.isFinite(value) || value < -0.001 || value > 4) return null;
      const normalized = roundedRampValue(Math.max(0, value));
      rgb.push(normalized);
      maxValue = Math.max(maxValue, normalized);
    }
    if (rgb.some((value) => value > 0.000001)) nonzeroSamples += 1;
    ramp.push(rgb);
  }
  if (!nonzeroSamples || maxValue <= 0) return null;

  const rampHash = crypto.createHash("sha1").update(JSON.stringify(ramp)).digest("hex").slice(0, 16);
  return {
    mode: "viewDotSamplerRamp",
    source: "tch0-inline-rgb-float-ramp",
    sampler,
    sampleCount,
    nonzeroSamples,
    maxValue: roundedRampValue(maxValue),
    rampHash,
    ramp,
  };
}

function viewDotVariables(shaderText) {
  const variables = new Set();
  const pattern =
    /\b([A-Za-z_][A-Za-z0-9_]*)\.x\s*=\s*dot\s*\(\s*normalize\s*\(\s*-\s*\([^;]+?;\s*\1\.y\s*=\s*0\.0\s*;/gs;
  for (const match of String(shaderText || "").matchAll(pattern)) variables.add(match[1]);
  return [...variables];
}

function viewDotSamplers(shaderText) {
  const samplers = new Set();
  for (const variable of viewDotVariables(shaderText)) {
    const pattern = new RegExp(`texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*${variable}\\s*\\)`, "g");
    for (const match of String(shaderText || "").matchAll(pattern)) samplers.add(match[1]);
  }
  return [...samplers];
}

function shadergraphInlineRgbFloatRamp(shaderBuffer, offset) {
  const sampleCount = 64;
  const componentCount = sampleCount * 3;
  if (!Buffer.isBuffer(shaderBuffer) || offset < 0 || offset + componentCount * 4 > shaderBuffer.length) return null;
  const ramp = [];
  let nonzeroSamples = 0;
  let maxValue = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rgb = [];
    for (let component = 0; component < 3; component += 1) {
      const value = shaderBuffer.readFloatLE(offset + (sample * 3 + component) * 4);
      if (!Number.isFinite(value) || value < -0.001 || value > 4) return null;
      const normalized = roundedRampValue(Math.max(0, value));
      rgb.push(normalized);
      maxValue = Math.max(maxValue, normalized);
    }
    if (rgb.some((value) => value > 0.000001)) nonzeroSamples += 1;
    ramp.push(rgb);
  }
  if (!nonzeroSamples || maxValue <= 0) return null;

  return {
    sampleCount,
    nonzeroSamples,
    maxValue: roundedRampValue(maxValue),
    ramp,
    rampHash: crypto.createHash("sha1").update(JSON.stringify(ramp)).digest("hex").slice(0, 16),
  };
}

function rgbTripletCoherentSamples(ramp) {
  let coherent = 0;
  for (const sample of (ramp || []).slice(0, 8)) {
    if (!Array.isArray(sample) || sample.length < 3) continue;
    if (Math.abs(sample[0] - sample[1]) < 0.000001 && Math.abs(sample[1] - sample[2]) < 0.000001) coherent += 1;
  }
  return coherent;
}

function rgbTripletCoherentSampleCount(ramp) {
  let coherent = 0;
  for (const sample of ramp || []) {
    if (!Array.isArray(sample) || sample.length < 3) continue;
    if (Math.abs(sample[0] - sample[1]) < 0.000001 && Math.abs(sample[1] - sample[2]) < 0.000001) coherent += 1;
  }
  return coherent;
}

function rampMonotonicSampleTransitions(ramp) {
  const samples = (ramp || []).map((sample) => {
    if (!Array.isArray(sample) || sample.length < 3) return null;
    return (Number(sample[0]) + Number(sample[1]) + Number(sample[2])) / 3;
  });
  if (samples.some((sample) => !Number.isFinite(sample))) return 0;
  let transitions = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index] >= samples[index - 1] - 0.02) transitions += 1;
  }
  return transitions;
}

function scannedInlineRgbFloatRampCandidates(shaderBuffer, limit = 8) {
  if (!Buffer.isBuffer(shaderBuffer)) return [];
  const candidates = [];
  let tch0Offset = -1;
  while ((tch0Offset = shaderBuffer.indexOf(Buffer.from("TCH0", "ascii"), tch0Offset + 1)) >= 0) {
    const chunkSize = tch0Offset + 8 <= shaderBuffer.length ? shaderBuffer.readUInt32LE(tch0Offset + 4) : 0;
    const scanEnd = Math.min(
      shaderBuffer.length - 64 * 3 * 4,
      tch0Offset + Math.max(0x80, Math.min(chunkSize || 0x600, 0x600)),
    );
    for (let offset = tch0Offset + 0x18; offset <= scanEnd; offset += 1) {
      const inlineRamp = shadergraphInlineRgbFloatRamp(shaderBuffer, offset);
      if (!inlineRamp) continue;
      candidates.push({
        tch0Offset,
        offset,
        deltaHex: `0x${(offset - tch0Offset).toString(16)}`,
        rgbTripletCoherentSamples: rgbTripletCoherentSamples(inlineRamp.ramp),
        rgbTripletCoherentSampleCount: rgbTripletCoherentSampleCount(inlineRamp.ramp),
        monotonicSampleTransitions: rampMonotonicSampleTransitions(inlineRamp.ramp),
        inlineRamp,
      });
    }
  }
  return candidates
    .sort((left, right) => {
      const leftAligned = left.deltaHex === "0x18" ? 1 : 0;
      const rightAligned = right.deltaHex === "0x18" ? 1 : 0;
      return (
        right.rgbTripletCoherentSamples - left.rgbTripletCoherentSamples ||
        rightAligned - leftAligned ||
        right.inlineRamp.nonzeroSamples - left.inlineRamp.nonzeroSamples ||
        left.offset - right.offset
      );
    })
    .slice(0, limit);
}

function scannedInlineRgbFloatRampForSingleSampler(shaderBuffer, shaderText, samplers, inlineRecord, texturePath) {
  if (inlineRecord || texturePath || samplers.length !== 1) return null;
  const allSamplers = shadergraphUniformDeclarations(shaderText)
    .filter((declaration) => declaration.type === "sampler2D")
    .map((declaration) => declaration.name);
  if (allSamplers.length !== 1) return null;
  const candidates = scannedInlineRgbFloatRampCandidates(shaderBuffer, 4);
  if (!candidates.length) return null;
  const best = candidates[0];
  if (best.rgbTripletCoherentSamples < 3) return null;
  return best;
}

function firstTch0Offset(shaderBuffer) {
  return Buffer.isBuffer(shaderBuffer) ? shaderBuffer.indexOf(Buffer.from("TCH0", "ascii")) : -1;
}

function samplerNamePositionsInChunk(shaderBuffer, tch0Offset, samplerNames) {
  if (!Buffer.isBuffer(shaderBuffer) || tch0Offset < 0) return [];
  const chunkSize = tch0Offset + 8 <= shaderBuffer.length ? shaderBuffer.readUInt32LE(tch0Offset + 4) : 0;
  const chunkEnd = Math.min(shaderBuffer.length, tch0Offset + Math.max(0, chunkSize));
  const positions = [];
  for (const sampler of samplerNames || []) {
    const position = shaderBuffer.indexOf(Buffer.from(String(sampler || ""), "ascii"), tch0Offset);
    if (position >= tch0Offset && position < chunkEnd) positions.push(position);
  }
  return positions;
}

function viewDotInlineMaskFormula(shaderText, viewDotSampler, maskSampler) {
  const text = String(shaderText || "");
  const viewSamplerName = viewDotSampler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const maskSamplerName = maskSampler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const maskAssignment = new RegExp(
    `\\b(?:lowp\\s+)?vec3\\s+(tmpvar_\\d+)\\s*;\\s*\\1\\s*=\\s*texture2D\\s*\\(\\s*${maskSamplerName}\\s*,\\s*var\\d+\\.xy\\s*\\)\\.xyz\\s*;`,
    "s",
  ).exec(text);
  if (!maskAssignment) return null;
  const maskVariable = maskAssignment[1];
  const textureCall = `texture2D\\s*\\(\\s*${viewSamplerName}\\s*,[^;]+?\\)\\.xyz`;
  const scaledUse = new RegExp(
    `vec3\\s*\\(\\s*2\\.0\\s*,\\s*2\\.0\\s*,\\s*2\\.0\\s*\\)[^;]{0,180}${textureCall}[^;]{0,140}\\*\\s*${maskVariable}\\b`,
    "s",
  ).test(text);
  return scaledUse ? { maskVariable } : null;
}

function scannedInlineRgbFloatRampForTwoSamplerViewDotMask(shaderBuffer, shaderText, viewDotSampler, inlineRecord, texturePath) {
  if (inlineRecord || texturePath || !Buffer.isBuffer(shaderBuffer) || !shaderText || !viewDotSampler) return null;
  const samplerDeclarations = shadergraphUniformDeclarations(shaderText)
    .filter((declaration) => declaration.type === "sampler2D")
    .map((declaration) => declaration.name);
  if (samplerDeclarations.length !== 2 || !samplerDeclarations.includes(viewDotSampler)) return null;
  const maskSampler = samplerDeclarations.find((sampler) => sampler !== viewDotSampler);
  const formula = viewDotInlineMaskFormula(shaderText, viewDotSampler, maskSampler);
  if (!formula) return null;

  const tch0Offset = firstTch0Offset(shaderBuffer);
  if (tch0Offset < 0) return null;
  const viewDotOffset = tch0Offset + 0x18;
  const viewDotInlineRamp = shadergraphInlineRgbFloatRamp(shaderBuffer, viewDotOffset);
  if (!viewDotInlineRamp) return null;

  const samplerPositions = samplerNamePositionsInChunk(shaderBuffer, tch0Offset, samplerDeclarations);
  if (samplerPositions.length !== samplerDeclarations.length) return null;
  const samplerTableStart = Math.min(...samplerPositions);
  const viewDotEnd = viewDotOffset + 64 * 3 * 4;
  const candidates = scannedInlineRgbFloatRampCandidates(shaderBuffer, 160)
    .filter((candidate) => candidate.tch0Offset === tch0Offset)
    .filter((candidate) => candidate.offset >= viewDotEnd)
    .filter((candidate) => candidate.offset + 64 * 3 * 4 <= samplerTableStart)
    .filter((candidate) => candidate.rgbTripletCoherentSampleCount >= 60)
    .filter((candidate) => candidate.monotonicSampleTransitions >= 60)
    .sort((left, right) => right.inlineRamp.maxValue - left.inlineRamp.maxValue || left.offset - right.offset);
  const maskRamp = candidates[0];
  if (!maskRamp) return null;

  return {
    viewDotSampler,
    maskSampler,
    maskVariable: formula.maskVariable,
    viewDotRamp: {
      tch0Offset,
      offset: viewDotOffset,
      deltaHex: "0x18",
      inlineRamp: viewDotInlineRamp,
    },
    maskRamp,
    samplerTableStart,
  };
}

function parseVec3LiteralValues(value) {
  const match = /vec3\s*\(\s*([^)]+?)\s*\)/.exec(String(value || ""));
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return parts;
}

function uniformDefaultVec3(uniformDefaults, uniformName) {
  const value = uniformDefaults?.[uniformName];
  if (!Array.isArray(value) || value.length < 3) return null;
  const rgb = value.slice(0, 3).map((component) => Number(component));
  return rgb.some((component) => !Number.isFinite(component)) ? null : rgb;
}

function multiplyRgb(left, right, scale = 1) {
  return left.map((value, index) => roundedRampValue(value * right[index] * scale));
}

function uniformColorForViewDotRamp(shaderText, sampler, uniformDefaults) {
  const text = String(shaderText || "");
  const samplerName = sampler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const textureCall = `texture2D\\s*\\(\\s*${samplerName}\\s*,[^;]+?\\)\\.xyz`;
  const direct = new RegExp(
    `\\(\\s*(?:(unif\\d+)\\s*\\*\\s*(vec3\\s*\\([^)]+?\\))|(vec3\\s*\\([^)]+?\\))\\s*\\*\\s*(unif\\d+))\\s*\\)\\s*\\*\\s*${textureCall}`,
    "s",
  ).exec(text);
  if (direct) {
    const uniformName = direct[1] || direct[4];
    const vec = parseVec3LiteralValues(direct[2] || direct[3]);
    const uniform = uniformDefaultVec3(uniformDefaults, uniformName);
    if (vec && uniform) return { uniformName, color: multiplyRgb(uniform, vec) };
  }

  const assignment = new RegExp(
    `\\b(vec\\d+)\\s+(tmpvar_\\d+)\\s*;\\s*\\2\\s*=\\s*\\(\\s*(?:(vec3\\s*\\([^)]+?\\))\\s*\\*\\s*(unif\\d+)|(unif\\d+)\\s*\\*\\s*(vec3\\s*\\([^)]+?\\)))\\s*\\)\\s*;`,
    "s",
  ).exec(text);
  if (assignment) {
    const variable = assignment[2];
    const vec = parseVec3LiteralValues(assignment[3] || assignment[6]);
    const uniformName = assignment[4] || assignment[5];
    const uniform = uniformDefaultVec3(uniformDefaults, uniformName);
    const variablePattern = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const scaledUse = new RegExp(
      `vec3\\s*\\(\\s*2\\.0\\s*,\\s*2\\.0\\s*,\\s*2\\.0\\s*\\)[^;]{0,180}${textureCall}[^;]{0,120}\\*\\s*${variablePattern}`,
      "s",
    ).test(text);
    if (vec && uniform && scaledUse) return { uniformName, color: multiplyRgb(uniform, vec, 2) };
  }

  return null;
}

function viewDotRampFormulaClass(shaderText, sampler, sourceKind, uniformDefaults = {}) {
  const text = String(shaderText || "");
  const samplerName = sampler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const usePattern = new RegExp(`texture2D\\s*\\(\\s*${samplerName}\\s*,`, "s");
  if (!usePattern.test(text)) return "no-view-dot-texture-sample";
  if (sourceKind === "missing") return "blocked-missing-view-dot-ramp-source";
  const textureCall = `texture2D\\s*\\(\\s*${samplerName}\\s*,[^;]+?\\)\\.xyz`;
  if (uniformColorForViewDotRamp(shaderText, sampler, uniformDefaults)) {
    return "uniform-color-times-viewdot-ramp";
  }
  if (new RegExp(`\\+\\s*\\(\\s*\\(?\\s*tmpvar_\\d+\\.xyz\\s*\\*\\s*${textureCall}`, "s").test(text)) {
    return "base-plus-base-times-viewdot-ramp";
  }
  if (new RegExp(`tmpvar_\\d+\\.xyz\\s*=\\s*\\(\\s*tmpvar_\\d+\\s*\\+\\s*${textureCall}`, "s").test(text)) {
    return "base-plus-viewdot-ramp";
  }
  if (new RegExp(`\\+\\s*\\(\\s*tmpvar_\\d+\\s*\\*\\s*${textureCall}`, "s").test(text)) {
    return "sampled-color-plus-viewdot-ramp";
  }
  if (new RegExp(`vec3\\s*\\(\\s*2\\.0\\s*,\\s*2\\.0\\s*,\\s*2\\.0\\s*\\)[^;]{0,180}${textureCall}`, "s").test(text)) {
    return "scaled-viewdot-ramp-times-mask";
  }
  if (
    new RegExp(`${textureCall}\\s*\\*\\s*\\(*\\s*texture2D`, "s").test(text) ||
    new RegExp(`texture2D[^;]+\\*\\s*${textureCall}`, "s").test(text)
  ) {
    return "viewdot-ramp-times-texture";
  }
  if (new RegExp(`${textureCall}[^;]+\\*\\s*tmpvar_`, "s").test(text) || new RegExp(`\\*\\s*${textureCall}`, "s").test(text)) {
    return "viewdot-ramp-times-sampled-color";
  }
  if (new RegExp(`\\b(tmpvar_\\d+)\\s*=\\s*${textureCall}\\s*;[\\s\\S]{0,500}\\b\\1\\b`, "s").test(text)) {
    return "viewdot-ramp-temp-composite";
  }
  return "viewdot-ramp-formula-unclassified";
}

function normalizedAnimatedNoiseTerms(terms) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 6) return null;
  const normalized = terms.map((term) => {
    const speed = Number(term?.speed);
    const offset = Number(term?.offset);
    if (term?.kind !== "fract" || !Number.isFinite(speed) || !Number.isFinite(offset)) return null;
    return { kind: "fract", speed, offset };
  });
  return normalized.every(Boolean) ? normalized : null;
}

function animatedNoiseCompositeForViewDotRamp(
  shaderText,
  viewDotSampler,
  formulaClass,
  previewUvAnimation,
  samplerTextureBindings,
) {
  if (formulaClass !== "base-plus-viewdot-ramp" || previewUvAnimation?.mode !== "floorFractAtlasOffset") return null;
  const baseUvSource = String(previewUvAnimation.baseUvSource || "");
  const offsetVariable = String(previewUvAnimation.offsetVariable || "");
  const uvRepeat = uvRepeatForVaryingSource(shaderText, baseUvSource);
  const xTerms = normalizedAnimatedNoiseTerms(previewUvAnimation.xTerms);
  const yTerms = normalizedAnimatedNoiseTerms(previewUvAnimation.yTerms);
  const phaseSource = String(previewUvAnimation.phaseSource || "");
  const phaseMatches = [...(previewUvAnimation.xTerms || []), ...(previewUvAnimation.yTerms || [])].every(
    (term) => !term?.phaseSource || term.phaseSource === phaseSource,
  );
  if (
    !uvRepeat ||
    uvRepeat.some((value) => !Number.isFinite(value) || Math.abs(value) < 0.000001 || Math.abs(value) > 64) ||
    !xTerms ||
    !yTerms ||
    !/^uniform:unif\d+$/.test(phaseSource) ||
    !phaseMatches ||
    !/^var\d+\.xy$/.test(baseUvSource) ||
    !/^tmpvar_\d+$/.test(offsetVariable)
  ) {
    return null;
  }

  const escapedViewDotSampler = escapeRegexLiteral(viewDotSampler);
  const viewDotAssignment = new RegExp(
    `\\b(tmpvar_\\d+)\\.xyz\\s*=\\s*\\(\\s*(tmpvar_\\d+)\\s*\\+\\s*texture2D\\s*\\(\\s*${escapedViewDotSampler}\\s*,[^;]+?\\)\\.xyz\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!viewDotAssignment) return null;
  const baseWithRampVariable = viewDotAssignment[1];
  const baseInputVariable = viewDotAssignment[2];
  const baseSamplerMatch = new RegExp(
    `\\b${escapeRegexLiteral(baseInputVariable)}\\s*=\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,[^;]+?\\)\\.xyz\\s*;`,
    "s",
  ).exec(shaderText);
  if (!baseSamplerMatch) return null;

  const compositeMatch = new RegExp(
    `\\btmpvar_\\d+\\.xyz\\s*=\\s*\\(\\s*${escapeRegexLiteral(baseWithRampVariable)}\\.xyz\\s*\\+\\s*\\(\\(\\s*${escapeRegexLiteral(baseWithRampVariable)}\\.xyz\\s*\\*\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*\\(\\s*${escapeRegexLiteral(baseUvSource)}\\s*\\+\\s*${escapeRegexLiteral(offsetVariable)}\\s*\\)\\s*\\)\\.([xyzw])\\2\\2\\s*\\)\\s*\\*\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))\\s*\\)\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!compositeMatch) return null;
  const sampler = compositeMatch[1];
  const channel = compositeMatch[2];
  const scale = Number(compositeMatch[3]);
  const texturePath = samplerTextureBindings?.paths?.[sampler] || "";
  if (
    sampler === viewDotSampler ||
    sampler === baseSamplerMatch[1] ||
    !texturePath ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 64
  ) {
    return null;
  }

  return {
    mode: "base-plus-base-times-animated-noise",
    sampler,
    texturePath,
    channel,
    uvRepeat,
    xTerms,
    yTerms,
    scale,
  };
}

function viewDotRampForShadergraph(
  shaderBuffer,
  shaderText,
  runtimeSamplerRecords,
  samplerTextureBindings,
  uniformDefaults = {},
  previewUvAnimation = null,
) {
  if (!shaderText || !Buffer.isBuffer(shaderBuffer)) return null;
  const samplers = viewDotSamplers(shaderText);
  if (samplers.length !== 1) return null;
  const sampler = samplers[0];
  const inlineRecord = (runtimeSamplerRecords || []).find(
    (record) =>
      record.sampler === sampler &&
      (record.kind === "tch0-inline-rgb-float-lookup" || record.kind === "tch0-inline-rgb-float-lookup-clamped") &&
      Number.isFinite(record.inlineLookupOffset),
  );
  const texturePath = samplerTextureBindings?.paths?.[sampler] || "";
  let scannedInlineRamp = scannedInlineRgbFloatRampForSingleSampler(shaderBuffer, shaderText, samplers, inlineRecord, texturePath);
  const scannedInlineMaskRamp = scannedInlineRgbFloatRampForTwoSamplerViewDotMask(
    shaderBuffer,
    shaderText,
    sampler,
    inlineRecord,
    texturePath,
  );
  if (scannedInlineMaskRamp) scannedInlineRamp = scannedInlineMaskRamp.viewDotRamp;
  let sourceKind = inlineRecord || scannedInlineRamp ? "inline-ramp" : texturePath ? "texture-path" : "missing";
  let formulaClass = viewDotRampFormulaClass(shaderText, sampler, sourceKind, uniformDefaults);
  let uniformColor = uniformColorForViewDotRamp(shaderText, sampler, uniformDefaults);
  if (scannedInlineRamp && !scannedInlineMaskRamp && formulaClass !== "uniform-color-times-viewdot-ramp") {
    scannedInlineRamp = null;
    sourceKind = texturePath ? "texture-path" : "missing";
    formulaClass = viewDotRampFormulaClass(shaderText, sampler, sourceKind, uniformDefaults);
    uniformColor = uniformColorForViewDotRamp(shaderText, sampler, uniformDefaults);
  }
  const canRenderNatively =
    sourceKind !== "missing" &&
    formulaClass !== "viewdot-ramp-formula-unclassified" &&
    (formulaClass !== "uniform-color-times-viewdot-ramp" || Boolean(uniformColor));
  const inlineRamp = inlineRecord
    ? shadergraphInlineRgbFloatRamp(shaderBuffer, inlineRecord.inlineLookupOffset)
    : scannedInlineRamp?.inlineRamp || null;
  const rampHash = inlineRamp?.rampHash || (texturePath ? crypto.createHash("sha1").update(texturePath).digest("hex").slice(0, 16) : "");
  const animatedNoiseComposite = animatedNoiseCompositeForViewDotRamp(
    shaderText,
    sampler,
    formulaClass,
    previewUvAnimation,
    samplerTextureBindings,
  );

  return {
    mode: "viewDotRampFormula",
    source:
      sourceKind === "inline-ramp"
        ? scannedInlineRamp
          ? scannedInlineMaskRamp
            ? "tch0-inline-rgb-float-ramp-plus-inline-uv-mask-scanned"
            : "tch0-inline-rgb-float-ramp-scanned"
          : "tch0-inline-rgb-float-ramp"
        : sourceKind === "texture-path"
          ? "texture-path-ramp"
          : "missing",
    sampler,
    sourceKind,
    formulaClass,
    canRenderNatively,
    inlineLookupOffset: inlineRecord?.inlineLookupOffset ?? scannedInlineRamp?.offset ?? "",
    inlineLookupEvidence: scannedInlineRamp
      ? {
          method: scannedInlineMaskRamp
            ? "two-sampler-view-dot-color-ramp-plus-inline-uv-mask-ramp"
            : "single-view-dot-sampler-scanned-tch0-rgb-float-ramp",
          tch0Offset: scannedInlineRamp.tch0Offset,
          deltaHex: scannedInlineRamp.deltaHex,
          rgbTripletCoherentSamples: scannedInlineRamp.rgbTripletCoherentSamples,
          maskSampler: scannedInlineMaskRamp?.maskSampler || "",
          maskVariable: scannedInlineMaskRamp?.maskVariable || "",
          maskInlineLookupOffset: scannedInlineMaskRamp?.maskRamp?.offset ?? "",
          maskDeltaHex: scannedInlineMaskRamp?.maskRamp?.deltaHex || "",
          maskRgbTripletCoherentSampleCount: scannedInlineMaskRamp?.maskRamp?.rgbTripletCoherentSampleCount ?? "",
          maskMonotonicSampleTransitions: scannedInlineMaskRamp?.maskRamp?.monotonicSampleTransitions ?? "",
        }
      : null,
    uniformColor: uniformColor?.color || [],
    uniformColorUniform: uniformColor?.uniformName || "",
    texturePath,
    sampleCount: inlineRamp?.sampleCount || "",
    nonzeroSamples: inlineRamp?.nonzeroSamples || "",
    maxValue: inlineRamp?.maxValue ?? "",
    rampHash,
    ramp: inlineRamp?.ramp || [],
    uvMaskSampler: scannedInlineMaskRamp?.maskSampler || "",
    uvMaskInlineLookupOffset: scannedInlineMaskRamp?.maskRamp?.offset ?? "",
    uvMaskRampHash: scannedInlineMaskRamp?.maskRamp?.inlineRamp?.rampHash || "",
    uvMaskRamp: scannedInlineMaskRamp?.maskRamp?.inlineRamp?.ramp || [],
    ...(animatedNoiseComposite ? { animatedNoiseComposite } : {}),
  };
}

function firstSamplerInRegex(shaderText, regex) {
  const match = String(shaderText || "").match(regex);
  return match?.[1] || "";
}

function creatureReflectionScale(shaderText) {
  const match = String(shaderText || "").match(/\*\s*vec2\(\s*([0-9.]+)\s*,\s*\1\s*\)\)\s*\+\s*vec2\(\s*0\.1\s*,\s*0\.1\s*\)/s);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 && value <= 2 ? value : 0;
}

function creatureOffsetScale(shaderText) {
  const match = String(shaderText || "").match(/-\s*vec3\(0\.5,\s*0\.5,\s*0\.5\)\)\s*\*\s*vec3\(\s*([0-9.]+)\s*,\s*\1\s*,\s*\1\s*\)/s);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 && value <= 2 ? value : 1;
}

function creatureOffsetZDivisor(shaderText) {
  const match = String(shaderText || "").match(/\/\s*vec3\(\s*([0-9.]+)\s*,\s*1\.0\s*,\s*1\.0\s*\)\)\.x/s);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 && value <= 2 ? value : 1;
}

function creatureLookupLitFormulaClass(shaderText) {
  const text = String(shaderText || "");
  if (/texture2D\s*\(\s*sampler\d+\s*,\s*texture2D\s*\(\s*sampler\d+\s*,/s.test(text)) {
    return "nested-reflection-lookup-base-channel";
  }
  if (/\+\s*texture2D\s*\(\s*sampler\d+\s*,\s*var\d+\.xy\s*\)\.xyz/s.test(text)) {
    return "offset-lookup-additive";
  }
  if (/texture2D\s*\(\s*sampler\d+\s*,\s*var\d+\.xy\s*\)/s.test(text) && /texture2D\s*\(\s*sampler\d+\s*,\s*tmpvar_\d+\s*\)/s.test(text)) {
    return "offset-lookup";
  }
  return "";
}

function samplerPathForCreature(samplerTextureBindings, sampler) {
  return samplerTextureBindings?.paths?.[sampler] || "";
}

function creatureLookupLitForShadergraph(shaderBuffer, shaderText, analysis, samplerTextureBindings, runtimeSamplerRecords) {
  if (!Buffer.isBuffer(shaderBuffer) || !shaderText || !analysis) return null;
  const formulaClass = creatureLookupLitFormulaClass(shaderText);
  if (!formulaClass) return null;
  const baseSampler = analysis?.roles?.baseColor?.sampler || "";
  const reflectionSampler = firstSamplerInRegex(
    shaderText,
    /texture2D\s*\(\s*(sampler\d+)\s*,\s*\(\(\(\s*\(\s*tmpvar_\d+\.xy\s*\*\s*\(inversesqrt\s*\(\s*dot\s*\(\s*tmpvar_\d+\s*,\s*tmpvar_\d+\s*\)\s*\)\s*\*\s*0\.5/s,
  );
  const rampRecord = (runtimeSamplerRecords || []).find((record) =>
    ["tch0-inline-rgb-float-lookup", "tch0-inline-rgb-float-lookup-clamped"].includes(record.kind),
  );
  const rampSampler = rampRecord?.sampler || "";
  const ramp = rampRecord ? shadergraphInlineRgbFloatRamp(shaderBuffer, Number(rampRecord.inlineLookupOffset)) : null;
  const reflectionScale = creatureReflectionScale(shaderText);
  const offsetScale = creatureOffsetScale(shaderText);
  const offsetZDivisor = creatureOffsetZDivisor(shaderText);

  let offsetSampler = "";
  let lookupSampler = "";
  let additiveSampler = "";
  if (formulaClass === "nested-reflection-lookup-base-channel") {
    const nested = String(shaderText).match(/texture2D\s*\(\s*(sampler\d+)\s*,\s*texture2D\s*\(\s*(sampler\d+)\s*,/s);
    lookupSampler = nested?.[1] || "";
    if (!reflectionSampler && nested?.[2]) {
      // This branch is intentionally not used for the current rows; it documents the nested sampler shape.
    }
    additiveSampler = firstSamplerInRegex(shaderText, /\+\s*texture2D\s*\(\s*(sampler\d+)\s*,\s*var\d+\.xy\s*\)\.xyz/s);
  } else {
    offsetSampler = firstSamplerInRegex(
      shaderText,
      /lowp\s+vec4\s+tmpvar_\d+\s*;\s*tmpvar_\d+\s*=\s*texture2D\s*\(\s*(sampler\d+)\s*,\s*var\d+\.xy\s*\)\s*;/s,
    );
    lookupSampler = firstSamplerInRegex(shaderText, /texture2D\s*\(\s*(sampler\d+)\s*,\s*tmpvar_\d+\s*\)/s);
    additiveSampler = firstSamplerInRegex(shaderText, /\+\s*texture2D\s*\(\s*(sampler\d+)\s*,\s*var\d+\.xy\s*\)\.xyz/s);
  }

  const samplerPaths = {
    base: samplerPathForCreature(samplerTextureBindings, baseSampler),
    reflection: samplerPathForCreature(samplerTextureBindings, reflectionSampler),
    offset: offsetSampler ? samplerPathForCreature(samplerTextureBindings, offsetSampler) : "",
    lookup: samplerPathForCreature(samplerTextureBindings, lookupSampler),
    additive: additiveSampler ? samplerPathForCreature(samplerTextureBindings, additiveSampler) : "",
  };
  const requiredPaths =
    formulaClass === "offset-lookup"
      ? [samplerPaths.base, samplerPaths.reflection, samplerPaths.offset, samplerPaths.lookup]
      : formulaClass === "offset-lookup-additive"
        ? [samplerPaths.base, samplerPaths.reflection, samplerPaths.offset, samplerPaths.lookup, samplerPaths.additive]
        : [samplerPaths.base, samplerPaths.reflection, samplerPaths.lookup, samplerPaths.additive];
  const canRenderNatively =
    Boolean(baseSampler && reflectionSampler && lookupSampler && rampSampler && ramp?.ramp?.length === 64 && reflectionScale) &&
    requiredPaths.every(Boolean);
  return {
    mode: "creatureLookupLitFormula",
    formulaClass,
    canRenderNatively,
    baseSampler,
    reflectionSampler,
    offsetSampler,
    lookupSampler,
    additiveSampler,
    rampSampler,
    reflectionScale,
    offsetScale,
    offsetZDivisor,
    rampHash: ramp?.rampHash || "",
    ramp: ramp?.ramp || [],
    samplerPaths,
    missingEvidence: [
      !baseSampler ? "base-sampler" : "",
      !reflectionSampler ? "reflection-sampler" : "",
      formulaClass !== "nested-reflection-lookup-base-channel" && !offsetSampler ? "offset-sampler" : "",
      !lookupSampler ? "lookup-sampler" : "",
      formulaClass !== "offset-lookup" && !additiveSampler ? "additive-sampler" : "",
      !rampSampler || !ramp?.ramp?.length ? "inline-ramp" : "",
      !reflectionScale ? "reflection-scale" : "",
      ...Object.entries(samplerPaths)
        .filter(([role, texturePath]) => {
          if (role === "offset" && formulaClass === "nested-reflection-lookup-base-channel") return false;
          if (role === "additive" && formulaClass === "offset-lookup") return false;
          return !texturePath;
        })
        .map(([role]) => `${role}-texture-path`),
    ].filter(Boolean),
  };
}

function fragmentMainContainingFragColor(shaderText) {
  const text = String(shaderText || "");
  const fragIndex = text.indexOf("gl_FragColor");
  if (fragIndex < 0) return "";
  const mainIndex = text.slice(0, fragIndex).lastIndexOf("void main");
  if (mainIndex < 0) return text.slice(Math.max(0, fragIndex - 512), fragIndex + 512);
  const openBrace = text.indexOf("{", mainIndex);
  if (openBrace < 0) return text.slice(mainIndex, fragIndex + 512);
  let depth = 0;
  for (let index = openBrace; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(mainIndex, index + 1);
    }
  }
  return text.slice(mainIndex);
}

function parseShaderFloat(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function constantFragmentColorForShadergraph(shaderText) {
  const fragmentMain = fragmentMainContainingFragColor(shaderText);
  if (!fragmentMain || /texture2D\s*\(/.test(fragmentMain) || /unif\d+/.test(fragmentMain)) return null;
  const match = fragmentMain.match(
    /([A-Za-z_]\w*)\.xyz\s*=\s*vec3\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*;\s*\1\.w\s*=\s*([-+]?\d*\.?\d+)\s*;\s*gl_FragColor\s*=\s*\1\s*;/s,
  );
  if (!match) return null;
  const rgba = match.slice(2, 6).map(parseShaderFloat);
  if (rgba.some((value) => value === null || value < 0 || value > 8)) return null;
  return {
    mode: "constant-fragment-color",
    source: "fragment-main-tmpvar-rgba",
    rgba,
  };
}

function vertexColorAlphaFragmentForShadergraph(shaderText) {
  const text = String(shaderText || "");
  const fragmentMain = fragmentMainContainingFragColor(text);
  if (!fragmentMain || /texture2D\s*\(/.test(fragmentMain) || /unif\d+/.test(fragmentMain)) return null;
  const vertexColorVarying = text.match(/\b(var\d+)\s*=\s*_Color\s*;/)?.[1] || "";
  if (!vertexColorVarying) return null;
  const colorMatch = fragmentMain.match(/([A-Za-z_]\w*)\.xyz\s*=\s*(var\d+)\.xyz\s*;/s);
  const alphaMatch = fragmentMain.match(/([A-Za-z_]\w*)\.x\s*=\s*(var\d+)\.w\s*;/s);
  const outputMatch = fragmentMain.match(/gl_FragColor\s*=\s*([A-Za-z_]\w*)\s*;/s);
  if (
    !colorMatch ||
    !alphaMatch ||
    !outputMatch ||
    colorMatch[2] !== vertexColorVarying ||
    alphaMatch[2] !== vertexColorVarying ||
    outputMatch[1] !== colorMatch[1]
  ) {
    return null;
  }
  return {
    mode: "vertex-color-alpha-fragment",
    source: "_Color-varying-rgba",
    varying: vertexColorVarying,
  };
}

function vertexAlphaUniformColorForShadergraph(shaderText, uniformDefaults = {}) {
  const text = String(shaderText || "");
  const fragmentMain = fragmentMainContainingFragColor(text);
  if (!fragmentMain || /texture2D\s*\(/.test(fragmentMain)) return null;
  const match = fragmentMain.match(
    /([A-Za-z_]\w*)\.xyz\s*=\s*\(\(\s*(unif\d+)\s*\*\s*vec3\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*\)\s*\*\s*(var\d+)\.www\s*\)\s*;\s*\1\.w\s*=\s*([-+]?\d*\.?\d+)\s*;\s*gl_FragColor\s*=\s*\1\s*;/s,
  );
  if (!match) return null;
  const vertexColorVarying = text.match(/\b(var\d+)\s*=\s*_Color\s*;/)?.[1] || "";
  if (!vertexColorVarying || vertexColorVarying !== match[6]) return null;
  const tint = match.slice(3, 6).map(parseShaderFloat);
  const alpha = parseShaderFloat(match[7]);
  if (tint.some((value) => value === null || value < 0 || value > 8) || alpha === null || alpha < 0 || alpha > 1) return null;
  const uniformDefault = uniformDefaultVec3(uniformDefaults, match[2]);
  return {
    mode: "vertex-alpha-uniform-color",
    source: "uniform-times-inline-color-times-vertex-alpha",
    uniform: match[2],
    varying: match[6],
    tint,
    uniformDefault: uniformDefault || [],
    color: uniformDefault ? multiplyRgb(uniformDefault, tint) : [],
    alpha,
    canRenderNatively: Boolean(uniformDefault),
  };
}

function solidLitRuntimeLightsForShadergraph(shaderText, nativeUniformBindings = []) {
  const text = String(shaderText || "");
  const fragmentMain = fragmentMainContainingFragColor(text);
  if (!fragmentMain || /texture2D\s*\(/.test(fragmentMain)) return null;
  if (!/unif\d+/.test(fragmentMain) || !/\b(OmniLight\.(?:Position|Color|Attenuation)|Probe\.Samples)\x00/.test(text)) return null;
  if (!/gl_FragColor\s*=\s*[A-Za-z_]\w*\s*;/s.test(fragmentMain)) return null;
  const bindings = bindingsBySemantic(nativeUniformBindings);
  const omniLights = [0, 1].map((arrayIndex) => ({
    arrayIndex,
    positionUniform: (bindings["OmniLight.Position"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
    colorUniform: (bindings["OmniLight.Color"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
    attenuationUniform: (bindings["OmniLight.Attenuation"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
  }));
  const probeSampleUniforms = (bindings["Probe.Samples"] || []).map((binding) => binding.uniform);
  const ambientMatch = fragmentMain.match(
    /vec3\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*\*/s,
  );
  const specularPowers = uniqueInOrder(
    [...fragmentMain.matchAll(/pow\s*\(\s*clamp\s*\([\s\S]*?,\s*0\.0\s*,\s*1\.0\)\s*,\s*([-+]?\d*\.?\d+)\s*\)/g)]
      .map((match) => parseShaderFloat(match[1]))
      .filter((value) => value !== null),
  );
  const hasEyeToWorldProbeBlend = /_Eye2WorldMatrix/.test(text) && probeSampleUniforms.length >= 6;
  const hasOmniDiffuse =
    omniLights.length >= 2 &&
    omniLights.every((light) => light.positionUniform && light.colorUniform && light.attenuationUniform) &&
    /clamp\s*\(\s*dot\s*\(\s*(?:normalize\s*\()?tmpvar_\d+|clamp\s*\(\s*dot\s*\(\s*normalize/s.test(fragmentMain);
  const hasSpecularPow = /pow\s*\(/.test(fragmentMain);
  return {
    mode: "solid-lit-runtime-lights",
    source: "native-omnilight-probe-uniforms",
    formulaClass: [
      "solid-lit-runtime-lights",
      hasEyeToWorldProbeBlend ? "probe-diffuse" : "no-probe-diffuse",
      hasOmniDiffuse ? "omni-diffuse" : "no-omni-diffuse",
      hasSpecularPow ? "pow-specular" : "no-pow-specular",
    ].join("+"),
    structureSignature: characterLitFragmentStructureSignature(fragmentMain),
    canRenderNatively: false,
    ambientTint: ambientMatch ? parseShaderVec3(ambientMatch.slice(1, 4)) : [],
    specularPowers,
    omniLights,
    probeSampleUniforms,
    featureCoverage: {
      eyeToWorldProbeBlend: hasEyeToWorldProbeBlend,
      omniDiffuse: hasOmniDiffuse,
      specularPow: hasSpecularPow,
    },
    missingEvidence: [],
  };
}

function parseShaderVec3(values) {
  const parsed = values.map(parseShaderFloat);
  return parsed.every((value) => value !== null) ? parsed : [];
}

function characterLitFragmentStructureSignature(fragmentMain) {
  const normalized = String(fragmentMain || "")
    .replace(/sampler\d+/g, "samplerN")
    .replace(/unif\d+/g, "unifN")
    .replace(/tmpvar_\d+/g, "tmpvar_N")
    .replace(/\bt\d+_\d+\b/g, "tN")
    .replace(/var\d+/g, "varN")
    .replace(/\b\d+\.\d+\b/g, "NUM")
    .replace(/\b\d+\b/g, "NUM")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

function bindingsBySemantic(nativeUniformBindings) {
  const grouped = {};
  for (const binding of nativeUniformBindings || []) {
    if (!binding?.semantic) continue;
    if (!grouped[binding.semantic]) grouped[binding.semantic] = [];
    grouped[binding.semantic].push(binding);
  }
  for (const bindings of Object.values(grouped)) {
    bindings.sort((left, right) => Number(left.arrayIndex || 0) - Number(right.arrayIndex || 0));
  }
  return grouped;
}

function characterLitReflectionProbeFormulaForShadergraph(
  shaderText,
  analysis,
  nativeUniformBindings,
  runtimeSamplerRecords = [],
) {
  const fragmentMain = fragmentMainContainingFragColor(shaderText);
  if (!fragmentMain) return null;
  const roleSamplers = {};
  for (const [role, roleInfo] of Object.entries(analysis?.roles || {})) {
    if (roleInfo?.sampler) roleSamplers[role] = roleInfo.sampler;
  }
  const textureUses = shadergraphSamplerUseRecords(fragmentMain);
  const textureUseSamplers = uniqueInOrder(textureUses.map((use) => use.sampler));
  const runtimeInlineSamplers = (runtimeSamplerRecords || [])
    .filter((record) => /inline/i.test(record.kind || ""))
    .map((record) => record.sampler);
  const runtimeSceneTextureSamplers = (runtimeSamplerRecords || [])
    .filter((record) => /runtime-fog-of-war-texture/i.test(record.kind || ""))
    .map((record) => record.sampler);
  const rimLookupSampler =
    runtimeInlineSamplers.find((sampler) => new RegExp(`texture2D\\s*\\(\\s*${escapeRegexLiteral(sampler)}\\s*,`).test(fragmentMain)) ||
    "";
  const rimLookupUse = textureUses.find((use) => use.sampler === rimLookupSampler) || null;
  let rimLookupScale = null;
  if (rimLookupSampler) {
    const scaleMatch = fragmentMain.match(
      new RegExp(
        `texture2D\\s*\\(\\s*${escapeRegexLiteral(rimLookupSampler)}\\s*,[^)]*\\)\\.xyz\\)\\s*\\*\\s*([-+]?\\d*\\.?\\d+)`,
        "s",
      ),
    );
    rimLookupScale = scaleMatch ? parseShaderFloat(scaleMatch[1]) : 1;
  }
  const ambientMatch = fragmentMain.match(
    /vec3\s*\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)\s*\*\s*tmpvar_\d+/s,
  );
  const specularPowers = uniqueInOrder(
    [...fragmentMain.matchAll(/pow\s*\(\s*clamp\s*\([\s\S]*?,\s*0\.0\s*,\s*1\.0\)\s*,\s*([-+]?\d*\.?\d+)\s*\)/g)]
      .map((match) => parseShaderFloat(match[1]))
      .filter((value) => value !== null),
  );
  const hasSpecularPow = /pow\s*\(/.test(fragmentMain);
  const specularPowerSource = specularPowers.length ? "literal" : hasSpecularPow ? "dynamic-expression" : "";
  const additionalSurfaceSamplers = textureUseSamplers.filter((sampler) => {
    if (Object.values(roleSamplers).includes(sampler)) return false;
    if (runtimeInlineSamplers.includes(sampler)) return false;
    if (runtimeSceneTextureSamplers.includes(sampler)) return false;
    return true;
  });
  const bindings = bindingsBySemantic(nativeUniformBindings);
  const omniLights = [0, 1].map((arrayIndex) => ({
    arrayIndex,
    positionUniform: (bindings["OmniLight.Position"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
    colorUniform: (bindings["OmniLight.Color"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
    attenuationUniform: (bindings["OmniLight.Attenuation"] || []).find((binding) => binding.arrayIndex === arrayIndex)?.uniform || "",
  }));
  const probeSampleUniforms = (bindings["Probe.Samples"] || []).map((binding) => binding.uniform);
  const hasTangentNormal =
    Boolean(roleSamplers.normal) &&
    new RegExp(`texture2D\\s*\\(\\s*${escapeRegexLiteral(roleSamplers.normal)}\\s*,\\s*var\\d+\\.xy\\s*\\)\\.xyz\\s*\\*\\s*2\\.0`, "s").test(
      fragmentMain,
    );
  const hasBaseColorSample =
    Boolean(roleSamplers.baseColor) &&
    new RegExp(`texture2D\\s*\\(\\s*${escapeRegexLiteral(roleSamplers.baseColor)}\\s*,\\s*var\\d+\\.xy\\s*\\)`, "s").test(
      fragmentMain,
    );
  const hasReflectionSample =
    Boolean(roleSamplers.reflection) &&
    new RegExp(`texture2D\\s*\\(\\s*${escapeRegexLiteral(roleSamplers.reflection)}\\s*,`, "s").test(fragmentMain);
  const hasEyeToWorldProbeBlend = /_Eye2WorldMatrix/.test(shaderText) && probeSampleUniforms.length >= 6;
  const hasOmniDiffuse =
    omniLights.length >= 2 &&
    omniLights.every((light) => light.positionUniform && light.colorUniform && light.attenuationUniform);
  const hasFogOfWarMask = runtimeSceneTextureSamplers.length > 0;
  const missingEvidence = [
    !hasTangentNormal ? "tangent-normal-sample" : "",
    !hasBaseColorSample ? "base-color-sample" : "",
    !hasEyeToWorldProbeBlend ? "six-probe-sample-uniforms" : "",
    !hasOmniDiffuse ? "two-omnilight-uniform-groups" : "",
    !hasSpecularPow ? "specular-pow" : "",
    !hasReflectionSample ? "reflection-sample" : "",
  ].filter(Boolean);
  return {
    mode: "character-lit-reflection-probe",
    source: "shadergraph-fragment-main-diagnostic",
    formulaClass: [
      "character-lit-reflection-probe",
      rimLookupSampler ? "rim-lookup" : "no-rim-lookup",
      hasSpecularPow ? "pow-specular" : "no-pow-specular",
      additionalSurfaceSamplers.length ? "extra-surface-samplers" : "standard-samplers",
      hasFogOfWarMask ? "fog-of-war-mask" : "",
    ].filter(Boolean).join("+"),
    structureSignature: characterLitFragmentStructureSignature(fragmentMain),
    canRenderNatively: false,
    normalSampler: roleSamplers.normal || "",
    baseColorSampler: roleSamplers.baseColor || "",
    rimLookupSampler,
    rimLookupUv: rimLookupUse?.uv || "",
    rimLookupScale,
    reflectionSampler: roleSamplers.reflection || "",
    additionalSurfaceSamplers,
    runtimeSceneTextureSamplers,
    ambientTint: ambientMatch ? parseShaderVec3(ambientMatch.slice(1, 4)) : [],
    specularPowerSource,
    specularPowers,
    omniLights,
    probeSampleUniforms,
    featureCoverage: {
      tangentNormal: hasTangentNormal,
      baseColor: hasBaseColorSample,
      viewDotRimLookup: Boolean(rimLookupSampler),
      eyeToWorldProbeBlend: hasEyeToWorldProbeBlend,
      omniDiffuse: hasOmniDiffuse,
      specularPow: hasSpecularPow,
      reflectionSample: hasReflectionSample,
      fogOfWarMask: hasFogOfWarMask,
    },
    missingEvidence,
  };
}

function nativeShaderModeForShadergraph(shaderText, analysis = null) {
  if (!shaderText || !/gl_FragColor/.test(shaderText)) return "";
  const roles = analysis?.roles || {};
  if (
    /_Eye2WorldMatrix/.test(shaderText) &&
    roles.normal?.sampler &&
    roles.baseColor?.sampler &&
    roles.reflection?.sampler &&
    new RegExp(`texture2D\\s*\\(\\s*${roles.normal.sampler}\\s*,\\s*var\\d+\\.xy\\s*\\)`, "s").test(shaderText) &&
    new RegExp(`texture2D\\s*\\(\\s*${roles.baseColor.sampler}\\s*,\\s*var\\d+\\.xy\\s*\\)`, "s").test(shaderText) &&
    /pow\s*\(/.test(shaderText)
  ) {
    return "character-lit-reflection-probe";
  }
  if (
    /vec3\(1\.5,\s*1\.5,\s*1\.5\)/.test(shaderText) &&
    /inversesqrt\s*\(\s*dot\s*\(\s*tmpvar_\d+\s*,\s*tmpvar_\d+\s*\)\s*\)/.test(shaderText) &&
    /texture2D\s*\(\s*sampler\d+\s*,\s*tmpvar_\d+\s*\)/s.test(shaderText)
  ) {
    return "creature-lookup-lit";
  }
  if (
    /dot\s*\(\s*normalize\s*\(\s*-\s*\(\s*var\d+\.xyz\s*\)\s*\)\s*,\s*normalize\s*\(\s*var\d+\s*\)\s*\)/s.test(shaderText) &&
    /texture2D\s*\(\s*sampler\d+\s*,\s*tmpvar_\d+\s*\)\.xyz/s.test(shaderText)
  ) {
    return "view-dot-sampler-ramp";
  }
  if (constantFragmentColorForShadergraph(shaderText)) return "constant-fragment-color";
  if (vertexColorAlphaFragmentForShadergraph(shaderText)) return "vertex-color-alpha-direct";
  if (vertexAlphaUniformColorForShadergraph(shaderText)) return "vertex-alpha-uniform-color";
  if (solidLitRuntimeLightsForShadergraph(shaderText)) return "solid-lit-runtime-lights";
  if (/gl_FragColor\s*=\s*var\d+\s*;/s.test(shaderText)) return "vertex-color-direct";
  if (/texture2D\s*\(/.test(shaderText) && /gl_FragColor\s*=\s*tmpvar_\d+\s*;/s.test(shaderText)) return "sampled-color";
  return "unknown";
}

function uvAnimationRuntimeStageForRow({ roleNames, previewUvAnimation, uvAnimationGapReason, unimplementedRoleNames }) {
  const roles = new Set(roleNames || []);
  if (!roles.has("uvAnimation")) return "none";
  if (uvAnimationGapReason) return `blocked-parser-${uvAnimationGapReason}`;
  const mode = uvAnimationModeForRow(previewUvAnimation);
  if (!mode) return "blocked-no-preview-mode";
  if (nameSet(unimplementedRoleNames).has("uvAnimation")) {
    const blocker = uvAnimationRuntimeBlockerForMode(mode);
    return blocker ? `blocked-${blocker}` : `blocked-viewer-unsupported-${mode}`;
  }
  return `runtime-${mode}`;
}

function textureSampleSamplersInOrder(shaderText) {
  return uniqueInOrder(
    [...String(shaderText || "").matchAll(/texture2D\s*\(\s*(sampler\d+)\s*,/g)].map((match) => match[1]),
  );
}

function textureSampleVaryingSourceForSampler(shaderText, sampler) {
  const match = new RegExp(`texture2D\\s*\\(\\s*${escapeRegexLiteral(sampler)}\\s*,\\s*\\(?\\s*(var\\d+)\\.xy`, "s").exec(
    String(shaderText || ""),
  );
  return match ? `${match[1]}.xy` : "";
}

function textureSampleRegexForSampler(sampler) {
  return new RegExp(`texture2D\\s*\\(\\s*${sampler}\\s*,`, "s");
}

function compactShaderExpression(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function sampledUvCompositeSnippet(shaderText, sampler) {
  const sampleMatch = textureSampleRegexForSampler(sampler).exec(shaderText);
  if (!sampleMatch) return "";
  return compactShaderExpression(
    shaderText.slice(Math.max(0, sampleMatch.index - 900), Math.min(shaderText.length, sampleMatch.index + 1200)),
  );
}

function binaryHalfAtlasTintCompositeFormula(shaderText, previewUvAnimation) {
  if (previewUvAnimation?.mode !== "scroll") return null;
  const speed = Array.isArray(previewUvAnimation.speed) ? previewUvAnimation.speed.map(Number) : [];
  const offset = Array.isArray(previewUvAnimation.offset) ? previewUvAnimation.offset.map(Number) : [];
  const offsetVariable = String(previewUvAnimation.offsetVariable || "");
  const selectorUniform = /^uniform:(unif\d+)$/.exec(String(previewUvAnimation.phaseSource || ""))?.[1] || "";
  if (
    speed.length !== 2 ||
    Math.abs(speed[0] - 0.5) > 0.000001 ||
    Math.abs(speed[1]) > 0.000001 ||
    offset.length !== 2 ||
    offset.some((value) => Math.abs(value) > 0.000001) ||
    !/^tmpvar_\d+$/.test(offsetVariable) ||
    !selectorUniform
  ) {
    return null;
  }

  const tintSample = new RegExp(
    `\\b(tmpvar_\\d+)\\s*=\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*\\(\\s*(var\\d+)\\.xy\\s*\\+\\s*${escapeRegexLiteral(offsetVariable)}\\s*\\)\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!tintSample) return null;
  const tintVariable = tintSample[1];
  const tintSampler = tintSample[2];
  const tintUvRepeat = uvRepeatForVaryingSource(shaderText, `${tintSample[3]}.xy`);

  const multipliedBase = new RegExp(
    `\\btmpvar_\\d+\\s*=\\s*\\(\\(\\s*vec3\\s*\\(([^)]*)\\)\\s*\\*\\s*${escapeRegexLiteral(tintVariable)}\\.xyz\\s*\\)\\s*\\*\\s*(tmpvar_\\d+)\\.xyz\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!multipliedBase) return null;
  const tintScale = parseVec3LiteralValues(multipliedBase[1]);
  const baseVariable = multipliedBase[2];
  const baseSample = new RegExp(
    `\\b${escapeRegexLiteral(baseVariable)}\\s*=\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*(var\\d+)\\.xy\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!baseSample || !tintScale) return null;
  const baseUvRepeat = uvRepeatForVaryingSource(shaderText, `${baseSample[2]}.xy`);
  if (
    !baseUvRepeat ||
    !tintUvRepeat ||
    baseUvRepeat.some((value, index) => Math.abs(value - [1, 1][index]) > 0.000001) ||
    tintUvRepeat.some((value, index) => Math.abs(value - [0.5, 1][index]) > 0.000001) ||
    tintScale.some((value) => Math.abs(value - 2) > 0.000001)
  ) {
    return null;
  }

  return {
    className: "base-times-binary-half-atlas-tint",
    baseSampler: baseSample[1],
    tintSampler,
    baseUvRepeat,
    tintUvRepeat,
    tintScale,
    selectorUniform,
    selectorOffsetScale: speed,
    defaultSelector: 0,
  };
}

function staticBinaryHalfAtlasSelectorFormula(shaderText, previewUvAnimation, uniformDefaults = {}) {
  if (previewUvAnimation?.mode !== "scroll") return null;
  const speed = Array.isArray(previewUvAnimation.speed) ? previewUvAnimation.speed.map(Number) : [];
  const offset = Array.isArray(previewUvAnimation.offset) ? previewUvAnimation.offset.map(Number) : [];
  const offsetVariable = String(previewUvAnimation.offsetVariable || "");
  const baseUvSource = String(previewUvAnimation.baseUvSource || "");
  const selectorUniform = /^uniform:(unif\d+)$/.exec(String(previewUvAnimation.phaseSource || ""))?.[1] || "";
  const configuredSelector = Number(uniformDefaults?.[selectorUniform]);
  const defaultSelector = configuredSelector === 0 || configuredSelector === 1 ? configuredSelector : 0;
  const selectsHalfAtlas =
    (Math.abs(speed[0] - 0.5) <= 0.000001 && Math.abs(speed[1]) <= 0.000001) ||
    (Math.abs(speed[0]) <= 0.000001 && Math.abs(speed[1] - 0.5) <= 0.000001);
  if (
    speed.length !== 2 ||
    !selectsHalfAtlas ||
    offset.length !== 2 ||
    offset.some((value) => Math.abs(value) > 0.000001) ||
    !/^tmpvar_\d+$/.test(offsetVariable) ||
    !/^(?:var|tmpvar_)\d+\.xy$/.test(baseUvSource) ||
    !selectorUniform ||
    (defaultSelector !== 0 && defaultSelector !== 1)
  ) {
    return null;
  }

  const atlasUvMatch = new RegExp(
    `\\b(tmpvar_\\d+)\\s*=\\s*\\(\\s*${escapeRegexLiteral(baseUvSource)}\\s*\\+\\s*${escapeRegexLiteral(offsetVariable)}\\s*\\)\\s*;`,
    "s",
  ).exec(shaderText);
  if (!atlasUvMatch) return null;
  const atlasUvSource = atlasUvMatch[1];
  const baseUvRepeat = uvRepeatForVaryingSource(shaderText, baseUvSource) || [1, 1];
  const atlasSamplers = uniqueInOrder(
    [...String(shaderText || "").matchAll(
      new RegExp(`texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*${escapeRegexLiteral(atlasUvSource)}\\s*\\)`, "g"),
    )].map((match) => match[1]),
  );
  if (atlasSamplers.length < 2) return null;

  return {
    className: "static-binary-half-atlas-selector",
    selectorUniform,
    baseUvRepeat,
    selectorOffsetScale: speed,
    defaultSelector,
    atlasUvSource,
    atlasSamplers,
  };
}

function uvAnimationCompositeFormulaClassForShadergraph(shaderText, previewUvAnimation) {
  const mode = String(previewUvAnimation?.mode || "");
  if (!["sampledDistort", "sampledFractOffsetDistort", "nestedSampledUvDistort"].includes(mode)) return "";
  const baseSampler = String(previewUvAnimation?.baseSampler || "");
  if (!shaderText || !baseSampler) return "sampled-composite-unclassified";

  const snippet = sampledUvCompositeSnippet(shaderText, baseSampler);
  if (!snippet) return "sampled-composite-unclassified";
  const samplePattern = `texture2D\\s*\\(\\s*${baseSampler}\\s*,`;

  if (mode === "nestedSampledUvDistort") {
    if (new RegExp(`\\.xyz\\s*=\\s*\\([^;]*\\+\\s*${samplePattern}[^;]*\\.xyz\\)`, "s").test(snippet)) {
      return "base-plus-nested-sampled-color";
    }
    if (
      new RegExp(`=\\s*\\([^;]*\\+\\s*${samplePattern}[^;]*\\.xyz\\)`, "s").test(snippet) &&
      /vec3\s*\(\s*0\.205458\s*,\s*0\.607533\s*,\s*0\.726\s*\)/s.test(snippet) &&
      /\*\s*vec3\s*\(\s*tmpvar_\d+\s*\)/s.test(snippet) &&
      /gl_FragColor\s*=\s*tmpvar_\d+\s*;/s.test(snippet)
    ) {
      return "nested-water-throne-reveal";
    }
    return "nested-sampled-composite-unclassified";
  }

  if (new RegExp(`${samplePattern}[^;]*\\.yyy\\s*\\*\\s*texture2D`, "s").test(snippet)) {
    return "sampled-channel-times-secondary-texture";
  }
  if (new RegExp(`clamp\\s*\\(\\s*\\(\\(${samplePattern}[^;]*\\.x`, "s").test(snippet)) {
    return "sampled-threshold-mask";
  }
  if (
    new RegExp(
      `${samplePattern}[\\s\\S]*texture2D\\s*\\(\\s*sampler\\d+\\s*,\\s*\\(\\s*var\\d+\\.xy\\s*\\+\\s*\\(\\s*tmpvar_\\d+\\s*\\*\\s*tmpvar_\\d+\\s*\\)\\.xy\\s*\\)`,
      "s",
    ).test(snippet)
  ) {
    return "sampled-offset-field-for-secondary-sampler";
  }
  if (
    new RegExp(`\\+\\s*\\(\\s*\\(?[^;]*\\*\\s*\\(?${samplePattern}[^;]*\\.xyz\\s*\\*\\s*vec3`, "s").test(snippet) ||
    new RegExp(`\\+\\s*\\(\\s*\\(?[^;]*\\*\\s*vec3\\s*\\([^)]*\\)\\s*\\)?\\s*\\*\\s*${samplePattern}`, "s").test(snippet)
  ) {
    return "base-plus-base-times-sampled-color-scale";
  }
  if (new RegExp(`\\+\\s*\\(\\s*\\(?[^;]*\\*\\s*${samplePattern}[^;]*\\.xyz\\)?\\s*\\*\\s*tmpvar_\\d+\\.z`, "s").test(snippet)) {
    return "base-plus-base-times-sampled-color-mask";
  }
  if (new RegExp(`\\+\\s*\\(\\s*\\(?[^;]*${samplePattern}[^;]*\\.xyz`, "s").test(snippet)) {
    return "base-plus-sampled-color";
  }
  return "sampled-composite-unclassified";
}

function parseNumberListLiteralValues(value) {
  return String(value || "")
    .split(",")
    .map((part) => Number(part.trim()));
}

function parseVec3LiteralValues(value) {
  const values = parseNumberListLiteralValues(value);
  return values.length === 3 && values.every((part) => Number.isFinite(part)) ? values.map((part) => Math.round(part * 1000000) / 1000000) : null;
}

function uvRepeatForVaryingSource(shaderText, uvSource) {
  const varying = /^(var\d+)\.xy$/.exec(String(uvSource || ""))?.[1] || "";
  if (!varying) return null;
  const assignment = new RegExp(`\\b${varying}\\s*=\\s*([^;]+);`, "s").exec(shaderText);
  if (!assignment) return null;
  const expression = assignment[1].replace(/\s+/g, " ").trim();
  if (expression === "_MultiTexCoord0") return [1, 1];
  const uvTimesVec = /_MultiTexCoord0\s*\*\s*vec4\s*\(([^)]*)\)/.exec(expression);
  const vecTimesUv = /vec4\s*\(([^)]*)\)\s*\*\s*_MultiTexCoord0/.exec(expression);
  const values = parseNumberListLiteralValues((uvTimesVec || vecTimesUv)?.[1] || "");
  return values.length >= 2 && values.slice(0, 2).every((part) => Number.isFinite(part))
    ? values.slice(0, 2).map((part) => Math.round(part * 1000000) / 1000000)
    : null;
}

function sampledUvCompositeColorScale(shaderText, previewUvAnimation, className) {
  if (className !== "base-plus-base-times-sampled-color-scale") return null;
  const baseSampler = String(previewUvAnimation?.baseSampler || "");
  const snippet = sampledUvCompositeSnippet(shaderText, baseSampler);
  if (!snippet) return null;
  const samplePattern = `texture2D\\s*\\(\\s*${baseSampler}\\s*,`;
  const afterSample = new RegExp(`${samplePattern}[\\s\\S]{0,260}?\\.xyz\\s*\\*\\s*vec3\\s*\\(([^)]*)\\)`, "s").exec(snippet);
  const beforeSample = afterSample
    ? null
    : new RegExp(`vec3\\s*\\(([^)]*)\\)\\s*\\)?\\s*\\*\\s*${samplePattern}`, "s").exec(snippet);
  return parseVec3LiteralValues((afterSample || beforeSample)?.[1] || "");
}

function uvRepeatForTextureSampleExpression(shaderText, uvExpression) {
  const varying = /\b(var\d+)\.xy\b/.exec(String(uvExpression || ""))?.[1] || "";
  return varying ? uvRepeatForVaryingSource(shaderText, `${varying}.xy`) : null;
}

function sampledChannelSecondaryTextureFormula(shaderText, previewUvAnimation, className) {
  if (className !== "sampled-channel-times-secondary-texture") return null;
  const baseSampler = String(previewUvAnimation?.baseSampler || "");
  const snippet = sampledUvCompositeSnippet(shaderText, baseSampler);
  if (!snippet) return null;
  const samplePattern = `texture2D\\s*\\(\\s*${baseSampler}\\s*,`;
  const channelMatch = new RegExp(`${samplePattern}[\\s\\S]{0,180}?\\)\\.([xyzw])\\1\\1\\s*\\*\\s*texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*([^)]*)\\)`, "s").exec(
    snippet,
  );
  if (!channelMatch) return null;
  const scaleMatch = new RegExp(`${samplePattern}[\\s\\S]{0,360}?\\*\\s*vec3\\s*\\(([^)]*)\\)`, "s").exec(snippet);
  const secondarySampler = channelMatch[2];
  const secondaryUvRepeat = uvRepeatForTextureSampleExpression(shaderText, channelMatch[3]);
  const sampleStart = snippet.search(new RegExp(samplePattern, "s"));
  const beforeSample = sampleStart >= 0 ? snippet.slice(Math.max(0, sampleStart - 80), sampleStart) : "";
  return {
    channel: channelMatch[1],
    secondarySampler,
    secondaryUvRepeat,
    colorScale: parseVec3LiteralValues(scaleMatch?.[1] || "") || [1, 1, 1],
    operation: /\+\s*\(\s*\(?\s*$/.test(beforeSample) ? "add" : "multiply",
  };
}

function sampledOffsetFieldSecondaryTextureFormula(shaderText, previewUvAnimation, className) {
  if (className !== "sampled-offset-field-for-secondary-sampler") return null;
  const baseSampler = String(previewUvAnimation?.baseSampler || "");
  const snippet = sampledUvCompositeSnippet(shaderText, baseSampler);
  if (!snippet) return null;
  const secondaryMatch = new RegExp(
    `texture2D\\s*\\(\\s*${baseSampler}\\s*,[\\s\\S]{0,900}?texture2D\\s*\\(\\s*(sampler\\d+)\\s*,\\s*\\(\\s*(var\\d+)\\.xy\\s*\\+\\s*\\(`,
    "s",
  ).exec(snippet);
  if (!secondaryMatch) return null;
  return {
    secondarySampler: secondaryMatch[1],
    secondaryUvRepeat: uvRepeatForVaryingSource(shaderText, `${secondaryMatch[2]}.xy`),
    offsetFieldChannels: ["x", "y"],
    offsetFieldBias: [-0.5, -0.5],
    distortionAmplitudeChannel: "y",
  };
}

function sampledThresholdMaskFormula(shaderText, previewUvAnimation, className, shaderBuffer, runtimeSamplerRecords = []) {
  if (className !== "sampled-threshold-mask") return null;
  const baseSampler = String(previewUvAnimation?.baseSampler || "");
  const sampleMatch = textureSampleRegexForSampler(baseSampler).exec(shaderText);
  if (!sampleMatch) return null;
  const snippet = compactShaderExpression(
    shaderText.slice(Math.max(0, sampleMatch.index - 900), Math.min(shaderText.length, sampleMatch.index + 2600)),
  );
  const lookupMatch = /\*\s*texture2D\s*\(\s*(sampler\d+)\s*,\s*(var\d+)\.xy\s*\)\.xyz/.exec(snippet);
  if (!lookupMatch) return null;
  const lookupSampler = lookupMatch[1];
  const lookupRecord = (runtimeSamplerRecords || []).find(
    (record) => record.sampler === lookupSampler && record.kind === "tch0-inline-rgb-float-lookup" && Number.isFinite(Number(record.inlineLookupOffset)),
  );
  const lookupRamp = lookupRecord ? shadergraphInlineRgbFloatRamp(shaderBuffer, Number(lookupRecord.inlineLookupOffset)) : null;
  if (!lookupRamp) return null;
  return {
    lookupSampler,
    lookupUvRepeat: uvRepeatForVaryingSource(shaderText, `${lookupMatch[2]}.xy`),
    lookupRamp,
    sampleChannel: "x",
    vertexThresholdChannel: "a",
    vertexMaskChannel: "r",
    thresholdOffset: 0.01,
    thresholdScale: 0.99,
    colorScale: [2.5, 2.5, 2.5],
    colorBias: [-0.25, -0.25, -0.25],
    alphaSmoothLow: 0.5,
    alphaSmoothScale: 0.5,
  };
}

function runtimeInlineRampForSampler(shaderBuffer, runtimeSamplerRecords, sampler) {
  const record = (runtimeSamplerRecords || []).find(
    (candidate) =>
      candidate.sampler === sampler &&
      (candidate.kind === "tch0-inline-rgb-float-lookup" || candidate.kind === "tch0-inline-rgb-float-lookup-clamped") &&
      Number.isFinite(Number(candidate.inlineLookupOffset)),
  );
  return record ? shadergraphInlineRgbFloatRamp(shaderBuffer, Number(record.inlineLookupOffset)) : null;
}

function nestedSampledDistortionUvRepeat(shaderText) {
  const match = /\(\((var\d+)\.xy\s*\+\s*tmpvar_\d+\)\s*-\s*vec2\s*\(\s*0\.5\s*,\s*0\.5\s*\)\)/s.exec(String(shaderText || ""));
  return match ? uvRepeatForVaryingSource(shaderText, `${match[1]}.xy`) : null;
}

function nestedSampledWaterCompositeFormula(shaderText, previewUvAnimation, className, shaderBuffer, runtimeSamplerRecords = []) {
  if (!["base-plus-nested-sampled-color", "nested-water-throne-reveal"].includes(className)) return null;
  if (String(previewUvAnimation?.mode || "") !== "nestedSampledUvDistort") return null;

  const nestedBaseSampler = String(previewUvAnimation?.baseSampler || "");
  const distortionSampler = String(previewUvAnimation?.distortionSampler || "");
  const sampleOrder = textureSampleSamplersInOrder(shaderText);
  if (!nestedBaseSampler || !distortionSampler || !sampleOrder.length) return null;

  const baseColorSampler =
    className === "base-plus-nested-sampled-color"
      ? sampleOrder.find((sampler) => sampler !== distortionSampler && sampler !== nestedBaseSampler) || ""
      : "";
  const nestedBaseIndex = sampleOrder.indexOf(nestedBaseSampler);
  const distortionMaskSampler =
    sampleOrder.find(
      (sampler) =>
        sampler !== baseColorSampler &&
        sampler !== distortionSampler &&
        sampler !== nestedBaseSampler &&
        sampleOrder.indexOf(sampler) < nestedBaseIndex,
    ) || "";
  const reflectionLookupSampler =
    className === "base-plus-nested-sampled-color"
      ? [...sampleOrder]
          .reverse()
          .find(
            (sampler) =>
              sampler !== baseColorSampler &&
              sampler !== distortionMaskSampler &&
              sampler !== distortionSampler &&
              sampler !== nestedBaseSampler,
          ) || ""
      : "";
  const reflectionRecord = (runtimeSamplerRecords || []).find((record) => record.sampler === reflectionLookupSampler) || null;
  const reflectionRamp =
    reflectionRecord && Number.isFinite(Number(reflectionRecord.inlineLookupOffset))
      ? shadergraphInlineRgbFloatRamp(shaderBuffer, Number(reflectionRecord.inlineLookupOffset))
      : null;
  const baseColorRamp = className === "base-plus-nested-sampled-color" ? runtimeInlineRampForSampler(shaderBuffer, runtimeSamplerRecords, baseColorSampler) : null;

  const formula = {
    sampleOrder,
    distortionSampler,
    distortionUvRepeat: nestedSampledDistortionUvRepeat(shaderText),
    distortionMaskSampler,
    distortionMaskUvRepeat: uvRepeatForVaryingSource(shaderText, textureSampleVaryingSourceForSampler(shaderText, distortionMaskSampler)),
    nestedBaseSampler,
    nestedBaseUvRepeat: uvRepeatForVaryingSource(shaderText, textureSampleVaryingSourceForSampler(shaderText, nestedBaseSampler)),
    nestedOffsetScale: [0.2, 0.2],
    maskBias: 0.2,
    carveMax: 0.3,
  };

  if (className === "nested-water-throne-reveal") {
    return {
      ...formula,
      constantBaseColor: [0.205458, 0.607533, 0.726],
      carveScale: 0.8,
      revealThresholdScale: 0.05,
      revealAlphaScale: 0.8,
      vertexColorScale: 2,
    };
  }

  return {
    ...formula,
    baseColorSampler,
    baseColorUvRepeat: uvRepeatForVaryingSource(shaderText, textureSampleVaryingSourceForSampler(shaderText, baseColorSampler)),
    baseColorRamp,
    reflectionLookupSampler,
    reflectionUvScale: [1, 1],
    reflectionIntensity: 0.85,
    carveScale: 0.562963,
    vertexColorScale: 2,
    reflectionLookupRampHash: reflectionRamp?.rampHash || "",
    reflectionLookupRampSampleCount: reflectionRamp?.sampleCount || "",
  };
}

function uvAnimationCompositeFormulaForShadergraph(
  shaderText,
  previewUvAnimation,
  shaderBuffer = null,
  runtimeSamplerRecords = [],
  uniformDefaults = {},
) {
  const binaryHalfAtlasTint = binaryHalfAtlasTintCompositeFormula(shaderText, previewUvAnimation);
  if (binaryHalfAtlasTint) return binaryHalfAtlasTint;
  const staticBinaryHalfAtlasSelector = staticBinaryHalfAtlasSelectorFormula(shaderText, previewUvAnimation, uniformDefaults);
  if (staticBinaryHalfAtlasSelector) return staticBinaryHalfAtlasSelector;
  const className = uvAnimationCompositeFormulaClassForShadergraph(shaderText, previewUvAnimation);
  if (!className) return null;
  const formula = { className };
  const colorScale = sampledUvCompositeColorScale(shaderText, previewUvAnimation, className);
  if (colorScale) formula.colorScale = colorScale;
  const baseUvRepeat = uvRepeatForVaryingSource(shaderText, previewUvAnimation?.baseUvSource);
  if (baseUvRepeat) formula.baseUvRepeat = baseUvRepeat;
  const distortionUvRepeat = uvRepeatForVaryingSource(shaderText, previewUvAnimation?.distortionUvSource);
  if (distortionUvRepeat) formula.distortionUvRepeat = distortionUvRepeat;
  if (className === "base-plus-base-times-sampled-color-mask") {
    formula.maskChannel = "z";
  }
  const channelSecondary = sampledChannelSecondaryTextureFormula(shaderText, previewUvAnimation, className);
  if (channelSecondary) Object.assign(formula, channelSecondary);
  const offsetFieldSecondary = sampledOffsetFieldSecondaryTextureFormula(shaderText, previewUvAnimation, className);
  if (offsetFieldSecondary) Object.assign(formula, offsetFieldSecondary);
  const thresholdMask = sampledThresholdMaskFormula(shaderText, previewUvAnimation, className, shaderBuffer, runtimeSamplerRecords);
  if (thresholdMask) Object.assign(formula, thresholdMask);
  const nestedWater = nestedSampledWaterCompositeFormula(shaderText, previewUvAnimation, className, shaderBuffer, runtimeSamplerRecords);
  if (nestedWater) Object.assign(formula, nestedWater);
  return formula;
}

function uvAnimationRuntimeBlockerDetailsForRow({
  roleNames,
  previewUvAnimation,
  uvAnimationCompositeFormula,
  samplerTexturePaths = {},
  runtimeSamplerRecords = [],
  unimplementedRoleNames = "",
} = {}) {
  const roles = new Set(roleNames || []);
  if (!roles.has("uvAnimation")) return null;
  if (!nameSet(unimplementedRoleNames).has("uvAnimation")) return null;

  const details = {
    mode: uvAnimationModeForRow(previewUvAnimation),
    className: uvAnimationCompositeFormula?.className || "",
    requiredSamplers: {},
    missingSamplerTexturePaths: [],
    diagnosticRuntimeSamplers: [],
    unsupportedViewerFeatures: [],
  };

  if (details.mode === "nestedSampledUvDistort" && details.className === "base-plus-nested-sampled-color") {
    details.requiredSamplers = {
      baseColor: uvAnimationCompositeFormula?.baseColorSampler || "",
      distortion: previewUvAnimation?.distortionSampler || "",
      distortionMask: uvAnimationCompositeFormula?.distortionMaskSampler || "",
      nestedBase: previewUvAnimation?.baseSampler || "",
      reflectionLookup: uvAnimationCompositeFormula?.reflectionLookupSampler || "",
    };
    details.unsupportedViewerFeatures.push("nested-sampled-water-composite-shader");
  }

  for (const [role, sampler] of Object.entries(details.requiredSamplers)) {
    if (!sampler) continue;
    const record = (runtimeSamplerRecords || []).find((candidate) => candidate.sampler === sampler) || null;
    if (record?.kind === "tch0-inline-rgb-float-lookup-prefixed-hash-table-diagnostic") {
      details.diagnosticRuntimeSamplers.push({
        role,
        sampler,
        kind: record.kind,
        reason: "prefixed-hash-table-parser-layout-unresolved",
      });
      continue;
    }
    if (
      record?.kind === "tch0-inline-rgb-float-lookup" ||
      record?.kind === "tch0-inline-rgb-float-lookup-clamped"
    ) {
      continue;
    }
    if (!samplerTexturePaths[sampler]) {
      details.missingSamplerTexturePaths.push({ role, sampler });
    }
  }

  if (!details.missingSamplerTexturePaths.length && !details.diagnosticRuntimeSamplers.length && !details.unsupportedViewerFeatures.length) {
    details.unsupportedViewerFeatures.push(`viewer-unsupported-${details.mode || "uv-animation"}`);
  }

  return details;
}

function uvAnimationRuntimeBlockersForDetails(details) {
  if (!details) return "";
  const blockers = [];
  if (details.missingSamplerTexturePaths?.length) blockers.push("missing-sampler-texture-paths");
  if (details.diagnosticRuntimeSamplers?.length) blockers.push("diagnostic-runtime-samplers");
  for (const feature of details.unsupportedViewerFeatures || []) blockers.push(feature);
  return uniqueInOrder(blockers).join("|");
}

function analyzeShadergraphCached(filePath, cache) {
  if (!filePath) return { status: "not-a-shadergraph", analysis: null };
  if (!fs.existsSync(filePath)) return { status: "missing", analysis: null };
  if (cache.has(filePath)) return cache.get(filePath);
  try {
    const result = { status: "ok", analysis: analyzeShadergraph(filePath) };
    cache.set(filePath, result);
    return result;
  } catch (error) {
    const result = { status: "parse-error", analysis: null, error: error.message };
    cache.set(filePath, result);
    return result;
  }
}

function defaultRuntimeFields() {
  return {
    roleTexturePaths: "{}",
    inlineColors: "[]",
    previewUvAnimation: "null",
    previewUvAnimationMode: "",
    alphaMaskStats: "null",
    alphaRuntimeStage: "none",
    uvAnimationGapReason: "",
    uvAnimationGapInputs: "",
    uvAnimationRuntimeInputs: "",
    uvAnimationRuntimeStage: "none",
    uvAnimationRuntimeBlockers: "",
    uvAnimationRuntimeBlockerDetails: "null",
    uvAnimationCompositeFormula: "null",
    uvAnimationCompositeFormulaClass: "",
    reflectionMode: "",
    colorMode: "",
    alphaExecutionMode: "none",
    colorExecutionMode: "none",
    reflectionExecutionMode: "none",
    uvAnimationExecutionMode: "none",
    rimLookupGlow: "null",
    rimLookupGlowRampHash: "",
    rimLookupGlowSampleCount: "",
    viewDotRamp: "null",
    viewDotRampFormulaClass: "",
    viewDotRampSourceKind: "",
    viewDotRampSampler: "",
    viewDotRampHash: "",
    creatureLookupLit: "null",
    creatureLookupLitFormulaClass: "",
    creatureLookupLitRampHash: "",
    nativeShaderMode: "",
    nativeShaderBlocker: "",
    samplerUnits: "{}",
    samplerHashes: "{}",
    samplerTexturePaths: "{}",
    samplerTextureSources: "{}",
    unhashedSamplers: "",
    texturePathMissingSamplers: "",
    runtimeResolvedSamplers: "",
    unresolvedSamplers: "",
    runtimeSamplerRecords: "[]",
    runtimeSamplerKinds: "",
    nativeUniformBindings: "[]",
    nativeShaderInputs: "null",
    shaderPassStateFamily: "",
    shaderPassStateSignatures: "",
    shaderPassStateWord0s: "",
    shaderPassStateWord1s: "",
    shaderPassStateWord2s: "",
    shaderPassStateWord3s: "",
    shaderPassRenderState: "null",
    shaderPassBlendEnabled: "",
    shaderPassBlendPreset: "",
    shaderPassDepthWrite: "",
    shaderPassDepthTest: "",
    recommendedAlphaMode: "OPAQUE",
    unimplementedRoleNames: "",
  };
}

function materialRuntimePipelineRowsForGlb(
  item,
  glbJson,
  glbFilePath,
  shadergraphRoot,
  analysisCache,
  materialTextureRoot,
  materialTextureLookup,
) {
  const materials = glbJson.materials || [];
  if (!materials.length) {
    return [
      {
        rel: item.rel || "",
        modelLabel: item.modelLabel || item.variant || "",
        character: item.character || "",
        sourceRelativePath: item.sourceRelativePath || "",
        glbFilePath,
        materialIndex: "",
        materialName: "",
        shadergraphRel: "",
        shadergraphFound: "no",
        shadergraphStatus: "no-materials",
        roleNames: "",
        runtimeOnlyRoleNames: "",
        missingGlbRoleNames: "",
        samplerCount: 0,
        textureHashCount: 0,
        baseColorHash: "",
        normalHash: "",
        alphaMaskHash: "",
        emissiveHash: "",
        glbHasBaseColorTexture: "no",
        glbHasNormalTexture: "no",
        glbHasEmissiveTexture: "no",
        glbAlphaMode: "",
        ...defaultRuntimeFields(),
      },
    ];
  }

  return materials.map((material, materialIndex) => {
    const { shadergraphRel, shadergraphFilePath } = shadergraphFilePathForMaterial(material.name, shadergraphRoot);
    const { status, analysis, error } = analyzeShadergraphCached(shadergraphFilePath, analysisCache);
    const pbr = material.pbrMetallicRoughness || {};
    const suppressAlphaRoles = opaqueAlphaRoleOverrides.has(shadergraphRel);
    const roleNames = roleNamesForAnalysis(analysis).filter(
      (role) => !suppressAlphaRoles || (role !== "alphaBlend" && role !== "alphaMask"),
    );
    const missingGlbRoleNames = glbRoleGaps(material, analysis).filter(
      (role) => !suppressAlphaRoles || role !== "alpha",
    );
    const runtimeRoles = runtimeOnlyRoleNames(analysis);
    const shaderText =
      shadergraphFilePath && fs.existsSync(shadergraphFilePath) ? fs.readFileSync(shadergraphFilePath).toString("latin1") : "";
    const shaderBuffer =
      shadergraphFilePath && fs.existsSync(shadergraphFilePath) ? fs.readFileSync(shadergraphFilePath) : null;
    const varyingSources = shaderText ? extractVaryingSources(shaderText) : {};
    const uniformDefaults = shaderBuffer ? extractTch0UniformDefaults(shaderBuffer, shaderText) : {};
    const roleTexturePaths = roleTexturePathsForAnalysis(shadergraphRel, analysis, materialTextureRoot);
    if (suppressAlphaRoles) {
      delete roleTexturePaths.alphaBlend;
      delete roleTexturePaths.alphaMask;
    }
    const alphaMaskStats = alphaMaskStatsForTexturePath(roleTexturePaths.alphaMask || "", analysisCache);
    const inlineColors = shaderText ? extractInlineColorConstants(shaderText) : [];
    const rimLookupGlow = shaderBuffer ? rimLookupGlowForShadergraph(shaderBuffer, shaderText, analysis) : null;
    const nativeShaderMode = nativeShaderModeForShadergraph(shaderText, analysis);
    const samplerUnits = shaderBuffer ? samplerUnitBindingsForShadergraph(shaderBuffer, shaderText) : {};
    const runtimeSamplerRecords = shaderBuffer
      ? runtimeSamplerRecordsForShadergraph(shaderBuffer, analysis, samplerUnits, shaderText)
      : [];
    const samplerTextureBindings = samplerTextureBindingsWithRuntimeResolution(
      samplerTextureBindingsForAnalysis(shadergraphFilePath, analysis, materialTextureLookup),
      runtimeSamplerRecords,
    );
    const previewUvAnimation = shaderText
      ? previewUvAnimationForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {}, varyingSources, uniformDefaults)
      : null;
    const viewDotRamp = shaderBuffer
      ? viewDotRampForShadergraph(
          shaderBuffer,
          shaderText,
          runtimeSamplerRecords,
          samplerTextureBindings,
          uniformDefaults,
          previewUvAnimation,
        )
      : null;
    const creatureLookupLit =
      nativeShaderMode === "creature-lookup-lit"
        ? creatureLookupLitForShadergraph(shaderBuffer, shaderText, analysis, samplerTextureBindings, runtimeSamplerRecords)
        : null;
    const nativeUniformBindings = shaderBuffer ? nativeUniformBindingsForShadergraph(shaderBuffer, shaderText) : [];
    const nativeShaderInputs = shaderText
      ? nativeShaderInputsForShadergraph(
          nativeShaderMode,
          shaderText,
          analysis,
          samplerTextureBindings,
          rimLookupGlow,
          nativeUniformBindings,
          samplerUnits,
          runtimeSamplerRecords,
          viewDotRamp,
          creatureLookupLit,
          uniformDefaults,
        )
      : null;
    const nativeShaderBlocker = nativeShaderInputs?.blocker || "";
    const uvAnimationGapReason = shaderText && !previewUvAnimation
      ? previewUvAnimationGapReasonForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {}, roleNames)
      : "";
    const uvAnimationGapInputs = uvAnimationGapReason
      ? previewUvAnimationGapInputsForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {}, varyingSources)
      : [];
    const uvAnimationRuntimeInputs = previewUvAnimation
      ? previewUvAnimationInputsForRuntimeEvidence(previewUvAnimation, varyingSources)
      : uvAnimationGapInputs;
    const uvAnimationCompositeFormula = uvAnimationCompositeFormulaForShadergraph(
      shaderText,
      previewUvAnimation,
      shaderBuffer,
      runtimeSamplerRecords,
      uniformDefaults,
    );
    const uvAnimationCompositeFormulaClass = uvAnimationCompositeFormula?.className || "";
    const reflectionMode = analysis?.roles?.lookup
      ? "lookup-2d"
      : shaderText
        ? reflectionModeForSampler(shaderText, analysis?.roles?.reflection?.sampler || "")
        : "";
    const colorMode = rimLookupGlow
      ? "rimLookupGlow"
      : viewDotRamp?.canRenderNatively
        ? "viewDotRamp"
        : creatureLookupLit?.canRenderNatively
          ? "creatureLookupLit"
          : nativeShaderMode === "constant-fragment-color"
            ? "constantFragmentColor"
            : nativeShaderMode === "vertex-color-alpha-direct"
              ? "vertexColorAlpha"
              : nativeShaderMode === "vertex-alpha-uniform-color" && nativeShaderInputs?.vertexAlphaUniformColor?.canRenderNatively
                ? "vertexAlphaUniformColor"
                : colorModeForMaterial(material, analysis, shadergraphRel);
    const unimplementedRoleNames = unimplementedRoleNamesForRow(analysis, {
      reflectionMode,
      colorMode,
      previewUvAnimation,
      uvAnimationCompositeFormula,
      samplerTexturePaths: samplerTextureBindings.paths || {},
    });
    const passStateRecords = shadergraphPassStateRecords(shadergraphFilePath, analysisCache);
    const passStateSignatures = shadergraphPassStateSignatures(passStateRecords);
    const passStateWordColumns = shadergraphPassStateWordColumns(passStateRecords);
    const passRenderState = shadergraphPassRenderState(passStateRecords);
    const previewUvAnimationMode = uvAnimationModeForRow(previewUvAnimation);
    const alphaRuntimeStage = alphaRuntimeStageForRow({
      roleNames,
      missingGlbRoleNames,
      roleTexturePaths,
      alphaMaskStats,
    });
    const uvAnimationRuntimeStage = uvAnimationRuntimeStageForRow({
      roleNames,
      previewUvAnimation,
      uvAnimationGapReason,
      unimplementedRoleNames: unimplementedRoleNames.join("|"),
    });
    const uvAnimationRuntimeBlockerDetails = uvAnimationRuntimeBlockerDetailsForRow({
      roleNames,
      previewUvAnimation,
      uvAnimationCompositeFormula,
      samplerTexturePaths: samplerTextureBindings.paths || {},
      runtimeSamplerRecords,
      unimplementedRoleNames: unimplementedRoleNames.join("|"),
    });
    const uvAnimationRuntimeBlockers = uvAnimationRuntimeBlockersForDetails(uvAnimationRuntimeBlockerDetails);
    return {
      rel: item.rel || "",
      modelLabel: item.modelLabel || item.variant || "",
      character: item.character || "",
      sourceRelativePath: item.sourceRelativePath || "",
      glbFilePath,
      materialIndex,
      materialName: material.name || "",
      shadergraphRel,
      shadergraphFound: status === "ok" ? "yes" : "no",
      shadergraphStatus: status,
      shadergraphError: error || "",
      roleNames: roleNames.join("|"),
      runtimeOnlyRoleNames: runtimeRoles.join("|"),
      missingGlbRoleNames: missingGlbRoleNames.join("|"),
      samplerCount: analysis?.samplerTable?.length || 0,
      textureHashCount: analysis?.hashes?.length || 0,
      baseColorHash: roleHash(analysis, "baseColor"),
      normalHash: roleHash(analysis, "normal"),
      alphaMaskHash: roleNames.includes("alphaMask") ? roleHash(analysis, "alphaMask") : "",
      emissiveHash: roleHash(analysis, "emissive"),
      glbHasBaseColorTexture: pbr.baseColorTexture ? "yes" : "no",
      glbHasNormalTexture: material.normalTexture ? "yes" : "no",
      glbHasEmissiveTexture: material.emissiveTexture ? "yes" : "no",
      glbAlphaMode: material.alphaMode || "OPAQUE",
      roleTexturePaths: JSON.stringify(roleTexturePaths),
      inlineColors: JSON.stringify(inlineColors),
      previewUvAnimation: JSON.stringify(previewUvAnimation || null),
      previewUvAnimationMode,
      alphaMaskStats: JSON.stringify(alphaMaskStats || null),
      alphaRuntimeStage,
      uvAnimationGapReason,
      uvAnimationGapInputs: uvAnimationGapInputs.join("|"),
      uvAnimationRuntimeInputs: uvAnimationRuntimeInputs.join("|"),
      uvAnimationRuntimeStage,
      uvAnimationRuntimeBlockers,
      uvAnimationRuntimeBlockerDetails: JSON.stringify(uvAnimationRuntimeBlockerDetails),
      uvAnimationCompositeFormula: JSON.stringify(uvAnimationCompositeFormula),
      uvAnimationCompositeFormulaClass,
      reflectionMode,
      colorMode,
      alphaExecutionMode: alphaExecutionModeForRow({ roleNames, missingGlbRoleNames, roleTexturePaths }),
      colorExecutionMode: colorExecutionModeForRow({ colorMode, roleNames, missingGlbRoleNames, roleTexturePaths }),
      reflectionExecutionMode: reflectionExecutionModeForRow({ roleNames, roleTexturePaths, reflectionMode }),
      uvAnimationExecutionMode: uvAnimationExecutionModeForRow({
        roleNames,
        previewUvAnimation,
        uvAnimationGapReason,
        unimplementedRoleNames: unimplementedRoleNames.join("|"),
      }),
      shaderPassStateFamily: shadergraphPassStateFamily(passStateRecords),
      shaderPassStateSignatures: passStateSignatures.join("|"),
      ...passStateWordColumns,
      shaderPassRenderState: JSON.stringify(passRenderState),
      shaderPassBlendEnabled: renderStateBooleanSummary(passRenderState, "blendEnabled"),
      shaderPassBlendPreset: renderStateStringSummary(passRenderState, "blendPreset"),
      shaderPassDepthWrite: renderStateBooleanSummary(passRenderState, "depthWrite"),
      shaderPassDepthTest: renderStateBooleanSummary(passRenderState, "depthTest"),
      rimLookupGlow: JSON.stringify(rimLookupGlow),
      rimLookupGlowRampHash: rimLookupGlow?.rampHash || "",
      rimLookupGlowSampleCount: rimLookupGlow?.sampleCount || "",
      viewDotRamp: JSON.stringify(viewDotRamp || null),
      viewDotRampFormulaClass: viewDotRamp?.formulaClass || "",
      viewDotRampSourceKind: viewDotRamp?.sourceKind || "",
      viewDotRampSampler: viewDotRamp?.sampler || "",
      viewDotRampHash: viewDotRamp?.rampHash || "",
      creatureLookupLit: JSON.stringify(creatureLookupLit || null),
      creatureLookupLitFormulaClass: creatureLookupLit?.formulaClass || "",
      creatureLookupLitRampHash: creatureLookupLit?.rampHash || "",
      nativeShaderMode,
      nativeShaderBlocker,
      samplerUnits: JSON.stringify(samplerUnits),
      samplerHashes: JSON.stringify(samplerTextureBindings.hashes || {}),
      samplerTexturePaths: JSON.stringify(samplerTextureBindings.paths || {}),
      samplerTextureSources: JSON.stringify(samplerTextureBindings.sources || {}),
      unhashedSamplers: (samplerTextureBindings.unhashedSamplers || []).join("|"),
      texturePathMissingSamplers: (samplerTextureBindings.texturePathMissingSamplers || []).join("|"),
      runtimeResolvedSamplers: (samplerTextureBindings.runtimeResolvedSamplers || []).join("|"),
      unresolvedSamplers: (samplerTextureBindings.unresolvedSamplers || []).join("|"),
      runtimeSamplerRecords: JSON.stringify(runtimeSamplerRecords),
      runtimeSamplerKinds: runtimeSamplerRecords.map((record) => `${record.sampler}:${record.kind}`).join("|"),
      nativeUniformBindings: JSON.stringify(nativeUniformBindings),
      nativeShaderInputs: JSON.stringify(nativeShaderInputs),
      recommendedAlphaMode: recommendedAlphaModeForRoles(analysis, roleNames),
      unimplementedRoleNames: unimplementedRoleNames.join("|"),
    };
  });
}

function missingGlbRowsForItem(item, glbFilePath) {
  return [
    {
      rel: item.rel || "",
      modelLabel: item.modelLabel || item.variant || "",
      character: item.character || "",
      sourceRelativePath: item.sourceRelativePath || "",
      glbFilePath,
      materialIndex: "",
      materialName: "",
      shadergraphRel: "",
      shadergraphFound: "no",
      shadergraphStatus: "missing-glb",
      roleNames: "",
      runtimeOnlyRoleNames: "",
      missingGlbRoleNames: "",
      samplerCount: 0,
      textureHashCount: 0,
      baseColorHash: "",
      normalHash: "",
      alphaMaskHash: "",
      emissiveHash: "",
      glbHasBaseColorTexture: "no",
      glbHasNormalTexture: "no",
      glbHasEmissiveTexture: "no",
      glbAlphaMode: "",
      ...defaultRuntimeFields(),
    },
  ];
}

function buildMaterialRuntimePipelineRows({
  manifestItems = [],
  glbRoot = defaultGlbRoot,
  shadergraphRoot = defaultShadergraphRoot,
  materialTextureRoot = defaultMaterialTextureRoot,
  materialTextureMapPath = defaultMaterialTextureMapPath,
} = {}) {
  const rows = [];
  const analysisCache = new Map();
  const materialTextureLookup = buildMaterialTextureLookup(materialTextureMapPath);
  for (const item of manifestItems || []) {
    if (!item?.rel || !/\.glb$/i.test(item.rel)) continue;
    const glbFilePath = path.join(glbRoot, item.rel);
    if (!fs.existsSync(glbFilePath)) {
      rows.push(...missingGlbRowsForItem(item, glbFilePath));
      continue;
    }
    rows.push(
      ...materialRuntimePipelineRowsForGlb(
        item,
        readGlbJson(glbFilePath),
        glbFilePath,
        shadergraphRoot,
        analysisCache,
        materialTextureRoot,
        materialTextureLookup,
      ),
    );
  }
  return rows.sort(
    (left, right) =>
      String(left.rel).localeCompare(String(right.rel)) || Number(left.materialIndex || 0) - Number(right.materialIndex || 0),
  );
}

function countNames(rows, fieldName) {
  const counts = {};
  for (const row of rows || []) {
    for (const name of String(row[fieldName] || "").split("|").filter(Boolean)) {
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeMaterialRuntimePipelineRows(rows) {
  const materialRows = rows.filter((row) => row.materialIndex !== "");
  const byStatus = {};
  const byModel = new Map();
  for (const row of rows || []) {
    byStatus[row.shadergraphStatus] = (byStatus[row.shadergraphStatus] || 0) + 1;
    if (!byModel.has(row.rel)) byModel.set(row.rel, { rel: row.rel, modelLabel: row.modelLabel, materials: 0, gaps: 0 });
    const model = byModel.get(row.rel);
    if (row.materialIndex !== "") model.materials += 1;
    if (row.missingGlbRoleNames) model.gaps += 1;
  }
  const gapModels = [...byModel.values()].filter((model) => model.gaps > 0);
  const uvAnimationRows = rows.filter((row) => String(row.roleNames || "").split("|").includes("uvAnimation")).length;
  const implementedUvAnimationRows = rows.filter((row) => {
    if (!String(row.roleNames || "").split("|").includes("uvAnimation")) return false;
    try {
      return Boolean(JSON.parse(row.previewUvAnimation || "null")?.mode);
    } catch {
      return false;
    }
  }).length;
  const uvAnimationGapRows = rows.filter((row) => row.uvAnimationGapReason).length;
  const resolvedUvAnimationRows = rows.filter((row) => row.previewUvAnimationMode).length;
  const executableRows = rows.filter((row) => {
    return ["alphaExecutionMode", "colorExecutionMode", "reflectionExecutionMode", "uvAnimationExecutionMode"].some(
      (field) => row[field] === "runtime",
    );
  }).length;
  const diagnosticOnlyRows = rows.filter((row) => {
    const modes = ["alphaExecutionMode", "colorExecutionMode", "reflectionExecutionMode", "uvAnimationExecutionMode"].map(
      (field) => row[field],
    );
    return modes.includes("diagnostic") && !modes.includes("runtime");
  }).length;
  return {
    rows: rows.length,
    models: byModel.size,
    materialRows: materialRows.length,
    parsedShadergraphRows: rows.filter((row) => row.shadergraphStatus === "ok").length,
    missingShadergraphRows: rows.filter((row) => row.shadergraphStatus === "missing").length,
    parseErrorRows: rows.filter((row) => row.shadergraphStatus === "parse-error").length,
    rowsWithGlbRoleGaps: rows.filter((row) => row.missingGlbRoleNames).length,
    rowsWithRuntimeOnlyRoles: rows.filter((row) => row.runtimeOnlyRoleNames).length,
    rowsWithUnimplementedRoles: rows.filter((row) => row.unimplementedRoleNames).length,
    executableRows,
    diagnosticOnlyRows,
    rowsWithShaderPassState: rows.filter((row) => row.shaderPassStateSignatures).length,
    uvAnimationRows,
    implementedUvAnimationRows,
    resolvedUvAnimationRows,
    uvAnimationGapRows,
    byStatus: Object.fromEntries(Object.entries(byStatus).sort(([left], [right]) => left.localeCompare(right))),
    byRole: countNames(rows, "roleNames"),
    byRuntimeOnlyRole: countNames(rows, "runtimeOnlyRoleNames"),
    byUnimplementedRole: countNames(rows, "unimplementedRoleNames"),
    byColorMode: countNames(rows, "colorMode"),
    byRimLookupGlowSampleCount: countNames(rows, "rimLookupGlowSampleCount"),
    byViewDotRampSourceKind: countNames(rows, "viewDotRampSourceKind"),
    byViewDotRampFormulaClass: countNames(rows, "viewDotRampFormulaClass"),
    byNativeShaderMode: countNames(rows, "nativeShaderMode"),
    byNativeShaderBlocker: countNames(rows, "nativeShaderBlocker"),
    byUnhashedSampler: countNames(rows, "unhashedSamplers"),
    byTexturePathMissingSampler: countNames(rows, "texturePathMissingSamplers"),
    byRuntimeResolvedSampler: countNames(rows, "runtimeResolvedSamplers"),
    byUnresolvedSampler: countNames(rows, "unresolvedSamplers"),
    byRuntimeSamplerKind: countNames(rows, "runtimeSamplerKinds"),
    rowsWithRuntimeSamplerRecords: rows.filter((row) => {
      try {
        return JSON.parse(row.runtimeSamplerRecords || "[]").length > 0;
      } catch {
        return false;
      }
    }).length,
    rowsWithNativeUniformBindings: rows.filter((row) => {
      try {
        return JSON.parse(row.nativeUniformBindings || "[]").length > 0;
      } catch {
        return false;
      }
    }).length,
    byMissingGlbRole: countNames(rows, "missingGlbRoleNames"),
    byAlphaExecutionMode: countNames(rows, "alphaExecutionMode"),
    byAlphaRuntimeStage: countNames(rows, "alphaRuntimeStage"),
    byColorExecutionMode: countNames(rows, "colorExecutionMode"),
    byReflectionExecutionMode: countNames(rows, "reflectionExecutionMode"),
    byUvAnimationExecutionMode: countNames(rows, "uvAnimationExecutionMode"),
    byPreviewUvAnimationMode: countNames(rows, "previewUvAnimationMode"),
    byUvAnimationRuntimeStage: countNames(rows, "uvAnimationRuntimeStage"),
    byUvAnimationRuntimeBlocker: countNames(rows, "uvAnimationRuntimeBlockers"),
    byUvAnimationCompositeFormulaClass: countNames(rows, "uvAnimationCompositeFormulaClass"),
    byUvAnimationGapReason: countNames(rows, "uvAnimationGapReason"),
    byShaderPassStateFamily: countNames(rows, "shaderPassStateFamily"),
    byShaderPassStateWord0: countNames(rows, "shaderPassStateWord0s"),
    byShaderPassStateWord1: countNames(rows, "shaderPassStateWord1s"),
    byShaderPassStateWord2: countNames(rows, "shaderPassStateWord2s"),
    byShaderPassStateWord3: countNames(rows, "shaderPassStateWord3s"),
    byShaderPassBlendEnabled: countNames(rows, "shaderPassBlendEnabled"),
    byShaderPassDepthWrite: countNames(rows, "shaderPassDepthWrite"),
    byShaderPassDepthTest: countNames(rows, "shaderPassDepthTest"),
    byShaderPassBlendPreset: countNames(rows, "shaderPassBlendPreset"),
    gapModels: gapModels.sort((left, right) => right.gaps - left.gaps || left.rel.localeCompare(right.rel)).slice(0, 50),
  };
}

const columns = [
  "rel",
  "modelLabel",
  "character",
  "sourceRelativePath",
  "glbFilePath",
  "materialIndex",
  "materialName",
  "shadergraphRel",
  "shadergraphFound",
  "shadergraphStatus",
  "shadergraphError",
  "roleNames",
  "runtimeOnlyRoleNames",
  "missingGlbRoleNames",
  "samplerCount",
  "textureHashCount",
  "baseColorHash",
  "normalHash",
  "alphaMaskHash",
  "emissiveHash",
  "glbHasBaseColorTexture",
  "glbHasNormalTexture",
  "glbHasEmissiveTexture",
  "glbAlphaMode",
  "roleTexturePaths",
  "inlineColors",
  "previewUvAnimation",
  "previewUvAnimationMode",
  "alphaMaskStats",
  "alphaRuntimeStage",
  "uvAnimationGapReason",
  "uvAnimationGapInputs",
  "uvAnimationRuntimeInputs",
  "uvAnimationRuntimeStage",
  "uvAnimationRuntimeBlockers",
  "uvAnimationRuntimeBlockerDetails",
  "uvAnimationCompositeFormula",
  "uvAnimationCompositeFormulaClass",
  "reflectionMode",
  "colorMode",
  "alphaExecutionMode",
  "colorExecutionMode",
  "reflectionExecutionMode",
  "uvAnimationExecutionMode",
  "rimLookupGlow",
  "rimLookupGlowRampHash",
  "rimLookupGlowSampleCount",
  "viewDotRamp",
  "viewDotRampFormulaClass",
  "viewDotRampSourceKind",
  "viewDotRampSampler",
  "viewDotRampHash",
  "creatureLookupLit",
  "creatureLookupLitFormulaClass",
  "creatureLookupLitRampHash",
  "nativeShaderMode",
  "nativeShaderBlocker",
  "samplerUnits",
  "samplerHashes",
  "samplerTexturePaths",
  "samplerTextureSources",
  "unhashedSamplers",
  "texturePathMissingSamplers",
  "runtimeResolvedSamplers",
  "unresolvedSamplers",
  "runtimeSamplerRecords",
  "runtimeSamplerKinds",
  "nativeUniformBindings",
  "nativeShaderInputs",
  "shaderPassStateFamily",
  "shaderPassStateSignatures",
  "shaderPassStateWord0s",
  "shaderPassStateWord1s",
  "shaderPassStateWord2s",
  "shaderPassStateWord3s",
  "shaderPassRenderState",
  "shaderPassBlendEnabled",
  "shaderPassBlendPreset",
  "shaderPassDepthWrite",
  "shaderPassDepthTest",
  "recommendedAlphaMode",
  "unimplementedRoleNames",
];

function exportMaterialRuntimePipelineManifest({
  manifestPath = defaultManifestPath,
  glbRoot = defaultGlbRoot,
  shadergraphRoot = defaultShadergraphRoot,
  materialTextureRoot = defaultMaterialTextureRoot,
  materialTextureMapPath = defaultMaterialTextureMapPath,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const rows = buildMaterialRuntimePipelineRows({
    manifestItems: readManifestItems(manifestPath),
    glbRoot,
    shadergraphRoot,
    materialTextureRoot,
    materialTextureMapPath,
  });
  const summary = summarizeMaterialRuntimePipelineRows(rows);
  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportMaterialRuntimePipelineManifest({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    glbRoot: optionValue(args, "--glb-root", defaultGlbRoot),
    shadergraphRoot: optionValue(args, "--shadergraph-root", defaultShadergraphRoot),
    materialTextureRoot: optionValue(args, "--material-texture-root", defaultMaterialTextureRoot),
    materialTextureMapPath: optionValue(args, "--material-texture-map", defaultMaterialTextureMapPath),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildMaterialRuntimePipelineRows,
  colorModeForMaterial,
  exportMaterialRuntimePipelineManifest,
  glbRoleGaps,
  materialTexturePreviewPath,
  samplerTextureBindingsForAnalysis,
  buildMaterialTextureLookup,
  normalizeShadergraphRel,
  roleTexturePathsForAnalysis,
  summarizeMaterialRuntimePipelineRows,
};
