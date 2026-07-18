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

const hero010RainbowShadergraphRel = "Characters/Hero010/Art/hero010_rainbow.rainbow_mat.shadergraph";
const hero055WoadShadergraphRel = "Characters/Hero055/Art/hero055_woad.woad_mat.shadergraph";
const koshkaRaveT1BodyShadergraphRel = "Characters/Koshka/Art/koshka_rave_t1.rave_t1_mat.shadergraph";
const petalBugT3HelmetShadergraphRel = "Characters/Petal/Art/petal_bug_t3.bug_t3_helmet_mat.shadergraph";
const petalBugT3UfoShadergraphRel = "Characters/Petal/Art/petal_bug_t3.bug_t3_UFO_mat.shadergraph";
const ringoShogunT3ArmShadergraphRel = "Characters/Ringo/Art/ringo_shogun_t3.shogun_t3_arm_mat.shadergraph";
const hero010CnyPaletteOffsets = new Map([
  ["Skaarf_Skin_CNY", [0, 0]],
  ["Skaarf_Skin_CNY_A", [0, 1 / 3]],
  ["Skaarf_Skin_CNY_B", [1 / 3, 2 / 3]],
  ["Skaarf_Skin_CNY_C", [1 / 3, 1 / 3]],
  ["Skaarf_Skin_CNY_D", [0, 2 / 3]],
]);
const vainEnergyTintsByRel = new Map([
  ["Characters/Vain5v5Home/Art/vain5v5Home.glb", [0.04, 0.62, 1]],
  ["Characters/Vain5v5Home/Art/vain5v5Away.glb", [1, 0.08, 0.3]],
  ["Characters/VainHome/Art/vainHome.glb", [0.04, 0.62, 1]],
  ["Characters/VainAway/Art/vainAway.glb", [1, 0.08, 0.3]],
]);
const staticHorizontalHalfAtlasShadergraphRels = new Set([
  "Characters/LeadMinion/Art/captainMinion.captain_mat.shadergraph",
  "Characters/Malene/Art/malene.malene_mat.shadergraph",
  "Characters/Malene/Art/malene_candy.candy_mat.shadergraph",
]);

function isHero030HalloweenGreenFire(evidence) {
  return /Hero030\/Art\/hero030_hlwn\.hlwn_greenFire_mat\.shadergraph$/i.test(
    evidence?.shadergraphRel || evidence?.materialName || "",
  );
}

function nativeRenderStateFromEvidence(evidence) {
  const states = evidence?.shaderPassRenderState?.states;
  if (!Array.isArray(states) || states.length !== 1) return null;
  return states[0];
}

function applyNativeRenderStateSettings(material, evidence) {
  const state = nativeRenderStateFromEvidence(evidence);
  if (!state) return false;
  if (typeof state.blendEnabled === "boolean") material.transparent = state.blendEnabled;
  if (typeof state.depthWrite === "boolean") material.depthWrite = state.depthWrite;
  if (typeof state.depthTest === "boolean") material.depthTest = state.depthTest;
  if (state.blendPreset === "premultiplied-alpha-rgb") material.premultipliedAlpha = true;
  else if (state.blendPreset === "disabled") material.premultipliedAlpha = false;
  if (state.colorMask && Object.values(state.colorMask).some((value) => value === false)) {
    material.colorWrite = Boolean(state.colorMask.r || state.colorMask.g || state.colorMask.b || state.colorMask.a);
  }
  return true;
}

function appendCustomProgramCacheKey(material, keyPart) {
  const previous = material.customProgramCacheKey;
  material.customProgramCacheKey = () => {
    const previousKey = typeof previous === "function" ? previous.call(material) : "";
    return [previousKey, keyPart].filter(Boolean).join("|");
  };
}

export function alphaRuntimeSettings(evidence) {
  let settings;
  if (evidence?.alphaRuntimeStage === "runtime-opaque-mask") {
    settings = { transparent: false, alphaTest: 0, depthWrite: true };
  } else {
    const roles = new Set(evidence?.roleNames || []);
    if (evidence?.recommendedAlphaMode === "BLEND" || roles.has("alphaBlend")) {
      settings = { transparent: true, alphaTest: 0, depthWrite: false };
    } else if (evidence?.recommendedAlphaMode === "MASK" || roles.has("alphaMask")) {
      settings = { transparent: false, alphaTest: 0.35, depthWrite: true };
    } else {
      settings = { transparent: false, alphaTest: 0, depthWrite: true };
    }
  }
  const nativeState = nativeRenderStateFromEvidence(evidence);
  if (nativeState) {
    if (typeof nativeState.blendEnabled === "boolean") settings.transparent = nativeState.blendEnabled;
    if (typeof nativeState.depthWrite === "boolean") settings.depthWrite = nativeState.depthWrite;
    if (typeof nativeState.depthTest === "boolean") settings.depthTest = nativeState.depthTest;
    if (nativeState.blendPreset === "premultiplied-alpha-rgb") settings.premultipliedAlpha = true;
    else if (nativeState.blendPreset === "disabled") settings.premultipliedAlpha = false;
    if (!nativeState.blendEnabled && evidence?.alphaRuntimeStage === "runtime-alpha-mask") {
      settings.alphaTest = Math.max(settings.alphaTest || 0, 0.35);
    }
  }
  return settings;
}

export function alphaRuntimeIsExecutable(evidence) {
  if (evidence?.alphaExecutionMode === "diagnostic") return false;
  if (evidence?.missingGlbRoleNames?.includes?.("alpha") && evidence?.alphaExecutionMode !== "runtime") return false;
  if (evidence?.unimplementedRoleNames?.includes?.("alpha")) return false;
  return true;
}

function uvAnimationOwnsDiffuseAlpha(evidence) {
  const mode = evidence?.previewUvAnimation?.mode || "";
  if (isHero030HalloweenGreenFire(evidence) && mode === "multiScrollAdditive") return true;
  return (
    evidence?.uvAnimationExecutionMode === "runtime" &&
    (mode === "dualScrollFresnelMask" || mode === "waterWallComposite" || mode === "nestedSampledUvDistort")
  );
}

function runtimeCanOverrideAlphaDepth(evidence) {
  return alphaRuntimeIsExecutable(evidence);
}

export function applyCharacterAlphaRuntime(material, evidence, loadTexture) {
  if (evidence?.shadergraphRel === koshkaRaveT1BodyShadergraphRel) {
    material.alphaMap = null;
    material.transparent = false;
    material.alphaTest = 0;
    material.depthWrite = true;
    applyNativeRenderStateSettings(material, evidence);
    material.needsUpdate = true;
    return material;
  }
  if (evidence?.shadergraphRel === petalBugT3UfoShadergraphRel) {
    material.alphaMap = null;
    material.transparent = false;
    material.alphaTest = 0;
    material.opacity = 1;
    material.depthWrite = true;
    applyNativeRenderStateSettings(material, evidence);
    material.needsUpdate = true;
    return material;
  }
  const roles = new Set(evidence?.roleNames || []);
  if (!roles.has("alphaMask") && !roles.has("alphaBlend")) return material;
  if (!alphaRuntimeIsExecutable(evidence)) return material;
  const settings = alphaRuntimeSettings(evidence);
  material.transparent = settings.transparent;
  material.alphaTest = settings.alphaTest;
  material.depthWrite = settings.depthWrite;
  if (typeof settings.depthTest === "boolean") material.depthTest = settings.depthTest;
  if (typeof settings.premultipliedAlpha === "boolean") material.premultipliedAlpha = settings.premultipliedAlpha;
  if (
    evidence?.roleTexturePaths?.alphaMask &&
    evidence?.alphaRuntimeStage !== "runtime-opaque-mask" &&
    !uvAnimationOwnsDiffuseAlpha(evidence) &&
    typeof loadTexture === "function"
  ) {
    material.alphaMap = loadTexture(evidence.roleTexturePaths.alphaMask, "data");
  }
  material.needsUpdate = true;
  return material;
}

export function emissiveColorFromInlineColors(inlineColors) {
  for (const item of inlineColors || []) {
    const rgb = numericRgbFromInlineColor(item);
    if (rgb) return rgb;
  }
  return null;
}

export function applyCharacterEmissiveRuntime(material, evidence, loadTexture, THREE) {
  const roles = new Set(evidence?.roleNames || []);
  const emissiveTexturePath = evidence?.roleTexturePaths?.emissive || "";
  if (!roles.has("emissive") && !emissiveTexturePath) return material;
  const color = emissiveColorFromInlineColors(evidence?.inlineColors);
  if (color) {
    if (!material.emissive && THREE?.Color) material.emissive = new THREE.Color();
    material.emissive?.setRGB?.(color[0], color[1], color[2]);
  }
  if (emissiveTexturePath && typeof loadTexture === "function") {
    material.emissiveMap = loadTexture(emissiveTexturePath, "color");
  }
  material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 1);
  material.needsUpdate = true;
  return material;
}

export function applyCharacterBaseColorRuntime(material, evidence, loadTexture, THREE, runtimeContext = {}) {
  if (
    material.map &&
    evidence?.shadergraphRel === "Characters/Hero012/Art/hero012_nether.nether_mat.shadergraph"
  ) {
    const staticEnergyPath = evidence?.samplerTexturePaths?.sampler117 || "";
    const energyMaskPath = evidence?.samplerTexturePaths?.sampler147 || "";
    const energyNoisePath = evidence?.samplerTexturePaths?.sampler179 || "";
    if (staticEnergyPath && energyMaskPath && energyNoisePath && typeof loadTexture === "function") {
      const staticEnergyMap = loadTexture(staticEnergyPath, "color");
      const energyMaskMap = loadTexture(energyMaskPath, "data");
      const energyNoiseMap = loadTexture(energyNoisePath, "data");
      staticEnergyMap.flipY = false;
      energyMaskMap.flipY = false;
      energyNoiseMap.flipY = false;
      const uniforms = {
        characterUvRuntimeTime: { value: 0 },
        characterNetherStaticEnergyMap: { value: staticEnergyMap },
        characterNetherEnergyMaskMap: { value: energyMaskMap },
        characterNetherEnergyNoiseMap: { value: energyNoiseMap },
      };
      material.userData ||= {};
      material.userData.characterUvRuntimeUniforms = uniforms;
      const previousOnBeforeCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader) => {
        previousOnBeforeCompile?.(shader);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = `uniform float characterUvRuntimeTime;
uniform sampler2D characterNetherStaticEnergyMap;
uniform sampler2D characterNetherEnergyMaskMap;
uniform sampler2D characterNetherEnergyNoiseMap;
${shader.fragmentShader}`.replace(
          "#include <opaque_fragment>",
          `// The native HDR hue (#FF3D24) converted to linear RGB,
// rescaled by its original 5.978 peak for Three's ACES pipeline.
#ifdef USE_MAP
  vec3 characterNetherStaticEnergy = texture2D(characterNetherStaticEnergyMap, vMapUv).rgb;
  float characterNetherMask = texture2D(characterNetherEnergyMaskMap, vMapUv).r;
  float characterNetherNoise = texture2D(
    characterNetherEnergyNoiseMap,
    vMapUv + vec2(0.0, fract(characterUvRuntimeTime * -0.1))
  ).r;
  vec3 characterNetherEnergy = characterNetherStaticEnergy
    + vec3(5.978, 0.28327, 0.105365) * (characterNetherMask * characterNetherNoise * characterNetherNoise * 1.75);
  outgoingLight += characterNetherEnergy;
#endif
#include <opaque_fragment>`,
        );
      };
      appendCustomProgramCacheKey(material, "hero012-nether-energy-surface");
      material.needsUpdate = true;
      return material;
    }
  }
  if (material.map && evidence?.shadergraphRel === hero010RainbowShadergraphRel) {
    const paletteTexturePath = evidence?.samplerTexturePaths?.sampler93 || "";
    const overlayTexturePath = evidence?.samplerTexturePaths?.sampler161 || "";
    const gradientTexturePath = evidence?.samplerTexturePaths?.sampler198 || "";
    if (paletteTexturePath && overlayTexturePath && gradientTexturePath && typeof loadTexture === "function") {
      const paletteTexture = loadTexture(paletteTexturePath, "color");
      const overlayTexture = loadTexture(overlayTexturePath, "color");
      const gradientTexture = loadTexture(gradientTexturePath, "color");
      paletteTexture.flipY = false;
      overlayTexture.flipY = false;
      gradientTexture.flipY = false;
      const uniforms = {
        characterUvRuntimeTime: { value: 0 },
        characterRainbowPaletteMap: { value: paletteTexture },
        characterRainbowOverlayMap: { value: overlayTexture },
        characterRainbowGradientMap: { value: gradientTexture },
      };
      material.userData ||= {};
      material.userData.characterUvRuntimeUniforms = uniforms;
      const previousOnBeforeCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader) => {
        previousOnBeforeCompile?.(shader);
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = `uniform float characterUvRuntimeTime;
uniform sampler2D characterRainbowPaletteMap;
uniform sampler2D characterRainbowOverlayMap;
uniform sampler2D characterRainbowGradientMap;
${shader.fragmentShader}`
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
#ifdef USE_MAP
  vec4 characterRainbowPalette = texture2D(characterRainbowPaletteMap, vMapUv * vec2(0.5) + vec2(1.5, 0.5));
  vec4 characterRainbowOverlay = texture2D(characterRainbowOverlayMap, vMapUv);
  vec3 characterRainbowAdditionalSurface =
    texture2D(
      characterRainbowGradientMap,
      vMapUv * vec2(2.0, 4.0) + vec2(fract(characterUvRuntimeTime * -0.75), 0.5)
    ).rgb * characterRainbowOverlay.a
    + max(
      clamp(characterRainbowPalette.rgb - vec3(0.5), vec3(0.0), vec3(1.0)),
      characterRainbowOverlay.rgb
    ) * (1.0 - characterRainbowOverlay.a);
  diffuseColor.rgb *= characterRainbowPalette.rgb * 2.0;
#endif`,
          )
          .replace(
            "#include <opaque_fragment>",
            `#ifdef USE_MAP
  outgoingLight += characterRainbowAdditionalSurface;
#endif
#include <opaque_fragment>`,
          );
      };
      appendCustomProgramCacheKey(material, "hero010-rainbow-surface");
      material.needsUpdate = true;
      return material;
    }
  }
  if (
    material.map &&
    evidence?.shadergraphRel === "Characters/Hero010/Art/hero010_CNY.CNY_mat.shadergraph"
  ) {
    const paletteTexturePath = evidence?.samplerTexturePaths?.sampler62 || "";
    if (paletteTexturePath && typeof loadTexture === "function") {
      const activeSkinId = String(runtimeContext.activeSkinId || "");
      const paletteOffset = hero010CnyPaletteOffsets.get(activeSkinId) || hero010CnyPaletteOffsets.get("Skaarf_Skin_CNY");
      const paletteTexture = loadTexture(paletteTexturePath, "color");
      paletteTexture.flipY = false;
      const previousOnBeforeCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader) => {
        previousOnBeforeCompile?.(shader);
        shader.uniforms.characterCnyPaletteMap = { value: paletteTexture };
        shader.uniforms.characterCnyPaletteOffset = {
          value: THREE?.Vector2 ? new THREE.Vector2(paletteOffset[0], paletteOffset[1]) : { x: paletteOffset[0], y: paletteOffset[1] },
        };
        shader.fragmentShader = `uniform sampler2D characterCnyPaletteMap;\nuniform vec2 characterCnyPaletteOffset;\n${shader.fragmentShader}`.replace(
          "#include <map_fragment>",
          `#include <map_fragment>\n#ifdef USE_MAP\n  diffuseColor.rgb *= texture2D(characterCnyPaletteMap, vMapUv * vec2(0.3333333333) + characterCnyPaletteOffset).rgb * 2.0;\n#endif`,
        );
      };
      appendCustomProgramCacheKey(material, `hero010-cny-palette:${activeSkinId || "base"}`);
      material.needsUpdate = true;
      return material;
    }
  }
  const baseColorSamplerOverride =
    evidence?.shadergraphRel === "Characters/Hero009/Art/hero009_cyber.cyber_mat.shadergraph"
      ? "sampler59"
      : evidence?.shadergraphRel === "Characters/Hero012/Art/hero012_glad.glad_mat.shadergraph"
        ? "sampler57"
        : evidence?.shadergraphRel === hero055WoadShadergraphRel
          ? "sampler57"
        : "";
  const overrideTexturePath = evidence?.samplerTexturePaths?.[baseColorSamplerOverride] || "";
  const texturePath = overrideTexturePath || evidence?.roleTexturePaths?.baseColor || "";
  if (!texturePath || typeof loadTexture !== "function") return material;
  if (material.map && !overrideTexturePath && !evidence?.missingGlbRoleNames?.includes?.("baseColor")) return material;
  const texture = loadTexture(texturePath, "color");
  if (overrideTexturePath) texture.flipY = false;
  material.map = texture;
  material.needsUpdate = true;
  return material;
}

function inlineColorRgb(inlineColors) {
  return emissiveColorFromInlineColors(inlineColors);
}

function numericRgbFromInlineColor(item) {
  const source = Array.isArray(item?.rgb) ? item.rgb : Array.isArray(item?.values) ? item.values : [];
  const rgb = source.slice(0, 3).map((value) => Number(value));
  return rgb.length === 3 && rgb.every((value) => Number.isFinite(value)) ? rgb : null;
}

function setMaterialColor(color, rgb, fallbackHex) {
  if (!color) return;
  if (rgb) {
    color.setRGB?.(rgb[0], rgb[1], rgb[2]);
    return;
  }
  if (fallbackHex !== undefined) color.set?.(fallbackHex);
}

function constantFragmentColorFromEvidence(evidence) {
  const rgba = evidence?.nativeShaderInputs?.constantFragmentColor?.rgba;
  if (!Array.isArray(rgba) || rgba.length < 4) return null;
  const values = rgba.slice(0, 4).map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 8)) return null;
  return values;
}

function patchConstantFragmentColorShader(fragmentShader, rgba) {
  const color = `vec4(${glslNumber(rgba[0])}, ${glslNumber(rgba[1])}, ${glslNumber(rgba[2])}, ${glslNumber(rgba[3])})`;
  return fragmentShader.replace("#include <output_fragment>", `gl_FragColor = ${color};`);
}

