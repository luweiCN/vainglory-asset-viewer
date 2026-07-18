const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildPfxResourceManifest,
  exportPfxResourceManifest,
  extractPfxNativeEmitterRecords,
  extractPfxSurfaceRecords,
  extractPfxReferences,
  reportRowsForManifest,
} = require("../tools/pfx_resource_manifest");

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function writePfxSurfaceRecord(buffer, recordStart, surfaceIndex, preludeBytes, floatSamples = {}, options = {}) {
  Buffer.from(preludeBytes).copy(buffer, recordStart);
  const pathPrefix = options.pathPrefix ?? "?";
  const ref = `${pathPrefix}Effects/Test/Test.Surface[${surfaceIndex}].shadergraph`;
  buffer.write(ref, recordStart + 16, "latin1");
  for (const [relativeOffset, value] of Object.entries(floatSamples)) {
    buffer.writeFloatLE(value, recordStart + Number(relativeOffset));
  }
}

function writeNativePfxSurfaceRecord(buffer, recordStart, surfaceIndex, options = {}) {
  buffer[0x18] = options.recordCount ?? 1;
  buffer[recordStart + 0x27] = options.pathMarkerByte ?? 0x3f;
  buffer[recordStart + 0xa8] = options.childCount ?? 1;
  buffer[recordStart + 0xa9] = options.attachmentCountA ?? 0;
  buffer[recordStart + 0xaa] = options.attachmentCountB ?? 0;
  const ref = `Effects/Test/Native.Surface[${surfaceIndex}].shadergraph`;
  buffer.write(ref, recordStart + 0x28, "latin1");
  for (const [relativeOffset, value] of Object.entries(options.floatSamples || {})) {
    buffer.writeFloatLE(value, recordStart + Number(relativeOffset));
  }
}

test("extractPfxReferences recovers virtual surface shadergraph references", () => {
  const buffer = Buffer.from(
    [
      "PFX0",
      "\0",
      "?Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
      "\0",
      "Textures/Hero028/Hero028_A_Weapon_Diffuse.pvr",
      "\0",
    ].join(""),
    "latin1",
  );

  const references = extractPfxReferences(buffer);

  assert.deepEqual(
    references.map((reference) => ({
      relativePath: reference.relativePath,
      kind: reference.kind,
      surfaceIndex: reference.surfaceIndex,
    })),
    [
      {
        relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
        kind: "shadergraph",
        surfaceIndex: 6,
      },
      {
        relativePath: "Textures/Hero028/Hero028_A_Weapon_Diffuse.pvr",
        kind: "texture",
        surfaceIndex: null,
      },
    ],
  );
});

test("buildPfxResourceManifest joins pfx internals back to runtime effect hooks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-resource-"));
  const pfxPath = path.join(tempDir, "Hero028_A_Weapon.pfx");
  fs.writeFileSync(
    pfxPath,
    Buffer.from(
      "?Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[51].shadergraph\0" +
        "?Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph\0",
      "latin1",
    ),
  );

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Lance_A_Weapon",
            effectToken: "Effect_Lance_A_Weapon",
            sourceKind: "native-effect-spawn",
            boneToken: "Bone_RightHand",
            runtimeBinding: {
              kind: "bone",
              boneToken: "Bone_RightHand",
              evidence: "native-locator-token",
              startSeconds: 0.25,
              timelineTimes: [0.25, 0.5],
              effectOptions: {
                followTarget: true,
                color: [0.1, 0.2, 0.3, 1],
                scale: 1.5,
              },
            },
            actionKeys: ["ability01"],
            resourcePaths: ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"],
            primaryAbilityContext: { runtimeAbilityName: "Ability__Lance__A" },
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.summary.referencedShadergraphRows, 1);
  assert.equal(manifest.summary.hookLinkedRows, 1);
  assert.deepEqual(manifest.items[0].surfaceIndices, [6, 51]);
  assert.equal(manifest.items[0].maxSurfaceIndex, 51);
  assert.deepEqual(manifest.items[0].hookEffectTokens, ["Effect_Lance_A_Weapon"]);
  assert.deepEqual(manifest.items[0].hookAbilityNames, ["Ability__Lance__A"]);
  assert.deepEqual(manifest.items[0].hookBindingProfiles, [
    {
      token: "Effect_Lance_A_Weapon",
      effectToken: "Effect_Lance_A_Weapon",
      sourceKind: "native-effect-spawn",
      kind: "bone",
      boneToken: "Bone_RightHand",
      evidence: "native-locator-token",
      actionKeys: ["ability01"],
      startSeconds: 0.25,
      timelineTimes: [0.25, 0.5],
      effectOptions: {
        followTarget: true,
        visibleOrActive: null,
        hasColor: true,
        hasScale: true,
        hasFadeSeconds: false,
        color: [0.1, 0.2, 0.3],
        scale: 1.5,
      },
    },
  ]);
  assert.equal(manifest.summary.hookBindingProfileRows, 1);
  assert.deepEqual(manifest.summary.byHookRuntimeBindingKind, { bone: 1 });
});

test("buildPfxResourceManifest keeps selected attachment slots in hook binding profiles", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-resource-"));
  const pfxPath = path.join(tempDir, "Hero019_C_PreWarning.pfx");
  fs.writeFileSync(pfxPath, Buffer.from("?Effects/Hero019/Hero019_C_PreWarning/Hero019_C_PreWarning.Surface[1].shadergraph\0", "latin1"));

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Hero019/Hero019_C_PreWarning/Hero019_C_PreWarning.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Baron_C_AllyPreWarning",
            effectToken: "Effect_Baron_C_AllyPreWarning",
            sourceKind: "native-effect-vcall",
            runtimeBinding: {
              kind: "selected-attachment",
              boneToken: "",
              selectedAttachmentSlot: 2,
              evidence: "native-selected-attachment-effect",
              startSeconds: 0,
              timelineTimes: [],
            },
            actionKeys: ["ability03"],
            resourcePaths: ["Effects/Hero019/Hero019_C_PreWarning/Hero019_C_PreWarning.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.summary.hookLinkedRows, 1);
  assert.equal(manifest.items[0].hookBindingProfiles[0].kind, "selected-attachment");
  assert.equal(manifest.items[0].hookBindingProfiles[0].selectedAttachmentSlot, 2);
});

test("buildPfxResourceManifest preserves explicit false native effect option evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-option-tristate-"));
  const pfxPath = path.join(tempDir, "WorldWarning.pfx");
  fs.writeFileSync(pfxPath, Buffer.from("?Effects/Test/WorldWarning/WorldWarning.Surface[1].shadergraph\0", "latin1"));

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/WorldWarning/WorldWarning.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_WorldWarning",
            effectToken: "Effect_Test_WorldWarning",
            sourceKind: "native-effect-vcall",
            runtimeBinding: {
              kind: "effect-channel",
              evidence: "native-effect-only",
              effectOptions: {
                followTarget: false,
                visibleOrActive: false,
              },
            },
            resourcePaths: ["Effects/Test/WorldWarning/WorldWarning.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].effectOptions, {
    followTarget: false,
    visibleOrActive: false,
    hasColor: false,
    hasScale: false,
    hasFadeSeconds: false,
  });
});

test("buildPfxResourceManifest preserves raw native effect option offsets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-option-offsets-"));
  const pfxPath = path.join(tempDir, "OffsetDrivenCast.pfx");
  fs.writeFileSync(pfxPath, Buffer.from("?Effects/Test/OffsetDrivenCast/OffsetDrivenCast.Surface[1].shadergraph\0", "latin1"));

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/OffsetDrivenCast/OffsetDrivenCast.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_OffsetDrivenCast",
            effectToken: "Effect_Test_OffsetDrivenCast",
            sourceKind: "native-effect-spawn",
            runtimeBinding: {
              kind: "bone",
              boneToken: "Bone_RightHand",
              evidence: "native-locator-token",
              effectOptionOffsets: ["0x60", "0xd0"],
              effectOptionFloatArgs: ["0x60:0.5", "0xd0:3"],
              effectOptionArgKinds: ["0x60:numeric-local", "0xd0:numeric-local"],
              effectOptionArgSources: ["0x60:numeric-local:local_40=0x3f000000", "0xd0:numeric-local:local_48=0x40400000"],
              effectOptions: {
                offsetValues: {
                  "0x60": [0.5],
                  "0xd0": [3],
                },
                scale: 3,
              },
            },
            resourcePaths: ["Effects/Test/OffsetDrivenCast/OffsetDrivenCast.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].effectOptions, {
    followTarget: null,
    visibleOrActive: null,
    hasColor: false,
    hasScale: true,
    hasFadeSeconds: false,
    scale: 3,
    effectOptionOffsets: ["0x60", "0xd0"],
    effectOptionFloatArgs: ["0x60:0.5", "0xd0:3"],
    effectOptionArgKinds: ["0x60:numeric-local", "0xd0:numeric-local"],
    effectOptionArgSources: ["0x60:numeric-local:local_40=0x3f000000", "0xd0:numeric-local:local_48=0x40400000"],
    offsetValues: {
      "0x60": [0.5],
      "0xd0": [3],
    },
  });
  assert.deepEqual(manifest.summary.byNativeOptionArgKind, {
    "0x60:numeric-local": 1,
    "0xd0:numeric-local": 1,
  });
});

