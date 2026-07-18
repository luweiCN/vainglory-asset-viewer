const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { engineHashHex } = require("../tools/engine_hash");
const { summarizeCapture, exportSummary } = require("../tools/current_native_material_source_program_capture_summary");

const targetManifest = {
  items: [
    {
      source: "hook-target",
      name: "dynamic-source-program-producer-entry",
      addressHex: "0xbac9d4",
      captureKind: "dynamic-producer-entry",
      reason: "capture resource list",
    },
    {
      source: "hook-target",
      name: "dynamic-source-program-entry-writer-callsite",
      addressHex: "0xbacac0",
      captureKind: "entry-writer-callsite",
      reason: "capture entry writer",
    },
    {
      source: "hook-target",
      name: "dynamic-source-program-mount-callsite",
      addressHex: "0xbacae8",
      captureKind: "mount-callsite",
      reason: "capture mount",
    },
  ],
};

function writeJsonl(records) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-source-program-capture-"));
  const inputPath = path.join(tempDir, "capture.jsonl");
  fs.writeFileSync(inputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return inputPath;
}

function writeJson(tempDir, name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function sourceKeyHashHex(value) {
  return `0x${engineHashHex(value).toLowerCase()}`;
}

test("summarizeCapture reports missing material source/program captures without renderer promotion", () => {
  const manifest = summarizeCapture({
    targetManifest,
    inputPath: path.join(os.tmpdir(), "missing-material-source-program-capture.jsonl"),
  });

  assert.equal(manifest.summary.captureImported, false);
  assert.equal(manifest.summary.captureStatus, "capture-missing");
  assert.equal(manifest.summary.targetRows, 3);
  assert.equal(manifest.summary.missingTargetRows, 3);
  assert.equal(manifest.summary.sourceProgramTableTruncatedRows, 0);
  assert.equal(manifest.summary.sourceProgramTableMissingEntryRows, 0);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, false);
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.sourceProgramType4DecoderReady, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture keeps resource-list-only captures gated", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }, { idU32: 9 }],
        },
      ],
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureImported, true);
  assert.equal(manifest.summary.captureStatus, "partial-target-coverage");
  assert.equal(manifest.summary.resourceListSnapshotEvents, 1);
  assert.equal(manifest.summary.resourceListTopRows, 1);
  assert.equal(manifest.summary.nestedIdRows, 2);
  assert.equal(manifest.summary.resourceListTruncatedRows, 0);
  assert.equal(manifest.summary.nestedResourceIdTruncatedRows, 0);
  assert.equal(manifest.summary.resourceListCaptureComplete, true);
  assert.equal(manifest.summary.entryBuilderEvents, 0);
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
});

