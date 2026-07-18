const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildCff0EffectInstanceGraph,
  exportCff0EffectInstanceGraph,
  reportRowsForManifest,
} = require("../tools/cff0_effect_instance_graph");

const objectRefRows = [
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1120",
    ownerLocalFieldOffset: "120",
    targetObjectOffset: "2000",
    targetFieldCount: "6",
    targetLabels: "0:Effect_Ringo_AA|4:Effect_Ringo_AA|72:Effect_Ringo_AA_Impact",
    targetEffects: "Effect_Ringo_AA|Effect_Ringo_AA_Impact",
    targetAnimations: "Characters/Ringo/Art/ringo.attack.anim",
    targetAudios: "Sounds/Ringo/SFX/ringo_attack.mp3",
    targetBones: "Bone_RightHand",
    targetBindTokens: "GunMuzzle",
    targetObjectRefs: "8->2100",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1124",
    ownerLocalFieldOffset: "124",
    targetObjectOffset: "2200",
    targetFieldCount: "2",
    targetLabels: "0:Idle",
    targetEffects: "",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1130",
    ownerLocalFieldOffset: "130",
    targetObjectOffset: "2300",
    targetFieldCount: "4",
    targetLabels: "0:Effect_Ringo_Twirl",
    targetEffects: "Effect_Ringo_Twirl",
    targetObjectRefs: "4->2400",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1140",
    ownerLocalFieldOffset: "140",
    targetObjectOffset: "2500",
    targetFieldCount: "2",
    targetLabels: "0:Effect_Ringo_Channel",
    targetEffects: "Effect_Ringo_Channel",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1144",
    ownerLocalFieldOffset: "144",
    targetObjectOffset: "2600",
    targetFieldCount: "2",
    targetLabels: "0:Effect_Ringo_SkinProjectile",
    targetEffects: "Effect_Ringo_SkinProjectile",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/OtherHero/OtherHero.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "OtherHero_DefaultSkin",
    ownerRecordStartField: "3000",
    ownerFieldOffset: "3040",
    ownerLocalFieldOffset: "40",
    targetObjectOffset: "3500",
    targetFieldCount: "2",
    targetLabels: "0:Effect_Ringo_AA",
    targetEffects: "Effect_Ringo_AA",
  },
  {
    source: "cff0-ptch",
    relativePath: "Characters/Ringo/Ringo.def",
    blockIndex: "0",
    definitionFormatByte: "4",
    definitionVersionByte: "8",
    ownerLabel: "Ringo_DefaultSkin",
    ownerRecordStartField: "1000",
    ownerFieldOffset: "1134",
    ownerLocalFieldOffset: "134",
    targetObjectOffset: "2400",
    targetFieldCount: "3",
    targetLabels: "0:Ability02",
    targetEffects: "",
    targetAnimations: "Characters/Ringo/Art/ringo.twirl.anim",
    targetBones: "Bone_LeftHand",
    targetBindTokens: "GunMuzzle",
  },
];

const pfxRows = [
  {
    relativePath: "Effects/Ringo/Ringo_AA/Ringo_AA.pfx",
    intrinsicEffectTokens: "",
    hookEffectTokens: "Effect_Ringo_AA",
  },
  {
    relativePath: "Effects/Ringo/Ringo_AA_Impact/Ringo_AA_Impact.pfx",
    intrinsicEffectTokens: "Effect_Ringo_AA_Impact",
    hookEffectTokens: "",
  },
  {
    relativePath: "Effects/Ringo/Twirl/Ringo_Twirl.pfx",
    intrinsicEffectTokens: "Effect_Ringo_Twirl",
    hookEffectTokens: "",
  },
  {
    relativePath: "Effects/Ringo/Channel/Ringo_Channel.pfx",
    intrinsicEffectTokens: "Effect_Ringo_Channel",
    hookEffectTokens: "",
  },
  {
    relativePath: "Effects/Ringo/SkinProjectile/Ringo_SkinProjectile.pfx",
    intrinsicEffectTokens: "Effect_Ringo_SkinProjectile",
    hookEffectTokens: "",
  },
];

