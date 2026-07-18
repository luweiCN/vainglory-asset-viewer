const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { engineHashHex } = require("../tools/engine_hash");
const {
  buildCurrentNativeShadergraphSamplerTexDataJoinAudit,
  exportCurrentNativeShadergraphSamplerTexDataJoinAudit,
} = require("../tools/current_native_shadergraph_sampler_texdata_join_audit");

function writeJson(tempDir, name, value) {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function fixturePaths(tempDir, overrides = {}) {
  const materialRuntimePath = writeJson(tempDir, "material-runtime.json", {
    summary: {
      materialRows: 1,
      parsedShadergraphRows: 1,
      byUnresolvedSampler: {},
      byUnhashedSampler: { sampler2: 1, sampler3: 1 },
      byTexturePathMissingSampler: { sampler2: 1, sampler3: 1 },
      byRuntimeResolvedSampler: { sampler2: 1, sampler3: 1 },
    },
    items: [
      {
        rel: "Characters/Test/Art/test.glb",
        materialName: "/Characters/Test/Art/test.mat.shadergraph",
        shadergraphRel: "Characters/Test/Art/test.mat.shadergraph",
        shadergraphStatus: "ok",
        samplerUnits: JSON.stringify({ sampler1: 0, sampler2: 1, sampler3: 2 }),
        samplerHashes: JSON.stringify({ sampler1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }),
        samplerTexturePaths: JSON.stringify({
          sampler1: "../textures/test.png",
          scoreCandidate: "../textures/non-native-role.png",
        }),
        samplerTextureSources: JSON.stringify({
          sampler1: "same-shadergraph-role:baseColor",
          scoreCandidate: "same-shadergraph-role:baseColor",
        }),
        unhashedSamplers: "sampler2|sampler3",
        texturePathMissingSamplers: "sampler2|sampler3",
        runtimeResolvedSamplers: "sampler2|sampler3",
        unresolvedSamplers: "",
        runtimeSamplerRecords: JSON.stringify([
          {
            sampler: "sampler2",
            unit: 1,
            kind: "tch0-inline-rgb-float-lookup",
            inlineLookupOffset: 256,
            inlineLookupStats: { width: 64, height: 1 },
          },
          {
            sampler: "sampler3",
            unit: 2,
            kind: "runtime-fog-of-war-texture-diagnostic",
            runtimeSceneTextureUsage: { semantic: "FogOfWar.Texture" },
          },
        ]),
      },
      {
        rel: "Characters/Test/Art/missing.glb",
        shadergraphStatus: "missing-glb",
      },
    ],
  });
  const externalTextureBindingPath = writeJson(tempDir, "external.json", {
    summary: { externalTextureSamplerRuntimeBindingRecovered: true },
  });
  const inlineTexturePlaceholderPath = writeJson(tempDir, "inline.json", {
    summary: {
      inlineTextureObjectBindingRecovered: true,
      inlineTextureRuntimePatchRequired: false,
    },
  });
  return {
    materialRuntimePath,
    externalTextureBindingPath,
    inlineTexturePlaceholderPath,
    ...overrides,
  };
}

function sourceKeyHashHex(value) {
  return `0x${engineHashHex(value).toLowerCase()}`;
}

test("shadergraph sampler texData join classifies native sampler resources and ignores non-sampler texture candidates", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-sampler-texdata-join-"));
  const manifest = buildCurrentNativeShadergraphSamplerTexDataJoinAudit(fixturePaths(tempDir));

  assert.equal(manifest.summary.materialSamplerRows, 3);
  assert.equal(manifest.summary.externalTexturePathSamplerRows, 1);
  assert.equal(manifest.summary.inlineRuntimeSamplerRows, 1);
  assert.equal(manifest.summary.runtimeSceneTextureSamplerRows, 1);
  assert.equal(manifest.summary.externalTextureBindingMechanicalRows, 1);
  assert.equal(manifest.summary.inlineTextureBindingMechanicalRows, 1);
  assert.equal(manifest.summary.runtimeSceneTextureDiagnosticRows, 1);
  assert.equal(manifest.summary.ordinarySamplerBindingMechanicalRows, 2);
  assert.equal(manifest.summary.samplerSourceKeyHashRows, 3);
  assert.equal(manifest.summary.classificationGapRows, 0);
  assert.equal(manifest.summary.samplerResourceClassificationComplete, true);
  assert.equal(manifest.summary.ordinarySamplerBindingMechanicsRecovered, true);
  assert.equal(manifest.summary.samplerStaticResourceAndBindingComplete, true);
  assert.equal(manifest.summary.samplerTexDataOwnershipNeedsLiveCapture, true);
  assert.equal(manifest.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(manifest.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(manifest.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(
    manifest.items.map((row) => row.sampler).sort(),
    ["sampler1", "sampler2", "sampler3"],
  );
  assert.equal(manifest.items.some((row) => row.sampler === "scoreCandidate"), false);
  assert.equal(
    manifest.items.find((row) => row.sampler === "sampler1").sourceKeyHash,
    sourceKeyHashHex("sampler1"),
  );
});

test("exportCurrentNativeShadergraphSamplerTexDataJoinAudit writes report, viewer JSON, and TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-sampler-texdata-join-out-"));
  const jsonOut = path.join(tempDir, "summary.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "summary.tsv");
  const summary = exportCurrentNativeShadergraphSamplerTexDataJoinAudit({
    ...fixturePaths(tempDir),
    jsonOut,
    viewerOut,
    tsvOut,
  });

  assert.equal(summary.samplerResourceClassificationComplete, true);
  assert.equal(summary.samplerSourceKeyHashRows, 3);
  assert.equal(summary.ordinarySamplerBindingMechanicalRows, 2);
  assert.equal(summary.samplerStaticResourceAndBindingComplete, true);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.renderPromotionAllowedRows, 0);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.materialSamplerRows, 3);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).summary.samplerTexDataOwnershipNeedsLiveCapture, true);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /tch0-inline-runtime-texture/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /sourceKeyHash/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /staticResourceBindingMechanicsRecovered/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), new RegExp(sourceKeyHashHex("sampler1")));
  assert.doesNotMatch(fs.readFileSync(tsvOut, "utf8"), /scoreCandidate/);
});
