const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectTypeSymbolsFromSources,
  extractNativeVisualBindingCandidatesFromSource,
  findFunctionBlocks,
} = require("../tools/native_visual_binding_candidates");

const syntheticSource = `
void _INIT_367(void)
{
  FUN_0198a6a8(&DAT_0313f9b0,1,"AttachableEquipment",0x10,8);
  return;
}

void FUN_abc100(void)
{
  long lVar1;
  lVar1 = FUN_1010a3954(&DAT_101858478,1,"SkinRep",0x68,8);
  return;
}

void FUN_abc200(void)
{
  FUN_loader("*KindredAttachableEquipmentManifest*",
             "build://Progression/KindredAttachableEquipmentManifest.def");
  return;
}

void FUN_abc300(void)
{
  FUN_loader("build://Characters/Attachments/Glasses/GlassesNYE2019/Art/glassesNYE2019.mesh",
             "headB_bnd");
  return;
}

void FUN_abc400(long param_1)
{
  (**(code **)(*param_1 + 0x78))(param_1,"Bone_Weapon");
  FUN_effect("Effect_Ringo_A_Trail");
  return;
}

void FUN_noise(long param_1)
{
  (**(code **)(*param_1 + 0x78))(param_1,123);
  return;
}
`;

test("findFunctionBlocks includes Android _INIT registration functions", () => {
  const blocks = findFunctionBlocks(syntheticSource.split(/\r?\n/));
  assert.equal(blocks.some((block) => block.functionName === "_INIT_367"), true);
});

test("extractNativeVisualBindingCandidatesFromSource keeps visual anchors and drops offset-only noise", () => {
  const sourceItems = [{ sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/test.c", sourceText: syntheticSource }];
  const typeSymbols = collectTypeSymbolsFromSources(sourceItems);
  const rows = extractNativeVisualBindingCandidatesFromSource({
    sourceFile: sourceItems[0].sourceFile,
    sourceText: syntheticSource,
    typeSymbols,
  });

  assert.equal(rows.some((row) => row.functionName === "FUN_noise"), false);

  const registration = rows.find((row) => row.functionName === "_INIT_367");
  assert.match(registration.candidateStages, /schema-registration/);
  assert.equal(registration.confidence, "confirmed-schema");
  assert.match(registration.focusTypes, /AttachableEquipment/);

  const skinRep = rows.find((row) => row.functionName === "FUN_abc100");
  assert.match(skinRep.candidateStages, /schema-registration/);
  assert.match(skinRep.typeSymbols, /DAT_101858478/);

  const manifest = rows.find((row) => row.functionName === "FUN_abc200");
  assert.match(manifest.candidateStages, /manifest-load-or-lookup/);
  assert.equal(manifest.confidence, "confirmed-manifest-loader");
  assert.match(manifest.resources, /KindredAttachableEquipmentManifest/);

  const attachmentResource = rows.find((row) => row.functionName === "FUN_abc300");
  assert.match(attachmentResource.candidateStages, /attachment-resource-chain/);
  assert.equal(attachmentResource.bindTokens, "headB_bnd");

  const effectBoneHook = rows.find((row) => row.functionName === "FUN_abc400");
  assert.match(effectBoneHook.candidateStages, /ability-effect-bone-hook/);
  assert.equal(effectBoneHook.boneNames, "Bone_Weapon");
});
