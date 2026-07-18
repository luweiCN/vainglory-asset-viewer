#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { readMeshForGlb } = require("./rsc0_mesh_to_obj");
const { parseSkeletonFile } = require("./skeleton_tools");

function usage() {
  console.error("Usage:");
  console.error("  obj_to_glb.js [--texture base_color.png] input.obj output.glb");
  console.error("  obj_to_glb.js --batch input_obj_dir output_glb_dir [manifest.json] [texture-map.json]");
  console.error(
    "  obj_to_glb.js --batch-skinned source_manifest.json input_mesh_dir input_skeleton_dir output_glb_dir manifest.json [texture-map.json] [skeleton-fallback-root]",
  );
  console.error("  obj_to_glb.js --batch-resource-meshes input_mesh_dir output_glb_dir manifest.json [texture-map.json]");
}

function resolveObjIndex(raw, count) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value === 0) return null;
  return value < 0 ? count + value : value;
}

function parseObj(text) {
  const sourcePositions = [null];
  const sourceUVs = [null];
  const sourceNormals = [null];

  const positions = [];
  const uvs = [];
  const normals = [];
  const primitives = [];
  const vertexMap = new Map();
  let hasUVs = false;
  let hasNormals = false;
  let objectName = "mesh";
  let currentMaterial = "default";

  function currentPrimitive() {
    let primitive = primitives[primitives.length - 1];
    if (!primitive || primitive.materialName !== currentMaterial) {
      primitive = { materialName: currentMaterial, indices: [] };
      primitives.push(primitive);
    }
    return primitive;
  }

  function addVertex(token) {
    const [positionRaw, uvRaw, normalRaw] = token.split("/");
    const positionIndex = resolveObjIndex(positionRaw, sourcePositions.length);
    const uvIndex = resolveObjIndex(uvRaw, sourceUVs.length);
    const normalIndex = resolveObjIndex(normalRaw, sourceNormals.length);
    const key = `${positionIndex}/${uvIndex || ""}/${normalIndex || ""}`;

    if (vertexMap.has(key)) return vertexMap.get(key);

    const position = sourcePositions[positionIndex];
    if (!position) throw new Error(`Invalid OBJ position index in face token: ${token}`);

    const uv = uvIndex ? sourceUVs[uvIndex] : null;
    const normal = normalIndex ? sourceNormals[normalIndex] : null;
    const nextIndex = positions.length / 3;

    positions.push(position[0], position[1], position[2]);
    uvs.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    normals.push(normal ? normal[0] : 0, normal ? normal[1] : 1, normal ? normal[2] : 0);
    hasUVs ||= Boolean(uv);
    hasNormals ||= Boolean(normal);
    vertexMap.set(key, nextIndex);
    return nextIndex;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    const kind = parts.shift();

    if (kind === "o") {
      if (parts[0]) objectName = parts.join("_");
      continue;
    }

    if (kind === "usemtl") {
      currentMaterial = parts.join(" ") || "default";
      continue;
    }

    if (kind === "v") {
      sourcePositions.push(parts.slice(0, 3).map(Number));
      continue;
    }

    if (kind === "vt") {
      sourceUVs.push(parts.slice(0, 2).map(Number));
      continue;
    }

    if (kind === "vn") {
      sourceNormals.push(parts.slice(0, 3).map(Number));
      continue;
    }

    if (kind === "f" && parts.length >= 3) {
      const face = parts.map(addVertex);
      const primitive = currentPrimitive();
      for (let index = 1; index < face.length - 1; index += 1) {
        primitive.indices.push(face[0], face[index], face[index + 1]);
      }
    }
  }

  const nonEmptyPrimitives = primitives.filter((primitive) => primitive.indices.length);
  if (!positions.length || !nonEmptyPrimitives.length) throw new Error("OBJ has no triangle geometry");

  return {
    objectName,
    positions: new Float32Array(positions),
    uvs: hasUVs ? new Float32Array(uvs) : null,
    normals: hasNormals ? new Float32Array(normals) : null,
    primitives: nonEmptyPrimitives,
  };
}

function minMaxPositions(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }

  return { min, max };
}

function paddedBuffer(buffer, padByte) {
  const padding = (4 - (buffer.byteLength % 4)) % 4;
  if (!padding) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
}

function typedArrayBuffer(array) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function identityMat4() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function composeMat4(translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return new Float32Array([
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ]);
}