test("buildPfxResourceManifest normalizes standard native effect option offsets for viewer previews", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-option-standard-offsets-"));
  const pfxPath = path.join(tempDir, "StandardOptions.pfx");
  fs.writeFileSync(pfxPath, Buffer.from("?Effects/Test/StandardOptions/StandardOptions.Surface[1].shadergraph\0", "latin1"));

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/StandardOptions/StandardOptions.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_StandardOptions",
            effectToken: "Effect_Test_StandardOptions",
            sourceKind: "native-effect-spawn",
            runtimeBinding: {
              kind: "bone",
              boneToken: "Bone_RightHand",
              evidence: "native-locator-token",
              effectOptionOffsets: ["0xc0", "0xd0", "0x78", "0xd8", "0xb0"],
              effectOptionFloatArgs: ["0xc0:1,0.4,0.2", "0xd0:2.5", "0x78:1", "0xd8:0.35", "0xb0:0"],
              effectOptions: {
                offsetValues: {
                  "0xc0": [1, 0.4, 0.2],
                  "0xd0": [2.5],
                  "0x78": [1],
                  "0xd8": [0.35],
                  "0xb0": [0],
                },
              },
            },
            resourcePaths: ["Effects/Test/StandardOptions/StandardOptions.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].effectOptions, {
    followTarget: true,
    visibleOrActive: false,
    hasColor: true,
    hasScale: true,
    hasFadeSeconds: true,
    color: [1, 0.4, 0.2],
    scale: 2.5,
    fadeSeconds: 0.35,
    effectOptionOffsets: ["0x78", "0xb0", "0xc0", "0xd0", "0xd8"],
    effectOptionFloatArgs: ["0x78:1", "0xb0:0", "0xc0:1,0.4,0.2", "0xd0:2.5", "0xd8:0.35"],
    offsetValues: {
      "0x78": [1],
      "0xb0": [0],
      "0xc0": [1, 0.4, 0.2],
      "0xd0": [2.5],
      "0xd8": [0.35],
    },
  });
});

test("buildPfxResourceManifest records native option values that match pfx lifecycle and transform hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-option-runtime-hints-"));
  const pfxPath = path.join(tempDir, "RuntimeHints.pfx");
  const buffer = Buffer.alloc(48 + 350);
  buffer.writeUInt32LE(1, 24);
  writePfxSurfaceRecord(buffer, 48, 7, [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.5,
    209: 1.25,
    213: 2.5,
  });
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/RuntimeHints/RuntimeHints.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_RuntimeHints",
            effectToken: "Effect_Test_RuntimeHints",
            sourceKind: "native-effect-vcall",
            runtimeBinding: {
              kind: "effect-channel",
              effectOptionOffsets: ["0x60", "0xd0", "0xd8"],
              effectOptions: {
                offsetValues: {
                  "0x60": [0.5],
                  "0xd0": [2.5],
                  "0xd8": [1.25],
                },
              },
            },
            resourcePaths: ["Effects/Test/RuntimeHints/RuntimeHints.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].effectOptions.effectOptionRuntimeHintMatches, [
    "0x60:delaySeconds:0.5@Surface[7]",
    "0xd0:sizeScalar:2.5@Surface[7]",
    "0xd8:durationSeconds:1.25@Surface[7]",
  ]);
  assert.equal(manifest.items[0].hookBindingProfiles[0].effectOptions.effectOptionUnknownRuntimeHintMatches, undefined);
  assert.equal(manifest.summary.nativeOptionRuntimeHintMatchRows, 3);
  assert.equal(manifest.summary.unknownNativeOptionRuntimeHintMatchRows, 0);
  assert.deepEqual(manifest.summary.byUnknownNativeOptionRuntimeHintMatch, {});
});

test("buildPfxResourceManifest combines native start time with pfx surface lifecycle windows", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-absolute-window-"));
  const pfxPath = path.join(tempDir, "AbsoluteWindow.pfx");
  const buffer = Buffer.alloc(48 + 350);
  buffer.writeUInt32LE(1, 24);
  writePfxSurfaceRecord(buffer, 48, 9, [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.2,
    209: 0.75,
  });
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AbsoluteWindow/AbsoluteWindow.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_AbsoluteWindow",
            effectToken: "Effect_Test_AbsoluteWindow",
            sourceKind: "native-effect-vcall",
            runtimeBinding: {
              kind: "bone",
              boneToken: "Bone_RightHand",
              startSeconds: 0.4,
              timelineTimes: [0.4, 1.15],
            },
            resourcePaths: ["Effects/Test/AbsoluteWindow/AbsoluteWindow.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].surfaceTimelineWindow, {
    startSeconds: 0.2,
    endSeconds: 0.95,
    durationSeconds: 0.75,
  });
  assert.deepEqual(manifest.items[0].hookBindingProfiles[0].absoluteTimelineWindow, {
    startSeconds: 0.6,
    endSeconds: 1.35,
    durationSeconds: 0.75,
  });
  assert.equal(manifest.summary.surfaceTimelineWindowRows, 1);
  assert.equal(manifest.summary.absoluteTimelineWindowRows, 1);
});