function patchVertexColorAlphaShader(fragmentShader) {
  const outputBody = `
#if defined( USE_COLOR_ALPHA )
  gl_FragColor = vec4(vColor.rgb, vColor.a);
#elif defined( USE_COLOR )
  gl_FragColor = vec4(vColor.rgb, 1.0);
#else
  gl_FragColor = vec4(1.0);
#endif
`;
  return fragmentShader.replace("#include <output_fragment>", outputBody);
}

function vertexAlphaUniformColorFromEvidence(evidence) {
  const color = evidence?.nativeShaderInputs?.vertexAlphaUniformColor?.color;
  const alpha = Number(evidence?.nativeShaderInputs?.vertexAlphaUniformColor?.alpha);
  if (!Array.isArray(color) || color.length < 3 || !Number.isFinite(alpha)) return null;
  const rgb = color.slice(0, 3).map((value) => Number(value));
  if (rgb.some((value) => !Number.isFinite(value) || value < 0 || value > 8) || alpha < 0 || alpha > 1) return null;
  return { rgb, alpha };
}

function patchVertexAlphaUniformColorShader(fragmentShader, settings) {
  const rgb = glslVec3(settings.rgb);
  const outputBody = `
#if defined( USE_COLOR_ALPHA )
  gl_FragColor = vec4(${rgb} * vColor.a, ${glslNumber(settings.alpha)});
#elif defined( USE_COLOR )
  gl_FragColor = vec4(${rgb}, ${glslNumber(settings.alpha)});
#else
  gl_FragColor = vec4(${rgb}, ${glslNumber(settings.alpha)});
#endif
`;
  return fragmentShader.replace("#include <output_fragment>", outputBody);
}

function applyConstantFragmentColorRuntime(material, evidence) {
  const rgba = constantFragmentColorFromEvidence(evidence);
  if (!rgba) return material;
  material.map = null;
  material.alphaMap = null;
  material.emissiveMap = null;
  material.vertexColors = false;
  material.opacity = Math.min(1, Math.max(0, rgba[3]));
  material.transparent = rgba[3] < 1 || evidence?.shaderPassBlendEnabled === "true";
  material.depthWrite = !material.transparent;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.fragmentShader = patchConstantFragmentColorShader(shader.fragmentShader, rgba);
  };
  appendCustomProgramCacheKey(material, `constant-fragment-color:${rgba.join(",")}`);
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "constantFragmentColor";
  material.userData.characterConstantFragmentColorRuntime = { rgba };
  material.needsUpdate = true;
  return material;
}

function applyVertexAlphaUniformColorRuntime(material, evidence) {
  const settings = vertexAlphaUniformColorFromEvidence(evidence);
  if (!settings) return material;
  material.map = null;
  material.alphaMap = null;
  material.emissiveMap = null;
  material.vertexColors = true;
  material.transparent = true;
  material.depthWrite = false;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.fragmentShader = patchVertexAlphaUniformColorShader(shader.fragmentShader, settings);
  };
  appendCustomProgramCacheKey(material, `vertex-alpha-uniform-color:${settings.rgb.join(",")}:${settings.alpha}`);
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "vertexAlphaUniformColor";
  material.userData.characterVertexAlphaUniformColorRuntime = settings;
  material.needsUpdate = true;
  return material;
}

function applyVertexColorAlphaRuntime(material, evidence) {
  if (evidence?.nativeShaderInputs?.vertexColorAlphaFragment?.mode !== "vertex-color-alpha-fragment") return material;
  material.map = null;
  material.alphaMap = null;
  material.emissiveMap = null;
  material.vertexColors = true;
  material.transparent = true;
  material.depthWrite = false;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.fragmentShader = patchVertexColorAlphaShader(shader.fragmentShader);
  };
  appendCustomProgramCacheKey(material, "vertex-color-alpha-fragment");
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "vertexColorAlpha";
  material.userData.characterVertexColorAlphaRuntime = evidence.nativeShaderInputs.vertexColorAlphaFragment;
  material.needsUpdate = true;
  return material;
}

export function patchPetalBugT3HelmetFragmentShader(fragmentShader) {
  const header = `uniform sampler2D characterPetalHelmetReflectionMap;
vec2 characterPetalHelmetRamp(float value) {
  float x = clamp(value, 0.0, 1.0);
  if (x <= 0.174603) return mix(vec2(0.659, 0.647), vec2(0.41877, 0.422734), x / 0.174603);
  if (x <= 0.412698) return mix(vec2(0.41877, 0.422734), vec2(0.406884, 0.0), (x - 0.174603) / 0.238095);
  if (x <= 0.68254) return mix(vec2(0.406884, 0.0), vec2(0.39532, 0.0), (x - 0.412698) / 0.269842);
  if (x <= 0.698413) return mix(vec2(0.39532, 0.0), vec2(0.38428, 0.0), (x - 0.68254) / 0.015873);
  return mix(vec2(0.38428, 0.0), vec2(0.0), (x - 0.698413) / 0.301587);
}`;
  const mapBody = `
vec3 characterPetalHelmetNormal = normalize(vNormal);
vec3 characterPetalHelmetEye = normalize(vViewPosition);
vec3 characterPetalHelmetReflection = reflect(-characterPetalHelmetEye, characterPetalHelmetNormal);
vec3 characterPetalHelmetSphere = vec3(
  characterPetalHelmetReflection.xy,
  characterPetalHelmetReflection.z + 1.0
);
float characterPetalHelmetSphereLength = max(
  dot(characterPetalHelmetSphere, characterPetalHelmetSphere),
  0.00001
);
vec2 characterPetalHelmetUv = characterPetalHelmetReflection.xy
  * (inversesqrt(characterPetalHelmetSphereLength) * 0.5)
  + vec2(0.5);
vec2 characterPetalHelmetScaleOffset = characterPetalHelmetRamp(
  dot(characterPetalHelmetEye, characterPetalHelmetNormal)
);
vec3 characterPetalHelmetColor = texture2D(
  characterPetalHelmetReflectionMap,
  characterPetalHelmetUv
).rgb * characterPetalHelmetScaleOffset.x + vec3(characterPetalHelmetScaleOffset.y);
`;
  return `${header}\n${fragmentShader
    .replace("#include <map_fragment>", mapBody)
    .replace("#include <opaque_fragment>", "gl_FragColor = vec4(characterPetalHelmetColor, 0.0);")}`;
}

function applyPetalBugT3HelmetRuntime(material, evidence, loadTexture, THREE) {
  const reflectionTexturePath = evidence?.samplerTexturePaths?.sampler44 || evidence?.roleTexturePaths?.baseColor || "";
  if (!reflectionTexturePath || typeof loadTexture !== "function") return material;
  const reflectionMap = loadTexture(reflectionTexturePath, "data");
  if (!reflectionMap) return material;

  material.map = null;
  material.alphaMap = null;
  material.normalMap = null;
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.emissiveMap = null;
  material.alphaTest = 0;
  material.opacity = 1;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.premultipliedAlpha = false;
  material.metalness = 0;
  material.roughness = 1;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  material.premultipliedAlpha = false;
  if (THREE?.CustomBlending !== undefined) {
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquation = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = THREE.AddEquation;
  }
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.characterPetalHelmetReflectionMap = { value: reflectionMap };
    shader.fragmentShader = patchPetalBugT3HelmetFragmentShader(shader.fragmentShader);
  };
  appendCustomProgramCacheKey(material, "petal-bug-t3-reflective-helmet");
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "petalBugT3ReflectiveHelmet";
  material.needsUpdate = true;
  return material;
}

export function patchPetalBugT3UfoFragmentShader(fragmentShader) {
  const header = `uniform sampler2D characterPetalUfoAdditiveMap;
uniform sampler2D characterPetalUfoReflectionMap;`;
  const mapBody = `
vec3 characterPetalUfoAdditionalColor = vec3(0.0);
#ifdef USE_MAP
  vec4 characterPetalUfoBase = texture2D(map, vMapUv);
  vec3 characterPetalUfoNormal = normalize(vNormal);
  vec3 characterPetalUfoEye = normalize(vViewPosition);
  float characterPetalUfoViewDot = clamp(
    dot(characterPetalUfoEye, characterPetalUfoNormal),
    0.0,
    1.0
  );
  float characterPetalUfoRim = clamp((0.586 - characterPetalUfoViewDot) / 0.256, 0.0, 1.0);
  diffuseColor = vec4(
    characterPetalUfoBase.rgb * (1.0 + characterPetalUfoRim * 0.6),
    1.0
  );

  vec3 characterPetalUfoReflection = reflect(
    -characterPetalUfoEye,
    characterPetalUfoNormal
  );
  vec3 characterPetalUfoSphere = vec3(
    characterPetalUfoReflection.xy,
    characterPetalUfoReflection.z + 1.0
  );
  float characterPetalUfoSphereLength = max(
    dot(characterPetalUfoSphere, characterPetalUfoSphere),
    0.00001
  );
  vec2 characterPetalUfoReflectionUv = characterPetalUfoReflection.xy
    * (inversesqrt(characterPetalUfoSphereLength) * 0.5)
    + vec2(0.5);
  vec3 characterPetalUfoReflectionTint = vec3(0.85, 1.0, 1.15);
  float characterPetalUfoReflectionMask = characterPetalUfoBase.a * characterPetalUfoBase.a * 1.5;
  characterPetalUfoAdditionalColor = texture2D(
    characterPetalUfoAdditiveMap,
    vMapUv
  ).rgb + texture2D(
    characterPetalUfoReflectionMap,
    characterPetalUfoReflectionUv
  ).rgb * characterPetalUfoReflectionMask
    * characterPetalUfoReflectionTint * characterPetalUfoReflectionTint;
#endif
`;
  const outputBody = `outgoingLight += characterPetalUfoAdditionalColor;
#include <opaque_fragment>`;
  return `${header}\n${fragmentShader
    .replace("#include <map_fragment>", mapBody)
    .replace("#include <opaque_fragment>", outputBody)}`;
}

function applyPetalBugT3UfoRuntime(material, evidence, loadTexture) {
  const additiveTexturePath = evidence?.samplerTexturePaths?.sampler92 || "";
  const reflectionTexturePath = evidence?.samplerTexturePaths?.sampler84 || evidence?.roleTexturePaths?.reflection || "";
  if (!material.map || !additiveTexturePath || !reflectionTexturePath || typeof loadTexture !== "function") return material;
  const additiveMap = loadTexture(additiveTexturePath, "color");
  const reflectionMap = loadTexture(reflectionTexturePath, "data");
  if (!additiveMap || !reflectionMap) return material;

  material.alphaMap = null;
  material.emissiveMap = null;
  material.alphaTest = 0;
  material.opacity = 1;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  material.premultipliedAlpha = false;
  material.metalness = 0;
  material.roughness = 0.72;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.characterPetalUfoAdditiveMap = { value: additiveMap };
    shader.uniforms.characterPetalUfoReflectionMap = { value: reflectionMap };
    shader.fragmentShader = patchPetalBugT3UfoFragmentShader(shader.fragmentShader);
  };
  appendCustomProgramCacheKey(material, "petal-bug-t3-ufo-surface");
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "petalBugT3UfoSurface";
  material.needsUpdate = true;
  return material;
}

export function colorRuntimeSettings(evidence) {
  return {
    vertexColors:
      evidence?.colorMode === "vertex-color" ||
      evidence?.colorMode === "vertexColorAlpha" ||
      evidence?.colorMode === "vertexAlphaUniformColor",
  };
}

export function applyCharacterColorRuntime(material, evidence, loadTexture, THREE) {
  if (evidence?.shadergraphRel === petalBugT3HelmetShadergraphRel) {
    return applyPetalBugT3HelmetRuntime(material, evidence, loadTexture, THREE);
  }
  if (evidence?.shadergraphRel === petalBugT3UfoShadergraphRel) {
    return applyPetalBugT3UfoRuntime(material, evidence, loadTexture);
  }
  if (evidence?.colorExecutionMode === "diagnostic") return material;
  const settings = colorRuntimeSettings(evidence);
  material.vertexColors = settings.vertexColors;
  const colorMode = evidence?.colorMode || "";
  const inlineColor = inlineColorRgb(evidence?.inlineColors);
  if (colorMode === "inline-uniform") {
    setMaterialColor(material.color, inlineColor);
  } else if (colorMode === "constantFragmentColor") {
    return applyConstantFragmentColorRuntime(material, evidence);
  } else if (colorMode === "vertexColorAlpha") {
    return applyVertexColorAlphaRuntime(material, evidence);
  } else if (colorMode === "vertexAlphaUniformColor") {
    return applyVertexAlphaUniformColorRuntime(material, evidence);
  } else if (colorMode === "water") {
    if (!runtimeCanOverrideAlphaDepth(evidence)) return material;
    const isWaterOpaque = /waterOpaque/i.test(`${evidence?.materialName || ""} ${evidence?.shadergraphRel || ""}`);
    const compositeFormula = evidence?.uvAnimationCompositeFormula;
    const compositeColor = Array.isArray(compositeFormula?.constantBaseColor)
      ? compositeFormula.constantBaseColor
      : compositeFormula?.baseColorRamp?.ramp?.[0];
    const waterColor =
      Array.isArray(compositeColor) && compositeColor.length >= 3 && compositeColor.slice(0, 3).every(Number.isFinite)
        ? compositeColor.slice(0, 3)
        : inlineColor;
    setMaterialColor(material.color, waterColor, isWaterOpaque ? 0x2fabc0 : 0x349bb9);
    if (material.emissive) setMaterialColor(material.emissive, waterColor ? waterColor.map((value) => value * 0.3) : null, 0x123940);
    material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, isWaterOpaque ? 0.08 : 0.18);
    material.roughness = isWaterOpaque ? 0.5 : 0.68;
    material.metalness = 0;
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, isWaterOpaque ? 0.28 : 0.16);
    material.transparent = isWaterOpaque;
    material.opacity = isWaterOpaque ? 0.86 : 1;
    material.depthWrite = true;
    if (THREE?.DoubleSide !== undefined) material.side = THREE.DoubleSide;
  } else if (colorMode === "guob") {
    if (!runtimeCanOverrideAlphaDepth(evidence)) return material;
    const inlineAlpha = (evidence?.inlineColors || []).find((item) => Number.isFinite(Number(item?.alpha)))?.alpha;
    setMaterialColor(material.color, inlineColor, 0x10353d);
    if (material.emissive) setMaterialColor(material.emissive, inlineColor ? inlineColor.map((value) => value * 0.4) : null, 0x06191d);
    material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.08);
    material.roughness = 1;
    material.metalness = 0;
    material.envMapIntensity = 0;
    material.transparent = true;
    material.opacity = Number.isFinite(Number(inlineAlpha)) ? Number(inlineAlpha) : 0.38;
    material.depthWrite = false;
    if (THREE?.DoubleSide !== undefined) material.side = THREE.DoubleSide;
  } else if (colorMode === "bowstring") {
    if (!runtimeCanOverrideAlphaDepth(evidence)) return material;
    material.transparent = true;
    material.depthWrite = false;
    if (THREE?.DoubleSide !== undefined) material.side = THREE.DoubleSide;
  } else if (colorMode === "rimLookupGlow") {
    return applyCharacterRimLookupGlowRuntime(material, evidence, THREE);
  } else if (colorMode === "viewDotRamp") {
    return applyCharacterViewDotRampRuntime(material, evidence, loadTexture, THREE);
  } else if (colorMode === "creatureLookupLit") {
    return applyCharacterCreatureLookupLitRuntime(material, evidence, loadTexture, THREE);
  }
  if (colorMode || settings.vertexColors) {
    applyNativeRenderStateSettings(material, evidence);
    material.userData ||= {};
    material.userData.vaingloryRuntimeColorModeApplied = colorMode || (settings.vertexColors ? "vertex-color" : "");
    material.needsUpdate = true;
  }
  return material;
}

export function rimLookupGlowSettings(evidence) {
  const glow = evidence?.rimLookupGlow;
  if (evidence?.colorMode !== "rimLookupGlow" || glow?.mode !== "viewDotSamplerRamp") return null;
  const ramp = Array.isArray(glow.ramp) ? glow.ramp : [];
  if (ramp.length !== 64) return null;
  const normalizedRamp = [];
  for (const sample of ramp) {
    if (!Array.isArray(sample) || sample.length < 3) return null;
    const rgb = sample.slice(0, 3).map((value) => Number(value));
    if (rgb.some((value) => !Number.isFinite(value) || value < 0 || value > 4)) return null;
    normalizedRamp.push(rgb);
  }
  return {
    mode: glow.mode,
    ramp: normalizedRamp,
    rampHash: evidence?.rimLookupGlowRampHash || glow.rampHash || "",
  };
}

function glslVec3(rgb) {
  return `vec3(${glslNumber(rgb?.[0])}, ${glslNumber(rgb?.[1])}, ${glslNumber(rgb?.[2])})`;
}

function rampLookupFunction(functionName, ramp) {
  const safeFunctionName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName) ? functionName : "characterRampLookup";
  const lines = [`vec3 ${safeFunctionName}(float value) {`, "  float x = clamp(value, 0.0, 1.0) * 63.0;"];
  lines.push(`  if (x <= 0.0) return ${glslVec3(ramp[0])};`);
  for (let index = 1; index < ramp.length; index += 1) {
    lines.push(
      `  if (x < ${glslNumber(index)}) return mix(${glslVec3(ramp[index - 1])}, ${glslVec3(ramp[index])}, x - ${glslNumber(
        index - 1,
      )});`,
    );
  }
  lines.push(`  return ${glslVec3(ramp[ramp.length - 1])};`);
  lines.push("}");
  return lines.join("\n");
}

function rimLookupRampFunction(ramp) {
  return rampLookupFunction("characterRimLookupRamp", ramp);
}

