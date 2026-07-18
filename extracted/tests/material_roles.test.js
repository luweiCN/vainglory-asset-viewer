const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeShadergraph,
  extractNativeTch0SamplerBindings,
  extractNullTerminatedHashes,
  isLikelyEmissiveShadergraph,
  reflectionModeForSampler,
} = require("../tools/material_roles");

const {
  batchConvertResourceMeshes,
  batchConvertSkinnedMeshes,
  convertMeshFile,
  createGlb,
  loadTextureMap,
  parseObj,
} = require("../tools/obj_to_glb");

const ringoShadergraph = "extracted/hero_assets/shadergraphs/Characters/Ringo/Art/ringo.ringo_mat.shadergraph";
const sawShadergraph = "extracted/hero_assets/shadergraphs/Characters/SAW/Art/saw.saw_mat.shadergraph";
const cyberKrulShadergraph =
  "extracted/hero_assets/shadergraphs/Characters/Hero009/Art/hero009_cyber.cyber_mat.shadergraph";

function readGlbJson(glb) {
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  const jsonLength = glb.readUInt32LE(12);
  const jsonType = glb.readUInt32LE(16);
  assert.equal(jsonType, 0x4e4f534a);
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").trim());
}

test("extractNullTerminatedHashes ignores binary bytes before hash strings", () => {
  const buffer = fs.readFileSync(ringoShadergraph);
  const hashes = extractNullTerminatedHashes(buffer);

  assert.ok(hashes.includes("2134CDB4C5D4FDF2AC62578863CE3D9E"));
  assert.ok(!hashes.includes("E2134CDB4C5D4FDF2AC62578863CE3D9"));
});

test("analyzeShadergraph maps Vainglory samplers to material roles", () => {
  const analysis = analyzeShadergraph(ringoShadergraph);

  assert.equal(analysis.samplerToHash.sampler40, "480B391058745E3EBAC5CEE198715E5D");
  assert.equal(analysis.samplerToHash.sampler54, "C24D2438D927F44850C53C800FDC92A7");
  assert.equal(analysis.roles.normal.hash, "480B391058745E3EBAC5CEE198715E5D");
  assert.equal(analysis.roles.baseColor.hash, "C24D2438D927F44850C53C800FDC92A7");
  assert.equal(analysis.roles.reflection.hash, "81EFD52FC228DAC5573A760F70644E3E");
  assert.equal(analysis.roles.uvAnimation, undefined);
});

test("reflectionModeForSampler classifies screen-space and lookup reflection samplers", () => {
  assert.equal(
    reflectionModeForSampler("void main(){ vec4 c = texture2D (sampler10, ((tmpvar_2.xy * 0.5) + 0.5)); }", "sampler10"),
    "screen-space-2d",
  );
  assert.equal(reflectionModeForSampler("void main(){}", "sampler88"), "lookup-2d");
  assert.equal(reflectionModeForSampler("void main(){}", "sampler12"), "");
});

test("analyzeShadergraph does not classify reflection-vector lookup as uvAnimation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-reflection-uv-"));
  const shaderPath = path.join(tempDir, "ReflectionLookup.shadergraph");
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "\0",
        "sampler12",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler12;",
        "varying vec4 var0;",
        "void main () {",
        "  vec3 tmpvar_1;",
        "  tmpvar_1 = normalize(var0.xyz);",
        "  vec3 tmpvar_2;",
        "  tmpvar_2.xy = tmpvar_1.xy;",
        "  tmpvar_2.z = (tmpvar_1.z + 1.0);",
        "  gl_FragColor = texture2D (sampler12, ((tmpvar_1.xy * (inversesqrt(dot (tmpvar_2, tmpvar_2)) * 0.5)) + vec2(0.5, 0.5)));",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const analysis = analyzeShadergraph(shaderPath);

  assert.equal(analysis.roles.uvAnimation, undefined);
});

