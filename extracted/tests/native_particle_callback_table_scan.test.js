const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildNativeParticleCallbackTableScanManifest,
  collectPfxResolverCandidateKeys,
  parseBinarySections,
  reportRowsForManifest,
  scanCallbackResolverTableCandidates,
  summarizeCallbackResolverTableCandidates,
} = require("../tools/native_particle_callback_table_scan");

function writeEntry(buffer, offset, key, callback) {
  buffer.writeBigUInt64LE(BigInt(key), offset);
  buffer.writeBigUInt64LE(BigInt(callback), offset + 8);
}

function writeFixedString(buffer, offset, length, value) {
  buffer.write(String(value), offset, Math.min(length, String(value).length), "utf8");
}

function fakeFatMachO64WithCallbackTable() {
  const sliceOffset = 0x100;
  const textSectionOffset = 0x400;
  const constSectionOffset = 0x800;
  const buffer = Buffer.alloc(sliceOffset + 0x1000);

  buffer.writeUInt32BE(0xcafebabe, 0);
  buffer.writeUInt32BE(2, 4);
  buffer.writeUInt32BE(0x0000000c, 8);
  buffer.writeUInt32BE(9, 12);
  buffer.writeUInt32BE(0x40, 16);
  buffer.writeUInt32BE(0x80, 20);
  buffer.writeUInt32BE(2, 24);
  buffer.writeUInt32BE(0x0100000c, 28);
  buffer.writeUInt32BE(0, 32);
  buffer.writeUInt32BE(sliceOffset, 36);
  buffer.writeUInt32BE(0x1000, 40);
  buffer.writeUInt32BE(2, 44);

  buffer.writeUInt32LE(0xfeedfacf, sliceOffset);
  buffer.writeUInt32LE(0x0100000c, sliceOffset + 4);
  buffer.writeUInt32LE(0, sliceOffset + 8);
  buffer.writeUInt32LE(2, sliceOffset + 12);
  buffer.writeUInt32LE(2, sliceOffset + 16);
  buffer.writeUInt32LE(2 * (72 + 80), sliceOffset + 20);

  const textCommandOffset = sliceOffset + 32;
  buffer.writeUInt32LE(0x19, textCommandOffset);
  buffer.writeUInt32LE(72 + 80, textCommandOffset + 4);
  writeFixedString(buffer, textCommandOffset + 8, 16, "__TEXT");
  buffer.writeBigUInt64LE(0x100000000n, textCommandOffset + 24);
  buffer.writeBigUInt64LE(0x1000n, textCommandOffset + 32);
  buffer.writeBigUInt64LE(0n, textCommandOffset + 40);
  buffer.writeBigUInt64LE(0x1000n, textCommandOffset + 48);
  buffer.writeUInt32LE(1, textCommandOffset + 64);
  const textSectionHeaderOffset = textCommandOffset + 72;
  writeFixedString(buffer, textSectionHeaderOffset, 16, "__text");
  writeFixedString(buffer, textSectionHeaderOffset + 16, 16, "__TEXT");
  buffer.writeBigUInt64LE(0x100000400n, textSectionHeaderOffset + 32);
  buffer.writeBigUInt64LE(0x200n, textSectionHeaderOffset + 40);
  buffer.writeUInt32LE(textSectionOffset, textSectionHeaderOffset + 48);
  buffer.writeUInt32LE(0x80000400, textSectionHeaderOffset + 64);

  const dataCommandOffset = textCommandOffset + 72 + 80;
  buffer.writeUInt32LE(0x19, dataCommandOffset);
  buffer.writeUInt32LE(72 + 80, dataCommandOffset + 4);
  writeFixedString(buffer, dataCommandOffset + 8, 16, "__DATA");
  buffer.writeBigUInt64LE(0x100001000n, dataCommandOffset + 24);
  buffer.writeBigUInt64LE(0x1000n, dataCommandOffset + 32);
  buffer.writeBigUInt64LE(0x1000n, dataCommandOffset + 40);
  buffer.writeBigUInt64LE(0x1000n, dataCommandOffset + 48);
  buffer.writeUInt32LE(1, dataCommandOffset + 64);
  const constSectionHeaderOffset = dataCommandOffset + 72;
  writeFixedString(buffer, constSectionHeaderOffset, 16, "__const");
  writeFixedString(buffer, constSectionHeaderOffset + 16, 16, "__DATA");
  buffer.writeBigUInt64LE(0x100001800n, constSectionHeaderOffset + 32);
  buffer.writeBigUInt64LE(0x200n, constSectionHeaderOffset + 40);
  buffer.writeUInt32LE(constSectionOffset, constSectionHeaderOffset + 48);

  writeEntry(buffer, sliceOffset + constSectionOffset + 8, 0x10n, 0x100000410n);
  writeEntry(buffer, sliceOffset + constSectionOffset + 24, 0x20n, 0x100000420n);
  writeEntry(buffer, sliceOffset + constSectionOffset + 40, 0x30n, 0x100000430n);
  writeEntry(buffer, sliceOffset + constSectionOffset + 56, 0x40n, 0x100000440n);

  return buffer;
}

