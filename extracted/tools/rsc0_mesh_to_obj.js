#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function u32(buf, off) {
  return buf.readUInt32LE(off);
}

function findLayout(buf) {
  for (let p = 0x20; p < Math.min(buf.length - 80, 4096); p += 1) {
    const indexCount = u32(buf, p);
    const vertexCount = u32(buf, p + 4);
    const vertexDataSize = u32(buf, p + 10);
    const stride = u32(buf, p + 14);
    const attrCount = buf[p + 18];
    if (indexCount <= 0 || vertexCount <= 0 || stride <= 0 || attrCount <= 0) continue;
    if (indexCount > 1000000 || vertexCount > 1000000 || stride > 512 || attrCount > 32) continue;
    if (vertexDataSize !== vertexCount * stride) continue;

    const attrStart = p + 19;
    const vertexStart = attrStart + attrCount * 8;
    const indexStart = vertexStart + vertexDataSize;
    let indexElementSize = 2;
    let indexSize = indexCount * indexElementSize;
    if (indexStart + indexSize > buf.length) {
      indexElementSize = 1;
      indexSize = indexCount * indexElementSize;
    }
    if (indexStart + indexSize > buf.length) continue;

    const attrs = [];
    let valid = true;
    for (let i = 0; i < attrCount; i += 1) {
      const a = attrStart + i * 8;
      const semantic = buf.readUInt16LE(a);
      const type = buf[a + 2];
      const count = buf[a + 3];
      const offset = u32(buf, a + 4);
      if (offset >= stride || count <= 0 || count > 4) valid = false;
      attrs.push({ semantic, type, count, offset });
    }
    if (!valid) continue;

    const position = attrs.find((a) => a.semantic === 0 && a.type === 4 && a.count >= 3);
    if (!position) continue;
    return { p, indexCount, vertexCount, vertexDataSize, stride, attrCount, attrs, vertexStart, indexStart, indexElementSize };
  }
  return null;
}

function readCString(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end += 1;
  return [buf.toString('utf8', off, end), end + 1];
}

function readMaterials(buf) {
  if (buf.length < 0x26) return { materials: [], after: 0x20 };

  const count = buf.readUInt16LE(0x24);
  const materials = [];
  let off = 0x26;

  if (count > 128) return { materials: [], after: 0x20 };

  for (let i = 0; i < count && off < buf.length; i += 1) {
    const [value, next] = readCString(buf, off);
    if (!value.includes('.shadergraph')) return { materials: [], after: 0x20 };
    materials.push(value);
    off = next;
  }

  return { materials, after: off };
}

function readJointPalette(buf, start, end) {
  const count = buf[start];
  if (count <= 0 || count > 128 || start + 1 + count > end) return null;
  return [...buf.subarray(start + 1, start + 1 + count)];
}

function findDrawRangeRecords(buf, layout, materialCount, afterMaterials) {
  const records = [];
  let expectedOffset = 0;
  let offsetPos = afterMaterials + 4;

  if (
    afterMaterials <= 0 ||
    offsetPos + 8 > layout.p ||
    buf.readUInt32LE(offsetPos) !== 0
  ) {
    return [{ materialIndex: 0, indexOffset: 0, indexCount: layout.indexCount }];
  }

  while (expectedOffset < layout.indexCount && offsetPos + 8 <= layout.p) {
    const materialIndex =
      records.length === 0 ? buf[afterMaterials + 2] : buf[Math.max(afterMaterials, offsetPos - 2)];
    const indexOffset = buf.readUInt32LE(offsetPos);
    const indexCount = buf.readUInt32LE(offsetPos + 4);

    if (
      indexOffset !== expectedOffset ||
      indexCount <= 0 ||
      indexCount > layout.indexCount - expectedOffset ||
      materialIndex >= Math.max(materialCount, 1)
    ) {
      return [{ materialIndex: 0, indexOffset: 0, indexCount: layout.indexCount }];
    }

    const searchStart = offsetPos + 8 + 24;
    const record = { materialIndex, indexOffset, indexCount, offsetPos, searchStart };
    records.push(record);
    expectedOffset += indexCount;
    if (expectedOffset === layout.indexCount) break;

    let nextOffsetPos = -1;
    for (let p = searchStart; p <= layout.p - 8; p += 1) {
      const candidateOffset = buf.readUInt32LE(p);
      const candidateCount = buf.readUInt32LE(p + 4);
      const candidateMaterial = buf[Math.max(afterMaterials, p - 2)];
      if (
        candidateOffset === expectedOffset &&
        candidateCount > 0 &&
        candidateCount <= layout.indexCount - expectedOffset &&
        candidateMaterial < Math.max(materialCount, 1)
      ) {
        nextOffsetPos = p;
        break;
      }
    }

    if (nextOffsetPos < 0) {
      return [{ materialIndex: 0, indexOffset: 0, indexCount: layout.indexCount }];
    }
    offsetPos = nextOffsetPos;
  }

  if (expectedOffset !== layout.indexCount) {
    return [{ materialIndex: 0, indexOffset: 0, indexCount: layout.indexCount }];
  }

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const nextOffsetPos = records[index + 1]?.offsetPos || layout.p;
    record.jointPalette = readJointPalette(buf, record.searchStart, nextOffsetPos);
  }

  return records;
}