export function patchRimLookupGlowFragmentShader(fragmentShader, settings) {
  if (!settings?.ramp?.length) return fragmentShader;
  const header = rimLookupRampFunction(settings.ramp);
  const mapBody = `
float characterRimLookupDot = clamp(dot(normalize(-vViewPosition), normalize(vNormal)), 0.0, 1.0);
vec3 characterRimLookupColor = characterRimLookupRamp(characterRimLookupDot);
diffuseColor = vec4(characterRimLookupColor, 0.0);
`;
  const outputBody = "gl_FragColor = vec4(characterRimLookupColor, 0.0);";
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", mapBody).replace("#include <output_fragment>", outputBody)}`;
}

export function applyCharacterRimLookupGlowRuntime(material, evidence, THREE) {
  const settings = rimLookupGlowSettings(evidence);
  if (!settings) return material;
  material.map = null;
  material.alphaMap = null;
  material.emissiveMap = null;
  material.alphaTest = 0;
  material.opacity = 1;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.premultipliedAlpha = false;
  if (THREE?.CustomBlending !== undefined) {
    material.blending = THREE.CustomBlending;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquation = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = THREE.AddEquation;
  }
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.fragmentShader = patchRimLookupGlowFragmentShader(shader.fragmentShader, settings);
  };
  appendCustomProgramCacheKey(material, `character-rim-glow:${settings.rampHash}`);
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "rimLookupGlow";
  material.userData.characterRimLookupGlowRuntime = settings;
  material.needsUpdate = true;
  return material;
}

const viewDotRampFormulaClasses = new Set([
  "base-plus-base-times-viewdot-ramp",
  "base-plus-viewdot-ramp",
  "scaled-viewdot-ramp-times-mask",
  "uniform-color-times-viewdot-ramp",
  "viewdot-ramp-temp-composite",
  "viewdot-ramp-times-sampled-color",
  "viewdot-ramp-times-texture",
]);

function normalizedRgbRamp(ramp, maxValue = 4) {
  if (!Array.isArray(ramp) || ramp.length !== 64) return null;
  const normalizedRamp = [];
  for (const sample of ramp) {
    if (!Array.isArray(sample) || sample.length < 3) return null;
    const rgb = sample.slice(0, 3).map((value) => Number(value));
    if (rgb.some((value) => !Number.isFinite(value) || value < 0 || value > maxValue)) return null;
    normalizedRamp.push(rgb);
  }
  return normalizedRamp;
}

function inlineRampDataTexture(ramp, THREE, name = "VaingloryInlineRamp") {
  if (!THREE?.DataTexture || !Array.isArray(ramp) || ramp.length !== 64) return null;
  const data = new Uint8Array(64 * 4);
  for (let index = 0; index < 64; index += 1) {
    const sample = ramp[index] || [0, 0, 0];
    data[index * 4] = Math.round(Math.min(1, Math.max(0, Number(sample[0]) || 0)) * 255);
    data[index * 4 + 1] = Math.round(Math.min(1, Math.max(0, Number(sample[1]) || 0)) * 255);
    data[index * 4 + 2] = Math.round(Math.min(1, Math.max(0, Number(sample[2]) || 0)) * 255);
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 64, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.needsUpdate = true;
  if (THREE.LinearFilter !== undefined) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  if (THREE.ClampToEdgeWrapping !== undefined) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  if (THREE.NoColorSpace !== undefined) texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  return texture;
}

function normalizedViewDotAnimatedNoiseTerms(terms) {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 6) return null;
  const normalized = terms.map((term) => {
    const speed = Number(term?.speed);
    const offset = Number(term?.offset);
    if (term?.kind !== "fract" || !Number.isFinite(speed) || !Number.isFinite(offset)) return null;
    return { kind: "fract", speed, offset };
  });
  return normalized.every(Boolean) ? normalized : null;
}

function viewDotAnimatedNoiseSettings(composite, loadTexture) {
  if (!composite) return null;
  const uvRepeat = Array.isArray(composite.uvRepeat) && composite.uvRepeat.length === 2 ? composite.uvRepeat.map(Number) : [];
  const xTerms = normalizedViewDotAnimatedNoiseTerms(composite.xTerms);
  const yTerms = normalizedViewDotAnimatedNoiseTerms(composite.yTerms);
  const scale = Number(composite.scale);
  const texturePath = String(composite.texturePath || "");
  const channel = String(composite.channel || "");
  const sampler = String(composite.sampler || "");
  if (
    composite.mode !== "base-plus-base-times-animated-noise" ||
    uvRepeat.length !== 2 ||
    uvRepeat.some((value) => !Number.isFinite(value) || Math.abs(value) < 0.000001 || Math.abs(value) > 64) ||
    !xTerms ||
    !yTerms ||
    !/^sampler\d+$/.test(sampler) ||
    !/^[xyzw]$/.test(channel) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 64 ||
    !texturePath ||
    typeof loadTexture !== "function"
  ) {
    return null;
  }
  const texture = loadTexture(texturePath, "data");
  if (!texture) return null;
  texture.flipY = false;
  return {
    mode: composite.mode,
    sampler,
    texturePath,
    texture,
    channel,
    uvRepeat,
    xTerms,
    yTerms,
    scale,
  };
}

export function viewDotRampSettings(evidence, loadTexture) {
  const rampEvidence = evidence?.viewDotRamp;
  if (evidence?.colorMode !== "viewDotRamp" || rampEvidence?.mode !== "viewDotRampFormula") return null;
  const formulaClass = evidence?.viewDotRampFormulaClass || rampEvidence.formulaClass || "";
  if (!viewDotRampFormulaClasses.has(formulaClass) || !rampEvidence.canRenderNatively) return null;
  const sourceKind = evidence?.viewDotRampSourceKind || rampEvidence.sourceKind || "";
  const animatedNoiseComposite =
    formulaClass === "base-plus-viewdot-ramp"
      ? viewDotAnimatedNoiseSettings(rampEvidence.animatedNoiseComposite, loadTexture)
      : null;
  const settings = {
    mode: rampEvidence.mode,
    formulaClass,
    sourceKind,
    rampHash: evidence?.viewDotRampHash || rampEvidence.rampHash || "",
    animatedNoiseComposite,
  };
  if (formulaClass === "uniform-color-times-viewdot-ramp") {
    const uniformColor = Array.isArray(rampEvidence.uniformColor) ? rampEvidence.uniformColor.slice(0, 3).map((value) => Number(value)) : [];
    if (uniformColor.length !== 3 || uniformColor.some((value) => !Number.isFinite(value) || value < 0 || value > 8)) return null;
    settings.uniformColor = uniformColor;
  }

  if (sourceKind === "inline-ramp") {
    const ramp = normalizedRgbRamp(rampEvidence.ramp, 4);
    if (!ramp) return null;
    const uvMaskRamp = normalizedRgbRamp(rampEvidence.uvMaskRamp, 4);
    return {
      ...settings,
      ramp,
      uvMaskRamp,
      uvMaskRampHash: rampEvidence.uvMaskRampHash || "",
      uvMaskSampler: rampEvidence.uvMaskSampler || "",
    };
  }

  if (sourceKind === "texture-path") {
    const texturePath = rampEvidence.texturePath || "";
    if (!texturePath || typeof loadTexture !== "function") return null;
    return { ...settings, texturePath, rampTexture: loadTexture(texturePath, "color") };
  }

  return null;
}

function viewDotRampSampleFunction(settings) {
  if (settings?.sourceKind === "inline-ramp") {
    return {
      header: rampLookupFunction("characterViewDotRampLookup", settings.ramp),
      uniforms: {},
      sampleExpression: "characterViewDotRampLookup(characterViewDotRampDot)",
    };
  }
  if (settings?.sourceKind === "texture-path") {
    return {
      header: "uniform sampler2D characterViewDotRampMap;",
      uniforms: { characterViewDotRampMap: { value: settings.rampTexture } },
      sampleExpression: "texture2D(characterViewDotRampMap, vec2(characterViewDotRampDot, 0.5)).rgb",
    };
  }
  return null;
}

function viewDotRampFormulaBody(settings) {
  const formulaClass = settings?.formulaClass || "";
  const alphaBody = settings?.uvMaskRamp ? "\ndiffuseColor.a = 0.0;" : "";
  if (formulaClass === "base-plus-base-times-viewdot-ramp") {
    return `diffuseColor.rgb += diffuseColor.rgb * characterViewDotRampColor * 0.8;${alphaBody}`;
  }
  if (formulaClass === "base-plus-viewdot-ramp") {
    return `diffuseColor.rgb += characterViewDotRampColor;${alphaBody}`;
  }
  if (formulaClass === "scaled-viewdot-ramp-times-mask") {
    return `diffuseColor.rgb *= characterViewDotRampColor * 2.0;${alphaBody}`;
  }
  if (formulaClass === "viewdot-ramp-temp-composite") {
    return `diffuseColor.rgb *= characterViewDotRampColor * 2.0;${alphaBody}`;
  }
  if (formulaClass === "viewdot-ramp-times-sampled-color") {
    return `diffuseColor.rgb += diffuseColor.rgb * characterViewDotRampColor * 0.7;${alphaBody}`;
  }
  if (formulaClass === "uniform-color-times-viewdot-ramp") {
    return `diffuseColor.rgb = ${glslVec3(settings.uniformColor)} * characterViewDotRampColor;${alphaBody}`;
  }
  return `diffuseColor.rgb *= characterViewDotRampColor;${alphaBody}`;
}

export function patchViewDotRampFragmentShader(fragmentShader, settings) {
  const sample = viewDotRampSampleFunction(settings);
  if (!sample) return fragmentShader;
  const animated = settings.animatedNoiseComposite;
  const noiseHeader = animated
    ? "uniform sampler2D characterViewDotAnimatedNoiseMap;\nuniform float characterUvRuntimeTime;"
    : "";
  const colorBody = animated
    ? `
vec3 characterViewDotBaseWithRamp = diffuseColor.rgb + characterViewDotRampColor;
vec2 characterViewDotNoiseUv = vMapUv * vec2(${glslNumber(animated.uvRepeat[0])}, ${glslNumber(animated.uvRepeat[1])}) + vec2(
  ${floorFractAtlasTermsExpression(animated.xTerms)},
  ${floorFractAtlasTermsExpression(animated.yTerms)}
);
float characterViewDotNoise = texture2D(characterViewDotAnimatedNoiseMap, characterViewDotNoiseUv).${animated.channel};
vec3 characterViewDotFinalColor = characterViewDotBaseWithRamp + characterViewDotBaseWithRamp * characterViewDotNoise * ${glslNumber(animated.scale)};
diffuseColor.rgb = characterViewDotFinalColor;
diffuseColor.a = 1.0;`
    : viewDotRampFormulaBody(settings);
  const mapBody = `
#include <map_fragment>
float characterViewDotRampDot = clamp(dot(normalize(vViewPosition), normalize(vNormal)), 0.0, 1.0);
vec3 characterViewDotRampColor = ${sample.sampleExpression};
${colorBody}
`;
  const patchedMap = fragmentShader.replace("#include <map_fragment>", mapBody);
  const patchedOutput = animated
    ? patchedMap.replace(
        "#include <opaque_fragment>",
        "outgoingLight = characterViewDotFinalColor;\n#include <opaque_fragment>",
      )
    : patchedMap;
  return `${sample.header}\n${noiseHeader}\n${patchedOutput}`;
}

export function applyCharacterViewDotRampRuntime(material, evidence, loadTexture, THREE) {
  const settings = viewDotRampSettings(evidence, loadTexture);
  if (!settings) return material;
  if (settings.uvMaskRamp) {
    const uvMaskTexture = inlineRampDataTexture(settings.uvMaskRamp, THREE, `VaingloryUvMaskRamp:${settings.uvMaskRampHash || ""}`);
    if (!uvMaskTexture) return material;
    material.map = uvMaskTexture;
    if (material.color?.setRGB) material.color.setRGB(1, 1, 1);
    material.alphaMap = null;
    material.emissiveMap = null;
    material.userData ||= {};
    material.userData.characterViewDotUvMaskTexture = uvMaskTexture;
  }
  material.roughness = Math.min(Number(material.roughness) || 1, 0.85);
  material.metalness = 0;
  if (Number.isFinite(Number(material.envMapIntensity))) {
    material.envMapIntensity = Math.min(Number(material.envMapIntensity), 0.65);
  }
  applyNativeRenderStateSettings(material, evidence);
  if (THREE?.DoubleSide !== undefined && evidence?.shaderPassBlendEnabled === "true") material.side = THREE.DoubleSide;
  const sample = viewDotRampSampleFunction(settings);
  const uniforms = { ...(sample?.uniforms || {}) };
  if (settings.animatedNoiseComposite) {
    uniforms.characterViewDotAnimatedNoiseMap = { value: settings.animatedNoiseComposite.texture };
    uniforms.characterUvRuntimeTime = { value: 0 };
  }
  material.userData ||= {};
  if (settings.animatedNoiseComposite) material.userData.characterUvRuntimeUniforms = uniforms;
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchViewDotRampFragmentShader(shader.fragmentShader, settings);
  };
  const animatedCacheKey = settings.animatedNoiseComposite
    ? JSON.stringify({
        sampler: settings.animatedNoiseComposite.sampler,
        texturePath: settings.animatedNoiseComposite.texturePath,
        channel: settings.animatedNoiseComposite.channel,
        uvRepeat: settings.animatedNoiseComposite.uvRepeat,
        xTerms: settings.animatedNoiseComposite.xTerms,
        yTerms: settings.animatedNoiseComposite.yTerms,
        scale: settings.animatedNoiseComposite.scale,
      })
    : "";
  appendCustomProgramCacheKey(
    material,
    `character-view-dot-ramp:${settings.sourceKind}:${settings.formulaClass}:${settings.rampHash}:${settings.uvMaskRampHash || ""}:${settings.uniformColor?.join(",") || ""}:${animatedCacheKey}`,
  );
  material.userData.vaingloryRuntimeColorModeApplied = "viewDotRamp";
  material.userData.characterViewDotRampRuntime = settings;
  material.needsUpdate = true;
  return material;
}

const creatureLookupLitFormulaClasses = new Set([
  "nested-reflection-lookup-base-channel",
  "offset-lookup",
  "offset-lookup-additive",
]);

export function creatureLookupLitSettings(evidence, loadTexture) {
  const creature = evidence?.creatureLookupLit;
  if (evidence?.colorMode !== "creatureLookupLit" || creature?.mode !== "creatureLookupLitFormula") return null;
  const formulaClass = evidence?.creatureLookupLitFormulaClass || creature.formulaClass || "";
  if (!creatureLookupLitFormulaClasses.has(formulaClass) || !creature.canRenderNatively) return null;
  if (typeof loadTexture !== "function") return null;
  const ramp = normalizedRgbRamp(creature.ramp, 4);
  if (!ramp) return null;
  const samplerPaths = creature.samplerPaths || {};
  const requiredPaths =
    formulaClass === "offset-lookup"
      ? [samplerPaths.base, samplerPaths.reflection, samplerPaths.offset, samplerPaths.lookup]
      : formulaClass === "offset-lookup-additive"
        ? [samplerPaths.base, samplerPaths.reflection, samplerPaths.offset, samplerPaths.lookup, samplerPaths.additive]
        : [samplerPaths.base, samplerPaths.reflection, samplerPaths.lookup, samplerPaths.additive];
  if (requiredPaths.some((texturePath) => !texturePath)) return null;
  return {
    formulaClass,
    ramp,
    rampHash: evidence?.creatureLookupLitRampHash || creature.rampHash || "",
    reflectionScale: Math.max(0.01, Number(creature.reflectionScale) || 0.8),
    offsetScale: Math.max(0, Number(creature.offsetScale) || 1),
    offsetZDivisor: Math.max(0.01, Number(creature.offsetZDivisor) || 1),
    baseMap: loadTexture(samplerPaths.base, "color"),
    reflectionMap: loadTexture(samplerPaths.reflection, "data"),
    offsetMap: samplerPaths.offset ? loadTexture(samplerPaths.offset, "data") : null,
    lookupMap: loadTexture(samplerPaths.lookup, "data"),
    additiveMap: samplerPaths.additive ? loadTexture(samplerPaths.additive, "data") : null,
  };
}

function creatureLookupLitFormulaBody(settings) {
  if (settings?.formulaClass === "nested-reflection-lookup-base-channel") {
    return `
vec4 characterCreatureBase = texture2D(map, vMapUv);
vec4 characterCreatureLookup = texture2D(characterCreatureLookupMap, texture2D(characterCreatureReflectionMap, characterCreatureReflectionUv).xy);
float characterCreatureSpecMask = characterCreatureBase.g * characterCreatureBase.g;
vec3 characterCreatureLit = ((vec3(1.5) * characterCreatureLookup.rgb) + vec3(0.25)) * characterCreatureBase.rgb;
characterCreatureLit += characterCreatureLookup.a * characterCreatureSpecMask;
characterCreatureLit += characterCreatureLit * characterCreatureRimColor * 0.6;
characterCreatureLit += texture2D(characterCreatureAdditiveMap, vMapUv).rgb;
diffuseColor = vec4(characterCreatureLit, 1.0);
`;
  }
  const additive = settings?.formulaClass === "offset-lookup-additive" ? "\ncharacterCreatureLit += texture2D(characterCreatureAdditiveMap, vMapUv).rgb;" : "";
  const spec = settings?.formulaClass === "offset-lookup-additive"
    ? `characterCreatureLookup.a * (characterCreatureOffset.b / ${glslNumber(settings.offsetZDivisor)})`
    : "characterCreatureLookup.a * characterCreatureOffset.b";
  return `
vec4 characterCreatureBase = texture2D(map, vMapUv);
vec4 characterCreatureOffset = texture2D(characterCreatureOffsetMap, vMapUv);
vec3 characterCreatureOffsetRgb = (characterCreatureOffset.rgb - vec3(0.5)) * ${glslNumber(settings.offsetScale)};
vec2 characterCreatureLookupUv = (texture2D(characterCreatureReflectionMap, characterCreatureReflectionUv).rgb + characterCreatureOffsetRgb).xy;
vec4 characterCreatureLookup = texture2D(characterCreatureLookupMap, characterCreatureLookupUv);
vec3 characterCreatureLit = ((vec3(1.5) * characterCreatureLookup.rgb) + vec3(0.25)) * characterCreatureBase.rgb;
characterCreatureLit += ${spec};
characterCreatureLit += characterCreatureLit * characterCreatureRimColor * 0.6;${additive}
diffuseColor = vec4(characterCreatureLit, 1.0);
`;
}

