const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportDefinitionAttachmentEventChain,
  extractDefinitionAttachmentEventRows,
  rowRoles,
} = require("../tools/definition_attachment_event_chain");

const stringRows = [
  {
    relativePath: "Characters/Hero038/Grumpjaw.def",
    hash: "HASH1",
    blockIndex: "1",
    stringIndex: "233",
    payloadOffset: "16328",
    semantic: "label",
    labelBefore: "AbilityCSelfProjectile",
    value: "AbilityCAttachPoint",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero038/Grumpjaw.def",
    hash: "HASH1",
    blockIndex: "1",
    stringIndex: "234",
    payloadOffset: "16440",
    semantic: "bind",
    labelBefore: "AbilityCAttachPoint",
    value: "Bone_RightHand",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero038/Grumpjaw.def",
    hash: "HASH1",
    blockIndex: "1",
    stringIndex: "235",
    payloadOffset: "16455",
    semantic: "bind",
    labelBefore: "AbilityCAttachPoint",
    value: "rHandIK_bnd",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Buffs/KindredBuffs.def",
    hash: "HASH2",
    blockIndex: "1",
    stringIndex: "3504",
    payloadOffset: "172857",
    semantic: "unset",
    labelBefore: "Buff_Hero057_B_Attached",
    value: "Buff_Hero057_B_Attachment_Target",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Buffs/KindredBuffs.def",
    hash: "HASH2",
    blockIndex: "1",
    stringIndex: "3446",
    payloadOffset: "170016",
    semantic: "label",
    labelBefore: "Buff_Silvernail_A_Tower_AttachPointAvailable",
    value: "Buff_Silvernail_A_Tower_Hide_Mesh",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Effects/KindredEffects.def",
    hash: "HASH3",
    blockIndex: "1",
    stringIndex: "100",
    payloadOffset: "200",
    semantic: "resource",
    labelBefore: "Rona_DefaultSkin",
    value: "build://Effects/Rona/Rona_Weapon/Rona_Weapon.pfx",
    resourceCategory: "effect",
    targetRelativePath: "Effects/Rona/Rona_Weapon/Rona_Weapon.pfx",
  },
  {
    relativePath: "Characters/Hero023/Kestrel_Trap.def",
    hash: "HASH4",
    blockIndex: "1",
    stringIndex: "31",
    payloadOffset: "2805",
    semantic: "resource",
    labelBefore: "Hide",
    value: "build://Characters/Hero023/ArtTrap/hero023Trap.invisible.anim",
    resourceCategory: "animation",
    targetRelativePath: "Characters/Hero023/ArtTrap/hero023Trap.invisible.anim",
  },
  {
    relativePath: "Characters/Hero019/Baron.def",
    hash: "HASH5",
    blockIndex: "1",
    stringIndex: "223",
    payloadOffset: "15128",
    semantic: "bind",
    labelBefore: "Ability_A_Attack2_Fly",
    value: "Bone_Weapon",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero019/Baron.def",
    hash: "HASH5",
    blockIndex: "1",
    stringIndex: "224",
    payloadOffset: "15140",
    semantic: "bind",
    labelBefore: "Bone_Weapon",
    value: "launcher_bnd",
    resourceCategory: "",
    targetRelativePath: "",
  },
  {
    relativePath: "Characters/Hero030/Idris.def",
    hash: "HASH6",
    blockIndex: "1",
    stringIndex: "328",
    payloadOffset: "20493",
    semantic: "resource",
    labelBefore: "Sound_Idris_Ability_C_Attach",
    value: "build://Sounds/Idris/SFX/Default/idris_ult_attach.mp3",
    resourceCategory: "audio",
    targetRelativePath: "Sounds/Idris/SFX/Default/idris_ult_attach.mp3",
  },
];

test("rowRoles classifies data-side attachment, visibility, and effect rows", () => {
  assert.deepEqual(rowRoles(stringRows[0]), ["ability-attach-point"]);
  assert.deepEqual(rowRoles(stringRows[1]), ["attach-point-bind-token", "attach-point-bone"]);
  assert.deepEqual(rowRoles(stringRows[2]), ["attach-point-bind-token"]);
  assert.deepEqual(rowRoles(stringRows[3]), ["attached-state-buff", "attachment-target-buff"]);
  assert.deepEqual(rowRoles(stringRows[4]), ["attach-point-availability-buff", "hide-mesh-buff"]);
  assert.deepEqual(rowRoles(stringRows[5]), ["effect-weapon-attach-resource"]);
  assert.deepEqual(rowRoles(stringRows[6]), ["animation-visibility-resource"]);
  assert.deepEqual(rowRoles(stringRows[7]), ["weapon-bone-bind"]);
  assert.deepEqual(rowRoles(stringRows[8]), ["weapon-bone-bind-token"]);
  assert.deepEqual(rowRoles(stringRows[9]), ["attach-sound-resource"]);
});

test("extractDefinitionAttachmentEventRows emits one row per matched role", () => {
  const rows = extractDefinitionAttachmentEventRows(stringRows);
  assert.equal(rows.length, 13);
  assert.equal(rows.some((row) => row.role === "attach-point-bone" && row.value === "Bone_RightHand"), true);
  assert.equal(rows.some((row) => row.role === "hide-mesh-buff" && row.definitionGroup === "Buffs"), true);
  assert.equal(rows.some((row) => row.role === "animation-visibility-resource"), true);
  assert.equal(rows.some((row) => row.role === "weapon-bone-bind" && row.value === "Bone_Weapon"), true);
});

test("definition attachment event exporter writes TSV and JSON summary", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-definition-attachment-events-"));
  const stringsPath = path.join(tempDir, "definition_instance_strings.tsv");
  const columns = [
    "relativePath",
    "hash",
    "blockIndex",
    "definitionFormatByte",
    "definitionVersionByte",
    "payloadSize",
    "stringIndex",
    "payloadOffset",
    "semantic",
    "labelBefore",
    "value",
    "resourceCategory",
    "targetRelativePath",
    "targetBuildPath",
  ];
  const lines = [columns.join("\t")];
  for (const row of stringRows) {
    lines.push(columns.map((column) => row[column] || "").join("\t"));
  }
  fs.writeFileSync(stringsPath, `${lines.join("\n")}\n`);

  const summary = exportDefinitionAttachmentEventChain({
    stringsPath,
    tsvOut: path.join(tempDir, "definition_attachment_event_chain.tsv"),
    jsonOut: path.join(tempDir, "definition_attachment_event_chain_summary.json"),
  });

  assert.equal(summary.rows, 13);
  assert.equal(summary.byRole["attach-point-bind-token"], 2);
  assert.match(fs.readFileSync(path.join(tempDir, "definition_attachment_event_chain.tsv"), "utf8"), /AbilityCAttachPoint/);
});
