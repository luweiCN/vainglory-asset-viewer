#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const defaultMaterialManifestPath = "extracted/viewer/material-runtime-pipeline-manifest.json";
const defaultNativeLightProbeEvidencePath = "extracted/viewer/native-light-probe-runtime-evidence.json";
const defaultHeroPreviewProfileCandidatesPath = "extracted/viewer/hero-preview-profile-candidates.json";
const defaultJsonOut = "extracted/reports/character_lit_probe_blocker_audit.json";
const defaultTsvOut = "extracted/reports/character_lit_probe_blocker_audit.tsv";
const defaultViewerOut = "extracted/viewer/character-lit-probe-blocker-audit.json";

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  return filePath && fs.existsSync(filePath) ? readJson(filePath) : null;
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

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function splitPipe(value) {
  return String(value || "").split("|").filter(Boolean);
}

function increment(map, key, amount = 1) {
  const normalized = key || "";
  map[normalized] = (map[normalized] || 0) + amount;
}

function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      return rightValue - leftValue || leftKey.localeCompare(rightKey);
    }),
  );
}

function countRows(rows, field) {
  const counts = {};
  for (const row of rows) increment(counts, row[field]);
  return sortedCounts(counts);
}

function semanticCounts(bindings) {
  const counts = {};
  for (const binding of bindings || []) increment(counts, binding.semantic);
  return sortedCounts(counts);
}

function hasFullCharacterProbeBindings(bindings) {
  const counts = semanticCounts(bindings);
  return (
    counts["OmniLight.Position"] >= 2 &&
    counts["OmniLight.Color"] >= 2 &&
    counts["OmniLight.Attenuation"] >= 2 &&
    counts["Probe.Samples"] >= 6
  );
}

function hasRequiredRuntimeLightBindings(bindings, characterLitFormula, solidLitRuntimeLights) {
  if (characterLitFormula) return hasFullCharacterProbeBindings(bindings);
  const formula = solidLitRuntimeLights || null;
  if (!formula) return false;
  const counts = semanticCounts(bindings);
  const omniCount = Math.max(
    formula.featureCoverage?.omniDiffuse || formula.featureCoverage?.specularPow ? 2 : 0,
    (formula.omniLights || []).length,
  );
  const probeCount = Math.max(
    formula.featureCoverage?.eyeToWorldProbeBlend ? 6 : 0,
    (formula.probeSampleUniforms || []).length,
  );
  return (
    counts["OmniLight.Position"] >= omniCount &&
    counts["OmniLight.Color"] >= omniCount &&
    counts["OmniLight.Attenuation"] >= omniCount &&
    counts["Probe.Samples"] >= probeCount
  );
}

function runtimeSamplerResolution(runtimeSamplerRecords, unresolvedSamplers, runtimeResolvedSamplers = []) {
  const unresolvedSet = new Set(unresolvedSamplers);
  const runtimeResolvedSet = new Set(runtimeResolvedSamplers);
  const samplerCandidates = [...new Set([...unresolvedSamplers, ...runtimeResolvedSamplers])];
  if (!samplerCandidates.length) {
    return {
      state: "no-unresolved-samplers",
      inlineRuntimeSamplers: [],
      runtimeSceneTextureSamplers: [],
      unclassifiedRuntimeSamplers: [],
      ordinaryTextureSamplers: [],
    };
  }

  const recordsBySampler = new Map(runtimeSamplerRecords.map((record) => [record.sampler, record]));
  const inlineRuntimeSamplers = [];
  const runtimeSceneTextureSamplers = [];
  const unclassifiedRuntimeSamplers = [];
  const ordinaryTextureSamplers = [];
  for (const sampler of samplerCandidates) {
    const record = recordsBySampler.get(sampler);
    if (!record && unresolvedSet.has(sampler)) {
      ordinaryTextureSamplers.push(sampler);
    } else if (!record && runtimeResolvedSet.has(sampler)) {
      unclassifiedRuntimeSamplers.push(sampler);
    } else if (/inline/i.test(record.kind || "")) {
      inlineRuntimeSamplers.push(sampler);
    } else if (/runtime-fog-of-war-texture/i.test(record.kind || "")) {
      runtimeSceneTextureSamplers.push(sampler);
    } else {
      unclassifiedRuntimeSamplers.push(sampler);
    }
  }

  let state = "ordinary-texture-sampler-unresolved";
  if (ordinaryTextureSamplers.length && inlineRuntimeSamplers.length) {
    state = "runtime-inline-lookup-with-ordinary-texture-sampler-unresolved";
  } else if (ordinaryTextureSamplers.length && runtimeSceneTextureSamplers.length) {
    state = "runtime-scene-texture-with-ordinary-texture-sampler-unresolved";
  } else if (inlineRuntimeSamplers.length && unclassifiedRuntimeSamplers.length) {
    state = "runtime-inline-lookup-with-unclassified-samplers";
  } else if (inlineRuntimeSamplers.length && runtimeSceneTextureSamplers.length) {
    state = "runtime-inline-lookup-with-runtime-scene-texture";
  } else if (inlineRuntimeSamplers.length) {
    state = "runtime-inline-lookup-not-glb-texture";
  } else if (runtimeSceneTextureSamplers.length) {
    state = "runtime-scene-texture-not-glb-texture";
  } else if (unclassifiedRuntimeSamplers.length) {
    state = "runtime-sampler-unclassified";
  }

  return {
    state,
    inlineRuntimeSamplers,
    runtimeSceneTextureSamplers,
    unclassifiedRuntimeSamplers,
    ordinaryTextureSamplers,
  };
}