test("buildPfxResourceManifest keeps intrinsic PFX effect tokens separate from runtime hook diagnostics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-intrinsic-effect-token-"));
  const pfxPath = path.join(tempDir, "Intrinsic.pfx");
  fs.writeFileSync(
    pfxPath,
    Buffer.from(
      [
        "PFX0",
        "\0",
        "Effect_Test_FromPfx",
        "\0",
        "?Effects/Test/Intrinsic/Intrinsic.Surface[1].shadergraph",
        "\0",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/Intrinsic/Intrinsic.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      effectHookManifest: {
        items: [
          {
            token: "Effect_Test_RuntimeLinked",
            effectToken: "Effect_Test_RuntimeLinked",
            resourcePaths: ["Effects/Test/Intrinsic/Intrinsic.pfx"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].intrinsicEffectTokens, ["Effect_Test_FromPfx"]);
  assert.deepEqual(manifest.items[0].hookEffectTokens, ["Effect_Test_RuntimeLinked"]);
});

test("extractPfxSurfaceRecords exposes fixed surface record slots and parameter samples", () => {
  const buffer = Buffer.alloc(48 + 350 * 2);
  writePfxSurfaceRecord(buffer, 48, 7, [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.25,
    209: 1.5,
    213: 2.5,
  });
  writePfxSurfaceRecord(buffer, 398, 9, [0, 4, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.05,
    209: 0.2,
  });

  const records = extractPfxSurfaceRecords(buffer);

  assert.deepEqual(
    records.map((record) => ({
      surfaceIndex: record.surfaceIndex,
      recordStart: record.recordStart,
      recordLength: record.recordLength,
      preludeHex: record.preludeHex,
      preludeBytes: record.preludeBytes,
      prelude: record.prelude,
      parameterOffset: record.parameterOffset,
      sampledFloats: record.sampledFloats,
    })),
    [
      {
        surfaceIndex: 7,
        recordStart: 48,
        recordLength: 350,
        preludeHex: "0001050201010000010000003f000000",
        preludeBytes: [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 63, 0, 0, 0],
        prelude: {
          kindCode: 1,
          orientationCode: 5,
          variantCode: 2,
          flagA: 1,
          flagB: 1,
          renderFamily: "billboard",
        },
        parameterOffset: 192,
        sampledFloats: [
          { relativeOffset: 149, value: 0.25 },
          { relativeOffset: 209, value: 1.5 },
          { relativeOffset: 213, value: 2.5 },
        ],
      },
      {
        surfaceIndex: 9,
        recordStart: 398,
        recordLength: 350,
        preludeHex: "0004020001000000010000003f000000",
        preludeBytes: [0, 4, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 63, 0, 0, 0],
        prelude: {
          kindCode: 4,
          orientationCode: 2,
          variantCode: 0,
          flagA: 1,
          flagB: 0,
          renderFamily: "billboard",
        },
        parameterOffset: 542,
        sampledFloats: [
          { relativeOffset: 149, value: 0.05 },
          { relativeOffset: 209, value: 0.2 },
        ],
      },
    ],
  );
});

test("extractPfxSurfaceRecords uses native emitter starts for runtime fields when the pfx header is present", () => {
  const firstRecordStart = 0x19;
  const nativeRecordLength = 0xe4 + 0x7a;
  const secondRecordStart = firstRecordStart + nativeRecordLength;
  const buffer = Buffer.alloc(firstRecordStart + nativeRecordLength * 2);
  writeNativePfxSurfaceRecord(buffer, firstRecordStart, 7, { recordCount: 2, pathMarkerByte: 0x3f });
  writeNativePfxSurfaceRecord(buffer, secondRecordStart, 9, { recordCount: 2, pathMarkerByte: 0x00 });

  const nativeRecords = extractPfxNativeEmitterRecords(buffer);
  const records = extractPfxSurfaceRecords(buffer);

  assert.deepEqual(
    nativeRecords.map((record) => ({
      recordStart: record.recordStart,
      recordLength: record.recordLength,
      pathSlotPrefix: record.pathSlotPrefix,
      relativePath: record.relativePath,
    })),
    [
      {
        recordStart: 25,
        recordLength: 350,
        pathSlotPrefix: "?",
        relativePath: "Effects/Test/Native.Surface[7].shadergraph",
      },
      {
        recordStart: 375,
        recordLength: 350,
        pathSlotPrefix: "",
        relativePath: "Effects/Test/Native.Surface[9].shadergraph",
      },
    ],
  );
  assert.deepEqual(
    records.map((record) => ({
      surfaceIndex: record.surfaceIndex,
      recordLayout: record.recordLayout,
      recordStart: record.recordStart,
      recordLength: record.recordLength,
      emitterRecordStart: record.emitterRecordStart,
      emitterRecordLength: record.emitterRecordLength,
      pathSlotPrefix: record.pathSlotPrefix,
      pathSlotOffset: record.pathSlotOffset,
      pathSlotMarkerOffset: record.pathSlotMarkerOffset,
    })),
    [
      {
        surfaceIndex: 7,
        recordLayout: "native-emitter-record",
        recordStart: 48,
        recordLength: 350,
        emitterRecordStart: 25,
        emitterRecordLength: 350,
        pathSlotPrefix: "?",
        pathSlotOffset: 65,
        pathSlotMarkerOffset: 64,
      },
      {
        surfaceIndex: 9,
        recordLayout: "native-emitter-record",
        recordStart: 398,
        recordLength: 327,
        emitterRecordStart: 375,
        emitterRecordLength: 350,
        pathSlotPrefix: "",
        pathSlotOffset: 415,
        pathSlotMarkerOffset: 414,
      },
    ],
  );
});

test("extractPfxSurfaceRecords classifies conservative render families from pfx prelude bytes", () => {
  const buffer = Buffer.alloc(48 + 350 * 3);
  writePfxSurfaceRecord(buffer, 48, 1, [0, 5, 0, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]);
  writePfxSurfaceRecord(buffer, 398, 2, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]);
  writePfxSurfaceRecord(buffer, 748, 3, [0, 1, 2, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]);

  const records = extractPfxSurfaceRecords(buffer);

  assert.deepEqual(
    records.map((record) => record.prelude.renderFamily),
    ["beam", "area", "billboard"],
  );
});

test("extractPfxSurfaceRecords derives conservative runtime hints from stable parameter slots", () => {
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 12, [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.25,
    153: -1,
    209: 1.5,
    213: 2.5,
    217: 90,
  });

  const [record] = extractPfxSurfaceRecords(buffer);

  assert.deepEqual(record.runtimeHints, {
    delaySeconds: 0.25,
    durationSeconds: 1.5,
    sizeScalar: 2.5,
    rotationDegrees: 90,
    timingSourceOffsets: {
      delaySeconds: 149,
      durationSeconds: 209,
      sizeScalar: 213,
      rotationDegrees: 217,
    },
  });
});

test("extractPfxSurfaceRecords records conservative surface parameter profiles", () => {
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 12, [0, 1, 5, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    149: 0.25,
    153: -1,
    209: 1.5,
    213: 2.5,
    221: 90,
    249: 481.5,
  });

  const [record] = extractPfxSurfaceRecords(buffer);

  assert.deepEqual(record.parameterProfile, {
    evidenceClass: "lifecycle-transform",
    lifecycleOffsets: [149, 153, 209],
    transformOffsets: [213, 221],
    semanticSlots: [
      { name: "delaySeconds", relativeOffset: 149, value: 0.25 },
      { name: "negativeOneSentinel", relativeOffset: 153, value: -1 },
      { name: "durationSeconds", relativeOffset: 209, value: 1.5 },
      { name: "sizeScalar", relativeOffset: 213, value: 2.5 },
      { name: "rotationDegrees", relativeOffset: 221, value: 90 },
    ],
    sampledOffsetCount: 6,
  });
});

test("buildPfxResourceManifest applies native particle emitter record mappings to pfx surface records", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-runtime-"));
  const pfxPath = path.join(tempDir, "NativeEmitter.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeFloatLE(0.25, 48 + 0xac);
  buffer.writeFloatLE(1.5, 48 + 0xb0);
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xcc);
  buffer.writeBigUInt64LE(0x42n, 48 + 0xdc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitter/NativeEmitter.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xac", runtimeOffset: "0x24c", semantic: "delaySeconds" },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xb0", runtimeOffset: "0x250", semantic: "activeDurationSeconds" },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xdc", runtimeOffset: "0x280", semantic: "colorCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x280",
            semantic: "colorCallback",
            targetArrayOffset: "0x58000",
            targetArraySemantic: "color",
            callbackOutputComponents: 4,
            updateOperation: "assign-color",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
            entryCount: "0x3852e",
            entryStride: "0x10",
            keyOffset: "0x0",
            callbackOffset: "0x8",
          },
        ],
      },
      nativeBinaryVersionAudit: {
        summary: {
          entries: 2,
          exactBuilds: 0,
          crossBuildReferences: 2,
          missingEvidence: 0,
        },
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            section: ".data.rel.ro",
            virtualAddress: 0x272f3c8,
            matchedEntries: [
              {
                entryIndex: 12,
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x40000000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].emitterRuntimeHints, {
    delaySeconds: 0.25,
    durationSeconds: 1.5,
    timingSourceOffsets: {
      delaySeconds: 172,
      durationSeconds: 176,
    },
  });
  assert.deepEqual(manifest.items[0].surfaceRecords[0].emitterRuntimeProfile, {
    evidenceClass: "lifecycle-transform",
    lifecycleOffsets: [172, 176],
    transformOffsets: [204],
    colorOffsets: [220],
    semanticSlots: [
      { name: "delaySeconds", relativeOffset: 172, value: 0.25, runtimeOffset: "0x24c" },
      { name: "activeDurationSeconds", relativeOffset: 176, value: 1.5, runtimeOffset: "0x250" },
      {
        name: "sizeDeltaCallback",
        relativeOffset: 204,
        value: "0x9c5a6b249ef06560",
        runtimeOffset: "0x270",
        targetArrayOffset: "0x30000",
        targetArraySemantic: "size",
        callbackOutputComponents: 1,
        updateOperation: "add-delta-to-size-clamped",
        resolverInputKind: "candidate-key",
        resolverInputValue: "0x9c5a6b249ef06560",
        resolverKey: "0x9c5a6b249ef06560",
        resolverFunction: "FUN_10109b3dc",
        resolverTableBase: "DAT_1014a8918",
        resolverPointerBase: "PTR_FUN_1014a8920",
        resolverTableCompatibilityStatus: "cross-build-reference",
        resolverCurrentBuildStatus: "matched-current-table-candidate",
        resolverCurrentCallbackAddress: "0x123456",
        resolverCurrentCallbackSemanticClass: "constant-scalar-store",
        resolverCurrentCallbackOutputStore: "w8-to-x1",
        resolverCurrentCallbackImmediateBits: "0x40000000",
        resolverCurrentCallbackConstantValue: 2,
        resolverCurrentCallbackConstantSource: "immediate-bits-float32",
        resolverResolutionStatus: "current-table-callback-matched",
      },
      {
        name: "colorCallback",
        relativeOffset: 220,
        value: "0x42",
        runtimeOffset: "0x280",
        targetArrayOffset: "0x58000",
        targetArraySemantic: "color",
        callbackOutputComponents: 4,
        updateOperation: "assign-color",
        resolverInputKind: "literal-or-null",
        resolverInputValue: "0x42",
        resolverFunction: "FUN_10109b3dc",
        resolverTableBase: "DAT_1014a8918",
        resolverPointerBase: "PTR_FUN_1014a8920",
        resolverTableCompatibilityStatus: "cross-build-reference",
        resolverResolutionStatus: "likely-null-literal",
      },
    ],
  });
  assert.equal(manifest.summary.pfxEmitterRuntimeProfileRows, 1);
  assert.equal(manifest.summary.pfxEmitterLifecycleRows, 1);
  assert.equal(manifest.summary.pfxEmitterTransformRows, 1);
  assert.deepEqual(manifest.summary.byPfxEmitterRuntimeSemantic, {
    activeDurationSeconds: 1,
    colorCallback: 1,
    delaySeconds: 1,
    sizeDeltaCallback: 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackTargetArray, {
    "0x30000": 1,
    "0x58000": 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolver, {
    FUN_10109b3dc: 2,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolutionStatus, {
    "current-table-callback-matched": 1,
    "likely-null-literal": 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackInputKind, {
    "candidate-key": 1,
    "literal-or-null": 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackCurrentBuildStatus, {
    "matched-current-table-candidate": 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackCurrentSemanticClass, {
    "constant-scalar-store": 1,
  });
  assert.equal(manifest.summary.pfxEmitterCallbackCurrentConstantRows, 1);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackCurrentConstantTarget, {
    size: 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolverTableCompatibilityStatus, {
    "cross-build-reference": 2,
  });
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /sizeDeltaCallback@204=0x9c5a6b249ef06560/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /resolver=FUN_10109b3dc/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /table=cross-build-reference/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /current=matched-current-table-candidate/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /callback=0x123456/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /class=constant-scalar-store/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /constant=2/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /input=candidate-key/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /input=literal-or-null/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /resolution=current-table-callback-matched/);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /resolution=likely-null-literal/);
});

test("buildPfxResourceManifest derives conservative area shape profiles from resolved emitter size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-shape-profile-"));
  const pfxPath = path.join(tempDir, "AreaShapeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaShapeProfile/AreaShapeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeBinaryVersionAudit: {
        summary: {
          entries: 2,
          crossBuildReferences: 2,
        },
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x40000000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x123456",
      resolverCurrentCallbackSemanticClass: "constant-scalar-store",
      resolverCurrentCallbackConstantValue: 2,
    },
    renderSizeScalar: 2,
    renderSizeSource: "current-callback-constant",
  });
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.deepEqual(manifest.summary.bySurfaceShapeEvidenceClass, {
    "emitter-size-callback": 1,
  });
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /shape=emitter-size-callback/);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=2/);
});

