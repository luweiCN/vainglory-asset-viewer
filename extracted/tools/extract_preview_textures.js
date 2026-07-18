#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { initialize, decode_pvrtc } = require("texture2ddecoder-wasm");
const { analyzeShadergraph, extractNullTerminatedHashes } = require("./material_roles");
const { extractOutputAlphaSamplerChannels } = require("./effect_shadergraph_material_manifest");

const DEFAULT_OBJ_ROOT = "extracted/hero_assets_obj";
const DEFAULT_SHADER_ROOT = "extracted/hero_assets/shadergraphs";
const DEFAULT_DATA_ROOT = "extracted/ios_raw/Payload/GameKindred.app/Data";
const DEFAULT_OUTPUT_ROOT = "extracted/hero_assets_textures_preview";
const DEFAULT_MAP_PATH = "extracted/reports/preview_texture_map.json";
const DEFAULT_REPORT_PATH = "extracted/reports/preview_texture_map.tsv";
const DEFAULT_FAILURE_PATH = "extracted/reports/preview_texture_failures.tsv";
const DEFAULT_MATERIAL_OUTPUT_ROOT = "extracted/hero_assets_material_textures_preview";
const DEFAULT_MATERIAL_MAP_PATH = "extracted/reports/material_texture_map.json";
const DEFAULT_MATERIAL_REPORT_PATH = "extracted/reports/material_texture_map.tsv";
const DEFAULT_MATERIAL_ROLE_MAP_PATH = "extracted/reports/material_texture_roles.json";
const DEFAULT_MATERIAL_ROLE_REPORT_PATH = "extracted/reports/material_texture_roles.tsv";
const decodedTextureCache = new Map();

function usage() {
  console.error("Usage:");
  console.error(
    "  NODE_PATH=/tmp/vainglory-texture/node_modules node extracted/tools/extract_preview_textures.js",
  );
  console.error("Options:");
  console.error("  --obj-root PATH");
  console.error("  --shader-root PATH");
  console.error("  --data-root PATH");
  console.error("  --output-root PATH");
  console.error("  --map PATH");
}

function parseArgs(argv) {
  const options = {
    objRoot: DEFAULT_OBJ_ROOT,
    shaderRoot: DEFAULT_SHADER_ROOT,
    dataRoot: DEFAULT_DATA_ROOT,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    mapPath: DEFAULT_MAP_PATH,
    reportPath: DEFAULT_REPORT_PATH,
    failurePath: DEFAULT_FAILURE_PATH,
    materialOutputRoot: DEFAULT_MATERIAL_OUTPUT_ROOT,
    materialMapPath: DEFAULT_MATERIAL_MAP_PATH,
    materialReportPath: DEFAULT_MATERIAL_REPORT_PATH,
    materialRoleMapPath: DEFAULT_MATERIAL_ROLE_MAP_PATH,
    materialRoleReportPath: DEFAULT_MATERIAL_ROLE_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (!value) {
      usage();
      process.exit(2);
    }

    if (arg === "--obj-root") options.objRoot = value;
    else if (arg === "--shader-root") options.shaderRoot = value;
    else if (arg === "--data-root") options.dataRoot = value;
    else if (arg === "--output-root") options.outputRoot = value;
    else if (arg === "--map") options.mapPath = value;
    else {
      usage();
      process.exit(2);
    }
    index += 1;
  }

  return options;
}

function walkFiles(root, extension) {
  const output = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(entryPath);
    }
  }

  return output.sort();
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

function texturePathForHash(dataRoot, hash) {
  return path.join(dataRoot, hash.slice(0, 2), hash);
}

function textureMeta(dataRoot, hash) {
  const filePath = texturePathForHash(dataRoot, hash);
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  if (stat.size < 28) return null;

  const buffer = fs.readFileSync(filePath);
  if (buffer.readUInt32LE(0) !== stat.size) return null;

  const mipCount = buffer.readUInt32LE(4);
  const one = buffer.readUInt32LE(8);
  const format = buffer.readUInt32LE(12);
  const width = buffer.readUInt32LE(16);
  const height = buffer.readUInt32LE(20);
  const unknown = buffer.readUInt32LE(24);

  if (one !== 1 || unknown !== 0 || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    return null;
  }

  return {
    hash,
    filePath,
    buffer,
    mipCount,
    format,
    width,
    height,
    dataLength: buffer.byteLength - 28,
  };
}

