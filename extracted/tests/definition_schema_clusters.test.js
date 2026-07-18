const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDefinitionInstanceSummaries,
  buildDefinitionSchemaClusters,
  candidateKind,
  exportDefinitionSchemaClusters,
} = require("../tools/definition_schema_clusters");

function row(relativePath, blockIndex, stringIndex, semantic, value, resourceCategory = "") {
  return {
    relativePath,
    hash: `${relativePath}:${blockIndex}`,
    blockIndex,
    definitionFormatByte: 4,
    definitionVersionByte: 8,
    payloadSize: 4096,
    stringIndex,
    semantic,
    value,
    resourceCategory,
  };
}

test("candidateKind identifies runtime and attached component shapes", () => {
  assert.equal(
    candidateKind({ resourceCounts: { mesh: 1, skeleton: 1, animation: 6 }, bindTokenCount: 4 }),
    "character-runtime",
  );
  assert.equal(candidateKind({ resourceCounts: { mesh: 1 }, bindTokenCount: 1 }), "attached-mesh");
  assert.equal(candidateKind({ resourceCounts: { effect: 2 }, bindTokenCount: 1 }), "bound-effect");
});

test("buildDefinitionInstanceSummaries summarizes resources and bind tokens", () => {
  const summaries = buildDefinitionInstanceSummaries([
    row("Characters/Hero028/Lance.def", 0, 0, "label", "Lance_DefaultSkin"),
    row("Characters/Hero028/Lance.def", 0, 1, "resource", "build://Characters/Hero028/Art/hero028.mesh", "mesh"),
    row("Characters/Hero028/Lance.def", 0, 2, "resource", "build://Characters/Hero028/Art/hero028.skeleton", "skeleton"),
    row("Characters/Hero028/Lance.def", 0, 3, "resource", "build://Characters/Hero028/Art/hero028.attack.anim", "animation"),
    row("Characters/Hero028/Lance.def", 0, 4, "bind", "shield_bnd"),
    row("Characters/Hero028/Lance.def", 0, 5, "bind", "sword_bnd"),
  ]);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].candidateKind, "character-runtime");
  assert.equal(summaries[0].confidence, 0.85);
  assert.deepEqual(summaries[0].resourceCounts, { mesh: 1, skeleton: 1, animation: 1 });
  assert.deepEqual(summaries[0].bindTokens, ["shield_bnd", "sword_bnd"]);
});

test("buildDefinitionSchemaClusters groups repeated instance shapes", () => {
  const summaries = buildDefinitionInstanceSummaries([
    row("Characters/Hero021/Blackfeather.def", 0, 0, "resource", "build://Characters/Hero021/Art/hero021.mesh", "mesh"),
    row("Characters/Hero021/Blackfeather.def", 0, 1, "resource", "build://Characters/Hero021/Art/hero021.skeleton", "skeleton"),
    row("Characters/Hero021/Blackfeather.def", 0, 2, "resource", "build://Characters/Hero021/Art/hero021.attack.anim", "animation"),
    row("Characters/Hero021/Blackfeather.def", 0, 3, "bind", "rHandIK_bnd"),
    row("Characters/Hero028/Lance.def", 0, 0, "resource", "build://Characters/Hero028/Art/hero028.mesh", "mesh"),
    row("Characters/Hero028/Lance.def", 0, 1, "resource", "build://Characters/Hero028/Art/hero028.skeleton", "skeleton"),
    row("Characters/Hero028/Lance.def", 0, 2, "resource", "build://Characters/Hero028/Art/hero028.attack.anim", "animation"),
    row("Characters/Hero028/Lance.def", 0, 3, "bind", "shield_bnd"),
  ]);
  const clusters = buildDefinitionSchemaClusters(summaries);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].candidateKind, "character-runtime");
  assert.equal(clusters[0].instanceCount, 2);
  assert.equal(clusters[0].sourceCount, 2);
  assert.equal(clusters[0].bindTokens, "rHandIK_bnd|shield_bnd");
});

test("exportDefinitionSchemaClusters writes cluster TSV and sample JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-schema-clusters-"));
  const instanceStrings = path.join(tempDir, "strings.tsv");
  const clusterOut = path.join(tempDir, "clusters.tsv");
  const sampleOut = path.join(tempDir, "samples.json");

  fs.writeFileSync(
    instanceStrings,
    [
      [
        "relativePath",
        "hash",
        "blockIndex",
        "definitionFormatByte",
        "definitionVersionByte",
        "payloadSize",
        "stringIndex",
        "payloadOffset",
        "semantic",
        "labelBefore",
        "value",
        "resourceCategory",
        "targetRelativePath",
        "targetBuildPath",
      ].join("\t"),
      "Characters/Hero048/Kinetic.def\tSOURCE\t0\t4\t8\t4096\t0\t0\tresource\tKinetic_DefaultSkin\tbuild://Characters/Hero048/Art/hero048.mesh\tmesh\tCharacters/Hero048/Art/hero048.mesh\tbuild://Characters/Hero048/Art/hero048.mesh",
      "Characters/Hero048/Kinetic.def\tSOURCE\t0\t4\t8\t4096\t1\t48\tresource\tKinetic_DefaultSkin\tbuild://Characters/Hero048/Art/hero048.skeleton\tskeleton\tCharacters/Hero048/Art/hero048.skeleton\tbuild://Characters/Hero048/Art/hero048.skeleton",
      "Characters/Hero048/Kinetic.def\tSOURCE\t0\t4\t8\t4096\t2\t96\tresource\tAttack\tbuild://Characters/Hero048/Art/hero048.attack.anim\tanimation\tCharacters/Hero048/Art/hero048.attack.anim\tbuild://Characters/Hero048/Art/hero048.attack.anim",
      "Characters/Hero048/Kinetic.def\tSOURCE\t0\t4\t8\t4096\t3\t144\tbind\tBone_StaffEnergy\tstaff_bnd\t\t\t",
      "",
    ].join("\n"),
  );

  const summary = exportDefinitionSchemaClusters({ instanceStrings, clusterOut, sampleOut });

  assert.deepEqual(summary, { instances: 1, clusters: 1, highConfidenceInstances: 1 });
  assert.match(fs.readFileSync(clusterOut, "utf8"), /character-runtime/);
  assert.equal(JSON.parse(fs.readFileSync(sampleOut, "utf8")).samples[0].bindTokens[0], "staff_bnd");
});