test("parseBinarySections extracts arm64 sections from a fat Mach-O binary", () => {
  const sections = parseBinarySections(fakeFatMachO64WithCallbackTable());

  assert.deepEqual(
    sections.map(({ name, addr, off, size, architecture, binaryFormat }) => ({
      name,
      addr,
      off,
      size,
      architecture,
      binaryFormat,
    })),
    [
      {
        name: "__TEXT,__text",
        addr: 0x100000400,
        off: 0x500,
        size: 0x200,
        architecture: "arm64",
        binaryFormat: "mach-o-fat",
      },
      {
        name: "__DATA,__const",
        addr: 0x100001800,
        off: 0x900,
        size: 0x200,
        architecture: "arm64",
        binaryFormat: "mach-o-fat",
      },
    ],
  );
});

test("scanCallbackResolverTableCandidates finds sorted key to text pointer tables", () => {
  const buffer = Buffer.alloc(0x500);
  const sections = [
    { name: ".text", off: 0x100, addr: 0x1000, size: 0x200 },
    { name: ".data.rel.ro", off: 0x300, addr: 0x3000, size: 0x100 },
  ];
  writeEntry(buffer, 0x308, 0x10n, 0x1010n);
  writeEntry(buffer, 0x318, 0x20n, 0x1020n);
  writeEntry(buffer, 0x328, 0x30n, 0x1030n);
  writeEntry(buffer, 0x338, 0x40n, 0x1040n);

  const candidates = scanCallbackResolverTableCandidates(buffer, {
    sections,
    candidateKeys: new Set([0x20n, 0x90n]),
    minRunLength: 3,
  });

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], {
    section: ".data.rel.ro",
    fileOffset: 0x308,
    virtualAddress: 0x3008,
    entryStride: 16,
    keyOffset: 0,
    callbackOffset: 8,
    entryCount: 4,
    byteLength: 64,
    textPointerRows: 4,
    pfxCandidateKeyMatches: 1,
    pfxCandidateKeyCount: 2,
    pfxKeyHitRatio: 0.5,
    firstKey: "0x10",
    lastKey: "0x40",
    firstCallback: "0x1010",
    lastCallback: "0x1040",
    matchedEntries: [{ entryIndex: 1, key: "0x20", callback: "0x1020" }],
  });
});

test("scanCallbackResolverTableCandidates scans callback tables from Mach-O const sections", () => {
  const candidates = scanCallbackResolverTableCandidates(fakeFatMachO64WithCallbackTable(), {
    candidateKeys: new Set([0x20n, 0x90n]),
    minRunLength: 3,
  });

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], {
    section: "__DATA,__const",
    fileOffset: 0x908,
    virtualAddress: 0x100001808,
    entryStride: 16,
    keyOffset: 0,
    callbackOffset: 8,
    entryCount: 4,
    byteLength: 64,
    textPointerRows: 4,
    pfxCandidateKeyMatches: 1,
    pfxCandidateKeyCount: 2,
    pfxKeyHitRatio: 0.5,
    firstKey: "0x10",
    lastKey: "0x40",
    firstCallback: "0x100000410",
    lastCallback: "0x100000440",
    matchedEntries: [{ entryIndex: 1, key: "0x20", callback: "0x100000420" }],
  });
});