test("analyzeShadergraph prefers lit diffuse sampler over dark modulation masks", () => {
  const analysis = analyzeShadergraph(sawShadergraph);

  assert.equal(analysis.samplerToHash.sampler50, "C782FB1B09A178EE6686D50121B62D21");
  assert.equal(analysis.samplerToHash.sampler59, "222BAFED92B3439A8E2C394345D7BBF2");
  assert.equal(analysis.roles.baseColor.sampler, "sampler59");
  assert.equal(analysis.roles.baseColor.hash, "222BAFED92B3439A8E2C394345D7BBF2");
}
);

test("analyzeShadergraph separates Cyber Krul's nonuniform normal decode from its albedo", () => {
  const analysis = analyzeShadergraph(cyberKrulShadergraph);

  assert.equal(analysis.roles.normal.sampler, "sampler42");
  assert.equal(analysis.roles.baseColor.sampler, "sampler59");
  assert.equal(analysis.roles.uvAnimation.sampler, "sampler96");
});

test("analyzeShadergraph uses native TCH0 units for duplicate texture hashes and inline samplers", () => {
  const shaderPath = "extracted/hero_assets/shadergraphs/Characters/Hero028/Art/hero028_poseidon.hero028_waterOpaque_mat.shadergraph";
  const buffer = fs.readFileSync(shaderPath);
  const nativeBindings = extractNativeTch0SamplerBindings(buffer);
  const analysis = analyzeShadergraph(shaderPath);

  assert.equal(nativeBindings.counts.texture, 4);
  assert.equal(nativeBindings.counts.inlineTexture, 1);
  assert.equal(analysis.samplerToHash.sampler98, "AEA1CE7AEDE65253F118EBAE4CEC5B52");
  assert.equal(analysis.samplerToHash.sampler116, "AEA1CE7AEDE65253F118EBAE4CEC5B52");
  assert.equal(analysis.samplerToHash.sampler168, "D51E9447AFCD28D7C78AF01D1D64164A");
  assert.equal(analysis.samplerToHash.sampler209, "EB91B7DC24C5D5DF3D1AF5F523FD0E26");
  assert.equal(analysis.samplerToHash.sampler37, undefined);
  assert.deepEqual(nativeBindings.inlineTextureRecords, [
    {
      index: 0,
      offset: 324,
      unit: 4,
      flags0: 0,
      flags1: 1,
      sampler: "sampler37",
    },
  ]);
});

test("analyzeShadergraph recognizes atlas uv effect textures as base color alpha masks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-atlas-"));
  const shaderPath = path.join(tempDir, "Turret_Death_Explosion.Surface[124].shadergraph");
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "7B62C4F8F188266FFB4422BE3120C4B5",
        "\0",
        "sampler36",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void main () {",
        "  vec2 tmpvar_1;",
        "  tmpvar_1.x = (floor((var0.x * 16.0)) * 0.25);",
        "  tmpvar_1.y = (floor((var0.x * 4.0)) * 0.25);",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler36, ((var1.xy * vec2(0.25, 0.25)) + tmpvar_1));",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3.xyz = mix ((vec3(0.45, 0.35, 0.15) * tmpvar_2.yyy), vec3(0.9, 0.75, 0.35), var0.w);",
        "  tmpvar_3.w = tmpvar_2.z;",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const analysis = analyzeShadergraph(shaderPath);

  assert.equal(analysis.roles.baseColor.sampler, "sampler36");
  assert.equal(analysis.roles.baseColor.hash, "7B62C4F8F188266FFB4422BE3120C4B5");
  assert.equal(analysis.roles.alphaMask.sampler, "sampler36");
  assert.equal(analysis.roles.uvAnimation.sampler, "sampler36");
  assert.equal(analysis.roles.alphaBlend.role, "alphaBlend");
});

