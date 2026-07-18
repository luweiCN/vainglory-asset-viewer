const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildMaterialRuntimePipelineRows,
  colorModeForMaterial,
  exportMaterialRuntimePipelineManifest,
  normalizeShadergraphRel,
  summarizeMaterialRuntimePipelineRows,
} = require("../tools/material_runtime_pipeline_manifest");

function writeGlb(filePath, gltfJson) {
  const json = Buffer.from(JSON.stringify(gltfJson), "utf8");
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const jsonChunk = Buffer.alloc(paddedLength, 0x20);
  json.copy(jsonChunk);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "utf8");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, chunkHeader, jsonChunk]));
}

function writeShadergraph(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "\0",
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "\0",
        "sampler40",
        "\0",
        "sampler54",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler40;",
        "uniform sampler2D sampler54;",
        "varying vec4 var0;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1 = ((texture2D (sampler40, var0.xy).xyz * 2.0) - 1.0);",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler54, var0.xy);",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeReflectionShadergraph(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "\0",
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "\0",
        "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        "\0",
        "sampler40",
        "\0",
        "sampler54",
        "\0",
        "sampler88",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler40;",
        "uniform sampler2D sampler54;",
        "uniform sampler2D sampler88;",
        "varying vec4 var0;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1 = ((texture2D (sampler40, var0.xy).xyz * 2.0) - 1.0);",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler54, var0.xy);",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler88, var0.zw);",
        "  gl_FragColor = vec4((tmpvar_2.xyz + tmpvar_3.xyz), tmpvar_2.w);",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeUniformColorShadergraph(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        "precision mediump float;",
        "uniform lowp vec3 unif1;",
        "void main () {",
        "  gl_FragColor.xyz = unif1;",
        "  gl_FragColor.w = 1.0;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeVertexColorShadergraph(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        "precision mediump float;",
        "attribute lowp vec4 _Color;",
        "varying lowp vec4 var0;",
        "void main () {",
        "  gl_FragColor = var0;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

test("normalizeShadergraphRel keeps only material shadergraph paths", () => {
  assert.equal(
    normalizeShadergraphRel("/Characters/HeroA/Art/hero_a.body.shadergraph"),
    "Characters/HeroA/Art/hero_a.body.shadergraph",
  );
  assert.equal(normalizeShadergraphRel("plain_material"), "");
});

test("buildMaterialRuntimePipelineRows links GLB materials to shadergraph roles", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-pipeline-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const shadergraphRel = "Characters/HeroA/Art/hero_a.body.shadergraph";
  writeGlb(path.join(tempDir, "glb", rel), {
    asset: { version: "2.0" },
    images: [{ name: "body_basecolor", mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [
      {
        name: `/${shadergraphRel}`,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          baseColorFactor: [1, 1, 1, 1],
        },
      },
    ],
  });
  writeShadergraph(path.join(tempDir, "shadergraphs", shadergraphRel));

  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: path.join(tempDir, "glb"),
    shadergraphRoot: path.join(tempDir, "shadergraphs"),
    manifestItems: [{ rel, modelLabel: "HeroA_DefaultSkin", character: "HeroA" }],
  });
  const summary = summarizeMaterialRuntimePipelineRows(rows);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].shadergraphFound, "yes");
  assert.match(rows[0].roleNames, /\bbaseColor\b/);
  assert.match(rows[0].roleNames, /\bnormal\b/);
  assert.equal(rows[0].baseColorHash, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
  assert.equal(rows[0].normalHash, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.match(rows[0].missingGlbRoleNames, /\bnormal\b/);
  assert.equal(summary.parsedShadergraphRows, 1);
  assert.equal(summary.rowsWithGlbRoleGaps, 1);
  assert.equal(summary.byMissingGlbRole.normal, 1);
  assert.equal(typeof summary.uvAnimationRows, "number");
  assert.equal(typeof summary.implementedUvAnimationRows, "number");
  assert.equal(typeof summary.uvAnimationGapRows, "number");
});

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
  assert.equal(typeof JSON.parse(rows[0].previewUvAnimation || "null"), "object");
  assert.ok(["OPAQUE", "MASK", "BLEND"].includes(rows[0].recommendedAlphaMode));
  assert.match(rows[0].unimplementedRoleNames, /\buvAnimation\b|\breflection\b|^$/);
});

