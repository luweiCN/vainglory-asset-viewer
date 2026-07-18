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

test("alpha runtime applies shadergraph alpha mask texture through injected loader", async () => {
  const { applyCharacterAlphaRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { userData: {} };
  const loadedTexture = { name: "alpha-mask" };

  applyCharacterAlphaRuntime(
    material,
    {
      roleNames: ["alphaMask"],
      recommendedAlphaMode: "MASK",
      roleTexturePaths: { alphaMask: "../textures/hero.mask.png" },
    },
    (texturePath, kind) => ({ ...loadedTexture, texturePath, kind }),
  );

  assert.equal(material.transparent, false);
  assert.equal(material.alphaTest, 0.35);
  assert.equal(material.depthWrite, true);
  assert.deepEqual(material.alphaMap, {
    ...loadedTexture,
    texturePath: "../textures/hero.mask.png",
    kind: "data",
  });
  assert.equal(material.needsUpdate, true);
});

test("alpha runtime keeps stable material depth state when alpha evidence is incomplete", async () => {
  const { applyCharacterAlphaRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = {
    transparent: false,
    alphaTest: 0,
    depthWrite: true,
    userData: {},
  };

  applyCharacterAlphaRuntime(
    material,
    {
      roleNames: ["alphaBlend", "alphaMask"],
      recommendedAlphaMode: "BLEND",
      missingGlbRoleNames: ["alpha"],
      roleTexturePaths: { alphaMask: "../textures/missing-alpha.png" },
    },
    (texturePath, kind) => ({ texturePath, kind }),
  );

  assert.equal(material.transparent, false);
  assert.equal(material.alphaTest, 0);
  assert.equal(material.depthWrite, true);
  assert.equal(material.alphaMap, undefined);
  assert.equal(material.needsUpdate, undefined);
});

test("emissive runtime uses shadergraph inline color without changing global exposure", async () => {
  const { emissiveColorFromInlineColors } = await import("../viewer/material-runtime-shaders.js");
  assert.deepEqual(
    emissiveColorFromInlineColors([{ rgb: [0.2, 0.4, 0.8], alpha: 1, hex: "#3366CC" }]),
    [0.2, 0.4, 0.8],
  );
  assert.equal(emissiveColorFromInlineColors([]), null);
});

test("emissive runtime applies shadergraph emissive texture and inline color to material", async () => {
  const { applyCharacterEmissiveRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = {
    emissive: {
      values: null,
      setRGB(r, g, b) {
        this.values = [r, g, b];
      },
    },
  };

  applyCharacterEmissiveRuntime(
    material,
    {
      roleNames: ["emissive"],
      roleTexturePaths: { emissive: "../textures/hero.emissive.png" },
      inlineColors: [{ rgb: [1.5, 0.25, 0.1], alpha: 1 }],
    },
    (texturePath, kind) => ({ texturePath, kind }),
  );

  assert.deepEqual(material.emissive.values, [1.5, 0.25, 0.1]);
  assert.equal(material.emissiveIntensity, 1);
  assert.deepEqual(material.emissiveMap, { texturePath: "../textures/hero.emissive.png", kind: "color" });
  assert.equal(material.needsUpdate, true);
});

test("view-dot ramp uses Three.js camera-facing vector for Hero012 fall t3 glow spheres", async () => {
  const { patchViewDotRampFragmentShader } = await import("../viewer/material-runtime-shaders.js");
  const ramp = Array.from({ length: 64 }, (_unused, index) => {
    const value = index / 63;
    return [value, value * 0.6, value];
  });

  const fragmentShader = patchViewDotRampFragmentShader("#include <map_fragment>", {
    sourceKind: "inline-ramp",
    formulaClass: "viewdot-ramp-temp-composite",
    ramp,
  });

  assert.match(fragmentShader, /dot\(normalize\(vViewPosition\), normalize\(vNormal\)\)/);
  assert.doesNotMatch(fragmentShader, /normalize\(-vViewPosition\)/);
});

test("view-dot runtime executes Fortress native animated-noise color without PBR lighting", async () => {
  const {
    advanceCharacterUvRuntime,
    applyCharacterUvAnimationRuntime,
    applyCharacterViewDotRampRuntime,
  } = await import("../viewer/material-runtime-shaders.js");
  const ramp = Array.from({ length: 64 }, (_unused, index) => {
    const value = index / 63;
    return [value * 0.1, value * 0.46, value * 0.42];
  });
  const loaded = [];
  const material = {
    roughness: 1,
    metalness: 1,
    envMapIntensity: 1,
    userData: {},
  };
  const evidence = {
    colorMode: "viewDotRamp",
    viewDotRampFormulaClass: "base-plus-viewdot-ramp",
    viewDotRampSourceKind: "inline-ramp",
    viewDotRamp: {
      mode: "viewDotRampFormula",
      formulaClass: "base-plus-viewdot-ramp",
      sourceKind: "inline-ramp",
      canRenderNatively: true,
      ramp,
      animatedNoiseComposite: {
        mode: "base-plus-base-times-animated-noise",
        sampler: "sampler82",
        texturePath: "../textures/fortress-pack-noise.png",
        channel: "x",
        uvRepeat: [2, 2],
        xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
        yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
        scale: 5,
      },
    },
    previewUvAnimation: {
      mode: "floorFractAtlasOffset",
      baseUvSource: "var3.xy",
      offsetVariable: "tmpvar_7",
      xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
      yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
    },
  };

  applyCharacterViewDotRampRuntime(material, evidence, (texturePath, kind) => {
    const texture = { texturePath, kind, flipY: true };
    loaded.push(texture);
    return texture;
  });

  assert.deepEqual(loaded, [{ texturePath: "../textures/fortress-pack-noise.png", kind: "data", flipY: false }]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  const combinedHook = material.onBeforeCompile;
  applyCharacterUvAnimationRuntime(material, evidence);
  assert.equal(material.onBeforeCompile, combinedHook);

  advanceCharacterUvRuntime(material, 0.25);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0.25);

  const shader = {
    uniforms: {},
    fragmentShader: "#include <map_fragment>\nvec3 outgoingLight = vec3(0.0);\n#include <opaque_fragment>",
  };
  material.onBeforeCompile(shader);

  assert.equal(shader.uniforms.characterViewDotAnimatedNoiseMap.value, loaded[0]);
  assert.equal(shader.uniforms.characterUvRuntimeTime.value, 0.25);
  assert.match(shader.fragmentShader, /vMapUv \* vec2\(2\.000000, 2\.000000\)/);
  assert.match(shader.fragmentShader, /fract\(0\.000000 \+ characterUvRuntimeTime \* 0\.100000\)/);
  assert.match(shader.fragmentShader, /fract\(0\.000000 \+ characterUvRuntimeTime \* -0\.750000\)/);
  assert.match(shader.fragmentShader, /texture2D\(characterViewDotAnimatedNoiseMap, characterViewDotNoiseUv\)\.x/);
  assert.match(
    shader.fragmentShader,
    /characterViewDotFinalColor = characterViewDotBaseWithRamp \+ characterViewDotBaseWithRamp \* characterViewDotNoise \* 5\.000000/,
  );
  assert.match(shader.fragmentShader, /outgoingLight = characterViewDotFinalColor;\s*#include <opaque_fragment>/);
});

test("view-dot runtime rejects animated-noise evidence on a mismatched outer formula", async () => {
  const { viewDotRampSettings } = await import("../viewer/material-runtime-shaders.js");
  const ramp = Array.from({ length: 64 }, () => [0.1, 0.2, 0.3]);
  let loadCount = 0;
  const settings = viewDotRampSettings(
    {
      colorMode: "viewDotRamp",
      viewDotRampFormulaClass: "viewdot-ramp-temp-composite",
      viewDotRampSourceKind: "inline-ramp",
      viewDotRamp: {
        mode: "viewDotRampFormula",
        formulaClass: "viewdot-ramp-temp-composite",
        sourceKind: "inline-ramp",
        canRenderNatively: true,
        ramp,
        animatedNoiseComposite: {
          mode: "base-plus-base-times-animated-noise",
          sampler: "sampler82",
          texturePath: "../textures/should-not-load.png",
          channel: "x",
          uvRepeat: [2, 2],
          xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
          yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
          scale: 5,
        },
      },
    },
    () => {
      loadCount += 1;
      return {};
    },
  );

  assert.equal(settings.animatedNoiseComposite, null);
  assert.equal(loadCount, 0);
});

test("base color runtime replaces Cyber Krul's misbound normal map with its albedo sampler", async () => {
  const { applyCharacterBaseColorRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { map: { name: "misbound-normal-map" } };

  applyCharacterBaseColorRuntime(
    material,
    {
      shadergraphRel: "Characters/Hero009/Art/hero009_cyber.cyber_mat.shadergraph",
      roleTexturePaths: { baseColor: "../textures/cyber-normal.png" },
      samplerTexturePaths: { sampler59: "../textures/cyber-albedo.png" },
    },
    (texturePath, kind) => ({ texturePath, kind }),
  );

  assert.deepEqual(material.map, { texturePath: "../textures/cyber-albedo.png", kind: "color", flipY: false });
  assert.equal(material.needsUpdate, true);
});

test("base color runtime replaces Ardan Gladiator's misbound normal map with sampler57 albedo", async () => {
  const { applyCharacterBaseColorRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { map: { name: "misbound-normal-map" } };

  applyCharacterBaseColorRuntime(
    material,
    {
      shadergraphRel: "Characters/Hero012/Art/hero012_glad.glad_mat.shadergraph",
      roleTexturePaths: { baseColor: "../textures/gladiator-normal.png" },
      samplerTexturePaths: { sampler57: "../textures/gladiator-albedo.png" },
    },
    (texturePath, kind) => ({ texturePath, kind }),
  );

  assert.deepEqual(material.map, { texturePath: "../textures/gladiator-albedo.png", kind: "color", flipY: false });
  assert.equal(material.needsUpdate, true);
});

test("base color runtime restores Ardan Nether's color-managed HDR energy surface", async () => {
  const { applyCharacterBaseColorRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { map: { name: "nether-albedo" }, userData: {} };
  const loaded = [];

  applyCharacterBaseColorRuntime(
    material,
    {
      shadergraphRel: "Characters/Hero012/Art/hero012_nether.nether_mat.shadergraph",
      samplerTexturePaths: {
        sampler117: "../textures/nether-static-energy.png",
        sampler147: "../textures/nether-energy-mask.png",
        sampler179: "../textures/nether-energy-noise.png",
      },
    },
    (texturePath, kind) => {
      const texture = { texturePath, kind };
      loaded.push(texture);
      return texture;
    },
  );

  assert.deepEqual(loaded, [
    { texturePath: "../textures/nether-static-energy.png", kind: "color", flipY: false },
    { texturePath: "../textures/nether-energy-mask.png", kind: "data", flipY: false },
    { texturePath: "../textures/nether-energy-noise.png", kind: "data", flipY: false },
  ]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);

  const shader = {
    uniforms: {},
    fragmentShader:
      "void main(){\n#include <opaque_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  };
  material.onBeforeCompile(shader);

  assert.equal(shader.uniforms.characterNetherStaticEnergyMap.value, loaded[0]);
  assert.equal(shader.uniforms.characterNetherEnergyMaskMap.value, loaded[1]);
  assert.equal(shader.uniforms.characterNetherEnergyNoiseMap.value, loaded[2]);
  assert.match(shader.fragmentShader, /fract\(characterUvRuntimeTime \* -0\.1\)/);
  assert.match(shader.fragmentShader, /characterNetherNoise \* characterNetherNoise/);
  assert.match(shader.fragmentShader, /vec3\(5\.978, 0\.28327, 0\.105365\)/);
  assert.doesNotMatch(shader.fragmentShader, /vec3\(5\.978, 1\.4412, 0\.8434\)/);
  assert.doesNotMatch(shader.fragmentShader, /vec3\(1\.0, 0\.2411, 0\.1411\)/);
  assert.match(shader.fragmentShader, /outgoingLight \+= characterNetherEnergy/);
  assert.doesNotMatch(shader.fragmentShader, /gl_FragColor\.rgb = clamp/);
  assert.match(material.customProgramCacheKey(), /hero012-nether-energy-surface/);
  assert.equal(material.needsUpdate, true);
});

test("base color runtime combines Skaarf CNY's grayscale details with its palette atlas", async () => {
  const { applyCharacterBaseColorRuntime } = await import("../viewer/material-runtime-shaders.js");
  const detailMap = { name: "cny-grayscale-details" };
  const material = { map: detailMap };
  const loaded = [];

  applyCharacterBaseColorRuntime(
    material,
    {
      shadergraphRel: "Characters/Hero010/Art/hero010_CNY.CNY_mat.shadergraph",
      samplerTexturePaths: { sampler62: "../textures/cny-palette-atlas.png" },
    },
    (texturePath, kind) => {
      const texture = { texturePath, kind };
      loaded.push(texture);
      return texture;
    },
  );

  assert.equal(material.map, detailMap);
  assert.equal(typeof material.onBeforeCompile, "function");
  assert.deepEqual(loaded, [
    { texturePath: "../textures/cny-palette-atlas.png", kind: "color", flipY: false },
  ]);

  const shader = {
    uniforms: {},
    fragmentShader: "void main(){\n#include <map_fragment>\n}",
  };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.characterCnyPaletteMap.value, loaded[0]);
  assert.match(shader.fragmentShader, /vMapUv \* vec2\(0\.3333333333\)/);
  assert.match(shader.fragmentShader, /characterCnyPaletteMap[\s\S]*\* 2\.0/);
  assert.match(material.customProgramCacheKey(), /hero010-cny-palette/);
  assert.equal(material.needsUpdate, true);
});

test("base color runtime restores Skaarf Rainbow's palette and animated rainbow surface", async () => {
  const { advanceCharacterUvRuntime, applyCharacterBaseColorRuntime, applyCharacterUvAnimationRuntime } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const detailMap = { name: "rainbow-grayscale-details" };
  const material = { map: detailMap, userData: {} };
  const loaded = [];
  const evidence = {
    shadergraphRel: "Characters/Hero010/Art/hero010_rainbow.rainbow_mat.shadergraph",
    samplerTexturePaths: {
      sampler93: "../textures/rainbow-palette-atlas.png",
      sampler161: "../textures/rainbow-overlay.png",
      sampler198: "../textures/rainbow-gradient.png",
    },
    previewUvAnimation: {
      mode: "floorFractAtlasOffset",
      phaseSource: "uniform:unif193",
      xTerms: [{ kind: "fract", phaseSource: "uniform:unif193", speed: -0.75, offset: 0 }],
      yTerms: [{ kind: "constant", value: 0.5 }],
    },
    nativeShaderInputs: { roleSamplers: { baseColor: "sampler56" } },
  };

  applyCharacterBaseColorRuntime(material, evidence, (texturePath, kind) => {
    const texture = { texturePath, kind };
    loaded.push(texture);
    return texture;
  });

  assert.equal(material.map, detailMap);
  assert.deepEqual(loaded, [
    { texturePath: "../textures/rainbow-palette-atlas.png", kind: "color", flipY: false },
    { texturePath: "../textures/rainbow-overlay.png", kind: "color", flipY: false },
    { texturePath: "../textures/rainbow-gradient.png", kind: "color", flipY: false },
  ]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);

  const specializedCompile = material.onBeforeCompile;
  applyCharacterUvAnimationRuntime(material, evidence);
  assert.equal(material.onBeforeCompile, specializedCompile);

  const shader = {
    uniforms: {},
    fragmentShader: "void main(){\n#include <map_fragment>\n#include <opaque_fragment>\n}",
  };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.characterRainbowPaletteMap.value, loaded[0]);
  assert.equal(shader.uniforms.characterRainbowOverlayMap.value, loaded[1]);
  assert.equal(shader.uniforms.characterRainbowGradientMap.value, loaded[2]);
  assert.match(shader.fragmentShader, /vMapUv \* vec2\(0\.5\) \+ vec2\(1\.5, 0\.5\)/);
  assert.match(shader.fragmentShader, /vMapUv \* vec2\(2\.0, 4\.0\)/);
  assert.match(shader.fragmentShader, /fract\(characterUvRuntimeTime \* -0\.75\)/);
  assert.match(shader.fragmentShader, /characterRainbowPalette\.rgb \* 2\.0/);
  assert.match(shader.fragmentShader, /characterRainbowOverlay\.a/);
  assert.match(shader.fragmentShader, /outgoingLight \+= characterRainbowAdditionalSurface/);

  advanceCharacterUvRuntime(material, 0.25);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0.25);
  assert.match(material.customProgramCacheKey(), /hero010-rainbow-surface/);
  assert.equal(material.needsUpdate, true);
});

test("reflection runtime injects evidenced reflection sampler into standard material shader", async () => {
  const { patchReflectionFragmentShader } = await import("../viewer/material-runtime-shaders.js");
  const source = "void main(){\n#include <normal_fragment_maps>\n#include <lights_fragment_end>\n}";
  const output = patchReflectionFragmentShader(source, { mode: "lookup-2d" });
  assert.match(output, /uniform sampler2D characterReflectionMap;/);
  assert.match(output, /uniform float characterReflectionIntensity;/);
  assert.match(output, /reflectedLight\.indirectDiffuse/);
});

test("screen-space reflection runtime is disabled by default (it washes cold colors to gray/white)", async () => {
  const { applyCharacterReflectionRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { userData: {} };

  applyCharacterReflectionRuntime(
    material,
    {
      roleNames: ["reflection"],
      roleTexturePaths: { reflection: "../textures/hero.reflection.png" },
      reflectionMode: "lookup-2d",
    },
    (texturePath, kind) => ({ texturePath, kind }),
  );

  // 默认关闭：不注入 screen-space 反射（它把冷色/深色如天使蓝翅膀内侧冲淡成灰白、随视角固定在画面）。
  assert.equal(material.userData.characterReflectionRuntime, undefined);
  assert.notEqual(typeof material.onBeforeCompile, "function");
});

test("direct scroll UV runtime patches map sampling with time uniform", async () => {
  const { patchDirectScrollUvFragmentShader } = await import("../viewer/material-runtime-shaders.js");
  const source = "#include <map_fragment>";
  const output = patchDirectScrollUvFragmentShader(source);
  assert.match(output, /uniform float characterUvRuntimeTime;/);
  assert.match(output, /uniform vec2 characterUvRuntimeSpeed;/);
  assert.match(output, /characterUvRuntimeTime/);
  assert.match(output, /texture2D\( map,/);
});

test("UV animation runtime accepts real scroll descriptors and advances time uniforms", async () => {
  const { advanceCharacterUvRuntime, applyCharacterUvAnimationRuntime, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  assert.deepEqual(uvAnimationRuntimeSettings({ mode: "scroll", speed: [0.25, -0.5], offset: [0.1, 0.2] }), {
    mode: "scroll",
    speed: [0.25, -0.5],
    offset: [0.1, 0.2],
    repeat: [1, 1],
  });

  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: { mode: "scroll", speed: [0.25, -0.5], offset: [0.1, 0.2] },
  });
  advanceCharacterUvRuntime(material, 0.75);

  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0.75);
  assert.deepEqual(material.userData.characterUvRuntimeUniforms.characterUvRuntimeSpeed.value, { x: 0.25, y: -0.5 });
  assert.equal(typeof material.onBeforeCompile, "function");
  assert.equal(material.customProgramCacheKey(), "character-uv:scroll:1:");
  assert.equal(material.needsUpdate, true);
});

test("UV animation runtime applies uniform floor atlas offsets from shadergraph evidence", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "uniformFloorAtlasOffset",
    phaseSource: "uniform:unif80",
    offsetTerms: [
      { source: "uniform:unif80", scale: 0.5 },
      { source: "uniform:unif80", scale: 0.5, floorDivisor: 0.5, floorScale: 0.5 },
    ],
  };

  assert.deepEqual(uvAnimationRuntimeSettings(descriptor), {
    mode: "uniformFloorAtlasOffset",
    xTerm: { kind: "uniform", speed: 0.5 },
    yTerm: { kind: "floorUniform", speed: 0.5, scale: 0.5 },
    cacheKey:
      '{"terms":[{"kind":"uniform","speed":0.5},{"kind":"floorUniform","speed":0.5,"scale":0.5}]}',
  });

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", uvAnimationRuntimeSettings(descriptor));
  assert.match(fragmentShader, /characterUvRuntimeTime \* 0\.500000/);
  assert.match(fragmentShader, /0\.500000 \* floor\(characterUvRuntimeTime \* 0\.500000\)/);

  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: descriptor,
  });

  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeRepeat, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
  assert.equal(
    material.customProgramCacheKey(),
    'character-uv:uniformFloorAtlasOffset:1:{"terms":[{"kind":"uniform","speed":0.5},{"kind":"floorUniform","speed":0.5,"scale":0.5}]}',
  );
});

test("UV animation runtime leaves the base map stable when animation targets another sampler without a composite formula", async () => {
  const { applyCharacterUvAnimationRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { userData: {} };

  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: {
      mode: "uniformFloorAtlasOffset",
      baseSampler: "sampler93",
      phaseSource: "uniform:unif80",
      offsetTerms: [
        { source: "uniform:unif80", scale: 0.5 },
        { source: "uniform:unif80", scale: 0.5, floorDivisor: 0.5, floorScale: 0.5 },
      ],
    },
    nativeShaderInputs: { roleSamplers: { baseColor: "sampler56" } },
    uvAnimationCompositeFormula: null,
  });

  assert.equal(material.userData.characterUvRuntimeUniforms, undefined);
  assert.equal(material.onBeforeCompile, undefined);
  assert.equal(material.needsUpdate, undefined);
});