export function patchCreatureLookupLitFragmentShader(fragmentShader, settings) {
  if (!settings?.ramp?.length) return fragmentShader;
  const header = `${rampLookupFunction("characterCreatureRimRamp", settings.ramp)}
uniform sampler2D characterCreatureReflectionMap;
uniform sampler2D characterCreatureLookupMap;
uniform sampler2D characterCreatureOffsetMap;
uniform sampler2D characterCreatureAdditiveMap;`;
  const mapBody = `
vec3 characterCreatureNormal = normalize(vNormal);
vec3 characterCreatureEye = normalize(-vViewPosition);
vec3 characterCreatureBack = -characterCreatureEye;
vec3 characterCreatureReflect = characterCreatureBack - (2.0 * dot(characterCreatureNormal, characterCreatureBack) * characterCreatureNormal);
vec3 characterCreatureReflectNorm = vec3(characterCreatureReflect.xy, characterCreatureReflect.z + 1.0);
float characterCreatureReflectLen = max(dot(characterCreatureReflectNorm, characterCreatureReflectNorm), 0.00001);
vec2 characterCreatureReflectionUv = (((characterCreatureReflect.xy * (inversesqrt(characterCreatureReflectLen) * 0.5)) + vec2(0.5)) * vec2(${glslNumber(
    settings.reflectionScale,
  )}, ${glslNumber(settings.reflectionScale)})) + vec2(0.1, 0.1);
float characterCreatureRimDot = clamp(dot(characterCreatureEye, characterCreatureNormal), 0.0, 1.0);
vec3 characterCreatureRimColor = characterCreatureRimRamp(characterCreatureRimDot);
${creatureLookupLitFormulaBody(settings)}
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", mapBody)}`;
}

export function applyCharacterCreatureLookupLitRuntime(material, evidence, loadTexture, THREE) {
  const settings = creatureLookupLitSettings(evidence, loadTexture);
  if (!settings) return material;
  material.map = settings.baseMap;
  material.alphaMap = null;
  material.emissiveMap = null;
  material.roughness = 0.9;
  material.metalness = 0;
  material.envMapIntensity = 0;
  applyNativeRenderStateSettings(material, evidence);
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.characterCreatureReflectionMap = { value: settings.reflectionMap };
    shader.uniforms.characterCreatureLookupMap = { value: settings.lookupMap };
    shader.uniforms.characterCreatureOffsetMap = { value: settings.offsetMap || settings.reflectionMap };
    shader.uniforms.characterCreatureAdditiveMap = { value: settings.additiveMap || settings.lookupMap };
    shader.fragmentShader = patchCreatureLookupLitFragmentShader(shader.fragmentShader, settings);
  };
  appendCustomProgramCacheKey(
    material,
    `character-creature-lookup:${settings.formulaClass}:${settings.rampHash}:${settings.reflectionScale}:${settings.offsetScale}:${settings.offsetZDivisor}`,
  );
  material.userData ||= {};
  material.userData.vaingloryRuntimeColorModeApplied = "creatureLookupLit";
  material.userData.characterCreatureLookupLitRuntime = settings;
  material.needsUpdate = true;
  return material;
}

export function patchReflectionFragmentShader(fragmentShader, reflection) {
  if (!reflection?.mode) return fragmentShader;
  const header = "uniform sampler2D characterReflectionMap;\nuniform float characterReflectionIntensity;";
  const body = `
vec2 characterReflectionUv = normalize(vViewPosition).xy * 0.5 + 0.5;
vec3 characterReflectionColor = texture2D(characterReflectionMap, characterReflectionUv).rgb;
reflectedLight.indirectDiffuse += characterReflectionColor * characterReflectionIntensity;
`;
  return `${header}\n${fragmentShader.replace("#include <lights_fragment_end>", `${body}\n#include <lights_fragment_end>`)}`;
}

// screen-space-2d 反射近似：把一张反射图用屏幕空间 UV(normalize(vViewPosition).xy) 采样、×0.55 加到漫反射上。
// 它会把角色的深色/冷色（如天使蓝翅膀内侧）冲淡成灰白，而且随视角固定在画面上（用户报的"固定画面位置的白/灰"）。
// 这是错误的近似，默认关闭；把下面常量改成 true 可实验开启。
const CHARACTER_SCREEN_SPACE_REFLECTION_ENABLED = false;
export function applyCharacterReflectionRuntime(material, evidence, loadTexture) {
  if (evidence?.shadergraphRel === petalBugT3UfoShadergraphRel) return material;
  if (!CHARACTER_SCREEN_SPACE_REFLECTION_ENABLED) return material;
  if (evidence?.reflectionExecutionMode === "diagnostic") return material;
  const reflectionTexturePath = evidence?.roleTexturePaths?.reflection || evidence?.roleTexturePaths?.lookup || "";
  if (!reflectionTexturePath || typeof loadTexture !== "function") return material;
  const reflectionMap = loadTexture(reflectionTexturePath, "color");
  const reflection = { mode: evidence?.reflectionMode || "lookup-2d" };
  material.userData.characterReflectionRuntime = { reflectionMap, reflection };
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.characterReflectionMap = { value: reflectionMap };
    shader.uniforms.characterReflectionIntensity = { value: 0.55 };
    shader.fragmentShader = patchReflectionFragmentShader(shader.fragmentShader, reflection);
  };
  appendCustomProgramCacheKey(material, `character-reflection:${reflection.mode}`);
  material.needsUpdate = true;
  return material;
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function vec2Value(values, THREE) {
  const x = numberOrZero(values?.[0]);
  const y = numberOrZero(values?.[1]);
  return THREE?.Vector2 ? new THREE.Vector2(x, y) : { x, y };
}

function floorFractAtlasTermSettings(term) {
  const kind = String(term?.kind || "");
  if (kind === "constant") return { kind, value: numberOrZero(term.value) };
  if (kind === "fract") {
    return {
      kind,
      speed: numberOrZero(term.speed),
      offset: numberOrZero(term.offset),
    };
  }
  if (kind === "floorFract") {
    const divisor = numberOrZero(term.divisor);
    return {
      kind,
      speed: numberOrZero(term.speed),
      offset: numberOrZero(term.offset),
      scale: numberOrZero(term.scale),
      divisor: Math.abs(divisor) < 0.00001 ? 1 : divisor,
    };
  }
  return null;
}

function floorFractAtlasTermsSettings(terms) {
  return Array.isArray(terms) ? terms.map(floorFractAtlasTermSettings).filter(Boolean).slice(0, 6) : [];
}

function uniformFloorAtlasTermSettings(term) {
  if (!term || !/^uniform:unif\d+$/.test(String(term.source || ""))) return null;
  const speed = numberOrZero(term.scale);
  if (Number.isFinite(Number(term.floorScale))) {
    return {
      kind: "floorUniform",
      speed,
      scale: numberOrZero(term.floorScale),
    };
  }
  return { kind: "uniform", speed };
}

function uniformFloorAtlasTermsSettings(terms) {
  const normalized = Array.isArray(terms) ? terms.map(uniformFloorAtlasTermSettings) : [];
  return normalized.length === 2 && normalized.every(Boolean) ? normalized : null;
}

function uniformLinearComponentSettings(component) {
  if (!component) return null;
  const terms = Array.isArray(component.terms)
    ? component.terms
        .filter((term) => /^uniform:unif\d+$/.test(String(term?.source || "")))
        .map((term) => ({ scale: numberOrZero(term.scale) }))
    : [];
  return {
    offset: numberOrZero(component.offset),
    terms,
  };
}

function uniformLinearVectorSettings(components) {
  const normalized = Array.isArray(components) ? components.map(uniformLinearComponentSettings) : [];
  return normalized.length === 2 && normalized.every(Boolean) ? normalized : null;
}

function vertexColorComponentSettings(terms, fallbackComponent) {
  const normalized = Array.isArray(terms)
    ? terms
        .map((term) => {
          const source = String(term?.source || "");
          const component = /var7\.x/.test(source) ? "r" : /var7\.y/.test(source) ? "g" : "";
          if (!component) return null;
          return { component, scale: numberOrZero(term.scale) };
        })
        .filter(Boolean)
    : [];
  return normalized.length ? normalized : [{ component: fallbackComponent, scale: 1 }];
}

function uniformVertexColorFractOffsetSettings(uvAnimation) {
  const uniformScale = Array.isArray(uvAnimation?.uniformScale)
    ? [numberOrZero(uvAnimation.uniformScale[0]), numberOrZero(uvAnimation.uniformScale[1])]
    : [0, 0];
  if (!uniformScale.some((value) => value !== 0)) return null;
  const vertexOffset = Array.isArray(uvAnimation?.vertexOffset)
    ? [numberOrZero(uvAnimation.vertexOffset[0]), numberOrZero(uvAnimation.vertexOffset[1])]
    : [0, 0];
  const vertexTerms = Array.isArray(uvAnimation?.vertexTerms)
    ? [
        vertexColorComponentSettings(uvAnimation.vertexTerms[0], "r"),
        vertexColorComponentSettings(uvAnimation.vertexTerms[1], "g"),
      ]
    : [[{ component: "r", scale: 1 }], [{ component: "g", scale: 1 }]];
  return {
    mode: "uniformVertexColorFractOffset",
    uniformScale,
    vertexOffset,
    vertexTerms,
    cacheKey: JSON.stringify({ uniformScale, vertexOffset, vertexTerms }),
  };
}

function sampledDistortCompositeScaleSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "sampledDistort") return null;
  if (compositeFormula?.className !== "base-plus-base-times-sampled-color-scale") return null;
  const colorScale = Array.isArray(compositeFormula.colorScale)
    ? compositeFormula.colorScale.slice(0, 3).map(numberOrZero)
    : null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const channels = Array.isArray(uvAnimation.distortionChannels)
    ? uvAnimation.distortionChannels.slice(0, 2)
    : [uvAnimation.distortionChannel || "x", "y"];
  if (!colorScale || !baseUvRepeat || !distortionUvRepeat) return null;
  if (channels.length !== 2 || channels.some((channel) => !["x", "y", "z", "w"].includes(channel))) return null;
  return {
    mode: "sampledDistortCompositeScale",
    baseSampler: String(uvAnimation.baseSampler || ""),
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    channels,
    distortionBias: numberOrZero(uvAnimation.distortionBias),
    distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
    offset: Array.isArray(uvAnimation.offset) ? [numberOrZero(uvAnimation.offset[0]), numberOrZero(uvAnimation.offset[1])] : [0, 0],
    offsetSpeed: Array.isArray(uvAnimation.offsetSpeed)
      ? [numberOrZero(uvAnimation.offsetSpeed[0]), numberOrZero(uvAnimation.offsetSpeed[1])]
      : [0, 0],
    axis: Array.isArray(uvAnimation.axis) ? [numberOrZero(uvAnimation.axis[0]), numberOrZero(uvAnimation.axis[1])] : [1, 1],
    colorScale,
    baseUvRepeat,
    distortionUvRepeat,
    cacheKey: JSON.stringify({
      channels,
      distortionBias: numberOrZero(uvAnimation.distortionBias),
      distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
      offset: uvAnimation.offset || [],
      offsetSpeed: uvAnimation.offsetSpeed || [],
      axis: uvAnimation.axis || [],
      colorScale,
      baseUvRepeat,
      distortionUvRepeat,
    }),
  };
}

function binaryHalfAtlasTintSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "scroll") return null;
  if (compositeFormula?.className !== "base-times-binary-half-atlas-tint") return null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const tintUvRepeat = Array.isArray(compositeFormula.tintUvRepeat)
    ? compositeFormula.tintUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const tintScale = Array.isArray(compositeFormula.tintScale)
    ? compositeFormula.tintScale.slice(0, 3).map(numberOrZero)
    : null;
  const selectorOffsetScale = Array.isArray(compositeFormula.selectorOffsetScale)
    ? compositeFormula.selectorOffsetScale.slice(0, 2).map(numberOrZero)
    : null;
  const selector = Number(compositeFormula.defaultSelector);
  const baseSampler = String(compositeFormula.baseSampler || "");
  const tintSampler = String(compositeFormula.tintSampler || "");
  if (
    !baseUvRepeat ||
    !tintUvRepeat ||
    !tintScale ||
    !selectorOffsetScale ||
    !/^sampler\d+$/.test(baseSampler) ||
    !/^sampler\d+$/.test(tintSampler) ||
    !Number.isFinite(selector) ||
    (selector !== 0 && selector !== 1)
  ) {
    return null;
  }
  return {
    mode: "binaryHalfAtlasTint",
    baseSampler,
    tintSampler,
    baseUvRepeat,
    tintUvRepeat,
    tintScale,
    selectorOffsetScale,
    selector,
    cacheKey: JSON.stringify({
      baseSampler,
      tintSampler,
      baseUvRepeat,
      tintUvRepeat,
      tintScale,
      selectorOffsetScale,
      selector,
    }),
  };
}

function binaryHalfAtlasSelectorSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "scroll") return null;
  if (compositeFormula?.className !== "static-binary-half-atlas-selector") return null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : [1, 1];
  const selectorOffsetScale = Array.isArray(compositeFormula.selectorOffsetScale)
    ? compositeFormula.selectorOffsetScale.slice(0, 2).map(numberOrZero)
    : null;
  const selector = Number(compositeFormula.defaultSelector);
  if (!baseUvRepeat || !selectorOffsetScale || !Number.isFinite(selector) || (selector !== 0 && selector !== 1)) return null;
  return {
    mode: "binaryHalfAtlasSelector",
    baseUvRepeat,
    selectorOffsetScale,
    selector,
    cacheKey: JSON.stringify({ baseUvRepeat, selectorOffsetScale, selector }),
  };
}

function sampledDistortCompositeMaskSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "sampledDistort") return null;
  if (compositeFormula?.className !== "base-plus-base-times-sampled-color-mask") return null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const channels = Array.isArray(uvAnimation.distortionChannels)
    ? uvAnimation.distortionChannels.slice(0, 2)
    : [uvAnimation.distortionChannel || "x", "y"];
  const maskChannel = compositeFormula.maskChannel || "z";
  if (!baseUvRepeat || !distortionUvRepeat) return null;
  if (channels.length !== 2 || channels.some((channel) => !["x", "y", "z", "w"].includes(channel))) return null;
  if (!["x", "y", "z", "w"].includes(maskChannel)) return null;
  return {
    mode: "sampledDistortCompositeMask",
    baseSampler: String(uvAnimation.baseSampler || ""),
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    channels,
    maskChannel,
    distortionBias: numberOrZero(uvAnimation.distortionBias),
    distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
    offset: Array.isArray(uvAnimation.offset) ? [numberOrZero(uvAnimation.offset[0]), numberOrZero(uvAnimation.offset[1])] : [0, 0],
    offsetSpeed: Array.isArray(uvAnimation.offsetSpeed)
      ? [numberOrZero(uvAnimation.offsetSpeed[0]), numberOrZero(uvAnimation.offsetSpeed[1])]
      : [0, 0],
    axis: Array.isArray(uvAnimation.axis) ? [numberOrZero(uvAnimation.axis[0]), numberOrZero(uvAnimation.axis[1])] : [1, 1],
    baseUvRepeat,
    distortionUvRepeat,
    cacheKey: JSON.stringify({
      channels,
      maskChannel,
      distortionBias: numberOrZero(uvAnimation.distortionBias),
      distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
      offset: uvAnimation.offset || [],
      offsetSpeed: uvAnimation.offsetSpeed || [],
      axis: uvAnimation.axis || [],
      baseUvRepeat,
      distortionUvRepeat,
    }),
  };
}

function sampledChannelSecondaryTextureSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "sampledDistort") return null;
  if (compositeFormula?.className !== "sampled-channel-times-secondary-texture") return null;
  const colorScale = Array.isArray(compositeFormula.colorScale)
    ? compositeFormula.colorScale.slice(0, 3).map(numberOrZero)
    : null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const secondaryUvRepeat = Array.isArray(compositeFormula.secondaryUvRepeat)
    ? compositeFormula.secondaryUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const channel = compositeFormula.channel || "y";
  const operation = compositeFormula.operation === "add" ? "add" : "multiply";
  if (!colorScale || !baseUvRepeat || !distortionUvRepeat || !secondaryUvRepeat) return null;
  if (!["x", "y", "z", "w"].includes(channel)) return null;
  return {
    mode: "sampledChannelSecondaryTexture",
    baseSampler: String(uvAnimation.baseSampler || ""),
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    secondarySampler: String(compositeFormula.secondarySampler || ""),
    channel,
    operation,
    colorScale,
    baseUvRepeat,
    distortionUvRepeat,
    secondaryUvRepeat,
    axis: Array.isArray(uvAnimation.axis) ? [numberOrZero(uvAnimation.axis[0]), numberOrZero(uvAnimation.axis[1])] : [1, 0],
    cacheKey: JSON.stringify({
      channel,
      operation,
      colorScale,
      baseUvRepeat,
      distortionUvRepeat,
      secondaryUvRepeat,
    }),
  };
}

