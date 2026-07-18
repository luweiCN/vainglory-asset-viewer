#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { parseSkeletonFile, summarizeMeshSkin } = require("./skeleton_tools");

const DEFAULT_SKELETON_ROOT = "extracted/hero_assets/skeletons";
const DEFAULT_MESH_ROOT = "extracted/hero_assets/meshes";
const DEFAULT_JSON_ROOT = "extracted/hero_assets_skeletons_json";
const DEFAULT_SKELETON_REPORT = "extracted/reports/skeleton_summary.tsv";
const DEFAULT_SKIN_REPORT = "extracted/reports/mesh_skin_summary.tsv";
const DEFAULT_VIEWER_MANIFEST = "extracted/viewer/skeleton-manifest.json";

function walkFiles(root, extension) {
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(entryPath);
    }
  }
  return output.sort();
}

function normalizeRel(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseArgs(argv) {
  const options = {
    skeletonRoot: DEFAULT_SKELETON_ROOT,
    meshRoot: DEFAULT_MESH_ROOT,
    jsonRoot: DEFAULT_JSON_ROOT,
    skeletonReport: DEFAULT_SKELETON_REPORT,
    skinReport: DEFAULT_SKIN_REPORT,
    viewerManifest: DEFAULT_VIEWER_MANIFEST,
  };

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${key}`);
    if (key === "--skeleton-root") options.skeletonRoot = value;
    else if (key === "--mesh-root") options.meshRoot = value;
    else if (key === "--json-root") options.jsonRoot = value;
    else if (key === "--skeleton-report") options.skeletonReport = value;
    else if (key === "--skin-report") options.skinReport = value;
    else if (key === "--viewer-manifest") options.viewerManifest = value;
    else throw new Error(`unknown option: ${key}`);
  }

  return options;
}

function exportSkeletons(options) {
  const skeletonFiles = walkFiles(options.skeletonRoot, ".skeleton");
  const rows = ["skeleton\tboneCount\trootCount\tleafCount\tmaxChildren\tjson"];
  const manifestItems = [];
  let converted = 0;

  for (const skeletonPath of skeletonFiles) {
    const skeleton = parseSkeletonFile(skeletonPath);
    const rel = normalizeRel(path.relative(options.skeletonRoot, skeletonPath));
    const outputPath = normalizeRel(path.join(options.jsonRoot, rel.replace(/\.skeleton$/i, ".json")));
    const childCounts = Array.from({ length: skeleton.boneCount }, () => 0);
    for (const bone of skeleton.bones) {
      if (bone.parent >= 0) childCounts[bone.parent] += 1;
    }
    const rootCount = skeleton.bones.filter((bone) => bone.parent < 0).length;
    const leafCount = childCounts.filter((count) => count === 0).length;
    const maxChildren = Math.max(...childCounts);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(skeleton, null, 2)}\n`);
    rows.push([rel, skeleton.boneCount, rootCount, leafCount, maxChildren, outputPath].join("\t"));
    manifestItems.push({
      rel: rel.replace(/\.skeleton$/i, ".json"),
      boneCount: skeleton.boneCount,
      rootCount,
      leafCount,
    });
    converted += 1;
  }

  fs.mkdirSync(path.dirname(options.skeletonReport), { recursive: true });
  fs.writeFileSync(options.skeletonReport, `${rows.join("\n")}\n`);
  fs.mkdirSync(path.dirname(options.viewerManifest), { recursive: true });
  fs.writeFileSync(
    options.viewerManifest,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: manifestItems.length, items: manifestItems }, null, 2)}\n`,
  );
  return converted;
}

function exportMeshSkinReport(options) {
  const meshFiles = walkFiles(options.meshRoot, ".mesh");
  const rows = [
    "mesh\tvertexCount\tindexCount\tstride\thasSkin\tmaxJoint\tinvalidWeightCount\tuniqueJointTriplets\ttopJointTriplet\terror",
  ];
  let skinned = 0;
  let failed = 0;

  for (const meshPath of meshFiles) {
    const rel = normalizeRel(path.relative(options.meshRoot, meshPath));
    try {
      const summary = summarizeMeshSkin(meshPath);
      if (summary.hasSkin) skinned += 1;
      rows.push(
        [
          rel,
          summary.vertexCount,
          summary.indexCount || "",
          summary.stride || "",
          summary.hasSkin,
          summary.maxJoint ?? "",
          summary.invalidWeightCount ?? "",
          summary.uniqueJointTriplets ?? "",
          summary.topJointTriplets?.[0]?.joints || "",
          "",
        ].join("\t"),
      );
    } catch (error) {
      failed += 1;
      rows.push([rel, "", "", "", false, "", "", "", "", error.message].join("\t"));
    }
  }

  fs.mkdirSync(path.dirname(options.skinReport), { recursive: true });
  fs.writeFileSync(options.skinReport, `${rows.join("\n")}\n`);
  return { meshes: meshFiles.length, skinned, failed };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const skeletons = exportSkeletons(options);
  const skins = exportMeshSkinReport(options);
  console.log(`skeletons=${skeletons}`);
  console.log(`meshes=${skins.meshes} skinned=${skins.skinned} failed=${skins.failed}`);
  console.log(`jsonRoot=${options.jsonRoot}`);
  console.log(`skeletonReport=${options.skeletonReport}`);
  console.log(`skinReport=${options.skinReport}`);
  console.log(`viewerManifest=${options.viewerManifest}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  exportMeshSkinReport,
  exportSkeletons,
};