test("buildPfxResourceManifest accepts explicit large size callback constants for area shapes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-large-constant-size-"));
  const pfxPath = path.join(tempDir, "AreaLargeConstantSize.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaLargeConstantSize/AreaLargeConstantSize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x41a00000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x123456",
      resolverCurrentCallbackSemanticClass: "constant-scalar-store",
      resolverCurrentCallbackConstantValue: 20,
    },
    renderSizeScalar: 20,
    renderSizeSource: "current-callback-large-constant",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=20/);
});

test("buildPfxResourceManifest accepts explicit current-build size constants up to 64 for area shapes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-current-build-size-64-"));
  const pfxPath = path.join(tempDir, "AreaCurrentBuildSize64.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaCurrentBuildSize64/AreaCurrentBuildSize64.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x42480000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x123456",
      resolverCurrentCallbackSemanticClass: "constant-scalar-store",
      resolverCurrentCallbackConstantValue: 50,
    },
    renderSizeScalar: 50,
    renderSizeSource: "current-callback-large-constant",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area shape profiles from native child initial size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-child-initial-size-"));
  const pfxPath = path.join(tempDir, "AreaChildInitialSize.pfx");
  const recordStart = 0x19;
  const surfaceStart = recordStart + 0x27 - 16;
  const childStart = recordStart + 0xe4;
  const buffer = Buffer.alloc(recordStart + 0xe4 + 0x7a);
  writeNativePfxSurfaceRecord(buffer, recordStart, 4, { pathMarkerByte: 0, childCount: 1 });
  Buffer.from([0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]).copy(buffer, surfaceStart);
  buffer[childStart + 0x18] = 2;
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, childStart + 0x39);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaChildInitialSize/AreaChildInitialSize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeBinaryVersionAudit: {
        summary: {
          entries: 2,
          crossBuildReferences: 2,
        },
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x40000000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-initial-size-callback",
    initialSizeCallback: {
      relativeOffset: 57,
      runtimeOffset: "0x70",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "assign-initial-size",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x123456",
      resolverCurrentCallbackSemanticClass: "constant-scalar-store",
      resolverCurrentCallbackConstantValue: 2,
    },
    renderSizeScalar: 2,
    renderSizeSource: "current-callback-constant",
  });
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.deepEqual(manifest.summary.bySurfaceShapeEvidenceClass, {
    "emitter-initial-size-callback": 1,
  });
});

test("buildPfxResourceManifest prefers renderable child initial size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-child-renderable-initial-size-"));
  const pfxPath = path.join(tempDir, "AreaChildRenderableInitialSize.pfx");
  const recordStart = 0x19;
  const surfaceStart = recordStart + 0x27 - 16;
  const childStart = recordStart + 0xe4;
  const childLength = 0x7a;
  const buffer = Buffer.alloc(recordStart + 0xe4 + childLength * 2);
  writeNativePfxSurfaceRecord(buffer, recordStart, 4, { pathMarkerByte: 0, childCount: 2 });
  Buffer.from([0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]).copy(buffer, surfaceStart);
  buffer[childStart + 0x18] = 2;
  buffer.writeBigUInt64LE(0x1111111111111111n, childStart + 0x39);
  buffer[childStart + childLength + 0x18] = 2;
  buffer.writeBigUInt64LE(0x2222222222222222n, childStart + childLength + 0x39);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaChildRenderableInitialSize/AreaChildRenderableInitialSize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeBinaryVersionAudit: {
        summary: {
          entries: 2,
          crossBuildReferences: 2,
        },
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x1111111111111111",
                callback: "0x111111",
              },
              {
                key: "0x2222222222222222",
                callback: "0x222222",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x111111",
            semanticClass: "constant-zero-scalar-store",
            outputStore: "zero-to-param2-4",
          },
          {
            callbackAddress: "0x222222",
            semanticClass: "computed-callback",
            outputStore: "source-packed64-first-component-to-param2",
            firstComponentBits: "0x40c66666",
            firstComponentValue: 6.2,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-initial-size-callback",
    initialSizeCallback: {
      relativeOffset: 57,
      runtimeOffset: "0x70",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "assign-initial-size",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x222222",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackFirstComponentValue: 6.2,
    },
    renderSizeScalar: 6.2,
    renderSizeSource: "current-callback-first-component",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from single safe packed size literals", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-packed-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaPackedSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x40000000deadbeefn, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaPackedSizeProfile/AreaPackedSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "likely-packed-literal",
      resolverPackedLiteralFloatCandidates: [{ byteOffset: 4, value: 2, source: "float32le-window" }],
    },
    renderSizeScalar: 2,
    renderSizeSource: "packed-literal-float-window",
  });
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=2/);
});

test("buildPfxResourceManifest derives large area render size from single packed size literals on explicit size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-large-packed-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaLargePackedSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x41ea8000deadbeefn, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaLargePackedSizeProfile/AreaLargePackedSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "likely-packed-literal",
      resolverPackedLiteralFloatCandidates: [{ byteOffset: 4, value: 29.3125, source: "float32le-window" }],
    },
    renderSizeScalar: 29.3125,
    renderSizeSource: "packed-literal-float-window",
  });
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives very large area render size from single packed size literals on explicit size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-very-large-packed-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaVeryLargePackedSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x42ad8866deadbeefn, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaVeryLargePackedSizeProfile/AreaVeryLargePackedSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, 86.7664);
  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeSource, "packed-literal-very-large-float-window");
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest reuses unique same-surface variant size evidence for area shapes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-variant-size-profile-"));
  const basePfxPath = path.join(tempDir, "Hero066_DEF_A_Slash.pfx");
  const skinPfxPath = path.join(tempDir, "Hero066_S3_A_Slash.pfx");
  const baseBuffer = Buffer.alloc(48 + 350);
  const skinBuffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(baseBuffer, 48, 5, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  writePfxSurfaceRecord(skinBuffer, 48, 5, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  baseBuffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xcc);
  skinBuffer.writeBigUInt64LE(0x28e0b8feff12e945n, 48 + 0xcc);
  fs.writeFileSync(basePfxPath, baseBuffer);
  fs.writeFileSync(skinPfxPath, skinBuffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Hero066/Default/Hero066_DEF_A_Slash/Hero066_DEF_A_Slash.pfx",
        hash: "HASH_BASE",
        linkedPath: basePfxPath,
      },
      {
        relativePath: "Effects/Hero066/S3/Hero066_S3_A_Slash/Hero066_S3_A_Slash.pfx",
        hash: "HASH_SKIN",
        linkedPath: skinPfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x9c5a6b249ef06560",
                callback: "0x123456",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x123456",
            semanticClass: "constant-scalar-store",
            outputStore: "w8-to-x1",
            immediateBits: "0x3f000000",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const skinItem = manifest.items.find((item) => item.relativePath.includes("Hero066_S3_A_Slash"));
  assert.equal(skinItem.surfaceRecords[0].shapeProfile.renderSizeScalar, 0.5);
  assert.equal(skinItem.surfaceRecords[0].shapeProfile.renderSizeSource, "variant-sibling-surface-size");
  assert.equal(
    skinItem.surfaceRecords[0].shapeProfile.renderSizeEvidencePath,
    "Effects/Hero066/Default/Hero066_DEF_A_Slash/Hero066_DEF_A_Slash.pfx",
  );
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 2);
  assert.match(reportRowsForManifest(manifest).find((row) => row.relativePath.includes("Hero066_S3_A_Slash")).surfaceShapeProfiles, /renderSize=0.5/);
});

