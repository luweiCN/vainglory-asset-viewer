#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { parseElf64, scanTextReferences } = require("./current_native_anchor_audit");

const defaultAndroidLib = "extracted/android_raw/lib/arm64-v8a/libGameKindred.so";
const defaultNativeEffectRuntimeLinksPath = "extracted/viewer/native-effect-runtime-links.json";
const defaultMenuMeshLightProbeCff0DiagnosticsPath =
  "extracted/viewer/menu-mesh-light-probe-cff0-diagnostics.json";
const defaultLightfieldRuntimeDiagnosticsPath = "extracted/viewer/lightfield-runtime-diagnostics.json";
const defaultLevelVisualProfileDiagnosticsPath = "extracted/viewer/level-visual-profile-diagnostics.json";
const defaultHeroPreviewProfileCandidatesPath = "extracted/viewer/hero-preview-profile-candidates.json";
const defaultNativeBinaryVersionAuditPath = "extracted/viewer/native-binary-version-audit.json";
const defaultCurrentNativeAnchorAuditPath = "extracted/viewer/current-native-anchor-audit.json";
const defaultCurrentNativeLightProbeChainAuditPath =
  "extracted/viewer/current-native-light-probe-chain-audit.json";
const defaultCurrentNativeOwnerDefinitionAuditPath =
  "extracted/viewer/current-native-owner-definition-audit.json";
const defaultCurrentNativeLevelVisualsSchemaAuditPath =
  "extracted/viewer/current-native-levelvisuals-schema-audit.json";
const defaultLevelVisualsDefinitionFieldBridgePath =
  "extracted/viewer/level-visuals-definition-field-bridge.json";
const defaultCurrentNativeLevelRuntimeOwnerAuditPath =
  "extracted/viewer/current-native-level-runtime-owner-audit.json";
const defaultCurrentNativePositionSamplerOwnerAuditPath =
  "extracted/viewer/current-native-position-sampler-owner-audit.json";
const defaultCurrentNativePreviewStringXrefAuditPath =
  "extracted/viewer/current-native-preview-string-xref-audit.json";
const defaultCharacterLitProbeBlockerAuditPath =
  "extracted/viewer/character-lit-probe-blocker-audit.json";
const defaultTypedObjectRuntimeKeyPayloadAuditPath =
  "extracted/viewer/typed-object-runtime-key-payload-audit.json";
const defaultStructuredFunctionsDir =
  "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions";
const defaultJsonOut = "extracted/reports/native_light_probe_runtime_evidence.json";
const defaultViewerOut = "extracted/viewer/native-light-probe-runtime-evidence.json";

const defaultSymbols = {
  attenuationPresets: { virtualAddress: 0x01bf8100, bytes: 0x24, components: 3, arrayCount: 3 },
  fallbackOmniLightPosition: { virtualAddress: 0x01bf8124, bytes: 0x0c, components: 3, arrayCount: 1 },
  fallbackOmniLightColor: { virtualAddress: 0x01bf8130, bytes: 0x0c, components: 3, arrayCount: 1 },
  fallbackOmniLightAttenuation: { virtualAddress: 0x01bf813c, bytes: 0x0c, components: 3, arrayCount: 1 },
  fallbackProbeSample: { virtualAddress: 0x01bf8150, bytes: 0x10, components: 4, arrayCount: 1 },
};

const currentPackageMenuMeshStringAnchors = [
  { name: "*LootCardRep3D*", classification: "loot-card-or-hero-card-ui-mesh" },
  { name: "heroArt_file", classification: "loot-card-or-hero-card-ui-field" },
  { name: "heroArt_repeat", classification: "loot-card-or-hero-card-ui-field" },
  { name: "heroArt_offset", classification: "loot-card-or-hero-card-ui-field" },
  { name: "cardArt_file", classification: "loot-card-or-hero-card-ui-field" },
  { name: "cardArt_repeat", classification: "loot-card-or-hero-card-ui-field" },
  { name: "cardArt_offset", classification: "loot-card-or-hero-card-ui-field" },
  { name: "*TalentCoinRep3D*", classification: "talent-coin-ui-mesh" },
  { name: "*KindredMenuMarketCardBox*", classification: "market-card-ui-mesh" },
  { name: "*KindredMenuGuildBannerMesh*", classification: "guild-menu-mesh" },
  { name: "GUILD_BANNERS", classification: "guild-menu-mesh-field" },
  { name: "*KindredMenuAscensionDialMesh*", classification: "ascension-menu-mesh" },
  { name: "*KindredMenuChestEffects*", classification: "chest-reward-menu-mesh" },
  { name: "*KindredMenuRewardsChestBattered*", classification: "chest-reward-menu-mesh" },
  { name: "REWARD_CHEST", classification: "chest-reward-menu-mesh-field" },
];

const androidLightPlacementSchemaEvidence = {
  sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/named.c",
  levelVisuals: {
    registrationLines: "57620-57635",
    descriptorInitLines: "57580-57618",
    typeName: "LevelVisuals",
    typeSize: "0x60",
    fieldTable: [
      { fieldIndex: 0, fieldOffset: "0x0", typePointerSymbol: "PTR_DAT_02bea2b8", inferredRole: "unknown-scalar-or-reference" },
      { fieldIndex: 1, fieldOffset: "0x8", typePointerSymbol: "PTR_DAT_02beaac8", inferredRole: "mesh-list-a" },
      { fieldIndex: 2, fieldOffset: "0x10", typePointerSymbol: "PTR_DAT_02beaac8", inferredRole: "mesh-list-b" },
      { fieldIndex: 3, fieldOffset: "0x18", typePointerSymbol: "PTR_DAT_02beaac8", inferredRole: "mesh-list-c" },
      { fieldIndex: 4, fieldOffset: "0x20", typePointerSymbol: "PTR_DAT_02beade0", inferredRole: "StaticPfx** slot" },
      { fieldIndex: 5, fieldOffset: "0x28", typePointerSymbol: "PTR_DAT_02beade0", inferredRole: "StaticPfx** slot" },
      { fieldIndex: 6, fieldOffset: "0x30", typePointerSymbol: "PTR_DAT_02beade0", inferredRole: "StaticPfx** slot" },
      { fieldIndex: 7, fieldOffset: "0x38", typePointerSymbol: "PTR_DAT_02bea510", inferredRole: "StaticSound** slot" },
      { fieldIndex: 8, fieldOffset: "0x40", typePointerSymbol: "PTR_DAT_02bea408", inferredRole: "KindredSoundBalance-like slot" },
      { fieldIndex: 9, fieldOffset: "0x48", typePointerSymbol: "PTR_DAT_02bf2778", inferredRole: "LightPlacement** / LightOmni" },
      { fieldIndex: 10, fieldOffset: "0x50", typePointerSymbol: "PTR_DAT_02bf27e0", inferredRole: "TOK_RAW payload / lightfield profile source" },
      { fieldIndex: 11, fieldOffset: "0x58", typePointerSymbol: "PTR_DAT_02beab40", inferredRole: "StaticLensFlare** slot" },
    ],
    inferredLightPlacementListField: {
      fieldOffset: "0x48",
      rawTypePointer: "PTR_DAT_02bf2778",
      inferredType: "LightPlacement**",
      evidence:
        "LevelVisuals field descriptor at offset 0x48 uses a raw type pointer adjacent to the Android LightPlacement pointer registrations; definition strings label this slot as LightOmni and point it at .lightfield resources.",
    },
    inferredLightfieldProfileField: {
      fieldOffset: "0x50",
      rawTypePointer: "PTR_DAT_02bf27e0",
      inferredType: "lightfield/profile resource payload",
      evidence:
        "LevelVisuals descriptor slot +0x50 uses PTR_DAT_02bf27e0. FUN_0198a234 handles TOK_RAW fields only when the field type pointer matches PTR_DAT_02bf27e0, writes the raw value through FUN_0198a998, and FUN_009ca17c later reads param_2[10], converts it through FUN_00f1c800/FUN_00f1c904/FUN_00f1c8ec, then passes the resulting payload to FUN_00f2e3bc.",
      parserEvidence:
        "external/HackedGlory/.../0198a.c:FUN_0198a234 compares field type against PTR_DAT_02bf27e0 before consuming TOK_RAW value= bytes; FUN_0198a998 allocates bytes+1, copies the payload, NUL-terminates it, and stores the pointer in the current field.",
      unresolved:
        "definition-side LightOmni links now bridge to this field as a strong candidate, but active preview selection and runtime ownership are still unresolved, so this must stay a profile-load evidence slot rather than a renderer value.",
    },
  },
  lightPlacement: {
    registrationLines: "75020-75047",
    typeName: "LightPlacement",
    typeSize: "0x40",
    fields: [
      {
        fieldOffset: "0x0",
        rawTypePointer: "PTR_DAT_02bf2708",
        inferredRole: "transform-or-position",
        consumedBy: "FUN_00e7d02c copies the first vec3 from record +0x0 into light object +0x14..+0x1c",
      },
      {
        fieldOffset: "0x24",
        rawTypePointer: "PTR_DAT_02bf2750",
        inferredRole: "color",
        consumedBy: "FUN_00e7d02c copies record +0x24..+0x2c into light object +0x24..+0x2c",
      },
      {
        fieldOffset: "0x34",
        rawTypePointer: "PTR_DAT_02bf27c8",
        inferredRole: "intensity",
        consumedBy: "FUN_00e7d02c copies record +0x34 into light object +0x30",
      },
      {
        fieldOffset: "0x38",
        rawTypePointer: "PTR_DAT_02bf27e0",
        inferredRole: "unknown-extra-field",
        consumedBy:
          "FUN_00e7d02c does not copy this field into the scene light object; attenuation preset index remains the default 0 on the light object unless another path updates it",
      },
    ],
  },
  lightObjectUpdate: {
    sourceFile: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e7d.c",
    function: "FUN_00e7d02c",
    lines: "51-76",
    recordSizeImplication: "reads through record +0x34 from a LightPlacement-sized 0x40 record",
  },
};

const androidProbeServiceDispatchEvidence = {
  sourceFiles: [
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e7d.c",
  ],
  confirmedNegativeEvidence: [
    {
      id: "light-placement-is-not-probe-samples",
      evidence:
        "FUN_00e7d02c copies LightPlacement position/color/intensity into a scene light object only; it never writes Probe.Samples.",
      implication:
        "LevelVisuals/LightOmni is useful for OmniLight recovery, but it cannot be connected directly to six-direction character probe lighting without the separate sampler/service path.",
    },
    {
      id: "static-vtable-file-read-is-not-enough",
      evidence:
        "Reading PTR_FUN_* tables directly from the unrelocated Android ELF produces interleaved non-code values; nearby code candidates resolve to particle/constant callbacks, not a proven scene probe sampler.",
      implication:
        "The static table bytes must not be used directly. The sampler is recovered through the constructor/object chain and call semantics instead.",
    },
  ],
  unresolved: [
    "the active profile or scene object used by hero/model preview before Probe.Samples upload",
    "whether the active path samples a LevelVisuals .lightfield grid, menu CFF0 probe block, or another runtime profile",
  ],
};

const androidLightfieldSamplerEvidence = {
  sourceFiles: [
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2f.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c",
  ],
  dispatchChain: [
    {
      function: "FUN_00f2e1b4",
      evidence:
        "constructs the light/probe manager: FUN_00f2fcac creates the inner scene light/probe object, FUN_00f2e5c8 wraps it, and FUN_00f2e3e4 stores both on the manager.",
    },
    {
      function: "FUN_00f2e5c8",
      evidence:
        "sets wrapper vtable PTR_FUN_02829078 and stores the inner FUN_00f2fcac object at wrapper +0x8.",
    },
    {
      function: "FUN_00f2e8f4",
      evidence:
        "calls wrapper +0x8 object's vtable +0x38, then writes the returned six vec4 values into Probe.Samples[0..5].",
    },
    {
      function: "FUN_00f2fcac",
      evidence:
        "constructs the inner object with vtable PTR_FUN_02829200 and initializes its lightfield sampler state at object +0x38.",
    },
    {
      function: "FUN_00f30138",
      evidence:
        "the inner vtable +0x38 implementation forwards to FUN_00f3032c with the sampler state at object +0x38.",
    },
    {
      function: "FUN_00f30528",
      evidence:
        "parses a .lightfield text payload into bounds, width/height, and width*height*6 vec4 samples; the leading row scalar is sample0.w.",
    },
    {
      function: "FUN_00f3032c",
      evidence:
        "samples the lightfield by clamping X/Z to bounds, bilinearly blending four cells, then outputting each component as value^2 * 0.5 for six Probe.Samples vectors.",
    },
  ],
  recoveredSamplerFormula:
    "Probe.Samples[i] = 0.5 * square(bilinear(lightfieldCellSample[i], clamped world X/Z)); sample0.w comes from the row leading scalar and samples1..5.w are zero.",
  stillUnresolved: [
    "the active hero/model preview profile object that loads a specific .lightfield into the sampler state",
    "the world/model position passed as param_2 to FUN_00f2e8f4 in the hero preview path",
    "whether hero preview uses MapViewer_5v5/F002, S005/Halcyon, or another profile outside battle scenes",
  ],
};

const androidLevelVisualLightfieldLoaderEvidence = {
  sourceFiles: [
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0198a.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009ca.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c",
  ],
  dispatchChain: [
    {
      function: "FUN_0198a234/FUN_0198a998",
      evidence:
        "the definition parser handles TOK_RAW only when the resolved field type pointer equals PTR_DAT_02bf27e0, allocates bytes+1, copies the value= payload, NUL-terminates it, and stores that raw pointer in the current field.",
    },
    {
      function: "FUN_009ca17c",
      evidence:
        "when LevelVisuals lens flare list param_2[0xb] is empty, it reads the TOK_RAW payload at param_2[10] (byte offset 0x50), obtains a handle through FUN_00f1c800, materializes a string/resource payload through FUN_00f1c904/FUN_00f1c8ec, and calls FUN_00f2e3bc(payload, handle, status).",
    },
    {
      function: "FUN_00f2e3bc",
      evidence:
        "global wrapper for FUN_00f2e5a8(DAT_03212088, payload, handle, status).",
    },
    {
      function: "FUN_00f2e5a8",
      evidence:
        "dispatches the inner scene light/probe service stored at DAT_03212088 + 8 through virtual offset +0x40.",
    },
    {
      function: "FUN_00f30140",
      evidence:
        "the recovered inner +0x40 implementation forwards to FUN_00f30528 with the lightfield sampler state at object +0x38.",
    },
    {
      function: "FUN_00f30528",
      evidence:
        "parses the lightfield text payload into bounds, dimensions, and width*height*6 vec4 samples.",
    },
  ],
  implication:
    "Level +0x10 visuals loading and LevelVisuals +0x50 are now tied to a raw definition payload and the native lightfield/profile load path. This proves how a Level-selected profile can enter the probe service, but it does not yet prove which profile the hero/model preview selects or which position is sampled.",
  unresolved: [
    "the exact active hero/model preview LevelVisuals record that supplies the +0x50 LightOmni/profile payload",
    "the active hero/model preview object that chooses a LevelVisuals/profile payload",
    "the world/model position passed later to FUN_00f3032c for sampling",
  ],
};

const androidSceneProbeEntrypointEvidence = {
  sourceFiles: [
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00efb.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009b8.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00af8.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009c9.c",
    "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009ca.c",
  ],
  managerLifecycle: [
    {
      function: "FUN_00f2e1b4",
      evidence:
        "called during renderer/global initialization from 00efb.c; constructs DAT_03212088 as the global light/probe manager.",
    },
    {
      function: "FUN_00f2e218",
      evidence: "destroys DAT_03212088 and the owned wrapper/inner service objects.",
    },
  ],
  publicEntrypoints: [
    {
      function: "FUN_00f2e250",
      callers: ["009b8.c:FUN_009b8b34"],
      evidence:
        "frame/update-style entrypoint; reaches both inner and wrapper service objects before FUN_00f2e304 uploads light/probe uniforms.",
    },
    {
      function: "FUN_00f2e304",
      callers: ["009b8.c:FUN_009b8b34", "00af8.c:FUN_00af88f4"],
      evidence:
        "calls the wrapper service virtual +0x18 with semantic table and model/view data; FUN_00af88f4 builds a menu/preview camera matrix immediately before this upload.",
    },
    {
      function: "FUN_00f2e380",
      callers: ["0198c.c:FUN_0198c110", "0198d.c:FUN_0198d94c"],
      evidence:
        "builds or retrieves a parameter table through FUN_01997b28 before dispatching wrapper virtual +0x20.",
    },
    {
      function: "FUN_00f2e3bc",
      callers: ["009ca.c"],
      evidence:
        "receives the LevelVisuals +0x50 string/resource payload plus a handle from FUN_009ca17c and dispatches inner service virtual +0x40; this is the recovered lightfield/profile load path into FUN_00f30528.",
    },
    {
      function: "FUN_00f2e3d8",
      callers: ["009c9.c:FUN_009c9d7c"],
      evidence:
        "dispatches inner service virtual +0x48 during level/system teardown.",
    },
  ],
  menuMeshProbeWriter: {
    constructor: "FUN_00af8b20",
    callback: "FUN_00af8bf8",
    writer: "FUN_00afad08",
    knownConcreteCaller: "00af0.c initializes KindredMenuAscensionDialMesh through FUN_00af8b20/FUN_00af9124",
    evidence:
      "FUN_00af8b20 installs callback slot +0x31 as FUN_00af8bf8; that callback calls FUN_00afad08, which uploads MenuMeshData OmniLight and Probe.Samples.",
    implication:
      "this proves a menu mesh light/probe path, but the concrete observed caller is a menu object, so it must not be treated as the hero presentation lighting profile.",
  },
  implication:
    "hero/model preview lighting may enter through the same global service as gameplay, but 00af8.c proves menu/preview draw code also calls the upload path. The active profile cannot be assumed from MapViewer/Halcyon definitions until the preview caller chain is resolved.",
};

