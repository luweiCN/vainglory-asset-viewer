# Vainglory Material Runtime Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Vainglory character material rendering from recovered shadergraph evidence instead of global brightness tweaks, covering transparency, reflection, UV animation, emissive glow, vertex/uniform colors, and special shader color paths.

**Architecture:** Treat `*.shadergraph` as the source of truth. The offline manifest expands each GLB material into explicit runtime roles and texture paths; the viewer consumes that manifest through a small material runtime layer that applies only evidenced behavior. No hero-specific visual hacks are allowed unless the source data proves the rule applies to that shadergraph class.

**Tech Stack:** Node.js report generators, Three.js `MeshStandardMaterial` plus `onBeforeCompile`, Electron viewer, `node --test`.

## Global Constraints

- Do not fix color by raising global `renderer.toneMappingExposure`, global light intensity, or blanket texture colorSpace rewrites.
- Every rendered behavior must be traceable to `extracted/hero_assets/shadergraphs/**`, GLB material names, decoded texture hashes, or native runtime records.
- If a shadergraph role cannot be implemented yet, keep it visible as a diagnostic gap instead of guessing.
- Shared logic must apply across all characters and skins; no one-off hero/skin patches for the material pipeline.
- After each task, the Electron page refresh should show either a visible rendering change or a new diagnostic count explaining why not.

---

## File Structure

- Modify: `extracted/tools/material_roles.js`
  - Keep low-level shadergraph role detection here: role names, sampler-to-hash mapping, blend flags, reflection/lookup hints.
- Modify: `extracted/tools/effect_shadergraph_material_manifest.js`
  - Export existing reusable parsers for inline colors and UV animation descriptors so character materials use the same logic as effects.
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
  - Expand the current material pipeline manifest with texture preview paths, inline colors, UV animation descriptors, alpha recommendations, and implementation gap fields.
- Modify: `extracted/viewer/app.js`
  - Load the richer material manifest, bind it to GLB material names, call the material runtime applier after GLTF load, and update diagnostics.
- Create: `extracted/viewer/material-runtime-shaders.js`
  - Hold reusable Three.js shader patch helpers for alpha, emissive, reflection, lookup, and UV animation. This prevents `app.js` from absorbing another large shader layer.
- Modify: `extracted/tests/material_runtime_pipeline_manifest.test.js`
  - Test manifest enrichment and gap accounting with synthetic GLB/shadergraph fixtures.
- Modify: `extracted/tests/viewer_lighting.test.js`
  - Static tests that viewer consumes the enriched material runtime manifest and does not reintroduce global brightness/color-space hacks.
- Create: `extracted/tests/material_runtime_shaders.test.js`
  - Unit tests for pure shader helper functions that do not need WebGL.

---

### Task 1: Enrich Character Material Pipeline Manifest

**Files:**
- Modify: `extracted/tools/effect_shadergraph_material_manifest.js`
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
- Modify: `extracted/tests/material_runtime_pipeline_manifest.test.js`
- Output: `extracted/viewer/material-runtime-pipeline-manifest.json`
- Output: `extracted/reports/material_runtime_pipeline.tsv`

**Interfaces:**
- Consumes: `analyzeShadergraph(filePath)` from `extracted/tools/material_roles.js`
- Produces:
  - `roleTexturePaths: stringified JSON object`
  - `inlineColors: stringified JSON array`
  - `previewUvAnimation: stringified JSON object`
  - `uvAnimationGapReason: string`
  - `recommendedAlphaMode: "OPAQUE" | "MASK" | "BLEND"`
  - `unimplementedRoleNames: pipe-separated string`

- [ ] **Step 1: Export reusable shadergraph parsers**

In `extracted/tools/effect_shadergraph_material_manifest.js`, extend `module.exports`:

```js
module.exports = {
  buildEffectShadergraphMaterialManifest,
  effectPreviewTextureForShadergraph,
  exportEffectShadergraphMaterialManifest,
  extractOutputAlphaSamplerChannels,
  extractInlineColorConstants,
  previewUvAnimationForMaterial,
  previewUvAnimationGapReasonForMaterial,
  previewUvAnimationGapInputsForMaterial,
  previewUvAnimationInputsForRuntimeEvidence,
  readEffectShadergraphCandidates,
  reportRowsForManifest,
  summarizeEffectShadergraphItems,
  textureMetaForHash,
};
```

- [ ] **Step 2: Write failing manifest enrichment test**

Add to `extracted/tests/material_runtime_pipeline_manifest.test.js`:

