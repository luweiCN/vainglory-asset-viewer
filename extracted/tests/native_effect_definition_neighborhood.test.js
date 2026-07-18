const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildNativeEffectDefinitionNeighborhoodReport,
  exportNativeEffectDefinitionNeighborhoodReport,
  reportRowsForManifest,
} = require("../tools/native_effect_definition_neighborhood");

test("buildNativeEffectDefinitionNeighborhoodReport links native nearby tokens to definition windows and pfx hooks", () => {
  const report = buildNativeEffectDefinitionNeighborhoodReport(
    {
      runtimeGapReport: {
        items: [
          {
            reason: "native-effect-channel-resource-unresolved",
            sourceKind: "native-effect-vcall",
            effectToken: "Effect_Kestrel_C_Aiming",
            actionKeys: ["ability03"],
            heroNames: ["Kestrel"],
            nativeNearbyEffectTokens: ["Effect_Kestrel_C_Charging"],
            nativeNearbySoundTokens: ["Sound_Kestrel_Ability_C_Activate"],
            source: { functionName: "FUN_KESTREL_C", line: 210 },
          },
        ],
      },
      definitionStringRows: [
        {
          relativePath: "Characters/Hero023/Kestrel.def",
          blockIndex: "0",
          stringIndex: "10",
          labelBefore: "Effect_Kestrel_Trap_Ignite",
          value: "Effect_Kestrel_C_Aiming",
        },
        {
          relativePath: "Characters/Hero023/Kestrel.def",
          blockIndex: "0",
          stringIndex: "11",
          labelBefore: "Effect_Kestrel_C_Aiming",
          value: "Effect_Kestrel_C_Charging",
        },
        {
          relativePath: "Characters/Hero023/Kestrel.def",
          blockIndex: "0",
          stringIndex: "12",
          labelBefore: "Effect_Kestrel_C_Charging",
          value: "Sound_Kestrel_Ability_C_Activate",
        },
        {
          relativePath: "Characters/Hero023/Kestrel.def",
          blockIndex: "0",
          stringIndex: "13",
          labelBefore: "Sound_Kestrel_Ability_C_Activate",
          value: "build://Sounds/Kestrel/SFX/Default/kestrel_c_activate.mp3",
          resourceCategory: "audio",
          targetRelativePath: "Sounds/Kestrel/SFX/Default/kestrel_c_activate.mp3",
        },
      ],
      pfxResourceRows: [
        {
          relativePath: "Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx",
          intrinsicEffectTokens: "Effect_Kestrel_C_Charging",
          hookEffectTokens: "Effect_Kestrel_C_Charging",
        },
      ],
      kindredSlots: [
        {
          modelLabel: "Kestrel_DefaultSkin",
          heroLabel: "Kestrel",
          role: "cast",
          actionKeys: ["ability03"],
          resourcePath: "Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx",
        },
      ],
    },
    "TEST_DATE",
  );

  assert.equal(report.generatedAt, "TEST_DATE");
  assert.equal(report.summary.rows, 3);
  assert.equal(report.summary.definitionLinkedRows, 3);
  assert.equal(report.summary.pfxLinkedRows, 1);
  assert.equal(report.summary.sourcePfxLinkedRows, 0);
  assert.equal(report.summary.nearbyPfxLinkedRows, 1);
  assert.equal(report.summary.pfxSlotLinkedRows, 1);
  assert.deepEqual(report.summary.byPfxPromotionClass, { "nearby-action-matched": 1 });
  assert.equal(report.summary.byTokenKind["source-effect"], 1);
  assert.equal(report.summary.byTokenKind["nearby-effect"], 1);
  assert.equal(report.summary.byTokenKind["nearby-sound"], 1);

  const sourceEffect = report.items.find((item) => item.token === "Effect_Kestrel_C_Aiming");
  assert.equal(sourceEffect.tokenKind, "source-effect");
  assert.deepEqual(sourceEffect.definitionPaths, ["Characters/Hero023/Kestrel.def"]);
  assert.deepEqual(sourceEffect.definitionWindowTokens, [
    "Effect_Kestrel_Trap_Ignite",
    "Effect_Kestrel_C_Aiming",
    "Effect_Kestrel_C_Charging",
    "Sound_Kestrel_Ability_C_Activate",
  ]);

  const nearbyEffect = report.items.find((item) => item.token === "Effect_Kestrel_C_Charging");
  assert.equal(nearbyEffect.pfxLinkKind, "nearby-token");
  assert.equal(nearbyEffect.pfxPromotionClass, "nearby-action-matched");
  assert.deepEqual(nearbyEffect.pfxResourcePaths, [
    "Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx",
  ]);
  assert.deepEqual(nearbyEffect.pfxModelLabels, ["Kestrel_DefaultSkin"]);
  assert.deepEqual(nearbyEffect.pfxRoles, ["cast"]);
  assert.deepEqual(nearbyEffect.pfxActionKeys, ["ability03"]);
  assert.deepEqual(nearbyEffect.definitionResourcePaths, [
    "Sounds/Kestrel/SFX/Default/kestrel_c_activate.mp3",
  ]);

  const rows = reportRowsForManifest(report);
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxResourcePaths, "Effects/Hero023/Hero023_C_Charging.assetbundle/Hero023_C_Charging.pfx");
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxLinkKind, "nearby-token");
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxPromotionClass, "nearby-action-matched");
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxModelLabels, "Kestrel_DefaultSkin");
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxRoles, "cast");
  assert.equal(rows.find((row) => row.token === "Effect_Kestrel_C_Charging").pfxActionKeys, "ability03");
  assert.equal(rows.find((row) => row.token === "Sound_Kestrel_Ability_C_Activate").definitionResourcePaths, "Sounds/Kestrel/SFX/Default/kestrel_c_activate.mp3");
});

