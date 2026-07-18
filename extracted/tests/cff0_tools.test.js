const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  decodeInstanceChunks,
  decodeInstancePayload,
  extractPrintableStringRecords,
  extractPrintableStrings,
  extractSymbolMarkers,
  jenkinsLookupHash,
  parseCff0Buffer,
  parseCff0File,
  parsePatchTable,
} = require("../tools/cff0_tools");

function chunk(magic, payload) {
  const body = Buffer.from(payload);
  const header = Buffer.alloc(8);
  header.write(magic, 0, 4, "ascii");
  header.writeUInt32LE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

test("extractPrintableStrings returns readable strings from binary payloads", () => {
  const strings = extractPrintableStrings(Buffer.from([0, 42, 65, 66, 67, 42, 0, 10]), 3);
  assert.deepEqual(strings, ["*ABC*"]);
});

test("extractPrintableStringRecords returns string offsets in decoded payloads", () => {
  const records = extractPrintableStringRecords(Buffer.from([0, ...Buffer.from("Weapon"), 0, 9, ...Buffer.from("right_hand_bnd"), 0]));

  assert.deepEqual(records, [
    { index: 0, offset: 1, value: "Weapon" },
    { index: 1, offset: 9, value: "right_hand_bnd" },
  ]);
});

test("extractSymbolMarkers ignores prefix bytes before starred symbol names", () => {
  const symbols = extractSymbolMarkers(Buffer.from([0x36, 0x2a, ...Buffer.from("KindredSkinManifest"), 0x2a, 0]));
  assert.deepEqual(symbols, ["*KindredSkinManifest*"]);
});

test("parseCff0Buffer reads contiguous chunks after the CFF0 header", () => {
  const chunks = [
    chunk("DEF0", Buffer.alloc(8)),
    chunk("INST", Buffer.from("payload")),
    chunk("SYMB", Buffer.from([0, 0, 0, 0, 42, 84, 101, 115, 116, 42, 0])),
  ];
  const buffer = Buffer.alloc(64);
  buffer.write("CFF0", 0, 4, "ascii");
  buffer.writeUInt32LE(64 + chunks.reduce((sum, item) => sum + item.length, 0), 4);
  buffer.writeUInt32LE(64, 20);
  const parsed = parseCff0Buffer(Buffer.concat([buffer, ...chunks]));

  assert.equal(parsed.magic, "CFF0");
  assert.equal(parsed.headerSize, 64);
  assert.deepEqual(
    parsed.chunks.map((entry) => [entry.magic, entry.offset, entry.size]),
    [
      ["DEF0", 64, 16],
      ["INST", 80, 15],
      ["SYMB", 95, 19],
    ],
  );
  assert.deepEqual(parsed.chunks[2].symbols, ["*Test*"]);
});

test("parseCff0File reads a CFF0 file from disk", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-cff0-"));
  const filePath = path.join(tempDir, "sample.def");
  const symb = chunk("SYMB", Buffer.from("*Manifest*"));
  const header = Buffer.alloc(64);
  header.write("CFF0", 0, 4, "ascii");
  header.writeUInt32LE(64 + symb.length, 4);
  header.writeUInt32LE(64, 20);
  fs.writeFileSync(filePath, Buffer.concat([header, symb]));

  const parsed = parseCff0File(filePath);
  assert.equal(parsed.filePath, filePath);
  assert.equal(parsed.chunks.length, 1);
  assert.deepEqual(parsed.symbols, ["*Manifest*"]);
});

test("parsePatchTable reads count, reserved value, packed relocations, and tail values", () => {
  const values = [3, 0, 0x10, 0x200, 0x18, 0x240, 0x28, 0x300, 37];
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));

  const table = parsePatchTable(buffer);

  assert.equal(table.entryCount, 3);
  assert.equal(table.reservedValue, 0);
  assert.deepEqual(table.entries, [
    { sourceOffset: 0x200, targetOffset: 0x10 },
    { sourceOffset: 0x240, targetOffset: 0x18 },
    { sourceOffset: 0x300, targetOffset: 0x28 },
  ]);
  assert.deepEqual(table.tailValues, [37]);
});

test("jenkinsLookupHash matches the native 32-bit lookup hash for short keys", () => {
  const key = Buffer.from("6d8abbcc", "hex");

  assert.equal(jenkinsLookupHash(key, 56), 0x5a62835f);
});

test("decodeInstancePayload deobfuscates native CFF0 INST payloads", () => {
  const encrypted = Buffer.from(
    "2f83625a0185a7ee5c892d87e691395493a011f208ae20c72bad7ca061adf77fc2afe4d5da8ce7b0b3dfff646d75c9dfc136a6ac8cee2e03",
    "hex",
  );
  const decoded = decodeInstancePayload(encrypted, 8);

  assert.match(decoded.toString("latin1"), /player_title_vip/);
  assert.match(decoded.toString("latin1"), /PLAYER_TITLE_VIP/);
});

test("decodeInstanceChunks pairs DEF0 version bytes with following INST chunks", () => {
  const encrypted = Buffer.from(
    "2f83625a0185a7ee5c892d87e691395493a011f208ae20c72bad7ca061adf77fc2afe4d5da8ce7b0b3dfff646d75c9dfc136a6ac8cee2e03",
    "hex",
  );
  const buffer = Buffer.alloc(64 + 16 + 8 + encrypted.length);
  buffer.write("CFF0", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 4);
  buffer.writeUInt32LE(64, 20);
  buffer.write("DEF0", 64, "ascii");
  buffer.writeUInt32LE(16, 68);
  buffer[72] = 4;
  buffer[73] = 8;
  buffer.write("INST", 80, "ascii");
  buffer.writeUInt32LE(8 + encrypted.length, 84);
  encrypted.copy(buffer, 88);

  const parsed = parseCff0Buffer(buffer);
  const [decoded] = decodeInstanceChunks(parsed, buffer);

  assert.equal(decoded.blockIndex, 0);
  assert.equal(decoded.definitionVersionByte, 8);
  assert.deepEqual(decoded.strings, ["player_title_vip", "PLAYER_TITLE_VIP"]);
});
