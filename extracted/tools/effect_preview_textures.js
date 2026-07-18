#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultMaterialManifestPath = "extracted/viewer/effect-shadergraph-material-manifest.json";
const defaultDataRoot = "extracted/ios_raw/Payload/GameKindred.app/Data";
const defaultOutputRoot = "extracted/effect_textures_preview";
const defaultHashOutputRoot = "extracted/effect_textures_by_hash";
const defaultReportPath = "extracted/reports/effect_preview_textures.tsv";
const PREVIEW_TEXTURE_OPAQUE_ALPHA = 240;
const PREVIEW_TEXTURE_TRANSPARENT_ALPHA = 16;
const PREVIEW_TEXTURE_OPAQUE_COVERAGE_LIMIT = 0.65;
const PREVIEW_TEXTURE_MIN_TRANSPARENT_COVERAGE = 0.08;
const PREVIEW_TEXTURE_MIN_CARD_ALPHA_COVERAGE = 0.35;

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

function previewTexturePathForShadergraph(relativePath, outputRoot = defaultOutputRoot, extension = ".png") {
  if (!relativePath) return "";
  const normalizedExtension = String(extension || ".png").startsWith(".") ? extension : `.${extension}`;
  return normalizeRel(path.join(outputRoot, relativePath.replace(/\.shadergraph$/i, normalizedExtension)));
}

function texturePathForHashPreview(hash, outputRoot = defaultHashOutputRoot, extension = ".png") {
  if (!hash) return "";
  const normalizedExtension = String(extension || ".png").startsWith(".") ? extension : `.${extension}`;
  return normalizeRel(path.join(outputRoot, hash.slice(0, 2), `${hash}${normalizedExtension}`));
}

function effectTextureHashForItem(item) {
  return item?.roles?.baseColor?.hash || item?.textureHashes?.[0] || "";
}

function effectPreviewTextureRows(manifest, options = {}) {
  const outputRoot = options.outputRoot || defaultOutputRoot;
  const onlyHookLinked = options.onlyHookLinked === true;
  const onlyPfxLinked = options.onlyPfxLinked !== false;
  const rows = [];

  for (const item of manifest?.items || []) {
    if (!item.relativePath) continue;
    const hookLinked = Boolean((item.hookTokens || []).length || (item.hookEffectTokens || []).length);
    const pfxLinked = Boolean((item.pfxPaths || []).length);
    if (onlyHookLinked && !hookLinked) continue;
    if (!onlyHookLinked && onlyPfxLinked && !pfxLinked && !hookLinked) continue;
    const hash = effectTextureHashForItem(item);
    if (!hash) continue;
    const previewAlphaSourceChannels = (item.previewAlphaSourceChannels || []).filter(Boolean);
    rows.push({
      relativePath: item.relativePath,
      hash,
      ...(previewAlphaSourceChannels.length ? { previewAlphaSourceChannels } : {}),
      outputPath: previewTexturePathForShadergraph(item.relativePath, outputRoot),
    });
  }

  return rows;
}

function sampledDistortionTextureRows(manifest, options = {}) {
  const outputRoot = options.outputRoot || defaultHashOutputRoot;
  const byHash = new Map();

  function addSamplerHash(item, sampler) {
    if (!sampler) return;
    const hash = item?.samplerToHash?.[sampler] || "";
    if (!hash) return;
    const row = byHash.get(hash) || {
      hash,
      outputPath: texturePathForHashPreview(hash, outputRoot),
      relativePaths: [],
    };
    if (item.relativePath && !row.relativePaths.includes(item.relativePath)) row.relativePaths.push(item.relativePath);
    byHash.set(hash, row);
  }

  for (const item of manifest?.items || []) {
    const uvAnimation = item?.previewUvAnimation;
    if (uvAnimation?.mode === "sampledDistort") {
      addSamplerHash(item, uvAnimation.distortionSampler);
      addSamplerHash(item, uvAnimation.amplitudeMaskSampler);
    }
    if (uvAnimation?.mode === "sampledRotate") addSamplerHash(item, uvAnimation.rotationSampler);
    if (uvAnimation?.mode === "sampledWarp") {
      addSamplerHash(item, uvAnimation.distortionSampler);
      addSamplerHash(item, uvAnimation.baseSampler);
    }
    if (uvAnimation?.mode === "sampledOffsetField") {
      addSamplerHash(item, uvAnimation.distortionSampler);
      addSamplerHash(item, uvAnimation.baseSampler);
    }
    if (uvAnimation?.mode === "sampledCenterScaleDistort") {
      addSamplerHash(item, uvAnimation.baseSampler);
      addSamplerHash(item, uvAnimation.distortionSampler);
      addSamplerHash(item, uvAnimation.amplitudeMaskSampler);
    }
    if (uvAnimation?.mode === "sampledScaleRotate") {
      addSamplerHash(item, uvAnimation.baseSampler);
      addSamplerHash(item, uvAnimation.scaleSampler);
      addSamplerHash(item, uvAnimation.scaleMaskSampler);
    }
  }

  return [...byHash.values()].sort((left, right) => left.hash.localeCompare(right.hash));
}

