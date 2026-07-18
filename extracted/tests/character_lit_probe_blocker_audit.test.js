const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildCharacterLitProbeBlockerAudit } = require("../tools/character_lit_probe_blocker_audit");

function fullRuntimeLightBindings() {
  return [
    { uniform: "unif0", semantic: "OmniLight.Position", arrayIndex: 0 },
    { uniform: "unif1", semantic: "OmniLight.Color", arrayIndex: 0 },
    { uniform: "unif2", semantic: "OmniLight.Attenuation", arrayIndex: 0 },
    { uniform: "unif3", semantic: "OmniLight.Position", arrayIndex: 1 },
    { uniform: "unif4", semantic: "OmniLight.Color", arrayIndex: 1 },
    { uniform: "unif5", semantic: "OmniLight.Attenuation", arrayIndex: 1 },
    { uniform: "unif6", semantic: "Probe.Samples", arrayIndex: 0 },
    { uniform: "unif7", semantic: "Probe.Samples", arrayIndex: 1 },
    { uniform: "unif8", semantic: "Probe.Samples", arrayIndex: 2 },
    { uniform: "unif9", semantic: "Probe.Samples", arrayIndex: 3 },
    { uniform: "unif10", semantic: "Probe.Samples", arrayIndex: 4 },
    { uniform: "unif11", semantic: "Probe.Samples", arrayIndex: 5 },
  ];
}

test("character lit blocker audit separates FogOfWar runtime texture samplers from unknown runtime samplers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-character-lit-blocker-"));
  const materialManifestPath = path.join(tempDir, "material-runtime-pipeline-manifest.json");
  fs.writeFileSync(
    materialManifestPath,
    `${JSON.stringify({
      items: [
        {
          rel: "Characters/Node5v5Home/Art/node5v5Home.glb",
          character: "Node5v5Home",
          materialIndex: 1,
          materialName: "/Characters/Node5v5Home/Art/node5v5Home.node5v5Home_mat.shadergraph",
          shadergraphRel: "Characters/Node5v5Home/Art/node5v5Home.node5v5Home_mat.shadergraph",
          nativeShaderMode: "character-lit-reflection-probe",
          nativeShaderBlocker: "runtime-light-probe-values-unresolved",
          runtimeSamplerKinds:
            "sampler60:tch0-inline-rgb-float-lookup|sampler212:runtime-fog-of-war-texture-diagnostic",
          texturePathMissingSamplers: "sampler212|sampler60",
          runtimeResolvedSamplers: "sampler212|sampler60",
          unresolvedSamplers: "",
          runtimeSamplerRecords: JSON.stringify([
            { sampler: "sampler60", kind: "tch0-inline-rgb-float-lookup" },
            { sampler: "sampler212", kind: "runtime-fog-of-war-texture-diagnostic" },
          ]),
          nativeUniformBindings: "[]",
          nativeShaderInputs: JSON.stringify({
            characterLitFormula: {
              formulaClass: "character-lit-reflection-probe+rim-lookup+pow-specular+standard-samplers",
              structureSignature: "abc123",
              featureCoverage: { tangentNormal: true, baseColor: true },
              missingEvidence: [],
            },
          }),
        },
      ],
    })}\n`,
  );

  const audit = buildCharacterLitProbeBlockerAudit({
    materialManifestPath,
    nativeLightProbeEvidencePath: path.join(tempDir, "missing-native-evidence.json"),
    heroPreviewProfileCandidatesPath: path.join(tempDir, "missing-preview-candidates.json"),
  });

  assert.equal(audit.summary.rowsWithRuntimeInlineLookup, 1);
  assert.equal(audit.summary.rowsWithRuntimeSceneTextureSamplers, 1);
  assert.equal(audit.summary.rowsWithUnclassifiedRuntimeSamplers, 0);
  assert.equal(audit.summary.rowsWithCharacterLitFormulaDiagnostics, 1);
  assert.equal(audit.summary.rowsWithCompleteCharacterLitFormulaStructure, 1);
  assert.equal(audit.rows[0].runtimeSamplerState, "runtime-inline-lookup-with-runtime-scene-texture");
  assert.equal(audit.rows[0].runtimeResolvedSamplers, "sampler212|sampler60");
  assert.equal(audit.rows[0].runtimeSceneTextureSamplers, "sampler212");
  assert.equal(audit.rows[0].unclassifiedRuntimeSamplers, "");
  assert.equal(
    audit.rows[0].characterLitFormulaClass,
    "character-lit-reflection-probe+rim-lookup+pow-specular+standard-samplers",
  );
  assert.equal(audit.rows[0].characterLitFormulaMissingEvidence, "");
  assert.match(audit.rows[0].evidenceGaps, /\bruntime-scene-texture-unresolved\b/);
  assert.doesNotMatch(audit.rows[0].evidenceGaps, /\bruntime-sampler-unclassified\b/);
});