function findDrawRanges(buf, layout, materialCount, afterMaterials) {
  return findDrawRangeRecords(buf, layout, materialCount, afterMaterials).map((range) => ({
    materialIndex: range.materialIndex,
    indexOffset: range.indexOffset,
    indexCount: range.indexCount,
    ...(range.jointPalette ? { jointPalette: range.jointPalette } : {}),
  }));
}

function readFloatAttr(buf, base, attr, fallback) {
  if (!attr || (attr.type !== 4 && attr.type !== 5 && attr.type !== 6)) return fallback;
  const vals = [];
  for (let i = 0; i < attr.count; i += 1) {
    if (attr.type === 5) {
      vals.push(buf.readUInt8(base + attr.offset + i) / 255);
    } else if (attr.type === 6) {
      vals.push(buf.readUInt16LE(base + attr.offset + i * 2) / 65535);
    } else {
      vals.push(buf.readFloatLE(base + attr.offset + i * 4));
    }
  }
  return vals;
}

function readIntegerAttrComponent(buf, base, attr, component) {
  const offset = base + attr.offset;
  if (attr.type === 1) return buf.readUInt16LE(offset + component * 2);
  return buf.readUInt8(offset + component);
}

function readIndex(buf, layout, indexOffset) {
  if (layout.indexElementSize === 1) return buf.readUInt8(layout.indexStart + indexOffset);
  return buf.readUInt16LE(layout.indexStart + indexOffset * 2);
}

function readMeshForGlb(input) {
  const buf = fs.readFileSync(input);
  if (buf.slice(0, 4).toString('ascii') !== 'RSC0') {
    throw new Error(`not an RSC0 file: ${input}`);
  }

  const layout = findLayout(buf);
  if (!layout) {
    throw new Error(`could not find mesh layout: ${input}`);
  }

  const posAttr = layout.attrs.find((a) => a.semantic === 0 && a.type === 4 && a.count >= 3);
  const normalAttr = layout.attrs.find((a) => a.semantic === 1 && a.type === 4 && a.count >= 3);
  const colorAttr = layout.attrs.find((a) => a.semantic === 4 && (a.type === 4 || a.type === 5 || a.type === 6) && a.count >= 3);
  const uvAttr = layout.attrs.find((a) => a.semantic === 5 && (a.type === 4 || a.type === 5 || a.type === 6) && a.count >= 2);
  const weightAttr = layout.attrs.find((a) => a.semantic === 9 && a.type === 4 && a.count === 3);
  const jointAttr = layout.attrs.find((a) => a.semantic === 10 && a.type === 1 && a.count === 3);
  const { materials, after } = readMaterials(buf);
  const drawRanges = findDrawRanges(buf, layout, materials.length, after);

  const positions = [];
  const uvs = uvAttr ? [] : null;
  const normals = normalAttr ? [] : null;
  const colors = colorAttr ? [] : null;
  const joints = weightAttr && jointAttr ? [] : null;
  const weights = weightAttr && jointAttr ? [] : null;

  function mappedJoint(palette, localJoint) {
    return palette?.[localJoint] ?? localJoint;
  }

  function appendVertex(sourceIndex, palette) {
    const base = layout.vertexStart + sourceIndex * layout.stride;
    const position = readFloatAttr(buf, base, posAttr, [0, 0, 0]);
    positions.push(...position.slice(0, 3));

    if (uvs) {
      const uv = readFloatAttr(buf, base, uvAttr, [0, 0]);
      uvs.push(...uv.slice(0, 2));
    }

    if (normals) {
      const normal = readFloatAttr(buf, base, normalAttr, [0, 1, 0]);
      normals.push(...normal.slice(0, 3));
    }

    if (colors) {
      const color = readFloatAttr(buf, base, colorAttr, [1, 1, 1, 1]);
      colors.push(color[0] ?? 1, color[1] ?? 1, color[2] ?? 1, color[3] ?? 1);
    }

    if (joints && weights) {
      const explicitWeights = readFloatAttr(buf, base, weightAttr, [1, 0, 0]);
      for (let component = 0; component < 3; component += 1) {
        joints.push(mappedJoint(palette, readIntegerAttrComponent(buf, base, jointAttr, component)));
        weights.push(explicitWeights[component]);
      }
      // Native Vainglory skinned shaders consume exactly three weights; the fourth slot is only glTF padding.
      joints.push(mappedJoint(palette, 0));
      weights.push(0);
    }

    return positions.length / 3 - 1;
  }

  const primitives = drawRanges.map((range) => {
    const indices = [];
    const vertexMap = new Map();
    for (let i = range.indexOffset; i < range.indexOffset + range.indexCount; i += 1) {
      const sourceIndex = readIndex(buf, layout, i);
      if (!vertexMap.has(sourceIndex)) {
        vertexMap.set(sourceIndex, appendVertex(sourceIndex, range.jointPalette));
      }
      indices.push(vertexMap.get(sourceIndex));
    }
    return {
      materialName: materials[range.materialIndex] || `material_${range.materialIndex}`,
      ...(range.jointPalette ? { jointPalette: range.jointPalette } : {}),
      indices,
    };
  });

  return {
    objectName: path.basename(input, path.extname(input)),
    positions: new Float32Array(positions),
    uvs: uvs ? new Float32Array(uvs) : null,
    normals: normals ? new Float32Array(normals) : null,
    colors: colors ? new Float32Array(colors) : null,
    joints: joints ? (joints.some((joint) => joint > 255) ? new Uint16Array(joints) : new Uint8Array(joints)) : null,
    weights: weights ? new Float32Array(weights) : null,
    primitives,
  };
}

