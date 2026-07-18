const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { PNG } = require("pngjs");

const {
  buildEffectShadergraphMaterialManifest,
  effectPreviewTextureForShadergraph,
  readEffectShadergraphCandidates,
  reportRowsForManifest,
} = require("../tools/effect_shadergraph_material_manifest");

function writeShadergraph(filePath, hash = "0123456789ABCDEF0123456789ABCDEF") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        hash,
        "\0",
        "sampler15",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler15;",
        "varying vec4 var0;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler15, var0.xy);",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2.xyz = (vec3(0.1, 0.8, 1.0) + tmpvar_1.xyz);",
        "  tmpvar_2.w = tmpvar_1.w;",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeTintedEffectShadergraph(filePath, hash = "8417199989D2459313A8077C0976F0A9") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        hash,
        "\0",
        "sampler38",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler38;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void main () {",
        "  vec2 tmpvar_3;",
        "  tmpvar_3 = (var1.xy - vec2(0.5, 0.5));",
        "  lowp float tmpvar_5;",
        "  tmpvar_5 = (texture2D (sampler38, (tmpvar_3 + vec2(0.5, 0.5))).x * (var0.w * 2.5));",
        "  lowp vec4 tmpvar_6;",
        "  tmpvar_6.xyz = mix ((vec3(1.0, 0.15, 0.0) + vec3(tmpvar_5)), (vec3(2.0, 0.3, 0.0) * vec3(tmpvar_5)), var0.w);",
        "  tmpvar_6.w = (tmpvar_5 * var0.w);",
        "  gl_FragColor = tmpvar_6;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeHdrTintedEffectShadergraph(filePath, hash = "9B13BC0B5FF79FB3112852E7C45B5E36") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        hash,
        "\0",
        "sampler24",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler24;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler24, var1.xy);",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2.xyz = mix ((vec3(0.0, 1.4, 2.0) * tmpvar_1.zzz), (vec3(2.0, 1.4, 1.0) * tmpvar_1.zzz), var0.x);",
        "  tmpvar_2.w = (var0.w * tmpvar_1.z);",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeRotatedUvEffectShadergraph(filePath, hash = "E40B8AB6482B5328A8CA8EECA23B60A7") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    Buffer.from(
      [
        "RSC0\0",
        hash,
        "\0",
        "sampler49",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler49;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (var0.x * -1.5);",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(tmpvar_1);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(tmpvar_1);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var1.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  lowp vec4 tmpvar_6;",
        "  tmpvar_6 = texture2D (sampler49, (tmpvar_5 + vec2(0.5, 0.5)));",
        "  lowp float tmpvar_7;",
        "  tmpvar_7 = (((((tmpvar_6.x + (tmpvar_6.x * 0.5)) / var0.z) - 1.0) * 1.75) * var0.w);",
        "  lowp vec4 tmpvar_8;",
        "  tmpvar_8.xyz = mix ((vec3(0.1, 0.45, 0.5) + (vec3(0.1, 0.45, 0.5) * vec3(tmpvar_7))), (vec3(0.8, 0.9, 1.0) * vec3(tmpvar_7)), var0.w);",
        "  tmpvar_8.w = tmpvar_7;",
        "  gl_FragColor = tmpvar_8;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
}

function writeAlphaPng(filePath, alphaValues) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const size = Math.ceil(Math.sqrt(alphaValues.length));
  const png = new PNG({ width: size, height: size });
  for (let index = 0; index < size * size; index += 1) {
    const offset = index * 4;
    png.data[offset] = 255;
    png.data[offset + 1] = 255;
    png.data[offset + 2] = 255;
    png.data[offset + 3] = alphaValues[index] ?? 0;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

test("readEffectShadergraphCandidates keeps first row in headerless reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-candidates-"));
  const reportPath = path.join(tempDir, "ios_effect_shadergraph_candidates.tsv");
  fs.writeFileSync(
    reportPath,
    [
      "FOUND\tEffects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph\tHASH_A\t/path/a",
      "MISSING\tEffects/Missing/Missing.Surface[1].shadergraph\tHASH_B\t",
    ].join("\n") + "\n",
  );

  const rows = readEffectShadergraphCandidates(reportPath);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "FOUND");
  assert.equal(rows[0].relativePath, "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph");
  assert.equal(rows[0].hash, "HASH_A");
});

test("buildEffectShadergraphMaterialManifest joins surface materials to pfx and runtime hooks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-material-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    {
      shaderRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 6 }],
            hookTokens: ["Effect_Lance_A_Weapon"],
            hookEffectTokens: ["Effect_Lance_A_Weapon"],
            hookAbilityNames: ["Ability__Lance__A"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.summary.pfxLinkedRows, 1);
  assert.equal(manifest.summary.hookLinkedRows, 1);
  assert.equal(manifest.summary.baseColorRows, 1);
  assert.equal(manifest.summary.inlineColorRows, 1);
  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].textureHashes, ["0123456789ABCDEF0123456789ABCDEF"]);
  assert.deepEqual(manifest.items[0].inlineColors[0].rgba255, [26, 204, 255, 255]);
  assert.equal(manifest.items[0].inlineColors[0].hex, "#1ACCFF");
  assert.deepEqual(manifest.items[0].roles.baseColor, {
    role: "baseColor",
    sampler: "sampler15",
    hash: "0123456789ABCDEF0123456789ABCDEF",
  });
  assert.deepEqual(manifest.items[0].pfxPaths, ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"]);
  assert.deepEqual(manifest.items[0].hookEffectTokens, ["Effect_Lance_A_Weapon"]);
  assert.deepEqual(manifest.items[0].hookAbilityNames, ["Ability__Lance__A"]);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].materialStatus, "classified");
  assert.equal(rows[0].roleNames, "alphaBlend|alphaMask|baseColor");
  assert.equal(rows[0].pfxPaths, "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx");
});

test("buildEffectShadergraphMaterialManifest preserves HDR effect tint colors by hue-normalizing them", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-hdr-tint-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[83].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeHdrTintedEffectShadergraph(shaderPath);

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    {
      shaderRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 83 }],
            hookTokens: ["Effect_Adagio_Ult_Enemy"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.summary.inlineColorRows, 1);
  assert.deepEqual(
    manifest.items[0].inlineColors.map((color) => color.hex),
    ["#00B3FF", "#FFB380"],
  );
  assert.deepEqual(manifest.items[0].inlineColors[0].displayValues, [0, 0.7, 1, 1]);
  assert.deepEqual(manifest.items[0].inlineColors[1].displayValues, [1, 0.7, 0.5, 1]);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].inlineColors, "#00B3FF|#FFB380");
});

test("buildEffectShadergraphMaterialManifest attaches decoded effect preview texture paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-preview-texture-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  fs.mkdirSync(path.dirname(previewTexture), { recursive: true });
  fs.writeFileSync(previewTexture, "png");

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    { shaderRoot, effectPreviewTextureRoot },
    "2026-06-25T00:00:00.000Z",
  );

  const expectedTexture = previewTexture.split(path.sep).join("/");
  assert.equal(manifest.items[0].previewTexture, expectedTexture);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewTexture, expectedTexture);
});

test("effectPreviewTextureForShadergraph also finds embedded WebP preview textures", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-webp-preview-"));
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.Surface[6].shadergraph";
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".webp"));
  fs.mkdirSync(path.dirname(previewTexture), { recursive: true });
  fs.writeFileSync(previewTexture, "webp");

  assert.equal(effectPreviewTextureForShadergraph(shaderRel, effectPreviewTextureRoot), previewTexture.split(path.sep).join("/"));
});

test("buildEffectShadergraphMaterialManifest marks opaque preview textures unsafe for sprite cards", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-opaque-preview-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Koshka/S1/Koshka__S1__Buffed/Koshka__S1__Buffed.Surface[12].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  writeAlphaPng(previewTexture, Array.from({ length: 16 }, () => 255));

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    { shaderRoot, effectPreviewTextureRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].previewTextureSpriteUsable, false);
  assert.equal(manifest.items[0].previewTextureRejectReason, "opaque-preview-texture");
  assert.equal(manifest.items[0].previewTextureOpaqueCoverage, 1);
  assert.equal(manifest.summary.previewTextureRejectedRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewTextureSpriteUsable, "false");
  assert.equal(rows[0].previewTextureRejectReason, "opaque-preview-texture");
});

test("buildEffectShadergraphMaterialManifest marks embedded webp alpha-mask effects as alphaMap previews", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-webp-alpha-map-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/5V5/Turret/Turret_Death/Turret_Death.Surface[148].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".webp"));
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
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
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler36, ((var1.xy * vec2(0.25, 0.25)) + var0.xy));",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3.xyz = tmpvar_2.xyz;",
        "  tmpvar_3.w = tmpvar_2.z;",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );
  fs.mkdirSync(path.dirname(previewTexture), { recursive: true });
  fs.writeFileSync(previewTexture, "webp");

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot, effectPreviewTextureRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].previewTextureMode, "embedded-webp");
  assert.equal(manifest.items[0].previewTextureRequiresAlphaMap, true);
  assert.equal(manifest.items[0].previewTextureSpriteUsable, true);
  assert.equal(manifest.items[0].previewTextureRejectReason, "");
  assert.equal(manifest.summary.previewTextureAlphaMapRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewTextureRequiresAlphaMap, "true");
});

test("buildEffectShadergraphMaterialManifest derives alpha preview material hints from transparent texture masks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-alpha-preview-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero028/Hero028_A_Impact/Hero028_A_Impact.Surface[9].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  writeAlphaPng(previewTexture, [0, 128, 255, 0]);

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    { shaderRoot, effectPreviewTextureRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].previewBlendMode, "alpha");
  assert.equal(manifest.items[0].previewOpacity, 0.3755);
  assert.equal(manifest.summary.previewMaterialHintRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewBlendMode, "alpha");
  assert.equal(rows[0].previewOpacity, 0.3755);
});

test("buildEffectShadergraphMaterialManifest keeps alpha-blended emissive effects in alpha preview mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-alpha-emissive-preview-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero010/Hero010_FireGlow/Hero010_FireGlow.Surface[9].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(shaderPath, "void alpha_hint () { lowp vec4 tmpvar_9; tmpvar_9.w = (texture2D (sampler15, var0.xy).w * var0.w); }", "latin1");

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "baseColor", "emissive"]);
  assert.equal(manifest.items[0].previewBlendMode, "alpha");
  assert.equal(reportRowsForManifest(manifest)[0].previewBlendMode, "alpha");
});

test("buildEffectShadergraphMaterialManifest marks area base surfaces as diagnostic-only card risks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-card-risk-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero010/Hero010_B_Aura/Hero010_B_Aura.Surface[7].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  writeAlphaPng(previewTexture, [0, 96, 128, 0, 64, 128, 96, 0, 0]);

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    {
      shaderRoot,
      effectPreviewTextureRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Hero010/Hero010_B_Aura/Hero010_B_Aura.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 7 }],
            surfaceRecords: [
              {
                relativePath: shaderRel,
                prelude: { renderFamily: "area" },
              },
            ],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "baseColor"]);
  assert.deepEqual(manifest.items[0].pfxRenderFamilies, ["area"]);
  assert.equal(manifest.items[0].previewSurfaceRenderable, false);
  assert.equal(manifest.items[0].previewSurfaceRejectReason, "area-masked-base-card-risk");
  assert.equal(manifest.summary.previewSurfaceRejectedRows, 1);
  assert.deepEqual(manifest.summary.byPreviewSurfaceRejectReason, { "area-masked-base-card-risk": 1 });

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].pfxRenderFamilies, "area");
  assert.equal(rows[0].previewSurfaceRenderable, "false");
  assert.equal(rows[0].previewSurfaceRejectReason, "area-masked-base-card-risk");
});

test("buildEffectShadergraphMaterialManifest keeps masked area base cards diagnostic-only until pfx runtime is richer", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-masked-card-risk-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero019/Hero019_B_Field/Hero019_B_Field.Surface[12].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  fs.appendFileSync(shaderPath, "void alpha_hint () { lowp vec4 tmpvar_9; tmpvar_9.w = (texture2D (sampler15, var0.xy).w * var0.w); }", "latin1");
  writeAlphaPng(previewTexture, [0, 32, 128, 224, 224, 128, 32, 0, 0]);

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    {
      shaderRoot,
      effectPreviewTextureRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Hero019/Hero019_B_Field/Hero019_B_Field.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 12 }],
            surfaceRecords: [
              {
                relativePath: shaderRel,
                prelude: { renderFamily: "area" },
              },
            ],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "baseColor"]);
  assert.equal(manifest.items[0].previewBlendMode, "alpha");
  assert.equal(manifest.items[0].previewSurfaceRenderable, false);
  assert.equal(manifest.items[0].previewSurfaceRejectReason, "area-masked-base-card-risk");
  assert.equal(manifest.summary.previewSurfaceRejectedRows, 1);
});

