const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeAttachmentEffectResources,
  effectBasename,
  effectKey,
  exportAttachmentEffectResourceBridge,
  runtimeHookResourceMatchesForToken,
  resourceMatchesForToken,
} = require("../tools/attachment_effect_resource_bridge");

const eventBridgeRows = [
  {
    token: "Effect_Crisis_Weapon",
    bridgeStatus: "native-only",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android|ios",
    nativeFunctions: "ios:FUN_1003efa60",
    nativeSemanticCalls: "effect-bind",
  },
  {
    token: "Effect_Baron_Weapon_Idle",
    bridgeStatus: "native-only",
    nativeRoles: "weapon-effect-hook",
    nativePlatforms: "android",
    nativeFunctions: "android:FUN_00db01ec",
    nativeSemanticCalls: "effect-bind",
  },
  {
    token: "Effect_Rona_Weapon",
    bridgeStatus: "native-and-definition",
    nativeRoles: "weapon-effect-hook",
  },
];

const effectRows = [
  {
    relativePath: "Effects/Items/Crisis_Weapon.assetbundle/Crisis_Weapon.pfx",
    hash: "CRISIS",
  },
  {
    relativePath: "Effects/Items/Crisis_Weapon_Con/Crisis_Weapon_Con.pfx",
    hash: "CRISIS_CON",
  },
];

const effectHookManifest = {
  items: [
    {
      token: "Effect_LanceBall_Lance_A_Weapon",
      effectToken: "Effect_LanceBall_Lance_A_Cast",
      aliasEvidenceStrength: "strong",
      resourceEvidenceSource: "native-effect-hook-builder",
      resourcePaths: ["Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx"],
    },
    {
      token: "Effect_Shin_Weapon_Head",
      effectToken: "Effect_Shin_Weapon_Head",
      aliasEvidenceStrength: "weak",
      resourceEvidenceSource: "effect-resource-candidate",
      resourcePaths: ["Effects/Hero070/DefaultSkin/Hero070_Weaponfx/Hero070_Weaponfx.pfx"],
    },
  ],
};

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("effect token helpers normalize native effect names and resource basenames", () => {
  assert.equal(effectKey("Effect_Crisis_Weapon"), "Crisis_Weapon");
  assert.equal(effectBasename("Effects/Items/Crisis_Weapon.assetbundle/Crisis_Weapon.pfx"), "Crisis_Weapon");
});

test("resourceMatchesForToken prefers exact pfx basename matches", () => {
  const result = resourceMatchesForToken("Effect_Crisis_Weapon", effectRows);
  assert.equal(result.matchKind, "exact-basename");
  assert.deepEqual(result.matches.map((row) => row.hash), ["CRISIS"]);

  const unmatched = resourceMatchesForToken("Effect_Baron_Weapon_Idle", effectRows);
  assert.equal(unmatched.matchKind, "none");
  assert.equal(unmatched.matches.length, 0);
});

test("resourceMatchesForToken confirms unique compact pfx basename matches", () => {
  const result = resourceMatchesForToken("Effect_TurretSpotlight", [
    {
      relativePath: "Effects/5V5/Turret/Turret_Spotlight/Turret_Spotlight.pfx",
      hash: "TURRET_SPOTLIGHT",
    },
    {
      relativePath: "Effects/Turret/TurretLaser.assetbundle/TurretLaser.pfx",
      hash: "TURRET_LASER",
    },
  ]);

  assert.equal(result.matchKind, "compact-basename");
  assert.deepEqual(result.matches.map((row) => row.hash), ["TURRET_SPOTLIGHT"]);
});

test("runtimeHookResourceMatchesForToken uses confirmed native hook resources only", () => {
  const matched = runtimeHookResourceMatchesForToken("Effect_LanceBall_Lance_A_Weapon", effectHookManifest.items);
  assert.equal(matched.matchKind, "native-effect-hook-runtime-resource");
  assert.deepEqual(matched.matches.map((row) => row.relativePath), [
    "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
  ]);
  assert.deepEqual(matched.evidenceStrengths, ["strong"]);
  assert.deepEqual(matched.evidenceSources, ["native-effect-hook-builder"]);

  const weak = runtimeHookResourceMatchesForToken("Effect_Shin_Weapon_Head", effectHookManifest.items);
  assert.equal(weak.matchKind, "none");
  assert.deepEqual(weak.matches, []);
});

test("bridgeAttachmentEffectResources maps native-only effect tokens to pfx resources", () => {
  const rows = bridgeAttachmentEffectResources(
    [
      ...eventBridgeRows,
      {
        token: "Effect_LanceBall_Lance_A_Weapon",
        bridgeStatus: "native-only",
        nativeRoles: "weapon-effect-hook",
      },
    ],
    effectRows,
    { effectHookManifest },
  );
  assert.equal(rows.length, 3);

  const matched = rows.find((row) => row.token === "Effect_Crisis_Weapon");
  assert.equal(matched.resourceStatus, "resource-matched");
  assert.equal(matched.resourcePaths, "Effects/Items/Crisis_Weapon.assetbundle/Crisis_Weapon.pfx");

  const runtimeMatched = rows.find((row) => row.token === "Effect_LanceBall_Lance_A_Weapon");
  assert.equal(runtimeMatched.resourceStatus, "resource-matched");
  assert.equal(runtimeMatched.matchKind, "native-effect-hook-runtime-resource");
  assert.equal(runtimeMatched.resourcePaths, "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx");

  const unmatched = rows.find((row) => row.token === "Effect_Baron_Weapon_Idle");
  assert.equal(unmatched.resourceStatus, "resource-unmatched");
});

test("attachment effect resource bridge exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-attachment-effect-resource-"));
  const bridgePath = path.join(tempDir, "bridge.tsv");
  const effectsPath = path.join(tempDir, "effects.tsv");
  writeRows(
    bridgePath,
    ["token", "bridgeStatus", "nativeRoles", "nativePlatforms", "nativeFunctions", "nativeSemanticCalls"],
    eventBridgeRows,
  );
  writeRows(effectsPath, ["category", "relativePath", "hash"], effectRows);

  const summary = exportAttachmentEffectResourceBridge({
    bridgePath,
    effectResourcePath: effectsPath,
    effectHookManifestPath: path.join(tempDir, "missing-effect-hooks.json"),
    tsvOut: path.join(tempDir, "attachment_effect_resource_bridge.tsv"),
    jsonOut: path.join(tempDir, "attachment_effect_resource_bridge_summary.json"),
  });

  assert.equal(summary.nativeOnlyEffectTokens, 2);
  assert.equal(summary.byStatus["resource-matched"], 1);
  assert.deepEqual(summary.unmatchedTokens, ["Effect_Baron_Weapon_Idle"]);
  assert.match(fs.readFileSync(path.join(tempDir, "attachment_effect_resource_bridge.tsv"), "utf8"), /Crisis_Weapon\.pfx/);
});
