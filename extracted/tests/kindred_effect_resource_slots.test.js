const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildKindredEffectResourceSlots,
  exportKindredEffectResourceSlots,
  heroLabelForModelLabel,
  inferEffectResourceRole,
  inferResourceActionKeys,
  isHeroSkinEffectLabel,
  reportRowsForManifest,
} = require("../tools/kindred_effect_resource_slots");

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("buildKindredEffectResourceSlots extracts deduped skin-group effect resources from decoded KindredEffects strings", () => {
  const rows = [
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      semantic: "label",
      labelBefore: "Ringo_Skin_Pirate",
      value: "Adagio_DefaultSkin",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "568",
      semantic: "resource",
      labelBefore: "Adagio_DefaultSkin",
      value: "build://Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "1",
      stringIndex: "568",
      semantic: "resource",
      labelBefore: "Adagio_DefaultSkin",
      value: "build://Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "1",
      stringIndex: "120",
      semantic: "resource",
      labelBefore: "Warhawk_Skin_CNY",
      value: "build://Effects/Hero065/CNY/Hero065_CNY_B_Grenade_Proj/Hero065_CNY_B_Grenade_Proj.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Hero065/CNY/Hero065_CNY_B_Grenade_Proj/Hero065_CNY_B_Grenade_Proj.pfx",
    },
    {
      relativePath: "Characters/Adagio/Adagio.def",
      blockIndex: "0",
      stringIndex: "1",
      semantic: "resource",
      labelBefore: "Adagio_DefaultSkin",
      value: "build://Effects/Adagio/ShouldNotAppear.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Adagio/ShouldNotAppear.pfx",
    },
  ];

  const manifest = buildKindredEffectResourceSlots(rows, "TEST_DATE");

  assert.equal(isHeroSkinEffectLabel("Adagio_DefaultSkin"), true);
  assert.equal(isHeroSkinEffectLabel("Warhawk_Skin_CNY"), true);
  assert.equal(isHeroSkinEffectLabel("common"), false);
  assert.equal(heroLabelForModelLabel("Warhawk_Skin_CNY"), "Warhawk");
  assert.deepEqual(inferResourceActionKeys("Effects/Hero065/CNY/Hero065_CNY_B_Grenade_Proj/Hero065_CNY_B_Grenade_Proj.pfx"), ["ability02"]);
  assert.equal(inferEffectResourceRole("Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx"), "cast");

  assert.equal(manifest.generatedAt, "TEST_DATE");
  assert.equal(manifest.summary.rows, 2);
  assert.equal(manifest.summary.modelLabels, 2);
  assert.equal(manifest.summary.defaultSkinRows, 1);
  assert.equal(manifest.summary.skinRows, 1);
  assert.deepEqual(manifest.items.map((item) => item.modelLabel), ["Adagio_DefaultSkin", "Warhawk_Skin_CNY"]);
  assert.deepEqual(manifest.items[0], {
    id: "kindred-effect-slot:Adagio_DefaultSkin:Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
    sourceKind: "kindred-effect-resource-slot",
    sourceDefinitionPath: "Effects/KindredEffects.def",
    modelLabel: "Adagio_DefaultSkin",
    heroLabel: "Adagio",
    skinKind: "default",
    role: "cast",
    actionKeys: [],
    resourcePath: "Effects/Adagio/AdagioHealCast.assetbundle/Adagio_Heal_Cast.pfx",
    resourceStem: "Adagio_Heal_Cast",
    resourceRoot: "Adagio",
    blockIndexes: ["0", "1"],
    firstStringIndex: 568,
  });
});

test("buildKindredEffectResourceSlots keeps internal effect groups inside the active skin context", () => {
  const rows = [
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "100",
      semantic: "label",
      labelBefore: "Grace_Skin_Wonderland",
      value: "Baptiste_DefaultSkin",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "101",
      semantic: "resource",
      labelBefore: "Baptiste_DefaultSkin",
      value: "build://Effects/Hero040/Hero040_AA/Hero040_AA.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Hero040/Hero040_AA/Hero040_AA.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "102",
      semantic: "label",
      labelBefore: "Baptiste_DefaultSkin",
      value: "1I<+",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "103",
      semantic: "resource",
      labelBefore: "1I<+",
      value: "build://Effects/Hero040/Hero040_B_Tether/Hero040_B_Tether.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Hero040/Hero040_B_Tether/Hero040_B_Tether.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "104",
      semantic: "resource",
      labelBefore: "1I<+",
      value: "build://Effects/Hero999/ShouldNotLeak/ShouldNotLeak.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/Hero999/ShouldNotLeak/ShouldNotLeak.pfx",
    },
  ];

  const manifest = buildKindredEffectResourceSlots(rows, "TEST_DATE");
  const paths = manifest.items.map((item) => item.resourcePath);

  assert.equal(manifest.summary.rows, 2);
  assert.equal(manifest.summary.byHero.Baptiste, 2);
  assert.deepEqual(paths, [
    "Effects/Hero040/Hero040_AA/Hero040_AA.pfx",
    "Effects/Hero040/Hero040_B_Tether/Hero040_B_Tether.pfx",
  ]);
  assert.equal(
    manifest.items.find((item) => item.resourcePath.endsWith("Hero040_B_Tether.pfx")).modelLabel,
    "Baptiste_DefaultSkin",
  );
});