function textureMeta(dataRoot, hash) {
  const filePath = path.join(dataRoot, hash.slice(0, 2), hash);
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (stat.size < 28) return null;
  const buffer = fs.readFileSync(filePath);
  if (buffer.readUInt32LE(0) !== stat.size) return null;
  const meta = {
    hash,
    filePath,
    buffer,
    mipCount: buffer.readUInt32LE(4),
    one: buffer.readUInt32LE(8),
    format: buffer.readUInt32LE(12),
    width: buffer.readUInt32LE(16),
    height: buffer.readUInt32LE(20),
    unknown: buffer.readUInt32LE(24),
    dataLength: buffer.byteLength - 28,
  };
  if (meta.one !== 1 || meta.unknown !== 0 || meta.width <= 0 || meta.height <= 0 || meta.width > 4096 || meta.height > 4096) {
    return null;
  }
  return meta;
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

function inferPvrtcMode(meta) {
  const size2 = pvrtcMipChainSize(meta.width, meta.height, meta.mipCount, true);
  const size4 = pvrtcMipChainSize(meta.width, meta.height, meta.mipCount, false);
  const diff2 = Math.abs(size2 - meta.dataLength);
  const diff4 = Math.abs(size4 - meta.dataLength);
  return {
    is2bpp: diff2 <= diff4,
    sizeDiff: Math.min(diff2, diff4),
  };
}

async function decodeTexture(meta, decodePvrtc) {
  const mode = inferPvrtcMode(meta);
  if (mode.sizeDiff > 16 * 1024) throw new Error(`unsupported texture layout diff=${mode.sizeDiff}`);
  const baseBytes = pvrtcLevelSize(meta.width, meta.height, mode.is2bpp);
  const bgra = await decodePvrtc(meta.buffer.subarray(28, 28 + baseBytes), meta.width, meta.height, mode.is2bpp);
  if (!bgra) throw new Error("decode_pvrtc returned null");
  return { bgra, mode };
}

function rgbaMipChainSize(width, height, mipCount) {
  let total = 0;
  for (let level = 0; level < mipCount; level += 1) {
    total += Math.max(1, width >> level) * Math.max(1, height >> level) * 4;
  }
  return total;
}

function rawRgbaBaseLevel(meta) {
  if (!meta || meta.dataLength !== rgbaMipChainSize(meta.width, meta.height, meta.mipCount)) return null;
  return meta.buffer.subarray(28, 28 + meta.width * meta.height * 4);
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

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function effectPreviewAlphaFromRgba(red, green, blue, alpha) {
  if (alpha < 250) return clampByte(alpha);
  const maxChannel = Math.max(red, green, blue);
  if (maxChannel <= 4) return 0;
  const minChannel = Math.min(red, green, blue);
  const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = maxChannel - minChannel;
  return clampByte(Math.max(luma, Math.min(maxChannel, chroma * 0.72)));
}

function effectPreviewAlphaFromChannels(red, green, blue, alpha, channels = []) {
  const values = channels
    .map((channel) => {
      if (channel === "x") return red;
      if (channel === "y") return green;
      if (channel === "z") return blue;
      if (channel === "w") return alpha;
      return null;
    })
    .filter((value) => Number.isFinite(value));
  if (!values.length) return effectPreviewAlphaFromRgba(red, green, blue, alpha);
  return clampByte(Math.max(...values));
}

function effectPreviewMaskPixelsFromBgra(bgra, width, height, channels = []) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const target = pixel * 4;
    const red = bgra[source + 2];
    const green = bgra[source + 1];
    const blue = bgra[source];
    rgba[target] = 255;
    rgba[target + 1] = 255;
    rgba[target + 2] = 255;
    rgba[target + 3] = effectPreviewAlphaFromChannels(red, green, blue, bgra[source + 3], channels);
  }
  return rgba;
}