test("buildEffectShadergraphMaterialManifest keeps uv-animated area base cards diagnostic-only until pfx geometry is decoded", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-uv-area-card-risk-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const effectPreviewTextureRoot = path.join(tempDir, "effect_textures_preview");
  const shaderRel = "Effects/Hero027/Hero027_B_Warning/Hero027_B_Warning.Surface[42].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  const previewTexture = path.join(effectPreviewTextureRoot, shaderRel.replace(/\.shadergraph$/i, ".png"));
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "void uv_hint () {",
      "  lowp vec4 tmpvar_7;",
      "  tmpvar_7 = texture2D (sampler15, (var0.xy + vec2(0.1, 0.0)));",
      "}",
    ].join("\n"),
    "latin1",
  );
  writeAlphaPng(previewTexture, [0, 64, 160, 224, 224, 160, 64, 0, 0]);

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    {
      shaderRoot,
      effectPreviewTextureRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Hero027/Hero027_B_Warning/Hero027_B_Warning.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 42 }],
            surfaceRecords: [
              {
                relativePath: shaderRel,
                prelude: { renderFamily: "area" },
              },
            ],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "baseColor", "uvAnimation"]);
  assert.equal(manifest.items[0].previewSurfaceRenderable, false);
  assert.equal(manifest.items[0].previewSurfaceRejectReason, "area-uv-base-card-risk");
  assert.equal(manifest.summary.previewSurfaceRejectedRows, 1);
  assert.deepEqual(manifest.summary.byPreviewSurfaceRejectReason, { "area-uv-base-card-risk": 1 });
});

test("buildEffectShadergraphMaterialManifest recovers alpha roles from tinted texture effects", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-tinted-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/5V5/Turret/Turret_Aggro_Lvl_2/Turret_Aggro_Lvl_2.Surface[26].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeTintedEffectShadergraph(shaderPath);

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    {
      shaderRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/5V5/Turret/Turret_Aggro_Lvl_2/Turret_Aggro_Lvl_2.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 26 }],
            hookTokens: ["Effect_Turret_Aggro_Lvl_2"],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.summary.rows, 1);
  assert.equal(manifest.summary.materialRoleRows, 1);
  assert.equal(manifest.summary.unclassifiedMaterialRows, 0);
  assert.equal(manifest.summary.tintedTextureRows, 0);
  assert.equal(manifest.summary.pfxLinkedUnclassifiedRows, 0);
  assert.equal(manifest.summary.hookLinkedUnclassifiedRows, 0);
  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.equal(manifest.items[0].previewBlendMode, "alpha");
  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask"]);
  assert.deepEqual(manifest.items[0].textureHashes, ["8417199989D2459313A8077C0976F0A9"]);
  assert.equal(manifest.items[0].inlineColors[0].hex, "#FF2600");

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].materialStatus, "classified");
  assert.equal(rows[0].roleNames, "alphaBlend|alphaMask");
});

test("buildEffectShadergraphMaterialManifest classifies rotated PFX sprite shader dataflow", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-rotated-pfx-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.Surface[132].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeRotatedUvEffectShadergraph(shaderPath);

  const manifest = buildEffectShadergraphMaterialManifest(
    [
      {
        status: "FOUND",
        relativePath: shaderRel,
        hash: "SHADER_HASH",
        filePath: shaderPath,
      },
    ],
    {
      shaderRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 132 }],
            surfaceRecords: [
              {
                relativePath: shaderRel,
                recordLength: 350,
                prelude: { renderFamily: "billboard" },
                sampledFloats: [
                  { relativeOffset: 149, value: 0.25 },
                  { relativeOffset: 153, value: -1 },
                  { relativeOffset: 209, value: 1.5 },
                ],
              },
            ],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "uvAnimation"]);
  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: -1.5,
    phaseSource: "var0.x",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.deepEqual(manifest.items[0].previewUvAnimationGapInputs, []);
  assert.deepEqual(manifest.items[0].previewUvRuntimeEvidence, {
    kind: "pfx-surface-vertex-color-parameters",
    pfxPathCount: 1,
    surfaceRecordCount: 1,
    renderFamilies: ["billboard"],
    recordLengths: [350],
    parameterSampleOffsets: [149, 153, 209],
    vertexColorInputs: ["vertexColor.x"],
  });
  assert.equal(manifest.summary.pfxLinkedUnclassifiedRows, 0);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].roleNames, "alphaBlend|alphaMask|uvAnimation");
  assert.equal(rows[0].previewUvAnimationMode, "rotate");
  assert.equal(rows[0].previewUvAnimationGapReason, "");
  assert.equal(rows[0].previewUvAnimationGapInputs, "");
});

test("buildEffectShadergraphMaterialManifest extracts mirrored rotated UV sprite hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-mirrored-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero012/Ardan_B.assetbundle/Ardan_B.Surface[49].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "2E1C6DA59CABB235D5862D0A3EFB861E",
        "\0",
        "sampler44",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _Color;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler44;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (var1.x * -6.28);",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(tmpvar_1);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(tmpvar_1);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var0.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  vec2 tmpvar_6;",
        "  tmpvar_6 = (tmpvar_5 + vec2(0.5, 0.5));",
        "  vec2 tmpvar_7;",
        "  tmpvar_7.x = (1.0 - tmpvar_6.x);",
        "  tmpvar_7.y = tmpvar_6.y;",
        "  lowp vec4 tmpvar_8;",
        "  tmpvar_8 = texture2D (sampler44, tmpvar_7);",
        "  gl_FragColor = tmpvar_8;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: -6.28,
    phaseSource: "var1.x",
    flipX: true,
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts rotated UV hints through direct vector aliases", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-aliased-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero016/Hero016_AA_L1.assetbundle/Hero016_AA_L1.Surface[11].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D2654868F8F67EB90A0942AE2743AB6D",
        "\0",
        "sampler50",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler50;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (var0.x * -6.0);",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(tmpvar_1);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(tmpvar_1);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var1.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  vec2 tmpvar_6;",
        "  tmpvar_6 = (tmpvar_5 + vec2(0.5, 0.5));",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler50, tmpvar_6);",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: -6,
    phaseSource: "var0.x",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts offset linear rotated UV phase hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-offset-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero030/Hero030_AA_Ranged/Hero030_AA_Ranged.Surface[11].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D2654868F8F67EB90A0942AE2743AB6D",
        "\0",
        "sampler42",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler42;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = ((var1.y + 0.08) * -10.0);",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(tmpvar_1);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(tmpvar_1);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var0.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  lowp vec4 tmpvar_6;",
        "  tmpvar_6 = texture2D (sampler42, (tmpvar_5 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_6;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: -0.8,
    rotationSpeed: -10,
    phaseSource: "var1.y",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts multi-phase rotated UV phase hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-multi-phase-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero066/Default/Hero066_DEF_A_Slash/Hero066_DEF_A_Slash.Surface[29].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D2654868F8F67EB90A0942AE2743AB6D",
        "\0",
        "sampler59",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler59;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = ((var1.y * -4.0) + (var1.z * 20.0));",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(tmpvar_1);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(tmpvar_1);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var0.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  lowp vec4 tmpvar_6;",
        "  tmpvar_6 = texture2D (sampler59, (tmpvar_5 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_6;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 16,
    phaseSource: "var1.y|var1.z",
    phaseSources: ["var1.y", "var1.z"],
    rotationPhaseTerms: [
      { source: "var1.y", scale: -4 },
      { source: "var1.z", scale: 20 },
    ],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts scaled centered rotated UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-scaled-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero065/Default/Hero065_C_FireAOE/Hero065_C_FireAOE.Surface[6].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "590CB7F6B3B11DF41C4D7CAD8DCCFFE6",
        "\0",
        "sampler80",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler80;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = sin(var1.w);",
        "  float tmpvar_2;",
        "  tmpvar_2 = cos(var1.w);",
        "  vec2 tmpvar_3;",
        "  tmpvar_3 = (((var0.xy * var1.xx) + vec2(((1.0 - (var1.w + var1.x)) * 0.5))) - vec2(0.5, 0.5));",
        "  vec2 tmpvar_4;",
        "  tmpvar_4.x = ((tmpvar_2 * tmpvar_3.x) - (tmpvar_1 * tmpvar_3.y));",
        "  tmpvar_4.y = ((tmpvar_1 * tmpvar_3.x) + (tmpvar_2 * tmpvar_3.y));",
        "  lowp vec4 tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler80, (tmpvar_4 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_5;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 1,
    phaseSource: "var1.w",
    repeat: [0, 0],
    repeatTerms: [[{ source: "var1.x", scale: 1 }], [{ source: "var1.x", scale: 1 }]],
    preRotationOffset: [0, 0],
    preRotationOffsetTerms: [[{ source: "var1.w", scale: -0.5 }], [{ source: "var1.w", scale: -0.5 }]],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts vertexColor scale-offset UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-scale-offset-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero066/Default/Hero066_DEF_A_Dash/Hero066_DEF_A_Dash.Surface[5].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "41E2F239C8B9A5023E1A2B8F2C61AE9F",
        "\0",
        "sampler36",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "void main () {",
        "  vec2 tmpvar_1;",
        "  tmpvar_1.x = var0.x;",
        "  tmpvar_1.y = 1.0;",
        "  vec2 tmpvar_2;",
        "  tmpvar_2.x = (1.0 - var0.x);",
        "  tmpvar_2.y = 0.0;",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler36, ((var1.xy * tmpvar_1) + tmpvar_2));",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scaleOffset",
    baseUvSource: "var1.xy",
    repeat: [0, 1],
    offset: [1, 0],
    repeatTerms: [[{ source: "var0.x", scale: 1 }], []],
    offsetTerms: [[{ source: "var0.x", scale: -1 }], []],
    phaseSource: "var0.x",
    phaseSources: ["var0.x"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts vertexColor offset-only UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-offset-only-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Menu/UI/MarketTile_Callout/MarketTile_Callout.Surface[74].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "6F751F7E1FB9E900F60DF87D2AF2097A",
        "\0",
        "sampler36",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = (_MultiTexCoord0 * vec4(0.5, 0.5, 1.0, 1.0));",
        "  var1 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (var1.w * 0.2);",
        "  vec2 tmpvar_2;",
        "  tmpvar_2.x = tmpvar_1;",
        "  tmpvar_2.y = (tmpvar_1 * 0.5);",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler36, (var0.xy + tmpvar_2));",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scaleOffset",
    baseUvSource: "var0.xy",
    repeat: [1, 1],
    offset: [0, 0],
    repeatTerms: [[], []],
    offsetTerms: [[{ source: "var1.w", scale: 0.2 }], [{ source: "var1.w", scale: 0.1 }]],
    phaseSource: "var1.w",
    phaseSources: ["var1.w"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts squared centered scale UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-squared-centered-scale-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero063/Default/Hero063_DEF_B/Hero063_DEF_B.Surface[150].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "F3FE303D0BD6AB4ADB5D09E812C86427",
        "\0",
        "sampler73",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler73;",
        "void main () {",
        "  float tmpvar_3;",
        "  tmpvar_3 = (var0.x * var0.x);",
        "  lowp vec4 tmpvar_4;",
        "  tmpvar_4 = texture2D (sampler73, ((var1.xy * vec2(tmpvar_3)) + vec2(((1.0 - tmpvar_3) * 0.5))));",
        "  gl_FragColor = tmpvar_4;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "centerScale",
    center: [0.5, 0.5],
    speed: [1, 1],
    offset: [0, 0],
    phaseSource: "var0.x",
    phaseInputOffset: 0,
    phaseInputScale: 1,
    phasePower: 2,
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts pre-rotation scroll UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-prerotation-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero036/Hero036_A_AOE/Hero036_A_AOE.Surface[127].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "sampler76",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler76;",
        "void main () {",
        "  float tmpvar_2;",
        "  tmpvar_2 = (var2.x * 0.5);",
        "  float tmpvar_3;",
        "  tmpvar_3 = sin(tmpvar_2);",
        "  float tmpvar_4;",
        "  tmpvar_4 = cos(tmpvar_2);",
        "  vec2 tmpvar_5;",
        "  tmpvar_5 = ((var1.xy + vec2(tmpvar_2)) - vec2(0.5, 0.5));",
        "  vec2 tmpvar_6;",
        "  tmpvar_6.x = ((tmpvar_4 * tmpvar_5.x) - (tmpvar_3 * tmpvar_5.y));",
        "  tmpvar_6.y = ((tmpvar_3 * tmpvar_5.x) + (tmpvar_4 * tmpvar_5.y));",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler76, (tmpvar_6 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 0.5,
    phaseSource: "var2.x",
    preRotationOffset: [0, 0],
    preRotationOffsetSpeed: [0.5, 0.5],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled per-pixel rotated UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero036/Hero036_A_AOE_A/Hero036_A_AOE_A.Surface[22].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "B9D8DD9C23570265312DA662996E7112",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "sampler37",
        "\0",
        "sampler56",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler37;",
        "uniform sampler2D sampler56;",
        "void main () {",
        "  lowp float tmpvar_1;",
        "  tmpvar_1 = (texture2D (sampler37, var2.xy).x * (var0.z * 1.5));",
        "  lowp vec2 tmpvar_2;",
        "  tmpvar_2.x = 0.0;",
        "  tmpvar_2.y = tmpvar_1;",
        "  lowp float tmpvar_3;",
        "  tmpvar_3 = sin(tmpvar_1);",
        "  lowp float tmpvar_4;",
        "  tmpvar_4 = cos(tmpvar_1);",
        "  lowp vec2 tmpvar_5;",
        "  tmpvar_5 = ((var1.xy + tmpvar_2) - vec2(0.5, 0.5));",
        "  lowp vec2 tmpvar_6;",
        "  tmpvar_6.x = ((tmpvar_4 * tmpvar_5.x) - (tmpvar_3 * tmpvar_5.y));",
        "  tmpvar_6.y = ((tmpvar_3 * tmpvar_5.x) + (tmpvar_4 * tmpvar_5.y));",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler56, (tmpvar_6 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledRotate",
    baseSampler: "sampler56",
    rotationSampler: "sampler37",
    rotationChannel: "x",
    baseUvSource: "var1.xy",
    rotationUvSource: "var2.xy",
    center: [0.5, 0.5],
    rotationScale: 1.5,
    phaseSource: "var0.z",
    preRotationAxis: [0, 1],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts phase-only sampled per-pixel rotated UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-rotated-uv-phase-only-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero036/Genie/Hero036_Genie_Stealth_Activate/Hero036_Genie_Stealth_Activate.Surface[19].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "B9D8DD9C23570265312DA662996E7112",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "sampler31",
        "\0",
        "sampler51",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler31;",
        "uniform sampler2D sampler51;",
        "void main () {",
        "  lowp float tmpvar_1;",
        "  tmpvar_1 = (texture2D (sampler31, var1.xy).x * var2.z);",
        "  lowp vec2 tmpvar_2;",
        "  tmpvar_2.x = 0.0;",
        "  tmpvar_2.y = tmpvar_1;",
        "  lowp float tmpvar_3;",
        "  tmpvar_3 = sin(tmpvar_1);",
        "  lowp float tmpvar_4;",
        "  tmpvar_4 = cos(tmpvar_1);",
        "  lowp vec2 tmpvar_5;",
        "  tmpvar_5 = ((var0.xy + tmpvar_2) - vec2(0.5, 0.5));",
        "  lowp vec2 tmpvar_6;",
        "  tmpvar_6.x = ((tmpvar_4 * tmpvar_5.x) - (tmpvar_3 * tmpvar_5.y));",
        "  tmpvar_6.y = ((tmpvar_3 * tmpvar_5.x) + (tmpvar_4 * tmpvar_5.y));",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler51, (tmpvar_6 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledRotate",
    baseSampler: "sampler51",
    rotationSampler: "sampler31",
    rotationChannel: "x",
    baseUvSource: "var0.xy",
    rotationUvSource: "var1.xy",
    center: [0.5, 0.5],
    rotationScale: 1,
    phaseSource: "var2.z",
    preRotationAxis: [0, 1],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest follows cse aliases when classifying rotated UV sources", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-cse-rotated-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero042/S2/Hero042_S2_B_Impact/Hero042_S2_B_Impact.Surface[52].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D051118516FB5DEC1C8453085F1597B4",
        "\0",
        "sampler75",
        "\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void vertex_hint () {",
        "  vec4 cse_1;",
        "  cse_1 = (_MultiTexCoord0 * vec4(0.75, 0.75, 1.0, 1.0));",
        "  var1 = (cse_1 + vec4(0.2, 0.075, 0.0, 0.0));",
        "  var2 = _Color;",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler75;",
        "void main () {",
        "  float tmpvar_2;",
        "  tmpvar_2 = sin(var2.x);",
        "  float tmpvar_3;",
        "  tmpvar_3 = cos(var2.x);",
        "  vec2 tmpvar_4;",
        "  tmpvar_4 = (var1.xy - vec2(0.5, 0.5));",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = ((tmpvar_3 * tmpvar_4.x) - (tmpvar_2 * tmpvar_4.y));",
        "  tmpvar_5.y = ((tmpvar_2 * tmpvar_4.x) + (tmpvar_3 * tmpvar_4.y));",
        "  lowp vec4 tmpvar_6;",
        "  tmpvar_6 = texture2D (sampler75, (tmpvar_5 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_6;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].varyingSources.var1, ["uv0"]);
  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 1,
    phaseSource: "var2.x",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest classifies alpha mask, rim lighting, and uv animation roles", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-runtime-roles-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Test/Test_RuntimeRoles/Test_RuntimeRoles.Surface[1].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
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
        "varying vec4 var1;",
        "void main () {",
        "  vec2 uv;",
        "  uv = (var1.xy + vec2(0.1, 0.0));",
        "  lowp float mask;",
        "  mask = texture2D (sampler12, uv).x;",
        "  lowp float rim;",
        "  rim = pow((1.0 - var0.z), 2.0);",
        "  lowp vec4 outColor;",
        "  outColor.xyz = vec3(rim, rim, rim);",
        "  outColor.w = (mask * var0.w);",
        "  gl_FragColor = outColor;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "rimLighting", "uvAnimation"]);
  assert.equal(manifest.summary.byRole.alphaMask, 1);
  assert.equal(manifest.summary.byRole.uvAnimation, 1);
  assert.equal(reportRowsForManifest(manifest)[0].roleNames, "alphaBlend|alphaMask|rimLighting|uvAnimation");
});

test("buildEffectShadergraphMaterialManifest records shader varying runtime sources", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-varying-sources-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.Surface[110].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "8FA6A82031043018D58937613C8AE4CA",
        "\0",
        "sampler50",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = (_MultiTexCoord0 * vec4(2.0, 3.0, 1.0, 1.0));",
        "}",
        "precision mediump float;",
        "uniform sampler2D sampler50;",
        "void fragment_hint () {",
        "  gl_FragColor = texture2D (sampler50, (var1.xy + vec2((var0.x * 2.0))));",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].varyingSources, {
    var0: ["vertexColor"],
    var1: ["uv0"],
  });
  assert.equal(manifest.summary.varyingSourceRows, 1);
  assert.deepEqual(manifest.summary.byVaryingSource, { uv0: 1, vertexColor: 1 });
  assert.equal(reportRowsForManifest(manifest)[0].varyingSources, "var0=vertexColor|var1=uv0");
});

