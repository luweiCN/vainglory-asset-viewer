const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const viewerDir = path.join(repoRoot, "extracted", "viewer");
const reportsDir = path.join(repoRoot, "extracted", "reports");
const outputPath = path.join(reportsDir, "viewer_asset_coverage_issues.tsv");

const manifests = {
  skinned: ["skinned-glb-pbr-manifest.json", "hero_assets_glb_skinned_pbr"],
  pbr: ["skin-glb-pbr-manifest.json", "hero_assets_glb_textured_pbr"],
  all: ["all-glb-pbr-manifest.json", "all_assets_glb_textured_pbr"],
  textured: ["textured-glb-mtl-manifest.json", "hero_assets_glb_textured_mtl"],
  glb: ["glb-manifest.json", "hero_assets_glb"],
  obj: ["obj-manifest.json", "hero_assets_obj"],
};

function readItems(fileName) {
  const filePath = path.join(viewerDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(manifest.items) ? manifest.items : [];
}

function tsv(value) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ");
}

function issueRow(status, format, item, detail = "") {
  const materialCount = Number(item.materialCount) || 0;
  const texturedMaterialCount = Number(item.texturedMaterialCount) || 0;
  return [
    status,
    format,
    item.character || "",
    item.modelLabel || item.variant || "",
    item.rel || "",
    materialCount,
    texturedMaterialCount,
    detail || Math.max(materialCount - texturedMaterialCount, 0),
  ]
    .map(tsv)
    .join("\t");
}

const rows = [];
const itemsByFormat = new Map();

for (const [format, [manifestFile, assetRoot]] of Object.entries(manifests)) {
  const items = readItems(manifestFile);
  itemsByFormat.set(format, items);

  for (const item of items) {
    const assetPath = path.join(repoRoot, "extracted", assetRoot, item.rel || "");
    const materialCount = Number(item.materialCount) || 0;
    const texturedMaterialCount = Number(item.texturedMaterialCount) || 0;

    if (!fs.existsSync(assetPath)) {
      rows.push(issueRow("missing_file", format, item, path.relative(repoRoot, assetPath)));
    } else if (materialCount > 0 && texturedMaterialCount === 0) {
      rows.push(issueRow("untextured", format, item));
    } else if (materialCount > 0 && texturedMaterialCount < materialCount) {
      rows.push(issueRow("partial", format, item));
    }
  }
}

const skinnedRels = new Set((itemsByFormat.get("skinned") || []).map((item) => item.rel));
for (const item of itemsByFormat.get("pbr") || []) {
  if (!skinnedRels.has(item.rel)) rows.push(issueRow("missing_skinned", "skinned", item, "not in skinned preview manifest"));
}

rows.sort((left, right) => left.localeCompare(right));

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  ["status\tformat\tcharacter\tmodel\tpath\tmaterials\ttextured_materials\tmissing_textures", ...rows].join("\n") + "\n",
);

const counts = rows.reduce((summary, row) => {
  const status = row.slice(0, row.indexOf("\t"));
  summary[status] = (summary[status] || 0) + 1;
  return summary;
}, {});

console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
console.log(JSON.stringify(counts, null, 2));