function pvrtcLevelSize(width, height, is2bpp) {
  const bitsPerPixel = is2bpp ? 2 : 4;
  return Math.max((width * height * bitsPerPixel) / 8, 32);
}

function pvrtcMipChainSize(width, height, mipCount, is2bpp) {
  let total = 0;
  for (let level = 0; level < mipCount; level += 1) {
    total += pvrtcLevelSize(Math.max(1, width >> level), Math.max(1, height >> level), is2bpp);
  }
  return total;
}

function rawRgbMipChainSize(width, height, mipCount) {
  let total = 0;
  for (let level = 0; level < mipCount; level += 1) {
    total += Math.max(1, width >> level) * Math.max(1, height >> level) * 3;
  }
  return total;
}

function rawRgbaMipChainSize(width, height, mipCount) {
  let total = 0;
  for (let level = 0; level < mipCount; level += 1) {
    total += Math.max(1, width >> level) * Math.max(1, height >> level) * 4;
  }
  return total;
}

function rawRgbBaseLevel(meta) {
  const baseBytes = meta.width * meta.height * 3;
  if (meta.format !== 0 || meta.dataLength < baseBytes) return null;
  const expectedChainBytes = rawRgbMipChainSize(meta.width, meta.height, meta.mipCount);
  if (meta.dataLength !== baseBytes && meta.dataLength !== expectedChainBytes) return null;
  const input = meta.buffer.subarray(28, 28 + baseBytes);
  const output = new Uint8Array(meta.width * meta.height * 4);
  for (let pixel = 0; pixel < meta.width * meta.height; pixel += 1) {
    const source = pixel * 3;
    const target = pixel * 4;
    output[target] = input[source + 2];
    output[target + 1] = input[source + 1];
    output[target + 2] = input[source];
    output[target + 3] = 255;
  }
  return output;
}

function rawRgbaBaseLevel(meta) {
  const baseBytes = meta.width * meta.height * 4;
  if (meta.format !== 1 || meta.dataLength < baseBytes) return null;
  const expectedChainBytes = rawRgbaMipChainSize(meta.width, meta.height, meta.mipCount);
  if (meta.dataLength !== baseBytes && meta.dataLength !== expectedChainBytes) return null;
  const input = meta.buffer.subarray(28, 28 + baseBytes);
  const output = new Uint8Array(meta.width * meta.height * 4);
  for (let pixel = 0; pixel < meta.width * meta.height; pixel += 1) {
    const source = pixel * 4;
    output[source] = input[source + 2];
    output[source + 1] = input[source + 1];
    output[source + 2] = input[source];
    output[source + 3] = input[source + 3];
  }
  return output;
}

function embeddedWebpPayload(buffer, payloadOffset = 28) {
  if (!buffer || buffer.byteLength < payloadOffset + 12) return null;
  const searchEnd = Math.min(buffer.byteLength - 12, payloadOffset + 16);
  for (let offset = payloadOffset; offset <= searchEnd; offset += 1) {
    if (buffer.subarray(offset, offset + 4).toString("latin1") !== "RIFF") continue;
    if (buffer.subarray(offset + 8, offset + 12).toString("latin1") !== "WEBP") continue;
    const riffSize = buffer.readUInt32LE(offset + 4) + 8;
    if (riffSize <= 12 || offset + riffSize > buffer.byteLength) return buffer.subarray(offset);
    return buffer.subarray(offset, offset + riffSize);
  }
  return null;
}

function inferPvrtcMode(meta) {
  const size2 = pvrtcMipChainSize(meta.width, meta.height, meta.mipCount, true);
  const size4 = pvrtcMipChainSize(meta.width, meta.height, meta.mipCount, false);
  const diff2 = Math.abs(size2 - meta.dataLength);
  const diff4 = Math.abs(size4 - meta.dataLength);

  return {
    is2bpp: diff2 <= diff4,
    expectedSize: diff2 <= diff4 ? size2 : size4,
    sizeDiff: Math.min(diff2, diff4),
  };
}