test("UV animation runtime leaves the base map stable when only shader roles identify the animated sampler", async () => {
  const { applyCharacterUvAnimationRuntime } = await import("../viewer/material-runtime-shaders.js");
  const material = { userData: {} };

  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: {
      mode: "floorFractAtlasOffset",
      xTerms: [{ kind: "fract", speed: -0.5, offset: 0 }],
      yTerms: [{ kind: "fract", speed: -0.25, offset: 0 }],
    },
    nativeShaderInputs: {
      roleSamplers: {
        baseColor: "sampler50",
        uvAnimation: "sampler113",
      },
    },
    uvAnimationCompositeFormula: null,
  });

  assert.equal(material.userData.characterUvRuntimeUniforms, undefined);
  assert.equal(material.onBeforeCompile, undefined);
  assert.equal(material.needsUpdate, undefined);
});

test("UV animation runtime applies uniform alias scale-offset formulas from shadergraph evidence", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const component = { offset: 1, terms: [{ source: "uniform:unif56", scale: -0.5 }] };
  const descriptor = {
    mode: "uniformAliasScaleOffset",
    phaseSource: "uniform:unif56",
    scaleTerms: [component, component],
    offsetTerms: [component, component],
  };

  const settings = uvAnimationRuntimeSettings(descriptor);
  assert.deepEqual(settings, {
    mode: "uniformAliasScaleOffset",
    scaleTerms: [
      { offset: 1, terms: [{ scale: -0.5 }] },
      { offset: 1, terms: [{ scale: -0.5 }] },
    ],
    offsetTerms: [
      { offset: 1, terms: [{ scale: -0.5 }] },
      { offset: 1, terms: [{ scale: -0.5 }] },
    ],
    cacheKey:
      '{"scaleTerms":[{"offset":1,"terms":[{"scale":-0.5}]},{"offset":1,"terms":[{"scale":-0.5}]}],"offsetTerms":[{"offset":1,"terms":[{"scale":-0.5}]},{"offset":1,"terms":[{"scale":-0.5}]}]}',
  });

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterRuntimeUvScale/);
  assert.match(fragmentShader, /vMapUv \* characterRuntimeUvScale/);
  assert.match(fragmentShader, /1\.000000 \+ characterUvRuntimeTime \* -0\.500000/);

  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: descriptor,
  });

  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeRepeat, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
});