```js
test("material runtime manifest includes role texture paths, inline colors, and UV diagnostics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-pipeline-rich-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const shadergraphRel = "Characters/HeroA/Art/hero_a.body.shadergraph";
  writeGlb(path.join(tempDir, "glb", rel), {
    asset: { version: "2.0" },
    materials: [{ name: `/${shadergraphRel}`, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
  });
  writeShadergraph(path.join(tempDir, "shadergraphs", shadergraphRel));

  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: path.join(tempDir, "glb"),
    shadergraphRoot: path.join(tempDir, "shadergraphs"),
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [{ rel, modelLabel: "HeroA_DefaultSkin", character: "HeroA" }],
  });

  const roleTexturePaths = JSON.parse(rows[0].roleTexturePaths);
  assert.equal(roleTexturePaths.baseColor, "../hero_assets_material_textures_preview/Characters/HeroA/Art/hero_a.body.png");
  assert.equal(roleTexturePaths.normal, "../hero_assets_material_textures_preview/Characters/HeroA/Art/hero_a.body.normal.png");
  assert.ok(Array.isArray(JSON.parse(rows[0].inlineColors)));
  assert.ok(rows[0].recommendedAlphaMode === "OPAQUE" || rows[0].recommendedAlphaMode === "MASK" || rows[0].recommendedAlphaMode === "BLEND");
});
```

Run:

```bash
node --test extracted/tests/material_runtime_pipeline_manifest.test.js
```

Expected: FAIL because `roleTexturePaths` is not emitted yet.

- [ ] **Step 3: Implement role texture path and enrichment fields**

Add to `extracted/tools/material_runtime_pipeline_manifest.js`:

```js
const {
  extractInlineColorConstants,
  previewUvAnimationForMaterial,
  previewUvAnimationGapReasonForMaterial,
} = require("./effect_shadergraph_material_manifest");

const defaultMaterialTextureRoot = "extracted/hero_assets_material_textures_preview";

function viewerRelativeTexturePath(filePath) {
  return filePath ? normalizeRel(path.relative("extracted/viewer", filePath)) : "";
}

function materialTexturePreviewPath(shadergraphRel, role, materialTextureRoot = defaultMaterialTextureRoot) {
  if (!shadergraphRel) return "";
  const base = shadergraphRel.replace(/\.shadergraph$/i, "");
  const suffix = role === "baseColor" ? "" : `.${role}`;
  const filePath = path.join(materialTextureRoot, `${base}${suffix}.png`);
  return viewerRelativeTexturePath(filePath);
}

function roleTexturePathsForAnalysis(shadergraphRel, analysis, materialTextureRoot) {
  const output = {};
  for (const role of roleNamesForAnalysis(analysis)) {
    const texturePath = materialTexturePreviewPath(shadergraphRel, role, materialTextureRoot);
    if (texturePath) output[role] = texturePath;
  }
  return output;
}

function recommendedAlphaModeForRoles(analysis) {
  const roles = analysis?.roles || {};
  if (roles.alphaBlend) return "BLEND";
  if (roles.alphaMask) return "MASK";
  return "OPAQUE";
}

function unimplementedRoleNamesForRow(analysis) {
  const roles = new Set(roleNamesForAnalysis(analysis));
  return [...roles].filter((role) => ["reflection", "lookup", "uvAnimation", "uniformColor", "vertexColor"].includes(role));
}
```

When building each material row, add:

```js
const shaderText = shadergraphFilePath && fs.existsSync(shadergraphFilePath)
  ? fs.readFileSync(shadergraphFilePath).toString("latin1")
  : "";
const roleTexturePaths = roleTexturePathsForAnalysis(shadergraphRel, analysis, materialTextureRoot);
const inlineColors = shaderText ? extractInlineColorConstants(shaderText) : [];
const previewUvAnimation = shaderText
  ? previewUvAnimationForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {})
  : null;

return {
  ...existingRow,
  roleTexturePaths: JSON.stringify(roleTexturePaths),
  inlineColors: JSON.stringify(inlineColors),
  previewUvAnimation: JSON.stringify(previewUvAnimation || null),
  uvAnimationGapReason: shaderText
    ? previewUvAnimationGapReasonForMaterial(shaderText, analysis?.roles || {}, analysis?.samplerToHash || {}, roleNames)
    : "",
  recommendedAlphaMode: recommendedAlphaModeForRoles(analysis),
  unimplementedRoleNames: unimplementedRoleNamesForRow(analysis).join("|"),
};
```

- [ ] **Step 4: Regenerate reports**