function effectPreviewMaskPixelsFromRgba(sourceRgba, width, height, channels = []) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const target = pixel * 4;
    const red = sourceRgba[source];
    const green = sourceRgba[source + 1];
    const blue = sourceRgba[source + 2];
    rgba[target] = 255;
    rgba[target + 1] = 255;
    rgba[target + 2] = 255;
    rgba[target + 3] = effectPreviewAlphaFromChannels(red, green, blue, sourceRgba[source + 3], channels);
  }
  return rgba;
}

function maskPngBuffer(rgbaMask, width, height, PNG) {
  const png = new PNG({ width, height });
  png.data.set(rgbaMask);
  return PNG.sync.write(png);
}

function texturePngBufferFromRgba(rgba, width, height, PNG) {
  const png = new PNG({ width, height });
  png.data.set(rgba);
  return PNG.sync.write(png);
}

function texturePngBufferFromBgra(bgra, width, height, PNG) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const target = pixel * 4;
    rgba[target] = bgra[source + 2];
    rgba[target + 1] = bgra[source + 1];
    rgba[target + 2] = bgra[source];
    rgba[target + 3] = bgra[source + 3];
  }
  return texturePngBufferFromRgba(rgba, width, height, PNG);
}

function previewMaskPngBuffer(bgra, width, height, PNG, channels = []) {
  return maskPngBuffer(effectPreviewMaskPixelsFromBgra(bgra, width, height, channels), width, height, PNG);
}

function roundedCoverage(value) {
  return Math.round(value * 10000) / 10000;
}

function previewTextureSpriteMetadata(bytes, extension, PNG) {
  if (extension === ".webp") {
    return {
      previewTextureSpriteUsable: false,
      previewTextureRejectReason: "embedded-webp",
    };
  }
  if (extension !== ".png") return {};

  try {
    const png = PNG.sync.read(bytes);
    const total = Math.max(png.width * png.height, 1);
    let alphaSum = 0;
    let opaque = 0;
    let transparent = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      const alpha = png.data[offset];
      alphaSum += alpha;
      if (alpha >= PREVIEW_TEXTURE_OPAQUE_ALPHA) opaque += 1;
      if (alpha <= PREVIEW_TEXTURE_TRANSPARENT_ALPHA) transparent += 1;
    }
    const stats = {
      previewTextureAlphaCoverage: roundedCoverage(alphaSum / (total * 255)),
      previewTextureOpaqueCoverage: roundedCoverage(opaque / total),
      previewTextureTransparentCoverage: roundedCoverage(transparent / total),
    };
    const mostlyOpaque = stats.previewTextureOpaqueCoverage >= PREVIEW_TEXTURE_OPAQUE_COVERAGE_LIMIT;
    const lacksTransparentEdges =
      stats.previewTextureTransparentCoverage < PREVIEW_TEXTURE_MIN_TRANSPARENT_COVERAGE &&
      stats.previewTextureAlphaCoverage >= PREVIEW_TEXTURE_MIN_CARD_ALPHA_COVERAGE;
    const rejected = mostlyOpaque || lacksTransparentEdges;
    return {
      ...stats,
      previewTextureSpriteUsable: !rejected,
      previewTextureRejectReason: rejected ? "opaque-preview-texture" : "",
    };
  } catch {
    return {};
  }
}

function previewTextureRuntimeMetadata(previewTextureMetadata, roleNameList = []) {
  const needsAlphaMap =
    previewTextureMetadata.previewTextureMode === "embedded-webp" && roleNameList.includes("alphaMask");
  if (!needsAlphaMap) return previewTextureMetadata;
  return {
    ...previewTextureMetadata,
    previewTextureRequiresAlphaMap: true,
    previewTextureSpriteUsable: true,
    previewTextureRejectReason: "",
  };
}