test("UV animation runtime applies uniform vertex-color fract offsets from shadergraph evidence", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "uniformVertexColorFractOffset",
    uniformSource: "uniform:unif161",
    uniformScale: [0.5, 0.5],
    vertexSources: ["var7.x", "var7.y"],
    vertexOffset: [-1, -1],
    vertexTerms: [[{ source: "var7.x", scale: 2 }], [{ source: "var7.y", scale: 2 }]],
  };

  const settings = uvAnimationRuntimeSettings(descriptor);
  assert.deepEqual(settings, {
    mode: "uniformVertexColorFractOffset",
    uniformScale: [0.5, 0.5],
    vertexOffset: [-1, -1],
    vertexTerms: [
      [{ component: "r", scale: 2 }],
      [{ component: "g", scale: 2 }],
    ],
    cacheKey:
      '{"uniformScale":[0.5,0.5],"vertexOffset":[-1,-1],"vertexTerms":[[{"component":"r","scale":2}],[{"component":"g","scale":2}]]}',
  });

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /vColor\.r \* 2\.000000/);
  assert.match(fragmentShader, /vColor\.g \* 2\.000000/);
  assert.match(fragmentShader, /fract\(characterUvRuntimeTime \* vec2\(0\.500000, 0\.500000\) \* characterRuntimeVertexOffset\)/);

  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(material, {
    previewUvAnimation: descriptor,
  });

  assert.equal(material.vertexColors, true);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeRepeat, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
});