test("buildEffectShadergraphMaterialManifest extracts flipbook atlas UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-flipbook-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero023/Hero023_C_Burst/Hero023_C_Burst.Surface[124].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void flipbook_hint () {",
      "  vec2 tmpvar_7;",
      "  tmpvar_7.x = (floor((var0.x * 16.0)) * 0.25);",
      "  tmpvar_7.y = (floor((var0.x * 4.0)) * 0.25);",
      "  lowp vec4 tmpvar_8;",
      "  tmpvar_8 = texture2D (sampler15, ((var1.xy * vec2(0.25, 0.25)) + tmpvar_7));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "alphaMask", "baseColor", "uvAnimation"]);
  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "flipbook",
    repeat: [0.25, 0.25],
    frameColumns: 4,
    frameRows: 4,
    frameCount: 16,
    offsetVariable: "tmpvar_7",
    phaseSource: "var0.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "flipbook");
  assert.equal(rows[0].previewUvRepeat, "0.25,0.25");
  assert.equal(rows[0].previewUvFrames, "4x4=16");
});

test("buildEffectShadergraphMaterialManifest extracts flipbook UV hints through scalar phase temporaries", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-flipbook-temp-phase-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/5V5/Turret/Turret_Shell_Casing/Turret_Shell_Casing.Surface[14].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void flipbook_temp_phase_hint () {",
      "  float tmpvar_7;",
      "  tmpvar_7 = (var0.x * 2.0);",
      "  vec2 tmpvar_8;",
      "  tmpvar_8.x = (floor((tmpvar_7 * 16.0)) * 0.25);",
      "  tmpvar_8.y = (floor((tmpvar_7 * 4.0)) * 0.25);",
      "  lowp vec4 tmpvar_9;",
      "  tmpvar_9 = texture2D (sampler15, ((var1.xy * vec2(0.25, 0.25)) + tmpvar_8));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "flipbook",
    repeat: [0.25, 0.25],
    frameColumns: 4,
    frameRows: 4,
    frameCount: 16,
    offsetVariable: "tmpvar_8",
    phaseSource: "var0.x",
    phaseScale: 2,
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts masked complex flipbook atlas UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-masked-flipbook-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Common/Recall/Recall_Channel_End/Recall_Channel_End.Surface[32].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void masked_flipbook_hint () {",
      "  vec2 tmpvar_1;",
      "  tmpvar_1 = (var1.xy * vec2(1.0, 2.0));",
      "  vec2 tmpvar_2;",
      "  tmpvar_2.x = float((tmpvar_1.x >= 1.0));",
      "  tmpvar_2.y = float((tmpvar_1.y >= 1.0));",
      "  vec2 tmpvar_3;",
      "  tmpvar_3 = (tmpvar_1 * (vec2(1.0, 1.0) - tmpvar_2));",
      "  vec2 tmpvar_4;",
      "  tmpvar_4.x = float((tmpvar_3.x >= 0.0));",
      "  tmpvar_4.y = float((tmpvar_3.y >= 0.0));",
      "  vec2 tmpvar_5;",
      "  tmpvar_5.x = (floor((var0.x * 4.0)) * 0.5);",
      "  tmpvar_5.y = (floor((var0.x * 2.0)) * 0.5);",
      "  lowp vec4 tmpvar_6;",
      "  tmpvar_6 = texture2D (sampler15, (((tmpvar_3 * tmpvar_4) * vec2(0.5, 0.5)) + tmpvar_5));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "flipbook",
    repeat: [0.5, 0.5],
    frameColumns: 2,
    frameRows: 2,
    frameCount: 4,
    offsetVariable: "tmpvar_5",
    phaseSource: "var0.x",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "flipbook");
  assert.equal(rows[0].previewUvRepeat, "0.5,0.5");
  assert.equal(rows[0].previewUvFrames, "2x2=4");
});

test("buildEffectShadergraphMaterialManifest extracts single-row complex flipbook atlas UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-single-row-flipbook-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero024/S1T3/Hero024_S1T3_A_Beam/Hero024_S1T3_A_Beam.Surface[53].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void single_row_flipbook_hint () {",
      "  vec2 tmpvar_3;",
      "  tmpvar_3 = (var1.xy - vec2(0.5, 0.5));",
      "  vec2 tmpvar_4;",
      "  tmpvar_4.x = float((tmpvar_3.x >= 0.0));",
      "  tmpvar_4.y = float((tmpvar_3.y >= 0.0));",
      "  vec2 tmpvar_5;",
      "  tmpvar_5.x = (floor((var0.w * 4.0)) * 0.25);",
      "  tmpvar_5.y = floor(var0.w);",
      "  lowp vec4 tmpvar_6;",
      "  tmpvar_6 = texture2D (sampler15, (((tmpvar_3 * tmpvar_4) * vec2(0.25, 1.0)) + tmpvar_5));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "flipbook",
    repeat: [0.25, 1],
    frameColumns: 4,
    frameRows: 1,
    frameCount: 4,
    offsetVariable: "tmpvar_5",
    phaseSource: "var0.w",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts aliased complex flipbook atlas UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-aliased-flipbook-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero025/S1/Hero025_S1_Portal_A/Hero025_S1_Portal_A.Surface[141].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void aliased_flipbook_hint () {",
      "  vec2 tmpvar_1;",
      "  tmpvar_1.x = (floor((var0.w * 16.0)) * 0.25);",
      "  tmpvar_1.y = (floor((var0.w * 4.0)) * 0.25);",
      "  vec2 tmpvar_2;",
      "  tmpvar_2 = ((var1.xy * vec2(0.25, 0.25)) + tmpvar_1);",
      "  lowp vec4 tmpvar_3;",
      "  tmpvar_3 = texture2D (sampler15, tmpvar_2);",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "flipbook",
    repeat: [0.25, 0.25],
    frameColumns: 4,
    frameRows: 4,
    frameCount: 16,
    offsetVariable: "tmpvar_1",
    phaseSource: "var0.w",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts vertex-color vector scroll UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-vector-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero000/Hero000_Stacks/Hero000_Stacks.Surface[11].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "attribute vec4 _Color;",
      "attribute vec4 _MultiTexCoord0;",
      "varying vec4 var1;",
      "void vertex_scroll_hint () {",
      "  var0 = _MultiTexCoord0;",
      "  var1 = _Color;",
      "}",
      "void vector_scroll_hint () {",
      "  lowp vec4 tmpvar_2;",
      "  tmpvar_2 = texture2D (sampler15, (var0.xy + var1.xy));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [1, 1],
    offset: [0, 0],
    offsetVariable: "var1.xy",
    phaseSource: "var1.xy",
    phaseSources: ["var1.x", "var1.y"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "scroll");
  assert.equal(rows[0].previewUvScroll, "1,1");
});

