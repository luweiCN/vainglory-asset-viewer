const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildResourceIndex,
  dataFileForHash,
  hasPrintfPlaceholder,
  md5Upper,
  normalizeBuildPath,
  readMagic4,
} = require("../tools/resource_index");

test("normalizeBuildPath strips build scheme and rejects non-build paths", () => {
  assert.equal(normalizeBuildPath("build://Levels/HeroManifest.def"), "Levels/HeroManifest.def");
  assert.equal(normalizeBuildPath("build://Sounds/UI.assetbundle/tadah.mp3"), "Sounds/UI.assetbundle/tadah.mp3");
  assert.equal(normalizeBuildPath("Levels/HeroManifest.def"), null);
  assert.equal(normalizeBuildPath("build://"), null);
});

test("hasPrintfPlaceholder detects generated resource patterns", () => {
  assert.equal(hasPrintfPlaceholder("Splash_%s.png"), true);
  assert.equal(hasPrintfPlaceholder("star_slam_%d.mp3"), true);
  assert.equal(hasPrintfPlaceholder("Common_%02d.png"), true);
  assert.equal(hasPrintfPlaceholder("Splash_Celeste.png"), false);
});

test("dataFileForHash maps MD5 to iOS Data shard path", () => {
  assert.equal(
    dataFileForHash("/tmp/Data", "C41CC38B5CEADF09048A3750D045E47B"),
    path.join("/tmp/Data", "C4", "C41CC38B5CEADF09048A3750D045E47B"),
  );
});

test("readMagic4 returns printable four byte signatures", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-resource-index-"));
  const filePath = path.join(tempDir, "sample");
  fs.writeFileSync(filePath, Buffer.from([0x43, 0x46, 0x46, 0x30, 0xff]));

  assert.equal(readMagic4(filePath), "CFF0");
});

test("buildResourceIndex matches concrete build paths and skips placeholders", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-resource-index-"));
  const dataRoot = path.join(tempDir, "Data");
  const concretePath = "Levels/HeroManifest.def";
  const concreteHash = md5Upper(concretePath);
  const concreteFile = dataFileForHash(dataRoot, concreteHash);
  fs.mkdirSync(path.dirname(concreteFile), { recursive: true });
  fs.writeFileSync(concreteFile, Buffer.from("CFF0sample"));

  const index = buildResourceIndex(
    [
      "build://Levels/HeroManifest.def",
      "build://Splash_%s.png",
      "build://Missing.assetbundle",
      "not a build path",
    ],
    dataRoot,
  );

  assert.deepEqual(
    index.matched.map((entry) => entry.relativePath),
    ["Levels/HeroManifest.def"],
  );
  assert.equal(index.matched[0].hash, concreteHash);
  assert.equal(index.matched[0].magic4, "CFF0");
  assert.equal(index.skippedPlaceholders[0].relativePath, "Splash_%s.png");
  assert.equal(index.missing[0].relativePath, "Missing.assetbundle");
});
