const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const sourceTextureRoot = path.join(projectRoot, "extracted/effect_textures_preview");
const outputRoot = path.join(projectRoot, ".release-assets");
const outputTextureRoot = path.join(outputRoot, "effect_textures_preview");
const outputViewerRoot = path.join(outputRoot, "viewer");
const outputModelRoot = path.join(outputRoot, "models");
const outputSharedModelTextureRoot = path.join(outputModelRoot, "shared_glb_textures");
const modelDirectories = [
  "hero_assets_glb_textured_pbr",
  "hero_assets_glb_skinned_pbr",
  "hero_assets_glb_textured_mtl",
  "hero_assets_glb_textured",
  "all_assets_glb_textured_pbr",
  "hero_assets_glb",
];
const viewerFilesWithTexturePaths = [
  "effect-runtime-gaps.json",
  "effect-shadergraph-material-manifest.json",
];
const viewerFilesWithMaterialTexturePaths = [
  "app.js",
  "current-native-shadergraph-sampler-texdata-join-audit.json",
  "material-runtime-pipeline-manifest.json",
];

function walkFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  return files.sort();
}

function linkOrCopy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    fs.linkSync(source, destination);
  } catch {
    fs.copyFileSync(source, destination);
  }
}

function posixRelative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function imageExtension(image, bytes) {
  const extensionsByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/ktx2": ".ktx2",
  };
  if (extensionsByMimeType[image.mimeType]) return extensionsByMimeType[image.mimeType];
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return ".jpg";
  if (bytes.subarray(8, 12).toString("ascii") === "WEBP") return ".webp";
  return ".bin";
}

function parseGlb(contents) {
  if (contents.length < 20 || contents.readUInt32LE(0) !== 0x46546c67 || contents.readUInt32LE(4) !== 2) return null;
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= contents.length) {
    const chunkLength = contents.readUInt32LE(offset);
    const chunkType = contents.readUInt32LE(offset + 4);
    const chunk = contents.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/[\u0000 ]+$/u, ""));
    else if (chunkType === 0x004e4942) binary = chunk;
    offset += 8 + chunkLength;
  }
  return json && binary ? { json, binary } : null;
}

function collectBufferViewReferences(value, references) {
  if (Array.isArray(value)) {
    for (const item of value) collectBufferViewReferences(item, references);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "bufferView" && Number.isInteger(child)) references.add(child);
    else collectBufferViewReferences(child, references);
  }
}

function remapBufferViewReferences(value, indexMap) {
  if (Array.isArray(value)) {
    for (const item of value) remapBufferViewReferences(item, indexMap);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "bufferView" && Number.isInteger(child)) {
      if (!indexMap.has(child)) throw new Error(`Missing bufferView ${child} while rebuilding GLB`);
      value[key] = indexMap.get(child);
    } else {
      remapBufferViewReferences(child, indexMap);
    }
  }
}

function rewriteMaterialTextureReferences(value, releasePathBySourceUrl, counters) {
  if (Array.isArray(value)) {
    return value
      .map((item) => rewriteMaterialTextureReferences(item, releasePathBySourceUrl, counters))
      .filter((item) => item !== null);
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const rewritten = rewriteMaterialTextureReferences(child, releasePathBySourceUrl, counters);
      if (rewritten === null) delete value[key];
      else value[key] = rewritten;
    }
    return value;
  }
  if (typeof value !== "string") return value;

  const prefix = "../hero_assets_material_textures_preview/";
  if (value.startsWith(prefix) && !value.includes("|") && !value.includes(",")) {
    const releaseUrl = releasePathBySourceUrl.get(value);
    if (releaseUrl) {
      counters.rewritten += 1;
      return releaseUrl;
    }
    counters.missing += 1;
    return null;
  }

  const trimmed = value.trim();
  if (value.includes(prefix) && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(rewriteMaterialTextureReferences(parsed, releasePathBySourceUrl, counters));
    } catch {
      // Fall through to text replacement for non-JSON diagnostic strings.
    }
  }

  return value.replace(/\.\.\/hero_assets_material_textures_preview\/[^"\\|,\r\n]+/g, (sourceUrl) => {
    const releaseUrl = releasePathBySourceUrl.get(sourceUrl);
    if (!releaseUrl) {
      counters.missing += 1;
      return sourceUrl;
    }
    counters.rewritten += 1;
    return releaseUrl;
  });
}

function buildGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
  const paddedBinaryLength = Math.ceil(binary.length / 4) * 4;
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + paddedJsonLength);
  jsonBytes.copy(output, 20);
  const binaryHeaderOffset = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinaryLength, binaryHeaderOffset);
  output.writeUInt32LE(0x004e4942, binaryHeaderOffset + 4);
  binary.copy(output, binaryHeaderOffset + 8);
  return output;
}

