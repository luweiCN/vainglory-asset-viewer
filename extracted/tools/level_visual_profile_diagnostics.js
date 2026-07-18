#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultDefinitionInstanceStringsPath = "extracted/reports/definition_instance_strings.tsv";
const defaultDefinitionSymbolsPath = "extracted/reports/cff0_definition_symbols.tsv";
const defaultDefinitionBuildLinksPath = "extracted/reports/definition_build_links.tsv";
const defaultLightfieldRuntimeDiagnosticsPath = "extracted/viewer/lightfield-runtime-diagnostics.json";
const defaultJsonOut = "extracted/reports/level_visual_profile_diagnostics.json";
const defaultTsvOut = "extracted/reports/level_visual_profile_diagnostics.tsv";
const defaultViewerOut = "extracted/viewer/level-visual-profile-diagnostics.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readTsvRows(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trimEnd();
  if (!text) return [];
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split("\t");
  return lines.filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const row = {};
    for (let index = 0; index < headers.length; index += 1) row[headers[index]] = parts[index] ?? "";
    return row;
  });
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function definitionKind(relativePath) {
  if (/^Levels\/GameModes\//i.test(relativePath)) return "game-mode";
  if (/^Levels\/GameplaySettings\//i.test(relativePath)) return "gameplay-settings";
  if (/^Levels\/Levels\//i.test(relativePath)) return "level";
  if (/^Levels\/Visuals\//i.test(relativePath)) return "visuals";
  return "other";
}

function symbolDefinitionMap(symbolRows) {
  const map = new Map();
  for (const row of symbolRows) {
    if (!row.symbol) continue;
    if (!map.has(row.symbol)) map.set(row.symbol, new Map());
    map.get(row.symbol).set(row.relativePath, {
      relativePath: row.relativePath,
      hash: row.hash,
      kind: definitionKind(row.relativePath),
    });
  }
  return map;
}

function symbolReferenceRows(instanceStringRows, symbolsByName) {
  return instanceStringRows
    .filter((row) => /^\*[^*]+\*$/.test(row.value || ""))
    .map((row) => {
      const definitions = [...(symbolsByName.get(row.value)?.values() || [])].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      );
      return {
        sourceRelativePath: row.relativePath,
        sourceHash: row.hash,
        sourceKind: definitionKind(row.relativePath),
        blockIndex: row.blockIndex,
        stringIndex: row.stringIndex,
        labelBefore: row.labelBefore,
        symbol: row.value,
        resolved: definitions.length ? "yes" : "no",
        resolvedDefinitions: definitions,
        resolvedKinds: uniqueSorted(definitions.map((definition) => definition.kind)),
      };
    });
}

function referencesBySource(symbolReferences) {
  const map = new Map();
  for (const reference of symbolReferences) {
    if (!map.has(reference.sourceRelativePath)) map.set(reference.sourceRelativePath, []);
    map.get(reference.sourceRelativePath).push(reference);
  }
  return map;
}

function resolvedPathsForKind(references, kind) {
  return uniqueSorted(
    (references || []).flatMap((reference) =>
      reference.resolvedDefinitions
        .filter((definition) => definition.kind === kind)
        .map((definition) => definition.relativePath),
    ),
  );
}

function lightfieldLinksByVisual(definitionBuildLinksRows) {
  const map = new Map();
  for (const row of definitionBuildLinksRows) {
    if (row.label !== "LightOmni" || !/\.lightfield$/i.test(row.targetRelativePath || "")) continue;
    if (!map.has(row.sourceRelativePath)) map.set(row.sourceRelativePath, []);
    map.get(row.sourceRelativePath).push({
      targetRelativePath: row.targetRelativePath,
      targetBuildPath: row.targetBuildPath,
      targetHash: row.targetHash,
      matched: row.matched,
      targetLinkedPath: row.targetLinkedPath,
      blockIndexes: row.blockIndexes,
      firstStringIndex: row.firstStringIndex,
    });
  }
  return map;
}

function lightfieldSummaryByTarget(lightfieldRuntimeDiagnostics) {
  const map = new Map();
  for (const entry of lightfieldRuntimeDiagnostics?.lightfields || []) {
    if (entry.targetRelativePath) map.set(entry.targetRelativePath, entry);
  }
  return map;
}

function buildChains(symbolReferences, definitionBuildLinksRows, lightfieldRuntimeDiagnostics) {
  const bySource = referencesBySource(symbolReferences);
  const lightfieldsByVisual = lightfieldLinksByVisual(definitionBuildLinksRows);
  const parsedLightfieldsByTarget = lightfieldSummaryByTarget(lightfieldRuntimeDiagnostics);
  const gameModeSources = uniqueSorted(
    symbolReferences
      .filter((reference) => reference.sourceKind === "game-mode")
      .map((reference) => reference.sourceRelativePath),
  );
  const levelSources = uniqueSorted(
    symbolReferences
      .filter((reference) => reference.sourceKind === "level")
      .map((reference) => reference.sourceRelativePath),
  );
  const chains = [];

  for (const gameModePath of gameModeSources) {
    const gameModeReferences = bySource.get(gameModePath) || [];
    const levels = resolvedPathsForKind(gameModeReferences, "level");
    const gameplaySettings = resolvedPathsForKind(gameModeReferences, "gameplay-settings");
    for (const levelPath of levels.length ? levels : [""]) {
      const levelReferences = bySource.get(levelPath) || [];
      const visuals = resolvedPathsForKind(levelReferences, "visuals");
      for (const visualsPath of visuals.length ? visuals : [""]) {
        const lightfields = (lightfieldsByVisual.get(visualsPath) || []).map((link) => {
          const parsed = parsedLightfieldsByTarget.get(link.targetRelativePath);
          return {
            ...link,
            dimensions: parsed?.parsed?.dimensions || null,
            bounds: parsed?.parsed?.bounds || null,
            rowShape: parsed?.parsed?.rowShape || "",
          };
        });
        chains.push({
          gameModePath,
          gameplaySettings,
          levelPath,
          visualsPath,
          lightfields,
          status: lightfields.length ? "visuals-lightfield-linked" : visualsPath ? "visuals-without-lightfield" : "missing-visuals",
        });
      }
    }
  }

  for (const levelPath of levelSources) {
    const levelReferences = bySource.get(levelPath) || [];
    const visuals = resolvedPathsForKind(levelReferences, "visuals");
    for (const visualsPath of visuals) {
      if (chains.some((chain) => chain.levelPath === levelPath && chain.visualsPath === visualsPath)) continue;
      const lightfields = (lightfieldsByVisual.get(visualsPath) || []).map((link) => {
        const parsed = parsedLightfieldsByTarget.get(link.targetRelativePath);
        return {
          ...link,
          dimensions: parsed?.parsed?.dimensions || null,
          bounds: parsed?.parsed?.bounds || null,
          rowShape: parsed?.parsed?.rowShape || "",
        };
      });
      chains.push({
        gameModePath: "",
        gameplaySettings: [],
        levelPath,
        visualsPath,
        lightfields,
        status: lightfields.length ? "standalone-level-visuals-lightfield-linked" : "standalone-level-visuals-without-lightfield",
      });
    }
  }

  return chains.sort((left, right) =>
    [left.gameModePath, left.levelPath, left.visualsPath].join("\t").localeCompare(
      [right.gameModePath, right.levelPath, right.visualsPath].join("\t"),
    ),
  );
}

function buildLevelVisualProfileDiagnostics({
  definitionInstanceStringsPath = defaultDefinitionInstanceStringsPath,
  definitionSymbolsPath = defaultDefinitionSymbolsPath,
  definitionBuildLinksPath = defaultDefinitionBuildLinksPath,
  lightfieldRuntimeDiagnosticsPath = defaultLightfieldRuntimeDiagnosticsPath,
} = {}) {
  const instanceStringRows = readTsvRows(definitionInstanceStringsPath);
  const symbolRows = readTsvRows(definitionSymbolsPath);
  const definitionBuildLinksRows = readTsvRows(definitionBuildLinksPath);
  const lightfieldRuntimeDiagnostics = readOptionalJson(lightfieldRuntimeDiagnosticsPath);
  const symbolsByName = symbolDefinitionMap(symbolRows);
  const symbolReferences = symbolReferenceRows(instanceStringRows, symbolsByName);
  const chains = buildChains(symbolReferences, definitionBuildLinksRows, lightfieldRuntimeDiagnostics);
  const unresolvedSymbols = symbolReferences.filter((reference) => reference.resolved === "no");
  const levelVisualReferences = symbolReferences.filter(
    (reference) =>
      reference.sourceKind === "level" && reference.resolvedDefinitions.some((definition) => definition.kind === "visuals"),
  );
  const gameModeLevelReferences = symbolReferences.filter(
    (reference) =>
      reference.sourceKind === "game-mode" && reference.resolvedDefinitions.some((definition) => definition.kind === "level"),
  );
  const lightfieldsByVisual = lightfieldLinksByVisual(definitionBuildLinksRows);
  const visualLightfieldRows = [...lightfieldsByVisual.entries()].flatMap(([visualsPath, links]) =>
    links.map((link) => ({
      visualsPath,
      targetRelativePath: link.targetRelativePath,
      matched: link.matched,
      targetLinkedPath: link.targetLinkedPath,
    })),
  );

  return {
    source: {
      definitionInstanceStringsPath,
      definitionSymbolsPath,
      definitionBuildLinksPath,
      lightfieldRuntimeDiagnosticsPath,
    },
    summary: {
      symbolReferences: symbolReferences.length,
      resolvedSymbolReferences: symbolReferences.filter((reference) => reference.resolved === "yes").length,
      unresolvedSymbolReferences: unresolvedSymbols.length,
      gameModeLevelReferences: gameModeLevelReferences.length,
      levelVisualReferences: levelVisualReferences.length,
      visualLightfieldLinks: visualLightfieldRows.length,
      chains: chains.length,
      chainsWithGameMode: chains.filter((chain) => chain.gameModePath).length,
      chainsWithLightfield: chains.filter((chain) => chain.lightfields.length).length,
    },
    interpretation: [
      "Level and GameMode definitions reference other definitions by CFF0 symbols such as *MapViewer_5v5_Visuals*, not only by build:// resource paths.",
      "The symbol table resolves those symbols back to concrete .def files, which lets the diagnostic follow GameMode -> Level -> Visuals -> LightOmni .lightfield.",
      "This recovers definition/profile selection evidence only. It does not prove the native sampler cell, active hero preview scene object, or final Probe.Samples vectors.",
    ],
    chains,
    visualLightfields: visualLightfieldRows.sort((left, right) =>
      [left.visualsPath, left.targetRelativePath].join("\t").localeCompare(
        [right.visualsPath, right.targetRelativePath].join("\t"),
      ),
    ),
    unresolvedSymbols: unresolvedSymbols.map((reference) => ({
      sourceRelativePath: reference.sourceRelativePath,
      sourceKind: reference.sourceKind,
      symbol: reference.symbol,
      blockIndex: reference.blockIndex,
      stringIndex: reference.stringIndex,
      labelBefore: reference.labelBefore,
    })),
  };
}

function rowsForTsv(manifest) {
  return (manifest.chains || []).flatMap((chain) => {
    if (!chain.lightfields.length) {
      return [
        {
          gameModePath: chain.gameModePath,
          gameplaySettings: chain.gameplaySettings.join("|"),
          levelPath: chain.levelPath,
          visualsPath: chain.visualsPath,
          targetRelativePath: "",
          dimensions: "",
          status: chain.status,
        },
      ];
    }
    return chain.lightfields.map((lightfield) => ({
      gameModePath: chain.gameModePath,
      gameplaySettings: chain.gameplaySettings.join("|"),
      levelPath: chain.levelPath,
      visualsPath: chain.visualsPath,
      targetRelativePath: lightfield.targetRelativePath,
      dimensions: lightfield.dimensions ? `${lightfield.dimensions.width}x${lightfield.dimensions.height}` : "",
      status: chain.status,
    }));
  });
}

function main() {
  const args = process.argv.slice(2);
  const manifest = buildLevelVisualProfileDiagnostics({
    definitionInstanceStringsPath: optionValue(args, "--definition-instance-strings", defaultDefinitionInstanceStringsPath),
    definitionSymbolsPath: optionValue(args, "--definition-symbols", defaultDefinitionSymbolsPath),
    definitionBuildLinksPath: optionValue(args, "--definition-build-links", defaultDefinitionBuildLinksPath),
    lightfieldRuntimeDiagnosticsPath: optionValue(
      args,
      "--lightfield-runtime-diagnostics",
      defaultLightfieldRuntimeDiagnosticsPath,
    ),
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), manifest);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), manifest);
  writeTsv(optionValue(args, "--tsv-out", defaultTsvOut), rowsForTsv(manifest), [
    "gameModePath",
    "gameplaySettings",
    "levelPath",
    "visualsPath",
    "targetRelativePath",
    "dimensions",
    "status",
  ]);
  console.log(JSON.stringify({ summary: manifest.summary }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildLevelVisualProfileDiagnostics,
};