test("character lit blocker audit reports formula-ready rows separately from runtime takeover", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-character-lit-ready-"));
  const materialManifestPath = path.join(tempDir, "material-runtime-pipeline-manifest.json");
  const baseFormula = {
    formulaClass: "character-lit-reflection-probe+rim-lookup+pow-specular+standard-samplers",
    structureSignature: "abc123",
    featureCoverage: { tangentNormal: true, baseColor: true },
    missingEvidence: [],
  };
  fs.writeFileSync(
    materialManifestPath,
    `${JSON.stringify({
      items: [
        {
          rel: "Characters/Adagio/Art/adagio_angel.glb",
          character: "Adagio",
          materialIndex: 1,
          materialName: "ready_mat",
          shadergraphRel: "Characters/Adagio/Art/adagio_angel.ready_mat.shadergraph",
          nativeShaderMode: "character-lit-reflection-probe",
          nativeShaderBlocker: "runtime-light-probe-values-unresolved",
          runtimeSamplerKinds: "sampler60:tch0-inline-rgb-float-lookup",
          texturePathMissingSamplers: "sampler60",
          runtimeResolvedSamplers: "sampler60",
          unresolvedSamplers: "",
          runtimeSamplerRecords: JSON.stringify([{ sampler: "sampler60", kind: "tch0-inline-rgb-float-lookup" }]),
          nativeUniformBindings: JSON.stringify(fullRuntimeLightBindings()),
          nativeShaderInputs: JSON.stringify({ characterLitFormula: baseFormula }),
        },
        {
          rel: "Characters/Node5v5Home/Art/node5v5Home.glb",
          character: "Node5v5Home",
          materialIndex: 2,
          materialName: "fog_mat",
          shadergraphRel: "Characters/Node5v5Home/Art/node5v5Home.fog_mat.shadergraph",
          nativeShaderMode: "character-lit-reflection-probe",
          nativeShaderBlocker: "runtime-light-probe-values-unresolved",
          runtimeSamplerKinds:
            "sampler60:tch0-inline-rgb-float-lookup|sampler212:runtime-fog-of-war-texture-diagnostic",
          texturePathMissingSamplers: "sampler60|sampler212",
          runtimeResolvedSamplers: "sampler60|sampler212",
          unresolvedSamplers: "",
          runtimeSamplerRecords: JSON.stringify([
            { sampler: "sampler60", kind: "tch0-inline-rgb-float-lookup" },
            { sampler: "sampler212", kind: "runtime-fog-of-war-texture-diagnostic" },
          ]),
          nativeUniformBindings: JSON.stringify(fullRuntimeLightBindings()),
          nativeShaderInputs: JSON.stringify({ characterLitFormula: baseFormula }),
        },
      ],
    })}\n`,
  );

  const audit = buildCharacterLitProbeBlockerAudit({
    materialManifestPath,
    nativeLightProbeEvidencePath: path.join(tempDir, "missing-native-evidence.json"),
    heroPreviewProfileCandidatesPath: path.join(tempDir, "missing-preview-candidates.json"),
  });

  assert.equal(audit.summary.rowsWithViewerShaderPortFormulaReady, 2);
  assert.equal(audit.summary.rowsBlockedOnlyByRuntimeValues, 1);
  assert.equal(audit.summary.rowsWithRequiredRuntimeLightBindings, 2);
  assert.equal(audit.rows[0].viewerShaderPortState, "shader-formula-ready-runtime-values-missing");
  assert.equal(audit.rows[0].hasRequiredRuntimeLightBindings, "yes");
  assert.equal(audit.rows[0].viewerShaderPortRuntimeValuesOnly, "yes");
  assert.equal(audit.rows[0].rendererTakeoverAllowed, "no");
  assert.equal(audit.rows[1].viewerShaderPortState, "shader-formula-ready-runtime-scene-texture-missing");
  assert.equal(audit.rows[1].hasRequiredRuntimeLightBindings, "yes");
  assert.equal(audit.rows[1].viewerShaderPortRuntimeValuesOnly, "no");
  assert.match(audit.rows[1].viewerShaderPortBlockers, /\bruntime-scene-texture-unresolved\b/);
  assert.deepEqual(audit.summary.byRuntimeSceneTextureRel, {
    "Characters/Node5v5Home/Art/node5v5Home.glb": 1,
  });
});