test("summarizeCapture blocks source/program review when a hook reaches the capture event limit", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-limit",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      seen: 257,
      maxEventsPerHook: 256,
      droppedEventRowsAtLeast: 1,
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureLimitRows, 1);
  assert.equal(manifest.summary.captureLimitDroppedEventRowsAtLeast, 1);
  assert.equal(manifest.summary.captureEventLimitHit, true);
  assert.equal(manifest.summary.captureStatus, "capture-event-limit-hit");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks source/program review when resource-list capture is truncated", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: {
        resourceListCaptureLimit: 64,
        resourceListCaptureTruncated: true,
        nextNodeAfterLimit: "0x1800",
        rows: [
          {
            payload: "0x2000",
            payloadCString: "HeroPreview",
            nestedIds: {
              nestedCaptureLimit: 32,
              nestedCaptureTruncated: true,
              nextNodeAfterLimit: "0x2800",
              rows: [{ idU32: 7 }],
            },
          },
        ],
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.resourceListTruncatedRows, 1);
  assert.equal(manifest.summary.nestedResourceIdTruncatedRows, 1);
  assert.equal(manifest.summary.resourceListCaptureComplete, false);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, true);
  assert.equal(manifest.summary.captureStatus, "resource-list-truncated");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks source/program review when capture ordering fields are missing", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }, { idU32: 9 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          valueWordCount: 2,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }, { hex: "0x9" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.targetEventRows, 3);
  assert.equal(manifest.summary.targetEventRowsWithEventId, 0);
  assert.equal(manifest.summary.targetEventRowsWithThreadId, 0);
  assert.equal(manifest.summary.captureOrderingFieldsComplete, false);
  assert.equal(manifest.summary.captureStatus, "capture-ordering-fields-missing");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks source/program review when target event ids are not strictly ordered", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }, { idU32: 9 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          valueWordCount: 2,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }, { hex: "0x9" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.targetEventRows, 3);
  assert.equal(manifest.summary.targetEventRowsWithEventId, 3);
  assert.equal(manifest.summary.targetEventRowsWithThreadId, 3);
  assert.equal(manifest.summary.captureOrderingFieldsComplete, true);
  assert.equal(manifest.summary.targetEventDuplicateEventIdRows, 1);
  assert.equal(manifest.summary.targetEventNonMonotonicEventIdRows, 1);
  assert.equal(manifest.summary.captureEventIdOrderingComplete, false);
  assert.equal(manifest.summary.captureStatus, "capture-event-ordering-invalid");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture marks material source/program captures ready only after list, entry, mount, and ordering evidence", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }, { idU32: 9 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          valueWordCount: 2,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }, { hex: "0x9" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureStatus, "ready-for-full-source-program-review");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.observedHookTargets, 3);
  assert.equal(manifest.summary.targetEventRowsWithEventId, 3);
  assert.equal(manifest.summary.targetEventRowsWithThreadId, 3);
  assert.equal(manifest.summary.captureOrderingFieldsComplete, true);
  assert.equal(manifest.summary.targetEventDuplicateEventIdRows, 0);
  assert.equal(manifest.summary.targetEventNonMonotonicEventIdRows, 0);
  assert.equal(manifest.summary.captureEventIdOrderingComplete, true);
  assert.equal(manifest.summary.entryBuilderEvents, 1);
  assert.equal(manifest.summary.mountEvents, 1);
  assert.equal(manifest.summary.resourceListTruncatedRows, 0);
  assert.equal(manifest.summary.nestedResourceIdTruncatedRows, 0);
  assert.equal(manifest.summary.resourceListCaptureComplete, true);
  assert.equal(manifest.summary.sourceProgramTableDecodeEvents, 1);
  assert.equal(manifest.summary.sourceProgramTableDecodedEntryRows, 1);
  assert.equal(manifest.summary.sourceProgramTableDecodedValueWordRows, 2);
  assert.equal(manifest.summary.sourceProgramTableTruncatedRows, 0);
  assert.equal(manifest.summary.sourceProgramTableMissingEntryRows, 0);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, true);
  assert.equal(manifest.summary.sourceProgramType4EntryRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.match(manifest.items[0].sampleResourceIds, /0x7\|0x9/);
  assert.match(manifest.items[2].sampleSourceKeyHashes, /0x12345678/);
  assert.match(manifest.items[2].sampleDecodedValueWords, /0x7\|0x9/);
});

