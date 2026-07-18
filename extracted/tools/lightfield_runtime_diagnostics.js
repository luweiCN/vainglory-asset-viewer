#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultDefinitionBuildLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultJsonOut = "extracted/reports/lightfield_runtime_diagnostics.json";
const defaultTsvOut = "extracted/reports/lightfield_runtime_diagnostics.tsv";
const defaultViewerOut = "extracted/viewer/lightfield-runtime-diagnostics.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function rounded(value) {
  return Math.round(value * 1000000) / 1000000;
}

function tsvEscape(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => tsvEscape(row[column])).join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function readTsvRows(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split("\t");
  return lines.map((line) => {
    const parts = line.split("\t");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = parts[index] ?? "";
    return row;
  });
}

function parseNumberLine(line, expected, context) {
  const values = String(line || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  if (values.length !== expected || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${context}: expected ${expected} numbers, got ${values.length}`);
  }
  return values;
}

function emptyStats() {
  return { min: Infinity, max: -Infinity, sum: 0, count: 0 };
}

function pushStats(stats, value) {
  stats.min = Math.min(stats.min, value);
  stats.max = Math.max(stats.max, value);
  stats.sum += value;
  stats.count += 1;
}

function finishStats(stats) {
  if (!stats.count) return { min: null, max: null, avg: null };
  return {
    min: rounded(stats.min),
    max: rounded(stats.max),
    avg: rounded(stats.sum / stats.count),
  };
}

function parseLightfield(filePath) {
  const rawLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const bounds = parseNumberLine(lines[0], 4, `${filePath} bounds`);
  const dimensions = parseNumberLine(lines[1], 2, `${filePath} dimensions`).map((value) => Math.trunc(value));
  const [width, height] = dimensions;
  const dataLines = lines.slice(2);
  const expectedCells = width * height;
  const scalarStats = emptyStats();
  const sampleStats = Array.from({ length: 6 }, () => ({
    r: emptyStats(),
    g: emptyStats(),
    b: emptyStats(),
  }));
  let nonZeroCells = 0;
  let nonZeroSampleCells = 0;
  let invalidRows = 0;
  const sampleCells = [];

  for (let cellIndex = 0; cellIndex < dataLines.length; cellIndex += 1) {
    const values = dataLines[cellIndex].split(/\s+/).filter(Boolean).map(Number);
    if (values.length !== 19 || values.some((value) => !Number.isFinite(value))) {
      invalidRows += 1;
      continue;
    }
    const scalar = values[0];
    pushStats(scalarStats, scalar);
    let cellHasNonZeroSample = false;
    for (let sampleIndex = 0; sampleIndex < 6; sampleIndex += 1) {
      const base = 1 + sampleIndex * 3;
      const r = values[base];
      const g = values[base + 1];
      const b = values[base + 2];
      pushStats(sampleStats[sampleIndex].r, r);
      pushStats(sampleStats[sampleIndex].g, g);
      pushStats(sampleStats[sampleIndex].b, b);
      if (r !== 0 || g !== 0 || b !== 0) cellHasNonZeroSample = true;
    }
    if (scalar !== 0 || cellHasNonZeroSample) nonZeroCells += 1;
    if (cellHasNonZeroSample) nonZeroSampleCells += 1;
    if (
      cellIndex === 0 ||
      cellIndex === Math.floor(expectedCells / 2) ||
      cellIndex === expectedCells - 1
    ) {
      sampleCells.push({
        cellIndex,
        x: width ? cellIndex % width : 0,
        y: width ? Math.floor(cellIndex / width) : 0,
        scalar: rounded(scalar),
        probeSamplesRgb: Array.from({ length: 6 }, (_, sampleIndex) => {
          const base = 1 + sampleIndex * 3;
          return values.slice(base, base + 3).map(rounded);
        }),
      });
    }
  }

  return {
    filePath,
    bounds: {
      minX: rounded(bounds[0]),
      minY: rounded(bounds[1]),
      maxX: rounded(bounds[2]),
      maxY: rounded(bounds[3]),
    },
    dimensions: { width, height },
    expectedCells,
    dataRows: dataLines.length,
    invalidRows,
    rowShape: "1 scalar + 6 RGB probe triples",
    nativeParserMapping:
      "FUN_00f30528 parses each cell into six vec4 samples: the leading scalar becomes sample0.w, sample0 RGB follows it, and samples1..5 use RGB with w=0.",
    nativeSamplerMapping:
      "FUN_00f3032c clamps X/Z into the lightfield bounds, bilinearly blends the four neighboring cells for each of the six vec4 samples, then outputs component^2 * 0.5.",
    probableShaderMapping:
      "Probe.Samples[0..5] are derived by FUN_00f3032c from the six native vec4 samples; the leading scalar is sample0.w before the component^2 * 0.5 sampler transform.",
    nonZeroCells,
    nonZeroSampleCells,
    scalar: finishStats(scalarStats),
    probeSamplesRgb: sampleStats.map((stats, index) => ({
      index,
      r: finishStats(stats.r),
      g: finishStats(stats.g),
      b: finishStats(stats.b),
    })),
    sampleCells,
  };
}

function collectLightfieldLinks(definitionBuildLinksPath) {
  return readTsvRows(definitionBuildLinksPath)
    .filter((row) => row.label === "LightOmni" && /\.lightfield$/i.test(row.targetRelativePath || ""))
    .map((row) => ({
      relativePath: row.sourceRelativePath,
      hash: row.sourceHash,
      blockIndexes: row.blockIndexes,
      stringIndex: row.firstStringIndex,
      targetRelativePath: row.targetRelativePath,
      targetBuildPath: row.targetBuildPath,
      targetHash: row.targetHash,
      resolved: row.matched,
      resolvedPath: row.targetLinkedPath,
    }));
}

function summarizeByLightfield(links) {
  const byResolvedPath = new Map();
  for (const link of links) {
    const key = link.resolvedPath || link.targetRelativePath;
    if (!byResolvedPath.has(key)) byResolvedPath.set(key, []);
    byResolvedPath.get(key).push(link);
  }
  return [...byResolvedPath.entries()].map(([resolvedPath, groupedLinks]) => ({
    resolvedPath,
    targetRelativePath: groupedLinks[0]?.targetRelativePath || "",
    targetBuildPath: groupedLinks[0]?.targetBuildPath || "",
    targetHash: groupedLinks[0]?.targetHash || "",
    definitionCount: new Set(groupedLinks.map((link) => link.relativePath)).size,
    definitions: [...new Set(groupedLinks.map((link) => link.relativePath))].sort(),
    links: groupedLinks,
  }));
}

function buildLightfieldRuntimeDiagnostics({
  definitionBuildLinksPath = defaultDefinitionBuildLinksPath,
} = {}) {
  const links = collectLightfieldLinks(definitionBuildLinksPath);
  const lightfields = summarizeByLightfield(links).map((entry) => ({
    ...entry,
    parsed: entry.resolvedPath && fs.existsSync(entry.resolvedPath) ? parseLightfield(entry.resolvedPath) : null,
  }));
  return {
    source: {
      definitionBuildLinksPath,
    },
    summary: {
      links: links.length,
      lightfields: lightfields.length,
      parsedLightfields: lightfields.filter((entry) => entry.parsed).length,
      unresolvedLightfields: lightfields.filter((entry) => !entry.parsed).length,
      definitions: new Set(links.map((link) => link.relativePath)).size,
    },
    interpretation: [
      "LevelVisuals definitions reference LightOmni resources that resolve to .lightfield files.",
    "The .lightfield payloads are plain-text grids: bounds, width/height, then width*height rows.",
    "Each cell currently parses as 19 floats: one leading scalar plus six RGB triples.",
    "Android native FUN_00f30528 parses the leading scalar as sample0.w and the six RGB triples as six probe sample vectors.",
    "Android native FUN_00f3032c samples the grid using clamped X/Z, bilinear interpolation, and a component^2 * 0.5 output transform.",
    "This is evidence for the original scene/probe input source and sampler, but it is not applied to viewer rendering until the active preview profile and position source are proven.",
  ],
    lightfields,
  };
}

function rowsForTsv(manifest) {
  return (manifest.lightfields || []).map((entry) => ({
    targetRelativePath: entry.targetRelativePath,
    resolvedPath: entry.resolvedPath,
    definitionCount: entry.definitionCount,
    definitions: entry.definitions.join("|"),
    width: entry.parsed?.dimensions?.width ?? "",
    height: entry.parsed?.dimensions?.height ?? "",
    expectedCells: entry.parsed?.expectedCells ?? "",
    dataRows: entry.parsed?.dataRows ?? "",
    invalidRows: entry.parsed?.invalidRows ?? "",
    nonZeroCells: entry.parsed?.nonZeroCells ?? "",
    scalarMin: entry.parsed?.scalar?.min ?? "",
    scalarMax: entry.parsed?.scalar?.max ?? "",
    scalarAvg: entry.parsed?.scalar?.avg ?? "",
    sample0AvgRgb: entry.parsed
      ? [
          entry.parsed.probeSamplesRgb[0]?.r?.avg,
          entry.parsed.probeSamplesRgb[0]?.g?.avg,
          entry.parsed.probeSamplesRgb[0]?.b?.avg,
        ].join(",")
      : "",
  }));
}

function main() {
  const args = process.argv.slice(2);
  const manifest = buildLightfieldRuntimeDiagnostics({
    definitionBuildLinksPath: optionValue(args, "--definition-build-links", defaultDefinitionBuildLinksPath),
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), manifest);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), manifest);
  writeTsv(optionValue(args, "--tsv-out", defaultTsvOut), rowsForTsv(manifest), [
    "targetRelativePath",
    "resolvedPath",
    "definitionCount",
    "definitions",
    "width",
    "height",
    "expectedCells",
    "dataRows",
    "invalidRows",
    "nonZeroCells",
    "scalarMin",
    "scalarMax",
    "scalarAvg",
    "sample0AvgRgb",
  ]);
  console.log(JSON.stringify({ summary: manifest.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildLightfieldRuntimeDiagnostics,
  parseLightfield,
};