function multiplyMat4(left, right) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        left[0 * 4 + row] * right[column * 4 + 0] +
        left[1 * 4 + row] * right[column * 4 + 1] +
        left[2 * 4 + row] * right[column * 4 + 2] +
        left[3 * 4 + row] * right[column * 4 + 3];
    }
  }
  return out;
}

function invertMat4(matrix) {
  const a00 = matrix[0];
  const a01 = matrix[1];
  const a02 = matrix[2];
  const a03 = matrix[3];
  const a10 = matrix[4];
  const a11 = matrix[5];
  const a12 = matrix[6];
  const a13 = matrix[7];
  const a20 = matrix[8];
  const a21 = matrix[9];
  const a22 = matrix[10];
  const a23 = matrix[11];
  const a30 = matrix[12];
  const a31 = matrix[13];
  const a32 = matrix[14];
  const a33 = matrix[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;

  const invDet = 1 / det;
  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
    (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
    (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
    (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
    (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
    (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
    (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
    (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
    (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
    (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
    (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
    (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
    (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
    (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
    (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
    (a20 * b03 - a21 * b01 + a22 * b00) * invDet,
  ]);
}

function inverseBindMatricesForBones(bones) {
  const globalMatrices = [];
  const matrices = new Float32Array(bones.length * 16);

  for (const bone of bones) {
    const local = composeMat4(bone.translation, bone.rotation, bone.scale);
    const parentMatrix = bone.parent >= 0 ? globalMatrices[bone.parent] : null;
    const global = parentMatrix ? multiplyMat4(parentMatrix, local) : local;
    globalMatrices[bone.index] = global;
    matrices.set(invertMat4(global) || identityMat4(), bone.index * 16);
  }

  return matrices;
}

function createGlb(mesh, options = {}) {
  const baseColorImage = options.baseColorImage || null;
  const materialImages = options.materialImages || new Map();
  const skin = options.skin || null;
  const bufferViews = [];
  const accessors = [];
  const binaryParts = [];
  const images = [];
  const textures = [];
  const materials = [];
  const extensionsUsed = new Set();
  const materialIndexByKey = new Map();
  let byteOffset = 0;

  function alignBinary() {
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding) {
      binaryParts.push(Buffer.alloc(padding));
      byteOffset += padding;
    }
  }

  function addBufferView(buffer, target) {
    alignBinary();
    const view = {
      buffer: 0,
      byteOffset,
      byteLength: buffer.byteLength,
    };
    if (target) view.target = target;
    bufferViews.push(view);
    binaryParts.push(buffer);
    byteOffset += buffer.byteLength;
    return bufferViews.length - 1;
  }

  function addAccessor(accessor) {
    accessors.push(accessor);
    return accessors.length - 1;
  }

  const vertexCount = mesh.positions.length / 3;
  const positionsView = addBufferView(typedArrayBuffer(mesh.positions), 34962);
  const normalsView = mesh.normals ? addBufferView(typedArrayBuffer(mesh.normals), 34962) : null;
  const uvsView = mesh.uvs ? addBufferView(typedArrayBuffer(mesh.uvs), 34962) : null;
  const colorsView = mesh.colors ? addBufferView(typedArrayBuffer(mesh.colors), 34962) : null;
  const bounds = minMaxPositions(mesh.positions);
  const positionAccessor = addAccessor({
    bufferView: positionsView,
    componentType: 5126,
    count: vertexCount,
    type: "VEC3",
    min: bounds.min,
    max: bounds.max,
  });
  const attributes = { POSITION: positionAccessor };

  if (normalsView != null) {
    attributes.NORMAL = addAccessor({
      bufferView: normalsView,
      componentType: 5126,
      count: vertexCount,
      type: "VEC3",
    });
  }

  if (uvsView != null) {
    attributes.TEXCOORD_0 = addAccessor({
      bufferView: uvsView,
      componentType: 5126,
      count: vertexCount,
      type: "VEC2",
    });
  }

  const colorAccessor =
    colorsView != null
      ? addAccessor({
          bufferView: colorsView,
          componentType: 5126,
          count: vertexCount,
          type: "VEC4",
        })
      : null;

  if (skin && mesh.joints && mesh.weights) {
    const jointComponentType = mesh.joints instanceof Uint16Array ? 5123 : 5121;
    const jointsView = addBufferView(typedArrayBuffer(mesh.joints), 34962);
    const weightsView = addBufferView(typedArrayBuffer(mesh.weights), 34962);
    attributes.JOINTS_0 = addAccessor({
      bufferView: jointsView,
      componentType: jointComponentType,
      count: vertexCount,
      type: "VEC4",
    });
    attributes.WEIGHTS_0 = addAccessor({
      bufferView: weightsView,
      componentType: 5126,
      count: vertexCount,
      type: "VEC4",
    });
  }

  function normalizeImageSpec(image) {
    if (!image) return null;
    if (Buffer.isBuffer(image)) return { baseColor: image };
    return image;
  }

  function addPngTexture(image) {
    const imageView = addBufferView(image, null);
    const imageIndex = images.push({ bufferView: imageView, mimeType: "image/png" }) - 1;
    return textures.push({ source: imageIndex }) - 1;
  }

  function getMaterialIndex(materialName) {
    const imageSpec = normalizeImageSpec(
      materialImages.get(materialName) || (materialImages.size ? null : baseColorImage),
    );
    const fallbackSpec = !imageSpec && !materialUsesVertexColors(materialName) ? fallbackMaterialSpec(materialName) : null;
    const key = imageSpec ? `image:${materialName}` : `neutral:${materialName}`;
    if (materialIndexByKey.has(key)) return materialIndexByKey.get(key);

    const material = {
      name: materialName || "neutral_preview",
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor:
          imageSpec?.baseColor || materialUsesVertexColors(materialName)
            ? [1, 1, 1, 1]
            : fallbackSpec?.baseColorFactor || [0.78, 0.74, 0.62, 1],
        metallicFactor: 0,
        roughnessFactor:
          imageSpec?.metallicRoughness || materialUsesVertexColors(materialName)
            ? 1
            : fallbackSpec?.roughnessFactor ?? 0.82,
      },
    };

    if (imageSpec?.baseColor) {
      const textureIndex = addPngTexture(imageSpec.baseColor);
      material.pbrMetallicRoughness.baseColorTexture = { index: textureIndex };
    }

    if (imageSpec?.metallicRoughness) {
      material.pbrMetallicRoughness.metallicRoughnessTexture = {
        index: addPngTexture(imageSpec.metallicRoughness),
      };
    }

    if (imageSpec?.normal) {
      material.normalTexture = { index: addPngTexture(imageSpec.normal), scale: 1 };
    }

    if (imageSpec?.emissive) {
      material.emissiveFactor = [1, 1, 1];
      material.emissiveTexture = { index: addPngTexture(imageSpec.emissive) };
    } else if (fallbackSpec?.emissiveFactor) {
      material.emissiveFactor = fallbackSpec.emissiveFactor;
    }

    const alphaMode = imageSpec?.alphaMode || fallbackSpec?.alphaMode || (materialUsesVertexColors(materialName) ? "BLEND" : null);
    if (alphaMode) {
      material.alphaMode = alphaMode;
      if (alphaMode === "MASK") material.alphaCutoff = imageSpec?.alphaCutoff ?? 0.5;
    }

    const emissiveStrength = imageSpec?.emissiveStrength ?? fallbackSpec?.emissiveStrength;
    if (emissiveStrength != null) {
      material.extensions = {
        ...(material.extensions || {}),
        KHR_materials_emissive_strength: {
          emissiveStrength,
        },
      };
      extensionsUsed.add("KHR_materials_emissive_strength");
    }

    const index = materials.push(material) - 1;
    materialIndexByKey.set(key, index);
    return index;
  }

  const gltfPrimitives = [];
  for (const primitive of mesh.primitives) {
    const indexArray =
      vertexCount <= 65535 ? new Uint16Array(primitive.indices) : new Uint32Array(primitive.indices);
    const indicesView = addBufferView(typedArrayBuffer(indexArray), 34963);
    const indicesAccessor = addAccessor({
      bufferView: indicesView,
      componentType: vertexCount <= 65535 ? 5123 : 5125,
      count: indexArray.length,
      type: "SCALAR",
    });

    const primitiveAttributes =
      colorAccessor != null && materialUsesVertexColors(primitive.materialName)
        ? { ...attributes, COLOR_0: colorAccessor }
        : attributes;

    gltfPrimitives.push({
      attributes: primitiveAttributes,
      indices: indicesAccessor,
      material: getMaterialIndex(primitive.materialName),
      mode: 4,
    });
  }

  let nodes = [{ name: mesh.objectName, mesh: 0 }];
  let skins = null;
  if (skin && mesh.joints && mesh.weights) {
    const bones = [...(skin.bones || [])].sort((left, right) => left.index - right.index);
    const inverseBindView = addBufferView(typedArrayBuffer(inverseBindMatricesForBones(bones)), null);
    const inverseBindAccessor = addAccessor({
      bufferView: inverseBindView,
      componentType: 5126,
      count: bones.length,
      type: "MAT4",
    });
    const boneNodeByIndex = new Map();
    nodes = [
      {
        name: `${mesh.objectName}_root`,
        children: [1],
      },
      {
        name: mesh.objectName,
        mesh: 0,
        skin: 0,
      },
    ];

    for (const bone of bones) {
      const nodeIndex = nodes.push({
        name: bone.name || bone.hash || `bone_${bone.index}`,
        rotation: bone.rotation || [0, 0, 0, 1],
        translation: bone.translation || [0, 0, 0],
        scale: bone.scale || [1, 1, 1],
      }) - 1;
      boneNodeByIndex.set(bone.index, nodeIndex);
    }

    for (const bone of bones) {
      const nodeIndex = boneNodeByIndex.get(bone.index);
      const parentNode = bone.parent >= 0 ? nodes[boneNodeByIndex.get(bone.parent)] : nodes[0];
      parentNode.children = parentNode.children || [];
      parentNode.children.push(nodeIndex);
    }

    skins = [
      {
        name: skin.name || `${mesh.objectName}_skin`,
        joints: bones.map((bone) => boneNodeByIndex.get(bone.index)),
        inverseBindMatrices: inverseBindAccessor,
      },
    ];
  }

  alignBinary();
  const binChunk = Buffer.concat(binaryParts);

  const gltf = {
    asset: {
      version: "2.0",
      generator: "vainglory extracted/tools/obj_to_glb.js",
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes: [
      {
        name: mesh.objectName,
        primitives: gltfPrimitives,
      },
    ],
    materials,
    buffers: [{ byteLength: binChunk.byteLength }],
    bufferViews,
    accessors,
  };

  if (images.length) gltf.images = images;
  if (textures.length) gltf.textures = textures;
  if (skins) gltf.skins = skins;
  if (extensionsUsed.size) gltf.extensionsUsed = [...extensionsUsed].sort();

  const jsonChunk = paddedBuffer(Buffer.from(JSON.stringify(gltf)), 0x20);
  const paddedBinChunk = paddedBuffer(binChunk, 0x00);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + paddedBinChunk.byteLength;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBinChunk.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, paddedBinChunk]);
}

function convertFile(inputPath, outputPath, options = {}) {
  const mesh = parseObj(fs.readFileSync(inputPath, "utf8"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, createGlb(mesh, options));
  return fs.statSync(outputPath).size;
}

function convertMeshFile(inputPath, outputPath, options = {}) {
  const mesh = readMeshForGlb(inputPath);
  const skeleton = options.skeletonPath ? parseSkeletonFile(options.skeletonPath) : null;
  const skin = skeleton
    ? {
        name: skeleton.source || path.basename(options.skeletonPath),
        bones: skeleton.bones,
      }
    : null;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    createGlb(mesh, {
      baseColorImage: options.baseColorImage,
      materialImages: options.materialImages,
      skin,
    }),
  );
  return fs.statSync(outputPath).size;
}

function walkObjFiles(root) {
  const output = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".obj")) output.push(entryPath);
    }
  }

  return output.sort();
}

function manifestItem(root, filePath, size) {
  const rel = path.relative(root, filePath).split(path.sep).join("/");
  const parts = rel.split("/");
  const character = parts[0] === "Characters" && parts[1] ? parts[1] : parts[0] || "Unknown";
  const variant = path.basename(rel, ".glb");

  return { rel, character, variant, size };
}

function normalizeRel(rel) {
  return rel.split(path.sep).join("/").replace(/\.(obj|glb|png)$/i, "");
}

function loadTextureMap(textureMapPath) {
  if (!textureMapPath) return new Map();

  const json = JSON.parse(fs.readFileSync(textureMapPath, "utf8"));
  const entries = Array.isArray(json) ? json : json.items || Object.entries(json).map(([key, value]) => ({ key, value }));
  const map = new Map();

  function entryValue(entry) {
    if (entry.value) return entry.value;
    if (entry.textures) {
      return {
        ...entry.textures,
        ...(entry.alphaMode ? { alphaMode: entry.alphaMode } : {}),
        ...(entry.alphaCutoff != null ? { alphaCutoff: entry.alphaCutoff } : {}),
        ...(entry.emissiveStrength != null ? { emissiveStrength: entry.emissiveStrength } : {}),
      };
    }
    return entry.texture || entry.baseColorTexture || entry.png;
  }

  for (const entry of entries) {
    const key = entry.key || entry.identity || entry.obj || entry.glb || entry.rel;
    const value = entryValue(entry);
    if (key && value) map.set(normalizeRel(key), value);
    if (entry.shadergraph && value) {
      map.set(entry.shadergraph, value);
      const marker = "extracted/hero_assets/shadergraphs";
      const markerIndex = entry.shadergraph.indexOf(marker);
      if (markerIndex >= 0) {
        const rel = entry.shadergraph.slice(markerIndex + marker.length);
        map.set(rel.startsWith("/") ? rel : `/${rel}`, value);
      }
    }
  }

  return map;
}

function roleTexturePath(roleValue) {
  if (!roleValue) return null;
  if (typeof roleValue === "string") return roleValue;
  return roleValue.texture || roleValue.path || roleValue.png || null;
}

function readCachedImage(imageCache, texturePath) {
  if (!imageCache.has(texturePath)) {
    imageCache.set(texturePath, fs.readFileSync(texturePath));
  }
  return imageCache.get(texturePath);
}

function readImageSpec(textureValue, imageCache) {
  if (!textureValue) return null;
  if (typeof textureValue === "string") return readCachedImage(imageCache, textureValue);

  const spec = {};
  for (const role of ["baseColor", "normal", "metallicRoughness", "emissive"]) {
    const texturePath = roleTexturePath(textureValue[role]);
    if (texturePath) spec[role] = readCachedImage(imageCache, texturePath);
  }

  if (textureValue.alphaMode) spec.alphaMode = textureValue.alphaMode;
  if (textureValue.alphaCutoff != null) spec.alphaCutoff = textureValue.alphaCutoff;
  if (textureValue.emissiveStrength != null) spec.emissiveStrength = textureValue.emissiveStrength;

  return Object.keys(spec).length ? spec : null;
}

function readMaterialImages(mesh, textureMap, imageCache) {
  const materialImages = new Map();

  for (const primitive of mesh.primitives) {
    const imageSpec = readImageSpec(textureMap.get(primitive.materialName), imageCache);
    if (imageSpec) materialImages.set(primitive.materialName, imageSpec);
  }

  return materialImages;
}

function materialImageHasRole(value, role) {
  if (!value) return false;
  if (Buffer.isBuffer(value)) return role === "baseColor";
  return Boolean(value[role]);
}

function materialImageHasAnyRole(value) {
  if (!value) return false;
  if (Buffer.isBuffer(value)) return true;
  return ["baseColor", "normal", "metallicRoughness", "emissive"].some((role) => Boolean(value[role]));
}

function materialStats(mesh, materialImages, baseColorImage = null) {
  const materialImageValues = [...materialImages.values()];
  return {
    materialCount: mesh.primitives.length,
    texturedMaterialCount:
      materialImageValues.filter((value) => materialImageHasAnyRole(value)).length ||
      (baseColorImage ? mesh.primitives.length : 0),
    normalMaterialCount: materialImageValues.filter((value) => materialImageHasRole(value, "normal")).length,
    roughnessMaterialCount: materialImageValues.filter((value) => materialImageHasRole(value, "metallicRoughness"))
      .length,
    emissiveMaterialCount: materialImageValues.filter((value) => materialImageHasRole(value, "emissive")).length,
    alphaBlendMaterialCount: materialImageValues.filter((value) => value?.alphaMode === "BLEND").length,
  };
}

function resolveResourcePath(root, rel) {
  if (!root || !rel) return null;
  const filePath = path.join(root, rel);
  return fs.existsSync(filePath) ? filePath : null;
}

function resourcePathCandidates(rel, roots) {
  const candidates = [];
  for (const [source, root] of roots) {
    const filePath = resolveResourcePath(root, rel);
    if (filePath) candidates.push({ rel, filePath, source });
  }
  return candidates;
}

function listSkeletonRelsInDirectory(root, dir) {
  if (!root) return [];
  const fullDir = path.join(root, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs
    .readdirSync(fullDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".skeleton"))
    .map((entry) => path.join(dir, entry.name).split(path.sep).join("/"));
}

function commonPrefixLength(left, right) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index].toLowerCase() === right[index].toLowerCase()) index += 1;
  return index;
}

function scoreSkeletonCandidate(meshPath, skeletonRel) {
  const meshBase = path.basename(meshPath, ".mesh").toLowerCase();
  const skeletonBase = path.basename(skeletonRel, ".skeleton").toLowerCase();
  if (meshBase === skeletonBase) return 1000;
  if (meshBase.startsWith(`${skeletonBase}_`)) return 900;
  if (meshBase.startsWith(skeletonBase)) return 800;
  if (skeletonBase.startsWith(meshBase)) return 700;
  return commonPrefixLength(meshBase, skeletonBase);
}

function skeletonCandidatesForItem(item, roots) {
  const candidates = new Map();

  for (const rel of item.skeletons || []) {
    if (rel) candidates.set(rel, { rel, inferred: false, score: 10_000 });
  }

  if (item.meshPath) {
    const dir = path.dirname(item.meshPath);
    for (const [, root] of roots) {
      for (const rel of listSkeletonRelsInDirectory(root, dir)) {
        const score = scoreSkeletonCandidate(item.meshPath, rel);
        const existing = candidates.get(rel);
        if (!existing || score > existing.score) candidates.set(rel, { rel, inferred: true, score });
      }
    }
  }

  return [...candidates.values()].sort((left, right) => {
    const scoreOrder = right.score - left.score;
    if (scoreOrder) return scoreOrder;
    return left.rel.localeCompare(right.rel);
  });
}

function resolveSkeletonForItem(item, skeletonRoot, skeletonFallbackRoot) {
  const roots = [
    ["primary", skeletonRoot],
    ["fallback", skeletonFallbackRoot],
  ];

  for (const candidate of skeletonCandidatesForItem(item, roots)) {
    for (const resolved of resourcePathCandidates(candidate.rel, roots)) {
      return {
        ...resolved,
        inferred: candidate.inferred,
      };
    }
  }

  return null;
}

function materialUsesVertexColors(materialName = "") {
  return /(?:swipe|trail|slash|WaterShader|waterOpaque|hero030_hlwn\.hlwn_greenFire|ringo_shogun_t3\.shogun_t3_arm_mat)/i.test(
    materialName,
  );
}

function fallbackMaterialSpec(materialName = "") {
  const lower = materialName.toLowerCase();
  if (/(?:fire|flame|sparkles|glow)/.test(lower)) {
    return {
      baseColorFactor: [1, 0.42, 0.12, 0.72],
      emissiveFactor: [1, 0.34, 0.08],
      emissiveStrength: 1.6,
      alphaMode: "BLEND",
      roughnessFactor: 0.58,
    };
  }
  if (/(?:blackhole|black_hole)/.test(lower)) {
    return {
      baseColorFactor: [0.08, 0.04, 0.16, 0.82],
      emissiveFactor: [0.18, 0.08, 0.38],
      emissiveStrength: 1.35,
      alphaMode: "BLEND",
      roughnessFactor: 0.72,
    };
  }
  if (/(?:crystalshine|snow|shard|ice)/.test(lower)) {
    return {
      baseColorFactor: [0.58, 0.88, 1, 0.68],
      emissiveFactor: [0.2, 0.45, 0.8],
      emissiveStrength: 0.9,
      alphaMode: "BLEND",
      roughnessFactor: 0.35,
    };
  }
  if (/(?:ball\\.lambert|lambert3)/.test(lower)) {
    return {
      baseColorFactor: [0.86, 0.76, 0.42, 1],
      roughnessFactor: 0.7,
    };
  }
  return null;
}

function safeSkinnedManifestItem(item) {
  const output = { ...item };
  if (!Array.isArray(output.attachments)) return output;

  const attachments = output.attachments.filter(
    (attachment) => attachment?.source === "attachment-animation" && attachment.animationPath,
  );
  if (attachments.length) output.attachments = attachments;
  else delete output.attachments;
  return output;
}

function batchConvertSkinnedMeshes({
  sourceManifestPath,
  meshRoot,
  meshFallbackRoot,
  skeletonRoot,
  skeletonFallbackRoot,
  outputRoot,
  manifestPath,
  textureMapPath,
}) {
  const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
  const textureMap = loadTextureMap(textureMapPath);
  const imageCache = new Map();
  const items = [];
  const failures = [];
  const outputRels = new Set();
  const skippedReasons = {};
  let skipped = 0;

  function skip(reason) {
    skipped += 1;
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
  }

  for (const item of sourceManifest.items || []) {
    if (!item.meshPath) {
      skip("missing_mesh_path");
      continue;
    }
    if (outputRels.has(item.rel)) {
      skip("duplicate_output_path");
      continue;
    }

    const meshCandidate = resourcePathCandidates(item.meshPath, [
      ["primary", meshRoot],
      ["fallback", meshFallbackRoot],
    ])[0];
    const skeletonCandidate = resolveSkeletonForItem(item, skeletonRoot, skeletonFallbackRoot);
    const outputPath = path.join(outputRoot, item.rel);

    if (!meshCandidate) {
      skip("missing_mesh_file");
      continue;
    }
    if (!skeletonCandidate) {
      skip(item.skeletons?.length ? "missing_skeleton_file" : "missing_skeleton_path");
      continue;
    }

    try {
      const mesh = readMeshForGlb(meshCandidate.filePath);
      const skeleton = parseSkeletonFile(skeletonCandidate.filePath);
      const materialImages = readMaterialImages(mesh, textureMap, imageCache);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(
        outputPath,
        createGlb(mesh, {
          materialImages,
          skin: {
            name: skeleton.source || skeletonCandidate.rel,
            bones: skeleton.bones,
          },
        }),
      );

      const size = fs.statSync(outputPath).size;
      outputRels.add(item.rel);
      items.push({
        ...safeSkinnedManifestItem(item),
        skeletons: item.skeletons?.length ? item.skeletons : [skeletonCandidate.rel],
        size,
        skinned: true,
        skinJointCount: skeleton.boneCount,
        textured: Boolean(materialImages.size),
        ...materialStats(mesh, materialImages),
        resolvedMeshPath: meshCandidate.rel,
        resolvedMeshSource: meshCandidate.source,
        resolvedSkeletonPath: skeletonCandidate.rel,
        resolvedSkeletonSource: skeletonCandidate.source,
        inferredSkeleton: skeletonCandidate.inferred,
      });
    } catch (error) {
      failures.push(`${item.rel || item.meshPath}\t${error.message}`);
    }
  }

  if (manifestPath) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: path.relative(path.dirname(manifestPath), outputRoot).split(path.sep).join("/"),
          count: items.length,
          uniqueFileCount: outputRels.size,
          skinnedCount: items.length,
          skippedCount: skipped,
          skippedReasons,
          failedCount: failures.length,
          items,
        },
        null,
        2,
      ),
    );
  }

  return {
    converted: items.length,
    uniqueFileCount: outputRels.size,
    failed: failures.length,
    skipped,
    skippedReasons,
    failures,
  };
}