test("UV animation runtime applies sampled distortion composite scale formulas from shadergraph evidence", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "sampledDistort",
    baseSampler: "sampler152",
    distortionSampler: "sampler87",
    distortionChannels: ["x", "y"],
    distortionBias: 0,
    distortionScale: 1,
    axis: [1, 1],
    offset: [-0.5, -0.5],
    offsetSpeed: [-0.5, 0.5],
  };
  const compositeFormula = {
    className: "base-plus-base-times-sampled-color-scale",
    colorScale: [0.5, 0.5, 0.8],
    baseUvRepeat: [1.5, 1],
    distortionUvRepeat: [1, 1],
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "sampledDistortCompositeScale");
  assert.deepEqual(settings.colorScale, [0.5, 0.5, 0.8]);
  assert.deepEqual(settings.baseUvRepeat, [1.5, 1]);
  assert.deepEqual(settings.distortionUvRepeat, [1, 1]);

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterSampledUvBaseMap/);
  assert.match(fragmentShader, /characterSampledUvDistortionMap/);
  assert.match(fragmentShader, /vMapUv \* vec2\(1\.500000, 1\.000000\)/);
  assert.match(fragmentShader, /diffuseColor\.rgb \+= diffuseColor\.rgb \* characterSampledUvColor/);

  const loaded = [];
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: { sampler152: "../textures/base.png", sampler87: "../textures/distortion.png" },
    },
    null,
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );

  assert.deepEqual(loaded, [
    ["../textures/base.png", "color"],
    ["../textures/distortion.png", "data"],
  ]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeRepeat, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
});