test("material runtime manifest includes reflection mode evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-pipeline-reflection-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const shadergraphRel = "Characters/HeroA/Art/hero_a.reflect.shadergraph";
  writeGlb(path.join(tempDir, "glb", rel), {
    asset: { version: "2.0" },
    materials: [{ name: `/${shadergraphRel}`, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
  });
  writeReflectionShadergraph(path.join(tempDir, "shadergraphs", shadergraphRel));

  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: path.join(tempDir, "glb"),
    shadergraphRoot: path.join(tempDir, "shadergraphs"),
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [{ rel, modelLabel: "HeroA_DefaultSkin", character: "HeroA" }],
  });

  const roleTexturePaths = JSON.parse(rows[0].roleTexturePaths);
  assert.match(rows[0].roleNames, /\breflection\b/);
  assert.equal(rows[0].reflectionMode, "lookup-2d");
  assert.doesNotMatch(rows[0].unimplementedRoleNames, /\breflection\b/);
  assert.equal(
    roleTexturePaths.reflection,
    "../hero_assets_material_textures_preview/Characters/HeroA/Art/hero_a.reflect.reflection.png",
  );
});

test("material runtime manifest classifies special color modes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-pipeline-color-mode-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const shadergraphs = {
    water: "Characters/HeroA/Art/hero_a.WaterShader.shadergraph",
    bowstring: "Characters/HeroA/Art/hero_a.bowAlpha_mat.shadergraph",
    uniform: "Characters/HeroA/Art/hero_a.uniform.shadergraph",
    vertex: "Characters/HeroA/Art/hero_a.vertex.shadergraph",
  };
  writeGlb(path.join(tempDir, "glb", rel), {
    asset: { version: "2.0" },
    materials: Object.values(shadergraphs).map((shadergraphRel) => ({
      name: `/${shadergraphRel}`,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
    })),
  });
  writeShadergraph(path.join(tempDir, "shadergraphs", shadergraphs.water));
  writeShadergraph(path.join(tempDir, "shadergraphs", shadergraphs.bowstring));
  writeUniformColorShadergraph(path.join(tempDir, "shadergraphs", shadergraphs.uniform));
  writeVertexColorShadergraph(path.join(tempDir, "shadergraphs", shadergraphs.vertex));

  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: path.join(tempDir, "glb"),
    shadergraphRoot: path.join(tempDir, "shadergraphs"),
    manifestItems: [{ rel, modelLabel: "HeroA_DefaultSkin", character: "HeroA" }],
  });
  const rowsByShadergraph = new Map(rows.map((row) => [row.shadergraphRel, row]));

  assert.equal(rowsByShadergraph.get(shadergraphs.water).colorMode, "water");
  assert.equal(rowsByShadergraph.get(shadergraphs.bowstring).colorMode, "bowstring");
  assert.equal(rowsByShadergraph.get(shadergraphs.uniform).colorMode, "inline-uniform");
  assert.equal(rowsByShadergraph.get(shadergraphs.vertex).colorMode, "vertex-color");
  assert.equal(colorModeForMaterial({ materialName: "/plain.shadergraph" }, { roles: {} }, "plain.shadergraph"), "");
});

test("exportMaterialRuntimePipelineManifest writes viewer manifest and TSV report", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-pipeline-export-"));
  const rel = "Characters/HeroA/Art/hero_a.glb";
  const shadergraphRel = "Characters/HeroA/Art/hero_a.body.shadergraph";
  const manifestPath = path.join(tempDir, "manifest.json");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "pipeline.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  writeGlb(path.join(tempDir, "glb", rel), {
    asset: { version: "2.0" },
    materials: [{ name: `/${shadergraphRel}`, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
  });
  writeShadergraph(path.join(tempDir, "shadergraphs", shadergraphRel));
  fs.writeFileSync(manifestPath, `${JSON.stringify([{ rel, modelLabel: "HeroA_DefaultSkin", character: "HeroA" }])}\n`);

  const summary = exportMaterialRuntimePipelineManifest({
    manifestPath,
    glbRoot: path.join(tempDir, "glb"),
    shadergraphRoot: path.join(tempDir, "shadergraphs"),
    viewerOut,
    tsvOut,
    jsonOut,
  });
  const viewer = JSON.parse(fs.readFileSync(viewerOut, "utf8"));

  assert.equal(summary.parsedShadergraphRows, 1);
  assert.equal(viewer.items[0].shadergraphRel, shadergraphRel);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /missingGlbRoleNames/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.rowsWithGlbRoleGaps, 1);
});