function batchConvert(inputRoot, outputRoot, manifestPath, textureMapPath) {
  const inputFiles = walkObjFiles(inputRoot);
  const items = [];
  const failures = [];
  const textureMap = loadTextureMap(textureMapPath);
  const imageCache = new Map();

  for (const inputPath of inputFiles) {
    const rel = path.relative(inputRoot, inputPath);
    const outputPath = path.join(outputRoot, rel.replace(/\.obj$/i, ".glb"));
    const identity = normalizeRel(rel);
    const textureValue = textureMap.get(identity);
    const baseColorImage = typeof textureValue === "string" ? fs.readFileSync(textureValue) : null;

    try {
      const mesh = parseObj(fs.readFileSync(inputPath, "utf8"));
      const materialImages = readMaterialImages(mesh, textureMap, imageCache);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, createGlb(mesh, { baseColorImage, materialImages }));
      const size = fs.statSync(outputPath).size;
      items.push({
        ...manifestItem(outputRoot, outputPath, size),
        textured: Boolean(baseColorImage || materialImages.size),
        ...materialStats(mesh, materialImages, baseColorImage),
      });
    } catch (error) {
      failures.push(`${rel}\t${error.message}`);
    }
  }

  if (manifestPath) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: path.relative(path.dirname(manifestPath), outputRoot).split(path.sep).join("/"),
          count: items.length,
          items,
        },
        null,
        2,
      ),
    );
  }

  return { converted: items.length, failed: failures.length, failures };
}