const hookRows = [
  {
    platform: "android",
    heroResourceRoots: "Ringo",
    resourceVariantModelLabels: "",
    effectToken: "Effect_Ringo_Twirl",
    actionKeys: "ability02",
    nativeActionNames: "Ability02_Cast",
    boneToken: "",
    runtimeBindingKind: "",
    runtimeBindingEvidence: "",
    locatorLabel: "Bone_LeftHand",
    bindHint: "locator",
    sourceKind: "native-effect-spawn",
    runtimeStartSeconds: "0.25",
  },
  {
    platform: "android",
    heroResourceRoots: "Ringo",
    resourceVariantModelLabels: "",
    effectToken: "Effect_Ringo_AA",
    actionKeys: "attack",
    nativeActionNames: "",
    boneToken: "Bone_RightHand",
    runtimeBindingKind: "bone",
    runtimeBindingEvidence: "native-visual-bone-token",
    locatorLabel: "",
    bindHint: "",
    sourceKind: "native-visual-binding",
    runtimeStartSeconds: "0",
  },
  {
    platform: "android",
    heroResourceRoots: "Ringo",
    resourceVariantModelLabels: "",
    effectToken: "Effect_Ringo_Channel",
    actionKeys: "ability01",
    nativeActionNames: "",
    boneToken: "",
    runtimeBindingKind: "effect-channel",
    runtimeBindingEvidence: "native-effect-only",
    locatorLabel: "",
    bindHint: "",
    resourcePaths: "Effects/Ringo/Native/Ringo_Native.pfx",
    shadergraphPaths: "Effects/Ringo/Native/Ringo_Native.Surface[0].shadergraph",
    sourceKind: "native-effect-spawn",
    runtimeStartSeconds: "0.1",
  },
  {
    platform: "android",
    heroResourceRoots: "Ringo",
    resourceVariantModelLabels: "",
    effectToken: "Effect_Ringo_ProjectileBase",
    actionKeys: "ability02",
    nativeActionNames: "",
    boneToken: "Bone_RightHand",
    runtimeBindingKind: "bone",
    runtimeBindingEvidence: "native-visual-bone-token",
    locatorLabel: "",
    bindHint: "",
    sourceKind: "native-visual-binding",
    runtimeStartSeconds: "0.2",
  },
];

const projectileRows = [
  {
    modelLabel: "Ringo_DefaultSkin",
    heroLabel: "Ringo",
    role: "projectile",
    actionKeys: "ability02",
    bindingStatus: "native-emitter-slot",
    bindingBoneToken: "Bone_LeftHand",
    nativeEmitterLabel: "GunMuzzle",
    runtimeStartSeconds: "0.15",
    nativeEffectHookTokens: "",
    effectTokens: "Effect_Ringo_Twirl|Effect_Ringo_Twirl_Alt",
    resourcePath: "Effects/Ringo/Twirl/Ringo_Twirl.pfx",
  },
  {
    modelLabel: "Ringo_DefaultSkin",
    heroLabel: "Ringo",
    role: "projectile",
    actionKeys: "ability02",
    bindingStatus: "native-effect-hook",
    bindingBoneToken: "",
    nativeEmitterLabel: "",
    runtimeStartSeconds: "",
    nativeEffectHookTokens: "Effect_Ringo_ProjectileBase",
    effectTokens: "Effect_Ringo_SkinProjectile",
    resourcePath: "Effects/Ringo/SkinProjectile/Ringo_SkinProjectile.pfx",
  },
];