function externalizeGlbImages(source, destination, virtualModelPath, canonicalModelTextureByHash, modelSummary) {
  const contents = fs.readFileSync(source);
  const parsed = parseGlb(contents);
  if (!parsed || !Array.isArray(parsed.json.images) || !parsed.json.images.some((image) => Number.isInteger(image.bufferView))) {
    linkOrCopy(source, destination);
    return;
  }

  const { json, binary } = parsed;
  const originalBufferViews = json.bufferViews || [];
  for (const image of json.images) {
    if (!Number.isInteger(image.bufferView)) continue;
    const view = originalBufferViews[image.bufferView];
    if (!view || (view.buffer || 0) !== 0) continue;
    const start = view.byteOffset || 0;
    const bytes = binary.subarray(start, start + view.byteLength);
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    let canonicalRelativePath = canonicalModelTextureByHash.get(hash);
    if (!canonicalRelativePath) {
      canonicalRelativePath = `${hash.slice(0, 2)}/${hash}${imageExtension(image, bytes)}`;
      canonicalModelTextureByHash.set(hash, canonicalRelativePath);
      const outputTexture = path.join(outputSharedModelTextureRoot, ...canonicalRelativePath.split("/"));
      fs.mkdirSync(path.dirname(outputTexture), { recursive: true });
      fs.writeFileSync(outputTexture, bytes);
      modelSummary.releaseImageBytes += bytes.length;
    }
    modelSummary.sourceImageReferences += 1;
    modelSummary.sourceImageBytes += bytes.length;
    const virtualTexturePath = `/extracted/shared_glb_textures/${canonicalRelativePath}`;
    image.uri = path.posix.relative(path.posix.dirname(`/extracted/${virtualModelPath}`), virtualTexturePath);
    delete image.bufferView;
  }

  const referencedBufferViews = new Set();
  collectBufferViewReferences(json, referencedBufferViews);
  const indexMap = new Map();
  const keptViews = [];
  for (const [oldIndex, view] of originalBufferViews.entries()) {
    if (!referencedBufferViews.has(oldIndex)) continue;
    indexMap.set(oldIndex, keptViews.length);
    keptViews.push({ ...view });
  }
  json.bufferViews = keptViews;
  remapBufferViewReferences(json, indexMap);

  const binaryParts = [];
  let binaryLength = 0;
  for (const view of keptViews) {
    if ((view.buffer || 0) !== 0) continue;
    const padding = (4 - (binaryLength % 4)) % 4;
    if (padding) {
      binaryParts.push(Buffer.alloc(padding));
      binaryLength += padding;
    }
    const sourceStart = view.byteOffset || 0;
    const sourceEnd = sourceStart + view.byteLength;
    if (sourceEnd > binary.length) throw new Error(`Invalid bufferView range in ${source}`);
    view.byteOffset = binaryLength;
    binaryParts.push(binary.subarray(sourceStart, sourceEnd));
    binaryLength += view.byteLength;
  }
  const rebuiltBinary = Buffer.concat(binaryParts, binaryLength);
  if (json.buffers?.[0]) json.buffers[0].byteLength = rebuiltBinary.length;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, buildGlb(json, rebuiltBinary));
  modelSummary.rewrittenModels += 1;
}