function sampledOffsetFieldSecondaryTextureSettings(uvAnimation, compositeFormula) {
  if (!["sampledDistort", "sampledFractOffsetDistort"].includes(String(uvAnimation?.mode || ""))) return null;
  if (compositeFormula?.className !== "sampled-offset-field-for-secondary-sampler") return null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const secondaryUvRepeat = Array.isArray(compositeFormula.secondaryUvRepeat)
    ? compositeFormula.secondaryUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  if (!baseUvRepeat || !distortionUvRepeat || !secondaryUvRepeat) return null;
  const phaseModes = Array.isArray(uvAnimation.offsetPhaseModes) ? uvAnimation.offsetPhaseModes.slice(0, 2) : ["", ""];
  return {
    mode: "sampledOffsetFieldSecondaryTexture",
    sourceMode: String(uvAnimation.mode || ""),
    baseSampler: String(uvAnimation.baseSampler || ""),
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    secondarySampler: String(compositeFormula.secondarySampler || ""),
    offsetFieldChannels: Array.isArray(compositeFormula.offsetFieldChannels) ? compositeFormula.offsetFieldChannels.slice(0, 2) : ["x", "y"],
    offsetFieldBias: Array.isArray(compositeFormula.offsetFieldBias)
      ? compositeFormula.offsetFieldBias.slice(0, 2).map(numberOrZero)
      : [-0.5, -0.5],
    distortionAmplitudeChannel: compositeFormula.distortionAmplitudeChannel || "y",
    distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
    offsetSpeed: Array.isArray(uvAnimation.offsetSpeed)
      ? [numberOrZero(uvAnimation.offsetSpeed[0]), numberOrZero(uvAnimation.offsetSpeed[1])]
      : [0, 0],
    phaseModes,
    baseUvRepeat,
    distortionUvRepeat,
    secondaryUvRepeat,
    cacheKey: JSON.stringify({
      sourceMode: String(uvAnimation.mode || ""),
      offsetFieldChannels: compositeFormula.offsetFieldChannels || [],
      offsetFieldBias: compositeFormula.offsetFieldBias || [],
      distortionAmplitudeChannel: compositeFormula.distortionAmplitudeChannel || "",
      distortionScale: numberOrZero(uvAnimation.distortionScale) || 1,
      offsetSpeed: uvAnimation.offsetSpeed || [],
      phaseModes,
      baseUvRepeat,
      distortionUvRepeat,
      secondaryUvRepeat,
    }),
  };
}

function sampledThresholdMaskSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "sampledFractOffsetDistort") return null;
  if (compositeFormula?.className !== "sampled-threshold-mask") return null;
  const baseUvRepeat = Array.isArray(compositeFormula.baseUvRepeat)
    ? compositeFormula.baseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const lookupUvRepeat = Array.isArray(compositeFormula.lookupUvRepeat)
    ? compositeFormula.lookupUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const lookupRamp = Array.isArray(compositeFormula.lookupRamp?.ramp) ? compositeFormula.lookupRamp.ramp : null;
  const channels = Array.isArray(uvAnimation.distortionChannels)
    ? uvAnimation.distortionChannels.slice(0, 2)
    : [uvAnimation.distortionChannel || "x", "y"];
  if (!baseUvRepeat || !distortionUvRepeat || !lookupUvRepeat || !lookupRamp || lookupRamp.length !== 64) return null;
  if (channels.length !== 2 || channels.some((channel) => !["x", "y", "z", "w"].includes(channel))) return null;
  return {
    mode: "sampledThresholdMask",
    baseSampler: String(uvAnimation.baseSampler || ""),
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    lookupSampler: String(compositeFormula.lookupSampler || ""),
    channels,
    offset: Array.isArray(uvAnimation.offset) ? [numberOrZero(uvAnimation.offset[0]), numberOrZero(uvAnimation.offset[1])] : [0, 0],
    offsetSpeed: Array.isArray(uvAnimation.offsetSpeed)
      ? [numberOrZero(uvAnimation.offsetSpeed[0]), numberOrZero(uvAnimation.offsetSpeed[1])]
      : [0, 0],
    offsetPhaseModes: Array.isArray(uvAnimation.offsetPhaseModes) ? uvAnimation.offsetPhaseModes.slice(0, 2) : ["fract", "fract"],
    baseUvRepeat,
    distortionUvRepeat,
    lookupUvRepeat,
    lookupRamp,
    lookupRampHash: compositeFormula.lookupRamp?.rampHash || "",
    thresholdOffset: numberOrZero(compositeFormula.thresholdOffset),
    thresholdScale: numberOrZero(compositeFormula.thresholdScale) || 1,
    colorScale: Array.isArray(compositeFormula.colorScale) ? compositeFormula.colorScale.slice(0, 3).map(numberOrZero) : [2.5, 2.5, 2.5],
    colorBias: Array.isArray(compositeFormula.colorBias) ? compositeFormula.colorBias.slice(0, 3).map(numberOrZero) : [-0.25, -0.25, -0.25],
    alphaSmoothLow: numberOrZero(compositeFormula.alphaSmoothLow) || 0.5,
    alphaSmoothScale: numberOrZero(compositeFormula.alphaSmoothScale) || 0.5,
    cacheKey: JSON.stringify({
      channels,
      offset: uvAnimation.offset || [],
      offsetSpeed: uvAnimation.offsetSpeed || [],
      offsetPhaseModes: uvAnimation.offsetPhaseModes || [],
      baseUvRepeat,
      distortionUvRepeat,
      lookupUvRepeat,
      lookupRampHash: compositeFormula.lookupRamp?.rampHash || "",
      thresholdOffset: numberOrZero(compositeFormula.thresholdOffset),
      thresholdScale: numberOrZero(compositeFormula.thresholdScale) || 1,
      colorScale: compositeFormula.colorScale || [],
      colorBias: compositeFormula.colorBias || [],
    }),
  };
}

function nestedSampledWaterSettings(uvAnimation, compositeFormula) {
  if (uvAnimation?.mode !== "nestedSampledUvDistort") return null;
  const className = String(compositeFormula?.className || "");
  if (!["base-plus-nested-sampled-color", "nested-water-throne-reveal"].includes(className)) return null;
  const distortionUvRepeat = Array.isArray(compositeFormula.distortionUvRepeat)
    ? compositeFormula.distortionUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const distortionMaskUvRepeat = Array.isArray(compositeFormula.distortionMaskUvRepeat)
    ? compositeFormula.distortionMaskUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const nestedBaseUvRepeat = Array.isArray(compositeFormula.nestedBaseUvRepeat)
    ? compositeFormula.nestedBaseUvRepeat.slice(0, 2).map(numberOrZero)
    : null;
  const nestedOffsetScale = Array.isArray(compositeFormula.nestedOffsetScale)
    ? compositeFormula.nestedOffsetScale.slice(0, 2).map(numberOrZero)
    : [0.2, 0.2];
  if (!distortionUvRepeat || !distortionMaskUvRepeat || !nestedBaseUvRepeat) return null;
  const settings = {
    mode: className === "nested-water-throne-reveal" ? "nestedWaterThroneReveal" : "nestedWaterOpaqueComposite",
    className,
    distortionSampler: String(uvAnimation.distortionSampler || ""),
    distortionMaskSampler: String(compositeFormula.distortionMaskSampler || ""),
    nestedBaseSampler: String(uvAnimation.baseSampler || compositeFormula.nestedBaseSampler || ""),
    distortionUvRepeat,
    distortionMaskUvRepeat,
    nestedBaseUvRepeat,
    nestedOffsetScale,
    maskBias: numberOrZero(compositeFormula.maskBias) || 0.2,
    carveMax: numberOrZero(compositeFormula.carveMax) || 0.3,
    carveScale: numberOrZero(compositeFormula.carveScale) || (className === "nested-water-throne-reveal" ? 0.8 : 0.562963),
    vertexColorScale: numberOrZero(compositeFormula.vertexColorScale) || 2,
    cacheKey: JSON.stringify({
      className,
      distortionUvRepeat,
      distortionMaskUvRepeat,
      nestedBaseUvRepeat,
      nestedOffsetScale,
      maskBias: numberOrZero(compositeFormula.maskBias) || 0.2,
      carveMax: numberOrZero(compositeFormula.carveMax) || 0.3,
      carveScale: numberOrZero(compositeFormula.carveScale) || (className === "nested-water-throne-reveal" ? 0.8 : 0.562963),
    }),
  };

  if (settings.mode === "nestedWaterOpaqueComposite") {
    const baseColorRamp = Array.isArray(compositeFormula.baseColorRamp?.ramp) ? compositeFormula.baseColorRamp.ramp : null;
    const baseColorUvRepeat = Array.isArray(compositeFormula.baseColorUvRepeat)
      ? compositeFormula.baseColorUvRepeat.slice(0, 2).map(numberOrZero)
      : null;
    const reflectionUvScale = Array.isArray(compositeFormula.reflectionUvScale)
      ? compositeFormula.reflectionUvScale.slice(0, 2).map(numberOrZero)
      : [1, 1];
    if (!baseColorRamp || baseColorRamp.length !== 64 || !baseColorUvRepeat) return null;
    return {
      ...settings,
      baseColorSampler: String(compositeFormula.baseColorSampler || ""),
      reflectionLookupSampler: String(compositeFormula.reflectionLookupSampler || ""),
      baseColorRamp,
      baseColorRampHash: compositeFormula.baseColorRamp?.rampHash || "",
      baseColorUvRepeat,
      reflectionUvScale,
      reflectionIntensity: numberOrZero(compositeFormula.reflectionIntensity) || 0.85,
    };
  }

  const constantBaseColor = Array.isArray(compositeFormula.constantBaseColor)
    ? compositeFormula.constantBaseColor.slice(0, 3).map(numberOrZero)
    : null;
  if (!constantBaseColor) return null;
  return {
    ...settings,
    constantBaseColor,
    revealThresholdScale: numberOrZero(compositeFormula.revealThresholdScale) || 0.05,
    revealAlphaScale: numberOrZero(compositeFormula.revealAlphaScale) || 0.8,
  };
}

export function uvAnimationRuntimeSettings(uvAnimation, compositeFormula = null) {
  const binarySelectorSettings = binaryHalfAtlasSelectorSettings(uvAnimation, compositeFormula);
  if (binarySelectorSettings) return binarySelectorSettings;
  const binaryTintSettings = binaryHalfAtlasTintSettings(uvAnimation, compositeFormula);
  if (binaryTintSettings) return binaryTintSettings;
  const sampledCompositeSettings = sampledDistortCompositeScaleSettings(uvAnimation, compositeFormula);
  if (sampledCompositeSettings) return sampledCompositeSettings;
  const sampledMaskSettings = sampledDistortCompositeMaskSettings(uvAnimation, compositeFormula);
  if (sampledMaskSettings) return sampledMaskSettings;
  const sampledChannelSettings = sampledChannelSecondaryTextureSettings(uvAnimation, compositeFormula);
  if (sampledChannelSettings) return sampledChannelSettings;
  const sampledOffsetFieldSettings = sampledOffsetFieldSecondaryTextureSettings(uvAnimation, compositeFormula);
  if (sampledOffsetFieldSettings) return sampledOffsetFieldSettings;
  const sampledThresholdSettings = sampledThresholdMaskSettings(uvAnimation, compositeFormula);
  if (sampledThresholdSettings) return sampledThresholdSettings;
  const nestedWaterSettings = nestedSampledWaterSettings(uvAnimation, compositeFormula);
  if (nestedWaterSettings) return nestedWaterSettings;
  if (
    !uvAnimation ||
    ![
      "scroll",
      "vec2Scroll",
      "scaleOffset",
      "multiScrollAdditive",
      "floorFractAtlasOffset",
      "viewDotScrollOffset",
      "dualScrollFresnelMask",
      "waterWallComposite",
      "uniformFloorAtlasOffset",
      "uniformAliasScaleOffset",
      "uniformVertexColorFractOffset",
    ].includes(uvAnimation.mode)
  ) {
    return null;
  }
  if (uvAnimation.mode === "waterWallComposite") {
    return { mode: "waterWallComposite", cacheKey: JSON.stringify({ maskTextureHash: uvAnimation.maskTextureHash || "" }) };
  }
  if (uvAnimation.mode === "dualScrollFresnelMask") {
    const samples = Array.isArray(uvAnimation.samples)
      ? uvAnimation.samples.slice(0, 2).map((sample) => ({
          repeat: Array.isArray(sample?.repeat)
            ? [numberOrZero(sample.repeat[0]) || 1, numberOrZero(sample.repeat[1]) || 1]
            : [1, 1],
          speed: Array.isArray(sample?.speed)
            ? [numberOrZero(sample.speed[0]), numberOrZero(sample.speed[1])]
            : [0, 0],
          offset: Array.isArray(sample?.offset)
            ? [numberOrZero(sample.offset[0]), numberOrZero(sample.offset[1])]
            : [0, 0],
        }))
      : [];
    if (samples.length !== 2) return null;
    return {
      mode: "dualScrollFresnelMask",
      samples,
      fresnelDivisor: numberOrZero(uvAnimation.fresnelDivisor) || 0.7,
      cacheKey: JSON.stringify({ samples, fresnelDivisor: numberOrZero(uvAnimation.fresnelDivisor) || 0.7 }),
    };
  }
  if (uvAnimation.mode === "viewDotScrollOffset") {
    return {
      mode: "viewDotScrollOffset",
      speed: Array.isArray(uvAnimation.speed)
        ? [numberOrZero(uvAnimation.speed[0]), numberOrZero(uvAnimation.speed[1])]
        : [0, 0],
      dotPower: numberOrZero(uvAnimation.dotPower) || 1,
      dotScale: Array.isArray(uvAnimation.dotScale)
        ? [numberOrZero(uvAnimation.dotScale[0]), numberOrZero(uvAnimation.dotScale[1])]
        : [1, 1],
      cacheKey: JSON.stringify({
        speed: uvAnimation.speed || [],
        dotPower: numberOrZero(uvAnimation.dotPower) || 1,
        dotScale: uvAnimation.dotScale || [],
      }),
    };
  }
  if (uvAnimation.mode === "floorFractAtlasOffset") {
    const xTerms = floorFractAtlasTermsSettings(uvAnimation.xTerms);
    const yTerms = floorFractAtlasTermsSettings(uvAnimation.yTerms);
    const hasDynamicTerm = [...xTerms, ...yTerms].some((term) => term.kind === "fract" || term.kind === "floorFract");
    if ((!xTerms.length && !yTerms.length) || !hasDynamicTerm) return null;
    return {
      mode: "floorFractAtlasOffset",
      xTerms,
      yTerms,
      cacheKey: JSON.stringify({ xTerms, yTerms }),
    };
  }
  if (uvAnimation.mode === "uniformFloorAtlasOffset") {
    const terms = uniformFloorAtlasTermsSettings(uvAnimation.offsetTerms);
    if (!terms) return null;
    return {
      mode: "uniformFloorAtlasOffset",
      xTerm: terms[0],
      yTerm: terms[1],
      cacheKey: JSON.stringify({ terms }),
    };
  }
  if (uvAnimation.mode === "uniformAliasScaleOffset") {
    const scaleTerms = uniformLinearVectorSettings(uvAnimation.scaleTerms);
    const offsetTerms = uniformLinearVectorSettings(uvAnimation.offsetTerms);
    if (!scaleTerms || !offsetTerms) return null;
    return {
      mode: "uniformAliasScaleOffset",
      scaleTerms,
      offsetTerms,
      cacheKey: JSON.stringify({ scaleTerms, offsetTerms }),
    };
  }
  if (uvAnimation.mode === "uniformVertexColorFractOffset") {
    return uniformVertexColorFractOffsetSettings(uvAnimation);
  }
  if (uvAnimation.mode === "multiScrollAdditive") {
    const samples = Array.isArray(uvAnimation.samples)
      ? uvAnimation.samples
          .slice(0, 4)
          .map((sample) => ({
            speed: Array.isArray(sample?.speed)
              ? [numberOrZero(sample.speed[0]), numberOrZero(sample.speed[1])]
              : [0, 0],
            offset: Array.isArray(sample?.offset)
              ? [numberOrZero(sample.offset[0]), numberOrZero(sample.offset[1])]
              : [0, 0],
            channel: ["x", "y", "z", "w", "rgb"].includes(sample?.channel) ? sample.channel : "rgb",
            weight: Number.isFinite(Number(sample?.weight)) ? Number(sample.weight) : 1,
          }))
      : [];
    if (samples.length < 2) return null;
    return { mode: "multiScrollAdditive", samples, repeat: [1, 1] };
  }
  const speed = Array.isArray(uvAnimation.speed)
    ? [numberOrZero(uvAnimation.speed[0]), numberOrZero(uvAnimation.speed[1])]
    : [
        numberOrZero(uvAnimation.axis?.[0] ?? 1) * numberOrZero(uvAnimation.speed),
        numberOrZero(uvAnimation.axis?.[1]) * numberOrZero(uvAnimation.speed),
      ];
  const offset = Array.isArray(uvAnimation.offset)
    ? [numberOrZero(uvAnimation.offset[0]), numberOrZero(uvAnimation.offset[1])]
    : [0, 0];
  const repeat = Array.isArray(uvAnimation.repeat)
    ? [numberOrZero(uvAnimation.repeat[0]) || 1, numberOrZero(uvAnimation.repeat[1]) || 1]
    : [1, 1];
  return { mode: uvAnimation.mode === "scaleOffset" ? "scroll" : uvAnimation.mode, speed, offset, repeat };
}

function glslNumber(value) {
  const number = numberOrZero(value);
  const normalized = Math.abs(number) < 0.0000005 ? 0 : number;
  return normalized.toFixed(6);
}

function floorFractAtlasTermExpression(term) {
  if (term.kind === "constant") return glslNumber(term.value);
  if (term.kind === "fract") {
    return `fract(${glslNumber(term.offset)} + characterUvRuntimeTime * ${glslNumber(term.speed)})`;
  }
  if (term.kind === "floorFract") {
    return `${glslNumber(term.scale)} * floor(fract(${glslNumber(term.offset)} + characterUvRuntimeTime * ${glslNumber(term.speed)}) / ${glslNumber(term.divisor)})`;
  }
  return "0.0";
}

function floorFractAtlasTermsExpression(terms) {
  const expression = (terms || []).map(floorFractAtlasTermExpression).join(" + ");
  return expression || "0.0";
}

function uniformFloorAtlasTermExpression(term) {
  if (term.kind === "floorUniform") {
    return `${glslNumber(term.scale)} * floor(characterUvRuntimeTime * ${glslNumber(term.speed)})`;
  }
  return `characterUvRuntimeTime * ${glslNumber(term.speed)}`;
}

function uniformLinearComponentExpression(component) {
  const terms = (component.terms || []).map((term) => `characterUvRuntimeTime * ${glslNumber(term.scale)}`);
  return [glslNumber(component.offset), ...terms].join(" + ");
}

function vertexColorComponentExpression(offset, terms) {
  const termExpression = (terms || [])
    .map((term) => `vColor.${term.component} * ${glslNumber(term.scale)}`)
    .join(" + ");
  return [glslNumber(offset), termExpression].filter(Boolean).join(" + ");
}

function patchFloorFractAtlasOffsetUvFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeUv = vMapUv + vec2(${floorFractAtlasTermsExpression(settings.xTerms)}, ${floorFractAtlasTermsExpression(settings.yTerms)});
  vec4 sampledDiffuseColor = texture2D( map, characterRuntimeUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchUniformFloorAtlasOffsetUvFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeUv = vMapUv + vec2(${uniformFloorAtlasTermExpression(settings.xTerm)}, ${uniformFloorAtlasTermExpression(settings.yTerm)});
  vec4 sampledDiffuseColor = texture2D( map, characterRuntimeUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchUniformAliasScaleOffsetUvFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeUvScale = vec2(${uniformLinearComponentExpression(settings.scaleTerms[0])}, ${uniformLinearComponentExpression(settings.scaleTerms[1])});
  vec2 characterRuntimeUvOffset = vec2(${uniformLinearComponentExpression(settings.offsetTerms[0])}, ${uniformLinearComponentExpression(settings.offsetTerms[1])});
  vec2 characterRuntimeUv = (vMapUv * characterRuntimeUvScale) + characterRuntimeUvOffset;
  vec4 sampledDiffuseColor = texture2D( map, characterRuntimeUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchUniformVertexColorFractOffsetUvFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeVertexOffset = vec2(0.0);
  #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    characterRuntimeVertexOffset = vec2(${vertexColorComponentExpression(settings.vertexOffset[0], settings.vertexTerms[0])}, ${vertexColorComponentExpression(settings.vertexOffset[1], settings.vertexTerms[1])});
  #endif
  vec2 characterRuntimeUvOffset = fract(characterUvRuntimeTime * vec2(${glslNumber(settings.uniformScale[0])}, ${glslNumber(settings.uniformScale[1])}) * characterRuntimeVertexOffset);
  vec4 sampledDiffuseColor = texture2D( map, vMapUv + characterRuntimeUvOffset );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function sampledDistortionChannelExpression(sourceName, channel) {
  return `${sourceName}.${channel}`;
}

function patchSampledDistortCompositeScaleFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterSampledUvBaseMap;\nuniform sampler2D characterSampledUvDistortionMap;";
  const body = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
  vec4 characterSampledUvDistortion = texture2D(characterSampledUvDistortionMap, vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(settings.distortionUvRepeat[1])}));
  vec2 characterSampledUvOffset = (vec2(${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.channels[0])}, ${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.channels[1])}) * ${glslNumber(settings.distortionScale)} + vec2(${glslNumber(settings.distortionBias)}, ${glslNumber(settings.distortionBias)})) * vec2(${glslNumber(settings.axis[0])}, ${glslNumber(settings.axis[1])}) + vec2(${glslNumber(settings.offset[0])}, ${glslNumber(settings.offset[1])}) + characterUvRuntimeTime * vec2(${glslNumber(settings.offsetSpeed[0])}, ${glslNumber(settings.offsetSpeed[1])});
  vec3 characterSampledUvColor = texture2D(characterSampledUvBaseMap, vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])}) + characterSampledUvOffset).rgb;
  diffuseColor.rgb += diffuseColor.rgb * characterSampledUvColor * vec3(${glslNumber(settings.colorScale[0])}, ${glslNumber(settings.colorScale[1])}, ${glslNumber(settings.colorScale[2])});
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchBinaryHalfAtlasTintFragmentShader(fragmentShader, settings) {
  const header =
    "uniform sampler2D characterBinaryHalfAtlasTintMap;\nuniform float characterBinaryHalfAtlasSelector;";
  const body = `#include <map_fragment>
#ifdef USE_MAP
  vec3 characterBinaryHalfAtlasTint = texture2D(
    characterBinaryHalfAtlasTintMap,
    vMapUv * vec2(${glslNumber(settings.tintUvRepeat[0])}, ${glslNumber(settings.tintUvRepeat[1])})
      + characterBinaryHalfAtlasSelector * vec2(${glslNumber(settings.selectorOffsetScale[0])}, ${glslNumber(settings.selectorOffsetScale[1])})
  ).rgb;
  diffuseColor.rgb *= characterBinaryHalfAtlasTint * vec3(${glslNumber(settings.tintScale[0])}, ${glslNumber(settings.tintScale[1])}, ${glslNumber(settings.tintScale[2])});
#endif`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchBinaryHalfAtlasSelectorFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterBinaryHalfAtlasSelector;";
  const body = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(
    map,
    vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])})
      + characterBinaryHalfAtlasSelector * vec2(${glslNumber(settings.selectorOffsetScale[0])}, ${glslNumber(settings.selectorOffsetScale[1])})
  );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchSampledDistortCompositeMaskFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterSampledUvBaseMap;\nuniform sampler2D characterSampledUvDistortionMap;";
  const body = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
  vec4 characterSampledUvDistortion = texture2D(characterSampledUvDistortionMap, vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(settings.distortionUvRepeat[1])}));
  vec2 characterSampledUvOffset = (vec2(${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.channels[0])}, ${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.channels[1])}) * ${glslNumber(settings.distortionScale)} + vec2(${glslNumber(settings.distortionBias)}, ${glslNumber(settings.distortionBias)})) * vec2(${glslNumber(settings.axis[0])}, ${glslNumber(settings.axis[1])}) + vec2(${glslNumber(settings.offset[0])}, ${glslNumber(settings.offset[1])}) + characterUvRuntimeTime * vec2(${glslNumber(settings.offsetSpeed[0])}, ${glslNumber(settings.offsetSpeed[1])});
  vec3 characterSampledUvColor = texture2D(characterSampledUvBaseMap, vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])}) + characterSampledUvOffset).rgb;
  diffuseColor.rgb += diffuseColor.rgb * characterSampledUvColor * ${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.maskChannel)};
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchSampledChannelSecondaryTextureFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterSampledUvBaseMap;\nuniform sampler2D characterSampledUvDistortionMap;\nuniform sampler2D characterSampledUvSecondaryMap;";
  const baseBody =
    settings.operation === "add"
      ? "  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor *= sampledDiffuseColor;"
      : `  vec4 characterSampledUvSecondary = texture2D(characterSampledUvSecondaryMap, vMapUv * vec2(${glslNumber(settings.secondaryUvRepeat[0])}, ${glslNumber(settings.secondaryUvRepeat[1])}));\n  diffuseColor *= characterSampledUvSecondary;`;
  const outputBody =
    settings.operation === "add"
      ? `  vec3 characterSampledUvSecondary = texture2D(characterSampledUvSecondaryMap, vMapUv * vec2(${glslNumber(settings.secondaryUvRepeat[0])}, ${glslNumber(settings.secondaryUvRepeat[1])})).rgb;\n  diffuseColor.rgb += characterSampledUvSecondary * characterSampledUvAnimatedChannel * vec3(${glslNumber(settings.colorScale[0])}, ${glslNumber(settings.colorScale[1])}, ${glslNumber(settings.colorScale[2])});`
      : `  diffuseColor.rgb *= characterSampledUvAnimatedChannel * vec3(${glslNumber(settings.colorScale[0])}, ${glslNumber(settings.colorScale[1])}, ${glslNumber(settings.colorScale[2])});`;
  const body = `
#ifdef USE_MAP
${baseBody}
  vec4 characterSampledUvDistortion = texture2D(characterSampledUvDistortionMap, vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(settings.distortionUvRepeat[1])}));
  vec2 characterSampledUvOffset = vec2(characterSampledUvDistortion.x * characterUvRuntimeTime, 0.0) * vec2(${glslNumber(settings.axis[0])}, ${glslNumber(settings.axis[1])});
  float characterSampledUvAnimatedChannel = texture2D(characterSampledUvBaseMap, vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])}) + characterSampledUvOffset).${settings.channel};
${outputBody}
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function sampledOffsetFieldPhaseExpression(settings) {
  const phase = `characterUvRuntimeTime * ${glslNumber(settings.offsetSpeed[0])}`;
  return settings.phaseModes?.[0] === "fract" ? `fract(${phase})` : phase;
}

function sampledOffsetFieldXExpression(settings) {
  const phase = sampledOffsetFieldPhaseExpression(settings);
  if (settings.phaseModes?.[0] === "fract") {
    return `${sampledDistortionChannelExpression("characterSampledUvDistortion", "x")} * ${glslNumber(settings.distortionScale)} + ${phase}`;
  }
  return `(${sampledDistortionChannelExpression("characterSampledUvDistortion", "x")} + ${phase}) * ${glslNumber(settings.distortionScale)}`;
}

function patchSampledOffsetFieldSecondaryTextureFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterSampledUvBaseMap;\nuniform sampler2D characterSampledUvDistortionMap;\nuniform sampler2D characterSampledUvSecondaryMap;";
  const body = `
#ifdef USE_MAP
  vec4 characterSampledUvDistortion = texture2D(characterSampledUvDistortionMap, vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(settings.distortionUvRepeat[1])}));
  vec2 characterSampledUvFieldUv = vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])}) + vec2(${sampledOffsetFieldXExpression(settings)}, 0.0);
  vec4 characterSampledUvField = texture2D(characterSampledUvBaseMap, characterSampledUvFieldUv);
  vec2 characterSampledUvSecondaryOffset = (vec2(${sampledDistortionChannelExpression("characterSampledUvField", settings.offsetFieldChannels[0])}, ${sampledDistortionChannelExpression("characterSampledUvField", settings.offsetFieldChannels[1])}) + vec2(${glslNumber(settings.offsetFieldBias[0])}, ${glslNumber(settings.offsetFieldBias[1])})) * ${sampledDistortionChannelExpression("characterSampledUvDistortion", settings.distortionAmplitudeChannel)};
  vec4 characterSampledUvSecondary = texture2D(characterSampledUvSecondaryMap, vMapUv * vec2(${glslNumber(settings.secondaryUvRepeat[0])}, ${glslNumber(settings.secondaryUvRepeat[1])}) + characterSampledUvSecondaryOffset);
  diffuseColor *= characterSampledUvSecondary;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function sampledThresholdPhaseExpression(settings, axisIndex) {
  const phase = `characterUvRuntimeTime * ${glslNumber(settings.offsetSpeed[axisIndex])}`;
  return settings.offsetPhaseModes?.[axisIndex] === "fract" ? `fract(${phase})` : phase;
}

function patchSampledThresholdMaskFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterSampledUvBaseMap;\nuniform sampler2D characterSampledUvDistortionMap;\nuniform sampler2D characterSampledUvLookupMap;";
  const body = `
#ifdef USE_MAP
  vec4 characterSampledUvDistortionRaw = texture2D(characterSampledUvDistortionMap, vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(settings.distortionUvRepeat[1])}));
  vec2 characterSampledUvDistortion = vec2(${sampledDistortionChannelExpression("characterSampledUvDistortionRaw", settings.channels[0])}, ${sampledDistortionChannelExpression("characterSampledUvDistortionRaw", settings.channels[1])}) - vec2(0.5, 0.5);
  vec2 characterSampledUvOffset = vec2(${sampledThresholdPhaseExpression(settings, 0)}, ${sampledThresholdPhaseExpression(settings, 1)}) + vec2(${glslNumber(settings.offset[0])}, ${glslNumber(settings.offset[1])}) + characterSampledUvDistortion;
  float characterSampledUvRawMask = texture2D(characterSampledUvBaseMap, vMapUv * vec2(${glslNumber(settings.baseUvRepeat[0])}, ${glslNumber(settings.baseUvRepeat[1])}) + characterSampledUvOffset).x;
  float characterSampledUvClampedMask = clamp((characterSampledUvRawMask - ${glslNumber(settings.thresholdOffset)}) / ${glslNumber(settings.thresholdScale)}, 0.0, 1.0);
  float characterSampledUvReveal = characterSampledUvClampedMask * (characterSampledUvClampedMask * (3.0 - (2.0 * characterSampledUvClampedMask)));
  float characterSampledUvVertexThreshold = 0.0;
  float characterSampledUvVertexMask = 1.0;
  #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    characterSampledUvVertexThreshold = vColor.a;
    characterSampledUvVertexMask = vColor.r;
  #endif
  float characterSampledUvEdge = characterSampledUvReveal - characterSampledUvVertexThreshold;
  vec3 characterSampledUvLookup = texture2D(characterSampledUvLookupMap, vMapUv * vec2(${glslNumber(settings.lookupUvRepeat[0])}, ${glslNumber(settings.lookupUvRepeat[1])})).rgb;
  diffuseColor.rgb = ((vec3(${glslNumber(settings.colorScale[0])}, ${glslNumber(settings.colorScale[1])}, ${glslNumber(settings.colorScale[2])}) * vec3(characterSampledUvEdge)) + vec3(${glslNumber(settings.colorBias[0])}, ${glslNumber(settings.colorBias[1])}, ${glslNumber(settings.colorBias[2])})) * characterSampledUvLookup;
  float characterSampledUvAlphaInput = clamp((((1.0 - (characterSampledUvVertexMask * clamp(characterSampledUvEdge, 0.0, 3.0))) - ${glslNumber(settings.alphaSmoothLow)}) / ${glslNumber(settings.alphaSmoothScale)}), 0.0, 1.0);
  diffuseColor.a = 1.0 - (characterSampledUvAlphaInput * (characterSampledUvAlphaInput * (3.0 - (2.0 * characterSampledUvAlphaInput))));
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function nestedWaterVertexColorSnippet() {
  return `
  float characterNestedWaterVertexR = 1.0;
  float characterNestedWaterVertexA = 0.0;
  #if defined(USE_COLOR_ALPHA)
    characterNestedWaterVertexR = vColor.r;
    characterNestedWaterVertexA = vColor.a;
  #elif defined(USE_COLOR)
    characterNestedWaterVertexR = vColor.r;
  #endif`;
}

function nestedWaterSharedBody(settings) {
  return `
  float characterNestedWaterPhase = fract(characterUvRuntimeTime);
  vec2 characterNestedWaterCenteredUv = (vMapUv * vec2(${glslNumber(settings.distortionUvRepeat[0])}, ${glslNumber(
    settings.distortionUvRepeat[1],
  )}) + vec2(characterNestedWaterPhase, 0.0)) - vec2(0.5, 0.5);
  vec2 characterNestedWaterDistortionUv = vec2(
    (0.000000313916 * characterNestedWaterCenteredUv.x) - characterNestedWaterCenteredUv.y,
    characterNestedWaterCenteredUv.x + (0.000000313916 * characterNestedWaterCenteredUv.y)
  ) + vec2(0.5, 0.5);
  vec4 characterNestedWaterDistortion = texture2D(characterNestedWaterDistortionMap, characterNestedWaterDistortionUv);
  float characterNestedWaterMask = texture2D(characterNestedWaterMaskMap, vMapUv * vec2(${glslNumber(
    settings.distortionMaskUvRepeat[0],
  )}, ${glslNumber(settings.distortionMaskUvRepeat[1])})).x;
  float characterNestedWaterField = characterNestedWaterDistortion.x + characterNestedWaterMask - ${glslNumber(settings.maskBias)};
  float characterNestedWaterCarve = clamp(characterNestedWaterField * characterNestedWaterField, 0.0, ${glslNumber(settings.carveMax)});
  vec3 characterNestedWaterOffsetColor = texture2D(
    characterNestedWaterBaseMap,
    vMapUv * vec2(${glslNumber(settings.nestedBaseUvRepeat[0])}, ${glslNumber(settings.nestedBaseUvRepeat[1])}) +
      characterNestedWaterDistortion.xx * vec2(${glslNumber(settings.nestedOffsetScale[0])}, ${glslNumber(settings.nestedOffsetScale[1])})
  ).rgb;`;
}

function patchNestedWaterOpaqueCompositeFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterNestedWaterBaseRampMap;\nuniform sampler2D characterNestedWaterDistortionMap;\nuniform sampler2D characterNestedWaterMaskMap;\nuniform sampler2D characterNestedWaterBaseMap;\nuniform sampler2D characterNestedWaterReflectionMap;";
  const body = `
vec3 characterNestedWaterFinalColor = diffuseColor.rgb;
float characterNestedWaterFinalAlpha = diffuseColor.a;
#ifdef USE_MAP
${nestedWaterVertexColorSnippet()}
${nestedWaterSharedBody(settings)}
  vec3 characterNestedWaterBaseColor = texture2D(
    characterNestedWaterBaseRampMap,
    vMapUv * vec2(${glslNumber(settings.baseColorUvRepeat[0])}, ${glslNumber(settings.baseColorUvRepeat[1])})
  ).rgb;
  vec3 characterNestedWaterColor =
    (characterNestedWaterBaseColor - vec3(characterNestedWaterCarve * ${glslNumber(settings.carveScale)})) +
    characterNestedWaterOffsetColor;
  vec3 characterNestedWaterNormal = normalize(vNormal);
  vec3 characterNestedWaterEye = normalize(-vViewPosition);
  vec3 characterNestedWaterBack = -characterNestedWaterEye;
  vec3 characterNestedWaterReflect = characterNestedWaterBack - (2.0 * dot(characterNestedWaterNormal, characterNestedWaterBack) * characterNestedWaterNormal);
  vec3 characterNestedWaterReflectNorm = vec3(characterNestedWaterReflect.xy, characterNestedWaterReflect.z + 1.0);
  float characterNestedWaterReflectLen = max(dot(characterNestedWaterReflectNorm, characterNestedWaterReflectNorm), 0.00001);
  vec2 characterNestedWaterReflectionUv =
    ((characterNestedWaterReflect.xy * (inversesqrt(characterNestedWaterReflectLen) * 0.5)) + vec2(0.5)) *
    vec2(${glslNumber(settings.reflectionUvScale[0])}, ${glslNumber(settings.reflectionUvScale[1])});
  vec3 characterNestedWaterReflection = texture2D(characterNestedWaterReflectionMap, characterNestedWaterReflectionUv).rgb;
  characterNestedWaterFinalColor =
    (vec3(${glslNumber(settings.vertexColorScale)}) * characterNestedWaterVertexR * characterNestedWaterColor) +
    (characterNestedWaterReflection * ${glslNumber(settings.reflectionIntensity)});
  characterNestedWaterFinalAlpha = 1.0;
  diffuseColor = vec4(characterNestedWaterFinalColor, characterNestedWaterFinalAlpha);
#endif
`;
  const output = "gl_FragColor = vec4(characterNestedWaterFinalColor, characterNestedWaterFinalAlpha);";
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body).replace("#include <color_fragment>", "").replace("#include <output_fragment>", output)}`;
}

function patchNestedWaterThroneRevealFragmentShader(fragmentShader, settings) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform sampler2D characterNestedWaterDistortionMap;\nuniform sampler2D characterNestedWaterMaskMap;\nuniform sampler2D characterNestedWaterBaseMap;";
  const body = `