function shaderCandidates(shaderRoot, objRel) {
  const dir = path.dirname(objRel);
  const variant = path.basename(objRel, ".obj");
  const graphDir = path.join(shaderRoot, dir);
  if (!fs.existsSync(graphDir)) return [];

  const allCandidates = walkFiles(graphDir, ".shadergraph");
  const exactCandidates = allCandidates.filter((filePath) => {
    const name = path.basename(filePath, ".shadergraph");
    return name === variant || name.startsWith(`${variant}.`);
  });

  if (exactCandidates.length) return exactCandidates;

  return allCandidates.filter((filePath) => {
    const name = path.basename(filePath, ".shadergraph");
    return name.includes(variant);
  });
}

function hashesInShadergraph(filePath) {
  return extractNullTerminatedHashes(fs.readFileSync(filePath));
}

function classifyPixels(bgra, width, height) {
  const step = Math.max(1, Math.floor((width * height) / 8192));
  const avg = [0, 0, 0, 0];
  const min = [255, 255, 255, 255];
  const max = [0, 0, 0, 0];
  let count = 0;

  for (let pixel = 0; pixel < width * height; pixel += step) {
    const source = pixel * 4;
    const rgba = [bgra[source + 2], bgra[source + 1], bgra[source], bgra[source + 3]];
    for (let channel = 0; channel < 4; channel += 1) {
      avg[channel] += rgba[channel];
      min[channel] = Math.min(min[channel], rgba[channel]);
      max[channel] = Math.max(max[channel], rgba[channel]);
    }
    count += 1;
  }

  for (let channel = 0; channel < 4; channel += 1) {
    avg[channel] = Math.round(avg[channel] / count);
  }

  const normalish = avg[2] > 185 && avg[2] - Math.max(avg[0], avg[1]) > 60;
  const darkish = avg[0] + avg[1] + avg[2] < 70;
  const colorRange = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);

  return { avg, min, max, normalish, darkish, colorRange };
}

async function decodeTexture(meta) {
  if (decodedTextureCache.has(meta.hash)) return decodedTextureCache.get(meta.hash);

  const webpPayload = embeddedWebpPayload(meta.buffer);
  if (webpPayload) {
    const decoded = {
      webpPayload: Buffer.from(webpPayload),
      mode: { embeddedWebp: true, is2bpp: false, sizeDiff: 0 },
      stats: { avg: [0, 0, 0, 255], min: [0, 0, 0, 255], max: [255, 255, 255, 255], normalish: false, darkish: false, colorRange: 255 },
    };
    decodedTextureCache.set(meta.hash, decoded);
    return decoded;
  }

  const rawRgb = rawRgbBaseLevel(meta);
  if (rawRgb) {
    const decoded = { bgra: rawRgb, mode: { rawRgb: true, is2bpp: false, sizeDiff: 0 }, stats: classifyPixels(rawRgb, meta.width, meta.height) };
    decodedTextureCache.set(meta.hash, decoded);
    return decoded;
  }

  const rawRgba = rawRgbaBaseLevel(meta);
  if (rawRgba) {
    const decoded = { bgra: rawRgba, mode: { rawRgba: true, is2bpp: false, sizeDiff: 0 }, stats: classifyPixels(rawRgba, meta.width, meta.height) };
    decodedTextureCache.set(meta.hash, decoded);
    return decoded;
  }

  const mode = inferPvrtcMode(meta);
  if (mode.sizeDiff > 64) throw new Error(`unsupported texture layout diff=${mode.sizeDiff}`);

  const baseBytes = pvrtcLevelSize(meta.width, meta.height, mode.is2bpp);
  const compressed = meta.buffer.subarray(28, 28 + baseBytes);
  const bgra = await decode_pvrtc(compressed, meta.width, meta.height, mode.is2bpp);
  if (!bgra) throw new Error("decode_pvrtc returned null");

  const decoded = { bgra, mode, stats: classifyPixels(bgra, meta.width, meta.height) };
  decodedTextureCache.set(meta.hash, decoded);
  return decoded;
}