test("UV animation runtime applies the Kirin summon ally half-atlas tint composite", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "scroll",
    speed: [0.5, 0],
    offset: [0, 0],
    offsetVariable: "tmpvar_6",
    phaseSource: "uniform:unif74",
  };
  const compositeFormula = {
    className: "base-times-binary-half-atlas-tint",
    baseSampler: "sampler56",
    tintSampler: "sampler77",
    baseUvRepeat: [1, 1],
    tintUvRepeat: [0.5, 1],
    tintScale: [2, 2, 2],
    selectorUniform: "unif74",
    selectorOffsetScale: [0.5, 0],
    defaultSelector: 0,
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "binaryHalfAtlasTint");
  assert.equal(settings.tintSampler, "sampler77");
  assert.equal(settings.selector, 0);

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterBinaryHalfAtlasTintMap/);
  assert.match(fragmentShader, /vMapUv \* vec2\(0\.500000, 1\.000000\)/);
  assert.match(fragmentShader, /characterBinaryHalfAtlasSelector \* vec2\(0\.500000, 0\.000000\)/);
  assert.match(fragmentShader, /diffuseColor\.rgb \*= characterBinaryHalfAtlasTint \* vec3\(2\.000000, 2\.000000, 2\.000000\)/);

  const loaded = [];
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      nativeShaderInputs: {
        roleSamplers: { baseColor: "sampler56", uvAnimation: "sampler77" },
      },
      samplerTexturePaths: { sampler77: "../textures/kirin-pack-team-color.png" },
    },
    null,
    (texturePath, kind) => {
      const texture = { texturePath, kind, flipY: true };
      loaded.push(texture);
      return texture;
    },
  );

  assert.deepEqual(loaded, [
    { texturePath: "../textures/kirin-pack-team-color.png", kind: "color", flipY: false },
  ]);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterBinaryHalfAtlasSelector.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeSpeed, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
});