test("buildCff0EffectInstanceGraph expands CFF0 effect object refs and joins PFX resources", () => {
  const manifest = buildCff0EffectInstanceGraph(
    { objectRefRows, pfxRows, hookRows, projectileRows },
    "2026-06-27T00:00:00.000Z",
  );

  assert.equal(manifest.summary.rows, 6);
  assert.equal(manifest.summary.ownerLabels, 2);
  assert.equal(manifest.summary.effectTokens, 5);
  assert.equal(manifest.summary.resourceBoundRows, 6);
  assert.equal(manifest.summary.boneLinkedRows, 2);
  assert.equal(manifest.summary.objectRefExpandedRows, 1);
  assert.equal(manifest.summary.runtimeAnimationLinkedRows, 3);
  assert.equal(manifest.summary.runtimeBoneLinkedRows, 3);
  assert.equal(manifest.summary.nativeHookLinkedRows, 3);
  assert.equal(manifest.summary.nativeActionLinkedRows, 3);
  assert.equal(manifest.summary.nativeLocatorLinkedRows, 2);
  assert.equal(manifest.summary.nativeTimingLinkedRows, 3);
  assert.equal(manifest.summary.projectileBindingLinkedRows, 2);
  assert.equal(manifest.summary.projectileActionLinkedRows, 2);
  assert.equal(manifest.summary.projectileBoneLinkedRows, 2);
  assert.equal(manifest.summary.projectileTimingLinkedRows, 2);
  assert.equal(manifest.summary.resolvedResourceLinkedRows, 6);
  assert.equal(manifest.summary.resolvedActionLinkedRows, 5);
  assert.equal(manifest.summary.resolvedBindingLinkedRows, 5);
  assert.equal(manifest.summary.resolvedTimingLinkedRows, 4);
  assert.deepEqual(
    manifest.items.map((item) => [item.ownerLabel, item.effectToken, item.resourcePaths]),
    [
      ["OtherHero_DefaultSkin", "Effect_Ringo_AA", ["Effects/Ringo/Ringo_AA/Ringo_AA.pfx"]],
      ["Ringo_DefaultSkin", "Effect_Ringo_AA", ["Effects/Ringo/Ringo_AA/Ringo_AA.pfx"]],
      ["Ringo_DefaultSkin", "Effect_Ringo_AA_Impact", ["Effects/Ringo/Ringo_AA_Impact/Ringo_AA_Impact.pfx"]],
      ["Ringo_DefaultSkin", "Effect_Ringo_Twirl", ["Effects/Ringo/Twirl/Ringo_Twirl.pfx"]],
      ["Ringo_DefaultSkin", "Effect_Ringo_Channel", ["Effects/Ringo/Channel/Ringo_Channel.pfx"]],
      ["Ringo_DefaultSkin", "Effect_Ringo_SkinProjectile", ["Effects/Ringo/SkinProjectile/Ringo_SkinProjectile.pfx"]],
    ],
  );
  const twirl = manifest.items.find((item) => item.effectToken === "Effect_Ringo_Twirl");
  assert.deepEqual(twirl.referencedAnimations, ["Characters/Ringo/Art/ringo.twirl.anim"]);
  assert.deepEqual(twirl.runtimeBones, ["Bone_LeftHand"]);
  assert.deepEqual(twirl.runtimeBindTokens, ["GunMuzzle"]);
  assert.deepEqual(twirl.runtimeBindings, ["Bone_LeftHand", "GunMuzzle"]);
  assert.deepEqual(twirl.nativeActionKeys, ["ability02"]);
  assert.deepEqual(twirl.nativeLocatorLabels, ["Bone_LeftHand"]);
  assert.deepEqual(twirl.nativeRuntimeStartSeconds, ["0.25"]);
  assert.deepEqual(twirl.nativeHookMatchKinds, ["hero-resource-root"]);
  assert.deepEqual(twirl.projectileRoles, ["projectile"]);
  assert.deepEqual(twirl.projectileActionKeys, ["ability02"]);
  assert.deepEqual(twirl.projectileBoneTokens, ["Bone_LeftHand"]);
  assert.deepEqual(twirl.projectileEmitterLabels, ["GunMuzzle"]);
  assert.deepEqual(twirl.projectileRuntimeStartSeconds, ["0.15"]);
  assert.deepEqual(twirl.resolvedActionKeys, ["ability02"]);
  assert.deepEqual(twirl.resolvedActionLabels, ["Ability02_Cast", "ability02"]);
  assert.deepEqual(twirl.resolvedStartSeconds, ["0.15", "0.25"]);
  assert.deepEqual(twirl.resolvedBindingTargets, ["Bone_LeftHand", "GunMuzzle"]);
  assert.deepEqual(twirl.resolvedResourcePaths, ["Effects/Ringo/Twirl/Ringo_Twirl.pfx"]);
  const attack = manifest.items.find((item) => item.ownerLabel === "Ringo_DefaultSkin" && item.effectToken === "Effect_Ringo_AA");
  assert.deepEqual(attack.nativeActionKeys, ["attack"]);
  assert.deepEqual(attack.nativeLocatorLabels, ["Bone_RightHand"]);
  assert.deepEqual(attack.nativeBindHints, ["bone", "native-visual-bone-token"]);
  assert.deepEqual(attack.nativeRuntimeStartSeconds, ["0"]);
  assert.deepEqual(attack.resolvedBindingTargets, ["Bone_RightHand", "GunMuzzle"]);
  const channel = manifest.items.find((item) => item.effectToken === "Effect_Ringo_Channel");
  assert.deepEqual(channel.nativeBindingTargets, ["effect-channel"]);
  assert.deepEqual(channel.resolvedBindingTargets, ["effect-channel"]);
  assert.deepEqual(channel.nativeResourcePaths, [
    "Effects/Ringo/Native/Ringo_Native.Surface[0].shadergraph",
    "Effects/Ringo/Native/Ringo_Native.pfx",
  ]);
  assert.deepEqual(channel.resolvedResourcePaths, [
    "Effects/Ringo/Channel/Ringo_Channel.pfx",
    "Effects/Ringo/Native/Ringo_Native.Surface[0].shadergraph",
    "Effects/Ringo/Native/Ringo_Native.pfx",
  ]);
  const skinProjectile = manifest.items.find((item) => item.effectToken === "Effect_Ringo_SkinProjectile");
  assert.deepEqual(skinProjectile.projectileHookBindingTargets, ["Bone_RightHand"]);
  assert.deepEqual(skinProjectile.projectileHookRuntimeStartSeconds, ["0.2"]);
  assert.deepEqual(skinProjectile.resolvedBindingTargets, ["Bone_RightHand"]);
  assert.deepEqual(skinProjectile.resolvedStartSeconds, ["0.2"]);
  const inheritedAttack = manifest.items.find(
    (item) => item.ownerLabel === "OtherHero_DefaultSkin" && item.effectToken === "Effect_Ringo_AA",
  );
  assert.deepEqual(inheritedAttack.inheritedActionKeys, ["attack"]);
  assert.deepEqual(inheritedAttack.resolvedActionKeys, ["attack"]);
  assert.deepEqual(inheritedAttack.resolvedActionLabels, ["attack"]);
  assert.equal(attack.ownerLocalFieldOffset, "120");
  assert.equal(reportRowsForManifest(manifest)[0].resourcePaths, "Effects/Ringo/Ringo_AA/Ringo_AA.pfx");
});