function walkMeshFiles(root) {
  const output = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mesh")) output.push(entryPath);
    }
  }

  return output.sort();
}

function resourceMeshManifestItem(inputRoot, inputPath, outputRoot, outputPath, size) {
  const sourceMeshPath = path.relative(inputRoot, inputPath).split(path.sep).join("/");
  const rel = path.relative(outputRoot, outputPath).split(path.sep).join("/");
  const parts = sourceMeshPath.split("/");
  const category = parts[0] || "Unknown";
  const character = category === "Characters" && parts[1] ? parts[1] : category;
  const variant = path.basename(sourceMeshPath, ".mesh");

  return {
    rel,
    character,
    variant,
    category,
    sourceMeshPath,
    size,
  };
}

function batchConvertResourceMeshes({ inputRoot, outputRoot, manifestPath, textureMapPath, includeRelPaths }) {
  const includeSet = includeRelPaths ? new Set(includeRelPaths) : null;
  const inputFiles = walkMeshFiles(inputRoot).filter((inputPath) => {
    if (!includeSet) return true;
    const rel = path.relative(inputRoot, inputPath).split(path.sep).join("/");
    return includeSet.has(rel);
  });
  const textureMap = loadTextureMap(textureMapPath);
  const imageCache = new Map();
  const items = [];
  const failures = [];

  for (const inputPath of inputFiles) {
    const rel = path.relative(inputRoot, inputPath).split(path.sep).join("/");
    const outputPath = path.join(outputRoot, rel.replace(/\.mesh$/i, ".glb"));

    try {
      const mesh = readMeshForGlb(inputPath);
      const materialImages = readMaterialImages(mesh, textureMap, imageCache);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, createGlb(mesh, { materialImages }));
      const size = fs.statSync(outputPath).size;
      items.push({
        ...resourceMeshManifestItem(inputRoot, inputPath, outputRoot, outputPath, size),
        textured: Boolean(materialImages.size),
        ...materialStats(mesh, materialImages),
      });
    } catch (error) {
      failures.push(`${rel}\t${error.message}`);
    }
  }

  if (manifestPath) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: path.relative(path.dirname(manifestPath), outputRoot).split(path.sep).join("/"),
          count: items.length,
          failedCount: failures.length,
          items,
        },
        null,
        2,
      ),
    );
  }

  return { converted: items.length, failed: failures.length, failures };
}