test("buildEffectShadergraphMaterialManifest extracts vertex-color centered scale UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-centered-scale-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero066/Default/Hero066_DEF_Mark1/Hero066_DEF_Mark1.Surface[31].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "attribute vec4 _Color;",
      "attribute vec4 _MultiTexCoord0;",
      "varying vec4 var1;",
      "void vertex_center_scale_hint () {",
      "  var0 = _MultiTexCoord0;",
      "  var1 = _Color;",
      "}",
      "void centered_scale_hint () {",
      "  lowp vec4 tmpvar_2;",
      "  tmpvar_2 = texture2D (sampler15, ((var0.xy * var1.ww) + vec2(((1.0 - var1.w) * 0.5))));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "centerScale",
    center: [0.5, 0.5],
    speed: [1, 1],
    offset: [0, 0],
    phaseSource: "var1.w",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "centerScale");
});

test("buildEffectShadergraphMaterialManifest extracts direct scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/5V5/VainCrystal/VainCrystal_Target_Laser/VainCrystal_Target_Laser.Surface[18].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void scroll_hint () {",
      "  vec2 tmpvar_7;",
      "  tmpvar_7.x = 0.0;",
      "  tmpvar_7.y = (var1.w * -0.5);",
      "  lowp vec4 tmpvar_8;",
      "  tmpvar_8 = texture2D (sampler15, (var0.xy + tmpvar_7));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0, -0.5],
    offset: [0, 0],
    offsetVariable: "tmpvar_7",
    phaseSource: "var1.w",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "scroll");
  assert.equal(rows[0].previewUvRepeat, "");
  assert.equal(rows[0].previewUvFrames, "");
  assert.equal(rows[0].previewUvScroll, "0,-0.5");
});