test("exportCff0EffectInstanceGraph writes viewer JSON and audit TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-cff0-effect-instance-graph-"));
  const objectRefsPath = path.join(tempDir, "object_refs.tsv");
  const pfxPath = path.join(tempDir, "pfx.tsv");
  const hooksPath = path.join(tempDir, "hooks.tsv");
  const projectileBindingsPath = path.join(tempDir, "projectiles.tsv");
  const viewerOut = path.join(tempDir, "viewer.json");
  const tsvOut = path.join(tempDir, "report.tsv");
  const jsonOut = path.join(tempDir, "summary.json");
  fs.writeFileSync(
    objectRefsPath,
    [
      Object.keys(objectRefRows[0]).join("\t"),
      ...objectRefRows.map((row) => Object.keys(objectRefRows[0]).map((column) => row[column] || "").join("\t")),
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    pfxPath,
    [
      Object.keys(pfxRows[0]).join("\t"),
      ...pfxRows.map((row) => Object.values(row).join("\t")),
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    hooksPath,
    [
      Object.keys(hookRows[0]).join("\t"),
      ...hookRows.map((row) => Object.keys(hookRows[0]).map((column) => row[column] || "").join("\t")),
    ].join("\n") + "\n",
  );
  fs.writeFileSync(
    projectileBindingsPath,
    [
      Object.keys(projectileRows[0]).join("\t"),
      ...projectileRows.map((row) => Object.keys(projectileRows[0]).map((column) => row[column] || "").join("\t")),
    ].join("\n") + "\n",
  );

  const summary = exportCff0EffectInstanceGraph({
    objectRefsPath,
    pfxPath,
    hooksPath,
    projectileBindingsPath,
    viewerOut,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.rows, 6);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Effect_Ringo_AA/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /referencedAnimations/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /nativeActionKeys/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /projectileActionKeys/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /projectileHookBindingTargets/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /resolvedActionKeys/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /resolvedActionLabels/);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /resourcePaths/);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.resourceBoundRows, 6);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.nativeHookLinkedRows, 3);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.projectileBindingLinkedRows, 2);
  assert.equal(JSON.parse(fs.readFileSync(jsonOut, "utf8")).summary.resolvedTimingLinkedRows, 4);
});
