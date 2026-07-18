const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildGlbMaterialCoverageRows,
  exportGlbMaterialCoverageReport,
  materialCoverageClass,
  readGlbJson,
  summarizeGlbMaterialCoverageRows,
} = require("../tools/glb_material_coverage_report");

function writeGlb(filePath, gltfJson) {
  const json = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const jsonChunk = Buffer.alloc(paddedLength, 0x20);
  json.copy(jsonChunk);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, chunkHeader, jsonChunk]));
}

const gltfJson = {
  asset: { version: "2.0" },
  images: [{ name: "body_basecolor", mimeType: "image/png" }],
  textures: [{ source: 0 }],
  materials: [
    {
      name: "body",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        baseColorFactor: [1, 1, 1, 1],
      },
    },
    {
      name: "pale",
      pbrMetallicRoughness: {
        baseColorFactor: [0.9, 0.84, 0.75, 1],
      },
    },
    {
      name: "dark",
      pbrMetallicRoughness: {
        baseColorFactor: [0.2, 0.15, 0.1, 1],
      },
    },
    {
      name: "hero.swipe_mat.shadergraph",
      alphaMode: "BLEND",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
      },
    },
  ],
};

test("readGlbJson extracts the JSON chunk from GLB files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-glb-json-"));
  const glbPath = path.join(tempDir, "model.glb");
  writeGlb(glbPath, gltfJson);

  assert.equal(readGlbJson(glbPath).materials.length, 4);
});

test("materialCoverageClass classifies textured, pale, and color-only materials", () => {
  assert.equal(materialCoverageClass(gltfJson, gltfJson.materials[0]), "basecolor-textured");
  assert.equal(materialCoverageClass(gltfJson, gltfJson.materials[1]), "pale-color-only");
  assert.equal(materialCoverageClass(gltfJson, gltfJson.materials[2]), "color-only");
  assert.equal(materialCoverageClass(gltfJson, gltfJson.materials[3]), "alpha-effect-color");
});

test("buildGlbMaterialCoverageRows emits per-material diagnostics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-glb-material-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  writeGlb(path.join(tempDir, rel), gltfJson);

  const rows = buildGlbMaterialCoverageRows({
    glbRoot: tempDir,
    manifestItems: [
      {
        rel,
        modelLabel: "HeroA_DefaultSkin",
        character: "HeroA",
        sourceRelativePath: "Characters/HeroA/HeroA.def",
      },
    ],
  });

  assert.equal(rows.length, 4);
  assert.equal(rows[0].hasBaseColorTexture, "yes");
  assert.equal(rows[0].baseColorTexture, "body_basecolor");
  assert.equal(rows[1].looksPale, "yes");
  assert.equal(rows[2].coverageClass, "color-only");
  assert.equal(rows[3].looksPale, "no");
});

test("exportGlbMaterialCoverageReport writes TSV, summary, and viewer JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-glb-material-export-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const manifestPath = path.join(tempDir, "manifest.json");
  const glbRoot = path.join(tempDir, "glb");
  const tsvOut = path.join(tempDir, "coverage.tsv");
  const jsonOut = path.join(tempDir, "coverage_summary.json");
  const viewerOut = path.join(tempDir, "coverage.json");
  writeGlb(path.join(glbRoot, rel), gltfJson);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      items: [
        {
          rel,
          modelLabel: "HeroA_DefaultSkin",
          character: "HeroA",
          sourceRelativePath: "Characters/HeroA/HeroA.def",
        },
      ],
    })}\n`,
  );

  const summary = exportGlbMaterialCoverageReport({ manifestPath, glbRoot, tsvOut, jsonOut, viewerOut });
  const viewer = JSON.parse(fs.readFileSync(viewerOut, "utf8"));

  assert.equal(summary.rows, 4);
  assert.equal(summary.baseColorTexturedRows, 1);
  assert.equal(summary.paleColorOnlyRows, 1);
  assert.equal(summary.byCoverageClass["alpha-effect-color"], 1);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /pale-color-only/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.paleModelRows, 1);
  assert.equal(viewer.items.length, 4);
});