test("buildEffectShadergraphMaterialManifest extracts two-component vertex-color tmpvar scroll UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-tmpvar-vector-scroll-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero010/CAT/Hero010_CAT_Pool/Hero010_CAT_Pool.Surface[41].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "attribute vec4 _Color;",
      "attribute vec4 _MultiTexCoord0;",
      "varying vec4 var1;",
      "void vertex_tmpvar_scroll_hint () {",
      "  var0 = _MultiTexCoord0;",
      "  var1 = _Color;",
      "}",
      "void tmpvar_vector_scroll_hint () {",
      "  vec2 tmpvar_1;",
      "  tmpvar_1.x = (var1.x * 2.0);",
      "  tmpvar_1.y = var1.w;",
      "  lowp vec4 tmpvar_2;",
      "  tmpvar_2 = texture2D (sampler15, (var0.xy + tmpvar_1));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [2, 1],
    offset: [0, 0],
    offsetVariable: "tmpvar_1",
    phaseSource: "var1.x|var1.w",
    phaseSources: ["var1.x", "var1.w"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts component alias scroll UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-component-alias-scroll-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero020/S1/Phinn_S1_C/Phinn_S1_C.Surface[110].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void component_alias_scroll_hint () {",
      "  vec3 tmpvar_1;",
      "  vec2 tmpvar_2;",
      "  tmpvar_1.x = var1.w;",
      "  tmpvar_2.x = (vec3(1.0, 1.0, 1.0) - tmpvar_1).x;",
      "  tmpvar_2.y = 0.0;",
      "  lowp vec4 tmpvar_3;",
      "  tmpvar_3 = texture2D (sampler15, (var0.xy + tmpvar_2));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [-1, 0],
    offset: [1, 0],
    offsetVariable: "tmpvar_2",
    phaseSource: "var1.w",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts direct vec2 scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-vec2-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero014/S2/Celeste_S2_Star_Sm_Nova/Celeste_S2_Star_Sm_Nova.Surface[18].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void vec2_scroll_hint () {",
      "  lowp vec4 tmpvar_8;",
      "  tmpvar_8 = texture2D (sampler15, (var1.xy + vec2((var0.w * 2.0))));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [2, 2],
    offset: [0, 0],
    offsetVariable: "vec2",
    phaseSource: "var0.w",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "scroll");
  assert.equal(rows[0].previewUvScroll, "2,2");
});

test("buildEffectShadergraphMaterialManifest extracts vec2 scroll UV hints through simple vector aliases", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-vector-alias-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero014/S2/Celeste_S2_Star_Sm/Celeste_S2_Star_Sm.Surface[117].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void vector_alias_scroll_hint () {",
      "  vec2 tmpvar_21;",
      "  tmpvar_21 = (var1.xy + vec2((var0.x * 2.0)));",
      "  lowp vec4 tmpvar_22;",
      "  tmpvar_22 = texture2D (sampler15, tmpvar_21);",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [2, 2],
    offset: [0, 0],
    offsetVariable: "vec2",
    phaseSource: "var0.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts static vec2 UV offset preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-static-offset-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Common/Tutorial/Blocker_10m/Blocker_10m.Surface[27].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "void static_offset_hint () {",
      "  lowp vec4 tmpvar_8;",
      "  tmpvar_8 = texture2D (sampler15, (var0.xy + vec2(0.0, 0.5)));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0, 0],
    offset: [0, 0.5],
    offsetVariable: "vec2",
    phaseSource: "",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts static vec2 UV scale preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-static-scale-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero021/S2/Hero021_S2_AA_Stack_1/Hero021_S2_AA_Stack_1.Surface[18].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void static_scale_hint () {",
      "  vec2 tmpvar_21;",
      "  tmpvar_21 = (var1.xy * vec2(0.5, 0.5));",
      "  lowp vec4 tmpvar_22;",
      "  tmpvar_22 = texture2D (sampler15, tmpvar_21);",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0, 0],
    offset: [0, 0],
    repeat: [0.5, 0.5],
    offsetVariable: "uvScale",
    phaseSource: "",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts TCH0 uniform static UV scale-offset defaults", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-tch0-uniform-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero036/Hero036_Ring_Scale/Hero036_Ring_Scale.Surface[8].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });

  fs.writeFileSync(
    shaderPath,
    Buffer.concat([
      Buffer.from("RSC0\0TCH0", "latin1"),
      Buffer.from([
        0xc1, 0x03, 0x00, 0x00,
        0xdf, 0x00, 0x01, 0x01,
        0x07, 0x00, 0x00, 0x00,
        0x32, 0x00, 0x00, 0x00,
        0x02, 0x01, 0x00, 0x00,
        0x00, 0x01,
        0x00, 0x00, 0x80, 0x3f,
        0xc0, 0xf1, 0xc9, 0x60,
        0x01, 0x01,
        0x00, 0x00, 0x00, 0x00,
        0xd6, 0xf1, 0x09, 0xd9,
      ]),
      Buffer.from("2E473C6C49291A226F812EC3A4E70972\0\0\0\1", "latin1"),
      Buffer.from("sampler33\0xxxxxxunif23\0xxxxxxxxxunif30\0xxxxxxxxx", "latin1"),
      Buffer.from(
        [
          "precision highp float;",
          "attribute vec4 _MultiTexCoord0;",
          "attribute vec4 _Color;",
          "varying vec4 var0;",
          "varying vec4 var1;",
          "void vertex_hint () {",
          "  var0 = _MultiTexCoord0;",
          "  var1 = _Color;",
          "}",
          "precision mediump float;",
          "uniform float unif23;",
          "uniform float unif30;",
          "uniform sampler2D sampler33;",
          "varying vec4 var0;",
          "varying vec4 var1;",
          "void main () {",
          "  lowp vec4 tmpvar_1;",
          "  tmpvar_1 = texture2D (sampler33, ((var0.xy * vec2(unif23)) + vec2(unif30)));",
          "  lowp vec4 tmpvar_2;",
          "  tmpvar_2.xyz = (vec3(2.0, 2.0, 2.0) * tmpvar_1.yyy);",
          "  tmpvar_2.w = (tmpvar_1.y * var1.w);",
          "  gl_FragColor = tmpvar_2;",
          "}",
        ].join(""),
        "latin1",
      ),
    ]),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0, 0],
    offset: [0, 0],
    repeat: [1, 1],
    offsetVariable: "uniformScaleOffset",
    phaseSource: "",
    baseUvSource: "var0.xy",
    uniformDefaults: {
      unif23: 1,
      unif30: 0,
    },
    uniformEvidenceKind: "shadergraph-tch0-uniform-defaults",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts uniform floor atlas offset UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-uniform-floor-atlas-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/Catherine/Art/catherine_summer.summer_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D51E9447AFCD28D7C78AF01D1D64164A",
        "\0",
        "sampler93",
        "\0",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif80;",
        "uniform sampler2D sampler93;",
        "void vertex_hint () {",
        "  var4 = (_MultiTexCoord0 * vec4(0.5, 0.5, 1.0, 1.0));",
        "}",
        "varying vec4 var4;",
        "void main () {",
        "  vec3 tmpvar_5;",
        "  tmpvar_5.x = unif80;",
        "  tmpvar_5.y = 0.0;",
        "  tmpvar_5.z = 0.0;",
        "  vec3 tmpvar_6;",
        "  tmpvar_6.x = tmpvar_5.x;",
        "  tmpvar_6.y = tmpvar_5.x;",
        "  tmpvar_6.z = 0.0;",
        "  vec3 tmpvar_7;",
        "  tmpvar_7 = (tmpvar_6 / vec3(2.0, 4.0, 1.0));",
        "  vec2 tmpvar_8;",
        "  tmpvar_8.x = tmpvar_7.x;",
        "  tmpvar_8.y = (0.5 * floor((tmpvar_7.y / 0.5)));",
        "  lowp vec4 tmpvar_9;",
        "  tmpvar_9 = texture2D (sampler93, (var4.xy + tmpvar_8));",
        "  gl_FragColor = tmpvar_9;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "uniformFloorAtlasOffset",
    baseSampler: "sampler93",
    baseUvSource: "var4.xy",
    phaseSource: "uniform:unif80",
    offsetTerms: [
      { source: "uniform:unif80", scale: 0.5 },
      { source: "uniform:unif80", scale: 0.5, floorDivisor: 0.5, floorScale: 0.5 },
    ],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts uniform alias scale-offset UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-uniform-alias-scale-offset-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/JungleBlackclaw/Art/blackclaw.blackclaw_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "F147B0F22DF3E49AC21488B50700A883",
        "\0",
        "sampler287",
        "\0",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif56;",
        "uniform sampler2D sampler287;",
        "void vertex_hint () {",
        "  var6 = _MultiTexCoord0;",
        "}",
        "varying vec4 var6;",
        "void main () {",
        "  float cse_4;",
        "  cse_4 = (1.0 - unif56);",
        "  vec3 cse_5;",
        "  cse_5 = (vec3(0.5, 0.5, 0.5) * unif56);",
        "  vec4 tmpvar_23;",
        "  tmpvar_23.xyz = (cse_5 + vec3(cse_4));",
        "  vec4 tmpvar_24;",
        "  tmpvar_24.xyz = (cse_5 + vec3(cse_4));",
        "  vec2 tmpvar_25;",
        "  tmpvar_25.x = tmpvar_23.x;",
        "  tmpvar_25.y = tmpvar_24.x;",
        "  vec4 tmpvar_26;",
        "  tmpvar_26.xyz = (cse_5 + vec3(cse_4));",
        "  vec4 tmpvar_27;",
        "  tmpvar_27.xyz = (cse_5 + vec3(cse_4));",
        "  vec2 tmpvar_28;",
        "  tmpvar_28.x = tmpvar_26.x;",
        "  tmpvar_28.y = tmpvar_27.x;",
        "  lowp vec4 tmpvar_29;",
        "  tmpvar_29 = texture2D (sampler287, ((var6.xy * tmpvar_25) + tmpvar_28));",
        "  gl_FragColor = tmpvar_29;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "uniformAliasScaleOffset",
    baseSampler: "sampler287",
    baseUvSource: "var6.xy",
    scaleAlias: "tmpvar_25",
    offsetAlias: "tmpvar_28",
    phaseSource: "uniform:unif56",
    scaleTerms: [
      { offset: 1, terms: [{ source: "uniform:unif56", scale: -0.5 }] },
      { offset: 1, terms: [{ source: "uniform:unif56", scale: -0.5 }] },
    ],
    offsetTerms: [
      { offset: 1, terms: [{ source: "uniform:unif56", scale: -0.5 }] },
      { offset: 1, terms: [{ source: "uniform:unif56", scale: -0.5 }] },
    ],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts component sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-gap-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.Surface[110].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "CAB13D49ABAE5117497CE1E3482E7FB5",
        "\0",
        "8FA6A82031043018D58937613C8AE4CA",
        "\0",
        "sampler46",
        "\0",
        "sampler50",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler46;",
        "uniform sampler2D sampler50;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec2 tmpvar_6;",
        "  tmpvar_6.x = 0.0;",
        "  tmpvar_6.y = ((texture2D (sampler46, var2.xy).x * 0.5) * var0.w);",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler50, (var1.xy + tmpvar_6));",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler50",
    distortionSampler: "sampler46",
    distortionChannel: "x",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: 0,
    distortionScale: 0.5,
    amplitudeSource: "var0.w",
    phaseSource: "var0.w",
    axis: [0, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.deepEqual(manifest.items[0].previewUvAnimationGapInputs, []);
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.deepEqual(manifest.summary.byPreviewUvAnimationGapReason, {});
  assert.deepEqual(manifest.summary.byPreviewUvRuntimeEvidenceInput, {});
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationGapReason, "");
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationGapInputs, "");
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion with per-axis phase offsets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-axis-phase-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero040/Hero040_B_SoulPin/Hero040_B_SoulPin.Surface[28].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "A86A2B3FAB0AFF309B17349BD01DB6B1",
        "\0",
        "E7706303C2BB9D526E51581C1FA0025E",
        "\0",
        "sampler46",
        "\0",
        "sampler105",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler46;",
        "uniform sampler2D sampler105;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler46, var2.xy);",
        "  lowp vec3 tmpvar_2;",
        "  tmpvar_2.x = tmpvar_1.x;",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec3 tmpvar_3;",
        "  tmpvar_3.x = tmpvar_1.y;",
        "  tmpvar_3.y = 0.0;",
        "  tmpvar_3.z = 0.0;",
        "  lowp vec2 tmpvar_4;",
        "  tmpvar_4.x = ((((vec3(-1.0, 0.0, 0.0) + ((tmpvar_2 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * 0.2) + var0.y) + 0.5);",
        "  tmpvar_4.y = ((vec3(-1.0, 0.0, 0.0) + ((tmpvar_3 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * 0.2);",
        "  lowp vec4 tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler105, (var1.xy + tmpvar_4));",
        "  gl_FragColor = tmpvar_5;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler105",
    distortionSampler: "sampler46",
    distortionChannel: "x",
    distortionChannels: ["x", "y"],
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: -0.2,
    distortionScale: 0.4,
    amplitudeSource: "",
    phaseSource: "var0.y",
    axis: [1, 1],
    offset: [0.5, 0],
    offsetSpeed: [1, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion with uniform-time vector offsets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-uniform-offset-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/CardsChest/Art/lootChestRare_Chest_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "F147B0F22DF3E49AC21488B50700A883",
        "\0",
        "2E1F4712A7B4E52D522CA6A4DDC38787",
        "\0",
        "sampler87",
        "\0",
        "sampler152",
        "\0",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif139;",
        "uniform sampler2D sampler87;",
        "uniform sampler2D sampler152;",
        "void vertex_hint () {",
        "  var1 = _MultiTexCoord0;",
        "  var3 = (_MultiTexCoord0 * vec4(1.5, 1.0, 1.0, 1.0));",
        "}",
        "varying vec4 var1;",
        "varying vec4 var3;",
        "void main () {",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler87, var1.xy);",
        "  vec3 tmpvar_13;",
        "  tmpvar_13.x = unif139;",
        "  tmpvar_13.y = unif139;",
        "  tmpvar_13.z = 0.0;",
        "  vec3 tmpvar_14;",
        "  tmpvar_14 = (tmpvar_13 * vec3(-0.5, 0.5, 1.0));",
        "  lowp vec2 tmpvar_15;",
        "  tmpvar_15.x = (tmpvar_14 + (tmpvar_7.xyz - vec3(0.5, 0.5, 0.5))).x;",
        "  tmpvar_15.y = (tmpvar_14 + (tmpvar_7.xyz - vec3(0.5, 0.5, 0.5))).y;",
        "  lowp vec4 tmpvar_16;",
        "  tmpvar_16 = texture2D (sampler152, (var3.xy + tmpvar_15));",
        "  gl_FragColor = tmpvar_16;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler152",
    distortionSampler: "sampler87",
    distortionChannel: "x",
    distortionChannels: ["x", "y"],
    baseUvSource: "var3.xy",
    distortionUvSource: "var1.xy",
    distortionBias: 0,
    distortionScale: 1,
    amplitudeSource: "",
    phaseSource: "uniform:unif139",
    axis: [1, 1],
    offset: [-0.5, -0.5],
    offsetSpeed: [-0.5, 0.5],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion with fract uniform offsets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-fract-offset-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/Hero025/ArtWall/hero025Wall_occult_ally.occult_ally_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "A26F7429BE849BE5455CBFB3DE38E2F",
        "\0",
        "C960E942204589EF69C39CDA4095B6C4",
        "\0",
        "sampler94",
        "\0",
        "sampler117",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif77;",
        "uniform sampler2D sampler94;",
        "uniform sampler2D sampler117;",
        "void vertex_hint () {",
        "  var1 = _Color;",
        "  var2 = (_MultiTexCoord0 * vec4(1.5, 1.5, 1.0, 1.0));",
        "  var3 = _MultiTexCoord0;",
        "}",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "varying vec4 var3;",
        "void main () {",
        "  vec3 tmpvar_1;",
        "  tmpvar_1.x = unif77;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  vec3 tmpvar_2;",
        "  tmpvar_2.x = fract((tmpvar_1 * vec3(0.85, 1.0, 1.0)).x);",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec3 tmpvar_3;",
        "  tmpvar_3 = (texture2D (sampler94, var3.xy).xyz - vec3(0.5, 0.5, 0.0));",
        "  lowp vec3 tmpvar_4;",
        "  tmpvar_4.x = tmpvar_3.x;",
        "  tmpvar_4.y = 0.0;",
        "  tmpvar_4.z = 0.0;",
        "  vec3 tmpvar_5;",
        "  tmpvar_5.x = unif77;",
        "  tmpvar_5.y = 0.0;",
        "  tmpvar_5.z = 0.0;",
        "  vec3 tmpvar_6;",
        "  tmpvar_6.x = fract((tmpvar_5 * vec3(-0.35, 1.0, 1.0)).x);",
        "  tmpvar_6.y = -0.5;",
        "  tmpvar_6.z = 0.0;",
        "  lowp vec3 tmpvar_7;",
        "  tmpvar_7.x = tmpvar_3.y;",
        "  tmpvar_7.y = 0.0;",
        "  tmpvar_7.z = 0.0;",
        "  lowp vec2 tmpvar_8;",
        "  tmpvar_8.x = (tmpvar_2 + tmpvar_4).x;",
        "  tmpvar_8.y = (tmpvar_6 + tmpvar_7).x;",
        "  lowp vec4 tmpvar_9;",
        "  tmpvar_9 = texture2D (sampler117, (var2.xy + tmpvar_8));",
        "  gl_FragColor = tmpvar_9;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledFractOffsetDistort",
    baseSampler: "sampler117",
    distortionSampler: "sampler94",
    distortionChannel: "x",
    distortionChannels: ["x", "y"],
    baseUvSource: "var2.xy",
    distortionUvSource: "var3.xy",
    distortionBias: 0,
    distortionScale: 1,
    amplitudeSource: "",
    phaseSource: "uniform:unif77",
    axis: [1, 1],
    offset: [-0.5, -0.5],
    offsetSpeed: [0.85, -0.35],
    offsetPhaseModes: ["fract", "fract"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledFractOffsetDistort");
});

test("buildEffectShadergraphMaterialManifest extracts uniform vertex-color fract UV offsets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-uniform-vertex-fract-offset-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/Hero015/Art/hero015_kirin.hero015_kirin_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D577C33312464C0D0C40EE6A3983B963",
        "\0",
        "sampler189",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif161;",
        "uniform sampler2D sampler189;",
        "void vertex_hint () {",
        "  var6 = _MultiTexCoord0;",
        "  var7 = _Color;",
        "}",
        "varying vec4 var6;",
        "varying vec4 var7;",
        "void main () {",
        "  vec3 tmpvar_10;",
        "  tmpvar_10.x = unif161;",
        "  tmpvar_10.y = 0.0;",
        "  tmpvar_10.z = 0.0;",
        "  vec3 tmpvar_11;",
        "  tmpvar_11 = (tmpvar_10 * vec3(0.5, 1.0, 1.0));",
        "  vec3 tmpvar_12;",
        "  tmpvar_12.x = tmpvar_11.x;",
        "  tmpvar_12.y = tmpvar_11.x;",
        "  tmpvar_12.z = 0.0;",
        "  vec3 tmpvar_13;",
        "  tmpvar_13.x = var7.x;",
        "  tmpvar_13.y = var7.y;",
        "  tmpvar_13.z = 0.0;",
        "  vec3 tmpvar_14;",
        "  tmpvar_14 = ((tmpvar_13 - vec3(0.5, 0.5, 0.0)) * vec3(2.0, 2.0, 1.0));",
        "  vec3 tmpvar_15;",
        "  tmpvar_15.x = tmpvar_14.x;",
        "  tmpvar_15.y = tmpvar_14.y;",
        "  tmpvar_15.z = 1.0;",
        "  vec3 tmpvar_16;",
        "  tmpvar_16 = (tmpvar_12 * tmpvar_15);",
        "  vec2 tmpvar_17;",
        "  tmpvar_17.x = fract(tmpvar_16.x);",
        "  tmpvar_17.y = fract(tmpvar_16.y);",
        "  lowp vec4 tmpvar_18;",
        "  tmpvar_18 = texture2D (sampler189, (var6.xy + tmpvar_17));",
        "  gl_FragColor = tmpvar_18;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "uniformVertexColorFractOffset",
    baseSampler: "sampler189",
    baseUvSource: "var6.xy",
    offsetAlias: "tmpvar_17",
    productAlias: "tmpvar_16",
    uniformSource: "uniform:unif161",
    uniformScale: [0.5, 0.5],
    vertexSources: ["var7.x", "var7.y"],
    vertexOffset: [-1, -1],
    vertexTerms: [
      [{ source: "var7.x", scale: 2 }],
      [{ source: "var7.y", scale: 2 }],
    ],
    phaseSource: "uniform:unif161|var7.x|var7.y",
    phaseSources: ["uniform:unif161", "var7.x", "var7.y"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "uniformVertexColorFractOffset");
});