test("buildPfxResourceManifest preserves tiny packed size literals on explicit size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-tiny-packed-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaTinyPackedSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x3e000000deadbeefn, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaTinyPackedSizeProfile/AreaTinyPackedSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "likely-packed-literal",
      resolverPackedLiteralFloatCandidates: [{ byteOffset: 4, value: 0.125, source: "float32le-window" }],
    },
    renderSizeScalar: 0.125,
    renderSizeSource: "packed-literal-tiny-float-window",
  });
  assert.equal(manifest.summary.surfaceShapeProfileRows, 1);
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from safe callback random ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaRandomSizeProfile/AreaRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 1.1641532e-10,
            randomBase: 1,
            randomMinValue: 1,
            randomMaxValue: 1.25,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackRandomMinValue: 1,
      resolverCurrentCallbackRandomMaxValue: 1.25,
    },
    renderSizeScalar: 1,
    renderSizeSource: "current-callback-random-range-min",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=1/);
});

test("buildPfxResourceManifest derives area render size from safe random range max when the min is tiny", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-random-max-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaRandomMaxSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaRandomMaxSizeProfile/AreaRandomMaxSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 1.8626451e-10,
            randomBase: 0.1,
            randomMinValue: 0.1,
            randomMaxValue: 0.5,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackRandomMinValue: 0.1,
      resolverCurrentCallbackRandomMaxValue: 0.5,
    },
    renderSizeScalar: 0.5,
    renderSizeSource: "current-callback-random-range-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=0.5/);
});

test("buildPfxResourceManifest preserves tiny area size random ranges from explicit size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-tiny-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaTinyRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaTinyRandomSizeProfile/AreaTinyRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 1.8626451e-10,
            randomBase: 0.05,
            randomMinValue: 0.05,
            randomMaxValue: 0.2,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackRandomMinValue: 0.05,
      resolverCurrentCallbackRandomMaxValue: 0.2,
    },
    renderSizeScalar: 0.2,
    renderSizeSource: "current-callback-tiny-random-range-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=0.2/);
});

test("buildPfxResourceManifest derives large area render size from positive random range min", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-large-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaLargeRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaLargeRandomSizeProfile/AreaLargeRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 4.6566129e-9,
            randomBase: 6,
            randomMinValue: 6,
            randomMaxValue: 16,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackRandomMinValue: 6,
      resolverCurrentCallbackRandomMaxValue: 16,
    },
    renderSizeScalar: 6,
    renderSizeSource: "current-callback-random-range-large-min",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=6/);
});

test("buildPfxResourceManifest derives area render size from large assign-initial-size random range max", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-large-initial-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaLargeInitialRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaLargeInitialRandomSizeProfile/AreaLargeInitialRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "initialSizeCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "initialSizeCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "assign-initial-size",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 1.8626452e-8,
            randomBase: 0,
            randomMinValue: 0,
            randomMaxValue: 40,
          },
        ],
      },
    },
    "2026-06-30T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, 40);
  assert.equal(
    manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeSource,
    "current-callback-initial-random-range-large-max",
  );
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from signed size random ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-signed-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaSignedRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaSignedRandomSizeProfile/AreaSignedRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "initialSizeCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "initialSizeCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 2,
            updateOperation: "assign-initial-size",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 2.3283064e-9,
            randomBase: -5,
            randomMinValue: -5,
            randomMaxValue: 5,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "assign-initial-size",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackRandomMinValue: -5,
      resolverCurrentCallbackRandomMaxValue: 5,
    },
    renderSizeScalar: 5,
    renderSizeSource: "current-callback-signed-random-range-abs-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from computed callback first component constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-first-component-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFirstComponentSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFirstComponentSizeProfile/AreaFirstComponentSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "source-first-component-constant-to-param3",
            firstComponentBits: "0x3fc00000",
            firstComponentValue: 1.5,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackFirstComponentValue: 1.5,
    },
    renderSizeScalar: 1.5,
    renderSizeSource: "current-callback-first-component",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=1.5/);
});

test("buildPfxResourceManifest derives area render size from fallback first component constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-first-component-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackFirstComponentSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackFirstComponentSizeProfile/AreaFallbackFirstComponentSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x120819040",
            sampleKeys: ["0x8190400011223344"],
            semanticClass: "computed-callback",
            outputStore: "source-neon-fmov-first-component-to-param3",
            firstComponentBits: "0x40000000",
            firstComponentValue: 2,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverFallbackCallbackAddress: "0x120819040",
      resolverFallbackCallbackSemanticClass: "computed-callback",
      resolverFallbackCallbackFirstComponentValue: 2,
    },
    renderSizeScalar: 2,
    renderSizeSource: "fallback-callback-first-component",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=2/);
});

test("buildPfxResourceManifest derives area render size from pattern16 callback constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-pattern16-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaPattern16SizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaPattern16SizeProfile/AreaPattern16SizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "constant-pattern16-store",
            outputStore: "pattern16-to-param2",
            pattern16Symbol: "DAT_01af9490",
            pattern16SourceAddress: "0x1af9490",
            pattern16FloatValues: [2.5, 2.5, 2.5, 2.5],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "constant-pattern16-store",
      resolverCurrentCallbackPattern16SourceAddress: "0x1af9490",
      resolverCurrentCallbackPattern16FloatValues: [2.5, 2.5, 2.5, 2.5],
    },
    renderSizeScalar: 2.5,
    renderSizeSource: "current-callback-pattern16-float",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=2.5/);
});

test("buildPfxResourceManifest preserves encrypted pattern16 status without promoting area render size", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-encrypted-pattern16-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaEncryptedPattern16SizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaEncryptedPattern16SizeProfile/AreaEncryptedPattern16SizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "constant-pattern16-store",
            outputStore: "pattern16-to-param2",
            pattern16Symbol: "DAT_101181a60",
            pattern16SourceAddress: "0x101181a60",
            pattern16ReadStatus: "encrypted-range",
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, undefined);
  assert.equal(
    manifest.items[0].surfaceRecords[0].shapeProfile.sizeCallback.resolverCurrentCallbackPattern16ReadStatus,
    "encrypted-range",
  );
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 0);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /pattern16Read=encrypted-range/);
});

test("buildPfxResourceManifest derives area render size from callback curve table ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-curve-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaCurveSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaCurveSizeProfile/AreaCurveSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "curve-table-range-to-param3",
            curveTableSymbol: "DAT_01af9490",
            curveTableSourceAddress: "0x1af9490",
            curveTableSampleCount: 64,
            curveTableMultiplier: 250,
            curveTableMinValue: 0,
            curveTableMaxValue: 1.984127,
            curveMinValue: 0,
            curveMaxValue: 496.0318,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackOutputStore: "curve-table-range-to-param3",
      resolverCurrentCallbackCurveTableSourceAddress: "0x1af9490",
      resolverCurrentCallbackCurveTableSampleCount: 64,
      resolverCurrentCallbackCurveTableMultiplier: 250,
      resolverCurrentCallbackCurveMinValue: 0,
      resolverCurrentCallbackCurveMaxValue: 496.0318,
    },
    renderSizeScalar: 496.0318,
    renderSizeSource: "current-callback-curve-range-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=496.0318/);
});

test("buildPfxResourceManifest preserves encrypted curve table status without promoting area render size", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-encrypted-curve-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaEncryptedCurveSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaEncryptedCurveSizeProfile/AreaEncryptedCurveSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "curve-table-range-to-param3",
            curveTableSourceAddress: "0x10119c900",
            curveTableReadStatus: "encrypted-range",
            curveTableSampleCount: 64,
            curveTableMultiplier: 2,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, undefined);
  assert.equal(
    manifest.items[0].surfaceRecords[0].shapeProfile.sizeCallback.resolverCurrentCallbackCurveTableReadStatus,
    "encrypted-range",
  );
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 0);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /curveTableRead=encrypted-range/);
});

test("buildPfxResourceManifest does not derive size from curve output components outside the size callback arity", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-curve-component-mismatch-"));
  const pfxPath = path.join(tempDir, "AreaCurveComponentMismatch.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaCurveComponentMismatch/AreaCurveComponentMismatch.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "curve-table-range-to-param3[3]",
            curveOutputComponentIndex: 3,
            curveTableSourceAddress: "0x1af9490",
            curveTableSampleCount: 64,
            curveTableMinValue: 0,
            curveTableMaxValue: 1,
            curveMinValue: 0,
            curveMaxValue: 1,
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackOutputStore: "curve-table-range-to-param3[3]",
      resolverCurrentCallbackCurveOutputComponentIndex: 3,
      resolverCurrentCallbackCurveTableSourceAddress: "0x1af9490",
      resolverCurrentCallbackCurveTableSampleCount: 64,
      resolverCurrentCallbackCurveMinValue: 0,
      resolverCurrentCallbackCurveMaxValue: 1,
    },
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 0);
  const surfaceShapeSummary = reportRowsForManifest(manifest)[0].surfaceShapeProfiles;
  assert.match(surfaceShapeSummary, /components=1/);
  assert.match(surfaceShapeSummary, /currentStore=curve-table-range-to-param3\[3\]/);
});

