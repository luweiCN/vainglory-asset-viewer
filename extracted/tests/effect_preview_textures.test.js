const assert = require("node:assert/strict");
const test = require("node:test");

const {
  embeddedWebpPayload,
  effectTextureHashForItem,
  effectPreviewTextureRows,
  effectPreviewAlphaFromRgba,
  effectPreviewMaskPixelsFromBgra,
  effectPreviewMaskPixelsFromRgba,
  previewTextureRuntimeMetadata,
  previewTexturePathForShadergraph,
  sampledDistortionTextureRows,
  texturePngBufferFromBgra,
  texturePathForHashPreview,
} = require("../tools/effect_preview_textures");

test("effectTextureHashForItem prefers baseColor over fallback texture hashes", () => {
  assert.equal(
    effectTextureHashForItem({
      roles: { baseColor: { hash: "BASE_COLOR_HASH" } },
      textureHashes: ["FALLBACK_HASH"],
    }),
    "BASE_COLOR_HASH",
  );
  assert.equal(effectTextureHashForItem({ textureHashes: ["FALLBACK_HASH"] }), "FALLBACK_HASH");
  assert.equal(effectTextureHashForItem({ textureHashes: [] }), "");
});

test("effectPreviewTextureRows keeps pfx-linked effect surfaces by default", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
        roles: { baseColor: { hash: "BASE_COLOR_HASH" } },
        textureHashes: ["FALLBACK_HASH"],
        pfxPaths: ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"],
        hookEffectTokens: ["Effect_Lance_A_Weapon"],
      },
      {
        relativePath: "Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].shadergraph",
        textureHashes: ["IMPACT_HASH"],
        pfxPaths: ["Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.pfx"],
        hookEffectTokens: [],
      },
      {
        relativePath: "Effects/Hero028/Unused/Unused.Surface[1].shadergraph",
        textureHashes: ["UNUSED_HASH"],
        pfxPaths: [],
        hookEffectTokens: [],
      },
    ],
  };

  const rows = effectPreviewTextureRows(manifest, { outputRoot: "out" });

  assert.deepEqual(rows, [
    {
      relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
      hash: "BASE_COLOR_HASH",
      outputPath: "out/Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].png",
    },
    {
      relativePath: "Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].shadergraph",
      hash: "IMPACT_HASH",
      outputPath: "out/Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].png",
    },
  ]);
});

test("effectPreviewTextureRows can still restrict output to native hook-linked surfaces", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
        roles: { baseColor: { hash: "BASE_COLOR_HASH" } },
        pfxPaths: ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"],
        hookEffectTokens: ["Effect_Lance_A_Weapon"],
      },
      {
        relativePath: "Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].shadergraph",
        textureHashes: ["IMPACT_HASH"],
        pfxPaths: ["Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.pfx"],
        hookEffectTokens: [],
      },
    ],
  };

  const rows = effectPreviewTextureRows(manifest, { outputRoot: "out", onlyHookLinked: true });

  assert.deepEqual(rows.map((row) => row.relativePath), [
    "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
  ]);
});

test("effectPreviewTextureRows can include unhooked effect surfaces for batch recovery", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].shadergraph",
        textureHashes: ["IMPACT_HASH"],
        hookEffectTokens: [],
      },
    ],
  };

  const rows = effectPreviewTextureRows(manifest, { outputRoot: "out", onlyPfxLinked: false });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].hash, "IMPACT_HASH");
});

test("previewTexturePathForShadergraph mirrors the shadergraph tree as PNG files", () => {
  assert.equal(
    previewTexturePathForShadergraph(
      "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
      "out",
    ),
    "out/Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].png",
  );
  assert.equal(
    previewTexturePathForShadergraph(
      "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph",
      "out",
      ".webp",
    ),
    "out/Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].webp",
  );
});

test("previewTextureRuntimeMetadata keeps embedded WebP alpha masks usable through alphaMap", () => {
  assert.deepEqual(
    previewTextureRuntimeMetadata(
      {
        previewTextureMode: "embedded-webp",
        previewTextureSpriteUsable: false,
        previewTextureRejectReason: "embedded-webp",
      },
      ["alphaBlend", "alphaMask", "baseColor"],
    ),
    {
      previewTextureMode: "embedded-webp",
      previewTextureRequiresAlphaMap: true,
      previewTextureSpriteUsable: true,
      previewTextureRejectReason: "",
    },
  );
});

