const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildViewerSkinCatalog, parseKindredSkinCatalog } = require("../tools/export_viewer_hero_catalog");

function writeKindredSkinManifest(payload) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-hero-catalog-"));
  const filePath = path.join(tempDir, "cff0_decoded_instances.tsv");
  fs.writeFileSync(filePath, `Progression/KindredSkinManifest.def\tHASH\t0\t4\t8\t0\t${payload}\n`);
  return filePath;
}

test("parseKindredSkinCatalog keeps adjacent default skins aligned when a fallback label is omitted", () => {
  const filePath = writeKindredSkinManifest(
    [
      "Ringo_DefaultSkin",
      "*Ringo*",
      "Ringo",
      "SAW_DefaultSkin",
      "*SAW*",
      "Skaarf_DefaultSkin",
      "*Hero010*",
      "Skaarf",
    ].join("|"),
  );

  const rows = parseKindredSkinCatalog(filePath);

  assert.deepEqual(
    rows.map((row) => [row.id, row.fallbackLabel, row.localizationKey]),
    [
      ["Ringo_DefaultSkin", "Ringo", null],
      ["SAW_DefaultSkin", "SAW", null],
      ["Skaarf_DefaultSkin", "Skaarf", null],
    ],
  );
});

test("buildViewerSkinCatalog includes runtime skin model labels that are absent from the store catalog", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-hero-catalog-"));
  const kindredSkinManifestPath = path.join(tempDir, "cff0_decoded_instances.tsv");
  const skinModelSummaryPath = path.join(tempDir, "skin_model_summary.tsv");

  fs.writeFileSync(
    kindredSkinManifestPath,
    [
      "Progression/KindredSkinManifest.def\tHASH\t0\t4\t8\t0\tLance_Skin_Deathknight|CHAR_THEME_NAME_LANCE_NETHERKNIGHT|Lance_Deathknight",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    skinModelSummaryPath,
    [
      "sourceRelativePath\tmodelLabel\tmeshCount\tmeshes\tskeletons\tusesFallbackSkeleton\tsameLabelAnimationCount\tfirstSameLabelAnimations",
      "Characters/Hero028/Lance.def\tLance_Skin_Deathknight_SE\t1\tCharacters/Hero028/Art/hero028_deathKnight_SE.mesh\t\tunresolved\t0\t",
      "Characters/Ball/Ball.def\tBall_DefaultSkin\t1\tCharacters/Ball/Art/ball.mesh\t\tunresolved\t0\t",
      "",
    ].join("\n"),
  );

  const catalog = buildViewerSkinCatalog({
    kindredSkinManifestPath,
    skinModelSummaryPath,
    localizationStringsPath: path.join(tempDir, "missing.strings"),
    generatedAt: "2026-06-26T00:00:00.000Z",
  });

  assert.equal(catalog.skins.Lance_Skin_Deathknight.zhCN, null);
  assert.deepEqual(catalog.skins.Lance_Skin_Deathknight_SE, {
    id: "Lance_Skin_Deathknight_SE",
    fallbackLabel: "Lance_Deathknight_SE",
    localizationKey: null,
    source: "runtime-skin-model",
    sourceRelativePath: "Characters/Hero028/Lance.def",
    zhCN: null,
    sources: ["runtime-skin-model", "Characters/Hero028/Lance.def"],
  });
  assert.equal(catalog.skins.Ball_DefaultSkin, undefined);
});
