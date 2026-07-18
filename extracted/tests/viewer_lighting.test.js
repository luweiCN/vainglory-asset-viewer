const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const indexHtml = fs.readFileSync(path.join(root, "viewer", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "viewer", "app.js"), "utf8");
const materialRuntimeShadersJs = fs.existsSync(path.join(root, "viewer", "material-runtime-shaders.js"))
  ? fs.readFileSync(path.join(root, "viewer", "material-runtime-shaders.js"), "utf8")
  : "";
const uiComponentsJs = fs.readFileSync(path.join(root, "viewer", "ui-components.js"), "utf8");
const localeJs = fs.readFileSync(path.join(root, "viewer", "locale.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(root, "viewer", "styles.css"), "utf8");
const heroCatalog = JSON.parse(fs.readFileSync(path.join(root, "viewer", "hero-catalog.json"), "utf8"));
const skinCatalog = JSON.parse(fs.readFileSync(path.join(root, "viewer", "skin-catalog.json"), "utf8"));
const skinAnimationBindings = JSON.parse(fs.readFileSync(path.join(root, "viewer", "skin-animation-bindings.json"), "utf8"));
const runtimeAttachmentBonesReport = JSON.parse(fs.readFileSync(path.join(root, "viewer", "runtime-attachment-bones.json"), "utf8"));
const packageJsonPath = path.join(repoRoot, "package.json");
const electronMainPath = path.join(repoRoot, "electron", "main.cjs");
const packageJson = fs.existsSync(packageJsonPath) ? fs.readFileSync(packageJsonPath, "utf8") : "";
const electronMain = fs.existsSync(electronMainPath) ? fs.readFileSync(electronMainPath, "utf8") : "";
const skinnedManifest = JSON.parse(fs.readFileSync(path.join(root, "viewer", "skinned-glb-pbr-manifest.json"), "utf8"));
const runtimeBindingConfig = JSON.parse(fs.readFileSync(path.join(root, "viewer", "runtime-binding-config.json"), "utf8"));
const cff0EffectInstanceGraph = JSON.parse(fs.readFileSync(path.join(root, "viewer", "cff0-effect-instance-graph.json"), "utf8"));
const effectPfxManifest = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-pfx-resource-manifest.json"), "utf8"));
const effectHookRuntimeManifest = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-hook-runtime-manifest.json"), "utf8"));
const effectNativeOptionProfile = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-native-option-profile.json"), "utf8"));
const effectRuntimeGaps = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-runtime-gaps.json"), "utf8"));
const nativeEffectDefinitionNeighborhood = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "native-effect-definition-neighborhood.json"), "utf8"),
);
const nativeProjectileCallbacks = JSON.parse(fs.readFileSync(path.join(root, "viewer", "native-projectile-callback-semantics.json"), "utf8"));
const runtimeSkinEffectAliases = JSON.parse(fs.readFileSync(path.join(root, "viewer", "runtime-skin-effect-aliases.json"), "utf8"));
const materialRuntimePipelineManifest = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "material-runtime-pipeline-manifest.json"), "utf8"),
);
const effectShadergraphManifest = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-shadergraph-material-manifest.json"), "utf8"),
);
const currentNativeLayoutBFlagProducerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-flag-producer-audit.json"), "utf8"),
);
const currentNativeLayoutBTypeOwnerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-type-owner-audit.json"), "utf8"),
);
const currentNativeLayoutBEntryOwnerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-entry-owner-audit.json"), "utf8"),
);
const currentNativeObjectAcWidthOverlapAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-object-ac-width-overlap-audit.json"), "utf8"),
);
const currentNativeObjectAcOwnerTraceAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-object-ac-owner-trace-audit.json"), "utf8"),
);
const currentNativeLayoutBCallbackBoundaryAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-callback-boundary-audit.json"), "utf8"),
);
const currentNativeLayoutBIndirectSlotAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-indirect-slot-audit.json"), "utf8"),
);
const currentNativeLayoutBSlotRecordBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-slot-record-bridge-audit.json"), "utf8"),
);
const currentNativeLayoutBActiveRecordLifecycleAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-active-record-lifecycle-audit.json"), "utf8"),
);
const currentNativeLayoutBTargetPayloadAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-target-payload-audit.json"), "utf8"),
);
const currentNativeLayoutBPfxTargetFactoryAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-pfx-target-factory-audit.json"), "utf8"),
);
const currentNativeLayoutBTargetCacheAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-target-cache-audit.json"), "utf8"),
);
const currentNativeLayoutBTargetPayloadNodeChainAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "current-native-layout-b-target-payload-node-chain-audit.json"),
    "utf8",
  ),
);
const currentNativeLayoutBPayloadSourceProgramBridgeAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "current-native-layout-b-payload-source-program-bridge-audit.json"),
    "utf8",
  ),
);
const currentNativeLayoutBManagerDrawBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-manager-draw-bridge-audit.json"), "utf8"),
);
const currentNativeLayoutBParticleEntryDispatchAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-particle-entry-dispatch-audit.json"), "utf8"),
);
const currentNativeLayoutBEntryProviderPayloadBridgeAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "current-native-layout-b-entry-provider-payload-bridge-audit.json"),
    "utf8",
  ),
);
const currentNativeLayoutBOwnerBVtableDispatchAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-owner-b-vtable-dispatch-audit.json"), "utf8"),
);
const currentNativeLayoutBPrimitiveModeDispatchAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-primitive-mode-dispatch-audit.json"), "utf8"),
);
const currentNativeLayoutBMaterialDrawBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-material-draw-bridge-audit.json"), "utf8"),
);
const currentNativeLayoutBFinalPrimitiveConsumerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-final-primitive-consumer-audit.json"), "utf8"),
);
const currentNativeLayoutBShaderParameterBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-shader-parameter-bridge-audit.json"), "utf8"),
);
const currentNativeShaderDataType4ValueSourceAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderdata-type4-value-source-audit.json"), "utf8"),
);
const currentNativeTexDataTextureObjectAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-texdata-texture-object-audit.json"), "utf8"),
);
const currentNativeShaderDataTextureSamplerTableAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderdata-texture-sampler-table-audit.json"), "utf8"),
);
const currentNativeShaderDataExternalTextureBindingAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderdata-external-texture-binding-audit.json"), "utf8"),
);
const currentNativeShaderDataInlineTexturePlaceholderAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderdata-inline-texture-placeholder-audit.json"), "utf8"),
);
const currentNativeShadergraphSamplerTexDataJoinAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shadergraph-sampler-texdata-join-audit.json"), "utf8"),
);
const currentNativeMaterialSourceProgramCaptureTargets = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-material-source-program-capture-targets.json"), "utf8"),
);
const currentNativeMaterialSourceProgramCaptureSummary = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-material-source-program-capture-summary.json"), "utf8"),
);
const currentNativeMaterialSamplerOwnershipGateAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-material-sampler-ownership-gate-audit.json"), "utf8"),
);
const currentNativeRuntimeKeySelectorCaptureTargets = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-runtime-key-selector-capture-targets.json"), "utf8"),
);
const runtimeKeySelectorCaptureSummary = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "runtime-key-selector-capture-summary.json"), "utf8"),
);
const currentNativeRuntimeCaptureGateAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-runtime-capture-gate-audit.json"), "utf8"),
);
const effectProjectileRuntimeGapAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-gap-audit.json"), "utf8"),
);
const effectProjectileCreateBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-create-bridge-audit.json"), "utf8"),
);
const effectProjectileTargetDispatchAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-target-dispatch-audit.json"), "utf8"),
);
const effectProjectileVtableSlotAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-vtable-slot-audit.json"), "utf8"),
);
const effectProjectileVtableFunctionAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-vtable-function-audit.json"), "utf8"),
);
const effectProjectileVtableOutputLayoutAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-vtable-output-layout-audit.json"), "utf8"),
);
const effectProjectileVtableCallsitePayloadAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-vtable-callsite-payload-audit.json"), "utf8"),
);
const effectProjectileVtableSemanticJoinAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-vtable-semantic-join-audit.json"), "utf8"),
);
const effectProjectileRuntimeConsumerTraceAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-consumer-trace-audit.json"), "utf8"),
);
const effectProjectileCurrentTokenWindowAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-current-token-window-audit.json"), "utf8"),
);
const effectProjectileCurrentBranchTargetAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-current-branch-target-audit.json"), "utf8"),
);
const effectProjectileCurrentFieldWriterCallsiteAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-current-field-writer-callsite-audit.json"), "utf8"),
);
const effectProjectileCurrentFieldReaderCandidateAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "effect-projectile-current-field-reader-candidate-audit.json"), "utf8"),
);
const effectProjectileCurrentFieldReaderCallsiteContextAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-field-reader-callsite-context-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentFieldReaderDownstreamRouteAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-field-reader-downstream-route-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentFieldReaderListDispatchAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-field-reader-list-dispatch-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildObjectChainAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-object-chain-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildCallbackBodyAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-callback-body-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildClassMethodAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-class-method-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildEvaluatorPayloadAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-evaluator-payload-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildPayloadSetterAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-payload-setter-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildPayloadSetterDownstreamAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-payload-setter-downstream-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildManagerRecordBridgeAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-manager-record-bridge-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildEffectOwnerCandidateAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-effect-owner-candidate-audit.json"),
    "utf8",
  ),
);
const effectProjectileCurrentTokenChildStaticPfxOwnerAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "effect-projectile-current-token-child-static-pfx-owner-audit.json"),
    "utf8",
  ),
);
const characterLitProbeBlockerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "character-lit-probe-blocker-audit.json"), "utf8"),
);
const currentNativeDynamicSourceTableSemanticsAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-dynamic-source-table-semantics-audit.json"), "utf8"),
);
const currentNativeStaticMeshSelectorEntryAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-static-mesh-selector-entry-audit.json"), "utf8"),
);
const currentNativeShaderParamsSchemaAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderparams-schema-audit.json"), "utf8"),
);
const currentNativeStaticMeshShaderParamsCaptureTargets = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-static-mesh-shaderparams-capture-targets.json"), "utf8"),
);
const currentNativeStaticMeshShaderParamsCaptureSummary = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-static-mesh-shaderparams-capture-summary.json"), "utf8"),
);
const currentNativeShaderParamsValueSemanticsAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-shaderparams-value-semantics-audit.json"), "utf8"),
);
const currentNativeLayoutBObjectAcStoreCoverageAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-object-ac-store-coverage-audit.json"), "utf8"),
);
const currentNativeLayoutBObjectAcRuntimeCaptureTargets = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-object-ac-runtime-capture-targets.json"), "utf8"),
);
const currentNativeLayoutBObjectAcRuntimeCaptureSummary = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-object-ac-runtime-capture-summary.json"), "utf8"),
);
const currentNativeLayoutBObjectAcCandidateDisqualificationAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-object-ac-candidate-disqualification-audit.json"), "utf8"),
);
const currentNativeLayoutBPayloadRecordLayoutAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-payload-record-layout-audit.json"), "utf8"),
);
const currentNativeLayoutAOwnerGlobalUsageAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-a-owner-global-usage-audit.json"), "utf8"),
);
const currentNativeLayoutARefreshStateSourceAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-a-refresh-state-source-audit.json"), "utf8"),
);
const currentNativeLayoutAStateWriterAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-a-state-writer-audit.json"), "utf8"),
);
const currentNativeLayoutAStateRegistrationAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-a-state-registration-audit.json"), "utf8"),
);
const currentNativeLayoutAAddRecordFlagSourceAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-a-add-record-flag-source-audit.json"), "utf8"),
);
const currentNativeParticleMaskCandidateOwnerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-particle-mask-candidate-owner-audit.json"), "utf8"),
);
const currentNativeType210PrimitiveBuilderAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-type210-primitive-builder-audit.json"), "utf8"),
);
const currentNativeType210LevelVisualsBridgeAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-type210-levelvisuals-bridge-audit.json"), "utf8"),
);
const currentNativeLayoutBVisibilityGateAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-visibility-gate-audit.json"), "utf8"),
);
const currentNativeLayoutBTargetStatusAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-target-status-audit.json"), "utf8"),
);
const currentNativeLayoutBRefreshModeSplitAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-refresh-mode-split-audit.json"), "utf8"),
);
const currentNativeLayoutBQueryApplyPathAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-query-apply-path-audit.json"), "utf8"),
);
const currentNativeLayoutBSharedStructApplyAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-shared-struct-apply-audit.json"), "utf8"),
);
const currentNativeLayoutBCallerStructInitializerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-caller-struct-initializer-audit.json"), "utf8"),
);
const currentNativeLayoutBComponentTableEntryAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-component-table-entry-audit.json"), "utf8"),
);
const currentNativeLayoutBComponentTableOwnerAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-component-table-owner-audit.json"), "utf8"),
);
const currentNativeLayoutBComponentSlotRegistrationAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-component-slot-registration-audit.json"), "utf8"),
);
const currentNativeLayoutBDirectCallerStructBuilderAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-direct-caller-struct-builder-audit.json"), "utf8"),
);
const currentNativeLayoutBResourceCallerDynamicFieldsAudit = JSON.parse(
  fs.readFileSync(
    path.join(root, "viewer", "current-native-layout-b-resource-caller-dynamic-fields-audit.json"),
    "utf8",
  ),
);
const currentNativeLayoutBCommonApplySetterFieldsAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-common-apply-setter-fields-audit.json"), "utf8"),
);
const currentNativeLayoutBObjectAcProducerGateAudit = JSON.parse(
  fs.readFileSync(path.join(root, "viewer", "current-native-layout-b-object-ac-producer-gate-audit.json"), "utf8"),
);

async function importViewerLocale() {
  return import(`${pathToFileURL(path.join(root, "viewer", "locale.js")).href}?t=${Date.now()}`);
}

function sectionHtml(idOrLabel) {
  const escaped = idOrLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    indexHtml.match(new RegExp(`<section id="${escaped}"[\\s\\S]*?<\\/section>`)) ||
    indexHtml.match(new RegExp(`<section class="control-section" aria-labelledby="${escaped}"[\\s\\S]*?<\\/section>`));
  return match?.[0] || "";
}

function functionSource(functionName) {
  const signature = `function ${functionName}`;
  const start = appJs.indexOf(signature);
  assert.notEqual(start, -1, `expected ${functionName} in app.js`);
  let bodyStart = -1;
  let parenDepth = 0;
  for (let index = start; index < appJs.length; index += 1) {
    if (appJs[index] === "(") parenDepth += 1;
    if (appJs[index] === ")") parenDepth -= 1;
    if (appJs[index] === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `expected ${functionName} body in app.js`);
  let depth = 0;
  for (let index = bodyStart; index < appJs.length; index += 1) {
    if (appJs[index] === "{") depth += 1;
    if (appJs[index] === "}") depth -= 1;
    if (depth === 0) return appJs.slice(start, index + 1);
  }
  throw new Error(`unterminated function body: ${functionName}`);
}

function glbJsonChunk(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString("utf8", 0, 4), "glTF");
  let offset = 12;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.toString("utf8", offset + 4, offset + 8);
    offset += 8;
    if (chunkType === "JSON") return JSON.parse(buffer.toString("utf8", offset, offset + chunkLength));
    offset += chunkLength;
  }
  throw new Error(`GLB JSON chunk not found: ${relativePath}`);
}

test("viewer uses reverse-engineered hero catalog and official localization keys", () => {
  assert.equal(heroCatalog.heroes.Hero010.english, "Skaarf");
  assert.equal(heroCatalog.heroes.Hero011.english, "Taka");
  assert.equal(heroCatalog.heroes.Hero028.english, "Lance");
  assert.equal(heroCatalog.heroes.Hero010.zhCN, "火龙 史卡夫");
  assert.equal(heroCatalog.heroes.Hero011.zhCN, "隐狐 塔卡");
  assert.equal(heroCatalog.heroes.Hero010.localizationKey, "CHAR_INFO_HERO010_NAME");
  assert.equal(heroCatalog.heroes.Hero011.localizationKey, "CHAR_INFO_SAYOC_NAME");
  assert.equal(heroCatalog.localization.zhCN.status, "loaded");
  assert.match(heroCatalog.localization.zhCN.dataFilePath, /CB18EE5517537ED8CDC0114FFBB8A4A2/);
  assert.match(JSON.stringify(heroCatalog.heroes.Hero010.sources), /Characters\/Hero010\/Skaarf\.def|KindredSkinManifest\.def/);
  assert.match(appJs, /fetchJson\("\.\/hero-catalog\.json"\)/);
  assert.match(appJs, /function heroKeyForItem\(item\)/);
  assert.match(appJs, /function displayItemCharacter\(item\)/);
  assert.match(localeJs, /export function localizeHeroName\(name\)[\s\S]*return english;/);
  assert.doesNotMatch(localeJs, /const HERO_NAMES = new Map/);
  assert.doesNotMatch(localeJs, /const SKIN_TERMS = new Map/);
  assert.doesNotMatch(localeJs, /阿达吉奥|林戈|默认皮肤/);
});

test("viewer uses reverse-engineered skin localization keys without hand-translating skin names", () => {
  assert.equal(skinCatalog.skins.Ringo_Skin_Pirate.localizationKey, "CHAR_THEME_NAME_RINGO_PIRATE");
  assert.equal(skinCatalog.skins.Ringo_Skin_Pirate.fallbackLabel, "Ringo_Pirate");
  assert.equal(skinCatalog.skins.Ringo_Skin_Pirate.zhCN, "海盗船长 林戈");
  assert.equal(skinCatalog.skins.Skaarf_Skin_Infinity_T1.localizationKey, "CHAR_THEME_NAME_SKAARF_WATERDRAGON");
  assert.equal(skinCatalog.skins.Skaarf_Skin_Infinity_T1.fallbackLabel, "Skaarf_Infinity_T1");
  assert.equal(skinCatalog.skins.Skaarf_Skin_Infinity_T1.zhCN, "深海苍龙 史卡夫");
  assert.equal(skinCatalog.localization.zhCN.status, "loaded");
  assert.match(appJs, /fetchJson\("\.\/skin-catalog\.json"\)/);
  assert.match(appJs, /function skinCatalogEntry\(item\)/);
  assert.match(appJs, /function displaySkinName\(entry, fallback\)/);
});

test("viewer loads runtime resource completeness diagnostics into model stats", () => {
  assert.match(appJs, /fetchJson\("\.\/runtime-resource-completeness\.json"\)/);
  assert.match(appJs, /let runtimeResourceCompletenessSummary = null;/);
  assert.match(appJs, /function buildRuntimeResourceCompletenessLookup\(items\)/);
  assert.match(appJs, /function runtimeResourceCompletenessStats\(item\)/);
  assert.match(appJs, /资源完整性：/);
  assert.match(appJs, /缺 baseColor 贴图/);
  assert.match(appJs, /部分材质无 baseColor/);
  assert.match(appJs, /function resourceCompletenessHealthSummary\(\)/);
  assert.match(appJs, /资源总表：/);
  assert.match(appJs, /runtimeObjectRows/);
  assert.match(appJs, /个运行时物件/);
  assert.match(appJs, /rawUnresolvedRuntimeBindSlotRows/);
  assert.match(appJs, /个非骨架挂点已由 runtime 表覆盖/);
  assert.match(appJs, /个材质需复核/);
});

test("viewer loads per-material GLB coverage diagnostics for real white-model checks", () => {
  assert.match(appJs, /fetchJson\("\.\/glb-material-coverage\.json"\)/);
  assert.match(appJs, /let glbMaterialCoverageSummary = null;/);
  assert.match(appJs, /function buildGlbMaterialCoverageLookup\(items\)/);
  assert.match(appJs, /function runtimeGlbMaterialCoverageStats\(item\)/);
  assert.match(appJs, /材质明细：/);
  assert.match(appJs, /baseColor 贴图/);
  assert.match(appJs, /疑似白膜/);
  assert.match(appJs, /function glbMaterialCoverageHealthSummary\(\)/);
  assert.match(appJs, /GLB 材质：/);
});

test("viewer loads runtime state condition diagnostics without taking over rendering", () => {
  assert.match(appJs, /fetchJson\("\.\/runtime-state-conditions\.json"\)/);
  assert.match(appJs, /let runtimeStateConditionSummary = null;/);
  assert.match(appJs, /function buildRuntimeStateConditionLookup\(items\)/);
  assert.match(appJs, /function runtimeStateConditionStats\(item\)/);
  assert.match(appJs, /状态条件：/);
  assert.match(appJs, /function runtimeStateConditionHealthSummary\(\)/);
  assert.match(appJs, /状态条件：\$\{summary\.rows\} 条/);
  assert.match(appJs, /条显隐状态/);
  assert.match(appJs, /条显隐回调/);
  assert.match(appJs, /条技能变量/);
});

test("viewer loads native attachment runtime chain diagnostics without applying guessed transforms", () => {
  assert.match(appJs, /fetchJson\("\.\/runtime-attachment-native-chain-manifest\.json"\)/);
  assert.match(appJs, /let runtimeAttachmentNativeChainSummary = null;/);
  assert.match(appJs, /function buildRuntimeAttachmentNativeChainLookup\(items\)/);
  assert.match(appJs, /function runtimeAttachmentNativeChainStats\(item\)/);
  assert.match(appJs, /附件 Runtime：/);
  assert.match(appJs, /条额外变换/);
  assert.match(appJs, /条 Helper 调用/);
  assert.match(appJs, /function runtimeAttachmentNativeChainHealthSummary\(\)/);
});

test("viewer translates action labels without mixing death, recall, normal attack, and crit", async () => {
  const { localizeAnimationName } = await importViewerLocale();
  assert.equal(localizeAnimationName("Death"), "死亡 / Death");
  assert.equal(localizeAnimationName("Withdraw"), "回城 / Withdraw");
  assert.equal(localizeAnimationName("Attack"), "普攻 / Attack");
  assert.equal(localizeAnimationName("CritAttack"), "暴击 / CritAttack");
  assert.equal(localizeAnimationName("Attack_Crit"), "暴击 / Attack_Crit");
  assert.equal(localizeAnimationName("Ability01_DefaultAttack"), "一技能普攻 / Ability01_DefaultAttack");
  assert.equal(localizeAnimationName("Ability02_Attack"), "二技能普攻 / Ability02_Attack");
  assert.equal(localizeAnimationName("Ability02_CritAttack"), "二技能暴击 / Ability02_CritAttack");
  assert.equal(localizeAnimationName("Ability02_Attack_Crit"), "二技能暴击 / Ability02_Attack_Crit");
  assert.equal(localizeAnimationName("Ability01_ChargedAttack"), "一技能蓄力普攻 / Ability01_ChargedAttack");
  assert.equal(localizeAnimationName("Ability01_ChargingAttack"), "一技能蓄力中普攻 / Ability01_ChargingAttack");
  assert.equal(localizeAnimationName("Ability01_EmpoweredAttack"), "一技能强化普攻 / Ability01_EmpoweredAttack");
  assert.equal(localizeAnimationName("Ability02_AttackAndLeap"), "二技能普攻跳跃 / Ability02_AttackAndLeap");
  assert.equal(localizeAnimationName("Ability02Cast"), "二技能施放 / Ability02Cast");
  assert.doesNotMatch(localizeAnimationName("Ability02_Attack_Crit"), /暴击攻击|攻击暴击|暴击普攻|回程/);
});

test("viewer prefixes opaque raw animation labels with recovered action keys", () => {
  const ringoBinding = skinAnimationBindings.items.find((item) => item.modelLabel === "Ringo_DefaultSkin");
  const achillesCut = ringoBinding?.animations?.find((animation) => animation.label === "AchillesCut");
  assert.equal(achillesCut?.actionKey, "ability01");
  const optionLabelSource = functionSource("animationOptionLabel");
  assert.match(appJs, /function animationActionKeyLabel\(actionKey\)/);
  assert.match(optionLabelSource, /const actionPrefix = animationActionKeyLabel\(animation\.actionKey\);/);
  assert.match(optionLabelSource, /const displayLabel = actionPrefix && !localizedLabel\.includes\(actionPrefix\)\s*\? `\$\{actionPrefix\} \/ \$\{localizedLabel\}`\s*: localizedLabel;/);
  assert.match(optionLabelSource, /return suffix \? `\$\{displayLabel\} \(\$\{suffix\}\)` : displayLabel;/);
});

test("viewer animation manifest does not label death clips as attacks or abilities", () => {
  const mislabeledDeathClips = [];
  for (const item of skinAnimationBindings.items || []) {
    for (const animation of item.animations || []) {
      if (animation.actionKey !== "death") continue;
      if (animation.label !== "Death") mislabeledDeathClips.push(`${item.modelLabel}: ${animation.label} -> ${animation.targetRelativePath}`);
    }
  }

  assert.deepEqual(mislabeledDeathClips.slice(0, 10), []);
});

test("viewer removes unused grid and manual file loading controls", () => {
  assert.doesNotMatch(indexHtml, /id="gridToggle"/);
  assert.doesNotMatch(indexHtml, /id="fileInput"/);
  assert.doesNotMatch(indexHtml, /打开模型/);
  assert.doesNotMatch(appJs, /gridToggle/);
  assert.doesNotMatch(appJs, /fileInput/);
  assert.doesNotMatch(appJs, /dragenter|dragover|dataTransfer/);
  assert.doesNotMatch(stylesCss, /\.drop/);
});

test("viewer scopes animation controls to the skinned preview type and resets stale form state", () => {
  assert.match(appJs, /function isAnimationFormat\(\)\s*{\s*return currentFormat\(\) === "skinned";\s*}/);
  assert.match(appJs, /function resetViewerControlsForModel\(\)/);
  assert.match(appJs, /function syncFormatControls\(\)/);
  assert.match(appJs, /const animationControls = document\.querySelector\("#animationControls"\);/);
  assert.match(appJs, /const animatedDisplayControls = document\.querySelector\("#animatedDisplayControls"\);/);
  assert.match(appJs, /const staticFormatLabel = document\.querySelector\("#staticFormatLabel"\);/);
  assert.match(appJs, /const animationPlaybackPanel = document\.querySelector\("#animationPlaybackPanel"\);/);
  assert.match(appJs, /const animationActionControl = document\.querySelector\("#animationActionControl"\);/);
  assert.match(appJs, /const animationTimeline = document\.querySelector\("#animationTimeline"\);/);
  assert.match(appJs, /staticFormatLabel\.hidden = animated;/);
  assert.match(appJs, /animationControls\.hidden = !animated;/);
  assert.match(appJs, /animatedDisplayControls\.hidden = !animated;/);
  assert.doesNotMatch(appJs, /staticPreviewNotice/);
  assert.match(appJs, /animationPlaybackPanel\.hidden = false;/);
  assert.match(appJs, /animationActionControl\.hidden = !animated;/);
  assert.match(appJs, /animationTimeline\.hidden = !animated;/);
  assert.match(appJs, /animationSelect\.disabled = !animated \|\| !activeAnimations\.length/);
  assert.match(appJs, /animationTimeRange\.disabled = !hasAnimation/);
  assert.match(appJs, /poseLoopToggle\.disabled = !animated;/);
  assert.match(appJs, /bonesToggle\.disabled = !animated;/);
  assert.match(appJs, /function syncEffectsToggleAvailability\(enabled\)/);
  // 特效部件默认关闭：只控制可用性，不自动勾选（防止运行时特效面片默认显示）。
  assert.match(appJs, /effectsToggle\.disabled = !enabled;/);
  assert.match(appJs, /if \(!enabled\) effectsToggle\.checked = false;/);
  assert.doesNotMatch(appJs, /effectsToggle\.checked = true/);
  assert.doesNotMatch(appJs, /wasDisabled/);
  assert.match(appJs, /syncEffectsToggleAvailability\(animated && hasRuntimeEffectPreviews\(\)\);/);
  assert.match(appJs, /syncEffectsToggleAvailability\(animated && Boolean\(activeRuntimeEffectObjects\.length\)\);/);
  assert.match(appJs, /resetViewerControlsForModel\(\);\s*modelPath\.textContent = item\.rel;/);
  const formatChangeHandler = appJs.match(/formatSelect\.addEventListener\("change", \(\) => \{[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(formatChangeHandler, /resetViewerControlsForModel\(\);\s*syncCharacters\(\);\s*renderList\(\);\s*loadDefaultModel\(\);/s);
  assert.doesNotMatch(formatChangeHandler, /searchInput\.value = ""|characterSelect\.value = ""/);
});

test("viewer explains static versus animated preview controls in the form", () => {
  assert.match(indexHtml, /data-preview-mode="skinned"[\s\S]*动态模型/);
  assert.match(indexHtml, /data-preview-mode="static"[\s\S]*静态模型/);
  assert.doesNotMatch(indexHtml, /资源筛选|先选动态或静态|动态模型用于试动作|静态模型用于检查|选择下拉里的英雄/);
  assert.match(indexHtml, /id="staticFormatLabel"[\s\S]*静态来源/);
  assert.match(indexHtml, /<option value="pbr" data-description="优先使用已恢复材质和贴图的英雄皮肤模型。">材质模型<\/option>/);
  assert.match(indexHtml, /<option value="all" data-description="包含全部已转 GLB 的资源，适合查找非英雄或遗漏模型。">全部资源模型<\/option>/);
  assert.match(indexHtml, /<option value="textured" data-description="旧版贴图和 MTL 转换结果，适合对比老资源贴图。">旧版贴图模型<\/option>/);
  assert.match(indexHtml, /<option value="glb" data-description="游戏包里直接拆出的原始 GLB，尽量少做额外处理。">原始 GLB<\/option>/);
  assert.match(indexHtml, /<option value="obj" data-description="OBJ 和 MTL 资源的几何预览，适合排查旧模型结构。">OBJ 线框模型<\/option>/);
  assert.doesNotMatch(indexHtml, /id="staticPreviewNotice"|当前是静态预览/);
  assert.match(indexHtml, /id="animationControls"[\s\S]*data-preview-scope="skinned"/);
  assert.doesNotMatch(indexHtml, /动态附属资源/);
  assert.doesNotMatch(indexHtml, /只在“动态模型”下显示/);
  assert.match(indexHtml, /id="attachmentSelect"[\s\S]*随皮肤拆出的武器、帽子、召唤物或特效挂件/);
  assert.match(indexHtml, /id="animationActionControl" class="viewport-animation-control"[\s\S]*id="animationSelect" disabled aria-label="动作"[\s\S]*没有可用动作/);
  assert.match(indexHtml, /id="animationTimeline"[\s\S]*动作时间轴/);
  assert.doesNotMatch(indexHtml, /关闭播放后，可以拖动时间轴停在任意一帧/);
});

test("viewer describes render and animation switches in plain language", () => {
  const renderControls = sectionHtml("renderControls");
  const animationControls = sectionHtml("animationControls");
  assert.doesNotMatch(indexHtml, /适用于所有预览类型/);
  assert.match(renderControls, /id="wireToggle"[\s\S]*显示模型三角面边线/);
  assert.match(renderControls, /id="bloomToggle"[\s\S]*给高亮材质加一层轻微发光/);
  assert.match(renderControls, /id="bonesToggle"[\s\S]*显示骨骼点和骨骼连线/);
  assert.match(renderControls, /id="effectsToggle"[\s\S]*显示攻击拖尾、法术光片、水面或武器轨迹/);
  assert.doesNotMatch(animationControls, /id="bonesToggle"|id="effectsToggle"|id="poseLoopToggle"/);
  assert.doesNotMatch(renderControls, /id="frameButton"/);
  assert.match(indexHtml, /把模型重新居中到画面/);
});

test("viewer keeps playback controls in the preview timeline instead of the sidebar", () => {
  const playbackPanel = sectionHtml("animationPlaybackPanel");
  const animationControls = sectionHtml("animationControls");
  assert.match(playbackPanel, /id="poseLoopToggle" type="checkbox" checked hidden/);
  assert.match(indexHtml, /<div class="viewport" id="viewport">[\s\S]*id="animationActionControl" class="viewport-animation-control"[\s\S]*id="animationSelect" disabled aria-label="动作"[\s\S]*<div class="viewport-actions"/);
  assert.doesNotMatch(indexHtml, /id="animationActionControl"[\s\S]*<span>动作<\/span>/);
  assert.match(playbackPanel, /class="player-row"[\s\S]*id="animationTimeline"[\s\S]*class="player-actions"/);
  assert.doesNotMatch(playbackPanel, /id="animationActionControl"|id="animationSelect"/);
  assert.match(playbackPanel, /id="playPauseButton" class="play-toggle" type="button" aria-label="暂停动作"[\s\S]*class="play-icon play-icon-pause"/);
  assert.match(playbackPanel, /id="animationTimeRange"[\s\S]*aria-label="动作时间轴"/);
  assert.match(playbackPanel, /id="animationTimeText"/);
  assert.match(playbackPanel, /id="animationFrameText"/);
  assert.match(playbackPanel, /id="playbackSpeedSelect"[\s\S]*value="0.1"/);
  assert.match(playbackPanel, /id="playbackSpeedSelect"[\s\S]*value="4"/);
  assert.match(playbackPanel, /id="openExportDialogButton"[\s\S]*导出/);
  assert.match(playbackPanel, /id="openRecordDialogButton"[\s\S]*录制/);
  assert.match(stylesCss, /\.viewport-animation-control/);
  assert.match(stylesCss, /\.viewport-animation-control \.ui-select/);
  assert.doesNotMatch(stylesCss, /\.viewport-animation-control \.playback-select/);
  assert.match(stylesCss, /\.play-icon-play::before/);
  assert.match(stylesCss, /\.play-icon-pause::before/);
  assert.match(appJs, /playPauseButton\.setAttribute\("aria-label", isPlaying \? "暂停动作" : "播放动作"\);/);
  assert.match(stylesCss, /\.playback-panel\.is-static \.player-row/);
  assert.doesNotMatch(animationControls, /播放动作|id="animationSelect"|id="playPauseButton"|id="animationTimeRange"/);
  assert.doesNotMatch(playbackPanel, /关闭播放后/);
});

test("viewer keeps searchable hero filtering available for the default skinned preview", () => {
  const skinnedCharacters = new Set((skinnedManifest.items || []).map((item) => item.sourceRelativePath?.match(/^Characters\/([^/]+)\//)?.[1] || item.character));
  assert.ok(skinnedCharacters.size > 0, "expected skinned manifest to expose filterable characters");
  assert.doesNotMatch(indexHtml, /list="heroSearchOptions"/);
  assert.doesNotMatch(indexHtml, /<datalist/);
  assert.match(indexHtml, /class="combo-field"/);
  assert.match(indexHtml, /id="heroDropdownButton" class="combo-trigger"/);
  assert.match(indexHtml, /id="heroSearchOptions" class="combo-menu" role="listbox" hidden/);
  assert.match(indexHtml, /<select id="characterSelect" hidden>\s*<option value="">全部英雄<\/option>\s*<\/select>/);
  assert.match(appJs, /characterSelect\.replaceChildren\(new Option\("全部英雄", ""\)\);/);
  assert.match(appJs, /heroSearchOptions\.replaceChildren\(\);/);
  assert.match(appJs, /searchOptionToHero\.set\(normalizeSearchValue\(alias\), character\);/);
  assert.match(appJs, /heroCombobox = createCombobox\(\{/);
  assert.match(appJs, /triggerButton:\s*heroDropdownButton/);
  assert.match(appJs, /onQueryChange:\s*syncSearchSelection/);
  assert.match(appJs, /onSelect:\s*selectHeroSearchItem/);
  assert.doesNotMatch(appJs, /searchInput\.addEventListener\("input", syncSearchSelection\);/);
  assert.match(appJs, /if \(manifests\.skinned\.length\) \{\s*formatSelect\.value = "skinned";/);
});

test("viewer keeps the available model selector directly under the filters", () => {
  const filterIndex = indexHtml.indexOf('class="asset-filter-panel"');
  const searchIndex = indexHtml.indexOf('id="searchInput"');
  const formatIndex = indexHtml.indexOf('id="formatSelect"');
  const pickerIndex = indexHtml.indexOf('class="model-picker"');
  const listIndex = indexHtml.indexOf('id="modelList"');
  const lightingIndex = indexHtml.indexOf('id="lightingSelect"');
  const renderControlsIndex = indexHtml.indexOf('id="renderControls"');

  assert.ok(filterIndex >= 0, "expected filter panel");
  assert.ok(searchIndex >= 0, "expected search filter");
  assert.ok(formatIndex > filterIndex, "expected static source inside filter panel");
  assert.ok(pickerIndex > searchIndex, "expected model selector after filters");
  assert.ok(listIndex > pickerIndex, "expected model list inside model selector");
  assert.ok(listIndex < lightingIndex, "expected model list before lighting controls");
  assert.ok(listIndex < renderControlsIndex, "expected model list before display switches");
  assert.doesNotMatch(indexHtml, /id="modelPickerTitle"|可用模型|选择要加载的英雄、皮肤或模型资源/);
  assert.match(indexHtml, /id="modelList" aria-label="英雄模型列表"/);
  assert.match(stylesCss, /\.model-picker\s*{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(stylesCss, /\.list\s*{[\s\S]*flex:\s*1 1 auto;[\s\S]*overflow:\s*auto;/);
  assert.match(appJs, /title\.className = "model-title";/);
  assert.match(appJs, /subtitle\.className = "model-subtitle";/);
  assert.match(appJs, /path\.className = "model-path";/);
  assert.match(appJs, /radio\.className = "model-radio";/);
  assert.match(appJs, /button\.setAttribute\("aria-pressed", String\(selected\)\);/);
  assert.match(appJs, /function clearActiveModelButtons\(\)/);
  assert.match(appJs, /modelList\.querySelectorAll\("\.model-button\.active"\)/);
  assert.match(appJs, /button\.classList\.remove\("active"\)/);
  assert.match(appJs, /button\.setAttribute\("aria-pressed", "false"\)/);
  assert.match(appJs, /clearActiveModelButtons\(\);\s*activeButton = button;/);
  assert.match(appJs, /activeButton\.setAttribute\("aria-pressed", "false"\);/);
  assert.match(appJs, /activeButton\.setAttribute\("aria-pressed", "true"\);/);
  assert.match(stylesCss, /\.model-subtitle\s*{[\s\S]*white-space:\s*normal;/);
  assert.match(stylesCss, /\.model-radio\s*{[\s\S]*border-radius:\s*50%;/);
  assert.match(stylesCss, /\.model-button\.active \.model-radio/);
});

test("viewer uses styled component wrappers for selectors, inputs, switches, and scroll areas", () => {
  assert.match(indexHtml, /class="sidebar model-sidebar"/);
  assert.match(indexHtml, /class="settings-sidebar"/);
  assert.ok(indexHtml.indexOf('class="settings-sidebar"') > indexHtml.indexOf('class="stage"'));
  assert.match(appJs, /import \{ createCombobox,\s*createSelectMenu \} from "\.\/ui-components\.js";/);
  assert.match(
    appJs,
    /selectMenus = \[[\s\S]*formatSelect,[\s\S]*lightingSelect,[\s\S]*animationSelect,[\s\S]*playbackSpeedSelect,[\s\S]*attachmentSelect,[\s\S]*recordCameraSelect,[\s\S]*recordFormatSelect,[\s\S]*recordQualitySelect,[\s\S]*\]\.map\(\(select\) => createSelectMenu\(select\)\)/,
  );
  assert.match(uiComponentsJs, /export function createSelectMenu\(select\)/);
  assert.match(uiComponentsJs, /const dialogHost = select\.closest\("dialog"\);/);
  assert.match(uiComponentsJs, /const menuHost = dialogHost \|\| document\.body;/);
  assert.match(uiComponentsJs, /menuHost\.append\(menu\);/);
  assert.match(uiComponentsJs, /ui-select-menu-dialog/);
  assert.match(appJs, /function setSelectDisabled\(select,\s*disabled\)/);
  assert.match(appJs, /selectDisabledChanged = setSelectDisabled\(playbackSpeedSelect,\s*!hasAnimation\) \|\| selectDisabledChanged;/);
  assert.match(appJs, /if \(selectDisabledChanged\) refreshSelectMenus\(\);/);
  assert.match(uiComponentsJs, /export function createCombobox\(\{[\s\S]*triggerButton/);
  assert.match(uiComponentsJs, /function placeMenu\(\)/);
  assert.match(uiComponentsJs, /window\.innerHeight/);
  assert.match(uiComponentsJs, /event\.key === "ArrowDown"/);
  assert.match(uiComponentsJs, /event\.key === "Home"/);
  assert.match(stylesCss, /grid-template-columns:\s*minmax\(360px,\s*440px\)\s*minmax\(420px,\s*1fr\)\s*minmax\(280px,\s*340px\)/);
  assert.match(stylesCss, /\.native-select/);
  assert.match(stylesCss, /\.combo-field/);
  assert.match(stylesCss, /\.combo-trigger/);
  assert.match(stylesCss, /\.combo-clear/);
  assert.match(stylesCss, /\.ui-select-button/);
  assert.match(stylesCss, /\.ui-select-menu/);
  assert.match(stylesCss, /\.ui-select-menu\s*{[\s\S]*position:\s*fixed;/);
  assert.match(stylesCss, /\.ui-select-menu-dialog/);
  assert.match(stylesCss, /\.action-dialog\s*{[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(stylesCss, /\.ui-select-option::before/);
  assert.doesNotMatch(stylesCss, /\.ui-select-option\[aria-selected="true"\]::before/);
  assert.match(stylesCss, /\.combo-menu/);
  assert.match(stylesCss, /\.switch-row input\[type="checkbox"\]/);
  assert.match(stylesCss, /::-webkit-scrollbar-thumb/);
});

test("viewer exposes preview background colors from the lower-left canvas corner without helper grids", () => {
  assert.match(indexHtml, /id="backgroundControl" class="viewport-background-control"/);
  assert.match(indexHtml, /id="backgroundPanelToggle"[\s\S]*aria-controls="backgroundPanel"[\s\S]*背景/);
  assert.match(indexHtml, /id="backgroundPanel" class="background-panel" hidden/);
  assert.match(indexHtml, /data-background-color="black" aria-pressed="true"[\s\S]*黑色/);
  assert.match(indexHtml, /data-background-color="charcoal" aria-pressed="false"[\s\S]*深灰/);
  assert.match(indexHtml, /data-background-color="light" aria-pressed="false"[\s\S]*浅灰/);
  assert.doesNotMatch(indexHtml, /data-background-guide/);
  assert.doesNotMatch(indexHtml, /辅助线|地面网格|星空网格/);
  assert.doesNotMatch(indexHtml, /id="backgroundSelect"/);
  assert.match(stylesCss, /\.viewport-background-control\s*{[\s\S]*left:\s*16px;[\s\S]*bottom:\s*16px;[\s\S]*pointer-events:\s*none;/);
  assert.match(stylesCss, /\.background-panel\s*{[\s\S]*bottom:\s*calc\(100% \+ 8px\);[\s\S]*pointer-events:\s*auto;/);
  assert.match(stylesCss, /\.background-swatches/);
  assert.doesNotMatch(stylesCss, /\.background-guide-options/);
  assert.match(stylesCss, /@media \(max-width: 900px\)[\s\S]*\.background-panel\s*{[\s\S]*width:\s*min\(252px,\s*calc\(100vw - 32px\)\);/);
  assert.match(appJs, /const backgroundPanelToggle = document\.querySelector\("#backgroundPanelToggle"\);/);
  assert.match(appJs, /const backgroundPanel = document\.querySelector\("#backgroundPanel"\);/);
  assert.match(appJs, /const backgroundColorButtons = \[\.\.\.document\.querySelectorAll/);
  assert.match(appJs, /data-background-color/);
  assert.doesNotMatch(appJs, /backgroundGuideButtons|data-background-guide|activeBackgroundGuide/);
  assert.match(appJs, /const BACKGROUND_COLOR_PRESETS = \{/);
  assert.doesNotMatch(appJs, /BACKGROUND_GUIDE_PRESETS|new THREE\.GridHelper\(|new THREE\.Points\(/);
  assert.match(appJs, /let activeBackgroundColor = "black";/);
  assert.doesNotMatch(appJs, /backgroundGridGroup|previewGroundY|syncPreviewBackgroundVisibility|syncPreviewBackgroundGroundY/);
  assert.match(appJs, /function setBackgroundPanelOpen\(open\)/);
  assert.match(appJs, /function syncBackgroundControlButtons\(\)/);
  assert.match(appJs, /function applyPreviewBackground\(\)/);
  assert.match(appJs, /scene\.background = new THREE\.Color\(colorPreset\.color\);/);
  assert.match(appJs, /backgroundPanelToggle\.addEventListener\("click"/);
  assert.match(appJs, /backgroundColorButtons\.forEach\(\(button\)/);
  assert.doesNotMatch(appJs, /backgroundSelect/);
  assert.match(appJs, /applyPreviewBackground\(\);/);
});

test("viewer keeps camera controls on the canvas and preserves view while switching models", () => {
  assert.doesNotMatch(indexHtml, /id="viewOffsetYRange"/);
  assert.doesNotMatch(indexHtml, /画面上下/);
  assert.match(indexHtml, /class="viewport-actions"[\s\S]*id="frameButton"[\s\S]*居中模型/);
  assert.match(indexHtml, /class="camera-help"/);
  assert.match(indexHtml, /按住左键拖动：旋转模型/);
  assert.match(indexHtml, /滚动滚轮：拉近或拉远/);
  assert.match(indexHtml, /按住右键或中键拖动：平移画面/);
  assert.match(stylesCss, /\.viewport-actions/);
  assert.match(stylesCss, /\.canvas-action-button/);
  assert.match(indexHtml, /id="recordCameraSelect"/);
  assert.match(indexHtml, /value="static" selected data-description="保持当前视角不动，只录动作播放。">固定当前视角/);
  assert.match(indexHtml, /value="orbit" data-description="围绕模型转一圈，适合展示整体外观。">摄像头绕一周/);
  assert.match(indexHtml, /value="top-down" data-description="从上方角度扫过，适合看体积和姿态。">从上往下/);
  assert.match(indexHtml, /value="left-right" data-description="横向移动镜头，适合展示侧面轮廓。">从左往右/);
  assert.match(indexHtml, /value="push-in" data-description="从稍远处慢慢推近，适合展示当前皮肤细节。">缓慢推近/);
  assert.doesNotMatch(appJs, /viewOffsetYRange/);
  assert.doesNotMatch(appJs, /function applyViewOffset\(\)/);
  assert.match(appJs, /const shouldResetCamera = !activeObject;/);
  assert.match(appJs, /frameObject\(activeObject,\s*\{\s*resetCamera:\s*shouldResetCamera\s*\}\);/);
  assert.match(appJs, /function frameObject\(object,\s*options = \{\}\)/);
  assert.match(appJs, /const resetCamera = options\.resetCamera \?\? true;/);
  assert.match(appJs, /function framedCameraDistance\(size,\s*aspect,\s*fovDegrees\)/);
  assert.match(appJs, /const verticalDistance = fitHeight \/ \(2 \* Math\.tan\(fovRadians \/ 2\)\);/);
  assert.match(appJs, /const horizontalDistance = fitWidth \/ \(2 \* Math\.tan\(horizontalFovRadians \/ 2\)\);/);
  assert.match(appJs, /const distance = framedCameraDistance\(normalizedSize,\s*camera\.aspect,\s*camera\.fov\);/);
  assert.match(appJs, /logarithmicDepthBuffer:\s*true/);
  assert.match(appJs, /const CAMERA_CLIP_RADIUS_PADDING = 4;/);
  assert.match(appJs, /let activeCameraClipSphere = null;/);
  assert.match(appJs, /function updateActiveCameraClipSphere\(box\)/);
  assert.match(appJs, /function updateCameraClipPlanes\(\)/);
  assert.match(appJs, /const paddedRadius = Math\.max\(sphere\.radius \* CAMERA_CLIP_RADIUS_PADDING,\s*1\);/);
  assert.match(appJs, /camera\.near = Math\.max\(CAMERA_CLIP_MIN_NEAR,\s*distanceToCenter - paddedRadius\);/);
  assert.match(appJs, /camera\.far = Math\.max\(camera\.near \+ CAMERA_CLIP_MIN_DEPTH_SPAN,\s*distanceToCenter \+ paddedRadius\);/);
  assert.match(appJs, /updateActiveCameraClipSphere\(normalizedBox\);/);
  assert.match(appJs, /updateCameraClipPlanes\(\);/);
  assert.doesNotMatch(appJs, /const distance = Math\.max\(normalizedSize\.x,\s*normalizedSize\.y,\s*normalizedSize\.z\) \* 2\.35;/);
  assert.doesNotMatch(appJs, /camera\.far = Math\.max\(maxDim \* 100,\s*10000\);/);
  assert.match(appJs, /const preservedCameraOffset = camera\.position\.clone\(\)\.sub\(controls\.target\);/);
  assert.match(appJs, /const preservedCameraDistance = preservedCameraOffset\.length\(\);/);
  assert.match(appJs, /const preservedCameraDirection =\s*preservedCameraDistance > 0\.0001/s);
  assert.match(appJs, /new THREE\.Vector3\(0\.45,\s*0\.35,\s*1\)\.normalize\(\)/);
  assert.match(appJs, /let lastFrameFitDistance = null;/);
  assert.match(appJs, /const previousFitDistance = Number\.isFinite\(lastFrameFitDistance\) && lastFrameFitDistance > 0 \? lastFrameFitDistance : distance;/);
  assert.match(appJs, /const preservedZoomRatio = preservedCameraDistance \/ previousFitDistance;/);
  assert.match(
    appJs,
    /const fittedPreservedDistance = THREE\.MathUtils\.clamp\(distance \* preservedZoomRatio,\s*distance \* 0\.65,\s*distance \* 2\.5\);/,
  );
  assert.doesNotMatch(appJs, /const fittedPreservedDistance = Math\.max\(preservedCameraDistance,\s*distance\);/);
  assert.match(
    appJs,
    /if \(!resetCamera\) \{\s*controls\.target\.copy\(normalizedCenter\);\s*camera\.position\.copy\(normalizedCenter\)\.add\(preservedCameraDirection\.multiplyScalar\(fittedPreservedDistance\)\);\s*camera\.lookAt\(controls\.target\);\s*controls\.update\(\);\s*return;\s*\}/s,
  );
  assert.match(appJs, /function scheduleAutoFrameIfCanvasBlank\(object,\s*options = \{\}\)/);
  assert.match(
    appJs,
    /function syncAnimationStats\(\)[\s\S]*renderStats\(\);\s*if \(activeObject\) \{\s*frameActiveObjectAfterPendingAnimationPose\(\);\s*scheduleAutoFrameIfCanvasBlank\(activeObject\);/,
  );
  assert.match(appJs, /canvasHasVisibleModelPixels\(\)/);
  assert.match(appJs, /const MIN_PROJECTED_VIEWPORT_COVERAGE = 0\.012;/);
  assert.match(appJs, /const MIN_CENTERED_PROJECTED_VIEWPORT_COVERAGE = 0\.004;/);
  assert.match(appJs, /const MIN_REFIT_PROJECTED_VIEWPORT_COVERAGE = 0\.028;/);
  assert.match(appJs, /const MAX_REFIT_PROJECTED_VIEWPORT_COVERAGE = 0\.82;/);
  assert.match(appJs, /const AUTO_FRAME_RETRY_COUNT = 4;/);
  assert.match(appJs, /function objectProjectedViewportCoverage\(object\)/);
  assert.match(appJs, /function objectProjectedBoundsVisible\(object\)/);
  assert.match(appJs, /function objectNeedsCameraRefit\(object,\s*options = \{\}\)/);
  assert.match(appJs, /function objectProjectedViewportCoverage\(object\)[\s\S]*const skinnedBox = object === activeObject \? boxFromRobustSkinnedSummary\(summarizeCurrentSkinnedBounds\(0\)\) : null;/);
  assert.match(appJs, /function objectProjectedViewportCoverage\(object\)[\s\S]*objectBox = skinnedBox;/);
  assert.match(appJs, /if \(isPreviewEffectMesh\(child\)\) return;/);
  assert.match(appJs, /const projectedCenter = objectBox\.getCenter\(new THREE\.Vector3\(\)\)\.project\(camera\);/);
  assert.match(appJs, /const viewportCoverage = \(overlapX \* overlapY\) \/ 4;/);
  assert.match(appJs, /visibleProjectedRatio: viewportCoverage/);
  assert.match(appJs, /const projection = objectProjectedViewportCoverage\(object\);/);
  assert.match(appJs, /projection\.visibleProjectedRatio >= MIN_PROJECTED_VIEWPORT_COVERAGE/);
  assert.match(appJs, /projection\.centerInView && projection\.visibleProjectedRatio >= MIN_CENTERED_PROJECTED_VIEWPORT_COVERAGE/);
  assert.match(appJs, /const minProjectedCoverage = options\.minProjectedCoverage \?\? MIN_PROJECTED_VIEWPORT_COVERAGE;/);
  assert.match(appJs, /const maxProjectedCoverage = options\.maxProjectedCoverage \?\? MAX_REFIT_PROJECTED_VIEWPORT_COVERAGE;/);
  assert.match(appJs, /projection\.visibleProjectedRatio < minProjectedCoverage/);
  assert.match(appJs, /projection\.visibleProjectedRatio > maxProjectedCoverage/);
  assert.match(appJs, /const shouldRefit = objectNeedsCameraRefit\(object,\s*options\);/);
  assert.match(appJs, /if \(!shouldRefit && canvasHasVisibleModelPixels\(\)\) return;/);
  assert.match(appJs, /const remainingAttempts = options\.remainingAttempts \?\? AUTO_FRAME_RETRY_COUNT;/);
  assert.match(appJs, /if \(remainingAttempts > 1\) \{/);
  assert.match(appJs, /scheduleAutoFrameIfCanvasBlank\(object,\s*\{\s*\.\.\.options,\s*remainingAttempts:\s*remainingAttempts - 1\s*\}\);/s);
  assert.match(appJs, /requestAnimationFrame\(\(\) => \{\s*renderSceneOnce\(\);/s);
  assert.match(appJs, /frameObject\(object,\s*\{\s*resetCamera:\s*true\s*\}\);/);
  assert.match(appJs, /scheduleAutoFrameIfCanvasBlank\(activeObject,\s*\{\s*minProjectedCoverage:\s*MIN_REFIT_PROJECTED_VIEWPORT_COVERAGE\s*\}\);/);
  assert.match(appJs, /scheduleAutoFrameIfCanvasBlank\(activeObject\);/);
  assert.match(appJs, /frameObject\(activeObject,\s*\{\s*resetCamera:\s*true\s*\}\);/);
  assert.match(appJs, /const recordCameraSelect = document\.querySelector\("#recordCameraSelect"\);/);
  assert.match(appJs, /function recordingFrame\(\)/);
  assert.match(appJs, /function recordCameraPath\(elapsedMs,\s*durationMs,\s*frame,\s*mode\)/);
  assert.match(appJs, /const cameraMode = recordCameraSelect\?\.value \|\| "static";/);
  assert.match(appJs, /const shouldMoveCamera = cameraMode !== "static";/);
  assert.match(appJs, /const originalPosition = camera\.position\.clone\(\);/);
  assert.match(appJs, /const originalTarget = controls\.target\.clone\(\);/);
  assert.match(appJs, /camera\.position\.copy\(originalPosition\);/);
  assert.match(appJs, /controls\.target\.copy\(originalTarget\);/);
  assert.match(appJs, /video\/mp4/);
  assert.match(appJs, /const extension = mimeType\.includes\("mp4"\) \? "mp4" : "webm";/);
});

test("viewer frames skinned models after the selected animation pose is applied", () => {
  assert.match(appJs, /let pendingAnimationPoseFrameObject = null;/);
  assert.match(appJs, /let pendingAnimationPoseFrameResetCamera = false;/);
  assert.match(appJs, /function queueFrameAfterAnimationPose\(object,\s*resetCamera\)/);
  assert.match(appJs, /function frameActiveObjectAfterPendingAnimationPose\(\)/);
  assert.match(appJs, /if \(shouldWaitForNativeAnimationPose\(\)\) return false;/);
  assert.match(appJs, /const shouldResetCameraAfterAnimationPose = !activeObject;/);
  assert.match(appJs, /queueFrameAfterAnimationPose\(object,\s*shouldResetCameraAfterAnimationPose\);/);
  assert.match(appJs, /syncAnimationSelect\(item\);\s*frameActiveObjectAfterPendingAnimationPose\(\);/);
});

test("viewer ignores stale async model loads so selected metadata and rendered meshes stay in sync", () => {
  assert.match(appJs, /let activeLoadToken = 0;/);
  assert.match(appJs, /const loadToken = \+\+activeLoadToken;/);
  assert.match(appJs, /const loadFormat = currentFormat\(\);/);
  assert.match(appJs, /const loadRoot = assetRoot\(\);/);
  assert.match(
    appJs,
    /if \(loadToken !== activeLoadToken \|\| activeManifestItem !== item \|\| activeIdentity !== itemIdentity\(item\) \|\| currentFormat\(\) !== loadFormat\) \{/,
  );
  assert.match(appJs, /disposeObject\(object\);/);
  assert.match(
    appJs,
    /setActiveObject\(object,\s*item\.rel,\s*item\.size,\s*\{\s*preserveMaterials: loadFormat !== "obj",\s*manifestItem: item\s*\}\);/,
  );
  assert.match(appJs, /const manifestItem = options\.manifestItem \?\? activeManifestItem;/);
  assert.match(appJs, /runtimeSkinGraphItem\(manifestItem\)/);
  assert.match(appJs, /runtimeBindingConfigItem\(manifestItem\)/);
  assert.match(appJs, /runtimeAttachmentBonesItem\(manifestItem\)/);
  assert.match(appJs, /runtimeBindSlotsForItem\(manifestItem\)/);
});

test("viewer releases material textures when replacing loaded model scenes", () => {
  assert.match(appJs, /const MATERIAL_TEXTURE_KEYS = \[/);
  assert.match(appJs, /function disposeTextureResource\(texture,\s*disposedTextures\)/);
  assert.match(appJs, /function disposeMaterialTextures\(material,\s*disposedTextures\)/);
  assert.match(appJs, /for \(const key of MATERIAL_TEXTURE_KEYS\)/);
  assert.match(appJs, /disposeTextureResource\(texture,\s*disposedTextures\);/);
  assert.match(appJs, /for \(const uniform of Object\.values\(material\.uniforms \|\| \{\}\)\)/);
  assert.match(appJs, /disposeMaterialTextures\(material,\s*disposedTextures\);\s*material\.dispose\(\);/s);
  assert.match(appJs, /const disposedMaterials = new Set\(\);/);
  assert.match(appJs, /const disposedTextures = new Set\(\);/);
});

test("viewer keeps long runtime diagnostics from collapsing the model viewport", () => {
  assert.match(stylesCss, /\.stage\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(stylesCss, /\.toolbar > div\s*\{[\s\S]*max-height:\s*clamp\(72px,\s*18vh,\s*148px\);/);
  assert.match(stylesCss, /\.toolbar > div\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(stylesCss, /\.stats,\s*\.health\s*\{[\s\S]*display:\s*-webkit-box;/);
  assert.match(stylesCss, /\.stats,\s*\.health\s*\{[\s\S]*-webkit-line-clamp:\s*3;/);
});

test("viewer uses robust skinned bounds for camera framing and falls back to mesh bounds when needed", () => {
  assert.match(appJs, /function boxFromRobustSkinnedSummary\(summary\)/);
  assert.match(appJs, /robustMin/);
  assert.match(appJs, /robustMax/);
  assert.match(appJs, /summary\?\.min\?\.every\(Number\.isFinite\)/);
  assert.match(appJs, /summary\?\.max\?\.every\(Number\.isFinite\)/);
  assert.match(appJs, /function frameObject\(object,\s*options = \{\}\)[\s\S]*boxFromRobustSkinnedSummary\(summarizeCurrentSkinnedBounds\(0\)\)/);
  assert.match(appJs, /if \(object === activeObject && firstActiveSkinnedSkeletonBones\(\)\.length && !skinnedBox\) return;/);
  assert.match(appJs, /function frameObject\(object,\s*options = \{\}\)[\s\S]*const box = skinnedBox \|\| new THREE\.Box3\(\)\.setFromObject\(object\);/);
  assert.match(appJs, /function objectProjectedViewportCoverage\(object\)[\s\S]*boxFromRobustSkinnedSummary\(summarizeCurrentSkinnedBounds\(0\)\)/);
  assert.match(appJs, /function objectProjectedViewportCoverage\(object\)[\s\S]*if \(skinnedBox\) \{\s*objectBox = skinnedBox;/);
  assert.match(appJs, /function recordingFrame\(\)[\s\S]*boxFromRobustSkinnedSummary\(skinnedSummary\)/);
});

test("viewer asset coverage report lists skins that still need texture recovery", () => {
  const reportPath = path.join(root, "reports", "viewer_asset_coverage_issues.tsv");
  assert.ok(fs.existsSync(reportPath), "expected viewer_asset_coverage_issues.tsv to be generated");
  const report = fs.readFileSync(reportPath, "utf8");
  assert.match(report, /^status\tformat\tcharacter\tmodel\tpath\tmaterials\ttextured_materials\tmissing_textures/m);
  assert.match(report, /\b(untextured|partial|missing_file)\b/);
});

test("viewer defaults to the neutral directional lighting preset", () => {
  assert.match(indexHtml, /id="lightingSelect"/);
  assert.match(indexHtml, /<option value="neutral" selected data-description="[^"]*">标准检视<\/option>/);
  assert.doesNotMatch(indexHtml, /value="native"/);
  assert.match(indexHtml, /<option value="game" data-description="更接近实机效果，光照和高亮会更强。">游戏光照<\/option>/);
  assert.match(uiComponentsJs, /ui-select-option-description/);
  assert.doesNotMatch(indexHtml, /查看设置|显示与输出/);
  assert.doesNotMatch(indexHtml, /id="bloomToggle" type="checkbox" checked/);

  assert.match(appJs, /const LIGHTING_PRESETS =/);
  assert.match(appJs, /neutral:\s*{/);
  assert.match(appJs, /game:\s*{/);
  assert.match(appJs, /flat:\s*{/);
  // 均匀光近似的 native preset + 挂相机点光已整体移除（它们在浅色/凸起处平板发亮，是"奇怪的光"总根源）
  assert.doesNotMatch(appJs, /ambientProbeLight/);
  assert.doesNotMatch(appJs, /menuPointLight/);
  assert.doesNotMatch(appJs, /menuLight/);
  assert.match(appJs, /renderer\.toneMappingExposure = 0\.82;/);
  assert.match(appJs, /neutral:\s*\{[\s\S]*toneMappingExposure:\s*0\.82/);
  assert.match(appJs, /game:\s*\{[\s\S]*toneMappingExposure:\s*0\.98/);
  assert.match(appJs, /applyLightingPreset\(\);/);
});

test("viewer uses recovered shadergraph pipeline diagnostics instead of brightness/color-space compensation", () => {
  assert.match(appJs, /fetchJson\("\.\/material-runtime-pipeline-manifest\.json"\)/);
  assert.match(appJs, /let materialRuntimePipelineSummary = null;/);
  assert.match(appJs, /function runtimeMaterialRuntimePipelineStats\(item\)/);
  assert.match(appJs, /function materialRuntimePipelineHealthSummary\(\)/);
  assert.match(appJs, /材质管线/);
  assert.match(appJs, /shadergraph/);
  assert.doesNotMatch(appJs, /normalizePreviewMaterialColorSpaces/);
  assert.doesNotMatch(appJs, /PREVIEW_COLOR_TEXTURE_KEYS/);
  assert.ok(materialRuntimePipelineManifest.summary.rows > 0);
  assert.ok(materialRuntimePipelineManifest.summary.parsedShadergraphRows > 0);
  assert.ok(materialRuntimePipelineManifest.items.some((item) => item.roleNames.includes("baseColor")));
});

test("viewer applies character material runtime pipeline from shadergraph manifest", () => {
  assert.match(
    appJs,
    /import \{ advanceCharacterUvRuntime, applyCharacterMaterialRuntimePipeline \} from "\.\/material-runtime-shaders\.js";/,
  );
  assert.match(appJs, /function materialRuntimePipelineRowForMaterial/);
  assert.match(appJs, /const characterMaterialTextureLoader = new THREE\.TextureLoader\(\);/);
  assert.match(appJs, /function loadCharacterRuntimeMaterialTexture\(texturePath, kind = "color"\)/);
  assert.match(
    appJs,
    /applyCharacterMaterialRuntimePipeline\(\s*activeObject,\s*\(material\) => materialRuntimePipelineRowForMaterial\(material, manifestItem\),\s*loadCharacterRuntimeMaterialTexture,\s*THREE,\s*\)/,
  );
  assert.match(materialRuntimeShadersJs, /vaingloryRuntimeMaterialPipeline/);
  assert.match(materialRuntimeShadersJs, /function applyCharacterAlphaRuntime/);
  assert.match(materialRuntimeShadersJs, /function applyCharacterEmissiveRuntime/);
  assert.match(materialRuntimeShadersJs, /function applyCharacterColorRuntime/);
  assert.match(materialRuntimeShadersJs, /function applyCharacterUvAnimationRuntime/);
  assert.match(materialRuntimeShadersJs, /colorMode: row\.colorMode \|\| ""/);
  assert.match(appJs, /function updateCharacterMaterialRuntime\(deltaSeconds\)/);
  assert.match(appJs, /updateCharacterMaterialRuntime\(runtimeEffectDelta\);[\s\S]*renderSceneOnce\(\);/);
  assert.match(
    appJs,
    /applyCharacterMaterialRuntimePipeline\([\s\S]*?\);\s*applyPreviewMaterialFixups\(activeObject\);/,
  );
  assert.match(appJs, /function materialRuntimeColorMode\(material\)/);
  assert.match(appJs, /if \(!colorMode && previewWaterShaderMaterialName\(material\?\.name \|\| ""\)\)/);
  assert.match(appJs, /if \(!colorMode && previewGuobMaterialName\(material\?\.name \|\| ""\)\)/);
  assert.doesNotMatch(appJs, /toneMappingExposure = 1\.08/);
  assert.doesNotMatch(appJs, /normalizePreviewMaterialColorSpaces/);
});

test("viewer prefers decoded skin relationship manifest for PBR models", () => {
  assert.match(appJs, /skin-glb-pbr-manifest\.json/);
  assert.match(appJs, /modelLabel/);
  assert.match(appJs, /usesFallbackSkeleton/);
  assert.match(appJs, /骨架未证实/);
  assert.doesNotMatch(appJs, /默认骨架/);
  assert.match(appJs, /sameLabelAnimationCount/);
});

test("viewer loads runtime skin graph evidence without replacing legacy attachment fallback", () => {
  assert.match(appJs, /let runtimeSkinGraph = new Map\(\);/);
  assert.match(appJs, /let runtimeBindingConfig = new Map\(\);/);
  assert.match(appJs, /let runtimeAttachmentBones = new Map\(\);/);
  assert.match(appJs, /function runtimeBindingConfigItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeSkinGraphItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeAttachmentBonesItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeBindSlotsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeTranslationUnsafeBoneIndices\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeBindSlotStats\(item\)/);
  assert.match(appJs, /runtime-skin-graph\.json/);
  assert.match(appJs, /runtime-binding-config\.json/);
  assert.match(appJs, /runtime-attachment-bones\.json/);
  assert.match(appJs, /fetchManifest\("\.\/runtime-skin-graph\.json"\)/);
  assert.match(appJs, /fetchManifest\("\.\/runtime-binding-config\.json"\)/);
  assert.match(appJs, /fetchManifest\("\.\/runtime-attachment-bones\.json"\)/);
  assert.match(appJs, /runtimeBindingConfig = new Map\(/);
  assert.match(appJs, /runtimeSkinGraph = new Map\(/);
  assert.match(appJs, /runtimeAttachmentBones = buildRuntimeLookup\(/);
  assert.match(appJs, /if \(Array\.isArray\(configItem\?\.slots\)\) return configItem\.slots;/);
  assert.match(appJs, /const manifestItem = options\.manifestItem \?\? activeManifestItem;/);
  assert.match(appJs, /activeObject\.userData\.runtimeSkinGraphItem = runtimeSkinGraphItem\(manifestItem\);/);
  assert.match(appJs, /activeObject\.userData\.runtimeBindingConfigItem = runtimeBindingConfigItem\(manifestItem\);/);
  assert.match(appJs, /activeObject\.userData\.runtimeAttachmentBonesItem = runtimeAttachmentBonesItem\(manifestItem\);/);
  assert.match(appJs, /activeObject\.userData\.runtimeBindSlots = runtimeBindSlotsForItem\(manifestItem\);/);
  assert.match(appJs, /runtimeBindSlots\(\)\s*{\s*return runtimeBindSlotsForItem\(\);/);
  assert.match(appJs, /item\.attachments/);
  assert.doesNotMatch(appJs, /runtimeInferredTranslationBoneIndices/);
});

test("viewer consumes runtime attachment bone report for detached weapon and armor bones", () => {
  const byRel = new Map((runtimeAttachmentBonesReport.items || []).map((item) => [item.rel, item]));
  assert.deepEqual(byRel.get("Characters/Hero021/Art/hero021.glb")?.translationBoneIndices, [
    10,
    25,
    45,
    46,
    47,
    49,
    50,
  ]);
  assert.deepEqual(byRel.get("Characters/Hero021/Art/hero021_dynasty_t1.glb")?.translationBoneIndices, [
    10,
    25,
    45,
    46,
    47,
    49,
    50,
  ]);
  assert.deepEqual(byRel.get("Characters/Hero028/Art/hero028_glad.glb")?.translationBoneIndices, [
    10,
    21,
    43,
    44,
    45,
    51,
    56,
    57,
  ]);

  assert.match(appJs, /const runtimeAttachmentBoneItem = runtimeAttachmentBonesItem\(item\);/);
  assert.match(appJs, /for \(const boneIndex of runtimeAttachmentBoneItem\?\.translationBoneIndices \|\| \[\]\)/);
  assert.match(appJs, /indices\.add\(boneIndex\);/);
  assert.match(appJs, /for \(const boneIndex of runtimeAttachmentBoneItem\?\.unsafeTranslationBoneIndices \|\| \[\]\)/);
});

test("viewer keeps unsafe runtime takeover gated until complete binding evidence exists", () => {
  assert.match(appJs, /const ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER = false;/);
  assert.match(appJs, /function isRuntimeAttachmentSlot\(slot\)/);
  assert.match(appJs, /function runtimeAttachmentBindSlotsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function hasRuntimeAttachmentBindSlots\(item = activeManifestItem\)/);
  assert.match(appJs, /function hasCompleteRuntimeBindingEvidence\(item = activeManifestItem\)/);
  assert.match(appJs, /const configItem = runtimeBindingConfigItem\(item\);/);
  assert.match(appJs, /configItem\.slots\.every\(\(slot\) => slot\.bindingKind && slot\.bindingKind !== "unresolved"\)/);
  assert.match(appJs, /function hasRuntimeNativeTranslationControl\(mapping = selectedAnimationMapping\(\)\)/);
  assert.match(appJs, /return ENABLE_RUNTIME_NATIVE_TRANSLATION_TAKEOVER && hasCompleteRuntimeBindingEvidence\(\) &&/);
  assert.doesNotMatch(appJs, /function isRuntimeAttachmentTranslationBone\(bone,\s*boneIndexByBone,\s*dominantJointCounts\)/);
  assert.doesNotMatch(appJs, /ROOT_DIRECT_RUNTIME_ATTACHMENT_TRANSLATION_OFFSET/);
  assert.doesNotMatch(appJs, /if \(hasRuntimeNativeTranslationControl\(mapping\)\) return "safe";/);
  assert.doesNotMatch(appJs, /运行时接管/);
});

test("viewer uses hash-resolved runtime bind bones before root-direct translation heuristics", () => {
  assert.match(appJs, /function runtimeResolvedAttachmentBoneIndices\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeNativeFrameTranslationBoneIndices\(\)/);
  assert.match(appJs, /const RUNTIME_NATIVE_TRANSLATION_MATCH_TOLERANCE = 20;/);
  assert.match(appJs, /readAnimationFamily3ClipFrame\(activeAnimationClip,\s*0\)/);
  assert.match(appJs, /distance3Array\(basePosition,\s*pose\.translation\) <= RUNTIME_NATIVE_TRANSLATION_MATCH_TOLERANCE/);
  assert.match(appJs, /slot\.bindingKind !== "skeleton-bone"/);
  assert.match(appJs, /Number\.isInteger\(boneIndex\)/);
  assert.match(appJs, /const runtimeBoneIndices = runtimeResolvedAttachmentBoneIndices\(\);/);
  assert.match(appJs, /const runtimeNativeFrameBoneIndices = runtimeNativeFrameTranslationBoneIndices\(\);/);
  assert.match(appJs, /for \(const boneIndex of runtimeBoneIndices\) expanded\.add\(boneIndex\);/);
  assert.match(appJs, /for \(const boneIndex of runtimeNativeFrameBoneIndices\) expanded\.add\(boneIndex\);/);
  assert.match(appJs, /function hasExpandedNativeTranslationSafeCoverage\(mapping\)/);
  assert.match(appJs, /return hasMeaningfulNativeTranslationSafeCoverage\(mapping\) \|\| hasRuntimeTranslationSafeBones\(\);/);
  assert.doesNotMatch(appJs, /runtimeInferredBoneIndices/);
  assert.match(appJs, /const initialSafeBoneIndices = new Set\(expanded\);/);
  assert.match(appJs, /for \(const boneIndex of initialSafeBoneIndices\) \{/);
  assert.doesNotMatch(appJs, /for \(const boneIndex of translationSafeBones \|\| \[\]\) \{/);
  assert.doesNotMatch(appJs, /if \(!translationSafeBones\?\.size && !runtimeBoneIndices\.size\) return translationSafeBones;/);
  assert.doesNotMatch(appJs, /if \(!hasRuntimeBindingEvidence\) \{[\s\S]*?isRootDirectAttachmentTranslationBone/);
});

test("viewer skinned manifest does not include name-only goodie attachments", () => {
  const attachments = skinnedManifest.items.flatMap((item) => item.attachments || []);
  assert.ok(attachments.length > 0);
  assert.equal(attachments.some((attachment) => attachment.source === "goodie-name"), false);
  assert.equal(attachments.some((attachment) => /Characters\/Attachments\/Goodies\//.test(attachment.rel)), false);
});

test("viewer indexes runtime binding data by source and model before rel fallback", () => {
  assert.match(appJs, /function runtimeLookupKeysForItem\(item\)/);
  assert.match(appJs, /function buildRuntimeLookup\(items\)/);
  assert.match(appJs, /`\$\{item\.rel \|\| ""\}\\t\$\{item\.sourceRelativePath \|\| ""\}\\t\$\{item\.modelLabel \|\| ""\}`/);
  assert.match(appJs, /runtimeSkinGraphItem\(item = activeManifestItem\)[\s\S]*?for \(const key of runtimeLookupKeysForItem\(item\)\)/);
  assert.match(appJs, /runtimeBindingConfigItem\(item = activeManifestItem\)[\s\S]*?for \(const key of runtimeLookupKeysForItem\(item\)\)/);
  assert.match(appJs, /runtimeSkinGraph = buildRuntimeLookup\(/);
  assert.match(appJs, /runtimeBindingConfig = buildRuntimeLookup\(/);
  assert.doesNotMatch(appJs, /runtimeSkinGraph = new Map\([^\n]*item\.rel/);
  assert.doesNotMatch(appJs, /runtimeBindingConfig = new Map\([^\n]*item\.rel/);
});

test("viewer loads recovered runtime effect hook evidence for current models", () => {
  // 特效链路 UI 区已删（信息太杂、难理解），只保留底层数据逻辑
  assert.doesNotMatch(indexHtml, /id="effectDiagnostics"/);
  assert.doesNotMatch(indexHtml, /特效链路/);
  assert.match(stylesCss, /\.effect-diagnostics/);
  assert.match(stylesCss, /\.effect-color-swatch/);
  assert.match(appJs, /effect-hook-runtime-manifest\.json/);
  assert.match(appJs, /effect-native-option-profile\.json/);
  assert.match(appJs, /effect-runtime-gaps\.json/);
  assert.match(appJs, /effect-pfx-resource-manifest\.json/);
  assert.match(appJs, /effect-shadergraph-material-manifest\.json/);
  assert.match(appJs, /function buildRuntimeEffectHookLookup\(items\)/);
  assert.match(appJs, /function runtimeEffectHeroKeysForHook\(item\)/);
  assert.match(appJs, /function runtimeEffectHookTokenKeys\(value\)/);
  assert.match(appJs, /runtimeEffectHookTokenKeys\(item\.effectToken \|\| item\.token\)/);
  assert.match(appJs, /for \(const heroName of item\.heroNames \|\| \[\]\) addKey\(heroName\);/);
  assert.match(appJs, /for \(const resourcePath of item\.resourcePaths \|\| \[\]\)/);
  assert.ok(appJs.includes("const resourceMatch = resourcePath.match(/^Effects\\/([^/]+)\\//);"));
  assert.match(appJs, /function buildRuntimeEffectPfxLookup\(items\)/);
  assert.match(appJs, /function buildRuntimeEffectShadergraphLookup\(items\)/);
  assert.match(appJs, /let runtimeEffectHookSummary = null;/);
  assert.match(appJs, /let runtimeEffectHooksByDefinition = new Map\(\);/);
  assert.match(appJs, /let runtimeEffectHooksByHero = new Map\(\);/);
  assert.match(appJs, /let runtimeEffectGapSummary = null;/);
  assert.match(appJs, /let runtimeEffectPfxByPath = new Map\(\);/);
  assert.match(appJs, /let runtimeEffectShadergraphByPath = new Map\(\);/);
  assert.match(appJs, /function runtimeEffectHooksForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectBestPfxItemsForHook\(hook, item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectPfxVariantScore\(pfxItem, item\)/);
  assert.match(appJs, /function runtimeEffectPfxItemsForHooks\(hooks, item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectShadergraphItemsForPfx\(pfxItems\)/);
  assert.match(appJs, /function currentRuntimeEffectDiagnostics\(item = activeManifestItem\)/);
  assert.match(appJs, /function materialStatusSummaryForPfx\(pfxItem\)/);
  assert.match(appJs, /function syncEffectDiagnostics\(\)/);
  assert.match(appJs, /effectDiagnosticSwatches\.replaceChildren/);
  assert.match(appJs, /effectDiagnosticList\.replaceChildren/);
  assert.match(appJs, /shadergraphItem\.materialStatus !== "classified"/);
  assert.match(appJs, /function runtimeEffectUvGapReasonCounts\(shadergraphItems\)/);
  assert.match(appJs, /previewUvAnimationGapReason/);
  assert.match(appJs, /previewUvAnimationGapInputs/);
  assert.match(appJs, /function runtimeEffectUvRuntimeEvidenceKindCounts\(shadergraphItems\)/);
  assert.match(appJs, /previewUvRuntimeEvidence/);
  assert.match(appJs, /PFX UV 参数证据/);
  assert.match(appJs, /function runtimeEffectPfxParameterProfileCounts\(pfxItems\)/);
  assert.match(appJs, /parameterProfile/);
  assert.match(appJs, /PFX 参数槽/);
  assert.match(appJs, /生命周期\+变换/);
  assert.match(appJs, /function runtimeEffectPfxBindingProfileCounts\(pfxItems\)/);
  assert.match(appJs, /hookBindingProfiles/);
  assert.match(appJs, /profile\.selectedAttachmentSlot/);
  assert.match(appJs, /PFX 绑定证据/);
  assert.match(appJs, /骨骼绑定/);
  assert.match(appJs, /function runtimeEffectPfxNativeOptionCounts\(pfxItems\)/);
  assert.match(appJs, /PFX native 参数/);
  assert.match(appJs, /世界绑定候选/);
  assert.match(appJs, /raw-offset-values/);
  assert.match(appJs, /原始数值参数/);
  assert.match(appJs, /function runtimeEffectPfxSurfaceRenderFamilyCounts\(pfxItems\)/);
  assert.match(appJs, /PFX Surface 类型/);
  assert.match(appJs, /面片/);
  assert.match(appJs, /UV 待还原/);
  assert.match(appJs, /function runtimeEffectUvRuntimeFallbackCount\(shadergraphItems\)/);
  assert.match(appJs, /function runtimeEffectShadergraphRuntimeUvFallbackMode\(shadergraphItem\)/);
  assert.match(appJs, /UV 动态预览/);
  assert.match(appJs, /function runtimeEffectUvStaticPreviewCount\(shadergraphItems\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeUvEvidence\(shadergraphItem\)/);
  assert.match(appJs, /UV 静态预览/);
  assert.match(appJs, /采样扰动/);
  assert.match(appJs, /vertexColor\.x/);
  assert.match(appJs, /unclassifiedSurfaceCount/);
  assert.match(appJs, /pfxUnclassified/);
  assert.match(appJs, /function runtimeEffectStats\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectHookHealthSummary\(\)/);
  assert.match(appJs, /runtimeEffectHookManifest\.value\.summary/);
  assert.match(appJs, /runtimeEffectNativeOptionProfileSummary/);
  assert.match(appJs, /native 参数待逆向/);
  assert.match(appJs, /已命名 native 参数/);
  assert.match(appJs, /byUnknownOffsetArgKind/);
  assert.match(appJs, /参数形态/);
  assert.match(appJs, /动态局部/);
  assert.match(appJs, /selectorOutputPairedRows/);
  assert.match(appJs, /selector 同组资源/);
  assert.match(appJs, /selectorOutputMissingPairRows/);
  assert.match(appJs, /selector 成对缺资源/);
  assert.match(appJs, /globalResourceCandidateRows/);
  assert.match(appJs, /全局资源候选/);
  assert.match(appJs, /definitionExtraResourceRootRows/);
  assert.match(appJs, /定义额外 root/);
  assert.match(appJs, /nativeEffectChannelRows/);
  assert.match(appJs, /native 通道缺资源/);
  assert.match(appJs, /effectRuntimePreviewTakeoverAllowed/);
  assert.match(appJs, /特效预览门禁未开/);
  assert.match(appJs, /areaShapeGapRows/);
  assert.match(appJs, /PFX 面片缺 shape 参数/);
  assert.match(appJs, /areaShapeRuntimeOverlayRequiredRows/);
  assert.match(appJs, /PFX 需要 runtime overlay/);
  assert.match(appJs, /byAreaShapeGapRuntimeRequirement/);
  assert.match(appJs, /shape runtime/);
  assert.match(appJs, /byAreaShapeGapSizeCallbackResolverInputKind/);
  assert.match(appJs, /shape 输入/);
  assert.match(appJs, /packed 常量/);
  assert.match(appJs, /byAreaShapeGapSizeCallbackPackedLiteralSign/);
  assert.match(appJs, /负值 packed/);
  assert.match(appJs, /byAreaShapeGapCurrentStore/);
  assert.match(appJs, /shape 输出未定位/);
  assert.match(appJs, /byAreaShapeGapMissingCurrentStoreResolverInputKind/);
  assert.match(appJs, /输出未定位类型/);
  assert.match(appJs, /byAreaShapeGapPattern16ReadStatus/);
  assert.match(appJs, /shape 常量读取/);
  assert.match(appJs, /byAreaShapeGapCurveTableReadStatus/);
  assert.match(appJs, /shape 曲线读取/);
  assert.match(appJs, /areaShapeNativePercentParamRows/);
  assert.match(appJs, /native percent 参数但缺 shape/);
  assert.match(appJs, /nativeNearbyTokenRows/);
  assert.match(appJs, /native 邻近字符串/);
  assert.match(appJs, /runtimeEffectDefinitionNeighborhood/);
  assert.match(appJs, /runtimeEffectDefinitionNeighborhoodByModelLabel/);
  assert.match(appJs, /buildRuntimeEffectDefinitionNeighborhoodLookup/);
  assert.match(appJs, /runtimeEffectDefinitionNeighborhoodRowsForItem/);
  assert.match(appJs, /nativeEffectRuntimeSchemaSummary/);
  assert.match(appJs, /native-effect-runtime-schema\.json/);
  assert.match(appJs, /native 特效结构/);
  assert.match(appJs, /StaticPfx/);
  assert.match(appJs, /LevelVisuals/);
  assert.match(appJs, /nativeEffectRuntimeLinksSummary/);
  assert.match(appJs, /native-effect-runtime-links\.json/);
  assert.match(appJs, /结构链/);
  assert.match(appJs, /LevelVisuals->StaticPfx/);
  assert.match(appJs, /cff0EffectInstanceGraphSummary/);
  assert.match(appJs, /cff0-effect-instance-graph\.json/);
  assert.match(appJs, /CFF0 实例链/);
  assert.match(appJs, /objectRefExpandedRows/);
  assert.match(appJs, /显式引用展开/);
  assert.match(appJs, /runtimeResourceLinkedRows/);
  assert.match(appJs, /nativeHookLinkedRows/);
  assert.match(appJs, /native action/);
  assert.match(appJs, /nativeTimingLinkedRows/);
  assert.match(appJs, /projectileBindingLinkedRows/);
  assert.match(appJs, /projectile binding/);
  assert.match(appJs, /cff0EffectChannelFallbackRows/);
  assert.match(appJs, /CFF0 根节点弱绑定/);
  assert.match(appJs, /resolvedResourceLinkedRows/);
  assert.match(appJs, /resolved 覆盖/);
  assert.match(appJs, /cff0EffectInstanceGapSummary/);
  assert.match(appJs, /cff0-effect-instance-gaps\.json/);
  assert.match(appJs, /CFF0 缺口/);
  assert.match(appJs, /runtimeLinkedGapRows/);
  assert.match(appJs, /definitionOnlyGapRows/);
  assert.match(appJs, /runtime 断链/);
  assert.match(appJs, /未接 native/);
  assert.match(appJs, /cff0EffectInstanceGraphByModelLabel/);
  assert.match(appJs, /buildCff0EffectInstanceGraphLookup/);
  assert.match(appJs, /cff0EffectInstanceRowsForItem/);
  assert.match(appJs, /CFF0 实例/);
  assert.match(appJs, /native 定义链追踪/);
  assert.match(appJs, /source PFX 线索/);
  assert.match(appJs, /邻接 PFX 线索/);
  assert.match(appJs, /邻接 PFX 候选/);
  assert.match(appJs, /PFX 槽位证据/);
  assert.match(appJs, /带数值/);
  assert.match(appJs, /PFX 同值/);
  assert.match(appJs, /runtimeEffectHookManifest\.value\.items \|\| \[\]/);
  assert.match(appJs, /native spawn/);
  assert.match(appJs, /native vcall/);
  assert.match(appJs, /特效 Runtime：/);
  assert.match(appJs, /条运行时特效/);
  assert.match(appJs, /特效材质面/);
  assert.match(appJs, /特效贴图/);
  assert.match(appJs, /材质角色/);
  assert.match(appJs, /内联颜色/);
  assert.match(appJs, /待归类 Surface/);
});

test("viewer loads native runtime timeline diagnostics for current models", () => {
  assert.match(appJs, /let runtimeTimelineByHero = new Map\(\);/);
  assert.match(appJs, /function buildRuntimeTimelineLookup\(items\)/);
  assert.match(appJs, /native-runtime-timeline-manifest\.json/);
  assert.match(appJs, /runtimeTimelineByHero = buildRuntimeTimelineLookup/);
  assert.match(appJs, /function runtimeTimelineRowsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeTimelineStats\(item = activeManifestItem\)/);
  assert.match(appJs, /const timelineStats = runtimeTimelineStats\(item\);/);
  assert.match(appJs, /运行时时间线/);
});

test("viewer loads runtime attachment visibility windows from native scale tracks", () => {
  assert.match(appJs, /let runtimeAttachmentVisibilityByModel = new Map\(\);/);
  assert.match(appJs, /function buildRuntimeAttachmentVisibilityLookup\(items\)/);
  assert.match(appJs, /runtime-attachment-visibility-manifest\.json/);
  assert.match(appJs, /runtimeAttachmentVisibilityByModel = buildRuntimeAttachmentVisibilityLookup/);
  assert.match(appJs, /function runtimeAttachmentVisibilityRowsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeAttachmentVisibilityBoneVisible\(boneIndex/);
  assert.match(appJs, /const manifestVisible = runtimeAttachmentVisibilityBoneVisible\(boneIndex\);/);
  assert.match(appJs, /if \(manifestVisible != null\) return manifestVisible;/);
  assert.match(appJs, /rotorBladeVFX/i);
  assert.match(appJs, /hero019_heli\\\.heli_mat/i);
  assert.match(appJs, /resolveFormMeshVisibility/);
  assert.match(appJs, /function runtimeFormBoneVisible\(boneIndex/);
  assert.match(appJs, /resolveFormBoneVisibility/);
  assert.match(appJs, /isVertexControlledOnlyByHiddenBones/);
  assert.match(appJs, /显隐窗口/);
});

test("viewer loads native projectile callback semantics as diagnostics", () => {
  assert.ok(
    (nativeProjectileCallbacks.items || []).some(
      (row) =>
        row.semanticClass === "state-conditional-emitter" &&
        row.heroNames?.includes("Ringo") &&
        row.projectileIdHexes?.includes("0x5b") &&
        row.projectileIdHexes?.includes("0x59") &&
        row.emitterLabels?.includes("GunMuzzleTip_Ability02_Attack") &&
        row.emitterLabels?.includes("GunMuzzleTip_Attack"),
    ),
    "expected Ringo state-conditional projectile callback fixture",
  );
  assert.ok(
    (nativeProjectileCallbacks.items || []).some(
      (row) =>
        row.semanticClass === "state-conditional-emitter" &&
        row.heroNames?.includes("Ringo") &&
        row.projectileIdHexes?.[0] === "0x5b" &&
        row.emitterLabels?.[0] === "GunMuzzleTip_Ability02_Attack" &&
        row.projectileIdHexes?.[1] === "0x59" &&
        row.emitterLabels?.[1] === "GunMuzzleTip_Attack",
    ),
    "expected Ringo callback branch order to pair projectile ids with emitter labels",
  );

  assert.match(appJs, /let runtimeNativeProjectileCallbacksByHero = new Map\(\);/);
  assert.match(appJs, /function buildRuntimeNativeProjectileCallbackLookup\(items\)/);
  assert.match(appJs, /native-projectile-callback-semantics\.json/);
  assert.match(appJs, /runtimeNativeProjectileCallbacksByHero = buildRuntimeNativeProjectileCallbackLookup/);
  assert.match(appJs, /function runtimeNativeProjectileCallbackRowsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeNativeProjectileCallbackStats\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeNativeProjectileCallbackRowsForEntry\(entry, item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeNativeProjectileCallbackFieldValues\(row,\s*singleField,\s*listField\)/);
  assert.match(appJs, /runtimeNativeProjectileCallbackFieldValues\(row,\s*"projectileIdHex",\s*"projectileIdHexes"\)/);
  assert.match(appJs, /runtimeNativeProjectileCallbackFieldValues\(row,\s*"emitterLabel",\s*"emitterLabels"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackBranches\(row\)/);
  assert.match(appJs, /projectileIdHex: projectileIdHexes\[index\] \|\| ""/);
  assert.match(appJs, /emitterLabel: emitterLabels\[index\] \|\| ""/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackBranchMatchesEntry\(branch,\s*entry\)/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackBranchesForEntry\(row,\s*entry\)/);
  assert.match(appJs, /runtimeEffectProjectileCallbackBranches\(row\)\.filter\(\(branch\) => runtimeEffectProjectileCallbackBranchMatchesEntry\(branch,\s*entry\)\)/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackBranchBindingTarget\(entry,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectProjectileCallbackBranchesForEntry\(row,\s*entry\)/);
  assert.match(appJs, /definitionLabels\.has\(branch\.emitterLabel\)/);
  assert.match(appJs, /nativeProjectile: \{ projectileIdHex: branch\.projectileIdHex, emitterLabel: branch\.emitterLabel/);
  assert.match(appJs, /function runtimeEffectEntryWithBindingTarget\(entry,\s*bindingTarget\)/);
  assert.match(appJs, /const callbackBindingTarget = runtimeEffectProjectileCallbackBranchBindingTarget\(entry,\s*item\);/);
  assert.match(appJs, /if \(callbackBindingTarget\) entry = runtimeEffectEntryWithBindingTarget\(entry,\s*callbackBindingTarget\);/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackDebugRows\(entry\)/);
  assert.match(appJs, /branches: runtimeEffectProjectileCallbackBranches\(row\)/);
  assert.match(appJs, /matchedBranches: runtimeEffectProjectileCallbackBranchesForEntry\(row,\s*entry\)/);
  assert.match(appJs, /stateConditionalProjectileEmitters/);
  assert.match(appJs, /stateConditionalProjectileBranches/);
  assert.match(appJs, /const projectileCallbackRows = runtimeEffectProjectileCallbackDebugRows\(entry\);/);
  assert.match(appJs, /projectileCallbackRows,/);
  assert.match(appJs, /\.flatMap\(\(row\) => row\.matchedBranches \|\| \[\]\)/);
  assert.match(appJs, /function runtimeEffectProjectileCallbackLateralOffset\(entry\)/);
  assert.match(appJs, /candidate\.semanticClass === "constant" && candidate\.callbackSlot === "projectileCallback38"/);
  assert.match(appJs, /const callbackOffset = runtimeEffectProjectileCallbackLateralOffset\(entry\);/);
  assert.match(appJs, /弹道回调/);
});

test("viewer previews recovered runtime effect hooks as visible bone-bound effect layers", () => {
  const timelineControlsFunction = appJs.match(/function syncTimelineControls\(timeSeconds = manualAnimationTime\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(appJs, /let activeRuntimeEffectObjects = \[\];/);
  assert.match(appJs, /function runtimeEffectPreviewEntries\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectBoneIndex\(hook, item = activeManifestItem\)/);
  assert.match(appJs, /function createRuntimeEffectPreviewObject\(entry, index\)/);
  assert.match(appJs, /function syncRuntimeEffectPreviews\(\)/);
  assert.match(appJs, /function clearRuntimeEffectObjects\(\)/);
  assert.match(appJs, /function runtimeEffectPreviewStats\(\)/);
  assert.match(appJs, /new THREE\.SpriteMaterial\(/);
  assert.match(appJs, /THREE\.AdditiveBlending/);
  assert.match(appJs, /hook\.boneToken/);
  assert.match(appJs, /slot\.slotName === hook\.boneToken/);
  assert.match(appJs, /bone\.add\(preview\)/);
  assert.match(appJs, /activeRuntimeEffectObjects\.push\(preview\)/);
  assert.match(appJs, /preview\.visible = effectsToggle\.checked/);
  assert.match(appJs, /function hasRuntimeEffectPreviews\(item = activeManifestItem\)/);
  assert.match(appJs, /syncEffectsToggleAvailability\(animated && hasRuntimeEffectPreviews\(\)\);/);
  assert.match(timelineControlsFunction, /syncEffectsToggleAvailability\(animated && Boolean\(activeRuntimeEffectObjects\.length\)\);/);
  assert.match(appJs, /if \(!enabled\) effectsToggle\.checked = false;/);
  assert.doesNotMatch(timelineControlsFunction, /effectsToggle\.disabled = !animated;/);
  assert.doesNotMatch(appJs, /effectsToggle\.checked = isAnimationFormat\(\) && runtimeEffectPreviewEntries\(item\)\.length > 0;/);
  assert.match(appJs, /runtimeEffectPreviewStats\(\)/);
});

test("viewer does not render unresolved selected attachment effect channels at model root", () => {
  const selectedAttachmentBranch = appJs.match(/if \(runtimeKind === "selected-attachment"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(selectedAttachmentBranch, /runtimeKind === "selected-attachment"/);
  assert.match(selectedAttachmentBranch, /return runtimeEffectSelectedAttachmentBindingTarget\(hook, item\);/);
  assert.match(appJs, /if \(!Number\.isInteger\(selectedAttachmentSlot\) \|\| selectedAttachmentSlot <= 0\) return null;/);
  assert.match(appJs, /return null;\n}\n\nfunction runtimeEffectBindingTarget\(hook, item = activeManifestItem\)/);
  assert.doesNotMatch(selectedAttachmentBranch, /kind: "model-root"/);
});

test("viewer resolves selected attachment effect channels through runtime attachment slots", () => {
  const hook = (effectHookRuntimeManifest.items || []).find(
    (item) => item.effectToken === "Effect_Ylva_Perk_Ping" && item.runtimeBinding?.kind === "selected-attachment",
  );
  assert.ok(hook, "expected a selected-attachment runtime hook with an explicit slot");
  assert.equal(hook.runtimeBinding.selectedAttachmentSlot, 2);

  const ylvaRuntimeBinding = (runtimeBindingConfig.items || []).find(
    (item) => item.character === "Hero058" && item.modelLabel === "Ylva_DefaultSkin",
  );
  assert.ok(ylvaRuntimeBinding, "expected Ylva runtime binding slots");
  const attachmentSlots = ylvaRuntimeBinding.slots.filter((slot) => {
    if (!slot.slotName || !slot.bindToken) return false;
    return !/(Head|CenterMass)/i.test(slot.slotName) && !/(head|spine|center|root)[A-Za-z0-9_]*_bnd/i.test(slot.bindToken);
  });
  assert.equal(attachmentSlots[1].slotName, "Bone_LeftHand");
  assert.equal(attachmentSlots[1].resolvedBoneIndex, 11);

  assert.match(appJs, /function runtimeEffectSelectedAttachmentBindingTarget\(hook, item = activeManifestItem\)/);
  assert.match(appJs, /const selectedAttachmentSlot = Number\(hook\?\.runtimeBinding\?\.selectedAttachmentSlot\);/);
  assert.match(appJs, /const attachmentSlots = runtimeAttachmentBindSlotsForItem\(item\);/);
  assert.match(appJs, /attachmentSlots\[selectedAttachmentSlot - 1\]/);
  assert.match(appJs, /kind: "bone",\s*boneIndex,\s*boneToken:/);
  assert.match(appJs, /selectedAttachmentSlot,/);
  assert.match(appJs, /return runtimeEffectSelectedAttachmentBindingTarget\(hook, item\);/);
  const selectedAttachmentBranch = appJs.match(/if \(runtimeKind === "selected-attachment"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(selectedAttachmentBranch, /kind: "model-root"/);
});

test("viewer animates runtime effect previews with layered surface colors", () => {
  assert.match(appJs, /const RUNTIME_EFFECT_PREVIEW_MAX_LAYERS = 3;/);
  assert.match(appJs, /const runtimeEffectClock = new THREE\.Clock\(\);/);
  assert.match(appJs, /let runtimeEffectElapsed = 0;/);
  assert.match(appJs, /function runtimeEffectPreviewColors\(shadergraphItems\)/);
  assert.match(appJs, /for \(const shadergraphItem of shadergraphItems \|\| \[\]\)/);
  assert.match(appJs, /for \(const color of shadergraphItem\.inlineColors \|\| \[\]\)/);
  assert.match(appJs, /\/\^#0\{6\}\$\/i\.test\(hex\)/);
  assert.match(appJs, /seen\.has\(hex\)\) continue;/);
  assert.match(appJs, /colors: nativePrimitive \? \[\] : runtimeEffectPreviewColors\(previewShadergraphItems\)/);
  assert.doesNotMatch(appJs, /colors: nativePrimitive[\s\S]*uniqueSorted\(previewShadergraphItems\.flatMap/);
  assert.match(appJs, /function runtimeEffectLayerColors\(entry\)/);
  assert.match(appJs, /function runtimeEffectShadergraphLayerColors\(shadergraphItem\)/);
  assert.match(appJs, /function runtimeEffectLayerColor\(entry,\s*layerIndex,\s*palette\)/);
  assert.match(appJs, /runtimeEffectShadergraphLayerColors\(runtimeEffectShadergraphForLayer\(entry,\s*layerIndex\)\)/);
  assert.match(appJs, /function runtimeEffectLayerSpec\(entry, layerIndex, color\)/);
  assert.match(appJs, /for \(const \[layerIndex, color\] of runtimeEffectLayerColors\(entry\)\.entries\(\)\)/);
  assert.match(appJs, /layerObject\.userData\.baseScale/);
  assert.match(appJs, /layerObject\.userData\.pulseSpeed/);
  assert.match(appJs, /layerObject\.userData\.spinSpeed/);
  assert.match(appJs, /function updateRuntimeEffectPreviews\(deltaSeconds, elapsedSeconds\)/);
  assert.match(appJs, /layerObject\.material\.rotation \+= layerObject\.userData\.spinSpeed \* deltaSeconds;/);
  assert.match(appJs, /layerObject\.rotation\.z \+= layerObject\.userData\.spinSpeed \* deltaSeconds;/);
  assert.match(appJs, /Math\.sin\(elapsedSeconds \* layerObject\.userData\.pulseSpeed \+ layerObject\.userData\.phase\) \* layerObject\.userData\.pulseAmount/);
  assert.match(appJs, /updateRuntimeEffectPreviews\(runtimeEffectDelta, runtimeEffectElapsed\);/);
});

test("viewer uses decoded effect preview textures when available", () => {
  assert.match(appJs, /const runtimeEffectTextureLoader = new THREE\.TextureLoader\(\);/);
  assert.match(appJs, /const runtimeEffectPreviewTextures = new Map\(\);/);
  assert.match(appJs, /previewTextures: nativePrimitive \? \[\] : runtimeEffectPreviewTextureItems\(previewShadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /function runtimeEffectPreviewTextureForEntry\(entry, layerIndex\)/);
  assert.match(appJs, /const texturePath = entry\.previewTextures\[layerIndex % entry\.previewTextures\.length\];/);
  assert.match(appJs, /runtimeEffectTextureLoader\.load\(texturePath\)/);
  assert.match(appJs, /map: runtimeEffectPreviewLayerTextureForEntry\(entry, layerIndex\)/);
});

test("viewer crops and advances flipbook atlas effect textures from shadergraph UV hints", () => {
  assert.match(appJs, /function runtimeEffectPreviewUvAnimationForLayer\(entry, layerIndex\)/);
  assert.match(appJs, /function runtimeEffectPreviewLayerTextureForEntry\(entry, layerIndex\)/);
  assert.match(appJs, /texture\.wrapS = THREE\.RepeatWrapping;/);
  assert.match(appJs, /texture\.wrapT = THREE\.RepeatWrapping;/);
  assert.match(appJs, /texture\.repeat\.set\(uvAnimation\.repeat\[0\], uvAnimation\.repeat\[1\]\);/);
  assert.match(appJs, /layerObject\.userData\.uvAnimation = spec\.uvAnimation;/);
  assert.match(appJs, /function runtimeEffectUpdateLayerUvAnimation\(layerObject, entry, elapsedSeconds\)/);
  assert.match(appJs, /const frameIndex = Math\.max\(0, Math\.min\(uvAnimation\.frameCount - 1, Math\.floor\(progress \* uvAnimation\.frameCount\)\)\);/);
  assert.match(appJs, /texture\.offset\.set\(column \* uvAnimation\.repeat\[0\], row \* uvAnimation\.repeat\[1\]\);/);
  assert.match(appJs, /runtimeEffectUpdateLayerUvAnimation\(layerObject, preview\.userData\.entry, elapsedSeconds\);/);
});

test("viewer advances direct scroll effect textures from shadergraph UV hints", () => {
  assert.match(appJs, /uvAnimation\.mode === "scroll"/);
  assert.match(appJs, /Array\.isArray\(uvAnimation\.speed\)/);
  assert.match(appJs, /const repeat = Array\.isArray\(uvAnimation\.repeat\) \? uvAnimation\.repeat\.map\(\(value\) => Number\(value\)\) : null;/);
  assert.match(appJs, /if \(repeat && !repeat\.every\(\(value\) => Number\.isFinite\(value\) && value > 0\)\) return null;/);
  assert.match(appJs, /const repeatKey = uvAnimation\.repeat \? `:\$\{uvAnimation\.repeat\.join\(","\)\}` : "";/);
  assert.match(appJs, /const phase = runtimeEffectUvAnimationPhase\(entry, layerObject\.userData\.surfaceRecord, elapsedSeconds\);/);
  assert.match(appJs, /texture\.offset\.set\(offset\[0\] \+ speed\[0\] \* scaledPhase, offset\[1\] \+ speed\[1\] \* scaledPhase\);/);
});

test("viewer applies centered scale UV effect textures from shadergraph hints", () => {
  const centeredScaleSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero066/Default/Hero066_DEF_Mark1/Hero066_DEF_Mark1.Surface[31].shadergraph",
  );
  assert.ok(centeredScaleSurface, "expected Varya mark centered-scale shadergraph fixture");
  assert.equal(centeredScaleSurface.previewUvAnimation?.mode, "centerScale");
  assert.equal(centeredScaleSurface.previewUvAnimation?.phaseSource, "var1.w");
  assert.deepEqual(centeredScaleSurface.previewUvAnimation?.center, [0.5, 0.5]);

  assert.match(appJs, /uvAnimation\.mode === "centerScale"/);
  assert.match(appJs, /Array\.isArray\(uvAnimation\.center\)/);
  assert.match(appJs, /texture\.repeat\.set\(repeatX,\s*repeatY\);/);
  assert.match(appJs, /texture\.offset\.set\(center\[0\] \* \(1 - repeatX\),\s*center\[1\] \* \(1 - repeatY\)\);/);
});

test("viewer applies squared centered scale UV phase from shadergraph vertexColor inputs", () => {
  const squaredCenteredScaleSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero063/Default/Hero063_DEF_B/Hero063_DEF_B.Surface[150].shadergraph",
  );
  assert.ok(squaredCenteredScaleSurface, "expected Leo B squared centered-scale shadergraph fixture");
  assert.deepEqual(squaredCenteredScaleSurface.previewUvAnimation, {
    mode: "centerScale",
    center: [0.5, 0.5],
    speed: [1, 1],
    offset: [0, 0],
    phaseSource: "var0.x",
    phaseInputOffset: 0,
    phaseInputScale: 1,
    phasePower: 2,
  });
  assert.equal(squaredCenteredScaleSurface.previewUvAnimationGapReason, "");
  assert.equal(squaredCenteredScaleSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /phaseInputOffset/);
  assert.match(previewUvSource, /phaseInputScale/);
  assert.match(previewUvSource, /phasePower/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /const centerScalePhase = runtimeEffectUvAnimationPoweredPhase\(uvAnimation,\s*scaledPhase\);/);
  assert.match(updateSource, /speed\[0\] \* centerScalePhase/);
});

test("viewer preserves pfx surface record order for effect preview textures", () => {
  assert.match(appJs, /function runtimeEffectSurfaceRecordOrder\(pfxItem\)/);
  assert.match(appJs, /for \(const \[index, record\] of \(pfxItem\?\.surfaceRecords \|\| \[\]\)\.entries\(\)\)/);
  assert.match(appJs, /surfaceOrder\.get\(item\.relativePath\) \?\? Number\.MAX_SAFE_INTEGER/);
  assert.match(appJs, /left\.order - right\.order/);
  assert.match(appJs, /surfaceRecordCount/);
  assert.match(appJs, /PFX Surface 记录/);
});

test("viewer matches pfx surface records to the selected shadergraph layer", () => {
  assert.match(appJs, /function runtimeEffectSurfaceRecordForLayer\(entry, layerIndex\)/);
  assert.match(appJs, /const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords\(entry\);/);
  assert.match(appJs, /if \(previewSurfaceRecords\.length\) return previewSurfaceRecords\[layerIndex % previewSurfaceRecords\.length\];/);
  assert.match(appJs, /const shadergraphItems = runtimeEffectShadergraphItemsForEntry\(entry\);/);
  assert.match(appJs, /record\.relativePath === shadergraphItem\.relativePath/);
  assert.match(appJs, /if \(exactSurfaceRecord\) return exactSurfaceRecord;/);
  assert.match(appJs, /return records\[layerIndex % records\.length\]/);
});

test("viewer creates multiple effect preview layers from multiple recovered surface textures", () => {
  assert.match(appJs, /function runtimeEffectLayerCount\(entry\)/);
  assert.match(appJs, /const textureCount = entry\.previewTextures\?\.length \|\| 0;/);
  assert.match(appJs, /const surfaceRecordCount = runtimeEffectPreviewSurfaceRecords\(entry\)\.length;/);
  assert.match(appJs, /return Math\.max\(1,\s*Math\.min\(RUNTIME_EFFECT_PREVIEW_MAX_LAYERS,\s*Math\.max\(colorCount,\s*textureCount,\s*surfaceRecordCount\)\)\);/);
  assert.match(appJs, /Array\.from\(\{ length: runtimeEffectLayerCount\(entry\) \}/);
});

test("viewer gates runtime effect previews by selected animation and effect lifecycle", () => {
  assert.match(appJs, /function runtimeEffectAbilityKeys\(entry\)/);
  assert.match(appJs, /entry\.hook\?\.primaryAbilityContext\?\.runtimeAbilitySlotIndex/);
  assert.match(appJs, /function runtimeEffectInferredActionKeys\(entry\)/);
  assert.match(appJs, /if \(\/ult\|ultimate\/i\.test\(text\)\) keys\.add\("ability03"\);/);
  assert.match(appJs, /function runtimeEffectMatchesSelectedAnimation\(entry, animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /allowedKeys\.has\(animation\.actionKey\)/);
  assert.match(appJs, /function runtimeEffectRequiresActionGate\(entry\)/);
  assert.match(appJs, /sourceKind === "native-effect-vcall" \|\| sourceKind === "native-effect-spawn"/);
  assert.match(appJs, /function runtimeEffectShouldPreviewForAnimation\(entry, animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /runtimeEffectRequiresActionGate\(entry\) && !allowedKeys\.size/);
  assert.match(appJs, /runtimeEffectShouldPreviewForAnimation\(candidateEntry, animation\)/);
  assert.match(appJs, /function runtimeEffectPreviewRole\(entry\)/);
  assert.match(appJs, /impact\|burst\|hit\|explosion\|\(\?:\^\|/);
  assert.match(appJs, /exp\(\?:/);
  assert.match(appJs, /function runtimeEffectPreviewActivity\(entry, elapsedSeconds\)/);
  assert.match(appJs, /runtimeEffectShouldPreviewForAnimation\(entry, animation\)/);
  assert.match(appJs, /preview\.userData\.entry = entry;/);
  assert.match(appJs, /layerObject\.userData\.baseOpacity = spec\.opacity;/);
  assert.match(appJs, /const activity = runtimeEffectPreviewActivity\(preview\.userData\.entry, elapsedSeconds\);/);
  assert.match(appJs, /preview\.visible = effectsToggle\.checked && activity\.opacity > 0\.02;/);
  assert.match(appJs, /const combinedOpacity = activity\.opacity \* surfaceActivity\.opacity;/);
  assert.match(appJs, /layerObject\.material\.opacity = layerObject\.userData\.baseOpacity \* combinedOpacity;/);
});

test("viewer does not classify explosive projectile bodies as impact effects", () => {
  assert.doesNotMatch(appJs, /impact\|burst\|hit\|explosion\|exp/);
  assert.match(appJs, /impact\|burst\|hit\|explosion\|\(\?:\^\|/);
  assert.match(appJs, /exp\(\?:/);
  assert.match(appJs, /imp\(\?:/);
});

test("viewer only previews instant runtime effects when timeline evidence exists", () => {
  assert.match(appJs, /function runtimeEffectRoleRequiresTimelineEvidence\(entry\)/);
  assert.match(appJs, /role === "impact" \|\| role === "projectile" \|\| role === "warning" \|\| role === "cast"/);
  assert.match(appJs, /function runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(appJs, /runtimeEffectEntryStartSeconds\(entry\) !== null/);
  assert.match(appJs, /runtimeEffectTimelineWindow\(entry\) !== null/);
  assert.match(appJs, /runtimeEffectNativeTimelineTimes\(entry\)\.length > 0/);
  assert.match(appJs, /if \(!runtimeEffectHasRequiredTimelineEvidence\(entry\)\) return false;/);
});

test("viewer does not preview projectile or impact effects from effect-channel fallback targets", () => {
  assert.match(appJs, /function runtimeEffectRoleRequiresSpatialEvidence\(entry\)/);
  assert.match(appJs, /role === "projectile" \|\| role === "impact"/);
  assert.match(appJs, /function runtimeEffectSpatialBlockReason\(entry\)/);
  assert.match(appJs, /return "effect-channel-fallback";/);
  assert.match(appJs, /return "weak-self-impact-binding";/);
  assert.match(appJs, /function runtimeEffectHasRequiredSpatialEvidence\(entry\)/);
  assert.match(appJs, /return !runtimeEffectSpatialBlockReason\(entry\);/);
  assert.match(appJs, /if \(!runtimeEffectHasRequiredSpatialEvidence\(entry\)\) return false;/);
});

test("viewer reports the specific runtime gate that blocks effect preview candidates", () => {
  assert.match(appJs, /function runtimeEffectPreviewAnimationBlockReason\(entry, animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /return "state-gate";/);
  assert.match(appJs, /return "no-spatial-evidence";/);
  assert.match(appJs, /return "no-timeline-evidence";/);
  assert.match(appJs, /return "action-gate";/);
  assert.match(appJs, /return "action-mismatch";/);
  assert.match(appJs, /const animationBlockReason = runtimeEffectPreviewAnimationBlockReason\(previewContext,\s*animation\);/);
  assert.match(appJs, /const spatialBlockReason = runtimeEffectSpatialBlockReason\(previewContext\);/);
  assert.match(
    appJs,
    /const shouldPreview = !animationBlockReason && nativeVisibilityAllowed && hasRenderableMaterial && pfxRuntimeEvidence\.allowed;/,
  );
  assert.match(appJs, /if \(animationBlockReason\) previewBlockReason = animationBlockReason;/);
  assert.match(appJs, /animationBlockReason,/);
  assert.match(appJs, /spatialBlockReason,/);
});

test("viewer reports effect-channel candidates covered by recovered projectile runtime routes", () => {
  const projectileRuntime = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-manifest.json"), "utf8"));
  const projectileRows = projectileRuntime.items || [];
  const kineticProjectilePaths = new Set(
    projectileRows
      .filter((row) => row.modelLabel === "Kinetic_Skin_Valkyrie")
      .flatMap((row) => [row.resourcePath, ...(String(row.pairedImpactResourcePaths || "").split("|").filter(Boolean))])
      .filter(Boolean),
  );
  assert.ok(
    kineticProjectilePaths.has("Effects/Hero048/S2/Hero048_S2_Proj_Mini/Hero048_S2_Proj_Mini.pfx"),
    "expected Kinetic skin projectile runtime to include the mini projectile route",
  );

  const hookRows = Array.isArray(effectHookRuntimeManifest) ? effectHookRuntimeManifest : effectHookRuntimeManifest.items || [];
  assert.ok(
    hookRows.some(
      (row) =>
        row.effectToken === "Effect_Kinetic_BasicAttack_Mini" &&
        (row.resourcePaths || []).includes("Effects/Hero048/S2/Hero048_S2_Proj_Mini/Hero048_S2_Proj_Mini.pfx"),
    ),
    "expected a Kinetic hook candidate for the same projectile resource",
  );

  assert.match(appJs, /function runtimeEffectProjectileRuntimeCoverage\(entry, animation = selectedAnimation\(\), item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectDefinitionProjectileEntriesForItem\(item\)/);
  assert.match(appJs, /return "projectile-runtime-current-action";/);
  assert.match(appJs, /return hasProjectileRuntimeRoute \? "projectile-runtime-other-action" : "";/);
  assert.match(appJs, /const projectileRuntimeCoverage = runtimeEffectProjectileRuntimeCoverage\(previewContext,\s*animation\);/);
  assert.match(
    appJs,
    /animationBlockReason === "no-spatial-evidence" && projectileRuntimeCoverage === "projectile-runtime-current-action"/,
  );
  assert.match(appJs, /previewBlockReason = "projectile-runtime-covered";/);
  assert.match(appJs, /projectileRuntimeCoverage,/);
  assert.match(appJs, /projectileRuntimeCoverage: diagnostics\.projectileRuntimeCoverage/);
});

test("viewer treats impact pfx resources linked by native nearby projectile tokens as projectile-runtime covered", () => {
  const projectileRuntime = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-manifest.json"), "utf8"));
  const projectileRows = projectileRuntime.items || [];
  assert.ok(
    projectileRows.some(
      (row) =>
        row.modelLabel === "Kinetic_Skin_Valkyrie" &&
        row.resourcePath === "Effects/Hero048/S2/Hero048_S2_C_Proj/Hero048_S2_C_Proj.pfx" &&
        String(row.nativeEffectHookTokens || "").includes("Effect_Kinetic_C"),
    ),
    "expected recovered Kinetic C projectile runtime route",
  );

  const hookRows = Array.isArray(effectHookRuntimeManifest) ? effectHookRuntimeManifest : effectHookRuntimeManifest.items || [];
  assert.ok(
    hookRows.some(
      (row) =>
        row.effectToken === "Effect_Kinetic_C_Impact" &&
        (row.nativeNearbyEffectTokens || []).includes("Effect_Kinetic_C") &&
        (row.resourcePaths || []).some((resourcePath) => /Hero048_C_Hit\.pfx$/.test(resourcePath)),
    ),
    "expected Kinetic C impact hook to point back to the projectile token",
  );

  assert.match(appJs, /function runtimeEffectPathLooksImpactResource\(relativePath\)/);
  assert.match(appJs, /function runtimeEffectProjectileEntryEffectTokens\(projectileEntry\)/);
  assert.match(appJs, /projectileEntry\?\.projectile\?\.effectTokens/);
  assert.match(appJs, /projectileEntry\?\.projectile\?\.nativeEffectHookTokens/);
  assert.match(appJs, /function runtimeEffectProjectileRuntimeCoversRelatedImpact\(entry,\s*projectileEntry\)/);
  assert.match(appJs, /runtimeEffectPathLooksImpactResource\(entry\?\.pfxItem\?\.relativePath\)/);
  assert.match(appJs, /entry\?\.hook\?\.nativeNearbyEffectTokens/);
  assert.match(appJs, /runtimeEffectProjectileRuntimeCoversRelatedImpact\(entry,\s*projectileEntry\)/);
});

test("viewer recognizes camel-case impact PFX resource names without classifying projectile bodies as impacts", () => {
  const source = functionSource("runtimeEffectPathLooksImpactResource");
  const runtimeEffectPathLooksImpactResource = new Function(`${source}; return runtimeEffectPathLooksImpactResource;`)();
  assert.equal(
    runtimeEffectPathLooksImpactResource("Effects/Ringo/ability01/RingoAbility01Impact.assetbundle/RingoAbility01Impact.pfx"),
    true,
  );
  assert.equal(
    runtimeEffectPathLooksImpactResource("Effects/Ringo/ability01/RingoAbility01Shot.assetbundle/RingoAbility01Shot.pfx"),
    false,
  );
  assert.equal(
    runtimeEffectPathLooksImpactResource("Effects/Example/ExplosiveProjectile/ExplosiveProjectile.pfx"),
    false,
  );
});

test("viewer summarizes hook candidates already covered by projectile runtime", () => {
  assert.match(appJs, /function runtimeEffectProjectileRuntimeCoverageCounts\(hooks = runtimeEffectHooksForItem\(\), animation = selectedAnimation\(\), item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectProjectileRuntimeCoverage\(entry,\s*animation,\s*item\)/);
  assert.match(appJs, /counts\.currentAction \+= 1;/);
  assert.match(appJs, /counts\.otherAction \+= 1;/);
  assert.match(appJs, /function runtimeEffectProjectileRuntimeCoverageSummary\(counts\)/);
  assert.match(appJs, /projectile runtime 已接管/);
  assert.match(appJs, /当前动作 \$\{counts\.currentAction\}/);
  assert.match(appJs, /其他动作 \$\{counts\.otherAction\}/);
  assert.match(appJs, /const projectileRuntimeCoverageCounts = runtimeEffectProjectileRuntimeCoverageCounts\(hooks,\s*selectedAnimation\(\),\s*item\);/);
  assert.match(appJs, /projectileRuntimeCoverageSummary,/);
});

test("viewer excludes projectile-runtime covered candidates from missing-location surface counts", () => {
  assert.match(
    appJs,
    /function runtimeEffectBlockedPreviewSurfaceReasonCounts\(hooks, item = activeManifestItem, animation = selectedAnimation\(\)\)/,
  );
  assert.match(appJs, /const projectileRuntimeCoverage = runtimeEffectProjectileRuntimeCoverage\(entryContext,\s*animation,\s*item\);/);
  assert.match(appJs, /if \(projectileRuntimeCoverage\) continue;/);
  assert.match(appJs, /runtimeEffectBlockedPreviewSurfaceReasonCounts\(hooks,\s*item,\s*selectedAnimation\(\)\)/);
});

test("viewer exposes blocked pfx runtime evidence needed for native binding follow-up", () => {
  assert.match(appJs, /function runtimeEffectBlockedPreviewSurfaceDetails\(shadergraphItems,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectSurfaceRecordForShadergraph\(pfxItem,\s*shadergraphItem\)/);
  assert.match(appJs, /parameterProfile\?\.semanticSlots/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"durationSeconds"\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"delaySeconds"\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"sizeScalar"\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"rotationDegrees"\)/);
  assert.match(appJs, /areaShapeEvidence: runtimeEffectAreaSurfaceHasShapeEvidence\(shadergraphItem,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /areaShapeGapReason: runtimeEffectAreaSurfaceShapeGapReason\(shadergraphItem,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /pfxBindingKind: pfxBindingProfile\?\.kind \|\| ""/);
  assert.match(appJs, /pfxBindingBoneToken: pfxBindingProfile\?\.boneToken \|\| ""/);
  assert.match(appJs, /pfxBindingEvidence: pfxBindingProfile\?\.evidence \|\| ""/);
  assert.match(appJs, /effectChannelFallback: Boolean\(bindingTarget\?\.effectChannelFallback\)/);
  assert.match(appJs, /hasStrongSpatialEvidence: runtimeEffectEntryHasStrongSpatialEvidence\(entryContext\)/);
  assert.match(appJs, /hasTimelineEvidence: runtimeEffectHasTimelineEvidence\(entryContext\)/);
  assert.match(appJs, /inferredActionKeys: \[\.\.\.runtimeEffectInferredActionKeys\(entryContext\)\]/);
  assert.match(appJs, /const blockedSurfaceDetails = runtimeEffectBlockedPreviewSurfaceDetails\(shadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /\.filter\(\(detail\) => detail\.areaShapeGapReason\)/);
  assert.match(appJs, /blockedSurfaceDetails,/);
});

test("viewer exposes true missing-location pfx candidates for runtime debugging", () => {
  assert.match(
    appJs,
    /function runtimeEffectBlockedPreviewCandidateRows\(hooks = runtimeEffectHooksForItem\(\), item = activeManifestItem, animation = selectedAnimation\(\)\)/,
  );
  assert.match(appJs, /const blockedSurfaceDetails = runtimeEffectBlockedPreviewSurfaceDetails\(shadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /const blockedSurfaceReasons = blockedSurfaceDetails\.map\(\(detail\) => detail\.rejectReason \|\| detail\.areaShapeGapReason\)\.filter\(Boolean\);/);
  assert.match(appJs, /if \(projectileRuntimeCoverage\) continue;/);
  assert.match(appJs, /resourceKey: `\$\{hook\.id \|\| hook\.effectToken \|\| hook\.token \|\| ""\}\\t\$\{pfxItem\.relativePath\}`/);
  assert.match(appJs, /runtimeEffectBlockedPreviewCandidatesForDebug\(\)/);
  assert.match(appJs, /return runtimeEffectBlockedPreviewCandidateRows\(\);/);
});

test("viewer gates runtime effect previews with pfx surface runtime timing hints", () => {
  assert.match(appJs, /surfaceRecords: nativePrimitive \? \[\] : pfxItem\.surfaceRecords \|\| \[\]/);
  assert.match(appJs, /function runtimeEffectSurfaceRuntimeHint\(record, name\)/);
  assert.match(appJs, /function runtimeEffectTimelineWindow\(entry\)/);
  assert.match(appJs, /const pfxWindow = runtimeEffectTimelineWindow\(entry\);/);
  assert.match(appJs, /manualAnimationTime/);
  assert.match(appJs, /pfxWindow\.startSeconds/);
  assert.match(appJs, /pfxWindow\.endSeconds/);
});

test("viewer prefers native emitter lifecycle hints over sampled pfx surface timing hints", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const recordWithNativeLifecycle = pfxItems
    .flatMap((item) => item.surfaceRecords || [])
    .find(
      (record) =>
        Number.isFinite(record.emitterRuntimeHints?.durationSeconds) &&
        record.emitterRuntimeHints.durationSeconds !== record.runtimeHints?.durationSeconds,
    );
  assert.ok(recordWithNativeLifecycle, "expected PFX manifest to include native emitter lifecycle evidence");

  const hintSource = functionSource("runtimeEffectSurfaceRuntimeHint");
  assert.match(hintSource, /if \(name === "delaySeconds" \|\| name === "durationSeconds"\)/);
  assert.match(hintSource, /record\?\.emitterRuntimeHints\?\.\[name\]/);
  assert.match(hintSource, /record\?\.runtimeHints\?\.\[name\]/);
  assert.doesNotMatch(hintSource, /emitterRuntimeHints[\s\S]*sizeScalar/);
});

test("viewer gates each pfx surface layer with its own runtime timing hints", () => {
  assert.match(appJs, /function runtimeEffectSurfaceLayerActivity\(surfaceRecord,\s*entry,\s*elapsedSeconds\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"durationSeconds"\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"delaySeconds"\)/);
  assert.match(appJs, /runtimeEffectWindowOpacity\(timeSeconds,\s*startSeconds,\s*endSeconds\)/);
  assert.match(appJs, /layerObject\.userData\.surfaceRecord = spec\.surfaceRecord;/);
  assert.match(appJs, /const initialActivity = runtimeEffectPreviewActivity\(entry,\s*runtimeEffectElapsed\);/);
  assert.match(appJs, /const initialSurfaceActivity = runtimeEffectSurfaceLayerActivity\(spec\.surfaceRecord,\s*entry,\s*runtimeEffectElapsed\);/);
  assert.match(appJs, /const initialCombinedOpacity = initialActivity\.opacity \* initialSurfaceActivity\.opacity;/);
  assert.match(appJs, /layerObject\.visible = initialCombinedOpacity > 0\.02;/);
  assert.match(appJs, /const surfaceActivity = runtimeEffectSurfaceLayerActivity\(layerObject\.userData\.surfaceRecord,\s*preview\.userData\.entry,\s*elapsedSeconds\);/);
  assert.match(appJs, /const combinedOpacity = activity\.opacity \* surfaceActivity\.opacity;/);
  assert.match(appJs, /layerObject\.visible = combinedOpacity > 0\.02;/);
  assert.match(appJs, /layerObject\.material\.opacity = layerObject\.userData\.baseOpacity \* combinedOpacity;/);
});

test("viewer honors delay-only pfx surface layers instead of showing them immediately", () => {
  assert.match(appJs, /function runtimeEffectSurfaceTimeSeconds\(entry,\s*pfxWindow,\s*elapsedSeconds\)/);
  assert.match(appJs, /const animationSeconds = animationDuration\(animation\);/);
  assert.match(appJs, /if \(animationSeconds > 0\) return manualAnimationTime;/);
  assert.match(appJs, /const delaySeconds = runtimeEffectSurfaceRuntimeHint\(surfaceRecord,\s*"delaySeconds"\) \?\? 0;/);
  assert.match(appJs, /if \(durationSeconds === null && delaySeconds > 0\) \{/);
  assert.match(appJs, /const active = timeSeconds >= startSeconds;/);
  assert.match(appJs, /return \{ opacity: active \? 1 : 0, scale: active \? 1 : 0\.92 \};/);
});

test("viewer carries native hook action keys into effect preview entries", () => {
  assert.match(appJs, /actionKeys: hook\.actionKeys \|\| \[\]/);
});

test("viewer resolves native effect locator labels through runtime slot semantics", () => {
  assert.match(appJs, /function runtimeEffectLocatorSlot\(hook,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeNativeProjectileEmitterSlotScore\(\{ emitterLabel: boneToken \},\s*slot\) >= RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE/);
  assert.match(appJs, /const locatorSlot = runtimeEffectLocatorSlot\(hook,\s*item\);/);
});

test("viewer previews pfx lifecycle in local effect time when the pfx window exceeds the selected animation", () => {
  assert.match(appJs, /function runtimeEffectPfxTimeSeconds\(role, pfxWindow, elapsedSeconds\)/);
  assert.match(appJs, /const windowExceedsAnimation = duration > 0 && pfxWindow\.endSeconds > duration \+ 0\.05;/);
  assert.match(appJs, /if \(role === "sustain" && !windowExceedsAnimation\) return manualAnimationTime;/);
  assert.match(appJs, /const loopSeconds = Math\.max\(pfxWindow\.endSeconds \+ 0\.12, 0\.4\);/);
  assert.match(appJs, /return \(\(Number\(elapsedSeconds\) \|\| 0\) % loopSeconds\);/);
  assert.match(appJs, /const timeSeconds = runtimeEffectPfxTimeSeconds\(role, pfxWindow, elapsedSeconds\);/);
});

test("viewer lets finite sustain effect lifetimes fade out completely", () => {
  assert.doesNotMatch(appJs, /role === "sustain" \? Math\.max\(0\.2, opacity\) : opacity/);
  assert.match(appJs, /function runtimeEffectNativeTimelineActivity\(entry\)/);
  assert.match(appJs, /return \{ opacity, scale: 0\.9 \+ opacity \* 0\.25 \};/);
  assert.match(appJs, /const pfxWindow = runtimeEffectTimelineWindow\(entry\);[\s\S]*?return \{ opacity, scale: 0\.9 \+ opacity \* 0\.25 \};/);
});

test("viewer keeps native-started pfx effects alive through delayed surface tails", () => {
  const delayedPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.pfx",
  );
  assert.ok(delayedPfx, "expected Adagio ult enemy PFX in manifest");
  assert.ok(
    (delayedPfx.hookBindingProfiles || []).some((profile) => profile.effectToken === "Effect_Adagio_Ult_Enemy" && profile.startSeconds === 0),
    "Adagio ult enemy should have native start evidence",
  );
  assert.ok(
    (delayedPfx.surfaceRecords || []).some(
      (record) => (record.runtimeHints?.delaySeconds || 0) > 1 && (record.runtimeHints?.durationSeconds || 0) > 1,
    ),
    "Adagio ult enemy should have delayed finite PFX surface records",
  );

  assert.match(appJs, /function runtimeEffectNativeTimelineDurationSeconds\(entry,\s*fallbackSeconds = 0\.65\)/);
  assert.match(appJs, /if \(pfxWindow\) return Math\.max\(0\.08,\s*pfxWindow\.endSeconds\);/);
  assert.doesNotMatch(appJs, /if \(pfxWindow\) return Math\.max\(0\.08,\s*pfxWindow\.endSeconds - pfxWindow\.startSeconds\);/);
});

test("viewer keeps native-started PFX surfaces visible on their start frame", () => {
  const gwenCleansePfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero037/SNOW/Hero037_SNOW_Cleanse/Hero037_SNOW_Cleanse.pfx",
  );
  assert.ok(gwenCleansePfx, "expected Gwen snow cleanse PFX fixture");
  assert.ok(
    (gwenCleansePfx.surfaceRecords || []).some(
      (record) =>
        (record.emitterRuntimeHints?.delaySeconds || 0) === 0,
    ),
    "expected a native emitter surface with explicit zero delay at the native start",
  );

  assert.match(appJs, /function runtimeEffectSurfaceHasInstantDuration\(surfaceRecord\)/);
  assert.match(appJs, /function runtimeEffectInstantWindowOpacity\(position,\s*start,\s*end\)/);
  const instantOpacitySource = functionSource("runtimeEffectInstantWindowOpacity");
  assert.match(instantOpacitySource, /if \(position < start \|\| position > end\) return 0;/);
  assert.match(instantOpacitySource, /return Math\.max\(0,\s*1 - progress\);/);

  const nativeActivitySource = functionSource("runtimeEffectNativeTimelineActivity");
  assert.match(nativeActivitySource, /runtimeEffectTimelineWindowHasInstantStart\(entry\)/);
  assert.match(nativeActivitySource, /runtimeEffectInstantWindowOpacity\(localSeconds,\s*pfxWindow\.startSeconds,\s*pfxWindow\.endSeconds\)/);

  const surfaceActivitySource = functionSource("runtimeEffectSurfaceLayerActivity");
  assert.match(surfaceActivitySource, /runtimeEffectSurfaceHasInstantDuration\(surfaceRecord\)/);
  assert.match(surfaceActivitySource, /runtimeEffectInstantWindowOpacity\(timeSeconds,\s*startSeconds,\s*endSeconds\)/);
});

test("viewer applies pfx surface rotation hints to individual effect sprite layers", () => {
  assert.match(appJs, /function runtimeEffectSurfaceRecordForLayer\(entry, layerIndex\)/);
  assert.match(appJs, /runtimeEffectSurfaceRuntimeHint\(surfaceRecord, "rotationDegrees"\)/);
  assert.match(appJs, /THREE\.MathUtils\.degToRad\(rotationDegrees\)/);
});

test("viewer applies shadergraph UV phase scale when playing flipbook effects", () => {
  assert.match(appJs, /const phaseScale = Number\(uvAnimation\.phaseScale\);/);
  assert.match(appJs, /const scaledPhase = Number\.isFinite\(phaseScale\) \? phase \* phaseScale : phase;/);
  assert.match(appJs, /const progress = \(\(scaledPhase % 1\) \+ 1\) % 1;/);
  assert.match(appJs, /Math\.floor\(progress \* uvAnimation\.frameCount\)/);
});

test("viewer scales runtime effect layers from pfx surface size hints instead of fixed card dimensions", () => {
  assert.match(appJs, /function runtimeEffectSurfaceShapeSizeScalar\(surfaceRecord\)/);
  assert.match(appJs, /surfaceRecord\?\.shapeProfile\?\.renderSizeScalar/);
  assert.match(appJs, /function runtimeEffectLayerSizeScalar\(surfaceRecord\)/);
  assert.match(appJs, /runtimeEffectSurfaceShapeSizeScalar\(surfaceRecord\)/);
  assert.match(appJs, /Math\.abs\(sizeScalar\)/);
  assert.match(appJs, /const surfaceSize = runtimeEffectLayerSizeScalar\(surfaceRecord\);/);
  assert.match(appJs, /function runtimeEffectLayerFrameAspectRatio\(entry,\s*layerIndex,\s*uvAnimation\)/);
  assert.match(appJs, /uvAnimation\.repeat\[0\] \/ uvAnimation\.repeat\[1\]/);
  assert.match(appJs, /function runtimeEffectApplyLayerAspectRatio\(width,\s*height,\s*aspectRatio\)/);
  assert.match(appJs, /const aspectRatio = renderFamily === "billboard" \? runtimeEffectLayerFrameAspectRatio\(entry,\s*layerIndex,\s*uvAnimation\) : null;/);
  assert.match(appJs, /const layerSize = runtimeEffectApplyLayerAspectRatio\(baseWidth,\s*baseHeight,\s*aspectRatio\);/);
  assert.match(appJs, /width: layerSize\.width \* layerScale/);
  assert.match(appJs, /height: layerSize\.height \* layerScale/);
});

test("viewer preserves tiny runtime effect size hints instead of inflating them into preview cards", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const tinySizedSurface = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record })))
    .find(({ record }) => record.prelude?.renderFamily === "area" && Math.abs(Number(record.runtimeHints?.sizeScalar)) <= 0.1);

  assert.ok(tinySizedSurface, "expected real area surface with sub-0.1 runtime size hint");

  const sizeSource = functionSource("runtimeEffectLayerSizeScalar");
  assert.doesNotMatch(sizeSource, /Math\.max\(0\.35/, "runtime size hints should not be inflated to the old card minimum");
  assert.match(sizeSource, /Math\.min\(4\.5,\s*Math\.abs\(sizeScalar\)\)/);

  const specSource = functionSource("runtimeEffectLayerSpec");
  assert.match(specSource, /const hasRuntimeSize = nativeSize !== null \|\| surfaceSize !== null;/);
  assert.match(specSource, /const minWidth = hasRuntimeSize \? \(beam \? 1 : area \? 1\.5 : 2\) : \(beam \? 4 : 12\);/);
  assert.match(specSource, /const minHeight = hasRuntimeSize \? \(beam \? 4 : area \? 1\.5 : 2\) : \(beam \? 36 : 14\);/);
  assert.match(specSource, /Math\.max\(minWidth,\s*Math\.min\(area \? 140 : beam \? 18 : 96,\s*size \* widthUnit\)\)/);
  assert.match(specSource, /Math\.max\(minHeight,\s*Math\.min\(area \? 140 : beam \? 180 : 140,\s*size \* heightUnit\)\)/);
});

test("viewer applies native vcall effect options to runtime effect preview color scale and lifetime", () => {
  assert.match(appJs, /function runtimeEffectNativeOptions\(entry\)/);
  assert.match(appJs, /entry\?\.hook\?\.runtimeBinding\?\.effectOptions/);
  assert.match(appJs, /function runtimeEffectNativeColorHex\(entry\)/);
  assert.match(appJs, /const nativeColor = runtimeEffectNativeColorHex\(entry\);/);
  assert.match(appJs, /const nativeSize = runtimeEffectNativeScaleScalar\(entry\);/);
  assert.match(appJs, /const size = nativeSize \?\? surfaceSize/);
  assert.match(appJs, /function runtimeEffectNativeFadeSeconds\(entry\)/);
  assert.match(appJs, /const nativeFadeSeconds = runtimeEffectNativeFadeSeconds\(entry\);/);
});

test("viewer merges pfx profile native options when hook options only carry partial runtime evidence", () => {
  const pfxByPath = new Map((effectPfxManifest.items || []).map((item) => [item.relativePath, item]));
  const partialOptionRows = (effectHookRuntimeManifest.items || []).flatMap((hook) => {
    const hookOptions = hook.runtimeBinding?.effectOptions || {};
    return (hook.resourcePaths || []).flatMap((resourcePath) => {
      const pfxItem = pfxByPath.get(resourcePath);
      if (!pfxItem) return [];
      return (pfxItem.hookBindingProfiles || [])
        .filter((profile) => profile.effectToken === hook.effectToken || profile.token === hook.effectToken || profile.token === hook.token)
        .filter(
          (profile) =>
            hookOptions.visibleOrActive === false &&
            profile.effectOptions?.visibleOrActive === false &&
            profile.effectOptions?.color &&
            Number.isFinite(Number(profile.effectOptions?.scale)) &&
            Number.isFinite(Number(profile.effectOptions?.fadeSeconds)),
        )
        .map((profile) => ({ hook, profile, resourcePath }));
    });
  });

  assert.ok(partialOptionRows.length > 0, "expected real hooks whose profile fills color scale and fade evidence");
  assert.match(appJs, /function mergeRuntimeEffectNativeOptions\(\.\.\.optionSources\)/);
  assert.match(appJs, /for \(const options of optionSources\.filter\(Boolean\)\.reverse\(\)\)/);
  assert.match(appJs, /\.\.\.merged,\s*\.\.\.options/);
  assert.match(appJs, /return Object\.keys\(merged\)\.length \? merged : null;/);
  assert.match(appJs, /return mergeRuntimeEffectNativeOptions\(/);
  assert.match(appJs, /entry\?\.hook\?\.runtimeBinding\?\.effectOptions/);
  assert.match(appJs, /entry\?\.pfxBindingProfile\?\.effectOptions/);
  assert.doesNotMatch(appJs, /entry\?\.hook\?\.runtimeBinding\?\.effectOptions \|\|\s*entry\?\.pfxBindingProfile\?\.effectOptions/);
});

test("viewer gates resource-backed runtime effects with native visibleOrActive evidence", () => {
  assert.match(appJs, /function runtimeEffectNativeVisibilityAllowed\(entry\)/);
  assert.match(appJs, /const options = runtimeEffectNativeOptions\(entry\);/);
  assert.match(appJs, /return options\?\.visibleOrActive !== false;/);
  assert.match(appJs, /if \(!runtimeEffectNativeVisibilityAllowed\(entryContext\)\) return null;/);
  assert.match(appJs, /projectileSourceEntry\?\.hook\?\.runtimeBinding\?\.effectOptions/);
  assert.match(appJs, /const entryContext = \{[\s\S]*?projectileSourceEntry,[\s\S]*?\};\s*if \(!runtimeEffectNativeVisibilityAllowed\(entryContext\)\) return null;\s*const previewShadergraphItems/);
});

test("viewer carries matched pfx hook binding profiles into preview entries", () => {
  const pfxProfiles = (effectPfxManifest.items || []).flatMap((item) => item.hookBindingProfiles || []);
  assert.ok(pfxProfiles.some((profile) => profile.effectOptions?.visibleOrActive === false));
  assert.ok(pfxProfiles.some((profile) => profile.effectOptions?.followTarget === false || profile.effectOptions?.followTarget === true));
  assert.ok(pfxProfiles.some((profile) => Number.isFinite(Number(profile.startSeconds))));
  assert.ok(pfxProfiles.some((profile) => profile.surfaceTimelineWindow?.durationSeconds));
  assert.ok(pfxProfiles.some((profile) => profile.absoluteTimelineWindow?.durationSeconds));

  assert.match(appJs, /function runtimeEffectPfxBindingProfileForEntry\(pfxItem,\s*hook\)/);
  assert.match(appJs, /const effectToken = hook\?\.effectToken \|\| hook\?\.token \|\| "";/);
  assert.match(appJs, /profile\.effectToken === effectToken \|\| profile\.token === effectToken \|\| profile\.token === token/);
  assert.match(appJs, /const pfxBindingProfile = runtimeEffectPfxBindingProfileForEntry\(pfxItem,\s*hook\);/);
  assert.match(appJs, /pfxBindingProfile,/);
  assert.match(appJs, /entry\?\.pfxBindingProfile\?\.effectOptions/);
  assert.match(appJs, /entry\?\.pfxBindingProfile\?\.startSeconds/);
  assert.match(appJs, /entry\?\.pfxBindingProfile\?\.timelineTimes/);
  assert.match(appJs, /function runtimeEffectPfxTimelineWindowCounts\(pfxItems\)/);
  assert.match(appJs, /surfaceTimelineWindow/);
  assert.match(appJs, /absoluteTimelineWindow/);
  assert.match(appJs, /PFX 显示时窗/);
});

test("viewer drives pfx preview lifetime from native-profile absolute timeline windows", () => {
  const delayedAbsoluteProfile = (effectPfxManifest.items || [])
    .flatMap((item) => item.hookBindingProfiles || [])
    .find(
      (profile) =>
        profile.absoluteTimelineWindow &&
        profile.surfaceTimelineWindow &&
        Number(profile.absoluteTimelineWindow.startSeconds) > Number(profile.surfaceTimelineWindow.startSeconds),
    );
  assert.ok(delayedAbsoluteProfile, "expected a PFX profile whose absolute window includes native start timing");

  assert.match(appJs, /function runtimeEffectPfxProfileTimelineWindow\(entry\)/);
  assert.match(appJs, /entry\?\.pfxBindingProfile\?\.absoluteTimelineWindow/);
  assert.match(appJs, /entry\?\.projectileSourceEntry\?\.pfxBindingProfile\?\.absoluteTimelineWindow/);
  assert.match(appJs, /const profileWindow = runtimeEffectPfxProfileTimelineWindow\(entry\);/);
  assert.match(appJs, /\(manualAnimationTime - profileWindow\.startSeconds\) \/ span/);
});

test("viewer prefers pfx hook binding profiles whose native timing matches the runtime hook", () => {
  const glaiveEdgePfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Glaive/Glaive_AxeEdge.assetbundle/Glaive_AxeEdge.pfx",
  );
  assert.ok(glaiveEdgePfx, "expected Glaive axe edge PFX in manifest");
  assert.ok(
    (glaiveEdgePfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Glaive_Axe_Edge" &&
        profile.sourceKind === "native-visual-binding" &&
        profile.boneToken === "Bone_AxeEdge" &&
        (profile.actionKeys || []).includes("ability01") &&
        Number(profile.startSeconds) === 1,
    ),
    "expected the ability01 profile with native start=1",
  );
  assert.ok(
    (glaiveEdgePfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Glaive_Axe_Edge" &&
        profile.sourceKind === "native-visual-binding" &&
        profile.boneToken === "Bone_AxeEdge" &&
        (profile.actionKeys || []).includes("ability01") &&
        Number(profile.startSeconds) === 0,
    ),
    "expected a competing profile with the same token/action/bone but native start=0",
  );

  assert.match(appJs, /function runtimeEffectPfxBindingProfileTimingScore\(profile,\s*hook\)/);
  assert.match(appJs, /hook\?\.runtimeBinding\?\.startSeconds/);
  assert.match(appJs, /profile\?\.startSeconds/);
  assert.match(appJs, /hook\?\.runtimeBinding\?\.timelineTimes/);
  assert.match(appJs, /profile\?\.timelineTimes/);
  assert.match(appJs, /score \+= runtimeEffectPfxBindingProfileTimingScore\(profile,\s*hook\);/);
});

test("viewer prefers exact action-scoped pfx profiles over broader mixed-action profiles", () => {
  const baronWeaponPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero019/Hero019_Weapon/Hero019_Weapon.pfx",
  );
  assert.ok(baronWeaponPfx, "expected Baron weapon PFX in manifest");
  assert.ok(
    (baronWeaponPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Baron_Weapon_Idle" &&
        Number(profile.startSeconds) === 0.75 &&
        (profile.actionKeys || []).length === 1 &&
        profile.actionKeys[0] === "ability02",
    ),
    "expected an ability02-only profile",
  );
  assert.ok(
    (baronWeaponPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Baron_Weapon_Idle" &&
        Number(profile.startSeconds) === 0.75 &&
        (profile.actionKeys || []).includes("ability02") &&
        (profile.actionKeys || []).includes("attack"),
    ),
    "expected a broader ability02+attack competing profile",
  );

  assert.match(appJs, /function runtimeEffectPfxBindingProfileActionScore\(profile,\s*actionKeys\)/);
  assert.match(appJs, /const extraActionCount = profileActions\.filter/);
  assert.match(appJs, /score \+= runtimeEffectPfxBindingProfileActionScore\(profile,\s*actionKeys\);/);
});

test("viewer prefers generic pfx profiles when the runtime hook has no action context", () => {
  const turretDustupPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Turret/TurretDustup.assetbundle/TurretDustup.pfx",
  );
  assert.ok(turretDustupPfx, "expected Turret dustup PFX in manifest");
  assert.ok(
    (turretDustupPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_TurretDustup" &&
        profile.boneToken === "Bone_SearchLight" &&
        Number(profile.startSeconds) === 1 &&
        !(profile.actionKeys || []).length,
    ),
    "expected a generic profile with no action keys",
  );
  assert.ok(
    (turretDustupPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_TurretDustup" &&
        profile.boneToken === "Bone_SearchLight" &&
        Number(profile.startSeconds) === 1 &&
        (profile.actionKeys || []).includes("attack"),
    ),
    "expected a competing attack-scoped profile",
  );
  assert.ok(
    (effectHookRuntimeManifest.items || []).some(
      (hook) =>
        hook.effectToken === "Effect_TurretDustup" &&
        hook.runtimeBinding?.boneToken === "Bone_SearchLight" &&
        !(hook.actionKeys || []).length &&
        (hook.resourcePaths || []).includes("Effects/Turret/TurretDustup.assetbundle/TurretDustup.pfx"),
    ),
    "expected a runtime hook without action context",
  );

  assert.match(appJs, /if \(!actionKeys\?\.size\) return profileActions\.length \? 0\.25 : 0;/);
});

test("viewer prefers root pfx binding profiles when the runtime hook has no bone token", () => {
  const crisisCrystalPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Items/Crisis_Crystal.assetbundle/Crisis_Crystal.pfx",
  );
  assert.ok(crisisCrystalPfx, "expected Crisis Crystal PFX in manifest");
  assert.ok(
    (crisisCrystalPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Crisis_Crystal" &&
        profile.sourceKind === "native-visual-binding" &&
        !profile.boneToken,
    ),
    "expected a root binding profile",
  );
  assert.ok(
    (crisisCrystalPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Crisis_Crystal" &&
        profile.sourceKind === "native-visual-binding" &&
        profile.boneToken === "Bone_CenterMass",
    ),
    "expected a competing center-mass profile",
  );
  assert.ok(
    (effectHookRuntimeManifest.items || []).some(
      (hook) =>
        hook.effectToken === "Effect_Crisis_Crystal" &&
        hook.sourceKind === "native-visual-binding" &&
        !hook.runtimeBinding?.boneToken &&
        (hook.resourcePaths || []).includes("Effects/Items/Crisis_Crystal.assetbundle/Crisis_Crystal.pfx"),
    ),
    "expected a runtime hook without a bone token",
  );

  assert.match(appJs, /function runtimeEffectPfxBindingProfileBoneScore\(profile,\s*hookBoneToken\)/);
  assert.match(appJs, /const profileBoneToken = profile\?\.boneToken \|\| "";/);
  assert.match(appJs, /if \(hookBoneToken\) return profileBoneToken === hookBoneToken \? -2 : 0;/);
  assert.match(appJs, /return profileBoneToken \? 0\.5 : -0\.5;/);
  assert.match(appJs, /score \+= runtimeEffectPfxBindingProfileBoneScore\(profile,\s*hookBoneToken\);/);
});

test("viewer prefers pfx binding profiles whose native options match the runtime hook", () => {
  const lanceShieldPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero028/POS/Hero028_POS_Shield_Ground/Hero028_POS_Shield_Ground.pfx",
  );
  const karasStaticPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero071/Defaults/Hero071_Ability_C_Static/Hero071_Ability_C_Static.pfx",
  );
  assert.ok(lanceShieldPfx, "expected Lance shield ground PFX in manifest");
  assert.ok(karasStaticPfx, "expected Karas ability C static PFX in manifest");
  assert.ok(
    (lanceShieldPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Lance_Shield_Ground" &&
        profile.boneToken === "Bone_Shield" &&
        profile.effectOptions?.visibleOrActive === true,
    ),
    "expected a visible native-option profile",
  );
  assert.ok(
    (lanceShieldPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Lance_Shield_Ground" &&
        profile.boneToken === "Bone_Shield" &&
        profile.effectOptions &&
        profile.effectOptions.visibleOrActive == null,
    ),
    "expected a competing profile without visibleOrActive evidence",
  );
  assert.ok(
    (effectHookRuntimeManifest.items || []).some(
      (hook) =>
        hook.effectToken === "Effect_Lance_Shield_Ground" &&
        hook.runtimeBinding?.boneToken === "Bone_Shield" &&
        hook.runtimeBinding?.effectOptions?.visibleOrActive === true &&
        (hook.resourcePaths || []).includes("Effects/Hero028/POS/Hero028_POS_Shield_Ground/Hero028_POS_Shield_Ground.pfx"),
    ),
    "expected a runtime hook with visibleOrActive evidence",
  );
  assert.ok(
    (karasStaticPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Karas_Ability_C_Static" &&
        profile.sourceKind === "native-effect-vcall" &&
        (profile.actionKeys || []).includes("ability03") &&
        profile.effectOptions?.offsetValues?.["0x60"]?.some((value) => Math.abs(Number(value) - 1.7) <= 0.001),
    ),
    "expected a pfx profile with 0x60=1.7 native option evidence",
  );
  assert.ok(
    (karasStaticPfx.hookBindingProfiles || []).some(
      (profile) =>
        profile.effectToken === "Effect_Karas_Ability_C_Static" &&
        profile.sourceKind === "native-effect-vcall" &&
        (profile.actionKeys || []).includes("ability03") &&
        profile.effectOptions?.offsetValues?.["0x60"]?.some((value) => Math.abs(Number(value) - 0.5) <= 0.001),
    ),
    "expected a competing pfx profile with 0x60=0.5 native option evidence",
  );
  assert.ok(
    (effectHookRuntimeManifest.items || []).some(
      (hook) =>
        hook.effectToken === "Effect_Karas_Ability_C_Static" &&
        hook.sourceKind === "native-effect-vcall" &&
        (hook.actionKeys || []).includes("ability03") &&
        (hook.resourcePaths || []).includes("Effects/Hero071/Defaults/Hero071_Ability_C_Static/Hero071_Ability_C_Static.pfx") &&
        hook.runtimeBinding?.effectOptions?.offsetValues?.["0x60"]?.some((value) => Math.abs(Number(value) - 1.7) <= 0.001),
    ),
    "expected a runtime hook with 0x60=1.7 native option evidence",
  );
  assert.ok(
    (effectHookRuntimeManifest.items || []).some(
      (hook) =>
        hook.effectToken === "Effect_Karas_Ability_C_Static" &&
        hook.sourceKind === "native-effect-vcall" &&
        (hook.actionKeys || []).includes("ability03") &&
        (hook.resourcePaths || []).includes("Effects/Hero071/Defaults/Hero071_Ability_C_Static/Hero071_Ability_C_Static.pfx") &&
        hook.runtimeBinding?.effectOptions?.offsetValues?.["0x60"]?.some((value) => Math.abs(Number(value) - 0.5) <= 0.001),
    ),
    "expected a runtime hook with 0x60=0.5 native option evidence",
  );

  assert.match(appJs, /function runtimeEffectPfxBindingProfileOptionScore\(profile,\s*hook\)/);
  assert.match(appJs, /const hookOptions = hook\?\.runtimeBinding\?\.effectOptions \|\| \{\};/);
  assert.match(appJs, /for \(const optionKey of \["visibleOrActive",\s*"followTarget"]/);
  assert.match(appJs, /function runtimeEffectOptionOffsetValues\(options = \{\}\)/);
  assert.match(appJs, /function runtimeEffectPfxBindingProfileOffsetValueScore\(profile,\s*hook\)/);
  assert.match(appJs, /const hookOffsetValues = runtimeEffectOptionOffsetValues\(hookOptions\);/);
  assert.match(appJs, /const profileOffsetValues = runtimeEffectOptionOffsetValues\(profileOptions\);/);
  assert.match(appJs, /score \+= runtimeEffectPfxBindingProfileOffsetValueScore\(profile,\s*hook\);/);
  assert.match(appJs, /score \+= runtimeEffectPfxBindingProfileOptionScore\(profile,\s*hook\);/);
});

test("viewer surfaces pfx native option argument shapes in effect diagnostics", () => {
  const pfxProfiles = (effectPfxManifest.items || []).flatMap((item) => item.hookBindingProfiles || []);
  assert.ok(pfxProfiles.some((profile) => profile.effectOptions?.effectOptionArgKinds?.some((kind) => kind === "0x60:numeric-local")));

  assert.match(appJs, /function runtimeEffectPfxNativeOptionArgKindCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxNativeOptionArgKindSummary\(argKindCounts\)/);
  assert.match(appJs, /profile\.effectOptions\?\.effectOptionArgKinds/);
  assert.match(appJs, /nativeOptionArgKindLabel\(kind\)/);
  assert.match(appJs, /PFX 参数形态/);
});

test("viewer surfaces pfx runtime hint matches for native option values", () => {
  const pfxProfiles = (effectPfxManifest.items || []).flatMap((item) => item.hookBindingProfiles || []);
  assert.ok(
    pfxProfiles.some((profile) =>
      profile.effectOptions?.effectOptionRuntimeHintMatches?.some((match) => /0x[0-9a-f]+:(delaySeconds|durationSeconds|sizeScalar):/i.test(match)),
    ),
  );
  assert.ok(
    pfxProfiles.some((profile) =>
      profile.effectOptions?.effectOptionRuntimeHintMatches?.some((match) => /^0x60:(delaySeconds|durationSeconds|sizeScalar):/i.test(match)),
    ),
  );

  assert.match(appJs, /function runtimeEffectPfxNativeOptionRuntimeHintMatchCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxUnknownNativeOptionRuntimeHintMatchCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxNativeOptionRuntimeHintMatchSummary\(matchCounts\)/);
  assert.match(appJs, /effectOptionRuntimeHintMatches/);
  assert.match(appJs, /effectOptionUnknownRuntimeHintMatches/);
  assert.match(appJs, /runtimeEffectPfxNativeOptionRuntimeHintLabel\(semantic\)/);
  assert.match(appJs, /PFX 参数同值/);
  assert.match(appJs, /未知参数同值/);
});

test("viewer reports current action effect preview activity in diagnostics", () => {
  assert.match(appJs, /function runtimeEffectPreviewActivityCounts\(item = activeManifestItem,\s*animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /runtimeEffectPreviewEntries\(item\)/);
  assert.match(appJs, /runtimeEffectDefinitionProjectileEntriesForItem\(item\)/);
  assert.match(appJs, /runtimeEffectPreviewCandidateDiagnostics\(entry,\s*animation\)/);
  assert.match(appJs, /pfxRuntimeEvidenceBlockedCount/);
  assert.match(appJs, /no-current-pfx-runtime-evidence/);
  assert.match(appJs, /no-runtime-route/);
  assert.match(appJs, /function runtimeEffectPreviewActivitySummary\(counts\)/);
  assert.match(appJs, /currentActionPreviewSummary/);
  assert.match(appJs, /当前动作预览/);
  assert.match(appJs, /PFX runtime 证据不足/);
  assert.match(appJs, /投射物预览/);
  assert.match(appJs, /动作不匹配/);
});

test("viewer refreshes effect diagnostics after default animation selection settles", () => {
  const syncAnimationSelectSource = functionSource("syncAnimationSelect");
  assert.match(syncAnimationSelectSource, /animationSelect\.value = String\(defaultAnimationIndex\(activeAnimations\)\);/);
  assert.match(syncAnimationSelectSource, /syncAnimationStats\(\);/);
  assert.match(syncAnimationSelectSource, /syncBaseStats\(\);/);
});

test("viewer preview diagnostics use the same native visibility and material gates as rendering", () => {
  const diagnosticsSource = functionSource("runtimeEffectPreviewCandidateDiagnostics");
  assert.match(diagnosticsSource, /const nativeVisibilityAllowed = runtimeEffectNativeVisibilityAllowed\(previewContext\);/);
  assert.match(diagnosticsSource, /const hasRenderableMaterial =[\s\S]*runtimeEffectPreviewHasRenderableMaterial/);
  assert.match(
    diagnosticsSource,
    /const shouldPreview = !animationBlockReason && nativeVisibilityAllowed && hasRenderableMaterial && pfxRuntimeEvidence\.allowed;/,
  );
  assert.doesNotMatch(diagnosticsSource, /const shouldPreview = !animationBlockReason;/);
});

test("viewer gates PFX previews on current runtime evidence", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const callbackSlots = pfxItems.flatMap((item) =>
    (item.surfaceRecords || []).flatMap((record) =>
      (record.emitterRuntimeProfile?.semanticSlots || []).filter((slot) => slot.resolverInputKind === "candidate-key"),
    ),
  );
  const childCallbackSlots = pfxItems.flatMap((item) =>
    (item.surfaceRecords || []).flatMap((record) =>
      (record.childEmitterRecords || []).flatMap((childRecord) =>
        (childRecord.runtimeProfile?.semanticSlots || []).filter((slot) => slot.resolverInputKind === "candidate-key"),
      ),
    ),
  );
  assert.ok(callbackSlots.length, "expected fixture PFX callback evidence");
  assert.ok(childCallbackSlots.length, "expected fixture PFX child emitter callback evidence");
  assert.ok(
    callbackSlots.some((slot) => slot.resolverResolutionStatus === "current-table-callback-matched"),
    "expected at least one fixture PFX with current build callback evidence",
  );
  assert.ok(
    childCallbackSlots.some((slot) => slot.resolverResolutionStatus === "current-table-callback-matched"),
    "expected child emitter PFX callbacks to use current build callback evidence",
  );
  assert.equal(
    callbackSlots.filter((slot) => slot.resolverResolutionStatus === "pending-table-resolution").length,
    0,
    "native emitter layout should resolve fixture PFX callback keys against the current table",
  );
  assert.equal(
    childCallbackSlots.filter((slot) => slot.resolverResolutionStatus === "pending-table-resolution").length,
    0,
    "native child emitter layout should resolve fixture PFX callback keys against the current table",
  );

  const diagnosticsSource = functionSource("runtimeEffectPreviewCandidateDiagnostics");
  assert.match(appJs, /function runtimeEffectPfxRuntimeEvidence\(entry\)/);
  assert.match(appJs, /function runtimeEffectPfxCurrentCallbackEvidenceCount\(pfxItem\)/);
  assert.match(appJs, /for \(const childRecord of record\.childEmitterRecords \|\| \[\]\)/);
  assert.match(diagnosticsSource, /const pfxRuntimeEvidence = runtimeEffectPfxRuntimeEvidence\(previewContext\);/);
  assert.match(
    diagnosticsSource,
    /const shouldPreview = !animationBlockReason && nativeVisibilityAllowed && hasRenderableMaterial && pfxRuntimeEvidence\.allowed;/,
  );
  assert.match(diagnosticsSource, /else if \(!pfxRuntimeEvidence\.allowed\) previewBlockReason = pfxRuntimeEvidence\.blockReason;/);
  assert.match(appJs, /no-current-pfx-runtime-evidence/);
});

test("viewer consumes profile-scoped percentParam native option runtime hints", () => {
  const pfxProfiles = (effectPfxManifest.items || []).flatMap((item) => item.hookBindingProfiles || []);
  assert.ok(
    pfxProfiles.some((profile) =>
      profile.effectOptions?.effectOptionRuntimeHintMatches?.some((match) => /^0x60:sizeScalar:/i.test(match)),
    ),
    "expected profile-scoped percentParam sizeScalar matches",
  );
  assert.ok(
    pfxProfiles.some((profile) =>
      profile.effectOptions?.effectOptionRuntimeHintMatches?.some((match) => /^0x60:durationSeconds:/i.test(match)),
    ),
    "expected profile-scoped percentParam durationSeconds matches",
  );
  assert.ok(
    pfxProfiles.some((profile) =>
      profile.effectOptions?.effectOptionRuntimeHintMatches?.some((match) => /^0x60:delaySeconds:/i.test(match)),
    ),
    "expected profile-scoped percentParam delaySeconds matches",
  );

  const hintSource = functionSource("runtimeEffectPfxNativeOptionRuntimeHintValue");
  assert.match(hintSource, /effectOptionUnknownRuntimeHintMatches/);
  assert.match(hintSource, /effectOptionRuntimeHintMatches/);
  assert.match(hintSource, /offsetValues\?\.\[offset\]/);
  assert.match(hintSource, /runtimeEffectOffsetValueVectorsMatch/);

  assert.match(functionSource("runtimeEffectNativeScaleScalar"), /runtimeEffectPfxNativeOptionRuntimeHintValue\(entry,\s*"sizeScalar"\)/);
  assert.match(functionSource("runtimeEffectEntryStartSeconds"), /runtimeEffectPfxNativeOptionRuntimeHintValue\(entry,\s*"delaySeconds"\)/);
  assert.match(functionSource("runtimeEffectNativeTimelineDurationSeconds"), /runtimeEffectPfxNativeOptionRuntimeHintValue\(entry,\s*"durationSeconds"\)/);
});

test("viewer surfaces native option argument source coverage in runtime health diagnostics", () => {
  const offset60 = (effectNativeOptionProfile.items || []).find((item) => item.offset === "0x60");
  assert.ok(effectNativeOptionProfile.summary.optionArgSourceEntries > 0);
  assert.equal(offset60?.semanticName, "percentParam");
  assert.equal(offset60?.semanticStatus, "known");
  assert.ok(effectNativeOptionProfile.summary.byOffsetArgSourceKind?.["0x60:numeric-local"] > 0);
  assert.ok(offset60?.sampleArgSources?.some((source) => source.startsWith("0x60:")));

  assert.match(appJs, /function nativeOptionArgSourceHealthSummary\(summary\)/);
  assert.match(appJs, /summary\?\.byOffsetArgSourceKind/);
  assert.match(appJs, /summary\?\.byUnknownOffsetArgSourceKind/);
  assert.match(appJs, /optionArgSourceEntries/);
  assert.match(appJs, /参数来源/);
  assert.match(appJs, /来源形态/);
});

test("viewer surfaces classified native primitive runtime rows in health diagnostics", () => {
  assert.equal(effectRuntimeGaps.summary.nativePrimitiveRenderableRows, 18);
  assert.match(appJs, /gapSummary\?\.nativePrimitiveRenderableRows/);
  assert.match(appJs, /原生图元/);
});

test("viewer only renders classified native option effects without guessed pfx resources as primitive previews", () => {
  assert.match(appJs, /function runtimeEffectHookHasNativePrimitiveOptions\(hookOrEntry\)/);
  assert.match(appJs, /runtimeEffectNativeOptions\(hookOrEntry\) \|\| hookOrEntry\?\.runtimeBinding\?\.effectOptions/);
  assert.match(appJs, /if \(options\.visibleOrActive === false\) return false;/);
  assert.match(appJs, /function runtimeEffectNativeOptionArgKinds\(hookOrEntry\)/);
  assert.match(appJs, /function runtimeEffectNativeOptionsHavePrimitiveNumericEvidence\(hookOrEntry\)/);
  assert.match(appJs, /if \(!runtimeEffectNativeOptionsHavePrimitiveNumericEvidence\(hookOrEntry\)\) return false;/);
  assert.match(appJs, /numeric-direct\|numeric-local/);
  assert.match(appJs, /function runtimeEffectNativePrimitivePreviewAllowed\(hookOrEntry\)/);
  assert.match(appJs, /function runtimeEffectNativePrimitivePfxItemForHook\(hookOrEntry\)/);
  assert.match(appJs, /nativePrimitive: true/);
  assert.match(appJs, /const nativePrimitive = Boolean\(pfxItem\.nativePrimitive\);/);
  assert.match(appJs, /const diagnostics = runtimeEffectPreviewCandidateDiagnostics\(\{ \.\.\.entryContext,\s*shadergraphItems,\s*previewShadergraphItems \},\s*animation\);/);
  assert.match(appJs, /if \(!diagnostics\.shouldPreview\) return null;/);
  assert.match(appJs, /if \(!pfxItems\.length && runtimeEffectNativePrimitivePreviewAllowed\(hook\)\)/);
  assert.match(appJs, /warning|execute|target|reticle|ring|area|zone|field|cloud|circle|pillar|edge|damagezone|explosion|buff/i);
  assert.doesNotMatch(appJs, /if \(!pfxItems\.length && runtimeEffectHookHasNativePrimitiveOptions\(hook\)\) \{/);
});

test("viewer treats classified native effect-channel primitives as model-root area evidence", () => {
  const primitiveRows = effectRuntimeGaps.nativePrimitiveRenderableItems || [];
  assert.ok(
    primitiveRows.some(
      (row) =>
        row.effectToken === "Effect_Hero057_B_StunArea" &&
        row.nativeRuntimeKind === "effect-channel" &&
        row.nativeEffectOptions?.scale === 4,
    ),
    "expected a real Hero057 native area primitive with effect-channel binding",
  );

  assert.match(appJs, /if \(runtimeKind === "effect-channel" && runtimeEffectNativePrimitivePreviewAllowed\(hook\)\) \{/);
  assert.match(appJs, /return \{ kind: "model-root", boneIndex: null, boneToken: "" \};/);
  assert.match(appJs, /if \(runtimeKind === "effect-channel"\) \{\s*return \{ kind: "model-root", boneIndex: null, boneToken: "", effectChannelFallback: true \};\s*\}/);
});

test("viewer renders native warning primitives with ring alpha instead of generic radial cards", () => {
  const primitiveRows = effectRuntimeGaps.nativePrimitiveRenderableItems || [];
  assert.ok(
    primitiveRows.some(
      (row) =>
        row.effectToken === "Effect_Caine_ExecuteWarning" &&
        row.actionKeys?.includes("ability03") &&
        row.nativeEffectOptions?.color?.join(",") === "1,0,0" &&
        row.nativeEffectOptions?.fadeSeconds === 0.2,
    ),
    "expected Caine execute warning native primitive evidence",
  );

  assert.match(appJs, /let runtimeEffectNativePrimitiveRingTextureCache = null;/);
  assert.match(appJs, /function runtimeEffectNativePrimitiveKind\(entry\)/);
  assert.match(appJs, /warning|execute|target|reticle|ring|circle/i);
  assert.match(appJs, /function runtimeEffectNativePrimitiveRingTexture\(\)/);
  assert.match(appJs, /runtime_effect_native_primitive_ring/);
  assert.match(appJs, /function runtimeEffectNativePrimitivePreviewTexture\(entry\)/);
  assert.match(appJs, /if \(runtimeEffectNativePrimitiveKind\(entry\) === "ring"\) return runtimeEffectNativePrimitiveRingTexture\(\);/);
  assert.match(appJs, /if \(entry\?\.pfxItem\?\.nativePrimitive\) return runtimeEffectNativePrimitivePreviewTexture\(entry\);/);
  assert.doesNotMatch(appJs, /if \(entry\?\.pfxItem\?\.nativePrimitive\) return runtimeEffectPreviewSpriteTexture\(\);/);
});

test("viewer falls back to native primitive previews when matched pfx profiles provide only native option evidence", () => {
  assert.match(appJs, /function runtimeEffectHookHasNativePrimitiveOptions\(hookOrEntry\)/);
  assert.match(appJs, /const options = runtimeEffectNativeOptions\(hookOrEntry\) \|\| hookOrEntry\?\.runtimeBinding\?\.effectOptions;/);
  assert.match(appJs, /function runtimeEffectNativePrimitivePfxItemForHook\(hookOrEntry\)/);
  assert.match(appJs, /hookOrEntry\?\.effectToken/);
  assert.match(appJs, /const pushedEntry = pushEntry\(\{[\s\S]*?hook,[\s\S]*?pfxItem,[\s\S]*?\}\);/);
  assert.match(appJs, /if \(!pushedEntry && runtimeEffectNativePrimitivePreviewAllowed\(candidateEntry\)\) \{/);
  assert.match(appJs, /runtimeEffectNativePrimitivePfxItemForHook\(candidateEntry\)/);
});

test("viewer renders area pfx surfaces as local planes instead of camera-facing sprite cards", () => {
  assert.match(appJs, /const runtimeEffectPlaneGeometry = new THREE\.PlaneGeometry\(1, 1\);/);
  assert.match(appJs, /function runtimeEffectLayerRenderFamily\(entry, layerIndex\)/);
  assert.match(appJs, /surfaceRecord\?\.prelude\?\.renderFamily/);
  assert.match(appJs, /const renderFamily = runtimeEffectLayerRenderFamily\(entry, layerIndex\);/);
  assert.match(appJs, /renderFamily,/);
  assert.match(appJs, /new THREE\.MeshBasicMaterial\(/);
  assert.match(appJs, /side: THREE\.DoubleSide/);
  assert.match(appJs, /new THREE\.Mesh\(runtimeEffectPlaneGeometry, material\)/);
  assert.match(appJs, /function runtimeEffectAreaOrientationEuler\(surfaceRecord\)/);
  assert.match(appJs, /const orientationCode = Number\(surfaceRecord\?\.prelude\?\.orientationCode\);/);
  assert.match(appJs, /case 2:\s*return \{ x: 0,\s*y: Math\.PI \/ 2,\s*z: 0 \};/);
  assert.match(appJs, /case 4:\s*return \{ x: -Math\.PI \/ 2,\s*y: 0,\s*z: 0 \};/);
  assert.match(appJs, /orientation:\s*area \? runtimeEffectAreaOrientationEuler\(surfaceRecord\)/);
  assert.match(appJs, /layerObject\.rotation\.set\(spec\.orientation\.x,\s*spec\.orientation\.y,\s*spec\.orientation\.z \+ spec\.rotation\);/);
  assert.doesNotMatch(appJs, /layerObject\.rotation\.x = -Math\.PI \/ 2;/);
  assert.match(appJs, /layerObject\.isSprite/);
  assert.match(appJs, /layerObject\.isMesh/);
});

test("viewer keeps local area planes stable instead of adding guessed mesh spin", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const areaWithoutUvRotation = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record, shadergraph: shadergraphByPath.get(record.relativePath) })))
    .find(
      ({ record, shadergraph }) =>
        record.prelude?.renderFamily === "area" &&
        (!shadergraph?.previewUvAnimation || !/rotat/i.test(JSON.stringify(shadergraph.previewUvAnimation))),
    );

  assert.ok(areaWithoutUvRotation, "expected real area surface without shadergraph rotation evidence");

  const specSource = functionSource("runtimeEffectLayerSpec");
  assert.match(specSource, /spinSpeed: \(beam \? 0 : area \? 0 : weapon \? 0\.9 : 1\.5\)/);
  assert.match(functionSource("runtimeEffectUpdateLayerUvAnimation"), /uvAnimation\.mode === "centerScale"/);
  assert.match(functionSource("runtimeEffectUpdateLayerUvAnimation"), /uvAnimation\.mode === "sampledScaleRotate"/);
});

test("viewer keeps unshaped area card-risk surfaces diagnostic-only until PFX shape evidence is recovered", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const unshapedCardRiskArea = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record, shadergraph: shadergraphByPath.get(record.relativePath) })))
    .find(
      ({ record, shadergraph }) =>
        record.prelude?.renderFamily === "area" &&
        shadergraph?.previewSurfaceRejectReason === "area-masked-base-card-risk" &&
        record.runtimeHints?.durationSeconds &&
        !Number.isFinite(Number(record.runtimeHints?.sizeScalar)) &&
        !shadergraph.previewUvAnimation,
    );
  const shapedCardRiskArea = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record, shadergraph: shadergraphByPath.get(record.relativePath) })))
    .find(
      ({ record, shadergraph }) =>
        record.prelude?.renderFamily === "area" &&
        /base-card-risk/.test(shadergraph?.previewSurfaceRejectReason || "") &&
        (Number.isFinite(Number(record.runtimeHints?.sizeScalar)) || Boolean(shadergraph?.previewUvAnimation)),
    );

  assert.ok(unshapedCardRiskArea, "expected real area card-risk surface with timing but no size or UV shape evidence");
  assert.ok(shapedCardRiskArea, "expected real area card-risk surface with size or UV shape evidence");

  assert.match(appJs, /function runtimeEffectAreaSurfaceHasShapeEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  const shapeSource = functionSource("runtimeEffectAreaSurfaceHasShapeEvidence");
  assert.match(shapeSource, /runtimeEffectSurfaceShapeSizeScalar\(surfaceRecord\) !== null/);
  assert.match(shapeSource, /runtimeEffectNativeScaleScalar\(entry\) !== null/);
  assert.match(shapeSource, /item\?\.previewUvAnimation/);
  assert.match(shapeSource, /runtimeEffectShadergraphHasResolvedUvRuntime\(item\)/);

  const areaEvidenceSource = functionSource("runtimeEffectShadergraphHasRuntimeBoundAreaEvidence");
  assert.match(
    areaEvidenceSource,
    /runtimeEffectShadergraphSurfaceCardRiskBlocked\(item\) && !runtimeEffectAreaSurfaceHasShapeEvidence\(item,\s*pfxItem,\s*entry\)/,
  );
  const channelAreaSource = functionSource("runtimeEffectChannelFallbackAreaSurfaceEvidence");
  assert.match(channelAreaSource, /runtimeEffectAreaSurfaceHasShapeEvidence\(shadergraphItem,\s*pfxItem,\s*entry\)/);
});

test("viewer prefers shaped sibling surface records for shared PFX shadergraphs", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const mixedSharedSurface = pfxItems
    .flatMap((item) => {
      const byShadergraph = new Map();
      for (const record of item.surfaceRecords || []) {
        if (!record.relativePath) continue;
        if (!byShadergraph.has(record.relativePath)) byShadergraph.set(record.relativePath, []);
        byShadergraph.get(record.relativePath).push(record);
      }
      return [...byShadergraph.values()].map((records) => ({ item, records }));
    })
    .find(({ records }) => {
      if (records.length < 2) return false;
      const hasShaped = records.some((record) => Number.isFinite(Number(record.shapeProfile?.renderSizeScalar)));
      const hasUnshaped = records.some((record) => !Number.isFinite(Number(record.shapeProfile?.renderSizeScalar)));
      return hasShaped && hasUnshaped;
    });

  assert.ok(mixedSharedSurface, "expected real PFX shadergraph shared by shaped and unshaped emitter records");

  const selectorSource = functionSource("runtimeEffectSurfaceRecordForShadergraph");
  assert.match(selectorSource, /runtimeEffectSurfaceRecordScore/);
  assert.match(selectorSource, /bestScore/);
  assert.match(functionSource("runtimeEffectSurfaceRecordScore"), /runtimeEffectSurfaceShapeSizeScalar\(record\) !== null/);
});

test("viewer allows bone-bound area pfx surfaces when native runtime evidence proves action timing and binding", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const shieldPfx = pfxItems.find(
    (item) => item.relativePath === "Effects/Catherine/S1/Catherine__S1__Shield.assetbundle/Catherine__S1__Shield.pfx",
  );
  assert.ok(shieldPfx, "expected Catherine shield pfx fixture");
  assert.ok(
    shieldPfx.hookBindingProfiles.some(
      (profile) =>
        profile.sourceKind === "native-visual-binding" &&
        profile.kind === "bone" &&
        profile.boneToken === "Bone_Shield" &&
        profile.actionKeys.includes("ability01") &&
        profile.startSeconds === 0,
    ),
  );
  assert.ok(shieldPfx.surfaceRecords.every((record) => record.prelude?.renderFamily === "area"));
  assert.ok(shieldPfx.surfaceRecords.some((record) => record.runtimeHints?.durationSeconds));

  const shieldShadergraphs = (effectShadergraphManifest.items || []).filter((item) =>
    item.relativePath.startsWith("Effects/Catherine/S1/Catherine__S1__Shield.assetbundle/Catherine__S1__Shield."),
  );
  assert.ok(shieldShadergraphs.length > 0, "expected Catherine shield shadergraph rows");
  assert.ok(shieldShadergraphs.every((item) => item.previewSurfaceRenderable === false));
  assert.ok(shieldShadergraphs.every((item) => /area-.*base-card-risk/.test(item.previewSurfaceRejectReason || "")));

  assert.match(appJs, /function runtimeEffectSurfaceRecordHasRuntimeHint\(record\)/);
  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeBoundAreaEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphRenderFamily\(pfxItem,\s*item\) !== "area"/);
  assert.match(appJs, /!runtimeEffectEntryHasStrongSpatialEvidence\(entry\)/);
  assert.match(appJs, /runtimeEffectSurfaceRecordForShadergraph\(pfxItem,\s*item\)/);
  assert.match(appJs, /runtimeEffectSurfaceRecordHasRuntimeHint\(surfaceRecord\)/);
  assert.match(appJs, /!runtimeEffectInferredActionKeys\(entry\)\.size/);
  assert.match(appJs, /!runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundAreaEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /runtimeEffectShadergraphSurfacePreviewAllowed\(item,\s*pfxItem,\s*entry\)/);
});

test("viewer uses channel-resolved masks before falling back to colored local area planes", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const frenzyPfx = pfxItems.find(
    (item) => item.relativePath === "Effects/Koshka/JWL/Koshka_JWL_Ult_Frenzy/Koshka_JWL_Ult_Frenzy.pfx",
  );
  assert.ok(frenzyPfx, "expected Koshka JWL ult frenzy pfx fixture");
  assert.ok(
    frenzyPfx.hookBindingProfiles.some(
      (profile) =>
        profile.sourceKind === "native-visual-binding" &&
        profile.kind === "bone" &&
        profile.boneToken === "Bone_Head" &&
        profile.actionKeys.includes("ability03") &&
        profile.surfaceTimelineWindow?.durationSeconds === 2.1,
    ),
  );

  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const runtimeAreaSurfaces = (frenzyPfx.surfaceRecords || [])
    .filter((record) => record.prelude?.renderFamily === "area" && record.runtimeHints?.durationSeconds)
    .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }));
  const blockedAreaSurfaces = runtimeAreaSurfaces
    .filter(({ shadergraph }) => {
      const roleNames = shadergraph?.roleNames || [];
      return (
        shadergraph?.materialStatus === "classified" &&
        roleNames.includes("alphaBlend") &&
        roleNames.includes("alphaMask") &&
        shadergraph.previewTexture &&
        shadergraph.previewTextureSpriteUsable === false &&
        (shadergraph.textureAssets || []).length > 0 &&
        (shadergraph.inlineColors || []).length > 0 &&
        shadergraph.previewUvRuntimeEvidence?.kind === "pfx-surface-vertex-color-parameters"
      );
    });
  const channelResolvedAreaSurfaces = runtimeAreaSurfaces.filter(({ shadergraph }) => {
    const roleNames = shadergraph?.roleNames || [];
    return (
      shadergraph?.materialStatus === "classified" &&
      roleNames.includes("alphaBlend") &&
      roleNames.includes("alphaMask") &&
      shadergraph.previewTexture &&
      shadergraph.previewTextureSpriteUsable !== false &&
      (shadergraph.previewAlphaSourceChannels || []).length > 0
    );
  });
  assert.ok(
    blockedAreaSurfaces.length > 0 || channelResolvedAreaSurfaces.length > 0,
    "expected runtime-bound area surfaces to have either fallback material evidence or resolved alpha-channel masks",
  );

  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundAreaEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /if \(!item\?\.previewTexture\) return false;/);
  assert.match(appJs, /\(item\?\.textureAssets \|\| \[\]\)\.length/);
  assert.match(appJs, /\(item\?\.inlineColors \|\| \[\]\)\.length/);
  assert.match(
    appJs,
    /runtimeEffectPreviewTextureUsableForSprite\(item\) \|\|\s*runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry\)/,
  );
  assert.match(appJs, /function runtimeEffectEntryHasStrongSpatialEvidence\(entry\)[\s\S]*runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)[\s\S]*return false;/);
  assert.doesNotMatch(appJs, /runtimeEffectShadergraphLooksLikeEffectLayer\(item\)[\s\S]*\(\(item\.inlineColors \|\| \[\]\)\.length/);
});

test("viewer uses channel-resolved masks before falling back to colored billboard layers", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const smokePfx = pfxItems.find((item) => item.relativePath === "Effects/Sayoc/S1/Sayoc_S1_SmokeBomb.assetbundle/Sayoc_S1_SmokeBomb.pfx");
  assert.ok(smokePfx, "expected Taka smoke bomb pfx fixture");
  assert.ok(
    smokePfx.hookBindingProfiles.some(
      (profile) =>
        profile.effectToken === "Effect_Taka_SmokeBomb" &&
        profile.kind === "selected-attachment" &&
        profile.selectedAttachmentSlot === 4 &&
        profile.surfaceTimelineWindow?.durationSeconds === 0.5,
    ),
  );

  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const runtimeBillboards = (smokePfx.surfaceRecords || [])
    .filter((record) => record.prelude?.renderFamily === "billboard")
    .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }));
  const nonSpriteBillboards = runtimeBillboards
    .filter(({ shadergraph }) => {
      const roleNames = shadergraph?.roleNames || [];
      return (
        shadergraph?.materialStatus === "classified" &&
        roleNames.includes("alphaBlend") &&
        shadergraph.previewTexture &&
        shadergraph.previewTextureSpriteUsable === false &&
        shadergraph.previewSurfaceRenderable === true &&
        (shadergraph.textureAssets || []).length > 0 &&
        (shadergraph.inlineColors || []).length > 0
      );
    });
  const channelResolvedBillboards = runtimeBillboards.filter(({ shadergraph }) => {
    const roleNames = shadergraph?.roleNames || [];
    return (
      shadergraph?.materialStatus === "classified" &&
      roleNames.includes("alphaBlend") &&
      shadergraph.previewTexture &&
      shadergraph.previewTextureSpriteUsable !== false &&
      (shadergraph.previewAlphaSourceChannels || []).length > 0
    );
  });
  assert.ok(
    nonSpriteBillboards.length > 0 || channelResolvedBillboards.length > 0,
    "expected selected-attachment billboards to have either fallback material evidence or resolved alpha-channel masks",
  );

  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /item\?\.previewSurfaceRenderable !== true/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.match(
    appJs,
    /runtimeEffectPreviewTextureUsableForSprite\(item\) \|\|\s*runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry\) \|\|\s*runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry\)/,
  );
});

test("viewer uses runtime-bound renderable billboard preview textures instead of only radial fallbacks", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const smokePfx = pfxItems.find((item) => item.relativePath === "Effects/Sayoc/S1/Sayoc_S1_SmokeBomb.assetbundle/Sayoc_S1_SmokeBomb.pfx");
  assert.ok(smokePfx, "expected Taka smoke bomb pfx fixture");
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const runtimeBoundTexture = (smokePfx.surfaceRecords || [])
    .filter((record) => record.prelude?.renderFamily === "billboard")
    .map((record) => shadergraphByPath.get(record.relativePath))
    .find(
      (shadergraph) =>
        shadergraph?.previewTexture &&
        shadergraph.previewTextureSpriteUsable !== false &&
        shadergraph.previewSurfaceRenderable === true &&
        (shadergraph.roleNames || []).includes("alphaBlend"),
    );
  assert.ok(runtimeBoundTexture, "expected a renderable runtime-bound billboard texture");

  assert.match(appJs, /function runtimeEffectPreviewTextureUsableForLayer\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundBillboardFallbackMaterialEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /runtimeEffectPreviewTextureUsableForLayer\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /previewTextures: nativePrimitive \? \[\] : runtimeEffectPreviewTextureItems\(previewShadergraphItems,\s*pfxItem,\s*entryContext\)/);
});

test("viewer exposes runtime effect material and lifecycle evidence in debug rows", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const blueBuffPfx = pfxItems.find((item) => item.relativePath === "Effects/5V5/Blue_Buff/Blue_Buff_Hero/Blue_Buff_Hero.pfx");
  assert.ok(blueBuffPfx, "expected blue buff pfx fixture");
  assert.ok(
    (blueBuffPfx.hookBindingProfiles || []).some((profile) => profile.surfaceTimelineWindow?.durationSeconds === 0.1),
    "expected pfx binding profile timeline evidence",
  );
  assert.ok(
    (blueBuffPfx.surfaceRecords || []).some(
      (record) =>
        record.prelude?.renderFamily === "billboard" &&
        record.runtimeHints?.durationSeconds === 0.1 &&
        record.runtimeHints?.rotationDegrees === 90,
    ),
    "expected pfx surface runtime hint evidence",
  );

  assert.match(appJs, /function runtimeEffectTimelineWindowForDebug\(entry\)/);
  assert.match(appJs, /const window = runtimeEffectTimelineWindow\(entry\);/);
  assert.match(appJs, /function runtimeEffectPreviewSurfaceRecordsForDebug\(entry\)/);
  assert.match(appJs, /runtimeEffectSurfaceRecordForLayer\(entry,\s*layerIndex\)/);
  assert.match(appJs, /runtimeHints: record\?\.runtimeHints \|\| \{\}/);
  assert.match(appJs, /function runtimeEffectPreviewDebugRow\(entry,\s*extra = \{\}\)/);
  assert.match(appJs, /previewTextures: entry\.previewTextures \|\| \[\]/);
  assert.match(appJs, /timelineWindow: runtimeEffectTimelineWindowForDebug\(entry\)/);
  assert.match(appJs, /surfaceRecords: runtimeEffectPreviewSurfaceRecordsForDebug\(entry\)/);
  assert.match(appJs, /runtimeEffectPreviewEntriesForDebug\(\) \{\s*return runtimeEffectPreviewEntries\(\)\.map\(\(entry\) => runtimeEffectPreviewDebugRow\(entry\)\);/);
  assert.match(appJs, /runtimeEffectPreviews\(\) \{\s*return activeRuntimeEffectObjects\.map\(\(preview\) => \{\s*const entry = preview\.userData\.entry \|\| \{\};\s*return runtimeEffectPreviewDebugRow\(entry,\s*\{ visible: preview\.visible \}\);/);
});

test("viewer preserves repeated pfx surface records as separate timed preview layers", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const fortressTauntPfx = pfxItems.find((item) => item.relativePath === "Effects/Hero015/Fortress_Taunt.assetbundle/Fortress_Taunt.pfx");
  assert.ok(fortressTauntPfx, "expected Fortress taunt pfx fixture");
  const repeatedSurfaceRecords = (fortressTauntPfx.surfaceRecords || []).filter(
    (record) =>
      record.relativePath === "Effects/Hero015/Fortress_Taunt.assetbundle/Fortress_Taunt.Surface[115].shadergraph" &&
      record.prelude?.renderFamily === "billboard",
  );
  assert.ok(repeatedSurfaceRecords.length >= 3, "expected repeated surface records for one shadergraph");
  assert.deepEqual(
    repeatedSurfaceRecords.slice(0, 3).map((record) => record.runtimeHints?.delaySeconds),
    [2, 2.5, 3],
  );

  assert.match(appJs, /function runtimeEffectPreviewSurfaceRecords\(entry\)/);
  assert.match(appJs, /const previewPaths = new Set\(\(entry\.previewShadergraphItems \|\| \[\]\)\.map\(\(item\) => item\.relativePath\)\.filter\(Boolean\)\);/);
  assert.match(appJs, /return records\.filter\(\(record\) => previewPaths\.has\(record\.relativePath\)\);/);
  assert.match(appJs, /const surfaceRecordCount = runtimeEffectPreviewSurfaceRecords\(entry\)\.length;/);
  assert.match(appJs, /Math\.max\(colorCount,\s*textureCount,\s*surfaceRecordCount\)/);
  assert.match(appJs, /const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords\(entry\);/);
  assert.match(appJs, /if \(previewSurfaceRecords\.length\) return previewSurfaceRecords\[layerIndex % previewSurfaceRecords\.length\];/);
  assert.match(appJs, /const surfaceRecord = runtimeEffectSurfaceRecordForLayer\(entry,\s*layerIndex\);/);
  assert.match(appJs, /runtimeEffectShadergraphByPath\.get\(surfaceRecord\.relativePath\)/);
});

test("viewer keeps lookup-only embedded pfx surfaces guarded after alpha evidence is recovered", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const shaderItems = Array.isArray(effectShadergraphManifest) ? effectShadergraphManifest : effectShadergraphManifest.items || [];
  const shaderByPath = new Map(shaderItems.map((item) => [item.relativePath, item]));
  const slashPfx = pfxItems.find((item) => item.relativePath === "Effects/Hero066/Default/Hero066_DEF_B_Slash/Hero066_DEF_B_Slash.pfx");
  assert.ok(slashPfx, "expected Shin slash pfx fixture");
  const recoveredLookupSurface = (slashPfx.surfaceRecords || []).find((record) => {
    const shadergraph = shaderByPath.get(record.relativePath);
    const roles = shadergraph?.roleNames || [];
    return (
      record.runtimeHints?.durationSeconds === 4 &&
      roles.includes("alphaBlend") &&
      roles.includes("lookup") &&
      roles.includes("alphaMask") &&
      roles.includes("uvAnimation") &&
      shadergraph?.previewTextureMode === "embedded-webp"
    );
  });
  assert.ok(recoveredLookupSurface, "expected former lookup surface to carry recovered alpha/uv evidence");
  assert.equal(
    (slashPfx.surfaceRecords || []).some((record) => {
      const shadergraph = shaderByPath.get(record.relativePath);
      const roles = shadergraph?.roleNames || [];
      return (
        roles.includes("alphaBlend") &&
        roles.includes("lookup") &&
        !roles.some((role) => ["baseColor", "alphaMask", "emissive", "uvAnimation"].includes(role)) &&
        shadergraph?.previewTextureMode === "embedded-webp"
      );
    }),
    false,
  );
  assert.ok(
    (slashPfx.hookBindingProfiles || []).some((profile) => profile.absoluteTimelineWindow?.durationSeconds === 4),
    "expected native profile window to include the long lookup-only surface",
  );

  assert.match(appJs, /function runtimeEffectShadergraphHasRenderableTextureRoleEvidence\(item\)/);
  assert.match(appJs, /if \(roleNames\.includes\("lookup"\) && !roleNames\.some\(\(role\) => RUNTIME_EFFECT_RENDERABLE_TEXTURE_ROLES\.has\(role\)\)\) return false;/);
  assert.match(appJs, /if \(!runtimeEffectShadergraphHasRenderableTextureRoleEvidence\(item\)\) return false;[\s\S]*const hasColorEvidence/);
  assert.match(appJs, /function runtimeEffectSurfaceTimelineWindow\(entry\)[\s\S]*const previewSurfaceRecords = runtimeEffectPreviewSurfaceRecords\(entry\);/);
  assert.match(appJs, /const records = previewSurfaceRecords\.length \? previewSurfaceRecords : entry\.surfaceRecords \|\| entry\.pfxItem\?\.surfaceRecords \|\| \[\];/);
  assert.match(appJs, /function runtimeEffectTimelineWindow\(entry\)[\s\S]*const surfaceWindow = runtimeEffectSurfaceTimelineWindow\(entry\);[\s\S]*if \(surfaceWindow\) return surfaceWindow;[\s\S]*return runtimeEffectPfxProfileTimelineWindow\(entry\);/);
  assert.match(appJs, /function runtimeEffectNativeTimelineDurationSeconds\(entry,\s*fallbackSeconds = 0\.65\)[\s\S]*const pfxWindow = runtimeEffectTimelineWindow\(entry\);[\s\S]*if \(pfxWindow\) return Math\.max\(0\.08,\s*pfxWindow\.endSeconds\);[\s\S]*runtimeEffectPfxProfileTimelineWindow\(entry\)/);
  assert.doesNotMatch(appJs, /function runtimeEffectNativeTimelineDurationSeconds\(entry,\s*fallbackSeconds = 0\.65\)[\s\S]*const absoluteWindow = runtimeEffectPfxProfileTimelineWindow\(entry\);[\s\S]*if \(absoluteWindow\)/);
  assert.match(appJs, /function runtimeEffectNativeTimelineActivity\(entry\)[\s\S]*const pfxWindow = runtimeEffectTimelineWindow\(entry\);[\s\S]*const localSeconds = runtimeEffectNativeTimelineLocalSeconds\(entry\);/);
  assert.doesNotMatch(appJs, /function runtimeEffectNativeTimelineActivity\(entry\)[\s\S]*const absoluteWindow = runtimeEffectPfxProfileTimelineWindow\(entry\);[\s\S]*runtimeEffectWindowOpacity\(manualAnimationTime,\s*absoluteWindow\.startSeconds,\s*absoluteWindow\.endSeconds\)/);
});

test("viewer previews selected attachment state-only native vcall effects without action keys", () => {
  const selectedAttachmentHooks = (effectHookRuntimeManifest.items || []).filter(
    (item) => item.runtimeBinding?.kind === "selected-attachment",
  );
  const noActionHooks = selectedAttachmentHooks.filter((item) => !(item.actionKeys || []).length);
  assert.ok(noActionHooks.length > 0, "expected selected attachment hooks without action keys");
  assert.ok(noActionHooks.every((item) => item.effectToken === "Effect_Ylva_Perk_Ping"));
  assert.ok(
    noActionHooks.every(
      (item) =>
        item.sourceKind === "native-effect-vcall" &&
        item.runtimeBinding?.effectOptions?.followTarget === false &&
        item.runtimeBinding?.timelineTimes?.includes(0) &&
        item.visibility?.setsVisibleOrActive &&
        item.visibility?.setsEffectOption,
    ),
  );

  assert.match(appJs, /function runtimeEffectAllowsStateOnlyNativeVcall\(entry,\s*allowedKeys\)/);
  assert.match(appJs, /sourceKind !== "native-effect-vcall"/);
  assert.match(appJs, /entry\?\.hook\?\.runtimeBinding\?\.kind !== "selected-attachment"/);
  assert.match(appJs, /runtimeEffectNativeOptions\(entry\)\?\.followTarget !== false/);
  assert.match(appJs, /!runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(appJs, /if \(runtimeEffectAllowsStateOnlyNativeVcall\(entry,\s*allowedKeys\)\) return true;/);
});

test("viewer previews timed bone-bound native vcall state effects without action keys", () => {
  const gwenCleanseHook = (effectHookRuntimeManifest.items || []).find(
    (item) =>
      item.effectToken === "Effect_Gwen_Cleanse" &&
      item.sourceKind === "native-effect-vcall" &&
      item.runtimeBinding?.kind === "bone" &&
      item.runtimeBinding?.boneToken === "CenterBody" &&
      !(item.actionKeys || []).length &&
      item.visibility?.setsVisibleOrActive &&
      item.visibility?.setsEffectOption,
  );
  assert.ok(gwenCleanseHook, "expected Gwen cleanse fixture to be a timed bone-bound native vcall state effect");
  assert.deepEqual(gwenCleanseHook.runtimeBinding.timelineTimes, [0]);
  assert.equal(gwenCleanseHook.visibility.hasCallback, false);
  assert.deepEqual(gwenCleanseHook.visibility.buffTokens, []);
  assert.ok(
    (gwenCleanseHook.resourcePaths || []).includes("Effects/Hero037/SNOW/Hero037_SNOW_Cleanse/Hero037_SNOW_Cleanse.pfx"),
    "expected Gwen snow cleanse PFX resource evidence",
  );

  const gwenSnowCleansePfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero037/SNOW/Hero037_SNOW_Cleanse/Hero037_SNOW_Cleanse.pfx",
  );
  assert.ok(gwenSnowCleansePfx, "expected Gwen snow cleanse PFX in generated manifest");
  assert.ok(
    (gwenSnowCleansePfx.surfaceRecords || []).some((record) =>
      (record.emitterRuntimeProfile?.semanticSlots || []).some(
        (slot) => slot.resolverResolutionStatus === "current-table-callback-matched",
      ),
    ),
    "expected Gwen cleanse PFX to have current callback runtime evidence",
  );

  assert.match(appJs, /function runtimeEffectAllowsBoneBoundStateOnlyNativeVcall\(entry,\s*allowedKeys\)/);
  const source = functionSource("runtimeEffectAllowsBoneBoundStateOnlyNativeVcall");
  assert.match(source, /sourceKind !== "native-effect-vcall"/);
  assert.match(source, /entry\?\.hook\?\.runtimeBinding\?\.kind !== "bone"/);
  assert.match(source, /allowedKeys\?\.size/);
  assert.match(source, /visibility\.hasCallback/);
  assert.match(source, /visibility\.buffTokens/);
  assert.match(source, /visibility\.setsVisibleOrActive \|\| visibility\.setsEffectOption/);
  assert.match(source, /runtimeEffectEntryHasStrongSpatialEvidence\(entry\)/);
  assert.match(source, /runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(source, /runtimeEffectPfxRuntimeEvidence\(entry\)\.allowed/);

  const blockSource = functionSource("runtimeEffectPreviewAnimationBlockReason");
  assert.match(blockSource, /runtimeEffectAllowsBoneBoundStateOnlyNativeVcall\(entry,\s*allowedKeys\)/);
  const previewSource = functionSource("runtimeEffectShouldPreviewForAnimation");
  assert.match(previewSource, /runtimeEffectAllowsBoneBoundStateOnlyNativeVcall\(entry,\s*allowedKeys\)/);
});

test("viewer reports runtime pfx resources that are blocked from preview by card-risk filters", () => {
  const pfxByPath = new Map((effectPfxManifest.items || []).map((item) => [item.relativePath, item]));
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const blockedRuntimeRows = (effectHookRuntimeManifest.items || []).flatMap((hook) =>
    (hook.resourcePaths || []).flatMap((resourcePath) => {
      const pfxItem = pfxByPath.get(resourcePath);
      if (!pfxItem) return [];
      const blockedSurfaces = (pfxItem.surfaceRecords || [])
        .map((record) => shadergraphByPath.get(record.relativePath))
        .filter((shadergraphItem) => /card-risk/.test(shadergraphItem?.previewSurfaceRejectReason || ""));
      return blockedSurfaces.length ? [{ hook, pfxItem, blockedSurfaces }] : [];
    }),
  );

  assert.ok(
    blockedRuntimeRows.some(
      ({ hook, pfxItem }) =>
        hook.effectToken === "Effect_Baron_A_Warning_A" &&
        pfxItem.relativePath === "Effects/Hero019/Hero019_A_Warning_A/Hero019_A_Warning_A.pfx",
    ),
    "expected real Baron warning runtime PFX surfaces to be blocked as card-risk until world binding is recovered",
  );

  assert.match(appJs, /function runtimeEffectBlockedPreviewSurfaceReasonCounts\(hooks,\s*item = activeManifestItem,\s*animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /const projectileRuntimeCoverage = runtimeEffectProjectileRuntimeCoverage\(entryContext,\s*animation,\s*item\);/);
  assert.match(appJs, /if \(projectileRuntimeCoverage\) continue;/);
  assert.match(appJs, /runtimeEffectPreviewShadergraphItems\(shadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /previewSurfaceRejectReason/);
  assert.match(appJs, /blockedPreviewSurfaceCount/);
  assert.match(appJs, /runtime 资源待定位/);
});

test("viewer uses shadergraph pfx render families when pfx surface records are missing", () => {
  const shadergraphFamilies = new Set(
    (effectShadergraphManifest.items || []).flatMap((item) => item.pfxRenderFamilies || []),
  );
  assert.ok(shadergraphFamilies.has("area"), "expected shadergraph manifest to classify area surfaces");
  assert.ok(shadergraphFamilies.has("beam"), "expected shadergraph manifest to classify beam surfaces");
  assert.ok(shadergraphFamilies.has("billboard"), "expected shadergraph manifest to classify billboard surfaces");

  assert.match(appJs, /function runtimeEffectShadergraphRenderFamily\(pfxItem,\s*shadergraphItem\)/);
  assert.match(appJs, /const surfaceFamily = runtimeEffectSurfaceRecordForShadergraph\(pfxItem,\s*shadergraphItem\)\?\.prelude\?\.renderFamily;/);
  assert.match(appJs, /if \(surfaceFamily\) return surfaceFamily;/);
  assert.match(appJs, /for \(const family of shadergraphItem\?\.pfxRenderFamilies \|\| \[\]\)/);
  assert.match(appJs, /if \(\["beam", "area", "billboard"\]\.includes\(family\)\) return family;/);
  assert.match(appJs, /const shadergraphFamily = runtimeEffectShadergraphRenderFamily\(entry\.pfxItem,\s*runtimeEffectShadergraphForLayer\(entry, layerIndex\)\);/);
  assert.match(appJs, /return surfaceRecord\?\.prelude\?\.renderFamily \|\| shadergraphFamily \|\| "billboard";/);
});

test("viewer renders beam pfx surfaces as narrow local meshes instead of sprite cards", () => {
  assert.match(appJs, /const beam = renderFamily === "beam";/);
  assert.match(appJs, /const widthUnit = area \? 34 : beam \? 1\.6/);
  assert.match(appJs, /const heightUnit = area \? 34 : beam \? 38/);
  assert.match(appJs, /beam \? 18 : 96/);
  assert.match(appJs, /beam \? 180 : 140/);
  assert.match(appJs, /const meshLayer = spec\.renderFamily === "area" \|\| spec\.renderFamily === "beam";/);
  assert.match(appJs, /if \(spec\.renderFamily === "beam"\) layerObject\.rotation\.z = spec\.rotation;/);
});

test("viewer keeps runtime-bound beam shadergraph surfaces in the preview layer set", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const kineticLaserPfx = pfxItems.find(
    (item) => item.relativePath === "Effects/Hero048/S2/Hero048_S2_C_Laser/Hero048_S2_C_Laser.pfx",
  );
  assert.ok(kineticLaserPfx, "expected Kinetic Valkyrie laser pfx fixture");

  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const beamSurface = (kineticLaserPfx.surfaceRecords || [])
    .filter((record) => record.prelude?.renderFamily === "beam")
    .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }))
    .find(
      ({ record, shadergraph }) =>
        Boolean(record.runtimeHints?.sizeScalar) &&
        shadergraph?.previewSurfaceRenderable === true &&
        shadergraph?.previewTextureSpriteUsable === true &&
        (shadergraph.roleNames || []).includes("alphaBlend"),
    );
  assert.ok(beamSurface, "expected renderable runtime-sized beam surface");

  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeBoundBeamEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphRenderFamily\(pfxItem,\s*item\) !== "beam"/);
  assert.match(appJs, /runtimeEffectPreviewRole\(entry\) !== "projectile"/);
  assert.match(appJs, /runtimeEffectSurfaceRecordHasRuntimeHint\(surfaceRecord\)/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundBeamEvidence\(item,\s*pfxItem,\s*entry\)/);
});

test("viewer applies shadergraph preview blend and opacity hints to effect sprite layers", () => {
  assert.match(appJs, /function runtimeEffectShadergraphForLayer\(entry, layerIndex\)/);
  assert.match(appJs, /const shadergraphItem = runtimeEffectShadergraphForLayer\(entry, layerIndex\);/);
  assert.match(appJs, /shadergraphItem\?\.previewBlendMode \|\| "additive"/);
  assert.match(appJs, /Number\.isFinite\(shadergraphItem\?\.previewOpacity\)/);
  assert.match(appJs, /function runtimeEffectLayerBlending\(spec\)/);
  assert.match(appJs, /THREE\.NormalBlending/);
  assert.match(appJs, /THREE\.AdditiveBlending/);
  assert.match(appJs, /blending: runtimeEffectLayerBlending\(spec\)/);
});

test("viewer clips low-alpha pfx preview pixels to reduce rectangular card artifacts", () => {
  assert.match(appJs, /function runtimeEffectLayerAlphaTest\(spec\)/);
  assert.match(appJs, /spec\.blendMode === "alpha" \? 0\.08 : 0\.025/);
  assert.match(appJs, /alphaTest: runtimeEffectLayerAlphaTest\(spec\)/);
});

test("viewer keeps native non-bone runtime effects by anchoring them to the model root", () => {
  assert.match(appJs, /function runtimeEffectBindingTarget\(hook, item = activeManifestItem\)/);
  assert.match(appJs, /hook\?\.runtimeBinding\?\.kind/);
  assert.match(appJs, /kind: "model-root"/);
  assert.match(appJs, /function runtimeEffectAnchorObject\(entry, bones\)/);
  assert.match(appJs, /entry\.bindingTarget\.kind === "bone"/);
  assert.match(appJs, /entry\.bindingTarget\.kind === "model-root"/);
  assert.match(appJs, /activeObject\.add\(preview\)/);
});

test("viewer snapshots explicit non-following bone effects onto the model root", () => {
  assert.match(appJs, /function runtimeEffectUsesWorldSnapshot\(entry\)/);
  assert.match(appJs, /runtimeEffectNativeOptions\(entry\)\?\.followTarget !== false/);
  assert.match(
    appJs,
    /bindingKind !== "bone" && bindingKind !== "bone-name" && bindingKind !== "model-root" && bindingKind !== "model-root-offset"/,
  );
  assert.match(appJs, /runtimeEffectPreviewRole\(entry\) === "sustain"/);
  assert.match(appJs, /preview\.userData\.worldSnapshot = runtimeEffectUsesWorldSnapshot\(entry\);/);
  assert.match(appJs, /function runtimeEffectAnchorLocalPosition\(entry, anchor\)/);
  assert.match(appJs, /entry\?\.bindingTarget\?\.kind === "model-root-offset"/);
  assert.match(appJs, /preview\.userData\.entry/);
  assert.match(appJs, /function updateRuntimeEffectWorldSnapshot\(preview, activity\)/);
  assert.match(appJs, /preview\.userData\.worldSnapshotCaptured = false;/);
  assert.match(appJs, /anchor\.getWorldPosition\(worldPosition\);/);
  assert.match(appJs, /runtimeEffectAnchorLocalPosition\(preview\.userData\.entry,\s*anchor\)/);
  assert.match(appJs, /if \(preview\.userData\.worldSnapshot\) updateRuntimeEffectWorldSnapshot\(preview, activity\);/);
  assert.match(appJs, /if \(runtimeEffectUsesWorldSnapshot\(entry\)\)/);
  assert.match(appJs, /activeObject\.add\(preview\);/);
});

test("viewer attaches native visual binding effects by direct skeleton bone name when runtime slots are absent", () => {
  assert.match(appJs, /function normalizedRuntimeBoneName\(value\)/);
  assert.match(appJs, /function runtimeEffectBoneByName\(bones, boneToken\)/);
  assert.match(appJs, /bone\?\.name === boneToken/);
  assert.match(appJs, /kind: "bone-name"/);
  assert.match(appJs, /bindingTarget\?\.boneToken \|\| ""/);
  assert.match(appJs, /entry\.bindingTarget\.kind === "bone-name"/);
  assert.match(appJs, /runtimeEffectBoneByName\(bones, entry\.bindingTarget\.boneToken\)/);
});

test("viewer keeps indexed hero pfx resources in diagnostics without rendering guessed sprite cards", () => {
  assert.match(appJs, /let runtimeEffectPfxByHero = new Map\(\);/);
  assert.match(appJs, /function runtimeEffectHeroKeyForPfx\(pfxItem\)/);
  assert.match(appJs, /function buildRuntimeEffectPfxHeroLookup\(items\)/);
  assert.match(appJs, /runtimeEffectPfxByHero = buildRuntimeEffectPfxHeroLookup\(/);
  assert.match(appJs, /function runtimeEffectFallbackPfxItemsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /const ENABLE_INDEXED_PFX_EFFECT_PREVIEW = false;/);
  assert.match(appJs, /if \(!ENABLE_INDEXED_PFX_EFFECT_PREVIEW\) return runtimeEffectLimitedPreviewEntries\(runtimeEffectDedupePreviewEntries\(entries\),\s*animation\);/);
  assert.match(appJs, /syncRuntimeEffectPreviews\(\);\s*if \(animation\) applyAnimationAtTime\(manualAnimationTime\);/);
});

test("viewer prioritizes current-action runtime effects before applying the preview limit", () => {
  assert.match(appJs, /function runtimeEffectPreviewEntryPriority\(entry,\s*animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /const allowedKeys = runtimeEffectInferredActionKeys\(entry\);/);
  assert.match(appJs, /allowedKeys\.size && runtimeEffectMatchesSelectedAnimation\(entry,\s*animation\)/);
  assert.match(appJs, /runtimeEffectEntryStartSeconds\(entry\) !== null/);
  assert.match(appJs, /runtimeEffectIsProjectile\(entry\) \|\| runtimeEffectIsProjectileImpact\(entry\)/);
  assert.match(appJs, /if \(runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)\) score \+= 18;/);
  assert.match(appJs, /if \(!allowedKeys\.size\) score \+= 30;/);
  assert.match(appJs, /function runtimeEffectLimitedPreviewEntries\(entries,\s*animation = selectedAnimation\(\)\)/);
  assert.match(appJs, /runtimeEffectPreviewEntryPriority\(left\.entry,\s*animation\) - runtimeEffectPreviewEntryPriority\(right\.entry,\s*animation\)/);
  assert.match(appJs, /\.slice\(0,\s*RUNTIME_EFFECT_PREVIEW_LIMIT\)/);
});

test("viewer suppresses weak duplicate projectile context bindings when a strong runtime emitter exists", () => {
  const ringoProjectileRows = cff0EffectInstanceGraph.items.filter((row) => {
    const resources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || [])];
    const targets = [...(row.resolvedBindingTargets || []), ...(row.targetBindTokens || []), ...(row.runtimeBindTokens || [])];
    const actions = [...(row.resolvedActionKeys || []), ...(row.nativeActionKeys || [])];
    return (
      row.ownerLabel === "Ringo_DefaultSkin" &&
      resources.includes("Effects/Ringo/S1/Ringo__S1__B_Projectile.assetbundle/Ringo__S1__B_Projectile.pfx") &&
      actions.includes("ability02") &&
      targets.some((target) => ["rHand_bnd", "spineC", "Bone_CenterMass", "Bone_RightHand_Aura"].includes(target))
    );
  });

  assert.ok(ringoProjectileRows.length > 0, "expected duplicated CFF0 projectile rows with strong and context bindings");
  assert.match(appJs, /function runtimeEffectWeakProjectileContextBinding\(entry\)/);
  assert.match(appJs, /Bone_CenterMass\|spineC\|center/i);
  assert.match(appJs, /function runtimeEffectStrongProjectileEmitterBinding\(entry\)/);
  assert.match(appJs, /function runtimeEffectProjectileDedupeKey\(entry\)/);
  assert.match(appJs, /function runtimeEffectDedupePreviewEntries\(entries\)/);
  assert.match(appJs, /if \(strongProjectileKeys\.has\(key\) && runtimeEffectWeakProjectileContextBinding\(entry\)\) continue;/);
  assert.match(appJs, /runtimeEffectLimitedPreviewEntries\(runtimeEffectDedupePreviewEntries\(entries\),\s*animation\)/);
}
);

test("viewer collapses duplicate CFF0 effect instances that resolve to the same runtime render evidence", () => {
  const catherineDuplicateRows = cff0EffectInstanceGraph.items.filter((row) => {
    const resources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || []), ...(row.runtimeResources || [])];
    const starts = (row.resolvedStartSeconds || row.startSeconds || []).map(Number).filter(Number.isFinite);
    return (
      row.effectToken === "Effect_Catherine_Attack_HitImpact" &&
      resources.includes("Effects/Catherine/Catherine_AA/Catherine_AA.pfx") &&
      starts.includes(0)
    );
  });

  assert.ok(catherineDuplicateRows.length > 50, "expected duplicated CFF0 rows for the same Catherine attack effect");
  assert.match(appJs, /function runtimeEffectCff0DedupeKey\(entry\)/);
  assert.match(appJs, /const cff0Keys = new Set\(\);/);
  assert.match(appJs, /if \(entry\.sourceKind === "cff0-effect-instance"\) \{/);
  assert.match(appJs, /const cff0Key = runtimeEffectCff0DedupeKey\(entry\);/);
  assert.match(appJs, /if \(cff0Keys\.has\(cff0Key\)\) continue;/);
  assert.match(appJs, /cff0Keys\.add\(cff0Key\);/);
  assert.match(appJs, /runtimeEffectLimitedPreviewEntries\(runtimeEffectDedupePreviewEntries\(entries\),\s*animation\)/);
});

test("viewer prefers native-bound effect previews over weaker CFF0 duplicates", () => {
  const sawMuzzleRows = cff0EffectInstanceGraph.items.filter((row) => {
    const resources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || []), ...(row.runtimeResources || [])];
    const starts = (row.resolvedStartSeconds || row.startSeconds || []).map(Number).filter(Number.isFinite);
    return (
      row.effectToken === "Effect_SAW_MuzzleFlash3" &&
      resources.includes("Effects/SAW/SAW_MF.assetbundle/SAW_MF.pfx") &&
      starts.includes(0)
    );
  });

  assert.ok(sawMuzzleRows.length > 0, "expected SAW muzzle flash CFF0 fallback rows");
  const kineticLaserRows = cff0EffectInstanceGraph.items.filter((row) => {
    const resources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || []), ...(row.runtimeResources || [])];
    const starts = (row.resolvedStartSeconds || row.startSeconds || []).map(Number).filter(Number.isFinite);
    const actionKeys = [...(row.resolvedActionKeys || []), ...(row.projectileActionKeys || []), ...(row.nativeActionKeys || [])];
    return (
      row.ownerLabel === "Kinetic_Skin_Valkyrie" &&
      row.effectToken === "Effect_Kinetic_C_Target_Laser" &&
      resources.includes("Effects/Hero048/S2/Hero048_S2_C_Laser/Hero048_S2_C_Laser.pfx") &&
      actionKeys.includes("ability03") &&
      starts.includes(0)
    );
  });
  assert.ok(kineticLaserRows.length > 0, "expected Kinetic laser CFF0 fallback rows that duplicate native visual binding");
  assert.match(appJs, /function runtimeEffectNativeBoundDedupeKey\(entry\)/);
  assert.match(appJs, /function runtimeEffectNativeBoundDedupeKeys\(entry\)/);
  assert.match(appJs, /const actionKeys = \[\.\.\.runtimeEffectInferredActionKeys\(entry\)\]\.sort\(\);/);
  assert.match(appJs, /return expandedActionKeys\.map/);
  assert.match(appJs, /const nativeBoundKeys = new Set\(\);/);
  assert.match(appJs, /for \(const nativeKey of runtimeEffectNativeBoundDedupeKeys\(entry\)\)/);
  assert.match(appJs, /entry\.sourceKind === "cff0-effect-instance"/);
  assert.match(appJs, /runtimeEffectNativeBoundDedupeKeys\(entry\)\.some\(\(nativeKey\) => nativeBoundKeys\.has\(nativeKey\)\)/);
});

test("viewer suppresses CFF0 impact previews that only have weak self-body binding evidence", () => {
  const weakSelfImpactRows = cff0EffectInstanceGraph.items.filter((row) => {
    const resources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || []), ...(row.runtimeResources || [])];
    const starts = [...(row.resolvedStartSeconds || []), ...(row.nativeRuntimeStartSeconds || [])].map(Number).filter(Number.isFinite);
    const targets = [
      ...(row.resolvedBindingTargets || []),
      ...(row.targetBindTokens || []),
      ...(row.runtimeBindTokens || []),
      ...(row.targetBones || []),
      ...(row.runtimeBones || []),
    ];
    return (
      row.effectToken === "Effect_Catherine_Attack_HitImpact" &&
      resources.includes("Effects/Catherine/Catherine_AA/Catherine_AA.pfx") &&
      starts.includes(0) &&
      targets.some((target) => /headA_bnd|spineC_bnd|Bone_Head|Bone_CenterMass/.test(target)) &&
      !(row.projectileBoneTokens || []).length &&
      !(row.projectileEmitterLabels || []).length
    );
  });

  assert.ok(weakSelfImpactRows.length > 0, "expected Catherine attack impact rows with only self-body binding context");
  assert.match(appJs, /function runtimeEffectWeakSelfImpactBinding\(entry\)/);
  assert.match(appJs, /entry\?\.sourceKind !== "cff0-effect-instance"/);
  assert.match(appJs, /entry\?\.projectile \|\| entry\?\.projectileSourceEntry/);
  assert.match(appJs, /headA|spineC|Bone_CenterMass|Bone_Head|center/i);
  assert.match(appJs, /if \(runtimeEffectWeakSelfImpactBinding\(entry\)\) return "weak-self-impact-binding";/);
  assert.match(appJs, /return !runtimeEffectSpatialBlockReason\(entry\);/);
});

test("viewer reports indexed pfx effect diagnostics when native hooks are missing", () => {
  assert.match(appJs, /function runtimeEffectAllPfxItemsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /const hookPfxItems = runtimeEffectPfxItemsForHooks\(hooks,\s*item\);/);
  assert.match(appJs, /const definitionProjectilePfxItems = runtimeEffectDefinitionProjectilePfxItemsForItem\(item\);/);
  assert.match(appJs, /const definitionNeighborhoodPfxItems = runtimeEffectDefinitionNeighborhoodPfxItemsForItem\(item\);/);
  assert.match(appJs, /const fallbackPfxItems = runtimeEffectFallbackPfxItemsForItem\(item\);/);
  assert.match(
    appJs,
    /return uniqueRuntimeEffectPfxItems\(\[\.\.\.hookPfxItems,\s*\.\.\.definitionProjectilePfxItems,\s*\.\.\.definitionNeighborhoodPfxItems,\s*\.\.\.fallbackPfxItems\]\);/,
  );
  assert.match(appJs, /if \(!hooks\.length && !pfxItems\.length && !definitionNeighborhoodRows\.length && !cff0EffectRows\.length\) return "";/);
  assert.match(appJs, /native hook 缺失，仅诊断索引 PFX/);
  assert.match(appJs, /`\$\{definitionNeighborhoodRows\.length\} 候选`/);
  assert.match(appJs, /if \(!hooks\.length && !pfxItems\.length && !definitionNeighborhoodRows\.length && !cff0EffectRows\.length\) \{/);
});

test("viewer picks hook-linked pfx resources for the current skin before rendering", () => {
  assert.match(appJs, /function runtimeEffectPfxCandidatesForHook\(hook,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectBestPfxItemsForHook\(hook, item = activeManifestItem\)/);
  assert.match(appJs, /const skinAliasScopedCandidates = runtimeEffectSkinAliasScopedPfxItems\(candidates,\s*hook\?\.effectToken \|\| hook\?\.token,\s*item,\s*hook\);/);
  assert.match(appJs, /const candidatesToScore = skinAliasScopedCandidates \?\? candidates;/);
  assert.match(appJs, /const scored = candidatesToScore[\s\S]*?runtimeEffectPfxVariantScore\(pfxItem,\s*item\)/);
  assert.doesNotMatch(appJs, /const unskinnedBest = best\.filter\(\(entry\) => !runtimeEffectPathLooksSkinnedVariant\(entry\.pfxItem\.relativePath\)\);/);
  assert.match(appJs, /runtimeEffectPfxItemsForHooks\(runtimeEffectHooksForItem\(item\),\s*item\)/);
  assert.match(appJs, /runtimeEffectPfxItemsForHooks\(\[hook\],\s*item\)/);
});

test("viewer preserves strong skin-alias pfx resources when alias path scoping is inconclusive", () => {
  const bladeHook = effectHookRuntimeManifest.items.find(
    (item) =>
      item.effectToken === "Effect_Alpha_Blade" &&
      item.resourceEvidenceSource === "cff0-skin-effect-alias" &&
      item.aliasEvidenceStrength === "strong" &&
      item.resourcePaths?.includes("Effects/Hero024/S1T1/Hero024_S1T1_Blade/Hero024_S1T1_Blade.pfx"),
  );
  assert.ok(bladeHook, "expected a strong CFF0 skin alias hook for Alpha blade");

  assert.match(appJs, /function runtimeEffectHookHasStrongSkinAliasResourceEvidence\(hook\)/);
  assert.match(appJs, /hook\?\.resourceEvidenceSource === "cff0-skin-effect-alias"/);
  assert.match(appJs, /hook\?\.aliasEvidenceStrength === "strong"/);
  assert.match(appJs, /const scopedCandidates = \(pfxItems \|\| \[\]\)\.filter/);
  assert.match(appJs, /if \(scopedCandidates\.length \|\| !runtimeEffectHookHasStrongSkinAliasResourceEvidence\(hook\)\) return scopedCandidates;/);
  assert.match(appJs, /return pfxItems \|\| \[\];/);
});

test("viewer scopes skin pfx through reverse-engineered skin effect aliases before rendering", () => {
  const summerAttackAlias = runtimeSkinEffectAliases.items.find(
    (row) =>
      row.modelLabel === "Catherine_Skin_Summer" &&
      row.sourceEffectToken === "Effect_Catherine_Attack_HitImpact" &&
      row.skinEffectToken === "Effect_Catherine_SUM_Attack_HitImpact",
  );
  assert.ok(summerAttackAlias, "expected Catherine summer attack effect alias evidence");

  const catherineAttackPfx = effectPfxManifest.items
    .filter((item) => (item.hookEffectTokens || []).includes("Effect_Catherine_Attack_HitImpact"))
    .map((item) => item.relativePath)
    .sort();
  assert.deepEqual(catherineAttackPfx, [
    "Effects/Catherine/Catherine_AA/Catherine_AA.pfx",
    "Effects/Catherine/ICE/Catherine__ICE__AA.assetbundle/Catherine__ICE__AA.pfx",
    "Effects/Catherine/S1/Catherine__S1__AA.assetbundle/Catherine__S1__AA.pfx",
    "Effects/Catherine/S2/Catherine_S2_AA/Catherine_S2_AA.pfx",
    "Effects/Catherine/SUM/Catherine_SUM_AA/Catherine_SUM_AA.pfx",
  ]);

  const mixedCff0Row = cff0EffectInstanceGraph.items.find(
    (row) =>
      row.effectToken === "Effect_Catherine_Attack_HitImpact" &&
      (row.resolvedResourcePaths || []).includes("Effects/Catherine/SUM/Catherine_SUM_AA/Catherine_SUM_AA.pfx") &&
      (row.resolvedResourcePaths || []).includes("Effects/Catherine/ICE/Catherine__ICE__AA.assetbundle/Catherine__ICE__AA.pfx"),
  );
  assert.ok(mixedCff0Row, "fixture should contain mixed skin CFF0 resource candidates");

  assert.match(appJs, /fetchJson\("\.\/runtime-skin-effect-aliases\.json"\)/);
  assert.match(appJs, /let runtimeSkinEffectAliasesByModelLabel = new Map\(\);/);
  assert.match(appJs, /function buildRuntimeSkinEffectAliasLookup\(items\)/);
  assert.match(appJs, /function runtimeEffectSkinAliasRowsForEffectToken\(effectToken,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectPfxPathMatchesSkinEffectAlias\(relativePath,\s*alias\)/);
  assert.match(appJs, /function runtimeEffectPfxResourceAllowedBySkinEffectEvidence\(resourcePath,\s*effectToken,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectCff0ResourcePaths\(row,\s*item = activeManifestItem\)/);
  assert.match(
    appJs,
    /runtimeEffectPfxResourceAllowedBySkinEffectEvidence\(resourcePath,\s*row\?\.effectToken,\s*item\)/,
  );
});

test("viewer keeps active manifest item parameter accessible while resolving hook pfx candidates", () => {
  const functionBody = appJs.match(/function runtimeEffectPfxCandidatesForHook\(hook,\s*item = activeManifestItem\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(functionBody, /runtimeEffectResourcePathMatchesActiveSkin\(hook,\s*resourcePath,\s*item\)/);
  assert.doesNotMatch(functionBody, /const item = runtimeEffectPfxByPath\.get\(resourcePath\);/);
  assert.match(functionBody, /const pfxItem = runtimeEffectPfxByPath\.get\(resourcePath\);/);
});

test("viewer keeps weak effect resource candidates as diagnostics instead of rendering guessed pfx", () => {
  assert.match(appJs, /function runtimeEffectHookHasRenderableResourceEvidence\(hook\)/);
  assert.match(appJs, /hook\?\.resourceEvidenceSource === "effect-resource-candidate"/);
  assert.match(appJs, /hook\?\.aliasEvidenceStrength === "weak"/);
  assert.match(appJs, /if \(!runtimeEffectHookHasRenderableResourceEvidence\(hook\)\) return \[\];/);
});

test("viewer does not auto-render state-gated effect hooks without action evidence", () => {
  assert.match(appJs, /function runtimeEffectRequiresStateGate\(entry\)/);
  assert.match(appJs, /entry\?\.hook\?\.visibility\?\.buffTokens/);
  assert.match(appJs, /entry\?\.hook\?\.visibility\?\.setsVisibleOrActive/);
  assert.match(appJs, /entry\?\.hook\?\.visibility\?\.setsEffectOption/);
  assert.match(appJs, /if \(runtimeEffectRequiresStateGate\(entry\) && !allowedKeys\.size\) return false;/);
});

test("viewer separates indexed projectile pfx diagnostics from guessed rendering", () => {
  assert.match(appJs, /function runtimeEffectPfxLooksProjectile\(pfxItem\)/);
  assert.match(appJs, /proj\|projectile\|missile\|bullet\|shot\|bolt\|rocket\|cannon\|shell\|grenade\|arrow\|dart\|mortar\|orb\|fireball\|flare\|ray\|beam\|laser/);
  assert.match(appJs, /function runtimeEffectProjectilePfxItemsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectFallbackPfxItemsForItem\(item\)\.filter\(runtimeEffectPfxLooksProjectile\)/);
  assert.match(appJs, /projectilePfxItems/);
  assert.match(appJs, /个索引 projectile PFX（无发射链路）/);
  assert.doesNotMatch(appJs, /个 projectile PFX 待接入发射链路/);
  assert.match(appJs, /const ENABLE_INDEXED_PFX_EFFECT_PREVIEW = false;/);
});

test("viewer renders hook-linked projectile effects as local traveling previews", () => {
  assert.match(appJs, /function runtimeEffectIsProjectile\(entry\)/);
  assert.match(appJs, /return runtimeEffectPreviewRole\(entry\) === "projectile";/);
  assert.match(appJs, /function runtimeEffectProjectileProgress\(entry,\s*elapsedSeconds\)/);
  assert.match(appJs, /function updateRuntimeEffectProjectileMotion\(preview,\s*elapsedSeconds\)/);
  assert.match(appJs, /preview\.userData\.projectile = runtimeEffectIsProjectile\(entry\);/);
  assert.match(appJs, /preview\.userData\.projectileOrigin = new THREE\.Vector3\(\);/);
  assert.match(appJs, /if \(preview\.userData\.projectile\) updateRuntimeEffectProjectileMotion\(preview,\s*elapsedSeconds\);/);
  assert.match(appJs, /runtimeEffectProjectileProgress\(preview\.userData\.entry,\s*elapsedSeconds\)/);
  assert.match(appJs, /preview\.position\.copy\(preview\.userData\.projectileOrigin\)/);
  assert.match(appJs, /activeObject\.worldToLocal\(worldPosition\);/);
  assert.match(appJs, /if \(runtimeEffectIsProjectile\(entry\)\)/);
});

test("viewer uses native runtime projectile timing instead of fixed projectile windows when available", () => {
  assert.match(appJs, /runtimeStartSeconds: Number\.isFinite\(runtimeStartSeconds\) \? runtimeStartSeconds : null/);
  assert.match(appJs, /timelineTimes: runtimeManifestNumericListValues\(item\.nativeTimelineTimes\)/);
  assert.match(appJs, /pairedImpactResourcePaths: runtimeManifestListValues\(item\.pairedImpactResourcePaths\)/);
  assert.match(appJs, /function runtimeEffectImpactStartSecondsForProjectileEntry\(projectileEntry\)/);
  assert.match(appJs, /Math\.max\(\.\.\.timelineTimes\)/);
  assert.match(appJs, /startSeconds: projectile\.runtimeBinding\?\.startSeconds/);
  assert.match(appJs, /timelineTimes: projectile\.runtimeBinding\?\.timelineTimes \|\| \[\]/);
  assert.match(appJs, /function runtimeEffectEntryStartSeconds\(entry\)/);
  assert.match(appJs, /entry\?\.hook\?\.runtimeBinding\?\.startSeconds/);
  assert.match(appJs, /function runtimeEffectNativeTimelineActivity\(entry\)/);
  assert.match(appJs, /const nativeTimelineActivity = runtimeEffectNativeTimelineActivity\(entry\);/);
  assert.match(appJs, /if \(nativeTimelineActivity\) return nativeTimelineActivity;/);
  assert.match(appJs, /const nativeStartSeconds = runtimeEffectEntryStartSeconds\(entry\);/);
  assert.match(appJs, /manualAnimationTime - nativeStartSeconds/);
});

test("viewer keeps sustain effects active when native timing has a start but no explicit lifetime", () => {
  const armAura = (effectPfxManifest.items || []).find((item) =>
    item.relativePath === "Effects/Ringo/S1/Ringo__S1__B_ArmAura.assetbundle/Ringo__S1__B_ArmAura.pfx"
  );
  assert.ok(armAura, "expected Ringo arm aura PFX in manifest");
  assert.ok(
    (armAura.surfaceRecords || []).every((record) => record.runtimeHints?.durationSeconds === undefined),
    "Ringo arm aura surfaces should not declare a finite PFX duration",
  );
  assert.ok(
    (armAura.hookBindingProfiles || []).some((profile) => profile.effectToken === "Effect_Ringo_Ability02_ArmAura" && profile.startSeconds === 0),
    "Ringo arm aura should have native start evidence",
  );

  assert.match(appJs, /function runtimeEffectHasExplicitLifetime\(entry\)/);
  assert.match(appJs, /runtimeEffectNativeTimelineSpanSeconds\(entry\) !== null/);
  assert.match(appJs, /runtimeEffectNativeFadeSeconds\(entry\) !== null/);
  assert.match(appJs, /runtimeEffectTimelineWindow\(entry\) !== null/);
  assert.match(appJs, /if \(role === "sustain" && !runtimeEffectHasExplicitLifetime\(entry\)\) \{/);
  assert.match(appJs, /return \{ opacity: localSeconds >= 0 \? 1 : 0,\s*scale: 1 \};/);
});

test("viewer derives projectile and impact lifetime from native projectile timeline spans", () => {
  assert.match(appJs, /function runtimeEffectNativeTimelineTimes\(entry\)/);
  assert.match(appJs, /\.\.\.\(entry\?\.hook\?\.runtimeBinding\?\.timelineTimes \|\| \[\]\)/);
  assert.match(appJs, /\.\.\.\(entry\?\.projectile\?\.runtimeBinding\?\.timelineTimes \|\| \[\]\)/);
  assert.match(appJs, /function runtimeEffectNativeTimelineSpanSeconds\(entry\)/);
  assert.match(appJs, /Math\.max\(\.\.\.timelineTimes\) - Math\.min\(\.\.\.timelineTimes\)/);
  assert.match(appJs, /if \(\(role === "projectile" \|\| role === "impact"\) && nativeTimelineSpan !== null\)/);
  assert.match(appJs, /return Math\.max\(0\.08,\s*nativeTimelineSpan\);/);
});

test("viewer treats negative native timeline values as sentinels instead of zero-second timing", () => {
  const negativeRuntimeStarts = JSON.stringify(effectHookRuntimeManifest).match(/"startSeconds":\s*-1/);
  const negativeTimelineProfiles = (effectPfxManifest.items || []).flatMap((item) =>
    (item.hookBindingProfiles || [])
      .filter((profile) => (profile.timelineTimes || []).some((value) => Number(value) < 0))
      .map((profile) => ({ item, profile })),
  );

  assert.ok(negativeRuntimeStarts, "expected native runtime start sentinels in hook manifest");
  assert.ok(negativeTimelineProfiles.length > 0, "expected PFX binding profiles with -1 native timeline sentinels");
  assert.match(appJs, /function runtimeEffectEntryStartSeconds\(entry\)/);
  assert.match(appJs, /if \(Number\.isFinite\(value\) && value >= 0\) return value;/);
  assert.doesNotMatch(appJs, /return Math\.max\(0,\s*value\);/);
  assert.match(appJs, /function runtimeEffectNativeTimelineTimes\(entry\)/);
  assert.match(appJs, /\.filter\(\(value\) => Number\.isFinite\(value\) && value >= 0\)/);
  assert.doesNotMatch(appJs, /\.map\(\(value\) => Math\.max\(0,\s*value\)\)/);
});

test("viewer does not let PFX profile defaults override negative native hook timing sentinels", () => {
  const pfxByPath = new Map((effectPfxManifest.items || []).map((item) => [item.relativePath, item]));
  const sentinelProfileConflicts = [];
  for (const hook of effectHookRuntimeManifest.items || []) {
    const hookStart = Number(hook.runtimeBinding?.startSeconds);
    const hookHasNegativeTimeline = (hook.runtimeBinding?.timelineTimes || []).some((value) => Number(value) < 0);
    if (!(hookStart < 0 || hookHasNegativeTimeline)) continue;
    for (const resourcePath of hook.resourcePaths || []) {
      const pfxItem = pfxByPath.get(resourcePath);
      if (!pfxItem) continue;
      for (const profile of pfxItem.hookBindingProfiles || []) {
        const sameEffect = profile.effectToken === hook.effectToken || profile.token === hook.effectToken || profile.token === hook.token;
        if (!sameEffect) continue;
        const profileHasNonNegativeTiming =
          Number(profile.startSeconds) >= 0 || (profile.timelineTimes || []).some((value) => Number(value) >= 0);
        if (profileHasNonNegativeTiming) sentinelProfileConflicts.push({ hook, profile, resourcePath });
      }
    }
  }

  assert.ok(sentinelProfileConflicts.length > 0, "expected PFX profiles that default native -1 timing back to 0");
  assert.match(appJs, /function runtimeEffectBindingHasNegativeTimingSentinel\(binding\)/);
  assert.match(appJs, /function runtimeEffectPrimaryHookHasTimingSentinel\(entry\)/);
  assert.match(appJs, /function runtimeEffectProjectileSourceHookHasTimingSentinel\(entry\)/);
  assert.match(appJs, /const includePfxProfileTiming = !runtimeEffectPrimaryHookHasTimingSentinel\(entry\);/);
  assert.match(appJs, /const includeProjectileSourcePfxTiming = !runtimeEffectProjectileSourceHookHasTimingSentinel\(entry\);/);
  assert.match(appJs, /\.\.\.\(includePfxProfileTiming \? \[entry\?\.pfxBindingProfile\?\.startSeconds\] : \[\]\)/);
  assert.match(
    appJs,
    /\.\.\.\(includeProjectileSourcePfxTiming \? \[entry\?\.projectileSourceEntry\?\.pfxBindingProfile\?\.startSeconds\] : \[\]\)/,
  );
  assert.match(appJs, /\.\.\.\(includePfxProfileTiming \? entry\?\.pfxBindingProfile\?\.timelineTimes \|\| \[\] : \[\]\)/);
  assert.match(
    appJs,
    /\.\.\.\(includeProjectileSourcePfxTiming \? entry\?\.projectileSourceEntry\?\.pfxBindingProfile\?\.timelineTimes \|\| \[\] : \[\]\)/,
  );
});

test("viewer does not render sustain effects that only have negative native timing sentinels", () => {
  const jouleSentinelHooks = (effectHookRuntimeManifest.items || []).filter((hook) => {
    const resources = hook.resourcePaths || [];
    return (
      hook.effectToken === "Effect_Joule_Buttjet" &&
      resources.includes("Effects/Joule/Joule_ButtJet.assetbundle/Joule_ButtJet.pfx") &&
      Number(hook.runtimeBinding?.startSeconds) < 0 &&
      (hook.runtimeBinding?.timelineTimes || []).some((value) => Number(value) < 0)
    );
  });
  const jouleButtJetPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Joule/Joule_ButtJet.assetbundle/Joule_ButtJet.pfx",
  );

  assert.ok(jouleSentinelHooks.length > 0, "expected Joule ButtJet native hooks to use negative timing sentinels");
  assert.ok(
    (jouleButtJetPfx?.hookBindingProfiles || []).some(
      (profile) => profile.effectToken === "Effect_Joule_Buttjet" && Number(profile.startSeconds) === 0,
    ),
    "expected Joule ButtJet PFX profile to contain the legacy default 0 timing",
  );
  assert.match(appJs, /function runtimeEffectTimingSentinelRequiresTimelineEvidence\(entry\)/);
  assert.match(appJs, /runtimeEffectPrimaryHookHasTimingSentinel\(entry\)/);
  assert.match(appJs, /runtimeEffectProjectileSourceHookHasTimingSentinel\(entry\)/);
  assert.match(appJs, /if \(runtimeEffectTimingSentinelRequiresTimelineEvidence\(entry\) && !runtimeEffectHasTimelineEvidence\(entry\)\) return false;/);
  assert.match(appJs, /function runtimeEffectHasRequiredTimelineEvidence\(entry\)/);
});

test("viewer infers ability action keys from native ability hook S-slot effect paths", () => {
  const jouleHeadBuffHook = (effectHookRuntimeManifest.items || []).find(
    (hook) =>
      hook.effectToken === "Effect_Joule_HeadBuff" &&
      (hook.nativeSemanticCalls || []).includes("ability-effect-bone-hook") &&
      !(hook.actionKeys || []).length,
  );
  const jouleHeadBuffPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Joule/S2/Joule_S2_Headbuff/Joule_S2_Headbuff.pfx",
  );

  assert.ok(jouleHeadBuffHook, "expected Joule HeadBuff native ability hook without explicit action keys");
  assert.ok(jouleHeadBuffPfx, "expected Joule S2 Headbuff PFX fixture");
  assert.match(jouleHeadBuffPfx.relativePath, /\/S2\/|_S2_/);
  assert.match(appJs, /function runtimeEffectSemanticAbilityPathActionKey\(entry\)/);
  assert.match(appJs, /entry\?\.hook\?\.nativeSemanticCalls \|\| \[\]/);
  assert.match(appJs, /ability-effect-bone-hook/);
  assert.match(appJs, /entry\?\.pfxItem\?\.relativePath/);
  assert.match(appJs, /runtimeEffectAbilityKeyForSlot\(Number\(match\[1\]\) - 1\)/);
  assert.match(appJs, /const semanticPathActionKey = runtimeEffectSemanticAbilityPathActionKey\(entry\);/);
  assert.match(appJs, /if \(semanticPathActionKey\) keys\.add\(semanticPathActionKey\);/);
});

test("viewer renders paired projectile impacts at the projectile endpoint", () => {
  assert.match(appJs, /function runtimeEffectImpactEntriesForProjectile\(projectileEntry,\s*item = activeManifestItem\)/);
  assert.match(appJs, /projectile\.pairedImpactResourcePaths \|\| \[\]/);
  assert.match(appJs, /projectileSourceEntry: projectileEntry/);
  assert.match(appJs, /if \(projectile\.role === "impact" && pairedImpactResourcePaths\.has\(projectile\.resourcePath\)\) continue;/);
  assert.match(appJs, /function runtimeEffectIsProjectileImpact\(entry\)/);
  assert.match(appJs, /return Boolean\(entry\?\.projectileSourceEntry\) && runtimeEffectPreviewRole\(entry\) === "impact";/);
  assert.match(appJs, /preview\.userData\.projectileImpact = runtimeEffectIsProjectileImpact\(entry\);/);
  assert.match(appJs, /if \(preview\.userData\.projectileImpact\) updateRuntimeEffectProjectileImpactMotion\(preview,\s*elapsedSeconds\);/);
  assert.match(appJs, /function updateRuntimeEffectProjectileImpactMotion\(preview,\s*elapsedSeconds\)/);
  assert.match(appJs, /const sourceEntry = preview\.userData\.entry\.projectileSourceEntry \|\| preview\.userData\.entry;/);
  assert.match(appJs, /runtimeEffectProjectileTravelDistance\(sourceEntry\)/);
});

test("viewer derives projectile impact entries from native nearby impact hooks", () => {
  const projectileRuntime = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-manifest.json"), "utf8"));
  const projectileRows = projectileRuntime.items || [];
  const ringoShot = projectileRows.find(
    (row) =>
      row.modelLabel === "Ringo_DefaultSkin" &&
      row.resourcePath === "Effects/Ringo/ability01/RingoAbility01Shot.assetbundle/RingoAbility01Shot.pfx",
  );
  assert.ok(ringoShot, "expected Ringo ability01 projectile runtime row");
  assert.equal(String(ringoShot.pairedImpactResourcePaths || ""), "");

  const hookRows = Array.isArray(effectHookRuntimeManifest) ? effectHookRuntimeManifest : effectHookRuntimeManifest.items || [];
  assert.ok(
    hookRows.some(
      (row) =>
        row.effectToken === "Effect_Ringo_Ability01_Impact" &&
        (row.nativeNearbyEffectTokens || []).includes("Effect_Ringo_Ability01_Shot") &&
        (row.resourcePaths || []).includes("Effects/Ringo/ability01/RingoAbility01Impact.assetbundle/RingoAbility01Impact.pfx"),
    ),
    "expected Ringo impact hook to point back to the projectile token",
  );

  assert.match(appJs, /function runtimeEffectRelatedImpactHooksForProjectile\(projectileEntry,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectProjectileEntryEffectTokens\(projectileEntry\)/);
  assert.match(appJs, /hook\.nativeNearbyEffectTokens \|\| \[\]/);
  assert.match(appJs, /runtimeEffectPathLooksImpactResource\(resourcePath\)/);
  assert.match(appJs, /sourceKind: "native-projectile-related-impact-hook"/);
  assert.match(appJs, /projectileSourceEntry: projectileEntry/);
  assert.match(appJs, /runtimeEffectImpactEntriesForRelatedHooks\(projectileEntry,\s*item\)/);
});

test("viewer consumes definition-linked projectile resources separately from hook effects", () => {
  assert.match(appJs, /effect-projectile-definition-manifest\.json/);
  assert.match(appJs, /effect-projectile-runtime-manifest\.json/);
  assert.match(appJs, /let runtimeEffectDefinitionProjectilesByModelLabel = new Map\(\);/);
  assert.match(appJs, /let runtimeEffectProjectileRuntimeByModelLabel = new Map\(\);/);
  assert.match(appJs, /let runtimeEffectProjectileRuntimeLoaded = false;/);
  assert.match(appJs, /let runtimeEffectProjectileRuntimeSummary = null;/);
  assert.match(appJs, /let runtimeEffectProjectileGapSummary = null;/);
  assert.match(appJs, /function buildRuntimeEffectDefinitionProjectileLookup\(items\)/);
  assert.match(appJs, /function buildRuntimeEffectProjectileRuntimeLookup\(items\)/);
  assert.match(appJs, /function defaultRuntimeEffectModelLabel\(modelLabel\)/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectilesForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectProjectilesForItemFromLookup\(lookup,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectProjectileBindingStats\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectProjectileBindingHealthSummary\(\)/);
  assert.match(appJs, /summary\.nonRuntimeRows/);
  assert.match(appJs, /effect-library-only/);
  assert.match(appJs, /仅资源库/);
  assert.match(appJs, /if \(runtimeEffectProjectileRuntimeLoaded\)/);
  assert.match(appJs, /runtimeEffectProjectilesForItemFromLookup\(runtimeEffectProjectileRuntimeByModelLabel,\s*item\)/);
  assert.match(appJs, /runtimeEffectProjectileRuntimeManifest\.value\.summary/);
  assert.match(appJs, /runtimeEffectProjectileGapManifest\.value\.summary/);
  assert.match(appJs, /runtimeEffectProjectileRuntimeManifest\.value\.items \|\| \[\]/);
  assert.match(appJs, /弹道绑定：/);
  assert.match(appJs, /弹道 runtime 缺口：/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectilePfxItemsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectileEntriesForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /sourceKind: projectile\.sourceKind \|\| "definition-projectile-resource"/);
  assert.match(appJs, /actionKeys: projectile\.actionKeys \|\| \[\]/);
  assert.match(appJs, /for \(const entry of runtimeEffectDefinitionProjectileEntriesForItem\(item\)\)/);
  assert.match(appJs, /definitionProjectileItems/);
  assert.match(appJs, /个定义 projectile/);
});

test("viewer renders only projectile resources with recovered runtime binding evidence", () => {
  assert.match(appJs, /const RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES = new Set\(\[/);
  const boundProjectileStatusBlock = appJs.match(/const RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
  assert.match(appJs, /"native-emitter-slot"/);
  assert.match(appJs, /"native-nearby-bone"/);
  assert.match(appJs, /"native-emitter-semantic-slot"/);
  assert.match(boundProjectileStatusBlock, /"native-effect-hook"/);
  assert.match(appJs, /if \(!RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES\.has\(item\.bindingStatus\)\) continue;/);
  assert.match(appJs, /function normalizeRuntimeEffectProjectileRow\(item\)/);
  assert.match(appJs, /sourceKind: "runtime-projectile-binding"/);
  assert.match(appJs, /boneToken: item\.bindingBoneToken \|\| item\.boneToken \|\| ""/);
  assert.match(appJs, /nativeProjectileId: item\.nativeProjectileId \|\| ""/);
  assert.match(appJs, /projectile\?\.runtimeBinding\?\.kind === "bone"/);
  assert.match(appJs, /projectile\.runtimeBinding\.boneIndex/);
});

test("viewer gates definition projectile previews with manifest action keys", () => {
  assert.match(appJs, /if \(Array\.isArray\(entry\.actionKeys\)\)/);
  assert.match(appJs, /for \(const actionKey of entry\.actionKeys\) keys\.add\(actionKey\);/);
  assert.match(appJs, /if \(keys\.size\) return keys;/);
});

test("viewer uses recovered definition projectile bone hints before default weapon fallback", () => {
  assert.match(appJs, /function runtimeEffectDefinitionProjectileBindingTarget\(projectile,\s*item = activeManifestItem\)/);
  assert.match(appJs, /projectile\?\.boneToken/);
  assert.match(appJs, /slot\.slotName === projectile\.boneToken/);
  assert.match(appJs, /return \{ kind: "bone-name", boneIndex: null, boneToken: projectile\.boneToken \};/);
  assert.match(appJs, /runtimeEffectDefinitionProjectileBindingTarget\(projectile,\s*item\)/);
});

test("viewer uses native projectile emitter labels to anchor definition projectiles", () => {
  assert.match(appJs, /native-projectile-spawn-manifest\.json/);
  assert.match(appJs, /let runtimeNativeProjectilesByHero = new Map\(\);/);
  assert.match(appJs, /function buildRuntimeNativeProjectileLookup\(items\)/);
  assert.match(appJs, /function runtimeNativeHeroNamesForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeNativeProjectileRowsForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeDefinitionLabelsForSlot\(slot\)/);
  assert.match(appJs, /\[slot\?\.definitionLabels,\s*slot\?\.definitionLocatorLabels\]/);
  assert.match(appJs, /function runtimeNativeProjectileEmitterBindingTarget\(projectile,\s*item = activeManifestItem\)/);
  assert.match(appJs, /row\.emitterLabel/);
  assert.match(appJs, /definitionLabels\.has\(row\.emitterLabel\)/);
  assert.match(appJs, /runtimeNativeProjectileEmitterBindingTarget\(projectile,\s*item\)/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectileBindingTarget\(projectile,\s*item = activeManifestItem\)[\s\S]*runtimeNativeProjectileEmitterBindingTarget\(projectile,\s*item\)[\s\S]*runtimeEffectDefaultProjectileBindingTarget\(item\)/);
});

test("viewer falls back to native nearby bone tokens before default weapon projectile binding", () => {
  assert.match(appJs, /function runtimeNativeProjectileNearbyBoneBindingTarget\(projectile,\s*item = activeManifestItem\)/);
  assert.match(appJs, /row\.nearbyBoneTokens/);
  assert.match(appJs, /slot\.slotName === boneToken/);
  assert.match(appJs, /runtimeNativeProjectileEmitterSlotScore\(row,\s*slot\)/);
  assert.match(appJs, /runtimeNativeProjectileNearbyBoneBindingTarget\(projectile,\s*item\)/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectileBindingTarget\(projectile,\s*item = activeManifestItem\)[\s\S]*runtimeNativeProjectileEmitterBindingTarget\(projectile,\s*item\)[\s\S]*runtimeNativeProjectileNearbyBoneBindingTarget\(projectile,\s*item\)[\s\S]*runtimeEffectDefaultProjectileBindingTarget\(item\)/);
});

test("viewer uses high-confidence native emitter semantics before default weapon projectile binding", () => {
  assert.match(appJs, /function runtimeNativeProjectileSemanticEmitterBindingTarget\(projectile,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeNativeProjectileEmitterSlotScore\(row,\s*slot\) >= RUNTIME_NATIVE_PROJECTILE_SEMANTIC_SLOT_SCORE/);
  assert.match(appJs, /runtimeNativeProjectileSemanticEmitterBindingTarget\(projectile,\s*item\)/);
  assert.match(appJs, /function runtimeEffectDefinitionProjectileBindingTarget\(projectile,\s*item = activeManifestItem\)[\s\S]*runtimeNativeProjectileEmitterBindingTarget\(projectile,\s*item\)[\s\S]*runtimeNativeProjectileNearbyBoneBindingTarget\(projectile,\s*item\)[\s\S]*runtimeNativeProjectileSemanticEmitterBindingTarget\(projectile,\s*item\)[\s\S]*runtimeEffectDefaultProjectileBindingTarget\(item\)/);
});

test("viewer prioritizes tinted effect preview textures over raw noise maps", () => {
  assert.match(appJs, /function runtimeEffectPreviewTextureItems\(shadergraphItems,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /const score = \(item\.inlineColors\?\.length \? 0 : 2\) \+ \(item\.materialStatus === "tinted-texture" \? -1 : 0\);/);
  assert.match(appJs, /left\.order - right\.order \|\| left\.score - right\.score/);
  assert.match(appJs, /previewTextures: nativePrimitive \? \[\] : runtimeEffectPreviewTextureItems\(previewShadergraphItems,\s*pfxItem,\s*entryContext\)/);
});

test("viewer prefers effect-like shadergraph surfaces over baseColor cards for previews", () => {
  assert.match(appJs, /function runtimeEffectShadergraphLooksLikeEffectLayer\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /item\?\.previewBlendMode === "additive"/);
  assert.match(appJs, /item\?\.materialStatus === "tinted-texture"/);
  assert.match(appJs, /\(item\?\.roleNames \|\| \[\]\)\.includes\("emissive"\)/);
  assert.match(appJs, /function runtimeEffectShadergraphHasRenderableSurfaceEvidence\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectPreviewTextureUsableForSprite\(item\)/);
  assert.match(appJs, /item\?\.previewSurfaceRenderable !== false/);
  assert.match(appJs, /function runtimeEffectPreviewShadergraphItems\(shadergraphItems,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphLooksLikeEffectLayer\(shadergraphItem,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /const renderable = preferred\.filter\(\(shadergraphItem\) => runtimeEffectShadergraphHasRenderableSurfaceEvidence\(shadergraphItem,\s*pfxItem,\s*entry\)\);/);
  assert.match(appJs, /return renderable;/);
  assert.match(appJs, /function runtimeEffectPreviewHasRenderableMaterial\(shadergraphItems,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /const diagnostics = runtimeEffectPreviewCandidateDiagnostics\(\{ \.\.\.entryContext,\s*shadergraphItems,\s*previewShadergraphItems \},\s*animation\);/);
  assert.match(appJs, /if \(!diagnostics\.shouldPreview\) return null;/);
  assert.match(appJs, /const previewShadergraphItems = nativePrimitive[\s\S]*runtimeEffectPreviewShadergraphItems\(shadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /previewShadergraphItems,/);
  assert.match(appJs, /colors: nativePrimitive \? \[\] : runtimeEffectPreviewColors\(previewShadergraphItems\)/);
  assert.doesNotMatch(appJs, /colors: nativePrimitive[\s\S]*uniqueSorted\(previewShadergraphItems\.flatMap/);
  assert.match(appJs, /previewTextures: nativePrimitive \? \[\] : runtimeEffectPreviewTextureItems\(previewShadergraphItems,\s*pfxItem,\s*entryContext\)/);
  assert.match(appJs, /RUNTIME_EFFECT_SURFACE_REJECT_REASON_LABELS/);
  assert.match(appJs, /function runtimeEffectPreviewSurfaceRejectReasonCounts\(shadergraphItems\)/);
  assert.match(appJs, /卡片风险已拦截/);
});

test("viewer keeps generic effect-channel-only area surfaces diagnostic-only instead of rooting them as cards", () => {
  assert.match(appJs, /effectChannelFallback: true/);
  assert.match(appJs, /function runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)/);
  assert.match(appJs, /target\?\.effectChannelFallback/);
  assert.match(appJs, /runtimeEffectBindingTargetIsEffectChannelFallback\(entry\) && !runtimeEffectChannelFallbackAreaPreviewAllowed\(entry\) && role !== "sustain"/);
  assert.match(appJs, /return tokens\.includes\("effect-channel"\)\s*\?\s*\{ kind: "model-root", boneIndex: null, boneToken: "", effectChannelFallback: true/);
});

test("viewer keeps effect-channel fallback PFX closed until native channel capture is review-ready", () => {
  const captureGateSource = functionSource("runtimeEffectChannelFallbackCaptureReady");
  const fallbackPreviewSource = functionSource("runtimeEffectChannelFallbackPreviewAllowed");
  const areaFallbackPreviewSource = functionSource("runtimeEffectChannelFallbackAreaPreviewAllowed");

  assert.match(captureGateSource, /effectNativeChannelCaptureSummary\?\.readyForFullMappingReview === true/);
  assert.match(fallbackPreviewSource, /if \(!runtimeEffectChannelFallbackCaptureReady\(\)\) return false;/);
  assert.match(areaFallbackPreviewSource, /if \(!runtimeEffectChannelFallbackCaptureReady\(\)\) return false;/);
});

test("viewer allows effect-channel area surfaces only when PFX lifecycle and action evidence are present", () => {
  const adagioUltHook = (effectHookRuntimeManifest.items || []).find(
    (row) =>
      row.effectToken === "Effect_Adagio_Ult_Enemy" &&
      (row.actionKeys || []).includes("ability03") &&
      (row.resourcePaths || []).includes("Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.pfx"),
  );
  assert.ok(adagioUltHook, "expected Adagio ult enemy native hook fixture");

  const adagioUltPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.pfx",
  );
  assert.ok(adagioUltPfx, "expected Adagio ult enemy PFX fixture");
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const lifecycleAreaSurface = (adagioUltPfx.surfaceRecords || [])
    .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }))
    .find(
      ({ record, shadergraph }) =>
        record.prelude?.renderFamily === "area" &&
        record.runtimeHints?.durationSeconds === 4 &&
        record.runtimeHints?.delaySeconds === 1.6 &&
        shadergraph?.previewSurfaceRejectReason === "area-masked-base-card-risk" &&
        (shadergraph.roleNames || []).includes("alphaBlend") &&
        (shadergraph.roleNames || []).includes("alphaMask"),
    );
  assert.ok(lifecycleAreaSurface, "expected card-risk area surface with lifecycle evidence");

  assert.match(appJs, /function runtimeEffectChannelFallbackAreaPreviewAllowed\(entry\)/);
  const areaFallbackSource = functionSource("runtimeEffectChannelFallbackAreaPreviewAllowed");
  assert.match(areaFallbackSource, /runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)/);
  assert.match(areaFallbackSource, /runtimeEffectPreviewRole\(entry\) === "projectile"/);
  assert.match(areaFallbackSource, /runtimeEffectInferredActionKeys\(entry\)\.size/);
  assert.match(areaFallbackSource, /runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(areaFallbackSource, /runtimeEffectChannelFallbackAreaSurfaceEvidence\(entry\)/);
  const spatialSource = functionSource("runtimeEffectSpatialBlockReason");
  assert.match(spatialSource, /runtimeEffectChannelFallbackAreaPreviewAllowed\(entry\)/);
  assert.match(
    appJs,
    /function runtimeEffectShadergraphHasRuntimeBoundAreaEvidence\(item,\s*pfxItem,\s*entry = \{\}\)[\s\S]*!runtimeEffectEntryHasStrongSpatialEvidence\(entry\) && !runtimeEffectChannelFallbackAreaPreviewAllowed\(entry\)/,
  );
});

test("viewer keeps card-risk area surfaces diagnostic-only even when runtime lifecycle evidence exists", () => {
  const adagioUltPfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.pfx",
  );
  assert.ok(adagioUltPfx, "expected Adagio ult enemy PFX fixture");
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const cardRiskAreaSurface = (adagioUltPfx.surfaceRecords || [])
    .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }))
    .find(
      ({ record, shadergraph }) =>
        record.prelude?.renderFamily === "area" &&
        record.runtimeHints?.durationSeconds === 4 &&
        record.runtimeHints?.delaySeconds === 1.6 &&
        shadergraph?.previewSurfaceRejectReason === "area-masked-base-card-risk" &&
        shadergraph.previewSurfaceRenderable === false,
    );
  assert.ok(cardRiskAreaSurface, "expected runtime-linked area surface that the material classifier marks as card-risk");

  assert.match(appJs, /function runtimeEffectShadergraphSurfaceCardRiskBlocked\(item\)/);
  assert.match(appJs, /function runtimeEffectShadergraphSurfacePreviewAllowed\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  const areaFallbackMaterialSource = functionSource("runtimeEffectShadergraphHasRuntimeBoundAreaFallbackMaterialEvidence");
  assert.match(areaFallbackMaterialSource, /runtimeEffectShadergraphSurfaceCardRiskBlocked\(item\)/);
  const renderableSurfaceSource = functionSource("runtimeEffectShadergraphHasRenderableSurfaceEvidence");
  assert.match(renderableSurfaceSource, /runtimeEffectShadergraphSurfacePreviewAllowed\(item,\s*pfxItem,\s*entry\)/);
  assert.doesNotMatch(
    renderableSurfaceSource,
    /item\?\.previewSurfaceRenderable !== false \|\| runtimeEffectShadergraphHasRuntimeBoundAreaEvidence/,
  );
});

test("viewer keeps generic effect-channel fallback entries out of visible effect previews", () => {
  assert.match(appJs, /function runtimeEffectHasRequiredSpatialEvidence\(entry\)/);
  assert.match(
    appJs,
    /runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)[\s\S]*!runtimeEffectChannelFallbackPreviewAllowed\(entry\)[\s\S]*!runtimeEffectChannelFallbackAreaPreviewAllowed\(entry\)/,
  );
  assert.match(appJs, /if \(!runtimeEffectHasRequiredSpatialEvidence\(entry\)\) return false;/);
});

test("viewer allows strongly evidenced Kindred action-channel billboard effects without re-enabling generic root cards", () => {
  const kineticBRows = (effectHookRuntimeManifest.items || []).filter(
    (row) =>
      row.effectToken === "Effect_Kinetic_B" &&
      row.resourceMatchKind === "kindred-effect-slot-bare-action-channel" &&
      row.resourceEvidenceSource === "kindred-effect-resource-slot",
  );
  assert.ok(kineticBRows.length >= 1, "expected Kinetic B action-channel rows resolved through Kindred effect slots");
  assert.ok(
    kineticBRows.some((row) =>
      (row.resourcePaths || []).includes("Effects/Hero048/S2/Hero048_S2_B_Buff/Hero048_S2_B_Buff.pfx"),
    ),
    "expected Kinetic Valkyrie B buff PFX to be linked to the bare B action channel",
  );
  assert.ok(
    kineticBRows.some((row) =>
      (row.resourcePaths || []).includes("Effects/Hero048/S2/Hero048_S2_B_Dash/Hero048_S2_B_Dash.pfx"),
    ),
    "expected Kinetic Valkyrie B dash PFX to be linked to the bare B action channel",
  );

  assert.match(appJs, /function runtimeEffectKindredActionChannelEvidence\(entry\)/);
  assert.match(appJs, /resourceMatchKind === "kindred-effect-slot-bare-action-channel"/);
  assert.match(appJs, /resourceEvidenceSource === "kindred-effect-resource-slot"/);
  assert.match(appJs, /function runtimeEffectChannelFallbackPreviewAllowed\(entry\)/);
  assert.match(appJs, /runtimeEffectPreviewRole\(entry\) === "sustain"/);
  assert.match(appJs, /function runtimeEffectEntryHasBillboardSpatialEvidence\(entry\)/);
  const billboardSpatialSource = functionSource("runtimeEffectEntryHasBillboardSpatialEvidence");
  assert.match(billboardSpatialSource, /runtimeEffectEntryHasStrongSpatialEvidence\(entry\)/);
  assert.match(billboardSpatialSource, /runtimeEffectChannelFallbackPreviewAllowed\(entry\)/);
  assert.match(appJs, /function runtimeEffectHookAllowsMultipleBestPfxItems\(hook\)/);
  assert.match(appJs, /runtimeEffectHookAllowsMultipleBestPfxItems\(hook\) \? best\.map\(\(entry\) => entry\.pfxItem\) : \[best\[0\]\.pfxItem\]/);
});

test("viewer allows strongly-bound billboard alphaBlend runtime effects without re-enabling root cards", () => {
  assert.match(appJs, /function runtimeEffectEntryHasStrongSpatialEvidence\(entry\)/);
  assert.match(appJs, /if \(runtimeEffectBindingTargetIsEffectChannelFallback\(entry\)\) return false;/);
  assert.match(appJs, /return \["bone",\s*"bone-name",\s*"model-root-offset"\]\.includes\(kind\)/);
  assert.match(appJs, /function runtimeEffectEntryHasBillboardSpatialEvidence\(entry\)/);
  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence\(item,\s*pfxItem,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphRenderFamily\(pfxItem,\s*item\) !== "billboard"/);
  assert.match(appJs, /!runtimeEffectEntryHasBillboardSpatialEvidence\(entry\)/);
  assert.match(appJs, /\(item\?\.roleNames \|\| \[\]\)\.includes\("alphaBlend"\)/);
  assert.match(appJs, /item\?\.materialStatus !== "classified"/);
  assert.match(appJs, /runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence\(item,\s*pfxItem,\s*entry\)/);
  assert.doesNotMatch(appJs, /renderFamily === "area"[\s\S]*runtimeEffectShadergraphHasRuntimeBoundBillboardEvidence/);
});

test("viewer treats recovered projectile billboard pfx as renderable without opening generic root cards", () => {
  const projectileRuntime = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-manifest.json"), "utf8"));
  const skyeProjectile = (projectileRuntime.items || []).find(
    (row) =>
      row.modelLabel === "Skye_Skin_Exoframe" &&
      row.resourcePath === "Effects/Hero018/EXO/Hero018_EXO_A_Proj/Hero018_EXO_A_Proj.pfx" &&
      String(row.actionKeys || "").includes("ability01") &&
      String(row.effectTokens || "").includes("Effect_Skye_EXO_A_Proj"),
  );
  assert.ok(skyeProjectile, "expected Skye Exoframe ability01 projectile runtime evidence");

  const skyeCff0Rows = (cff0EffectInstanceGraph.items || []).filter(
    (row) =>
      row.ownerLabel === "Skye_Skin_Exoframe" &&
      row.effectToken === "Effect_Skye_EXO_A_Proj" &&
      (row.resolvedResourcePaths || []).includes("Effects/Hero018/EXO/Hero018_EXO_A_Proj/Hero018_EXO_A_Proj.pfx") &&
      (row.resolvedActionKeys || []).includes("ability01") &&
      (row.resolvedStartSeconds || []).includes("0") &&
      (row.resolvedBindingTargets || []).includes("effect-channel"),
  );
  assert.ok(skyeCff0Rows.length > 0, "expected CFF0 to recover Skye projectile action, timing, and channel binding");

  const projectilePfx = (effectPfxManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero018/EXO/Hero018_EXO_A_Proj/Hero018_EXO_A_Proj.pfx",
  );
  assert.ok(projectilePfx, "expected Skye Exoframe projectile PFX fixture");
  const billboardSurface = (projectilePfx.surfaceRecords || []).find((record) => record.prelude?.renderFamily === "billboard");
  assert.ok(billboardSurface, "expected a billboard projectile surface");
  const billboardShadergraph = (effectShadergraphManifest.items || []).find((item) => item.relativePath === billboardSurface.relativePath);
  assert.equal(billboardShadergraph?.previewSurfaceRenderable, true);
  assert.equal(billboardShadergraph?.previewTextureSpriteUsable, true);
  assert.ok((billboardShadergraph?.roleNames || []).includes("alphaBlend"));

  assert.match(appJs, /function runtimeEffectEntryHasProjectileBillboardSpatialEvidence\(entry\)/);
  const projectileBillboardSource = functionSource("runtimeEffectEntryHasProjectileBillboardSpatialEvidence");
  assert.match(appJs, /runtimeEffectPreviewRole\(entry\) !== "projectile"/);
  assert.match(appJs, /target\.kind !== "model-root"/);
  assert.match(appJs, /runtimeEffectInferredActionKeys\(entry\)\.size/);
  assert.match(appJs, /runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.match(appJs, /entry\?\.projectile/);
  const billboardSpatialSource = functionSource("runtimeEffectEntryHasBillboardSpatialEvidence");
  assert.match(billboardSpatialSource, /runtimeEffectEntryHasStrongSpatialEvidence\(entry\)/);
  assert.match(billboardSpatialSource, /runtimeEffectChannelFallbackPreviewAllowed\(entry\)/);
  assert.match(billboardSpatialSource, /runtimeEffectEntryHasProjectileBillboardSpatialEvidence\(entry\)/);
  assert.doesNotMatch(projectileBillboardSource, /renderFamily === "area"/);
});

test("viewer keeps unresolved UV runtime surfaces diagnostic-only unless pfx UV evidence exists", () => {
  assert.match(appJs, /function runtimeEffectShadergraphHasResolvedUvRuntime\(item\)/);
  assert.match(appJs, /function runtimeEffectShadergraphHasRuntimeUvEvidence\(item\)/);
  assert.match(appJs, /item\?\.previewUvRuntimeEvidence/);
  assert.match(appJs, /pfx-surface-vertex-color-parameters/);
  assert.match(appJs, /pfx-surface-uv-parameters/);
  assert.match(appJs, /if \(item\?\.previewUvAnimationGapReason\) return runtimeEffectShadergraphHasRuntimeUvEvidence\(item\);/);
  assert.match(appJs, /runtimeEffectShadergraphHasResolvedUvRuntime\(item\)[\s\S]*runtimeEffectPreviewTextureUsableForSprite\(item\)/);
  assert.match(appJs, /UV runtime 未解码/);
});

test("viewer animates only direct pfx uv parameter surfaces with a conservative runtime uv fallback", () => {
  const unresolvedDirectUvSurfaces = (effectShadergraphManifest.items || []).filter(
    (item) => item.previewUvAnimationGapReason && item.previewUvRuntimeEvidence?.kind === "pfx-surface-uv-parameters",
  );
  assert.equal(unresolvedDirectUvSurfaces.length, 0);

  const resolvedDirectUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Emotes/Emote_K/Emote_K.Surface[145].shadergraph",
  );
  assert.ok(resolvedDirectUvSurface, "expected direct PFX UV surface in shadergraph manifest");
  assert.equal(resolvedDirectUvSurface.previewUvAnimationGapReason, "");
  assert.equal(resolvedDirectUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-uv-parameters");
  assert.equal(resolvedDirectUvSurface.previewUvAnimation?.mode, "sampledDistort");
  assert.ok(
    (resolvedDirectUvSurface.previewUvRuntimeEvidence?.parameterSampleOffsets || []).length > 0,
    "direct PFX UV evidence should expose sampled offsets",
  );

  assert.match(appJs, /function runtimeEffectRuntimeUvFallbackForLayer\(entry,\s*layerIndex\)/);
  assert.match(appJs, /previewUvRuntimeEvidence\?\.kind !== "pfx-surface-uv-parameters"/);
  assert.match(appJs, /previewUvAnimationGapReason/);
  assert.match(appJs, /mode: "scroll"/);
  assert.match(appJs, /runtimeEvidenceKind: "pfx-surface-uv-parameters"/);
  assert.match(appJs, /return runtimeEffectRuntimeUvFallbackForLayer\(entry,\s*layerIndex\);/);
  const fallbackSource = functionSource("runtimeEffectRuntimeUvFallbackForLayer");
  const uvParameterBranchStart = fallbackSource.indexOf('previewUvRuntimeEvidence?.kind !== "pfx-surface-uv-parameters"');
  assert.notEqual(uvParameterBranchStart, -1, "expected direct PFX UV branch in fallback source");
  const uvParameterBranch = fallbackSource.slice(uvParameterBranchStart);
  assert.match(uvParameterBranch, /mode: "scroll"/);
  assert.doesNotMatch(uvParameterBranch, /pfx-surface-vertex-color-parameters/);
});

test("viewer rotates trig UV surfaces only when PFX vertexColor runtime evidence exists", () => {
  const rotatedUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/5V5/VainCrystal/VainCrystal_Death_Explosion/VainCrystal_Death_Explosion.Surface[143].shadergraph",
  );
  assert.ok(rotatedUvSurface, "expected Vain Crystal rotated UV shadergraph fixture");
  assert.deepEqual(rotatedUvSurface.previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: -1.5,
    phaseSource: "var1.x",
  });
  assert.equal(rotatedUvSurface.previewUvAnimationGapReason, "");
  assert.equal(rotatedUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");
  assert.ok(
    (rotatedUvSurface.previewUvRuntimeEvidence?.vertexColorInputs || []).includes("vertexColor.x"),
    "expected vertexColor.x to drive the trig UV phase",
  );

  assert.match(appJs, /shadergraphItem\.previewUvAnimationGapReason === "trig-rotated-uv"/);
  assert.match(appJs, /shadergraphItem\.previewUvRuntimeEvidence\?\.kind === "pfx-surface-vertex-color-parameters"/);
  assert.match(appJs, /mode: "rotate"/);
  assert.match(appJs, /runtimeEvidenceKind: "pfx-surface-vertex-color-parameters"/);
  assert.match(appJs, /texture\.center\.set\(center\[0\],\s*center\[1\]\)/);
  assert.match(appJs, /const rotation = rotationOffset \+ \(runtimeEffectUvAnimationPhaseTermsValue\(uvAnimation\.rotationPhaseTerms,\s*scaledPhase\) \?\? rotationSpeed \* scaledPhase\)/);
  assert.match(appJs, /texture\.rotation = rotation/);
  const fallbackSource = functionSource("runtimeEffectRuntimeUvFallbackForLayer");
  const vertexColorBranchStart = fallbackSource.indexOf('previewUvRuntimeEvidence?.kind === "pfx-surface-vertex-color-parameters"');
  const uvParameterBranchStart = fallbackSource.indexOf('previewUvRuntimeEvidence?.kind !== "pfx-surface-uv-parameters"');
  assert.notEqual(vertexColorBranchStart, -1, "expected trig rotated UV branch in fallback source");
  assert.notEqual(uvParameterBranchStart, -1, "expected direct PFX UV branch in fallback source");
  const vertexColorBranch = fallbackSource.slice(vertexColorBranchStart, uvParameterBranchStart);
  assert.match(vertexColorBranch, /mode: "rotate"/);
  assert.doesNotMatch(vertexColorBranch, /mode: "scroll"/);
});

test("viewer mirrors rotated UV sprite textures when shadergraph flips the sampled X coordinate", () => {
  const mirroredRotatedUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero012/Ardan_B.assetbundle/Ardan_B.Surface[49].shadergraph",
  );
  assert.ok(mirroredRotatedUvSurface, "expected Ardan mirrored rotated UV shadergraph fixture");
  assert.equal(mirroredRotatedUvSurface.previewUvAnimation?.mode, "rotate");
  assert.equal(mirroredRotatedUvSurface.previewUvAnimation?.flipX, true);
  assert.equal(mirroredRotatedUvSurface.previewUvAnimationGapReason, "");
  assert.equal(mirroredRotatedUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /uvAnimation\.flipX/);
  assert.match(updateSource, /texture\.repeat\.set\(\s*flipX \? -repeatX : repeatX,\s*flipY \? -repeatY : repeatY\s*\)/);
  assert.match(updateSource, /texture\.offset\.set\(\(flipX \? 1 : 0\) \+ rotatedPreOffsetX,\s*\(flipY \? 1 : 0\) \+ rotatedPreOffsetY\)/);
});

test("viewer applies multi-phase rotated UV terms from shadergraph vertexColor inputs", () => {
  const multiPhaseRotatedUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero066/Default/Hero066_DEF_A_Slash/Hero066_DEF_A_Slash.Surface[29].shadergraph",
  );
  assert.ok(multiPhaseRotatedUvSurface, "expected Hero066 multi-phase rotated UV shadergraph fixture");
  assert.deepEqual(multiPhaseRotatedUvSurface.previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 16,
    phaseSource: "var1.y|var1.z",
    phaseSources: ["var1.y", "var1.z"],
    rotationPhaseTerms: [
      { source: "var1.y", scale: -4 },
      { source: "var1.z", scale: 20 },
    ],
  });
  assert.equal(multiPhaseRotatedUvSurface.previewUvAnimationGapReason, "");
  assert.equal(multiPhaseRotatedUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /const rotationPhaseTerms = Array\.isArray\(uvAnimation\.rotationPhaseTerms\)/);
  assert.match(previewUvSource, /return \{[\s\S]*rotationPhaseTerms[\s\S]*\}/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(appJs, /function runtimeEffectUvAnimationPhaseTermsValue\(terms,\s*scaledPhase\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationPhaseTermsValue\(uvAnimation\.rotationPhaseTerms,\s*scaledPhase\)/);
  assert.match(updateSource, /const rotation = rotationOffset \+ \(/);
});

test("viewer applies scaled centered rotated UV terms from shadergraph vertexColor inputs", () => {
  const scaledRotatedUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero065/Default/Hero065_C_FireAOE/Hero065_C_FireAOE.Surface[6].shadergraph",
  );
  assert.ok(scaledRotatedUvSurface, "expected Hero065 scaled rotated UV shadergraph fixture");
  assert.deepEqual(scaledRotatedUvSurface.previewUvAnimation, {
    mode: "rotate",
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 1,
    phaseSource: "var1.w",
    repeat: [0, 0],
    repeatTerms: [[{ source: "var1.x", scale: 1 }], [{ source: "var1.x", scale: 1 }]],
    preRotationOffset: [0, 0],
    preRotationOffsetTerms: [[{ source: "var1.w", scale: -0.5 }], [{ source: "var1.w", scale: -0.5 }]],
  });
  assert.equal(scaledRotatedUvSurface.previewUvAnimationGapReason, "");
  assert.equal(scaledRotatedUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /uvAnimation\.mode === "rotate"/);
  assert.match(previewUvSource, /repeatTerms/);
  assert.match(previewUvSource, /preRotationOffsetTerms/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /runtimeEffectUvAnimationLinearComponentValue\(repeat\[0\],\s*uvAnimation\.repeatTerms\?\.\[0\],\s*scaledPhase\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationLinearComponentValue\(preRotationOffset\[0\],\s*uvAnimation\.preRotationOffsetTerms\?\.\[0\],\s*scaledPhase\)/);
});

test("viewer applies vertexColor scale-offset UV terms from shadergraph inputs", () => {
  const scaleOffsetUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero066/Default/Hero066_DEF_A_Dash/Hero066_DEF_A_Dash.Surface[5].shadergraph",
  );
  assert.ok(scaleOffsetUvSurface, "expected Hero066 scale-offset UV shadergraph fixture");
  assert.deepEqual(scaleOffsetUvSurface.previewUvAnimation, {
    mode: "scaleOffset",
    baseUvSource: "var1.xy",
    repeat: [0, 1],
    offset: [1, 0],
    repeatTerms: [[{ source: "var0.x", scale: 1 }], []],
    offsetTerms: [[{ source: "var0.x", scale: -1 }], []],
    phaseSource: "var0.x",
    phaseSources: ["var0.x"],
  });
  assert.equal(scaleOffsetUvSurface.previewUvAnimationGapReason, "");
  assert.equal(scaleOffsetUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /uvAnimation\.mode === "scaleOffset"/);
  assert.match(previewUvSource, /repeatTerms/);
  assert.match(previewUvSource, /offsetTerms/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(appJs, /function runtimeEffectUvAnimationLinearComponentValue\(baseValue,\s*terms,\s*scaledPhase\)/);
  assert.match(updateSource, /if \(uvAnimation\.mode === "scaleOffset"\)/);
  assert.match(updateSource, /texture\.repeat\.set\(repeatX,\s*repeatY\)/);
  assert.match(updateSource, /texture\.offset\.set\(offsetX,\s*offsetY\)/);
});

test("viewer applies vertexColor offset-only UV terms as scale-offset descriptors", () => {
  const offsetOnlyUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Menu/UI/MarketTile_Callout/MarketTile_Callout.Surface[74].shadergraph",
  );
  assert.ok(offsetOnlyUvSurface, "expected MarketTile offset-only UV shadergraph fixture");
  assert.deepEqual(offsetOnlyUvSurface.previewUvAnimation, {
    mode: "scaleOffset",
    baseUvSource: "var0.xy",
    repeat: [1, 1],
    offset: [0, 0],
    repeatTerms: [[], []],
    offsetTerms: [[{ source: "var1.w", scale: 0.2 }], [{ source: "var1.w", scale: 0.1 }]],
    phaseSource: "var1.w",
    phaseSources: ["var1.w"],
  });
  assert.equal(offsetOnlyUvSurface.previewUvAnimationGapReason, "");
  assert.equal(offsetOnlyUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");
});

test("viewer applies pre-rotation UV scroll when rotating runtime effect textures", () => {
  const preScrolledRotatedUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Hero036/Hero036_A_AOE_A/Hero036_A_AOE_A.Surface[171].shadergraph",
  );
  assert.ok(preScrolledRotatedUvSurface, "expected Hero036 pre-scrolled rotated UV shadergraph fixture");
  assert.equal(preScrolledRotatedUvSurface.previewUvAnimation?.mode, "rotate");
  assert.deepEqual(preScrolledRotatedUvSurface.previewUvAnimation?.preRotationOffset, [0, 0]);
  assert.deepEqual(preScrolledRotatedUvSurface.previewUvAnimation?.preRotationOffsetSpeed, [0.5, 0.5]);
  assert.equal(preScrolledRotatedUvSurface.previewUvAnimation?.phaseSource, "var2.x");
  assert.equal(preScrolledRotatedUvSurface.previewUvAnimationGapReason, "");

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /uvAnimation\.preRotationOffsetSpeed/);
  assert.match(updateSource, /rotatedPreOffsetX = preOffsetX \* cos - preOffsetY \* sin/);
  assert.match(updateSource, /texture\.offset\.set\(\(flipX \? 1 : 0\) \+ rotatedPreOffsetX,\s*\(flipY \? 1 : 0\) \+ rotatedPreOffsetY\)/);
});

test("viewer keeps vertexColor-gated sampled UV distortion fallback for future unresolved surfaces", () => {
  const unresolvedSampledDistortions = (effectShadergraphManifest.items || []).filter(
    (item) => item.previewUvAnimationGapReason === "sampled-uv-distortion",
  );
  assert.equal(unresolvedSampledDistortions.length, 0);

  const fallbackSource = functionSource("runtimeEffectRuntimeUvFallbackForLayer");
  assert.match(fallbackSource, /previewUvAnimationGapReason === "sampled-uv-distortion"/);
  assert.match(fallbackSource, /mode: "distort"/);
  assert.match(fallbackSource, /runtimeEvidenceKind: "pfx-surface-vertex-color-parameters"/);
  const sampledBranchStart = fallbackSource.indexOf('previewUvAnimationGapReason === "sampled-uv-distortion"');
  const directUvBranchStart = fallbackSource.indexOf('previewUvRuntimeEvidence?.kind !== "pfx-surface-uv-parameters"');
  assert.notEqual(sampledBranchStart, -1, "expected sampled UV distortion branch in fallback source");
  assert.notEqual(directUvBranchStart, -1, "expected direct PFX UV branch in fallback source");
  const sampledBranch = fallbackSource.slice(sampledBranchStart, directUvBranchStart);
  assert.match(sampledBranch, /mode: "distort"/);
  assert.doesNotMatch(sampledBranch, /mode: "scroll"/);
  assert.match(appJs, /if \(uvAnimation\.mode === "distort"\)/);
  assert.match(appJs, /texture\.offset\.set\(\s*offset\[0\] \+ Math\.sin\(scaledPhase \* Math\.PI \* 2\) \* amplitude/);
});

test("viewer applies rotated sampled UV distortion descriptors", () => {
  const rotatedSampledUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/Blackclaw/BlackClaw_Heal_Buff/BlackClaw_Heal_Buff.Surface[130].shadergraph",
  );
  assert.ok(rotatedSampledUvSurface, "expected Blackclaw rotated sampled UV shadergraph fixture");
  assert.deepEqual({
    mode: rotatedSampledUvSurface.previewUvAnimation?.mode,
    baseSampler: rotatedSampledUvSurface.previewUvAnimation?.baseSampler,
    distortionSampler: rotatedSampledUvSurface.previewUvAnimation?.distortionSampler,
    distortionChannel: rotatedSampledUvSurface.previewUvAnimation?.distortionChannel,
    baseUvSource: rotatedSampledUvSurface.previewUvAnimation?.baseUvSource,
    distortionUvSource: rotatedSampledUvSurface.previewUvAnimation?.distortionUvSource,
    distortionBias: rotatedSampledUvSurface.previewUvAnimation?.distortionBias,
    distortionScale: rotatedSampledUvSurface.previewUvAnimation?.distortionScale,
    amplitudeSource: rotatedSampledUvSurface.previewUvAnimation?.amplitudeSource,
    phaseSource: rotatedSampledUvSurface.previewUvAnimation?.phaseSource,
    phaseSources: rotatedSampledUvSurface.previewUvAnimation?.phaseSources,
    axis: rotatedSampledUvSurface.previewUvAnimation?.axis,
    offset: rotatedSampledUvSurface.previewUvAnimation?.offset,
    center: rotatedSampledUvSurface.previewUvAnimation?.center,
    rotationOffset: rotatedSampledUvSurface.previewUvAnimation?.rotationOffset,
    rotationSpeed: rotatedSampledUvSurface.previewUvAnimation?.rotationSpeed,
    rotationPhaseSource: rotatedSampledUvSurface.previewUvAnimation?.rotationPhaseSource,
  }, {
    mode: "sampledDistort",
    baseSampler: "sampler56",
    distortionSampler: "sampler35",
    distortionChannel: "x",
    baseUvSource: "var1.xy",
    distortionUvSource: "var2.xy",
    distortionBias: 0,
    distortionScale: 1,
    amplitudeSource: "var0.z",
    phaseSource: "var0.z",
    phaseSources: ["var0.z", "var0.y"],
    axis: [1, 1],
    offset: [0, 0],
    center: [0.5, 0.5],
    rotationOffset: 0,
    rotationSpeed: 1,
    rotationPhaseSource: "var0.y",
  });
  assert.equal(rotatedSampledUvSurface.previewUvAnimationGapReason, "");

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /const center = Array\.isArray\(uvAnimation\.center\)/);
  assert.match(previewUvSource, /rotationPhaseSource/);

  const shaderSource = functionSource("applyRuntimeEffectSampledDistortionShader");
  assert.match(shaderSource, /sampledDistortionRotateEnabled/);
  assert.match(shaderSource, /sampledDistortionRotation/);
  assert.match(shaderSource, /sampledRotatedUv/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /uniforms\.sampledDistortionRotation\.value = rotation/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.rotationPhaseSource,\s*scaledPhase\)/);
});

test("viewer applies resolved sampled UV distortion descriptors without using gap fallback", () => {
  const resolvedSampledUvSurface = (effectShadergraphManifest.items || []).find(
    (item) => item.relativePath === "Effects/5V5/Turret/Turret_Death_Explosion/Turret_Death_Explosion.Surface[59].shadergraph",
  );
  assert.ok(resolvedSampledUvSurface, "expected Turret sampled UV distortion shadergraph fixture");
  assert.deepEqual({
    mode: resolvedSampledUvSurface.previewUvAnimation.mode,
    baseSampler: resolvedSampledUvSurface.previewUvAnimation.baseSampler,
    distortionSampler: resolvedSampledUvSurface.previewUvAnimation.distortionSampler,
    distortionChannel: resolvedSampledUvSurface.previewUvAnimation.distortionChannel,
    baseUvSource: resolvedSampledUvSurface.previewUvAnimation.baseUvSource,
    distortionUvSource: resolvedSampledUvSurface.previewUvAnimation.distortionUvSource,
    distortionBias: resolvedSampledUvSurface.previewUvAnimation.distortionBias,
    distortionScale: resolvedSampledUvSurface.previewUvAnimation.distortionScale,
    amplitudeSource: resolvedSampledUvSurface.previewUvAnimation.amplitudeSource,
    phaseSource: resolvedSampledUvSurface.previewUvAnimation.phaseSource,
    axis: resolvedSampledUvSurface.previewUvAnimation.axis,
    offset: resolvedSampledUvSurface.previewUvAnimation.offset,
  }, {
    mode: "sampledDistort",
    baseSampler: "sampler61",
    distortionSampler: "sampler35",
    distortionChannel: "x",
    baseUvSource: "var0.xy",
    distortionUvSource: "var1.xy",
    distortionBias: -1,
    distortionScale: 2,
    amplitudeSource: "var2.x",
    phaseSource: "var2.x",
    axis: [1, 1],
    offset: [0, 0],
  });
  assert.equal(resolvedSampledUvSurface.previewUvAnimationGapReason, "");
  assert.equal(resolvedSampledUvSurface.previewUvRuntimeEvidence?.kind, "pfx-surface-vertex-color-parameters");
  assert.match(resolvedSampledUvSurface.previewUvAnimation.distortionTexture, /^\.\.\/effect_textures_by_hash\//);

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledDistort"\)/);
  assert.match(previewUvSource, /const axis = Array\.isArray\(uvAnimation\.axis\)/);
  assert.match(previewUvSource, /const center = Array\.isArray\(uvAnimation\.center\)/);
  assert.match(previewUvSource, /const distortionScale = Number\(uvAnimation\.distortionScale\)/);
  assert.match(previewUvSource, /return \{ \.\.\.uvAnimation,\s*axis,\s*offset,\s*offsetSpeed,\s*center,\s*distortionScale,\s*distortionBias,\s*distortionChannels,\s*amplitudeMaskChannel,\s*rotationOffset,\s*rotationSpeed,\s*rotationPhaseSource \}/);

  assert.match(appJs, /function runtimeEffectPreviewDistortionTextureForUvAnimation\(uvAnimation\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledDistortionShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledDistortionMap/);
  assert.match(appJs, /shader\.fragmentShader = shader\.fragmentShader\.replace\(\s*"#include <map_fragment>"/);
  assert.match(appJs, /applyRuntimeEffectSampledDistortionShader\(material,\s*spec\.uvAnimation\)/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledDistort"\)/);
  assert.match(updateSource, /layerObject\.material\?\.userData\?\.sampledDistortionUniforms/);
  assert.match(updateSource, /uniforms\.sampledDistortionAmplitude\.value = amplitude/);
  assert.match(updateSource, /const sampledOffset = Math\.sin\(scaledPhase \* Math\.PI \* 2\) \* amplitude/);
});

test("viewer declares custom sampled UV shader uniforms before injecting GLSL snippets", () => {
  const sampledShaderUniforms = [
    ["applyRuntimeEffectSampledDistortionShader", "sampledDistortionMap", "sampler2D"],
    ["applyRuntimeEffectSampledDistortionShader", "sampledDistortionMaskMap", "sampler2D"],
    ["applyRuntimeEffectSampledDistortionShader", "sampledDistortionAxis", "vec2"],
    ["applyRuntimeEffectSampledDistortionShader", "sampledDistortionAmplitude", "float"],
    ["applyRuntimeEffectSampledRotationShader", "sampledRotationMap", "sampler2D"],
    ["applyRuntimeEffectSampledRotationShader", "sampledRotationCenter", "vec2"],
    ["applyRuntimeEffectSampledRotationShader", "sampledRotationAmplitude", "float"],
    ["applyRuntimeEffectSampledWarpShader", "sampledWarpMap", "sampler2D"],
    ["applyRuntimeEffectSampledWarpShader", "sampledWarpDistortionMap", "sampler2D"],
    ["applyRuntimeEffectSampledWarpShader", "sampledWarpRuntimeOffset", "vec2"],
    ["applyRuntimeEffectSampledOffsetFieldShader", "sampledOffsetFieldMap", "sampler2D"],
    ["applyRuntimeEffectSampledOffsetFieldShader", "sampledOffsetFieldDistortionMap", "sampler2D"],
    ["applyRuntimeEffectSampledOffsetFieldShader", "sampledOffsetFieldBendX", "vec4"],
    ["applyRuntimeEffectSampledCenterScaleDistortShader", "sampledCenterScaleDistortMap", "sampler2D"],
    ["applyRuntimeEffectSampledCenterScaleDistortShader", "sampledCenterScaleDistortMaskMap", "sampler2D"],
    ["applyRuntimeEffectSampledCenterScaleDistortShader", "sampledCenterScaleDistortAmplitude", "float"],
    ["applyRuntimeEffectSampledScaleRotateShader", "sampledScaleRotateMap", "sampler2D"],
    ["applyRuntimeEffectSampledScaleRotateShader", "sampledScaleRotateScaleMap", "sampler2D"],
    ["applyRuntimeEffectSampledScaleRotateShader", "sampledScaleRotateScaleAmplitude", "float"],
  ];

  for (const [functionName, uniformName, uniformType] of sampledShaderUniforms) {
    const shaderSource = functionSource(functionName);
    assert.match(
      shaderSource,
      new RegExp(`uniform ${uniformType} ${uniformName};`),
      `${functionName} should declare ${uniformName}`,
    );
  }
});

test("viewer keeps fixed sampled UV distortion active without a runtime phase source", () => {
  const shaderSource = functionSource("applyRuntimeEffectSampledDistortionShader");
  assert.match(shaderSource, /sampledDistortionWave/);
  assert.match(shaderSource, /sampledDistortionValue \+ vec2\(sampledDistortionBias\)/);
  assert.match(shaderSource, /\* sampledDistortionAmplitude \* sampledDistortionMask \* sampledDistortionWave/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /const usesRuntimePhase = Boolean\(uvAnimation\.amplitudeSource\);/);
  assert.match(updateSource, /const amplitude = usesRuntimePhase\s*\?\s*Math\.max\(0\.0025,/);
  assert.match(updateSource, /const offsetSpeed = uvAnimation\.offsetSpeed \|\| \[0, 0\];/);
  assert.match(updateSource, /uniforms\.sampledDistortionOffset\.value\.set\(\s*offset\[0\] \+ offsetSpeed\[0\] \* scaledPhase,\s*offset\[1\] \+ offsetSpeed\[1\] \* scaledPhase,\s*\);/);
  assert.match(updateSource, /uniforms\.sampledDistortionWave\.value = usesRuntimePhase \? Math\.sin\(scaledPhase \* Math\.PI \* 2\) : 1;/);
  assert.match(appJs, /uvAnimation\.offsetSpeed\.join\(","\)/);
});

test("viewer applies two-channel sampled UV distortion vectors", () => {
  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /const distortionChannels = Array\.isArray\(uvAnimation\.distortionChannels\)/);
  assert.match(previewUvSource, /return \{ \.\.\.uvAnimation,\s*axis,\s*offset,\s*offsetSpeed,\s*center,\s*distortionScale,\s*distortionBias,\s*distortionChannels,\s*amplitudeMaskChannel,\s*rotationOffset,\s*rotationSpeed,\s*rotationPhaseSource \}/);
  assert.match(appJs, /uvAnimation\.distortionChannels\.join\(","\)/);

  const shaderSource = functionSource("applyRuntimeEffectSampledDistortionShader");
  assert.match(shaderSource, /const channelX = distortionChannels\[0\]/);
  assert.match(shaderSource, /const channelY = distortionChannels\[1\]/);
  assert.match(shaderSource, /vec2 sampledDistortionValue = vec2\(sampledDistortionTexel\.\$\{channelX\}, sampledDistortionTexel\.\$\{channelY\}\);/);
  assert.match(shaderSource, /vec2 sampledDistortedUv = vMapUv \+ sampledDistortionOffset \+ sampledDistortionAxis \* \(\(sampledDistortionValue \+ vec2\(sampledDistortionBias\)\)/);
});

test("viewer applies sampled UV distortion amplitude masks", () => {
  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /const amplitudeMaskChannel = validDistortionChannels\.includes\(uvAnimation\.amplitudeMaskChannel\)/);
  assert.match(previewUvSource, /amplitudeMaskChannel/);

  const shaderSource = functionSource("applyRuntimeEffectSampledDistortionShader");
  assert.match(shaderSource, /runtimeEffectPreviewAmplitudeMaskTextureForUvAnimation\(uvAnimation\)/);
  assert.match(shaderSource, /sampledDistortionMaskMap/);
  assert.match(shaderSource, /sampledDistortionMaskEnabled/);
  assert.match(shaderSource, /float sampledDistortionMask = mix\(1\.0, texture2D\(sampledDistortionMaskMap, vMapUv\)\.\$\{amplitudeMaskChannel\}, sampledDistortionMaskEnabled\);/);
  assert.match(shaderSource, /sampledDistortionAmplitude \* sampledDistortionMask \* sampledDistortionWave/);
  assert.match(appJs, /uvAnimation\.amplitudeMaskTexture \|\| ""/);
});

test("viewer applies sampled per-pixel rotated UV descriptors with a runtime rotation texture", () => {
  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledRotate"\)/);
  assert.match(previewUvSource, /const validRotationChannels = \["x", "y", "z", "w"\]/);
  assert.match(previewUvSource, /const preRotationAxis = Array\.isArray\(uvAnimation\.preRotationAxis\)/);
  assert.match(previewUvSource, /return \{ \.\.\.uvAnimation,\s*center,\s*preRotationAxis,\s*rotationScale,\s*rotationChannel \}/);

  assert.match(appJs, /function runtimeEffectPreviewRotationTextureForUvAnimation\(uvAnimation\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledRotationShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledRotationMap/);
  assert.match(appJs, /texture2D\(sampledRotationMap,\s*vMapUv\)/);
  assert.match(appJs, /sampledRotationPreAxis/);
  assert.match(appJs, /sampledRotationScale/);
  assert.match(appJs, /sampledRotationAmplitude/);
  assert.match(appJs, /applyRuntimeEffectSampledRotationShader\(material,\s*spec\.uvAnimation\)/);
  assert.match(appJs, /uvAnimation\.mode === "sampledRotate"/);
  assert.match(appJs, /uvAnimation\.rotationTexture \|\| ""/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledRotate"\)/);
  assert.match(updateSource, /layerObject\.material\?\.userData\?\.sampledRotationUniforms/);
  assert.match(updateSource, /uniforms\.sampledRotationAmplitude\.value = Math\.max\(0\.0025,/);
  assert.match(updateSource, /uniforms\.sampledRotationPreAxis\.value\.set\(preRotationAxis\[0\],\s*preRotationAxis\[1\]\)/);
});

test("viewer applies sampled UV warp descriptors with runtime vertexColor offsets", () => {
  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledWarp"\)/);
  assert.match(previewUvSource, /const baseRepeat = Array\.isArray\(uvAnimation\.baseRepeat\)/);
  assert.match(previewUvSource, /const distortionRepeat = Array\.isArray\(uvAnimation\.distortionRepeat\)/);
  assert.match(previewUvSource, /const runtimeOffsetScale = Array\.isArray\(uvAnimation\.runtimeOffsetScale\)/);
  assert.match(previewUvSource, /return \{ \.\.\.uvAnimation,\s*baseRepeat,\s*distortionRepeat,\s*uvScaleRepeat,\s*distortionChannels,\s*distortionWeightChannel,\s*distortionValueScale,\s*distortionBias,\s*distortionScale,\s*runtimeOffsetBias,\s*runtimeOffsetScale \}/);

  assert.match(appJs, /function runtimeEffectPreviewWarpTextureForUvAnimation\(uvAnimation\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledWarpShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledWarpMap/);
  assert.match(appJs, /sampledWarpDistortionMap/);
  assert.match(appJs, /sampledWarpRuntimeOffset/);
  assert.match(appJs, /texture2D\(sampledWarpMap,\s*sampledWarpUv\)/);
  assert.match(appJs, /applyRuntimeEffectSampledWarpShader\(material,\s*spec\.uvAnimation\)/);
  assert.match(appJs, /uvAnimation\.mode === "sampledWarp"/);
  assert.match(appJs, /uvAnimation\.warpTexture \|\| ""/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledWarp"\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.runtimeOffsetSource,\s*scaledPhase\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.runtimeOffsetMultiplierSource,\s*scaledPhase\)/);
  assert.match(updateSource, /uniforms\.sampledWarpRuntimeOffset\.value\.set\(/);
});

test("viewer applies sampled offset-field descriptors with runtime vertexColor offsets", () => {
  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledOffsetField"\)/);
  assert.match(previewUvSource, /const uvBend = uvAnimation\.uvBend \|\| \{\}/);
  assert.match(previewUvSource, /const runtimeOffsetAxis = Array\.isArray\(uvAnimation\.runtimeOffsetAxis\)/);

  assert.match(appJs, /function runtimeEffectPreviewFieldTextureForUvAnimation\(uvAnimation\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledOffsetFieldShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledOffsetFieldMap/);
  assert.match(appJs, /sampledOffsetFieldDistortionMap/);
  assert.match(appJs, /sampledOffsetFieldRuntimeOffset/);
  assert.match(appJs, /sampledOffsetFieldBendX/);
  assert.match(appJs, /texture2D\(sampledOffsetFieldMap,\s*sampledOffsetFieldUv\)/);
  assert.match(appJs, /applyRuntimeEffectSampledOffsetFieldShader\(material,\s*spec\.uvAnimation\)/);
  assert.match(appJs, /uvAnimation\.mode === "sampledOffsetField"/);
  assert.match(appJs, /uvAnimation\.fieldTexture \|\| ""/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledOffsetField"\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.runtimeOffsetSource,\s*scaledPhase\)/);
  assert.match(updateSource, /uniforms\.sampledOffsetFieldRuntimeOffset\.value\.set\(/);
});

test("viewer applies sampled center-scale distortion descriptors with runtime vertexColor scale and amplitude", () => {
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const resolvedSampledCenterScaleSurface = shadergraphByPath.get(
    "Effects/Hero068/DEF/Hero068_DEF_C_Aura/Hero068_DEF_C_Aura.Surface[124].shadergraph",
  );
  assert.equal(resolvedSampledCenterScaleSurface?.previewUvAnimation?.mode, "sampledCenterScaleDistort");
  assert.match(resolvedSampledCenterScaleSurface.previewUvAnimation.distortionTexture || "", /^\.\.\/effect_textures_by_hash\//);
  assert.match(resolvedSampledCenterScaleSurface.previewUvAnimation.amplitudeMaskTexture || "", /^\.\.\/effect_textures_by_hash\//);
  assert.match(resolvedSampledCenterScaleSurface.previewUvAnimation.fieldTexture || "", /^\.\.\/effect_textures_by_hash\//);

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledCenterScaleDistort"\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledCenterScaleDistortShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledCenterScaleDistortMap/);
  assert.match(appJs, /sampledCenterScaleDistortDistortionMap/);
  assert.match(appJs, /sampledCenterScaleDistortMaskMap/);
  assert.match(appJs, /sampledCenterScaleDistortCenterScale/);
  assert.match(appJs, /texture2D\(sampledCenterScaleDistortMap,\s*sampledCenterScaleDistortUv\)/);
  assert.match(appJs, /applyRuntimeEffectSampledCenterScaleDistortShader\(material,\s*spec\.uvAnimation\)/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledCenterScaleDistort"\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.centerScaleSource,\s*scaledPhase\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.amplitudeSource,\s*scaledPhase\)/);
  assert.match(updateSource, /uniforms\.sampledCenterScaleDistortCenterScale\.value =/);
  assert.match(updateSource, /uniforms\.sampledCenterScaleDistortAmplitude\.value =/);
});

test("viewer applies sampled scale-rotate descriptors with runtime vertexColor scale and rotation", () => {
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const resolvedSampledScaleRotateSurface = shadergraphByPath.get(
    "Effects/Hero020/EAR/Phinn_EAR_B_Buff/Phinn_EAR_B_Buff.Surface[35].shadergraph",
  );
  assert.equal(resolvedSampledScaleRotateSurface?.previewUvAnimation?.mode, "sampledScaleRotate");
  assert.match(resolvedSampledScaleRotateSurface.previewUvAnimation.fieldTexture || "", /^\.\.\/effect_textures_by_hash\//);
  assert.match(resolvedSampledScaleRotateSurface.previewUvAnimation.scaleTexture || "", /^\.\.\/effect_textures_by_hash\//);
  assert.match(resolvedSampledScaleRotateSurface.previewUvAnimation.scaleMaskTexture || "", /^\.\.\/effect_textures_by_hash\//);

  const previewUvSource = functionSource("runtimeEffectPreviewUvAnimationForLayer");
  assert.match(previewUvSource, /if \(uvAnimation\.mode === "sampledScaleRotate"\)/);
  assert.match(appJs, /function applyRuntimeEffectSampledScaleRotateShader\(material,\s*uvAnimation\)/);
  assert.match(appJs, /sampledScaleRotateMap/);
  assert.match(appJs, /sampledScaleRotateScaleMap/);
  assert.match(appJs, /sampledScaleRotateMaskMap/);
  assert.match(appJs, /sampledScaleRotateRotation/);
  assert.match(appJs, /texture2D\(sampledScaleRotateMap,\s*sampledScaleRotateUv\)/);
  assert.match(appJs, /applyRuntimeEffectSampledScaleRotateShader\(material,\s*spec\.uvAnimation\)/);

  const updateSource = functionSource("runtimeEffectUpdateLayerUvAnimation");
  assert.match(updateSource, /if \(uvAnimation\.mode === "sampledScaleRotate"\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.scaleAmplitudeSource,\s*scaledPhase\)/);
  assert.match(updateSource, /runtimeEffectUvAnimationVertexColorValue\(uvAnimation\.rotationSource,\s*scaledPhase\)/);
  assert.match(updateSource, /uniforms\.sampledScaleRotateScaleAmplitude\.value =/);
  assert.match(updateSource, /uniforms\.sampledScaleRotateRotation\.value =/);
});

test("viewer includes safe definition-neighborhood PFX in the preview resource set", () => {
  const safeNeighborhoodRows = (nativeEffectDefinitionNeighborhood.items || []).filter(
    (row) => row.pfxPromotionClass === "nearby-action-matched" && (row.pfxModelLabels || []).length && (row.pfxResourcePaths || []).length,
  );
  assert.ok(safeNeighborhoodRows.length > 0, "expected recovered safe definition-neighborhood PFX evidence");

  const allPfxSource = functionSource("runtimeEffectAllPfxItemsForItem");
  assert.match(appJs, /function runtimeEffectDefinitionNeighborhoodPfxItemsForItem\(item = activeManifestItem\)/);
  assert.match(allPfxSource, /const definitionNeighborhoodPfxItems = runtimeEffectDefinitionNeighborhoodPfxItemsForItem\(item\);/);
  assert.match(
    allPfxSource,
    /return uniqueRuntimeEffectPfxItems\(\[\.\.\.hookPfxItems,\s*\.\.\.definitionProjectilePfxItems,\s*\.\.\.definitionNeighborhoodPfxItems,\s*\.\.\.fallbackPfxItems\]\);/,
  );
});

test("viewer previews safe definition-neighborhood PFX as action-gated runtime entries", () => {
  const safeKarasRows = (nativeEffectDefinitionNeighborhood.items || []).filter(
    (row) =>
      row.sourceEffectToken === "Effect_Karas_C_Impact" &&
      row.token === "Effect_Karas_C_Shot" &&
      (row.actionKeys || []).includes("ability03") &&
      (row.pfxResourcePaths || []).includes("Effects/Hero071/Defaults/Hero071_C_Shot/Hero071_C_Shot.pfx"),
  );
  assert.ok(safeKarasRows.length > 0, "expected safe Karas definition-neighborhood PFX evidence");

  const previewSource = functionSource("runtimeEffectPreviewEntries");
  assert.match(appJs, /function runtimeEffectDefinitionNeighborhoodEntriesForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /sourceKind: "definition-neighborhood-pfx"/);
  assert.match(previewSource, /for \(const entry of runtimeEffectDefinitionNeighborhoodEntriesForItem\(item\)\) \{/);
  assert.match(previewSource, /if \(!runtimeEffectShouldPreviewForAnimation\(entry,\s*animation\)\) continue;/);
  assert.match(previewSource, /pushEntry\(entry\);/);
});

test("viewer requires timing evidence for action-matched definition-neighborhood PFX preview", () => {
  const safeRows = (nativeEffectDefinitionNeighborhood.items || []).filter(
    (row) =>
      row.pfxPromotionClass === "nearby-action-matched" &&
      (row.actionKeys || []).length &&
      (row.pfxResourcePaths || []).length,
  );
  assert.ok(safeRows.length > 0, "expected action-matched definition-neighborhood PFX evidence");

  const timelineEvidenceSource = functionSource("runtimeEffectHasRequiredTimelineEvidence");
  assert.match(appJs, /function runtimeEffectDefinitionNeighborhoodHasActionResourceEvidence\(entry\)/);
  assert.match(timelineEvidenceSource, /runtimeEffectDefinitionNeighborhoodHasActionResourceEvidence\(entry\)/);
  const neighborhoodEvidenceSource = functionSource("runtimeEffectDefinitionNeighborhoodHasActionResourceEvidence");
  assert.match(neighborhoodEvidenceSource, /runtimeEffectInferredActionKeys\(entry\)\.size/);
  assert.match(neighborhoodEvidenceSource, /runtimeEffectHasTimelineEvidence\(entry\)/);
  assert.doesNotMatch(neighborhoodEvidenceSource, /return runtimeEffectInferredActionKeys\(entry\)\.size > 0;/);
});

test("viewer reuses exact native hook timing for action-matched definition-neighborhood PFX", () => {
  const kestrelChargingResource = "Effects/Hero023/FOREST/Hero023_FOREST_C_Charging/Hero023_FOREST_C_Charging.pfx";
  const safeKestrelRow = (nativeEffectDefinitionNeighborhood.items || []).find(
    (row) =>
      row.sourceEffectToken === "Effect_Kestrel_C_Aiming" &&
      row.token === "Effect_Kestrel_C_Charging" &&
      (row.actionKeys || []).includes("ability03") &&
      (row.pfxResourcePaths || []).includes(kestrelChargingResource),
  );
  assert.ok(safeKestrelRow, "expected Kestrel C charging neighborhood evidence");

  const exactRuntimeHook = (effectHookRuntimeManifest.items || []).find(
    (hook) =>
      hook.effectToken === "Effect_Kestrel_C_Aiming" &&
      (hook.actionKeys || []).includes("ability03") &&
      (hook.resourcePaths || []).includes(kestrelChargingResource) &&
      Number(hook.runtimeBinding?.startSeconds) === 0.8,
  );
  assert.ok(exactRuntimeHook, "expected exact native hook timing for Kestrel C aiming");

  const neighborhoodSource = functionSource("runtimeEffectDefinitionNeighborhoodEntriesForItem");
  assert.match(appJs, /function runtimeEffectDefinitionNeighborhoodRuntimeHookForResource\(row,\s*resourcePath,\s*item = activeManifestItem\)/);
  assert.match(appJs, /\(hook\.resourcePaths \|\| \[\]\)\.includes\(resourcePath\)/);
  assert.match(appJs, /runtimeEffectActionKeysOverlap\(actionKeys,\s*runtimeEffectInferredActionKeys\(\{ hook,\s*actionKeys: hook\.actionKeys \|\| \[\] \}\)\)/);
  assert.match(neighborhoodSource, /const runtimeHook = runtimeEffectDefinitionNeighborhoodRuntimeHookForResource\(row,\s*resourcePath,\s*item\);/);
  assert.match(neighborhoodSource, /\.\.\.\(runtimeHook \|\| \{\}\)/);
  assert.match(neighborhoodSource, /runtimeBinding:\s*\{\s*\.\.\.\(runtimeHook\?\.runtimeBinding \|\| \{\}\),/);
});

test("viewer reports definition-neighborhood PFX entries that are backed by runtime hooks", () => {
  const runtimeLinkedRows = (nativeEffectDefinitionNeighborhood.items || []).filter(
    (row) => row.pfxPromotionClass === "nearby-action-matched" && (row.pfxResourcePaths || []).length,
  );
  assert.ok(runtimeLinkedRows.length > 0, "expected action-matched definition-neighborhood rows");

  const diagnosticsSource = functionSource("currentRuntimeEffectDiagnostics");
  const summarySource = functionSource("syncEffectDiagnostics");
  const statsSource = functionSource("runtimeEffectStats");
  assert.match(diagnosticsSource, /const definitionNeighborhoodEntries = runtimeEffectDefinitionNeighborhoodEntriesForItem\(item\);/);
  assert.match(diagnosticsSource, /const definitionNeighborhoodTimedEntries = definitionNeighborhoodEntries\.filter\(\(entry\) => runtimeEffectHasTimelineEvidence\(entry\)\);/);
  assert.match(statsSource, /definitionNeighborhoodEntries\.length/);
  assert.match(statsSource, /definitionNeighborhoodTimedEntries\.length/);
  assert.match(summarySource, /definitionNeighborhoodEntries\.length \? `\$\{definitionNeighborhoodEntries\.length\} 条邻接 PFX runtime` : ""/);
  assert.match(summarySource, /definitionNeighborhoodTimedEntries\.length \? `\$\{definitionNeighborhoodTimedEntries\.length\} 条邻接 PFX native 时机` : ""/);
});

test("viewer reports native PFX emitter runtime profile coverage in effect stats", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const profileRows = pfxItems.reduce(
    (sum, item) =>
      sum +
      (item.surfaceRecords || []).filter((record) => record.emitterRuntimeProfile?.semanticSlots?.length).length,
    0,
  );
  const childEmitterRows = pfxItems.reduce(
    (sum, item) => sum + (item.surfaceRecords || []).reduce((recordSum, record) => recordSum + (record.childEmitterRecords || []).length, 0),
    0,
  );
  const childCallbackRows = pfxItems.reduce(
    (sum, item) =>
      sum +
      (item.surfaceRecords || []).reduce(
        (recordSum, record) =>
          recordSum +
          (record.childEmitterRecords || []).reduce(
            (childSum, childRecord) => childSum + (childRecord.runtimeProfile?.semanticSlots || []).length,
            0,
          ),
        0,
      ),
    0,
  );
  assert.ok(profileRows > 0, "expected generated PFX manifest to include emitter runtime profiles");
  assert.ok(childEmitterRows > 0, "expected generated PFX manifest to include child emitter records");
  assert.ok(childCallbackRows > 0, "expected generated PFX manifest to include child emitter callback slots");

  const statsSource = functionSource("runtimeEffectStats");
  assert.match(appJs, /function runtimeEffectPfxEmitterRuntimeProfileCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterRuntimeProfileSummary\(profileCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackTargetCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackTargetSummary\(targetCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackInputKindCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackInputKindSummary\(inputKindCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackLayoutEvidenceCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackLayoutEvidenceSummary\(layoutEvidenceCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterResolverTableCompatibilityCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterResolverTableCompatibilitySummary\(compatibilityCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentBuildStatusCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentBuildStatusSummary\(currentBuildCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentSemanticClassCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentSemanticClassSummary\(semanticClassCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentConstantTargetCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCurrentConstantTargetSummary\(constantTargetCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterCallbackResolutionStatusCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxEmitterPackedLiteralFloatCandidateTargetSummary\(candidateTargetCounts\)/);
  assert.match(appJs, /function runtimeEffectPfxChildEmitterCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxChildEmitterModeCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxChildEmitterCallbackResolutionStatusCounts\(pfxItems\)/);
  assert.match(appJs, /function runtimeEffectPfxChildEmitterCurrentSemanticClassCounts\(pfxItems\)/);
  assert.match(appJs, /"likely-null-literal": "常量或空 callback"/);
  assert.match(appJs, /"likely-packed-literal": "内联 packed 参数"/);
  assert.match(appJs, /"packed-literal": "内联 packed 参数"/);
  assert.match(appJs, /"current-table-callback-matched": "当前表 callback 已命中"/);
  assert.match(appJs, /"question-prefixed-surface-path": "\?Effects 布局未证实"/);
  assert.match(appJs, /"cross-build-reference": "跨 build 参考"/);
  assert.match(appJs, /"matched-current-table-candidate": "当前表候选命中"/);
  assert.match(appJs, /"missing-current-table-candidate": "当前表确认缺失"/);
  assert.match(appJs, /"constant-scalar-store": "常量标量"/);
  assert.match(appJs, /"unresolved-callback": "未解析 callback"/);
  assert.match(statsSource, /pfxEmitterRuntimeProfileCount/);
  assert.match(statsSource, /PFX emitter Runtime/);
  assert.match(statsSource, /PFX callback 目标/);
  assert.match(statsSource, /PFX callback 输入/);
  assert.match(statsSource, /PFX callback 布局/);
  assert.match(statsSource, /PFX resolver 表/);
  assert.match(statsSource, /PFX 当前表/);
  assert.match(statsSource, /PFX callback 语义/);
  assert.match(statsSource, /PFX callback 常量/);
  assert.match(statsSource, /PFX packed 数值候选/);
  assert.match(statsSource, /PFX callback 解析/);
  assert.match(statsSource, /PFX 子层 emitter/);
  assert.match(statsSource, /PFX 子层 callback 解析/);
  assert.match(statsSource, /PFX 子层 callback 语义/);
});

test("viewer applies native PFX emitter constant velocity hints to runtime effect layers", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const nonZeroVelocityVector = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record })))
    .find(({ record }) =>
      (record.emitterRuntimeProfile?.semanticSlots || []).some(
        (slot) =>
          slot.name === "velocityVectorCallback" &&
          slot.targetArraySemantic === "velocity" &&
          Number.isFinite(slot.resolverCurrentCallbackConstantValue) &&
          Math.abs(slot.resolverCurrentCallbackConstantValue) > 0.001,
      ),
    );
  assert.ok(nonZeroVelocityVector, "expected generated PFX manifest to include a non-zero constant velocity vector callback");

  assert.match(appJs, /function runtimeEffectEmitterVelocityHint\(surfaceRecord\)/);
  const velocityHintSource = functionSource("runtimeEffectEmitterVelocityHint");
  assert.match(velocityHintSource, /slot\.name === "velocityVectorCallback"/);
  assert.match(velocityHintSource, /slot\.targetArraySemantic !== "velocity"/);
  assert.match(velocityHintSource, /slot\.resolverCurrentCallbackConstantValue/);

  assert.match(appJs, /function runtimeEffectEmitterVelocityOffset\(velocityHint,\s*entry,\s*elapsedSeconds\)/);
  const offsetSource = functionSource("runtimeEffectEmitterVelocityOffset");
  assert.match(offsetSource, /runtimeEffectSurfaceTimeSeconds\(entry,\s*runtimeEffectTimelineWindow\(entry\),\s*elapsedSeconds\)/);
  assert.match(offsetSource, /Math\.max\(-48,\s*Math\.min\(48,/);

  const createSource = functionSource("createRuntimeEffectPreviewObject");
  assert.match(createSource, /const emitterVelocityHint = runtimeEffectEmitterVelocityHint\(spec\.surfaceRecord\);/);
  assert.match(createSource, /layerObject\.userData\.basePosition = layerObject\.position\.clone\(\);/);
  assert.match(createSource, /layerObject\.userData\.emitterVelocityHint = emitterVelocityHint;/);

  const updateSource = functionSource("updateRuntimeEffectPreviews");
  assert.match(
    updateSource,
    /const emitterVelocityOffset = runtimeEffectEmitterVelocityOffset\(layerObject\.userData\.emitterVelocityHint,\s*preview\.userData\.entry,\s*elapsedSeconds\);/,
  );
  assert.match(
    updateSource,
    /layerObject\.position\.copy\(layerObject\.userData\.basePosition\)(?:\.add\([a-zA-Z]+Offset\)){1,2};/,
  );

  const debugSource = functionSource("runtimeEffectPreviewSurfaceRecordsForDebug");
  assert.match(debugSource, /emitterVelocityHint: runtimeEffectEmitterVelocityHint\(record\)/);
});

test("viewer keeps native PFX emitter position offsets gated by vector evidence", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const matchedPositionWithoutVector = pfxItems
    .flatMap((item) => (item.surfaceRecords || []).map((record) => ({ item, record })))
    .find(({ record }) =>
      (record.emitterRuntimeProfile?.semanticSlots || []).some(
        (slot) =>
          slot.name === "positionVectorCallback" &&
          slot.targetArraySemantic === "position" &&
          slot.resolverCurrentBuildStatus === "matched-current-table-candidate" &&
          !Array.isArray(slot.resolverCurrentCallbackVectorValue),
      ),
    );
  assert.ok(matchedPositionWithoutVector, "expected current iOS PFX manifest to keep non-vector position callbacks unvectorized");

  assert.match(appJs, /function runtimeEffectEmitterPositionHint\(surfaceRecord\)/);
  const positionHintSource = functionSource("runtimeEffectEmitterPositionHint");
  assert.match(positionHintSource, /slot\.name === "positionVectorCallback"/);
  assert.match(positionHintSource, /slot\.targetArraySemantic !== "position"/);
  assert.match(positionHintSource, /slot\.resolverCurrentCallbackVectorValue/);

  assert.match(appJs, /function runtimeEffectEmitterPositionOffset\(positionHint\)/);
  const offsetSource = functionSource("runtimeEffectEmitterPositionOffset");
  assert.match(offsetSource, /new THREE\.Vector3\(vector\[0\],\s*vector\[1\],\s*vector\[2\]\)/);
  assert.match(offsetSource, /clampLength\(0,\s*24\)/);

  const createSource = functionSource("createRuntimeEffectPreviewObject");
  assert.match(createSource, /const emitterPositionHint = runtimeEffectEmitterPositionHint\(spec\.surfaceRecord\);/);
  assert.match(createSource, /layerObject\.userData\.emitterPositionHint = emitterPositionHint;/);

  const updateSource = functionSource("updateRuntimeEffectPreviews");
  assert.match(updateSource, /const emitterPositionOffset = runtimeEffectEmitterPositionOffset\(layerObject\.userData\.emitterPositionHint\);/);
  assert.match(
    updateSource,
    /layerObject\.position\.copy\(layerObject\.userData\.basePosition\)\.add\(emitterPositionOffset\)\.add\(emitterVelocityOffset\);/,
  );

  const debugSource = functionSource("runtimeEffectPreviewSurfaceRecordsForDebug");
  assert.match(debugSource, /emitterPositionHint: runtimeEffectEmitterPositionHint\(record\)/);
});

test("viewer keeps color-only effect surfaces in diagnostics instead of fabricating radial cards", () => {
  assert.match(appJs, /function runtimeEffectShadergraphHasRenderableSurfaceEvidence\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /runtimeEffectShadergraphLooksLikeEffectLayer\(item,\s*pfxItem,\s*entry\)[\s\S]*runtimeEffectPreviewTextureUsableForSprite\(item\)[\s\S]*runtimeEffectShadergraphSurfacePreviewAllowed\(item,\s*pfxItem,\s*entry\)/);
  assert.match(appJs, /function runtimeEffectShadergraphSurfaceCardRiskBlocked\(item\)/);
  assert.match(appJs, /item\?\.previewSurfaceRenderable === false && \/base-card-risk\/i\.test/);
  assert.doesNotMatch(appJs, /runtimeEffectShadergraphLooksLikeEffectLayer\(item\) &&\s*\(\(item\.inlineColors \|\| \[\]\)\.length \|\| runtimeEffectPreviewTextureUsableForSprite\(item\)\)/);
});

test("viewer only renders embedded WebP effect textures when alpha-mask evidence can drive alphaMap", () => {
  assert.match(appJs, /function runtimeEffectPreviewTextureUsableForSprite\(item\)/);
  assert.match(appJs, /function runtimeEffectPreviewTextureNeedsAlphaMap\(item\)/);
  assert.match(appJs, /item\?\.previewTextureMode === "embedded-webp"/);
  assert.match(appJs, /item\?\.previewTextureRequiresAlphaMap === true/);
  assert.match(appJs, /\(item\?\.roleNames \|\| \[\]\)\.includes\("alphaMask"\)/);
  assert.match(appJs, /if \(item\.previewTextureMode === "embedded-webp"\) return runtimeEffectPreviewTextureNeedsAlphaMap\(item\);/);
  assert.match(appJs, /item\.previewTextureSpriteUsable !== false/);
  assert.match(appJs, /function runtimeEffectPreviewAlphaMapForEntry\(entry, layerIndex\)/);
  assert.match(appJs, /alphaMap: runtimeEffectPreviewAlphaMapForEntry\(entry, layerIndex\)/);
  assert.match(appJs, /if \(!runtimeEffectPreviewTextureUsableForLayer\(item,\s*pfxItem,\s*entry\) \|\| seen\.has\(item\.previewTexture\)\) continue;/);
});

test("viewer applies alphaMap to runtime-bound embedded WebP alphaMask layers without making them generic sprites", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const pingPfx = pfxItems.find((item) => item.relativePath === "Effects/Hero058/MED/Hero058_MED_Ping/Hero058_MED_Ping.pfx");
  assert.ok(pingPfx, "expected Ylva ping pfx fixture");
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const alphaMaskWebp = (pingPfx.surfaceRecords || [])
    .filter((record) => record.prelude?.renderFamily === "billboard")
    .map((record) => shadergraphByPath.get(record.relativePath))
    .find(
      (shadergraph) =>
        shadergraph?.previewTextureMode === "embedded-webp" &&
        shadergraph.previewTextureRequiresAlphaMap === true &&
        shadergraph.previewTextureSpriteUsable === true &&
        shadergraph.previewBlendMode === "alpha" &&
        (shadergraph.roleNames || []).includes("alphaBlend") &&
        (shadergraph.roleNames || []).includes("alphaMask"),
    );
  assert.ok(alphaMaskWebp, "expected runtime-bound embedded WebP with recovered alphaMask evidence");

  assert.match(appJs, /function runtimeEffectPreviewTextureNeedsAlphaMap\(item\)/);
  assert.match(appJs, /item\?\.previewTextureRequiresAlphaMap === true/);
  assert.match(appJs, /runtimeEffectPreviewTextureNeedsAlphaMap\(shadergraphItem\) \|\|\s*runtimeEffectPreviewTextureNeedsRuntimeAlphaMap\(shadergraphItem,\s*entry\.pfxItem,\s*entry\)/);
  assert.match(appJs, /alphaMap: runtimeEffectPreviewAlphaMapForEntry\(entry,\s*layerIndex\)/);
  assert.match(appJs, /if \(item\.previewTextureMode === "embedded-webp"\) return runtimeEffectPreviewTextureNeedsAlphaMap\(item\);/);
});

test("viewer applies alphaMap to runtime-bound opaque alphaMask effect layers", () => {
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const projectilePfx = pfxItems.find(
    (item) => item.relativePath === "Effects/Adagio/Adagio_Spell_Projectile.assetbundle/Adagio_Spell_Projectile.pfx",
  );
  assert.ok(projectilePfx, "expected Adagio spell projectile pfx fixture");
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const opaqueAlphaMask =
    (projectilePfx.surfaceRecords || [])
      .filter((record) => record.prelude?.renderFamily === "billboard")
      .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) }))
      .find(
        ({ record, shadergraph }) =>
          shadergraph?.previewTextureRejectReason === "opaque-preview-texture" &&
          shadergraph?.previewTextureSpriteUsable === false &&
          (shadergraph.roleNames || []).includes("alphaBlend") &&
          (shadergraph.roleNames || []).includes("alphaMask") &&
          Boolean(record.runtimeHints?.sizeScalar || record.runtimeHints?.durationSeconds || record.runtimeHints?.rotationDegrees),
      ) ||
    pfxItems
      .flatMap((pfxItem) =>
        (pfxItem.surfaceRecords || [])
          .filter((record) => record.prelude?.renderFamily === "billboard")
          .map((record) => ({ record, shadergraph: shadergraphByPath.get(record.relativePath) })),
      )
      .find(
        ({ record, shadergraph }) =>
          shadergraph?.previewTextureRejectReason === "opaque-preview-texture" &&
          shadergraph?.previewTextureSpriteUsable === false &&
          (shadergraph.roleNames || []).includes("alphaBlend") &&
          (shadergraph.roleNames || []).includes("alphaMask") &&
          Boolean(record.runtimeHints?.sizeScalar || record.runtimeHints?.durationSeconds || record.runtimeHints?.rotationDegrees),
      );
  assert.ok(opaqueAlphaMask, "expected runtime-bound opaque alphaMask projectile surface");

  assert.match(appJs, /function runtimeEffectPreviewTextureNeedsRuntimeAlphaMap\(item,\s*pfxItem = null,\s*entry = \{\}\)/);
  assert.match(appJs, /const hasRuntimeFallbackMaterialEvidence =/);
  assert.match(appJs, /if \(roleNames\.includes\("alphaMask"\) && item\?\.previewTextureRejectReason === "opaque-preview-texture"\)/);
  assert.match(appJs, /return hasRuntimeFallbackMaterialEvidence;/);
  assert.match(appJs, /runtimeAlphaMap: runtimeEffectPreviewTextureNeedsRuntimeAlphaMap\(shadergraphItem,\s*entry\.pfxItem,\s*entry\)/);
});

test("effect shadergraph manifest preserves sampler channel used by output alpha", () => {
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const surface5 = shadergraphByPath.get(
    "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[5].shadergraph",
  );
  const surface83 = shadergraphByPath.get(
    "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[83].shadergraph",
  );
  const surface128 = shadergraphByPath.get(
    "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[128].shadergraph",
  );
  assert.ok(surface5, "expected Adagio ult enemy surface 5 fixture");
  assert.ok(surface83, "expected Adagio ult enemy surface 83 fixture");
  assert.ok(surface128, "expected Adagio ult enemy surface 128 fixture");
  assert.deepEqual(surface5.previewAlphaSourceChannels, ["z"]);
  assert.deepEqual(surface83.previewAlphaSourceChannels, ["z"]);
  assert.deepEqual(surface128.previewAlphaSourceChannels, ["y"]);
});

test("effect shadergraph manifest preserves HDR tint colors used by runtime PFX shaders", () => {
  const shadergraphByPath = new Map((effectShadergraphManifest.items || []).map((item) => [item.relativePath, item]));
  const surface83 = shadergraphByPath.get(
    "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[83].shadergraph",
  );
  const surface128 = shadergraphByPath.get(
    "Effects/Adagio/Adagio_Ult_Enemy.assetbundle/Adagio_Ult_Enemy.Surface[128].shadergraph",
  );
  assert.ok(surface83, "expected Adagio ult enemy surface 83 fixture");
  assert.ok(surface128, "expected Adagio ult enemy surface 128 fixture");
  assert.deepEqual(
    surface83.inlineColors.map((color) => color.hex),
    ["#00B3FF", "#FFB380"],
  );
  assert.ok(
    surface128.inlineColors.some((color) => color.hex === "#80FFB3"),
    "expected Adagio ult enemy surface 128 to keep the shader's cyan-green HDR tint",
  );
});

test("viewer uses CFF0 runtime locator transforms for projectile previews", () => {
  const boundProjectileStatusBlock = appJs.match(/const RUNTIME_EFFECT_BOUND_PROJECTILE_STATUSES = new Set\(\[[\s\S]*?\]\);/)?.[0] || "";
  assert.match(boundProjectileStatusBlock, /native-runtime-locator-transform/);
  assert.match(appJs, /function runtimeLocatorPositionFromManifest\(item\)/);
  assert.match(appJs, /function runtimeLocatorVectorFromManifest\(item,\s*field\)/);
  assert.match(appJs, /item\.bindingStatus === "native-runtime-locator-transform"/);
  assert.match(appJs, /kind: "model-root-offset"/);
  assert.match(appJs, /localRotation: runtimeLocatorVectorFromManifest\(item,\s*"runtimeLocatorRotation"\)/);
  assert.match(appJs, /localScale: runtimeLocatorVectorFromManifest\(item,\s*"runtimeLocatorScale"\)/);
  assert.match(appJs, /transformEvidence: item\.runtimeLocatorTransformEvidence \|\| ""/);
  assert.match(appJs, /nativeProjectileModes: runtimeManifestListValues\(item\.nativeProjectileModes\)/);
  assert.match(appJs, /nativeProjectileLateralOffsets: runtimeManifestNumericListValues\(item\.nativeProjectileLateralOffsets\)/);
  assert.match(appJs, /projectileMode: runtimeManifestListValues\(item\.nativeProjectileModes\)\[0\] \|\| ""/);
  assert.match(appJs, /lateralOffsets: runtimeManifestNumericListValues\(item\.nativeProjectileLateralOffsets\)/);
  assert.match(appJs, /bindingTarget\.localPosition/);
  assert.match(appJs, /preview\.userData\.projectileOrigin\.copy\(bindingTarget\.localPosition\)/);
});

test("viewer promotes CFF0 resolved effect instances only when resource action binding and timing evidence all exist", () => {
  const pfxPaths = new Set(effectPfxManifest.items.map((item) => item.relativePath));
  const eligibleRows = cff0EffectInstanceGraph.items.filter((row) => {
    const pfxResources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || [])].filter(
      (resourcePath) => /\.pfx$/i.test(resourcePath) && pfxPaths.has(resourcePath),
    );
    return (
      pfxResources.length > 0 &&
      (row.resolvedActionKeys || []).length > 0 &&
      (row.resolvedBindingTargets || []).length > 0 &&
      (row.resolvedStartSeconds || []).length > 0
    );
  });
  const multiStartRows = eligibleRows.filter(
    (row) => new Set((row.resolvedStartSeconds || []).map(Number).filter(Number.isFinite)).size > 1,
  );
  assert.ok(eligibleRows.length > 10000, "expected broad CFF0 runtime evidence coverage");
  assert.ok(multiStartRows.length > 20, "expected CFF0 rows with multiple runtime start times");
  assert.match(appJs, /function runtimeEffectPreviewTimingKey\(entry\)/);
  assert.match(appJs, /runtimeEffectPreviewTimingKey\(entryContext\)/);
  assert.match(appJs, /function runtimeEffectCff0ResourcePaths\(row,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectCff0ActionKeys\(row\)/);
  assert.match(appJs, /function runtimeEffectCff0StartSeconds\(row\)/);
  assert.match(appJs, /function runtimeEffectCff0BindingTarget\(row,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectCff0EntriesForItem\(item = activeManifestItem\)/);
  assert.match(appJs, /sourceKind: "cff0-effect-instance"/);
  assert.match(appJs, /id: `cff0-effect-instance:\$\{row\.id \|\| row\.effectToken \|\| resourcePath\}`/);
  assert.match(appJs, /for \(const startSeconds of runtimeEffectCff0StartSeconds\(row\)\) \{/);
  assert.match(appJs, /runtimeBinding:\s*\{[\s\S]*startSeconds,\s*timelineTimes: startSeconds !== null \? \[startSeconds\] : \[\]/);
  assert.match(appJs, /for \(const entry of runtimeEffectCff0EntriesForItem\(item\)\) \{/);
  assert.match(appJs, /if \(!runtimeEffectShouldPreviewForAnimation\(entry,\s*animation\)\) continue;/);
  assert.match(appJs, /pushEntry\(entry\);/);
});

test("viewer preserves CFF0 action effects that start at zero seconds", () => {
  const ringoAbilityRows = cff0EffectInstanceGraph.items.filter((row) => {
    const text = [
      row.ownerLabel,
      row.effectToken,
      ...(row.resolvedActionKeys || []),
      ...(row.nativeActionKeys || []),
      ...(row.resolvedResourcePaths || []),
      ...(row.resourcePaths || []),
      ...(row.resolvedBindingTargets || []),
      ...(row.targetBindTokens || []),
    ].join(" ");
    return (
      row.ownerLabel === "Ringo_DefaultSkin" &&
      /ability02/i.test(text) &&
      /\.pfx/i.test(text) &&
      /Bone_RightHand_Aura|rHand_bnd|Bone_CenterMass|spineC/.test(text) &&
      [...(row.resolvedStartSeconds || []), ...(row.nativeRuntimeStartSeconds || []), ...(row.projectileRuntimeStartSeconds || [])].some(
        (value) => Number(value) === 0,
      )
    );
  });

  assert.ok(ringoAbilityRows.length > 0, "expected CFF0 rows with action/resource/strong binding and a 0s start time");
  assert.match(appJs, /function uniqueSortedNumbers\(values\)/);
  assert.match(appJs, /function runtimeEffectCff0StartSeconds\(row\)[\s\S]*return uniqueSortedNumbers\(/);
});

test("viewer recovers CFF0 withdraw actions from explicit effect tokens when native action keys are absent", () => {
  const krulWithdrawRows = cff0EffectInstanceGraph.items.filter((row) => {
    const actionKeys = [
      ...(row.resolvedActionKeys || []),
      ...(row.projectileActionKeys || []),
      ...(row.nativeActionKeys || []),
      ...(row.inheritedActionKeys || []),
    ];
    const pfxResources = [...(row.resolvedResourcePaths || []), ...(row.resourcePaths || [])].filter((resourcePath) =>
      /Hero009_S2_Withdraw.*\.pfx$/i.test(resourcePath),
    );
    const startSeconds = [
      ...(row.resolvedStartSeconds || []),
      ...(row.nativeRuntimeStartSeconds || []),
      ...(row.projectileRuntimeStartSeconds || []),
    ];
    const bindingTokens = [
      ...(row.resolvedBindingTargets || []),
      ...(row.nativeBindingTargets || []),
      ...(row.targetBindTokens || []),
      ...(row.runtimeBindTokens || []),
    ];
    return (
      row.ownerLabel === "Krul_Skin_Summer" &&
      /^Effect_Hero009_Withdraw/.test(row.effectToken || "") &&
      pfxResources.length > 0 &&
      actionKeys.length === 0 &&
      startSeconds.some((value) => Number(value) === 0) &&
      bindingTokens.length > 0
    );
  });

  assert.ok(krulWithdrawRows.length > 0, "expected Krul summer withdraw CFF0 rows with resource/timing/binding but no action keys");
  assert.match(appJs, /function runtimeEffectCff0ActionKeyFromEffectToken\(row\)/);
  assert.match(appJs, /const effectTokenActionKey = runtimeEffectCff0ActionKeyFromEffectToken\(row\);/);
  assert.match(appJs, /if \(effectTokenActionKey\) keys\.push\(effectTokenActionKey\);/);
});

test("viewer prefers CFF0 binding tokens that resolve to runtime bone slots", () => {
  const ambiguousRingoRows = cff0EffectInstanceGraph.items.filter((row) => {
    const targets = [...(row.resolvedBindingTargets || []), ...(row.targetBindTokens || []), ...(row.runtimeBindTokens || [])];
    return (
      row.ownerLabel === "Ringo_DefaultSkin" &&
      targets.includes("Bone_CenterMass") &&
      (targets.includes("Bone_RightHand_Aura") || targets.includes("rHand_bnd"))
    );
  });

  assert.ok(ambiguousRingoRows.length > 0, "expected CFF0 rows with both unresolved bone names and runtime bind slots");
  assert.match(appJs, /slot\.slotName === hook\.boneToken \|\| slot\.bindToken === hook\.boneToken/);
  assert.match(appJs, /function runtimeEffectCff0BindingTargetScore\(target,\s*token,\s*row\)/);
  assert.match(appJs, /const candidates = \[\];[\s\S]*candidates\.push\(\{ target,\s*token,\s*score: runtimeEffectCff0BindingTargetScore\(target,\s*token,\s*row\) \}\);/);
  assert.match(appJs, /candidates\.sort\(\(left,\s*right\) => right\.score - left\.score/);
});

test("viewer resolves CFF0 center-mass bindings through hashed GLB bone aliases when slots are missing", () => {
  const ringoConfig = runtimeBindingConfig.items.find((item) => item.modelLabel === "Ringo_DefaultSkin");
  assert.ok(ringoConfig, "expected Ringo runtime binding config");
  assert.ok(
    ringoConfig.slots.some((slot) => /Bone_CenterMass/.test(slot.skinrepTargetBones || "") && /spineC/.test(slot.skinrepTargetBindTokens || "")),
    "expected Ringo slot-table evidence for Bone_CenterMass/spineC",
  );
  assert.equal(
    ringoConfig.slots.some((slot) => slot.slotName === "Bone_CenterMass" || slot.bindToken === "spineC_bnd"),
    false,
    "Ringo config currently lacks an explicit center-mass runtime slot",
  );

  const centerMassRows = cff0EffectInstanceGraph.items.filter((row) => {
    const targets = [...(row.resolvedBindingTargets || []), ...(row.targetBindTokens || []), ...(row.runtimeBindTokens || [])];
    return row.ownerLabel === "Ringo_DefaultSkin" && targets.includes("Bone_CenterMass") && targets.includes("spineC");
  });
  assert.ok(centerMassRows.length > 0, "expected CFF0 center-mass/spineC effect rows");

  for (const relativePath of [
    "hero_assets_glb_skinned_pbr/Characters/Ringo/Art/ringo.glb",
    "hero_assets_glb_skinned_pbr/Characters/Ringo/Art/ringo_pirate.glb",
  ]) {
    const glb = glbJsonChunk(relativePath);
    const jointNodeNames = new Set((glb.skins?.[0]?.joints || []).map((nodeIndex) => glb.nodes?.[nodeIndex]?.name).filter(Boolean));
    assert.ok(jointNodeNames.has("3039CA80"), `expected ${relativePath} to contain the hashed center-mass bone`);
  }

  assert.match(appJs, /function runtimeEffectBoneAliasNames\(boneToken\)/);
  assert.match(appJs, /"3039CA80"/);
  assert.match(appJs, /for \(const alias of runtimeEffectBoneAliasNames\(boneToken\)\)/);
  assert.match(appJs, /normalizedRuntimeBoneName\(bone\?\.name\) === normalizedRuntimeBoneName\(alias\)/);
});

test("viewer upgrades CFF0 effect-channel projectile instances with projectile runtime bindings", () => {
  assert.match(appJs, /function runtimeEffectCff0ProjectileBinding\(row,\s*resourcePath,\s*item = activeManifestItem\)/);
  assert.match(appJs, /function runtimeEffectCff0ProjectileBindingTarget\(row,\s*item = activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectDefinitionProjectilesForItem\(item\)/);
  assert.match(appJs, /projectile\.resourcePath === resourcePath/);
  assert.match(appJs, /projectile\.pairedImpactResourcePaths\.includes\(resourcePath\)/);
  assert.match(appJs, /runtimeNativeProjectileActionMatches\(\{ actionKeys \},\s*projectile\)/);
  assert.match(appJs, /const cff0ProjectileBinding = runtimeEffectCff0ProjectileBinding\(row,\s*resourcePath,\s*item\);/);
  assert.match(appJs, /projectileSourceEntry: cff0ProjectileBinding\?\.impact \? runtimeEffectCff0ProjectileSourceEntry\(cff0ProjectileBinding\) : null/);
  assert.match(appJs, /function runtimeEffectCff0ProjectileSourceEntry\(cff0ProjectileBinding\)/);
  assert.match(appJs, /const projectileBindingTarget = runtimeEffectCff0ProjectileBindingTarget\(row,\s*item\);/);
  assert.match(appJs, /if \(projectileBindingTarget\) return projectileBindingTarget;/);
});

test("viewer expands native projectile lateral offsets into separate projectile previews", () => {
  assert.match(appJs, /function runtimeEffectProjectileLateralOffsets\(projectile\)/);
  assert.match(appJs, /for \(const \[offsetIndex,\s*lateralOffset\] of runtimeEffectProjectileLateralOffsets\(projectile\)\.entries\(\)\)/);
  assert.match(appJs, /projectileLateralOffset: lateralOffset/);
  assert.match(appJs, /const lateralOffsetKey = Number\.isFinite\(Number\(bindingTarget\?\.lateralOffset\)\)/);
  assert.match(appJs, /runtimeEffectProjectileLateralOffset\(entry\)/);
  assert.match(appJs, /rotateRuntimeEffectProjectileDirection\(direction,\s*lateralOffset\)/);
});

test("viewer drives projectile travel from recovered native trajectory modes", () => {
  const projectileRuntime = JSON.parse(fs.readFileSync(path.join(root, "viewer", "effect-projectile-runtime-manifest.json"), "utf8"));
  assert.ok(
    projectileRuntime.items.some((row) => row.nativeProjectileModes && row.runtimeLocatorPosition),
    "expected projectile runtime rows with native trajectory mode and locator transforms",
  );
  assert.match(appJs, /function runtimeEffectProjectileMode\(entry\)/);
  assert.match(appJs, /function runtimeEffectProjectileDirection\(entry\)/);
  assert.match(appJs, /function rotateRuntimeEffectProjectileDirection\(direction,\s*lateralOffset\)/);
  assert.match(appJs, /projectileMode === "1"/);
  assert.match(appJs, /projectileMode === "2"/);
  assert.match(appJs, /projectileMode === "4"/);
  assert.match(appJs, /preview\.userData\.projectileDirection = new THREE\.Vector3\(0,\s*0,\s*1\);/);
  assert.match(appJs, /preview\.userData\.projectileDirection\.copy\(runtimeEffectProjectileDirection\(entry\)\);/);
  assert.match(appJs, /preview\.position\.addScaledVector\(direction,\s*progress \* distance\);/);
  assert.match(appJs, /const forwardDirection = new THREE\.Vector3\(0,\s*0,\s*1\);/);
  assert.doesNotMatch(appJs, /runtimeEffectHorizontalDirectionFromPosition\(runtimeEffectProjectileLocalPosition\(entry\)\)/);
  assert.doesNotMatch(appJs, /preview\.position\.x \+= progress \* distance;/);
  assert.doesNotMatch(appJs, /preview\.position\.z -= progress \* distance \* 0\.18;/);
});

test("viewer exposes skinned GLB format for mesh deformation previews", () => {
  assert.match(indexHtml, /data-preview-mode="skinned"[\s\S]*动态模型/);
  assert.match(indexHtml, /<option value="skinned" selected hidden>动态模型<\/option>/);
  assert.match(appJs, /skinned-glb-pbr-manifest\.json/);
  assert.match(appJs, /hero_assets_glb_skinned_pbr/);
  assert.match(appJs, /manifests\.skinned/);
  assert.match(appJs, /formatSelect\.value = "skinned"/);
});

test("viewer can load optional related attachment resources with a skinned model", () => {
  assert.match(indexHtml, /id="attachmentSelect"/);
  assert.match(indexHtml, /相关附属资源/);
  assert.match(appJs, /const attachmentSelect = document\.querySelector\("#attachmentSelect"\);/);
  assert.match(appJs, /let activeAttachments = \[\];/);
  assert.match(appJs, /function attachmentAssetRoot\(attachment\)/);
  assert.match(appJs, /function attachmentAssetRoots\(attachment\)/);
  assert.match(appJs, /async function loadSelectedAttachments\(\)/);
  assert.match(appJs, /item\.attachments/);
  assert.match(appJs, /attachmentSelect\.addEventListener\("change"/);
  assert.match(appJs, /附属资源/);
});

test("viewer drives selected attachment resources with their own animation clips", () => {
  assert.match(appJs, /async function loadAttachmentAnimationClip\(attachment\)/);
  assert.match(appJs, /buildResourcePath\(attachment\.animationPath\)/);
  assert.match(appJs, /object\.userData\.attachmentClip = clip;/);
  assert.match(appJs, /function nativeClipPoseByBoneIndex\(clip,\s*timeSeconds\)/);
  assert.match(appJs, /function applyAttachmentAnimationsAtTime\(timeSeconds\)/);
  assert.match(appJs, /applyAttachmentAnimationsAtTime\(manualAnimationTime\);/);
  assert.match(appJs, /applyPoseToSkinnedMeshesInObject\(object,\s*1,\s*poseByIndex,\s*\{\s*includeTranslation:\s*true,\s*includeScale:\s*false\s*\}\)/);
});

test("viewer does not interpolate the final native frame back to the first frame", () => {
  assert.equal(
    [...appJs.matchAll(/const nextFrameIndex = Math\.min\(frameIndex \+ 1,\s*[^\n]+\.frameCount - 1\);/g)].length,
    2,
  );
  assert.doesNotMatch(appJs, /const nextFrameIndex = \(frameIndex \+ 1\) % [^\n]+\.frameCount;/);
});

test("viewer exposes an all-resource static model format", () => {
  assert.match(indexHtml, /<option value="all" data-description="包含全部已转 GLB 的资源，适合查找非英雄或遗漏模型。">全部资源模型<\/option>/);
  assert.match(appJs, /all-glb-pbr-manifest\.json/);
  assert.match(appJs, /all_assets_glb_textured_pbr/);
  assert.match(appJs, /manifests\.all/);
});

test("viewer applies pose preview transforms to loaded SkinnedMesh bones", () => {
  assert.match(appJs, /applyAnimationPoseToSkinnedMeshes/);
  assert.match(appJs, /isSkinnedMesh/);
  assert.match(appJs, /skeleton\.bones/);
  assert.match(appJs, /basePosition/);
  assert.match(appJs, /pose\.boneIndex/);
  assert.match(appJs, /bindMode/);
});

test("viewer resets to bind pose when pose loop is off", () => {
  assert.match(appJs, /let activePoseBlend = 0;/);
  assert.match(appJs, /poseLoopToggle\.addEventListener\("change", \(\) => \{\s*activePoseBlend = 0;\s*syncAnimationStats\(\);\s*\}\);/s);
});

test("viewer does not drive skinned meshes with sparse recovered poses", () => {
  assert.match(appJs, /const MIN_SKINNED_POSE_COVERAGE = 0\.75;/);
  assert.match(appJs, /poseByIndex\.size < Math\.ceil\(bones\.length \* MIN_SKINNED_POSE_COVERAGE\)/);
});

test("viewer keeps bind translations while previewing guessed poses", () => {
  assert.match(appJs, /includeTranslation:\s*options\.includeTranslation\s*\?\?\s*false/);
  assert.match(appJs, /includeScale:\s*options\.includeScale\s*\?\?\s*false/);
  assert.match(appJs, /applyAnimationPose\(activePoseBlend\);/);
});

test("viewer applies native scale only to bones weighted by supported action props", () => {
  assert.match(appJs, /function nativeScaleBoneIndicesForActiveObject\(\)/);
  const scaleMaterialFunction = appJs.match(
    /function previewNativeScaleMaterialName\(name = ""\) \{[\s\S]*?\n\}/,
  )?.[0] || "";
  assert.match(scaleMaterialFunction, /catherine_summer\\\.summer_chair_mat/);
  assert.match(scaleMaterialFunction, /hero009_pirate\\\.pirate_props_mat/);
  assert.match(appJs, /nativeScaleBoneIndicesForActiveObject\(\)[\s\S]*skinIndex[\s\S]*skinWeight/);
  assert.match(appJs, /const nativeScaleBones = nativeScaleBoneIndicesForActiveObject\(\)/);
  assert.match(appJs, /if \(!nativeScaleBones\.has\(pose\.boneIndex\)\) pose\.scale = null;/);
  const playbackFunction = appJs.match(/function applyAnimationAtTime\([\s\S]*?\n\}/)?.[0] || "";
  assert.match(playbackFunction, /applyAnimationPose\(1,\s*nativePose,\s*\{\s*includeTranslation:\s*true,\s*includeScale:\s*true\s*\}\)/);
});

test("viewer follows Taka stealth-box bone scales across every Hero011 skin", () => {
  const boxBoneNames = ["D6C3C9DB", "EB846DB6", "D1B3517B", "51D99E4E", "E3C26473", "839D54B3"];
  for (const modelName of [
    "hero011.glb",
    "hero011_chinese.glb",
    "hero011_oni.glb",
    "hero011_oni_RI.glb",
    "hero011_oni_t1.glb",
    "hero011_school.glb",
    "hero011_shin_t1.glb",
    "hero011_shin_t2.glb",
    "hero011_shin_t3.glb",
  ]) {
    const glb = glbJsonChunk(`hero_assets_glb_skinned_pbr/Characters/Hero011/Art/${modelName}`);
    const jointNames = new Set((glb.skins?.[0]?.joints || []).map((nodeIndex) => glb.nodes?.[nodeIndex]?.name));
    for (const boneName of boxBoneNames) {
      assert.ok(jointNames.has(boneName), `${modelName} is missing stealth-box bone ${boneName}`);
    }
  }

  for (const boneName of boxBoneNames) assert.match(appJs, new RegExp(boneName));
  const nativeScaleFunction = functionSource("nativeScaleBoneIndicesForActiveObject");
  assert.match(nativeScaleFunction, /heroKeyForItem\(activeManifestItem\) === "Hero011"/);
  assert.match(nativeScaleFunction, /HERO011_STEALTH_BOX_BONE_NAMES\.has\(String\(bone\?\.name/);
});

test("viewer does not flash sparse fallback poses while native animation data is loading", () => {
  assert.match(appJs, /function shouldWaitForNativeAnimationPose\(\)/);
  assert.match(appJs, /activeAnimationClipLoading && Boolean\(selectedAnimationMapping\(\)\)/);
  assert.match(appJs, /if \(shouldWaitForNativeAnimationPose\(\)\) \{\s*syncTimelineControls\(manualAnimationTime\);\s*return;\s*\}/s);
});

test("viewer loads compatible animation bindings for the active skin", () => {
  assert.match(indexHtml, /id="animationSelect"/);
  assert.match(indexHtml, /id="poseLoopToggle" type="checkbox" checked/);
  assert.match(indexHtml, /id="effectsToggle"/);
  assert.match(indexHtml, /id="animationTimeRange"/);
  assert.match(indexHtml, /id="playPauseButton"/);
  assert.match(indexHtml, /id="openExportDialogButton"[\s\S]*导出/);
  assert.match(indexHtml, /id="exportPoseGlbButton"[\s\S]*GLB/);
  assert.match(indexHtml, /id="exportPoseObjButton"[\s\S]*OBJ/);
  assert.match(indexHtml, /id="recordDialog"[\s\S]*录制展示视频/);
  assert.match(appJs, /skin-animation-bindings\.json/);
  assert.match(appJs, /animation-structure-manifest\.json/);
  assert.match(appJs, /animation-bone-mapping-manifest\.json/);
  assert.match(appJs, /trackMatchesSkeleton/);
  assert.match(appJs, /parseAnimationFamily3Clip/);
  assert.match(appJs, /readAnimationFamily3ClipFrame/);
  assert.match(appJs, /nativeAnimationPoseByBoneIndex/);
  assert.match(appJs, /nativeFrameBoneIndices/);
  assert.match(appJs, /pose\.translation\s*=\s*null/);
  assert.match(appJs, /build_resources_by_path/);
  assert.match(appJs, /applyAnimationPoseToSkeleton/);
  assert.match(appJs, /defaultAnimationIndex/);
  assert.match(appJs, /\.label\s*===\s*"Idle"/);
  assert.match(appJs, /previewEffectMaterialName/);
  assert.match(appJs, /effectsToggle\.checked/);
  assert.match(appJs, /swipe\|trail\|slash\|guob/);
  assert.match(appJs, /\.slerp\(/);
  assert.match(appJs, /动作/);
  assert.match(appJs, /syncTimelineControls/);
  assert.match(appJs, /applyAnimationAtTime/);
  assert.match(appJs, /animationTimeRange\.addEventListener\("input"/);
});

test("viewer keeps top stats focused on the model and selected action", () => {
  assert.match(appJs, /activeAnimationStatsText = animation \? `动作 \$\{animationOptionLabel\(animation\)\}` : "";/);
  assert.doesNotMatch(appJs, /function animationStructureStats/);
  assert.doesNotMatch(appJs, /function animationBoneMappingStats/);
  assert.doesNotMatch(appJs, /function animationPoseStats/);
});

test("viewer gates embedded Poseidon throne primitives from native scale keys without hiding the weapon shaft", () => {
  const previewEffectFunction = appJs.match(/function previewEffectMaterialName\(name = ""\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(previewEffectFunction, /waterOpaque/);
  assert.match(appJs, /function previewAnimatedEffectMaterialName\(name = ""\)/);
  assert.match(appJs, /function dominantSkinJointIndex\(mesh\)/);
  assert.match(appJs, /function nativeTrackHasScaleKeys\(boneIndex\)/);
  assert.match(appJs, /function animatedEffectMeshVisible\(mesh\)/);
  assert.match(appJs, /WaterShader/);
  assert.match(appJs, /Throne/);
  assert.match(appJs, /NATIVE_SCALE_MASK/);
  assert.match(appJs, /child\.visible = effectsToggle\.checked && animatedEffectMeshVisible\(child\)/);
  assert.doesNotMatch(appJs, /effectsToggle\.checked \|\| animatedEffectMeshVisible\(child\)/);
  assert.doesNotMatch(appJs, /isRecallAnimation\(animation = selectedAnimation\(\)\)/);
});

test("viewer previews custom water shader materials with water tint instead of black mask textures", () => {
  assert.match(appJs, /function previewWaterShaderMaterialName\(name = ""\)/);
  assert.match(appJs, /function applyPreviewMaterialFixups\(object\)/);
  assert.match(appJs, /WaterShader\|waterOpaque/);
  assert.match(appJs, /function waterShaderAlphaMaskTexture\(texture,\s*alphaFloor\)/);
  assert.match(appJs, /const WATER_SHADER_CRYSTAL_OPACITY = 1;/);
  assert.match(appJs, /const sourceMap = material\.map;/);
  assert.match(appJs, /material\.alphaMap = isWaterOpaque \? waterShaderAlphaMaskTexture\(sourceMap,\s*WATER_SHADER_OPAQUE_ALPHA_FLOOR\) : null;/);
  assert.match(appJs, /material\.emissiveMap = sourceMap;/);
  assert.match(appJs, /material\.map = null/);
  assert.match(appJs, /material\.transparent = isWaterOpaque;/);
  assert.match(appJs, /material\.opacity = isWaterOpaque \? 0\.86 : WATER_SHADER_CRYSTAL_OPACITY;/);
  assert.match(appJs, /material\.envMapIntensity = isWaterOpaque \? 0\.28 : 0\.16;/);
  assert.match(appJs, /material\.flatShading = !isWaterOpaque;/);
  assert.match(appJs, /applyPreviewMaterialFixups\(activeObject\)/);
});

test("viewer previews guob shader discs as inverted-alpha effects instead of white plates", () => {
  assert.match(appJs, /function previewGuobMaterialName\(name = ""\)/);
  assert.match(appJs, /const GUOB_EFFECT_OPACITY = 0\.38;/);
  assert.match(appJs, /function invertedAlphaMaskTexture\(texture\)/);
  assert.match(appJs, /const alpha = Math\.round\(\(1 - mask\) \* 255\);/);
  assert.match(appJs, /function applyGuobPreviewMaterial\(material\)/);
  assert.match(appJs, /material\.alphaMap = invertedAlphaMaskTexture\(sourceMap\);/);
  assert.match(appJs, /material\.color\.set\(0x10353d\);/);
  assert.match(appJs, /material\.opacity = GUOB_EFFECT_OPACITY;/);
  assert.match(appJs, /previewGuobMaterialName\(material\?\.name \|\| ""\)/);
});

test("viewer neutralizes character shadergraphs whose diffuse map was exported as metallic roughness", () => {
  const materialTextureRoles = fs.readFileSync(path.join(root, "reports", "material_texture_roles.tsv"), "utf8");
  assert.match(materialTextureRoles, /kraken\.Kraken_mat\.shadergraph\tbaseColor\tsampler35/);
  assert.match(materialTextureRoles, /kraken\.Kraken_mat\.shadergraph\tmetallicRoughness\tsampler35/);
  assert.match(appJs, /function previewSharedDiffuseMetallicRoughnessName\(name = ""\)/);
  assert.match(appJs, /function materialTexturesShareImage\(left,\s*right\)/);
  assert.match(appJs, /function applySharedDiffuseMetallicRoughnessPreviewMaterial\(material\)/);
  assert.match(appJs, /material\.roughnessMap = null;/);
  assert.match(appJs, /material\.metalnessMap = null;/);
  assert.match(appJs, /material\.roughness = Math\.max\(material\.roughness \?\? 0,\s*0\.92\);/);
  assert.match(appJs, /material\.metalness = 0;/);
  assert.match(appJs, /material\.envMapIntensity = Math\.min\(material\.envMapIntensity \?\? 1,\s*0\.12\);/);
  assert.match(appJs, /previewSharedDiffuseMetallicRoughnessName\(material\?\.name \|\| ""\)/);
});

test("viewer suppresses embedded color-only glow blobs that need native shader state", () => {
  const glbCoverage = fs.readFileSync(path.join(root, "reports", "glb_material_coverage.tsv"), "utf8");
  assert.match(glbCoverage, /kraken\.orangeGlow2_mat\.shadergraph\talpha-effect-color/);
  assert.match(glbCoverage, /kraken\.orangeGlow_mat\.shadergraph\talpha-effect-color/);
  assert.match(appJs, /const EMBEDDED_GLOW_PREVIEW_OPACITY = 0;/);
  assert.match(appJs, /function previewEmbeddedGlowMaterialName\(name = ""\)/);
  assert.match(appJs, /function previewEmbeddedRuntimeGlowMaterial\(material\)/);
  assert.match(appJs, /shaderPassStateFamily !== "state-9f003100"/);
  assert.match(appJs, /function applyEmbeddedGlowPreviewMaterial\(material\)/);
  assert.match(appJs, /material\.transparent = true;/);
  assert.match(appJs, /material\.opacity = EMBEDDED_GLOW_PREVIEW_OPACITY;/);
  assert.match(appJs, /material\.depthWrite = false;/);
  assert.match(appJs, /previewEmbeddedGlowMaterial\(material\)/);
});

test("viewer treats Kestrel bowstring shadergraphs as transparent runtime strips", () => {
  const glbCoverage = fs.readFileSync(path.join(root, "reports", "glb_material_coverage.tsv"), "utf8");
  const materialTextureMap = fs.readFileSync(path.join(root, "reports", "material_texture_map.tsv"), "utf8");
  const materialTextureRoles = fs.readFileSync(path.join(root, "reports", "material_texture_roles.json"), "utf8");
  const drowBowAlphaMask = path.join(
    root,
    "hero_assets_material_textures_preview",
    "Characters/Hero023/Art/hero023_drow.drow_bowAlpha_mat.alphaMask.png",
  );
  assert.match(glbCoverage, /hero023\.hero023_bowString_mat\.shadergraph\tbasecolor-textured/);
  assert.match(glbCoverage, /hero023\.hero023_bowString_mat\.shadergraph[\s\S]*?\tOPAQUE\t/);
  assert.match(glbCoverage, /hero023_drow\.drow_bowAlpha_mat\.shadergraph[\s\S]*?\tOPAQUE\t/);
  assert.match(materialTextureMap, /hero023\.hero023_bowString_mat\.shadergraph[\s\S]*?\t5,13,14,255/);
  assert.match(materialTextureRoles, /hero023_drow\.drow_bowAlpha_mat\.shadergraph[\s\S]*?"sampler84": "6D4C3EB1738BD102F373F95B72B98DA6"/);
  assert.ok(fs.existsSync(drowBowAlphaMask), "drow bow alpha shader must have its decoded runtime mask");
  assert.match(appJs, /const BOW_STRING_PREVIEW_OPACITY = 0;/);
  assert.match(appJs, /const BOW_STRING_PREVIEW_LINE_OPACITY = 0\.72;/);
  assert.match(appJs, /const BOW_STRING_SKINNED_PREVIEW_OPACITY = 0\.9;/);
  assert.match(appJs, /const BOW_STRING_SKINNED_WIDTH_SCALE = 0\.04;/);
  assert.match(appJs, /const BOW_STRING_COMPONENT_CLUSTER_DISTANCE = 8;/);
  assert.match(appJs, /const BOW_ALPHA_RUNTIME_MASKS = new Map/);
  assert.match(appJs, /function previewBowStringMaterialName\(name = ""\)/);
  assert.match(appJs, /function previewBowStringGeometryMaterialName\(name = ""\)/);
  assert.match(appJs, /function previewBowAlphaMaterialName\(name = ""\)/);
  assert.match(appJs, /function bowAlphaRuntimeMaskTexture\(materialName = "",\s*sourceTexture = null\)/);
  assert.match(appJs, /function bowAlphaFallbackMaskTexture\(texture\)/);
  assert.match(appJs, /function bowAlphaMaskTexture\(texture,\s*materialName = ""\)/);
  assert.match(appJs, /function applyBowStringPreviewMaterial\(material\)/);
  assert.match(appJs, /function applyBowStringSkinnedPreviewMaterial\(mesh,\s*materialIndex,\s*material\)/);
  assert.match(appJs, /function bowStringMaterialTriangles\(geometry,\s*materialIndex\)/);
  assert.match(appJs, /function bowStringConnectedComponents\(triangles\)/);
  assert.match(appJs, /function bowStringComponentDominantAxis\(position,\s*component\)/);
  assert.match(appJs, /function bowStringComponentClusters\(position,\s*components\)/);
  assert.match(appJs, /function bowStringSkinnedCenterlineAttribute\(geometry,\s*materialIndex\)/);
  assert.match(appJs, /function addBowStringPreviewLine\(mesh,\s*materialIndex\)/);
  assert.match(appJs, /if \(!mesh\?\.geometry \|\| mesh\.isSkinnedMesh\) return;/);
  assert.doesNotMatch(appJs, /function bowStringPreviewAxisMask\(size\)/);
  assert.doesNotMatch(appJs, /bowStringPreviewAxisMask/);
  assert.match(appJs, /geometry\.setAttribute\("bowStringPreviewCenterline",\s*attribute\);/);
  assert.match(appJs, /attribute vec3 bowStringPreviewCenterline;/);
  assert.match(appJs, /uniform float bowStringPreviewWidthScale;/);
  assert.match(appJs, /transformed = mix\(bowStringPreviewCenterline, transformed, bowStringPreviewWidthScale\);/);
  assert.match(appJs, /for \(const cluster of bowStringComponentClusters\(position,\s*components\)\) \{/);
  assert.match(appJs, /for \(const component of cluster\.components\) \{/);
  assert.match(appJs, /const axis = cluster\.axis;/);
  assert.match(appJs, /target\.copy\(center\);/);
  assert.match(appJs, /target\[axis\] = point\[axis\];/);
  assert.match(appJs, /if \(previewBowStringGeometryMaterialName\(material\.name \|\| ""\)\) centerlineAttribute = bowStringSkinnedCenterlineAttribute\(mesh\.geometry,\s*materialIndex\);/);
  assert.match(appJs, /if \(isBowAlpha\) \{/);
  assert.match(appJs, /material\.alphaMap = bowAlphaMaskTexture\(sourceMap,\s*material\.name \|\| ""\);/);
  assert.match(appJs, /material\.alphaTest = 0\.35;/);
  assert.match(appJs, /material\.transparent = true;/);
  assert.match(appJs, /material\.opacity = BOW_STRING_PREVIEW_OPACITY;/);
  assert.match(appJs, /material\.visible = false;/);
  assert.match(appJs, /material\.opacity = BOW_STRING_SKINNED_PREVIEW_OPACITY;/);
  assert.match(appJs, /material\.visible = true;/);
  assert.match(appJs, /const isBowAlpha = previewBowAlphaMaterialName\(material\.name \|\| ""\);/);
  assert.match(appJs, /material\.color\.set\(isBowAlpha \? 0xffffff : 0xd7e5df\);/);
  assert.match(appJs, /material\.emissiveIntensity = isBowAlpha \? 0 : 0\.35;/);
  assert.match(appJs, /material\.depthWrite = false;/);
  assert.match(appJs, /material\.envMapIntensity = 0;/);
  assert.match(appJs, /new THREE\.LineBasicMaterial/);
  assert.match(appJs, /mesh\.add\(line\);/);
  assert.match(appJs, /if \(child\.isSkinnedMesh\) applyBowStringSkinnedPreviewMaterial\(child,\s*materialIndex,\s*material\);/);
  assert.match(appJs, /else \{\s*applyBowStringPreviewMaterial\(material\);\s*addBowStringPreviewLine\(child,\s*materialIndex\);\s*\}/);
  assert.match(appJs, /previewBowStringMaterialName\(material\?\.name \|\| ""\)/);
});

test("viewer localizes labels and exposes model health diagnostics", () => {
  assert.match(indexHtml, /虚荣资源/);
  assert.match(indexHtml, /英雄模型查看器/);
  assert.match(indexHtml, /英雄 \/ 搜索/);
  assert.match(indexHtml, /模型类别/);
  // 材质诊断 UI 已删（顶部信息太杂），底层 materialHealthSummary 逻辑保留
  assert.doesNotMatch(indexHtml, /材质诊断/);
  assert.match(appJs, /import \{ localizeAnimationName \} from "\.\/locale\.js";/);
  assert.match(appJs, /skinCatalog = new Map/);
  assert.match(appJs, /heroCatalog = new Map/);
  assert.match(appJs, /function materialHealthSummary/);
  assert.match(appJs, /modelHealthText/);
});

test("viewer surfaces native binary version compatibility in health diagnostics", () => {
  assert.match(appJs, /nativeBinaryVersionAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-binary-version-audit\.json"\)/);
  assert.match(appJs, /function nativeBinaryVersionAuditHealthSummary/);
  assert.match(appJs, /跨构建参考/);
});

test("viewer surfaces active preview profile capture state in health diagnostics", () => {
  assert.match(appJs, /heroPreviewProfileCandidateSummary/);
  assert.match(appJs, /fetchJson\("\.\/hero-preview-profile-candidates\.json"\)/);
  assert.match(appJs, /function heroPreviewProfileCandidateHealthSummary/);
  assert.match(appJs, /预览光照 Profile/);
  assert.match(appJs, /runtimeSelectorCaptureReadinessState/);
  assert.match(appJs, /runtimeSelectorCaptureMissingGateEvidence/);
  assert.match(appJs, /runtimeSelectorCaptureReadyLightProbeEvidenceSequenceCount/);
  assert.match(appJs, /runtimeSelectorCaptureLightProbeReadyForManualReview/);
  assert.match(appJs, /light\/probe 捕获未闭合/);
  assert.match(appJs, /profile 接管关闭/);
});

test("viewer surfaces current runtime key selector capture targets without enabling light probe takeover", () => {
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.hookTargetRows, 17);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.scriptEvidenceMismatchRows, 0);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.runtimeSelectorHooksReady, true);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.activePreviewKeyHooksReady, true);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.levelVisualsHooksReady, true);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.lightProbeHooksReady, true);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.runtimeLightProbeValuesRecovered, false);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.rendererLightProbeTakeoverAllowed, false);
  assert.equal(currentNativeRuntimeKeySelectorCaptureTargets.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeRuntimeKeySelectorCaptureTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-runtime-key-selector-capture-targets\.json"\)/);
  assert.match(appJs, /function currentNativeRuntimeKeySelectorCaptureTargetHealthSummary/);
  assert.match(appJs, /runtime key selector 捕获目标/);
  assert.match(appJs, /Frida 事件覆盖完整/);
  assert.match(appJs, /runtime 光照值未导入/);
  assert.match(appJs, /light\/probe 接管关闭/);
});

test("viewer surfaces runtime key selector capture summary without promoting renderer takeover", () => {
  assert.equal(runtimeKeySelectorCaptureSummary.captureImported, false);
  assert.equal(runtimeKeySelectorCaptureSummary.captureStatus, "runtime-selector-capture-missing");
  assert.equal(runtimeKeySelectorCaptureSummary.gateEvidence.runtimeCaptureReadinessState, "capture-not-imported");
  assert.deepEqual(runtimeKeySelectorCaptureSummary.gateEvidence.missingGateEvidence, [
    "runtime-key-selector-capture-not-imported",
  ]);
  assert.equal(runtimeKeySelectorCaptureSummary.gateEvidence.runtimeCaptureReadyForManualReview, false);
  assert.equal(runtimeKeySelectorCaptureSummary.gateEvidence.runtimeLightProbeCaptureReadyForManualReview, false);
  assert.match(appJs, /runtimeKeySelectorCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/runtime-key-selector-capture-summary\.json"\)/);
  assert.match(appJs, /function runtimeKeySelectorCaptureHealthSummary/);
  assert.match(appJs, /runtime selector capture：/);
  assert.match(appJs, /profile 捕获未闭合/);
  assert.match(appJs, /light\/probe 捕获未闭合/);
  assert.match(appJs, /profile 接管关闭/);
});

test("viewer surfaces current native light probe chain without enabling renderer takeover", () => {
  assert.equal(characterLitProbeBlockerAudit.summary.rowsWithViewerShaderPortFormulaReady, 339);
  assert.equal(characterLitProbeBlockerAudit.summary.rowsWithRequiredRuntimeLightBindings, 342);
  assert.equal(characterLitProbeBlockerAudit.summary.rowsBlockedOnlyByRuntimeValues, 332);
  assert.equal(characterLitProbeBlockerAudit.summary.rowsWithRuntimeSceneTextureSamplers, 7);
  assert.match(appJs, /currentNativeLightProbeChainSummary/);
  assert.match(appJs, /characterLitProbeBlockerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-light-probe-chain-audit\.json"\)/);
  assert.match(appJs, /fetchJson\("\.\/character-lit-probe-blocker-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLightProbeChainHealthSummary/);
  assert.match(appJs, /光照 Probe 链/);
  assert.match(appJs, /Profile payload 路径已恢复/);
  assert.match(appJs, /行 shader 公式 ready/);
  assert.match(appJs, /行 runtime uniform 已闭合/);
  assert.match(appJs, /行只差 runtime 光照值/);
  assert.match(appJs, /行还差 scene texture/);
  assert.match(appJs, /行普通贴图缺口/);
  assert.match(appJs, /active payload 未恢复/);
  assert.match(appJs, /light\/probe 接管关闭/);
});

test("viewer surfaces native builder method semantics in health diagnostics", () => {
  assert.match(appJs, /nativeEffectBuilderMethodSemanticsSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-effect-builder-method-semantics\.json"\)/);
  assert.match(appJs, /function nativeEffectBuilderMethodSemanticsHealthSummary/);
  assert.match(appJs, /Builder 字段/);
});

test("viewer surfaces native particle runtime schema in health diagnostics", () => {
  assert.match(appJs, /nativeParticleRuntimeSchemaSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-particle-runtime-schema\.json"\)/);
  assert.match(appJs, /function nativeParticleRuntimeSchemaHealthSummary/);
  assert.match(appJs, /粒子 Runtime/);
  assert.match(appJs, /beam 参数/);
  assert.match(appJs, /状态数组/);
  assert.match(appJs, /PFX emitter 映射/);
  assert.match(appJs, /callback 更新/);
  assert.match(appJs, /callback resolver/);
});

test("viewer surfaces current-build native particle callback table scan in health diagnostics", () => {
  assert.match(appJs, /nativeParticleCallbackTableScanSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-particle-callback-table-scan\.json"\)/);
  assert.match(appJs, /function nativeParticleCallbackTableScanHealthSummary/);
  assert.match(appJs, /粒子 callback 表/);
  assert.match(appJs, /key 命中/);
  assert.match(appJs, /key 缺失/);
});

test("viewer surfaces current-build native particle callback semantic classes in health diagnostics", () => {
  assert.match(appJs, /nativeParticleCallbackSemanticsSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-particle-callback-semantics\.json"\)/);
  assert.match(appJs, /function nativeParticleCallbackSemanticsHealthSummary/);
  assert.match(appJs, /粒子 callback 语义/);
  assert.match(appJs, /常量标量/);
});

test("viewer surfaces PFX native callback capture targets without enabling rendering", () => {
  assert.match(appJs, /pfxNativeCallbackRuntimeTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/pfx-native-callback-runtime-targets\.json"\)/);
  assert.match(appJs, /function pfxNativeCallbackRuntimeTargetHealthSummary/);
  assert.match(appJs, /PFX native callback 捕获目标/);
});

test("viewer surfaces PFX native callback capture samples without enabling rendering", () => {
  assert.match(appJs, /pfxNativeCallbackCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/pfx-native-callback-capture-summary\.json"\)/);
  assert.match(appJs, /function pfxNativeCallbackCaptureHealthSummary/);
  assert.match(appJs, /PFX native callback 捕获/);
  assert.match(appJs, /未导入捕获/);
});

test("viewer surfaces native effect-channel capture targets as diagnostics", () => {
  assert.match(appJs, /effectNativeChannelCaptureTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-native-channel-capture-targets\.json"\)/);
  assert.match(appJs, /function effectNativeChannelCaptureTargetHealthSummary/);
  assert.match(appJs, /原生特效通道捕获目标/);
});

test("viewer surfaces native effect-channel capture samples as diagnostics", () => {
  assert.match(appJs, /effectNativeChannelCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-native-channel-capture-summary\.json"\)/);
  assert.match(appJs, /function effectNativeChannelCaptureHealthSummary/);
  assert.match(appJs, /原生特效通道捕获/);
  assert.match(appJs, /可完整复核/);
});

test("viewer surfaces native effect-channel static resource audit as diagnostics", () => {
  assert.match(appJs, /effectChannelStaticResourceAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-channel-static-resource-audit\.json"\)/);
  assert.match(appJs, /function effectChannelStaticResourceAuditHealthSummary/);
  assert.match(appJs, /特效静态资源审计/);
  assert.match(appJs, /token-only 无资源/);
  assert.match(appJs, /仅 selector 成对 token/);
});

test("viewer surfaces native token-only effect callsite audit as diagnostics", () => {
  assert.match(appJs, /nativeEffectTokenOnlyCallsiteAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-effect-token-only-callsite-audit\.json"\)/);
  assert.match(appJs, /function nativeEffectTokenOnlyCallsiteAuditHealthSummary/);
  assert.match(appJs, /原生 token-only 特效链/);
  assert.match(appJs, /builder 已追到 create/);
  assert.match(appJs, /命中 KindredEffects hash/);
  assert.match(appJs, /hash 缺口/);
  assert.match(appJs, /selector 输出/);
  assert.match(appJs, /spawn helper/);
});

test("viewer surfaces native hash-missing effect owner audit as diagnostics", () => {
  assert.match(appJs, /nativeEffectHashMissingOwnerAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/native-effect-hash-missing-owner-audit\.json"\)/);
  assert.match(appJs, /function nativeEffectHashMissingOwnerAuditHealthSummary/);
  assert.match(appJs, /原生 hash 缺口 owner/);
  assert.match(appJs, /角色定义 owner/);
  assert.match(appJs, /状态\/BUFF owner 未闭合/);
});

test("viewer surfaces Kindred hash PFX runtime gate audit as diagnostics", () => {
  assert.match(appJs, /kindredHashPfxRuntimeGateAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/kindred-hash-pfx-runtime-gate-audit\.json"\)/);
  assert.match(appJs, /function kindredHashPfxRuntimeGateAuditHealthSummary/);
  assert.match(appJs, /Kindred PFX gate/);
  assert.match(appJs, /PFX 已入表/);
  assert.match(appJs, /待接 renderer\/lifecycle/);
  assert.match(appJs, /create 链未闭合/);
});

test("viewer surfaces Kindred component runtime chain audit as diagnostics", () => {
  assert.match(appJs, /kindredEffectComponentRuntimeChainAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/kindred-effect-component-runtime-chain-audit\.json"\)/);
  assert.match(appJs, /function kindredEffectComponentRuntimeChainAuditHealthSummary/);
  assert.match(appJs, /Kindred component runtime 链/);
  assert.match(appJs, /原生证据闭合/);
  assert.match(appJs, /render submit 闭合/);
  assert.match(appJs, /PFX 待接 renderer\/lifecycle/);
  assert.match(appJs, /接管关闭/);
});

test("viewer surfaces Kindred current particle bridge audit as diagnostics", () => {
  assert.match(appJs, /kindredCurrentParticleBridgeAuditSummary/);
  assert.match(appJs, /fetchJson\("\.\/kindred-current-particle-bridge-audit\.json"\)/);
  assert.match(appJs, /function kindredCurrentParticleBridgeAuditHealthSummary/);
  assert.match(appJs, /Kindred 当前粒子 bridge/);
  assert.match(appJs, /旧版 component 字段对齐/);
  assert.match(appJs, /当前 layout B 字段对齐/);
  assert.match(appJs, /PFX\/emitter owner 未闭合/);
});

test("viewer surfaces current layout B flag producer audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.particleMaskCandidateNotLayoutBRows, 2);
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.activeChildSelectorStateNotLayoutBRows, 3);
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.layoutBFamilyFlagOverlapWriteRows, 1);
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.layoutBFamilyFlagOverlapNonConstructorRows, 0);
  assert.equal(currentNativeLayoutBFlagProducerAudit.summary.layoutBFamilyWideParticleMaskProducerRows, 0);
  assert.match(appJs, /currentNativeLayoutBFlagProducerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-flag-producer-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBFlagProducerHealthSummary/);
  assert.match(appJs, /layout B flag producer/);
  assert.match(appJs, /0x200 候选未并链/);
  assert.match(appJs, /Effect 标量字段已排除/);
  assert.match(appJs, /选择器状态字段已排除/);
  assert.match(appJs, /layout B 宽度覆盖/);
  assert.match(appJs, /非构造宽度覆盖/);
  assert.match(appJs, /精确 producer/);
});

test("viewer surfaces current layout B type owner audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.typeIndexReadRows, 12);
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.createResolveReadRows, 5);
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.queryAllocateReadRows, 6);
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.stackQueryReadRows, 1);
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.unclassifiedReadRows, 0);
  assert.equal(currentNativeLayoutBTypeOwnerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBTypeOwnerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-type-owner-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBTypeOwnerHealthSummary/);
  assert.match(appJs, /layout B type owner/);
  assert.match(appJs, /create\/resolve/);
  assert.match(appJs, /query\/allocate/);
  assert.match(appJs, /stack query/);
});

test("viewer surfaces current layout B entry owner audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.entryInitializerRows, 6);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.registerRows, 7);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.lifecycleCallbackRows, 8);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.globalOwnerSlotReadRows, 7);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.entryOwnerFromGlobalSlotRows, 1);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.constructorObjectAcSeedRows, 1);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.constructorParticleMaskRows, 0);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.destructorCleanupRows, 3);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.pfxEmitterOwnerRows, 0);
  assert.equal(currentNativeLayoutBEntryOwnerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBEntryOwnerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-entry-owner-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBEntryOwnerHealthSummary/);
  assert.match(appJs, /layout B entry owner/);
  assert.match(appJs, /entry owner 来自全局槽/);
  assert.match(appJs, /constructor seed/);
  assert.match(appJs, /constructor 0x200/);
  assert.match(appJs, /析构清理/);
  assert.match(appJs, /PFX\/emitter owner/);
});

test("viewer surfaces current object +0xac width-overlap audit as diagnostics", () => {
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.totalOverlapStoreRows, 425);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.exactStrWAcRows, 64);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.nonExactOverlapRows, 361);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.layoutBFamilyOverlapRows, 1);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.layoutBFamilyNonConstructorRows, 0);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.outOfFamilyWideNeedsOwnerRows, 159);
  assert.equal(currentNativeObjectAcWidthOverlapAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeObjectAcWidthOverlapSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-object-ac-width-overlap-audit\.json"\)/);
  assert.match(appJs, /function currentNativeObjectAcWidthOverlapHealthSummary/);
  assert.match(appJs, /object \+0xac 宽度扫描/);
  assert.match(appJs, /layout B 非构造/);
  assert.match(appJs, /外部需 owner/);
});

test("viewer surfaces current object +0xac owner trace audit as diagnostics", () => {
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.candidateRows, 159);
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.rowsWithAnyDirectCallers, 140);
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.rowsWithLayoutBDirectCallers, 0);
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.renderOwnerHelperRows, 1);
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.renderOwnerHelperNearLayoutBRegistrationCallers, 4);
  assert.equal(currentNativeObjectAcOwnerTraceAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeObjectAcOwnerTraceSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-object-ac-owner-trace-audit\.json"\)/);
  assert.match(appJs, /function currentNativeObjectAcOwnerTraceHealthSummary/);
  assert.match(appJs, /object \+0xac owner trace/);
  assert.match(appJs, /layout B 直接调用/);
  assert.match(appJs, /render-owner helper/);
});

test("viewer surfaces current layout B callback boundary audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.branchRows, 11);
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.candidateTargetHitRows, 0);
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.slotCallbackBranchRows, 6);
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.managerAddRecordRows, 1);
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.managerRefreshRows, 1);
  assert.equal(currentNativeLayoutBCallbackBoundaryAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBCallbackBoundarySummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-callback-boundary-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBCallbackBoundaryHealthSummary/);
  assert.match(appJs, /layout B callback boundary/);
  assert.match(appJs, /命中外部候选/);
});

test("viewer surfaces current layout B indirect slot audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.registrationRows, 4);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.primarySlotInstallRows, 3);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.tailSlotInstallRows, 1);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.sharedSlotMechanicRows, 9);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.frameDispatchRows, 5);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.layoutBRelevantFrameDispatchRows, 1);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.callbackArgumentRows, 9);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.callbackArgumentShapeRecovered, true);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.staticCallbackPointerRows, 0);
  assert.equal(currentNativeLayoutBIndirectSlotAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBIndirectSlotSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-indirect-slot-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBIndirectSlotHealthSummary/);
  assert.match(appJs, /layout B indirect slot/);
  assert.match(appJs, /layout B slot4/);
  assert.match(appJs, /callback 参数形态已恢复/);
  assert.match(appJs, /静态指针/);
});

test("viewer surfaces current layout B slot record bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.managerGlobalRows, 2);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.frameSlot4Rows, 3);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.dispatcherObjectRows, 12);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.activeRecordLayoutRows, 10);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.activeRecordRangeFormulaRecovered, true);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.layoutBRegisterBridgeRows, 9);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.slot4ToSceneRecordBridgeRecovered, true);
  assert.equal(currentNativeLayoutBSlotRecordBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBSlotRecordBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-slot-record-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBSlotRecordBridgeHealthSummary/);
  assert.match(appJs, /layout B slot-record bridge/);
  assert.match(appJs, /active range 公式已闭合/);
  assert.match(appJs, /slot4 到 scene record/);
});

test("viewer surfaces current layout B active-record lifecycle audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.managerInitializerRows, 6);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.recordInitializerRows, 7);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.layoutBRecordRegistrationRows, 9);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.arenaAllocationRows, 10);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.objectAcquireRows, 13);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.objectReleaseRows, 11);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.frameDispatchRows, 5);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.activeRecordLifecycleRecovered, true);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.activeObjectAcquireReleaseRecovered, true);
  assert.equal(currentNativeLayoutBActiveRecordLifecycleAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBActiveRecordLifecycleSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-active-record-lifecycle-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBActiveRecordLifecycleHealthSummary/);
  assert.match(appJs, /layout B active-record lifecycle/);
  assert.match(appJs, /生命周期已闭合/);
  assert.match(appJs, /借出\/释放已闭合/);
});

test("viewer surfaces current layout B target payload audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.layoutBParameterUpdateRows, 6);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.dynamicParameterUpdateRows, 2);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.parameterWriterMechanicRows, 5);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.payloadBridgeRows, 4);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.targetObjectLoadRows, 9);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.payloadBuilderReturnsTargetPlus40, true);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.pfxEmitterOwnerRows, 0);
  assert.equal(currentNativeLayoutBTargetPayloadAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBTargetPayloadSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-target-payload-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBTargetPayloadHealthSummary/);
  assert.match(appJs, /layout B target payload/);
  assert.match(appJs, /target\+0x40/);
});

test("viewer surfaces current layout B PFX target factory audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.parameterNameRows, 6);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.factoryRouteRows, 12);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.targetFactoryRows, 4);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.ownerSlotRows, 5);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.targetStatusRows, 6);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.object50StoreRows, 2);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.kindredEffectsStringRows, 2);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.pfxTargetFactoryRecovered, true);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.pfxEmitterDrawRows, 0);
  assert.equal(currentNativeLayoutBPfxTargetFactoryAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBPfxTargetFactorySummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-pfx-target-factory-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBPfxTargetFactoryHealthSummary/);
  assert.match(appJs, /layout B PFX target factory/);
  assert.match(appJs, /target factory 已闭合/);
});

test("viewer surfaces current layout B target cache audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.targetCacheRows, 10);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.targetAcquireRows, 6);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.resourceSchemaRows, 10);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.childRecordRows, 10);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.targetRefreshRows, 9);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.submitFanoutRows, 8);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.targetCacheRecovered, true);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.resourceSchemaExpansionRecovered, true);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.pfxEmitterDrawRows, 0);
  assert.equal(currentNativeLayoutBTargetCacheAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBTargetCacheSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-target-cache-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBTargetCacheHealthSummary/);
  assert.match(appJs, /layout B target cache/);
  assert.match(appJs, /schema record 已闭合/);
});

test("viewer surfaces current layout B target payload node chain audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.primaryRecordAllocatorRows, 5);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadNodeInitRows, 8);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.schemaPayloadWriteRows, 12);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.targetListRows, 7);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.targetTraversalRows, 5);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.finalConsumerRows, 5);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadActiveCountRuntimeRows, 23);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.opcodeRows, 65);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.primaryRecordAllocationRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadNodeInitializationRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.schemaModeFlagsWriteRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.schemaSourceObjectWriteRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.targetLinkedListRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.finalConsumerFieldMatchRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.targetPayloadNodeChainRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadActiveCountFilterRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadActiveCountAppendProducerRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadActiveCountFlushRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.payloadActiveCountRuntimeProducerRecovered, true);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBTargetPayloadNodeChainAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBTargetPayloadNodeChainSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-target-payload-node-chain-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBTargetPayloadNodeChainHealthSummary/);
  assert.match(appJs, /layout B target payload node/);
  assert.match(appJs, /target\+0x68 链表已闭合/);
  assert.match(appJs, /\+0x200 active count producer 已恢复/);
});

test("viewer surfaces current layout B payload source program bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.schemaSourceObjectRows, 13);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.sourceObjectFactoryRows, 16);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.drawSourceProgramRows, 11);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.parameterApplyRows, 15);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.opcodeRows, 55);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.schemaSourceObjectConstructionRecovered, true);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.sourceObjectLookupAndFallbackRecovered, true);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.drawSourceProgramSelectionRecovered, true);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.sourceParameterApplyFormulaRecovered, true);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.payloadSourceProgramBridgeRecovered, true);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBPayloadSourceProgramBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBPayloadSourceProgramBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-payload-source-program-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBPayloadSourceProgramBridgeHealthSummary/);
  assert.match(appJs, /layout B payload source\/program/);
  assert.match(appJs, /node \+0x208 source 已闭合/);
  assert.match(appJs, /parameter apply 公式已闭合/);
});

test("viewer surfaces current layout B manager draw bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.layoutBRegisterFlagRows, 5);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.managerAddRecordRows, 8);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.backingFlagFilterRows, 6);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.refreshPayloadRows, 9);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.backingPayloadApplyRows, 6);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.backingFlagRefreshRows, 3);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.particleDrawFilterRows, 7);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.objectAcToBackingFlagBridgeRecovered, true);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.targetPayloadRefreshBridgeRecovered, true);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.targetPayloadApplyRecovered, true);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.optionalFlagRefreshRecovered, true);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.particleDrawFilterBridgeRecovered, true);
  assert.equal(currentNativeLayoutBManagerDrawBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBManagerDrawBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-manager-draw-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBManagerDrawBridgeHealthSummary/);
  assert.match(appJs, /layout B manager draw bridge/);
  assert.match(appJs, /object\+0xac 到 backing flags/);
  assert.match(appJs, /target\+0x40 refresh/);
  assert.match(appJs, /x2 payload apply/);
  assert.match(appJs, /x3 flag refresh/);
});

test("viewer surfaces current layout B particle entry dispatch audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.sharedEntryArrayRows, 4);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.particleTaskRows, 6);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.compositeConstructorRows, 4);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.compositeDispatchRows, 8);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.layoutBEntryBridgeRows, 4);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.entryHelperDispatchRows, 5);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.opcodeRows, 31);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.particleCompositeDispatchRecovered, true);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.layoutBEntryToCompositeDispatchBridgeRecovered, true);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.managerEntryToOwnerVtableRecovered, true);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.globalHelperDispatchLinked, true);
  assert.equal(currentNativeLayoutBParticleEntryDispatchAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBParticleEntryDispatchSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-particle-entry-dispatch-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBParticleEntryDispatchHealthSummary/);
  assert.match(appJs, /layout B particle entry dispatch/);
  assert.match(appJs, /entry\+0x8 owner vtable/);
  assert.match(appJs, /global helper 已接上/);
});

test("viewer surfaces current layout B entry provider payload bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.entryIdentityRows, 8);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.entryPrimaryHelperRows, 5);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.providerVtableRows, 4);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.providerAccessorRows, 4);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.ownerBProviderUseRows, 9);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.opcodeRows, 26);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.pointerRows, 4);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.layoutBEntryIdentityRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.managerEntryToOwnerBRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.entryProviderVtableRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.providerTargetHandleFormulaRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.providerTransformSourceFormulaRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.ownerBUsesProviderTargetAndTransformRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.entryHelperPayloadBridgeRecovered, true);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.targetPayloadToFinalDrawFormulaRecovered, false);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBEntryProviderPayloadBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBEntryProviderPayloadBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-entry-provider-payload-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBEntryProviderPayloadBridgeHealthSummary/);
  assert.match(appJs, /layout B entry\/provider bridge/);
  assert.match(appJs, /target handle=object\+0x58/);
  assert.match(appJs, /object\+0x40 helper 已接上/);
});

test("viewer surfaces current layout B ownerB vtable dispatch audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.ownerLifecycleRows, 10);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.ownerConstructorRows, 9);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.vtableSlotRows, 5);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.ownerDispatchRows, 43);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.submitPathRows, 31);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.opcodeRows, 93);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.pointerRows, 5);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.ownerBGlobalSlotRecovered, true);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.ownerBVtableSlot10Recovered, true);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.entryTransformProviderRecovered, true);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.payloadBatchSubmitBridgeRecovered, true);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.submitPathSplitRecovered, true);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.primitiveFormulaRecovered, false);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.materialFormulaRecovered, false);
  assert.equal(currentNativeLayoutBOwnerBVtableDispatchAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBOwnerBVtableDispatchSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-owner-b-vtable-dispatch-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBOwnerBVtableDispatchHealthSummary/);
  assert.match(appJs, /layout B ownerB vtable dispatch/);
  assert.match(appJs, /ownerB slot 已闭合/);
  assert.match(appJs, /submit 分流已闭合/);
});

test("viewer surfaces current layout B primitive mode dispatch audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.payloadModeSourceRows, 4);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.modeTableRows, 27);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.nestedDispatchRows, 6);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.builderCallRows, 16);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.builderEntryRows, 16);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.outputPatternRows, 15);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.opcodeRows, 57);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.tableRows, 27);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.tableMismatchRows, 0);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.outerModeEntries, 9);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.nestedModeEntries, 18);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.uniqueBuilderTargets, 16);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.outerModeDispatchRecovered, true);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.nestedModeDispatchRecovered, true);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.builderCallMatrixRecovered, true);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.outputRecordShapePartiallyRecovered, true);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.materialFormulaRecovered, false);
  assert.equal(currentNativeLayoutBPrimitiveModeDispatchAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBPrimitiveModeDispatchSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-primitive-mode-dispatch-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBPrimitiveModeDispatchHealthSummary/);
  assert.match(appJs, /layout B primitive mode dispatch/);
  assert.match(appJs, /builder call 矩阵已闭合/);
  assert.match(appJs, /材质公式未恢复/);
});

test("viewer surfaces current layout B material draw bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentPayloadFieldRows, 18);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDrawStateRows, 5);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDynamicParameterRows, 9);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDrawModeRows, 3);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentQueueProgramRows, 5);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentQueueSortRows, 2);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentOpcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentPayloadFieldsRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDrawStateSemanticsRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDynamicParameterSemanticsRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.crossBuildDrawModeMappingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentQueueProgramBindingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentQueueSortRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveDrawStateRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveProgramBindingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveDrawModeMappingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveAttributeBindingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentFinalPrimitiveBufferLifecycleRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentShaderParameterBridgeRows, 64);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentLayoutBToSharedParameterUploaderRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentParameterUploaderRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentShaderParamsToUploaderOverrideBridgeRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentShaderParamsNumericOverrideRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentShaderParamsOverrideProducesTextureObjectType4, false);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentTextureObjectBindingRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentTextureObjectRecordPointerRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentTextureSamplerStateUpdateRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.currentSourceProgramTablePathRecovered, true);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.textureSamplerFormulaRecovered, false);
  assert.equal(currentNativeLayoutBMaterialDrawBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBMaterialDrawBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-material-draw-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBMaterialDrawBridgeHealthSummary/);
  assert.match(appJs, /layout B material draw bridge/);
  assert.match(appJs, /program\/sort 已闭合/);
  assert.match(appJs, /final draw state 已闭合/);
  assert.match(appJs, /final program 绑定已闭合/);
  assert.match(appJs, /final draw mode 已闭合/);
  assert.match(appJs, /final attribute 绑定已闭合/);
  assert.match(appJs, /final buffer 生命周期已闭合/);
  assert.match(appJs, /参数 uploader 已闭合/);
  assert.match(appJs, /ShaderParams override 已闭合/);
  assert.match(appJs, /ShaderParams 不产生贴图 type4/);
  assert.match(appJs, /texture object bind 已闭合/);
  assert.match(appJs, /texture record object\+0x30 已闭合/);
  assert.match(appJs, /sampler state update 已闭合/);
  assert.match(appJs, /source\/program 表路径已闭合/);
  assert.match(appJs, /shader\/texture 公式未恢复/);
  assert.match(appJs, /sampler 公式未恢复/);
});

test("viewer surfaces current layout B final primitive consumer audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.commandConstructorRows, 9);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.segmentBuilderRows, 13);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.drawConsumerRows, 44);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.bufferLifecycleRows, 10);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.opcodeRows, 76);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.vtablePointerRows, 4);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.commandVtableRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.segmentListRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentFinalPrimitiveConsumerRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentDrawStateRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentProgramBindingRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentDrawModeMappingRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentAttributeBindingRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.currentBufferLifecycleRecovered, true);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.textureSamplerFormulaRecovered, false);
  assert.equal(currentNativeLayoutBFinalPrimitiveConsumerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBFinalPrimitiveConsumerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-final-primitive-consumer-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBFinalPrimitiveConsumerHealthSummary/);
  assert.match(appJs, /layout B final primitive consumer/);
  assert.match(appJs, /当前 consumer 已恢复/);
  assert.match(appJs, /shader\/texture 公式未恢复/);
  assert.match(appJs, /sampler 公式未恢复/);
});

test("viewer surfaces current layout B shader parameter bridge audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.opcodeRows, 64);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.layoutBToSharedParameterUploaderRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.parameterUploaderRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.overrideHashMatchRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.overrideKeepsBaseUniformLocationRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.overrideUsesOverrideValueAndTypeRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.shaderParamsNumericOverrideRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.shaderParamsToUploaderOverrideBridgeRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.shaderParamsOverrideProducesTextureObjectType4, false);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.textureObjectBindingRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.textureObjectRecordPointerRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.textureSamplerStateUpdateRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.sourceProgramTablePathRecovered, true);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.textureSamplerFormulaRecovered, false);
  assert.equal(currentNativeLayoutBShaderParameterBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBShaderParameterBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-shader-parameter-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBShaderParameterBridgeHealthSummary/);
  assert.match(appJs, /layout B shader 参数桥/);
  assert.match(appJs, /override hash 匹配已闭合/);
  assert.match(appJs, /ShaderParams 数值覆盖已闭合/);
  assert.match(appJs, /ShaderParams 不产生贴图 type4/);
  assert.match(appJs, /texture bind 已闭合/);
  assert.match(appJs, /texture record object\+0x30 已闭合/);
  assert.match(appJs, /sampler state update 已闭合/);
});

test("viewer surfaces current shaderData type4 value-source audit as diagnostics", () => {
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.opcodeRows, 22);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.semanticNameRows, 23);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.type4SemanticRows, 3);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.parserType4BranchRecovered, true);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.type4EntryWriterRecovered, true);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.shaderDataType4SemanticTextureValueSourceRecovered, true);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeShaderDataType4ValueSourceAudit.summary.renderPromotionAllowedRows, 0);
  assert.deepEqual(currentNativeShaderDataType4ValueSourceAudit.type4SemanticNames, [
    "CloudShadows.Texture",
    "FogOfWar.Texture",
    "Shadowing.mMap",
  ]);
  assert.match(appJs, /currentNativeShaderDataType4ValueSourceSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderdata-type4-value-source-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderDataType4ValueSourceHealthSummary/);
  assert.match(appJs, /shaderData type4 值源/);
  assert.match(appJs, /内置语义贴图值源已恢复/);
  assert.match(appJs, /普通材质 sampler 归属未恢复/);
});

test("viewer surfaces current texData texture-object audit as diagnostics", () => {
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.opcodeRows, 34);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.pointerRows, 7);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.texDataHandlerRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.textureWrapperBuilderRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.texDataPayloadParserRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.textureGlUploadRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.textureObjectApplyRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeTexDataTextureObjectAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeTexDataTextureObjectSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-texdata-texture-object-audit\.json"\)/);
  assert.match(appJs, /function currentNativeTexDataTextureObjectHealthSummary/);
  assert.match(appJs, /texData 贴图对象链/);
  assert.match(appJs, /texData 到 GL texture object 已闭合/);
  assert.match(appJs, /shadergraph sampler 归属未恢复/);
});

test("viewer surfaces current shaderData texture sampler table audit as diagnostics", () => {
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.opcodeRows, 61);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.passSectionCountsRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.textureRecordParserRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.textureRecordConsumerRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.inlineTextureRecordParserRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.inlineTextureRecordConsumerRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.compiledSamplerUnitTableRecovered, true);
  assert.equal(
    currentNativeShaderDataTextureSamplerTableAudit.summary.shaderDataTextureSamplerStaticUnitLayoutRecovered,
    true,
  );
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.textureRecordsProduceType4Placeholders, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.texDataToGlTextureObjectChainRecovered, true);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeShaderDataTextureSamplerTableAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShaderDataTextureSamplerTableSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderdata-texture-sampler-table-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderDataTextureSamplerTableHealthSummary/);
  assert.match(appJs, /shaderData texture\/sampler 表/);
  assert.match(appJs, /静态 sampler unit 布局已闭合/);
  assert.match(appJs, /sampler 到 texData 归属未恢复/);
});

test("viewer surfaces current shaderData external texture binding audit as diagnostics", () => {
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.opcodeRows, 55);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.textureRuntimeCallbackInstalled, true);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.shaderDataExternalResourceRegistrationRecovered, true);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.externalTextureRuntimeLookupRecovered, true);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.externalTextureType4PatchRecovered, true);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.externalTextureSamplerRuntimeBindingRecovered, true);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeShaderDataExternalTextureBindingAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShaderDataExternalTextureBindingSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderdata-external-texture-binding-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderDataExternalTextureBindingHealthSummary/);
  assert.match(appJs, /shaderData 外部贴图绑定/);
  assert.match(appJs, /外部贴图 runtime 绑定已闭合/);
  assert.match(appJs, /普通材质 sampler 对象归属未恢复/);
});

test("viewer surfaces current shaderData inline texture placeholder audit as diagnostics", () => {
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.opcodeRows, 38);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineRecordConsumerRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineType4PlaceholderObjectInitiallyNull, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlinePassLookupRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineTextureObjectRuntimeConstructionRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineTextureObjectUploadRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineType4RuntimePatchRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.inlineTextureRuntimePatchRequired, false);
  assert.equal(currentNativeShaderDataInlineTexturePlaceholderAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShaderDataInlineTexturePlaceholderSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderdata-inline-texture-placeholder-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderDataInlineTexturePlaceholderHealthSummary/);
  assert.match(appJs, /shaderData inline 贴图 placeholder/);
  assert.match(appJs, /inline 贴图对象绑定已恢复/);
  assert.match(appJs, /runtime 补值路径已恢复/);
});

test("viewer surfaces current shadergraph sampler texData join audit as diagnostics", () => {
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.materialSamplerRows, 2890);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.samplerSourceKeyHashRows, 2890);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.externalTexturePathSamplerRows, 2365);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.inlineRuntimeSamplerRows, 516);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.runtimeSceneTextureSamplerRows, 9);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.externalTextureBindingMechanicalRows, 2365);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.inlineTextureBindingMechanicalRows, 516);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.runtimeSceneTextureDiagnosticRows, 9);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.ordinarySamplerBindingMechanicalRows, 2881);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.classificationGapRows, 0);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.samplerResourceClassificationComplete, true);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.ordinarySamplerBindingMechanicsRecovered, true);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.samplerStaticResourceAndBindingComplete, true);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.samplerTexDataOwnershipNeedsLiveCapture, true);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(currentNativeShadergraphSamplerTexDataJoinAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShadergraphSamplerTexDataJoinSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shadergraph-sampler-texdata-join-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShadergraphSamplerTexDataJoinHealthSummary/);
  assert.match(appJs, /shadergraph sampler 资源分类/);
  assert.match(appJs, /sampler sourceKeyHash/);
  assert.match(appJs, /普通 sampler 机械绑定已闭合/);
  assert.match(appJs, /静态资源\+机械绑定已闭合/);
  assert.match(appJs, /texData 归属需要 live capture/);
  assert.match(appJs, /sampler 到 texData 归属未恢复/);
});

test("viewer surfaces current material source/program capture targets as diagnostics", () => {
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.hookTargetRows, 14);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.opcodeRows, 26);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.captureScriptTargetRows, 14);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.captureScriptEventRows, 30);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.captureScriptMismatchRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.captureEventLimit, 256);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.captureLimitEventCovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.resourceListCaptureLimit, 64);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.nestedResourceIdCaptureLimit, 32);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.resourceListTruncationFieldCovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.nestedResourceIdTruncationFieldCovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.sourceProgramTableEntryCaptureLimit, 128);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.sourceProgramTableTruncationFieldCovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.sourceProgramCaptureScriptCoverageReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.dynamicProducerHooksReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.upstreamSelectionHooksReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.tableMountHooksReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.textureRuntimeCaptureHookRows, 4);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.textureRuntimeCaptureHooksReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.inlineTextureRuntimeCaptureHooksReady, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.sourceProgramResourceListShapeRecovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.sourceProgramTableMountRecovered, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.textureRuntimeCaptureGenerated, true);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.resourceListSemanticNamesRecovered, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureTargets.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeMaterialSourceProgramCaptureTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-material-source-program-capture-targets\.json"\)/);
  assert.match(appJs, /function currentNativeMaterialSourceProgramCaptureTargetHealthSummary/);
  assert.match(appJs, /source\/program 捕获目标/);
  assert.match(appJs, /贴图 runtime 捕获就绪/);
  assert.match(appJs, /Frida 事件覆盖完整/);
  assert.match(appJs, /脚本事件字段/);
  assert.match(appJs, /hook 事件捕获上限/);
  assert.match(appJs, /hook limit 事件已覆盖/);
  assert.match(appJs, /resource-list 捕获上限/);
  assert.match(appJs, /resource-list 截断字段已覆盖/);
  assert.match(appJs, /nested resource id 截断字段已覆盖/);
  assert.match(appJs, /source table 捕获上限/);
  assert.match(appJs, /table 截断字段已覆盖/);
  assert.match(appJs, /资源语义名未恢复/);
  assert.match(appJs, /需要真机 runtime 捕获/);
});

test("viewer surfaces current material source/program capture summary as diagnostics", () => {
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureImported, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureStatus, "capture-missing");
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetRows, 14);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.observedHookTargets, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetEventRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetEventRowsWithEventId, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetEventRowsWithThreadId, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureOrderingFieldsComplete, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetEventDuplicateEventIdRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.targetEventNonMonotonicEventIdRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureEventIdOrderingComplete, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.knownShadergraphTextureResourceRows, 2365);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.knownShadergraphTextureResourceUnitRows, 2365);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.knownShadergraphTextureResourceSamplerIdentityRows, 2365);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureRegistrationResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureRegistrationKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureLookupResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureLookupKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureLookupUnknownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureLookupRegisteredKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.textureRuntimeLookupEvents, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchEvents, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchKnownReturnedObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchValueMatchesObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameObjectAndValueMatchRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameThreadObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchOrderedSameThreadObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceObjectAndValueMatchRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSamplerUnitMatchesEntryRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchValueAndSamplerUnitMatchRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceKnownResourceObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredKnownResourceObjectRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 0);
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.sourceProgramMountedType4TableRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchMountedTableRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSourceProgramCaptureSummary.summary.type4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.resourceListTruncatedRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.nestedResourceIdTruncatedRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.resourceListCaptureComplete, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureLimitRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureLimitDroppedEventRowsAtLeast, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.captureEventLimitHit, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.sourceProgramTableTruncatedRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.sourceProgramTableMissingEntryRows, 0);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.sourceProgramTableCaptureComplete, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.readyForManualTextureRuntimeReview, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.readyForManualTextureResourceKeyReview, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.readyForManualSourceProgramReview, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.resourceListSemanticNamesRecovered, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.materialSamplerTextureObjectOwnershipRecovered, false);
  assert.equal(currentNativeMaterialSourceProgramCaptureSummary.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeMaterialSourceProgramCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-material-source-program-capture-summary\.json"\)/);
  assert.match(appJs, /function currentNativeMaterialSourceProgramCaptureHealthSummary/);
  assert.match(appJs, /source\/program 捕获结果/);
  assert.match(appJs, /未导入捕获/);
  assert.match(appJs, /capture-ordering-fields-missing/);
  assert.match(appJs, /capture-event-ordering-invalid/);
  assert.match(appJs, /capture ordering 字段未闭合/);
  assert.match(appJs, /eventId 顺序未闭合/);
  assert.match(appJs, /hook 捕获未触发上限/);
  assert.match(appJs, /resource-list 捕获未闭合/);
  assert.match(appJs, /resource-list 截断/);
  assert.match(appJs, /source table 捕获未闭合/);
  assert.match(appJs, /source table 截断/);
  assert.match(appJs, /patch 对上返回贴图对象/);
  assert.match(appJs, /patch 对象和值同时闭合/);
  assert.match(appJs, /patch 同线程对象闭合/);
  assert.match(appJs, /patch 同序对象和值闭合/);
  assert.match(appJs, /patch sampler unit 对上 type4 entry/);
  assert.match(appJs, /patch 同序对象\/unit\/值闭合/);
  assert.match(appJs, /已知 shadergraph 贴图 resource key/);
  assert.match(appJs, /已知 shadergraph 贴图 sampler unit/);
  assert.match(appJs, /已知 shadergraph 贴图 sampler 身份 hash/);
  assert.match(appJs, /register 对上 shadergraph 贴图/);
  assert.match(appJs, /lookup 对上 shadergraph 贴图/);
  assert.match(appJs, /lookup 已有同线程 register/);
  assert.match(appJs, /lookup 已有同 runtime register/);
  assert.match(appJs, /patch 同序已知 resource\/unit\/值闭合/);
  assert.match(appJs, /patch 同序已注册 resource\/unit\/值闭合/);
  assert.match(appJs, /patch 同序已注册 resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler 身份闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler 身份\/值闭合/);
  assert.match(appJs, /mounted type4 table/);
  assert.match(appJs, /patch 对上 mounted table/);
  assert.match(appJs, /patch 同序 table\/对象闭合/);
  assert.match(appJs, /patch 同序 table\/已注册 resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序 table\/同 runtime resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序 table\/同 runtime resource\/sampler 身份\/值闭合/);
  assert.match(appJs, /贴图 runtime 值未到复核条件/);
  assert.match(appJs, /source\/program 值未到复核条件/);
});

test("viewer surfaces current material sampler ownership gate as diagnostics", () => {
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.materialRows, 1038);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.externalMechanicalTexturePathRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.inlineMechanicalTexturePathRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.allMechanicalTexturePathsRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.externalTextureSamplerRuntimeBindingRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.inlineType4PlaceholderObjectInitiallyNull, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.inlineTextureObjectBindingRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.inlineTextureRuntimePatchRequired, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.staticMeshShaderParamsDisqualifiedAsTextureSource, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.layoutBPayloadSourceProgramBridgeRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.layoutBPayloadSourceProgramParameterApplyRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.layoutBPayloadSourceProgramRenderPromotionRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.shadergraphSamplerSourceKeyHashRows, 2890);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.shadergraphSamplerIdentityTableComplete, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.texturePathMissingSamplerRows, 525);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.runtimeResolvedSamplerRows, 525);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.runtimeResolvedTexturePathMissingSamplerRows, 525);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.texturePathMissingSamplerBlockingRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.texturePathMissingSamplerRowsAreRuntimeResolved, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureReadyForManualReview, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramSamplerIdentityReviewReady, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTargetEventRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTargetEventRowsWithEventId, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTargetEventRowsWithThreadId, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureOrderingFieldsComplete, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTargetEventDuplicateEventIdRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTargetEventNonMonotonicEventIdRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureEventIdOrderingComplete, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramKnownShadergraphTextureResourceRows, 2365);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramKnownShadergraphTextureResourceUnitRows, 2365);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramKnownShadergraphTextureResourceSamplerIdentityRows, 2365);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureRegistrationResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureRegistrationKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureLookupResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureLookupKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureLookupUnknownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureLookupRegisteredKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureLookupRegisteredSameRuntimeKnownShadergraphResourceKeyRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureRuntimeLookupEvents, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchEvents, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchKnownReturnedObjectRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameObjectAndValueMatchRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameThreadObjectRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchOrderedSameThreadObjectRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceObjectAndValueMatchRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSamplerUnitMatchesEntryRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchValueAndSamplerUnitMatchRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceObjectUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceObjectRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceKnownResourceUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceObjectRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceUnitAndValueRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredKnownResourceSamplerUnitAndValueRows, 0);
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramMountedType4TableRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchMountedTableRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchOrderedMountedTableRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceTableObjectRows, 0);
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerUnitAndValueRows,
    0,
  );
  assert.equal(
    currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramType4TexturePatchSameSequenceTableRegisteredSameRuntimeResourceSamplerIdentityAndValueRows,
    0,
  );
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureRuntimeReadyForReview, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTextureResourceKeyReadyForReview, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureLimitRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureLimitDroppedEventRowsAtLeast, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramCaptureEventLimitHit, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramResourceListTruncatedRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramNestedResourceIdTruncatedRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramResourceListCaptureComplete, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTableTruncatedRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTableMissingEntryRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.sourceProgramTableCaptureComplete, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.staticMeshShaderParamsCaptureImported, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.staticMeshShaderParamsCaptureStatus, "capture-missing");
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.staticMeshShaderParamsCaptureTargetHooksReady, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.staticMeshShaderParamsCaptureReadyForManualReview, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableTypeIndexChainRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableSelectorChainRecovered, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableProducerAgrees, true);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableResourceFieldNamesRecovered, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableActiveResourceSemanticsRecovered, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.dynamicSourceTableRenderPromotionRows, 0);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.shadergraphSamplerToTexDataBindingRecovered, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.ordinaryMaterialSamplerOwnershipRecovered, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeMaterialSamplerOwnershipGateAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeMaterialSamplerOwnershipGateSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-material-sampler-ownership-gate-audit\.json"\)/);
  assert.match(appJs, /function currentNativeMaterialSamplerOwnershipGateHealthSummary/);
  assert.match(appJs, /sampler 归属总门槛/);
  assert.match(appJs, /source\/program capture ordering 字段未闭合/);
  assert.match(appJs, /source\/program eventId 顺序未闭合/);
  assert.match(appJs, /inline 贴图机械链已闭合/);
  assert.match(appJs, /payload \+0x208 source\/program 已闭合/);
  assert.match(appJs, /payload source\/program 参数应用已闭合/);
  assert.match(appJs, /静态 sampler sourceKeyHash/);
  assert.match(appJs, /静态 sampler 身份表已闭合/);
  assert.match(appJs, /StaticMesh ShaderParams \$\{summary\.staticMeshShaderParamsCaptureStatus/);
  assert.match(appJs, /StaticMesh ShaderParams 捕获未到复核条件/);
  assert.match(appJs, /dynamic source table type-index 已闭合/);
  assert.match(appJs, /dynamic source table selector 已闭合/);
  assert.match(appJs, /dynamic source table resource 字段未恢复/);
  assert.match(appJs, /dynamic source table active resource 未恢复/);
  assert.match(appJs, /无路径 sampler 已由 runtime 解释/);
  assert.match(appJs, /无路径阻塞 sampler/);
  assert.match(appJs, /source\/program sampler 身份未到复核条件/);
  assert.match(appJs, /hook 捕获未触发上限/);
  assert.match(appJs, /resource-list 捕获未闭合/);
  assert.match(appJs, /source table 捕获未闭合/);
  assert.match(appJs, /patch 对上返回贴图对象/);
  assert.match(appJs, /patch 对象和值同时闭合/);
  assert.match(appJs, /patch sampler unit 对上 type4 entry/);
  assert.match(appJs, /patch 同序对象\/unit\/值闭合/);
  assert.match(appJs, /已知 shadergraph 贴图 resource key/);
  assert.match(appJs, /已知 shadergraph 贴图 sampler unit/);
  assert.match(appJs, /已知 shadergraph 贴图 sampler 身份 hash/);
  assert.match(appJs, /register 对上 shadergraph 贴图/);
  assert.match(appJs, /lookup 对上 shadergraph 贴图/);
  assert.match(appJs, /lookup 已有同线程 register/);
  assert.match(appJs, /lookup 已有同 runtime register/);
  assert.match(appJs, /patch 同序已知 resource\/unit\/值闭合/);
  assert.match(appJs, /patch 同序已注册 resource\/unit\/值闭合/);
  assert.match(appJs, /patch 同序已注册 resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler 身份闭合/);
  assert.match(appJs, /patch 同序同 runtime resource\/sampler 身份\/值闭合/);
  assert.match(appJs, /patch 对上 mounted table/);
  assert.match(appJs, /patch 同序 table\/对象闭合/);
  assert.match(appJs, /patch 同序 table\/已注册 resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序 table\/同 runtime resource\/sampler unit\/值闭合/);
  assert.match(appJs, /patch 同序 table\/同 runtime resource\/sampler 身份\/值闭合/);
  assert.match(appJs, /贴图 runtime 捕获未到复核条件/);
  assert.match(appJs, /普通材质 sampler 归属未恢复/);
});

test("viewer surfaces aggregate runtime capture gate as diagnostics", () => {
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.captureGateRows, 6);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.captureImportedRows, 0);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.captureMissingRows, 6);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.allRuntimeCapturesImported, false);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.allRuntimeCapturesReadyForManualReview, false);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.anyRenderPromotionAllowed, false);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.byCaptureStatus["capture-missing"], 5);
  assert.equal(currentNativeRuntimeCaptureGateAudit.summary.byCaptureStatus["runtime-selector-capture-missing"], 1);
  assert.equal(
    currentNativeRuntimeCaptureGateAudit.items.find((item) => item.gate === "material-source-program").liveCapturePath,
    "extracted/reports/material_source_program_capture.jsonl",
  );
  assert.equal(
    currentNativeRuntimeCaptureGateAudit.items.find((item) => item.gate === "runtime-key-selector").captureDoc,
    "docs/runtime-key-selector-capture.md",
  );
  assert.match(
    currentNativeRuntimeCaptureGateAudit.items.find((item) => item.gate === "layout-b-object-ac").nextProofRequired,
    /object\+0xac/,
  );
  assert.deepEqual(currentNativeRuntimeCaptureGateAudit.summary.blockingGateNames, [
    "material-source-program",
    "staticmesh-shaderparams",
    "runtime-key-selector",
    "effect-native-channel",
    "pfx-native-callback",
    "layout-b-object-ac",
  ]);
  assert.match(appJs, /currentNativeRuntimeCaptureGateSummary/);
  assert.match(appJs, /currentNativeRuntimeCaptureGateItems/);
  assert.match(appJs, /fetchJson\("\.\/current-native-runtime-capture-gate-audit\.json"\)/);
  assert.match(appJs, /function currentNativeRuntimeCaptureGateHealthSummary/);
  assert.match(appJs, /runtime capture 总门槛/);
  assert.match(appJs, /live capture 输入/);
  assert.match(appJs, /nextProofRequired/);
  assert.match(appJs, /captureMissingRows/);
  assert.match(appJs, /条 capture 缺失/);
  assert.match(appJs, /接管关闭/);
});

test("viewer surfaces projectile runtime gap audit as diagnostics", () => {
  assert.ok(effectProjectileRuntimeGapAudit.summary.projectileDefinitions > 0);
  assert.ok(effectProjectileRuntimeGapAudit.summary.readyForProjectileRuntimeRows >= 0);
  assert.ok(effectProjectileRuntimeGapAudit.summary.blockingProjectileRuntimeRows >= 0);
  assert.equal(
    effectProjectileRuntimeGapAudit.summary.projectileDefinitions,
    effectProjectileRuntimeGapAudit.summary.placedProjectileDefinitions +
      effectProjectileRuntimeGapAudit.summary.definitionOnlyProjectileDefinitions +
      effectProjectileRuntimeGapAudit.summary.noCoverageProjectileDefinitions,
  );
  assert.equal(
    effectProjectileRuntimeGapAudit.summary.noCoverageProjectileDefinitions,
    effectProjectileRuntimeGapAudit.summary.actionMismatchProjectileDefinitions +
      effectProjectileRuntimeGapAudit.summary.heroMismatchProjectileDefinitions +
      effectProjectileRuntimeGapAudit.summary.tokenMissingProjectileDefinitions,
  );
  assert.ok(
    (effectProjectileRuntimeGapAudit.items || []).some(
      (item) => item.effectToken && Object.hasOwn(item, "readyForProjectileRuntime"),
    ),
  );
  assert.match(appJs, /runtimeEffectProjectileGapSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-runtime-gap-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileGapHealthSummary/);
  assert.match(appJs, /placedProjectileDefinitions/);
  assert.match(appJs, /definitionOnlyProjectileDefinitions/);
  assert.match(appJs, /actionMismatchProjectileDefinitions/);
  assert.match(appJs, /heroMismatchProjectileDefinitions/);
  assert.match(appJs, /tokenMissingProjectileDefinitions/);
  assert.match(appJs, /tokenMissingWithPfxCandidateRows/);
  assert.match(appJs, /noCoverageProjectileDefinitions/);
  assert.match(appJs, /弹道 runtime 缺口/);
});

test("viewer surfaces projectile create bridge audit as diagnostics", () => {
  assert.ok(effectProjectileCreateBridgeAudit.summary.rows >= 0);
  assert.equal(effectProjectileCreateBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileCreateBridgeAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "sourceGapStatus"),
    ),
  );
  assert.match(packageJson, /effect_projectile_create_bridge_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCreateBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-create-bridge-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCreateBridgeHealthSummary/);
  assert.match(appJs, /create bridge/);
  assert.match(appJs, /renderPromotionAllowedRows/);
  assert.match(appJs, /runtimePointerStoreRows/);
  assert.match(appJs, /runtimeVtablePointerRows/);
  assert.match(appJs, /targetOwnerQueryRows/);
  assert.match(appJs, /targetVtableDispatchRows/);
  assert.match(appJs, /弹道 create bridge/);
});

test("viewer surfaces projectile target dispatch audit as diagnostics", () => {
  assert.ok(effectProjectileTargetDispatchAudit.summary.rows >= 0);
  assert.equal(effectProjectileTargetDispatchAudit.summary.placementPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileTargetDispatchAudit.items || []).every(
      (item) => item.placementPromotionAllowed === false && Object.hasOwn(item, "sourceCreateBridgeStatus"),
    ),
  );
  assert.match(packageJson, /effect_projectile_target_dispatch_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileTargetDispatchSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-target-dispatch-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileTargetDispatchHealthSummary/);
  assert.match(appJs, /placementPromotionAllowedRows/);
  assert.match(appJs, /helperFactoryRows/);
  assert.match(appJs, /runtimePoolRows/);
  assert.match(appJs, /factoryVtableRows/);
  assert.match(appJs, /callbackCommandRows/);
  assert.match(appJs, /callback command/);
  assert.match(appJs, /target-dispatch-helper-only/);
  assert.match(appJs, /target-dispatch-finalize-only/);
  assert.match(appJs, /helper-only/);
  assert.match(appJs, /target dispatch/);
  assert.match(appJs, /弹道 target dispatch/);
});

test("viewer surfaces projectile vtable slot audit as diagnostics", () => {
  assert.ok(effectProjectileVtableSlotAudit.summary.rows >= 0);
  assert.equal(effectProjectileVtableSlotAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileVtableSlotAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "slotStatus"),
    ),
  );
  assert.match(packageJson, /effect_projectile_vtable_slot_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileVtableSlotSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-vtable-slot-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileVtableSlotHealthSummary/);
  assert.match(appJs, /exactSlotRows/);
  assert.match(appJs, /descriptorCompanionRows/);
  assert.match(appJs, /missingRelocationRows/);
  assert.match(appJs, /vtable slot/);
  assert.match(appJs, /弹道 vtable slot/);
});

test("viewer surfaces projectile vtable function audit as diagnostics", () => {
  assert.ok(effectProjectileVtableFunctionAudit.summary.rows >= 0);
  assert.equal(effectProjectileVtableFunctionAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileVtableFunctionAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "structuralClass"),
    ),
  );
  assert.match(packageJson, /effect_projectile_vtable_function_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileVtableFunctionSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-vtable-function-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileVtableFunctionHealthSummary/);
  assert.match(appJs, /constantOutputWriterRows/);
  assert.match(appJs, /computedOutputWriterRows/);
  assert.match(appJs, /helperCallFunctionRows/);
  assert.match(appJs, /vtable 函数/);
  assert.match(appJs, /弹道 vtable 函数/);
});

test("viewer surfaces projectile vtable output layout audit as diagnostics", () => {
  assert.ok(effectProjectileVtableOutputLayoutAudit.summary.rows >= 0);
  assert.equal(effectProjectileVtableOutputLayoutAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileVtableOutputLayoutAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "writeKind"),
    ),
  );
  assert.match(packageJson, /effect_projectile_vtable_output_layout_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileVtableOutputLayoutSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-vtable-output-layout-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileVtableOutputLayoutHealthSummary/);
  assert.match(appJs, /fixedOffsetStoreRows/);
  assert.match(appJs, /postIncrementStoreRows/);
  assert.match(appJs, /helperMemsetZeroRows/);
  assert.match(appJs, /output layout/);
  assert.match(appJs, /弹道 output layout/);
});

test("viewer surfaces projectile vtable callsite payload audit as diagnostics", () => {
  assert.ok(effectProjectileVtableCallsitePayloadAudit.summary.rows >= 0);
  assert.equal(effectProjectileVtableCallsitePayloadAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileVtableCallsitePayloadAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "payloadKind"),
    ),
  );
  assert.match(packageJson, /effect_projectile_vtable_callsite_payload_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileVtableCallsitePayloadSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-vtable-callsite-payload-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileVtableCallsitePayloadHealthSummary/);
  assert.match(appJs, /callbackPayloadRows/);
  assert.match(appJs, /stringTokenPayloadRows/);
  assert.match(appJs, /immediateScalarPayloadRows/);
  assert.match(appJs, /callsite payload/);
  assert.match(appJs, /弹道 callsite payload/);
});

test("viewer surfaces projectile vtable semantic join audit as diagnostics", () => {
  assert.ok(effectProjectileVtableSemanticJoinAudit.summary.rows >= 0);
  assert.equal(effectProjectileVtableSemanticJoinAudit.summary.renderPromotionAllowedRows, 0);
  assert.ok(
    (effectProjectileVtableSemanticJoinAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "resolvedFunctionAddressHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_vtable_semantic_join_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileVtableSemanticJoinSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-vtable-semantic-join-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileVtableSemanticJoinHealthSummary/);
  assert.match(appJs, /joinedOutputRows/);
  assert.match(appJs, /joinedPayloadRows/);
  assert.match(appJs, /semantic join/);
  assert.match(appJs, /弹道 semantic join/);
});

test("viewer surfaces projectile runtime consumer trace audit as diagnostics", () => {
  assert.ok(effectProjectileRuntimeConsumerTraceAudit.summary.rows >= 0);
  assert.equal(effectProjectileRuntimeConsumerTraceAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileRuntimeConsumerTraceAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileRuntimeConsumerTraceAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "currentBinaryEvidence"),
    ),
  );
  assert.match(packageJson, /effect_projectile_runtime_consumer_trace_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileConsumerTraceSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-runtime-consumer-trace-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileConsumerTraceHealthSummary/);
  assert.match(appJs, /currentStringXrefRows/);
  assert.match(appJs, /rowsWithCurrentVtableSemantics/);
  assert.match(appJs, /currentConsumerResolvedRows/);
  assert.match(appJs, /consumer trace/);
  assert.match(appJs, /弹道 consumer trace/);
});

test("viewer surfaces projectile current token window audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenWindowAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenWindowAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenWindowAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenWindowAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "runtimeFieldOffsets"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_window_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenWindowSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-window-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenWindowHealthSummary/);
  assert.match(appJs, /currentTokenRuntimeWindowRows/);
  assert.match(appJs, /runtimeFieldReferenceRows/);
  assert.match(appJs, /current token window/);
  assert.match(appJs, /弹道 current token window/);
});

test("viewer surfaces projectile current branch target audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentBranchTargetAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentBranchTargetAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentBranchTargetAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentBranchTargetAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "branchTargetHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_branch_target_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentBranchTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-branch-target-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentBranchTargetHealthSummary/);
  assert.match(appJs, /sharedBranchTargetRows/);
  assert.match(appJs, /fieldWriteReferenceRows/);
  assert.match(appJs, /branch target/);
  assert.match(appJs, /弹道 branch target/);
});

test("viewer surfaces projectile current field writer callsite audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentFieldWriterCallsiteAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentFieldWriterCallsiteAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentFieldWriterCallsiteAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentFieldWriterCallsiteAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "combinedRuntimeFieldOffsets"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_field_writer_callsite_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentFieldWriterCallsiteSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-field-writer-callsite-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentFieldWriterCallsiteHealthSummary/);
  assert.match(appJs, /combinedRuntimeFieldRows/);
  assert.match(appJs, /uniqueCombinedRuntimeFields/);
  assert.match(appJs, /field writer callsite/);
  assert.match(appJs, /弹道 field writer callsite/);
});

test("viewer surfaces projectile current field reader candidate audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentFieldReaderCandidateAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentFieldReaderCandidateAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentFieldReaderCandidateAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentFieldReaderCandidateAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "specificReadOffsets"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_field_reader_candidate_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentFieldReaderCandidateSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-field-reader-candidate-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentFieldReaderCandidateHealthSummary/);
  assert.match(appJs, /specificReaderCandidateRows/);
  assert.match(appJs, /genericOnlyReaderCandidateRows/);
  assert.match(appJs, /field reader candidate/);
  assert.match(appJs, /弹道 field reader candidate/);
});

test("viewer surfaces projectile current field reader callsite context audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentFieldReaderCallsiteContextAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentFieldReaderCallsiteContextAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentFieldReaderCallsiteContextAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentFieldReaderCallsiteContextAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "followingVtableOffsets"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_field_reader_callsite_context_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentFieldReaderCallsiteContextSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-field-reader-callsite-context-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentFieldReaderCallsiteContextHealthSummary/);
  assert.match(appJs, /specificReaderCallsiteRows/);
  assert.match(appJs, /followingVtableCallRows/);
  assert.match(appJs, /field reader callsite/);
  assert.match(appJs, /弹道 field reader callsite/);
});

test("viewer surfaces projectile current field reader downstream route audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentFieldReaderDownstreamRouteAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentFieldReaderDownstreamRouteAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentFieldReaderDownstreamRouteAudit.summary.currentConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentFieldReaderDownstreamRouteAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "resolvedVtableFunctionClass"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_field_reader_downstream_route_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentFieldReaderDownstreamRouteSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-field-reader-downstream-route-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentFieldReaderDownstreamRouteHealthSummary/);
  assert.match(appJs, /accessorOnlySlotRows/);
  assert.match(appJs, /vtableSlotResolvedRows/);
  assert.match(appJs, /field reader downstream/);
  assert.match(appJs, /弹道 field reader downstream/);
});

test("viewer surfaces projectile current field reader list dispatch audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentFieldReaderListDispatchAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentFieldReaderListDispatchAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentFieldReaderListDispatchAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentFieldReaderListDispatchAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "childVtableSlotOffsetHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_field_reader_list_dispatch_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentFieldReaderListDispatchSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-field-reader-list-dispatch-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentFieldReaderListDispatchHealthSummary/);
  assert.match(appJs, /listDispatchFunctionRows/);
  assert.match(appJs, /uniqueChildVtableSlots/);
  assert.match(appJs, /resolvedChildSlotRows/);
  assert.match(appJs, /retOnlyChildSlotRows/);
  assert.match(appJs, /missingChildSlotRelocationRows/);
  assert.match(appJs, /field reader list dispatch/);
  assert.match(appJs, /弹道 field reader list dispatch/);
});

test("viewer surfaces projectile current token child object chain audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildObjectChainAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildObjectChainAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildObjectChainAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildObjectChainAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "objectAppendTargetHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_object_chain_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildObjectChainSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-object-chain-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildObjectChainHealthSummary/);
  assert.match(appJs, /objectAppendRows/);
  assert.match(appJs, /primaryVtableResolvedRows/);
  assert.match(appJs, /nonNoopFollowingSlotRows/);
  assert.match(appJs, /callbackInstallerFollowingSlotRows/);
  assert.match(appJs, /payloadModeSetterFollowingSlotRows/);
  assert.match(appJs, /payloadSetterFollowingSlotRows/);
  assert.match(appJs, /followingArgument1StringRows/);
  assert.match(appJs, /semanticConsumerResolvedRows/);
  assert.match(appJs, /token child object/);
  assert.match(appJs, /弹道 token child object/);
});

test("viewer surfaces projectile current token child callback body audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildCallbackBodyAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildCallbackBodyAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildCallbackBodyAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildCallbackBodyAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "installedCallbackFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_callback_body_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildCallbackBodySummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-callback-body-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildCallbackBodyHealthSummary/);
  assert.match(appJs, /sourceCallbackInstallerRows/);
  assert.match(appJs, /uniqueCallbackBodies/);
  assert.match(appJs, /scalarReturnCallbackRows/);
  assert.match(appJs, /argumentOutputWriterRows/);
  assert.match(appJs, /ownerPointerReadRows/);
  assert.match(appJs, /helperCallRows/);
  assert.match(appJs, /token callback body/);
  assert.match(appJs, /弹道 token callback body/);
});

test("viewer surfaces projectile current token child class method audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildClassMethodAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildClassMethodAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildClassMethodAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildClassMethodAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "methodFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_class_method_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildClassMethodSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-class-method-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildClassMethodHealthSummary/);
  assert.match(appJs, /uniquePrimaryVtables/);
  assert.match(appJs, /sourceMatchedMethodRows/);
  assert.match(appJs, /callbackInstallerMethodRows/);
  assert.match(appJs, /payloadModeSetterMethodRows/);
  assert.match(appJs, /runtimeEvaluatorCandidateRows/);
  assert.match(appJs, /runtimeStateCandidateRows/);
  assert.match(appJs, /callbackSlotReaderRows/);
  assert.match(appJs, /token class method/);
  assert.match(appJs, /弹道 token class method/);
});

test("viewer surfaces projectile current token child evaluator payload audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildEvaluatorPayloadAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildEvaluatorPayloadAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildEvaluatorPayloadAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildEvaluatorPayloadAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "payloadConsumerFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_evaluator_payload_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-evaluator-payload-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildEvaluatorPayloadHealthSummary/);
  assert.match(appJs, /entryPayloadConsumerRows/);
  assert.match(appJs, /nestedPayloadConsumerRows/);
  assert.match(appJs, /callbackSlotReaderRows/);
  assert.match(appJs, /parentInstalledCallbackSlotReaderRows/);
  assert.match(appJs, /evaluator payload/);
  assert.match(appJs, /弹道 evaluator payload/);
});

test("viewer surfaces projectile current token child payload setter audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildPayloadSetterAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildPayloadSetterAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildPayloadSetterAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildPayloadSetterAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "helperFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_payload_setter_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildPayloadSetterSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-payload-setter-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildPayloadSetterHealthSummary/);
  assert.match(appJs, /sourcePayloadConsumerRows/);
  assert.match(appJs, /setterHelperRows/);
  assert.match(appJs, /commitHelperRows/);
  assert.match(appJs, /commonApplyMatchedHelperRows/);
  assert.match(appJs, /objectFieldWriteRows/);
  assert.match(appJs, /payload setter/);
  assert.match(appJs, /弹道 payload setter/);
});

test("viewer surfaces projectile current token child payload setter downstream audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildPayloadSetterDownstreamAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildPayloadSetterDownstreamAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildPayloadSetterDownstreamAudit.summary.semanticConsumerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildPayloadSetterDownstreamAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "downstreamFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_payload_setter_downstream_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-payload-setter-downstream-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildPayloadSetterDownstreamHealthSummary/);
  assert.match(appJs, /uniqueDownstreamTargets/);
  assert.match(appJs, /baseTransformApplyRows/);
  assert.match(appJs, /managerRuntimeRows/);
  assert.match(appJs, /backingTransformWriteRows/);
  assert.match(appJs, /payload setter downstream/);
  assert.match(appJs, /弹道 payload setter downstream/);
});

test("viewer surfaces projectile current token child manager record bridge audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildManagerRecordBridgeAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildManagerRecordBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildManagerRecordBridgeAudit.summary.renderPromotionAllowed, false);
  assert.ok(
    (effectProjectileCurrentTokenChildManagerRecordBridgeAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "bridgeStage"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_manager_record_bridge_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-manager-record-bridge-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildManagerRecordBridgeHealthSummary/);
  assert.match(appJs, /projectileManagerRuntimeBridgeRecovered/);
  assert.match(appJs, /targetParameterWriterRecovered/);
  assert.match(appJs, /managerDrawBridgeRecovered/);
  assert.match(appJs, /pfxEmitterManagerEntryOwnerRecovered/);
  assert.match(appJs, /manager record bridge/);
  assert.match(appJs, /弹道 manager record bridge/);
});

test("viewer surfaces projectile current token child effect owner candidate audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildEffectOwnerCandidateAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildEffectOwnerCandidateAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildEffectOwnerCandidateAudit.summary.pfxEmitterOwnerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildEffectOwnerCandidateAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "candidateFunctionHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_effect_owner_candidate_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-effect-owner-candidate-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildEffectOwnerCandidateHealthSummary/);
  assert.match(appJs, /effectOwnerCandidateRows/);
  assert.match(appJs, /optionalExternalHandleRows/);
  assert.match(appJs, /pfxEmitterOwnerResolvedRows/);
  assert.match(appJs, /effect owner candidate/);
  assert.match(appJs, /弹道 effect owner candidate/);
});

test("viewer surfaces projectile current token child StaticPfx owner audit as diagnostics", () => {
  assert.ok(effectProjectileCurrentTokenChildStaticPfxOwnerAudit.summary.rows >= 0);
  assert.equal(effectProjectileCurrentTokenChildStaticPfxOwnerAudit.summary.renderPromotionAllowedRows, 0);
  assert.equal(effectProjectileCurrentTokenChildStaticPfxOwnerAudit.summary.managerEntryOwnerResolvedRows, 0);
  assert.ok(
    (effectProjectileCurrentTokenChildStaticPfxOwnerAudit.items || []).every(
      (item) => item.renderPromotionAllowed === false && Object.hasOwn(item, "levelVisualsFieldOffsetHex"),
    ),
  );
  assert.match(packageJson, /effect_projectile_current_token_child_static_pfx_owner_audit\.js/);
  assert.match(appJs, /runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerSummary/);
  assert.match(appJs, /fetchJson\("\.\/effect-projectile-current-token-child-static-pfx-owner-audit\.json"\)/);
  assert.match(appJs, /function runtimeEffectProjectileCurrentTokenChildStaticPfxOwnerHealthSummary/);
  assert.match(appJs, /staticPfxListCallsiteRows/);
  assert.match(appJs, /x19StaticPfxResolvedRows/);
  assert.match(appJs, /managerEntryOwnerResolvedRows/);
  assert.match(appJs, /StaticPfx owner/);
  assert.match(appJs, /弹道 StaticPfx owner/);
});

test("viewer surfaces current native dynamic source-table semantics as diagnostics", () => {
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.opcodeRows, 73);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.sourceTableTypeIndexChainRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.selectorChildClassMatchRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.selectorCallerObjectCreationRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.upstreamConfigFieldChainRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.batchDispatcherToSelectorRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.levelConfigFieldNamesRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.levelVisualsApplyProcessorFieldRoutingRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.postChildPayloadSetupRecovered, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.sourceTableProducerAgrees, true);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.resourceFieldNamesRecovered, false);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeDynamicSourceTableSemanticsAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeDynamicSourceTableSemanticsSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-dynamic-source-table-semantics-audit\.json"\)/);
  assert.match(appJs, /function currentNativeDynamicSourceTableSemanticsHealthSummary/);
  assert.match(appJs, /动态 source table 语义/);
  assert.match(appJs, /upstream config 字段链已闭合/);
  assert.match(appJs, /batch 到 selector 已闭合/);
  assert.match(appJs, /Level 字段名已恢复/);
  assert.match(appJs, /LevelVisuals 字段路由已闭合/);
  assert.match(appJs, /资源字段名未恢复/);
  assert.match(appJs, /active 资源语义未恢复/);
});

test("viewer surfaces current native StaticMesh selector entry shape as diagnostics", () => {
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.opcodeRows, 20);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.levelVisualsStaticMeshListsRecovered, true);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.currentStaticMeshFieldOffsetsRecovered, true);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.currentStaticMeshFieldTypesRecovered, true);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.selectorHelperStaticMeshFieldUsageRecovered, true);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.staticMeshSelectorEntryShapeRecovered, true);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.resourceFieldNamesRecovered, false);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeStaticMeshSelectorEntryAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeStaticMeshSelectorEntrySummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-static-mesh-selector-entry-audit\.json"\)/);
  assert.match(appJs, /function currentNativeStaticMeshSelectorEntryHealthSummary/);
  assert.match(appJs, /StaticMesh selector entry/);
  assert.match(appJs, /StaticMesh 列表已闭合/);
  assert.match(appJs, /selector 字段使用已闭合/);
  assert.match(appJs, /资源字段名未恢复/);
  assert.match(appJs, /active 资源语义未恢复/);
});

test("viewer surfaces current native ShaderParams schema as diagnostics", () => {
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.opcodeRows, 17);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.currentShaderParamTypeRegistrationsRecovered, true);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.currentShaderParamsTypeRegistrationsRecovered, true);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.currentShaderParamsFieldLayoutRecovered, true);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.staticMeshShaderParamsBridgeRecovered, true);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.crossBuildShaderParamsLayoutAgrees, true);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.shaderParamsFieldNamesRecovered, false);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeShaderParamsSchemaAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShaderParamsSchemaSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderparams-schema-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderParamsSchemaHealthSummary/);
  assert.match(appJs, /ShaderParams schema/);
  assert.match(appJs, /StaticMesh \+0x68 已接上/);
  assert.match(appJs, /跨版本布局一致/);
  assert.match(appJs, /字段名未恢复/);
});

test("viewer surfaces StaticMesh ShaderParams capture targets as diagnostics", () => {
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.hookTargetRows, 7);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.opcodeRows, 13);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.levelVisualsApplySnapshotHookReady, true);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.staticMeshSelectorFieldHooksReady, true);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.shaderParamsBoundedPrefixCaptureReady, true);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.runtimeCaptureRequiredRows, 1);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.shaderParamsValueSemanticsRecovered, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureTargets.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeStaticMeshShaderParamsCaptureTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-static-mesh-shaderparams-capture-targets\.json"\)/);
  assert.match(appJs, /function currentNativeStaticMeshShaderParamsCaptureTargetHealthSummary/);
  assert.match(appJs, /StaticMesh ShaderParams 捕获目标/);
  assert.match(appJs, /ShaderParams 前缀捕获已准备/);
  assert.match(appJs, /ShaderParams 值语义未恢复/);
});

test("viewer surfaces StaticMesh ShaderParams capture summary as diagnostics", () => {
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.captureImported, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.captureStatus, "capture-missing");
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.targetHooksReady, true);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.readyForManualShaderParamsReview, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeStaticMeshShaderParamsCaptureSummary.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeStaticMeshShaderParamsCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-static-mesh-shaderparams-capture-summary\.json"\)/);
  assert.match(appJs, /function currentNativeStaticMeshShaderParamsCaptureHealthSummary/);
  assert.match(appJs, /StaticMesh ShaderParams 捕获结果/);
  assert.match(appJs, /capture \$\{summary\.captureStatus/);
  assert.match(appJs, /目标 hook 已准备/);
  assert.match(appJs, /人工复核未就绪/);
});

test("viewer surfaces current native ShaderParams value semantics as diagnostics", () => {
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.opcodeRows, 47);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.componentJumpTableRows, 4);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.componentJumpTableMismatchRows, 0);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.shaderParamsIterationRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.shaderParamIdExtractionRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.shaderParamComponentCountMappingRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.sourceKeyHashRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.sourceTableEntryPackingRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.sourceTableFinalizerRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.shaderParamIdValueSemanticsRecovered, true);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.activeResourceSemanticsRecovered, false);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.concreteSamplerOwnershipRecovered, false);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.shaderTextureFormulaRecovered, false);
  assert.equal(currentNativeShaderParamsValueSemanticsAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeShaderParamsValueSemanticsSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-shaderparams-value-semantics-audit\.json"\)/);
  assert.match(appJs, /function currentNativeShaderParamsValueSemanticsHealthSummary/);
  assert.match(appJs, /ShaderParams 值语义/);
  assert.match(appJs, /source table 打包已闭合/);
  assert.match(appJs, /sampler 归属未恢复/);
});

test("viewer surfaces current layout B object +0xac candidate disqualification audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.candidateRows, 2);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.disqualifiedCandidateRows, 2);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.type210LevelVisualsLensFlareDisqualifiedRows, 1);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.hudMinimapCurrentOwnerDisqualifiedRows, 1);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.directCallerRows, 6);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.exactLayoutBParticleFlagProducerRows, 0);
  assert.equal(currentNativeLayoutBObjectAcCandidateDisqualificationAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBObjectAcCandidateDisqualificationSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-object-ac-candidate-disqualification-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBObjectAcCandidateDisqualificationHealthSummary/);
  assert.match(appJs, /layout B \+0xac 候选排除/);
  assert.match(appJs, /0x210 lens flare/);
  assert.match(appJs, /HUD_Minimap/);
});

test("viewer surfaces current layout B object +0xac store coverage audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.storeRows, 410);
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.objectAcOverlapRows, 4);
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.stackOverlapRows, 3);
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.constructorSeedOverlapRows, 1);
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.hiddenNonConstructorObjectAcProducerRows, 0);
  assert.equal(currentNativeLayoutBObjectAcStoreCoverageAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBObjectAcStoreCoverageSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-object-ac-store-coverage-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBObjectAcStoreCoverageHealthSummary/);
  assert.match(appJs, /layout B \+0xac store coverage/);
  assert.match(appJs, /隐藏 producer/);
});

test("viewer surfaces current layout B object +0xac runtime capture targets as diagnostics", () => {
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureTargets.summary.hookTargetRows, 10);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureTargets.summary.opcodeRows, 9);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureTargets.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureTargets.summary.captureScriptGenerated, true);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureTargets.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBObjectAcRuntimeCaptureTargetSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-object-ac-runtime-capture-targets\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBObjectAcRuntimeCaptureTargetHealthSummary/);
  assert.match(appJs, /layout B \+0xac runtime 捕获目标/);
  assert.match(appJs, /Frida 脚本已生成/);
});

test("viewer surfaces current layout B object +0xac runtime capture summary as diagnostics", () => {
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureSummary.summary.captureImported, false);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureSummary.summary.captureStatus, "capture-missing");
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureSummary.summary.targetRows, 10);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureSummary.summary.runtimeParticleFlagObservedEvents, 0);
  assert.equal(currentNativeLayoutBObjectAcRuntimeCaptureSummary.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBObjectAcRuntimeCaptureSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-object-ac-runtime-capture-summary\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBObjectAcRuntimeCaptureHealthSummary/);
  assert.match(appJs, /layout B \+0xac runtime 捕获/);
  assert.match(appJs, /ready-for-runtime-value-review/);
  assert.match(appJs, /未导入捕获/);
  assert.match(appJs, /live 0x200/);
});

test("viewer surfaces current layout B payload record layout audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.opcodeRows, 14);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.targetPlus40Forwarded, true);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.targetPayloadCopyRecovered, true);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.payloadAndFlagSeparated, true);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.payloadRecordStrideBytes, 48);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.payloadCopiedBytes, 24);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.backingPayloadFlagOffset, 24);
  assert.equal(currentNativeLayoutBPayloadRecordLayoutAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBPayloadRecordLayoutSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-payload-record-layout-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBPayloadRecordLayoutHealthSummary/);
  assert.match(appJs, /layout B payload record/);
  assert.match(appJs, /stride 0x30/);
  assert.match(appJs, /payload 24 bytes/);
  assert.match(appJs, /flags \+0x18/);
});

test("viewer surfaces current layout A owner global usage audit as diagnostics", () => {
  assert.equal(currentNativeLayoutAOwnerGlobalUsageAudit.summary.textReferenceRows, 12);
  assert.equal(currentNativeLayoutAOwnerGlobalUsageAudit.summary.unmodeledReadRows, 2);
  assert.equal(currentNativeLayoutAOwnerGlobalUsageAudit.summary.createHelperReadRows, 9);
  assert.equal(currentNativeLayoutAOwnerGlobalUsageAudit.summary.ownerListScanReadRows, 3);
  assert.equal(currentNativeLayoutAOwnerGlobalUsageAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutAOwnerGlobalUsageSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-a-owner-global-usage-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutAOwnerGlobalUsageHealthSummary/);
  assert.match(appJs, /layout A owner 全局/);
  assert.match(appJs, /旧表漏点已补/);
  assert.match(appJs, /允许接管/);
});

test("viewer surfaces current layout A refresh state source audit as diagnostics", () => {
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.opcodeRows, 30);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.inputByteRefreshCallerRows, 3);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.inputByteRefreshPlus2fcCallerRows, 2);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.statePredicateGroups, 3);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.trackedKeepCalls, 3);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.trackedClearCalls, 3);
  assert.equal(currentNativeLayoutARefreshStateSourceAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutARefreshStateSourceSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-a-refresh-state-source-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutARefreshStateSourceHealthSummary/);
  assert.match(appJs, /layout A 状态来源/);
  assert.match(appJs, /\+0x2fc 状态来源/);
  assert.match(appJs, /keep\/clear 谓词/);
});

test("viewer surfaces current layout A state writer audit as diagnostics", () => {
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.offset2fcAccessRows, 24);
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.offset2fcStoreRows, 4);
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.offset2fcKnownWriterRows, 4);
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.offset2fcDispatchCallerRows, 1);
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.objectByteUpdateCallerRows, 4);
  assert.equal(currentNativeLayoutAStateWriterAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutAStateWriterSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-a-state-writer-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutAStateWriterHealthSummary/);
  assert.match(appJs, /layout A 状态写入/);
  assert.match(appJs, /\+0x2fc/);
  assert.match(appJs, /已定位 writer/);
});

test("viewer surfaces current layout A state registration audit as diagnostics", () => {
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.moduleRegistrationCallerRows, 1);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.slotInstallerBranchRows, 3);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.callbackReferenceRows, 4);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.stateMachineCallbackReferenceRows, 1);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.offset2fcDispatchCallRows, 1);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.typeGlobalReadRows, 26);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.typeGlobalCreateResolveReadRows, 1);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.typedQueryEvidenceRows, 20);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.typedQueryStateByteWriteRows, 6);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.stateFamilyDirectRenderBoundaryCallRows, 0);
  assert.equal(currentNativeLayoutAStateRegistrationAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutAStateRegistrationSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-a-state-registration-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutAStateRegistrationHealthSummary/);
  assert.match(appJs, /layout A 状态注册/);
  assert.match(appJs, /slot installer/);
  assert.match(appJs, /回调指针/);
  assert.match(appJs, /type global 读取/);
  assert.match(appJs, /typed query/);
  assert.match(appJs, /渲染边界直连/);
});

test("viewer surfaces current layout A add-record flag source audit as diagnostics", () => {
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.opcodeRows, 20);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.callbackToSetupRecovered, true);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.registeredSetupDefaultFlagsOneRecovered, true);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.layoutAAddRecordForwardFlagsRecovered, true);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.registeredFlagParticleMaskRows, 0);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.externalUnknownD7FA14CallerRows, 0);
  assert.equal(currentNativeLayoutAAddRecordFlagSourceAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutAAddRecordFlagSourceSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-a-add-record-flag-source-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutAAddRecordFlagSourceHealthSummary/);
  assert.match(appJs, /layout A add-record flags/);
  assert.match(appJs, /默认 flags=1/);
  assert.match(appJs, /0x200 来源/);
  assert.match(appJs, /registeredFlagParticleMaskRows/);
});

test("viewer surfaces current 0x210 particle-mask candidate owner audit as diagnostics", () => {
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.pointerMismatchRows, 0);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.type210RegistrationRecovered, true);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.packedCoverageCanSetParticleMaskRows, 2);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.type210FamilyDirectRenderBoundaryCallRows, 0);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.tiedToLayoutBRows, 0);
  assert.equal(currentNativeParticleMaskCandidateOwnerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeParticleMaskCandidateOwnerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-particle-mask-candidate-owner-audit\.json"\)/);
  assert.match(appJs, /function currentNativeParticleMaskCandidateOwnerHealthSummary/);
  assert.match(appJs, /0x210 候选 owner/);
  assert.match(appJs, /owner\+0x58 列表已定位/);
  assert.match(appJs, /packed coverage 可含 0x200/);
  assert.match(appJs, /直达粒子 draw\/manager/);
  assert.match(appJs, /layout B 精确 producer/);
});

test("viewer surfaces current type 0x210 primitive builder audit as diagnostics", () => {
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.opcodeRows, 20);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.renderCallbackToPrimitiveBuilderRecovered, true);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.requiredPrimitiveSlots, 18);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.slotStrideBytes, 24);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.pointerAdvanceRows, 18);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.colorByteStoreRows, 72);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.fullColorRecordRows, 18);
  assert.equal(currentNativeType210PrimitiveBuilderAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeType210PrimitiveBuilderSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-type210-primitive-builder-audit\.json"\)/);
  assert.match(appJs, /function currentNativeType210PrimitiveBuilderHealthSummary/);
  assert.match(appJs, /0x210 primitive builder/);
  assert.match(appJs, /requiredPrimitiveSlots/);
  assert.match(appJs, /slotStrideBytes/);
  assert.match(appJs, /颜色字节/);
  assert.match(appJs, /colorByteStoreRows/);
});

test("viewer surfaces current 0x210 LevelVisuals bridge audit as diagnostics", () => {
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.opcodeRows, 14);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.levelVisualsStaticLensFlareListRecovered, true);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.levelVisualsUsesType210GlobalRecovered, true);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.staticLensFlareResourceKeyResolveRows, 2);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.staticLensFlareHelperRows, 2);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.type210PrimitiveBuilderRecovered, true);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.heroPfxRenderPermissionRows, 0);
  assert.equal(currentNativeType210LevelVisualsBridgeAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeType210LevelVisualsBridgeSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-type210-levelvisuals-bridge-audit\.json"\)/);
  assert.match(appJs, /function currentNativeType210LevelVisualsBridgeHealthSummary/);
  assert.match(appJs, /0x210 LevelVisuals bridge/);
  assert.match(appJs, /静态 lens flare/);
  assert.match(appJs, /英雄 PFX 权限/);
});

test("viewer surfaces current layout B visibility gate audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBVisibilityGateAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBVisibilityGateAudit.summary.gateCanPassObjectAcRows, 1);
  assert.equal(currentNativeLayoutBVisibilityGateAudit.summary.gateCanZeroBackingFlagsRows, 1);
  assert.match(appJs, /currentNativeLayoutBVisibilityGateSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-visibility-gate-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBVisibilityGateHealthSummary/);
  assert.match(appJs, /layout B 显隐 gate/);
  assert.match(appJs, /可转发 \+0xac/);
  assert.match(appJs, /可置零 backing flags/);
});

test("viewer surfaces current layout B target status audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBTargetStatusAudit.summary.opcodeRows, 18);
  assert.equal(currentNativeLayoutBTargetStatusAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBTargetStatusAudit.summary.targetStatusSeparatedFromObjectAc, true);
  assert.equal(currentNativeLayoutBTargetStatusAudit.summary.targetStatusBit200Rows, 3);
  assert.equal(currentNativeLayoutBTargetStatusAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBTargetStatusSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-target-status-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBTargetStatusHealthSummary/);
  assert.match(appJs, /layout B target 状态/);
  assert.match(appJs, /target\+0x64 和 object\+0xac 已分离/);
  assert.match(appJs, /接管关闭/);
});

test("viewer surfaces current layout B refresh mode split audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBRefreshModeSplitAudit.summary.opcodeRows, 10);
  assert.equal(currentNativeLayoutBRefreshModeSplitAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBRefreshModeSplitAudit.summary.payloadAndFlagRefreshModesSeparated, true);
  assert.equal(currentNativeLayoutBRefreshModeSplitAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBRefreshModeSplitSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-refresh-mode-split-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBRefreshModeSplitHealthSummary/);
  assert.match(appJs, /layout B refresh 模式/);
  assert.match(appJs, /final 只刷 payload/);
  assert.match(appJs, /显隐只刷 flags/);
});

test("viewer surfaces current layout B query apply path audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.wrapperRows, 4);
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.opcodeRows, 33);
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.visibilityGateRows, 4);
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.directObjectAcProducerRows, 0);
  assert.equal(currentNativeLayoutBQueryApplyPathAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBQueryApplyPathSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-query-apply-path-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBQueryApplyPathHealthSummary/);
  assert.match(appJs, /layout B query\/apply/);
  assert.match(appJs, /显隐来源 \$\{summary\.visibilityGateRows\} 条/);
  assert.match(appJs, /\+0xac producer 0 条/);
});

test("viewer surfaces current layout B shared struct apply audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.blockRows, 4);
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.opcodeRows, 60);
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.callerFieldLoadRows, 24);
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.directObjectAcProducerRows, 0);
  assert.equal(currentNativeLayoutBSharedStructApplyAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBSharedStructApplySummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-shared-struct-apply-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBSharedStructApplyHealthSummary/);
  assert.match(appJs, /layout B shared apply/);
  assert.match(appJs, /caller 字段 \$\{summary\.callerFieldLoadRows\} 条/);
  assert.match(appJs, /\+0xac producer 0 条/);
});

test("viewer surfaces current layout B caller struct initializer audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBCallerStructInitializerAudit.summary.blockRows, 3);
  assert.equal(currentNativeLayoutBCallerStructInitializerAudit.summary.opcodeRows, 27);
  assert.equal(currentNativeLayoutBCallerStructInitializerAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBCallerStructInitializerAudit.summary.visibilityControlDefaultRows, 0);
  assert.equal(currentNativeLayoutBCallerStructInitializerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBCallerStructInitializerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-caller-struct-initializer-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBCallerStructInitializerHealthSummary/);
  assert.match(appJs, /layout B caller init/);
  assert.match(appJs, /显隐默认 0 条/);
});

test("viewer surfaces current layout B component table entry audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.tableRows, 4);
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.tableEntryMismatchRows, 0);
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.fullCallerStructTableEntryRows, 3);
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.compactStackHashTableEntryRows, 1);
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.highCallerFieldWriterRows, 0);
  assert.equal(currentNativeLayoutBComponentTableEntryAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBComponentTableEntrySummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-component-table-entry-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBComponentTableEntryHealthSummary/);
  assert.match(appJs, /layout B component table/);
  assert.match(appJs, /完整 caller struct 入口/);
  assert.match(appJs, /compact\/hash 入口/);
});

test("viewer surfaces current layout B component table owner audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.opcodeRows, 23);
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.componentTableRootRecovered, true);
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.layoutBObjectTableSeparated, true);
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.highCallerFieldWriterRows, 0);
  assert.equal(currentNativeLayoutBComponentTableOwnerAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBComponentTableOwnerSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-component-table-owner-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBComponentTableOwnerHealthSummary/);
  assert.match(appJs, /layout B component owner/);
  assert.match(appJs, /组件表 root 已恢复/);
  assert.match(appJs, /layout B 对象表已分离/);
});

test("viewer surfaces current layout B component slot registration audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.opcodeRows, 22);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.ownerRegistrationCallerRows, 1);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.typeIndexPublishRows, 1);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.slotInstallerRows, 15);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.dispatchTableRows, 48);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.fullCallerStructDispatchRows, 3);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.compactStackHashDispatchRows, 1);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.callerStructRuntimeProducerRows, 0);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.directObjectAcProducerRows, 0);
  assert.equal(currentNativeLayoutBComponentSlotRegistrationAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBComponentSlotRegistrationSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-component-slot-registration-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBComponentSlotRegistrationHealthSummary/);
  assert.match(appJs, /layout B component slot 注册/);
  assert.match(appJs, /dispatch 表/);
  assert.match(appJs, /caller struct runtime producer 0 条/);
});

test("viewer surfaces current layout B direct caller struct builder audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.builderRows, 4);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.opcodeRows, 35);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.fullCallerStructWriterRecoveredRows, 4);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.dynamicCallerFieldHelperRows, 2);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.indirectTableEntryCoverageRows, 3);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.indirectTableEntryMismatchRows, 0);
  assert.equal(currentNativeLayoutBDirectCallerStructBuilderAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBDirectCallerStructBuilderSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-direct-caller-struct-builder-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBDirectCallerStructBuilderHealthSummary/);
  assert.match(appJs, /layout B caller writer/);
  assert.match(appJs, /真实 caller writer/);
  assert.match(appJs, /动态字段 helper/);
  assert.match(appJs, /表驱动入口/);
});

test("viewer surfaces current layout B resource caller dynamic fields audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.helperBlockRows, 2);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.helperOpcodeRows, 42);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.commonApplyConsumerRows, 11);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.opcodeRows, 53);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.dynamicCallerFieldRows, 34);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.callbackDispatchRows, 6);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.commonApplyConsumerRecovered, true);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.dynamicFieldsReachCommonApply, true);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.directObjectAcProducerRows, 0);
  assert.equal(currentNativeLayoutBResourceCallerDynamicFieldsAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBResourceCallerDynamicFieldsSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-resource-caller-dynamic-fields-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBResourceCallerDynamicFieldsHealthSummary/);
  assert.match(appJs, /layout B resource caller 动态字段/);
  assert.match(appJs, /动态 caller 字段/);
  assert.match(appJs, /common apply 消费已闭合/);
});

test("viewer surfaces current layout B common apply setter fields audit as diagnostics", () => {
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.setterBlockRows, 14);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.setterOpcodeRows, 53);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.opcodeMismatchRows, 0);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.objectStoreRows, 45);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.objectA8LowWordStoreRows, 1);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.objectAcStoreRows, 0);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.objectAcParticleMaskProducerRows, 0);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.commonApplySetterFieldsRecovered, true);
  assert.equal(currentNativeLayoutBCommonApplySetterFieldsAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBCommonApplySetterFieldsSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-common-apply-setter-fields-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBCommonApplySetterFieldsHealthSummary/);
  assert.match(appJs, /layout B common apply setter/);
  assert.match(appJs, /\+0xa8 低位写入/);
  assert.match(appJs, /\+0xac 写入 0 条/);
  assert.match(appJs, /0x200 producer 0 条/);
});

test("viewer surfaces current layout B object +0xac producer gate as diagnostics", () => {
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.sourceRows, 14);
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.negativeClosedRows, 13);
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.staticExactProducerRows, 0);
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.runtimeObservedProducerRows, 0);
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.runtimeCaptureStatus, "capture-missing");
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.remainingProofRoute, "runtime-capture-required");
  assert.equal(currentNativeLayoutBObjectAcProducerGateAudit.summary.renderPromotionAllowedRows, 0);
  assert.match(appJs, /currentNativeLayoutBObjectAcProducerGateSummary/);
  assert.match(appJs, /fetchJson\("\.\/current-native-layout-b-object-ac-producer-gate-audit\.json"\)/);
  assert.match(appJs, /function currentNativeLayoutBObjectAcProducerGateHealthSummary/);
  assert.match(appJs, /layout B \+0xac producer gate/);
  assert.match(appJs, /静态 gate 已排除/);
  assert.match(appJs, /下一步需要 runtime 捕获/);
});

test("viewer exposes configured skin variants that share a recovered base GLB", () => {
  assert.match(appJs, /runtimeSkinVariantAliasSummary/);
  assert.match(appJs, /fetchJson\("\.\/runtime-skin-variant-aliases\.json"\)/);
  assert.match(appJs, /function applySkinVariantAliasesToManifest\(items, aliases\)/);
  assert.match(appJs, /aliasSkinId/);
  assert.match(appJs, /item\.aliasSkinId \? `\$\{item\.rel\}#\$\{item\.aliasSkinId\}`/);
  assert.match(appJs, /共享模型变体/);
});

test("viewer can export the current frozen pose and record a preview video", () => {
  assert.match(appJs, /GLTFExporter/);
  assert.match(appJs, /OBJExporter/);
  assert.match(appJs, /STLExporter/);
  assert.match(appJs, /function frozenPoseClone/);
  assert.match(appJs, /function exportFrozenPoseGlb/);
  assert.match(appJs, /function exportFrozenPoseObj/);
  assert.match(appJs, /function exportFrozenPoseStl/);
  assert.match(appJs, /async function exportFrozenPoseThreeMf/);
  assert.match(appJs, /function buildThreeMfArchive/);
  assert.match(appJs, /function buildThreeMfModelXml/);
  assert.match(appJs, /function materialDisplayColor/);
  assert.match(appJs, /function textureImageToPngBytes/);
  assert.match(appJs, /function transformedThreeMfUv/);
  assert.match(appJs, /function recordTurntableVideo/);
  assert.match(appJs, /captureStream/);
  assert.match(appJs, /MediaRecorder/);
  assert.match(appJs, /downloadBlob/);
  assert.match(indexHtml, /id="exportDialog"/);
  assert.match(indexHtml, /id="recordDialog"/);
  assert.match(indexHtml, /镜头运动/);
  assert.match(indexHtml, /id="recordFormatSelect"[\s\S]*MP4 \/ H\.264/);
  assert.match(indexHtml, /id="recordQualitySelect"[\s\S]*高清/);
  assert.match(indexHtml, /id="recordProgress"/);
  assert.match(indexHtml, /id="recordProgressBar"/);
  assert.match(indexHtml, /id="recordProgressText"/);
  assert.match(indexHtml, /id="recordProgressPercent"/);
  assert.match(indexHtml, /id="exportPoseStlButton"[\s\S]*STL/);
  assert.match(indexHtml, /id="exportPoseThreeMfButton"[\s\S]*3MF/);
  assert.match(indexHtml, /固定当前视角/);
  assert.match(appJs, /openExportDialogButton\.addEventListener\("click", \(\) => openActionDialog\(exportDialog\)\);/);
  assert.match(appJs, /openRecordDialogButton\.addEventListener\("click", \(\) => openActionDialog\(recordDialog\)\);/);
  assert.match(appJs, /video\/mp4;codecs="avc1\.42E01E"/);
  assert.doesNotMatch(appJs, /video\/mp4;codecs=h264/);
  assert.match(appJs, /const RECORDING_QUALITY_PRESETS =/);
  assert.match(appJs, /videoBitsPerSecond:\s*16000000/);
  assert.match(appJs, /function timestampFileNamePart\(date = new Date\(\)\)/);
  assert.match(appJs, /展示视频-\$\{timestampFileNamePart\(\)\}\.\$\{extension\}/);
  assert.match(appJs, /function setRecordProgress\(progress,\s*text\)/);
  assert.match(appJs, /setRecordProgress\(Math\.min\(1,\s*elapsed \/ durationMs\),\s*"录制中"\);/);
  assert.match(appJs, /recordDialog\.classList\.toggle\("is-recording",\s*videoRecording\);/);
  assert.match(appJs, /renderer\.domElement\.captureStream\(quality\.frameRate\)/);
  assert.match(appJs, /new MediaRecorder\(stream,\s*recorderOptions\)/);
  assert.match(appJs, /new Blob\(\[stlData\], \{ type: "model\/stl" \}\)/);
  assert.match(appJs, /new Blob\(\[threeMfData\], \{ type: "model\/3mf" \}\)/);
  assert.match(appJs, /\[Content_Types\]\.xml/);
  assert.match(appJs, /_rels\/\.rels/);
  assert.match(appJs, /3D\/3dmodel\.model/);
  assert.match(appJs, /3D\/Textures\/texture_\$\{context\.textures\.length\}\.png/);
  assert.match(appJs, /application\/vnd\.ms-package\.3dmanufacturing-3dmodel\+xml/);
  assert.match(appJs, /<Default Extension="png" ContentType="image\/png"\/>/);
  assert.match(appJs, /<texture2d id="\$\{texture\.textureId\}" path="\$\{xmlEscape\(texture\.path\)\}" contenttype="image\/png"/);
  assert.match(appJs, /<texture2dgroup id="\$\{group\.id\}" texid="\$\{group\.textureId\}">/);
  assert.match(appJs, /<tex2coord u="\$\{threeMfNumber\(uv\[0\]\)\}" v="\$\{threeMfNumber\(uv\[1\]\)\}"\/>/);
  assert.match(appJs, /<basematerials id="1">/);
  assert.match(appJs, /displaycolor="\$\{material\.color\}"/);
  assert.match(appJs, /pid="\$\{triangle\.propertyId\}" p1="\$\{triangle\.p1\}" p2="\$\{triangle\.p2\}" p3="\$\{triangle\.p3\}"/);
  assert.match(appJs, /buildThreeMfArchive\(modelXml,\s*textures\)/);
  assert.match(appJs, /return `#\$\{color\.getHexString\(\)\.toUpperCase\(\)\}\$\{alpha\}`;/);
});

test("viewer can be packaged as an Electron desktop app", () => {
  assert.match(packageJson, /"main":\s*"electron\/main\.cjs"/);
  assert.match(packageJson, /"electron:start"/);
  assert.match(packageJson, /"electron:dist"/);
  assert.match(packageJson, /"electron-builder"/);
  assert.match(packageJson, /"three":\s*"0\.160\.0"/);
  assert.match(packageJson, /extracted\/all_assets_glb_textured_pbr\/\*\*\/\*/);
  assert.match(packageJson, /extracted\/effect_textures_preview\/\*\*\/\*/);
  assert.match(packageJson, /extracted\/effect_textures_by_hash\/\*\*\/\*/);
  assert.match(electronMain, /BrowserWindow/);
  assert.match(electronMain, /loadFile\(viewerHtmlPath\(\)\)/);
  assert.match(electronMain, /protocol\.registerSchemesAsPrivileged/);
  assert.match(electronMain, /vainglory-three/);
  assert.match(electronMain, /protocol\.handle\("vainglory-three"/);
  assert.match(electronMain, /registerLocalThreeRedirects/);
  assert.match(electronMain, /redirectURL:\s*localThreeRedirectUrl\(details\.url\)/);
  assert.match(electronMain, /cdn\.jsdelivr\.net\/npm\/three@0\.160\.0/);
  assert.match(electronMain, /虚荣英雄模型查看器/);
});

test("package exposes material source/program capture rebuild entry points", () => {
  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.scripts["material:capture:targets"],
    "node extracted/tools/current_native_material_source_program_capture_targets.js",
  );
  assert.equal(
    parsedPackage.scripts["material:capture:summary"],
    "node extracted/tools/current_native_material_source_program_capture_summary.js && node extracted/tools/current_native_static_mesh_shaderparams_capture_targets.js && node extracted/tools/current_native_static_mesh_shaderparams_capture_summary.js && node extracted/tools/current_native_dynamic_source_table_semantics_audit.js && node extracted/tools/current_native_material_sampler_ownership_gate_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["material:capture:refresh"],
    "npm run material:capture:targets --silent && npm run material:capture:summary --silent",
  );
});

test("package exposes effect runtime capture rebuild entry points", () => {
  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.scripts["effect:capture:targets"],
    "node extracted/tools/pfx_native_callback_runtime_targets.js && node extracted/tools/effect_native_channel_capture_targets.js && node extracted/tools/current_native_layout_b_object_ac_runtime_capture_targets.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:capture:summary"],
    "node extracted/tools/pfx_native_callback_capture_summary.js && node extracted/tools/effect_native_channel_capture_summary.js && node extracted/tools/current_native_layout_b_object_ac_runtime_capture_summary.js && node extracted/tools/current_native_layout_b_object_ac_producer_gate_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:capture:refresh"],
    "npm run effect:capture:targets --silent && npm run effect:capture:summary --silent",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:gap"],
    "node extracted/tools/effect_projectile_runtime_gap_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:runtime"],
    "node extracted/tools/effect_projectile_definition_manifest.js && node extracted/tools/native_projectile_spawn_manifest.js && node extracted/tools/effect_projectile_binding_coverage_report.js && node extracted/tools/effect_projectile_runtime_gap_audit.js && node extracted/tools/effect_projectile_create_bridge_audit.js && node extracted/tools/effect_projectile_target_dispatch_audit.js && node extracted/tools/effect_projectile_vtable_slot_audit.js && node extracted/tools/effect_projectile_vtable_function_audit.js && node extracted/tools/effect_projectile_vtable_output_layout_audit.js && node extracted/tools/effect_projectile_vtable_callsite_payload_audit.js && node extracted/tools/effect_projectile_vtable_semantic_join_audit.js && node extracted/tools/effect_projectile_runtime_consumer_trace_audit.js && node extracted/tools/effect_projectile_current_token_window_audit.js && node extracted/tools/effect_projectile_current_branch_target_audit.js && node extracted/tools/effect_projectile_current_field_writer_callsite_audit.js && node extracted/tools/effect_projectile_current_field_reader_candidate_audit.js && node extracted/tools/effect_projectile_current_field_reader_callsite_context_audit.js && node extracted/tools/effect_projectile_current_field_reader_downstream_route_audit.js && node extracted/tools/effect_projectile_current_field_reader_list_dispatch_audit.js && node extracted/tools/effect_projectile_current_token_child_object_chain_audit.js && node extracted/tools/effect_projectile_current_token_child_callback_body_audit.js && node extracted/tools/effect_projectile_current_token_child_class_method_audit.js && node extracted/tools/effect_projectile_current_token_child_evaluator_payload_audit.js && node extracted/tools/effect_projectile_current_token_child_payload_setter_audit.js && node extracted/tools/effect_projectile_current_token_child_payload_setter_downstream_audit.js && node extracted/tools/effect_projectile_current_token_child_manager_record_bridge_audit.js && node extracted/tools/effect_projectile_current_token_child_effect_owner_candidate_audit.js && node extracted/tools/effect_projectile_current_token_child_static_pfx_owner_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:runtime-consumer-trace"],
    "node extracted/tools/effect_projectile_runtime_consumer_trace_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-window"],
    "node extracted/tools/effect_projectile_current_token_window_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-branch-target"],
    "node extracted/tools/effect_projectile_current_branch_target_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-field-writer-callsite"],
    "node extracted/tools/effect_projectile_current_field_writer_callsite_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-field-reader-candidate"],
    "node extracted/tools/effect_projectile_current_field_reader_candidate_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-field-reader-callsite-context"],
    "node extracted/tools/effect_projectile_current_field_reader_callsite_context_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-field-reader-downstream-route"],
    "node extracted/tools/effect_projectile_current_field_reader_downstream_route_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-field-reader-list-dispatch"],
    "node extracted/tools/effect_projectile_current_field_reader_list_dispatch_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-object-chain"],
    "node extracted/tools/effect_projectile_current_token_child_object_chain_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-callback-body"],
    "node extracted/tools/effect_projectile_current_token_child_callback_body_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-class-method"],
    "node extracted/tools/effect_projectile_current_token_child_class_method_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-evaluator-payload"],
    "node extracted/tools/effect_projectile_current_token_child_evaluator_payload_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-payload-setter"],
    "node extracted/tools/effect_projectile_current_token_child_payload_setter_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-payload-setter-downstream"],
    "node extracted/tools/effect_projectile_current_token_child_payload_setter_downstream_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-manager-record-bridge"],
    "node extracted/tools/effect_projectile_current_token_child_manager_record_bridge_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-effect-owner-candidate"],
    "node extracted/tools/effect_projectile_current_token_child_effect_owner_candidate_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["effect:projectile:current-token-child-static-pfx-owner"],
    "node extracted/tools/effect_projectile_current_token_child_static_pfx_owner_audit.js",
  );
});

test("package exposes aggregate runtime capture gate rebuild entry points", () => {
  const parsedPackage = JSON.parse(packageJson);
  assert.equal(
    parsedPackage.scripts["runtime:capture:gate"],
    "node extracted/tools/current_native_runtime_capture_gate_audit.js",
  );
  assert.equal(
    parsedPackage.scripts["runtime:capture:refresh"],
    "npm run native:runtime-selector:summary --silent && npm run material:capture:summary --silent && npm run effect:capture:summary --silent && npm run runtime:capture:gate --silent",
  );
});

test("viewer does not treat missing safe native translation data as all-bone translations", () => {
  assert.match(appJs, /let nativeTranslationMode = "auto";/);
  assert.match(appJs, /const MIN_NATIVE_TRANSLATION_COVERAGE = 0\.5;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_MAX_RATIO = 1\.35;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT = 6;/);
  assert.match(appJs, /function hasMeaningfulNativeTranslationSafeCoverage\(mapping\)/);
  assert.match(appJs, /function nativeTranslationModeForMapping\(mapping,\s*requestedMode = nativeTranslationMode\)/);
  assert.match(appJs, /function chooseAutoNativeTranslationMode\(bindMax,\s*allMax,\s*safeMax,\s*noneMax,\s*fallbackMode\)/);
  assert.match(appJs, /function sampleNativeTranslationMax\(mode\)/);
  assert.match(appJs, /function refreshAutoNativeTranslationMode\(\)/);
  assert.match(appJs, /for \(let sampleIndex = 0; sampleIndex < AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT; sampleIndex \+= 1\)/);
  assert.match(appJs, /const sampleTime = \(activeAnimationClip\.clipDuration \* sampleIndex\) \/ AUTO_NATIVE_TRANSLATION_SAMPLE_COUNT;/);
  assert.match(appJs, /const allMax = sampleNativeTranslationMax\("all"\);/);
  assert.match(appJs, /const safeMax = sampleNativeTranslationMax\("safe"\);/);
  assert.match(appJs, /const noneMax = sampleNativeTranslationMax\("none"\);/);
  assert.match(appJs, /return "none";/);
  assert.match(appJs, /function sampleNativeTranslationModeChanges\(\)/);
  assert.match(appJs, /return "dynamic";/);
  assert.match(appJs, /function dynamicNativeTranslationModeForTime\(timeSeconds\)/);
  assert.match(appJs, /function shouldApplyNativeTranslation\(mode,\s*translationSafeBones,\s*translationUnsafeBones,\s*boneIndex\)/);
  assert.match(appJs, /if \(translationUnsafeBones\?\.has\(boneIndex\) === true\) return false;/);
  assert.match(appJs, /if \(mode === "safe"\) return translationSafeBones\?\.has\(boneIndex\) === true;/);
  assert.match(appJs, /pose\.translation = null;/);
  assert.match(appJs, /applyNativePose\(timeSeconds = 0,\s*mode = nativeTranslationMode\)[\s\S]*applyAnimationPose\(0\);\n\s*const nativePose/);
});

test("viewer expands safe native translations through non-root parent bones for weapon chains", () => {
  assert.match(appJs, /const ROOT_DIRECT_WEAPON_TRANSLATION_OFFSET = 120;/);
  assert.match(appJs, /const ROOT_DIRECT_ATTACHMENT_DOMINANT_VERTICES = 800;/);
  assert.match(appJs, /function rootDirectDominantSkinJointCounts\(\)/);
  assert.match(appJs, /dominantJointIndex = jointIndex;/);
  assert.match(appJs, /counts\.set\(dominantJointIndex,\s*\(counts\.get\(dominantJointIndex\) \|\| 0\) \+ 1\);/);
  assert.match(appJs, /function isRootDirectAttachmentTranslationBone\(bone,\s*boneIndexByBone,\s*dominantJointCounts\)/);
  assert.match(appJs, /const childBoneCount = bone\.children\.filter\(\(child\) => boneIndexByBone\.has\(child\)\)\.length;/);
  assert.match(appJs, /if \(childBoneCount > 1\) return false;/);
  assert.match(appJs, /const rootOffset = Math\.hypot\(Number\(bone\.position\?\.x\) \|\| 0,\s*Number\(bone\.position\?\.z\) \|\| 0\);/);
  assert.match(appJs, /rootOffset >= ROOT_DIRECT_WEAPON_TRANSLATION_OFFSET/);
  assert.match(appJs, /\(dominantJointCounts\.get\(boneIndex\) \|\| 0\) >= ROOT_DIRECT_ATTACHMENT_DOMINANT_VERTICES/);
  assert.match(appJs, /function expandedTranslationSafeBones\(translationSafeBones\)/);
  assert.match(appJs, /boneIndexByBone\.set\(bone,\s*index\)/);
  assert.match(appJs, /const dominantJointCounts = rootDirectDominantSkinJointCounts\(\);/);
  assert.match(appJs, /if \(parentIndex == null \|\| parentIndex === 0\) break;/);
  assert.match(appJs, /if \(bone\.parent\.parent && boneIndexByBone\.get\(bone\.parent\.parent\) === 0\) break;/);
  assert.match(
    appJs,
    /if \(isRootDirectAttachmentTranslationBone\(bone,\s*boneIndexByBone,\s*dominantJointCounts\)\) expanded\.add\(boneIndex\);/,
  );
  assert.match(appJs, /translationSafeBones = expandedTranslationSafeBones\(translationSafeBones\);/);
});

test("viewer keeps safe weapon translations when they are close to the detached bounds", () => {
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO = 1\.45;/);
  assert.match(appJs, /const safeNearNone = Number\.isFinite\(safeMax\) && Number\.isFinite\(noneMax\) && safeMax <= noneMax \* AUTO_NATIVE_TRANSLATION_SAFE_OVER_NONE_RATIO;/);
  assert.match(appJs, /if \(safeNearNone && safeMax <= allMax\) return "safe";/);
});

test("viewer separates missing safe translations from per-frame attachment translation changes", () => {
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_SAFE_EQUALS_NONE_RATIO = 1\.03;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO = 1\.03;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_EDGE_MAX_RATIO = 1\.4;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO = 1\.03;/);
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_EDGE_MIN_RAW = 10;/);
  assert.match(appJs, /function skinnedMaxEdgeRatio\(\)/);
  assert.match(appJs, /function sampleNativeTranslationEdgeRatioAt\(timeSeconds,\s*mode\)/);
  assert.match(appJs, /function sampleNativeTranslationMaxEdgeRatio\(mode\)/);
  assert.match(
    appJs,
    /function chooseSampledNativeTranslationMode\(\s*bindMax,\s*allMax,\s*safeMax,\s*noneMax,\s*fallbackMode,\s*allEdgeRatio,\s*safeEdgeRatio,\s*noneEdgeRatio,\s*safeHasCoverage,\s*\)/,
  );
  assert.match(appJs, /const allEdgeIsSafe = nativeTranslationAllEdgeIsSafe\(allEdgeRatio,\s*safeEdgeRatio,\s*noneEdgeRatio\);/);
  assert.match(appJs, /const safeActsLikeNone = nativeTranslationSafeActsLikeNone\(safeMax,\s*noneMax\);/);
  assert.match(appJs, /if \(!safeHasCoverage && safeActsLikeNone\) return "all";/);
  assert.match(appJs, /safeMax <= allMax \* AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO/);
  assert.match(appJs, /if \(sampleNativeTranslationModeChanges\(\)\) return "dynamic";/);
  assert.match(appJs, /if \(allEdgeIsSafe\) return "all";/);
  assert.match(appJs, /if \(safeActsLikeNone && allMax <= bindMax \* AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO\) return "all";/);
  assert.match(appJs, /function nativeTranslationSafeActsLikeNone\(safeMax,\s*noneMax\)/);
  assert.match(appJs, /const allEdgeRatio = sampleNativeTranslationMaxEdgeRatio\("all"\);/);
  assert.match(appJs, /const safeEdgeRatio = sampleNativeTranslationMaxEdgeRatio\("safe"\);/);
  assert.match(appJs, /const noneEdgeRatio = sampleNativeTranslationMaxEdgeRatio\("none"\);/);
  assert.match(appJs, /dynamicNativeTranslationModeForTime\(timeSeconds\)[\s\S]*const allEdgeRatio = sampleNativeTranslationEdgeRatioAt\(timeSeconds,\s*"all"\);/);
  assert.match(
    appJs,
    /if \(!safeHasCoverage && safeActsLikeNone\) \{\s*mode = "all";\s*\} else if \(allEdgeIsSafe \|\| \(safeActsLikeNone && allMax <= bindMax \* AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO\)\) \{\s*mode = "all";\s*\} else if \(safeHasCoverage && Number\.isFinite\(allMax\) && Number\.isFinite\(safeMax\)\) \{\s*mode = allMax < safeMax \/ AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO \? "all" : "safe";/s,
  );
  assert.match(
    appJs,
    /chooseSampledNativeTranslationMode\(\s*bindMax,\s*allMax,\s*safeMax,\s*noneMax,\s*fallbackMode,\s*allEdgeRatio,\s*safeEdgeRatio,\s*noneEdgeRatio,\s*safeHasCoverage,\s*\)/,
  );
});

test("viewer prefers all native translations when sampled deformation is clean", () => {
  assert.match(appJs, /const AUTO_NATIVE_TRANSLATION_EDGE_WORSE_RATIO = 1\.03;/);
  assert.match(appJs, /function nativeTranslationAllEdgeIsSafe\(allEdgeRatio,\s*safeEdgeRatio,\s*noneEdgeRatio\)/);
  assert.match(
    appJs,
    /const allEdgeIsSafe = nativeTranslationAllEdgeIsSafe\(allEdgeRatio,\s*safeEdgeRatio,\s*noneEdgeRatio\);[\s\S]*if \(allEdgeIsSafe\) return "all";[\s\S]*safeMax <= allMax \* AUTO_NATIVE_TRANSLATION_SAFE_PREFERRED_RATIO/s,
  );
  assert.match(appJs, /const safeEdgeRatio = sampleNativeTranslationMaxEdgeRatio\("safe"\);/);
  assert.match(appJs, /const noneEdgeRatio = sampleNativeTranslationMaxEdgeRatio\("none"\);/);
  assert.match(
    appJs,
    /if \(allEdgeIsSafe \|\| \(safeActsLikeNone && allMax <= bindMax \* AUTO_NATIVE_TRANSLATION_RIGID_MAX_RATIO\)\) \{\s*mode = "all";\s*\} else if \(safeHasCoverage/s,
  );
});

test("viewer exposes skinned edge outliers for deformation debugging", () => {
  assert.match(appJs, /function summarizeCurrentSkinnedEdgeOutliers\(limit = 16,\s*minEdge = 35\)/);
  assert.match(appJs, /skinnedEdgeOutliers:\s*summarizeCurrentSkinnedEdgeOutliers/);
  assert.match(appJs, /function materialNameForTriangle\(mesh,\s*offset\)/);
  assert.match(appJs, /materialName:\s*materialNameForTriangle\(child,\s*offset\)/);
  assert.match(appJs, /maxEdge/);
  assert.match(appJs, /rawMaxEdge/);
  assert.match(appJs, /rawEdges/);
});

test("viewer exposes runtime effect preview bindings for evidence debugging", () => {
  assert.match(appJs, /runtimeEffectPreviewEntriesForDebug\(\) \{/);
  assert.match(appJs, /runtimeEffectPreviewEntries\(\)\.map\(\(entry\)/);
  assert.match(appJs, /runtimeEffectDefinitionProjectileEntriesForDebug\(\) \{/);
  assert.match(appJs, /runtimeEffectDefinitionProjectileEntriesForItem\(\)\.map\(\(entry\)/);
  assert.match(appJs, /projectileBindingStatus:\s*entry\.projectile\?\.bindingStatus \|\| ""/);
  assert.match(appJs, /runtimeEffectHookPreviewCandidatesForDebug\(\) \{/);
  assert.match(appJs, /runtimeEffectPreviewCandidateDiagnostics\(entryContext\)/);
  assert.match(appJs, /previewBlockReason:/);
  assert.match(appJs, /activeSkinId:\s*modelSkinId\(activeManifestItem\)/);
  assert.match(appJs, /resourceDiagnostics:\s*runtimeEffectHookResourceDiagnostics\(hook,\s*activeManifestItem\)/);
  assert.match(appJs, /runtimeEffectCff0EntriesForDebug\(\) \{/);
  assert.match(appJs, /runtimeEffectCff0EntriesForItem\(\)\.map\(\(entry\)/);
  assert.match(appJs, /runtimeEffectCff0RowsForDebug\(\) \{/);
  assert.match(appJs, /cff0EffectInstanceRowsForItem\(\)\.map\(\(row\)/);
  assert.match(appJs, /runtimeEffectPreviews\(\) \{/);
  assert.match(appJs, /activeRuntimeEffectObjects\.map\(\(preview\)/);
  assert.match(appJs, /pfxRuntimeEvidence:\s*runtimeEffectPfxRuntimeEvidence|const pfxRuntimeEvidence = runtimeEffectPfxRuntimeEvidence\(entry\);/);
  assert.match(appJs, /effectChannelFallback:\s*Boolean\(entry\?\.bindingTarget\?\.effectChannelFallback\)/);
  assert.match(appJs, /bindingKind:\s*entry\?\.bindingTarget\?\.kind \|\| ""/);
  assert.match(appJs, /role:\s*runtimeEffectPreviewRole\(entry\)/);
  assert.match(appJs, /startSeconds:\s*runtimeEffectEntryStartSeconds\(entry\)/);
  assert.match(appJs, /opacity:\s*runtimeEffectPreviewActivity\(entry,\s*runtimeEffectElapsed\)\.opacity/);
});

test("viewer uses final preview gates for CFF0 effect debug rows", () => {
  const source = appJs.match(/runtimeEffectCff0EntriesForDebug\(\) \{[\s\S]*?\n  \},\n  runtimeEffectCff0RowsForDebug/)?.[0] || "";
  assert.ok(source, "expected runtimeEffectCff0EntriesForDebug debug method");
  assert.match(source, /const diagnostics = runtimeEffectPreviewCandidateDiagnostics\(entryContext\);/);
  assert.match(source, /shouldPreview:\s*diagnostics\.shouldPreview/);
  assert.match(source, /animationBlockReason:\s*diagnostics\.animationBlockReason/);
  assert.match(source, /spatialBlockReason:\s*diagnostics\.spatialBlockReason/);
  assert.match(source, /projectileRuntimeCoverage:\s*diagnostics\.projectileRuntimeCoverage/);
  assert.match(source, /previewBlockReason:\s*diagnostics\.previewBlockReason/);
  assert.doesNotMatch(source, /shouldPreview:\s*runtimeEffectShouldPreviewForAnimation\(entryContext\)/);
});

test("viewer separates skin-mismatched PFX resources from genuinely missing PFX resources", () => {
  const hooks = Array.isArray(effectHookRuntimeManifest) ? effectHookRuntimeManifest : effectHookRuntimeManifest.items || [];
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const pfxPaths = new Set(pfxItems.map((item) => item.relativePath));
  const defaultRingo = skinnedManifest.items.find((item) => item.modelLabel === "Ringo_DefaultSkin");
  assert.ok(defaultRingo, "expected default Ringo model fixture");
  const skinScopedHook = hooks.find(
    (hook) =>
      hook.effectToken === "Effect_Ringo_Ability02_ArmAura" &&
      ["cff0-skin-effect-alias", "effect-pfx-hook-token"].includes(hook.resourceEvidenceSource) &&
      ["strong", "confirmed"].includes(hook.aliasEvidenceStrength) &&
      hook.resourceVariants?.some((variant) => variant.modelLabel === "Ringo_Skin_Shogun_T3") &&
      hook.resourcePaths?.some((resourcePath) => pfxPaths.has(resourcePath)),
  );
  assert.ok(skinScopedHook, "expected a skin-scoped Ringo effect hook with an existing PFX resource");

  assert.match(appJs, /function runtimeEffectHookResourceStatus\(hook,\s*item = activeManifestItem\)/);
  assert.match(appJs, /hasSkinMatchedPfx/);
  assert.match(appJs, /hasSkinMismatchedPfx/);
  assert.match(appJs, /function runtimeEffectMissingResourcePreviewBlockReason\(hook,\s*bindingTarget,\s*item = activeManifestItem\)/);
  assert.match(appJs, /return "skin-mismatch";/);
  assert.match(
    appJs,
    /const previewBlockReason = runtimeEffectMissingResourcePreviewBlockReason\(hook,\s*bindingTarget,\s*activeManifestItem\);/,
  );
  assert.match(appJs, /runtimeEffectHookResourceStatus\(hook,\s*activeManifestItem\)/);
});

test("viewer resolves skin alias PFX resources from the hero PFX index when direct hook resources are base effects", () => {
  const hooks = Array.isArray(effectHookRuntimeManifest) ? effectHookRuntimeManifest : effectHookRuntimeManifest.items || [];
  const pfxItems = Array.isArray(effectPfxManifest) ? effectPfxManifest : effectPfxManifest.items || [];
  const pfxPaths = new Set(pfxItems.map((item) => item.relativePath));
  const aliases = JSON.parse(fs.readFileSync(path.join(root, "viewer", "runtime-skin-effect-aliases.json"), "utf8")).items || [];
  const kineticImpactHook = hooks.find(
    (hook) =>
      hook.effectToken === "Effect_Kinetic_A_Impact" &&
      hook.resourcePaths?.includes("Effects/Hero048/Hero048_A_Hit/Hero048_A_Hit.pfx"),
  );
  const kineticImpactAlias = aliases.find(
    (alias) =>
      alias.modelLabel === "Kinetic_Skin_Valkyrie" &&
      alias.sourceEffectToken === "Effect_Kinetic_A_Impact" &&
      alias.skinEffectToken === "Effect_Kinetic_S2_A_Impact",
  );
  assert.ok(kineticImpactHook, "expected Kinetic impact hook fixture");
  assert.ok(kineticImpactAlias, "expected Kinetic Valkyrie skin alias fixture");
  assert.ok(pfxPaths.has("Effects/Hero048/S2/Hero048_S2_A_Hit/Hero048_S2_A_Hit.pfx"));
  assert.ok(pfxPaths.has("Effects/Hero048/S2/Hero048_S2_AA_Hit/Hero048_S2_AA_Hit.pfx"));
  assert.ok(pfxPaths.has("Effects/Ringo/S1/Ringo__S1__Ability02Aura.assetbundle/Ringo__S1__Ability02Aura.pfx"));

  assert.match(appJs, /function runtimeEffectSkinAliasSemanticParts\(alias\)/);
  assert.match(appJs, /function runtimeEffectPfxPathMatchesSkinAliasResource\(relativePath,\s*alias\)/);
  assert.match(appJs, /function runtimeEffectSkinAliasIndexedPfxItems\(effectToken,\s*item = activeManifestItem,\s*hook = null\)/);
  assert.match(appJs, /runtimeEffectPfxByHero\.get\(heroKey\)/);
  assert.match(appJs, /runtimeEffectPfxPathMatchesSkinAliasResource\(pfxItem\.relativePath,\s*alias\)/);
  assert.match(
    appJs,
    /const skinAliasIndexedCandidates = runtimeEffectSkinAliasIndexedPfxItems\(hook\?\.effectToken \|\| hook\?\.token,\s*item,\s*hook\);/,
  );
  assert.match(appJs, /const candidates = skinAliasIndexedCandidates\.length/);
});

test("viewer rebuilds runtime effect preview objects when the selected animation changes", () => {
  assert.match(
    appJs,
    /animationSelect\.addEventListener\("change",\s*\(\) => \{[\s\S]*syncRuntimeEffectPreviews\(\);[\s\S]*syncTimelineControls\(manualAnimationTime\);/s,
  );
});

test("viewer exposes skin joint matrix deltas for bind-pose debugging", () => {
  assert.match(appJs, /function summarizeCurrentSkinJointDeltas\(jointIndices = \[\]\)/);
  assert.match(appJs, /skinJointDeltas:\s*summarizeCurrentSkinJointDeltas/);
  assert.match(appJs, /maxIdentityDelta/);
  assert.match(appJs, /boneWorldTranslation/);
  assert.match(appJs, /boneInverseTranslation/);
});

test("viewer exposes filtered native pose helpers for deformation debugging", () => {
  assert.match(appJs, /applyNativePoseSkippingBones\(timeSeconds = 0,\s*skippedBoneIndices = \[\],\s*mode = nativeTranslationMode\)/);
  assert.match(appJs, /nativePoseBones\(timeSeconds = 0,\s*boneIndices = \[\],\s*mode = nativeTranslationMode\)/);
  assert.match(appJs, /for \(const boneIndex of skipped\) nativePose\.delete\(boneIndex\);/);
});

test("viewer keeps mobile controls scrollable", () => {
  assert.match(stylesCss, /@media \(max-width: 900px\)/);
  assert.match(stylesCss, /\.shell\s*{[\s\S]*overflow:\s*auto;/);
  assert.match(stylesCss, /\.list\s*{[\s\S]*max-height:\s*44vh;/);
  assert.match(stylesCss, /\.settings-sidebar\s*{[\s\S]*overflow:\s*visible;/);
});
