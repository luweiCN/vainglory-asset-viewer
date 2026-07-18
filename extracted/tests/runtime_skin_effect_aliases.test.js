const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeSkinEffectAliasRows,
  exportRuntimeSkinEffectAliases,
  parseTargetLabels,
} = require("../tools/runtime_skin_effect_aliases");

test("parseTargetLabels keeps target labels ordered by object offset", () => {
  assert.deepEqual(parseTargetLabels("64:Effect_Base_B|8:Effect_Base_A|16:Effect_Skin_A"), [
    { offset: 8, label: "Effect_Base_A" },
    { offset: 16, label: "Effect_Skin_A" },
    { offset: 64, label: "Effect_Base_B" },
  ]);
});

test("buildRuntimeSkinEffectAliasRows extracts close CFF0 skin effect replacement pairs", () => {
  const rows = buildRuntimeSkinEffectAliasRows([
    {
      source: "cff0-ptch",
      relativePath: "Characters/Hero023/Kestrel.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      ownerType: "skin",
      ownerLabel: "Kestrel_Skin_Drow",
      ownerRecordStartField: "28520",
      ownerFieldOffset: "30040",
      targetLabels:
        "0:Effect_Kestrel_AA_Hit|8:Effect_Kestrel_S3_AA_Hit|64:Effect_Kestrel_AA|72:Effect_Kestrel_S3_AA",
    },
    {
      source: "cff0-ptch",
      relativePath: "Characters/Hero023/Kestrel.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      ownerType: "skin",
      ownerLabel: "Kestrel_Skin_Drow",
      ownerRecordStartField: "28520",
      ownerFieldOffset: "30200",
      targetLabels:
        "0:Effect_Kestrel_C_Charging|8:Effect_Kestrel_S3_C_Charging|72:Effect_Kestrel_C_Shot_Burst|80:Effect_Kestrel_S3_C_Shot_Burst",
    },
    {
      source: "cff0-ptch",
      relativePath: "Characters/Hero023/Kestrel.def",
      blockIndex: "1",
      definitionFormatByte: "5",
      definitionVersionByte: "5",
      ownerType: "skin",
      ownerLabel: "Kestrel_DefaultSkin",
      ownerRecordStartField: "100",
      ownerFieldOffset: "200",
      targetLabels: "0:Effect_Kestrel_AA|8:Effect_Kestrel_S3_AA",
    },
  ]);

  assert.deepEqual(
    rows.map((row) => [row.modelLabel, row.sourceEffectToken, row.skinEffectToken]),
    [
      ["Kestrel_Skin_Drow", "Effect_Kestrel_AA", "Effect_Kestrel_S3_AA"],
      ["Kestrel_Skin_Drow", "Effect_Kestrel_AA_Hit", "Effect_Kestrel_S3_AA_Hit"],
      ["Kestrel_Skin_Drow", "Effect_Kestrel_C_Charging", "Effect_Kestrel_S3_C_Charging"],
      ["Kestrel_Skin_Drow", "Effect_Kestrel_C_Shot_Burst", "Effect_Kestrel_S3_C_Shot_Burst"],
    ],
  );
});

test("exportRuntimeSkinEffectAliases writes viewer JSON and report TSV", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-skin-effect-aliases-"));
  const objectRefsPath = path.join(tempDir, "object_refs.tsv");
  const viewerOut = path.join(tempDir, "runtime-skin-effect-aliases.json");
  const tsvOut = path.join(tempDir, "runtime_skin_effect_aliases.tsv");

  fs.writeFileSync(
    objectRefsPath,
    [
      "source\trelativePath\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\townerType\townerLabel\townerRecordStartField\townerFieldOffset\ttargetLabels",
      "cff0-ptch\tCharacters/Hero055/Silvernail.def\t1\t5\t5\tskin\tSilvernail_Skin_Medieval\t18304\t20280\t0:Effect_Silvernail_A|8:Effect_Silvernail_MED_A",
      "",
    ].join("\n"),
  );

  const summary = exportRuntimeSkinEffectAliases({ objectRefsPath, viewerOut, tsvOut });

  assert.equal(summary.rows, 1);
  assert.match(fs.readFileSync(tsvOut, "utf8"), /Effect_Silvernail_MED_A/);
  assert.match(fs.readFileSync(viewerOut, "utf8"), /Silvernail_Skin_Medieval/);
});