function writeTsv(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = ["status\trelativePath\thash\toutputPath\tdetail"];
  for (const row of rows) {
    lines.push(["status", "relativePath", "hash", "outputPath", "detail"].map((column) => String(row[column] || "").replace(/\t/g, " ")).join("\t"));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

async function exportEffectPreviewTextures({
  materialManifestPath = defaultMaterialManifestPath,
  manifestOut = materialManifestPath,
  dataRoot = defaultDataRoot,
  outputRoot = defaultOutputRoot,
  hashOutputRoot = defaultHashOutputRoot,
  reportPath = defaultReportPath,
  onlyHookLinked = false,
  onlyPfxLinked = true,
} = {}) {
  const { PNG } = require("pngjs");
  const { initialize, decode_pvrtc } = require("texture2ddecoder-wasm");
  await initialize();

  const manifest = JSON.parse(fs.readFileSync(materialManifestPath, "utf8"));
  const rows = effectPreviewTextureRows(manifest, { outputRoot, onlyHookLinked, onlyPfxLinked });
  const sampledRows = sampledDistortionTextureRows(manifest, { outputRoot: hashOutputRoot });
  const itemByPath = new Map((manifest.items || []).map((item) => [item.relativePath, item]));
  const reportRows = [];
  const texturePreviewByHash = new Map();
  const sampledTextureByHash = new Map();
  let written = 0;
  let sampledWritten = 0;

  for (const row of rows) {
    try {
      const alphaChannels = (row.previewAlphaSourceChannels || []).filter((channel) => ["x", "y", "z", "w"].includes(channel));
      const cacheKey = `${row.hash}:${alphaChannels.join("")}`;
      let cached = texturePreviewByHash.get(cacheKey);
      if (!cached) {
        const meta = textureMeta(dataRoot, row.hash);
        if (!meta) throw new Error("texture asset not found or unsupported header");
        const webpPayload = embeddedWebpPayload(meta.buffer);
        const rgbaBaseLevel = rawRgbaBaseLevel(meta);
        if (webpPayload) {
          cached = {
            bytes: Buffer.from(webpPayload),
            extension: ".webp",
            mode: "embedded-webp",
            width: meta.width,
            height: meta.height,
          };
        } else if (rgbaBaseLevel) {
          cached = {
            bytes: maskPngBuffer(effectPreviewMaskPixelsFromRgba(rgbaBaseLevel, meta.width, meta.height, alphaChannels), meta.width, meta.height, PNG),
            extension: ".png",
            mode: "rgba-alpha-mask",
            width: meta.width,
            height: meta.height,
          };
        } else {
          const decoded = await decodeTexture(meta, decode_pvrtc);
          cached = {
            bytes: previewMaskPngBuffer(decoded.bgra, meta.width, meta.height, PNG, alphaChannels),
            extension: ".png",
            mode: "pvrtc-alpha-mask",
            width: meta.width,
            height: meta.height,
          };
        }
        texturePreviewByHash.set(cacheKey, cached);
      }
      const outputPath = previewTexturePathForShadergraph(row.relativePath, outputRoot, cached.extension);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, cached.bytes);
      const item = itemByPath.get(row.relativePath);
      if (item) {
        item.previewTexture = normalizeRel(path.relative("extracted/viewer", outputPath));
        item.previewTextureHash = row.hash;
        item.previewTextureMode = cached.mode;
        item.previewTextureSize = { width: cached.width, height: cached.height };
        Object.assign(
          item,
          previewTextureRuntimeMetadata(
            { ...previewTextureSpriteMetadata(cached.bytes, cached.extension, PNG), previewTextureMode: cached.mode },
            item.roleNames || [],
          ),
        );
      }
      written += 1;
      reportRows.push({
        status: "OK",
        ...row,
        outputPath,
        detail: `${cached.width}x${cached.height} ${cached.mode}${alphaChannels.length ? ` alpha:${alphaChannels.join("")}` : ""}`,
      });
    } catch (error) {
      reportRows.push({ status: "FAIL", ...row, detail: error.message });
    }
  }

  for (const row of sampledRows) {
    try {
      let cached = sampledTextureByHash.get(row.hash);
      if (!cached) {
        const meta = textureMeta(dataRoot, row.hash);
        if (!meta) throw new Error("texture asset not found or unsupported header");
        const webpPayload = embeddedWebpPayload(meta.buffer);
        const rgbaBaseLevel = rawRgbaBaseLevel(meta);
        if (webpPayload) {
          cached = {
            bytes: Buffer.from(webpPayload),
            extension: ".webp",
            mode: "embedded-webp-texture",
            width: meta.width,
            height: meta.height,
          };
        } else if (rgbaBaseLevel) {
          cached = {
            bytes: texturePngBufferFromRgba(rgbaBaseLevel, meta.width, meta.height, PNG),
            extension: ".png",
            mode: "rgba-texture",
            width: meta.width,
            height: meta.height,
          };
        } else {
          const decoded = await decodeTexture(meta, decode_pvrtc);
          cached = {
            bytes: texturePngBufferFromBgra(decoded.bgra, meta.width, meta.height, PNG),
            extension: ".png",
            mode: "pvrtc-texture",
            width: meta.width,
            height: meta.height,
          };
        }
        sampledTextureByHash.set(row.hash, cached);
      }

      const outputPath = texturePathForHashPreview(row.hash, hashOutputRoot, cached.extension);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, cached.bytes);
      const viewerPath = normalizeRel(path.relative("extracted/viewer", outputPath));
      for (const relativePath of row.relativePaths || []) {
        const item = itemByPath.get(relativePath);
        if (!item?.previewUvAnimation) continue;
        if (item.previewUvAnimation.mode === "sampledDistort" && item.samplerToHash?.[item.previewUvAnimation.distortionSampler] === row.hash) {
          item.previewUvAnimation.distortionTexture = viewerPath;
          item.previewUvAnimation.distortionTextureHash = row.hash;
          item.previewUvAnimation.distortionTextureMode = cached.mode;
          item.previewUvAnimation.distortionTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledDistort" && item.samplerToHash?.[item.previewUvAnimation.amplitudeMaskSampler] === row.hash) {
          item.previewUvAnimation.amplitudeMaskTexture = viewerPath;
          item.previewUvAnimation.amplitudeMaskTextureHash = row.hash;
          item.previewUvAnimation.amplitudeMaskTextureMode = cached.mode;
          item.previewUvAnimation.amplitudeMaskTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledRotate" && item.samplerToHash?.[item.previewUvAnimation.rotationSampler] === row.hash) {
          item.previewUvAnimation.rotationTexture = viewerPath;
          item.previewUvAnimation.rotationTextureHash = row.hash;
          item.previewUvAnimation.rotationTextureMode = cached.mode;
          item.previewUvAnimation.rotationTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledWarp" && item.samplerToHash?.[item.previewUvAnimation.distortionSampler] === row.hash) {
          item.previewUvAnimation.distortionTexture = viewerPath;
          item.previewUvAnimation.distortionTextureHash = row.hash;
          item.previewUvAnimation.distortionTextureMode = cached.mode;
          item.previewUvAnimation.distortionTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledWarp" && item.samplerToHash?.[item.previewUvAnimation.baseSampler] === row.hash) {
          item.previewUvAnimation.warpTexture = viewerPath;
          item.previewUvAnimation.warpTextureHash = row.hash;
          item.previewUvAnimation.warpTextureMode = cached.mode;
          item.previewUvAnimation.warpTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledOffsetField" && item.samplerToHash?.[item.previewUvAnimation.distortionSampler] === row.hash) {
          item.previewUvAnimation.distortionTexture = viewerPath;
          item.previewUvAnimation.distortionTextureHash = row.hash;
          item.previewUvAnimation.distortionTextureMode = cached.mode;
          item.previewUvAnimation.distortionTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledOffsetField" && item.samplerToHash?.[item.previewUvAnimation.baseSampler] === row.hash) {
          item.previewUvAnimation.fieldTexture = viewerPath;
          item.previewUvAnimation.fieldTextureHash = row.hash;
          item.previewUvAnimation.fieldTextureMode = cached.mode;
          item.previewUvAnimation.fieldTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledCenterScaleDistort" && item.samplerToHash?.[item.previewUvAnimation.distortionSampler] === row.hash) {
          item.previewUvAnimation.distortionTexture = viewerPath;
          item.previewUvAnimation.distortionTextureHash = row.hash;
          item.previewUvAnimation.distortionTextureMode = cached.mode;
          item.previewUvAnimation.distortionTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledCenterScaleDistort" && item.samplerToHash?.[item.previewUvAnimation.amplitudeMaskSampler] === row.hash) {
          item.previewUvAnimation.amplitudeMaskTexture = viewerPath;
          item.previewUvAnimation.amplitudeMaskTextureHash = row.hash;
          item.previewUvAnimation.amplitudeMaskTextureMode = cached.mode;
          item.previewUvAnimation.amplitudeMaskTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledCenterScaleDistort" && item.samplerToHash?.[item.previewUvAnimation.baseSampler] === row.hash) {
          item.previewUvAnimation.fieldTexture = viewerPath;
          item.previewUvAnimation.fieldTextureHash = row.hash;
          item.previewUvAnimation.fieldTextureMode = cached.mode;
          item.previewUvAnimation.fieldTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledScaleRotate" && item.samplerToHash?.[item.previewUvAnimation.baseSampler] === row.hash) {
          item.previewUvAnimation.fieldTexture = viewerPath;
          item.previewUvAnimation.fieldTextureHash = row.hash;
          item.previewUvAnimation.fieldTextureMode = cached.mode;
          item.previewUvAnimation.fieldTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledScaleRotate" && item.samplerToHash?.[item.previewUvAnimation.scaleSampler] === row.hash) {
          item.previewUvAnimation.scaleTexture = viewerPath;
          item.previewUvAnimation.scaleTextureHash = row.hash;
          item.previewUvAnimation.scaleTextureMode = cached.mode;
          item.previewUvAnimation.scaleTextureSize = { width: cached.width, height: cached.height };
        }
        if (item.previewUvAnimation.mode === "sampledScaleRotate" && item.samplerToHash?.[item.previewUvAnimation.scaleMaskSampler] === row.hash) {
          item.previewUvAnimation.scaleMaskTexture = viewerPath;
          item.previewUvAnimation.scaleMaskTextureHash = row.hash;
          item.previewUvAnimation.scaleMaskTextureMode = cached.mode;
          item.previewUvAnimation.scaleMaskTextureSize = { width: cached.width, height: cached.height };
        }
      }
      sampledWritten += 1;
      reportRows.push({
        status: "OK_HASH",
        relativePath: (row.relativePaths || []).join("|"),
        hash: row.hash,
        outputPath,
        detail: `${cached.width}x${cached.height} ${cached.mode}`,
      });
    } catch (error) {
      reportRows.push({
        status: "FAIL_HASH",
        relativePath: (row.relativePaths || []).join("|"),
        hash: row.hash,
        outputPath: row.outputPath,
        detail: error.message,
      });
    }
  }

  manifest.effectPreviewTextures = {
    generatedAt: new Date().toISOString(),
    outputRoot,
    hashOutputRoot,
    onlyHookLinked,
    onlyPfxLinked,
    requestedRows: rows.length,
    writtenRows: written,
    sampledTextureRows: sampledRows.length,
    sampledTextureWrittenRows: sampledWritten,
    sampledTextureFailedRows: reportRows.filter((row) => row.status === "FAIL_HASH").length,
    failedRows: reportRows.filter((row) => row.status === "FAIL").length,
    decodedTextureRows: texturePreviewByHash.size,
    decodedSampledTextureRows: sampledTextureByHash.size,
  };
  if (manifest.summary) manifest.summary.effectPreviewTextureRows = written;

  fs.writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`);
  writeTsv(reportPath, reportRows);
  return manifest.effectPreviewTextures;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  exportEffectPreviewTextures({
    materialManifestPath: optionValue(args, "--manifest", defaultMaterialManifestPath),
    manifestOut: optionValue(args, "--manifest-out", optionValue(args, "--manifest", defaultMaterialManifestPath)),
    dataRoot: optionValue(args, "--data-root", defaultDataRoot),
    outputRoot: optionValue(args, "--output-root", defaultOutputRoot),
    hashOutputRoot: optionValue(args, "--hash-output-root", defaultHashOutputRoot),
    reportPath: optionValue(args, "--report", defaultReportPath),
    onlyHookLinked: hasFlag(args, "--hook-linked-only") && !hasFlag(args, "--all"),
    onlyPfxLinked: !hasFlag(args, "--all"),
  })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}

module.exports = {
  embeddedWebpPayload,
  effectPreviewTextureRows,
  effectPreviewAlphaFromRgba,
  effectPreviewMaskPixelsFromBgra,
  effectPreviewMaskPixelsFromRgba,
  effectTextureHashForItem,
  exportEffectPreviewTextures,
  maskPngBuffer,
  previewMaskPngBuffer,
  previewTextureRuntimeMetadata,
  previewTexturePathForShadergraph,
  sampledDistortionTextureRows,
  texturePathForHashPreview,
  texturePngBufferFromBgra,
  texturePngBufferFromRgba,
};
