const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeSkinVariantAliasRows,
  exportRuntimeSkinVariantAliases,
} = require("../tools/runtime_skin_variant_aliases");

const skinCatalog = {
  skins: {
    Catherine_Skin_Summer: {
      id: "Catherine_Skin_Summer",
      fallbackLabel: "Catherine_Summer",
      zhCN: "夏日 凯瑟琳",
    },
    Catherine_Skin_Summer_Blue: {
      id: "Catherine_Skin_Summer_Blue",
      fallbackLabel: "Catherine_Summer_Blue",
      zhCN: "夏日冲浪 凯瑟琳",
    },
    Catherine_Skin_Summer_Orange: {
      id: "Catherine_Skin_Summer_Orange",
      fallbackLabel: "Catherine_Summer_Orange",
      zhCN: "海岸巡逻 凯瑟琳",
    },
    Ringo_Skin_Pirate: {
      id: "Ringo_Skin_Pirate",
      fallbackLabel: "Ringo_Pirate",
      zhCN: "海盗船长 林戈",
    },
  },
};

const skinnedItems = [
  {
    rel: "Characters/Catherine/Art/catherine_summer.glb",
    character: "Catherine",
    modelLabel: "Catherine_Skin_Summer",
    sourceRelativePath: "Characters/Catherine/Catherine.def",
    materialCount: 4,
    texturedMaterialCount: 3,
  },
  {
    rel: "Characters/Ringo/Art/ringo_pirate.glb",
    character: "Ringo",
    modelLabel: "Ringo_Skin_Pirate",
    sourceRelativePath: "Characters/Ringo/Ringo.def",
    materialCount: 4,
    texturedMaterialCount: 4,
  },
];

const skinEffectAliases = {
  items: [
    {
      modelLabel: "Catherine_Skin_Summer_Blue",
      sourceEffectToken: "Effect_Catherine_Attack",
      skinEffectToken: "Effect_Catherine_SUM_Attack",
      relativePath: "Characters/Catherine/Catherine.def",
      evidence: "cff0-adjacent-effect-pair",
    },
    {
      modelLabel: "Catherine_Skin_Summer_Orange",
      sourceEffectToken: "Effect_Catherine_Attack",
      skinEffectToken: "Effect_Catherine_SUM_Attack",
      relativePath: "Characters/Catherine/Catherine.def",
      evidence: "cff0-adjacent-effect-pair",
    },
  ],
};

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("buildRuntimeSkinVariantAliasRows maps configured chroma skin ids to their shared rendered GLB", () => {
  const rows = buildRuntimeSkinVariantAliasRows({
    skinCatalog,
    skinnedItems,
    skinEffectAliasItems: skinEffectAliases.items,
  });

  assert.deepEqual(
    rows.map((row) => [row.skinId, row.baseModelLabel, row.rel, row.evidence]),
    [
      [
        "Catherine_Skin_Summer_Blue",
        "Catherine_Skin_Summer",
        "Characters/Catherine/Art/catherine_summer.glb",
        "skin-effect-alias-prefix-shared-glb",
      ],
      [
        "Catherine_Skin_Summer_Orange",
        "Catherine_Skin_Summer",
        "Characters/Catherine/Art/catherine_summer.glb",
        "skin-effect-alias-prefix-shared-glb",
      ],
    ],
  );
  assert.equal(rows[0].effectAliasRows, 1);
  assert.equal(rows[0].zhCN, "夏日冲浪 凯瑟琳");
});

test("exportRuntimeSkinVariantAliases writes viewer JSON and report TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skin-variant-aliases-"));
  const paths = {
    skinCatalogPath: path.join(tempDir, "skin-catalog.json"),
    skinnedManifestPath: path.join(tempDir, "skinned.json"),
    skinEffectAliasPath: path.join(tempDir, "skin-effect-aliases.json"),
    viewerOut: path.join(tempDir, "runtime-skin-variant-aliases.json"),
    tsvOut: path.join(tempDir, "runtime_skin_variant_aliases.tsv"),
  };

  writeJson(paths.skinCatalogPath, skinCatalog);
  writeJson(paths.skinnedManifestPath, { items: skinnedItems });
  writeJson(paths.skinEffectAliasPath, skinEffectAliases);

  const summary = exportRuntimeSkinVariantAliases(paths);
  const viewer = JSON.parse(fs.readFileSync(paths.viewerOut, "utf8"));

  assert.equal(summary.rows, 2);
  assert.equal(summary.models, 1);
  assert.match(fs.readFileSync(paths.tsvOut, "utf8"), /Catherine_Skin_Summer_Blue/);
  assert.equal(viewer.items[0].baseModelLabel, "Catherine_Skin_Summer");
});
