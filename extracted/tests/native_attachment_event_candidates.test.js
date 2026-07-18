const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeAttachmentEventCandidates,
  extractNativeAttachmentEventCandidatesFromSource,
  resolveToken,
  rolesForToken,
} = require("../tools/native_attachment_event_candidates");

const definitionRows = [
  {
    role: "hide-mesh-buff",
    relativePath: "Buffs/KindredBuffs.def",
    value: "Buff_Silvernail_A_Tower_Hide_Mesh",
    labelBefore: "Buff_Silvernail_A_Tower_AttachPointAvailable",
  },
];

const syntheticSource = `
void FUN_1000a000(long param_1)
{
  FUN_1003a4e5c(param_1,"Buff_Hero057_B_Attachment_Target");
  FUN_1003a5078(param_1,"Buff_Hero057_B_Attached");
  (**(code **)(*param_1 + 0x30))(param_1);
}

void FUN_1000b000(long param_1)
{
  FUN_1003a93d0(param_1,"Effect_Idris_C_OnAttachedHero");
  (**(code **)(*param_1 + 0x68))(param_1,"Bone_Weapon_Right");
}

void FUN_1000c000(long param_1)
{
  FUN_1003a4e5c(param_1,PTR_s_Buff_Silvernail_A_Tower_Hide_Mes_10101010);
  FUN_1003a4e5c(param_1,PTR_s_Buff_Silvernail_A_Tower_AttachPointAvailable_20202020);
  (**(code **)(*param_1 + 0x70))(param_1,"AbilityCAttachPoint");
}

void FUN_noise(long param_1)
{
  glAttachShader(1,2);
  glDetachShader(1,2);
  p_CSwift_AttachKeyParam = 0;
}
`;

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("rolesForToken classifies attachment event and hook tokens", () => {
  assert.deepEqual(rolesForToken("Buff_Hero057_B_Attachment_Target"), ["attachment-target-buff"]);
  assert.deepEqual(rolesForToken("Buff_Hero057_B_Attached"), ["attached-state-buff"]);
  assert.deepEqual(rolesForToken("Buff_Silvernail_A_Tower_Hide_Mesh"), ["hide-mesh-buff"]);
  assert.deepEqual(rolesForToken("Buff_Silvernail_A_Tower_AttachPointAvailable"), ["attach-point-availability-buff"]);
  assert.deepEqual(rolesForToken("AbilityCAttachPoint"), ["ability-attach-point"]);
  assert.deepEqual(rolesForToken("Bone_Weapon_Right"), ["weapon-bone-hook"]);
  assert.deepEqual(rolesForToken("Effect_Idris_C_OnAttachedHero"), ["weapon-effect-hook"]);
});

test("resolveToken recovers truncated attachment PTR_s names from definition tokens", () => {
  assert.deepEqual(resolveToken("Buff_Silvernail_A_Tower_Hide_Mes", ["Buff_Silvernail_A_Tower_Hide_Mesh"]), {
    token: "Buff_Silvernail_A_Tower_Hide_Mesh",
    status: "definition-prefix-recovered",
  });
});

test("attachment event extractor keeps real candidates and drops known false positives", () => {
  const rows = extractNativeAttachmentEventCandidatesFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText: syntheticSource,
    knownTokens: ["Buff_Silvernail_A_Tower_Hide_Mesh", "Buff_Silvernail_A_Tower_AttachPointAvailable"],
    definitionContext: new Map([
      [
        "Buff_Silvernail_A_Tower_Hide_Mesh",
        { definitionRoles: ["hide-mesh-buff"], definitionPaths: ["Buffs/KindredBuffs.def"] },
      ],
      [
        "Buff_Silvernail_A_Tower_AttachPointAvailable",
        { definitionRoles: ["attach-point-availability-buff"], definitionPaths: ["Buffs/KindredBuffs.def"] },
      ],
    ]),
  });

  assert.equal(rows.some((row) => row.functionName === "FUN_noise"), false);
  assert.equal(rows.length, 7);

  const attachmentTarget = rows.find((row) => row.token === "Buff_Hero057_B_Attachment_Target");
  assert.equal(attachmentTarget.role, "attachment-target-buff");
  assert.match(attachmentTarget.semanticCalls, /add-or-apply-buff/);
  assert.match(attachmentTarget.semanticCalls, /vcall-add-buff/);

  const effect = rows.find((row) => row.token === "Effect_Idris_C_OnAttachedHero");
  assert.equal(effect.role, "weapon-effect-hook");
  assert.match(effect.semanticCalls, /effect-bind/);
  assert.match(effect.semanticCalls, /bone-query/);

  const attachPoint = rows.find((row) => row.token === "AbilityCAttachPoint");
  assert.equal(attachPoint.role, "ability-attach-point");
  assert.match(attachPoint.semanticCalls, /vcall-target-or-attach/);

  const hideMesh = rows.find((row) => row.token === "Buff_Silvernail_A_Tower_Hide_Mesh");
  assert.equal(hideMesh.rawToken, "Buff_Silvernail_A_Tower_Hide_Mes");
  assert.equal(hideMesh.tokenStatus, "definition-prefix-recovered");
  assert.equal(hideMesh.bridgeStatus, "native-and-definition");
});

test("attachment event exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-attachment-events-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const reportDir = path.join(tempDir, "reports");
  const definitionPath = path.join(tempDir, "definition.tsv");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), syntheticSource);
  writeRows(definitionPath, ["role", "relativePath", "value", "labelBefore"], definitionRows);

  const summary = exportNativeAttachmentEventCandidates({
    definitionPath,
    sourcePaths: [sourceDir],
    tsvOut: path.join(reportDir, "native_attachment_event_candidates.tsv"),
    jsonOut: path.join(reportDir, "native_attachment_event_candidates_summary.json"),
  });

  assert.equal(summary.rows, 7);
  assert.equal(summary.byRole["attachment-target-buff"], 1);
  assert.equal(summary.byRole["weapon-effect-hook"], 1);
  assert.equal(summary.byTokenStatus["definition-prefix-recovered"], 1);
  assert.match(
    fs.readFileSync(path.join(reportDir, "native_attachment_event_candidates.tsv"), "utf8"),
    /Buff_Hero057_B_Attachment_Target/,
  );
});