test("summarizeCapture blocks source/program review when a decoded source table snapshot is truncated", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 130,
          capturedEntryRows: 128,
          entryCaptureLimit: 128,
          entryCaptureTruncated: true,
          missingEntryRows: 2,
          entries: [
            {
              headerHex: "0x1007",
              sourceKeyHashHex: "0x12345678",
              valueWords: [{ hex: "0x7" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.sourceProgramTableTruncatedRows, 1);
  assert.equal(manifest.summary.sourceProgramTableMissingEntryRows, 2);
  assert.equal(manifest.summary.sourceProgramTableCaptureComplete, false);
  assert.equal(manifest.summary.captureStatus, "source-program-table-truncated");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture keeps texture sampler review blocked until type4 entries align with a runtime patch", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 37 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          valueWordCount: 2,
          entries: [
            {
              headerHex: "0x40000025",
              sourceKeyHashHex: "0x89abcdef",
              typeBits: 4,
              directValueFlag: true,
              valueWords: [{ hex: "0x1234" }, { hex: "0x5678" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.sourceProgramType4EntryRows, 1);
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchMountedTableRows, 0);
  assert.equal(manifest.summary.type4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.sourceProgramDirectValueEntryRows, 1);
  assert.match(manifest.items[2].sampleType4SourceKeyHashes, /0x89abcdef/);
  assert.match(manifest.items[2].sampleType4ValueWords, /0x1234\|0x5678/);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture marks texture sampler review ready only when mounted type4 table, lookup, and patch share the same sequence", () => {
  const sampler54SourceKeyHash = sourceKeyHashHex("sampler54");
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 6 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 37 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entryCount: 1,
          valueWordCount: 2,
          entries: [
            {
              headerHex: "0x40000025",
              sourceKeyHashHex: sampler54SourceKeyHash,
              typeBits: 4,
              directValueFlag: true,
              valueWords: [{ hex: "0x1234" }, { hex: "0x5678" }],
            },
          ],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 6,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              sourceKeyHashHex: sampler54SourceKeyHash,
              valueWords: [{ hex: "0x7000" }, { hex: "0x0" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, true);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, true);
  assert.equal(manifest.summary.knownShadergraphTextureResourceUnitRows, 1);
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchMountedTableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchOrderedMountedTableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows, 1);
  assert.equal(
    manifest.summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    1,
  );
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture sampler review when source key hash does not match the shadergraph sampler", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entries: [
            {
              headerHex: "0x40000025",
              sourceKeyHashHex: "0x89abcdef",
              typeBits: 4,
              directValueFlag: true,
              valueWords: [{ hex: "0x1234" }, { hex: "0x5678" }],
            },
          ],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 6,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              sourceKeyHashHex: "0x89abcdef",
              valueWords: [{ hex: "0x7000" }, { hex: "0x0" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, true);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows, 0);
  assert.equal(
    manifest.summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture uses shadergraph sampler join sourceKeyHash as the resource identity table", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const shadergraphSamplerTexDataJoin = {
    items: [
      {
        sampler: "sampler54",
        sourceKeyHash: "0xfeedface",
        unit: 1,
        texturePath: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        classification: "shadergraph-hash-texture-path",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              sourceKeyHashHex: "0xfeedface",
              directValueFlag: true,
              valueWords: [{ hex: "0x1234" }, { hex: "0x5678" }],
            },
          ],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 6,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              sourceKeyHashHex: "0xfeedface",
              valueWords: [{ hex: "0x7000" }, { hex: "0x0" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({
    targetManifest: runtimeTargetManifest,
    inputPath,
    materialRuntime,
    shadergraphSamplerTexDataJoin,
  });

  assert.equal(manifest.summary.knownShadergraphTextureResourceSamplerIdentityRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows, 1);
  assert.equal(
    manifest.summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    1,
  );
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture sampler review when table closure and registered resource closure happen on different patches", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entries: [{ headerHex: "0x40000001", typeBits: 4, valueWords: [{ hex: "0x0" }, { hex: "0x0" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 6,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/not_in_shadergraph.png",
        returnedTextureObject: "0x8000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 7,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x8000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x8000" }, { hex: "0x0" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 8,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x4000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x4000",
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, true);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture sampler review when table and object close but shadergraph resource key was not registered", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          table: "0x3000",
          entries: [
            {
              headerHex: "0x40000025",
              sourceKeyHashHex: "0x89abcdef",
              typeBits: 4,
              directValueFlag: true,
              valueWords: [{ hex: "0x1234" }, { hex: "0x5678" }],
            },
          ],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, false);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 0);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture sampler review when the runtime patch belongs to a different source/program table", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          entries: [{ typeBits: 4, directValueFlag: true, valueWords: [{ hex: "0x1234" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: { returnedTextureObject: "0x7000" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x4000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x4000",
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchMountedTableRows, 0);
  assert.equal(manifest.summary.type4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture sampler review when the patch appears before the mounted type4 table", () => {
  const runtimeTargetManifest = {
    items: [
      ...targetManifest.items,
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: { returnedTextureObject: "0x7000" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        sourceProgramTable: "0x3000",
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          table: "0x3000",
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceList: [{ payload: "0x2000", payloadCString: "HeroPreview", nestedIds: [{ idU32: 37 }] }],
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: { table: "0x3000", payload: "0x2000", payloadCString: "HeroPreview" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 5,
      threadId: 7,
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
        tableDecoded: {
          entries: [{ typeBits: 4, directValueFlag: true, valueWords: [{ hex: "0x1234" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: runtimeTargetManifest, inputPath });

  assert.equal(manifest.summary.readyForManualSourceProgramReview, true);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualTextureSamplerReview, false);
  assert.equal(manifest.summary.sourceProgramMountedType4TableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchMountedTableRows, 1);
  assert.equal(manifest.summary.type4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture records texture lookup and type4 patch runtime evidence separately", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
      {
        source: "hook-target",
        name: "inline-texture-object-builder-entry",
        addressHex: "0x189e4ec",
        captureKind: "inline-texture-object-builder-entry",
        reason: "capture inline texture object",
      },
    ],
  };
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              valueWords: [{ hex: "0x7000" }, { hex: "0x0" }],
            },
          ],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "inline-texture-object-builder-entry",
      captureKind: "inline-texture-object-builder-entry",
      inlineTextureBuilder: {
        returnedTextureObject: "0x8000",
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath });

  assert.equal(manifest.summary.textureRuntimeLookupEvents, 1);
  assert.equal(manifest.summary.textureRuntimeLookupReturnRows, 1);
  assert.equal(manifest.summary.inlineTextureObjectBuilderEvents, 1);
  assert.equal(manifest.summary.inlineTextureObjectReturnRows, 1);
  assert.equal(manifest.summary.type4TexturePatchEvents, 1);
  assert.equal(manifest.summary.type4TexturePatchAfterDecodeEvents, 1);
  assert.equal(manifest.summary.type4TexturePatchDecodedEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchDecodedType4EntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchKnownReturnedObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchValueMatchesObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameThreadObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchOrderedSameThreadObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 1);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, true);
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.match(manifest.items[1].sampleTextureResourceKeys, /ringo/);
  assert.match(manifest.items[2].sampleTextureObjects, /0x7000/);
  assert.match(manifest.items[2].samplePatchSamplerUnits, /0x1/);
  assert.match(manifest.items[2].samplePatchType4ValueWords, /0x7000/);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture runtime review when matching patch object is on another thread", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: { returnedTextureObject: "0x7000" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 8,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath });

  assert.equal(manifest.summary.type4TexturePatchKnownReturnedObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchValueMatchesObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameThreadObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchOrderedSameThreadObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture runtime review when patch happens before the matching lookup", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 10,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 11,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: { returnedTextureObject: "0x7000" },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath });

  assert.equal(manifest.summary.type4TexturePatchKnownReturnedObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchValueMatchesObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameThreadObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchOrderedSameThreadObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture keeps texture runtime review blocked when patch object is not tied to a returned texture object", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x9000",
        tableAfterDecoded: {
          entries: [
            {
              typeBits: 4,
              sourceIndex: 1,
              valueWords: [{ hex: "0x9000" }, { hex: "0x0" }],
            },
          ],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath });

  assert.equal(manifest.summary.textureRuntimeLookupReturnRows, 1);
  assert.equal(manifest.summary.type4TexturePatchDecodedType4EntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchKnownReturnedObjectRows, 0);
  assert.equal(manifest.summary.type4TexturePatchValueMatchesObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameObjectAndValueMatchRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks texture runtime review when sampler unit does not match the patched type4 entry", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: { returnedTextureObject: "0x7000" },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 2, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath });

  assert.equal(manifest.summary.type4TexturePatchKnownReturnedObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchValueMatchesObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureRuntimeReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture links texture lookup resource keys to known shadergraph sampler texture paths", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        rel: "Characters/Ringo/Art/ringo.glb",
        materialName: "/Characters/Ringo/Art/ringo.ringo_mat.shadergraph",
        shadergraphRel: "Characters/Ringo/Art/ringo.ringo_mat.shadergraph",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
        samplerTextureSources: JSON.stringify({ sampler54: "same-shadergraph-role:baseColor" }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 4,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/not_in_shadergraph.png",
        returnedTextureObject: "0x8000",
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.knownShadergraphTextureResourceRows, 1);
  assert.equal(manifest.summary.knownShadergraphTextureResourceUnitRows, 1);
  assert.equal(manifest.summary.textureLookupResourceKeyRows, 2);
  assert.equal(manifest.summary.textureLookupKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureLookupUnknownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureRegistrationResourceKeyRows, 1);
  assert.equal(manifest.summary.textureRegistrationKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureLookupRegisteredKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceKnownResourceObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, true);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks shadergraph resource-key review when patch sampler unit differs from the shadergraph sampler unit", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 2,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 2, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.textureLookupRegisteredKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks shadergraph resource-key review when registration and lookup use different texture runtime objects", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-resource-register-entry",
        addressHex: "0x189dd40",
        captureKind: "external-texture-register-entry",
        reason: "capture texture registration",
      },
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler54: 1 }),
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-resource-register-entry",
      captureKind: "external-texture-register-entry",
      textureRegistration: {
        textureRuntime: "0x9000",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        textureRuntime: "0x9008",
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 3,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.textureLookupRegisteredKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture blocks shadergraph resource-key review when lookup was not preceded by a texture registration", () => {
  const textureTargetManifest = {
    items: [
      {
        source: "hook-target",
        name: "external-texture-runtime-lookup-entry",
        addressHex: "0x189df90",
        captureKind: "external-texture-lookup-entry",
        reason: "capture texture lookup",
      },
      {
        source: "hook-target",
        name: "runtime-type4-texture-patch-entry",
        addressHex: "0x189cf2c",
        captureKind: "runtime-type4-texture-patch-entry",
        reason: "capture type4 patch",
      },
    ],
  };
  const materialRuntime = {
    items: [
      {
        shadergraphStatus: "ok",
        samplerTexturePaths: JSON.stringify({
          sampler54: "../hero_assets_material_textures_preview/Characters/Ringo/Art/ringo.ringo_mat.png",
        }),
      },
    ],
  };
  const inputPath = writeJsonl([
    {
      event: "material-source-program-capture-event",
      eventId: 1,
      threadId: 7,
      target: "external-texture-runtime-lookup-entry",
      captureKind: "external-texture-lookup-entry",
      textureLookup: {
        resourceKeyCString: "Characters/Ringo/Art/ringo.ringo_mat.png",
        returnedTextureObject: "0x7000",
      },
    },
    {
      event: "material-source-program-capture-event",
      eventId: 2,
      threadId: 7,
      target: "runtime-type4-texture-patch-entry",
      captureKind: "runtime-type4-texture-patch-entry",
      texturePatch: {
        samplerUnitU32: 1,
        textureObject: "0x7000",
        tableAfterDecoded: {
          entries: [{ typeBits: 4, sourceIndex: 1, valueWords: [{ hex: "0x7000" }, { hex: "0x0" }] }],
        },
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest: textureTargetManifest, inputPath, materialRuntime });

  assert.equal(manifest.summary.textureLookupKnownShadergraphResourceKeyRows, 1);
  assert.equal(manifest.summary.textureRegistrationResourceKeyRows, 0);
  assert.equal(manifest.summary.textureRegistrationKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.textureLookupRegisteredKnownShadergraphResourceKeyRows, 0);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 1);
  assert.equal(manifest.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 0);
  assert.equal(manifest.summary.readyForManualTextureResourceKeyReview, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
});

test("summarizeCapture keeps un-decoded material source/program tables gated", () => {
  const inputPath = writeJsonl([
    { event: "material-source-program-capture-start", targetCount: 3 },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-producer-entry",
      captureKind: "dynamic-producer-entry",
      resourceListHead: "0x1000",
      resourceList: [
        {
          payload: "0x2000",
          payloadCString: "HeroPreview",
          nestedIds: [{ idU32: 7 }],
        },
      ],
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-entry-writer-callsite",
      captureKind: "entry-writer-callsite",
      entryArgs: {
        table: "0x3000",
        payload: "0x2000",
        payloadCString: "HeroPreview",
      },
    },
    {
      event: "material-source-program-capture-event",
      target: "dynamic-source-program-mount-callsite",
      captureKind: "mount-callsite",
      mount: {
        sceneHolder: "0x4000",
        sourceProgramTable: "0x3000",
      },
    },
  ]);
  const manifest = summarizeCapture({ targetManifest, inputPath });

  assert.equal(manifest.summary.captureStatus, "partial-target-coverage");
  assert.equal(manifest.summary.readyForManualSourceProgramReview, false);
  assert.equal(manifest.summary.sourceProgramTableDecodeEvents, 0);
  assert.equal(manifest.summary.sourceProgramTableDecodedEntryRows, 0);
});

test("exportSummary writes material source/program report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-source-program-summary-out-"));
  const targetsPath = path.join(tempDir, "targets.json");
  const inputPath = writeJsonl([]);
  const type4EntrySemanticsPath = writeJson(tempDir, "type4-entry.json", {
    summary: {
      type4EntrySemanticsRecovered: true,
      runtimeType4ValuePatchRecovered: true,
      type4HeaderMaskHex: "0x40000000",
      sourceIndexBits: "0..11",
      valueOffsetBits: "12..27",
      typeBits: "28..30",
      type4ValueWordCount: 2,
    },
  });
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  fs.writeFileSync(targetsPath, `${JSON.stringify(targetManifest, null, 2)}\n`);

  const summary = exportSummary({ targetsPath, inputPath, type4EntrySemanticsPath, jsonOut, viewerOut, tsvOut });

  assert.equal(summary.captureStatus, "capture-empty");
  assert.equal(summary.sourceProgramType4DecoderReady, true);
  assert.equal(summary.sourceProgramType4DecoderNeedsRuntimeCapture, true);
  assert.equal(summary.sourceProgramType4ValueWordCount, 2);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.targetRows, 3);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.targetRows, 3);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /dynamic-source-program-producer-entry/);
});