test("UV animation runtime keeps the Summer summon team atlas selector static", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "scroll",
    speed: [0, 0.5],
    offset: [0, 0],
    offsetVariable: "tmpvar_4",
    phaseSource: "uniform:unif48",
    baseUvSource: "var3.xy",
  };
  const compositeFormula = {
    className: "static-binary-half-atlas-selector",
    selectorUniform: "unif48",
    selectorOffsetScale: [0, 0.5],
    defaultSelector: 0,
    atlasUvSource: "tmpvar_5",
    atlasSamplers: ["sampler51", "sampler65", "sampler122"],
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "binaryHalfAtlasSelector");
  assert.equal(settings.selector, 0);

  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterBinaryHalfAtlasSelector/);
  assert.match(fragmentShader, /vMapUv \+ characterBinaryHalfAtlasSelector \* vec2\(0\.000000, 0\.500000\)/);
  assert.doesNotMatch(fragmentShader, /characterUvRuntimeTime/);

  const loaded = [];
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      nativeShaderInputs: {
        roleSamplers: { baseColor: "sampler51", uvAnimation: "sampler51" },
      },
    },
    null,
    (...args) => {
      loaded.push(args);
      return {};
    },
  );

  assert.deepEqual(loaded, []);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterBinaryHalfAtlasSelector.value, 0);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeTime, undefined);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterUvRuntimeSpeed, undefined);
  assert.equal(typeof material.onBeforeCompile, "function");
});

test("UV animation runtime applies sampled distortion mask formulas from shadergraph evidence", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "sampledDistort",
    baseSampler: "sampler139",
    distortionSampler: "sampler74",
    distortionChannels: ["x", "y"],
    distortionBias: 0,
    distortionScale: 1,
    axis: [1, 1],
    offset: [-0.5, -0.5],
    offsetSpeed: [-0.5, 0.5],
  };
  const compositeFormula = {
    className: "base-plus-base-times-sampled-color-mask",
    baseUvRepeat: [1.5, 1],
    distortionUvRepeat: [1, 1],
    maskChannel: "z",
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "sampledDistortCompositeMask");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterSampledUvDistortion\.z/);
  assert.match(fragmentShader, /diffuseColor\.rgb \+= diffuseColor\.rgb \* characterSampledUvColor/);

  const loaded = [];
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: { sampler139: "../textures/animated.png", sampler74: "../textures/distortion.png" },
    },
    null,
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );
  assert.deepEqual(loaded, [
    ["../textures/animated.png", "color"],
    ["../textures/distortion.png", "data"],
  ]);
});

test("UV animation runtime applies sampled channel plus secondary texture formulas", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "sampledDistort",
    baseSampler: "sampler145",
    distortionSampler: "sampler135",
    distortionChannel: "x",
    axis: [1, 0],
  };
  const compositeFormula = {
    className: "sampled-channel-times-secondary-texture",
    baseUvRepeat: [0.01, 1],
    distortionUvRepeat: [1, 1],
    channel: "y",
    secondarySampler: "sampler154",
    secondaryUvRepeat: [1, 1],
    colorScale: [3, 3, 3],
    operation: "add",
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "sampledChannelSecondaryTexture");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterSampledUvAnimatedChannel/);
  assert.match(fragmentShader, /diffuseColor\.rgb \+= characterSampledUvSecondary/);

  const loaded = [];
  applyCharacterUvAnimationRuntime(
    { userData: {} },
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: {
        sampler145: "../textures/channel.png",
        sampler135: "../textures/distortion.png",
        sampler154: "../textures/secondary.png",
      },
    },
    null,
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );
  assert.deepEqual(loaded, [
    ["../textures/channel.png", "color"],
    ["../textures/distortion.png", "data"],
    ["../textures/secondary.png", "color"],
  ]);
});

test("UV animation runtime applies offset-field secondary texture formulas", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "sampledDistort",
    baseSampler: "sampler85",
    distortionSampler: "sampler81",
    distortionScale: 0.15,
    offsetSpeed: [1, 0],
  };
  const compositeFormula = {
    className: "sampled-offset-field-for-secondary-sampler",
    baseUvRepeat: [0, 0],
    distortionUvRepeat: [2, 2],
    secondarySampler: "sampler109",
    secondaryUvRepeat: [1, 1],
    offsetFieldChannels: ["x", "y"],
    offsetFieldBias: [-0.5, -0.5],
    distortionAmplitudeChannel: "y",
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "sampledOffsetFieldSecondaryTexture");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterSampledUvSecondaryOffset/);
  assert.match(fragmentShader, /diffuseColor \*= characterSampledUvSecondary/);

  const loaded = [];
  applyCharacterUvAnimationRuntime(
    { userData: {} },
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: {
        sampler85: "../textures/field.png",
        sampler81: "../textures/distortion.png",
        sampler109: "../textures/secondary.png",
      },
    },
    null,
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );
  assert.deepEqual(loaded, [
    ["../textures/field.png", "color"],
    ["../textures/distortion.png", "data"],
    ["../textures/secondary.png", "color"],
  ]);
});

