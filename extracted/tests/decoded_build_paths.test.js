const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportDecodedBuildPaths,
  extractBuildPathsFromText,
  mergeBuildPathLists,
} = require("../tools/decoded_build_paths");

test("extractBuildPathsFromText finds unique concrete build paths", () => {
  const text = [
    "strings",
    "*Ringo*|build://Characters/Ringo/Ringo.def|build://Characters/Ringo/Ringo.def",
    "bad xxxxx://MenuPartsCommon.tga",
    "placeholder build://HUDPartsHero_%s.png",
    "next build://Characters/Adagio/Adagio.def\tend",
  ].join("\n");

  assert.deepEqual(extractBuildPathsFromText(text), [
    "build://Characters/Adagio/Adagio.def",
    "build://Characters/Ringo/Ringo.def",
  ]);
});

test("mergeBuildPathLists preserves build paths once in sorted order", () => {
  assert.deepEqual(
    mergeBuildPathLists([
      ["build://B.def", "not-build", "build://A.def"],
      ["build://A.def", "", "build://C.def"],
    ]),
    ["build://A.def", "build://B.def", "build://C.def"],
  );
});

test("exportDecodedBuildPaths writes decoded and combined path lists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-decoded-paths-"));
  const decodedSource = path.join(tempDir, "cff0_decoded_instances.tsv");
  const existingPaths = path.join(tempDir, "build_paths_all.txt");
  const decodedOut = path.join(tempDir, "decoded_build_paths.txt");
  const combinedOut = path.join(tempDir, "build_paths_combined.txt");

  fs.writeFileSync(decodedSource, "build://Characters/Ringo/Ringo.def|build://Characters/Adagio/Adagio.def\n");
  fs.writeFileSync(existingPaths, "build://Characters/Ringo/Ringo.def\nbuild://Music/Menu.mp3\n");

  const summary = exportDecodedBuildPaths({
    decodedSource,
    existingPaths,
    decodedOut,
    combinedOut,
  });

  assert.deepEqual(summary, {
    decodedPaths: 2,
    existingPaths: 2,
    combinedPaths: 3,
  });
  assert.equal(
    fs.readFileSync(decodedOut, "utf8"),
    "build://Characters/Adagio/Adagio.def\nbuild://Characters/Ringo/Ringo.def\n",
  );
  assert.equal(
    fs.readFileSync(combinedOut, "utf8"),
    [
      "build://Characters/Adagio/Adagio.def",
      "build://Characters/Ringo/Ringo.def",
      "build://Music/Menu.mp3",
      "",
    ].join("\n"),
  );
});