test("material runtime sampler layout uses native TCH0 units before fallback lookup diagnostics", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [
      { rel: "Characters/Hero067/Art/hero067.glb", modelLabel: "hero067", character: "Hero067" },
      { rel: "Characters/Hero028/Art/hero028_deathKnight_LE.glb", modelLabel: "hero028_deathKnight_LE", character: "Hero028" },
      { rel: "Characters/Node5v5Home/Art/node5v5Home.glb", modelLabel: "node5v5Home", character: "Node5v5Home" },
    ],
  });

  const hero067 = rows.find((row) => row.shadergraphRel === "Characters/Hero067/Art/hero067.hero067_mat.shadergraph");
  const hero028 = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero028/Art/hero028_deathKnight_LE.deathKnight_LE_mat.shadergraph",
  );
  const node5v5Home = rows.find(
    (row) => row.shadergraphRel === "Characters/Node5v5Home/Art/node5v5Home.node5v5Home_mat.shadergraph",
  );
  assert.ok(hero067);
  assert.ok(hero028);
  assert.ok(node5v5Home);

  const hero067Records = JSON.parse(hero067.runtimeSamplerRecords);
  const hero067Ramp = hero067Records.find((record) => record.sampler === "sampler67");
  assert.equal(hero067Ramp.kind, "tch0-inline-rgb-float-lookup");
  assert.equal(hero067Ramp.textureHashRecordCount, 4);
  assert.equal(hero067Ramp.textureHashRecordStartDelta, 10);
  assert.equal(hero067Ramp.textureHashRecordExactKnownHashMatches, 4);
  assert.equal(hero067Ramp.nativeInlineTextureUnit, 4);
  assert.equal(hero067Ramp.nativeInlineTextureOffset, 334);
  assert.equal(hero067Ramp.inlineLookupStats.width, 64);
  assert.equal(hero067.texturePathMissingSamplers, "sampler67");
  assert.equal(hero067.runtimeResolvedSamplers, "sampler67");
  assert.equal(hero067.unresolvedSamplers, "");

  const hero028Records = JSON.parse(hero028.runtimeSamplerRecords);
  const hero028Ramp = hero028Records.find((record) => record.sampler === "sampler60");
  assert.equal(hero028Ramp.kind, "tch0-inline-rgb-float-lookup-clamped");
  assert.equal(hero028Ramp.textureHashRecordCount, 4);
  assert.equal(hero028Ramp.inlineLookupStats.width, 64);
  assert.equal(hero028Ramp.inlineLookupStats.nativeClampApplied, true);
  assert.ok(hero028Ramp.inlineLookupStats.rawMin < 0);
  assert.equal(hero028Ramp.inlineLookupStats.nativeByteMin, 0);
  assert.equal(hero028.texturePathMissingSamplers, "sampler60");
  assert.equal(hero028.runtimeResolvedSamplers, "sampler60");
  assert.equal(hero028.unresolvedSamplers, "");

  const node5v5Records = JSON.parse(node5v5Home.runtimeSamplerRecords);
  const node5v5Fog = node5v5Records.find((record) => record.sampler === "sampler212");
  assert.equal(node5v5Fog.kind, "runtime-fog-of-war-texture-diagnostic");
  assert.equal(node5v5Fog.runtimeSceneTextureUsage.semantic, "FogOfWar.Texture");
  assert.equal(node5v5Fog.runtimeSceneTextureUsage.transformSemantic, "FogOfWar.TranslateAndScale");
  assert.equal(node5v5Fog.runtimeSceneTextureUsage.channel, "x");
  assert.equal(node5v5Fog.runtimeSceneTextureUsage.uvVarying, "var6");
  assert.deepEqual(new Set(node5v5Home.texturePathMissingSamplers.split("|")), new Set(["sampler60", "sampler212"]));
  assert.deepEqual(new Set(node5v5Home.runtimeResolvedSamplers.split("|")), new Set(["sampler60", "sampler212"]));
  assert.equal(node5v5Home.unresolvedSamplers, "");
});