test("buildNativeParticleCallbackTableScanManifest records candidate keys missing from the current table", () => {
  const buffer = Buffer.alloc(0x500);
  const sections = [
    { name: ".text", off: 0x100, addr: 0x1000, size: 0x200 },
    { name: ".data.rel.ro", off: 0x300, addr: 0x3000, size: 0x100 },
  ];
  writeEntry(buffer, 0x308, 0x10n, 0x1010n);
  writeEntry(buffer, 0x318, 0x20n, 0x1020n);
  writeEntry(buffer, 0x328, 0x30n, 0x1030n);
  writeEntry(buffer, 0x338, 0x40n, 0x1040n);

  const manifest = buildNativeParticleCallbackTableScanManifest({
    binaryBuffer: buffer,
    pfxManifest: {
      items: [
        {
          surfaceRecords: [
            {
              emitterRuntimeProfile: {
                semanticSlots: [
                  { resolverInputKind: "candidate-key", resolverInputValue: "0x20" },
                  { resolverInputKind: "candidate-key", resolverInputValue: "0x90" },
                ],
              },
            },
          ],
        },
      ],
    },
    nativeParticleRuntimeSchema: {
      items: [{ recordKind: "particle-callback-resolver", entryCount: "0x3" }],
    },
    sections,
    minRunLength: 3,
    generatedAt: "2026-06-29T00:00:00.000Z",
  });

  assert.deepEqual(manifest.candidateKeyMisses, ["0x90"]);
  assert.equal(manifest.summary.pfxCandidateKeyMisses, 1);
  assert.equal(manifest.summary.pfxCandidateKeyMissRatio, 0.5);
});

test("collectPfxResolverCandidateKeys includes native child emitter callback slots", () => {
  const keys = collectPfxResolverCandidateKeys({
    items: [
      {
        surfaceRecords: [
          {
            emitterRuntimeProfile: {
              semanticSlots: [{ resolverInputKind: "candidate-key", resolverInputValue: "0x20" }],
            },
            childEmitterRecords: [
              {
                runtimeProfile: {
                  semanticSlots: [{ resolverInputKind: "candidate-key", resolverInputValue: "0x30" }],
                },
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual([...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)), [0x20n, 0x30n]);
});

test("summarizeCallbackResolverTableCandidates and report rows expose best candidate evidence", () => {
  const candidates = [
    {
      section: ".data.rel.ro",
      fileOffset: 0x308,
      virtualAddress: 0x3008,
      entryStride: 16,
      keyOffset: 0,
      callbackOffset: 8,
      entryCount: 4,
      byteLength: 64,
      textPointerRows: 4,
      pfxCandidateKeyMatches: 1,
      pfxCandidateKeyCount: 2,
      pfxKeyHitRatio: 0.5,
      firstKey: "0x10",
      lastKey: "0x40",
      firstCallback: "0x1010",
      lastCallback: "0x1040",
    },
  ];
  const manifest = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    summary: summarizeCallbackResolverTableCandidates(candidates, { referenceEntryCount: 3 }),
    items: candidates,
  };

  assert.deepEqual(manifest.summary, {
    candidates: 1,
    bestEntryCount: 4,
    bestPfxCandidateKeyMatches: 1,
    bestPfxKeyHitRatio: 0.5,
    pfxCandidateKeyMisses: 0,
    pfxCandidateKeyMissRatio: 0,
    referenceEntryCount: 3,
    bestEntryCountDeltaFromReference: 1,
  });
  assert.deepEqual(reportRowsForManifest(manifest), [
    {
      section: ".data.rel.ro",
      fileOffset: "0x308",
      virtualAddress: "0x3008",
      entryCount: 4,
      byteLength: 64,
      pfxCandidateKeyMatches: 1,
      pfxCandidateKeyCount: 2,
      pfxKeyHitRatio: 0.5,
      referenceEntryCount: 3,
      entryCountDeltaFromReference: 1,
      firstKey: "0x10",
      lastKey: "0x40",
      firstCallback: "0x1010",
      lastCallback: "0x1040",
    },
  ]);
});