test("sampledDistortionTextureRows exports unique distortion sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Turret/A.Surface[1].shadergraph",
        samplerToHash: { sampler35: "NOISE_HASH", sampler61: "BASE_HASH" },
        previewUvAnimation: { mode: "sampledDistort", distortionSampler: "sampler35" },
      },
      {
        relativePath: "Effects/Turret/B.Surface[2].shadergraph",
        samplerToHash: { sampler35: "NOISE_HASH", sampler61: "OTHER_BASE_HASH" },
        previewUvAnimation: { mode: "sampledDistort", distortionSampler: "sampler35" },
      },
      {
        relativePath: "Effects/Turret/C.Surface[3].shadergraph",
        samplerToHash: { sampler35: "STATIC_HASH" },
        previewUvAnimation: { mode: "scroll" },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "NOISE_HASH",
      outputPath: "out/hash_textures/NO/NOISE_HASH.png",
      relativePaths: [
        "Effects/Turret/A.Surface[1].shadergraph",
        "Effects/Turret/B.Surface[2].shadergraph",
      ],
    },
  ]);
});

test("sampledDistortionTextureRows exports amplitude mask sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.Surface[60].shadergraph",
        samplerToHash: {
          sampler41: "DISTORTION_HASH",
          sampler67: "MASK_HASH",
          sampler71: "BASE_HASH",
        },
        previewUvAnimation: {
          mode: "sampledDistort",
          distortionSampler: "sampler41",
          amplitudeMaskSampler: "sampler67",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "DISTORTION_HASH",
      outputPath: "out/hash_textures/DI/DISTORTION_HASH.png",
      relativePaths: ["Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.Surface[60].shadergraph"],
    },
    {
      hash: "MASK_HASH",
      outputPath: "out/hash_textures/MA/MASK_HASH.png",
      relativePaths: ["Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.Surface[60].shadergraph"],
    },
  ]);
});

test("sampledDistortionTextureRows exports sampled rotate sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero036/Hero036_A_AOE_A/Hero036_A_AOE_A.Surface[22].shadergraph",
        samplerToHash: {
          sampler37: "ROTATION_HASH",
          sampler56: "BASE_HASH",
        },
        previewUvAnimation: {
          mode: "sampledRotate",
          rotationSampler: "sampler37",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "ROTATION_HASH",
      outputPath: "out/hash_textures/RO/ROTATION_HASH.png",
      relativePaths: ["Effects/Hero036/Hero036_A_AOE_A/Hero036_A_AOE_A.Surface[22].shadergraph"],
    },
  ]);
});

test("sampledDistortionTextureRows exports sampled warp sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero014/Celeste_Star_Sm.assetbundle/Celeste_Star_Sm.Surface[82].shadergraph",
        samplerToHash: {
          sampler53: "DISTORTION_HASH",
          sampler149: "WARP_HASH",
        },
        previewUvAnimation: {
          mode: "sampledWarp",
          baseSampler: "sampler149",
          distortionSampler: "sampler53",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "DISTORTION_HASH",
      outputPath: "out/hash_textures/DI/DISTORTION_HASH.png",
      relativePaths: ["Effects/Hero014/Celeste_Star_Sm.assetbundle/Celeste_Star_Sm.Surface[82].shadergraph"],
    },
    {
      hash: "WARP_HASH",
      outputPath: "out/hash_textures/WA/WARP_HASH.png",
      relativePaths: ["Effects/Hero014/Celeste_Star_Sm.assetbundle/Celeste_Star_Sm.Surface[82].shadergraph"],
    },
  ]);
});

test("sampledDistortionTextureRows exports sampled offset-field sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero025/OCLT/Hero025_OCLT_Portal_Link_A/Hero025_OCLT_Portal_Link_A.Surface[55].shadergraph",
        samplerToHash: {
          sampler63: "DISTORTION_HASH",
          sampler78: "FIELD_BASE_HASH",
        },
        previewUvAnimation: {
          mode: "sampledOffsetField",
          baseSampler: "sampler78",
          distortionSampler: "sampler63",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "DISTORTION_HASH",
      outputPath: "out/hash_textures/DI/DISTORTION_HASH.png",
      relativePaths: ["Effects/Hero025/OCLT/Hero025_OCLT_Portal_Link_A/Hero025_OCLT_Portal_Link_A.Surface[55].shadergraph"],
    },
    {
      hash: "FIELD_BASE_HASH",
      outputPath: "out/hash_textures/FI/FIELD_BASE_HASH.png",
      relativePaths: ["Effects/Hero025/OCLT/Hero025_OCLT_Portal_Link_A/Hero025_OCLT_Portal_Link_A.Surface[55].shadergraph"],
    },
  ]);
});

