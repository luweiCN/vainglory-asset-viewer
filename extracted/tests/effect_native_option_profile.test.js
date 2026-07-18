const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildEffectNativeOptionProfile,
  exportEffectNativeOptionProfile,
  reportRowsForManifest,
} = require("../tools/effect_native_option_profile");

test("buildEffectNativeOptionProfile groups raw native option offsets by source, binding, action, and resources", () => {
  const manifest = buildEffectNativeOptionProfile(
    {
      items: [
        {
          platform: "ios",
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_A",
          source: {
            functionName: "FUN_TEST_A",
            line: 42,
          },
          actionKeys: ["ability01"],
          resourcePaths: ["Effects/Test/Test_A.pfx"],
          runtimeBinding: {
            kind: "effect-channel",
            effectOptionOffsets: ["0x60", "0xd0"],
            effectOptionArgKinds: ["0x60:numeric-local", "0xd0:numeric-local"],
            effectOptionArgSources: ["0x60:numeric-local:local_40=0x3f000000", "0xd0:numeric-local:local_44=0x40400000"],
            effectOptions: {
              offsetValues: {
                "0x60": [0.5],
                "0xd0": [3],
              },
            },
          },
        },
        {
          sourceKind: "native-visual-binding",
          effectToken: "Effect_Test_B",
          actionKeys: ["ability03", "attack"],
          resourcePaths: [],
          runtimeBinding: {
            kind: "bone",
            effectOptionArgKinds: ["0x60:numeric-direct"],
            effectOptionArgSources: ["0x60:numeric-direct:1.25"],
            effectOptions: {
              offsetValues: {
                "0x60": [1.25],
              },
            },
          },
        },
        {
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test_C",
          actionKeys: ["ability03"],
          resourcePaths: ["Effects/Test/Test_C.pfx"],
          runtimeBinding: {
            kind: "effect-channel",
            effectOptionOffsets: ["0x60"],
            effectOptionArgKinds: ["0x60:callback"],
            effectOptionArgSources: ["0x60:callback:FUN_effect_curve"],
            effectOptions: {
              offsetValues: {},
            },
          },
        },
      ],
    },
    "2026-06-27T00:00:00.000Z",
    {
      items: [
        {
          relativePath: "Effects/Test/Test_A.pfx",
          surfaceRecords: [
            {
              surfaceIndex: 1,
              runtimeHints: {
                durationSeconds: 0.5,
                sizeScalar: 3,
              },
            },
          ],
        },
        {
          relativePath: "Effects/Test/Test_C.pfx",
          surfaceRecords: [
            {
              surfaceIndex: 2,
              runtimeHints: {
                durationSeconds: 2,
              },
            },
          ],
        },
      ],
    },
  );

  assert.equal(manifest.summary.rawOptionHookRows, 3);
  assert.equal(manifest.summary.optionOffsetRows, 4);
  assert.equal(manifest.summary.knownOptionOffsetRows, 4);
  assert.equal(manifest.summary.unknownOptionOffsetRows, 0);
  assert.equal(manifest.summary.unknownOptionHookRows, 0);
  assert.equal(manifest.summary.unknownOptionCandidateOffsets, 0);
  assert.equal(manifest.summary.numericValueRows, 3);
  assert.equal(manifest.summary.offsetOnlyRows, 1);
  assert.equal(manifest.summary.optionArgSourceEntries, 4);
  assert.equal(manifest.summary.pfxRuntimeHintMatchRows, 2);
  assert.equal(manifest.summary.resourceLinkedRows, 2);
  assert.equal(manifest.summary.pfxLinkedRows, 2);
  assert.deepEqual(manifest.summary.byOffset, { "0x60": 3, "0xd0": 1 });
  assert.deepEqual(manifest.summary.byKnownOffset, { "0x60": 3, "0xd0": 1 });
  assert.deepEqual(manifest.summary.byUnknownOffset, {});
  assert.deepEqual(manifest.summary.bySemanticName, { percentParam: 3, scale: 1 });
  assert.deepEqual(manifest.summary.byOffsetArgKind, {
    "0x60:callback": 1,
    "0x60:numeric-direct": 1,
    "0x60:numeric-local": 1,
    "0xd0:numeric-local": 1,
  });
  assert.deepEqual(manifest.summary.byOffsetArgSourceKind, {
    "0x60:callback": 1,
    "0x60:numeric-direct": 1,
    "0x60:numeric-local": 1,
    "0xd0:numeric-local": 1,
  });
  assert.deepEqual(manifest.summary.byUnknownOffsetArgKind, {});
  assert.deepEqual(manifest.summary.byUnknownOffsetArgSourceKind, {});

  assert.deepEqual(manifest.items[0], {
    offset: "0x60",
    semanticStatus: "known",
    semanticName: "percentParam",
    candidateSemanticStatus: "known",
    candidateSemanticNames: [],
    rows: 3,
    numericValueRows: 2,
    offsetOnlyRows: 1,
    pfxRuntimeHintMatchRows: 1,
    resourceLinkedRows: 2,
    pfxLinkedRows: 2,
    optionArgSourceEntries: 3,
    byEvidenceKind: {
      "numeric-float-args": 2,
      "offset-call-only": 1,
    },
    byNumericValue: {
      "0.5": 1,
      "1.25": 1,
    },
    byPfxRuntimeHintMatch: {
      durationSeconds: 1,
    },
    byArgKind: {
      callback: 1,
      "numeric-direct": 1,
      "numeric-local": 1,
    },
    byArgSourceKind: {
      callback: 1,
      "numeric-direct": 1,
      "numeric-local": 1,
    },
    byPreviousOptionOffset: {},
    byNextOptionOffset: {
      "0xd0": 1,
    },
    byNeighborOptionOffset: {
      "0xd0": 1,
    },
    bySourceKind: {
      "native-effect-vcall": 2,
      "native-visual-binding": 1,
    },
    byRuntimeBindingKind: {
      bone: 1,
      "effect-channel": 2,
    },
    byActionKey: {
      ability01: 1,
      ability03: 2,
      attack: 1,
    },
    sampleEffectTokens: ["Effect_Test_A", "Effect_Test_B", "Effect_Test_C"],
    sampleResourcePaths: ["Effects/Test/Test_A.pfx", "Effects/Test/Test_C.pfx"],
    sampleValues: ["0.5", "1.25"],
    sampleArgSources: ["0x60:callback:FUN_effect_curve", "0x60:numeric-direct:1.25", "0x60:numeric-local:local_40=0x3f000000"],
    sampleCallsites: [
      {
        platform: "ios",
        sourceKind: "native-effect-vcall",
        functionName: "FUN_TEST_A",
        line: 42,
        effectToken: "Effect_Test_A",
        bindKind: "",
        runtimeBindingKind: "effect-channel",
        actionKeys: ["ability01"],
        optionOffsets: ["0x60", "0xd0"],
        previousOptionOffset: "",
        nextOptionOffset: "0xd0",
        values: ["0.5"],
        argKinds: ["numeric-local"],
      },
      {
        platform: "",
        sourceKind: "native-visual-binding",
        functionName: "",
        line: "",
        effectToken: "Effect_Test_B",
        bindKind: "",
        runtimeBindingKind: "bone",
        actionKeys: ["ability03", "attack"],
        optionOffsets: ["0x60"],
        previousOptionOffset: "",
        nextOptionOffset: "",
        values: ["1.25"],
        argKinds: ["numeric-direct"],
      },
      {
        platform: "",
        sourceKind: "native-effect-vcall",
        functionName: "",
        line: "",
        effectToken: "Effect_Test_C",
        bindKind: "",
        runtimeBindingKind: "effect-channel",
        actionKeys: ["ability03"],
        optionOffsets: ["0x60"],
        previousOptionOffset: "",
        nextOptionOffset: "",
        values: [],
        argKinds: ["callback"],
      },
    ],
  });
  assert.equal(manifest.items[1].offset, "0xd0");
  assert.equal(manifest.items[1].semanticStatus, "known");
  assert.equal(manifest.items[1].semanticName, "scale");
  assert.equal(manifest.items[1].candidateSemanticStatus, "known");
  assert.deepEqual(manifest.items[1].candidateSemanticNames, []);
  assert.deepEqual(manifest.items[1].byPreviousOptionOffset, { "0x60": 1 });
  assert.deepEqual(manifest.items[1].byNextOptionOffset, {});
  assert.deepEqual(manifest.items[1].byNeighborOptionOffset, { "0x60": 1 });
});