Run:

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
```

Expected: JSON summary prints; `material-runtime-pipeline-manifest.json` contains `roleTexturePaths`, `inlineColors`, `previewUvAnimation`, and `unimplementedRoleNames`.

- [ ] **Step 5: Run task tests**

Run:

```bash
node --test extracted/tests/material_runtime_pipeline_manifest.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extracted/tools/effect_shadergraph_material_manifest.js extracted/tools/material_runtime_pipeline_manifest.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/viewer/material-runtime-pipeline-manifest.json extracted/reports/material_runtime_pipeline.tsv extracted/reports/material_runtime_pipeline_summary.json
git commit -m "feat: enrich character material runtime pipeline manifest"
```

**Refresh-visible result:** model diagnostics can name which shader roles exist and which roles are not implemented yet.

---

### Task 2: Add Viewer Runtime Material Binding Layer

**Files:**
- Create: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

**Interfaces:**
- Consumes: enriched rows from `materialRuntimePipelineByLookup`
- Produces:
  - `applyCharacterMaterialRuntimePipeline(object, item): void`
  - `material.userData.vaingloryRuntimeMaterialPipeline`

- [ ] **Step 1: Write failing viewer wiring test**

Add to `extracted/tests/viewer_lighting.test.js`:

```js
test("viewer applies character material runtime pipeline from shadergraph manifest", () => {
  assert.match(appJs, /import \{ applyCharacterMaterialRuntimePipeline \} from "\.\/material-runtime-shaders\.js";/);
  assert.match(appJs, /function materialRuntimePipelineRowForMaterial/);
  assert.match(appJs, /applyCharacterMaterialRuntimePipeline\(activeObject, manifestItem\);/);
  assert.match(appJs, /vaingloryRuntimeMaterialPipeline/);
  assert.doesNotMatch(appJs, /toneMappingExposure = 1\.08/);
  assert.doesNotMatch(appJs, /normalizePreviewMaterialColorSpaces/);
});
```

Run:

```bash
node --test extracted/tests/viewer_lighting.test.js
```

Expected: FAIL because the import and call do not exist.

- [ ] **Step 2: Create shader module with no visual mutation yet**

Create `extracted/viewer/material-runtime-shaders.js`:

```js
export function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function roleSet(row) {
  return new Set(String(row?.roleNames || "").split("|").filter(Boolean));
}

export function attachRuntimeMaterialEvidence(material, row) {
  material.userData.vaingloryRuntimeMaterialPipeline = {
    materialName: row.materialName,
    shadergraphRel: row.shadergraphRel,
    roleNames: [...roleSet(row)],
    roleTexturePaths: parseJsonField(row.roleTexturePaths, {}),
    inlineColors: parseJsonField(row.inlineColors, []),
    previewUvAnimation: parseJsonField(row.previewUvAnimation, null),
    recommendedAlphaMode: row.recommendedAlphaMode || "OPAQUE",
  };
  return material;
}

export function applyCharacterMaterialRuntimePipeline(object, rowForMaterial) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const row = rowForMaterial(material);
      if (!row) continue;
      attachRuntimeMaterialEvidence(material, row);
    }
  });
}
```

- [ ] **Step 3: Wire viewer lookup**

In `extracted/viewer/app.js`, import:

```js
import { applyCharacterMaterialRuntimePipeline } from "./material-runtime-shaders.js";
```

Add helpers near material pipeline lookup functions:

```js
function normalizeMaterialRuntimeName(name = "") {
  return String(name).replace(/\\/g, "/").replace(/^\/+/, "");
}

function materialRuntimePipelineRowsForActiveItem(item = activeManifestItem) {
  return runtimeMaterialRuntimePipelineRowsForItem(item);
}

function materialRuntimePipelineRowForMaterial(material, item = activeManifestItem) {
  const materialName = normalizeMaterialRuntimeName(material?.name || "");
  if (!materialName) return null;
  return materialRuntimePipelineRowsForActiveItem(item).find(
    (row) => normalizeMaterialRuntimeName(row.materialName) === materialName || normalizeMaterialRuntimeName(row.shadergraphRel) === materialName,
  ) || null;
}
```

In `setActiveObject`, after `applyPreviewMaterialFixups(activeObject);`:

```js
applyCharacterMaterialRuntimePipeline(activeObject, (material) => materialRuntimePipelineRowForMaterial(material, manifestItem));
```

- [ ] **Step 4: Run viewer test**

Run:

```bash
node --test extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extracted/viewer/app.js extracted/viewer/material-runtime-shaders.js extracted/tests/viewer_lighting.test.js
git commit -m "feat: bind shadergraph material evidence in viewer"
```

**Refresh-visible result:** diagnostics remain stable; materials now carry inspectable `userData.vaingloryRuntimeMaterialPipeline`.

---

### Task 3: Implement Transparency and Alpha Mask Runtime

**Files:**
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/material_runtime_shaders.test.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

**Interfaces:**
- Consumes: `roleTexturePaths.alphaMask`, `recommendedAlphaMode`, `roleNames`
- Produces: `applyCharacterAlphaRuntime(material, evidence, loadTexture): void`

- [ ] **Step 1: Write alpha unit tests**

Create `extracted/tests/material_runtime_shaders.test.js`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");

test("alpha runtime maps MASK and BLEND to stable material settings", async () => {
  const { alphaRuntimeSettings } = await import("../viewer/material-runtime-shaders.js");
  assert.deepEqual(alphaRuntimeSettings({ roleNames: ["alphaMask"], recommendedAlphaMode: "MASK" }), {
    transparent: false,
    alphaTest: 0.35,
    depthWrite: true,
  });
  assert.deepEqual(alphaRuntimeSettings({ roleNames: ["alphaBlend"], recommendedAlphaMode: "BLEND" }), {
    transparent: true,
    alphaTest: 0,
    depthWrite: false,
  });
});
```

