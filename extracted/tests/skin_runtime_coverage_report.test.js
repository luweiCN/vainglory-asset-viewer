const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildSkinRuntimeCoverageRows,
  classifyUnlinkedCharacterModel,
  exportSkinRuntimeCoverageReport,
  summarizeCoverageRows,
} = require("../tools/skin_runtime_coverage_report");

const skinRows = [
  {
    sourceRelativePath: "Characters/Hero028/Lance.def",
    modelLabel: "Lance_DefaultSkin",
    meshes: "Characters/Hero028/Art/hero028.mesh",
    skeletons: "Characters/Hero028/Art/hero028.skeleton",
    usesFallbackSkeleton: "no",
    sameLabelAnimationCount: "4",
  },
  {
    sourceRelativePath: "Characters/Hero028/Lance.def",
    modelLabel: "Lance_Skin_Glad",
    meshes: "Characters/Hero028/Art/hero028_glad.mesh",
    skeletons: "",
    usesFallbackSkeleton: "unresolved",
    sameLabelAnimationCount: "0",
  },
];

const skinnedItems = [
  {
    rel: "Characters/Hero028/Art/hero028.glb",
    sourceMeshPath: "Characters/Hero028/Art/hero028.mesh",
    meshPath: "Characters/Hero028/Art/hero028.mesh",
    materialCount: 4,
    texturedMaterialCount: 4,
    normalMaterialCount: 1,
    roughnessMaterialCount: 4,
    resolvedSkeletonPath: "Characters/Hero028/Art/hero028.skeleton",
    resolvedSkeletonSource: "primary",
    inferredSkeleton: false,
  },
  {
    rel: "Characters/Hero028/Art/hero028_glad.glb",
    sourceMeshPath: "Characters/Hero028/Art/hero028_glad.mesh",
    meshPath: "Characters/Hero028/Art/hero028_glad.mesh",
    materialCount: 5,
    texturedMaterialCount: 3,
    normalMaterialCount: 1,
    roughnessMaterialCount: 3,
    resolvedSkeletonPath: "Characters/Hero028/Art/hero028.skeleton",
    resolvedSkeletonSource: "fallback",
    inferredSkeleton: false,
  },
];

const skinItems = skinnedItems.map((item) => ({ ...item }));

const allPbrItems = [
  ...skinnedItems,
  {
    rel: "Characters/Hero028/ArtShield/hero028Shield.glb",
    sourceMeshPath: "Characters/Hero028/ArtShield/hero028Shield.mesh",
    variant: "hero028Shield",
    materialCount: 2,
    texturedMaterialCount: 1,
    normalMaterialCount: 0,
    roughnessMaterialCount: 1,
  },
  {
    rel: "Characters/Attachments/Hats/Halo2018/Art/halo2018.glb",
    sourceMeshPath: "Characters/Attachments/Hats/Halo2018/Art/halo2018.mesh",
    variant: "halo2018",
    materialCount: 2,
    texturedMaterialCount: 2,
    normalMaterialCount: 0,
    roughnessMaterialCount: 2,
  },
];

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify({ items: value }, null, 2)}\n`);
}

function writeTsv(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("buildSkinRuntimeCoverageRows reports skin manifest, skeleton, texture, and runtime prop coverage", () => {
  const rows = buildSkinRuntimeCoverageRows({ skinRows, skinnedItems, skinItems, allPbrItems });
  const base = rows.find((row) => row.modelLabel === "Lance_DefaultSkin");
  const glad = rows.find((row) => row.modelLabel === "Lance_Skin_Glad");
  const shield = rows.find((row) => row.rel === "Characters/Hero028/ArtShield/hero028Shield.glb");

  assert.equal(base.issues, "ok");
  assert.match(glad.issues, /unresolved-skeleton-in-definition/);
  assert.match(glad.issues, /fallback-skeleton/);
  assert.match(glad.issues, /partial-basecolor-texture/);
  assert.match(glad.issues, /no-same-label-animation/);
  assert.equal(shield.sourceKind, "unlinked-character-model");
  assert.equal(shield.assetClass, "runtime-prop-candidate");
  assert.match(shield.issues, /not-linked-to-skin-row/);
});

test("classifyUnlinkedCharacterModel recognizes attachment and runtime prop patterns", () => {
  assert.equal(
    classifyUnlinkedCharacterModel({ rel: "Characters/Attachments/Hats/Halo2018/Art/halo2018.glb", variant: "halo2018" }),
    "attachment",
  );
  assert.equal(
    classifyUnlinkedCharacterModel({ rel: "Characters/Hero025/ArtWall/hero025Wall.glb", variant: "hero025Wall" }),
    "runtime-prop-candidate",
  );
});

test("summarizeCoverageRows counts unresolved skins and runtime props", () => {
  const rows = buildSkinRuntimeCoverageRows({ skinRows, skinnedItems, skinItems, allPbrItems });
  const summary = summarizeCoverageRows(rows);

  assert.equal(summary.skinRows, 2);
  assert.equal(summary.skinRowsInSkinnedManifest, 2);
  assert.equal(summary.skinRowsWithFallbackSkeleton, 1);
  assert.equal(summary.skinRowsWithTextureIssues, 1);
  assert.equal(summary.runtimePropCandidates, 1);
});

test("exportSkinRuntimeCoverageReport writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skin-coverage-"));
  const skinSummaryPath = path.join(tempDir, "skin.tsv");
  const skinnedManifestPath = path.join(tempDir, "skinned.json");
  const skinManifestPath = path.join(tempDir, "skin.json");
  const allPbrManifestPath = path.join(tempDir, "all.json");
  const tsvOut = path.join(tempDir, "coverage.tsv");
  const jsonOut = path.join(tempDir, "coverage.json");

  writeTsv(
    skinSummaryPath,
    [
      "sourceRelativePath",
      "modelLabel",
      "meshCount",
      "meshes",
      "skeletons",
      "usesFallbackSkeleton",
      "sameLabelAnimationCount",
      "firstSameLabelAnimations",
    ],
    skinRows.map((row) => ({ ...row, meshCount: "1", firstSameLabelAnimations: "" })),
  );
  writeJson(skinnedManifestPath, skinnedItems);
  writeJson(skinManifestPath, skinItems);
  writeJson(allPbrManifestPath, allPbrItems);

  const summary = exportSkinRuntimeCoverageReport({
    skinSummaryPath,
    skinnedManifestPath,
    skinManifestPath,
    allPbrManifestPath,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 4);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /runtime-prop-candidate/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.skinRows, 2);
});
