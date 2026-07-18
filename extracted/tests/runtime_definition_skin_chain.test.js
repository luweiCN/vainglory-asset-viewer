const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRuntimeDefinitionSkinChainRows,
  exportRuntimeDefinitionSkinChain,
  parseTsv,
} = require("../tools/runtime_definition_skin_chain");

const definitionChainTsv = `manifestLabel\ttargetRelativePath\ttargetHash\ttargetMatched\ttargetFamily\tchildResourceRows\tchildUnmatchedRows\tdefinitionCount\tmeshCount\tskeletonCount\tanimationCount\teffectCount\taudioCount\timageCount\tmatchedMeshCount\tmatchedSkeletonCount\tmatchedAnimationCount\tmeshSamples\tskeletonSamples\tanimationLabels\tmeshLabels\ttargetLinkedPath
*Ringo*\tCharacters/Ringo/Ringo.def\th1\tyes\tcharacter\t10\t0\t0\t2\t1\t4\t0\t2\t0\t2\t1\t4\t\t\t\t\tlinked/Ringo.def
*Menu*\tMenus/Menu.def\th2\tyes\tmenu\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t0\t\t\t\t\tlinked/Menu.def
`;

const skinEvidenceTsv = `source\trelativePath\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tmodelLabel\trecordStartField\tmeshPath\tskeletonEvidenceKind\tskeletonFieldLocalOffset\tskeletonFieldSourceOffset\tskeletonFieldValue\tskeletonFieldTarget\tdirectSkeletons\tanimationEvidenceKind\tanimationCount\teffectEvidenceKind\teffectCount\tobjectRefCount\tslotEvidenceKind\ttargetBones\ttargetBindTokens\ttargetEffects\ttargetAnimations\ttargetResources
cff0-ptch\tCharacters/Ringo/Ringo.def\t0\t4\t8\tRingo_DefaultSkin\t100\tCharacters/Ringo/Art/ringo.mesh\tdirect-skeleton-resource\t16\t1\tbuild://Characters/Ringo/Art/ringo.skeleton\tCharacters/Ringo/Art/ringo.skeleton\tCharacters/Ringo/Art/ringo.skeleton\tdirect-animation-records\t4\tdirect-effect-labels\t1\t10\tdirect-object-slot-evidence\tBone_Weapon\tweapon_bnd\t\t\t
cff0-ptch\tCharacters/Ringo/Ringo.def\t0\t4\t8\tRingo_Skin\t200\tCharacters/Ringo/Art/ringo_skin.mesh\tsame-as-first-object-ref\t16\t2\t\t\t\tno-direct-animation-records\t0\tno-direct-effect-labels\t0\t4\tno-direct-slot-evidence\t\t\t\t\t
`;

const slotTsv = `source\trelativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tboneFieldOffset\tboneSourceOffset\tboneName\tbindFieldOffset\tbindSourceOffset\tbindToken
cff0-ptch\tCharacters/Ringo/Ringo.def\th1\t0\t4\t8\t10\t11\tBone_Weapon\t20\t21\tweapon_bnd
`;

const objectGraphTsv = `source\trelativePath\thash\tblockIndex\tdefinitionFormatByte\tdefinitionVersionByte\tmodelLabel\trecordStartField\tmeshPath\trootLocalFieldOffset\tnativeInlinePath\tnativeInlineRange\trootRole\ttargetObjectOffset\ttraversalDepthLimit\twindowBytes\tvisitedObjectCount\tedgeCount\tcycleCount\ttruncated\tevidenceKind\tdirectBones\tdirectBindTokens\treachableBones\treachableBindTokens\treachableAnimations\treachableEffects\treachableAudios\treachableResources\treachableLabels\tsampleEdges
cff0-ptch\tCharacters/Ringo/Ringo.def\th1\t0\t4\t8\tRingo_DefaultSkin\t100\tCharacters/Ringo/Art/ringo.mesh\t8\tSkinRep.field1\t0x8-0x10\tobject-ref\t300\t4\t512\t1\t1\t0\t0\tdirect-slot-evidence\tBone_Weapon\tweapon_bnd\tBone_Weapon\tweapon_bnd\t\t\t\t\t\t
cff0-ptch\tCharacters/Ringo/Ringo.def\th1\t0\t4\t8\tRingo_Skin\t200\tCharacters/Ringo/Art/ringo_skin.mesh\t8\tSkinRep.field1\t0x8-0x10\tobject-ref\t400\t4\t512\t1\t1\t0\t0\trecursive-slot-evidence\t\t\tBone_Weapon\tweapon_bnd\t\t\t\t\t\t
`;

test("buildRuntimeDefinitionSkinChainRows joins character definitions to SkinRep evidence", () => {
  const rows = buildRuntimeDefinitionSkinChainRows({
    definitionChainRows: parseTsv(definitionChainTsv),
    skinEvidenceRows: parseTsv(skinEvidenceTsv),
    slotRows: parseTsv(slotTsv),
    objectGraphRows: parseTsv(objectGraphTsv),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].skinRecordCount, 2);
  assert.equal(rows[0].directSkeletonSkinCount, 1);
  assert.equal(rows[0].sameObjectSkeletonSkinCount, 1);
  assert.equal(rows[0].slotRecordCount, 1);
  assert.equal(rows[0].graphDirectSlotSkinCount, 1);
  assert.equal(rows[0].graphRecursiveSlotSkinCount, 1);
  assert.equal(rows[0].slotBindTokens, "weapon_bnd");
});

test("exportRuntimeDefinitionSkinChain writes aggregate TSV and JSON", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vainglory-runtime-definition-skin-chain-"));
  const definitionChainPath = path.join(tempDir, "definition_manifest_chain.tsv");
  const skinEvidencePath = path.join(tempDir, "cff0_skin_evidence.tsv");
  const slotRecordsPath = path.join(tempDir, "cff0_runtime_slot_records.tsv");
  const objectGraphPath = path.join(tempDir, "cff0_skin_object_graph.tsv");
  const reportDir = path.join(tempDir, "reports");
  fs.writeFileSync(definitionChainPath, definitionChainTsv);
  fs.writeFileSync(skinEvidencePath, skinEvidenceTsv);
  fs.writeFileSync(slotRecordsPath, slotTsv);
  fs.writeFileSync(objectGraphPath, objectGraphTsv);

  const summary = exportRuntimeDefinitionSkinChain({
    definitionChainPath,
    skinEvidencePath,
    slotRecordsPath,
    objectGraphPath,
    tsvOut: path.join(reportDir, "runtime_definition_skin_chain.tsv"),
    jsonOut: path.join(reportDir, "runtime_definition_skin_chain_summary.json"),
  });

  assert.equal(summary.rows, 1);
  assert.equal(summary.skinRecords, 2);
  const report = fs.readFileSync(path.join(reportDir, "runtime_definition_skin_chain.tsv"), "utf8");
  assert.match(report, /Ringo_Skin/);
  assert.match(report, /weapon_bnd/);
});
