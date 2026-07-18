const fs = require("node:fs");

function readMagic(buffer, offset) {
  return buffer.subarray(offset, offset + 4).toString("ascii");
}

function isChunkMagic(value) {
  return /^[A-Z0-9]{4}$/.test(value);
}

function extractPrintableStringRecords(buffer, minLength = 4) {
  const strings = [];
  let start = -1;

  for (let offset = 0; offset <= buffer.length; offset += 1) {
    const value = offset < buffer.length ? buffer[offset] : 0;
    const printable = value >= 0x20 && value <= 0x7e;
    if (printable && start < 0) start = offset;
    if (printable) continue;

    if (start >= 0 && offset - start >= minLength) {
      strings.push({
        index: strings.length,
        offset: start,
        value: buffer.subarray(start, offset).toString("ascii"),
      });
    }
    start = -1;
  }

  return strings;
}

function extractPrintableStrings(buffer, minLength = 4) {
  const strings = extractPrintableStringRecords(buffer, minLength).map((record) => record.value);
  return [...new Set(strings)];
}

function extractSymbolMarkers(buffer) {
  const text = buffer.toString("latin1");
  const symbols = [];
  const seen = new Set();

  for (const match of text.matchAll(/\*[A-Za-z0-9_]+\*/g)) {
    if (seen.has(match[0])) continue;
    seen.add(match[0]);
    symbols.push(match[0]);
  }

  return symbols;
}

function parsePatchTable(buffer) {
  if (buffer.length < 4 || buffer.length % 4 !== 0) throw new Error("invalid PTCH payload size");
  const values = [];
  for (let offset = 0; offset < buffer.length; offset += 4) {
    values.push(buffer.readUInt32LE(offset));
  }

  const entryCount = values[0];
  const reservedValue = values[1] ?? 0;
  const headerValueCount = 2;
  const expectedPairValueCount = entryCount * 2;
  if (values.length < headerValueCount + expectedPairValueCount) {
    throw new Error(`invalid PTCH entry count: ${entryCount}`);
  }

  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    const targetOffset = values[headerValueCount + index * 2];
    const sourceOffset = values[headerValueCount + index * 2 + 1];
    entries.push({ sourceOffset, targetOffset });
  }

  return {
    entryCount,
    reservedValue,
    entries,
    tailValues: values.slice(headerValueCount + expectedPairValueCount),
    rawValueCount: values.length,
  };
}

const instanceObfuscationKeys = [
  0x6e0da13b, 0x50daa98f, 0x2d5ffa4f, 0x56c6c3eb, 0xcad31ddd, 0x04f7be6a, 0xd5c4e961, 0x7fe2ef92,
  0xccbb8a6d, 0x19b6875b, 0x433b604c, 0xba7b1ee4, 0x9dea872e, 0xa8c2e10a, 0xed30a2ff, 0x16a8f9a4,
];

function u32(value) {
  return value >>> 0;
}

function mixJenkins(a, b, c) {
  a = u32(a - b - c);
  a = u32(a ^ (c >>> 13));
  b = u32(b - c - a);
  b = u32(b ^ u32(a << 8));
  c = u32(c - a - b);
  c = u32(c ^ (b >>> 13));
  a = u32(a - b - c);
  a = u32(a ^ (c >>> 12));
  b = u32(b - c - a);
  b = u32(b ^ u32(a << 16));
  c = u32(c - a - b);
  c = u32(c ^ (b >>> 5));
  a = u32(a - b - c);
  a = u32(a ^ (c >>> 3));
  b = u32(b - c - a);
  b = u32(b ^ u32(a << 10));
  c = u32(c - a - b);
  c = u32(c ^ (b >>> 15));
  return [a, b, c];
}

function jenkinsLookupHash(buffer, seed = 0) {
  let a = 0x9e3779b9;
  let b = 0x9e3779b9;
  let c = seed >>> 0;
  let offset = 0;
  let remaining = buffer.length;

  while (remaining >= 12) {
    a = u32(a + buffer.readUInt32LE(offset));
    b = u32(b + buffer.readUInt32LE(offset + 4));
    c = u32(c + buffer.readUInt32LE(offset + 8));
    [a, b, c] = mixJenkins(a, b, c);
    offset += 12;
    remaining -= 12;
  }

  c = u32(c + buffer.length);
  switch (remaining) {
    case 11:
      c = u32(c + (buffer[offset + 10] << 24));
    case 10:
      c = u32(c + (buffer[offset + 9] << 16));
    case 9:
      c = u32(c + (buffer[offset + 8] << 8));
    case 8:
      b = u32(b + (buffer[offset + 7] << 24));
    case 7:
      b = u32(b + (buffer[offset + 6] << 16));
    case 6:
      b = u32(b + (buffer[offset + 5] << 8));
    case 5:
      b = u32(b + buffer[offset + 4]);
    case 4:
      a = u32(a + (buffer[offset + 3] << 24));
    case 3:
      a = u32(a + (buffer[offset + 2] << 16));
    case 2:
      a = u32(a + (buffer[offset + 1] << 8));
    case 1:
      a = u32(a + buffer[offset]);
  }

  [, , c] = mixJenkins(a, b, c);
  return c >>> 0;
}