test("isLikelyEmissiveShadergraph only flags explicit glow-like material names", () => {
  assert.equal(isLikelyEmissiveShadergraph(ringoShadergraph), false);
  assert.equal(
    isLikelyEmissiveShadergraph(
      "extracted/hero_assets/shadergraphs/Characters/Hero025/ArtWall/hero025_wall.glow_ally_mat.shadergraph",
    ),
    true,
  );
});

test("createGlb writes normal and metallic-roughness textures when material roles provide them", () => {
  const obj = [
    "o sample",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "vt 0 0",
    "vt 1 0",
    "vt 0 1",
    "vn 0 0 1",
    "usemtl sample_mat",
    "f 1/1/1 2/2/1 3/3/1",
    "",
  ].join("\n");
  const mesh = parseObj(obj);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lNm2DwAAAABJRU5ErkJggg==",
    "base64",
  );
  const materialImages = new Map([
    [
      "sample_mat",
      {
        baseColor: png,
        normal: png,
        metallicRoughness: png,
      },
    ],
  ]);

  const json = readGlbJson(createGlb(mesh, { materialImages }));
  const material = json.materials[0];

  assert.ok(material.pbrMetallicRoughness.baseColorTexture);
  assert.ok(material.normalTexture);
  assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
  assert.equal(json.images.length, 3);
});

test("createGlb writes emissive texture, alpha blend, and emissive strength for glow materials", () => {
  const obj = [
    "o glow_sample",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "vt 0 0",
    "vt 1 0",
    "vt 0 1",
    "vn 0 0 1",
    "usemtl glow_mat",
    "f 1/1/1 2/2/1 3/3/1",
    "",
  ].join("\n");
  const mesh = parseObj(obj);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lNm2DwAAAABJRU5ErkJggg==",
    "base64",
  );
  const materialImages = new Map([
    [
      "glow_mat",
      {
        baseColor: png,
        emissive: png,
        alphaMode: "BLEND",
        emissiveStrength: 2.2,
      },
    ],
  ]);

  const json = readGlbJson(createGlb(mesh, { materialImages }));
  const material = json.materials[0];

  assert.ok(material.emissiveTexture);
  assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
  assert.equal(material.alphaMode, "BLEND");
  assert.equal(material.extensions.KHR_materials_emissive_strength.emissiveStrength, 2.2);
  assert.ok(json.extensionsUsed.includes("KHR_materials_emissive_strength"));
});

test("createGlb writes vertex colors only for color-driven effect materials", () => {
  const obj = [
    "o color_sample",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "v 2 0 0",
    "v 2 1 0",
    "v 3 0 0",
    "vn 0 0 1",
    "usemtl body_mat",
    "f 1//1 2//1 3//1",
    "usemtl /Characters/Koshka/Art/koshka.swipe_mat.shadergraph",
    "f 4//1 5//1 6//1",
    "",
  ].join("\n");
  const mesh = parseObj(obj);
  mesh.colors = new Float32Array([
    0, 0, 0, 1,
    0, 0, 0, 1,
    0, 0, 0, 1,
    1, 0, 0, 0,
    1, 0.4, 0.2, 1,
    0, 0, 0, 0,
  ]);

  const json = readGlbJson(createGlb(mesh));
  const [bodyPrimitive, swipePrimitive] = json.meshes[0].primitives;
  const swipeMaterial = json.materials[swipePrimitive.material];

  assert.equal(bodyPrimitive.attributes.COLOR_0, undefined);
  assert.ok(Number.isInteger(swipePrimitive.attributes.COLOR_0));
  assert.equal(json.accessors[swipePrimitive.attributes.COLOR_0].type, "VEC4");
  assert.equal(swipeMaterial.alphaMode, "BLEND");
  assert.deepEqual(swipeMaterial.pbrMetallicRoughness.baseColorFactor, [1, 1, 1, 1]);
});

