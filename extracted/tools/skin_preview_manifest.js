#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultGlbManifestPath = "extracted/viewer/textured-glb-pbr-manifest.json";
const defaultSkinSummaryPath = "extracted/reports/skin_model_summary.tsv";
const defaultAttachmentAnimationPath = "extracted/reports/animation_resource_index.tsv";
const defaultOutPath = "extracted/viewer/skin-glb-pbr-manifest.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function readTsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const columns = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}

function splitList(value) {
  return value ? value.split("|").filter(Boolean) : [];
}

function meshToGlbRel(meshPath) {
  return meshPath.replace(/\.mesh$/i, ".glb");
}

function attachmentLabel(rel) {
  return path.basename(rel, ".glb");
}

function isAttachmentItem(item) {
  return item.character === "Attachments" || item.rel?.startsWith("Characters/Attachments/");
}

function parseAttachmentAnimationPath(relativePath = "") {
  const match = /^(Characters\/Attachments\/.+\/Art)\/([^/.]+)\.([^/]+)\.anim$/i.exec(relativePath);
  if (!match) return null;
  return {
    rel: `${match[1]}/${match[2]}.glb`,
    modelLabel: match[3],
    animationPath: relativePath,
  };
}

function attachmentRecord(item, source, animationPath = "") {
  const record = {
    rel: item.rel,
    label: attachmentLabel(item.rel),
    source,
    assetRoot: source === "attachment-animation" ? "skinned" : "pbr",
  };
  if (animationPath) record.animationPath = animationPath;
  return record;
}

function pushAttachment(map, modelLabel, record) {
  if (!modelLabel) return;
  const key = modelLabel.toLowerCase();
  const records = map.get(key) || [];
  if (!records.some((item) => item.rel === record.rel)) records.push(record);
  map.set(key, records);
}

function buildAttachmentLookup(glbItems, attachmentAnimationRows = []) {
  const attachmentByRel = new Map(glbItems.filter(isAttachmentItem).map((item) => [item.rel, item]));
  const byModelLabel = new Map();

  for (const row of attachmentAnimationRows) {
    const parsed = parseAttachmentAnimationPath(row.relativePath || row.targetRelativePath || row.path || "");
    if (!parsed) continue;
    const item = attachmentByRel.get(parsed.rel);
    if (!item) continue;
    pushAttachment(byModelLabel, parsed.modelLabel, attachmentRecord(item, "attachment-animation", parsed.animationPath));
  }

  return { byModelLabel };
}

function attachmentsForSkin(item, attachmentLookup) {
  if (isAttachmentItem(item)) return [];
  const modelLabel = item.modelLabel || item.variant || "";
  const lowerModelLabel = modelLabel.toLowerCase();
  const output = [];
  const seen = new Set();

  for (const record of attachmentLookup.byModelLabel.get(lowerModelLabel) || []) {
    if (seen.has(record.rel)) continue;
    output.push(record);
    seen.add(record.rel);
  }

  return output;
}

function buildSkinPreviewManifest(glbManifest, skinRows, generatedAt = new Date().toISOString(), options = {}) {
  const glbByRel = new Map((glbManifest.items || []).map((item) => [item.rel, item]));
  const attachmentLookup = buildAttachmentLookup(glbManifest.items || [], options.attachmentAnimationRows || []);
  const usedRel = new Set();
  const enriched = [];
  const unmatchedSkinRows = [];

  for (const row of skinRows) {
    const meshPath = splitList(row.meshes)[0];
    const rel = meshToGlbRel(meshPath);
    const glbItem = glbByRel.get(rel);
    if (!glbItem) {
      unmatchedSkinRows.push({
        sourceRelativePath: row.sourceRelativePath,
        modelLabel: row.modelLabel,
        meshPath,
        rel,
      });
      continue;
    }

    usedRel.add(rel);
    const attachments = attachmentsForSkin({ ...glbItem, modelLabel: row.modelLabel }, attachmentLookup);
    enriched.push({
      ...glbItem,
      variant: row.modelLabel || glbItem.variant,
      modelLabel: row.modelLabel,
      sourceRelativePath: row.sourceRelativePath,
      meshPath,
      skeletons: splitList(row.skeletons),
      usesFallbackSkeleton: row.usesFallbackSkeleton === "yes",
      sameLabelAnimationCount: Number(row.sameLabelAnimationCount || 0),
      firstSameLabelAnimations: splitList(row.firstSameLabelAnimations),
      relationshipMatched: true,
      ...(attachments.length ? { attachments } : {}),
    });
  }

  const passthrough = (glbManifest.items || [])
    .filter((item) => !usedRel.has(item.rel))
    .map((item) => ({ ...item, relationshipMatched: false }));
  const items = [...enriched, ...passthrough].sort((left, right) => {
    const characterOrder = left.character.localeCompare(right.character);
    if (characterOrder) return characterOrder;
    return left.variant.localeCompare(right.variant);
  });

  return {
    generatedAt,
    source: glbManifest.source || "../hero_assets_glb_textured_pbr",
    count: items.length,
    skinCount: enriched.length,
    passthroughCount: passthrough.length,
    unmatchedSkinRows,
    items,
  };
}

function exportSkinPreviewManifest({ glbManifestPath, skinSummaryPath, attachmentAnimationPath, outPath }) {
  const manifest = buildSkinPreviewManifest(
    JSON.parse(fs.readFileSync(glbManifestPath, "utf8")),
    readTsv(skinSummaryPath),
    new Date().toISOString(),
    {
      attachmentAnimationRows:
        attachmentAnimationPath && fs.existsSync(attachmentAnimationPath) ? readTsv(attachmentAnimationPath) : [],
    },
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    count: manifest.count,
    skinCount: manifest.skinCount,
    passthroughCount: manifest.passthroughCount,
    unmatchedSkinRows: manifest.unmatchedSkinRows.length,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportSkinPreviewManifest({
    glbManifestPath: optionValue(args, "--glb-manifest", defaultGlbManifestPath),
    skinSummaryPath: optionValue(args, "--skin-summary", defaultSkinSummaryPath),
    attachmentAnimationPath: optionValue(args, "--attachment-animations", defaultAttachmentAnimationPath),
    outPath: optionValue(args, "--out", defaultOutPath),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildSkinPreviewManifest,
  exportSkinPreviewManifest,
  parseAttachmentAnimationPath,
  meshToGlbRel,
};
