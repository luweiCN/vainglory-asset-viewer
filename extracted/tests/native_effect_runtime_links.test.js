const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeEffectRuntimeLinks,
  exportNativeEffectRuntimeLinks,
  reportRowsForManifest,
} = require("../tools/native_effect_runtime_links");

const schemaManifest = {
  generatedAt: "2026-06-27T00:00:00.000Z",
  items: [
    {
      typeName: "LevelVisuals",
      fieldOffset: "0x20",
      fieldSpan: "0x8",
      exactSpanCandidates:
        "StaticPfx**@0x101858708:0x8:kind3:-0x18:exact-span|LevelVisuals*@0x101858748:0x8:kind3:+0x28:exact-span|StaticPfx*@0x1018586f0:0x8:kind3:-0x30:exact-span",
    },
    {
      typeName: "LevelVisuals",
      fieldOffset: "0x58",
      fieldSpan: "0x8",
      exactSpanCandidates:
        "StaticLensFlare**@0x101857d88:0x8:kind3:-0x18:exact-span|VoiceOverLocalizedEntry*@0x101857dc8:0x8:kind3:+0x28:exact-span",
    },
    {
      typeName: "MenuMeshData",
      fieldOffset: "0x58",
      fieldSpan: "0x24",
      exactSpanCandidates: "MenuMeshOmniLight@0x101858778:0x24:kind1:-0x20:exact-span",
    },
    {
      typeName: "MenuMeshData",
      fieldOffset: "0x20",
      fieldSpan: "0x8",
      exactSpanCandidates:
        "MenuMeshShaderParam**@0x1018582a0:0x8:kind3:-0x18:exact-span|MenuParticleInfo*@0x1018582e0:0x8:kind3:+0x28:exact-span",
    },
  ],
};

test("buildNativeEffectRuntimeLinks extracts true effect runtime structure links from schema candidates", () => {
  const manifest = buildNativeEffectRuntimeLinks(schemaManifest, "2026-06-27T00:00:00.000Z");

  assert.equal(manifest.summary.rows, 5);
  assert.equal(manifest.summary.fieldSlots, 4);
  assert.equal(manifest.summary.levelVisualsStaticPfxSlots, 1);
  assert.equal(manifest.summary.levelVisualsLensFlareSlots, 1);
  assert.equal(manifest.summary.menuMeshOmniLightSlots, 1);
  assert.equal(manifest.summary.menuMeshParticleCandidateSlots, 1);
  assert.equal(manifest.summary.byRelationshipKind["level-visuals-static-pfx"], 1);
  assert.deepEqual(
    manifest.items.map((item) => `${item.sourceType}->${item.targetBaseType}:${item.fieldOffset}`),
    [
      "LevelVisuals->StaticPfx:0x20",
      "LevelVisuals->StaticLensFlare:0x58",
      "MenuMeshData->MenuMeshOmniLight:0x58",
      "MenuMeshData->MenuMeshShaderParam:0x20",
      "MenuMeshData->MenuParticleInfo:0x20",
    ],
  );
  assert.equal(reportRowsForManifest(manifest)[0].relationshipKind, "level-visuals-static-pfx");
});

test("exportNativeEffectRuntimeLinks writes viewer JSON and audit TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-effect-runtime-links-"));
  const schemaPath = path.join(tempDir, "schema.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(schemaPath, JSON.stringify(schemaManifest, null, 2));

  const summary = exportNativeEffectRuntimeLinks({
    schemaPath,
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 5);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /level-visuals-static-pfx/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /targetBaseType/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.menuMeshOmniLightSlots, 1);
});