test("createGlb uses narrow fallback colors for untextured effect materials", () => {
  const obj = [
    "o fallback_effect",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "vn 0 0 1",
    "usemtl /Characters/Hero014/Art/celeste_snow_shard.crystalShine_mat.shadergraph",
    "f 1//1 2//1 3//1",
    "",
  ].join("\n");

  const json = readGlbJson(createGlb(parseObj(obj)));
  const material = json.materials[0];

  assert.notDeepEqual(material.pbrMetallicRoughness.baseColorFactor, [0.78, 0.74, 0.62, 1]);
  assert.equal(material.alphaMode, "BLEND");
  assert.deepEqual(json.images || [], []);
});

test("createGlb writes skinned mesh attributes and skeleton nodes", () => {
  const obj = [
    "o skinned_sample",
    "v 0 0 0",
    "v 1 0 0",
    "v 0 1 0",
    "vn 0 0 1",
    "usemtl body",
    "f 1//1 2//1 3//1",
    "",
  ].join("\n");
  const mesh = parseObj(obj);
  mesh.joints = new Uint8Array([
    0, 1, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ]);
  mesh.weights = new Float32Array([
    0.75, 0.25, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ]);

  const json = readGlbJson(
    createGlb(mesh, {
      skin: {
        name: "sample_skeleton",
        bones: [
          {
            index: 0,
            parent: -1,
            hash: "ROOT",
            rotation: [0, 0, 0, 1],
            translation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          {
            index: 1,
            parent: 0,
            hash: "CHILD",
            rotation: [0, 0, 0, 1],
            translation: [0, 1, 0],
            scale: [1, 1, 1],
          },
        ],
      },
    }),
  );

  const attributes = json.meshes[0].primitives[0].attributes;
  assert.ok(Number.isInteger(attributes.JOINTS_0));
  assert.ok(Number.isInteger(attributes.WEIGHTS_0));
  assert.equal(json.accessors[attributes.JOINTS_0].type, "VEC4");
  assert.equal(json.accessors[attributes.JOINTS_0].componentType, 5121);
  assert.equal(json.accessors[attributes.WEIGHTS_0].type, "VEC4");
  assert.equal(json.accessors[attributes.WEIGHTS_0].componentType, 5126);
  assert.equal(json.skins.length, 1);
  assert.equal(json.skins[0].name, "sample_skeleton");
  assert.equal(json.skins[0].joints.length, 2);
  assert.equal(json.accessors[json.skins[0].inverseBindMatrices].type, "MAT4");
  assert.equal(json.accessors[json.skins[0].inverseBindMatrices].count, 2);
  assert.equal(json.nodes[1].skin, 0);
  assert.equal(json.nodes[1].mesh, 0);
});

test("convertMeshFile writes a skinned GLB from original mesh and skeleton files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-glb-"));
  const output = path.join(tempDir, "ringo.glb");

  convertMeshFile("extracted/hero_assets/meshes/Characters/Ringo/Art/ringo.mesh", output, {
    skeletonPath: "extracted/hero_assets/skeletons/Characters/Ringo/Art/ringo.skeleton",
  });

  const json = readGlbJson(fs.readFileSync(output));
  const attributes = json.meshes[0].primitives[0].attributes;
  assert.ok(Number.isInteger(attributes.JOINTS_0));
  assert.ok(Number.isInteger(attributes.WEIGHTS_0));
  assert.equal(json.skins[0].joints.length, 76);
  assert.equal(json.accessors[attributes.JOINTS_0].count, 3250);
  assert.equal(json.accessors[attributes.WEIGHTS_0].count, 3250);
});

