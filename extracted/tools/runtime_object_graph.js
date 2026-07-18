#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultAllPbrManifestPath = "extracted/viewer/all-glb-pbr-manifest.json";
const defaultInstanceStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultNativeConsumersPath = "extracted/reports/native_skinrep_consumers.tsv";
const defaultViewerOut = "extracted/viewer/runtime-object-graph.json";
const defaultTsvOut = "extracted/reports/runtime_object_graph.tsv";
const defaultJsonOut = "extracted/reports/runtime_object_graph_summary.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJsonItems(filePath) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(json) ? json : json.items || [];
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

function tsvEscape(value) {
  return Array.isArray(value)
    ? value.join("|").replace(/\t/g, " ").replace(/\r?\n/g, " ")
    : String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeResourcePath(value) {
  return String(value || "")
    .replace(/^build:\/\//, "")
    .replace(/^\/+/, "");
}

function meshPathForItem(item) {
  return item?.sourceMeshPath || item?.meshPath || item?.resolvedMeshPath || String(item?.rel || "").replace(/\.glb$/i, ".mesh");
}

function glbRelFromMeshPath(meshPath) {
  return String(meshPath || "").replace(/\.mesh$/i, ".glb");
}

function classifyRuntimeObjectKind(item) {
  const rel = item?.rel || "";
  const variant = item?.variant || item?.modelLabel || "";
  const text = `${rel} ${variant}`;
  if (/^Characters\/Attachments\//.test(rel)) return "attachment";
  if (/^Characters\/SetDressing\//.test(rel)) return "set-dressing";
  if (/^Characters\/(?:Cards|CardsChest|Coins|GuildBanners|AscensionDial|Crucible)\//.test(rel)) return "menu-prop";
  if (/JoystickIndicator|moveCursor/i.test(text)) return "input-indicator";
  if (/visionTotem|Totem/i.test(text)) return "totem";
  if (/ArtTrap|Trap/i.test(text)) return "trap";
  if (/ArtWall|Wall/i.test(text)) return "wall";
  if (/ArtGoop|Goop/i.test(text)) return "goop";
  if (/ArtArena|Arena/i.test(text)) return "arena";
  if (/ArtZombie|Zombie/i.test(text)) return "zombie";
  if (/ArtShield|Shield/i.test(text)) return "shield";
  if (/ArtBlade|Blade/i.test(text)) return "blade";
  if (/ArtSpirit|Spirit/i.test(text)) return "spirit";
  if (/ArtSeed|Seed/i.test(text)) return "seed";
  if (/ArtMinion|Minion/i.test(text)) return "minion";
  if (/Pet/i.test(text)) return "pet";
  if (/Ball/i.test(text)) return "ball";
  if (/ArtTornado|Tornado/i.test(text)) return "tornado";
  if (/ArtCloth|Cloth/i.test(text)) return "cloth";
  if (/Turret|Store|Vain(?:5v5)?(?:Home|Away)|Node5v5Home/i.test(text)) return "structure";
  if (/Kraken|Blackclaw|JungleHeal|Treant/i.test(text)) return "jungle-creature";
  if (/Pack(?:Ally|Enemy)?|FortressMinion/i.test(text)) return "minion";
  if (/Star|Cauldron|BlackHole|Shard|Clam|Devilray|FishFood/i.test(text)) return "summon";
  return "";
}

function isRuntimeObjectCandidate(item) {
  if (!item?.rel?.startsWith("Characters/")) return false;
  return Boolean(classifyRuntimeObjectKind(item));
}

function resourcePathForRow(row) {
  return normalizeResourcePath(row.targetRelativePath || row.value || row.targetBuildPath);
}

function nativeBuildResourcePaths(row) {
  return unique(
    String(row?.stringLiterals || "")
      .split("|")
      .map(normalizeResourcePath)
      .filter((value) => /^Characters\/.+\.(?:mesh|skeleton|anim|pfx)$/i.test(value)),
  );
}

function meshPrefix(meshPath) {
  return String(meshPath || "").replace(/\.mesh$/i, "");
}

function nativeResourcePathsForMesh(nativeRows, meshPath) {
  const prefix = meshPrefix(meshPath);
  const matchedRows = [];
  const paths = [];
  const seen = new Set();

  for (const row of nativeRows || []) {
    if (row.anchorKinds !== "build-resource") continue;
    const relevantPaths = nativeBuildResourcePaths(row).filter((resourcePath) => {
      if (resourcePath === meshPath) return true;
      if (resourcePath === `${prefix}.skeleton`) return true;
      return resourcePath.startsWith(`${prefix}.`) && /\.(?:anim|pfx)$/i.test(resourcePath);
    });
    if (!relevantPaths.length) continue;
    matchedRows.push(row);
    for (const resourcePath of relevantPaths) {
      if (seen.has(resourcePath)) continue;
      seen.add(resourcePath);
      paths.push(resourcePath);
    }
  }

  return { matchedRows, paths };
}

function instanceKey(row) {
  return `${row.relativePath}\t${row.blockIndex}`;
}

function groupRowsByBlock(stringRows) {
  const groups = new Map();
  for (const row of stringRows || []) {
    const key = instanceKey(row);
    const rows = groups.get(key) || [];
    rows.push(row);
    groups.set(key, rows);
  }
  return groups;
}

function meshReferenceIndex(stringRows) {
  const index = new Map();
  for (const row of stringRows || []) {
    if (row.semantic !== "resource" || row.resourceCategory !== "mesh") continue;
    const meshPath = resourcePathForRow(row);
    if (!meshPath) continue;
    const rows = index.get(meshPath) || [];
    rows.push(row);
    index.set(meshPath, rows);
  }
  return index;
}

function labelsFromRows(rows) {
  return unique((rows || []).filter((row) => row.semantic === "label").map((row) => row.value));
}

function resourcePathsByCategory(rows, category) {
  return unique(
    (rows || [])
      .filter((row) => row.semantic === "resource" && row.resourceCategory === category)
      .map(resourcePathForRow),
  );
}

function skinLabelsFromRows(rows) {
  return labelsFromRows(rows).filter((label) => /_DefaultSkin$|_Skin_/i.test(label));
}

function abilityLabelsFromRows(rows) {
  return labelsFromRows(rows).filter((label) => /^Ability__|^Buff_/i.test(label));
}

function runtimeConfidenceForObject({ skeletonPaths, animationPaths, effectPaths }) {
  if (skeletonPaths.length && animationPaths.length && effectPaths.length) return 0.95;
  if (skeletonPaths.length && animationPaths.length) return 0.9;
  if (skeletonPaths.length) return 0.8;
  if (animationPaths.length || effectPaths.length) return 0.75;
  return 0.65;
}

function runtimeObjectItem({ pbrItem, meshRow, blockRows }) {
  const labels = labelsFromRows(blockRows);
  const meshPaths = resourcePathsByCategory(blockRows, "mesh");
  const skeletonPaths = resourcePathsByCategory(blockRows, "skeleton");
  const animationPaths = resourcePathsByCategory(blockRows, "animation");
  const effectPaths = resourcePathsByCategory(blockRows, "effect");
  const ownerLabels = unique([meshRow.labelBefore, ...skinLabelsFromRows(blockRows)]);

  return {
    rel: pbrItem.rel || glbRelFromMeshPath(meshPathForItem(pbrItem)),
    character: pbrItem.character || String(pbrItem.rel || "").match(/^Characters\/([^/]+)\//)?.[1] || "",
    variant: pbrItem.variant || pbrItem.modelLabel || "",
    objectKind: classifyRuntimeObjectKind(pbrItem),
    sourceRelativePath: meshRow.relativePath,
    runtimeBlockIndex: Number(meshRow.blockIndex),
    runtimeConfidence: runtimeConfidenceForObject({ skeletonPaths, animationPaths, effectPaths }),
    ownerLabels,
    objectLabels: labels.slice(0, 16),
    abilityLabels: abilityLabelsFromRows(blockRows),
    meshPaths,
    skeletonPaths,
    animationPaths,
    effectPaths,
    meshStringIndex: Number(meshRow.stringIndex),
    evidence: {
      definitionHash: meshRow.hash || "",
      payloadSize: Number(meshRow.payloadSize || 0),
      resourceCounts: {
        mesh: meshPaths.length,
        skeleton: skeletonPaths.length,
        animation: animationPaths.length,
        effect: effectPaths.length,
      },
    },
  };
}

function nativeRuntimeObjectItem({ pbrItem, nativeRows }) {
  const meshPath = meshPathForItem(pbrItem);
  const { matchedRows, paths } = nativeResourcePathsForMesh(nativeRows, meshPath);
  if (!matchedRows.length || !paths.includes(meshPath)) return null;

  const meshPaths = unique(paths.filter((resourcePath) => /\.mesh$/i.test(resourcePath)));
  const skeletonPaths = unique(paths.filter((resourcePath) => /\.skeleton$/i.test(resourcePath)));
  const animationPaths = unique(paths.filter((resourcePath) => /\.anim$/i.test(resourcePath)));
  const effectPaths = unique(paths.filter((resourcePath) => /\.pfx$/i.test(resourcePath)));
  const sourceRelativePath = unique(
    matchedRows.map((row) => `native:${row.platform || "unknown"}:${row.functionName || "unknown"}`),
  ).join("|");
  const lineNumbers = matchedRows.map((row) => Number(row.line)).filter(Number.isFinite);
  const firstLine = lineNumbers.length ? Math.min(...lineNumbers) : 0;

  return {
    rel: pbrItem.rel || glbRelFromMeshPath(meshPathForItem(pbrItem)),
    character: pbrItem.character || String(pbrItem.rel || "").match(/^Characters\/([^/]+)\//)?.[1] || "",
    variant: pbrItem.variant || pbrItem.modelLabel || "",
    objectKind: classifyRuntimeObjectKind(pbrItem),
    sourceRelativePath,
    runtimeBlockIndex: firstLine,
    runtimeConfidence: runtimeConfidenceForObject({ skeletonPaths, animationPaths, effectPaths }),
    ownerLabels: unique(matchedRows.map((row) => row.functionName)),
    objectLabels: unique(matchedRows.flatMap((row) => [row.focusTypes, row.fieldRefs])).slice(0, 16),
    abilityLabels: [],
    meshPaths,
    skeletonPaths,
    animationPaths,
    effectPaths,
    meshStringIndex: firstLine,
    evidence: {
      definitionHash: "",
      payloadSize: 0,
      nativeConsumerCount: matchedRows.length,
      nativePlatforms: unique(matchedRows.map((row) => row.platform)),
      nativeFunctions: unique(matchedRows.map((row) => row.functionName)),
      resourceCounts: {
        mesh: meshPaths.length,
        skeleton: skeletonPaths.length,
        animation: animationPaths.length,
        effect: effectPaths.length,
      },
    },
  };
}

function dedupeRuntimeObjectItems(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = `${item.rel}\t${item.sourceRelativePath}\t${item.ownerLabels.join("|")}`;
    const rows = groups.get(key) || [];
    rows.push(item);
    groups.set(key, rows);
  }

  const output = [];
  for (const rows of groups.values()) {
    rows.sort(compareRuntimeObjectCandidates);
    output.push(rows[0]);
  }

  return output.sort((left, right) => {
    if (left.objectKind !== right.objectKind) return left.objectKind.localeCompare(right.objectKind);
    if (left.rel !== right.rel) return left.rel.localeCompare(right.rel);
    return `${left.sourceRelativePath}:${left.runtimeBlockIndex}`.localeCompare(`${right.sourceRelativePath}:${right.runtimeBlockIndex}`);
  });
}

function compareRuntimeObjectCandidates(left, right) {
  const confidenceOrder = right.runtimeConfidence - left.runtimeConfidence;
  if (confidenceOrder) return confidenceOrder;
  const leftResourceCount = Object.values(left.evidence?.resourceCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const rightResourceCount = Object.values(right.evidence?.resourceCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  const resourceOrder = rightResourceCount - leftResourceCount;
  if (resourceOrder) return resourceOrder;
  return Number(right.runtimeBlockIndex || 0) - Number(left.runtimeBlockIndex || 0);
}

function buildRuntimeObjectGraph({ allPbrItems, stringRows, nativeRows = [], generatedAt = new Date().toISOString() }) {
  const rowsByBlock = groupRowsByBlock(stringRows);
  const meshRefs = meshReferenceIndex(stringRows);
  const items = [];

  for (const pbrItem of allPbrItems || []) {
    if (!isRuntimeObjectCandidate(pbrItem)) continue;
    const meshPath = meshPathForItem(pbrItem);
    let matchedDefinition = false;
    for (const meshRow of meshRefs.get(meshPath) || []) {
      matchedDefinition = true;
      const blockRows = rowsByBlock.get(instanceKey(meshRow)) || [];
      items.push(runtimeObjectItem({ pbrItem, meshRow, blockRows }));
    }
    if (!matchedDefinition) {
      const nativeItem = nativeRuntimeObjectItem({ pbrItem, nativeRows });
      if (nativeItem) items.push(nativeItem);
    }
  }

  const dedupedItems = dedupeRuntimeObjectItems(items);
  return {
    generatedAt,
    count: dedupedItems.length,
    withSkeletons: dedupedItems.filter((item) => item.skeletonPaths.length).length,
    withAnimations: dedupedItems.filter((item) => item.animationPaths.length).length,
    withEffects: dedupedItems.filter((item) => item.effectPaths.length).length,
    items: dedupedItems,
  };
}

function runtimeObjectGraphRows(graph) {
  return (graph.items || []).map((item) => ({
    rel: item.rel,
    character: item.character,
    variant: item.variant,
    objectKind: item.objectKind,
    sourceRelativePath: item.sourceRelativePath,
    runtimeBlockIndex: item.runtimeBlockIndex,
    runtimeConfidence: item.runtimeConfidence,
    ownerLabels: item.ownerLabels,
    objectLabels: item.objectLabels,
    abilityLabels: item.abilityLabels,
    meshPaths: item.meshPaths,
    skeletonPaths: item.skeletonPaths,
    animationPaths: item.animationPaths,
    effectPaths: item.effectPaths,
    meshStringIndex: item.meshStringIndex,
  }));
}

function summarizeRuntimeObjectGraph(graph) {
  const byObjectKind = {};
  for (const item of graph.items || []) byObjectKind[item.objectKind] = (byObjectKind[item.objectKind] || 0) + 1;
  return {
    items: graph.count,
    withSkeletons: graph.withSkeletons,
    withAnimations: graph.withAnimations,
    withEffects: graph.withEffects,
    byObjectKind: Object.fromEntries(Object.entries(byObjectKind).sort(([left], [right]) => left.localeCompare(right))),
  };
}

const columns = [
  "rel",
  "character",
  "variant",
  "objectKind",
  "sourceRelativePath",
  "runtimeBlockIndex",
  "runtimeConfidence",
  "ownerLabels",
  "objectLabels",
  "abilityLabels",
  "meshPaths",
  "skeletonPaths",
  "animationPaths",
  "effectPaths",
  "meshStringIndex",
];

function exportRuntimeObjectGraph({
  allPbrManifestPath = defaultAllPbrManifestPath,
  instanceStringsPath = defaultInstanceStringsPath,
  nativeConsumersPath = defaultNativeConsumersPath,
  viewerOut = defaultViewerOut,
  tsvOut = defaultTsvOut,
  jsonOut = defaultJsonOut,
} = {}) {
  const graph = buildRuntimeObjectGraph({
    allPbrItems: readJsonItems(allPbrManifestPath),
    stringRows: readTsv(instanceStringsPath),
    nativeRows: fs.existsSync(nativeConsumersPath) ? readTsv(nativeConsumersPath) : [],
  });
  const summary = summarizeRuntimeObjectGraph(graph);

  fs.mkdirSync(path.dirname(viewerOut), { recursive: true });
  fs.writeFileSync(viewerOut, `${JSON.stringify({ generatedAt: graph.generatedAt, summary, items: graph.items }, null, 2)}\n`);
  writeTsv(tsvOut, runtimeObjectGraphRows(graph), columns);
  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: graph.generatedAt, summary }, null, 2)}\n`);

  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const summary = exportRuntimeObjectGraph({
    allPbrManifestPath: optionValue(args, "--all-pbr-manifest", defaultAllPbrManifestPath),
    instanceStringsPath: optionValue(args, "--instance-strings", defaultInstanceStringsPath),
    nativeConsumersPath: optionValue(args, "--native-consumers", defaultNativeConsumersPath),
    viewerOut: optionValue(args, "--viewer-out", defaultViewerOut),
    tsvOut: optionValue(args, "--tsv-out", defaultTsvOut),
    jsonOut: optionValue(args, "--json-out", defaultJsonOut),
  });
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  buildRuntimeObjectGraph,
  classifyRuntimeObjectKind,
  exportRuntimeObjectGraph,
  runtimeObjectGraphRows,
  summarizeRuntimeObjectGraph,
};
