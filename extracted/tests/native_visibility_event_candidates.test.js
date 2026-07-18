const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  exportNativeVisibilityEventCandidates,
  extractNativeVisibilityEventCandidatesFromSource,
  resolveToken,
  rolesForToken,
} = require("../tools/native_visibility_event_candidates");

const definitionRows = [
  {
    role: "hide-mesh-buff",
    relativePath: "Buffs/KindredBuffs.def",
    value: "Buff_Silvernail_A_Tower_Hide_Mesh",
    labelBefore: "Buff_Silvernail_A_Tower_AttachPointAvailable",
  },
  {
    role: "visibility-buff",
    relativePath: "Buffs/KindredBuffs.def",
    value: "Buff_ShowGloballyVisible",
    labelBefore: "Buff_GloballyVisibleTrueSight_5v5_Boss",
  },
];

const sourceText = `
void FUN_100abc000(long param_1)
{
  (**(code **)(*param_1 + 0x50))(param_1,PTR_s_Buff_Silvernail_A_Tower_Hide_Mes_10101010);
}

void FUN_100abc100(long param_1)
{
  (**(code **)(*param_1 + 0x30))(param_1,"Buff_ShowGloballyVisible");
}
`;

function writeRows(filePath, columns, rows) {
  const lines = [columns.join("\t")];
  for (const row of rows) lines.push(columns.map((column) => row[column] || "").join("\t"));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

test("rolesForToken classifies visibility and hidden mesh buffs", () => {
  assert.deepEqual(rolesForToken("Buff_Silvernail_A_Tower_Hide_Mesh"), ["hide-or-invisible-buff"]);
  assert.deepEqual(rolesForToken("Buff_ShowGloballyVisible"), ["show-effect-or-indicator-buff", "visibility-buff"]);
});

test("resolveToken recovers truncated Ghidra PTR_s names from definition tokens", () => {
  assert.deepEqual(resolveToken("Buff_Silvernail_A_Tower_Hide_Mes", ["Buff_Silvernail_A_Tower_Hide_Mesh"]), {
    token: "Buff_Silvernail_A_Tower_Hide_Mesh",
    status: "definition-prefix-recovered",
  });
});

test("native visibility extractor bridges recovered tokens to definition rows", () => {
  const rows = extractNativeVisibilityEventCandidatesFromSource({
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_decompile_output/structured/functions/test.c",
    sourceText,
    knownTokens: definitionRows.flatMap((row) => [row.value, row.labelBefore]),
    definitionContext: new Map([
      [
        "Buff_Silvernail_A_Tower_Hide_Mesh",
        { definitionRoles: ["hide-mesh-buff"], definitionPaths: ["Buffs/KindredBuffs.def"] },
      ],
      [
        "Buff_ShowGloballyVisible",
        { definitionRoles: ["visibility-buff"], definitionPaths: ["Buffs/KindredBuffs.def"] },
      ],
    ]),
  });

  assert.equal(rows.length, 2);
  const hideMesh = rows.find((row) => row.token === "Buff_Silvernail_A_Tower_Hide_Mesh");
  assert.equal(hideMesh.rawToken, "Buff_Silvernail_A_Tower_Hide_Mes");
  assert.equal(hideMesh.tokenStatus, "definition-prefix-recovered");
  assert.equal(hideMesh.bridgeStatus, "native-and-definition");
  assert.match(hideMesh.semanticCalls, /vcall-remove-or-query-buff/);
});

test("native visibility exporter writes TSV and summary JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-native-visibility-"));
  const sourceDir = path.join(tempDir, "GameKindred_decompile_output", "structured", "functions");
  const definitionPath = path.join(tempDir, "definitions.tsv");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "test.c"), sourceText);
  writeRows(definitionPath, ["role", "relativePath", "value", "labelBefore"], definitionRows);

  const summary = exportNativeVisibilityEventCandidates({
    definitionPath,
    sourcePaths: [sourceDir],
    tsvOut: path.join(tempDir, "native_visibility_event_candidates.tsv"),
    jsonOut: path.join(tempDir, "native_visibility_event_candidates_summary.json"),
  });

  assert.equal(summary.rows, 2);
  assert.equal(summary.byTokenStatus["definition-prefix-recovered"], 1);
  assert.equal(summary.byBridgeStatus["native-and-definition"], 2);
  assert.match(fs.readFileSync(path.join(tempDir, "native_visibility_event_candidates.tsv"), "utf8"), /Buff_ShowGloballyVisible/);
});
