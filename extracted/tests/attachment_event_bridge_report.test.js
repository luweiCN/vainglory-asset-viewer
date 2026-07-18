const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  bridgeAttachmentEventRows,
  buildDefinitionTokenIndex,
  exportAttachmentEventBridgeReport,
  isBridgeToken,
} = require("../tools/attachment_event_bridge_report");

const nativeRows = [
  {
    platform: "ios",
    role: "attachment-target-buff",
    token: "Buff_Hero057_B_Attachment_Target",
    functionName: "FUN_100390248",
    semanticCalls: "add-or-apply-buff|vcall-target-or-attach",
  },
  {
    platform: "android",
    role: "attachment-target-buff",
    token: "Buff_Hero057_B_Attachment_Target",
    functionName: "FUN_00df95f8",
    semanticCalls: "add-or-apply-buff|vcall-target-or-attach",
  },
  {
    platform: "ios",
    role: "weapon-bone-hook",
    token: "Bone_Weapon",
    functionName: "FUN_1003888d0",
    semanticCalls: "bone-query",
  },
];

const definitionRows = [
  {
    definitionGroup: "Buffs",
    role: "attachment-target-buff",
    relativePath: "Buffs/KindredBuffs.def",
    value: "Buff_Hero057_B_Attachment_Target",
    labelBefore: "Buff_Hero057_B_Attached",
  },
  {
    definitionGroup: "Characters",
    role: "attach-point-bone",
    relativePath: "Characters/Hero038/Grumpjaw.def",
    value: "Bone_RightHand",
    labelBefore: "AbilityCAttachPoint",
  },
];

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("isBridgeToken keeps only native/data tokens that can be joined", () => {
  assert.equal(isBridgeToken("Buff_Hero057_B_Attachment_Target"), true);
  assert.equal(isBridgeToken("Effect_Rona_Weapon"), true);
  assert.equal(isBridgeToken("Bone_Weapon"), true);
  assert.equal(isBridgeToken("AbilityCAttachPoint"), true);
  assert.equal(isBridgeToken("build://Effects/Rona/Rona_Weapon.pfx"), false);
});

test("buildDefinitionTokenIndex indexes values and labelBefore tokens", () => {
  const index = buildDefinitionTokenIndex(definitionRows);
  assert.equal(index.get("Buff_Hero057_B_Attachment_Target").length, 1);
  assert.equal(index.get("Buff_Hero057_B_Attached").length, 1);
  assert.equal(index.get("AbilityCAttachPoint").length, 1);
});

test("bridgeAttachmentEventRows joins native and definition evidence by exact token", () => {
  const rows = bridgeAttachmentEventRows(nativeRows, definitionRows);
  const joined = rows.find((row) => row.token === "Buff_Hero057_B_Attachment_Target");
  assert.equal(joined.bridgeStatus, "native-and-definition");
  assert.equal(joined.nativePlatforms, "android|ios");
  assert.equal(joined.definitionPaths, "Buffs/KindredBuffs.def");

  const nativeOnly = rows.find((row) => row.token === "Bone_Weapon");
  assert.equal(nativeOnly.bridgeStatus, "native-only");
  assert.equal(nativeOnly.definitionRows, 0);
});

test("attachment event bridge exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-attachment-event-bridge-"));
  const nativePath = path.join(tempDir, "native.tsv");
  const definitionPath = path.join(tempDir, "definition.tsv");
  const nativeColumns = ["platform", "role", "token", "functionName", "semanticCalls"];
  const definitionColumns = ["definitionGroup", "role", "relativePath", "value", "labelBefore"];
  writeRows(nativePath, nativeColumns, nativeRows);
  writeRows(definitionPath, definitionColumns, definitionRows);

  const summary = exportAttachmentEventBridgeReport({
    nativePath,
    definitionPath,
    tsvOut: path.join(tempDir, "attachment_event_bridge.tsv"),
    jsonOut: path.join(tempDir, "attachment_event_bridge_summary.json"),
  });

  assert.equal(summary.tokens, 2);
  assert.equal(summary.byStatus["native-and-definition"], 1);
  assert.deepEqual(summary.unmatchedNativeTokens, ["Bone_Weapon"]);
  assert.match(fs.readFileSync(path.join(tempDir, "attachment_event_bridge.tsv"), "utf8"), /native-and-definition/);
});