function convert(input, output) {
  const buf = fs.readFileSync(input);
  if (buf.slice(0, 4).toString('ascii') !== 'RSC0') {
    throw new Error(`not an RSC0 file: ${input}`);
  }

  const layout = findLayout(buf);
  if (!layout) {
    throw new Error(`could not find mesh layout: ${input}`);
  }

  const posAttr = layout.attrs.find((a) => a.semantic === 0 && a.type === 4 && a.count >= 3);
  const normalAttr = layout.attrs.find((a) => a.semantic === 1 && a.type === 4 && a.count >= 3);
  const uvAttr = layout.attrs.find((a) => a.semantic === 5 && (a.type === 4 || a.type === 5 || a.type === 6) && a.count >= 2);
  const { materials, after } = readMaterials(buf);
  const drawRanges = findDrawRanges(buf, layout, materials.length, after);

  const lines = [];
  lines.push(`# source: ${input}`);
  lines.push(`# vertexCount: ${layout.vertexCount}`);
  lines.push(`# indexCount: ${layout.indexCount}`);
  lines.push(`# stride: ${layout.stride}`);
  for (let i = 0; i < materials.length; i += 1) {
    lines.push(`# material ${i}: ${materials[i]}`);
  }
  lines.push(`o ${path.basename(input, path.extname(input))}`);

  for (let i = 0; i < layout.vertexCount; i += 1) {
    const base = layout.vertexStart + i * layout.stride;
    const p = readFloatAttr(buf, base, posAttr, [0, 0, 0]);
    lines.push(`v ${p[0]} ${p[1]} ${p[2]}`);
  }

  if (uvAttr) {
    for (let i = 0; i < layout.vertexCount; i += 1) {
      const base = layout.vertexStart + i * layout.stride;
      const uv = readFloatAttr(buf, base, uvAttr, [0, 0]);
      lines.push(`vt ${uv[0]} ${uv[1]}`);
    }
  }

  if (normalAttr) {
    for (let i = 0; i < layout.vertexCount; i += 1) {
      const base = layout.vertexStart + i * layout.stride;
      const n = readFloatAttr(buf, base, normalAttr, [0, 1, 0]);
      lines.push(`vn ${n[0]} ${n[1]} ${n[2]}`);
    }
  }

  for (const range of drawRanges) {
    const materialName = materials[range.materialIndex] || `material_${range.materialIndex}`;
    lines.push(`g material_${range.materialIndex}`);
    lines.push(`usemtl ${materialName}`);

    for (let i = range.indexOffset; i + 2 < range.indexOffset + range.indexCount; i += 3) {
      const a = readIndex(buf, layout, i) + 1;
      const b = readIndex(buf, layout, i + 1) + 1;
      const c = readIndex(buf, layout, i + 2) + 1;
      if (uvAttr && normalAttr) {
        lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
      } else if (uvAttr) {
        lines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`);
      } else if (normalAttr) {
        lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      } else {
        lines.push(`f ${a} ${b} ${c}`);
      }
    }
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${lines.join('\n')}\n`);
  return { ...layout, materials, drawRanges };
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: rsc0_mesh_to_obj.js <input.mesh> <output.obj>');
    process.exit(2);
  }
  try {
    const layout = convert(input, output);
    console.log(`converted ${input} -> ${output}`);
    console.log(`vertices=${layout.vertexCount} indices=${layout.indexCount} stride=${layout.stride}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { convert, findLayout, readMaterials, findDrawRangeRecords, findDrawRanges, readMeshForGlb };