function viewerShaderPortReadiness({ requiredBindings, characterLitFormula, solidLitRuntimeLights, samplerResolution }) {
  const formula = characterLitFormula || solidLitRuntimeLights || null;
  const mode = characterLitFormula ? "character-lit-reflection-probe" : solidLitRuntimeLights ? "solid-lit-runtime-lights" : "";
  const blockers = [];

  if (!formula) blockers.push("shader-formula-structure-missing");
  if ((formula?.missingEvidence || []).length) blockers.push("shader-formula-missing-evidence");
  if (!requiredBindings) blockers.push("runtime-uniform-bindings-incomplete");
  if (samplerResolution.ordinaryTextureSamplers.length) blockers.push("ordinary-texture-sampler-unresolved");
  if (samplerResolution.unclassifiedRuntimeSamplers.length) blockers.push("runtime-sampler-unclassified");
  if (samplerResolution.runtimeSceneTextureSamplers.length) blockers.push("runtime-scene-texture-unresolved");

  const formulaReady =
    Boolean(formula) &&
    !(formula.missingEvidence || []).length &&
    requiredBindings &&
    !samplerResolution.ordinaryTextureSamplers.length &&
    !samplerResolution.unclassifiedRuntimeSamplers.length;
  const runtimeValuesOnly = formulaReady && !samplerResolution.runtimeSceneTextureSamplers.length;

  let state = "blocked-shader-formula-unresolved";
  if (runtimeValuesOnly) state = "shader-formula-ready-runtime-values-missing";
  else if (formulaReady) state = "shader-formula-ready-runtime-scene-texture-missing";
  else if (blockers.includes("runtime-uniform-bindings-incomplete")) state = "blocked-runtime-uniform-bindings-incomplete";
  else if (blockers.includes("ordinary-texture-sampler-unresolved")) state = "blocked-ordinary-texture-sampler-unresolved";
  else if (blockers.includes("runtime-sampler-unclassified")) state = "blocked-runtime-sampler-unclassified";

  return {
    mode,
    state,
    formulaReady,
    runtimeValuesOnly,
    blockers,
  };
}