test("exportNativeEffectDefinitionNeighborhoodReport writes viewer and audit reports", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-effect-definition-neighborhood-"));
  const gapPath = path.join(dir, "effect-runtime-gaps.json");
  const definitionPath = path.join(dir, "definition_instance_strings.tsv");
  const pfxPath = path.join(dir, "effect_pfx_resource_manifest.tsv");
  const viewerOut = path.join(dir, "native-effect-definition-neighborhood.json");
  const tsvOut = path.join(dir, "native_effect_definition_neighborhood.tsv");
  const jsonOut = path.join(dir, "native_effect_definition_neighborhood_summary.json");

  fs.writeFileSync(
    gapPath,
    `${JSON.stringify({
      items: [
        {
          effectToken: "Effect_Miho_B_Stance_Warning",
          nativeNearbyBuffTokens: ["Buff_Miho_C_PFX"],
          source: { functionName: "FUN_MIHO", line: 90 },
        },
      ],
    })}\n`,
  );
  fs.writeFileSync(
    definitionPath,
    [
      "relativePath\tblockIndex\tstringIndex\tlabelBefore\tvalue\tresourceCategory\ttargetRelativePath",
      "Buffs/KindredBuffs.def\t0\t1\tBuff_Miho_C_ApplyDamage\tBuff_Miho_C_PFX\t\t",
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    pfxPath,
    [
      "relativePath\tintrinsicEffectTokens\thookEffectTokens",
      "Effects/Hero066/Hero066_CenterWave/Hero066_CenterWave.pfx\tBuff_Miho_C_PFX\tBuff_Miho_C_PFX",
    ].join("\n") + "\n",
  );

  const summary = exportNativeEffectDefinitionNeighborhoodReport({
    runtimeGapPath: gapPath,
    definitionStringsPath: definitionPath,
    pfxResourcePath: pfxPath,
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.nearbyPfxLinkedRows, 1);
  assert.equal(JSON.parse(fs.readFileSync(viewerOut, "utf8")).items.length, 2);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Buff_Miho_C_PFX/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.pfxLinkedRows, 1);
});