test("solid-lit specular-only formulas require the uniforms listed by the formula instead of six probe samples", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-solid-lit-required-"));
  const materialManifestPath = path.join(tempDir, "material-runtime-pipeline-manifest.json");
  fs.writeFileSync(
    materialManifestPath,
    `${JSON.stringify({
      items: [
        {
          rel: "Characters/Hero000/Art/hero000.glb",
          character: "Hero000",
          materialIndex: 1,
          materialName: "/Characters/Hero000/Art/hero000.black.shadergraph",
          shadergraphRel: "Characters/Hero000/Art/hero000.black.shadergraph",
          nativeShaderMode: "solid-lit-runtime-lights",
          nativeShaderBlocker: "runtime-light-probe-values-unresolved",
          runtimeSamplerKinds: "",
          unresolvedSamplers: "",
          runtimeSamplerRecords: "[]",
          nativeUniformBindings: JSON.stringify([
            { uniform: "unif32", semantic: "OmniLight.Position", arrayIndex: 0 },
            { uniform: "unif33", semantic: "OmniLight.Color", arrayIndex: 0 },
            { uniform: "unif34", semantic: "OmniLight.Attenuation", arrayIndex: 0 },
            { uniform: "unif38", semantic: "OmniLight.Position", arrayIndex: 1 },
            { uniform: "unif39", semantic: "OmniLight.Color", arrayIndex: 1 },
            { uniform: "unif40", semantic: "OmniLight.Attenuation", arrayIndex: 1 },
            { uniform: "unif48", semantic: "Probe.Samples", arrayIndex: 0 },
          ]),
          nativeShaderInputs: JSON.stringify({
            solidLitRuntimeLights: {
              formulaClass: "solid-lit-runtime-lights+no-probe-diffuse+no-omni-diffuse+pow-specular",
              structureSignature: "92b4bebf2b57",
              featureCoverage: { eyeToWorldProbeBlend: false, omniDiffuse: false, specularPow: true },
              missingEvidence: [],
              omniLights: [
                { arrayIndex: 0, positionUniform: "unif32", colorUniform: "unif33", attenuationUniform: "unif34" },
                { arrayIndex: 1, positionUniform: "unif38", colorUniform: "unif39", attenuationUniform: "unif40" },
              ],
              probeSampleUniforms: ["unif48"],
            },
          }),
        },
      ],
    })}\n`,
  );

  const audit = buildCharacterLitProbeBlockerAudit({
    materialManifestPath,
    nativeLightProbeEvidencePath: path.join(tempDir, "missing-native-evidence.json"),
    heroPreviewProfileCandidatesPath: path.join(tempDir, "missing-preview-candidates.json"),
  });

  assert.equal(audit.summary.rowsWithFullUniformBindings, 0);
  assert.equal(audit.summary.rowsWithRequiredRuntimeLightBindings, 1);
  assert.equal(audit.summary.rowsWithViewerShaderPortFormulaReady, 1);
  assert.equal(audit.rows[0].hasFullCharacterProbeBindings, "no");
  assert.equal(audit.rows[0].hasRequiredRuntimeLightBindings, "yes");
  assert.equal(audit.rows[0].viewerShaderPortState, "shader-formula-ready-runtime-values-missing");
  assert.doesNotMatch(audit.rows[0].evidenceGaps, /\bnative-light-probe-uniform-bindings-incomplete\b/);
});
