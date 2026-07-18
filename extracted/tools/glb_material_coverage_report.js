#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultManifestPath = "extracted/viewer/all-glb-pbr-manifest.json";
const defaultGlbRoot = "extracted/hero_assets_glb_textured_pbr";
const defaultTsvOut = "extracted/reports/glb_material_coverage.tsv";
const defaultJsonOut = "extracted/reports/glb_material_coverage_summary.json";
const defaultViewerOut = "extracted/viewer/glb-material-coverage.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readManifestItems(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 20 || buffer.toString("utf8", 0, 4) !== "glTF") {
    throw new Error(`${filePath} is not a GLB file`);
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`${filePath} has unsupported GLB version ${version}`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(buffer.toString("utf8", offset, offset + chunkLength));
    }
    offset += chunkLength;
  }
  throw new Error(`${filePath} does not contain a JSON chunk`);
}

function numberList(value) {
  return Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
}

function colorHex(factor) {
  const values = numberList(factor);
  if (values.length < 3) return "";
  return `#${values
    .slice(0, 3)
    .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function alphaFactor(factor) {
  const values = numberList(factor);
  return values.length >= 4 ? values[3] : 1;
}

function looksPaleColorOnly(material) {
  if (isAlphaEffectMaterial(material)) return false;
  const baseColorFactor = material?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const values = numberList(baseColorFactor);
  if (values.length < 3 || alphaFactor(baseColorFactor) < 0.5) return false;
  return values[0] > 0.78 && values[1] > 0.72 && values[2] > 0.62;
}

function isAlphaEffectMaterial(material) {
  const name = String(material?.name || "").toLowerCase();
  return material?.alphaMode === "BLEND" && /swipe|trail|slash|glow|fx|effect/.test(name);
}

function textureImageName(glbJson, textureInfo) {
  const texture = glbJson.textures?.[textureInfo?.index];
  const image = glbJson.images?.[texture?.source];
  return image?.name || image?.uri || image?.mimeType || "";
}

function materialCoverageClass(glbJson, material) {
  const pbr = material?.pbrMetallicRoughness || {};
  if (pbr.baseColorTexture) return "basecolor-textured";
  if (material?.emissiveTexture || material?.normalTexture || pbr.metallicRoughnessTexture) return "non-basecolor-textured";
  if (isAlphaEffectMaterial(material)) return "alpha-effect-color";
  if (looksPaleColorOnly(material)) return "pale-color-only";
  return "color-only";
}

function materialRowsForGlb(item, glbJson, glbFilePath) {
  const materials = glbJson.materials || [];
  if (!materials.length) {
    return [
      {
        rel: item.rel || "",
        modelLabel: item.modelLabel || item.variant || "",
        character: item.character || "",
        sourceRelativePath: item.sourceRelativePath || "",
        glbFilePath,
        materialIndex: "",
        materialName: "",
        coverageClass: "no-materials",
        hasBaseColorTexture: "no",
        baseColorTexture: "",
        baseColorFactor: "",
        baseColorHex: "",
        alphaMode: "",
        hasNormalTexture: "no",
        hasMetallicRoughnessTexture: "no",
        hasEmissiveTexture: "no",
        looksPale: "no",
      },
    ];
  }
  return materials.map((material, materialIndex) => {
    const pbr = material.pbrMetallicRoughness || {};
    const baseColorFactor = pbr.baseColorFactor || [1, 1, 1, 1];
    return {
      rel: item.rel || "",
      modelLabel: item.modelLabel || item.variant || "",
      character: item.character || "",
      sourceRelativePath: item.sourceRelativePath || "",
      glbFilePath,
      materialIndex,
      materialName: material.name || "",
      coverageClass: materialCoverageClass(glbJson, material),
      hasBaseColorTexture: pbr.baseColorTexture ? "yes" : "no",
      baseColorTexture: textureImageName(glbJson, pbr.baseColorTexture),
      baseColorFactor: numberList(baseColorFactor).join(","),
      baseColorHex: colorHex(baseColorFactor),
      alphaMode: material.alphaMode || "OPAQUE",
      hasNormalTexture: material.normalTexture ? "yes" : "no",
      hasMetallicRoughnessTexture: pbr.metallicRoughnessTexture ? "yes" : "no",
      hasEmissiveTexture: material.emissiveTexture ? "yes" : "no",
      looksPale: !pbr.baseColorTexture && looksPaleColorOnly(material) ? "yes" : "no",
    };
  });
}

function buildGlbMaterialCoverageRows({ manifestItems = [], glbRoot = defaultGlbRoot } = {}) {
  const rows = [];
  for (const item of manifestItems || []) {
    if (!item?.rel || !/\.glb$/i.test(item.rel)) continue;
    const glbFilePath = path.join(glbRoot, item.rel);
    if (!fs.existsSync(glbFilePath)) {
      rows.push({
        rel: item.rel,
        modelLabel: item.modelLabel || item.variant || "",
        character: item.character || "",
        sourceRelativePath: item.sourceRelativePath || "",
        glbFilePath,
        materialIndex: "",
        materialName: "",
        coverageClass: "missing-glb",
        hasBaseColorTexture: "no",
        baseColorTexture: "",
        baseColorFactor: "",
        baseColorHex: "",
        alphaMode: "",
        hasNormalTexture: "no",
        hasMetallicRoughnessTexture: "no",
        hasEmissiveTexture: "no",
        looksPale: "no",
      });
      continue;
    }
    rows.push(...materialRowsForGlb(item, readGlbJson(glbFilePath), glbFilePath));
  }
  return rows.sort(
    (left, right) =>
      String(left.rel).localeCompare(String(right.rel)) || Number(left.materialIndex || 0) - Number(right.materialIndex || 0),
  );
}

function summarizeGlbMaterialCoverageRows(rows) {
  const byCoverageClass = {};
  const byModel = new Map();
  for (const row of rows || []) {
    byCoverageClass[row.coverageClass] = (byCoverageClass[row.coverageClass] || 0) + 1;
    if (!byModel.has(row.rel)) {
      byModel.set(row.rel, { rel: row.rel, modelLabel: row.modelLabel, materialRows: 0, paleRows: 0, baseColorTexturedRows: 0 });
    }
    const model = byModel.get(row.rel);
    model.materialRows += row.coverageClass === "no-materials" || row.coverageClass === "missing-glb" ? 0 : 1;
    if (row.looksPale === "yes") model.paleRows += 1;
    if (row.hasBaseColorTexture === "yes") model.baseColorTexturedRows += 1;
  }
  const paleModelRows = [...byModel.values()].filter((model) => model.paleRows > 0);
  return {
    rows: rows.length,
    models: byModel.size,
    materialRows: rows.filter((row) => row.materialIndex !== "").length,
    baseColorTexturedRows: rows.filter((row) => row.hasBaseColorTexture === "yes").length,
    paleColorOnlyRows: rows.filter((row) => row.coverageClass === "pale-color-only").length,
    paleModelRows: paleModelRows.length,
    byCoverageClass: Object.fromEntries(Object.entries(byCoverageClass).sort(([left], [right]) => left.localeCompare(right))),
    paleModels: paleModelRows
      .sort((left, right) => right.paleRows - left.paleRows || left.rel.localeCompare(right.rel))
      .slice(0, 50),
  };
}

const columns = [
  "rel",
  "modelLabel",
  "character",
  "sourceRelativePath",
  "glbFilePath",
  "materialIndex",
  "materialName",
  "coverageClass",
  "hasBaseColorTexture",
  "baseColorTexture",
  "baseColorFactor",
  "baseColorHex",
  "alphaMode",
  "hasNormalTexture",
  "hasMetallicRoughnessTexture",
  "hasEmissiveTexture",
  "looksPale",
];

function exportGlbMaterialCoverageReport({
  manifestPath = defaultManifestPath,
  glbRoot = defaultGlbRoot,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
  viewerOut = defaultViewerOut,
} = {}) {
  const rows = buildGlbMaterialCoverageRows({ manifestItems: readManifestItems(manifestPath), glbRoot });
  const summary = summarizeGlbMaterialCoverageRows(rows);
  writeTsv(tsvOut, rows, columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(`${viewerOut}`, `${JSON.stringify({ generatedAt: new Date().toISOString(), summary, items: rows }, null, 2)}\n`);
  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportGlbMaterialCoverageReport({
    manifestPath: optionValue(args, "--manifest", defaultManifestPath),
    glbRoot: optionValue(args, "--glb-root", defaultGlbRoot),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildGlbMaterialCoverageRows,
  exportGlbMaterialCoverageReport,
  materialCoverageClass,
  readGlbJson,
  summarizeGlbMaterialCoverageRows,
};