test("exportEffectNativeOptionProfile writes viewer json and audit tsv", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-option-profile-"));
  const hookPath = path.join(tempDir, "effect-hooks.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(
    hookPath,
    JSON.stringify({
      items: [
        {
          sourceKind: "native-effect-vcall",
          effectToken: "Effect_Test",
          actionKeys: ["ability02"],
          resourcePaths: ["Effects/Test/Test.pfx"],
          runtimeBinding: {
            kind: "effect-channel",
            effectOptionOffsets: ["0x78"],
            effectOptions: { offsetValues: { "0x78": [1] } },
          },
        },
      ],
    }),
  );

  const summary = exportEffectNativeOptionProfile({ effectHookPath: hookPath, viewerOut, tsvOut, jsonOut });
  const viewerManifest = JSON.parse(fs.readFileSync(viewerOut, "utf8"));
  const rows = reportRowsForManifest(viewerManifest);

  assert.equal(summary.rawOptionHookRows, 1);
  assert.equal(viewerManifest.items[0].offset, "0x78");
  assert.equal(viewerManifest.items[0].candidateSemanticStatus, "known");
  assert.match(fs.readFileSync(tsvOut, "utf8"), /0x78/);
  assert.deepEqual(rows[0].byActionKey, "ability02:1");
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.rawOptionHookRows, 1);
});