function main(argv) {
  const args = [...argv];

  if (args[0] === "--batch") {
    if (args.length < 3 || args.length > 5) {
      usage();
      process.exit(2);
    }

    const result = batchConvert(args[1], args[2], args[3], args[4]);
    console.log(`converted=${result.converted} failed=${result.failed}`);
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      process.exit(1);
    }
    return;
  }

  if (args[0] === "--batch-skinned") {
    if (args.length < 6 || args.length > 8) {
      usage();
      process.exit(2);
    }

    const result = batchConvertSkinnedMeshes({
      sourceManifestPath: args[1],
      meshRoot: args[2],
      skeletonRoot: args[3],
      outputRoot: args[4],
      manifestPath: args[5],
      textureMapPath: args[6],
      skeletonFallbackRoot: args[7],
    });
    console.log(`converted=${result.converted} skipped=${result.skipped} failed=${result.failed}`);
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      process.exit(1);
    }
    return;
  }

  if (args[0] === "--batch-resource-meshes") {
    if (args.length < 4 || args.length > 5) {
      usage();
      process.exit(2);
    }

    const result = batchConvertResourceMeshes({
      inputRoot: args[1],
      outputRoot: args[2],
      manifestPath: args[3],
      textureMapPath: args[4],
    });
    console.log(`converted=${result.converted} failed=${result.failed}`);
    if (result.failures.length) {
      console.error(result.failures.join("\n"));
      process.exit(1);
    }
    return;
  }

  let baseColorImage = null;
  if (args[0] === "--texture") {
    if (args.length !== 4) {
      usage();
      process.exit(2);
    }
    baseColorImage = fs.readFileSync(args[1]);
    args.splice(0, 2);
  }

  if (args.length !== 2) {
    usage();
    process.exit(2);
  }
  const size = convertFile(args[0], args[1], { baseColorImage });
  console.log(`wrote ${args[1]} (${size} bytes)`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  batchConvertSkinnedMeshes,
  batchConvert,
  batchConvertResourceMeshes,
  convertMeshFile,
  convertFile,
  createGlb,
  loadTextureMap,
  parseObj,
};