const currentAndroidFunctionAnchorEvidence = {
  source: "extracted/android_raw/lib/arm64-v8a/libGameKindred.so",
  method: "current_native_anchor_audit string xrefs plus local objdump neighborhoods",
  anchors: [
    {
      id: "current-levelvisuals-registration",
      addresses: ["0x7cebe0", "0x7ced14", "0x7ced80", "0x7ceddc", "0x3050da0", "0x3050e68"],
      evidence:
        "current binary registration thunks pass LevelVisuals, LevelVisuals*, and LevelVisuals** strings through the common type registration call at 0x189021c; the concrete LevelVisuals thunk passes size 0x60 and stores a field descriptor range at 0x3050da0..0x3050e68.",
      implication:
        "the LevelVisuals type size and descriptor table are confirmed in the current Android package; individual field semantics are tracked by current_native_levelvisuals_schema_audit.",
    },
    {
      id: "current-lightplacement-registration",
      addresses: ["0x7f75f0", "0x7f765c", "0x7f76b8"],
      evidence:
        "current binary registration thunks pass LightPlacement, LightPlacement*, and LightPlacement** strings through the common type registration call at 0x189021c; the concrete LightPlacement thunk passes size 0x40.",
      implication: "the LightPlacement type size from HackedGlory is confirmed in the current Android package.",
    },
    {
      id: "current-token-raw-parser",
      addresses: ["0x188fb60", "0x188fc18", "0x188fda8"],
      evidence:
        "current binary token dispatcher compares TOK_* labels and routes TOK_RAW to the function starting near 0x188fda8, which uses the format string TOK_RAW typeinfo=%s field=%s bytes=%d with sscanf.",
      implication:
        "the current package contains the same definition parser concept, but the field-type comparison and storage target still need to be traced locally.",
    },
    {
      id: "current-omnilight-probe-writer",
      addresses: ["0xe3715c", "0xe372b4", "0xe373ac", "0xe37470"],
      evidence:
        "current binary references OmniLight.Position, OmniLight.Color, OmniLight.Attenuation, and Probe.Samples inside the same local neighborhood, transforms light values, and calls semantic writers around 0x18a0c4c/0x18a099c.",
      implication:
        "the current package has a real OmniLight/Probe writer path; it still does not identify the active hero preview profile or real character-lit runtime values.",
    },
    {
      id: "current-menu-mesh-light-probe-writer",
      addresses: ["0x9f7e90", "0x9f9f90", "0x9fa018", "0x9fa0b0"],
      evidence:
        "current binary tail-branches from 0x9f7e90 into the menu mesh light/probe writer at 0x9f9f90. The writer reads the menu mesh definition instance from object +0x1a0, writes OmniLight slot 0 from +0x58/+0x64/+0x70, writes OmniLight slot 1 from +0x7c/+0x88/+0x94, then looks up Probe.Samples and iterates the vector list at +0xa0.",
      implication:
        "the menu mesh light/probe uploader is now confirmed in the current package; it still proves a menu mesh path, not the active hero/model preview profile.",
    },
    {
      id: "current-menu-mesh-light-probe-owner-vtable",
      addresses: ["0x9f7e94", "0x26df8f0", "0x26e0890"],
      evidence:
        "current binary data references for 0x9f7e94 locate two menu-mesh owner vtable neighborhoods at 0x26df8f0 and 0x26e0890. The same function has multiple direct and tail callers, so the menu mesh uploader can now be traced through the owning object class instead of as an isolated function.",
      implication:
        "this narrows the active-preview trace to owner-object paths that install or call these vtables; it still does not prove that the hero/model preview uses this menu mesh lighting profile.",
    },
    {
      id: "current-probe-writer-vtable-slots",
      addresses: ["0x272f0b0", "0x272f0b8"],
      evidence:
        "current .data.rel.ro contains relocated function pointers to the OmniLight/Probe writer neighborhoods at 0xe3715c and 0xe37470, so those paths can be reached through a runtime table rather than direct bl callers.",
      implication:
        "absence of direct callers for 0xe3715c is expected and is not negative evidence; the next trace must follow the owning object/vtable.",
    },
    {
      id: "current-scene-probe-service-entrypoints",
      addresses: [
        "0xe36d30",
        "0xe36d94",
        "0xe36dcc",
        "0xe36e80",
        "0xe36efc",
        "0xe36f38",
        "0xe36f60",
        "0xe37144",
        "0xe38828",
        "0x3118068",
      ],
      evidence:
        "current binary constructs a global scene/probe service object at 0x3118068 through 0xe36d30, destroys it through 0xe36d94, and routes public wrappers through 0xe36dcc/0xe36e80/0xe36efc/0xe36f38 into wrapper and inner vtables. The writer vtable slots at 0x272f0b0/0x272f0b8 remain downstream of this service chain.",
      implication:
        "this gives current-package entrypoints for tracing active profile loading and sample position, but it still does not prove which profile or position the hero/model preview uses.",
    },
    {
      id: "current-scene-probe-position-sample-upload",
      addresses: ["0xe36efc", "0x1891cb8", "0x18934f4", "0xe37114", "0xe37470"],
      evidence:
        "current callers at 0x1891cb8 and 0x18934f4 pack a 12-byte vec3-like position record from caller object +0x50/+0x58 into stack memory, pass it to 0xe36efc, and 0xe36efc dispatches wrapper vtable +0x20 through 0xe37114. The reached function 0xe37470 calls inner +0x38 and then writes six Probe.Samples vec4 values into the parameter table.",
      implication:
        "0xe36efc is current position-sample/upload evidence, not a LevelVisuals profile-loader entry. The caller object that owns the +0x50/+0x58 position record still needs to be identified before hero/model preview lighting can be applied.",
    },
    {
      id: "current-position-sampler-render-command-owner",
      addresses: [
        "0xe01d28",
        "0x1890584",
        "0x1891f8c",
        "0x1893628",
        "0x2ab5188",
        "0x2ab5230",
        "0x1892120",
        "0x189366c",
        "0x1891c84",
        "0x18934c0",
        "0x18a15c8",
        "0x311ae08",
        "0x311ae10",
        "0x1890948",
        "0x1890958",
        "0xe02c80",
        "0x272a990",
        "0x272a9a0",
        "0xe02c94",
        "0xe28660",
        "0xe03330",
        "0x272a9c8",
        "0xe033dc",
        "0xe03474",
        "0xe28418",
        "0x272ed90",
        "0x272eda8",
        "0xe28674",
        "0x1af8d04",
        "0xe01f10",
        "0xe02188",
        "0xe02418",
        "0xe028ec",
        "0xe02aa8",
        "0x272a748",
        "0x272a7e0",
        "0x272a8a8",
        "0x272a930",
        "0xe0219c",
        "0xe0242c",
        "0xe02900",
        "0xe02abc",
        "0xe021a8",
        "0xe02438",
        "0xe0290c",
        "0xe02ac8",
        "0x18918e4",
        "0x2ab5148",
        "0x1891a70",
        "0x1890e90",
        "0x1890e98",
        "0x18942f8",
        "0x2ab5590",
        "0x2ab55a8",
        "0x18a13fc",
        "0x18a1170",
        "0x18a11e4",
        "0x2ab52a8",
        "0xd7faa4",
        "0x8d3a20",
        "0x27266c0",
        "0x2726710",
        "0x2726740",
        "0x189d63c",
        "0x311af50",
        "0x820f24",
      ],
      evidence:
        "current renderer/global init 0xe01d28 calls 0x1890584 after scene/probe service init. 0x1890584 constructs owner B 0x1893628 at global slot 0x311ae08 and owner A 0x1891f8c at global slot 0x311ae10. Their owner vtables are 0x2ab5230 and 0x2ab5188; builder functions sit at owner vtable +0x10. Current command builders 0x1892120 and 0x189366c copy a 4x4 transform returned by an x4-derived provider virtual +0x18 into queued render-command objects. The source +0x30 transform column is stored at command +0x50, and the sample-upload methods 0x1891c84/0x18934c0 later read command +0x50/+0x58 before calling 0xe36efc. Upstream helper dispatch is current-binary evidence: 0xe01efc registers the e02c80 dispatcher at global helper +0x20 through 0x1890948; 0x1890958 calls that object's vtable +0x10; e02c80's vtable +0x10 slot at 0x272a9a0 points to 0xe02c94; e02c94 forwards to e28660. The e02c80 context is resolved through d7f00c(1) -> e03474 -> e28418; e28418 writes primary vtable 0x272ed90, whose +0x18 slot at 0x272eda8 points to e28674. The e28418 context registers animData, meshData, shaderData, and texData handlers through context vtable +0x10. The meshData handler vtable name slot returns 0x1af8d04, and process function e02ac8 calls 0x18918e4. Current 0x18918e4 allocates a runtime object with primary vtable 0x2ab5148, stores request/resource-factory/hash fields, and reaches setup/payload bridges 0x1891a70 -> 0x1890e90/0x1890e98 -> 0x18942f8 before owner builders enqueue commands. A current composite-task dispatch shape is also recovered: constructors 0x18a1170/0x18a11e4 write vtable 0x2ab5590, whose +0x18 slot calls 0x18a13fc; that dispatch loop invokes each entry object's vtable +0x10 with x2 from task +0x58 and x4 as the current entry. Entry source is now narrowed: single constructor 0x18a1170 stores caller x2 inline at task +0x50, while batch constructor 0x18a11e4 stores caller x2 as the entry-array pointer at task +0x50 and x3 as the count. Current direct callsites classify as menu mesh, scene entity, particle effect, ScreenNode, ViewNode/ViewRTNode, and shadow tasks. The Draw all scene entities entry array is traced through 0x188e784 -> 0x188f03c to global manager slot 0x311a960; the manager is now recovered as a fixed 0x800-record pool, and 0x188f03c converts manager u16 indices into entry pointers loaded from record +0x8. Those record +0x8 entries are now narrowed to add-record callers passing object +0x30, with one setup path storing global render-command owner B and a 0x2726740-derived callback/table pointer into the entry subobject. The primary entry table +0x20 slot now prepares x0 = object +0x58 and x2 = object +0x40 before tail-branching into 0x18906b0, tying the entry callback to the global helper/resource-render dispatch chain. The scene/entity render-owner builder invocation is now linked: composite dispatch loads entry +0x8 and calls owner vtable +0x10; entry +0x8 is owner A/B; owner A/B vtable +0x10 resolves to 0x1892120/0x189366c. The scene/entity x4 transform provider is now linked: x4 is entry object +0x30, builders use x4-8 = object +0x28, sub-vtable 0x2726710 +0x18 resolves to 0xd7ff44, and that returns object +0x70 as the transform source. The scene/entity x2 runtime-parameter source is now linked: Draw all scene entities calls 0x189d63c(0), passing global runtime table slot 0 at 0x311af50 into task +0x58.",
      implication:
        "the scene probe position is now tied to global render queue command owners and their per-command transform data, and the meshData resource handler/runtime handoff plus the scene/entity composite-task render-owner builder invocation, x4 transform provider, and x2 global runtime slot source are current-package evidence. The remaining active-preview gap is the slot-0 object's vtable semantics and the profile payload loaded into the scene probe service before the command is appended.",
    },
    {
      id: "current-scene-probe-inner-lightfield-sampler",
      addresses: [
        "0xe37470",
        "0xe38cb4",
        "0xe38ea8",
        "0xe38cbc",
        "0xe390a4",
        "0x272f258",
        "0x272f260",
      ],
      evidence:
        "current writer path 0xe37470 loads the inner scene/probe object from wrapper +0x8, dispatches vtable +0x38, and then writes six Probe.Samples vec4 slots. The current inner +0x38 slot is 0xe38cb4, which forwards to 0xe38ea8; 0xe38ea8 reads the input position from x1 as X/Z, clamps it into lightfield bounds, bilinearly blends six samples, squares the result, multiplies by 0.5, and writes the six vec4 results. The current inner +0x40 slot is 0xe38cbc, which forwards to 0xe390a4 and parses/loading the lightfield/profile payload.",
      implication:
        "the current package now validates the final lightfield position sampler separately from the LevelVisuals profile-payload loader. Renderer takeover still waits for the active hero/model preview profile object and the model/world position passed into 0xe38ea8.",
    },
    {
      id: "current-levelvisuals-profile-field",
      addresses: [
        "0x7cebe0",
        "0x7cecbc",
        "0x7cecc0",
        "0x8cbf40",
        "0x8cc27c",
        "0x8cc568",
        "0xe36f38",
      ],
      evidence:
        "current binary initializes LevelVisuals field +0x48 as LightPlacement**, +0x50 as char*, and +0x58 as StaticLensFlare**. The current Level runtime visuals loader at 0x8cbf40 walks Level +0x10 visuals references and calls the LevelVisuals apply processor at 0x8cc27c; that processor reads the +0x50 char* payload and calls the scene/probe profile-payload load entry 0xe36f38 at 0x8cc568. Current disassembly routes 0xe36f38 through inner vtable +0x40, not the final +0x38 position sampler.",
      implication:
        "the profile payload path is now current-package evidence instead of only HackedGlory guidance, but the active hero/model preview profile object and sample position remain unresolved.",
    },
  ],
};

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function rounded(value) {
  return Math.round(value * 1000000) / 1000000;
}

function hex(value) {
  return typeof value === "number" && Number.isFinite(value) ? `0x${value.toString(16)}` : "";
}

function parseElf64LoadSegments(buffer) {
  if (buffer.subarray(0, 4).toString("binary") !== "\x7fELF") throw new Error("not an ELF file");
  if (buffer[4] !== 2 || buffer[5] !== 1) throw new Error("expected little-endian ELF64");
  const programHeaderOffset = Number(buffer.readBigUInt64LE(32));
  const programHeaderEntrySize = buffer.readUInt16LE(54);
  const programHeaderCount = buffer.readUInt16LE(56);
  const loads = [];
  for (let index = 0; index < programHeaderCount; index += 1) {
    const offset = programHeaderOffset + index * programHeaderEntrySize;
    const type = buffer.readUInt32LE(offset);
    if (type !== 1) continue;
    loads.push({
      fileOffset: Number(buffer.readBigUInt64LE(offset + 8)),
      virtualAddress: Number(buffer.readBigUInt64LE(offset + 16)),
      fileSize: Number(buffer.readBigUInt64LE(offset + 32)),
      memorySize: Number(buffer.readBigUInt64LE(offset + 40)),
      flags: buffer.readUInt32LE(offset + 4),
    });
  }
  return loads;
}

function fileOffsetForVirtualAddress(loads, virtualAddress, size) {
  for (const segment of loads) {
    const start = segment.virtualAddress;
    const end = segment.virtualAddress + segment.fileSize;
    if (virtualAddress >= start && virtualAddress + size <= end) {
      return segment.fileOffset + (virtualAddress - start);
    }
  }
  return -1;
}

function virtualAddressForFileOffset(loads, fileOffset) {
  for (const segment of loads) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.fileSize;
    if (fileOffset >= start && fileOffset < end) {
      return segment.virtualAddress + (fileOffset - start);
    }
  }
  return -1;
}

function findCurrentPackageStringTargets(buffer, elf, stringAnchors) {
  return stringAnchors.flatMap((anchor) => {
    const needle = Buffer.from(`${anchor.name}\0`, "utf8");
    const targets = [];
    let fileOffset = buffer.indexOf(needle);
    while (fileOffset >= 0) {
      const virtualAddress = virtualAddressForFileOffset(elf.loads, fileOffset);
      if (virtualAddress >= 0) {
        targets.push({
          name: anchor.name,
          kind: "current-menu-mesh-string",
          classification: anchor.classification,
          virtualAddress,
          section: "",
        });
      }
      fileOffset = buffer.indexOf(needle, fileOffset + 1);
    }
    return targets;
  });
}

function buildCurrentPackageMenuMeshStringXrefDiagnostics(
  buffer,
  binaryPath,
  stringAnchors = currentPackageMenuMeshStringAnchors,
) {
  const elf = parseElf64(buffer);
  const stringTargets = findCurrentPackageStringTargets(buffer, elf, stringAnchors);
  const textReferences = scanTextReferences(buffer, elf, stringTargets);
  const classificationByName = new Map(stringAnchors.map((anchor) => [anchor.name, anchor.classification]));
  const profileLoaderNeighborhoods = [
    { name: "LevelVisuals apply processor", address: 0x8cc27c, radius: 0x800 },
    { name: "scene/probe profile payload load", address: 0xe36f38, radius: 0x800 },
    { name: "Level setup registered callback", address: 0xc79ad4, radius: 0x800 },
  ];
  const references = textReferences.map((reference) => {
    const nearbyProfileLoader = profileLoaderNeighborhoods.find(
      (target) => Math.abs(reference.xrefAddress - target.address) <= target.radius,
    );
    return {
      targetName: reference.targetName,
      classification: classificationByName.get(reference.targetName) || "unclassified-menu-mesh-string",
      targetAddress: reference.targetAddress,
      targetAddressHex: hex(reference.targetAddress),
      xrefAddress: reference.xrefAddress,
      xrefAddressHex: hex(reference.xrefAddress),
      mode: reference.mode,
      baseAddressHex: hex(reference.baseAddress),
      nearbyProfileLoader: nearbyProfileLoader?.name || "",
    };
  });
  const byClassification = {};
  for (const reference of references) {
    byClassification[reference.classification] = (byClassification[reference.classification] || 0) + 1;
  }
  const profileLoaderReferences = references.filter((reference) => reference.nearbyProfileLoader);
  return {
    binaryPath,
    stringAnchorsConfigured: stringAnchors.length,
    stringTargets: stringTargets.map((target) => ({
      name: target.name,
      classification: target.classification,
      virtualAddress: target.virtualAddress,
      virtualAddressHex: hex(target.virtualAddress),
    })),
    references,
    summary: {
      stringTargetsFound: stringTargets.length,
      textReferences: references.length,
      referencesByClassification: byClassification,
      lootCardOrHeroCardUiReferences: references.filter((reference) =>
        /^loot-card-or-hero-card-ui/.test(reference.classification),
      ).length,
      profileLoaderNeighborhoodReferences: profileLoaderReferences.length,
      provenActiveHeroPreviewProfile: false,
    },
    interpretation:
      "Current-package menu mesh strings and xrefs confirm that the FUN_00af8b20/FUN_00af9124-style path is used by UI/card meshes such as loot cards, talent coins, market cards, guild banners, ascension UI, and reward chests. The heroArt/cardArt fields are card-art uniforms, not proof of the active hero/model preview LevelVisuals profile.",
  };
}

function floatArraysForBytes(buffer, fileOffset, byteCount, components) {
  const values = [];
  for (let offset = 0; offset + 4 <= byteCount; offset += 4) {
    values.push(rounded(buffer.readFloatLE(fileOffset + offset)));
  }
  const arrays = [];
  for (let index = 0; index < values.length; index += components) {
    arrays.push(values.slice(index, index + components));
  }
  return arrays;
}

function readOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function nearestFunctionSignature(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    if (/^\w[\w\s*]+\s+FUN_[0-9a-f]{8}\(/.test(lines[index].trim())) return lines[index].trim();
  }
  return "";
}