function buildAuditRow(row, gate) {
  const bindings = parseJsonField(row.nativeUniformBindings, []);
  const nativeInputs = parseJsonField(row.nativeShaderInputs, null);
  const characterLitFormula = nativeInputs?.characterLitFormula || null;
  const solidLitRuntimeLights = nativeInputs?.solidLitRuntimeLights || null;
  const runtimeSamplerRecords = parseJsonField(row.runtimeSamplerRecords, []);
  const unresolvedSamplers = splitPipe(row.unresolvedSamplers);
  const texturePathMissingSamplers = splitPipe(row.texturePathMissingSamplers);
  const runtimeResolvedSamplers = splitPipe(row.runtimeResolvedSamplers);
  const gaps = [];
  const fullBindings = hasFullCharacterProbeBindings(bindings);
  const requiredBindings = hasRequiredRuntimeLightBindings(bindings, characterLitFormula, solidLitRuntimeLights);
  const samplerResolution = runtimeSamplerResolution(runtimeSamplerRecords, unresolvedSamplers, runtimeResolvedSamplers);
  const runtimeSamplerState = samplerResolution.state;
  const viewerShaderPort = viewerShaderPortReadiness({
    requiredBindings,
    characterLitFormula,
    solidLitRuntimeLights,
    samplerResolution,
  });

  if (!requiredBindings) gaps.push("native-light-probe-uniform-bindings-incomplete");
  if (!gate.lightfieldProfilePayloadCandidateRecovered) gaps.push("levelvisuals-lightfield-profile-candidate-unrecovered");
  if (!gate.activePreviewProfileResolved) gaps.push("active-preview-profile-unresolved");
  if (!gate.activePreviewConcreteKeyRecovered) gaps.push("active-preview-concrete-key-unresolved");
  if (!gate.activeSamplePositionResolved) gaps.push("active-sample-position-unresolved");
  if (!gate.fullCharacterLitShaderFormulaPorted) {
    const formulaStructurallyMapped = characterLitFormula && !(characterLitFormula.missingEvidence || []).length;
    const solidLitStructurallyMapped = solidLitRuntimeLights && !(solidLitRuntimeLights.missingEvidence || []).length;
    gaps.push(
      formulaStructurallyMapped
        ? "character-lit-viewer-shader-port-not-enabled"
        : solidLitStructurallyMapped
          ? "solid-lit-viewer-shader-port-not-enabled"
          : "full-character-lit-shader-formula-not-ported",
    );
  }
  if (samplerResolution.ordinaryTextureSamplers.length) gaps.push("ordinary-texture-sampler-unresolved");
  if (samplerResolution.runtimeSceneTextureSamplers.length) gaps.push("runtime-scene-texture-unresolved");
  if (samplerResolution.unclassifiedRuntimeSamplers.length) gaps.push("runtime-sampler-unclassified");

  return {
    rel: row.rel || "",
    character: row.character || "",
    materialIndex: row.materialIndex,
    materialName: row.materialName || "",
    shadergraphRel: row.shadergraphRel || "",
    nativeShaderMode: row.nativeShaderMode || "",
    nativeShaderBlocker: row.nativeShaderBlocker || "",
    uniformBindingCount: bindings.length,
    uniformSemanticCounts: JSON.stringify(semanticCounts(bindings)),
    hasFullCharacterProbeBindings: fullBindings ? "yes" : "no",
    hasRequiredRuntimeLightBindings: requiredBindings ? "yes" : "no",
    runtimeSamplerKinds: row.runtimeSamplerKinds || "",
    texturePathMissingSamplers: texturePathMissingSamplers.join("|"),
    runtimeResolvedSamplers: runtimeResolvedSamplers.join("|"),
    unresolvedSamplers: unresolvedSamplers.join("|"),
    inlineRuntimeSamplers: samplerResolution.inlineRuntimeSamplers.join("|"),
    runtimeSceneTextureSamplers: samplerResolution.runtimeSceneTextureSamplers.join("|"),
    unclassifiedRuntimeSamplers: samplerResolution.unclassifiedRuntimeSamplers.join("|"),
    ordinaryTextureSamplers: samplerResolution.ordinaryTextureSamplers.join("|"),
    runtimeSamplerState,
    roleSamplers: JSON.stringify(nativeInputs?.roleSamplers || {}),
    characterLitFormulaClass: characterLitFormula?.formulaClass || "",
    characterLitFormulaSignature: characterLitFormula?.structureSignature || "",
    characterLitFormulaMissingEvidence: (characterLitFormula?.missingEvidence || []).join("|"),
    characterLitFormulaCoverage: characterLitFormula ? JSON.stringify(characterLitFormula.featureCoverage || {}) : "",
    solidLitFormulaClass: solidLitRuntimeLights?.formulaClass || "",
    solidLitFormulaSignature: solidLitRuntimeLights?.structureSignature || "",
    solidLitFormulaCoverage: solidLitRuntimeLights ? JSON.stringify(solidLitRuntimeLights.featureCoverage || {}) : "",
    viewerShaderPortMode: viewerShaderPort.mode,
    viewerShaderPortState: viewerShaderPort.state,
    viewerShaderPortFormulaReady: viewerShaderPort.formulaReady ? "yes" : "no",
    viewerShaderPortRuntimeValuesOnly: viewerShaderPort.runtimeValuesOnly ? "yes" : "no",
    viewerShaderPortBlockers: viewerShaderPort.blockers.join("|"),
    samplerTextureCoverage: nativeInputs?.samplerTextureCoverage || "",
    evidenceGaps: gaps.join("|"),
    rendererTakeoverAllowed: "no",
  };
}