vec3 characterNestedWaterFinalColor = diffuseColor.rgb;
float characterNestedWaterFinalAlpha = diffuseColor.a;
#ifdef USE_MAP
${nestedWaterVertexColorSnippet()}
${nestedWaterSharedBody(settings)}
  float characterNestedWaterRevealInput = clamp(
    (characterNestedWaterField - characterNestedWaterVertexA) / ${glslNumber(settings.revealThresholdScale)},
    0.0,
    1.0
  );
  float characterNestedWaterReveal = characterNestedWaterRevealInput * characterNestedWaterRevealInput * (3.0 - (2.0 * characterNestedWaterRevealInput));
  vec3 characterNestedWaterColor =
    (vec3(${glslNumber(settings.constantBaseColor[0])}, ${glslNumber(settings.constantBaseColor[1])}, ${glslNumber(
      settings.constantBaseColor[2],
    )}) - vec3(characterNestedWaterCarve * ${glslNumber(settings.carveScale)})) +
    characterNestedWaterOffsetColor;
  characterNestedWaterFinalColor =
    vec3(${glslNumber(settings.vertexColorScale)}) * characterNestedWaterVertexR * characterNestedWaterColor * characterNestedWaterReveal;
  characterNestedWaterFinalAlpha = ${glslNumber(settings.revealAlphaScale)} * characterNestedWaterReveal;
  diffuseColor = vec4(characterNestedWaterFinalColor, characterNestedWaterFinalAlpha);
#endif
`;
  const output = "gl_FragColor = vec4(characterNestedWaterFinalColor, characterNestedWaterFinalAlpha);";
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body).replace("#include <color_fragment>", "").replace("#include <output_fragment>", output)}`;
}

function patchViewDotScrollOffsetUvFragmentShader(fragmentShader, settings) {
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  float characterRuntimeViewDot = dot(normalize(-vViewPosition), normalize(vNormal));
  float characterRuntimeViewDotOffset = pow(abs(characterRuntimeViewDot), ${glslNumber(settings.dotPower)});
  vec2 characterRuntimeUv = vMapUv + vec2(characterRuntimeViewDotOffset * ${glslNumber(settings.dotScale[0])}, characterRuntimeViewDotOffset * ${glslNumber(settings.dotScale[1])}) + characterUvRuntimeTime * vec2(${glslNumber(settings.speed[0])}, ${glslNumber(settings.speed[1])});
  vec4 sampledDiffuseColor = texture2D( map, characterRuntimeUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchDualScrollFresnelMaskFragmentShader(fragmentShader, settings) {
  const samples = settings.samples || [];
  const sample0 = samples[0] || {};
  const sample1 = samples[1] || {};
  const header = "uniform float characterUvRuntimeTime;";
  const body = `
#ifdef USE_MAP
  vec2 characterFresnelUv0 = vMapUv * vec2(${glslNumber(sample0.repeat?.[0] ?? 1)}, ${glslNumber(sample0.repeat?.[1] ?? 1)}) + vec2(${glslNumber(sample0.offset?.[0] ?? 0)}, ${glslNumber(sample0.offset?.[1] ?? 0)}) + characterUvRuntimeTime * vec2(${glslNumber(sample0.speed?.[0] ?? 0)}, ${glslNumber(sample0.speed?.[1] ?? 0)});
  vec2 characterFresnelUv1 = vMapUv * vec2(${glslNumber(sample1.repeat?.[0] ?? 1)}, ${glslNumber(sample1.repeat?.[1] ?? 1)}) + vec2(${glslNumber(sample1.offset?.[0] ?? 0)}, ${glslNumber(sample1.offset?.[1] ?? 0)}) + characterUvRuntimeTime * vec2(${glslNumber(sample1.speed?.[0] ?? 0)}, ${glslNumber(sample1.speed?.[1] ?? 0)});
  float characterFresnelSample0 = texture2D( map, characterFresnelUv0 ).x;
  float characterFresnelSample1 = texture2D( map, characterFresnelUv1 ).x;
  float characterFresnelView = clamp(dot(normalize(-vViewPosition), normalize(vNormal)), 0.0, 1.0);
  float characterFresnelMask = clamp((characterFresnelSample0 * characterFresnelSample1 * (1.0 - characterFresnelView)) / ${glslNumber(settings.fresnelDivisor || 0.7)}, 0.0, 1.0);
  diffuseColor = vec4(vec3(characterFresnelMask), characterFresnelMask);
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchWaterWallCompositeFragmentShader(fragmentShader) {
  const header = "uniform float characterUvRuntimeTime;\nuniform sampler2D characterWaterWallMaskMap;";
  const body = `
#ifdef USE_MAP
  vec2 characterWaterUv = vMapUv;
  float characterWaterTime = characterUvRuntimeTime;
  vec2 characterWaterMaskUvA = vec2(
    1.0 - ((characterWaterUv.y * 4.0) + fract(characterWaterTime) + (characterWaterUv.x * 0.375)),
    characterWaterUv.x + fract(characterWaterTime * 0.4)
  );
  float characterWaterMaskA = texture2D(characterWaterWallMaskMap, characterWaterMaskUvA).x;
  vec2 characterWaterMaskUvB = (characterWaterUv * vec2(0.25, 0.25)) + vec2(0.0, fract(characterWaterTime * 0.075) + (characterWaterUv.x * 0.375));
  float characterWaterMaskB = texture2D(characterWaterWallMaskMap, characterWaterMaskUvB).x;
  float characterWaterThreshold = 0.0;
  #if defined(USE_COLOR_ALPHA)
    characterWaterThreshold = vColor.a;
  #endif
  float characterWaterField = characterWaterMaskA + characterWaterMaskB - 0.2;
  float characterWaterReveal = smoothstep(characterWaterThreshold, characterWaterThreshold + 0.05, characterWaterField);
  vec3 characterWaterBase = texture2D(map, characterWaterUv).rgb * 0.85;
  float characterWaterCarve = min(max(characterWaterField * characterWaterField, 0.0), 0.3);
  vec3 characterWaterOffset = texture2D(map, (characterWaterUv * vec2(0.25, 1.0)) + vec2(characterWaterMaskA * 0.2, characterWaterMaskA * 0.2)).rgb;
  diffuseColor = vec4(((characterWaterBase - vec3(characterWaterCarve)) + characterWaterOffset) * characterWaterReveal, characterWaterReveal * 0.25);
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body).replace("#include <color_fragment>", "")}`;
}

function patchMultiScrollAdditiveUvFragmentShader(fragmentShader, settings) {
  const samples = Array.isArray(settings?.samples) ? settings.samples.slice(0, 4) : [];
  const sampleUniforms = samples
    .map(
      (_sample, index) =>
        `uniform vec2 characterUvRuntimeSpeed${index};\nuniform vec2 characterUvRuntimeOffset${index};`,
    )
    .join("\n");
  const sampleLines = samples
    .map((sample, index) => {
      const texelName = `characterMultiScrollTexel${index}`;
      const channel =
        sample.channel === "x" || sample.channel === "y" || sample.channel === "z" || sample.channel === "w"
          ? `${texelName}.${sample.channel.repeat(3)}`
          : `${texelName}.rgb`;
      const weight = numberOrZero(sample.weight) || 1;
      return `  vec4 ${texelName} = texture2D( map, vMapUv * characterUvRuntimeRepeat + characterUvRuntimeOffset${index} + characterUvRuntimeSpeed${index} * characterUvRuntimeTime );
  characterMultiScrollColor += ${weight.toFixed(6)} * ${channel};`;
    })
    .join("\n");
  const header = `uniform float characterUvRuntimeTime;\nuniform vec2 characterUvRuntimeRepeat;\n${sampleUniforms}`;
  const body = `
#ifdef USE_MAP
  vec3 characterMultiScrollColor = vec3(0.0);
${sampleLines}
  diffuseColor.rgb *= characterMultiScrollColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

function patchHero030HalloweenGreenFireFragmentShader(fragmentShader) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform vec2 characterUvRuntimeSpeed0;\nuniform vec2 characterUvRuntimeOffset0;\nuniform vec2 characterUvRuntimeSpeed1;\nuniform vec2 characterUvRuntimeOffset1;";
  const body = `
vec3 characterHalloweenFireFinalColor = diffuseColor.rgb;
float characterHalloweenFireFinalAlpha = diffuseColor.a;
#ifdef USE_MAP
  vec3 characterHalloweenFireTexel0 = texture2D(
    map,
    vMapUv * vec2(3.0, 3.0) + characterUvRuntimeOffset0 + characterUvRuntimeSpeed0 * characterUvRuntimeTime
  ).rgb;
  float characterHalloweenFireTexel1 = texture2D(
    map,
    vMapUv * vec2(5.0, 5.0) + characterUvRuntimeOffset1 + characterUvRuntimeSpeed1 * characterUvRuntimeTime
  ).r;
  float characterHalloweenFireVertexAlpha = 1.0;
  #if defined(USE_COLOR_ALPHA)
    characterHalloweenFireVertexAlpha = vColor.a;
  #endif
  float characterHalloweenFireField = clamp(characterHalloweenFireTexel0.r + characterHalloweenFireTexel1 * 0.75, 0.0, 1.0);
  float characterHalloweenFireReveal = clamp(
    (characterHalloweenFireField - (1.0 - characterHalloweenFireVertexAlpha)) / 0.6,
    0.0,
    1.0
  );
  float characterHalloweenFireIntensity = characterHalloweenFireReveal * 6.0 - 2.0;
  characterHalloweenFireFinalColor = characterHalloweenFireIntensity * vec3(0.247143, 0.578, 0.0);
  characterHalloweenFireFinalAlpha = characterHalloweenFireFinalColor.g * 0.5;
  diffuseColor = vec4(characterHalloweenFireFinalColor, characterHalloweenFireFinalAlpha);
#endif
`;
  const output = "gl_FragColor = vec4(characterHalloweenFireFinalColor, characterHalloweenFireFinalAlpha);";
  return `${header}\n${fragmentShader
    .replace("#include <map_fragment>", body)
    .replace("#include <color_fragment>", "")
    .replace("#include <output_fragment>", output)}`;
}

function patchRingoShogunT3ArmFlameFragmentShader(fragmentShader) {
  const header =
    "uniform float characterUvRuntimeTime;\nuniform vec2 characterUvRuntimeSpeed0;\nuniform vec2 characterUvRuntimeOffset0;\nuniform vec2 characterUvRuntimeSpeed1;\nuniform vec2 characterUvRuntimeOffset1;";
  const body = `
vec3 characterShogunArmFinalColor = diffuseColor.rgb;
float characterShogunArmFinalAlpha = diffuseColor.a;
#ifdef USE_MAP
  vec3 characterShogunArmVertexColor = vec3(1.0);
  float characterShogunArmVertexAlpha = 1.0;
  #if defined(USE_COLOR_ALPHA)
    characterShogunArmVertexColor = vColor.rgb;
    characterShogunArmVertexAlpha = vColor.a;
  #elif defined(USE_COLOR)
    characterShogunArmVertexColor = vColor;
  #endif
  vec3 characterShogunArmLayer0 = texture2D(
    map,
    vMapUv + characterUvRuntimeOffset0 + characterUvRuntimeSpeed0 * characterUvRuntimeTime
  ).rgb;
  vec3 characterShogunArmLayer1 = texture2D(
    map,
    vMapUv + characterUvRuntimeOffset1 + characterUvRuntimeSpeed1 * characterUvRuntimeTime
  ).rgb;
  vec3 characterShogunArmCombined = (
    characterShogunArmLayer0
    + characterShogunArmLayer1
    + vec3(0.825, 0.12, 0.02) * characterShogunArmVertexAlpha
  ) * characterShogunArmVertexColor;
  characterShogunArmFinalColor = characterShogunArmCombined * vec3(2.0, 2.0, 1.0);
  characterShogunArmFinalAlpha = characterShogunArmCombined.g;
  diffuseColor = vec4(characterShogunArmFinalColor, characterShogunArmFinalAlpha);
#endif
`;
  const output = "gl_FragColor = vec4(characterShogunArmFinalColor, characterShogunArmFinalAlpha);";
  return `${header}\n${fragmentShader
    .replace("#include <map_fragment>", body)
    .replace("#include <color_fragment>", "")
    .replace("#include <output_fragment>", output)}`;
}

export function patchDirectScrollUvFragmentShader(fragmentShader, settings = null) {
  if (settings?.mode === "binaryHalfAtlasSelector") return patchBinaryHalfAtlasSelectorFragmentShader(fragmentShader, settings);
  if (settings?.mode === "binaryHalfAtlasTint") return patchBinaryHalfAtlasTintFragmentShader(fragmentShader, settings);
  if (settings?.mode === "floorFractAtlasOffset") return patchFloorFractAtlasOffsetUvFragmentShader(fragmentShader, settings);
  if (settings?.mode === "uniformFloorAtlasOffset") return patchUniformFloorAtlasOffsetUvFragmentShader(fragmentShader, settings);
  if (settings?.mode === "uniformAliasScaleOffset") return patchUniformAliasScaleOffsetUvFragmentShader(fragmentShader, settings);
  if (settings?.mode === "uniformVertexColorFractOffset") return patchUniformVertexColorFractOffsetUvFragmentShader(fragmentShader, settings);
  if (settings?.mode === "sampledDistortCompositeScale") return patchSampledDistortCompositeScaleFragmentShader(fragmentShader, settings);
  if (settings?.mode === "sampledDistortCompositeMask") return patchSampledDistortCompositeMaskFragmentShader(fragmentShader, settings);
  if (settings?.mode === "sampledChannelSecondaryTexture") return patchSampledChannelSecondaryTextureFragmentShader(fragmentShader, settings);
  if (settings?.mode === "sampledOffsetFieldSecondaryTexture") return patchSampledOffsetFieldSecondaryTextureFragmentShader(fragmentShader, settings);
  if (settings?.mode === "sampledThresholdMask") return patchSampledThresholdMaskFragmentShader(fragmentShader, settings);
  if (settings?.mode === "nestedWaterOpaqueComposite") return patchNestedWaterOpaqueCompositeFragmentShader(fragmentShader, settings);
  if (settings?.mode === "nestedWaterThroneReveal") return patchNestedWaterThroneRevealFragmentShader(fragmentShader, settings);
  if (settings?.mode === "viewDotScrollOffset") return patchViewDotScrollOffsetUvFragmentShader(fragmentShader, settings);
  if (settings?.mode === "dualScrollFresnelMask") return patchDualScrollFresnelMaskFragmentShader(fragmentShader, settings);
  if (settings?.mode === "waterWallComposite") return patchWaterWallCompositeFragmentShader(fragmentShader, settings);
  if (settings?.mode === "hero030HalloweenGreenFire") return patchHero030HalloweenGreenFireFragmentShader(fragmentShader);
  if (settings?.mode === "ringoShogunT3ArmFlame") return patchRingoShogunT3ArmFlameFragmentShader(fragmentShader);
  if (settings?.mode === "multiScrollAdditive") return patchMultiScrollAdditiveUvFragmentShader(fragmentShader, settings);
  const header =
    "uniform float characterUvRuntimeTime;\nuniform vec2 characterUvRuntimeSpeed;\nuniform vec2 characterUvRuntimeOffset;\nuniform vec2 characterUvRuntimeRepeat;";
  const body = `
#ifdef USE_MAP
  vec2 characterRuntimeUv = vMapUv * characterUvRuntimeRepeat + characterUvRuntimeOffset + characterUvRuntimeSpeed * characterUvRuntimeTime;
  vec4 sampledDiffuseColor = texture2D( map, characterRuntimeUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`;
  return `${header}\n${fragmentShader.replace("#include <map_fragment>", body)}`;
}