function prepareReleaseAssets() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputTextureRoot, { recursive: true });
  fs.mkdirSync(outputViewerRoot, { recursive: true });
  fs.mkdirSync(outputSharedModelTextureRoot, { recursive: true });

  const canonicalPathByHash = new Map();
  const releasePathBySourceUrl = new Map();
  let sourceBytes = 0;
  let releaseBytes = 0;

  for (const source of walkFiles(sourceTextureRoot)) {
    const contents = fs.readFileSync(source);
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    const sourceRelativePath = posixRelative(sourceTextureRoot, source);
    sourceBytes += contents.length;

    let canonicalRelativePath = canonicalPathByHash.get(hash);
    if (!canonicalRelativePath) {
      const extension = path.extname(sourceRelativePath).toLowerCase() || ".bin";
      canonicalRelativePath = `${hash.slice(0, 2)}/${hash}${extension}`;
      canonicalPathByHash.set(hash, canonicalRelativePath);
      releaseBytes += contents.length;
      linkOrCopy(source, path.join(outputTextureRoot, ...canonicalRelativePath.split("/")));
    }

    releasePathBySourceUrl.set(
      `../effect_textures_preview/${sourceRelativePath}`,
      `../effect_textures_preview/${canonicalRelativePath}`,
    );
  }

  const textureUrlPattern = /\.\.\/effect_textures_preview\/[^"\r\n]+/g;
  let rewrittenReferences = 0;
  for (const filename of viewerFilesWithTexturePaths) {
    const source = path.join(projectRoot, "extracted/viewer", filename);
    const destination = path.join(outputViewerRoot, filename);
    const original = fs.readFileSync(source, "utf8");
    const rewritten = original.replace(textureUrlPattern, (sourceUrl) => {
      const releaseUrl = releasePathBySourceUrl.get(sourceUrl);
      if (!releaseUrl) throw new Error(`Missing release texture for ${sourceUrl}`);
      rewrittenReferences += 1;
      return releaseUrl;
    });
    JSON.parse(rewritten);
    fs.writeFileSync(destination, rewritten);
  }

  const canonicalModelTextureByHash = new Map();
  const modelSummary = {
    modelFiles: 0,
    rewrittenModels: 0,
    sourceImageReferences: 0,
    sourceImageBytes: 0,
    releaseImageBytes: 0,
  };
  for (const directoryName of modelDirectories) {
    const sourceRoot = path.join(projectRoot, "extracted", directoryName);
    for (const source of walkFiles(sourceRoot)) {
      if (!source.endsWith(".glb")) continue;
      const relativePath = posixRelative(sourceRoot, source);
      if (directoryName === "all_assets_glb_textured_pbr" && relativePath.startsWith("Characters/")) continue;
      const destination = path.join(outputModelRoot, directoryName, ...relativePath.split("/"));
      externalizeGlbImages(
        source,
        destination,
        `${directoryName}/${relativePath}`,
        canonicalModelTextureByHash,
        modelSummary,
      );
      modelSummary.modelFiles += 1;
    }
  }

  const uniqueModelImages = canonicalModelTextureByHash.size;
  const materialTextureRoot = path.join(projectRoot, "extracted/hero_assets_material_textures_preview");
  const releaseMaterialPathBySourceUrl = new Map();
  let sourceMaterialBytes = 0;
  let addedMaterialBytes = 0;
  for (const source of walkFiles(materialTextureRoot)) {
    const contents = fs.readFileSync(source);
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    const sourceRelativePath = posixRelative(materialTextureRoot, source);
    sourceMaterialBytes += contents.length;
    let canonicalRelativePath = canonicalModelTextureByHash.get(hash);
    if (!canonicalRelativePath) {
      const extension = path.extname(sourceRelativePath).toLowerCase() || imageExtension({}, contents);
      canonicalRelativePath = `${hash.slice(0, 2)}/${hash}${extension}`;
      canonicalModelTextureByHash.set(hash, canonicalRelativePath);
      linkOrCopy(source, path.join(outputSharedModelTextureRoot, ...canonicalRelativePath.split("/")));
      addedMaterialBytes += contents.length;
    }
    releaseMaterialPathBySourceUrl.set(
      `../hero_assets_material_textures_preview/${sourceRelativePath}`,
      `../shared_glb_textures/${canonicalRelativePath}`,
    );
  }

  const materialReferenceCounters = { rewritten: 0, missing: 0 };
  for (const filename of viewerFilesWithMaterialTexturePaths) {
    const source = path.join(projectRoot, "extracted/viewer", filename);
    const destination = path.join(outputViewerRoot, filename);
    const original = fs.readFileSync(source, "utf8");
    const rewritten = filename.endsWith(".json")
      ? `${JSON.stringify(
          rewriteMaterialTextureReferences(JSON.parse(original), releaseMaterialPathBySourceUrl, materialReferenceCounters),
          null,
          2,
        )}\n`
      : original.replace(/\.\.\/hero_assets_material_textures_preview\/[^"\\\r\n]+/g, (sourceUrl) => {
          const releaseUrl = releaseMaterialPathBySourceUrl.get(sourceUrl);
          if (!releaseUrl) {
            materialReferenceCounters.missing += 1;
            return sourceUrl;
          }
          materialReferenceCounters.rewritten += 1;
          return releaseUrl;
        });
    fs.writeFileSync(destination, rewritten);
  }

  const summary = {
    sourceFiles: releasePathBySourceUrl.size,
    releaseFiles: canonicalPathByHash.size,
    sourceBytes,
    releaseBytes,
    savedBytes: sourceBytes - releaseBytes,
    rewrittenReferences,
    ...modelSummary,
    uniqueModelImages,
    uniqueSharedImages: canonicalModelTextureByHash.size,
    savedModelImageBytes: modelSummary.sourceImageBytes - modelSummary.releaseImageBytes,
    sourceMaterialFiles: releaseMaterialPathBySourceUrl.size,
    sourceMaterialBytes,
    addedMaterialBytes,
    savedMaterialBytes: sourceMaterialBytes - addedMaterialBytes,
    rewrittenMaterialReferences: materialReferenceCounters.rewritten,
    missingMaterialReferences: materialReferenceCounters.missing,
  };
  fs.writeFileSync(path.join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  console.log(JSON.stringify(prepareReleaseAssets()));
}

module.exports = { prepareReleaseAssets };