test("material runtime manifest reports sampled UV composite formula runtime and blockers precisely", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [
      { rel: "Characters/CardsChest/Art/lootChest_t1.glb", modelLabel: "lootChest_t1", character: "CardsChest" },
      { rel: "Characters/CardsChest/Art/mysteryChest_t1.glb", modelLabel: "mysteryChest_t1", character: "CardsChest" },
      { rel: "Characters/CardsChest/Art/rewardChestBattered.glb", modelLabel: "rewardChestBattered", character: "CardsChest" },
      { rel: "Characters/Hero012/Art/hero012_fall_t2.glb", modelLabel: "hero012_fall_t2", character: "Hero012" },
      { rel: "Characters/Hero025/ArtWall/hero025Wall_occult_ally.glb", modelLabel: "hero025Wall_occult_ally", character: "Hero025" },
      { rel: "Characters/Hero028/Art/hero028_poseidon.glb", modelLabel: "hero028_poseidon", character: "Hero028" },
      { rel: "Characters/Petal/Art/petal_hlwn.glb", modelLabel: "petal_hlwn", character: "Petal" },
    ],
  });

  const sampled = rows.find(
    (row) => row.shadergraphRel === "Characters/CardsChest/Art/lootChest_t1.lootChestRare_Chest_mat.shadergraph",
  );
  const sampledScaleBeforeTexture = rows.find(
    (row) => row.shadergraphRel === "Characters/CardsChest/Art/mysteryChest_t1.mysteryChestL1_mat.shadergraph",
  );
  const sampledMask = rows.find(
    (row) => row.shadergraphRel === "Characters/CardsChest/Art/rewardChestBattered.battered_mat.shadergraph",
  );
  const channelSecondary = rows.find((row) => row.shadergraphRel === "Characters/Hero012/Art/hero012_fall_t2.Glow.shadergraph");
  const thresholdMask = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero025/ArtWall/hero025Wall_occult_ally.occult_ally_mat.shadergraph",
  );
  const nested = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero028/Art/hero028_poseidon.hero028_waterOpaque_mat.shadergraph",
  );
  const nestedThrone = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero028/Art/hero028_poseidon.WaterShader_hero028_poseidonThrone_mat.shadergraph",
  );
  const offsetField = rows.find(
    (row) => row.shadergraphRel === "Characters/Petal/Art/petal_hlwn.hlwn_eyes_mat.shadergraph",
  );

  assert.ok(sampled);
  assert.equal(sampled.previewUvAnimationMode, "sampledDistort");
  assert.equal(sampled.uvAnimationRuntimeStage, "runtime-sampledDistort");
  assert.equal(sampled.uvAnimationExecutionMode, "runtime");
  assert.equal(sampled.unimplementedRoleNames, "");
  assert.equal(sampled.uvAnimationCompositeFormulaClass, "base-plus-base-times-sampled-color-scale");
  assert.deepEqual(JSON.parse(sampled.uvAnimationCompositeFormula), {
    className: "base-plus-base-times-sampled-color-scale",
    colorScale: [0.5, 0.5, 0.8],
    baseUvRepeat: [1.5, 1],
    distortionUvRepeat: [1, 1],
  });
  assert.ok(sampledScaleBeforeTexture);
  assert.equal(sampledScaleBeforeTexture.previewUvAnimationMode, "sampledDistort");
  assert.equal(sampledScaleBeforeTexture.uvAnimationRuntimeStage, "runtime-sampledDistort");
  assert.equal(sampledScaleBeforeTexture.uvAnimationExecutionMode, "runtime");
  assert.equal(sampledScaleBeforeTexture.uvAnimationCompositeFormulaClass, "base-plus-base-times-sampled-color-scale");
  assert.deepEqual(JSON.parse(sampledScaleBeforeTexture.uvAnimationCompositeFormula).colorScale, [0.175, 0.175, 0.28]);
  assert.ok(sampledMask);
  assert.equal(sampledMask.uvAnimationRuntimeStage, "runtime-sampledDistort");
  assert.deepEqual(JSON.parse(sampledMask.uvAnimationCompositeFormula).maskChannel, "z");
  assert.ok(channelSecondary);
  assert.equal(channelSecondary.uvAnimationRuntimeStage, "runtime-sampledDistort");
  assert.deepEqual(JSON.parse(channelSecondary.uvAnimationCompositeFormula), {
    className: "sampled-channel-times-secondary-texture",
    baseUvRepeat: [0.01, 1],
    distortionUvRepeat: [1, 1],
    channel: "y",
    secondarySampler: "sampler24",
    secondaryUvRepeat: [1, 1],
    colorScale: [3, 3, 3],
    operation: "multiply",
  });
  assert.ok(nested);
  assert.equal(nested.previewUvAnimationMode, "nestedSampledUvDistort");
  assert.equal(nested.uvAnimationRuntimeStage, "runtime-nestedSampledUvDistort");
  assert.equal(nested.uvAnimationExecutionMode, "runtime");
  assert.equal(nested.unimplementedRoleNames, "");
  assert.equal(nested.uvAnimationRuntimeBlockers, "");
  assert.equal(nested.uvAnimationCompositeFormulaClass, "base-plus-nested-sampled-color");
  const nestedFormula = JSON.parse(nested.uvAnimationCompositeFormula);
  assert.deepEqual(nestedFormula.sampleOrder, ["sampler37", "sampler98", "sampler116", "sampler168", "sampler209"]);
  assert.equal(nestedFormula.baseColorSampler, "sampler37");
  assert.equal(nestedFormula.baseColorRamp.sampleCount, 64);
  assert.equal(nestedFormula.distortionMaskSampler, "sampler116");
  assert.deepEqual(nestedFormula.distortionUvRepeat, [1, 4]);
  assert.deepEqual(nestedFormula.nestedBaseUvRepeat, [0.25, 1]);
  assert.equal(nestedFormula.reflectionLookupSampler, "sampler209");
  assert.equal(nestedFormula.reflectionLookupRampSampleCount, "");
  const nestedRuntimeSamplers = JSON.parse(nested.runtimeSamplerRecords);
  const inlineBaseColor = nestedRuntimeSamplers.find((record) => record.sampler === "sampler37");
  assert.equal(inlineBaseColor.kind, "tch0-inline-rgb-float-lookup");
  assert.equal(inlineBaseColor.nativeInlineTextureUnit, 4);
  assert.equal(inlineBaseColor.nativeInlineTextureOffset, 324);
  assert.equal(inlineBaseColor.inlineLookupStats.width, 64);
  assert.equal(nested.uvAnimationRuntimeBlockerDetails, "null");
  assert.ok(nestedThrone);
  assert.equal(nestedThrone.previewUvAnimationMode, "nestedSampledUvDistort");
  assert.equal(nestedThrone.uvAnimationRuntimeStage, "runtime-nestedSampledUvDistort");
  assert.equal(nestedThrone.uvAnimationExecutionMode, "runtime");
  assert.equal(nestedThrone.unimplementedRoleNames, "");
  assert.equal(nestedThrone.uvAnimationCompositeFormulaClass, "nested-water-throne-reveal");
  const nestedThroneFormula = JSON.parse(nestedThrone.uvAnimationCompositeFormula);
  assert.equal(nestedThroneFormula.distortionMaskSampler, "sampler104");
  assert.deepEqual(nestedThroneFormula.distortionUvRepeat, [1, 4]);
  assert.deepEqual(nestedThroneFormula.distortionMaskUvRepeat, [0.25, 0.25]);
  assert.deepEqual(nestedThroneFormula.nestedBaseUvRepeat, [0.25, 1]);
  assert.deepEqual(nestedThroneFormula.constantBaseColor, [0.205458, 0.607533, 0.726]);
  assert.ok(offsetField);
  assert.equal(offsetField.previewUvAnimationMode, "sampledDistort");
  assert.equal(offsetField.uvAnimationRuntimeStage, "runtime-sampledDistort");
  assert.equal(offsetField.uvAnimationCompositeFormulaClass, "sampled-offset-field-for-secondary-sampler");
  assert.deepEqual(JSON.parse(offsetField.uvAnimationCompositeFormula).secondarySampler, "sampler109");
  assert.ok(thresholdMask);
  assert.equal(thresholdMask.previewUvAnimationMode, "sampledFractOffsetDistort");
  assert.equal(thresholdMask.uvAnimationRuntimeStage, "runtime-sampledFractOffsetDistort");
  const thresholdFormula = JSON.parse(thresholdMask.uvAnimationCompositeFormula);
  assert.equal(thresholdFormula.lookupSampler, "sampler136");
  assert.equal(thresholdFormula.lookupRamp.sampleCount, 64);
});