test("UV animation runtime applies sampled threshold masks with inline lookup ramps", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "sampledFractOffsetDistort",
    baseSampler: "sampler117",
    distortionSampler: "sampler94",
    distortionChannels: ["x", "y"],
    offset: [-0.5, -0.5],
    offsetSpeed: [0.85, -0.35],
    offsetPhaseModes: ["fract", "fract"],
  };
  const lookupRamp = Array.from({ length: 64 }, (_unused, index) => {
    const value = index / 63;
    return [value, value, value];
  });
  const compositeFormula = {
    className: "sampled-threshold-mask",
    baseUvRepeat: [1.5, 1.5],
    distortionUvRepeat: [1, 1],
    lookupSampler: "sampler136",
    lookupUvRepeat: [1, 1],
    lookupRamp: { sampleCount: 64, rampHash: "threshold-ramp", ramp: lookupRamp },
    thresholdOffset: 0.01,
    thresholdScale: 0.99,
    colorScale: [2.5, 2.5, 2.5],
    colorBias: [-0.25, -0.25, -0.25],
    alphaSmoothLow: 0.5,
    alphaSmoothScale: 0.5,
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "sampledThresholdMask");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>", settings);
  assert.match(fragmentShader, /characterSampledUvLookupMap/);
  assert.match(fragmentShader, /vColor\.a/);
  assert.match(fragmentShader, /diffuseColor\.a = 1\.0 -/);

  const loaded = [];
  function DataTexture(data, width, height, format, type) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.format = format;
    this.type = type;
  }
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: { sampler117: "../textures/base.png", sampler94: "../textures/distortion.png" },
    },
    {
      DataTexture,
      RGBAFormat: "rgba",
      UnsignedByteType: "uint8",
      LinearFilter: "linear",
      ClampToEdgeWrapping: "clamp",
      NoColorSpace: "none",
    },
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );

  assert.deepEqual(loaded, [
    ["../textures/base.png", "color"],
    ["../textures/distortion.png", "data"],
  ]);
  assert.equal(material.vertexColors, true);
  assert.equal(material.alphaMap, null);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterSampledUvLookupMap.value.width, 64);
});

test("UV animation runtime applies Poseidon nested opaque water formula", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "nestedSampledUvDistort",
    baseSampler: "sampler168",
    distortionSampler: "sampler98",
  };
  const baseRamp = Array.from({ length: 64 }, () => [0.01, 0.7, 0.86]);
  const compositeFormula = {
    className: "base-plus-nested-sampled-color",
    distortionUvRepeat: [1, 4],
    distortionMaskSampler: "sampler116",
    distortionMaskUvRepeat: [0.25, 0.25],
    nestedBaseSampler: "sampler168",
    nestedBaseUvRepeat: [0.25, 1],
    nestedOffsetScale: [0.2, 0.2],
    baseColorSampler: "sampler37",
    baseColorRamp: { rampHash: "poseidon-base", ramp: baseRamp },
    baseColorUvRepeat: [1, 1],
    reflectionLookupSampler: "sampler209",
    reflectionUvScale: [1, 1],
    reflectionIntensity: 0.85,
    carveScale: 0.562963,
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "nestedWaterOpaqueComposite");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>\n#include <color_fragment>\n#include <output_fragment>", settings);
  assert.match(fragmentShader, /characterNestedWaterBaseRampMap/);
  assert.match(fragmentShader, /characterNestedWaterReflectionMap/);
  assert.match(fragmentShader, /gl_FragColor = vec4\(characterNestedWaterFinalColor, characterNestedWaterFinalAlpha\)/);

  function DataTexture(data, width, height, format, type) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.format = format;
    this.type = type;
  }
  const loaded = [];
  const material = { userData: {}, color: { setHex() {} } };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: {
        sampler98: "../textures/distortion.png",
        sampler116: "../textures/mask.png",
        sampler168: "../textures/nested.png",
        sampler209: "../textures/reflection.png",
      },
      shaderPassRenderState: { states: [{ blendEnabled: false, depthWrite: true, depthTest: true, blendPreset: "disabled" }] },
    },
    {
      DataTexture,
      RGBAFormat: "rgba",
      UnsignedByteType: "uint8",
      LinearFilter: "linear",
      ClampToEdgeWrapping: "clamp",
      NoColorSpace: "none",
    },
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );

  assert.deepEqual(loaded, [
    ["../textures/distortion.png", "data"],
    ["../textures/mask.png", "data"],
    ["../textures/nested.png", "color"],
    ["../textures/reflection.png", "color"],
  ]);
  assert.equal(material.vertexColors, true);
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
  assert.equal(material.userData.characterUvRuntimeUniforms.characterNestedWaterBaseRampMap.value.width, 64);
});

test("UV animation runtime applies Poseidon throne water reveal formula", async () => {
  const { applyCharacterUvAnimationRuntime, patchDirectScrollUvFragmentShader, uvAnimationRuntimeSettings } = await import(
    "../viewer/material-runtime-shaders.js"
  );
  const descriptor = {
    mode: "nestedSampledUvDistort",
    baseSampler: "sampler221",
    distortionSampler: "sampler86",
  };
  const compositeFormula = {
    className: "nested-water-throne-reveal",
    distortionUvRepeat: [1, 4],
    distortionMaskSampler: "sampler104",
    distortionMaskUvRepeat: [0.25, 0.25],
    nestedBaseSampler: "sampler221",
    nestedBaseUvRepeat: [0.25, 1],
    nestedOffsetScale: [0.2, 0.2],
    constantBaseColor: [0.205458, 0.607533, 0.726],
    carveScale: 0.8,
    revealThresholdScale: 0.05,
    revealAlphaScale: 0.8,
  };

  const settings = uvAnimationRuntimeSettings(descriptor, compositeFormula);
  assert.equal(settings.mode, "nestedWaterThroneReveal");
  const fragmentShader = patchDirectScrollUvFragmentShader("#include <map_fragment>\n#include <color_fragment>\n#include <output_fragment>", settings);
  assert.match(fragmentShader, /characterNestedWaterReveal/);
  assert.match(fragmentShader, /characterNestedWaterVertexA/);

  const loaded = [];
  const material = { userData: {} };
  applyCharacterUvAnimationRuntime(
    material,
    {
      previewUvAnimation: descriptor,
      uvAnimationCompositeFormula: compositeFormula,
      samplerTexturePaths: {
        sampler86: "../textures/distortion.png",
        sampler104: "../textures/mask.png",
        sampler221: "../textures/nested.png",
      },
      shaderPassRenderState: {
        states: [{ blendEnabled: true, depthWrite: false, depthTest: true, blendPreset: "premultiplied-alpha-rgb" }],
      },
    },
    null,
    (texturePath, kind) => {
      loaded.push([texturePath, kind]);
      return { texturePath, kind };
    },
  );

  assert.deepEqual(loaded, [
    ["../textures/distortion.png", "data"],
    ["../textures/mask.png", "data"],
    ["../textures/nested.png", "color"],
  ]);
  assert.equal(material.vertexColors, true);
  assert.equal(material.alphaMap, null);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.premultipliedAlpha, true);
});