Run:

```bash
node --test extracted/tests/material_runtime_shaders.test.js
```

Expected: FAIL because `alphaRuntimeSettings` does not exist.

- [ ] **Step 2: Implement alpha settings**

In `extracted/viewer/material-runtime-shaders.js`:

```js
export function alphaRuntimeSettings(evidence) {
  const roles = new Set(evidence?.roleNames || []);
  if (evidence?.recommendedAlphaMode === "BLEND" || roles.has("alphaBlend")) {
    return { transparent: true, alphaTest: 0, depthWrite: false };
  }
  if (evidence?.recommendedAlphaMode === "MASK" || roles.has("alphaMask")) {
    return { transparent: false, alphaTest: 0.35, depthWrite: true };
  }
  return { transparent: false, alphaTest: 0, depthWrite: true };
}

export function applyCharacterAlphaRuntime(material, evidence, loadTexture) {
  const roles = new Set(evidence?.roleNames || []);
  if (!roles.has("alphaMask") && !roles.has("alphaBlend")) return material;
  const settings = alphaRuntimeSettings(evidence);
  material.transparent = settings.transparent;
  material.alphaTest = settings.alphaTest;
  material.depthWrite = settings.depthWrite;
  if (evidence.roleTexturePaths?.alphaMask) {
    material.alphaMap = loadTexture(evidence.roleTexturePaths.alphaMask, "data");
  }
  material.needsUpdate = true;
  return material;
}
```

Call it from `attachRuntimeMaterialEvidence` after evidence is attached.

- [ ] **Step 3: Add viewer texture loader**

In `extracted/viewer/app.js`:

```js
const characterMaterialTextureLoader = new THREE.TextureLoader();
const characterMaterialTextureCache = new Map();

function loadCharacterRuntimeMaterialTexture(texturePath, kind = "color") {
  if (!texturePath) return null;
  const key = `${kind}:${texturePath}`;
  if (!characterMaterialTextureCache.has(key)) {
    const texture = characterMaterialTextureLoader.load(texturePath);
    texture.name = `character_runtime_${texturePath}`;
    texture.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    characterMaterialTextureCache.set(key, texture);
  }
  return characterMaterialTextureCache.get(key);
}
```

Pass this loader into `applyCharacterMaterialRuntimePipeline`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extracted/viewer/app.js extracted/viewer/material-runtime-shaders.js extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js
git commit -m "feat: apply shadergraph alpha runtime to character materials"
```

**Refresh-visible result:** Kestrel bowstrings, discs, translucent trims, and cutout material edges should no longer appear as opaque cards or wrong white plates when shadergraph evidence includes alpha roles.

---

### Task 4: Implement Emissive and Inline Color Runtime

**Files:**
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/tests/material_runtime_shaders.test.js`
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
- Regenerate: `extracted/viewer/material-runtime-pipeline-manifest.json`

**Interfaces:**
- Consumes: `roleNames` containing `emissive`, `roleTexturePaths.emissive`, `inlineColors`
- Produces: `applyCharacterEmissiveRuntime(material, evidence, loadTexture): void`

- [ ] **Step 1: Write emissive color test**

Add:

```js
test("emissive runtime uses shadergraph inline color without changing global exposure", async () => {
  const { emissiveColorFromInlineColors } = await import("../viewer/material-runtime-shaders.js");
  assert.deepEqual(
    emissiveColorFromInlineColors([{ rgb: [0.2, 0.4, 0.8], alpha: 1, hex: "#3366CC" }]),
    [0.2, 0.4, 0.8],
  );
  assert.equal(emissiveColorFromInlineColors([]), null);
});
```

Expected initial result: FAIL.

- [ ] **Step 2: Implement emissive helpers**

```js
export function emissiveColorFromInlineColors(inlineColors) {
  const first = (inlineColors || []).find((color) => Array.isArray(color.rgb) && color.rgb.length >= 3);
  return first ? first.rgb.slice(0, 3).map((value) => Number(value) || 0) : null;
}

export function applyCharacterEmissiveRuntime(material, evidence, loadTexture, THREE) {
  const roles = new Set(evidence?.roleNames || []);
  if (!roles.has("emissive") && !evidence?.inlineColors?.length) return material;
  const inlineColor = emissiveColorFromInlineColors(evidence.inlineColors);
  if (inlineColor && material.emissive) material.emissive.setRGB(inlineColor[0], inlineColor[1], inlineColor[2]);
  if (evidence.roleTexturePaths?.emissive) material.emissiveMap = loadTexture(evidence.roleTexturePaths.emissive, "color");
  material.emissiveIntensity = roles.has("emissive") ? 1 : 0.35;
  material.needsUpdate = true;
  return material;
}
```