export function applyCharacterUvAnimationRuntime(material, evidence, THREE, loadTexture) {
  if (evidence?.uvAnimationExecutionMode === "diagnostic") return material;
  if (material?.userData?.characterViewDotRampRuntime?.animatedNoiseComposite) return material;
  if (evidence?.uvAnimationGapReason || evidence?.unimplementedRoleNames?.includes?.("uvAnimation")) return material;
  if (evidence?.shadergraphRel === hero010RainbowShadergraphRel) return material;
  const animatedSampler =
    evidence?.previewUvAnimation?.baseSampler || evidence?.nativeShaderInputs?.roleSamplers?.uvAnimation || "";
  const baseColorSampler = evidence?.nativeShaderInputs?.roleSamplers?.baseColor || "";
  if (
    animatedSampler &&
    baseColorSampler &&
    animatedSampler !== baseColorSampler &&
    !evidence?.uvAnimationCompositeFormula
  ) {
    return material;
  }
  const compositeFormula =
    staticHorizontalHalfAtlasShadergraphRels.has(evidence?.shadergraphRel) && evidence?.previewUvAnimation?.mode === "scroll"
      ? {
          className: "static-binary-half-atlas-selector",
          baseUvRepeat: [0.5, 1],
          selectorOffsetScale: [0.5, 0],
          defaultSelector: 0,
        }
      : evidence?.uvAnimationCompositeFormula;
  const baseSettings = uvAnimationRuntimeSettings(evidence?.previewUvAnimation, compositeFormula);
  const settings =
    isHero030HalloweenGreenFire(evidence) && baseSettings?.mode === "multiScrollAdditive"
      ? { ...baseSettings, mode: "hero030HalloweenGreenFire", cacheKey: "hero030-halloween-green-fire" }
      : evidence?.shadergraphRel === ringoShogunT3ArmShadergraphRel && baseSettings?.mode === "multiScrollAdditive"
        ? { ...baseSettings, mode: "ringoShogunT3ArmFlame", cacheKey: "ringo-shogun-t3-arm-flame" }
      : baseSettings;
  if (!settings) return material;
  const uniforms = settings.mode === "binaryHalfAtlasSelector" ? {} : { characterUvRuntimeTime: { value: 0 } };
  if (settings.mode === "binaryHalfAtlasSelector") {
    uniforms.characterBinaryHalfAtlasSelector = { value: settings.selector };
  } else if (settings.mode === "waterWallComposite") {
    const maskTexturePath = evidence?.roleTexturePaths?.alphaMask || "";
    if (!maskTexturePath || typeof loadTexture !== "function") return material;
    uniforms.characterWaterWallMaskMap = { value: loadTexture(maskTexturePath, "data") };
    material.vertexColors = true;
    material.alphaMap = null;
  } else if (settings.mode === "binaryHalfAtlasTint") {
    const tintTexturePath = evidence?.samplerTexturePaths?.[settings.tintSampler] || "";
    if (!tintTexturePath || typeof loadTexture !== "function") return material;
    const tintTexture = loadTexture(tintTexturePath, "color");
    if (!tintTexture) return material;
    tintTexture.flipY = false;
    uniforms.characterBinaryHalfAtlasTintMap = { value: tintTexture };
    uniforms.characterBinaryHalfAtlasSelector = { value: settings.selector };
  } else if (settings.mode === "uniformVertexColorFractOffset") {
    material.vertexColors = true;
  } else if (settings.mode === "hero030HalloweenGreenFire") {
    material.vertexColors = true;
    material.alphaMap = null;
    material.alphaTest = 0;
    applyNativeRenderStateSettings(material, evidence);
  } else if (settings.mode === "ringoShogunT3ArmFlame") {
    material.vertexColors = true;
    material.alphaMap = null;
    material.alphaTest = 0;
    material.transparent = true;
    material.depthWrite = false;
    applyNativeRenderStateSettings(material, evidence);
    material.premultipliedAlpha = false;
    if (THREE?.CustomBlending !== undefined) {
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
      material.blendEquation = THREE.AddEquation;
      material.blendSrcAlpha = THREE.OneFactor;
      material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      material.blendEquationAlpha = THREE.AddEquation;
    }
  } else if (
    settings.mode === "sampledDistortCompositeScale" ||
    settings.mode === "sampledDistortCompositeMask" ||
    settings.mode === "sampledChannelSecondaryTexture" ||
    settings.mode === "sampledOffsetFieldSecondaryTexture" ||
    settings.mode === "sampledThresholdMask"
  ) {
    const baseTexturePath = evidence?.samplerTexturePaths?.[settings.baseSampler] || "";
    const distortionTexturePath = evidence?.samplerTexturePaths?.[settings.distortionSampler] || "";
    if (!baseTexturePath || !distortionTexturePath || typeof loadTexture !== "function") return material;
    uniforms.characterSampledUvBaseMap = { value: loadTexture(baseTexturePath, "color") };
    uniforms.characterSampledUvDistortionMap = { value: loadTexture(distortionTexturePath, "data") };
    if (settings.secondarySampler) {
      const secondaryTexturePath = evidence?.samplerTexturePaths?.[settings.secondarySampler] || "";
      if (!secondaryTexturePath) return material;
      uniforms.characterSampledUvSecondaryMap = { value: loadTexture(secondaryTexturePath, "color") };
    }
    if (settings.mode === "sampledThresholdMask") {
      const lookupTexture = inlineRampDataTexture(settings.lookupRamp, THREE, `VainglorySampledThresholdLookup:${settings.lookupRampHash || ""}`);
      if (!lookupTexture) return material;
      uniforms.characterSampledUvLookupMap = { value: lookupTexture };
      material.vertexColors = true;
      material.alphaMap = null;
    }
  } else if (settings.mode === "nestedWaterOpaqueComposite" || settings.mode === "nestedWaterThroneReveal") {
    const distortionTexturePath = evidence?.samplerTexturePaths?.[settings.distortionSampler] || "";
    const maskTexturePath = evidence?.samplerTexturePaths?.[settings.distortionMaskSampler] || "";
    const nestedBaseTexturePath = evidence?.samplerTexturePaths?.[settings.nestedBaseSampler] || "";
    if (!distortionTexturePath || !maskTexturePath || !nestedBaseTexturePath || typeof loadTexture !== "function") return material;
    uniforms.characterNestedWaterDistortionMap = { value: loadTexture(distortionTexturePath, "data") };
    uniforms.characterNestedWaterMaskMap = { value: loadTexture(maskTexturePath, "data") };
    uniforms.characterNestedWaterBaseMap = { value: loadTexture(nestedBaseTexturePath, "color") };
    if (settings.mode === "nestedWaterOpaqueComposite") {
      const baseRampTexture = inlineRampDataTexture(
        settings.baseColorRamp,
        THREE,
        `VaingloryNestedWaterBase:${settings.baseColorRampHash || ""}`,
      );
      const reflectionTexturePath = evidence?.samplerTexturePaths?.[settings.reflectionLookupSampler] || "";
      if (!baseRampTexture || !reflectionTexturePath) return material;
      uniforms.characterNestedWaterBaseRampMap = { value: baseRampTexture };
      uniforms.characterNestedWaterReflectionMap = { value: loadTexture(reflectionTexturePath, "color") };
    }
    material.vertexColors = true;
    material.alphaMap = null;
    applyNativeRenderStateSettings(material, evidence);
  } else if (settings.mode === "dualScrollFresnelMask") {
    material.alphaMap = null;
  }
  if (
    settings.mode === "binaryHalfAtlasSelector" ||
    settings.mode === "binaryHalfAtlasTint" ||
    settings.mode === "floorFractAtlasOffset" ||
    settings.mode === "uniformFloorAtlasOffset" ||
    settings.mode === "uniformAliasScaleOffset" ||
    settings.mode === "uniformVertexColorFractOffset" ||
    settings.mode === "sampledDistortCompositeScale" ||
    settings.mode === "sampledDistortCompositeMask" ||
    settings.mode === "sampledChannelSecondaryTexture" ||
    settings.mode === "sampledOffsetFieldSecondaryTexture" ||
    settings.mode === "sampledThresholdMask" ||
    settings.mode === "nestedWaterOpaqueComposite" ||
    settings.mode === "nestedWaterThroneReveal" ||
    settings.mode === "viewDotScrollOffset" ||
    settings.mode === "dualScrollFresnelMask" ||
    settings.mode === "waterWallComposite" ||
    settings.mode === "hero030HalloweenGreenFire" ||
    settings.mode === "ringoShogunT3ArmFlame"
  ) {
    // Formula constants are embedded in the shader; only time is animated.
  } else {
    uniforms.characterUvRuntimeRepeat = { value: vec2Value(settings.repeat, THREE) };
  }
  if (
    settings.mode === "multiScrollAdditive" ||
    settings.mode === "hero030HalloweenGreenFire" ||
    settings.mode === "ringoShogunT3ArmFlame"
  ) {
    settings.samples.forEach((sample, index) => {
      uniforms[`characterUvRuntimeSpeed${index}`] = { value: vec2Value(sample.speed, THREE) };
      uniforms[`characterUvRuntimeOffset${index}`] = { value: vec2Value(sample.offset, THREE) };
    });
  } else if (
    settings.mode !== "binaryHalfAtlasSelector" &&
    settings.mode !== "binaryHalfAtlasTint" &&
    settings.mode !== "floorFractAtlasOffset" &&
    settings.mode !== "uniformFloorAtlasOffset" &&
    settings.mode !== "uniformAliasScaleOffset" &&
    settings.mode !== "uniformVertexColorFractOffset" &&
    settings.mode !== "sampledDistortCompositeScale" &&
    settings.mode !== "sampledDistortCompositeMask" &&
    settings.mode !== "sampledChannelSecondaryTexture" &&
    settings.mode !== "sampledOffsetFieldSecondaryTexture" &&
    settings.mode !== "sampledThresholdMask" &&
    settings.mode !== "nestedWaterOpaqueComposite" &&
    settings.mode !== "nestedWaterThroneReveal" &&
    settings.mode !== "viewDotScrollOffset" &&
    settings.mode !== "dualScrollFresnelMask" &&
    settings.mode !== "waterWallComposite" &&
    settings.mode !== "hero030HalloweenGreenFire" &&
    settings.mode !== "ringoShogunT3ArmFlame"
  ) {
    uniforms.characterUvRuntimeSpeed = { value: vec2Value(settings.speed, THREE) };
    uniforms.characterUvRuntimeOffset = { value: vec2Value(settings.offset, THREE) };
  }
  material.userData.characterUvRuntimeUniforms = uniforms;
  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = patchDirectScrollUvFragmentShader(shader.fragmentShader, settings);
  };
  appendCustomProgramCacheKey(material, `character-uv:${settings.mode}:${settings.samples?.length || 1}:${settings.cacheKey || ""}`);
  material.needsUpdate = true;
  return material;
}

export function advanceCharacterUvRuntime(material, deltaSeconds) {
  const uniforms = material?.userData?.characterUvRuntimeUniforms;
  if (!uniforms?.characterUvRuntimeTime) return material;
  uniforms.characterUvRuntimeTime.value += Number(deltaSeconds) || 0;
  return material;
}

function applyVainEnergyPreviewRuntime(material, evidence, THREE, runtimeContext = {}) {
  const rel = String(runtimeContext.rel || "");
  const tint = vainEnergyTintsByRel.get(rel);
  const nativeState = nativeRenderStateFromEvidence(evidence);
  if (!tint || nativeState?.blendEnabled !== true) return material;

  material.transparent = true;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = false;
  material.depthTest = true;
  material.premultipliedAlpha = false;
  if (THREE?.NormalBlending !== undefined) material.blending = THREE.NormalBlending;

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    previousOnBeforeCompile?.(shader);
    shader.uniforms.characterVainEnergyTint = {
      value: THREE?.Color ? new THREE.Color(tint[0], tint[1], tint[2]) : { r: tint[0], g: tint[1], b: tint[2] },
    };
    shader.fragmentShader = `uniform vec3 characterVainEnergyTint;\n${shader.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `float characterVainEnergySignal = clamp(max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b), 0.0, 1.0);
float characterVainEnergyAlpha = smoothstep(0.035, 0.6, characterVainEnergySignal) * 0.58;
outgoingLight = characterVainEnergyTint * (0.28 + characterVainEnergySignal * 1.9);
diffuseColor.a = characterVainEnergyAlpha;
#include <opaque_fragment>`,
    );
  };
  appendCustomProgramCacheKey(material, `vain-energy-preview:${rel}:${evidence.materialName || "material"}`);
  material.needsUpdate = true;
  return material;
}

function runtimeMaterialEvidenceKey(row, runtimeContext = {}) {
  return [
    row.rel || "",
    row.modelLabel || "",
    row.materialIndex ?? "",
    row.materialName || "",
    row.shadergraphRel || "",
    row.roleNames || "",
    row.roleTexturePaths || "",
    row.inlineColors || "",
    row.previewUvAnimation || "",
    row.uvAnimationCompositeFormula || "",
    row.alphaMaskStats || "",
    row.alphaRuntimeStage || "",
    row.uvAnimationGapReason || "",
    row.missingGlbRoleNames || "",
    row.glbAlphaMode || "",
    row.reflectionMode || "",
    row.colorMode || "",
    row.rimLookupGlow || "",
    row.rimLookupGlowRampHash || "",
    row.rimLookupGlowSampleCount || "",
    row.viewDotRamp || "",
    row.viewDotRampFormulaClass || "",
    row.viewDotRampSourceKind || "",
    row.viewDotRampSampler || "",
    row.viewDotRampHash || "",
    row.creatureLookupLit || "",
    row.creatureLookupLitFormulaClass || "",
    row.creatureLookupLitRampHash || "",
    row.nativeShaderMode || "",
    row.nativeShaderBlocker || "",
    row.samplerUnits || "",
    row.samplerHashes || "",
    row.samplerTexturePaths || "",
    row.samplerTextureSources || "",
    row.unhashedSamplers || "",
    row.unresolvedSamplers || "",
    row.nativeUniformBindings || "",
    row.nativeShaderInputs || "",
    row.alphaExecutionMode || "",
    row.colorExecutionMode || "",
    row.reflectionExecutionMode || "",
    row.uvAnimationExecutionMode || "",
    row.shaderPassStateFamily || "",
    row.shaderPassStateSignatures || "",
    row.shaderPassStateWord0s || "",
    row.shaderPassStateWord1s || "",
    row.shaderPassStateWord2s || "",
    row.shaderPassStateWord3s || "",
    row.shaderPassRenderState || "",
    row.shaderPassBlendEnabled || "",
    row.shaderPassBlendPreset || "",
    row.shaderPassDepthWrite || "",
    row.shaderPassDepthTest || "",
    row.recommendedAlphaMode || "",
    row.unimplementedRoleNames || "",
    runtimeContext.activeSkinId || "",
    runtimeContext.rel || "",
  ].join("\u001f");
}

export function attachRuntimeMaterialEvidence(material, row, loadTexture, THREE, runtimeContext = {}) {
  material.userData ||= {};
  const evidenceKey = runtimeMaterialEvidenceKey(row, runtimeContext);
  if (material.userData.vaingloryRuntimeMaterialPipelineKey === evidenceKey) return material;
  const evidence = {
    materialName: row.materialName || "",
    shadergraphRel: row.shadergraphRel || "",
    roleNames: [...roleSet(row)],
    roleTexturePaths: parseJsonField(row.roleTexturePaths, {}),
    inlineColors: parseJsonField(row.inlineColors, []),
    previewUvAnimation: parseJsonField(row.previewUvAnimation, null),
    uvAnimationCompositeFormula: parseJsonField(row.uvAnimationCompositeFormula, null),
    alphaMaskStats: parseJsonField(row.alphaMaskStats, null),
    alphaRuntimeStage: row.alphaRuntimeStage || "",
    uvAnimationGapReason: row.uvAnimationGapReason || "",
    missingGlbRoleNames: String(row.missingGlbRoleNames || "").split("|").filter(Boolean),
    glbAlphaMode: row.glbAlphaMode || "",
    reflectionMode: row.reflectionMode || "",
    colorMode: row.colorMode || "",
    rimLookupGlow: parseJsonField(row.rimLookupGlow, null),
    rimLookupGlowRampHash: row.rimLookupGlowRampHash || "",
    rimLookupGlowSampleCount: row.rimLookupGlowSampleCount || "",
    viewDotRamp: parseJsonField(row.viewDotRamp, null),
    viewDotRampFormulaClass: row.viewDotRampFormulaClass || "",
    viewDotRampSourceKind: row.viewDotRampSourceKind || "",
    viewDotRampSampler: row.viewDotRampSampler || "",
    viewDotRampHash: row.viewDotRampHash || "",
    creatureLookupLit: parseJsonField(row.creatureLookupLit, null),
    creatureLookupLitFormulaClass: row.creatureLookupLitFormulaClass || "",
    creatureLookupLitRampHash: row.creatureLookupLitRampHash || "",
    nativeShaderMode: row.nativeShaderMode || "",
    nativeShaderBlocker: row.nativeShaderBlocker || "",
    samplerUnits: parseJsonField(row.samplerUnits, {}),
    samplerHashes: parseJsonField(row.samplerHashes, {}),
    samplerTexturePaths: parseJsonField(row.samplerTexturePaths, {}),
    samplerTextureSources: parseJsonField(row.samplerTextureSources, {}),
    unhashedSamplers: String(row.unhashedSamplers || "").split("|").filter(Boolean),
    unresolvedSamplers: String(row.unresolvedSamplers || "").split("|").filter(Boolean),
    nativeUniformBindings: parseJsonField(row.nativeUniformBindings, []),
    nativeShaderInputs: parseJsonField(row.nativeShaderInputs, null),
    alphaExecutionMode: row.alphaExecutionMode || "",
    colorExecutionMode: row.colorExecutionMode || "",
    reflectionExecutionMode: row.reflectionExecutionMode || "",
    uvAnimationExecutionMode: row.uvAnimationExecutionMode || "",
    shaderPassStateFamily: row.shaderPassStateFamily || "",
    shaderPassStateSignatures: row.shaderPassStateSignatures || "",
    shaderPassStateWord0s: String(row.shaderPassStateWord0s || "").split("|").filter(Boolean),
    shaderPassStateWord1s: String(row.shaderPassStateWord1s || "").split("|").filter(Boolean),
    shaderPassStateWord2s: String(row.shaderPassStateWord2s || "").split("|").filter(Boolean),
    shaderPassStateWord3s: String(row.shaderPassStateWord3s || "").split("|").filter(Boolean),
    shaderPassRenderState: parseJsonField(row.shaderPassRenderState, null),
    shaderPassBlendEnabled: row.shaderPassBlendEnabled || "",
    shaderPassBlendPreset: row.shaderPassBlendPreset || "",
    shaderPassDepthWrite: row.shaderPassDepthWrite || "",
    shaderPassDepthTest: row.shaderPassDepthTest || "",
    recommendedAlphaMode: row.recommendedAlphaMode || "OPAQUE",
    unimplementedRoleNames: String(row.unimplementedRoleNames || "").split("|").filter(Boolean),
  };
  material.userData.vaingloryRuntimeMaterialPipeline = evidence;
  material.userData.vaingloryRuntimeMaterialPipelineKey = evidenceKey;
  applyCharacterBaseColorRuntime(material, evidence, loadTexture, THREE, runtimeContext);
  applyCharacterAlphaRuntime(material, evidence, loadTexture);
  applyCharacterColorRuntime(material, evidence, loadTexture, THREE);
  applyCharacterEmissiveRuntime(material, evidence, loadTexture, THREE);
  applyCharacterReflectionRuntime(material, evidence, loadTexture);
  applyCharacterUvAnimationRuntime(material, evidence, THREE, loadTexture);
  applyVainEnergyPreviewRuntime(material, evidence, THREE, runtimeContext);
  return material;
}

export function applyCharacterMaterialRuntimePipeline(object, rowForMaterial, loadTexture, THREE, runtimeContext = {}) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const row = rowForMaterial(material);
      if (!row) continue;
      attachRuntimeMaterialEvidence(material, row, loadTexture, THREE, runtimeContext);
    }
  });
}