test("buildPfxResourceManifest derives conservative area render size from callback curve boundary values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-curve-boundary-size-"));
  const pfxPath = path.join(tempDir, "AreaCurveBoundarySize.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaCurveBoundarySize/AreaCurveBoundarySize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "curve-table-range-to-param3",
            curveOutputComponentIndex: 0,
            curveTableSourceAddress: "0x101208590",
            curveTableSampleCount: 64,
            curveTableMultiplier: 12,
            curveBoundaryValues: [0, 1],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "computed-callback",
      resolverCurrentCallbackOutputStore: "curve-table-range-to-param3",
      resolverCurrentCallbackCurveTableSourceAddress: "0x101208590",
      resolverCurrentCallbackCurveTableSampleCount: 64,
      resolverCurrentCallbackCurveTableMultiplier: 12,
      resolverCurrentCallbackCurveOutputComponentIndex: 0,
      resolverCurrentCallbackCurveBoundaryValues: [0, 1],
    },
    renderSizeScalar: 12,
    renderSizeSource: "current-callback-curve-boundary-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=12/);
});

test("buildPfxResourceManifest derives area render size from signed size curve boundary values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-signed-curve-boundary-size-"));
  const pfxPath = path.join(tempDir, "AreaSignedCurveBoundarySize.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaSignedCurveBoundarySize/AreaSignedCurveBoundarySize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "computed-callback",
            outputStore: "curve-table-range-to-param3",
            curveOutputComponentIndex: 0,
            curveTableSourceAddress: "0x101208590",
            curveTableSampleCount: 64,
            curveTableMultiplier: 10,
            curveBoundaryValues: [-0.4, 1],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, 10);
  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeSource, "current-callback-curve-boundary-max");
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest accepts large assign-initial-size callback vectors for area shapes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-large-vector-size-"));
  const pfxPath = path.join(tempDir, "AreaLargeVectorSize.pfx");
  const recordStart = 0x19;
  const surfaceStart = recordStart + 0x27 - 16;
  const childStart = recordStart + 0xe4;
  const buffer = Buffer.alloc(recordStart + 0xe4 + 0x7a);
  writeNativePfxSurfaceRecord(buffer, recordStart, 4, { pathMarkerByte: 0, childCount: 1 });
  Buffer.from([0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0]).copy(buffer, surfaceStart);
  buffer[childStart + 0x18] = 2;
  buffer.writeBigUInt64LE(0x8190400011223344n, childStart + 0x39);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaLargeVectorSize/AreaLargeVectorSize.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-child-emitter-record", pfxOffset: "0x39", runtimeOffset: "0x70", semantic: "initialSizeCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x70",
            semantic: "initialSizeCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 2,
            updateOperation: "assign-initial-size",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "constant-vector2-load-store",
            vectorValues: [15, 15],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeScalar, 15);
  assert.equal(manifest.items[0].surfaceRecords[0].shapeProfile.renderSizeSource, "current-callback-large-vector");
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from fallback same-key callback constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackSizeProfile/AreaFallbackSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "helper-call-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x12819040",
            semanticClass: "constant-scalar-store",
            outputStore: "source-immediate-to-param2",
            immediateBits: "0x40000000",
            sampleKeys: ["0x8190400011223344"],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "helper-call-callback",
      resolverFallbackCallbackAddress: "0x12819040",
      resolverFallbackCallbackSemanticClass: "constant-scalar-store",
      resolverFallbackCallbackConstantValue: 2,
      resolverFallbackCallbackConstantSource: "immediate-bits-float32",
    },
    renderSizeScalar: 2,
    renderSizeSource: "fallback-callback-constant",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=2/);
});

test("buildPfxResourceManifest derives area render size from fallback same-key vector constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-vector-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackVectorSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackVectorSizeProfile/AreaFallbackVectorSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "helper-call-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x12819040",
            semanticClass: "constant-vector4-load-store",
            outputStore: "source-neon-fmov-to-param2",
            vectorValues: [1, 1, 1, 1],
            sampleKeys: ["0x8190400011223344"],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "helper-call-callback",
      resolverFallbackCallbackAddress: "0x12819040",
      resolverFallbackCallbackSemanticClass: "constant-vector4-load-store",
      resolverFallbackCallbackVectorValue: [1, 1, 1, 1],
      resolverFallbackCallbackConstantSource: "literal-vector4-load",
    },
    renderSizeScalar: 1,
    renderSizeSource: "fallback-callback-vector",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].surfaceShapeProfiles, /renderSize=1/);
});

test("buildPfxResourceManifest derives area render size from fallback vector2 constants", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-vector2-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackVector2SizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackVector2SizeProfile/AreaFallbackVector2SizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 2,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "helper-call-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x12819040",
            semanticClass: "constant-vector2-load-store",
            outputStore: "d0-to-x1",
            vectorValues: [1.5, 1.5],
            sampleKeys: ["0x8190400011223344"],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "helper-call-callback",
      resolverFallbackCallbackAddress: "0x12819040",
      resolverFallbackCallbackSemanticClass: "constant-vector2-load-store",
      resolverFallbackCallbackVectorValue: [1.5, 1.5],
      resolverFallbackCallbackConstantSource: "literal-vector2-load",
    },
    renderSizeScalar: 1.5,
    renderSizeSource: "fallback-callback-vector",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from fallback random ranges", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-random-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackRandomSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackRandomSizeProfile/AreaFallbackRandomSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 2,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "helper-call-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x12819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-vector2-to-param2",
            randomScale: 1.8626452e-10,
            randomBase: 0.1,
            randomMinValue: 0.1,
            randomMaxValue: 0.5,
            sampleKeys: ["0x8190400011223344"],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "helper-call-callback",
      resolverFallbackCallbackAddress: "0x12819040",
      resolverFallbackCallbackSemanticClass: "computed-callback",
      resolverFallbackCallbackRandomMinValue: 0.1,
      resolverFallbackCallbackRandomMaxValue: 0.5,
    },
    renderSizeScalar: 0.5,
    renderSizeSource: "fallback-callback-random-range-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest derives area render size from fallback random ranges up to five for explicit size callbacks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-area-fallback-random-five-size-profile-"));
  const pfxPath = path.join(tempDir, "AreaFallbackRandomFiveSizeProfile.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8190400011223344n, 48 + 0xcc);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/AreaFallbackRandomFiveSizeProfile/AreaFallbackRandomFiveSizeProfile.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xcc", runtimeOffset: "0x270", semantic: "sizeDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x270",
            semantic: "sizeDeltaCallback",
            targetArrayOffset: "0x30000",
            targetArraySemantic: "size",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-size-clamped",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8190400011223344",
                callback: "0x100819040",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x100819040",
            semanticClass: "helper-call-callback",
          },
        ],
      },
      nativeParticleFallbackCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x12819040",
            semanticClass: "computed-callback",
            outputStore: "random-affine-to-param2",
            randomScale: 1.8626452e-9,
            randomBase: 0,
            randomMinValue: 0,
            randomMaxValue: 5,
            sampleKeys: ["0x8190400011223344"],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].shapeProfile, {
    evidenceClass: "emitter-size-callback",
    sizeCallback: {
      relativeOffset: 204,
      runtimeOffset: "0x270",
      targetArrayOffset: "0x30000",
      targetArraySemantic: "size",
      updateOperation: "add-delta-to-size-clamped",
      resolverResolutionStatus: "current-table-callback-matched",
      resolverCurrentCallbackAddress: "0x100819040",
      resolverCurrentCallbackSemanticClass: "helper-call-callback",
      resolverFallbackCallbackAddress: "0x12819040",
      resolverFallbackCallbackSemanticClass: "computed-callback",
      resolverFallbackCallbackRandomMinValue: 0,
      resolverFallbackCallbackRandomMaxValue: 5,
    },
    renderSizeScalar: 5,
    renderSizeSource: "fallback-callback-random-range-max",
  });
  assert.equal(manifest.summary.surfaceShapeRenderableRows, 1);
});

test("buildPfxResourceManifest preserves native emitter zero delay as immediate lifetime evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-zero-delay-"));
  const pfxPath = path.join(tempDir, "NativeEmitterZeroDelay.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeFloatLE(0, 48 + 0xac);
  buffer.writeFloatLE(0.5, 48 + 0xb0);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitterZeroDelay/NativeEmitterZeroDelay.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xac", runtimeOffset: "0x24c", semantic: "delaySeconds" },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xb0", runtimeOffset: "0x250", semantic: "activeDurationSeconds" },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].emitterRuntimeHints, {
    delaySeconds: 0,
    durationSeconds: 0.5,
    timingSourceOffsets: {
      delaySeconds: 172,
      durationSeconds: 176,
    },
  });
});