- [ ] **Step 3: Wire into runtime applier**

Call `applyCharacterEmissiveRuntime(material, evidence, loadTexture, THREE)` after alpha runtime.

- [ ] **Step 4: Regenerate manifest and tests**

Run:

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
node --test extracted/tests/material_runtime_shaders.test.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extracted/viewer/material-runtime-shaders.js extracted/tests/material_runtime_shaders.test.js extracted/tools/material_runtime_pipeline_manifest.js extracted/viewer/material-runtime-pipeline-manifest.json extracted/reports/material_runtime_pipeline.tsv
git commit -m "feat: apply shadergraph emissive and inline color runtime"
```

**Refresh-visible result:** glowing eyes, crystals, halos, lights, and similar shadergraph-emissive pieces should brighten from their own shader evidence, not from scene-wide exposure.

---

### Task 5: Implement Reflection and Lookup Runtime

**Files:**
- Modify: `extracted/tools/material_roles.js`
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/tests/material_runtime_shaders.test.js`
- Modify: `extracted/tests/material_runtime_pipeline_manifest.test.js`

**Interfaces:**
- Consumes: `roles.reflection`, `roles.lookup`, `roleTexturePaths.reflection`, `roleTexturePaths.lookup`
- Produces:
  - `reflectionMode: "screen-space-2d" | "lookup-2d" | ""`
  - `applyCharacterReflectionRuntime(material, evidence, loadTexture, THREE): void`

- [ ] **Step 1: Add reflection mode evidence to manifest**

In `extracted/tools/material_roles.js`, add:

```js
function reflectionModeForSampler(text, sampler) {
  if (!sampler) return "";
  if (usesReflectionUv(text, sampler)) return "screen-space-2d";
  if (/sampler(?:88|104|105)/.test(sampler)) return "lookup-2d";
  return "";
}
```

Export it:

```js
reflectionModeForSampler,
```

In `material_runtime_pipeline_manifest.js`, write:

```js
reflectionMode: reflectionModeForSampler(shaderText, analysis?.roles?.reflection?.sampler || ""),
```

- [ ] **Step 2: Write shader string test**

Add:

```js
test("reflection runtime injects evidenced reflection sampler into standard material shader", async () => {
  const { patchReflectionFragmentShader } = await import("../viewer/material-runtime-shaders.js");
  const source = "void main(){\\n#include <normal_fragment_maps>\\n#include <lights_fragment_end>\\n}";
  const output = patchReflectionFragmentShader(source, { mode: "lookup-2d" });
  assert.match(output, /uniform sampler2D characterReflectionMap;/);
  assert.match(output, /reflectedLight\\.indirectDiffuse/);
});
```

Expected: FAIL.

- [ ] **Step 3: Implement reflection shader patch**

```js
export function patchReflectionFragmentShader(fragmentShader, reflection) {
  if (!reflection?.mode) return fragmentShader;
  const header = "uniform sampler2D characterReflectionMap;\\nuniform float characterReflectionIntensity;";
  const body = `
vec2 characterReflectionUv = normalize(vViewPosition).xy * 0.5 + 0.5;
vec3 characterReflectionColor = texture2D(characterReflectionMap, characterReflectionUv).rgb;
reflectedLight.indirectDiffuse += characterReflectionColor * characterReflectionIntensity;
`;
  return `${header}\\n${fragmentShader.replace("#include <lights_fragment_end>", `${body}\\n#include <lights_fragment_end>`)}`;
}

export function applyCharacterReflectionRuntime(material, evidence, loadTexture) {
  const reflectionPath = evidence?.roleTexturePaths?.reflection || evidence?.roleTexturePaths?.lookup || "";
  if (!reflectionPath) return material;
  const reflectionMap = loadTexture(reflectionPath, "color");
  const reflection = { mode: evidence.reflectionMode || "lookup-2d" };
  material.userData.characterReflectionRuntime = { reflectionMap, reflection };
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previous?.(shader);
    shader.uniforms.characterReflectionMap = { value: reflectionMap };
    shader.uniforms.characterReflectionIntensity = { value: 0.55 };
    shader.fragmentShader = patchReflectionFragmentShader(shader.fragmentShader, reflection);
  };
  material.customProgramCacheKey = () => `character-reflection:${reflection.mode}`;
  material.needsUpdate = true;
  return material;
}
```

This is not a final physics-perfect reflection model; it is the first evidenced implementation. A later task must reduce `unimplementedRoleNames` only when this shader path covers the manifest row.