test("buildEffectShadergraphMaterialManifest extracts nested sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-nested-sampled-uv-distort-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Characters/Hero028/Art/hero028_poseidon.hero028_waterOpaque_mat.shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "AEA1CE7AEDE65253F118EBAE4CEC5B52",
        "\0",
        "EB91B7DC24C5D5DF3D1AF5F523FD0E26",
        "\0",
        "sampler98",
        "\0",
        "sampler168",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision highp float;",
        "uniform float unif83;",
        "uniform sampler2D sampler98;",
        "uniform sampler2D sampler168;",
        "void vertex_hint () {",
        "  var2 = _MultiTexCoord0;",
        "  var4 = _MultiTexCoord0;",
        "  var5 = _Color;",
        "}",
        "varying vec4 var2;",
        "varying vec4 var4;",
        "varying vec4 var5;",
        "void main () {",
        "  vec3 tmpvar_4;",
        "  tmpvar_4.x = unif83;",
        "  tmpvar_4.y = 0.0;",
        "  tmpvar_4.z = 0.0;",
        "  vec2 tmpvar_5;",
        "  tmpvar_5.x = fract((tmpvar_4 * vec3(1.0, 0.25, 1.0)).x);",
        "  tmpvar_5.y = 0.0;",
        "  vec2 tmpvar_6;",
        "  tmpvar_6 = ((var2.xy + tmpvar_5) - vec2(0.5, 0.5));",
        "  vec2 tmpvar_7;",
        "  tmpvar_7.x = ((3.13916e-07 * tmpvar_6.x) - tmpvar_6.y);",
        "  tmpvar_7.y = (tmpvar_6.x + (3.13916e-07 * tmpvar_6.y));",
        "  lowp vec4 tmpvar_8;",
        "  tmpvar_8 = texture2D (sampler98, (tmpvar_7 + vec2(0.5, 0.5)));",
        "  lowp vec3 tmpvar_21;",
        "  tmpvar_21.x = tmpvar_8.x;",
        "  tmpvar_21.y = tmpvar_8.x;",
        "  tmpvar_21.z = 0.0;",
        "  lowp vec4 tmpvar_22;",
        "  tmpvar_22.xyz = texture2D (sampler168, (var4.xy + (tmpvar_21 * vec3(0.2, 0.2, 1.0)).xy)).xyz;",
        "  tmpvar_22.w = 1.0;",
        "  gl_FragColor = tmpvar_22;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "nestedSampledUvDistort",
    baseSampler: "sampler168",
    baseUvSource: "var4.xy",
    distortionSampler: "sampler98",
    distortionChannel: "x",
    distortionUvExpression: "tmpvar_7 + vec2(0.5, 0.5)",
    distortionScale: [0.2, 0.2],
    phaseSource: "uniform:unif83",
    phaseSources: ["uniform:unif83"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "nestedSampledUvDistort");
});

test("buildEffectShadergraphMaterialManifest extracts rotated sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-rotated-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Blackclaw/BlackClaw_Heal_Buff/BlackClaw_Heal_Buff.Surface[130].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "D2654868F8F67EB90A0942AE2743AB6D",
        "\0",
        "sampler35",
        "\0",
        "sampler56",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler35;",
        "uniform sampler2D sampler56;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp float tmpvar_1;",
        "  tmpvar_1 = sin(var0.y);",
        "  lowp float tmpvar_2;",
        "  tmpvar_2 = cos(var0.y);",
        "  lowp vec2 tmpvar_3;",
        "  tmpvar_3 = ((var1.xy + vec2((texture2D (sampler35, var2.xy).x * var0.z))) - vec2(0.5, 0.5));",
        "  lowp vec2 tmpvar_4;",
        "  tmpvar_4.x = ((tmpvar_2 * tmpvar_3.x) - (tmpvar_1 * tmpvar_3.y));",
        "  tmpvar_4.y = ((tmpvar_1 * tmpvar_3.x) + (tmpvar_2 * tmpvar_3.y));",
        "  lowp vec4 tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler56, (tmpvar_4 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_5;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler56",
    distortionSampler: "sampler35",
    distortionChannel: "x",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: 0,
    distortionScale: 1,
    amplitudeSource: "var0.z",
    phaseSource: "var0.z",
    phaseSources: ["var0.z", "var0.y"],
    axis: [1, 1],
    offset: [0, 0],
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 1,
    rotationPhaseSource: "var0.y",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
});

test("buildEffectShadergraphMaterialManifest extracts centered sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-centered-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/5V5/Turret/Turret_Death_Explosion/Turret_Death_Explosion.Surface[59].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "sampler35",
        "\0",
        "sampler61",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler35;",
        "uniform sampler2D sampler61;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler35, var1.xy).x;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler61, (var0.xy + vec2(((vec3(-1.0, 0.0, 0.0) + ((tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * var2.x))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler61",
    distortionSampler: "sampler35",
    distortionChannel: "x",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -1,
    distortionScale: 2,
    amplitudeSource: "var2.x",
    phaseSource: "var2.x",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
});

test("buildEffectShadergraphMaterialManifest extracts fixed-amplitude sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-fixed-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Cards/Common_Front/Common_Front.Surface[16].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "F5FBC6910703E680DAEB12774AEF4B81",
        "\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "sampler36",
        "\0",
        "sampler62",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "uniform sampler2D sampler62;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler36, var1.xy).y;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler62, (var0.xy + vec2(((vec3(-0.2, 0.0, 0.0) + ((tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(0.4, 0.0, 0.0))).x))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler62",
    distortionSampler: "sampler36",
    distortionChannel: "y",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -0.2,
    distortionScale: 0.4,
    amplitudeSource: "",
    phaseSource: "",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
});

test("buildEffectShadergraphMaterialManifest extracts subtract-divide sampled UV distortion with runtime offset phase", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-subtract-divide-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero019/Hero019_A_Explosion/Hero019_A_Explosion.Surface[137].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "sampler46",
        "\0",
        "sampler71",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler46;",
        "uniform sampler2D sampler71;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler46, var2.xy).y;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler71, (var1.xy + vec2(((((tmpvar_1 - vec3(1.0, 0.0, 0.0)) / vec3(9.0, 0.0, 0.0)) * vec3(1.0, 0.0, 0.0)).x + var0.y))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler71",
    distortionSampler: "sampler46",
    distortionChannel: "y",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: -0.1111,
    distortionScale: 0.1111,
    amplitudeSource: "",
    phaseSource: "var0.y",
    axis: [1, 1],
    offset: [0, 0],
    offsetSpeed: [1, 1],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
});

test("buildEffectShadergraphMaterialManifest extracts biased subtract-divide sampled UV distortion hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-biased-subtract-divide-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero021/S1/Hero021_S1_B/Hero021_S1_B.Surface[112].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "D051118516FB5DEC1C8453085F1597B4",
        "\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "sampler42",
        "\0",
        "sampler70",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler42;",
        "uniform sampler2D sampler70;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = (_MultiTexCoord0 * vec4(2.0, 2.0, 1.0, 1.0));",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler42, var1.xy).x;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec2 tmpvar_2;",
        "  tmpvar_2.x = ((((vec3(-1.0, 0.0, 0.0) + (((tmpvar_1 - vec3(-1.0, 0.0, 0.0)) / vec3(3.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * var2.x) * 0.5) + 0.15);",
        "  tmpvar_2.y = 0.0;",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler70, (var0.xy + tmpvar_2));",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler70",
    distortionSampler: "sampler42",
    distortionChannel: "x",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -0.1666,
    distortionScale: 0.3334,
    amplitudeSource: "var2.x",
    phaseSource: "var2.x",
    axis: [1, 0],
    offset: [0.15, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
  assert.equal(reportRowsForManifest(manifest)[0].previewUvAnimationMode, "sampledDistort");
});