function rotateRight31(value) {
  return u32((value >>> 31) | (value << 1));
}

function decodeInstancePayload(payload, versionByte) {
  const key = instanceObfuscationKeys[versionByte];
  const output = Buffer.from(payload);
  if (key === undefined || versionByte < 1 || versionByte > 15) return output;

  const keyBuffer = Buffer.alloc(4);
  keyBuffer.writeUInt32LE(key);
  const hash = jenkinsLookupHash(keyBuffer, output.length);
  let previousEncryptedWord = output.length >>> 0;

  for (let offset = 0; offset + 4 <= output.length; offset += 4) {
    const encryptedWord = output.readUInt32LE(offset);
    const decodedWord = u32(hash ^ rotateRight31(previousEncryptedWord) ^ encryptedWord);
    output.writeUInt32LE(decodedWord, offset);
    previousEncryptedWord = encryptedWord;
  }

  return output;
}

function decodeInstanceChunks(parsed, buffer) {
  const decoded = [];
  let currentDefinition = null;
  let blockIndex = -1;

  for (const chunk of parsed.chunks) {
    if (chunk.magic === "DEF0") {
      blockIndex += 1;
      currentDefinition = {
        blockIndex,
        definitionFormatByte: buffer[chunk.payloadOffset],
        definitionVersionByte: buffer[chunk.payloadOffset + 1],
        offset: chunk.offset,
      };
      continue;
    }

    if (chunk.magic !== "INST" || !currentDefinition) continue;

    const payload = buffer.subarray(chunk.payloadOffset, chunk.payloadOffset + chunk.payloadSize);
    const decodedPayload = decodeInstancePayload(payload, currentDefinition.definitionVersionByte);
    decoded.push({
      blockIndex: currentDefinition.blockIndex,
      definitionOffset: currentDefinition.offset,
      definitionFormatByte: currentDefinition.definitionFormatByte,
      definitionVersionByte: currentDefinition.definitionVersionByte,
      offset: chunk.offset,
      payloadSize: chunk.payloadSize,
      decodedPayload,
      stringRecords: extractPrintableStringRecords(decodedPayload),
      strings: extractPrintableStrings(decodedPayload),
    });
  }

  return decoded;
}

function parseCff0Buffer(buffer) {
  const magic = readMagic(buffer, 0);
  if (magic !== "CFF0") throw new Error(`not CFF0: ${magic}`);

  const declaredSize = buffer.readUInt32LE(4);
  const versionA = buffer.readUInt32LE(8);
  const versionB = buffer.readUInt32LE(12);
  const headerSize = buffer.readUInt32LE(20) || 64;
  const chunks = [];

  let offset = headerSize;
  while (offset + 8 <= buffer.length) {
    const chunkMagic = readMagic(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    if (!isChunkMagic(chunkMagic) || size < 8 || offset + size > buffer.length) {
      break;
    }

    const payload = buffer.subarray(offset + 8, offset + size);
    const strings = extractPrintableStrings(payload);
    const symbols = chunkMagic === "SYMB" ? extractSymbolMarkers(payload) : [];
    chunks.push({
      magic: chunkMagic,
      offset,
      size,
      payloadOffset: offset + 8,
      payloadSize: size - 8,
      strings,
      symbols,
    });
    offset += size;
  }

  return {
    magic,
    declaredSize,
    actualSize: buffer.length,
    versionA,
    versionB,
    headerSize,
    chunks,
    symbols: chunks.flatMap((chunk) => chunk.symbols),
  };
}

function parseCff0File(filePath) {
  return {
    filePath,
    ...parseCff0Buffer(fs.readFileSync(filePath)),
  };
}

module.exports = {
  decodeInstanceChunks,
  decodeInstancePayload,
  extractPrintableStringRecords,
  extractPrintableStrings,
  extractSymbolMarkers,
  instanceObfuscationKeys,
  jenkinsLookupHash,
  parseCff0Buffer,
  parseCff0File,
  parsePatchTable,
};
