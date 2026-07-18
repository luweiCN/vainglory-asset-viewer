const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDefinitionManifestChainRows,
  exportDefinitionManifestChainReport,
  parseTsv,
} = require("../tools/definition_manifest_chain_report");

const tsv = `sourceRelativePath\tsourceHash\tblockIndexes\tfirstStringIndex\tlabel\tcategory\ttargetRelativePath\ttargetBuildPath\ttargetHash\tmatched\ttargetLinkedPath
Levels/DefinitionManifest.def\troot\t0,1\t1\t*Ringo*\tdefinition\tCharacters/Ringo/Ringo.def\tbuild://Characters/Ringo/Ringo.def\th1\tyes\tlinked/Ringo.def
Levels/DefinitionManifest.def\troot\t0,1\t3\t*KindredSkinManifest*\tdefinition\tProgression/KindredSkinManifest.def\tbuild://Progression/KindredSkinManifest.def\th2\tyes\tlinked/Skin.def
Characters/Ringo/Ringo.def\th1\t0,1\t10\tRingo_DefaultSkin\tmesh\tCharacters/Ringo/Art/ringo.mesh\tbuild://Characters/Ringo/Art/ringo.mesh\tm1\tyes\tlinked/ringo.mesh
Characters/Ringo/Ringo.def\th1\t0,1\t11\tRingo_DefaultSkin\tskeleton\tCharacters/Ringo/Art/ringo.skeleton\tbuild://Characters/Ringo/Art/ringo.skeleton\ts1\tyes\tlinked/ringo.skeleton
Characters/Ringo/Ringo.def\th1\t0,1\t12\tAttack\tanimation\tCharacters/Ringo/Art/ringo.attack.anim\tbuild://Characters/Ringo/Art/ringo.attack.anim\ta1\tyes\tlinked/ringo.attack.anim
`;

test("buildDefinitionManifestChainRows joins manifest entries to child resources", () => {
  const rows = buildDefinitionManifestChainRows(parseTsv(tsv));
  const ringo = rows.find((row) => row.manifestLabel === "*Ringo*");

  assert.equal(rows.length, 2);
  assert.equal(ringo.targetFamily, "character");
  assert.equal(ringo.meshCount, 1);
  assert.equal(ringo.skeletonCount, 1);
  assert.equal(ringo.animationCount, 1);
  assert.match(ringo.meshSamples, /ringo\.mesh/);
});

test("exportDefinitionManifestChainReport writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-manifest-chain-"));
  const linksPath = path.join(tempDir, "definition_build_links.tsv");
  const reportDir = path.join(tempDir, "reports");
  fs.writeFileSync(linksPath, tsv);

  const summary = exportDefinitionManifestChainReport({
    linksPath,
    tsvOut: path.join(reportDir, "definition_manifest_chain.tsv"),
    jsonOut: path.join(reportDir, "definition_manifest_chain_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.withMeshes, 1);
  const report = fs.readFileSync(path.join(reportDir, "definition_manifest_chain.tsv"), "utf8");
  assert.match(report, /Characters\/Ringo\/Ringo\.def/);
  assert.match(report, /Ringo_DefaultSkin/);
});