function scoreCandidate(candidate) {
  const { meta, stats, shaderPath } = candidate;
  const name = path.basename(shaderPath).toLowerCase();
  let score = meta.width * meta.height;

  if (meta.format === 9) score += 10_000_000;
  if (stats.colorRange > 80) score += stats.colorRange * 1000;
  if (name.includes("guob")) score -= 300_000;
  if (name.includes("eye") || name.includes("glow") || name.includes("light")) score -= 200_000;
  if (name.includes("prop") || name.includes("weapon") || name.includes("box")) score -= 60_000;
  if (stats.normalish) score -= 100_000_000;
  if (stats.darkish) score -= 20_000_000;

  return score;
}

function writePng(outputPath, bgra, width, height, options = {}) {
  const png = new PNG({ width, height });
  const preserveAlpha = Boolean(options.preserveAlpha);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    png.data[source] = bgra[source + 2];
    png.data[source + 1] = bgra[source + 1];
    png.data[source + 2] = bgra[source];
    png.data[source + 3] = preserveAlpha ? bgra[source + 3] : 255;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function alphaMaskChannelByte(bgra, source, channel) {
  if (channel === "x") return bgra[source + 2];
  if (channel === "y") return bgra[source + 1];
  if (channel === "z") return bgra[source];
  return bgra[source + 3];
}

function writeAlphaMaskPng(outputPath, bgra, width, height, channel = "w") {
  const png = new PNG({ width, height });
  const maskChannel = ["x", "y", "z", "w"].includes(channel) ? channel : "w";

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const alpha = alphaMaskChannelByte(bgra, source, maskChannel);
    png.data[source] = alpha;
    png.data[source + 1] = alpha;
    png.data[source + 2] = alpha;
    png.data[source + 3] = 255;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

function writeMetallicRoughnessPng(outputPath, bgra, width, height) {
  const png = new PNG({ width, height });

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const specMask = bgra[source + 3];
    const roughness = 255 - specMask;
    png.data[source] = 255;
    png.data[source + 1] = roughness;
    png.data[source + 2] = 0;
    png.data[source + 3] = 255;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

async function selectPreviewTexture(options, objRel) {
  const candidates = [];
  const failures = [];

  for (const shaderPath of shaderCandidates(options.shaderRoot, objRel)) {
    for (const hash of hashesInShadergraph(shaderPath)) {
      const meta = textureMeta(options.dataRoot, hash);
      if (!meta) continue;

      try {
        const decoded = await decodeTexture(meta);
        const candidate = {
          hash,
          shaderPath,
          meta,
          ...decoded,
        };
        candidate.score = scoreCandidate(candidate);
        candidates.push(candidate);
      } catch (error) {
        failures.push(`${objRel}\t${hash}\t${error.message}`);
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return { selected: candidates[0] || null, failures };
}

async function selectShadergraphTexture(options, shaderPath) {
  const candidates = [];
  const failures = [];

  for (const hash of hashesInShadergraph(shaderPath)) {
    const meta = textureMeta(options.dataRoot, hash);
    if (!meta) continue;

    try {
      const decoded = await decodeTexture(meta);
      const candidate = {
        hash,
        shaderPath,
        meta,
        ...decoded,
      };
      candidate.score = scoreCandidate(candidate);
      candidates.push(candidate);
    } catch (error) {
      failures.push(`${normalizeRel(shaderPath)}\t${hash}\t${error.message}`);
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return { selected: candidates[0] || null, failures };
}

function materialTextureOutputPath(options, shaderPath, extension = ".png") {
  const rel = normalizeRel(path.relative(options.shaderRoot, shaderPath)).replace(/\.shadergraph$/i, extension);
  return normalizeRel(path.join(options.materialOutputRoot, rel));
}

function materialRoleTextureOutputPath(options, shaderPath, role, extension = ".png") {
  if (role === "baseColor") return materialTextureOutputPath(options, shaderPath, extension);
  const rel = normalizeRel(path.relative(options.shaderRoot, shaderPath)).replace(/\.shadergraph$/i, `.${role}${extension}`);
  return normalizeRel(path.join(options.materialOutputRoot, rel));
}

function materialSamplerTextureOutputPath(options, shaderPath, sampler, extension = ".png") {
  const safeSampler = String(sampler || "sampler").replace(/[^A-Za-z0-9_-]/g, "_");
  const rel = normalizeRel(path.relative(options.shaderRoot, shaderPath)).replace(/\.shadergraph$/i, `.sampler-${safeSampler}${extension}`);
  return normalizeRel(path.join(options.materialOutputRoot, rel));
}

async function decodeTextureHash(options, shaderPath, hash) {
  const meta = textureMeta(options.dataRoot, hash);
  if (!meta) return { selected: null, failure: `${normalizeRel(shaderPath)}\t${hash}\ttexture asset not found` };

  try {
    const decoded = await decodeTexture(meta);
    const selected = {
      hash,
      shaderPath,
      meta,
      ...decoded,
    };
    selected.score = scoreCandidate(selected);
    return { selected, failure: null };
  } catch (error) {
    return { selected: null, failure: `${normalizeRel(shaderPath)}\t${hash}\t${error.message}` };
  }
}

function textureRoleItem(role, sampler, outputPng, selected) {
  return {
    role,
    sampler,
    texture: outputPng,
    hash: selected.hash,
    format: selected.meta.format,
    width: selected.meta.width,
    height: selected.meta.height,
    mipCount: selected.meta.mipCount,
    is2bpp: selected.mode.is2bpp,
    score: selected.score,
    avgRGBA: selected.stats.avg,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await initialize();

  const objFiles = walkFiles(options.objRoot, ".obj");
  const items = [];
  const materialItems = [];
  const materialItemsByShader = new Map();
  const failureRows = ["obj\thash_or_reason\tdetail"];
  const reportRows = [
    "identity\ttexture\tshadergraph\thash\tformat\twidth\theight\tmipCount\tis2bpp\tscore\tavgRGBA",
  ];
  const materialReportRows = [
    "shadergraph\ttexture\thash\tformat\twidth\theight\tmipCount\tis2bpp\tscore\tavgRGBA",
  ];
  const materialRoleReportRows = [
    "shadergraph\trole\tsampler\ttexture\thash\tformat\twidth\theight\tmipCount\tis2bpp\tscore\tavgRGBA",
  ];

  async function ensureMaterialTexture(shaderPath) {
    const shaderKey = normalizeRel(shaderPath);
    if (materialItemsByShader.has(shaderKey)) return;

    const analysis = analyzeShadergraph(shaderPath);
    const shaderText = fs.readFileSync(shaderPath).toString("latin1");
    const textures = {};
    const isEmissive = Boolean(analysis.roles.emissive);
    let baseSelected = null;
    let baseSampler = null;

    async function addRole(role, roleAnalysis) {
      if (!roleAnalysis?.hash) return null;
      const result = await decodeTextureHash(options, shaderPath, roleAnalysis.hash);
      if (result.failure) failureRows.push(result.failure);
      if (!result.selected) return null;

      const extension = result.selected.webpPayload ? ".webp" : ".png";
      const outputPng = materialRoleTextureOutputPath(options, shaderPath, role, extension);
      if (result.selected.webpPayload) {
        fs.mkdirSync(path.dirname(outputPng), { recursive: true });
        fs.writeFileSync(outputPng, result.selected.webpPayload);
      } else if (role === "alphaMask") {
        const alphaChannels = extractOutputAlphaSamplerChannels(shaderText, roleAnalysis.sampler);
        writeAlphaMaskPng(outputPng, result.selected.bgra, result.selected.meta.width, result.selected.meta.height, alphaChannels[0]);
      } else {
        writePng(outputPng, result.selected.bgra, result.selected.meta.width, result.selected.meta.height, {
          preserveAlpha: isEmissive && role === "baseColor",
        });
      }
      const item = textureRoleItem(role, roleAnalysis.sampler, outputPng, result.selected);
      textures[role] = item;
      materialRoleReportRows.push(
        [
          shaderKey,
          item.role,
          item.sampler,
          item.texture,
          item.hash,
          item.format,
          item.width,
          item.height,
          item.mipCount,
          item.is2bpp,
          item.score,
          item.avgRGBA.join(","),
        ].join("\t"),
      );
      return result.selected;
    }

    if (analysis.roles.baseColor) {
      baseSampler = analysis.roles.baseColor.sampler;
      baseSelected = await addRole("baseColor", analysis.roles.baseColor);
    }

    if (!baseSelected) {
      const result = await selectShadergraphTexture(options, shaderPath);
      for (const failure of result.failures) failureRows.push(failure);
      if (!result.selected) return;

      baseSelected = result.selected;
      baseSampler = "scoreCandidate";
      const extension = baseSelected.webpPayload ? ".webp" : ".png";
      const outputPng = materialTextureOutputPath(options, shaderPath, extension);
      if (baseSelected.webpPayload) {
        fs.mkdirSync(path.dirname(outputPng), { recursive: true });
        fs.writeFileSync(outputPng, baseSelected.webpPayload);
      } else {
        writePng(outputPng, baseSelected.bgra, baseSelected.meta.width, baseSelected.meta.height, {
          preserveAlpha: isEmissive,
        });
      }
      textures.baseColor = textureRoleItem("baseColor", baseSampler, outputPng, baseSelected);
    }

    if (analysis.roles.normal) await addRole("normal", analysis.roles.normal);
    if (analysis.roles.alphaMask) await addRole("alphaMask", analysis.roles.alphaMask);
    if (analysis.roles.reflection) await addRole("reflection", analysis.roles.reflection);
    if (analysis.roles.lookup) await addRole("lookup", analysis.roles.lookup);

    const samplersWithTexture = new Set(
      Object.values(textures)
        .map((textureInfo) => textureInfo?.sampler)
        .filter(Boolean),
    );
    for (const [sampler, hash] of Object.entries(analysis.samplerToHash || {})) {
      if (!sampler || !hash || samplersWithTexture.has(sampler)) continue;
      const result = await decodeTextureHash(options, shaderPath, hash);
      if (result.failure) failureRows.push(result.failure);
      if (!result.selected) continue;

      const role = `sampler:${sampler}`;
      const extension = result.selected.webpPayload ? ".webp" : ".png";
      const outputPng = materialSamplerTextureOutputPath(options, shaderPath, sampler, extension);
      if (result.selected.webpPayload) {
        fs.mkdirSync(path.dirname(outputPng), { recursive: true });
        fs.writeFileSync(outputPng, result.selected.webpPayload);
      } else {
        writePng(outputPng, result.selected.bgra, result.selected.meta.width, result.selected.meta.height, {
          preserveAlpha: true,
        });
      }
      const item = textureRoleItem(role, sampler, outputPng, result.selected);
      textures[role] = item;
      samplersWithTexture.add(sampler);
      materialRoleReportRows.push(
        [
          shaderKey,
          item.role,
          item.sampler,
          item.texture,
          item.hash,
          item.format,
          item.width,
          item.height,
          item.mipCount,
          item.is2bpp,
          item.score,
          item.avgRGBA.join(","),
        ].join("\t"),
      );
    }

    if (isEmissive && textures.baseColor) {
      textures.emissive = {
        role: "emissive",
        sampler: textures.baseColor.sampler,
        texture: textures.baseColor.texture,
        hash: textures.baseColor.hash,
        width: textures.baseColor.width,
        height: textures.baseColor.height,
      };
      materialRoleReportRows.push(
        [
          shaderKey,
          "emissive",
          textures.emissive.sampler,
          textures.emissive.texture,
          textures.emissive.hash,
          textures.baseColor.format,
          textures.baseColor.width,
          textures.baseColor.height,
          textures.baseColor.mipCount,
          textures.baseColor.is2bpp,
          textures.baseColor.score,
          textures.baseColor.avgRGBA.join(","),
        ].join("\t"),
      );
    }

    if (baseSelected.bgra) {
      const roughnessOutput = materialRoleTextureOutputPath(options, shaderPath, "metallicRoughness");
      writeMetallicRoughnessPng(roughnessOutput, baseSelected.bgra, baseSelected.meta.width, baseSelected.meta.height);
      textures.metallicRoughness = {
        role: "metallicRoughness",
        sampler: baseSampler,
        texture: roughnessOutput,
        sourceHash: baseSelected.hash,
        width: baseSelected.meta.width,
        height: baseSelected.meta.height,
      };
      materialRoleReportRows.push(
        [
          shaderKey,
          "metallicRoughness",
          baseSampler,
          roughnessOutput,
          baseSelected.hash,
          baseSelected.meta.format,
          baseSelected.meta.width,
          baseSelected.meta.height,
          baseSelected.meta.mipCount,
          baseSelected.mode.is2bpp,
          baseSelected.score,
          baseSelected.stats.avg.join(","),
        ].join("\t"),
      );
    }

    const item = {
      key: shaderKey,
      shadergraph: shaderKey,
      texture: textures.baseColor.texture,
      hash: baseSelected.hash,
      format: baseSelected.meta.format,
      width: baseSelected.meta.width,
      height: baseSelected.meta.height,
      mipCount: baseSelected.meta.mipCount,
      is2bpp: baseSelected.mode.is2bpp,
      score: baseSelected.score,
      avgRGBA: baseSelected.stats.avg,
      samplerToHash: analysis.samplerToHash,
      textures,
      alphaMode: isEmissive ? "BLEND" : undefined,
      emissiveStrength: isEmissive ? 1.8 : undefined,
    };
    materialItemsByShader.set(shaderKey, item);
    materialItems.push(item);
    materialReportRows.push(
      [
        item.shadergraph,
        item.texture,
        item.hash,
        item.format,
        item.width,
        item.height,
        item.mipCount,
        item.is2bpp,
        item.score,
        item.avgRGBA.join(","),
      ].join("\t"),
    );
  }

  for (const objPath of objFiles) {
    const objRel = normalizeRel(path.relative(options.objRoot, objPath));
    const identity = objRel.replace(/\.obj$/i, "");
    const outputPng = normalizeRel(path.join(options.outputRoot, `${identity}.png`));
    for (const shaderPath of shaderCandidates(options.shaderRoot, objRel)) {
      await ensureMaterialTexture(shaderPath);
    }
    const result = await selectPreviewTexture(options, objRel);

    for (const failure of result.failures) failureRows.push(failure);

    if (!result.selected) {
      failureRows.push(`${objRel}\tno-preview-texture\tno matching diffuse-like texture found`);
      continue;
    }

    const selected = result.selected;
    const selectedExtension = selected.webpPayload ? ".webp" : ".png";
    const selectedOutput = selected.webpPayload ? outputPng.replace(/\.png$/i, selectedExtension) : outputPng;
    if (selected.webpPayload) {
      fs.mkdirSync(path.dirname(selectedOutput), { recursive: true });
      fs.writeFileSync(selectedOutput, selected.webpPayload);
    } else {
      writePng(selectedOutput, selected.bgra, selected.meta.width, selected.meta.height);
    }

    items.push({
      key: identity,
      obj: objRel,
      texture: selectedOutput,
      shadergraph: normalizeRel(selected.shaderPath),
      hash: selected.hash,
      format: selected.meta.format,
      width: selected.meta.width,
      height: selected.meta.height,
      mipCount: selected.meta.mipCount,
      is2bpp: selected.mode.is2bpp,
      score: selected.score,
      avgRGBA: selected.stats.avg,
    });

    reportRows.push(
      [
        identity,
        selectedOutput,
        normalizeRel(selected.shaderPath),
        selected.hash,
        selected.meta.format,
        selected.meta.width,
        selected.meta.height,
        selected.meta.mipCount,
        selected.mode.is2bpp,
        selected.score,
        selected.stats.avg.join(","),
      ].join("\t"),
    );
  }

  for (const shaderPath of walkFiles(options.shaderRoot, ".shadergraph")) {
    await ensureMaterialTexture(shaderPath);
  }

  fs.mkdirSync(path.dirname(options.mapPath), { recursive: true });
  fs.writeFileSync(
    options.mapPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: items.length,
        items,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(options.reportPath, `${reportRows.join("\n")}\n`);
  fs.writeFileSync(
    options.materialMapPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: materialItems.length,
        items: materialItems,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(options.materialReportPath, `${materialReportRows.join("\n")}\n`);
  fs.writeFileSync(
    options.materialRoleMapPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: materialItems.length,
        items: materialItems,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(options.materialRoleReportPath, `${materialRoleReportRows.join("\n")}\n`);
  fs.writeFileSync(options.failurePath, `${failureRows.join("\n")}\n`);

  console.log(`objects=${objFiles.length} textured=${items.length} missing=${objFiles.length - items.length}`);
  console.log(`materials=${materialItems.length}`);
  console.log(`map=${options.mapPath}`);
  console.log(`materialMap=${options.materialMapPath}`);
  console.log(`materialRoleMap=${options.materialRoleMapPath}`);
  console.log(`report=${options.reportPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