test("character material runtime does not shift base UVs for unresolved uvAnimation evidence", async () => {
  const { attachRuntimeMaterialEvidence } = await import("../viewer/material-runtime-shaders.js");
  const row = {
    rel: "Characters/Adagio/Art/adagio.glb",
    materialIndex: 1,
    materialName: "/Characters/Adagio/Art/adagio.adagio_mat.shadergraph",
    shadergraphRel: "Characters/Adagio/Art/adagio.adagio_mat.shadergraph",
    roleNames: "alphaBlend|alphaMask|baseColor|normal|reflection|uvAnimation",
    roleTexturePaths: "{}",
    previewUvAnimation: JSON.stringify({ mode: "scroll", speed: [0, 0], offset: [0.5, 0.5] }),
    uvAnimationGapReason: "sampled-uv-distortion",
    unimplementedRoleNames: "uvAnimation",
  };
  const material = { userData: {} };

  attachRuntimeMaterialEvidence(material, row, () => ({}));

  const shader = {
    uniforms: {},
    fragmentShader: "#include <map_fragment>",
  };
  material.onBeforeCompile?.(shader);

  assert.equal(material.userData.characterUvRuntimeUniforms, undefined);
  assert.match(shader.fragmentShader, /#include <map_fragment>/);
  assert.doesNotMatch(shader.fragmentShader, /characterRuntimeUv/);
});

test("color runtime maps vertex color role to material vertexColors", async () => {
  const { colorRuntimeSettings } = await import("../viewer/material-runtime-shaders.js");
  assert.deepEqual(colorRuntimeSettings({ colorMode: "vertex-color" }), { vertexColors: true });
  assert.deepEqual(colorRuntimeSettings({ colorMode: "" }), { vertexColors: false });
});

test("color runtime applies inline and special shader color modes", async () => {
  const { applyCharacterColorRuntime } = await import("../viewer/material-runtime-shaders.js");
  const color = {
    values: null,
    setRGB(r, g, b) {
      this.values = [r, g, b];
    },
    set(value) {
      this.values = value;
    },
  };
  const emissive = {
    values: null,
    setRGB(r, g, b) {
      this.values = [r, g, b];
    },
    set(value) {
      this.values = value;
    },
  };
  const material = { color, emissive, userData: {} };

  applyCharacterColorRuntime(material, {
    colorMode: "inline-uniform",
    inlineColors: [{ rgb: [0.12, 0.34, 0.56], alpha: 1 }],
  });
  assert.deepEqual(material.color.values, [0.12, 0.34, 0.56]);

  applyCharacterColorRuntime(material, {
    colorMode: "water",
    inlineColors: [{ rgb: [0.1, 0.7, 0.9], alpha: 1 }],
  });
  assert.deepEqual(material.color.values, [0.1, 0.7, 0.9]);
  assert.equal(material.metalness, 0);
  assert.equal(material.transparent, false);

  applyCharacterColorRuntime(material, {
    colorMode: "guob",
    inlineColors: [{ rgb: [0.04, 0.14, 0.16], alpha: 0.38 }],
  });
  assert.deepEqual(material.color.values, [0.04, 0.14, 0.16]);
  assert.equal(material.transparent, true);
  assert.equal(material.opacity, 0.38);
  assert.equal(material.depthWrite, false);
  assert.equal(material.needsUpdate, true);
});

test("material runtime evidence is applied once when meshes share a material", async () => {
  const { attachRuntimeMaterialEvidence } = await import("../viewer/material-runtime-shaders.js");
  const row = {
    rel: "Characters/Ringo/Art/ringo.glb",
    materialIndex: 0,
    materialName: "/Characters/Ringo/Art/ringo.ringo_mat.shadergraph",
    shadergraphRel: "Characters/Ringo/Art/ringo.ringo_mat.shadergraph",
    roleNames: "reflection|uvAnimation",
    roleTexturePaths: JSON.stringify({ reflection: "../textures/reflection.png" }),
    previewUvAnimation: JSON.stringify({ mode: "scroll", speed: [0.1, 0.2], offset: [0, 0] }),
    reflectionMode: "lookup-2d",
    recommendedAlphaMode: "OPAQUE",
  };
  const material = { userData: {} };

  attachRuntimeMaterialEvidence(material, row, (texturePath, kind) => ({ texturePath, kind }));
  attachRuntimeMaterialEvidence(material, row, (texturePath, kind) => ({ texturePath, kind }));

  const shader = {
    uniforms: {},
    fragmentShader: "#include <map_fragment>\n#include <lights_fragment_end>",
  };
  material.onBeforeCompile(shader);

  assert.equal((shader.fragmentShader.match(/uniform float characterUvRuntimeTime;/g) || []).length, 1);
  // 反射默认关闭：不再注入 screen-space 反射（它把冷色/深色冲淡成灰白、随视角固定在画面）。
  assert.equal((shader.fragmentShader.match(/characterReflectionMap/g) || []).length, 0);
  assert.equal((shader.fragmentShader.match(/vec2 characterReflectionUv/g) || []).length, 0);
});
