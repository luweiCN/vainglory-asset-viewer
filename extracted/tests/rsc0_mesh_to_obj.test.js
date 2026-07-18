const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { convert, findLayout, readMeshForGlb } = require("../tools/rsc0_mesh_to_obj");

function writeAttr(buffer, offset, semantic, count, attrOffset, type = 4) {
  buffer.writeUInt16LE(semantic, offset);
  buffer[offset + 2] = type;
  buffer[offset + 3] = count;
  buffer.writeUInt32LE(attrOffset, offset + 4);
}

function writeVertex(buffer, offset, position, uv, normal) {
  position.forEach((value, index) => buffer.writeFloatLE(value, offset + index * 4));
  uv.forEach((value, index) => buffer.writeFloatLE(value, offset + 12 + index * 4));
  normal.forEach((value, index) => buffer.writeFloatLE(value, offset + 20 + index * 4));
}

function assertNear(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be near ${expected}`);
}

function sampleMeshWithU8Indices() {
  const layoutOffset = 0x80;
  const indexCount = 3;
  const vertexCount = 3;
  const stride = 32;
  const attrCount = 3;
  const vertexDataSize = vertexCount * stride;
  const attrStart = layoutOffset + 19;
  const vertexStart = attrStart + attrCount * 8;
  const indexStart = vertexStart + vertexDataSize;
  const buffer = Buffer.alloc(indexStart + indexCount);

  buffer.write("RSC0", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(indexCount, layoutOffset);
  buffer.writeUInt32LE(vertexCount, layoutOffset + 4);
  buffer[layoutOffset + 8] = 1;
  buffer[layoutOffset + 9] = 4;
  buffer.writeUInt32LE(vertexDataSize, layoutOffset + 10);
  buffer.writeUInt32LE(stride, layoutOffset + 14);
  buffer[layoutOffset + 18] = attrCount;

  writeAttr(buffer, attrStart, 0, 3, 0);
  writeAttr(buffer, attrStart + 8, 5, 2, 12);
  writeAttr(buffer, attrStart + 16, 1, 3, 20);
  writeVertex(buffer, vertexStart, [0, 0, 0], [0, 0], [0, 1, 0]);
  writeVertex(buffer, vertexStart + stride, [1, 0, 0], [1, 0], [0, 1, 0]);
  writeVertex(buffer, vertexStart + stride * 2, [0, 1, 0], [0, 1], [0, 1, 0]);
  buffer[indexStart] = 0;
  buffer[indexStart + 1] = 1;
  buffer[indexStart + 2] = 2;

  return buffer;
}

function sampleSkinnedMesh() {
  const layoutOffset = 0x80;
  const indexCount = 3;
  const vertexCount = 3;
  const stride = 52;
  const attrCount = 5;
  const vertexDataSize = vertexCount * stride;
  const attrStart = layoutOffset + 19;
  const vertexStart = attrStart + attrCount * 8;
  const indexStart = vertexStart + vertexDataSize;
  const buffer = Buffer.alloc(indexStart + indexCount * 2);

  buffer.write("RSC0", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(indexCount, layoutOffset);
  buffer.writeUInt32LE(vertexCount, layoutOffset + 4);
  buffer[layoutOffset + 8] = 1;
  buffer[layoutOffset + 9] = 4;
  buffer.writeUInt32LE(vertexDataSize, layoutOffset + 10);
  buffer.writeUInt32LE(stride, layoutOffset + 14);
  buffer[layoutOffset + 18] = attrCount;

  writeAttr(buffer, attrStart, 0, 3, 0);
  writeAttr(buffer, attrStart + 8, 5, 2, 12);
  writeAttr(buffer, attrStart + 16, 1, 3, 20);
  writeAttr(buffer, attrStart + 24, 9, 3, 32);
  writeAttr(buffer, attrStart + 32, 10, 3, 44, 1);

  writeVertex(buffer, vertexStart, [0, 0, 0], [0, 0], [0, 0, 1]);
  buffer.writeFloatLE(0.5, vertexStart + 32);
  buffer.writeFloatLE(0.25, vertexStart + 36);
  buffer.writeFloatLE(0, vertexStart + 40);
  buffer.writeUInt16LE(1, vertexStart + 44);
  buffer.writeUInt16LE(2, vertexStart + 46);
  buffer.writeUInt16LE(0, vertexStart + 48);

  writeVertex(buffer, vertexStart + stride, [1, 0, 0], [1, 0], [0, 0, 1]);
  buffer.writeFloatLE(1, vertexStart + stride + 32);
  buffer.writeFloatLE(0, vertexStart + stride + 36);
  buffer.writeFloatLE(0, vertexStart + stride + 40);
  buffer.writeUInt16LE(2, vertexStart + stride + 44);
  buffer.writeUInt16LE(0, vertexStart + stride + 46);
  buffer.writeUInt16LE(0, vertexStart + stride + 48);

  writeVertex(buffer, vertexStart + stride * 2, [0, 1, 0], [0, 1], [0, 0, 1]);
  buffer.writeFloatLE(0.2, vertexStart + stride * 2 + 32);
  buffer.writeFloatLE(0.3, vertexStart + stride * 2 + 36);
  buffer.writeFloatLE(0.1, vertexStart + stride * 2 + 40);
  buffer.writeUInt16LE(3, vertexStart + stride * 2 + 44);
  buffer.writeUInt16LE(4, vertexStart + stride * 2 + 46);
  buffer.writeUInt16LE(5, vertexStart + stride * 2 + 48);

  buffer.writeUInt16LE(0, indexStart);
  buffer.writeUInt16LE(1, indexStart + 2);
  buffer.writeUInt16LE(2, indexStart + 4);

  return buffer;
}

function sampleSkinnedMeshWithU16Joints() {
  const buffer = sampleSkinnedMesh();
  const layout = findLayout(buffer);
  const attrStart = layout.p + 19;
  writeAttr(buffer, attrStart + 32, 10, 3, 44, 1);

  const firstVertex = layout.vertexStart;
  buffer.writeUInt16LE(1, firstVertex + 44);
  buffer.writeUInt16LE(2, firstVertex + 46);
  buffer.writeUInt16LE(3, firstVertex + 48);

  const secondVertex = layout.vertexStart + layout.stride;
  buffer.writeUInt16LE(2, secondVertex + 44);
  buffer.writeUInt16LE(4, secondVertex + 46);
  buffer.writeUInt16LE(6, secondVertex + 48);

  const thirdVertex = layout.vertexStart + layout.stride * 2;
  buffer.writeUInt16LE(3, thirdVertex + 44);
  buffer.writeUInt16LE(5, thirdVertex + 46);
  buffer.writeUInt16LE(7, thirdVertex + 48);

  return buffer;
}

test("findLayout accepts compact meshes with one-byte indices", () => {
  const layout = findLayout(sampleMeshWithU8Indices());

  assert.equal(layout.indexElementSize, 1);
  assert.equal(layout.indexStart, 0x10b);
});

test("convert writes OBJ faces from one-byte indices", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-rsc0-"));
  const input = path.join(tempDir, "small.mesh");
  const output = path.join(tempDir, "small.obj");
  fs.writeFileSync(input, sampleMeshWithU8Indices());

  convert(input, output);

  assert.match(fs.readFileSync(output, "utf8"), /f 1\/1\/1 2\/2\/2 3\/3\/3/);
});

test("readMeshForGlb reads vertex skin channels as glTF-ready vectors", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-rsc0-"));
  const input = path.join(tempDir, "skinned.mesh");
  fs.writeFileSync(input, sampleSkinnedMesh());

  const mesh = readMeshForGlb(input);

  assert.equal(mesh.objectName, "skinned");
  assert.equal(mesh.positions.length, 9);
  assert.equal(mesh.uvs.length, 6);
  assert.equal(mesh.normals.length, 9);
  assert.deepEqual([...mesh.primitives[0].indices], [0, 1, 2]);
  assert.deepEqual([...mesh.joints], [1, 2, 0, 0, 2, 0, 0, 0, 3, 4, 5, 0]);
  assert.deepEqual(
    [...mesh.weights].map((value) => Number(value.toFixed(3))),
    [0.5, 0.25, 0, 0, 1, 0, 0, 0, 0.2, 0.3, 0.1, 0],
  );
});

test("readMeshForGlb reads type 1 joint attributes as uint16 components", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-rsc0-u16-"));
  const input = path.join(tempDir, "skinned.mesh");
  fs.writeFileSync(input, sampleSkinnedMeshWithU16Joints());

  const mesh = readMeshForGlb(input);

  assert.deepEqual([...mesh.joints], [1, 2, 3, 0, 2, 4, 6, 0, 3, 5, 7, 0]);
});

test("readMeshForGlb remaps per-draw joint palettes to skeleton bone indices", () => {
  const mesh = readMeshForGlb("extracted/hero_assets/meshes/Characters/Ringo/Art/ringo.mesh");

  assert.equal(mesh.primitives.length, 5);
  assert.deepEqual(mesh.primitives[0].jointPalette, [6, 61, 62, 63, 64]);
  assert.deepEqual(mesh.primitives[1].jointPalette, [52, 58, 70]);
  assert.deepEqual(mesh.primitives[2].jointPalette.slice(0, 8), [0, 1, 2, 47, 53, 59, 48, 54]);
  assert.ok(Math.max(...mesh.joints) > 31);
  assert.equal(mesh.joints[0], 6);
});

test("readMeshForGlb decodes byte-packed compact UV attributes from hero skins", () => {
  const file = "extracted/hero_assets/meshes/Characters/Hero046/Art/hero046_tokyo.mesh";
  const buffer = fs.readFileSync(file);
  const layout = findLayout(buffer);
  const uvAttr = layout.attrs.find((attr) => attr.semantic === 5);
  const firstSourceIndex =
    layout.indexElementSize === 1 ? buffer.readUInt8(layout.indexStart) : buffer.readUInt16LE(layout.indexStart);
  const firstUvOffset = layout.vertexStart + firstSourceIndex * layout.stride + uvAttr.offset;
  const mesh = readMeshForGlb(file);
  const vValues = [];
  for (let index = 1; index < mesh.uvs.length; index += 2) vValues.push(mesh.uvs[index]);

  assert.equal(mesh.uvs.length, 9213 * 2);
  assert.equal(buffer[firstUvOffset + 2], 0);
  assert.equal(buffer[firstUvOffset + 3], 0);
  assertNear(mesh.uvs[0], buffer[firstUvOffset] / 255);
  assertNear(mesh.uvs[1], buffer[firstUvOffset + 1] / 255);
  assert.ok(Math.max(...vValues) > 0.95);
  assert.ok(Math.min(...vValues) >= 0);
});

test("readMeshForGlb decodes ushort-packed compact UV attributes from hero cloth", () => {
  const file = "extracted/hero_assets/meshes/Characters/Hero070/ArtCloth/hero070cloth_Crimson.mesh";
  const buffer = fs.readFileSync(file);
  const layout = findLayout(buffer);
  const uvAttr = layout.attrs.find((attr) => attr.semantic === 5);
  const firstSourceIndex =
    layout.indexElementSize === 1 ? buffer.readUInt8(layout.indexStart) : buffer.readUInt16LE(layout.indexStart);
  const firstUvOffset = layout.vertexStart + firstSourceIndex * layout.stride + uvAttr.offset;
  const mesh = readMeshForGlb(file);

  assert.equal(uvAttr.type, 6);
  assertNear(mesh.uvs[0], buffer.readUInt16LE(firstUvOffset) / 65535);
  assertNear(mesh.uvs[1], buffer.readUInt16LE(firstUvOffset + 2) / 65535);
});

test("readMeshForGlb reads float vertex colors for color-driven effect ranges", () => {
  const mesh = readMeshForGlb("extracted/hero_assets/meshes/Characters/Koshka/Art/koshka.mesh");

  assert.equal(mesh.colors.length, 4976 * 4);
  assert.equal(mesh.primitives[4].materialName, "/Characters/Koshka/Art/koshka.swipe_mat.shadergraph");
  assert.equal(mesh.colors[mesh.primitives[4].indices[2] * 4], 1);
  assert.equal(mesh.colors[mesh.primitives[4].indices[2] * 4 + 3], 1);
  assert.equal(mesh.colors[mesh.primitives[4].indices[0] * 4 + 3], 0);
});