- [ ] **Step 4: Run tests and regenerate**

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
node --test extracted/tests/material_roles.test.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extracted/tools/material_roles.js extracted/tools/material_runtime_pipeline_manifest.js extracted/viewer/material-runtime-shaders.js extracted/tests/material_runtime_shaders.test.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/viewer/material-runtime-pipeline-manifest.json extracted/reports/material_runtime_pipeline.tsv
git commit -m "feat: apply shadergraph reflection runtime"
```

**Refresh-visible result:** glossy skins should gain shadergraph-local reflection behavior; Kraken-like oily highlights should become diagnosable as reflection intensity/mode rows rather than hidden global lighting changes.

---

### Task 6: Implement Character UV Animation Runtime

**Files:**
- Modify: `extracted/tools/effect_shadergraph_material_manifest.js`
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/material_runtime_shaders.test.js`
- Modify: `extracted/tests/viewer_lighting.test.js`

**Interfaces:**
- Consumes: `previewUvAnimation` from manifest
- Produces:
  - `applyCharacterUvAnimationRuntime(material, evidence, loadTexture): void`
  - `updateCharacterMaterialRuntime(deltaSeconds): void`

- [ ] **Step 1: Export UV parser functions**

In `effect_shadergraph_material_manifest.js`, export:

```js
previewUvAnimationForMaterial,
previewUvAnimationGapReasonForMaterial,
previewUvAnimationInputsForRuntimeEvidence,
```

- [ ] **Step 2: Write UV shader test**

```js
test("direct scroll UV runtime patches map sampling with time uniform", async () => {
  const { patchDirectScrollUvFragmentShader } = await import("../viewer/material-runtime-shaders.js");
  const source = "#include <map_fragment>";
  const output = patchDirectScrollUvFragmentShader(source, { axis: [1, 0], speed: 0.5 });
  assert.match(output, /uniform float characterUvRuntimeTime;/);
  assert.match(output, /characterUvRuntimeTime/);
  assert.match(output, /texture2D\\( map,/);
});
```

Expected: FAIL.

- [ ] **Step 3: Implement first supported modes**

In `material-runtime-shaders.js`, implement direct UV modes first:

```js
export function patchDirectScrollUvFragmentShader(fragmentShader) {
  const header = "uniform float characterUvRuntimeTime;\\nuniform vec2 characterUvRuntimeAxis;\\nuniform float characterUvRuntimeSpeed;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeUv = vMapUv + characterUvRuntimeAxis * characterUvRuntimeSpeed * characterUvRuntimeTime;
  vec4 sampledDiffuseColor = texture2D(map, characterRuntimeUv);
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

export function applyCharacterUvAnimationRuntime(material, evidence) {
  const uvAnimation = evidence?.previewUvAnimation;
  if (!uvAnimation || !["scroll", "vec2Scroll", "scaleOffset"].includes(uvAnimation.mode)) return material;
  const uniforms = {
    characterUvRuntimeTime: { value: 0 },
    characterUvRuntimeAxis: { value: { x: Number(uvAnimation.axis?.[0]) || 0, y: Number(uvAnimation.axis?.[1]) || 0 } },
    characterUvRuntimeSpeed: { value: Number(uvAnimation.speed) || 0 },
  };
  material.userData.characterUvRuntimeUniforms = uniforms;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previous?.(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchDirectScrollUvFragmentShader(shader.fragmentShader, uvAnimation);
  };
  material.needsUpdate = true;
  return material;
}
```

- [ ] **Step 4: Add per-frame updater**

In `app.js`, add:

```js
function updateCharacterMaterialRuntime(deltaSeconds) {
  if (!activeObject) return;
  activeObject.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const uniforms = material.userData.characterUvRuntimeUniforms;
      if (uniforms?.characterUvRuntimeTime) uniforms.characterUvRuntimeTime.value += deltaSeconds;
    }
  });
}
```

Call it from the render loop immediately before `composer.render()` or `renderer.render()`.

- [ ] **Step 5: Add gap accounting**

Regenerate manifest and add summary fields:

```js
uvAnimationRows: rows.filter((row) => String(row.roleNames).includes("uvAnimation")).length,
implementedUvAnimationRows: rows.filter((row) => JSON.parse(row.previewUvAnimation || "null")?.mode).length,
uvAnimationGapRows: rows.filter((row) => row.uvAnimationGapReason).length,
```