test("buildPfxResourceManifest preserves current callback vector constants on emitter slots", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-vector-"));
  const pfxPath = path.join(tempDir, "NativeEmitterVector.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x8ed974b35dc8c850n, 48 + 0xc4);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitterVector/NativeEmitterVector.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xc4", runtimeOffset: "0x268", semantic: "positionVectorCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x268",
            semantic: "positionVectorCallback",
            targetArrayOffset: "0x0",
            targetArraySemantic: "position",
            callbackOutputComponents: 3,
            updateOperation: "add-delta-to-position",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        items: [
          {
            matchedEntries: [
              {
                key: "0x8ed974b35dc8c850",
                callback: "0x16ff0d0",
              },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          {
            callbackAddress: "0x16ff0d0",
            semanticClass: "constant-vector4-load-store",
            outputStore: "q0-to-x1",
            vectorSourceAddress: "0x1af9490",
            vectorValues: [1, 0, 0, 1],
          },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots[0], {
    name: "positionVectorCallback",
    relativeOffset: 196,
    value: "0x8ed974b35dc8c850",
    runtimeOffset: "0x268",
    targetArrayOffset: "0x0",
    targetArraySemantic: "position",
    callbackOutputComponents: 3,
    updateOperation: "add-delta-to-position",
    resolverInputKind: "candidate-key",
    resolverInputValue: "0x8ed974b35dc8c850",
    resolverKey: "0x8ed974b35dc8c850",
    resolverFunction: "FUN_10109b3dc",
    resolverTableBase: "DAT_1014a8918",
    resolverPointerBase: "PTR_FUN_1014a8920",
    resolverCurrentBuildStatus: "matched-current-table-candidate",
    resolverCurrentCallbackAddress: "0x16ff0d0",
    resolverCurrentCallbackSemanticClass: "constant-vector4-load-store",
    resolverCurrentCallbackOutputStore: "q0-to-x1",
    resolverCurrentCallbackVectorSourceAddress: "0x1af9490",
    resolverCurrentCallbackVectorValue: [1, 0, 0, 1],
    resolverCurrentCallbackConstantSource: "literal-vector4-load",
    resolverResolutionStatus: "current-table-callback-matched",
  });
  assert.equal(manifest.summary.pfxEmitterCallbackCurrentVectorRows, 1);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackCurrentVectorTarget, {
    position: 1,
  });
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /vector=1\\|0\\|0\\|1/);
});

test("buildPfxResourceManifest separates low-entropy packed literals from unresolved resolver keys", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-packed-literal-"));
  const pfxPath = path.join(tempDir, "NativeEmitterPackedLiteral.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0x42b4000000n, 48 + 0xd4);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitterPackedLiteral/NativeEmitterPackedLiteral.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xd4", runtimeOffset: "0x278", semantic: "rotationDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x278",
            semantic: "rotationDeltaCallback",
            targetArrayOffset: "0x40000",
            targetArraySemantic: "rotation",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-rotation",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const [slot] = manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots;
  assert.equal(slot.resolverInputKind, "packed-literal");
  assert.equal(slot.resolverResolutionStatus, "likely-packed-literal");
  assert.equal(slot.resolverInputValue, "0x42b4000000");
  assert.equal(slot.resolverPackedLiteralNonZeroBytes, 2);
  assert.deepEqual(slot.resolverPackedLiteralBytes, ["0x00", "0x00", "0x00", "0xb4", "0x42", "0x00", "0x00", "0x00"]);
  assert.deepEqual(slot.resolverPackedLiteralFloatCandidates, [
    { byteOffset: 1, value: 90, source: "float32le-window" },
  ]);
  assert.equal(slot.resolverKey, undefined);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolutionStatus, {
    "likely-packed-literal": 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackInputKind, {
    "packed-literal": 1,
  });
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralRows, 1);
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralFloatCandidateRows, 1);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackPackedLiteralTarget, {
    rotation: 1,
  });
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackPackedLiteralFloatCandidateTarget, {
    rotation: 1,
  });
  assert.match(
    reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles,
    /packedBytes=0x00\|0x00\|0x00\|0xb4\|0x42\|0x00\|0x00\|0x00/,
  );
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /packedFloat@1=90/);
});

test("buildPfxResourceManifest recognizes float-window packed literals with more non-zero bytes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-float-window-packed-"));
  const pfxPath = path.join(tempDir, "NativeEmitterFloatWindowPacked.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0xb400003e4ccccd00n, 48 + 0xd4);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitterFloatWindowPacked/NativeEmitterFloatWindowPacked.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xd4", runtimeOffset: "0x278", semantic: "rotationDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x278",
            semantic: "rotationDeltaCallback",
            targetArrayOffset: "0x40000",
            targetArraySemantic: "rotation",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-rotation",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: { items: [] },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const [slot] = manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots;
  assert.equal(slot.resolverInputKind, "packed-literal");
  assert.equal(slot.resolverResolutionStatus, "likely-packed-literal");
  assert.equal(slot.resolverPackedLiteralNonZeroBytes, 5);
  assert.deepEqual(slot.resolverPackedLiteralFloatCandidates, [
    { byteOffset: 1, value: 0.2, source: "float32le-window" },
  ]);
  assert.equal(slot.resolverKey, undefined);
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralRows, 1);
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralFloatCandidateRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /packedFloat@1=0.2/);
});

test("buildPfxResourceManifest recognizes compact color literals when the current callback table proves a miss", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-emitter-compact-color-packed-"));
  const pfxPath = path.join(tempDir, "NativeEmitterCompactColorPacked.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(buffer, 48, 4, [0, 7, 4, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {}, { pathPrefix: "" });
  buffer.writeBigUInt64LE(0xff031e84cd0a00n, 48 + 0xd8);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeEmitterCompactColorPacked/NativeEmitterCompactColorPacked.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xd8", runtimeOffset: "0x2b0", semantic: "colorCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x2b0",
            semantic: "colorCallback",
            targetArrayOffset: "0x58000",
            targetArraySemantic: "color",
            callbackOutputComponents: 4,
            updateOperation: "write-color",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        candidateKeyMisses: ["0xff031e84cd0a00"],
        items: [],
      },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const [slot] = manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots;
  assert.equal(slot.resolverInputKind, "packed-literal");
  assert.equal(slot.resolverResolutionStatus, "likely-packed-literal");
  assert.equal(slot.resolverCurrentBuildStatus, "missing-current-table-candidate");
  assert.deepEqual(slot.resolverPackedLiteralColorCandidates, [
    { byteOffset: 1, rgbHex: "#0acd84", source: "byte-color-window" },
    { byteOffset: 4, rgbHex: "#1e03ff", source: "byte-color-window" },
  ]);
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralRows, 1);
  assert.match(reportRowsForManifest(manifest)[0].pfxEmitterRuntimeProfiles, /packedColor@1=#0acd84/);
});

test("buildPfxResourceManifest does not attach callback resolver evidence to legacy question-prefixed surfaces", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-question-prefixed-surface-"));
  const pfxPath = path.join(tempDir, "QuestionPrefixedSurface.pfx");
  const buffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(
    buffer,
    48,
    4,
    [0, 1, 0, 2, 1, 1, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0],
    {},
    { pathPrefix: "?" },
  );
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, 48 + 0xb4);
  buffer.writeBigUInt64LE(0x42b4000000n, 48 + 0xd4);
  buffer.writeBigUInt64LE(0x42n, 48 + 0xd8);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/QuestionPrefixedSurface/QuestionPrefixedSurface.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xb4", runtimeOffset: "0x258", semantic: "velocityDampingCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x258",
            semantic: "velocityDampingCallback",
            targetArrayOffset: "0x18000",
            targetArraySemantic: "velocity",
            callbackOutputComponents: 1,
            updateOperation: "multiply-velocity-damping",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xd4", runtimeOffset: "0x278", semantic: "rotationDeltaCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x278",
            semantic: "rotationDeltaCallback",
            targetArrayOffset: "0x40000",
            targetArraySemantic: "rotation",
            callbackOutputComponents: 1,
            updateOperation: "add-delta-to-rotation",
          },
          { recordKind: "pfx-emitter-record", pfxOffset: "0xd8", runtimeOffset: "0x2b0", semantic: "colorCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x2b0",
            semantic: "colorCallback",
            targetArrayOffset: "0x58000",
            targetArraySemantic: "color",
            callbackOutputComponents: 4,
            updateOperation: "write-color",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        candidateKeyMisses: ["0x9c5a6b249ef06560"],
        items: [],
      },
      nativeParticleCallbackSemantics: { items: [] },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const slots = manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots;
  const velocitySlot = slots.find((slot) => slot.name === "velocityDampingCallback");
  const rotationSlot = slots.find((slot) => slot.name === "rotationDeltaCallback");
  const colorSlot = slots.find((slot) => slot.name === "colorCallback");
  assert.equal(velocitySlot.value, "0x9c5a6b249ef06560");
  assert.equal(velocitySlot.callbackLayoutEvidence, "question-prefixed-surface-path");
  assert.equal(velocitySlot.resolverFunction, undefined);
  assert.equal(velocitySlot.resolverInputKind, undefined);
  assert.equal(velocitySlot.resolverResolutionStatus, undefined);
  assert.equal(velocitySlot.targetArraySemantic, undefined);
  assert.equal(rotationSlot.value, "0x42b4000000");
  assert.equal(rotationSlot.callbackLayoutEvidence, "question-prefixed-surface-path");
  assert.equal(rotationSlot.resolverPackedLiteralBytes, undefined);
  assert.equal(rotationSlot.resolverPackedLiteralFloatCandidates, undefined);
  assert.equal(colorSlot.value, "0x42");
  assert.equal(colorSlot.callbackLayoutEvidence, "question-prefixed-surface-path");
  assert.equal(colorSlot.resolverInputKind, undefined);
  assert.equal(colorSlot.resolverResolutionStatus, undefined);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolutionStatus, {});
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackInputKind, {});
  assert.equal(manifest.summary.pfxEmitterCallbackPackedLiteralFloatCandidateRows, 0);
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackLayoutEvidence, {
    "question-prefixed-surface-path": 3,
  });
});

