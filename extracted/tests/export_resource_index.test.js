const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { exportResourceIndex } = require("../tools/export_resource_index");
const { dataFileForHash, md5Upper } = require("../tools/resource_index");

function writeDataFile(dataRoot, relativePath, body = "DATA") {
  const hash = md5Upper(relativePath);
  const filePath = dataFileForHash(dataRoot, hash);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
}

test("exportResourceIndex writes per-category reports for recovered asset classes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-export-index-"));
  const dataRoot = path.join(tempDir, "Data");
  const pathsFile = path.join(tempDir, "paths.txt");
  const outDir = path.join(tempDir, "reports");
  const treeRoot = path.join(tempDir, "tree");
  const paths = [
    "Characters/Ringo/Art/ringo.mesh",
    "Characters/Ringo/Art/ringo.skeleton",
    "Characters/Ringo/Art/ringo.idle.anim",
    "Characters/Ringo/Ringo.def",
    "Sounds/UI.assetbundle/click.mp3",
    "UI/Icon.png",
  ];

  for (const relativePath of paths) writeDataFile(dataRoot, relativePath);
  fs.writeFileSync(pathsFile, `${paths.map((item) => `build://${item}`).join("\n")}\n`);

  const summary = exportResourceIndex({ pathsFile, dataRoot, outDir, treeRoot });

  assert.deepEqual(summary.counts, {
    mesh: 1,
    skeleton: 1,
    animation: 1,
    definition: 1,
    audio: 1,
    image: 1,
  });
  for (const category of ["mesh", "skeleton", "animation", "definition", "audio", "image"]) {
    assert.match(fs.readFileSync(path.join(outDir, `${category}_resource_index.tsv`), "utf8"), /relativePath/);
  }
});