function stringLiterals(lines) {
  return [
    ...new Set(
      lines.flatMap((line) => [...line.matchAll(/"([^"]+)"/g)].map((match) => match[1])),
    ),
  ];
}

function classifyMenuMeshProbeCaller(strings) {
  const joined = strings.join(" ");
  if (/LootCardRep3D|heroArt_|cardArt_/i.test(joined)) return "loot-card-or-hero-card-ui-mesh";
  if (/TalentCoinRep3D/i.test(joined)) return "talent-coin-ui-mesh";
  if (/KindredMenuGuild/i.test(joined)) return "guild-menu-mesh";
  if (/KindredMenuChest|REWARD_CHEST/i.test(joined)) return "chest-reward-menu-mesh";
  if (/KindredMenuAscensionDial/i.test(joined)) return "ascension-menu-mesh";
  if (/KindredMenu/i.test(joined)) return "kindred-menu-mesh";
  if (/quest|circle_button|menu_fuzzy/i.test(joined)) return "generic-ui-mesh";
  return strings.length ? "other-ui-mesh" : "unclassified-caller";
}

function buildMenuMeshProbePathDiagnostics(structuredFunctionsDir = defaultStructuredFunctionsDir) {
  if (!fs.existsSync(structuredFunctionsDir)) {
    return {
      structuredFunctionsDir,
      summary: { constructorCalls: 0, meshLoadCalls: 0, callerContexts: 0 },
      callerContexts: [],
      note: "structured functions directory is missing",
    };
  }
  const callerContexts = [];
  const files = fs
    .readdirSync(structuredFunctionsDir)
    .filter((name) => name.endsWith(".c"))
    .sort();
  for (const file of files) {
    const fullPath = path.join(structuredFunctionsDir, file);
    const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/FUN_00af8b20\(|FUN_00af9124\(/.test(line)) continue;
      if (/^\s*void\s+FUN_00af8b20\(|^\s*void\s+FUN_00af9124\(/.test(line)) continue;
      const context = lines.slice(Math.max(0, index - 35), Math.min(lines.length, index + 45));
      const strings = stringLiterals(context);
      callerContexts.push({
        file,
        line: index + 1,
        call: line.trim(),
        nearestSignature: nearestFunctionSignature(lines, index),
        strings,
        classification: classifyMenuMeshProbeCaller(strings),
      });
    }
  }
  const constructorCalls = callerContexts.filter((context) => /FUN_00af8b20\(/.test(context.call)).length;
  const meshLoadCalls = callerContexts.filter((context) => /FUN_00af9124\(/.test(context.call)).length;
  const byClassification = {};
  for (const context of callerContexts) {
    byClassification[context.classification] = (byClassification[context.classification] || 0) + 1;
  }
  const concreteResourceStrings = [
    ...new Set(
      callerContexts.flatMap((context) =>
        context.strings.filter((value) => /\*.*(?:Mesh|Rep3D|Effects).*\*/i.test(value)),
      ),
    ),
  ].sort();
  return {
    structuredFunctionsDir,
    summary: {
      constructorCalls,
      meshLoadCalls,
      callerContexts: callerContexts.length,
      classifications: byClassification,
      concreteResourceStringCount: concreteResourceStrings.length,
    },
    concreteResourceStrings,
    callerContexts,
    interpretation:
      "FUN_00af8b20/FUN_00af9124 callers currently resolve to menu/UI 3D mesh renderers such as guild banners, chests, loot cards, talent coins, and ascension UI. This is evidence for a menu mesh probe path, not proof of the hero presentation lighting profile.",
  };
}

function menuMeshOmniLightLinks(nativeEffectRuntimeLinks) {
  return (nativeEffectRuntimeLinks?.items || []).filter((item) => item.relationshipKind === "menu-mesh-omni-light");
}

function importantCurrentAnchorReferences(currentNativeAnchorAudit) {
  const importantNames = new Set([
    "LevelVisuals",
    "LightPlacement",
    "TOK_RAW typeinfo=%s field=%s bytes=%d",
    "TOK_ATOM typeinfo=%s field=%s value=%s",
    "OmniLight.Position",
    "OmniLight.Color",
    "OmniLight.Attenuation",
    "Probe.Samples",
  ]);
  return (currentNativeAnchorAudit?.textReferences || [])
    .filter((reference) => importantNames.has(reference.targetName))
    .map((reference) => ({
      targetName: reference.targetName,
      targetKind: reference.targetKind,
      targetAddress: reference.targetAddressHex,
      xrefAddress: reference.xrefAddressHex,
      mode: reference.mode,
    }));
}

function importantCurrentChainRecords(currentNativeLightProbeChainAudit) {
  const importantNames = new Set([
    "type-registry-common",
    "levelvisuals-field-table-init",
    "levelvisuals-register",
    "char-star-register",
    "levelvisuals-runtime-constructor",
    "levelvisuals-runtime-destructor",
    "level-runtime-visuals-module-register",
    "level-runtime-visuals-loader",
    "level-runtime-tail-loader-thunk",
    "levelvisuals-runtime-apply-processor",
    "tok-raw-parser",
    "menu-mesh-light-probe-owner-vtable-neighbor",
    "menu-mesh-light-probe-writer",
    "scene-omnilight-probe-writer-a",
    "scene-omnilight-probe-writer-b",
    "scene-probe-service-global-init",
    "scene-probe-service-global-destroy",
    "scene-probe-service-entry-default-upload",
    "scene-probe-service-entry-resource-a",
    "scene-probe-service-entry-resource-b",
    "scene-probe-service-entry-resource-c",
    "scene-probe-service-entry-light-upload",
    "scene-probe-service-entry-position-sample-upload",
    "scene-probe-service-entry-profile-payload-load",
    "scene-probe-service-entry-getter",
    "scene-probe-service-manager-constructor",
    "scene-probe-service-manager-destructor",
    "scene-probe-service-wrapper-constructor",
    "scene-probe-service-inner-constructor",
    "scene-probe-inner-position-sample-entry",
    "scene-probe-lightfield-position-sampler",
    "scene-probe-inner-profile-payload-entry",
    "scene-probe-lightfield-profile-parser",
    "scene-probe-inner-reset-entry",
    "scene-probe-lightfield-reset-state",
    "scene-probe-position-sample-uploader-a",
    "scene-probe-position-sample-uploader-b",
    "semantic-vec3-writer",
    "semantic-vec4-writer",
    "semantic-index-lookup",
    "scene-probe-wrapper-vtable-base",
    "scene-probe-writer-vtable-base",
    "scene-probe-writer-vtable-slot-a",
    "scene-probe-writer-vtable-slot-b",
    "scene-probe-inner-vtable-base",
    "scene-probe-inner-vtable-primary",
    "scene-probe-inner-vtable-position-sample-slot",
    "scene-probe-inner-vtable-profile-payload-slot",
    "scene-probe-inner-vtable-reset-slot",
    "light-placement-like-vtable-base",
    "light-value-like-vtable-base",
    "scene-probe-service-global-slot",
    "current-levelvisuals-type-object",
    "current-levelvisuals-field-table-start",
    "current-levelvisuals-field-table-end",
    "current-lightplacement-starstar-type-object",
    "current-char-star-type-object",
    "current-position-sample-uploader-vtable-a",
    "current-position-sample-uploader-vtable-b",
    "current-levelvisuals-runtime-vtable-base",
    "current-levelvisuals-runtime-vtable-primary",
    "current-level-runtime-visuals-loader-slot",
    "current-level-runtime-tail-loader-slot",
  ]);
  return (currentNativeLightProbeChainAudit?.records || [])
    .filter((record) => importantNames.has(record.name))
    .map((record) => ({
      name: record.name,
      virtualAddress: record.virtualAddressHex,
      directCallerCount: record.directCallers?.length || 0,
      directCallers: (record.directCallers || []).slice(0, 16).map((caller) => ({
        address: caller.callerAddressHex,
        mode: caller.mode || "bl",
      })),
      dataReferences: (record.dataReferences || []).map((reference) => ({
        virtualAddress: reference.virtualAddressHex,
        section: reference.section,
      })),
      textAddressReferences: (record.textAddressReferences || []).map((reference) => ({
        xrefAddress: reference.xrefAddressHex,
        mode: reference.mode,
      })),
      pointerNeighborhoods: (record.pointerNeighborhoods || []).map((neighborhood) => ({
        referenceAddress: neighborhood.referenceAddressHex,
        section: neighborhood.section,
        codePointers: (neighborhood.entries || [])
          .filter((entry) => entry.kind === "code-pointer")
          .map((entry) => ({
            slotAddress: entry.slotAddressHex,
            relativeOffset: entry.relativeOffsetHex,
            value: entry.valueHex,
          })),
      })),
    }));
}

function importantCurrentOwnerDefinitionAudit(currentNativeOwnerDefinitionAudit) {
  if (!currentNativeOwnerDefinitionAudit) return null;
  return {
    summary: currentNativeOwnerDefinitionAudit.summary || null,
    resourceLoaderAddress: currentNativeOwnerDefinitionAudit.resourceLoaderAddress || "",
    records: (currentNativeOwnerDefinitionAudit.records || []).map((record) => ({
      name: record.name,
      role: record.role,
      virtualAddress: record.virtualAddressHex,
      callers: (record.callers || []).map((caller) => ({
        callerAddress: caller.callerAddressHex,
        mode: caller.mode,
        classification: caller.classification,
        resourceRequests: (caller.resourceRequests || []).map((request) => request.value),
      })),
    })),
    interpretation:
      "Current-binary callsites that attach definitions to the +0x1a0 owner field resolve to menu/UI resources, so the +0x1a0 menu mesh light/probe path is negative evidence for hero character lighting takeover.",
  };
}

function importantCurrentLevelVisualsSchemaAudit(currentNativeLevelVisualsSchemaAudit) {
  if (!currentNativeLevelVisualsSchemaAudit) return null;
  return {
    summary: currentNativeLevelVisualsSchemaAudit.summary || null,
    anchors: currentNativeLevelVisualsSchemaAudit.currentAnchors || null,
    levelVisualsRefFields: (currentNativeLevelVisualsSchemaAudit.levelVisualsRefFields || []).map((field) => ({
      fieldIndex: field.fieldIndex,
      fieldOffset: field.fieldOffsetHex,
      fieldSpan: field.fieldSpanHex,
      typeName: field.typeName,
      inferredRole: field.inferredRole,
      typeObjectAddress: field.typeObjectAddressHex,
      registrationCallAddress: field.registrationCallAddressHex,
      typeAddressSource: field.typeAddressSource,
    })),
    levelFields: (currentNativeLevelVisualsSchemaAudit.levelFields || []).map((field) => ({
      fieldIndex: field.fieldIndex,
      fieldOffset: field.fieldOffsetHex,
      fieldSpan: field.fieldSpanHex,
      typeName: field.typeName,
      inferredRole: field.inferredRole,
      typeObjectAddress: field.typeObjectAddressHex,
      registrationCallAddress: field.registrationCallAddressHex,
      typeAddressSource: field.typeAddressSource,
    })),
    fields: (currentNativeLevelVisualsSchemaAudit.fields || []).map((field) => ({
      fieldIndex: field.fieldIndex,
      fieldOffset: field.fieldOffsetHex,
      fieldSpan: field.fieldSpanHex,
      typeName: field.typeName,
      typeObjectAddress: field.typeObjectAddressHex,
      registrationCallAddress: field.registrationCallAddressHex,
      typeAddressSource: field.typeAddressSource,
    })),
    positionSampleUploadCallers: (currentNativeLevelVisualsSchemaAudit.positionSampleUploadCallers || []).map((caller) => ({
      callerAddress: caller.callerAddressHex,
      mode: caller.mode,
      evidence: caller.evidence,
    })),
    runtimeProcessor: currentNativeLevelVisualsSchemaAudit.runtimeProcessor || null,
    interpretation:
      "Current-binary LevelVisualsRef schema evidence confirms the one-field ref object stores a +0x0 char* resource key. Level schema evidence confirms Level is a 0x198-byte type with 23 descriptors, including +0x10 LevelVisualsRef** references, +0x158 secondary callback payload, +0x160/+0x190 per-entry lists, +0x170 loader state, +0x178 finalizer data, and +0x188 cleanup/scan data. LevelVisuals schema evidence confirms +0x48 LightPlacement**, +0x50 char*, and +0x58 StaticLensFlare**. The current Level loader confirms that Level +0x10 references are resolved through the resource table and type-checked as LevelVisuals before they feed the apply processor, and the apply processor confirms that the +0x50 char payload is sent into the scene/probe profile/lightfield payload-load entry, not the final position sampler. It still does not prove which LevelVisuals instance is active for hero/model preview or which sample position is used.",
  };
}

function importantCurrentLevelRuntimeOwnerAudit(
  currentNativeLevelRuntimeOwnerAudit,
  typedObjectRuntimeKeyPayloadAudit = null,
) {
  if (!currentNativeLevelRuntimeOwnerAudit) return null;
  return {
    summary: currentNativeLevelRuntimeOwnerAudit.summary || null,
    addresses: currentNativeLevelRuntimeOwnerAudit.addresses || null,
    opcodeMismatches: (currentNativeLevelRuntimeOwnerAudit.instructionEvidence || [])
      .filter((row) => !row.matched)
      .map((row) => ({
        label: row.label,
        address: row.addressHex,
        actualOpcodeHex: row.actualOpcodeHex,
        expectedOpcodeHex: row.expectedOpcodeHex,
      })),
    moduleRegistrationNeighborCalls: (currentNativeLevelRuntimeOwnerAudit.moduleRegistrationNeighborCalls || []).map(
      (call) => ({
        callerAddress: call.callerAddressHex,
        targetAddress: call.targetAddressHex,
        mode: call.mode,
        isLevelRuntimeModuleRegistration: call.isLevelRuntimeModuleRegistration,
      }),
    ),
    keyAddressReferences: (currentNativeLevelRuntimeOwnerAudit.addressReferences || [])
      .filter((record) =>
        [
          "levelRuntimeModuleRegistration",
          "levelRuntimeObjectInitializer",
          "levelRuntimeVirtualInvokeCallback",
          "levelRuntimeOwnerDispatch",
          "levelRuntimeOwnerDispatchCallsite",
          "levelRuntimeOwnerDispatchCallerFunction",
          "levelRuntimeVisualsLoader",
          "levelRuntimeVisualsLoaderTailThunk",
          "levelRuntimeVtableBase",
          "levelSetupModuleRegistration",
          "levelSetupModuleObjectInitializer",
          "levelSetupModuleVirtualInvokeCallback",
          "levelSetupRegisteredCallback",
          "levelSetupCallbackGenericRegistrationCallsite",
          "levelSetupRuntimeIndexGlobalSlot",
          "levelSetupRegistryRecordGlobalSlot",
          "levelSetupSecondaryResourceGlobalSlot",
          "levelVisualsSecondaryCallbackDescriptorGlobalSlot",
          "genericCallbackRegistryGlobalSlot",
          "genericCallbackDispatchHelper",
          "genericCallbackDispatchHelperCallsiteManifestA",
          "genericCallbackDispatchHelperCallsiteManifestB",
          "genericCallbackDispatchHelperCallsiteManifestC",
          "genericCallbackDispatchHelperCallsiteObjectBuilderA",
          "genericCallbackDispatchHelperCallsiteObjectBuilderB",
          "descriptorPayloadResolverShim",
          "descriptorPayloadResolver",
          "resourceKeyTableGlobalAccessor",
          "resourceKeyByIdLookup",
          "resourceKeyToStringLookup",
          "runtimeResolvedKeyObjectRequestGetterCallsite",
          "runtimeResolvedKeyObjectRequestPostAccessorCallsite",
          "runtimeResolvedKeyObjectRequestHelperCallsite",
          "runtimeResolvedKeyObjectRequestLevelSetupIndexLoad",
          "runtimeResolvedKeyObjectRequestIndexQueryCallsite",
          "runtimePlayerLockResolvedKeyQueryA",
          "runtimePlayerLockResolvedKeyQueryACallsite",
          "runtimePlayerLockResolvedKeyQueryB",
          "runtimePlayerLockResolvedKeyQueryBCallsite",
          "runtimePlayerLockResolvedKeyQueryC",
          "runtimePlayerLockResolvedKeyQueryCCallsite",
          "runtimePlayerLockKeyedDispatchLoopResolvedKeyGetter",
          "runtimePlayerLockKeyedDispatchLoopCallsite",
          "runtimeResolvedKeyOwnerResolveIndexQueryCGetter",
          "runtimeResolvedKeyOwnerResolveIndexQueryCCallsite",
          "runtimeResolvedKeyOwnerResolveIndexQueryDGetterA",
          "runtimeResolvedKeyOwnerResolveIndexQueryDGetterB",
          "runtimeResolvedKeyOwnerResolveIndexQueryDCallsite",
          "typedObjectDispatcher",
          "typedObjectDispatcherFrameStreamFunction",
          "typedObjectFrameSourceConstructor",
          "typedObjectFrameSourceVtableAddressPoint",
          "typedObjectFrameSourceClearPending",
          "typedObjectFrameSourceResetLikeFunction",
          "typedObjectDispatcherFrameStreamBufferedCountLoad",
          "typedObjectDispatcherFrameStreamByteReadCallsite",
          "typedObjectDispatcherFrameStreamFrameLengthLoad",
          "typedObjectDispatcherFrameStreamBufferCompactCallsite",
          "typedObjectDispatcherFrameCallerCallsite",
          "typedObjectDispatcherTimedQueueFunction",
          "typedObjectTimedSourceConstructorA",
          "typedObjectTimedSourceConstructorB",
          "typedObjectTimedSourceDestructor",
          "typedObjectTimedSourceChildFrameOwnerInitializer",
          "typedObjectTimedSourceVtableAddressPoint",
          "typedObjectDispatcherTimedQueueVtableSlotUpdate",
          "typedObjectDispatcherTimedQueuePayloadPointer",
          "typedObjectDispatcherTimedQueueReadCallsite",
          "typedObjectDispatcherTimedQueueLengthLoad",
          "typedObjectDispatcherTimedQueueCallerCallsite",
          "typedObjectAlternateReplaySourceConstructor",
          "typedObjectAlternateReplaySourceVtableAddressPoint",
          "typedObjectReplaySourceSelector",
          "typedObjectReplaySourceSelectorRuntimeSwitchCaller",
          "typedObjectReplaySourceSelectorRuntimeSwitchCallsite",
          "typedObjectReplaySourceSelectorStartupInitCaller",
          "typedObjectReplaySourceSelectorStartupInitCallsite",
          "typedObjectReplaySourceSelectorStartupAllocator",
          "typedObjectReplaySourceSelectorStartupAllocatorCallsite",
          "typedObjectReplaySourceSelectorModeZeroThunk",
          "typedObjectReplaySourceSelectorModeZeroThunkCallsite",
          "typedObjectReplaySourceGlobalSlot",
          "typedObjectReplaySourceModeTimedAllocCallsite",
          "typedObjectReplaySourceModeAlternateAllocCallsite",
          "typedObjectReplaySourceGlobalStore",
          "typedObjectReplaySourceGlobalLoad",
          "typedObjectReplaySourceSlot10Forwarder",
          "typedObjectReplaySourceSlot38Forwarder",
          "typedObjectDispatcherJumpTable",
          "objectBuilderBDispatchCase",
          "objectBuilderBParserWrapper",
          "objectBuilderBConstructor",
          "objectBuilderBVtableObjectPointer",
          "typedObjectVgrPathBuilder",
          "typedObjectVgrOpenFunction",
          "typedObjectVgrReadFunction",
          "typedObjectVgrReplayInputSetup",
          "typedObjectVgrReplayReadListAppend",
          "typedObjectVgrReplayTypedObjectDecode",
          "typedObjectVgrPathFormatString",
          "typedObjectVgrFileModeString",
          "typedObjectVgrTimestampFormatString",
          "typedObjectVgrFileWriteModeString",
          "typedObjectFreadWrapper",
          "typedObjectRuntimeKeySelectionDispatchCase",
          "typedObjectRuntimeKeySelectionHelper",
          "typedObjectInlineKeyWriterDispatchCase",
          "typedObjectInlineKeyWriterHelper",
          "typedObjectInlineKeyWriterHelperCallsite",
          "runtimeResourceKeySelectionSetter",
          "runtimeResourceKeyGlobalSetter",
          "runtimeResourceKeyGlobalResolver",
          "runtimeResourceKeyResolvedAccessor",
          "runtimeResourceKeyPostAccessor",
          "runtimeResourceKeyGlobalStringSlot",
          "runtimeResourceKeyGlobalResolvedSlot",
          "runtimeResourceKeyStatusPredicate",
          "runtimeCurrentKeyOwnerGlobalSlot",
          "runtimeCurrentKeyOwnerGlobalMaybeSlot",
          "runtimeCurrentKeyOwnerAccessor",
          "runtimeCurrentKeyOwnerStatusAccessor",
          "runtimeCurrentKeyOwnerConstructor",
          "runtimeCurrentKeyOwnerGlobalStoreCallsite",
          "runtimeCurrentKeyOwnerDestructor",
          "runtimeCurrentKeyOwnerGlobalClearCallsite",
          "runtimeCurrentKeyOwnerChildIndexGlobalSlot",
          "runtimeCurrentKeyOwnerChildIndexRegistration",
          "runtimeCurrentKeyOwnerChildIndexStoreCallsite",
          "runtimeCurrentKeyOwnerChildSlot2Callback",
          "runtimeCurrentKeyOwnerChildSlot4Callback",
          "runtimeCurrentSecondaryObjectIndexGlobalSlot",
          "runtimeCurrentSecondaryObjectIndexRegistration",
          "runtimeCurrentSecondaryObjectIndexStoreCallsite",
          "runtimeCurrentSecondaryObjectKeyedCallbackFirst",
          "runtimeCurrentSecondaryObjectSlot2Callback",
          "runtimeCurrentSecondaryObjectSlot4Callback",
          "runtimeCurrentOwnerChildAccessor",
          "runtimeCurrentOwnerActiveStateBridge",
          "runtimeCurrentOwnerPositionBridge",
          "runtimeCurrentOwnerStateRefreshBridge",
          "runtimeCurrentOwnerStateCleanupBridge",
          "runtimeCurrentOwnerStateBridgeThunkA",
          "runtimeCurrentOwnerStateBridgeThunkB",
          "runtimeCurrentOwnerRegistrationHubCallsite",
          "runtimeCurrentOwnerRegistrationBuilder",
          "runtimeCurrentOwnerRegistryIndexGlobalSlot",
          "runtimeCurrentOwnerRegistryIndexLazyInitializer",
          "runtimeCurrentOwnerRegistryIndexLazyStoreCallsite",
          "runtimeCurrentOwnerRegistryIndexLazyGuardSlot",
          "runtimeCurrentOwnerRegistryIndexLazySourceSlot",
          "runtimeCurrentOwnerPrimaryCallbackTable",
          "runtimeCurrentOwnerSecondaryCallbackTable",
          "runtimeCurrentOwnerSlot4Callback",
          "runtimeCurrentOwnerSlot4UpdateDispatcher",
          "runtimeCurrentOwnerStatePositionProjector",
          "runtimeCurrentOwnerStateAttach",
          "runtimeCurrentOwnerPostAttachTransformRefresh",
          "runtimeCurrentOwnerHudMinimapConstructor",
          "runtimeCurrentOwnerHudMinimapDestructor",
          "runtimeCurrentOwnerHudMinimapDeleteThunk",
          "runtimeCurrentOwnerHudMinimapUpdate",
          "runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteA",
          "runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteB",
          "runtimeCurrentOwnerHudMinimapLargeOwnerConstructorCallsiteC",
          "runtimeCurrentOwnerHudMinimapUpdateCallsiteA",
          "runtimeCurrentOwnerHudMinimapUpdateCallsiteB",
          "runtimeCurrentOwnerHudMinimapUpdateCallsiteC",
          "runtimeCurrentOwnerHudMinimapVtablePrimary",
          "runtimeCurrentOwnerHudMinimapSubobjectInitializer",
          "runtimeCurrentOwnerHudMinimapSubobjectDestructor",
          "runtimeCurrentOwnerHudMinimapSubobjectUpdate",
          "runtimeCurrentOwnerHudMinimapSubobjectLayoutUpdate",
          "runtimeCurrentOwnerHudMinimapPositionSampler",
          "runtimeCurrentOwnerHudMinimapSubobjectVtablePrimary",
          "runtimeCurrentOwnerHudMinimapPositionSamplerVtableSlot",
          "hudMinimapString",
          "hudMinimapBuildPathFormatString",
          "runtimePlayerLockIndexGlobalSlot",
          "runtimePlayerLockRegistrationHubCallsite",
          "runtimePlayerLockRegistration",
          "runtimePlayerLockObjectInitializer",
          "runtimePlayerLockVirtualInvokeCallback",
          "runtimePlayerLockSlotInstallerCallsite",
          "runtimePlayerLockKeyedCallbackRegistrationCallsite",
          "runtimePlayerLockIndexMatchCallback",
          "runtimePlayerLockOwnerCreateFromCurrentKey",
          "runtimePlayerLockOwnerCreateIndexLoad",
          "runtimePlayerLockOwnerCreateCallsite",
          "runtimePlayerLockSimpleIndexQuery",
          "runtimePlayerLockSimpleIndexQueryLoad",
          "runtimePlayerLockSimpleIndexQueryCallsite",
          "runtimePlayerLockResolvedKeyQueryA",
          "runtimePlayerLockResolvedKeyQueryACallsite",
          "runtimePlayerLockResolvedKeyQueryB",
          "runtimePlayerLockResolvedKeyQueryBCallsite",
          "runtimePlayerLockResolvedKeyQueryC",
          "runtimePlayerLockResolvedKeyQueryCCallsite",
          "runtimePlayerLockKeyedDispatchLoop",
          "runtimePlayerLockKeyedDispatchLoopCallsite",
          "runtimePlayerLockKeyedCallbackIdCallsite",
          "playerLockString",
          "hudRuntimeString",
          "tutorialFiveClientString",
          "visionTotemString",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadKnownRequest",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterA",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterB",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterC",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadCounterD",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueA",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexLoadValueB",
          "runtimeResolvedKeyObjectRequestOwnerRegistrationHubCallsite",
          "runtimeResolvedKeyObjectRequestOwnerRegistration",
          "runtimeResolvedKeyObjectRequestOwnerPrimaryCallback",
          "runtimeResolvedKeyObjectRequestOwnerSlot0RegisterCallsite",
          "runtimeResolvedKeyObjectRequestOwnerSlot1Callback",
          "runtimeResolvedKeyObjectRequestOwnerSlot1RegisterCallsite",
          "runtimeResolvedKeyObjectRequestOwnerSlot4Callback",
          "runtimeResolvedKeyObjectRequestOwnerSlot4RegisterCallsite",
          "runtimeModuleCallbackSlotInstaller",
          "runtimeModuleCallbackSlotDispatch",
          "runtimeModuleCallbackSlotDispatchRecords",
          "runtimeModuleCallbackFrameDispatch",
          "runtimeModuleCallbackFrameDispatchSlot6",
          "runtimeModuleCallbackFrameDispatchCallsite",
          "runtimeModuleCallbackFrameDispatchSlot6Callsite",
          "runtimeModuleCallbackLateSlotDispatchCallsite",
          "runtimeModuleObjectCreateWrapper",
          "runtimeModuleObjectLookupOrCreate",
          "runtimeModuleObjectSlot0Create",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexGlobalSlot",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexRegistration",
          "runtimeResolvedKeyObjectRequestOwnerResolveIndexStoreCallsite",
          "runtimeResolvedKeyObjectRequestRelatedCreateIndexGlobalSlot",
          "runtimeResolvedKeyObjectRequestRelatedCreateIndexRegistration",
          "runtimeResolvedKeyObjectRequestRelatedCreateIndexStoreCallsite",
          "runtimeResolvedKeyObjectRequestOwnerResolveCallsite",
          "runtimeResolvedKeyObjectRequestRelatedCreateCallsite",
          "runtimeResolvedKeyObjectRequestRelatedStoreCallsite",
          "runtimeResolvedKeyObjectRequestGetterCallsite",
          "runtimeResolvedKeyObjectRequestPostAccessorCallsite",
          "runtimeResolvedKeyObjectRequestHelperCallsite",
          "runtimeResolvedKeyObjectRequestLevelSetupIndexLoad",
          "runtimeResolvedKeyObjectRequestIndexQueryCallsite",
          "runtimeResolvedKeyObjectRequestResultLoad",
          "runtimeResolvedKeyObjectRequestContextAccessor",
          "runtimeResolvedKeyObjectRequestContextListAApplyCallsite",
          "runtimeResolvedKeyObjectRequestContextListBApplyCallsite",
          "runtimeResolvedKeyObjectListProcessor",
          "runtimeResolvedKeyObjectListProcessorArrayLookup",
          "runtimeResolvedKeyObjectListProcessorArrayHashLookup",
          "runtimeResolvedKeyObjectListProcessorSingleLookup",
          "runtimeResolvedKeyObjectListProcessorSingleHashLookup",
          "runtimeResolvedKeyObjectEntryApply",
          "runtimeResolvedKeyObjectEntryRegistryIndexGlobalSlot",
          "runtimeResolvedKeyObjectEntryDefaultScaleGlobalSlot",
          "runtimeResolvedKeyObjectEntrySecondaryIndexGlobalSlot",
          "runtimeResolvedKeyObjectEntryTransformWriter",
          "runtimeResolvedKeyObjectEntrySecondaryAttach",
          "runtimeResolvedKeyObjectEntryScratchBuilder",
          "runtimeResolvedKeyObjectEntryHashInsert",
          "characterLobbyOwnerInitializer",
          "characterLobbyOwnerPrimaryVtable",
          "characterLobbyRuntimeKeySwitchCallback",
          "characterLobbyRuntimeKeySwitchVtableSlot",
          "characterLobbyRuntimeKeySwitchThunk",
          "characterLobbySubobjectVtable",
          "characterLobbyStateRefresh",
          "characterLobbyModeSwitcher",
          "characterLobbyStateAConstructor",
          "characterLobbyStateARefresh",
          "characterLobbyStateADestructor",
          "characterLobbyStateAApplyPayload",
          "characterLobbyStateAPayloadSelect",
          "characterLobbyStateARebuildVisualLists",
          "characterLobbyStateAUpdateVisualItems",
          "characterLobbyStateBConstructor",
          "characterLobbyStateBRefresh",
          "characterLobbyStateBDestructor",
          "characterLobbyStateBApplyPayload",
          "characterLobbyStateBPayloadSelect",
          "characterLobbyStateBRebuildVisualLists",
          "characterLobbyStateBUpdateVisualItems",
          "uiCharacterLobbyEnteredSoundString",
          "characterLobbyDraftSelectHeroString",
          "characterLobbyDraftLockInHeroString",
          "characterLobbyDraftLockedInButtonString",
          "characterLobbyDraftHeroBanSoundString",
          "characterLobbyDraftLockInSoundString",
          "characterLobbyDraftSwapHeroesVoiceString",
          "characterLobbyDraftNamedAllySelectingString",
          "characterLobbyDraftNamedEnemySelectingString",
          "characterLobbyDraftNamedEnemyBanningString",
          "objectBuilderAFunction",
          "objectBuilderBFunction",
          "objectBuilderBLevelSetupIndexQueryCallsite",
          "genericCallbackIndexQuery",
          "genericCallbackDispatch",
          "genericCallbackDispatchCallsiteFromLevelRuntimeVisualsLoader",
          "genericCallbackDispatchCallsiteFromLevelSetup",
          "genericCallbackDispatchCallsiteFromGlobalDispatch",
          "genericCallbackDispatchPayloadResolver",
          "genericCallbackRegistration",
          "genericCallbackRegistrationTreeInsert",
          "sceneProbeProfilePayloadLoad",
        ].includes(record.name),
      )
      .map((record) => ({
        name: record.name,
        address: record.addressHex,
        directCallers: (record.directCallers || []).map((caller) => ({
          callerAddress: caller.callerAddressHex,
          mode: caller.mode,
        })),
        u64References: (record.u64References || []).map((reference) => ({
          virtualAddress: reference.virtualAddressHex,
          section: reference.section,
        })),
        textReferences: (record.textReferences || []).map((reference) => ({
          xrefAddress: reference.xrefAddressHex,
          mode: reference.mode,
        })),
      })),
    runtimeResolvedKeyLocalConsumerBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResolvedKeyLocalConsumerBranches || [],
    runtimeResolvedKeyLocalProfileConsumerBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResolvedKeyLocalProfileConsumerBranches || [],
    runtimeResourceKeyGlobalSetterLocalBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyGlobalSetterLocalBranches || [],
    runtimeResourceKeyGlobalSetterLocalProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyGlobalSetterLocalProfileBranches || [],
    runtimeResourceKeyStatusPredicateLocalBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyStatusPredicateLocalBranches || [],
    runtimeResourceKeyStatusPredicateLocalProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyStatusPredicateLocalProfileBranches || [],
    typedObjectInlineKeyWriterJumpTableEntry:
      currentNativeLevelRuntimeOwnerAudit.typedObjectInlineKeyWriterJumpTableEntry || null,
    characterLobbyRuntimeProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.characterLobbyRuntimeProfileBranches || [],
    characterLobbyStateObjectProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.characterLobbyStateObjectProfileBranches || [],
    runtimePlayerLockProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimePlayerLockProfileBranches || [],
    runtimeOwnerResolveIndexProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeOwnerResolveIndexProfileBranches || [],
    runtimeResolvedKeyObjectRequestOwnerProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResolvedKeyObjectRequestOwnerProfileBranches || [],
    runtimeResolvedKeyObjectEntryApplyProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.runtimeResolvedKeyObjectEntryApplyProfileBranches || [],
    typedObjectDispatcherInputSourceProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.typedObjectDispatcherInputSourceProfileBranches || [],
    typedObjectVgrLocalFileScanRoots:
      currentNativeLevelRuntimeOwnerAudit.typedObjectVgrLocalFileScanRoots || [],
    typedObjectVgrLocalFileCandidates:
      currentNativeLevelRuntimeOwnerAudit.typedObjectVgrLocalFileCandidates || [],
    genericCallbackDispatchCallsiteContexts:
      currentNativeLevelRuntimeOwnerAudit.genericCallbackDispatchCallsiteContexts || [],
    genericCallbackDispatchHelperCallsiteContexts:
      currentNativeLevelRuntimeOwnerAudit.genericCallbackDispatchHelperCallsiteContexts || [],
    latestRuntimeSelectorNarrowing:
      "The seven direct 0x188e338 helper callsites are now parameter-source classified. Three are level-definition manifest fallbacks, one is a runtime temporary-key pre-owner dispatch, one is an object-builder resource-key request without a Level setup query, and only 0x8befac plus 0xc04b98 continue into Level setup index 0x2d44e98 queries. The next unresolved edge is the concrete resource key/table entry selected by those two active-preview candidate paths, not the generic callback helper mechanics.",
    latestTypedObjectVgrBoundary:
      "Object-builder B's resource key is now bounded to typed-object 0x03f3 payload word0 -> constructor arg w1 -> object +0x1c -> resource-key table lookup. The same file subsystem reads %s/%s.%d.vgr with rb and formats timestamped _%Y-%m-%dT%H-%M-%S.dat records with wb, while the current extracted roots expose no local .vgr stream candidates. That keeps concrete key-value recovery diagnostic-only until a .vgr/frame payload capture or deeper path-source trace is available.",
    latestCharacterLobbyKeySwitchBoundary:
      "The remaining non-stream global key setter caller 0xa7ca30 is now bounded as a CharacterLobby record callback: record +0x0 is a 0..4 mode enum, record +0x4 is the key string copied into the global runtime key slot, and the mode dispatch only feeds 0xa7c934 lobby state selection. This keeps the branch diagnostic-only until a Level/Profile/Probe connection is proven.",
    latestLevelSetupDescriptorStaticBoundary:
      "The Level setup descriptor/callback is now statically bounded in the current Android binary: descriptor slot 0x2ae61c8 has only the registration load at 0xc79aac plus one relocation/data reference and no direct branch callers, while callback 0xc79ad4 has only the registration payload reference at 0xc79ab8 and no direct callers. The missing active-preview edge must therefore be recovered as a runtime descriptor/payload key match into 0x2ae61c8, not as a hidden static caller.",
    latestLevelTypeDescriptorBoundary:
      "The Level setup callback descriptor is now typed in the current Android binary: GOT slot 0x2ae61c8 points through descriptor pointer slot 0x2af0cf8 to the Level type descriptor at 0x3047e90. Initializer 0x7cd9e0 calls the generic type descriptor initializer with name 'Level', kind 1, size 0x198, field-table pointers 0x30506e0/0x3050858, and computed descriptor key 0x858E20D4. The next active-preview search should target runtime resolver paths that match this Level descriptor key and return a Level payload.",
    descriptorPayloadResolverShimProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.descriptorPayloadResolverShimProfileBranches || [],
    descriptorPayloadResolverShimCallerContexts:
      currentNativeLevelRuntimeOwnerAudit.descriptorPayloadResolverShimCallerContexts || [],
    runtimeResourceKeyStaticRecoveryGate:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyStaticRecoveryGate || null,
    runtimeResourceKeyUpstreamRecoveryAudit:
      currentNativeLevelRuntimeOwnerAudit.runtimeResourceKeyUpstreamRecoveryAudit || null,
    runtimeResolvedKeyIndexQueryConsumerAudit:
      currentNativeLevelRuntimeOwnerAudit.runtimeResolvedKeyIndexQueryConsumerAudit || null,
    typedObjectInputSourceOwnershipAudit:
      currentNativeLevelRuntimeOwnerAudit.typedObjectInputSourceOwnershipAudit || null,
    typedObjectReplaySourceSelectorProfileBranches:
      currentNativeLevelRuntimeOwnerAudit.typedObjectReplaySourceSelectorProfileBranches || [],
      typedObjectReplaySourceSelectorCallerAudit:
        currentNativeLevelRuntimeOwnerAudit.typedObjectReplaySourceSelectorCallerAudit || null,
      typedObjectRuntimeKeyPayloadAudit: typedObjectRuntimeKeyPayloadAudit
        ? {
            state: typedObjectRuntimeKeyPayloadAudit.state,
            fileCount: typedObjectRuntimeKeyPayloadAudit.fileCount,
            scannedFileCount: typedObjectRuntimeKeyPayloadAudit.scannedFileCount,
            frameCandidateCount: typedObjectRuntimeKeyPayloadAudit.frameCandidateCount,
            frameCandidateTypeCounts: typedObjectRuntimeKeyPayloadAudit.frameCandidateTypeCounts || {},
            keyStringCandidateCount: typedObjectRuntimeKeyPayloadAudit.keyStringCandidateCount,
            resourceLikeKeyStringCount: typedObjectRuntimeKeyPayloadAudit.resourceLikeKeyStringCount,
            exactKeyStringMatchCount: typedObjectRuntimeKeyPayloadAudit.exactKeyStringMatchCount,
            objectBuilderWord0CandidateCount:
              typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0CandidateCount,
            objectBuilderWord0EngineHashMatchCount:
              typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0EngineHashMatchCount,
            objectBuilderWord0NativeEngineHashMatchCount:
              typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0NativeEngineHashMatchCount,
            objectBuilderWord0BigEndianEngineHashMatchCount:
              typedObjectRuntimeKeyPayloadAudit.objectBuilderWord0BigEndianEngineHashMatchCount,
            concreteRuntimeKeyFieldMatchedResourceIndex:
              typedObjectRuntimeKeyPayloadAudit.concreteRuntimeKeyFieldMatchedResourceIndex,
            activePreviewProof: typedObjectRuntimeKeyPayloadAudit.activePreviewProof,
            blocker: typedObjectRuntimeKeyPayloadAudit.blocker,
          }
        : null,
      globalSlotStores: currentNativeLevelRuntimeOwnerAudit.globalSlotStores || [],
    recovered: currentNativeLevelRuntimeOwnerAudit.recovered || [],
    blockers: currentNativeLevelRuntimeOwnerAudit.blockers || [],
    interpretation:
      "Current-binary Level runtime owner evidence proves module registration, vtable installation, the secondary thunk, owner +0x30 active-Level state, registry dispatch through owner vtable +0x20, registration of the Level setup callback 0xc79ad4, descriptor/payload resolution through 0x188cc88/0x188f8f8, generic callback helper dispatch through 0x188e338/0x188eba4, and the object-builder B branch that queries Level setup runtime index 0x2d44e98. The Level setup descriptor/callback static boundary is now closed: 0x2ae61c8 is only loaded at registration, and 0xc79ad4 is only referenced as the registered callback payload, so the unresolved upstream edge must be a runtime descriptor/payload match rather than a hidden direct branch. The object-builder B branch is now tied to typed-object id 0x03f3/1011 through the current-binary typed-object dispatcher at 0x82dc04, and its resource-key id is traced from 0x03f3 payload word0 into constructor arg w1 and object +0x1c. The typed-object dispatcher input sources are now fully classified as framed stream-buffer input at 0x8130b0 -> 0x8131fc and timed/.vgr queue input at 0x8444e4 -> 0x844588; their strict Level/Profile/Probe local-neighborhood scan stays empty, so this is guardrail evidence rather than active preview proof. Type id 0x046f/1135 now proves a stream-driven runtime resource-key switch into global string slot 0x3051220/resolved slot 0x3051218, and type id 0x03e9/1001 now proves a second typed-object inline key writer through helper 0x82b68c. The current key owner lifecycle is now current-binary evidence: constructor 0x8be378 publishes the active owner into global slot 0x3034cf8 at 0x8be62c, destructor 0x8bed64 clears it at 0x8bed9c, child index registration 0x919530 publishes 0x3034d10 and installs slot callbacks through 0x188c2f4, and secondary current-object registration 0x9131dc publishes 0x2d44e78 with keyed plus slot callbacks. A current owner state/position record registration is now recovered as well: module hub 0x8badcc calls 0x8cfb7c, which publishes registry index 0x3035264, explains the second guarded lazy copy into the same slot at 0x79f3a0, installs slot 4 callback 0x8cfbec, and uses callback tables 0x8d2100/0x8d2124; the slot 4 update path reaches owner +0x828 and position projector 0x8cfe60. One upstream consumer of that record is now classified as HUD/minimap negative evidence: 0x94ad7c labels the object with HUD_Minimap, reads 0x3035264, creates an owner through 0x188e2ac, stores it at object +0x340, and update 0x94aef8 later attaches through 0x8cff24 while doing minimap layout/resource work. A separate 0x2b0f0b0 player-lock/HUD runtime index path is now bounded too: module hub 0x8bae1c calls 0x90c9a4, which publishes index 0x2b0f0b0 and installs slot/keyed callbacks; its local strings are __PLAYER_LOCK__, __HUD__, Tutorial05_5v5_Client, and *VisionTotem*, and its strict Profile/Probe scan is empty, so it explains resolved-key/index-query noise but remains negative evidence. A current owner active-state/position bridge is now recovered too: 0x8d0598 reads the current owner through 0x8be0b0, searches child index 0x3034d10, resolves child data through 0x8bf6c8, queries Level setup index 0x2d44e98 through 0x188e540, and falls back to secondary current-object index 0x2d44e78 from object +0x828. The resolved-key object request owner registration is current-binary evidence too: module hub 0x8bad0c calls 0x8bee60, which installs slot 0 callback 0x8bef18 through shared slot installer 0x188c2f4. The shared slot dispatcher shape is recovered through 0x188c638 -> 0x188bf3c, and the native frame loop calls 0x188e614/0x188e714 to dispatch slots 2-6 through that shared dispatcher. Slot 0 is now recovered as the generic object-create path: 0x188b8b8/0x188e2ac reach 0x188c490 -> 0x188bb94, which invokes record +0xb0 and then record +0x0. The resolved-key request path uses that mechanism at 0x8bef90 and creates/stores a related object through 0x8befc0 at owner +0x2b0. The registry indices used there are sourced now: 0x8b90a0 stores the related-create owner index in 0x3034ce0, and 0xc74158 stores the owner-resolve index in 0x3034d00; all additional current 0x3034d00 consumers are now opcode-bounded and have zero strict local Profile/Probe branches. The current key owner child lookup/create path is also recovered: 0x8bfa6c/0x8bfd84 read 0x3034cf8 and 0x3034d10, search owner +0x18 records, create missing children through 0x188b8b8, then route into 0x919e74/0x919eb8. The resolved-key object-request path then reaches 0x188e338 plus Level setup index query 0x188e540 before applying the matched object through context +0x140/+0x148 processors. That processor is now traced through 0xca3bd0: it chooses array/list lookup 0xc7a400 or single-object lookup 0xc7a2fc, then applies payload +0x10 through 0xca3564, which resolves apply keys, registry objects, transform/orientation payloads, and per-entry hashed data. The global key setter 0xbebf7c now has all three current direct callers bounded: typed-object runtime key selection at 0x8bf574, CharacterLobby at 0xa7ca68, and type 0x03e9 inline copied-key writer helper at 0x82b6c0 that immediately resolves/caches at 0x82b6dc. A non-stream character-lobby candidate also writes the same global key slot from record +0x4 and is adjacent to the ui_character_lobby_entered sound path; it now also proves the cached key validity check through 0xbebf54 -> 0xbec208 before 0xa7c934 mode/state switching. The CharacterLobby mode switch is now bounded one layer deeper: it creates state object A through 0xad54a0 at owner +0xe8 or state object B through 0xacd3cc at owner +0xe0, then forwards their child object through owner vtable slot +0x78. Those state objects register local payload/event callbacks and read/status-check the cached runtime key, but their strict Level/Profile/Probe local-neighborhood scan remains empty; their local strings are MENU_DRAFT_LOBBY label/button keys, ui_drafting hero-ban/lock-in sounds, and VO_Vainglory_SwapHeroes, so this branch is draft-lobby presentation/model-state evidence rather than shader/probe takeover proof. The 0xbebf7c setter callers, the 0xbebf54 resolved-key getter, the 0xbec208 status predicate callers, the 0x8bee60/0x8bef18 request owner registration/slot dispatch, 0xca3bd0/0xca3564 apply path, player-lock/HUD index path, 0x3034d00 owner-resolve index consumers, CharacterLobby state objects, typed-object input sources, and 0x188cc88 descriptor/payload resolver shim callers all have repeatable local-neighborhood scans now; current evidence shows no immediate Level/Profile/Probe branch from those consumers. The 37 direct/tail callers into 0x188cc88 are additionally source-classified into level-definition manifest, progression manifest, hero manifest, HeroManifest dynamic-key helper, resource-key table generic shim, HUD quick-message setup, and generic callback dispatch helper buckets, with zero unbounded active-preview candidates. The three direct 0x188eba4 callsites are now parameter-source classified too: LevelVisuals +0x48 via descriptor slot 0x2ae29a8, internal Level setup +0x158 via secondary slot 0x2ae7ed8, and generic helper descriptor/payload output; none directly uses Level setup registry descriptor slot 0x2ae61c8. It narrows the missing chain to the concrete active-preview resource key/table entry and active preview object-builder path that supplies the hero/model preview Level/Profile to that registered callback.",
  };
}

function importantCurrentPositionSamplerOwnerAudit(currentNativePositionSamplerOwnerAudit) {
  if (!currentNativePositionSamplerOwnerAudit) return null;
  return {
    summary: currentNativePositionSamplerOwnerAudit.summary || null,
    addresses: currentNativePositionSamplerOwnerAudit.addresses || null,
    opcodeMismatches: (currentNativePositionSamplerOwnerAudit.instructionEvidence || [])
      .filter((row) => !row.opcodeMatchesExpected)
      .map((row) => ({
        role: row.role,
        address: row.addressHex,
        opcodeHex: row.opcodeHex,
        expectedOpcodeHex: row.expectedOpcodeHex,
      })),
    ownerVtableEvidence: (currentNativePositionSamplerOwnerAudit.ownerVtableEvidence || []).map((owner) => ({
      command: owner.command,
      ownerConstructorAddress: owner.ownerConstructorAddressHex,
      ownerVtableAddress: owner.ownerVtableAddressHex,
      builderSlotAddress: owner.builderSlotAddressHex,
      builderFunctionAddress: owner.builderFunctionAddressHex,
      queuedCommandVtableAddress: owner.queuedCommandVtableAddressHex,
      vtableWriteAddress: owner.vtableWriteAddress,
      evidence: owner.evidence,
    })),
    renderCommandTransformCopies: (currentNativePositionSamplerOwnerAudit.renderCommandTransformCopies || []).map(
      (command) => ({
        command: command.command,
        builderAddress: command.builderAddressHex,
        ownerVtableAddress: command.ownerVtableAddressHex,
        ownerBuilderSlotAddress: command.ownerBuilderSlotAddressHex,
        queuedCommandVtableAddress: command.queuedCommandVtableAddressHex,
        sourceRegister: command.sourceRegister,
        destinationRegister: command.destinationRegister,
        transformProviderEvidence: command.transformProviderEvidence,
        queueAppendAddress: command.queueAppendAddressHex,
        positionCopy: (command.copies || []).find((copy) => copy.destinationOffset === "0x50") || null,
        copyCount: (command.copies || []).length,
      }),
    ),
    globalFactoryEvidence: currentNativePositionSamplerOwnerAudit.globalFactoryEvidence || null,
    globalSlotTextReferences: currentNativePositionSamplerOwnerAudit.globalSlotTextReferences || [],
    helperDispatcherEvidence: currentNativePositionSamplerOwnerAudit.helperDispatcherEvidence || null,
    resourceContextDispatchEvidence: currentNativePositionSamplerOwnerAudit.resourceContextDispatchEvidence || null,
    resourceHandlerRegistrationEvidence:
      currentNativePositionSamplerOwnerAudit.resourceHandlerRegistrationEvidence || null,
    meshDataRuntimeHandoffEvidence: currentNativePositionSamplerOwnerAudit.meshDataRuntimeHandoffEvidence || null,
    compositeTaskDispatchEvidence: currentNativePositionSamplerOwnerAudit.compositeTaskDispatchEvidence || null,
    sceneEntityEntryArrayEvidence: currentNativePositionSamplerOwnerAudit.sceneEntityEntryArrayEvidence || null,
    sceneEntityManagerLifecycleEvidence:
      currentNativePositionSamplerOwnerAudit.sceneEntityManagerLifecycleEvidence || null,
    sceneEntityRecordEntryEvidence: currentNativePositionSamplerOwnerAudit.sceneEntityRecordEntryEvidence || null,
    sceneEntityRuntimeParamEvidence: currentNativePositionSamplerOwnerAudit.sceneEntityRuntimeParamEvidence || null,
    interpretation:
      "Current-binary position sampler owner evidence shows that 0xe36efc samples the transform column copied into queued render-command objects owned by global render queue owner objects. The upstream dispatch is traced through global helper +0x20 -> e02c80 vtable +0x10 -> 0xe02c94 -> 0xe28660, and the e02c80 context is resolved through d7f00c(1) -> e03474 -> e28418, whose vtable +0x18 lands in e28674. The e28418 handler list is recovered for animData/meshData/shaderData/texData, meshData process e02ac8 reaches 0x18918e4, and 0x18918e4 is now partially traced through runtime object vtable 0x2ab5148 and setup/payload bridges 0x1891a70/0x1890e90/0x1890e98/0x18942f8. The composite-task dispatch shape at vtable 0x2ab5590 -> 0x18a13fc now explains how a task can pass x2 from task +0x58 and x4 as a list entry into entry-object vtable +0x10 calls; constructor evidence narrows those entries to the caller-provided x2 or x2 entry array, and current direct callsites classify as menu mesh, scene entity, particle effect, ScreenNode, ViewNode/ViewRTNode, and shadow tasks. The Draw all scene entities array is now traced into global manager 0x311a960 records. That manager is now recovered as a fixed 0x800-record pool: 0x188eeb4 initializes manager +0x0 as a backing indexed object pointer, records from +0x10, and free-list metadata at +0x8010; 0x188eee0 stores caller-provided entry pointers at record +0x8; 0x188ef88 removes records; and 0x188f020 dispatches per-record payload through backing vtable +0x20. The record +0x8 entries are now tied to add-record callers passing object +0x30, and one setup path stores global render-command owner B from 0x18906ec plus a 0x2726740-derived callback/table pointer into that entry subobject. The primary entry table +0x20 slot now enters the global helper/resource-render dispatch chain through 0x18906b0. The scene/entity render-owner builder invocation is now linked through composite dispatch entry +0x8 -> owner vtable +0x10 -> 0x1892120/0x189366c. The scene/entity x4 transform provider is now linked through entry object +0x30 -> x4-8 object +0x28 -> sub-vtable 0x2726710 +0x18 -> 0xd7ff44 -> object +0x70. The scene/entity x2 runtime-parameter source is now linked to global table slot 0: Draw all scene entities calls 0x189d63c(0), passes the returned 0x311af50 slot object as x4 to 0x18a11e4, and the task stores it at +0x58 before dispatch passes it as x2. The x2 slot0 vtable path is also linked: slot0 vtable +0x10 resolves to 0x189f850, which constructs a 0x2ab54f8 per-command object; render-command A/B builders store that object's +0x10 result at queued command +0x18. That +0x18 value is now classified as the render queue sort key: the queue builds [command+0x18, command] pairs, sorts by the first qword, and re-appends commands. The remaining gap is the active lightfield/profile payload used by hero/model preview.",
  };
}

function buildNativeLightProbeRuntimeEvidence({
  androidLib = defaultAndroidLib,
  nativeEffectRuntimeLinksPath = defaultNativeEffectRuntimeLinksPath,
  menuMeshLightProbeCff0DiagnosticsPath = defaultMenuMeshLightProbeCff0DiagnosticsPath,
  lightfieldRuntimeDiagnosticsPath = defaultLightfieldRuntimeDiagnosticsPath,
  levelVisualProfileDiagnosticsPath = defaultLevelVisualProfileDiagnosticsPath,
  heroPreviewProfileCandidatesPath = defaultHeroPreviewProfileCandidatesPath,
  nativeBinaryVersionAuditPath = defaultNativeBinaryVersionAuditPath,
  currentNativeAnchorAuditPath = defaultCurrentNativeAnchorAuditPath,
  currentNativeLightProbeChainAuditPath = defaultCurrentNativeLightProbeChainAuditPath,
  currentNativeOwnerDefinitionAuditPath = defaultCurrentNativeOwnerDefinitionAuditPath,
  currentNativeLevelVisualsSchemaAuditPath = defaultCurrentNativeLevelVisualsSchemaAuditPath,
  levelVisualsDefinitionFieldBridgePath = defaultLevelVisualsDefinitionFieldBridgePath,
  currentNativeLevelRuntimeOwnerAuditPath = defaultCurrentNativeLevelRuntimeOwnerAuditPath,
  currentNativePositionSamplerOwnerAuditPath = defaultCurrentNativePositionSamplerOwnerAuditPath,
  currentNativePreviewStringXrefAuditPath = defaultCurrentNativePreviewStringXrefAuditPath,
  characterLitProbeBlockerAuditPath = defaultCharacterLitProbeBlockerAuditPath,
  typedObjectRuntimeKeyPayloadAuditPath = defaultTypedObjectRuntimeKeyPayloadAuditPath,
  structuredFunctionsDir = defaultStructuredFunctionsDir,
} = {}) {
  const buffer = fs.readFileSync(androidLib);
  const loadSegments = parseElf64LoadSegments(buffer);
  const currentPackageMenuMeshStringXrefs = buildCurrentPackageMenuMeshStringXrefDiagnostics(buffer, androidLib);
  const nativeEffectRuntimeLinks = readOptionalJson(nativeEffectRuntimeLinksPath);
  const menuMeshLightProbeCff0Diagnostics = readOptionalJson(menuMeshLightProbeCff0DiagnosticsPath);
  const lightfieldRuntimeDiagnostics = readOptionalJson(lightfieldRuntimeDiagnosticsPath);
  const levelVisualProfileDiagnostics = readOptionalJson(levelVisualProfileDiagnosticsPath);
  const heroPreviewProfileCandidates = readOptionalJson(heroPreviewProfileCandidatesPath);
  const nativeBinaryVersionAudit = readOptionalJson(nativeBinaryVersionAuditPath);
  const currentNativeAnchorAudit = readOptionalJson(currentNativeAnchorAuditPath);
  const currentNativeLightProbeChainAudit = readOptionalJson(currentNativeLightProbeChainAuditPath);
  const currentNativeOwnerDefinitionAudit = readOptionalJson(currentNativeOwnerDefinitionAuditPath);
  const currentNativeLevelVisualsSchemaAudit = readOptionalJson(currentNativeLevelVisualsSchemaAuditPath);
  const levelVisualsDefinitionFieldBridge = readOptionalJson(levelVisualsDefinitionFieldBridgePath);
  const currentNativeLevelRuntimeOwnerAudit = readOptionalJson(currentNativeLevelRuntimeOwnerAuditPath);
  const currentNativePositionSamplerOwnerAudit = readOptionalJson(currentNativePositionSamplerOwnerAuditPath);
  const currentNativePreviewStringXrefAudit = readOptionalJson(currentNativePreviewStringXrefAuditPath);
  const characterLitProbeBlockerAudit = readOptionalJson(characterLitProbeBlockerAuditPath);
  const typedObjectRuntimeKeyPayloadAudit = readOptionalJson(typedObjectRuntimeKeyPayloadAuditPath);
  const characterLitProbeSummary = characterLitProbeBlockerAudit?.summary || {};
  const characterLitViewerShaderPortGate = {
    rowsWithViewerShaderPortFormulaReady: characterLitProbeSummary.rowsWithViewerShaderPortFormulaReady || 0,
    rowsBlockedOnlyByRuntimeValues: characterLitProbeSummary.rowsBlockedOnlyByRuntimeValues || 0,
    byViewerShaderPortState: characterLitProbeSummary.byViewerShaderPortState || {},
    byViewerShaderPortBlocker: characterLitProbeSummary.byViewerShaderPortBlocker || {},
    rendererTakeoverAllowed: Boolean(characterLitProbeSummary.rendererTakeoverAllowed),
  };
  const characterLitViewerShaderPortBlocker =
    characterLitViewerShaderPortGate.rowsWithViewerShaderPortFormulaReady > 0
      ? `character-lit/solid-lit viewer formula readiness is classified: ${characterLitViewerShaderPortGate.rowsBlockedOnlyByRuntimeValues} rows are blocked only by active runtime values, ${(characterLitViewerShaderPortGate.byViewerShaderPortState || {})["shader-formula-ready-runtime-scene-texture-missing"] || 0} rows also need runtime scene texture state, and ${(characterLitViewerShaderPortGate.byViewerShaderPortState || {})["blocked-runtime-uniform-bindings-incomplete"] || 0} rows still lack complete uniform binding; renderer takeover remains disabled`
      : "character-lit/solid-lit viewer formula readiness has not been classified; keep the shader path diagnostic-only";
  const currentOwnerDefinitionSummary = currentNativeOwnerDefinitionAudit?.summary || null;
  const menuMeshOwnerDefinitionIsMenuOnly =
    Boolean(currentOwnerDefinitionSummary?.callerCount) &&
    currentOwnerDefinitionSummary.nonMenuClassificationCount === 0;
  const menuMeshProbePathDiagnostics = buildMenuMeshProbePathDiagnostics(structuredFunctionsDir);
  const nativeBinaryVersionSummary = nativeBinaryVersionAudit?.summary || null;
  const nativeBinaryCrossBuild =
    Boolean(nativeBinaryVersionSummary?.crossBuildReferences) && !nativeBinaryVersionSummary?.exactBuilds;
  const menuOmniLightLinks = menuMeshOmniLightLinks(nativeEffectRuntimeLinks);
  const menuMeshConfiguredLightBlocks =
    menuMeshLightProbeCff0Diagnostics?.blocks?.filter(
      (block) => block.light0?.status === "configured" || block.light1?.status === "configured",
    ) || [];
  const loadSegmentRecords = loadSegments.map((segment) => ({
    ...segment,
    fileOffsetHex: hex(segment.fileOffset),
    virtualAddressHex: hex(segment.virtualAddress),
    fileSizeHex: hex(segment.fileSize),
    memorySizeHex: hex(segment.memorySize),
  }));
  const symbols = {};
  for (const [name, symbol] of Object.entries(defaultSymbols)) {
    const fileOffset = fileOffsetForVirtualAddress(loadSegments, symbol.virtualAddress, symbol.bytes);
    const values = fileOffset >= 0 ? floatArraysForBytes(buffer, fileOffset, symbol.bytes, symbol.components) : [];
    symbols[name] = {
      ...symbol,
      virtualAddressHex: hex(symbol.virtualAddress),
      fileOffset,
      fileOffsetHex: hex(fileOffset),
      values,
    };
  }
  return {
    source: "android-arm64-libGameKindred",
    androidLib,
    nativeEffectRuntimeLinksPath,
    menuMeshLightProbeCff0DiagnosticsPath,
    lightfieldRuntimeDiagnosticsPath,
    levelVisualProfileDiagnosticsPath,
    heroPreviewProfileCandidatesPath,
    nativeBinaryVersionAuditPath,
    currentNativeAnchorAuditPath,
    currentNativeLightProbeChainAuditPath,
    currentNativeOwnerDefinitionAuditPath,
    currentNativeLevelVisualsSchemaAuditPath,
    levelVisualsDefinitionFieldBridgePath,
    currentNativeLevelRuntimeOwnerAuditPath,
    currentNativePositionSamplerOwnerAuditPath,
    currentNativePreviewStringXrefAuditPath,
    characterLitProbeBlockerAuditPath,
    typedObjectRuntimeKeyPayloadAuditPath,
    structuredFunctionsDir,
    loadSegments: loadSegmentRecords,
    symbols,
    linkedNativeRuntimeEvidence: {
      menuMeshOmniLightSlots: nativeEffectRuntimeLinks?.summary?.menuMeshOmniLightSlots || menuOmniLightLinks.length,
      menuMeshOmniLightLinks: menuOmniLightLinks.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        fieldIndex: item.fieldIndex,
        fieldOffset: item.fieldOffset,
        fieldSpan: item.fieldSpan,
        targetTypeName: item.targetTypeName,
        targetTypeSize: item.targetTypeSize,
        evidence: item.evidence,
        registrationFunction: item.registrationFunction,
        descriptorInitFunction: item.descriptorInitFunction,
      })),
      menuMeshLightProbeCff0: menuMeshLightProbeCff0Diagnostics
        ? {
            summary: menuMeshLightProbeCff0Diagnostics.summary,
            configuredLightDefinitions: menuMeshConfiguredLightBlocks.map((block) => ({
              relativePath: block.relativePath,
              blockIndex: block.blockIndex,
              light0: block.light0,
              light1: block.light1,
              rootSkeleton: block.rootSkeleton,
            })),
          }
        : null,
      levelVisualsLightfields: lightfieldRuntimeDiagnostics
        ? {
            summary: lightfieldRuntimeDiagnostics.summary,
            lightfields: (lightfieldRuntimeDiagnostics.lightfields || []).map((entry) => ({
              targetRelativePath: entry.targetRelativePath,
              resolvedPath: entry.resolvedPath,
              definitionCount: entry.definitionCount,
              definitions: entry.definitions,
              dimensions: entry.parsed?.dimensions || null,
              bounds: entry.parsed?.bounds || null,
              rowShape: entry.parsed?.rowShape || "",
              probableShaderMapping: entry.parsed?.probableShaderMapping || "",
              nonZeroCells: entry.parsed?.nonZeroCells ?? null,
              scalar: entry.parsed?.scalar || null,
              firstProbeSampleStats: entry.parsed?.probeSamplesRgb?.[0] || null,
            })),
          }
        : null,
      levelVisualsDefinitionFieldBridge: levelVisualsDefinitionFieldBridge
        ? {
            summary: levelVisualsDefinitionFieldBridge.summary,
            lightfieldProfilePayloadCandidate:
              levelVisualsDefinitionFieldBridge.summary?.lightfieldProfilePayloadCandidate || null,
            interpretation:
              "Definition-side Visuals links consistently label .lightfield resources as LightOmni, and the current native schema routes LevelVisuals +0x50 char* into the profile/lightfield loader. This is strong review evidence, not active preview renderer permission.",
          }
        : null,
      levelVisualProfileSelection: levelVisualProfileDiagnostics
        ? {
            summary: levelVisualProfileDiagnostics.summary,
            chains: (levelVisualProfileDiagnostics.chains || []).map((chain) => ({
              gameModePath: chain.gameModePath,
              gameplaySettings: chain.gameplaySettings,
              levelPath: chain.levelPath,
              visualsPath: chain.visualsPath,
              lightfields: (chain.lightfields || []).map((lightfield) => ({
                targetRelativePath: lightfield.targetRelativePath,
                dimensions: lightfield.dimensions || null,
                rowShape: lightfield.rowShape || "",
              })),
              status: chain.status,
            })),
          }
        : null,
      heroPreviewProfileCandidates: heroPreviewProfileCandidates
        ? {
            summary: heroPreviewProfileCandidates.summary,
            levelProfileCandidates: (heroPreviewProfileCandidates.levelProfileCandidates || []).slice(0, 12),
            nativeContextCandidates: (heroPreviewProfileCandidates.nativeContextCandidates || []).slice(0, 24),
            interpretation: heroPreviewProfileCandidates.interpretation,
          }
        : null,
      currentPackageMenuMeshStringXrefs,
      currentNativePreviewStringXrefs: currentNativePreviewStringXrefAudit
        ? {
            summary: currentNativePreviewStringXrefAudit.summary,
            records: (currentNativePreviewStringXrefAudit.records || []).slice(0, 40).map((record) => ({
              targetName: record.targetName,
              targetAddressHex: record.targetAddressHex,
              xrefAddressHex: record.xrefAddressHex,
              classification: record.classification,
              touchesProfileLoader: record.touchesProfileLoader,
              knownBranchRoles: record.knownBranchRoles,
              knownBranchTargets: record.knownBranchTargets,
            })),
            interpretation: currentNativePreviewStringXrefAudit.interpretation,
        }
        : null,
      characterLitProbeBlockerAudit: characterLitProbeBlockerAudit
        ? {
            summary: characterLitProbeBlockerAudit.summary,
            gate: characterLitProbeBlockerAudit.gate || null,
            interpretation: characterLitProbeBlockerAudit.interpretation || [],
          }
        : null,
      menuMeshProbePath: menuMeshProbePathDiagnostics,
      androidLightPlacementSchema: androidLightPlacementSchemaEvidence,
      nativeBinaryVersionAudit: nativeBinaryVersionAudit
        ? {
            summary: nativeBinaryVersionAudit.summary,
            items: nativeBinaryVersionAudit.items,
            interpretation:
              "HackedGlory decompile output is a cross-build reference for the currently extracted Android/iOS binaries. It can propose candidate chains, but renderer takeover requires current-binary confirmation before applying function-address or callback-table evidence.",
          }
        : null,
      currentNativeAnchorAudit: currentNativeAnchorAudit
        ? {
            summary: currentNativeAnchorAudit.summary,
            binaryPath: currentNativeAnchorAudit.binaryPath,
            keyTextReferences: importantCurrentAnchorReferences(currentNativeAnchorAudit),
            functionAnchors: currentAndroidFunctionAnchorEvidence,
            interpretation:
              "The current Android binary directly references the LevelVisuals, LightPlacement, TOK_RAW, OmniLight, and Probe.Samples anchors. This validates local anchor presence, but it does not by itself recover the full function bodies, object lifetimes, active preview profile, or final shader formula.",
          }
        : null,
      currentNativeLightProbeChainAudit: currentNativeLightProbeChainAudit
        ? {
            summary: currentNativeLightProbeChainAudit.summary,
            binaryPath: currentNativeLightProbeChainAudit.binaryPath,
            keyRecords: importantCurrentChainRecords(currentNativeLightProbeChainAudit),
            interpretation:
              "The current Android binary now confirms local direct-call, data-pointer, and vtable-neighborhood relationships for the menu mesh light/probe writer and scene OmniLight/Probe writer helpers. This is still diagnostic-only until the active hero/model preview owner chain is identified.",
          }
        : null,
      currentNativeOwnerDefinitionAudit: currentNativeOwnerDefinitionAudit
        ? importantCurrentOwnerDefinitionAudit(currentNativeOwnerDefinitionAudit)
        : null,
      currentNativeLevelVisualsSchemaAudit: currentNativeLevelVisualsSchemaAudit
        ? importantCurrentLevelVisualsSchemaAudit(currentNativeLevelVisualsSchemaAudit)
        : null,
      currentNativeLevelRuntimeOwnerAudit: currentNativeLevelRuntimeOwnerAudit
        ? importantCurrentLevelRuntimeOwnerAudit(
            currentNativeLevelRuntimeOwnerAudit,
            typedObjectRuntimeKeyPayloadAudit,
          )
        : null,
      currentNativePositionSamplerOwnerAudit: currentNativePositionSamplerOwnerAudit
        ? importantCurrentPositionSamplerOwnerAudit(currentNativePositionSamplerOwnerAudit)
        : null,
    },
    runtimeLightProbeChain: [
      {
        id: "native-binary-version-gate",
        status: nativeBinaryCrossBuild ? "blocked-cross-build-reference" : "exact-build-or-missing-audit",
        confidence: nativeBinaryCrossBuild ? "md5-mismatch" : "audit-dependent",
        evidence: nativeBinaryVersionAudit?.items || [],
        implication: nativeBinaryCrossBuild
          ? "do not treat HackedGlory function addresses, vtables, or callback-table identities as executable evidence for the current viewer package until each anchor is revalidated against the current local binary"
          : "native decompile evidence can be used more directly only when the audit reports an exact build match or a separate current-binary anchor validates the specific function/table",
      },
      {
        id: "current-binary-anchor-audit",
        status: currentNativeAnchorAudit?.summary?.textReferences
          ? "partially-recovered-current-binary-anchors"
          : "missing-current-binary-anchor-audit",
        confidence: currentNativeAnchorAudit?.summary?.textReferences ? "current-binary-string-xrefs" : "missing-diagnostic",
        evidence: {
          summary: currentNativeAnchorAudit?.summary || null,
          keyTextReferences: importantCurrentAnchorReferences(currentNativeAnchorAudit),
          functionAnchors: currentAndroidFunctionAnchorEvidence.anchors,
        },
        implication:
          "current package anchors are now confirmed for the runtime concepts we are tracing, but the HackedGlory function names and addresses still need function-body and caller-chain validation before the viewer can take over character lighting",
      },
      {
        id: "current-binary-light-probe-chain-audit",
        status: currentNativeLightProbeChainAudit?.summary?.dataReferences
          ? "partially-recovered-current-binary-call-data-chain"
          : "missing-current-binary-chain-audit",
        confidence: currentNativeLightProbeChainAudit?.summary?.dataReferences
          ? "current-binary-call-data-vtable-refs"
          : "missing-diagnostic",
        evidence: {
          summary: currentNativeLightProbeChainAudit?.summary || null,
          keyRecords: importantCurrentChainRecords(currentNativeLightProbeChainAudit),
        },
        implication:
          "the current package confirms local menu mesh light/probe writer calls, semantic writer calls, scene probe service entrypoints, and vtable/data references for scene probe writers; renderer takeover still waits for the active hero/model preview owner object and profile/position source",
      },
      {
        id: "current-menu-owner-definition-audit",
        status: currentNativeOwnerDefinitionAudit?.summary?.callerCount
          ? currentNativeOwnerDefinitionAudit.summary.nonMenuClassificationCount
            ? "mixed-current-binary-owner-definition-callers"
            : "recovered-current-binary-menu-owner-negative-evidence"
          : "missing-current-binary-owner-definition-audit",
        confidence: currentNativeOwnerDefinitionAudit?.summary?.callerCount
          ? "current-binary-callsite-string-refs"
          : "missing-diagnostic",
        evidence: importantCurrentOwnerDefinitionAudit(currentNativeOwnerDefinitionAudit),
        implication:
          "the current +0x1a0 owner-definition path feeding the menu mesh light/probe writer resolves to menu/UI resources, so it must not be used as the hero/model preview lighting profile",
      },
      {
        id: "current-levelvisuals-schema-audit",
        status: currentNativeLevelVisualsSchemaAudit?.summary?.levelVisualsProfileFieldConfirmedAsCharPointer
          ? "partially-recovered-current-binary-levelvisuals-ref-and-profile-field"
          : "missing-current-binary-levelvisuals-schema-audit",
        confidence: currentNativeLevelVisualsSchemaAudit?.summary?.levelVisualsProfileFieldConfirmedAsCharPointer
          ? "current-binary-field-init-and-type-registration"
          : "missing-diagnostic",
        evidence: importantCurrentLevelVisualsSchemaAudit(currentNativeLevelVisualsSchemaAudit),
        implication:
          "current LevelVisualsRef, Level, and LevelVisuals field semantics now validate the Level +0x10 visuals reference path through a raw resource key, the LevelVisuals profile payload field, and the LightPlacement list field, but the active hero/model preview profile selection and sampler position are still unresolved",
      },
      {
        id: "current-level-runtime-owner-audit",
        status: currentNativeLevelRuntimeOwnerAudit?.summary?.activeLevelDispatchResolved
          ? "recovered-current-binary-level-runtime-owner-dispatch"
          : currentNativeLevelRuntimeOwnerAudit?.summary?.activeLevelStoreConfirmed
            ? "partially-recovered-current-binary-level-runtime-owner"
            : "missing-current-binary-level-runtime-owner-audit",
        confidence: currentNativeLevelRuntimeOwnerAudit?.summary?.activeLevelDispatchResolved
          ? "current-binary-opcode-module-vtable-dispatch-evidence"
          : currentNativeLevelRuntimeOwnerAudit?.summary?.activeLevelStoreConfirmed
            ? "current-binary-opcode-module-vtable-evidence"
            : "missing-diagnostic",
        evidence: importantCurrentLevelRuntimeOwnerAudit(
          currentNativeLevelRuntimeOwnerAudit,
          typedObjectRuntimeKeyPayloadAudit,
        ),
        implication:
          "current owner/module wiring and registry dispatch prove how Level +0x10 visuals loading receives and stores an active Level, but renderer takeover still waits for the higher-level path that chooses the active hero/model preview Level/Profile",
      },
      {
        id: "current-position-sampler-owner-audit",
        status:
          currentNativePositionSamplerOwnerAudit?.summary?.instructionOpcodeMismatches === 0
            ? "partially-recovered-current-binary-render-command-position-source"
            : "missing-or-mismatched-current-binary-position-sampler-owner-audit",
        confidence:
          currentNativePositionSamplerOwnerAudit?.summary?.instructionOpcodeMismatches === 0
            ? "current-binary-opcode-and-render-command-field-copy"
            : "missing-diagnostic",
        evidence: importantCurrentPositionSamplerOwnerAudit(currentNativePositionSamplerOwnerAudit),
        implication:
          "the sampler input position is now proven to come from the queued render command's copied transform column; the meshData handler/runtime handoff is traced through 0x18918e4, 0x2ab5148, and payload bridges; and one composite-task dispatch path now shows how caller-provided entry/entry-array values reach entry vtable +0x10 calls with x2 from task +0x58 and x4 as the entry. Renderer takeover still waits for constructor-callsite entry source proof, concrete x2/x4 runtime objects, and the active profile payload loaded into the scene probe service",
      },
      {
        id: "semantic-registry",
        status: "recovered",
        confidence: "native-callsite",
        functions: [
          {
            function: "FUN_019978ac",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01997.c",
            lines: "697-745",
          },
        ],
        evidence: [
          "initializes the shader parameter registry",
          "sets OmniLight.Position, OmniLight.Color, and OmniLight.Attenuation array counts to 2",
          "registers texture semantics including CloudShadows.Texture, FogOfWar.Texture, and Shadowing.mMap",
        ],
        implication: "the character-lit shader expects two OmniLight entries and engine-owned semantic uniform lookup, not ad-hoc viewer uniforms",
      },
      {
        id: "parameter-table-writers",
        status: "recovered",
        confidence: "native-callsite",
        functions: [
          {
            function: "FUN_0199b18c",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0199b.c",
            lines: "78-107",
          },
          {
            function: "FUN_0199aecc",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0199b.c",
            lines: "array uniform writer near FUN_0199aecc",
          },
        ],
        evidence: [
          "looks up semantic names from the global table",
          "copies 12-byte vec3 entries into the parameter table for named array slots",
          "is called by both scene fallback and menu/runtime light paths",
        ],
        implication: "unifNN names in shadergraph rows are slots; the semantic binding table decides which OmniLight/Probe value they receive",
      },
      {
        id: "scene-probe-manager-entrypoints",
        status: "partially-recovered",
        confidence: "public-wrapper-callers",
        functions: [
          {
            function: "FUN_00f2e1b4",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "161-177",
          },
          {
            function: "FUN_00f2e250/FUN_00f2e304/FUN_00f2e380/FUN_00f2e3bc",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "198-344",
          },
          {
            function: "FUN_009b8b34/FUN_00af8*/FUN_009ca*",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions",
            lines: "callers recovered by exact source search",
          },
        ],
        evidence: [
          ...androidSceneProbeEntrypointEvidence.managerLifecycle,
          ...androidSceneProbeEntrypointEvidence.publicEntrypoints,
          androidSceneProbeEntrypointEvidence.menuMeshProbeWriter,
          {
            id: "menu-mesh-probe-caller-coverage",
            evidence:
              "Exact source search finds FUN_00af8b20/FUN_00af9124 callers around menu/UI mesh resources, including guild banners, chests, loot cards, talent coins, and ascension UI.",
            summary: menuMeshProbePathDiagnostics.summary,
            resourceExamples: menuMeshProbePathDiagnostics.concreteResourceStrings.slice(0, 12),
          },
          {
            id: "current-package-menu-mesh-string-xrefs",
            evidence:
              "Current-package string xrefs find loot-card, heroArt/cardArt, talent coin, market card, guild banner, ascension, and reward chest mesh anchors, while the same scan finds no references in the LevelVisuals/profile-loader neighborhoods.",
            summary: currentPackageMenuMeshStringXrefs.summary,
            referenceExamples: currentPackageMenuMeshStringXrefs.references.slice(0, 12),
          },
        ],
        recoveredValues: {
          menuMeshProbePathSummary: menuMeshProbePathDiagnostics.summary,
          concreteResourceStrings: menuMeshProbePathDiagnostics.concreteResourceStrings,
          currentPackageMenuMeshStringXrefs: currentPackageMenuMeshStringXrefs.summary,
        },
        unresolved: [
          "which of the 00af8.c menu/preview callers is the active hero/model viewer path",
          "which resource payload reaches FUN_00f2e3bc before hero preview rendering",
          "the model/world position or matrix argument that becomes the FUN_00f3032c X/Z sampler input",
        ],
        implication: androidSceneProbeEntrypointEvidence.implication,
      },
      {
        id: "scene-light-writer",
        status: "partially-recovered",
        confidence: "native-callsite-with-unresolved-service",
        functions: [
          {
            function: "FUN_00f2e5e0",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "585-677",
          },
        ],
        evidence: [
          "queries a scene/light service through the object at param_1 + 8, virtual call +0x28",
          "transforms discovered light positions by the supplied matrix before upload",
          "writes OmniLight.Position, OmniLight.Color, and OmniLight.Attenuation through FUN_0199b18c",
          "fills missing light slots from static fallback constants when fewer than two lights are returned",
        ],
        recoveredValues: {
          attenuationPresets: symbols.attenuationPresets.values,
          fallbackOmniLightPosition: symbols.fallbackOmniLightPosition.values[0] || [],
          fallbackOmniLightColor: symbols.fallbackOmniLightColor.values[0] || [],
          fallbackOmniLightAttenuation: symbols.fallbackOmniLightAttenuation.values[0] || [],
        },
        unresolved: [
          "the scene/light service object behind virtual call +0x28",
          "the preview/menu profile that decides which lights exist for character inspection",
        ],
        implication: "fallback values are real engine values, but they are not proof of the final hero-preview lighting profile",
      },
      {
        id: "probe-writer",
        status: "partially-recovered",
        confidence: "native-callsite-with-unresolved-service",
        functions: [
          {
            function: "FUN_00f2e5e0",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "667-674",
          },
          {
            function: "FUN_00f2e8f4",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "682-710",
          },
        ],
        evidence: [
          "FUN_00f2e5e0 writes six fallback Probe.Samples slots from DAT_01bf8150",
          "FUN_00f2e8f4 asks the same scene object through virtual call +0x38 to fill six probe vectors dynamically",
        ],
        recoveredValues: {
          fallbackProbeSample: symbols.fallbackProbeSample.values[0] || [],
        },
        unresolved: [
          "the scene/probe service object behind virtual call +0x38",
          "the six actual probe sample vectors used by the model viewer/hero presentation path",
        ],
        implication: "the shader cannot be switched to the original probe formula until the six runtime probe vectors are known or a proven preview profile is recovered",
      },
      {
        id: "probe-service-dispatch",
        status: "recovered",
        confidence: "native-dispatch-plus-sampler-callsite",
        functions: [
          {
            function: "FUN_00f2e8f4",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "682-710",
          },
          {
            function: "FUN_00f30138/FUN_00f3032c",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c",
            lines: "57-63,247-397",
          },
          {
            function: "FUN_00f30528",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c",
            lines: "399-480",
          },
          {
            function: "FUN_00e7d02c",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e7d.c",
            lines: "51-72",
          },
        ],
        evidence: [
          ...androidProbeServiceDispatchEvidence.confirmedNegativeEvidence,
          ...androidLightfieldSamplerEvidence.dispatchChain,
        ],
        recoveredValues: {
          samplerFormula: androidLightfieldSamplerEvidence.recoveredSamplerFormula,
        },
        unresolved: androidLightfieldSamplerEvidence.stillUnresolved,
        implication:
          "Probe.Samples dispatch now resolves to the native lightfield sampler; do not bypass the sampler with raw lightfield rows, and do not take over rendering until the active profile and position source are proven",
      },
      {
        id: "level-visuals-lightfield-loader",
        status: "partially-recovered",
        confidence: "native-callsite-to-inner-service-vcall",
        functions: [
          {
            function: "FUN_0198a234/FUN_0198a998",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0198a.c",
            lines: "88-146,487-507",
          },
          {
            function: "FUN_009ca17c",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/009ca.c",
            lines: "97-124",
          },
          {
            function: "FUN_00f2e3bc/FUN_00f2e5a8",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
            lines: "337-343,541-549",
          },
          {
            function: "FUN_00f30140/FUN_00f30528",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f30.c",
            lines: "64-69,399-480",
          },
        ],
        evidence: androidLevelVisualLightfieldLoaderEvidence.dispatchChain,
        recoveredValues: {
          levelVisualsProfileField: androidLightPlacementSchemaEvidence.levelVisuals.inferredLightfieldProfileField,
        },
        unresolved: androidLevelVisualLightfieldLoaderEvidence.unresolved,
        implication: androidLevelVisualLightfieldLoaderEvidence.implication,
      },
      {
        id: "level-visuals-lightfield-source",
        status: lightfieldRuntimeDiagnostics?.summary?.parsedLightfields ? "partially-recovered" : "unresolved",
        confidence: lightfieldRuntimeDiagnostics?.summary?.parsedLightfields
          ? "definition-resource-link-plus-plain-text-payload"
          : "missing-diagnostic",
        functions: [
          {
            function: "FUN_00e7cee8/FUN_00e7d02c",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00e7c.c",
            lines: "runtime subscription to PTR_DAT_02bf2768 and light-object update",
          },
        ],
        evidence: [
          "LevelVisuals definitions reference LightOmni resources through definition_build_links.tsv",
          "Android native schema registers LevelVisuals as 0x60 bytes and LightPlacement as 0x40 bytes",
          "LevelVisuals field offset 0x48 is inferred as the LightPlacement list slot that corresponds to the LightOmni/lightfield definition resource",
          "LevelVisuals field offset 0x50 is a PTR_DAT_02bf27e0 TOK_RAW payload slot and is tied to FUN_009ca17c's profile payload load path into FUN_00f2e3bc",
          "definition-side Visuals links now consistently label .lightfield resources as LightOmni, giving a strong candidate bridge to the native LevelVisuals +0x50 char* profile payload field",
          "FUN_00e7d02c consumes a LightPlacement-shaped record and copies position, color, and intensity into the scene light object",
          "the referenced .lightfield files exist locally and parse as bounds + width/height + width*height probe rows",
          "each probe row parses as one scalar plus six RGB triples; native FUN_00f30528 maps that scalar to sample0.w",
          "native FUN_00f3032c samples those rows with clamped X/Z, bilinear interpolation, and component^2 * 0.5 before Probe.Samples upload",
        ],
        recoveredValues: {
          summary: lightfieldRuntimeDiagnostics?.summary || null,
          androidLightPlacementSchema: androidLightPlacementSchemaEvidence,
          levelVisualsProfileLoadPath: androidLevelVisualLightfieldLoaderEvidence,
          levelVisualsDefinitionFieldBridge: levelVisualsDefinitionFieldBridge
            ? {
                summary: levelVisualsDefinitionFieldBridge.summary || null,
                lightfieldProfilePayloadCandidate:
                  levelVisualsDefinitionFieldBridge.summary?.lightfieldProfilePayloadCandidate || null,
              }
            : null,
          lightfields: (lightfieldRuntimeDiagnostics?.lightfields || []).map((entry) => ({
            targetRelativePath: entry.targetRelativePath,
            dimensions: entry.parsed?.dimensions || null,
            scalar: entry.parsed?.scalar || null,
            firstProbeSampleStats: entry.parsed?.probeSamplesRgb?.[0] || null,
          })),
        },
        unresolved: [
          "PTR_DAT_02bf2768 has not yet been resolved to a concrete LightOmni/LevelVisuals key symbol",
          "definition-side LightOmni links bridge strongly to LevelVisuals +0x50, but the active hero/model preview LevelVisuals record and concrete runtime payload source are not proven",
          "the native lightfield sampler is decoded, but the active model/preview position passed to it is not proven",
          "the leading scalar maps to sample0.w, but its visual role inside the character shader formula is not yet ported",
          "LightPlacement field +0x38 is registered but not consumed by FUN_00e7d02c, so its role is still unknown",
          "the hero/model preview path may use a specific LevelVisuals profile; that profile selection is not proven",
        ],
        implication:
          "lightfield files are a real source for scene probe data, but applying their values globally before recovering the sampler/profile would still be guessing",
      },
      {
        id: "definition-profile-selection",
        status: levelVisualProfileDiagnostics?.summary?.chainsWithLightfield ? "partially-recovered" : "unresolved",
        confidence: levelVisualProfileDiagnostics?.summary?.chainsWithLightfield
          ? "cff0-symbol-reference-resolution"
          : "missing-diagnostic",
        evidence: [
          "CFF0 definitions reference profiles through symbols such as *MapViewer_5v5* and *MapViewer_5v5_Visuals*, not only through build:// links",
          "level_visual_profile_diagnostics resolves those symbols back to concrete GameMode, Level, GameplaySettings, and Visuals .def files",
          "resolved Visuals definitions then connect to LightOmni .lightfield resources through definition_build_links.tsv",
        ],
        recoveredValues: {
          summary: levelVisualProfileDiagnostics?.summary || null,
          chains: (levelVisualProfileDiagnostics?.chains || []).map((chain) => ({
            gameModePath: chain.gameModePath,
            gameplaySettings: chain.gameplaySettings,
            levelPath: chain.levelPath,
            visualsPath: chain.visualsPath,
            lightfields: (chain.lightfields || []).map((lightfield) => lightfield.targetRelativePath),
            status: chain.status,
          })),
        },
        unresolved: [
          "the native runtime object that chooses the active profile for hero/model preview is not yet identified",
          "the decoded sampler still needs the active model/scene position source from the hero/model preview path",
          "the sampled six vec4 Probe.Samples for the active hero preview profile are not known until the active profile and position source are proven",
        ],
        implication:
          "the definition-side profile chain is now recovered, but renderer takeover must still wait for the native active-profile and sampler path",
      },
      {
        id: "current-native-preview-string-xrefs",
        status: currentNativePreviewStringXrefAudit?.summary?.provenActiveHeroPreviewProfile
          ? "recovered-active-preview-profile"
          : currentNativePreviewStringXrefAudit?.summary?.textReferences
            ? "negative-current-string-xrefs"
            : "missing-preview-string-xrefs",
        confidence: currentNativePreviewStringXrefAudit?.summary?.textReferences
          ? "current-binary-string-xref-neighborhoods"
          : "missing-diagnostic",
        evidence: currentNativePreviewStringXrefAudit
          ? {
              summary: currentNativePreviewStringXrefAudit.summary,
              skinViewerRecords: (currentNativePreviewStringXrefAudit.records || [])
                .filter((record) => /^UI::SKIN_VIEWER/.test(record.targetName))
                .map((record) => ({
                  targetName: record.targetName,
                  xrefAddressHex: record.xrefAddressHex,
                  classification: record.classification,
                  knownBranchRoles: record.knownBranchRoles,
                  knownBranchTargets: record.knownBranchTargets,
                  touchesProfileLoader: record.touchesProfileLoader,
                })),
              presentationRecords: (currentNativePreviewStringXrefAudit.records || [])
                .filter((record) => record.targetName === "presentationData" || record.targetName === "preview")
                .slice(0, 6)
                .map((record) => ({
                  targetName: record.targetName,
                  xrefAddressHex: record.xrefAddressHex,
                  classification: record.classification,
                  knownBranchRoles: record.knownBranchRoles,
                  knownBranchTargets: record.knownBranchTargets,
                  touchesProfileLoader: record.touchesProfileLoader,
                })),
            }
          : null,
        unresolved: [
          "current Android UI::SKIN_VIEWER xrefs currently classify as UI event-bus/string handling paths, not LevelVisuals profile selection",
          "current Android presentationData/preview xrefs are still string/field/menu hints and do not touch the LevelVisuals/profile loader neighborhood",
          "MapViewer strings still do not appear as direct current Android binary string targets",
        ],
        implication:
          "preview/menu strings now provide current-binary negative evidence and search entry points; they do not unlock renderer takeover or prove the active hero preview profile",
      },
      {
        id: "hero-preview-profile-candidates",
        status: heroPreviewProfileCandidates?.summary?.provenActiveHeroPreviewProfile
          ? "recovered-active-preview-profile"
          : heroPreviewProfileCandidates?.summary?.mapViewerCandidatesWithLightfield
            ? "candidate-only-mapviewer-lightfield"
            : "missing-preview-profile-candidates",
        confidence: heroPreviewProfileCandidates?.summary?.provenActiveHeroPreviewProfile
          ? "current-native-active-selection"
          : heroPreviewProfileCandidates?.summary?.mapViewerCandidatesWithLightfield
            ? "definition-chain-plus-native-menu-hints"
            : "missing-diagnostic",
        evidence: heroPreviewProfileCandidates
          ? {
              summary: heroPreviewProfileCandidates.summary,
              currentNativeRuntimeGate: heroPreviewProfileCandidates.currentNativeRuntimeGate || null,
              levelProfileCandidates: (heroPreviewProfileCandidates.levelProfileCandidates || []).slice(0, 4),
              skinViewerNativeHints: (heroPreviewProfileCandidates.nativeContextCandidates || [])
                .filter((candidate) => (candidate.patternIds || []).includes("skin-viewer"))
                .slice(0, 4),
            }
          : null,
        unresolved: [
          "MapViewer_5v5 reaches a concrete LevelVisuals/lightfield profile, but no current-native path proves that the hero/model preview selects it",
          "UI::SKIN_VIEWER appears in hero/skin native menu contexts, but it is not yet connected to Level +0x10 visuals loading or the scene/probe profile payload loader",
          ...(heroPreviewProfileCandidates?.currentNativeRuntimeGate?.blockingReasons || []),
        ],
        implication:
          "MapViewer can be used as the next trace candidate, but it must not be applied as the active hero preview lightfield until a current-native active-selection path is found",
      },
      {
        id: "menu-preview-light-writer",
        status: menuMeshOwnerDefinitionIsMenuOnly
          ? "recovered-menu-ui-negative-evidence"
          : menuOmniLightLinks.length >= 2
            ? "partially-recovered"
            : "blocked-on-object-chain",
        confidence: menuOmniLightLinks.length >= 2 ? "native-callsite-plus-typed-schema-link" : "native-callsite-with-indirection",
        functions: [
          {
            function: "FUN_00afad08",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00afa.c",
            lines: "736-784",
          },
          {
            function: "FUN_00af5e50",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00af5.c",
            lines: "705-735",
          },
          {
            function: "FUN_00f0e4a8",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f0e.c",
            lines: "157-175",
          },
          {
            function: "FUN_00f13f18",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f13.c",
            lines: "1149-1155",
          },
        ],
        evidence: [
          "FUN_00afad08 writes two OmniLight entries from param_1[0x34] offsets and iterates Probe.Samples from param_1[0x34] + 0xa0",
          "param_1[0x34] is byte offset +0x1a0 on the menu mesh object; FUN_00af9124 sets this to the top-level CFF0 menu mesh definition instance",
          "native_effect_runtime_links identifies MenuMeshData field offsets 0x58 and 0x7c as exact-span MenuMeshOmniLight slots",
          menuMeshOwnerDefinitionIsMenuOnly
            ? `current Android +0x1a0 definition attach audit classifies all ${currentOwnerDefinitionSummary.callerCount} callsites as menu/UI resources, with 0 non-menu classifications`
            : "current Android +0x1a0 definition attach audit has not closed the callsite set",
          "menu_mesh_light_probe_cff0_diagnostics decodes top-level 64-bit MenuMeshData light slots; most menu meshes are default-disabled and only 11 menu hat/halo definitions carry configured light0 values",
          "FUN_00af5e50 initializes param_1 + 0x34 through FUN_00f0e4a8, binds menu_form_background, then calls FUN_00f13f18",
          "FUN_00f13f18 dispatches through virtual +0x130, so the actual data producer is still behind an object/vtable boundary",
        ],
        currentNativeOwnerDefinitionEvidence: currentNativeOwnerDefinitionAudit
          ? {
              summary: currentOwnerDefinitionSummary,
              allResourceRequests: currentOwnerDefinitionSummary?.allResourceRequests || [],
              interpretation: menuMeshOwnerDefinitionIsMenuOnly
                ? "+0x1a0 menu mesh definition producers are bounded to menu/UI resources in the current Android binary; this rejects the shortcut of using menu mesh light slots as hero preview lighting."
                : "+0x1a0 menu mesh definition producer coverage is incomplete; keep this path diagnostic-only.",
            }
          : null,
        linkedSchemaEvidence: menuOmniLightLinks.map((item) => ({
          fieldOffset: item.fieldOffset,
          fieldSpan: item.fieldSpan,
          targetTypeName: item.targetTypeName,
          evidence: item.evidence,
        })),
        rejectedShortcut: "do not treat PTR_FUN_027d3e40, PTR_FUN_028266f0, or fixed offsets around those symbols as direct light/probe constants",
        unresolved: [
          "CFF0 top-level menu mesh light values are decoded, but they are mostly default-disabled and not evidence for the hero presentation/model preview lighting profile",
          menuMeshOwnerDefinitionIsMenuOnly
            ? "the current +0x1a0 owner-definition producer set is closed to menu/UI callsites, so the active hero/model preview lighting path must come from a different LevelVisuals/profile source"
            : "which object implementation populates param_1[0x34] before FUN_00afad08 in the active hero/menu view",
          "whether this path is the same profile used by the hero presentation/model preview path",
        ],
        implication:
          "the two menu mesh light slots are typed and decoded for top-level menu mesh definitions, but these values should not be applied to hero character rendering until the active hero preview path is proven",
      },
      {
        id: "runtime-sampler60",
        status: "partially-recovered",
        confidence: "shadergraph-layout-and-native-uploader",
        functions: [
          {
            function: "FUN_019989f8",
            file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/01998.c",
            lines: "native 0xC0 float to 64x1 RGB texture uploader",
          },
          {
            function: "current Android 0x189e590 loop",
            file: "extracted/android_raw/lib/arm64-v8a/libGameKindred.so",
            lines: "loads 0xC0 floats, multiplies by 255, rounds, clamps to byte range, and uploads a 64x1 RGB texture",
          },
        ],
        evidence: [
          "material manifest identifies runtime sampler records and separates direct, clamped, and prefixed diagnostic inline lookup payloads",
          "current Android byte-clamp evidence explains signed sampler60 payloads such as Hero028 deathKnight_LE without treating them as ordinary missing textures",
          "sampler60 texture unit varies by material, so the unit is read from the shadergraph sampler table rather than guessed globally",
        ],
        unresolved: [
          characterLitViewerShaderPortBlocker,
          "runtime scene samplers such as FogOfWar.Texture remain diagnostic-only until scene texture state is reproduced or captured",
          "the lookup still needs real active OmniLight/Probe values before renderer takeover",
        ],
        implication: "sampler60 is no longer treated as a missing diffuse texture; it is a runtime lookup texture embedded in TCH0-like data",
      },
    ],
    staticInitializerEvidence: [
      {
        function: "_INIT_1319",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/libGameKindred.c",
        lines: "107189-107213",
        status: "recovered-but-not-light-profile",
        evidence: [
          "initializes DAT_03218fe0, DAT_03218ff0, DAT_03219000, DAT_03219010, and DAT_03219018 to identity/zero-like matrix defaults",
        ],
        implication: "these globals are transform/default matrix data, not the character lighting profile",
      },
    ],
    runtimeTakeoverStatus: {
      canApplyCharacterLitReflectionProbeShader: false,
      characterLitViewerShaderPortGate,
      recovered: [
        "semantic uniform names and array slot counts",
        "OmniLight/Probe parameter-table writers",
        "Android fallback OmniLight values",
        "Android fallback Probe.Samples value",
        "sampler60 inline lookup texture class for most affected rows",
        "global scene/probe manager construction and public upload entrypoint callers",
        "definition symbol chain from GameMode/Level to LevelVisuals lightfield profiles",
        "Level +0x10 visuals reference path and LevelVisuals +0x50 TOK_RAW profile payload load path into the native lightfield parser",
        "native lightfield parser/sampler for Probe.Samples",
        "current Android binary string/code anchors for LevelVisuals, LightPlacement, TOK_RAW, OmniLight.*, and Probe.Samples",
        "current Android binary call/data/vtable references for menu mesh light/probe writer and scene OmniLight/Probe writer neighborhoods",
        "current Android binary scene/probe service global slot, initializer/destructor, and public forwarding entrypoints",
        "current Android binary validates the inner scene/probe +0x38 position sampler as 0xe38cb4 -> 0xe38ea8 and the inner +0x40 profile/lightfield payload parser as 0xe38cbc -> 0xe390a4",
        "current Android binary +0x1a0 owner-definition callsites classify as menu/UI resources, rejecting that path as a hero lighting profile",
        "current Android binary LevelVisuals field table confirms +0x48 LightPlacement**, +0x50 char* profile payload, and +0x58 StaticLensFlare**",
        "current Android binary Level runtime visuals loader walks Level +0x10 visuals references and calls the LevelVisuals apply processor, which routes the +0x50 char* profile payload into the scene/probe profile/lightfield payload-load entry at 0xe36f38",
        "current Android binary Level runtime owner audit proves module registration, owner vtable installation, secondary-vtable thunking, registry dispatch through owner vtable +0x20, active-Level argument forwarding, owner +0x30 active-Level storage, registration of Level setup callback 0xc79ad4 through the generic callback registry, descriptor/payload resolution through 0x188cc88/0x188f8f8, generic callback helper dispatch through 0x188e338/0x188eba4, object-builder B correlation with Level setup runtime index 0x2d44e98, object-builder B typed-object id 0x03f3/1011 through dispatcher 0x82dc04, 0x03f3 payload word0 -> constructor w1 -> object +0x1c resource-key-id storage, typed-object dispatcher input sources classified as framed stream-buffer and timed/.vgr queue guardrail evidence with no strict local Level/Profile/Probe branch, typed-object id 0x046f/1135 runtime resource-key switching into 0x3051220/0x3051218, current key owner lifecycle through 0x3034cf8, child index 0x3034d10, secondary current-object index 0x2d44e78, child lookup/create through 0x188b8b8, current owner state/position record registration through 0x8badcc -> 0x8cfb7c with index 0x3035264 and slot4 callback 0x8cfbec, current owner active-state/position bridge through 0x8d0598 and Level setup query 0x188e540, resolved-key object request owner registration through 0x8bad0c -> 0x8bee60 -> 0x188c2f4, resolved-key object requests through 0x188e338 followed by Level setup index query 0x188e540, context +0x140/+0x148 processing through 0xca3bd0, internal array/single-object lookup through 0xc7a400/0xc7a2fc, entry apply through 0xca3564, a non-stream character-lobby key-switch candidate adjacent to ui_character_lobby_entered with no strict local Level/Profile/Probe branch, and the registered callback that also reads owner +0x30 and Level +0x188",
        "current Android binary now exposes a structured runtime key upstream recovery audit: framed stream, timed .vgr queue, local iOS raw Data reservoir, and CharacterLobby record inputs are bounded, but none supplies a decoded active preview payload or concrete active key",
        "current Android binary classifies one 0x3035264 consumer as HUD/minimap negative evidence: 0x94ad7c labels the object HUD_Minimap, reads 0x3035264, creates/stores a current owner at object +0x340, and 0x94aef8 later attaches through 0x8cff24 while doing minimap layout/resource work",
        "current Android binary position sampler owner audit proves 0xe36efc samples a queued render-command transform column copied from an x4-derived provider virtual +0x18",
        "current Android binary proves the sampler render-command owners are global render queue owner objects initialized by 0xe01d28 -> 0x1890584 and stored at 0x311ae08/0x311ae10 with builder slots at owner vtable +0x10",
        "current Android binary traces the upstream render helper dispatcher through global helper +0x20, e02c80 vtable +0x10, e02c94, e28660, and the resolved e28418 context vtable +0x18 target e28674",
        "current Android binary recovers the e28418 resource handler registration table for animData, meshData, shaderData, and texData, and traces meshData process e02ac8 into mesh resource object builder 0x18918e4",
        "current Android binary partially traces the meshData runtime handoff: 0x18918e4 writes runtime object vtable 0x2ab5148 and reaches setup/payload bridges 0x1891a70, 0x1890e90, 0x1890e98, and 0x18942f8 before render owner builders enqueue commands",
        "current Android binary recovers a composite-task x2/x4 dispatch shape: constructors 0x18a1170/0x18a11e4 write vtable 0x2ab5590, whose +0x18 slot points to 0x18a13fc; the dispatch loop calls entry object vtable +0x10 with x2 loaded from task +0x58 and x4 as the current entry",
        "current Android binary narrows composite-task entry source: 0x18a1170 stores caller x2 inline at task +0x50; 0x18a11e4 stores caller x2 as the entry-array pointer at task +0x50 and caller x3 as the count",
        "current Android binary classifies direct composite-task constructor callsites as menu mesh, scene entity, particle effect, ScreenNode, ViewNode/ViewRTNode, and shadow tasks",
        "current Android binary traces Draw all scene entities entry arrays through 0x188e784 -> 0x188f03c into global manager slot 0x311a960 records at +0x10 + index*16 +0x8",
        "current Android binary recovers the 0x311a960 scene/entity manager lifecycle and fixed record-pool layout: init/store/accessor/delete/clear, 0x800 records from manager +0x10, record id at +0x2, caller-provided entry pointer at +0x8, and free-list metadata at +0x8010",
        "current Android binary traces scene/entity record mutation and dispatch: 0x188eee0 add-record stores record +0x8 entries, 0x188ef88 removes records through backing vtable +0x18, and 0x188f020 dispatches per-record payloads through backing vtable +0x20",
        "current Android binary narrows scene/entity record +0x8 entries to add-record callers passing object +0x30, with entry setup storing global render-command owner B plus a 0x2726740-derived callback/table pointer into that entry subobject",
        "current Android binary links the scene/entity entry primary table +0x20 slot to global helper/resource-render dispatch: 0xd7fc64 prepares object +0x58, 0xd7fc68 prepares object +0x40, and 0xd7fc70 tail-branches to 0x18906b0",
        "current Android binary links scene/entity record entries to render-owner builder invocation: composite dispatch loads entry +0x8 and calls owner vtable +0x10, while entry +0x8 stores owner A/B whose vtable +0x10 resolves to 0x1892120/0x189366c",
        "current Android binary recovers the scene/entity x4 transform-provider source: owner builders use x4-8, scene entries make that object +0x28 with sub-vtable 0x2726710, and sub-vtable +0x18 returns object +0x70 as the copied transform source",
        "current Android binary recovers a second scene/entity entry layout: 0x8d3118 tail-calls 0x8d398c, layout B registers object +0x30 through the same 0x311a960 manager, stores the returned record index at object +0xb0, and refreshes object +0x50 runtime/material parameters through 0xe39830 before object +0x58 state handling",
        "current Android binary bounds layout B object +0x58 state handling: 0x8d3c24 validates linked-state versioning, applies transform payloads through 0x8d45d4, builds a runtime payload from object +0x50 through 0xe3a510, and dispatches it to 0x188f020 with object +0xb0",
        "current Android binary recovers the scene/entity x2 runtime-parameter source: Draw all scene entities calls global table accessor 0x189d63c(0), passes the returned 0x311af50 slot 0 object as x4 to 0x18a11e4, and the task stores it at +0x58 before composite dispatch passes it as x2",
        "current Android binary recovers the x2 slot0 vtable path: 0x189f7ec writes vtable 0x2ab54a0, owner builders call slot +0x10 -> 0x189f850, 0x189f850 constructs a 0x2ab54f8 per-command object, and render-command A/B store that object's +0x10 result at queued command +0x18",
        "current Android binary preview/menu string xrefs are now audited: UI::SKIN_VIEWER references classify as UI event-bus/string handling, presentationData/preview are string/menu hints, MapViewer has no direct current-binary string target, and none of these xrefs touches the LevelVisuals/profile loader",
        "current Android binary menu mesh string xrefs now classify LootCardRep3D plus heroArt/cardArt uniforms, TalentCoinRep3D, market cards, guild banners, ascension UI, and reward chests as UI/card mesh resources; none of this string-xref evidence touches the LevelVisuals/profile-loader neighborhoods",
      ],
      blockers: [
        ...(nativeBinaryCrossBuild
          ? [
              "HackedGlory Android/iOS decompile outputs are cross-build references for the current local binaries; every native address/vtable/callback claim must be revalidated against the current package before renderer takeover",
            ]
          : []),
        "scene/menu light service object behind virtual +0x28 is still only partially resolved",
        "current Android binary anchors are confirmed, but the function-body and caller-chain equivalents for the active preview path are not fully revalidated yet",
        "current Android binary confirms menu mesh writer, scene probe service entrypoints, scene probe writer table relationships, inner lightfield profile/parser and position sampler slots, Level +0x10 visuals loading, LevelVisuals profile field layout, LevelVisuals apply processor behavior, Level runtime owner dispatch, Level setup callback registration, descriptor/payload resolver, generic callback helper/dispatch, object-builder B typed-object dispatch/correlation with Level setup runtime index, 0x03f3 payload word0 -> object +0x1c resource-key-id storage, typed-object dispatcher input sources classified as framed stream-buffer and timed/.vgr queue guardrail evidence, type 0x046f runtime resource-key switching into 0x3051220/0x3051218, current key owner lifecycle at 0x3034cf8, child index 0x3034d10, secondary current-object index 0x2d44e78, child lookup/create through 0x188b8b8, current owner state/position record registration through 0x3035264 and slot4 callback 0x8cfbec, current owner active-state/position bridge through 0x8d0598 and Level setup query 0x188e540, a non-stream character-lobby key-switch candidate, global render-command sampler owners, helper dispatcher chain, resource context dispatcher, core resource handler registration, meshData handler entry, meshData runtime handoff, composite-task x2/x4 dispatch shape, composite-task entry source/callsite labels, scene entity entry-array manager source, 0x311a960 manager record-pool lifecycle/layout, scene/entity record +0x8 entry-subobject source, entry helper-dispatch slot, render-owner builder invocation, x4 transform-provider source, x2 runtime-parameter global slot source, x2 slot0 vtable path to queued command +0x18, queued command +0x18 render-queue sorting, and render-command transform-column position sampling, but the active hero/model preview profile path is still unresolved",
        "the 0x3035264 -> 0x94ad7c/0x94aef8 -> 0x8cff24 path is explicitly HUD_Minimap/minimap-layout evidence and must not be promoted into the active hero/model preview material, light, or shader path",
        "current Android binary +0x1a0 menu mesh owner callsites are menu/UI definitions, so a different current-binary path is still needed for active hero/model preview lighting",
        "00af8.c proves menu/preview draw code calls the light/probe upload path, but the exact active hero/model preview caller is unresolved",
        "LightPlacement has been confirmed as an OmniLight update path, not a Probe.Samples writer",
        "Level +0x10 visuals loading and LevelVisuals +0x50 are confirmed in the current package and reach the inner +0x40 profile/lightfield payload loader, but the active hero/model preview payload source is unresolved",
        "Level runtime owner/module wiring, generic registry dispatch, registration of callback 0xc79ad4, descriptor/payload resolution through 0x188cc88/0x188f8f8, generic callback helper/dispatch through 0x188e338/0x188eba4, object-builder B typed-object id 0x03f3/1011, payload word0 resource-key-id storage, typed-object dispatcher input sources classified as framed stream-buffer and timed/.vgr queue guardrail evidence, type 0x046f runtime key switching, object-builder B correlation with setup index 0x2d44e98, current key owner lifecycle at 0x3034cf8, child index 0x3034d10, secondary current-object index 0x2d44e78, child lookup/create through 0x188b8b8, current owner state/position record registration through 0x3035264, current owner active-state/position bridge through 0x8d0598, and a HUD_Minimap-classified 0x3035264 consumer are confirmed in the current package. The concrete active preview resource key/table entry and active preview object-builder path that invokes the registered callback with the hero/model preview Level/Profile is still unresolved",
        "runtime key upstream inputs are bounded as stream/.vgr/raw-data/lobby-record evidence, but no decoded active preview payload is recovered; this blocks real OmniLight/Probe/profile value takeover",
        typedObjectRuntimeKeyPayloadAudit &&
        !typedObjectRuntimeKeyPayloadAudit.concreteRuntimeKeyFieldMatchedResourceIndex
          ? "local typed-object runtime key payload field scan found no resource-index-matching key; runtime capture or deeper payload decoding is still required"
          : null,
        "static Android vtable file reads are not sufficient to identify the probe service implementation",
        "LevelVisuals LightOmni .lightfield files, definition-side profile chains, current Level +0x10 visuals loader, current profile-payload loader, current +0x38 native position sampler, global render-command sampler owners, helper dispatcher chain, resource context dispatcher, core resource handler table, meshData handler entry, meshData runtime handoff, composite-task x2/x4 dispatch shape, composite-task entry source/callsite labels, scene entity entry-array manager source, 0x311a960 manager record-pool lifecycle/layout, record +0x8 entry-subobject source, entry helper-dispatch slot, render-owner builder invocation, x4 transform-provider source, x2 runtime-parameter global slot source, x2 slot0 vtable path to queued command +0x18, queued command +0x18 render-queue sorting, and render-command transform-column source are parsed, but the active hero preview profile is unresolved",
        "scene/entity layout B registration and material-parameter refresh are parsed, but the 0x2ae54f0 wrapper source is table/default-state evidence rather than a string/.lightfield payload, so it does not resolve the active hero/model preview profile",
        "layout B object +0x58 handling is state/transform record dispatch, not a LevelVisuals/lightfield profile selector",
        "current Android preview/menu string xrefs are negative evidence so far: they do not connect UI::SKIN_VIEWER, presentationData, preview, or MapViewer to Level +0x10 loading, LevelVisuals +0x50, or the scene/probe profile payload loader",
        "current Android menu mesh string xrefs show that heroArt/cardArt under the 00af8/00af9 path are loot/card UI uniforms, not the active hero/model preview lighting profile",
        "menu mesh CFF0 light values are decoded, but they do not prove the active hero presentation/model preview lighting profile",
        menuMeshOwnerDefinitionIsMenuOnly
          ? "current Android +0x1a0 menu mesh object chain is bounded to menu/UI definition callsites; the active hero/model preview lighting path must come from another LevelVisuals/profile source"
          : "menu/preview object chain populating param_1[0x34] in the active view is unresolved",
        "actual six Probe.Samples vectors for the hero preview path are computable only after active profile and transform-provider context are proven",
        characterLitViewerShaderPortBlocker,
      ].filter(Boolean),
      policy: "do not use fallback constants or guessed light profiles to replace stable character rendering; use this report as diagnostics until the chain is complete",
    },
    nativeFunctionEvidence: [
      {
        role: "builtin-uniform-cache",
        function: "FUN_0199f138",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0199f.c",
        lines: "124-131",
        evidence: "caches built-in uniform locations including _Eye2WorldMatrix",
      },
      {
        role: "builtin-matrix-upload",
        function: "FUN_00f01570",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f01.c",
        lines: "281-314",
        evidence: "uploads matrix uniforms before draw",
      },
      {
        role: "menu-preview-light-writer",
        function: "FUN_00afad08",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00afa.c",
        lines: "736-784",
        evidence: menuMeshOwnerDefinitionIsMenuOnly
          ? "writes menu/runtime OmniLight and Probe.Samples values from param_1[0x34]; current +0x1a0 producer callsites are bounded to menu/UI definitions and are negative evidence for hero preview lighting takeover"
          : "writes menu/runtime OmniLight and Probe.Samples values from param_1[0x34], but the producer for that object chain is unresolved",
      },
      {
        role: "scene-light-probe-fallback",
        function: "FUN_00f2e5e0/FUN_00f2e8f4",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/00f2e.c",
        lines: "585-710",
        evidence: "queries scene light/probe services, writes fallback OmniLight values, and writes six Probe.Samples slots",
      },
      {
        role: "level-visuals-lightfield-loader",
        function: "FUN_0198a234/FUN_0198a998 -> FUN_009ca17c -> FUN_00f2e3bc -> FUN_00f2e5a8 -> FUN_00f30140 -> FUN_00f30528",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0198a.c",
        lines: "88-146,487-507",
        evidence:
          "parses PTR_DAT_02bf27e0 fields as TOK_RAW payloads, stores the raw pointer in LevelVisuals byte offset +0x50, then turns it into a resource payload/handle and dispatches the inner light/probe service virtual +0x40 to the native .lightfield parser",
      },
      {
        role: "semantic-parameter-writer",
        function: "FUN_0199b18c/FUN_0199aecc",
        file: "external/HackedGlory/ghidra_projects/GameKindred_android_decompile_output/structured/functions/0199b.c",
        lines: "78-107",
        evidence: "writes vec3 parameter-table entries used by OmniLight",
      },
    ],
    blocker:
      nativeBinaryCrossBuild
        ? `The native decompile evidence is cross-build for the current package. Current Android anchors, light/probe call-data relationships, scene/probe entrypoints, Level +0x10 visuals loading, LevelVisuals +0x50 profile payload routing, current inner +0x38 position sampler, object-builder/typed-object key paths, current key owner lifecycle, HUD/minimap negative evidence, render-command sampler owners, resource handler/meshData/render-owner mechanics, queue sorting, render-command transform-column position source, and diagnostic-complete character-lit formula structure are now confirmed; current +0x1a0 owner-definition callsites classify as menu/UI resources rather than hero preview resources. CFF0 menu mesh light slots are not a hero lighting profile; active hero preview profile, owner-object revalidation, and real OmniLight/Probe values remain unresolved. ${characterLitViewerShaderPortBlocker}, so the full character-lit shader must remain diagnostic-only.`
        : `CFF0 menu mesh light slots are decoded, and current +0x1a0 owner-definition callsites classify as menu/UI resources rather than hero preview resources. Current native LevelVisuals/profile routing, typed-object key paths, current owner lifecycle, HUD/minimap negative evidence, render-command sampler owners, queue sorting, render-command transform-column position source, and diagnostic-complete character-lit formula structure are recovered, but the active hero preview profile and real OmniLight/Probe values remain unresolved. ${characterLitViewerShaderPortBlocker}, so the full character-lit shader should remain diagnostic-only.`,
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const evidence = buildNativeLightProbeRuntimeEvidence({
    androidLib: optionValue(args, "--android-lib", defaultAndroidLib),
    nativeEffectRuntimeLinksPath: optionValue(args, "--native-effect-runtime-links", defaultNativeEffectRuntimeLinksPath),
    menuMeshLightProbeCff0DiagnosticsPath: optionValue(
      args,
      "--menu-mesh-light-probe-cff0",
      defaultMenuMeshLightProbeCff0DiagnosticsPath,
    ),
    lightfieldRuntimeDiagnosticsPath: optionValue(
      args,
      "--lightfield-runtime-diagnostics",
      defaultLightfieldRuntimeDiagnosticsPath,
    ),
    levelVisualProfileDiagnosticsPath: optionValue(
      args,
      "--level-visual-profile-diagnostics",
      defaultLevelVisualProfileDiagnosticsPath,
    ),
    heroPreviewProfileCandidatesPath: optionValue(
      args,
      "--hero-preview-profile-candidates",
      defaultHeroPreviewProfileCandidatesPath,
    ),
    nativeBinaryVersionAuditPath: optionValue(
      args,
      "--native-binary-version-audit",
      defaultNativeBinaryVersionAuditPath,
    ),
    currentNativeAnchorAuditPath: optionValue(
      args,
      "--current-native-anchor-audit",
      defaultCurrentNativeAnchorAuditPath,
    ),
    currentNativeLightProbeChainAuditPath: optionValue(
      args,
      "--current-native-light-probe-chain-audit",
      defaultCurrentNativeLightProbeChainAuditPath,
    ),
    currentNativeOwnerDefinitionAuditPath: optionValue(
      args,
      "--current-native-owner-definition-audit",
      defaultCurrentNativeOwnerDefinitionAuditPath,
    ),
    currentNativeLevelVisualsSchemaAuditPath: optionValue(
      args,
      "--current-native-levelvisuals-schema-audit",
      defaultCurrentNativeLevelVisualsSchemaAuditPath,
    ),
    levelVisualsDefinitionFieldBridgePath: optionValue(
      args,
      "--level-visuals-definition-field-bridge",
      defaultLevelVisualsDefinitionFieldBridgePath,
    ),
    currentNativeLevelRuntimeOwnerAuditPath: optionValue(
      args,
      "--current-native-level-runtime-owner-audit",
      defaultCurrentNativeLevelRuntimeOwnerAuditPath,
    ),
    currentNativePositionSamplerOwnerAuditPath: optionValue(
      args,
      "--current-native-position-sampler-owner-audit",
      defaultCurrentNativePositionSamplerOwnerAuditPath,
    ),
    currentNativePreviewStringXrefAuditPath: optionValue(
      args,
      "--current-native-preview-string-xref-audit",
      defaultCurrentNativePreviewStringXrefAuditPath,
    ),
    typedObjectRuntimeKeyPayloadAuditPath: optionValue(
      args,
      "--typed-object-runtime-key-payload-audit",
      defaultTypedObjectRuntimeKeyPayloadAuditPath,
    ),
    structuredFunctionsDir: optionValue(args, "--structured-functions-dir", defaultStructuredFunctionsDir),
  });
  writeJson(optionValue(args, "--json-out", defaultJsonOut), evidence);
  writeJson(optionValue(args, "--viewer-out", defaultViewerOut), evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildNativeLightProbeRuntimeEvidence,
  parseElf64LoadSegments,
};