test("material runtime manifest recovers the Kirin summon ally half-atlas tint composite", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [
      {
        rel: "Characters/Hero015/Art/hero015_kirin_pack.glb",
        modelLabel: "hero015_kirin_pack",
        character: "Hero015",
      },
    ],
  });
  const kirin = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero015/Art/hero015_kirin_pack.hero015_kirinPack_mat.shadergraph",
  );

  assert.ok(kirin);
  assert.equal(kirin.previewUvAnimationMode, "scroll");
  assert.equal(kirin.uvAnimationCompositeFormulaClass, "base-times-binary-half-atlas-tint");
  assert.deepEqual(JSON.parse(kirin.uvAnimationCompositeFormula), {
    className: "base-times-binary-half-atlas-tint",
    baseSampler: "sampler56",
    tintSampler: "sampler77",
    baseUvRepeat: [1, 1],
    tintUvRepeat: [0.5, 1],
    tintScale: [2, 2, 2],
    selectorUniform: "unif74",
    selectorOffsetScale: [0.5, 0],
    defaultSelector: 0,
  });
  assert.equal(kirin.uvAnimationExecutionMode, "runtime");
  assert.equal(kirin.unimplementedRoleNames, "");
});

test("material runtime manifest keeps the Summer summon team atlas selector static", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [
      {
        rel: "Characters/Hero015/Art/hero015_summer_pack.glb",
        modelLabel: "hero015_summer_pack",
        character: "Hero015",
      },
    ],
  });
  const summer = rows.find(
    (row) => row.shadergraphRel === "Characters/Hero015/Art/hero015_summer_pack.summer_pack_mat.shadergraph",
  );

  assert.ok(summer);
  assert.equal(summer.previewUvAnimationMode, "scroll");
  assert.equal(summer.uvAnimationCompositeFormulaClass, "static-binary-half-atlas-selector");
  assert.deepEqual(JSON.parse(summer.uvAnimationCompositeFormula), {
    className: "static-binary-half-atlas-selector",
    selectorUniform: "unif48",
    selectorOffsetScale: [0, 0.5],
    defaultSelector: 0,
    atlasUvSource: "tmpvar_5",
    atlasSamplers: ["sampler51", "sampler65", "sampler122"],
  });
  assert.equal(summer.uvAnimationExecutionMode, "runtime");
  assert.equal(summer.unimplementedRoleNames, "");
});