test("buildPfxResourceManifest keeps callback resolver evidence for question-marked native emitter records", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-question-marked-surface-"));
  const pfxPath = path.join(tempDir, "NativeQuestionMarkedSurface.pfx");
  const recordStart = 0x19;
  const buffer = Buffer.alloc(recordStart + 0xe4 + 0x7a);
  writeNativePfxSurfaceRecord(buffer, recordStart, 4, { pathMarkerByte: 0x3f });
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, recordStart + 0xb4);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeQuestionMarkedSurface/NativeQuestionMarkedSurface.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          { recordKind: "pfx-emitter-record", pfxOffset: "0xb4", runtimeOffset: "0x258", semantic: "velocityDampingCallback" },
          {
            recordKind: "particle-callback-update",
            runtimeOffset: "0x258",
            semantic: "velocityDampingCallback",
            targetArrayOffset: "0x18000",
            targetArraySemantic: "velocity",
            callbackOutputComponents: 1,
            updateOperation: "multiply-velocity-damping",
          },
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        candidateKeyMisses: [],
        items: [
          {
            section: "__DATA,__const",
            virtualAddress: 0x1014a8918,
            matchedEntries: [{ entryIndex: 7, key: "0x9c5a6b249ef06560", callback: "0x1009be064" }],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [{ callbackAddress: "0x1009be064", semanticClass: "computed-callback" }],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const [slot] = manifest.items[0].surfaceRecords[0].emitterRuntimeProfile.semanticSlots;
  assert.equal(manifest.items[0].surfaceRecords[0].recordLayout, "native-emitter-record");
  assert.equal(manifest.items[0].surfaceRecords[0].pathSlotPrefix, "?");
  assert.equal(slot.value, "0x9c5a6b249ef06560");
  assert.equal(slot.callbackLayoutEvidence, undefined);
  assert.equal(slot.targetArraySemantic, "velocity");
  assert.equal(slot.resolverFunction, "FUN_10109b3dc");
  assert.equal(slot.resolverInputKind, "candidate-key");
  assert.equal(slot.resolverResolutionStatus, "current-table-callback-matched");
  assert.equal(slot.resolverCurrentCallbackAddress, "0x1009be064");
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackLayoutEvidence, {});
  assert.deepEqual(manifest.summary.byPfxEmitterCallbackResolutionStatus, {
    "current-table-callback-matched": 1,
  });
});

test("buildPfxResourceManifest exposes native child emitter callback resolver evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-native-child-emitter-"));
  const pfxPath = path.join(tempDir, "NativeChildEmitter.pfx");
  const recordStart = 0x19;
  const childStart = recordStart + 0xe4;
  const buffer = Buffer.alloc(recordStart + 0xe4 + 0x7a);
  writeNativePfxSurfaceRecord(buffer, recordStart, 8, { pathMarkerByte: 0x3f, childCount: 1 });
  buffer[childStart + 0x18] = 2;
  buffer.writeBigUInt64LE(0x9c5a6b249ef06560n, childStart + 0x19);
  buffer.writeBigUInt64LE(0x3ba9b2672296726bn, childStart + 0x61);
  fs.writeFileSync(pfxPath, buffer);

  const manifest = buildPfxResourceManifest(
    [
      {
        relativePath: "Effects/Test/NativeChildEmitter/NativeChildEmitter.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
    {
      nativeParticleRuntimeSchema: {
        items: [
          {
            recordKind: "particle-callback-resolver",
            resolverFunction: "FUN_10109b3dc",
            tableBase: "DAT_1014a8918",
            pointerBase: "PTR_FUN_1014a8920",
          },
        ],
      },
      nativeParticleCallbackTableScan: {
        candidateKeyMisses: [],
        items: [
          {
            section: "__DATA,__const",
            virtualAddress: 0x1014a8918,
            matchedEntries: [
              { entryIndex: 7, key: "0x9c5a6b249ef06560", callback: "0x1009be064" },
              { entryIndex: 8, key: "0x3ba9b2672296726b", callback: "0x1009be074" },
            ],
          },
        ],
      },
      nativeParticleCallbackSemantics: {
        items: [
          { callbackAddress: "0x1009be064", semanticClass: "computed-callback" },
          { callbackAddress: "0x1009be074", semanticClass: "constant-zero-scalar-store" },
        ],
      },
    },
    "2026-06-29T00:00:00.000Z",
  );

  const [record] = manifest.items[0].surfaceRecords;
  assert.equal(record.childEmitterRecords.length, 1);
  assert.equal(record.childEmitterRecords[0].recordStart, childStart);
  assert.equal(record.childEmitterRecords[0].recordLength, 0x7a);
  assert.equal(record.childEmitterRecords[0].mode, 2);
  assert.equal(record.childEmitterRecords[0].runtimeProfile.semanticSlots.length, 2);
  assert.deepEqual(
    record.childEmitterRecords[0].runtimeProfile.semanticSlots.map((slot) => ({
      name: slot.name,
      value: slot.value,
      resolverResolutionStatus: slot.resolverResolutionStatus,
      resolverCurrentCallbackSemanticClass: slot.resolverCurrentCallbackSemanticClass,
    })),
    [
      {
        name: "childCallback0",
        value: "0x9c5a6b249ef06560",
        resolverResolutionStatus: "current-table-callback-matched",
        resolverCurrentCallbackSemanticClass: "computed-callback",
      },
      {
        name: "childCallback9",
        value: "0x3ba9b2672296726b",
        resolverResolutionStatus: "current-table-callback-matched",
        resolverCurrentCallbackSemanticClass: "constant-zero-scalar-store",
      },
    ],
  );
  assert.equal(manifest.summary.pfxChildEmitterRecordRows, 1);
  assert.equal(manifest.summary.pfxChildEmitterCallbackRows, 2);
  assert.deepEqual(manifest.summary.byPfxChildEmitterMode, { "2": 1 });
  assert.deepEqual(manifest.summary.byPfxChildEmitterCallbackResolutionStatus, {
    "current-table-callback-matched": 2,
  });
});

test("exportPfxResourceManifest writes viewer JSON plus audit reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-pfx-resource-export-"));
  const effectResourcePath = path.join(tempDir, "effect_resource_index.tsv");
  const pfxPath = path.join(tempDir, "Hero016_Spinning_Enemy.pfx");
  const effectHookManifestPath = path.join(tempDir, "effect-hooks.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");

  const pfxBuffer = Buffer.alloc(48 + 350);
  writePfxSurfaceRecord(pfxBuffer, 48, 3, [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0x3f, 0, 0, 0], {
    209: 0.2,
  });
  fs.writeFileSync(pfxPath, pfxBuffer);
  writeRows(
    effectResourcePath,
    ["category", "relativePath", "hash", "size", "magic4", "filePath", "linkedPath"],
    [
      {
        category: "effect",
        relativePath: "Effects/Hero016/Hero016_Spinning_Enemy/Hero016_Spinning_Enemy.pfx",
        hash: "HASH_PFX",
        linkedPath: pfxPath,
      },
    ],
  );
  fs.writeFileSync(
    effectHookManifestPath,
    `${JSON.stringify({
      items: [
        {
          token: "Effect_Rona_Spinning_Enemy",
          effectToken: "Effect_Rona_Spinning_Enemy",
          resourcePaths: ["Effects/Hero016/Hero016_Spinning_Enemy/Hero016_Spinning_Enemy.pfx"],
        },
      ],
    })}\n`,
  );

  const summary = exportPfxResourceManifest({ effectResourcePath, effectHookManifestPath, viewerOut, tsvOut, jsonOut });

  assert.equal(summary.rows, 1);
  assert.equal(summary.hookLinkedRows, 1);
  assert.equal(summary.surfaceRuntimeHintRows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Test\.Surface\[3\]\.shadergraph/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /surfaceRuntimeHints/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Effect_Rona_Spinning_Enemy/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.totalShadergraphRefs, 1);
});