test("buildKindredEffectResourceSlots extracts global KindredEffects resource groups", () => {
  const rows = [
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "372",
      semantic: "label",
      labelBefore: "turrets",
      value: "minions",
      resourceCategory: "",
      targetRelativePath: "",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "380",
      semantic: "resource",
      labelBefore: "minions",
      value: "build://Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "1",
      stringIndex: "380",
      semantic: "resource",
      labelBefore: "minions",
      value: "build://Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
    },
    {
      relativePath: "Effects/KindredEffects.def",
      blockIndex: "0",
      stringIndex: "381",
      semantic: "resource",
      labelBefore: "minions",
      value: "build://Effects/LeadMinion/Minion_L_Proj_Hit.assetbundle/Minion_L_Proj_Hit.pfx",
      resourceCategory: "effect",
      targetRelativePath: "Effects/LeadMinion/Minion_L_Proj_Hit.assetbundle/Minion_L_Proj_Hit.pfx",
    },
  ];

  const manifest = buildKindredEffectResourceSlots(rows, "TEST_DATE");

  assert.equal(manifest.summary.rows, 2);
  assert.equal(manifest.summary.globalRows, 2);
  assert.deepEqual(manifest.items.map((item) => item.groupLabel), ["minions", "minions"]);
  assert.deepEqual(manifest.items.map((item) => item.skinKind), ["global", "global"]);
  assert.deepEqual(manifest.items.find((item) => item.resourcePath.endsWith("Minion_L_Proj.pfx")), {
    id: "kindred-global-effect-slot:minions:Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
    sourceKind: "kindred-global-effect-resource-slot",
    sourceDefinitionPath: "Effects/KindredEffects.def",
    groupLabel: "minions",
    modelLabel: "",
    heroLabel: "",
    skinKind: "global",
    role: "projectile",
    actionKeys: [],
    resourcePath: "Effects/LeadMinion/Minion_L_Proj.assetbundle/Minion_L_Proj.pfx",
    resourceStem: "Minion_L_Proj",
    resourceRoot: "LeadMinion",
    blockIndexes: ["0", "1"],
    firstStringIndex: 380,
  });
});

test("exportKindredEffectResourceSlots writes viewer manifest and reports", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kindred-effect-slots-"));
  const sourcePath = path.join(tempDir, "definition_instance_strings.tsv");
  writeRows(
    sourcePath,
    ["relativePath", "blockIndex", "stringIndex", "semantic", "labelBefore", "value", "resourceCategory", "targetRelativePath"],
    [
      {
        relativePath: "Effects/KindredEffects.def",
        blockIndex: "0",
        stringIndex: "12",
        semantic: "resource",
        labelBefore: "Anka_DefaultSkin",
        value: "build://Effects/Hero054/Hero054_A_Proj_Hit/Hero054_A_Proj_Hit.pfx",
        resourceCategory: "effect",
        targetRelativePath: "Effects/Hero054/Hero054_A_Proj_Hit/Hero054_A_Proj_Hit.pfx",
      },
    ],
  );

  const viewerOut = path.join(tempDir, "kindred-effect-resource-slots.json");
  const tsvOut = path.join(tempDir, "kindred_effect_resource_slots.tsv");
  const jsonOut = path.join(tempDir, "kindred_effect_resource_slots_summary.json");
  const summary = exportKindredEffectResourceSlots({ sourcePath, viewerOut, tsvOut, jsonOut });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Hero054_A_Proj_Hit/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /impact/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.rows, 1);
  assert.equal(reportRowsForManifest(JSON.parse(fs.readFileSync(viewerOut, "utf8")))[0].role, "impact");
});