test("batchConvertSkinnedMeshes writes skinned GLBs and a viewer manifest", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-batch-"));
  const sourceManifestPath = path.join(tempDir, "source-manifest.json");
  const outputRoot = path.join(tempDir, "glb");
  const manifestPath = path.join(tempDir, "viewer-manifest.json");
  fs.writeFileSync(
    sourceManifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Ringo/Art/ringo.glb",
          character: "Ringo",
          variant: "Ringo_DefaultSkin",
          meshPath: "Characters/Ringo/Art/ringo.mesh",
          skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
          relationshipMatched: true,
        },
      ],
    }),
  );

  const result = batchConvertSkinnedMeshes({
    sourceManifestPath,
    meshRoot: "extracted/hero_assets/meshes",
    skeletonRoot: "extracted/hero_assets/skeletons",
    outputRoot,
    manifestPath,
  });

  assert.equal(result.converted, 1);
  assert.equal(result.failed, 0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.count, 1);
  assert.equal(manifest.uniqueFileCount, 1);
  assert.equal(manifest.items[0].skinned, true);
  assert.equal(manifest.items[0].rel, "Characters/Ringo/Art/ringo.glb");
  const glbJson = readGlbJson(fs.readFileSync(path.join(outputRoot, "Characters/Ringo/Art/ringo.glb")));
  assert.equal(glbJson.skins[0].joints.length, 76);
});

test("batchConvertSkinnedMeshes drops name-only goodie attachments from the viewer manifest", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-attachments-"));
  const sourceManifestPath = path.join(tempDir, "source-manifest.json");
  const outputRoot = path.join(tempDir, "glb");
  const manifestPath = path.join(tempDir, "viewer-manifest.json");
  fs.writeFileSync(
    sourceManifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Ringo/Art/ringo.glb",
          character: "Ringo",
          variant: "Ringo_DefaultSkin",
          meshPath: "Characters/Ringo/Art/ringo.mesh",
          skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
          relationshipMatched: true,
          attachments: [
            {
              rel: "Characters/Attachments/Goodies/Gun_Ringo/Art/gun_ringo.glb",
              label: "gun_ringo",
              source: "goodie-name",
              assetRoot: "pbr",
            },
            {
              rel: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.glb",
              label: "wizard2018",
              source: "attachment-animation",
              assetRoot: "skinned",
              animationPath: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.Ringo_DefaultSkin.anim",
            },
          ],
        },
      ],
    }),
  );

  batchConvertSkinnedMeshes({
    sourceManifestPath,
    meshRoot: "extracted/hero_assets/meshes",
    skeletonRoot: "extracted/hero_assets/skeletons",
    outputRoot,
    manifestPath,
  });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.items[0].attachments, [
    {
      rel: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.glb",
      label: "wizard2018",
      source: "attachment-animation",
      assetRoot: "skinned",
      animationPath: "Characters/Attachments/Hats/Wizard2018/Art/wizard2018.Ringo_DefaultSkin.anim",
    },
  ]);
});

test("batchConvertSkinnedMeshes can read skeletons from a fallback resource root", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-fallback-"));
  const sourceManifestPath = path.join(tempDir, "source-manifest.json");
  const outputRoot = path.join(tempDir, "glb");
  const manifestPath = path.join(tempDir, "viewer-manifest.json");
  fs.writeFileSync(
    sourceManifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Ringo/Art/ringo.glb",
          character: "Ringo",
          variant: "Ringo_DefaultSkin",
          meshPath: "Characters/Ringo/Art/ringo.mesh",
          skeletons: ["Characters/Ringo/Art/ringo.skeleton"],
          relationshipMatched: true,
        },
      ],
    }),
  );

  const result = batchConvertSkinnedMeshes({
    sourceManifestPath,
    meshRoot: "extracted/hero_assets/meshes",
    skeletonRoot: path.join(tempDir, "empty-skeletons"),
    skeletonFallbackRoot: "extracted/hero_assets/skeletons",
    outputRoot,
    manifestPath,
  });

  assert.equal(result.converted, 1);
  assert.equal(result.skipped, 0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.items[0].resolvedSkeletonSource, "fallback");
  assert.equal(manifest.items[0].resolvedSkeletonPath, "Characters/Ringo/Art/ringo.skeleton");
});