function buildCharacterLitProbeBlockerAudit({
  materialManifestPath = defaultMaterialManifestPath,
  nativeLightProbeEvidencePath = defaultNativeLightProbeEvidencePath,
  heroPreviewProfileCandidatesPath = defaultHeroPreviewProfileCandidatesPath,
} = {}) {
  const materialManifest = readJson(materialManifestPath);
  const nativeLightProbeEvidence = readOptionalJson(nativeLightProbeEvidencePath);
  const heroPreviewProfileCandidates = readOptionalJson(heroPreviewProfileCandidatesPath);
  const materialRows = Array.isArray(materialManifest)
    ? materialManifest
    : materialManifest.items || materialManifest.rows || [];
  const blockedMaterialRows = materialRows.filter(
    (row) => row.nativeShaderBlocker === "runtime-light-probe-values-unresolved",
  );
  const bridgeCandidate =
    nativeLightProbeEvidence?.linkedNativeRuntimeEvidence?.levelVisualsDefinitionFieldBridge
      ?.lightfieldProfilePayloadCandidate || null;
  const heroSummary = heroPreviewProfileCandidates?.summary || {};
  const nativeSummary =
    nativeLightProbeEvidence?.linkedNativeRuntimeEvidence?.currentNativePositionSamplerOwnerAudit?.summary || {};
  const gate = {
    lightfieldProfilePayloadCandidateRecovered: Boolean(
      bridgeCandidate?.allLabelsAreLightOmni && (bridgeCandidate?.candidateLevelVisualsOffsetHexes || []).includes("0x50"),
    ),
    activePreviewProfileResolved: Boolean(heroSummary.provenActiveHeroPreviewProfile),
    activePreviewConcreteKeyRecovered: Boolean(heroSummary.activePreviewCandidateConcreteKeyValuesRecovered),
    activeSamplePositionMechanicsRecovered: Boolean(nativeSummary.renderCommandQueueSortKeyRecovered),
    activeSamplePositionResolved: false,
    fullCharacterLitShaderFormulaPorted: false,
    rendererTakeoverAllowed: false,
  };
  const rows = blockedMaterialRows.map((row) => buildAuditRow(row, gate));
  const byEvidenceGap = {};
  for (const row of rows) {
    for (const gap of splitPipe(row.evidenceGaps)) increment(byEvidenceGap, gap);
  }
  const rowsWithRuntimeInlineLookup = rows.filter((row) => row.inlineRuntimeSamplers).length;
  const rowsWithRuntimeSceneTextureSamplers = rows.filter((row) => row.runtimeSceneTextureSamplers).length;
  const rowsWithUnclassifiedRuntimeSamplers = rows.filter((row) => row.unclassifiedRuntimeSamplers).length;
  const rowsWithFullUniformBindings = rows.filter((row) => row.hasFullCharacterProbeBindings === "yes").length;
  const rowsWithRequiredRuntimeLightBindings = rows.filter((row) => row.hasRequiredRuntimeLightBindings === "yes").length;
  const rowsWithCharacterLitFormulaDiagnostics = rows.filter((row) => row.characterLitFormulaClass).length;
  const rowsWithCompleteCharacterLitFormulaStructure = rows.filter(
    (row) => row.characterLitFormulaClass && !row.characterLitFormulaMissingEvidence,
  ).length;
  const rowsWithSolidLitFormulaDiagnostics = rows.filter((row) => row.solidLitFormulaClass).length;
  const rowsWithViewerShaderPortFormulaReady = rows.filter((row) => row.viewerShaderPortFormulaReady === "yes").length;
  const rowsBlockedOnlyByRuntimeValues = rows.filter((row) => row.viewerShaderPortRuntimeValuesOnly === "yes").length;
  const byCharacterLitFormulaMissingEvidence = {};
  for (const row of rows) {
    for (const gap of splitPipe(row.characterLitFormulaMissingEvidence)) increment(byCharacterLitFormulaMissingEvidence, gap);
  }
  const byViewerShaderPortBlocker = {};
  for (const row of rows) {
    for (const gap of splitPipe(row.viewerShaderPortBlockers)) increment(byViewerShaderPortBlocker, gap);
  }
  return {
    generatedAt: new Date().toISOString(),
    source: {
      materialManifestPath,
      nativeLightProbeEvidencePath,
      heroPreviewProfileCandidatesPath,
    },
    summary: {
      totalMaterialRows: materialRows.length,
      blockedRows: rows.length,
      rowsWithFullUniformBindings,
      rowsWithRuntimeInlineLookup,
      rowsWithRuntimeSceneTextureSamplers,
      rowsWithUnclassifiedRuntimeSamplers,
      rowsWithCharacterLitFormulaDiagnostics,
      rowsWithCompleteCharacterLitFormulaStructure,
      rowsWithSolidLitFormulaDiagnostics,
      rowsWithOrdinaryTextureSamplerGaps: rows.filter((row) => row.ordinaryTextureSamplers).length,
      rowsWithRequiredRuntimeLightBindings,
      rendererTakeoverAllowed: false,
      byNativeShaderMode: countRows(rows, "nativeShaderMode"),
      byRuntimeSamplerState: countRows(rows, "runtimeSamplerState"),
      byCharacterLitFormulaClass: countRows(rows.filter((row) => row.characterLitFormulaClass), "characterLitFormulaClass"),
      byCharacterLitFormulaMissingEvidence: sortedCounts(byCharacterLitFormulaMissingEvidence),
      bySolidLitFormulaClass: countRows(rows.filter((row) => row.solidLitFormulaClass), "solidLitFormulaClass"),
      rowsWithViewerShaderPortFormulaReady,
      rowsBlockedOnlyByRuntimeValues,
      byViewerShaderPortState: countRows(rows, "viewerShaderPortState"),
      byViewerShaderPortBlocker: sortedCounts(byViewerShaderPortBlocker),
      byRuntimeSceneTextureRel: countRows(
        rows.filter((row) => row.runtimeSceneTextureSamplers),
        "rel",
      ),
      byEvidenceGap: sortedCounts(byEvidenceGap),
    },
    gate,
    interpretation: [
      "This report classifies the runtime-light-probe-values-unresolved material rows only.",
      "A runtime inline lookup sampler such as sampler60 is not treated as a missing diffuse texture.",
      "A runtime scene texture sampler such as FogOfWar.Texture is not treated as a missing GLB material texture.",
      "Viewer shader port readiness is now separated from renderer takeover: formula-ready rows still cannot render until active runtime values are recovered.",
      "The current non-guessing blocker is still the active hero/model preview profile, concrete key, sample position, and complete character-lit shader formula as one chain.",
      "This report is diagnostic-only and never enables renderer takeover.",
    ],
    rows,
  };
}