test("buildEffectShadergraphMaterialManifest extracts scale-only sampled UV distortion with runtime amplitude", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-scale-only-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero013/Vox_Proj.assetbundle/Vox_Proj.Surface[71].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "2D0DE0CC0B0AD4FCCD2E03E3208A0F7A",
        "\0",
        "E5045BC961A5F6D825413F11B8642790",
        "\0",
        "sampler45",
        "\0",
        "sampler71",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler45;",
        "uniform sampler2D sampler71;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler45, var1.xy).x;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler71, (var0.xy + vec2((( (tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(1.0, 0.0, 0.0)).x * var2.x))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler71",
    distortionSampler: "sampler45",
    distortionChannel: "x",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: 0,
    distortionScale: 1,
    amplitudeSource: "var2.x",
    phaseSource: "var2.x",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts two-channel sampled UV distortion vectors", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-vector-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero013/Vox_Sonar_Debuff.assetbundle/Vox_Sonar_Debuff.Surface[108].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "CD3566E6C6575ABBF03FF8F2DC9957A2",
        "\0",
        "3829CBFB51DFE3D6C1945889DB55E202",
        "\0",
        "sampler36",
        "\0",
        "sampler96",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "uniform sampler2D sampler96;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler36, var1.xy);",
        "  lowp vec3 tmpvar_2;",
        "  tmpvar_2.x = tmpvar_1.x;",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec3 tmpvar_3;",
        "  tmpvar_3.x = tmpvar_1.y;",
        "  tmpvar_3.y = 0.0;",
        "  tmpvar_3.z = 0.0;",
        "  lowp vec2 tmpvar_4;",
        "  tmpvar_4.x = ((vec3(-1.0, 0.0, 0.0) + ((tmpvar_2 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * var2.x);",
        "  tmpvar_4.y = ((vec3(-1.0, 0.0, 0.0) + ((tmpvar_3 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * var2.x);",
        "  lowp vec4 tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler96, (var0.xy + tmpvar_4));",
        "  gl_FragColor = tmpvar_5;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler96",
    distortionSampler: "sampler36",
    distortionChannel: "x",
    distortionChannels: ["x", "y"],
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -1,
    distortionScale: 2,
    amplitudeSource: "var2.x",
    phaseSource: "var2.x",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion amplitude masks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-mask-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/Catherine_A_Impact/Catherine_A_Impact.Surface[60].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "A8D833E6B005C0FC60CB07794C48F5EA",
        "\0",
        "sampler41",
        "\0",
        "sampler71",
        "\0",
        "sampler67",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler41;",
        "uniform sampler2D sampler67;",
        "uniform sampler2D sampler71;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler41, var2.xy).x;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler71, (var1.xy + vec2((((vec3(-1.0, 0.0, 0.0) + ((tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * var0.x) * texture2D (sampler67, var2.xy).x))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler71",
    distortionSampler: "sampler41",
    distortionChannel: "x",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: -1,
    distortionScale: 2,
    amplitudeSource: "var0.x",
    phaseSource: "var0.x",
    amplitudeMaskSampler: "sampler67",
    amplitudeMaskChannel: "x",
    amplitudeMaskUvSource: "var2.xy",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion alias amplitude masks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-alias-mask-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero020/EAR/Phinn_EAR_A_Impact/Phinn_EAR_A_Impact.Surface[75].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "2C68F76508C3C769285C1CC98D7F774B",
        "\0",
        "1E7FE2C0CF088ADC5004B3F0DAB3C9F9",
        "\0",
        "sampler49",
        "\0",
        "sampler76",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler49;",
        "uniform sampler2D sampler76;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler49, var2.xy);",
        "  lowp vec3 tmpvar_4;",
        "  tmpvar_4.x = tmpvar_3.y;",
        "  tmpvar_4.y = 0.0;",
        "  tmpvar_4.z = 0.0;",
        "  lowp vec4 tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler76, (var1.xy + vec2((((vec3(-1.0, 0.0, 0.0) + ((tmpvar_4 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * tmpvar_3.z) * var0.x))));",
        "  gl_FragColor = tmpvar_5;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler76",
    distortionSampler: "sampler49",
    distortionChannel: "y",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: -1,
    distortionScale: 2,
    amplitudeSource: "var0.x",
    phaseSource: "var0.x",
    amplitudeMaskSampler: "sampler49",
    amplitudeMaskChannel: "z",
    amplitudeMaskUvSource: "var2.xy",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled UV distortion with runtime offset phase", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-offset-phase-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Cards/Common_Front/Common_Front.Surface[16].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "F5FBC6910703E680DAEB12774AEF4B81",
        "\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "sampler36",
        "\0",
        "sampler62",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler36;",
        "uniform sampler2D sampler62;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler36, var1.xy).y;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp vec4 tmpvar_2;",
        "  tmpvar_2 = texture2D (sampler62, (var0.xy + vec2(((vec3(-0.2, 0.0, 0.0) + ((tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(0.4, 0.0, 0.0))).x - var2.x))));",
        "  gl_FragColor = tmpvar_2;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledDistort",
    baseSampler: "sampler62",
    distortionSampler: "sampler36",
    distortionChannel: "y",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -0.2,
    distortionScale: 0.4,
    amplitudeSource: "",
    phaseSource: "var2.x",
    axis: [1, 1],
    offset: [0, 0],
    offsetSpeed: [-1, -1],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts Celeste sampled UV warp hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-uv-warp-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero014/Celeste_Star_Sm.assetbundle/Celeste_Star_Sm.Surface[82].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "CD3566E6C6575ABBF03FF8F2DC9957A2",
        "\0",
        "2F6267A9EA1FE472B2965F2E74394F87",
        "\0",
        "sampler53",
        "\0",
        "sampler149",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler53;",
        "uniform sampler2D sampler149;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = (_MultiTexCoord0 * vec4(2.0, 3.0, 1.0, 1.0));",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler53, var2.xy);",
        "  lowp vec3 tmpvar_2;",
        "  tmpvar_2.x = (tmpvar_1.x * tmpvar_1.z);",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec3 tmpvar_3;",
        "  tmpvar_3.x = (tmpvar_1.y * tmpvar_1.z);",
        "  tmpvar_3.y = 0.0;",
        "  tmpvar_3.z = 0.0;",
        "  lowp vec2 tmpvar_4;",
        "  tmpvar_4.x = ((var2.x * ((vec3(-1.0, 0.0, 0.0) + ((tmpvar_2 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * -1.1)) + ((var0.x * var0.w) + var0.w));",
        "  tmpvar_4.y = ((var2.y * ((vec3(-1.0, 0.0, 0.0) + ((tmpvar_3 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * -1.1)) + (((var0.x * -0.3) * var0.w) + var0.w));",
        "  lowp float tmpvar_5;",
        "  tmpvar_5 = (texture2D (sampler149, (var1.xy + tmpvar_4)).x * tmpvar_1.w);",
        "  gl_FragColor = vec4(vec3(tmpvar_5), tmpvar_5);",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledWarp",
    baseSampler: "sampler149",
    distortionSampler: "sampler53",
    distortionChannels: ["x", "y"],
    distortionWeightChannel: "z",
    baseUvSource: "var1.xy",
    baseRepeat: [2, 3],
    distortionUvSource: "var2.xy",
    distortionRepeat: [1, 1],
    uvScaleSource: "var2.xy",
    uvScaleRepeat: [1, 1],
    distortionValueScale: 2,
    distortionBias: -1,
    distortionScale: -1.1,
    runtimeOffsetSource: "var0.x",
    runtimeOffsetMultiplierSource: "var0.w",
    runtimeOffsetBias: [1, 1],
    runtimeOffsetScale: [1, -0.3],
    phaseSource: "var0.x|var0.w",
    phaseSources: ["var0.x", "var0.w"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts negated Celeste sampled UV warp hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-negated-sampled-uv-warp-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero014/S1/Celeste_S1T3_Staff_Idle/Celeste_S1T3_Staff_Idle.Surface[49].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "CD3566E6C6575ABBF03FF8F2DC9957A2",
        "\0",
        "85F709C6981AEF2C7EAFD5FABF891D06",
        "\0",
        "sampler54",
        "\0",
        "sampler150",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler54;",
        "uniform sampler2D sampler150;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec4 tmpvar_1;",
        "  tmpvar_1 = texture2D (sampler54, var2.xy);",
        "  lowp vec3 tmpvar_2;",
        "  tmpvar_2.x = (tmpvar_1.x * tmpvar_1.z);",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec3 tmpvar_3;",
        "  tmpvar_3.x = (tmpvar_1.y * tmpvar_1.z);",
        "  tmpvar_3.y = 0.0;",
        "  tmpvar_3.z = 0.0;",
        "  lowp vec2 tmpvar_4;",
        "  tmpvar_4.x = ((var2.x * -((vec3(-1.0, 0.0, 0.0) + ((tmpvar_2 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x)) + ((var0.x * var0.w) + var0.w));",
        "  tmpvar_4.y = ((var2.y * -((vec3(-1.0, 0.0, 0.0) + ((tmpvar_3 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x)) + (((var0.x * -0.3) * var0.w) + var0.w));",
        "  lowp float tmpvar_5;",
        "  tmpvar_5 = texture2D (sampler150, (var1.xy + tmpvar_4)).x;",
        "  gl_FragColor = vec4(vec3(tmpvar_5), tmpvar_5);",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledWarp",
    baseSampler: "sampler150",
    distortionSampler: "sampler54",
    distortionChannels: ["x", "y"],
    distortionWeightChannel: "z",
    baseUvSource: "var1.xy",
    baseRepeat: [1, 1],
    distortionUvSource: "var2.xy",
    distortionRepeat: [1, 1],
    uvScaleSource: "var2.xy",
    uvScaleRepeat: [1, 1],
    distortionValueScale: 2,
    distortionBias: -1,
    distortionScale: -1,
    runtimeOffsetSource: "var0.x",
    runtimeOffsetMultiplierSource: "var0.w",
    runtimeOffsetBias: [1, 1],
    runtimeOffsetScale: [1, -0.3],
    phaseSource: "var0.x|var0.w",
    phaseSources: ["var0.x", "var0.w"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled offset-field UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-offset-field-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero025/OCLT/Hero025_OCLT_Portal_Link_A/Hero025_OCLT_Portal_Link_A.Surface[55].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "0AA029D72625396C1FE69B88814BED87",
        "\0",
        "C960E942204589EF69C39CDA4095B6C4",
        "\0",
        "1A26F7429BE849BE5455CBFB3DE38E2F",
        "\0",
        "sampler34",
        "\0",
        "sampler63",
        "\0",
        "sampler78",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler34;",
        "uniform sampler2D sampler63;",
        "uniform sampler2D sampler78;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = (_MultiTexCoord0 * vec4(2.0, 2.0, 1.0, 1.0));",
        "  var3 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "varying vec4 var3;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (var0.y + var0.y);",
        "  lowp vec4 tmpvar_4;",
        "  tmpvar_4 = texture2D (sampler63, var2.xy);",
        "  lowp vec2 tmpvar_5;",
        "  tmpvar_5.x = ((((var0.x - 0.5) * 4.0) * tmpvar_1) + (tmpvar_4.x - 0.5));",
        "  tmpvar_5.y = (var3.y + (tmpvar_4.y - 0.5));",
        "  lowp float tmpvar_6;",
        "  tmpvar_6 = (texture2D (sampler34, var0.xy).x * texture2D (sampler78, (var1.xy + tmpvar_5)).y);",
        "  gl_FragColor = vec4(vec3(tmpvar_6), tmpvar_6);",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledOffsetField",
    baseSampler: "sampler78",
    distortionSampler: "sampler63",
    distortionChannels: ["x", "y"],
    baseUvSource: "var1.xy",
    baseRepeat: [1, 1],
    distortionUvSource: "var2.xy",
    distortionRepeat: [2, 2],
    distortionBias: -0.5,
    distortionScale: 1,
    uvBendSource: "var0.xy",
    uvBend: {
      x: { uOffset: -0.5, uScale: 4, vOffset: 0, vScale: 2 },
      y: null,
    },
    runtimeOffsetSource: "var3.y",
    runtimeOffsetAxis: [0, 1],
    phaseSource: "var3.y",
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts center-scale sampled distortion UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-center-scale-sampled-distortion-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "AEC8D405274478AF05DEE8922724C0BF",
        "\0",
        "1946636A53CF79DD8CAC55E247BB76FE",
        "\0",
        "0F5E1A012A061DD01C5BD2D4C5883B10",
        "\0",
        "sampler71",
        "\0",
        "sampler86",
        "\0",
        "sampler113",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler71;",
        "uniform sampler2D sampler86;",
        "uniform sampler2D sampler113;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _Color;",
        "  var3 = ((_MultiTexCoord0 * vec4(0.7, 0.7, 1.0, 1.0)) + vec4(0.15, 0.15, 0.0, 0.0));",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "varying vec4 var3;",
        "void main () {",
        "  float tmpvar_1;",
        "  tmpvar_1 = (1.0 - (var2.y * 2.0));",
        "  float tmpvar_2;",
        "  tmpvar_2 = (tmpvar_1 * tmpvar_1);",
        "  vec2 tmpvar_3;",
        "  tmpvar_3.x = ((1.0 - tmpvar_2) * 0.5);",
        "  tmpvar_3.y = ((1.0 - tmpvar_2) * 0.5);",
        "  lowp vec4 tmpvar_4;",
        "  tmpvar_4 = texture2D (sampler71, ((var1.xy * vec2(tmpvar_2)) + tmpvar_3));",
        "  lowp float tmpvar_5;",
        "  tmpvar_5 = clamp (((texture2D (sampler86, var3.xy).x - 0.02) / 0.03), 0.0, 1.0);",
        "  lowp float tmpvar_6;",
        "  tmpvar_6 = ((tmpvar_5 * (tmpvar_5 * (3.0 - (2.0 * tmpvar_5)))) * var2.x);",
        "  lowp vec2 tmpvar_7;",
        "  tmpvar_7.x = ((1.0 - (((tmpvar_4.x - 0.5) * tmpvar_6) + 1.0)) * 0.5);",
        "  tmpvar_7.y = ((1.0 - (((tmpvar_4.y - 0.5) * tmpvar_6) + 1.0)) * 0.5);",
        "  lowp vec4 tmpvar_8;",
        "  tmpvar_8 = texture2D (sampler113, (var0.xy + tmpvar_7));",
        "  gl_FragColor = tmpvar_8;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledCenterScaleDistort",
    baseSampler: "sampler113",
    distortionSampler: "sampler71",
    amplitudeMaskSampler: "sampler86",
    distortionChannels: ["x", "y"],
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    center: [0.5, 0.5],
    centerScaleSource: "var2.y",
    centerScaleInputOffset: 1,
    centerScaleInputScale: -2,
    centerScalePower: 2,
    distortionBias: -0.5,
    distortionScale: -0.5,
    amplitudeSource: "var2.x",
    amplitudeMaskUvSource: "var3.xy",
    amplitudeMaskRepeat: [0.7, 0.7],
    amplitudeMaskOffset: [0.15, 0.15],
    amplitudeMaskSmoothstep: [0.02, 0.05],
    phaseSource: "var2.y|var2.x",
    phaseSources: ["var2.y", "var2.x"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest extracts sampled scale-rotate UV hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-sampled-scale-rotate-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "2F6267A9EA1FE472B2965F2E74394F87",
        "\0",
        "1946636A53CF79DD8CAC55E247BB76FE",
        "\0",
        "D2654868F8F67EB90A0942AE2743AB6D",
        "\0",
        "sampler51",
        "\0",
        "sampler82",
        "\0",
        "sampler116",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler51;",
        "uniform sampler2D sampler82;",
        "uniform sampler2D sampler116;",
        "void vertex_hint () {",
        "  var0 = _MultiTexCoord0;",
        "  vec4 cse_1;",
        "  cse_1 = (_MultiTexCoord0 * vec4(2.0, 2.0, 1.0, 1.0));",
        "  var1 = cse_1;",
        "  var2 = ((_MultiTexCoord0 * vec4(0.8, 0.8, 1.0, 1.0)) + vec4(0.1, 0.1, 0.0, 0.0));",
        "  var3 = _Color;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "varying vec4 var3;",
        "void main () {",
        "  lowp vec3 tmpvar_1;",
        "  tmpvar_1.x = texture2D (sampler51, var1.xy).x;",
        "  tmpvar_1.y = 0.0;",
        "  tmpvar_1.z = 0.0;",
        "  lowp float tmpvar_2;",
        "  tmpvar_2 = clamp ((texture2D (sampler82, var2.xy).x / 0.2), 0.0, 1.0);",
        "  lowp float tmpvar_3;",
        "  tmpvar_3 = ((((vec3(-1.0, 0.0, 0.0) + ((tmpvar_1 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * (tmpvar_2 * (tmpvar_2 * (3.0 - (2.0 * tmpvar_2))))) * var3.x) + 1.5);",
        "  float tmpvar_4;",
        "  tmpvar_4 = (var3.y * 6.0);",
        "  float tmpvar_5;",
        "  tmpvar_5 = sin(tmpvar_4);",
        "  float tmpvar_6;",
        "  tmpvar_6 = cos(tmpvar_4);",
        "  lowp vec2 tmpvar_7;",
        "  tmpvar_7 = (((var0.xy * vec2(tmpvar_3)) + vec2(((1.0 - tmpvar_3) * 0.5))) - vec2(0.5, 0.5));",
        "  lowp vec2 tmpvar_8;",
        "  tmpvar_8.x = ((tmpvar_6 * tmpvar_7.x) - (tmpvar_5 * tmpvar_7.y));",
        "  tmpvar_8.y = ((tmpvar_5 * tmpvar_7.x) + (tmpvar_6 * tmpvar_7.y));",
        "  lowp vec4 tmpvar_9;",
        "  tmpvar_9 = texture2D (sampler116, (tmpvar_8 + vec2(0.5, 0.5)));",
        "  gl_FragColor = tmpvar_9;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "sampledScaleRotate",
    baseSampler: "sampler116",
    scaleSampler: "sampler51",
    scaleMaskSampler: "sampler82",
    scaleSamplerChannel: "x",
    scaleMaskChannel: "x",
    baseUvSource: "var0.xy",
    scaleUvSource: "var1.xy",
    scaleRepeat: [2, 2],
    scaleOffset: [0, 0],
    scaleMaskUvSource: "var2.xy",
    scaleMaskRepeat: [0.8, 0.8],
    scaleMaskOffset: [0.1, 0.1],
    center: [0.5, 0.5],
    scaleBase: 1.5,
    scaleSamplerBias: -1,
    scaleSamplerScale: 2,
    scaleMaskSmoothstep: [0, 0.2],
    scaleAmplitudeSource: "var3.x",
    rotationSource: "var3.y",
    rotationOffset: 0,
    rotationSpeed: 6,
    phaseSource: "var3.x|var3.y",
    phaseSources: ["var3.x", "var3.y"],
  });
  assert.equal(manifest.items[0].previewUvAnimationGapReason, "");
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
  assert.equal(manifest.summary.previewUvAnimationGapRows, 0);
});