test("batchConvertSkinnedMeshes infers a same-directory skeleton when the manifest omits one", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-infer-"));
  const sourceManifestPath = path.join(tempDir, "source-manifest.json");
  const outputRoot = path.join(tempDir, "glb");
  const manifestPath = path.join(tempDir, "viewer-manifest.json");
  fs.writeFileSync(
    sourceManifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Ringo/Art/ringo.glb",
          character: "Ringo",
          variant: "Ringo_DefaultSkin",
          meshPath: "Characters/Ringo/Art/ringo.mesh",
          skeletons: [],
          relationshipMatched: true,
        },
      ],
    }),
  );

  const result = batchConvertSkinnedMeshes({
    sourceManifestPath,
    meshRoot: "extracted/hero_assets/meshes",
    skeletonRoot: path.join(tempDir, "empty-skeletons"),
    skeletonFallbackRoot: "extracted/hero_assets/skeletons",
    outputRoot,
    manifestPath,
  });

  assert.equal(result.converted, 1);
  assert.equal(result.skipped, 0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.items[0].skeletons, ["Characters/Ringo/Art/ringo.skeleton"]);
  assert.equal(manifest.items[0].inferredSkeleton, true);
});

test("batchConvertSkinnedMeshes skips missing mesh or skeleton files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skinned-missing-"));
  const sourceManifestPath = path.join(tempDir, "source-manifest.json");
  fs.writeFileSync(
    sourceManifestPath,
    JSON.stringify({
      items: [
        {
          rel: "Characters/Missing/Art/missing.glb",
          character: "Missing",
          variant: "Missing_DefaultSkin",
          meshPath: "Characters/Missing/Art/missing.mesh",
          skeletons: ["Characters/Missing/Art/missing.skeleton"],
        },
      ],
    }),
  );

  const result = batchConvertSkinnedMeshes({
    sourceManifestPath,
    meshRoot: "extracted/hero_assets/meshes",
    skeletonRoot: "extracted/hero_assets/skeletons",
    outputRoot: path.join(tempDir, "glb"),
    manifestPath: path.join(tempDir, "viewer-manifest.json"),
  });

  assert.equal(result.converted, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 1);
});

test("batchConvertResourceMeshes writes static GLBs from build resource meshes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-resource-mesh-batch-"));
  const outputRoot = path.join(tempDir, "glb");
  const manifestPath = path.join(tempDir, "viewer-manifest.json");

  const result = batchConvertResourceMeshes({
    inputRoot: "extracted/build_resources_by_path",
    outputRoot,
    manifestPath,
    includeRelPaths: ["UI/Ring_Global/Ring_Global.mesh"],
  });

  assert.equal(result.converted, 1);
  assert.equal(result.failed, 0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.items[0].rel, "UI/Ring_Global/Ring_Global.glb");
  assert.equal(manifest.items[0].character, "UI");
  assert.equal(manifest.items[0].category, "UI");
  assert.equal(manifest.items[0].materialCount, 1);
  const glbJson = readGlbJson(fs.readFileSync(path.join(outputRoot, "UI/Ring_Global/Ring_Global.glb")));
  assert.equal(glbJson.meshes[0].primitives.length, 1);
});

test("loadTextureMap preserves material-level alpha and emissive settings", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-material-map-"));
  const mapPath = path.join(tempDir, "material_texture_roles.json");
  fs.writeFileSync(
    mapPath,
    JSON.stringify({
      items: [
        {
          key: "shadergraph_a",
          shadergraph: "/Characters/Test/test.glow_mat.shadergraph",
          textures: {
            baseColor: { texture: "base.png" },
            emissive: { texture: "base.png" },
          },
          alphaMode: "BLEND",
          emissiveStrength: 1.8,
        },
      ],
    }),
  );

  const map = loadTextureMap(mapPath);
  const value = map.get("/Characters/Test/test.glow_mat.shadergraph");

  assert.equal(value.alphaMode, "BLEND");
  assert.equal(value.emissiveStrength, 1.8);
  assert.equal(value.baseColor.texture, "base.png");
  assert.equal(value.emissive.texture, "base.png");
});