- [ ] **Step 6: Run tests**

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
node --test extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add extracted/tools/effect_shadergraph_material_manifest.js extracted/tools/material_runtime_pipeline_manifest.js extracted/viewer/app.js extracted/viewer/material-runtime-shaders.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js extracted/viewer/material-runtime-pipeline-manifest.json extracted/reports/material_runtime_pipeline.tsv
git commit -m "feat: apply character UV animation runtime"
```

**Refresh-visible result:** materials with scroll/scale shadergraph UV roles should move in the preview without turning into large effect cards.

---

### Task 7: Implement Uniform Color, Vertex Color, and Existing Special Shader Classes

**Files:**
- Modify: `extracted/tools/material_roles.js`
- Modify: `extracted/tools/material_runtime_pipeline_manifest.js`
- Modify: `extracted/viewer/material-runtime-shaders.js`
- Modify: `extracted/viewer/app.js`
- Modify: `extracted/tests/material_runtime_pipeline_manifest.test.js`
- Modify: `extracted/tests/material_runtime_shaders.test.js`

**Interfaces:**
- Consumes: `uniformColor`, `vertexColor`, inline colors, existing special shadergraph material names
- Produces:
  - `colorMode: "texture" | "inline-uniform" | "vertex-color" | "water" | "guob" | "bowstring" | ""`
  - `applyCharacterColorRuntime(material, evidence, THREE): void`

- [ ] **Step 1: Convert current special cases into manifest categories**

In `material_runtime_pipeline_manifest.js`, add:

```js
function colorModeForMaterial(row, analysis, shadergraphRel) {
  const name = String(shadergraphRel || row.materialName || "").toLowerCase();
  const roles = new Set(roleNamesForAnalysis(analysis));
  if (name.includes("water")) return "water";
  if (name.includes("guob")) return "guob";
  if (name.includes("bowalpha") || name.includes("bowstring")) return "bowstring";
  if (roles.has("vertexColor")) return "vertex-color";
  if (roles.has("uniformColor")) return "inline-uniform";
  return "";
}
```

Emit `colorMode`.

- [ ] **Step 2: Write color runtime tests**

```js
test("color runtime maps vertex color role to material vertexColors", async () => {
  const { colorRuntimeSettings } = await import("../viewer/material-runtime-shaders.js");
  assert.deepEqual(colorRuntimeSettings({ colorMode: "vertex-color" }), { vertexColors: true });
  assert.deepEqual(colorRuntimeSettings({ colorMode: "" }), { vertexColors: false });
});
```

- [ ] **Step 3: Implement color runtime**

```js
export function colorRuntimeSettings(evidence) {
  return { vertexColors: evidence?.colorMode === "vertex-color" };
}