function rowsForTsv(manifest) {
  return manifest.rows || [];
}

function main() {
  const args = process.argv.slice(2);
  const manifest = buildCharacterLitProbeBlockerAudit({
    materialManifestPath: optionValue(args, "--material-manifest", defaultMaterialManifestPath),
    nativeLightProbeEvidencePath: optionValue(args, "--native-light-probe-evidence", defaultNativeLightProbeEvidencePath),
    heroPreviewProfileCandidatesPath: optionValue(args, "--hero-preview-profile-candidates", defaultHeroPreviewProfileCandidatesPath),
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), manifest);
  writeTsv(optionValue(args, "--tsv-out", defaultTsvOut), rowsForTsv(manifest), [
    "rel",
    "character",
    "materialIndex",
    "materialName",
    "shadergraphRel",
    "nativeShaderMode",
    "nativeShaderBlocker",
    "uniformBindingCount",
    "uniformSemanticCounts",
    "hasFullCharacterProbeBindings",
    "hasRequiredRuntimeLightBindings",
    "runtimeSamplerKinds",
    "texturePathMissingSamplers",
    "runtimeResolvedSamplers",
    "unresolvedSamplers",
    "inlineRuntimeSamplers",
    "runtimeSceneTextureSamplers",
    "unclassifiedRuntimeSamplers",
    "ordinaryTextureSamplers",
    "runtimeSamplerState",
    "roleSamplers",
    "characterLitFormulaClass",
    "characterLitFormulaSignature",
    "characterLitFormulaMissingEvidence",
    "characterLitFormulaCoverage",
    "solidLitFormulaClass",
    "solidLitFormulaSignature",
    "solidLitFormulaCoverage",
    "viewerShaderPortMode",
    "viewerShaderPortState",
    "viewerShaderPortFormulaReady",
    "viewerShaderPortRuntimeValuesOnly",
    "viewerShaderPortBlockers",
    "samplerTextureCoverage",
    "evidenceGaps",
    "rendererTakeoverAllowed",
  ]);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), manifest);
  console.log(JSON.stringify(manifest.summary, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildCharacterLitProbeBlockerAudit,
};