test("buildEffectShadergraphMaterialManifest links unresolved UV gaps to PFX surface parameter evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-pfx-uv-runtime-evidence-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.Surface[110].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "CAB13D49ABAE5117497CE1E3482E7FB5",
        "\0",
        "8FA6A82031043018D58937613C8AE4CA",
        "\0",
        "sampler46",
        "\0",
        "sampler50",
        "\0",
        "attribute vec4 _Color;",
        "attribute vec4 _MultiTexCoord0;",
        "precision mediump float;",
        "uniform sampler2D sampler46;",
        "uniform sampler2D sampler50;",
        "void vertex_hint () {",
        "  var0 = _Color;",
        "  var1 = _MultiTexCoord0;",
        "  var2 = _MultiTexCoord0;",
        "}",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  lowp vec2 tmpvar_6;",
        "  tmpvar_6.x = 0.0;",
        "  tmpvar_6.y = ((texture2D (sampler46, var2.xy).x * 0.5) * var0.w);",
        "  lowp vec4 tmpvar_7;",
        "  tmpvar_7 = texture2D (sampler50, (var1.xy + tmpvar_6));",
        "  gl_FragColor = tmpvar_7;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    {
      shaderRoot,
      pfxManifest: {
        items: [
          {
            relativePath: "Effects/Catherine/SUM/Catherine_SUM_B/Catherine_SUM_B.pfx",
            references: [{ relativePath: shaderRel, kind: "shadergraph", surfaceIndex: 110 }],
            surfaceRecords: [
              {
                relativePath: shaderRel,
                recordLength: 350,
                prelude: { renderFamily: "billboard" },
                sampledFloats: [
                  { relativeOffset: 149, value: 0.25 },
                  { relativeOffset: 153, value: -1 },
                  { relativeOffset: 209, value: 1.5 },
                ],
              },
            ],
          },
        ],
      },
    },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvRuntimeEvidence, {
    kind: "pfx-surface-vertex-color-parameters",
    pfxPathCount: 1,
    surfaceRecordCount: 1,
    renderFamilies: ["billboard"],
    recordLengths: [350],
    parameterSampleOffsets: [149, 153, 209],
    vertexColorInputs: ["vertexColor.w"],
  });
  assert.equal(manifest.summary.previewUvRuntimeEvidenceRows, 1);
  assert.deepEqual(manifest.summary.byPreviewUvRuntimeEvidenceKind, {
    "pfx-surface-vertex-color-parameters": 1,
  });
  assert.deepEqual(manifest.summary.byPreviewUvRuntimeEvidenceInput, { "vertexColor.w": 1 });

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvRuntimeEvidenceKind, "pfx-surface-vertex-color-parameters");
  assert.equal(rows[0].previewUvRuntimeEvidenceInputs, "vertexColor.w");
  assert.equal(rows[0].previewUvRuntimeEvidenceOffsets, "149|153|209");
});

test("buildEffectShadergraphMaterialManifest extracts same-component swizzle scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-swizzle-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero014/SNW/Celeste_SNW_AA/Celeste_SNW_AA.Surface[197].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "varying vec4 var2;",
      "void swizzle_scroll_hint () {",
      "  lowp vec4 tmpvar_8;",
      "  tmpvar_8 = texture2D (sampler15, (var1.xy + var2.zz));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [1, 1],
    offset: [0, 0],
    offsetVariable: "var2.zz",
    phaseSource: "var2.z",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);

  const rows = reportRowsForManifest(manifest);
  assert.equal(rows[0].previewUvAnimationMode, "scroll");
  assert.equal(rows[0].previewUvScroll, "1,1");
});

test("buildEffectShadergraphMaterialManifest extracts negative component scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-negative-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Cards/Ghost_Common.assetbundle/Ghost_Common.Surface[23].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void negative_scroll_hint () {",
      "  vec2 tmpvar_1;",
      "  tmpvar_1.x = var1.w;",
      "  tmpvar_1.y = -(var1.w);",
      "  lowp vec4 tmpvar_2;",
      "  tmpvar_2 = texture2D (sampler15, (var0.xy + tmpvar_1));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [1, -1],
    offset: [0, 0],
    offsetVariable: "tmpvar_1",
    phaseSource: "var1.w",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts scroll UV hints through scalar aliases", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-scalar-alias-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero009/FX/Hero009_Weakness/Hero009_Weakness.Surface[29].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var1;",
      "void scalar_alias_scroll_hint () {",
      "  float cse_2;",
      "  cse_2 = var1.w;",
      "  float tmpvar_21;",
      "  tmpvar_21 = -(var1.w);",
      "  vec2 tmpvar_22;",
      "  tmpvar_22.x = cse_2;",
      "  tmpvar_22.y = tmpvar_21;",
      "  lowp vec4 tmpvar_23;",
      "  tmpvar_23 = texture2D (sampler15, (var0.xy + tmpvar_22));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [1, -1],
    offset: [0, 0],
    offsetVariable: "tmpvar_22",
    phaseSource: "var1.w",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts additive linear phase scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-linear-phase-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Adagio/S2/Adagio_S2_ProjectileImpact/Adagio_S2_ProjectileImpact.Surface[141].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var2;",
      "void additive_linear_phase_scroll_hint () {",
      "  lowp vec3 tmpvar_2;",
      "  tmpvar_2.x = 0.25;",
      "  lowp vec2 tmpvar_3;",
      "  tmpvar_3.x = (tmpvar_2.x + (var2.x * 0.2));",
      "  tmpvar_3.y = (tmpvar_2.x + (var2.x * -0.5));",
      "  lowp vec4 tmpvar_4;",
      "  tmpvar_4 = texture2D (sampler15, (var0.xy + tmpvar_3));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0.2, -0.5],
    offset: [0, 0],
    offsetVariable: "tmpvar_3",
    phaseSource: "var2.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts additive unit phase scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-unit-phase-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Cards/Back_Idle_A.assetbundle/Bacl_Idle_A.Surface[51].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "varying vec4 var2;",
      "void additive_unit_phase_scroll_hint () {",
      "  lowp vec3 tmpvar_2;",
      "  tmpvar_2.x = 0.25;",
      "  lowp vec2 tmpvar_3;",
      "  tmpvar_3.x = (tmpvar_2.x + var2.x);",
      "  tmpvar_3.y = (tmpvar_2.x + var2.x);",
      "  lowp vec4 tmpvar_4;",
      "  tmpvar_4 = texture2D (sampler15, (var0.xy + tmpvar_3));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [1, 1],
    offset: [0, 0],
    offsetVariable: "tmpvar_3",
    phaseSource: "var2.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest extracts nested noise vec2 phase scroll UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-nested-noise-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/5V5/Turret/Turret_Shield_Aura/Turret_Shield_Aura.Surface[52].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  writeShadergraph(shaderPath);
  fs.appendFileSync(
    shaderPath,
    [
      "uniform sampler2D sampler31;",
      "varying vec4 var1;",
      "varying vec4 var2;",
      "void nested_noise_scroll_hint () {",
      "  lowp vec4 tmpvar_1;",
      "  tmpvar_1 = texture2D (sampler15, (var0.xy + vec2(((texture2D (sampler31, var1.xy).z - 1.0) * (0.5 * var2.x)))));",
      "}",
    ].join(""),
    "latin1",
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [0.5, 0.5],
    offset: [0, 0],
    offsetVariable: "vec2",
    phaseSource: "var2.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest falls back to outer animated samplers for UV preview hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-outer-sampler-scroll-uv-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Cards/Epic_Front.assetbundle/Epic_Front.Surface[65].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "5EBB02E305CF44A20196F2DC72ED2C97",
        "\0",
        "14D9565D2301499C828424C86BC793D3",
        "\0",
        "sampler44",
        "\0",
        "sampler74",
        "\0",
        "precision mediump float;",
        "uniform sampler2D sampler44;",
        "uniform sampler2D sampler74;",
        "varying vec4 var0;",
        "varying vec4 var1;",
        "varying vec4 var2;",
        "void main () {",
        "  vec2 tmpvar_1;",
        "  tmpvar_1 = (var1.xy + vec2(1.0, 0.0));",
        "  lowp vec3 tmpvar_2;",
        "  tmpvar_2.x = texture2D (sampler44, tmpvar_1).x;",
        "  tmpvar_2.y = 0.0;",
        "  tmpvar_2.z = 0.0;",
        "  lowp vec4 tmpvar_3;",
        "  tmpvar_3 = texture2D (sampler74, (var0.xy + vec2((((vec3(-1.0, 0.0, 0.0) + ((tmpvar_2 / vec3(1.0, 0.0, 0.0)) * vec3(2.0, 0.0, 0.0))).x * 0.2) + (var2.x * -0.2)))));",
        "  gl_FragColor = tmpvar_3;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].roles.uvAnimation.sampler, "sampler44");
  assert.deepEqual(manifest.items[0].previewUvAnimation, {
    mode: "scroll",
    speed: [-0.2, -0.2],
    offset: [0, 0],
    offsetVariable: "vec2",
    phaseSource: "var2.x",
  });
  assert.equal(manifest.summary.previewUvAnimationRows, 1);
});

test("buildEffectShadergraphMaterialManifest classifies vertex color passthrough effects", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-vertex-color-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Catherine/S2/Catherine_S2_A_Impact/Catherine_S2_A_Impact.Surface[135].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "precision highp float;",
        "attribute vec4 _Color;",
        "varying vec4 var0;",
        "void main () {",
        "  var0 = _Color;",
        "}",
        "\0",
        "precision mediump float;",
        "varying vec4 var0;",
        "void main () {",
        "  vec4 tmpvar_1;",
        "  tmpvar_1.xyz = var0.xyz;",
        "  tmpvar_1.w = 1.0;",
        "  gl_FragColor = tmpvar_1;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].roleNames, ["vertexColor"]);
  assert.equal(manifest.summary.byRole.vertexColor, 1);
  assert.equal(reportRowsForManifest(manifest)[0].roleNames, "vertexColor");
});

test("buildEffectShadergraphMaterialManifest classifies uniform color alpha effects", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-effect-shadergraph-uniform-color-"));
  const shaderRoot = path.join(tempDir, "effects_shadergraphs");
  const shaderRel = "Effects/Hero000/Hero000_Rectangle/Hero000_Rectangle.Surface[3].shadergraph";
  const shaderPath = path.join(shaderRoot, shaderRel);
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.writeFileSync(
    shaderPath,
    Buffer.from(
      [
        "RSC0\0",
        "precision mediump float;",
        "uniform vec3 unif4;",
        "uniform float unif6;",
        "void main () {",
        "  vec4 tmpvar_1;",
        "  tmpvar_1.xyz = unif4;",
        "  tmpvar_1.w = unif6;",
        "  gl_FragColor = tmpvar_1;",
        "}",
      ].join(""),
      "latin1",
    ),
  );

  const manifest = buildEffectShadergraphMaterialManifest(
    [{ status: "FOUND", relativePath: shaderRel, hash: "SHADER_HASH", filePath: shaderPath }],
    { shaderRoot },
    "2026-06-25T00:00:00.000Z",
  );

  assert.equal(manifest.items[0].materialStatus, "classified");
  assert.deepEqual(manifest.items[0].roleNames, ["alphaBlend", "uniformColor"]);
  assert.equal(manifest.summary.byRole.uniformColor, 1);
  assert.equal(reportRowsForManifest(manifest)[0].roleNames, "alphaBlend|uniformColor");
});