test("sampledDistortionTextureRows exports sampled center-scale distortion sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph",
        samplerToHash: {
          sampler71: "DISTORTION_HASH",
          sampler86: "MASK_HASH",
          sampler113: "BASE_HASH",
        },
        previewUvAnimation: {
          mode: "sampledCenterScaleDistort",
          baseSampler: "sampler113",
          distortionSampler: "sampler71",
          amplitudeMaskSampler: "sampler86",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "BASE_HASH",
      outputPath: "out/hash_textures/BA/BASE_HASH.png",
      relativePaths: ["Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph"],
    },
    {
      hash: "DISTORTION_HASH",
      outputPath: "out/hash_textures/DI/DISTORTION_HASH.png",
      relativePaths: ["Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph"],
    },
    {
      hash: "MASK_HASH",
      outputPath: "out/hash_textures/MA/MASK_HASH.png",
      relativePaths: ["Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph"],
    },
  ]);
});

test("sampledDistortionTextureRows exports sampled scale-rotate sampler hashes", () => {
  const manifest = {
    items: [
      {
        relativePath: "Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph",
        samplerToHash: {
          sampler51: "SCALE_HASH",
          sampler82: "MASK_HASH",
          sampler116: "BASE_HASH",
        },
        previewUvAnimation: {
          mode: "sampledScaleRotate",
          baseSampler: "sampler116",
          scaleSampler: "sampler51",
          scaleMaskSampler: "sampler82",
        },
      },
    ],
  };

  assert.deepEqual(sampledDistortionTextureRows(manifest, { outputRoot: "out/hash_textures" }), [
    {
      hash: "BASE_HASH",
      outputPath: "out/hash_textures/BA/BASE_HASH.png",
      relativePaths: ["Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph"],
    },
    {
      hash: "MASK_HASH",
      outputPath: "out/hash_textures/MA/MASK_HASH.png",
      relativePaths: ["Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph"],
    },
    {
      hash: "SCALE_HASH",
      outputPath: "out/hash_textures/SC/SCALE_HASH.png",
      relativePaths: ["Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph"],
    },
  ]);
});

test("texturePngBufferFromBgra preserves decoded texture colors for shader sampling", () => {
  const { PNG } = require("pngjs");
  const bgra = Uint8Array.from([
    10, 20, 30, 128,
    80, 90, 100, 255,
  ]);

  const png = PNG.sync.read(texturePngBufferFromBgra(bgra, 2, 1, PNG));

  assert.deepEqual([...png.data.slice(0, 4)], [30, 20, 10, 128]);
  assert.deepEqual([...png.data.slice(4, 8)], [100, 90, 80, 255]);
});

test("texturePathForHashPreview mirrors the raw data hash tree", () => {
  assert.equal(
    texturePathForHashPreview("14D9565D2301499C828424C86BC793D3", "out/hash_textures"),
    "out/hash_textures/14/14D9565D2301499C828424C86BC793D3.png",
  );
});

test("effectPreviewMaskPixelsFromBgra converts raw effect colors into a white alpha mask", () => {
  const bgra = Uint8Array.from([
    10, 20, 220, 255,
    0, 0, 0, 255,
  ]);

  const rgba = effectPreviewMaskPixelsFromBgra(bgra, 2, 1);

  assert.deepEqual([...rgba.slice(0, 4)], [255, 255, 255, effectPreviewAlphaFromRgba(220, 20, 10, 255)]);
  assert.deepEqual([...rgba.slice(4, 8)], [255, 255, 255, 0]);
  assert.ok(rgba[3] > 0);
  assert.ok(rgba[3] < 255);
});

test("effectPreviewAlphaFromRgba preserves real source alpha when the decoded texture already has transparency", () => {
  assert.equal(effectPreviewAlphaFromRgba(255, 255, 255, 80), 80);
});

test("embeddedWebpPayload finds RIFF WebP data after the game texture prefix", () => {
  const webp = Buffer.concat([
    Buffer.from("RIF", "latin1"),
    Buffer.from("F", "latin1"),
    Buffer.from([8, 0, 0, 0]),
    Buffer.from("WEBPVP8L", "latin1"),
  ]);
  const buffer = Buffer.concat([Buffer.alloc(28), Buffer.from([webp.length, 0, 0, 0]), webp, Buffer.from("tail")]);

  assert.deepEqual([...embeddedWebpPayload(buffer)], [...webp]);
});

test("effectPreviewMaskPixelsFromRgba converts raw RGBA mip pixels into a white alpha mask", () => {
  const rgbaSource = Uint8Array.from([
    220, 20, 10, 255,
    0, 0, 0, 80,
  ]);

  const rgba = effectPreviewMaskPixelsFromRgba(rgbaSource, 2, 1);

  assert.deepEqual([...rgba.slice(0, 4)], [255, 255, 255, effectPreviewAlphaFromRgba(220, 20, 10, 255)]);
  assert.deepEqual([...rgba.slice(4, 8)], [255, 255, 255, 80]);
});