export function applyCharacterColorRuntime(material, evidence, THREE) {
  const settings = colorRuntimeSettings(evidence);
  material.vertexColors = settings.vertexColors;
  if (evidence?.colorMode === "water" && material.color) material.color.setRGB(0.42, 0.83, 0.92);
  if (evidence?.colorMode === "guob") {
    material.transparent = true;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
  return material;
}
```

The water and guob values above must be replaced in the same task with parsed inline color constants when the shadergraph supplies them; otherwise keep the old behavior marked as `colorMode` diagnostic and do not remove the gap.

- [ ] **Step 4: Remove duplicated special-case branching from `applyPreviewMaterialFixups`**

Only remove branches whose behavior is now represented by `colorMode`. Keep unrelated mesh deformation and safety fixes untouched.

- [ ] **Step 5: Run tests**

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
node --test extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/tests/viewer_lighting.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extracted/tools/material_roles.js extracted/tools/material_runtime_pipeline_manifest.js extracted/viewer/app.js extracted/viewer/material-runtime-shaders.js extracted/tests/material_runtime_pipeline_manifest.test.js extracted/tests/material_runtime_shaders.test.js extracted/viewer/material-runtime-pipeline-manifest.json extracted/reports/material_runtime_pipeline.tsv
git commit -m "feat: classify and apply special shader color modes"
```

**Refresh-visible result:** yellow blobs, water/crystal/guob/bowstring-like shader classes should be governed by manifest categories rather than scattered viewer name checks.

---

### Task 8: Add Runtime Pipeline Coverage Gate

**Files:**
- Create: `extracted/tools/material_runtime_pipeline_status.js`
- Modify: `extracted/tests/material_runtime_pipeline_manifest.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `extracted/viewer/material-runtime-pipeline-manifest.json`
- Produces: failing status when any role remains unimplemented without an explicit diagnostic reason.

- [ ] **Step 1: Create status tool**

Create `extracted/tools/material_runtime_pipeline_status.js`:

```js
#!/usr/bin/env node
const fs = require("node:fs");

function readManifest(filePath = "extracted/viewer/material-runtime-pipeline-manifest.json") {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unimplementedRows(manifest) {
  return (manifest.items || []).filter((row) => {
    if (!row.unimplementedRoleNames) return false;
    if (row.uvAnimationGapReason || row.shadergraphStatus !== "ok") return false;
    return true;
  });
}

function main() {
  const manifest = readManifest(process.argv[2]);
  const rows = unimplementedRows(manifest);
  console.log(JSON.stringify({ unimplementedRows: rows.length, sample: rows.slice(0, 20) }, null, 2));
  if (process.argv.includes("--fail-on-unimplemented") && rows.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { readManifest, unimplementedRows };
```

- [ ] **Step 2: Add test**

```js
test("material runtime pipeline status reports unimplemented rows", () => {
  const { unimplementedRows } = require("../tools/material_runtime_pipeline_status");
  const rows = unimplementedRows({
    items: [
      { shadergraphStatus: "ok", unimplementedRoleNames: "reflection", uvAnimationGapReason: "" },
      { shadergraphStatus: "ok", unimplementedRoleNames: "", uvAnimationGapReason: "" },
    ],
  });
  assert.equal(rows.length, 1);
});
```

- [ ] **Step 3: Add npm script**

In `package.json`:

```json
"material:pipeline": "node extracted/tools/material_runtime_pipeline_manifest.js && node extracted/tools/material_runtime_pipeline_status.js"
```

- [ ] **Step 4: Run tests**

```bash
npm run material:pipeline
node --test extracted/tests/material_runtime_pipeline_manifest.test.js
```

Expected: PASS. Do not enable `--fail-on-unimplemented` in `npm test` until Tasks 3-7 have reduced expected gaps.

- [ ] **Step 5: Commit**

```bash
git add package.json extracted/tools/material_runtime_pipeline_status.js extracted/tests/material_runtime_pipeline_manifest.test.js
git commit -m "test: report character material runtime pipeline gaps"
```

**Refresh-visible result:** page diagnostics and CLI reports agree on what remains incomplete.

---

### Task 9: Visual Regression Fixtures and Electron Verification

**Files:**
- Create: `extracted/tests/viewer_material_visual_regression.test.js`
- Modify: `extracted/viewer/app.js` only if stable test hooks are missing

**Interfaces:**
- Consumes: Electron/CDP page at `file:///Users/luwei/code/ai/vainglory/extracted/viewer/index.html`
- Produces: automated checks that representative models load and material diagnostics show zero unexpected gaps for implemented roles.

- [ ] **Step 1: Add fixture list**

Use these model paths because they represent known failure modes from this project:

```js
const materialFixtures = [
  "Characters/Kraken/Art/kraken.glb",
  "Characters/Hero023/Art/hero023_drow.glb",
  "Characters/SAW/Art/saw.glb",
  "Characters/Hero028/Art/hero028_poseidon.glb",
  "Characters/Adagio/Art/adagio.glb",
];
```

- [ ] **Step 2: Write CDP smoke test**

Create `extracted/tests/viewer_material_visual_regression.test.js` with a helper that connects to `http://127.0.0.1:9222/json/list`, selects a model button by path text, waits for render, and evaluates:

```js
{
  path: document.querySelector("#modelPath")?.textContent || "",
  stats: document.querySelector("#modelStats")?.textContent || "",
  health: document.querySelector("#modelHealthText")?.textContent || "",
  canvasPixels: sampleCanvasNonBlackPixels(document.querySelector("canvas")),
}
```

Assertions:

```js
assert.match(result.stats, /材质管线/);
assert.ok(result.canvasPixels > 200, `${fixture} rendered too few visible pixels`);
assert.doesNotMatch(result.health, /未加载模型/);
```

- [ ] **Step 3: Run Electron verification manually**

Start Electron if not running:

```bash
npm run electron:start -- --remote-debugging-port=9222
```

Run:

```bash
node --test extracted/tests/viewer_material_visual_regression.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add extracted/tests/viewer_material_visual_regression.test.js
git commit -m "test: add material runtime visual smoke fixtures"
```

**Refresh-visible result:** future changes to material runtime will be caught on representative heroes instead of relying only on manual browsing.

---

### Final Completion Gate

- [ ] Regenerate material pipeline:

```bash
node extracted/tools/material_runtime_pipeline_manifest.js
node extracted/tools/material_runtime_pipeline_status.js
```

- [ ] Run full tests:

```bash
npm test
```

- [ ] Run Electron visual smoke test:

```bash
node --test extracted/tests/viewer_material_visual_regression.test.js
```

- [ ] Manually refresh Electron and check:
  - `modelStats` contains `材质管线`.
  - `modelHealthText` reports remaining material gaps, if any.
  - No global brightness/color-space compensation has been reintroduced.

```bash
rg -n "normalizePreviewMaterialColorSpaces|toneMappingExposure = 1\\.08|toneMappingExposure:\\s*1\\.16|PREVIEW_COLOR_TEXTURE_KEYS" extracted/viewer extracted/tests
```

Expected: only tests may mention forbidden names via `doesNotMatch`.

## Spec Coverage Review

- Transparency: Task 3 applies `alphaMask` and `alphaBlend` from shadergraph roles.
- Reflection: Task 5 applies `reflection` and `lookup` through shadergraph-backed material patches.
- UV animation: Task 6 reuses existing shadergraph UV descriptors and updates material uniforms per frame.
- Emissive glow: Task 4 applies `emissive` and inline color constants without global exposure changes.
- Special colors: Task 7 maps `uniformColor`, `vertexColor`, water, guob, and bowstring classes into manifest-driven runtime behavior.
- Completeness: Task 8 adds a gap gate; Task 9 adds representative visual smoke coverage.
- Anti-guessing: Global constraints forbid brightness/color-space hacks and one-off hero patches.
