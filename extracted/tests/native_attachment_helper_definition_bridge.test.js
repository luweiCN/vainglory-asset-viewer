const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeHelperDefinitionRows,
  exportNativeAttachmentHelperDefinitionBridge,
  isGenericDefinitionToken,
  parseParentTokens,
} = require("../tools/native_attachment_helper_definition_bridge");

const helperRows = [
  {
    platform: "ios",
    stage: "attachment-helper-call-usage",
    helperFunction: "FUN_1003dfe60",
    realFunction: "FUN_1003dfe60",
    argKey: "0:2:0x19:0",
    groupArg: "0",
    indexArg: "2",
    kindArg: "0x19",
    flagArg: "0",
    callCount: "3",
    parentRoles: "weapon-bone-hook|weapon-effect-hook",
    parentTokens: "Bone_Weapon:2|Effect_Lance_A_Weapon:1",
  },
  {
    platform: "android",
    stage: "attachment-helper-call-usage",
    helperFunction: "FUN_00d59f54",
    realFunction: "FUN_00d090c4",
    argKey: "2:5:0x19:0",
    groupArg: "2",
    indexArg: "5",
    kindArg: "0x19",
    flagArg: "0",
    callCount: "1",
    parentRoles: "attachment-target-buff|weapon-effect-hook",
    parentTokens: "Buff_Silvernail_A_Tower_Hide_Mesh:1|Effect_Silvernail_Tripwire_AttachAvail_Ring:1|Missing_Token:1",
  },
  {
    platform: "ios",
    stage: "lookup-chain",
    helperFunction: "FUN_1003dfe60",
    realFunction: "FUN_1003dfe60",
  },
];

const eventBridgeRows = [
  {
    token: "Bone_Weapon",
    bridgeStatus: "native-and-definition",
    definitionRoles: "weapon-bone-bind",
    definitionGroups: "Characters",
    definitionPaths: "Characters/Hero019/Baron.def|Characters/Hero028/Lance.def",
  },
  {
    token: "Effect_Lance_A_Weapon",
    bridgeStatus: "native-and-definition",
    definitionRoles: "weapon-effect-bind",
    definitionGroups: "Characters",
    definitionPaths: "Characters/Hero028/Lance.def",
  },
  {
    token: "Buff_Silvernail_A_Tower_Hide_Mesh",
    bridgeStatus: "native-and-definition",
    definitionRoles: "attachment-target-buff",
    definitionGroups: "Buffs",
    definitionPaths: "Buffs/KindredBuffs.def",
  },
];

const aliasBridgeRows = [
  {
    token: "Effect_Lance_A_Weapon",
    aliasStatus: "hero-alias-resource",
    matchKind: "hero-code-exact-basename",
    evidenceStrength: "strong",
    heroCodes: "Hero028",
    resourcePaths: "Effects/Hero028/Hero028_A_Weapon/Hero028_A_Weapon.pfx",
    resourceLabels: "Lance_DefaultSkin",
  },
  {
    token: "Effect_Silvernail_Tripwire_AttachAvail_Ring",
    aliasStatus: "hero-alias-resource",
    matchKind: "hero-code-keyword-candidate",
    evidenceStrength: "weak",
    heroCodes: "Hero055",
    resourcePaths: "Effects/Hero055/Hero055_TripWire/Hero055_TripWire.pfx",
    resourceLabels: "Silvernail_DefaultSkin",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("parseParentTokens keeps token counts from helper usage rows", () => {
  assert.deepEqual(parseParentTokens("Bone_Weapon:2|Effect_Lance_A_Weapon:1"), [
    { token: "Bone_Weapon", count: 2 },
    { token: "Effect_Lance_A_Weapon", count: 1 },
  ]);
  assert.deepEqual(parseParentTokens("Bone_Weapon"), [{ token: "Bone_Weapon", count: 1 }]);
});

test("isGenericDefinitionToken separates broad bind tokens from specific effect/buff tokens", () => {
  assert.equal(isGenericDefinitionToken("Bone_Weapon"), true);
  assert.equal(isGenericDefinitionToken("Bone_Weapon_Left"), true);
  assert.equal(isGenericDefinitionToken("AbilityCAttachPoint"), true);
  assert.equal(isGenericDefinitionToken("Effect_Lance_A_Weapon"), false);
  assert.equal(isGenericDefinitionToken("Buff_Idris_C_Attached"), false);
});

test("bridgeHelperDefinitionRows joins helper usage to definition and effect-resource evidence", () => {
  const rows = bridgeHelperDefinitionRows(helperRows, eventBridgeRows, aliasBridgeRows);
  assert.equal(rows.length, 2);

  const lance = rows.find((row) => row.argKey === "0:2:0x19:0");
  assert.equal(lance.complete, "yes");
  assert.equal(lance.bridgedParentTokens, "Bone_Weapon:2|Effect_Lance_A_Weapon:1");
  assert.match(lance.definitionPaths, /Characters\/Hero028\/Lance\.def/);
  assert.equal(lance.specificDefinitionPaths, "Characters/Hero028/Lance.def");
  assert.equal(lance.specificCharacterDefinitionPaths, "Characters/Hero028/Lance.def");
  assert.match(lance.resourcePaths, /Hero028_A_Weapon\.pfx/);
  assert.match(lance.bridgeStatuses, /Effect_Lance_A_Weapon=definition\+effect-resource/);

  const silvernail = rows.find((row) => row.argKey === "2:5:0x19:0");
  assert.equal(silvernail.complete, "partial");
  assert.match(silvernail.unresolvedParentTokens, /Missing_Token:1/);
  assert.match(silvernail.aliasEvidenceStrengths, /weak/);
  assert.match(silvernail.resourcePaths, /Hero055_TripWire\.pfx/);
});

test("helper definition bridge exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-helper-definition-bridge-"));
  const helperPath = path.join(tempDir, "helper.tsv");
  const eventBridgePath = path.join(tempDir, "event_bridge.tsv");
  const aliasBridgePath = path.join(tempDir, "alias_bridge.tsv");
  const tsvOut = path.join(tempDir, "out.tsv");
  const jsonOut = path.join(tempDir, "out.json");

  writeRows(
    helperPath,
    [
      "platform",
      "stage",
      "helperFunction",
      "realFunction",
      "argKey",
      "groupArg",
      "indexArg",
      "kindArg",
      "flagArg",
      "callCount",
      "parentRoles",
      "parentTokens",
    ],
    helperRows,
  );
  writeRows(
    eventBridgePath,
    ["token", "bridgeStatus", "definitionRoles", "definitionGroups", "definitionPaths"],
    eventBridgeRows,
  );
  writeRows(
    aliasBridgePath,
    ["token", "aliasStatus", "matchKind", "evidenceStrength", "heroCodes", "resourcePaths", "resourceLabels"],
    aliasBridgeRows,
  );

  const summary = exportNativeAttachmentHelperDefinitionBridge({
    helperPath,
    eventBridgePath,
    aliasBridgePath,
    tsvOut,
    jsonOut,
  });

  assert.equal(summary.helperUsageRows, 2);
  assert.equal(summary.rows, 2);
  assert.equal(summary.completeRows, 1);
  assert.equal(summary.partialRows, 1);
  assert.equal(summary.rowsWithSpecificCharacterDefinition, 1);
  assert.deepEqual(summary.unresolvedParentTokens, ["Missing_Token"]);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /definition\+effect-resource/);
  assert.match(fs.readFileSync(jsonOut, "utf8"), /Missing_Token/);
});