test("material runtime manifest records character lit reflection probe formula diagnostics", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [
      { rel: "Characters/Catherine/Art/catherine_dragonmaster.glb", modelLabel: "catherine_dragonmaster", character: "Catherine" },
    ],
  });
  const catherine = rows.find(
    (row) => row.shadergraphRel === "Characters/Catherine/Art/catherine_dragonmaster.catherine_dragonmaster_mat.shadergraph",
  );
  assert.ok(catherine);

  const inputs = JSON.parse(catherine.nativeShaderInputs);
  const formula = inputs.characterLitFormula;
  assert.equal(formula.mode, "character-lit-reflection-probe");
  assert.equal(formula.canRenderNatively, false);
  assert.match(formula.formulaClass, /\brim-lookup\b/);
  assert.equal(formula.normalSampler, "sampler40");
  assert.equal(formula.baseColorSampler, "sampler54");
  assert.equal(formula.rimLookupSampler, "sampler60");
  assert.equal(formula.reflectionSampler, "sampler105");
  assert.deepEqual(formula.additionalSurfaceSamplers, ["sampler112"]);
  assert.deepEqual(formula.ambientTint, [0.305, 0.3, 0.375]);
  assert.deepEqual(formula.specularPowers, [6.949]);
  assert.equal(formula.omniLights.length, 2);
  assert.equal(formula.probeSampleUniforms.length, 6);
  assert.deepEqual(formula.missingEvidence, []);
});

