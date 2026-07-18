const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildKindredEffectHashSlotRowsFromDecoded,
  effectTokenForPfxPath,
  fnv1a32,
  fnv1a32Hex,
  pointerSizeForDefinitionFormat,
  summarize,
} = require("../tools/kindred_effect_hash_slots");

test("buildKindredEffectHashSlotRowsFromDecoded reads effect hash before a 32-bit PFX pointer", () => {
  const decodedPayload = Buffer.alloc(96);
  decodedPayload.writeUInt32LE(fnv1a32("Effect_Foo"), 32);

  const rows = buildKindredEffectHashSlotRowsFromDecoded({
    instances: [
      {
        blockIndex: 0,
        definitionFormatByte: 4,
        definitionVersionByte: 8,
        decodedPayload,
        stringRecords: [
          {
            offset: 40,
            value: "build://Effects/Test/Foo/Foo.pfx",
          },
        ],
      },
    ],
    patchTables: [
      {
        chunkOffset: 128,
        entries: [
          {
            sourceOffset: 40,
            targetOffset: 36,
          },
        ],
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].effectHashHex, fnv1a32Hex("Effect_Foo"));
  assert.equal(rows[0].expectedEffectToken, "Effect_Foo");
  assert.equal(rows[0].keyOffset, 32);
  assert.equal(rows[0].pointerSize, 4);
  assert.equal(rows[0].resourcePath, "Effects/Test/Foo/Foo.pfx");
  assert.equal(rows[0].hashMatchesResourceStemToken, true);
});

test("buildKindredEffectHashSlotRowsFromDecoded reads effect hash before a 64-bit PFX pointer", () => {
  const decodedPayload = Buffer.alloc(128);
  decodedPayload.writeUInt32LE(fnv1a32("Effect_Bar"), 64);

  const rows = buildKindredEffectHashSlotRowsFromDecoded({
    instances: [
      {
        blockIndex: 1,
        definitionFormatByte: 5,
        definitionVersionByte: 5,
        decodedPayload,
        stringRecords: [
          {
            offset: 80,
            value: "build://Effects/Test/Bar/Bar.pfx",
          },
        ],
      },
    ],
    patchTables: [
      {
        chunkOffset: 256,
        entries: [
          {
            sourceOffset: 80,
            targetOffset: 72,
          },
        ],
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].effectHashHex, fnv1a32Hex("Effect_Bar"));
  assert.equal(rows[0].keyOffset, 64);
  assert.equal(rows[0].pointerSize, 8);
  assert.equal(rows[0].hashMatchesResourceStemToken, true);
});

test("kindred effect hash slot helpers expose stable runtime semantics", () => {
  assert.equal(effectTokenForPfxPath("Effects/Hero000/Hero000_FireBall/Hero000_FireBall.pfx"), "Effect_Hero000_FireBall");
  assert.equal(pointerSizeForDefinitionFormat(4), 4);
  assert.equal(pointerSizeForDefinitionFormat(5), 8);

  const rows = [
    {
      effectHashHex: "AAAAAAAA",
      resourcePath: "Effects/Test/A/A.pfx",
      hashMatchesResourceStemToken: true,
      definitionFormatByte: 4,
    },
    {
      effectHashHex: "AAAAAAAA",
      resourcePath: "Effects/Test/A/A.pfx",
      hashMatchesResourceStemToken: true,
      definitionFormatByte: 5,
    },
    {
      effectHashHex: "BBBBBBBB",
      resourcePath: "Effects/Test/B/B.pfx",
      hashMatchesResourceStemToken: false,
      definitionFormatByte: 5,
    },
  ];
  const summary = summarize(rows);
  assert.equal(summary.rows, 3);
  assert.equal(summary.uniqueEffectHashes, 2);
  assert.equal(summary.uniqueHashResourcePairs, 2);
  assert.equal(summary.duplicateBlockRows, 1);
  assert.equal(summary.exactStemHashRows, 2);
  assert.equal(summary.exactStemHashUniquePairs, 1);
  assert.equal(summary.renderPromotionAllowed, false);
});