test("native runtime uniform bindings use shadergraph record indices when non-light uniforms precede semantic rows", () => {
  const rows = buildMaterialRuntimePipelineRows({
    glbRoot: "extracted/hero_assets_glb_textured_pbr",
    shadergraphRoot: "extracted/hero_assets/shadergraphs",
    materialTextureRoot: "extracted/hero_assets_material_textures_preview",
    manifestItems: [{ rel: "Characters/Hero000/Art/hero000.glb", modelLabel: "hero000", character: "Hero000" }],
  });
  const color = rows.find((row) => row.shadergraphRel === "Characters/Hero000/Art/hero000.color.shadergraph");
  assert.ok(color);

  const bindings = JSON.parse(color.nativeUniformBindings);
  assert.deepEqual(
    bindings.slice(0, 3).map((binding) => [binding.uniform, binding.semantic, binding.arrayIndex]),
    [
      ["unif36", "OmniLight.Position", 0],
      ["unif37", "OmniLight.Color", 0],
      ["unif38", "OmniLight.Attenuation", 0],
    ],
  );

  const solidLit = JSON.parse(color.nativeShaderInputs).solidLitRuntimeLights;
  assert.equal(solidLit.formulaClass, "solid-lit-runtime-lights+probe-diffuse+omni-diffuse+pow-specular");
  assert.deepEqual(solidLit.omniLights[0], {
    arrayIndex: 0,
    positionUniform: "unif36",
    colorUniform: "unif37",
    attenuationUniform: "unif38",
  });
});

test("material runtime pipeline status reports unimplemented rows without explicit diagnostics", () => {
  const { unimplementedRows } = require("../tools/material_runtime_pipeline_status");
  const rows = unimplementedRows({
    items: [
      { shadergraphStatus: "ok", unimplementedRoleNames: "reflection", uvAnimationGapReason: "" },
      { shadergraphStatus: "ok", unimplementedRoleNames: "uvAnimation", uvAnimationGapReason: "sampled-distortion" },
      { shadergraphStatus: "ok", unimplementedRoleNames: "uvAnimation", uvAnimationRuntimeBlockers: "missing-sampler-texture-paths" },
      { shadergraphStatus: "missing", unimplementedRoleNames: "uniformColor", uvAnimationGapReason: "" },
      { shadergraphStatus: "ok", unimplementedRoleNames: "", uvAnimationGapReason: "" },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unimplementedRoleNames, "reflection");
});

test("Fortress pack materials recover the native animated-noise composite", () => {
  const rels = [
    "Characters/Hero015/Art/hero015_hell_t3_packAlly.glb",
    "Characters/Hero015/Art/hero015_hell_t3_packEnemy.glb",
  ];
  const rows = buildMaterialRuntimePipelineRows({
    manifestItems: rels.map((rel) => ({
      rel,
      modelLabel: "Fortress_Skin_Hell_T3",
      character: "Hero015",
      sourceRelativePath: "Characters/Hero015/FortressMinion.def",
    })),
    glbRoot: path.resolve("extracted/hero_assets_glb_textured_pbr"),
  });

  assert.equal(rows.length, 2);
  const ramps = [];
  for (const row of rows) {
    const side = row.rel.includes("packAlly") ? "packAlly" : "packEnemy";
    const viewDotRamp = JSON.parse(row.viewDotRamp);
    ramps.push(viewDotRamp.rampHash);
    assert.deepEqual(viewDotRamp.animatedNoiseComposite, {
      mode: "base-plus-base-times-animated-noise",
      sampler: "sampler82",
      texturePath: `../hero_assets_material_textures_preview/Characters/Hero015/Art/hero015_hell_t3_${side}.hell_t3_${side}_mat.sampler-sampler82.png`,
      channel: "x",
      uvRepeat: [2, 2],
      xTerms: [{ kind: "fract", speed: 0.1, offset: 0 }],
      yTerms: [{ kind: "fract", speed: -0.75, offset: 0 }],
      scale: side === "packAlly" ? 5 : 8,
    });
  }
  assert.notEqual(ramps[0], ramps[1]);
});
